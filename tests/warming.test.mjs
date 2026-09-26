import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ScopedCacheWarming, warmingLabel, validateWarmingObservation } from '../src/warming.js';
import { DEFAULTS, validateConfig, validateConfigLayer, updateConfigLayer, loadConfig } from '../src/config.js';
import { fakeWarming } from './helpers/warming.mjs';

const context = sdk => ({ sessionManager: { getSessionId: () => 'session' }, ...(sdk ? { acquireCacheWarming: sdk.acquireCacheWarming } : {}) });

test('one native idle lease per active binding; release is idempotent and composes with another owner', () => {
  const sdk = fakeWarming(), scope = new ScopedCacheWarming();
  const otherRelease = sdk.acquireCacheWarming('idle');
  scope.reconcile(context(sdk), false, 'binding');
  assert.equal(sdk.leases.size, 1);
  for (let i = 0; i < 100; i++) scope.reconcile(context(sdk), true, 'binding');
  assert.equal(sdk.stats.acquisitions, 2, 'new per-event context objects cannot accumulate leases');
  assert.deepEqual(scope.snapshot(), { supported: true, requested: true, held: true, error: null });
  assert.match(warmingLabel(scope.snapshot()), /not proof of refresh/);
  scope.release(); scope.release();
  assert.equal(sdk.leases.size, 1, 'Pair cannot remove another native owner');
  assert.equal(sdk.stats.releases, 1);
  scope.reconcile(context(sdk), true, 'next-binding');
  scope.reconcile(context(sdk), true, 'replacement-binding');
  assert.equal(sdk.leases.size, 2, 'old binding released before its replacement');
  scope.reconcile(context(sdk), false, 'replacement-binding');
  assert.equal(sdk.leases.size, 1);
  otherRelease();
  assert.equal(sdk.leases.size, 0);
});

test('old SDK and acquisition errors stay honest with no paid/global fallback or retry loop', () => {
  const scope = new ScopedCacheWarming(), old = context();
  scope.reconcile(old, true, 'binding');
  assert.deepEqual(scope.snapshot(), { supported: false, requested: true, held: false, error: null });
  assert.match(warmingLabel(scope.snapshot()), /unsupported SDK/);
  const sdk = fakeWarming(); sdk.stats.fail = true;
  for (let i = 0; i < 10; i++) scope.reconcile(context(sdk), true, 'binding');
  assert.equal(sdk.stats.acquisitions, 1);
  assert.equal(scope.snapshot().held, false);
  assert.match(scope.snapshot().error, /unavailable/);
  scope.reconcile(context(sdk), false, 'binding');
  sdk.stats.fail = false;
  scope.reconcile(context(sdk), true, 'binding');
  assert.equal(scope.snapshot().held, true);
  scope.reconcile(old, true, 'binding');
  assert.equal(sdk.leases.size, 0, 'loss of SDK capability releases the old owned lease');
});

test('explicit Pair warming policy defaults off and does not accept native/global policy values', () => {
  assert.equal(DEFAULTS.cacheWarming, 'off');
  assert.equal(validateConfig({ version: 2 }).cacheWarming, 'off');
  assert.equal(validateConfig({ cacheWarming: 'active' }).cacheWarming, 'active');
  for (const cacheWarming of ['idle', 'streaming', true, null, {}, 'ACTIVE']) assert.throws(() => validateConfig({ cacheWarming }));
  const before = validateConfig({ enabled: true });
  assert.deepEqual(updateConfigLayer({ version: 2 }, before, { ...before, cacheWarming: 'active' }), { version: 2, cacheWarming: 'active' });
  assert.deepEqual(validateConfigLayer({ version: 2 }), { version: 2 });
  assert.throws(() => validateWarmingObservation({ supported: false, requested: true, held: true, error: null }));
});

test('trusted project opt-in layers over default/global off without changing native settings bytes', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-warming-config-'));
  const cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  const native = path.join(home, 'settings.json'), bytes = '{"cacheWarming":"off","marker":"untouched"}\n';
  await fs.writeFile(native, bytes);
  await fs.writeFile(path.join(home, 'fabric-pair.json'), JSON.stringify({ version: 2, cacheWarming: 'off' }));
  await fs.writeFile(path.join(cwd, '.pi', 'fabric-pair.json'), JSON.stringify({ version: 2, cacheWarming: 'active' }));
  try {
    const env = { PI_CODING_AGENT_DIR: home };
    const trusted = await loadConfig(cwd, true, env);
    assert.equal(trusted.config.cacheWarming, 'active');
    assert.equal(trusted.provenance.cacheWarming, 'project');
    assert.equal((await loadConfig(cwd, false, env)).config.cacheWarming, 'off');
    assert.equal(await fs.readFile(native, 'utf8'), bytes);
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

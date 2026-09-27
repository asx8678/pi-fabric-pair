import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { meshRootFor, nativeSettings, nativeProfileBlockers, preflightNativeProfile, checkReadiness } from '../src/native.js';

const valid = { executor: { shellHangMs: 0 }, agents: { maxDepth: 0 }, prewalk: { enabled: false } };
async function fixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-profile-'));
  const cwd = path.join(base, 'worker'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  try { await run({ cwd, home, env: { PI_CODING_AGENT_DIR: home } }); }
  finally { await fs.rm(base, { recursive: true, force: true }); }
}

test('fresh profile lists all exact required fields and actionable paths at once', () => fixture(async ({ cwd, home, env }) => {
  const result = await preflightNativeProfile(cwd, { prewalkDisabled: true }, null, env);
  assert.equal(result.blocked, true);
  for (const value of ['executor.shellHangMs = 0', 'agents.maxDepth = 0', 'prewalk.enabled = false', path.join(home, 'fabric.json'), path.join(cwd, '.pi', 'fabric.json')]) assert.ok(result.message.includes(value), value);
  assert.match(result.message, /trusted worker/); assert.match(result.message, /authentication are still checked/);
  assert.deepEqual(await fs.readdir(home), []);
}));

test('project precedence and worker trust are explicit; Main trust is not borrowed', () => fixture(async ({ cwd, home, env }) => {
  await fs.writeFile(path.join(home, 'fabric.json'), JSON.stringify(valid));
  await fs.writeFile(path.join(cwd, '.pi', 'fabric.json'), JSON.stringify({ prewalk: { enabled: true }, executor: { shellHangMs: 25 } }));
  assert.equal((await preflightNativeProfile(cwd, { prewalkDisabled: true }, true, env)).blocked, true);
  assert.equal((await preflightNativeProfile(cwd, { prewalkDisabled: true }, false, env)).blocked, false);
  const uncertain = await preflightNativeProfile(cwd, { prewalkDisabled: true }, null, env);
  assert.equal(uncertain.blocked, false, 'unknown worker trust defers conditional failures to worker readiness');
  assert.match(uncertain.message, /observed 25/);
  assert.equal(nativeProfileBlockers(await nativeSettings(cwd, true, env), { prewalkDisabled: true }).length, 2);
  const separate = path.join(cwd, 'separate'); await fs.mkdir(separate);
  assert.equal((await preflightNativeProfile(separate, { prewalkDisabled: true }, true, env)).blocked, false, 'no Main project override leaks into another workspace');
}));

test('worker readiness shares aggregate checks and is still authoritative', () => {
  const model = { provider: 'test', id: 'model' }, cwd = '/isolated/worker', sessionFile = '/isolated/session.jsonl';
  const probe = { protocol: 1, cwd, sessionId: 'session', sessionFile, meshRoot: '/isolated/mesh', model, thinkingLevel: 'low', capabilities: { fabric: true, fovea: true, pairReport: true }, native: { fabricShellHangMs: null, fabricAgentMaxDepth: 5, prewalkDisabled: false } };
  const state = { sessionId: 'session', sessionFile, model, thinkingLevel: 'low', autoCompactionEnabled: true };
  assert.throws(() => checkReadiness(probe, state, { requirements: { fabric: true, fovea: true, prewalkDisabled: true, autoCompaction: true } }, { ...model, model: model.id, effort: 'low', readOnly: false }, cwd, '/isolated/mesh'), error => {
    for (const key of ['shellHangMs = 0', 'maxDepth = 0', 'prewalk.enabled = false']) assert.ok(error.message.includes(key));
    return true;
  });
});

test('meshRootFor derives a stable absolute private root per worker directory', () => {
  const first = meshRootFor('/pair/state/workers/first'), second = meshRootFor('/pair/state/workers/second');
  assert.equal(first, '/pair/state/workers/first/fabric/mesh');
  assert.equal(second, '/pair/state/workers/second/fabric/mesh');
  assert.notEqual(first, second, 'separate worker directories get separate private namespaces');
  assert.equal(meshRootFor('/pair/state/workers/first'), first, 'the root is stable across repeated derivations');
  assert.throws(() => meshRootFor('relative/workers/first'), /absolute/);
});

test('readiness requires the exact Pair-owned private mesh root observation', () => {
  const model = { provider: 'test', id: 'model' }, cwd = '/isolated/worker', sessionFile = '/isolated/session.jsonl', root = '/pair/state/workers/worker/fabric/mesh';
  const state = { sessionId: 'session', sessionFile, model, thinkingLevel: 'low', autoCompactionEnabled: true };
  const config = { requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true } };
  const worker = { ...model, model: model.id, effort: 'low', readOnly: false };
  const probe = { protocol: 1, cwd, sessionId: 'session', sessionFile, meshRoot: root, model, thinkingLevel: 'low', capabilities: { fabric: false, fovea: false, pairReport: true }, native: { fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: false } };
  checkReadiness(probe, state, config, worker, cwd, root);
  assert.throws(() => checkReadiness({ ...probe, meshRoot: '/elsewhere/fabric/mesh' }, state, config, worker, cwd, root), /private mesh root/);
  assert.throws(() => checkReadiness({ ...probe, meshRoot: null }, state, config, worker, cwd, root), /private mesh root/);
  assert.throws(() => checkReadiness({ ...probe, meshRoot: 'relative/fabric/mesh' }, state, config, worker, cwd, root), /private mesh root/);
  const { meshRoot: absent, ...withoutObservation } = probe;
  assert.throws(() => checkReadiness(withoutObservation, state, config, worker, cwd, root), /private mesh root/);
});

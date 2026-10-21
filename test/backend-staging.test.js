// runtime.backend is inside configHash(), so switching it must stage a restart through the same path as any other
// runtime change: the live worker keeps its backend and the new one applies at the next start. Offline, no spawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PairController } from '../src/controller.js';
import { loadConfig } from '../src/config.js';

/** A controller with a retained low worker whose runtime is a stand-in, so nothing is spawned. */
async function fixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-backend-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false,
    runtime: { backend: 'low', lowCommand: 'low' },
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'opendesign', model: 'deepseek-v4.1-flash', effort: 'high', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const controller = new PairController({ config: loaded.config, cwd: repo, ownerSession: 'backend-owner', sourcePaths: [], storageDir: path.join(base, 'state'),
    scanIntervalMs: 600000, callbacks: { notifyUser: () => {}, promptUser: async () => ({ cancelled: true }) }, spawnLow: /** @type {any} */ (() => { throw Error('no spawn in this fixture'); }) });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const record = { id, cwd: repo, repoRoot: repo, status: 'ready', sessionId: 'sess-backend', sessionFile: path.join(controller.dir, 'sessions', 'b.jsonl'),
    bound: { ...spec }, task: null, history: [], usage: null, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  /** @type {any} */
  const runtime = { ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'n', pid: 4242, dir: controller.workerDir(id), sessionId: record.sessionId,
    ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], async abortCurrent() {}, async abortAndStop() { this.closed = true; },
    async ping() { return true; }, waitIdle: async () => {}, revoke() {}, snapshot: () => ({ pid: 4242, ready: true, idle: true, closed: false, fault: null, tool: null }) };
  controller.handles.set(id, runtime);
  const { digest } = await import('../src/util.js');
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
  return { base, repo, controller, record, runtime };
}

test('switching the backend stages a restart instead of changing the live worker', async () => {
  const f = await fixture();
  try {
    const { controller } = f;
    const before = controller.configHash();
    assert.equal(controller.pendingConfig, null, 'nothing is staged to begin with');
    const next = structuredClone(controller.config);
    next.runtime.backend = 'pi';
    // The hash is taken over the proposed config, since configHash() defaults to the live one.
    assert.notEqual(controller.configHash(next), before, 'the backend is part of configHash');
    controller.updateConfig(next);
    assert.ok(controller.pendingConfig, 'and a live worker stages it rather than switching under the running process');
    // The live config keeps the backend the process was started with, so the running worker is not misdescribed.
    assert.equal(controller.config.runtime.backend, 'low');
    assert.equal(controller.pendingConfig.runtime.backend, 'pi');
  } finally { f.runtime.closed = true; await f.controller.close().catch(() => {}); await fs.rm(f.base, { recursive: true, force: true }); }
});

test('with no worker retained, a backend change applies at once', async () => {
  const f = await fixture();
  try {
    const { controller } = f;
    controller.handles.clear();
    controller.state.workers.worker.status = 'stopped';
    const next = structuredClone(controller.config);
    next.runtime.backend = 'pi';
    controller.updateConfig(next);
    assert.equal(controller.pendingConfig, null, 'nothing to restart, so nothing is staged');
    assert.equal(controller.config.runtime.backend, 'pi');
  } finally { await f.controller.close().catch(() => {}); await fs.rm(f.base, { recursive: true, force: true }); }
});

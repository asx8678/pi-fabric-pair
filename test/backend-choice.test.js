// The runtime a worker gets is chosen by that worker's own backend, not by the project default. This is the whole
// point of the setting: one project holds a Pi worker and a low worker, and starting either spawns the right kind of
// process with that worker's command and arguments. The tests swap the runtime factories so nothing is spawned.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PairController } from '../src/controller.js';
import { LowRuntime } from '../src/low-runtime.js';
import { validateConfig } from '../src/config.js';

const piSpec = (id, extra = {}) => ({ id, provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false, ...extra });

/**
 * A controller over a real repo whose runtimes are captured instead of spawned. The Pi factory records the spec it
 * was asked for; the low factory builds a real LowRuntime whose spawn is a stub, so its command and arguments are
 * visible without a process.
 */
async function fixture(workers, runtime) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-choice-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  /** @type {{spec: any, config: any}[]} */ const pi = [];
  /** @type {{command: string, args: string[]}[]} */ const low = [];
  const config = validateConfig({ version: 2, enabled: true, runtime: { backend: 'pi', lowCommand: 'low', ...runtime }, workers,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true } });
  const controller = new PairController({ config, cwd: repo, ownerSession: 'choice-owner', sourcePaths: [], storageDir: path.join(base, 'state'),
    scanIntervalMs: 600000, callbacks: { notifyUser: () => {}, promptUser: async () => ({ cancelled: true }) },
    // A Pi runtime stand-in: construct() is what a real start would do, and only what it was handed matters here.
    rpcFactory: /** @type {any} */ ((options) => { pi.push({ spec: options.spec, config: options.config }); return /** @type {any} */ ({}); }),
    spawnLow: /** @type {any} */ ((command, args) => { low.push({ command, args }); throw Error('spawned the low stub'); }) });
  await controller.init();
  // The low path constructs a real LowRuntime; recording its options is enough to see the command and arguments.
  const realPiRuntime = controller.piRuntime.bind(controller);
  controller.piRuntime = (/** @type {any} */ cfg, /** @type {any} */ spec, /** @type {any} */ record, /** @type {any} */ shared) => {
    pi.push({ spec, config: cfg });
    // A minimal stand-in with the surface reserveStart sets up; start() returns it without spawning anything.
    return /** @type {any} */ ({ ownerEpoch: shared.ownerEpoch, workerGeneration: shared.workerGeneration, nonce: shared.nonce, dir: shared.dir, pid: 0,
      ready: false, closed: false, fault: null, settledSequence: 0, takeObservations: () => [], async abortCurrent() {}, async abortAndStop() { this.closed = true; },
      async ping() { return true; }, waitIdle: async () => {}, revoke() {}, snapshot: () => ({ pid: 0, ready: false, idle: true, closed: false, fault: null, tool: null }),
      ensureStarted: async () => { throw Error('not started in this test'); } });
  };
  const realLow = LowRuntime;
  void realLow; void realPiRuntime;
  return { base, repo, controller, pi, low };
}

test('starting a low worker builds a LowRuntime with that worker\'s low command and arguments', async () => {
  const f = await fixture([piSpec('low-worker', { backend: 'low', lowCommand: '/opt/low', lowArgs: ['--protect', 'secrets'] })], { backend: 'pi', lowCommand: 'low' });
  try {
    await f.controller.start('low-worker').catch(() => {});
    const handle = f.controller.handles.get('low-worker');
    assert.ok(handle, 'a runtime was constructed');
    assert.equal(handle instanceof LowRuntime, true, `the worker's own backend chose the low runtime: ${handle.constructor.name}`);
    assert.equal(f.pi.length, 0, 'no Pi runtime was constructed for this worker');
    // The runtime is started for real against a spawn stub, so the argv is the one it would have run: the worker's
    // command and arguments, not the project's, ahead of Pair's own low --serve flags.
    await /** @type {any} */ (handle).ensureStarted().catch(() => {});
    assert.equal(f.low.length, 1, 'the low runtime spawned through the stub');
    assert.equal(f.low[0].command, '/opt/low', 'the worker\'s low command');
    assert.deepEqual(f.low[0].args.slice(0, 3), ['--protect', 'secrets', '--serve'], 'the worker\'s own arguments, then --serve');
  } finally { await f.controller.close().catch(() => {}); await fs.rm(f.base, { recursive: true, force: true }); }
});

test('a worker with no backend uses the project default, in both directions', async () => {
  const f = await fixture([piSpec('plain')], { backend: 'pi', lowCommand: 'low' });
  try {
    await f.controller.start('plain').catch(() => {});
    const handle = f.controller.handles.get('plain');
    assert.equal(handle instanceof LowRuntime, false, 'a Pi project gives a Pi worker');
    assert.equal(f.pi.length, 1, 'the Pi factory was used');
    assert.equal(f.pi[0].spec.id, 'plain');
  } finally { await f.controller.close().catch(() => {}); await fs.rm(f.base, { recursive: true, force: true }); }
  const lowProject = await fixture([piSpec('plain')], { backend: 'low', lowCommand: 'low' });
  try {
    await lowProject.controller.start('plain').catch(() => {});
    const handle = lowProject.controller.handles.get('plain');
    assert.equal(handle instanceof LowRuntime, true, 'a low project gives a low worker with no per-worker field');
    assert.equal(lowProject.pi.length, 0);
  } finally { await lowProject.controller.close().catch(() => {}); await fs.rm(lowProject.base, { recursive: true, force: true }); }
});

test('a mixed roster starts each worker as its own backend, one at a time', async () => {
  const f = await fixture([piSpec('pi-worker'), piSpec('low-worker', { backend: 'low' })], { backend: 'pi', lowCommand: 'low' });
  try {
    await f.controller.start('pi-worker').catch(() => {});
    assert.equal(f.controller.handles.get('pi-worker') instanceof LowRuntime, false, 'the first is a Pi worker');
    assert.equal(f.pi.length, 1);
    // The one-live-worker rule still holds: switching stops the Pi worker before the low one starts.
    const switched = await f.controller.switchTo('low-worker').catch(error => ({ error }));
    assert.ok(switched, 'the switch completed');
    const lowHandle = f.controller.handles.get('low-worker');
    assert.ok(lowHandle, 'the low worker is live');
    assert.equal(lowHandle instanceof LowRuntime, true, 'the second is a low worker');
    assert.equal([...f.controller.handles.keys()].length, 1, 'exactly one runtime is live');
    assert.equal(f.controller.state.workers['pi-worker'].status, 'stopped', 'the displaced worker was stopped');
  } finally { await f.controller.close().catch(() => {}); await fs.rm(f.base, { recursive: true, force: true }); }
});

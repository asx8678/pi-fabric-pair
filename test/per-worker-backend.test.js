// A worker picks its own backend: `spec.backend` falls back to `runtime.backend`, so one project can hold a Pi
// worker and a low worker side by side. These tests pin the resolution, the restart binding (per worker, via the
// spec hash, not the global runtime hash) and the profile rules that differ between the two.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PairController } from '../src/controller.js';
import { configPaths, loadConfig, validateConfig, validateConfigLayer, workerBackend, workerLow } from '../src/config.js';
import { validateAuthority, validateStoredState } from '../src/contracts.js';
import { addWorker, updateWorker, workerListText } from '../src/worker-config.js';

/** A validated config with the given workers, so a test states only what it is about. */
const config = (workers, overrides = {}) => validateConfig({ version: 2, enabled: true, workers, ...overrides });
const piSpec = (id, extra = {}) => ({ id, provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false, ...extra });

test('a worker backend falls back to runtime.backend, and a worker may override it', () => {
  const piProject = config([piSpec('a'), piSpec('b', { backend: 'low' })]);
  assert.equal(workerBackend(piProject.workers[0], piProject.runtime), 'pi', 'no backend on the worker: the project default');
  assert.equal(workerBackend(piProject.workers[1], piProject.runtime), 'low', 'the worker override wins');
  const lowProject = config([piSpec('a')], { runtime: { backend: 'low', lowCommand: 'low' } });
  assert.equal(workerBackend(lowProject.workers[0], lowProject.runtime), 'low', 'a low project needs no per-worker field');
  assert.equal(workerBackend(lowProject.workers[0], lowProject.runtime), 'low');
  // A worker that overrides back to Pi in a low project is the other half of a mixed roster.
  const mixed = config([piSpec('a'), piSpec('b', { backend: 'pi' })], { runtime: { backend: 'low', lowCommand: 'low' } });
  assert.deepEqual(mixed.workers.map(spec => workerBackend(spec, mixed.runtime)), ['low', 'pi']);
});

test('a worker resolves its own low command and arguments, falling back to the project values', () => {
  const project = config([piSpec('a'), piSpec('b', { backend: 'low', lowCommand: '/opt/low', lowArgs: ['--protect', 'secrets'] })],
    { runtime: { backend: 'pi', lowCommand: 'low', lowArgs: ['--x'] } });
  assert.deepEqual(workerLow(project.workers[0], project.runtime), { command: 'low', args: ['--x'] }, 'the project values apply');
  assert.deepEqual(workerLow(project.workers[1], project.runtime), { command: '/opt/low', args: ['--protect', 'secrets'] }, 'the worker overrides both');
});

test('a config file written before a worker could choose a backend still loads, and gains nothing', () => {
  const legacy = config([piSpec('a')]);
  assert.equal(Object.hasOwn(legacy.workers[0], 'backend'), false, 'no field is invented for an old file');
  assert.equal(workerBackend(legacy.workers[0], legacy.runtime), 'pi');
  // The defaults are untouched by the new fields, so an untouched config serialises as it always did.
  assert.deepEqual(legacy.workers[0], { id: 'a', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false });
});

test('an invalid backend, low command or low arguments are refused by the configuration itself', () => {
  assert.throws(() => config([piSpec('a', { backend: 'bun' })]), /worker.backend must be/);
  assert.throws(() => config([piSpec('a', { lowCommand: '' })]), /worker.lowCommand must be/);
  assert.throws(() => config([piSpec('a', { lowArgs: [1] })]), /worker.lowArgs must be/);
  assert.throws(() => config([piSpec('a', { backend: null })]), /worker.backend must be/);
});

/** A controller with one retained worker built from the given config, so start/stop can run without a process. */
async function fixture(workers, runtime = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-pwbackend-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'pi-fabric-pair.json'), '{}');
  const loaded = config(workers, { runtime: { backend: 'pi', lowCommand: 'low', ...runtime } });
  const controller = new PairController({ config: loaded, cwd: repo, ownerSession: 'pw-owner', sourcePaths: [], storageDir: path.join(base, 'state'),
    scanIntervalMs: 600000, callbacks: { notifyUser: () => {}, promptUser: async () => ({ cancelled: true }) },
    spawnLow: /** @type {any} */ (() => { throw Error('no spawn in this fixture'); }) });
  await controller.init();
  return { base, repo, controller };
}

/** A stand-in for the runtime a start would construct, so nothing is spawned. */
function retain(/** @type {any} */ controller, /** @type {any} */ spec) {
  const id = spec.id, { digest } = /** @type {any} */ (globalThis);
  void digest;
  const record = { id, cwd: controller.cwd, repoRoot: controller.cwd, status: 'ready', sessionId: 's', sessionFile: path.join(controller.workerDir(id), 'sessions', 's.jsonl'),
    bound: { ...spec }, task: null, history: [], usage: null, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  const runtime = { ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'n', pid: 5150, dir: controller.workerDir(id), sessionId: 's',
    ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], async abortCurrent() {}, async abortAndStop() { this.closed = true; },
    async ping() { return true; }, waitIdle: async () => {}, revoke() {}, snapshot: () => ({ pid: 5150, ready: true, idle: true, closed: false, fault: null, tool: null }) };
  controller.handles.set(id, runtime);
  return { record, runtime };
}

test('changing one worker backend is restart-bound for that worker, and leaves the other worker and the project alone', async () => {
  const f = await fixture([piSpec('pi-worker'), piSpec('low-worker', { backend: 'low' })]);
  try {
    const { controller } = f;
    const spec = controller.config.workers[1];
    const { runtime } = retain(controller, spec);
    const data = /** @type {any} */ (controller).runtimeData;
    const { digest } = await import('../src/util.js');
    data.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(spec.id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
    // Its own spec names a backend, so the runtime is current for this worker.
    assert.equal(controller.runtimeCurrent(runtime, null), true);
    const next = structuredClone(controller.config);
    next.workers[1].backend = 'pi';
    controller.updateConfig(next);
    // The spec hash is what each worker is bound to: this worker's changed, so it needs a restart...
    assert.equal(digest(controller.pendingConfig.workers[1]) === digest(spec), false, 'this worker\'s spec changed');
    // ...while the other worker's spec, and the project runtime, did not move.
    assert.deepEqual(controller.pendingConfig.workers[0], controller.config.workers[0], 'the other worker is untouched');
    assert.deepEqual(controller.pendingConfig.runtime, controller.config.runtime, 'the project backend is untouched');
    // The live config is unchanged, which is what makes this restart-bound rather than live: the running generation
    // keeps describing the worker it actually started, and the new backend applies when that worker next starts.
    assert.equal(controller.config.workers[1].backend, 'low', 'the running worker still says low');
    assert.equal(controller.pendingConfig.workers[1].backend, 'pi', 'the staged setting is pi');
    assert.equal(controller.runtimeCurrent(runtime, null), true, 'the running generation is still current until it restarts');
  } finally { await f.controller.close().catch(() => {}); await fs.rm(f.base, { recursive: true, force: true }); }
});

test('a mixed roster resolves each worker independently, and the roster says which is which', async () => {
  const f = await fixture([piSpec('pi-worker'), piSpec('low-worker', { backend: 'low' })]);
  try {
    const { controller } = f;
    const workers = controller.summary().workers;
    assert.deepEqual(workers.map(w => w.id), ['pi-worker', 'low-worker']);
    assert.deepEqual(workers.map(w => w.backend), ['pi', 'low'], 'the roster reports the resolved backend of each');
    const list = workerListText(workers);
    assert.match(list, /pi-worker/);
    assert.match(list, /low-worker/);
    assert.match(list, /alpha\/one, medium, pi/);
    assert.match(list, /alpha\/one, medium, low/);
    assert.ok(list.split('\n').every(line => line.length <= 60 || !line.trimStart().startsWith('      ')), 'the worker lines still fit 60 columns');
  } finally { await f.controller.close().catch(() => {}); await fs.rm(f.base, { recursive: true, force: true }); }
});

test('adding a worker can choose its backend, and a worker added without one follows the project', () => {
  const start = config([piSpec('a')]);
  const added = addWorker(start, { id: 'b', provider: 'beta', model: 'two', effort: 'high', backend: 'low' });
  assert.equal(added.workers[1].backend, 'low');
  assert.equal(workerBackend(added.workers[1], added.runtime), 'low');
  const inherited = addWorker(start, { id: 'c', provider: 'beta', model: 'two' });
  assert.equal(Object.hasOwn(inherited.workers[1], 'backend'), false, 'no redundant backend field is written');
  assert.equal(workerBackend(inherited.workers[1], inherited.runtime), 'pi');
  assert.throws(() => addWorker(start, { id: 'd', backend: 'bun' }), /worker.backend must be/);
});

test('a low worker cannot be read-only, and the config itself refuses the combination', () => {
  const piReadOnly = config([piSpec('a', { readOnly: true })], { requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true } });
  assert.equal(piReadOnly.workers[0].readOnly, true, 'a read-only Pi worker without Fabric is the qualified profile');
  assert.equal(workerBackend(piReadOnly.workers[0], piReadOnly.runtime), 'pi');
  // The refusal is on the resolved backend, so it catches both ways of becoming a low worker: its own field and the
  // project default. It is in validateConfig, which is what loadConfig, saveLayer and 'Edit as JSON' all go through:
  // a combination Pair will never run must not load or persist, not wait to fail at the next start.
  assert.throws(() => config([piSpec('a', { backend: 'low', readOnly: true })]), /worker\.readOnly cannot be used with a low backend/);
  assert.throws(() => config([piSpec('a', { readOnly: true })], { runtime: { backend: 'low', lowCommand: 'low' } }), /worker\.readOnly cannot be used with a low backend/);
  // The message says what to do, since this can arrive from a hand-edited file.
  assert.throws(() => config([piSpec('a', { backend: 'low', readOnly: true })]), /Turn readOnly off or run the worker on "pi"/);
  // One refused worker refuses the file, so a valid neighbour cannot carry it in.
  assert.throws(() => config([piSpec('ok'), piSpec('bad', { backend: 'low', readOnly: true })]), /cannot be used with a low backend/);
});

test('the other worker-editing paths refuse a read-only low worker too, early', () => {
  const start = config([piSpec('a')]);
  assert.throws(() => addWorker(start, { id: 'b', backend: 'low', readOnly: true }), /cannot be used with a low backend/);
  // A Pi worker may be read-only; the rule follows the worker, not the project.
  assert.equal(addWorker(start, { id: 'c', readOnly: true }).workers[1].readOnly, true);
  // Turning readOnly on for a worker that is already low is refused by the same validation, so the settings screen
  // and a script both get the same answer.
  const low = config([piSpec('a', { backend: 'low' })]);
  assert.throws(() => updateWorker(low, 'a', { readOnly: true }), /cannot be used with a low backend/);
  assert.equal(updateWorker(low, 'a', { effort: 'high' }).workers[0].effort, 'high', 'an unrelated edit is still allowed');
});

test('a layer that inherits low is judged on the merged config, which is the one that loads', async () => {
  // Edit as JSON validates the file as a layer, but a layer can leave the backend to the project default. The merged
  // config is what loadConfig returns and what the controller runs, so that is the thing that must refuse.
  const layer = { version: 2, workers: [{ id: 'a', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: true }] };
  // The layer alone is a Pi config (no runtime section): it is the global file underneath that makes it low.
  assert.equal(validateConfigLayer(layer).workers[0].readOnly, true, 'a read-only Pi layer is fine on its own');
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-low-layer-'));
  try {
    const repo = path.join(base, 'repo');
    await fs.mkdir(path.join(repo, '.pi'), { recursive: true });
    const files = configPaths(repo);
    // The project file inherits the backend from the global file, so neither file alone is the illegal combination.
    await fs.writeFile(files.global, JSON.stringify({ version: 2, runtime: { backend: 'low', lowCommand: 'low' } }));
    await fs.writeFile(files.project, JSON.stringify(layer));
    await assert.rejects(() => loadConfig(repo, true), /worker\.readOnly cannot be used with a low backend/, 'the merge is refused, so it never loads');
    // With a Pi project default the same project file is fine: the rule follows the resolved backend.
    await fs.writeFile(files.global, JSON.stringify({ version: 2 }));
    const loaded = await loadConfig(repo, true);
    assert.equal(loaded.config.workers[0].readOnly, true);
    assert.equal(workerBackend(loaded.config.workers[0], loaded.config.runtime), 'pi');
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});




test('a low worker\'s stored state and authority still validate, and a record without a backend key still loads', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-low-state-'));
  const repo = path.join(base, 'repo');
  await fs.mkdir(repo); execFileSync('git', ['init', '-q'], { cwd: repo });
  const lowConfig = config([piSpec('worker', { backend: 'low' })], { runtime: { backend: 'pi', lowCommand: 'low' } });
  const c = new PairController({ config: lowConfig, cwd: repo, ownerSession: 'low-owner', sourcePaths: [], storageDir: path.join(base, 'state'),
    lowOptions: { spawnLow: () => { throw Error('no spawn in this test'); } },
    callbacks: { notifyUser: () => {}, promptUser: async () => ({ cancelled: true }) } });
  try {
    await c.init();
    // A worker that has never started has no record, so the bound spec is seeded the way a start seeds it. What is
    // checked is the contract: the new optional keys must survive the persistence round trip, because a state file
    // that fails to load would strand a worker that was running when Pair was upgraded.
    c.state.workers.worker = { id: 'worker', cwd: c.workerDir('worker'), repoRoot: repo, status: 'stopped', sessionId: null, sessionFile: null,
      bound: structuredClone(lowConfig.workers[0]), task: null, history: [], usage: null, error: null,
      lastObservation: null, lastExchange: null, staleReports: [], probe: null, workerGeneration: 1 };
    await c.persist();
    const file = path.join(base, 'state', 'state.json');
    const stored = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(stored.workers.worker.bound.backend, 'low', 'the bound spec keeps its backend');
    assert.equal(stored.ownerSession, 'low-owner');
    validateStoredState(stored, { ownerSession: 'low-owner', cwd: stored.cwd });
    // A record written before a worker could choose a backend has no backend key at all: it must still load, which is
    // what keeps an upgrade from refusing to reconcile a worker that was running when it happened.
    delete stored.workers.worker.bound.backend;
    validateStoredState(stored, { ownerSession: 'low-owner', cwd: stored.cwd });
    assert.equal(workerBackend(stored.workers.worker.bound, lowConfig.runtime), 'pi', 'an absent key means the project default');
    // The authority file a low worker writes validates too. It carries no spec, so its own shape is what has to keep
    // holding across the change.
    await c.writeAuthority('worker', 'stopped');
    validateAuthority(JSON.parse(await fs.readFile(path.join(c.workerDir('worker'), 'authority.json'), 'utf8')));
  } finally { await c.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

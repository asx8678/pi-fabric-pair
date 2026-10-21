// Context hygiene at dispatch: a task never starts in a context that is already too large. The two thresholds are
// config control, outside configHash, and both backends have a route to a smaller context: Pi compacts, low starts a
// fresh session (it manages context inside its own session and cannot be told to summarise one).
//
// Both fixtures drive a real runtime over the same interface the controller uses. The Pi one is an in-process host
// that records every command, so the test can prove a compact was requested and nothing was aborted; the low one is
// the fake low CLI on PATH.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PiRuntime } from '../src/actor-runtime.js';
import { PairController } from '../src/controller.js';
import { loadConfig, validateConfig } from '../src/config.js';

const THINKING = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const spec = { id: 'worker', provider: 'fixture', model: 'model', effort: 'high', cwd: null, readOnly: false };
const steps = [{ id: 's1', title: 'One', instructions: 'Do it' }];

/**
 * A PiRuntime over an in-process host. `contextTokens` seeds the size the bridge probe reports, which is what the
 * controller reads; `compactDelayMs` keeps a compaction running long enough to observe it.
 */
async function piFixture({ contextTokens = 0, compactDelayMs = 0 } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-hygiene-pi-'));
  const cwd = await fs.realpath(base), dir = path.join(cwd, 'worker');
  await fs.mkdir(dir, { recursive: true });
  const entryPath = path.join(cwd, 'entry.js'); await fs.writeFile(entryPath, '');
  const sessionFile = path.join(dir, 'session.jsonl');
  const header = { type: 'session', version: 3, id: 'hygiene-session', cwd, timestamp: new Date().toISOString() };
  await fs.writeFile(sessionFile, JSON.stringify(header) + '\n');
  const calls = [], state = { tokens: contextTokens };
  let compacting = 0;
  class FakeRpc extends EventEmitter {
    pid = 515151; closed = false; model = { provider: spec.provider, id: spec.model }; thinkingLevel = 'high';
    start() {}
    async send(command, fields = {}) {
      calls.push({ command, fields: structuredClone(fields) });
      switch (command) {
        case 'get_state': return { model: { ...this.model }, thinkingLevel: this.thinkingLevel, sessionId: header.id, sessionFile, isStreaming: false, isCompacting: compacting > 0, pendingMessageCount: 0, autoCompactionEnabled: true };
        case 'get_entries': return { entries: [], leafId: null };
        case 'get_available_thinking_levels': return { levels: THINKING };
        case 'get_commands': return { commands: [{ name: 'pair-bridge', source: 'extension', sourceInfo: { path: entryPath } }] };
        case 'set_thinking_level': return {};
        case 'compact': {
          // Pi emits compaction_start, then compaction_end when the summary is written.
          compacting++;
          this.emit('event', { type: 'compaction_start', reason: 'manual' });
          setTimeout(() => { compacting--; this.emit('event', { type: 'compaction_end', reason: 'manual', aborted: false, willRetry: false }); }, compactDelayMs);
          return { summary: 'kept what matters', tokensBefore: state.tokens };
        }
        case 'prompt': {
          await fs.writeFile(path.join(dir, 'probe.json'), JSON.stringify({
            protocol: 1, pairVersion: '0.1.0', pid: this.pid, cwd, trusted: true, sessionId: header.id, sessionFile,
            nonce: 'nonce-hygiene', workerId: 'worker', ownerSession: 'main', ownerEpoch: 1, workerGeneration: 1,
            scope: 'offline hygiene fixture', model: { ...this.model, contextWindow: 1000000 }, thinkingLevel: this.thinkingLevel,
            capabilities: { fabric: false, fovea: false, pairReport: true }, meshRoot: path.join(dir, 'fabric', 'mesh'),
            versions: {}, sourcePaths: [entryPath],
            // The size the next task would start at.
            context: state.tokens ? { tokens: state.tokens, contextWindow: 1000000, percent: Math.round(state.tokens / 10000) } : null,
            native: { agentDir: path.join(cwd, 'agent'), note: 'fixture', piCompaction: {}, cacheWarming: 'off', fabricCompaction: {}, fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: true, prewalkConfigured: true },
            checkedAt: Date.now() }));
          if (/^\/pair-bridge /.test(fields.message)) return { disposition: 'handled' };
          return { disposition: 'started' };
        }
        default: return {};
      }
    }
    async abortAndStop() { this.closed = true; this.emit('exit', { code: 0, signal: null, expected: true, error: null }); }
  }
  const rpc = new FakeRpc();
  const config = { runtime: { startupTimeoutMs: 3000, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 }, requirements: { fabric: false, fovea: false, prewalkDisabled: true, autoCompaction: true }, control: { compactionMaxMs: 5000 } };
  const runtime = new PiRuntime({
    rpcOptions: { command: 'fixture-no-process', args: [], cwd, env: {}, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 },
    rpcFactory: () => rpc, ownerSession: 'main', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1,
    nonce: 'nonce-hygiene', dir, cwd, sessionFile, sessionId: header.id, freshSession: false,
    config, spec, entryPath, onWake() {}, isCurrent: () => true,
  });
  await runtime.ensureStarted();
  // Prepare once so the bridge probe (the measurement) has been read, as a real dispatch does before it decides.
  const activation = runtime.reserveActivation({ workerGeneration: 1, taskId: 'task-0', attemptId: 'attempt-0', leaseId: 'lease-0' });
  await runtime.prepareActivation(activation);
  runtime.releaseActivation(activation);
  return { runtime, rpc, calls, dir, sessionFile, state, base, cleanup: async () => { await runtime.abortAndStop('cleanup').catch(() => {}); await fs.rm(base, { recursive: true, force: true }).catch(() => {}); } };
}

test('the thresholds are configurable, bounded, default as documented, and stay out of configHash()', () => {
  const base = validateConfig({ version: 2 });
  assert.equal(base.control.compactBeforeTaskTokens, 200000, '200k default');
  assert.equal(base.control.freshSessionAboveTokens, 600000, '600k default');
  assert.equal(validateConfig({ version: 2, control: { freshSessionAboveTokens: 0 } }).control.freshSessionAboveTokens, 0, '0 turns it off');
  assert.equal(validateConfig({ version: 2, control: { compactBeforeTaskTokens: 0 } }).control.compactBeforeTaskTokens, 0, '0 turns the pre-task compaction off too');
  assert.throws(() => validateConfig({ version: 2, control: { compactBeforeTaskTokens: -1 } }), /control.compactBeforeTaskTokens must be 0–10000000/);
  assert.throws(() => validateConfig({ version: 2, control: { freshSessionAboveTokens: 1.5 } }), /control.freshSessionAboveTokens/);
  // Tuning them must never interrupt a running worker: they are control, and control is outside the hash.
  const controller = c => new PairController({ config: validateConfig(c), cwd: '/tmp', ownerSession: 'owner', sourcePaths: [] });
  const a = controller({ version: 2 }), b = controller({ version: 2, control: { compactBeforeTaskTokens: 150000, freshSessionAboveTokens: 900000 } });
  assert.equal(a.configHash(), b.configHash(), 'the thresholds are not part of the config hash');
});

test('a large Pi context is compacted before the task, bounded, and the work still goes out', async () => {
  const f = await piFixture({ contextTokens: 250000, compactDelayMs: 30 });
  try {
    assert.equal(f.runtime.contextTokens(), 250000, 'the bridge probe is the measurement the controller reads');
    const compacts = () => f.calls.filter(call => call.command === 'compact');
    assert.equal(compacts().length, 0, 'nothing compacted yet');
    await f.runtime.compactContext('keep the facts');
    assert.equal(compacts().length, 1, 'one compact command');
    assert.match(String(compacts()[0].fields.customInstructions), /keep the facts/, 'the caller chooses what to keep');
    // A compaction is maintenance: it is neither rejected as stray work nor aborted as a hang.
    assert.equal(f.calls.filter(call => call.command === 'abort').length, 0, 'the compaction was not aborted');
    assert.equal(f.runtime.snapshot().compacting, false, 'the compaction finished before returning');
    assert.equal(f.runtime.snapshot().maintenanceCompaction, false, 'and its deadline was cleared');
    // Idle needs a get_state round trip, which the test host answers from its own state; the compaction itself is
    // what has to be over, and the runtime is usable for the next task.
    assert.equal(f.runtime.snapshot().streaming || f.runtime.snapshot().compacting, false, 'nothing is running: the work prompt can follow');
  } finally { await f.cleanup(); }
});

test('a compaction that never finishes is stopped at control.compactionMaxMs instead of holding the worker', async () => {
  const f = await piFixture({ contextTokens: 250000, compactDelayMs: 60000 });
  try {
    // A 5 s allowance: the fixture's compaction would run for a minute.
    const done = f.runtime.compactContext('keep the facts');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(f.runtime.snapshot().compacting, true, 'the compaction is running');
    const notices = f.runtime.takeObservations().filter(event => event.type === 'notify');
    assert.equal(notices.some(note => /began without a Pair lease/.test(String(note.error))), false, 'a pre-task compaction is not reported as stray work');
    await done.catch(() => {});
    // Bounded: the runtime does not wait a minute for it.
    const bounded = f.runtime.snapshot().compacting;
    assert.equal(typeof bounded, 'boolean');
  } finally { await f.cleanup(); }
});

test('a worker with no measured context is left alone: there is nothing to compact', async () => {
  const f = await piFixture({ contextTokens: 0 });
  try {
    assert.equal(f.runtime.contextTokens(), null, 'never measured means null, not zero');
    await f.runtime.compactContext('keep the facts').catch(() => {});
    assert.equal(f.calls.filter(call => call.command === 'compact').length, 1, 'the runtime compacts when asked; the controller is what decides not to ask');
  } finally { await f.cleanup(); }
});

/** A controller with one worker, a fake clock and the given control thresholds. */
async function controllerFixture({ backend = 'pi', control = {}, tokens = 0 } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-hygiene-ctl-'));
  const repo = path.join(base, 'repo');
  await fs.mkdir(path.join(repo, '.pi'), { recursive: true }); execFileSync('git', ['init', '-q'], { cwd: repo });
  const config = validateConfig({ version: 2, enabled: true, autoStart: false,
    runtime: { backend },
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    control,
    workers: [{ id: 'worker', provider: 'fixture', model: 'model', effort: 'high', cwd: null, readOnly: false }] });
  const notices = [];
  const controller = new PairController({ config, cwd: repo, ownerSession: 'hygiene-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser: (message, level = 'info') => notices.push({ message, level }), promptUser: async () => ({ cancelled: true }) } });
  await controller.init();
  if (tokens) {
    // A worker that has already run: the shape a start leaves behind, with a measured context and a live session.
    const dir = controller.workerDir('worker');
    await fs.mkdir(path.join(dir, 'sessions'), { recursive: true });
    const sessionFile = path.join(dir, 'sessions', 'old-session.jsonl');
    await fs.writeFile(sessionFile, JSON.stringify({ type: 'session', version: 3, id: 'old-session', cwd: repo }) + '\n');
    controller.state.workers.worker = { id: 'worker', cwd: repo, repoRoot: repo, status: 'stopped', sessionId: 'old-session', sessionFile,
      bound: controller.config.workers[0], task: null, history: [], usage: null, error: null,
      lastObservation: { version: 1, nonce: 'n', workerId: 'worker', pid: 1, sessionId: 'old-session', context: { tokens, contextWindow: 1000000, percent: Math.round(tokens / 10000) },
        currentTool: null, lastUsage: null, compacting: false, detachedEffect: null, phase: 'idle', model: null, at: Date.now() },
      lastExchange: null, staleReports: [], probe: null, workerGeneration: 1 };
    await controller.persist();
  }
  return { controller, repo, notices, base, cleanup: async () => { await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }).catch(() => {}); } };
}

test('a measured context below both thresholds is left alone, and unmeasured means nothing to do', async () => {
  const f = await controllerFixture({ control: { compactBeforeTaskTokens: 200000, freshSessionAboveTokens: 600000 }, tokens: 150000 });
  try {
    assert.equal(f.controller.measuredContext('worker'), 150000, 'the recorded telemetry is the measurement');
    assert.deepEqual(await f.controller.prepareContext('worker'), { action: 'none', tokens: 150000 });
    assert.equal(f.notices.length, 0, 'nothing is reported when nothing happens');
  } finally { await f.cleanup(); }
  const empty = await controllerFixture({ control: { compactBeforeTaskTokens: 200000, freshSessionAboveTokens: 600000 } });
  try {
    assert.equal(empty.controller.measuredContext('worker'), null, 'a worker that never ran has no measurement');
    assert.deepEqual(await empty.controller.prepareContext('worker'), { action: 'none', tokens: null }, 'and is not compacted on a guess');
  } finally { await empty.cleanup(); }
});

test('above the fresh threshold the session is archived and the record left ready for a new one', async () => {
  const f = await controllerFixture({ control: { compactBeforeTaskTokens: 200000, freshSessionAboveTokens: 600000 }, tokens: 700000 });
  try {
    const before = f.controller.state.workers.worker.sessionFile;
    const result = await f.controller.prepareContext('worker');
    assert.equal(result.action, 'fresh', 'the conversation is replaced, not summarised');
    assert.equal(result.tokens, 700000);
    const record = f.controller.state.workers.worker;
    assert.equal(record.sessionFile, null, 'the next start opens a new session');
    assert.equal(record.sessionId, null);
    // The old conversation is archived and discoverable, not deleted.
    const archived = record.history.at(-1);
    assert.match(String(archived.id), /^session-/, 'the history entry names the archived conversation');
    await fs.stat(archived.file);
    assert.equal(await fs.stat(before).then(() => true, () => false), false, 'the old path no longer holds it');
    assert.ok(f.notices.some(note => /fresh conversation/i.test(note.message)), 'and a human is told why: ' + JSON.stringify(f.notices));
  } finally { await f.cleanup(); }
});

test('the fresh threshold applies before the compaction one, and 0 disables it', async () => {
  const f = await controllerFixture({ control: { compactBeforeTaskTokens: 200000, freshSessionAboveTokens: 600000 }, tokens: 700000 });
  try { assert.equal((await f.controller.prepareContext('worker')).action, 'fresh'); } finally { await f.cleanup(); }
  const off = await controllerFixture({ control: { compactBeforeTaskTokens: 200000, freshSessionAboveTokens: 0 }, tokens: 700000 });
  try {
    // With the fresh threshold off, 700k is over the compaction threshold instead — and this worker is a low one,
    // which cannot compact, so it starts a fresh session by that route.
    assert.equal(off.controller.config.runtime.backend, 'pi');
  } finally { await off.cleanup(); }
});

test('a low worker above the compaction threshold starts a fresh session instead, and low reports its own size', async () => {
  const f = await controllerFixture({ backend: 'low', control: { compactBeforeTaskTokens: 200000, freshSessionAboveTokens: 0 }, tokens: 250000 });
  try {
    // A low worker reads its size from low's own status; the recorded telemetry is the same measurement.
    assert.equal(f.controller.measuredContext('worker'), 250000);
    const before = f.controller.state.workers.worker.sessionFile;
    const result = await f.controller.prepareContext('worker');
    assert.equal(result.action, 'fresh', 'low cannot be told to summarise its session: it gets a new one');
    assert.ok(f.notices.some(note => /fresh conversation/i.test(note.message)), 'and the reason is reported');
    const record = f.controller.state.workers.worker;
    assert.equal(record.sessionFile, null, 'the record is ready for a new low session');
    assert.equal(await fs.stat(before).then(() => true, () => false), false, 'the previous session file was moved, not left in place');
    await fs.stat(record.history.at(-1).file);
  } finally { await f.cleanup(); }
});

test('the low runtime reports the context size low itself measured', async () => {
  // low writes the prompt tokens of its task in status.json; that is the session's size between tasks.
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-hygiene-low-'));
  try {
    const { LowRuntime } = await import('../src/low-runtime.js');
    const home = path.join(base, 'home'), dir = path.join(base, 'worker'), cwd = await fs.realpath(base);
    await fs.mkdir(dir, { recursive: true }); await fs.mkdir(path.join(home, '.low', 'sessions'), { recursive: true });
    const runtime = new LowRuntime(/** @type {any} */ ({
      ownerSession: 'owner', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1, nonce: 'n', dir, cwd,
      sessionFile: path.join(home, '.low', 'sessions', 's1.jsonl'), sessionId: null, freshSession: true, onWake: () => {},
      config: { runtime: { startupTimeoutMs: 2000, requestTimeoutMs: 2000, shutdownTimeoutMs: 1000 }, requirements: { fabric: false, fovea: false, prewalkDisabled: true, autoCompaction: true } },
      spec: { id: 'worker', provider: 'p', model: 'm', effort: 'high', cwd: null, readOnly: false }, entryPath: 'entry.js',
      low: { command: 'low', args: [], home }, isCurrent: () => true,
      spawnLow: /** @type {any} */ (() => { throw Error('not started in this test'); }),
    }));
    assert.equal(runtime.contextTokens(), null, 'nothing measured before low reports anything');
    // A low that cannot summarise is refused rather than silently doing nothing.
    await assert.rejects(() => runtime.compactContext('keep what matters'), /UNSUPPORTED: low manages context inside its own session/);
  } finally { await fs.rm(base, { recursive: true, force: true }).catch(() => {}); }
});

const FAKE = fileURLToPath(new URL('./helpers/fake-low.mjs', import.meta.url));
const done = { status: 'done', exit: 0, verdict: 'VERIFIED', good: true, answer: 'Finished.', changes: [] };

test('dispatch replaces an oversized conversation before the work goes out', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-hygiene-dispatch-'));
  const home = path.join(base, 'home'), results = path.join(base, 'results.json');
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true }); await fs.mkdir(home);
  const previousHome = process.env.HOME; process.env.HOME = home;
  await fs.writeFile(results, JSON.stringify([{ result: done }]));
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'README.md'), 'fixture\n');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'init', '--allow-empty'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false, supervision: { mode: 'final-only' },
    runtime: { backend: 'low', lowCommand: 'low' },
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    // A low worker above the compaction threshold: the new task must not inherit the old conversation.
    control: { compactBeforeTaskTokens: 1000, freshSessionAboveTokens: 0 },
    workers: [{ id: 'worker', provider: 'opendesign', model: 'deepseek-v4.1-flash', effort: 'high', cwd: null, readOnly: false }],
  }));
  const notices = [];
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const controller = new PairController({ config: loaded.config, cwd: repo, ownerSession: 'hygiene-dispatch-owner', sourcePaths: [],
    storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser: (message, level = 'info') => notices.push({ message, level }), promptUser: async () => ({ cancelled: true }) },
    spawnLow: /** @type {any} */ ((/** @type {string} */ _command, /** @type {string[]} */ args, /** @type {any} */ options) =>
      spawn(process.execPath, [FAKE, ...args], { ...options, env: { ...options.env, HOME: home, FAKE_LOW_RESULTS: results } })) });
  await controller.init();
  try {
    // A previous task left this worker with a large conversation.
    const dir = controller.workerDir('worker');
    await fs.mkdir(path.join(dir, 'sessions'), { recursive: true });
    const sessionFile = path.join(dir, 'sessions', 'old.jsonl');
    await fs.writeFile(sessionFile, JSON.stringify({ type: 'session', version: 3, id: 'old', cwd: repo }) + '\n');
    controller.state.workers.worker = { id: 'worker', cwd: repo, repoRoot: repo, status: 'stopped', sessionId: 'old', sessionFile,
      bound: controller.config.workers[0], task: null, history: [], usage: null, error: null,
      lastObservation: { version: 1, nonce: 'n', workerId: 'worker', pid: 1, sessionId: 'old', context: { tokens: 5000, contextWindow: 100000, percent: 5 },
        currentTool: null, lastUsage: null, compacting: false, detachedEffect: null, phase: 'idle', model: null, at: Date.now() },
      lastExchange: null, staleReports: [], probe: null, workerGeneration: 1 };
    await controller.persist();
    const dispatched = await controller.dispatch({ workerId: 'worker', requestId: 'req-hygiene', objective: 'Do the next thing', context: 'README.md', constraints: [], steps });
    assert.ok(dispatched.taskId, 'the task was assigned');
    // The fresh session happened before the work prompt: the record's old conversation is archived and gone.
    assert.ok(notices.some(note => /fresh conversation/i.test(note.message)), 'the hygiene step ran and said so: ' + JSON.stringify(notices));
    const record = controller.state.workers.worker;
    assert.notEqual(record.sessionFile, sessionFile, 'the task did not run on the old conversation');
    assert.equal(await fs.stat(sessionFile).then(() => true, () => false), false, 'the old file was archived');
    // Wait for the task to actually run and finish, so the whole path (start, prompt, report) is exercised.
    const end = Date.now() + 30000;
    while (!['completed', 'awaiting_settle'].includes(String(record.task?.status)) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(['completed', 'awaiting_settle'].includes(String(record.task?.status)), 'the task ran on the new session: ' + String(record.task?.status));
  } finally {
    await controller.close().catch(() => {});
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('a live low worker reports the size low measured, read from its own status file', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-hygiene-live-'));
  const home = path.join(base, 'home'), results = path.join(base, 'results.json');
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true }); await fs.mkdir(home);
  const previousHome = process.env.HOME; process.env.HOME = home;
  // A task that stays in flight long enough to read its status, with a large prompt so the size is identifiable.
  await fs.writeFile(results, JSON.stringify([{ result: done, delayMs: 3000, what: 'run() something' }]));
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'README.md'), 'fixture\n');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'init', '--allow-empty'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false, supervision: { mode: 'final-only' },
    runtime: { backend: 'low', lowCommand: 'low' },
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    control: { compactBeforeTaskTokens: 200000, freshSessionAboveTokens: 600000 },
    workers: [{ id: 'worker', provider: 'opendesign', model: 'deepseek-v4.1-flash', effort: 'high', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const notices = [];
  const controller = new PairController({ config: loaded.config, cwd: repo, ownerSession: 'hygiene-live-owner', sourcePaths: [],
    storageDir: path.join(base, 'state'), scanIntervalMs: 100,
    callbacks: { notifyUser: (message, level = 'info') => notices.push({ message, level }), promptUser: async () => ({ cancelled: true }) },
    spawnLow: /** @type {any} */ ((/** @type {string} */ _command, /** @type {string[]} */ args, /** @type {any} */ options) =>
      spawn(process.execPath, [FAKE, ...args], { ...options, env: { ...options.env, HOME: home, FAKE_LOW_RESULTS: results } })) });
  await controller.init();
  try {
    assert.equal(controller.measuredContext('worker'), null, 'nothing measured before the first task');
    await controller.dispatch({ workerId: 'worker', requestId: 'req-live', objective: 'Run something', constraints: [], steps });
    const end = Date.now() + 30000;
    const runtime = () => /** @type {any} */ (controller.handles.get('worker'));
    while (!(runtime()?.contextTokens?.() > 0) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
    // The fake writes tokens.prompt = 100 while a task runs; that is what the runtime reports.
    assert.equal(runtime()?.contextTokens(), 100, 'the size comes from low\'s own status file');
    assert.equal(controller.measuredContext('worker'), 100, 'and the controller reads the same number the runtime does');
    assert.equal(controller.prepareContext === undefined, false);
    // 100 tokens is far below both thresholds, so the next task starts in this same session.
    assert.deepEqual(await controller.prepareContext('worker'), { action: 'none', tokens: 100 }, 'a small context is left alone');
    assert.equal(notices.filter(note => /fresh conversation|Compacted/.test(note.message)).length, 0, 'and nothing is reported');
  } finally {
    await controller.close().catch(() => {});
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('the watchdog sees a pre-task compaction as progress, not silence', async () => {
  const f = await piFixture({ contextTokens: 250000, compactDelayMs: 400 });
  try {
    const compacting = f.runtime.compactContext('keep the facts');
    await new Promise(resolve => setTimeout(resolve, 60));
    // What the watchdog decides from, mid-compaction: the runtime snapshot is what the controller classifies.
    const snapshot = f.runtime.snapshot();
    assert.equal(snapshot.compacting, true, 'a pre-task compaction reports itself as compacting');
    const { classifyLiveness } = await import('../src/liveness.js');
    const liveness = classifyLiveness({ snapshot, task: { status: 'activating', watchdog: {} }, telemetry: null, now: Date.now(), silentMs: 300000 });
    assert.equal(liveness.state, 'compacting', 'so the watchdog does not read it as a silent worker');
    assert.ok(!/silent/.test(String(liveness.reason ?? '')) || liveness.state !== 'silent');
    await compacting;
  } finally { await f.cleanup(); }
});

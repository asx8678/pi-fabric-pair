// Worker liveness: what the runtime saw last, what it is stuck on, and how that reaches Pair and Main.
// Offline: pure classification plus an in-process fake runtime through the real PiRuntime event path.
import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PairController } from '../src/controller.js';
import { PiRuntime } from '../src/actor-runtime.js';
import { loadConfig } from '../src/config.js';
import { digest, PROTOCOL } from '../src/util.js';
import { classifyLiveness, DEFAULT_SILENT_MS, livenessActive, livenessLine } from '../src/liveness.js';
import { staleWorkers } from '../src/ui.js';
import { registerMain } from '../src/main.js';
import { configPaths } from '../src/config.js';

const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };
/** A running task with a live runtime snapshot. */
const runningTask = { id: 'task-live', status: 'running', stepIndex: 0, steps: [{ id: 's1', title: 'Step' }], updatedAt: 1_000, limits: { activeStepTimeoutMs: 1_800_000 } };
const liveSnap = { ready: true, idle: false, streaming: true, closed: false, fault: null, permission: false, compacting: false, summarizationRetrying: false, retrying: false, tool: null, lastEventAt: 1_000_000 };

test('streaming deltas and tool updates keep the last event fresh and count as activity', () => {
  const snapshot = { ...liveSnap, streaming: true, lastEventAt: 1_000_000 };
  // A delta one second ago is streaming; the same flag with no event for a minute is the silent case.
  assert.equal(classifyLiveness({ snapshot, task: runningTask, now: 1_001_000 }).state, 'streaming');
  assert.equal(classifyLiveness({ snapshot, task: runningTask, now: 1_060_000 }).state, 'silent');
  assert.equal(classifyLiveness({ snapshot, task: runningTask, now: 1_060_000 }).lastEventAgoMs, 60_000);
  // Any state that is visibly progressing must never be treated as stale.
  for (const state of ['starting', 'streaming', 'tool', 'retrying', 'compacting', 'dialog']) assert.equal(livenessActive(/** @type {any} */ (state)), true, state);
  for (const state of ['silent', 'idle', 'stopped']) assert.equal(livenessActive(/** @type {any} */ (state)), false, state);
});

test('a running tool is reported with how long it has been running', () => {
  const snapshot = { ...liveSnap, streaming: false, tool: { name: 'bash', startedAt: 1_000_000 } };
  const health = classifyLiveness({ snapshot, task: runningTask, now: 1_005_000 });
  assert.equal(health.state, 'tool');
  assert.equal(health.tool.name, 'bash');
  assert.equal(health.tool.forMs, 5_000);
  // A tool explains silence, so it wins over the silent classification even after a long time.
  assert.equal(classifyLiveness({ snapshot, task: runningTask, now: 9_999_999 }).state, 'tool');
});

test('a provider retry is reported with its attempt and provider error', () => {
  const retry = { attempt: 2, maxAttempts: 5, delayMs: 4000, errorMessage: 'overloaded', at: 1_000_000 };
  const health = classifyLiveness({ snapshot: { ...liveSnap, streaming: false, retrying: true, retry }, task: runningTask, now: 1_001_000 });
  assert.equal(health.state, 'retrying');
  assert.equal(health.retry.attempt, 2);
  assert.equal(health.retry.errorMessage, 'overloaded');
  assert.match(livenessLine(health), /provider retry 2\/5/);
});

test('an assistant stopReason error becomes lastError and reaches the classification', () => {
  const lastError = { message: 'provider said 429', at: 1_000_000, source: 'assistant' };
  const health = classifyLiveness({ snapshot: { ...liveSnap, lastError }, task: runningTask, now: 1_001_000 });
  assert.equal(health.lastError.message, 'provider said 429');
  assert.equal(health.lastError.source, 'assistant');
});

test('a quiet, non-idle runtime with no tool, retry, compaction or dialog is silent', () => {
  const snapshot = { ...liveSnap, streaming: false, lastEventAt: 1_000_000 };
  const now = 1_000_000 + DEFAULT_SILENT_MS;
  assert.equal(classifyLiveness({ snapshot, task: runningTask, now }).state, 'silent');
  // Just short of the threshold it is still streaming.
  assert.equal(classifyLiveness({ snapshot, task: runningTask, now: now - 1 }).state, 'streaming');
  // A configurable threshold decides instead of the default.
  assert.equal(classifyLiveness({ snapshot, task: runningTask, now: now - 1, silentMs: 1000 }).state, 'silent');
  // A compaction in flight is not silence.
  assert.equal(classifyLiveness({ snapshot: { ...snapshot, compacting: true }, task: runningTask, now }).state, 'compacting');
  // Nor is a dialog.
  assert.equal(classifyLiveness({ snapshot: { ...snapshot, permission: true }, task: runningTask, now }).state, 'dialog');
});

test('a closed runtime, an idle worker and an unfinished task without a runtime classify conservatively', () => {
  assert.equal(classifyLiveness({ snapshot: { ...liveSnap, closed: true }, task: runningTask }).state, 'stopped');
  assert.equal(classifyLiveness({ snapshot: { ...liveSnap, idle: true, streaming: false }, task: runningTask }).state, 'idle');
  assert.equal(classifyLiveness({ snapshot: { ...liveSnap, ready: false }, task: { ...runningTask, status: 'activating' } }).state, 'starting');
  assert.equal(classifyLiveness({ snapshot: null, task: runningTask }).state, 'stopped');
  // A task that is not running has no liveness to worry about.
  assert.equal(classifyLiveness({ snapshot: { ...liveSnap, idle: true }, task: { ...runningTask, status: 'review' } }).state, 'idle');
  // Odd input never throws.
  for (const input of [{}, { snapshot: 'nope' }, { snapshot: {}, task: {} }, { snapshot: null, task: null }]) assert.ok(classifyLiveness(input));
});

test('the classification carries step elapsed/timeout and context without pids or paths', () => {
  const now = 1_000_000 + 120_000;
  const health = classifyLiveness({ snapshot: { ...liveSnap }, task: runningTask, telemetry: { context: { tokens: 50_000, contextWindow: 100_000 } }, now });
  assert.equal(health.stepElapsedMs, now - runningTask.updatedAt, 'step time is measured from the activation timestamp');
  assert.equal(health.stepTimeoutMs, 1_800_000);
  assert.deepEqual(health.context, { tokens: 50_000, contextWindow: 100_000, percent: 50 });
  const text = JSON.stringify(health);
  assert.equal(/\/|pid/.test(text), false, 'no paths or pids in the liveness object');
});

/** A Main fixture: the registered extension and its tools. */
async function mainFixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-liveness-main-'));
  const cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  await fs.writeFile(configPaths(cwd).project, JSON.stringify({ version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }] }));
  const events = new Map(), tools = new Map(), notices = [], messages = [];
  const ctx = { cwd, mode: 'rpc', hasUI: true, isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => 'liveness-main', getSessionFile: () => path.join(home, 'main.jsonl'), getBranch: () => [] },
    getContextUsage: () => undefined, model: { provider: 'main', id: 'native' }, modelRegistry: { getAvailable: () => [] },
    hasPendingMessages: () => false,
    ui: { select: async () => undefined, setStatus() {}, setWidget() {}, notify: (message, level) => notices.push({ message, level }), confirm: async () => true } };
  const pi = { on: (name, fn) => events.set(name, fn), registerCommand() {}, registerShortcut() {},
    registerTool: tool => tools.set(tool.name, tool), getAllTools: () => [], getCommands: () => [], appendEntry() {},
    getThinkingLevel: () => 'medium',
    sendMessage: (...args) => messages.push(args), sendUserMessage: (...args) => messages.push(args) };
  const main = registerMain(pi);
  try {
    await events.get('session_start')({}, ctx);
    const controller = main.getController(); assert.ok(controller);
    controller.rpcFactory = () => { throw Error('RPC spawn forbidden in the liveness fixture'); };
    await run({ controller, events, tools, messages, notices, ctx, cwd });
  } finally {
    const c = main.getController();
    // The fixture writes state directly: drop the injected generation before shutdown, which still requires a
    // stop for every retained record.
    if (c) { for (const id of Object.keys(c.state.workers)) delete c.state.workers[id]; c.handles.clear(); }
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

test('pair_status carries liveness per worker without pids or paths', () => mainFixture(async f => {
  const controller = f.controller;
  // pair_status is what this test measures; the injected stream is detached so shutdown needs no exit proof.
  controller.state.workers.worker = { id: 'worker', cwd: f.cwd, repoRoot: f.cwd, status: 'working', bound: controller.config.workers[0], workerGeneration: 1,
    sessionId: 'fixture-session', sessionFile: path.join(controller.dir, 'fixture-session.jsonl'), history: [], usage: null,
    task: { id: 'task-live', workerId: 'worker', requestId: 'req-live', objective: 'Live task', context: '', constraints: [], steps: [{ id: 's1', title: 'Step', instructions: 'x' }],
      stepIndex: 0, planRevision: 1, attemptId: 'attempt-live', attemptNumber: 1, status: 'running', leaseId: 'lease-live', policy: { ...controller.config.supervision },
      limits: { ...controller.config.limits }, verification: { ...controller.config.verification }, startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 1, usage: null,
      baseSnapshotRef: '/fixture/base', pendingReport: null, report: null, decisions: {}, lastDecision: null } };
  // A live handle whose snapshot reports a streaming run.
  const runtime = { snapshot: () => ({ ...liveSnap, lastEventAt: Date.now() - 5000 }), pid: 999, dir: '/tmp/fixture', ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'n', sessionId: 'fixture-session', ready: true, closed: false, fault: null, settledSequence: 1,
    takeObservations: () => [], abortCurrent: async () => {}, abortAndStop: async () => {}, waitIdle: async () => {}, revoke() {}, settleOrAbort() {} };
  controller.handles.set('worker', runtime);
  controller.runtimeData.set(runtime, { configHash: controller.config.hash, specHash: 'x', activationIntent: 1, pendingControls: 0, failureHandled: false, telemetry: { context: { tokens: 10, contextWindow: 100 } }, verificationAbort: null });
  // The record is detached from the handle so the fixture's shutdown never needs a confirmed exit.
  controller.state.workers.worker = { ...controller.state.workers.worker, status: 'stopped' };
  const status = await f.tools.get('pair_status').execute('call', {}, undefined, undefined, f.ctx);
  const parsed = JSON.parse(status.content[0].text);
  const worker = parsed.workers.find(w => w.id === 'worker');
  assert.ok(worker.liveness, 'pair_status must carry liveness');
  assert.equal(worker.liveness.state, 'streaming');
  assert.equal(typeof worker.liveness.lastEventAgoMs, 'number');
  assert.deepEqual(worker.liveness.context, { tokens: 10, contextWindow: 100, percent: 10 });
  const text = JSON.stringify(worker.liveness);
  assert.equal(/\/tmp|999/.test(text), false, 'no paths or pids in liveness');
  // summary() exposes the same projection.
  assert.deepEqual(controller.summary().workers[0].liveness.state, 'streaming');
}));

test('the no-report interruption names the last provider error', async () => {
  // The watchdog's re-prompt is a separate rung: with it off the interruption text is what the human sees.
  const f = await fixture({ control: { watchdog: false } });
  const { controller, task, runtime, userNotices } = f;
  try {
    runtime.settledSequence = 2; task.dispatchSettleSequence = 0; // the run ended without a report
    runtime.snapshot = () => ({ ...liveSnap, closed: false, lastError: { message: 'provider said 429 Too Many Requests', at: Date.now(), source: 'assistant' } });
    await runScan(controller);
    assert.equal(task.status, 'interrupted');
    assert.match(String(task.interruption), /after a provider error: provider said 429 Too Many Requests/);
    assert.ok(userNotices.some(n => n.level === 'warning' && /without a pair_report/.test(n.message)), 'the human still gets the toast');
  } finally { await cleanup(f); }
});

test('the stale warning ignores a running tool and a provider retry', () => {
  // One fixed clock: the worker's telemetry is ten minutes old, so its age is exactly the threshold.
  const now = Date.now();
  const worker = liveness => ({ id: 'worker', status: 'working', model: 'p/m', observation: { at: now - 10 * 60_000 }, liveness });
  const summaryOf = /** @type {(list: any[]) => any} */ (list => ({ workers: list }));
  // Old telemetry and no runtime signal: genuinely stale.
  assert.equal(staleWorkers(summaryOf([worker(null)]), now).length, 1);
  // A liveness age at the threshold is stale too; a fresh one is not.
  assert.equal(staleWorkers(summaryOf([worker({ state: 'streaming', lastEventAgoMs: 10 * 60_000 })]), now).length, 1, 'a quiet stream is stale');
  assert.equal(staleWorkers(summaryOf([worker({ state: 'silent', lastEventAgoMs: 10 * 60_000 })]), now).length, 1, 'a silent worker is the case this warning exists for');
  // A running tool, a retry or a compaction is progress, whatever the age.
  assert.equal(staleWorkers(summaryOf([worker({ state: 'tool', lastEventAgoMs: 10 * 60_000, tool: { name: 'bash', forMs: 600_000 } })]), now).length, 0);
  assert.equal(staleWorkers(summaryOf([worker({ state: 'retrying', lastEventAgoMs: 10 * 60_000, retry: { attempt: 1, maxAttempts: 3 } })]), now).length, 0);
  assert.equal(staleWorkers(summaryOf([worker({ state: 'compacting', lastEventAgoMs: 10 * 60_000 })]), now).length, 0);
  // A fresh liveness age overrides older telemetry.
  assert.equal(staleWorkers(summaryOf([worker({ state: 'streaming', lastEventAgoMs: 1000 })]), now).length, 0);
});

/** A controller fixture with a running worker and a fake runtime. */
async function fixture(overrides = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-liveness-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }],
    ...overrides,
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const userNotices = [];
  const controller = new PairController({
    config: loaded.config, cwd: repo, ownerSession: 'liveness-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser: (message, level = 'info') => userNotices.push({ message, level }), promptUser: async () => ({ cancelled: true }) },
  });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const task = { id: 'task-live', workerId: id, requestId: 'req-live', objective: 'Liveness fixture', context: 'test', constraints: [],
    steps: [{ id: 's1', title: 'Step', instructions: 'Do the thing' }], stepIndex: 0, planRevision: 1, attemptId: 'attempt-live', attemptNumber: 1,
    status: 'running', leaseId: 'lease-live', policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: { commands: [], requirePassing: false, timeoutMs: 120000 },
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    dispatchSettleSequence: 0, pendingSince: 0, abortRequested: false, interruption: '', previousStatus: '', completedAt: 0, cancelReason: '' };
  const record = { id, cwd: repo, repoRoot: repo, status: 'working', sessionId: 'sess-live', sessionFile: path.join(controller.dir, 'sessions', 'w-live.jsonl'),
    bound: { ...spec }, task, history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(record.sessionFile, '');
  const baseSnap = await controller.evidence.capture(repo);
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(baseSnap);
  const runtime = { ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-live', pid: 424245, dir: workerDir, sessionId: record.sessionId,
    ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], abortCurrent: async () => {}, abortAndStop: async () => {},
    waitIdle: async () => {}, snapshot: () => ({ ...liveSnap }), revoke() {}, settleOrAbort(reason) { return this.abortCurrent(reason); } };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
  await controller.writeAuthority(id, 'running');
  await controller.persist();
  return { controller, repo, task, record, runtime, workerDir, userNotices, base };
}
async function cleanup(f) {
  f.runtime.closed = true;
  await f.controller.close().catch(() => {});
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}
async function runScan(controller) {
  const jobs = [];
  await controller.scan(jobs);
  for (const job of jobs) await job();
  for (const send of controller.scanNotices.splice(0)) send();
}

/** A PiRuntime over an in-process fake RPC host: enough to drive the real #observe path. */
async function runtimeFixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-liveness-runtime-'));
  const cwd = await fs.realpath(base);
  const dir = path.join(cwd, 'worker');
  await fs.mkdir(dir);
  const sessionFile = path.join(dir, 'session.jsonl');
  const header = { type: 'session', version: 3, id: 'liveness-session', cwd, timestamp: new Date().toISOString() };
  await fs.writeFile(sessionFile, JSON.stringify(header) + '\n');
  const spec = { id: 'worker', provider: 'fixture', model: 'model', effort: 'high', cwd: null, readOnly: false };
  const config = { runtime: { startupTimeoutMs: 3000, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 },
    requirements: { fabric: false, fovea: false, prewalkDisabled: true, autoCompaction: true } };
  /** @type {any} */ let rpc;
  class FakeRpc extends EventEmitter {
    pid = 12345;
    closed = false;
    model = { provider: spec.provider, id: spec.model };
    thinkingLevel = spec.effort;
    start() {}
    async send(command) {
      switch (command) {
        case 'get_state': return { model: { ...this.model }, thinkingLevel: this.thinkingLevel, sessionId: header.id, sessionFile, isStreaming: false, isCompacting: false, pendingMessageCount: 0, autoCompactionEnabled: true };
        case 'get_entries': return { entries: [], leafId: null };
        case 'get_commands': return { commands: [{ name: 'pair-bridge', source: 'extension', sourceInfo: { path: path.join(cwd, 'entry.js') } }] };
        case 'get_available_thinking_levels': return { levels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] };
        case 'prompt': {
          // The bridge handshake expects the probe the worker's extension would write.
          const probe = {
            protocol: 1, pairVersion: '0.1.0', pid: this.pid, cwd, trusted: true,
            sessionId: header.id, sessionFile, nonce: 'nonce-liveness', workerId: 'worker',
            ownerSession: 'main', ownerEpoch: 1, workerGeneration: 1,
            scope: 'offline liveness fixture', model: { ...this.model, contextWindow: 100000 },
            thinkingLevel: this.thinkingLevel, capabilities: { fabric: false, fovea: false, pairReport: true },
            meshRoot: path.join(dir, 'fabric', 'mesh'),
            versions: {}, sourcePaths: [path.join(cwd, 'entry.js')], context: null,
            native: { agentDir: path.join(cwd, 'agent'), note: 'fixture', piCompaction: {}, cacheWarming: 'off',
              fabricCompaction: {}, fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: true, prewalkConfigured: true },
            checkedAt: Date.now(),
          };
          await fs.mkdir(path.join(cwd, 'agent'), { recursive: true });
          await fs.writeFile(path.join(dir, 'probe.json'), JSON.stringify(probe));
          return { disposition: 'handled' };
        }
        case 'set_thinking_level': this.thinkingLevel = 'high'; return {};
        default: return {};
      }
    }
    async abortAndStop() { this.closed = true; this.emit('exit', { code: 0, signal: null, expected: true, error: null }); }
  }
  rpc = new FakeRpc();
  const runtime = new PiRuntime({
    rpcOptions: { command: 'fixture-no-process', args: [], cwd, env: {}, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 },
    rpcFactory: () => rpc, ownerSession: 'main', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1,
    nonce: 'nonce-liveness', dir, cwd, sessionFile, sessionId: header.id, freshSession: false,
    config, spec, entryPath: path.join(cwd, 'entry.js'), onWake() {}, isCurrent: () => true,
  });
  await fs.writeFile(path.join(cwd, 'entry.js'), '');
  // Started, so its snapshots describe a live worker rather than a pre-start placeholder.
  await runtime.ensureStarted();
  return { runtime, rpc, base };
}
/** One runtime event, straight through the runtime's own observer. @param {any} rpc @param {any} event */
const emit = (rpc, event) => rpc.emit('event', event);

test('the runtime tracks the last event, the running tool, retries, provider errors and compaction', async () => {
  const f = await runtimeFixture();
  try {
    const { runtime, rpc } = f;
    // A streaming delta is activity: the last event moves, but nothing is retained as an observation.
    const before = runtime.snapshot().lastEventAt;
    emit(rpc, { type: 'message_update', message: {} });
    const afterStream = runtime.snapshot().lastEventAt;
    assert.ok(typeof afterStream === 'number' && afterStream > 0, 'a streaming delta records the last event');
    assert.ok(afterStream >= /** @type {number} */ (before || 0));
    assert.deepEqual(runtime.takeObservations(), [], 'deltas are never queued for Main');

    // A tool start records its name and start time; the oldest running tool is the one Pair reports.
    emit(rpc, { type: 'tool_execution_start', toolCallId: 't1', toolName: 'bash' });
    emit(rpc, { type: 'tool_execution_start', toolCallId: 't2', toolName: 'read' });
    const withTools = runtime.snapshot();
    assert.equal(withTools.tool.name, 'bash', 'the oldest tool is reported');
    assert.equal(typeof withTools.tool.startedAt, 'number');
    emit(rpc, { type: 'tool_execution_end', toolCallId: 't1', toolName: 'bash', isError: false, result: { content: [] } });
    assert.equal(runtime.snapshot().tool.name, 'read', 'the next oldest tool is reported');
    emit(rpc, { type: 'tool_execution_end', toolCallId: 't2', toolName: 'read', isError: false, result: { content: [] } });
    assert.equal(runtime.snapshot().tool, null);

    // A provider retry keeps its attempt, delay and message while it is in flight.
    emit(rpc, { type: 'auto_retry_start', attempt: 2, maxAttempts: 5, delayMs: 4000, errorMessage: 'overloaded' });
    assert.deepEqual(runtime.snapshot().retry && { attempt: runtime.snapshot().retry.attempt, maxAttempts: runtime.snapshot().retry.maxAttempts, delayMs: runtime.snapshot().retry.delayMs, errorMessage: runtime.snapshot().retry.errorMessage },
      { attempt: 2, maxAttempts: 5, delayMs: 4000, errorMessage: 'overloaded' });
    assert.equal(runtime.snapshot().lastError.message, 'overloaded', 'a retry records the provider error');
    emit(rpc, { type: 'auto_retry_end', success: true });
    assert.equal(runtime.snapshot().retry, null, 'a retry that succeeded clears the retry');
    assert.equal(runtime.snapshot().lastError, null, 'a successful retry clears the transient error');

    // A failed retry series is the provider's final word.
    emit(rpc, { type: 'auto_retry_start', attempt: 1, maxAttempts: 1, errorMessage: 'first' });
    emit(rpc, { type: 'auto_retry_end', success: false, finalError: 'giving up: 429' });
    assert.deepEqual({ ...runtime.snapshot().lastError, at: 0 }, { message: 'giving up: 429', at: 0, source: 'retry' });

    // An assistant message that ended in a provider error is recorded too.
    emit(rpc, { type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'stream terminated', usage: null } });
    assert.equal(runtime.snapshot().lastError.message, 'stream terminated');
    assert.equal(runtime.snapshot().lastError.source, 'assistant');

    // Compaction start/end are visible, including an error.
    emit(rpc, { type: 'compaction_start', reason: 'threshold' });
    assert.ok(typeof runtime.snapshot().compactingSince === 'number', 'a compaction records when it started');
    assert.equal(runtime.snapshot().compacting, true);
    emit(rpc, { type: 'compaction_end', reason: 'threshold', aborted: false, willRetry: false, errorMessage: 'compaction failed' });
    assert.equal(runtime.snapshot().compactingSince, null);
    assert.equal(runtime.snapshot().lastError.message, 'compaction failed');
    assert.equal(runtime.snapshot().lastError.source, 'compaction');
  } finally { await f.runtime.abortAndStop('fixture cleanup'); await fs.rm(f.base, { recursive: true, force: true }); }
});

test('a streaming delta keeps the classification out of silent', async () => {
  const f = await runtimeFixture();
  try {
    const { runtime, rpc } = f;
    // A run is in flight: the runtime says it is not idle and is streaming.
    emit(rpc, { type: 'agent_start' });
    emit(rpc, { type: 'message_update', message: {} });
    const snapshot = runtime.snapshot();
    const health = classifyLiveness({ snapshot, task: { ...runningTask, status: 'running' }, now: Date.now() });
    assert.notEqual(health.state, 'silent', 'a streaming worker is not silent');
    assert.notEqual(health.lastEventAgoMs, null);
    // Without any event the same runtime would look silent once the threshold passes.
    const stale = classifyLiveness({ snapshot: { ...snapshot, lastEventAt: Date.now() - 120_000 }, task: { ...runningTask, status: 'running' }, now: Date.now() });
    assert.equal(stale.state, 'silent');
    // A running tool keeps it out of silent even with an old last event.
    emit(rpc, { type: 'tool_execution_start', toolCallId: 't1', toolName: 'bash' });
    const toolSnapshot = { ...runtime.snapshot(), lastEventAt: Date.now() - 600_000 };
    assert.equal(classifyLiveness({ snapshot: toolSnapshot, task: { ...runningTask, status: 'running' }, now: Date.now() }).state, 'tool');
    emit(rpc, { type: 'tool_execution_end', toolCallId: 't1', toolName: 'bash', isError: false, result: { content: [] } });
  } finally { await f.runtime.abortAndStop('fixture cleanup'); await fs.rm(f.base, { recursive: true, force: true }); }
});

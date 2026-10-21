// Peek and steer: Main and the human can look at a running worker and redirect it without cancelling.
// Offline: retained-state fixtures with a fake runtime that records the RPC it is asked to send.
import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { PairController } from '../src/controller.js';
import { PiRuntime } from '../src/actor-runtime.js';
import { loadConfig } from '../src/config.js';
import { configPaths } from '../src/config.js';
import { digest, PROTOCOL } from '../src/util.js';
import { normalizeTimeline } from '../src/timeline.js';
import { timelineLine } from '../src/ui.js';
import { registerMain } from '../src/main.js';
import { peekSchema, steerSchema, validate } from '../src/schema.js';

const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };
const liveSnap = { ready: true, idle: false, streaming: true, closed: false, fault: null, permission: false, compacting: false, summarizationRetrying: false, retrying: false, tool: null, lastEventAt: Date.now() };

async function fixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-peek-steer-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const controller = new PairController({
    config: loaded.config, cwd: repo, ownerSession: 'peek-steer-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser() {}, promptUser: async () => ({ cancelled: true }) },
  });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const task = { id: 'task-steer', workerId: id, requestId: 'req-steer', objective: 'Steer fixture', context: 'test', constraints: [],
    steps: [{ id: 's1', title: 'First step', instructions: 'Do the thing' }, { id: 's2', title: 'Second step', instructions: 'Then this' }],
    stepIndex: 0, planRevision: 1, attemptId: 'attempt-steer', attemptNumber: 1, status: 'running', leaseId: 'lease-steer',
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: { commands: [], requirePassing: false, timeoutMs: 120000 },
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    dispatchSettleSequence: 0, pendingSince: 0, abortRequested: false, interruption: '', previousStatus: '', completedAt: 0, cancelReason: '' };
  const record = { id, cwd: repo, repoRoot: repo, status: 'working', sessionId: 'sess-steer', sessionFile: path.join(controller.dir, 'sessions', 'w-steer.jsonl'),
    bound: { ...spec }, task, history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  // A retained transcript so peek has something to read without an RPC request.
  await fs.writeFile(record.sessionFile, [
    JSON.stringify({ type: 'session', version: 3, id: 'sess-steer', timestamp: new Date().toISOString(), cwd: repo }),
    JSON.stringify({ type: 'message', id: 'm1', parentId: null, timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'Reading the tests first.' }], timestamp: Date.now() } }),
  ].join('\n') + '\n');
  const baseSnap = await controller.evidence.capture(repo);
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(baseSnap);
  // A runtime that records the RPC it is asked to send and can refuse like a settled run would.
  const sent = [];
  let refuse = null;
  const runtime = { ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-steer', pid: 424246, dir: workerDir, sessionId: record.sessionId,
    ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], abortCurrent: async () => {}, abortAndStop: async () => {},
    waitIdle: async () => {}, snapshot: () => ({ ...liveSnap, lastEventAt: Date.now() }), revoke() {}, settleOrAbort(reason) { return this.abortCurrent(reason); },
    // Mirrors PiRuntime.steerCurrent: identity only, no fabricated token.
    async steerCurrent(identity, message) { if (refuse) throw new Error(refuse); sent.push({ identity, message }); return 'queued'; } };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
  await controller.writeAuthority(id, 'running');
  await controller.persist();
  return { controller, repo, task, record, runtime, workerDir, base, sent, refuse: message => { refuse = message; } };
}
async function cleanup(f) {
  f.runtime.closed = true;
  await f.controller.close().catch(() => {});
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}

test('a steer reaches the running lease through the fence and is recorded in the timeline', async () => {
  const f = await fixture();
  const { controller, task, sent } = f;
  try {
    const result = await controller.steer('worker', { taskId: task.id, message: 'Focus on the failing export', by: 'main' });
    assert.equal(result.queued, true);
    assert.equal(result.disposition, 'queued');
    assert.equal(result.steersLeft, 5, 'one of six steers for this step is spent');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].identity.attemptId, task.attemptId, 'the steer is addressed to the current attempt');
    assert.equal(sent[0].identity.leaseId, task.leaseId, 'and to the current lease');
    assert.match(sent[0].message, /^PAIR STEER \(from main\): Focus on the failing export/);
    assert.match(sent[0].message, /Stay within the authorized step and finish it with pair_report\./);
    assert.deepEqual(task.stepSteers, { index: 0, count: 1 });
    const note = normalizeTimeline(task.timeline).find(entry => entry.type === 'note');
    assert.equal(note.kind, 'steer');
    assert.equal(note.step, 1);
    assert.match(note.text, /main: Focus on the failing export/);
    assert.equal(timelineLine(note).text, '✎ steered: main: Focus on the failing export');
  } finally { await cleanup(f); }
});

test('a steer is refused unless the task is running under the current lease', async () => {
  const f = await fixture();
  const { controller, task, sent } = f;
  try {
    task.status = 'review';
    await assert.rejects(controller.steer('worker', { taskId: task.id, message: 'x' }), /Task is review; only a running step can be steered/);
    task.status = 'running';
    await assert.rejects(controller.steer('worker', { taskId: 'task-other', message: 'x' }), /Steer targets a different task/);
    // A task that is running but has no live activation cannot be steered either.
    controller.runtimeData.get(f.runtime).activationIntent = controller.intent('worker') + 99;
    await assert.rejects(controller.steer('worker', { taskId: task.id, message: 'x' }), /No current running lease|superseded activation/);
    controller.runtimeData.get(f.runtime).activationIntent = controller.intent('worker');
    // Nor can a task whose runtime handle is gone: there is nothing to write the steer into.
    controller.handles.delete('worker');
    await assert.rejects(controller.steer('worker', { taskId: task.id, message: 'x' }), /No current running lease to steer/);
    controller.handles.set('worker', f.runtime);
    // A settled run refuses the steer and does not spend the step's allowance.
    f.refuse('STEER_REFUSED: no accepted, unsettled activation to steer');
    const refused = await controller.steer('worker', { taskId: task.id, message: 'too late' });
    assert.equal(refused.queued, false);
    assert.match(refused.disposition, /STEER_REFUSED/);
    assert.equal(refused.steersLeft, 6, 'a refused steer costs nothing');
    assert.equal(task.stepSteers?.count ?? 0, 0);
    assert.equal(sent.length, 0, 'nothing was queued');
  } finally { await cleanup(f); }
});

test('steers are bounded per step and the count resets for the next step', async () => {
  const f = await fixture();
  const { controller, task } = f;
  try {
    for (let index = 0; index < 6; index++) {
      const result = await controller.steer('worker', { taskId: task.id, message: `steer ${index}` });
      assert.equal(result.queued, true, `steer ${index}`);
    }
    const over = await controller.steer('worker', { taskId: task.id, message: 'one too many' });
    assert.equal(over.queued, false);
    assert.equal(over.steersLeft, 0);
    assert.match(over.disposition, /step steer limit \(6\) reached/);
    assert.deepEqual(task.stepSteers, { index: 0, count: 6 });
    // A new step position starts its own allowance.
    task.stepIndex = 1; task.status = 'running';
    const next = await controller.steer('worker', { taskId: task.id, message: 'second step' });
    assert.equal(next.queued, true);
    assert.equal(next.steersLeft, 5);
    assert.deepEqual(task.stepSteers, { index: 1, count: 1 });
    // Messages are bounded.
    await assert.rejects(controller.steer('worker', { taskId: task.id, message: 'x'.repeat(4001) }), /at most 4000 characters/);
    await assert.rejects(controller.steer('worker', { taskId: task.id, message: '   ' }), /needs a message/);
    await assert.rejects(controller.steer('worker', { taskId: task.id, message: 'x', by: 'nobody' }), /main, human or watchdog/);
  } finally { await cleanup(f); }
});

test('peek returns bounded live data and makes no RPC request', async () => {
  const f = await fixture();
  const { controller, task } = f;
  try {
    let rpcCalls = 0;
    f.runtime.snapshot = () => { rpcCalls++; return { ...liveSnap, lastEventAt: Date.now() - 250 }; };
    const peeked = await controller.peek('worker');
    assert.equal(peeked.taskId, task.id);
    assert.equal(peeked.status, 'running');
    assert.deepEqual([peeked.step.index, peeked.step.total, peeked.step.title], [1, 2, 'First step']);
    assert.equal(peeked.liveness.state, 'streaming');
    assert.equal(peeked.steersLeft, 6);
    assert.equal(peeked.mainRecoveriesLeft, controller.config.maxMainRecoveries);
    assert.match(String(peeked.lastAssistantText), /Reading the tests first/);
    assert.ok(Array.isArray(peeked.recentActivity));
    assert.equal(typeof peeked.stepElapsedMs, 'number');
    // Only the in-process snapshot was read: no RPC command was issued.
    assert.ok(rpcCalls > 0, 'peek reads the snapshot');
    assert.equal(f.sent.length, 0, 'peek never steers');
    // The payload is bounded and carries no paths or pids.
    const text = JSON.stringify(peeked);
    assert.ok(text.length < 8000, `peek must stay bounded (was ${text.length} bytes)`);
    assert.equal(/\/var\/|\/tmp\/|424246/.test(text), false, 'no paths or pids');
    // A very long assistant tail is clipped.
    await fs.writeFile(f.record.sessionFile, [
      JSON.stringify({ type: 'session', version: 3, id: 'sess-steer', timestamp: new Date().toISOString(), cwd: f.repo }),
      JSON.stringify({ type: 'message', id: 'm2', parentId: null, timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'y'.repeat(9000) }], timestamp: Date.now() } }),
    ].join('\n') + '\n');
    const clipped = await controller.peek('worker');
    assert.ok(String(clipped.lastAssistantText).length <= 1500, 'the assistant tail is clipped to 1500 characters');
  } finally { await cleanup(f); }
});

test('a peek with no task is refused, and one with no retained transcript still answers', async () => {
  const f = await fixture();
  const { controller, record } = f;
  try {
    await fs.rm(record.sessionFile);
    const peeked = await controller.peek('worker');
    assert.equal(peeked.lastAssistantText, null, 'a missing transcript is not an error');
    record.task = null;
    await assert.rejects(controller.peek('worker'), /no task to look at/);
  } finally {
    // Restore a task so shutdown has nothing outstanding to explain.
    await cleanup(f);
  }
});

test('the runtime refuses a steer without an accepted, unsettled activation', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-steer-runtime-'));
  const cwd = await fs.realpath(base);
  const dir = path.join(cwd, 'worker');
  await fs.mkdir(dir);
  const sessionFile = path.join(dir, 'session.jsonl');
  const header = { type: 'session', version: 3, id: 'steer-session', cwd, timestamp: new Date().toISOString() };
  await fs.writeFile(sessionFile, JSON.stringify(header) + '\n');
  const entryPath = path.join(cwd, 'entry.js'); await fs.writeFile(entryPath, '');
  await fs.mkdir(path.join(cwd, 'agent'), { recursive: true });
  const spec = { id: 'worker', provider: 'fixture', model: 'model', effort: 'high', cwd: null, readOnly: false };
  class FakeRpc extends EventEmitter {
    pid = 12345; closed = false; model = { provider: spec.provider, id: spec.model }; thinkingLevel = spec.effort; calls = [];
    start() {}
    async send(command, fields) {
      this.calls.push({ command, fields });
      switch (command) {
        case 'get_state': return { model: { ...this.model }, thinkingLevel: this.thinkingLevel, sessionId: header.id, sessionFile, isStreaming: false, isCompacting: false, pendingMessageCount: 0, autoCompactionEnabled: true };
        case 'get_entries': return { entries: [], leafId: null };
        case 'get_available_thinking_levels': return { levels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] };
        case 'get_commands': return { commands: [{ name: 'pair-bridge', source: 'extension', sourceInfo: { path: entryPath } }] };
        case 'set_thinking_level': this.thinkingLevel = 'high'; return {};
        case 'steer': return { disposition: 'queued' };
        case 'prompt': {
          await fs.writeFile(path.join(dir, 'probe.json'), JSON.stringify({
            protocol: 1, pairVersion: '0.1.0', pid: this.pid, cwd, trusted: true, sessionId: header.id, sessionFile,
            nonce: 'nonce-steer-runtime', workerId: 'worker', ownerSession: 'main', ownerEpoch: 1, workerGeneration: 1,
            scope: 'offline steer fixture', model: { ...this.model, contextWindow: 100000 }, thinkingLevel: this.thinkingLevel,
            capabilities: { fabric: false, fovea: false, pairReport: true }, meshRoot: path.join(dir, 'fabric', 'mesh'),
            versions: {}, sourcePaths: [entryPath], context: null,
            native: { agentDir: path.join(cwd, 'agent'), note: 'fixture', piCompaction: {}, cacheWarming: 'off', fabricCompaction: {}, fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: true, prewalkConfigured: true },
            checkedAt: Date.now() }));
          return { disposition: 'handled' };
        }
        default: return {};
      }
    }
    async abortAndStop() { this.closed = true; this.emit('exit', { code: 0, signal: null, expected: true, error: null }); }
  }
  const rpc = new FakeRpc();
  const runtime = new PiRuntime({
    rpcOptions: { command: 'fixture-no-process', args: [], cwd, env: {}, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 },
    rpcFactory: () => rpc, ownerSession: 'main', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1,
    nonce: 'nonce-steer-runtime', dir, cwd, sessionFile, sessionId: header.id, freshSession: false,
    config: { runtime: { startupTimeoutMs: 3000, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 }, requirements: { fabric: false, fovea: false, prewalkDisabled: true, autoCompaction: true } },
    spec, entryPath, onWake() {}, isCurrent: () => true,
  });
  try {
    await runtime.ensureStarted();
    // No activation at all: a steer must not start a run.
    const idleActivation = /** @type {any} */ ({ taskId: 't', attemptId: 'a', leaseId: 'l', workerGeneration: 1 });
    // Either fence refuses it: the activation is not current, or there is no accepted run to steer.
    await assert.rejects(runtime.steer(idleActivation, 'do something'), /STEER_REFUSED|no accepted, unsettled activation|fence is no longer current/);
    assert.equal(rpc.calls.filter(call => call.command === 'steer').length, 0, 'nothing was sent');
    assert.equal(rpc.calls.filter(call => call.command === 'prompt').length, 1, 'only the startup bridge prompt ran; no work was started');
  } finally {
    await runtime.abortAndStop('fixture cleanup');
    await fs.rm(base, { recursive: true, force: true });
  }
});

/** A Main fixture: the registered extension, its tools and the command handler. */
async function mainFixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-peek-main-'));
  const cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  await fs.writeFile(configPaths(cwd).project, JSON.stringify({ version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }] }));
  const events = new Map(), tools = new Map(), commands = new Map(), notices = [], messages = [];
  const ctx = { cwd, mode: 'rpc', hasUI: true, isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => 'peek-main', getSessionFile: () => path.join(home, 'main.jsonl'), getBranch: () => [] },
    getContextUsage: () => undefined, model: { provider: 'main', id: 'native' }, modelRegistry: { getAvailable: () => [] },
    hasPendingMessages: () => false,
    ui: { select: async () => undefined, setStatus() {}, setWidget() {}, notify: (message, level) => notices.push({ message, level }), confirm: async () => true } };
  const pi = { on: (name, fn) => events.set(name, fn), registerCommand: (name, command) => commands.set(name, command), registerShortcut() {},
    registerTool: tool => tools.set(tool.name, tool), getAllTools: () => [], getCommands: () => [], appendEntry() {},
    getThinkingLevel: () => 'medium',
    sendMessage: (...args) => messages.push(args), sendUserMessage: (...args) => messages.push(args) };
  const main = registerMain(pi);
  try {
    await events.get('session_start')({}, ctx);
    const controller = main.getController(); assert.ok(controller);
    controller.rpcFactory = () => { throw Error('RPC spawn forbidden in the peek fixture'); };
    await run({ controller, events, tools, commands, messages, notices, ctx, cwd });
  } finally {
    const c = main.getController();
    if (c) { for (const id of Object.keys(c.state.workers)) delete c.state.workers[id]; c.handles.clear(); }
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

test('both Main tools are registered and described, and /pair steer exists for the human', () => mainFixture(async f => {
  assert.ok(f.tools.has('pair_peek'), 'pair_peek is registered');
  assert.ok(f.tools.has('pair_steer'), 'pair_steer is registered');
  assert.match(f.tools.get('pair_peek').description, /without disturbing it/);
  assert.match(f.tools.get('pair_steer').description, /running worker step/);
  // Schemas accept exactly the documented fields.
  assert.doesNotThrow(() => validate(peekSchema, { workerId: 'worker' }));
  assert.doesNotThrow(() => validate(steerSchema, { workerId: 'worker', taskId: 'task', message: 'go' }));
  assert.throws(() => validate(peekSchema, {}), /workerId is required/);
  assert.throws(() => validate(steerSchema, { workerId: 'worker', taskId: 'task' }), /message is required/);
  assert.throws(() => validate(steerSchema, { workerId: 'worker', taskId: 'task', message: 'x'.repeat(4001) }), /invalid string length/);
  // The human's own command is registered and speaks the same fence.
  // /pair reports problems as a notification rather than by throwing; the steer reaches the same fence.
  f.notices.length = 0;
  await f.commands.get('pair').handler('steer worker go faster', f.ctx);
  const reported = f.notices.find(notice => notice.level === 'error');
  assert.ok(reported, `the human's steer is refused visibly (got ${JSON.stringify(f.notices)})`);
  assert.match(String(reported.message), /no task to steer/);
  // The Main guide tells Main when to look and when to steer.
  const guide = /** @type {string} */ (await f.events.get('before_agent_start')({ systemPrompt: 'fixture' }, f.ctx).then(value => /** @type {any} */ (value)?.systemPrompt));
  assert.match(guide, /call pair_peek/);
  assert.match(guide, /Use pair_steer to redirect a running worker or to ask it to report now/);
  assert.match(guide, /Do not poll\./);
}));

/**
 * A controller whose worker is driven by a REAL PiRuntime over an in-process fake host, so controller.steer
 * exercises the runtime's activation fence exactly as production does.
 */
async function realRuntimeFixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-steer-real-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'high', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const controller = new PairController({
    config: loaded.config, cwd: repo, ownerSession: 'steer-real-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser() {}, promptUser: async () => ({ cancelled: true }) },
  });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  const sessionFile = path.join(controller.dir, 'sessions', 'w-real.jsonl');
  const header = { type: 'session', version: 3, id: 'real-steer-session', cwd: repo, timestamp: new Date().toISOString() };
  await fs.writeFile(sessionFile, JSON.stringify(header) + '\n');
  const entryPath = path.join(repo, '.pi', 'entry.js'); await fs.writeFile(entryPath, '');
  await fs.mkdir(path.join(repo, 'agent'), { recursive: true });
  /** @type {any[]} */ const calls = [];
  class FakeRpc extends EventEmitter {
    pid = 424247; closed = false; model = { provider: spec.provider, id: spec.model }; thinkingLevel = 'high';
    start() {}
    async send(command, fields = {}) {
      calls.push({ command, fields: structuredClone(fields) });
      switch (command) {
        case 'get_state': return { model: { ...this.model }, thinkingLevel: this.thinkingLevel, sessionId: header.id, sessionFile, isStreaming: false, isCompacting: false, pendingMessageCount: 0, autoCompactionEnabled: true };
        case 'get_entries': return { entries: [], leafId: null };
        case 'get_available_thinking_levels': return { levels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] };
        case 'get_commands': return { commands: [{ name: 'pair-bridge', source: 'extension', sourceInfo: { path: entryPath } }] };
        case 'set_thinking_level': this.thinkingLevel = 'high'; return {};
        case 'steer': return { disposition: 'queued' };
        case 'prompt': {
          await fs.writeFile(path.join(workerDir, 'probe.json'), JSON.stringify({
            protocol: 1, pairVersion: '0.1.0', pid: this.pid, cwd: repo, trusted: true, sessionId: header.id, sessionFile,
            nonce: 'nonce-real-steer', workerId: 'worker', ownerSession: controller.ownerSession, ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1,
            scope: 'offline steer fixture', model: { ...this.model, contextWindow: 100000 }, thinkingLevel: this.thinkingLevel,
            capabilities: { fabric: false, fovea: false, pairReport: true }, meshRoot: path.join(workerDir, 'fabric', 'mesh'),
            versions: {}, sourcePaths: [entryPath], context: null,
            native: { agentDir: path.join(repo, 'agent'), note: 'fixture', piCompaction: {}, cacheWarming: 'off', fabricCompaction: {}, fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: true, prewalkConfigured: true },
            checkedAt: Date.now() }));
          // A work prompt starts a run, and the host reports it the way Pi does.
          if (/^\/pair-bridge /.test(fields.message)) return { disposition: 'handled' };
          queueMicrotask(() => { this.emit('event', { type: 'agent_start' }); this.emit('event', { type: 'turn_start' }); });
          return { disposition: 'started' };
        }
        default: return {};
      }
    }
    async abortAndStop() { this.closed = true; this.emit('exit', { code: 0, signal: null, expected: true, error: null }); }
  }
  const rpc = new FakeRpc();
  const runtime = new PiRuntime({
    rpcOptions: { command: 'fixture-no-process', args: [], cwd: repo, env: {}, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 },
    rpcFactory: () => rpc, ownerSession: controller.ownerSession, ownerEpoch: controller.state.ownerEpoch, workerId: id, workerGeneration: 1,
    nonce: 'nonce-real-steer', dir: workerDir, cwd: repo, sessionFile, sessionId: header.id, freshSession: false,
    config: { ...controller.config, runtime: { ...controller.config.runtime, startupTimeoutMs: 3000, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 }, requirements: { fabric: false, fovea: false, prewalkDisabled: true, autoCompaction: true } },
    spec, entryPath, onWake() {}, isCurrent: () => true,
  });
  await runtime.ensureStarted();
  const task = { id: 'task-real-steer', workerId: id, requestId: 'req-real-steer', objective: 'Real steer fixture', context: 'test', constraints: [],
    steps: [{ id: 's1', title: 'First step', instructions: 'Do the thing' }, { id: 's2', title: 'Second step', instructions: 'Then this' }],
    stepIndex: 0, planRevision: 1, attemptId: 'attempt-real-steer', attemptNumber: 1, status: 'activating', leaseId: 'lease-real-steer',
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: { commands: [], requirePassing: false, timeoutMs: 120000 },
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    dispatchSettleSequence: 0, pendingSince: 0, abortRequested: false, interruption: '', previousStatus: '', completedAt: 0, cancelReason: '' };
  const record = { id, cwd: repo, repoRoot: repo, status: 'starting', sessionId: header.id, sessionFile, bound: { ...spec }, task,
    history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
  await controller.writeAuthority(id, 'running');
  await controller.persist();
  // A real, accepted, running activation — exactly the state production steers.
  const launch = { id, record, runtime, intent: controller.intent(id), configHash: controller.configHash() };
  const work = controller.reserveWork(launch, task);
  // The real preparation path, then the work prompt: an activation is only steerable once accepted.
  await runtime.prepareActivation(work.activation);
  await runtime.activate(work.activation, 'FABRIC PAIR WORK ORDER fixture');
  await controller.transaction(async () => { task.status = 'running'; task.updatedAt = Date.now(); record.status = 'working'; await controller.persist(); });
  return { controller, runtime, rpc, task, record, calls, base, work, repo };
}
async function cleanupReal(f) {
  await f.runtime.abortAndStop('fixture cleanup').catch(() => {});
  await f.controller.close().catch(() => {});
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}

test('controller.steer reaches a real PiRuntime mid-run and the host receives the steer', async () => {
  const f = await realRuntimeFixture();
  try {
    const result = await f.controller.steer('worker', { taskId: f.task.id, message: 'Also cover the error path', by: 'main' });
    assert.equal(result.queued, true, `steer must be queued, got: ${result.disposition}`);
    assert.equal(result.disposition, 'queued');
    assert.equal(result.steersLeft, 5);
    const steers = f.calls.filter(call => call.command === 'steer');
    assert.equal(steers.length, 1, 'the worker host received exactly one steer');
    assert.match(String(steers[0].fields.message), /^PAIR STEER \(from main\): Also cover the error path/);
    assert.match(String(steers[0].fields.message), /finish it with pair_report\./);
    assert.deepEqual(f.task.stepSteers, { index: 0, count: 1 });
  } finally { await cleanupReal(f); }
});

test('a steer for a previous attempt is refused and nothing reaches the host', async () => {
  const f = await realRuntimeFixture();
  try {
    // Rotate the task to a new attempt and lease: the runtime's current token still names the old one, so the
    // controller's identity no longer matches and the runtime must refuse.
    const previous = { attemptId: f.task.attemptId, leaseId: f.task.leaseId };
    f.task.attemptId = 'attempt-rotated';
    f.task.leaseId = 'lease-rotated';
    const result = await f.controller.steer('worker', { taskId: f.task.id, message: 'too late' });
    assert.equal(result.queued, false, 'a stale attempt must not be steerable');
    assert.match(result.disposition, /STEER_REFUSED|different task, attempt or lease/);
    assert.equal(f.calls.filter(call => call.command === 'steer').length, 0, 'no steer reached the host');
    assert.equal(result.steersLeft, 6, 'a refused steer costs nothing');
    // The previous identity is exactly what the runtime still holds.
    assert.equal(f.work.attemptId, previous.attemptId);
    assert.equal(f.work.leaseId, previous.leaseId);
  } finally { await cleanupReal(f); }
});

test('the runtime refuses a steer once the run has settled', async () => {
  const f = await realRuntimeFixture();
  try {
    // A settled run is no longer steerable, even with the right identity.
    f.rpc.emit('event', { type: 'agent_end' });
    f.rpc.emit('event', { type: 'agent_settled' });
    const result = await f.controller.steer('worker', { taskId: f.task.id, message: 'after it ended' });
    assert.equal(result.queued, false);
    assert.match(result.disposition, /STEER_REFUSED|no accepted, unsettled activation/);
    assert.equal(f.calls.filter(call => call.command === 'steer').length, 0, 'nothing was sent');
  } finally { await cleanupReal(f); }
});

test('a watchdog nudge (by: watchdog) reaches a real PiRuntime through the same fence', async () => {
  const f = await realRuntimeFixture();
  try {
    // A step that has run long: the watchdog nudges rather than waiting for the hard pause.
    const result = await f.controller.steer('worker', { taskId: f.task.id, message: '10 min on this step; Pair pauses it at 30 min. If the step is done, report a checkpoint.', by: 'watchdog' });
    assert.equal(result.queued, true, `the nudge must be queued through the real fence (got: ${result.disposition})`);
    const steers = f.calls.filter(call => call.command === 'steer');
    assert.equal(steers.length, 1, 'the host received the nudge as one steer');
    assert.match(String(steers[0].fields.message), /^PAIR STEER \(from watchdog\): 10 min on this step/);
    // The timeline records the watchdog as the author, not Main.
    const note = normalizeTimeline(f.task.timeline).find(entry => entry.type === 'note' && entry.kind === 'steer');
    assert.ok(note, 'the nudge is recorded');
    assert.match(note.text, /^watchdog: 10 min on this step/);
  } finally { await cleanupReal(f); }
});

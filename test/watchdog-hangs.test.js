// The watchdog's hang rungs: a tool that never ends, a frozen process, a stalled but responsive one.
// Offline: a controller fixture whose runtime is a fake that can hang, freeze or answer on demand.
import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PairController } from '../src/controller.js';
import { loadConfig } from '../src/config.js';
import { digest } from '../src/util.js';
import { classifyLiveness } from '../src/liveness.js';
import { workerState } from '../src/ui.js';

const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };

async function fixture({ control = {}, status = 'running' } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-hangs-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    control: { toolMaxMs: 60000, silentMs: 10000, pingTimeoutMs: 1000, ...control },
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const userNotices = [], mainNotices = [];
  const controller = new PairController({ config: loaded.config, cwd: repo, ownerSession: 'hangs-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser: (message, level = 'info') => userNotices.push({ message, level }), superviseMain: message => mainNotices.push(message), noticeMain: message => mainNotices.push(message), promptUser: async () => ({ cancelled: true }) } });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const task = { id: 'task-hangs', workerId: id, requestId: 'req-hangs', objective: 'Hangs fixture', context: 'test', constraints: [],
    steps: [{ id: 's1', title: 'Step', instructions: 'x' }, { id: 's2', title: 'Two', instructions: 'y' }], stepIndex: 0, planRevision: 1,
    attemptId: 'attempt-hangs', attemptNumber: 1, status, leaseId: 'lease-hangs',
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: { commands: [], requirePassing: false, timeoutMs: 120000 },
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    dispatchSettleSequence: 1, pendingSince: 0, abortRequested: false, interruption: '', previousStatus: '', completedAt: 0, cancelReason: '' };
  const record = { id, cwd: repo, repoRoot: repo, status: 'working', sessionId: 'sess-hangs', sessionFile: path.join(controller.dir, 'sessions', 'w.jsonl'),
    bound: { ...spec }, task, history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(record.sessionFile, JSON.stringify({ type: 'session', version: 3, id: 'sess-hangs', timestamp: new Date().toISOString(), cwd: repo }) + '\n');
  const baseSnap = await controller.evidence.capture(repo);
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(baseSnap);
  /** @type {Record<string, unknown>} */
  const snapshot = { pid: 424252, ready: true, idle: false, streaming: false, closed: false, fault: null, permission: false, compacting: false, summarizingRetrying: false, retrying: false,
    tool: null, accepted: true, lastEventAt: Date.now(), compactingSince: null, maintenanceCompaction: false };
  /** @type {{answer: boolean}} */ const host = { answer: true };
  const stopped = [];
  const aborts = [];
  const runtime = { ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-hangs', pid: 424252, dir: workerDir, sessionId: record.sessionId,
    ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [],
    async abortCurrent(reason) { aborts.push(reason); }, async abortAndStop() { this.closed = true; stopped.push(true); },
    async ping() { return host.answer; }, waitIdle: async () => {}, revoke() {}, settleOrAbort(reason) { return this.abortCurrent(reason); }, snapshot: () => ({ ...snapshot }) };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
  await controller.writeAuthority(id, 'running');
  await controller.persist();
  /** Bind the fake runtime to the live config, as a real one always is. */
  const rebind = () => { controller.runtimeData.set(runtime, { ...controller.runtimeData.get(runtime), configHash: controller.configHash(), specHash: digest(controller.state.workers[id].bound) }); };
  return { controller, repo, task, record, runtime, workerDir, userNotices, mainNotices, base, snapshot, host, stopped, aborts, rebind };
}
async function cleanup(f) {
  f.runtime.closed = true;
  await f.controller.close().catch(() => {});
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}
/** A tool that started the given number of milliseconds ago. */
const toolFor = (ms, name = 'bash') => ({ name, startedAt: Date.now() - ms });

test('a tool past control.toolMaxMs is stopped and the step re-activated with guidance', async () => {
  const f = await fixture();
  const { controller, task, snapshot, userNotices, aborts } = f;
  try {
    snapshot.tool = toolFor(120000); // two minutes, past the one-minute limit
    const resumed = [];
    controller.resume = async (id, recovery) => { resumed.push(recovery); return { taskId: task.id, status: 'activating' }; };
    f.rebind();
    assert.equal(await controller.watchdogHangs('worker', task), true);
    assert.ok(aborts.some(reason => /Tool bash ran 2 min; stopped by the watchdog/.test(reason)), 'the hung tool was aborted');
    assert.equal(resumed.length, 1, 'the step was re-activated');
    assert.equal(resumed[0].by, 'watchdog');
    assert.match(String(resumed[0].instruction), /The bash call was stopped after 2 min/);
    assert.match(String(resumed[0].instruction), /Do not run it again unchanged/);
    assert.ok(userNotices.some(n => n.level === 'warning' && /Tool bash ran 2 min/.test(n.message)), 'the human is told');
    assert.equal(task.watchdog.recoveries, 1);
  } finally { await cleanup(f); }
});

test('a tool under the limit is left alone, and a tool in flight is never called silent', async () => {
  const f = await fixture();
  const { controller, task, snapshot } = f;
  try {
    const resumed = [];
    controller.resume = async (...args) => { resumed.push(args); return { taskId: task.id }; };
    snapshot.tool = toolFor(30000); // under the limit
    f.rebind();
    assert.equal(await controller.watchdogHangs('worker', task), false);
    assert.equal(resumed.length, 0);
    // Long silence with a tool running is progress, so the silence rule must not fire either.
    snapshot.lastEventAt = Date.now() - 10 * 60000;
    assert.notEqual(classifyLiveness({ snapshot, task, now: Date.now() }).state, 'silent');
    assert.equal(await controller.watchdogHangs('worker', task), false);
    assert.equal(resumed.length, 0, 'a running tool is never treated as silence');
  } finally { await cleanup(f); }
});

test('a frozen worker (no answer to get_state) is stopped and re-activated', async () => {
  const f = await fixture();
  const { controller, task, snapshot, host, stopped, userNotices } = f;
  try {
    const resumed = [];
    controller.resume = async (id, recovery) => { resumed.push(recovery); return { taskId: task.id, status: 'activating' }; };
    // Silent past the window, and the process does not answer.
    snapshot.lastEventAt = Date.now() - 12000;
    host.answer = false;
    f.rebind();
    assert.equal(await controller.watchdogHangs('worker', task), true);
    assert.ok(stopped.length >= 1, 'the frozen process was stopped');
    assert.equal(resumed.length, 1, 'and the task re-activated');
    assert.equal(resumed[0].by, 'watchdog');
    assert.match(String(resumed[0].instruction), /stopped responding and was restarted/);
    assert.ok(userNotices.some(n => /stopped answering/.test(n.message)));
  } finally { await cleanup(f); }
});

test('a silent but responsive worker is pinged once, then aborted at 2 x silentMs', async () => {
  const f = await fixture();
  const { controller, task, snapshot, host, aborts } = f;
  try {
    const resumed = [], pings = [];
    controller.resume = async (id, recovery) => { resumed.push(recovery); return { taskId: task.id, status: 'activating' }; };
    const ping = f.runtime.ping;
    f.runtime.ping = async (...args) => { pings.push(Date.now()); return ping(...args); };
    host.answer = true;
    snapshot.lastEventAt = Date.now() - 12000; // past silentMs, not yet 2x
    f.rebind();
    assert.equal(await controller.watchdogHangs('worker', task), false, 'the first silent window only pings');
    assert.equal(pings.length, 1, 'exactly one ping for this silence episode');
    assert.equal(task.watchdog.pingedAt !== null, true, 'the ping is recorded');
    assert.equal(resumed.length, 0, 'nothing was aborted yet');
    // A second scan inside the same episode does not ping again.
    assert.equal(await controller.watchdogHangs('worker', task), false);
    assert.equal(pings.length, 1, 'one ping per silence episode');
    // Past twice the window, with the worker still answering, the request is stalled: abort and recover.
    snapshot.lastEventAt = Date.now() - 21000;
    task.watchdog.pingedAt = Date.now() - 11000; // the episode is old enough for a new window judgment
    assert.equal(await controller.watchdogHangs('worker', task), true);
    assert.ok(aborts.some(reason => /stalled request was aborted/.test(reason)), 'the stalled run was aborted');
    assert.equal(resumed.length, 1);
    assert.match(String(resumed[0].instruction), /previous model request stalled and was aborted/);
  } finally { await cleanup(f); }
});

test('once recoveries are spent the watchdog supervises Main instead of acting again', async () => {
  const f = await fixture({ control: { maxAutoRecoveriesPerStep: 0 } });
  const { controller, task, snapshot, mainNotices } = f;
  try {
    controller.config = { ...controller.config, mainSupervision: true };
    const resumed = [];
    controller.resume = async (...args) => { resumed.push(args); return { taskId: task.id }; };
    snapshot.tool = toolFor(120000);
    const before = mainNotices.length;
    await controller.watchdogHangs('worker', task);
    assert.equal(resumed.length, 0, 'the recovery budget is spent, so nothing was resumed');
    assert.ok(mainNotices.length > before, 'Main is supervised instead');
    assert.match(mainNotices.at(-1), /FABRIC PAIR SUPERVISION/);
    assert.match(mainNotices.at(-1), /per-step recovery budget is spent/);
  } finally { await cleanup(f); }
});

test('none of it fires while a report settles, a checkpoint is frozen, or a latch exists', async () => {
  const f = await fixture();
  const { controller, task, snapshot, aborts } = f;
  try {
    const resumed = [];
    controller.resume = async (...args) => { resumed.push(args); return { taskId: task.id }; };
    snapshot.tool = toolFor(120000);
    f.rebind();
    // A pending report owns the worker.
    task.pendingReport = { reportId: 'report-hangs', payload: { kind: 'checkpoint' } };
    assert.equal(await controller.watchdogHangs('worker', task), false);
    // A checkpoint being frozen or verified owns it too.
    delete task.pendingReport;
    controller.runtimeData.get(f.runtime).verificationAbort = new AbortController();
    assert.equal(await controller.watchdogHangs('worker', task), false);
    // And a settling worker record.
    delete controller.runtimeData.get(f.runtime).verificationAbort;
    f.record.status = 'settling';
    assert.equal(await controller.watchdogHangs('worker', task), false);
    assert.equal(aborts.length, 0, 'the watchdog never touched a settling or freezing worker');
    assert.equal(resumed.length, 0);
  } finally { await cleanup(f); }
});

test('the runtime ping answers through the control path and reports a dead process', async () => {
  // A minimal double for the RPC, exercising PiRuntime.ping's own contract.
  const { PiRuntime } = await import('../src/actor-runtime.js');
  const { EventEmitter } = await import('node:events');
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-ping-'));
  const cwd = await fs.realpath(base);
  const dir = path.join(cwd, 'worker'); await fs.mkdir(dir);
  const entryPath = path.join(cwd, 'entry.js'); await fs.writeFile(entryPath, '');
  const sessionFile = path.join(dir, 'session.jsonl');
  const header = { type: 'session', version: 3, id: 'ping-session', cwd, timestamp: new Date().toISOString() };
  await fs.writeFile(sessionFile, JSON.stringify(header) + '\n');
  let answer = true;
  const calls = [];
  class FakeRpc extends EventEmitter {
    pid = 424253; closed = false;
    start() {}
    async send(command, fields = {}) {
      calls.push(command);
      if (command === 'get_state') {
        if (!answer) throw new Error('no answer');
        return { model: { provider: 'fixture', id: 'model' }, thinkingLevel: 'high', sessionId: header.id, sessionFile, isStreaming: false, isCompacting: false, pendingMessageCount: 0, autoCompactionEnabled: true };
      }
      if (command === 'get_entries') return { entries: [], leafId: null };
      if (command === 'get_available_thinking_levels') return { levels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] };
      if (command === 'get_commands') return { commands: [{ name: 'pair-bridge', source: 'extension', sourceInfo: { path: entryPath } }] };
      if (command === 'set_thinking_level') return {};
      if (command === 'prompt') {
        await fs.writeFile(path.join(dir, 'probe.json'), JSON.stringify({ protocol: 1, pairVersion: '0.1.0', pid: this.pid, cwd, trusted: true, sessionId: header.id, sessionFile,
          nonce: 'nonce-ping', workerId: 'worker', ownerSession: 'main', ownerEpoch: 1, workerGeneration: 1, scope: 'ping fixture',
          model: { provider: 'fixture', id: 'model', contextWindow: 100000 }, thinkingLevel: 'high', capabilities: { fabric: false, fovea: false, pairReport: true },
          meshRoot: path.join(dir, 'fabric', 'mesh'), versions: {}, sourcePaths: [entryPath], context: null,
          native: { agentDir: path.join(cwd, 'agent'), note: 'fixture', piCompaction: {}, cacheWarming: 'off', fabricCompaction: {}, fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: true, prewalkConfigured: true },
          checkedAt: Date.now() }));
        return { disposition: 'handled' };
      }
      return {};
    }
    async abortAndStop() { this.closed = true; this.emit('exit', { code: 0, signal: null, expected: true, error: null }); }
  }
  const rpc = new FakeRpc();
  const runtime = new PiRuntime({
    rpcOptions: { command: 'fixture-no-process', args: [], cwd, env: {}, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 },
    rpcFactory: () => rpc, ownerSession: 'main', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1, nonce: 'nonce-ping',
    dir, cwd, sessionFile, sessionId: header.id, freshSession: false,
    config: { runtime: { startupTimeoutMs: 3000, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 }, requirements: { fabric: false, fovea: false, prewalkDisabled: true, autoCompaction: true } },
    spec: { id: 'worker', provider: 'fixture', model: 'model', effort: 'high', cwd: null, readOnly: false }, entryPath, onWake() {}, isCurrent: () => true,
  });
  try {
    await runtime.ensureStarted();
    answers: {
      const before = calls.filter(command => command === 'get_state').length;
      assert.equal(await runtime.ping(500), true, 'a live process answers');
      assert.ok(calls.filter(command => command === 'get_state').length > before, 'the ping asks get_state');
    }
    answer = false;
    assert.equal(await runtime.ping(500), false, 'a process that does not answer reports false instead of throwing');
  } finally { await runtime.abortAndStop('fixture cleanup'); await fs.rm(base, { recursive: true, force: true }); }
});

test('the live badge shows how long a running tool has been running', () => {
  const now = Date.now();
  /** @param {{name: string, forMs: number}} tool */
  const stateOf = tool => workerState({ enabled: true, autoDeliverReports: true, waitingReports: 0, mainPhase: null,
    workers: [{ id: 'worker', model: 'p/m', effort: 'low', readOnly: false, status: 'working', cwd: '/tmp/repo', workspaceGit: true,
      task: { id: 'task-hangs', attemptId: 'a1', attemptNumber: 1, objective: 'Hangs', status: 'running', step: 1, steps: 2, revisions: 0, reportId: null, reportKind: null, lastDecision: null,
        checkpointHash: null, reportedCost: null, startedAt: now, turns: 1, stepList: [{ id: 's1', title: 'Step', state: 'active' }, { id: 's2', title: 'Two', state: 'todo' }],
        stepRevisions: 0, limits: { maxRevisions: 20, maxRevisionsPerStep: 3, maxReportedCostUsd: null, maxOutputTokens: null }, limitNotice: null, updatedAt: now, lastVerification: [], timeline: [] },
      observation: null, usage: null, lastExchange: null, error: null, pendingConfiguration: false,
      liveness: { state: 'tool', lastEventAgoMs: 3000, tool, retry: null, lastError: null, stepElapsedMs: 900000, stepTimeoutMs: 1800000, context: null } }] },
    { workers: [{ id: 'worker', model: 'p/m', effort: 'low', readOnly: false, status: 'working', cwd: '/tmp/repo', workspaceGit: true,
      task: { id: 'task-hangs', attemptId: 'a1', attemptNumber: 1, objective: 'Hangs', status: 'running', step: 1, steps: 2, revisions: 0, reportId: null, reportKind: null, lastDecision: null,
        checkpointHash: null, reportedCost: null, startedAt: now, turns: 1, stepList: [{ id: 's1', title: 'Step', state: 'active' }, { id: 's2', title: 'Two', state: 'todo' }],
        stepRevisions: 0, limits: { maxRevisions: 20, maxRevisionsPerStep: 3, maxReportedCostUsd: null, maxOutputTokens: null }, limitNotice: null, updatedAt: now, lastVerification: [], timeline: [] },
      observation: null, usage: null, lastExchange: null, error: null, pendingConfiguration: false,
      liveness: { state: 'tool', lastEventAgoMs: 3000, tool, retry: null, lastError: null, stepElapsedMs: 900000, stepTimeoutMs: 1800000, context: null } }] }.workers[0], null, now);
  // A hung tool must be visible before the watchdog stops it, so the badge carries its duration.
  assert.match(JSON.stringify(stateOf({ name: 'bash', forMs: 900000 })), /running bash 15m/);
  assert.match(JSON.stringify(stateOf({ name: 'read', forMs: 42000 })), /running read 42s/);
  // A running tool is never shown as a stale worker.
  assert.doesNotMatch(JSON.stringify(stateOf({ name: 'bash', forMs: 900000 })), /no activity/, 'a long tool is progress, not silence');
});

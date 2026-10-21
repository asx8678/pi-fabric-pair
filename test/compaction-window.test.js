// Between-run compaction: Fabric compacts right after a run settles, and Pair must let it finish instead of
// treating it as stray agent work. Driven through a real PiRuntime with an in-process fake host.
import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { PiRuntime } from '../src/actor-runtime.js';
import { PairController } from '../src/controller.js';
import { loadConfig, validateConfig } from '../src/config.js';
import { digest } from '../src/util.js';
import { staleWorkers } from '../src/ui.js';

const THINKING = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };

/**
 * A started PiRuntime over an in-process fake host. The host records every command it receives, so a test can
 * assert that nothing was aborted. A between-lease compaction is simulated by emitting the events Pi would.
 */
async function runtimeFixture({ compactionMaxMs = 600000 } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-compaction-'));
  const cwd = await fs.realpath(base);
  const dir = path.join(cwd, 'worker');
  await fs.mkdir(dir, { recursive: true });
  const entryPath = path.join(cwd, 'entry.js');
  await fs.writeFile(entryPath, '');
  const sessionFile = path.join(dir, 'session.jsonl');
  const header = { type: 'session', version: 3, id: 'compaction-session', cwd, timestamp: new Date().toISOString() };
  /** @type {{id: string, parentId: string | null, type: string, [key: string]: unknown}[]} */
  const entries = [];
  const save = () => fs.writeFile(sessionFile, [header, ...entries].map(entry => JSON.stringify(entry)).join('\n') + '\n');
  await save();
  let nextId = 0;
  /** @param {Record<string, unknown>} data */
  const append = data => { const entry = { id: `e-${++nextId}`, parentId: entries.at(-1)?.id ?? null, timestamp: new Date().toISOString(), ...data }; entries.push(entry); return entry; };
  const spec = { id: 'worker', provider: 'fixture', model: 'model', effort: 'high', cwd: null, readOnly: false };
  const calls = [];
  class FakeRpc extends EventEmitter {
    pid = 424249; closed = false; model = { provider: spec.provider, id: spec.model }; thinkingLevel = 'high';
    start() {}
    async send(command, fields = {}) {
      calls.push({ command, fields: structuredClone(fields) });
      switch (command) {
        case 'get_state': return { model: { ...this.model }, thinkingLevel: this.thinkingLevel, sessionId: header.id, sessionFile, isStreaming: false, isCompacting: false, pendingMessageCount: 0, autoCompactionEnabled: true };
        case 'get_entries': {
          const at = typeof fields.since === 'string' ? entries.findIndex(entry => entry.id === fields.since) : -1;
          return { entries: structuredClone(entries.slice(at + 1)), leafId: entries.at(-1)?.id ?? null };
        }
        case 'get_available_thinking_levels': return { levels: THINKING };
        case 'get_commands': return { commands: [{ name: 'pair-bridge', source: 'extension', sourceInfo: { path: entryPath } }] };
        case 'set_thinking_level': this.thinkingLevel = 'high'; return {};
        case 'prompt': {
          await fs.writeFile(path.join(dir, 'probe.json'), JSON.stringify({
            protocol: 1, pairVersion: '0.1.0', pid: this.pid, cwd, trusted: true, sessionId: header.id, sessionFile,
            nonce: 'nonce-compaction', workerId: 'worker', ownerSession: 'main', ownerEpoch: 1, workerGeneration: 1,
            scope: 'offline compaction fixture', model: { ...this.model, contextWindow: 100000 }, thinkingLevel: this.thinkingLevel,
            capabilities: { fabric: false, fovea: false, pairReport: true }, meshRoot: path.join(dir, 'fabric', 'mesh'),
            versions: {}, sourcePaths: [entryPath], context: null,
            native: { agentDir: path.join(cwd, 'agent'), note: 'fixture', piCompaction: {}, cacheWarming: 'off', fabricCompaction: {}, fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: true, prewalkConfigured: true },
            checkedAt: Date.now() }));
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
  const config = { runtime: { startupTimeoutMs: 3000, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 }, requirements: { fabric: false, fovea: false, prewalkDisabled: true, autoCompaction: true }, control: { compactionMaxMs } };
  const runtime = new PiRuntime({
    rpcOptions: { command: 'fixture-no-process', args: [], cwd, env: {}, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 },
    rpcFactory: () => rpc, ownerSession: 'main', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1,
    nonce: 'nonce-compaction', dir, cwd, sessionFile, sessionId: header.id, freshSession: false,
    config, spec, entryPath, onWake() {}, isCurrent: () => true,
  });
  await runtime.ensureStarted();
  return { runtime, rpc, entries, append, save, calls, base, sessionFile, cwd, dir, entryPath, spec };
}
async function cleanup(f) {
  await f.runtime.abortAndStop('fixture cleanup').catch(() => {});
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}

/**
 * A second, independent PiRuntime over an existing session: used to prove retained-history verification accepts
 * (or refuses) what another lease left behind.
 */
async function verifyOver({ sessionFile, cwd, dir, entryPath, spec, control }) {
  const header = JSON.parse((await fs.readFile(sessionFile, 'utf8')).split('\n')[0]);
  /** @type {{entries: unknown[], leafId: string | null}} */
  let state = { entries: [], leafId: null };
  const lines = (await fs.readFile(sessionFile, 'utf8')).split('\n').filter(Boolean).slice(1).map(line => JSON.parse(line));
  state = { entries: lines, leafId: lines.at(-1)?.id ?? null };
  class FakeRpc extends EventEmitter {
    pid = 424250; closed = false; model = { provider: spec.provider, id: spec.model }; thinkingLevel = 'high';
    start() {}
    async send(command, fields = {}) {
      switch (command) {
        case 'get_state': return { model: { ...this.model }, thinkingLevel: this.thinkingLevel, sessionId: header.id, sessionFile, isStreaming: false, isCompacting: false, pendingMessageCount: 0, autoCompactionEnabled: true };
        case 'get_entries': {
          const at = typeof fields.since === 'string' ? state.entries.findIndex(entry => entry.id === fields.since) : -1;
          if (typeof fields.since === 'string' && at < 0) throw new Error(`Unknown entry ${fields.since}`);
          return { entries: structuredClone(state.entries.slice(at + 1)), leafId: state.leafId };
        }
        case 'get_available_thinking_levels': return { levels: THINKING };
        case 'get_commands': return { commands: [{ name: 'pair-bridge', source: 'extension', sourceInfo: { path: entryPath } }] };
        case 'set_thinking_level': this.thinkingLevel = 'high'; return {};
        case 'set_model': this.model = { provider: fields.provider, id: fields.modelId }; return { ...this.model };
        case 'prompt': {
          await fs.writeFile(path.join(dir, 'probe.json'), JSON.stringify({
            protocol: 1, pairVersion: '0.1.0', pid: this.pid, cwd, trusted: true, sessionId: header.id, sessionFile,
            nonce: 'nonce-verify', workerId: 'worker', ownerSession: 'main', ownerEpoch: 1, workerGeneration: 2,
            scope: 'offline verify fixture', model: { ...this.model, contextWindow: 100000 }, thinkingLevel: this.thinkingLevel,
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
    rpcFactory: () => rpc, ownerSession: 'main', ownerEpoch: 1, workerId: 'worker', workerGeneration: 2,
    nonce: 'nonce-verify', dir, cwd, sessionFile, sessionId: header.id, freshSession: false,
    config: { runtime: { startupTimeoutMs: 3000, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 }, requirements: { fabric: false, fovea: false, prewalkDisabled: true, autoCompaction: true }, control },
    spec, entryPath, onWake() {}, isCurrent: () => true,
  });
  // Report the verification outcome, then always dispose the runtime.
  try { const readiness = await runtime.ensureStarted(); return { ok: true, readiness }; }
  catch (error) { return { ok: false, error }; }
  finally { await runtime.abortAndStop('verify cleanup').catch(() => {}); }
}
/** A compaction entry as Pi writes it. */
const compactionEntry = summary => ({ type: 'compaction', summary, tokensBefore: 200000, firstKeptEntryId: '' });

test('control.compactionMaxMs is configurable, bounded, and stays out of configHash()', () => {
  const config = validateConfig({ version: 2 });
  assert.equal(config.control.compactionMaxMs, 600000, 'default allowance');
  assert.equal(validateConfig({ version: 2, control: { compactionMaxMs: 0 } }).control.compactionMaxMs, 0, '0 turns the allowance off');
  assert.throws(() => validateConfig({ version: 2, control: { compactionMaxMs: -1 } }), /control.compactionMaxMs must be 0–86400000/);
  assert.throws(() => validateConfig({ version: 2, control: { compactionMaxMs: 1.5 } }), /control.compactionMaxMs/);
});

test('a compaction after the run settles finishes instead of being aborted', async () => {
  const f = await runtimeFixture();
  try {
    const { runtime, rpc, calls } = f;
    // A run settled between leases, then Fabric compacts.
    rpc.emit('event', { type: 'agent_settled' });
    rpc.emit('event', { type: 'compaction_start', reason: 'threshold' });
    // Let any scheduled microtasks run: the old code would have sent clear_queue + abort here.
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(calls.filter(call => call.command === 'abort').length, 0, 'the maintenance compaction was not aborted');
    assert.equal(calls.filter(call => call.command === 'clear_queue').length, 0);
    const snapshot = runtime.snapshot();
    assert.equal(snapshot.compacting, true, 'the compaction is tracked');
    assert.equal(snapshot.maintenanceCompaction, true, 'and marked as maintenance');
    assert.equal(snapshot.idle, false, 'lifecycle idle stays false until it ends');
    // No "began without a Pair lease" warning was raised for it.
    const notices = runtime.takeObservations().filter(event => event.type === 'notify');
    assert.equal(notices.some(note => /began without a Pair lease/.test(String(note.error))), false, 'compaction is not reported as stray work');
    // It ends on its own, and the runtime is idle again.
    rpc.emit('event', { type: 'compaction_end', reason: 'threshold', aborted: false, willRetry: false });
    assert.equal(runtime.snapshot().compacting, false);
    assert.equal(runtime.snapshot().maintenanceCompaction, false);
    assert.equal(calls.filter(call => call.command === 'abort').length, 0);
  } finally { await cleanup(f); }
});

test('agent work outside a lease is still rejected', async () => {
  const f = await runtimeFixture();
  try {
    const { rpc, calls } = f;
    rpc.emit('event', { type: 'agent_settled' });
    // A stray run after settle is exactly what the guard exists for.
    rpc.emit('event', { type: 'agent_start' });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(calls.filter(call => call.command === 'abort').length >= 1, 'the stray run was aborted');
    const notices = f.runtime.takeObservations().filter(event => event.type === 'notify');
    assert.ok(notices.some(note => /agent start began without a Pair lease/.test(String(note.error))), 'and reported');
  } finally { await cleanup(f); }
});

test('a tool start outside a lease is still rejected', async () => {
  const f = await runtimeFixture();
  try {
    const { rpc, calls } = f;
    rpc.emit('event', { type: 'agent_settled' });
    rpc.emit('event', { type: 'tool_execution_start', toolCallId: 't1', toolName: 'bash' });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(calls.filter(call => call.command === 'abort').length >= 1, 'a stray tool is aborted');
  } finally { await cleanup(f); }
});

test('control.compactionMaxMs = 0 restores the old rejection of between-run compaction', async () => {
  const f = await runtimeFixture({ compactionMaxMs: 0 });
  try {
    const { rpc, calls } = f;
    rpc.emit('event', { type: 'agent_settled' });
    rpc.emit('event', { type: 'compaction_start', reason: 'threshold' });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(calls.filter(call => call.command === 'abort').length >= 1, 'with the allowance off a maintenance compaction is refused as before');
  } finally { await cleanup(f); }
});

test('a compaction past control.compactionMaxMs is stopped with a warning', async () => {
  const f = await runtimeFixture({ compactionMaxMs: 120 });
  try {
    const { runtime, rpc, calls } = f;
    rpc.emit('event', { type: 'agent_settled' });
    rpc.emit('event', { type: 'compaction_start', reason: 'threshold' });
    assert.equal(calls.filter(call => call.command === 'abort').length, 0, 'allowed at first');
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.ok(calls.filter(call => call.command === 'abort').length >= 1, 'past the bound it is stopped');
    const notices = runtime.takeObservations().filter(event => event.type === 'notify');
    assert.ok(notices.some(note => /ran longer than 0s|ran longer than/.test(String(note.error)) && note.notifyType === 'warning'), 'the human is warned');
  } finally { await cleanup(f); }
});

test('retained-history verification accepts a between-lease compaction and rejects any other entry', async () => {
  const f = await runtimeFixture();
  try {
    const { runtime, rpc, entries, append, save, sessionFile, cwd, dir, entryPath, spec } = f;
    // A first lease settles; then Fabric appends a compaction entry between leases.
    rpc.emit('event', { type: 'agent_settled' });
    append(compactionEntry('summarised the earlier work'));
    await save();
    rpc.emit('event', { type: 'compaction_start', reason: 'threshold' });
    rpc.emit('event', { type: 'compaction_end', reason: 'threshold', aborted: false, willRetry: false });
    assert.equal(runtime.snapshot().compacting, false, 'the compaction ended');
    assert.ok(entries.some(entry => entry.type === 'compaction'), 'the compaction entry is in the retained history');
    // A fresh runtime over that same session verifies it: a between-lease compaction is a legitimate Pi entry.
    const verified = await verifyOver({ sessionFile, cwd, dir, entryPath, spec, control: { compactionMaxMs: 600000 } });
    assert.equal(verified.ok, true, `retained-history verification accepts a between-lease compaction (got ${verified.ok ? '' : verified.error.message})`);
    // Any other kind of unexpected entry is still refused.
    entries[0].message = { role: 'user', content: [{ type: 'text', text: 'tampered' }], timestamp: Date.now() };
    entries.push({ id: 'rogue', parentId: entries.at(-1)?.id ?? null, timestamp: new Date().toISOString(), type: 'session_replaced' });
    await save();
    const rejected = await verifyOver({ sessionFile, cwd, dir, entryPath, spec, control: { compactionMaxMs: 600000 } });
    assert.equal(rejected.ok, false, 'an unexpected entry is still refused');
    assert.match(String(rejected.error.message), /Unverifiable session entry type|Unexpected session initialization entry|unexpected|differs|Invalid|not allowed/);
  } finally { await cleanup(f); }
});

/** A controller fixture whose worker runs under a fake runtime, for the compaction windows. */
async function controllerFixture({ control = {}, status = 'awaiting_settle' } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-compaction-ctl-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    control,
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const userNotices = [];
  const controller = new PairController({ config: loaded.config, cwd: repo, ownerSession: 'compaction-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser: (message, level = 'info') => userNotices.push({ message, level }), promptUser: async () => ({ cancelled: true }) } });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const task = { id: 'task-compaction', workerId: id, requestId: 'req-compaction', objective: 'Compaction fixture', context: 'test', constraints: [],
    steps: [{ id: 's1', title: 'Step', instructions: 'x' }, { id: 's2', title: 'Step two', instructions: 'y' }], stepIndex: 0, planRevision: 1,
    attemptId: 'attempt-compaction', attemptNumber: 1, status, leaseId: 'lease-compaction',
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: { commands: [], requirePassing: false, timeoutMs: 120000 },
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    dispatchSettleSequence: 1, pendingSince: Date.now() - 60000, abortRequested: false, interruption: '', previousStatus: '', completedAt: 0, cancelReason: '',
    watchdog: { step: 0, recoveries: 0, noReportNudges: 1, steers: 0, nudged: true, nudgedAttemptId: 'attempt-compaction', providerWaits: 0, retryAt: null, retryReason: null } };
  const record = { id, cwd: repo, repoRoot: repo, status: 'settling', sessionId: 'sess-compaction', sessionFile: path.join(controller.dir, 'sessions', 'w.jsonl'),
    bound: { ...spec }, task, history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(record.sessionFile, JSON.stringify({ type: 'session', version: 3, id: 'sess-compaction', timestamp: new Date().toISOString(), cwd: repo }) + '\n');
  const baseSnap = await controller.evidence.capture(repo);
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(baseSnap);
  /** @type {Record<string, unknown>} */
  const snapshot = { pid: 424251, ready: true, idle: false, streaming: false, closed: false, fault: null, permission: false, compacting: false, summarizingRetrying: false, retrying: false, tool: null, accepted: true, lastEventAt: Date.now(), compactingSince: null, maintenanceCompaction: false };
  const runtime = { ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-compaction', pid: 424251, dir: workerDir, sessionId: record.sessionId,
    ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], abortCurrent: async () => {}, async abortAndStop() { this.closed = true; },
    waitIdle: async () => {}, revoke() {}, settleOrAbort(reason) { return this.abortCurrent(reason); }, snapshot: () => ({ ...snapshot }) };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
  await controller.writeAuthority(id, 'waiting');
  await controller.persist();
  return { controller, repo, task, record, runtime, workerDir, userNotices, base, snapshot };
}
async function cleanupController(f) {
  f.runtime.closed = true;
  await f.controller.close().catch(() => {});
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}
/** Mark the fake runtime as compacting, between leases. */
const startCompaction = (f, since = Date.now()) => { f.snapshot.compacting = true; f.snapshot.compactingSince = since; f.snapshot.maintenanceCompaction = true; };
const endCompaction = f => { f.snapshot.compacting = false; f.snapshot.compactingSince = null; f.snapshot.maintenanceCompaction = false; };

test('the report settle clocks do not interrupt while a between-run compaction runs', async () => {
  const f = await controllerFixture();
  const { controller, task, record, userNotices } = f;
  try {
    // A report is waiting to settle, well past both the 5 s and the 30 s clocks.
    task.pendingReport = { reportId: 'report-compaction', payload: { kind: 'checkpoint' } };
    startCompaction(f);
    const jobs = [];
    await controller.transaction(() => controller.scan(jobs));
    assert.equal(task.status, 'awaiting_settle', 'compaction holds the settle clocks');
    assert.equal(task.abortRequested, false, 'no settle abort was requested');
    assert.equal(jobs.some(job => /contain/.test(String(job))), false);
    assert.equal(userNotices.some(n => /did not settle/.test(n.message)), false, 'no "did not settle" interrupt');
    // The pause is what this test proves: each scan tick during a compaction leaves the settle clocks untouched,
    // however stale they are. The scan's own reportCurrent gate is unchanged by this step.
    for (let tick = 0; tick < 3; tick++) {
      const again = [];
      await controller.transaction(() => controller.scan(again));
      assert.equal(task.abortRequested, false, `no settle abort on tick ${tick}`);
      assert.equal(task.status, 'awaiting_settle', `still settling on tick ${tick}`);
    }
    assert.equal(userNotices.some(n => /did not settle/.test(n.message)), false, 'the compaction never triggers the interrupt');
    // Once the compaction ends the controller no longer reports it as held.
    endCompaction(f);
    assert.equal(controller.compactionWithinBound(f.runtime), false, 'nothing left to wait for');
  } finally { await cleanupController(f); }
});

test('checkpoint freezing waits for a running compaction', async () => {
  const f = await controllerFixture({ status: 'running' });
  const { controller, runtime } = f;
  try {
    startCompaction(f);
    let finished = false;
    const waiting = controller.awaitCompaction(runtime, 5000).then(() => { finished = true; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(finished, false, 'the freeze keeps waiting while the compaction runs');
    endCompaction(f);
    await waiting;
    assert.equal(finished, true, 'it returns once the compaction ends');
  } finally { await cleanupController(f); }
});

test('the wait is bounded by control.compactionMaxMs', async () => {
  const f = await controllerFixture({ status: 'running', control: { compactionMaxMs: 300 } });
  const { controller, runtime } = f;
  try {
    startCompaction(f);
    const started = Date.now();
    await controller.awaitCompaction(runtime);
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 250 && elapsed < 2000, `waits about the configured bound, not forever (waited ${elapsed}ms)`);
    // A compaction already past the bound is not waited for at all.
    assert.equal(controller.compactionWithinBound(runtime), false, 'past the bound the controller stops waiting');
  } finally { await cleanupController(f); }
});

test('activation waits for compaction before sending the next prompt', async () => {
  const f = await controllerFixture({ status: 'paused' });
  const { controller, task, runtime, record } = f;
  try {
    startCompaction(f);
    const order = [];
    const realAwait = controller.awaitCompaction.bind(controller);
    controller.awaitCompaction = async (...args) => { order.push('wait'); await realAwait(...args); order.push('ready'); };
    let prompted = false;
    Object.assign(runtime, {
      reserveActivation: identity => Object.freeze({ ...identity, serial: 1 }), activationCurrent: () => true,
      ensureStarted: async () => ({ probe: null, state: { sessionId: record.sessionId, sessionFile: record.sessionFile } }),
      prepareActivation: async () => { assert.equal(prompted, false, 'the prompt is not sent during compaction'); return { probe: null }; },
      activate: async () => { prompted = true; },
    });
    task.status = 'running';
    const launch = { id: 'worker', record, runtime, intent: controller.intent('worker'), configHash: controller.configHash() };
    const work = controller.reserveWork(launch, task);
    const activating = controller.activate(work, 'FIXTURE WORK ORDER');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(prompted, false, 'nothing was sent while compacting');
    endCompaction(f);
    await activating;
    assert.equal(prompted, true, 'the prompt is sent once compaction ended');
    assert.deepEqual(order, ['wait', 'ready'], 'the activation waited first');
  } finally { await cleanupController(f); }
});

test('the dashboard says "compacting its context" between runs, not idle or stale', async () => {
  // A live worker whose run has settled and whose compaction is running: the task is still open.
  const f = await controllerFixture({ status: 'running' });
  try {
    f.record.status = 'working';
    startCompaction(f, Date.now() - 120000);
    const liveness = f.controller.summary().workers[0].liveness;
    assert.equal(liveness.state, 'compacting', 'compacting wins over streaming and idle for an open task');
    // And the stale warning never calls it stale.
    const stale = staleWorkers({ workers: [{ id: 'worker', status: 'working', model: 'p/m', observation: { at: Date.now() - 600000 }, liveness }] });
    assert.equal(stale.length, 0, 'a compaction is progress');
  } finally { await cleanupController(f); }
});

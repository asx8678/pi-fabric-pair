// Focused offline regression coverage for the safety milestone: branch-aware
// handoff fencing, pause/resume of pending reviews, per-command verification
// source identity, post-readiness checkpoint revalidation, retained work-order
// scope after compaction, and native agentDir tilde semantics. No inference, no
// native runtime qualification, isolated temporary state only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerMain } from '../src/main.js';
import { DEFAULTS } from '../src/config.js';
import { registerWorker } from '../src/worker.js';
import { configPaths } from '../src/config.js';
import { Evidence, verifyConfigured } from '../src/evidence.js';
import { agentDir, digest } from '../src/util.js';
import { validateAuthority } from '../src/contracts.js';
import { PiRpc } from '../src/rpc.js';
import { PiRuntime } from '../src/actor-runtime.js';

const host = fileURLToPath(new URL('./helpers/restart-worker.mjs', import.meta.url));

async function mainFixture(run, { project, rpc = 'forbidden' } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-safety-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true }); await fs.mkdir(path.join(base, 'agent'));
  const cwd = await fs.realpath(path.join(base, 'repo')), home = path.join(base, 'agent');
  execFileSync('git', ['init', '-q'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  const defaults = { version: 2, enabled: true, autoStart: false, requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true }, workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }] };
  await fs.writeFile(configPaths(cwd).project, JSON.stringify({ ...defaults, ...project, workers: project?.workers || defaults.workers, requirements: project?.requirements || defaults.requirements }));
  const events = new Map(), commands = new Map(), tools = new Map(), messages = [], notices = [];
  let pendingInput = false;
  const ctx = { cwd, mode: 'rpc', hasUI: true, isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => 'safety-test-owner', getSessionFile: () => path.join(home, 'main-session.jsonl') }, getContextUsage: () => undefined,
    model: { provider: 'main', id: 'native' }, modelRegistry: { getAvailable: () => [] },
    hasPendingMessages: () => pendingInput,
    ui: { select: async () => undefined, notify: (message, level) => notices.push({ message, level }),
      setWidget: () => {}, confirm: async () => true } };
  const pi = { on: (name, fn) => events.set(name, fn), registerCommand: (name, command) => commands.set(name, command),
    registerTool: tool => tools.set(tool.name, tool), getAllTools: () => [], getCommands: () => [], appendEntry: () => {},
    getThinkingLevel: () => 'medium',
    sendMessage: (...args) => messages.push(args), sendUserMessage: (...args) => messages.push(args) };
  const main = registerMain(pi);
  try {
    await events.get('session_start')({}, ctx);
    const controller = main.getController(); assert.ok(controller);
    let spawns = 0;
    if (rpc === 'forbidden') controller.rpcFactory = () => { spawns++; throw Error('RPC spawn forbidden in the safety fixture'); };
    else controller.rpcFactory = options => { spawns++; return new PiRpc({ ...options, env: { ...options.env, PI_CODING_AGENT_DIR: home } }); };
    await run({ controller, getController: () => main.getController(), events, commands, tools, messages, notices, ctx,
      spawns: () => spawns, command: args => commands.get('pair').handler(args, ctx), base, cwd, home,
      setPending: value => { pendingInput = value; },
      run: () => events.get('before_agent_start')({ systemPrompt: 'fixture prompt' }, ctx),
      input: () => events.get('input')({}, ctx),
      toolCall: name => events.get('tool_call')({ toolName: name }, ctx),
      tree: () => events.get('session_tree')({ type: 'session_tree', newLeafId: 'leaf-2', oldLeafId: 'leaf-1' }, ctx),
      compact: () => events.get('session_compact')({}, ctx),
      boundary: (over = {}) => events.get('agent_before_settle')({ type: 'agent_before_settle', outcome: 'completed', entries: [], continue: false,
        context: { canContinue: false, pendingMessages: [] }, ...over }, ctx) });
  } finally {
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

/** Inject one finalized-report task + unacknowledged notice directly into durable
 * state, mirroring the exact persisted shapes finalizeReport produces, with a real
 * immutable checkpoint so pair_inspect/decide observe actual evidence. */
async function injectReview(c, cwd, { kind = 'checkpoint', question, decisions, stepComplete, reportId = `report-${Math.random().toString(36).slice(2, 10)}`, taskId = `task-${Math.random().toString(36).slice(2, 10)}` } = {}) {
  const spec = c.config.workers[0];
  const status = kind === 'question' ? 'question' : kind === 'blocked' ? 'blocked' : 'review';
  const payload = { taskId, stepId: 'one', kind, summary: `Fixture ${kind} summary distinct from any question`,
    ...(question !== undefined ? { question } : {}), ...(decisions?.length ? { decisions } : {}), ...(stepComplete !== undefined ? { stepComplete } : {}) };
  const base = await c.evidence.capture(cwd);
  const checkpoint = await c.evidence.checkpoint(taskId, reportId, base, base, []);
  const task = { id: taskId, workerId: spec.id, requestId: 'request-fixture', objective: 'Safety fixture', context: 'Original safety fixture context', constraints: ['fixture constraint'],
    steps: [{ id: 'one', title: 'Work', instructions: 'fixture' }], stepIndex: 0, planRevision: 1, attemptId: 'attempt-fixture', attemptNumber: 1,
    status, leaseId: 'lease-fixture', policy: structuredClone(c.config.supervision), limits: structuredClone(c.config.limits),
    verification: structuredClone(c.config.verification), startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 1, usage: null,
    baseSnapshotRef: '/fixture/base', pendingReport: null, decisions: {}, lastDecision: null,
    report: { version: 1, reportId, workerId: spec.id, ownerSession: c.ownerSession, ownerEpoch: c.state.ownerEpoch, workerGeneration: 1,
      nonce: 'nonce-fixture', sessionId: 'session-fixture', leaseId: 'lease-fixture', attemptId: 'attempt-fixture', attemptNumber: 1, planRevision: 1,
      payload, payloadHash: digest(payload), createdAt: Date.now(), checkpoint, snapshotRef: '/fixture/snapshot' } };
  const record = { id: spec.id, cwd, repoRoot: cwd, status: 'stopped', bound: spec, workerGeneration: 1,
    sessionId: 'session-fixture', sessionFile: path.join(c.dir, 'fixture-session.jsonl'), history: [], usage: null, task };   // outside the repo: worker writes must not drift the checkpoint
  // A minimal valid retained session (session header) so continuation spawns can start.
  await fs.writeFile(record.sessionFile, `${JSON.stringify({ type: 'session', version: 3, id: 'session-fixture', timestamp: new Date().toISOString(), cwd })}\n`);
  c.state.workers[spec.id] = record;
  c.state.requests['request-fixture'] = { hash: digest('request-fixture'), taskId, workerId: spec.id, acceptedAt: Date.now(), status };
  c.state.notices[reportId] = { reportId, workerId: spec.id, taskId, ownerEpoch: c.state.ownerEpoch, workerGeneration: 1,
    attemptId: 'attempt-fixture', deliveryOperationId: 'delivery-fixture', status: 'pending', createdAt: Date.now() };
  await c.persist();
  return { task, record, notice: c.state.notices[reportId], reportId, taskId };
}

const tool = (f, name, params = {}) => f.tools.get(name).execute('call', params, undefined, undefined, f.ctx);

test('agentDir matches native tilde/absolute/relative semantics without touching profiles', () => {
  const home = os.homedir();
  assert.equal(agentDir({ PI_CODING_AGENT_DIR: '~' }), home, 'bare tilde expands to home');
  assert.equal(agentDir({ PI_CODING_AGENT_DIR: '~/pair-state' }), path.join(home, 'pair-state'), '~/... joins home');
  assert.equal(agentDir({ PI_CODING_AGENT_DIR: path.join(home, 'absolute') }), path.join(home, 'absolute'), 'absolute passes through');
  assert.equal(agentDir({ PI_CODING_AGENT_DIR: 'relative-state' }), path.resolve('relative-state'), 'relative resolves against cwd as before');
  assert.equal(agentDir({}), path.join(home, '.pi', 'agent'), 'default is untouched');
  assert.equal(agentDir({ PI_CODING_AGENT_DIR: '' }), path.join(home, '.pi', 'agent'), 'empty falls back to the default');
});

test('per-command verification binds source identity and rejects drift between or during checks', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-verify-'));
  await fs.mkdir(path.join(base, 'repo'));
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@e.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'tracked.txt'), 'v1\n');
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
  const evidence = new Evidence(path.join(base, 'state'), { maxFiles: 100, maxTotalBytes: 1024 * 1024, maxArtifactBytes: 1024 * 1024 });
  const config = { commands: [{ name: 'first', command: 'true', args: [] }, { name: 'second', command: 'true', args: [] }], requirePassing: true, timeoutMs: 5000 };
  try {
    // Happy path: every check runs against the same source and records its hash.
    const expected = (await evidence.capture(repo)).hash;
    const clean = await verifyConfigured(config, repo, path.join(base, 'checks-clean'), undefined, { expectedHash: expected, captureSource: async () => (await evidence.capture(repo)).hash });
    assert.equal(clean.length, 2);
    assert.ok(clean.every(result => result.passed));
    const firstArtifact = JSON.parse(await fs.readFile(path.join(base, 'checks-clean', 'check-1.json'), 'utf8'));
    assert.equal(firstArtifact.sourceHash, expected, 'the check artifact names the source identity it ran against');
    // Mutation between checks (even restored afterwards) cannot pass: the second
    // check would run against a different source than the checkpointed evidence.
    let calls = 0;
    const driftBetween = async () => { if (++calls === 3) await fs.writeFile(path.join(repo, 'external-drift.txt'), 'drifted\n'); return (await evidence.capture(repo)).hash; };
    await assert.rejects(verifyConfigured(config, repo, path.join(base, 'checks-between'), undefined, { expectedHash: (await evidence.capture(repo)).hash, captureSource: driftBetween }),
      /VERIFICATION_SOURCE_DRIFT.*different workspace state/, 'a mutation between checks fails the whole verification');
    await fs.rm(path.join(repo, 'external-drift.txt'));
    // Mutation while a check runs also fails, restoration notwithstanding.
    let midCalls = 0;
    const driftDuring = async () => { if (++midCalls === 2) await fs.writeFile(path.join(repo, 'mid-drift.txt'), 'drifted\n'); return (await evidence.capture(repo)).hash; };
    await assert.rejects(verifyConfigured(config, repo, path.join(base, 'checks-during'), undefined, { expectedHash: (await evidence.capture(repo)).hash, captureSource: driftDuring }),
      /VERIFICATION_SOURCE_DRIFT.*while running check/, 'a mutation during a check fails the whole verification');
    await fs.rm(path.join(repo, 'mid-drift.txt'));
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('a paused review restores waiting on resume with the same lease, notice and no new implementation lease', () => mainFixture(async f => {
  const { notice, taskId, reportId } = await injectReview(f.controller, f.cwd);
  const before = { attemptId: f.controller.record('worker').task.attemptId, leaseId: f.controller.record('worker').task.leaseId };
  await f.controller.pause('worker', 'Paused while a review waits');
  const paused = f.controller.record('worker').task;
  assert.equal(paused.status, 'paused');
  assert.equal(paused.previousStatus, 'review');
  assert.equal(notice.status, 'pending', 'pausing never supersedes the retained notice');
  const authorityPaused = JSON.parse(await fs.readFile(path.join(f.controller.workerDir('worker'), 'authority.json'), 'utf8'));
  assert.equal(authorityPaused.phase, 'paused');
  const outcome = await f.controller.resume('worker');
  assert.deepEqual(outcome, { taskId, status: 'review' }, 'resume restores the waiting review');
  const restored = f.controller.record('worker').task;
  assert.equal(restored.status, 'review');
  assert.equal(restored.attemptId, before.attemptId, 'no attempt rotation');
  assert.equal(restored.leaseId, before.leaseId, 'no new lease');
  assert.equal(restored.previousStatus, undefined, 'the hold marker is consumed');
  assert.equal(notice.status, 'pending', 'the notice survives pause/resume');
  assert.equal(f.spawns(), 0, 'restoring waiting never launches or activates a worker');
  const authority = JSON.parse(await fs.readFile(path.join(f.controller.workerDir('worker'), 'authority.json'), 'utf8'));
  assert.equal(authority.phase, 'waiting');
  assert.equal(f.controller.summary().waitingReports, 1, 'the obligation stays visible');
  await f.controller.inspect('worker', reportId);
  assert.equal(f.controller.summary().waitingReports, 0);
}));

test('a paused question survives reload and restores waiting without a new lease', () => mainFixture(async f => {
  const { notice } = await injectReview(f.controller, f.cwd, { kind: 'question', question: 'Which fixture path should the worker take?' });
  const attemptId = f.controller.record('worker').task.attemptId;
  await f.controller.pause('worker', 'Paused with an open question');
  await f.events.get('session_start')({}, f.ctx);      // controller replacement (reload)
  const c = f.getController();
  assert.equal(c.record('worker').task.status, 'paused', 'the hold survives reload');
  assert.equal(c.record('worker').task.previousStatus, 'question');
  const outcome = await c.resume('worker');
  assert.deepEqual(outcome, { taskId: c.record('worker').task.id, status: 'question' });
  assert.equal(c.record('worker').task.attemptId, attemptId, 'still no attempt rotation after reload');
  assert.equal(notice.status, 'pending');
  let replacementSpawns = 0;
  c.rpcFactory = () => { replacementSpawns++; throw Error('spawn forbidden after reload'); };
  assert.equal(replacementSpawns, 0, 'no activation is requested');
  assert.deepEqual(f.messages, []);
}));

test('tree navigation invalidates an armed yield; normal compaction does not', () => mainFixture(async f => {
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  await f.controller.setPhase('yielded', '1:0', true); await f.controller.persist();   // armed empty yield
  await f.tree();
  assert.equal(f.controller.state.mainPhase.status, 'open', 'navigation invalidates the unused delivery permission');
  assert.ok(f.notices.some(n => /branch navigation/.test(n.message)), 'an actionable warning explains the retained reports');
  assert.equal(await f.boundary(), undefined, 'the stale branch never receives delivery');
  assert.equal(notice.status, 'pending');
  assert.equal((await tool(f, 'pair_yield')).details.reports[0].reportId, reportId, 'explicit retrieval stays available');
  // Normal compaction is NOT a branch change: a fresh armed yield survives it.
  await f.controller.inspect('worker', reportId);       // acknowledge before re-arming
  await f.controller.setPhase('yielded', '1:0', true); await f.controller.persist();
  await f.compact();
  assert.equal(f.controller.state.mainPhase.status, 'yielded', 'compaction keeps the legitimate yield');
  const next = await injectReview(f.controller, f.cwd);
  const delivered = await f.boundary();
  assert.ok(delivered, 'normal compaction does not spuriously revoke legitimate work');
  assert.equal(delivered.entries[0].details.reportId, next.reportId);
}));

test('only an actual boolean false from hasPendingMessages counts as clear; anything else defers', () => mainFixture(async f => {
  await tool(f, 'pair_yield');
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  f.ctx.hasPendingMessages = () => 'yes';
  const warnings = f.notices.length;
  assert.equal(await f.boundary(), undefined, 'a non-boolean observation is never inferred as clear');
  assert.ok(f.notices.length > warnings && /pair_yield|deferred/.test(f.notices.at(-1).message), 'the deferral is actionable');
  f.ctx.hasPendingMessages = () => { throw Error('observation unavailable'); };
  assert.equal(await f.boundary(), undefined, 'a throwing observation defers safely');
  assert.equal(notice.status, 'pending', 'nothing was consumed');
  f.ctx.hasPendingMessages = () => false;
  const delivered = await f.boundary();
  assert.ok(delivered, 'an actual boolean false is clear');
  assert.equal(delivered.entries[0].details.reportId, reportId);
}));

test('source drift during the readiness-to-continuation wait rejects the renewed authorization', { timeout: 15000 }, () => mainFixture(async f => {
  const { reportId, taskId } = await injectReview(f.controller, f.cwd);
  await tool(f, 'pair_yield');
  await f.controller.inspect('worker', reportId);
  const c = f.controller;
  const original = c.startReserved.bind(c);
  c.startReserved = async launch => { await fs.writeFile(path.join(f.cwd, `external-drift-${Date.now()}.txt`), 'external writer\n'); return original(launch); };
  await assert.rejects(tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'revise', feedback: 'Fixture revision after drift' }),
    /STALE_CHECKPOINT.*between the decision and renewed running authority/, 'drift during the readiness wait rejects the renewal');
  assert.equal(c.record('worker').task.status, 'interrupted', 'the failed renewal holds the task without replaying work');
  assert.ok(c.record('worker').error, 'the failure is visible on the record');
  assert.deepEqual(f.messages, []);
}, { project: { runtime: { command: process.execPath, commandArgs: [host], inheritExtensions: false, startupTimeoutMs: 5000, requestTimeoutMs: 2000, shutdownTimeoutMs: 300 } }, rpc: 'real' }));

test('source drift during the final activation readiness wait rejects the renewed authorization', { timeout: 15000 }, () => mainFixture(async f => {
  const { reportId, taskId } = await injectReview(f.controller, f.cwd);
  await tool(f, 'pair_yield');
  await f.controller.inspect('worker', reportId);
  const proto = PiRuntime.prototype, original = proto.prepareActivation;
  proto.prepareActivation = async function (activation) {
    const ready = await original.call(this, activation);
    await fs.writeFile(path.join(f.cwd, `activation-drift-${Date.now()}.txt`), 'external writer\n'); // drift AFTER the final readiness operations
    return ready;
  };
  try {
    await assert.rejects(tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'revise', feedback: 'drift during final readiness' }),
      /STALE_CHECKPOINT.*between the decision and renewed running authority/, 'drift inside the final readiness wait is caught before running authority');
    assert.equal(f.controller.record('worker').task.status, 'interrupted', 'the renewal is held without replaying work');
    assert.deepEqual(f.messages, []);
  } finally { proto.prepareActivation = original; }
}, { project: { runtime: { command: process.execPath, commandArgs: [host], inheritExtensions: false, startupTimeoutMs: 5000, requestTimeoutMs: 2000, shutdownTimeoutMs: 300 } }, rpc: 'real' }));

test('branch navigation during the continuation readiness wait rejects the renewed authorization', { timeout: 15000 }, () => mainFixture(async f => {
  const { reportId, taskId } = await injectReview(f.controller, f.cwd);
  await tool(f, 'pair_yield');
  await f.controller.inspect('worker', reportId);
  const proto = PiRuntime.prototype, original = proto.prepareActivation;
  proto.prepareActivation = async function (activation) {
    const ready = await original.call(this, activation);
    await f.tree();                                     // navigation races the final readiness wait
    return ready;
  };
  try {
    await assert.rejects(tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'revise', feedback: 'navigation during readiness' }),
      /BRANCH_STALE.*during the decision/, 'a branch change during readiness stales the renewal');
    assert.equal(f.controller.record('worker').task.status, 'interrupted');
  } finally { proto.prepareActivation = original; }
}, { project: { runtime: { command: process.execPath, commandArgs: [host], inheritExtensions: false, startupTimeoutMs: 5000, requestTimeoutMs: 2000, shutdownTimeoutMs: 300 } }, rpc: 'real' }))

test('an undrifted decision proceeds past revalidation to activation (negative control)', { timeout: 15000 }, () => mainFixture(async f => {
  const { reportId, taskId } = await injectReview(f.controller, f.cwd);
  await tool(f, 'pair_yield');
  await f.controller.inspect('worker', reportId);
  // The offline helper host rejects the work-order prompt, so activation fails
  // AFTER revalidation — proving the renewed authorization itself was valid.
  await assert.rejects(tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'revise', feedback: 'Fixture revision without drift' }),
    /Inference is forbidden/);
  assert.equal(f.controller.record('worker').task.status, 'interrupted');
}, { project: { runtime: { command: process.execPath, commandArgs: [host], inheritExtensions: false, startupTimeoutMs: 5000, requestTimeoutMs: 2000, shutdownTimeoutMs: 300 } }, rpc: 'real' }));

test('dispatch retains an identity-bound read-only work-order scope for the worker', { timeout: 15000 }, () => mainFixture(async f => {
  const dispatch = { workerId: 'worker', requestId: 'request-scope', objective: 'Scope retention fixture', context: 'Original granted context for restoration', constraints: ['scope constraint'], steps: [{ id: 'one', title: 'Work', instructions: 'fixture' }] };
  await assert.rejects(tool(f, 'pair_dispatch', dispatch), /Inference is forbidden/);
  const c = f.getController();
  const order = JSON.parse(await fs.readFile(path.join(c.workerDir('worker'), 'work-order.json'), 'utf8'));
  assert.equal(order.version, 1);
  assert.equal(order.taskId, c.record('worker').task.id, 'the reference is identity-bound to the granted task');
  assert.equal(order.planRevision, c.record('worker').task.planRevision);
  assert.equal(order.objective, 'Scope retention fixture');
  assert.equal(order.context, 'Original granted context for restoration');
  assert.deepEqual(order.constraints, ['scope constraint']);
  delete c.state.workers['worker']; // memory-only cleanup: the failed launch left no confirmable runtime
  await c.persist();
}, { project: { runtime: { command: process.execPath, commandArgs: [host], inheritExtensions: false, startupTimeoutMs: 5000, requestTimeoutMs: 2000, shutdownTimeoutMs: 300 } }, rpc: 'real' }));

async function workerFixture(run, { mode = 'final-only', order, orderRaw } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-worker-scope-'));
  const dir = path.join(base, 'worker'), cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await Promise.all([dir, cwd, home].map(p => fs.mkdir(p)));
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  const authority = validateAuthority({ version: 1, ownerSession: 'scope-owner', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1,
    phase: 'running', leaseId: 'scope-lease-1', attemptId: 'scope-attempt-1', readOnly: false, model: { provider: 'fake', id: 'model' }, repoRoot: cwd,
    task: { id: 'scope-task', objective: 'Scope fixture', planRevision: 1, attemptId: 'scope-attempt-1', attemptNumber: 1, constraints: [],
      steps: [{ id: 'one', title: 'First', instructions: 'Do one' }, { id: 'two', title: 'Second', instructions: 'Do two' }], stepIndex: 0,
      policy: { ...structuredClone(DEFAULTS.supervision), mode }, limits: structuredClone(DEFAULTS.limits), lastDecision: null }, updatedAt: Date.now() });
  await fs.writeFile(path.join(dir, 'authority.json'), JSON.stringify(authority));
  if (order !== undefined) await fs.writeFile(path.join(dir, 'work-order.json'), JSON.stringify(order));
  if (orderRaw !== undefined) await fs.writeFile(path.join(dir, 'work-order.json'), orderRaw);
  const events = new Map(), tools = new Map(), commands = new Map(), messages = [];
  const pi = { on: (name, fn) => events.set(name, fn), registerTool: tool => tools.set(tool.name, tool),
    registerCommand: (name, command) => commands.set(name, command), getAllTools: () => [...tools.values()],
    getCommands: () => [...commands.keys()].map(name => ({ name })), getThinkingLevel: () => 'low',
    sendMessage: (...args) => messages.push(args), sendUserMessage: () => assert.fail('No prompts allowed') };
  const ctx = { cwd, model: { provider: 'fake', id: 'model', contextWindow: 200000 },
    sessionManager: { getSessionId: () => 'scope-session', getSessionFile: () => path.join(base, 'scope-session.jsonl') },
    getContextUsage: () => undefined, isProjectTrusted: () => false,
    abort: () => {}, shutdown: () => {}, ui: { notify: () => {} } };
  const env = { PI_FABRIC_PAIR_WORKER_ID: 'worker', PI_FABRIC_PAIR_OWNER: 'scope-owner', PI_FABRIC_PAIR_OWNER_EPOCH: '1',
    PI_FABRIC_PAIR_WORKER_GENERATION: '1', PI_FABRIC_PAIR_NONCE: 'scope-nonce', PI_FABRIC_PAIR_WORKER_DIR: dir };
  registerWorker(pi, env);
  try {
    await events.get('session_start')({}, ctx);
    await run({ ctx, events, dir, packet: async () => JSON.parse((await events.get('before_agent_start')({ systemPrompt: 'x' }, ctx)).message.content) });
  } finally {
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

const matchingOrder = { version: 1, taskId: 'scope-task', planRevision: 1, objective: 'Scope fixture', context: 'Original granted context for restoration', constraints: [], writtenAt: Date.now() };

test('the worker restores the identity-matching original context and final-only remaining plan after compaction', () => workerFixture(async f => {
  const packet = await f.packet();
  assert.equal(packet.originalContext, 'Original granted context for restoration', 'the original context is restorable without inference');
  assert.equal(packet.originalObjective, 'Scope fixture');
  assert.equal(packet.remainingPlan.length, 2, 'final-only mode restores the full remaining plan');
  assert.deepEqual(packet.remainingPlan.map(step => step.id), ['one', 'two']);
  assert.equal(packet.authorizedStep.id, 'one');
  assert.equal(packet.mayCompleteRemainingPlan, true);
}, { order: matchingOrder }));

test('a mismatched or malformed work-order reference is conservatively omitted, never adopted', () => workerFixture(async f => {
  const packet = await f.packet();
  assert.equal(packet.originalContext, undefined, 'a reference for another task is never adopted');
  assert.equal(packet.remainingPlan, undefined);
}, { order: { ...matchingOrder, taskId: 'another-task' } }));

test('raw malformed work-order JSON is omitted conservatively without weakening authority validation', () => workerFixture(async f => {
  const packet = await f.packet();
  assert.equal(packet.originalContext, undefined, 'malformed optional reference is omitted, never fatal');
  assert.equal(packet.remainingPlan, undefined);
  assert.equal(packet.taskId, 'scope-task', 'the authoritative packet still restores');
}, { orderRaw: '{not valid json' }));

test('a decision resting on a previous conversation branch is stale until the current context re-inspects', () => mainFixture(async f => {
  const { notice, reportId, taskId } = await injectReview(f.controller, f.cwd, { stepComplete: true });
  await f.controller.inspect('worker', reportId);
  assert.equal(notice.observedBranch, 0, 'inspection pins the current branch');
  await f.tree();
  assert.equal(f.controller.state.branch, 1, 'navigation durably bumps the branch counter');
  await assert.rejects(tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'approve', checkpointHash: f.controller.record('worker').task.report.checkpoint.checkpointHash, feedback: 'stale branch approval' }),
    /BRANCH_STALE.*pair_inspect/, 'a stale-branch decision is rejected');
  assert.equal(f.controller.record('worker').task.status, 'review', 'the review obligation is preserved');
  assert.equal(notice.status, 'pending', 'the notice is not resolved by the rejected decision');
  await f.controller.inspect('worker', reportId);      // current-context reconciliation
  assert.equal(notice.observedBranch, 1, 're-inspection reconciles to the current branch');
  const approved = await tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'approve', checkpointHash: f.controller.record('worker').task.report.checkpoint.checkpointHash, feedback: 'reconciled approval' });
  assert.equal(approved.details.status, 'completed', 'a reconciled decision completes normally');
  assert.equal(f.spawns(), 0, 'no spawn was needed for the final-step approval');
}));

test('navigation during the approval capture rejects the in-flight decision', () => mainFixture(async f => {
  const { notice, reportId, taskId } = await injectReview(f.controller, f.cwd, { stepComplete: true });
  await f.controller.inspect('worker', reportId);
  const c = f.controller, original = c.evidence.capture.bind(c.evidence);
  let armed = true;
  c.evidence.capture = async root => { const snapshot = await original(root); if (armed) { armed = false; await f.tree(); } return snapshot; };
  await assert.rejects(tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'approve', checkpointHash: c.record('worker').task.report.checkpoint.checkpointHash, feedback: 'approval raced by navigation' }),
    /superseded/, 'the post-await fence sees the branch change and rejects');
  c.evidence.capture = original;
  assert.equal(c.record('worker').task.status, 'review', 'the obligation survives the rejected decision');
  assert.equal(notice.status, 'pending');
}));

test('a double pause preserves the original review obligation; resume restores waiting with no spawn', () => mainFixture(async f => {
  const { notice } = await injectReview(f.controller, f.cwd);
  await f.controller.pause('worker', 'first pause');
  await f.controller.pause('worker', 'second pause');
  const held = f.controller.record('worker').task;
  assert.equal(held.status, 'paused');
  assert.equal(held.previousStatus, 'review', 'a second pause never masks the waiting predecessor with paused');
  const outcome = await f.controller.resume('worker');
  assert.equal(outcome.status, 'review', 'resume restores the original decision wait');
  assert.equal(f.controller.record('worker').task.leaseId, held.leaseId, 'no lease rotation');
  assert.equal(notice.status, 'pending', 'the notice was never superseded');
  assert.equal(f.spawns(), 0, 'no new implementation lease or spawn');
}));

test('a double-paused blocker also restores waiting without a new lease', () => mainFixture(async f => {
  const { notice } = await injectReview(f.controller, f.cwd, { kind: 'blocked', question: 'Blocked: fixture credentials missing.' });
  await f.controller.pause('worker', 'first pause');
  await f.controller.pause('worker', 'second pause');
  assert.equal(f.controller.record('worker').task.previousStatus, 'blocked');
  const outcome = await f.controller.resume('worker');
  assert.equal(outcome.status, 'blocked');
  assert.equal(notice.status, 'pending');
  assert.equal(f.spawns(), 0);
}));

test('real configured commands that mutate between checks are rejected by per-command identity', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-verify-real-'));
  await fs.mkdir(path.join(base, 'repo'));
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@e.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'source.txt'), 'A\n');
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
  const evidence = new Evidence(path.join(base, 'state'), { maxFiles: 100, maxTotalBytes: 1024 * 1024, maxArtifactBytes: 1024 * 1024 });
  try {
    // Documented endpoint-snapshot limitation FIRST (clean source): a transient
    // within-command mutation fully restored before the command exits is NOT
    // isolated — exactly why continuation authority revalidates after the final
    // readiness wait instead of claiming atomic exclusion.
    const cleanHash = (await evidence.capture(repo)).hash;
    const transient = { commands: [
      { name: 'transient', command: process.execPath, args: ['-e', "const fs = require('node:fs'); fs.writeFileSync('source.txt','B\\n'); fs.writeFileSync('source.txt','A\\n');"] },
    ], requirePassing: true, timeoutMs: 10000 };
    const passed = await verifyConfigured(transient, repo, path.join(base, 'checks-transient'), undefined, { expectedHash: cleanHash, captureSource: async () => (await evidence.capture(repo)).hash });
    assert.ok(passed.every(result => result.passed), 'endpoint snapshots around a command do not isolate transient within-command mutations');
    // Then the real two-command mutate/restore sequence: command 1 really mutates
    // the source; command 2 would restore it afterwards — rejected at command 1.
    const expected = (await evidence.capture(repo)).hash;
    const mutateRestore = { commands: [
      { name: 'mutate', command: process.execPath, args: ['-e', "require('node:fs').writeFileSync('source.txt','B\\n')"] },
      { name: 'restore', command: process.execPath, args: ['-e', "require('node:fs').writeFileSync('source.txt','A\\n')"] },
    ], requirePassing: true, timeoutMs: 10000 };
    await assert.rejects(verifyConfigured(mutateRestore, repo, path.join(base, 'checks-real'), undefined, { expectedHash: expected, captureSource: async () => (await evidence.capture(repo)).hash }),
      /VERIFICATION_SOURCE_DRIFT.*while running check mutate/, 'a real mutating command cannot be restored into passing evidence');
  } finally { await fs.rm(base, { recursive: true, force: true }); }
})
const runtimeProject = { runtime: { command: process.execPath, commandArgs: [host], inheritExtensions: false, startupTimeoutMs: 5000, requestTimeoutMs: 2000, shutdownTimeoutMs: 300 } };

test('an omitted-reportId inspection pins the actual report and cannot authorize approval from a stale branch', () => mainFixture(async f => {
  const { notice, reportId, taskId } = await injectReview(f.controller, f.cwd, { stepComplete: true });
  const hash = f.controller.record('worker').task.report.checkpoint.checkpointHash;
  await tool(f, 'pair_inspect', { workerId: 'worker' });           // optional reportId omitted
  assert.ok(f.controller.record('worker').task.report.inspectedAt, 'the actual current report was inspected');
  assert.equal(notice.observedBranch, 0, 'the omitted-reportId inspection pins the actual report on the current branch');
  await f.tree();
  await assert.rejects(tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'approve', checkpointHash: hash, feedback: 'stale branch approval' }),
    /BRANCH_STALE/, 'the exact-hash approval must not complete from the stale inspection');
  assert.equal(f.controller.record('worker').task.status, 'review', 'the obligation is preserved');
  assert.equal(notice.status, 'pending', 'the notice was not resolved');
  await tool(f, 'pair_inspect', { workerId: 'worker', reportId });  // explicit reconciliation on the current branch
  assert.equal(notice.observedBranch, 1);
  const approved = await tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'approve', checkpointHash: hash, feedback: 'reconciled approval' });
  assert.equal(approved.details.status, 'completed');
  assert.equal(f.spawns(), 0, 'no spawn is needed for the final-step approval');
}));

test('an inspection crossing navigation never pins the newer branch; a fresh inspection reconciles', () => mainFixture(async f => {
  const { reportId, taskId } = await injectReview(f.controller, f.cwd, { stepComplete: true });
  const hash = f.controller.record('worker').task.report.checkpoint.checkpointHash;
  const c = f.controller, original = c.evidence.inspect.bind(c.evidence);
  // Main's exact reproduction: navigation fires after the awaited evidence read.
  c.evidence.inspect = async (...args) => { const inspected = await original(...args); await f.tree(); return inspected; };
  await assert.rejects(tool(f, 'pair_inspect', { workerId: 'worker', reportId }), /BRANCH_STALE.*while inspecting/,
    'the old-context inspection must not pin the new branch');
  c.evidence.inspect = original;
  assert.equal(c.record('worker').task.report.inspectedAt, undefined, 'the report is intact: nothing was pinned');
  assert.equal(c.state.notices[reportId].observedBranch, undefined);
  // The queued-transaction variant: navigation fires before the asynchronous read,
  // after the inspection began on the current branch — equally refused.
  c.evidence.inspect = async (...args) => { await f.tree(); return original(...args); };
  await assert.rejects(tool(f, 'pair_inspect', { workerId: 'worker', reportId }), /BRANCH_STALE.*while inspecting/);
  c.evidence.inspect = original;
  assert.equal(c.record('worker').task.report.inspectedAt, undefined, 'still nothing was pinned');
  await tool(f, 'pair_inspect', { workerId: 'worker', reportId });   // fresh inspection on the current branch
  assert.equal(c.state.notices[reportId].observedBranch, 2);
  const approved = await tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'approve', checkpointHash: hash, feedback: 'fresh inspection reconciles' });
  assert.equal(approved.details.status, 'completed');
}));

test('navigation during running-intent persistence cannot publish stale running authority or send work', { timeout: 15000 }, () => mainFixture(async f => {
  const { reportId, taskId } = await injectReview(f.controller, f.cwd);
  await tool(f, 'pair_yield');
  await f.controller.inspect('worker', reportId);
  const c = f.controller;
  const original = c.persist.bind(c);
  let armed = true;
  c.persist = async () => { const outcome = await original(); if (armed && c.record('worker').task?.status === 'running') { armed = false; await f.tree(); } return outcome; };
  try {
    await assert.rejects(tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'revise', feedback: 'navigation during running-intent persistence' }),
      /BRANCH_STALE.*during activation/, 'the renewal is held at the running-intent persistence fence');
    assert.equal(c.record('worker').task.status, 'interrupted', 'contained without new work');
    assert.ok(c.record('worker').error, 'the hold is visible and actionable on the record');
    const authority = JSON.parse(await fs.readFile(path.join(c.workerDir('worker'), 'authority.json'), 'utf8'));
    assert.notEqual(authority.phase, 'running', 'stale running authority is never left published');
    assert.deepEqual(f.messages, []);
  } finally { c.persist = original; }
}, { project: runtimeProject, rpc: 'real' }));

test('navigation in the runtime pre-prompt window cannot send a stale prompt; authority is safely held', { timeout: 15000 }, () => mainFixture(async f => {
  const { reportId, taskId } = await injectReview(f.controller, f.cwd);
  await tool(f, 'pair_yield');
  await f.controller.inspect('worker', reportId);
  const proto = PiRuntime.prototype, original = proto.activate;
  proto.activate = async function (activation, message, validity) {
    await f.tree();                                     // navigation during the runtime's later awaits, before the prompt write
    return original.call(this, activation, message, validity);
  };
  try {
    await assert.rejects(tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'revise', feedback: 'navigation in the pre-prompt window' }),
      /scope fence rejected/i, 'the pre-prompt validity fence refuses the write before any bytes leave');
    assert.equal(f.controller.record('worker').task.status, 'interrupted', 'already-published authority is safely held');
    const authority = JSON.parse(await fs.readFile(path.join(f.controller.workerDir('worker'), 'authority.json'), 'utf8'));
    assert.notEqual(authority.phase, 'running');
    assert.deepEqual(f.messages, []);
  } finally { proto.activate = original; }
}, { project: runtimeProject, rpc: 'real' }));

test('a contained renewal recovers only through explicit stop then resume', { timeout: 15000 }, () => mainFixture(async f => {
  const { reportId, taskId } = await injectReview(f.controller, f.cwd);
  await tool(f, 'pair_yield');
  await f.controller.inspect('worker', reportId);
  const c = f.controller;
  const original = c.persist.bind(c);
  let armed = true;
  c.persist = async () => { const outcome = await original(); if (armed && c.record('worker').task?.status === 'running') { armed = false; await f.tree(); } return outcome; };
  try {
    await assert.rejects(tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'revise', feedback: 'contained for recovery' }),
      /BRANCH_STALE.*during activation/, 'the renewal is contained');
    assert.equal(c.record('worker').task.status, 'interrupted');
    // Re-inspection alone does not restore a committed decision: the contained
    // generation is still held, so resume refuses until it is explicitly stopped.
    await assert.rejects(c.resume('worker'), /Stop the held generation before starting it again/);
    await c.stop('worker');                                      // explicit stop; confirmed exit
    assert.equal(c.record('worker').status, 'stopped');
    // Explicit resume continues the same conversation; the offline helper rejects
    // the recovery work prompt, proving the documented recipe reaches activation.
    await assert.rejects(c.resume('worker'), /Inference is forbidden/);
    assert.deepEqual(f.messages, []);
  } finally { c.persist = original; }
}, { project: runtimeProject, rpc: 'real' }))

test('an unchanged branch and explicit inspection proceed: approval completes without navigation', () => mainFixture(async f => {
  const { reportId, taskId } = await injectReview(f.controller, f.cwd, { stepComplete: true });
  const hash = f.controller.record('worker').task.report.checkpoint.checkpointHash;
  await tool(f, 'pair_inspect', { workerId: 'worker', reportId });
  f.events.get('agent_settled')({}, f.ctx);   // normal settlement never bumps the branch
  const approved = await tool(f, 'pair_decide', { workerId: 'worker', taskId, reportId, action: 'approve', checkpointHash: hash, feedback: 'unchanged context' });
  assert.equal(approved.details.status, 'completed', 'no spurious invalidation without navigation');
  assert.equal(f.spawns(), 0);
}))

test('a per-step policy restores the context but never the not-yet-authorized plan', () => workerFixture(async f => {
  const packet = await f.packet();
  assert.equal(packet.originalContext, 'Original granted context for restoration');
  assert.equal(packet.remainingPlan, undefined, 'per-step mode keeps authorizing one step at a time');
  assert.equal(packet.authorizedStep.id, 'one');
}, { mode: 'milestones', order: matchingOrder }));

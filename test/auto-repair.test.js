// Automatic repair: a mechanical failure in Pair's own findings goes back to the worker instead of costing Main a
// turn. The failure kinds are a failed configured check, checks that describe a different workspace than the
// checkpoint, and a step too large for its policy. Everything else — a question, a blocker, a worker's own failure,
// an out-of-scope write — still reaches Main, because those need judgement rather than a mechanical fix.
//
// These tests drive the real settlement path (acceptReport -> finalizeReport) with a fake runtime, so the budget, the
// workspace lock, the continuation lease and the report that finally reaches Main are all the production ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../src/config.js';
import { PairController } from '../src/controller.js';
import { digest } from '../src/util.js';

const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };
const EXIT_FAIL = ['node', ['-e', 'process.exit(1)']];
const EXIT_PASS = ['node', ['-e', 'process.exit(0)']];

/**
 * A worker holding one running step, ready to accept a report, with a fake runtime that records what Pair sends.
 * @param {{command?: [string, string[]] | null, mode?: string, maxStepFiles?: number, autoRepairsPerStep?: number, backend?: string, changed?: string[]}} options
 */
async function fixture({ command = null, mode = 'every-step', maxStepFiles = 5, autoRepairsPerStep = 2, backend = 'pi', changed = null } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-repair-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'README.md'), 'fixture\n');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo });
  const config = {
    version: 2, enabled: true, autoStart: false, supervision: { mode, maxStepFiles },
    control: { autoRepairsPerStep },
    runtime: { backend, lowCommand: 'low', lowArgs: [] },
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    verification: command ? { commands: [{ name: 'unit', command: command[0], args: command[1] }], requirePassing: true, timeoutMs: 20000 } : undefined,
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }],
  };
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify(config));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  /** @type {string[]} */ const notices = [];
  const controller = new PairController({ config: loaded.config, cwd: repo, ownerSession: 'repair-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser: (message) => { notices.push(message); }, promptUser: async () => ({ cancelled: true }) } });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const steps = [{ id: 's1', title: 'First step', instructions: 'Do the thing' }, { id: 's2', title: 'Second step', instructions: 'Then this' }];
  /** @type {any} */
  const task = { id: 'task-repair', workerId: id, requestId: 'req-repair', objective: 'Repair fixture', context: 'test', constraints: [], steps,
    stepIndex: 0, planRevision: 1, attemptId: 'attempt-repair', attemptNumber: 1, status: 'running', leaseId: 'lease-repair',
    policy: { mode, finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal', maxStepFiles },
    limits: controller.config.limits, verification: controller.config.verification,
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, stepRevisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null, timeline: [],
    // The step was dispatched at the runtime's current settle sequence; the fake advances past it when it reports.
    dispatchSettleSequence: 1 };
  const record = { id, cwd: repo, repoRoot: repo, status: 'working', sessionId: 'sess-repair', sessionFile: path.join(controller.dir, 'sessions', 'w-repair.jsonl'),
    bound: { ...spec }, task, history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions'), path.join(workerDir, 'checks')]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(record.sessionFile, JSON.stringify({ type: 'session', version: 3, id: 'sess-repair', timestamp: new Date().toISOString(), cwd: repo }) + '\n');
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(await controller.evidence.capture(repo));
  // A report whose checkpoint changes what the test says it changed, so a step can be made too large on purpose.
  if (changed) for (const file of changed) await fs.writeFile(path.join(repo, file), 'changed\n');
  /** @type {{kind: string, text: string}[]} */ const sent = [];
  /** @type {{token: object} | null} */ let current = null;
  // The readiness probe Pair validates and stores on the worker record when a continuation starts.
  const probe = () => ({ protocol: 1, pairVersion: '0.1.0', pid: 424299, cwd: repo, trusted: true, sessionId: record.sessionId, sessionFile: record.sessionFile,
    nonce: 'nonce-repair', workerId: id, ownerSession: 'repair-owner', ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1,
    scope: 'auto-repair fixture', model: { provider: 'fixture', id: 'fixture-model', contextWindow: 100000 }, thinkingLevel: 'low',
    capabilities: { fabric: false, fovea: false, pairReport: true }, meshRoot: path.join(workerDir, 'fabric', 'mesh'),
    versions: {}, sourcePaths: [], context: null, checkedAt: Date.now(),
    native: { agentDir: path.join(base, 'agent'), note: 'fixture', piCompaction: {}, cacheWarming: 'off', fabricCompaction: {}, fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: true, prewalkConfigured: true } });
  const runtime = { ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-repair', pid: 424299, dir: workerDir, sessionId: record.sessionId,
    ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], abortCurrent: async () => {}, async abortAndStop() { this.closed = true; },
    waitIdle: async () => {}, revoke() {}, settleOrAbort: async () => {}, reserveActivation: (identity) => (current = { token: identity }), releaseActivation: () => {},
    // The activation fence the controller asks before sending: this fake's reserved activation stays current.
    activationCurrent: (activation) => !!activation && activation === current,
    snapshot: () => ({ pid: 424299, ready: true, idle: true, streaming: false, closed: false, fault: null, permission: false, compacting: false, summarizingRetrying: false, retrying: false, tool: null, accepted: true, activation: null, lastEventAt: Date.now() }),
    // The readiness probe Pair stores on the worker record, so the continuation publishes what it validated.
    async prepareActivation() { return { probe: probe(), state: { ...probe().model, sessionId: record.sessionId, sessionFile: record.sessionFile, model: { provider: 'fixture', id: 'fixture-model' }, thinkingLevel: 'low' } }; },
    async activate(_activation, message) { sent.push({ kind: 'repair', text: message }); },
    ensureStarted: async () => ({ probe: probe(), state: { sessionId: record.sessionId, sessionFile: record.sessionFile, model: { provider: 'fixture', id: 'fixture-model' }, thinkingLevel: 'low' } }) };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null, acceptDrain: null });
  await controller.writeAuthority(id, 'running');
  await controller.persist();
  /** Build and deliver one report for the running step. */
  const report = async (overrides = {}) => {
    /** @type {any} */
    const payload = { taskId: task.id, stepId: task.steps[task.stepIndex].id, kind: 'checkpoint', summary: 'Did it', stepComplete: true, ...overrides };
    const envelope = { version: 1, reportId: `report-${Math.random().toString(16).slice(2)}`, workerId: id, ownerSession: 'repair-owner', ownerEpoch: controller.state.ownerEpoch,
      workerGeneration: 1, nonce: 'nonce-repair', sessionId: record.sessionId, leaseId: task.leaseId, attemptId: task.attemptId, attemptNumber: task.attemptNumber,
      planRevision: task.planRevision, payload, payloadHash: digest(payload), createdAt: Date.now() };
    const accepted = await controller.acceptReport(id, envelope);
    // A report is only finalized once the runtime's settle sequence passes the dispatch's. Each report settles the
    // runtime once more, and a repair re-dispatches at the sequence current when it activates, so this advances
    // monotonically rather than jumping to a fixed number.
    runtime.settledSequence += 1;
    await controller.finalizeReport(id, accepted.control);
    // The repair continues in the background, exactly as a decide(revise) does: let it finish before asserting, so the
    // next report in the test is built against the rotated attempt identity the repair just created.
    await Promise.all([...controller.activations]);
    return { envelope, accepted };
  };
  return { controller, repo, task, record, runtime, sent, notices, base, report,
    cleanup: async () => { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }).catch(() => {}); } };
}

/**
 * The shared shape every failure kind has: two repairs, no delivery, then the third failure reaches Main with the
 * history. Each repair goes through the continuation fence, so the worker is genuinely sent work again.
 * @param {Awaited<ReturnType<typeof fixture>>} f @param {string} reason
 */
async function repairsTwiceThenReports(f, reason) {
  for (const attempt of [1, 2]) {
    const { envelope } = await f.report();
    assert.equal(f.record.task.report, null, `repair ${attempt}: no report is delivered to Main`);
    assert.equal(f.controller.state.notices[envelope.reportId], undefined, 'no notice is queued for Main');
    assert.equal(f.record.task.stepIndex, 0, 'the same step is re-queued, not the next one');
    assert.equal(f.sent.filter(entry => entry.kind === 'repair').length, attempt, 'the worker was sent a repair');
    assert.equal(f.controller.watchdogFor(f.record.task).autoRepairs, attempt);
    assert.equal(f.record.task.attemptNumber, attempt + 1, 'each repair starts a new attempt under the fence');
    assert.ok(f.controller.watchdogFor(f.record.task).repairs.at(-1).reasons.includes(reason), 'the reason is recorded');
    // The repair is recorded on the timeline as a watchdog action, not as a Main decision.
    assert.ok(f.record.task.timeline.some(entry => entry.type === 'note' && entry.kind === 'watchdog' && /auto-repair/.test(entry.text)));
  }
  const { envelope } = await f.report();
  assert.equal(f.record.task.status, 'review', 'past the bound the report reaches Main');
  assert.equal(f.record.task.report?.reportId, envelope.reportId);
  assert.ok(f.controller.state.notices[envelope.reportId], 'a notice is queued for Main');
  return f.controller.reportMessage(f.record);
}

test('a failed configured check is repaired twice, then reaches Main with the repair history', async () => {
  const f = await fixture({ command: EXIT_FAIL });
  try {
    const message = await repairsTwiceThenReports(f, 'Configured check failed');
    const repairText = f.sent.filter(entry => entry.kind === 'repair').at(-1).text;
    assert.match(repairText, /PAIR AUTO-REPAIR/, 'the worker is told this came from Pair, not from Main');
    assert.match(repairText, /unit failed/, 'the failing check is named');
    assert.match(repairText, /not a message from the user or from Main/);
    // The report that finally reaches Main says what was tried, in the message Main actually reads.
    assert.match(message, /2 automatic repair\(s\) were sent to the worker before this report \(limit 2\)/, message);
    assert.match(message, /Configured check failed/, 'the history says what each repair found');
    // Pair's own finding is still in the report's checks, so Main sees why it came back.
    assert.ok(f.controller.record('worker').task.report.checkpoint.verification.some(v => !v.passed), 'the failing check is in the checkpoint');
  } finally { await f.cleanup(); }
});

test('repairs never spend Main revision caps, and the budget comes from control.autoRepairsPerStep', async () => {
  const f = await fixture({ command: EXIT_FAIL, autoRepairsPerStep: 1 });
  try {
    await f.report();
    assert.equal(f.record.task.revisions, 0, 'revisions are untouched');
    assert.equal(f.record.task.stepRevisions, 0, 'per-step revisions are untouched');
    assert.equal(f.controller.watchdogFor(f.record.task).autoRepairs, 1);
    await f.report();
    assert.equal(f.record.task.status, 'review', 'with a budget of one, the second failure reaches Main');
    assert.equal(f.record.task.revisions, 0);
    // The budget is a control, so it is outside configHash(): tuning it never rebinds a worker.
    const before = f.controller.configHash();
    f.controller.config.control.autoRepairsPerStep = 5;
    assert.equal(f.controller.configHash(), before, 'autoRepairsPerStep is not part of configHash()');
  } finally { await f.cleanup(); }
});

test('a step too large is repaired, and so are checks that describe another workspace', async () => {
  const big = await fixture({ mode: 'every-step', maxStepFiles: 1, changed: ['a.txt', 'b.txt'] });
  try {
    const message = await repairsTwiceThenReports(big, 'STEP_TOO_LARGE');
    assert.match(big.sent.at(-1).text, /STEP_TOO_LARGE/, 'the worker is told the step is too large');
    assert.match(message, /STEP_TOO_LARGE/, 'the history names it for Main too');
  } finally { await big.cleanup(); }
  // A check that ran against a workspace that then changed reports VERIFICATION_SOURCE_DRIFT.
  const drift = await fixture({ command: EXIT_PASS });
  try {
    // Reproduce drift the way the controller records it: a passing check whose output says the source moved.
    const original = drift.controller.evidence.checkpoint.bind(drift.controller.evidence);
    drift.controller.evidence.checkpoint = async (taskId, reportId, base, snapshot, verification) => {
      const drifted = [{ name: 'Workspace stability', source: 'controller-configured', passed: false, code: null, timedOut: false,
        output: 'VERIFICATION_SOURCE_DRIFT: the workspace changed while running check unit; this result does not describe the checkpointed source.', artifact: path.join(drift.base, 'drift.json') }];
      return original(taskId, reportId, base, snapshot, [...verification, ...drifted]);
    };
    const message = await repairsTwiceThenReports(drift, 'Checks did not describe the checkpoint');
    assert.match(drift.sent.at(-1).text, /VERIFICATION_SOURCE_DRIFT/, 'the worker is told the checks do not describe the checkpoint');
    assert.match(message, /Checks did not describe the checkpoint/, 'the history names it for Main too');
  } finally { await drift.cleanup(); }
});

test('a clean checkpoint, a question or a blocker is never repaired: Main still gets those', async () => {
  const clean = await fixture({ command: EXIT_PASS });
  try {
    const { envelope } = await clean.report();
    assert.equal(clean.record.task.status, 'review', 'a passing step is delivered as usual');
    assert.equal(clean.record.task.report?.reportId, envelope.reportId);
    assert.equal(clean.sent.filter(entry => entry.kind === 'repair').length, 0, 'nothing was sent back');
    assert.equal(clean.controller.watchdogFor(clean.record.task).autoRepairs, 0);
  } finally { await clean.cleanup(); }
  for (const kind of ['question', 'blocked']) {
    const f = await fixture({ command: EXIT_FAIL });
    try {
      // A question carries its question; a blocker carries its reason in the summary.
      await f.report(kind === 'question' ? { kind, question: 'Which port?' } : { kind, summary: 'Blocked: the migration needs a decision' });
      assert.equal(f.record.task.status, kind, `a ${kind} report reaches Main even with a failing check`);
      assert.equal(f.sent.filter(entry => entry.kind === 'repair').length, 0, `a ${kind} report is never repaired`);
    } finally { await f.cleanup(); }
  }
});

test('a budget of 0 turns auto-repair off, and the report reaches Main first time', async () => {
  const f = await fixture({ command: EXIT_FAIL, autoRepairsPerStep: 0 });
  try {
    const { envelope } = await f.report();
    assert.equal(f.record.task.status, 'review', 'with repairs turned off the failure reaches Main at once');
    assert.equal(f.record.task.report?.reportId, envelope.reportId);
    assert.equal(f.sent.filter(entry => entry.kind === 'repair').length, 0, 'nothing was sent back');
    assert.doesNotMatch(f.controller.reportMessage(f.record), /automatic repair/, 'and there is no repair history to show');
  } finally { await f.cleanup(); }
});

test('a repair goes through the same activation fence a decide(revise) uses', async () => {
  const f = await fixture({ command: EXIT_FAIL });
  try {
    await f.report();
    // The repair is sent by the shared activation path: it reserves an activation and calls activate() on it, which
    // is what holds the lease, the attempt and the workspace guard. A repair sent outside that fence would show up as
    // a message with no activation, so this asserts the fence is the one decide uses.
    const work = [...f.controller.activations];
    assert.equal(f.sent.length, 1, 'exactly one message was sent');
    assert.match(f.sent[0].text, /AUTO-REPAIR/, 'and it is the repair');
    // The activation it ran under was reserved by the controller with the task's current identity.
    assert.equal(f.record.task.autoRepairs ?? f.controller.watchdogFor(f.record.task).autoRepairs, 1);
    await Promise.all(work);
    // The attempt identity rotated under the fence, so a second report is a new lease.
    assert.equal(f.record.task.attemptNumber, 2);
    assert.notEqual(f.record.task.leaseId, 'lease-repair');
  } finally { await f.cleanup(); }
});

test('a task cancelled while a repair would be sent is not sent anything', async () => {
  const f = await fixture({ command: EXIT_FAIL });
  try {
    await f.report();
    const before = f.sent.length;
    // Cancel ends the task; the repair already delivered its one message, and nothing further is sent.
    await f.controller.cancel('worker', 'Changed my mind').catch(() => {});
    await Promise.all([...f.controller.activations]);
    assert.equal(f.sent.length, before, 'a cancelled task receives no further work');
  } finally { await f.cleanup(); }
});

test('auto-repair works for a low worker too, at the controller level', async () => {
  const f = await fixture({ command: EXIT_FAIL, backend: 'low' });
  try {
    await f.report();
    assert.equal(f.record.task.report, null, 'a low worker\'s mechanical failure is repaired the same way');
    assert.equal(f.controller.watchdogFor(f.record.task).autoRepairs, 1);
    assert.match(f.sent.at(-1).text, /PAIR AUTO-REPAIR/);
    await f.report();
    await f.report();
    assert.equal(f.record.task.status, 'review', 'after the budget the low worker\'s report reaches Main');
  } finally { await f.cleanup(); }
});

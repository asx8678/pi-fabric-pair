// Per-task cap scaling and "blocked work must reach Main" behaviour. Offline: no inference and no
// spawned worker, only the retained-state fixtures shared with controller-scan-recovery.test.js.
import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PairController, taskSummary } from '../src/controller.js';
import { effectiveCaps } from '../src/metrics.js';
import { loadConfig } from '../src/config.js';
import { digest, PROTOCOL } from '../src/util.js';
import { registerMain } from '../src/main.js';
import { configPaths } from '../src/config.js';

const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };

/** A running worker fixture with the same retained shapes the scan-recovery suite uses. */
async function fixture({ options = {}, config = {} } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-notice-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true,
    workers: [{ id: 'worker', provider: 'zro', model: 'deepseek-v4.1-flash', effort: 'high', cwd: null, readOnly: false }],
    ...config,
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const userNotices = [], mainNotices = [], checks = [], settled = [];
  const controller = new PairController({
    config: loaded.config, cwd: repo, ownerSession: 'notice-test-owner', sourcePaths: [], scanIntervalMs: 600000, ...options,
    storageDir: path.join(base, 'state'),
    callbacks: {
      notifyUser: (message, level = 'info') => userNotices.push({ message, level }),
      // noticeMain is the non-waking notice; superviseMain is the supervised recovery request.
      noticeMain: message => mainNotices.push({ kind: 'notice', message }),
      superviseMain: message => mainNotices.push({ kind: 'supervision', message }),
      checkMain: message => checks.push(message),
      taskSettled: () => settled.push(Date.now()),
      promptUser: async () => ({ cancelled: true }),
    },
  });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const task = {
    id: 'task-notice-1', workerId: id, requestId: 'req-notice-1', objective: 'Notice fixture', context: 'test',
    constraints: [], steps: [{ id: 's1', title: 'Step', instructions: 'Do the thing' }], stepIndex: 0, planRevision: 1,
    attemptId: 'attempt-notice-1', attemptNumber: 1, status: 'running', leaseId: 'lease-notice-1',
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 3, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: { commands: [], requirePassing: false, timeoutMs: 120000 },
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    dispatchSettleSequence: 0, pendingSince: 0, abortRequested: false, interruption: '',
    previousStatus: '', completedAt: 0, cancelReason: '',
  };
  const record = {
    id, cwd: repo, repoRoot: repo, status: 'working', sessionId: 'sess-notice-1',
    sessionFile: path.join(controller.dir, 'sessions', 'w-notice.jsonl'), bound: { ...spec }, task,
    history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1,
  };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(record.sessionFile, '');
  const baseSnap = await controller.evidence.capture(repo);
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(baseSnap);
  const runtime = {
    ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-notice-1', pid: 424243, dir: workerDir,
    sessionId: record.sessionId, ready: true, closed: false, fault: null, settledSequence: 1,
    takeObservations: () => [], abortCurrent: () => Promise.resolve(), abortAndStop: () => Promise.resolve(),
    waitIdle: () => Promise.resolve(), snapshot: () => ({ idle: true }), revoke: () => {},
    settleOrAbort(reason) { return this.abortCurrent(reason); },
  };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, {
    configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id),
    pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null,
  });
  await controller.writeAuthority(id, 'running');
  await controller.persist();
  return { controller, repo, task, record, runtime, workerDir, userNotices, mainNotices, checks, settled, base };
}

async function cleanup(f) {
  f.runtime.closed = true;
  await f.controller.close().catch(() => {});
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}

function envelope({ controller, task, record, runtime, kind = 'checkpoint', reportId = 'report-notice-1' }) {
  const payload = { taskId: task.id, stepId: task.steps[task.stepIndex].id, kind, summary: 'Fixture report', decisions: [], changedFiles: [], checks: [], stepComplete: true };
  return {
    version: PROTOCOL, reportId, workerId: record.id, ownerSession: controller.ownerSession,
    ownerEpoch: controller.state.ownerEpoch, workerGeneration: record.workerGeneration, nonce: runtime.nonce,
    sessionId: record.sessionId, leaseId: task.leaseId, attemptId: task.attemptId, attemptNumber: task.attemptNumber,
    planRevision: task.planRevision, payload, payloadHash: digest(payload), createdAt: Date.now(),
  };
}

async function until(check, ms = 3000) {
  for (const end = Date.now() + ms; !check(); await new Promise(resolve => setTimeout(resolve, 10))) assert.ok(Date.now() < end, 'timed out waiting for background work');
}
async function runScan(controller) {
  const jobs = [];
  await controller.scan(jobs);
  for (const job of jobs) await job();
  // Supervision notices are mounted after containment jobs, exactly as scheduleScan does it.
  for (const send of controller.scanNotices.splice(0)) send();
}

/** @param {number} count */
const steps = count => Array.from({ length: count }, (_, index) => ({ id: `s${index + 1}`, title: `Step ${index + 1}`, instructions: 'fixture' }));

test('configured caps stay floors; a long plan scales both caps with its length', () => {
  const short = { steps: steps(2), policy: { maxRevisions: 20, maxRevisionsPerStep: 3 }, limits: { maxReportsPerTask: 40 } };
  assert.deepEqual(effectiveCaps(short), { maxRevisions: 20, maxReportsPerTask: 40 }, 'configured values win while the plan is short');
  const long = { steps: steps(26), policy: { maxRevisions: 20, maxRevisionsPerStep: 3 }, limits: { maxReportsPerTask: 40 } };
  const caps = effectiveCaps(long);
  assert.ok(caps.maxRevisions >= 52, `26 steps must allow at least two revisions per step (got ${caps.maxRevisions})`);
  assert.ok(caps.maxReportsPerTask >= 130, `26 steps must allow a report per revision (got ${caps.maxReportsPerTask})`);
  const raised = effectiveCaps({ ...long, policy: { maxRevisions: 99, maxRevisionsPerStep: 3 }, limits: { maxReportsPerTask: 500 } });
  assert.deepEqual(raised, { maxRevisions: 99, maxReportsPerTask: 500 }, 'a larger configured value is never lowered');
  assert.deepEqual(effectiveCaps({}), { maxRevisions: 20, maxReportsPerTask: 40 }, 'no task at hand falls back to the configured defaults');
  assert.deepEqual(effectiveCaps(null), { maxRevisions: 20, maxReportsPerTask: 40 });
  assert.deepEqual(effectiveCaps(/** @type {any} */ ({ steps: 'two', policy: { maxRevisions: 'many' } })), { maxRevisions: 20, maxReportsPerTask: 40 }, 'odd stored values are ignored, never thrown on');
});

test('taskSummary and autoCap report the effective caps; decide() uses them for revisions', async () => {
  const f = await fixture();
  const { controller, task } = f;
  try {
    task.steps = steps(26);
    task.policy = { ...task.policy, maxRevisions: 20, maxRevisionsPerStep: 3 };
    task.limits = { ...task.limits, maxReportsPerTask: 40 };
    assert.equal(taskSummary(task).limits.maxRevisions, 52, 'the dashboard shows the effective revision allowance');
    assert.equal(controller.autoCap(task.id), 130, 'the delivery cap scales with the plan length');
    task.steps = steps(2);
    assert.equal(taskSummary(task).limits.maxRevisions, 20);
    assert.equal(controller.autoCap(task.id), 40);
    // A configured value above the scaled one still wins.
    task.limits = { ...task.limits, maxReportsPerTask: 500 };
    assert.equal(controller.autoCap(task.id), 500);
  } finally { await cleanup(f); }
});

test('a report blocked by the delivery cap toasts the human once and asks Main once', async () => {
  const f = await fixture();
  const { controller, task, record, runtime, workerDir, userNotices, checks } = f;
  try {
    task.steps = steps(2);
    task.limits = { ...task.limits, maxReportsPerTask: 1 };
    // Deliveries already spent: one per automatic delivery the effective cap allows, so the next one is held.
    const cap = controller.autoCap(task.id);
    assert.equal(cap, 10, 'the configured floor of 1 is scaled to two steps at three revisions each');
    for (let index = 0; index < cap; index++) controller.state.notices[`report-spent-${index}`] = {
      reportId: `report-spent-${index}`, workerId: 'worker', taskId: task.id, ownerEpoch: controller.state.ownerEpoch,
      workerGeneration: 1, attemptId: task.attemptId, deliveryOperationId: `delivery-spent-${index}`, status: 'delivered', createdAt: Date.now(), channel: 'auto',
    };
    const report = envelope({ controller, task, record, runtime });
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    // Finalize without auto-delivering, then let the scan announce what it cannot deliver.
    controller.config = { ...controller.config, autoDeliverReports: false };
    await runScan(controller);
    await until(() => task.status === 'review');
    controller.config = { ...controller.config, autoDeliverReports: true };
    assert.deepEqual(controller.autoEligible(), [], 'the cap is reached, so nothing is automatically deliverable');
    assert.equal(checks.length, 0, 'a pure predicate never sends a check');
    await runScan(controller);
    assert.match(checks[0], /FABRIC PAIR CHECK — report report-notice-1 from worker worker is waiting in the inbox/);
    assert.match(checks[0], /Call pair_yield to receive it, then review it\./);
    assert.match(checks[0], /delivery cap/);
    assert.ok(userNotices.some(n => n.level === 'warning' && n.message.includes('report-notice-1') && n.message.includes('inbox')), 'the human is told the report is waiting');
    // A second scan of the same held report never repeats either notice.
    await runScan(controller);
    await controller.autoEligible();
    assert.equal(checks.length, 1, 'Main is asked exactly once per report');
  } finally { await cleanup(f); }
});

test('a report whose automatic delivery attempts are spent still reaches Main', async () => {
  const f = await fixture();
  const { controller, task, record, runtime, workerDir, userNotices, checks } = f;
  try {
    const report = envelope({ controller, task, record, runtime });
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    controller.config = { ...controller.config, autoDeliverReports: false };
    await runScan(controller);
    await until(() => task.status === 'review');
    controller.config = { ...controller.config, autoDeliverReports: true };
    controller.state.notices[report.reportId].autoAttempts = 3;
    assert.deepEqual(controller.autoEligible(), [], 'spent attempts are not eligible for automatic delivery');
    await runScan(controller);
    assert.equal(checks.filter(message => message.includes(report.reportId)).length, 1, 'Main is asked once for the stuck report');
    assert.ok(userNotices.some(n => n.message.includes(report.reportId)), 'the human keeps the toast');
  } finally { await cleanup(f); }
});

test('an unresolved task with no worker running asks Main to check, once per state, never for a human pause', async () => {
  const f = await fixture();
  const { controller, task, runtime } = f;
  try {
    runtime.settledSequence = 2; task.dispatchSettleSequence = 0; // the worker ended without a report
    await runScan(controller);
    assert.equal(task.status, 'interrupted');
    assert.equal(f.settled.length, 1, 'the interruption wakes Main');
    await runScan(controller);
    assert.equal(f.settled.length, 1, 'the same task state never wakes Main twice');
    // A human pause is never an automatic wake, even from a new state.
    task.status = 'paused'; task.pausedBy = 'human'; task.updatedAt = Date.now();
    await runScan(controller);
    assert.equal(f.settled.length, 1, 'a human pause waits for the human');
    // A question with no worker running does wake it, once.
    task.status = 'question'; delete task.pausedBy; task.updatedAt = Date.now() + 1;
    await runScan(controller);
    assert.equal(f.settled.length, 2);
  } finally { await cleanup(f); }
});

test('a run that ends without a report toasts the human with the reason', async () => {
  // With the watchdog off there is no automatic re-prompt: the stop is the human's to act on.
  const f = await fixture({ config: { control: { watchdog: false } } });
  const { controller, task, runtime, userNotices } = f;
  try {
    runtime.settledSequence = 2; task.dispatchSettleSequence = 0;
    await runScan(controller);
    const toast = userNotices.find(n => n.level === 'warning' && n.message.includes('without a pair_report'));
    assert.ok(toast, 'the human is warned, not only Main');
    assert.match(toast.message, /task is held as interrupted/);
  } finally { await cleanup(f); }
});

test('a settle timeout toasts the human with the reason', async () => {
  const f = await fixture();
  const { controller, task, runtime, workerDir, userNotices } = f;
  try {
    // The run never settles: the reported lease stays queued and the settle timeout owns it.
    task.dispatchSettleSequence = runtime.settledSequence;
    const report = envelope({ controller, task, record: f.record, runtime });
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    await runScan(controller);
    assert.equal(task.status, 'awaiting_settle');
    task.pendingSince = Date.now() - 31000;
    await runScan(controller);
    assert.ok(userNotices.some(n => n.level === 'warning' && n.message.includes('did not settle after reporting')), 'the settle timeout reaches the human');
  } finally { await cleanup(f); }
});

test('a budget reached at activation also supervises Main', async () => {
  const f = await fixture({ config: { mainSupervision: true } });
  const { controller, task, record, runtime, mainNotices } = f;
  try {
    Object.assign(runtime, {
      reserveActivation: identity => Object.freeze({ ...identity, serial: 1 }), activationCurrent: () => true,
      ensureStarted: async () => ({ probe: null, state: { sessionId: record.sessionId, sessionFile: record.sessionFile } }),
      prepareActivation: async () => ({ probe: null }), activate: async () => { assert.fail('a spent budget must not start a run'); },
    });
    task.usage = { ...ZERO_USAGE, reportedCost: 5 };
    task.limits = { ...task.limits, maxReportedCostUsd: 1 };
    const launch = { id: 'worker', record, runtime, intent: controller.intent('worker'), configHash: controller.configHash() };
    const work = controller.reserveWork(launch, task);
    assert.equal(await controller.activate(work, 'fixture work'), false);
    await until(() => mainNotices.length > 0);
    const [notice] = mainNotices;
    assert.equal(notice.kind, 'supervision', 'a budget stop asks Main to supervise');
    assert.match(notice.message, /FABRIC PAIR SUPERVISION .*is paused/);
    assert.match(notice.message, /Reported inference-cost budget reached/);
    assert.match(notice.message, /pair_recover/);
  } finally { await cleanup(f); }
});

test('with Main supervision off, a stop still reaches Main as a non-waking notice', async () => {
  const f = await fixture({ config: { mainSupervision: false, control: { watchdog: false } } });
  const { controller, task, runtime, mainNotices } = f;
  try {
    controller.config = { ...controller.config, mainSupervision: false };
    runtime.settledSequence = 2; task.dispatchSettleSequence = 0;
    await runScan(controller);
    await until(() => mainNotices.length > 0);
    const notice = mainNotices.find(item => item.kind === 'notice');
    assert.ok(notice, 'supervision off is not silence');
    assert.match(notice.message, /^FABRIC PAIR NOTICE — worker worker, task task-notice-1/);
    assert.match(notice.message, /Main supervision is off: tell the user/);
    assert.match(notice.message, /is stopped, step 1\/1/);
  } finally { await cleanup(f); }
});

/** A Main fixture: the registered extension, its tools and the messages it would send. */
async function mainFixture(run, config = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-notice-main-'));
  const cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  await fs.writeFile(configPaths(cwd).project, JSON.stringify({ version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }], ...config }));
  const events = new Map(), tools = new Map(), messages = [], notices = [];
  const ctx = { cwd, mode: 'rpc', hasUI: true, isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => 'notice-main-owner', getSessionFile: () => path.join(home, 'main.jsonl'), getBranch: () => [] },
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
    controller.rpcFactory = () => { throw Error('RPC spawn forbidden in the notice fixture'); };
    // The controller is created lazily; bind the Main callbacks by re-resolving it once.
    await run({ controller, events, messages, notices, ctx, base, cwd, home });
  } finally {
    // The fixture writes state directly, so drop the injected record before shutdown: Pair still requires a
    // stop for every retained generation and this fixture never started one.
    const c = main.getController();
    if (c) { delete c.state.workers.worker; delete c.state.notices['report-held']; c.state = { ...c.state }; }
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

test('Main is prompted to pair_yield for a report that is not automatically deliverable', () => mainFixture(async f => {
  const bound = f.controller;
  const payload = { taskId: 'task-held', stepId: 's1', kind: 'checkpoint', summary: 'Held report', decisions: [], changedFiles: [], checks: [], stepComplete: true };
  const snapshot = await bound.evidence.capture(f.cwd);
  bound.state.workers.worker = { id: 'worker', cwd: f.cwd, repoRoot: f.cwd, status: 'review', bound: bound.config.workers[0], workerGeneration: 1, history: [], usage: null,
    sessionId: 'fixture-session', sessionFile: path.join(bound.dir, 'fixture-session.jsonl'),
    task: { id: 'task-held', workerId: 'worker', requestId: 'req-held', objective: 'Held task', context: '', constraints: [], steps: [{ id: 's1', title: 'Step', instructions: 'x' }],
      stepIndex: 0, planRevision: 1, attemptId: 'attempt-held', attemptNumber: 1, status: 'review', leaseId: 'lease-held', policy: { ...bound.config.supervision },
      limits: { ...bound.config.limits }, verification: { ...bound.config.verification }, startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 1, usage: null,
      baseSnapshotRef: '/fixture/base', pendingReport: null, decisions: {}, lastDecision: null,
      report: { version: PROTOCOL, reportId: 'report-held', workerId: 'worker', ownerSession: bound.ownerSession, ownerEpoch: bound.state.ownerEpoch, workerGeneration: 1,
        nonce: 'fixture-nonce', sessionId: 'fixture-session', leaseId: 'lease-held', attemptId: 'attempt-held', attemptNumber: 1, planRevision: 1,
        payload, payloadHash: digest(payload), createdAt: Date.now(),
        checkpoint: await bound.evidence.checkpoint('task-held', 'report-held', snapshot, snapshot, []), snapshotRef: '/fixture' } } };
  bound.state.requests['req-held'] = { hash: digest('req-held'), taskId: 'task-held', workerId: 'worker', acceptedAt: Date.now(), status: 'review' };
  bound.state.notices['report-held'] = { reportId: 'report-held', workerId: 'worker', taskId: 'task-held', ownerEpoch: bound.state.ownerEpoch, workerGeneration: 1,
    attemptId: 'attempt-held', deliveryOperationId: 'delivery-held', status: 'pending', createdAt: Date.now(), autoAttempts: 3 };
  f.messages.length = 0;
  // Two independent triggers for the same event: the scan announces the held report, and checkIdle runs
  // when a completed turn settles. Both must be pure/scoped enough that Main is woken exactly once.
  bound.callbacks.checkMain('FABRIC PAIR CHECK — report report-held from worker worker is waiting in the inbox (automatic delivery failed and its attempts are spent). Call pair_yield to receive it, then review it.', { reportId: 'report-held', workerId: 'worker', taskId: 'task-held' });
  bound.callbacks.checkMain('FABRIC PAIR CHECK — report report-held from worker worker is waiting in the inbox (automatic delivery failed and its attempts are spent). Call pair_yield to receive it, then review it.', { reportId: 'report-held', workerId: 'worker', taskId: 'task-held' });
  f.events.get('agent_start')({}, f.ctx);
  await f.events.get('agent_before_settle')({ type: 'agent_before_settle', outcome: 'completed', entries: [], continue: false, context: { canContinue: false, pendingMessages: [] } }, f.ctx);
  await f.events.get('agent_settled')({}, f.ctx);
  const checks = f.messages.filter(([message]) => message.customType === 'fabric-pair.check').map(([message]) => String(message.content));
  const wakes = f.messages.filter(([message]) => message === 'Pair: Main is idle with unfinished Pair work (the FABRIC PAIR CHECK above). Check it as the notice describes.');
  assert.equal(checks.length, 1, `one CHECK for one held report, got ${JSON.stringify(checks)}`);
  assert.equal(wakes.length, 1, 'one wake prompt for one held report');
  assert.match(checks[0], /FABRIC PAIR CHECK — report report-held from worker worker is waiting in the inbox \(automatic delivery failed and its attempts are spent\)/);
  assert.match(checks[0], /Call pair_yield to receive it, then review it\./);
}));

test('autoEligible is a pure predicate: only the delivery path announces a held report', async () => {
  const f = await fixture();
  const { controller, task, record, runtime, workerDir, userNotices, checks } = f;
  try {
    task.steps = steps(2);
    task.limits = { ...task.limits, maxReportsPerTask: 1 };
    const cap = controller.autoCap(task.id);
    for (let index = 0; index < cap; index++) controller.state.notices[`report-spent-${index}`] = {
      reportId: `report-spent-${index}`, workerId: 'worker', taskId: task.id, ownerEpoch: controller.state.ownerEpoch,
      workerGeneration: 1, attemptId: task.attemptId, deliveryOperationId: `delivery-spent-${index}`, status: 'delivered', createdAt: Date.now(), channel: 'auto',
    };
    const report = envelope({ controller, task, record, runtime });
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    controller.config = { ...controller.config, autoDeliverReports: false };
    await runScan(controller);
    await until(() => task.status === 'review');
    controller.config = { ...controller.config, autoDeliverReports: true };
    // Repeated predicate calls (checkIdle and two transactions call it) must not send anything.
    for (let index = 0; index < 5; index++) assert.deepEqual(controller.autoEligible(), []);
    assert.equal(checks.length, 0, 'autoEligible never sends a check');
    assert.deepEqual(userNotices, [], 'autoEligible never toasts');
    // The held notice is still discoverable for the next announcement.
    assert.deepEqual(controller.heldNotices().map(held => held.notice.reportId), [report.reportId]);
    // The delivery path announces it, exactly once.
    controller.autoDeliver();
    controller.autoDeliver();
    await until(() => checks.length > 0);
    assert.equal(checks.length, 1, 'one check for the held report');
    assert.equal(userNotices.filter(n => n.level === 'warning').length, 1, 'one human toast for the held report');
  } finally { await cleanup(f); }
});

test('a scan wakes Main only after its containment jobs have run', async () => {
  const f = await fixture();
  const { controller, task, runtime } = f;
  try {
    const order = [];
    const contain = controller.contain.bind(controller);
    controller.contain = async (...args) => { order.push('contain'); return contain(...args); };
    controller.callbacks.taskSettled = () => order.push('wake');
    runtime.settledSequence = 2; task.dispatchSettleSequence = 0; // ends without a report: interrupt + contain
    const jobs = [];
    await controller.scan(jobs);
    assert.deepEqual(order, [], 'the scan itself wakes nobody; notices are mounted after the jobs');
    for (const job of jobs) await job();
    assert.equal(order.filter(entry => entry === 'wake').length, 0, 'containment ran first');
    for (const send of controller.scanNotices.splice(0)) send();
    assert.deepEqual(order, ['contain', 'wake'], 'the wake follows the containment job');
  } finally { await cleanup(f); }
});


// Step-limit escape: re-planning a step past its per-step revision limit, and Main fixing a
// reported step itself ('fix' -> edit -> 'fixed'). Offline: retained-state fixtures only.
import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PairController, replansCurrentStep, stepLimitMessage } from '../src/controller.js';
import { registerMain } from '../src/main.js';
import { configPaths } from '../src/config.js';
import { loadConfig } from '../src/config.js';
import { digest, PROTOCOL } from '../src/util.js';
import { validateStoredState } from '../src/contracts.js';
import { normalizeTimeline } from '../src/timeline.js';
import { timelineLine } from '../src/ui.js';

const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };

async function fixture({ verification = { commands: [], requirePassing: true, timeoutMs: 60000 }, steps = 2 } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-step-limit-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    verification: { commands: verification.commands, requirePassing: verification.requirePassing, timeoutMs: verification.timeoutMs },
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const userNotices = [], mainNotices = [];
  const controller = new PairController({
    config: loaded.config, cwd: repo, ownerSession: 'step-limit-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: {
      notifyUser: (message, level = 'info') => userNotices.push({ message, level }),
      noticeMain: message => mainNotices.push({ kind: 'notice', message }),
      superviseMain: message => mainNotices.push({ kind: 'supervision', message }),
      promptUser: async () => ({ cancelled: true }),
    },
  });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const task = {
    id: 'task-step-limit', workerId: id, requestId: 'req-step-limit', objective: 'Escape a step limit', context: 'test',
    constraints: [], steps: Array.from({ length: steps }, (_, index) => ({ id: `s${index + 1}`, title: `Step ${index + 1}`, instructions: 'Do the thing' })),
    stepIndex: 0, planRevision: 1, attemptId: 'attempt-step-limit', attemptNumber: 1, status: 'review', leaseId: 'lease-step-limit',
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: structuredClone(controller.config.verification),
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    dispatchSettleSequence: 0, pendingSince: 0, abortRequested: false, interruption: '',
    previousStatus: '', completedAt: 0, cancelReason: '', stepRevisions: 3,
  };
  const record = {
    id, cwd: repo, repoRoot: repo, status: 'review', sessionId: 'sess-step-limit',
    sessionFile: path.join(controller.dir, 'sessions', 'w-step-limit.jsonl'), bound: { ...spec }, task,
    history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1,
  };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(record.sessionFile, '');
  const baseSnapshot = await controller.evidence.capture(repo);
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(baseSnapshot);
  // A worker has already reported once on step 1 at its per-step revision limit.
  const payload = { taskId: task.id, stepId: task.steps[0].id, kind: 'checkpoint', summary: 'First attempt', decisions: [], changedFiles: [], checks: [], stepComplete: true };
  const checkpoint = await controller.evidence.checkpoint(task.id, 'report-limit-1', baseSnapshot, baseSnapshot, []);
  task.report = { version: PROTOCOL, reportId: 'report-limit-1', workerId: id, ownerSession: controller.ownerSession, ownerEpoch: controller.state.ownerEpoch,
    workerGeneration: 1, nonce: 'nonce-step-limit', sessionId: record.sessionId, leaseId: task.leaseId, attemptId: task.attemptId, attemptNumber: 1, planRevision: 1,
    payload, payloadHash: digest(payload), createdAt: Date.now(), checkpoint, snapshotRef: await controller.evidence.saveSnapshot(baseSnapshot), inspectedAt: Date.now() };
  controller.state.notices['report-limit-1'] = { reportId: 'report-limit-1', workerId: id, taskId: task.id, ownerEpoch: controller.state.ownerEpoch,
    workerGeneration: 1, attemptId: task.attemptId, deliveryOperationId: 'delivery-limit-1', status: 'offered', createdAt: Date.now(), channel: 'tool-result', observedAt: Date.now() };
  const runtime = {
    ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-step-limit', pid: 424244, dir: workerDir,
    sessionId: record.sessionId, ready: true, closed: false, fault: null, settledSequence: 1,
    takeObservations: () => [], abortCurrent: () => Promise.resolve(), abortAndStop: () => Promise.resolve(),
    waitIdle: () => Promise.resolve(), snapshot: () => ({ idle: true }), revoke: () => {},
    settleOrAbort(reason) { return this.abortCurrent(reason); },
  };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
  await controller.writeAuthority(id, 'waiting');
  await controller.persist();
  return { controller, repo, task, record, runtime, workerDir, userNotices, mainNotices, base };
}

async function cleanup(f) {
  f.runtime.closed = true;
  await f.controller.close().catch(() => {});
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}

/** Let a continuation that a decision started run to a resting point. */
async function settled(controller) { await Promise.all([...controller.activations]); await controller.scanPromise?.catch(() => {}); }

/** Stub the continuation path so a decision can reach activation without a real worker. */
function stubContinuation(runtime, record) {
  const prompts = [];
  let serial = 0;
  Object.assign(runtime, {
    reserveActivation: identity => Object.freeze({ ...identity, serial: ++serial }), activationCurrent: () => true,
    ensureStarted: async () => ({ probe: record.probe || null, state: { sessionId: record.sessionId, sessionFile: record.sessionFile } }),
    prepareActivation: async () => ({ probe: record.probe || null }),
    activate: async (...args) => { prompts.push(args); },
  });
  return prompts;
}

const splitStep = { id: 's1', title: 'Step 1 (split)', instructions: 'Do the first half', acceptance: ['half done'] };

/** A Main fixture: the registered extension, its tools and what it would send. */
async function mainFixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-step-main-'));
  const cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  await fs.writeFile(configPaths(cwd).project, JSON.stringify({ version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }] }));
  const events = new Map(), tools = new Map(), notices = [], messages = [];
  const ctx = { cwd, mode: 'rpc', hasUI: true, isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => 'step-limit-main', getSessionFile: () => path.join(home, 'main.jsonl'), getBranch: () => [] },
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
    controller.rpcFactory = () => { throw Error('RPC spawn forbidden in the step-limit fixture'); };
    await run({ controller, events, tools, messages, notices, ctx, cwd });
  } finally {
    const c = main.getController();
    if (c) { delete c.state.workers.worker; delete c.state.notices['report-held']; }
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}
/** A retained review task with a valid report, so the read-only gate has something to supervise. */
function heldTask(bound, cwd, extra = {}) {
  const payload = { taskId: 'task-held', stepId: 's1', kind: 'checkpoint', summary: 'Held report', decisions: [], changedFiles: [], checks: [], stepComplete: true };
  return { id: 'task-held', workerId: 'worker', requestId: 'req-held', objective: 'Held task', context: '', constraints: [],
    steps: [{ id: 's1', title: 'Step', instructions: 'x' }], stepIndex: 0, planRevision: 1, attemptId: 'attempt-held', attemptNumber: 1,
    status: 'review', leaseId: 'lease-held', policy: { ...bound.config.supervision }, limits: { ...bound.config.limits },
    verification: { ...bound.config.verification }, startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 1, usage: null,
    baseSnapshotRef: '/fixture/base', pendingReport: null, decisions: {}, lastDecision: null,
    report: { version: PROTOCOL, reportId: 'report-held', workerId: 'worker', ownerSession: bound.ownerSession, ownerEpoch: bound.state.ownerEpoch,
      workerGeneration: 1, nonce: 'fixture-nonce', sessionId: 'fixture-session', leaseId: 'lease-held', attemptId: 'attempt-held', attemptNumber: 1,
      planRevision: 1, payload, payloadHash: digest(payload), createdAt: Date.now(),
      checkpoint: { path: path.join(cwd, 'evidence'), checkpointHash: 'a'.repeat(64), changed: [], verification: [], patchTruncated: false }, snapshotRef: '/fixture' }, ...extra };
}


test('a revise at the per-step limit is refused unless it re-plans the current step, and the message lists the options', async () => {
  const f = await fixture();
  const { controller, task } = f;
  try {
    await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'revise', feedback: 'again' }),
      (error) => {
        assert.match(error.message, /STEP_REVISION_LIMIT: this step reached its revision limit \(3\)/);
        for (const option of ['approve', 're-plan the step', 'fix it yourself', 'cancel']) assert.ok(error.message.includes(option), `the message names "${option}"`);
        return true;
      });
    assert.equal(task.stepRevisions, 3, 'a refused revise changes nothing');
    assert.equal(task.stepReplans, undefined);
    // A revise that resends the same current step is not a re-plan either.
    await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'revise', feedback: 'again', steps: structuredClone(task.steps) }), /STEP_REVISION_LIMIT/);
    assert.equal(replansCurrentStep(task, structuredClone(task.steps)), false);
    assert.equal(replansCurrentStep(task, [splitStep, task.steps[1]]), true);
    assert.equal(stepLimitMessage(task).includes('2 re-plans per step position'), true);
  } finally { await cleanup(f); }
});

test('re-planning past the limit resets the per-step count, is bounded to two per step, and continues the worker', async () => {
  const f = await fixture();
  const { controller, task, runtime, record } = f;
  try {
    const prompts = stubContinuation(runtime, record);
    const plan = [splitStep, ...task.steps.slice(1)];
    const first = await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'revise', feedback: 'split it', steps: plan });
    assert.equal(first.message, 'Decision recorded; the worker continues in the background. Do not wait or poll.');
    await settled(controller);
    assert.equal(prompts.length, 1, 'the re-plan continues the same worker');
    assert.equal(task.stepRevisions, 0, 'a re-planned current step starts a fresh per-step count');
    assert.deepEqual(task.stepReplans, { index: 0, count: 1 });
    assert.equal(task.steps[0].title, 'Step 1 (split)');
    assert.equal(task.planRevision, 2);
  } finally { await cleanup(f); }
});

test('the re-plan bound is enforced per step position', async () => {
  const f = await fixture();
  const { controller, task } = f;
  try {
    task.stepRevisions = 3;
    task.stepReplans = { index: 0, count: 2 };
    await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'revise', feedback: 'third try', steps: [splitStep, task.steps[1]] }), /STEP_REVISION_LIMIT/);
    // The bound is per position: a different index starts from zero.
    task.stepReplans = { index: 1, count: 2 };
    const prompts = stubContinuation(f.runtime, f.record);
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'revise', feedback: 're-plan step 1', steps: [splitStep, task.steps[1]] });
    await settled(controller);
    assert.deepEqual(task.stepReplans, { index: 0, count: 1 });
    assert.equal(prompts.length, 1);
  } finally { await cleanup(f); }
});

test('fix takes the workspace, refuses other decisions, and fixed verifies, advances and continues the worker', async () => {
  const f = await fixture();
  const { controller, task, runtime, record, repo, userNotices } = f;
  try {
    const prompts = stubContinuation(runtime, record);
    const opened = await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fix', feedback: 'I will fix the export' });
    assert.equal(opened.fixing, true);
    assert.match(opened.instruction, /pair_decide with action "fixed"/);
    assert.deepEqual(task.mainFix && { reportId: task.mainFix.reportId }, { reportId: 'report-limit-1' });
    assert.ok(userNotices.some(n => n.message.includes('Main is fixing step 1')), 'the human is told Main took the step');
    assert.ok(normalizeTimeline(task.timeline).some(entry => entry.type === 'note' && entry.kind === 'main-fix'), 'the fix is recorded in the timeline');
    // While the fix is open every other decision on that report is refused.
    for (const action of ['approve', 'revise']) {
      await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action, feedback: 'x', ...(action === 'approve' ? { checkpointHash: task.report.checkpoint.checkpointHash } : { steps: [splitStep, task.steps[1]] }) }),
        /Main is fixing step 1 directly/);
    }
    await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'answer', feedback: 'x' }), /Main is fixing step 1 directly/);
    // Main edits the code, then finishes.
    await fs.writeFile(path.join(repo, 'fixed-by-main.js'), 'export const fixed = true;\n');
    const done = await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fixed', feedback: 'Added the missing export' });
    assert.equal(done.fixed, true);
    assert.deepEqual(done.fixedFiles, ['fixed-by-main.js']);
    await settled(controller);
    assert.equal(prompts.length, 1, 'the worker continues on the next step');
    assert.match(String(prompts[0][1]), /MAIN FIX/);
    assert.match(String(prompts[0][1]), /Main fixed step 1 directly: Added the missing export/);
    assert.match(String(prompts[0][1]), /- fixed-by-main\.js/);
    assert.match(String(prompts[0][1]), /do not undo them/);
    assert.equal(task.mainFix, undefined, 'fix mode is cleared');
    assert.equal(task.stepIndex, 1, 'a Main fix always completes the current step');
    assert.equal(task.stepRevisions, 0);
    assert.ok(['activating', 'running'].includes(task.status), 'the worker was re-activated on the next step');
    assert.equal(task.decisions['report-limit-1'].action, 'fixed');
    assert.equal(controller.state.notices['report-limit-1'].status, 'resolved');
    assert.notEqual(task.baseSnapshotRef, undefined, 'the Main-fix snapshot becomes the new base');
    assert.notEqual(task.baseSnapshotRef, task.report.snapshotRef, 'the base advanced past the reported checkpoint');
  } finally { await cleanup(f); }
});

test('fixed refuses a failing required check and keeps fix mode', async () => {
  const f = await fixture({ verification: { commands: [{ name: 'test', command: process.execPath, args: ['-e', 'process.exit(1)'] }], requirePassing: true, timeoutMs: 60000 } });
  const { controller, task } = f;
  try {
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fix', feedback: 'fix it' });
    await fs.writeFile(path.join(f.repo, 'still-broken.js'), 'export const broken = true;\n');
    await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fixed', feedback: 'tried' }),
      (error) => {
        assert.match(error.message, /Configured verification failed/);
        assert.match(error.message, /test: /, 'the failing output is returned');
        return true;
      });
    assert.ok(task.mainFix, 'fix mode stays open so Main keeps fixing');
    assert.equal(task.stepIndex, 0, 'the step did not advance');
    assert.equal(task.decisions['report-limit-1'], undefined, 'no decision was recorded');
  } finally { await cleanup(f); }
});

test('fixed on the last step completes the task like an approval', async () => {
  const f = await fixture({ steps: 1 });
  const { controller, task, userNotices } = f;
  try {
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fix', feedback: 'fix it' });
    await fs.writeFile(path.join(f.repo, 'last-step.js'), 'export const done = true;\n');
    const done = await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fixed', feedback: 'Finished the last step' });
    assert.equal(done.status, 'completed');
    assert.equal(task.mainFix, undefined);
    assert.ok(userNotices.some(n => n.message.includes('Pair task completed')), 'completion reaches the human');
    assert.equal(task.decisions['report-limit-1'].delivery, 'not_required');
  } finally { await cleanup(f); }
});

test('fix is fenced: it needs a review or blocked report, an inspection, and an unchanged workspace', async () => {
  const f = await fixture();
  const { controller, task, repo } = f;
  try {
    task.status = 'question';
    task.report.payload = { ...task.report.payload, kind: 'question', question: 'Which export?' };
    await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fix', feedback: 'x' }), /needs a review or blocked report/);
    task.status = 'review';
    task.report.payload = { ...task.report.payload, kind: 'checkpoint', question: undefined };
    delete task.report.inspectedAt;
    await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fix', feedback: 'x' }), /Inspect the current checkpoint before fixing/);
    task.report.inspectedAt = Date.now();
    await fs.writeFile(path.join(repo, 'someone-else.js'), 'export const drift = true;\n');
    await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fix', feedback: 'x' }), /STALE_CHECKPOINT/);
    assert.equal(task.mainFix, undefined, 'a refused fix never takes the workspace');
  } finally { await cleanup(f); }
});

test('state written before these fields existed still loads; the new fields validate', async () => {
  const f = await fixture();
  const { controller, task } = f;
  try {
    const stored = JSON.parse(await fs.readFile(path.join(controller.dir, 'state.json'), 'utf8'));
    assert.equal(stored.workers.worker.task.mainFix, undefined);
    assert.equal(stored.workers.worker.task.stepReplans, undefined);
    assert.doesNotThrow(() => validateStoredState(stored, { ownerSession: controller.ownerSession, cwd: controller.repoRoot || controller.cwd }));
    // A Main fix and a re-plan count round-trip through strict stored validation.
    task.stepReplans = { index: 0, count: 2 };
    task.mainFix = { reportId: 'report-limit-1', startedAt: Date.now() };
    await controller.persist();
    const again = JSON.parse(await fs.readFile(path.join(controller.dir, 'state.json'), 'utf8'));
    assert.deepEqual(again.workers.worker.task.stepReplans, { index: 0, count: 2 });
    assert.equal(again.workers.worker.task.mainFix.reportId, 'report-limit-1');
    assert.doesNotThrow(() => validateStoredState(again, { ownerSession: controller.ownerSession, cwd: controller.repoRoot || controller.cwd }));
    // A fix that names a different report is refused at load.
    again.workers.worker.task.mainFix = { reportId: 'report-other', startedAt: Date.now() };
    assert.throws(() => validateStoredState(again, { ownerSession: controller.ownerSession, cwd: controller.repoRoot || controller.cwd }), /Main fix targets a different report/);
  } finally { await cleanup(f); }
});

test('a report at the per-step limit tells Main which ways out exist', async () => {
  const f = await fixture();
  const { controller, task } = f;
  try {
    assert.match(controller.reportMessage(f.record), /revisionLimitNotice/);
    assert.match(controller.reportMessage(f.record), /STEP_REVISION_LIMIT/);
    task.stepRevisions = 1;
    assert.doesNotMatch(controller.reportMessage(f.record), /revisionLimitNotice/);
  } finally { await cleanup(f); }
});

test('a timeline note renders as one short line and keeps old timelines loading', () => {
  const note = { type: 'note', kind: 'main-fix', step: 2, at: 10, text: 'Main is fixing step 2 directly' };
  assert.deepEqual(normalizeTimeline([note]), [note]);
  assert.equal(timelineLine(note).text, '✎ Main fixed this step: Main is fixing step 2 directly');
  assert.equal(timelineLine({ type: 'note', kind: 'steer', step: 1, at: 1, text: 'asked for a checkpoint' }).text, '✎ steered: asked for a checkpoint');
  assert.equal(timelineLine({ type: 'note', kind: 'watchdog', step: 1, at: 1, text: '' }).text, '✎ watchdog');
  // An older file with only report/decision entries is unchanged, and a malformed note is dropped.
  const old = [{ type: 'report', reportId: 'r1', step: 1, kind: 'checkpoint', at: 5, verification: { passed: 1, failed: 0 } }];
  assert.deepEqual(normalizeTimeline(old).map(entry => entry.type), ['report']);
  assert.deepEqual(normalizeTimeline([{ type: 'note', step: 1, at: 1, text: 'no kind' }]), []);
});

test('Main may edit files only while a Main fix owns the step', () => mainFixture(async f => {
  const bound = f.controller;
  const task = heldTask(bound, f.cwd, { mainFix: { reportId: 'report-held', startedAt: Date.now() } });
  bound.state.workers.worker = { id: 'worker', cwd: f.cwd, repoRoot: f.cwd, status: 'review', bound: bound.config.workers[0], workerGeneration: 1,
    sessionId: 'fixture-session', sessionFile: path.join(bound.dir, 'fixture-session.jsonl'), history: [], usage: null, task };
  const blocks = f.events.get('tool_call');
  const write = name => blocks({ toolName: name, input: {} }, f.ctx);
  // A Main fix owns the workspace: edits go through.
  assert.equal(write('write'), undefined, 'a Main fix lets Main edit');
  assert.equal(write('edit'), undefined);
  // Without one, Main stays read-only during an active task.
  delete task.mainFix;
  assert.equal(write('write').block, true);
  assert.match(write('write').reason, /Main is supervising an active Pair task/);
  // The tool_result warning is silent during the fix and returns once it ends.
  const results = f.events.get('tool_result');
  task.mainFix = { reportId: 'report-held', startedAt: Date.now() };
  // providerFileWrite keys on Fabric's tool-result proxy for a file-writing provider action.
  const proxy = { kind: 'pi-fabric.tool-result-proxy.v1', ref: 'schema.commit' };
  results({ toolName: 'schema.commit', details: proxy }, f.ctx);
  assert.equal(f.notices.length, 0, 'writing is the point of a Main fix, so no warning');
  delete task.mainFix;
  results({ toolName: 'schema.commit', details: proxy }, f.ctx);
  assert.ok(f.notices.some(n => /while supervising an active task/.test(n.message)), 'the backstop still warns otherwise');
}));

test('cancel stays available while a Main fix is open', async () => {
  const f = await fixture();
  const { controller, task } = f;
  try {
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fix', feedback: 'fix it' });
    assert.ok(task.mainFix);
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'cancel', feedback: 'Giving up on this step' });
    assert.equal(task.status, 'cancelled', 'cancelling ends the fix and the task');
    assert.equal(task.decisions['report-limit-1'].action, 'cancel');
  } finally { await cleanup(f); }
});

test('a saved Main-fix checkpoint keeps its verification artifacts', async () => {
  const script = "process.stdout.write('all good')";
  const f = await fixture({ verification: { commands: [{ name: 'test', command: process.execPath, args: ['-e', script] }], requirePassing: true, timeoutMs: 60000 } });
  const { controller, task, runtime, record } = f;
  try {
    stubContinuation(runtime, record); // two steps: the fix continues the worker
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fix', feedback: 'fix it' });
    await fs.writeFile(path.join(f.repo, 'artifact-check.js'), 'export const checked = true;\n');
    const done = await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fixed', feedback: 'Added it' });
    assert.equal(done.fixed, true);
    const stored = JSON.parse(await fs.readFile(path.join(controller.dir, 'state.json'), 'utf8'));
    const fixId = task.decisions['report-limit-1'].checkpointHash;
    assert.match(fixId, /^[a-f0-9]{64}$/, 'the decision records the Main-fix checkpoint hash');
    const manifestPath = path.join(controller.dir, 'evidence', 'reports', task.id);
    const fixDir = (await fs.readdir(manifestPath)).find(name => name.startsWith('mainfix-'));
    assert.ok(fixDir, 'the Main-fix checkpoint directory exists');
    const manifest = JSON.parse(await fs.readFile(path.join(manifestPath, fixDir, 'manifest.json'), 'utf8'));
    assert.ok(manifest.verification.length, 'the checkpoint carries its verification results');
    for (const check of manifest.verification) assert.ok(check.artifact, 'every check has an artifact path');
    // The artifacts the checkpoint references must still exist after success.
    for (const check of manifest.verification) await fs.access(check.artifact).catch(error => assert.fail(`missing verification artifact ${check.artifact}: ${error.message}`));
    assert.ok(stored.workers.worker.task.decisions['report-limit-1'], 'the decision is stored');
  } finally { await cleanup(f); }
});

test("the worker is told only the files Main changed, not the worker's own earlier changes", async () => {
  const f = await fixture();
  const { controller, task, runtime, record, repo } = f;
  try {
    // The worker's own change for this step is part of the reported checkpoint.
    await fs.writeFile(path.join(repo, 'worker-file.js'), 'export const fromWorker = true;\n');
    const workerSnapshot = await controller.evidence.capture(repo);
    task.report.snapshotRef = await controller.evidence.saveSnapshot(workerSnapshot);
    task.report.checkpoint = await controller.evidence.checkpoint(task.id, 'report-limit-1', await controller.evidence.readSnapshot(task.baseSnapshotRef, repo), workerSnapshot, []);
    task.report.checkpoint.checkpointHash = workerSnapshot.hash;
    const prompts = stubContinuation(runtime, record);
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fix', feedback: 'adding the missing export' });
    // Main changes a different file.
    await fs.writeFile(path.join(repo, 'main-file.js'), 'export const fromMain = true;\n');
    const done = await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fixed', feedback: 'Added the export Main fixed' });
    await settled(controller);
    assert.deepEqual(done.fixedFiles, ['main-file.js'], 'only Main\'s delta is reported');
    const note = String(prompts[0][1]);
    assert.match(note, /- main-file\.js/);
    assert.doesNotMatch(note, /- worker-file\.js/, 'the worker\'s own earlier change is not blamed on Main');
    // The step's evidence still records both, as checkpoint.changed does.
    const manifestDir = path.join(controller.dir, 'evidence', 'reports', task.id);
    const fixDir = (await fs.readdir(manifestDir)).find(name => name.startsWith('mainfix-'));
    const manifest = JSON.parse(await fs.readFile(path.join(manifestDir, fixDir, 'manifest.json'), 'utf8'));
    assert.deepEqual([...manifest.changed].sort(), ['main-file.js', 'worker-file.js'], 'the checkpoint keeps the full step evidence');
  } finally { await cleanup(f); }
});

test('mainFixMessage renders the step it is given, not the task index', async () => {
  const f = await fixture({ steps: 3 });
  const { controller, task } = f;
  try {
    task.stepIndex = 0;
    const note = controller.mainFixMessage(task, 7, 'fixed it', []);
    assert.match(note, /Main fixed step 7 directly: fixed it/, 'the note uses its own step argument');
    assert.match(note, /"fixedStep":7/);
    assert.match(note, /Files Main changed: none/);
  } finally { await cleanup(f); }
});

test('the Main-fix note names the step Main actually fixed', async () => {
  const f = await fixture({ steps: 3 });
  const { controller, task, runtime, record } = f;
  try {
    // Fixing the second step: the retained report must name that step.
    task.stepIndex = 1;
    task.stepRevisions = 3;
    task.report.payload = { ...task.report.payload, stepId: task.steps[1].id };
    task.report.payloadHash = digest(task.report.payload);
    const prompts = stubContinuation(runtime, record);
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fix', feedback: 'fix step two' });
    await fs.writeFile(path.join(f.repo, 'step-two.js'), 'export const two = true;\n');
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-limit-1', action: 'fixed', feedback: 'Fixed the second step' });
    await settled(controller);
    const note = String(prompts[0][1]);
    assert.match(note, /Main fixed step 2 directly: Fixed the second step/);
    assert.doesNotMatch(note, /Main fixed step 3 directly/);
    assert.match(note, /"fixedStep":2/);
    assert.equal(task.stepIndex, 2, 'the task advanced to the third step');
  } finally { await cleanup(f); }
});

test('Main may edit Pair\'s own settings while a task runs, and no other file', () => mainFixture(async f => {
  const bound = f.controller;
  const task = heldTask(bound, f.cwd, {});
  bound.state.workers.worker = { id: 'worker', cwd: f.cwd, repoRoot: f.cwd, status: 'review', bound: bound.config.workers[0], workerGeneration: 1,
    sessionId: 'fixture-session', sessionFile: path.join(bound.dir, 'fixture-session.jsonl'), history: [], usage: null, task };
  const blocks = f.events.get('tool_call'), project = '.pi/fabric-pair.json';
  const call = (toolName, input) => blocks({ toolName, input }, f.ctx);
  // Pair's own configuration is editable during a task: that is what the merge-on-save path is for.
  assert.equal(call('edit', { path: project }), undefined, 'the project Pair config is writable');
  assert.equal(call('write', { path: '.pi/pair.json' }), undefined, 'and its legacy name');
  assert.equal(call('write', { file_path: '.pi/fabric-pair.json.v1.bak' }), undefined, 'and a backup next to it');
  // Everything else stays blocked, and so does a batch that mixes the two.
  for (const input of [{ path: 'src/app.js' }, { path: '.pi/fabric-pair.json.md' }, { path: 'package.json' }, {}, { files: [{ path: project }, { path: 'src/app.js' }] }])
    assert.equal(call('edit', input)?.block, true, `${JSON.stringify(input)} is blocked`);
  assert.match(call('write', { path: 'src/app.js' }).reason, /Main is supervising an active Pair task/);
  // A Fabric program that can write source files is still refused.
  assert.equal(call('fabric_exec', { code: 'await tools.call({ ref: "schema.commit", args: {} })' })?.block, true);
  // Once the task is over, nothing is blocked.
  delete bound.state.workers.worker.task;
  assert.equal(call('write', { path: 'src/app.js' }), undefined);
}));


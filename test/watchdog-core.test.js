// The watchdog's first rungs: configuration, the missing-report re-prompt, the soft step nudge and the
// bounded automatic recovery. Offline: retained-state fixtures, a fake runtime and small thresholds.
import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PairController } from '../src/controller.js';
import { DEFAULTS, loadConfig, validateConfig } from '../src/config.js';
import { digest } from '../src/util.js';
import { validateStoredState } from '../src/contracts.js';
import { normalizeTimeline } from '../src/timeline.js';

const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };

test('control settings validate with the documented defaults and bounds', () => {
  assert.deepEqual(DEFAULTS.control, { watchdog: true, silentMs: 300000, pingTimeoutMs: 20000, toolMaxMs: 900000, stepNudgeMs: 1200000,
    maxAutoRecoveriesPerStep: 2, autoRepairsPerStep: 2, noReportNudges: 1, maxSteersPerStep: 6, providerCooldownMs: 60000, quotaCooldownMs: 900000, maxProviderWaits: 4, fallbackAfterWaits: 2,
    blockedCommands: ['git\\s+commit\\b', 'git\\s+push\\b', 'git\\s+reset\\s+--hard\\b', 'git\\s+checkout\\s+--\\s', 'git\\s+clean\\s+-[a-z]*f',
      'git\\s+rebase\\b', 'git\\s+stash\\b', 'git\\s+branch\\s+-D\\b', '(npm|pnpm|yarn|bun)\\s+publish\\b', 'sudo(\\s|$)', 'rm\\s+-[a-zA-Z]*[rR][a-zA-Z]*[fF][a-zA-Z]*\\s+(/|~)',
      'rm\\s+-[a-zA-Z]*[fF][a-zA-Z]*[rR][a-zA-Z]*\\s+(/|~)', 'rm\\s+(?:-[rR]\\s+-[fF]|-[fF]\\s+-[rR])\\s+(/|~)'],
    defaultShellTimeoutS: 600,
    compactionMaxMs: 600000, compactBeforeTaskTokens: 200000, freshSessionAboveTokens: 600000, mainHeartbeat: 'off', mainHeartbeatMs: 900000 });
  const merged = validateConfig({ version: 2, control: { stepNudgeMs: 60000, mainHeartbeat: 'note' } });
  assert.equal(merged.control.stepNudgeMs, 60000);
  assert.equal(merged.control.mainHeartbeat, 'note');
  assert.equal(merged.control.silentMs, 300000, 'unspecified fields keep their defaults');
  // Bounds and types are enforced instead of silently accepted.
  assert.throws(() => validateConfig({ version: 2, control: { silentMs: 1000 } }), /control.silentMs must be 10000–3600000/);
  assert.throws(() => validateConfig({ version: 2, control: { mainHeartbeat: 'always' } }), /control.mainHeartbeat must be off, note or wake/);
  assert.throws(() => validateConfig({ version: 2, control: { maxAutoRecoveriesPerStep: 99 } }), /control.maxAutoRecoveriesPerStep must be 0–20/);
  assert.throws(() => validateConfig({ version: 2, control: { autoRepairsPerStep: 99 } }), /control.autoRepairsPerStep must be 0–20/);
  assert.throws(() => validateConfig({ version: 2, control: { defaultShellTimeoutS: 86401 } }), /control.defaultShellTimeoutS must be 0–86400/);
  // A pattern that does not compile is refused here, not silently never matched inside a worker.
  assert.throws(() => validateConfig({ version: 2, control: { blockedCommands: ['(unclosed'] } }), /control.blockedCommands has an invalid pattern/);
  assert.equal(validateConfig({ version: 2, control: { blockedCommands: [] } }).control.blockedCommands.length, 0, 'an empty list is allowed: it blocks nothing');
  assert.throws(() => validateConfig({ version: 2, control: { watchdog: 'yes' } }), /control.watchdog must be boolean/);
  assert.throws(() => validateConfig({ version: 2, control: { unknownKnob: 1 } }), /Unknown control setting/);
});

test('control settings never change configHash(), so tuning them cannot interrupt a worker', async () => {
  const f = await fixture();
  try {
    const before = f.controller.configHash();
    const tuned = validateConfig({ ...JSON.parse(JSON.stringify(f.controller.config)), control: { ...f.controller.config.control, stepNudgeMs: 60000, silentMs: 20000, maxAutoRecoveriesPerStep: 5 } });
    assert.notEqual(tuned.control.stepNudgeMs, f.controller.config.control.stepNudgeMs);
    assert.equal(f.controller.configHash(tuned), before, 'the control section is not part of the runtime hash');
    // The steering allowance and the liveness threshold do follow the setting.
    await f.controller.updateConfig(tuned);
    assert.equal(f.controller.steerAllowance(), 6, 'maxSteersPerStep is unchanged in this tuning');
    const steered = await f.controller.steer('worker', { taskId: f.task.id, message: 'go' });
    assert.equal(steered.queued, true);
  } finally { await cleanup(f); }
});

test('a run that ends without a report gets one automatic re-prompt, then escalates', async () => {
  const f = await fixture();
  const { controller, task, runtime, userNotices, record } = f;
  try {
    const resumed = [];
    controller.resume = async (id, recovery) => { resumed.push(recovery); return { taskId: task.id, status: 'activating' }; };
    // The first ending: one re-prompt, no Main escalation and no human warning yet.
    runtime.settledSequence = 2; task.dispatchSettleSequence = 0;
    await runScan(controller);
    assert.equal(resumed.length, 1, 'the watchdog re-prompts once');
    assert.equal(resumed[0].by, 'watchdog', 'the recovery is attributed to the watchdog');
    assert.match(String(resumed[0].instruction), /Call pair_report now/);
    assert.ok(userNotices.some(n => n.level === 'info' && /asking it to report \(1\/1 re-prompts/.test(n.message)), 'the human is told about the re-prompt');
    assert.equal(task.watchdog.noReportNudges, 1);
    assert.ok(normalizeTimeline(task.timeline).some(entry => entry.type === 'note' && entry.kind === 'watchdog'), 'the action is recorded in the timeline');
    // A second ending has no re-prompt left: the task stays interrupted, the human is warned and Main is asked.
    // The re-prompt stopped the held worker; a real resume restarts it, so model that restart here.
    runtime.closed = false; record.status = 'working';
    controller.handles.set('worker', runtime);
    controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(record.bound), activationIntent: controller.intent('worker'), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
    // A new run then ended without a report too, with no re-prompt left for this step.
    task.status = 'running'; task.dispatchSettleSequence = runtime.settledSequence; runtime.settledSequence += 1;
    await runScan(controller);
    assert.equal(resumed.length, 1, 'only one re-prompt per step');
    assert.ok(userNotices.some(n => n.level === 'warning' && /ended without a pair_report; the task is held as interrupted/.test(n.message)), 'the human is warned once the re-prompt is spent');
  } finally { await cleanup(f); }
});

test('a human-paused task is never resumed automatically', async () => {
  const f = await fixture();
  const { controller, task, userNotices } = f;
  try {
    const resumed = [];
    controller.resume = async (...args) => { resumed.push(args); return { taskId: task.id }; };
    task.status = 'paused'; task.pausedBy = 'human'; task.interruption = 'Paused by the user';
    const result = await controller.autoRecover('worker', task.id, 'crash', 'continue');
    assert.equal(result.recovered, false);
    assert.match(String(result.reason), /the human paused it/);
    assert.equal(resumed.length, 0, 'a human pause is never overridden');
    assert.equal(task.watchdog, undefined, 'and no recovery is spent on it');
  } finally { await cleanup(f); }
});

test('autoRecover is bounded per step and refuses spent budgets and unconfirmed exits', async () => {
  const f = await fixture();
  const { controller, task, record } = f;
  try {
    const resumed = [];
    controller.resume = async (...args) => { resumed.push(args); return { taskId: task.id }; };
    task.status = 'interrupted';
    assert.equal((await controller.autoRecover('worker', task.id, 'no-report', 'go')).recovered, true);
    assert.equal((await controller.autoRecover('worker', task.id, 'no-report', 'go')).recovered, true);
    assert.equal(task.watchdog.recoveries, 2);
    const exhausted = await controller.autoRecover('worker', task.id, 'no-report', 'go');
    assert.equal(exhausted.recovered, false);
    assert.match(String(exhausted.reason), /per-step recovery budget is spent \(2\/2\)/);
    assert.equal(resumed.length, 2, 'the budget bounds the attempts');
    // A spent cost budget is the human's decision, not the watchdog's.
    task.status = 'interrupted'; task.watchdog = { step: 0, recoveries: 0, noReportNudges: 0, steers: 0, nudged: false, providerWaits: 0, retryAt: null, retryReason: null };
    task.limits = { ...task.limits, maxReportedCostUsd: 1 }; task.usage = { ...ZERO_USAGE, reportedCost: 5 };
    const spent = await controller.autoRecover('worker', task.id, 'crash', 'go');
    assert.equal(spent.recovered, false);
    assert.match(String(spent.reason), /Reported inference-cost budget reached/);
    // An unconfirmed exit is never bypassed.
    task.limits = { ...f.controller.config.limits }; task.usage = { ...ZERO_USAGE };
    record.error = 'EXIT_UNCONFIRMED: abort was not acknowledged';
    const unconfirmed = await controller.autoRecover('worker', task.id, 'crash', 'go');
    assert.equal(unconfirmed.recovered, false);
    assert.match(String(unconfirmed.reason), /exit is unconfirmed/);
    assert.equal(resumed.length, 2, 'nothing extra was resumed');
  } finally { await cleanup(f); }
});

test('autoRecover is refused when the watchdog is off or the task is not paused/interrupted', async () => {
  const f = await fixture({ control: { watchdog: false } });
  try {
    f.task.status = 'interrupted';
    const off = await f.controller.autoRecover('worker', f.task.id, 'crash', 'go');
    assert.equal(off.recovered, false);
    assert.match(String(off.reason), /watchdog is off/);
    // With the watchdog on, a running task is not something to resume.
    f.controller.config = { ...f.controller.config, control: { ...f.controller.config.control, watchdog: true } };
    f.task.status = 'running';
    const running = await f.controller.autoRecover('worker', f.task.id, 'crash', 'go');
    assert.equal(running.recovered, false);
    assert.match(String(running.reason), /task is running/);
  } finally { await cleanup(f); }
});

test('a long step gets one soft nudge through the fence, and nudges do not spend recoveries', async () => {
  const f = await fixture({ control: { stepNudgeMs: 60000 } });
  const { controller, task, sent } = f;
  try {
    task.updatedAt = Date.now() - 5 * 60000; // five minutes on the step
    assert.equal(await controller.stepNudge('worker', task), true);
    assert.equal(sent.length, 1);
    assert.match(sent[0].message, /PAIR STEER \(from watchdog\): 5 min on this step; Pair pauses it at 30 min/);
    assert.match(sent[0].message, /report a checkpoint/);
    assert.equal(task.watchdog.nudged, true);
    assert.equal(task.watchdog.recoveries, 0, 'a nudge is not a recovery');
    // Only once per step.
    assert.equal(await controller.stepNudge('worker', task), false);
    assert.equal(sent.length, 1);
    // A step below the nudge threshold is left alone.
    task.watchdog = { step: 0, recoveries: 0, noReportNudges: 0, steers: 0, nudged: false, providerWaits: 0, retryAt: null, retryReason: null };
    task.updatedAt = Date.now() - 1000;
    assert.equal(await controller.stepNudge('worker', task), false);
    // At the hard pause threshold the hard limit owns the step; a nudge would only race it.
    task.updatedAt = Date.now() - 40 * 60000;
    assert.equal(await controller.stepNudge('worker', task), false, 'past activeStepTimeoutMs the pause takes over');
    assert.equal(sent.length, 1);
  } finally { await cleanup(f); }
});

test('the scan sends the nudge as a job, never inside the scan transaction', async () => {
  const f = await fixture({ control: { stepNudgeMs: 60000 } });
  const { controller, task, runtime, sent, record } = f;
  try {
    task.updatedAt = Date.now() - 5 * 60000;
    const jobs = [];
    // Drive only the scan transaction this time: the jobs are inspected before they run.
    rebindRuntime(controller);
    await controller.transaction(() => controller.scan(jobs));
    assert.equal(sent.length, 0, 'the scan itself never steers');
    assert.ok(jobs.length > 0, `the nudge is queued as a job (got ${jobs.length})`);
    for (const job of jobs) await job();
    for (const followUp of controller.scanFollowUps.splice(0)) await followUp();
    for (const send of controller.scanNotices.splice(0)) send();
    assert.equal(sent.length, 1, 'the job sends the nudge after the scan');
    assert.equal(runtime.closed, false);
  } finally { await cleanup(f); }
});

test('a pending automatic retry suppresses the idle check for that task', async () => {
  const f = await fixture();
  try {
    const task = f.task;
    assert.equal(f.controller.automaticPending(task), false, 'nothing is scheduled yet');
    task.watchdog = { step: 0, recoveries: 0, noReportNudges: 0, steers: 0, nudged: false, providerWaits: 1, retryAt: Date.now() + 60000, retryReason: 'rate limited' };
    assert.equal(f.controller.automaticPending(task), true, 'a due-in-the-future retry is the watchdog\'s turn');
    task.watchdog.retryAt = Date.now() - 1;
    assert.equal(f.controller.automaticPending(task), false, 'a due retry is not "pending" any more');
    // A human-paused task is never woken for either.
    task.status = 'paused'; task.pausedBy = 'human';
    task.watchdog.retryAt = Date.now() + 60000;
    assert.equal(f.controller.automaticPending(task), true);
  } finally { await cleanup(f); }
});

test('the hard step limit keeps pausing and its supervision reason carries liveness', async () => {
  const f = await fixture({ limits: { activeStepTimeoutMs: 60000 } });
  const { controller, task, runtime } = f;
  try {
    const mainNotices = [];
    controller.config = { ...controller.config, mainSupervision: true };
    controller.callbacks.superviseMain = message => mainNotices.push(message);
    task.updatedAt = Date.now() - 5 * 60000;
    runtime.snapshot = () => ({ ready: true, idle: false, streaming: false, closed: false, fault: null, permission: false, compacting: false, summarizingRetrying: false, retrying: false, tool: null, lastEventAt: Date.now() - 120000 });
    await runScan(controller);
    assert.equal(task.status, 'paused', 'the hard limit still pauses');
    assert.match(String(task.interruption), /Step time limit reached/);
    const notice = mainNotices.find(message => /is paused/.test(message));
    assert.ok(notice, 'Main is supervised');
    assert.match(notice, /last event \d+s ago|silent/, 'the reason carries the liveness summary');
  } finally { await cleanup(f); }
});

test('state written before the watchdog fields existed still loads, and the record round-trips', async () => {
  const f = await fixture();
  const { controller, task } = f;
  try {
    const stored = JSON.parse(await fs.readFile(path.join(controller.dir, 'state.json'), 'utf8'));
    assert.equal(stored.workers.worker.task.watchdog, undefined);
    assert.doesNotThrow(() => validateStoredState(stored, { ownerSession: controller.ownerSession, cwd: controller.cwd }));
    // A full record round-trips through strict validation.
    task.watchdog = { step: 0, recoveries: 1, autoRepairs: 1, repairs: [{ reasons: ['Configured check failed'], at: Date.now() }], noReportNudges: 1, steers: 2, nudged: true, nudgedAttemptId: task.attemptId, providerWaits: 1, retryAt: Date.now(), retryReason: 'rate limited' };
    await controller.persist();
    const again = JSON.parse(await fs.readFile(path.join(controller.dir, 'state.json'), 'utf8'));
    assert.deepEqual(again.workers.worker.task.watchdog, task.watchdog);
    assert.doesNotThrow(() => validateStoredState(again, { ownerSession: controller.ownerSession, cwd: controller.cwd }));
    // The bookkeeping resets when the step position changes.
    task.stepIndex = 1;
    const fresh = controller.watchdogFor(task);
    assert.deepEqual(fresh, { step: 1, recoveries: 0, noReportNudges: 0, steers: 0, nudged: false, nudgedAttemptId: null, pingedAt: null, providerWaits: 0, retryAt: null, retryReason: null, autoRepairs: 0, repairs: [] });
  } finally { await cleanup(f); }
});

async function fixture(overrides = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-watchdog-'));
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
    config: loaded.config, cwd: repo, ownerSession: 'watchdog-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser: (message, level = 'info') => userNotices.push({ message, level }), promptUser: async () => ({ cancelled: true }) },
  });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const task = { id: 'task-watchdog', workerId: id, requestId: 'req-watchdog', objective: 'Watchdog fixture', context: 'test', constraints: [],
    steps: [{ id: 's1', title: 'First step', instructions: 'Do the thing' }, { id: 's2', title: 'Second step', instructions: 'Then this' }],
    stepIndex: 0, planRevision: 1, attemptId: 'attempt-watchdog', attemptNumber: 1, status: 'running', leaseId: 'lease-watchdog',
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: { commands: [], requirePassing: false, timeoutMs: 120000 },
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    // The run is in flight: it was dispatched at the runtime's current settle sequence.
    dispatchSettleSequence: 1, pendingSince: 0, abortRequested: false, interruption: '', previousStatus: '', completedAt: 0, cancelReason: '' };
  const record = { id, cwd: repo, repoRoot: repo, status: 'working', sessionId: 'sess-watchdog', sessionFile: path.join(controller.dir, 'sessions', 'w-watchdog.jsonl'),
    bound: { ...spec }, task, history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  // A real retained session header: an empty session file is a fault Pair refuses to replace.
  await fs.writeFile(record.sessionFile, JSON.stringify({ type: 'session', version: 3, id: 'sess-watchdog', timestamp: new Date().toISOString(), cwd: repo }) + '\n');
  const baseSnap = await controller.evidence.capture(repo);
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(baseSnap);
  const sent = [];
  const runtime = { ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-watchdog', pid: 424248, dir: workerDir, sessionId: record.sessionId,
    ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], abortCurrent: async () => {},
    // Stopping confirms exit, so a worker record left in 'error' can be recovered like a real one.
    async abortAndStop() { this.closed = true; },
    waitIdle: async () => {}, revoke() {}, settleOrAbort(reason) { return this.abortCurrent(reason); },
    snapshot: () => ({ pid: 424248, ready: true, idle: false, streaming: true, closed: false, fault: null, permission: false, compacting: false, summarizingRetrying: false, retrying: false, tool: null, accepted: true, activation: null, lastEventAt: Date.now() }),
    async steerCurrent(identity, message) { sent.push({ identity, message }); return 'queued'; } };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
  await controller.writeAuthority(id, 'running');
  await controller.persist();
  return { controller, repo, task, record, runtime, workerDir, userNotices, base, sent };
}
async function cleanup(f) {
  f.runtime.closed = true;
  await f.controller.close().catch(() => {});
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}
/** Drive one full scan exactly as scheduleScan does: inside its transaction, then the jobs, then the notices. */
/** Keep the fake runtime bound to the controller's current config, as a real one always is. */
function rebindRuntime(controller) {
  for (const [id, runtime] of controller.handles) controller.runtimeData.set(runtime, { ...controller.runtimeData.get(runtime), configHash: controller.configHash(), specHash: digest(controller.state.workers[id].bound) });
}

async function runScan(controller, sink = null) {
  const jobs = [];
  // A real runtime is always bound to the live config; keep the fake one matching after any config change.
  rebindRuntime(controller);
  await controller.transaction(() => controller.scan(jobs));
  if (sink) sink.push(...jobs);
  for (const job of jobs) await job();
  // Follow-ups run after containment, one at a time, exactly as scheduleScan does it.
  for (const followUp of controller.scanFollowUps.splice(0)) await followUp();
  for (const send of controller.scanNotices.splice(0)) send();
}

test('the re-prompt resumes only after containment has finished, driven through scheduleScan', async () => {
  const f = await fixture();
  const { controller, task, runtime } = f;
  try {
    // A real resume (no stub) needs a lease to grant: stand one in for the activation, but keep the ordering real.
    const order = [];
    let resumeStarted = null;
    const contain = controller.contain.bind(controller);
    controller.contain = async (...args) => { order.push('contain:start'); await contain(...args); order.push('contain:done'); };
    // Slow containment: abortCurrent resolves only after a tick, like a real process abort.
    runtime.abortCurrent = async () => { await new Promise(resolve => setTimeout(resolve, 50)); order.push('aborted'); };
    controller.resume = async (id, recovery) => { resumeStarted = order.slice(); order.push('resume'); return { taskId: task.id, status: 'activating' }; };
    runtime.settledSequence = 2;
    rebindRuntime(controller);
    controller.scheduleScan();
    await controller.scanPromise;
    assert.ok(resumeStarted, 'the re-prompt resume ran');
    assert.ok(order.includes('contain:done'), 'containment finished before the resume');
    assert.deepEqual(resumeStarted, ['contain:start', 'aborted', 'contain:done'], 'nothing resumed before containment settled');
    assert.equal(order.at(-1), 'resume', 'the resume is the last step');
    assert.equal(task.watchdog.recoveries, 1);
  } finally { await cleanup(f); }
});

test('a revised attempt of the same step gets its own nudge', async () => {
  const f = await fixture({ control: { stepNudgeMs: 60000 } });
  const { controller, task, sent } = f;
  try {
    task.updatedAt = Date.now() - 5 * 60000;
    assert.equal(await controller.stepNudge('worker', task), true);
    assert.equal(task.watchdog.nudgedAttemptId, task.attemptId, 'the nudge records the attempt it covered');
    assert.equal(sent.length, 1);
    // A revise starts a new attempt of the same step: its clock restarts, so it deserves its own nudge.
    task.attemptId = 'attempt-revised';
    task.updatedAt = Date.now() - 5 * 60000;
    assert.equal(await controller.stepNudge('worker', task), true, 'a revised attempt is nudged once too');
    assert.equal(task.watchdog.nudgedAttemptId, 'attempt-revised');
    assert.equal(sent.length, 2);
    // And only once for that attempt.
    assert.equal(await controller.stepNudge('worker', task), false);
    assert.equal(sent.length, 2);
    // A record written before attempts were tracked still suppresses a repeat nudge for the same step.
    task.watchdog = { step: 0, recoveries: 0, noReportNudges: 0, steers: 0, nudged: true, providerWaits: 0, retryAt: null, retryReason: null };
    assert.equal(await controller.stepNudge('worker', task), false, 'an untracked legacy nudge is not repeated');
    assert.equal(sent.length, 2);
  } finally { await cleanup(f); }
});

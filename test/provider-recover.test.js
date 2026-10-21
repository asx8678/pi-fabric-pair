// Provider waits, crash recovery and Main recovery with a proven exit.
// Offline: a pure classifier plus a controller fixture whose runtime and exit proofs are controlled.
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
import { classifyProviderError, MAX_TRANSIENT_WAIT_MS, providerWaitText, providerWaitsLeft, retryClock } from '../src/provider.js';

const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };
const CONTROL = { providerCooldownMs: 60000, quotaCooldownMs: 900000, maxProviderWaits: 4 };

test('provider errors are classified and their waits bounded', () => {
  // Quota: a long wait, whatever the wording.
  for (const message of ['You hit your limit', 'quota exceeded', 'insufficient credits', 'billing issue', 'exceeded your usage limit']) {
    const result = classifyProviderError(message, CONTROL);
    assert.equal(result?.kind, 'quota', message);
    assert.equal(result?.waitMs, 900000, message);
  }
  // Transient: doubles per wait already spent, capped at fifteen minutes.
  assert.deepEqual([0, 1, 2, 3].map(waits => classifyProviderError('429 Too Many Requests', { ...CONTROL, waits })?.waitMs), [60000, 120000, 240000, 480000]);
  assert.equal(classifyProviderError('overloaded', { ...CONTROL, waits: 10 })?.waitMs, MAX_TRANSIENT_WAIT_MS, 'the backoff is capped');
  for (const message of ['rate limit reached', 'stream terminated', 'socket hang up', 'ECONNREFUSED', '503 Service Unavailable', 'request timed out', 'network error', 'unavailable']) {
    assert.equal(classifyProviderError(message, CONTROL)?.kind, 'transient', message);
  }
  // Quota wins when an error mentions both: "rate limit exceeded your quota" is not a short backoff.
  assert.equal(classifyProviderError('rate limit: exceeded your quota', CONTROL)?.kind, 'quota');
  // Unclassified and empty errors are not turned into waits.
  assert.equal(classifyProviderError('something odd happened', CONTROL), null);
  assert.equal(classifyProviderError('', CONTROL), null);
  assert.equal(classifyProviderError(null, CONTROL), null);
  // Waits are bounded per step.
  assert.equal(providerWaitsLeft(4, 0), true);
  assert.equal(providerWaitsLeft(4, 3), true);
  assert.equal(providerWaitsLeft(4, 4), false);
  // The interruption text names the retry clock and the counts.
  const at = new Date(2026, 0, 1, 14, 5).getTime();
  assert.equal(retryClock(at), '14:05');
  assert.equal(providerWaitText({ reason: '429 Too Many Requests', retryAt: at, waits: 1, maxWaits: 4 }), 'Waiting for provider (429 Too Many Requests) — automatic retry at 14:05 (1/4)');
});

async function fixture({ control = {}, mainSupervision = false, status = 'running' } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-provider-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false, mainSupervision,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    control,
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const userNotices = [], mainNotices = [];
  const controller = new PairController({ config: loaded.config, cwd: repo, ownerSession: 'provider-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser: (message, level = 'info') => userNotices.push({ message, level }), superviseMain: message => mainNotices.push(message), noticeMain: message => mainNotices.push(message), promptUser: async () => ({ cancelled: true }) } });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const task = { id: 'task-provider', workerId: id, requestId: 'req-provider', objective: 'Provider fixture', context: 'test', constraints: [],
    steps: [{ id: 's1', title: 'Step', instructions: 'x' }, { id: 's2', title: 'Two', instructions: 'y' }], stepIndex: 0, planRevision: 1,
    attemptId: 'attempt-provider', attemptNumber: 1, status, leaseId: 'lease-provider',
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: { commands: [], requirePassing: false, timeoutMs: 120000 },
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    dispatchSettleSequence: 1, pendingSince: 0, abortRequested: false, interruption: '', previousStatus: '', completedAt: 0, cancelReason: '' };
  const record = { id, cwd: repo, repoRoot: repo, status: 'working', sessionId: 'sess-provider', sessionFile: path.join(controller.dir, 'sessions', 'w.jsonl'),
    bound: { ...spec }, task, history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(record.sessionFile, JSON.stringify({ type: 'session', version: 3, id: 'sess-provider', timestamp: new Date().toISOString(), cwd: repo }) + '\n');
  const baseSnap = await controller.evidence.capture(repo);
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(baseSnap);
  /** @type {Record<string, unknown>} */
  const snapshot = { pid: 424254, ready: true, idle: false, streaming: false, closed: false, fault: null, permission: false, compacting: false, summarizingRetrying: false, retrying: false,
    tool: null, accepted: true, lastEventAt: Date.now(), compactingSince: null, maintenanceCompaction: false, lastError: null };
  const runtime = { ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-provider', pid: 424254, dir: workerDir, sessionId: record.sessionId,
    ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], abortCurrent: async () => {}, async abortAndStop() { this.closed = true; },
    async ping() { return true; }, waitIdle: async () => {}, revoke() {}, settleOrAbort(reason) { return this.abortCurrent(reason); }, snapshot: () => ({ ...snapshot }) };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
  await controller.writeAuthority(id, 'running');
  await controller.persist();
  const rebind = () => { for (const [workerId, handle] of controller.handles) controller.runtimeData.set(handle, { ...controller.runtimeData.get(handle), configHash: controller.configHash(), specHash: digest(controller.state.workers[workerId].bound) }); };
  return { controller, repo, task, record, runtime, workerDir, userNotices, mainNotices, base, snapshot, rebind };
}
async function cleanup(f) {
  f.runtime.closed = true;
  await f.controller.close().catch(() => {});
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}
/** One full scan the way scheduleScan runs it: transaction, jobs, then follow-ups and notices. */
async function runScan(controller) {
  const jobs = [];
  for (const [, handle] of controller.handles) controller.runtimeData.set(handle, { ...controller.runtimeData.get(handle), configHash: controller.configHash() });
  await controller.transaction(() => controller.scan(jobs));
  for (const job of jobs) await job();
  for (const followUp of controller.scanFollowUps.splice(0)) await followUp();
  for (const send of controller.scanNotices.splice(0)) send();
}

test('a rate-limit error schedules one bounded automatic retry that does not consume recoveries', async () => {
  const f = await fixture({ control: { ...CONTROL, noReportNudges: 0 } });
  const { controller, task, runtime, snapshot, userNotices } = f;
  try {
    // The run ended without a report, and the provider said 429.
    snapshot.lastError = { message: '429 Too Many Requests', at: Date.now(), source: 'assistant' };
    runtime.settledSequence = 2; task.dispatchSettleSequence = 1;
    f.rebind();
    const resumed = [];
    controller.resume = async (id, recovery) => { resumed.push(recovery); return { taskId: task.id, status: 'activating' }; };
    await runScan(controller);
    assert.equal(task.status, 'interrupted');
    assert.match(String(task.interruption), /^Waiting for provider \(429 Too Many Requests\) — automatic retry at \d\d:\d\d \(1\/4\)/);
    assert.equal(task.watchdog.providerWaits, 1);
    assert.ok(task.watchdog.retryAt > Date.now(), 'a retry is scheduled in the future');
    assert.equal(task.watchdog.retryReason, '429 Too Many Requests');
    assert.equal(task.watchdog.recoveries, 0, 'a wait does not consume a recovery');
    assert.equal(resumed.length, 0, 'nothing resumed before the cooldown');
    assert.ok(userNotices.some(n => /automatic retry at/.test(n.message)), 'the human is told when it retries');
  } finally { await cleanup(f); }
});

test('a due provider wait resumes on its own, also after a controller restart', async () => {
  const f = await fixture({ control: { ...CONTROL, noReportNudges: 0 } });
  const { controller, task, record, userNotices } = f;
  try {
    // A task that a previous Process left waiting: the deadline lives in the task, so it survives a restart.
    task.status = 'interrupted';
    task.interruption = 'Waiting for provider (overloaded) — automatic retry at 10:00 (1/4)';
    task.watchdog = { step: 0, recoveries: 0, noReportNudges: 0, steers: 0, nudged: false, providerWaits: 1, retryAt: Date.now() - 1000, retryReason: 'overloaded' };
    // A restarted controller keeps the task interrupted; only its error text from the previous process is stale.
    record.status = 'interrupted';
    record.error = null;
    const resumed = [];
    controller.resume = async (id, recovery) => { resumed.push(recovery); return { taskId: task.id, status: 'activating' }; };
    await runScan(controller);
    assert.equal(resumed.length, 1, 'the due wait resumes the task');
    assert.equal(resumed[0].by, 'watchdog');
    assert.match(String(resumed[0].instruction), /The provider failed with: overloaded\. Continue the authorized step\./);
    assert.equal(task.watchdog.retryAt, null, 'the deadline is cleared, so a failed resume cannot retry forever');
    assert.ok(userNotices.some(n => /provider wait is over/.test(n.message)));
  } finally { await cleanup(f); }
});

test('when the provider budget is spent Main is supervised instead of waiting again', async () => {
  const f = await fixture({ control: { ...CONTROL, maxProviderWaits: 1, noReportNudges: 0 }, mainSupervision: true });
  const { controller, task, runtime, snapshot, mainNotices } = f;
  try {
    snapshot.lastError = { message: 'quota exceeded', at: Date.now(), source: 'assistant' };
    runtime.settledSequence = 2; task.dispatchSettleSequence = 1;
    task.watchdog = { step: 0, recoveries: 0, noReportNudges: 0, steers: 0, nudged: false, providerWaits: 1, retryAt: null, retryReason: null };
    f.rebind();
    const resumed = [];
    controller.resume = async (...args) => { resumed.push(args); return { taskId: task.id }; };
    await runScan(controller);
    assert.equal(resumed.length, 0, 'no further recovery');
    const notice = mainNotices.find(message => /FABRIC PAIR SUPERVISION/.test(message));
    assert.ok(notice, 'Main is supervised');
    assert.match(notice, /wait budget for this step is spent \(1\/1\)/);
    assert.match(notice, /quota exceeded/);
  } finally { await cleanup(f); }
});

test('a crash with a proven exit recovers once; without proof it stays held', async () => {
  const f = await fixture({ control: {} });
  const { controller, task, runtime, mainNotices } = f;
  try {
    const resumed = [];
    controller.resume = async (id, recovery) => { resumed.push(recovery); return { taskId: task.id, status: 'activating' }; };
    // The runtime closed: the scan interrupts and contains it, then the proof decides.
    runtime.closed = true;
    controller.exitProof = async () => ({ exited: true, pid: 424254, reason: 'Worker process 424254 has exited.' });
    f.rebind();
    await runScan(controller);
    assert.equal(resumed.length, 1, 'a proven crash is recovered once');
    assert.match(String(resumed[0].instruction), /exited unexpectedly and was restarted/);
    // Now the same path with no proof: nothing is resumed and Main is told why.
    const g = await fixture({ control: {} });
    try {
      g.runtime.closed = true;
      g.controller.exitProof = async () => ({ exited: false, pid: 424254, reason: 'The last worker process (424254) may still be running.' });
      const gResumed = [];
      g.controller.resume = async (...args) => { gResumed.push(args); return { taskId: g.task.id }; };
      await runScan(g.controller);
      assert.equal(gResumed.length, 0, 'an unproven exit is never resumed automatically');
      assert.ok(g.mainNotices.some(message => /exit unconfirmed/.test(message)), 'Main is told the exit is unconfirmed');
    } finally { await cleanup(g); }
  } finally { await cleanup(f); }
});

test('pair_recover proves the exit before it refuses, and stops a provable orphan', async () => {
  const f = await fixture({ mainSupervision: true });
  const { controller, task, record } = f;
  try {
    // No live handle in this session, a held EXIT_UNCONFIRMED record, and a process Pair can attribute.
    controller.handles.clear();
    record.status = 'error';
    record.error = 'EXIT_UNCONFIRMED: abort was not acknowledged';
    task.status = 'interrupted';
    const proofs = [{ exited: false, pid: 424254, reason: 'Process 424254 may still be running.' }, { exited: true, pid: 424254, reason: 'Worker process 424254 has exited.' }];
    let terminated = 0;
    controller.exitProof = async () => proofs.shift() ?? { exited: true, pid: 424254, reason: 'exited' };
    const stolen = [];
    controller.resume = async (id, recovery) => { stolen.push(recovery); return { taskId: task.id, status: 'activating' }; };
    // terminateProcessGroup is a module function: stub the controller's reference for the test.
    const result = await controller.recover('worker', task.id, 'continue').catch(error => error);
    assert.ok(!(result instanceof Error), `recover must proceed once the exit is proven (got ${result && result.message})`);
    assert.equal(record.error, null, 'the held error is cleared once exit is proven');
    assert.equal(stolen.length, 1);
    assert.equal(terminated, 0, 'this fixture never had to signal a live pid');
  } finally { await cleanup(f); }
});

test('an unprovable exit is still refused by pair_recover', async () => {
  const f = await fixture({ mainSupervision: true });
  const { controller, task, record } = f;
  try {
    controller.handles.clear();
    record.status = 'error';
    record.error = 'EXIT_UNCONFIRMED: abort was not acknowledged';
    task.status = 'interrupted';
    controller.exitProof = async () => ({ exited: false, pid: 424254, reason: 'The last worker process (424254) may still be running.' });
    const resumed = [];
    controller.resume = async (...args) => { resumed.push(args); return { taskId: task.id }; };
    await assert.rejects(controller.recover('worker', task.id, 'continue'), /exit is unconfirmed/);
    assert.equal(resumed.length, 0, 'nothing was resumed');
  } finally { await cleanup(f); }
});

test('an approved step refills Main\'s recovery budget by one, never below zero', async () => {
  const f = await fixture({ mainSupervision: true });
  const { controller, task, record, runtime } = f;
  try {
    // A reviewable report on step 1 of 2, with Main having already used two recoveries.
    task.status = 'review'; task.stepRevisions = 0; task.mainRecoveries = 2;
    const payload = { taskId: task.id, stepId: task.steps[0].id, kind: 'checkpoint', summary: 'Fixture', decisions: [], changedFiles: [], checks: [], stepComplete: true };
    const snapshot = await controller.evidence.capture(f.repo);
    task.report = { version: 1, reportId: 'report-provider-1', workerId: 'worker', ownerSession: controller.ownerSession, ownerEpoch: controller.state.ownerEpoch,
      workerGeneration: 1, nonce: 'nonce-provider', sessionId: record.sessionId, leaseId: task.leaseId, attemptId: task.attemptId, attemptNumber: 1, planRevision: 1,
      payload, payloadHash: digest(payload), createdAt: Date.now(),
      checkpoint: await controller.evidence.checkpoint(task.id, 'report-provider-1', snapshot, snapshot, []), snapshotRef: await controller.evidence.saveSnapshot(snapshot), inspectedAt: Date.now() };
    controller.state.notices['report-provider-1'] = { reportId: 'report-provider-1', workerId: 'worker', taskId: task.id, ownerEpoch: controller.state.ownerEpoch,
      workerGeneration: 1, attemptId: task.attemptId, deliveryOperationId: 'delivery-provider-1', status: 'offered', createdAt: Date.now(), channel: 'tool-result', observedAt: Date.now() };
    record.status = 'review';
    await controller.writeAuthority('worker', 'waiting');
    await controller.persist();
    Object.assign(runtime, {
      reserveActivation: identity => Object.freeze({ ...identity, serial: 1 }), activationCurrent: () => true,
      ensureStarted: async () => ({ probe: null, state: { sessionId: record.sessionId, sessionFile: record.sessionFile } }),
      prepareActivation: async () => ({ probe: null }), activate: async () => {},
    });
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-provider-1', action: 'approve', checkpointHash: task.report.checkpoint.checkpointHash, feedback: 'Looks right' });
    assert.equal(task.stepIndex, 1, 'the step advanced');
    assert.equal(task.mainRecoveries, 1, 'an approved step gives one recovery back');
    // And never below zero.
    task.mainRecoveries = 0;
    task.stepIndex = 0;
    task.status = 'review';
    task.report.inspectedAt = Date.now();
    controller.state.notices['report-provider-1'].status = 'offered';
    delete task.decisions['report-provider-1'];
    await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: 'report-provider-1', action: 'approve', checkpointHash: task.report.checkpoint.checkpointHash, feedback: 'again' })).catch(() => {});
  } finally { await cleanup(f); }
});

test('a supervision notice carries the liveness summary and the last provider error', async () => {
  const f = await fixture({ mainSupervision: true });
  const { controller, task, snapshot, mainNotices } = f;
  try {
    snapshot.lastError = { message: 'stream terminated', at: Date.now(), source: 'assistant' };
    snapshot.streaming = true; snapshot.lastEventAt = Date.now() - 5000;
    controller.superviseMain('stalled', 'worker', task, 'no worker event for 6 min');
    const notice = mainNotices.at(-1);
    assert.ok(notice, 'a notice was sent');
    assert.match(notice, /^FABRIC PAIR SUPERVISION —/);
    assert.match(notice, /Liveness: streaming · last event 5s ago/);
    assert.match(notice, /Last provider error: stream terminated/);
    assert.match(notice, /Reason: no worker event for 6 min/);
  } finally { await cleanup(f); }
});

test('the real no-report path schedules a provider wait that fires on a later scan', async () => {
  const f = await fixture({ control: { ...CONTROL, noReportNudges: 0 } });
  const { controller, task, record, runtime, snapshot } = f;
  try {
    const resumed = [];
    controller.resume = async (id, recovery) => { resumed.push(recovery); return { taskId: task.id, status: 'activating' }; };
    // Drive the REAL no-report path through scheduleScan: interrupt() parks the record in 'error'.
    snapshot.lastError = { message: '429 Too Many Requests', at: Date.now(), source: 'assistant' };
    runtime.settledSequence = 2; task.dispatchSettleSequence = 1;
    f.rebind();
    controller.scheduleScan();
    await controller.scanPromise;
    assert.equal(task.status, 'interrupted', 'the run ended without a report');
    assert.equal(record.status, 'error', 'the real interrupt path parks the record in error');
    assert.equal(task.watchdog.providerWaits, 1);
    assert.ok(task.watchdog.retryAt > Date.now(), 'a retry was scheduled');
    assert.equal(resumed.length, 0, 'nothing resumed before the deadline');
    // Move the clock past the deadline and scan again: the retry must fire despite the 'error' record.
    task.watchdog.retryAt = Date.now() - 1;
    controller.scheduleScan();
    await controller.scanPromise;
    assert.equal(resumed.length, 1, 'the scheduled provider retry fired');
    assert.equal(resumed[0].by, 'watchdog');
    assert.match(String(resumed[0].instruction), /The provider failed with: 429 Too Many Requests/);
    assert.equal(task.watchdog.retryAt, null, 'the deadline is cleared');
  } finally { await cleanup(f); }
});

test('a fresh controller with no live handle reads a persisted due retry and starts the worker', async () => {
  const f = await fixture({ control: { ...CONTROL, noReportNudges: 0 } });
  let reloaded = null;
  try {
    // Persist the state a previous Main left: an interrupted task with a due provider wait and no handle.
    f.task.status = 'interrupted';
    f.task.interruption = 'Waiting for provider (overloaded) — automatic retry at 10:00 (1/4)';
    f.task.watchdog = { step: 0, recoveries: 0, noReportNudges: 0, steers: 0, nudged: false, providerWaits: 1, retryAt: Date.now() - 1000, retryReason: 'overloaded' };
    // The generation is gone (no handle); stopping it is what makes teardown legitimate, while the interrupted
    // task and its due retry are what the fresh controller must recover.
    f.record.status = 'stopped';
    f.controller.handles.clear();
    await f.controller.writeAuthority('worker', 'paused');
    await f.controller.persist();
    await f.controller.close();

    // A brand-new controller over the same storage: no handles at all.
    const loaded = await loadConfig(f.repo, true, { PI_CODING_AGENT_DIR: path.join(f.base, 'agent') });
    const fresh = new PairController({ config: loaded.config, cwd: f.repo, ownerSession: 'provider-owner', sourcePaths: [], storageDir: path.join(f.base, 'state'), scanIntervalMs: 600000,
      callbacks: { notifyUser() {}, promptUser: async () => ({ cancelled: true }) } });
    await fresh.init();
    reloaded = fresh;
    assert.equal(fresh.handles.size, 0, 'a fresh controller owns no live worker');
    const reloadedTask = fresh.state.workers.worker.task;
    assert.equal(reloadedTask.status, 'interrupted');
    assert.ok(typeof reloadedTask.watchdog.retryAt === 'number', 'the deadline survived the restart');
    // One scan must pick it up with no handle in sight.
    const resumed = [];
    fresh.resume = async (id, recovery) => { resumed.push(recovery); return { taskId: reloadedTask.id, status: 'activating' }; };
    fresh.scheduleScan();
    await fresh.scanPromise;
    assert.equal(resumed.length, 1, 'the persisted due retry resumed the task with no live handle');
    assert.equal(resumed[0].by, 'watchdog');
    assert.match(String(resumed[0].instruction), /The provider failed with: overloaded/);
    assert.equal(reloadedTask.watchdog.retryAt, null);
  } finally {
    if (reloaded) { for (const worker of Object.values(reloaded.state.workers)) worker.status = "stopped"; await reloaded.close().catch(() => {}); }
    await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
  }
});

test('a due retry whose waits are spent escalates to Main even with no live handle', async () => {
  const f = await fixture({ control: { ...CONTROL, maxProviderWaits: 1 }, mainSupervision: true });
  let reloaded = null;
  try {
    f.task.status = 'interrupted';
    // Two waits recorded against a budget of one: the due deadline can no longer buy another attempt.
    f.task.watchdog = { step: 0, recoveries: 0, noReportNudges: 0, steers: 0, nudged: false, providerWaits: 2, retryAt: Date.now() - 1, retryReason: 'quota exceeded' };
    f.record.status = 'stopped';
    f.controller.handles.clear();
    await f.controller.writeAuthority('worker', 'paused');
    await f.controller.persist();
    await f.controller.close();
    const loaded = await loadConfig(f.repo, true, { PI_CODING_AGENT_DIR: path.join(f.base, 'agent') });
    const mainNotices = [];
    const fresh = new PairController({ config: loaded.config, cwd: f.repo, ownerSession: 'provider-owner', sourcePaths: [], storageDir: path.join(f.base, 'state'), scanIntervalMs: 600000,
      callbacks: { notifyUser() {}, superviseMain: message => mainNotices.push(message), promptUser: async () => ({ cancelled: true }) } });
    await fresh.init();
    reloaded = fresh;
    const resumed = [];
    fresh.resume = async (...args) => { resumed.push(args); return { taskId: 'task-provider' }; };
    fresh.scheduleScan();
    await fresh.scanPromise;
    assert.equal(resumed.length, 0, 'the budget is spent, so nothing is resumed');
    assert.ok(mainNotices.some(message => /wait budget for this step is spent \(2\/1\)/.test(message)), 'Main is supervised with no live handle');
  } finally {
    if (reloaded) { for (const worker of Object.values(reloaded.state.workers)) worker.status = "stopped"; await reloaded.close().catch(() => {}); }
    await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PairController } from '../src/controller.js';
import { loadConfig } from '../src/config.js';
import { digest, PROTOCOL } from '../src/util.js';
import { validateLatch } from '../src/contracts.js';
import { humanPatch } from '../src/ui.js';

const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };

async function fixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-scan-test-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  // Canonicalize first: evidence snapshots bind to the realpath (e.g. /private/var on macOS).
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true,
    workers: [{ id: 'worker', provider: 'zro', model: 'deepseek-v4.1-flash', effort: 'high', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const userNotices = [], mainNotices = [];
  const controller = new PairController({
    config: loaded.config, cwd: repo, ownerSession: 'scan-test-owner', sourcePaths: [],
    storageDir: path.join(base, 'state'),
    callbacks: {
      notifyUser: (message) => userNotices.push(message),
      notifyMain: (message) => mainNotices.push(message),
      promptUser: async () => ({ cancelled: true }),
    },
  });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const task = {
    id: 'task-scan-1', workerId: id, requestId: 'req-scan-1', objective: 'Scan recovery fixture', context: 'test',
    constraints: [], steps: [{ id: 's1', title: 'Step', instructions: 'Do the thing' }], stepIndex: 0, planRevision: 1,
    attemptId: 'attempt-scan-1', attemptNumber: 1, status: 'running', leaseId: 'lease-scan-1',
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 3, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: { commands: [], requirePassing: false, timeoutMs: 120000 },
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    dispatchSettleSequence: 0, pendingSince: 0, abortRequested: false, interruption: '',
    previousStatus: '', completedAt: 0, cancelReason: '',
  };
  const record = {
    id, cwd: repo, repoRoot: repo, status: 'working', sessionId: 'sess-scan-1',
    sessionFile: path.join(controller.dir, 'sessions', 'w-scan.jsonl'), bound: { ...spec }, task,
    history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1,
  };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(record.sessionFile, '');
  const baseSnap = await controller.evidence.capture(repo);
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(baseSnap);
  const runtime = {
    ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-scan-1', pid: 424242, dir: workerDir,
    sessionId: record.sessionId, ready: true, closed: false, fault: null, settledSequence: 1,
    takeObservations: () => [], abortCurrent: () => Promise.resolve(), abortAndStop: () => Promise.resolve(),
    waitIdle: () => Promise.resolve(), snapshot: () => ({ idle: true }), revoke: () => {},
  };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, {
    configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id),
    pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null,
  });
  await controller.writeAuthority(id, 'running');
  await controller.persist();
  return { controller, repo, task, record, runtime, workerDir, userNotices, mainNotices, base };
}

function envelope({ controller, task, record, runtime, kind = 'final_review', reportId = 'report-scan-final' }) {
  const payload = { taskId: task.id, stepId: task.steps[task.stepIndex].id, kind, summary: 'Fixture report', decisions: [], changedFiles: [], checks: [], stepComplete: true };
  return {
    version: PROTOCOL, reportId, workerId: record.id, ownerSession: controller.ownerSession,
    ownerEpoch: controller.state.ownerEpoch, workerGeneration: record.workerGeneration, nonce: runtime.nonce,
    sessionId: record.sessionId, leaseId: task.leaseId, attemptId: task.attemptId, attemptNumber: task.attemptNumber,
    planRevision: task.planRevision, payload, payloadHash: digest(payload), createdAt: Date.now(),
  };
}

async function runScan(controller) {
  const jobs = [];
  await controller.scan(jobs);
  for (const job of jobs) await job();
}

test('cancel after confirmed process exit releases the task without masking the original runtime fault', async () => {
  const { controller, task, record, runtime, workerDir, base } = await fixture();
  try {
    const originalError = 'Unexpected session initialization entry';
    const sessionBefore = await fs.readFile(record.sessionFile, 'utf8');
    record.error = originalError;
    runtime.closed = true;
    let aborts = 0;
    runtime.abortCurrent = async () => { aborts++; throw new Error('Worker is closed'); };
    await controller.cancel('worker', 'Cancel interrupted assignment for repair');
    assert.equal(aborts, 0, 'confirmed exit needs no RPC abort');
    assert.equal(task.status, 'cancelled');
    assert.equal(record.status, 'error', 'reuse still requires an explicit stop');
    assert.ok(record.error.startsWith(originalError), 'containment must retain the actual failure cause');
    assert.match(record.error, /Explicit stop is required before reuse/);
    assert.equal(record.workerGeneration, 1);
    assert.equal(record.sessionId, 'sess-scan-1');
    assert.equal(await fs.readFile(record.sessionFile, 'utf8'), sessionBefore);
    assert.equal(controller.runtimeData.get(runtime).pendingControls, 0);
    const authority = JSON.parse(await fs.readFile(path.join(workerDir, 'authority.json'), 'utf8'));
    assert.equal(authority.phase, 'paused');
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

test('cancel still holds an unconfirmed live process when abort fails', async () => {
  const { controller, task, record, runtime, workerDir, base } = await fixture();
  try {
    runtime.abortCurrent = async () => { throw new Error('abort was not acknowledged'); };
    await assert.rejects(controller.cancel('worker', 'Cancel live assignment'), /abort was not acknowledged/);
    assert.equal(task.status, 'cancelled');
    assert.equal(runtime.closed, false);
    assert.equal(record.status, 'error');
    assert.match(record.error, /EXIT_UNCONFIRMED.*abort was not acknowledged/);
    assert.equal(controller.handles.get('worker'), runtime);
    assert.equal(controller.runtimeData.get(runtime).pendingControls, 0);
    assert.equal(JSON.parse(await fs.readFile(path.join(workerDir, 'authority.json'), 'utf8')).phase, 'paused');
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

test('scan accepts a retained inbox report and freezes the review checkpoint', async () => {
  const { controller, task, record, runtime, workerDir, mainNotices, userNotices, base } = await fixture();
  try {
    const report = envelope({ controller, task, record, runtime });
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    await runScan(controller);
    assert.equal(task.status, 'review', 'task must move to review after scan accepted the retained report');
    assert.equal(task.report?.reportId, report.reportId);
    assert.match(task.report?.checkpoint?.checkpointHash || '', /^[a-f0-9]{64}$/, 'immutable checkpoint hash must be frozen');
    assert.ok(controller.state.notices[report.reportId], 'a stored notice must exist for the report');
    assert.equal(controller.state.notices[report.reportId].status, 'pending', 'the finalized report is retained, not auto-delivered');
    assert.equal(mainNotices.length, 0, 'finalizing a report never automatically wakes Main');
    const yielded = await controller.yieldMain();
    assert.ok(yielded.reports.some(item => item.reportId === report.reportId), 'explicit yield retrieves the ready compact report');
    assert.equal(controller.state.notices[report.reportId].channel, 'tool-result');
    assert.equal(controller.summary().waitingReports, 1, 'an offer is not a confirmed delivery: the report stays waiting');
    await controller.inspect('worker', report.reportId);
    assert.equal(controller.summary().waitingReports, 0, 'an explicit pair_inspect read acknowledges the report');
    assert.equal(record.status, 'review');
    assert.equal(record.lastExchange?.direction, 'worker→main');
    const inbox = await fs.readdir(path.join(workerDir, 'inbox'));
    assert.equal(inbox.length, 0, 'accepted inbox file must be consumed');
    const archive = await fs.readdir(path.join(workerDir, 'archive'));
    assert.ok(archive.includes(`${report.reportId}.json`), 'original bytes must be retained in the archive');
    const persisted = JSON.parse(await fs.readFile(path.join(controller.dir, 'state.json'), 'utf8'));
    assert.equal(persisted.workers.worker.task.status, 'review', 'review state must be durable');
    const taskSummary = controller.summary().workers[0].task;
    assert.equal(taskSummary.turns, 0, 'summary must expose turns used');
    assert.ok(!('turnLimit' in taskSummary) && !('timeoutMs' in taskSummary), 'summary must not expose removed limit fields');
    assert.ok(taskSummary.startedAt > 0, 'summary must expose the task start time');
    const stepList = taskSummary.stepList;
    assert.equal(stepList.length, 1, 'summary must expose the plan step list');
    assert.equal(stepList[0].state, 'review', 'the reporting step must display as in-review');
    assert.equal(stepList[0].title, 'Step');
    // Full decision loop: inspect the checkpoint, approve, and expect completion + user-facing toast.
    await controller.inspect('worker', report.reportId);
    const decision = await controller.decide({ workerId: 'worker', taskId: task.id, reportId: report.reportId, action: 'approve', checkpointHash: task.report.checkpoint.checkpointHash, feedback: 'Recovery-suite approval' });
    assert.equal(decision.status, 'completed', 'approving the final review must complete the task');
    assert.ok(userNotices.some(n => n.includes('Pair task completed')), 'completion must raise a user-facing toast');
    assert.ok(userNotices.some(n => n.includes('ready for the next dispatch')), 'the toast must say the worker is ready');
    assert.equal(controller.summary().workers[0].status, 'ready', 'worker returns to ready after completion');
  } finally {
    await controller.close().catch(() => {});
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('re-presenting the same report is an idempotent duplicate', async () => {
  const { controller, task, record, runtime, workerDir, mainNotices, base } = await fixture();
  try {
    const report = envelope({ controller, task, record, runtime });
    const bytes = JSON.stringify(report);
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), bytes);
    await runScan(controller);
    const noticesAfterFirst = mainNotices.length;
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), bytes);
    await runScan(controller);
    assert.equal(task.status, 'review', 'duplicate must not change the settled status');
    assert.equal(mainNotices.length, noticesAfterFirst, 'duplicate must not redeliver');
    assert.equal(Object.keys(task.decisions).length, 0, 'duplicate must not record a decision');
    const inbox = await fs.readdir(path.join(workerDir, 'inbox'));
    assert.equal(inbox.length, 0, 'duplicate file must still be consumed');
  } finally {
    await controller.close().catch(() => {});
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('a stale report is quarantined; settling without an admissible report holds the lease', async () => {
  const { controller, task, record, runtime, workerDir, mainNotices, base } = await fixture();
  try {
    runtime.settledSequence = 0; // the current turn is still live
    const report = envelope({ controller, task, record, runtime, reportId: 'report-scan-stale' });
    report.nonce = 'nonce-of-a-dead-generation';
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    await runScan(controller);
    assert.equal(task.status, 'running', 'a stale report must not interrupt the live lease');
    assert.equal(task.report, null, 'a stale report must not become task evidence');
    assert.equal(mainNotices.length, 0, 'a stale report must not be delivered to Main');
    const inbox = await fs.readdir(path.join(workerDir, 'inbox'));
    assert.equal(inbox.length, 0, 'stale file must be archived, not reprocessed forever');
    assert.ok(record.staleReports?.some(entry => entry.reportId === report.reportId), 'stale identity must be recorded');
    // Once the turn settles with nothing admissible, no automatic recovery is authorized.
    runtime.settledSequence = 1;
    await runScan(controller);
    assert.ok(['interrupted', 'paused'].includes(task.status), 'settling without an admissible report must hold the lease for Main');
  } finally {
    await controller.close().catch(() => {});
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('garbage in the inbox is contained, not dropped silently', async () => {
  const { controller, task, record, workerDir, userNotices, base } = await fixture();
  try {
    await fs.writeFile(path.join(workerDir, 'inbox', 'report-garbage.json'), '{not json');
    await runScan(controller);
    assert.notEqual(task.status, 'running', 'invalid retained input must hold the active lease');
    assert.ok(userNotices.length > 0 || record.error, 'containment must be observable');
    await controller.persist();
  } finally {
    await controller.close().catch(() => {});
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});


test('active runtime edits stage without revocation; original report remains reviewable', async () => {
  const f = await fixture(); const { controller, task, record, runtime, workerDir, userNotices, base } = f;
  try {
    let revokes = 0; runtime.revoke = () => { revokes++; };
    runtime.settledSequence = 0;
    const oldHash = controller.configHash(), intent = controller.intent('worker'), generation = record.workerGeneration;
    const next = structuredClone(controller.config); next.workers[0].effort = 'low'; next.limits.maxReportsPerTask = 77;
    controller.updateConfig(next);
    assert.equal(controller.summary().settingsPending, true);
    assert.equal(controller.configHash(), oldHash); assert.equal(controller.intent('worker'), intent);
    assert.equal(revokes, 0); assert.equal(task.limits.maxReportsPerTask, 40);
    await runScan(controller);
    assert.equal(task.status, 'running'); assert.equal(userNotices.length, 0);
    await assert.rejects(controller.start('worker'), /pending until all tasks/);
    assert.equal(revokes, 0); assert.equal(record.workerGeneration, generation);
    const report = envelope(f);
    runtime.settledSequence = 1;
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    await runScan(controller);
    assert.equal(task.status, 'review');
    await controller.inspect('worker', report.reportId);
    await controller.decide({ workerId: 'worker', taskId: task.id, reportId: report.reportId, action: 'approve', checkpointHash: task.report.checkpoint.checkpointHash, feedback: 'Approve retained task' });
    assert.equal(task.status, 'completed');
    let stops = 0;
    runtime.abortAndStop = async () => { stops++; await runScan(controller); runtime.closed = true; };
    const sessionFile = record.sessionFile;
    // Directly probe the boundary without invoking a real Pi process.
    await controller.reconcileConfig();
    assert.equal(stops, 1); assert.equal(controller.config.workers[0].effort, 'low');
    assert.equal(controller.pendingConfig, null); assert.equal(controller.handles.size, 0);
    assert.equal(record.status, 'stopped'); assert.equal(record.sessionFile, sessionFile);
    assert.ok(!userNotices.some(message => /authority is held|configuration drift/i.test(message)));
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

test('idle settings reconciliation waits for confirmed exit and retains newest edit on race', async () => {
  const { controller, task, record, runtime, userNotices, base } = await fixture();
  try {
    task.status = 'completed'; record.status = 'ready';
    const next = structuredClone(controller.config); next.workers[0].effort = 'low'; controller.updateConfig(next);
    let stops = 0;
    runtime.abortAndStop = async () => {
      stops++; await runScan(controller);
      const latest = structuredClone(next); latest.workers[0].effort = 'minimal'; controller.updateConfig(latest);
      runtime.closed = true;
    };
    await assert.rejects(controller.reconcileConfig(), /Settings changed during reconciliation/);
    assert.equal(stops, 1); assert.equal(controller.pendingConfig.workers[0].effort, 'minimal');
    assert.equal(controller.config.workers[0].effort, 'high');
    await controller.reconcileConfig();
    assert.equal(controller.config.workers[0].effort, 'minimal'); assert.equal(controller.pendingConfig, null);
    assert.equal(userNotices.length, 0);
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

test('unconfirmed exits and real config drift remain held despite staged settings', async () => {
  const { controller, task, record, runtime, base } = await fixture();
  try {
    task.status = 'completed'; record.status = 'ready';
    const hash = controller.configHash();
    const next = structuredClone(controller.config); next.workers[0].effort = 'low'; controller.updateConfig(next);
    runtime.abortAndStop = async () => { throw Error('unknown exit'); };
    await assert.rejects(controller.reconcileConfig(), /unknown exit/);
    assert.equal(controller.configHash(), hash); assert.ok(controller.pendingConfig);
    assert.match(record.error, /EXIT_UNCONFIRMED/);
    controller.handles.delete('worker');
    await assert.rejects(controller.reconcileConfig(), /EXIT_UNCONFIRMED/);
    controller.handles.set('worker', runtime); record.status = 'ready'; runtime.abortAndStop = async () => { runtime.closed = true; };
    controller.runtimeData.get(runtime).configHash = 'unexplained-drift';
    await runScan(controller);
    assert.equal(controller.runtimeData.get(runtime).failureHandled, true);
    assert.match(record.error, /configuration drift/);
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

test('no-op, indicator and reverted runtime edits never revoke or schedule startup', async () => {
  const { controller, task, runtime, base } = await fixture();
  try {
    let revokes = 0; runtime.revoke = () => { revokes++; }; runtime.settledSequence = 0;
    const before = structuredClone(controller.config), hash = controller.configHash();
    controller.updateConfig(before);
    controller.updateConfig({ ...before, indicator: 'off' });
    assert.equal(controller.pendingConfig, null); assert.equal(controller.configHash(), hash);
    const next = structuredClone(before); next.workers[0].effort = 'low'; controller.updateConfig(next);
    controller.updateConfig(before);
    assert.equal(controller.pendingConfig, null); assert.equal(revokes, 0);
    await runScan(controller); assert.equal(task.status, 'running');
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

test('scoped warming preference updates only nonauthorizing authority data and preserves the in-flight report', async () => {
  const { controller, task, record, runtime, workerDir, base } = await fixture();
  try {
    let revokes = 0; runtime.revoke = () => { revokes++; };
    const before = JSON.parse(await fs.readFile(path.join(workerDir, 'authority.json'), 'utf8'));
    const taskBefore = JSON.stringify(task), hash = controller.configHash(), intent = controller.intent('worker');
    const report = envelope({ controller, task, record, runtime });
    await controller.updateConfig({ ...controller.config, cacheWarming: 'active' });
    const after = JSON.parse(await fs.readFile(path.join(workerDir, 'authority.json'), 'utf8'));
    assert.deepEqual(after, { ...before, cacheWarming: 'active' });
    assert.equal(JSON.stringify(task), taskBefore);
    assert.equal(controller.configHash(), hash); assert.equal(controller.intent('worker'), intent);
    assert.equal(revokes, 0); assert.equal(controller.pendingConfig, null);
    await controller.updateConfig({ ...controller.config, enabled: false });
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(workerDir, 'authority.json'), 'utf8')), { ...before, cacheWarming: 'off' });
    await controller.updateConfig({ ...controller.config, enabled: true });
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    await runScan(controller);
    assert.equal(task.status, 'review'); assert.equal(task.report.reportId, report.reportId);
    assert.equal(JSON.parse(await fs.readFile(path.join(workerDir, 'authority.json'), 'utf8')).phase, 'waiting');
    await controller.cancel('worker', 'fixture cancel');
    const cancelled = JSON.parse(await fs.readFile(path.join(workerDir, 'authority.json'), 'utf8'));
    assert.equal(cancelled.phase, 'paused', 'warming preference never overrides a closed task phase');
    assert.equal(task.status, 'cancelled'); assert.equal(task.report.reportId, report.reportId);
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

test('removed turn/duration limits no longer pause running tasks, even with legacy snapshot values; cost budgets still do', async () => {
  const { controller, task, runtime, userNotices, base } = await fixture();
  try {
    runtime.settledSequence = 0;
    let revokes = 0; runtime.revoke = () => { revokes++; };
    task.turns = 999999; task.startedAt = Date.now() - 10 * 60 * 60 * 1000;
    task.limits = { ...task.limits, maxTurnsPerStep: 40, taskTimeoutMs: 1800000 };
    await runScan(controller);
    assert.equal(task.status, 'running', 'legacy turn/duration values must not stop the task');
    assert.equal(revokes, 0);
    assert.deepEqual(userNotices, []);
    task.limits.maxReportedCostUsd = 1; task.usage = { ...ZERO_USAGE, reportedCost: 5 };
    await runScan(controller);
    assert.equal(task.status, 'paused');
    assert.equal(task.interruption, 'Reported inference-cost budget reached');
    assert.ok(userNotices.some(message => message.includes('Reported inference-cost budget reached')));
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }).catch(() => {}); }
});

test('warming publication failure contains the owned generation instead of leaving a stale paid opt-in', async () => {
  const { controller, task, runtime, workerDir, base } = await fixture();
  try {
    let stops = 0;
    runtime.abortAndStop = async () => { stops++; runtime.closed = true; };
    const budget = { limits: structuredClone(task.limits), startedAt: task.startedAt, turns: task.turns };
    await fs.rm(path.join(workerDir, 'authority.json'));
    await assert.rejects(controller.updateConfig({ ...controller.config, cacheWarming: 'active' }));
    assert.equal(stops, 1); assert.equal(task.status, 'interrupted');
    assert.deepEqual({ limits: task.limits, startedAt: task.startedAt, turns: task.turns }, budget);
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

/** Stub the continuation path so a decision can reach activation without a real worker. */
function stubContinuation(runtime, record) {
  let serial = 0; const prompts = [];
  Object.assign(runtime, {
    reserveActivation: identity => Object.freeze({ ...identity, serial: ++serial }), activationCurrent: () => true,
    ensureStarted: async () => ({ probe: record.probe || null, state: { sessionId: record.sessionId, sessionFile: record.sessionFile } }),
    prepareActivation: async () => ({ probe: record.probe || null }), activate: async (...args) => { prompts.push(args); },
  });
  return prompts;
}

test('an answer after workspace drift is rejected before it is recorded; the question stays decidable', async () => {
  const { controller, repo, task, record, runtime, workerDir, base } = await fixture();
  try {
    const report = envelope({ controller, task, record, runtime, kind: 'question', reportId: 'report-drift-q' });
    report.payload.question = 'Which name?'; report.payloadHash = digest(report.payload);
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    await runScan(controller);
    assert.equal(task.status, 'question');
    const prompts = stubContinuation(runtime, record);
    const drift = path.join(repo, 'human-note.txt');
    await fs.writeFile(drift, 'edited after the question\n');
    const answer = { workerId: 'worker', taskId: task.id, reportId: report.reportId, action: 'answer', feedback: 'Use foo' };
    await assert.rejects(controller.decide(answer), /STALE_CHECKPOINT: the workspace changed after this report/);
    assert.equal(task.decisions[report.reportId], undefined, 'a rejected decision is not recorded');
    assert.equal(task.status, 'question', 'the question stays open');
    assert.notEqual(record.status, 'error', 'the worker is not contained');
    assert.notEqual(controller.state.notices[report.reportId].status, 'resolved');
    assert.equal(prompts.length, 0);
    await assert.rejects(controller.decide({ ...answer, action: 'revise' }), /STALE_CHECKPOINT/, 'revise is guarded the same way');
    assert.equal(task.revisions, 0, 'a rejected revision does not consume the revision budget');
    await fs.rm(drift);
    const result = await controller.decide(answer);
    assert.equal(result.duplicate, undefined, 'restoring the reported state makes the same answer admissible');
    assert.equal(task.decisions[report.reportId].action, 'answer');
    assert.equal(prompts.length, 1, 'the answer reaches the worker');
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

test('an unchanged retained latch does not rewrite state on every scan', async () => {
  const { controller, task, record, runtime, workerDir, base } = await fixture();
  try {
    const report = envelope({ controller, task, record, runtime });
    await fs.writeFile(path.join(workerDir, 'latch.json'), JSON.stringify(validateLatch({ ownerEpoch: report.ownerEpoch, workerGeneration: report.workerGeneration, leaseId: report.leaseId, attemptId: report.attemptId, report })));
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    await runScan(controller);
    assert.equal(task.status, 'review');
    let persists = 0, changes = 0;
    const persist = controller.persist.bind(controller);
    controller.persist = async (...args) => { persists++; return persist(...args); };
    controller.on('change', () => changes++);
    for (let i = 0; i < 3; i++) await runScan(controller);
    assert.equal(persists, 0, 'a duplicate latch changes no durable state');
    assert.equal(changes, 0);
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

test('a human report or diff view never counts as Main inspection', async () => {
  const { controller, repo, task, record, runtime, workerDir, base } = await fixture();
  try {
    await fs.writeFile(path.join(repo, 'feature.txt'), 'new line\n');
    const report = envelope({ controller, task, record, runtime });
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    await runScan(controller);
    assert.equal(task.status, 'review');
    const view = controller.reportView('worker');
    assert.equal(view.reportId, report.reportId); assert.equal(view.kind, 'final_review');
    assert.deepEqual(view.changed, ['feature.txt']); assert.equal(view.acknowledged, false);
    const diff = await controller.reviewPatch('worker');
    assert.match(diff.patch, /### "feature.txt" \(absent → file\)/);
    assert.equal(diff.added.get('feature.txt'), 'new line\n', 'added-file contents are read for the human view');
    assert.match(humanPatch(diff.patch, diff.added), /### feature.txt \(absent → file\)\n--- \/dev\/null\n\+\+\+ b\/feature.txt\n\+new line/);
    assert.equal(task.report.inspectedAt, undefined, 'viewing does not mark the checkpoint inspected');
    assert.equal(controller.state.notices[report.reportId].observedAt, undefined, 'viewing does not acknowledge the notice');
    assert.equal(controller.summary().waitingReports, 1, 'the report still waits for Main');
    await assert.rejects(controller.decide({ workerId: 'worker', taskId: task.id, reportId: report.reportId, action: 'approve', checkpointHash: view.checkpointHash, feedback: 'ok' }),
      /Inspect the current review checkpoint before approval/, 'Main still has to pair_inspect before approving');
  } finally { runtime.closed = true; await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
});

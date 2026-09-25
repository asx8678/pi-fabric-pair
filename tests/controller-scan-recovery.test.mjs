import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PairController } from '../src/controller.js';
import { loadConfig } from '../src/config.js';
import { digest, PROTOCOL } from '../src/util.js';

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
  const loaded = await loadConfig(repo, true);
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

test('scan accepts a retained inbox report and freezes the review checkpoint', async () => {
  const { controller, task, record, runtime, workerDir, mainNotices, base } = await fixture();
  try {
    const report = envelope({ controller, task, record, runtime });
    await fs.writeFile(path.join(workerDir, 'inbox', `${report.reportId}.json`), JSON.stringify(report));
    await runScan(controller);
    assert.equal(task.status, 'review', 'task must move to review after scan accepted the retained report');
    assert.equal(task.report?.reportId, report.reportId);
    assert.match(task.report?.checkpoint?.checkpointHash || '', /^[a-f0-9]{64}$/, 'immutable checkpoint hash must be frozen');
    assert.ok(controller.state.notices[report.reportId], 'a stored notice must exist for the report');
    assert.ok(mainNotices.some(message => message.includes(report.reportId)), 'Main must have received the report delivery');
    assert.equal(record.status, 'review');
    assert.equal(record.lastExchange?.direction, 'worker→main');
    const inbox = await fs.readdir(path.join(workerDir, 'inbox'));
    assert.equal(inbox.length, 0, 'accepted inbox file must be consumed');
    const archive = await fs.readdir(path.join(workerDir, 'archive'));
    assert.ok(archive.includes(`${report.reportId}.json`), 'original bytes must be retained in the archive');
    const persisted = JSON.parse(await fs.readFile(path.join(controller.dir, 'state.json'), 'utf8'));
    assert.equal(persisted.workers.worker.task.status, 'review', 'review state must be durable');
    const stepList = controller.summary().workers[0].task.stepList;
    assert.equal(stepList.length, 1, 'summary must expose the plan step list');
    assert.equal(stepList[0].state, 'review', 'the reporting step must display as in-review');
    assert.equal(stepList[0].title, 'Step');
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

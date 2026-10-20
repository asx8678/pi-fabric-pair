/** @typedef {import('../src/controller.js').PairController} PairController */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PairController, taskSummary } from '../src/controller.js';

/** Fields the UI relies on today; the projection must keep every one of them. */
const LEGACY_TASK_KEYS = ['id', 'attemptId', 'attemptNumber', 'objective', 'status', 'step', 'steps', 'revisions', 'reportId', 'reportKind', 'lastDecision', 'checkpointHash', 'reportedCost', 'startedAt', 'turns', 'stepList'];
const NEW_TASK_KEYS = ['stepRevisions', 'limits', 'limitNotice', 'updatedAt', 'lastVerification', 'timeline'];

/** A stored task as Pair persisted it before this change: no stepRevisions, limits, updatedAt or report. */
function olderTask() {
  return {
    id: 'task-old', requestId: 'request-old', attemptId: 'attempt-old', attemptNumber: 1,
    objective: 'Add retries', context: '', constraints: [], planRevision: 1,
    steps: [{ id: 'step-a', title: 'Add retry policy' }, { id: 'step-b', title: 'Wire it in' }],
    stepIndex: 0, status: 'running', leaseId: 'lease-old', turns: 3, revisions: 0,
    startedAt: 1000, baseSnapshotRef: '/tmp/base.json', usage: null, lastDecision: null,
    pendingReport: null, decisions: {}
  };
}

/** A current stored task with a finalized checkpoint report. */
function currentTask() {
  return {
    ...olderTask(), id: 'task-current', attemptId: 'attempt-current', stepRevisions: 2, updatedAt: 5000,
    status: 'review', revisions: 3, plans: undefined,
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: { maxReportedCostUsd: 2, maxOutputTokens: null, activeStepTimeoutMs: 1800000, maxReportsPerTask: 50, maxReportBytes: 100000, maxAutomaticReportRepairs: 2, maxAutomaticRecoveryAttempts: 3 },
    usage: { input: 10, cacheRead: 0, cacheWrite: 0, totalInput: 10, output: 20, reportedCost: 2.5, unknownCostRequests: 0, requests: 1, cacheRatio: null },
    lastDecision: { action: 'revise', feedback: 'split it', reportId: 'report-1' },
    report: {
      reportId: 'report-1', payload: { kind: 'checkpoint', summary: 'did it', checks: [{ name: 'manual', result: 'pass' }] },
      checkpoint: {
        path: '/tmp/evidence', checkpointHash: 'hash-1', changed: ['src/a.js'], patchTruncated: false,
        verification: [
          { name: 'typecheck', source: 'controller-configured', passed: true, code: 0, timedOut: false, output: 'ok', artifact: '/tmp/evidence/typecheck.log' },
          { name: 'test', source: 'controller-configured', passed: false, code: 1, timedOut: false, output: 'boom', artifact: '/tmp/evidence/test.log' }
        ]
      }
    }
  };
}

test('taskSummary keeps every existing field and its value', () => {
  const task = currentTask(), summary = taskSummary(task);
  for (const key of LEGACY_TASK_KEYS) assert.ok(Object.hasOwn(summary, key), `missing legacy field ${key}`);
  assert.deepEqual(Object.keys(summary).sort(), [...LEGACY_TASK_KEYS, ...NEW_TASK_KEYS].sort());
  assert.equal(summary.id, 'task-current');
  assert.equal(summary.attemptId, 'attempt-current');
  assert.equal(summary.attemptNumber, 1);
  assert.equal(summary.objective, 'Add retries');
  assert.equal(summary.status, 'review');
  assert.equal(summary.step, 1);
  assert.equal(summary.steps, 2);
  assert.equal(summary.revisions, 3);
  assert.equal(summary.reportId, 'report-1');
  assert.equal(summary.reportKind, 'checkpoint');
  assert.equal(summary.lastDecision, 'revise');
  assert.equal(summary.checkpointHash, 'hash-1');
  assert.equal(summary.reportedCost, 2.5);
  assert.equal(summary.startedAt, 1000);
  assert.equal(summary.turns, 3);
  assert.deepEqual(summary.stepList, [
    { id: 'step-a', title: 'Add retry policy', state: 'review' },
    { id: 'step-b', title: 'Wire it in', state: 'todo' }
  ]);
});

test('taskSummary projects the new fields', () => {
  const summary = taskSummary(currentTask());
  assert.equal(summary.stepRevisions, 2);
  assert.deepEqual(summary.limits, { maxRevisions: 20, maxRevisionsPerStep: 3, maxReportedCostUsd: 2, maxOutputTokens: null });
  assert.equal(summary.limitNotice, 'Reported inference-cost budget reached');
  assert.equal(summary.updatedAt, 5000);
  assert.deepEqual(summary.lastVerification, [
    { name: 'typecheck', passed: true, timedOut: false, code: 0 },
    { name: 'test', passed: false, timedOut: false, code: 1 }
  ]);
});

test('lastVerification never carries check output or artifact paths', () => {
  const summary = taskSummary(currentTask());
  for (const check of summary.lastVerification) assert.deepEqual(Object.keys(check).sort(), ['code', 'name', 'passed', 'timedOut']);
  const text = JSON.stringify(summary.lastVerification);
  assert.equal(/artifact|\.log|boom/.test(text), false);
});

test('limitNotice stays null below the budget', () => {
  const task = currentTask();
  /** @type {any} */ (task).usage.reportedCost = 0.5;
  assert.equal(taskSummary(task).limitNotice, null);
  /** @type {any} */ (task.limits).maxOutputTokens = 20;
  assert.equal(taskSummary(task).limitNotice, 'Output-token budget reached');
});

test('an older task object projects without throwing', () => {
  const summary = taskSummary(olderTask());
  assert.equal(summary.stepRevisions, 0);
  assert.deepEqual(summary.limits, { maxRevisions: null, maxRevisionsPerStep: null, maxReportedCostUsd: null, maxOutputTokens: null });
  assert.equal(summary.limitNotice, null);
  assert.equal(summary.updatedAt, null);
  assert.deepEqual(summary.lastVerification, []);
  assert.equal(summary.reportId, null);
  assert.equal(summary.reportedCost, null);
  assert.deepEqual(summary.stepList, [
    { id: 'step-a', title: 'Add retry policy', state: 'active' },
    { id: 'step-b', title: 'Wire it in', state: 'todo' }
  ]);
});

test('the timeline is additive: absent means no history', () => {
  // Step 1's fields are untouched; the timeline is the step 5 addition and starts empty.
  assert.deepEqual(taskSummary(olderTask()).timeline, []);
  assert.deepEqual(taskSummary(currentTask()).timeline, []);
  const withHistory = taskSummary(/** @type {any} */ ({ ...currentTask(), timeline: [
    { type: 'report', reportId: 'report-1', step: 1, kind: 'checkpoint', at: 10, verification: { passed: 2, failed: 1 } },
    { type: 'decision', reportId: 'report-1', step: 1, action: 'approve', at: 20, feedback: 'looks good' }
  ] }));
  assert.deepEqual(withHistory.timeline.map(entry => entry.type), ['report', 'decision']);
});

test('a partial task projection is total, not throwing', () => {
  const summary = taskSummary(/** @type {any} */ ({ id: 'task-bare' }));
  assert.equal(summary.status, '');
  assert.equal(summary.step, 1);
  assert.equal(summary.steps, 0);
  assert.deepEqual(summary.stepList, []);
  assert.deepEqual(summary.lastVerification, []);
});

test('summary() projects the stored task with taskSummary', () => {
  const worker = { id: 'w1', status: 'ready', bound: { id: 'w1' }, task: currentTask(), history: [], usage: null };
  // A structural double: summary() only reads these fields and calls phaseEligible/recoveryNotices.
  const controller = /** @type {PairController} */ (/** @type {unknown} */ ({
    ownerSession: 'session-1', state: { ownerEpoch: 7, workers: { w1: worker }, notices: {}, requests: {} }, dir: '/tmp/pair',
    config: { enabled: true, autoDeliverReports: true, workers: [{ id: 'w1', provider: 'p', model: 'm', effort: 'high', readOnly: false, cwd: null }] },
    pendingConfig: null, mainObservation: null, handles: new Map(), runtimeData: new Map(), workspaceGit: new Map([['/tmp/pair', true]]), recentActivity: new Map(),
    phaseEligible: () => false, recoveryNotices: () => [], workspaceFor: () => '/tmp/pair'
  }));
  const summary = PairController.prototype.summary.call(controller);
  assert.equal(summary.ownerSession, 'session-1');
  assert.equal(summary.ownerEpoch, 7);
  assert.equal(summary.enabled, true);
  assert.equal(summary.waitingReports, 0);
  assert.equal(summary.workers.length, 1);
  const projected = summary.workers[0].task;
  if (!projected) assert.fail('task projection missing');
  assert.deepEqual(Object.keys(projected).sort(), [...LEGACY_TASK_KEYS, ...NEW_TASK_KEYS].sort());
  assert.equal(projected.stepRevisions, 2);
  assert.equal(projected.updatedAt, 5000);
  assert.equal(projected.limits.maxRevisionsPerStep, 3);
  assert.deepEqual(projected.lastVerification.map(check => check.name), ['typecheck', 'test']);
  assert.equal(summary.workers[0].id, 'w1');
  assert.equal(summary.cacheNote.includes('Cache observations'), true);
});
test('taskSummary is pure: it does not mutate the stored task', () => {
  const task = currentTask(), before = structuredClone(task);
  const first = taskSummary(task), second = taskSummary(task);
  assert.deepEqual(task, before);
  assert.deepEqual(first, second);
});

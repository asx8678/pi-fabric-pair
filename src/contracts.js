import { createHash } from 'node:crypto';

export const STATE_VERSION = 1;
export const WIRE_VERSION = 1;

const RESERVED_IDS = new Set(['prototype', ...Object.getOwnPropertyNames(Object.prototype)]);
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const POLICY_KEYS = ['mode', 'finalReview', 'maxRevisions', 'maxRevisionsPerStep', 'summaryDetail'];
const LIMIT_KEYS = ['maxTurnsPerStep', 'taskTimeoutMs', 'activeStepTimeoutMs', 'maxQueuedTasks', 'maxQueuedReviews', 'maxReportsPerTask', 'maxReportBytes', 'maxAutomaticReportRepairs', 'maxAutomaticRecoveryAttempts', 'maxReportedCostUsd', 'maxOutputTokens'];
const LIMIT_BOUNDS = Object.freeze({ maxQueuedTasks: [0, 128], maxQueuedReviews: [0, 128], maxReportsPerTask: [1, 1000], maxReportBytes: [1, 1048576], maxAutomaticReportRepairs: [0, 20], maxAutomaticRecoveryAttempts: [0, 20] });
const TASK_STATUSES = ['running', 'awaiting_settle', 'question', 'blocked', 'review', 'paused', 'interrupted', 'completed', 'cancelled'];
const WORKER_STATUSES = ['stopped', 'starting', 'ready', 'working', 'settling', 'question', 'blocked', 'review', 'paused', 'attention', 'error'];
const AUTHORITY_PHASES = ['idle', 'running', 'waiting', 'paused', 'stopped'];
const REPORT_KEYS = ['version', 'reportId', 'workerId', 'ownerSession', 'ownerEpoch', 'workerGeneration', 'nonce', 'sessionId', 'leaseId', 'attemptId', 'attemptNumber', 'planRevision', 'payload', 'payloadHash', 'createdAt'];

/** @typedef {Record<string, unknown>} JSONObject */
/** @typedef {{ownerSession?: string, ownerEpoch?: number, workerId?: string, workerGeneration?: number}} ExpectedIdentity */

/** @typedef {'final-only' | 'milestones' | 'every-step'} ReviewMode */
/** @typedef {'minimal' | 'normal' | 'detailed'} SummaryDetail */
/** @typedef {{mode: ReviewMode, finalReview: true, maxRevisions: number, maxRevisionsPerStep: number, summaryDetail: SummaryDetail}} TaskPolicy */
/** @typedef {{mode: ReviewMode | 'final' | 'strict', finalReview: true, maxRevisions: number, maxRevisionsPerStep?: number, summaryDetail: SummaryDetail}} LegacyTaskPolicy */
/** @typedef {{maxTurnsPerStep: number, taskTimeoutMs: number, maxReportedCostUsd: number | null, maxOutputTokens: number | null}} BaseTaskLimits */
/** @typedef {{activeStepTimeoutMs: number, maxQueuedTasks: number, maxQueuedReviews: number, maxReportsPerTask: number, maxReportBytes: number, maxAutomaticReportRepairs: number, maxAutomaticRecoveryAttempts: number}} DeferredTaskLimits */
/** @typedef {BaseTaskLimits & DeferredTaskLimits} TaskLimits */
/** @typedef {BaseTaskLimits & Partial<DeferredTaskLimits>} LegacyTaskLimits */
/** @typedef {{id: string, title: string, instructions: string, acceptance?: string[]}} Step */
/** @typedef {'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'} Effort */
/** @typedef {{id: string, provider: string, model: string, effort: Effort, cwd: string | null, readOnly: boolean}} WorkerSpec */
/** @typedef {{name: string, command: string, args: string[]}} VerificationCommand */
/** @typedef {{commands: VerificationCommand[], requirePassing: boolean, timeoutMs: number}} VerificationPolicy */
/** @typedef {'answer' | 'approve' | 'revise'} ContinuationAction */
/** @typedef {'pending' | 'accepted' | 'not_required' | 'not_sent_budget'} DecisionDelivery */
/** @typedef {{hash: string, action: 'cancel', at: number}} CancelDecision */
/** @typedef {{hash: string, action: ContinuationAction, feedback: string, checkpointHash: string | null, ownerEpoch: number, workerGeneration: number, attemptId: string, deliveryOperationId: string, at: number, reviewerModel: string | null, delivery: DecisionDelivery}} ContinuationDecision */
/** @typedef {CancelDecision | ContinuationDecision} StoredDecision */
/** @typedef {{action: ContinuationAction, feedback: string, reportId: string}} LastDecision */
/** @typedef {{name: string, result: 'pass' | 'fail' | 'not_run', detail?: string}} ReportedCheck */
/** @typedef {{taskId: string, stepId: string, summary: string, decisions?: string[], changedFiles?: string[], checks?: ReportedCheck[], stepComplete?: boolean}} ReportBody */
/** @typedef {ReportBody & ({kind: 'question', question: string} | {kind: 'checkpoint' | 'blocked' | 'final_review', question?: string})} ReportPayload */
/** @typedef {{version: 1, reportId: string, workerId: string, ownerSession: string, ownerEpoch: number, workerGeneration: number, nonce: string, sessionId: string, leaseId: string, attemptId: string, attemptNumber: number, planRevision: number, payload: ReportPayload, payloadHash: string, createdAt: number}} ReportEnvelope */
/** @typedef {{name: string, source: 'controller-configured', passed: boolean, code: number | null, timedOut: boolean, output: string, artifact: string}} VerificationResult */
/** @typedef {{path: string, checkpointHash: string, changed: string[], verification: VerificationResult[], patchTruncated: boolean}} Checkpoint */
/** @typedef {ReportEnvelope & {checkpoint: Checkpoint, snapshotRef: string, inspectedAt?: number}} FinalizedReport */
/** @typedef {{id: string, objective: string, planRevision: number, attemptId: string, attemptNumber: number, constraints: string[], steps: Step[], stepIndex: number, policy: LegacyTaskPolicy, limits: LegacyTaskLimits, lastDecision: LastDecision | null}} AuthorityTask */
/** @typedef {'idle' | 'running' | 'waiting' | 'paused' | 'stopped'} AuthorityPhase */
/** @typedef {{version: 1, ownerSession: string, ownerEpoch: number, workerId: string, workerGeneration: number, phase: AuthorityPhase, leaseId: string, attemptId: string | null, readOnly: boolean, model: {provider: string, id: string}, repoRoot: string, task: AuthorityTask | null, updatedAt: number}} Authority */
/** @typedef {{ownerEpoch: number, workerGeneration: number, leaseId: string, attemptId: string, report: ReportEnvelope}} Latch */

/** @param {unknown} condition @param {string} message @returns {asserts condition} */
function invariant(condition, message) { if (!condition) throw new Error(message); }
/** @param {unknown} value @returns {string} */
function payloadDigest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
/** @param {unknown} value @param {string} label @returns {asserts value is JSONObject} */
function assertObject(value, label) {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}
/** @param {unknown} value @param {string} label @returns {JSONObject} */
function object(value, label) { assertObject(value, label); return value; }
/** @param {unknown} value @param {string} label @returns {unknown[]} */
function array(value, label) {
  invariant(Array.isArray(value), `${label} must be an array`);
  for (let index = 0; index < value.length; index++) invariant(Object.hasOwn(value, index), `${label}[${index}] must be present`);
  return value;
}
/** @param {unknown} value @param {string} label @param {number} [maxLength] @returns {string} */
function text(value, label, maxLength = 24000) { invariant(typeof value === 'string' && value.length <= maxLength, `${label} must be a string of at most ${maxLength} characters`); return value; }
/** @param {unknown} value @param {string} label @param {number} [minimum] @param {number} [maximum] @returns {number} */
function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) { invariant(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum, `${label} must be a safe integer from ${minimum} to ${maximum}`); return value; }
/** @param {unknown} value @param {string} label @returns {boolean} */
function bool(value, label) { invariant(typeof value === 'boolean', `${label} must be boolean`); return value; }
/** @template {string} T @param {unknown} value @param {readonly T[]} values @param {string} label @returns {T} */
function choice(value, values, label) {
  const match = values.find(entry => entry === value);
  invariant(typeof value === 'string' && match !== undefined, `${label} must be one of ${values.join(', ')}`);
  return match;
}
/** @param {unknown} value @param {string} label @returns {string} */
function id(value, label) { const result = text(value, label, 80); invariant(ID_PATTERN.test(result) && !RESERVED_IDS.has(result), `${label} is not a safe identifier`); return result; }
/** @param {unknown} value @param {string} label @returns {string} */
function token(value, label) { const result = text(value, label, 128); invariant(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(result) && !RESERVED_IDS.has(result), `${label} is not a safe token`); return result; }
/** @param {JSONObject} value @param {string} key @param {string} label @returns {unknown} */
function required(value, key, label) { invariant(Object.hasOwn(value, key), `${label}.${key} is required`); return value[key]; }
/** @param {JSONObject} value @param {readonly string[]} allowed @param {string} label */
function keys(value, allowed, label) {
  for (const key of Object.keys(value)) invariant(allowed.includes(key), `${label}.${key} is not allowed`);
  for (const key of allowed) invariant(!(key in value) || Object.hasOwn(value, key), `${label}.${key} must be an own field`);
}
/** @param {unknown} value @param {string} label @returns {JSONObject | null} */
function optionalObject(value, label) { return value === null || value === undefined ? null : object(value, label); }
/** @param {unknown} value @param {string} label @returns {string | null} */
function nullableText(value, label) { return value === null ? null : text(value, label, 10000); }
/** @param {unknown} value @param {string} label @returns {asserts value is StoredDecision} */
function assertStoredDecision(value, label) {
  const decision = object(value, label); const action = choice(required(decision, 'action', label), ['answer', 'approve', 'revise', 'cancel'], `${label}.action`);
  const allowed = action === 'cancel' ? ['hash', 'action', 'at'] : ['hash', 'action', 'feedback', 'checkpointHash', 'ownerEpoch', 'workerGeneration', 'attemptId', 'deliveryOperationId', 'at', 'reviewerModel', 'delivery'];
  keys(decision, allowed, label); const hash = text(required(decision, 'hash', label), `${label}.hash`, 64); invariant(HASH_PATTERN.test(hash), `${label}.hash is invalid`); integer(required(decision, 'at', label), `${label}.at`);
  if (action !== 'cancel') {
    const feedback = text(required(decision, 'feedback', label), `${label}.feedback`, 12000); invariant(feedback.length >= 1, `${label}.feedback must not be empty`);
    const checkpointHash = required(decision, 'checkpointHash', label); invariant(checkpointHash === null || (typeof checkpointHash === 'string' && HASH_PATTERN.test(checkpointHash)), `${label}.checkpointHash must be null or a SHA-256 hash`);
    integer(required(decision, 'ownerEpoch', label), `${label}.ownerEpoch`, 1); integer(required(decision, 'workerGeneration', label), `${label}.workerGeneration`, 1); id(required(decision, 'attemptId', label), `${label}.attemptId`); id(required(decision, 'deliveryOperationId', label), `${label}.deliveryOperationId`);
    const reviewerModel = required(decision, 'reviewerModel', label); if (reviewerModel !== null) text(reviewerModel, `${label}.reviewerModel`, 1000);
    choice(required(decision, 'delivery', label), ['pending', 'accepted', 'not_required', 'not_sent_budget'], `${label}.delivery`);
  }

}

/** @param {unknown} value @param {string} label @returns {StoredDecision} */
function validateStoredDecision(value, label) { assertStoredDecision(value, label); return value; }

/** @param {unknown} value @param {string} label @returns {asserts value is LastDecision | null} */
function assertLastDecision(value, label) {
  if (value === null) return;
  const decision = object(value, label); keys(decision, ['action', 'feedback', 'reportId'], label); choice(required(decision, 'action', label), ['answer', 'approve', 'revise'], `${label}.action`); const feedback = text(required(decision, 'feedback', label), `${label}.feedback`, 12000); invariant(feedback.length >= 1, `${label}.feedback must not be empty`); id(required(decision, 'reportId', label), `${label}.reportId`);
}

/** @param {unknown} value @param {string} label @returns {LastDecision | null} */
function validateLastDecision(value, label) { assertLastDecision(value, label); return value; }

/** @param {JSONObject} report @param {string} label @param {{taskId: string, workerId: string, attemptId: string, attemptNumber: number, planRevision: number, leaseId: string, stepIds: Set<string>}} expected @param {boolean} current */
function validateTaskReportIdentity(report, label, expected, current) {
  const payload = object(required(report, 'payload', label), `${label}.payload`);
  invariant(required(payload, 'taskId', `${label}.payload`) === expected.taskId, `${label} targets a different task`);
  invariant(required(report, 'workerId', label) === expected.workerId, `${label} targets a different worker`);
  const stepId = required(payload, 'stepId', `${label}.payload`); invariant(typeof stepId === 'string' && expected.stepIds.has(stepId), `${label} targets a step outside the task plan`);
  if (current) invariant(required(report, 'attemptId', label) === expected.attemptId && required(report, 'attemptNumber', label) === expected.attemptNumber && required(report, 'planRevision', label) === expected.planRevision && required(report, 'leaseId', label) === expected.leaseId, `${label} does not match the current task attempt`);
}

/** @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {asserts value is LegacyTaskPolicy} */
function assertTaskPolicy(value, label = 'task.policy', { legacy = false } = {}) {
  const policy = object(value, label); keys(policy, POLICY_KEYS, label);
  choice(required(policy, 'mode', label), legacy ? ['final', 'final-only', 'milestones', 'strict', 'every-step'] : ['final-only', 'milestones', 'every-step'], `${label}.mode`);
  invariant(required(policy, 'finalReview', label) === true, `${label}.finalReview must be true`);
  integer(required(policy, 'maxRevisions', label), `${label}.maxRevisions`, 0, 20);
  if (!legacy || Object.hasOwn(policy, 'maxRevisionsPerStep')) integer(required(policy, 'maxRevisionsPerStep', label), `${label}.maxRevisionsPerStep`, 0, 20);
  choice(required(policy, 'summaryDetail', label), ['minimal', 'normal', 'detailed'], `${label}.summaryDetail`);

}

/** @overload @param {unknown} value @param {string} [label] @param {{legacy?: false}} [options] @returns {TaskPolicy} */
/** @overload @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {LegacyTaskPolicy} */
/** @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {LegacyTaskPolicy} */
export function validateTaskPolicy(value, label = 'task.policy', options = {}) { assertTaskPolicy(value, label, options); return value; }

/** @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {asserts value is LegacyTaskLimits} */
function assertTaskLimits(value, label = 'task.limits', { legacy = false } = {}) {
  const limits = object(value, label); keys(limits, LIMIT_KEYS, label);
  for (const key of ['maxTurnsPerStep', 'taskTimeoutMs']) integer(required(limits, key, label), `${label}.${key}`, 1);
  if (!legacy || Object.hasOwn(limits, 'activeStepTimeoutMs')) integer(required(limits, 'activeStepTimeoutMs', label), `${label}.activeStepTimeoutMs`, 1);
  for (const [key, bounds] of Object.entries(LIMIT_BOUNDS)) {
    if (legacy && !Object.hasOwn(limits, key)) continue;
    integer(required(limits, key, label), `${label}.${key}`, bounds[0], bounds[1]);
  }
  for (const key of ['maxReportedCostUsd', 'maxOutputTokens']) {
    const entry = required(limits, key, label);
    invariant(entry === null || (typeof entry === 'number' && Number.isFinite(entry) && entry > 0), `${label}.${key} must be positive or null`);
  }

}

/** @overload @param {unknown} value @param {string} [label] @param {{legacy?: false}} [options] @returns {TaskLimits} */
/** @overload @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {LegacyTaskLimits} */
/** @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {LegacyTaskLimits} */
export function validateTaskLimits(value, label = 'task.limits', options = {}) { assertTaskLimits(value, label, options); return value; }

/** @param {unknown} value @param {string} label @returns {asserts value is VerificationPolicy} */
function assertVerification(value, label) {
  const verification = object(value, label); keys(verification, ['commands', 'requirePassing', 'timeoutMs'], label);
  const commands = array(required(verification, 'commands', label), `${label}.commands`); invariant(commands.length <= 12, `${label}.commands is too large`);
  for (let index = 0; index < commands.length; index++) {
    const command = object(commands[index], `${label}.commands[${index}]`); keys(command, ['name', 'command', 'args'], `${label}.commands[${index}]`);
    text(required(command, 'name', `${label}.commands[${index}]`), `${label}.commands[${index}].name`, 1000);
    text(required(command, 'command', `${label}.commands[${index}]`), `${label}.commands[${index}].command`, 10000);
    const args = array(required(command, 'args', `${label}.commands[${index}]`), `${label}.commands[${index}].args`); invariant(args.length <= 256, `${label}.commands[${index}].args is too large`);
    args.forEach((entry, argIndex) => text(entry, `${label}.commands[${index}].args[${argIndex}]`, 10000));
  }
  bool(required(verification, 'requirePassing', label), `${label}.requirePassing`); integer(required(verification, 'timeoutMs', label), `${label}.timeoutMs`, 1);

}

/** @param {unknown} value @param {string} label @returns {VerificationPolicy} */
function validateVerification(value, label) { assertVerification(value, label); return value; }

/** @param {unknown} value @param {string} label @returns {asserts value is Step} */
function assertStep(value, label) {
  const step = object(value, label); keys(step, ['id', 'title', 'instructions', 'acceptance'], label);
  id(required(step, 'id', label), `${label}.id`); text(required(step, 'title', label), `${label}.title`, 200); text(required(step, 'instructions', label), `${label}.instructions`);
  if (Object.hasOwn(step, 'acceptance')) array(step.acceptance, `${label}.acceptance`).forEach((entry, index) => text(entry, `${label}.acceptance[${index}]`, 2000));

}

/** @param {unknown} value @param {string} label @returns {Step} */
function validateStep(value, label) { assertStep(value, label); return value; }

/** @param {unknown} value @param {string} label @returns {asserts value is WorkerSpec} */
function assertWorkerSpec(value, label) {
  const spec = object(value, label); keys(spec, ['id', 'provider', 'model', 'effort', 'cwd', 'readOnly'], label);
  id(required(spec, 'id', label), `${label}.id`); text(required(spec, 'provider', label), `${label}.provider`, 999); text(required(spec, 'model', label), `${label}.model`, 999);
  choice(required(spec, 'effort', label), ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'], `${label}.effort`);
  const cwd = required(spec, 'cwd', label); invariant(cwd === null || typeof cwd === 'string', `${label}.cwd must be null or a path`); bool(required(spec, 'readOnly', label), `${label}.readOnly`);

}

/** @param {unknown} value @param {string} label @returns {WorkerSpec} */
function validateWorkerSpec(value, label) { assertWorkerSpec(value, label); return value; }

/** @param {unknown} value @param {string} label @returns {boolean} */
function isLegacyTaskShape(value, label) {
  const task = object(value, label), policy = object(required(task, 'policy', label), `${label}.policy`), limits = object(required(task, 'limits', label), `${label}.limits`);
  const deferred = ['activeStepTimeoutMs', ...Object.keys(LIMIT_BOUNDS)], missing = deferred.filter(key => !Object.hasOwn(limits, key));
  const missingPerStep = !Object.hasOwn(policy, 'maxRevisionsPerStep');
  if (!missingPerStep && missing.length === 0) return false;
  invariant(missingPerStep && missing.length === deferred.length, `${label} has an ambiguous partial legacy policy/limit shape`);
  return true;
}

/** @param {unknown} value @param {string} label @param {{legacy?: boolean}} [options] @returns {JSONObject} */
function validateStoredTask(value, label, { legacy = false } = {}) {
  const task = object(value, label);
  keys(task, ['id', 'workerId', 'requestId', 'objective', 'context', 'constraints', 'steps', 'stepIndex', 'planRevision', 'attemptId', 'attemptNumber', 'status', 'leaseId', 'policy', 'limits', 'verification', 'startedAt', 'updatedAt', 'revisions', 'turns', 'usage', 'baseSnapshotRef', 'pendingReport', 'report', 'decisions', 'lastDecision', 'dispatchSettleSequence', 'pendingSince', 'abortRequested', 'interruption', 'previousStatus', 'completedAt', 'cancelReason'], label);
  const taskId = id(required(task, 'id', label), `${label}.id`), workerId = id(required(task, 'workerId', label), `${label}.workerId`), attemptId = id(required(task, 'attemptId', label), `${label}.attemptId`), leaseId = id(required(task, 'leaseId', label), `${label}.leaseId`);
  id(required(task, 'requestId', label), `${label}.requestId`);
  text(required(task, 'objective', label), `${label}.objective`, 6000); text(required(task, 'context', label), `${label}.context`, 24000);
  array(required(task, 'constraints', label), `${label}.constraints`).forEach((entry, index) => text(entry, `${label}.constraints[${index}]`, 2000));
  const steps = array(required(task, 'steps', label), `${label}.steps`); invariant(steps.length >= 1 && steps.length <= 32, `${label}.steps must contain 1–32 steps`); steps.forEach((entry, index) => validateStep(entry, `${label}.steps[${index}]`));
  const stepIds = new Set(steps.map((entry, index) => id(required(object(entry, `${label}.steps[${index}]`), 'id', `${label}.steps[${index}]`), `${label}.steps[${index}].id`)));
  const stepIndex = integer(required(task, 'stepIndex', label), `${label}.stepIndex`, 0, steps.length - 1); invariant(stepIndex < steps.length, `${label}.stepIndex is outside the plan`);
  const planRevision = integer(required(task, 'planRevision', label), `${label}.planRevision`, 1), attemptNumber = integer(required(task, 'attemptNumber', label), `${label}.attemptNumber`, 1), status = choice(required(task, 'status', label), TASK_STATUSES, `${label}.status`);
  validateTaskPolicy(required(task, 'policy', label), `${label}.policy`, { legacy }); validateTaskLimits(required(task, 'limits', label), `${label}.limits`, { legacy }); validateVerification(required(task, 'verification', label), `${label}.verification`);
  for (const key of ['startedAt', 'updatedAt', 'revisions', 'turns']) integer(required(task, key, label), `${label}.${key}`);
  text(required(task, 'baseSnapshotRef', label), `${label}.baseSnapshotRef`, 10000); optionalObject(required(task, 'usage', label), `${label}.usage`);
  const expectedReport = { taskId, workerId, attemptId, attemptNumber, planRevision, leaseId, stepIds };
  const decisions = object(required(task, 'decisions', label), `${label}.decisions`); for (const [reportId, decision] of Object.entries(decisions)) validateStoredDecision(decision, `${label}.decisions.${id(reportId, `${label}.decisions key`)}`);
  const pendingReport = required(task, 'pendingReport', label); if (pendingReport !== null) { const validPending = validateReportEnvelope(pendingReport, `${label}.pendingReport`); validateTaskReportIdentity(validPending, `${label}.pendingReport`, expectedReport, true); }
  const report = required(task, 'report', label); if (report !== null) {
    const validReport = validateFinalizedReport(report, `${label}.report`), reportId = id(required(validReport, 'reportId', `${label}.report`), `${label}.report.reportId`), previousStatus = task.previousStatus;
    const waiting = ['question', 'blocked', 'review'].includes(status) || (['paused', 'interrupted'].includes(status) && typeof previousStatus === 'string' && ['question', 'blocked', 'review'].includes(previousStatus));
    validateTaskReportIdentity(validReport, `${label}.report`, expectedReport, waiting && !Object.hasOwn(decisions, reportId));
  }
  validateLastDecision(required(task, 'lastDecision', label), `${label}.lastDecision`);
  for (const key of ['dispatchSettleSequence', 'pendingSince', 'completedAt']) if (Object.hasOwn(task, key)) integer(task[key], `${label}.${key}`);
  if (Object.hasOwn(task, 'abortRequested')) bool(task.abortRequested, `${label}.abortRequested`);
  for (const key of ['interruption', 'previousStatus', 'cancelReason']) if (Object.hasOwn(task, key)) text(task[key], `${label}.${key}`, 10000);
  return task;
}

/** @param {unknown} value @param {string} label @param {string} workerId @returns {JSONObject} */
function validateWorkerRecord(value, label, workerId) {
  const record = object(value, label); keys(record, ['id', 'cwd', 'repoRoot', 'status', 'sessionId', 'sessionFile', 'workerGeneration', 'bound', 'task', 'history', 'usage', 'error', 'lastObservation', 'lastExchange', 'staleReports', 'probe'], label);
  invariant(id(required(record, 'id', label), `${label}.id`) === workerId, `${label}.id does not match its map key`);
  text(required(record, 'cwd', label), `${label}.cwd`, 10000); text(required(record, 'repoRoot', label), `${label}.repoRoot`, 10000); choice(required(record, 'status', label), WORKER_STATUSES, `${label}.status`);
  nullableText(required(record, 'sessionId', label), `${label}.sessionId`); nullableText(required(record, 'sessionFile', label), `${label}.sessionFile`); integer(required(record, 'workerGeneration', label), `${label}.workerGeneration`);
  const bound = validateWorkerSpec(required(record, 'bound', label), `${label}.bound`); invariant(bound.id === workerId, `${label}.bound.id does not match its map key`);
  const task = required(record, 'task', label); if (task !== null) { const taskLabel = `${label}.task`, validTask = validateStoredTask(task, taskLabel, { legacy: isLegacyTaskShape(task, taskLabel) }); invariant(validTask.workerId === workerId, `${label}.task.workerId does not match its worker`); }
  const history = array(required(record, 'history', label), `${label}.history`); invariant(history.length <= 40, `${label}.history is too large`); history.forEach((entry, index) => { const item = object(entry, `${label}.history[${index}]`); keys(item, ['id', 'status', 'file'], `${label}.history[${index}]`); id(required(item, 'id', `${label}.history[${index}]`), `${label}.history[${index}].id`); text(required(item, 'status', `${label}.history[${index}]`), `${label}.history[${index}].status`, 80); text(required(item, 'file', `${label}.history[${index}]`), `${label}.history[${index}].file`, 10000); });
  optionalObject(required(record, 'usage', label), `${label}.usage`);
  if (Object.hasOwn(record, 'error')) nullableText(record.error, `${label}.error`); if (Object.hasOwn(record, 'lastObservation')) optionalObject(record.lastObservation, `${label}.lastObservation`); if (Object.hasOwn(record, 'lastExchange')) optionalObject(record.lastExchange, `${label}.lastExchange`); if (Object.hasOwn(record, 'probe')) optionalObject(record.probe, `${label}.probe`);
  if (Object.hasOwn(record, 'staleReports')) array(record.staleReports, `${label}.staleReports`).forEach((entry, index) => object(entry, `${label}.staleReports[${index}]`));
  return record;
}

/** Add only fields absent from the known pre-identity state shape. Present malformed values are preserved for validation failure. @param {unknown} value @param {() => string} createAttemptId */
export function migrateStoredState(value, createAttemptId) {
  const state = structuredClone(object(value, 'state')); let migrated = false;
  invariant(state.version === STATE_VERSION, `Unsupported Pair state version ${String(state.version)}`);
  const workers = object(required(state, 'workers', 'state'), 'state.workers'), identityPresence = [Object.hasOwn(state, 'ownerEpoch')];
  for (const [workerId, workerValue] of Object.entries(workers)) {
    id(workerId, 'state.workers key'); const record = object(workerValue, `state.workers.${workerId}`); identityPresence.push(Object.hasOwn(record, 'workerGeneration'));
    if (record.task !== null && record.task !== undefined) { const task = object(record.task, `state.workers.${workerId}.task`); for (const key of ['workerId', 'attemptNumber', 'attemptId']) identityPresence.push(Object.hasOwn(task, key)); }
  }
  const presentIdentities = identityPresence.filter(Boolean).length;
  invariant(presentIdentities === 0 || presentIdentities === identityPresence.length, 'Stored Pair state has mixed present/missing identity fields and requires explicit reconciliation');
  const legacyIdentity = presentIdentities === 0;
  if (legacyIdentity) { state.ownerEpoch = 0; migrated = true; }
  for (const [workerId, workerValue] of Object.entries(workers)) {
    const record = object(workerValue, `state.workers.${workerId}`);
    if (legacyIdentity) { record.workerGeneration = 0; migrated = true; }
    if (record.task !== null && record.task !== undefined) {
      const task = object(record.task, `state.workers.${workerId}.task`);
      if (legacyIdentity) { task.workerId = workerId; task.attemptNumber = 1; task.attemptId = id(createAttemptId(), 'generated attemptId'); migrated = true; }
      const policy = object(required(task, 'policy', `state.workers.${workerId}.task`), `state.workers.${workerId}.task.policy`);
      if (policy.mode === 'final') { policy.mode = 'final-only'; migrated = true; }
      else if (policy.mode === 'strict') { policy.mode = 'every-step'; migrated = true; }
      else invariant(policy.mode !== 'adaptive', 'Stored adaptive task policy requires explicit human reconciliation');
    }
  }
  return { state, migrated };
}

/** @param {unknown} value @param {{ownerSession: string, cwd: string}} expected @returns {JSONObject} */
export function validateStoredState(value, expected) {
  const state = object(value, 'state'); keys(state, ['version', 'ownerSession', 'ownerEpoch', 'cwd', 'workers', 'requests', 'notices'], 'state');
  invariant(integer(required(state, 'version', 'state'), 'state.version', STATE_VERSION, STATE_VERSION) === STATE_VERSION, 'Unsupported Pair state version');
  invariant(text(required(state, 'ownerSession', 'state'), 'state.ownerSession', 10000) === expected.ownerSession, 'Stored Pair state belongs to a different Main session');
  invariant(text(required(state, 'cwd', 'state'), 'state.cwd', 10000) === expected.cwd, 'Stored Pair state belongs to a different workspace'); integer(required(state, 'ownerEpoch', 'state'), 'state.ownerEpoch');
  const workers = object(required(state, 'workers', 'state'), 'state.workers'); for (const [workerId, record] of Object.entries(workers)) validateWorkerRecord(record, `state.workers.${workerId}`, id(workerId, 'state.workers key'));
  const requests = object(required(state, 'requests', 'state'), 'state.requests'); for (const [requestId, requestValue] of Object.entries(requests)) { id(requestId, 'state.requests key'); const request = object(requestValue, `state.requests.${requestId}`); keys(request, ['hash', 'taskId', 'workerId', 'acceptedAt', 'status'], `state.requests.${requestId}`); invariant(text(required(request, 'hash', `state.requests.${requestId}`), `state.requests.${requestId}.hash`, 64).match(HASH_PATTERN), `state.requests.${requestId}.hash is invalid`); id(required(request, 'taskId', `state.requests.${requestId}`), `state.requests.${requestId}.taskId`); id(required(request, 'workerId', `state.requests.${requestId}`), `state.requests.${requestId}.workerId`); integer(required(request, 'acceptedAt', `state.requests.${requestId}`), `state.requests.${requestId}.acceptedAt`); text(required(request, 'status', `state.requests.${requestId}`), `state.requests.${requestId}.status`, 80); }
  const notices = object(required(state, 'notices', 'state'), 'state.notices'); for (const [reportId, noticeValue] of Object.entries(notices)) { id(reportId, 'state.notices key'); const notice = object(noticeValue, `state.notices.${reportId}`); keys(notice, ['reportId', 'workerId', 'taskId', 'ownerEpoch', 'workerGeneration', 'attemptId', 'deliveryOperationId', 'status', 'createdAt', 'deliveredAt', 'error'], `state.notices.${reportId}`); invariant(id(required(notice, 'reportId', `state.notices.${reportId}`), `state.notices.${reportId}.reportId`) === reportId, `state.notices.${reportId}.reportId mismatch`); for (const key of ['workerId', 'taskId', 'attemptId', 'deliveryOperationId']) id(required(notice, key, `state.notices.${reportId}`), `state.notices.${reportId}.${key}`); integer(required(notice, 'ownerEpoch', `state.notices.${reportId}`), `state.notices.${reportId}.ownerEpoch`, 1); integer(required(notice, 'workerGeneration', `state.notices.${reportId}`), `state.notices.${reportId}.workerGeneration`, 1); choice(required(notice, 'status', `state.notices.${reportId}`), ['pending', 'delivery_pending', 'delivered', 'delivery_failed', 'resolved', 'superseded'], `state.notices.${reportId}.status`); integer(required(notice, 'createdAt', `state.notices.${reportId}`), `state.notices.${reportId}.createdAt`); if (Object.hasOwn(notice, 'deliveredAt')) integer(notice.deliveredAt, `state.notices.${reportId}.deliveredAt`); if (Object.hasOwn(notice, 'error')) text(notice.error, `state.notices.${reportId}.error`, 2000); }
  return state;
}

/** @param {unknown} value @param {string} [label] @returns {asserts value is ReportPayload} */
function assertReportPayload(value, label = 'report payload') {
  const payload = object(value, label); keys(payload, ['taskId', 'stepId', 'kind', 'summary', 'question', 'decisions', 'changedFiles', 'checks', 'stepComplete'], label);
  id(required(payload, 'taskId', label), `${label}.taskId`); id(required(payload, 'stepId', label), `${label}.stepId`); const kind = choice(required(payload, 'kind', label), ['question', 'checkpoint', 'blocked', 'final_review'], `${label}.kind`);
  const summary = text(required(payload, 'summary', label), `${label}.summary`, 8000); invariant(summary.length >= 1, `${label}.summary must not be empty`);
  if (Object.hasOwn(payload, 'question')) { const question = text(payload.question, `${label}.question`, 4000); invariant(question.length >= 1, `${label}.question must not be empty`); }
  for (const key of ['decisions', 'changedFiles']) if (Object.hasOwn(payload, key)) { const entries = array(payload[key], `${label}.${key}`); const maximum = key === 'decisions' ? 24 : 200; invariant(entries.length <= maximum, `${label}.${key} is too large`); entries.forEach((entry, index) => { const item = text(entry, `${label}.${key}[${index}]`, key === 'decisions' ? 2000 : 1024); invariant(item.length >= 1, `${label}.${key}[${index}] must not be empty`); }); }
  if (Object.hasOwn(payload, 'checks')) { const checks = array(payload.checks, `${label}.checks`); invariant(checks.length <= 32, `${label}.checks is too large`); checks.forEach((entry, index) => { const checkLabel = `${label}.checks[${index}]`, check = object(entry, checkLabel); keys(check, ['name', 'result', 'detail'], checkLabel); const name = text(required(check, 'name', checkLabel), `${checkLabel}.name`, 200); invariant(name.length >= 1, `${checkLabel}.name must not be empty`); choice(required(check, 'result', checkLabel), ['pass', 'fail', 'not_run'], `${checkLabel}.result`); if (Object.hasOwn(check, 'detail')) { const detail = text(check.detail, `${checkLabel}.detail`, 2000); invariant(detail.length >= 1, `${checkLabel}.detail must not be empty`); } }); }
  if (Object.hasOwn(payload, 'stepComplete')) bool(payload.stepComplete, `${label}.stepComplete`);
  if (kind === 'question') invariant(typeof payload.question === 'string' && payload.question.trim().length > 0, 'question reports need a question');

}

/** @param {unknown} value @param {string} [label] @returns {ReportPayload} */
export function validateReportPayload(value, label = 'report payload') { assertReportPayload(value, label); return value; }

/** @param {unknown} value @param {string} [label] @returns {asserts value is ReportEnvelope} */
function assertReportEnvelope(value, label = 'report') {
  const report = object(value, label); keys(report, REPORT_KEYS, label);
  integer(required(report, 'version', label), `${label}.version`, WIRE_VERSION, WIRE_VERSION); for (const key of ['reportId', 'workerId', 'attemptId']) id(required(report, key, label), `${label}.${key}`); token(required(report, 'leaseId', label), `${label}.leaseId`);
  for (const key of ['ownerSession', 'nonce', 'sessionId']) text(required(report, key, label), `${label}.${key}`, 10000); for (const key of ['ownerEpoch', 'workerGeneration', 'attemptNumber', 'planRevision']) integer(required(report, key, label), `${label}.${key}`, 1);
  const payload = validateReportPayload(required(report, 'payload', label), `${label}.payload`); const payloadHash = text(required(report, 'payloadHash', label), `${label}.payloadHash`, 64); invariant(HASH_PATTERN.test(payloadHash), `${label}.payloadHash is invalid`); invariant(payloadHash === payloadDigest(payload), `${label}.payloadHash does not match payload`); integer(required(report, 'createdAt', label), `${label}.createdAt`);

}

/** @param {unknown} value @param {string} [label] @returns {ReportEnvelope} */
export function validateReportEnvelope(value, label = 'report') { assertReportEnvelope(value, label); return value; }

/** @param {unknown} value @param {string} label @returns {asserts value is FinalizedReport} */
function assertFinalizedReport(value, label) {
  const report = object(value, label); keys(report, [...REPORT_KEYS, 'checkpoint', 'snapshotRef', 'inspectedAt'], label);
  const envelope = Object.fromEntries(REPORT_KEYS.map(key => [key, required(report, key, label)])); validateReportEnvelope(envelope, label);
  const checkpoint = object(required(report, 'checkpoint', label), `${label}.checkpoint`); keys(checkpoint, ['path', 'checkpointHash', 'changed', 'verification', 'patchTruncated'], `${label}.checkpoint`);
  text(required(checkpoint, 'path', `${label}.checkpoint`), `${label}.checkpoint.path`, 10000); invariant(HASH_PATTERN.test(text(required(checkpoint, 'checkpointHash', `${label}.checkpoint`), `${label}.checkpoint.checkpointHash`, 64)), `${label}.checkpoint.checkpointHash is invalid`);
  const changed = array(required(checkpoint, 'changed', `${label}.checkpoint`), `${label}.checkpoint.changed`); changed.forEach((entry, index) => { const item = text(entry, `${label}.checkpoint.changed[${index}]`, 10000); invariant(item.length >= 1, `${label}.checkpoint.changed[${index}] must not be empty`); });
  const verification = array(required(checkpoint, 'verification', `${label}.checkpoint`), `${label}.checkpoint.verification`); invariant(verification.length <= 12, `${label}.checkpoint.verification is too large`); verification.forEach((entry, index) => { const checkLabel = `${label}.checkpoint.verification[${index}]`, check = object(entry, checkLabel); keys(check, ['name', 'source', 'passed', 'code', 'timedOut', 'output', 'artifact'], checkLabel); text(required(check, 'name', checkLabel), `${checkLabel}.name`, 1000); invariant(required(check, 'source', checkLabel) === 'controller-configured', `${checkLabel}.source is invalid`); bool(required(check, 'passed', checkLabel), `${checkLabel}.passed`); const code = required(check, 'code', checkLabel); invariant(code === null || (typeof code === 'number' && Number.isSafeInteger(code) && code >= 0), `${checkLabel}.code must be a nonnegative safe integer or null`); bool(required(check, 'timedOut', checkLabel), `${checkLabel}.timedOut`); text(required(check, 'output', checkLabel), `${checkLabel}.output`, 6000); text(required(check, 'artifact', checkLabel), `${checkLabel}.artifact`, 10000); });
  bool(required(checkpoint, 'patchTruncated', `${label}.checkpoint`), `${label}.checkpoint.patchTruncated`); text(required(report, 'snapshotRef', label), `${label}.snapshotRef`, 10000); if (Object.hasOwn(report, 'inspectedAt')) integer(report.inspectedAt, `${label}.inspectedAt`);

}

/** @param {unknown} value @param {string} label @returns {FinalizedReport} */
function validateFinalizedReport(value, label) { assertFinalizedReport(value, label); return value; }

/** @param {unknown} value @param {ExpectedIdentity} [expected] @returns {asserts value is Authority} */
function assertAuthority(value, expected = {}) {
  const authority = object(value, 'authority'); keys(authority, ['version', 'ownerSession', 'ownerEpoch', 'workerId', 'workerGeneration', 'phase', 'leaseId', 'attemptId', 'readOnly', 'model', 'repoRoot', 'task', 'updatedAt'], 'authority');
  integer(required(authority, 'version', 'authority'), 'authority.version', WIRE_VERSION, WIRE_VERSION); const ownerSession = text(required(authority, 'ownerSession', 'authority'), 'authority.ownerSession', 10000); const ownerEpoch = integer(required(authority, 'ownerEpoch', 'authority'), 'authority.ownerEpoch', 1); const workerId = id(required(authority, 'workerId', 'authority'), 'authority.workerId'); const phase = choice(required(authority, 'phase', 'authority'), AUTHORITY_PHASES, 'authority.phase'); const workerGeneration = integer(required(authority, 'workerGeneration', 'authority'), 'authority.workerGeneration', phase === 'stopped' ? 0 : 1);
  if (expected.ownerSession !== undefined) invariant(ownerSession === expected.ownerSession, 'Pair authority owner session mismatch'); if (expected.ownerEpoch !== undefined) invariant(ownerEpoch === expected.ownerEpoch, 'Pair authority owner epoch mismatch'); if (expected.workerId !== undefined) invariant(workerId === expected.workerId, 'Pair authority worker mismatch'); if (expected.workerGeneration !== undefined) invariant(workerGeneration === expected.workerGeneration, 'Pair authority worker generation mismatch');
  token(required(authority, 'leaseId', 'authority'), 'authority.leaseId'); const attemptId = required(authority, 'attemptId', 'authority'); invariant(attemptId === null || typeof attemptId === 'string', 'authority.attemptId must be null or an ID'); if (typeof attemptId === 'string') id(attemptId, 'authority.attemptId'); bool(required(authority, 'readOnly', 'authority'), 'authority.readOnly');
  const model = object(required(authority, 'model', 'authority'), 'authority.model'); keys(model, ['provider', 'id'], 'authority.model'); text(required(model, 'provider', 'authority.model'), 'authority.model.provider', 999); text(required(model, 'id', 'authority.model'), 'authority.model.id', 999); text(required(authority, 'repoRoot', 'authority'), 'authority.repoRoot', 10000); integer(required(authority, 'updatedAt', 'authority'), 'authority.updatedAt');
  const taskValue = required(authority, 'task', 'authority');
  if (taskValue !== null) {
    const task = object(taskValue, 'authority.task'); keys(task, ['id', 'objective', 'planRevision', 'attemptId', 'attemptNumber', 'constraints', 'steps', 'stepIndex', 'policy', 'limits', 'lastDecision'], 'authority.task');
    id(required(task, 'id', 'authority.task'), 'authority.task.id'); text(required(task, 'objective', 'authority.task'), 'authority.task.objective', 6000); integer(required(task, 'planRevision', 'authority.task'), 'authority.task.planRevision', 1); const taskAttempt = id(required(task, 'attemptId', 'authority.task'), 'authority.task.attemptId'); invariant(attemptId === taskAttempt, 'authority attempt identity mismatch'); integer(required(task, 'attemptNumber', 'authority.task'), 'authority.task.attemptNumber', 1);
    array(required(task, 'constraints', 'authority.task'), 'authority.task.constraints').forEach((entry, index) => text(entry, `authority.task.constraints[${index}]`, 2000)); const steps = array(required(task, 'steps', 'authority.task'), 'authority.task.steps'); invariant(steps.length >= 1 && steps.length <= 32, 'authority.task.steps must contain 1–32 steps'); steps.forEach((entry, index) => validateStep(entry, `authority.task.steps[${index}]`)); integer(required(task, 'stepIndex', 'authority.task'), 'authority.task.stepIndex', 0, steps.length - 1);
    const complete = phase === 'running'; validateTaskPolicy(required(task, 'policy', 'authority.task'), 'authority.task.policy', { legacy: !complete }); validateTaskLimits(required(task, 'limits', 'authority.task'), 'authority.task.limits', { legacy: !complete }); validateLastDecision(required(task, 'lastDecision', 'authority.task'), 'authority.task.lastDecision');
  } else invariant(phase !== 'running', 'Running authority requires a task');

}

/** @param {unknown} value @param {ExpectedIdentity} [expected] @returns {Authority} */
export function validateAuthority(value, expected = {}) { assertAuthority(value, expected); return value; }

/** @param {unknown} value @returns {asserts value is Latch} */
function assertLatch(value) {
  const latch = object(value, 'latch'); keys(latch, ['ownerEpoch', 'workerGeneration', 'leaseId', 'attemptId', 'report'], 'latch');
  const ownerEpoch = integer(required(latch, 'ownerEpoch', 'latch'), 'latch.ownerEpoch', 1); const workerGeneration = integer(required(latch, 'workerGeneration', 'latch'), 'latch.workerGeneration', 1); const leaseId = token(required(latch, 'leaseId', 'latch'), 'latch.leaseId'); const attemptId = id(required(latch, 'attemptId', 'latch'), 'latch.attemptId'); const report = validateReportEnvelope(required(latch, 'report', 'latch'), 'latch.report');
  invariant(report.ownerEpoch === ownerEpoch && report.workerGeneration === workerGeneration && report.leaseId === leaseId && report.attemptId === attemptId, 'Latch/report identity mismatch');

}

/** @param {unknown} value @returns {Latch} */
export function validateLatch(value) { assertLatch(value); return value; }

/** @param {unknown} value @param {string} label @returns {number} */
export function incrementCounter(value, label) { const current = integer(value, label); invariant(current < Number.MAX_SAFE_INTEGER, `${label} is exhausted`); return current + 1; }

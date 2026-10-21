import { createHash } from 'node:crypto';
import path from 'node:path';
import { types as nodeTypes } from 'node:util';
import { validateUsageObservation, validateUsageTotals } from './observations.js';

/** @typedef {import('./observations.js').UsageObservation} UsageObservation */
/** @typedef {import('./observations.js').UsageTotals} UsageTotals */

export const STATE_VERSION = 1;
export const WIRE_VERSION = 1;
/** Longest stored task note (interruption, cancel reason) or worker error; writers clip to it. */
export const TASK_NOTE_LIMIT = 10000;

const RESERVED_IDS = new Set(['prototype', ...Object.getOwnPropertyNames(Object.prototype)]);
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const POLICY_KEYS = ['mode', 'finalReview', 'maxRevisions', 'maxRevisionsPerStep', 'summaryDetail', 'maxStepFiles', 'enforceStepScope'];
const LIMIT_KEYS = ['maxTurnsPerStep', 'taskTimeoutMs', 'activeStepTimeoutMs', 'maxQueuedTasks', 'maxQueuedReviews', 'maxReportsPerTask', 'maxReportBytes', 'maxAutomaticReportRepairs', 'maxAutomaticRecoveryAttempts', 'maxReportedCostUsd', 'maxOutputTokens'];
const LIMIT_BOUNDS = Object.freeze({ maxReportsPerTask: [1, 1000], maxReportBytes: [1, 1048576], maxAutomaticReportRepairs: [0, 20] });
const DEPRECATED_LIMIT_BOUNDS = Object.freeze({ maxQueuedTasks: [0, 128], maxQueuedReviews: [0, 128], maxAutomaticRecoveryAttempts: [0, 20] });
const TASK_STATUSES = ['activating', 'running', 'awaiting_settle', 'question', 'blocked', 'review', 'paused', 'interrupted', 'completed', 'cancelled'];
const WORKER_STATUSES = ['stopped', 'starting', 'ready', 'working', 'settling', 'question', 'blocked', 'review', 'paused', 'attention', 'error', 'running', 'awaiting_settle', 'interrupted'];
const AUTHORITY_PHASES = ['idle', 'running', 'waiting', 'paused', 'stopped'];
const REPORT_KEYS = ['version', 'reportId', 'workerId', 'ownerSession', 'ownerEpoch', 'workerGeneration', 'nonce', 'sessionId', 'leaseId', 'attemptId', 'attemptNumber', 'planRevision', 'payload', 'payloadHash', 'createdAt'];

/** @typedef {Record<string, unknown>} JSONObject */
/** @typedef {{ownerSession?: string, ownerEpoch?: number, workerId?: string, workerGeneration?: number}} ExpectedIdentity */

/** @typedef {'final-only' | 'milestones' | 'every-step'} ReviewMode */
/** @typedef {'minimal' | 'normal' | 'detailed'} SummaryDetail */
/** @typedef {{mode: ReviewMode, finalReview: true, maxRevisions: number, maxRevisionsPerStep: number, summaryDetail: SummaryDetail, maxStepFiles?: number, enforceStepScope?: boolean}} TaskPolicy */
/** @typedef {{mode: ReviewMode | 'final' | 'strict', finalReview: true, maxRevisions: number, maxRevisionsPerStep?: number, summaryDetail: SummaryDetail, enforceStepScope?: boolean}} LegacyTaskPolicy */
/** @typedef {{maxTurnsPerStep?: number, taskTimeoutMs?: number}} DeprecatedTurnTaskLimits */
/** @typedef {{maxReportedCostUsd: number | null, maxOutputTokens: number | null}} BaseTaskLimits */
/** @typedef {{activeStepTimeoutMs: number, maxQueuedTasks: number, maxQueuedReviews: number, maxReportsPerTask: number, maxReportBytes: number, maxAutomaticReportRepairs: number, maxAutomaticRecoveryAttempts: number}} DeferredTaskLimits */
/** @typedef {BaseTaskLimits & DeprecatedTurnTaskLimits & {activeStepTimeoutMs: number, maxReportsPerTask: number, maxReportBytes: number, maxAutomaticReportRepairs: number, maxQueuedTasks?: number, maxQueuedReviews?: number, maxAutomaticRecoveryAttempts?: number}} CurrentTaskLimits */
/** @typedef {BaseTaskLimits & DeprecatedTurnTaskLimits & DeferredTaskLimits} TaskLimits */
/** @typedef {BaseTaskLimits & DeprecatedTurnTaskLimits & Partial<DeferredTaskLimits>} LegacyTaskLimits */
/** @typedef {{id: string, title: string, instructions: string, acceptance?: string[], scope?: string[], effort?: string}} Step */
/** @typedef {'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'} Effort */
/** @type {readonly Effort[]} */
export const EFFORT_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
/**
 * One worker's configuration. `backend`, `lowCommand` and `lowArgs` are optional so a config file written before a
 * worker could choose its backend still loads; `undefined` means "use runtime.*", which is resolved by
 * `workerBackend()`. They live in the spec because that is what the controller hashes per worker: changing them
 * stages a restart for that worker, and only for that worker.
 * @typedef {{id: string, provider: string, model: string, effort: Effort, cwd: string | null, readOnly: boolean, backend?: WorkerBackend, lowCommand?: string, lowArgs?: string[], fallbacks?: WorkerFallback[]}} WorkerSpec
 */
/**
 * A provider/model the worker switches to when its own keeps failing (a quota stop, or control.fallbackAfterWaits
 * transient waits). Effort and backend default to the worker's own.
 * @typedef {{provider: string, model: string, effort?: Effort, backend?: WorkerBackend}} WorkerFallback
 */
/** At most this many fallbacks per worker: each one is a restart, and a long chain only delays escalation. */
export const MAX_WORKER_FALLBACKS = 4;
/** @typedef {'pi' | 'low'} WorkerBackend */
/** @typedef {{name: string, command: string, args: string[]}} VerificationCommand */
/** @typedef {{commands: VerificationCommand[], requirePassing: boolean, timeoutMs: number}} VerificationPolicy */
/** @typedef {'answer' | 'approve' | 'revise' | 'fixed' | 'repair'} ContinuationAction */
/** @typedef {'pending' | 'accepted' | 'not_required' | 'not_sent_budget'} DecisionDelivery */
/** @typedef {{hash: string, action: 'cancel', at: number}} CancelDecision */
/** @typedef {{hash: string, feedback: string, ownerEpoch: number, workerGeneration: number, attemptId: string, deliveryOperationId: string, at: number, reviewerModel: string | null, delivery: DecisionDelivery}} ContinuationDecisionFields */
/** @typedef {{action: 'approve', checkpointHash: string} | {action: 'answer' | 'revise' | 'fixed' | 'repair', checkpointHash: string | null}} DecisionCheckpoint */
/** @typedef {ContinuationDecisionFields & DecisionCheckpoint} ContinuationDecision */
/** @typedef {CancelDecision | ContinuationDecision} StoredDecision */
/** @typedef {{action: ContinuationAction, feedback: string, reportId: string}} LastDecision */
/** @typedef {{name: string, result: 'pass' | 'fail' | 'not_run', detail?: string}} ReportedCheck */
/** @typedef {{criterion: string, met: boolean, evidence?: string}} AcceptanceClaim */
/** @typedef {{taskId: string, stepId: string, summary: string, decisions?: string[], changedFiles?: string[], checks?: ReportedCheck[], acceptance?: AcceptanceClaim[], stepComplete?: boolean}} ReportBody */
/** @typedef {ReportBody & ({kind: 'question', question: string} | {kind: 'checkpoint' | 'blocked' | 'final_review', question?: string})} ReportPayload */
/** @typedef {{version: 1, reportId: string, workerId: string, ownerSession: string, ownerEpoch: number, workerGeneration: number, nonce: string, sessionId: string, leaseId: string, attemptId: string, attemptNumber: number, planRevision: number, payload: ReportPayload, payloadHash: string, createdAt: number}} ReportEnvelope */
/** @typedef {{name: string, source: 'controller-configured', passed: boolean, code: number | null, timedOut: boolean, output: string, artifact: string}} VerificationResult */
/** @typedef {{path: string, checkpointHash: string, changed: string[], verification: VerificationResult[], patchTruncated: boolean}} Checkpoint */
/** @typedef {ReportEnvelope & {checkpoint: Checkpoint, snapshotRef: string, inspectedAt?: number, snapshot?: import('./evidence.js').Snapshot}} FinalizedReport */
/** @typedef {{id: string, objective: string, planRevision: number, attemptId: string, attemptNumber: number, constraints: string[], steps: Step[], stepIndex: number, policy: LegacyTaskPolicy, limits: LegacyTaskLimits, lastDecision: LastDecision | null}} AuthorityTask */
/** @typedef {'idle' | 'running' | 'waiting' | 'paused' | 'stopped'} AuthorityPhase */
/** @typedef {{version: 1, ownerSession: string, ownerEpoch: number, workerId: string, workerGeneration: number, phase: AuthorityPhase, leaseId: string, attemptId: string | null, readOnly: boolean, model: {provider: string, id: string}, repoRoot: string, task: AuthorityTask | null, updatedAt: number, cacheWarming?: 'off' | 'active', enforceStepScope?: boolean, shellGuard?: {blockedCommands: string[], defaultShellTimeoutS: number}}} Authority */  // cacheWarming: legacy key, accepted and ignored
/** @typedef {{ownerEpoch: number, workerGeneration: number, leaseId: string, attemptId: string, report: ReportEnvelope}} Latch */

/** @typedef {'activating' | 'running' | 'awaiting_settle' | 'question' | 'blocked' | 'review' | 'paused' | 'interrupted' | 'completed' | 'cancelled'} TaskStatus */
/** @typedef {'stopped' | 'starting' | 'ready' | 'working' | 'settling' | 'question' | 'blocked' | 'review' | 'paused' | 'attention' | 'error' | 'running' | 'awaiting_settle' | 'interrupted'} WorkerStatus */
/** @typedef {{hash: string, taskId: string, workerId: string, acceptedAt: number, status: string}} StoredRequestV1 */
/** @typedef {{reportId: string, workerId: string, taskId: string, status: 'pending' | 'delivery_pending' | 'offered' | 'delivered' | 'delivery_failed' | 'resolved' | 'superseded', createdAt: number, deliveredAt?: number, offeredAt?: number, channel?: 'tool-result' | 'boundary' | 'manual' | 'auto' | 'prompt', observedAt?: number, observedBranch?: number, autoAttempts?: number, error?: string, ownerEpoch: number, workerGeneration: number, attemptId: string, deliveryOperationId: string}} StoredNoticeV1 */
/** @typedef {{status: 'open' | 'yielded', since: number, ownerSession: string, ownerEpoch: number, revision?: number, runToken?: string | null, armed?: boolean, activity?: number}} StoredMainPhaseV1 */
/** @typedef {{id: string, status: string, file: string}} StoredHistoryV1 */
/** @typedef {{direction: 'main→worker' | 'worker→main', kind: string, at: number}} StoredExchangeV1 */
/** @typedef {{reportId: string, reason: string, at: number}} StoredStaleReportV1 */
/** @typedef {Record<string, unknown> & {tokens: number | null, contextWindow: number, percent: number | null}} StoredContextUsage */
/** @typedef {{provider: string, id: string}} StoredModel */
/** @typedef {{toolCallId: string, toolName: string, pid: number | null, detectedAt: number}} StoredDetachedEffectV1 */
/** @typedef {{tokens: number, seconds: number}} StoredSpeedV1 */
/** @typedef {{version: 1, nonce: string, workerId: string, pid: number, sessionId: string, context: StoredContextUsage | null, currentTool: string | null, lastUsage: UsageObservation | null, compacting: boolean, detachedEffect: StoredDetachedEffectV1 | null, phase: AuthorityPhase, model: StoredModel | null, at: number}} HistoricalTelemetryV1 */
/** @typedef {HistoricalTelemetryV1 & {ownerSession: string, ownerEpoch: number, workerGeneration: number, warming?: unknown, speed?: StoredSpeedV1 | null, currentTarget?: string | null}} StoredTelemetryV1 */
/** @typedef {{agentDir: string, piCompaction: unknown, cacheWarming: unknown, fabricCompaction: unknown, fabricShellHangMs: number | null, fabricAgentMaxDepth: number | null, prewalkDisabled: boolean, prewalkAutoArm?: boolean, prewalkConfigured: boolean, note: string}} StoredNativeSettings */
/** @typedef {{protocol: 1, pairVersion: string, pid: number, cwd: string, trusted: boolean, sessionId: string, sessionFile?: string, model: (StoredModel & {contextWindow: number}) | null, thinkingLevel: Effort | 'max' | null, capabilities: {fabric: boolean, fovea: boolean, pairReport: boolean}, versions: {fabric?: unknown, fovea?: unknown}, sourcePaths: string[], context: StoredContextUsage | null, native: StoredNativeSettings, checkedAt: number, scope: string, nonce: string, workerId: string, ownerSession: string}} HistoricalProbeV1 */
/** @typedef {HistoricalProbeV1 & {ownerEpoch: number, workerGeneration: number, meshRoot?: string}} StoredProbeV1 */
/** @typedef {{mode: ReviewMode | 'final' | 'strict', finalReview: true, maxRevisions: number, summaryDetail: SummaryDetail}} PreDeferredPolicyV1 */
/** @typedef {PreDeferredPolicyV1 & {maxRevisionsPerStep: number}} StoredPolicyV1 */
/** @typedef {{id: string, requestId: string, objective: string, context: string, constraints: string[], steps: Step[], stepIndex: number, planRevision: number, status: TaskStatus, leaseId: string, verification: VerificationPolicy, startedAt: number, updatedAt: number, revisions: number, turns: number, usage: UsageTotals | null, baseSnapshotRef: string, lastDecision: LastDecision | null, dispatchSettleSequence?: number, pendingSince?: number, abortRequested?: boolean, interruption?: string, previousStatus?: string, completedAt?: number, cancelReason?: string, stepRevisions?: number, pausedBy?: 'human', mainRecoveries?: number, timeline?: import('./timeline.js').TimelineEntry[], mainFix?: {reportId: string, startedAt: number}, stepReplans?: {index: number, count: number}, changeKind?: 'main-fix', stepSteers?: {index: number, count: number}, watchdog?: {step: number, recoveries: number, noReportNudges: number, steers: number, nudged: boolean, nudgedAttemptId?: string, pingedAt?: number, providerWaits: number, retryAt: number | null, retryReason: string | null}}} StoredTaskFieldsV1 */
/** @typedef {StoredTaskFieldsV1 & {workerId: string, attemptId: string, attemptNumber: number, pendingReport: ReportEnvelope | null, report: FinalizedReport | null, decisions: Record<string, StoredDecision>} & ({policy: StoredPolicyV1, limits: TaskLimits} | {policy: PreDeferredPolicyV1, limits: BaseTaskLimits})} StoredTaskV1 */
/** @typedef {{id: string, cwd: string, repoRoot: string, status: WorkerStatus, sessionId: string | null, sessionFile: string | null, bound: WorkerSpec, history: StoredHistoryV1[], usage: UsageTotals | null, error?: string | null, diagnosticFile?: string, lastObservation?: StoredTelemetryV1 | HistoricalTelemetryV1 | null, lastExchange?: StoredExchangeV1 | null, staleReports?: StoredStaleReportV1[], probe?: StoredProbeV1 | HistoricalProbeV1 | null, pid?: number, spawnedAt?: number, freshSession?: boolean, fallback?: StoredFallbackV1}} StoredWorkerFieldsV1 */
/**
 * The fallback a worker runs on for the rest of its current task: which entry of its configured fallbacks, why, the
 * primary spec it replaced (so a settings change mid-task is still noticed), and the primary conversation a switch to
 * the other backend set aside, restored with the primary at the next task.
 * @typedef {{index: number, reason: string, at: number, primary: WorkerSpec, primarySession: {sessionId: string | null, sessionFile: string | null} | null}} StoredFallbackV1
 */
/** @typedef {StoredWorkerFieldsV1 & {workerGeneration: number, task: StoredTaskV1 | null}} StoredWorkerV1 */
/** @typedef {{version: 1, ownerSession: string, ownerEpoch: number, cwd: string, workers: Record<string, StoredWorkerV1>, requests: Record<string, StoredRequestV1>, notices: Record<string, StoredNoticeV1>, mainPhase?: StoredMainPhaseV1, branch?: number}} StoredStateV1 */
/** @typedef {'invalid-field' | 'missing-required-field' | 'mixed-identity' | 'partial-policy-layout' | 'hash-mismatch' | 'inconsistent-reference' | 'unsupported-version' | 'unsupported-shape' | 'unsupported-policy'} StoredIssueCode */
/** @typedef {{code: StoredIssueCode, path: string, message: string}} StoredIssue */
/** @typedef {{unsupported: StoredIssue[]}} ProfileFacts */

class StoredValidationError extends Error {
  /** @param {StoredIssueCode} code @param {string} path @param {string} message @param {'corrupt' | 'unsupported'} [category] */
  constructor(code, path, message, category = 'corrupt') {
    super(message); this.name = 'StoredValidationError'; this.code = code; this.path = path; this.category = category;
  }
}
/**
 * @param {unknown} condition
 * @param {string} message
 * @param {string} [path]
 * @param {StoredIssueCode} [code]
 * @returns {asserts condition}
 */
function invariant(condition, message, path = 'state', code = 'invalid-field') {
  if (!condition) throw new StoredValidationError(code, path, message);
}
/** @param {unknown} value @returns {string} */
function payloadDigest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
/** @param {unknown} value @param {string} path */
function assertInertJSON(value, path) {
  /** @type {{value: unknown, path: string, leave?: object}[]} */
  const stack = [{ value, path }];
  /** @type {WeakSet<object>} */
  const ancestors = new WeakSet();
  while (stack.length) {
    const frame = stack.pop(); if (!frame) break;
    if (frame.leave) { ancestors.delete(frame.leave); continue; }
    const entry = frame.value, at = frame.path;
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') continue;
    if (typeof entry === 'number') { invariant(Number.isFinite(entry), `${at} must be finite JSON`, at); continue; }
    invariant(typeof entry === 'object', `${at} must be JSON data`, at);
    invariant(!nodeTypes.isProxy(entry), `${at} must not be a proxy`, at);
    const isArray = Array.isArray(entry), proto = Object.getPrototypeOf(entry);
    invariant(isArray ? proto === Array.prototype : proto === Object.prototype || proto === null, `${at} has an unsupported prototype`, at);
    invariant(!ancestors.has(entry), `${at} contains a cycle`, at);
    ancestors.add(entry); stack.push({ value: null, path: at, leave: entry });
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    if (isArray) {
      for (let index = 0; index < entry.length; index++) invariant(Object.hasOwn(descriptors, index), `${at}[${index}] must be present`, `${at}[${index}]`);
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      invariant(typeof key === 'string', `${at} contains a symbol field`, at);
      if (isArray && key === 'length') continue;
      const child = isArray ? `${at}[${key}]` : `${at}.${key}`, descriptor = descriptors[key];
      invariant(descriptor !== undefined && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, `${child} must be an enumerable data field`, child);
      invariant(!isArray || /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < entry.length, `${child} is not a JSON array element`, child);
      stack.push({ value: descriptor.value, path: child });
    }
  }
}
/** @param {unknown} value @param {string} label @returns {asserts value is JSONObject} */
function assertObject(value, label) { invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`, label); }
/** @param {unknown} value @param {string} label @returns {JSONObject} */
function object(value, label) { assertObject(value, label); return value; }
/** @param {unknown} value @param {string} label @returns {unknown[]} */
function array(value, label) {
  invariant(Array.isArray(value), `${label} must be an array`, label);
  for (let index = 0; index < value.length; index++) invariant(Object.hasOwn(value, index), `${label}[${index}] must be present`, `${label}[${index}]`);
  return value;
}
/** @param {unknown} value @param {string} label @param {number} [maxLength] @returns {string} */
function text(value, label, maxLength = 24000) { invariant(typeof value === 'string' && value.length <= maxLength, `${label} must be a string of at most ${maxLength} characters`, label); return value; }
/** @param {unknown} value @param {string} label @param {number} [minimum] @param {number} [maximum] @returns {number} */
function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) { invariant(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum, `${label} must be a safe integer from ${minimum} to ${maximum}`, label); return value; }
/** @param {unknown} value @param {string} label @returns {number} */
function nonnegative(value, label) { invariant(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${label} must be finite and nonnegative`, label); return value; }
/** @param {unknown} value @param {string} label @returns {boolean} */
function bool(value, label) { invariant(typeof value === 'boolean', `${label} must be boolean`, label); return value; }
/** @template {string} T @param {unknown} value @param {readonly T[]} values @param {string} label @returns {T} */
function choice(value, values, label) {
  const match = values.find(entry => entry === value);
  invariant(typeof value === 'string' && match !== undefined, `${label} must be one of ${values.join(', ')}`, label); return match;
}
/** @param {unknown} value @param {string} label @returns {string} */
function id(value, label) { const result = text(value, label, 80); invariant(ID_PATTERN.test(result) && !RESERVED_IDS.has(result), `${label} is not a safe identifier`, label); return result; }
/** @param {unknown} value @param {string} label @returns {string} */
function token(value, label) { const result = text(value, label, 128); invariant(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(result) && !RESERVED_IDS.has(result), `${label} is not a safe token`, label); return result; }
/** @param {JSONObject} value @param {string} key @param {string} label @returns {unknown} */
function required(value, key, label) { invariant(Object.hasOwn(value, key), `${label}.${key} is required`, `${label}.${key}`, 'missing-required-field'); return value[key]; }
/** @param {JSONObject} value @param {readonly string[]} allowed @param {string} label */
function keys(value, allowed, label) {
  for (const key of Object.keys(value)) invariant(allowed.includes(key), `${label}.${key} is not allowed`, `${label}.${key}`);
  for (const key of allowed) invariant(!(key in value) || Object.hasOwn(value, key), `${label}.${key} must be an own field`, `${label}.${key}`);
}
/** @param {unknown} value @param {string} label @returns {string | null} */
function nullableText(value, label) { return value === null ? null : text(value, label, TASK_NOTE_LIMIT); }
/** @param {unknown} value @param {string} label @returns {string} */
function hash(value, label) { const result = text(value, label, 64); invariant(HASH_PATTERN.test(result), `${label} must be a SHA-256 hash`, label); return result; }
/** @param {unknown} value @param {string} label @param {number} supported */
function knownVersion(value, label, supported) {
  const version = integer(value, label);
  if (version !== supported) throw new StoredValidationError('unsupported-version', label, `${label} is not a supported version`, 'unsupported');
}
/** @param {unknown} condition @param {string} path @param {string} message */
function reference(condition, path, message) { invariant(condition, message, path, 'inconsistent-reference'); }
/** @param {unknown} value @param {string} label */
function checkDecision(value, label) {
  const decision = object(value, label), action = choice(required(decision, 'action', label), ['answer', 'approve', 'revise', 'cancel', 'fixed', 'repair'], `${label}.action`);
  const identity = ['ownerEpoch', 'workerGeneration', 'attemptId', 'deliveryOperationId'];
  keys(decision, action === 'cancel' ? ['hash', 'action', 'at'] : ['hash', 'action', 'feedback', 'checkpointHash', 'at', 'reviewerModel', 'delivery', ...identity], label);
  hash(required(decision, 'hash', label), `${label}.hash`); integer(required(decision, 'at', label), `${label}.at`);
  if (action === 'cancel') return;
  const feedback = text(required(decision, 'feedback', label), `${label}.feedback`, 12000); invariant(feedback.length > 0, `${label}.feedback must not be empty`, `${label}.feedback`);
  const checkpoint = required(decision, 'checkpointHash', label);
  // A Main fix advances the task past a report the worker is not re-submitting, so it records the
  // immutable checkpoint Pair froze for it, like an approval does.
  if (action === 'approve') hash(checkpoint, `${label}.checkpointHash`);
  else if (action === 'fixed') hash(checkpoint, `${label}.checkpointHash`);
  else if (checkpoint !== null) invariant(text(checkpoint, `${label}.checkpointHash`, 64).length > 0, `${label}.checkpointHash must not be empty`, `${label}.checkpointHash`);
  for (const key of ['ownerEpoch', 'workerGeneration']) integer(required(decision, key, label), `${label}.${key}`, 1);
  for (const key of ['attemptId', 'deliveryOperationId']) id(required(decision, key, label), `${label}.${key}`);
  const reviewerModel = required(decision, 'reviewerModel', label); if (reviewerModel !== null) text(reviewerModel, `${label}.reviewerModel`, 1000);
  choice(required(decision, 'delivery', label), ['pending', 'accepted', 'not_required', 'not_sent_budget'], `${label}.delivery`);
}
/** @param {unknown} value @param {string} label @returns {asserts value is StoredDecision} */
function assertStoredDecision(value, label) { checkDecision(value, label); }
/** @param {unknown} value @param {string} label @returns {StoredDecision} */
function validateStoredDecision(value, label) { assertStoredDecision(value, label); return value; }
/** @param {unknown} value @param {string} label @returns {asserts value is LastDecision | null} */
function assertLastDecision(value, label) {
  if (value === null) return;
  const decision = object(value, label); keys(decision, ['action', 'feedback', 'reportId'], label);
  choice(required(decision, 'action', label), ['answer', 'approve', 'revise', 'fixed', 'repair'], `${label}.action`);
  invariant(text(required(decision, 'feedback', label), `${label}.feedback`, 12000).length > 0, `${label}.feedback must not be empty`, `${label}.feedback`);
  id(required(decision, 'reportId', label), `${label}.reportId`);
}
/** @param {unknown} value @param {string} label @returns {LastDecision | null} */
function validateLastDecision(value, label) { assertLastDecision(value, label); return value; }

/** @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {asserts value is LegacyTaskPolicy} */
function assertTaskPolicy(value, label = 'task.policy', { legacy = false } = {}) {
  const policy = object(value, label); keys(policy, POLICY_KEYS, label);
  choice(required(policy, 'mode', label), legacy ? ['final', 'final-only', 'milestones', 'strict', 'every-step'] : ['final-only', 'milestones', 'every-step'], `${label}.mode`);
  invariant(required(policy, 'finalReview', label) === true, `${label}.finalReview must be true`, `${label}.finalReview`);
  integer(required(policy, 'maxRevisions', label), `${label}.maxRevisions`, 0, 20);
  if (!legacy || Object.hasOwn(policy, 'maxRevisionsPerStep')) integer(required(policy, 'maxRevisionsPerStep', label), `${label}.maxRevisionsPerStep`, 0, 20);
  choice(required(policy, 'summaryDetail', label), ['minimal', 'normal', 'detailed'], `${label}.summaryDetail`);
  if (Object.hasOwn(policy, 'maxStepFiles')) integer(policy.maxStepFiles, `${label}.maxStepFiles`, 1, 1000);
  if (Object.hasOwn(policy, 'enforceStepScope')) bool(policy.enforceStepScope, `${label}.enforceStepScope`);

}

/** @overload @param {unknown} value @param {string} [label] @param {{legacy?: false}} [options] @returns {TaskPolicy} */
/** @overload @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {LegacyTaskPolicy} */
/** @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {LegacyTaskPolicy} */
function validateTaskPolicy(value, label = 'task.policy', options = {}) { assertTaskPolicy(value, label, options); return value; }

/** @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {asserts value is LegacyTaskLimits} */
function assertTaskLimits(value, label = 'task.limits', { legacy = false } = {}) {
  const limits = object(value, label); keys(limits, LIMIT_KEYS, label);
  for (const key of ['maxTurnsPerStep', 'taskTimeoutMs']) if (Object.hasOwn(limits, key)) integer(limits[key], `${label}.${key}`, 1);
  if (!legacy || Object.hasOwn(limits, 'activeStepTimeoutMs')) integer(required(limits, 'activeStepTimeoutMs', label), `${label}.activeStepTimeoutMs`, 1);
  for (const [key, bounds] of Object.entries(LIMIT_BOUNDS)) {
    if (legacy && !Object.hasOwn(limits, key)) continue;
    integer(required(limits, key, label), `${label}.${key}`, bounds[0], bounds[1]);
  }
  for (const [key, bounds] of Object.entries(DEPRECATED_LIMIT_BOUNDS)) if (Object.hasOwn(limits, key)) integer(limits[key], `${label}.${key}`, bounds[0], bounds[1]);
  for (const key of ['maxReportedCostUsd', 'maxOutputTokens']) {
    const entry = required(limits, key, label);
    invariant(entry === null || (typeof entry === 'number' && Number.isFinite(entry) && entry > 0), `${label}.${key} must be positive or null`, `${label}.${key}`);
  }

}

/** @overload @param {unknown} value @param {string} [label] @param {{legacy?: false}} [options] @returns {TaskLimits} */
/** @overload @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {LegacyTaskLimits} */
/** @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {LegacyTaskLimits} */
export function validateTaskLimits(value, label = 'task.limits', options = {}) { assertTaskLimits(value, label, options); return value; }

/** @param {unknown} value @param {string} label @returns {asserts value is VerificationPolicy} */
function assertVerification(value, label) {
  const verification = object(value, label); keys(verification, ['commands', 'requirePassing', 'timeoutMs'], label);
  const commands = array(required(verification, 'commands', label), `${label}.commands`); invariant(commands.length <= 12, `${label}.commands is too large`, `${label}.commands`);
  for (let index = 0; index < commands.length; index++) {
    const command = object(commands[index], `${label}.commands[${index}]`); keys(command, ['name', 'command', 'args'], `${label}.commands[${index}]`);
    text(required(command, 'name', `${label}.commands[${index}]`), `${label}.commands[${index}].name`, 1000);
    text(required(command, 'command', `${label}.commands[${index}]`), `${label}.commands[${index}].command`, 10000);
    const args = array(required(command, 'args', `${label}.commands[${index}]`), `${label}.commands[${index}].args`); invariant(args.length <= 256, `${label}.commands[${index}].args is too large`, `${label}.commands[${index}].args`);
    args.forEach((entry, argIndex) => text(entry, `${label}.commands[${index}].args[${argIndex}]`, 10000));
  }
  bool(required(verification, 'requirePassing', label), `${label}.requirePassing`); integer(required(verification, 'timeoutMs', label), `${label}.timeoutMs`, 1);

}

/** @param {unknown} value @param {string} label @returns {VerificationPolicy} */
function validateVerification(value, label) { assertVerification(value, label); return value; }

/** @param {unknown} value @param {string} label @returns {asserts value is Step} */
function assertStep(value, label) {
  const step = object(value, label); keys(step, ['id', 'title', 'instructions', 'acceptance', 'scope', 'effort'], label);
  id(required(step, 'id', label), `${label}.id`); text(required(step, 'title', label), `${label}.title`, 200); text(required(step, 'instructions', label), `${label}.instructions`);
  if (Object.hasOwn(step, 'acceptance')) array(step.acceptance, `${label}.acceptance`).forEach((entry, index) => text(entry, `${label}.acceptance[${index}]`, 2000));
  // A scope says which files a step is about. It is repository-relative by construction: an absolute path or one
  // that climbs with ".." would name something the step cannot be held to, so it is refused at the door.
  if (Object.hasOwn(step, 'scope')) {
    const scope = array(step.scope, `${label}.scope`);
    invariant(scope.length <= 32, `${label}.scope holds at most 32 globs`, `${label}.scope`);
    scope.forEach((entry, index) => {
      const at = `${label}.scope[${index}]`, glob = text(entry, at, 300);
      const normalized = glob.replace(/\\/g, '/');
      invariant(!normalized.startsWith('/') && !/^[A-Za-z]:/.test(normalized) && !normalized.split('/').includes('..'),
        `${at} must be a repository-relative glob: no absolute path and no ".."`, at);
    });
  }
  // A per-step effort is one Pi already knows; the runtime refuses a level the model does not offer when it applies it.
  if (Object.hasOwn(step, 'effort')) choice(step.effort, EFFORT_LEVELS, `${label}.effort`);
}

/** @param {unknown} value @param {string} label @returns {Step} */
function validateStep(value, label) { assertStep(value, label); return value; }

/** @param {unknown} value @param {string} label @returns {asserts value is WorkerSpec} */
function assertWorkerSpec(value, label) {
  const spec = object(value, label); keys(spec, ['id', 'provider', 'model', 'effort', 'cwd', 'readOnly', 'backend', 'lowCommand', 'lowArgs', 'fallbacks'], label);
  id(required(spec, 'id', label), `${label}.id`); text(required(spec, 'provider', label), `${label}.provider`, 999); text(required(spec, 'model', label), `${label}.model`, 999);
  choice(required(spec, 'effort', label), EFFORT_LEVELS, `${label}.effort`);
  const cwd = required(spec, 'cwd', label); invariant(cwd === null || typeof cwd === 'string', `${label}.cwd must be null or a path`, `${label}.cwd`); bool(required(spec, 'readOnly', label), `${label}.readOnly`);
  // Absent means "inherit runtime.*", so a stored spec from before this existed still validates.
  if (Object.hasOwn(spec, 'backend')) choice(spec.backend, ['pi', 'low'], `${label}.backend`);
  if (Object.hasOwn(spec, 'lowCommand')) text(spec.lowCommand, `${label}.lowCommand`, 999);
  if (Object.hasOwn(spec, 'lowArgs')) array(spec.lowArgs, `${label}.lowArgs`).forEach((entry, index) => text(entry, `${label}.lowArgs[${index}]`, 999));
  if (Object.hasOwn(spec, 'fallbacks')) {
    const fallbacks = array(spec.fallbacks, `${label}.fallbacks`);
    invariant(fallbacks.length <= MAX_WORKER_FALLBACKS, `${label}.fallbacks must hold at most ${MAX_WORKER_FALLBACKS} entries`, `${label}.fallbacks`);
    fallbacks.forEach((entry, index) => assertWorkerFallback(entry, `${label}.fallbacks[${index}]`));
  }
}
/** @param {unknown} value @param {string} label @returns {asserts value is WorkerFallback} */
function assertWorkerFallback(value, label) {
  const fallback = object(value, label); keys(fallback, ['provider', 'model', 'effort', 'backend'], label);
  text(required(fallback, 'provider', label), `${label}.provider`, 999); text(required(fallback, 'model', label), `${label}.model`, 999);
  if (Object.hasOwn(fallback, 'effort')) choice(fallback.effort, EFFORT_LEVELS, `${label}.effort`);
  if (Object.hasOwn(fallback, 'backend')) choice(fallback.backend, ['pi', 'low'], `${label}.backend`);
}

/** @param {unknown} value @param {string} label @returns {WorkerSpec} */
function validateWorkerSpec(value, label) { assertWorkerSpec(value, label); return value; }

/** @returns {ProfileFacts} */
function profileFacts() { return { unsupported: [] }; }
/** @param {ProfileFacts} facts */
function rejectUnsupported(facts) {
  const issue = facts.unsupported[0];
  if (issue) throw new StoredValidationError(issue.code, issue.path, issue.message, 'unsupported');
}
/** @param {unknown} value @param {string} label @returns {boolean} */
function isLegacyTaskShape(value, label) {
  const task = object(value, label), policy = object(required(task, 'policy', label), `${label}.policy`), limits = object(required(task, 'limits', label), `${label}.limits`);
  const markers = [{ present: Object.hasOwn(policy, 'maxRevisionsPerStep'), path: `${label}.policy.maxRevisionsPerStep` },
    ...['activeStepTimeoutMs', ...Object.keys(LIMIT_BOUNDS)].map(key => ({ present: Object.hasOwn(limits, key), path: `${label}.limits.${key}` }))];
  const firstPresent = Object.hasOwn(policy, 'maxRevisionsPerStep');
  const mixed = markers.find(marker => marker.present !== firstPresent);
  invariant(!mixed, `${label} has a partial policy/limit layout`, mixed?.path || label, 'partial-policy-layout');
  return !firstPresent;
}
/** @param {JSONObject} task @param {string} label @param {ProfileFacts} facts */
function checkStoredPolicy(task, label, facts) {
  const legacy = isLegacyTaskShape(task, label), at = `${label}.policy`, policy = object(task.policy, at);
  keys(policy, POLICY_KEYS, at);
  const mode = choice(required(policy, 'mode', at), ['final', 'strict', 'final-only', 'milestones', 'every-step', 'adaptive'], `${at}.mode`);
  invariant(required(policy, 'finalReview', at) === true, `${at}.finalReview must be true`, `${at}.finalReview`);
  integer(required(policy, 'maxRevisions', at), `${at}.maxRevisions`, 0, 20);
  if (!legacy) integer(required(policy, 'maxRevisionsPerStep', at), `${at}.maxRevisionsPerStep`, 0, 20);
  choice(required(policy, 'summaryDetail', at), ['minimal', 'normal', 'detailed'], `${at}.summaryDetail`);
  if (Object.hasOwn(policy, 'maxStepFiles')) integer(policy.maxStepFiles, `${at}.maxStepFiles`, 1, 1000);
  validateTaskLimits(task.limits, `${label}.limits`, { legacy });
  if (mode === 'adaptive') facts.unsupported.push({ code: 'unsupported-policy', path: `${at}.mode`, message: 'Adaptive policy requires explicit reconciliation' });
}
/** @param {unknown} value @param {string} label */
function checkContext(value, label) {
  if (value === null) return;
  const context = object(value, label);
  const tokens = required(context, 'tokens', label), percent = required(context, 'percent', label);
  const window = nonnegative(required(context, 'contextWindow', label), `${label}.contextWindow`);
  invariant(window > 0, `${label}.contextWindow must be positive`, `${label}.contextWindow`);
  if (tokens !== null) nonnegative(tokens, `${label}.tokens`);
  if (percent !== null) nonnegative(percent, `${label}.percent`); // Context can exceed 100%.
  invariant((tokens === null) === (percent === null), `${label} has contradictory unknown context fields`, `${label}.percent`);
}
/** @param {unknown} value @param {string} label @param {boolean} probe */
function checkModel(value, label, probe) {
  if (value === null) return;
  const model = object(value, label); keys(model, probe ? ['provider', 'id', 'contextWindow'] : ['provider', 'id'], label);
  text(required(model, 'provider', label), `${label}.provider`, 999); text(required(model, 'id', label), `${label}.id`, 999);
  if (probe) nonnegative(required(model, 'contextWindow', label), `${label}.contextWindow`);
}
/** @param {unknown} value @param {string} label */
function checkDetachedEffect(value, label) {
  if (value === null) return;
  const effect = object(value, label); keys(effect, ['toolCallId', 'toolName', 'pid', 'detectedAt'], label);
  text(required(effect, 'toolCallId', label), `${label}.toolCallId`, 10000);
  text(required(effect, 'toolName', label), `${label}.toolName`, 10000);
  const pid = required(effect, 'pid', label);
  if (pid !== null) invariant(typeof pid === 'number' && Number.isInteger(pid), `${label}.pid must be an integer or null`, `${label}.pid`);
  integer(required(effect, 'detectedAt', label), `${label}.detectedAt`);
}
/** @param {JSONObject} record @param {string} label @param {'telemetry' | 'probe'} kind @returns {boolean} */
function diagnosticHistorical(record, label, kind) {
  const markers = kind === 'telemetry' ? ['ownerSession', 'ownerEpoch', 'workerGeneration'] : ['ownerEpoch', 'workerGeneration'];
  const present = markers.filter(key => Object.hasOwn(record, key));
  invariant(present.length === 0 || present.length === markers.length, `${label} has partial diagnostic identity`, label, 'mixed-identity');
  return present.length === 0;
}
/** @param {unknown} value @param {string} label */
function checkSpeed(value, label) {
  const speed = object(value, label); keys(speed, ['tokens', 'seconds'], label);
  for (const key of ['tokens', 'seconds']) invariant(typeof speed[key] === 'number' && Number.isFinite(speed[key]) && speed[key] > 0, `${label}.${key} must be a positive finite number`, `${label}.${key}`);
}
/** @param {unknown} value @param {string} label @param {string} workerId @param {string} ownerSession */
function checkTelemetry(value, label, workerId, ownerSession) {
  if (value === null) return;
  const record = object(value, label), historical = diagnosticHistorical(record, label, 'telemetry');
  keys(record, ['version', 'nonce', 'workerId', 'pid', 'sessionId', 'context', 'currentTool', 'lastUsage', 'compacting', 'detachedEffect', 'phase', 'model', 'at', ...(historical ? [] : ['ownerSession', 'ownerEpoch', 'workerGeneration', 'warming', 'speed', 'currentTarget'])], label);
  if (!historical && Object.hasOwn(record, 'speed') && record.speed !== null) checkSpeed(record.speed, `${label}.speed`);
  if (!historical && Object.hasOwn(record, 'currentTarget') && record.currentTarget !== null) text(record.currentTarget, `${label}.currentTarget`, 200);
  knownVersion(required(record, 'version', label), `${label}.version`, 1);
  text(required(record, 'nonce', label), `${label}.nonce`, 10000); text(required(record, 'sessionId', label), `${label}.sessionId`, 10000);
  reference(id(required(record, 'workerId', label), `${label}.workerId`) === workerId, `${label}.workerId`, 'Telemetry targets a different worker');
  if (!historical) {
    reference(text(required(record, 'ownerSession', label), `${label}.ownerSession`, 10000) === ownerSession, `${label}.ownerSession`, 'Telemetry belongs to a different stored owner');
    for (const key of ['ownerEpoch', 'workerGeneration']) integer(required(record, key, label), `${label}.${key}`, 1);
  }
  integer(required(record, 'pid', label), `${label}.pid`, 1); integer(required(record, 'at', label), `${label}.at`);
  checkContext(required(record, 'context', label), `${label}.context`); nullableText(required(record, 'currentTool', label), `${label}.currentTool`);
  validateUsageObservation(required(record, 'lastUsage', label), `${label}.lastUsage`);
  bool(required(record, 'compacting', label), `${label}.compacting`); checkDetachedEffect(required(record, 'detachedEffect', label), `${label}.detachedEffect`);
  choice(required(record, 'phase', label), AUTHORITY_PHASES, `${label}.phase`); checkModel(required(record, 'model', label), `${label}.model`, false);
}
/** @param {unknown} value @param {string} label @returns {asserts value is StoredTelemetryV1} */
function assertCurrentTelemetry(value, label) {
  assertInertJSON(value, label);
  const record = object(value, label), facts = profileFacts();
  invariant(['ownerSession', 'ownerEpoch', 'workerGeneration'].every(key => Object.hasOwn(record, key)), `${label} requires complete current diagnostic identity`, label, 'mixed-identity');
  const workerId = id(required(record, 'workerId', label), `${label}.workerId`);
  const ownerSession = text(required(record, 'ownerSession', label), `${label}.ownerSession`, 10000);
  checkTelemetry(value, label, workerId, ownerSession);
  for (const key of ['ownerSession', 'nonce', 'sessionId']) invariant(text(record[key], `${label}.${key}`, 10000).length > 0, `${label}.${key} must not be empty`, `${label}.${key}`);
  rejectUnsupported(facts);
}
/** @param {unknown} value @param {string} [label] @returns {StoredTelemetryV1} */
export function validateCurrentTelemetry(value, label = 'telemetry') { assertCurrentTelemetry(value, label); return value; }

/**
 * @param {unknown} value
 * @param {{maxFiles: number, maxTotalBytes: number}} limits
 * @returns {asserts value is import('./evidence.js').Snapshot}
 */
function assertSnapshot(value, limits) {
  const label = 'snapshot';
  assertInertJSON(value, label);
  const snapshot = object(value, label);
  keys(snapshot, ['root', 'head', 'entries', 'hash', 'capturedAt', 'totalBytes'], label);
  const root = text(required(snapshot, 'root', label), `${label}.root`, Number.MAX_SAFE_INTEGER);
  invariant(!root.includes('\0') && path.isAbsolute(root) && path.resolve(root) === root, 'Snapshot root must be a normalized absolute path', `${label}.root`);
  const head = required(snapshot, 'head', label);
  invariant(head === null || typeof head === 'string' && (head.length === 40 || head.length === 64) && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head), 'Snapshot HEAD must be a Git object ID or null', `${label}.head`);
  const entries = array(required(snapshot, 'entries', label), `${label}.entries`);
  const maxFiles = integer(limits.maxFiles, 'snapshot limits.maxFiles'), maxBytes = integer(limits.maxTotalBytes, 'snapshot limits.maxTotalBytes');
  invariant(entries.length <= maxFiles, 'Snapshot exceeds evidence.maxFiles', `${label}.entries`);
  /** @type {Set<string>} */
  const paths = new Set(); let total = 0;
  entries.forEach((value, index) => {
    const at = `${label}.entries[${index}]`, entry = object(value, at);
    keys(entry, ['path', 'kind', 'sha', 'size', 'executable'], at);
    const name = text(required(entry, 'path', at), `${at}.path`, Number.MAX_SAFE_INTEGER);
    invariant(name.length > 0 && !name.includes('\0') && !path.isAbsolute(name) && name.split(path.sep).every(part => part !== '' && part !== '.' && part !== '..'), 'Snapshot entry must be a relative repository path', `${at}.path`);
    reference(!paths.has(name), `${at}.path`, 'Duplicate snapshot path'); paths.add(name);
    const kind = choice(required(entry, 'kind', at), ['missing', 'file', 'symlink'], `${at}.kind`);
    const sha = required(entry, 'sha', at), size = integer(required(entry, 'size', at), `${at}.size`, 0, maxBytes);
    const executable = bool(required(entry, 'executable', at), `${at}.executable`);
    if (kind === 'missing') invariant(sha === null && size === 0 && !executable, 'Missing snapshot entries cannot carry content or mode', at);
    else { hash(sha, `${at}.sha`); if (kind === 'symlink') invariant(!executable, 'Snapshot symlink cannot carry executable mode', `${at}.executable`); }
    total += size;
    invariant(Number.isSafeInteger(total) && total <= maxBytes, 'Snapshot exceeds evidence.maxTotalBytes', `${label}.totalBytes`);
  });
  reference(integer(required(snapshot, 'totalBytes', label), `${label}.totalBytes`, 0, maxBytes) === total, `${label}.totalBytes`, 'Snapshot byte total differs from entries');
  integer(required(snapshot, 'capturedAt', label), `${label}.capturedAt`);
  invariant(hash(required(snapshot, 'hash', label), `${label}.hash`) === payloadDigest({ root, head, entries }), 'Snapshot identity hash mismatch', `${label}.hash`, 'hash-mismatch');
}
/** @param {unknown} value @param {{maxFiles: number, maxTotalBytes: number}} limits @returns {import('./evidence.js').Snapshot} */
export function validateSnapshot(value, limits) { assertSnapshot(value, limits); return value; }

/** @param {unknown} value @param {string} label */
function checkNativeSettings(value, label) {
  const native = object(value, label);
  keys(native, ['agentDir', 'piCompaction', 'cacheWarming', 'fabricCompaction', 'fabricShellHangMs', 'fabricAgentMaxDepth', 'prewalkDisabled', 'prewalkAutoArm', 'prewalkConfigured', 'note'], label);
  text(required(native, 'agentDir', label), `${label}.agentDir`, 10000); text(required(native, 'note', label), `${label}.note`, 10000);
  for (const key of ['piCompaction', 'fabricCompaction', 'cacheWarming']) required(native, key, label);
  for (const key of ['fabricShellHangMs', 'fabricAgentMaxDepth']) {
    const number = required(native, key, label); if (number !== null) integer(number, `${label}.${key}`);
  }
  bool(required(native, 'prewalkDisabled', label), `${label}.prewalkDisabled`); bool(required(native, 'prewalkConfigured', label), `${label}.prewalkConfigured`);
  if (Object.hasOwn(native, 'prewalkAutoArm')) bool(native.prewalkAutoArm, `${label}.prewalkAutoArm`); // optional: absent in probes recorded before it existed
}
/** @param {unknown} value @param {string} label @param {string} workerId @param {string} ownerSession */
function checkProbe(value, label, workerId, ownerSession) {
  if (value === null) return;
  const probe = object(value, label), historical = diagnosticHistorical(probe, label, 'probe');
  keys(probe, ['protocol', 'pairVersion', 'pid', 'cwd', 'trusted', 'sessionId', 'sessionFile', 'meshRoot', 'model', 'thinkingLevel', 'capabilities', 'versions', 'sourcePaths', 'context', 'native', 'checkedAt', 'scope', 'nonce', 'workerId', 'ownerSession', ...(historical ? [] : ['ownerEpoch', 'workerGeneration'])], label);
  knownVersion(required(probe, 'protocol', label), `${label}.protocol`, 1); integer(required(probe, 'pid', label), `${label}.pid`, 1);
  for (const key of ['pairVersion', 'cwd', 'sessionId', 'scope', 'nonce']) text(required(probe, key, label), `${label}.${key}`, 10000);
  if (Object.hasOwn(probe, 'sessionFile')) text(probe.sessionFile, `${label}.sessionFile`, 10000);
  if (Object.hasOwn(probe, 'meshRoot')) {
    const meshRoot = text(required(probe, 'meshRoot', label), `${label}.meshRoot`, 10000);
    invariant(path.isAbsolute(meshRoot), `${label}.meshRoot must be an absolute path`, `${label}.meshRoot`);
  }
  reference(id(required(probe, 'workerId', label), `${label}.workerId`) === workerId, `${label}.workerId`, 'Probe targets a different worker');
  reference(text(required(probe, 'ownerSession', label), `${label}.ownerSession`, 10000) === ownerSession, `${label}.ownerSession`, 'Probe belongs to a different stored owner');
  if (!historical) for (const key of ['ownerEpoch', 'workerGeneration']) integer(required(probe, key, label), `${label}.${key}`, 1);
  bool(required(probe, 'trusted', label), `${label}.trusted`); integer(required(probe, 'checkedAt', label), `${label}.checkedAt`);
  checkModel(required(probe, 'model', label), `${label}.model`, true);
  const thinking = required(probe, 'thinkingLevel', label); if (thinking !== null) choice(thinking, ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], `${label}.thinkingLevel`);
  const capabilities = object(required(probe, 'capabilities', label), `${label}.capabilities`); keys(capabilities, ['fabric', 'fovea', 'pairReport'], `${label}.capabilities`);
  for (const key of ['fabric', 'fovea', 'pairReport']) bool(required(capabilities, key, `${label}.capabilities`), `${label}.capabilities.${key}`);
  const versions = object(required(probe, 'versions', label), `${label}.versions`); keys(versions, ['fabric', 'fovea'], `${label}.versions`);
  array(required(probe, 'sourcePaths', label), `${label}.sourcePaths`).forEach((entry, index) => text(entry, `${label}.sourcePaths[${index}]`, 10000));
  checkContext(required(probe, 'context', label), `${label}.context`); checkNativeSettings(required(probe, 'native', label), `${label}.native`);
}
/**
 * @param {JSONObject} report
 * @param {string} label
 * @param {JSONObject} task
 * @param {string} workerId
 * @param {Set<string>} stepIds
 * @param {boolean} current
 */
function validateTaskReportIdentity(report, label, task, workerId, stepIds, current) {
  const payload = object(report.payload, `${label}.payload`);
  reference(payload.taskId === task.id, `${label}.payload.taskId`, 'Report targets a different task');
  reference(report.workerId === workerId, `${label}.workerId`, 'Report targets a different worker');
  reference(typeof payload.stepId === 'string' && stepIds.has(payload.stepId), `${label}.payload.stepId`, 'Report targets a step outside the task plan');
  if (current || report.attemptId === task.attemptId) {
    for (const key of ['attemptId', 'attemptNumber', 'planRevision', 'leaseId']) reference(report[key] === task[key], `${label}.${key}`, 'Report contradicts its task attempt');
  }
  if (!current) return; // Resolved history retains its original producer tuple.
  const steps = array(task.steps, 'task.steps'), stepIndex = integer(task.stepIndex, 'task.stepIndex', 0, steps.length - 1), step = object(steps[stepIndex], 'task.steps current');
  reference(payload.stepId === step.id, `${label}.payload.stepId`, 'Current report targets a different active step');
  const policy = object(task.policy, 'task.policy'), finalOnly = policy.mode === 'final' || policy.mode === 'final-only';
  reference(!finalOnly || payload.kind !== 'checkpoint', `${label}.payload.kind`, 'Final-only policy does not accept intermediate checkpoints');
  reference(payload.kind !== 'final_review' || finalOnly || stepIndex === steps.length - 1, `${label}.payload.kind`, 'Premature final review');
}
/**
 * The optional per-task timeline: the last few reports and decisions. It is history for the dashboard, not
 * authority, so only its shape is checked and an absent timeline stays valid.
 * @param {unknown} value @param {string} label
 */
function checkTimeline(value, label) {
  for (const [index, entry] of array(value, label).entries()) {
    const at = `${label}[${index}]`, record = object(entry, at);
    const type = choice(record.type, ['report', 'decision', 'note'], `${at}.type`);
    if (type === 'note') { text(record.kind, `${at}.kind`, 40); integer(record.step, `${at}.step`, 1); integer(record.at, `${at}.at`); text(record.text, `${at}.text`, 160); continue; }
    id(record.reportId, `${at}.reportId`);
    integer(record.step, `${at}.step`, 1); integer(record.at, `${at}.at`);
    if (type === 'report') text(record.kind, `${at}.kind`, 40), object(record.verification, `${at}.verification`);
    else text(record.action, `${at}.action`, 20), text(record.feedback, `${at}.feedback`, 1000);
  }
}
/**
 * The timeline entries that pass checkTimeline, for loading: a hand-edited or damaged entry is dropped, and a
 * timeline that is not a list starts empty, so history never stops a task from loading.
 * @param {unknown} value @param {string} label @returns {unknown[]}
 */
function keptTimeline(value, label) {
  return (Array.isArray(value) ? value : []).filter(entry => { try { checkTimeline([entry], label); return true; } catch { return false; } });
}
/** @param {unknown} value @param {string} label @param {string} workerId @param {ProfileFacts} facts */
function checkStoredTask(value, label, workerId, facts) {
  const task = object(value, label);
  keys(task, ['id', 'requestId', 'objective', 'context', 'constraints', 'steps', 'stepIndex', 'planRevision', 'status', 'leaseId', 'policy', 'limits', 'verification', 'startedAt', 'updatedAt', 'revisions', 'turns', 'usage', 'baseSnapshotRef', 'pendingReport', 'report', 'decisions', 'lastDecision', 'dispatchSettleSequence', 'pendingSince', 'abortRequested', 'interruption', 'previousStatus', 'completedAt', 'cancelReason', 'stepRevisions', 'pausedBy', 'mainRecoveries', 'timeline', 'workerId', 'attemptId', 'attemptNumber', 'mainFix', 'stepReplans', 'changeKind', 'stepSteers', 'watchdog'], label);
  for (const key of ['id', 'requestId', 'leaseId']) id(required(task, key, label), `${label}.${key}`);
  reference(id(required(task, 'workerId', label), `${label}.workerId`) === workerId, `${label}.workerId`, 'Task targets a different worker');
  id(required(task, 'attemptId', label), `${label}.attemptId`); integer(required(task, 'attemptNumber', label), `${label}.attemptNumber`, 1);
  text(required(task, 'objective', label), `${label}.objective`, 6000); text(required(task, 'context', label), `${label}.context`, 24000);
  array(required(task, 'constraints', label), `${label}.constraints`).forEach((entry, index) => text(entry, `${label}.constraints[${index}]`, 2000));
  const steps = array(required(task, 'steps', label), `${label}.steps`);
  /** @type {Set<string>} */
  const stepIds = new Set();
  invariant(steps.length >= 1 && steps.length <= 32, `${label}.steps must contain 1–32 steps`, `${label}.steps`);
  steps.forEach((entry, index) => { const at = `${label}.steps[${index}]`, step = validateStep(entry, at); reference(!stepIds.has(step.id), `${at}.id`, 'Duplicate step identity'); stepIds.add(step.id); });
  integer(required(task, 'stepIndex', label), `${label}.stepIndex`, 0, steps.length - 1); integer(required(task, 'planRevision', label), `${label}.planRevision`, 1);
  const status = choice(required(task, 'status', label), TASK_STATUSES, `${label}.status`);
  checkStoredPolicy(task, label, facts); validateVerification(required(task, 'verification', label), `${label}.verification`);
  for (const key of ['startedAt', 'updatedAt', 'revisions', 'turns']) integer(required(task, key, label), `${label}.${key}`);
  text(required(task, 'baseSnapshotRef', label), `${label}.baseSnapshotRef`, 10000); validateUsageTotals(required(task, 'usage', label), `${label}.usage`);
  const decisions = object(required(task, 'decisions', label), `${label}.decisions`);
  for (const [reportId, decision] of Object.entries(decisions)) {
    const at = `${label}.decisions.${id(reportId, `${label}.decisions key`)}`;
    validateStoredDecision(decision, at);
  }
  for (const key of ['pendingReport', 'report']) {
    const value = required(task, key, label); if (value === null) continue;
    const at = `${label}.${key}`;
    checkReport(value, at, key === 'report'); const report = object(value, at), reportId = id(report.reportId, `${at}.reportId`);
    const waiting = ['question', 'blocked', 'review'].includes(status);
    const suspended = status === 'paused' || status === 'interrupted';
    const sameAttempt = report.attemptId === task.attemptId;
    const decided = Object.hasOwn(decisions, reportId), current = key === 'pendingReport' || !decided && (waiting || suspended && sameAttempt);
    validateTaskReportIdentity(report, at, task, workerId, stepIds, current);
    if (decided) {
      const decision = object(decisions[reportId], `${label}.decisions.${reportId}`), payload = object(report.payload, `${at}.payload`);
      if (decision.action !== 'cancel') {
        reference(decision.attemptId === report.attemptId, `${label}.decisions.${reportId}.attemptId`, 'Decision targets a different retained report attempt');
        reference(decision.action !== 'answer' || payload.kind === 'question', `${label}.decisions.${reportId}.action`, 'Only a question accepts an answer');
        if (decision.action === 'approve') {
          reference(key === 'report' && (payload.kind === 'checkpoint' || payload.kind === 'final_review'), `${label}.decisions.${reportId}.action`, 'Only a finalized review accepts approval');
          const checkpoint = object(report.checkpoint, `${at}.checkpoint`);
          reference(decision.checkpointHash === checkpoint.checkpointHash, `${label}.decisions.${reportId}.checkpointHash`, 'Approval differs from the retained checkpoint');
        }
      }
    }
  }
  const last = validateLastDecision(required(task, 'lastDecision', label), `${label}.lastDecision`);
  if (last) {
    reference(Object.hasOwn(decisions, last.reportId), `${label}.lastDecision.reportId`, 'Last decision is absent from the retained decision map');
    const decision = object(decisions[last.reportId], `${label}.decisions.${last.reportId}`);
    reference(decision.action === last.action && decision.feedback === last.feedback, `${label}.lastDecision`, 'Last decision contradicts its retained decision');
  }
  for (const key of ['dispatchSettleSequence', 'pendingSince', 'completedAt', 'stepRevisions', 'mainRecoveries']) if (Object.hasOwn(task, key)) integer(task[key], `${label}.${key}`);
  // Optional and additive: a task written before the timeline existed has none. Loading drops a corrupt entry
  // first (migrateStoredState), so this check only refuses a timeline Pair itself would write wrongly.
  if (Object.hasOwn(task, 'timeline')) checkTimeline(task.timeline, `${label}.timeline`);
  if (Object.hasOwn(task, 'abortRequested')) bool(task.abortRequested, `${label}.abortRequested`);
  if (Object.hasOwn(task, 'pausedBy')) choice(task.pausedBy, ['human'], `${label}.pausedBy`);
  // A Main fix in progress: Main owns the workspace until it reports 'fixed'.
  if (Object.hasOwn(task, 'mainFix')) {
    const fix = object(task.mainFix, `${label}.mainFix`); keys(fix, ['reportId', 'startedAt'], `${label}.mainFix`);
    const fixReportId = id(required(fix, 'reportId', `${label}.mainFix`), `${label}.mainFix.reportId`);
    const retained = task.report;
    const retainedId = retained !== null && typeof retained === 'object' ? id(Reflect.get(retained, 'reportId'), `${label}.report.reportId`) : null;
    reference(fixReportId === retainedId, `${label}.mainFix.reportId`, 'A Main fix targets a different report than the retained one');
    integer(required(fix, 'startedAt', `${label}.mainFix`), `${label}.mainFix.startedAt`);
  }
  // Re-plans of the current step position, bounded by the controller.
  if (Object.hasOwn(task, 'stepReplans')) {
    const replans = object(task.stepReplans, `${label}.stepReplans`); keys(replans, ['index', 'count'], `${label}.stepReplans`);
    integer(required(replans, 'index', `${label}.stepReplans`), `${label}.stepReplans.index`, 0, steps.length - 1);
    integer(required(replans, 'count', `${label}.stepReplans`), `${label}.stepReplans.count`, 0, 2);
  }
  if (Object.hasOwn(task, 'changeKind')) choice(task.changeKind, ['main-fix'], `${label}.changeKind`);
  // The watchdog's bounded per-step bookkeeping. Absent means none yet; a record for another step is reset on use.
  if (Object.hasOwn(task, 'watchdog')) {
    const watchdog = object(task.watchdog, `${label}.watchdog`); keys(watchdog, ['step', 'recoveries', 'autoRepairs', 'repairs', 'noReportNudges', 'steers', 'nudged', 'nudgedAttemptId', 'pingedAt', 'providerWaits', 'retryAt', 'retryReason'], `${label}.watchdog`);
    if (Object.hasOwn(watchdog, 'autoRepairs')) integer(watchdog.autoRepairs, `${label}.watchdog.autoRepairs`, 0);
    // Each automatic repair records what Pair found, so the report that finally reaches Main carries the history.
    if (Object.hasOwn(watchdog, 'repairs')) {
      invariant(Array.isArray(watchdog.repairs) && watchdog.repairs.length <= 8, `${label}.watchdog.repairs must be an array of at most 8 entries`, `${label}.watchdog.repairs`);
      for (const entry of /** @type {unknown[]} */ (watchdog.repairs)) {
        const repair = object(entry, `${label}.watchdog.repairs[]`); keys(repair, ['reasons', 'at'], `${label}.watchdog.repairs[]`);
        invariant(Array.isArray(repair.reasons) && repair.reasons.length <= 8, `${label}.watchdog.repairs[].reasons must be an array of at most 8 strings`, `${label}.watchdog.repairs[].reasons`);
        for (const reason of /** @type {unknown[]} */ (repair.reasons)) text(reason, `${label}.watchdog.repairs[].reasons[]`, 200);
        integer(required(repair, 'at', `${label}.watchdog.repairs[]`), `${label}.watchdog.repairs[].at`, 0);
      }
    }
    if (Object.hasOwn(watchdog, 'nudgedAttemptId')) id(watchdog.nudgedAttemptId, `${label}.watchdog.nudgedAttemptId`);
    if (Object.hasOwn(watchdog, 'pingedAt')) integer(watchdog.pingedAt, `${label}.watchdog.pingedAt`, 0);
    integer(required(watchdog, 'step', `${label}.watchdog`), `${label}.watchdog.step`, 0);
    for (const key of ['recoveries', 'noReportNudges', 'steers', 'providerWaits']) integer(required(watchdog, key, `${label}.watchdog`), `${label}.watchdog.${key}`, 0);
    bool(required(watchdog, 'nudged', `${label}.watchdog`), `${label}.watchdog.nudged`);
    if (required(watchdog, 'retryAt', `${label}.watchdog`) !== null) integer(watchdog.retryAt, `${label}.watchdog.retryAt`, 0);
    if (required(watchdog, 'retryReason', `${label}.watchdog`) !== null) text(watchdog.retryReason, `${label}.watchdog.retryReason`, 500);
  }
  // Steers into the current step: bounded, and only for a step position the plan actually has.
  if (Object.hasOwn(task, 'stepSteers')) {
    const steers = object(task.stepSteers, `${label}.stepSteers`); keys(steers, ['index', 'count'], `${label}.stepSteers`);
    integer(required(steers, 'index', `${label}.stepSteers`), `${label}.stepSteers.index`, 0, steps.length - 1);
    integer(required(steers, 'count', `${label}.stepSteers`), `${label}.stepSteers.count`, 0, 1000);
  }
  for (const key of ['interruption', 'previousStatus', 'cancelReason']) if (Object.hasOwn(task, key)) text(task[key], `${label}.${key}`, TASK_NOTE_LIMIT);
}
/**
 * @param {unknown} value
 * @param {string} label
 * @param {string} workerId
 * @param {string} ownerSession
 * @param {ProfileFacts} facts
 */
function checkWorkerRecord(value, label, workerId, ownerSession, facts) {
  const record = object(value, label);
  keys(record, ['id', 'cwd', 'repoRoot', 'status', 'sessionId', 'sessionFile', 'bound', 'task', 'history', 'usage', 'error', 'diagnosticFile', 'lastObservation', 'lastExchange', 'staleReports', 'probe', 'pid', 'spawnedAt', 'freshSession', 'fallback', 'workerGeneration'], label);
  reference(id(required(record, 'id', label), `${label}.id`) === workerId, `${label}.id`, 'Worker identity differs from its map key');
  for (const key of ['cwd', 'repoRoot']) text(required(record, key, label), `${label}.${key}`, 10000);
  choice(required(record, 'status', label), WORKER_STATUSES, `${label}.status`);
  for (const key of ['sessionId', 'sessionFile']) nullableText(required(record, key, label), `${label}.${key}`);
  integer(required(record, 'workerGeneration', label), `${label}.workerGeneration`);
  const bound = validateWorkerSpec(required(record, 'bound', label), `${label}.bound`); reference(bound.id === workerId, `${label}.bound.id`, 'Bound identity differs from its worker');
  const task = required(record, 'task', label); if (task !== null) checkStoredTask(task, `${label}.task`, workerId, facts);
  const history = array(required(record, 'history', label), `${label}.history`); invariant(history.length <= 40, `${label}.history is too large`, `${label}.history`);
  history.forEach((entry, index) => {
    const at = `${label}.history[${index}]`, item = object(entry, at); keys(item, ['id', 'status', 'file'], at);
    id(required(item, 'id', at), `${at}.id`); text(required(item, 'status', at), `${at}.status`, 80); text(required(item, 'file', at), `${at}.file`, 10000);
  });
  validateUsageTotals(required(record, 'usage', label), `${label}.usage`);
  if (Object.hasOwn(record, 'error')) nullableText(record.error, `${label}.error`);
  if (Object.hasOwn(record, 'diagnosticFile')) text(record.diagnosticFile, `${label}.diagnosticFile`, 10000);
  // Set only while an oversized conversation has been archived and the next start must open a new session.
  if (Object.hasOwn(record, 'freshSession')) bool(record.freshSession, `${label}.freshSession`);
  if (Object.hasOwn(record, 'fallback')) {
    const at = `${label}.fallback`, fallback = object(record.fallback, at);
    keys(fallback, ['index', 'reason', 'at', 'primary', 'primarySession'], at);
    integer(required(fallback, 'index', at), `${at}.index`, 0, MAX_WORKER_FALLBACKS - 1); text(required(fallback, 'reason', at), `${at}.reason`, 1000); integer(required(fallback, 'at', at), `${at}.at`);
    const primary = validateWorkerSpec(required(fallback, 'primary', at), `${at}.primary`); reference(primary.id === workerId, `${at}.primary.id`, 'Primary identity differs from its worker');
    const session = required(fallback, 'primarySession', at);
    if (session !== null) { const kept = object(session, `${at}.primarySession`); keys(kept, ['sessionId', 'sessionFile'], `${at}.primarySession`); for (const key of ['sessionId', 'sessionFile']) nullableText(required(kept, key, `${at}.primarySession`), `${at}.primarySession.${key}`); }
  }
  if (Object.hasOwn(record, 'pid')) integer(record.pid, `${label}.pid`, 1);
  if (Object.hasOwn(record, 'spawnedAt')) integer(record.spawnedAt, `${label}.spawnedAt`);
  if (Object.hasOwn(record, 'lastObservation')) checkTelemetry(record.lastObservation, `${label}.lastObservation`, workerId, ownerSession);
  if (Object.hasOwn(record, 'probe')) checkProbe(record.probe, `${label}.probe`, workerId, ownerSession);
  if (Object.hasOwn(record, 'lastExchange') && record.lastExchange !== null) {
    const at = `${label}.lastExchange`, exchange = object(record.lastExchange, at); keys(exchange, ['direction', 'kind', 'at'], at);
    choice(required(exchange, 'direction', at), ['main→worker', 'worker→main'], `${at}.direction`); text(required(exchange, 'kind', at), `${at}.kind`, 10000); integer(required(exchange, 'at', at), `${at}.at`);
  }
  if (Object.hasOwn(record, 'staleReports')) {
    const stale = array(record.staleReports, `${label}.staleReports`); invariant(stale.length <= 20, `${label}.staleReports is too large`, `${label}.staleReports`);
    stale.forEach((entry, index) => { const at = `${label}.staleReports[${index}]`, report = object(entry, at); keys(report, ['reportId', 'reason', 'at'], at); id(required(report, 'reportId', at), `${at}.reportId`); text(required(report, 'reason', at), `${at}.reason`, 10000); integer(required(report, 'at', at), `${at}.at`); });
  }
}

/** @param {unknown} value */
export function migrateStoredState(value) {
  const state = structuredClone(object(value, 'state')); let migrated = false;
  invariant(state.version === STATE_VERSION, `Unsupported Pair state version ${String(state.version)}`);
  const workers = object(required(state, 'workers', 'state'), 'state.workers');
  for (const [workerId, workerValue] of Object.entries(workers)) {
    id(workerId, 'state.workers key'); const record = object(workerValue, `state.workers.${workerId}`);
    if (record.task !== null && record.task !== undefined) {
      const task = object(record.task, `state.workers.${workerId}.task`);
      const policy = object(required(task, 'policy', `state.workers.${workerId}.task`), `state.workers.${workerId}.task.policy`);
      if (policy.mode === 'final') { policy.mode = 'final-only'; migrated = true; }
      else if (policy.mode === 'strict') { policy.mode = 'every-step'; migrated = true; }
      else invariant(policy.mode !== 'adaptive', 'Stored adaptive task policy requires explicit human reconciliation');
      if (Object.hasOwn(task, 'timeline')) {
        const kept = keptTimeline(task.timeline, `state.workers.${workerId}.task.timeline`);
        if (!Array.isArray(task.timeline) || kept.length !== task.timeline.length) { task.timeline = kept; migrated = true; }
      }
    }
  }
  return { state, migrated };
}

/** @param {JSONObject} state @returns {boolean} */
function selectIdentityLayout(state) {
  const version = integer(required(state, 'version', 'state'), 'state.version');
  if (version !== STATE_VERSION) throw new StoredValidationError('unsupported-version', 'state.version', 'Unsupported Pair state version', 'unsupported');
  const markers = [{ present: Object.hasOwn(state, 'ownerEpoch'), path: 'state.ownerEpoch' }];
  const workers = object(required(state, 'workers', 'state'), 'state.workers');
  for (const [workerId, value] of Object.entries(workers)) {
    const label = `state.workers.${id(workerId, 'state.workers key')}`, worker = object(value, label);
    markers.push({ present: Object.hasOwn(worker, 'workerGeneration'), path: `${label}.workerGeneration` });
    const valueTask = required(worker, 'task', label);
    if (valueTask !== null) {
      const task = object(valueTask, `${label}.task`);
      for (const key of ['workerId', 'attemptId', 'attemptNumber']) markers.push({ present: Object.hasOwn(task, key), path: `${label}.task.${key}` });
    }
  }
  const rootPresent = Object.hasOwn(state, 'ownerEpoch'), mixed = markers.find(marker => marker.present !== rootPresent);
  invariant(!mixed, 'Stored state has mixed present/missing identity fields', mixed?.path || 'state', 'mixed-identity');
  return !rootPresent;
}
/** @param {unknown} value @param {string} label */
function checkRequest(value, label) {
  const request = object(value, label); keys(request, ['hash', 'taskId', 'workerId', 'acceptedAt', 'status'], label);
  hash(required(request, 'hash', label), `${label}.hash`);
  for (const key of ['taskId', 'workerId']) id(required(request, key, label), `${label}.${key}`);
  integer(required(request, 'acceptedAt', label), `${label}.acceptedAt`); text(required(request, 'status', label), `${label}.status`, 80);
}
/** @param {unknown} value @param {string} label @param {string} reportId */
function checkNotice(value, label, reportId) {
  const notice = object(value, label);
  keys(notice, ['reportId', 'workerId', 'taskId', 'status', 'createdAt', 'deliveredAt', 'error', 'offeredAt', 'channel', 'observedAt', 'observedBranch', 'autoAttempts', 'ownerEpoch', 'workerGeneration', 'attemptId', 'deliveryOperationId'], label);
  reference(id(required(notice, 'reportId', label), `${label}.reportId`) === reportId, `${label}.reportId`, 'Notice identity differs from its map key');
  for (const key of ['workerId', 'taskId', 'attemptId', 'deliveryOperationId']) id(required(notice, key, label), `${label}.${key}`);
  for (const key of ['ownerEpoch', 'workerGeneration']) integer(required(notice, key, label), `${label}.${key}`, 1);
  choice(required(notice, 'status', label), ['pending', 'delivery_pending', 'offered', 'delivered', 'delivery_failed', 'resolved', 'superseded'], `${label}.status`);
  integer(required(notice, 'createdAt', label), `${label}.createdAt`);
  if (Object.hasOwn(notice, 'deliveredAt')) integer(notice.deliveredAt, `${label}.deliveredAt`);
  if (Object.hasOwn(notice, 'error')) text(notice.error, `${label}.error`, 2000);
  if (Object.hasOwn(notice, 'offeredAt')) integer(notice.offeredAt, `${label}.offeredAt`);
  if (Object.hasOwn(notice, 'channel')) choice(notice.channel, ['tool-result', 'boundary', 'manual', 'auto', 'prompt'], `${label}.channel`);
  if (Object.hasOwn(notice, 'autoAttempts')) integer(notice.autoAttempts, `${label}.autoAttempts`, 0);
  if (Object.hasOwn(notice, 'observedAt')) integer(notice.observedAt, `${label}.observedAt`);
  if (Object.hasOwn(notice, 'observedBranch')) integer(notice.observedBranch, `${label}.observedBranch`, 0);
}
/** @param {unknown} value @param {string} label */
function checkMainPhase(value, label) {
  const phase = object(value, label);
  keys(phase, ['status', 'since', 'ownerSession', 'ownerEpoch', 'revision', 'runToken', 'armed', 'activity'], label);
  choice(required(phase, 'status', label), ['open', 'yielded'], `${label}.status`);
  integer(required(phase, 'since', label), `${label}.since`);
  text(required(phase, 'ownerSession', label), `${label}.ownerSession`, 10000);
  integer(required(phase, 'ownerEpoch', label), `${label}.ownerEpoch`, 1);
  if (Object.hasOwn(phase, 'revision')) integer(phase.revision, `${label}.revision`, 0);
  if (Object.hasOwn(phase, 'runToken') && phase.runToken !== null) text(phase.runToken, `${label}.runToken`, 200);
  if (Object.hasOwn(phase, 'armed')) bool(phase.armed, `${label}.armed`);
  if (Object.hasOwn(phase, 'activity')) integer(phase.activity, `${label}.activity`, 0);
}
/** @param {JSONObject} state */
function checkRetainedReferences(state) {
  /** @type {Map<string, {workerId: string, task?: JSONObject}>} */
  const tasks = new Map();
  /** @type {Map<string, {workerId: string, task: JSONObject, report: JSONObject}>} */
  const reports = new Map();
  /** @type {Map<string, {workerId: string, task: JSONObject, decision: JSONObject}>} */
  const decisions = new Map();
  /** @type {Set<string>} */
  const activeRequests = new Set();
  /** @type {Map<string, {requestId: string, workerId: string}>} */
  const requestTasks = new Map();
  /** @type {Map<string, {workerId: string, taskId: string, attemptNumber: number, planRevision: number, leaseId: string}>} */
  const attempts = new Map();
  /** @param {JSONObject} record @param {string} at @param {string} taskId @param {string} workerId */
  function retainAttempt(record, at, taskId, workerId) {
    const attemptId = id(record.attemptId, `${at}.attemptId`), tuple = { workerId, taskId,
      attemptNumber: integer(record.attemptNumber, `${at}.attemptNumber`, 1), planRevision: integer(record.planRevision, `${at}.planRevision`, 1), leaseId: token(record.leaseId, `${at}.leaseId`) };
    const previous = attempts.get(attemptId);
    if (previous) reference(previous.workerId === tuple.workerId && previous.taskId === tuple.taskId && previous.attemptNumber === tuple.attemptNumber && previous.planRevision === tuple.planRevision && previous.leaseId === tuple.leaseId, `${at}.attemptId`, 'Matching attempt identity contradicts a retained tuple');
    else attempts.set(attemptId, tuple);
  }
  const requests = object(state.requests, 'state.requests'), notices = object(state.notices, 'state.notices');
  const workers = object(state.workers, 'state.workers');
  for (const [workerId, value] of Object.entries(workers)) {
    const label = `state.workers.${workerId}`, worker = object(value, label);
    const history = array(worker.history, `${label}.history`);
    history.forEach((value, index) => {
      const at = `${label}.history[${index}]`, item = object(value, at), taskId = id(item.id, `${at}.id`);
      reference(!tasks.has(taskId), `${at}.id`, 'Duplicate retained task identity'); tasks.set(taskId, { workerId });
    });
    if (worker.task === null) continue;
    const task = object(worker.task, `${label}.task`), taskId = id(task.id, `${label}.task.id`), requestId = id(task.requestId, `${label}.task.requestId`);
    reference(!tasks.has(taskId), `${label}.task.id`, 'Duplicate retained task identity'); tasks.set(taskId, { workerId, task });
    reference(!activeRequests.has(requestId), `${label}.task.requestId`, 'Duplicate retained task request identity'); activeRequests.add(requestId);
    retainAttempt(task, `${label}.task`, taskId, workerId);
    if (Object.hasOwn(requests, requestId)) {
      const receipt = object(requests[requestId], `state.requests.${requestId}`);
      reference(receipt.taskId === taskId && receipt.workerId === workerId, `${label}.task.requestId`, 'Task contradicts its retained request receipt');
    }
    for (const key of ['pendingReport', 'report']) {
      if (task[key] === null) continue;
      const at = `${label}.task.${key}`, report = object(task[key], at), reportId = id(report.reportId, `${at}.reportId`);
      reference(!reports.has(reportId), `${at}.reportId`, 'Duplicate retained report identity'); reports.set(reportId, { workerId, task, report });
      reference(report.ownerSession === state.ownerSession, `${at}.ownerSession`, 'Report belongs to a different stored owner');
      retainAttempt(report, at, taskId, workerId);
    }
    for (const [reportId, value] of Object.entries(object(task.decisions, `${label}.task.decisions`))) {
      reference(!decisions.has(reportId), `${label}.task.decisions.${reportId}`, 'Duplicate retained decision identity');
      decisions.set(reportId, { workerId, task, decision: object(value, `${label}.task.decisions.${reportId}`) });
    }
  }
  for (const [requestId, value] of Object.entries(requests)) {
    const at = `state.requests.${requestId}`, request = object(value, at), taskId = id(request.taskId, `${at}.taskId`), target = tasks.get(taskId);
    reference(!requestTasks.has(taskId), `${at}.taskId`, 'Multiple receipts contradict one retained task identity');
    requestTasks.set(taskId, { requestId, workerId: id(request.workerId, `${at}.workerId`) });
    if (!target) continue; // Receipts survive bounded history and worker reset.
    reference(request.workerId === target.workerId, `${at}.workerId`, 'Receipt contradicts retained task ownership');
    if (target.task) reference(target.task.requestId === requestId, `${at}.taskId`, 'Receipt contradicts the retained task request');
  }
  for (const [reportId, value] of Object.entries(notices)) {
    const at = `state.notices.${reportId}`, notice = object(value, at), target = tasks.get(id(notice.taskId, `${at}.taskId`));
    if (target) reference(notice.workerId === target.workerId, `${at}.workerId`, 'Notice contradicts retained task ownership');
    const receipt = requestTasks.get(id(notice.taskId, `${at}.taskId`));
    if (receipt) reference(notice.workerId === receipt.workerId, `${at}.workerId`, 'Notice contradicts retained receipt ownership');
    const retained = reports.get(reportId);
    if (retained) {
      reference(notice.workerId === retained.workerId && notice.taskId === retained.task.id, at, 'Notice contradicts its retained report');
      for (const key of ['ownerEpoch', 'workerGeneration', 'attemptId']) reference(notice[key] === retained.report[key], `${at}.${key}`, 'Notice contradicts its retained report producer');
    }
    const decided = decisions.get(reportId);
    if (decided) {
      reference(notice.workerId === decided.workerId && notice.taskId === decided.task.id, at, 'Notice contradicts its retained decision');
      if (decided.decision.action !== 'cancel') reference(notice.attemptId === decided.decision.attemptId, `${at}.attemptId`, 'Notice contradicts its retained decision attempt');
    }
  }
  for (const [reportId, decided] of decisions) {
    const retained = reports.get(reportId); if (!retained) continue;
    reference(decided.workerId === retained.workerId && decided.task.id === retained.task.id, `state.workers.${decided.workerId}.task.decisions.${reportId}`, 'Decision contradicts retained report ownership');
  }
}
/** @param {unknown} value @param {ProfileFacts} facts @returns {asserts value is StoredStateV1} */
function checkStoredStateProfile(value, facts) {
  const state = object(value, 'state'); keys(state, ['version', 'ownerSession', 'cwd', 'workers', 'requests', 'notices', 'mainPhase', 'branch', 'ownerEpoch'], 'state');
  integer(required(state, 'version', 'state'), 'state.version', STATE_VERSION, STATE_VERSION);
  const ownerSession = text(required(state, 'ownerSession', 'state'), 'state.ownerSession', 10000); text(required(state, 'cwd', 'state'), 'state.cwd', 10000);
  integer(required(state, 'ownerEpoch', 'state'), 'state.ownerEpoch');
  const workers = object(required(state, 'workers', 'state'), 'state.workers');
  for (const [workerId, record] of Object.entries(workers)) checkWorkerRecord(record, `state.workers.${workerId}`, id(workerId, 'state.workers key'), ownerSession, facts);
  const requests = object(required(state, 'requests', 'state'), 'state.requests');
  for (const [requestId, request] of Object.entries(requests)) checkRequest(request, `state.requests.${id(requestId, 'state.requests key')}`);
  const notices = object(required(state, 'notices', 'state'), 'state.notices');
  for (const [reportId, notice] of Object.entries(notices)) checkNotice(notice, `state.notices.${reportId}`, id(reportId, 'state.notices key'));
  if (Object.hasOwn(state, 'mainPhase')) checkMainPhase(state.mainPhase, 'state.mainPhase');
  if (Object.hasOwn(state, 'branch')) integer(state.branch, 'state.branch', 0);
  checkRetainedReferences(state);
  rejectUnsupported(facts);
}
/** @param {unknown} value @param {{ownerSession: string, cwd: string}} expected @returns {StoredStateV1} */
export function validateStoredState(value, expected) {
  assertInertJSON(value, 'state');
  const state = object(value, 'state');
  invariant(!selectIdentityLayout(state), 'Stored Pair state requires identity-bearing records', 'state.ownerEpoch', 'missing-required-field');
  checkStoredStateProfile(value, profileFacts());
  reference(value.ownerSession === expected.ownerSession, 'state.ownerSession', 'Stored Pair state belongs to a different Main session');
  reference(value.cwd === expected.cwd, 'state.cwd', 'Stored Pair state belongs to a different workspace');
  return value;
}
/** @param {unknown} value @param {string} [label] @returns {asserts value is ReportPayload} */
function assertReportPayload(value, label = 'report payload') {
  const payload = object(value, label); keys(payload, ['taskId', 'stepId', 'kind', 'summary', 'question', 'decisions', 'changedFiles', 'checks', 'acceptance', 'stepComplete'], label);
  id(required(payload, 'taskId', label), `${label}.taskId`); id(required(payload, 'stepId', label), `${label}.stepId`); const kind = choice(required(payload, 'kind', label), ['question', 'checkpoint', 'blocked', 'final_review'], `${label}.kind`);
  const summary = text(required(payload, 'summary', label), `${label}.summary`, 8000); invariant(summary.length >= 1, `${label}.summary must not be empty`, `${label}.summary`);
  if (Object.hasOwn(payload, 'question')) { const question = text(payload.question, `${label}.question`, 4000); invariant(question.length >= 1, `${label}.question must not be empty`, `${label}.question`); }
  for (const key of ['decisions', 'changedFiles']) if (Object.hasOwn(payload, key)) { const entries = array(payload[key], `${label}.${key}`); const maximum = key === 'decisions' ? 24 : 200; invariant(entries.length <= maximum, `${label}.${key} is too large`, `${label}.${key}`); entries.forEach((entry, index) => { const item = text(entry, `${label}.${key}[${index}]`, key === 'decisions' ? 2000 : 1024); invariant(item.length >= 1, `${label}.${key}[${index}] must not be empty`, `${label}.${key}[${index}]`); }); }
  if (Object.hasOwn(payload, 'checks')) { const checks = array(payload.checks, `${label}.checks`); invariant(checks.length <= 32, `${label}.checks is too large`, `${label}.checks`); checks.forEach((entry, index) => { const checkLabel = `${label}.checks[${index}]`, check = object(entry, checkLabel); keys(check, ['name', 'result', 'detail'], checkLabel); const name = text(required(check, 'name', checkLabel), `${checkLabel}.name`, 200); invariant(name.length >= 1, `${checkLabel}.name must not be empty`, `${checkLabel}.name`); choice(required(check, 'result', checkLabel), ['pass', 'fail', 'not_run'], `${checkLabel}.result`); if (Object.hasOwn(check, 'detail')) { const detail = text(check.detail, `${checkLabel}.detail`, 2000); invariant(detail.length >= 1, `${checkLabel}.detail must not be empty`, `${checkLabel}.detail`); } }); }
  // Acceptance: the step's own criteria with the worker's verdict on each, so Main reads a verdict per criterion
  // instead of having to infer it from a summary. The evidence is the worker's claim like any other.
  if (Object.hasOwn(payload, 'acceptance')) {
    const claims = array(payload.acceptance, `${label}.acceptance`);
    invariant(claims.length <= 32, `${label}.acceptance is too large`, `${label}.acceptance`);
    claims.forEach((entry, index) => {
      const at = `${label}.acceptance[${index}]`, claim = object(entry, at); keys(claim, ['criterion', 'met', 'evidence'], at);
      const criterion = text(required(claim, 'criterion', at), `${at}.criterion`, 200);
      invariant(criterion.trim().length >= 1, `${at}.criterion must not be empty`, `${at}.criterion`);
      bool(required(claim, 'met', at), `${at}.met`);
      if (Object.hasOwn(claim, 'evidence')) { const evidence = text(claim.evidence, `${at}.evidence`, 500); invariant(evidence.trim().length >= 1, `${at}.evidence must not be empty`, `${at}.evidence`); }
    });
  }
  if (Object.hasOwn(payload, 'stepComplete')) bool(payload.stepComplete, `${label}.stepComplete`);
  if (kind === 'question') invariant(typeof payload.question === 'string' && payload.question.trim().length > 0, 'question reports need a question', `${label}.question`);

}

/** @param {unknown} value @param {string} [label] @returns {ReportPayload} */
export function validateReportPayload(value, label = 'report payload') { assertReportPayload(value, label); return value; }

/** @param {unknown} value @param {string} label @param {boolean} finalized */
function checkReport(value, label, finalized) {
  const report = object(value, label);
  keys(report, finalized ? [...REPORT_KEYS, 'checkpoint', 'snapshotRef', 'inspectedAt'] : REPORT_KEYS, label);
  knownVersion(required(report, 'version', label), `${label}.version`, WIRE_VERSION);
  for (const key of ['reportId', 'workerId', 'attemptId']) id(required(report, key, label), `${label}.${key}`);
  token(required(report, 'leaseId', label), `${label}.leaseId`);
  for (const key of ['ownerSession', 'nonce', 'sessionId']) text(required(report, key, label), `${label}.${key}`, 10000);
  for (const key of ['ownerEpoch', 'workerGeneration', 'attemptNumber', 'planRevision']) integer(required(report, key, label), `${label}.${key}`, 1);
  const payload = validateReportPayload(required(report, 'payload', label), `${label}.payload`), payloadHash = hash(required(report, 'payloadHash', label), `${label}.payloadHash`);
  invariant(payloadHash === payloadDigest(payload), `${label}.payloadHash does not match payload`, `${label}.payloadHash`, 'hash-mismatch');
  integer(required(report, 'createdAt', label), `${label}.createdAt`);
  if (!finalized) return;
  const at = `${label}.checkpoint`, checkpoint = object(required(report, 'checkpoint', label), at);
  keys(checkpoint, ['path', 'checkpointHash', 'changed', 'verification', 'patchTruncated'], at);
  text(required(checkpoint, 'path', at), `${at}.path`, 10000); hash(required(checkpoint, 'checkpointHash', at), `${at}.checkpointHash`);
  array(required(checkpoint, 'changed', at), `${at}.changed`).forEach((entry, index) => {
    const path = `${at}.changed[${index}]`; invariant(text(entry, path, 10000).length > 0, `${path} must not be empty`, path);
  });
  const verification = array(required(checkpoint, 'verification', at), `${at}.verification`);
  invariant(verification.length <= 12, `${at}.verification is too large`, `${at}.verification`);
  verification.forEach((entry, index) => {
    const path = `${at}.verification[${index}]`, check = object(entry, path); keys(check, ['name', 'source', 'passed', 'code', 'timedOut', 'output', 'artifact'], path);
    text(required(check, 'name', path), `${path}.name`, 1000);
    invariant(required(check, 'source', path) === 'controller-configured', `${path}.source is invalid`, `${path}.source`);
    bool(required(check, 'passed', path), `${path}.passed`); const code = required(check, 'code', path); if (code !== null) integer(code, `${path}.code`);
    bool(required(check, 'timedOut', path), `${path}.timedOut`); text(required(check, 'output', path), `${path}.output`, 6000); text(required(check, 'artifact', path), `${path}.artifact`, 10000);
  });
  bool(required(checkpoint, 'patchTruncated', at), `${at}.patchTruncated`); text(required(report, 'snapshotRef', label), `${label}.snapshotRef`, 10000);
  if (Object.hasOwn(report, 'inspectedAt')) integer(report.inspectedAt, `${label}.inspectedAt`);
}
/** @param {unknown} value @param {string} [label] @returns {asserts value is ReportEnvelope} */
function assertReportEnvelope(value, label = 'report') { checkReport(value, label, false); }
/** @param {unknown} value @param {string} [label] @returns {ReportEnvelope} */
export function validateReportEnvelope(value, label = 'report') { assertReportEnvelope(value, label); return value; }

/** @param {unknown} value @param {ExpectedIdentity} [expected] @returns {asserts value is Authority} */
function assertAuthority(value, expected = {}) {
  const authority = object(value, 'authority'); keys(authority, ['version', 'ownerSession', 'ownerEpoch', 'workerId', 'workerGeneration', 'phase', 'leaseId', 'attemptId', 'readOnly', 'model', 'repoRoot', 'task', 'updatedAt', 'cacheWarming', 'enforceStepScope', 'shellGuard'], 'authority');
  if (Object.hasOwn(authority, 'cacheWarming')) choice(authority.cacheWarming, ['off', 'active'], 'authority.cacheWarming');
  if (Object.hasOwn(authority, 'enforceStepScope')) bool(authority.enforceStepScope, 'authority.enforceStepScope');
  // The shell guard a Pi worker applies to its own calls. Optional, so authority files written before it still load;
  // a worker with none runs only the gate its runtime gives it.
  if (Object.hasOwn(authority, 'shellGuard')) {
    const guard = object(authority.shellGuard, 'authority.shellGuard'); keys(guard, ['blockedCommands', 'defaultShellTimeoutS'], 'authority.shellGuard');
    const patterns = array(required(guard, 'blockedCommands', 'authority.shellGuard'), 'authority.shellGuard.blockedCommands');
    invariant(patterns.length <= 64, 'authority.shellGuard.blockedCommands must hold at most 64 patterns', 'authority.shellGuard.blockedCommands');
    patterns.forEach((pattern, index) => text(pattern, `authority.shellGuard.blockedCommands[${index}]`, 500));
    integer(required(guard, 'defaultShellTimeoutS', 'authority.shellGuard'), 'authority.shellGuard.defaultShellTimeoutS', 0, 86400);
  }
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

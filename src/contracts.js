import { createHash } from 'node:crypto';
import path from 'node:path';
import { types as nodeTypes } from 'node:util';
import { validateUsageObservation, validateUsageTotals, UsageValidationError } from './observations.js';
import { validateWarmingObservation } from './warming.js';

/** @typedef {import('./observations.js').UsageObservation} UsageObservation */
/** @typedef {import('./observations.js').UsageTotals} UsageTotals */

export const STATE_VERSION = 1;
export const WIRE_VERSION = 1;

const RESERVED_IDS = new Set(['prototype', ...Object.getOwnPropertyNames(Object.prototype)]);
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const POLICY_KEYS = ['mode', 'finalReview', 'maxRevisions', 'maxRevisionsPerStep', 'summaryDetail'];
const LIMIT_KEYS = ['maxTurnsPerStep', 'taskTimeoutMs', 'activeStepTimeoutMs', 'maxQueuedTasks', 'maxQueuedReviews', 'maxReportsPerTask', 'maxReportBytes', 'maxAutomaticReportRepairs', 'maxAutomaticRecoveryAttempts', 'maxReportedCostUsd', 'maxOutputTokens'];
const LIMIT_BOUNDS = Object.freeze({ maxQueuedTasks: [0, 128], maxQueuedReviews: [0, 128], maxReportsPerTask: [1, 1000], maxReportBytes: [1, 1048576], maxAutomaticReportRepairs: [0, 20], maxAutomaticRecoveryAttempts: [0, 20] });
const TASK_STATUSES = ['running', 'awaiting_settle', 'question', 'blocked', 'review', 'paused', 'interrupted', 'completed', 'cancelled'];
// startUnlocked also retains an unresolved task's status as a worker observation.
const WORKER_STATUSES = ['stopped', 'starting', 'ready', 'working', 'settling', 'question', 'blocked', 'review', 'paused', 'attention', 'error', 'running', 'awaiting_settle', 'interrupted'];
const AUTHORITY_PHASES = ['idle', 'running', 'waiting', 'paused', 'stopped'];
const REPORT_KEYS = ['version', 'reportId', 'workerId', 'ownerSession', 'ownerEpoch', 'workerGeneration', 'nonce', 'sessionId', 'leaseId', 'attemptId', 'attemptNumber', 'planRevision', 'payload', 'payloadHash', 'createdAt'];

/** @typedef {Record<string, unknown>} JSONObject */
/** @typedef {{ownerSession?: string, ownerEpoch?: number, workerId?: string, workerGeneration?: number}} ExpectedIdentity */

/** @typedef {'final-only' | 'milestones' | 'every-step'} ReviewMode */
/** @typedef {'minimal' | 'normal' | 'detailed'} SummaryDetail */
/** @typedef {{mode: ReviewMode, finalReview: true, maxRevisions: number, maxRevisionsPerStep: number, summaryDetail: SummaryDetail}} TaskPolicy */
/** @typedef {{mode: ReviewMode | 'final' | 'strict', finalReview: true, maxRevisions: number, maxRevisionsPerStep?: number, summaryDetail: SummaryDetail}} LegacyTaskPolicy */
/** Removed per-step turn and overall task-duration limits. Legacy snapshots and
 * authority files may still carry them; they are validated but never enforced. */
/** @typedef {{maxTurnsPerStep?: number, taskTimeoutMs?: number}} DeprecatedTurnTaskLimits */
/** @typedef {{maxReportedCostUsd: number | null, maxOutputTokens: number | null}} BaseTaskLimits */
/** @typedef {{activeStepTimeoutMs: number, maxQueuedTasks: number, maxQueuedReviews: number, maxReportsPerTask: number, maxReportBytes: number, maxAutomaticReportRepairs: number, maxAutomaticRecoveryAttempts: number}} DeferredTaskLimits */
/** @typedef {BaseTaskLimits & DeprecatedTurnTaskLimits & DeferredTaskLimits} TaskLimits */
/** @typedef {BaseTaskLimits & DeprecatedTurnTaskLimits & Partial<DeferredTaskLimits>} LegacyTaskLimits */
/** @typedef {{id: string, title: string, instructions: string, acceptance?: string[]}} Step */
/** @typedef {'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'} Effort */
/** @typedef {{id: string, provider: string, model: string, effort: Effort, cwd: string | null, readOnly: boolean}} WorkerSpec */
/** @typedef {{name: string, command: string, args: string[]}} VerificationCommand */
/** @typedef {{commands: VerificationCommand[], requirePassing: boolean, timeoutMs: number}} VerificationPolicy */
/** @typedef {'answer' | 'approve' | 'revise'} ContinuationAction */
/** @typedef {'pending' | 'accepted' | 'not_required' | 'not_sent_budget'} DecisionDelivery */
/** @typedef {{hash: string, action: 'cancel', at: number}} CancelDecision */
/** @typedef {{hash: string, feedback: string, ownerEpoch: number, workerGeneration: number, attemptId: string, deliveryOperationId: string, at: number, reviewerModel: string | null, delivery: DecisionDelivery}} ContinuationDecisionFields */
/** @typedef {{action: 'approve', checkpointHash: string} | {action: 'answer' | 'revise', checkpointHash: string | null}} DecisionCheckpoint */
/** @typedef {ContinuationDecisionFields & DecisionCheckpoint} ContinuationDecision */
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
/** @typedef {{version: 1, ownerSession: string, ownerEpoch: number, workerId: string, workerGeneration: number, phase: AuthorityPhase, leaseId: string, attemptId: string | null, readOnly: boolean, model: {provider: string, id: string}, repoRoot: string, task: AuthorityTask | null, updatedAt: number, cacheWarming?: 'off' | 'active'}} Authority */
/** @typedef {{ownerEpoch: number, workerGeneration: number, leaseId: string, attemptId: string, report: ReportEnvelope}} Latch */

/** @typedef {'running' | 'awaiting_settle' | 'question' | 'blocked' | 'review' | 'paused' | 'interrupted' | 'completed' | 'cancelled'} TaskStatus */
/** @typedef {'stopped' | 'starting' | 'ready' | 'working' | 'settling' | 'question' | 'blocked' | 'review' | 'paused' | 'attention' | 'error' | 'running' | 'awaiting_settle' | 'interrupted'} WorkerStatus */
/** @typedef {{hash: string, taskId: string, workerId: string, acceptedAt: number, status: string}} StoredRequestV1 */
/** Delivery receipts are truthful offers, never confirmed comprehension: offeredAt/channel name the channel that received the report; observedAt records an explicit Main read. Legacy 'delivered' remains readable but is never newly written (sendMessage is fire-and-forget).
 * observedBranch pins the persisted conversation-branch counter the report was last inspected on; a decision on a different branch is stale and needs fresh inspection.
 * @typedef {{reportId: string, workerId: string, taskId: string, status: 'pending' | 'delivery_pending' | 'offered' | 'delivered' | 'delivery_failed' | 'resolved' | 'superseded', createdAt: number, deliveredAt?: number, offeredAt?: number, channel?: 'tool-result' | 'boundary' | 'manual' | 'auto', observedAt?: number, observedBranch?: number, error?: string}} HistoricalNoticeV1 */
/** @typedef {HistoricalNoticeV1 & {ownerEpoch: number, workerGeneration: number, attemptId: string, deliveryOperationId: string}} StoredNoticeV1 */
/** Explicit, nonauthorizing Main logical-phase marker. It only channels report delivery after an explicit yield; it never grants worker or Main authority, and a missing marker never implies readiness or yield. revision is a real monotonic phase token; runToken binds a yield to the exact Main agent run that recorded it.
 * The armed flag records whether an empty yield may receive one future automatic boundary offer; activity is the logical activity epoch captured with the yield.
 * @typedef {{status: 'open' | 'yielded', since: number, ownerSession: string, ownerEpoch: number, revision?: number, runToken?: string | null, armed?: boolean, activity?: number}} StoredMainPhaseV1 */
/** @typedef {{id: string, status: string, file: string}} StoredHistoryV1 */
/** @typedef {{direction: 'main→worker' | 'worker→main', kind: string, at: number}} StoredExchangeV1 */
/** @typedef {{reportId: string, reason: string, at: number}} StoredStaleReportV1 */
/** External extension fields are retained as unknown, never treated as readiness or accounting evidence.
 * @typedef {Record<string, unknown> & {tokens: number | null, contextWindow: number, percent: number | null}} StoredContextUsage
 */
/** @typedef {{provider: string, id: string}} StoredModel */
/** @typedef {{toolCallId: string, toolName: string, pid: number | null, detectedAt: number}} StoredDetachedEffectV1 */
/** Measured assistant generation-speed aggregate published with current telemetry. */
/** @typedef {{tokens: number, seconds: number}} StoredSpeedV1 */
/** @typedef {{version: 1, nonce: string, workerId: string, pid: number, sessionId: string, context: StoredContextUsage | null, currentTool: string | null, lastUsage: UsageObservation | null, compacting: boolean, detachedEffect: StoredDetachedEffectV1 | null, phase: AuthorityPhase, model: StoredModel | null, at: number}} HistoricalTelemetryV1 */
/** @typedef {HistoricalTelemetryV1 & {ownerSession: string, ownerEpoch: number, workerGeneration: number, warming?: import('./warming.js').WarmingObservation, speed?: StoredSpeedV1 | null}} StoredTelemetryV1 */
/** @typedef {{agentDir: string, piCompaction: unknown, cacheWarming: unknown, fabricCompaction: unknown, fabricShellHangMs: number | null, fabricAgentMaxDepth: number | null, prewalkDisabled: boolean, prewalkConfigured: boolean, note: string}} StoredNativeSettings */
/** sessionFile is omitted by JSON serialization when Pi has no session file (Pi SessionManager API).
 * @typedef {{protocol: 1, pairVersion: string, pid: number, cwd: string, trusted: boolean, sessionId: string, sessionFile?: string, model: (StoredModel & {contextWindow: number}) | null, thinkingLevel: Effort | 'max' | null, capabilities: {fabric: boolean, fovea: boolean, pairReport: boolean}, versions: {fabric?: unknown, fovea?: unknown}, sourcePaths: string[], context: StoredContextUsage | null, native: StoredNativeSettings, checkedAt: number, scope: string, nonce: string, workerId: string, ownerSession: string}} HistoricalProbeV1
 */
/** meshRoot is the live private-mesh environment observation; probes retained before the field existed may lack it.
 * @typedef {HistoricalProbeV1 & {ownerEpoch: number, workerGeneration: number, meshRoot?: string}} StoredProbeV1 */
/** Exact 7583104 envelope omissions; this is not a partially-filled current envelope.
 * @typedef {Omit<ReportEnvelope, 'ownerEpoch' | 'workerGeneration' | 'attemptId' | 'attemptNumber'>} HistoricalReportEnvelopeV1
 */
/** @typedef {HistoricalReportEnvelopeV1 & {checkpoint: Checkpoint, snapshotRef: string, inspectedAt?: number}} HistoricalFinalizedReportV1 */
/** @typedef {Omit<ContinuationDecisionFields, 'ownerEpoch' | 'workerGeneration' | 'attemptId' | 'deliveryOperationId'> & DecisionCheckpoint} HistoricalContinuationDecisionV1 */
/** @typedef {CancelDecision | HistoricalContinuationDecisionV1} HistoricalDecisionV1 */
/** @typedef {{mode: ReviewMode | 'final' | 'strict', finalReview: true, maxRevisions: number, summaryDetail: SummaryDetail}} PreDeferredPolicyV1 */
/** 7583104 config.js accepts final/milestones/strict/adaptive; adaptive is structurally checked but never recognized.
 * @typedef {Omit<PreDeferredPolicyV1, 'mode'> & {mode: 'final' | 'milestones' | 'strict'}} HistoricalTaskPolicyV1
 */
/** @typedef {PreDeferredPolicyV1 & {maxRevisionsPerStep: number}} StoredPolicyV1 */
/** @typedef {{id: string, requestId: string, objective: string, context: string, constraints: string[], steps: Step[], stepIndex: number, planRevision: number, status: TaskStatus, leaseId: string, verification: VerificationPolicy, startedAt: number, updatedAt: number, revisions: number, turns: number, usage: UsageTotals | null, baseSnapshotRef: string, lastDecision: LastDecision | null, dispatchSettleSequence?: number, pendingSince?: number, abortRequested?: boolean, interruption?: string, previousStatus?: string, completedAt?: number, cancelReason?: string}} StoredTaskFieldsV1 */
/** @typedef {StoredTaskFieldsV1 & {workerId: string, attemptId: string, attemptNumber: number, pendingReport: ReportEnvelope | null, report: FinalizedReport | null, decisions: Record<string, StoredDecision>} & ({policy: StoredPolicyV1, limits: TaskLimits} | {policy: PreDeferredPolicyV1, limits: BaseTaskLimits})} StoredTaskV1 */
/** @typedef {StoredTaskFieldsV1 & {policy: HistoricalTaskPolicyV1, limits: BaseTaskLimits, pendingReport: HistoricalReportEnvelopeV1 | null, report: HistoricalFinalizedReportV1 | null, decisions: Record<string, HistoricalDecisionV1>}} HistoricalTaskV1 */
/** @typedef {{id: string, cwd: string, repoRoot: string, status: WorkerStatus, sessionId: string | null, sessionFile: string | null, bound: WorkerSpec, history: StoredHistoryV1[], usage: UsageTotals | null, error?: string | null, diagnosticFile?: string, lastObservation?: StoredTelemetryV1 | HistoricalTelemetryV1 | null, lastExchange?: StoredExchangeV1 | null, staleReports?: StoredStaleReportV1[], probe?: StoredProbeV1 | HistoricalProbeV1 | null}} StoredWorkerFieldsV1 */
/** @typedef {StoredWorkerFieldsV1 & {workerGeneration: number, task: StoredTaskV1 | null}} StoredWorkerV1 */
/** @typedef {StoredWorkerFieldsV1 & {task: HistoricalTaskV1 | null}} HistoricalWorkerV1 */
/** state.branch is a persisted monotonic conversation-branch counter (normal turns and compaction never bump it); it only fences stale branch decisions, never authorizes anything.
 * @typedef {{version: 1, ownerSession: string, ownerEpoch: number, cwd: string, workers: Record<string, StoredWorkerV1>, requests: Record<string, StoredRequestV1>, notices: Record<string, StoredNoticeV1>, mainPhase?: StoredMainPhaseV1, branch?: number}} StoredStateV1 */
/** @typedef {{version: 1, ownerSession: string, cwd: string, workers: Record<string, HistoricalWorkerV1>, requests: Record<string, StoredRequestV1>, notices: Record<string, HistoricalNoticeV1>, mainPhase?: StoredMainPhaseV1, branch?: number}} HistoricalStateV1 */
/** @typedef {'invalid-field' | 'missing-required-field' | 'mixed-identity' | 'partial-policy-layout' | 'hash-mismatch' | 'inconsistent-reference' | 'unsupported-version' | 'unsupported-shape' | 'unsupported-policy'} StoredIssueCode */
/** @typedef {{code: StoredIssueCode, path: string, message: string}} StoredIssue */
/** @typedef {{path: string, policyLayout: 'pre-deferred-policy' | 'current-policy', alias: 'final' | 'strict' | null}} StoredTaskLayout */
/** @typedef {{path: string, profile: 'current' | 'historical', record: 'telemetry' | 'probe'}} StoredDiagnosticLayout */
/** @typedef {{code: string, path: string}} ReconciliationReason */
/** @typedef {{taskLayouts: StoredTaskLayout[], diagnosticLayouts: StoredDiagnosticLayout[], reconciliationReasons: ReconciliationReason[], unsupported: StoredIssue[]}} ProfileFacts */
/** @typedef {{nonAuthorizing: true, original: unknown} & ({kind: 'recognized', identityLayout: 'pre-identity' | 'identity-bearing', taskLayouts: readonly StoredTaskLayout[], diagnosticLayouts: readonly StoredDiagnosticLayout[], storedBinding: {ownerSession: string, cwd: string}, bindingStatus: 'unchecked', reconciliationReasons: readonly ReconciliationReason[]} | {kind: 'rejected', category: 'corrupt' | 'unsupported', issue: StoredIssue})} StoredStateClassification */

/** Only known validation failures are caught by classification. Programming/I/O errors escape. */
class StoredValidationError extends Error {
  /** @param {StoredIssueCode} code @param {string} path @param {string} message @param {'corrupt' | 'unsupported'} [category] */
  constructor(code, path, message, category = 'corrupt') {
    super(message); this.name = 'StoredValidationError'; this.code = code; this.path = path; this.category = category;
  }
}
/** @param {unknown} condition @param {string} message @param {string} [path] @param {StoredIssueCode} [code] @returns {asserts condition} */
function invariant(condition, message, path = 'state', code = 'invalid-field') {
  if (!condition) throw new StoredValidationError(code, path, message);
}
/** @param {unknown} value @returns {string} */
function payloadDigest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
/** Check inert JSON without reading accessors, invoking proxies/toJSON, or serializing it.
 * Iterative ancestor tracking rejects cycles without turning a RangeError into a data diagnosis.
 * @param {unknown} value @param {string} path
 */
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
function nullableText(value, label) { return value === null ? null : text(value, label, 10000); }
/** @param {unknown} value @param {string} label @returns {string} */
function hash(value, label) { const result = text(value, label, 64); invariant(HASH_PATTERN.test(result), `${label} must be a SHA-256 hash`, label); return result; }
/** @param {unknown} value @param {string} label @param {number} supported */
function knownVersion(value, label, supported) {
  const version = integer(value, label);
  if (version !== supported) throw new StoredValidationError('unsupported-version', label, `${label} is not a supported version`, 'unsupported');
}
/** @param {unknown} condition @param {string} path @param {string} message */
function reference(condition, path, message) { invariant(condition, message, path, 'inconsistent-reference'); }
/** @param {unknown} value @param {string} label @param {boolean} historical */
function checkDecision(value, label, historical) {
  const decision = object(value, label), action = choice(required(decision, 'action', label), ['answer', 'approve', 'revise', 'cancel'], `${label}.action`);
  const identity = historical ? [] : ['ownerEpoch', 'workerGeneration', 'attemptId', 'deliveryOperationId'];
  keys(decision, action === 'cancel' ? ['hash', 'action', 'at'] : ['hash', 'action', 'feedback', 'checkpointHash', 'at', 'reviewerModel', 'delivery', ...identity], label);
  hash(required(decision, 'hash', label), `${label}.hash`); integer(required(decision, 'at', label), `${label}.at`);
  if (action === 'cancel') return;
  const feedback = text(required(decision, 'feedback', label), `${label}.feedback`, 12000); invariant(feedback.length > 0, `${label}.feedback must not be empty`, `${label}.feedback`);
  const checkpoint = required(decision, 'checkpointHash', label);
  if (action === 'approve') hash(checkpoint, `${label}.checkpointHash`);
  else if (checkpoint !== null) invariant(text(checkpoint, `${label}.checkpointHash`, 64).length > 0, `${label}.checkpointHash must not be empty`, `${label}.checkpointHash`);
  if (!historical) {
    for (const key of ['ownerEpoch', 'workerGeneration']) integer(required(decision, key, label), `${label}.${key}`, 1);
    for (const key of ['attemptId', 'deliveryOperationId']) id(required(decision, key, label), `${label}.${key}`);
  }
  const reviewerModel = required(decision, 'reviewerModel', label); if (reviewerModel !== null) text(reviewerModel, `${label}.reviewerModel`, 1000);
  choice(required(decision, 'delivery', label), ['pending', 'accepted', 'not_required', 'not_sent_budget'], `${label}.delivery`);
}
/** @param {unknown} value @param {string} label @returns {asserts value is StoredDecision} */
function assertStoredDecision(value, label) { checkDecision(value, label, false); }
/** @param {unknown} value @param {string} label @returns {StoredDecision} */
function validateStoredDecision(value, label) { assertStoredDecision(value, label); return value; }
/** @param {unknown} value @param {string} label @returns {asserts value is HistoricalDecisionV1} */
function assertHistoricalDecision(value, label) { checkDecision(value, label, true); }
/** @param {unknown} value @param {string} label @returns {asserts value is LastDecision | null} */
function assertLastDecision(value, label) {
  if (value === null) return;
  const decision = object(value, label); keys(decision, ['action', 'feedback', 'reportId'], label);
  choice(required(decision, 'action', label), ['answer', 'approve', 'revise'], `${label}.action`);
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

}

/** @overload @param {unknown} value @param {string} [label] @param {{legacy?: false}} [options] @returns {TaskPolicy} */
/** @overload @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {LegacyTaskPolicy} */
/** @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {LegacyTaskPolicy} */
export function validateTaskPolicy(value, label = 'task.policy', options = {}) { assertTaskPolicy(value, label, options); return value; }

/** @param {unknown} value @param {string} [label] @param {{legacy?: boolean}} [options] @returns {asserts value is LegacyTaskLimits} */
function assertTaskLimits(value, label = 'task.limits', { legacy = false } = {}) {
  const limits = object(value, label); keys(limits, LIMIT_KEYS, label);
  for (const key of ['maxTurnsPerStep', 'taskTimeoutMs']) if (Object.hasOwn(limits, key)) integer(limits[key], `${label}.${key}`, 1);
  if (!legacy || Object.hasOwn(limits, 'activeStepTimeoutMs')) integer(required(limits, 'activeStepTimeoutMs', label), `${label}.activeStepTimeoutMs`, 1);
  for (const [key, bounds] of Object.entries(LIMIT_BOUNDS)) {
    if (legacy && !Object.hasOwn(limits, key)) continue;
    integer(required(limits, key, label), `${label}.${key}`, bounds[0], bounds[1]);
  }
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
  const cwd = required(spec, 'cwd', label); invariant(cwd === null || typeof cwd === 'string', `${label}.cwd must be null or a path`, `${label}.cwd`); bool(required(spec, 'readOnly', label), `${label}.readOnly`);

}

/** @param {unknown} value @param {string} label @returns {WorkerSpec} */
function validateWorkerSpec(value, label) { assertWorkerSpec(value, label); return value; }

/** @returns {ProfileFacts} */
function profileFacts() { return { taskLayouts: [], diagnosticLayouts: [], reconciliationReasons: [], unsupported: [] }; }
/** Delayed until the whole selected structural profile and its retained references are checked.
 * @param {ProfileFacts} facts
 */
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
/** @param {JSONObject} task @param {string} label @param {boolean} historical @param {ProfileFacts} facts */
function checkStoredPolicy(task, label, historical, facts) {
  const legacy = isLegacyTaskShape(task, label), at = `${label}.policy`, policy = object(task.policy, at);
  keys(policy, POLICY_KEYS, at);
  const mode = choice(required(policy, 'mode', at), ['final', 'strict', 'final-only', 'milestones', 'every-step', 'adaptive'], `${at}.mode`);
  invariant(required(policy, 'finalReview', at) === true, `${at}.finalReview must be true`, `${at}.finalReview`);
  integer(required(policy, 'maxRevisions', at), `${at}.maxRevisions`, 0, 20);
  if (!legacy) integer(required(policy, 'maxRevisionsPerStep', at), `${at}.maxRevisionsPerStep`, 0, 20);
  choice(required(policy, 'summaryDetail', at), ['minimal', 'normal', 'detailed'], `${at}.summaryDetail`);
  validateTaskLimits(task.limits, `${label}.limits`, { legacy });
  const alias = mode === 'final' || mode === 'strict' ? mode : null;
  facts.taskLayouts.push({ path: label, policyLayout: legacy ? 'pre-deferred-policy' : 'current-policy', alias });
  if (legacy) facts.reconciliationReasons.push({ code: 'pre-deferred-policy', path: label });
  if (alias) facts.reconciliationReasons.push({ code: 'policy-alias', path: `${at}.mode` });
  if (historical && !legacy) facts.unsupported.push({ code: 'unsupported-shape', path: label, message: 'No proven pre-identity producer supplied deferred policy fields' });
  if (historical && (mode === 'final-only' || mode === 'every-step')) facts.unsupported.push({ code: 'unsupported-shape', path: `${at}.mode`, message: 'No proven pre-identity producer supplied the renamed policy vocabulary' });
  if (mode === 'adaptive') facts.unsupported.push({ code: 'unsupported-policy', path: `${at}.mode`, message: 'Adaptive policy requires explicit reconciliation' });
}
/** @param {unknown} value @param {string} label */
function checkContext(value, label) {
  if (value === null) return;
  const context = object(value, label);
  // Pi ContextUsage (installed declaration and supplied 0.87.1 source). Extension slots stay unknown.
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
/** worker.js stores null until a shell job outlives its call; this is not a readiness flag.
 * @param {unknown} value @param {string} label
 */
function checkDetachedEffect(value, label) {
  if (value === null) return;
  const effect = object(value, label); keys(effect, ['toolCallId', 'toolName', 'pid', 'detectedAt'], label);
  text(required(effect, 'toolCallId', label), `${label}.toolCallId`, 10000);
  text(required(effect, 'toolName', label), `${label}.toolName`, 10000);
  const pid = required(effect, 'pid', label);
  // The producer retains any integer supplied in tool details, not a verified OS PID.
  if (pid !== null) invariant(typeof pid === 'number' && Number.isInteger(pid), `${label}.pid must be an integer or null`, `${label}.pid`);
  integer(required(effect, 'detectedAt', label), `${label}.detectedAt`);
}
/** @param {JSONObject} record @param {string} label @param {'telemetry' | 'probe'} kind @param {ProfileFacts} facts @returns {boolean} */
function diagnosticHistorical(record, label, kind, facts) {
  const markers = kind === 'telemetry' ? ['ownerSession', 'ownerEpoch', 'workerGeneration'] : ['ownerEpoch', 'workerGeneration'];
  const present = markers.filter(key => Object.hasOwn(record, key));
  invariant(present.length === 0 || present.length === markers.length, `${label} has partial diagnostic identity`, label, 'mixed-identity');
  const historical = present.length === 0;
  facts.diagnosticLayouts.push({ path: label, profile: historical ? 'historical' : 'current', record: kind });
  facts.reconciliationReasons.push({ code: 'diagnostic-provenance-unchecked', path: label });
  return historical;
}
/** Measured assistant generation-speed aggregate; a weighted sum (tokens/seconds), never an average of rates.
 * @param {unknown} value @param {string} label */
function checkSpeed(value, label) {
  const speed = object(value, label); keys(speed, ['tokens', 'seconds'], label);
  for (const key of ['tokens', 'seconds']) invariant(typeof speed[key] === 'number' && Number.isFinite(speed[key]) && speed[key] > 0, `${label}.${key} must be a positive finite number`, `${label}.${key}`);
}
/** @param {unknown} value @param {string} label @param {string} workerId @param {string} ownerSession @param {ProfileFacts} facts */
function checkTelemetry(value, label, workerId, ownerSession, facts) {
  if (value === null) return;
  const record = object(value, label), historical = diagnosticHistorical(record, label, 'telemetry', facts);
  keys(record, ['version', 'nonce', 'workerId', 'pid', 'sessionId', 'context', 'currentTool', 'lastUsage', 'compacting', 'detachedEffect', 'phase', 'model', 'at', ...(historical ? [] : ['ownerSession', 'ownerEpoch', 'workerGeneration', 'warming', 'speed'])], label);
  if (!historical && Object.hasOwn(record, 'warming')) validateWarmingObservation(record.warming);
  if (!historical && Object.hasOwn(record, 'speed') && record.speed !== null) checkSpeed(record.speed, `${label}.speed`);
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
/** Intrinsic current-profile validation only; no runtime provenance is established.
 * The borrowed original is returned unchanged, including opaque context fields.
 * @param {unknown} value @param {string} label @returns {asserts value is StoredTelemetryV1}
 */
function assertCurrentTelemetry(value, label) {
  assertInertJSON(value, label);
  const record = object(value, label), facts = profileFacts();
  invariant(['ownerSession', 'ownerEpoch', 'workerGeneration'].every(key => Object.hasOwn(record, key)), `${label} requires complete current diagnostic identity`, label, 'mixed-identity');
  const workerId = id(required(record, 'workerId', label), `${label}.workerId`);
  const ownerSession = text(required(record, 'ownerSession', label), `${label}.ownerSession`, 10000);
  checkTelemetry(value, label, workerId, ownerSession, facts);
  for (const key of ['ownerSession', 'nonce', 'sessionId']) invariant(text(record[key], `${label}.${key}`, 10000).length > 0, `${label}.${key} must not be empty`, `${label}.${key}`);
  rejectUnsupported(facts);
}
/** Validate the complete current telemetry record, not its live owner/session binding.
 * @param {unknown} value @param {string} [label] @returns {StoredTelemetryV1}
 */
export function validateCurrentTelemetry(value, label = 'telemetry') { assertCurrentTelemetry(value, label); return value; }

/** Intrinsic snapshot validation preserves entry order AND each entry's field order.
 * It does not prove storage ownership, blob contents, or a live repository binding.
 * @param {unknown} value @param {{maxFiles: number, maxTotalBytes: number}} limits
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
/** Return the borrowed, fully checked snapshot without sorting or reconstructing it.
 * @param {unknown} value @param {{maxFiles: number, maxTotalBytes: number}} limits
 * @returns {import('./evidence.js').Snapshot}
 */
export function validateSnapshot(value, limits) { assertSnapshot(value, limits); return value; }

/** @param {unknown} value @param {string} label */
function checkNativeSettings(value, label) {
  const native = object(value, label);
  keys(native, ['agentDir', 'piCompaction', 'cacheWarming', 'fabricCompaction', 'fabricShellHangMs', 'fabricAgentMaxDepth', 'prewalkDisabled', 'prewalkConfigured', 'note'], label);
  text(required(native, 'agentDir', label), `${label}.agentDir`, 10000); text(required(native, 'note', label), `${label}.note`, 10000);
  // These are raw external configuration JSON, not locally validated policy objects.
  for (const key of ['piCompaction', 'fabricCompaction', 'cacheWarming']) required(native, key, label);
  for (const key of ['fabricShellHangMs', 'fabricAgentMaxDepth']) {
    const number = required(native, key, label); if (number !== null) integer(number, `${label}.${key}`);
  }
  bool(required(native, 'prewalkDisabled', label), `${label}.prewalkDisabled`); bool(required(native, 'prewalkConfigured', label), `${label}.prewalkConfigured`);
}
/** @param {unknown} value @param {string} label @param {string} workerId @param {string} ownerSession @param {ProfileFacts} facts */
function checkProbe(value, label, workerId, ownerSession, facts) {
  if (value === null) return;
  const probe = object(value, label), historical = diagnosticHistorical(probe, label, 'probe', facts);
  keys(probe, ['protocol', 'pairVersion', 'pid', 'cwd', 'trusted', 'sessionId', 'sessionFile', 'meshRoot', 'model', 'thinkingLevel', 'capabilities', 'versions', 'sourcePaths', 'context', 'native', 'checkedAt', 'scope', 'nonce', 'workerId', 'ownerSession', ...(historical ? [] : ['ownerEpoch', 'workerGeneration'])], label);
  knownVersion(required(probe, 'protocol', label), `${label}.protocol`, 1); integer(required(probe, 'pid', label), `${label}.pid`, 1);
  for (const key of ['pairVersion', 'cwd', 'sessionId', 'scope', 'nonce']) text(required(probe, key, label), `${label}.${key}`, 10000);
  if (Object.hasOwn(probe, 'sessionFile')) text(probe.sessionFile, `${label}.sessionFile`, 10000);
  // Live probes always carry the private mesh root observation; retained probes
  // written before this field existed may legitimately lack it. Presence must
  // still be well formed; live readiness additionally requires an exact match.
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
  // packageVersion reads arbitrary package JSON, including an absent version which
  // JSON serialization omits. Neither extension slot has a consumed concrete domain.
  array(required(probe, 'sourcePaths', label), `${label}.sourcePaths`).forEach((entry, index) => text(entry, `${label}.sourcePaths[${index}]`, 10000));
  checkContext(required(probe, 'context', label), `${label}.context`); checkNativeSettings(required(probe, 'native', label), `${label}.native`);
}
/** @param {JSONObject} report @param {string} label @param {JSONObject} task @param {string} workerId @param {Set<string>} stepIds @param {boolean} current @param {boolean} historical */
function validateTaskReportIdentity(report, label, task, workerId, stepIds, current, historical) {
  const payload = object(report.payload, `${label}.payload`);
  reference(payload.taskId === task.id, `${label}.payload.taskId`, 'Report targets a different task');
  reference(report.workerId === workerId, `${label}.workerId`, 'Report targets a different worker');
  reference(typeof payload.stepId === 'string' && stepIds.has(payload.stepId), `${label}.payload.stepId`, 'Report targets a step outside the task plan');
  // Matching attempt IDs cannot contradict their tuple, even in resolved history.
  if (current || !historical && report.attemptId === task.attemptId) {
    for (const key of historical ? ['planRevision', 'leaseId'] : ['attemptId', 'attemptNumber', 'planRevision', 'leaseId']) reference(report[key] === task[key], `${label}.${key}`, 'Report contradicts its task attempt');
  }
  if (!current) return; // Resolved history retains its original producer tuple.
  const steps = array(task.steps, 'task.steps'), stepIndex = integer(task.stepIndex, 'task.stepIndex', 0, steps.length - 1), step = object(steps[stepIndex], 'task.steps current');
  reference(payload.stepId === step.id, `${label}.payload.stepId`, 'Current report targets a different active step');
  const policy = object(task.policy, 'task.policy'), finalOnly = policy.mode === 'final' || policy.mode === 'final-only';
  reference(!finalOnly || payload.kind !== 'checkpoint', `${label}.payload.kind`, 'Final-only policy does not accept intermediate checkpoints');
  reference(payload.kind !== 'final_review' || finalOnly || stepIndex === steps.length - 1, `${label}.payload.kind`, 'Premature final review');
}
/** @param {unknown} value @param {string} label @param {string} workerId @param {boolean} historical @param {ProfileFacts} facts */
function checkStoredTask(value, label, workerId, historical, facts) {
  const task = object(value, label);
  keys(task, ['id', 'requestId', 'objective', 'context', 'constraints', 'steps', 'stepIndex', 'planRevision', 'status', 'leaseId', 'policy', 'limits', 'verification', 'startedAt', 'updatedAt', 'revisions', 'turns', 'usage', 'baseSnapshotRef', 'pendingReport', 'report', 'decisions', 'lastDecision', 'dispatchSettleSequence', 'pendingSince', 'abortRequested', 'interruption', 'previousStatus', 'completedAt', 'cancelReason', ...(historical ? [] : ['workerId', 'attemptId', 'attemptNumber'])], label);
  for (const key of ['id', 'requestId', 'leaseId']) id(required(task, key, label), `${label}.${key}`);
  if (!historical) {
    reference(id(required(task, 'workerId', label), `${label}.workerId`) === workerId, `${label}.workerId`, 'Task targets a different worker');
    id(required(task, 'attemptId', label), `${label}.attemptId`); integer(required(task, 'attemptNumber', label), `${label}.attemptNumber`, 1);
  }
  text(required(task, 'objective', label), `${label}.objective`, 6000); text(required(task, 'context', label), `${label}.context`, 24000);
  array(required(task, 'constraints', label), `${label}.constraints`).forEach((entry, index) => text(entry, `${label}.constraints[${index}]`, 2000));
  const steps = array(required(task, 'steps', label), `${label}.steps`);
  /** @type {Set<string>} */
  const stepIds = new Set();
  invariant(steps.length >= 1 && steps.length <= 32, `${label}.steps must contain 1–32 steps`, `${label}.steps`);
  steps.forEach((entry, index) => { const at = `${label}.steps[${index}]`, step = validateStep(entry, at); reference(!stepIds.has(step.id), `${at}.id`, 'Duplicate step identity'); stepIds.add(step.id); });
  integer(required(task, 'stepIndex', label), `${label}.stepIndex`, 0, steps.length - 1); integer(required(task, 'planRevision', label), `${label}.planRevision`, 1);
  const status = choice(required(task, 'status', label), TASK_STATUSES, `${label}.status`);
  checkStoredPolicy(task, label, historical, facts); validateVerification(required(task, 'verification', label), `${label}.verification`);
  for (const key of ['startedAt', 'updatedAt', 'revisions', 'turns']) integer(required(task, key, label), `${label}.${key}`);
  text(required(task, 'baseSnapshotRef', label), `${label}.baseSnapshotRef`, 10000); validateUsageTotals(required(task, 'usage', label), `${label}.usage`);
  const decisions = object(required(task, 'decisions', label), `${label}.decisions`);
  for (const [reportId, decision] of Object.entries(decisions)) {
    const at = `${label}.decisions.${id(reportId, `${label}.decisions key`)}`;
    if (historical) assertHistoricalDecision(decision, at); else validateStoredDecision(decision, at);
  }
  for (const key of ['pendingReport', 'report']) {
    const value = required(task, key, label); if (value === null) continue;
    const at = `${label}.${key}`;
    checkReport(value, at, historical, key === 'report'); const report = object(value, at), reportId = id(report.reportId, `${at}.reportId`);
    const waiting = ['question', 'blocked', 'review'].includes(status);
    const suspended = status === 'paused' || status === 'interrupted';
    // previousStatus survives resume/attempt rotation: it cannot bind old evidence
    // to the new attempt. A suspended report is current only with a matching fence.
    const sameAttempt = historical ? report.leaseId === task.leaseId && report.planRevision === task.planRevision : report.attemptId === task.attemptId;
    const decided = Object.hasOwn(decisions, reportId), current = key === 'pendingReport' || !decided && (waiting || suspended && sameAttempt);
    validateTaskReportIdentity(report, at, task, workerId, stepIds, current, historical);
    if (!decided) facts.reconciliationReasons.push({ code: current ? 'report-obligation-unresolved' : 'report-resolution-ambiguous', path: at });
    if (decided) {
      const decision = object(decisions[reportId], `${label}.decisions.${reportId}`), payload = object(report.payload, `${at}.payload`);
      if (decision.action !== 'cancel') {
        if (!historical) reference(decision.attemptId === report.attemptId, `${label}.decisions.${reportId}.attemptId`, 'Decision targets a different retained report attempt');
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
  for (const key of ['dispatchSettleSequence', 'pendingSince', 'completedAt']) if (Object.hasOwn(task, key)) integer(task[key], `${label}.${key}`);
  if (Object.hasOwn(task, 'abortRequested')) bool(task.abortRequested, `${label}.abortRequested`);
  for (const key of ['interruption', 'previousStatus', 'cancelReason']) if (Object.hasOwn(task, key)) text(task[key], `${label}.${key}`, 10000);
}
/** @param {unknown} value @param {string} label @param {string} workerId @returns {asserts value is StoredTaskV1} */
function assertStoredTask(value, label, workerId) { const facts = profileFacts(); checkStoredTask(value, label, workerId, false, facts); rejectUnsupported(facts); }
/** @param {unknown} value @param {string} label @param {string} workerId @returns {StoredTaskV1} */
function validateStoredTask(value, label, workerId) { assertStoredTask(value, label, workerId); return value; }
/** @param {unknown} value @param {string} label @param {string} workerId @param {string} ownerSession @param {boolean} historical @param {ProfileFacts} facts */
function checkWorkerRecord(value, label, workerId, ownerSession, historical, facts) {
  const record = object(value, label);
  keys(record, ['id', 'cwd', 'repoRoot', 'status', 'sessionId', 'sessionFile', 'bound', 'task', 'history', 'usage', 'error', 'diagnosticFile', 'lastObservation', 'lastExchange', 'staleReports', 'probe', ...(historical ? [] : ['workerGeneration'])], label);
  reference(id(required(record, 'id', label), `${label}.id`) === workerId, `${label}.id`, 'Worker identity differs from its map key');
  for (const key of ['cwd', 'repoRoot']) text(required(record, key, label), `${label}.${key}`, 10000);
  choice(required(record, 'status', label), WORKER_STATUSES, `${label}.status`);
  for (const key of ['sessionId', 'sessionFile']) nullableText(required(record, key, label), `${label}.${key}`);
  if (!historical) integer(required(record, 'workerGeneration', label), `${label}.workerGeneration`);
  const bound = validateWorkerSpec(required(record, 'bound', label), `${label}.bound`); reference(bound.id === workerId, `${label}.bound.id`, 'Bound identity differs from its worker');
  const task = required(record, 'task', label); if (task !== null) checkStoredTask(task, `${label}.task`, workerId, historical, facts);
  const history = array(required(record, 'history', label), `${label}.history`); invariant(history.length <= 40, `${label}.history is too large`, `${label}.history`);
  history.forEach((entry, index) => {
    const at = `${label}.history[${index}]`, item = object(entry, at); keys(item, ['id', 'status', 'file'], at);
    id(required(item, 'id', at), `${at}.id`); text(required(item, 'status', at), `${at}.status`, 80); text(required(item, 'file', at), `${at}.file`, 10000);
  });
  validateUsageTotals(required(record, 'usage', label), `${label}.usage`);
  if (Object.hasOwn(record, 'error')) nullableText(record.error, `${label}.error`);
  if (Object.hasOwn(record, 'diagnosticFile')) text(record.diagnosticFile, `${label}.diagnosticFile`, 10000);
  if (Object.hasOwn(record, 'lastObservation')) checkTelemetry(record.lastObservation, `${label}.lastObservation`, workerId, ownerSession, facts);
  if (Object.hasOwn(record, 'probe')) checkProbe(record.probe, `${label}.probe`, workerId, ownerSession, facts);
  if (Object.hasOwn(record, 'lastExchange') && record.lastExchange !== null) {
    const at = `${label}.lastExchange`, exchange = object(record.lastExchange, at); keys(exchange, ['direction', 'kind', 'at'], at);
    choice(required(exchange, 'direction', at), ['main→worker', 'worker→main'], `${at}.direction`); text(required(exchange, 'kind', at), `${at}.kind`, 10000); integer(required(exchange, 'at', at), `${at}.at`);
  }
  if (Object.hasOwn(record, 'staleReports')) {
    const stale = array(record.staleReports, `${label}.staleReports`); invariant(stale.length <= 20, `${label}.staleReports is too large`, `${label}.staleReports`);
    stale.forEach((entry, index) => { const at = `${label}.staleReports[${index}]`, report = object(entry, at); keys(report, ['reportId', 'reason', 'at'], at); id(required(report, 'reportId', at), `${at}.reportId`); text(required(report, 'reason', at), `${at}.reason`, 10000); integer(required(report, 'at', at), `${at}.at`); });
  }
}
/** @param {unknown} value @param {string} label @param {string} workerId @param {string} ownerSession @returns {asserts value is StoredWorkerV1} */
function assertWorkerRecord(value, label, workerId, ownerSession) { const facts = profileFacts(); checkWorkerRecord(value, label, workerId, ownerSession, false, facts); rejectUnsupported(facts); }
/** @param {unknown} value @param {string} label @param {string} workerId @param {string} ownerSession @returns {StoredWorkerV1} */
function validateWorkerRecord(value, label, workerId, ownerSession) { assertWorkerRecord(value, label, workerId, ownerSession); return value; }

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

/** Select once by own-property markers; failures never retry a weaker layout.
 * @param {JSONObject} state @returns {boolean} true for the proven pre-identity layout
 */
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
/** @param {unknown} value @param {string} label @param {string} reportId @param {boolean} historical */
function checkNotice(value, label, reportId, historical) {
  const notice = object(value, label);
  keys(notice, ['reportId', 'workerId', 'taskId', 'status', 'createdAt', 'deliveredAt', 'error', 'offeredAt', 'channel', 'observedAt', 'observedBranch', ...(historical ? [] : ['ownerEpoch', 'workerGeneration', 'attemptId', 'deliveryOperationId'])], label);
  reference(id(required(notice, 'reportId', label), `${label}.reportId`) === reportId, `${label}.reportId`, 'Notice identity differs from its map key');
  for (const key of ['workerId', 'taskId', ...(historical ? [] : ['attemptId', 'deliveryOperationId'])]) id(required(notice, key, label), `${label}.${key}`);
  if (!historical) for (const key of ['ownerEpoch', 'workerGeneration']) integer(required(notice, key, label), `${label}.${key}`, 1);
  choice(required(notice, 'status', label), ['pending', 'delivery_pending', 'offered', 'delivered', 'delivery_failed', 'resolved', 'superseded'], `${label}.status`);
  integer(required(notice, 'createdAt', label), `${label}.createdAt`);
  // Receipts survive subsequent status changes; no status is an observation receipt.
  if (Object.hasOwn(notice, 'deliveredAt')) integer(notice.deliveredAt, `${label}.deliveredAt`);
  if (Object.hasOwn(notice, 'error')) text(notice.error, `${label}.error`, 2000);
  // Offer receipts name the delivery channel that received the report; observedAt
  // records an explicit Main read. Neither confirms the model comprehended it.
  if (Object.hasOwn(notice, 'offeredAt')) integer(notice.offeredAt, `${label}.offeredAt`);
  if (Object.hasOwn(notice, 'channel')) choice(notice.channel, ['tool-result', 'boundary', 'manual', 'auto'], `${label}.channel`);
  if (Object.hasOwn(notice, 'observedAt')) integer(notice.observedAt, `${label}.observedAt`);
  // The branch the report was last inspected on; only fences stale decisions.
  if (Object.hasOwn(notice, 'observedBranch')) integer(notice.observedBranch, `${label}.observedBranch`, 0);
}
/** Explicit Main-phase marker: readable in current and legacy profiles, never authorizing.
 * @param {unknown} value @param {string} label */
function checkMainPhase(value, label) {
  const phase = object(value, label);
  keys(phase, ['status', 'since', 'ownerSession', 'ownerEpoch', 'revision', 'runToken', 'armed', 'activity'], label);
  choice(required(phase, 'status', label), ['open', 'yielded'], `${label}.status`);
  integer(required(phase, 'since', label), `${label}.since`);
  text(required(phase, 'ownerSession', label), `${label}.ownerSession`, 10000);
  integer(required(phase, 'ownerEpoch', label), `${label}.ownerEpoch`, 1);
  // Interim-shape compatibility: absent revision/runToken stays readable but is
  // recovered conservatively (never boundary-eligible), never authorizing.
  if (Object.hasOwn(phase, 'revision')) integer(phase.revision, `${label}.revision`, 0);
  if (Object.hasOwn(phase, 'runToken') && phase.runToken !== null) text(phase.runToken, `${label}.runToken`, 200);
  if (Object.hasOwn(phase, 'armed')) bool(phase.armed, `${label}.armed`);
  if (Object.hasOwn(phase, 'activity')) integer(phase.activity, `${label}.activity`, 0);
}
/** Cross-check only retained identities. No filesystem checks or obligations inferred from absence.
 * @param {JSONObject} state @param {boolean} historical
 */
function checkRetainedReferences(state, historical) {
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
    if (historical) return;
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
      if (!historical) for (const key of ['ownerEpoch', 'workerGeneration', 'attemptId']) reference(notice[key] === retained.report[key], `${at}.${key}`, 'Notice contradicts its retained report producer');
    }
    const decided = decisions.get(reportId);
    if (decided) {
      reference(notice.workerId === decided.workerId && notice.taskId === decided.task.id, at, 'Notice contradicts its retained decision');
      // Decision owner/generation can change when Main resolves a wait after restart.
      if (!historical && decided.decision.action !== 'cancel') reference(notice.attemptId === decided.decision.attemptId, `${at}.attemptId`, 'Notice contradicts its retained decision attempt');
    }
  }
  for (const [reportId, decided] of decisions) {
    const retained = reports.get(reportId); if (!retained) continue;
    reference(decided.workerId === retained.workerId && decided.task.id === retained.task.id, `state.workers.${decided.workerId}.task.decisions.${reportId}`, 'Decision contradicts retained report ownership');
  }
}
/** @param {unknown} value @param {boolean} historical @param {ProfileFacts} facts */
function checkStoredStateProfile(value, historical, facts) {
  const state = object(value, 'state'); keys(state, ['version', 'ownerSession', 'cwd', 'workers', 'requests', 'notices', 'mainPhase', 'branch', ...(historical ? [] : ['ownerEpoch'])], 'state');
  integer(required(state, 'version', 'state'), 'state.version', STATE_VERSION, STATE_VERSION);
  const ownerSession = text(required(state, 'ownerSession', 'state'), 'state.ownerSession', 10000); text(required(state, 'cwd', 'state'), 'state.cwd', 10000);
  if (!historical) integer(required(state, 'ownerEpoch', 'state'), 'state.ownerEpoch');
  const workers = object(required(state, 'workers', 'state'), 'state.workers');
  for (const [workerId, record] of Object.entries(workers)) checkWorkerRecord(record, `state.workers.${workerId}`, id(workerId, 'state.workers key'), ownerSession, historical, facts);
  const requests = object(required(state, 'requests', 'state'), 'state.requests');
  for (const [requestId, request] of Object.entries(requests)) checkRequest(request, `state.requests.${id(requestId, 'state.requests key')}`);
  const notices = object(required(state, 'notices', 'state'), 'state.notices');
  for (const [reportId, notice] of Object.entries(notices)) checkNotice(notice, `state.notices.${reportId}`, id(reportId, 'state.notices key'), historical);
  // Optional in every profile: absent legacy/current data never implies yield.
  if (Object.hasOwn(state, 'mainPhase')) checkMainPhase(state.mainPhase, 'state.mainPhase');
  // Persisted conversation-branch counter: readable in every profile, never authorizing.
  if (Object.hasOwn(state, 'branch')) integer(state.branch, 'state.branch', 0);
  checkRetainedReferences(state, historical);
  if (historical) for (const diagnostic of facts.diagnosticLayouts) {
    if (diagnostic.profile === 'current') facts.unsupported.push({ code: 'unsupported-shape', path: diagnostic.path, message: 'No proven pre-identity producer supplied current diagnostic identities' });
  }
  rejectUnsupported(facts);
}
/** @param {unknown} value @param {ProfileFacts} facts @returns {asserts value is StoredStateV1} */
function assertStoredStateProfile(value, facts) { checkStoredStateProfile(value, false, facts); }
/** @param {unknown} value @param {ProfileFacts} facts @returns {asserts value is HistoricalStateV1} */
function assertHistoricalStateProfile(value, facts) { checkStoredStateProfile(value, true, facts); }
/** @param {unknown} value @param {{ownerSession: string, cwd: string}} expected @returns {StoredStateV1} */
export function validateStoredState(value, expected) {
  assertInertJSON(value, 'state');
  const state = object(value, 'state');
  invariant(!selectIdentityLayout(state), 'Stored Pair state requires identity-bearing records', 'state.ownerEpoch', 'missing-required-field');
  assertStoredStateProfile(value, profileFacts());
  reference(value.ownerSession === expected.ownerSession, 'state.ownerSession', 'Stored Pair state belongs to a different Main session');
  reference(value.cwd === expected.cwd, 'state.cwd', 'Stored Pair state belongs to a different workspace');
  return value;
}
/** Pure recognition of inert decoded JSON, never admission, normalization, migration or backup.
 * The borrowed original is not a promise of preserved JSON bytes or trusted provenance.
 * @param {unknown} value @returns {StoredStateClassification}
 */
export function classifyStoredState(value) {
  try {
    assertInertJSON(value, 'state');
    const state = object(value, 'state'), historical = selectIdentityLayout(state), facts = profileFacts();
    if (historical) assertHistoricalStateProfile(value, facts); else assertStoredStateProfile(value, facts);
    facts.reconciliationReasons.unshift({ code: 'binding-unchecked', path: 'state' }, { code: historical ? 'missing-identity' : 'identity-provenance-unchecked', path: 'state' }, { code: 'accounting-completeness-unchecked', path: 'state.workers' });
    return { kind: 'recognized', nonAuthorizing: true, original: value, identityLayout: historical ? 'pre-identity' : 'identity-bearing',
      taskLayouts: facts.taskLayouts, diagnosticLayouts: facts.diagnosticLayouts,
      storedBinding: { ownerSession: text(state.ownerSession, 'state.ownerSession', 10000), cwd: text(state.cwd, 'state.cwd', 10000) },
      bindingStatus: 'unchecked', reconciliationReasons: facts.reconciliationReasons };
  } catch (error) {
    if (error instanceof StoredValidationError) return { kind: 'rejected', nonAuthorizing: true, original: value, category: error.category, issue: { code: error.code, path: error.path, message: error.message } };
    if (error instanceof UsageValidationError) return { kind: 'rejected', nonAuthorizing: true, original: value, category: 'corrupt', issue: { code: error.code, path: error.path, message: error.message } };
    throw error;
  }
}

/** @param {unknown} value @param {string} [label] @returns {asserts value is ReportPayload} */
function assertReportPayload(value, label = 'report payload') {
  const payload = object(value, label); keys(payload, ['taskId', 'stepId', 'kind', 'summary', 'question', 'decisions', 'changedFiles', 'checks', 'stepComplete'], label);
  id(required(payload, 'taskId', label), `${label}.taskId`); id(required(payload, 'stepId', label), `${label}.stepId`); const kind = choice(required(payload, 'kind', label), ['question', 'checkpoint', 'blocked', 'final_review'], `${label}.kind`);
  const summary = text(required(payload, 'summary', label), `${label}.summary`, 8000); invariant(summary.length >= 1, `${label}.summary must not be empty`, `${label}.summary`);
  if (Object.hasOwn(payload, 'question')) { const question = text(payload.question, `${label}.question`, 4000); invariant(question.length >= 1, `${label}.question must not be empty`, `${label}.question`); }
  for (const key of ['decisions', 'changedFiles']) if (Object.hasOwn(payload, key)) { const entries = array(payload[key], `${label}.${key}`); const maximum = key === 'decisions' ? 24 : 200; invariant(entries.length <= maximum, `${label}.${key} is too large`, `${label}.${key}`); entries.forEach((entry, index) => { const item = text(entry, `${label}.${key}[${index}]`, key === 'decisions' ? 2000 : 1024); invariant(item.length >= 1, `${label}.${key}[${index}] must not be empty`, `${label}.${key}[${index}]`); }); }
  if (Object.hasOwn(payload, 'checks')) { const checks = array(payload.checks, `${label}.checks`); invariant(checks.length <= 32, `${label}.checks is too large`, `${label}.checks`); checks.forEach((entry, index) => { const checkLabel = `${label}.checks[${index}]`, check = object(entry, checkLabel); keys(check, ['name', 'result', 'detail'], checkLabel); const name = text(required(check, 'name', checkLabel), `${checkLabel}.name`, 200); invariant(name.length >= 1, `${checkLabel}.name must not be empty`, `${checkLabel}.name`); choice(required(check, 'result', checkLabel), ['pass', 'fail', 'not_run'], `${checkLabel}.result`); if (Object.hasOwn(check, 'detail')) { const detail = text(check.detail, `${checkLabel}.detail`, 2000); invariant(detail.length >= 1, `${checkLabel}.detail must not be empty`, `${checkLabel}.detail`); } }); }
  if (Object.hasOwn(payload, 'stepComplete')) bool(payload.stepComplete, `${label}.stepComplete`);
  if (kind === 'question') invariant(typeof payload.question === 'string' && payload.question.trim().length > 0, 'question reports need a question', `${label}.question`);

}

/** @param {unknown} value @param {string} [label] @returns {ReportPayload} */
export function validateReportPayload(value, label = 'report payload') { assertReportPayload(value, label); return value; }

/** Shared exact current/pre-identity envelope profile. The payload itself is never rebuilt.
 * @param {unknown} value @param {string} label @param {boolean} historical @param {boolean} finalized
 */
function checkReport(value, label, historical, finalized) {
  const report = object(value, label), envelopeKeys = historical ? REPORT_KEYS.filter(key => !['ownerEpoch', 'workerGeneration', 'attemptId', 'attemptNumber'].includes(key)) : REPORT_KEYS;
  keys(report, finalized ? [...envelopeKeys, 'checkpoint', 'snapshotRef', 'inspectedAt'] : envelopeKeys, label);
  knownVersion(required(report, 'version', label), `${label}.version`, WIRE_VERSION);
  for (const key of historical ? ['reportId', 'workerId'] : ['reportId', 'workerId', 'attemptId']) id(required(report, key, label), `${label}.${key}`);
  token(required(report, 'leaseId', label), `${label}.leaseId`);
  for (const key of ['ownerSession', 'nonce', 'sessionId']) text(required(report, key, label), `${label}.${key}`, 10000);
  for (const key of historical ? ['planRevision'] : ['ownerEpoch', 'workerGeneration', 'attemptNumber', 'planRevision']) integer(required(report, key, label), `${label}.${key}`, 1);
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
function assertReportEnvelope(value, label = 'report') { checkReport(value, label, false, false); }
/** @param {unknown} value @param {string} [label] @returns {ReportEnvelope} */
export function validateReportEnvelope(value, label = 'report') { assertReportEnvelope(value, label); return value; }
/** @param {unknown} value @param {string} label @returns {asserts value is FinalizedReport} */
function assertFinalizedReport(value, label) { checkReport(value, label, false, true); }
/** @param {unknown} value @param {string} label @returns {FinalizedReport} */
function validateFinalizedReport(value, label) { assertFinalizedReport(value, label); return value; }

/** @param {unknown} value @param {ExpectedIdentity} [expected] @returns {asserts value is Authority} */
function assertAuthority(value, expected = {}) {
  const authority = object(value, 'authority'); keys(authority, ['version', 'ownerSession', 'ownerEpoch', 'workerId', 'workerGeneration', 'phase', 'leaseId', 'attemptId', 'readOnly', 'model', 'repoRoot', 'task', 'updatedAt', 'cacheWarming'], 'authority');
  if (Object.hasOwn(authority, 'cacheWarming')) choice(authority.cacheWarming, ['off', 'active'], 'authority.cacheWarming');
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

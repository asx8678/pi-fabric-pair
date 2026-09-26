// Staged pure model (AR-03/H1). Not imported by the live Main/Worker path; see docs/ACTOR-RPC-IMPLEMENTATION-PLAN.md.
/**
 * AR-03 T03 - pure actor, workflow and activation record leaves.
 *
 * Non-authorizing shape and intrinsic consistency only. Historical-prefix
 * replay, liveness, process ownership, complete accounting, settlement truth
 * and authorization remain actor-model / T08 / Host responsibilities. A single
 * operation-local validation context is created per public call and threaded
 * through every nested helper; newly supplied values are always re-inspected.
 * Returned records are deeply frozen, detached values that should be reused
 * rather than re-validated.
 *
 * Exports exactly: validateActorRecordV2, validateWorkflowRecordV2,
 * validateActivationRecordV2. The private record vocabulary below is embedded
 * in those three closed shapes; no extra public symbol is introduced.
 */
import {
  ContractValidationError,
  createValidationContext,
  requireValidationContext,
  captureValidationWork,
  ensureInert,
  validateActorBinding,
  validateActorDefinitionV3,
  validateArtifactRef,
  validateAssignmentSnapshotV2,
  validateBudgetSnapshot,
  validateDeadlineWindow,
  validateGrantCommitProofV2,
  validateId,
  validateIdentity,
  validateHash,
  validateOwnerBinding,
} from './actor-contract-common.js';

/** @typedef {ReturnType<typeof createValidationContext>} Ctx */
/** @typedef {'corrupt'|'unsupported'} ErrorCategory */
/** @typedef {ReturnType<typeof validateActorDefinitionV3>} ActorDefinitionV3 */
/** @typedef {ReturnType<typeof validateOwnerBinding>} OwnerBinding */
/** @typedef {ReturnType<typeof validateActorBinding>} ActorBinding */
/** @typedef {ReturnType<typeof validateIdentity>} Identity */
/** @typedef {ReturnType<typeof validateArtifactRef>} ArtifactRef */
/** @typedef {ReturnType<typeof validateAssignmentSnapshotV2>} AssignmentSnapshotV2 */
/** @typedef {ReturnType<typeof validateBudgetSnapshot>} BudgetSnapshot */
/** @typedef {ReturnType<typeof validateDeadlineWindow>} DeadlineWindow */
/** @typedef {ReturnType<typeof validateGrantCommitProofV2>} GrantCommitProofV2 */
/** @typedef {Readonly<{cwd: string, repoRoot: string}>} ActorWorkspaceV2 */
/** @typedef {Readonly<{code: number|null, signal: string|null, at: number}>} ExitFactV2 */
/** @typedef {Readonly<{version: 2, observationId: string, sequence: number, at: number, state: 'sleeping'|'starting'|'idle'|'busy'|'stopping'|'faulted', generation: number, binding: ActorBinding|null, freshness: Readonly<{context: 'fresh'|'stale'|'unknown', usage: 'fresh'|'stale'|'unknown'}>, pid: number|null, exit: ExitFactV2|null, diagnostic: ArtifactRef|null}>} RuntimeObservationV2 */
/** @typedef {Readonly<{holdId: string, scope: 'actor'|'workflow'|'operation', reason: 'disabled'|'ownership'|'safety'|'budget'|'capacity'|'uncertainty'|'migration'|'maintenance'|'user', createdAt: number, resolvedAt: number|null, resolutionWitness: ArtifactRef|null}>} HoldCauseV2 */
/** @typedef {Readonly<{version: 2, actorId: string, definition: ActorDefinitionV3, workspace: ActorWorkspaceV2, sessionId: string|null, sessionPath: string|null, generation: number, operational: 'enabled'|'paused'|'stopped', holds: readonly HoldCauseV2[], runtime: RuntimeObservationV2|null, mailboxRef: string|null, activationRefs: readonly string[], retentionRefs: readonly string[]}>} ActorRecordV2 */
/** @typedef {Readonly<{dispositionId: string, outcome: 'answered'|'approved'|'cancelled'|'escalated'|'held'|'resolved'|'revised', at: number, witness: ArtifactRef|null}>} DispositionV2 */
/** @typedef {Readonly<{version: 2, obligationId: string, kind: 'question'|'review'|'blocker'|'cancellation', scope: 'workflow'|'step'|'task', createdAt: number, activationId: string|null, producer: ActorBinding|null, expectedRevision: string|null, disposition: DispositionV2|null}>} ObligationV2 */
/** @typedef {Readonly<{taskId: string, attemptId: string|null, planRevision: number}>} TaskRefV2 */
/** @typedef {Readonly<{stepId: string, planRevision: number, ordinal: number, status: 'pending'|'active'|'completed'|'skipped'|'failed'|'cancelled', taskRef: TaskRefV2|null}>} StepV2 */
/** @typedef {Readonly<{version: 2, workflowId: string, requestId: string, inputHash: string, owner: OwnerBinding, objective: string, constraints: readonly string[], participants: Readonly<{supervisor: string|null, implementer: string}>, workflowRevision: string, planRevision: number, budget: BudgetSnapshot, assignment: AssignmentSnapshotV2|null, status: 'planning'|'implementing'|'waiting'|'review'|'needs-user'|'completed'|'cancelled'|'interrupted', steps: readonly StepV2[], currentStep: string|null, currentTask: TaskRefV2|null, currentReport: ArtifactRef|null, currentDecision: ArtifactRef|null, obligations: readonly ObligationV2[]}>} WorkflowRecordV2 */
/** @typedef {Readonly<{intentId: string, at: number, inputHash: string, inputRef: ArtifactRef|null, byteLength: number}>} ActivationIntentV2 */
/** @typedef {Readonly<{commandId: string, inputHash: string, deadline: DeadlineWindow}>} ActivationDispatchV2 */
/** @typedef {Readonly<{observationId: string, at: number, commandId: string, outcome: 'accepted'|'rejected', detail: ArtifactRef|null}>} AckFactV2 */
/** @typedef {Readonly<{observationId: string, at: number, phase: 'started'|'running'|'ended', binding: ActorBinding|null, exit: ExitFactV2|null, detail: ArtifactRef|null}>} RunFactV2 */
/** @typedef {Readonly<{observationId: string, at: number, reportId: string, payloadHash: string, originalBytesHash: string|null, producer: ActorBinding|null, identity: Identity|null, detail: ArtifactRef|null}>} ReportFactV2 */
/** @typedef {Readonly<{observationId: string, at: number, kind: 'native-settled'|'transport-closed'|'aborted', binding: ActorBinding|null, detail: ArtifactRef|null}>} SettlementFactV2 */
/** @typedef {Readonly<{observationId: string, at: number, admittedEffects: number, coverage: 'complete'|'partial'|'unknown', detail: ArtifactRef|null}>} BarrierFactV2 */
/** @typedef {Readonly<{resolutionId: string, at: number, outcome: 'completed'|'failed'|'cancelled'|'held'|'superseded', detail: ArtifactRef|null, witness: ArtifactRef|null}>} ResolutionV2 */
/** @typedef {Readonly<{version: 2, activationId: string, operationId: string, commandId: string, role: 'supervisor'|'implementer', profile: 'supervisor-restricted'|'worker-native', owner: OwnerBinding, actor: ActorBinding, nonce: string, workflowId: string, workflowRevision: string, workflowPlanRevision: number, identity: Identity|null, authorityRef: ArtifactRef|null, grantProof: GrantCommitProofV2, intent: ActivationIntentV2, dispatch: ActivationDispatchV2, observations: Readonly<{ack: AckFactV2|null, run: RunFactV2|null, report: ReportFactV2|null, settlement: SettlementFactV2|null, effectBarrier: BarrierFactV2|null}>, resolution: ResolutionV2|null}>} ActivationRecordV2 */
const VERSION = 2;
const MAX_TEXT_CHARS = 10000;
const MAX_INPUT_BYTES = 4194304;
const MAX_TEXT_BYTES = 10000;
const MAX_HOLDS = 64;
const MAX_ACTIVATION_REFS = 256;
const MAX_RETENTION_REFS = 256;
const MAX_CONSTRAINTS = 64;
const MAX_STEPS = 1024;
const MAX_OBLIGATIONS = 256;

const OPERATIONAL_STATES = Object.freeze(/** @type {const} */ (['enabled', 'paused', 'stopped']));
const RUNTIME_STATES = Object.freeze(/** @type {const} */ (['sleeping', 'starting', 'idle', 'busy', 'stopping', 'faulted']));
const FRESHNESS_VALUES = Object.freeze(/** @type {const} */ (['fresh', 'stale', 'unknown']));
const HOLD_SCOPES = Object.freeze(/** @type {const} */ (['actor', 'workflow', 'operation']));
const HOLD_REASONS = Object.freeze(/** @type {const} */ (['disabled', 'ownership', 'safety', 'budget', 'capacity', 'uncertainty', 'migration', 'maintenance', 'user']));
const WORKFLOW_STATUSES = Object.freeze(/** @type {const} */ (['planning', 'implementing', 'waiting', 'review', 'needs-user', 'completed', 'cancelled', 'interrupted']));
const STEP_STATUSES = Object.freeze(/** @type {const} */ (['pending', 'active', 'completed', 'skipped', 'failed', 'cancelled']));
const OBLIGATION_KINDS = Object.freeze(/** @type {const} */ (['question', 'review', 'blocker', 'cancellation']));
const OBLIGATION_SCOPES = Object.freeze(/** @type {const} */ (['workflow', 'step', 'task']));
const DISPOSITION_OUTCOMES = Object.freeze(/** @type {const} */ (['answered', 'approved', 'resolved', 'cancelled', 'escalated', 'held', 'revised']));
const ACTIVATION_ROLES = Object.freeze(/** @type {const} */ (['supervisor', 'implementer']));
const PROFILES = Object.freeze(/** @type {const} */ (['supervisor-restricted', 'worker-native']));
const ACK_OUTCOMES = Object.freeze(/** @type {const} */ (['accepted', 'rejected']));
const RUN_PHASES = Object.freeze(/** @type {const} */ (['started', 'running', 'ended']));
const SETTLEMENT_KINDS = Object.freeze(/** @type {const} */ (['native-settled', 'transport-closed', 'aborted']));
const BARRIER_COVERAGE = Object.freeze(/** @type {const} */ (['complete', 'partial', 'unknown']));
const RESOLUTION_OUTCOMES = Object.freeze(/** @type {const} */ (['completed', 'failed', 'cancelled', 'held', 'superseded']));
const ACTOR_RECORD_KEYS = Object.freeze(['version','actorId','definition','workspace','sessionId','sessionPath','generation','operational','holds','runtime','mailboxRef','activationRefs','retentionRefs']);
const RUNTIME_OBSERVATION_KEYS = Object.freeze(['version', 'observationId', 'sequence', 'at', 'state', 'generation', 'binding', 'freshness', 'pid', 'exit', 'diagnostic']);
const EXIT_KEYS = Object.freeze(['code', 'signal', 'at']);
const FRESHNESS_KEYS = Object.freeze(['context', 'usage']);
const HOLD_KEYS = Object.freeze(['holdId', 'scope', 'reason', 'createdAt', 'resolvedAt', 'resolutionWitness']);
const WORKFLOW_RECORD_KEYS = Object.freeze(['version', 'workflowId', 'requestId', 'inputHash', 'owner', 'objective', 'constraints', 'participants', 'workflowRevision', 'planRevision', 'budget', 'assignment', 'status', 'steps', 'currentStep', 'currentTask', 'currentReport', 'currentDecision', 'obligations']);
const PARTICIPANT_KEYS = Object.freeze(['supervisor', 'implementer']);
const STEP_KEYS = Object.freeze(['stepId', 'planRevision', 'ordinal', 'status', 'taskRef']);
const TASK_REF_KEYS = Object.freeze(['taskId', 'attemptId', 'planRevision']);
const OBLIGATION_KEYS = Object.freeze(['version', 'obligationId', 'kind', 'scope', 'createdAt', 'activationId', 'producer', 'expectedRevision', 'disposition']);
const DISPOSITION_KEYS = Object.freeze(['dispositionId', 'outcome', 'at', 'witness']);
const ACTIVATION_RECORD_KEYS = Object.freeze(['version', 'activationId', 'operationId', 'commandId', 'role', 'profile', 'owner', 'actor', 'nonce', 'workflowId', 'workflowRevision', 'workflowPlanRevision', 'identity', 'authorityRef', 'grantProof', 'intent', 'dispatch', 'observations', 'resolution']);
const INTENT_KEYS = Object.freeze(['intentId', 'at', 'inputHash', 'inputRef', 'byteLength']);
const DISPATCH_KEYS = Object.freeze(['commandId', 'inputHash', 'deadline']);
const OBSERVATION_KEYS = Object.freeze(['ack', 'run', 'report', 'settlement', 'effectBarrier']);
const ACK_FACT_KEYS = Object.freeze(['observationId', 'at', 'commandId', 'outcome', 'detail']);
const RUN_FACT_KEYS = Object.freeze(['observationId', 'at', 'phase', 'binding', 'exit', 'detail']);
const REPORT_FACT_KEYS = Object.freeze(['observationId', 'at', 'reportId', 'payloadHash', 'originalBytesHash', 'producer', 'identity', 'detail']);
const SETTLEMENT_FACT_KEYS = Object.freeze(['observationId', 'at', 'kind', 'binding', 'detail']);
const BARRIER_FACT_KEYS = Object.freeze(['observationId', 'at', 'admittedEffects', 'coverage', 'detail']);
const RESOLUTION_KEYS = Object.freeze(['resolutionId', 'at', 'outcome', 'detail', 'witness']);
/**
 * @param {string} code
 * @param {string} path
 * @param {string} message
 * @param {ErrorCategory} [category]
 * @returns {never}
 */
function fail(code, path, message, category = 'corrupt') {
  throw new ContractValidationError(code, path, message, category);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} [maxChars]
 * @param {boolean} [nonempty]
 * @returns {string}
 */
function textValue(value, path, maxChars = MAX_TEXT_CHARS, nonempty = true) {
  if (typeof value !== 'string' || value.length > maxChars) fail('invalid-field', path, 'Expected bounded text');
  utf8ByteLength(value, path, MAX_TEXT_BYTES);
  if (nonempty && value.trim().length === 0) fail('invalid-field', path, 'Expected nonempty text');
  return value;
}
/**
 * Exact UTF-8 byte length for text whose character length is already bounded.
 * Restates the common 10,000-byte ceiling locally, so no common API is needed.
 * Lone surrogates and over-ceiling encodings reject with the corrupt category;
 * the code stays capacity and no capacity category is invented.
 * @param {string} value
 * @param {string} path
 * @param {number} maxBytes
 * @returns {number}
 */
function utf8ByteLength(value, path, maxBytes) {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) { i++; bytes += 4; }
      else fail('invalid-field', path, 'Lone surrogate in text');
    } else if (code >= 0xdc00 && code <= 0xdfff) fail('invalid-field', path, 'Lone surrogate in text');
    else bytes += 3;
    if (bytes > maxBytes) fail('capacity', path, 'UTF-8 text byte limit exceeded');
  }
  return bytes;
}
/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} [minimum]
 * @param {number} [maximum]
 * @returns {number}
 */
function integerValue(value, path, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail('invalid-field', path, 'Expected bounded safe integer');
  return value;
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {readonly T[]} choices
 * @param {string} path
 * @returns {T}
 */
function choiceValue(value, choices, path) {
  const match = choices.find(function (entry) { return value === entry; });
  if (match === undefined) fail('unsupported-value', path, 'Unsupported value', 'unsupported');
  return match;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {string|null}
 */
function nullableIdValue(value, path) {
  return value === null ? null : validateId(value, path);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {boolean} [nonempty]
 * @returns {string|null}
 */
function nullableTextValue(value, path, nonempty = false) {
  return value === null ? null : textValue(value, path, MAX_TEXT_CHARS, nonempty);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} maximum
 * @returns {readonly unknown[]}
 */
function arrayValue(value, path, maximum) {
  if (!Array.isArray(value)) fail('invalid-field', path, 'Expected array');
  if (value.length > maximum) fail('capacity', path, 'Array limit exceeded');
  return value;
}
/**
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} path
 * @param {Ctx} context
 * @returns {Record<string, unknown>}
 */
function closedRecord(value, allowed, path, context) {
  const captured = ensureInert(value, path, context);
  if (captured === null || typeof captured !== 'object' || Array.isArray(captured)) fail('invalid-field', path, 'Expected object record');
  const record = /** @type {Record<string, unknown>} */ (captured);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail('invalid-field', path, 'Unknown record field');
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) fail('missing-required-field', path + '.' + key, 'Missing required field');
  }
  return record;
}

/**
 * @template T
 * @param {unknown} value
 * @param {string} path
 * @param {number} maximum
 * @param {Ctx} context
 * @param {(entry: unknown, at: string, context: Ctx) => T} build
 * @returns {readonly T[]}
 */
function buildArray(value, path, maximum, context, build) {
  const array = arrayValue(value, path, maximum);
  const out = [];
  for (let i = 0; i < array.length; i++) out.push(build(array[i], path + '[' + i + ']', context));
  return Object.freeze(out);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} maximum
 * @returns {readonly string[]}
 */
function uniqueIdArray(value, path, maximum) {
  const array = arrayValue(value, path, maximum);
  const seen = /** @type {Set<string>} */ (new Set());
  const out = [];
  for (let i = 0; i < array.length; i++) {
    const member = validateId(array[i], path + '[' + i + ']');
    if (seen.has(member)) fail('inconsistent-reference', path + '[' + i + ']', 'Duplicate reference');
    seen.add(member);
    out.push(member);
  }
  return Object.freeze(out);
}
/** @param {OwnerBinding} a @param {OwnerBinding} b @returns {boolean} */
function sameOwner(a, b) { return a.ownerSession === b.ownerSession && a.ownerEpoch === b.ownerEpoch && a.branchRevision === b.branchRevision; }

/** @param {ActorBinding} a @param {ActorBinding} b @returns {boolean} */
function sameActor(a, b) { return a.actorId === b.actorId && a.role === b.role && a.ownerSession === b.ownerSession && a.ownerEpoch === b.ownerEpoch && a.generation === b.generation && a.sessionId === b.sessionId && a.model === b.model; }
/** @param {Identity} a @param {Identity} b @returns {boolean} */
function sameIdentity(a, b) {
  const fa = a.fence;
  const fb = b.fence;
  return a.taskId === b.taskId && a.planRevision === b.planRevision && a.attemptId === b.attemptId && a.attemptNumber === b.attemptNumber && a.leaseId === b.leaseId && fa.workspace === fb.workspace && fa.repoRoot === fb.repoRoot && fa.ownerSession === fb.ownerSession && fa.ownerEpoch === fb.ownerEpoch && fa.workerId === fb.workerId && fa.workerGeneration === fb.workerGeneration && fa.sessionId === fb.sessionId && fa.nonce === fb.nonce;
}
/** @typedef {(value: unknown, path: string, context: Ctx) => unknown} LeafValidator */

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @param {readonly (readonly [string, LeafValidator])[]} fields
 * @returns {Record<string, unknown>}
 */
function validateShape(value, path, context, fields) {
  const allowed = fields.map(function (entry) { return entry[0]; });
  const record = closedRecord(value, allowed, path, context);
  const output = /** @type {Record<string, unknown>} */ (Object.create(null));
  for (const entry of fields) {
    output[entry[0]] = entry[1](record[entry[0]], path + '.' + entry[0], context);
  }
  return output;
}
/**
 * @param {unknown} expected
 * @returns {LeafValidator}
 */
function constField(expected) {
  return function (value, path) {
    if (value !== expected) fail('unsupported-version', path, 'Unexpected literal value');
    return value;
  };
}

/**
 * @param {readonly string[]} choices
 * @returns {LeafValidator}
 */
function choiceField(choices) {
  return function (value, path) { return choiceValue(value, choices, path); };
}

/**
 * @param {LeafValidator} leaf
 * @returns {LeafValidator}
 */
function nilField(leaf) {
  return function (value, path, context) { return value === null ? null : leaf(value, path, context); };
}
/**
 * @param {LeafValidator} leaf
 * @param {number} maximum
 * @returns {LeafValidator}
 */
function listField(leaf, maximum) {
  return function (value, path, context) { return buildArray(value, path, maximum, context, leaf); };
}

/**
 * @param {(value: unknown, context: Ctx) => unknown} validator
 * @returns {LeafValidator}
 */
function boundField(validator) {
  return function (value, path, context) { return validator(value, context); };
}
/** @type {LeafValidator} */
const actorDefinitionLeaf = boundField(validateActorDefinitionV3);
/** @type {LeafValidator} */
const ownerLeaf = boundField(validateOwnerBinding);
/** @type {LeafValidator} */
const actorBindingLeaf = boundField(validateActorBinding);
/** @type {LeafValidator} */
const identityLeaf = boundField(validateIdentity);
/** @type {LeafValidator} */
const artifactLeaf = boundField(validateArtifactRef);
/** @type {LeafValidator} */
const budgetLeaf = boundField(validateBudgetSnapshot);
/** @type {LeafValidator} */
const assignmentLeaf = boundField(validateAssignmentSnapshotV2);
/** @type {LeafValidator} */
const deadlineLeaf = boundField(validateDeadlineWindow);
/** @type {LeafValidator} */
const grantProofLeaf = boundField(validateGrantCommitProofV2);
/** @type {LeafValidator} */
const idLeaf = function (value, path) { return validateId(value, path); };
/** @type {LeafValidator} */
const hashLeaf = function (value, path) { return validateHash(value, path); };
/** @type {(value: unknown, path: string) => string} */
const textLeaf = function (value, path) { return textValue(value, path, MAX_TEXT_CHARS, true); };
/** @type {LeafValidator} */
const nullableTextLeaf = function (value, path) { return nullableTextValue(value, path, true); };
/** @type {LeafValidator} */
const nullableIdLeaf = function (value, path) { return nullableIdValue(value, path); };
/** @type {LeafValidator} */
const countLeaf = function (value, path) { return integerValue(value, path, 0); };
/** @type {LeafValidator} */
const positiveCountLeaf = function (value, path) { return integerValue(value, path, 1); };
/** @type {LeafValidator} */
const nullableCountLeaf = function (value, path) { return value === null ? null : integerValue(value, path, 0); };
/** @type {LeafValidator} */
const nullableHashLeaf = function (value, path) { return value === null ? null : validateHash(value, path); };
/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {ActorWorkspaceV2}
 */
function actorWorkspace(value, path, context) {
  const v = closedRecord(value, ['cwd', 'repoRoot'], path, context);
  return Object.freeze({
    cwd: textValue(v.cwd, path + '.cwd', MAX_TEXT_CHARS, true),
    repoRoot: textValue(v.repoRoot, path + '.repoRoot', MAX_TEXT_CHARS, true),
  });
}
/**
 * @template T
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @param {readonly (readonly [string, LeafValidator])[]} fields
 * @returns {T}
 */
function shapeAs(value, path, context, fields) {
  return /** @type {T} */ (/** @type {unknown} */ (Object.freeze(validateShape(value, path, context, fields))));
}

/**
 * @param {number} maximum
 * @returns {LeafValidator}
 */
function boundedCountLeaf(maximum) {
  return function (value, path) { return integerValue(value, path, 0, maximum); };
}
/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {ExitFactV2}
 */
function exitFact(value, path, context) {
  const v = closedRecord(value, EXIT_KEYS, path, context);
  return Object.freeze({
    code: v.code === null ? null : integerValue(v.code, path + '.code', 0),
    signal: v.signal === null ? null : textValue(v.signal, path + '.signal', 64, true),
    at: integerValue(v.at, path + '.at', 0),
  });
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {HoldCauseV2}
 */
function holdCause(value, path, context) {
  const v = closedRecord(value, HOLD_KEYS, path, context);
  const createdAt = integerValue(v.createdAt, path + '.createdAt', 0);
  const resolvedAt = v.resolvedAt === null ? null : integerValue(v.resolvedAt, path + '.resolvedAt', 0);
  const resolutionWitness = v.resolutionWitness === null ? null : validateArtifactRef(v.resolutionWitness, context);
  if ((resolvedAt === null) !== (resolutionWitness === null)) fail('invalid-field', path, 'Resolution witness must pair with resolvedAt');
  if (resolvedAt !== null && resolvedAt < createdAt) fail('inconsistent-reference', path + '.resolvedAt', 'Hold resolved before creation');
  return Object.freeze({
    holdId: validateId(v.holdId, path + '.holdId'),
    scope: choiceValue(v.scope, HOLD_SCOPES, path + '.scope'),
    reason: choiceValue(v.reason, HOLD_REASONS, path + '.reason'),
    createdAt: createdAt,
    resolvedAt: resolvedAt,
    resolutionWitness: resolutionWitness,
  });
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {RuntimeObservationV2}
 */
function runtimeObservation(value, path, context) {
  const v = closedRecord(value, RUNTIME_OBSERVATION_KEYS, path, context);
  if (v.version !== VERSION) fail('unsupported-version', path + '.version', 'Expected record version 2', 'unsupported');
  const state = choiceValue(v.state, RUNTIME_STATES, path + '.state');
  const generation = integerValue(v.generation, path + '.generation', 1);
  const binding = v.binding === null ? null : validateActorBinding(v.binding, context);
  if (binding !== null && binding.generation !== generation) fail('inconsistent-reference', path + '.binding.generation', 'Observation binding generation mismatch');
  const freshness = closedRecord(v.freshness, FRESHNESS_KEYS, path + '.freshness', context);
  return Object.freeze({
    version: VERSION,
    observationId: validateId(v.observationId, path + '.observationId'),
    sequence: integerValue(v.sequence, path + '.sequence', 1),
    at: integerValue(v.at, path + '.at', 0),
    state: state,
    generation: generation,
    binding: binding,
    freshness: Object.freeze({
      context: choiceValue(freshness.context, FRESHNESS_VALUES, path + '.freshness.context'),
      usage: choiceValue(freshness.usage, FRESHNESS_VALUES, path + '.freshness.usage'),
    }),
    pid: v.pid === null ? null : integerValue(v.pid, path + '.pid', 1),
    exit: v.exit === null ? null : exitFact(v.exit, path + '.exit', context),
    diagnostic: (v.diagnostic === null ? null : validateArtifactRef(v.diagnostic, context)),
  });
}
/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {TaskRefV2}
 */
function taskRef(value, path, context) {
  const v = closedRecord(value, TASK_REF_KEYS, path, context);
  return Object.freeze({
    taskId: validateId(v.taskId, path + '.taskId'),
    attemptId: v.attemptId === null ? null : validateId(v.attemptId, path + '.attemptId'),
    planRevision: integerValue(v.planRevision, path + '.planRevision', 1),
  });
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {StepV2}
 */
function stepRecord(value, path, context) {
  const v = closedRecord(value, STEP_KEYS, path, context);
  const planRevision = integerValue(v.planRevision, path + '.planRevision', 1);
  // Step plan revision and the referenced task-plan revision are separate
  // namespaces and are never compared. T08 proves the task/workflow mapping.
  const task = v.taskRef === null ? null : taskRef(v.taskRef, path + '.taskRef', context);
  return Object.freeze({
    stepId: validateId(v.stepId, path + '.stepId'),
    planRevision: planRevision,
    ordinal: integerValue(v.ordinal, path + '.ordinal', 0),
    status: choiceValue(v.status, STEP_STATUSES, path + '.status'),
    taskRef: task,
  });
}
/** @type {readonly (readonly [string, LeafValidator])[]} */
const DISPOSITION_FIELDS = Object.freeze([
  ['dispositionId', idLeaf],
  ['outcome', choiceField(DISPOSITION_OUTCOMES)],
  ['at', countLeaf],
  ['witness', nilField(artifactLeaf)],
]);

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {DispositionV2}
 */
function dispositionRecord(value, path, context) {
  return shapeAs(value, path, context, DISPOSITION_FIELDS);
}

/** @type {readonly (readonly [string, LeafValidator])[]} */
const OBLIGATION_FIELDS = Object.freeze([
  ['version', constField(VERSION)],
  ['obligationId', idLeaf],
  ['kind', choiceField(OBLIGATION_KINDS)],
  ['scope', choiceField(OBLIGATION_SCOPES)],
  ['createdAt', countLeaf],
  ['activationId', nullableIdLeaf],
  ['producer', nilField(actorBindingLeaf)],
  ['expectedRevision', nullableIdLeaf],
  ['disposition', nilField(dispositionRecord)],
]);

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {ObligationV2}
 */
function obligationRecord(value, path, context) {
  const obligation = /** @type {ObligationV2} */ (shapeAs(value, path, context, OBLIGATION_FIELDS));
  if ((obligation.activationId === null) !== (obligation.producer === null)) fail('inconsistent-reference', path, 'Producer binding and activation must pair');
  return obligation;
}

/**
 * A nonnull input ref permits 0..4 MiB declared bytes. A null ref requires
 * byteLength 0, meaning no retained input bytes - not proof the original input
 * was empty and not permission to dispatch. T08 must hold unresolved input.
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {ActivationIntentV2}
 */
function activationIntent(value, path, context) {
  const v = closedRecord(value, INTENT_KEYS, path, context);
  const inputRef = v.inputRef === null ? null : validateArtifactRef(v.inputRef, context);
  const byteLength = integerValue(v.byteLength, path + '.byteLength', 0, MAX_INPUT_BYTES);
  if (inputRef === null && byteLength !== 0) fail('inconsistent-reference', path + '.byteLength', 'Null input ref retains no input bytes');
  return Object.freeze({
    intentId: validateId(v.intentId, path + '.intentId'),
    at: integerValue(v.at, path + '.at', 0),
    inputHash: validateHash(v.inputHash, path + '.inputHash'),
    inputRef: inputRef,
    byteLength: byteLength,
  });
}

/** @type {readonly (readonly [string, LeafValidator])[]} */
const DISPATCH_FIELDS = Object.freeze([
  ['commandId', idLeaf],
  ['inputHash', hashLeaf],
  ['deadline', deadlineLeaf],
]);

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {ActivationDispatchV2}
 */
function activationDispatch(value, path, context) {
  return shapeAs(value, path, context, DISPATCH_FIELDS);
}
/** @type {readonly (readonly [string, LeafValidator])[]} */
const ACK_FIELDS = Object.freeze([
  ['observationId', idLeaf],
  ['at', countLeaf],
  ['commandId', idLeaf],
  ['outcome', choiceField(ACK_OUTCOMES)],
  ['detail', nilField(artifactLeaf)],
]);

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {AckFactV2}
 */
function ackFact(value, path, context) {
  return shapeAs(value, path, context, ACK_FIELDS);
}

/** @type {readonly (readonly [string, LeafValidator])[]} */
const RUN_FIELDS = Object.freeze([
  ['observationId', idLeaf],
  ['at', countLeaf],
  ['phase', choiceField(RUN_PHASES)],
  ['binding', nilField(actorBindingLeaf)],
  ['exit', nilField(exitFact)],
  ['detail', nilField(artifactLeaf)],
]);

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {RunFactV2}
 */
function runFact(value, path, context) {
  return shapeAs(value, path, context, RUN_FIELDS);
}

/** @type {readonly (readonly [string, LeafValidator])[]} */
const REPORT_FIELDS = Object.freeze([
  ['observationId', idLeaf],
  ['at', countLeaf],
  ['reportId', idLeaf],
  ['payloadHash', hashLeaf],
  ['originalBytesHash', nullableHashLeaf],
  ['producer', nilField(actorBindingLeaf)],
  ['identity', nilField(identityLeaf)],
  ['detail', nilField(artifactLeaf)],
]);

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {ReportFactV2}
 */
function reportFact(value, path, context) {
  return shapeAs(value, path, context, REPORT_FIELDS);
}
/** @type {readonly (readonly [string, LeafValidator])[]} */
const SETTLEMENT_FIELDS = Object.freeze([
  ['observationId', idLeaf],
  ['at', countLeaf],
  ['kind', choiceField(SETTLEMENT_KINDS)],
  ['binding', nilField(actorBindingLeaf)],
  ['detail', nilField(artifactLeaf)],
]);

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {SettlementFactV2}
 */
function settlementFact(value, path, context) {
  return shapeAs(value, path, context, SETTLEMENT_FIELDS);
}

/** @type {readonly (readonly [string, LeafValidator])[]} */
const BARRIER_FIELDS = Object.freeze([
  ['observationId', idLeaf],
  ['at', countLeaf],
  ['admittedEffects', countLeaf],
  ['coverage', choiceField(BARRIER_COVERAGE)],
  ['detail', nilField(artifactLeaf)],
]);

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {BarrierFactV2}
 */
function barrierFact(value, path, context) {
  return shapeAs(value, path, context, BARRIER_FIELDS);
}

/** @type {readonly (readonly [string, LeafValidator])[]} */
const RESOLUTION_FIELDS = Object.freeze([
  ['resolutionId', idLeaf],
  ['at', countLeaf],
  ['outcome', choiceField(RESOLUTION_OUTCOMES)],
  ['detail', nilField(artifactLeaf)],
  ['witness', nilField(artifactLeaf)],
]);

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {ResolutionV2}
 */
function resolutionFact(value, path, context) {
  return shapeAs(value, path, context, RESOLUTION_FIELDS);
}
/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {ActorRecordV2}
 */
function actorRecord(value, path, context) {
  const v = closedRecord(value, ACTOR_RECORD_KEYS, path, context);
  if (v.version !== VERSION) fail('unsupported-version', path + '.version', 'Expected record version 2', 'unsupported');
  const actorId = validateId(v.actorId, path + '.actorId');
  const definition = validateActorDefinitionV3(v.definition, context);
  if (definition.id !== actorId) fail('inconsistent-reference', path + '.definition.id', 'Definition/actor ID mismatch');
  if (definition.provider.trim().length === 0 || definition.model.trim().length === 0) fail('invalid-field', path + '.definition', 'Selected provider/model required');
  const workspace = actorWorkspace(v.workspace, path + '.workspace', context);
  const sessionId = nullableTextValue(v.sessionId, path + '.sessionId', true);
  const sessionPath = nullableTextValue(v.sessionPath, path + '.sessionPath', true);
  if (sessionPath !== null && sessionId === null) fail('inconsistent-reference', path + '.sessionPath', 'Session path without session identity');
  const generation = integerValue(v.generation, path + '.generation', 1);
  const operational = choiceValue(v.operational, OPERATIONAL_STATES, path + '.operational');
  const holds = buildArray(v.holds, path + '.holds', MAX_HOLDS, context, holdCause);
  /** @type {Set<string>} */
  const holdIds = new Set();
  for (const hold of holds) {
    if (holdIds.has(hold.holdId)) fail('inconsistent-reference', path + '.holds', 'Duplicate hold ID');
    holdIds.add(hold.holdId);
  }
  const runtime = v.runtime === null ? null : runtimeObservation(v.runtime, path + '.runtime', context);
  if (runtime !== null && runtime.binding !== null) {
    if (runtime.binding.actorId !== actorId) fail('inconsistent-reference', path + '.runtime.binding', 'Observation actor mismatch');
    if (runtime.binding.role !== definition.role) fail('inconsistent-reference', path + '.runtime.binding.role', 'Observation actor role mismatch');
    if (runtime.generation === generation) {
      if (runtime.binding.sessionId !== null && sessionId !== null && runtime.binding.sessionId !== sessionId) fail('inconsistent-reference', path + '.runtime.binding.sessionId', 'Observation session mismatch');
      if (runtime.binding.model !== null && runtime.binding.model !== definition.provider + '/' + definition.model) fail('inconsistent-reference', path + '.runtime.binding.model', 'Observation model mismatch');
    }
  }
  if (runtime !== null && runtime.generation > generation) fail('inconsistent-reference', path + '.runtime.generation', 'Runtime observation from a future generation');
  const mailboxRef = nullableIdValue(v.mailboxRef, path + '.mailboxRef');
  const activationRefs = uniqueIdArray(v.activationRefs, path + '.activationRefs', MAX_ACTIVATION_REFS);
  const retentionRefs = uniqueIdArray(v.retentionRefs, path + '.retentionRefs', MAX_RETENTION_REFS);
  return Object.freeze({
    version: VERSION,
    actorId: actorId,
    definition: definition,
    workspace: workspace,
    sessionId: sessionId,
    sessionPath: sessionPath,
    generation: generation,
    operational: operational,
    holds: holds,
    retentionRefs: retentionRefs,
    runtime: runtime,
    mailboxRef: mailboxRef,
    activationRefs: activationRefs,
  });
}
/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {WorkflowRecordV2}
 */
function workflowRecord(value, path, context) {
  const v = closedRecord(value, WORKFLOW_RECORD_KEYS, path, context);
  if (v.version !== VERSION) fail('unsupported-version', path + '.version', 'Expected record version 2', 'unsupported');
  const owner = validateOwnerBinding(v.owner, context);
  const objective = textValue(v.objective, path + '.objective', MAX_TEXT_CHARS, true);
  const constraints = buildArray(v.constraints, path + '.constraints', MAX_CONSTRAINTS, context, textLeaf);
  const participants = closedRecord(v.participants, PARTICIPANT_KEYS, path + '.participants', context);
  const superviserId = nullableIdValue(participants.supervisor, path + '.participants.supervisor');
  const implementerId = validateId(participants.implementer, path + '.participants.implementer');
  if (superviserId !== null && superviserId === implementerId) fail('inconsistent-reference', path + '.participants', 'Distinct participants required');
  const planRevision = integerValue(v.planRevision, path + '.planRevision', 1);
  const budget = validateBudgetSnapshot(v.budget, context);
  const assignment = v.assignment === null ? null : validateAssignmentSnapshotV2(v.assignment, context);
  if (assignment !== null) {
    if (assignment.participants.implementer.id !== implementerId) fail('inconsistent-reference', path + '.assignment.participants.implementer.id', 'Assignment implementer mismatch');
    const assignmentSupervisorId = assignment.participants.supervisor === null ? null : assignment.participants.supervisor.id;
    if (assignmentSupervisorId !== superviserId) fail('inconsistent-reference', path + '.assignment.participants.supervisor.id', 'Assignment supervisor mismatch');
    if (assignment.budgetRevision !== budget.budgetRevision || assignment.budgetHash !== budget.budgetHash) fail('inconsistent-reference', path + '.budget', 'Assignment/budget snapshot mismatch');
  }
  const steps = buildArray(v.steps, path + '.steps', MAX_STEPS, context, stepRecord);
  /** @type {Map<string, StepV2>} */
  const stepById = new Map();
  for (const step of steps) {
    if (stepById.has(step.stepId)) fail('inconsistent-reference', path + '.steps', 'Duplicate step ID');
    stepById.set(step.stepId, step);
    if (step.planRevision > planRevision) fail('inconsistent-reference', path + '.steps', 'Step plan revision exceeds workflow plan revision');
  }
  const currentStep = nullableIdValue(v.currentStep, path + '.currentStep');
  if (currentStep !== null && !stepById.has(currentStep)) fail('inconsistent-reference', path + '.currentStep', 'Current step not in plan');
  const currentTask = v.currentTask === null ? null : taskRef(v.currentTask, path + '.currentTask', context);
  if (currentStep !== null && currentTask !== null) {
    const selected = stepById.get(currentStep);
    if (selected !== undefined && selected.taskRef !== null) {
      if (selected.taskRef.taskId !== currentTask.taskId) fail('inconsistent-reference', path + '.currentTask.taskId', 'Current task/step task mismatch');
      if (selected.taskRef.planRevision !== currentTask.planRevision) fail('inconsistent-reference', path + '.currentTask.planRevision', 'Current task/step plan revision mismatch');
      if (selected.taskRef.attemptId !== null && currentTask.attemptId !== null && selected.taskRef.attemptId !== currentTask.attemptId) fail('inconsistent-reference', path + '.currentTask.attemptId', 'Current task/step attempt mismatch');
    }
  }
  const currentReport = v.currentReport === null ? null : validateArtifactRef(v.currentReport, context);
  const currentDecision = v.currentDecision === null ? null : validateArtifactRef(v.currentDecision, context);
  const obligations = buildArray(v.obligations, path + '.obligations', MAX_OBLIGATIONS, context, obligationRecord);
  /** @type {Set<string>} */
  const obligationIds = new Set();
  for (const obligation of obligations) {
    if (obligationIds.has(obligation.obligationId)) fail('inconsistent-reference', path + '.obligations', 'Duplicate obligation ID');
    obligationIds.add(obligation.obligationId);
  }
  return Object.freeze({
    version: VERSION,
    workflowId: validateId(v.workflowId, path + '.workflowId'),
    requestId: validateId(v.requestId, path + '.requestId'),
    inputHash: validateHash(v.inputHash, path + '.inputHash'),
    owner: owner,
    objective: objective,
    constraints: constraints,
    participants: Object.freeze({ supervisor: superviserId, implementer: implementerId }),
    workflowRevision: validateId(v.workflowRevision, path + '.workflowRevision'),
    planRevision: planRevision,
    budget: budget,
    assignment: assignment,
    status: choiceValue(v.status, WORKFLOW_STATUSES, path + '.status'),
    steps: steps,
    currentStep: currentStep,
    currentTask: currentTask,
    currentReport: currentReport,
    currentDecision: currentDecision,
    obligations: obligations,
  });
}
/**
 * @param {unknown} value
 * @param {string} path
 * @param {Ctx} context
 * @returns {ActivationRecordV2}
 */
function activationRecord(value, path, context) {
  const v = closedRecord(value, ACTIVATION_RECORD_KEYS, path, context);
  if (v.version !== VERSION) fail('unsupported-version', path + '.version', 'Expected record version 2', 'unsupported');
  const activationId = validateId(v.activationId, path + '.activationId');
  const operationId = validateId(v.operationId, path + '.operationId');
  const commandId = validateId(v.commandId, path + '.commandId');
  const role = choiceValue(v.role, ACTIVATION_ROLES, path + '.role');
  const profile = choiceValue(v.profile, PROFILES, path + '.profile');
  const owner = validateOwnerBinding(v.owner, context);
  const actor = validateActorBinding(v.actor, context);
  if (actor.role !== role) fail('inconsistent-reference', path + '.actor.role', 'Actor role mismatch');
  if (actor.model === null || actor.model.trim().length === 0) fail('invalid-field', path + '.actor.model', 'Selected activation model required');
  if (role === 'supervisor' ? profile !== 'supervisor-restricted' : profile !== 'worker-native') fail('inconsistent-reference', path + '.profile', 'Role/profile mismatch');
  if (actor.ownerSession !== owner.ownerSession || actor.ownerEpoch !== owner.ownerEpoch) fail('inconsistent-reference', path + '.actor', 'Owner/participant mismatch');
  const nonce = textValue(v.nonce, path + '.nonce', MAX_TEXT_CHARS, true);
  const workflowId = validateId(v.workflowId, path + '.workflowId');
  const workflowRevision = validateId(v.workflowRevision, path + '.workflowRevision');
  const workflowPlanRevision = integerValue(v.workflowPlanRevision, path + '.workflowPlanRevision', 1);
  const identity = v.identity === null ? null : validateIdentity(v.identity, context);
  if (role === 'implementer' && identity === null) fail('invalid-field', path + '.identity', 'Active implementer requires its identity');
  if (role === 'supervisor' && identity !== null) fail('invalid-field', path + '.identity', 'Supervisor must not carry an implementation identity');
  if (identity !== null) {
    const fence = identity.fence;
    if (fence.workerId !== actor.actorId) fail('inconsistent-reference', path + '.identity.fence.workerId', 'Identity actor mismatch');
    if (fence.ownerSession !== owner.ownerSession || fence.ownerEpoch !== owner.ownerEpoch) fail('inconsistent-reference', path + '.identity.fence', 'Identity owner mismatch');
    if (fence.workerGeneration !== actor.generation) fail('inconsistent-reference', path + '.identity.fence.workerGeneration', 'Identity generation mismatch');
    if (fence.sessionId !== actor.sessionId) fail('inconsistent-reference', path + '.identity.fence.sessionId', 'Identity session mismatch');
    if (fence.nonce !== nonce) fail('inconsistent-reference', path + '.identity.fence.nonce', 'Identity nonce mismatch');
  }
  const authorityRef = v.authorityRef === null ? null : validateArtifactRef(v.authorityRef, context);
  const grantProof = validateGrantCommitProofV2(v.grantProof, context);
  // A present authority ref must name the grant's authority content. This is
  // intrinsic hash agreement only; it never proves artifact resolution,
  // publication or current authority. Those remain T08/Host checks.
  if (authorityRef !== null && authorityRef.hash !== grantProof.authorityHash) fail('inconsistent-reference', path + '.authorityRef.hash', 'Authority reference must match grant authority hash');
  if (!sameOwner(grantProof.owner, owner)) fail('inconsistent-reference', path + '.grantProof.owner', 'Grant owner mismatch');
  if (!sameActor(grantProof.actor, actor)) fail('inconsistent-reference', path + '.grantProof.actor', 'Grant actor mismatch');
  if (grantProof.profile !== profile) fail('inconsistent-reference', path + '.grantProof.profile', 'Grant profile mismatch');
  if (grantProof.nonce !== nonce) fail('inconsistent-reference', path + '.grantProof.nonce', 'Grant nonce mismatch');
  if (grantProof.workflowId !== workflowId) fail('inconsistent-reference', path + '.grantProof.workflowId', 'Grant workflow mismatch');
  if (grantProof.workflowRevision !== workflowRevision) fail('inconsistent-reference', path + '.grantProof.workflowRevision', 'Grant workflow revision mismatch');
  if (grantProof.activationId !== activationId) fail('inconsistent-reference', path + '.grantProof.activationId', 'Grant activation mismatch');
  if (identity === null) {
    if (grantProof.identity !== null) fail('inconsistent-reference', path + '.grantProof.identity', 'Unexpected grant identity');
  } else if (grantProof.identity === null || !sameIdentity(grantProof.identity, identity)) {
    fail('inconsistent-reference', path + '.grantProof.identity', 'Grant identity mismatch');
  }
  const intent = activationIntent(v.intent, path + '.intent', context);
  const dispatch = activationDispatch(v.dispatch, path + '.dispatch', context);
  if (dispatch.commandId !== commandId) fail('inconsistent-reference', path + '.dispatch.commandId', 'Dispatch command mismatch');
  if (dispatch.inputHash !== intent.inputHash) fail('inconsistent-reference', path + '.dispatch.inputHash', 'Dispatch input hash mismatch');
  const observations = closedRecord(v.observations, OBSERVATION_KEYS, path + '.observations', context);
  const ack = observations.ack === null ? null : ackFact(observations.ack, path + '.observations.ack', context);
  if (ack !== null && ack.commandId !== commandId) fail('inconsistent-reference', path + '.observations.ack.commandId', 'ACK command mismatch');
  const run = observations.run === null ? null : runFact(observations.run, path + '.observations.run', context);
  if (run !== null && run.binding !== null && !sameActor(run.binding, actor)) fail('inconsistent-reference', path + '.observations.run.binding', 'Run observation actor mismatch');
  const report = observations.report === null ? null : reportFact(observations.report, path + '.observations.report', context);
  if (report !== null) {
    if (report.producer !== null && !sameActor(report.producer, actor)) fail('inconsistent-reference', path + '.observations.report.producer', 'Report producer mismatch');
    if (role === 'supervisor' && report.identity !== null) fail('invalid-field', path + '.observations.report.identity', 'Supervisor report must not carry an implementation identity');
    if (report.identity !== null && identity !== null && !sameIdentity(report.identity, identity)) fail('inconsistent-reference', path + '.observations.report.identity', 'Report identity mismatch');
  }
  const settlement = observations.settlement === null ? null : settlementFact(observations.settlement, path + '.observations.settlement', context);
  if (settlement !== null && settlement.binding !== null && !sameActor(settlement.binding, actor)) fail('inconsistent-reference', path + '.observations.settlement.binding', 'Settlement observation actor mismatch');
  const effectBarrier = observations.effectBarrier === null ? null : barrierFact(observations.effectBarrier, path + '.observations.effectBarrier', context);
  const resolution = v.resolution === null ? null : resolutionFact(v.resolution, path + '.resolution', context);
  return Object.freeze({
    version: VERSION,
    activationId: activationId,
    operationId: operationId,
    commandId: commandId,
    role: role,
    profile: profile,
    owner: owner,
    actor: actor,
    nonce: nonce,
    workflowId: workflowId,
    workflowRevision: workflowRevision,
    workflowPlanRevision: workflowPlanRevision,
    identity: identity,
    authorityRef: authorityRef,
    grantProof: grantProof,
    intent: intent,
    dispatch: dispatch,
    observations: Object.freeze({ ack: ack, run: run, report: report, settlement: settlement, effectBarrier: effectBarrier }),
    resolution: resolution,
  });
}
/**
 * @param {unknown} value
 * @returns {ActorRecordV2}
 */
export function validateActorRecordV2(value) {
  return actorRecord(value, 'actorRecord', createValidationContext());
}

/**
 * @param {unknown} value
 * @returns {WorkflowRecordV2}
 */
export function validateWorkflowRecordV2(value) {
  return workflowRecord(value, 'workflowRecord', createValidationContext());
}

/**
 * @param {unknown} value
 * @returns {ActivationRecordV2}
 */
export function validateActivationRecordV2(value) {
  return activationRecord(value, 'activationRecord', createValidationContext());
}

/** Intrinsic activation validation inside an existing aggregate operation.
 * The registered context is mandatory, checked before any input descriptor.
 * All nested captures/constructors use it; no caller-owned record is cached.
 * @param {unknown} value @param {Ctx} context @returns {ActivationRecordV2}
 */
export function validateActivationRecordV2InContext(value, context) {
  requireValidationContext(context);
  const captured = captureValidationWork(value, 'activationRecord', context);
  return activationRecord(captured, 'activationRecord', context);
}

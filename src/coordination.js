// Staged pure model (AR-03/H1). Not imported by the live Main/Worker path; see docs/ACTOR-RPC-IMPLEMENTATION-PLAN.md.
import { types as nodeTypes } from 'node:util';
import { createHash } from 'node:crypto';
import { validateTaskPolicy, validateTaskLimits, validateReportEnvelope } from './contracts.js';
import { validateDispatch, validateDecision, validate, stepSchema, dispatchSchema } from './schema.js';
import { UsageValidationError, validateUsageObservation } from './observations.js';
import { ContractValidationError, requireValidationContext, consumeValidationWork, ensureLegacyInert, validateReviewerWitness, validateActorBinding, validateArtifactRef } from './actor-contract-common.js';

/**
 * Internal, pure, non-authorizing workflow model, not a persistent registry or an
 * effect executor. Dispatch, continuation, evidence, decisions, notices, accounting,
 * amendments, reconciliation and non-destructive reset have bounded modeled forms.
 * Unsafe/unbound forms still use unsupported. Source tags authenticate nothing.
 *
 * Genesis plus the retained event journal is canonical. Collections below are
 * checked replay projections, never independent mutable authorities. A journal-only
 * input is accepted; a supplied projection must equal replay in full. This trades
 * replay cost for checking historical invariants without trusting mutable totals.
 * Receipts/history live for the workflow lifetime (including detached live slots).
 * No clocks, ID allocation, I/O, callbacks, provenance or permission checks occur.
 */

/** @typedef {import('./contracts.js').TaskPolicy} TaskPolicy */
/** @typedef {import('./contracts.js').TaskLimits} TaskLimits */
/** @typedef {import('./contracts.js').VerificationPolicy} VerificationPolicy */
/** @typedef {import('./contracts.js').ReportEnvelope} ReportEnvelope */
/** @typedef {import('./contracts.js').FinalizedReport} FinalizedReport */
/** @typedef {{workspace:string, repoRoot:string, ownerSession:string, ownerEpoch:number, workerId:string, workerGeneration:number, sessionId:string, nonce:string}} Fence */
/** @typedef {{fence:Fence, taskId:string, planRevision:number, attemptId:string, attemptNumber:number, leaseId:string}} Identity */
/** @typedef {{observationId:string, at:number}} Witness */
/** @typedef {'disabled'|'stopped'|'paused'|'stale-owner'|'legacy'|'budget'|'unknown-accounting'|'uncertain-effect'|'uncertain-delivery'|'unsupported'|'capacity'|'evidence'|'interrupted'} HoldReason */
/** @typedef {{causeId:string, reason:HoldReason, scope:{kind:'root'|'task'|'operation'|'notice'|'report', id:string}, at:number, resolvedBy:string|null}} HoldCause */
/** @typedef {{costUsd:number|null, outputTokens:number|null, activeMs:number|null, turns:number|null, revisions:number|null, reports:number|null}} SpendingValues */
/** @typedef {{kind:'legacy-held', taskId:string|null, identity:Identity|null, status:'held'|'cancelled', policy:import('./contracts.js').LegacyTaskPolicy|null, limits:import('./contracts.js').LegacyTaskLimits|null, spending:SpendingValues & {kind:'unknown'}, pending:{kind:'question'|'blocked'|'checkpoint'|'final_review', reportId:string|null, reportRef:string}|null, historyRefs:string[]}} LegacyTask */
/** @typedef {{actorId:string, role:'main'|'supervisor'|'implementer', ownerSession:string, ownerEpoch:number, generation:number, sessionId:string, model:string|null}} ActorBinding */
/** @typedef {{configRevision:string, configHash:string, policy:TaskPolicy, limits:TaskLimits, verification:VerificationPolicy}} AssignmentSnapshot */
/** @typedef {{ref:string, hash:string}} ArtifactRef */
/** @typedef {import('./actor-contract-common.js').ReviewerWitness} ReviewerWitness */
/** Closed settlement-free reviewer link retained on inspection receipts: exactly
 * the shared ReviewerWitness fields except settlement. The producing settlement is
 * a separate later actor-domain fact; its absence here never authorizes. T08
 * resolves the refs/IDs and proves the settlement/prefix/current-workflow map.
 * @typedef {Omit<ReviewerWitness,'settlement'>} ReviewLink */
/** @typedef {EventOf<'evidence-receipt'> & {review?:ReviewLink}} EvidenceReceipt */
/** @typedef {'costUsd'|'inputTokens'|'outputTokens'|'requests'|'unknownCostRequests'|'activeMs'|'turns'|'revisions'|'reports'|'repairAttempts'|'recoveryAttempts'|'attempts'} Metric */
/** @typedef {Record<Metric,number>} Ledger */
/** External historical ledgers may omit inputTokens. Preserve that omission in
 * the parsed intent/hash; only the derived accounting projection has a full Ledger.
 * @typedef {Omit<Ledger,'inputTokens'> & {inputTokens?:number}} ReconciliationLedger */
/** @typedef {{gapId:string, metric:Metric, stepId:string|null, reason:string}} AccountingGap */
/** @typedef {{revision:string, at:number, lifetime:Ledger, steps:Record<string,Ledger>, gaps:AccountingGap[]}} AccountingSnapshot */
/** @typedef {{revision:string, at:number, lifetime:ReconciliationLedger, steps:Record<string,ReconciliationLedger>, gaps:AccountingGap[]}} ReconciliationSnapshot */
/** @typedef {ReturnType<ReturnType<typeof kernelScope>['parseChange']>} BudgetChange */
/** @typedef {ReturnType<ReturnType<typeof kernelScope>['parseEvent']>} TransitionEvent */
/** @template {TransitionEvent['kind']} K @typedef {Extract<TransitionEvent,{kind:K}>} EventOf */
/** @typedef {'prepared'|'committed'|'published'|'lifecycle'|'fenced'|'report-retained'|'observed'|'duplicate'|'admission-held'|'uncertain'|'unsupported-family'|'closed-lease'|'invalid-input'|'identity-conflict'|'operation-conflict'|'observation-conflict'|'out-of-order'|'report-conflict'} TransitionReason */
/** @typedef {{kind:'apply'|'noop'|'hold', reason:TransitionReason}} Outcome */
/** @typedef {{at:number, reason:HoldReason|'report'|'cancelled', observationId:string}} Closure */
/** @typedef {{operationId:string, identity:Identity, stepId:string, prepared:EventOf<'prepare-grant'>, phase:'prepared'|'committed'|'open'|'closed', commit:EventOf<'grant-committed'>|null, publication:EventOf<'authority-published'>|null, closure:Closure|null, snapshot:{budgetRevision:string, policy:TaskPolicy, limits:TaskLimits, accounting:AccountingSnapshot, lifetimeDeadlineAt:number|null}, automaticActionOperationId:string|null, reviewReserved:boolean, latestBarrierId:string|null}} Grant */
/** @typedef {{intent:EventOf<'dispatch-prepared'>, observations:EventOf<'worker-delivery'>[], reconciledBy:string|null}} WorkerDelivery */
/** @typedef {{noticeId:string, reportId:string, producerIdentity:Identity, queuedAt:number, observations:EventOf<'main-delivery'>[], resolution:EventOf<'notice-resolved'>|null}} MainDelivery */
/** @typedef {{producerIdentity:Identity, grantOperationId:string, acceptedAt:number, noticeId:string, envelope:ReportEnvelope, content:{kind:'received', envelope:ReportEnvelope}|{kind:'finalized', report:FinalizedReport}, finalizationWitness:EventOf<'checkpoint-finalized'>|null}} RetainedReport */
/** @typedef {{candidate:EventOf<'decide'>, producerIdentity:Identity, outcome:'continue'|'advance'|'complete'|'cancel', commit:EventOf<'intent-committed'>}} KernelDecision */
/** @typedef {null|{kind:'report', reportId:string}|{kind:'continuation', reportId:string, decisionOperationId:string, operationId:string}} Obligation */
/** @typedef {{step:import('./contracts.js').Step, replaces:string[], lineageId:string, retiredBy:string|null}} CatalogEntry */
/** @typedef {{reportId:string, reportHash:string, checkpointHash:string, fromStepId:string, stepId:string, decisionOperationId:string}} ReviewDebt */
/** @typedef {{workflowId:string, workflowRevision:string, workflowPlanRevision:number, workflowBudgetRevision:string, workflowBudgetHash:string, planLink:ReturnType<ReturnType<typeof kernelScope>['parsePlanChange']>['planLink'], reviewDebt:ReviewDebt[]}} StructuralPlan */
/** @typedef {{kind:'current', stepCatalog?:Record<string,CatalogEntry>, structuralPlan?:StructuralPlan, taskId:string, identity:Identity|null, status:'assigned'|'active'|'waiting'|'continuation-pending'|'completed'|'cancelled', dispatchOperationId:string, steps:import('./contracts.js').Step[], stepIndex:number, planRevision:number, currentGrantOperationId:string|null, obligation:Obligation, cancelledContinuations:{reportId:string, decisionOperationId:string, operationId:string, cancelledBy:EventOf<'lifecycle'>}[], genesis:AssignmentSnapshot, policy:TaskPolicy, limits:TaskLimits, verification:VerificationPolicy, budgetRevision:string, budgetHash:string, amendments:string[], accounting:AccountingSnapshot, assignedAt:number, lifetimeDeadlineAt:number|null}} CurrentTask */
/** @typedef {EventOf<'dispatch-requested'|'dispatch-prepared'|'decide'|'amendment-proposed'|'automatic-action-prepared'|'reconciliation-proposed'|'reset-requested'>} Intent */
/** @typedef {{fence:Fence, legacy:LegacyTask|null, holds:HoldCause[]}} Genesis */
/** @typedef {{fence:Fence, task:CurrentTask|LegacyTask|null, tasks:Record<string,CurrentTask>, grants:Record<string,Grant>, promptDeliveries:Record<string,WorkerDelivery>, reports:Record<string,RetainedReport>, decisions:Record<string,KernelDecision>, notices:Record<string,MainDelivery>, intents:Record<string,Intent>, commitments:Record<string,EventOf<'intent-committed'>>, queue:string[], receipts:Record<string,TransitionEvent>, holdCauses:HoldCause[], holds:HoldReason[], barriers:Record<string,EventOf<'effects-reconciled'>>, evidence:Record<string,EvidenceReceipt>, checkpoints:Record<string,EventOf<'checkpoint-current'>>, usage:Record<string,EventOf<'usage-observed'>>, counters:Record<string,EventOf<'counter-observed'>>, failures:EventOf<'failure'>[], control:EventOf<'lifecycle'>|null, runtime:EventOf<'runtime'>|null, resets:EventOf<'reset-requested'>[], outcome:Outcome}} Projection */
/** @typedef {Projection & {mode:'internal-non-authorizing', genesis:Genesis, events:TransitionEvent[]}} CoordinationModel */
/** @typedef {{kind:'apply'|'noop'|'hold', nonAuthorizing:true, reason:TransitionReason, model:CoordinationModel}|{kind:'reject', nonAuthorizing:true, reason:TransitionReason}} TransitionResult */

const HOLDS = /** @type {const} */ (['disabled','stopped','paused','stale-owner','legacy','budget','unknown-accounting','uncertain-effect','uncertain-delivery','unsupported','capacity','evidence','interrupted']);
const METRICS = /** @type {const} */ (['costUsd','inputTokens','outputTokens','requests','unknownCostRequests','activeMs','turns','revisions','reports','repairAttempts','recoveryAttempts','attempts']);
const KINDS = /** @type {const} */ (['dispatch-requested','intent-committed','prepare-grant','grant-committed','authority-published','dispatch-prepared','effects-reconciled','checkpoint-finalized','evidence-receipt','checkpoint-current','decide','notice-resolved','worker-delivery','main-delivery','usage-observed','counter-observed','budget-evaluated','amendment-proposed','automatic-action-prepared','reconciliation-proposed','reset-requested','lifecycle','owner-replaced','report','runtime','failure','unsupported']);

/** Expected input/history conflict only; programming errors must escape the facade. */
export class CoordinationValidationError extends Error {
  /** @param {string} message */
  constructor(message) { super(message); this.name = 'CoordinationValidationError'; }
}
/** Assertion of external shape/history consistency. @param {unknown} condition @param {string} message @returns {asserts condition} */
function check(condition, message) { if (!condition) throw new CoordinationValidationError(message); }
/** Replay implementation invariant, not an invalid-input diagnosis. @param {unknown} condition @param {string} message @returns {asserts condition} */
function invariant(condition, message) { if (!condition) throw new Error(message); }
/** @typedef {import('./actor-contract-common.js').ValidationContext} ValidationContext */
/** Scope lifetime is exactly the registered context's lifetime. No current/global
 * context, serialized trust flag, content-equality credit or cross-operation hit.
 * Weak keys are ONLY kernel-created deeply frozen outputs. External histories and
 * caches, even frozen ones, always go through capture, parsing and full comparison.
 * @type {WeakMap<ValidationContext, ReturnType<typeof kernelScope>>} */
const kernelScopes = new WeakMap();
/** @param {ValidationContext} context */
function inContext(context) {
  requireValidationContext(context);
  let scope = kernelScopes.get(context);
  if (!scope) { scope = kernelScope(context); kernelScopes.set(context, scope); }
  return scope;
}
/** Standalone contracts keep their original unmetered validation/error domain.
 * @param {unknown} value @returns {TransitionEvent} */
export function validateTransitionEvent(value) { return kernelScope().validateTransitionEvent(value); }
/** @param {unknown} value @returns {CoordinationModel} */
export function validateCoordinationModel(value) { return kernelScope().validateCoordinationModel(value); }
/** Internal integration entries: registration is checked BEFORE input access.
 * @param {unknown} value @param {ValidationContext} context @returns {TransitionEvent} */
export function validateTransitionEventInContext(value, context) { return inContext(context).validateTransitionEvent(value); }
/** @param {unknown} value @param {ValidationContext} context @returns {CoordinationModel} */
export function validateCoordinationModelInContext(value, context) { return inContext(context).validateCoordinationModel(value); }
/** One tentative append through the SAME historical step, never a second reducer.
 * External arguments are reconstructed; only exact same-operation private results
 * can skip replay. No mutation is published until the entire step/freezing succeeds.
 * @param {unknown} model @param {unknown} event @param {ValidationContext} context @returns {CoordinationModel} */
export function appendCoordinationModelInContext(model, event, context) { return inContext(context).append(model, event); }

/** Per-operation lexical scope, not an ambient context. Standalone entrypoints
 * deliberately have no scope cache and preserve their historical error contracts.
 * @param {ValidationContext} [context] */
function kernelScope(context) {
  /** @type {WeakSet<object>} */ const parsedEvents = new WeakSet();
  /** @type {WeakMap<object, readonly TransitionEvent[]>} */ const models = new WeakMap();
  /** @param {number} count */
  function work(count) { if (context) consumeValidationWork(context, count); }
  /** Charge each visited occurrence and text/key code unit BEFORE traversing it.
   * No memo/equality credit: repeated projection occurrences and growing prefixes
   * pay again. Inputs here have already been captured, or are private constructions.
   * @param {unknown} value @param {number} [depth] */
  function tree(value, depth = 0) {
    if (!context) return;
    work(1);
    if (depth > context.maxDepth) throw new ContractValidationError('capacity', 'kernel.work', 'Kernel work depth exceeded');
    if (typeof value === 'string') { work(value.length); return; }
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) { work(value.length); for (const entry of value) tree(entry, depth + 1); }
    else for (const key of workKeys(value)) tree(Reflect.get(value, key), depth + 1);
  }
  /** Preflight a native collection pass: visit its entire candidate span (also
   * when the following some/find/includes short-circuits). This charges actual
   * preflight visits plus reserves slots for native copying/comparison; no per-call
   * surcharge. Nested scans call scan again, so quadratic cases pay quadratically.
   * @template {readonly unknown[]} T @param {T} values @returns {T} */
  function scan(values) { if (context) { work(values.length); for (const entry of values) tree(entry); } return values; }
  /** Own-key allocation is unavoidable, as in common capture. Bound it immediately
   * before any value-vector allocation or subsequent key comparisons.
   * @param {object} value @returns {string[]} */
  function workKeys(value) { const keys = Object.keys(value); if (context) { work(keys.length); for (const key of keys) work(key.length); } return keys; }
  /** @template T @param {{[key:string]:T}} value @returns {T[]} */
  function workValues(value) { return scan(workKeys(value).map(key => { work(1); return value[key]; })); }
  /** @template T @param {{[key:string]:T}} value @returns {[string,T][]} */
  function workEntries(value) { return scan(workKeys(value).map(key => { work(1); return /** @type {[string,T]} */ ([key,value[key]]); })); }
  /** Retained sets materialize their own slots, separate from the producing map.
   * @template T @param {readonly T[]} values @returns {Set<T>} */
  function unique(values) { return new Set(scan(values)); }
  /** @param {string} a @param {string} b */
  function workCompare(a,b) { work(a.length + b.length); return a < b ? -1 : a > b ? 1 : 0; }
  /** Freeze only private constructions. A known frozen identity saves the freeze
   * traversal, not external validation or representation/copy accounting.
   * @type {WeakSet<object>} */
  const frozen = new WeakSet();
  /** @template T @param {T} value @returns {T} */
  function freeze(value) {
    work(1);
    if (value === null || typeof value !== 'object' || frozen.has(value)) return value;
    for (const key of workKeys(value)) freeze(Reflect.get(value,key));
    Object.freeze(value); frozen.add(value); return value;
  }
  /** Memoization here preserves INTERNAL task/tasks aliases while forking, not
   * caller authority. No mutable object is shared between two model snapshots.
   * Immutable event subtrees are copied too; every copied occurrence pays.
   * @template T @param {T} value @param {Map<object,object>} [seen] @returns {T} */
  function fork(value, seen = new Map()) {
    work(1);
    if (value === null || typeof value !== 'object') { if (typeof value === 'string') work(value.length); return value; }
    const prior = seen.get(value); if (prior) return /** @type {T} */ (prior);
    /** @type {object} */ const out = Array.isArray(value) ? [] : {}; seen.set(value,out);
    for (const key of workKeys(value)) Object.defineProperty(out,key,{value:fork(Reflect.get(value,key),seen),enumerable:true,writable:true,configurable:true});
    return /** @type {T} */ (out);
  }

/** Adapt only the named external validator invocation. StoredValidationError is
 * private to contracts.js, so recognize its structured boundary fields here.
 * schema.js still throws generic Error: ONLY an exact Error at those two calls is
 * classified; an unexpected generic Error inside those validators is indistinguishable.
 * TypeError/RangeError and all unexpected fold failures escape unchanged.
 * @template T @param {() => T} validate @param {'schema'|'stored'|'usage'|'contract'} family @returns {T}
 */
function externalValidation(validate,family) {
  try { return validate(); } catch (error) {
    if (context && error instanceof ContractValidationError && error.code === 'capacity') throw error;
    const expected = error instanceof Error && (family === 'schema' ? Object.getPrototypeOf(error) === Error.prototype
      : family === 'usage' ? error instanceof UsageValidationError
      : family === 'contract' ? error instanceof ContractValidationError
      : error.name === 'StoredValidationError' && 'code' in error && typeof error.code === 'string' && 'path' in error && typeof error.path === 'string' && 'category' in error && (error.category === 'corrupt' || error.category === 'unsupported'));
    if (expected) throw new CoordinationValidationError(error.message);
    throw error;
  }
}
/** Recursively reject executable/exotic JSON before even reading a discriminator.
 * @param {unknown} value @param {Set<object>} [ancestors]
 */
function inert(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { check(Number.isFinite(value), 'Nonfinite JSON'); return; }
  check(typeof value === 'object' && !nodeTypes.isProxy(value), 'Non-inert JSON');
  check(!ancestors.has(value), 'Cyclic JSON'); ancestors.add(value);
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
  check(array ? proto === Array.prototype : proto === Object.prototype || proto === null, 'Inherited schema');
  const keys = Reflect.ownKeys(value);
  if (array) check(keys.length === value.length + 1, 'Sparse/extended array');
  for (const key of keys) {
    check(typeof key === 'string', 'Symbol field');
    if (array && key === 'length') continue;
    if (array) check(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length, 'Array field');
    const d = Object.getOwnPropertyDescriptor(value, key);
    check(d && Object.hasOwn(d, 'value') && d.enumerable, 'Accessor/nonenumerable field');
    inert(d.value, ancestors);
  }
  ancestors.delete(value);
}
/** Closed required/optional own-field validator; called after inert. @param {unknown} value @param {readonly string[]} keys @param {readonly string[]} [optional] */
function record(value, keys, optional = []) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected record');
  const v = /** @type {Record<string,unknown>} */ (value);
  check(scan(keys).every(k => Object.hasOwn(v,k)) && workKeys(v).every(k => scan(keys).includes(k) || scan(optional).includes(k)), 'Unexpected/missing keys'); return v;
}
/** Dense array validator; inert already checked descriptors. @param {unknown} v @returns {unknown[]} */
function list(v) { check(Array.isArray(v), 'Expected array'); return scan(v); }
/** Bounded nonempty text validator. @param {unknown} v @param {number} [max] */
function text(v, max = 10000) { if (typeof v === 'string') work(v.length); check(typeof v === 'string' && v.trim().length > 0 && v.length <= max, 'Invalid text'); return v; }
/** Text allowing empty contract-domain strings. @param {unknown} v @param {number} [max] */
function string(v, max = 10000) { if (typeof v === 'string') work(v.length); check(typeof v === 'string' && v.length <= max, 'Invalid string'); return v; }
/** Nonempty by length, not trimming: filenames may consist of spaces. @param {unknown} v */
function nonemptyString(v) { const s = string(v); check(s.length > 0,'Empty string'); return s; }
/** Safe nonnegative identity/counter validator. @param {unknown} v @param {number} [min] */
function integer(v, min = 0) { check(typeof v === 'number' && Number.isSafeInteger(v) && v >= min, 'Invalid integer'); return v; }
/** Fractional, finite lower-bound validator. @param {unknown} v */
function amount(v) { check(typeof v === 'number' && Number.isFinite(v) && v >= 0, 'Invalid amount'); return v; }
/** Boolean validator. @param {unknown} v */
function bool(v) { check(typeof v === 'boolean', 'Invalid boolean'); return v; }
/** Closed discriminant validator. @template {string} T @param {unknown} v @param {readonly T[]} options @returns {T} */
function choice(v, options) { const result = scan(options).find(x => x === v); check(result !== undefined, 'Invalid discriminant'); return result; }
/** Contract token validator. @param {unknown} v */
function token(v) { const s = text(v,128); check(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(s) && !Object.hasOwn(Object.prototype,s) && s !== 'prototype', 'Invalid token'); return s; }
/** Contract ID validator. @param {unknown} v */
function id(v) { const s = token(v); check(s.length <= 80, 'Invalid ID'); return s; }
/** Contract hash validator (not evidence of provenance). @param {unknown} v */
function hash(v) { const s = text(v,64); check(/^[a-f0-9]{64}$/.test(s), 'Invalid hash'); return s; }
/** Nullable ID validator. @param {unknown} v */
function nullableId(v) { return v === null ? null : id(v); }
/** Unique ID vector validator. @param {unknown} v */
function ids(v) { const a = list(v).map(id); check(unique(a).size === a.length, 'Duplicate ID'); return a; }
/** Full receiving/producing fence validator. @param {unknown} value @returns {Fence} */
function fence(value) { const v = record(value,['workspace','repoRoot','ownerSession','ownerEpoch','workerId','workerGeneration','sessionId','nonce']); return {workspace:text(v.workspace),repoRoot:text(v.repoRoot),ownerSession:text(v.ownerSession),ownerEpoch:integer(v.ownerEpoch,1),workerId:id(v.workerId),workerGeneration:integer(v.workerGeneration,1),sessionId:text(v.sessionId),nonce:text(v.nonce)}; }
/** Complete historical producer identity validator. @param {unknown} value @returns {Identity} */
function identity(value) { const v = record(value,['fence','taskId','planRevision','attemptId','attemptNumber','leaseId']); return {fence:fence(v.fence),taskId:id(v.taskId),planRevision:integer(v.planRevision,1),attemptId:id(v.attemptId),attemptNumber:integer(v.attemptNumber,1),leaseId:token(v.leaseId)}; }
/** Actor attribution validator, not a role authorization. @param {unknown} value @returns {ActorBinding} */
function actor(value) { const v = record(value,['actorId','role','ownerSession','ownerEpoch','generation','sessionId','model']); return {actorId:id(v.actorId),role:choice(v.role,['main','supervisor','implementer']),ownerSession:text(v.ownerSession),ownerEpoch:integer(v.ownerEpoch,1),generation:integer(v.generation,1),sessionId:text(v.sessionId),model:v.model === null ? null : text(v.model)}; }
/** Artifact binding validator. @param {unknown} value @returns {ArtifactRef} */
function artifact(value) { const v = record(value,['ref','hash']); return {ref:text(v.ref),hash:hash(v.hash)}; }
/** Closed settlement-free reviewer-link validator. Mirrors the accepted
 * ReviewerWitness domain exactly except settlement. Actor and artifact refs use the
 * accepted common intrinsic validators (UTF-8 byte/scalar bounds), while the
 * remaining scalars use the kernel's closed local validators. The full
 * ReviewerWitness remains required on a supervisor-control decision; this link is
 * the only receipt-retained form, so retention never demands a future producing
 * settlement.
 * @param {unknown} value @returns {ReviewLink} */
function reviewLink(value) {
  const v = record(value,['actor','profile','workflowId','workflowRevision','activationId','intentId','intentHash','operationId','reportId','reportHash','checkpointHash','request','reply','receipt']);
  const a = externalValidation(() => validateActorBinding(v.actor,context),'contract');
  check(a.role === 'supervisor' && v.profile === 'supervisor-restricted','Reviewer must be a restricted supervisor');
  return {actor:a,profile:/** @type {const} */ ('supervisor-restricted'),workflowId:id(v.workflowId),workflowRevision:id(v.workflowRevision),activationId:id(v.activationId),intentId:id(v.intentId),intentHash:hash(v.intentHash),operationId:id(v.operationId),reportId:id(v.reportId),reportHash:hash(v.reportHash),checkpointHash:hash(v.checkpointHash),request:externalValidation(() => validateArtifactRef(v.request,context),'contract'),reply:externalValidation(() => validateArtifactRef(v.reply,context),'contract'),receipt:externalValidation(() => validateArtifactRef(v.receipt,context),'contract')};
}
/** Project a validated full witness onto the shared settlement-free link for
 * exact decision-time comparison. Receipts are never mutated later.
 * @param {ReviewerWitness} witness @returns {ReviewLink} */
function reviewLinkOf(witness) { return {actor:witness.actor,profile:witness.profile,workflowId:witness.workflowId,workflowRevision:witness.workflowRevision,activationId:witness.activationId,intentId:witness.intentId,intentHash:witness.intentHash,operationId:witness.operationId,reportId:witness.reportId,reportHash:witness.reportHash,checkpointHash:witness.checkpointHash,request:witness.request,reply:witness.reply,receipt:witness.receipt}; }
/** Configured verification validator. @param {unknown} value @returns {VerificationPolicy} */
function verification(value) {
  const v = record(value,['commands','requirePassing','timeoutMs']);
  const commands = list(v.commands).map(x => { const c = record(x,['name','command','args']); const args = list(c.args).map(a => string(a)); check(args.length <= 256,'Too many arguments'); return {name:text(c.name,1000),command:text(c.command),args}; });
  check(commands.length <= 12,'Too many commands'); return {commands,requirePassing:bool(v.requirePassing),timeoutMs:integer(v.timeoutMs,1)};
}
/** Immutable assignment snapshot validator. @param {unknown} value @returns {AssignmentSnapshot} */
function assignment(value) { const v = record(value,['configRevision','configHash','policy','limits','verification']); return {configRevision:id(v.configRevision),configHash:hash(v.configHash),policy:externalValidation(() => validateTaskPolicy(v.policy),'stored'),limits:externalValidation(() => validateTaskLimits(v.limits),'stored'),verification:verification(v.verification)}; }
/** Explicit finalized-report validator; contracts.js intentionally keeps its helper private.
 * AR-01: a FinalizedReport is NOT an envelope; inspectedAt is not an inspection receipt.
 * Preserve the original payload and payloadHash domain, including its key order.
 * @param {unknown} value @returns {FinalizedReport}
 */
function finalized(value) {
  const v = record(value,['version','reportId','workerId','ownerSession','ownerEpoch','workerGeneration','nonce','sessionId','leaseId','attemptId','attemptNumber','planRevision','payload','payloadHash','createdAt','checkpoint','snapshotRef'],['inspectedAt']);
  const {checkpoint, snapshotRef, inspectedAt, ...envelope} = v;
  const r = externalValidation(() => validateReportEnvelope(envelope),'stored'), c = record(checkpoint,['path','checkpointHash','changed','verification','patchTruncated']);
  const results = list(c.verification).map(x => { const q = record(x,['name','source','passed','code','timedOut','output','artifact']); return {name:string(q.name,1000),source:choice(q.source,['controller-configured']),passed:bool(q.passed),code:q.code === null ? null : integer(q.code),timedOut:bool(q.timedOut),output:string(q.output,6000),artifact:string(q.artifact)}; });
  check(results.length <= 12,'Too many verification results');
  const result = {...r,checkpoint:{path:string(c.path),checkpointHash:hash(c.checkpointHash),changed:list(c.changed).map(nonemptyString),verification:results,patchTruncated:bool(c.patchTruncated)},snapshotRef:string(snapshotRef)};
  return Object.hasOwn(v,'inspectedAt') ? {...result,inspectedAt:integer(inspectedAt)} : result;
}
/** Retained legacy-held validator: never invent an identity, policy, or accounting.
 * Historical notice statuses intentionally have no mapping to observed.
 * @param {unknown} value @returns {LegacyTask}
 */
function legacy(value) {
  const v = record(value,['kind','taskId','identity','status','policy','limits','spending','pending','historyRefs']); choice(v.kind,['legacy-held']);
  const s = record(v.spending,['kind','costUsd','outputTokens','activeMs','turns','revisions','reports']); choice(s.kind,['unknown']);
  const spent = {kind:/** @type {const} */ ('unknown'),costUsd:s.costUsd === null ? null : amount(s.costUsd),outputTokens:s.outputTokens === null ? null : amount(s.outputTokens),activeMs:s.activeMs === null ? null : integer(s.activeMs),turns:s.turns === null ? null : integer(s.turns),revisions:s.revisions === null ? null : integer(s.revisions),reports:s.reports === null ? null : integer(s.reports)};
  const taskId = nullableId(v.taskId), i = v.identity === null ? null : identity(v.identity), historyRefs = list(v.historyRefs).map(x => text(x));
  check(historyRefs.length > 0 && unique(historyRefs).size === historyRefs.length && (!i || i.taskId === taskId),'Invalid legacy history');
  let pending = null;
  if (v.pending !== null) { const p = record(v.pending,['kind','reportId','reportRef']); pending = {kind:choice(p.kind,['question','blocked','checkpoint','final_review']),reportId:nullableId(p.reportId),reportRef:text(p.reportRef)}; }
  return {kind:'legacy-held',taskId,identity:i,status:choice(v.status,['held','cancelled']),policy:v.policy === null ? null : externalValidation(() => validateTaskPolicy(v.policy,'legacy.policy',{legacy:true}),'stored'),limits:v.limits === null ? null : externalValidation(() => validateTaskLimits(v.limits,'legacy.limits',{legacy:true}),'stored'),spending:spent,pending,historyRefs};
}
/** Scoped retained hold validator. @param {unknown} value @returns {HoldCause} */
function cause(value) { const v = record(value,['causeId','reason','scope','at','resolvedBy']), s = record(v.scope,['kind','id']); return {causeId:id(v.causeId),reason:choice(v.reason,HOLDS),scope:{kind:choice(s.kind,['root','task','operation','notice','report']),id:text(s.id)},at:integer(v.at),resolvedBy:nullableId(v.resolvedBy)}; }
/** Per-scope external lower bounds: omission is not complete zero. Keep the old
 * field order and absent input field in historical reconciliation commitments.
 * @param {unknown} value @returns {ReconciliationLedger} */
function ledger(value) { const v = record(value,scan(METRICS).filter(m => m !== 'inputTokens'),['inputTokens']); check(integer(v.unknownCostRequests) <= integer(v.requests),'Unknown-cost requests exceed requests'); return {costUsd:amount(v.costUsd),outputTokens:amount(v.outputTokens),requests:integer(v.requests),unknownCostRequests:integer(v.unknownCostRequests),activeMs:integer(v.activeMs),turns:integer(v.turns),revisions:integer(v.revisions),reports:integer(v.reports),repairAttempts:integer(v.repairAttempts),recoveryAttempts:integer(v.recoveryAttempts),attempts:integer(v.attempts),...(Object.hasOwn(v,'inputTokens') ? {inputTokens:amount(v.inputTokens)} : {})}; }
/** Explicit metric/scope completeness gap validator. @param {unknown} value @returns {AccountingGap} */
function gap(value) { const v = record(value,['gapId','metric','stepId','reason']); return {gapId:id(v.gapId),metric:choice(v.metric,METRICS),stepId:nullableId(v.stepId),reason:text(v.reason)}; }
/** Check known scope lower bounds without granting coverage to omitted fields.
 * Also used after deriving full ledgers, so mixed old/new scopes cannot hide a
 * per-step sum exceeding the reconciled lifetime bound.
 * @param {ReconciliationSnapshot} snapshot */
function accountingTotals(snapshot) {
  for (const metric of scan(METRICS)) {
    const entries = workValues(snapshot.steps), sum = scan(entries).reduce((total,s) => total + (s[metric] ?? 0),0), total = snapshot.lifetime[metric];
    const fractional = metric === 'costUsd' || metric === 'inputTokens' || metric === 'outputTokens';
    check(Number.isFinite(sum) && (fractional || Number.isSafeInteger(sum)),'Invalid per-step sum');
    if (total === undefined) continue; // No lifetime input claim to compare yet.
    const roundoff = Number.EPSILON * Math.max(sum,total) * (entries.length + 1);
    check(fractional ? sum <= total || sum - total <= roundoff : sum <= total,'Per-step known totals exceed lifetime');
  }
}
/** Accounting reconciliation snapshot validator. @param {unknown} value @returns {ReconciliationSnapshot} */
function accounting(value) {
  const v = record(value,['revision','at','lifetime','steps','gaps']); const steps = record(v.steps,workKeys(/** @type {object} */ (v.steps ?? {})));
  /** @type {Record<string,ReconciliationLedger>} */ const parsed = {};
  for (const [key,entry] of workEntries(steps)) parsed[id(key)] = ledger(entry);
  const gaps = list(v.gaps).map(gap); check(unique(scan(gaps).map(g => `${g.gapId}/${g.metric}/${g.stepId}`)).size === gaps.length,'Duplicate gap');
  const lifetime = ledger(v.lifetime);
  check(scan(gaps).every(g => g.stepId === null || !!parsed[g.stepId]),'Gap has unknown step scope');
  const snapshot = {revision:id(v.revision),at:integer(v.at),lifetime,steps:parsed,gaps};
  accountingTotals(snapshot);
  return snapshot;
}
/** Exact amendment whitelist; full effective policy/limits are revalidated on commit. @param {unknown} value */
function parseChange(value) {
  const v = record(value,['field','value']); const field = choice(v.field,['maxTurnsPerStep','taskTimeoutMs','activeStepTimeoutMs','maxQueuedTasks','maxQueuedReviews','maxReportsPerTask','maxReportBytes','maxAutomaticReportRepairs','maxAutomaticRecoveryAttempts','maxReportedCostUsd','maxOutputTokens','maxRevisions','maxRevisionsPerStep','summaryDetail','lifetimeDeadlineAt']);
  switch (field) {
    case 'summaryDetail': return {field,value:choice(v.value,['minimal','normal','detailed'])};
    case 'maxReportedCostUsd': return {field,value:v.value === null ? null : amount(v.value)};
    case 'maxOutputTokens': return {field,value:v.value === null ? null : integer(v.value)};
    case 'lifetimeDeadlineAt': return {field,value:integer(v.value)};
    case 'maxRevisions': case 'maxRevisionsPerStep': case 'maxTurnsPerStep': case 'taskTimeoutMs': case 'activeStepTimeoutMs': case 'maxQueuedTasks': case 'maxQueuedReviews': case 'maxReportsPerTask': case 'maxReportBytes': case 'maxAutomaticReportRepairs': case 'maxAutomaticRecoveryAttempts': return {field,value:integer(v.value)};
  }
  return unreachable(field);
}
/** Closed grant basis validator. @param {unknown} value */
function basis(value) {
  const v = record(value,['kind'],['requestId','reportId','decisionOperationId','reconciliationOperationId']); const kind = choice(v.kind,['dispatch','decision','recovery']);
  switch (kind) {
    case 'dispatch': record(v,['kind','requestId']); return {kind,requestId:id(v.requestId)};
    case 'decision': record(v,['kind','reportId','decisionOperationId']); return {kind,reportId:id(v.reportId),decisionOperationId:id(v.decisionOperationId)};
    case 'recovery': record(v,['kind','reconciliationOperationId']); return {kind,reconciliationOperationId:id(v.reconciliationOperationId)};
  }
  return unreachable(kind);
}
/** Bound independent worker fact validator. No prefix or cross-channel clock order. @param {unknown} value */
function workerFact(value) {
  const v = record(value,['stage','source','observationId','at'],['code','message','activationId','barrierId']);
  const w = {observationId:id(v.observationId),at:integer(v.at)}, kind = choice(v.stage,['sent','accepted','rejected','started','run-settled','settled']);
  switch (kind) {
    case 'sent': record(v,['stage','source','observationId','at']); return {...w,stage:kind,source:choice(v.source,['rpc-send'])};
    case 'accepted': record(v,['stage','source','observationId','at']); return {...w,stage:kind,source:choice(v.source,['rpc-ack'])};
    case 'rejected': record(v,['stage','source','observationId','at','code','message']); return {...w,stage:kind,source:choice(v.source,['rpc-ack']),code:text(v.code),message:text(v.message)};
    case 'started': case 'run-settled': record(v,['stage','source','observationId','at','activationId']); return {...w,stage:kind,source:choice(v.source,['worker-observation']),activationId:id(v.activationId)};
    case 'settled': record(v,['stage','source','observationId','at','barrierId']); return {...w,stage:kind,source:choice(v.source,['effect-settlement']),barrierId:id(v.barrierId)};
  }
  return unreachable(kind);
}
/** Independent notice fact validator. @param {unknown} value */
function mainFact(value) { const v = record(value,['stage','source','observationId','at']); const w = {observationId:id(v.observationId),at:integer(v.at)}, stage = choice(v.stage,['published','notified','observed']); switch(stage) { case 'published': return {...w,stage,source:choice(v.source,['notice-publication'])}; case 'notified': return {...w,stage,source:choice(v.source,['main-notification'])}; case 'observed': return {...w,stage,source:choice(v.source,['main-observation'])}; } return unreachable(stage); }
/** Closed reconciliation findings, including explicit human authorization for adoption.
 * Adapter ACK/activation correlation is a producer protocol, outside this kernel.
 * @param {unknown} value
 */
function finding(value) {
  const v = record(value,['kind'],['targetOperationId','outcome','artifact','artifactHash','taskId','expectedAccountingRevision','coveredObservationIds','resolvedGapIds','snapshot','reportId','producerIdentity','adoptedBy','barrierId','checkpointObservationId','authorization']);
  const kind = choice(v.kind,['command','publication','accounting','adopt-report']);
  switch(kind) {
    case 'command': record(v,['kind','targetOperationId','outcome']); return {kind,targetOperationId:id(v.targetOperationId),outcome:choice(v.outcome,['not-sent','rejected','unknown'])};
    case 'publication': record(v,['kind','targetOperationId','artifact','outcome','artifactHash']); return {kind,targetOperationId:id(v.targetOperationId),artifact:choice(v.artifact,['authority','notice']),outcome:choice(v.outcome,['present','absent','unknown']),artifactHash:v.artifactHash === null ? null : hash(v.artifactHash)};
    case 'accounting': record(v,['kind','taskId','expectedAccountingRevision','coveredObservationIds','resolvedGapIds','snapshot']); return {kind,taskId:id(v.taskId),expectedAccountingRevision:id(v.expectedAccountingRevision),coveredObservationIds:ids(v.coveredObservationIds),resolvedGapIds:ids(v.resolvedGapIds),snapshot:accounting(v.snapshot)};
    case 'adopt-report': { record(v,['kind','reportId','producerIdentity','adoptedBy','barrierId','checkpointObservationId','authorization']); const a = record(v.authorization,['authorizationId','principal','authorizedAt','reason']); return {kind,reportId:id(v.reportId),producerIdentity:identity(v.producerIdentity),adoptedBy:fence(v.adoptedBy),barrierId:id(v.barrierId),checkpointObservationId:nullableId(v.checkpointObservationId),authorization:{authorizationId:id(a.authorizationId),principal:choice(a.principal,['human']),authorizedAt:integer(a.authorizedAt),reason:text(a.reason)}}; }
  }
  return unreachable(kind);
}

/** Closed P0 PlanChangeV2/PlanLinkV2 adapter. Use this same scoped parser on
 * standalone and integrated paths; absent extensions never enter V1 hashes.
 * The shared common module has no maxPlanSteps member in this baseline: reuse
 * the existing dispatch schema's 32-ID cap, not a new or larger allowance.
 * @param {unknown} value */
function parsePlanChange(value) {
  const v = record(value,['change','planLink','planSettlement']);
  const c = record(v.change,['version','expected','next','remainingStepIds','introducedSteps','removedStepIds','current','supersedesDecisionOperationId']);
  check(c.version === 1,'Unsupported plan change version');
  const x = record(c.expected,['taskId','workflowId','workflowRevision','taskPlanRevision','workflowPlanRevision','planHash','currentStepId','reportId','reportHash','checkpointHash','grantOperationId','accountingRevision','budgetRevision','budgetHash','workflowBudgetRevision','workflowBudgetHash']);
  const expected = {taskId:id(x.taskId),workflowId:id(x.workflowId),workflowRevision:id(x.workflowRevision),taskPlanRevision:integer(x.taskPlanRevision,1),workflowPlanRevision:integer(x.workflowPlanRevision,1),planHash:hash(x.planHash),currentStepId:id(x.currentStepId),reportId:id(x.reportId),reportHash:hash(x.reportHash),checkpointHash:hash(x.checkpointHash),grantOperationId:id(x.grantOperationId),accountingRevision:id(x.accountingRevision),budgetRevision:id(x.budgetRevision),budgetHash:hash(x.budgetHash),workflowBudgetRevision:id(x.workflowBudgetRevision),workflowBudgetHash:hash(x.workflowBudgetHash)};
  const n = record(c.next,['taskPlanRevision','workflowPlanRevision']), next = {taskPlanRevision:integer(n.taskPlanRevision,1),workflowPlanRevision:integer(n.workflowPlanRevision,1)};
  check(next.taskPlanRevision === integer(expected.taskPlanRevision + 1,1) && next.workflowPlanRevision === integer(expected.workflowPlanRevision + 1,1),'Plan revisions must advance once');
  const remainingStepIds = ids(c.remainingStepIds), removedStepIds = ids(c.removedStepIds);
  const maximum = dispatchSchema.properties.steps.maxItems;
  check(remainingStepIds.length > 0 && remainingStepIds.length <= maximum && removedStepIds.length <= maximum,'Plan step bound');
  const introduced = list(c.introducedSteps); check(introduced.length <= maximum,'Introduced step bound');
  const introducedSteps = introduced.map(value => {
    const entry = record(value,['step','replaces']), s = record(entry.step,['id','title','instructions'],['acceptance']);
    externalValidation(() => validate(stepSchema,s),'schema');
    const step = {id:id(s.id),title:string(s.title,200),instructions:string(s.instructions,24000),...(Object.hasOwn(s,'acceptance') ? {acceptance:list(s.acceptance).map(a => string(a,2000))} : {})};
    const replaces = ids(entry.replaces); check(replaces.length <= maximum,'Replacement step bound');
    return {step,replaces};
  });
  check(unique(scan(introducedSteps).map(x => x.step.id)).size === introducedSteps.length && scan(introducedSteps).every(x => !scan(removedStepIds).includes(x.step.id)),'Introduced/removed ID conflict');
  const current = record(c.current,['kind'],['successorStepId']), kind = choice(current.kind,['keep','replace']);
  const selection = kind === 'keep' ? (record(current,['kind']),{kind}) : (record(current,['kind','successorStepId']),{kind,successorStepId:id(current.successorStepId)});
  const l = record(v.planLink,['activationId','intentId','intentHash','operationId','controlHash']), w = record(v.planSettlement,['observationId','at']);
  return {change:{version:1,expected,next,remainingStepIds,introducedSteps,removedStepIds,current:selection,supersedesDecisionOperationId:nullableId(c.supersedesDecisionOperationId)},planLink:{activationId:id(l.activationId),intentId:id(l.intentId),intentHash:hash(l.intentHash),operationId:id(l.operationId),controlHash:hash(l.controlHash)},planSettlement:{observationId:id(w.observationId),at:integer(w.at)}};
}

/** Validate event shape without attributing trust to syntactic source tags.
 * All V1 events have a workflow-lifetime receipt ID. Nested delivery facts retain
 * their own IDs and must use the same receipt/time as the enclosing observation.
 * @param {unknown} value @returns {TransitionEvent}
 */
function validateTransitionEvent(value) {
  if (!context) { inert(value); return parseEvent(value); }
  if (value !== null && typeof value === 'object' && parsedEvents.has(value)) return /** @type {TransitionEvent} */ (value);
  const captured = ensureLegacyInert(value, 'kernel.event', context);
  tree(captured);
  const event = freeze(parseEvent(captured));
  parsedEvents.add(event);
  return event;
}
/** Closed event-union parser. @param {unknown} value */
function parseEvent(value) {
  const raw = record(value,['kind','fence','at','observationId'],['source','operationId','taskId','request','requestHash','assignment','lifetimeDeadlineAt','intentKind','intentHash','storeRevision','identity','basis','accountingRevision','budgetRevision','checkpointObservationId','leaseId','grantOperationId','commandId','input','inputHash','barrierId','admissionClosedBy','coverage','admittedEffectIds','settledEffectIds','containedEffectIds','unknownEffectIds','sessionContained','reportId','finalized','verificationBindings','receiptId','requestId','replyId','checkpointHash','reader','scope','review','forOperationId','workspaceReservationId','reviewer','inspectionReceiptIds','continuationOperationId','noticeId','decisionOperationId','decisionHash','observation','participant','activationId','usageId','usage','stepId','counter','expectedBudgetRevision','beforeHash','authorization','changes','action','causeId','finding','evidenceIds','authorizationId','archive','coveredObservationIds','containmentBarrierIds','archiveObservation','sequence','command','next','report','failure','family','refreshOfObservationId','planChange']);
  const kind = choice(raw.kind,KINDS), base = {fence:fence(raw.fence),at:integer(raw.at),observationId:id(raw.observationId)};
  const common = ['kind','fence','at','observationId'];
  /** Exact branch keys, not a permissive event payload. @param {string[]} keys */
  const fields = keys => record(raw,[...common,...keys]);
  switch(kind) {
    case 'dispatch-requested': { const v = fields(['source','operationId','taskId','request','requestHash','assignment','lifetimeDeadlineAt']); const request = externalValidation(() => validateDispatch(v.request),'schema'); check(hash(v.requestHash) === payloadDigest(request),'Dispatch hash mismatch'); return {...base,kind,source:choice(v.source,['controller-dispatch']),operationId:id(v.operationId),taskId:id(v.taskId),request,requestHash:hash(v.requestHash),assignment:assignment(v.assignment),lifetimeDeadlineAt:v.lifetimeDeadlineAt === null ? null : integer(v.lifetimeDeadlineAt)}; }
    case 'intent-committed': {
      const intentKind = choice(raw.intentKind,['dispatch','decision','prompt','amendment','automatic-action','reconciliation','reset']);
      const v = fields(['source','operationId','intentKind','intentHash','storeRevision',...(intentKind === 'reset' ? ['archiveObservation'] : [])]);
      const commit = {...base,kind,source:choice(v.source,['storage']),operationId:id(v.operationId),intentHash:hash(v.intentHash),storeRevision:id(v.storeRevision)};
      if (intentKind !== 'reset') return {...commit,intentKind};
      // Separate storage observation for the archive artifact. storeRevision on
      // the outer commit still names only canonical state, not a multi-file commit.
      const a = record(v.archiveObservation,['observationId','at','archive','coveredObservationIds','storeRevision']);
      const archiveObservation = {observationId:id(a.observationId),at:integer(a.at),archive:artifact(a.archive),coveredObservationIds:ids(a.coveredObservationIds),storeRevision:id(a.storeRevision)};
      check(archiveObservation.at <= base.at && archiveObservation.observationId !== base.observationId,'Invalid archive observation');
      return {...commit,intentKind,archiveObservation};
    }
    case 'prepare-grant': {
      const v = record(raw,[...common,'source','operationId','identity','basis','accountingRevision','budgetRevision','checkpointObservationId'],['refreshOfObservationId']);
      return {...base,kind,source:choice(v.source,['controller-assignment']),operationId:id(v.operationId),identity:identity(v.identity),basis:basis(v.basis),accountingRevision:id(v.accountingRevision),budgetRevision:id(v.budgetRevision),checkpointObservationId:nullableId(v.checkpointObservationId),...(Object.hasOwn(v,'refreshOfObservationId') ? {refreshOfObservationId:id(v.refreshOfObservationId)} : {})};
    }
    case 'grant-committed': { const v = fields(['source','operationId','leaseId']); return {...base,kind,source:choice(v.source,['storage']),operationId:id(v.operationId),leaseId:token(v.leaseId)}; }
    case 'authority-published': { const v = fields(['source','operationId','leaseId']); return {...base,kind,source:choice(v.source,['authority-publication']),operationId:id(v.operationId),leaseId:token(v.leaseId)}; }
    case 'dispatch-prepared': { const v = fields(['source','operationId','grantOperationId','commandId','input']); return {...base,kind,source:choice(v.source,['controller-dispatch']),operationId:id(v.operationId),grantOperationId:id(v.grantOperationId),commandId:id(v.commandId),input:artifact(v.input)}; }
    case 'effects-reconciled': { const v = fields(['source','operationId','identity','barrierId','admissionClosedBy','coverage','admittedEffectIds','settledEffectIds','containedEffectIds','unknownEffectIds','sessionContained']); const admittedEffectIds = ids(v.admittedEffectIds), settledEffectIds = ids(v.settledEffectIds), containedEffectIds = ids(v.containedEffectIds), unknownEffectIds = ids(v.unknownEffectIds); const classified = [...scan(settledEffectIds),...scan(containedEffectIds),...scan(unknownEffectIds)]; check(scan(classified).every(x => scan(admittedEffectIds).includes(x)),'Unadmitted effect'); check(unique(classified).size === settledEffectIds.length + containedEffectIds.length + unknownEffectIds.length,'Effect classifications overlap'); return {...base,kind,source:choice(v.source,['effect-boundary']),operationId:id(v.operationId),identity:identity(v.identity),barrierId:id(v.barrierId),admissionClosedBy:id(v.admissionClosedBy),coverage:choice(v.coverage,['complete','unknown']),admittedEffectIds,settledEffectIds,containedEffectIds,unknownEffectIds,sessionContained:bool(v.sessionContained)}; }
    case 'checkpoint-finalized': { const v = fields(['source','reportId','finalized','barrierId','verificationBindings']); const report = finalized(v.finalized); check(report.reportId === id(v.reportId),'Finalized report ID mismatch'); const verificationBindings = list(v.verificationBindings).map(x => { const b = record(x,['commandIndex','resultIndex','inputSnapshotHash','outputSnapshotHash']); return {commandIndex:integer(b.commandIndex),resultIndex:integer(b.resultIndex),inputSnapshotHash:hash(b.inputSnapshotHash),outputSnapshotHash:hash(b.outputSnapshotHash)}; }); check(unique(scan(verificationBindings).map(b => b.commandIndex)).size === verificationBindings.length && unique(scan(verificationBindings).map(b => b.resultIndex)).size === verificationBindings.length,'Duplicate verification binding'); return {...base,kind,source:choice(v.source,['evidence-boundary']),reportId:id(v.reportId),finalized:report,barrierId:id(v.barrierId),verificationBindings}; }
    case 'evidence-receipt': {
      const v = record(raw,[...common,'source','receiptId','requestId','replyId','reportId','checkpointHash','reader','scope'],['review']);
      const s = record(v.scope,['kind'],['path']), k = choice(s.kind,['all','summary','patch','verification','file']); const scope = k === 'file' ? (record(s,['kind','path']),{kind:k,path:nonemptyString(s.path)}) : (record(s,['kind']),{kind:k});
      const reader = actor(v.reader);
      // Explicit additive actor-review branch. The closed ReviewerWitness binds the
      // supervisor activation/intent/report/checkpoint and the request/reply/receipt
      // artifact refs. Legacy receipts without `review` keep their exact prior
      // behavior; retention NEVER requires a producing settlement observation, and
      // T08 resolves the refs and proves the settlement/prefix/current-workflow map.
      const review = v.review === undefined ? undefined : reviewLink(v.review);
      if (review !== undefined) {
        check(reader.role === 'supervisor' && same(reader,review.actor),'Review linkage requires a matching supervisor reader');
        check(review.reportId === id(v.reportId) && review.checkpointHash === hash(v.checkpointHash),'Review report/checkpoint mismatch');
        // Intrinsic inspection relationships expressible in this schema, matching
        // the wire rules: logical IDs are distinct, the intent precedes its
        // request, and the request/reply/receipt artifacts and content hashes are
        // pairwise distinct. T08 resolves the actual content/ref correspondence.
        const receiptId = id(v.receiptId), requestId = id(v.requestId), replyId = id(v.replyId);
        check(requestId !== replyId && requestId !== receiptId && replyId !== receiptId,'Inspection logical IDs must be distinct');
        check(review.intentId !== requestId,'Inspection intent must precede its request');
        check(!same(review.request,review.reply) && !same(review.request,review.receipt) && !same(review.reply,review.receipt),'Inspection artifacts must be distinct');
        check(review.request.hash !== review.reply.hash && review.request.hash !== review.receipt.hash && review.reply.hash !== review.receipt.hash,'Inspection content hashes must be pairwise distinct');
      }
      return {...base,kind,source:choice(v.source,['inspection-boundary']),receiptId:id(v.receiptId),requestId:id(v.requestId),replyId:id(v.replyId),reportId:id(v.reportId),checkpointHash:hash(v.checkpointHash),reader,scope,...(review === undefined ? {} : {review})};
    }
    case 'checkpoint-current': { const v = fields(['source','reportId','checkpointHash','forOperationId','workspaceReservationId']); return {...base,kind,source:choice(v.source,['evidence-boundary']),reportId:id(v.reportId),checkpointHash:hash(v.checkpointHash),forOperationId:id(v.forOperationId),workspaceReservationId:id(v.workspaceReservationId)}; }
    case 'decide': {
      const source = choice(raw.source,['main-decision','supervisor-control']);
      const keys = ['source','operationId','input','inputHash','reviewer','inspectionReceiptIds','checkpointObservationId','continuationOperationId'];
      // Main keeps its exact legacy branch (no added field, unchanged intent hash).
      // 'supervisor-control' is a DISTINCT discriminant carrying the full closed
      // activation-bound ReviewerWitness; it is never relabelled as Main.
      const v = source === 'supervisor-control' ? record(raw,[...common,...keys,'review'],['planChange']) : fields(keys);
      const input = externalValidation(() => validateDecision(v.input),'schema');
      check(hash(v.inputHash) === payloadDigest(input),'Decision hash mismatch');
      const reviewer = actor(v.reviewer), inspectionReceiptIds = ids(v.inspectionReceiptIds);
      if (source === 'supervisor-control') {
        const planChange = Object.hasOwn(v,'planChange') ? parsePlanChange(v.planChange) : undefined;
        check(planChange === undefined || input.action === 'revise','Structural change requires supervisor revise');
        return {...base,kind,source:/** @type {const} */ ('supervisor-control'),operationId:id(v.operationId),input,inputHash:hash(v.inputHash),reviewer,inspectionReceiptIds,checkpointObservationId:nullableId(v.checkpointObservationId),continuationOperationId:nullableId(v.continuationOperationId),review:externalValidation(() => validateReviewerWitness(v.review,context),'contract'),...(planChange === undefined ? {} : {planChange})};
      }
      return {...base,kind,source:/** @type {const} */ ('main-decision'),operationId:id(v.operationId),input,inputHash:hash(v.inputHash),reviewer,inspectionReceiptIds,checkpointObservationId:nullableId(v.checkpointObservationId),continuationOperationId:nullableId(v.continuationOperationId)};
    }
    case 'notice-resolved': { const v = fields(['source','noticeId','reportId','decisionOperationId','decisionHash']); return {...base,kind,source:choice(v.source,['controller-workflow']),noticeId:id(v.noticeId),reportId:id(v.reportId),decisionOperationId:id(v.decisionOperationId),decisionHash:hash(v.decisionHash)}; }
    case 'worker-delivery': { const v = fields(['operationId','commandId','identity','inputHash','observation']); const observation = workerFact(v.observation); check(observation.at === base.at && observation.observationId === base.observationId,'Fact header mismatch'); return {...base,kind,operationId:id(v.operationId),commandId:id(v.commandId),identity:identity(v.identity),inputHash:hash(v.inputHash),observation}; }
    case 'main-delivery': { const v = fields(['noticeId','reportId','observation']); const observation = mainFact(v.observation); check(observation.at === base.at && observation.observationId === base.observationId,'Fact header mismatch'); return {...base,kind,noticeId:id(v.noticeId),reportId:id(v.reportId),observation}; }
    case 'usage-observed': { const v = fields(['source','taskId','stepId','participant','activationId','usageId','usage']); const usage = externalValidation(() => validateUsageObservation(v.usage),'usage'); check(usage !== null && usage.observedAt <= base.at,'Missing/future usage'); return {...base,kind,source:choice(v.source,['trusted-accounting']),taskId:id(v.taskId),stepId:nullableId(v.stepId),participant:actor(v.participant),activationId:id(v.activationId),usageId:id(v.usageId),usage}; }
    case 'counter-observed': { const v = fields(['source','taskId','stepId','operationId','counter']); const c = record(v.counter,['kind'],['turnId','intervalId','clockId','startTick','endTick','activationId']); const k = choice(c.kind,['turn','active-interval']); const counter = k === 'turn' ? (record(c,['kind','turnId']),{kind:k,turnId:id(c.turnId)}) : (record(c,['kind','intervalId','clockId','startTick','endTick','activationId']),{kind:k,intervalId:id(c.intervalId),clockId:id(c.clockId),startTick:integer(c.startTick),endTick:integer(c.endTick),activationId:id(c.activationId)}); if (counter.kind === 'active-interval') check(counter.endTick >= counter.startTick,'Reversed interval'); return {...base,kind,source:choice(v.source,['trusted-accounting']),taskId:id(v.taskId),stepId:id(v.stepId),operationId:id(v.operationId),counter}; }
    case 'budget-evaluated': { const v = fields(['source','taskId','accountingRevision','budgetRevision']); return {...base,kind,source:choice(v.source,['trusted-clock']),taskId:id(v.taskId),accountingRevision:id(v.accountingRevision),budgetRevision:id(v.budgetRevision)}; }
    case 'amendment-proposed': { const v = fields(['source','operationId','taskId','expectedBudgetRevision','beforeHash','authorization','changes']); const a = record(v.authorization,['authorizationId','principal','authorizedAt','reason','changesHash']); const changes = list(v.changes).map(parseChange); check(changes.length > 0 && unique(scan(changes).map(c => c.field)).size === changes.length,'Duplicate/empty amendment'); check(hash(a.changesHash) === payloadDigest(changes) && integer(a.authorizedAt) <= base.at,'Amendment authorization mismatch'); return {...base,kind,source:choice(v.source,['user-command']),operationId:id(v.operationId),taskId:id(v.taskId),expectedBudgetRevision:id(v.expectedBudgetRevision),beforeHash:hash(v.beforeHash),authorization:{authorizationId:id(a.authorizationId),principal:choice(a.principal,['human']),authorizedAt:integer(a.authorizedAt),reason:text(a.reason),changesHash:hash(a.changesHash)},changes}; }
    case 'automatic-action-prepared': { const v = fields(['source','operationId','taskId','action','reportId','causeId','input']); return {...base,kind,source:choice(v.source,['controller-workflow']),operationId:id(v.operationId),taskId:id(v.taskId),action:choice(v.action,['report-repair','recovery']),reportId:nullableId(v.reportId),causeId:id(v.causeId),input:artifact(v.input)}; }
    case 'reconciliation-proposed': { const v = fields(['source','operationId','finding','evidenceIds']); return {...base,kind,source:choice(v.source,['trusted-reconciliation']),operationId:id(v.operationId),finding:finding(v.finding),evidenceIds:ids(v.evidenceIds)}; }
    case 'reset-requested': { const v = fields(['source','operationId','authorizationId','archive','coveredObservationIds','containmentBarrierIds']); return {...base,kind,source:choice(v.source,['user-command']),operationId:id(v.operationId),authorizationId:id(v.authorizationId),archive:artifact(v.archive),coveredObservationIds:ids(v.coveredObservationIds),containmentBarrierIds:ids(v.containmentBarrierIds)}; }
    case 'lifecycle': { const v = fields(['source','sequence','command']); return {...base,kind,source:choice(v.source,['user-command']),sequence:integer(v.sequence,1),command:choice(v.command,['stop','disable','pause','start','enable','resume','cancel'])}; }
    case 'owner-replaced': { const v = fields(['source','next']); return {...base,kind,source:choice(v.source,['ownership']),next:fence(v.next)}; }
    case 'report': { const v = fields(['source','report','noticeId']); const report = externalValidation(() => validateReportEnvelope(v.report),'stored'); check(base.at >= report.createdAt,'Report before creation'); return {...base,kind,source:choice(v.source,['worker-report']),report,noticeId:id(v.noticeId)}; }
    case 'runtime': { const v = fields(['observation']); const o = record(v.observation,['source','sequence','at','status']); check(integer(o.at) === base.at,'Runtime time mismatch'); return {...base,kind,observation:{source:choice(o.source,['worker-runtime']),sequence:integer(o.sequence,1),at:integer(o.at),status:choice(o.status,['unknown','idle','busy','stopped'])}}; }
    case 'failure': { const v = fields(['failure']); const f = record(v.failure,['source','operationId','message','observationId','at']); check(integer(f.at) === base.at && id(f.observationId) === base.observationId,'Failure header mismatch'); return {...base,kind,failure:{source:choice(f.source,['storage','rpc','effect-boundary','main-notification']),operationId:id(f.operationId),message:text(f.message),observationId:id(f.observationId),at:integer(f.at)}}; }
    case 'unsupported': { const v = fields(['source','family']); return {...base,kind,source:choice(v.source,['controller']),family:choice(v.family,['dispatch','continuation','checkpoint','decision','notice-resolution','reset','usage','counter','policy-amendment','reconciliation'])}; }
  }
  return unreachable(kind);
}

/** Compile-time exhaustiveness, never a permissive fallback. @param {never} value @returns {never} */
function unreachable(value) { throw new Error(`Unreachable: ${String(value)}`); }
/** Stable structural equality; payload hashes separately preserve original input order.
 * @param {unknown} a @param {unknown} b @returns {boolean}
 */
function same(a,b) {
  work(1);
  if (typeof a === 'string') work(a.length);
  if (typeof b === 'string') work(b.length);
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x,i) => same(x,b[i]));
  const x = /** @type {Record<string,unknown>} */ (a), y = /** @type {Record<string,unknown>} */ (b);
  return workKeys(x).length === workKeys(y).length && workKeys(x).every(k => Object.hasOwn(y,k) && same(x[k],y[k]));
}
/** Pure digest matching the contract's original JSON serialization domain.
 * No canonical key sorting of public request/decision/report payloads.
 * @param {unknown} value @returns {string}
 */
function payloadDigest(value) { return createHash('sha256').update(serialized(value)).digest('hex'); }
/** Preserve original-order V1 bytes. Preflight visits pay before allocation;
 * encoded characters pay before UTF-8/hash/parse work. No V2 canonicalization.
 * @param {unknown} value @returns {string} */
function serialized(value) { tree(value); const text = JSON.stringify(value); work(text.length); return text; }
/** Fresh workflow only: zero is known at genesis, never substituted for a gap. @returns {Ledger} */
function zeroLedger() { return {costUsd:0,inputTokens:0,outputTokens:0,requests:0,unknownCostRequests:0,activeMs:0,turns:0,revisions:0,reports:0,repairAttempts:0,recoveryAttempts:0,attempts:0}; }
/** Cloned immutable grant/accounting snapshots; input already inert. @template T @param {T} value @returns {T} */
function copy(value) { const text = serialized(value); work(text.length); return JSON.parse(text); }
/** Validate additions/overflow rather than saturating or decreasing counters. @param {Ledger} l @param {Metric} metric @param {number} value */
function add(l,metric,value) { const n = l[metric] + value; if (metric === 'costUsd' || metric === 'inputTokens' || metric === 'outputTokens') amount(n); else integer(n); l[metric] = n; }
/** Input coverage is reported/reconciled, but TaskLimits has no input limit.
 * Preserve every pre-existing accounting admission gate, excluding only input.
 * @param {AccountingSnapshot} a */
function admissionUnknown(a) { return scan(a.gaps).some(g => g.metric !== 'inputTokens'); }
/** Charge the lifetime and (when attributed) persistent step ledger exactly once.
 * @param {CurrentTask} t @param {Metric} metric @param {number} value @param {string|null} stepId @param {Witness} e
 */
function charge(t,metric,value,stepId,e) { add(t.accounting.lifetime,metric,value); if (stepId !== null) { invariant((!t.stepCatalog || t.stepCatalog[stepId]) && t.accounting.steps[stepId],'Unknown accounting step'); add(t.accounting.steps[stepId],metric,value); } t.accounting.revision = e.observationId; t.accounting.at = Math.max(t.accounting.at,e.at); }
/** A group has no copied balance. Original member ledgers (including retired
 * members) are counted once; their gaps stay in the full accounting snapshot.
 * Charges always keep their original attribution, even after replacement/split.
 * @param {CurrentTask} t @param {string} stepId @returns {Ledger} */
function lineageLedger(t,stepId) {
  if (!t.stepCatalog) { invariant(t.accounting.steps[stepId],'Unknown accounting step'); return t.accounting.steps[stepId]; }
  const entry = t.stepCatalog[stepId]; invariant(entry,'Unknown lineage step');
  const total = zeroLedger();
  for (const member of workValues(t.stepCatalog)) if (member.lineageId === entry.lineageId) {
    const ledger = t.accounting.steps[member.step.id]; invariant(ledger,'Missing lineage ledger');
    for (const metric of scan(METRICS)) add(total,metric,ledger[metric]);
  }
  return total;
}
/** No reset/detach frees lifetime IDs. The journal's task catalogues are the
 * registry, so forks/replay need no second mutable ID index.
 * V1 dispatch IDs remain task-local; structural introductions must be fresh
 * across the workflow. Repeated dispatch IDs do not replenish the distinct bound.
 * @param {Projection} p @param {string[]} introduced @param {boolean} [fresh] */
function lifetimeSteps(p,introduced,fresh = true) {
  const retained = unique(workValues(p.tasks).flatMap(t => workKeys(t.accounting.steps)));
  check(!fresh || scan(introduced).every(key => !retained.has(key)),'Lifetime step ID reused');
  check(retained.size + scan(introduced).filter(key => !retained.has(key)).length <= dispatchSchema.properties.steps.maxItems,'Workflow lifetime step ID bound');
}
/** Supersession is permanent because accepted intents are never deleted, even
 * when their later commitment is held. Merely held proposals are not tombstones.
 * @param {Projection} p @param {string} operationId */
function superseded(p,operationId) { return workValues(p.intents).some(i => i.kind === 'decide' && i.source === 'supervisor-control' && i.planChange?.change.supersedesDecisionOperationId === operationId); }
/** Recompute the old hold-list view as a projection, not an authority. @param {Projection} p */
function holds(p) {
  const unresolved = scan(p.holdCauses).filter(c => c.resolvedBy === null);
  const reasons = unique(scan(unresolved).map(c => c.reason));
  work(reasons.size); p.holds = [...reasons];
}
/** Retain a scoped cause using an existing witness/operation ID, never allocate IDs.
 * @param {Projection} p @param {string} causeId @param {HoldReason} reason @param {HoldCause['scope']} scope @param {number} at
 */
function hold(p,causeId,reason,scope,at) {
  const old = scan(p.holdCauses).find(c => c.causeId === causeId && c.reason === reason && same(c.scope,scope));
  if (!old) p.holdCauses.push({causeId,reason,scope,at,resolvedBy:null});
  else invariant(old.resolvedBy === null,'Resolved cause cannot recur under same identity');
  holds(p);
}
/** Only the named scope/reason is satisfied; unrelated causes survive.
 * @param {Projection} p @param {HoldReason} reason @param {HoldCause['scope']} scope @param {string} by
 */
function resolve(p,reason,scope,by) { for (const c of scan(p.holdCauses)) if (c.resolvedBy === null && c.reason === reason && same(c.scope,scope)) c.resolvedBy = by; holds(p); }
/** Complete admission-set coverage, including explicitly identified containment.
 * Unknown coverage is never promoted by an empty unknown array.
 * @param {EventOf<'effects-reconciled'>|undefined} b
 */
function complete(b) { return !!b && b.coverage === 'complete' && b.unknownEffectIds.length === 0 && scan(b.admittedEffectIds).every(x => scan(b.settledEffectIds).includes(x) || scan(b.containedEffectIds).includes(x)); }
/** Scoped budget/capacity causes on detached tasks stay retained without becoming
 * mutable root controls for another task. Physical operation/notice uncertainty and
 * root stop/disable causes still block the single writer.
 * Incomplete accounting blocks future admission, not an already-running turn.
 * @param {Projection} p @param {string} taskId @param {boolean} [running]
 */
function admissionHeld(p,taskId,running = false) { return scan(p.holdCauses).some(c => c.resolvedBy === null && !requestHold(c) && !(running && c.reason === 'unknown-accounting') && (c.scope.kind !== 'task' || c.scope.id === taskId)); }
/** Refusal of a proposal is not revocation of admitted work. @param {HoldCause} c */
function requestHold(c) { return (c.reason === 'capacity' || c.reason === 'evidence') && (c.scope.kind === 'operation' || c.scope.kind === 'report'); }
/** Only the latest grant barrier can be used. Later uncertainty invalidates an
 * earlier complete witness, including for finalization, adoption and reset.
 * @param {Projection} p @param {string} operationId
 */
function barrierFor(p,operationId) { const key = p.grants[operationId]?.latestBarrierId, b = key ? p.barriers[key] : undefined; return complete(b) ? b : undefined; }
/** Closure is absorbing. Physical uncertainty survives task/decision termination.
 * @param {Projection} p @param {Grant} g @param {Witness} e @param {Closure['reason']} reason
 */
function closeGrant(p,g,e,reason) {
  // The receipt order closes admission. A late independent channel timestamp must
  // not cause contradictory execution evidence to be dropped instead of retained.
  if (g.phase !== 'closed') { g.phase = 'closed'; g.closure = {at:e.at,reason,observationId:e.observationId}; }
  if (g.publication !== null && !barrierFor(p,g.operationId)) hold(p,e.observationId,'uncertain-effect',{kind:'operation',id:g.operationId},e.at);
  const task = p.tasks[g.identity.taskId];
  if (task && admissionUnknown(task.accounting)) hold(p,e.observationId,'unknown-accounting',{kind:'task',id:task.taskId},e.at);
  for (const w of workValues(p.promptDeliveries)) if (w.intent.grantOperationId === g.operationId && p.commitments[w.intent.operationId] && !w.reconciledBy && !scan(w.observations).some(o => o.observation.stage === 'accepted' || o.observation.stage === 'rejected')) hold(p,w.intent.operationId,'uncertain-delivery',{kind:'operation',id:w.intent.operationId},e.at);
}
/** Close only live admission; never rewrite closed operations. @param {Projection} p @param {Witness} e @param {Closure['reason']} reason */
function closeCurrent(p,e,reason) { if (p.task?.kind === 'current' && p.task.currentGrantOperationId) closeGrant(p,p.grants[p.task.currentGrantOperationId],e,reason); }
/** Conservatively retain an explicit unsupported/blocked form. @param {Projection} p @param {TransitionEvent} e @param {HoldReason} [reason] */
function blocked(p,e,reason = 'unsupported') {
  /** @type {HoldCause['scope']} */
  const scope = (reason === 'capacity' || reason === 'evidence')
    ? e.kind === 'checkpoint-finalized' ? {kind:'report',id:e.reportId} : 'operationId' in e ? {kind:'operation',id:e.operationId} : {kind:'operation',id:e.observationId}
    : (reason === 'budget' || reason === 'unknown-accounting') && p.task?.kind === 'current' ? {kind:'task',id:p.task.taskId}
    : {kind:'root',id:p.fence.workerId};
  hold(p,e.observationId,reason,scope,e.at);
  if (reason !== 'capacity' && reason !== 'evidence') closeCurrent(p,e,reason);
  p.outcome = {kind:'hold',reason:reason === 'unsupported' ? 'unsupported-family' : 'admission-held'};
}
/** A current-task lookup never fabricates legacy identity. @param {Projection} p @param {string} taskId @returns {CurrentTask} */
function current(p,taskId) { check(p.task?.kind === 'current' && p.task.taskId === taskId,'No matching current task'); return p.task; }
/** Commit the full canonical parsed intent, including assignment/evidence metadata.
 * Public requestHash/inputHash remain separately retained in their original domains;
 * an input/artifact hash alone is not a commitment to the entire immutable intent.
 * @param {Intent} e @returns {{kind:EventOf<'intent-committed'>['intentKind'], hash:string}}
 */
function intentRef(e) {
  switch(e.kind) {
    case 'dispatch-requested': return {kind:'dispatch',hash:payloadDigest(e)};
    case 'decide': return {kind:'decision',hash:payloadDigest(e)};
    case 'dispatch-prepared': return {kind:'prompt',hash:payloadDigest(e)};
    case 'amendment-proposed': return {kind:'amendment',hash:payloadDigest(e)};
    case 'automatic-action-prepared': return {kind:'automatic-action',hash:payloadDigest(e)};
    case 'reconciliation-proposed': return {kind:'reconciliation',hash:payloadDigest(e)};
    case 'reset-requested': return {kind:'reset',hash:payloadDigest(e)};
  }
  return unreachable(e);
}
/** Commitment evidence is not present-fence readiness. Control changes can revoke
 * an uncommitted consequence without deleting its immutable candidate/receipt.
 * @param {Projection} p @param {Intent} i @param {TransitionEvent[]} history
 */
function intentReady(p,i,history) {
  if (!same(i.fence,p.fence) || superseded(p,i.operationId)) return false;
  const admits = i.kind === 'dispatch-requested' || i.kind === 'dispatch-prepared' || i.kind === 'automatic-action-prepared' || (i.kind === 'decide' && i.input.action !== 'cancel');
  if (!admits) return true;
  const index = scan(history).findIndex(e => e.observationId === i.observationId);
  return !scan(scan(history).slice(index + 1)).some(e => e.kind === 'lifecycle' && e.command === 'cancel')
    && !scan(p.holdCauses).some(c => c.resolvedBy === null && c.scope.kind === 'root' && ['paused','stopped','disabled','interrupted'].includes(c.reason));
}
/** Reject immutable intent identity collisions even after the live slot is reset.
 * @param {Projection} p @param {Intent} e @returns {boolean}
 */
function retainIntent(p,e) { const old = p.intents[e.operationId]; if (old) { check(same(old,e),'Conflicting intent'); p.outcome = {kind:'noop',reason:'duplicate'}; return false; } check(!p.grants[e.operationId],'Operation ID already a grant'); p.intents[e.operationId] = e; return true; }
/** All relevant admission limits; wall-clock remains anchored at dispatch commitment.
 * Active time is a separate per-step monotonic ledger, never wall-clock subtraction.
 * @param {CurrentTask} t @param {number} at
 */
function exhausted(t,at) {
  const l = t.limits, a = t.accounting.lifetime, s = lineageLedger(t,t.steps[t.stepIndex].id);
  return (l.taskTimeoutMs !== undefined && at - t.assignedAt >= l.taskTimeoutMs) || (t.lifetimeDeadlineAt !== null && at >= t.lifetimeDeadlineAt)
    || s.activeMs >= l.activeStepTimeoutMs || (l.maxTurnsPerStep !== undefined && s.turns >= l.maxTurnsPerStep) || a.reports >= l.maxReportsPerTask
    || a.revisions > t.policy.maxRevisions || s.revisions > t.policy.maxRevisionsPerStep
    || a.repairAttempts > l.maxAutomaticReportRepairs || a.recoveryAttempts > l.maxAutomaticRecoveryAttempts
    || (l.maxReportedCostUsd !== null && a.costUsd >= l.maxReportedCostUsd) || (l.maxOutputTokens !== null && a.outputTokens >= l.maxOutputTokens);
}
/** Known exhaustion revokes admission; incomplete lower-bound accounting does not
 * by itself revoke an activation already admitted. Detached task evidence cannot
 * close an unrelated current task merely for exhausting its own historical budget.
 * @param {Projection} p @param {CurrentTask} t @param {Witness} e
 */
function enforceKnownBudget(p,t,e) {
  if (!exhausted(t,e.at)) return;
  hold(p,e.observationId,'budget',{kind:'task',id:t.taskId},e.at);
  if (p.task === t) closeCurrent(p,e,'budget');
  p.outcome = {kind:'hold',reason:'admission-held'};
}
/** Effective budget hash excludes historical consumption; deadline extension is explicit.
 * @param {CurrentTask} t
 */
function budgetHash(t) { return payloadDigest({policy:t.policy,limits:t.limits,lifetimeDeadlineAt:t.lifetimeDeadlineAt}); }
/** Full report/attempt/step binding, including historical producer fence.
 * @param {ReportEnvelope} r @param {Grant} g
 */
function reportBound(r,g) { const i = g.identity, f = i.fence; return r.workerId === f.workerId && r.ownerSession === f.ownerSession && r.ownerEpoch === f.ownerEpoch && r.workerGeneration === f.workerGeneration && r.sessionId === f.sessionId && r.nonce === f.nonce && r.attemptId === i.attemptId && r.attemptNumber === i.attemptNumber && r.leaseId === i.leaseId && r.planRevision === i.planRevision && r.payload.taskId === i.taskId && r.payload.stepId === g.stepId; }
/** Scoped checkpoint-current evidence, never a globally reusable freshness bit.
 * @param {Projection} p @param {string|null} observationId @param {string} reportId @param {string} operationId
 */
function checkpointFor(p,observationId,reportId,operationId) { const c = observationId === null ? undefined : p.checkpoints[observationId], r = p.reports[reportId]; return !!c && r?.content.kind === 'finalized' && c.reportId === reportId && c.forOperationId === operationId && c.checkpointHash === r.content.report.checkpoint.checkpointHash && same(c.fence,p.fence); }
/** Evidence readiness is a modeled prerequisite, not proof of public provenance.
 * Bounded V1 requires an all-scope receipt; partial receipts remain retained.
 * @param {Projection} p @param {EventOf<'decide'>} e @param {RetainedReport} r
 */
function approvalReady(p,e,r) { return r.content.kind === 'finalized' && e.input.checkpointHash === r.content.report.checkpoint.checkpointHash && checkpointFor(p,e.checkpointObservationId,r.envelope.reportId,e.operationId) && scan(e.inspectionReceiptIds).some(key => { const receipt = p.evidence[key]; return receipt && receipt.reportId === r.envelope.reportId && receipt.checkpointHash === e.input.checkpointHash && receipt.scope.kind === 'all' && same(receipt.reader,e.reviewer); }); }
/** Reviewer-branch readiness. Main keeps its exact legacy role predicate, so no
 * role check is loosened globally and a supervisor is never relabelled as Main.
 * The supervisor branch binds the closed reviewer witness to the retained
 * supervisor evidence receipt(s) on activation/workflow/intent/report/checkpoint
 * and the request/reply/receipt artifact refs, so one activation's evidence can
 * never authorize another even when session/model match. The kernel checks only
 * what it can prove intrinsically or from its own retained prefix; T08 resolves
 * the artifact refs to retained inspection contents, reads the logical request/
 * reply/receipt IDs from those contents and proves the producing-activation
 * settlement prior prefix. Witness fields assert facts, never provenance.
 * @param {Projection} p @param {EventOf<'decide'>} e @param {RetainedReport} r
 */
function reviewerReady(p,e,r) {
  if (e.source === 'main-decision') return e.reviewer.role === 'main';
  const review = e.review;
  if (e.reviewer.role !== 'supervisor' || !same(e.reviewer,review.actor) || review.profile !== 'supervisor-restricted') return false;
  // An unknown supervisor model is representable but is never decision-ready.
  // Never invent a model/session, and never compare this identity to the
  // implementer generation/model/session. T08 proves the actual selected model.
  if (e.reviewer.model === null) return false;
  if (review.reportId !== r.envelope.reportId || review.reportHash !== r.envelope.payloadHash) return false;
  if (r.content.kind === 'finalized' && review.checkpointHash !== r.content.report.checkpoint.checkpointHash) return false;
  if (review.settlement.at > e.at) return false;
  // A supervisor decision needs an actual retained receipt matching the shared
  // settlement-free linkage; an empty/vacuous all-of predicate is not readiness.
  // All listed receipts keep their existing retention and linking checks.
  if (e.inspectionReceiptIds.length === 0) return false;
  const link = reviewLinkOf(review);
  return scan(e.inspectionReceiptIds).every(key => {
    const receipt = p.evidence[key];
    return !!receipt && !!receipt.review && same(receipt.review,link) && receipt.reportId === review.reportId && receipt.checkpointHash === review.checkpointHash;
  });
}
/** Decide exactly one logical outcome, without mutating the plan revision.
 * @param {CurrentTask} t @param {RetainedReport} r @param {EventOf<'decide'>} e @returns {KernelDecision['outcome']}
 */
function decisionOutcome(t,r,e) { const action = e.input.action; switch(action) { case 'cancel': return 'cancel'; case 'answer': case 'revise': return 'continue'; case 'approve': if (r.envelope.payload.kind === 'final_review') return 'complete'; if (r.envelope.payload.stepComplete === false) return 'continue'; return t.stepIndex === t.steps.length - 1 ? 'complete' : 'advance'; } return unreachable(action); }

/** Materialize a committed dispatch without giving queued work an attempt identity.
 * @param {Projection} p @param {EventOf<'dispatch-requested'>} d @param {EventOf<'intent-committed'>} c
 */
function newTask(p,d,c) {
  lifetimeSteps(p,scan(d.request.steps).map(s => s.id),false);
  /** @type {Record<string,Ledger>} */ const steps = {};
  for (const s of scan(d.request.steps)) steps[s.id] = zeroLedger();
  /** @type {CurrentTask} */
  const t = {kind:'current',taskId:d.taskId,identity:null,status:'assigned',dispatchOperationId:d.operationId,steps:copy(d.request.steps),stepIndex:0,planRevision:1,currentGrantOperationId:null,obligation:null,cancelledContinuations:[],genesis:copy(d.assignment),policy:copy(d.assignment.policy),limits:copy(d.assignment.limits),verification:copy(d.assignment.verification),budgetRevision:d.assignment.configRevision,budgetHash:'',amendments:[],accounting:{revision:c.observationId,at:c.at,lifetime:zeroLedger(),steps,gaps:[]},assignedAt:c.at,lifetimeDeadlineAt:d.lifetimeDeadlineAt};
  t.budgetHash = budgetHash(t); p.tasks[t.taskId] = t; return t;
}
/** Validate required verification against immutable configured command indices and
 * checkpoint snapshot hashes. An empty result set never covers required commands.
 * @param {CurrentTask} t @param {EventOf<'checkpoint-finalized'>} e
 */
function verificationReady(t,e) {
  const c = e.finalized.checkpoint;
  if (!scan(e.verificationBindings).every(b => {
    const command = t.verification.commands[b.commandIndex], result = c.verification[b.resultIndex];
    return command && result && command.name === result.name && b.inputSnapshotHash === c.checkpointHash && b.outputSnapshotHash === c.checkpointHash;
  })) return false;
  return !t.verification.requirePassing || scan(t.verification.commands).every((command,index) => {
    const b = scan(e.verificationBindings).find(x => x.commandIndex === index), r = b && c.verification[b.resultIndex];
    return !!r && r.name === command.name && r.passed && r.code === 0 && !r.timedOut;
  });
}
/** Candidate and commitment share the same readiness checks; no report consumption
 * at proposal time. Reviewer identity is separate from immutable report producer.
 * @param {Projection} p @param {EventOf<'decide'>} e
 */
function decisionReady(p,e) {
  const t = p.task, r = p.reports[e.input.reportId];
  if (superseded(p,e.operationId) || !same(e.fence,p.fence) || !r || t?.kind !== 'current' || t.taskId !== e.input.taskId || e.input.workerId !== p.fence.workerId || !reviewerReady(p,e,r) || e.reviewer.ownerSession !== p.fence.ownerSession || e.reviewer.ownerEpoch !== p.fence.ownerEpoch) return false;
  if (t.obligation?.kind !== 'report' || t.obligation.reportId !== e.input.reportId || t.status === 'completed' || (t.status === 'cancelled' && e.input.action !== 'cancel')) return false;
  if (e.input.action !== 'cancel' && !same(r.producerIdentity.fence,p.fence) && !workValues(p.intents).some(i => i.kind === 'reconciliation-proposed' && i.finding.kind === 'adopt-report' && i.finding.reportId === e.input.reportId && same(i.finding.adoptedBy,p.fence) && p.commitments[i.operationId])) return false;
  if (e.input.action !== 'cancel' && (r.content.kind !== 'finalized' || !barrierFor(p,r.grantOperationId) || scan(p.holdCauses).some(c => c.resolvedBy === null && c.scope.kind === 'root' && ['paused','stopped','disabled','interrupted'].includes(c.reason)))) return false;
  if (e.input.action === 'answer' && r.envelope.payload.kind !== 'question') return false;
  if (e.input.action === 'approve' && (!['checkpoint','final_review'].includes(r.envelope.payload.kind) || !approvalReady(p,e,r))) return false;
  if (e.input.action === 'revise' && (t.accounting.lifetime.revisions >= t.policy.maxRevisions || lineageLedger(t,r.envelope.payload.stepId).revisions >= t.policy.maxRevisionsPerStep)) return false;
  if (!scan(e.inspectionReceiptIds).every(key => p.evidence[key]?.reportId === e.input.reportId)) return false;
  const outcome = decisionOutcome(t,r,e);
  if (outcome === 'cancel' || outcome === 'complete') return e.continuationOperationId === null;
  return e.continuationOperationId !== null && e.continuationOperationId !== e.operationId && !p.grants[e.continuationOperationId] && !p.intents[e.continuationOperationId] && !workValues(p.decisions).some(d => d.candidate.continuationOperationId === e.continuationOperationId);
}
/** Validate and build an isolated replacement task, never mutate the live plan.
 * Actor control bodies/activation registry/workflow budget amendments are not
 * present in the kernel journal. Authenticating the initial workflow counters
 * and budget coordinates, plan-before-review production, and real native
 * settlement is deliberately unsupported here (P0 2.3's aggregate gate), just
 * like authenticating ReviewerWitness today. These are non-authorizing modeled
 * coordinates, not proof. Once pinned by a retained candidate/commit they cannot
 * be silently changed here; workflow-only amendments/replanning need aggregate
 * integration, not an inferred kernel update. Main and plain revise never use
 * this branch.
 * @param {Projection} p @param {CurrentTask} t @param {EventOf<'decide'>} e
 * @returns {CurrentTask|null} */
function structuralNext(p,t,e) {
  if (e.source !== 'supervisor-control' || e.planChange === undefined) return null;
  const {change,planLink,planSettlement} = e.planChange, x = change.expected;
  // Before the first structural commit, V1's unchanged full steps array IS the
  // catalog. Materialize its separate projection only on structural commitment,
  // preserving old full-model projections as well as absent-key intent hashes.
  /** @type {Record<string,CatalogEntry>} */
  const catalog = t.stepCatalog ?? Object.fromEntries(scan(t.steps).map(step => [step.id,{step:copy(step),replaces:[],lineageId:step.id,retiredBy:null}]));
  const r = p.reports[e.input.reportId], g = p.grants[x.grantOperationId];
  check(e.input.action === 'revise' && r?.content.kind === 'finalized','Structural change requires finalized revise');
  check(x.taskId === t.taskId && x.reportId === e.input.reportId && x.reportHash === r.envelope.payloadHash && x.checkpointHash === r.content.report.checkpoint.checkpointHash,'Structural report conflict');
  check(x.currentStepId === t.steps[t.stepIndex].id && x.currentStepId === r.envelope.payload.stepId && x.grantOperationId === r.grantOperationId && g?.stepId === x.currentStepId && g.identity.planRevision === t.planRevision && g.phase === 'closed' && t.currentGrantOperationId === g.operationId,'Structural current/grant conflict');
  check(x.taskPlanRevision === t.planRevision && x.accountingRevision === t.accounting.revision && x.budgetRevision === t.budgetRevision && x.budgetHash === t.budgetHash,'Structural task snapshot conflict');
  check(x.workflowId === e.review.workflowId && x.workflowRevision === e.review.workflowRevision,'Structural workflow witness conflict');
  // A first retained candidate pins the external coordinates until commitment;
  // later successful structural commits advance only the workflow plan counter.
  const previous = workValues(p.tasks).map(task => task.structuralPlan).filter(plan => plan !== undefined).at(-1);
  const candidate = workValues(p.intents).find(i => i.kind === 'decide' && i.source === 'supervisor-control' && i.planChange !== undefined);
  const pinned = previous ?? (candidate?.kind === 'decide' && candidate.source === 'supervisor-control' ? candidate.planChange?.change.expected : undefined);
  if (pinned) check(x.workflowId === pinned.workflowId && x.workflowRevision === pinned.workflowRevision && x.workflowPlanRevision === pinned.workflowPlanRevision && x.workflowBudgetRevision === pinned.workflowBudgetRevision && x.workflowBudgetHash === pinned.workflowBudgetHash,'Unsupported workflow coordinate change');
  // Hashes are opaque equality bindings here; only the aggregate recomputes
  // their canonical preimages. The retained candidate also binds its commit.
  const planBasis = workValues(p.intents).find(i => i.kind === 'decide' && i.source === 'supervisor-control' && i.planChange?.change.expected.taskId === x.taskId && i.planChange.change.expected.taskPlanRevision === x.taskPlanRevision && i.planChange.change.expected.workflowPlanRevision === x.workflowPlanRevision && i.planChange.change.expected.currentStepId === x.currentStepId);
  if (planBasis?.kind === 'decide' && planBasis.source === 'supervisor-control') check(planBasis.planChange?.change.expected.planHash === x.planHash,'Structural plan hash conflict');
  check(planLink.activationId === e.review.activationId && planLink.intentId !== e.review.intentId && planLink.operationId !== e.review.operationId && planLink.operationId !== e.operationId,'Plan/review link conflict');
  check(same(planSettlement,e.review.settlement) && planSettlement.at >= r.acceptedAt && planSettlement.at <= e.at,'Plan/review settlement conflict');
  check((e.input.checkpointHash === undefined || e.input.checkpointHash === x.checkpointHash) && checkpointFor(p,e.checkpointObservationId,x.reportId,e.operationId) && scan(e.inspectionReceiptIds).some(key => p.evidence[key]?.scope.kind === 'all'),'Structural revise requires current all-scope inspection');
  const pending = scan(t.steps).slice(t.stepIndex).map(s => s.id), remaining = unique(change.remainingStepIds), removed = unique(change.removedStepIds);
  check(scan(change.removedStepIds).every(key => scan(pending).includes(key)) && scan(pending).every(key => removed.has(key) === !remaining.has(key)),'Incomplete structural remainder partition');
  const introduced = unique(scan(change.introducedSteps).map(entry => entry.step.id));
  lifetimeSteps(p,scan(change.introducedSteps).map(entry => entry.step.id));
  check(scan(change.remainingStepIds).every(key => introduced.has(key) || (scan(pending).includes(key) && catalog[key].retiredBy === null)) && scan(change.introducedSteps).every(entry => remaining.has(entry.step.id)),'Unknown/retired/rescheduled plan step');
  for (const entry of scan(change.introducedSteps)) {
    // Deliberately unsupported: all multi-predecessor merges, including two
    // siblings already sharing a group. Splits use separate one-parent entries.
    check(entry.replaces.length <= 1,'Unsupported lineage merge conflict');
    check(scan(entry.replaces).every(key => removed.has(key) && !!catalog[key] && catalog[key].retiredBy === null),'Replacement lacks removed live predecessor');
  }
  const selection = change.current;
  const successor = selection.kind === 'keep' ? x.currentStepId : selection.successorStepId;
  check(successor !== undefined && change.remainingStepIds[0] === successor,'Current selection must head the remainder');
  if (selection.kind === 'keep') check(!removed.has(x.currentStepId),'Kept current step removed');
  else check(removed.has(x.currentStepId) && scan(change.introducedSteps).some(entry => entry.step.id === successor && scan(entry.replaces).includes(x.currentStepId)),'Current replacement must inherit reviewed step');
  const debt = t.structuralPlan?.reviewDebt ?? [];
  check(scan(debt).every(d => !removed.has(d.stepId) || d.stepId === x.currentStepId),'Cannot remove outstanding review debt');
  const next = copy(t), nextCatalog = copy(catalog); next.stepCatalog = nextCatalog;
  for (const key of scan(change.removedStepIds)) nextCatalog[key].retiredBy = e.operationId;
  for (const entry of scan(change.introducedSteps)) {
    nextCatalog[entry.step.id] = {step:copy(entry.step),replaces:copy(entry.replaces),lineageId:entry.replaces.length ? catalog[entry.replaces[0]].lineageId : entry.step.id,retiredBy:null};
    next.accounting.steps[entry.step.id] = zeroLedger();
  }
  // Keep the approved prefix for V1 navigation, with a separate immutable full
  // catalog. Only the executable remainder/current selection is replaced.
  next.steps = [...scan(next.steps).slice(0,next.stepIndex),...scan(change.remainingStepIds).map(key => copy(nextCatalog[key].step))];
  next.planRevision = change.next.taskPlanRevision;
  next.structuralPlan = {workflowId:x.workflowId,workflowRevision:x.workflowRevision,workflowPlanRevision:change.next.workflowPlanRevision,workflowBudgetRevision:x.workflowBudgetRevision,workflowBudgetHash:x.workflowBudgetHash,planLink:copy(planLink),reviewDebt:[...scan(debt).map(d => ({...copy(d),stepId:d.stepId === x.currentStepId ? successor : d.stepId})),{reportId:x.reportId,reportHash:x.reportHash,checkpointHash:x.checkpointHash,fromStepId:x.currentStepId,stepId:successor,decisionOperationId:e.operationId}]};
  return next;
}

/** Whitelisted projection update with closed contract-domain revalidation.
 * Lowered limits retain all prior records and consumption; no implicit deadline reset.
 * @param {CurrentTask} t @param {EventOf<'amendment-proposed'>} e
 */
function amend(t,e) {
  check(t.budgetRevision === e.expectedBudgetRevision && t.budgetHash === e.beforeHash,'Amendment revision conflict');
  for (const c of scan(e.changes)) {
    switch(c.field) {
      case 'summaryDetail': t.policy.summaryDetail = c.value; break;
      case 'maxRevisions': case 'maxRevisionsPerStep': t.policy[c.field] = c.value; break;
      case 'lifetimeDeadlineAt': t.lifetimeDeadlineAt = c.value; break;
      case 'maxReportedCostUsd': case 'maxOutputTokens': t.limits[c.field] = c.value; break;
      case 'maxTurnsPerStep': case 'taskTimeoutMs': case 'activeStepTimeoutMs': case 'maxQueuedTasks': case 'maxQueuedReviews': case 'maxReportsPerTask': case 'maxReportBytes': case 'maxAutomaticReportRepairs': case 'maxAutomaticRecoveryAttempts': t.limits[c.field] = c.value; break;
      default: unreachable(c);
    }
  }
  tree(t.policy); tree(t.limits);
  t.policy = externalValidation(() => validateTaskPolicy(t.policy),'stored'); t.limits = externalValidation(() => validateTaskLimits(t.limits),'stored'); t.budgetRevision = e.operationId; t.amendments.push(e.operationId); t.budgetHash = budgetHash(t);
}
/** Validate evidence-backed reconciliation; no generic clearHolds operation exists.
 * Publication readback is retained but never fabricates an authority/notice witness.
 * @param {Projection} p @param {EventOf<'reconciliation-proposed'>} e @param {Witness} c
 */
function reconcile(p,e,c) {
  check(e.evidenceIds.length > 0 && scan(e.evidenceIds).every(x => p.receipts[x] || p.evidence[x] || p.barriers[x]),'Reconciliation lacks retained evidence');
  const f = e.finding;
  switch(f.kind) {
    case 'command': {
      const w = p.promptDeliveries[f.targetOperationId]; check(w && p.commitments[w.intent.operationId],'Unknown committed command');
      if (f.outcome === 'unknown') return;
      // Never replace an ACK or infer acceptance from run evidence. Contradictions
      // remain as retained facts plus a scoped discrepancy, not a successful retry.
      const run = scan(w.observations).some(o => ['accepted','started','run-settled'].includes(o.observation.stage)) || workValues(p.reports).some(r => r.grantOperationId === w.intent.grantOperationId);
      const sent = scan(w.observations).some(o => o.observation.stage === 'sent');
      if (run || (f.outcome === 'not-sent' && sent)) { hold(p,e.observationId,'uncertain-delivery',{kind:'operation',id:w.intent.operationId},c.at); p.outcome = {kind:'hold',reason:'uncertain'}; return; }
      w.reconciledBy = e.operationId;
      resolve(p,'uncertain-delivery',{kind:'operation',id:w.intent.operationId},e.operationId);
      const g = p.grants[w.intent.grantOperationId], t = p.task;
      if (t?.kind === 'current' && t.currentGrantOperationId === g.operationId && t.obligation === null && barrierFor(p,g.operationId)) resolve(p,'stale-owner',{kind:'task',id:t.taskId},e.operationId);
      return;
    }
    case 'publication': {
      const g = p.grants[f.targetOperationId], n = p.notices[f.targetOperationId];
      check(f.artifact === 'authority' ? !!g : !!n,'Unknown publication target');
      if (f.outcome === 'unknown') return;
      const expectedHash = f.artifact === 'authority' ? payloadDigest(g.prepared) : payloadDigest({noticeId:n.noticeId,reportId:n.reportId,producerIdentity:n.producerIdentity});
      check(f.outcome === 'present' ? f.artifactHash === expectedHash : f.artifactHash === null,'Publication artifact mismatch');
      const witnessed = f.artifact === 'authority' ? g.publication !== null : scan(n.observations).some(o => o.observation.stage === 'published');
      if (f.outcome === 'absent' && witnessed) { hold(p,e.observationId,'uncertain-delivery',{kind:f.artifact === 'authority' ? 'operation' : 'notice',id:f.targetOperationId},c.at); p.outcome = {kind:'hold',reason:'uncertain'}; return; }
      if (f.outcome === 'present') resolve(p,'uncertain-delivery',{kind:f.artifact === 'authority' ? 'operation' : 'notice',id:f.targetOperationId},e.operationId);
      // Absence is not proof of never-published and cannot authorize resending.
      return;
    }
    case 'accounting': {
      const t = p.tasks[f.taskId]; check(t,'Unknown accounting task'); const a = t.accounting, supplied = f.snapshot;
      check(f.expectedAccountingRevision === a.revision && supplied.revision === e.operationId && supplied.at >= a.at && supplied.at <= c.at,'Accounting revision mismatch');
      check(f.coveredObservationIds.length > 0 && scan(f.coveredObservationIds).every(x => !!p.receipts[x]) && scan(e.evidenceIds).every(x => scan(f.coveredObservationIds).includes(x)),'Accounting coverage missing');
      check(same(workKeys(supplied.steps).sort(workCompare),workKeys(a.steps).sort(workCompare)),'Step ledger replacement');
      // Do not normalize the retained finding: intentRef hashes its original old
      // omissions. Only this derived projection carries forward known input lower
      // bounds and preserves unproven coverage. Reconciliation replaces totals,
      // never charges them again on top of the observations they summarize.
      /** @param {ReconciliationLedger} next @param {Ledger} old @returns {Ledger} */
      const deriveLedger = (next,old) => ({...copy(next),inputTokens:next.inputTokens ?? old.inputTokens});
      /** @type {Record<string,Ledger>} */ const steps = {};
      for (const [key,next] of workEntries(supplied.steps)) steps[key] = deriveLedger(next,a.steps[key]);
      /** @type {AccountingSnapshot} */
      const n = {revision:supplied.revision,at:supplied.at,lifetime:deriveLedger(supplied.lifetime,a.lifetime),steps,gaps:copy(supplied.gaps)};
      /** @param {string|null} stepId */
      const inputCovered = stepId => (stepId === null ? supplied.lifetime : supplied.steps[stepId]).inputTokens !== undefined;
      /** A legacy all-metric gap ID cannot certify its newly modeled input scope.
       * @param {AccountingGap} g */
      const resolvedGap = g => scan(f.resolvedGapIds).includes(g.gapId) && (g.metric !== 'inputTokens' || inputCovered(g.stepId));
      for (const g of scan(a.gaps)) if (g.metric === 'inputTokens' && !inputCovered(g.stepId) && !scan(n.gaps).some(x => same(x,g))) n.gaps.push(copy(g));
      accountingTotals(n);
      // Producer-owned metrics may increase; kernel-derived counters can only be
      // reproduced, never overwritten/refunded by an accounting reconciliation.
      const derived = ['revisions','reports','repairAttempts','recoveryAttempts','attempts'];
      for (const [old,next] of scan([[a.lifetime,n.lifetime],...workKeys(a.steps).map(k => [a.steps[k],n.steps[k]])])) for (const metric of scan(METRICS)) check(next[metric] >= old[metric] && (!scan(derived).includes(metric) || next[metric] === old[metric]),'Counter decrease/overwrite');
      check(scan(f.resolvedGapIds).every(key => scan(a.gaps).some(g => g.gapId === key) && scan(f.coveredObservationIds).includes(key)),'Uncovered gap resolution');
      check(scan(a.gaps).every(g => resolvedGap(g) || scan(n.gaps).some(x => same(x,g))) && scan(n.gaps).every(g => !resolvedGap(g)),'Gap lost/reintroduced');
      check(scan(n.gaps).every(g => scan(a.gaps).some(x => same(x,g)) || scan(f.coveredObservationIds).includes(g.gapId)),'New gap lacks observation coverage');
      // Even without a prior command/usage gap, an omitted historical scope is
      // unknown. Name the actual retained proposal, not an allocated/fabricated ID.
      for (const stepId of scan([null,...workKeys(n.steps)])) if (!inputCovered(stepId) && !scan(n.gaps).some(g => g.metric === 'inputTokens' && g.stepId === stepId)) n.gaps.push({gapId:e.observationId,metric:'inputTokens',stepId,reason:'historical-input-coverage-missing'});
      t.accounting = copy(n);
      if (!admissionUnknown(n)) resolve(p,'unknown-accounting',{kind:'task',id:t.taskId},e.operationId);
      enforceKnownBudget(p,t,c); return;
    }
    case 'adopt-report': {
      const r = p.reports[f.reportId], t = p.task, b = p.barriers[f.barrierId];
      check(r && t?.kind === 'current' && t.taskId === r.producerIdentity.taskId && same(f.producerIdentity,r.producerIdentity) && same(f.adoptedBy,p.fence) && f.authorization.authorizedAt <= e.at,'Invalid adoption identity/authorization');
      check(b && barrierFor(p,r.grantOperationId) === b && !p.decisions[f.reportId] && t.obligation?.kind === 'report' && t.obligation.reportId === f.reportId,'Invalid adoption obligation/barrier');
      if (f.checkpointObservationId !== null) check(checkpointFor(p,f.checkpointObservationId,f.reportId,e.operationId),'Invalid adoption checkpoint');
      // Adoption changes the receiving obligation, never the producer identity.
      resolve(p,'stale-owner',{kind:'task',id:t.taskId},e.operationId); return;
    }
  }
  return unreachable(f);
}
/** Reset is a detach, not deletion. The storage commitment covers an archive of
 * the full prior canonical journal; new intervening events invalidate that coverage.
 * Boundary sessionContained is explicit containment, never inferred from idle/exit.
 * @param {Projection} p @param {EventOf<'reset-requested'>} e @param {Genesis} genesis @param {TransitionEvent[]} prior
 */
function resetReady(p,e,genesis,prior) {
  if (p.task?.kind === 'legacy-held' || (p.runtime !== null && workKeys(p.grants).length === 0)) return false;
  if (p.task && (!['completed','cancelled'].includes(p.task.status) || p.task.obligation !== null)) return false;
  if (workValues(p.notices).some(n => n.resolution === null)) return false; // Queued receipts survive detachment.
  if (scan(p.holds).some(h => h === 'uncertain-effect' || h === 'uncertain-delivery' || h === 'unknown-accounting') || workValues(p.tasks).some(t => t.accounting.gaps.length > 0)) return false;
  if (!workValues(p.grants).every(g => g.phase === 'closed' && scan(e.containmentBarrierIds).some(key => { const b = p.barriers[key]; return !!b && barrierFor(p,g.operationId) === b && b.sessionContained; }))) return false;
  const covered = scan(prior).filter(x => x.observationId !== e.observationId);
  return same(e.coveredObservationIds,[...unique(scan(covered).map(x => x.observationId))]) && e.archive.hash === payloadDigest({genesis,events:covered});
}
/** Apply a matched durable intent without conflating it with delivery/effects.
 * @param {Projection} p @param {Intent} intent @param {EventOf<'intent-committed'>} e @param {Genesis} genesis @param {TransitionEvent[]} prior
 */
function commitIntent(p,intent,e,genesis,prior) {
  switch(intent.kind) {
    case 'dispatch-requested': {
      check(!p.tasks[intent.taskId],'Task ID reused');
      const cap = p.task?.kind === 'current' ? p.task.limits.maxQueuedTasks : intent.assignment.limits.maxQueuedTasks;
      if ((p.task !== null || p.queue.length > 0) && p.queue.length >= cap) { blocked(p,e,'capacity'); return false; }
      const t = newTask(p,intent,e);
      if (p.task === null && p.queue.length === 0) p.task = t; else p.queue.push(intent.operationId);
      return true;
    }
    case 'dispatch-prepared': {
      const g = p.grants[intent.grantOperationId]; invariant(g,'Retained prompt grant missing');
      const t = current(p,g.identity.taskId);
      if (g.phase !== 'open' || admissionHeld(p,t.taskId) || exhausted(t,e.at) || t.budgetRevision !== g.snapshot.budgetRevision || t.accounting.revision !== g.prepared.observationId) { blocked(p,e); return false; }
      // A committed command can incur unobserved consumption. Do not mistake an
      // empty usage/turn ledger for complete zero consumption. The accounting
      // boundary must reconcile these exact metric/scope gaps before re-admission.
      for (const metric of scan(/** @type {const} */ (['activeMs','turns','costUsd','inputTokens','outputTokens','requests']))) for (const stepId of scan([null,g.stepId])) t.accounting.gaps.push({gapId:e.observationId,metric,stepId,reason:'command-accounting-coverage'});
      t.accounting.revision = e.observationId; t.accounting.at = Math.max(t.accounting.at,e.at);
      return true;
    }
    case 'decide': {
      if (!decisionReady(p,intent)) { blocked(p,e,'evidence'); return false; }
      const original = current(p,intent.input.taskId), r = p.reports[intent.input.reportId], outcome = decisionOutcome(original,r,intent);
      check(!p.decisions[intent.input.reportId],'Report already decided');
      const replacement = structuralNext(p,original,intent), t = replacement ?? original;
      // All structural checks and overflow-sensitive charges happen on the draft.
      // The reviewed ORIGINAL member, not its successor, pays this one revision.
      if (replacement) charge(t,'revisions',1,r.envelope.payload.stepId,e);
      // AR-01 compatibility: internal immutable core, original input/hash retained;
      // StoredDecision V1 mutable delivery and minimal cancel record stay untouched.
      p.decisions[intent.input.reportId] = {candidate:intent,producerIdentity:copy(r.producerIdentity),outcome,commit:e};
      if (intent.input.action === 'revise' && !replacement) charge(t,'revisions',1,r.envelope.payload.stepId,e);
      if (intent.input.action === 'approve' && t.structuralPlan) t.structuralPlan.reviewDebt = scan(t.structuralPlan.reviewDebt).filter(d => d.stepId !== r.envelope.payload.stepId);
      if (replacement) { p.tasks[t.taskId] = t; p.task = t; }
      if (outcome === 'advance') { invariant(t.stepIndex + 1 < t.steps.length,'Plan advance overflow'); t.stepIndex++; }
      if (outcome === 'cancel' || outcome === 'complete') { t.status = outcome === 'cancel' ? 'cancelled' : 'completed'; t.obligation = null; closeCurrent(p,e,'cancelled'); }
      else { invariant(intent.continuationOperationId,'Continuation ID missing'); t.obligation = {kind:'continuation',reportId:intent.input.reportId,decisionOperationId:intent.operationId,operationId:intent.continuationOperationId}; t.status = 'continuation-pending'; }
      return true;
    }
    case 'amendment-proposed': {
      const t = current(p,intent.taskId); amend(t,intent);
      if (!exhausted(t,e.at)) resolve(p,'budget',{kind:'task',id:t.taskId},intent.operationId);
      const occupied = workValues(p.notices).filter(n => n.resolution === null).length + workValues(p.grants).filter(g => g.reviewReserved).length;
      if (occupied < t.limits.maxQueuedReviews && p.queue.length <= t.limits.maxQueuedTasks) resolve(p,'capacity',{kind:'task',id:t.taskId},intent.operationId);
      if (exhausted(t,e.at)) { hold(p,e.observationId,'budget',{kind:'task',id:t.taskId},e.at); closeCurrent(p,e,'budget'); }
      return true;
    }
    case 'automatic-action-prepared': {
      const t = current(p,intent.taskId), a = t.accounting.lifetime;
      if (intent.action === 'report-repair' ? a.repairAttempts >= t.limits.maxAutomaticReportRepairs : a.recoveryAttempts >= t.limits.maxAutomaticRecoveryAttempts) { blocked(p,e,'budget'); return false; }
      check(scan(p.holdCauses).some(c => c.causeId === intent.causeId),'Unknown automatic-action cause');
      if (intent.reportId !== null) check(p.reports[intent.reportId]?.producerIdentity.taskId === t.taskId,'Automatic-action report mismatch');
      // Report repair has report-only modeled authority: it is not a grant basis.
      charge(t,intent.action === 'report-repair' ? 'repairAttempts' : 'recoveryAttempts',1,t.steps[t.stepIndex].id,e); return true;
    }
    case 'reconciliation-proposed': reconcile(p,intent,e); return true;
    case 'reset-requested': {
      if (!resetReady(p,intent,genesis,prior)) { blocked(p,e); return false; }
      check(e.intentKind === 'reset' && same(e.archiveObservation.archive,intent.archive) && same(e.archiveObservation.coveredObservationIds,intent.coveredObservationIds) && e.archiveObservation.at >= intent.at,'Reset lacks matching archive storage observation');
      check(!p.receipts[e.archiveObservation.observationId] && !workValues(p.commitments).some(c => c.intentKind === 'reset' && c.archiveObservation.observationId === e.archiveObservation.observationId),'Archive observation ID reused');
      p.resets.push(intent); p.task = null; return true;
    }
  }
  return unreachable(intent);
}

/** Immutable proposed operation identity, including held proposals. A changed
 * command cannot evade lifetime receipt dedup merely by choosing a new witness ID.
 * Observation channels (commits, delivery, barriers) have separate identities.
 * @param {TransitionEvent} e @returns {string|null}
 */
function proposedOperation(e) {
  switch(e.kind) {
    case 'dispatch-requested': case 'prepare-grant': case 'dispatch-prepared': case 'decide': case 'amendment-proposed': case 'automatic-action-prepared': case 'reconciliation-proposed': case 'reset-requested': return e.operationId;
    case 'intent-committed': case 'grant-committed': case 'authority-published': case 'effects-reconciled': case 'checkpoint-finalized': case 'evidence-receipt': case 'checkpoint-current': case 'notice-resolved': case 'worker-delivery': case 'main-delivery': case 'usage-observed': case 'counter-observed': case 'budget-evaluated': case 'lifecycle': case 'owner-replaced': case 'report': case 'runtime': case 'failure': case 'unsupported': return null;
  }
  return unreachable(e);
}

/** One journal event. Mutates only a fresh replay-local projection. Rejected events
 * never enter the canonical journal; exact replays have no additional consumption.
 * @param {Projection} p @param {TransitionEvent} e @param {Genesis} genesis @param {TransitionEvent[]} prior
 */
function applyEvent(p,e,genesis,prior) {
  p.outcome = {kind:'apply',reason:'observed'};
  // Raw stale-owner events are inert. A current receiver may retain historical
  // producer evidence using its own fence, without rebasing that producer.
  if (!same(e.fence,p.fence)) { p.outcome = {kind:'noop',reason:'identity-conflict'}; return; }
  const receipt = p.receipts[e.observationId];
  // The receipt ID is the original observation identity. Receiving time/fence and
  // caller usageId are provenance, not another charge. Compare ALL original
  // producer/activation/task/step/value/observed-time fields before the generic
  // receipt rule, which remains unchanged for unrelated/held observations.
  const originalUsage = e.kind === 'usage-observed' ? p.usage[e.observationId] : undefined;
  if (e.kind === 'usage-observed' && originalUsage) {
    check(same([originalUsage.participant,originalUsage.activationId,originalUsage.taskId,originalUsage.stepId,originalUsage.usage],[e.participant,e.activationId,e.taskId,e.stepId,e.usage]),'Original usage observation conflict');
    p.outcome = {kind:'noop',reason:'duplicate'}; return;
  }
  const retry = !!receipt && scan(p.holdCauses).some(c => c.causeId === e.observationId && c.resolvedBy === null && requestHold(c));
  if (receipt) { check(same(receipt,e),'Conflicting observation ID'); if (!retry) { p.outcome = {kind:'noop',reason:'duplicate'}; return; } }
  const operationId = proposedOperation(e);
  if (operationId !== null) {
    const old = workValues(p.receipts).filter(x => proposedOperation(x) === operationId && x.observationId !== e.observationId).at(-1);
    if (e.kind === 'prepare-grant' && e.refreshOfObservationId !== undefined) {
      // A held, UNPREPARED operation can explicitly refresh admission snapshots.
      // Its immutable identity/basis and all prior receipts remain unchanged.
      check(!p.grants[operationId] && old?.kind === 'prepare-grant' && old.observationId === e.refreshOfObservationId && scan(p.holdCauses).some(c => c.causeId === old.observationId && c.resolvedBy === null && requestHold(c)),'Grant refresh lacks a held unprepared predecessor');
      check(same(old.fence,e.fence) && same(old.identity,e.identity) && same(old.basis,e.basis) && old.checkpointObservationId === e.checkpointObservationId && e.at >= old.at,'Grant refresh changed immutable admission intent');
    } else if (old) { check(same(old,e),'Conflicting retained operation proposal'); if (!retry) { p.outcome = {kind:'noop',reason:'duplicate'}; return; } }
  }
  switch(e.kind) {
    case 'dispatch-requested': {
      // Held requests reserve the public key too, not only retained intents.
      const old = workValues(p.receipts).find(i => i.kind === 'dispatch-requested' && i.request.requestId === e.request.requestId);
      if (old) { check(same(old,e),'Request ID conflict'); if (old.kind === 'dispatch-requested' && p.intents[old.operationId]) { p.outcome = {kind:'noop',reason:'duplicate'}; return; } }
      if (e.request.workerId !== p.fence.workerId || p.task?.kind === 'legacy-held') { blocked(p,e); return; }
      check(!p.tasks[e.taskId] && !workValues(p.intents).some(i => i.kind === 'dispatch-requested' && i.taskId === e.taskId),'Task ID conflict');
      lifetimeSteps(p,scan(e.request.steps).map(s => s.id),false);
      const pending = workValues(p.intents).filter(i => i.kind === 'dispatch-requested' && same(i.fence,p.fence) && !p.tasks[i.taskId]).length;
      const cap = p.task?.kind === 'current' ? p.task.limits.maxQueuedTasks : e.assignment.limits.maxQueuedTasks;
      if ((p.task !== null || p.queue.length > 0 || pending > 0) && p.queue.length + pending >= cap) { blocked(p,e,'capacity'); return; }
      retainIntent(p,e); return;
    }
    case 'intent-committed': {
      const old = p.commitments[e.operationId]; if (old) { check(same(old,e),'Commit conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      const i = p.intents[e.operationId]; check(i,'Unretained intent'); const ref = intentRef(i);
      check(e.intentKind === ref.kind && e.intentHash === ref.hash && e.at >= i.at,'Commit does not cover intent');
      if (!intentReady(p,i,prior)) { p.outcome = {kind:'hold',reason:same(i.fence,p.fence) ? 'admission-held' : 'identity-conflict'}; return; }
      if (commitIntent(p,i,e,genesis,prior)) { p.commitments[e.operationId] = e; if (p.outcome.kind !== 'hold') p.outcome = {kind:'apply',reason:'committed'}; }
      return;
    }
    case 'prepare-grant': {
      const old = p.grants[e.operationId]; if (old) { check(same(old.prepared,e),'Grant operation conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      check(!p.intents[e.operationId],'Grant/prompt operation collision');
      if (p.task?.kind === 'legacy-held') { p.outcome = {kind:'hold',reason:'admission-held'}; return; }
      let t = p.task;
      if (e.basis.kind === 'dispatch') {
        const d = p.intents[t?.kind === 'current' && t.identity === null ? t.dispatchOperationId : p.queue[0]];
        if ((t !== null && (t.kind !== 'current' || t.identity !== null)) || !d || d.kind !== 'dispatch-requested' || !same(d.fence,p.fence) || d.request.requestId !== e.basis.requestId || !p.commitments[d.operationId]) { blocked(p,e); return; }
        t = p.tasks[d.taskId];
      }
      if (!t || t.kind !== 'current' || t.taskId !== e.identity.taskId || ['completed','cancelled'].includes(t.status)) { blocked(p,e); return; }
      if (admissionHeld(p,t.taskId)) { p.outcome = {kind:'hold',reason:'admission-held'}; return; }
      const previous = t.currentGrantOperationId === null ? null : p.grants[t.currentGrantOperationId];
      if (previous && (previous.phase !== 'closed' || !barrierFor(p,previous.operationId))) { closeGrant(p,previous,e,'uncertain-effect'); hold(p,e.observationId,'uncertain-effect',{kind:'operation',id:previous.operationId},e.at); p.outcome = {kind:'hold',reason:'uncertain'}; return; }
      /** @type {string|null} */ let automaticActionOperationId = null;
      switch(e.basis.kind) {
        case 'dispatch': check(t.identity === null && t.obligation === null && e.identity.attemptNumber === 1 && e.identity.planRevision === 1,'Invalid first attempt'); break;
        case 'decision': {
          const o = t.obligation, d = p.decisions[e.basis.reportId];
          if (!o || o.kind !== 'continuation' || o.operationId !== e.operationId || o.reportId !== e.basis.reportId || o.decisionOperationId !== e.basis.decisionOperationId || !d || !same(d.candidate.fence,p.fence) || d.candidate.operationId !== e.basis.decisionOperationId) { blocked(p,e); return; }
          if (d.candidate.input.action === 'approve' && !checkpointFor(p,e.checkpointObservationId,o.reportId,e.operationId)) { blocked(p,e,'evidence'); return; }
          break;
        }
        case 'recovery': {
          const r = p.intents[e.basis.reconciliationOperationId];
          const action = workValues(p.intents).find(i => i.kind === 'automatic-action-prepared' && same(i.fence,p.fence) && i.action === 'recovery' && i.taskId === t.taskId && p.commitments[i.operationId] && !workValues(p.grants).some(g => g.automaticActionOperationId === i.operationId) && r?.kind === 'reconciliation-proposed' && scan(r.evidenceIds).includes(i.causeId));
          if (!r || r.kind !== 'reconciliation-proposed' || !same(r.fence,p.fence) || !p.commitments[r.operationId] || r.finding.kind !== 'command' || r.finding.outcome === 'unknown' || !p.promptDeliveries[r.finding.targetOperationId]?.reconciledBy || t.obligation !== null || !previous || !action || workValues(p.grants).some(g => same(g.prepared.basis,e.basis))) { blocked(p,e); return; }
          invariant(action.kind === 'automatic-action-prepared' && action.action === 'recovery','Invalid recovery allowance');
          const target = p.promptDeliveries[r.finding.targetOperationId];
          check(target.intent.grantOperationId === previous.operationId && scan(p.holdCauses).some(c => c.causeId === action.causeId && c.scope.kind === 'operation' && (c.scope.id === target.intent.operationId || c.scope.id === previous.operationId)),'Recovery cause/command does not belong to prior grant');
          automaticActionOperationId = action.operationId;
          break;
        }
        default: unreachable(e.basis);
      }
      check(same(e.identity.fence,p.fence) && e.identity.planRevision === t.planRevision,'Grant identity/fence mismatch');
      if (t.identity) check(e.identity.attemptNumber === integer(t.identity.attemptNumber + 1,1),'Attempt increment/overflow');
      check(!workValues(p.grants).some(g => g.identity.attemptId === e.identity.attemptId || g.identity.leaseId === e.identity.leaseId),'Attempt/lease reuse');
      check(e.accountingRevision === t.accounting.revision && e.budgetRevision === t.budgetRevision && t.accounting.at <= e.at,'Stale admission snapshot');
      if (admissionUnknown(t.accounting)) { hold(p,e.observationId,'unknown-accounting',{kind:'task',id:t.taskId},e.at); p.outcome = {kind:'hold',reason:'admission-held'}; return; }
      if (exhausted(t,e.at)) { hold(p,e.observationId,'budget',{kind:'task',id:t.taskId},e.at); p.outcome = {kind:'hold',reason:'admission-held'}; return; }
      const occupied = workValues(p.notices).filter(n => n.resolution === null).length + workValues(p.grants).filter(g => g.reviewReserved).length;
      if (t.limits.maxQueuedReviews === 0 || occupied >= t.limits.maxQueuedReviews) { blocked(p,e,'capacity'); return; }
      p.grants[e.operationId] = {operationId:e.operationId,identity:copy(e.identity),stepId:t.steps[t.stepIndex].id,prepared:e,phase:'prepared',commit:null,publication:null,closure:null,snapshot:{budgetRevision:t.budgetRevision,policy:copy(t.policy),limits:copy(t.limits),accounting:copy(t.accounting),lifetimeDeadlineAt:t.lifetimeDeadlineAt},automaticActionOperationId,reviewReserved:true,latestBarrierId:null};
      t.identity = copy(e.identity); t.currentGrantOperationId = e.operationId; t.obligation = null; t.status = 'assigned';
      charge(t,'attempts',1,t.steps[t.stepIndex].id,e); p.task = t;
      if (e.basis.kind === 'dispatch' && p.queue[0] === t.dispatchOperationId) scan(p.queue).shift();
      resolve(p,'capacity',{kind:'operation',id:e.operationId},e.observationId);
      resolve(p,'evidence',{kind:'operation',id:e.operationId},e.observationId);
      p.outcome = {kind:'apply',reason:'prepared'}; return;
    }
    case 'grant-committed': {
      const g = p.grants[e.operationId]; check(g && g.identity.leaseId === e.leaseId && e.at >= g.prepared.at,'Unknown grant commitment');
      if (g.commit) { check(same(g.commit,e),'Grant commit conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      g.commit = e; if (g.phase !== 'closed') g.phase = 'committed';
      p.outcome = {kind:'apply',reason:'committed'}; return;
    }
    case 'authority-published': {
      const g = p.grants[e.operationId]; check(g && g.identity.leaseId === e.leaseId && g.commit && e.at >= g.commit.at,'Unknown/uncommitted authority');
      if (g.publication) { check(same(g.publication,e),'Authority publication conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      g.publication = e;
      const t = p.task;
      if (g.phase === 'closed' || !same(g.identity.fence,p.fence) || admissionHeld(p,g.identity.taskId) || t?.kind !== 'current' || t.currentGrantOperationId !== e.operationId || exhausted(t,e.at) || t.budgetRevision !== g.snapshot.budgetRevision || t.accounting.revision !== g.prepared.observationId) {
        closeGrant(p,g,e,'uncertain-effect'); hold(p,e.observationId,'uncertain-effect',{kind:'operation',id:g.operationId},e.at); p.outcome = {kind:'hold',reason:'uncertain'}; return;
      }
      g.phase = 'open'; t.status = 'active'; p.outcome = {kind:'apply',reason:'published'}; return;
    }
    case 'dispatch-prepared': {
      if (p.intents[e.operationId]) { retainIntent(p,e); return; }
      const g = p.grants[e.grantOperationId];
      if (!g || g.phase !== 'open' || admissionHeld(p,g.identity.taskId) || !same(g.identity.fence,p.fence)) { blocked(p,e); return; }
      check(e.operationId !== g.operationId && !workValues(p.promptDeliveries).some(w => w.intent.grantOperationId === g.operationId || w.intent.commandId === e.commandId),'Prompt/command replay');
      const t = current(p,g.identity.taskId); if (exhausted(t,e.at) || t.budgetRevision !== g.snapshot.budgetRevision || t.accounting.revision !== g.prepared.observationId || admissionUnknown(t.accounting)) { blocked(p,e,'budget'); return; }
      retainIntent(p,e); p.promptDeliveries[e.operationId] = {intent:e,observations:[],reconciledBy:null}; return;
    }
    case 'report': {
      const r = e.report, old = p.reports[r.reportId];
      if (old) { check(same(old.envelope,r) && old.noticeId === e.noticeId,'Report content/notice conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      const t = p.tasks[r.payload.taskId], g = workValues(p.grants).find(x => reportBound(r,x));
      check(t,'Report task missing');
      check(g && g.publication && r.createdAt >= g.publication.at && e.at >= g.prepared.at,'Report without matching published grant');
      check(!p.notices[e.noticeId] && !workValues(p.reports).some(x => x.grantOperationId === g.operationId),'Notice/attempt report conflict');
      const liveObligation = p.task === t && t.currentGrantOperationId === g.operationId && t.obligation === null && t.status !== 'completed';
      if (g.snapshot.policy.mode === 'final-only' && r.payload.kind === 'checkpoint') { blocked(p,e); return; }
      if (r.payload.kind === 'final_review' && g.snapshot.policy.mode !== 'final-only' && g.stepId !== t.steps.at(-1)?.id) { blocked(p,e); return; }
      // Reserved admission accepts its one report even if a subsequent amendment
      // lowers a limit; no last/final-review report is discarded on exhaustion.
      // Preparation already reserved this grant's review capacity. Even if a
      // complete barrier subsequently released it, retain its one matching late
      // report even after rotation/detachment; this admits no new work. Historical
      // contradictions have no modeled disposition yet: do not invent a decision
      // or replace the live report/continuation merely to make reset possible.
      check(workValues(p.promptDeliveries).some(w => w.intent.grantOperationId === g.operationId && p.commitments[w.intent.operationId]),'Report lacks committed prompt');
      // maxReportBytes bounds serialized payload bytes, not the transport envelope.
      check(new TextEncoder().encode(serialized(r.payload)).length <= g.snapshot.limits.maxReportBytes,'Report exceeds configured payload byte bound');
      closeGrant(p,g,e,'report'); g.reviewReserved = false;
      p.reports[r.reportId] = {producerIdentity:copy(g.identity),grantOperationId:g.operationId,acceptedAt:e.at,noticeId:e.noticeId,envelope:r,content:{kind:'received',envelope:r},finalizationWitness:null};
      p.notices[e.noticeId] = {noticeId:e.noticeId,reportId:r.reportId,producerIdentity:copy(g.identity),queuedAt:e.at,observations:[],resolution:null};
      if (liveObligation) { t.obligation = {kind:'report',reportId:r.reportId}; if (t.status !== 'cancelled') t.status = 'waiting'; }
      charge(t,'reports',1,r.payload.stepId,e);
      const contradicted = workValues(p.promptDeliveries).filter(w => w.intent.grantOperationId === g.operationId && (w.reconciledBy !== null || scan(w.observations).some(o => o.observation.stage === 'rejected')));
      for (const w of scan(contradicted)) hold(p,e.observationId,'uncertain-delivery',{kind:'operation',id:w.intent.operationId},e.at);
      if (!liveObligation) hold(p,e.observationId,'uncertain-delivery',{kind:'operation',id:g.operationId},e.at);
      if (!liveObligation || contradicted.length) closeCurrent(p,e,'uncertain-delivery');
      p.outcome = {kind:!liveObligation || contradicted.length ? 'hold' : 'apply',reason:'report-retained'}; return;
    }
    case 'effects-reconciled': {
      const old = p.barriers[e.barrierId]; if (old) { check(same(old,e),'Barrier ID conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      const g = p.grants[e.operationId]; check(g && same(g.identity,e.identity) && g.phase === 'closed' && g.closure?.observationId === e.admissionClosedBy,'Barrier lacks closed admission binding');
      const admitted = workValues(p.barriers).filter(b => b.operationId === g.operationId).flatMap(b => scan(b.admittedEffectIds));
      if (e.coverage === 'complete') check(scan(admitted).every(id => scan(e.admittedEffectIds).includes(id)),'Complete barrier forgot admitted effects');
      p.barriers[e.barrierId] = e; g.latestBarrierId = e.barrierId;
      if (complete(e)) { resolve(p,'uncertain-effect',{kind:'operation',id:g.operationId},e.observationId); if (!workValues(p.reports).some(r => r.grantOperationId === g.operationId)) g.reviewReserved = false; }
      else { hold(p,e.observationId,'uncertain-effect',{kind:'operation',id:g.operationId},e.at); closeCurrent(p,e,'uncertain-effect'); p.outcome = {kind:'hold',reason:'uncertain'}; }
      return;
    }
    case 'checkpoint-finalized': {
      const r = p.reports[e.reportId]; if (!r) { blocked(p,e,'evidence'); return; }
      if (r.finalizationWitness) { check(same(r.finalizationWitness,e),'Finalization conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      const {checkpoint,snapshotRef,inspectedAt,...envelope} = e.finalized;
      check(same(envelope,r.envelope),'Finalization changed original envelope/hash');
      const b = p.barriers[e.barrierId], t = p.tasks[r.producerIdentity.taskId];
      if (!b || barrierFor(p,r.grantOperationId) !== b || !verificationReady(t,e)) { blocked(p,e,'evidence'); return; }
      r.content = {kind:'finalized',report:e.finalized}; r.finalizationWitness = e;
      resolve(p,'evidence',{kind:'report',id:e.reportId},e.observationId); return;
    }
    case 'evidence-receipt': {
      const old = p.evidence[e.receiptId]; if (old) { check(same(old,e),'Receipt ID conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      const r = p.reports[e.reportId]; check(r?.content.kind === 'finalized' && e.checkpointHash === r.content.report.checkpoint.checkpointHash,'Unbound inspection receipt');
      // The review link must name the ORIGINAL V1 report envelope payload hash,
      // not its byte hash or a V2 wrapper hash, before the evidence is stored.
      if (e.review) check(e.review.reportHash === r.envelope.payloadHash,'Review link does not match retained report payload hash');
      if (e.scope.kind === 'file') check(scan(r.content.report.checkpoint.changed).includes(e.scope.path),'Inspection file outside checkpoint');
      p.evidence[e.receiptId] = e; return;
    }
    case 'checkpoint-current': {
      const r = p.reports[e.reportId]; check(r?.content.kind === 'finalized' && e.checkpointHash === r.content.report.checkpoint.checkpointHash,'Unbound checkpoint-current');
      check(!workValues(p.checkpoints).some(c => c.forOperationId === e.forOperationId),'Operation already has checkpoint witness'); p.checkpoints[e.observationId] = e; return;
    }
    case 'decide': {
      if (p.intents[e.operationId]) { retainIntent(p,e); return; }
      const old = p.decisions[e.input.reportId]; check(!old,'Report already has immutable decision');
      const supersedes = e.source === 'supervisor-control' ? e.planChange?.change.supersedesDecisionOperationId ?? null : null;
      if (supersedes !== null) {
        const target = p.intents[supersedes];
        check(supersedes !== e.operationId && target?.kind === 'decide' && target.input.reportId === e.input.reportId && target.input.taskId === e.input.taskId && !p.commitments[supersedes] && !superseded(p,supersedes),'Invalid named candidate supersession');
      }
      check(!workValues(p.intents).some(i => i.kind === 'decide' && i.operationId !== supersedes && intentReady(p,i,prior) && i.input.reportId === e.input.reportId),'Conflicting decision candidate');
      if (!decisionReady(p,e)) { blocked(p,e,'evidence'); return; }
      structuralNext(p,current(p,e.input.taskId),e);
      // Retention itself is the permanent named tombstone. A failing replacement
      // reaches neither retention nor supersession, and consumes no report.
      retainIntent(p,e); return;
    }
    case 'notice-resolved': {
      const n = p.notices[e.noticeId], d = p.decisions[e.reportId]; check(n && n.reportId === e.reportId,'Notice binding conflict');
      if (n.resolution) { check(same(n.resolution,e),'Notice resolution conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      if (!d || d.candidate.operationId !== e.decisionOperationId || d.candidate.inputHash !== e.decisionHash) { blocked(p,e); return; }
      n.resolution = e; resolve(p,'uncertain-delivery',{kind:'notice',id:n.noticeId},e.observationId); return;
    }
    case 'worker-delivery': {
      const w = p.promptDeliveries[e.operationId], o = e.observation;
      check(w && p.commitments[e.operationId],'Worker fact lacks committed prompt');
      const g = p.grants[w.intent.grantOperationId];
      check(e.commandId === w.intent.commandId && same(e.identity,g.identity) && e.inputHash === w.intent.input.hash,'Command/identity/input mismatch');
      const old = scan(w.observations).find(x => x.observation.stage === o.stage);
      if (old) { check(same(old,e),'Worker fact conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      const response = scan(w.observations).find(x => x.observation.stage === 'accepted' || x.observation.stage === 'rejected');
      if ((o.stage === 'accepted' || o.stage === 'rejected') && response) check(response.observation.stage === o.stage,'Contradictory command responses');
      if (o.stage === 'started' || o.stage === 'run-settled') {
        const run = scan(w.observations).find(x => x.observation.stage === 'started' || x.observation.stage === 'run-settled');
        if (run && (run.observation.stage === 'started' || run.observation.stage === 'run-settled')) check(run.observation.activationId === o.activationId,'Activation mismatch');
        check(!workValues(p.promptDeliveries).some(other => other !== w && scan(other.observations).some(x => (x.observation.stage === 'started' || x.observation.stage === 'run-settled') && x.observation.activationId === o.activationId)),'Activation reused');
      }
      if (o.stage === 'settled') { const b = p.barriers[o.barrierId]; check(b && barrierFor(p,g.operationId) === b,'Settlement without complete bound barrier'); }
      w.observations.push(e);
      const rejected = scan(w.observations).some(x => x.observation.stage === 'rejected');
      const ran = scan(w.observations).some(x => x.observation.stage === 'started' || x.observation.stage === 'run-settled') || workValues(p.reports).some(r => r.grantOperationId === g.operationId);
      // R12: adapter correlation is outside this kernel. Retain contradictory ACK/
      // run facts and hold; neither acceptance nor safe resend is synthesized.
      const discrepancy = (rejected && ran) || (w.reconciledBy !== null && (ran || o.stage === 'accepted' || o.stage === 'sent')) || (o.stage === 'sent' && g.closure !== null && o.at > g.closure.at) || (g.publication === null && o.stage !== 'rejected');
      if (discrepancy) { hold(p,e.observationId,'uncertain-delivery',{kind:'operation',id:e.operationId},e.at); closeGrant(p,g,e,'uncertain-delivery'); closeCurrent(p,e,'uncertain-delivery'); p.outcome = {kind:'hold',reason:'uncertain'}; }
      else if (o.stage === 'accepted' || o.stage === 'rejected') {
        // An ACK only resolves the missing-response cause, never a retained safety
        // discrepancy or an unrelated RPC failure on the same operation.
        for (const c of scan(p.holdCauses)) if (c.resolvedBy === null && c.reason === 'uncertain-delivery' && c.causeId === e.operationId && c.scope.kind === 'operation' && c.scope.id === e.operationId) c.resolvedBy = e.observationId;
        holds(p);
      }
      // No timestamp total order, no stage prefix, no reopen, no implied send/ACK.
      return;
    }
    case 'main-delivery': {
      const n = p.notices[e.noticeId]; check(n && n.reportId === e.reportId,'Notice fact binding mismatch');
      const old = scan(n.observations).find(o => o.observation.stage === e.observation.stage);
      if (old) { check(same(old,e),'Notice fact conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      n.observations.push(e); return;
    }
    case 'usage-observed': {
      const t = p.tasks[e.taskId]; check(t && (e.stepId === null || t.accounting.steps[e.stepId]),'Usage scope mismatch');
      // No supervisor activation registry exists in this model. Owner matching
      // alone must not manufacture one. All implementer fields bind ONE delivery.
      if (e.participant.role !== 'implementer') { blocked(p,e); return; }
      check(workValues(p.promptDeliveries).some(w => {
        const g = p.grants[w.intent.grantOperationId], f = g.identity.fence;
        return !!p.commitments[w.intent.operationId] && g.identity.taskId === t.taskId && e.participant.actorId === f.workerId
          && e.participant.ownerSession === f.ownerSession && e.participant.ownerEpoch === f.ownerEpoch
          && (e.stepId === null || g.stepId === e.stepId) && f.workerGeneration === e.participant.generation && f.sessionId === e.participant.sessionId
          && scan(w.observations).some(o => (o.observation.stage === 'started' || o.observation.stage === 'run-settled') && o.observation.activationId === e.activationId);
      }),'Usage activation attribution missing');
      p.usage[e.observationId] = e;
      charge(t,'requests',1,e.stepId,e); charge(t,'inputTokens',e.usage.totalInput,e.stepId,e); charge(t,'outputTokens',e.usage.output,e.stepId,e);
      if (e.usage.cost === null) charge(t,'unknownCostRequests',1,e.stepId,e); else charge(t,'costUsd',e.usage.cost,e.stepId,e);
      // AR-01 observations may be fractional/producer-zero-filled. Known subtotals
      // are not complete actual spending, even when the reported cost is nonnull.
      for (const metric of scan(/** @type {const} */ (['costUsd','inputTokens','outputTokens']))) {
        t.accounting.gaps.push({gapId:e.observationId,metric,stepId:null,reason:metric === 'costUsd' && e.usage.cost === null ? 'unknown-price' : 'reported-observation-not-complete'});
        if (e.stepId !== null) t.accounting.gaps.push({gapId:e.observationId,metric,stepId:e.stepId,reason:'reported-observation-not-complete'});
        else for (const stepId of workKeys(t.accounting.steps)) t.accounting.gaps.push({gapId:e.observationId,metric,stepId,reason:'unattributed-step-usage'});
      }
      hold(p,e.observationId,'unknown-accounting',{kind:'task',id:t.taskId},e.at);
      enforceKnownBudget(p,t,e);
      return;
    }
    case 'counter-observed': {
      const key = e.counter.kind === 'turn' ? e.counter.turnId : e.counter.intervalId;
      const old = p.counters[key]; if (old) { check(same(old,e),'Counter identity conflict'); p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      const t = p.tasks[e.taskId], w = p.promptDeliveries[e.operationId]; check(t && w && p.commitments[e.operationId],'Unbound counter operation'); const g = p.grants[w.intent.grantOperationId];
      check(g.stepId === e.stepId && g.identity.taskId === t.taskId,'Counter task/step mismatch');
      const start = scan(w.observations).find(o => o.observation.stage === 'started');
      check(start?.observation.stage === 'started','Counter lacks identified activation');
      if (e.counter.kind === 'active-interval') check(e.counter.activationId === start.observation.activationId,'Interval activation mismatch');
      const running = p.task === t && t.currentGrantOperationId === g.operationId && t.status === 'active' && g.phase === 'open' && same(g.identity.fence,p.fence) && !admissionHeld(p,t.taskId,true) && !scan(w.observations).some(o => o.observation.stage === 'run-settled');
      if (!running) {
        // Identified late facts remain reconciliation evidence, not root poison
        // and not proof that a monotonic interval was wholly active before closure.
        p.counters[key] = e;
        const metric = e.counter.kind === 'turn' ? 'turns' : 'activeMs';
        for (const stepId of [null,e.stepId]) t.accounting.gaps.push({gapId:e.observationId,metric,stepId,reason:'late-counter-requires-reconciliation'});
        t.accounting.revision = e.observationId; t.accounting.at = Math.max(t.accounting.at,e.at);
        hold(p,e.observationId,'unknown-accounting',{kind:'task',id:t.taskId},e.at); p.outcome = {kind:'hold',reason:'admission-held'}; return;
      }
      if (e.counter.kind === 'active-interval') {
        const c = e.counter; check(c.activationId === start.observation.activationId,'Interval activation mismatch');
        // V1 ingests intervals only during a witnessed running activation. Late or
        // crash-spanning intervals need explicit accounting reconciliation; waits
        // are never reconstructed from task/report/notice wall-clock timestamps.
        for (const x of workValues(p.counters)) if (x.taskId === e.taskId && x.counter.kind === 'active-interval') {
          check(x.counter.clockId === c.clockId,'Unreconciled monotonic clock replacement');
          check(c.endTick <= x.counter.startTick || c.startTick >= x.counter.endTick,'Overlapping active intervals');
        }
        charge(t,'activeMs',integer(c.endTick - c.startTick),e.stepId,e);
      } else charge(t,'turns',1,e.stepId,e);
      p.counters[key] = e; enforceKnownBudget(p,t,e); return;
    }
    case 'budget-evaluated': {
      const t = current(p,e.taskId); check(t.budgetRevision === e.budgetRevision && t.accounting.revision === e.accountingRevision && e.at >= t.accounting.at,'Stale budget evaluation');
      if (exhausted(t,e.at)) { hold(p,e.observationId,'budget',{kind:'task',id:t.taskId},e.at); closeCurrent(p,e,'budget'); p.outcome = {kind:'hold',reason:'admission-held'}; }
      if (admissionUnknown(t.accounting)) { hold(p,e.observationId,'unknown-accounting',{kind:'task',id:t.taskId},e.at); p.outcome = {kind:'hold',reason:'admission-held'}; }
      return;
    }
    case 'amendment-proposed': {
      if (p.intents[e.operationId]) { retainIntent(p,e); return; }
      const t = current(p,e.taskId); amend(copy(t),e); // Validate projected domains without applying.
      check(!workValues(p.intents).some(i => i.kind === 'amendment-proposed' && i.authorization.authorizationId === e.authorization.authorizationId),'Authorization ID reused'); retainIntent(p,e); return;
    }
    case 'automatic-action-prepared': {
      if (p.intents[e.operationId]) { retainIntent(p,e); return; }
      const t = current(p,e.taskId); check(scan(p.holdCauses).some(c => c.causeId === e.causeId),'Automatic action lacks identified cause');
      if (e.reportId !== null) check(p.reports[e.reportId]?.producerIdentity.taskId === t.taskId,'Automatic action report mismatch');
      // A null repair reportId denotes the identified malformed/unretained input
      // artifact. It does not invent report content or implementation authority.
      retainIntent(p,e); return;
    }
    case 'reconciliation-proposed': {
      if (p.intents[e.operationId]) { retainIntent(p,e); return; }
      if (!e.evidenceIds.length) { blocked(p,e); return; }
      check(scan(e.evidenceIds).every(x => p.receipts[x] || p.evidence[x] || p.barriers[x]),'Reconciliation evidence missing');
      retainIntent(p,e); return;
    }
    case 'reset-requested': {
      if (p.intents[e.operationId]) { retainIntent(p,e); return; }
      if (!resetReady(p,e,genesis,prior)) { blocked(p,e); return; }
      retainIntent(p,e); return;
    }
    case 'lifecycle': {
      if (p.control) check(e.sequence > p.control.sequence && e.at >= p.control.at,'Nonmonotonic control sequence');
      p.control = e;
      const root = {kind:/** @type {const} */ ('root'),id:p.fence.workerId};
      switch(e.command) {
        case 'enable': resolve(p,'disabled',root,e.observationId); break;
        case 'start': resolve(p,'stopped',root,e.observationId); break;
        case 'resume': {
          const t = p.task;
          if (t?.kind === 'legacy-held' && t.pending !== null) { resolve(p,'paused',root,e.observationId); resolve(p,'interrupted',root,e.observationId); }
          else if (t?.kind === 'current' && t.obligation && !['completed','cancelled'].includes(t.status)) { t.status = t.obligation.kind === 'report' ? 'waiting' : 'continuation-pending'; resolve(p,'paused',root,e.observationId); resolve(p,'interrupted',root,e.observationId); }
          else { blocked(p,e,'interrupted'); return; }
          // Resume never supersedes a notice, rotates identity, resets budgets,
          // clears other causes, or creates a decision/implementation obligation.
          break;
        }
        case 'cancel': {
          const t = p.task;
          if (t) t.status = 'cancelled';
          if (t?.kind === 'current' && t.obligation?.kind === 'continuation' && !p.grants[t.obligation.operationId]) {
            // Disposition only of the not-yet-issued logical dispatch. Decisions,
            // notices, issued grants, physical effects and accounting survive.
            const {kind,...obligation} = t.obligation;
            t.cancelledContinuations.push({...obligation,cancelledBy:e}); t.obligation = null;
          }
          closeCurrent(p,e,'cancelled'); break;
        }
        case 'stop': case 'disable': case 'pause': { const reason = e.command === 'stop' ? 'stopped' : e.command === 'disable' ? 'disabled' : 'paused'; hold(p,e.observationId,reason,root,e.at); closeCurrent(p,e,reason); break; }
        default: unreachable(e.command);
      }
      p.outcome = {kind:'apply',reason:'lifecycle'}; return;
    }
    case 'owner-replaced': {
      const a = p.fence, b = e.next;
      if (same(a,b)) { p.outcome = {kind:'noop',reason:'duplicate'}; return; }
      check(a.workspace === b.workspace && a.repoRoot === b.repoRoot && a.workerId === b.workerId && b.ownerEpoch >= a.ownerEpoch && b.workerGeneration >= a.workerGeneration && (b.ownerEpoch !== a.ownerEpoch || b.ownerSession === a.ownerSession) && (b.workerGeneration !== a.workerGeneration || (b.sessionId === a.sessionId && b.nonce === a.nonce)) && (b.ownerEpoch > a.ownerEpoch || b.workerGeneration > a.workerGeneration),'Invalid owner succession');
      const t = p.task;
      if (t?.kind === 'current') {
        hold(p,e.observationId,'stale-owner',{kind:'task',id:t.taskId},e.at);
        if (t.currentGrantOperationId && !barrierFor(p,t.currentGrantOperationId)) {
          for (const metric of scan(/** @type {const} */ (['activeMs','turns','costUsd','inputTokens','outputTokens']))) for (const stepId of scan([null,t.steps[t.stepIndex].id])) t.accounting.gaps.push({gapId:e.observationId,metric,stepId,reason:'crash-or-owner-replacement'});
          t.accounting.revision = e.observationId; t.accounting.at = Math.max(t.accounting.at,e.at); hold(p,e.observationId,'unknown-accounting',{kind:'task',id:t.taskId},e.at);
        }
      }
      closeCurrent(p,e,'stale-owner'); p.fence = b; p.control = null; p.runtime = null; p.outcome = {kind:'apply',reason:'fenced'}; return;
    }
    case 'runtime': {
      if (p.runtime) check(e.observation.sequence > p.runtime.observation.sequence && e.at >= p.runtime.at,'Nonmonotonic runtime sequence');
      p.runtime = e; return; // Idle/stopped never supplies an effect barrier.
    }
    case 'failure': {
      const f = e.failure;
      const notice = f.source === 'main-notification';
      check(notice ? !!p.notices[f.operationId] : !!p.grants[f.operationId] || !!p.promptDeliveries[f.operationId] || !!p.intents[f.operationId],'Failure operation missing');
      p.failures.push(e); const reason = f.source === 'effect-boundary' ? 'uncertain-effect' : 'uncertain-delivery';
      hold(p,e.observationId,reason,{kind:notice ? 'notice' : 'operation',id:f.operationId},e.at); closeCurrent(p,e,reason); p.outcome = {kind:'hold',reason:'uncertain'}; return;
    }
    case 'unsupported': blocked(p,e); return;
  }
  return unreachable(e);
}

/** Validate a genesis seed. Historical holds are explicit, unresolved and retained;
 * legacy-held always carries legacy + unknown-accounting and cannot acquire grants.
 * @param {unknown} value @returns {Genesis}
 */
function parseGenesis(value) {
  const v = record(value,['fence','legacy','holds']), f = fence(v.fence), l = v.legacy === null ? null : legacy(v.legacy), h = list(v.holds).map(cause);
  check(scan(h).every(c => c.resolvedBy === null && c.scope.kind === 'root' && c.scope.id === f.workerId),'Invalid genesis hold');
  check(unique(scan(h).map(c => `${c.causeId}/${c.reason}`)).size === h.length,'Duplicate genesis cause');
  if (l) check(scan(h).some(c => c.reason === 'legacy') && scan(h).some(c => c.reason === 'unknown-accounting'),'Legacy must remain held/unknown');
  return {fence:f,legacy:l,holds:h};
}
/** Rebuild every retained projection. This is structural/history validation, not a
 * provenance oracle. Replay-local mutation never aliases caller input or snapshots.
 * @param {Genesis} genesis @param {TransitionEvent[]} events @returns {{projection:Projection, prior:TransitionEvent[]}}
 */
function project(genesis,events) {
  /** @type {Projection} */
  const p = {fence:copy(genesis.fence),task:copy(genesis.legacy),tasks:{},grants:{},promptDeliveries:{},reports:{},decisions:{},notices:{},intents:{},commitments:{},queue:[],receipts:{},holdCauses:copy(genesis.holds),holds:[],barriers:{},evidence:{},checkpoints:{},usage:{},counters:{},failures:[],control:null,runtime:null,resets:[],outcome:{kind:'noop',reason:'duplicate'}};
  holds(p);
  /** @type {TransitionEvent[]} */ const prior = [];
  for (const e of scan(events)) projectStep(p,e,genesis,prior);
  return {projection:p,prior};
}
/** The single historical/incremental step. prior retains only non-noop events,
 * exactly as historical replay does; canonical events still retain all positions.
 * @param {Projection} p @param {TransitionEvent} e @param {Genesis} genesis @param {TransitionEvent[]} prior */
function projectStep(p,e,genesis,prior) {
    // Exact held proposals may be re-evaluated after their prerequisite changes.
    // Keep both journal positions (and one immutable receipt); changed content or
    // a new observation under the same operation is still a conflict, except
    // explicit snapshot refresh of a held, unprepared grant. Archive hashes cover
    // the full journal while coverage IDs identify unique receipts.
    const retry = p.receipts[e.observationId] && scan(p.holdCauses).some(c => c.causeId === e.observationId && c.resolvedBy === null && requestHold(c));
    const before = retry ? copy(p) : null;
    applyEvent(p,e,genesis,prior);
    if (retry && p.outcome.kind === 'apply') {
      for (const c of scan(p.holdCauses)) if (c.causeId === e.observationId && c.resolvedBy === null && requestHold(c)) c.resolvedBy = e.observationId;
      holds(p);
    } else if (before && same({...before,outcome:p.outcome},p)) p.outcome = {kind:'noop',reason:'duplicate'};
    if (p.outcome.kind !== 'noop') { p.receipts[e.observationId] = e; prior.push(e); }
    invariant(workValues(p.grants).filter(g => g.phase !== 'closed').length <= 1,'Parallel admission');
    invariant(p.task?.kind !== 'legacy-held' || (workKeys(p.grants).length === 0 && scan(p.holds).includes('legacy') && scan(p.holds).includes('unknown-accounting')),'Legacy invariant lost');
}

/**
 * Validate either {mode,genesis,events} or that canonical history plus ALL derived
 * fields. Supplied projections are checked, never accepted as independent state.
 * This validates historical counter/budget monotonicity, closure, obligation and
 * identity conservation by replay, including all intermediate admission conditions.
 * No source tag, hash, receipt, authorization record or storage witness proves trust.
 * @param {unknown} value @returns {CoordinationModel}
 */
function validateCoordinationModel(value) {
  if (context && value !== null && typeof value === 'object' && models.has(value)) return /** @type {CoordinationModel} */ (value);
  if (context) value = ensureLegacyInert(value, 'kernel.model', context); else inert(value);
  const v = record(value,['mode','genesis','events'],projectionKeys); choice(v.mode,['internal-non-authorizing']);
  const genesis = parseGenesis(copy(v.genesis)), events = list(v.events).map(e => context ? validateTransitionEvent(e) : parseEvent(copy(e))), {projection,prior} = project(genesis,events);
  if (workKeys(v).length !== 3) { record(v,['mode','genesis','events',...projectionKeys]); for (const key of projectionKeys) check(same(v[key],Reflect.get(projection,key)),`Inconsistent projection: ${key}`); }
  return publish(genesis,events,projection,prior);
}
const projectionKeys = ['fence','task','tasks','grants','promptDeliveries','reports','decisions','notices','intents','commitments','queue','receipts','holdCauses','holds','barriers','evidence','checkpoints','usage','counters','failures','control','runtime','resets','outcome'];
/** Only this closed construction can enter the private result cache.
 * Materialization/freeze traversal pays work; the aggregate separately charges
 * EVERY occurrence in its complete returned view using the unchanged C3 capture.
 * @param {Genesis} genesis @param {TransitionEvent[]} events @param {Projection} projection @param {TransitionEvent[]} prior @returns {CoordinationModel} */
function publish(genesis,events,projection,prior) {
  const model = {mode:/** @type {const} */ ('internal-non-authorizing'),genesis,events,...projection};
  if (context) { tree(model); freeze(model); freeze(prior); models.set(model,prior); }
  return model;
}
/** Fork a genuine same-operation immutable projection and replay exactly ONE
 * event. Never thaw/mutate a cached result. Internal graph aliases (task/tasks)
 * survive the fork; no external aliases or caches can reach this branch.
 * @param {unknown} snapshot @param {unknown} input @returns {CoordinationModel} */
function append(snapshot,input) {
  if (!context) throw new TypeError('Incremental kernel requires an operation context');
  const model = validateCoordinationModel(snapshot), event = validateTransitionEvent(input);
  const retained = models.get(model); invariant(retained,'Kernel model lacks private replay state');
  /** @type {Record<string,unknown>} */ const fields = {};
  for (const key of projectionKeys) fields[key] = Reflect.get(model,key);
  const projection = /** @type {Projection} */ (fork(fields));
  const prior = [...scan(retained)];
  projectStep(projection,event,model.genesis,prior);
  return publish(model.genesis,[...scan(model.events),event],projection,prior);
}
return {validateTransitionEvent,validateCoordinationModel,append,parseEvent,parseChange,parsePlanChange};
}

/**
 * Private AR-03/T05 leaves, ar3-common-abi/2 + inspectLegacySource.
 * No runtime integration, migration effects, provenance, or replay admission.
 *
 * All entry points share one common operation budget (including raw sources,
 * resolved references and digest work). Closed captured records are returned
 * unchanged: no normalization, root recapture, defaults, or trusted markers.
 * A caller composing these leaves MUST supply the enclosing common context.
 *
 * Source/backup inputs are separate occurrences. `supplied` means byte equality,
 * NOT durable backup. Host must retain original binary input, particularly when
 * preservation.original is null, until a durable exact-byte backup exists.
 * Preinspection failures throw without byte facts. Recognized decode failures
 * can validate a held record; spent budgets are never refunded. We do not catch
 * exhaustion to construct an unbudgeted diagnostic. Host retains source/refs on
 * every throw. Programming errors escape unchanged.
 */
import { types as nodeTypes } from 'node:util';
import {
  COMMON_BOUNDS, V1_CARRIER_ENCODING, ContractValidationError,
  createValidationContext, ensureInert, inspectLegacySource, consumeValidationWork,
  decodeReferencedPairJSON, consumeReference, hashBytes, pairDigest,
  validateId, validateHash, validateCounter, validateArtifactRef,
  validateOwnerBinding, validateActorBinding, validateActorDefinitionV3,
  validateArchiveReferenceV2,
} from './actor-contract-common.js';
import { classifyStoredState } from './contracts.js';

/** @typedef {import('./actor-contract-common.js').ValidationContext} ValidationContext */
/** @typedef {import('./actor-contract-common.js').JSONValue} JSONValue */
/** @typedef {import('./actor-contract-common.js').JSONRecord} JSONRecord */
/** @typedef {import('./actor-contract-common.js').ArtifactRef} ArtifactRef */
/** @typedef {import('./actor-contract-common.js').OwnerBinding} OwnerBinding */
/** @typedef {import('./actor-contract-common.js').ActorBinding} ActorBinding */
/** @typedef {import('./actor-contract-common.js').ActorDefinitionV3} ActorDefinitionV3 */
/** @typedef {import('./actor-contract-common.js').V1Carrier} V1Carrier */
/** @typedef {import('./actor-contract-common.js').LegacyInspectionIssue} MigrationIssueV2 */
/** Resolver bytes are not persisted V2 fields or proof of durable backup.
 * @typedef {Readonly<{version:2, kind:'held-legacy', sourceInput:string|Uint8Array, backupInput:string|Uint8Array|null}>} HeldLegacyProjectionContext
 */
/** `known` identifies a recognized worker, not complete identity or provenance.
 * @typedef {Readonly<{nonAuthorizing:true, workerId:string, session:string|null, status:'held'|'cancelled', heldReasons:readonly string[], taskRef:string|null, pendingObligationRefs:readonly string[], historyRefs:readonly string[], diagnostics:readonly string[], known:boolean}>} LegacyWorkerView
 */
/** The common five fields are preserved exactly; priorRoot names the preceding
 * segmentId, not a hash or a fabricated historical execution identity.
 * @typedef {import('./actor-contract-common.js').ArchiveReferenceV2} ArchiveRefV2
 */
/** @typedef {Readonly<{ref:string, hash:string, byteLength:number}>} LegacyByteRefV2 */
/** @typedef {Readonly<{inspect:ArtifactRef, cancel:ArtifactRef, reconcile:ArtifactRef}>} RetentionVisibilityV2 */
/** @typedef {'question'|'review'|'blocker'|'cancellation'|'activation'} RetainedObligationKindV2 */
/** @typedef {Readonly<{obligationId:string, kind:RetainedObligationKindV2, sourcePath:string, subject:ArtifactRef, visibility:RetentionVisibilityV2}> & (Readonly<{status:'pending'|'uncertain', resolution:null}>|Readonly<{status:'resolved', resolution:ArtifactRef}>)} RetainedObligationRefV2 */
/** @typedef {Readonly<{kind:'missing', reference:null}>|Readonly<{kind:'unresolved'|'supplied', reference:LegacyByteRefV2}>} LegacyBackupV2 */
/** @typedef {Readonly<{path:string, policyLayout:'pre-deferred-policy'|'current-policy', alias:'final'|'strict'|null}>} LegacyTaskLayoutV2 */
/** @typedef {Readonly<{path:string, profile:'current'|'historical', record:'telemetry'|'probe'}>} LegacyDiagnosticLayoutV2 */
/** @typedef {Readonly<{code:string, path:string}>} LegacyReconciliationReasonV2 */
/** @typedef {Readonly<{kind:'recognized', identityLayout:'pre-identity'|'identity-bearing', taskLayouts:readonly LegacyTaskLayoutV2[], diagnosticLayouts:readonly LegacyDiagnosticLayoutV2[], bindingSource:'original-carrier', bindingStatus:'unchecked', reconciliationReasons:readonly LegacyReconciliationReasonV2[]}>|Readonly<{kind:'rejected', issue:MigrationIssueV2}>|Readonly<{kind:'undecodable'|'unclassified'}>} LegacyProfileV2 */
/** A V1 carrier is a separate, paid V2 representation. Its hash is migration-domain
 * over ALL FOUR carrier fields, excluding this surrounding carrierHash field.
 * @typedef {Readonly<{kind:'decoded', carrier:V1Carrier, carrierHash:string}>|Readonly<{kind:'held', original:string|null, issue:MigrationIssueV2}>} LegacyPreservationV2
 */
/** @typedef {'stored-state'|'retained-payload'|'retained-archive'} LegacyOperationV2 */
/** @typedef {Readonly<{version:2, encoding:'pair-held-legacy/1', nonAuthorizing:true, evidenceId:string, operation:LegacyOperationV2, source:LegacyByteRefV2, backup:LegacyBackupV2, sourceVersion:number|null, profile:LegacyProfileV2, preservation:LegacyPreservationV2, visibility:RetentionVisibilityV2, artifacts:readonly LegacyByteRefV2[], obligations:readonly RetainedObligationRefV2[], primaryIssue:MigrationIssueV2|null, rollbackIssue:MigrationIssueV2|null}>} HeldLegacyEvidenceV2 */
/** @typedef {Readonly<{storeId:string, version:2, hash:string}>} MigrationTargetV2 */
/** @typedef {Readonly<{version:2, encoding:'pair-migration/1', nonAuthorizing:true, migrationId:string, owner:OwnerBinding, legacy:HeldLegacyEvidenceV2, primaryIssue:MigrationIssueV2|null, rollbackIssue:MigrationIssueV2|null, adoption:'requires-reconciliation'}> & (Readonly<{stage:'classified'|'backed-up', target:null, commitRef:null}>|Readonly<{stage:'prepared', target:MigrationTargetV2, commitRef:null}>|Readonly<{stage:'committed', target:MigrationTargetV2, commitRef:ArtifactRef}>|Readonly<{stage:'held', target:MigrationTargetV2|null, commitRef:ArtifactRef|null}>)} MigrationManifestV2 */
/** Explicit cumulative observations, never defaults or a completeness assertion.
 * T08 replays the observations and checks these totals at historical prefixes.
 * @typedef {Readonly<{events:number, operations:number, activations:number, reports:number, inputTokens:number, outputTokens:number, costUsd:number}>} ArchiveCountersV2
 */
/** @typedef {Readonly<{operationId:string, outcome:'completed'|'cancelled'|'failed'|'reconciled', receipt:ArtifactRef}>} ArchiveDispositionV2 */
/** @typedef {Readonly<{version:2, encoding:'pair-archive-checkpoint/1', nonAuthorizing:true, archive:ArchiveRefV2, rootHash:string, rootRevision:number, nextSegmentId:string, owner:OwnerBinding, actors:readonly ActorBinding[], counters:ArchiveCountersV2, dispositions:readonly ArchiveDispositionV2[], artifacts:readonly LegacyByteRefV2[], obligations:readonly RetainedObligationRefV2[]}>} ArchiveCheckpointV2 */
/** Deliberately a replay INPUT, not an admitted actor event. T08 must validate the
 * domain-specific payload union and complete historical prefixes. This leaf only
 * checks the closed event header and bounded inert payload record.
 * @typedef {Readonly<{eventId:string, sequence:number, at:number, owner:OwnerBinding, workflowId:string|null, domain:'actor'|'implementation', payload:JSONRecord}>} ArchiveReplayEventInputV2
 */
/** configSnapshot likewise remains a bounded replay input, not a Config V3 result.
 * @typedef {Readonly<{version:2, encoding:'pair-actor-state/1', segmentId:string, genesis:Readonly<{storeId:string, initialOwner:OwnerBinding, actorDefinitions:readonly ActorDefinitionV3[], configSnapshot:JSONRecord, heldLegacyRefs:readonly ArtifactRef[], checkpoint:ArchiveCheckpointV2|null}>, events:readonly ArchiveReplayEventInputV2[], archiveHead:ArchiveRefV2|null}>} ArchiveReplayInputV2
 */
/** Both representations are explicit input occurrences and pay their actual size.
 * Raw text is decoded once, and its state digest must equal decoded's state digest.
 * This avoids making a new, uncharged root while exposing replay inputs to T08.
 * @typedef {Readonly<{reference:ArchiveRefV2, checkpoint:ArchiveCheckpointV2, original:string, decoded:ArchiveReplayInputV2}>} ArchiveSegmentV2
 */
/** @typedef {Readonly<{reference:LegacyByteRefV2, original:string}>} ArchiveResolvedArtifactV2 */
/** No optional/opaque context or caller assertion of verification. A nonempty
 * context is a complete bounded chain from an explicit null predecessor.
 * @typedef {Readonly<{version:2, kind:'empty', storeId:string, head:null, segments:readonly [], artifacts:readonly []}>|Readonly<{version:2, kind:'chain', storeId:string, head:ArchiveRefV2, segments:readonly [ArchiveSegmentV2, ...ArchiveSegmentV2[]], artifacts:readonly ArchiveResolvedArtifactV2[]}>} ArchiveValidationContext
 */

/** @param {unknown} condition @param {string} path @param {string} message @param {string} [code] @returns {asserts condition} */
function check(condition, path, message, code = 'invalid-field') {
  if (!condition) throw new ContractValidationError(code, path, message);
}
/** @param {JSONValue} value @param {string} path @returns {JSONRecord} */
function object(value, path) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'Expected record');
  return /** @type {JSONRecord} */ (value);
}
/** Only called on captured data. All fields required; no optional extras.
 * @param {JSONValue} value @param {readonly string[]} keys @param {string} path @returns {JSONRecord}
 */
function closed(value, keys, path) {
  const v = object(value, path);
  for (const key of keys) check(Object.hasOwn(v, key), `${path}.${key}`, 'Missing field', 'missing-required-field');
  for (const key of Object.keys(v)) check(keys.includes(key), path, 'Unknown field');
  return v;
}
/** @param {JSONValue} value @param {string} path @param {number} maximum @returns {readonly JSONValue[]} */
function list(value, path, maximum) {
  check(Array.isArray(value) && value.length <= maximum, path, 'Expected bounded array', 'capacity'); return value;
}
/** @param {unknown} value @param {string} path @returns {string} */
function text(value, path) {
  check(typeof value === 'string' && value.length <= COMMON_BOUNDS.maxTextBytes && value.trim().length > 0 &&
    Buffer.byteLength(value, 'utf8') <= COMMON_BOUNDS.maxTextBytes, path, 'Expected nonempty bounded UTF-8 text');
  return value;
}
/** @template {string} T @param {unknown} value @param {readonly T[]} choices @param {string} path @returns {T} */
function choice(value, choices, path) {
  const found = choices.find(entry => value === entry); check(found !== undefined, path, 'Unsupported discriminant'); return found;
}
/** @param {unknown} value @param {string} path @param {number} [minimum] @param {number} [maximum] */
function count(value, path, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const n = validateCounter(value, path); check(n >= minimum && n <= maximum, path, 'Counter outside bounds', 'capacity'); return n;
}
/** @param {JSONRecord} v @param {string} encoding @param {string} path */
function version(v, encoding, path) {
  if (v.version !== 2 || v.encoding !== encoding) throw new ContractValidationError('unsupported-version', path, 'Unsupported record version/encoding', 'unsupported');
  check(v.nonAuthorizing === true, `${path}.nonAuthorizing`, 'Pure records are non-authorizing');
}
/** Bounded equality on captured/decoded inert trees, not a serializer or capture.
 * @param {JSONValue} a @param {JSONValue} b @returns {boolean}
 */
function same(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    const left = /** @type {readonly JSONValue[]} */ (a), right = /** @type {readonly JSONValue[]} */ (b);
    return left.length === right.length && left.every((entry, index) => same(entry, right[index]));
  }
  const left = /** @type {JSONRecord} */ (a), right = /** @type {JSONRecord} */ (b), keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && same(left[key], right[key]));
}
/** @param {Set<string>} seen @param {string} key @param {string} path */
function unique(seen, key, path) { check(!seen.has(key), path, 'Duplicate or conflicting identity', 'inconsistent-reference'); seen.add(key); }
/** @param {JSONValue} value @param {string} path @returns {MigrationIssueV2} */
function issue(value, path) {
  const v = closed(value, ['code', 'path', 'message', 'category'], path);
  text(v.code, `${path}.code`); text(v.path, `${path}.path`); text(v.message, `${path}.message`);
  choice(v.category, ['corrupt', 'unsupported'], `${path}.category`);
  return /** @type {MigrationIssueV2} */ (v);
}
/** @param {JSONValue} value @param {string} path */
function nullableIssue(value, path) { return value === null ? null : issue(value, path); }
/** @param {JSONValue} value @param {string} path @param {number} maximum @returns {LegacyByteRefV2} */
function byteRef(value, path, maximum) {
  const v = closed(value, ['ref', 'hash', 'byteLength'], path);
  text(v.ref, `${path}.ref`); validateHash(v.hash, `${path}.hash`); count(v.byteLength, `${path}.byteLength`, 0, maximum);
  return /** @type {LegacyByteRefV2} */ (v);
}
/** @param {JSONValue} value @param {ValidationContext} context @param {string} path @returns {readonly LegacyByteRefV2[]} */
function byteRefs(value, context, path) {
  const entries = list(value, path, context.maxReferences);
  /** @type {Set<string>} */ const seen = new Set();
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const ref = byteRef(entries[i], `${path}.${i}`, context.maxReferenceBytes);
    unique(seen, ref.ref, path); total += ref.byteLength;
    check(total <= context.maxReferencedBytes, path, 'Declared reference capacity exceeded', 'capacity');
  }
  return /** @type {readonly LegacyByteRefV2[]} */ (entries);
}
/** @param {JSONValue} value @param {ValidationContext} context @param {string} path @returns {RetentionVisibilityV2} */
function visibility(value, context, path) {
  const v = closed(value, ['inspect', 'cancel', 'reconcile'], path);
  for (const key of ['inspect', 'cancel', 'reconcile']) validateArtifactRef(v[key], context);
  return /** @type {RetentionVisibilityV2} */ (v);
}
/** @param {JSONValue} value @param {ValidationContext} context @param {string} path @param {boolean} resolved @returns {readonly RetainedObligationRefV2[]} */
function obligations(value, context, path, resolved) {
  const entries = list(value, path, COMMON_BOUNDS.maxUnresolvedOperations);
  /** @type {Set<string>} */ const ids = new Set();
  /** @type {Set<string>} */ const subjects = new Set();
  for (let i = 0; i < entries.length; i++) {
    const at = `${path}.${i}`, v = closed(entries[i], ['obligationId', 'kind', 'sourcePath', 'subject', 'visibility', 'status', 'resolution'], at);
    unique(ids, validateId(v.obligationId, `${at}.obligationId`), at);
    const kind = choice(v.kind, ['question', 'review', 'blocker', 'cancellation', 'activation'], `${at}.kind`);
    const sourcePath = text(v.sourcePath, `${at}.sourcePath`), subject = validateArtifactRef(v.subject, context);
    unique(subjects, JSON.stringify([kind, subject.ref, sourcePath]), at);
    visibility(v.visibility, context, `${at}.visibility`);
    const status = choice(v.status, ['pending', 'uncertain', 'resolved'], `${at}.status`);
    check(!resolved || status === 'resolved', at, 'Unresolved obligation cannot be archived', 'inconsistent-reference');
    if (status === 'resolved') validateArtifactRef(v.resolution, context);
    else check(v.resolution === null, `${at}.resolution`, 'Unresolved obligation has a resolution');
  }
  return /** @type {readonly RetainedObligationRefV2[]} */ (entries);
}
/** @param {readonly LegacyByteRefV2[]} refs @param {string} path @returns {Map<string, LegacyByteRefV2>} */
function referenceMap(refs, path) {
  /** @type {Map<string, LegacyByteRefV2>} */ const result = new Map(/** @type {readonly (readonly [string, LegacyByteRefV2])[]} */ ([]));
  for (const ref of refs) { check(!result.has(ref.ref), path, 'Duplicate reference path', 'inconsistent-reference'); result.set(ref.ref, ref); }
  return result;
}
/** @param {ArtifactRef} ref @param {ReadonlyMap<string, LegacyByteRefV2>} available @param {string} path */
function covered(ref, available, path) {
  const found = available.get(ref.ref);
  check(found && found.hash === ref.hash, path, 'Missing or conflicting retained artifact', 'inconsistent-reference');
}
/** @param {RetentionVisibilityV2} v @param {ReadonlyMap<string, LegacyByteRefV2>} available @param {string} path */
function visible(v, available, path) { covered(v.inspect, available, path); covered(v.cancel, available, path); covered(v.reconcile, available, path); }
/** @param {readonly RetainedObligationRefV2[]} refs @param {ReadonlyMap<string, LegacyByteRefV2>} available @param {string} path */
function coverObligations(refs, available, path) {
  for (const ref of refs) { covered(ref.subject, available, path); visible(ref.visibility, available, path); if (ref.resolution !== null) covered(ref.resolution, available, path); }
}

/** Common reference shape only, not archive admission or byte provenance.
 * @param {unknown} value @param {ValidationContext} [context] @returns {ArchiveRefV2}
 */
export function validateArchiveRefV2(value, context = createValidationContext()) {
  const ref = validateArchiveReferenceV2(value, context);
  check(ref.byteLength > 0 && ref.byteLength <= Math.min(context.maxBytes, context.maxReferencedBytes) && ref.priorRoot !== ref.segmentId,
    'archiveReference', 'Empty, oversized or self-linked archive reference');
  return ref;
}

/** @param {JSONValue} value @param {string} path @returns {LegacyProfileV2} */
function profile(value, path) {
  const input = object(value, path);
  const kind = choice(input.kind, ['recognized', 'rejected', 'undecodable', 'unclassified'], `${path}.kind`);
  if (kind === 'recognized') {
    const v = closed(input, ['kind', 'identityLayout', 'taskLayouts', 'diagnosticLayouts', 'bindingSource', 'bindingStatus', 'reconciliationReasons'], path);
    choice(v.identityLayout, ['pre-identity', 'identity-bearing'], `${path}.identityLayout`);
    check(v.bindingStatus === 'unchecked', path, 'Classification cannot authorize a binding');
    // Legacy binding text can be empty or contain escaped lone surrogates.
    // Retain it ONLY in the exact V1 carrier; never recapture it as V2 strings.
    check(v.bindingSource === 'original-carrier', path, 'Source binding must remain in its original representation');
    for (const entry of list(v.taskLayouts, `${path}.taskLayouts`, COMMON_BOUNDS.maxNodes)) {
      const t = closed(entry, ['path', 'policyLayout', 'alias'], path); text(t.path, path);
      choice(t.policyLayout, ['pre-deferred-policy', 'current-policy'], path);
      check(t.alias === null || t.alias === 'final' || t.alias === 'strict', path, 'Invalid legacy alias');
    }
    for (const entry of list(v.diagnosticLayouts, `${path}.diagnosticLayouts`, COMMON_BOUNDS.maxNodes)) {
      const d = closed(entry, ['path', 'profile', 'record'], path); text(d.path, path);
      choice(d.profile, ['historical', 'current'], path); choice(d.record, ['telemetry', 'probe'], path);
    }
    for (const entry of list(v.reconciliationReasons, `${path}.reconciliationReasons`, COMMON_BOUNDS.maxNodes)) {
      const r = closed(entry, ['code', 'path'], path); text(r.code, path); text(r.path, path);
    }
  } else if (kind === 'rejected') issue(closed(input, ['kind', 'issue'], path).issue, `${path}.issue`);
  else closed(input, ['kind'], path);
  return /** @type {LegacyProfileV2} */ (input);
}
/** Compare a non-authorizing classifier result WITHOUT copying its borrowed
 * original, generating execution identities, or serializing new diagnostics.
 * @param {LegacyProfileV2} p @param {JSONValue} decoded @param {string} path
 */
function matchStateProfile(p, decoded, path) {
  const classification = classifyStoredState(decoded);
  check(p.kind === classification.kind, path, 'Source classification mismatch', 'inconsistent-reference');
  if (classification.kind === 'rejected') {
    check(p.kind === 'rejected' && p.issue.category === classification.category &&
      p.issue.code === classification.issue.code && p.issue.path === classification.issue.path && p.issue.message === classification.issue.message,
    path, 'Source rejection facts mismatch', 'inconsistent-reference');
  } else {
    check(p.kind === 'recognized', path, 'Expected recognized profile');
    check(p.identityLayout === classification.identityLayout && same(p.taskLayouts, classification.taskLayouts) &&
      same(p.diagnosticLayouts, classification.diagnosticLayouts) &&
      same(p.reconciliationReasons, classification.reconciliationReasons), path, 'Source profile mismatch', 'inconsistent-reference');
  }
}
/** Exact conservative coverage of retained legacy tasks/reports/cancellation
 * facts. A complete original-source visibility ref also retains history, notices
 * and unsupported fields. This inventory is NOT replay or execution provenance;
 * no resolved status is inferred from a task's status, expiry, pause or resume.
 * @param {JSONValue} decoded @param {HeldLegacyEvidenceV2} evidence
 */
function legacyCoverage(decoded, evidence) {
  if (evidence.profile.kind !== 'recognized') return;
  const root = object(decoded, 'legacy'), workers = object(root.workers, 'legacy.workers');
  /** @param {RetainedObligationKindV2} kind @param {string} path */
  function requireObligation(kind, path) {
    check(evidence.obligations.some(ref => ref.kind === kind && ref.sourcePath === path &&
      ref.subject.ref === evidence.source.ref && ref.subject.hash === evidence.source.hash), path,
    'Retained legacy obligation lacks visibility coverage', 'inconsistent-reference');
  }
  for (const [workerId, entry] of Object.entries(workers)) {
    const worker = object(entry, 'legacy.worker');
    if (worker.task === null) continue;
    const task = object(worker.task, 'legacy.task'), path = `state.workers.${workerId}.task`;
    requireObligation('activation', path);
    for (const state of [task.status, task.previousStatus]) {
      if (state === 'question') requireObligation('question', path);
      if (state === 'review') requireObligation('review', path);
      if (state === 'blocked') requireObligation('blocker', path);
      if (state === 'cancelled') requireObligation('cancellation', path);
    }
    if (task.abortRequested === true || Object.hasOwn(task, 'cancelReason')) requireObligation('cancellation', path);
    for (const key of ['pendingReport', 'report']) {
      if (task[key] === null) continue;
      const report = object(task[key], path), payload = object(report.payload, path);
      requireObligation(payload.kind === 'question' ? 'question' : payload.kind === 'blocked' ? 'blocker' : 'review', `${path}.${key}`);
    }
    const decisions = object(task.decisions, `${path}.decisions`);
    for (const [reportId, entry] of Object.entries(decisions)) {
      if (object(entry, path).action === 'cancel') requireObligation('cancellation', `${path}.decisions.${reportId}`);
    }
  }
  for (const noticeId of Object.keys(object(root.notices, 'state.notices'))) requireObligation('review', `state.notices.${noticeId}`);
}

/** Validates a persisted held record AGAINST exact source bytes. `sourceInput`
 * and `backupInput` accept the common inspector's string/Uint8Array/Buffer input;
 * backupInput MUST be null for missing/unresolved backups. Invalid input or
 * exhausted admission throws, never fabricates oversized-source facts.
 *
 * The supplied carrier is captured once as part of this new V2 representation;
 * inspector.value goes directly to classifyStoredState. No second source decode,
 * hashBytes, legacy hash, createV1Carrier or validateV1Carrier call occurs.
 * @param {unknown} value @param {unknown} sourceInput @param {unknown} backupInput
 * @param {ValidationContext} [context] @returns {HeldLegacyEvidenceV2}
 */
export function validateHeldLegacyEvidenceV2(value, sourceInput, backupInput, context = createValidationContext()) {
  return inspectHeldLegacyEvidenceInContext(value, sourceInput, backupInput, context).evidence;
}

/** One inspection shared by validation and held projection; the borrowed decoded
 * V1 tree never becomes a V2 DTO, cache authority or historical execution proof.
 * @param {unknown} value @param {unknown} sourceInput @param {unknown} backupInput
 * @param {ValidationContext} context
 */
function inspectHeldLegacyEvidenceInContext(value, sourceInput, backupInput, context) {
  const p = 'heldLegacy', v = closed(ensureInert(value, p, context), ['version', 'encoding', 'nonAuthorizing', 'evidenceId', 'operation', 'source', 'backup', 'sourceVersion', 'profile', 'preservation', 'visibility', 'artifacts', 'obligations', 'primaryIssue', 'rollbackIssue'], p);
  version(v, 'pair-held-legacy/1', p); validateId(v.evidenceId, `${p}.evidenceId`);
  const operation = choice(v.operation, ['stored-state', 'retained-payload', 'retained-archive'], `${p}.operation`);
  // Closed enclosing policy, not an untrusted source label or a size fallback.
  const sourceKind = operation === 'stored-state' ? 'state' : operation === 'retained-payload' ? 'payload' : 'archive';
  const maximum = sourceKind === 'payload' ? COMMON_BOUNDS.maxReferenceBytes : COMMON_BOUNDS.maxBytes;
  const source = byteRef(v.source, `${p}.source`, maximum), b = object(v.backup, `${p}.backup`);
  const backupKind = choice(b.kind, ['missing', 'unresolved', 'supplied'], `${p}.backup.kind`);
  closed(b, ['kind', 'reference'], `${p}.backup`);
  const backup = backupKind === 'missing' ? null : byteRef(b.reference, `${p}.backup.reference`, maximum);
  if (backup === null) check(b.reference === null, `${p}.backup.reference`, 'Missing backup must have null reference');
  else check(backup.ref !== source.ref && backup.hash === source.hash && backup.byteLength === source.byteLength,
    `${p}.backup`, 'Backup must independently name the exact source bytes', 'inconsistent-reference');
  if (backupKind !== 'supplied') check(backupInput === null, `${p}.backup`, 'Unexpected backup bytes');
  const sourceProfile = profile(v.profile, `${p}.profile`);
  if (v.sourceVersion !== null) count(v.sourceVersion, `${p}.sourceVersion`);
  nullableIssue(v.primaryIssue, `${p}.primaryIssue`); nullableIssue(v.rollbackIssue, `${p}.rollbackIssue`);
  check(v.rollbackIssue === null || v.primaryIssue !== null, p, 'Rollback issue requires retained primary issue');
  const artifacts = byteRefs(v.artifacts, context, `${p}.artifacts`), retained = obligations(v.obligations, context, `${p}.obligations`, false);
  const readers = visibility(v.visibility, context, `${p}.visibility`), available = referenceMap(artifacts, `${p}.artifacts`);
  check(!available.has(source.ref), `${p}.source`, 'Source must not be duplicated in artifacts'); available.set(source.ref, source);
  if (backup !== null) { check(!available.has(backup.ref), `${p}.backup`, 'Backup must not be duplicated in artifacts'); available.set(backup.ref, backup); }
  // Unresolved declarations are not proof of bytes, but cannot promise an
  // over-capacity online reference set. Actual supplied occurrences are charged
  // below by the inspector, not charged twice here as metadata and raw bytes.
  const declaredCount = artifacts.length + (sourceKind === 'state' ? 0 : 1) + (backup === null ? 0 : 1);
  const declaredBytes = artifacts.reduce((sum, ref) => sum + ref.byteLength, 0) +
    (sourceKind === 'state' ? 0 : source.byteLength) + (backup === null ? 0 : backup.byteLength);
  check(declaredCount <= context.maxReferences && declaredBytes <= context.maxReferencedBytes, p, 'Declared reference set exceeds operation bounds', 'capacity');
  visible(readers, available, p); coverObligations(retained, available, p);
  const preservation = object(v.preservation, `${p}.preservation`);
  // Inspect after metadata admission. On any later failure Host still owns the
  // original input; this function neither replaces it nor promises persistence.
  const inspected = inspectLegacySource(sourceInput, context, sourceKind);
  check(source.byteLength === inspected.byteLength && source.hash === inspected.originalBytesHash,
    `${p}.source`, 'Original-byte facts mismatch', 'inconsistent-reference');
  if (inspected.kind === 'decoded') {
    closed(preservation, ['kind', 'carrier', 'carrierHash'], `${p}.preservation`);
    check(preservation.kind === 'decoded', p, 'Decoded source requires a V1 text carrier');
    const carrier = closed(preservation.carrier, ['encoding', 'original', 'originalBytesHash', 'payloadHash'], `${p}.preservation.carrier`);
    check(carrier.encoding === V1_CARRIER_ENCODING && carrier.original === inspected.original &&
      carrier.originalBytesHash === inspected.originalBytesHash && carrier.payloadHash === inspected.legacyPayloadHash,
    `${p}.preservation.carrier`, 'Carrier differs from the inspected V1 representation', 'inconsistent-reference');
    validateHash(preservation.carrierHash, `${p}.preservation.carrierHash`);
    check(preservation.carrierHash === pairDigest('migration', carrier, context), `${p}.preservation.carrierHash`, 'Carrier wrapper hash mismatch', 'inconsistent-reference');
    const decoded = inspected.value;
    const claimedVersion = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
      ? /** @type {JSONRecord} */ (decoded).version : null;
    const sourceVersion = typeof claimedVersion === 'number' && Number.isSafeInteger(claimedVersion) && claimedVersion >= 0 ? claimedVersion : null;
    check(v.sourceVersion === sourceVersion, `${p}.sourceVersion`, 'Source version mismatch');
    if (operation === 'stored-state') matchStateProfile(sourceProfile, decoded, `${p}.profile`);
    else check(sourceProfile.kind === 'unclassified', `${p}.profile`, 'Non-state source must not use state recognition');
    legacyCoverage(decoded, /** @type {HeldLegacyEvidenceV2} */ (v));
  } else {
    closed(preservation, ['kind', 'original', 'issue'], `${p}.preservation`);
    check(preservation.kind === 'held' && preservation.original === inspected.original &&
      same(issue(preservation.issue, `${p}.preservation.issue`), inspected.issue), `${p}.preservation`, 'Decode failure facts mismatch', 'inconsistent-reference');
    check(v.sourceVersion === null && sourceProfile.kind === 'undecodable', p, 'Decode failure cannot claim a partial value/version/profile');
    // original:null is NOT a binary backup. Caller retains original bytes until
    // Host establishes a durable binary reference, even if this record validates.
  }
  if (backupKind === 'supplied') {
    check(backup !== null, `${p}.backup`, 'Missing backup reference');
    const copy = inspectLegacySource(backupInput, context, sourceKind === 'payload' ? 'payload' : 'archive');
    // Byte equality does not refund work or turn decoded-budget exhaustion into
    // a successful prepared/committed stage. No new diagnostic is serialized.
    if (copy.kind === 'held' && copy.issue.code === 'capacity') {
      throw new ContractValidationError(copy.issue.code, copy.issue.path, copy.issue.message, copy.issue.category);
    }
    check(copy.byteLength === backup.byteLength && copy.originalBytesHash === backup.hash,
      `${p}.backup`, 'Supplied backup bytes mismatch', 'inconsistent-reference');
  }
  return Object.freeze({ evidence: /** @type {HeldLegacyEvidenceV2} */ (v), inspected });
}

/** Safely dispatch only the explicit held-byte context. Do not capture byte views
 * as V2 JSON or invoke properties while selecting an alternate public input.
 * Non-held inputs remain subject to the unchanged archive validator.
 * @param {unknown} value @param {ValidationContext} context
 * @returns {{sourceInput:unknown,backupInput:unknown}|null}
 */
function heldProjectionInputs(value, context) {
  if (value === null || typeof value !== 'object' || nodeTypes.isProxy(value)) return null;
  const kind = Object.getOwnPropertyDescriptor(value, 'kind');
  if (!kind || !Object.hasOwn(kind, 'value') || kind.value !== 'held-legacy') return null;
  const p = 'legacyProjectionContext', proto = Object.getPrototypeOf(value);
  check(!Array.isArray(value) && (proto === Object.prototype || proto === null), p, 'Expected plain held projection context');
  const keys = Reflect.ownKeys(value), expected = ['version', 'kind', 'sourceInput', 'backupInput'];
  consumeValidationWork(context, keys.length + 1, p);
  check(keys.length === expected.length && keys.every(key => typeof key === 'string' && expected.includes(key)), p, 'Expected closed held projection context');
  /** @type {Record<string,unknown>} */ const fields = {};
  for (const key of expected) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    check(d && d.enumerable && Object.hasOwn(d, 'value'), `${p}.${key}`, 'Expected enumerable own data field');
    fields[key] = d.value;
  }
  const header = object(ensureInert({version:fields.version,kind:fields.kind}, p, context), p);
  check(header.version === 2, p, 'Expected held projection context V2', 'unsupported-version');
  return {sourceInput:fields.sourceInput,backupInput:fields.backupInput};
}

/** Project only safe display text; never normalize an unsafe V1 string into a
 * new identity/path. Exact originals remain reachable through the source ref.
 * @param {unknown} value @param {string} path @param {string[]} diagnostics
 * @param {ValidationContext} context @returns {string|null}
 */
function legacyViewText(value, path, diagnostics, context) {
  if (value === null || value === undefined) return null;
  check(typeof value === 'string', path, 'Recognized legacy field must be text');
  consumeValidationWork(context, value.length + 1, 'legacyProjection.text');
  let safe = value.length > 0 && value.length <= COMMON_BOUNDS.maxTextBytes;
  for (let i = 0; safe && i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i); safe = next >= 0xdc00 && next <= 0xdfff;
    } else if (code >= 0xdc00 && code <= 0xdfff) safe = false;
  }
  if (safe && Buffer.byteLength(value, 'utf8') <= COMMON_BOUNDS.maxTextBytes) return value;
  diagnostics.push(`legacy-text-unrepresentable:${path}`); return null;
}

/** Private facade seam: null means the caller must use canonical actor replay.
 * No I/O, fabricated actor/workflow/identity, second decode or budget reset.
 * @param {unknown} value @param {string} workerId @param {unknown} resolver
 * @param {ValidationContext} context @returns {LegacyWorkerView|null}
 */
export function projectHeldLegacyWorkerViewInContext(value, workerId, resolver, context) {
  const inputs = heldProjectionInputs(resolver, context);
  if (inputs === null) return null;
  const workerKey = validateId(workerId, 'workerId');
  const {evidence, inspected} = inspectHeldLegacyEvidenceInContext(value, inputs.sourceInput, inputs.backupInput, context);
  check(evidence.operation === 'stored-state', 'heldLegacy.operation', 'Worker projection requires stored-state evidence', 'unsupported-legacy-worker');
  const diagnostics = ['legacy-binding-unchecked', 'legacy-accounting-unknown', 'durable-backup-unverified', `legacy-backup-${evidence.backup.kind}`];
  /** @type {Set<string>} */ const history = new Set();
  /** @type {Set<string>} */ const pending = new Set();
  /** @type {Set<string>} */ const holds = new Set(['legacy','unknown-accounting']);
  /** @param {Set<string>} target @param {string} ref */
  function retain(target, ref) { consumeValidationWork(context, ref.length + 1, 'legacyProjection.reference'); target.add(ref); }
  /** @param {Set<string>} target @param {RetentionVisibilityV2} readers */
  function readers(target, readers) { retain(target,readers.inspect.ref); retain(target,readers.cancel.ref); retain(target,readers.reconcile.ref); }
  retain(history,evidence.source.ref); readers(history,evidence.visibility);
  if (evidence.backup.reference !== null) retain(history,evidence.backup.reference.ref);
  consumeValidationWork(context,evidence.artifacts.length,'legacyProjection.artifacts');
  for (const ref of evidence.artifacts) retain(history,ref.ref);
  if (evidence.artifacts.length > 0) diagnostics.push('legacy-artifact-bytes-unresolved');
  for (const [label, issue] of [['primary',evidence.primaryIssue],['rollback',evidence.rollbackIssue]]) {
    if (issue !== null && typeof issue !== 'string') {
      consumeValidationWork(context,issue.code.length + issue.path.length + 1,'legacyProjection.issue');
      diagnostics.push(`legacy-${label}:${issue.code}:${issue.path}`);
    }
  }
  const known = evidence.profile.kind === 'recognized';
  /** @type {string|null} */ let session = null, taskRef = null;
  /** @type {'held'|'cancelled'} */ let status = 'held';
  const workerPath = `state.workers.${workerKey}`;
  /** @type {string[]} */ const noticePaths = [];
  if (known) {
    check(inspected.kind === 'decoded' && evidence.profile.kind === 'recognized', 'heldLegacy.profile', 'Recognized state requires original decoded bytes');
    const root = object(inspected.value, 'legacy'), workers = object(root.workers, 'legacy.workers');
    if (!Object.hasOwn(workers,workerKey)) throw new ContractValidationError('unknown-legacy-worker','workerId','No such worker in recognized held source','unsupported');
    const worker = object(workers[workerKey],workerPath), task = worker.task === null ? null : object(worker.task,`${workerPath}.task`);
    session = legacyViewText(worker.sessionId,`${workerPath}.sessionId`,diagnostics,context);
    if (session === null) diagnostics.push('legacy-session-unknown');
    if (task !== null) {
      taskRef = validateId(task.id,`${workerPath}.task.id`);
      if (task.status === 'cancelled') status = 'cancelled';
      if (task.status === 'paused') holds.add('paused');
      if (task.status === 'interrupted') holds.add('interrupted');
      if (task.abortRequested === true) holds.add('uncertain-effect');
    }
    if (worker.status === 'stopped') holds.add('stopped');
    diagnostics.push(`legacy-${evidence.profile.identityLayout}`, 'legacy-identity-provenance-unchecked');
    consumeValidationWork(context,evidence.profile.reconciliationReasons.length,'legacyProjection.reasons');
    for (const reason of evidence.profile.reconciliationReasons) {
      consumeValidationWork(context,reason.code.length + reason.path.length + 1,'legacyProjection.reason');
      diagnostics.push(`${reason.code}:${reason.path}`);
    }
    for (const key of ['sessionFile','diagnosticFile']) {
      const ref = legacyViewText(worker[key],`${workerPath}.${key}`,diagnostics,context);
      if (ref !== null) retain(history,ref);
    }
    const entries = list(worker.history,`${workerPath}.history`,40);
    consumeValidationWork(context,entries.length,'legacyProjection.history');
    for (let i = 0; i < entries.length; i++) {
      const ref = legacyViewText(object(entries[i],workerPath).file,`${workerPath}.history[${i}].file`,diagnostics,context);
      if (ref !== null) retain(history,ref);
    }
    for (const key of ['error','lastObservation','probe','lastExchange','staleReports']) if (Object.hasOwn(worker,key) && worker[key] !== null) diagnostics.push(`legacy-diagnostic-retained:${workerPath}.${key}`);
    const notices = object(root.notices,'state.notices'), keys = Object.keys(notices);
    consumeValidationWork(context,keys.length,'legacyProjection.notices');
    for (const key of keys) {
      consumeValidationWork(context,key.length + 1,'legacyProjection.notice');
      if (object(notices[key],'state.notices').workerId === workerKey) noticePaths.push(`state.notices.${key}`);
    }
  } else {
    holds.add('unsupported'); diagnostics.push(`legacy-source-${evidence.profile.kind}`, 'legacy-worker-scope-unknown');
    const issue = evidence.profile.kind === 'rejected' ? evidence.profile.issue : inspected.kind === 'held' ? inspected.issue : null;
    if (issue !== null) {
      consumeValidationWork(context,issue.code.length + issue.path.length + 1,'legacyProjection.issue');
      diagnostics.push(`legacy-source:${issue.code}:${issue.path}`);
    }
  }
  /** @param {string} value @param {string} prefix */
  function within(value,prefix) { consumeValidationWork(context,value.length + prefix.length + 1,'legacyProjection.scope'); return value === prefix || value.startsWith(prefix + '.') || value.startsWith(prefix + '['); }
  consumeValidationWork(context,evidence.obligations.length,'legacyProjection.obligations');
  for (const obligation of evidence.obligations) {
    const path = obligation.sourcePath;
    consumeValidationWork(context,path.length + 1,'legacyProjection.obligation');
    if (known && !within(path,workerPath) && !noticePaths.some(prefix => within(path,prefix)) && (path.startsWith('state.workers.') || path.startsWith('state.notices.'))) continue;
    retain(pending,obligation.subject.ref); readers(pending,obligation.visibility);
    // A reference to a resolution is not proof that old execution/review debt is gone.
    if (obligation.status === 'resolved') diagnostics.push(`legacy-resolution-unverified:${obligation.obligationId}`);
  }
  consumeValidationWork(context,history.size + pending.size + holds.size + diagnostics.length,'legacyProjection.output');
  const view = {nonAuthorizing:true,workerId:workerKey,session,status,heldReasons:[...holds],taskRef,pendingObligationRefs:[...pending],historyRefs:[...history],diagnostics:[...new Set(diagnostics)],known};
  return /** @type {LegacyWorkerView} */ (ensureInert(view,'legacyWorkerView',context));
}

/** Intrinsic manifest and byte/reference validation only. A committed stage is
 * a retained claim requiring Host publication/provenance checks, never adoption.
 * @param {unknown} value @param {unknown} sourceInput @param {unknown} backupInput
 * @param {ValidationContext} [context] @returns {MigrationManifestV2}
 */
export function validateMigrationManifestV2(value, sourceInput, backupInput, context = createValidationContext()) {
  const p = 'migration', v = closed(ensureInert(value, p, context), ['version', 'encoding', 'nonAuthorizing', 'migrationId', 'owner', 'legacy', 'primaryIssue', 'rollbackIssue', 'adoption', 'stage', 'target', 'commitRef'], p);
  version(v, 'pair-migration/1', p); validateId(v.migrationId, `${p}.migrationId`); validateOwnerBinding(v.owner, context);
  check(v.adoption === 'requires-reconciliation', `${p}.adoption`, 'Migration shape never adopts execution identity');
  const stage = choice(v.stage, ['classified', 'backed-up', 'prepared', 'committed', 'held'], `${p}.stage`);
  const primary = nullableIssue(v.primaryIssue, `${p}.primaryIssue`), rollback = nullableIssue(v.rollbackIssue, `${p}.rollbackIssue`);
  check(rollback === null || primary !== null, p, 'Rollback issue requires retained primary issue');
  if (v.target !== null) {
    const t = closed(v.target, ['storeId', 'version', 'hash'], `${p}.target`);
    validateId(t.storeId, `${p}.target.storeId`); validateHash(t.hash, `${p}.target.hash`); check(t.version === 2, `${p}.target.version`, 'Target must be V2');
  }
  if (v.commitRef !== null) validateArtifactRef(v.commitRef, context);
  const legacy = validateHeldLegacyEvidenceV2(v.legacy, sourceInput, backupInput, context);
  check(legacy.operation === 'stored-state', `${p}.legacy.operation`, 'State migration cannot classify a payload/archive');
  if (stage !== 'held') {
    check(legacy.profile.kind === 'recognized' && legacy.sourceVersion === 1 && primary === null && rollback === null &&
      legacy.primaryIssue === null && legacy.rollbackIssue === null, p, 'Rejected/incomplete/error source must remain held');
    if (stage !== 'classified') check(legacy.backup.kind === 'supplied', `${p}.legacy.backup`, 'Missing exact backup; migration must remain held');
    if (stage === 'classified' || stage === 'backed-up') check(v.target === null && v.commitRef === null, p, 'Premature target/commit claim');
    else check(v.target !== null && (stage === 'committed' ? v.commitRef !== null : v.commitRef === null), p, 'Incomplete target/commit stage');
  }
  return /** @type {MigrationManifestV2} */ (v);
}

/** @param {JSONValue} value @param {string} path @returns {ArchiveCountersV2} */
function counters(value, path) {
  const v = closed(value, ['events', 'operations', 'activations', 'reports', 'inputTokens', 'outputTokens', 'costUsd'], path);
  for (const key of ['events', 'operations', 'activations', 'reports', 'inputTokens', 'outputTokens']) count(v[key], `${path}.${key}`);
  check(typeof v.costUsd === 'number' && Number.isFinite(v.costUsd) && v.costUsd >= 0, `${path}.costUsd`, 'Expected finite nonnegative cost');
  return /** @type {ArchiveCountersV2} */ (v);
}
/** @param {unknown} value @param {ValidationContext} [context] @returns {ArchiveCheckpointV2} */
export function validateArchiveCheckpointV2(value, context = createValidationContext()) {
  const p = 'checkpoint', v = closed(ensureInert(value, p, context), ['version', 'encoding', 'nonAuthorizing', 'archive', 'rootHash', 'rootRevision', 'nextSegmentId', 'owner', 'actors', 'counters', 'dispositions', 'artifacts', 'obligations'], p);
  version(v, 'pair-archive-checkpoint/1', p);
  const archive = validateArchiveRefV2(v.archive, context);
  validateHash(v.rootHash, `${p}.rootHash`); count(v.rootRevision, `${p}.rootRevision`, 1);
  const nextSegmentId = validateId(v.nextSegmentId, `${p}.nextSegmentId`);
  check(nextSegmentId !== archive.segmentId && nextSegmentId !== archive.priorRoot, p, 'Segment epoch cannot be reused');
  const owner = validateOwnerBinding(v.owner, context);
  /** @type {Set<string>} */ const actorIds = new Set();
  for (const entry of list(v.actors, `${p}.actors`, COMMON_BOUNDS.maxActorDefinitions)) {
    const actor = validateActorBinding(entry, context); unique(actorIds, actor.actorId, `${p}.actors`);
    check(actor.ownerSession === owner.ownerSession && actor.ownerEpoch === owner.ownerEpoch, `${p}.actors`, 'Checkpoint actor/owner mismatch');
  }
  const totals = counters(v.counters, `${p}.counters`);
  check(totals.events === v.rootRevision, p, 'Cumulative event count differs from root revision');
  const artifacts = byteRefs(v.artifacts, context, `${p}.artifacts`), available = referenceMap(artifacts, `${p}.artifacts`);
  const retained = obligations(v.obligations, context, `${p}.obligations`, true); coverObligations(retained, available, p);
  /** @type {Set<string>} */ const operations = new Set();
  for (const entry of list(v.dispositions, `${p}.dispositions`, COMMON_BOUNDS.maxEvents)) {
    const d = closed(entry, ['operationId', 'outcome', 'receipt'], `${p}.dispositions`);
    unique(operations, validateId(d.operationId, `${p}.dispositions.operationId`), `${p}.dispositions`);
    choice(d.outcome, ['completed', 'cancelled', 'failed', 'reconciled'], `${p}.dispositions.outcome`);
    covered(validateArtifactRef(d.receipt, context), available, `${p}.dispositions.receipt`);
  }
  return /** @type {ArchiveCheckpointV2} */ (v);
}

/** Replay-only subtrees still obey the shared per-text ceiling. Their container
 * depth/nodes/total bytes were already charged by the enclosing capture. Raw
 * original-source text and V1 carriers are separate representations, not inline
 * model text, and do not pass through this helper.
 * @param {JSONValue} value @param {string} path
 */
function replayTextBounds(value, path) {
  if (typeof value === 'string') {
    check(value.length <= COMMON_BOUNDS.maxTextBytes && Buffer.byteLength(value, 'utf8') <= COMMON_BOUNDS.maxTextBytes,
      path, 'Replay text exceeds the UTF-8 byte ceiling', 'capacity');
  } else if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) { for (const entry of /** @type {readonly JSONValue[]} */ (value)) replayTextBounds(entry, path); }
    else for (const [key, entry] of Object.entries(/** @type {JSONRecord} */ (value))) {
      check(key.length <= COMMON_BOUNDS.maxTextBytes && Buffer.byteLength(key, 'utf8') <= COMMON_BOUNDS.maxTextBytes,
        path, 'Replay key exceeds the UTF-8 byte ceiling', 'capacity');
      replayTextBounds(entry, path);
    }
  }
}

/** Validate only the selected canonical root/header vocabulary. Full config,
 * domain payload semantics, unresolved effect detection and replay are T08.
 * @param {JSONValue} value @param {ValidationContext} context @param {string} path @returns {ArchiveReplayInputV2}
 */
function replayInput(value, context, path) {
  const v = closed(value, ['version', 'encoding', 'segmentId', 'genesis', 'events', 'archiveHead'], path);
  check(v.version === 2 && v.encoding === 'pair-actor-state/1', path, 'Unsupported archived root'); validateId(v.segmentId, `${path}.segmentId`);
  const g = closed(v.genesis, ['storeId', 'initialOwner', 'actorDefinitions', 'configSnapshot', 'heldLegacyRefs', 'checkpoint'], `${path}.genesis`);
  validateId(g.storeId, `${path}.genesis.storeId`); validateOwnerBinding(g.initialOwner, context); object(g.configSnapshot, `${path}.genesis.configSnapshot`);
  replayTextBounds(g.configSnapshot, `${path}.genesis.configSnapshot`);
  /** @type {Set<string>} */ const actorIds = new Set();
  for (const entry of list(g.actorDefinitions, `${path}.genesis.actorDefinitions`, COMMON_BOUNDS.maxActorDefinitions)) {
    unique(actorIds, validateActorDefinitionV3(entry, context).id, `${path}.genesis.actorDefinitions`);
  }
  /** @type {Set<string>} */ const legacyRefs = new Set();
  for (const entry of list(g.heldLegacyRefs, `${path}.genesis.heldLegacyRefs`, COMMON_BOUNDS.maxReferences)) {
    unique(legacyRefs, validateArtifactRef(entry, context).ref, `${path}.genesis.heldLegacyRefs`);
  }
  if (g.checkpoint !== null) validateArchiveCheckpointV2(g.checkpoint, context);
  if (v.archiveHead !== null) validateArchiveRefV2(v.archiveHead, context);
  const events = list(v.events, `${path}.events`, COMMON_BOUNDS.maxEvents);
  check(events.length > 0, `${path}.events`, 'Empty segments are not archivable');
  for (let i = 0; i < events.length; i++) {
    const at = `${path}.events.${i}`, e = closed(events[i], ['eventId', 'sequence', 'at', 'owner', 'workflowId', 'domain', 'payload'], at);
    validateId(e.eventId, `${at}.eventId`); check(e.sequence === i + 1, `${at}.sequence`, 'Nonconsecutive segment sequence');
    count(e.at, `${at}.at`); validateOwnerBinding(e.owner, context);
    if (e.workflowId !== null) validateId(e.workflowId, `${at}.workflowId`);
    choice(e.domain, ['actor', 'implementation'], `${at}.domain`); object(e.payload, `${at}.payload`);
    replayTextBounds(e.payload, `${at}.payload`);
  }
  return /** @type {ArchiveReplayInputV2} */ (v);
}
/** Retained references and dispositions cannot vanish at rotation. Resolved
 * obligations are immutable archival facts, not TTL-evictable cache entries.
 * @param {ArchiveCheckpointV2} prior @param {ArchiveCheckpointV2} next @param {string} path
 */
function retentionContinuity(prior, next, path) {
  const artifacts = referenceMap(next.artifacts, path);
  /** @type {Map<string, RetainedObligationRefV2>} */ const retained = new Map(/** @type {readonly (readonly [string, RetainedObligationRefV2])[]} */ ([]));
  /** @type {Map<string, ArchiveDispositionV2>} */ const dispositions = new Map(/** @type {readonly (readonly [string, ArchiveDispositionV2])[]} */ ([]));
  for (const ref of next.obligations) retained.set(ref.obligationId, ref);
  for (const disposition of next.dispositions) dispositions.set(disposition.operationId, disposition);
  for (const ref of prior.artifacts) {
    const found = artifacts.get(ref.ref); check(found && same(found, ref), path, 'Archived artifact was discarded or changed');
  }
  for (const ref of prior.obligations) {
    const found = retained.get(ref.obligationId); check(found && same(found, ref), path, 'Archived obligation was discarded or changed');
  }
  for (const disposition of prior.dispositions) {
    const found = dispositions.get(disposition.operationId); check(found && same(found, disposition), path, 'Archived disposition was discarded or changed');
  }
  for (const key of /** @type {const} */ (['events', 'operations', 'activations', 'reports', 'inputTokens', 'outputTokens', 'costUsd'])) {
    check(next.counters[key] >= prior.counters[key], `${path}.counters.${key}`, 'Cumulative counters cannot reset');
  }
}

/** Explicit empty shape:
 * {version:2,kind:'empty',storeId,head:null,segments:[],artifacts:[]}.
 * Chain order is oldest -> newest, beginning at null priorRoot. No opaque
 * checkpoint anchor, cycle, omitted claimed bytes, or unlimited traversal.
 * Each segment includes reference/checkpoint/original/decoded; each artifact
 * includes reference/original. Raw V2 bytes are duplicate-key-aware decoded.
 * Returned records are detached/deep frozen, but authorize nothing. T08 must
 * compare the current root's archiveHead/genesis.checkpoint/segmentId and replay
 * every supplied historical prefix; Host must establish actual provenance.
 * @param {unknown} value @param {ValidationContext} [context] @returns {ArchiveValidationContext}
 */
export function validateArchiveValidationContext(value, context = createValidationContext()) {
  const p = 'archiveContext', v = closed(ensureInert(value, p, context), ['version', 'kind', 'storeId', 'head', 'segments', 'artifacts'], p);
  check(v.version === 2, `${p}.version`, 'Expected archive context V2'); const storeId = validateId(v.storeId, `${p}.storeId`);
  const kind = choice(v.kind, ['empty', 'chain'], `${p}.kind`);
  const segments = list(v.segments, `${p}.segments`, COMMON_BOUNDS.maxReferences), artifacts = list(v.artifacts, `${p}.artifacts`, COMMON_BOUNDS.maxReferences);
  if (kind === 'empty') {
    check(v.head === null && segments.length === 0 && artifacts.length === 0, p, 'Empty context must be explicitly empty');
    return /** @type {ArchiveValidationContext} */ (v);
  }
  check(segments.length > 0 && segments.length + artifacts.length <= context.maxReferences, p, 'Nonempty bounded chain required', 'capacity');
  const head = validateArchiveRefV2(v.head, context); check(head.storeId === storeId, p, 'Head store mismatch');
  /** @type {Map<string, LegacyByteRefV2>} */ const resolved = new Map(/** @type {readonly (readonly [string, LegacyByteRefV2])[]} */ ([]));
  for (let i = 0; i < artifacts.length; i++) {
    const at = `${p}.artifacts.${i}`, a = closed(artifacts[i], ['reference', 'original'], at);
    const ref = byteRef(a.reference, `${at}.reference`, context.maxReferenceBytes);
    check(!resolved.has(ref.ref), at, 'Duplicate resolved artifact');
    check(typeof a.original === 'string', `${at}.original`, 'Resolved artifact needs exact UTF-8 text');
    check(Buffer.byteLength(a.original, 'utf8') === ref.byteLength, at, 'Resolved artifact size mismatch');
    consumeReference(ref.byteLength, context, at, 'payload');
    check(hashBytes(a.original, context) === ref.hash, at, 'Resolved artifact byte hash mismatch', 'inconsistent-reference'); resolved.set(ref.ref, ref);
  }
  /** @type {Set<string>} */ const segmentIds = new Set();
  /** @type {Set<string>} */ const originalHashes = new Set();
  /** @type {Set<string>} */ const eventIds = new Set();
  /** @type {Set<string>} */ const usedArtifacts = new Set();
  /** @type {ArchiveCheckpointV2|null} */ let prior = null;
  let revision = 0;
  for (let i = 0; i < segments.length; i++) {
    const at = `${p}.segments.${i}`, s = closed(segments[i], ['reference', 'checkpoint', 'original', 'decoded'], at);
    const ref = validateArchiveRefV2(s.reference, context), checkpoint = validateArchiveCheckpointV2(s.checkpoint, context);
    unique(segmentIds, ref.segmentId, at); unique(originalHashes, ref.originalHash, at);
    check(ref.storeId === storeId && same(ref, checkpoint.archive), at, 'Archive reference/checkpoint mismatch');
    check(ref.priorRoot === (prior === null ? null : prior.archive.segmentId), at, 'Missing, cyclic or out-of-order predecessor');
    check(typeof s.original === 'string', `${at}.original`, 'Archive requires exact raw V2 text');
    const bytes = decodeReferencedPairJSON(s.original, context, 'archive');
    check(bytes.byteLength === ref.byteLength && bytes.originalBytesHash === ref.originalHash, at, 'Archive original-byte facts mismatch');
    const root = replayInput(s.decoded, context, `${at}.decoded`);
    check(root.segmentId === ref.segmentId && root.genesis.storeId === storeId, at, 'Decoded archive identity mismatch');
    check(pairDigest('state', bytes.value, context) === checkpoint.rootHash && pairDigest('state', root, context) === checkpoint.rootHash,
      at, 'Decoded archive/root hash mismatch', 'inconsistent-reference');
    check(same(root.archiveHead, prior === null ? null : prior.archive) && same(root.genesis.checkpoint, prior), at, 'Archived predecessor binding mismatch');
    if (prior !== null) {
      check(prior.nextSegmentId === ref.segmentId && same(root.genesis.initialOwner, prior.owner), at, 'Rotation binding mismatch');
      retentionContinuity(prior, checkpoint, at);
    }
    check(!segmentIds.has(checkpoint.nextSegmentId), at, 'Next segment reuses an archived epoch');
    check(root.events.length <= Number.MAX_SAFE_INTEGER - revision, at, 'Revision overflow'); revision += root.events.length;
    check(checkpoint.rootRevision === revision, at, 'Archive revision/count mismatch');
    for (const event of root.events) unique(eventIds, event.eventId, at);
    for (const artifact of checkpoint.artifacts) {
      const actual = resolved.get(artifact.ref);
      check(actual && same(actual, artifact), at, 'Claimed retained artifact bytes missing or conflicting'); usedArtifacts.add(artifact.ref);
    }
    const retainedArtifacts = referenceMap(checkpoint.artifacts, at);
    for (const legacyRef of root.genesis.heldLegacyRefs) {
      covered(legacyRef, resolved, at); covered(legacyRef, retainedArtifacts, at); usedArtifacts.add(legacyRef.ref);
    }
    prior = checkpoint;
  }
  check(prior !== null && same(head, prior.archive), p, 'Head does not name the last segment');
  check(usedArtifacts.size === resolved.size, `${p}.artifacts`, 'Unclaimed context artifacts');
  return /** @type {ArchiveValidationContext} */ (v);
}

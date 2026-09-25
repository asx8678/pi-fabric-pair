/**
 * AR-03 T04, ar3-common-abi/2. Pure, non-authorizing wire/mailbox leaves.
 *
 * HASH BOUNDARIES (pair-json/1; SHA-256 with common's pair/<domain>/v2\n):
 * - control.content.binding.inputHash = operation-input(control.content.input).
 * - control.digest = control(control.content).
 * - mailbox.digest = mailbox(mailbox.content), including retained delivery facts.
 * - authority artifact.digest = authority(artifact.content); its content excludes
 *   grantProof, rootHash, authorityHash and control inputHash (no publication cycle).
 * - inspection artifact.digest = inspection(artifact.content).
 * - disposition receipt.digest = mailbox(receipt.content).
 * Every preimage is an explicit, closed INPUT subrecord, not a newly assembled
 * copy charged as another entire tree. input.identity must equal common's
 * projectControlIdentity(binding), which excludes ONLY inputHash. The immutable
 * input includes direction, request/reply/correlation/causation, deadline, kind
 * and payload. Changing delivery observations cannot change this input hash.
 * Sized PayloadRefV2 values explicitly declare hashDomain: bytes means raw SHA-256;
 * other domains mean common pairDigest(domain, resolved content). Admission and
 * reservation refs name actor-event content, reply refs name control content,
 * duplicate/conflict refs name disposition content in mailbox domain. Inspection
 * ArtifactRefs always name inspection content; their companion *Bytes fields
 * bound the serialized {content,digest} artifact. T08 must resolve and recheck.
 * Digests outside content never hash themselves. Referenced hashes name earlier
 * separate artifacts; authorityHash is NOT this control wrapper's digest.
 *
 * A V1 report retains its exact carrier text, originalBytesHash and carrier
 * payloadHash (of the WHOLE original envelope). reportHash is instead the
 * ORIGINAL ENVELOPE'S payloadHash. Neither hash is a V2 grant or provenance.
 *
 * Inspection content binds an EARLIER retained supervisor intent. In particular,
 * review intent contains no digest of its future inspection artifacts, and the
 * latter contain no settlement prerequisite. T08 resolves exact ArtifactRefs,
 * joins request/reply/receipt IDs, and builds the common ReviewerWitness with
 * settlement:{observationId,at}; no ref string is interpreted as a logical ID.
 *
 * One common context per public call. Only detached, deeply frozen common input
 * is read below. No clock, filesystem, runtime, expiry action, authentication,
 * capacity admission, dedup registry, fairness cursor or effect settlement here.
 * Unknown execution is not rejection/not-sent. Each delivery slot is a separate
 * retained fact: report/run need not follow ACK. Host/T08 prove history, current
 * caller authorization, reservation occupancy and resolved artifact bytes.
 */
import {
  COMMON_BOUNDS, ContractValidationError, createValidationContext, requireValidationContext, captureValidationWork, ensureInert,
  encodePairJSON, pairDigest, projectControlIdentity, assertActorControlBinding,
  validateActorControlBinding, validateActorBinding, validateOwnerBinding,
  validateArchiveReferenceV2, validateArtifactRef, validateDeadlineWindow,
  validateHash, validateId, validateToken, validateIdentity, consumeReference, consumeValidationWork,
  inspectLegacySource, legacyPayloadDigest,
} from './actor-contract-common.js';

/** @typedef {import('./actor-contract-common.js').JSONValue} JSONValue */
/** @typedef {import('./actor-contract-common.js').JSONRecord} JSONRecord */
/** @typedef {import('./actor-contract-common.js').ValidationContext} Ctx */
/** @typedef {import('./actor-contract-common.js').ActorControlBinding} ActorControlBinding */
/** @typedef {import('./actor-contract-common.js').ControlIdentityProjection} ControlIdentityProjection */
/** @typedef {import('./actor-contract-common.js').ActorBinding} ActorBinding */
/** @typedef {import('./actor-contract-common.js').OwnerBinding} OwnerBinding */
/** @typedef {import('./actor-contract-common.js').ArtifactRef} ArtifactRef */
/** @typedef {import('./actor-contract-common.js').DeadlineWindow} DeadlineWindow */
/** @typedef {import('./actor-contract-common.js').ArchiveReferenceV2} ArchiveReferenceV2 */
/** @typedef {import('./actor-contract-common.js').V1Carrier} V1Carrier */
/** @typedef {import('./actor-contract-common.js').Identity} Identity */
/** @typedef {'main'|'participant'} Direction */
/** @typedef {Readonly<{observationId:string, at:number}>} Observation */
/** @typedef {Readonly<{artifact:ArtifactRef, byteLength:number, encoding:'pair-json/1'|'pair-json-v1/1'|'bytes', hashDomain:'bytes'|'authority'|'mailbox'|'inspection'|'actor-event'|'control'}>} PayloadRefV2 */
/** @typedef {Readonly<{kind:'main', owner:OwnerBinding}>|Readonly<{kind:'participant', actor:ActorBinding}>} EndpointV2 */
/** @typedef {Readonly<{storeId:string, segmentId:string, archive:ArchiveReferenceV2|null}>} AdmissionEpochV2 */
/** @typedef {Readonly<{domain:'pair-mailbox/2', epoch:AdmissionEpochV2, messageId:string, idempotencyKey:string, operationId:string, producer:EndpointV2, consumer:EndpointV2}>} MailboxKeyV2 */
/** @typedef {Readonly<{kind:'all'|'summary'|'patch'|'verification'}>|Readonly<{kind:'file',path:string}>} EvidenceScopeV2 */
/** @typedef {Readonly<{actor:ActorBinding, profile:'supervisor-restricted', workflowId:string, workflowRevision:string, activationId:string, intentId:string, intentHash:string, operationId:string, reportId:string, reportHash:string, checkpointHash:string, scope:EvidenceScopeV2}>} InspectionBindingV2 */
/** @typedef {InspectionBindingV2 & Readonly<{version:2, kind:'inspection-request', requestId:string, deadline:DeadlineWindow}>} InspectionRequestContentV2 */
/** @typedef {InspectionBindingV2 & Readonly<{version:2, kind:'inspection-reply', requestId:string, replyId:string, request:ArtifactRef, requestBytes:number, evidence:readonly PayloadRefV2[], at:number}>} InspectionReplyContentV2 */
/** @typedef {InspectionBindingV2 & Readonly<{version:2, kind:'inspection-receipt', requestId:string, replyId:string, receiptId:string, request:ArtifactRef, requestBytes:number, reply:ArtifactRef, replyBytes:number, delivery:Observation}>} InspectionReceiptContentV2 */
/** @template T @typedef {Readonly<{content:T, digest:string}>} Hashed */
/** @typedef {Hashed<InspectionRequestContentV2>} InspectionRequestV2 */
/** @typedef {Hashed<InspectionReplyContentV2>} InspectionReplyV2 */
/** @typedef {Hashed<InspectionReceiptContentV2>} InspectionReceiptV2 */
/** @typedef {Readonly<{kind:'duplicate', retainedInputHash:string, receipt:PayloadRefV2}>|Readonly<{kind:'conflict', retainedInputHash:string, receipt:PayloadRefV2}>|Readonly<{kind:'rejected', code:string, reason:string}>|Readonly<{kind:'not-sent', reason:string}>|Readonly<{kind:'unknown', observation:Observation, reason:string}>|Readonly<{kind:'consumed', activationId:string, observation:Observation}>|Readonly<{kind:'resolved', resolution:'completed'|'cancelled'|'reconciled', observation:Observation, effectBarrier:PayloadRefV2|null}>} DispositionV2 */
/** @typedef {Readonly<{version:2, receiptId:string, key:MailboxKeyV2, inputHash:string, at:number, outcome:DispositionV2}>} DispositionContentV2 */
/** @typedef {Hashed<DispositionContentV2>} DispositionReceiptV2 */
/** @typedef {Readonly<{admission:PayloadRefV2|null, reservation:PayloadRefV2|null, disposition:DispositionReceiptV2|null, reply:PayloadRefV2|null}>} MailboxDeliveryV2 */
/** @typedef {Readonly<{version:2, key:MailboxKeyV2, createdAt:number, lane:'ordinary'|'reserved-control', priority:'normal'|'question-answer'|'control', control:ActorControlV2, delivery:MailboxDeliveryV2}>} MailboxContentV2 */
/** @typedef {Hashed<MailboxContentV2>} MailboxEnvelopeV2 */
/** @typedef {Readonly<{id:string, title:string, description:string}>} PlanStepV2 */
/** @typedef {Readonly<{id:string, title:string, instructions:string, acceptance?:readonly string[]}>} PlanStepFullV2 */
/** @typedef {Readonly<{version:1, expected:Readonly<{taskId:string, workflowId:string, workflowRevision:string, taskPlanRevision:number, workflowPlanRevision:number, planHash:string, currentStepId:string, reportId:string, reportHash:string, checkpointHash:string, grantOperationId:string, accountingRevision:string, budgetRevision:string, budgetHash:string, workflowBudgetRevision:string, workflowBudgetHash:string}>, next:Readonly<{taskPlanRevision:number, workflowPlanRevision:number}>, remainingStepIds:readonly string[], introducedSteps:readonly Readonly<{step:PlanStepFullV2, replaces:readonly string[]}>[], removedStepIds:readonly string[], current:Readonly<{kind:'keep'}>|Readonly<{kind:'replace',successorStepId:string}>, supersedesDecisionOperationId:string|null}>} PlanChangeV2 */
/** @typedef {Readonly<{activationId:string, intentId:string, intentHash:string, operationId:string, controlHash:string}>} PlanLinkV2 */
/** @typedef {Readonly<{kind:'goal',payload:Readonly<{objective:string,constraints:readonly string[]}>}>|Readonly<{kind:'assignment',payload:Readonly<{objective:string,step:PlanStepV2,constraints:readonly string[]}>}>} PromptV2 */
/** @typedef {Readonly<{version:2,owner:OwnerBinding,actor:ActorBinding,profile:'supervisor-restricted'|'worker-native',nonce:string,workflowId:string,workflowRevision:string,activationId:string,identity:Identity|null,grantOperationId:string,deadline:DeadlineWindow,command:PromptV2}>} AuthorityContentV2 */
/** @typedef {Hashed<AuthorityContentV2>} AuthorityArtifactV2 */
/** @typedef {Readonly<{owner:OwnerBinding,workflowId:string,workflowRevision:string}>} AuthorityRetentionBindingV2 */
/** @typedef {Readonly<{carrier:V1Carrier, reportId:string, reportHash:string, reportKind:'question'|'checkpoint'|'blocked'|'final_review'}>} RetainedV1Report */
/** @typedef {Readonly<{name:string, result:'pass'|'fail'|'not_run', detail?:string}>} LegacyCheck */
/** @typedef {Readonly<{taskId:string,stepId:string,summary:string,decisions?:readonly string[],changedFiles?:readonly string[],checks?:readonly LegacyCheck[],stepComplete?:boolean}> & (Readonly<{kind:'question',question:string}>|Readonly<{kind:'checkpoint'|'blocked'|'final_review',question?:string}>)} LegacyReportPayload */
/** @typedef {Readonly<{version:1,reportId:string,workerId:string,ownerSession:string,ownerEpoch:number,workerGeneration:number,nonce:string,sessionId:string,leaseId:string,attemptId:string,attemptNumber:number,planRevision:number,payload:LegacyReportPayload,payloadHash:string,createdAt:number}>} LegacyReportEnvelope */
/** @typedef {Readonly<{observation:Observation,sequence:number,state:'sleeping'|'starting'|'idle'|'busy'|'stopping'|'faulted',context:'fresh'|'stale'|'unknown',usage:'fresh'|'stale'|'unknown',pid:number|null,exit:Readonly<{code:number|null,signal:string|null}>|null}>} TelemetryV2 */
/** @typedef {Readonly<{observation:Observation,commandId:string,inputHash:string,result:'accepted'|'rejected'|'unknown',detail:string|null}>} AckV2 */
/** @typedef {Readonly<{observation:Observation,commandId:string,inputHash:string,state:'started'|'settled'|'unknown'}>} RunV2 */
/** @typedef {Readonly<{reportId:string,reportHash:string,checkpointHash:string,scope:EvidenceScopeV2,action:'approve'|'revise'|'answer'|'cancel',reason:string,planLink?:PlanLinkV2}>} ReviewIntentV2 */
/**
 * @typedef {Readonly<{kind:'probe',payload:Readonly<{acceptedWireVersion:2,acceptedProfile:'supervisor-restricted'|'worker-native'}>}>|
 * Readonly<{kind:'handshake',payload:Readonly<{acceptedWireVersion:2,acceptedProfile:'supervisor-restricted'|'worker-native',sessionId:string,model:string|null}>}>|
 * Readonly<{kind:'authority',payload:Readonly<{authority:PayloadRefV2,artifact:AuthorityArtifactV2}>}>|
 * Readonly<{kind:'goal',payload:Readonly<{objective:string,constraints:readonly string[]}>}>|
 * Readonly<{kind:'assignment',payload:Readonly<{objective:string,step:PlanStepV2,constraints:readonly string[]}>}>|
 * Readonly<{kind:'plan',payload:Readonly<{planRevision:number,steps:readonly PlanStepV2[],summary:string,change?:PlanChangeV2}>}>|
 * Readonly<{kind:'answer',payload:Readonly<{reportId:string,reportHash:string,answer:string}>}>|
 * Readonly<{kind:'review',payload:ReviewIntentV2}>|
 * Readonly<{kind:'blocker',payload:Readonly<{summary:string,question:string|null}>}>|
 * Readonly<{kind:'report'|'latch',payload:RetainedV1Report}>|
 * Readonly<{kind:'inspection-request',payload:InspectionRequestV2}>|
 * Readonly<{kind:'inspection-reply',payload:InspectionReplyV2}>|
 * Readonly<{kind:'inspection-receipt',payload:InspectionReceiptV2}>|
 * Readonly<{kind:'telemetry',payload:TelemetryV2}>|
 * Readonly<{kind:'ack',payload:AckV2}>|
 * Readonly<{kind:'run',payload:RunV2}>|
 * Readonly<{kind:'cancel',payload:Readonly<{targetOperationId:string,reason:string}>}>|
 * Readonly<{kind:'failure',payload:Readonly<{targetOperationId:string,code:string,reason:string,execution:'not-sent'|'rejected'|'unknown',observation:Observation}>}>|
 * Readonly<{kind:'reconcile',payload:Readonly<{targetOperationId:string,reason:string,evidence:readonly PayloadRefV2[]}>}>|
 * Readonly<{kind:'disposition',payload:DispositionReceiptV2}>} WireMessageV2
 */
/** @typedef {WireMessageV2 & Readonly<{identity:ControlIdentityProjection,sender:Direction,requestId:string,replyId:string|null,correlationId:string,causationId:string|null,deadline:DeadlineWindow}>} ControlInputV2 */
/** @typedef {Readonly<{binding:ActorControlBinding,input:ControlInputV2}>} ControlContentV2 */
/** @typedef {Hashed<ControlContentV2>} ActorControlV2 */

/** @param {unknown} condition @param {string} path @param {string} message @param {string} [code] @returns {asserts condition} */
function check(condition, path, message, code = 'invalid-field') {
  if (!condition) throw new ContractValidationError(code, path, message);
}
/** @param {JSONValue} value @param {readonly string[]} fields @param {string} path @param {readonly string[]} [optional] @returns {JSONRecord} */
function record(value, fields, path, optional = []) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'Expected record');
  const v = /** @type {JSONRecord} */ (value);
  for (const key of fields) check(Object.hasOwn(v, key), `${path}.${key}`, 'Missing required field', 'missing-required-field');
  for (const key of Object.keys(v)) check(fields.includes(key) || optional.includes(key), `${path}.${key}`, 'Unknown field');
  return v;
}
/** @template {string} T @param {unknown} value @param {readonly T[]} choices @param {string} path @returns {T} */
function choice(value, choices, path) {
  const found = choices.find(entry => entry === value);
  if (found === undefined) throw new ContractValidationError('unsupported-value', path, 'Unsupported kind/profile/value', 'unsupported');
  return found;
}
/** @param {unknown} value @param {string} path @param {number} [min] @param {number} [max] */
function integer(value, path, min = 0, max = Number.MAX_SAFE_INTEGER) {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max, path, 'Expected bounded safe integer');
  return value;
}
/** UTF-8 count without allocating an encoded copy. V2 inert capture already
 * rejects lone surrogates; this also counts V1 decoded strings without changing
 * their historical spelling (a lone surrogate has replacement-byte size 3).
 * @param {string} value @returns {number} */
function utf8Bytes(value) {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += n < 0x80 ? 1 : n < 0x800 ? 2 : 3;
  }
  return bytes;
}
/** @param {unknown} value @param {string} path @param {number} [maxChars] @param {boolean} [nonempty] @returns {string} */
function text(value, path, maxChars = COMMON_BOUNDS.maxTextBytes, nonempty = true) {
  check(typeof value === 'string' && value.length <= maxChars, path, 'Expected bounded text');
  check(utf8Bytes(value) <= COMMON_BOUNDS.maxTextBytes, path, 'Text exceeds UTF-8 byte bound', 'capacity');
  check(!nonempty || value.trim().length > 0, path, 'Expected nonempty text');
  return value;
}
/** @param {JSONValue} value @param {string} path @param {number} maximum @param {number} [minimum] @returns {readonly JSONValue[]} */
function list(value, path, maximum, minimum = 0) {
  check(Array.isArray(value) && value.length >= minimum && value.length <= maximum, path, 'Expected bounded array');
  return /** @type {readonly JSONValue[]} */ (value);
}
/** @param {JSONValue} value @param {string} path @param {number} maximum @param {number} [maxChars] */
function texts(value, path, maximum, maxChars = COMMON_BOUNDS.maxTextBytes) {
  for (const [index, entry] of list(value, path, maximum).entries()) text(entry, `${path}.${index}`, maxChars);
}
/** Fieldwise equality of captured/validated JSON, never caller getters or methods.
 * @param {JSONValue} left @param {JSONValue} right @returns {boolean} */
function same(left, right) {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((v, i) => same(v, right[i]));
  const a = /** @type {JSONRecord} */ (left), b = /** @type {JSONRecord} */ (right), keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
}
/** @param {JSONValue} value @param {string} path @param {Ctx} context */
function envelopeSize(value, path, context) {
  check(utf8Bytes(encodePairJSON(value, context)) <= COMMON_BOUNDS.maxEnvelopeBytes, path, 'Envelope exceeds 64 KiB', 'capacity');
}
/** @param {JSONValue} value @param {string} path */
function version(value, path) {
  if (value !== 2) throw new ContractValidationError('unsupported-version', path, 'Expected version 2', 'unsupported');
}
/** @param {JSONValue} value @param {string} path @returns {Observation} */
function observation(value, path) {
  const v = record(value, ['observationId', 'at'], path);
  validateId(v.observationId, `${path}.observationId`); integer(v.at, `${path}.at`);
  return /** @type {Observation} */ (v);
}
/** A reference is sized data, NOT resolved content. Actual decoded content must
 * be charged again by the resolver in its own enclosing validation operation.
 * @param {JSONValue} value @param {string} path @param {Ctx} context @returns {PayloadRefV2} */
function payloadRef(value, path, context) {
  const v = record(value, ['artifact', 'byteLength', 'encoding', 'hashDomain'], path);
  validateArtifactRef(v.artifact, context);
  const size = integer(v.byteLength, `${path}.byteLength`, 1, COMMON_BOUNDS.maxReferenceBytes);
  consumeReference(size, context, `${path}.byteLength`, 'payload');
  choice(v.encoding, ['pair-json/1', 'pair-json-v1/1', 'bytes'], `${path}.encoding`);
  const domain = choice(v.hashDomain, ['bytes', 'authority', 'mailbox', 'inspection', 'actor-event', 'control'], `${path}.hashDomain`);
  check(domain === 'bytes' || v.encoding === 'pair-json/1', path, 'Domain-separated content requires pair-json/1');
  return /** @type {PayloadRefV2} */ (v);
}
/** @param {JSONValue} value @param {string} path @param {Ctx} context @returns {readonly PayloadRefV2[]} */
function refs(value, path, context) {
  const entries = list(value, path, COMMON_BOUNDS.maxReferences);
  for (const [i, v] of entries.entries()) payloadRef(v, `${path}.${i}`, context);
  return /** @type {readonly PayloadRefV2[]} */ (entries);
}
/** @param {JSONValue} value @param {JSONValue} bytes @param {string} path @param {Ctx} context @returns {ArtifactRef} */
function inspectionRef(value, bytes, path, context) {
  const ref = validateArtifactRef(value, context);
  consumeReference(integer(bytes, `${path}Bytes`, 1, COMMON_BOUNDS.maxEnvelopeBytes), context, `${path}Bytes`, 'payload');
  return ref;
}
/** @param {JSONValue} value @param {string} path @returns {EvidenceScopeV2} */
function scope(value, path) {
  const v = record(value, ['kind'], path, ['path']);
  const kind = choice(v.kind, ['all', 'summary', 'patch', 'verification', 'file'], `${path}.kind`);
  record(v, kind === 'file' ? ['kind', 'path'] : ['kind'], path);
  if (kind === 'file') text(v.path, `${path}.path`);
  return /** @type {EvidenceScopeV2} */ (v);
}
/** @param {JSONValue} value @param {string} path @param {Ctx} context @returns {EndpointV2} */
function endpoint(value, path, context) {
  const v = record(value, ['kind'], path, ['owner', 'actor']);
  const kind = choice(v.kind, ['main', 'participant'], `${path}.kind`);
  if (kind === 'main') { record(v, ['kind', 'owner'], path); validateOwnerBinding(v.owner, context); }
  else { record(v, ['kind', 'actor'], path); check(validateActorBinding(v.actor, context).role !== 'main', path, 'Participant endpoint cannot impersonate Main', 'wrong-principal'); }
  return /** @type {EndpointV2} */ (v);
}
/** @param {JSONValue} value @param {string} path @param {Ctx} context @returns {MailboxKeyV2} */
function mailboxKey(value, path, context) {
  const v = record(value, ['domain', 'epoch', 'messageId', 'idempotencyKey', 'operationId', 'producer', 'consumer'], path);
  choice(v.domain, ['pair-mailbox/2'], `${path}.domain`);
  for (const key of ['messageId', 'idempotencyKey', 'operationId']) validateId(v[key], `${path}.${key}`);
  const e = record(v.epoch, ['storeId', 'segmentId', 'archive'], `${path}.epoch`);
  validateId(e.storeId, `${path}.epoch.storeId`); validateId(e.segmentId, `${path}.epoch.segmentId`);
  if (e.archive !== null) {
    const a = validateArchiveReferenceV2(e.archive, context);
    check(a.storeId === e.storeId && a.segmentId === e.segmentId, `${path}.epoch.archive`, 'Archive must identify this retained admission epoch', 'inconsistent-reference');
    consumeReference(a.byteLength, context, `${path}.epoch.archive.byteLength`, 'archive');
  }
  const producer = endpoint(v.producer, `${path}.producer`, context), consumer = endpoint(v.consumer, `${path}.consumer`, context);
  check(producer.kind !== consumer.kind, path, 'One Main and one participant endpoint required', 'wrong-principal');
  return /** @type {MailboxKeyV2} */ (v);
}
/** @param {MailboxKeyV2} key @param {ActorControlBinding} binding @param {Direction} sender @param {string} path */
function endpointsMatch(key, binding, sender, path) {
  check(key.operationId === binding.operationId, path, 'Operation mismatch', 'inconsistent-reference');
  const main = key.producer.kind === 'main' ? key.producer : key.consumer;
  const peer = key.producer.kind === 'participant' ? key.producer : key.consumer;
  check(main.kind === 'main' && peer.kind === 'participant' && same(main.owner, binding.owner) && same(peer.actor, binding.actor), path, 'Producer/consumer binding mismatch', 'wrong-principal');
  check((key.producer.kind === 'main') === (sender === 'main'), path, 'Producer direction mismatch', 'wrong-principal');
  if (binding.grantProof !== null) check(key.epoch.storeId === binding.grantProof.storeId, path, 'Grant store mismatch', 'inconsistent-reference');
}
/** @param {JSONValue} value @param {string} path @param {Ctx} context @returns {DispositionReceiptV2} */
function disposition(value, path, context) {
  const w = record(value, ['content', 'digest'], path), v = record(w.content, ['version', 'receiptId', 'key', 'inputHash', 'at', 'outcome'], `${path}.content`);
  version(v.version, `${path}.content.version`); validateId(v.receiptId, `${path}.receiptId`);
  mailboxKey(v.key, `${path}.key`, context); validateHash(v.inputHash, `${path}.inputHash`); const at = integer(v.at, `${path}.at`);
  const o = record(v.outcome, ['kind'], `${path}.outcome`, ['retainedInputHash', 'receipt', 'code', 'reason', 'observation', 'activationId', 'resolution', 'effectBarrier']);
  const kind = choice(o.kind, ['duplicate', 'conflict', 'rejected', 'not-sent', 'unknown', 'consumed', 'resolved'], `${path}.outcome.kind`);
  switch (kind) {
    case 'duplicate': case 'conflict':
      record(o, ['kind', 'retainedInputHash', 'receipt'], `${path}.outcome`);
      validateHash(o.retainedInputHash, `${path}.outcome.retainedInputHash`);
      { const prior = payloadRef(o.receipt, `${path}.outcome.receipt`, context);
        check(prior.artifact.hash !== w.digest && prior.hashDomain === 'mailbox', path, 'Retained receipt must name earlier mailbox disposition content'); }
      check((v.inputHash === o.retainedInputHash) === (kind === 'duplicate'), `${path}.outcome`, 'Duplicate/conflict hash relation invalid', 'inconsistent-reference'); break;
    case 'rejected':
      record(o, ['kind', 'code', 'reason'], `${path}.outcome`); validateId(o.code, `${path}.outcome.code`); text(o.reason, `${path}.outcome.reason`); break;
    case 'not-sent': record(o, ['kind', 'reason'], `${path}.outcome`); text(o.reason, `${path}.outcome.reason`); break;
    case 'unknown':
      record(o, ['kind', 'observation', 'reason'], `${path}.outcome`); observation(o.observation, `${path}.outcome.observation`); text(o.reason, `${path}.outcome.reason`); break;
    case 'consumed':
      record(o, ['kind', 'activationId', 'observation'], `${path}.outcome`); validateId(o.activationId, `${path}.outcome.activationId`); observation(o.observation, `${path}.outcome.observation`); break;
    case 'resolved':
      record(o, ['kind', 'resolution', 'observation', 'effectBarrier'], `${path}.outcome`); choice(o.resolution, ['completed', 'cancelled', 'reconciled'], `${path}.outcome.resolution`); observation(o.observation, `${path}.outcome.observation`);
      if (o.effectBarrier !== null) check(payloadRef(o.effectBarrier, `${path}.outcome.effectBarrier`, context).hashDomain === 'actor-event', path, 'Effect barrier must reference an actor-event fact'); break;
  }
  if (Object.hasOwn(o, 'observation')) check(observation(o.observation, `${path}.outcome.observation`).at <= at, path, 'Disposition predates observation');
  validateHash(w.digest, `${path}.digest`); check(w.digest === pairDigest('mailbox', v, context), `${path}.digest`, 'Disposition digest mismatch', 'hash-mismatch');
  return /** @type {DispositionReceiptV2} */ (w);
}

const INSPECTION_BINDING_KEYS = Object.freeze(['actor', 'profile', 'workflowId', 'workflowRevision', 'activationId', 'intentId', 'intentHash', 'operationId', 'reportId', 'reportHash', 'checkpointHash', 'scope']);
/** All three concrete artifacts are immutable and independently hashable. Their
 * request/reply refs are not recursively embedded, so no self-referential hash.
 * @param {JSONValue} value @param {'inspection-request'|'inspection-reply'|'inspection-receipt'} kind @param {ActorControlBinding} b @param {string} path @param {Ctx} context
 * @returns {InspectionRequestV2|InspectionReplyV2|InspectionReceiptV2} */
function inspection(value, kind, b, path, context) {
  const w = record(value, ['content', 'digest'], path);
  const extras = kind === 'inspection-request' ? ['deadline'] : kind === 'inspection-reply' ? ['replyId', 'request', 'requestBytes', 'evidence', 'at'] : ['replyId', 'receiptId', 'request', 'requestBytes', 'reply', 'replyBytes', 'delivery'];
  const v = record(w.content, ['version', 'kind', ...INSPECTION_BINDING_KEYS, 'requestId', ...extras], `${path}.content`);
  version(v.version, `${path}.version`); check(v.kind === kind, `${path}.kind`, 'Inspection discriminant mismatch');
  const actor = validateActorBinding(v.actor, context);
  check(actor.role === 'supervisor' && v.profile === 'supervisor-restricted', path, 'Inspection requires restricted supervisor', 'wrong-principal');
  check(same(actor, b.actor) && v.profile === b.profile, path, 'Reviewer actor/profile mismatch', 'inconsistent-reference');
  for (const field of ['workflowId', 'workflowRevision', 'activationId', 'operationId']) {
    validateId(v[field], `${path}.${field}`); check(v[field] === b[/** @type {'workflowId'|'workflowRevision'|'activationId'|'operationId'} */ (field)], path, 'Inspection operation/activation/workflow mismatch', 'inconsistent-reference');
  }
  for (const field of ['intentId', 'reportId', 'requestId']) validateId(v[field], `${path}.${field}`);
  for (const field of ['intentHash', 'reportHash', 'checkpointHash']) validateHash(v[field], `${path}.${field}`);
  check(v.intentHash !== b.inputHash, `${path}.intentHash`, 'Inspection must refer to an earlier intent, not its own input hash');
  scope(v.scope, `${path}.scope`);
  if (kind === 'inspection-request') validateDeadlineWindow(v.deadline, context);
  else {
    validateId(v.replyId, `${path}.replyId`); check(v.replyId !== v.requestId, path, 'Request and reply IDs must differ');
    const request = inspectionRef(v.request, v.requestBytes, `${path}.request`, context);
    check(request.hash !== w.digest, path, 'Request cannot be this artifact');
    if (kind === 'inspection-reply') { refs(v.evidence, `${path}.evidence`, context); integer(v.at, `${path}.at`); }
    else {
      validateId(v.receiptId, `${path}.receiptId`); check(v.receiptId !== v.requestId && v.receiptId !== v.replyId, path, 'Receipt ID must differ from request/reply');
      const reply = inspectionRef(v.reply, v.replyBytes, `${path}.reply`, context);
      check(reply.hash !== w.digest && !same(request, reply), path, 'Inspection request/reply/receipt must be distinct artifacts');
      observation(v.delivery, `${path}.delivery`);
    }
  }
  validateHash(w.digest, `${path}.digest`); check(w.digest === pairDigest('inspection', v, context), `${path}.digest`, 'Inspection digest mismatch', 'hash-mismatch');
  envelopeSize(w, path, context);
  return /** @type {InspectionRequestV2|InspectionReplyV2|InspectionReceiptV2} */ (w);
}

/** Validate the exact current V1 report profile in original property order. It is
 * never canonicalized into V2. Older pre-identity records belong to T05 held
 * migration, not an invented runnable participant identity.
 * @param {JSONValue} value @param {string} path @param {Ctx} context @returns {LegacyReportEnvelope} */
function legacyReport(value, path, context) {
  const v = record(value, ['version', 'reportId', 'workerId', 'ownerSession', 'ownerEpoch', 'workerGeneration', 'nonce', 'sessionId', 'leaseId', 'attemptId', 'attemptNumber', 'planRevision', 'payload', 'payloadHash', 'createdAt'], path);
  check(v.version === 1, `${path}.version`, 'Expected original V1 report');
  for (const key of ['reportId', 'workerId', 'attemptId']) validateId(v[key], `${path}.${key}`);
  validateToken(v.leaseId, `${path}.leaseId`);
  for (const key of ['ownerSession', 'nonce', 'sessionId']) text(v[key], `${path}.${key}`, 10000, false);
  for (const key of ['ownerEpoch', 'workerGeneration', 'attemptNumber', 'planRevision']) integer(v[key], `${path}.${key}`, 1);
  integer(v.createdAt, `${path}.createdAt`);
  const p = record(v.payload, ['taskId', 'stepId', 'kind', 'summary'], `${path}.payload`, ['question', 'decisions', 'changedFiles', 'checks', 'stepComplete']);
  validateId(p.taskId, `${path}.payload.taskId`); validateId(p.stepId, `${path}.payload.stepId`);
  const kind = choice(p.kind, ['question', 'checkpoint', 'blocked', 'final_review'], `${path}.payload.kind`);
  check(text(p.summary, `${path}.payload.summary`, 8000, false).length > 0, path, 'Empty V1 summary');
  if (Object.hasOwn(p, 'question')) check(text(p.question, `${path}.payload.question`, 4000, false).length > 0, path, 'Empty V1 question');
  if (kind === 'question') text(p.question, `${path}.payload.question`, 4000);
  for (const key of ['decisions', 'changedFiles']) if (Object.hasOwn(p, key)) {
    for (const entry of list(p[key], `${path}.payload.${key}`, key === 'decisions' ? 24 : 200)) check(text(entry, path, key === 'decisions' ? 2000 : 1024, false).length > 0, path, 'Empty V1 list item');
  }
  if (Object.hasOwn(p, 'checks')) for (const [index, entry] of list(p.checks, `${path}.payload.checks`, 32).entries()) {
    const at = `${path}.payload.checks.${index}`, c = record(entry, ['name', 'result'], at, ['detail']);
    check(text(c.name, `${at}.name`, 200, false).length > 0, at, 'Empty check name'); choice(c.result, ['pass', 'fail', 'not_run'], `${at}.result`);
    if (Object.hasOwn(c, 'detail')) check(text(c.detail, `${at}.detail`, 2000, false).length > 0, at, 'Empty check detail');
  }
  if (Object.hasOwn(p, 'stepComplete')) check(typeof p.stepComplete === 'boolean', `${path}.payload.stepComplete`, 'Expected boolean');
  validateHash(v.payloadHash, `${path}.payloadHash`);
  check(v.payloadHash === legacyPayloadDigest(p, context), `${path}.payloadHash`, 'Original V1 payload hash mismatch', 'hash-mismatch');
  return /** @type {LegacyReportEnvelope} */ (v);
}
/** One bounded legacy inspection supplies original-byte and whole-envelope
 * hashes without charging source bytes twice. The original report payload has
 * its separate V1 hash, checked from the already-decoded paid payload below.
 * A held inspection rejects this wire value; no partial legacy value is used.
 * No derived report tree is reconstructed and no context is reset or forged.
 * @param {JSONValue} value @param {ActorControlBinding} b @param {string} path @param {Ctx} context @returns {RetainedV1Report} */
function retainedReport(value, b, path, context) {
  const v = record(value, ['carrier', 'reportId', 'reportHash', 'reportKind'], path);
  const carrier = record(v.carrier, ['encoding', 'original', 'originalBytesHash', 'payloadHash'], `${path}.carrier`);
  choice(carrier.encoding, ['pair-json-v1/1'], `${path}.carrier.encoding`);
  check(typeof carrier.original === 'string', `${path}.carrier.original`, 'Expected lossless V1 source');
  validateHash(carrier.originalBytesHash, `${path}.carrier.originalBytesHash`); validateHash(carrier.payloadHash, `${path}.carrier.payloadHash`);
  const inspected = inspectLegacySource(carrier.original, context, 'payload');
  if (inspected.kind === 'held') {
    const issue = inspected.issue;
    throw new ContractValidationError(issue.code, `${path}.carrier.original`, issue.message, issue.category);
  }
  check(inspected.originalBytesHash === carrier.originalBytesHash, `${path}.carrier.originalBytesHash`, 'Original byte hash mismatch', 'hash-mismatch');
  check(inspected.legacyPayloadHash === carrier.payloadHash, `${path}.carrier.payloadHash`, 'V1 carrier hash mismatch', 'hash-mismatch');
  const report = legacyReport(inspected.value, `${path}.carrier.report`, context);
  validateId(v.reportId, `${path}.reportId`); validateHash(v.reportHash, `${path}.reportHash`);
  check(v.reportId === report.reportId && v.reportHash === report.payloadHash && v.reportKind === report.payload.kind, path, 'Retained report must name original envelope payloadHash and kind', 'inconsistent-reference');
  const i = b.identity;
  check(b.actor.role === 'implementer' && i !== null, path, 'Report requires original implementer identity', 'wrong-principal');
  check(report.workerId === b.actor.actorId && report.workerGeneration === b.actor.generation && report.sessionId === b.actor.sessionId && report.ownerSession === b.owner.ownerSession && report.ownerEpoch === b.owner.ownerEpoch && report.nonce === b.nonce && report.leaseId === i.leaseId && report.attemptId === i.attemptId && report.attemptNumber === i.attemptNumber && report.planRevision === i.planRevision && report.payload.taskId === i.taskId, path, 'Original report producer/attempt mismatch', 'inconsistent-reference');
  return /** @type {RetainedV1Report} */ (v);
}

const PLAN_STEP_BOUND = 32;

/** @param {JSONValue} value @param {string} path */
function step(value, path) {
  const v = record(value, ['id', 'title', 'description'], path);
  validateId(v.id, `${path}.id`); text(v.title, `${path}.title`); text(v.description, `${path}.description`);
  return /** @type {PlanStepV2} */ (v);
}
/** Complete structural-plan step. `acceptance` stays absent when omitted; it is
 * never synthesized from the brief PlanStepV2 description.
 * @param {JSONValue} value @param {string} path @returns {PlanStepFullV2} */
function fullStep(value, path) {
  const v = record(value, ['id', 'title', 'instructions'], path, ['acceptance']);
  // The shared text validator always enforces COMMON_BOUNDS.maxTextBytes (10000)
  // as well as the passed character limit, so the wire bound is deliberately
  // STRICTER than the kernel's 24000-character Step schema. No control can pass
  // here and then fail kernel parsing on instruction length.
  validateId(v.id, `${path}.id`); text(v.title, `${path}.title`, 200); text(v.instructions, `${path}.instructions`);
  // Match the kernel's authoritative Step schema (schema.js stepSchema): at most
  // 64 acceptance criteria. A looser wire bound would pass here and fail kernel
  // parsing later.
  if (Object.hasOwn(v, 'acceptance')) texts(v.acceptance, `${path}.acceptance`, 64, 2000);
  return /** @type {PlanStepFullV2} */ (v);
}
/** Exact earlier supervisor plan-output link. Historical resolution and ordering
 * are aggregate concerns; this leaf validates only its closed immutable names.
 * @param {JSONValue} value @param {string} path @returns {PlanLinkV2} */
function planLink(value, path) {
  const v = record(value, ['activationId', 'intentId', 'intentHash', 'operationId', 'controlHash'], path);
  for (const key of ['activationId', 'intentId', 'operationId']) validateId(v[key], `${path}.${key}`);
  for (const key of ['intentHash', 'controlHash']) validateHash(v[key], `${path}.${key}`);
  return /** @type {PlanLinkV2} */ (v);
}
/** Closed structural replan proposal. Cross-history catalog, retirement, lineage,
 * current-selection and supersession checks remain kernel/aggregate semantics.
 * @param {JSONValue} value @param {string} path @returns {PlanChangeV2} */
function planChange(value, path) {
  const v = record(value, ['version', 'expected', 'next', 'remainingStepIds', 'introducedSteps', 'removedStepIds', 'current', 'supersedesDecisionOperationId'], path);
  check(v.version === 1, `${path}.version`, 'Expected plan change version 1', 'unsupported-version');
  const expected = record(v.expected, ['taskId', 'workflowId', 'workflowRevision', 'taskPlanRevision', 'workflowPlanRevision', 'planHash', 'currentStepId', 'reportId', 'reportHash', 'checkpointHash', 'grantOperationId', 'accountingRevision', 'budgetRevision', 'budgetHash', 'workflowBudgetRevision', 'workflowBudgetHash'], `${path}.expected`);
  for (const key of ['taskId', 'workflowId', 'workflowRevision', 'currentStepId', 'reportId', 'grantOperationId', 'accountingRevision', 'budgetRevision', 'workflowBudgetRevision']) validateId(expected[key], `${path}.expected.${key}`);
  for (const key of ['planHash', 'reportHash', 'checkpointHash', 'budgetHash', 'workflowBudgetHash']) validateHash(expected[key], `${path}.expected.${key}`);
  // The kernel requires a live plan revision of at least 1; accepting 0 here
  // would admit a proposal the kernel must reject.
  const taskPlanRevision = integer(expected.taskPlanRevision, `${path}.expected.taskPlanRevision`, 1, Number.MAX_SAFE_INTEGER - 1);
  const workflowPlanRevision = integer(expected.workflowPlanRevision, `${path}.expected.workflowPlanRevision`, 1, Number.MAX_SAFE_INTEGER - 1);
  const next = record(v.next, ['taskPlanRevision', 'workflowPlanRevision'], `${path}.next`);
  check(integer(next.taskPlanRevision, `${path}.next.taskPlanRevision`, 1) === taskPlanRevision + 1, `${path}.next.taskPlanRevision`, 'Task plan revision must advance exactly once');
  check(integer(next.workflowPlanRevision, `${path}.next.workflowPlanRevision`, 1) === workflowPlanRevision + 1, `${path}.next.workflowPlanRevision`, 'Workflow plan revision must advance exactly once');

  const remaining = list(v.remainingStepIds, `${path}.remainingStepIds`, PLAN_STEP_BOUND, 1);
  /** @type {Set<string>} */ const remainingIds = new Set();
  for (const [index, entry] of remaining.entries()) { const id = validateId(entry, `${path}.remainingStepIds.${index}`); check(!remainingIds.has(id), `${path}.remainingStepIds.${index}`, 'Duplicate remaining step ID'); remainingIds.add(id); }

  const introduced = list(v.introducedSteps, `${path}.introducedSteps`, PLAN_STEP_BOUND);
  /** @type {Set<string>} */ const introducedIds = new Set();
  for (const [index, entry] of introduced.entries()) {
    const at = `${path}.introducedSteps.${index}`, item = record(entry, ['step', 'replaces'], at), added = fullStep(item.step, `${at}.step`);
    check(!introducedIds.has(added.id), `${at}.step.id`, 'Duplicate introduced step ID'); introducedIds.add(added.id);
    /** @type {Set<string>} */ const replacedIds = new Set();
    for (const [replaceIndex, replaced] of list(item.replaces, `${at}.replaces`, PLAN_STEP_BOUND).entries()) { const replacedId = validateId(replaced, `${at}.replaces.${replaceIndex}`); check(!replacedIds.has(replacedId), `${at}.replaces.${replaceIndex}`, 'Duplicate replacement step ID'); replacedIds.add(replacedId); }
  }
  /** @type {Set<string>} */ const removedIds = new Set();
  for (const [index, removed] of list(v.removedStepIds, `${path}.removedStepIds`, PLAN_STEP_BOUND).entries()) {
    const id = validateId(removed, `${path}.removedStepIds.${index}`);
    check(!removedIds.has(id), `${path}.removedStepIds.${index}`, 'Duplicate removed step ID'); removedIds.add(id);
    check(!introducedIds.has(id), `${path}.removedStepIds.${index}`, 'Introduced and removed step IDs must be disjoint');
  }
  const current = record(v.current, ['kind'], `${path}.current`, ['successorStepId']);
  const currentKind = choice(current.kind, ['keep', 'replace'], `${path}.current.kind`);
  record(current, currentKind === 'keep' ? ['kind'] : ['kind', 'successorStepId'], `${path}.current`);
  if (currentKind === 'replace') validateId(current.successorStepId, `${path}.current.successorStepId`);
  if (v.supersedesDecisionOperationId !== null) validateId(v.supersedesDecisionOperationId, `${path}.supersedesDecisionOperationId`);
  return /** @type {PlanChangeV2} */ (v);
}
/** @param {JSONValue} value @param {'goal'|'assignment'} kind @param {string} path */
function promptPayload(value, kind, path) {
  const v = record(value, kind === 'goal' ? ['objective', 'constraints'] : ['objective', 'step', 'constraints'], path);
  text(v.objective, `${path}.objective`); texts(v.constraints, `${path}.constraints`, 64);
  if (kind === 'assignment') step(v.step, `${path}.step`);
}
/** Preflight actual intrinsic/comparison/encoding traversals of captured JSON.
 * No capture credit, reference exemption or separate operation budget.
 * @param {JSONValue} value @param {Ctx} context */
function authorityWork(value, context) {
  consumeValidationWork(context, 1, 'authority.work');
  if (typeof value === 'string') { consumeValidationWork(context, value.length, 'authority.text'); return; }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    consumeValidationWork(context, value.length, 'authority.array');
    for (const entry of value) authorityWork(entry, context);
  } else {
    const v = record(value, [], 'authority.work', Object.keys(value)), keys = Object.keys(v);
    consumeValidationWork(context, keys.length, 'authority.keys');
    keys.sort((a,b) => { consumeValidationWork(context, 1 + a.length + b.length, 'authority.sort'); return a < b ? -1 : a > b ? 1 : 0; });
    for (const key of keys) { consumeValidationWork(context, key.length, 'authority.key'); authorityWork(v[key], context); }
  }
}
/** @param {JSONValue} a @param {JSONValue} b @param {Ctx} context */
function authoritySame(a, b, context) { authorityWork(a, context); authorityWork(b, context); return same(a, b); }

/** Intrinsic prospective content, shared by inline retention and real authority
 * controls. It has no proof/root/input hash and requires no future activation.
 * @param {JSONValue} value @param {string} path @param {Ctx} context @returns {AuthorityArtifactV2} */
function authorityArtifact(value, path, context) {
  authorityWork(value, context);
  const a = record(value, ['content', 'digest'], path);
  const v = record(a.content, ['version', 'owner', 'actor', 'profile', 'nonce', 'workflowId', 'workflowRevision', 'activationId', 'identity', 'grantOperationId', 'deadline', 'command'], `${path}.content`);
  version(v.version, `${path}.content.version`);
  const owner = validateOwnerBinding(v.owner, context), actor = validateActorBinding(v.actor, context);
  const profile = choice(v.profile, ['supervisor-restricted', 'worker-native'], `${path}.profile`);
  const nonce = text(v.nonce, `${path}.nonce`);
  const identity = v.identity === null ? null : validateIdentity(v.identity, context);
  check(actor.role !== 'main' && actor.model !== null && actor.ownerSession === owner.ownerSession && actor.ownerEpoch === owner.ownerEpoch, path, 'Active authority participant/owner/model mismatch', 'inconsistent-reference');
  if (actor.role === 'supervisor') check(profile === 'supervisor-restricted' && identity === null, path, 'Supervisor authority identity/profile mismatch');
  else {
    check(profile === 'worker-native' && identity !== null, path, 'Implementer authority requires identity/profile');
    const f = identity.fence;
    check(f.workerId === actor.actorId && f.ownerSession === actor.ownerSession && f.ownerEpoch === actor.ownerEpoch && f.workerGeneration === actor.generation && f.sessionId === actor.sessionId && f.nonce === nonce, path, 'Authority fence mismatch', 'inconsistent-reference');
  }
  for (const field of ['workflowId', 'workflowRevision', 'activationId', 'grantOperationId']) validateId(v[field], `${path}.${field}`);
  validateDeadlineWindow(v.deadline, context);
  const command = record(v.command, ['kind', 'payload'], `${path}.command`);
  const kind = choice(command.kind, ['goal', 'assignment'], `${path}.command.kind`);
  check(kind === (actor.role === 'supervisor' ? 'goal' : 'assignment'), path, 'Authority command role mismatch', 'wrong-principal');
  promptPayload(command.payload, kind, `${path}.command.payload`);
  validateHash(a.digest, `${path}.digest`);
  authorityWork(v, context);
  check(a.digest === pairDigest('authority', v, context), path, 'Authority content digest mismatch', 'hash-mismatch');
  authorityWork(a, context); envelopeSize(a, path, context);
  return /** @type {AuthorityArtifactV2} */ (a);
}

/** Mandatory private-module leaf. Expected is closed untrusted data, not proof
 * of a future activation. Registration precedes access to either argument.
 * @param {unknown} value @param {AuthorityRetentionBindingV2} expected @param {Ctx} context @returns {AuthorityArtifactV2} */
export function validateAuthorityArtifactV2InContext(value, expected, context) {
  requireValidationContext(context);
  const wanted = captureValidationWork(expected, 'authority.expected', context);
  authorityWork(wanted, context);
  const e = record(wanted, ['owner', 'workflowId', 'workflowRevision'], 'authority.expected');
  const owner = validateOwnerBinding(e.owner, context);
  const workflowId = validateId(e.workflowId, 'authority.expected.workflowId');
  const workflowRevision = validateId(e.workflowRevision, 'authority.expected.workflowRevision');
  const a = authorityArtifact(captureValidationWork(value, 'authority', context), 'authority', context);
  check(authoritySame(a.content.owner, owner, context) && a.content.workflowId === workflowId && a.content.workflowRevision === workflowRevision, 'authority', 'Retention owner/workflow binding mismatch', 'inconsistent-reference');
  return a;
}

/** A real authority control still validates/charges its actual payloadRef and
 * retains every enclosing binding, proof, deadline and byte-length predicate.
 * @param {JSONValue} value @param {ActorControlBinding} b @param {JSONValue} deadline @param {string} path @param {Ctx} context */
function authority(value, b, deadline, path, context) {
  const p = record(value, ['authority', 'artifact'], path);
  const ref = payloadRef(p.authority, `${path}.authority`, context);
  const a = authorityArtifact(p.artifact, `${path}.artifact`, context), v = a.content;
  for (const field of /** @type {const} */ (['owner', 'actor', 'profile', 'nonce', 'workflowId', 'workflowRevision', 'activationId', 'identity'])) check(authoritySame(v[field], b[field], context), `${path}.${field}`, 'Authority binding mismatch', 'inconsistent-reference');
  check(b.grantProof !== null && b.operationId === b.grantProof.grantOperationId && v.grantOperationId === b.operationId, path, 'Authority grant operation mismatch', 'inconsistent-reference');
  check(authoritySame(v.deadline, deadline, context), path, 'Authority deadline mismatch');
  check(a.digest === b.grantProof.authorityHash && a.digest === ref.artifact.hash && ref.hashDomain === 'authority', path, 'Authority content/reference/proof hash mismatch', 'hash-mismatch');
  authorityWork(a, context);
  check(ref.byteLength === utf8Bytes(encodePairJSON(a, context)), path, 'Authority reference byte length mismatch');
}
/** @param {ActorControlBinding} b @param {string} path */
function active(b, path) {
  check(b.workflowId !== null && b.workflowRevision !== null && b.activationId !== null && b.grantProof !== null && b.actor.model !== null, path, 'Active message requires workflow, activation, selected model and grant proof', 'missing-required-proof');
}
/** @param {ActorControlBinding} b @param {string} path */
function inactive(b, path) {
  check(b.workflowId === null && b.workflowRevision === null && b.activationId === null && b.identity === null && b.grantProof === null, path, 'Handshake/idle observation requires explicit null workflow/activation/identity/proof');
}
/** @param {JSONRecord} input @param {ActorControlBinding} b @param {string} path @param {Ctx} context @returns {WireMessageV2['kind']} */
function message(input, b, path, context) {
  const kind = choice(input.kind, ['probe', 'handshake', 'authority', 'goal', 'assignment', 'plan', 'answer', 'review', 'blocker', 'report', 'latch', 'inspection-request', 'inspection-reply', 'inspection-receipt', 'telemetry', 'ack', 'run', 'cancel', 'failure', 'reconcile', 'disposition'], `${path}.kind`);
  const sender = choice(input.sender, ['main', 'participant'], `${path}.sender`);
  const replies = ['handshake', 'inspection-reply', 'ack', 'disposition'];
  if (replies.includes(kind)) {
    validateId(input.replyId, `${path}.replyId`); check(input.replyId !== input.requestId && input.causationId === input.requestId, path, 'Reply must identify its originating request');
  } else check(input.replyId === null, `${path}.replyId`, 'Non-reply requires explicit null replyId');
  const mainKinds = ['probe', 'authority', 'goal', 'assignment', 'inspection-reply', 'cancel', 'reconcile', 'disposition'];
  const peerKinds = ['handshake', 'plan', 'answer', 'review', 'blocker', 'report', 'latch', 'inspection-request', 'inspection-receipt', 'telemetry', 'ack', 'run'];
  check(!mainKinds.includes(kind) || sender === 'main', path, 'Main producer required', 'wrong-principal');
  check(!peerKinds.includes(kind) || sender === 'participant', path, 'Participant producer required', 'wrong-principal');
  if (['goal', 'plan', 'answer', 'review', 'blocker', 'inspection-request', 'inspection-reply', 'inspection-receipt'].includes(kind)) check(b.actor.role === 'supervisor', path, 'Supervisor peer required', 'wrong-principal');
  if (['assignment', 'report', 'latch'].includes(kind)) check(b.actor.role === 'implementer', path, 'Implementer peer required', 'wrong-principal');
  if (kind === 'probe' || kind === 'handshake') inactive(b, path);
  else if (['telemetry', 'cancel', 'failure', 'reconcile', 'disposition'].includes(kind) && b.activationId === null) inactive(b, path);
  else active(b, path);
  const p = input.payload, at = `${path}.payload`;
  switch (kind) {
    case 'probe': case 'handshake': {
      const v = record(p, kind === 'probe' ? ['acceptedWireVersion', 'acceptedProfile'] : ['acceptedWireVersion', 'acceptedProfile', 'sessionId', 'model'], at);
      version(v.acceptedWireVersion, `${at}.acceptedWireVersion`); check(v.acceptedProfile === b.profile, at, 'Peer profile mismatch', 'wrong-profile');
      if (kind === 'handshake') check(v.sessionId === b.actor.sessionId && v.model === b.actor.model, at, 'Handshake readback mismatch', 'inconsistent-reference');
      break;
    }
    case 'authority': authority(p, b, input.deadline, at, context); break;
    case 'goal': case 'assignment': promptPayload(p, kind, at); break;
    case 'plan': {
      const v = record(p, ['planRevision', 'steps', 'summary'], at, ['change']); integer(v.planRevision, `${at}.planRevision`, 1); text(v.summary, `${at}.summary`);
      /** @type {Set<string>} */
      const ids = new Set();
      for (const [i, entry] of list(v.steps, `${at}.steps`, PLAN_STEP_BOUND, 1).entries()) { const s = step(entry, `${at}.steps.${i}`); check(!ids.has(s.id), at, 'Duplicate plan step ID'); ids.add(s.id); }
      if (Object.hasOwn(v, 'change')) planChange(v.change, `${at}.change`);
      break;
    }
    case 'answer': {
      const v = record(p, ['reportId', 'reportHash', 'answer'], at); validateId(v.reportId, `${at}.reportId`); validateHash(v.reportHash, `${at}.reportHash`); text(v.answer, `${at}.answer`); break;
    }
    case 'review': {
      const v = record(p, ['reportId', 'reportHash', 'checkpointHash', 'scope', 'action', 'reason'], at, ['planLink']);
      validateId(v.reportId, `${at}.reportId`); validateHash(v.reportHash, `${at}.reportHash`); validateHash(v.checkpointHash, `${at}.checkpointHash`);
      const s = scope(v.scope, `${at}.scope`), action = choice(v.action, ['approve', 'revise', 'answer', 'cancel'], `${at}.action`); text(v.reason, `${at}.reason`);
      check(action !== 'approve' || s.kind === 'all', `${at}.scope`, 'Approval requires all-evidence scope');
      if (Object.hasOwn(v, 'planLink')) {
        check(action === 'revise', `${at}.planLink`, 'Plan link is only valid for revise');
        const link = planLink(v.planLink, `${at}.planLink`);
        check(link.activationId === b.activationId, `${at}.planLink.activationId`, 'Plan and review must share an activation', 'inconsistent-reference');
        check(link.intentId !== input.requestId && link.intentHash !== b.inputHash && link.operationId !== b.operationId, `${at}.planLink`, 'Plan link must name an earlier distinct control', 'inconsistent-reference');
      }
      break;
    }
    case 'blocker': {
      const v = record(p, ['summary', 'question'], at); text(v.summary, `${at}.summary`); if (v.question !== null) text(v.question, `${at}.question`); break;
    }
    case 'report': case 'latch': retainedReport(p, b, at, context); break;
    case 'inspection-request': case 'inspection-reply': case 'inspection-receipt': {
      const a = inspection(p, kind, b, at, context), content = a.content;
      check(content.requestId === input.requestId, at, 'Inspection request ID mismatch', 'inconsistent-reference');
      check(content.intentId !== input.requestId, at, 'Inspection intent must precede the inspection request');
      if (content.kind === 'inspection-request') check(same(content.deadline, input.deadline) && input.causationId === content.intentId, at, 'Inspection intent/deadline mismatch');
      if (content.kind === 'inspection-reply') check(content.replyId === input.replyId, at, 'Inspection reply ID mismatch');
      if (content.kind === 'inspection-receipt') check(input.causationId === content.replyId, at, 'Receipt must identify its delivered reply');
      break;
    }
    case 'telemetry': {
      const v = record(p, ['observation', 'sequence', 'state', 'context', 'usage', 'pid', 'exit'], at);
      observation(v.observation, `${at}.observation`); integer(v.sequence, `${at}.sequence`, 1);
      choice(v.state, ['sleeping', 'starting', 'idle', 'busy', 'stopping', 'faulted'], `${at}.state`);
      for (const f of ['context', 'usage']) choice(v[f], ['fresh', 'stale', 'unknown'], `${at}.${f}`);
      if (v.pid !== null) integer(v.pid, `${at}.pid`, 1);
      if (v.exit !== null) { const e = record(v.exit, ['code', 'signal'], `${at}.exit`); if (e.code !== null) integer(e.code, `${at}.exit.code`, -2147483648, 2147483647); if (e.signal !== null) text(e.signal, `${at}.exit.signal`, 128); } break;
    }
    case 'ack': case 'run': {
      const v = record(p, kind === 'ack' ? ['observation', 'commandId', 'inputHash', 'result', 'detail'] : ['observation', 'commandId', 'inputHash', 'state'], at);
      observation(v.observation, `${at}.observation`); validateId(v.commandId, `${at}.commandId`); validateHash(v.inputHash, `${at}.inputHash`);
      check(v.commandId === input.requestId && v.inputHash !== b.inputHash, at, 'Observation names original command/input, not its own digest', 'inconsistent-reference');
      if (kind === 'ack') { choice(v.result, ['accepted', 'rejected', 'unknown'], `${at}.result`); if (v.detail !== null) text(v.detail, `${at}.detail`); }
      else choice(v.state, ['started', 'settled', 'unknown'], `${at}.state`); break;
    }
    case 'cancel': case 'reconcile': case 'failure': {
      const fields = kind === 'cancel' ? ['targetOperationId', 'reason'] : kind === 'reconcile' ? ['targetOperationId', 'reason', 'evidence'] : ['targetOperationId', 'code', 'reason', 'execution', 'observation'];
      const v = record(p, fields, at); validateId(v.targetOperationId, `${at}.targetOperationId`); text(v.reason, `${at}.reason`);
      if (kind === 'reconcile') refs(v.evidence, `${at}.evidence`, context);
      if (kind === 'failure') { validateId(v.code, `${at}.code`); choice(v.execution, ['not-sent', 'rejected', 'unknown'], `${at}.execution`); observation(v.observation, `${at}.observation`); } break;
    }
    case 'disposition': {
      const d = disposition(p, at, context).content;
      endpointsMatch(d.key, b, d.key.producer.kind === 'main' ? 'main' : 'participant', at);
      check(d.inputHash !== b.inputHash, at, 'Disposition names original input, not its own digest');
      break;
    }
  }
  return kind;
}

/** @param {JSONValue} value @param {string} path @param {Ctx} context @param {ActorControlBinding} [expected] @returns {ActorControlV2} */
function control(value, path, context, expected) {
  envelopeSize(value, path, context);
  const w = record(value, ['content', 'digest'], path), v = record(w.content, ['binding', 'input'], `${path}.content`);
  const b = expected === undefined ? validateActorControlBinding(v.binding, context) : assertActorControlBinding(v.binding, expected, context);
  const input = record(v.input, ['identity', 'sender', 'requestId', 'replyId', 'correlationId', 'causationId', 'deadline', 'kind', 'payload'], `${path}.input`);
  const projection = projectControlIdentity(b, context);
  check(same(input.identity, projection), `${path}.input.identity`, 'Immutable identity projection mismatch', 'inconsistent-reference');
  for (const key of ['requestId', 'correlationId']) validateId(input[key], `${path}.input.${key}`);
  if (input.causationId !== null) validateId(input.causationId, `${path}.input.causationId`);
  validateDeadlineWindow(input.deadline, context);
  message(input, b, `${path}.input`, context);
  check(b.inputHash === pairDigest('operation-input', input, context), `${path}.binding.inputHash`, 'Original control input hash mismatch', 'hash-mismatch');
  validateHash(w.digest, `${path}.digest`); check(w.digest === pairDigest('control', v, context), `${path}.digest`, 'Control wrapper digest mismatch', 'hash-mismatch');
  envelopeSize(w, path, context);
  return /** @type {ActorControlV2} */ (w);
}

/** Exactly one public operation context, shared with the untrusted expected
 * binding. The expected argument is mandatory and NEVER authorizes a sender.
 * @param {unknown} value @param {ActorControlBinding} expected @returns {ActorControlV2} */
export function validateActorControlV2(value, expected) {
  const context = createValidationContext();
  const captured = ensureInert(value, 'control', context);
  const wanted = validateActorControlBinding(expected, context);
  return control(captured, 'control', context, wanted);
}

/** Mandatory-context intrinsic validation. Expected binding is still REQUIRED
 * untrusted data, never inferred or an authorization. Registration is checked
 * before accessing either input, including when expected is omitted.
 * @param {unknown} value @param {ActorControlBinding} expected @param {Ctx} context @returns {ActorControlV2} */
export function validateActorControlV2InContext(value, expected, context) {
  requireValidationContext(context);
  const captured = captureValidationWork(value, 'control', context);
  const wanted = validateActorControlBinding(captureValidationWork(expected, 'control', context), context);
  return control(captured, 'control', context, wanted);
}

/** Intrinsic shape/hash only; current/archived epoch authorization, immutable
 * receipt disclosure and historical reservation checks belong to T08/Host.
 * @param {JSONValue} captured @param {Ctx} context @returns {MailboxEnvelopeV2} */
function mailboxEnvelope(captured, context) {
  // Same registered operation: charge actual intrinsic scans as well as encoding.
  authorityWork(captured, context);
  envelopeSize(captured, 'mailbox', context);
  const w = record(captured, ['content', 'digest'], 'mailbox');
  const v = record(w.content, ['version', 'key', 'createdAt', 'lane', 'priority', 'control', 'delivery'], 'mailbox.content');
  version(v.version, 'mailbox.content.version');
  const key = mailboxKey(v.key, 'mailbox.key', context), c = control(v.control, 'mailbox.control', context), b = c.content.binding, input = c.content.input;
  endpointsMatch(key, b, input.sender, 'mailbox.key');
  const createdAt = integer(v.createdAt, 'mailbox.createdAt');
  check(createdAt <= input.deadline.admissionAt, 'mailbox.createdAt', 'Creation must not follow immutable admission time');
  const reserved = ['cancel', 'failure', 'reconcile', 'disposition'].includes(input.kind);
  check(v.lane === (reserved ? 'reserved-control' : 'ordinary'), 'mailbox.lane', 'Only cancellation/failure/disposition/reconciliation use reserve');
  const question = input.kind === 'answer' || (input.kind === 'blocker' && input.payload.question !== null) || ((input.kind === 'report' || input.kind === 'latch') && input.payload.reportKind === 'question');
  choice(v.priority, reserved ? ['control'] : question ? ['normal', 'question-answer'] : ['normal'], 'mailbox.priority');
  const delivery = record(v.delivery, ['admission', 'reservation', 'disposition', 'reply'], 'mailbox.delivery');
  for (const field of ['admission', 'reservation', 'reply']) if (delivery[field] !== null) {
    const ref = payloadRef(delivery[field], `mailbox.delivery.${field}`, context);
    check(ref.hashDomain === (field === 'reply' ? 'control' : 'actor-event'), `mailbox.delivery.${field}`, 'Delivery reference uses wrong content hash domain');
  }
  check(delivery.admission === null || delivery.reservation !== null, 'mailbox.delivery', 'Accepted receipt requires retained reservation reference', 'missing-required-proof');
  if (delivery.disposition !== null) {
    const d = disposition(delivery.disposition, 'mailbox.delivery.disposition', context).content;
    check(same(d.key, key) && d.inputHash === b.inputHash && d.at >= createdAt, 'mailbox.delivery.disposition', 'Disposition key/input/time mismatch', 'inconsistent-reference');
    if (d.outcome.kind === 'unknown' || d.outcome.kind === 'consumed') check(delivery.reservation !== null, 'mailbox.delivery.reservation', 'Unknown/consumed work retains its reservation', 'missing-required-proof');
    if (d.outcome.kind === 'rejected') check(delivery.admission === null, 'mailbox.delivery.admission', 'Rejection cannot claim accepted admission');
    if (d.outcome.kind === 'consumed') check(d.outcome.activationId === b.activationId, 'mailbox.delivery.disposition', 'Consumed activation mismatch');
  }
  validateHash(w.digest, 'mailbox.digest'); check(w.digest === pairDigest('mailbox', v, context), 'mailbox.digest', 'Mailbox wrapper digest mismatch', 'hash-mismatch');
  envelopeSize(w, 'mailbox', context);
  return /** @type {MailboxEnvelopeV2} */ (w);
}

/** @param {unknown} value @returns {MailboxEnvelopeV2} */
export function validateMailboxEnvelopeV2(value) {
  const context = createValidationContext();
  return mailboxEnvelope(ensureInert(value, 'mailbox', context), context);
}

/** Private aggregate entry point; no new operation or reference exemption.
 * @param {unknown} value @param {Ctx} context @returns {MailboxEnvelopeV2} */
export function validateMailboxEnvelopeV2InContext(value, context) {
  requireValidationContext(context);
  return mailboxEnvelope(captureValidationWork(value, 'mailbox', context), context);
}

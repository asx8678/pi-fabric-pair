/**
 * Private, pure ar3-common-abi/2. No clock, identity allocation, I/O or authority.
 *
 * Public leaf/model facades are NOT implemented here. All returned contract data
 * is detached and deeply frozen. A ValidationContext is an operation-local budget,
 * not caller-provided evidence: only handles issued here are recognized. Reusing
 * an immutable copy avoids charging the same decode/shape/hash pipeline twice;
 * newly supplied inputs (including mutable originals) are always inspected.
 *
 * Limits measure JSON value occurrences (root depth 0), exact encoded UTF-8 bytes,
 * source bytes, and referenced bytes/count across the whole operation. Object keys
 * contribute encoded bytes, not separate value nodes. Repeated subtrees in an input
 * count at every occurrence. Recursive work is capped at depth 32 before descent.
 * Source and encoded byte counters are separate ceilings, not interchangeable;
 * whitespace cannot bypass the source ceiling. No helper starts a nested budget.
 */
import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import { UsageValidationError } from './observations.js';

export const SHARED_ABI_REVISION = 'ar3-common-abi/2';
export const PAIR_JSON_ENCODING = 'pair-json/1';
export const V1_CARRIER_ENCODING = 'pair-json-v1/1';
export const COMMON_BOUNDS = Object.freeze({
  maxDepth: 32, maxNodes: 250000, maxBytes: 16777216,
  maxReferences: 16, maxReferenceBytes: 4194304, maxReferencedBytes: 16777216,
  maxEvents: 16384, reservedEvents: 256, reservedBytes: 524288,
  maxActorDefinitions: 64, maxUnresolvedWorkflows: 1,
  defaultQueuedPerActor: 8, maxQueuedPerActor: 64, maxMailboxBytes: 4194304,
  maxControlEnvelopes: 8, maxControlBytes: 524288, maxEnvelopeBytes: 65536,
  maxUnresolvedOperations: 256, maxInspectionReceipts: 256,
  maxTextBytes: 10000, maxRequestLifetimeMs: 300000,
});
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const TOKEN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const RESERVED_IDS = new Set(['prototype', ...Object.getOwnPropertyNames(Object.prototype)]);
const DOMAINS = Object.freeze(['config', 'state', 'actor-event', 'workflow-input', 'operation-input', 'authority', 'mailbox', 'control', 'inspection', 'migration', 'archive']);

/** @typedef {'corrupt'|'unsupported'} ErrorCategory */
/** @typedef {'config'|'state'|'actor-event'|'workflow-input'|'operation-input'|'authority'|'mailbox'|'control'|'inspection'|'migration'|'archive'} DigestDomain */
/** @typedef {null|boolean|number|string|JSONArray|JSONRecord} JSONValue */
/** @typedef {readonly JSONValue[]} JSONArray */
/** @typedef {{readonly [key: string]: JSONValue}} JSONRecord */
/** @typedef {string} Id */
/** @typedef {string} Hash */
/** @typedef {string} Token */
/** @typedef {'off'|'minimal'|'low'|'medium'|'high'|'xhigh'} Effort */
/** @typedef {'final-only'|'milestones'|'every-step'} ReviewMode */
/** @typedef {'minimal'|'normal'|'detailed'} SummaryDetail */
/** @typedef {'supervisor-restricted'|'worker-native'} ParticipantProfile */
/** @typedef {Readonly<{maxDepth:number, maxNodes:number, maxBytes:number, maxReferences:number, maxReferenceBytes:number, maxReferencedBytes:number}>} ValidationContext */
/** @typedef {Partial<ValidationContext>} ValidationOptions */
/** @typedef {{nodes:number, bytes:number, sourceBytes:number, references:number, referencedBytes:number, work:number, checked:WeakMap<object, boolean>}} BudgetState */
/** @typedef {Readonly<{ownerSession:string, ownerEpoch:number, branchRevision:Id}>} OwnerBinding */
/** @typedef {Readonly<{actorId:Id, role:'main'|'supervisor'|'implementer', ownerSession:string, ownerEpoch:number, generation:number, sessionId:string, model:string|null}>} ActorBinding */
/** @typedef {Readonly<{ref:string, hash:Hash}>} ArtifactRef */
/** @typedef {Readonly<{workspace:string, repoRoot:string, ownerSession:string, ownerEpoch:number, workerId:Id, workerGeneration:number, sessionId:string, nonce:string}>} Fence */
/** @typedef {Readonly<{fence:Fence, taskId:Id, planRevision:number, attemptId:Id, attemptNumber:number, leaseId:Token}>} Identity */
/** @typedef {Readonly<{admissionAt:number, expiresAt:number}>} DeadlineWindow */
/** @typedef {Readonly<{encoding:'pair-json-v1/1', original:string, originalBytesHash:Hash, payloadHash:Hash}>} V1Carrier */
/** @typedef {Readonly<{id:Id, role:'supervisor'|'implementer', provider:string, model:string, effort:Effort, cwd:string|null, extensionProfile:ParticipantProfile, readOnly:boolean}>} ActorDefinitionV3 */
/** @typedef {Readonly<{fabric:boolean, fovea:boolean, prewalkDisabled:boolean, autoCompaction:boolean}>} WorkerRequirements */
/** @typedef {Readonly<{commandArgs:readonly string[], extraExtensions:readonly string[], extraSkills:readonly string[], inheritExtensions:boolean}>} WorkerResources */
/** @typedef {Readonly<{commandArgs:readonly [], extraExtensions:readonly [], extraSkills:readonly [], inheritExtensions:false}>} SupervisorResources */
/** @typedef {Readonly<{mode:ReviewMode, finalReview:true, maxRevisions:number, maxRevisionsPerStep:number, summaryDetail:SummaryDetail}>} TaskPolicy */
/** @typedef {Readonly<{maxTurnsPerStep:number, taskTimeoutMs:number, activeStepTimeoutMs:number, maxQueuedTasks:number, maxQueuedReviews:number, maxReportsPerTask:number, maxReportBytes:number, maxAutomaticReportRepairs:number, maxAutomaticRecoveryAttempts:number, maxReportedCostUsd:number|null, maxOutputTokens:number|null}>} TaskLimits */
/** @typedef {Readonly<{name:string, command:string, args:readonly string[]}>} VerificationCommand */
/** @typedef {Readonly<{commands:readonly VerificationCommand[], requirePassing:boolean, timeoutMs:number}>} VerificationPolicy */
/** @typedef {Readonly<{maxFiles:number, maxTotalBytes:number, maxArtifactBytes:number}>} EvidenceLimits */
/** @typedef {Readonly<{cwd:string, repoRoot:string, allowedPaths:readonly string[]}>} WorkspaceBinding */
/** @typedef {Readonly<{budgetRevision:Id, policy:TaskPolicy, limits:TaskLimits, assignedAt:number, deadline:number, budgetHash:Hash}>} BudgetSnapshot */
/** @typedef {Readonly<{configRevision:Id, configHash:Hash, policy:TaskPolicy, limits:TaskLimits, verification:VerificationPolicy}>} KernelAssignmentProjection */
/** @typedef {KernelAssignmentProjection & Readonly<{evidence:EvidenceLimits, workerRequirements:WorkerRequirements, participants:Readonly<{supervisor:ActorDefinitionV3|null, implementer:ActorDefinitionV3}>, workerResources:WorkerResources, supervisorResources:SupervisorResources, workspace:WorkspaceBinding, assignedAt:number, deadline:number, budgetRevision:Id, budgetHash:Hash}>} AssignmentSnapshotV2 */
/** @typedef {Readonly<{storeId:Id, rootRevision:number, rootHash:Hash, grantOperationId:Id, authorityHash:Hash, owner:OwnerBinding, actor:ActorBinding, profile:ParticipantProfile, nonce:string, workflowId:Id, workflowRevision:Id, activationId:Id, identity:Identity|null}>} GrantCommitProofV2 */
/** @typedef {Readonly<{wireVersion:2, owner:OwnerBinding, actor:ActorBinding, nonce:string, operationId:Id, profile:ParticipantProfile, workflowId:Id|null, workflowRevision:Id|null, activationId:Id|null, identity:Identity|null, inputHash:Hash, grantProof:GrantCommitProofV2|null}>} ActorControlBinding */
/** @typedef {Omit<ActorControlBinding, 'inputHash'>} ControlIdentityProjection */
/** @typedef {Readonly<{observationId:Id, at:number}>} SettlementWitness */
/**
 * Concrete private reviewer vocabulary: request/reply/receipt are ArtifactRef
 * values, not just receipt IDs. Their hashes name their respective immutable
 * contents. intentHash names the retained intent; reportHash names the original
 * report content in its producer's domain. settlement has no invented hash.
 * T08 must prove all these references at the appropriate historical prefix.
 * @typedef {Readonly<{actor:ActorBinding, profile:'supervisor-restricted', workflowId:Id, workflowRevision:Id, activationId:Id, intentId:Id, intentHash:Hash, operationId:Id, settlement:SettlementWitness, reportId:Id, reportHash:Hash, checkpointHash:Hash, request:ArtifactRef, reply:ArtifactRef, receipt:ArtifactRef}>} ReviewerWitness
 */
/** @typedef {Readonly<{storeId:Id, segmentId:Id, originalHash:Hash, byteLength:number, priorRoot:Id|null}>} ArchiveReferenceV2 */

export class ContractValidationError extends TypeError {
  /** @param {string} code @param {string} path @param {string} message @param {ErrorCategory} [category] */
  constructor(code, path, message, category = 'corrupt') {
    super(message);
    this.name = 'ContractValidationError';
    this.code = code; this.path = path; this.category = category;
  }
}
/** Only a real known validation class is adapted. Programming errors escape.
 * No StoredValidationError import: contracts.js intentionally does not export it.
 * @param {unknown} error @returns {never}
 */
export function rethrowValidationError(error) {
  // Do not interrogate a thrown proxy or invoke a subclass's custom properties.
  if (error !== null && typeof error === 'object' && !nodeTypes.isProxy(error) && Object.getPrototypeOf(error) === UsageValidationError.prototype) {
    const code = Object.getOwnPropertyDescriptor(error, 'code');
    const path = Object.getOwnPropertyDescriptor(error, 'path');
    const message = Object.getOwnPropertyDescriptor(error, 'message');
    if (code && path && message && Object.hasOwn(code, 'value') && Object.hasOwn(path, 'value') && Object.hasOwn(message, 'value') &&
        (code.value === 'invalid-field' || code.value === 'missing-required-field') && typeof path.value === 'string' && typeof message.value === 'string') {
      throw new ContractValidationError(code.value, path.value, message.value);
    }
  }
  throw error;
}
/** @param {unknown} condition @param {string} path @param {string} message @param {string} [code] @returns {asserts condition} */
function check(condition, path, message, code = 'invalid-field') {
  if (!condition) throw new ContractValidationError(code, path, message);
}
/** @param {unknown} value @param {string} path @param {number} [minimum] @param {number} [maximum] */
function integer(value, path, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum, path, 'Expected bounded safe integer');
  return value;
}
/** @param {unknown} value @param {string} path */
function bool(value, path) { check(typeof value === 'boolean', path, 'Expected boolean'); return value; }
/** @template {string} T @param {unknown} value @param {readonly T[]} choices @param {string} path @returns {T} */
function choice(value, choices, path) {
  const match = choices.find(entry => value === entry);
  check(match !== undefined, path, 'Unsupported value'); return match;
}
/** @param {unknown} value @returns {string} */
function label(value) {
  check(typeof value === 'string' && value.length <= 1000, 'path', 'Expected bounded path label'); return value;
}
/** Count UTF-8 without allocating encoded data; reject lone UTF-16 surrogates.
 * @param {string} value @param {string} path @param {number} maximum
 */
function utf8Size(value, path, maximum) {
  check(value.length <= maximum, path, 'Text byte limit exceeded', 'capacity');
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const low = value.charCodeAt(++i);
      check(low >= 0xdc00 && low <= 0xdfff, path, 'Lone surrogate'); bytes += 4;
    } else {
      check(c < 0xdc00 || c > 0xdfff, path, 'Lone surrogate');
      bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    check(bytes <= maximum, path, 'Text byte limit exceeded', 'capacity');
  }
  return bytes;
}
/** Exact JSON.stringify string byte count, without allocating its escaped form.
 * @param {string} value @param {string} path @param {number} maximum @param {boolean} legacy
 */
function quotedSize(value, path, maximum, legacy) {
  check(value.length <= maximum, path, 'Encoded byte limit exceeded', 'capacity');
  let bytes = 2;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) bytes += 2;
    else if (c < 32) bytes += 6;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const low = value.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) { i++; bytes += 4; }
      else { check(legacy, path, 'Lone surrogate'); bytes += 6; }
    } else if (c >= 0xdc00 && c <= 0xdfff) { check(legacy, path, 'Lone surrogate'); bytes += 6; }
    else bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    check(bytes <= maximum, path, 'Encoded byte limit exceeded', 'capacity');
  }
  check(bytes <= maximum, path, 'Encoded byte limit exceeded', 'capacity');
  return bytes;
}
/** @param {unknown} value @param {string} path @param {number} [maxChars] @param {boolean} [nonempty] */
function text(value, path, maxChars = 10000, nonempty = true) {
  check(typeof value === 'string' && value.length <= maxChars, path, 'Expected bounded text');
  utf8Size(value, path, COMMON_BOUNDS.maxTextBytes);
  check(!nonempty || value.trim().length > 0, path, 'Expected nonempty text'); return value;
}
/** @param {unknown} value @param {string} path */
function id(value, path) {
  check(typeof value === 'string' && value.length <= 80 && ID_PATTERN.test(value) && !RESERVED_IDS.has(value), path, 'Invalid logical ID'); return value;
}
/** @param {unknown} value @param {string} path */
function token(value, path) {
  check(typeof value === 'string' && value.length <= 128 && TOKEN_PATTERN.test(value) && !RESERVED_IDS.has(value), path, 'Invalid token'); return value;
}
/** @param {unknown} value @param {string} path */
function hash(value, path) { check(typeof value === 'string' && value.length === 64 && HASH_PATTERN.test(value), path, 'Invalid SHA-256 hash'); return value; }
/** @param {unknown} value @param {string} path */
function nullableId(value, path) { return value === null ? null : id(value, path); }
/** @param {unknown} value @param {string} path */
function nullablePath(value, path) { return value === null ? null : text(value, path, 10000, false); }
/** @param {unknown} value @param {string} path */
function spendingCap(value, path) {
  if (value === null) return null;
  check(typeof value === 'number' && Number.isFinite(value) && value > 0, path, 'Expected positive finite cap or null'); return value;
}
/** @param {unknown} value @param {string} [path] */
export function validateId(value, path = 'id') { return id(value, label(path)); }
/** @param {unknown} value @param {string} [path] */
export function validateToken(value, path = 'token') { return token(value, label(path)); }
/** @param {unknown} value @param {string} [path] */
export function validateHash(value, path = 'hash') { return hash(value, label(path)); }
/** @param {unknown} value @param {string} [path] */
export function validateCounter(value, path = 'counter') { return integer(value, label(path)); }
/** @param {unknown} value @param {string} [path] */
export function incrementCounter(value, path = 'counter') { return integer(value, label(path), 0, Number.MAX_SAFE_INTEGER - 1) + 1; }
/** @param {unknown} value @returns {boolean} */
export function isReservedId(value) { return typeof value === 'string' && RESERVED_IDS.has(value); }

/** @type {WeakMap<object, BudgetState>} */
const budgets = new WeakMap();
const BUDGET_KEYS = Object.freeze(['maxDepth', 'maxNodes', 'maxBytes', 'maxReferences', 'maxReferenceBytes', 'maxReferencedBytes']);
/** Options bootstrap: flat own descriptors only, before accessing supplied data.
 * @param {unknown} options @returns {ValidationContext}
 */
export function createValidationContext(options = {}) {
  check(options !== null && typeof options === 'object' && !nodeTypes.isProxy(options), 'options', 'Expected inert options');
  const proto = Object.getPrototypeOf(options);
  check(proto === Object.prototype || proto === null, 'options', 'Expected plain options');
  const keys = Reflect.ownKeys(options);
  check(keys.length <= BUDGET_KEYS.length, 'options', 'Unknown option');
  /** @type {Record<string, number>} */
  const limits = {};
  for (const key of keys) {
    check(typeof key === 'string' && BUDGET_KEYS.includes(key), 'options', 'Unknown option');
    const d = Object.getOwnPropertyDescriptor(options, key);
    check(d && Object.hasOwn(d, 'value') && d.enumerable, `options.${key}`, 'Expected enumerable data option');
    const cap = COMMON_BOUNDS[/** @type {keyof ValidationContext} */ (key)];
    limits[key] = integer(d.value, `options.${key}`, 1, cap);
  }
  const result = Object.freeze({
    maxDepth: limits.maxDepth ?? COMMON_BOUNDS.maxDepth,
    maxNodes: limits.maxNodes ?? COMMON_BOUNDS.maxNodes,
    maxBytes: limits.maxBytes ?? COMMON_BOUNDS.maxBytes,
    maxReferences: limits.maxReferences ?? COMMON_BOUNDS.maxReferences,
    maxReferenceBytes: limits.maxReferenceBytes ?? COMMON_BOUNDS.maxReferenceBytes,
    maxReferencedBytes: limits.maxReferencedBytes ?? COMMON_BOUNDS.maxReferencedBytes,
  });
  budgets.set(result, { nodes: 0, bytes: 0, sourceBytes: 0, references: 0, referencedBytes: 0, work: 0, checked: new WeakMap() });
  return result;
}
/** Internal integration guard. Identity is checked without reading the supplied
 * handle (including proxies); an InContext caller must use this BEFORE its input.
 * @param {ValidationContext} context @returns {ValidationContext}
 */
export function requireValidationContext(context) {
  check(context !== null && typeof context === 'object' && budgets.has(context), 'context', 'Unrecognized validation context');
  return context;
}
/** Private-module work accounting, NOT an active configuration or representation
 * credit. One unit is one visited value/collection slot or UTF-16 code unit in a
 * scan/copy/comparison/serialization preflight. Repeated visits pay again. Kernel
 * callers charge BEFORE the corresponding work; native scans may reserve their
 * full candidate span even when they short-circuit. The finite ceiling is derived
 * only from this operation's existing bounds: one maxNodes traversal per allowed
 * depth plus one maxBytes character span. No public counter can be reset.
 * Representation/source/reference counters remain independent and unchanged.
 * @param {ValidationContext} context @param {number} count @param {string} [path]
 */
export function consumeValidationWork(context, count, path = 'kernel.work') {
  const c = requireValidationContext(context), b = budget(c);
  if (!Number.isSafeInteger(count) || count < 0) throw new TypeError('Invalid internal work charge');
  const ceiling = c.maxNodes * c.maxDepth + c.maxBytes;
  check(count <= ceiling - b.work, path, 'Operation work limit exceeded', 'capacity');
  b.work += count;
}
/** @param {ValidationContext|undefined} context @returns {ValidationContext} */
function operation(context) {
  if (context === undefined) return createValidationContext();
  check(context !== null && typeof context === 'object' && budgets.has(context), 'context', 'Unrecognized validation context');
  return context;
}
/** @param {ValidationContext} context @returns {BudgetState} */
function budget(context) {
  const state = budgets.get(context);
  if (!state) throw new TypeError('Internal validation context was not registered');
  return state;
}
/** @param {ValidationContext} context @param {number} depth @param {string} path */
function node(context, depth, path) {
  const b = budget(context);
  check(depth <= context.maxDepth && b.nodes < context.maxNodes, path, 'Depth/node limit exceeded', 'capacity'); b.nodes++;
}
/** @param {ValidationContext} context @param {number} count @param {string} path */
function encodedBytes(context, count, path) {
  const b = budget(context);
  check(count <= context.maxBytes - b.bytes, path, 'Aggregate canonical byte limit exceeded', 'capacity'); b.bytes += count;
}
/** @param {ValidationContext} context @param {number} count @param {string} path */
function sourceBytes(context, count, path) {
  const b = budget(context);
  check(count <= context.maxBytes - b.sourceBytes, path, 'Aggregate source byte limit exceeded', 'capacity'); b.sourceBytes += count;
}
/** @typedef {'payload'|'archive'} ReferenceKind */
/** @typedef {Readonly<{byteLength:number, originalBytesHash:Hash, value:JSONValue}>} DecodedReference */
/** A referenced payload/blob is at most 4 MiB; an archived canonical segment may
 * reach the 16 MiB segment ceiling. Both consume the SAME 16-reference / 16 MiB
 * operation aggregate. This distinction does not enlarge an inline envelope.
 * @param {ValidationContext} context @param {ReferenceKind} kind
 */
function referenceMaximum(context, kind) {
  choice(kind, ['payload', 'archive'], 'reference.kind');
  return kind === 'payload' ? context.maxReferenceBytes : Math.min(context.maxBytes, context.maxReferencedBytes);
}
/** A mandatory context never silently starts an independent operation.
 * @param {ValidationContext} context @returns {ValidationContext}
 */
function referenceContext(context) {
  check(context !== undefined, 'context', 'References require the enclosing operation context');
  return operation(context);
}
/** Every call denotes one retained reference occurrence, even for equal hashes.
 * Length is untrusted data, not evidence bytes exist. Use decodeReferencedPairJSON
 * for raw referenced JSON so reference/source/shape/copy/hash work shares one
 * context. For non-JSON blobs, charge here then hashBytes with the SAME context.
 * Shape-only ArtifactRef/ArchiveReferenceV2 values certify no resolved content.
 * @param {unknown} byteLength @param {ValidationContext} context @param {string} [path] @param {ReferenceKind} [kind]
 */
export function consumeReference(byteLength, context, path = 'reference', kind = 'payload') {
  const c = referenceContext(context), p = label(path), b = budget(c);
  const length = integer(byteLength, p, 0, referenceMaximum(c, kind));
  check(b.references < c.maxReferences && length <= c.maxReferencedBytes - b.referencedBytes, p, 'Aggregate reference limit exceeded', 'capacity');
  b.references++; b.referencedBytes += length;
}
/** Safe own-property construction, including __proto__.
 * @param {Record<string, JSONValue>} target @param {string} key @param {JSONValue} value
 */
function own(target, key, value) { Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true }); }
/** @param {string} path @param {string|number} key */
function childPath(path, key) {
  // Diagnostic text has its own bound; keys themselves are never truncated in data.
  const suffix = String(key);
  return `${path.slice(0, 500)}.${suffix.slice(0, 120)}`;
}
/** Inspect descriptors, count bytes, detach and freeze in one bounded traversal.
 * Never caches caller objects. Only the resulting deeply frozen copies are marked.
 * @param {unknown} value @param {string} path @param {ValidationContext} context @param {boolean} legacy
 * @returns {JSONValue}
 */
function capture(value, path, context, legacy) {
  const b = budget(context);
  if (value !== null && typeof value === 'object' && b.checked.has(value)) {
    const wasLegacy = b.checked.get(value);
    if (legacy || wasLegacy === false) return /** @type {JSONValue} */ (value);
  }
  const ancestors = new WeakSet();
  /** @param {unknown} entry @param {string} at @param {number} depth @returns {JSONValue} */
  function visit(entry, at, depth) {
    node(context, depth, at);
    if (entry === null || typeof entry === 'boolean') { encodedBytes(context, entry === null ? 4 : entry ? 4 : 5, at); return entry; }
    if (typeof entry === 'number') {
      check(Number.isFinite(entry), at, 'Nonfinite JSON number');
      encodedBytes(context, JSON.stringify(entry).length, at); return entry === 0 ? 0 : entry;
    }
    if (typeof entry === 'string') { encodedBytes(context, quotedSize(entry, at, context.maxBytes - b.bytes, legacy), at); return entry; }
    check(typeof entry === 'object' && !nodeTypes.isProxy(entry), at, 'Expected inert JSON data');
    const array = Array.isArray(entry), proto = Object.getPrototypeOf(entry);
    check(array ? proto === Array.prototype : proto === Object.prototype || proto === null, at, 'Unsupported prototype');
    check(!ancestors.has(entry), at, 'Cyclic JSON'); ancestors.add(entry);
    let length = 0;
    if (array) {
      const d = Object.getOwnPropertyDescriptor(entry, 'length');
      check(d && Object.hasOwn(d, 'value'), at, 'Missing array length');
      length = integer(d.value, at, 0, context.maxNodes - b.nodes);
    }
    // Reflect.ownKeys is the only unavoidable host key-vector allocation. Never
    // bulk-copy descriptors/values or sort until its cardinality is bounded.
    const keys = Reflect.ownKeys(entry);
    check(keys.length <= context.maxNodes - b.nodes + (array ? 1 : 0), at, 'Own-key limit exceeded', 'capacity');
    check(!array || keys.length === length + 1, at, 'Sparse or extended array');
    encodedBytes(context, 2 + Math.max(0, keys.length - (array ? 1 : 0) - 1), at);
    /** @type {Record<string, JSONValue>} */
    const objectCopy = Object.create(null);
    /** @type {JSONValue[]} */
    const arrayCopy = [];
    for (const key of keys) {
      check(typeof key === 'string', at, 'Symbol field');
      if (array && key === 'length') continue;
      const child = childPath(at, key), d = Object.getOwnPropertyDescriptor(entry, key);
      check(d && Object.hasOwn(d, 'value') && d.enumerable, child, 'Accessor or hidden field');
      if (array) check(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < length, child, 'Extra array field');
      else {
        check(legacy || key !== 'toJSON', child, 'toJSON is not a V2 data field');
        encodedBytes(context, quotedSize(key, child, context.maxBytes - b.bytes, legacy) + 1, child);
      }
      const copied = visit(d.value, child, depth + 1);
      if (array) arrayCopy[Number(key)] = copied; else own(objectCopy, key, copied);
    }
    ancestors.delete(entry);
    const result = Object.freeze(array ? arrayCopy : objectCopy);
    b.checked.set(result, legacy); return result;
  }
  return visit(value, path, 0);
}
/** Reconcile a PRIVATE constructed result with its paid V2 input, by occurrence
 * path, never by object identity or equal content elsewhere. Callers here supply
 * only closed-parser outputs, frozen default merges, or explicit projections.
 * This is not an input validator: public inputs must go through capture first.
 *
 * Equivalent copies and subset projections reuse their input's nodes/bytes.
 * Missing defaults add their entire subtree, key/colon and added separators;
 * scalar rewrites (policy aliases) add only positive encoded-size growth. No
 * removed node/byte is refunded. A new representation without a source pays in
 * full. Depth is checked throughout, including unchanged nested values. Every
 * constructed object is frozen before it is associated, including descendants.
 * @template {JSONValue} T
 * @param {T} result @param {JSONValue|undefined} source @param {string} path @param {ValidationContext} context @returns {T}
 */
function derived(result, source, path, context) {
  const b = budget(context);
  if (source !== null && typeof source === 'object' && b.checked.get(source) !== false) {
    throw new TypeError('Internal derivation requires a captured V2 source');
  }
  /** @param {JSONValue|undefined} value @param {string} at */
  function scalarSize(value, at) {
    if (value === undefined) return 0;
    if (typeof value === 'string') return quotedSize(value, at, context.maxBytes, false);
    if (value === null) return 4;
    if (typeof value === 'boolean') return value ? 4 : 5;
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value).length;
    throw new TypeError('Internal derivation expected a JSON scalar');
  }
  /** @param {JSONValue} entry @param {JSONValue|undefined} prior @param {string} at @param {number} depth */
  function visit(entry, prior, at, depth) {
    check(depth <= context.maxDepth, at, 'Depth limit exceeded', 'capacity');
    if (prior === undefined) node(context, depth, at);
    if (entry === null || typeof entry !== 'object') {
      encodedBytes(context, Math.max(0, scalarSize(entry, at) - scalarSize(prior, at)), at);
      return;
    }
    if (!Object.isFrozen(entry)) throw new TypeError('Internal derivation must be deeply frozen');
    if (Array.isArray(entry)) {
      if (prior !== undefined && !Array.isArray(prior)) throw new TypeError('Internal derivation changed container kind');
      const previous = prior === undefined ? [] : prior;
      encodedBytes(context, prior === undefined ? 2 + Math.max(0, entry.length - 1) : Math.max(0, Math.max(0, entry.length - 1) - Math.max(0, previous.length - 1)), at);
      for (let i = 0; i < entry.length; i++) visit(entry[i], i < previous.length ? previous[i] : undefined, childPath(at, i), depth + 1);
    } else {
      if (prior !== undefined && (prior === null || typeof prior !== 'object' || Array.isArray(prior))) throw new TypeError('Internal derivation changed container kind');
      const object = /** @type {JSONRecord} */ (entry), previous = /** @type {JSONRecord|undefined} */ (prior);
      const keys = Object.keys(object), oldLength = previous === undefined ? 0 : Object.keys(previous).length;
      encodedBytes(context, previous === undefined ? 2 + Math.max(0, keys.length - 1) : Math.max(0, Math.max(0, keys.length - 1) - Math.max(0, oldLength - 1)), at);
      for (const key of keys) {
        const child = childPath(at, key), present = previous !== undefined && Object.hasOwn(previous, key);
        if (!present) encodedBytes(context, quotedSize(key, child, context.maxBytes, false) + 1, child);
        visit(object[key], present ? previous[key] : undefined, child, depth + 1);
      }
    }
    b.checked.set(entry, false);
  }
  visit(result, source, path, 0);
  return result;
}
/** The parser is always a private closed-shape constructor, never caller code.
 * @template {JSONValue} T
 * @param {unknown} value @param {string} path @param {ValidationContext} context
 * @param {(value:JSONValue, path:string) => T} parse @returns {T}
 */
function validated(value, path, context, parse) {
  const input = capture(value, path, context, false);
  return derived(parse(input, path), input, path, context);
}
/** @param {unknown} value @param {string} [path] @param {ValidationContext} [context] @returns {JSONValue} */
export function ensureInert(value, path = 'value', context) { return capture(value, label(path), operation(context), false); }
/** Mandatory-context leaf preflight. Capture BEFORE reading, then charge each
 * actual value/key/character visit before the leaf constructor runs. Even an exact
 * common-owned capture pays this traversal on every invocation: capture ownership
 * is representation credit, not free repeated parsing. No result/callback/checked
 * flag is accepted and no kernel replay authority is conferred.
 * @param {unknown} value @param {string} path @param {ValidationContext} context @returns {JSONValue}
 */
export function captureValidationWork(value, path, context) {
  const c = requireValidationContext(context), p = label(path), input = capture(value, p, c, false);
  /** @param {JSONValue} entry */
  function visit(entry) {
    consumeValidationWork(c, 1, p);
    if (typeof entry === 'string') { consumeValidationWork(c, entry.length, p); return; }
    if (entry === null || typeof entry !== 'object') return;
    const keys = Object.keys(entry);
    consumeValidationWork(c, keys.length, p);
    for (const key of keys) {
      consumeValidationWork(c, key.length, p);
      visit(/** @type {JSONRecord} */ (entry)[key]);
    }
  }
  visit(input);
  return input;
}
/** V1 allows lone surrogates and inert toJSON data; never invokes a supplied method.
 * @param {unknown} value @param {string} [path] @param {ValidationContext} [context] @returns {JSONValue}
 */
export function ensureLegacyInert(value, path = 'legacy', context) { return capture(value, label(path), operation(context), true); }

// Byte input inspection uses intrinsic getters, not a caller's byteLength/buffer/
// iterator/toString methods. Shared backing stores are not immutable input facts.
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')?.get;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')?.get;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;
/** @param {unknown} value @param {string} path @param {number} maximum @returns {Uint8Array} */
function byteView(value, path, maximum) {
  check(value !== null && typeof value === 'object' && !nodeTypes.isProxy(value) && nodeTypes.isUint8Array(value), path, 'Expected Uint8Array or Buffer');
  if (!byteLengthGetter || !byteOffsetGetter || !bufferGetter) throw new TypeError('Missing typed-array intrinsics');
  const length = integer(Reflect.apply(byteLengthGetter, value, []), path, 0, maximum);
  const offset = integer(Reflect.apply(byteOffsetGetter, value, []), path);
  const backing = Reflect.apply(bufferGetter, value, []);
  check(nodeTypes.isArrayBuffer(backing), path, 'Shared backing buffers are not accepted');
  return new Uint8Array(backing, offset, length);
}
/** @param {unknown} input @param {ValidationContext} context @param {string} path @returns {string} */
function sourceText(input, context, path) {
  let result;
  if (typeof input === 'string') {
    sourceBytes(context, utf8Size(input, path, context.maxBytes), path); result = input;
  } else {
    const bytes = byteView(input, path, context.maxBytes);
    sourceBytes(context, bytes.byteLength, path);
    try { result = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch (error) {
      if (error instanceof TypeError && 'code' in error && error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') {
        throw new ContractValidationError('invalid-utf8', path, 'Invalid UTF-8');
      }
      throw error;
    }
  }
  check(result.charCodeAt(0) !== 0xfeff, path, 'UTF-8 BOM is not accepted', 'invalid-json');
  return result;
}
/** Duplicate-aware raw decoder. A string token alone uses JSON.parse only AFTER
 * its complete grammar has been checked; object construction never uses it.
 * @param {string} source @param {ValidationContext} context @param {boolean} legacy @param {string} path @param {number} [maximum] @returns {JSONValue}
 */
function decodeText(source, context, legacy, path, maximum = context.maxBytes) {
  let cursor = 0;
  const b = budget(context), startingBytes = b.bytes;
  // An inner reference ceiling tightens the existing budget; it never resets it.
  /** @param {number} count */
  function charge(count) {
    check(count <= maximum - (b.bytes - startingBytes), path, 'Decoded byte limit exceeded', 'capacity');
    encodedBytes(context, count, path);
  }
  const numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  /** @returns {never} */
  function malformed() { throw new ContractValidationError('invalid-json', path, `Malformed JSON at offset ${cursor}`); }
  function whitespace() { while (cursor < source.length && /[ \t\n\r]/.test(source[cursor])) cursor++; }
  /** @returns {string} */
  function stringToken() {
    const start = cursor;
    if (source[cursor++] !== '"') malformed();
    let closed = false;
    while (cursor < source.length) {
      const c = source.charCodeAt(cursor++);
      if (c === 34) { closed = true; break; }
      if (c < 32) malformed();
      if (c === 92) {
        const escape = source[cursor++];
        if (escape === 'u') {
          for (let i = 0; i < 4; i++) { if (cursor >= source.length || !/[0-9a-fA-F]/.test(source[cursor++])) malformed(); }
        } else if (escape === undefined || !'"\\/bfnrt'.includes(escape)) malformed();
      }
    }
    if (!closed) malformed();
    const result = /** @type {string} */ (JSON.parse(source.slice(start, cursor)));
    charge(quotedSize(result, path, Math.min(context.maxBytes - b.bytes, maximum - (b.bytes - startingBytes)), legacy)); return result;
  }
  /** @param {number} depth @returns {JSONValue} */
  function value(depth) {
    node(context, depth, path); whitespace();
    const c = source[cursor];
    if (c === '"') return stringToken();
    if (c === '[' || c === '{') {
      cursor++; charge(2); whitespace();
      const array = c === '[', close = array ? ']' : '}';
      /** @type {JSONValue[]} */
      const elements = [];
      /** @type {Record<string, JSONValue>} */
      const object = Object.create(null);
      if (source[cursor] !== close) {
        while (true) {
          if (array) elements.push(value(depth + 1));
          else {
            whitespace(); if (source[cursor] !== '"') malformed();
            const key = stringToken();
            // V1's JSON.parse reader kept the last duplicate value without moving
            // the first key's property-order position. Preserve that representation
            // and charge every parsed occurrence; V2 rejects duplicates outright.
            check(legacy || !Object.hasOwn(object, key), path, 'Duplicate raw JSON key', 'duplicate-key');
            check(legacy || key !== 'toJSON', path, 'toJSON is not a V2 data field');
            whitespace(); if (source[cursor++] !== ':') malformed();
            charge(1); own(object, key, value(depth + 1));
          }
          whitespace(); if (source[cursor] !== ',') break;
          cursor++; charge(1);
        }
      }
      if (source[cursor++] !== close) malformed();
      const result = Object.freeze(array ? elements : object); b.checked.set(result, legacy); return result;
    }
    for (const [word, result] of /** @type {const} */ ([['null', null], ['true', true], ['false', false]])) {
      if (source.startsWith(word, cursor)) { cursor += word.length; charge(word.length); return result; }
    }
    numberPattern.lastIndex = cursor;
    const match = numberPattern.exec(source); if (!match) malformed();
    cursor = numberPattern.lastIndex;
    const result = Number(match[0]); check(Number.isFinite(result), path, 'Nonfinite JSON number');
    charge(JSON.stringify(result).length); return result === 0 ? 0 : result;
  }
  const result = value(0); whitespace(); if (cursor !== source.length) malformed(); return result;
}
/** @param {unknown} input @param {ValidationContext} [context] @returns {JSONValue} */
export function decodePairJSON(input, context) { const c = operation(context); return decodeText(sourceText(input, c, 'json'), c, false, 'json'); }
/** @param {unknown} input @param {ValidationContext} [context] @returns {JSONValue} */
export function decodeLegacyV1(input, context) { const c = operation(context); return decodeText(sourceText(input, c, 'legacy'), c, true, 'legacy'); }
/** Decode one resolved V2 reference without subtree budgets. Checks both original
 * and decoded canonical sizes, and returns original-byte facts without hashing
 * the source again through another context. A supplied reference is not provenance.
 * @param {unknown} input @param {ValidationContext} context @param {ReferenceKind} [kind] @returns {DecodedReference}
 */
export function decodeReferencedPairJSON(input, context, kind = 'payload') {
  const c = referenceContext(context), maximum = referenceMaximum(c, kind);
  const byteLength = typeof input === 'string' ? utf8Size(input, 'reference', maximum) : byteView(input, 'reference', maximum).byteLength;
  consumeReference(byteLength, c, 'reference', kind);
  const original = sourceText(input, c, 'reference');
  const value = decodeText(original, c, false, 'reference', maximum);
  return Object.freeze({ byteLength, originalBytesHash: createHash('sha256').update(original, 'utf8').digest('hex'), value });
}
/** Encode only privately captured JSON. Manual object emission is important:
 * JSON.stringify on a sorted object would reorder integer-looking keys again.
 * @param {JSONValue} value @returns {string}
 */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = /** @type {JSONRecord} */ (value);
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}
/** @param {unknown} value @param {ValidationContext} [context] @returns {string} */
export function encodePairJSON(value, context) { return canonical(capture(value, 'value', operation(context), false)); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {string} */
export function encodeLegacyV1(value, context) { return JSON.stringify(capture(value, 'legacy', operation(context), true)); }
/** V2 prefix + canonical bytes; never a V1 payload hash. @param {DigestDomain} domain @param {unknown} value @param {ValidationContext} [context] */
export function pairDigest(domain, value, context) {
  check(typeof domain === 'string' && DOMAINS.includes(domain), 'domain', 'Unknown digest domain');
  return createHash('sha256').update(`pair/${domain}/v2\n`).update(encodePairJSON(value, context), 'utf8').digest('hex');
}
/** Original bytes, including corrupt/non-UTF-8 input. No JSON interpretation.
 * String callers explicitly request their UTF-8 bytes; lone surrogates reject.
 * @param {unknown} input @param {ValidationContext} [context]
 */
export function hashBytes(input, context) {
  const c = operation(context);
  if (typeof input === 'string') {
    sourceBytes(c, utf8Size(input, 'bytes', c.maxBytes), 'bytes'); return createHash('sha256').update(input, 'utf8').digest('hex');
  }
  const bytes = byteView(input, 'bytes', c.maxBytes); sourceBytes(c, bytes.byteLength, 'bytes');
  return createHash('sha256').update(bytes).digest('hex');
}
/** @param {unknown} value @param {ValidationContext} [context] */
export function legacyPayloadDigest(value, context) { return createHash('sha256').update(encodeLegacyV1(value, context), 'utf8').digest('hex'); }
/** Lossless text carrier: source hash and stringify(decodedOriginal) hash differ.
 * Canonical V2 hashing of this carrier includes its encoding and all four fields.
 * @param {unknown} input @param {ValidationContext} [context] @returns {V1Carrier}
 */
export function createV1Carrier(input, context) {
  const c = operation(context), original = sourceText(input, c, 'legacy.original');
  const decoded = decodeText(original, c, true, 'legacy.original');
  const result = Object.freeze({ encoding: V1_CARRIER_ENCODING, original,
    originalBytesHash: createHash('sha256').update(original, 'utf8').digest('hex'),
    payloadHash: createHash('sha256').update(JSON.stringify(decoded), 'utf8').digest('hex') });
  // The retained wrapper (including quoted source text) has its own real size.
  return derived(result, undefined, 'carrier', c);
}
/** @param {unknown} value @param {ValidationContext} [context] @returns {V1Carrier} */
export function validateV1Carrier(value, context) {
  const c = operation(context), v = record(capture(value, 'carrier', c, false), ['encoding', 'original', 'originalBytesHash', 'payloadHash'], 'carrier');
  check(v.encoding === V1_CARRIER_ENCODING, 'carrier.encoding', 'Unsupported V1 carrier');
  const original = sourceText(v.original, c, 'carrier.original');
  const decoded = decodeText(original, c, true, 'carrier.original');
  const originalBytesHash = hash(v.originalBytesHash, 'carrier.originalBytesHash');
  const payloadHash = hash(v.payloadHash, 'carrier.payloadHash');
  check(originalBytesHash === createHash('sha256').update(original, 'utf8').digest('hex') &&
    payloadHash === createHash('sha256').update(JSON.stringify(decoded), 'utf8').digest('hex'), 'carrier', 'V1 carrier hash mismatch', 'inconsistent-reference');
  // capture already charged the wrapper. Do not charge it a second time merely
  // because the parsed fields are returned in a concrete readonly contract type.
  return derived(Object.freeze({ encoding: V1_CARRIER_ENCODING, original, originalBytesHash, payloadHash }), v, 'carrier', c);
}

/** @typedef {'state'|'payload'|'archive'} LegacySourceKind */
/** @typedef {Readonly<{code:string, path:string, message:string, category:ErrorCategory}>} LegacyInspectionIssue */
/** @typedef {Readonly<{kind:'decoded', byteLength:number, originalBytesHash:Hash, original:string, value:JSONValue, legacyPayloadHash:Hash}>|Readonly<{kind:'held', byteLength:number, originalBytesHash:Hash, original:string|null, issue:LegacyInspectionIssue}>} LegacySourceInspection */
/** Inspect one legacy source without decoding/hashing its bytes twice.
 * The enclosing closed operation selects sourceKind, never the source itself.
 * State is unreferenced; payload/archive each consume one reference occurrence.
 * Admission failures throw without inspected-byte facts. After admitted bytes
 * are snapshotted, recognized decode failures retain their byte facts as held.
 * No consumed budget is refunded and unrelated programming errors escape.
 *
 * This frozen inspection DTO is NOT a V2 serialization contract or byte backup.
 * Its decoded value may contain legacy-only JSON. A null original means invalid
 * UTF-8: the caller must preserve its exact binary source until backup exists.
 * Actual persisted wrappers/references still pay their own representation cost.
 * @param {unknown} input @param {ValidationContext} context
 * @param {LegacySourceKind} sourceKind @returns {LegacySourceInspection}
 */
export function inspectLegacySource(input, context, sourceKind) {
  const c = referenceContext(context), path = 'legacySource';
  choice(sourceKind, ['state', 'payload', 'archive'], `${path}.sourceKind`);
  const maximum = sourceKind === 'state' ? c.maxBytes : referenceMaximum(c, sourceKind);
  const source = typeof input === 'string' ? input : byteView(input, path, maximum);
  const byteLength = typeof source === 'string' ? utf8Size(source, path, maximum) : source.byteLength;
  const b = budget(c);
  // Preflight every admission ceiling before allocating a private byte copy.
  check(byteLength <= c.maxBytes - b.sourceBytes, path, 'Aggregate source byte limit exceeded', 'capacity');
  if (sourceKind !== 'state') {
    check(b.references < c.maxReferences && byteLength <= c.maxReferencedBytes - b.referencedBytes,
      path, 'Aggregate reference limit exceeded', 'capacity');
  }
  const snapshot = typeof source === 'string' ? source : new Uint8Array(source);
  if (sourceKind !== 'state') consumeReference(byteLength, c, path, sourceKind);
  sourceBytes(c, byteLength, path);
  const originalBytesHash = typeof snapshot === 'string'
    ? createHash('sha256').update(snapshot, 'utf8').digest('hex')
    : createHash('sha256').update(snapshot).digest('hex');
  /** @type {string|null} */
  let original = null;
  try {
    if (typeof snapshot === 'string') original = snapshot;
    else {
      try { original = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(snapshot); }
      catch (error) {
        if (error instanceof TypeError && 'code' in error && error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') {
          throw new ContractValidationError('invalid-utf8', path, 'Invalid UTF-8');
        }
        throw error;
      }
    }
    check(original.charCodeAt(0) !== 0xfeff, path, 'UTF-8 BOM is not accepted', 'invalid-json');
    const value = decodeText(original, c, true, path, maximum);
    // Do not recapture even primitive decoded roots via legacyPayloadDigest.
    const legacyPayloadHash = createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
    return Object.freeze({ kind: 'decoded', byteLength, originalBytesHash, original, value, legacyPayloadHash });
  } catch (error) {
    if (!(error instanceof ContractValidationError)) throw error;
    const issue = Object.freeze({ code: error.code, path: error.path, message: error.message, category: error.category });
    return Object.freeze({ kind: 'held', byteLength, originalBytesHash, original, issue });
  }
}

/** These shape helpers are private: every call is downstream of capture/decode.
 * @param {JSONValue} value @param {readonly string[]} fields @param {string} path @param {readonly string[]} [optional] @returns {JSONRecord}
 */
function record(value, fields, path, optional = []) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'Expected record');
  const v = /** @type {JSONRecord} */ (value);
  for (const key of fields) check(Object.hasOwn(v, key), childPath(path, key), 'Missing own field', 'missing-required-field');
  for (const key of Object.keys(v)) check(fields.includes(key) || optional.includes(key), childPath(path, key), 'Unknown field');
  return v;
}
/** @param {JSONValue} value @param {string} path @param {number} [maximum] @returns {readonly JSONValue[]} */
function list(value, path, maximum = COMMON_BOUNDS.maxNodes) {
  check(Array.isArray(value) && value.length <= maximum, path, 'Expected bounded array'); return value;
}
/** @param {JSONValue} value @param {string} path @param {number} [maximum] @param {number} [maxChars] @param {boolean} [noNul] @returns {readonly string[]} */
function strings(value, path, maximum = COMMON_BOUNDS.maxNodes, maxChars = 10000, noNul = false) {
  return Object.freeze(list(value, path, maximum).map((entry, index) => {
    const at = childPath(path, index), result = text(entry, at, maxChars, false);
    check(!noNul || !result.includes('\0'), at, 'NUL in command/resource'); return result;
  }));
}

const POLICY_KEYS = Object.freeze(['mode', 'finalReview', 'maxRevisions', 'maxRevisionsPerStep', 'summaryDetail']);
const LIMIT_KEYS = Object.freeze(['maxTurnsPerStep', 'taskTimeoutMs', 'activeStepTimeoutMs', 'maxQueuedTasks', 'maxQueuedReviews', 'maxReportsPerTask', 'maxReportBytes', 'maxAutomaticReportRepairs', 'maxAutomaticRecoveryAttempts', 'maxReportedCostUsd', 'maxOutputTokens']);
const VERIFICATION_KEYS = Object.freeze(['commands', 'requirePassing', 'timeoutMs']);
const EVIDENCE_KEYS = Object.freeze(['maxFiles', 'maxTotalBytes', 'maxArtifactBytes']);
const REQUIREMENT_KEYS = Object.freeze(['fabric', 'fovea', 'prewalkDisabled', 'autoCompaction']);
const RESOURCE_KEYS = Object.freeze(['commandArgs', 'extraExtensions', 'extraSkills', 'inheritExtensions']);

/** @type {TaskPolicy} */
export const DEFAULT_TASK_POLICY = Object.freeze({ mode: 'milestones', finalReview: true, maxRevisions: 3, maxRevisionsPerStep: 3, summaryDetail: 'normal' });
/** @type {TaskLimits} */
export const DEFAULT_TASK_LIMITS = Object.freeze({ maxTurnsPerStep: 40, taskTimeoutMs: 1800000, activeStepTimeoutMs: 1800000, maxQueuedTasks: 8, maxQueuedReviews: 8, maxReportsPerTask: 40, maxReportBytes: 16384, maxAutomaticReportRepairs: 1, maxAutomaticRecoveryAttempts: 1, maxReportedCostUsd: null, maxOutputTokens: null });
/** @type {VerificationPolicy} */
export const DEFAULT_VERIFICATION = Object.freeze({ commands: Object.freeze([]), requirePassing: true, timeoutMs: 120000 });
/** @type {EvidenceLimits} */
export const DEFAULT_EVIDENCE = Object.freeze({ maxFiles: 25000, maxTotalBytes: 536870912, maxArtifactBytes: 67108864 });
/** @type {WorkerRequirements} */
export const DEFAULT_WORKER_REQUIREMENTS = Object.freeze({ fabric: true, fovea: true, prewalkDisabled: true, autoCompaction: true });
/** @type {WorkerResources} */
export const DEFAULT_WORKER_RESOURCES = Object.freeze({ commandArgs: Object.freeze([]), extraExtensions: Object.freeze([]), extraSkills: Object.freeze([]), inheritExtensions: true });
/** @type {SupervisorResources} */
export const DEFAULT_SUPERVISOR_RESOURCES = Object.freeze({ commandArgs: Object.freeze(/** @type {const} */ ([])), extraExtensions: Object.freeze(/** @type {const} */ ([])), extraSkills: Object.freeze(/** @type {const} */ ([])), inheritExtensions: false });

/** @param {JSONValue} value @param {string} path @returns {TaskPolicy} */
function policy(value, path) {
  const v = record(value, POLICY_KEYS, path);
  check(v.finalReview === true, `${path}.finalReview`, 'Final review is required');
  return Object.freeze({ mode: choice(v.mode, ['final-only', 'milestones', 'every-step'], `${path}.mode`), finalReview: true,
    maxRevisions: integer(v.maxRevisions, `${path}.maxRevisions`, 0, 20), maxRevisionsPerStep: integer(v.maxRevisionsPerStep, `${path}.maxRevisionsPerStep`, 0, 20),
    summaryDetail: choice(v.summaryDetail, ['minimal', 'normal', 'detailed'], `${path}.summaryDetail`) });
}
/** @param {JSONValue} value @param {string} path @returns {TaskLimits} */
function limits(value, path) {
  const v = record(value, LIMIT_KEYS, path);
  return Object.freeze({
    maxTurnsPerStep: integer(v.maxTurnsPerStep, `${path}.maxTurnsPerStep`, 1), taskTimeoutMs: integer(v.taskTimeoutMs, `${path}.taskTimeoutMs`, 1),
    activeStepTimeoutMs: integer(v.activeStepTimeoutMs, `${path}.activeStepTimeoutMs`, 1),
    maxQueuedTasks: integer(v.maxQueuedTasks, `${path}.maxQueuedTasks`, 0, 128), maxQueuedReviews: integer(v.maxQueuedReviews, `${path}.maxQueuedReviews`, 0, 128),
    maxReportsPerTask: integer(v.maxReportsPerTask, `${path}.maxReportsPerTask`, 1, 1000), maxReportBytes: integer(v.maxReportBytes, `${path}.maxReportBytes`, 1, 1048576),
    maxAutomaticReportRepairs: integer(v.maxAutomaticReportRepairs, `${path}.maxAutomaticReportRepairs`, 0, 20), maxAutomaticRecoveryAttempts: integer(v.maxAutomaticRecoveryAttempts, `${path}.maxAutomaticRecoveryAttempts`, 0, 20),
    maxReportedCostUsd: spendingCap(v.maxReportedCostUsd, `${path}.maxReportedCostUsd`), maxOutputTokens: spendingCap(v.maxOutputTokens, `${path}.maxOutputTokens`),
  });
}
/** Matches stored bounds and kernel nonempty command/name semantics. Resource
 * NUL rejection also preserves current config command safety; never runs commands.
 * @param {JSONValue} value @param {string} path @returns {VerificationPolicy}
 */
function verification(value, path) {
  const v = record(value, VERIFICATION_KEYS, path);
  const commands = Object.freeze(list(v.commands, `${path}.commands`, 12).map((entry, index) => {
    const at = `${path}.commands.${index}`, c = record(entry, ['name', 'command', 'args'], at);
    const command = text(c.command, `${at}.command`); check(!command.includes('\0'), `${at}.command`, 'NUL in command');
    return Object.freeze({ name: text(c.name, `${at}.name`, 1000), command, args: strings(c.args, `${at}.args`, 256, 10000, true) });
  }));
  return Object.freeze({ commands, requirePassing: bool(v.requirePassing, `${path}.requirePassing`), timeoutMs: integer(v.timeoutMs, `${path}.timeoutMs`, 1) });
}
/** @param {JSONValue} value @param {string} path @returns {EvidenceLimits} */
function evidence(value, path) {
  const v = record(value, EVIDENCE_KEYS, path);
  return Object.freeze({ maxFiles: integer(v.maxFiles, `${path}.maxFiles`, 1), maxTotalBytes: integer(v.maxTotalBytes, `${path}.maxTotalBytes`, 1), maxArtifactBytes: integer(v.maxArtifactBytes, `${path}.maxArtifactBytes`, 1) });
}
/** @param {JSONValue} value @param {string} path @returns {WorkerRequirements} */
function requirements(value, path) {
  const v = record(value, REQUIREMENT_KEYS, path);
  return Object.freeze({ fabric: bool(v.fabric, `${path}.fabric`), fovea: bool(v.fovea, `${path}.fovea`), prewalkDisabled: bool(v.prewalkDisabled, `${path}.prewalkDisabled`), autoCompaction: bool(v.autoCompaction, `${path}.autoCompaction`) });
}
/** @param {JSONValue} value @param {string} path @returns {WorkerResources} */
function resources(value, path) {
  const v = record(value, RESOURCE_KEYS, path);
  return Object.freeze({ commandArgs: strings(v.commandArgs, `${path}.commandArgs`, COMMON_BOUNDS.maxNodes, 10000, true), extraExtensions: strings(v.extraExtensions, `${path}.extraExtensions`, COMMON_BOUNDS.maxNodes, 10000, true), extraSkills: strings(v.extraSkills, `${path}.extraSkills`, COMMON_BOUNDS.maxNodes, 10000, true), inheritExtensions: bool(v.inheritExtensions, `${path}.inheritExtensions`) });
}
/** @param {JSONValue} value @param {string} path @returns {SupervisorResources} */
function supervisorResources(value, path) {
  const v = resources(value, path);
  check(!v.inheritExtensions && !v.commandArgs.length && !v.extraExtensions.length && !v.extraSkills.length, path, 'Supervisor cannot inherit user resources');
  return DEFAULT_SUPERVISOR_RESOURCES;
}
/** @param {unknown} value @param {ValidationContext} [context] @returns {TaskPolicy} */
export function validateTaskPolicy(value, context) { return validated(value, 'policy', operation(context), policy); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {TaskLimits} */
export function validateTaskLimits(value, context) { return validated(value, 'limits', operation(context), limits); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {VerificationPolicy} */
export function validateVerificationPolicy(value, context) { return validated(value, 'verification', operation(context), verification); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {EvidenceLimits} */
export function validateEvidenceLimits(value, context) { return validated(value, 'evidence', operation(context), evidence); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {WorkerRequirements} */
export function validateWorkerRequirements(value, context) { return validated(value, 'workerRequirements', operation(context), requirements); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {WorkerResources} */
export function validateWorkerResources(value, context) { return validated(value, 'workerResources', operation(context), resources); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {SupervisorResources} */
export function validateSupervisorResources(value, context) { return validated(value, 'supervisorResources', operation(context), supervisorResources); }
/** Config-only shallow merge; supplied arrays replace defaults. Missing values
 * are allowed ONLY through these explicitly named normalizers, never snapshots.
 * @param {unknown} value @param {JSONRecord} defaults @param {string} path @param {ValidationContext} context @returns {JSONRecord}
 */
function withDefaults(value, defaults, path, context) {
  const input = capture(value, path, context, false);
  const v = record(input, [], path, Object.keys(defaults));
  /** @type {Record<string, JSONValue>} */
  const merged = Object.create(null);
  for (const key of Object.keys(defaults)) own(merged, key, Object.hasOwn(v, key) ? v[key] : defaults[key]);
  return derived(Object.freeze(merged), v, path, context);
}
/** @param {unknown} [value] @param {ValidationContext} [context] @returns {TaskPolicy} */
export function normalizeTaskPolicy(value = {}, context) {
  const c = operation(context), v = withDefaults(value, DEFAULT_TASK_POLICY, 'policy', c);
  const mode = v.mode === 'final' ? 'final-only' : v.mode === 'strict' ? 'every-step' : v.mode;
  return validated(derived(Object.freeze({ ...v, mode }), v, 'policy', c), 'policy', c, policy);
}
/** @param {unknown} [value] @param {ValidationContext} [context] @returns {TaskLimits} */
export function normalizeTaskLimits(value = {}, context) { const c = operation(context); return validated(withDefaults(value, DEFAULT_TASK_LIMITS, 'limits', c), 'limits', c, limits); }
/** @param {unknown} [value] @param {ValidationContext} [context] @returns {VerificationPolicy} */
export function normalizeVerificationPolicy(value = {}, context) { const c = operation(context); return validated(withDefaults(value, DEFAULT_VERIFICATION, 'verification', c), 'verification', c, verification); }
/** @param {unknown} [value] @param {ValidationContext} [context] @returns {EvidenceLimits} */
export function normalizeEvidenceLimits(value = {}, context) { const c = operation(context); return validated(withDefaults(value, DEFAULT_EVIDENCE, 'evidence', c), 'evidence', c, evidence); }
/** @param {unknown} [value] @param {ValidationContext} [context] @returns {WorkerRequirements} */
export function normalizeWorkerRequirements(value = {}, context) { const c = operation(context); return validated(withDefaults(value, DEFAULT_WORKER_REQUIREMENTS, 'workerRequirements', c), 'workerRequirements', c, requirements); }
/** @param {unknown} [value] @param {ValidationContext} [context] @returns {WorkerResources} */
export function normalizeWorkerResources(value = {}, context) { const c = operation(context); return validated(withDefaults(value, DEFAULT_WORKER_RESOURCES, 'workerResources', c), 'workerResources', c, resources); }
/** @param {unknown} [value] @param {ValidationContext} [context] @returns {SupervisorResources} */
export function normalizeSupervisorResources(value = {}, context) { const c = operation(context); return validated(withDefaults(value, DEFAULT_SUPERVISOR_RESOURCES, 'supervisorResources', c), 'supervisorResources', c, supervisorResources); }

/** @param {JSONValue} value @param {string} path @returns {ActorDefinitionV3} */
function definition(value, path) {
  const v = record(value, ['id', 'role', 'provider', 'model', 'effort', 'cwd', 'extensionProfile', 'readOnly'], path);
  const role = choice(v.role, ['supervisor', 'implementer'], `${path}.role`), readOnly = bool(v.readOnly, `${path}.readOnly`);
  const extensionProfile = choice(v.extensionProfile, ['supervisor-restricted', 'worker-native'], `${path}.extensionProfile`);
  check(role === 'supervisor' ? extensionProfile === 'supervisor-restricted' && readOnly : extensionProfile === 'worker-native', path, 'Role/profile mismatch');
  return Object.freeze({ id: id(v.id, `${path}.id`), role, provider: text(v.provider, `${path}.provider`, 999, false), model: text(v.model, `${path}.model`, 999, false), effort: choice(v.effort, ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'], `${path}.effort`), cwd: nullablePath(v.cwd, `${path}.cwd`), extensionProfile, readOnly });
}
/** Preview only: empty provider/model is not readiness. @param {unknown} value @param {ValidationContext} [context] @returns {ActorDefinitionV3} */
export function validateActorDefinitionV3(value, context) { return validated(value, 'actorDefinition', operation(context), definition); }
/** @param {JSONValue} value @param {string} path @returns {OwnerBinding} */
function owner(value, path) {
  const v = record(value, ['ownerSession', 'ownerEpoch', 'branchRevision'], path);
  return Object.freeze({ ownerSession: text(v.ownerSession, `${path}.ownerSession`), ownerEpoch: integer(v.ownerEpoch, `${path}.ownerEpoch`, 1), branchRevision: id(v.branchRevision, `${path}.branchRevision`) });
}
/** @param {JSONValue} value @param {string} path @returns {ActorBinding} */
function actor(value, path) {
  const v = record(value, ['actorId', 'role', 'ownerSession', 'ownerEpoch', 'generation', 'sessionId', 'model'], path);
  return Object.freeze({ actorId: id(v.actorId, `${path}.actorId`), role: choice(v.role, ['main', 'supervisor', 'implementer'], `${path}.role`), ownerSession: text(v.ownerSession, `${path}.ownerSession`), ownerEpoch: integer(v.ownerEpoch, `${path}.ownerEpoch`, 1), generation: integer(v.generation, `${path}.generation`, 1), sessionId: text(v.sessionId, `${path}.sessionId`), model: v.model === null ? null : text(v.model, `${path}.model`) });
}
/** @param {JSONValue} value @param {string} path @returns {Fence} */
function fence(value, path) {
  const v = record(value, ['workspace', 'repoRoot', 'ownerSession', 'ownerEpoch', 'workerId', 'workerGeneration', 'sessionId', 'nonce'], path);
  return Object.freeze({ workspace: text(v.workspace, `${path}.workspace`), repoRoot: text(v.repoRoot, `${path}.repoRoot`), ownerSession: text(v.ownerSession, `${path}.ownerSession`), ownerEpoch: integer(v.ownerEpoch, `${path}.ownerEpoch`, 1), workerId: id(v.workerId, `${path}.workerId`), workerGeneration: integer(v.workerGeneration, `${path}.workerGeneration`, 1), sessionId: text(v.sessionId, `${path}.sessionId`), nonce: text(v.nonce, `${path}.nonce`) });
}
/** @param {JSONValue} value @param {string} path @returns {Identity} */
function identity(value, path) {
  const v = record(value, ['fence', 'taskId', 'planRevision', 'attemptId', 'attemptNumber', 'leaseId'], path);
  return Object.freeze({ fence: fence(v.fence, `${path}.fence`), taskId: id(v.taskId, `${path}.taskId`), planRevision: integer(v.planRevision, `${path}.planRevision`, 1), attemptId: id(v.attemptId, `${path}.attemptId`), attemptNumber: integer(v.attemptNumber, `${path}.attemptNumber`, 1), leaseId: token(v.leaseId, `${path}.leaseId`) });
}
/** @param {JSONValue} value @param {string} path @returns {ArtifactRef} */
function artifact(value, path) { const v = record(value, ['ref', 'hash'], path); return Object.freeze({ ref: text(v.ref, `${path}.ref`), hash: hash(v.hash, `${path}.hash`) }); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {OwnerBinding} */
export function validateOwnerBinding(value, context) { return validated(value, 'owner', operation(context), owner); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {ActorBinding} */
export function validateActorBinding(value, context) { return validated(value, 'actor', operation(context), actor); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {Fence} */
export function validateFence(value, context) { return validated(value, 'fence', operation(context), fence); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {Identity} */
export function validateIdentity(value, context) { return validated(value, 'identity', operation(context), identity); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {ArtifactRef} */
export function validateArtifactRef(value, context) { return validated(value, 'artifact', operation(context), artifact); }
/** Explicit admission/expiry only: equality is an expired/zero lifetime window.
 * No clock read and no option can enlarge the D3 ceiling.
 * @param {unknown} value @param {ValidationContext} [context] @returns {DeadlineWindow}
 */
export function validateDeadlineWindow(value, context) {
  const c = operation(context), v = record(capture(value, 'deadline', c, false), ['admissionAt', 'expiresAt'], 'deadline');
  const admissionAt = integer(v.admissionAt, 'deadline.admissionAt'), expiresAt = integer(v.expiresAt, 'deadline.expiresAt');
  check(expiresAt > admissionAt && expiresAt - admissionAt <= COMMON_BOUNDS.maxRequestLifetimeMs, 'deadline', 'Invalid request lifetime');
  return derived(Object.freeze({ admissionAt, expiresAt }), v, 'deadline', c);
}
/** @param {JSONValue} value @param {string} path @returns {WorkspaceBinding} */
function workspace(value, path) {
  const v = record(value, ['cwd', 'repoRoot', 'allowedPaths'], path);
  // A stored assignment pins its effective directory. Only configuration
  // actor definitions permit null as an unresolved preview/inheritance value.
  return Object.freeze({ cwd: text(v.cwd, `${path}.cwd`), repoRoot: text(v.repoRoot, `${path}.repoRoot`), allowedPaths: strings(v.allowedPaths, `${path}.allowedPaths`) });
}
/** @param {number} assignedAt @param {TaskLimits} taskLimits @param {unknown} deadline @param {string} path */
function lifetime(assignedAt, taskLimits, deadline, path) {
  check(assignedAt <= Number.MAX_SAFE_INTEGER - taskLimits.taskTimeoutMs, path, 'Lifetime deadline overflow');
  const result = integer(deadline, path);
  check(result === assignedAt + taskLimits.taskTimeoutMs, path, 'Deadline does not match immutable assignment', 'inconsistent-reference'); return result;
}
/** Exact budget preimage: no configHash, spending, or budgetHash field.
 * This is a workflow snapshot digest, NOT the kernel's legacy budget digest.
 * @param {Pick<BudgetSnapshot, 'budgetRevision'|'policy'|'limits'|'assignedAt'|'deadline'>} value @param {ValidationContext} context
 */
function budgetPreimage(value, context) { return derived(Object.freeze({ budgetRevision: value.budgetRevision, policy: value.policy, limits: value.limits, assignedAt: value.assignedAt, deadline: value.deadline }), value, 'budget', context); }
/** @param {JSONValue} value @param {string} path @returns {Omit<BudgetSnapshot, 'budgetHash'>} */
function budgetFields(value, path) {
  const v = record(value, ['budgetRevision', 'policy', 'limits', 'assignedAt', 'deadline'], path), parsedLimits = limits(v.limits, `${path}.limits`);
  const assignedAt = integer(v.assignedAt, `${path}.assignedAt`);
  return Object.freeze({ budgetRevision: id(v.budgetRevision, `${path}.budgetRevision`), policy: policy(v.policy, `${path}.policy`), limits: parsedLimits, assignedAt, deadline: lifetime(assignedAt, parsedLimits, v.deadline, `${path}.deadline`) });
}
/** Accepts exactly the five preimage fields, never an arbitrary object.
 * @param {unknown} value @param {ValidationContext} [context] @returns {Hash}
 */
export function budgetSnapshotDigest(value, context) { const c = operation(context); return pairDigest('state', budgetPreimage(validated(value, 'budget', c, budgetFields), c), c); }
/** @param {unknown} value @param {ValidationContext} [context] @returns {BudgetSnapshot} */
export function validateBudgetSnapshot(value, context) {
  const c = operation(context), v = record(capture(value, 'budget', c, false), ['budgetRevision', 'policy', 'limits', 'assignedAt', 'deadline', 'budgetHash'], 'budget');
  const { budgetHash: claimed, ...fields } = v, parsed = derived(budgetFields(fields, 'budget'), v, 'budget', c);
  const budgetHash = hash(claimed, 'budget.budgetHash');
  check(budgetHash === pairDigest('state', budgetPreimage(parsed, c), c), 'budget.budgetHash', 'Budget hash mismatch', 'inconsistent-reference');
  return derived(Object.freeze({ ...parsed, budgetHash }), v, 'budget', c);
}
/** Stored snapshot parser: never fills historical fields from defaults. Config
 * correspondence and legacy/actor-pair mode agreement need the aggregate/config.
 * @param {unknown} value @param {ValidationContext} [context] @returns {AssignmentSnapshotV2}
 */
export function validateAssignmentSnapshotV2(value, context) {
  const c = operation(context), v = record(capture(value, 'assignment', c, false), ['configRevision', 'configHash', 'policy', 'limits', 'verification', 'evidence', 'workerRequirements', 'participants', 'workerResources', 'supervisorResources', 'workspace', 'assignedAt', 'deadline', 'budgetRevision', 'budgetHash'], 'assignment');
  const p = record(v.participants, ['supervisor', 'implementer'], 'assignment.participants');
  const implementer = definition(p.implementer, 'assignment.participants.implementer'), supervisor = p.supervisor === null ? null : definition(p.supervisor, 'assignment.participants.supervisor');
  check(implementer.role === 'implementer' && implementer.provider.trim().length > 0 && implementer.model.trim().length > 0, 'assignment.participants.implementer', 'Selected implementer required');
  if (supervisor !== null) check(supervisor.role === 'supervisor' && supervisor.id !== implementer.id && supervisor.provider.trim().length > 0 && supervisor.model.trim().length > 0, 'assignment.participants.supervisor', 'Distinct selected supervisor required');
  const taskLimits = limits(v.limits, 'assignment.limits'), assignedAt = integer(v.assignedAt, 'assignment.assignedAt');
  const result = Object.freeze({
    configRevision: id(v.configRevision, 'assignment.configRevision'), configHash: hash(v.configHash, 'assignment.configHash'),
    policy: policy(v.policy, 'assignment.policy'), limits: taskLimits, verification: verification(v.verification, 'assignment.verification'),
    evidence: evidence(v.evidence, 'assignment.evidence'), workerRequirements: requirements(v.workerRequirements, 'assignment.workerRequirements'),
    participants: Object.freeze({ supervisor, implementer }), workerResources: resources(v.workerResources, 'assignment.workerResources'), supervisorResources: supervisorResources(v.supervisorResources, 'assignment.supervisorResources'),
    workspace: workspace(v.workspace, 'assignment.workspace'), assignedAt, deadline: lifetime(assignedAt, taskLimits, v.deadline, 'assignment.deadline'), budgetRevision: id(v.budgetRevision, 'assignment.budgetRevision'), budgetHash: hash(v.budgetHash, 'assignment.budgetHash'),
  });
  derived(result, v, 'assignment', c);
  check(result.budgetHash === pairDigest('state', budgetPreimage(result, c), c), 'assignment.budgetHash', 'Budget hash mismatch', 'inconsistent-reference'); return result;
}
/** Derived only; no independent writable snapshot or legacy hash conversion.
 * @param {unknown} value @param {ValidationContext} [context] @returns {KernelAssignmentProjection}
 */
export function projectKernelAssignment(value, context) {
  const c = operation(context), v = validateAssignmentSnapshotV2(value, c);
  return derived(Object.freeze({ configRevision: v.configRevision, configHash: v.configHash, policy: v.policy, limits: v.limits, verification: v.verification }), v, 'assignment', c);
}

/** Shared intrinsic consistency, never recipient authorization.
 * @param {OwnerBinding} o @param {ActorBinding} a @param {ParticipantProfile} profile @param {string} nonce @param {Identity|null} i @param {boolean} active @param {string} path
 */
function participantBinding(o, a, profile, nonce, i, active, path) {
  check(a.role !== 'main' && a.ownerSession === o.ownerSession && a.ownerEpoch === o.ownerEpoch, path, 'Owner/participant mismatch', 'inconsistent-reference');
  if (a.role === 'supervisor') {
    check(profile === 'supervisor-restricted' && i === null, path, 'Supervisor must not carry an implementation identity');
  } else {
    check(profile === 'worker-native' && (!active || i !== null), path, 'Active implementer requires its identity');
    if (i !== null) {
      const f = i.fence;
      check(f.workerId === a.actorId && f.ownerSession === a.ownerSession && f.ownerEpoch === a.ownerEpoch && f.workerGeneration === a.generation && f.sessionId === a.sessionId && f.nonce === nonce, path, 'Implementation fence mismatch', 'inconsistent-reference');
    }
  }
}
const PROOF_KEYS = Object.freeze(['storeId', 'rootRevision', 'rootHash', 'grantOperationId', 'authorityHash', 'owner', 'actor', 'profile', 'nonce', 'workflowId', 'workflowRevision', 'activationId', 'identity']);
/** @param {JSONValue} value @param {string} path @returns {GrantCommitProofV2} */
function proof(value, path) {
  const v = record(value, PROOF_KEYS, path);
  const result = Object.freeze({ storeId: id(v.storeId, `${path}.storeId`), rootRevision: integer(v.rootRevision, `${path}.rootRevision`, 1), rootHash: hash(v.rootHash, `${path}.rootHash`), grantOperationId: id(v.grantOperationId, `${path}.grantOperationId`), authorityHash: hash(v.authorityHash, `${path}.authorityHash`), owner: owner(v.owner, `${path}.owner`), actor: actor(v.actor, `${path}.actor`), profile: choice(v.profile, ['supervisor-restricted', 'worker-native'], `${path}.profile`), nonce: text(v.nonce, `${path}.nonce`), workflowId: id(v.workflowId, `${path}.workflowId`), workflowRevision: id(v.workflowRevision, `${path}.workflowRevision`), activationId: id(v.activationId, `${path}.activationId`), identity: v.identity === null ? null : identity(v.identity, `${path}.identity`) });
  participantBinding(result.owner, result.actor, result.profile, result.nonce, result.identity, true, path); return result;
}
/** @param {unknown} value @param {ValidationContext} [context] @returns {GrantCommitProofV2} */
export function validateGrantCommitProofV2(value, context) { return validated(value, 'grantProof', operation(context), proof); }
/** Equality only on privately validated, bounded immutable data.
 * @param {JSONValue} left @param {JSONValue} right
 */
function same(left, right) { return canonical(left) === canonical(right); }
const CONTROL_KEYS = Object.freeze(['wireVersion', 'owner', 'actor', 'nonce', 'operationId', 'profile', 'workflowId', 'workflowRevision', 'activationId', 'identity', 'inputHash', 'grantProof']);
/** @param {JSONValue} value @param {string} path @returns {ActorControlBinding} */
function control(value, path) {
  const v = record(value, CONTROL_KEYS, path);
  if (v.wireVersion !== 2) throw new ContractValidationError('unsupported-version', `${path}.wireVersion`, 'Expected wire version 2', 'unsupported');
  const result = Object.freeze({ wireVersion: /** @type {const} */ (2), owner: owner(v.owner, `${path}.owner`), actor: actor(v.actor, `${path}.actor`), nonce: text(v.nonce, `${path}.nonce`), operationId: id(v.operationId, `${path}.operationId`), profile: choice(v.profile, ['supervisor-restricted', 'worker-native'], `${path}.profile`), workflowId: nullableId(v.workflowId, `${path}.workflowId`), workflowRevision: nullableId(v.workflowRevision, `${path}.workflowRevision`), activationId: nullableId(v.activationId, `${path}.activationId`), identity: v.identity === null ? null : identity(v.identity, `${path}.identity`), inputHash: hash(v.inputHash, `${path}.inputHash`), grantProof: v.grantProof === null ? null : proof(v.grantProof, `${path}.grantProof`) });
  check((result.workflowId === null) === (result.workflowRevision === null) && (result.activationId === null || result.workflowId !== null), path, 'Partial workflow/activation binding');
  participantBinding(result.owner, result.actor, result.profile, result.nonce, result.identity, result.activationId !== null, path);
  const g = result.grantProof;
  if (g !== null) {
    check(same(g.owner, result.owner) && same(g.actor, result.actor) && g.profile === result.profile && g.nonce === result.nonce && g.workflowId === result.workflowId && g.workflowRevision === result.workflowRevision && g.activationId === result.activationId && same(g.identity, result.identity), `${path}.grantProof`, 'Enclosing proof binding mismatch', 'inconsistent-reference');
    // grantOperationId identifies the grant; operationId may name a later report,
    // inspection or disposition. T04's per-kind union checks that relationship.
  }
  return result;
}
/** Intrinsic only; null handshake cases are selected by the future T04 kind union.
 * @param {unknown} value @param {ValidationContext} [context] @returns {ActorControlBinding}
 */
export function validateActorControlBinding(value, context) { return validated(value, 'control', operation(context), control); }
/** Both arguments are untrusted, including expected; no capability/boolean bypass.
 * Exact comparison includes inputHash and grantProof, but grants no authority.
 * @param {unknown} value @param {unknown} expected @param {ValidationContext} [context] @returns {ActorControlBinding}
 */
export function assertActorControlBinding(value, expected, context) {
  const c = operation(context), actual = validateActorControlBinding(value, c), wanted = validateActorControlBinding(expected, c);
  check(same(actual, wanted), 'control', 'Expected peer/control binding mismatch', 'inconsistent-reference'); return actual;
}
/** Excludes ONLY inputHash. This is not a full control-input preimage: T04 adds
 * its closed kind/payload and immutable deadline, excluding mutable delivery state.
 * @param {unknown} value @param {ValidationContext} [context] @returns {ControlIdentityProjection}
 */
export function projectControlIdentity(value, context) {
  const c = operation(context), v = validateActorControlBinding(value, c), { inputHash, ...identity } = v;
  return derived(Object.freeze(identity), v, 'control', c);
}
/** Proof-value digest, NOT the hash of the future full published authority file.
 * authorityHash is a reference to that separate earlier immutable content.
 * @param {unknown} value @param {ValidationContext} [context] @returns {Hash}
 */
export function grantProofDigest(value, context) { const c = operation(context); return pairDigest('authority', validateGrantCommitProofV2(value, c), c); }
/** @param {JSONValue} value @param {string} path @returns {ReviewerWitness} */
function reviewer(value, path) {
  const v = record(value, ['actor', 'profile', 'workflowId', 'workflowRevision', 'activationId', 'intentId', 'intentHash', 'operationId', 'settlement', 'reportId', 'reportHash', 'checkpointHash', 'request', 'reply', 'receipt'], path);
  const a = actor(v.actor, `${path}.actor`), s = record(v.settlement, ['observationId', 'at'], `${path}.settlement`);
  check(a.role === 'supervisor' && v.profile === 'supervisor-restricted', path, 'Reviewer must be a restricted supervisor');
  return Object.freeze({ actor: a, profile: 'supervisor-restricted', workflowId: id(v.workflowId, `${path}.workflowId`), workflowRevision: id(v.workflowRevision, `${path}.workflowRevision`), activationId: id(v.activationId, `${path}.activationId`), intentId: id(v.intentId, `${path}.intentId`), intentHash: hash(v.intentHash, `${path}.intentHash`), operationId: id(v.operationId, `${path}.operationId`), settlement: Object.freeze({ observationId: id(s.observationId, `${path}.settlement.observationId`), at: integer(s.at, `${path}.settlement.at`) }), reportId: id(v.reportId, `${path}.reportId`), reportHash: hash(v.reportHash, `${path}.reportHash`), checkpointHash: hash(v.checkpointHash, `${path}.checkpointHash`), request: artifact(v.request, `${path}.request`), reply: artifact(v.reply, `${path}.reply`), receipt: artifact(v.receipt, `${path}.receipt`) });
}
/** @param {unknown} value @param {ValidationContext} [context] @returns {ReviewerWitness} */
export function validateReviewerWitness(value, context) { return validated(value, 'reviewer', operation(context), reviewer); }
/** Full closed immutable witness, inspection domain; not provenance.
 * @param {unknown} value @param {ValidationContext} [context] @returns {Hash}
 */
export function reviewerWitnessDigest(value, context) { const c = operation(context); return pairDigest('inspection', validateReviewerWitness(value, c), c); }
/** Minimal archive reference only: T05/Host must check full root/hash/chain context.
 * Segment archives may fill the 16 MiB root ceiling, unlike 4 MiB payload blobs.
 * Resolving archive context must still charge the operation reference aggregate.
 * @param {unknown} value @param {ValidationContext} [context] @returns {ArchiveReferenceV2}
 */
export function validateArchiveReferenceV2(value, context) {
  const c = operation(context), v = record(capture(value, 'archiveReference', c, false), ['storeId', 'segmentId', 'originalHash', 'byteLength', 'priorRoot'], 'archiveReference');
  return derived(Object.freeze({ storeId: id(v.storeId, 'archiveReference.storeId'), segmentId: id(v.segmentId, 'archiveReference.segmentId'), originalHash: hash(v.originalHash, 'archiveReference.originalHash'), byteLength: integer(v.byteLength, 'archiveReference.byteLength', 0, COMMON_BOUNDS.maxBytes), priorRoot: nullableId(v.priorRoot, 'archiveReference.priorRoot') }), v, 'archiveReference', c);
}
/** All five closed reference fields; NOT the hash of an archive file.
 * @param {unknown} value @param {ValidationContext} [context] @returns {Hash}
 */
export function archiveReferenceDigest(value, context) { const c = operation(context); return pairDigest('archive', validateArchiveReferenceV2(value, c), c); }

// BEGIN CLOSED CONFIG V3 ADDITION — existing 68 helpers remain unchanged.
/** @typedef {'minimal'|'off'} IndicatorV3 */
/** @typedef {'legacy'|'actor-pair'} ActorConfigMode */
/** @typedef {Readonly<{command:string, startupTimeoutMs:number, requestTimeoutMs:number, shutdownTimeoutMs:number}>} RuntimeConfigV3 */
/** @typedef {Readonly<{maxWritersPerWorkspace:1, replayUncertainActivations:false, explicitResumeAfterInterruption:true, mainReadOnlyDuringTasks:boolean}>} SafetyPolicyV3 */
/** @typedef {Readonly<{maxQueuedPerActor:number, maxEnvelopeBytes:number}>} MailboxLimitsV3 */
/** @typedef {Readonly<{supervisorId:Id, implementerId:Id, maxConcurrentWorkflows:1, humanPermissionsViaMain:true}>} WorkflowConfigV3 */
/** @typedef {Readonly<{id:Id, provider:string, model:string, effort:Effort, cwd:string|null, readOnly:boolean}>} LegacyWorkerV3 */
/** @typedef {Readonly<{maxResidentActors:2, maxActiveModelCalls:2, maxActiveActivationsPerActor:1}>} ActorCapacityV3 */
/** @typedef {Readonly<{idleTimeoutMs:600000, retainDuringUnresolvedWorkflow:true}>} ActorIdlePolicyV3 */
/** @typedef {Readonly<{version:3, enabled:boolean, autoStart:boolean, indicator:IndicatorV3, supervision:TaskPolicy, safety:SafetyPolicyV3, limits:TaskLimits, verification:VerificationPolicy, evidence:EvidenceLimits, workerRequirements:WorkerRequirements, workerResources:WorkerResources, supervisorResources:SupervisorResources, runtime:RuntimeConfigV3}>} ConfigCommonV3 */
/** @typedef {ConfigCommonV3 & Readonly<{mode:'legacy', maxWorkers:number, workers:readonly LegacyWorkerV3[]}>} LegacyActorConfigV3 */
/** @typedef {ConfigCommonV3 & Readonly<{mode:'actor-pair', actors:readonly ActorDefinitionV3[], workflow:WorkflowConfigV3, mailbox:MailboxLimitsV3, capacity:ActorCapacityV3, idlePolicy:ActorIdlePolicyV3}>} ActorPairActorConfigV3 */
/** @typedef {LegacyActorConfigV3|ActorPairActorConfigV3} ActorConfigV3 */

const CONFIG_BASE_FIELDS = Object.freeze(['enabled', 'autoStart', 'indicator', 'supervision', 'safety', 'limits', 'verification', 'evidence', 'requirements', 'workerRequirements', 'workerResources', 'supervisorResources', 'runtime']);
/** @type {RuntimeConfigV3} */
const CONFIG_RUNTIME_DEFAULTS = Object.freeze({ command: 'pi', startupTimeoutMs: 120000, requestTimeoutMs: 30000, shutdownTimeoutMs: 5000 });
/** @type {SafetyPolicyV3} */
const CONFIG_SAFETY_DEFAULTS = Object.freeze({ maxWritersPerWorkspace: 1, replayUncertainActivations: false, explicitResumeAfterInterruption: true, mainReadOnlyDuringTasks: true });
/** @type {MailboxLimitsV3} */
const CONFIG_MAILBOX_DEFAULTS = Object.freeze({ maxQueuedPerActor: 8, maxEnvelopeBytes: 65536 });
/** @type {ActorCapacityV3} */
const CONFIG_CAPACITY_DEFAULTS = Object.freeze({ maxResidentActors: 2, maxActiveModelCalls: 2, maxActiveActivationsPerActor: 1 });
/** @type {ActorIdlePolicyV3} */
const CONFIG_IDLE_DEFAULTS = Object.freeze({ idleTimeoutMs: 600000, retainDuringUnresolvedWorkflow: true });

/** Private default merge for an ALREADY CAPTURED config occurrence. It neither
 * captures nor associates intermediate results: only configV3's final retained
 * root is reconciled. Supplied arrays replace defaults, never concatenate.
 * @param {JSONValue|undefined} value @param {JSONRecord} defaults @param {string} path @returns {JSONRecord}
 */
function configDefaults(value, defaults, path) {
  if (value === undefined) return defaults;
  const supplied = record(value, [], path, Object.keys(defaults));
  /** @type {Record<string, JSONValue>} */ const result = Object.create(null);
  for (const key of Object.keys(defaults)) own(result, key, Object.hasOwn(supplied, key) ? supplied[key] : defaults[key]);
  return Object.freeze(result);
}
/** @param {JSONRecord} value @param {string} key @param {JSONValue} fallback @returns {JSONValue} */
function configField(value, key, fallback) { return Object.hasOwn(value, key) ? value[key] : fallback; }
/** @param {JSONRecord} value @param {string} key @param {string} path @returns {JSONValue} */
function configRequired(value, key, path) {
  check(Object.hasOwn(value, key), childPath(path, key), 'Missing required configuration field', 'missing-required-field');
  return value[key];
}
/** @param {unknown} condition @param {string} path @param {string} message @returns {asserts condition} */
function configSupported(condition, path, message) {
  if (!condition) throw new ContractValidationError('unsupported-safety', path, message, 'unsupported');
}
/** Length-based legacy command semantics; whitespace is not silently trimmed.
 * @param {JSONValue|undefined} value @param {string} path @returns {RuntimeConfigV3}
 */
function configRuntime(value, path) {
  const v = configDefaults(value, CONFIG_RUNTIME_DEFAULTS, path);
  const command = text(v.command, `${path}.command`, COMMON_BOUNDS.maxTextBytes, false);
  check(command.length > 0 && !command.includes('\0'), `${path}.command`, 'Expected nonempty command without NUL');
  return Object.freeze({ command,
    startupTimeoutMs: integer(v.startupTimeoutMs, `${path}.startupTimeoutMs`, 1),
    requestTimeoutMs: integer(v.requestTimeoutMs, `${path}.requestTimeoutMs`, 1),
    shutdownTimeoutMs: integer(v.shutdownTimeoutMs, `${path}.shutdownTimeoutMs`, 1) });
}
/** @param {JSONValue|undefined} value @param {string} path @returns {SafetyPolicyV3} */
function configSafety(value, path) {
  const v = configDefaults(value, CONFIG_SAFETY_DEFAULTS, path);
  const writers = integer(v.maxWritersPerWorkspace, `${path}.maxWritersPerWorkspace`, 1);
  const replay = bool(v.replayUncertainActivations, `${path}.replayUncertainActivations`);
  const resume = bool(v.explicitResumeAfterInterruption, `${path}.explicitResumeAfterInterruption`);
  configSupported(writers === 1, `${path}.maxWritersPerWorkspace`, 'Only one implementation writer is supported');
  configSupported(replay === false, `${path}.replayUncertainActivations`, 'Uncertain activations cannot be replayed');
  configSupported(resume === true, `${path}.explicitResumeAfterInterruption`, 'Explicit resume is required');
  return Object.freeze({ maxWritersPerWorkspace: writers, replayUncertainActivations: replay,
    explicitResumeAfterInterruption: resume, mainReadOnlyDuringTasks: bool(v.mainReadOnlyDuringTasks, `${path}.mainReadOnlyDuringTasks`) });
}
/** @param {JSONValue|undefined} value @param {string} path @returns {ActorCapacityV3} */
function configCapacity(value, path) {
  const v = configDefaults(value, CONFIG_CAPACITY_DEFAULTS, path);
  for (const key of Object.keys(CONFIG_CAPACITY_DEFAULTS)) {
    integer(v[key], childPath(path, key));
    configSupported(v[key] === CONFIG_CAPACITY_DEFAULTS[/** @type {keyof ActorCapacityV3} */ (key)], childPath(path, key), 'Unsupported actor-pair capacity profile');
  }
  return CONFIG_CAPACITY_DEFAULTS;
}
/** @param {JSONValue|undefined} value @param {string} path @returns {ActorIdlePolicyV3} */
function configIdlePolicy(value, path) {
  const v = configDefaults(value, CONFIG_IDLE_DEFAULTS, path);
  integer(v.idleTimeoutMs, `${path}.idleTimeoutMs`);
  bool(v.retainDuringUnresolvedWorkflow, `${path}.retainDuringUnresolvedWorkflow`);
  configSupported(v.idleTimeoutMs === 600000, `${path}.idleTimeoutMs`, 'Only the selected future idle policy is supported');
  configSupported(v.retainDuringUnresolvedWorkflow === true, `${path}.retainDuringUnresolvedWorkflow`, 'Unresolved workflow retention is required');
  return CONFIG_IDLE_DEFAULTS;
}
/** @param {JSONRecord} top @param {string} path @returns {readonly LegacyWorkerV3[]} */
function configLegacyWorkers(top, path) {
  const entries = list(configRequired(top, 'workers', path), `${path}.workers`, 8);
  check(entries.length > 0, `${path}.workers`, 'Expected at least one registered legacy worker');
  /** @type {Set<string>} */ const ids = new Set();
  return Object.freeze(entries.map((entry, index) => {
    const at = `${path}.workers.${index}`, v = record(entry, ['id', 'provider', 'model', 'effort', 'cwd', 'readOnly'], at);
    const workerId = id(v.id, `${at}.id`);
    check(!ids.has(workerId), `${at}.id`, 'Duplicate worker ID', 'duplicate-id'); ids.add(workerId);
    return Object.freeze({ id: workerId, provider: text(v.provider, `${at}.provider`, 999, false),
      model: text(v.model, `${at}.model`, 999, false), effort: choice(v.effort, ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'], `${at}.effort`),
      cwd: nullablePath(v.cwd, `${at}.cwd`), readOnly: bool(v.readOnly, `${at}.readOnly`) });
  }));
}
/** @param {JSONValue} value @param {string} path @returns {readonly ActorDefinitionV3[]} */
function configActors(value, path) {
  const entries = list(value, path, COMMON_BOUNDS.maxActorDefinitions);
  check(entries.length > 0, path, 'Expected registered actor definitions');
  /** @type {Set<string>} */ const ids = new Set();
  return Object.freeze(entries.map((entry, index) => {
    const at = childPath(path, index), result = definition(entry, at);
    check(!ids.has(result.id), `${at}.id`, 'Duplicate actor ID', 'duplicate-id'); ids.add(result.id);
    return result;
  }));
}
/** @param {JSONValue} value @param {readonly ActorDefinitionV3[]} actors @param {string} path @returns {WorkflowConfigV3} */
function configWorkflow(value, actors, path) {
  const v = record(value, ['supervisorId', 'implementerId'], path, ['maxConcurrentWorkflows', 'humanPermissionsViaMain']);
  const supervisorId = id(v.supervisorId, `${path}.supervisorId`), implementerId = id(v.implementerId, `${path}.implementerId`);
  check(supervisorId !== implementerId, path, 'Workflow participants must be distinct', 'invalid-participant');
  const count = integer(configField(v, 'maxConcurrentWorkflows', 1), `${path}.maxConcurrentWorkflows`, 1);
  const viaMain = bool(configField(v, 'humanPermissionsViaMain', true), `${path}.humanPermissionsViaMain`);
  configSupported(count === 1, `${path}.maxConcurrentWorkflows`, 'Only one unresolved workflow is supported');
  configSupported(viaMain === true, `${path}.humanPermissionsViaMain`, 'Human permission must remain mediated by Main');
  check(actors.some(a => a.id === supervisorId && a.role === 'supervisor'), `${path}.supervisorId`, 'Expected a registered supervisor', 'invalid-participant');
  check(actors.some(a => a.id === implementerId && a.role === 'implementer'), `${path}.implementerId`, 'Expected a registered implementer', 'invalid-participant');
  return Object.freeze({ supervisorId, implementerId, maxConcurrentWorkflows: count, humanPermissionsViaMain: viaMain });
}
/** @param {JSONValue|undefined} value @param {string} path @returns {MailboxLimitsV3} */
function configMailbox(value, path) {
  const v = configDefaults(value, CONFIG_MAILBOX_DEFAULTS, path);
  return Object.freeze({ maxQueuedPerActor: integer(v.maxQueuedPerActor, `${path}.maxQueuedPerActor`, 0, COMMON_BOUNDS.maxQueuedPerActor),
    maxEnvelopeBytes: integer(v.maxEnvelopeBytes, `${path}.maxEnvelopeBytes`, 1, COMMON_BOUNDS.maxEnvelopeBytes) });
}
/** Closed Config V3 construction only. All inputs/descendants are already paid,
 * detached V2 data. No exported normalizers, withDefaults, capture or derived is
 * called here: the outer validated call reconciles the complete retained result
 * once, including new fields, aliases, nested defaults and actual result depth.
 * @param {JSONValue} value @param {string} path @returns {ActorConfigV3}
 */
function configV3(value, path) {
  const header = record(value, ['version', 'mode'], path, [...CONFIG_BASE_FIELDS, 'maxWorkers', 'workers', 'actors', 'workflow', 'mailbox', 'capacity', 'idlePolicy']);
  check(typeof header.version === 'number' && Number.isSafeInteger(header.version), `${path}.version`, 'Expected integer config version');
  if (header.version !== 3) throw new ContractValidationError('unsupported-version', `${path}.version`, 'Unsupported actor config version', 'unsupported');
  const mode = choice(header.mode, ['legacy', 'actor-pair'], `${path}.mode`);
  const top = record(header, ['version', 'mode'], path, [...CONFIG_BASE_FIELDS, ...(mode === 'legacy' ? ['maxWorkers', 'workers'] : ['actors', 'workflow', 'mailbox', 'capacity', 'idlePolicy'])]);
  const policyPath = `${path}.supervision`, policyInput = configDefaults(top.supervision, DEFAULT_TASK_POLICY, policyPath);
  const policyMode = policyInput.mode === 'final' ? 'final-only' : policyInput.mode === 'strict' ? 'every-step' : policyInput.mode;
  const hasAlias = Object.hasOwn(top, 'requirements'), hasCanonical = Object.hasOwn(top, 'workerRequirements');
  const requirementsPath = hasCanonical || !hasAlias ? `${path}.workerRequirements` : `${path}.requirements`;
  const selectedRequirements = hasCanonical ? top.workerRequirements : hasAlias ? top.requirements : undefined;
  const workerRequirements = requirements(configDefaults(selectedRequirements, DEFAULT_WORKER_REQUIREMENTS, requirementsPath), requirementsPath);
  if (hasAlias && hasCanonical) {
    const aliasPath = `${path}.requirements`, alias = requirements(configDefaults(top.requirements, DEFAULT_WORKER_REQUIREMENTS, aliasPath), aliasPath);
    if (alias.fabric !== workerRequirements.fabric || alias.fovea !== workerRequirements.fovea ||
        alias.prewalkDisabled !== workerRequirements.prewalkDisabled || alias.autoCompaction !== workerRequirements.autoCompaction) {
      throw new ContractValidationError('conflicting-alias', `${path}.workerRequirements`, 'requirements conflicts with workerRequirements', 'unsupported');
    }
  }
  /** @type {ConfigCommonV3} */
  const common = Object.freeze({ version: 3, enabled: bool(configField(top, 'enabled', false), `${path}.enabled`),
    autoStart: bool(configField(top, 'autoStart', true), `${path}.autoStart`),
    indicator: choice(configField(top, 'indicator', 'minimal'), ['minimal', 'off'], `${path}.indicator`),
    supervision: policy(Object.freeze({ ...policyInput, mode: policyMode }), policyPath), safety: configSafety(top.safety, `${path}.safety`),
    limits: limits(configDefaults(top.limits, DEFAULT_TASK_LIMITS, `${path}.limits`), `${path}.limits`),
    verification: verification(configDefaults(top.verification, DEFAULT_VERIFICATION, `${path}.verification`), `${path}.verification`),
    evidence: evidence(configDefaults(top.evidence, DEFAULT_EVIDENCE, `${path}.evidence`), `${path}.evidence`), workerRequirements,
    workerResources: resources(configDefaults(top.workerResources, DEFAULT_WORKER_RESOURCES, `${path}.workerResources`), `${path}.workerResources`),
    supervisorResources: supervisorResources(configDefaults(top.supervisorResources, DEFAULT_SUPERVISOR_RESOURCES, `${path}.supervisorResources`), `${path}.supervisorResources`),
    runtime: configRuntime(top.runtime, `${path}.runtime`) });
  if (mode === 'legacy') {
    return Object.freeze({ ...common, mode, maxWorkers: integer(configRequired(top, 'maxWorkers', path), `${path}.maxWorkers`, 1, 8),
      workers: configLegacyWorkers(top, path) });
  }
  const actors = configActors(configRequired(top, 'actors', path), `${path}.actors`);
  return Object.freeze({ ...common, mode, actors, workflow: configWorkflow(configRequired(top, 'workflow', path), actors, `${path}.workflow`),
    mailbox: configMailbox(top.mailbox, `${path}.mailbox`), capacity: configCapacity(top.capacity, `${path}.capacity`),
    idlePolicy: configIdlePolicy(top.idlePolicy, `${path}.idlePolicy`) });
}
/** Config-only closed constructor with a MANDATORY existing operation context.
 * No caller-supplied parser/result/trusted marker; no implicit nested operation.
 * The normalized root is associated once for subsequent same-context hashing.
 * Public config leaves create one context; aggregate consumers pass their own.
 * @param {unknown} value @param {ValidationContext} context @returns {ActorConfigV3}
 */
export function validateActorConfigV3InContext(value, context) {
  check(context !== undefined, 'context', 'Config requires the enclosing operation context');
  return validated(value, 'config', operation(context), configV3);
}
// END CLOSED CONFIG V3 ADDITION

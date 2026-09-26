// Staged pure model (AR-03/H1). Not imported by the live Main/Worker path; see docs/ACTOR-RPC-IMPLEMENTATION-PLAN.md.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify, types } from 'node:util';
import { assert, uid } from './util.js';
import { createValidationContext, decodePairJSON, encodePairJSON, pairDigest, COMMON_BOUNDS } from './actor-contract-common.js';
import { validateActorStateV2 } from './actor-model.js';
import { readArchiveContext, planArchiveRotation, validateArchiveSuccessor, snapshotArchiveFiles } from './actor-archive.mjs';
import { assertHostQuiescent, consumeHostReleaseHandoff } from './actor-host-quiescence.mjs';
import { projectHeldLegacyWorkerViewInContext, validateHeldLegacyEvidenceV2 } from './actor-migration-contracts.js';
import { validateHash, validateId } from './actor-contract-common.js';
import { ENTRY_LIMIT, absolute, acquireAnchors, closeAnchors, closeLockAnchor, lockAnchor, renameAnchored, replaceRecord, verifyLockAnchor, withAnchors, diagnostic, directoryIdentity, immutableWrite, inventory, isCode, makePrivate, privateDirectory, qualifyProfile, readBounded, readBudget, reserveDirectory, statFile, syncDirectory, unchangedDirectory, withDirectory } from './actor-store-io.js';

export const STORE_VERSION = 1;
const LOCK_ENCODING = 'pair-owner-lock/1';
const HEAD_ENCODING = 'pair-store-head/1';
const METADATA_BYTES = 16 * 1024;
export const STORE_LIMITS = Object.freeze({ inventoryEntries: 256, commits: 48 });
const INVENTORY_LIMIT = STORE_LIMITS.inventoryEntries;

export class StoreError extends Error {
  /** @param {'held'|'unknown'|'conflict'|'io'} code @param {string} message */
  constructor(code, message) { super(message); this.code = code; }
}

/** @param {Buffer} bytes @returns {string} */
export function sha256Hex(bytes) {
  assert(Buffer.isBuffer(bytes), 'Invalid bytes');
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function plainObject(value) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value) && !types.isProxy(value), 'Invalid store record');
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {Record<string, unknown>} value @param {string[]} keys */
function exactKeys(value, keys) {
  assert(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, 'Invalid store record prototype');
  const fields = Reflect.ownKeys(value);
  assert(fields.length === keys.length && fields.every(key => typeof key === 'string' && keys.includes(key)), 'Invalid store record fields');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'Store records require inert own fields');
  }
}

/** @param {unknown} value @param {string} label @returns {string} */
function nonEmptyString(value, label) {
  assert(typeof value === 'string' && value.length > 0 && value.length <= 4096, `Invalid ${label}`);
  return value;
}

/** @param {unknown} value @param {string} label @returns {number} */
function positiveInteger(value, label) {
  assert(typeof value === 'number' && Number.isSafeInteger(value) && value > 0, `Invalid ${label}`);
  return value;
}

/** @param {string} storeRoot */
export function storePaths(storeRoot) {
  const root = absolute(nonEmptyString(storeRoot, 'storeRoot'));
  return {
    root,
    head: path.join(root, 'HEAD.json'),
    lock: path.join(root, '.owner-lock'),
    lockFile: path.join(root, '.owner-lock', 'lock.json'),
    commits: path.join(root, 'commits'),
    roots: path.join(root, 'roots'),
    staging: path.join(root, 'staging'),
    legacy: path.join(root, 'legacy'),
  };
}

/** @param {unknown} value @returns {{ownerSession:string, ownerEpoch:number, branchRevision:string}} */
export function validateOwnerRecord(value) {
  const o = plainObject(value);
  exactKeys(o, ['ownerSession', 'ownerEpoch', 'branchRevision']);
  return Object.freeze({
    ownerSession: validateId(o.ownerSession, 'owner.ownerSession'),
    ownerEpoch: positiveInteger(o.ownerEpoch, 'owner.ownerEpoch'),
    branchRevision: validateId(o.branchRevision, 'owner.branchRevision'),
  });
}

/** @param {unknown} value @returns {{cwd:string, repoRoot:string, gitCommonDir:string|null, ownershipKey:string}} */
export function validateWorkspaceRecord(value) {
  const w = plainObject(value);
  exactKeys(w, ['cwd', 'repoRoot', 'gitCommonDir', 'ownershipKey']);
  const cwd = absolute(nonEmptyString(w.cwd, 'workspace.cwd'));
  const repoRoot = absolute(nonEmptyString(w.repoRoot, 'workspace.repoRoot'));
  const gitCommonDir = w.gitCommonDir === null ? null : absolute(nonEmptyString(w.gitCommonDir, 'workspace.gitCommonDir'));
  const identity = { kind: gitCommonDir === null ? 'workspace' : 'git-common-dir', root: gitCommonDir ?? cwd };
  const ownershipKey = sha256Hex(Buffer.from(`pair/workspace-owner/v1\n${encodePairJSON(identity)}`, 'utf8'));
  assert(validateHash(w.ownershipKey, 'workspace.ownershipKey') === ownershipKey, 'Workspace ownership key mismatch');
  assert(gitCommonDir !== null || cwd === repoRoot, 'Non-Git repository identity mismatch');
  return Object.freeze({ cwd, repoRoot, gitCommonDir, ownershipKey });
}

/** @param {unknown} value @returns {{pid:number, instanceId:string, startedAt:number}} */
export function validateProcessRecord(value) {
  const p = plainObject(value);
  exactKeys(p, ['pid', 'instanceId', 'startedAt']);
  assert(typeof p.startedAt === 'number' && Number.isSafeInteger(p.startedAt) && p.startedAt >= 0, 'Invalid process.startedAt');
  return Object.freeze({
    pid: positiveInteger(p.pid, 'process.pid'),
    instanceId: validateId(p.instanceId, 'process.instanceId'),
    startedAt: p.startedAt,
  });
}

/** @param {unknown} value @returns {{version:number, encoding:string, scope:string, token:string, storeId:string, workspace:{cwd:string, repoRoot:string, gitCommonDir:string|null, ownershipKey:string}, owner:{ownerSession:string, ownerEpoch:number, branchRevision:string}, process:{pid:number, instanceId:string, startedAt:number}}} */
export function validateLockRecord(value) {
  const l = plainObject(value);
  exactKeys(l, ['version', 'encoding', 'scope', 'token', 'storeId', 'workspace', 'owner', 'process']);
  assert(l.version === STORE_VERSION && l.encoding === LOCK_ENCODING && (l.scope === 'store' || l.scope === 'workspace'), 'Invalid lock identity');
  return Object.freeze({
    version: STORE_VERSION,
    encoding: LOCK_ENCODING,
    scope: l.scope,
    token: validateId(l.token, 'lock.token'),
    storeId: validateId(l.storeId, 'lock.storeId'),
    workspace: validateWorkspaceRecord(l.workspace),
    owner: validateOwnerRecord(l.owner),
    process: validateProcessRecord(l.process),
  });
}

/** @param {unknown} value @returns {{ref:string, hash:string, byteLength:number}} */
function validatePreviousRecord(value) {
  const p = plainObject(value);
  exactKeys(p, ['ref', 'hash', 'byteLength']);
  return Object.freeze({
    ref: nonEmptyString(p.ref, 'previous.ref'),
    hash: validateHash(p.hash, 'previous.hash'),
    byteLength: positiveInteger(p.byteLength, 'previous.byteLength'),
  });
}

/** @param {unknown} value @returns {{version:number, encoding:string, storeId:string, commitId:string, revision:number, previous:{ref:string, hash:string, byteLength:number}|null, owner:{ownerSession:string, ownerEpoch:number, branchRevision:string}, workspace:{cwd:string, repoRoot:string, gitCommonDir:string|null, ownershipKey:string}, root:{kind:'actor'|'held-legacy', ref:string, hash:string, byteLength:number}, rootDigest:{domain:'state'|'migration', hash:string}}} */
export function validateHeadRecord(value) {
  const h = plainObject(value);
  exactKeys(h, ['version', 'encoding', 'storeId', 'commitId', 'revision', 'previous', 'owner', 'workspace', 'root', 'rootDigest']);
  assert(h.version === STORE_VERSION && h.encoding === HEAD_ENCODING, 'Invalid head identity');
  const root = plainObject(h.root);
  exactKeys(root, ['kind', 'ref', 'hash', 'byteLength']);
  const kind = root.kind;
  assert(kind === 'actor' || kind === 'held-legacy', 'Invalid root kind');
  const domain = kind === 'actor' ? 'state' : 'migration';
  const digest = plainObject(h.rootDigest);
  exactKeys(digest, ['domain', 'hash']);
  assert(digest.domain === domain, 'Invalid root digest domain');
  const result = Object.freeze({
    version: STORE_VERSION,
    encoding: HEAD_ENCODING,
    storeId: validateId(h.storeId, 'head.storeId'),
    commitId: validateId(h.commitId, 'head.commitId'),
    revision: positiveInteger(h.revision, 'head.revision'),
    previous: h.previous === null ? null : validatePreviousRecord(h.previous),
    owner: validateOwnerRecord(h.owner),
    workspace: validateWorkspaceRecord(h.workspace),
    root: validateRootRecord(h.root, kind),
    rootDigest: Object.freeze({ domain, hash: validateHash(digest.hash, 'head.rootDigest.hash') }),
  });
  headBindings(result);
  return result;
}

/** @param {unknown} value @param {'actor'|'held-legacy'} kind @returns {{kind:'actor'|'held-legacy', ref:string, hash:string, byteLength:number}} */
function validateRootRecord(value, kind) {
  const r = plainObject(value);
  exactKeys(r, ['kind', 'ref', 'hash', 'byteLength']);
  assert(r.kind === kind, 'Invalid root kind');
  return Object.freeze({
    kind,
    ref: nonEmptyString(r.ref, 'root.ref'),
    hash: validateHash(r.hash, 'root.hash'),
    byteLength: positiveInteger(r.byteLength, 'root.byteLength'),
  });
}

/** @typedef {ReturnType<typeof validateHeadRecord>} Head */
/** @typedef {ReturnType<typeof validateWorkspaceRecord>} Workspace */
/** @typedef {{storeRoot:string, storeId:string, workspace:unknown, owner:unknown, process:unknown}} StoreOptions */
/** @typedef {{ref:string, hash:string, byteLength:number, revision:number}|null} ExpectedRevision */
/** @typedef {{rootKind:'actor'|'held-legacy', rootBytes:Buffer, previous:ExpectedRevision}} PublishInput */
/** @typedef {{root:string, agentDir:string, storeId:string, owner:ReturnType<typeof validateOwnerRecord>, workspace:Workspace, process:ReturnType<typeof validateProcessRecord>, token:string, locks:{dir:string, identity:Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>, bytes:Buffer, handle:object}[], identities:Map<string,Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>, anchors:Map<string,Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>, workspaceIdentities:Map<string,Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>, selected:Buffer|null, active:boolean, admitted:boolean, busy:boolean, ambiguous:boolean, captures:Set<string>}} Ownership */
/** @type {WeakMap<object,Ownership>} */
const capabilities = new WeakMap();
const exec = promisify(execFile);
const namespaces = ['commits', 'roots', 'staging', 'legacy', 'artifacts', 'archives'];

function metadataContext() { return createValidationContext({ maxBytes: METADATA_BYTES, maxDepth: 8, maxNodes: 2048 }); }

/** @param {unknown} value */
function metadataBytes(value) {
  const bytes = Buffer.from(encodePairJSON(value, metadataContext()), 'utf8');
  assert(bytes.length <= METADATA_BYTES, 'Oversized metadata');
  return bytes;
}

/** @param {Buffer} bytes @param {boolean} [metadata] */
function decodeCanonical(bytes, metadata = false) {
  const value = decodePairJSON(bytes, metadata ? metadataContext() : createValidationContext());
  assert(Buffer.from(encodePairJSON(value, metadata ? metadataContext() : createValidationContext()), 'utf8').equals(bytes), 'Noncanonical pair-json/1 bytes');
  return value;
}

/** @param {string} cwd */
export async function resolveWorkspace(cwd) {
  assert(typeof cwd === 'string' && path.isAbsolute(cwd), 'Workspace must be absolute');
  const canonical = await fs.realpath(cwd);
  await directoryIdentity(canonical);
  const env = { PATH: process.env.PATH, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const options = { timeout: 5000, maxBuffer: METADATA_BYTES, env };
  let repoRoot = canonical;
  /** @type {string|null} */ let gitCommonDir = null;
  try {
    const root = await exec('git', ['-C', canonical, 'rev-parse', '--show-toplevel'], options);
    const common = await exec('git', ['-C', canonical, 'rev-parse', '--path-format=absolute', '--git-common-dir'], options);
    repoRoot = await fs.realpath(root.stdout.trim());
    gitCommonDir = await fs.realpath(common.stdout.trim());
    await directoryIdentity(repoRoot);
    await directoryIdentity(gitCommonDir);
  } catch (error) {
    const e = plainObject(error);
    assert(e.code === 128 && typeof e.stderr === 'string' && e.stderr.startsWith('fatal: not a git repository'), 'Unknown Git workspace identity');
    let ancestor = canonical;
    for (let count = 0; ; count++) {
      assert(count < INVENTORY_LIMIT, 'Workspace ancestry exceeds bound');
      try { await fs.lstat(path.join(ancestor, '.git')); throw new StoreError('held', 'Unresolved Git metadata'); }
      catch (missing) { if (!isCode(missing, 'ENOENT')) throw missing; }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
  }
  const identity = { kind: gitCommonDir === null ? 'workspace' : 'git-common-dir', root: gitCommonDir ?? canonical };
  const ownershipKey = sha256Hex(Buffer.from(`pair/workspace-owner/v1\n${encodePairJSON(identity)}`, 'utf8'));
  return validateWorkspaceRecord({ cwd: canonical, repoRoot, gitCommonDir, ownershipKey });
}

/** @param {unknown} capability */
function ownership(capability) {
  assert(capability !== null && typeof capability === 'object', 'Ownership capability required');
  const owned = capabilities.get(capability);
  assert(owned !== undefined && owned.active && !owned.ambiguous, 'Ownership absent, released or ambiguous');
  return owned;
}

/** @param {Ownership} owned @param {{remaining:number}} budget */
async function verifyOwnership(owned, budget) {
  assert(owned.active && !owned.ambiguous, 'Ownership revoked or ambiguous');
  await withDirectory(owned.root, async () => undefined, owned.anchors);
  await qualifyProfile(owned.agentDir);
  for (const [dir, identity] of owned.identities) {
    await unchangedDirectory(dir, identity);
    assert((await privateDirectory(dir)).dev === owned.identities.get(owned.agentDir)?.dev, 'Cross-filesystem namespace is unsupported');
  }
  for (const [dir, identity] of owned.workspaceIdentities) await unchangedDirectory(dir, identity);
  assert(encodePairJSON(await resolveWorkspace(owned.workspace.cwd)) === encodePairJSON(owned.workspace), 'Workspace identity changed');
  for (const lock of owned.locks) {
    await unchangedDirectory(lock.dir, lock.identity);
    assert(lock.identity.dev === owned.identities.get(owned.agentDir)?.dev, 'Cross-filesystem lock namespace is unsupported');
    verifyLockAnchor(lock.dir, lock.handle, owned.anchors);
    const bytes = await readBounded(path.join(lock.dir, 'lock.json'), METADATA_BYTES, budget);
    assert(bytes.equals(lock.bytes), 'Exact owner lock binding changed');
    validateLockRecord(decodeCanonical(bytes, true));
  }
}

/** @param {string} ref @param {'commits'|'roots'} namespace */
function commitLocator(ref, namespace) {
  assert(typeof ref === 'string' && ref.startsWith(`${namespace}/`) && ref.endsWith('.json'), 'Invalid commit locator');
  const id = validateId(ref.slice(namespace.length + 1, -5), 'locator.id');
  assert(ref === `${namespace}/${id}.json`, 'Noncanonical commit locator');
  return id;
}

/** @param {Head} head */
function headBindings(head) {
  assert(commitLocator(head.root.ref, 'roots') === head.commitId, 'Root/commit identity mismatch');
  assert(head.root.byteLength <= COMMON_BOUNDS.maxBytes, 'Root byte ceiling exceeded');
  assert((head.revision === 1) === (head.previous === null), 'Invalid predecessor/revision relationship');
  if (head.previous !== null) {
    commitLocator(head.previous.ref, 'commits');
    assert(head.previous.byteLength <= METADATA_BYTES, 'Predecessor exceeds metadata ceiling');
  }
}

/** @param {string} ref */
function evidenceLocator(ref) {
  const fields = ref.split('/');
  if (fields.length === 2 && fields[0] === 'artifacts') {
    validateId(fields[1], 'artifactId');
    return ref;
  }
  assert(fields.length === 3 && fields[0] === 'legacy' && (fields[2] === 'source.bin' || fields[2] === 'backup.bin'), 'Unsupported evidence locator');
  validateId(fields[1], 'captureId');
  return ref;
}

/** @param {string} root @param {unknown} value @param {{remaining:number}} budget @param {Set<string>} references */
async function resolveEvidence(root, value, budget, references) {
  const stack = [value];
  let nodes = 0, count = 0, total = 0;
  while (stack.length) {
    const entry = stack.pop();
    assert(++nodes <= COMMON_BOUNDS.maxNodes, 'Reference traversal exceeds node ceiling');
    if (entry === null || typeof entry !== 'object') continue;
    if (Array.isArray(entry)) { stack.push(...entry); continue; }
    const v = plainObject(entry);
    if (typeof v.ref === 'string' && typeof v.hash === 'string') {
      const ref = evidenceLocator(v.ref);
      assert(++count <= COMMON_BOUNDS.maxReferences, 'Reference count exceeded');
      const bytes = await readBounded(path.join(root, ref), COMMON_BOUNDS.maxReferenceBytes, budget);
      total += bytes.length;
      assert(total <= COMMON_BOUNDS.maxReferencedBytes, 'Reference aggregate exceeded');
      assert(sha256Hex(bytes) === validateHash(v.hash, 'reference.hash'), 'Reference hash mismatch');
      if ('byteLength' in v) assert(v.byteLength === bytes.length, 'Reference length mismatch');
      references.add(ref);
    }
    stack.push(...Object.values(v));
  }
}

/** @param {Record<string,unknown>} value */
function heldSourceLimit(value) {
  assert(['stored-state', 'retained-payload', 'retained-archive'].includes(String(value.operation)), 'Unsupported held source operation');
  return value.operation === 'retained-payload' ? COMMON_BOUNDS.maxReferenceBytes : COMMON_BOUNDS.maxBytes;
}

/** @param {string} root @param {Head} head @param {Buffer} bytes @param {{remaining:number}} budget @param {Set<string>} references @param {import('./actor-archive.mjs').ArchiveReader} [read] */
async function validateRoot(root, head, bytes, budget, references, read = (ref, maximum) => readBounded(path.join(root, ref), maximum, budget)) {
  assert(bytes.length === head.root.byteLength && sha256Hex(bytes) === head.root.hash, 'Root byte binding mismatch');
  const value = decodeCanonical(bytes);
  assert(pairDigest(head.root.kind === 'actor' ? 'state' : 'migration', value) === head.rootDigest.hash, 'Root canonical digest mismatch');
  if (head.root.kind === 'actor') {
    const context = await readArchiveContext(value, async (ref, maximum) => {
      references.add(ref);
      if (ref.startsWith('archives/')) references.add(ref.split('/').slice(0, 2).join('/'));
      return read(ref, maximum);
    });
    const model = validateActorStateV2(value, context);
    assert(model.genesis.storeId === head.storeId, 'Actor root belongs to another store');
    let owner = model.genesis.initialOwner;
    for (const event of model.events) if (event.payload.kind === 'owner-transitioned') owner = event.payload.next;
    assert(encodePairJSON(owner) === encodePairJSON(head.owner), 'Actor root owner mismatch');
    for (const workflow of model.workflows) {
      assert(workflow.assignment.workspace.cwd === head.workspace.cwd && workflow.assignment.workspace.repoRoot === head.workspace.repoRoot, 'Actor workspace mismatch');
    }
    await resolveEvidence(root, value, budget, references);
  } else {
    const v = plainObject(value);
    const source = plainObject(v.source), backup = plainObject(v.backup);
    assert(backup.kind === 'supplied', 'Held evidence backup is unresolved');
    const copy = plainObject(backup.reference);
    const sourceRef = evidenceLocator(nonEmptyString(source.ref, 'source.ref'));
    const backupRef = evidenceLocator(nonEmptyString(copy.ref, 'backup.ref'));
    assert(sourceRef.endsWith('/source.bin') && backupRef === sourceRef.replace(/source\.bin$/, 'backup.bin'), 'Held capture binding mismatch');
    const maximum = heldSourceLimit(v);
    const original = await readBounded(path.join(root, sourceRef), maximum, budget);
    const retained = await readBounded(path.join(root, backupRef), maximum, budget);
    assert(original.equals(retained), 'Held capture backup differs');
    validateHeldLegacyEvidenceV2(value, original, retained, createValidationContext());
    references.add(sourceRef);
    references.add(backupRef);
    await resolveEvidence(root, v.artifacts, budget, references);
  }
  return value;
}

/** @param {'actor'|'held-legacy'} priorKind @param {unknown} prior @param {'actor'|'held-legacy'} kind @param {unknown} next @param {string} root @param {{remaining:number}} budget @param {import('./actor-archive.mjs').ArchiveReader} [read] */
async function validateSuccessor(priorKind, prior, kind, next, root, budget, read = (ref, maximum) => readBounded(path.join(root, ref), maximum, budget)) {
  assert(priorKind === kind, 'Logical root kind cannot change without admitted reconciliation');
  if (kind === 'held-legacy') {
    assert(encodePairJSON(prior) === encodePairJSON(next), 'Held evidence is immutable without admitted reconciliation');
    return;
  }
  const priorRecord = plainObject(prior), nextRecord = plainObject(next);
  const before = Object.hasOwn(priorRecord, 'state') ? plainObject(priorRecord.state) : priorRecord;
  const after = Object.hasOwn(nextRecord, 'state') ? plainObject(nextRecord.state) : nextRecord;
  if (before.segmentId !== after.segmentId) {
    const context = await readArchiveContext(after, read);
    validateArchiveSuccessor(before, after, context);
    return;
  }
  assert(encodePairJSON(before.genesis) === encodePairJSON(after.genesis), 'Actor genesis continuity mismatch');
  assert(encodePairJSON(before.archiveHead) === encodePairJSON(after.archiveHead), 'Archive head changed without rotation');
  assert(Array.isArray(before.events) && Array.isArray(after.events) && after.events.length >= before.events.length, 'Actor event prefix was discarded');
  for (let i = 0; i < before.events.length; i++) assert(encodePairJSON(before.events[i]) === encodePairJSON(after.events[i]), 'Actor event prefix changed');
}

/** @param {string} storeRoot @param {{remaining:number}} budget */
async function selectedHead(storeRoot, budget) {
  const p = storePaths(storeRoot);
  /** @type {Buffer} */ let headBytes;
  try { headBytes = await readBounded(p.head, METADATA_BYTES, budget); }
  catch (error) { if (isCode(error, 'ENOENT')) return null; throw error; }
  const selected = validateHeadRecord(decodeCanonical(headBytes, true));
  let current = selected, marker = headBytes;
  /** @type {{kind:'actor'|'held-legacy', value:unknown}|null} */ let successor = null;
  /** @type {Buffer|null} */ let rootBytes = null;
  /** @type {import('./actor-contract-common.js').JSONValue|null} */ let rootValue = null;
  /** @type {Set<string>} */ const prefix = new Set(), references = new Set();
  for (;;) {
    assert(prefix.size < STORE_LIMITS.commits && !prefix.has(current.commitId), 'Commit prefix exceeds bound or cycles');
    prefix.add(current.commitId);
    headBindings(current);
    assert(current.storeId === selected.storeId && encodePairJSON(current.workspace) === encodePairJSON(selected.workspace), 'Commit prefix identity mismatch');
    const immutable = await readBounded(path.join(p.commits, `${current.commitId}.json`), METADATA_BYTES, budget);
    assert(immutable.equals(marker), 'Selected marker bytes differ');
    const bytes = await readBounded(path.join(p.root, current.root.ref), COMMON_BOUNDS.maxBytes, budget);
    const value = await validateRoot(p.root, current, bytes, budget, references);
    if (successor) await validateSuccessor(current.root.kind, value, successor.kind, successor.value, p.root, budget);
    successor = { kind: current.root.kind, value };
    if (rootBytes === null) { rootBytes = bytes; rootValue = value; }
    if (current.previous === null) break;
    const previous = current.previous;
    marker = await readBounded(path.join(p.root, previous.ref), METADATA_BYTES, budget);
    assert(marker.length === previous.byteLength && sha256Hex(marker) === previous.hash, 'Predecessor byte binding mismatch');
    const predecessor = validateHeadRecord(decodeCanonical(marker, true));
    assert(predecessor.commitId === commitLocator(previous.ref, 'commits') && predecessor.revision === current.revision - 1, 'Predecessor identity/revision mismatch');
    current = predecessor;
  }
  assert((await readBounded(p.head, METADATA_BYTES, budget)).equals(headBytes), 'HEAD changed during prefix validation');
  return { nonAuthorizing: true, head: selected, headBytes, rootBytes, rootValue, prefix, references };
}

/** @param {string} storeRoot */
export async function readHead(storeRoot) { return withDirectory('/', async () => selectedHead(storePaths(storeRoot).root, readBudget())); }

/** @param {string} storeRoot @param {string} [workerId] */
export async function inspectHeld(storeRoot, workerId) {
  return withDirectory('/', async () => {
  const p = storePaths(storeRoot), budget = readBudget();
  /** @type {ReturnType<typeof diagnostic>[]} */ const issues = [];
  /** @type {Head|null} */ let head = null;
  /** @type {import('./actor-contract-common.js').JSONValue|null} */ let rootValue = null;
  /** @type {ReturnType<typeof validateHeldLegacyEvidenceV2>|null} */ let evidence = null;
  /** @type {ReturnType<typeof projectHeldLegacyWorkerViewInContext>} */ let projection = null;
  /** @type {{ref:string, bytes:Buffer, hash:string, matches:boolean}|null} */ let source = null, backup = null;
  let rootBound = false;
  let projectionBasis = 'unavailable';
  try { head = validateHeadRecord(decodeCanonical(await readBounded(p.head, METADATA_BYTES, budget), true)); }
  catch (error) { issues.push(diagnostic(error)); }
  if (head?.root.kind === 'held-legacy') {
    try {
      const bytes = await readBounded(path.join(p.root, head.root.ref), COMMON_BOUNDS.maxBytes, budget);
      rootValue = decodeCanonical(bytes);
      rootBound = bytes.length === head.root.byteLength && sha256Hex(bytes) === head.root.hash && pairDigest('migration', rootValue) === head.rootDigest.hash;
      assert(rootBound, 'Held root binding mismatch');
    } catch (error) { issues.push(diagnostic(error)); }
    if (rootValue !== null) {
      try {
        const value = plainObject(rootValue), maximum = heldSourceLimit(value);
        /** @param {unknown} declaration */
        async function observe(declaration) {
          const ref = plainObject(declaration);
          const locator = evidenceLocator(nonEmptyString(ref.ref, 'held.ref'));
          const bytes = await readBounded(path.join(p.root, locator), maximum, budget);
          const hash = sha256Hex(bytes);
          return { ref: locator, bytes, hash, matches: ref.hash === hash && ref.byteLength === bytes.length };
        }
        try { source = await observe(value.source); assert(source.matches, 'Held source binding mismatch'); }
        catch (error) { issues.push(diagnostic(error)); }
        try {
          const declaration = plainObject(value.backup);
          if (declaration.reference !== null) backup = await observe(declaration.reference);
          assert(declaration.kind === 'supplied' && backup?.matches, 'Held backup missing, unresolved or mismatched');
        } catch (error) { issues.push(diagnostic(error)); }
        if (rootBound && source?.matches) {
          try {
            const declaration = plainObject(value.backup);
            const backupInput = declaration.kind === 'supplied' ? backup?.bytes ?? null : null;
            evidence = validateHeldLegacyEvidenceV2(value, source.bytes, backupInput, createValidationContext());
            if (workerId !== undefined) {
              projection = projectHeldLegacyWorkerViewInContext(value, workerId, { version: 2, kind: 'held-legacy', sourceInput: source.bytes, backupInput }, createValidationContext());
              if (projection !== null) projectionBasis = 'validated-held-evidence';
            }
          } catch (error) { issues.push(diagnostic(error)); }
          if (workerId !== undefined && projection === null) {
            try {
              const declaration = plainObject(value.backup);
              if (declaration.kind === 'supplied' && (backup === null || !backup.matches || !source.bytes.equals(backup.bytes))) {
                const displayInput = { ...value, backup: { ...declaration, kind: 'unresolved' } };
                const display = projectHeldLegacyWorkerViewInContext(displayInput, workerId, { version: 2, kind: 'held-legacy', sourceInput: source.bytes, backupInput: null }, createValidationContext());
                if (display !== null) {
                  projection = Object.freeze({ ...display, diagnostics: Object.freeze([...display.diagnostics, 'legacy-backup-declaration-supplied', 'legacy-backup-observation-unavailable', 'legacy-projection-source-only']) });
                  projectionBasis = 'source-validated-backup-unverified';
                }
              }
            } catch (error) { issues.push(diagnostic(error)); }
          }
        }
        try { await resolveEvidence(p.root, value.artifacts, budget, new Set()); }
        catch (error) { issues.push(diagnostic(error)); }
      } catch (error) { issues.push(diagnostic(error)); }
    }
  }
  return { nonAuthorizing: true, state: 'held', head, rootValue, rootBound, source, backup, evidence, projection, projectionBasis, issues };
  });
}

/** @param {string} storeRoot */
export async function classifyStore(storeRoot) { return withDirectory('/', async () => scanStore(storeRoot, new Set(), readBudget())); }

/** @param {string} storeRoot @param {Set<string>} pendingCaptures @param {{remaining:number}} budget */
async function scanStore(storeRoot, pendingCaptures, budget, freshLock = false) {
  const p = storePaths(storeRoot);
  /** @type {ReturnType<typeof diagnostic>[]} */ const issues = [];
  let selected = null;
  let absent = false;
  try { await directoryIdentity(p.root); } catch (error) { if (isCode(error, 'ENOENT')) absent = true; else issues.push(diagnostic(error)); }
  try { selected = await selectedHead(p.root, budget); }
  catch (error) { issues.push(diagnostic(error)); }
  /** @type {Record<string,Awaited<ReturnType<typeof inventory>>>} */ const inventories = {};
  /** @type {string[]} */ const unselected = [];
  let total = 0;
  for (const namespace of ['', ...namespaces]) {
    if (total > INVENTORY_LIMIT) break;
    const result = await inventory(path.join(p.root, namespace));
    inventories[namespace || 'store'] = result;
    total += result.names.length;
    if (!result.complete && result.issue) issues.push(result.issue);
    for (const name of result.names) {
      if (total > INVENTORY_LIMIT) break;
      if (namespace === '') {
        if (![...namespaces, '.owner-lock', 'HEAD.json'].includes(name)) unselected.push(name);
        if (name === '.owner-lock') {
          try {
            const lockEntries = await inventory(p.lock);
            total += lockEntries.names.length;
            assert(lockEntries.complete && (freshLock ? ['anchor'] : ['anchor,lock.json', 'anchor,lock.json,release.json']).includes(lockEntries.names.join(',')), 'Unknown store reservation contents');
            if (!freshLock) {
              const lock = validateLockRecord(decodeCanonical(await readBounded(p.lockFile, METADATA_BYTES, budget), true));
              assert(lock.scope === 'store' && lock.storeId === path.basename(p.root), 'Store reservation namespace mismatch');
            }
          } catch (error) { issues.push(diagnostic(error)); }
        }
      } else if (namespace === 'commits' || namespace === 'roots') {
        if (!selected?.prefix.has(name.replace(/\.json$/, '')) || !name.endsWith('.json')) unselected.push(`${namespace}/${name}`);
      } else if (namespace === 'staging') {
        const staged = await inventory(path.join(p.staging, name));
        total += staged.names.length;
        if (!staged.complete && staged.issue) issues.push(staged.issue);
        if (!selected?.prefix.has(name) || staged.names.length) unselected.push(`staging/${name}`);
      } else if (namespace === 'legacy') {
        const capture = await inventory(path.join(p.legacy, name));
        total += capture.names.length;
        if (!capture.complete && capture.issue) issues.push(capture.issue);
        if (capture.names.join(',') !== 'backup.bin,source.bin') unselected.push(`legacy/${name}`);
        else if (!pendingCaptures.has(name) && !selected?.references.has(`legacy/${name}/source.bin`)) unselected.push(`legacy/${name}`);
      } else if (namespace === 'archives') {
        const segment = await inventory(path.join(p.root, namespace, name));
        total += segment.names.length;
        if (!segment.complete && segment.issue) issues.push(segment.issue);
        if (segment.names.join(',') !== 'checkpoint.json,root.json' || !selected?.references.has(`archives/${name}`)) unselected.push(`archives/${name}`);
      } else if (!selected?.references.has(`${namespace}/${name}`)) unselected.push(`${namespace}/${name}`);
    }
  }
  if (total > INVENTORY_LIMIT) issues.push(diagnostic(new Error('Aggregate inventory exceeds bound')));
  const heldInspection = selected === null && issues.length ? await inspectHeld(storeRoot) : null;
  const heldEvidence = selected?.head.root.kind === 'held-legacy' ? selected.rootValue : heldInspection?.evidence ?? null;
  const state = issues.length ? 'held' : unselected.length ? 'unknown' : selected === null ? (absent ? 'absent' : 'new') : 'committed';
  return { state, nonAuthorizing: true, head: selected?.head ?? null, inventories, unselected, issues, heldEvidence, heldInspection, inventoryCount: total };
}

/** @param {StoreOptions} options */
export async function acquireStoreLock(options) {
  const snapshot = decodeCanonical(metadataBytes(options), true);
  const input = plainObject(snapshot);
  exactKeys(input, ['storeRoot', 'storeId', 'workspace', 'owner', 'process']);
  const p = storePaths(nonEmptyString(input.storeRoot, 'storeRoot'));
  const storeId = validateId(input.storeId, 'storeId');
  const owner = validateOwnerRecord(input.owner), workspace = validateWorkspaceRecord(input.workspace), processRecord = validateProcessRecord(input.process);
  const agentDir = path.dirname(path.dirname(path.dirname(p.root)));
  assert(p.root === path.join(agentDir, 'fabric-pair', 'stores', storeId), 'Store must use canonical agent namespace');
  const token = uid('token');
  const records = ['workspace', 'store'].map(scope => metadataBytes(validateLockRecord({ version: STORE_VERSION, encoding: LOCK_ENCODING, scope, token, storeId, workspace, owner, process: processRecord })));
  /** @type {Ownership} */
  const owned = { root: p.root, agentDir, storeId, owner, workspace, process: processRecord, token, locks: [], identities: new Map(), anchors: new Map(), workspaceIdentities: new Map(), selected: null, active: true, admitted: false, busy: false, ambiguous: false, captures: new Set() };
  const budget = readBudget();
  try {
    owned.anchors = await acquireAnchors(agentDir);
    return await withAnchors(owned.anchors, async () => {
      await qualifyProfile(agentDir);
      assert(encodePairJSON(await resolveWorkspace(workspace.cwd)) === encodePairJSON(workspace), 'Workspace record is not canonical');
      for (const dir of [workspace.cwd, workspace.repoRoot, ...(workspace.gitCommonDir === null ? [] : [workspace.gitCommonDir])]) owned.workspaceIdentities.set(dir, await directoryIdentity(dir));
      const base = path.join(agentDir, 'fabric-pair');
      const reservations = path.join(base, 'workspace-locks');
      for (const dir of [base, reservations, path.join(base, 'stores')]) {
        const parent = await inventory(path.dirname(dir));
        assert(parent.complete && new Set([...parent.names, path.basename(dir)]).size <= ENTRY_LIMIT, 'Acquisition resulting directory inventory exceeds capacity');
        await makePrivate(dir, owned.anchors);
      }
      owned.identities.set(agentDir, await privateDirectory(agentDir));
      for (const dir of [base, reservations, path.join(base, 'stores')]) owned.identities.set(dir, await privateDirectory(dir));
      const workspaceLock = path.join(reservations, workspace.ownershipKey);
      const freshLocks = new Set();
      for (const [index, dir] of [workspaceLock, p.lock].entries()) {
        if (index === 1) {
          const stores = await inventory(path.dirname(p.root));
          assert(stores.complete && new Set([...stores.names, storeId]).size <= ENTRY_LIMIT, 'Store directory inventory exceeds capacity');
          await makePrivate(p.root, owned.anchors);
          owned.identities.set(p.root, await privateDirectory(p.root));
        }
        const parent = await inventory(path.dirname(dir));
        assert(parent.complete && new Set([...parent.names, path.basename(dir)]).size <= ENTRY_LIMIT, 'Reservation directory inventory exceeds capacity');
        let fresh = false;
        try { await reserveDirectory(dir, owned.anchors); fresh = true; }
        catch (error) { if (!isCode(error, 'EEXIST')) throw error; await makePrivate(dir, owned.anchors); }
        const identity = await privateDirectory(dir);
        assert(identity.dev === owned.identities.get(agentDir)?.dev, 'Cross-filesystem lock namespace is unsupported');
        const handle = await lockAnchor(dir, fresh, owned.anchors);
        const lock = { dir, identity, handle, bytes: records[index] };
        owned.locks.push(lock);
        const listing = await inventory(dir);
        assert(listing.complete && listing.names.join(',') === (fresh ? 'anchor' : 'anchor,lock.json,release.json'), 'Owner reservation has active, malformed or unknown material');
        if (fresh) freshLocks.add(dir);
      }
      const selected = await selectedHead(p.root, budget);
      if (selected) {
        assert(selected.head.storeId === storeId && encodePairJSON(selected.head.workspace) === encodePairJSON(workspace) && encodePairJSON(selected.head.owner) === encodePairJSON(owner), 'Selected HEAD ownership mismatch');
        owned.selected = Buffer.from(selected.headBytes);
      }
      for (const [index, lock] of owned.locks.entries()) {
        if (freshLocks.has(lock.dir)) continue;
        const oldBytes = await readBounded(path.join(lock.dir, 'lock.json'), METADATA_BYTES, budget);
        const old = validateLockRecord(decodeCanonical(oldBytes, true));
        assert(old.scope === (index === 0 ? 'workspace' : 'store') && old.storeId === storeId && encodePairJSON(old.workspace) === encodePairJSON(workspace) && encodePairJSON(old.owner) === encodePairJSON(owner), 'Clean reservation namespace/owner mismatch');
        const head = selected === null ? null : { hash: sha256Hex(selected.headBytes), byteLength: selected.headBytes.length };
        const expected = metadataBytes({ version: 1, encoding: 'pair-owner-clean/1', token: old.token, lockHash: sha256Hex(oldBytes), head, storeId, workspaceKey: workspace.ownershipKey, gate: 'never-admitted' });
        const proof = await readBounded(path.join(lock.dir, 'release.json'), METADATA_BYTES, budget);
        decodeCanonical(proof, true);
        assert(proof.equals(expected), 'Missing exact durable clean release proof');
      }
      const rootInventory = await inventory(p.root);
      assert(rootInventory.complete && new Set([...rootInventory.names, ...namespaces]).size <= ENTRY_LIMIT, 'Store namespace inventory exceeds capacity');
      for (const namespace of namespaces) {
        const dir = path.join(p.root, namespace);
        await makePrivate(dir, owned.anchors);
        const identity = await privateDirectory(dir);
        assert(identity.dev === owned.identities.get(agentDir)?.dev, 'Cross-filesystem namespace is unsupported');
        owned.identities.set(dir, identity);
      }
      const status = await scanStore(p.root, new Set(), budget, freshLocks.has(p.lock));
      assert(status.state === 'new' || status.state === 'committed', 'Store needs offline reconciliation');
      assert(status.inventoryCount + (freshLocks.has(p.lock) ? 1 : 0) <= INVENTORY_LIMIT, 'Acquisition resulting inventory exceeds capacity');
      assert(2 * records.reduce((total, bytes) => total + bytes.length, 0) + 1 <= budget.remaining, 'Acquisition completion/readback exceeds remaining byte capacity');
      for (const lock of owned.locks) {
        if (freshLocks.has(lock.dir)) await immutableWrite(path.join(lock.dir, 'lock.json'), lock.bytes, budget, owned.anchors);
        else await replaceRecord(path.join(lock.dir, 'lock.json'), Buffer.from(lock.bytes), owned.anchors);
      }
      await verifyOwnership(owned, budget);
      const capability = Object.freeze({});
      capabilities.set(capability, owned);
      return { state: 'owned', capability, issue: null };
    });
  } catch (error) {
    owned.active = false;
    const failures = [error];
    for (const lock of owned.locks) { try { closeLockAnchor(lock.handle); } catch (cleanup) { failures.push(cleanup); } }
    try { closeAnchors(owned.anchors); } catch (cleanup) { failures.push(cleanup); }
    return { state: 'held', capability: null, issue: diagnostic(failures.length === 1 ? error : new AggregateError(failures, 'Acquisition and descriptor cleanup failed')) };
  }
}

export function markStoreAdmitted(capability = Object.freeze({})) {
  const owned = ownership(capability);
  assert(!owned.busy, 'Ownership operation already pending');
  owned.admitted = true;
  return Object.freeze({ nonAuthorizing: true, cleanReleaseAvailable: false });
}

/** @param {unknown} capability @param {unknown} [handoff] */
export async function releaseStoreLock(capability, handoff) {
  assert(capability !== null && typeof capability === 'object', 'Ownership capability required');
  const owned = capabilities.get(capability);
  assert(owned !== undefined && owned.active, 'Ownership absent or released');
  assert(!owned.busy, 'Ownership operation already pending');
  owned.busy = true;
  const failures = [];
  let released = false;
  try {
    await withAnchors(owned.anchors, async () => {
      assert(!owned.admitted && owned.captures.size === 0, 'Host-admitted lifetime or unresolved captures requires trusted settlement; release retained');
      const budget = readBudget();
      await verifyOwnership(owned, budget);
      const selected = await selectedHead(owned.root, budget);
      assert((selected === null && owned.selected === null) || (selected !== null && owned.selected !== null && selected.headBytes.equals(owned.selected)), 'Exact release HEAD changed');
      if (selected !== null) {
        assert(selected.head.root.kind === 'actor', 'Held legacy obligations require Host settlement');
        const context = await readArchiveContext(selected.rootValue, (ref, maximum) => readBounded(path.join(owned.root, ref), maximum, budget));
        const model = validateActorStateV2(selected.rootValue, context);
        assertHostQuiescent(model);
        if (handoff !== undefined) consumeHostReleaseHandoff(handoff, capability, selected.headBytes, selected.head.revision);
        else assert(model.events.length === 0 && model.workflows.length === 0 && model.genesis.heldLegacyRefs.length === 0 && model.state.archiveHead === null && model.genesis.checkpoint === null, 'Canonical history requires Host quiescence handoff');
      }
      const status = await scanStore(owned.root, new Set(), budget);
      assert(status.state === 'new' || status.state === 'committed', 'Unknown store material prevents release');
      const head = selected === null ? null : { hash: sha256Hex(selected.headBytes), byteLength: selected.headBytes.length };
      for (const lock of owned.locks) {
        await verifyOwnership(owned, budget);
        const proof = metadataBytes({ version: 1, encoding: 'pair-owner-clean/1', token: owned.token, lockHash: sha256Hex(lock.bytes), head, storeId: owned.storeId, workspaceKey: owned.workspace.ownershipKey, gate: 'never-admitted' });
        await replaceRecord(path.join(lock.dir, 'release.json'), proof, owned.anchors);
      }
      await verifyOwnership(owned, budget);
      const finalHead = await selectedHead(owned.root, budget);
      assert((finalHead === null && owned.selected === null) || (finalHead !== null && owned.selected !== null && finalHead.headBytes.equals(owned.selected)), 'Release HEAD changed during durable proof');
      released = true;
    });
  } catch (error) { failures.push(error); }
  finally {
    owned.active = false;
    owned.busy = false;
    for (const lock of owned.locks) { try { closeLockAnchor(lock.handle); } catch (error) { failures.push(error); } }
    try { closeAnchors(owned.anchors); } catch (error) { failures.push(error); }
  }
  return { state: released && failures.length === 0 ? 'released' : 'held', released: released && failures.length === 0, retained: true, issue: failures.length ? diagnostic(new AggregateError(failures, 'Clean release not acknowledged')) : null };
}

/** @param {ExpectedRevision} previous */
function snapshotPrevious(previous) {
  if (previous === null) return null;
  const p = plainObject(decodeCanonical(metadataBytes(previous), true));
  exactKeys(p, ['ref', 'hash', 'byteLength', 'revision']);
  const record = validatePreviousRecord({ ref: p.ref, hash: p.hash, byteLength: p.byteLength });
  commitLocator(record.ref, 'commits');
  return Object.freeze({ ...record, revision: positiveInteger(p.revision, 'previous.revision') });
}

/** @param {PublishInput} input */
export function snapshotPublish(input) {
  assert(input !== null && typeof input === 'object' && !types.isProxy(input), 'Invalid publication input');
  assert(Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null, 'Invalid publication input prototype');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  assert(Reflect.ownKeys(descriptors).length === 3, 'Invalid publication fields');
  for (const key of ['rootKind', 'rootBytes', 'previous']) assert(descriptors[key]?.enumerable && Object.hasOwn(descriptors[key], 'value'), 'Publication input must use inert data fields');
  exactKeys(plainObject(input), ['rootKind', 'rootBytes', 'previous']);
  assert(input.rootKind === 'actor' || input.rootKind === 'held-legacy', 'Unsupported root kind');
  assert(Buffer.isBuffer(input.rootBytes) && input.rootBytes.length > 0 && input.rootBytes.length <= COMMON_BOUNDS.maxBytes, 'Invalid root byte ceiling');
  return { rootKind: input.rootKind, rootBytes: Buffer.from(input.rootBytes), previous: snapshotPrevious(input.previous) };
}

/** @param {unknown} capability @param {PublishInput} input @param {readonly import('./actor-archive.mjs').ArchiveFile[]|null} [archiveFiles] */
export async function publishCommit(capability, input, archiveFiles = null) {
  const captured = snapshotPublish(input);
  const archive = archiveFiles === null ? null : snapshotArchiveFiles(archiveFiles);
  let mutationStarted = false;
  const owned = ownership(capability);
  assert(!owned.busy, 'Ownership operation already pending');
  owned.busy = true;
  const budget = readBudget();
  try {
    return await withAnchors(owned.anchors, async () => {
    await verifyOwnership(owned, budget);
    const prefixStart = budget.remaining;
    const selected = await selectedHead(owned.root, budget);
    const prefixCost = prefixStart - budget.remaining;
    assert((selected === null && owned.selected === null) || (selected !== null && owned.selected !== null && selected.headBytes.equals(owned.selected)), 'Live HEAD differs from acquired/acknowledged revision');
    if (selected?.head.root.kind === 'held-legacy') assert(captured.rootKind === 'held-legacy', 'Held legacy evidence cannot become executable admission');
    const previous = captured.previous;
    if (selected === null) assert(previous === null, 'Expected revision conflicts with absent HEAD');
    else assert(previous !== null && previous.revision === selected.head.revision && previous.ref === `commits/${selected.head.commitId}.json` && previous.hash === sha256Hex(selected.headBytes) && previous.byteLength === selected.headBytes.length, 'Expected exact HEAD revision mismatch');
    const status = await scanStore(owned.root, owned.captures, budget);
    assert(status.state === 'new' || status.state === 'committed', 'Unreconciled store material');
    const commitId = uid('commit'), revision = (selected?.head.revision ?? 0) + 1;
    const value = decodeCanonical(captured.rootBytes);
    assert(revision <= STORE_LIMITS.commits, 'Physical commit capacity exhausted; full prefix retained');
    if (archive !== null) {
      assert(!owned.admitted, 'Externally admitted lifetime cannot rotate without trusted settlement');
      assert(selected !== null && selected.head.root.kind === 'actor' && captured.rootKind === 'actor', 'Archive requires selected actor predecessor');
      const context = await readArchiveContext(selected.rootValue, (ref, maximum) => readBounded(path.join(owned.root, ref), maximum, budget));
      const checkpointFile = archive.find(file => file.ref.endsWith('/checkpoint.json'));
      assert(checkpointFile !== undefined, 'Archive checkpoint file missing');
      const plan = planArchiveRotation(selected.rootBytes, context, decodeCanonical(checkpointFile.bytes));
      assert(plan.rootBytes.equals(captured.rootBytes), 'Archive publication differs from validated rotation');
      for (const required of plan.files) assert(archive.some(file => file.ref === required.ref && file.bytes.equals(required.bytes)), 'Archive files differ from exact selected root/checkpoint');
    }
    const head = validateHeadRecord({ version: STORE_VERSION, encoding: HEAD_ENCODING, storeId: owned.storeId, commitId, revision,
      previous: previous === null ? null : { ref: previous.ref, hash: previous.hash, byteLength: previous.byteLength }, owner: owned.owner, workspace: owned.workspace,
      root: { kind: captured.rootKind, ref: `roots/${commitId}.json`, hash: sha256Hex(captured.rootBytes), byteLength: captured.rootBytes.length },
      rootDigest: { domain: captured.rootKind === 'actor' ? 'state' : 'migration', hash: pairDigest(captured.rootKind === 'actor' ? 'state' : 'migration', value) } });
    headBindings(head);
    const headBytes = metadataBytes(head);
    const overlay = new Map(archive?.map(file => [file.ref, file.bytes]));
    const read = async (ref = '', maximum = 0) => {
      const bytes = overlay.get(ref);
      if (bytes === undefined) return readBounded(path.join(owned.root, ref), maximum, budget);
      assert(bytes.length <= maximum && bytes.length + 1 <= budget.remaining, 'Archive overlay exceeds read ceiling/budget');
      budget.remaining -= bytes.length;
      return bytes;
    };
    const references = new Set();
    const referenceStart = budget.remaining;
    await validateRoot(owned.root, head, captured.rootBytes, budget, references, read);
    const rootReferenceCost = referenceStart - budget.remaining;
    if (selected !== null) await validateSuccessor(selected.head.root.kind, selected.rootValue, captured.rootKind, value, owned.root, budget, read);
    const referenceCost = referenceStart - budget.remaining;
    for (const capture of owned.captures) assert(references.has(`legacy/${capture}/source.bin`), 'Pending capture must remain referenced');
    await verifyOwnership(owned, budget);
    const nextPrefixCost = prefixCost - (selected?.headBytes.length ?? 0) + 3 * headBytes.length + captured.rootBytes.length + referenceCost;
    const archiveCost = archive === null ? 0 : archive.reduce((total, file) => total + file.bytes.length, 0) + referenceCost;
    const completionCost = archiveCost + 2 * captured.rootBytes.length + 2 * headBytes.length + rootReferenceCost + prefixCost + nextPrefixCost + 2 * owned.locks.reduce((sum, lock) => sum + lock.bytes.length, 0);
    assert(completionCost + 1 <= budget.remaining, 'Publication completion/readback exceeds remaining byte capacity');
    assert(status.inventoryCount + 4 + (selected === null ? 1 : 0) + (archive === null ? 0 : 3) <= INVENTORY_LIMIT, 'Publication resulting/transient inventory exceeds bounded physical capacity');
    for (const [namespace, additions] of Object.entries({ roots: 1, commits: 1, staging: 1, archives: archive === null ? 0 : 1, store: selected === null ? 1 : 0 })) {
      const listing = status.inventories[namespace];
      assert(listing.complete && listing.names.length + additions <= ENTRY_LIMIT, 'Publication resulting directory inventory exceeds capacity');
    }
    if (archive !== null) {
      const segment = path.dirname(archive[0].ref);
      assert(!status.inventories.archives.names.some(name => name === path.basename(segment)), 'Archive directory already exists');
      mutationStarted = true;
      await reserveDirectory(path.join(owned.root, segment), owned.anchors);
      for (const file of archive) await immutableWrite(path.join(owned.root, file.ref), file.bytes, budget, owned.anchors);
      await validateRoot(owned.root, head, captured.rootBytes, budget, new Set());
      if (selected !== null) await validateSuccessor(selected.head.root.kind, selected.rootValue, captured.rootKind, value, owned.root, budget);
    }
    const stage = path.join(owned.root, 'staging', commitId);
    mutationStarted = true;
    await reserveDirectory(stage, owned.anchors);
    await immutableWrite(path.join(owned.root, head.root.ref), captured.rootBytes, budget, owned.anchors);
    await immutableWrite(path.join(owned.root, 'commits', `${commitId}.json`), headBytes, budget, owned.anchors);
    await validateRoot(owned.root, head, await readBounded(path.join(owned.root, head.root.ref), COMMON_BOUNDS.maxBytes, budget), budget, new Set());
    await immutableWrite(path.join(stage, 'HEAD.json'), headBytes, budget, owned.anchors);
    await verifyOwnership(owned, budget);
    const live = await selectedHead(owned.root, budget);
    assert((live === null && owned.selected === null) || (live !== null && owned.selected !== null && live.headBytes.equals(owned.selected)), 'HEAD changed before selection');
    await renameAnchored(path.join(stage, 'HEAD.json'), path.join(owned.root, 'HEAD.json'), owned.anchors);
    await syncDirectory(stage, owned.anchors);
    await syncDirectory(owned.root, owned.anchors);
    const verified = await selectedHead(owned.root, budget);
    assert(verified !== null && verified.headBytes.equals(headBytes), 'Selected publication readback mismatch');
    await verifyOwnership(owned, budget);
    owned.selected = Buffer.from(headBytes);
    owned.captures.clear();
    return { nonAuthorizing: true, head, previous: { ref: `commits/${commitId}.json`, hash: sha256Hex(headBytes), byteLength: headBytes.length, revision } };
    });
  } catch (error) { if (mutationStarted) owned.ambiguous = true; throw error; }
  finally { owned.busy = false; }
}

export const publishArchiveCommit = publishCommit;

/** @param {unknown} capability @param {string} captureId @param {Buffer} sourceBytes */
export async function heldCapture(capability, captureId, sourceBytes) {
  const id = validateId(captureId, 'captureId');
  assert(Buffer.isBuffer(sourceBytes) && sourceBytes.length <= COMMON_BOUNDS.maxBytes, 'Invalid capture byte ceiling');
  const original = Buffer.from(sourceBytes);
  let mutationStarted = false;
  const owned = ownership(capability);
  assert(!owned.busy, 'Ownership operation already pending');
  owned.busy = true;
  const budget = readBudget();
  try {
    return await withAnchors(owned.anchors, async () => {
    await verifyOwnership(owned, budget);
    const status = await scanStore(owned.root, owned.captures, budget);
    assert(status.state === 'new' || status.state === 'committed', 'Unreconciled store material');
    assert(status.inventoryCount + 3 <= INVENTORY_LIMIT, 'Capture resulting inventory exceeds capacity');
    assert(status.inventories.legacy.complete && status.inventories.legacy.names.length + 1 <= ENTRY_LIMIT, 'Capture resulting directory inventory exceeds capacity');
    assert(!status.inventories.legacy.names.some(name => name === id), 'Capture directory already exists');
    assert(2 * original.length + owned.locks.reduce((sum, lock) => sum + lock.bytes.length, 0) + 1 <= budget.remaining, 'Capture completion/readback exceeds remaining byte capacity');
    const dir = path.join(owned.root, 'legacy', id);
    mutationStarted = true;
    await reserveDirectory(dir, owned.anchors);
    await immutableWrite(path.join(dir, 'source.bin'), original, budget, owned.anchors);
    await immutableWrite(path.join(dir, 'backup.bin'), original, budget, owned.anchors);
    await verifyOwnership(owned, budget);
    owned.captures.add(id);
    return Object.freeze({ nonAuthorizing: true, captureId: id, byteLength: original.length, sourceHash: sha256Hex(original), backupHash: sha256Hex(original), sourceRef: `legacy/${id}/source.bin`, backupRef: `legacy/${id}/backup.bin` });
    });
  } catch (error) { if (mutationStarted) owned.ambiguous = true; throw error; }
  finally { owned.busy = false; }
}

/** @param {string} storeRoot */
export async function heldInventory(storeRoot) {
  return withDirectory('/', async () => {
  const root = storePaths(storeRoot).legacy;
  const listing = await inventory(root);
  const entries = [];
  for (const name of listing.names) {
    /** @type {Record<string,unknown>} */ const facts = {};
    for (const file of ['source.bin', 'backup.bin']) {
      try {
        validateId(name, 'captureId');
        await directoryIdentity(path.join(root, name));
        const stat = await statFile(path.join(root, name, file));
        facts[file] = { exists: true, regular: (stat.mode & 0o170000) === 0o100000 && stat.nlink === 1, byteLength: stat.size, withinLimit: stat.size <= COMMON_BOUNDS.maxBytes };
      } catch (error) { facts[file] = { exists: isCode(error, 'ENOENT') ? false : null, issue: diagnostic(error) }; }
    }
    entries.push({ captureId: name, nonAuthorizing: true, facts });
  }
  return { nonAuthorizing: true, complete: listing.complete, issue: listing.issue, entries, heldInspection: await inspectHeld(storeRoot) };
  });
}

import { createRequire } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assert } from './util.js';

export const IO_BYTES = 64 * 1024 * 1024;
export const ENTRY_LIMIT = 64;

/** @param {unknown} error @param {string} code */
export function isCode(error, code) {
  return error instanceof Error && 'code' in error && error.code === code;
}

/** @param {unknown} error */
export function diagnostic(error) {
  const causes = [];
  const pending = [{ error, path: 'primary', depth: 0 }];
  const seen = new Set();
  let message = '', nodes = 0, truncated = false;
  while (pending.length && nodes++ < 32) {
    const item = pending.pop();
    if (!item) break;
    const value = item.error;
    let text;
    try { text = value instanceof Error ? `${value.name}: ${value.message}` : String(value); }
    catch { text = '[unprintable error]'; }
    if (text.length > 1024) { text = `${text.slice(0, 1000)} [truncated]`; truncated = true; }
    if (nodes === 1) message = text;
    else causes.push(`${item.path}: ${text}`);
    if (value instanceof Error) {
      if (seen.has(value)) { causes.push(`${item.path}: [cycle]`); continue; }
      seen.add(value);
      const children = value instanceof AggregateError ? value.errors : value.cause === undefined ? [] : [value.cause];
      if (item.depth >= 6) { if (children.length) truncated = true; continue; }
      if (children.length > 8) truncated = true;
      for (let i = Math.min(children.length, 8) - 1; i >= 0; i--) pending.push({ error: children[i], path: `${item.path}.causes[${i}]`, depth: item.depth + 1 });
    }
  }
  if (pending.length) truncated = true;
  if (truncated) causes.push('[cause tree truncated: depth/node/string ceiling]');
  return { message, causes };
}

const require = createRequire(import.meta.url);
const contexts = new WeakMap();
const current = new AsyncLocalStorage();
const backends = new Map();
const qualifications = new Map();

export function nativePreflight() {
  assert(process.platform === 'darwin' && process.arch === 'arm64' && Number(process.versions.node.split('.')[0]) === 24, 'Unsupported native store: Darwin arm64 Node 24 required');
  if (!backends.has(0)) {
    const version = execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 }).trim();
    assert(/^\d+\.\d+(?:\.\d+)?$/.test(version) && Number(version.split('.')[0]) >= 27, 'Unsupported native store: macOS >=27.0 required');
    try { backends.set(0, require('./native-store/build/store-darwin-arm64.node')); }
    catch (cause) { throw new Error('Native store unavailable; explicitly run node src/native-store/build.js using installed Node 24 headers', { cause }); }
  }
  return backends.get(0);
}

/** @param {Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>} a @param {Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>} b */
export function sameIdentity(a, b) { return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.uid === b.uid; }

/** @param {string} file */
export function absolute(file) {
  assert(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file && !file.includes('\0'), 'Noncanonical absolute path');
  return file;
}

function context(identities = new Map()) {
  let value = contexts.get(identities);
  if (!value) {
    value = new Map([['/', nativePreflight().root()]]);
    contexts.set(identities, value);
  }
  return value;
}

function directory(dir = '/', identities = current.getStore()) {
  absolute(dir);
  assert(identities instanceof Map, 'Descriptor context required');
  const native = nativePreflight(), handles = context(identities);
  const parts = dir.split('/').filter(Boolean);
  assert(parts.length <= ENTRY_LIMIT, 'Directory ancestry exceeds bound');
  let logical = '/', parent = handles.get('/');
  for (const part of parts) {
    logical = path.join(logical, part);
    let child = handles.get(logical);
    if (child) {
      native.check(parent, part, child);
      assert(sameIdentity(identities.get(logical), native.stat(child)), 'Retained directory attributes changed');
    }
    else {
      child = native.child(parent, part, 0);
      handles.set(logical, child);
      const expected = identities.get(logical), actual = native.stat(child);
      assert(!expected || sameIdentity(expected, actual), 'Trusted directory identity changed');
      identities.set(logical, actual);
    }
    parent = child;
  }
  return parent;
}

export function closeAnchors(identities = new Map()) {
  const handles = contexts.get(identities);
  if (!handles) return;
  contexts.delete(identities);
  const failures = [];
  for (const handle of [...handles.values()].reverse()) {
    try { nativePreflight().close(handle); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, 'Descriptor close failed');
}

/** @template T @param {Map<string,Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>} identities @param {()=>Promise<T>} operation */
export async function withAnchors(identities, operation) {
  return current.run(identities, operation);
}

/** @template T @param {string} dir @param {(anchored:string, handle:{sync:()=>Promise<void>,stat:()=>Promise<Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>})=>Promise<T>} operation @param {Map<string,Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>} [identities] */
export async function withDirectory(dir, operation, identities = current.getStore()) {
  const temporary = identities === undefined;
  const anchors = identities ?? new Map();
  const failures = [];
  try {
    return await withAnchors(anchors, async () => {
      const handle = directory(dir, anchors), native = nativePreflight();
      const result = await operation(dir, { sync: async () => { native.sync(handle); }, stat: async () => native.stat(handle) });
      directory(dir, anchors);
      return result;
    });
  } catch (error) { failures.push(error); throw error; }
  finally {
    if (temporary) {
      try { closeAnchors(anchors); }
      catch (error) { throw new AggregateError([...failures, error], 'Directory operation/cleanup failed'); }
    }
  }
}

/** @param {string} dir */
export async function directoryIdentity(dir) { return withDirectory(dir, async (_name, handle) => handle.stat()); }

/** @param {string} dir */
export async function privateDirectory(dir) {
  const s = await directoryIdentity(dir);
  assert(typeof process.getuid === 'function' && s.uid === process.getuid() && (s.mode & 0o077) === 0, `Directory is not private: ${dir}`);
  return s;
}

/** @param {string} dir @param {Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>} before */
export async function unchangedDirectory(dir, before) { assert(sameIdentity(before, await directoryIdentity(dir)), `Directory identity changed: ${dir}`); }

/** @param {string} dir */
export async function acquireAnchors(dir) {
  const identities = new Map();
  try { directory(dir, identities); return identities; }
  catch (error) {
    try { closeAnchors(identities); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'Anchor acquisition/cleanup failed'); }
    throw error;
  }
}

/** @param {string} dir @param {Map<string,Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>} [identities] */
export async function syncDirectory(dir, identities) { return withDirectory(dir, async (_anchor, handle) => handle.sync(), identities); }

/** @param {string} dir @param {Map<string,Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>} identities @param {boolean} exclusive */
async function createDirectory(dir, identities, exclusive) {
  const native = nativePreflight(), handles = context(identities);
  const parent = directory(path.dirname(dir), identities);
  if (handles.has(dir)) {
    if (exclusive) throw Object.assign(new Error('Reservation already acquired'), { code: 'EEXIST' });
    const existing = directory(dir, identities);
    const s = native.stat(existing);
    assert(s.uid === process.getuid?.() && (s.mode & 0o077) === 0, 'Unsafe private directory');
    native.sync(existing);
    return s;
  }
  const child = native.child(parent, path.basename(dir), exclusive ? 2 : 1);
  handles.set(dir, child);
  const s = native.stat(child);
  identities.set(dir, s);
  return s;
}

/** @param {string} dir @param {Map<string,Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>} identities */
export async function makePrivate(dir, identities) { return createDirectory(dir, identities, false); }

/** @param {string} dir @param {Map<string,Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>} identities */
export async function reserveDirectory(dir, identities) { return createDirectory(dir, identities, true); }

export function readBudget() { return { remaining: IO_BYTES }; }

/** @param {string} file @param {number} maximum @param {{remaining:number}} budget */
export async function readBounded(file, maximum, budget) {
  assert(Number.isSafeInteger(maximum) && maximum >= 0 && maximum <= IO_BYTES && budget.remaining > 0, 'Invalid read ceiling/budget');
  return withDirectory(path.dirname(file), async () => {
    const bytes = nativePreflight().read(directory(path.dirname(file)), path.basename(file), Math.min(maximum, budget.remaining - 1));
    budget.remaining -= bytes.length;
    return /** @type {Buffer} */ (bytes);
  });
}

/** @param {string} file @param {Buffer} bytes @param {{remaining:number}} budget @param {Map<string,Pick<import('node:fs').Stats,'dev'|'ino'|'mode'|'uid'>>} identities */
export async function immutableWrite(file, bytes, budget, identities) {
  assert(bytes.length + 1 <= budget.remaining, 'Immutable write/readback exceeds remaining byte capacity');
  await withAnchors(identities, async () => {
    nativePreflight().write(directory(path.dirname(file)), path.basename(file), bytes);
    assert((await readBounded(file, bytes.length, budget)).equals(bytes), 'Immutable file readback mismatch');
  });
}

export async function statFile(file = '') {
  return withDirectory(path.dirname(file), async () => nativePreflight().statFile(directory(path.dirname(file)), path.basename(file)));
}

export async function renameAnchored(source = '', target = '', identities = new Map()) {
  nativePreflight().rename(directory(path.dirname(source), identities), path.basename(source), directory(path.dirname(target), identities), path.basename(target));
  directory(path.dirname(source), identities);
  directory(path.dirname(target), identities);
}

export async function replaceRecord(file = '', bytes = Buffer.alloc(0), identities = new Map()) {
  const temporary = `${file}.next`;
  await immutableWrite(temporary, bytes, readBudget(), identities);
  await renameAnchored(temporary, file, identities);
  await withAnchors(identities, async () => assert((await readBounded(file, bytes.length, readBudget())).equals(bytes), 'Record replacement readback mismatch'));
}

export async function lockAnchor(dir = '', fresh = false, identities = new Map()) {
  return nativePreflight().lock(directory(dir, identities), fresh);
}

export function verifyLockAnchor(dir = '', handle = {}, identities = new Map()) {
  nativePreflight().check(directory(dir, identities), 'anchor', handle);
}

export function closeLockAnchor(handle = {}) { nativePreflight().close(handle); }

/** @param {string} dir */
export async function inventory(dir) {
  try {
    const names = await withDirectory(dir, async () => nativePreflight().list(directory(dir)));
    return { names: /** @type {string[]} */ (names.sort()), complete: true, issue: null };
  } catch (error) {
    const absent = isCode(error, 'ENOENT') && error instanceof Error && !(error instanceof AggregateError) && error.cause === undefined && 'operation' in error && error.operation === 'Open directory';
    return { names: [], complete: absent, issue: absent ? null : diagnostic(error) };
  }
}

/** @param {string} agentDir @param {{synchronization:'excluded-by-operator'}} [attestation] */
export async function qualifyProfile(agentDir, attestation) {
  absolute(agentDir);
  assert(attestation === undefined || (attestation !== null && Object.hasOwn(attestation, 'synchronization') && attestation.synchronization === 'excluded-by-operator'), 'Explicit operator synchronization exclusion required');
  const qualified = await withDirectory(agentDir, async () => {
    const native = nativePreflight(), handle = directory(agentDir);
    const name = native.profile(handle), identity = native.stat(handle);
    if (attestation === undefined) {
      const registered = qualifications.get(agentDir);
      assert(registered && sameIdentity(registered, identity), 'Deployment synchronization exclusion is unknown or root identity changed; explicit operator qualification required');
    }
    return { identity, profile: Object.freeze({ name, filesystem: 'apfs', powerLossQualified: false, syncFoldersSupported: false }) };
  });
  if (attestation !== undefined) qualifications.set(agentDir, qualified.identity);
  return qualified.profile;
}


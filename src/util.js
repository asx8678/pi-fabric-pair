import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { WIRE_VERSION } from './contracts.js';

export const VERSION = '0.1.0';
export const PROTOCOL = WIRE_VERSION;
/** Data-only view for typed clone callers: retain arrays/optional fields and Dates,
 * but do not promise to preserve declared methods or callable values. Opaque unknown
 * fields stay unknown and are still subject to structuredClone's runtime checks.
 * @template T
 * @typedef {T extends Date ? Date : T extends (...args: never[]) => unknown ? never : T extends object ? {[K in keyof T]: CloneData<T[K]>} : T} CloneData
 */
/** Native structured clone, not a JSON round trip. Unsupported values still throw;
 * callers must not depend on custom prototypes, accessors or property descriptors.
 * @template T @param {T & CloneData<T>} value @returns {T}
 */
export const clone = value => structuredClone(value);
/** @param {unknown} value @returns {string} */
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
/** Key-order independent JSON for identity hashes: object keys sorted recursively, arrays kept in order.
 * @param {unknown} value @returns {string} */
export function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(item => stableJSON(item === undefined ? null : item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stableJSON(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
/** @param {unknown} value @returns {string} */
export const stableDigest = value => digest(stableJSON(value));
/** @param {string} prefix */
export const uid = prefix => `${prefix}-${randomUUID()}`;
/** @param {unknown} condition @param {string} message @returns {asserts condition} */
export function assert(condition, message) { if (!condition) throw new Error(message); }
/** @param {unknown} value @param {string} [label] @returns {string} */
export function safeId(value, label = 'id') {
  assert(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value), `${label} must contain 1–80 letters, digits, underscores or hyphens`);
  assert(!['prototype', ...Object.getOwnPropertyNames(Object.prototype)].includes(value), `${label} is reserved`);
  return value;
}
/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
/** Matches the public native PI_CODING_AGENT_DIR semantics: `~` expands to the
 * home directory and `~/...` (or `~\\...` on Windows) joins it; every other
 * value resolves as before. Profiles are never touched.
 * @param {NodeJS.ProcessEnv} [env] */
export function agentDir(env = process.env) {
  const raw = env.PI_CODING_AGENT_DIR;
  const base = !raw ? path.join(os.homedir(), '.pi', 'agent')
    : raw === '~' ? os.homedir()
    : raw.startsWith('~/') || (process.platform === 'win32' && raw.startsWith('~\\')) ? path.join(os.homedir(), raw.slice(2))
    : raw;
  return path.resolve(base);
}
/** @param {unknown} value @param {number} [max] */
export function cleanText(value, max = 4000) {
  return String(value ?? '').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').slice(0, max);
}
/** @param {unknown} error */
export function briefError(error) { return cleanText(error instanceof Error ? error.message : error, 2000); }
/** @param {unknown} value @param {number} [limit] */
export function bounded(value, limit = 16000) {
  const text = String(value ?? '');
  assert(Number.isSafeInteger(limit) && limit >= 0, 'Bounded text limit must be a nonnegative safe integer');
  if (text.length <= limit) return text;
  const marker = '\n… [truncated; inspect the local artifact] …\n';
  if (limit <= marker.length) return text.slice(0, limit);
  const available = limit - marker.length;
  const head = Math.ceil(available * .7), tail = available - head;
  return `${text.slice(0, head)}${marker}${tail ? text.slice(-tail) : ''}`;
}
/** @param {string} dir @returns {Promise<void>} */
export async function mkdirPrivate(dir) { await fs.mkdir(dir, { recursive: true, mode: 0o700 }); }
/** @param {string} file @param {unknown} value @returns {Promise<void>} */
export async function atomicJSON(file, value) {
  await mkdirPrivate(path.dirname(file));
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  /** @type {import('node:fs/promises').FileHandle | undefined} */
  let handle;
  try {
    handle = await fs.open(tmp, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8');
    await handle.sync();
    await handle.close(); handle = undefined;
    await fs.rename(tmp, file);
    await syncDirectory(path.dirname(file));
  } finally { await handle?.close().catch(() => {}); await fs.unlink(tmp).catch(() => {}); }
}
/** Make a completed rename durable. Platforms that cannot open or fsync a directory
 * (Windows) keep the previous best-effort behaviour. @param {string} dir */
export async function syncDirectory(dir) {
  /** @type {import('node:fs/promises').FileHandle | undefined} */
  let handle;
  try { handle = await fs.open(dir, constants.O_RDONLY); await handle.sync(); }
  catch (e) { if (!(plain(e) && ['EISDIR', 'EPERM', 'EACCES', 'EINVAL', 'ENOTSUP', 'EBADF'].includes(String(e.code)))) throw e; }
  finally { await handle?.close().catch(() => {}); }
}
/** Whether a PID may safely be signalled as a child we spawned. PID 0/1 and negatives would
 * address the whole process group or every process of this user (kill(-1) signals everything),
 * and this process or its parent must never be targeted. @param {unknown} pid @returns {pid is number} */
export function signallablePid(pid) {
  return typeof pid === 'number' && Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid && pid !== process.ppid;
}
/** Signal a spawned child's process group (or the child alone on Windows). Refuses any PID that
 * is not a plausible child, so a bad value can never become kill(-1). @param {number | undefined} pid
 * @param {NodeJS.Signals | 0} signal @param {{kill?: (signal: NodeJS.Signals) => boolean} | null} [child] @returns {boolean} whether a signal was sent */
export function signalGroup(pid, signal, child = null) {
  if (!signallablePid(pid)) return false;
  if (process.platform === 'win32') { if (child && signal !== 0) child.kill?.(signal); else process.kill(pid, signal); return true; }
  process.kill(-pid, signal); return true;
}
/** Liveness of a process ID: 'dead' (no such process), 'alive', or 'foreign' (exists but
 * owned by another user, so it cannot be a process this user spawned). @param {number} pid
 * @returns {'dead' | 'alive' | 'foreign'} */
export function processState(pid) {
  // Negative values name a process group; never probe the special groups 0 and -1.
  if (!Number.isSafeInteger(pid) || Math.abs(pid) <= 1) return 'alive';
  try { process.kill(pid, 0); return 'alive'; }
  catch (e) { return plain(e) && e.code === 'ESRCH' ? 'dead' : plain(e) && e.code === 'EPERM' ? 'foreign' : 'alive'; }
}
/** Wall-clock start time of a live process, or null when it cannot be observed
 * (no `ps`, Windows, or the process is gone). Used to detect PID reuse.
 * @param {number} pid @returns {Promise<number | null>} */
export async function processStartedAt(pid) {
  if (process.platform === 'win32' || !Number.isSafeInteger(pid) || pid <= 0) return null;
  const { execFile } = await import('node:child_process');
  return new Promise(resolve => {
    execFile('ps', ['-o', 'lstart=', '-p', String(pid)], { timeout: 5000, env: { ...process.env, LC_ALL: 'C' } }, (error, stdout) => {
      const at = error ? NaN : Date.parse(String(stdout).trim());
      resolve(Number.isFinite(at) ? at : null);
    });
  });
}
/** Start time of this process, recorded in lock owners so a recycled PID is not mistaken for the owner. */
export const PROCESS_STARTED_AT = Date.now() - Math.round(process.uptime() * 1000);
/** Whether a lock owner record still names a live process. A live PID whose start time is
 * provably later than the recorded owner start is a recycled PID, not the owner.
 * @param {unknown} owner @returns {Promise<boolean>} */
export async function ownerAlive(owner) {
  if (!plain(owner) || typeof owner.pid !== 'number') return false;
  const state = processState(owner.pid);
  if (state !== 'alive') return false;
  if (typeof owner.startedAt !== 'number') return true;
  const started = await processStartedAt(owner.pid);
  // `ps` reports whole seconds; allow for that and for clock rounding.
  return started === null || started <= owner.startedAt + 2000;
}
/** Parsed data is unvalidated; callers must narrow at their domain boundary.
 * The presence of the fallback argument (including explicit undefined) is significant.
 * @param {string} file @param {unknown} [fallback] @param {number} [maxBytes] @returns {Promise<unknown>}
 */
export async function readJSON(file, fallback, maxBytes = 16 * 1024 * 1024) {
  /** @type {import('node:fs/promises').FileHandle | undefined} */
  let handle;
  try {
    handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = await handle.stat();
    assert(stat.isFile() && stat.size <= maxBytes, `Invalid or oversized JSON file: ${file}`);
    return JSON.parse(await handle.readFile('utf8'));
  } catch (e) { if (plain(e) && e.code === 'ENOENT' && arguments.length >= 2) return fallback; throw e; }
  finally { await handle?.close(); }
}
/** @param {string} file */
export async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
/** @param {string} dir */
export async function canonical(dir) { return fs.realpath(path.resolve(dir)); }
/** @param {string} root @param {string} file */
export function inside(root, file) { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); }
/** Merging does not validate a configuration shape.
 * @param {Record<string, unknown> | null | undefined} a
 * @param {Record<string, unknown> | null | undefined} b
 * @returns {Record<string, unknown>}
 */
export function merge(a, b) {
  /** @type {Record<string, unknown>} */
  const out = { ...a };
  for (const [key, value] of Object.entries(b || {})) {
    assert(!['__proto__', 'prototype', 'constructor'].includes(key), 'Unsafe configuration key');
    out[key] = plain(value) && plain(out[key]) ? merge(out[key], value) : clone(value);
  }
  return out;
}
// JSON-with-comments reader, without eval. Used only to inspect native settings.
/** @param {string} text @returns {unknown} */
function parseJSONC(text) {
  let out = '', quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { out += c; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; assert(i < text.length, 'Unterminated JSON comment'); i++; out += ' '; continue; }
    if (c === ',') {
      // Remove trailing commas in a second pass after comments have been removed.
      out += c; continue;
    }
    out += c;
  }
  let result = ''; quoted = false; escaped = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (quoted) { result += c; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    if (c === ',') { let j = i + 1; while (/\s/.test(out[j] || '') && j < out.length) j++; if (out[j] === '}' || out[j] === ']') continue; }
    result += c;
  }
  return JSON.parse(result);
}
/** @param {string} file @returns {Promise<unknown>} */
export async function readJSONC(file) {
  try { return parseJSONC(await fs.readFile(file, 'utf8')); } catch (e) { if (plain(e) && e.code === 'ENOENT') return {}; throw new Error(`Cannot inspect ${file}: ${briefError(e)}`); }
}
export class Serial {
  /** @type {Promise<unknown>} */
  #tail = Promise.resolve();
  /** @template T @param {() => T | PromiseLike<T>} fn @returns {Promise<T>} */
  run(fn) { const p = this.#tail.then(fn); this.#tail = p.catch(() => {}); return p; }
  async drain() { await this.#tail; }
}
/** A lock directory without an owner record older than this is a crashed acquisition. */
const ORPHAN_LOCK_MS = 60_000;
/** Exclusive directory lock. The owner record is written into a private temporary
 * directory that is then renamed into place, so a lock never exists without its owner.
 * A lock whose owner process is gone (or whose PID was recycled) is broken.
 * @param {string} dir @param {Record<string, unknown>} owner
 * @param {{name?: string, conflict?: (owner: Record<string, unknown>) => string}} [options]
 * @returns {Promise<() => Promise<void>>} */
export async function acquireLock(dir, owner, { name = '.owner-lock', conflict } = {}) {
  await mkdirPrivate(dir);
  const lock = path.join(dir, name);
  for (let attempt = 0; attempt < 3; attempt++) {
    const staging = `${lock}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.mkdir(staging, { mode: 0o700 });
      await atomicJSON(path.join(staging, 'owner.json'), { ...owner, pid: process.pid, startedAt: PROCESS_STARTED_AT, createdAt: Date.now() });
      await fs.rename(staging, lock);
      await syncDirectory(dir);
      let released = false;
      return async () => { if (!released) { released = true; await fs.rm(lock, { recursive: true, force: true }); } };
    } catch (e) {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
      // rename(2) onto an existing non-empty directory fails with ENOTEMPTY or EEXIST.
      if (!plain(e) || !['EEXIST', 'ENOTEMPTY'].includes(String(e.code))) throw e;
      const previous = await readJSON(path.join(lock, 'owner.json'), null);
      if (previous === null) {
        // Legacy/crashed acquisition: a directory with no owner record.
        const stat = await fs.stat(lock).catch(() => null);
        assert(!stat || Date.now() - stat.mtimeMs > ORPHAN_LOCK_MS, 'Another Pair controller is initializing. Retry after it finishes.');
      } else {
        assert(plain(previous) && typeof previous.pid === 'number', 'Invalid Pair owner lock: pid must be a number');
        assert(!await ownerAlive(previous), conflict ? conflict(previous) : `Pair session is already owned by process ${previous.pid}; never attach two controllers to one session.`);
      }
      await fs.rm(lock, { recursive: true, force: true });
    }
  }
  throw new Error('Could not acquire Pair lock');
}

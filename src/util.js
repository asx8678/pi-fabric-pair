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
/** @param {NodeJS.ProcessEnv} [env] */
export function agentDir(env = process.env) { return path.resolve(env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent')); }
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
  } finally { await handle?.close().catch(() => {}); await fs.unlink(tmp).catch(() => {}); }
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
export function parseJSONC(text) {
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
/** @param {string} dir @param {Record<string, unknown>} owner @returns {Promise<() => Promise<void>>} */
export async function acquireLock(dir, owner) {
  await mkdirPrivate(dir);
  const lock = path.join(dir, '.owner-lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.mkdir(lock, { mode: 0o700 });
      await atomicJSON(path.join(lock, 'owner.json'), { ...owner, pid: process.pid, createdAt: Date.now() });
      let released = false;
      return async () => { if (!released) { released = true; await fs.rm(lock, { recursive: true, force: true }); } };
    } catch (e) {
      if (!plain(e) || e.code !== 'EEXIST') throw e;
      const previous = await readJSON(path.join(lock, 'owner.json'), null);
      assert(previous, 'Another Pair controller is initializing. Retry after it finishes.');
      assert(plain(previous) && typeof previous.pid === 'number', 'Invalid Pair owner lock: pid must be a number');
      let alive = true;
      try { process.kill(previous.pid, 0); } catch (err) { if (plain(err) && err.code === 'ESRCH') alive = false; }
      assert(!alive, `Pair session is already owned by process ${previous.pid}; never attach two controllers to one session.`);
      await fs.rm(lock, { recursive: true, force: true });
    }
  }
  throw new Error('Could not acquire Pair session lock');
}

import fs from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PiRpc, RpcUncertainError, isRpcRecord } from './rpc.js';
import { checkReadiness } from './native.js';

/** @typedef {import('./rpc.js').RpcRecord} RecordValue */
/** @typedef {import('./rpc.js').RpcOptions} RpcOptions */
/** @typedef {import('./rpc.js').RpcExit} RpcExit */
/** @typedef {import('./contracts.js').WorkerSpec} WorkerSpec */
/** @typedef {import('./contracts.js').StoredProbeV1} Probe */
/** @typedef {{runtime: {startupTimeoutMs: number, requestTimeoutMs: number, shutdownTimeoutMs: number}, requirements: {fabric: boolean, fovea: boolean, prewalkDisabled: boolean, autoCompaction: boolean}}} RuntimeConfig */
/** @typedef {{taskId: string, attemptId: string, leaseId: string, workerGeneration: number}} ActivationIdentity */
/** @typedef {Readonly<ActivationIdentity & {serial: number}>} Activation */
/** @typedef {{token: Activation, controller: AbortController, prepared: boolean, attempted: boolean, accepted: boolean, settled: boolean}} ActivationState */
/** @typedef {{model: {provider: string, id: string}, thinkingLevel: string, sessionId: string, sessionFile: string, isStreaming: boolean, isCompacting: boolean, pendingMessageCount: number, autoCompactionEnabled: boolean}} RuntimeState */
/** @typedef {{state: RuntimeState, probe: Probe}} Readiness */
/** @typedef {{input: number, output: number, cacheRead: number, cacheWrite: number, cost?: {total: number}}} Usage */
/** @typedef {{type: string, at: number, message?: {role: string, usage?: Usage}, reason?: string, toolCallId?: string, toolName?: string, steering?: number, followUp?: number, error?: string, notifyType?: string}} RuntimeObservation */
/** @typedef {{id: string, event: RecordValue, activation: Activation | null, startup: boolean, scope: number, controller: AbortController, deadline: number, timer: ReturnType<typeof setTimeout>, bytes: number}} Dialog */
/** @typedef {{header: RecordValue, entries: RecordValue[]}} History */
/** @typedef {{rpcOptions: RpcOptions, rpcFactory?: (options: RpcOptions) => PiRpc, ownerSession: string, ownerEpoch: number, workerId: string, workerGeneration: number, nonce: string, dir: string, cwd: string, sessionFile: string, sessionId: string | null, freshSession: boolean, config: RuntimeConfig, spec: WorkerSpec, entryPath: string, promptUser?: (workerId: string, event: RecordValue, options: {signal: AbortSignal, timeout: number}) => Promise<unknown>, onWake: () => void, isCurrent: (runtime: PiRuntime, activation: Activation | null) => boolean}} RuntimeOptions */

// Internal bounded retention, deliberately not configuration or wire-format additions.
const OBS_COUNT = 256, OBS_BYTES = 1024 * 1024, OBS_BATCH = 32;
const DIALOG_COUNT = 8, DIALOG_BYTES = 64 * 1024, TOOL_COUNT = 128;
const HISTORY_BYTES = 16 * 1024 * 1024, HISTORY_ENTRIES = 100_000, PROBE_BYTES = 256 * 1024;
const MAX_TIMEOUT = 300_000, UI_TIMEOUT = 120_000;
const THINKING = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const COMPACTION_REASONS = new Set(['manual', 'threshold', 'overflow']);

/** @param {unknown} condition @param {string} message @returns {asserts condition} */
function requireValue(condition, message) { if (!condition) throw new Error(message); }
/** @param {unknown} value @param {string} label @returns {RecordValue} */
function record(value, label) { requireValue(isRpcRecord(value), `${label} must be an object`); return value; }
/** @param {unknown} value @returns {value is string} */
function text(value) { return typeof value === 'string' && value.length > 0 && value.length <= 4096; }
/** @param {unknown} value @returns {value is number} */
function nonnegative(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
/** @param {unknown} value @returns {value is number} */
function count(value) { return nonnegative(value) && Number.isSafeInteger(value); }
/** @param {unknown} error */
function reasonOf(error) { return (error instanceof Error ? error.message : String(error)).slice(0, 4000); }
/** @param {number | undefined} value @param {number} fallback */
function boundedTimeout(value, fallback) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.max(1, Math.min(MAX_TIMEOUT, value)) : fallback; }
/** @template T @param {T} value @returns {Readonly<T>} */
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
/** Authoritative assistant message_end accounting, never streaming/legacy zero-fill.
 * @param {unknown} value @returns {Usage}
 */
function usageOf(value) {
  const usage = record(value, 'Assistant final usage accounting');
  const { input, output, cacheRead, cacheWrite } = usage;
  requireValue(nonnegative(input) && nonnegative(output) && nonnegative(cacheRead) && nonnegative(cacheWrite), 'Malformed assistant final usage accounting: all four token counts are required and must be finite/nonnegative');
  /** @type {{total: number} | undefined} */ let cost;
  if (Object.hasOwn(usage, 'cost')) {
    const rawCost = record(usage.cost, 'Assistant final usage cost accounting');
    // Absent total is unknown, including cost: {}; only an explicit valid zero is zero.
    if (Object.hasOwn(rawCost, 'total')) {
      requireValue(nonnegative(rawCost.total), 'Malformed assistant final usage accounting: invalid cost.total');
      cost = { total: rawCost.total };
    }
  }
  return { input, output, cacheRead, cacheWrite, ...(cost ? { cost } : {}) };
}

/** Bounded regular-file read with fatal UTF-8; no symlinks or stat/read size race.
 * @param {string} file @param {number} maximum @returns {Promise<string>}
 */
async function readBounded(file, maximum) {
  const handle = await fs.open(file, FS.O_RDONLY | FS.O_NOFOLLOW);
  try {
    const stat = await handle.stat(); requireValue(stat.isFile() && stat.size <= maximum, `Invalid/oversized file: ${file}`);
    const buffer = Buffer.alloc(Math.min(maximum + 1, stat.size + 1));
    let used = 0;
    while (used < buffer.length) { const part = await handle.read(buffer, used, buffer.length - used, used); if (!part.bytesRead) break; used += part.bytesRead; }
    const after = await handle.stat();
    requireValue(used === stat.size && after.size === stat.size && after.mtimeMs === stat.mtimeMs, `File changed during validation: ${file}`);
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used));
  } finally { await handle.close(); }
}
/** @param {unknown} value */
function validateUsage(value) {
  const usage = record(value, 'Stored usage'), cost = record(usage.cost, 'Stored usage cost');
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens']) requireValue(nonnegative(usage[key]), `Invalid stored usage ${key}`);
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'total']) requireValue(nonnegative(cost[key]), `Invalid stored cost ${key}`);
}
/** @param {unknown} value @param {string} role */
function validateContent(value, role) {
  if (typeof value === 'string') { requireValue(!['assistant', 'toolResult'].includes(role), 'Stored assistant/tool content must be an array'); return; }
  requireValue(Array.isArray(value), 'Invalid stored message content');
  for (const raw of value) {
    const block = record(raw, 'Content block');
    switch (block.type) {
      case 'text': requireValue(typeof block.text === 'string', 'Invalid text block'); break;
      case 'image': requireValue(typeof block.data === 'string' && text(block.mimeType), 'Invalid image block'); break;
      case 'thinking': requireValue(role === 'assistant' && (typeof block.thinking === 'string' || block.redacted === true), 'Invalid thinking block'); break;
      case 'toolCall': requireValue(role === 'assistant' && text(block.id) && text(block.name) && isRpcRecord(block.arguments), 'Invalid tool-call block'); break;
      default: throw new Error('Unknown stored content block');
    }
  }
}
/** Known Pi messages are schema-checked; augmented host roles remain opaque JSON.
 * @param {unknown} value @param {boolean} [allowPending]
 */
function validateMessage(value, allowPending = false) {
  const message = record(value, 'Session message'); requireValue(text(message.role), 'Invalid message role');
  if (!['user', 'assistant', 'toolResult', 'system', 'custom', 'bashExecution', 'branchSummary', 'compactionSummary'].includes(message.role)) return;
  requireValue(nonnegative(message.timestamp), 'Invalid stored message timestamp');
  if (['user', 'assistant', 'toolResult', 'system', 'custom'].includes(message.role)) validateContent(message.content, message.role);
  if (message.role === 'assistant') {
    requireValue(text(message.api) && text(message.provider) && text(message.model), 'Invalid assistant identity');
    requireValue((allowPending && message.stopReason === 'pending') || ['stop', 'length', 'toolUse', 'error', 'aborted', 'deferred'].includes(String(message.stopReason)), 'Invalid assistant stop reason');
    validateUsage(message.usage);
  }
  if (message.role === 'toolResult') requireValue(text(message.toolCallId) && text(message.toolName) && typeof message.isError === 'boolean', 'Invalid stored tool result');
  if (message.role === 'custom') requireValue(text(message.customType) && typeof message.display === 'boolean', 'Invalid stored custom message');
  if (message.role === 'bashExecution') requireValue(typeof message.command === 'string' && typeof message.output === 'string' && typeof message.cancelled === 'boolean' && typeof message.truncated === 'boolean', 'Invalid stored bash execution');
  if (message.role === 'branchSummary') requireValue(typeof message.summary === 'string' && (message.fromId === null || text(message.fromId)), 'Invalid stored branch summary');
  if (message.role === 'compactionSummary') requireValue(typeof message.summary === 'string' && nonnegative(message.tokensBefore), 'Invalid stored compaction summary');
  if (message.usage !== undefined) validateUsage(message.usage);
}
/** Strict base/payload/ref validation. Arbitrary extension/custom JSON is preserved, never interpreted.
 * @param {unknown[]} values @returns {RecordValue[]}
 */
function validateEntries(values) {
  requireValue(values.length <= HISTORY_ENTRIES, 'Session entry count exceeds retention bound');
  /** @type {Map<string, RecordValue>} */ const seen = new Map();
  const result = [];
  for (const value of values) {
    const entry = record(value, 'Session entry');
    requireValue(text(entry.id) && !seen.has(entry.id) && text(entry.type) && entry.type !== 'session', 'Invalid/duplicate session entry identity');
    requireValue(typeof entry.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp)), 'Invalid session entry timestamp');
    requireValue(entry.parentId === null || (text(entry.parentId) && seen.has(entry.parentId)), 'Broken session parent reference');
    switch (entry.type) {
      case 'message': {
        validateMessage(entry.message);
        break;
      }
      case 'model_change': requireValue(text(entry.provider) && text(entry.modelId), 'Invalid model entry'); break;
      case 'thinking_level_change': requireValue(typeof entry.thinkingLevel === 'string' && THINKING.has(entry.thinkingLevel), 'Invalid thinking entry'); break;
      case 'compaction':
        requireValue(typeof entry.summary === 'string' && nonnegative(entry.tokensBefore), 'Invalid compaction entry');
        // Retain-none compaction legitimately references its OWN id.
        requireValue(entry.firstKeptEntryId === entry.id || (text(entry.firstKeptEntryId) && seen.has(entry.firstKeptEntryId)), 'Broken compaction reference'); break;
      case 'branch_summary': requireValue(typeof entry.summary === 'string' && text(entry.fromId) && seen.has(entry.fromId), 'Broken branch-summary reference'); break;
      case 'context_edit': {
        requireValue(text(entry.targetId) && seen.has(entry.targetId), 'Broken context-edit target');
        const target = seen.get(entry.targetId);
        requireValue(target && ['message', 'custom_message'].includes(String(target.type)), 'Context-edit target is not editable');
        const role = target.type === 'custom_message' ? 'custom' : record(target.message, 'Context-edit target message').role;
        requireValue(typeof role === 'string' && (target.type === 'custom_message' || ['user', 'assistant', 'toolResult'].includes(role)), 'Context-edit target is not editable');
        // Pi 0.87.1 persists a wrapper, not the shorthand shown in older prose docs.
        if (entry.replacement !== null) validateContent(record(entry.replacement, 'Context-edit replacement').content, role);
        break;
      }
      case 'label': requireValue(text(entry.targetId) && seen.has(entry.targetId) && (entry.label === undefined || typeof entry.label === 'string'), 'Broken label reference'); break;
      case 'custom': requireValue(text(entry.customType), 'Invalid custom entry'); break;
      case 'custom_message': requireValue(text(entry.customType) && typeof entry.display === 'boolean' && (typeof entry.content === 'string' || Array.isArray(entry.content)), 'Invalid custom message'); break;
      case 'session_info': requireValue(typeof entry.name === 'string', 'Invalid session info'); break;
      case 'usage': requireValue(typeof entry.kind === 'string' && text(entry.provider) && text(entry.model), 'Invalid usage entry'); validateUsage(entry.usage); break;
      default: throw new Error(`Unverifiable session entry type: ${entry.type}`);
    }
    if (entry.usage !== undefined) validateUsage(entry.usage);
    if (entry.systemMessage !== undefined) { validateMessage(entry.systemMessage); requireValue(record(entry.systemMessage, 'System checkpoint').role === 'system', 'Invalid system checkpoint'); }
    seen.set(entry.id, entry); result.push(entry);
  }
  return result;
}
/** @param {string} file @param {string} cwd @returns {Promise<History>} */
async function readHistory(file, cwd) {
  const raw = await readBounded(file, HISTORY_BYTES);
  requireValue(raw.length > 0, 'Retained session is empty; refusing replacement');
  const lines = raw.split('\n'); if (lines.at(-1) === '') lines.pop();
  // No trim/filter: blank lines, malformed tails, or legacy migration would hide history.
  const values = lines.map((line, i) => { try { return record(JSON.parse(line), `Session line ${i + 1}`); } catch { throw new Error(`Malformed session JSONL at line ${i + 1}`); } });
  const header = values.shift();
  requireValue(header && header.type === 'session' && header.version === 3 && text(header.id) && header.cwd === cwd && typeof header.timestamp === 'string' && Number.isFinite(Date.parse(header.timestamp)), 'Invalid bound V3 session header');
  requireValue(header.parentSession === undefined || text(header.parentSession), 'Invalid parent session path');
  return { header, entries: validateEntries(values) };
}
/** @param {unknown} value @returns {RuntimeState} */
function validateState(value) {
  const state = record(value, 'RPC state'), model = record(state.model, 'RPC model');
  requireValue(text(model.provider) && text(model.id) && text(state.sessionId) && text(state.sessionFile) && typeof state.thinkingLevel === 'string' && THINKING.has(state.thinkingLevel), 'Incomplete RPC state identity');
  requireValue(typeof state.isStreaming === 'boolean' && typeof state.isCompacting === 'boolean' && count(state.pendingMessageCount) && typeof state.autoCompactionEnabled === 'boolean', 'Invalid RPC idle state');
  return { model: { provider: model.provider, id: model.id }, thinkingLevel: state.thinkingLevel, sessionId: state.sessionId, sessionFile: state.sessionFile, isStreaming: state.isStreaming, isCompacting: state.isCompacting, pendingMessageCount: state.pendingMessageCount, autoCompactionEnabled: state.autoCompactionEnabled };
}
/** Validate the entire retained public probe before assigning its typed contract.
 * @param {unknown} value @returns {asserts value is Probe}
 */
function assertProbe(value) {
  const p = record(value, 'Bridge probe'), model = record(p.model, 'Bridge model'), caps = record(p.capabilities, 'Bridge capabilities'), native = record(p.native, 'Bridge native settings');
  requireValue(p.protocol === 1 && text(p.pairVersion) && count(p.pid) && p.pid > 0 && text(p.cwd) && typeof p.trusted === 'boolean', 'Invalid bridge protocol/process');
  for (const key of ['sessionId', 'sessionFile', 'nonce', 'workerId', 'ownerSession', 'scope']) requireValue(text(p[key]), `Invalid bridge ${key}`);
  requireValue(count(p.ownerEpoch) && p.ownerEpoch > 0 && count(p.workerGeneration) && p.workerGeneration > 0 && nonnegative(p.checkedAt), 'Invalid bridge generation/time');
  requireValue(text(model.provider) && text(model.id) && nonnegative(model.contextWindow), 'Invalid bridge model');
  requireValue(typeof p.thinkingLevel === 'string' && THINKING.has(p.thinkingLevel), 'Invalid bridge thinking level');
  for (const key of ['fabric', 'fovea', 'pairReport']) requireValue(typeof caps[key] === 'boolean', `Invalid bridge capability ${key}`);
  record(p.versions, 'Bridge versions'); requireValue(Array.isArray(p.sourcePaths) && p.sourcePaths.every(text), 'Invalid bridge sources');
  if (p.context !== null) {
    const context = record(p.context, 'Bridge context');
    requireValue((context.tokens === null || nonnegative(context.tokens)) && nonnegative(context.contextWindow) && (context.percent === null || nonnegative(context.percent)), 'Invalid bridge context usage');
  }
  for (const key of ['piCompaction', 'cacheWarming', 'fabricCompaction']) requireValue(Object.hasOwn(native, key), `Missing native setting ${key}`);
  requireValue(text(native.agentDir) && typeof native.note === 'string' && typeof native.prewalkDisabled === 'boolean' && typeof native.prewalkConfigured === 'boolean', 'Invalid native settings');
  requireValue((native.fabricShellHangMs === null || nonnegative(native.fabricShellHangMs)) && (native.fabricAgentMaxDepth === null || nonnegative(native.fabricAgentMaxDepth)), 'Invalid native runtime limits');
}

/** One immutable worker generation. All session lifecycle and dialogs have exactly this owner. */
export class PiRuntime {
  /** @type {Readonly<RuntimeOptions>} */ #options;
  /** @type {PiRpc} */ #rpc;
  /** @type {Promise<Readiness> | null} */ #startPromise = null;
  /** @type {Promise<void> | null} */ #stopPromise = null;
  /** @type {Promise<void> | null} */ #abortPromise = null;
  /** @type {ActivationState | null} */ #activation = null;
  /** @type {RuntimeState | null} */ #state = null;
  /** @type {Probe | null} */ #probe = null;
  /** @type {string | null} */ #fault = null;
  /** @type {RpcExit | null} */ #exit = null;
  /** @type {Map<string, string>} */ #tools = new Map();
  /** @type {Map<string, Dialog>} */ #dialogs = new Map();
  /** @type {RuntimeObservation[]} */ #observations = [];
  /** @type {Map<string, number>} */ #compactions = new Map();
  /** @type {History | null} */ #history = null;
  /** @type {string | null} */ #leaf = null;
  #observationBytes = 0; #dialogBytes = 0; #displayed = false; #wakeQueued = false;
  #settledSequence = 0; #settledAt = 0; #serial = 0; #scope = 0; #revision = 0;
  #ready = false; #started = false; #provenUnspawned = false; #closing = false; #revokedStartup = false;
  #streaming = false; #unsettled = false; #retrying = false; #summaryRetrying = false; #overflowRecovery = false;
  #steering = 0; #followUp = 0; #idleKnown = false; #promptPending = false; #bridge = false;
  #startupController = new AbortController();
  /** @type {Set<() => void>} */ #waiters = new Set();
  /** @param {RuntimeOptions} options */
  constructor(options) {
    requireValue(path.isAbsolute(options.sessionFile) && path.isAbsolute(options.cwd) && path.isAbsolute(options.entryPath), 'Runtime paths must be absolute');
    requireValue(count(options.ownerEpoch) && options.ownerEpoch > 0 && count(options.workerGeneration) && options.workerGeneration > 0, 'Invalid runtime generation');
    this.#options = Object.freeze({ ...options, rpcOptions: freeze(structuredClone(options.rpcOptions)), config: freeze(structuredClone(options.config)), spec: freeze(structuredClone(options.spec)) });
    this.#rpc = (options.rpcFactory || (opts => new PiRpc(opts)))(this.#options.rpcOptions);
    // Observers are installed before start(), all commands, and all possible activity.
    this.#rpc.on('event', event => { try { this.#observe(event); } catch (error) { this.#hold(error); } });
    this.#rpc.on('fault', error => this.#hold(error));
    this.#rpc.on('exit', exit => { this.#exit = Object.freeze({ ...exit }); this.#ready = false; this.#invalidateDialogs(); this.#activation?.controller.abort(); this.#startupController.abort(); this.#wake(); });
  }
  get rpc() { return this.#rpc; }
  get pid() { return this.#rpc.pid; }
  get closed() { return this.#rpc.closed || this.#provenUnspawned; }
  get nonce() { return this.#options.nonce; }
  get ownerEpoch() { return this.#options.ownerEpoch; }
  get workerGeneration() { return this.#options.workerGeneration; }
  get dir() { return this.#options.dir; }
  get ready() { return this.#ready && !this.#fault && !this.closed && !this.#closing && this.#options.isCurrent(this, null); }
  get settledSequence() { return this.#settledSequence; }
  get settledAt() { return this.#settledAt; }
  get fault() { return this.#fault; }
  get exit() { return this.#exit; }
  get permission() { return this.#dialogs.size > 0; }
  get currentTool() { return this.#tools.values().next().value || null; }

  #wake() {
    for (const wake of this.#waiters) wake();
    if (this.#wakeQueued) return;
    this.#wakeQueued = true;
    queueMicrotask(() => { this.#wakeQueued = false; try { this.#options.onWake(); } catch (error) { this.#hold(error); } });
  }
  /** @param {unknown} error */
  #hold(error) {
    if (this.#fault) return;
    this.#fault = reasonOf(error); this.#ready = false; this.revoke(this.#fault); this.#wake();
    if (this.#started && !this.closed) void this.abortAndStop(this.#fault).catch(() => { this.#wake(); });
  }
  /** @param {Activation | null} activation @param {boolean} [control] */
  #current(activation, control = false) {
    if (this.closed || (!control && (this.#closing || this.#fault))) return false;
    if (!this.#options.isCurrent(this, activation)) return false;
    return !activation || (this.#activation?.token === activation && !this.#activation.controller.signal.aborted);
  }
  /** Stale ownership says nothing about whether an already-written command executed.
   * @param {Activation | null} activation
   */
  #assertCurrent(activation) { if (!this.#current(activation)) throw new Error('Runtime owner/activation fence is no longer current'); }
  /** @param {string} command @param {RecordValue} fields @param {Activation | null} activation @param {number} [timeoutMs] @returns {Promise<unknown>} */
  async #send(command, fields, activation, timeoutMs) {
    this.#assertCurrent(activation);
    const signal = activation ? this.#activation?.controller.signal : this.#startupController.signal;
    const result = await this.#rpc.send(command, fields, boundedTimeout(timeoutMs, this.#requestTimeout()), { signal, guard: () => this.#current(activation), observeAfterWrite: true });
    this.#assertCurrent(activation); return result;
  }
  #requestTimeout() { return boundedTimeout(this.#options.config.runtime.requestTimeoutMs, 30000); }
  #startupTimeout() { return boundedTimeout(this.#options.config.runtime.startupTimeoutMs, 120000); }

  /** Single-flight is installed synchronously; a failed generation never respawns. @returns {Promise<Readiness>} */
  ensureStarted() {
    if (!this.#startPromise) {
      /** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
      const start = Promise.resolve().then(() => this.#start());
      /** @type {Promise<Readiness>} */ const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new RpcUncertainError('Runtime startup deadline expired; this generation cannot restart');
          this.#startupController.abort(error); this.#hold(error); reject(error);
        }, this.#startupTimeout());
      });
      this.#startPromise = Promise.race([start, deadline]).catch(error => {
        if (!this.#started) { this.#provenUnspawned = true; this.#exit = { code: null, signal: null, expected: false, error: error instanceof Error ? error : new Error(reasonOf(error)), spawnFailed: true }; }
        this.#hold(error); throw error;
      }).finally(() => clearTimeout(timer));
    }
    return this.#startPromise;
  }
  /** @returns {Promise<Readiness>} */
  async #start() {
    this.#assertCurrent(null); requireValue(!this.#revokedStartup, 'Startup was revoked');
    const o = this.#options;
    if (o.freshSession) {
      requireValue(o.sessionId === null, 'Fresh session cannot replace a retained session identity');
      // Only a live Controller reservation can authorize this exclusive empty file.
      this.#assertCurrent(null);
      const handle = await fs.open(o.sessionFile, 'wx', 0o600);
      await handle.close(); this.#assertCurrent(null);
      this.#history = null;
    } else {
      this.#history = await readHistory(o.sessionFile, o.cwd); this.#assertCurrent(null);
      requireValue(o.sessionId === null || this.#history.header.id === o.sessionId, 'Recorded session identity disagrees with header');
    }
    requireValue(!this.#revokedStartup, 'Startup was revoked'); this.#assertCurrent(null);
    this.#started = true; this.#rpc.start();
    const initial = await this.#readState(null, this.#startupTimeout());
    if (this.#history) requireValue(initial.sessionId === this.#history.header.id, 'Pi replaced the retained session');
    const materialized = await readHistory(o.sessionFile, o.cwd); this.#assertCurrent(null);
    requireValue(materialized.header.id === initial.sessionId, 'Pi did not materialize the bound session header');
    if (this.#history) requireValue(isDeepStrictEqual(materialized.header, this.#history.header), 'Bound session header changed during launch');
    this.#checkPrefix(this.#history?.entries || [], materialized.entries, initial.thinkingLevel);
    const entries = await this.#entries(null); this.#assertCurrent(null);
    requireValue(isDeepStrictEqual(entries, materialized.entries), 'Pi history differs from prelaunch/materialized history');
    this.#history = materialized;
    // CLI model selection may be fuzzy. An exact setter followed by exact reads is mandatory.
    await this.#send('set_model', { provider: o.spec.provider, modelId: o.spec.model }, null);
    const levels = record(await this.#send('get_available_thinking_levels', {}, null), 'Thinking levels');
    requireValue(Array.isArray(levels.levels) && levels.levels.includes(o.spec.effort), `Unsupported worker effort: ${o.spec.effort}`);
    await this.#send('set_thinking_level', { level: o.spec.effort }, null);
    const state = await this.#readState(null); this.#exactState(state);
    const afterSetters = await this.#entries(null); this.#assertCurrent(null);
    this.#checkPrefix(this.#history.entries, afterSetters, o.spec.effort); this.#history = { header: materialized.header, entries: afterSetters };
    await this.#waitIdle(this.#startupTimeout(), null); // separately scoped startup dialogs must finish first
    const readiness = await this.#bridgeCommand('probe', null);
    this.#assertCurrent(null); this.#ready = true; this.#wake(); return readiness;
  }
  /** @param {RecordValue[]} before @param {RecordValue[]} after @param {string} initialThinking */
  #checkPrefix(before, after, initialThinking) {
    requireValue(after.length >= before.length && after.length - before.length <= 4, 'Session history lost entries or has an unexpected initialization suffix');
    for (let i = 0; i < before.length; i++) requireValue(isDeepStrictEqual(before[i], after[i]), 'Session history changed/lost an old branch entry');
    /** @type {unknown} */ let parent = before.at(-1)?.id ?? null;
    for (const entry of after.slice(before.length)) {
      requireValue(entry.parentId === parent, 'Initialization suffix moved the active branch'); parent = entry.id;
      requireValue((entry.type === 'model_change' && entry.provider === this.#options.spec.provider && entry.modelId === this.#options.spec.model) || (entry.type === 'thinking_level_change' && entry.thinkingLevel === initialThinking), 'Unexpected session initialization entry');
    }
  }
  /** @param {RecordValue[]} entries @param {string} priorLeaf @param {string} leafId */
  #descendsFrom(entries, priorLeaf, leafId) {
    const byId = new Map(entries.map(e => [e.id, e]));
    let node = byId.get(leafId);
    for (let steps = 0; node !== undefined && steps <= entries.length; steps++) {
      if (node.id === priorLeaf) return true;
      node = node.parentId === null ? undefined : byId.get(node.parentId);
    }
    return false;
  }
  /** @param {Activation | null} activation @returns {Promise<RecordValue[]>} */
  async #entries(activation) {
    const data = record(await this.#send('get_entries', {}, activation), 'RPC entries');
    requireValue(Array.isArray(data.entries), 'RPC entries missing');
    const entries = validateEntries(data.entries);
    const leafId = data.leafId === null ? null : /** @type {string} */ (data.leafId);
    requireValue(leafId === null || (text(leafId) && entries.some(entry => entry.id === leafId)), 'RPC history has a broken leaf');
    if (this.#leaf !== null) {
      requireValue(leafId !== null, 'Retained session lost its active leaf');
      requireValue(leafId === this.#leaf || this.#descendsFrom(entries, this.#leaf, leafId), 'Retained session moved to an unexpected branch');
    }
    if (leafId !== null) this.#leaf = leafId;
    return entries;
  }
  /** @param {Activation | null} activation @param {number} [timeoutMs] @returns {Promise<RuntimeState>} */
  async #readState(activation, timeoutMs) {
    const revision = this.#revision;
    const state = validateState(await this.#send('get_state', {}, activation, timeoutMs));
    requireValue(state.sessionFile === this.#options.sessionFile, 'Pi changed the bound session file');
    const expectedId = this.#state?.sessionId || this.#history?.header.id || this.#options.sessionId;
    requireValue(!expectedId || expectedId === state.sessionId, 'Pi changed the bound session identity');
    this.#state = freeze(state);
    this.#idleKnown = revision === this.#revision && !state.isStreaming && !state.isCompacting && state.pendingMessageCount === 0;
    return state;
  }
  /** @param {RuntimeState} state @param {boolean} [requireIdle] */
  #exactState(state, requireIdle = true) {
    const spec = this.#options.spec;
    requireValue(state.model.provider === spec.provider && state.model.id === spec.model && state.thinkingLevel === spec.effort, 'Exact model/thinking selection drifted');
    if (requireIdle) requireValue(!state.isStreaming && !state.isCompacting && state.pendingMessageCount === 0, 'Worker RPC is not idle');
  }
  /** @param {'probe' | 'load'} operation @param {Activation | null} activation @returns {Promise<Readiness>} */
  async #bridgeCommand(operation, activation) {
    this.#assertCurrent(activation); requireValue(!this.#bridge, 'Concurrent bridge command refused');
    this.#bridge = true;
    try {
      const commands = record(await this.#send('get_commands', {}, activation), 'RPC commands');
      requireValue(Array.isArray(commands.commands), 'RPC command discovery is missing');
      const matches = commands.commands.filter(value => isRpcRecord(value) && value.name === 'pair-bridge');
      requireValue(matches.length === 1, 'Missing/ambiguous exact pair-bridge command; no prompt sent');
      const command = record(matches[0], 'Pair bridge command'), source = record(command.sourceInfo, 'Pair bridge source');
      requireValue(command.source === 'extension' && typeof source.path === 'string' && path.isAbsolute(source.path), 'Pair bridge must be an extension with an absolute source path');
      const sourcePath = await fs.realpath(source.path); this.#assertCurrent(activation);
      const entryPath = await fs.realpath(this.#options.entryPath); this.#assertCurrent(activation);
      requireValue(sourcePath === entryPath, 'Pair bridge belongs to a different extension');
      const stateBefore = await this.#readState(activation); this.#exactState(stateBefore);
      requireValue(this.#lifecycleIdle(), 'Bridge requires all session idle axes');
      const file = path.join(this.dir, 'probe.json');
      await fs.rm(file, { force: true }); this.#assertCurrent(activation);
      const began = Date.now();
      await this.#send('prompt', { message: `/pair-bridge ${operation}` }, activation, this.#startupTimeout());
      const raw = await readBounded(file, PROBE_BYTES); this.#assertCurrent(activation);
      /** @type {unknown} */ const probe = JSON.parse(raw); assertProbe(probe);
      const o = this.#options;
      requireValue(probe.nonce === o.nonce && probe.workerId === o.workerId && probe.ownerSession === o.ownerSession && probe.ownerEpoch === o.ownerEpoch && probe.workerGeneration === o.workerGeneration && probe.pid === this.pid, 'Wrong/stale bridge identity');
      requireValue(probe.checkedAt >= began && probe.checkedAt <= Date.now(), 'Bridge did not produce a fresh probe');
      const state = await this.#readState(activation); this.#exactState(state);
      requireValue(probe.sessionId === state.sessionId && probe.sessionFile === state.sessionFile && probe.cwd === o.cwd && probe.model?.provider === o.spec.provider && probe.model.id === o.spec.model && probe.thinkingLevel === o.spec.effort, 'Bridge/RPC exact identity or selection mismatch');
      requireValue(this.#lifecycleIdle(), 'Agent activity occurred during bridge verification');
      await this.#verifyRetainedHistory(activation); this.#assertCurrent(activation);
      const finalState = await this.#readState(activation); this.#exactState(finalState);
      requireValue(this.#lifecycleIdle() && isDeepStrictEqual(state, finalState), 'State changed while verifying bridge/history');
      checkReadiness(probe, finalState, o.config, o.spec, o.cwd);
      this.#assertCurrent(activation); this.#probe = freeze(probe); return { state, probe };
    } finally { this.#bridge = false; }
  }

  /** Check the persisted file and full append-only tree again before any work.
   * @param {Activation | null} activation
   */
  async #verifyRetainedHistory(activation) {
    const history = await readHistory(this.#options.sessionFile, this.#options.cwd); this.#assertCurrent(activation);
    requireValue(this.#history && isDeepStrictEqual(history.header, this.#history.header), 'Bound session header changed/disappeared');
    requireValue(history.entries.length >= this.#history.entries.length, 'Bound session history was truncated');
    for (let i = 0; i < this.#history.entries.length; i++) requireValue(isDeepStrictEqual(history.entries[i], this.#history.entries[i]), 'Old session branch entry was replaced');
    const entries = await this.#entries(activation); this.#assertCurrent(activation);
    requireValue(isDeepStrictEqual(entries, history.entries), 'RPC/persisted full session histories differ');
    this.#history = history;
  }

  /** Synchronous reservation MUST precede the Controller's first await. @param {ActivationIdentity} identity @returns {Activation} */
  reserveActivation(identity) {
    this.#assertCurrent(null);
    requireValue(identity.workerGeneration === this.workerGeneration && text(identity.taskId) && text(identity.attemptId) && text(identity.leaseId), 'Invalid activation identity');
    requireValue(!this.#promptPending && (!this.#activation || this.#activation.settled), 'An activation is already reserved/awaiting acceptance; revoke before replacing it');
    this.#invalidateDialogs(); this.#activation?.controller.abort();
    const token = Object.freeze({ ...identity, serial: ++this.#serial });
    this.#activation = { token, controller: new AbortController(), prepared: false, attempted: false, accepted: false, settled: false };
    this.#wake(); return token;
  }
  /** @param {Activation} activation */
  activationCurrent(activation) { return this.#current(activation); }
  /** @param {Activation} activation @returns {Promise<Readiness>} */
  async prepareActivation(activation) {
    try {
      this.#assertCurrent(activation); await this.ensureStarted(); this.#assertCurrent(activation);
      await this.#waitIdle(this.#requestTimeout(), activation); this.#assertCurrent(activation);
      const readiness = await this.#bridgeCommand('probe', activation); this.#assertCurrent(activation);
      requireValue(this.#activation && !this.#activation.attempted, 'Activation already attempted');
      this.#activation.prepared = true; return readiness;
    } catch (error) {
      // Report/pause/cancel owns a revoked token; stale completion must not fault
      // the retained runtime. Protocol faults independently enter #hold via observers.
      this.#assertCurrent(activation); this.#hold(error); throw error;
    }
  }
  /** Exactly one work prompt; acceptance is not settlement. @param {Activation} activation @param {string} message @returns {Promise<void>} */
  async activate(activation, message) {
    try {
      this.#assertCurrent(activation); const active = this.#activation;
      requireValue(active && active.prepared && !active.attempted && typeof message === 'string' && message.length > 0 && !message.trimStart().startsWith('/'), 'Activation is not prepared or work prompt is invalid');
      active.attempted = true; // single-use even if bridge or write fails; never resend
      await this.#bridgeCommand('load', activation); this.#assertCurrent(activation);
      const state = await this.#readState(activation); this.#exactState(state);
      requireValue(this.#lifecycleIdle(), 'Worker ceased to be idle before work');
      this.#promptPending = true;
      await this.#rpc.send('prompt', { message }, this.#requestTimeout(), { signal: active.controller.signal, observeAfterWrite: true, guard: () => {
        if (!this.#current(activation) || !this.#lifecycleIdle()) return false;
        // Bind session activity before bytes leave. Events are NEVER correlated to prompt id.
        this.#unsettled = true; this.#idleKnown = false; this.#revision++; return true;
      } });
      this.#assertCurrent(activation); active.accepted = true;
    } catch (error) {
      // Report/pause/cancel owns a revoked token; stale completion must not fault
      // the retained runtime. Protocol faults independently enter #hold via observers.
      this.#assertCurrent(activation); this.#hold(error); throw error;
    }
    finally { this.#promptPending = false; this.#wake(); }
  }
  /** Immediate effect-free revocation of authority and UI scope. @param {string} reason */
  revoke(reason) {
    this.#scope++; this.#activation?.controller.abort(reason); this.#activation = null;
    this.#invalidateDialogs();
    if (!this.#ready) { this.#revokedStartup = true; this.#startupController.abort(reason); }
    this.#wake();
  }
  #lifecycleIdle() {
    return this.#idleKnown && !this.#state?.isStreaming && !this.#state?.isCompacting && !this.#state?.pendingMessageCount && !this.#streaming && !this.#unsettled && !this.#compactions.size && !this.#retrying && !this.#summaryRetrying && !this.#steering && !this.#followUp && !this.#tools.size && !this.#dialogs.size && !this.#displayed;
  }
  snapshot() {
    return Object.freeze({ pid: this.pid, closed: this.closed, ready: this.ready, idle: this.ready && this.#lifecycleIdle() && (!this.#activation || this.#activation.settled) && !this.#promptPending && !this.#bridge && !this.#abortPromise,
      streaming: this.#streaming, compacting: this.#compactions.size > 0 || !!this.#state?.isCompacting, retrying: this.#retrying, summarizationRetrying: this.#summaryRetrying,
      pendingMessageCount: Math.max(this.#steering + this.#followUp, this.#state?.pendingMessageCount || 0), steering: this.#steering, followUp: this.#followUp,
      tools: this.#tools.size, dialogs: this.#dialogs.size, displayedDialog: this.#displayed, permission: this.permission, currentTool: this.currentTool,
      activation: this.#activation?.token || null, accepted: this.#activation?.accepted || false, awaitingSettlement: this.#unsettled, promptPending: this.#promptPending,
      settledSequence: this.settledSequence, settledAt: this.settledAt, fault: this.fault, exit: this.exit });
  }
  /** @returns {RuntimeObservation[]} */
  takeObservations() {
    const result = this.#observations.splice(0, OBS_BATCH);
    for (const item of result) this.#observationBytes -= Buffer.byteLength(JSON.stringify(item));
    if (this.#observations.length) this.#wake(); return result;
  }
  /** @param {RuntimeObservation} event */
  #enqueue(event) {
    const bytes = Buffer.byteLength(JSON.stringify(event));
    if (this.#observations.length >= OBS_COUNT || this.#observationBytes + bytes > OBS_BYTES) { this.#hold(new RpcUncertainError('Runtime observation capacity exceeded; activation held')); return; }
    this.#observations.push(event); this.#observationBytes += bytes; this.#wake();
  }
  /** Update lifecycle FIRST, before retaining any bounded observation. @param {RecordValue} event */
  #observe(event) {
    const type = String(event.type);
    if (!['message_update', 'tool_execution_update', 'extension_ui_request', 'entry_appended', 'session_info_changed'].includes(type)) this.#revision++;
    const activity = /^(agent_|turn_|message_|tool_execution_|compaction_|auto_retry_|summarization_retry_)/.test(type);
    if (type === 'extension_error') { this.#hold(new RpcUncertainError(`Worker extension_error: ${reasonOf(event.error)}`)); return; }
    // Revocation permits terminal events already in flight, never a new turn/run/tool.
    const startsWork = ['agent_start', 'turn_start', 'tool_execution_start', 'compaction_start', 'auto_retry_start', 'summarization_retry_scheduled', 'summarization_retry_attempt_start'].includes(type);
    const unauthorizedActivity = (activity && this.#bridge) || (startsWork && !this.#closing && !this.#abortPromise && (!this.#activation?.attempted || this.#activation.settled || !this.#current(this.#activation.token)));
    const activityError = () => this.#hold(new RpcUncertainError(this.#bridge ? 'Agent activity during bridge command; no work prompt authorized' : 'Agent activity outside a current activation'));
    if (type === 'extension_ui_request') { this.#handleUI(event); return; }
    /** @type {RuntimeObservation} */ const observation = { type, at: Date.now() };
    switch (type) {
      case 'agent_start':
        this.#streaming = true; this.#unsettled = true; this.#idleKnown = false;
        if (this.#state) this.#state = { ...this.#state, isStreaming: true }; break;
      case 'agent_end': this.#streaming = false; break; // NOT idle: retry/compaction/queue can follow
      case 'agent_settled':
        requireValue(!this.#compactions.size && !this.#retrying && !this.#summaryRetrying && !this.#tools.size && !this.#steering && !this.#followUp, 'agent_settled conflicts with pending lifecycle axes');
        this.#streaming = false; this.#unsettled = false; this.#idleKnown = true; this.#overflowRecovery = false;
        if (this.#state) this.#state = { ...this.#state, isStreaming: false, isCompacting: false, pendingMessageCount: 0 };
        this.#settledSequence++; this.#settledAt = Date.now(); if (this.#activation) this.#activation.settled = true;
        break; // retain stdin; no timer or implicit stop
      case 'compaction_start': {
        requireValue(typeof event.reason === 'string' && COMPACTION_REASONS.has(event.reason), 'Invalid compaction reason');
        this.#compactions.set(event.reason, (this.#compactions.get(event.reason) || 0) + 1); this.#idleKnown = false; observation.reason = event.reason;
        if (this.#state) this.#state = { ...this.#state, isCompacting: true }; break;
      }
      case 'compaction_end': {
        requireValue(typeof event.reason === 'string' && COMPACTION_REASONS.has(event.reason), 'Invalid compaction reason');
        requireValue(typeof event.aborted === 'boolean' && typeof event.willRetry === 'boolean', 'Invalid compaction outcome');
        const n = this.#compactions.get(event.reason) || 0;
        // Pi emits this terminal failure after the single overflow compact-and-retry,
        // without emitting another compaction_start. It is not a second compaction.
        const exhausted = n === 0 && this.#overflowRecovery && event.reason === 'overflow' && event.result === undefined && event.aborted === false && event.willRetry === false && text(event.errorMessage);
        requireValue(n > 0 || exhausted, 'Unmatched compaction end');
        if (n === 1) this.#compactions.delete(event.reason); else if (n > 1) this.#compactions.set(event.reason, n - 1);
        if (event.willRetry) { this.#unsettled = true; if (event.reason === 'overflow') this.#overflowRecovery = true; }
        if (typeof event.errorMessage === 'string') observation.error = event.errorMessage.slice(0, 2000);
        observation.reason = event.reason;
        if (this.#state) this.#state = { ...this.#state, isCompacting: this.#compactions.size > 0 }; break;
      }
      case 'auto_retry_start': this.#retrying = true; this.#unsettled = true; this.#idleKnown = false; break;
      case 'auto_retry_end': this.#retrying = false; break;
      case 'summarization_retry_scheduled': this.#summaryRetrying = true; this.#idleKnown = false; break;
      case 'summarization_retry_attempt_start':
        requireValue(event.source === 'branchSummary' || (event.source === 'compaction' && typeof event.reason === 'string' && COMPACTION_REASONS.has(event.reason)), 'Invalid summarization retry source');
        this.#summaryRetrying = true; this.#idleKnown = false; break;
      case 'summarization_retry_finished': this.#summaryRetrying = false; break;
      case 'queue_update':
        requireValue(Array.isArray(event.steering) && event.steering.every(v => typeof v === 'string') && Array.isArray(event.followUp) && event.followUp.every(v => typeof v === 'string'), 'Invalid queue_update');
        this.#steering = event.steering.length; this.#followUp = event.followUp.length;
        if (this.#state) this.#state = { ...this.#state, pendingMessageCount: this.#steering + this.#followUp };
        observation.steering = this.#steering; observation.followUp = this.#followUp;
        if (this.#steering + this.#followUp) { this.#idleKnown = false; if (this.#bridge) this.#hold(new RpcUncertainError('Queued agent work during bridge command')); } break;
      case 'tool_execution_start':
        requireValue(text(event.toolCallId) && text(event.toolName) && !this.#tools.has(event.toolCallId), 'Invalid/duplicate tool start');
        requireValue(this.#tools.size < TOOL_COUNT, 'Runtime tool capacity exceeded');
        this.#tools.set(event.toolCallId, event.toolName); this.#idleKnown = false; observation.toolCallId = event.toolCallId; observation.toolName = event.toolName; break;
      case 'tool_execution_end': {
        requireValue(text(event.toolCallId) && this.#tools.has(event.toolCallId) && event.toolName === this.#tools.get(event.toolCallId), 'Unmatched/mismatched tool end');
        requireValue(typeof event.isError === 'boolean', 'Invalid tool outcome');
        validateContent(record(event.result, 'Tool result').content, 'toolResult');
        this.#tools.delete(event.toolCallId); observation.toolCallId = event.toolCallId; break;
      }
      case 'message_end': {
        const message = record(event.message, 'Message event');
        if (message.role !== 'assistant') return;
        observation.message = { role: 'assistant', usage: usageOf(message.usage) }; break;
      }
      case 'turn_start': this.#idleKnown = false; break;
      case 'thinking_level_changed': if (this.ready && event.level !== this.#options.spec.effort) this.#hold(new Error('Worker thinking level drifted')); return;
      default: if (unauthorizedActivity) activityError(); return; // deltas/args/results never retained
    }
    if (unauthorizedActivity) activityError();
    this.#enqueue(observation);
  }

  /** @param {RecordValue} event */
  #handleUI(event) {
    if (event.method === 'notify') {
      if (typeof event.message === 'string') this.#enqueue({ type: 'notify', at: Date.now(), error: event.message.slice(0, 2000), notifyType: typeof event.notifyType === 'string' ? event.notifyType : 'info' });
      this.#wake(); return;
    }
    if (!['select', 'confirm', 'input', 'editor'].includes(String(event.method))) return;
    requireValue(text(event.id) && typeof event.title === 'string', 'Invalid UI dialog');
    const bytes = Buffer.byteLength(JSON.stringify(event));
    requireValue(!this.#dialogs.has(event.id) && this.#dialogs.size < DIALOG_COUNT && this.#dialogBytes + bytes <= DIALOG_BYTES, 'Runtime dialog capacity/identity violation');
    const startup = this.#started && !this.#ready && !this.#revokedStartup && !this.#startupController.signal.aborted;
    const activation = startup ? null : this.#activation?.token || null;
    requireValue(event.timeout === undefined || nonnegative(event.timeout), 'Invalid dialog timeout');
    if (event.method === 'select') requireValue(Array.isArray(event.options) && event.options.every(v => typeof v === 'string'), 'Invalid select options');
    if (event.method === 'confirm') requireValue(typeof event.message === 'string', 'Invalid confirm message');
    const timeout = Math.max(1, Math.min(UI_TIMEOUT, this.#requestTimeout(), typeof event.timeout === 'number' ? event.timeout : UI_TIMEOUT));
    /** @type {Dialog} */ const dialog = { id: event.id, event: structuredClone(event), activation, startup, scope: this.#scope, controller: new AbortController(), deadline: Date.now() + timeout, timer: setTimeout(() => this.#cancelDialog(dialog), timeout), bytes };
    this.#dialogs.set(dialog.id, dialog); this.#dialogBytes += bytes; this.#wake();
    if (!this.#dialogCurrent(dialog) || this.#bridge) this.#cancelDialog(dialog); else this.#showNextDialog();
  }
  /** @param {Dialog} dialog */
  #dialogCurrent(dialog) {
    // A late dialog from revoked work must not acquire a fresh generation-only scope.
    const admitted = dialog.startup
      ? this.#started && !this.#ready && !this.#revokedStartup && !this.#startupController.signal.aborted
      : dialog.activation !== null && this.#activation?.token === dialog.activation && this.#activation.attempted && !this.#activation.settled;
    return admitted && this.#dialogs.get(dialog.id) === dialog && dialog.scope === this.#scope && !dialog.controller.signal.aborted && Date.now() < dialog.deadline && this.#current(dialog.activation);
  }
  #showNextDialog() {
    if (this.#displayed) return;
    const dialog = this.#dialogs.values().next().value; if (!dialog) return;
    if (!this.#dialogCurrent(dialog)) { this.#cancelDialog(dialog); return; }
    this.#displayed = true;
    // Main callbacks never block the session event handler or control lane.
    void Promise.resolve().then(async () => {
      if (!this.#dialogCurrent(dialog)) return;
      const response = await this.#options.promptUser?.(this.#options.workerId, dialog.event, { signal: dialog.controller.signal, timeout: Math.max(1, dialog.deadline - Date.now()) });
      if (!this.#dialogCurrent(dialog)) return;
      const result = this.#uiResponse(dialog, response);
      await this.#rpc.respondUI(dialog.id, result, { signal: dialog.controller.signal, guard: () => this.#dialogCurrent(dialog) });
    }).catch(error => { if (error instanceof RpcUncertainError) this.#hold(error); else this.#cancelDialog(dialog); }).finally(() => {
      this.#removeDialog(dialog); this.#displayed = false; this.#showNextDialog(); this.#wake();
    });
  }
  /** @param {Dialog} dialog @param {unknown} response @returns {RecordValue} */
  #uiResponse(dialog, response) {
    if (!isRpcRecord(response) || response.cancelled === true) return { cancelled: true };
    if (dialog.event.method === 'confirm') return { confirmed: response.confirmed === true };
    if (typeof response.value !== 'string' || Buffer.byteLength(response.value) > DIALOG_BYTES / 2) return { cancelled: true };
    if (dialog.event.method === 'select' && (!Array.isArray(dialog.event.options) || !dialog.event.options.includes(response.value))) return { cancelled: true };
    return { value: response.value };
  }
  /** @param {Dialog} dialog */
  #removeDialog(dialog) {
    if (this.#dialogs.get(dialog.id) !== dialog) return;
    this.#dialogs.delete(dialog.id); this.#dialogBytes -= dialog.bytes; clearTimeout(dialog.timer); dialog.controller.abort(); this.#wake();
  }
  /** @param {Dialog} dialog */
  #cancelDialog(dialog) {
    if (this.#dialogs.get(dialog.id) !== dialog) return;
    this.#removeDialog(dialog);
    if (!this.closed) void this.#rpc.respondUI(dialog.id, { cancelled: true }, { guard: () => !this.closed }).catch(error => this.#hold(error));
  }
  #invalidateDialogs() { for (const dialog of this.#dialogs.values()) this.#cancelDialog(dialog); }

  /** @param {number} [timeoutMs] @returns {Promise<void>} */
  waitIdle(timeoutMs = this.#requestTimeout()) { return this.#waitIdle(timeoutMs, null); }
  /** @param {number} timeoutMs @param {Activation | null} activation @returns {Promise<void>} */
  async #waitIdle(timeoutMs, activation) {
    const deadline = Date.now() + boundedTimeout(timeoutMs, this.#requestTimeout());
    while (Date.now() < deadline) {
      this.#assertCurrent(activation);
      requireValue(this.#waiters.size < 32, 'Runtime idle waiter capacity exceeded');
      // Arm BEFORE get_state: a terminal event can wake us during its await,
      // invalidate that snapshot, and otherwise be lost before waiter registration.
      let finishWait = () => {};
      const changed = new Promise(resolve => {
        const done = () => { clearTimeout(timer); this.#waiters.delete(done); resolve(undefined); };
        const timer = setTimeout(done, Math.max(1, deadline - Date.now())); this.#waiters.add(done);
        finishWait = done;
      });
      try {
        // Pi clears isStreaming before awaiting its agent_settled extension handlers:
        // an idle get_state response/ACK is not settlement. Keep #unsettled event-owned.
        if (!this.#streaming && !this.#unsettled && !this.#compactions.size && !this.#retrying && !this.#summaryRetrying && !this.permission) {
          const state = await this.#readState(activation, Math.max(1, deadline - Date.now())); this.#exactState(state, false);
          if (this.#lifecycleIdle() && !this.#promptPending && !this.#bridge) return;
        }
        await changed;
      } finally { finishWait(); }
    }
    throw new RpcUncertainError('Worker did not reach verified true idle before deadline');
  }
  /** @returns {Promise<{messages: unknown[]}>} */
  async getMessages() {
    const response = await this.#send('get_messages', {}, null); // ordinary command rejection is not a malformed frame
    try {
      const data = record(response, 'RPC messages');
      requireValue(Array.isArray(data.messages), 'RPC messages missing');
      for (const message of data.messages) validateMessage(message, true);
      return { messages: data.messages };
    } catch (error) { this.#hold(new RpcUncertainError(`Malformed get_messages response: ${reasonOf(error)}`)); throw error; }
  }
  /** @param {string} reason @returns {Promise<void>} */
  abortCurrent(reason) {
    this.revoke(reason);
    if (this.#abortPromise) return this.#abortPromise;
    this.#abortPromise = Promise.resolve().then(async () => {
      if (this.closed) throw new Error('Worker is closed');
      try {
        requireValue(this.#ready && !this.#fault, 'Worker not retainable during startup/fault');
        const guard = () => this.#current(null, true);
        await this.#rpc.send('clear_queue', {}, this.#requestTimeout(), { control: true, guard });
        await this.#rpc.send('abort', {}, this.#requestTimeout(), { control: true, guard });
        this.#assertCurrent(null);
        // abort() can ACK before agent_settled extension handlers finish.
        // Retention requires the bounded event-owned settle boundary, not an immediate snapshot.
        await this.#waitIdle(this.#requestTimeout(), null);
      } catch (error) { this.#hold(error); await this.abortAndStop(reason); throw error; }
    }).finally(() => { this.#abortPromise = null; this.#wake(); });
    return this.#abortPromise;
  }
  /** @param {number} expectedGeneration @returns {Promise<void>} */
  async closeIdle(expectedGeneration) {
    requireValue(expectedGeneration === this.workerGeneration, 'Idle close generation mismatch');
    this.#assertCurrent(null); requireValue(this.ready && (!this.#activation || this.#activation.settled), 'Reserved activation prevents idle close');
    await this.waitIdle(); this.#assertCurrent(null);
    requireValue(expectedGeneration === this.workerGeneration && this.snapshot().idle, 'Idle-close eligibility changed');
    this.#closing = true; this.#invalidateDialogs();
    await this.#rpc.closeIdle({ guard: () => this.#options.isCurrent(this, null) && expectedGeneration === this.workerGeneration && this.#lifecycleIdle() && !this.#promptPending && !this.#bridge && (!this.#activation || this.#activation.settled) });
    requireValue(this.closed, 'Idle shutdown did not confirm exit');
  }
  /** @param {string} reason @returns {Promise<void>} */
  abortAndStop(reason) {
    this.revoke(reason); this.#closing = true; this.#ready = false;
    if (this.#stopPromise) return this.#stopPromise;
    this.#stopPromise = Promise.resolve().then(async () => {
      if (!this.#started) { this.#provenUnspawned = true; this.#exit = { code: null, signal: null, expected: true, error: null, spawnFailed: true }; this.#wake(); return; }
      await this.#rpc.abortAndStop(reason); requireValue(this.closed, 'Containment did not confirm process exit');
    });
    return this.#stopPromise;
  }
}

// Offline limit: without an externally retained fingerprint, a valid V3 file already
// truncated/replaced BEFORE this generation's snapshot cannot be distinguished from
// legitimate short history. Within launch we compare EVERY old entry (all branches),
// never only get_messages/leaf/current context; oversized/unverifiable history holds.

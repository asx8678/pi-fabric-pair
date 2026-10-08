import fs from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { PiRpc, RpcUncertainError, isRpcRecord } from './rpc.js';
import { checkReadiness, meshRootFor } from './native.js';

/** @typedef {import('./rpc.js').RpcRecord} RecordValue */
/** @typedef {import('./rpc.js').RpcOptions} RpcOptions */
/** @typedef {import('./rpc.js').RpcExit} RpcExit */
/** @typedef {import('./contracts.js').WorkerSpec} WorkerSpec */
/** @typedef {import('./contracts.js').StoredProbeV1} Probe */
/** @typedef {{runtime: {startupTimeoutMs: number, requestTimeoutMs: number, shutdownTimeoutMs: number, mcp?: boolean}, requirements: {fabric: boolean, fovea: boolean, prewalkDisabled: boolean, autoCompaction: boolean}}} RuntimeConfig */
/** @typedef {{taskId: string, attemptId: string, leaseId: string, workerGeneration: number}} ActivationIdentity */
/** @typedef {Readonly<ActivationIdentity & {serial: number}>} Activation */
/** @typedef {{token: Activation, controller: AbortController, prepared: boolean, attempted: boolean, accepted: boolean, settled: boolean}} ActivationState */
/** @typedef {{model: {provider: string, id: string}, thinkingLevel: string, sessionId: string, sessionFile: string, isStreaming: boolean, isCompacting: boolean, pendingMessageCount: number, autoCompactionEnabled: boolean}} RuntimeState */
/** @typedef {{state: RuntimeState, probe: Probe}} Readiness */
/** @typedef {{input: number, output: number, cacheRead: number, cacheWrite: number, cost?: {total: number}}} Usage */
/** @typedef {{type: string, at: number, message?: {role: string, usage?: Usage}, reason?: string, toolCallId?: string, toolName?: string, steering?: number, followUp?: number, error?: string, notifyType?: string}} RuntimeObservation */
/** @typedef {{id: string, event: RecordValue, activation: Activation | null, startup: boolean, scope: number, controller: AbortController, deadline: number, timer: ReturnType<typeof setTimeout>, bytes: number}} Dialog */
/** @typedef {{header: RecordValue, bytes: number, sha256: string, known: Map<string, EntryFact>, parents: Map<string, string | null>, count: number, lastId: string | null, tail: RecordValue[]}} VerifiedHistory */
/** @typedef {{rpcOptions: RpcOptions, rpcFactory?: (options: RpcOptions) => PiRpc, ownerSession: string, ownerEpoch: number, workerId: string, workerGeneration: number, nonce: string, dir: string, cwd: string, sessionFile: string, sessionId: string | null, freshSession: boolean, config: RuntimeConfig, spec: WorkerSpec, entryPath: string, promptUser?: (workerId: string, event: RecordValue, options: {signal: AbortSignal, timeout: number}) => Promise<unknown>, onWake: () => void, onSpawn?: (pid: number) => void, isCurrent: (runtime: PiRuntime, activation: Activation | null) => boolean}} RuntimeOptions */

const OBS_COUNT = 256, OBS_BYTES = 1024 * 1024, OBS_BATCH = 32;
const DIALOG_COUNT = 8, DIALOG_BYTES = 64 * 1024, TOOL_COUNT = 128;
const HISTORY_BYTES = 4 * 1024 * 1024 * 1024, HISTORY_ENTRIES = 2_000_000, PROBE_BYTES = 256 * 1024;
const TAIL_ENTRIES = 64;
const FULL_COMPARE_BYTES = 8 * 1024 * 1024;
const MAX_TIMEOUT = 300_000, UI_TIMEOUT = 120_000;
/** Pi 0.99+ reports how it took a prompt (`handled`, `queued` or `started`); older Pi reports nothing. @param {unknown} data @param {string} expected */
function promptTaken(data, expected) { return !isRpcRecord(data) || data.disposition === undefined || data.disposition === expected; }
/** @param {unknown} data */
function disposition(data) { return isRpcRecord(data) && typeof data.disposition === 'string' ? data.disposition : 'unknown'; }
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
/** @param {unknown} value @returns {Usage} */
function usageOf(value) {
  const usage = record(value, 'Assistant final usage accounting');
  const { input, output, cacheRead, cacheWrite } = usage;
  requireValue(nonnegative(input) && nonnegative(output) && nonnegative(cacheRead) && nonnegative(cacheWrite), 'Malformed assistant final usage accounting: all four token counts are required and must be finite/nonnegative');
  /** @type {{total: number} | undefined} */ let cost;
  if (Object.hasOwn(usage, 'cost')) {
    const rawCost = record(usage.cost, 'Assistant final usage cost accounting');
    if (Object.hasOwn(rawCost, 'total')) {
      requireValue(nonnegative(rawCost.total), 'Malformed assistant final usage accounting: invalid cost.total');
      cost = { total: rawCost.total };
    }
  }
  return { input, output, cacheRead, cacheWrite, ...(cost ? { cost } : {}) };
}

/** @param {string} file @param {number} maximum @returns {Promise<string>} */
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
/** @param {unknown} value */
function validateMessage(value) {
  const message = record(value, 'Session message'); requireValue(text(message.role), 'Invalid message role');
  if (!['user', 'assistant', 'toolResult', 'system', 'custom', 'bashExecution', 'branchSummary', 'compactionSummary'].includes(message.role)) return;
  requireValue(nonnegative(message.timestamp), 'Invalid stored message timestamp');
  if (['user', 'assistant', 'toolResult', 'system', 'custom'].includes(message.role)) validateContent(message.content, message.role);
  if (message.role === 'assistant') {
    requireValue(text(message.api) && text(message.provider) && text(message.model), 'Invalid assistant identity');
    requireValue(['stop', 'length', 'toolUse', 'error', 'aborted', 'deferred'].includes(String(message.stopReason)), 'Invalid assistant stop reason');
    validateUsage(message.usage);
  }
  if (message.role === 'toolResult') requireValue(text(message.toolCallId) && text(message.toolName) && typeof message.isError === 'boolean', 'Invalid stored tool result');
  if (message.role === 'custom') requireValue(text(message.customType) && typeof message.display === 'boolean', 'Invalid stored custom message');
  if (message.role === 'bashExecution') requireValue(typeof message.command === 'string' && typeof message.output === 'string' && typeof message.cancelled === 'boolean' && typeof message.truncated === 'boolean', 'Invalid stored bash execution');
  if (message.role === 'branchSummary') requireValue(typeof message.summary === 'string' && (message.fromId === null || text(message.fromId)), 'Invalid stored branch summary');
  if (message.role === 'compactionSummary') requireValue(typeof message.summary === 'string' && nonnegative(message.tokensBefore), 'Invalid stored compaction summary');
  if (message.usage !== undefined) validateUsage(message.usage);
}
/** @typedef {{type: string, role: string | null}} EntryFact */
/** @param {RecordValue} entry @returns {EntryFact} */
function factOf(entry) {
  const message = entry.type === 'message' && isRpcRecord(entry.message) ? entry.message : null;
  return { type: String(entry.type), role: message && typeof message.role === 'string' ? message.role : null };
}
/** @param {unknown[]} values @param {Map<string, EntryFact>} [known] @returns {RecordValue[]} */
function validateEntries(values, known = new Map()) {
  requireValue(values.length + known.size <= HISTORY_ENTRIES, 'Session entry count exceeds retention bound');
  const seen = new Map(known);
  const result = [];
  for (const value of values) { const entry = validateEntry(value, seen); seen.set(String(entry.id), factOf(entry)); result.push(entry); }
  return result;
}
/** @param {unknown} value @param {Map<string, EntryFact>} seen @returns {RecordValue} */
function validateEntry(value, seen) {
  {
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
        // Pi keeps no earlier entry when none matches; Fabric's compactor writes '' when it summarises everything.
        requireValue(entry.firstKeptEntryId === entry.id || entry.firstKeptEntryId === '' || (text(entry.firstKeptEntryId) && seen.has(entry.firstKeptEntryId)), 'Broken compaction reference'); break;
      case 'branch_summary': requireValue(typeof entry.summary === 'string' && text(entry.fromId) && seen.has(entry.fromId), 'Broken branch-summary reference'); break;
      case 'context_edit': {
        requireValue(text(entry.targetId) && seen.has(entry.targetId), 'Broken context-edit target');
        const target = seen.get(entry.targetId);
        requireValue(target && ['message', 'custom_message'].includes(String(target.type)), 'Context-edit target is not editable');
        const role = target.type === 'custom_message' ? 'custom' : target.role;
        requireValue(typeof role === 'string' && (target.type === 'custom_message' || ['user', 'assistant', 'toolResult'].includes(role)), 'Context-edit target is not editable');
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
    return entry;
  }
}
/** @param {Map<string, string | null>} parents @param {string} priorLeaf @param {string} leafId */
function descendsFrom(parents, priorLeaf, leafId) {
  /** @type {string | null | undefined} */ let node = leafId;
  for (let steps = 0; node !== null && node !== undefined && steps <= parents.size; steps++) {
    if (node === priorLeaf) return true;
    node = parents.get(node);
  }
  return false;
}
/** @param {unknown} value @param {string} cwd @returns {RecordValue} */
function validateHeader(value, cwd) {
  const header = record(value, 'Session header');
  requireValue(header.type === 'session' && header.version === 3 && text(header.id) && header.cwd === cwd && typeof header.timestamp === 'string' && Number.isFinite(Date.parse(header.timestamp)), 'Invalid bound V3 session header');
  requireValue(header.parentSession === undefined || text(header.parentSession), 'Invalid parent session path');
  return header;
}
/** @param {Buffer} bytes @param {number} lineNumber @param {Map<string, EntryFact>} seen @returns {RecordValue} */
function parseEntryLine(bytes, lineNumber, seen) {
  /** @type {RecordValue} */ let value;
  try { value = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), `Session line ${lineNumber}`); }
  catch { throw new Error(`Malformed session JSONL at line ${lineNumber}`); }
  requireValue(seen.size < HISTORY_ENTRIES, 'Session entry count exceeds retention bound');
  const entry = validateEntry(value, seen);
  seen.set(String(entry.id), factOf(entry));
  return entry;
}
/**
 * @param {string} file
 * @param {string} cwd
 * @param {VerifiedHistory | null} [base]
 * @param {boolean} [keepAll]
 * @returns {Promise<{history: VerifiedHistory, suffix: RecordValue[]}>}
 */
async function scanHistory(file, cwd, base = null, keepAll = false) {
  const handle = await fs.open(file, FS.O_RDONLY | FS.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    requireValue(stat.isFile() && stat.size <= HISTORY_BYTES, `Invalid/oversized session file: ${file}`);
    requireValue(stat.size > 0, 'Retained session is empty; refusing replacement');
    const start = base ? base.bytes : 0;
    requireValue(stat.size >= start, 'Session history changed/lost an old branch entry (the file is shorter than its verified prefix)');
    const hash = createHash('sha256');
    if (start > 0) {
      for await (const chunk of handle.createReadStream({ start: 0, end: start - 1, autoClose: false })) hash.update(chunk);
      requireValue(hash.copy().digest('hex') === base?.sha256, 'Session history changed/lost an old branch entry');
    }
    const known = new Map(base?.known), parents = new Map(base?.parents);
    let header = base?.header ?? null, count = base?.count ?? 0, lastId = base?.lastId ?? null, lineNumber = (base?.count ?? -1) + 1;
    /** @type {RecordValue[]} */ const suffix = [];
    /** @type {Buffer[]} */ let pending = []; let pendingBytes = 0;
    /** @param {Buffer} line */
    const take = line => {
      lineNumber++;
      if (header === null) {
        try { header = validateHeader(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)), cwd); }
        catch (error) { throw error instanceof Error && /header|parent session/.test(error.message) ? error : new Error('Malformed session JSONL at line 1'); }
        return;
      }
      const entry = parseEntryLine(line, lineNumber, known);
      parents.set(String(entry.id), entry.parentId === null ? null : String(entry.parentId));
      count++; lastId = String(entry.id);
      suffix.push(entry);
      if (!base && !keepAll && suffix.length > TAIL_ENTRIES) suffix.shift();
    };
    if (stat.size > start) {
      for await (const raw of handle.createReadStream({ start, end: stat.size - 1, autoClose: false })) {
        const chunk = /** @type {Buffer} */ (raw);
        hash.update(chunk);
        let from = 0;
        for (let at = chunk.indexOf(10); at >= 0; at = chunk.indexOf(10, from)) {
          pending.push(chunk.subarray(from, at)); take(Buffer.concat(pending)); pending = []; pendingBytes = 0; from = at + 1;
        }
        if (from < chunk.length) { pending.push(chunk.subarray(from)); pendingBytes += chunk.length - from; }
        requireValue(pendingBytes <= 64 * 1024 * 1024, 'Session JSONL line exceeds 64 MiB');
      }
    }
    requireValue(pendingBytes === 0, 'Session JSONL ends with an incomplete line');
    requireValue(header !== null, 'Invalid bound V3 session header');
    const after = await handle.stat();
    requireValue(after.size === stat.size && after.mtimeMs === stat.mtimeMs, `File changed during validation: ${file}`);
    return { history: { header, bytes: stat.size, sha256: hash.digest('hex'), known, parents, count, lastId, tail: base ? [...base.tail, ...suffix].slice(-TAIL_ENTRIES) : suffix.slice(-TAIL_ENTRIES) }, suffix };
  } finally { await handle.close(); }
}
/** @param {unknown} value @returns {RuntimeState} */
function validateState(value) {
  const state = record(value, 'RPC state'), model = record(state.model, 'RPC model');
  requireValue(text(model.provider) && text(model.id) && text(state.sessionId) && text(state.sessionFile) && typeof state.thinkingLevel === 'string' && THINKING.has(state.thinkingLevel), 'Incomplete RPC state identity');
  requireValue(typeof state.isStreaming === 'boolean' && typeof state.isCompacting === 'boolean' && count(state.pendingMessageCount) && typeof state.autoCompactionEnabled === 'boolean', 'Invalid RPC idle state');
  return { model: { provider: model.provider, id: model.id }, thinkingLevel: state.thinkingLevel, sessionId: state.sessionId, sessionFile: state.sessionFile, isStreaming: state.isStreaming, isCompacting: state.isCompacting, pendingMessageCount: state.pendingMessageCount, autoCompactionEnabled: state.autoCompactionEnabled };
}
/** @param {unknown} value @returns {asserts value is Probe} */
function assertProbe(value) {
  const p = record(value, 'Bridge probe'), model = record(p.model, 'Bridge model'), caps = record(p.capabilities, 'Bridge capabilities'), native = record(p.native, 'Bridge native settings');
  requireValue(p.protocol === 1 && text(p.pairVersion) && count(p.pid) && p.pid > 0 && text(p.cwd) && typeof p.trusted === 'boolean', 'Invalid bridge protocol/process');
  requireValue(text(p.meshRoot) && path.isAbsolute(p.meshRoot), 'Invalid bridge mesh root');
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
  requireValue(text(native.agentDir) && typeof native.note === 'string' && typeof native.prewalkDisabled === 'boolean' && (native.prewalkAutoArm === undefined || typeof native.prewalkAutoArm === 'boolean') && typeof native.prewalkConfigured === 'boolean', 'Invalid native settings');
  requireValue((native.fabricShellHangMs === null || nonnegative(native.fabricShellHangMs)) && (native.fabricAgentMaxDepth === null || nonnegative(native.fabricAgentMaxDepth)), 'Invalid native runtime limits');
}

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
  /** @type {VerifiedHistory | null} */ #history = null;
  /** @type {string | null} */ #leaf = null;
  #observationBytes = 0; #dialogBytes = 0; #displayed = false; #wakeQueued = false; #appended = 0;
  #settledSequence = 0; #settledAt = 0; #serial = 0; #scope = 0; #revision = 0;
  #ready = false; #started = false; #provenUnspawned = false; #closing = false; #revokedStartup = false;
  #streaming = false; #unsettled = false; #retrying = false; #summaryRetrying = false; #overflowRecovery = false;
  #steering = 0; #followUp = 0; #idleKnown = false; #promptPending = false; #bridge = false; #rejecting = false; #reportSettling = false; #settledAborted = false;
  /** @type {Set<string>} */ #strayTools = new Set();
  #startupController = new AbortController();
  /** @type {Set<() => void>} */ #waiters = new Set();
  /** @param {RuntimeOptions} options */
  constructor(options) {
    requireValue(path.isAbsolute(options.sessionFile) && path.isAbsolute(options.cwd) && path.isAbsolute(options.entryPath), 'Runtime paths must be absolute');
    requireValue(count(options.ownerEpoch) && options.ownerEpoch > 0 && count(options.workerGeneration) && options.workerGeneration > 0, 'Invalid runtime generation');
    this.#options = Object.freeze({ ...options, rpcOptions: freeze(structuredClone(options.rpcOptions)), config: freeze(structuredClone(options.config)), spec: freeze(structuredClone(options.spec)) });
    this.#rpc = (options.rpcFactory || (opts => new PiRpc(opts)))(this.#options.rpcOptions);
    this.#rpc.on('event', event => { try { this.#observe(event); } catch (error) { this.#hold(error); } });
    this.#rpc.on('fault', error => this.#hold(error));
    this.#rpc.on('spawn', pid => { try { this.#options.onSpawn?.(pid); } catch { /* observational */ } });
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
  /** @param {Activation | null} activation */
  #assertCurrent(activation) { if (!this.#current(activation)) throw new Error('Runtime owner/activation fence is no longer current'); }
  /**
   * @param {string} command
   * @param {RecordValue} fields
   * @param {Activation | null} activation
   * @param {number} [timeoutMs]
   * @returns {Promise<unknown>}
   */
  async #send(command, fields, activation, timeoutMs) {
    this.#assertCurrent(activation);
    const signal = activation ? this.#activation?.controller.signal : this.#startupController.signal;
    const result = await this.#rpc.send(command, fields, boundedTimeout(timeoutMs, this.#requestTimeout()), { signal, guard: () => this.#current(activation), observeAfterWrite: true });
    this.#assertCurrent(activation); return result;
  }
  #requestTimeout() { return boundedTimeout(this.#options.config.runtime.requestTimeoutMs, 30000); }
  #startupTimeout() { return boundedTimeout(this.#options.config.runtime.startupTimeoutMs, 120000); }

  /** @returns {Promise<Readiness>} */
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
    /** @type {VerifiedHistory | null} */ let prelaunch = null;
    if (o.freshSession) {
      requireValue(o.sessionId === null, 'Fresh session cannot replace a retained session identity');
      this.#assertCurrent(null);
      const handle = await fs.open(o.sessionFile, 'wx', 0o600);
      await handle.close(); this.#assertCurrent(null);
    } else {
      prelaunch = (await scanHistory(o.sessionFile, o.cwd)).history; this.#assertCurrent(null);
      requireValue(o.sessionId === null || prelaunch.header.id === o.sessionId, 'Recorded session identity disagrees with header');
    }
    this.#history = prelaunch;
    requireValue(!this.#revokedStartup, 'Startup was revoked'); this.#assertCurrent(null);
    this.#started = true; this.#rpc.start();
    const initial = await this.#readState(null, this.#startupTimeout());
    if (prelaunch) requireValue(initial.sessionId === prelaunch.header.id, 'Pi replaced the retained session');
    const loaded = await scanHistory(o.sessionFile, o.cwd, prelaunch); this.#assertCurrent(null);
    const materialized = loaded.history;
    requireValue(materialized.header.id === initial.sessionId, 'Pi did not materialize the bound session header');
    if (prelaunch) requireValue(isDeepStrictEqual(materialized.header, prelaunch.header), 'Bound session header changed during launch');
    requireValue(materialized.count - (prelaunch?.count ?? 0) <= 4, 'Session history has an unexpected initialization suffix');
    this.#checkInitSuffix(prelaunch?.lastId ?? null, loaded.suffix, initial.thinkingLevel);
    await this.#compareTail(materialized, null); this.#assertCurrent(null);
    this.#history = materialized;
    await this.#send('set_model', { provider: o.spec.provider, modelId: o.spec.model }, null);
    const modelState = await this.#readState(null);
    // The model and effort setters append a short suffix between two full comparisons (the launch
    // tail above, the probe below), so these passes check only that suffix against the file.
    const afterModel = await this.#extend(materialized, null, false);
    this.#checkInitSuffix(materialized.lastId, afterModel.suffix, modelState.thinkingLevel);
    const levels = record(await this.#send('get_available_thinking_levels', {}, null), 'Thinking levels');
    requireValue(Array.isArray(levels.levels) && levels.levels.includes(o.spec.effort), `Unsupported worker effort: ${o.spec.effort}`);
    await this.#send('set_thinking_level', { level: o.spec.effort }, null);
    const state = await this.#readState(null); this.#exactState(state);
    const afterSetters = await this.#extend(afterModel.history, null, false);
    requireValue(afterSetters.history.count - materialized.count <= 4, 'Session history has an unexpected initialization suffix');
    this.#checkInitSuffix(afterModel.history.lastId, afterSetters.suffix, o.spec.effort); this.#history = afterSetters.history;
    await this.#waitIdle(this.#startupTimeout(), null); // separately scoped startup dialogs must finish first
    const readiness = await this.#bridgeCommand('probe', null);
    this.#assertCurrent(null); this.#ready = true; this.#wake(); return readiness;
  }
  /** @param {string | null} parentId @param {RecordValue[]} suffix @param {string} initialThinking */
  #checkInitSuffix(parentId, suffix, initialThinking) {
    requireValue(suffix.length <= 4, 'Session history has an unexpected initialization suffix');
    /** @type {unknown} */ let parent = parentId;
    for (const entry of suffix) {
      requireValue(entry.parentId === parent, 'Initialization suffix moved the active branch'); parent = entry.id;
      requireValue((entry.type === 'model_change' && entry.provider === this.#options.spec.provider && entry.modelId === this.#options.spec.model) || (entry.type === 'thinking_level_change' && entry.thinkingLevel === initialThinking), 'Unexpected session initialization entry');
    }
  }
  /**
   * @param {string | null} since
   * @param {Map<string, EntryFact>} known
   * @param {Map<string, string | null>} parents
   * @param {Activation | null} activation
   * @returns {Promise<RecordValue[]>}
   */
  async #entriesSince(since, known, parents, activation) {
    const data = record(await this.#send('get_entries', since === null ? {} : { since }, activation), 'RPC entries');
    requireValue(Array.isArray(data.entries), 'RPC entries missing');
    const entries = validateEntries(data.entries, known);
    const leafId = data.leafId === null ? null : /** @type {string} */ (data.leafId);
    requireValue(leafId === null || (text(leafId) && parents.has(leafId)), 'RPC history has a broken leaf');
    if (this.#leaf !== null) {
      requireValue(leafId !== null, 'Retained session lost its active leaf');
      requireValue(leafId === this.#leaf || descendsFrom(parents, this.#leaf, leafId), 'Retained session moved to an unexpected branch');
    }
    if (leafId !== null) this.#leaf = leafId;
    return entries;
  }
  /** @param {VerifiedHistory} verified @param {Activation | null} activation */
  async #compareTail(verified, activation) {
    if (verified.bytes <= FULL_COMPARE_BYTES) { await this.#compareAll(verified, activation); return; }
    const tail = verified.tail, full = verified.count <= tail.length;
    const expected = full ? tail : tail.slice(1);
    const known = new Map(verified.known); for (const entry of expected) known.delete(String(entry.id));
    const entries = await this.#entriesSince(full ? null : String(tail[0].id), known, verified.parents, activation);
    requireValue(isDeepStrictEqual(entries, expected), 'Pi history differs from prelaunch/materialized history');
  }
  /**
   * @param {VerifiedHistory} base @param {Activation | null} activation
   * @param {boolean | 'changed'} [full] compare the whole history too: always, never (a pass between two
   * full ones), or only when the file changed since `base` was fully verified
   */
  async #extend(base, activation, full = true) {
    const scanned = await scanHistory(this.#options.sessionFile, this.#options.cwd, base); this.#assertCurrent(activation);
    requireValue(isDeepStrictEqual(scanned.history.header, base.header), 'Bound session header changed/disappeared');
    const entries = await this.#entriesSince(base.lastId, base.known, scanned.history.parents, activation); this.#assertCurrent(activation);
    requireValue(isDeepStrictEqual(entries, scanned.suffix), 'RPC/persisted full session histories differ');
    const compare = full === true || (full === 'changed' && scanned.history.sha256 !== base.sha256);
    if (compare && scanned.history.bytes <= FULL_COMPARE_BYTES) await this.#compareAll(scanned.history, activation);
    return scanned;
  }
  /** @param {VerifiedHistory} verified @param {Activation | null} activation */
  async #compareAll(verified, activation) {
    const all = await scanHistory(this.#options.sessionFile, this.#options.cwd, null, true); this.#assertCurrent(activation);
    requireValue(all.history.sha256 === verified.sha256, 'Session history changed during verification');
    const entries = await this.#entriesSince(null, new Map(), all.history.parents, activation); this.#assertCurrent(activation);
    requireValue(entries.length === all.suffix.length, 'Session history lost entries or has an unexpected initialization suffix');
    for (let i = 0; i < entries.length; i++) requireValue(isDeepStrictEqual(entries[i], all.suffix[i]), 'Session history changed/lost an old branch entry');
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
      const sent = await this.#send('prompt', { message: `/pair-bridge ${operation}` }, activation, this.#startupTimeout());
      requireValue(promptTaken(sent, 'handled'), `Pi did not run /pair-bridge as a command (prompt ${disposition(sent)})`);
      const raw = await readBounded(file, PROBE_BYTES); this.#assertCurrent(activation);
      /** @type {unknown} */ const probe = JSON.parse(raw); assertProbe(probe);
      const o = this.#options;
      requireValue(probe.nonce === o.nonce && probe.workerId === o.workerId && probe.ownerSession === o.ownerSession && probe.ownerEpoch === o.ownerEpoch && probe.workerGeneration === o.workerGeneration && probe.pid === this.pid, 'Wrong/stale bridge identity');
      requireValue(probe.checkedAt >= began && probe.checkedAt <= Date.now(), 'Bridge did not produce a fresh probe');
      const state = await this.#readState(activation); this.#exactState(state);
      requireValue(probe.sessionId === state.sessionId && probe.sessionFile === state.sessionFile && probe.cwd === o.cwd && probe.model?.provider === o.spec.provider && probe.model.id === o.spec.model && probe.thinkingLevel === o.spec.effort, 'Bridge/RPC exact identity or selection mismatch');
      requireValue(this.#lifecycleIdle(), 'Agent activity occurred during bridge verification');
      await this.#verifyRetainedHistory(activation, operation); this.#assertCurrent(activation);
      const finalState = await this.#readState(activation); this.#exactState(finalState);
      requireValue(this.#lifecycleIdle() && isDeepStrictEqual(state, finalState), 'State changed while verifying bridge/history');
      checkReadiness(probe, finalState, o.config, o.spec, o.cwd, meshRootFor(o.dir));
      this.#assertCurrent(activation); this.#probe = freeze(probe); return { state, probe };
    } finally { this.#bridge = false; }
  }

  /** @param {Activation | null} activation @param {'probe' | 'load'} operation the load bridge follows the prepare probe's full check */
  async #verifyRetainedHistory(activation, operation) {
    for (let attempt = 1; ; attempt++) {
      requireValue(this.#history, 'Bound session history is unavailable');
      const appended = this.#appended;
      try {
        const extended = await this.#extend(this.#history, activation, operation === 'load' ? 'changed' : true); this.#assertCurrent(activation);
        this.#history = extended.history; return;
      } catch (error) {
        // An idle session still grows: a native cache-warm refresh appends its usage entry. If one
        // landed mid-check, check again; any other difference still fails. A state round trip first
        // delivers every entry_appended Pi emitted before it.
        if (attempt >= 3) throw error;
        await this.#readState(activation);
        if (this.#appended === appended) throw error;
      }
    }
  }

  /** @param {ActivationIdentity} identity @returns {Activation} */
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
      this.#assertCurrent(activation); this.#hold(error); throw error;
    }
  }
  /** @param {Activation} activation @param {string} message @param {() => boolean} [validity] @returns {Promise<void>} */
  async activate(activation, message, validity) {
    try {
      this.#assertCurrent(activation); const active = this.#activation;
      requireValue(active && active.prepared && !active.attempted && typeof message === 'string' && message.length > 0 && !message.trimStart().startsWith('/'), 'Activation is not prepared or work prompt is invalid');
      active.attempted = true; // single-use even if bridge or write fails; never resend
      await this.#bridgeCommand('load', activation); this.#assertCurrent(activation);
      const state = await this.#readState(activation); this.#exactState(state);
      requireValue(this.#lifecycleIdle(), 'Worker ceased to be idle before work');
      this.#promptPending = true;
      const busy = () => this.#compactions.size > 0 || this.#summaryRetrying || this.#retrying;
      const sent = await this.#rpc.send('prompt', { message }, Math.max(this.#requestTimeout(), this.#startupTimeout()), { signal: active.controller.signal, observeAfterWrite: true, extend: busy, maxWaitMs: 30 * 60_000, guard: () => {
        if (!this.#current(activation) || !this.#lifecycleIdle() || (validity !== undefined && !validity())) return false;
        this.#unsettled = true; this.#idleKnown = false; this.#revision++; return true;
      } });
      this.#assertCurrent(activation);
      // No run follows a prompt an inherited extension's input handler or command consumed, so no agent_settled either.
      if (!promptTaken(sent, 'started')) throw new RpcUncertainError(`The worker's Pi did not start a run for the work prompt (prompt ${disposition(sent)}); an inherited extension probably consumed it. List it in runtime.excludeExtensions.`);
      active.accepted = true;
    } catch (error) {
      this.#assertCurrent(activation); this.#hold(error); throw error;
    }
    finally { this.#promptPending = false; this.#wake(); }
  }
  /** @param {string} reason */
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
      settledSequence: this.settledSequence, settledAt: this.settledAt, settledAborted: this.#settledAborted, fault: this.fault, exit: this.exit });
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
  /** @param {RecordValue} event */
  #observe(event) {
    const type = String(event.type);
    if (!['message_update', 'tool_execution_update', 'extension_ui_request', 'entry_appended', 'session_info_changed'].includes(type)) this.#revision++;
    const activity = /^(agent_|turn_|message_|tool_execution_|compaction_|auto_retry_|summarization_retry_)/.test(type);
    if (type === 'extension_error') {
      // With runtime.mcp off (--no-mcp), Pi reports an inherited extension's MCP server registration as an
      // error; that registration is all it refused, so warn instead of holding the worker.
      if (event.event === 'register_mcp_server' && this.#options.config.runtime?.mcp === false) { this.#enqueue({ type: 'notify', at: Date.now(), error: `Worker MCP is off (runtime.mcp): an extension's MCP server was not registered: ${reasonOf(event.error)}`, notifyType: 'warning' }); return; }
      this.#hold(new RpcUncertainError(`Worker extension_error: ${reasonOf(event.error)}`)); return;
    }
    const startsWork = ['agent_start', 'turn_start', 'tool_execution_start', 'compaction_start', 'auto_retry_start', 'summarization_retry_scheduled', 'summarization_retry_attempt_start'].includes(type);
    const unauthorizedActivity = (activity && this.#bridge) || (startsWork && !this.#closing && !this.#abortPromise && (!this.#activation?.attempted || this.#activation.settled || !this.#current(this.#activation.token)));
    const activityError = () => this.#rejectActivity(type, event);
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
        this.#settledAborted = event.aborted === true; // Pi 1.1+: the run ended by abort rather than on its own
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
        this.#tools.delete(event.toolCallId); observation.toolCallId = event.toolCallId;
        if (this.#strayTools.delete(event.toolCallId)) {
          const content = record(event.result, 'Tool result').content;
          const first = Array.isArray(content) ? content.find(block => isRpcRecord(block) && block.type === 'text') : null;
          const message = isRpcRecord(first) && typeof first.text === 'string' ? first.text : '';
          if (!(event.isError === true && /^PAIR_WAIT\b/.test(message))) this.#hold(new RpcUncertainError(`Worker ran tool ${String(event.toolName)} outside a current activation`));
        }
        break;
      }
      case 'message_end': {
        const message = record(event.message, 'Message event');
        if (message.role !== 'assistant') return;
        observation.message = { role: 'assistant', usage: usageOf(message.usage) }; break;
      }
      case 'turn_start': this.#idleKnown = false; break;
      case 'entry_appended': this.#appended++; return;
      case 'thinking_level_changed': if (this.ready && event.level !== this.#options.spec.effort) this.#hold(new Error('Worker thinking level drifted')); return;
      default: if (unauthorizedActivity) activityError(); return; // deltas/args/results never retained
    }
    if (unauthorizedActivity) activityError();
    this.#enqueue(observation);
  }

  /** @param {string} type @param {RecordValue} event */
  #rejectActivity(type, event) {
    if (this.#bridge) { this.#hold(new RpcUncertainError('Agent activity during bridge command; no work prompt authorized')); return; }
    if (type === 'tool_execution_start' && text(event.toolCallId)) this.#strayTools.add(event.toolCallId);
    // A run that goes on after its report (the program did not return it) is the worker's own; abort it quietly.
    if (!this.#reportSettling) this.#enqueue({ type: 'notify', at: Date.now(), error: `Worker ${type.replace(/_/g, ' ')} began without a Pair lease (probably another extension); Pair aborted it.`, notifyType: 'warning' });
    if (this.#rejecting || this.closed) return;
    this.#rejecting = true;
    const guard = () => this.#current(null, true);
    void (async () => {
      try {
        await this.#rpc.send('clear_queue', {}, this.#requestTimeout(), { control: true, guard });
        await this.#rpc.send('abort', {}, this.#requestTimeout(), { control: true, guard });
      } catch (error) { this.#hold(error); }
      finally { this.#rejecting = false; this.#wake(); }
    })();
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
      let finishWait = () => {};
      const changed = new Promise(resolve => {
        const done = () => { clearTimeout(timer); this.#waiters.delete(done); resolve(undefined); };
        const timer = setTimeout(done, Math.max(1, deadline - Date.now())); this.#waiters.add(done);
        finishWait = done;
      });
      try {
        if (!this.#streaming && !this.#unsettled && !this.#compactions.size && !this.#retrying && !this.#summaryRetrying && !this.permission) {
          const state = await this.#readState(activation, Math.max(1, deadline - Date.now())); this.#exactState(state, false);
          if (this.#lifecycleIdle() && !this.#promptPending && !this.#bridge) return;
        }
        await changed;
      } finally { finishWait(); }
    }
    throw new RpcUncertainError('Worker did not reach verified true idle before deadline');
  }
  /**
   * After an accepted report: pair_report's `terminate` ends the worker's run, so give it `graceMs` to
   * settle on its own (usage recorded, no cancelled program) and abort only if it has not. The latched
   * gate refuses tools meanwhile, and a new turn is aborted at turn_start.
   * @param {string} reason @param {number} graceMs @returns {Promise<void>}
   */
  async settleOrAbort(reason, graceMs) {
    this.revoke(reason); this.#reportSettling = true;
    try { await this.#waitIdle(graceMs, null); } catch { await this.abortCurrent(reason); }
    finally { this.#reportSettling = false; }
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


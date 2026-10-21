import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { atomicJSON, bounded, digest, mkdirPrivate, plain, PROTOCOL, readJSON, signalGroup, uid, VERSION } from './util.js';
import { assertReportSize } from './schema.js';
import { validateAuthority, validateLatch, validateReportEnvelope, validateReportPayload } from './contracts.js';
import { meshRootFor } from './native.js';
import { normalizeActivity, pushActivity } from './timeline.js';
import { classifyProviderError } from './provider.js';

/**
 * A Pair worker backed by low (https://github.com/asx8678/low) instead of a Pi RPC process.
 *
 * One `low --serve` holds the worker's conversation; each lease is one `low --send --json` task, and its JSON result
 * becomes the worker's report, written to the same latch and inbox a Pi worker's pair_report writes. Steers and aborts
 * go to the running task through `low --send "/steer <text>"` and `low --send /abort`. low has no extension API, so
 * the lease gate is structural: low only works while Pair has a task of it in flight.
 *
 * The public surface is PiRuntime's, so the controller drives either one.
 */

/** @typedef {import('./actor-runtime.js').RuntimeOptions} PiRuntimeOptions */
/** @typedef {import('./actor-runtime.js').ActivationIdentity} ActivationIdentity */
/** @typedef {import('./actor-runtime.js').Activation} Activation */
/** @typedef {import('./actor-runtime.js').Readiness} Readiness */
/** @typedef {import('./actor-runtime.js').RuntimeObservation} RuntimeObservation */
/** @typedef {import('./rpc.js').RpcExit} RpcExit */
/** @typedef {{command: string, args: string[], home?: string}} LowOptions */
/**
 * Extra options on top of PiRuntime's. `now` and `heartbeatMs` let a test drive the runtime's time rules (the
 * status-file heartbeat, the age of a run) from a fake clock instead of real waits, and `beforePublish` lets a test
 * step into the window between the report's latch and its inbox write. Production passes none of them.
 * @typedef {Omit<PiRuntimeOptions, 'rpcOptions' | 'rpcFactory' | 'isCurrent'> & {low: LowOptions, isCurrent: (runtime: LowRuntime, activation: Activation | null) => boolean, spawnLow?: typeof spawn, now?: () => number, heartbeatMs?: number, beforePublish?: () => void | Promise<void>}} LowRuntimeOptions
 */
/** @typedef {{token: Activation, controller: AbortController, prepared: boolean, attempted: boolean, accepted: boolean, settled: boolean}} ActivationState */
/** @typedef {{status?: unknown, exit?: unknown, error?: unknown, verdict?: unknown, good?: unknown, answer?: unknown, question?: unknown, criteria?: unknown, check?: unknown, changes?: unknown, limit?: unknown, tokens?: unknown, id?: unknown, claims?: unknown, plan?: unknown, undo?: unknown, steers?: unknown}} LowResult */
/**
 * What the running low task is doing, from the status file its server keeps in the inbox.
 * @typedef {{activity: string, step: number, running: {what: string, forMs: number} | null, intent: string | null, plan: {steps: string[], done: number[]} | null,
 *   requests: number, tokens: {prompt: number, cached: number, out: number}, steers: {pending: number, taken: number}, taskMs: number, movedAt: number | null, at: number}} LowProgress
 */

/** low's efforts; Pi's off and minimal have no counterpart, so they run as low. */
const LOW_EFFORTS = { off: 'low', minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' };
const OBS_COUNT = 256, POLL_MS = 250, WATCH_MS = 2000, STDERR_TAIL = 32000, TAIL_BYTES = 256 * 1024;
/** How old the status file's heartbeat (rewritten every second while low --serve runs) may be for a ping to count it as answering. */
const BEAT_MS = 30000;
/**
 * Whether a status-file heartbeat still says the server is alive.
 *
 * Bounded on both sides on purpose: a timestamp in the future (a host clock that jumped, a file copied between
 * machines) would otherwise read as fresh for ever, and a frozen server is exactly what this rule exists to
 * catch. Pure, so its edges are tested without a process or a wait.
 * @param {number} at the heartbeat's own timestamp @param {number} now @param {number} [window] @returns {boolean}
 */
export function heartbeatFresh(at, now, window = BEAT_MS) {
  if (!Number.isFinite(at) || !Number.isFinite(now) || at <= 0) return false;
  const age = now - at;
  return age >= 0 && age < window;
}
/** How long a control `--send` (a steer, an abort, /stop) may take: it only drops a file into the inbox. */
const CONTROL_MS = 15000;
/** What the controller's work order says that a low worker does differently: there is no pair_report tool. */
export const LOW_WORKER_NOTE = `LOW WORKER PROTOCOL
You are the Pair worker, driven through low. Ignore any instruction above to use Fabric, Fovea or pair_report: none of them exist here.
Do only the authorized step. Later steps are listed by title so you know where the work is going; Main authorizes each one after reviewing this step, so do not start them, however small they look. When the authorized step is done, end the turn with your report as the final answer: what you changed and why, the affected paths, and which checks you ran with their honest results.
If you need a decision from Main, ask it as a question and stop. Do not commit, push or deploy.`;

/** @param {unknown} condition @param {string} message @returns {asserts condition} */
function requireValue(condition, message) { if (!condition) throw new Error(message); }
/** @param {unknown} error */
function reasonOf(error) { return (error instanceof Error ? error.message : String(error)).slice(0, 4000); }
/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** @param {unknown} value @returns {string} */
const str = value => typeof value === 'string' ? value : '';
/** @param {unknown} value @returns {number} */
const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
/** @param {unknown} value @returns {string[]} */
const strings = value => Array.isArray(value) ? value.map(str).filter(Boolean) : [];

/** low's plan as one line: done steps ticked, the rest dotted. @param {unknown} plan */
function planLine(plan) {
  const steps = plain(plan) ? strings(plan.steps) : [], done = plain(plan) && Array.isArray(plan.done) ? plan.done : [];
  if (!steps.length) return '';
  const ticked = steps.map((step, i) => `${done.includes(i + 1) ? '✓' : '·'} ${step}`);
  return `low's plan (${steps.filter((_, i) => done.includes(i + 1)).length}/${steps.length} done): ${ticked.join('; ')}`;
}
/**
 * The second look low takes at a report no check covered: its verdict on the report's claims, as a check.
 * @param {unknown} claims @param {boolean} brief only the counts
 * @returns {{name: string, result: 'pass' | 'fail' | 'not_run', detail: string} | null}
 */
function claimsCheck(claims, brief) {
  if (!plain(claims)) return null;
  const held = strings(claims.held), contradicted = strings(claims.contradicted), uncertain = strings(claims.uncertain);
  if (!held.length && !contradicted.length && !uncertain.length) return null;
  const counts = `${held.length} held, ${contradicted.length} contradicted, ${uncertain.length} uncertain`;
  const list = (/** @type {string} */ label, /** @type {string[]} */ items) => items.length ? [`${label}: ${items.join('; ')}`] : [];
  const detail = brief ? counts : [counts, ...list('contradicted', contradicted), ...list('uncertain', uncertain), ...list('held', held)].join(' — ');
  return { name: 'low second look', result: contradicted.length ? 'fail' : held.length ? 'pass' : 'not_run', detail: bounded(detail, 2000) };
}

/**
 * low's own view of the goal, as Pair's acceptance claims. low states its criteria as one sentence and its second look
 * as what held, what was contradicted and what stayed uncertain; each becomes one {criterion, met, evidence} entry, so
 * Main reads a verdict per criterion instead of a paragraph.
 * @param {LowResult} result @param {'pass' | 'fail' | 'not_run'} outcome
 * @returns {{criterion: string, met: boolean, evidence?: string}[]}
 */
function acceptanceClaims(result, outcome) {
  /** @type {{criterion: string, met: boolean, evidence?: string}[]} */
  const claims = [];
  const criteria = str(result.criteria).trim(), check = str(result.check).trim();
  if (criteria) claims.push({ criterion: bounded(criteria, 200), met: outcome === 'pass', ...(check && check !== '-' ? { evidence: bounded(`low's check: ${check}`, 500) } : {}) });
  if (plain(result.claims)) {
    const groups = [['held', true, 'held'], ['contradicted', false, 'contradicted'], ['uncertain', false, 'uncertain']];
    for (const [key, met, label] of /** @type {[string, boolean, string][]} */ (groups)) {
      for (const entry of strings(/** @type {Record<string, unknown>} */ (result.claims)[key])) {
        if (claims.length >= 32) break;
        claims.push({ criterion: bounded(entry, 200), met, evidence: `low second look: ${label}` });
      }
    }
  }
  return claims.slice(0, 32);
}
/** The low home whose `.low/sessions` holds the worker's conversations. @param {LowOptions} low */
export function lowHome(low) { return low.home || os.homedir(); }
/** @param {LowOptions} low */
export function lowSessions(low) { return path.join(lowHome(low), '.low', 'sessions'); }

/**
 * A low result as a Pair report payload for the step the authority names. The verdict is low's evidence, not Main's:
 * the payload carries it as a check, and Main still reviews the code.
 * @param {LowResult} result
 * @param {NonNullable<import('./contracts.js').Authority['task']>} task
 * @returns {import('./contracts.js').ReportPayload}
 */
export function lowReportPayload(result, task) {
  const step = task.steps[task.stepIndex];
  const exit = typeof result.exit === 'number' ? result.exit : 3;
  const finalStep = task.policy.mode === 'final-only' || task.stepIndex === task.steps.length - 1;
  const answer = str(result.answer).trim(), question = str(result.question).trim(), error = str(result.error).trim();
  const changedFiles = (Array.isArray(result.changes) ? result.changes : [])
    .map(change => str(change).replace(/\s+\+\d+\s+[−-]\d+$/u, '').replace(/ \((?:new|deleted|binary)\)$/, '').trim()).filter(Boolean).slice(0, 200).map(file => file.slice(0, 1024));
  const verdict = str(result.verdict) || str(result.status) || 'unknown';
  const outcome = exit === 0 && result.good !== false ? (verdict === 'NO CHECK' || verdict === 'NO CHANGES' ? 'not_run' : 'pass') : exit === 1 ? 'fail' : 'not_run';
  const detail = [verdict, str(result.check), str(result.limit)].filter(part => part && part !== '-').join(' — ');
  const steers = plain(result.steers) ? { taken: count(result.steers.taken), dropped: count(result.steers.dropped) } : null;
  const steerLine = steers?.dropped ? `${steers.dropped} steer${steers.dropped === 1 ? '' : 's'} from Main came after low's last model request and ${steers.dropped === 1 ? 'was' : 'were'} not taken (${steers.taken} taken); send ${steers.dropped === 1 ? 'it' : 'them'} again if still needed.` : '';
  /**
   * The payload with as much of low's extra evidence as `level` keeps: 0 all of it, 1 without the plan and the undo
   * command, 2 also with the second look as counts only.
   * @param {number} level
   */
  const build = level => {
    const checks = [{ name: 'low verdict', result: outcome, detail: bounded(detail || verdict, 2000) }];
    const claims = exit === 4 ? null : claimsCheck(result.claims, level >= 2);
    if (claims) checks.push(claims);
    /** @type {Record<string, unknown>} */
    let payload;
    if (exit === 4 && question) payload = { kind: 'question', question: bounded(question, 4000), summary: answer || question };
    else if (exit === 0 || exit === 1) payload = { kind: finalStep ? 'final_review' : 'checkpoint', summary: answer || `low finished with ${verdict}.`, stepComplete: exit === 0, checks };
    else payload = { kind: 'blocked', summary: error || answer || `low stopped (${str(result.status) || `exit ${exit}`}).`, checks };
    const decisions = [str(result.criteria) && `Done means: ${str(result.criteria)}`, steerLine,
      ...(level >= 1 ? [] : [planLine(result.plan), str(result.undo) && `Undo low's changes: ${str(result.undo)}`])].filter(Boolean).map(line => bounded(line, 2000));
    if (decisions.length) payload.decisions = decisions;
    // The step's acceptance criteria with low's verdict on each. Present at every level: it is what Main reviews.
    const acceptance = exit === 4 ? [] : acceptanceClaims(result, outcome);
    return { taskId: task.id, stepId: step.id, ...payload, ...(changedFiles.length ? { changedFiles } : {}), ...(acceptance.length ? { acceptance } : {}) };
  };
  /** @param {Record<string, unknown>} payload @param {number} limit */
  const fit = (payload, limit) => {
    const fitted = { ...payload, summary: bounded(str(payload.summary), limit) || 'low gave no summary.' };
    try { assertReportSize(fitted, task.policy.summaryDetail, task.limits); return validateReportPayload(fitted); } catch { return null; }
  };
  // low's extras go before the answer does: the whole summary with fewer extras, then the summary shrunk with the fewest.
  for (const level of [0, 1, 2]) { const fitted = fit(build(level), 8000); if (fitted) return fitted; }
  for (let limit = 4000; limit >= 200; limit = Math.floor(limit / 2)) { const fitted = fit(build(2), limit); if (fitted) return fitted; }
  // Still too large: the file list or the criteria are. A short blocked report keeps the worker and its session.
  const fallback = { taskId: task.id, stepId: step.id, kind: 'blocked', summary: bounded(`low's report was too large for the summary policy (${changedFiles.length} changed files); inspect the workspace. ${answer}`, 1000) };
  assertReportSize(fallback, task.policy.summaryDetail, task.limits);
  return validateReportPayload(fallback);
}

export class LowRuntime {
  /** @type {Readonly<LowRuntimeOptions>} */ #options;
  /** @type {import('node:child_process').ChildProcess | null} */ #server = null;
  /** @type {import('node:child_process').ChildProcess | null} */ #task = null;
  /** @type {Promise<Readiness> | null} */ #startPromise = null;
  /** @type {Promise<void> | null} */ #stopPromise = null;
  /** @type {Promise<void> | null} */ #abortPromise = null;
  /** @type {ActivationState | null} */ #activation = null;
  /** @type {Readiness | null} */ #readiness = null;
  /** @type {RuntimeObservation[]} */ #observations = [];
  /** @type {Set<() => void>} */ #waiters = new Set();
  /** @type {string | null} */ #fault = null;
  /** @type {RpcExit | null} */ #exit = null;
  /** @type {string | null} */ #sessionFile = null;
  /** @type {{name: string, startedAt: number} | null} */ #tool = null;
  /** @type {{message: string, at: number, source: 'assistant' | 'retry' | 'compaction'} | null} */ #lastError = null;
  /** @type {ReturnType<typeof setInterval> | undefined} */ #watch;
  /** @type {LowProgress | null} */ #progress = null;
  /** The last context size low reported, in tokens: its prompt tokens are what the session holds. @type {number | null} */ #contextTokens = null;
  /** @type {import('./timeline.js').ActivityEvent[]} */ #activity = [];
  /** Whether this low writes a status file; an older one does not, and its session log's growth is all there is. */
  #statusSeen = false; #beatAt = 0; #toolStep = 0;
  #stderr = ''; #ready = false; #started = false; #closing = false; #wakeQueued = false;
  #settledSequence = 0; #settledAt = 0; #settledAborted = false; #serial = 0; #lastEventAt = 0; #watchedBytes = 0;
  /** @param {LowRuntimeOptions} options */
  constructor(options) {
    requireValue(path.isAbsolute(options.cwd) && path.isAbsolute(options.dir), 'Runtime paths must be absolute');
    requireValue(Number.isSafeInteger(options.ownerEpoch) && options.ownerEpoch > 0 && Number.isSafeInteger(options.workerGeneration) && options.workerGeneration > 0, 'Invalid runtime generation');
    this.#options = Object.freeze({ ...options, low: Object.freeze({ ...options.low, args: [...options.low.args] }) });
  }
  get pid() { return this.#server?.pid; }
  get closed() { return this.#exit !== null; }
  get nonce() { return this.#options.nonce; }
  get ownerEpoch() { return this.#options.ownerEpoch; }
  get workerGeneration() { return this.#options.workerGeneration; }
  get dir() { return this.#options.dir; }
  get ready() { return this.#ready && !this.#fault && !this.closed && !this.#closing && this.#options.isCurrent(this, null); }
  get settledSequence() { return this.#settledSequence; }
  get settledAt() { return this.#settledAt; }
  get fault() { return this.#fault; }
  get exit() { return this.#exit; }
  get permission() { return false; }
  get currentTool() { return this.#tool?.name || null; }
  get lastError() { return this.#lastError; }
  /** What the running task is doing, as low's last status said; null between tasks. */
  get progress() { return this.#progress; }
  /**
   * The last measured size of this worker's context, in tokens, or null when low has not reported one. low keeps its
   * own context inside a session and writes the numbers in its status file; between tasks the last task's totals are
   * the best measurement there is. The controller reads this at dispatch to decide whether the next task should
   * start in the session that is already there (see PairController.prepareContext).
   * @returns {number | null}
   */
  contextTokens() { return this.#contextTokens; }
  /**
   * low cannot be told to summarise its own session from outside: context lives inside the session it manages, and
   * the CLI has no compaction command. The controller therefore starts a fresh session instead of compacting for a
   * low worker (see PairController.prepareContext), which is the same outcome by the route this backend has.
   * @param {string} _instructions
   * @returns {Promise<void>}
   */
  async compactContext(_instructions) { throw new Error('UNSUPPORTED: low manages context inside its own session; Pair starts a fresh session instead of compacting it'); }
  /** The clock the heartbeat rule reads. Injecting it is what makes the silence rules testable without waiting. */
  #now() { return (this.#options.now || Date.now)(); }
  /** The low session id: the session log's file name without `.jsonl`. */
  get sessionId() { return this.#sessionFile ? path.basename(this.#sessionFile, '.jsonl') : null; }

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
    if (this.#started && !this.closed) void this.abortAndStop(this.#fault).catch(() => this.#wake());
  }
  /** @param {Activation | null} activation @param {boolean} [control] */
  #current(activation, control = false) {
    if (this.closed || (!control && (this.#closing || this.#fault))) return false;
    if (!this.#options.isCurrent(this, activation)) return false;
    return !activation || (this.#activation?.token === activation && !this.#activation.controller.signal.aborted);
  }
  /** @param {Activation | null} activation */
  #assertCurrent(activation) { requireValue(this.#current(activation), 'Runtime owner/activation fence is no longer current'); }
  #requestTimeout() { const v = this.#options.config.runtime.requestTimeoutMs; return v > 0 ? v : 30000; }
  #startupTimeout() { const v = this.#options.config.runtime.startupTimeoutMs; return v > 0 ? v : 120000; }
  /** @param {RuntimeObservation} event */
  #enqueue(event) {
    if (this.#observations.length >= OBS_COUNT) this.#observations.shift();
    this.#observations.push(event); this.#wake();
  }
  /** Whether the session the controller retained is a low session this runtime can resume. */
  async #retained() {
    const file = this.#options.sessionFile, sessions = lowSessions(this.#options.low);
    if (this.#options.freshSession || path.dirname(file) !== sessions || !file.endsWith('.jsonl')) return null;
    try { await fs.access(file); return file; } catch { return null; }
  }

  /** @returns {Promise<Readiness>} */
  ensureStarted() {
    if (!this.#startPromise) {
      this.#startPromise = this.#start().catch(error => {
        if (!this.#started) this.#exit = { code: null, signal: null, expected: false, error: error instanceof Error ? error : new Error(reasonOf(error)), spawnFailed: true };
        this.#hold(error); throw error;
      });
    }
    return this.#startPromise;
  }
  /** @returns {Promise<Readiness>} */
  async #start() {
    this.#assertCurrent(null);
    const o = this.#options, spec = o.spec, retained = await this.#retained();
    const effort = LOW_EFFORTS[/** @type {keyof typeof LOW_EFFORTS} */ (spec.effort)] || 'high';
    const args = [...o.low.args, '--serve', '-m', `${spec.provider}:${spec.model}`, '--effort', effort, ...(retained ? ['--session', path.basename(retained, '.jsonl')] : [])];
    await mkdirPrivate(o.dir); this.#assertCurrent(null);
    const child = this.#server = (o.spawnLow || spawn)(o.low.command, args, { cwd: o.cwd, env: { ...process.env, ...(o.low.home ? { HOME: o.low.home } : {}) },
      stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32', windowsHide: true, shell: false });
    this.#started = true;
    child.stderr?.on('data', (/** @type {Buffer} */ chunk) => { this.#stderr = (this.#stderr + chunk.toString()).slice(-STDERR_TAIL); this.#lastEventAt = Date.now(); });
    child.once('error', error => this.#closed(null, null, error));
    child.once('close', (code, signal) => this.#closed(code, signal));
    if (child.pid) o.onSpawn?.(child.pid);
    const deadline = Date.now() + this.#startupTimeout();
    for (;;) {
      requireValue(!this.closed, `low --serve exited during startup: ${bounded(this.#stderr.trim(), 2000) || 'no output'}`);
      this.#assertCurrent(null);
      const file = retained || /\[session ([^\]\n]+\.jsonl)\]/.exec(this.#stderr)?.[1] || null;
      if (file && await fs.stat(file.replace(/\.jsonl$/, '.inbox')).then(s => s.isDirectory(), () => false)) { this.#sessionFile = file; break; }
      requireValue(Date.now() < deadline, 'low --serve did not start serving before the startup deadline');
      await sleep(POLL_MS);
    }
    this.#assertCurrent(null);
    const sessionId = /** @type {string} */ (this.sessionId), sessionFile = /** @type {string} */ (this.#sessionFile), now = Date.now();
    /** @type {import('./contracts.js').StoredProbeV1} */
    const probe = /** @type {any} */ ({ protocol: 1, pairVersion: VERSION, pid: /** @type {number} */ (child.pid), cwd: o.cwd, trusted: true, sessionId, sessionFile, meshRoot: meshRootFor(o.dir),
      model: { provider: spec.provider, id: spec.model, contextWindow: 0 }, thinkingLevel: spec.effort, capabilities: { fabric: false, fovea: false, pairReport: true },
      versions: {}, sourcePaths: [], context: null,
      native: { agentDir: path.join(lowHome(o.low), '.low'), note: `low worker (${o.low.command})`, piCompaction: null, cacheWarming: 'off', fabricCompaction: null, fabricShellHangMs: null, fabricAgentMaxDepth: null, prewalkDisabled: true, prewalkConfigured: false },
      checkedAt: now, scope: 'low', nonce: o.nonce, workerId: o.workerId, ownerSession: o.ownerSession, ownerEpoch: o.ownerEpoch, workerGeneration: o.workerGeneration });
    this.#readiness = Object.freeze({ probe: Object.freeze(probe), state: Object.freeze({ model: { provider: spec.provider, id: spec.model }, thinkingLevel: spec.effort, sessionId, sessionFile,
      isStreaming: false, isCompacting: false, pendingMessageCount: 0, autoCompactionEnabled: true }) });
    this.#watchedBytes = await fs.stat(sessionFile).then(s => s.size, () => 0);
    // A restarted worker keeps its list, as a Pi worker's session_start does.
    this.#activity = normalizeActivity(await readJSON(path.join(o.dir, 'activity.json'), null, 64 * 1024).catch(() => null));
    this.#ready = true; this.#lastEventAt = now; this.#wake();
    return this.#readiness;
  }
  /** @param {number | null} code @param {NodeJS.Signals | null} signal @param {Error} [error] */
  #closed(code, signal, error) {
    if (this.#exit) return;
    const expected = this.#closing;
    this.#exit = { code, signal, expected, error: expected ? null : error || new Error(`low --serve exited (${code ?? signal ?? 'unknown'}): ${bounded(this.#stderr.trim(), 1000)}`) };
    this.#ready = false; clearInterval(this.#watch); this.#watch = undefined;
    if (!expected && !this.#fault) this.#fault = reasonOf(this.#exit.error);
    this.revoke('low --serve exited'); this.#wake();
  }

  /** @param {ActivationIdentity} identity @returns {Activation} */
  reserveActivation(identity) {
    this.#assertCurrent(null);
    requireValue(identity.workerGeneration === this.workerGeneration && identity.taskId && identity.attemptId && identity.leaseId, 'Invalid activation identity');
    requireValue(!this.#activation || this.#activation.settled, 'An activation is already reserved/awaiting acceptance; revoke before replacing it');
    requireValue(!this.#task, 'A low task is still running; abort it before reserving another');
    this.#activation?.controller.abort();
    const token = Object.freeze({ ...identity, serial: ++this.#serial });
    this.#activation = { token, controller: new AbortController(), prepared: false, attempted: false, accepted: false, settled: false };
    this.#wake(); return token;
  }
  /** @param {Activation} activation */
  releaseActivation(activation) {
    const active = this.#activation;
    if (!active || active.token !== activation || active.prepared || active.attempted) return;
    active.controller.abort('Activation released'); this.#activation = null; this.#wake();
  }
  /** @param {Activation} activation */
  activationCurrent(activation) { return this.#current(activation); }
  /** @param {Activation} activation @returns {Promise<Readiness>} */
  async prepareActivation(activation) {
    try {
      this.#assertCurrent(activation); const readiness = await this.ensureStarted(); this.#assertCurrent(activation);
      await this.waitIdle(this.#requestTimeout()); this.#assertCurrent(activation);
      requireValue(this.#activation && !this.#activation.attempted, 'Activation already attempted');
      this.#activation.prepared = true; return readiness;
    } catch (error) { this.#assertCurrent(activation); this.#hold(error); throw error; }
  }
  /**
   * Send the work as one low task. The task runs on in the background; its result becomes the report.
   * @param {Activation} activation @param {string} message @param {() => boolean} [validity] @returns {Promise<void>}
   */
  async activate(activation, message, validity) {
    try {
      this.#assertCurrent(activation); const active = this.#activation;
      requireValue(active && active.prepared && !active.attempted && typeof message === 'string' && message.length > 0 && !message.trimStart().startsWith('/'), 'Activation is not prepared or work prompt is invalid');
      active.attempted = true;
      requireValue(!this.#task && this.ready, 'Worker ceased to be idle before work');
      requireValue(validity === undefined || validity(), 'Activation validity lapsed before the work was sent');
      const authority = validateAuthority(await readJSON(path.join(this.dir, 'authority.json'), null), { ownerSession: this.#options.ownerSession, ownerEpoch: this.ownerEpoch, workerId: this.#options.workerId, workerGeneration: this.workerGeneration });
      this.#assertCurrent(activation);
      requireValue(authority.phase === 'running' && authority.task && authority.task.id === activation.taskId && authority.leaseId === activation.leaseId && authority.attemptId === activation.attemptId, 'Pair authority does not grant this activation');
      // Per-step effort is a Pi-only control: low takes --effort when its server starts and refuses any other option
      // on --send, so the controller refuses such a step before reaching here (never silently runs it at another level).
      const stepEffort = authority.task.steps[authority.task.stepIndex]?.effort;
      requireValue(stepEffort === undefined || stepEffort === this.#options.spec.effort, `UNSUPPORTED_PROFILE: a low worker cannot change effort per step (this step asks for ${String(stepEffort)}, the worker runs at ${this.#options.spec.effort})`);
      const child = this.#send(['--json', `${message}\n\n${LOW_WORKER_NOTE}`]);
      this.#task = child;
      active.accepted = true; this.#lastError = null; this.#settledAborted = false; this.#lastEventAt = Date.now(); this.#progress = null; this.#toolStep = 0;
      this.#enqueue({ type: 'turn_start', at: Date.now() });
      this.#startWatch();
      void this.#finish(child, active, authority).catch(error => this.#hold(error));
    } catch (error) { this.#assertCurrent(activation); this.#hold(error); throw error; }
    finally { this.#wake(); }
  }
  /** @param {string[]} args a `low --send` for the served session */
  #send(args) {
    const o = this.#options;
    requireValue(this.sessionId, 'low --serve has no session yet');
    // low refuses --send with any other option (--protect, -m, …), so the configured args go to --serve alone.
    return (o.spawnLow || spawn)(o.low.command, ['--send', '--session', /** @type {string} */ (this.sessionId), ...args],
      { cwd: o.cwd, env: { ...process.env, ...(o.low.home ? { HOME: o.low.home } : {}) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
  }
  /** @param {import('node:child_process').ChildProcess} child @returns {Promise<{code: number | null, stdout: string, stderr: string}>} */
  #collect(child) {
    return new Promise(resolve => {
      let stdout = '', stderr = '';
      child.stdout?.on('data', (/** @type {Buffer} */ chunk) => { stdout = (stdout + chunk.toString()).slice(-4 * 1024 * 1024); });
      child.stderr?.on('data', (/** @type {Buffer} */ chunk) => { stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL); });
      child.once('error', error => resolve({ code: null, stdout, stderr: `${stderr}\n${error.message}` }));
      child.once('close', code => resolve({ code, stdout, stderr }));
    });
  }
  /**
   * Turn the task's result into the worker's report, then settle. A task an abort or a revocation ended has no
   * report: the controller decides what that means, as it does for a Pi run that ended without pair_report.
   * @param {import('node:child_process').ChildProcess} child @param {ActivationState} active @param {import('./contracts.js').Authority} authority
   */
  async #finish(child, active, authority) {
    const { code, stdout, stderr } = await this.#collect(child);
    try {
      /** @type {LowResult | null} */ let result = null;
      try { const line = stdout.trim().split('\n').pop(); const parsed = line ? JSON.parse(line) : null; result = plain(parsed) ? parsed : null; } catch { result = null; }
      result ??= { status: 'error', exit: 3, error: `low --send gave no result (exit ${code ?? 'killed'}): ${bounded(stderr.trim(), 1500) || 'no output'}` };
      const tokens = plain(result.tokens) ? /** @type {Record<string, unknown>} */ (result.tokens) : {};
      const num = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
      const prompt = num(tokens.prompt), cached = Math.min(prompt, num(tokens.cached));
      this.#enqueue({ type: 'message_end', at: Date.now(), message: { role: 'assistant', usage: { input: prompt - cached, output: num(tokens.out), cacheRead: cached, cacheWrite: 0 } } });
      if (str(result.error)) this.#lastError = { message: bounded(str(result.error), 2000), at: Date.now(), source: 'assistant' };
      const aborted = this.#settledAborted || active.controller.signal.aborted;
      // A provider failure (a rate limit, a quota stop) ends the run without a report, the way a Pi worker's run does:
      // Pair then waits it out or switches to a fallback instead of handing Main a blocked report it can do nothing with.
      const providerFailure = result.status === 'error' && classifyProviderError(str(result.error), { providerCooldownMs: 60000, quotaCooldownMs: 900000 }) !== null;
      if (!aborted && !providerFailure && this.#current(active.token) && authority.task) await this.#publish(lowReportPayload(result, authority.task), authority, active.token);
    } finally {
      this.#task = null; this.#tool = null; this.#progress = null; this.#toolStep = 0; active.settled = true;
      this.#settledSequence++; this.#settledAt = Date.now(); this.#lastEventAt = this.#settledAt;
      this.#enqueue({ type: 'agent_settled', at: this.#settledAt });
      this.#wake();
    }
  }
  /**
   * Write the report where a Pi worker's pair_report does: the latch, then the inbox. Pi re-checks the report's
   * authority between its staged write and the publication, and so does this: a lease revoked while the report is
   * being written leaves the inbox untouched, so nothing a later task could mistake for its own appears.
   * @param {import('./contracts.js').ReportPayload} payload @param {import('./contracts.js').Authority} authority @param {Activation} token
   */
  async #publish(payload, authority, token) {
    const o = this.#options, task = /** @type {NonNullable<typeof authority.task>} */ (authority.task);
    const report = validateReportEnvelope({ version: PROTOCOL, reportId: uid('report'), workerId: o.workerId, ownerSession: o.ownerSession, ownerEpoch: o.ownerEpoch, workerGeneration: o.workerGeneration, nonce: o.nonce,
      sessionId: /** @type {string} */ (this.sessionId), leaseId: authority.leaseId, attemptId: task.attemptId, attemptNumber: task.attemptNumber, planRevision: task.planRevision,
      payload, payloadHash: digest(payload), createdAt: Date.now() });
    await atomicJSON(path.join(o.dir, 'latch.json'), validateLatch({ ownerEpoch: o.ownerEpoch, workerGeneration: o.workerGeneration, leaseId: authority.leaseId, attemptId: task.attemptId, report }));
    if (o.beforePublish) await o.beforePublish();
    if (!this.#current(token)) return;
    await mkdirPrivate(path.join(o.dir, 'inbox'));
    await atomicJSON(path.join(o.dir, 'inbox', `${report.reportId}.json`), report);
  }
  /**
   * While a task runs, Pair looks at it every WATCH_MS: low's status file says what the task is doing and when it
   * last moved, which is the worker's heartbeat, and its run under way is the worker's tool. Without a status file
   * (an older low) the session log's growth is the heartbeat.
   */
  #startWatch() {
    clearInterval(this.#watch);
    this.#watch = setInterval(() => { void this.#look().catch(() => {}); }, WATCH_MS);
    this.#watch.unref?.();
  }
  async #look() {
    const file = this.#sessionFile;
    if (!file || !this.#task) { clearInterval(this.#watch); this.#watch = undefined; return; }
    if (await this.#status()) { this.#wake(); return; }
    const size = await fs.stat(file).then(s => s.size, () => this.#watchedBytes);
    if (size <= this.#watchedBytes) return;
    const start = Math.max(this.#watchedBytes, size - TAIL_BYTES);
    const handle = await fs.open(file, 'r');
    try {
      const buffer = Buffer.alloc(size - start); await handle.read(buffer, 0, buffer.length, start);
      this.#watchedBytes = size; this.#lastEventAt = Date.now();
      for (const line of buffer.toString('utf8').split('\n')) {
        /** @type {unknown} */ let entry; try { entry = JSON.parse(line); } catch { continue; }
        if (!plain(entry)) continue;
        if (entry.role === 'assistant' && Array.isArray(entry.tool_calls) && entry.tool_calls.length) this.#tool = { name: 'run', startedAt: Date.now() };
        else if (entry.role === 'tool' || entry.role === 'assistant') this.#tool = null;
      }
    } finally { await handle.close(); }
    this.#wake();
  }
  /**
   * Read low's status file. Returns whether there was one; a running task's status becomes the progress, the
   * heartbeat and the tool, and each new run is recorded in the worker's activity list.
   * @returns {Promise<boolean>}
   */
  async #status() {
    const file = this.#sessionFile;
    if (!file) return false;
    const status = await readJSON(file.replace(/\.jsonl$/, '.inbox/status.json'), null, 256 * 1024).catch(() => null);
    if (!plain(status)) return false;
    this.#statusSeen = true;
    const now = this.#now();
    if (count(status.at)) this.#beatAt = count(status.at);
    // Between tasks, or before the server took this one: the task's own result settles it.
    if (status.state !== 'running' || !this.#task) return true;
    const moved = count(status.moved);
    if (moved && moved > this.#lastEventAt) this.#lastEventAt = Math.min(moved, now);
    const run = plain(status.running) ? status.running : null, step = count(status.step);
    const plan = plain(status.plan) && strings(status.plan.steps).length ? { steps: strings(status.plan.steps).slice(0, 50).map(s => bounded(s, 300)), done: (Array.isArray(status.plan.done) ? status.plan.done : []).filter(n => Number.isSafeInteger(n)).slice(0, 50) } : null;
    const tokens = plain(status.tokens) ? status.tokens : {}, steers = plain(status.steers) ? status.steers : {};
    // low's prompt tokens are the context the session holds: that is the size the next task would start at.
    if (count(tokens.prompt)) this.#contextTokens = count(tokens.prompt);
    this.#progress = Object.freeze({ activity: bounded(str(status.activity), 200), step, running: run ? { what: bounded(str(run.what), 300), forMs: count(run.ms) } : null,
      intent: bounded(str(status.intent), 300) || null, plan, requests: count(status.requests),
      tokens: { prompt: count(tokens.prompt), cached: count(tokens.cached), out: count(tokens.out) }, steers: { pending: count(steers.pending), taken: count(steers.taken) },
      taskMs: count(status.ms), movedAt: moved || null, at: count(status.at) || now });
    if (!run) this.#tool = null;
    else if (!this.#tool || step !== this.#toolStep) {
      // The watchdog's tool limit reads startedAt against the controller's clock; both are wall-clock time, so a
      // fake clock has to move this too or the two would disagree about how long the run has been going.
      this.#tool = { name: 'run', startedAt: now - count(run.ms) }; this.#toolStep = step;
      this.#activity = pushActivity(this.#activity, { tool: 'run', target: str(run.what), at: this.#tool.startedAt });
      await atomicJSON(path.join(this.dir, 'activity.json'), { version: 1, events: this.#activity }, { durable: false }).catch(() => {});
    }
    return true;
  }

  /**
   * @param {ActivationIdentity} identity @param {string} message
   * @returns {Promise<'queued' | 'unknown'>}
   */
  async steerCurrent(identity, message) {
    this.#assertCurrent(null);
    const active = this.#activation;
    requireValue(active && active.accepted && !active.settled, 'STEER_REFUSED: no accepted, unsettled activation to steer');
    const token = active.token;
    requireValue(token.taskId === identity.taskId && token.attemptId === identity.attemptId && token.leaseId === identity.leaseId && token.workerGeneration === identity.workerGeneration,
      'STEER_REFUSED: the current activation belongs to a different task, attempt or lease');
    return this.steer(token, message);
  }
  /** @param {Activation} activation @param {string} message @returns {Promise<'queued' | 'unknown'>} */
  async steer(activation, message) {
    this.#assertCurrent(activation);
    const active = this.#activation;
    requireValue(active && active.accepted && !active.settled && this.#task, 'STEER_REFUSED: no accepted, unsettled activation to steer');
    requireValue(typeof message === 'string' && message.trim().length > 0 && message.length <= 6000, 'Steer message must be 1–6000 characters');
    const { code } = await this.#control(`/steer ${message.replace(/\s+/g, ' ').trim()}`);
    this.#assertCurrent(activation);
    return code === 0 ? 'queued' : 'unknown';
  }
  /** @param {string} command a `low --send` control: a steer, /abort or /stop */
  async #control(command) {
    const child = this.#send(['--json', command]);
    const timer = setTimeout(() => child.kill('SIGKILL'), CONTROL_MS);
    try { return await this.#collect(child); } finally { clearTimeout(timer); }
  }
  /** @param {string} reason */
  revoke(reason) { this.#activation?.controller.abort(reason); this.#activation = null; this.#wake(); }
  snapshot() {
    const running = !!this.#task;
    return Object.freeze({ pid: this.pid, closed: this.closed, ready: this.ready, idle: this.ready && !running && (!this.#activation || this.#activation.settled) && !this.#abortPromise,
      streaming: running && !this.#tool, compacting: false, retrying: false, summarizationRetrying: false,
      pendingMessageCount: 0, steering: this.#progress?.steers.pending ?? 0, followUp: 0, tools: this.#tool ? 1 : 0, dialogs: 0, displayedDialog: false, permission: false, currentTool: this.currentTool,
      activation: this.#activation?.token || null, accepted: this.#activation?.accepted || false, awaitingSettlement: running, promptPending: false,
      settledSequence: this.#settledSequence, settledAt: this.#settledAt, settledAborted: this.#settledAborted, fault: this.#fault, exit: this.#exit,
      lastEventAt: this.#lastEventAt || null, tool: this.#tool, retry: null, lastError: this.#lastError, compactingSince: null, maintenanceCompaction: false });
  }
  /** @returns {RuntimeObservation[]} */
  takeObservations() { return this.#observations.splice(0, 32); }
  /** @param {number} [timeoutMs] @returns {Promise<void>} */
  async waitIdle(timeoutMs = this.#requestTimeout()) {
    const deadline = Date.now() + timeoutMs;
    while (this.#task) {
      requireValue(!this.closed, 'Worker is closed');
      requireValue(Date.now() < deadline, 'Worker did not reach verified true idle before deadline');
      await this.#changed(Math.min(POLL_MS * 4, Math.max(1, deadline - Date.now())));
    }
  }
  /** Resolves at the next wake, or after `ms`. @param {number} ms @returns {Promise<void>} */
  #changed(ms) {
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); this.#waiters.delete(done); resolve(); };
      const timer = setTimeout(done, ms);
      this.#waiters.add(done);
    });
  }
  /** @param {string} reason @param {number} graceMs @returns {Promise<void>} */
  async settleOrAbort(reason, graceMs) {
    this.revoke(reason);
    try { await this.waitIdle(graceMs); } catch { await this.abortCurrent(reason); }
  }
  /**
   * Whether low --serve still answers: its process is there and, for a low that keeps a status file, the file's
   * heartbeat is fresh. A server whose loop hangs keeps its process but stops the heartbeat.
   * @param {number} [_timeoutMs] @returns {Promise<boolean>}
   */
  async ping(_timeoutMs) {
    if (this.closed || !this.ready || !this.pid) return false;
    try { process.kill(this.pid, 0); } catch { return false; }
    if (!this.#statusSeen) return true;
    await this.#status().catch(() => false);
    return heartbeatFresh(this.#beatAt, this.#now(), this.#options.heartbeatMs ?? BEAT_MS);
  }
  /** @param {string} reason @returns {Promise<void>} */
  abortCurrent(reason) {
    this.revoke(reason);
    if (this.#abortPromise) return this.#abortPromise;
    this.#abortPromise = Promise.resolve().then(async () => {
      requireValue(!this.closed, 'Worker is closed');
      if (!this.#task) return;
      this.#settledAborted = true;
      try {
        await this.#control('/abort');
        await this.waitIdle(this.#requestTimeout());
      } catch (error) { this.#hold(error); await this.abortAndStop(reason); throw error; }
    }).finally(() => { this.#abortPromise = null; this.#wake(); });
    return this.#abortPromise;
  }
  /** @param {number} expectedGeneration @returns {Promise<void>} */
  async closeIdle(expectedGeneration) {
    requireValue(expectedGeneration === this.workerGeneration, 'Idle close generation mismatch');
    this.#assertCurrent(null); requireValue(this.ready && !this.#task && (!this.#activation || this.#activation.settled), 'Reserved activation prevents idle close');
    await this.#stop();
    requireValue(this.closed, 'Idle shutdown did not confirm exit');
  }
  /** @param {string} reason @returns {Promise<void>} */
  abortAndStop(reason) {
    this.revoke(reason); this.#ready = false;
    if (this.#stopPromise) return this.#stopPromise;
    this.#stopPromise = Promise.resolve().then(async () => {
      if (!this.#started) { this.#exit = { code: null, signal: null, expected: true, error: null, spawnFailed: true }; this.#wake(); return; }
      if (this.#task && !this.closed) {
        this.#settledAborted = true;
        await this.#control('/abort').catch(() => {});
        await this.waitIdle(Math.max(1000, this.#options.config.runtime.shutdownTimeoutMs || 5000)).catch(() => {});
      }
      await this.#stop();
      requireValue(this.closed, 'Containment did not confirm process exit');
    });
    return this.#stopPromise;
  }
  /** /stop first, then the process group: SIGTERM, and SIGKILL if that is not enough. */
  async #stop() {
    this.#closing = true; this.#ready = false;
    const wait = async (/** @type {number} */ ms) => { const end = Date.now() + ms; while (!this.closed && Date.now() < end) await sleep(50); return this.closed; };
    const grace = Math.max(1000, this.#options.config.runtime.shutdownTimeoutMs || 5000);
    // Always offer low its own /stop, whether or not a task is still in flight: a task that settles while this
    // runs would otherwise leave the server up until the signal below, and a concurrent settle is exactly the
    // kind of timing that made the resume test flaky. /stop is bounded, and the signals still follow if it fails.
    if (this.sessionId) await this.#control('/stop').catch(() => {});
    if (await wait(grace)) return;
    try { signalGroup(this.pid, 'SIGTERM', this.#server); } catch { /* already gone */ }
    if (await wait(grace)) return;
    try { signalGroup(this.pid, 'SIGKILL', this.#server); } catch { /* already gone */ }
    await wait(grace);
  }
}

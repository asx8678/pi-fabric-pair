import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

/** @typedef {Record<string, unknown>} RpcRecord */
/** @typedef {{command?: string, args?: string[], cwd?: string, env?: NodeJS.ProcessEnv, requestTimeoutMs?: number, shutdownTimeoutMs?: number, maxLineBytes?: number}} RpcOptions */
/** send-only observeAfterWrite retains ACK/write observation after caller revocation, not execution authority.
 * @typedef {{control?: boolean, signal?: AbortSignal, guard?: () => boolean, observeAfterWrite?: boolean}} RpcWriteOptions
 */
/** @typedef {{code: number | null, signal: NodeJS.Signals | null, expected: boolean, error: Error | null, spawnFailed?: boolean}} RpcExit */
/** @typedef {{command: string, control: boolean, resolve: (value: unknown) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout>, controller: AbortController, cleanup: () => void, written: boolean, attempted: boolean, response?: RpcRecord}} Pending */
/** @typedef {{text: string, bytes: number, control: boolean, options: RpcWriteOptions, expiresAt: number, attempted: boolean, done: boolean, timer: ReturnType<typeof setTimeout>, cleanup: () => void, resolve: () => void, reject: (error: Error) => void}} WriteItem */

// Internal, not ConfigV2: reserve independent request slots and bytes for containment/UI.
const NORMAL_REQUESTS = 32, CONTROL_REQUESTS = 8;
const NORMAL_WRITES = 32, CONTROL_WRITES = 16; // 8 control requests + 8 dialog cancellations
const NORMAL_BYTES = 16 * 1024 * 1024, CONTROL_BYTES = 64 * 1024;
const MAX_FRAME = 16 * 1024 * 1024, MAX_TIMEOUT = 300_000, KILL_WAIT = 1500;
const CONTROL_COMMANDS = new Set(['clear_queue', 'abort', 'abort_retry', 'abort_bash', 'get_state']);

/** ACK loss or a possibly partial write must hold, never resend. */
export class RpcUncertainError extends Error {
  /** @param {string} message */
  constructor(message) { super(message); this.name = 'RpcUncertainError'; }
}
/** This particular frame was fenced before stdin.write; it did not execute. */
class RpcCancelledError extends Error {
  /** @param {string} message */
  constructor(message) { super(message); this.name = 'RpcCancelledError'; }
}
/** @param {unknown} value @returns {value is RpcRecord} */
export function isRpcRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
/** @param {unknown} value @returns {Error} */
function errorOf(value) { return value instanceof Error ? value : new Error(String(value)); }
/** @param {number | undefined} value @param {number} fallback */
function timeout(value, fallback) { return Number.isFinite(value) && Number(value) > 0 ? Math.min(MAX_TIMEOUT, Math.max(1, Number(value))) : fallback; }

/**
 * Bounded public JSONL transport. No session lifecycle/idle mirror belongs here.
 * send deliberately returns unknown: consumers must validate command-specific data.
 * @extends {EventEmitter<{event: [RpcRecord], fault: [Error], exit: [RpcExit], diagnostic: [RpcRecord], late_response: [RpcRecord]}>}
 */
export class PiRpc extends EventEmitter {
  /** @param {RpcOptions} [options] */
  constructor(options = {}) {
    super();
    this.options = Object.freeze({ ...options, args: [...(options.args || [])], env: { ...options.env } });
    /** @type {import('node:child_process').ChildProcess | null} */
    this.child = null;
    /** @type {Map<string, Pending>} */ this.pending = new Map();
    /** @type {WriteItem[]} */ this.queue = [];
    /** @type {WriteItem | null} */ this.activeWrite = null;
    this.normalBytes = 0; this.controlBytes = 0;
    this.stderr = '';
    // Incomplete-frame text is kept as parts so each byte is scanned once; after a
    // bad frame, `discarding` skips to the next newline to resynchronize.
    /** @type {string[]} */ this.parts = []; this.partBytes = 0; this.discarding = false;
    this.decoder = new TextDecoder('utf-8', { fatal: true });
    this.closed = false; this.started = false; this.stopping = false;
    /** @type {Error | null} */ this.fault = null;
    /** @type {Promise<void> | null} */ this.stopPromise = null;
    /** @type {(value: RpcExit) => void} */ this.resolveExit = () => {};
    /** @type {Promise<RpcExit>} */ this.exitPromise = new Promise(resolve => { this.resolveExit = resolve; });
    this.maxLineBytes = typeof options.maxLineBytes === 'number' && Number.isFinite(options.maxLineBytes) && options.maxLineBytes > 0 ? Math.min(MAX_FRAME, Math.floor(options.maxLineBytes)) : MAX_FRAME;
  }
  get pid() { return this.child?.pid; }
  start() {
    if (this.started || this.closed) throw new Error('RPC generation cannot be restarted');
    this.started = true;
    const { command = 'pi', args = [], cwd, env = {} } = this.options;
    try {
      const child = this.child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true, detached: process.platform !== 'win32', shell: false });
      const { stdin, stdout, stderr } = child;
      if (stdin === null || stdout === null || stderr === null) throw new Error('Worker stdio pipes missing');
      stdout.on('data', (/** @type {Buffer} */ chunk) => this.consume(chunk));
      stdout.on('end', () => {
        try { if (this.decoder.decode()) this.discarding = true; } catch (e) { this.fail(errorOf(e)); }
        if (this.parts.length || this.discarding) this.fail(new RpcUncertainError('Worker stdout ended with an incomplete JSONL frame'));
        else if (!this.stopping && !this.closed) this.fail(new RpcUncertainError('Worker stdout ended before confirmed exit'));
      });
      stdout.on('error', error => this.fail(error));
      stderr.on('data', (/** @type {Buffer} */ chunk) => { this.stderr = (this.stderr + chunk.toString()).slice(-32000); });
      stderr.on('error', error => this.emit('diagnostic', { error: error.message.slice(0, 2000) }));
      stdin.on('error', error => this.fail(new RpcUncertainError(`Worker stdin error: ${error.message}`)));
      child.on('error', error => {
        // A kill/IPC error on an existing process is NOT evidence of exit.
        if (!child.pid) this.finish(null, null, error);
        this.fail(error);
      });
      child.once('close', (code, signal) => this.finish(code, signal));
    } catch (e) {
      const error = errorOf(e); this.finish(null, null, error); this.fail(error); throw error;
    }
    return this;
  }
  /** Called only on actual close or proven spawn failure (no PID).
   * @param {number | null} code @param {NodeJS.Signals | null} signal @param {Error} [spawnError]
   */
  finish(code, signal, spawnError) {
    if (this.closed) return;
    this.closed = true;
    const error = spawnError || new RpcUncertainError(`Worker exited (${code ?? signal ?? 'unknown'}); inspect saved work before retrying`);
    this.rejectAll(error); this.rejectWrites(error);
    const exit = { code, signal, expected: this.stopping, error: this.stopping ? null : error, ...(spawnError ? { spawnFailed: true } : {}) };
    this.resolveExit(exit); this.emit('exit', exit);
  }
  /** @param {Error} error */
  fail(error) {
    if (this.fault) return;
    this.fault = error;
    this.rejectAll(error); this.rejectWrites(error);
    this.emit('fault', error);
    // Containment has its own finite deadlines. Failure retains the unclosed child.
    if (!this.closed) void this.abortAndStop('transport fault').catch(e => this.emit('diagnostic', { error: errorOf(e).message.slice(0, 2000) }));
  }
  /** @param {Error} error */
  rejectAll(error) {
    const pending = [...this.pending.values()]; this.pending.clear();
    for (const p of pending) { clearTimeout(p.timer); p.cleanup(); p.reject(error); p.controller.abort(); }
  }
  /** @param {Error} error */
  rejectWrites(error) {
    for (const item of [...this.queue, ...(this.activeWrite ? [this.activeWrite] : [])]) this.finishWrite(item, error);
  }
  /** @param {Buffer} chunk */
  consume(chunk) {
    if (this.closed) return;
    // Read continuously even after a fault so control ACKs and close can arrive:
    // a bad frame faults the transport but never discards the frames after it.
    let text;
    try { text = this.decoder.decode(chunk, { stream: true }); }
    catch (e) { this.dropPartial(); this.fail(new RpcUncertainError(`Invalid worker protocol: ${errorOf(e).message}`)); return; }
    let start = 0;
    for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', start)) {
      const piece = text.slice(start, at); start = at + 1;
      if (this.discarding) { this.discarding = false; continue; }
      const line = this.parts.length ? this.parts.join('') + piece : piece;
      this.parts = []; this.partBytes = 0;
      this.frame(line.endsWith('\r') ? line.slice(0, -1) : line);
    }
    if (start >= text.length || this.discarding) return;
    const rest = text.slice(start);
    this.parts.push(rest); this.partBytes += Buffer.byteLength(rest);
    if (this.partBytes > this.maxLineBytes) { this.dropPartial(); this.fail(new RpcUncertainError('Invalid worker protocol: Oversized incomplete RPC frame')); }
  }
  /** Drop the incomplete frame and skip input until the next frame boundary. */
  dropPartial() { this.parts = []; this.partBytes = 0; this.discarding = true; }
  /** @param {string} line */
  frame(line) {
    try {
      if (!line.length || Buffer.byteLength(line) > this.maxLineBytes) throw new Error('Empty or oversized RPC frame');
      /** @type {unknown} */ const value = JSON.parse(line);
      if (!isRpcRecord(value) || typeof value.type !== 'string') throw new Error('Invalid RPC frame');
      this.handle(value);
    } catch (e) { this.fail(new RpcUncertainError(`Invalid worker protocol: ${errorOf(e).message}`)); }
  }
  /** @param {RpcRecord} event */
  handle(event) {
    if (event.type !== 'response') { this.emit('event', event); return; }
    const p = typeof event.id === 'string' ? this.pending.get(event.id) : undefined;
    if (!p) {
      if (!this.stopping && !this.fault) this.fail(new RpcUncertainError('Uncorrelated/duplicate RPC acknowledgement'));
      return;
    }
    if (!p.attempted || event.command !== p.command || typeof event.success !== 'boolean' || p.response) {
      this.fail(new RpcUncertainError('Mismatched or duplicate RPC acknowledgement')); return;
    }
    p.response = event; this.completeResponse(String(event.id), p);
  }
  /** @param {string} id @param {Pending} p */
  completeResponse(id, p) {
    if (!p.written || !p.response || !this.pending.has(id)) return;
    this.pending.delete(id); clearTimeout(p.timer); p.cleanup();
    if (p.response.success === false) p.reject(new Error(typeof p.response.error === 'string' ? p.response.error : `${p.command} failed`));
    else p.resolve(p.response.data);
  }
  /** @param {string} command @param {RpcRecord} [fields] @param {number} [timeoutMs] @param {RpcWriteOptions} [options] @returns {Promise<unknown>} */
  send(command, fields = {}, timeoutMs = this.options.requestTimeoutMs, options = {}) {
    if (!this.child || this.closed || ((this.stopping || this.fault) && !options.control)) return Promise.reject(new Error('Worker RPC is unavailable'));
    if (options.control && !CONTROL_COMMANDS.has(command)) return Promise.reject(new Error('Command cannot use reserved control capacity'));
    const count = [...this.pending.values()].filter(p => p.control === !!options.control).length;
    if (count >= (options.control ? CONTROL_REQUESTS : NORMAL_REQUESTS)) {
      const error = new RpcUncertainError('RPC request capacity exceeded; activation held'); this.fail(error); return Promise.reject(error);
    }
    const id = randomUUID(), controller = new AbortController(), expiresAt = Date.now() + timeout(timeoutMs, 30000);
    return new Promise((resolve, reject) => {
      /** @param {Error} error */
      const rejectRequest = error => {
        const p = this.pending.get(id); if (!p) return;
        this.pending.delete(id); clearTimeout(p.timer); p.cleanup(); reject(error);
        controller.abort(); // removes an unattempted queued frame before it can execute
      };
      const cancel = () => {
        const p = this.pending.get(id); if (!p) return;
        // An intentional owner revocation cannot unsend bytes. Keep the pending ACK
        // AND active write under their original deadlines; do not abort the internal
        // controller. Write/ACK faults and rejectAll still contain this request.
        if (p.attempted && options.observeAfterWrite === true) return;
        const error = p.attempted ? new RpcUncertainError('RPC cancelled after write began; outcome uncertain') : new RpcCancelledError('RPC request cancelled before write');
        if (p.attempted) this.fail(error);
        rejectRequest(error);
      };
      const timer = setTimeout(() => {
        const error = new RpcUncertainError(`RPC ${command} deadline/acknowledgement lost; no automatic retry`);
        this.fail(error); rejectRequest(error); // also settles control requests AFTER a prior fault
      }, timeout(timeoutMs, 30000));
      /** @type {Pending} */
      const p = { command, control: !!options.control, resolve, reject, timer, controller, cleanup: () => options.signal?.removeEventListener('abort', cancel), written: false, attempted: false };
      this.pending.set(id, p);
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) { cancel(); return; }
      this.enqueue({ ...fields, id, type: command }, { ...options, signal: controller.signal, guard: () => {
        if (Date.now() >= expiresAt) throw new RpcUncertainError(`RPC ${command} expired before write; activation held`);
        if (this.pending.get(id) !== p || controller.signal.aborted || options.signal?.aborted || (options.guard && !options.guard())) return false;
        p.attempted = true; return true;
      } }, expiresAt).then(() => {
        p.written = true; this.completeResponse(id, p);
      }, e => rejectRequest(errorOf(e)));
    });
  }
  /** @param {RpcRecord} frame @param {RpcWriteOptions} [options] @returns {Promise<void>} */
  write(frame, options = {}) { return this.enqueue(frame, options, Date.now() + timeout(this.options.requestTimeoutMs, 30000)); }
  /** @param {RpcRecord} frame @param {RpcWriteOptions} options @param {number} expiresAt @returns {Promise<void>} */
  enqueue(frame, options, expiresAt) {
    if (!this.child || this.closed || ((this.fault || this.stopping) && !options.control)) return Promise.reject(new Error('Worker stdin is unavailable'));
    if (options.control && frame.type !== 'extension_ui_response' && !CONTROL_COMMANDS.has(String(frame.type))) return Promise.reject(new Error('Frame cannot use reserved control capacity'));
    let text;
    try { text = JSON.stringify(frame) + '\n'; } catch (e) { return Promise.reject(errorOf(e)); }
    const bytes = Buffer.byteLength(text), control = !!options.control;
    const laneCount = this.queue.filter(item => item.control === control).length + (this.activeWrite?.control === control ? 1 : 0);
    if (bytes > this.maxLineBytes || laneCount >= (control ? CONTROL_WRITES : NORMAL_WRITES) || (control ? this.controlBytes + bytes > CONTROL_BYTES : this.normalBytes + bytes > NORMAL_BYTES)) {
      const error = new RpcUncertainError('RPC outbound capacity exceeded; activation held'); this.fail(error); return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      /** @type {WriteItem} */
      const item = { text, bytes, control, options, expiresAt, attempted: false, done: false, timer: setTimeout(() => {
        const error = new RpcUncertainError(item.attempted ? 'RPC write callback/drain deadline; outcome uncertain' : 'RPC queued write deadline; activation held');
        this.finishWrite(item, error); this.fail(error);
      }, Math.max(1, expiresAt - Date.now())), cleanup: () => {}, resolve, reject };
      const cancel = () => {
        const error = item.attempted ? new RpcUncertainError('RPC cancelled after write began; outcome uncertain') : new RpcCancelledError('RPC frame cancelled before write');
        this.finishWrite(item, error); if (item.attempted) this.fail(error); else this.pump();
      };
      options.signal?.addEventListener('abort', cancel, { once: true });
      item.cleanup = () => options.signal?.removeEventListener('abort', cancel);
      if (control) this.controlBytes += bytes; else this.normalBytes += bytes;
      this.queue.push(item);
      if (options.signal?.aborted) cancel(); else this.pump();
    });
  }
  pump() {
    if (this.activeWrite || this.closed) return;
    const index = this.queue.findIndex(item => item.control);
    const item = this.queue.splice(index < 0 ? 0 : index, 1)[0]; if (!item) return;
    const stream = this.child?.stdin;
    try {
      if (item.options.signal?.aborted) throw new RpcCancelledError('RPC scope fence rejected before write');
      if ((this.fault || this.stopping) && !item.control) throw new RpcCancelledError('RPC ordinary lane is held');
      if (!stream || stream.destroyed || stream.writableEnded) throw new Error('Worker stdin is closed');
    } catch (e) { const error = errorOf(e); this.finishWrite(item, error); if (!(error instanceof RpcCancelledError)) this.fail(error); this.pump(); return; }
    this.activeWrite = item;
    let callback = false, drained = false, returned = false;
    const complete = () => { if (callback && drained && returned && !item.done) { this.finishWrite(item); this.pump(); } };
    const onDrain = () => { drained = true; complete(); };
    stream.on('drain', onDrain);
    const previousCleanup = item.cleanup;
    item.cleanup = () => { previousCleanup(); stream.off('drain', onDrain); };
    try {
      // No await or user callback between this guard and the actual OS stream write.
      if (item.options.signal?.aborted || (item.options.guard && !item.options.guard())) throw new RpcCancelledError('RPC scope fence rejected at write');
      // An overdue timer may not have run yet after event-loop/backpressure delay.
      if (Date.now() >= item.expiresAt) throw new RpcUncertainError('RPC frame expired before write; activation held');
      item.attempted = true;
      const writable = stream.write(item.text, error => {
        if (item.done) return;
        if (error) { const uncertain = new RpcUncertainError(`RPC write failed: ${error.message}`); this.finishWrite(item, uncertain); this.fail(uncertain); return; }
        callback = true; complete();
      });
      drained ||= writable; returned = true; complete();
    } catch (e) {
      const error = item.attempted ? new RpcUncertainError(`RPC write ambiguity: ${errorOf(e).message}`) : errorOf(e);
      this.finishWrite(item, error); if (item.attempted || error instanceof RpcUncertainError) this.fail(error); else this.pump();
    }
  }
  /** @param {WriteItem} item @param {Error} [error] */
  finishWrite(item, error) {
    if (item.done) return;
    item.done = true; clearTimeout(item.timer); item.cleanup();
    const index = this.queue.indexOf(item); if (index >= 0) this.queue.splice(index, 1);
    if (this.activeWrite === item) this.activeWrite = null;
    if (item.control) this.controlBytes -= item.bytes; else this.normalBytes -= item.bytes;
    item.text = ''; if (error) item.reject(error); else item.resolve();
  }
  /** @param {string} id @param {RpcRecord} response @param {RpcWriteOptions} [options] */
  respondUI(id, response, options = {}) { return this.write({ ...response, type: 'extension_ui_response', id }, { ...options, control: true }); }
  /** @param {NodeJS.Signals} [signal] */
  kill(signal = 'SIGTERM') {
    if (!this.child || this.closed) return;
    try { if (process.platform !== 'win32' && this.child.pid) process.kill(-this.child.pid, signal); else this.child.kill(signal); }
    catch (e) { this.emit('diagnostic', { error: errorOf(e).message.slice(0, 2000) }); }
  }
  /** @param {number} ms @returns {Promise<boolean>} */
  async exitedWithin(ms) {
    if (this.closed) return true;
    /** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
    try { return await Promise.race([this.exitPromise.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), ms); })]); }
    finally { clearTimeout(timer); }
  }
  async escalate() {
    if (this.closed) return;
    this.kill('SIGTERM'); if (await this.exitedWithin(KILL_WAIT)) return;
    this.kill('SIGKILL'); if (await this.exitedWithin(KILL_WAIT)) return;
    throw new RpcUncertainError('Worker exit unconfirmed after SIGKILL deadline; retain this handle and do not reopen its session');
  }
  /** Runtime must freshly establish all idle axes, and recheck its fence at EOF.
   * @param {RpcWriteOptions} [options] @returns {Promise<void>}
   */
  closeIdle(options = {}) {
    if (this.closed) return Promise.resolve();
    if (this.stopPromise) return this.stopPromise;
    if (!this.child || this.pending.size || this.queue.length || this.activeWrite || options.signal?.aborted || !options.guard?.()) return Promise.reject(new Error('Idle EOF eligibility was not established'));
    this.stopping = true;
    this.stopPromise = Promise.resolve().then(async () => {
      if (this.closed) return;
      if (!options.guard?.() || options.signal?.aborted || this.pending.size || this.queue.length || this.activeWrite) {
        await this.escalate(); throw new RpcCancelledError('Idle EOF fence changed; process contained instead');
      }
      try { this.child?.stdin?.end(); }
      catch (error) { this.fail(errorOf(error)); }
      if (!await this.exitedWithin(timeout(this.options.shutdownTimeoutMs, 5000))) await this.escalate();
    });
    return this.stopPromise;
  }
  /** Destructive containment, never a silent idle close. @param {string} [reason] @returns {Promise<void>} */
  abortAndStop(reason = 'stop') {
    if (this.closed) return Promise.resolve();
    if (this.stopPromise) return this.stopPromise;
    if (!this.started) return Promise.reject(new Error('RPC process was never started'));
    this.stopping = true;
    // Publish single-flight synchronously, before any command can fail recursively.
    this.stopPromise = Promise.resolve().then(async () => {
      this.rejectAll(new RpcUncertainError(`RPC stopping: ${reason}`));
      this.rejectWrites(new RpcUncertainError(`RPC stopping: ${reason}`));
      await this.send('clear_queue', {}, 1000, { control: true }).catch(() => {});
      if (!this.closed) await this.send('abort', {}, 1000, { control: true }).catch(() => {});
      if (this.closed) return;
      // Pi's stdin EOF disposes its runtime. Give that path a bounded grace even
      // after a control-command failure; only actual close/spawn failure releases
      // this generation. A recursive fail() reuses the published stopPromise.
      try { this.child?.stdin?.end(); }
      catch (error) { this.fail(errorOf(error)); }
      if (!await this.exitedWithin(timeout(this.options.shutdownTimeoutMs, 5000))) await this.escalate();
    });
    return this.stopPromise;
  }
}

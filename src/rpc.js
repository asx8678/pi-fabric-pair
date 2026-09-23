import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { randomUUID } from 'node:crypto';
import { assert, bounded, briefError } from './util.js';

/** An acknowledgement timeout is NOT evidence that a command did not execute. */
export class RpcUncertainError extends Error { constructor(message) { super(message); this.name = 'RpcUncertainError'; } }

/** Small public-protocol adapter. No Pi private fields, fixed delays, HTTP server, or gRPC. */
export class PiRpc extends EventEmitter {
  constructor(options = {}) {
    super(); this.options = options; this.child = null; this.pending = new Map(); this.stderr = '';
    this.buffer = ''; this.decoder = new StringDecoder('utf8'); this.closed = false; this.stopping = false;
    this.maxLineBytes = options.maxLineBytes || 16 * 1024 * 1024;
    this.idle = true; this.compacting = false; this.lastState = null;
  }
  get pid() { return this.child?.pid; }
  start() {
    assert(!this.child, 'RPC worker already started');
    const { command = 'pi', args = [], cwd, env = {} } = this.options;
    this.child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32', shell: false });
    this.exitPromise = new Promise(resolve => { this.resolveExit = resolve; });
    this.child.stdout.on('data', chunk => this.consume(chunk));
    this.child.stdout.on('end', () => {
      const tail = this.decoder.end(); if (tail) this.buffer += tail;
      if (this.buffer.trim() && !this.stopping) this.fail(new Error('Worker closed stdout with an incomplete RPC frame'));
    });
    this.child.stderr.on('data', chunk => { this.stderr = bounded(this.stderr + chunk.toString(), 32000); this.emit('diagnostic', { source: 'stderr', bytes: chunk.length }); });
    this.child.stdin.on('error', error => { if (!this.stopping) this.fail(error); });
    this.child.once('error', error => { this.fail(error); this.finish(null, null); });
    this.child.once('close', (code, signal) => this.finish(code, signal));
    return this;
  }
  finish(code, signal) {
    if (this.closed) return;
    this.closed = true;
    const error = new RpcUncertainError(`Worker exited (${code ?? signal ?? 'unknown'}). Inspect the saved task before retrying.`);
    this.rejectAll(error); this.resolveExit?.({ code, signal });
    this.emit('exit', { code, signal, expected: this.stopping, error: this.stopping ? null : error });
  }
  fail(error) {
    this.rejectAll(error);
    this.emit('fault', error);
    if (!this.stopping) this.kill('SIGTERM');
  }
  rejectAll(error) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); }
  consume(chunk) {
    this.buffer += this.decoder.write(chunk);
    for (;;) {
      const at = this.buffer.indexOf('\n'); if (at < 0) break;
      const line = this.buffer.slice(0, at).replace(/\r$/, ''); this.buffer = this.buffer.slice(at + 1);
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > this.maxLineBytes) { this.fail(new Error('Oversized RPC frame')); return; }
      let event;
      try { event = JSON.parse(line); assert(event && typeof event.type === 'string', 'Invalid RPC frame'); }
      catch (e) { this.fail(new Error(`Non-protocol stdout from worker: ${briefError(e)}. Worker extensions must not console.log.`)); return; }
      this.handle(event);
    }
    if (Buffer.byteLength(this.buffer) > this.maxLineBytes) this.fail(new Error('Oversized incomplete RPC frame'));
  }
  handle(event) {
    if (event.type === 'response') {
      const p = this.pending.get(event.id);
      if (!p) { this.emit('late_response', event); return; }
      this.pending.delete(event.id); clearTimeout(p.timer);
      if (event.command !== p.command) { p.reject(new RpcUncertainError('Mismatched RPC command response')); return; }
      if (!event.success) p.reject(new Error(event.error || `${p.command} failed`));
      else { if (p.command === 'get_state') this.lastState = event.data; p.resolve(event.data); }
      return;
    }
    if (event.type === 'agent_start') this.idle = false;
    if (event.type === 'agent_settled') this.idle = true;
    if (event.type === 'auto_compaction_start') this.compacting = true;
    if (event.type === 'auto_compaction_end') this.compacting = false;
    this.emit('event', event);
  }
  send(command, fields = {}, timeoutMs = this.options.requestTimeoutMs || 30000) {
    assert(this.child && !this.closed && !this.stopping, 'Worker RPC is not available');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcUncertainError(`RPC ${command} acknowledgement timed out. Outcome unknown; not automatically retried.`));
      }, timeoutMs);
      this.pending.set(id, { command, resolve, reject, timer });
      this.write({ ...fields, id, type: command }).catch(error => {
        const pending = this.pending.get(id); if (!pending) return;
        this.pending.delete(id); clearTimeout(timer); reject(error);
      });
    });
  }
  write(frame) {
    assert(this.child?.stdin && !this.closed, 'Worker stdin is closed');
    return new Promise((resolve, reject) => this.child.stdin.write(JSON.stringify(frame) + '\n', error => error ? reject(error) : resolve()));
  }
  respondUI(id, response) { return this.write({ type: 'extension_ui_response', id, ...response }); }
  kill(signal = 'SIGTERM') {
    if (!this.child || this.closed) return;
    try { if (process.platform !== 'win32' && this.child.pid) process.kill(-this.child.pid, signal); else this.child.kill(signal); }
    catch (e) { if (e.code !== 'ESRCH') this.emit('diagnostic', { error: briefError(e) }); }
  }
  async stop() {
    if (!this.child || this.closed) return;
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = (async () => {
      // Stop current work, then EOF is the normal RPC shutdown request.
      await this.send('clear_queue', {}, 1000).catch(() => {});
      await this.send('abort', {}, 1000).catch(() => {});
      this.stopping = true;
      this.child.stdin.end();
      const grace = this.options.shutdownTimeoutMs || 5000;
      let timer; await Promise.race([this.exitPromise, new Promise(resolve => { timer = setTimeout(resolve, grace); })]); clearTimeout(timer);
      if (!this.closed) {
        this.kill('SIGTERM');
        await Promise.race([this.exitPromise, new Promise(resolve => { timer = setTimeout(resolve, 1500); })]); clearTimeout(timer);
      }
      if (!this.closed) { this.kill('SIGKILL'); await this.exitPromise; }
    })();
    return this.stopPromise;
  }
}

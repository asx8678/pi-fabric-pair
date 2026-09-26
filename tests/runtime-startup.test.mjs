import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { PiRuntime } from '../src/actor-runtime.js';

const entryPath = fileURLToPath(new URL('../src/extension.js', import.meta.url));
const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

async function fixture(options, run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-runtime-startup-'));
  const cwd = await fs.realpath(base);
  const dir = path.join(cwd, 'worker');
  await fs.mkdir(dir);
  const sessionFile = path.join(dir, 'session.jsonl');
  const header = { type: 'session', version: 3, id: 'retained-session', cwd, timestamp: new Date().toISOString() };
  let entries = [
    { type: 'model_change', id: 'old-model', parentId: null, timestamp: header.timestamp, provider: 'fixture', modelId: 'model' },
    { type: 'thinking_level_change', id: 'old-thinking', parentId: 'old-model', timestamp: header.timestamp, thinkingLevel: options.effort || 'high' },
    { type: 'message', id: 'old-message', parentId: 'old-thinking', timestamp: header.timestamp,
      message: { role: 'user', content: [{ type: 'text', text: 'Retain this conversation.' }], timestamp: Date.now() } },
  ];
  const original = structuredClone(entries);
  let nextId = 0;
  const save = () => fs.writeFile(sessionFile, [header, ...entries].map(value => JSON.stringify(value)).join('\n') + '\n');
  const append = data => entries.push({ id: `new-${++nextId}`, parentId: entries.at(-1)?.id ?? null, timestamp: new Date().toISOString(), ...data });
  await save();
  const spec = { id: 'worker', provider: 'fixture', model: 'model', effort: options.effort || 'high', cwd: null, readOnly: false };
  const config = {
    runtime: { startupTimeoutMs: 3000, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 },
    requirements: { fabric: true, fovea: true, prewalkDisabled: true, autoCompaction: true },
  };
  const runtimes = [];
  function createRuntime() {
    const generation = runtimes.length + 1;
    class FakeRpc extends EventEmitter {
      pid = 12345;
      closed = false;
      calls = [];
      model = { provider: spec.provider, id: spec.model };
      thinkingLevel = spec.effort;
      start() { this.calls.push({ command: 'start' }); }
      async send(command, fields = {}, _timeout, guardOptions = {}) {
        guardOptions.signal?.throwIfAborted();
        if (guardOptions.guard) assert.notEqual(guardOptions.guard(), false);
        this.calls.push({ command, fields: structuredClone(fields) });
        switch (command) {
          case 'get_state': return {
            model: { ...this.model }, thinkingLevel: this.thinkingLevel,
            sessionId: header.id, sessionFile, isStreaming: false, isCompacting: false,
            pendingMessageCount: 0, autoCompactionEnabled: true,
          };
          case 'get_entries': return { entries: structuredClone(entries), leafId: entries.at(-1)?.id ?? null };
          case 'set_model':
            this.model = { provider: fields.provider, id: fields.modelId };
            append({ type: 'model_change', provider: fields.provider, modelId: fields.modelId });
            if (this.thinkingLevel !== (options.modelThinking || 'low')) {
              this.thinkingLevel = options.modelThinking || 'low';
              append({ type: 'thinking_level_change', thinkingLevel: this.thinkingLevel });
              this.emit('event', { type: 'thinking_level_changed', level: this.thinkingLevel });
            }
            options.afterModel?.({ entries, append, rpc: this });
            await save();
            return { ...this.model };
          case 'get_available_thinking_levels': return { levels };
          case 'set_thinking_level':
            if (this.thinkingLevel !== fields.level) {
              this.thinkingLevel = fields.level;
              append({ type: 'thinking_level_change', thinkingLevel: fields.level });
              this.emit('event', { type: 'thinking_level_changed', level: fields.level });
            }
            options.afterThinking?.({ entries, append, rpc: this });
            await save();
            return {};
          case 'get_commands': return { commands: [{ name: 'pair-bridge', source: 'extension', sourceInfo: { path: entryPath } }] };
          case 'prompt': {
            assert.match(fields.message, /^\/pair-bridge (probe|load)$/, 'startup must not request inference');
            const configuredMeshRoot = 'meshRoot' in options ? options.meshRoot : path.join(dir, 'fabric', 'mesh');
            const meshRoot = typeof configuredMeshRoot === 'function' ? configuredMeshRoot(dir, generation) : configuredMeshRoot;
            const probe = {
              protocol: 1, pairVersion: '0.1.0', pid: this.pid, cwd, trusted: true,
              sessionId: header.id, sessionFile, nonce: `nonce-${generation}`, workerId: 'worker',
              ownerSession: 'main', ownerEpoch: 1, workerGeneration: generation,
              scope: 'offline registered bridge fixture', model: { ...this.model, contextWindow: 100000 },
              thinkingLevel: this.thinkingLevel, capabilities: { fabric: true, fovea: true, pairReport: true },
              ...(meshRoot !== null && { meshRoot }),
              versions: {}, sourcePaths: [entryPath], context: null,
              native: { agentDir: path.join(cwd, 'agent'), note: 'fixture', piCompaction: {}, cacheWarming: 'off',
                fabricCompaction: {}, fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: true, prewalkConfigured: true },
              checkedAt: Date.now(),
            };
            await fs.writeFile(path.join(dir, 'probe.json'), JSON.stringify(probe));
            return {};
          }
          default: throw new Error(`Unexpected fixture RPC command: ${command}`);
        }
      }
      async abortAndStop() {
        if (this.closed) return;
        this.closed = true;
        this.emit('exit', { code: 0, signal: null, expected: true, error: null });
      }
    }
    const rpc = new FakeRpc();
    const runtime = new PiRuntime({
      rpcOptions: { command: 'fixture-no-process', args: [], cwd, env: {}, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 },
      rpcFactory: () => rpc, ownerSession: 'main', ownerEpoch: 1, workerId: 'worker', workerGeneration: generation,
      nonce: `nonce-${generation}`, dir, cwd, sessionFile, sessionId: header.id, freshSession: false,
      config, spec, entryPath, onWake() {}, isCurrent: () => true,
    });
    runtimes.push(runtime);
    return { runtime, rpc };
  }
  try { await run({ createRuntime, entries: () => entries, original, sessionFile, header, spec }); }
  finally {
    await Promise.all(runtimes.map(runtime => runtime.abortAndStop('fixture cleanup')));
    await fs.rm(base, { recursive: true, force: true });
  }
}

test('retained startup accepts native model-default thinking before the explicit effort override', () => fixture({}, async f => {
  const { runtime, rpc } = f.createRuntime();
  const result = await runtime.ensureStarted();
  assert.equal(result.state.thinkingLevel, 'high');
  assert.equal(result.state.sessionId, f.header.id);
  assert.deepEqual(f.entries().slice(0, f.original.length), f.original);
  assert.deepEqual(f.entries().slice(f.original.length).map(entry => entry.type === 'thinking_level_change' ? entry.thinkingLevel : entry.type), ['model_change', 'low', 'high']);
  assert.equal(runtime.ready, true);
  assert.equal(runtime.snapshot().idle, true);
  assert.deepEqual(rpc.calls.filter(call => call.command === 'prompt').map(call => call.fields.message), ['/pair-bridge probe']);
}));

test('restart retains every entry and the same session without replaying implementation', () => fixture({}, async f => {
  const first = f.createRuntime();
  await first.runtime.ensureStarted();
  const prior = structuredClone(f.entries());
  await first.runtime.abortAndStop('normal fixture restart');
  const second = f.createRuntime();
  const result = await second.runtime.ensureStarted();
  assert.equal(result.state.sessionId, f.header.id);
  assert.equal(result.state.sessionFile, f.sessionFile);
  assert.deepEqual(f.entries().slice(0, prior.length), prior);
  assert.equal(second.runtime.ready, true);
  assert.ok(second.rpc.calls.filter(call => call.command === 'prompt').every(call => call.fields.message.startsWith('/pair-bridge ')));
}));

for (const effort of ['off', 'low', 'xhigh']) {
  test(`startup verifies the final ${effort} effort rather than requiring a particular default`, () => fixture({ effort }, async f => {
    const { runtime } = f.createRuntime();
    const result = await runtime.ensureStarted();
    assert.equal(result.state.thinkingLevel, effort);
    assert.deepEqual(f.entries().slice(0, f.original.length), f.original);
  }));
}

const rejected = [
  ['old history mutation', { afterModel: ({ entries }) => { entries[2].message.content[0].text = 'rewritten'; } }, /Session history changed\/lost an old branch entry/],
  ['branch movement', { afterModel: ({ entries }) => { entries.at(-1).parentId = entries[0].id; } }, /unexpected branch|Initialization suffix moved/],
  ['unrelated initialization entry', { afterModel: ({ append }) => append({ type: 'session_info', name: 'unexpected' }) }, /Unexpected session initialization entry/],
  ['unobserved intermediate thinking', { afterModel: ({ append }) => append({ type: 'thinking_level_change', thinkingLevel: 'medium' }) }, /Unexpected session initialization entry/],
  ['wrong model history', { afterModel: ({ append }) => append({ type: 'model_change', provider: 'different', modelId: 'model' }) }, /Unexpected session initialization entry/],
  ['wrong final effort', { afterThinking: ({ rpc }) => { rpc.thinkingLevel = 'medium'; } }, /Exact model\/thinking selection drifted/],
  ['wrong final model', { afterThinking: ({ rpc }) => { rpc.model.id = 'different'; } }, /Exact model\/thinking selection drifted/],
  ['old history changed during effort selection', { afterThinking: ({ entries }) => { entries[2].message.content[0].text = 'rewritten'; } }, /Session history changed\/lost an old branch entry/],
  ['aggregate initialization suffix overflow', { afterModel: ({ append }) => {
    append({ type: 'thinking_level_change', thinkingLevel: 'low' });
    append({ type: 'thinking_level_change', thinkingLevel: 'low' });
  } }, /unexpected initialization suffix/],
];
for (const [name, options, expected] of rejected) {
  test(`startup still rejects ${name}`, () => fixture(options, async f => {
    const { runtime, rpc } = f.createRuntime();
    await assert.rejects(runtime.ensureStarted(), expected);
    assert.equal(runtime.ready, false);
    assert.equal(rpc.closed, true);
    assert.equal(rpc.calls.some(call => call.command === 'prompt'), false, 'invalid startup must not reach the bridge or implementation');
  }));
}

test('startup rejects a probe missing the live mesh environment observation', () => fixture({ meshRoot: null }, async f => {
  const { runtime, rpc } = f.createRuntime();
  await assert.rejects(runtime.ensureStarted(), /Invalid bridge mesh root/);
  assert.equal(runtime.ready, false);
  assert.equal(rpc.closed, true);
  assert.deepEqual(rpc.calls.filter(call => call.command === 'prompt').map(call => call.fields.message), ['/pair-bridge probe'], 'a rejected mesh binding must not reach a bridge load or work prompt');
}));

test('startup rejects a malformed non-absolute live mesh observation', () => fixture({ meshRoot: 'relative/fabric/mesh' }, async f => {
  const { runtime } = f.createRuntime();
  await assert.rejects(runtime.ensureStarted(), /Invalid bridge mesh root/);
  assert.equal(runtime.ready, false);
}));

test('startup rejects a live mesh root that is not the worker-private root', () => fixture({ meshRoot: '/elsewhere/fabric/mesh' }, async f => {
  const { runtime, rpc } = f.createRuntime();
  await assert.rejects(runtime.ensureStarted(), /private mesh root/);
  assert.equal(runtime.ready, false);
  assert.equal(rpc.calls.some(call => call.command === 'prompt' && call.fields.message === '/pair-bridge load'), false, 'no bridge load may run after a mesh binding rejection');
}));

test('activation recheck still requires the exact private mesh root before any work prompt', () => {
  let drift = false;
  return fixture({ meshRoot: (workerDir, generation) => (drift ? '/drifted/fabric/mesh' : path.join(workerDir, 'fabric', 'mesh')) }, async f => {
    const { runtime, rpc } = f.createRuntime();
    await runtime.ensureStarted();
    drift = true;
    const token = runtime.reserveActivation({ taskId: 'task', attemptId: 'attempt', leaseId: 'lease', workerGeneration: 1 });
    await assert.rejects(runtime.prepareActivation(token), /private mesh root/);
    assert.equal(rpc.calls.some(call => call.command === 'prompt' && !String(call.fields.message).startsWith('/pair-bridge')), false, 'no work prompt may leave after a failed mesh recheck');
  });
});

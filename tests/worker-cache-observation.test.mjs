import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerWorker } from '../src/worker.js';
import { indicatorWidget, statusText } from '../src/ui.js';
import { fakeWarming } from './helpers/warming.mjs';
import { DEFAULTS } from '../src/config.js';
import { validateAuthority, validateCurrentTelemetry, validateLatch, validateReportEnvelope } from '../src/contracts.js';

const cached = { input: 4425, cacheRead: 82048, cacheWrite: 0, output: 27 };
const zero = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: { total: 0 } };
const plain = { fg: (_color, text) => text };

async function fixture(run, { cacheWarming, sdk, ipc = false } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-worker-cache-test-'));
  const dir = path.join(base, 'worker'), cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await Promise.all([dir, cwd, home].map(p => fs.mkdir(p)));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = home;
  const nativeBytes = '{"cacheWarming":"off","untouched":true}\n';
  const nativeFile = path.join(home, 'settings.json'); await fs.writeFile(nativeFile, nativeBytes);
  const events = new Map(), tools = new Map(), commands = new Map(), messages = [], notifications = [];
  let session = 'cache-session-1', aborts = 0, shutdowns = 0;
  const authority = validateAuthority({ ...(cacheWarming ? { cacheWarming } : {}), version: 1, ownerSession: 'cache-owner', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1,
    phase: 'running', leaseId: 'cache-lease-1', attemptId: 'cache-attempt-1', readOnly: false, model: { provider: 'fake', id: 'model' }, repoRoot: cwd,
    task: { id: 'cache-task', objective: 'Cache fixture', planRevision: 1, attemptId: 'cache-attempt-1', attemptNumber: 1, constraints: [],
      steps: [{ id: 'cache-step', title: 'Observe', instructions: 'Report and yield' }], stepIndex: 0,
      policy: structuredClone(DEFAULTS.supervision), limits: structuredClone(DEFAULTS.limits), lastDecision: null }, updatedAt: Date.now() });
  const gate = path.join(dir, 'authority.json');
  await fs.writeFile(gate, JSON.stringify(authority));
  const pi = { on: (name, fn) => events.set(name, fn), registerTool: tool => tools.set(tool.name, tool),
    registerCommand: (name, command) => commands.set(name, command), getAllTools: () => [...tools.values()],
    getCommands: () => [...commands.keys()].map(name => ({ name })), getThinkingLevel: () => 'low',
    sendMessage: (...args) => messages.push(args), sendUserMessage: () => assert.fail('No prompts allowed') };
  const ctx = { ...(sdk ? { acquireCacheWarming: sdk.acquireCacheWarming } : {}), cwd, model: { provider: 'fake', id: 'model', contextWindow: 200000 },
    sessionManager: { getSessionId: () => session, getSessionFile: () => path.join(base, `${session}.jsonl`) },
    getContextUsage: () => undefined, isProjectTrusted: () => false,
    abort: () => { aborts++; }, shutdown: () => { shutdowns++; }, ui: { notify: (...args) => notifications.push(args) } };
  const env = { PI_FABRIC_PAIR_WORKER_ID: 'worker', PI_FABRIC_PAIR_OWNER: 'cache-owner', PI_FABRIC_PAIR_OWNER_EPOCH: '1',
    PI_FABRIC_PAIR_WORKER_GENERATION: '1', PI_FABRIC_PAIR_NONCE: 'cache-nonce', PI_FABRIC_PAIR_WORKER_DIR: dir };
  const connected = Object.getOwnPropertyDescriptor(process, 'connected'), channel = Object.getOwnPropertyDescriptor(process, 'channel');
  if (ipc) { Object.defineProperty(process, 'connected', { value: true, configurable: true }); Object.defineProperty(process, 'channel', { value: { unref() {} }, configurable: true }); }
  const worker = registerWorker(pi, env);
  const emit = (name, event = {}) => events.get(name)(event, ctx);
  const read = async file => JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
  try {
    await emit('session_start');
    await run({ ctx, emit, events, worker, tools, messages, notifications, read, dir, gate,
      packet: async () => validateCurrentTelemetry(await read('telemetry.json')),
      response: (usage, extra = {}) => emit('message_end', { message: { role: 'assistant', usage, ...extra } }),
      aborts: () => aborts, shutdowns: () => shutdowns, session: value => { session = value; } });
  } finally {
    await emit('session_shutdown');
    if (ipc) { if (connected) Object.defineProperty(process, 'connected', connected); else delete process.connected; if (channel) Object.defineProperty(process, 'channel', channel); else delete process.channel; }
    assert.equal(await fs.readFile(nativeFile, 'utf8'), nativeBytes, 'Worker must never persist native warming settings');
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

test('registered Worker report-stop retains the last real request ratio and original observation time', t => fixture(async f => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-26T07:21:48.116Z') });
  assert.equal((await f.packet()).lastUsage, null);
  await f.response(cached, { stopReason: 'toolUse' });
  const measured = (await f.packet()).lastUsage;
  assert.equal(measured.cacheRatio, 82048 / 86473);
  const authorityBefore = await fs.readFile(f.gate, 'utf8');
  await f.emit('tool_execution_start', { toolName: 'fabric_exec' });
  const result = await f.tools.get('pair_report').execute('call-report', {
    taskId: 'cache-task', stepId: 'cache-step', kind: 'final_review', summary: 'Isolated report-stop fixture', stepComplete: true
  }, undefined, undefined, f.ctx);
  assert.equal(result.terminate, true);
  assert.equal(f.aborts(), 1, 'the real report handler still aborts the enclosing invocation');
  const latch = validateLatch(await f.read('latch.json'));
  const report = validateReportEnvelope(await f.read(`inbox/${result.details.pairReportId}.json`));
  assert.deepEqual(latch.report, report);
  t.mock.timers.tick(59);
  await f.response(zero, { stopReason: 'error', errorMessage: 'This operation was aborted' });
  await f.emit('tool_execution_end');
  await f.emit('agent_settled');
  const after = await f.packet();
  assert.deepEqual(after.lastUsage, measured, 'zero-token abort cannot replace or re-date the measurement');
  assert.equal(after.at, measured.observedAt + 59, 'telemetry freshness is separate from measurement age');
  assert.equal(after.phase, 'waiting');
  assert.equal(after.currentTool, null);
  assert.equal(after.sessionId, report.sessionId);
  assert.equal(await fs.readFile(f.gate, 'utf8'), authorityBefore, 'observation selection cannot alter authority');
  assert.deepEqual(await f.read('latch.json'), latch, 'immutable report evidence is unchanged');
  assert.equal(f.shutdowns(), 0);
  assert.deepEqual(f.messages, [], 'no warming/user/model messages');
}));

test('registered Worker hook ignores unusable samples but immediately displays a real cache miss', t => fixture(async f => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  for (const usage of [undefined, null, {}, zero, { output: 10 }]) {
    await f.response(usage);
    assert.equal((await f.packet()).lastUsage, null);
  }
  await f.response(cached);
  const measured = (await f.packet()).lastUsage;
  for (const usage of [undefined, null, {}, zero]) {
    t.mock.timers.tick(1000);
    await f.response(usage);
    assert.deepEqual((await f.packet()).lastUsage, measured);
  }
  await f.emit('message_end', { message: { role: 'user', usage: { input: 10 } } });
  assert.deepEqual((await f.packet()).lastUsage, measured);
  await f.response({ input: 66898, cacheRead: 0, output: 4 });
  const miss = (await f.packet()).lastUsage;
  assert.equal(miss.cacheRatio, 0);
  assert.equal(miss.totalInput, 66898);
  assert.equal(miss.observedAt, 5000);
  await f.response(zero);
  assert.deepEqual((await f.packet()).lastUsage, miss);
  assert.deepEqual(f.messages, []);
  assert.equal(f.aborts(), 0);
}));

test('Worker compaction and model-select boundaries retain the last measured sample and its original age', t => fixture(async f => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  for (const boundary of ['model', 'compact', 'compact_failed']) {
    await f.response(cached);
    const measured = (await f.packet()).lastUsage;
    assert.ok(measured.totalInput > 0);
    if (boundary === 'model') {
      f.ctx.model = { ...f.ctx.model, id: 'other-model' };
      await f.emit('model_select');
    } else {
      await f.emit('session_before_compact');
      assert.equal((await f.packet()).compacting, true);
      await f.emit(boundary === 'compact' ? 'session_compact' : 'session_compact_failed');
      assert.equal((await f.packet()).compacting, false);
    }
    t.mock.timers.tick(7000);
    const retained = (await f.packet()).lastUsage;
    assert.deepEqual(retained, measured, `${boundary}: last measured request is kept with its original observedAt`);
    for (const usage of [zero, undefined]) {
      await f.response(usage);
      assert.deepEqual((await f.packet()).lastUsage, measured, `${boundary}: empty placeholders never erase the retained sample`);
    }
    const s = { main: null, workers: [{ id: 'worker', status: 'working', model: 'fake/model', effort: 'low', cwd: '/project', observation: { lastUsage: retained } }],
      ownerSession: 'owner', directory: '/state', cacheNote: 'Cache observations describe past requests. Pair does not guarantee retained provider cache.' };
    assert.equal(indicatorWidget(s, false, plain, retained.observedAt + 5000).render(1000)[1]?.trim(), 'Cache read (last): W 94.9%', `${boundary}: widget renders the retained last-known value`);
    assert.ok(statusText(s, null, retained.observedAt + 5000).includes('  Last observed cache read: 94.9%\n'), `${boundary}: status renders the retained last-known value`);
    await f.response({ input: 66898, cacheRead: 0, output: 4 });
    const miss = (await f.packet()).lastUsage;
    assert.equal(miss.cacheRatio, 0, `${boundary}: a real measured miss immediately replaces the retained hit`);
    await f.response(zero);
    assert.deepEqual((await f.packet()).lastUsage, miss, `${boundary}: the miss is itself retained`);
  }
  assert.equal(f.messages.length, 1, 'only the existing compaction coordination packet');
  assert.deepEqual(f.messages[0][1], { deliverAs: 'nextTurn', triggerTurn: false });
  assert.equal(f.aborts(), 0);
}));

test('Worker session boundaries remain isolation resets for the display sample', () => fixture(async f => {
  await f.response(cached);
  assert.ok((await f.packet()).lastUsage.totalInput > 0);
  f.session('cache-session-2');
  await f.emit('session_start');
  assert.equal((await f.packet()).sessionId, 'cache-session-2');
  assert.equal((await f.packet()).lastUsage, null, 'a brand-new session starts from unknown');
  for (const usage of [zero, undefined]) {
    await f.response(usage);
    assert.equal((await f.packet()).lastUsage, null, 'no stale resurrection from the previous session');
  }
  assert.equal(f.messages.length, 0);
  assert.equal(f.aborts(), 0);
}));

test('Worker scoped warming needs opt-in and a new SDK, never a fallback', async () => {
  const sdk = fakeWarming();
  await fixture(async f => {
    await f.emit('cache_warming_decision', { action: 'warm' });
    assert.equal((await f.packet()).warming.requested, false);
    assert.equal(sdk.stats.acquisitions, 0);
  }, { sdk });
  await fixture(async f => {
    const observation = (await f.packet()).warming;
    assert.deepEqual(observation, { supported: false, requested: true, held: false, error: null });
    assert.equal(await f.emit('cache_warming_decision', { action: 'stop' }), undefined);
    assert.deepEqual(f.messages, []);
  }, { cacheWarming: 'active' });
});

test('Worker holds once through review, rechecks fresh policy/phase, and retains report/budget/zero-miss behavior', async () => {
  const sdk = fakeWarming();
  await fixture(async f => {
    const original = await f.read('authority.json');
    assert.equal(sdk.stats.acquisitions, 1);
    for (let i = 0; i < 10; i++) {
      await f.emit('agent_settled');
      assert.equal(await f.emit('cache_warming_decision', { action: 'stop' }), undefined, 'Pair never overrides native economics');
    }
    assert.equal(sdk.stats.acquisitions, 1);
    const report = await f.tools.get('pair_report').execute('warm-report', {
      taskId: 'cache-task', stepId: 'cache-step', kind: 'final_review', summary: 'Warming fixture', stepComplete: true
    }, undefined, undefined, f.ctx);
    assert.equal(report.terminate, true); assert.equal(f.aborts(), 1);
    const latch = await f.read('latch.json');
    await fs.writeFile(f.gate, JSON.stringify({ ...original, phase: 'waiting' }));
    await f.emit('cache_warming_decision', { action: 'warm' });
    assert.equal(sdk.stats.acquisitions, 1, 'review is the same active interval, not a restarted warming clock');
    assert.equal((await f.packet()).warming.held, true);
    for (const phase of ['paused', 'idle', 'stopped']) {
      await fs.writeFile(f.gate, JSON.stringify({ ...original, phase }));
      await f.emit('cache_warming_decision', { action: 'warm' });
      assert.equal(sdk.leases.size, 0, phase);
      assert.equal((await f.packet()).warming.held, false, 'retained report/telemetry cannot authorize warming');
    }
    await fs.writeFile(f.gate, JSON.stringify({ ...original, phase: 'waiting', task: null, attemptId: null }));
    await f.emit('cache_warming_decision', { action: 'warm' });
    assert.equal(sdk.leases.size, 0, 'bare retained worker');
    await fs.writeFile(f.gate, JSON.stringify({ ...original, cacheWarming: 'off' }));
    await f.emit('cache_warming_decision'); assert.equal(sdk.leases.size, 0);
    await fs.writeFile(f.gate, JSON.stringify(original));
    await f.emit('cache_warming_decision'); assert.equal(sdk.leases.size, 1);
    await f.response(cached); await f.response({ input: 66898, cacheRead: 0 }); await f.response(zero);
    assert.equal((await f.packet()).lastUsage.cacheRatio, 0);
    assert.deepEqual(await f.read('latch.json'), latch);
    assert.deepEqual((await f.read('authority.json')).task.limits, original.task.limits);
    assert.deepEqual(f.messages, []);
  }, { cacheWarming: 'active', sdk });
  assert.equal(sdk.leases.size, 0, 'session shutdown releases');
});

test('Worker stale/malformed authority, model drift and shutdown races release only the Pair lease', async () => {
  const sdk = fakeWarming(), other = sdk.acquireCacheWarming('idle');
  await fixture(async f => {
    const original = await f.read('authority.json');
    for (const bad of [{ ...original, ownerEpoch: 2 }, { ...original, workerGeneration: 2 }, { ...original, cacheWarming: 'idle' }]) {
      await fs.writeFile(f.gate, JSON.stringify(bad));
      await f.emit('cache_warming_decision');
      assert.equal(sdk.leases.size, 1, 'other owner survives invalid Pair authority');
      assert.match((await f.packet()).warming.error, /authority unavailable/);
      await fs.writeFile(f.gate, JSON.stringify(original)); await f.emit('cache_warming_decision');
      assert.equal(sdk.leases.size, 2);
    }
    await fs.writeFile(f.gate, '{bad JSON'); await f.emit('cache_warming_decision');
    assert.equal(sdk.leases.size, 1);
    await fs.writeFile(f.gate, JSON.stringify(original)); await f.emit('cache_warming_decision');
    f.ctx.model = { ...f.ctx.model, id: 'wrong-model' }; await f.emit('model_select');
    assert.equal(sdk.leases.size, 1);
    f.ctx.model = { ...f.ctx.model, id: 'model' }; await f.emit('cache_warming_decision');
    const pending = f.emit('cache_warming_decision');
    await f.emit('session_shutdown'); await pending;
    assert.equal(sdk.leases.size, 1, 'in-flight authority read cannot reacquire after shutdown');
  }, { cacheWarming: 'active', sdk });
  other(); assert.equal(sdk.leases.size, 0);
});

test('Worker parent disconnect releases synchronously without creating another native request', async () => {
  const sdk = fakeWarming();
  await fixture(async f => {
    assert.equal(sdk.leases.size, 1);
    process.emit('disconnect');
    assert.equal(sdk.leases.size, 0);
    assert.equal(f.aborts(), 1); assert.equal(f.shutdowns(), 1);
    await f.emit('cache_warming_decision');
    assert.equal(sdk.stats.acquisitions, 1);
    assert.deepEqual(f.messages, []);
  }, { cacheWarming: 'active', sdk, ipc: true });
});

test('a delayed old authority load cannot reacquire after a newer native decision observes cancellation', { timeout: 5000 }, t => {
  const sdk = fakeWarming();
  return fixture(async f => {
    const original = await f.read('authority.json');
    let entered, release;
    const reading = new Promise(resolve => { entered = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    const open = fs.open;
    let once = true;
    t.mock.method(fs, 'open', async (file, ...args) => {
      if (once && file === path.join(f.dir, 'latch.json')) { once = false; entered(); await blocked; }
      return open(file, ...args);
    });
    const oldLoad = f.worker.load();
    try {
      await Promise.race([reading, oldLoad.then(() => { throw Error('latch-open barrier was not reached'); })]);
      // old running authority is captured, but load is still reading its latch
      await fs.writeFile(f.gate, JSON.stringify({ ...original, phase: 'paused' }));
      await f.emit('cache_warming_decision', { action: 'warm' });
      assert.equal(sdk.leases.size, 0);
    } finally { release(); await oldLoad; }
    assert.equal(sdk.leases.size, 0, 'old load cannot replace the newer closed warming scope');
    assert.equal(sdk.stats.acquisitions, 1);
  }, { cacheWarming: 'active', sdk });
});

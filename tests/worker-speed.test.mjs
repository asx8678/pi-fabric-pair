import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerWorker } from '../src/worker.js';
import { speedLabel, statusText } from '../src/ui.js';
import { DEFAULTS } from '../src/config.js';
import { validateAuthority, validateCurrentTelemetry } from '../src/contracts.js';

const usage = output => ({ input: 12, cacheRead: 0, cacheWrite: 0, output, cost: { total: 0 } });

async function fixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-worker-speed-test-'));
  const dir = path.join(base, 'worker'), cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await Promise.all([dir, cwd, home].map(p => fs.mkdir(p)));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = home;
  const nativeBytes = '{"cacheWarming":"off","untouched":true}\n';
  const nativeFile = path.join(home, 'settings.json'); await fs.writeFile(nativeFile, nativeBytes);
  const events = new Map(), tools = new Map(), commands = new Map(), messages = [], notifications = [];
  let session = 'speed-session-1', aborts = 0, shutdowns = 0;
  const authority = validateAuthority({ version: 1, ownerSession: 'speed-owner', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1,
    phase: 'running', leaseId: 'speed-lease-1', attemptId: 'speed-attempt-1', readOnly: false, model: { provider: 'fake', id: 'model' }, repoRoot: cwd,
    task: { id: 'speed-task', objective: 'Speed fixture', planRevision: 1, attemptId: 'speed-attempt-1', attemptNumber: 1, constraints: [],
      steps: [{ id: 'speed-step', title: 'Stream', instructions: 'Report and yield' }], stepIndex: 0,
      policy: structuredClone(DEFAULTS.supervision), limits: structuredClone(DEFAULTS.limits), lastDecision: null }, updatedAt: Date.now() });
  const gate = path.join(dir, 'authority.json');
  await fs.writeFile(gate, JSON.stringify(authority));
  const pi = { on: (name, fn) => events.set(name, fn), registerTool: tool => tools.set(tool.name, tool),
    registerCommand: (name, command) => commands.set(name, command), getAllTools: () => [...tools.values()],
    getCommands: () => [...commands.keys()].map(name => ({ name })), getThinkingLevel: () => 'low',
    sendMessage: (...args) => messages.push(args), sendUserMessage: () => assert.fail('No prompts allowed') };
  const ctx = { cwd, model: { provider: 'fake', id: 'model', contextWindow: 200000 },
    sessionManager: { getSessionId: () => session, getSessionFile: () => path.join(base, `${session}.jsonl`) },
    getContextUsage: () => undefined, isProjectTrusted: () => false,
    abort: () => { aborts++; }, shutdown: () => { shutdowns++; }, ui: { notify: (...args) => notifications.push(args) } };
  const env = { PI_FABRIC_PAIR_WORKER_ID: 'worker', PI_FABRIC_PAIR_OWNER: 'speed-owner', PI_FABRIC_PAIR_OWNER_EPOCH: '1',
    PI_FABRIC_PAIR_WORKER_GENERATION: '1', PI_FABRIC_PAIR_NONCE: 'speed-nonce', PI_FABRIC_PAIR_WORKER_DIR: dir };
  // The worker times streaming through the monotonic performance.now clock at
  // message_start/message_end. Patch that global (and restore it by deleting
  // the own property) instead of sleeping real wall-clock time in tests.
  let clock = 0;
  Object.defineProperty(performance, 'now', { value: () => clock, configurable: true });
  const worker = registerWorker(pi, env);
  const emit = (name, event = {}) => events.get(name)(event, ctx);
  const read = async file => JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
  try {
    await emit('session_start');
    await run({ ctx, emit, events, worker, tools, messages, notifications, read, dir, gate,
      clock: ms => { clock = ms; },
      start: (role = 'assistant') => emit('message_start', { message: { role } }),
      end: (messageUsage, role = 'assistant') => emit('message_end', { message: { role, usage: messageUsage } }),
      packet: async () => validateCurrentTelemetry(await read('telemetry.json')),
      aborts: () => aborts, shutdowns: () => shutdowns, session: value => { session = value; } });
  } finally {
    await emit('session_shutdown');
    delete performance.now;
    assert.equal(await fs.readFile(nativeFile, 'utf8'), nativeBytes, 'Worker must never persist native warming settings');
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

test('worker speed aggregate is weighted streaming throughput, not an average of rates', () => fixture(async f => {
  // 100 tokens in 1s plus 100 tokens in 3s is 200/4 = 50 tok/s, never 66.7.
  f.clock(1000);
  await f.start();
  f.clock(2000);
  await f.end(usage(100));
  assert.deepEqual((await f.packet()).speed, { tokens: 100, seconds: 1 });
  f.clock(5000); // the idle gap between responses is never part of any sample
  await f.start();
  f.clock(8000);
  await f.end(usage(100));
  const speed = (await f.packet()).speed;
  assert.deepEqual(speed, { tokens: 200, seconds: 4 });
  assert.equal(speedLabel(speed), 'avg 50.0 tok/s');
}));

test('unmatched, zero-output, nonpositive and non-assistant samples never touch the aggregate', () => fixture(async f => {
  await f.end(usage(40)); // an end with no start is unmatched
  assert.equal((await f.packet()).speed, null);
  await f.start('user'); // a non-assistant start is not a timer
  await f.end(usage(40), 'user'); // a non-assistant end never samples
  assert.equal((await f.packet()).speed, null);
  f.clock(1000);
  await f.start();
  f.clock(1100);
  await f.start(); // an abandoned start is discarded by the next one
  f.clock(2100);
  await f.end(usage(40));
  assert.deepEqual((await f.packet()).speed, { tokens: 40, seconds: 1 });
  f.clock(3000);
  await f.start();
  f.clock(3100);
  await f.end(usage(0)); // zero output is dropped
  f.clock(3200);
  await f.start();
  f.clock(3200);
  await f.end(usage(7)); // a zero-length interval is dropped
  f.clock(3300);
  await f.start();
  f.clock(3000);
  await f.end(usage(7)); // a nonpositive interval is dropped
  f.clock(3400);
  await f.start();
  f.clock(3500);
  await f.end(undefined); // no usage at all is dropped
  f.clock(3600);
  await f.start();
  f.clock(3700);
  await f.end(usage(9));
  assert.deepEqual((await f.packet()).speed, { tokens: 49, seconds: 1.1 }, 'only the two valid samples were folded in');
}));

test('model and session boundaries reset the aggregate without mixing models or sessions', () => fixture(async f => {
  f.clock(1000);
  await f.start();
  f.clock(2000);
  await f.end(usage(60));
  assert.deepEqual((await f.packet()).speed, { tokens: 60, seconds: 1 });
  f.ctx.model = { ...f.ctx.model, id: 'other-model' };
  await f.emit('model_select');
  assert.equal((await f.packet()).speed, null, 'a new model starts from unknown');
  f.clock(4000);
  await f.start();
  f.clock(4200);
  await f.end(usage(21));
  assert.deepEqual((await f.packet()).speed, { tokens: 21, seconds: 0.2 }, 'no pre-switch tokens or seconds mix in');
  f.session('speed-session-2');
  await f.emit('session_start');
  assert.equal((await f.packet()).speed, null, 'a brand-new session starts from unknown');
  f.clock(6000);
  await f.start();
  f.clock(6100);
  await f.end(usage(5));
  assert.deepEqual((await f.packet()).speed, { tokens: 5, seconds: 0.1 }, 'no stale session aggregate resurrects');
}));

test('compaction keeps the completed aggregate and clears only pending timing', () => fixture(async f => {
  f.clock(1000);
  await f.start();
  f.clock(3000);
  await f.end(usage(30));
  const done = (await f.packet()).speed;
  assert.deepEqual(done, { tokens: 30, seconds: 2 });
  f.clock(5000);
  await f.start(); // a response still streaming when compaction begins
  await f.emit('session_before_compact');
  assert.deepEqual((await f.packet()).speed, done, 'the completed average survives compaction');
  f.clock(6000);
  await f.end(usage(30)); // its start was cleared, so the sample is dropped
  assert.deepEqual((await f.packet()).speed, done, 'the abandoned pending sample never lands');
}));

test('status and label output report streaming throughput with an explicit unknown', () => {
  assert.equal(speedLabel({ tokens: 200, seconds: 4 }), 'avg 50.0 tok/s');
  for (const bad of [null, undefined, {}, { tokens: 0, seconds: 1 }, { tokens: 10, seconds: -1 }, { tokens: 'x', seconds: 1 }, { tokens: 5, seconds: 0 }, { tokens: 5 }]) {
    assert.equal(speedLabel(bad), 'avg — tok/s', `unusable ${JSON.stringify(bad)} stays explicit`);
  }
  const s = { main: null,
    workers: [{ id: 'worker', status: 'working', model: 'fake/model', effort: 'low', cwd: '/project',
      observation: { at: 100, speed: { tokens: 200, seconds: 4 }, lastUsage: { input: 10, cacheRead: 10, cacheWrite: 0, totalInput: 20, output: 5, cacheRatio: 0.5, cost: null, observedAt: 100 } },
      task: { id: 'speed-task', status: 'running', step: 1, steps: 2, revisions: 0, objective: 'Stream', startedAt: 100, turns: 42, stepList: [{ id: 's1', title: 'Only', state: 'done' }] } }],
    ownerSession: 'owner', directory: '/state', cacheNote: 'Cache observations describe past requests. Pair does not guarantee retained provider cache.' };
  const text = statusText(s, null, 10_000_000);
  assert.ok(text.includes('  Speed: avg 50.0 tok/s (average streaming throughput; weighted output tokens/second)\n'), `status line labels the average as streaming throughput:\n${text}`);
  assert.match(text, /avg streaming throughput \(weighted output tokens\/second, pre-response request latency excluded, unavailable is explicit\)/);
  assert.ok(!text.includes('request latency included'), 'no surface claims pre-response latency is included');
  assert.ok(text.includes('  Last observed cache read: 50.0%\n'), 'cache shares stay visible without an age timer');
  assert.ok(!text.includes('Telemetry') && !text.includes('Activity:'), 'status shows no elapsed/turn or numeric activity-age rows');
  assert.doesNotMatch(text, /ago|turns|elapsed/, 'no age, turn-count or elapsed text anywhere');
  assert.ok(text.includes('  STALE: no recent worker activity; inspect the transcript or cancel\n'), 'a plain stale warning remains without a duration');
});

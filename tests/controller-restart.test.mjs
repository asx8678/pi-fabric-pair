import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PairController } from '../src/controller.js';
import { PiRpc } from '../src/rpc.js';
import { validateStoredState } from '../src/contracts.js';

const host = fileURLToPath(new URL('./helpers/restart-worker.mjs', import.meta.url));
async function fixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-restart-'));
  const repo = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(repo); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const launches = [], notices = [];
  const c = new PairController({
    cwd: repo, ownerSession: 'restart-owner', storageDir: path.join(base, 'state'),
    config: {
      enabled: true, autoStart: false,
      workers: [{ id: 'worker', provider: 'fixture', model: 'first', effort: 'low', cwd: null, readOnly: false }],
      runtime: { command: process.execPath, commandArgs: [host], inheritExtensions: false, startupTimeoutMs: 5000, requestTimeoutMs: 2000, shutdownTimeoutMs: 300 },
      requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    },
    rpcFactory: options => {
      assert.ok(launches.every(rpc => rpc.closed), 'a new process must wait for confirmed previous exit');
      const rpc = new PiRpc({ ...options, env: { ...options.env, PI_CODING_AGENT_DIR: home } });
      launches.push(rpc); return rpc;
    },
    callbacks: { notifyUser: message => notices.push(message) },
  });
  try { await c.init(); await run({ c, base, launches, notices }); }
  finally { await c.close(); await fs.rm(base, { recursive: true, force: true }); }
}
async function noWorkPrompts(c) {
  const requests = (await fs.readFile(path.join(c.workerDir('worker'), 'test-rpc.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(requests.filter(r => r.type === 'prompt').every(r => /^\/pair-bridge (probe|load)$/.test(r.message)), 'restart never requests an inference turn');
}
async function retainedTask(c) {
  const record = c.record('worker');
  record.task = {
    id: 'retained-task', workerId: 'worker', requestId: 'retained-request', objective: 'Retain unfinished work', context: '', constraints: [],
    steps: [{ id: 'one', title: 'Work', instructions: 'fixture' }], stepIndex: 0, planRevision: 1, attemptId: 'retained-attempt', attemptNumber: 1,
    status: 'running', leaseId: 'retained-lease', policy: structuredClone(c.config.supervision), limits: structuredClone(c.config.limits),
    verification: structuredClone(c.config.verification), startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 7, usage: null,
    baseSnapshotRef: '/unused-fixture', pendingReport: null, report: null, decisions: {}, lastDecision: null,
  };
  record.status = 'working'; await c.writeAuthority('worker', 'running'); await c.persist();
  return record.task;
}

test('worker-only restart replaces the process after exit and keeps the complete conversation', { timeout: 15000 }, () => fixture(async ({ c, launches }) => {
  const before = await c.start('worker');
  const session = { id: before.sessionId, file: before.sessionFile, ownerEpoch: c.state.ownerEpoch };
  await launches[0].send('test_history');
  const history = await fs.readFile(session.file, 'utf8');
  assert.match(history, /Keep this conversation/);
  const first = launches[0], pid = first.pid;
  c.setMainObservation({ model: 'main/independent' });
  const after = await c.restart('worker');
  assert.equal(launches.length, 2); assert.equal(first.closed, true); assert.notEqual(launches[1].pid, pid);
  assert.equal(after.workerGeneration, 2); assert.equal(after.status, 'ready');
  assert.equal(after.sessionFile, session.file); assert.equal(after.sessionId, session.id);
  assert.equal(await fs.readFile(session.file, 'utf8'), history);
  assert.equal(c.state.ownerEpoch, session.ownerEpoch); assert.equal(c.summary().main.model, 'main/independent');
  assert.equal(c.closing, false); assert.ok(c.releaseLock);
  await noWorkPrompts(c);
}));

test('restart applies staged worker model settings while retaining history and Main selection', { timeout: 15000 }, () => fixture(async ({ c, launches }) => {
  const before = await c.start('worker'), sessionId = before.sessionId, file = before.sessionFile;
  const history = await fs.readFile(file, 'utf8');
  c.setMainObservation({ model: 'main/unchanged' });
  const next = structuredClone(c.config); next.workers[0].model = 'second'; next.workers[0].effort = 'high';
  await c.updateConfig(next);
  assert.equal(c.config.workers[0].model, 'first'); assert.ok(c.pendingConfig);
  const after = await c.restart('worker');
  assert.equal(after.bound.model, 'second'); assert.equal(after.bound.effort, 'high');
  assert.equal(after.sessionId, sessionId); assert.equal(after.sessionFile, file);
  assert.ok((await fs.readFile(file, 'utf8')).startsWith(history));
  assert.equal(c.pendingConfig, null); assert.equal(c.summary().main.model, 'main/unchanged');
  assert.equal(launches.length, 2); await noWorkPrompts(c);
}));

for (const fault of ['crash', 'malformed RPC']) test(`a worker ${fault} stays contained and explicit restart recovers the retained session`, { timeout: 15000 }, () => fixture(async ({ c, launches }) => {
  const before = await c.start('worker'), sessionId = before.sessionId, file = before.sessionFile;
  const first = launches[0], history = await fs.readFile(file, 'utf8');
  if (fault === 'crash') first.kill('SIGKILL');
  else await assert.rejects(first.send('test_bad_frame'), /JSON|frame/);
  assert.equal(await first.exitedWithin(4000), true);
  if (c.scanPromise) await c.scanPromise;
  const after = await c.restart('worker');
  assert.equal(after.status, 'ready'); assert.equal(after.sessionId, sessionId); assert.equal(after.sessionFile, file);
  assert.equal(await fs.readFile(file, 'utf8'), history); assert.equal(launches.length, 2);
  assert.equal(c.closing, false); await noWorkPrompts(c);
}));

test('failed replacement model leaves Main available and a later restart recovers without losing history', { timeout: 15000 }, () => fixture(async ({ c, launches }) => {
  const before = await c.start('worker'), sessionId = before.sessionId, file = before.sessionFile;
  const history = await fs.readFile(file, 'utf8');
  const next = structuredClone(c.config); next.workers[0].model = 'unavailable'; await c.updateConfig(next);
  await assert.rejects(c.restart('worker'), /model is unavailable/);
  assert.equal(c.closing, false); assert.equal(c.restarts.size, 0); assert.equal(c.record('worker').status, 'error');
  assert.equal(await launches[1].exitedWithin(4000), true, 'startup failure contains only the failed child');
  next.workers[0].model = 'recovered'; await c.updateConfig(next);
  const after = await c.restart('worker');
  assert.equal(after.sessionId, sessionId); assert.equal(after.sessionFile, file); assert.equal(after.status, 'ready');
  assert.ok((await fs.readFile(file, 'utf8')).startsWith(history));
  assert.equal(launches.length, 3); await noWorkPrompts(c);
}));

test('simultaneous restart requests share one replacement and stop supersedes a pending restart', { timeout: 15000 }, () => fixture(async ({ c, launches }) => {
  await c.start('worker');
  const shared = Promise.all([c.restart('worker'), c.restart('worker')]);
  await assert.rejects(c.start('worker'), /restart is in progress/);
  await shared;
  assert.equal(launches.length, 2);
  const restarting = c.restart('worker');
  const superseded = assert.rejects(restarting, /superseded|revoked/i);
  await c.stop('worker'); await superseded;
  assert.equal(launches.length, 2); assert.equal(c.record('worker').status, 'stopped');
  assert.equal(c.restarts.size, 0); assert.equal(c.handles.size, 0);
  await c.start('worker'); assert.equal(launches.length, 3);
}));

test('restart retains an interrupted assignment and its budgets without replaying work', { timeout: 15000 }, () => fixture(async ({ c }) => {
  await c.start('worker'); const task = await retainedTask(c), before = structuredClone(task);
  const after = await c.restart('worker');
  assert.equal(after.status, 'interrupted'); assert.equal(after.task, task);
  assert.deepEqual(task, { ...before, status: 'interrupted', interruption: 'Worker stopped; inspect retained reports and changes before resuming' });
  const authority = JSON.parse(await fs.readFile(path.join(c.workerDir('worker'), 'authority.json'), 'utf8'));
  assert.equal(authority.phase, 'paused'); assert.equal(authority.leaseId, before.leaseId);
  await noWorkPrompts(c);
}));

test('staged model changes reject restart before touching an active assignment', { timeout: 15000 }, () => fixture(async ({ c, launches }) => {
  await c.start('worker'); const task = await retainedTask(c), before = structuredClone(task), intent = c.intent('worker');
  const next = structuredClone(c.config); next.workers[0].model = 'changed'; await c.updateConfig(next);
  await assert.rejects(c.restart('worker'), /pending until all tasks/);
  assert.deepEqual(task, before); assert.equal(c.intent('worker'), intent); assert.equal(launches.length, 1);
  assert.equal(launches[0].closed, false); assert.equal(c.restarts.size, 0);
}));

test('unconfirmed worker exit refuses a replacement and retains ownership', { timeout: 15000 }, () => fixture(async ({ c, launches }) => {
  await c.start('worker');
  const runtime = c.handles.get('worker'), stop = runtime.abortAndStop.bind(runtime);
  runtime.abortAndStop = async () => { throw Error('Exit could not be confirmed'); };
  try {
    await assert.rejects(c.restart('worker'), /Exit could not be confirmed/);
    assert.equal(launches.length, 1); assert.equal(c.handles.get('worker'), runtime);
    assert.match(c.record('worker').error, /EXIT_UNCONFIRMED/); assert.ok(c.releaseLock);
  } finally { runtime.abortAndStop = stop; }
  await c.restart('worker'); assert.equal(launches.length, 2);
}));

test('shutdown supersedes a pending restart and never reopens its session', { timeout: 15000 }, () => fixture(async ({ c, launches }) => {
  await c.start('worker');
  const restarting = c.restart('worker'), superseded = assert.rejects(restarting, /superseded|revoked/i);
  await c.close(); await superseded;
  assert.equal(launches.length, 1); assert.equal(c.handles.size, 0); assert.equal(c.restarts.size, 0);
}));

test('worker mesh root is private, overrides an inherited root, and survives restart', { timeout: 15000 }, () => fixture(async ({ c, base }) => {
  const inherited = path.join(base, 'inherited-shared-mesh');
  await fs.mkdir(inherited);
  const previous = process.env.PI_FABRIC_MESH_ROOT;
  process.env.PI_FABRIC_MESH_ROOT = inherited;
  try {
    const before = await c.start('worker');
    const root = path.join(c.workerDir('worker'), 'fabric', 'mesh');
    assert.equal(process.env.PI_FABRIC_MESH_ROOT, inherited, 'Main process environment must stay untouched');
    assert.equal(before.probe?.meshRoot, root, 'the child observes only the Pair-owned private mesh root');
    assert.notEqual(before.probe?.meshRoot, inherited, 'an inherited shared root must not select the worker mesh');
    assert.ok((await fs.stat(root)).isDirectory(), 'the private namespace is created before spawn');
    const beforeGeneration = before.workerGeneration;
    const after = await c.restart('worker');
    assert.equal(after.probe?.meshRoot, root, 'the private namespace is stable across a worker-only restart');
    assert.ok(after.workerGeneration > beforeGeneration, 'restart advanced the generation without rotating the mesh root');
    assert.equal(process.env.PI_FABRIC_MESH_ROOT, inherited, 'Main process environment must stay untouched');
  } finally {
    if (previous === undefined) delete process.env.PI_FABRIC_MESH_ROOT; else process.env.PI_FABRIC_MESH_ROOT = previous;
  }
}));

test('retained probes without a mesh observation stay readable; malformed observations do not', { timeout: 15000 }, () => fixture(async ({ c }) => {
  await c.start('worker');
  const expected = { ownerSession: c.ownerSession, cwd: c.cwd };
  const state = JSON.parse(await fs.readFile(path.join(c.dir, 'state.json'), 'utf8'));
  assert.ok(state.workers.worker.probe.meshRoot, 'new probes carry the live mesh observation');
  validateStoredState(state, expected);
  const legacy = structuredClone(state); delete legacy.workers.worker.probe.meshRoot;
  validateStoredState(legacy, expected); // probes retained before the field existed stay readable
  const historical = structuredClone(legacy);
  delete historical.workers.worker.probe.ownerEpoch; delete historical.workers.worker.probe.workerGeneration;
  validateStoredState(historical, expected); // older historical probes stay readable
  for (const [value, pattern] of [['relative/fabric/mesh', /meshRoot/], [5, /meshRoot/], [null, /meshRoot/]]) {
    const malformed = structuredClone(state); malformed.workers.worker.probe.meshRoot = value;
    assert.throws(() => validateStoredState(malformed, expected), pattern, `malformed mesh observation ${JSON.stringify(value)} must fail validation`);
  }
}));

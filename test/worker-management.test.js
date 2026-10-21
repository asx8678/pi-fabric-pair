import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PairController } from '../src/controller.js';
import { PiRpc } from '../src/rpc.js';
import { removeWorker as dropWorker } from '../src/worker-config.js';

const host = fileURLToPath(new URL('./helpers/restart-worker.js', import.meta.url));

/**
 * Two configured workers, a real controller and a fake Pi host for each launch. The rpcFactory asserts that a new
 * process only starts after every previous one has closed: that is the one-live-worker rule, checked where it is
 * enforced rather than inferred from the summary.
 * @param {(context: {c: PairController, base: string, launches: PiRpc[], notices: string[]}) => Promise<void>} run
 */
async function fixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-workers-'));
  const repo = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(repo); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  /** @type {PiRpc[]} */ const launches = [];
  /** @type {string[]} */ const notices = [];
  const c = new PairController({
    cwd: repo, ownerSession: 'workers-owner', storageDir: path.join(base, 'state'),
    config: {
      enabled: true, autoStart: false,
      workers: [
        { id: 'worker', provider: 'fixture', model: 'first', effort: 'low', cwd: null, readOnly: false },
        { id: 'ds2', provider: 'fixture', model: 'second', effort: 'low', cwd: null, readOnly: false },
      ],
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

/** A running task on a worker, as the dispatch path would leave it. @param {PairController} c @param {string} id */
async function holdTask(c, id) {
  const record = c.record(id);
  record.task = {
    id: `task-${id}`, workerId: id, requestId: `request-${id}`, objective: 'Hold', context: '', constraints: [],
    steps: [{ id: 'one', title: 'Work', instructions: 'fixture' }], stepIndex: 0, planRevision: 1, attemptId: 'attempt', attemptNumber: 1,
    status: 'running', leaseId: 'lease', policy: structuredClone(c.config.supervision), limits: structuredClone(c.config.limits),
    verification: structuredClone(c.config.verification), startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 1, usage: null,
    baseSnapshotRef: '/unused-fixture', pendingReport: null, report: null, decisions: {}, lastDecision: null,
  };
  record.status = 'working'; await c.writeAuthority(id, 'running'); await c.persist();
  return record.task;
}

/** @param {string} workerId @param {string} requestId */
const dispatchInput = (workerId, requestId) => ({
  workerId, requestId, objective: 'Switch test', context: 'Switch fixture context', constraints: ['fixture constraint'],
  steps: [{ id: 'one', title: 'Work', instructions: 'fixture' }],
});

test('switchTo stops an idle live worker, then starts the requested one', { timeout: 20000 }, () => fixture(async ({ c, launches }) => {
  await c.start('worker');
  assert.equal(launches.length, 1); assert.ok(c.handles.has('worker'));
  const result = await c.switchTo('ds2');
  assert.equal(result.steppedDown, 'worker');
  assert.equal(result.workerId, 'ds2');
  assert.equal(launches[0].closed, true, 'the displaced worker is confirmed exited');
  assert.equal(launches.length, 2);
  assert.ok(c.handles.has('ds2')); assert.equal(c.handles.has('worker'), false);
  assert.equal(c.record('worker').status, 'stopped');
  assert.equal(c.record('ds2').bound.model, 'second');
}));

test('switchTo refuses to displace a worker holding an unresolved task, and names it', { timeout: 20000 }, () => fixture(async ({ c, launches }) => {
  await c.start('worker');
  const task = await holdTask(c, 'worker');
  await assert.rejects(() => c.switchTo('ds2'), error => {
    assert.match(error.message, /Worker worker is running task task-worker/);
    assert.match(error.message, /one worker at a time/);
    return true;
  });
  assert.equal(launches.length, 1, 'nothing was started for the refusal');
  assert.ok(c.handles.has('worker'), 'the worker keeps its process');
  assert.equal(c.record('worker').task.id, task.id);
}));

test('switchTo is a plain start when no other worker is live', { timeout: 20000 }, () => fixture(async ({ c, launches }) => {
  const result = await c.switchTo('ds2');
  assert.equal(result.steppedDown, null);
  assert.equal(launches.length, 1);
  assert.ok(c.handles.has('ds2'));
}));

test('a refused dispatch does not stop the idle live worker on its way to being refused', { timeout: 20000 }, () => fixture(async ({ c, launches }) => {
  await c.start('worker');
  // A worker that holds an unresolved task blocks every dispatch, and the refusal must change nothing.
  await holdTask(c, 'worker');
  await assert.rejects(() => c.dispatch(dispatchInput('ds2', 'dispatch-refused')), /one unresolved assignment/);
  assert.equal(launches.length, 1); assert.equal(launches[0].closed, false);
  assert.ok(c.handles.has('worker'), 'the live worker keeps its process');
  assert.equal(c.record('worker').status, 'working', 'and keeps its task');
}));

test('a dispatch to a configured worker that is not live stands down an idle live one', { timeout: 20000 }, () => fixture(async ({ c, launches }) => {
  await c.start('worker');
  const accepted = await c.dispatch(dispatchInput('ds2', 'dispatch-switch'));
  assert.equal(accepted.workerId, 'ds2');
  assert.equal(launches.length, 2, 'ds2 got its own process');
  assert.equal(launches[0].closed, true, 'worker exited first');
  assert.equal(c.state.workers.ds2.task.status, 'activating');
  assert.equal(c.state.workers.worker.task, null, 'the displaced worker holds nothing');
}));

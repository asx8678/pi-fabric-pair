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
 * @param {(context: {c: PairController, base: string, launches: PiRpc[], saved: unknown[]}) => Promise<void>} run
 */
async function fixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-removal-'));
  const repo = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(repo); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  /** @type {PiRpc[]} */ const launches = [];
  /** @type {unknown[]} */ const saved = [];
  const c = new PairController({
    cwd: repo, ownerSession: 'removal-owner', storageDir: path.join(base, 'state'),
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
  });
  const save = async next => { saved.push(next); await c.updateConfig(next); };
  try { await c.init(); await run({ c, base, launches, save }); }
  finally { await c.close(); await fs.rm(base, { recursive: true, force: true }); }
}

/** @param {PairController} c @param {string} id */
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

test('removal requires confirmed exit, no task, and another worker to keep', { timeout: 20000 }, () => fixture(async ({ c, save }) => {
  await c.start('ds2');
  await assert.rejects(() => c.removeWorker('ds2', { save }), /Worker ds2 is running\. Stop it first/);
  await c.stop('ds2');
  const task = await holdTask(c, 'ds2');
  await assert.rejects(() => c.removeWorker('ds2', { save }), new RegExp(`Worker ds2 holds task ${task.id}`));
  c.record('ds2').task = null; c.record('ds2').status = 'stopped'; await c.persist();
  await assert.rejects(() => c.removeWorker('nobody', { save }), /Unknown worker nobody/);
  // The last worker stays: Pair always has somewhere to dispatch.
  await c.removeWorker('worker', { save });
  await assert.rejects(() => c.removeWorker('ds2', { save }), /at least one worker/);
}));

test('removing a busy worker cancels its task and stops it first, then removes it', { timeout: 20000 }, () => fixture(async ({ c, save, launches }) => {
  await c.start('ds2');
  const task = await holdTask(c, 'ds2');
  const process = launches.at(-1);
  assert.ok(process && !process.closed, 'the worker is running its task');
  const removed = await c.removeWorker('ds2', { stopFirst: true, keepConversation: true, save });
  assert.deepEqual(removed, { workerId: 'ds2', archived: true, conversation: 'kept' });
  assert.equal(process.closed, true, 'the process was stopped, and its exit confirmed, before the record went');
  assert.equal(c.state.workers.ds2, undefined, 'the worker is gone from state');
  assert.deepEqual(c.config.workers.map(worker => worker.id), ['worker'], 'and from the config');
  // The archive keeps what happened: the task was cancelled because the worker was removed.
  const dir = c.workerDir('ds2'), archive = (await fs.readdir(dir)).find(name => name.startsWith('removed-'));
  const record = JSON.parse(await fs.readFile(path.join(dir, String(archive)), 'utf8'));
  assert.equal(record.task.id, task.id); assert.equal(record.task.status, 'cancelled');
  assert.match(record.task.cancelReason, /The worker was removed/);
}));

test('the last worker is refused before anything is stopped: its task and process are left alone', { timeout: 20000 }, () => fixture(async ({ c, save, launches }) => {
  await c.removeWorker('worker', { save });
  await c.start('ds2');
  await holdTask(c, 'ds2');
  await assert.rejects(() => c.removeWorker('ds2', { stopFirst: true, save }), /at least one worker/);
  assert.equal(launches.at(-1)?.closed, false, 'still running');
  assert.equal(c.record('ds2').task?.status, 'running', 'its task was not cancelled on the way to a refusal');
}));

test('removal archives the state record and discards the directory only on request', { timeout: 20000 }, () => fixture(async ({ c, save }) => {
  await c.start('ds2');
  await c.stop('ds2');
  const dir = c.workerDir('ds2');
  const session = c.record('ds2').sessionFile;
  assert.ok(session && await fs.stat(session), 'a real session file exists to lose');
  const removed = await c.removeWorker('ds2', { keepConversation: false, save });
  assert.equal(removed.archived, true); assert.equal(removed.conversation, 'discarded');
  assert.equal(c.state.workers.ds2, undefined, 'the record is gone from state');
  assert.deepEqual(c.summary().workers.map(worker => worker.id), ['worker'], 'a removed worker disappears from the summary');
  await assert.rejects(() => fs.stat(session), 'the conversation file is deleted');
  await assert.rejects(() => fs.stat(dir), 'the worker directory is deleted');
}));

test('keepConversation keeps the directory so the same id resumes its conversation', { timeout: 20000 }, () => fixture(async ({ c, save }) => {
  await c.start('ds2');
  await c.stop('ds2');
  const session = c.record('ds2').sessionFile, dir = c.workerDir('ds2');
  assert.ok(session);
  const removed = await c.removeWorker('ds2', { keepConversation: true, save });
  assert.equal(removed.conversation, 'kept');
  assert.ok(await fs.stat(dir), 'the worker directory stays');
  const archives = (await fs.readdir(dir)).filter(name => name.startsWith('removed-'));
  assert.equal(archives.length, 1, 'the state record was archived in the worker directory');
  // Adding the id back with the same model resumes that conversation.
  const next = c.config;
  await c.updateConfig({ ...next, workers: [...next.workers, { id: 'ds2', provider: 'fixture', model: 'second', effort: 'low', cwd: null, readOnly: false }] });
  const record = await c.start('ds2');
  assert.equal(record.sessionFile, session, 'the kept session is reused');
}));

test('a failed save leaves the worker configured and its record restored', { timeout: 20000 }, () => fixture(async ({ c }) => {
  await c.start('ds2');
  await c.stop('ds2');
  const record = c.record('ds2');
  await assert.rejects(() => c.removeWorker('ds2', { save: async () => { throw new Error('disk full'); } }), /disk full/);
  assert.equal(c.state.workers.ds2, record, 'the record is back');
  assert.ok(c.config.workers.some(worker => worker.id === 'ds2'), 'the config entry was never removed');
  assert.ok(await fs.stat(c.workerDir('ds2')), 'the directory was not touched');
}));

test('removeWorker refuses without a save callback rather than dropping only half of it', { timeout: 20000 }, () => fixture(async ({ c }) => {
  await assert.rejects(() => c.removeWorker('ds2', {}), /needs a save callback/);
  assert.ok(c.config.workers.some(worker => worker.id === 'ds2'));
}));

test('the pure helper removes only an existing worker and never the last', () => {
  const config = { ...structuredClone(JSON.parse(JSON.stringify({ workers: [{ id: 'a', provider: 'p', model: 'm', effort: 'low', cwd: null, readOnly: false }] }))), version: 1 };
  assert.throws(() => dropWorker(config, 'zzz'), /No worker zzz/);
  assert.throws(() => dropWorker(config, 'a'), /at least one worker/);
});

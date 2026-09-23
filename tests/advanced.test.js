import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, assignment, awaitReport, approve, until } from './helpers.js';
import { runCommand } from '../src/evidence.js';
import { validateConfig } from '../src/config.js';
import { atomicJSON, clone, safeId } from '../src/util.js';

const worker = (id, readOnly = false, cwd = null) => ({ id, provider: 'fixture', model: 'worker-model', effort: 'medium', cwd, readOnly });

test('parallel read-only workers retain independent processes and conversations in one repository', async t => {
  const { c } = await fixture(t, { config: { maxWorkers: 2, workers: [worker('a', true), worker('b', true)] } });
  await Promise.all([c.dispatch(assignment('parallel-a', 'a', 1)), c.dispatch(assignment('parallel-b', 'b', 1))]);
  await Promise.all([awaitReport(c, 'a'), awaitReport(c, 'b')]);
  assert.notEqual(c.record('a').sessionId, c.record('b').sessionId);
  assert.notEqual(c.handles.get('a').rpc.pid, c.handles.get('b').rpc.pid);
  await approve(c, 'a'); await approve(c, 'b');
});

test('overlapping writers are rejected, even when the first writer is awaiting review', async t => {
  const { c } = await fixture(t, { config: { maxWorkers: 2, workers: [worker('a'), worker('b')] } });
  await c.dispatch(assignment('writer-a', 'a', 1)); await awaitReport(c, 'a');
  await assert.rejects(() => c.dispatch(assignment('writer-b', 'b', 1)), /own Git worktree/);
  await approve(c, 'a');
});

test('two independent Git worktrees allow parallel writers without sharing session state', async t => {
  const { c, cwd, tmp } = await fixture(t, { config: { maxWorkers: 2, workers: [worker('a'), worker('b')] } });
  const worktree = path.join(tmp, 'worktree-b');
  const result = await runCommand('git', ['worktree', 'add', '-q', '-b', 'pair-b', worktree], { cwd });
  assert.equal(result.code, 0, result.stderr);
  const config = clone(c.config); config.workers[1].cwd = worktree; c.updateConfig(config);
  await c.dispatch(assignment('worktree-a', 'a', 1)); await c.dispatch(assignment('worktree-b', 'b', 1));
  await awaitReport(c, 'a'); await awaitReport(c, 'b'); await approve(c, 'a'); await approve(c, 'b');
  assert.notEqual(c.record('a').repoRoot, c.record('b').repoRoot);
});

test('missing native compaction blocks worker startup; conversation is not silently re-created', async t => {
  const { c, home } = await fixture(t);
  await atomicJSON(path.join(home, 'settings.json'), { compaction: { enabled: false } });
  await assert.rejects(() => c.start('worker'), /compaction is disabled/);
  assert.equal(c.handles.size, 0); assert.ok(c.record('worker').sessionId);
});

test('Prewalk re-enabled after startup blocks the next dispatch before inference', async t => {
  const { c, home } = await fixture(t); await c.start('worker');
  await atomicJSON(path.join(home, 'fabric.json'), { prewalk: { enabled: true } });
  await assert.rejects(() => c.dispatch(assignment('native-conflict')), /Disable native Prewalk/);
  assert.equal(c.record('worker').task.status, 'interrupted'); assert.equal(c.record('worker').usage, null);
});

test('failed state initialization releases its ownership lock', async t => {
  const f = await fixture(t); await f.c.close();
  const stateFile = path.join(f.c.dir, 'state.json'); await fs.writeFile(stateFile, '{invalid');
  await assert.rejects(() => f.makeController().init());
  await assert.rejects(fs.access(path.join(f.c.dir, '.owner-lock')));
});

test('same Main session cannot be attached to two concurrent controllers', async t => {
  const f = await fixture(t);
  await assert.rejects(() => f.makeController().init(), /already owned/);
});

test('malformed worker report is quarantined and interrupts, not endlessly re-read', async t => {
  const { c } = await fixture(t, { scenario: 'hang' }); await c.dispatch(assignment('bad-report'));
  const file = path.join(c.workerDir('worker'), 'inbox', 'report-bad.json'); await fs.writeFile(file, 'not-json');
  await until(() => c.record('worker').task.status === 'interrupted');
  assert.match(c.record('worker').error, /Invalid worker report/);
  await until(async () => { try { await fs.access(file); return false; } catch { return true; } });
  await fs.access(path.join(c.workerDir('worker'), 'archive', 'report-bad.json'));
});

test('changed worker settings wait for task completion and keep its session afterward', async t => {
  const { c } = await fixture(t); await c.dispatch(assignment('model-change', 'worker', 1)); await awaitReport(c);
  const initial = c.summary().workers[0]; const config = clone(c.config); config.workers[0].effort = 'high'; c.updateConfig(config);
  await assert.rejects(() => c.start('worker'), /pending until/);
  await approve(c); await c.start('worker');
  assert.equal(c.record('worker').sessionId, initial.sessionId); assert.equal(c.summary().workers[0].pid, initial.pid);
  assert.equal((await c.handles.get('worker').rpc.send('get_state')).thinkingLevel, 'high');
});

test('soft output budget stops further worker inference without resetting its session', async t => {
  const { c } = await fixture(t, { config: { limits: { maxOutputTokens: 1 } } });
  await c.dispatch(assignment('budget')); const pid = c.handles.get('worker').rpc.pid;
  await until(() => ['paused', 'review', 'interrupted'].includes(c.record('worker').task.status));
  if (c.record('worker').task.status === 'review') await approve(c);
  assert.ok(['paused', 'interrupted'].includes(c.record('worker').task.status));
  assert.equal(c.record('worker').usage.requests, 1);
  assert.equal(c.handles.get('worker').rpc.pid, pid);
});

test('config rejects unknown nested keys and prototype-inherited IDs', () => {
  assert.throws(() => validateConfig({ runtime: { warmCache: true } }), /Unknown runtime/);
  assert.throws(() => validateConfig({ verification: { timeoutMs: -1 } }), /timeoutMs/);
  for (const id of ['constructor', 'prototype', 'toString', '__proto__']) assert.throws(() => safeId(id));
});

test('cancel interrupts controller verification without waiting for its full timeout', async t => {
  const { c } = await fixture(t, { config: { verification: { commands: [{ name: 'slow check', command: process.execPath, args: ['-e', 'setTimeout(()=>{},60000)'] }], timeoutMs: 65000 } } });
  await c.dispatch(assignment('cancel-check', 'worker', 1));
  await until(() => c.handles.get('worker').verificationAbort);
  const start = Date.now(); await c.cancel('worker', 'Do not keep waiting for verification.');
  assert.ok(Date.now() - start < 4000); assert.equal(c.record('worker').task.status, 'cancelled');
  assert.equal(c.record('worker').task.report, null);
});

test('a missing completed worker session is never replaced by a blank conversation', async t => {
  const { c } = await fixture(t); await c.dispatch(assignment('lost-history', 'worker', 1)); await awaitReport(c); await approve(c);
  await c.stop('worker'); const id = c.record('worker').sessionId;
  await fs.unlink(c.record('worker').sessionFile);
  await assert.rejects(() => c.start('worker'), /session file is missing/);
  assert.equal(c.record('worker').sessionId, id); assert.equal(c.handles.size, 0);
});

test('final-only supervision executes one whole-plan assignment and requires final acceptance', async t => {
  const { c } = await fixture(t, { config: { supervision: { mode: 'final' } } });
  await c.dispatch(assignment('final-mode', 'worker', 3)); await awaitReport(c, 'worker', 'final_review');
  assert.equal(c.record('worker').task.status, 'review'); await approve(c);
  assert.equal(c.record('worker').task.status, 'completed'); assert.equal(c.record('worker').usage.requests, 1);
});

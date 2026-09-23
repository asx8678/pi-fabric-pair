import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, assignment, awaitReport, approve, until } from './helpers.js';
import { digest } from '../src/util.js';

test('two-step handoff retains one PID/session; completion does not stop the worker', async t => {
  const { c, notices } = await fixture(t);
  await c.start('worker'); const initial = c.summary().workers[0];
  const accepted = await c.dispatch(assignment());
  assert.equal(accepted.status, 'running');
  await awaitReport(c, 'worker', 'checkpoint'); assert.equal(notices.length, 1);
  await approve(c); await awaitReport(c, 'worker', 'final_review');
  await approve(c);
  const final = c.summary().workers[0];
  assert.equal(final.pid, initial.pid); assert.equal(final.sessionId, initial.sessionId); assert.equal(final.status, 'ready');
  assert.equal(final.task.status, 'completed'); assert.equal(notices.length, 2);
  assert.ok(final.usage.cacheRead > 0);
  await c.dispatch(assignment('request-2', 'worker', 1)); await awaitReport(c); await approve(c);
  assert.equal(c.summary().workers[0].pid, initial.pid);
  assert.equal(c.summary().workers[0].sessionId, initial.sessionId);
});

test('question yields; answer resumes the same conversation automatically', async t => {
  const { c } = await fixture(t, { scenario: 'question' });
  await c.dispatch(assignment('ask', 'worker', 1)); const firstPid = c.summary().workers[0].pid;
  const question = await awaitReport(c, 'worker', 'question'); const task = c.state.workers.worker.task;
  await assert.rejects(() => c.decide({ workerId: 'worker', taskId: task.id, reportId: question.reportId, action: 'approve', feedback: 'yes', checkpointHash: question.checkpoint.checkpointHash }), /Only review/);
  await c.decide({ workerId: 'worker', taskId: task.id, reportId: question.reportId, action: 'answer', feedback: 'Yes, preserve the current API.' });
  await awaitReport(c, 'worker', 'final_review'); await approve(c);
  assert.equal(c.summary().workers[0].pid, firstPid);
});

test('idempotent dispatch and decisions do not create another run', async t => {
  const { c } = await fixture(t);
  const input = assignment('idempotent', 'worker', 1), first = await c.dispatch(input);
  const duplicate = await c.dispatch(input); assert.equal(duplicate.taskId, first.taskId); assert.equal(duplicate.duplicate, true);
  await assert.rejects(() => c.dispatch({ ...input, objective: 'different' }), /already used/);
  const report = await awaitReport(c); await c.inspect('worker'); const task = c.state.workers.worker.task;
  const decision = { workerId: 'worker', taskId: task.id, reportId: report.reportId, action: 'approve', feedback: 'Reviewed.', checkpointHash: report.checkpoint.checkpointHash };
  await c.decide(decision); const again = await c.decide(decision); assert.equal(again.duplicate, true);
  assert.equal(c.state.workers.worker.usage.requests, 1);
});

test('approvals require evidence inspection and reject a changed workspace', async t => {
  const { c, cwd } = await fixture(t, { scenario: 'write' });
  await c.dispatch(assignment('stale', 'worker', 1)); const report = await awaitReport(c); const task = c.state.workers.worker.task;
  const decision = { workerId: 'worker', taskId: task.id, reportId: report.reportId, action: 'approve', feedback: 'Reviewed.', checkpointHash: report.checkpoint.checkpointHash };
  await assert.rejects(() => c.decide(decision), /Inspect/);
  const before = await c.inspect('worker', report.reportId, 'generated.txt'); assert.match(before.content, /generated for/);
  await fs.writeFile(path.join(cwd, 'generated.txt'), 'changed externally');
  await assert.rejects(() => c.decide(decision), /STALE_CHECKPOINT/);
  const immutable = await c.inspect('worker', report.reportId, 'generated.txt'); assert.equal(immutable.content, before.content);
  assert.equal(task.status, 'review');
});

test('native compaction command preserves worker identity and task-state restoration', async t => {
  const { c } = await fixture(t);
  await c.dispatch(assignment('compact')); await awaitReport(c);
  const h = c.handles.get('worker'), sessionId = c.state.workers.worker.sessionId, pid = h.rpc.pid;
  await h.rpc.send('compact', {});
  const transcript = await h.rpc.send('get_messages'); assert.ok(transcript.messages.some(m => String(m.content).includes('fabric-pair.task-state')));
  await approve(c); await awaitReport(c, 'worker', 'final_review'); await approve(c);
  assert.equal(c.state.workers.worker.sessionId, sessionId); assert.equal(h.rpc.pid, pid);
});

test('Fovea-like continuation after a report cannot write', async t => {
  const { c, cwd } = await fixture(t, { foveaContinue: true });
  await c.dispatch(assignment('fovea', 'worker', 1)); await awaitReport(c); await approve(c);
  await assert.rejects(fs.access(path.join(cwd, 'must-not-exist')));
});

test('failed configured checks block approval', async t => {
  const { c } = await fixture(t, { config: { verification: { commands: [{ name: 'fails', command: process.execPath, args: ['-e', 'process.exit(2)'] }], requirePassing: true, timeoutMs: 2000 } } });
  await c.dispatch(assignment('checks', 'worker', 1)); const report = await awaitReport(c); await c.inspect('worker');
  assert.equal(report.checkpoint.verification[0].passed, false);
  await assert.rejects(() => approve(c), /verification failed/);
});

test('revision limit stops repeated rework without resetting a session', async t => {
  const { c } = await fixture(t, { config: { supervision: { maxRevisions: 1 } } });
  await c.dispatch(assignment('revisions', 'worker', 1)); let report = await awaitReport(c), task = c.state.workers.worker.task;
  await c.decide({ workerId: 'worker', taskId: task.id, reportId: report.reportId, action: 'revise', feedback: 'Inspect again.' });
  await until(() => c.state.workers.worker.task.report?.reportId !== report.reportId && c.state.workers.worker.task.status === 'review');
  report = c.state.workers.worker.task.report;
  await assert.rejects(() => c.decide({ workerId: 'worker', taskId: task.id, reportId: report.reportId, action: 'revise', feedback: 'Again.' }), /Revision limit/);
  assert.equal(task.revisions, 1);
});

test('worker permission dialogs are forwarded and explicitly answered', async t => {
  const { c, dialogs } = await fixture(t, { scenario: 'permission' });
  await c.dispatch(assignment('permission', 'worker', 1)); await awaitReport(c); await approve(c);
  assert.equal(dialogs.length, 1); assert.equal(dialogs[0].event.method, 'confirm');
});

test('prose-only completion becomes attention-needed rather than an automatic replay', async t => {
  const { c } = await fixture(t, { scenario: 'no-report' });
  await c.dispatch(assignment('no-report', 'worker', 1));
  await until(() => c.state.workers.worker.task.status === 'interrupted');
  assert.match(c.state.workers.worker.error, /without pair_report/);
  assert.equal(c.state.workers.worker.usage.requests, 1);
});

test('cancel retains the process and closes authorization', async t => {
  const { c } = await fixture(t, { scenario: 'hang' });
  await c.dispatch(assignment('cancel')); const pid = c.summary().workers[0].pid;
  await c.cancel('worker', 'stop now');
  assert.equal(c.state.workers.worker.task.status, 'cancelled'); assert.equal(c.summary().workers[0].pid, pid);
  const gate = JSON.parse(await fs.readFile(path.join(c.workerDir('worker'), 'authority.json'), 'utf8'));
  assert.equal(gate.phase, 'idle');
});

test('controller restart reopens stored conversation but does not replay work', async t => {
  const f = await fixture(t); await f.c.dispatch(assignment('restart', 'worker', 1)); await awaitReport(f.c); await approve(f.c);
  const id = f.c.state.workers.worker.sessionId, oldPid = f.c.summary().workers[0].pid;
  await f.c.close(); const next = await f.makeController().init(); f.controllers.push(next); await next.start('worker');
  assert.equal(next.state.workers.worker.sessionId, id); assert.notEqual(next.summary().workers[0].pid, oldPid);
  assert.equal(next.state.workers.worker.task.status, 'completed');
});

test('stale reports from a superseded lease are archived without corrupting a new task', async t => {
  const { c } = await fixture(t); await c.dispatch(assignment('old', 'worker', 1)); const report = await awaitReport(c); await approve(c);
  await c.dispatch(assignment('new', 'worker', 1));
  await c.serial.run(() => c.acceptReport('worker', { ...report, nonce: 'stale-process' }));
  await awaitReport(c); assert.notEqual(c.state.workers.worker.task.id, report.payload.taskId); await approve(c);
});

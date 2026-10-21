// The user's second bug, end to end: editing Pair's own settings while a review waits must not make the report
// stale, and must not show up as a changed file in the checkpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { registerMain } from '../src/main.js';
import { configPaths } from '../src/config.js';
import { digest } from '../src/util.js';

async function mainFixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-owned-main-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true }); await fs.mkdir(path.join(base, 'agent'));
  const cwd = await fs.realpath(path.join(base, 'repo')), home = path.join(base, 'agent');
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd });
  execFileSync('git', ['config', 'user.name', 'Pair Test'], { cwd });
  await fs.writeFile(path.join(cwd, 'app.js'), 'export const v = 1;\n');
  execFileSync('git', ['add', '--', 'app.js'], { cwd }); execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  const files = configPaths(cwd);
  // Pair's own config is untracked, exactly like the user's real .pi/fabric-pair.json.
  await fs.writeFile(files.project, JSON.stringify({ version: 2, enabled: true, autoStart: false, mainSupervision: true,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }] }));
  const events = new Map(), commands = new Map(), tools = new Map(), notices = [];
  const ctx = { cwd, mode: 'rpc', hasUI: true, isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => 'owned-paths-owner', getSessionFile: () => path.join(home, 'main.jsonl') }, getContextUsage: () => undefined,
    model: { provider: 'main', id: 'native' }, modelRegistry: { getAvailable: () => [], find: () => undefined }, hasPendingMessages: () => false,
    ui: { select: async () => undefined, input: async () => undefined, confirm: async () => true, editor: async () => undefined,
      setStatus: () => {}, setWidget: () => {}, notify: (message, level) => notices.push({ message, level }) } };
  const pi = { on: (name, fn) => events.set(name, fn), registerCommand: (name, command) => commands.set(name, command), registerShortcut: () => {},
    registerTool: tool => tools.set(tool.name, tool), getAllTools: () => [], getCommands: () => [], appendEntry: () => {},
    getThinkingLevel: () => 'medium', sendMessage: () => {}, sendUserMessage: () => {} };
  const main = registerMain(pi);
  /** @type {import('../src/controller.js').PairController | null} */ let controller = null;
  try {
    await events.get('session_start')({}, ctx);
    controller = main.getController(); assert.ok(controller);
    // No worker process in this fixture: the task and its frozen report are built below.
    controller.rpcFactory = () => { throw Error('RPC spawn forbidden in this fixture'); };
    await run({ controller, tools, ctx, cwd, files, base, notices, events,
      tool: async (name, params) => JSON.parse((await tools.get(name).execute('call', params, undefined, undefined, ctx)).content[0].text) });
  } finally {
    // This fixture's task is parked in review: no process, no lease, and nothing for Pair to shut down.
    const bound = controller;
    // This fixture never started a process, so it must leave no record that says one is running.
    if (bound) {
      for (const worker of Object.values(bound.state.workers)) { if (worker.task) worker.task.status = 'cancelled'; worker.status = 'stopped'; }
      await bound.persist().catch(() => {});
    }
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

/** A one-step task with a real frozen checkpoint in review, in the exact shapes dispatch/finalizeReport persist. */
async function reviewTask(c, cwd) {
  const spec = c.config.workers[0];
  // A worker record shaped as a started worker leaves it, without ever spawning a process.
  const record = { id: spec.id, cwd, repoRoot: cwd, status: 'stopped', bound: spec, workerGeneration: 1, sessionId: 'session-owned',
    sessionFile: path.join(c.dir, 'fixture-session.jsonl'), history: [], usage: null, task: null };
  c.state.workers[spec.id] = record;
  const base = await c.evidence.capture(cwd);
  const baseRef = await c.evidence.saveSnapshot(base);
  // The worker's step changes a real file.
  await fs.writeFile(path.join(cwd, 'app.js'), 'export const v = 2;\n');
  const current = await c.evidence.capture(cwd);
  const checkpoint = await c.evidence.checkpoint('task-owned-1', 'report-owned-1', base, current);
  const snapshotRef = await c.evidence.saveSnapshot(current);
  const payload = { taskId: 'task-owned-1', stepId: 'one', kind: 'checkpoint', summary: 'Changed the constant', stepComplete: true };
  const task = { id: 'task-owned-1', requestId: 'request-owned-1', workerId: spec.id, objective: 'Fix one thing', context: 'fixture', constraints: [], steps: [{ id: 'one', title: 'Edit the app', instructions: 'Change the constant' }],
    stepIndex: 0, planRevision: 1, attemptId: 'attempt-owned-1', attemptNumber: 1, status: 'review', leaseId: 'lease-owned-1',
    policy: structuredClone(c.config.supervision), limits: structuredClone(c.config.limits), verification: structuredClone(c.config.verification),
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 1, usage: null, baseSnapshotRef: baseRef, pendingReport: null, decisions: {}, lastDecision: null,
    report: { version: 1, reportId: 'report-owned-1', workerId: spec.id, ownerSession: c.ownerSession, ownerEpoch: c.state.ownerEpoch, workerGeneration: record.workerGeneration,
      nonce: 'n', sessionId: record.sessionId, leaseId: 'lease-owned-1', attemptId: 'attempt-owned-1', attemptNumber: 1, planRevision: 1,
      payload, payloadHash: digest(payload), createdAt: Date.now(), checkpoint, snapshotRef } };
  await fs.writeFile(record.sessionFile, `${JSON.stringify({ type: 'session', version: 3, id: 'session-owned', timestamp: new Date().toISOString(), cwd })}\n`);
  record.task = task;
  c.state.notices['report-owned-1'] = { reportId: 'report-owned-1', workerId: spec.id, taskId: task.id, ownerEpoch: c.state.ownerEpoch, workerGeneration: record.workerGeneration,
    attemptId: 'attempt-owned-1', deliveryOperationId: 'delivery-owned-1', status: 'pending', createdAt: Date.now() };
  await c.persist();
  // No process was ever reserved, so hand the repo locks back before shutdown (a real dispatch holds them until
  // the task ends, which this fixture does not do).
  await c.releaseRepoLocks(true);
  return { task, checkpoint };
}

test('editing Pair settings between a report and its approval neither stales the report nor shows up as a change', () => mainFixture(async f => {
  const { task } = await reviewTask(f.controller, f.cwd);
  assert.deepEqual(task.report.checkpoint.changed, ['app.js'], 'the checkpoint lists only the worker\'s file');
  await f.tool('pair_inspect', { workerId: 'worker', reportId: 'report-owned-1' });
  // The human edits Pair's settings while the report waits: the untracked project config, and a backup next to it.
  const config = JSON.parse(await fs.readFile(f.files.project, 'utf8'));
  await fs.writeFile(f.files.project, JSON.stringify({ ...config, mainSupervision: false }));
  await fs.writeFile(`${f.files.project}.v1.bak`, JSON.stringify(config));
  // Approval proceeds, and the checkpoint's hash still matches the workspace.
  const decision = await f.tool('pair_decide', { workerId: 'worker', taskId: task.id, reportId: 'report-owned-1', action: 'approve', feedback: 'Correct and complete', checkpointHash: task.report.checkpoint.checkpointHash });
  assert.equal(decision.status, 'completed', 'the step is approved, not refused as STALE_CHECKPOINT');
  const live = await f.controller.evidence.capture(f.cwd);
  assert.equal(live.entries.some(entry => entry.path.startsWith('.pi/')), false, 'no Pair-owned file is in the workspace snapshot');
  assert.deepEqual(live.entries.map(entry => entry.path), ['app.js'], 'and nothing else either');
}));

test('a real source change is still STALE_CHECKPOINT', () => mainFixture(async f => {
  const { task } = await reviewTask(f.controller, f.cwd);
  await f.tool('pair_inspect', { workerId: 'worker', reportId: 'report-owned-1' });
  await fs.writeFile(path.join(f.cwd, 'app.js'), 'export const v = 3;\n');
  await assert.rejects(() => f.tool('pair_decide', { workerId: 'worker', taskId: task.id, reportId: 'report-owned-1', action: 'approve', feedback: 'x', checkpointHash: task.report.checkpoint.checkpointHash }),
    /STALE_CHECKPOINT/, 'the exclusion does not weaken the checkpoint fence');
}));

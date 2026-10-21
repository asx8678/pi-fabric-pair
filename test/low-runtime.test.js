// The low backend: a worker driven through `low --serve` / `low --send` instead of Pi RPC.
// Offline: a fake low (helpers/fake-low.mjs) speaks low's inbox protocol, so no model is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PairController } from '../src/controller.js';
import { loadConfig } from '../src/config.js';
import { LOW_WORKER_NOTE, lowReportPayload } from '../src/low-runtime.js';

const FAKE = fileURLToPath(new URL('./helpers/fake-low.mjs', import.meta.url));
const steps = [{ id: 's1', title: 'First', instructions: 'Do the first thing' }, { id: 's2', title: 'Second', instructions: 'Then this' }];
const task = (stepIndex = 0, mode = 'every-step', summaryDetail = 'normal') => ({ id: 'task-1', objective: 'o', planRevision: 1, attemptId: 'attempt-1', attemptNumber: 1, constraints: [], steps, stepIndex,
  policy: { mode, finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail, maxStepFiles: 5 }, limits: { maxReportBytes: 16384 }, lastDecision: null });
const done = { status: 'done', exit: 0, verdict: 'VERIFIED', good: true, answer: 'Fixed `calc.py:2`.', criteria: 'add(2, 3) == 5', check: 'passed on the final tree', changes: ['calc.py +1 −1', 'src/new file.py +12 −0', 'old.py (deleted)', 'logo.png (binary)'] };

test('a verified low result on an intermediate step is a complete checkpoint with low\'s verdict as a check', () => {
  const payload = lowReportPayload(done, /** @type {any} */ (task(0)));
  assert.equal(payload.kind, 'checkpoint'); assert.equal(payload.stepId, 's1'); assert.equal(payload.stepComplete, true);
  assert.deepEqual(payload.changedFiles, ['calc.py', 'src/new file.py', 'old.py', 'logo.png']);
  assert.deepEqual(payload.checks, [{ name: 'low verdict', result: 'pass', detail: 'VERIFIED — passed on the final tree' }]);
  assert.deepEqual(payload.decisions, ['Done means: add(2, 3) == 5']);
});

test('the last step, or any step under final-only supervision, reports a final review', () => {
  assert.equal(lowReportPayload(done, /** @type {any} */ (task(1))).kind, 'final_review');
  assert.equal(lowReportPayload(done, /** @type {any} */ (task(0, 'final-only'))).kind, 'final_review');
});

test('an unverified result is an incomplete checkpoint whose check failed; a question, an error and a stop map to their kinds', () => {
  const unverified = lowReportPayload({ ...done, status: 'unverified', exit: 1, verdict: 'UNVERIFIED', good: false, check: 'failed' }, /** @type {any} */ (task(0)));
  assert.equal(unverified.kind, 'checkpoint'); assert.equal(unverified.stepComplete, false); assert.equal(unverified.checks?.[0].result, 'fail');
  const question = lowReportPayload({ status: 'question', exit: 4, question: 'Which port?', answer: 'I need a port.' }, /** @type {any} */ (task(0)));
  assert.equal(question.kind, 'question'); assert.equal(question.question, 'Which port?');
  const error = lowReportPayload({ status: 'error', exit: 3, error: '429 from the provider' }, /** @type {any} */ (task(0)));
  assert.equal(error.kind, 'blocked'); assert.match(error.summary, /429/);
  assert.equal(lowReportPayload({ status: 'stopped', exit: 5, limit: 'stopped after 60 model requests' }, /** @type {any} */ (task(0))).kind, 'blocked');
});

test('a long answer is shortened to fit the summary policy instead of failing the report', () => {
  const payload = lowReportPayload({ ...done, answer: 'x'.repeat(20000) }, /** @type {any} */ (task(0, 'every-step', 'minimal')));
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= 4000);
  assert.ok(payload.summary.length >= 200);
});

test('a report too large even with a short summary falls back to a blocked report instead of faulting the worker', () => {
  const changes = Array.from({ length: 200 }, (_, i) => `src/${'deep/'.repeat(30)}file-${i}.js +1 −1`);
  const payload = lowReportPayload({ ...done, changes }, /** @type {any} */ (task(0)));
  assert.equal(payload.kind, 'blocked'); assert.match(payload.summary, /200 changed files/);
  assert.equal(payload.changedFiles, undefined);
});

test('low\'s second look, plan, undo and steers it never took reach Main as checks and decisions', () => {
  const payload = lowReportPayload({ ...done, verdict: 'NO CHECK', check: '-', claims: { held: ['add() returns the sum'], contradicted: ['tests cover negatives'], uncertain: [] },
    plan: { steps: ['read calc.py', 'fix add()', 'add a test'], done: [1, 2] }, undo: 'git restore --source=abc --worktree -- .', steers: { taken: 1, dropped: 2 } }, /** @type {any} */ (task(0)));
  assert.deepEqual(payload.checks?.[1], { name: 'low second look', result: 'fail', detail: '1 held, 1 contradicted, 0 uncertain — contradicted: tests cover negatives — held: add() returns the sum' });
  assert.deepEqual(payload.decisions, ['Done means: add(2, 3) == 5',
    '2 steers from Main came after low\'s last model request and were not taken (1 taken); send them again if still needed.',
    'low\'s plan (2/3 done): ✓ read calc.py; ✓ fix add(); · add a test', 'Undo low\'s changes: git restore --source=abc --worktree -- .']);
  const held = lowReportPayload({ ...done, claims: { held: ['ok'], contradicted: [], uncertain: [] }, steers: { taken: 1, dropped: 0 } }, /** @type {any} */ (task(0)));
  assert.equal(held.checks?.[1].result, 'pass');
  assert.deepEqual(held.decisions, ['Done means: add(2, 3) == 5'], 'a steer that was taken needs no decision line');
});

test('low\'s extras are dropped before the answer is shortened', () => {
  const answer = 'a'.repeat(2500), plan = { steps: Array.from({ length: 10 }, (_, i) => `step ${i} ${'x'.repeat(150)}`), done: [] };
  const payload = lowReportPayload({ ...done, answer, plan, undo: 'git restore -- .' }, /** @type {any} */ (task(0, 'every-step', 'minimal')));
  assert.equal(payload.summary, answer);
  assert.deepEqual(payload.decisions, ['Done means: add(2, 3) == 5']);
});

/** @param {object[]} plan @param {Record<string, unknown>} [runtime] @param {Record<string, string>} [env] @param {{now?: () => number, heartbeatMs?: number, beforePublish?: () => void | Promise<void>}} [lowOptions] */
async function fixture(plan, runtime = {}, env = {}, lowOptions = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-low-'));
  const home = path.join(base, 'home'), results = path.join(base, 'results.json');
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true }); await fs.mkdir(home);
  // low keeps its sessions under $HOME/.low. Point the whole fixture at this one home — the process (which is what
  // os.homedir() reads, and so what the runtime's resume check reads) and the spawned low alike — so resume is
  // decided by configuration rather than by mutating os.homedir() midway through a test.
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  await fs.writeFile(results, JSON.stringify(plan));
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'README.md'), 'fixture\n');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'init', '--allow-empty'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false,
    supervision: { mode: 'every-step' },
    runtime: { backend: 'low', lowCommand: 'low', ...runtime },
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'opendesign', model: 'deepseek-v4.1-flash', effort: 'high', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  /** @type {string[]} */ const notices = [];
  const controller = new PairController({
    config: loaded.config, cwd: repo, ownerSession: 'low-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 100,
    callbacks: { notifyUser: message => { notices.push(message); }, promptUser: async () => ({ cancelled: true }) },
    spawnLow: /** @type {any} */ ((/** @type {string} */ _command, /** @type {string[]} */ args, /** @type {any} */ options) =>
      spawn(process.execPath, [FAKE, ...args], { ...options, env: { ...options.env, HOME: home, FAKE_LOW_RESULTS: results, ...env } })),
    lowOptions,
  });
  await controller.init();
  const log = async () => (await fs.readFile(path.join(home, 'fake-low.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  return { base, repo, home, controller, notices, log, previousHome };
}
/** @param {() => boolean | Promise<boolean>} condition @param {string} what */
async function until(condition, what, ms = 15000) {
  const end = Date.now() + ms;
  while (!(await condition())) { assert.ok(Date.now() < end, `timed out waiting for ${what}`); await new Promise(resolve => setTimeout(resolve, 50)); }
}
/** @param {Awaited<ReturnType<typeof fixture>>} f */
async function cleanup(f) {
  await f.controller.close().catch(() => {});
  if (f.previousHome === undefined) delete process.env.HOME; else process.env.HOME = f.previousHome;
  await fs.rm(f.base, { recursive: true, force: true }).catch(() => {});
}
const dispatch = { workerId: 'worker', requestId: 'req-1', objective: 'Fix add()', context: 'calc.py', constraints: [], steps };

test('a dispatched step runs as one low task and comes back as a checkpoint report Main can review', async () => {
  const f = await fixture([{ result: done, delayMs: 200 }], { lowArgs: ['--protect', 'secrets'] });
  try {
    await f.controller.dispatch(dispatch);
    const record = () => f.controller.state.workers.worker;
    await until(() => record().task?.status === 'review', 'the checkpoint to reach review');
    const report = record().task?.report;
    assert.equal(report?.payload.kind, 'checkpoint'); assert.equal(report?.payload.stepId, 's1');
    assert.deepEqual(report?.payload.changedFiles, ['calc.py', 'src/new file.py', 'old.py', 'logo.png']);
    const entries = await f.log();
    const serve = entries.find(e => e.kind === 'serve');
    // lowArgs go to --serve only: low refuses --send with any other option.
    assert.deepEqual(serve.args.slice(0, 7), ['--protect', 'secrets', '--serve', '-m', 'opendesign:deepseek-v4.1-flash', '--effort', 'high']);
    assert.ok(entries.filter(e => e.kind === 'send').every(e => e.args[0] === '--send'), 'no --send carried lowArgs');
    assert.ok(entries.some(e => e.kind === 'send'));
    const sent = entries.filter(e => e.kind === 'task');
    assert.equal(sent.length, 1);
    assert.match(sent[0].task, /^FABRIC PAIR WORK ORDER/);
    assert.ok(sent[0].task.endsWith(LOW_WORKER_NOTE));
    assert.equal(record().sessionFile, path.join(f.home, '.low', 'sessions', `${serve.id}.jsonl`));
    assert.equal(record().sessionId, serve.id);
  } finally { await cleanup(f); }
});

test('a low worker sees later steps by title only, so it cannot run ahead of Main\'s step review', async () => {
  // Seen live with the real low: given step 2's instructions in the plan, it did step 2 during step 1.
  const f = await fixture([{ result: done, delayMs: 200 }]);
  try {
    await f.controller.dispatch(dispatch);
    await until(() => f.controller.state.workers.worker.task?.status === 'review', 'the checkpoint');
    const order = (await f.log()).find(e => e.kind === 'task').task;
    const packet = JSON.parse(order.split('\n')[1]);
    assert.deepEqual(packet.authorizedStep, steps[0]);
    assert.deepEqual(packet.plan, [steps[0], { id: 's2', title: 'Second', authorized: false }], 'the later step has no instructions');
    assert.equal(order.includes(steps[1].instructions), false);
    assert.match(order, /Later steps are listed by title/);
  } finally { await cleanup(f); }
});

test('a steer reaches the running low task, and cancelling aborts it without a report', async () => {
  const f = await fixture([{ result: done, delayMs: 20000 }]);
  try {
    await f.controller.dispatch(dispatch);
    const record = () => f.controller.state.workers.worker;
    await until(async () => (await f.log()).some(e => e.kind === 'task'), 'the task to reach low');
    await until(() => record().task?.status === 'running', 'the task to run');
    const t = /** @type {NonNullable<ReturnType<typeof record>['task']>} */ (record().task), runtime = /** @type {any} */ (f.controller.handles.get('worker'));
    assert.equal(await runtime.steerCurrent({ taskId: t.id, attemptId: t.attemptId, leaseId: t.leaseId, workerGeneration: record().workerGeneration }, 'Prefer   the\nsmall fix'), 'queued');
    await until(async () => (await f.log()).some(e => e.kind === 'steer'), 'the steer to reach low');
    assert.equal((await f.log()).find(e => e.kind === 'steer').text, 'Prefer the small fix');
    const began = Date.now();
    await f.controller.cancel('worker', 'Changed my mind');
    await until(async () => (await f.log()).some(e => e.kind === 'abort'), 'the abort to reach low');
    await until(() => runtime.snapshot().idle === true, 'the worker to settle', 10000);
    assert.ok(Date.now() - began < 10000, 'the abort ended the task long before its 20 s run');
    assert.equal(record().task?.status, 'cancelled');
    assert.equal(record().task?.report ?? null, null);
    const inbox = await fs.readdir(path.join(f.controller.workerDir('worker'), 'inbox'));
    assert.deepEqual(inbox.filter(n => n.endsWith('.json')), []);
  } finally { await cleanup(f); }
});

test('a question from low becomes a question report', async () => {
  const f = await fixture([{ result: { status: 'question', exit: 4, verdict: 'QUESTION', good: false, answer: 'Two ports are free.', question: 'Use 3000 or 8080?', changes: [] } }]);
  try {
    await f.controller.dispatch(dispatch);
    await until(() => f.controller.state.workers.worker.task?.status === 'question', 'the question');
    assert.equal(f.controller.state.workers.worker.task?.report?.payload.question, 'Use 3000 or 8080?');
  } finally { await cleanup(f); }
});

test('approving the checkpoint sends the next step to the same low session, and the last step comes back as a final review', async () => {
  const f = await fixture([{ result: done }, { result: { ...done, answer: 'Second step done.' } }]);
  try {
    await f.controller.dispatch(dispatch);
    const record = () => f.controller.state.workers.worker;
    await until(() => record().task?.status === 'review', 'the checkpoint');
    await f.controller.inspect('worker');
    const t = /** @type {any} */ (record().task);
    await f.controller.decide({ workerId: 'worker', taskId: t.id, reportId: t.report.reportId, action: 'approve', feedback: 'Good.', checkpointHash: t.report.checkpoint.checkpointHash });
    await until(() => record().task?.status === 'review' && record().task?.report?.payload.kind === 'final_review', 'the final review');
    assert.equal(record().task?.report?.payload.stepId, 's2');
    // The invariant is "one low process, one session, both steps". Its source of truth is the runtime Pair owns and
    // the session record it kept — not the fake's log, which is a second write that can lag the state it describes.
    // So the runtime is what the test waits on and asserts; the log is only used afterwards to read what low was told.
    const first = /** @type {any} */ (f.controller.handles.get('worker'));
    await until(async () => (await f.log()).filter(entry => entry.kind === 'task').length === 2, 'the second step to reach low');
    assert.equal(record().sessionId, first.sessionId, 'the next step ran in the session the first step used');
    assert.ok(!first.closed, 'the same low --serve is still the live one');
    assert.equal(record().pid, first.pid, 'the same low process served both steps');
    const tasks = (await f.log()).filter(entry => entry.kind === 'task');
    assert.equal(tasks.length, 2, 'low received both steps as tasks');
    assert.match(tasks[1].task, /MAIN DECISION/);
  } finally { await cleanup(f); }
});

test('a restarted worker resumes its low session instead of starting a blank one', async () => {
  const f = await fixture([{ result: done }]);
  try {
    await f.controller.start('worker');
    const first = f.controller.state.workers.worker.sessionId;
    const runtime = /** @type {any} */ (f.controller.handles.get('worker'));
    await f.controller.stop('worker');
    await until(() => f.controller.state.workers.worker.status === 'stopped', 'the worker to stop');
    // Wait on the runtime's own state, not on a log line. Pair sends low `/stop` first but falls back to signalling the
    // process group, and that send is best effort: under load it can fail to spawn at all (EAGAIN) or arrive as the
    // server is already going. A /stop line is therefore a side effect the product deliberately does not guarantee,
    // while a closed runtime with an expected, proven exit is the guarantee. Waiting for the side effect made this test
    // fail for a correctly stopped worker — proved directly by making the /stop send fail: the worker still closed with
    // an expected SIGTERM exit, reported 'stopped', and resumed the same session with no /stop line written.
    const exit = runtime.snapshot().exit;
    assert.ok(runtime.closed, 'the runtime is closed');
    assert.ok(exit, 'the runtime recorded an exit');
    assert.equal(exit.expected, true, 'the exit was the stop Pair asked for, not a crash');
    assert.equal(f.controller.state.workers.worker.status, 'stopped');
    // The fixture points $HOME at its own home, so the runtime's resume check and the fake's sessions agree without
    // any mid-test patching: the restart is decided by the same rule production uses.
    await f.controller.start('worker');
    const serves = (await f.log()).filter(e => e.kind === 'serve');
    assert.equal(serves.length, 2);
    assert.deepEqual(serves[1].args.slice(-2), ['--session', first]);
    assert.equal(f.controller.state.workers.worker.sessionId, first);
  } finally { await cleanup(f); }
});

test('while a low task runs Pair watches its status: progress, the run as the tool, activity, the transcript and pings', async () => {
  const plan = { steps: ['read calc.py', 'fix add()'], done: [1] };
  const f = await fixture([{ result: done, delayMs: 20000, what: 'grep -n add calc.py', plan, lateSteers: true }]);
  try {
    await f.controller.dispatch(dispatch);
    const record = () => f.controller.state.workers.worker;
    await until(() => record().task?.status === 'running', 'the task to run');
    const runtime = /** @type {any} */ (f.controller.handles.get('worker'));
    await until(() => runtime.progress?.running?.what === 'grep -n add calc.py', 'the status to be read');
    const t = /** @type {any} */ (record().task);
    await runtime.steerCurrent({ taskId: t.id, attemptId: t.attemptId, leaseId: t.leaseId, workerGeneration: record().workerGeneration }, 'Keep it small');
    await until(() => runtime.progress?.steers.pending === 1, 'the steer to show as pending');
    assert.equal(runtime.snapshot().steering, 1);
    const peek = /** @type {any} */ (await f.controller.peek('worker'));
    assert.deepEqual(peek.progress.plan, plan);
    assert.equal(peek.progress.intent, 'Working on it.');
    assert.equal(peek.progress.requests, 1);
    assert.equal(peek.liveness.state, 'tool'); assert.equal(peek.liveness.tool.name, 'run');
    assert.match(String(peek.lastAssistantText), /run|Keep it small|FABRIC PAIR/);
    assert.ok(Date.now() - runtime.snapshot().lastEventAt < 5000, 'a moving task is a recent event');
    await f.controller.refreshActivity('worker');
    assert.deepEqual(f.controller.recentActivity.get('worker')?.map(e => [e.tool, e.target]), [['run', 'grep -n add calc.py']]);
    assert.equal(await runtime.ping(1000), true);
    const transcript = await f.controller.transcript('worker');
    assert.match(transcript, /◆ Pair\n {2}FABRIC PAIR WORK ORDER/);
    assert.match(transcript, /◆ worker\n {2}→ run/);
    await f.controller.cancel('worker', 'done looking');
    await until(() => runtime.snapshot().idle === true, 'the worker to settle', 10000);
    assert.equal(runtime.progress, null);
  } finally { await cleanup(f); }
});

test('a low task that stands still is not kept alive by the server\'s heartbeat', async () => {
  const f = await fixture([{ result: done, delayMs: 20000, stuck: true }]);
  try {
    await f.controller.dispatch(dispatch);
    const runtime = /** @type {any} */ (f.controller.handles.get('worker'));
    await until(() => !!runtime.progress, 'the status to be read');
    const moved = runtime.progress.movedAt;
    await new Promise(resolve => setTimeout(resolve, 4500));
    assert.equal(runtime.progress.movedAt, moved);
    assert.ok(runtime.progress.at > moved + 3000, 'the heartbeat went on');
    assert.ok(runtime.snapshot().lastEventAt <= moved + 1000, 'but the last event is when the task last moved');
    assert.equal(await runtime.ping(1000), true, 'a server with a fresh heartbeat still answers');
  } finally { await cleanup(f); }
});

test('a steer that came too late shows in the report; an older low without a status file still works', async () => {
  const f = await fixture([{ result: done, delayMs: 1500, lateSteers: true }], {}, { FAKE_LOW_NO_STATUS: '1' });
  try {
    await f.controller.dispatch(dispatch);
    const record = () => f.controller.state.workers.worker;
    await until(() => record().task?.status === 'running' && !!f.controller.handles.get('worker')?.snapshot().accepted, 'the task to run');
    const runtime = /** @type {any} */ (f.controller.handles.get('worker')), t = /** @type {any} */ (record().task);
    await until(async () => (await f.log()).some(e => e.kind === 'task'), 'the task to reach low');
    await runtime.steerCurrent({ taskId: t.id, attemptId: t.attemptId, leaseId: t.leaseId, workerGeneration: record().workerGeneration }, 'Too late');
    assert.equal(await runtime.ping(1000), true);
    await until(() => record().task?.status === 'review', 'the checkpoint');
    assert.equal(runtime.progress, null);
    assert.match(String(record().task?.report?.payload.decisions?.[1]), /^1 steer from Main came after low's last model request and was not taken/);
  } finally { await cleanup(f); }
});

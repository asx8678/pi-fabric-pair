// The watchdog against a real LowRuntime on the fake low host: the same scan code paths that drive a Pi worker.
// Each test starts a real low task, moves the world into the state a hang produces, and asserts what Pair did.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PairController } from '../src/controller.js';
import { loadConfig } from '../src/config.js';

const FAKE = fileURLToPath(new URL('./helpers/fake-low.mjs', import.meta.url));
const steps = [{ id: 's1', title: 'First', instructions: 'Do the first thing' }, { id: 's2', title: 'Second', instructions: 'Then this' }];
const dispatch = { workerId: 'worker', requestId: 'req-watchdog', objective: 'Watch a low task', context: 'README.md', constraints: [], steps };
const done = { status: 'done', exit: 0, verdict: 'VERIFIED', good: true, answer: 'Finished.', changes: ['README.md +1 −1'] };

/**
 * A controller whose worker really is a low worker, plus the handles a watchdog test needs: the running task, the
 * live runtime, and the fake's log.
 * @param {object[]} plan one entry per task @param {Record<string, string>} [env] switches for the fake low
 */
async function fixture(plan, env = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-low-wd-'));
  const home = path.join(base, 'home'), results = path.join(base, 'results.json');
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true }); await fs.mkdir(home);
  const previousHome = process.env.HOME; process.env.HOME = home;
  await fs.writeFile(results, JSON.stringify(plan));
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'README.md'), 'fixture\n');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'init', '--allow-empty'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false,
    supervision: { mode: 'every-step' },
    runtime: { backend: 'low', lowCommand: 'low' },
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    control: { toolMaxMs: 60000, silentMs: 10000, pingTimeoutMs: 1000, maxAutoRecoveriesPerStep: 2 },
    workers: [{ id: 'worker', provider: 'opendesign', model: 'deepseek-v4.1-flash', effort: 'high', cwd: null, readOnly: false }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const notices = [], mainNotices = [];
  const controller = new PairController({
    config: loaded.config, cwd: repo, ownerSession: 'low-watchdog-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser: (message, level = 'info') => notices.push({ message, level }), superviseMain: message => mainNotices.push(message),
      noticeMain: message => mainNotices.push(message), promptUser: async () => ({ cancelled: true }) },
    spawnLow: /** @type {any} */ ((/** @type {string} */ _command, /** @type {string[]} */ args, /** @type {any} */ options) =>
      spawn(process.execPath, [FAKE, ...args], { ...options, env: { ...options.env, HOME: home, FAKE_LOW_RESULTS: results, ...env } })),
  });
  await controller.init();
  const log = async () => (await fs.readFile(path.join(home, 'fake-low.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  /** The running task and its live runtime, once the fake low has taken the work. */
  const running = async () => {
    const record = () => controller.state.workers.worker;
    await until(() => record().task?.status === 'running', 'the task to run');
    const runtime = /** @type {any} */ (controller.handles.get('worker'));
    await until(async () => (await log()).some(entry => entry.kind === 'task'), 'the fake low to take the work');
    return { task: /** @type {any} */ (record().task), runtime, record };
  };
  const stop = async () => {
    await controller.close().catch(() => {});
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  };
  return { base, repo, home, controller, notices, mainNotices, log, running, stop };
}
/** @param {() => boolean | Promise<boolean>} condition @param {string} what */
async function until(condition, what, ms = 20000) {
  const end = Date.now() + ms;
  while (!(await condition())) { assert.ok(Date.now() < end, `timed out waiting for ${what}`); await new Promise(resolve => setTimeout(resolve, 50)); }
}
/** The liveness the watchdog decides from, for this worker right now. */
const livenessOf = (/** @type {any} */ controller) => controller.workerLiveness('worker');

test('tool limit: a low run past control.toolMaxMs is stopped by the watchdog and the step re-activated', async () => {
  const f = await fixture([{ result: done, delayMs: 60000, what: 'run() the tests' }]);
  try {
    await f.controller.dispatch(dispatch);
    const { task, runtime } = await f.running();
    const resumed = [];
    f.controller.resume = async (/** @type {string} */ _id, /** @type {any} */ recovery) => { resumed.push(recovery); return { taskId: task.id }; };
    // A run that never ends is what low's own status reports: `running` whose `ms` keeps growing. Lowering the limit
    // rather than faking the run keeps this on the real path — the fake server's status file is what the runtime
    // reads, the run age in it is real, and nothing is patched. `control` is outside configHash, so trimming it
    // mid-run is allowed (it is how a human tunes it), and the watchdog reads it when it decides.
    f.controller.config.control.toolMaxMs = 300;
    // The controller's own scan drives this, not a hand-called watchdogHangs: the point is that the scan code path
    // reaches the same rung for a low worker as for a Pi worker. Waiting for the notice it acts on — rather than
    // for a patched snapshot or a log line — is what makes the test deterministic.
    await until(() => f.notices.some(n => n.level === 'warning' && /stopped by the watchdog/.test(n.message)), 'the watchdog to stop the run');
    const stopped = f.notices.find(n => n.level === 'warning' && /stopped by the watchdog/.test(n.message));
    assert.ok(stopped, `the human is told: ${JSON.stringify(f.notices)}`);
    assert.match(stopped.message, /Tool run ran 1 min; stopped by the watchdog/);
    // Containment (abortCurrent, confirmed exit) finishes before the recovery is attempted, so the two are a
    // sequence, not one event: waiting for the recovery is waiting for the second half of it.
    await until(() => resumed.length === 1, 'the step to be re-activated');
    assert.equal(resumed[0].by, 'watchdog');
    assert.match(String(resumed[0].instruction), /Do not run it again unchanged/);
    assert.equal(task.watchdog.recoveries, 1, 'the recovery came out of the per-step budget');
    // The abort really reached low, not just the controller's bookkeeping.
    await until(async () => (await f.log()).some(entry => entry.kind === 'abort' || entry.kind === 'stop'), 'low to be told to abort');
  } finally { await f.stop(); }
});

test('silence: a quiet low worker is silent once a tool is not under way, and twice the window aborts it', async () => {
  const f = await fixture([{ result: done, delayMs: 60000, stuck: true }]);
  try {
    await f.controller.dispatch(dispatch);
    const { task, runtime } = await f.running();
    // No run under way (a running tool is progress, never silence), a quiet window, and the ping already spent: the
    // second window is what turns a quiet worker into a stalled request. The window is a real setting and is read
    // when the decision is made, so shrinking it puts the worker in the silence it describes without patching the
    // runtime — a patched snapshot() is overwritten by the next status read, which is what made this flaky.
    f.controller.config.control.silentMs = 250;
    // The rung reads the same clock the liveness does, and it wants twice the window: wait for the age it will see
    // rather than for the first window, so the assertion and the decision are about the same moment.
    await until(() => (livenessOf(f.controller).lastEventAgoMs ?? 0) >= 500, 'the quiet window to elapse');
    task.watchdog = { ...f.controller.watchdogFor(task), pingedAt: Date.now() - 250 };
    const liveness = livenessOf(f.controller);
    assert.equal(liveness.state, 'silent', `a quiet worker is silence: ${JSON.stringify(liveness)}`);
    assert.ok((liveness.lastEventAgoMs ?? 0) >= 500, `the quiet age is what the rung reads: ${JSON.stringify(liveness)}`);
    // The control path still answers a live server, so this is a stalled request rather than a frozen process.
    assert.equal(await runtime.ping(1000), true, 'the server itself answers');
    const resumed = [];
    f.controller.resume = async (/** @type {string} */ _id, /** @type {any} */ recovery) => { resumed.push(recovery); return { taskId: task.id }; };
    assert.equal(await f.controller.watchdogHangs('worker', task), true, 'the stalled request was acted on');
    assert.ok(f.notices.some(n => /stalled request was aborted by the watchdog/.test(n.message)), `the human is told: ${JSON.stringify(f.notices)}`);
    assert.equal(resumed.length, 1);
    assert.match(String(resumed[0].instruction), /previous model request stalled/);
  } finally { await f.stop(); }
});

test('frozen: a low server that stops answering is stopped, and its task is held for the human', async () => {
  // The process lives but its loop no longer answers: ping is false, so the watchdog takes the frozen rung. Pair
  // stops the worker and restarts it; the restart path is exercised here by noticing the stop really happened.
  const f = await fixture([{ result: done, delayMs: 60000 }]);
  try {
    await f.controller.dispatch(dispatch);
    const { task, runtime } = await f.running();
    // A frozen server: not idle, 25 s quiet, and it does not answer.
    const base = runtime.snapshot.bind(runtime);
    runtime.snapshot = () => ({ ...base(), tool: null, lastEventAt: Date.now() - 25000 });
    runtime.ping = async () => false;
    // No ping spent yet: the watchdog's first silent window is the one that asks the process whether it is alive,
    // and a process that does not answer is the frozen rung rather than the stalled one.
    task.watchdog = { ...f.controller.watchdogFor(task), pingedAt: null };
    assert.equal(livenessOf(f.controller).state, 'silent', 'a frozen server is silent, not streaming');
    const resumes = [];
    f.controller.resume = async (/** @type {string} */ _id, /** @type {any} */ recovery) => { resumes.push(recovery); return { taskId: task.id }; };
    await f.controller.watchdogHangs('worker', task);
    assert.ok(f.notices.some(n => /stopped answering/.test(n.message)), `the human is told: ${JSON.stringify(f.notices)}`);
    // A frozen worker is stopped (not aborted): the record says so, and the task is held rather than lost.
    assert.equal(f.controller.state.workers.worker.status, 'stopped', 'the frozen process was stopped');
    assert.equal(await runtime.ping(1000), false, 'and it is gone');
  } finally { await f.stop(); }
});

test('crash: a low server that exits mid-task is noticed, and only a proven exit is recovered', async () => {
  const f = await fixture([{ result: done, delayMs: 60000 }], { FAKE_LOW_CRASH_MS: '400' });
  try {
    await f.controller.dispatch(dispatch);
    const { runtime } = await f.running();
    await until(async () => (await f.log()).some(entry => entry.kind === 'crash'), 'the fake server to crash');
    // The runtime closes on its own: that is what the scan sees, and the task is held with an error, not lost.
    // Waiting for `closed` alone is not enough — closed is set when the exit is *observed*, and the record that
    // carries the reaped exit code is what exitProof reads. Waiting for the record the assertion depends on is what
    // makes this deterministic; the earlier version raced a PID that a busy machine had already recycled.
    await until(() => runtime.closed === true && runtime.exit !== null, 'the runtime to record the exit');
    assert.equal(runtime.exit?.expected, false, 'the exit was not expected');
    // The runtime that spawned the process is the authority on its exit: it is the one the operating system told.
    // Passing it explicitly is what the controller does for a live handle, and it is what keeps this proof
    // independent of whether the scan has already contained (and released) the handle by the time we ask.
    const proof = await f.controller.exitProof(f.controller.state.workers.worker, runtime);
    assert.equal(proof.exited, true, `the exit is provable, so a crash may be recovered: ${JSON.stringify(proof)}`);
    assert.match(String(proof.reason), /exited/);
    // The proof names the reaped exit, so it does not depend on what the PID number means by now.
    assert.match(String(proof.reason), /exit code 9/, `the reason cites the reaped exit: ${proof.reason}`);
  } finally { await f.stop(); }
});

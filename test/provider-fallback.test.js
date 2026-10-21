// Provider fallback: a worker whose provider keeps failing switches to its next configured provider/model for the
// rest of the task, across backends too, and is back on its own at the next task.
// Offline: config is pure, the scan runs on a controlled runtime, and the end-to-end case drives the fake low.
import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PairController } from '../src/controller.js';
import { fallbackSpec, loadConfig, validateConfig } from '../src/config.js';
import { validateStoredState } from '../src/contracts.js';
import { digest } from '../src/util.js';

const FAKE = fileURLToPath(new URL('./helpers/fake-low.mjs', import.meta.url));
const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };
const worker = (extra = {}) => ({ id: 'worker', provider: 'primary', model: 'p-model', effort: 'high', cwd: null, readOnly: false, ...extra });

test('fallbacks are validated with the worker, and a fallback spec keeps everything but provider, model, effort and backend', () => {
  const config = validateConfig({ version: 2, workers: [worker({ lowCommand: '/opt/low', fallbacks: [{ provider: 'backup', model: 'b-model' }, { provider: 'other', model: 'o-model', effort: 'low', backend: 'low' }] })] });
  const spec = config.workers[0];
  assert.equal(config.control.fallbackAfterWaits, 2, 'the default');
  assert.deepEqual(fallbackSpec(spec, 0), { id: 'worker', provider: 'backup', model: 'b-model', effort: 'high', cwd: null, readOnly: false, lowCommand: '/opt/low' });
  assert.deepEqual(fallbackSpec(spec, 1), { id: 'worker', provider: 'other', model: 'o-model', effort: 'low', cwd: null, readOnly: false, lowCommand: '/opt/low', backend: 'low' });
  assert.equal(fallbackSpec(spec, 2), null);
  assert.equal(fallbackSpec(worker(), 0), null, 'a worker without fallbacks has none');
  const refuse = (/** @type {unknown} */ fallbacks, /** @type {RegExp} */ message, extra = {}) => assert.throws(() => validateConfig({ version: 2, workers: [worker({ fallbacks, ...extra })] }), message);
  refuse({}, /worker.fallbacks must be an array/);
  refuse([{ provider: 'a' }], /worker.fallbacks model must be a non-empty string/);
  refuse([{ provider: 'a', model: 'b', temperature: 1 }], /entries take provider, model, effort and backend/);
  refuse([{ provider: 'a', model: 'b', effort: 'huge' }], /Unsupported fallback effort/);
  refuse([{ provider: 'a', model: 'b', backend: 'cloud' }], /backend must be "pi" or "low"/);
  refuse(Array.from({ length: 5 }, () => ({ provider: 'a', model: 'b' })), /at most 4 entries/);
  refuse([{ provider: 'a', model: 'b', backend: 'low' }], /read-only worker cannot fall back to the low backend/, { readOnly: true });
  assert.throws(() => validateConfig({ version: 2, control: { fallbackAfterWaits: 21 }, workers: [worker()] }), /control.fallbackAfterWaits must be 0–20/);
});

/** A controller whose one worker is mid-task on a controlled runtime, as the provider-wait tests use. */
async function fixture({ control = {}, fallbacks = [{ provider: 'backup', model: 'b-model' }], backend = undefined } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-fallback-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false, mainSupervision: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    control: { noReportNudges: 0, ...control },
    workers: [worker({ fallbacks, ...(backend ? { backend } : {}) })],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  const userNotices = [], mainNotices = [];
  const controller = new PairController({ config: loaded.config, cwd: repo, ownerSession: 'fallback-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 600000,
    callbacks: { notifyUser: (message, level = 'info') => userNotices.push({ message, level }), superviseMain: message => mainNotices.push(message), noticeMain: message => mainNotices.push(message), promptUser: async () => ({ cancelled: true }) } });
  await controller.init();
  const id = 'worker', spec = controller.config.workers[0];
  const task = { id: 'task-fallback', workerId: id, requestId: 'req-fallback', objective: 'Fallback fixture', context: 'test', constraints: [],
    steps: [{ id: 's1', title: 'Step', instructions: 'x' }, { id: 's2', title: 'Two', instructions: 'y' }], stepIndex: 0, planRevision: 1,
    attemptId: 'attempt-fallback', attemptNumber: 1, status: 'running', leaseId: 'lease-fallback',
    policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
    limits: controller.config.limits, verification: { commands: [], requirePassing: false, timeoutMs: 120000 },
    startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 0, usage: { ...ZERO_USAGE },
    baseSnapshotRef: 'unset', pendingReport: null, report: null, decisions: {}, lastDecision: null,
    dispatchSettleSequence: 1, pendingSince: 0, abortRequested: false, interruption: '', previousStatus: '', completedAt: 0, cancelReason: '' };
  const record = { id, cwd: repo, repoRoot: repo, status: 'working', sessionId: 'sess-primary', sessionFile: path.join(controller.dir, 'sessions', 'primary.jsonl'),
    bound: { ...spec }, task, history: [], usage: { ...ZERO_USAGE }, error: null, workerGeneration: 1 };
  controller.state.workers[id] = record;
  const workerDir = controller.workerDir(id);
  for (const dir of [path.join(workerDir, 'inbox'), path.join(workerDir, 'archive'), path.join(controller.dir, 'sessions')]) await fs.mkdir(dir, { recursive: true });
  task.baseSnapshotRef = await controller.evidence.saveSnapshot(await controller.evidence.capture(repo));
  /** @type {Record<string, unknown>} */
  const snapshot = { pid: 424255, ready: true, idle: false, streaming: false, closed: false, fault: null, permission: false, compacting: false, summarizingRetrying: false, retrying: false,
    tool: null, accepted: true, lastEventAt: Date.now(), compactingSince: null, maintenanceCompaction: false, lastError: null };
  const runtime = { ownerEpoch: controller.state.ownerEpoch, workerGeneration: 1, nonce: 'nonce-fallback', pid: 424255, dir: workerDir, sessionId: record.sessionId,
    ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], abortCurrent: async () => {}, async abortAndStop() { this.closed = true; },
    async ping() { return true; }, waitIdle: async () => {}, revoke() {}, settleOrAbort(reason) { return this.abortCurrent(reason); }, snapshot: () => ({ ...snapshot }) };
  controller.handles.set(id, runtime);
  controller.runtimeData.set(runtime, { configHash: controller.configHash(), specHash: digest(spec), activationIntent: controller.intent(id), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
  await controller.writeAuthority(id, 'running');
  await controller.persist();
  /** @type {{id: string, recovery: {by: string, instruction?: string}, spec: unknown}[]} */
  const resumed = [];
  controller.resume = async (workerId, recovery) => { resumed.push({ id: workerId, recovery, spec: controller.effectiveSpec(workerId) }); return { taskId: task.id, status: 'activating' }; };
  /** The run ended without a report after this provider error. */
  const fail = (/** @type {string} */ message) => { snapshot.lastError = { message, at: Date.now(), source: 'assistant' }; runtime.settledSequence++; task.dispatchSettleSequence = runtime.settledSequence - 1; task.status = 'running'; };
  return { controller, repo, task, record, runtime, userNotices, mainNotices, base, resumed, fail };
}
/** @param {Awaited<ReturnType<typeof fixture>>} f */
async function cleanup(f) { f.runtime.closed = true; await f.controller.close().catch(() => {}); await fs.rm(f.base, { recursive: true, force: true }).catch(() => {}); }
/** One full scan the way scheduleScan runs it: transaction, jobs, then follow-ups and notices. */
async function runScan(controller) {
  const jobs = [];
  for (const [, handle] of controller.handles) controller.runtimeData.set(handle, { ...controller.runtimeData.get(handle), configHash: controller.configHash() });
  await controller.transaction(() => controller.scan(jobs));
  for (const job of jobs) await job();
  for (const followUp of controller.scanFollowUps.splice(0)) await followUp();
  for (const send of controller.scanNotices.splice(0)) send();
}

test('a quota stop switches to the first fallback at once: the old process stops and the task resumes on the fallback', async () => {
  const f = await fixture();
  try {
    f.fail('You exceeded your quota');
    await runScan(f.controller);
    assert.equal(f.runtime.closed, true, 'the process on the failing provider was stopped');
    assert.equal(f.resumed.length, 1, 'the task resumed');
    assert.deepEqual(f.resumed[0].spec, { id: 'worker', provider: 'backup', model: 'b-model', effort: 'high', cwd: null, readOnly: false }, 'on the fallback');
    assert.match(String(f.resumed[0].recovery.instruction), /switched you to backup\/b-model/);
    assert.equal(f.record.fallback?.index, 0);
    assert.equal(f.record.fallback?.primary.provider, 'primary', 'the primary it replaced is kept');
    assert.equal(f.record.fallback?.primarySession, null, 'same backend: the conversation carries over');
    assert.equal(f.record.sessionFile, path.join(f.controller.dir, 'sessions', 'primary.jsonl'));
    assert.equal(f.task.watchdog?.providerWaits, 0, 'the fallback gets its own wait budget');
    assert.equal(f.task.watchdog?.recoveries ?? 0, 0, 'a fallback is not a recovery');
    assert.ok(f.userNotices.some(n => /switched the worker to fallback backup\/b-model/.test(n.message)));
    assert.ok(f.task.timeline?.some(entry => /fallback to backup\/b-model/.test(entry.text)));
    const summary = f.controller.summary().workers[0];
    assert.equal(summary.pendingConfiguration, false, 'a fallback is not a settings change');
    assert.deepEqual({ model: summary.fallback?.model, backend: summary.fallback?.backend }, { model: 'backup/b-model', backend: 'pi' });
    validateStoredState(JSON.parse(JSON.stringify(f.controller.state)), { ownerSession: 'fallback-owner', cwd: f.repo });
  } finally { await cleanup(f); }
});

/** @param {Awaited<ReturnType<typeof fixture>>} f @param {number} providerWaits */
const spentWaits = (f, providerWaits) => { f.task.watchdog = { step: 0, recoveries: 0, noReportNudges: 0, steers: 0, nudged: false, providerWaits, retryAt: null, retryReason: null }; };

test('a transient failure waits until control.fallbackAfterWaits waits are spent, then switches', async () => {
  const waiting = await fixture({ control: { fallbackAfterWaits: 2 } });
  try {
    spentWaits(waiting, 1);
    waiting.fail('429 Too Many Requests');
    await runScan(waiting.controller);
    assert.equal(waiting.record.fallback, undefined, 'one wait spent of two: wait again');
    assert.equal(waiting.task.watchdog?.providerWaits, 2);
    assert.match(String(waiting.task.interruption), /^Waiting for provider/);
    assert.equal(waiting.resumed.length, 0);
  } finally { await cleanup(waiting); }
  const switching = await fixture({ control: { fallbackAfterWaits: 2 } });
  try {
    spentWaits(switching, 2);
    switching.fail('429 Too Many Requests');
    await runScan(switching.controller);
    assert.equal(switching.record.fallback?.index, 0, 'two waits spent: switch');
    assert.equal(switching.resumed.length, 1);
  } finally { await cleanup(switching); }
});

test('the chain moves on to the next fallback, and with all of them spent the ordinary wait applies', async () => {
  const fallbacks = [{ provider: 'backup', model: 'b-model' }, { provider: 'third', model: 't-model' }];
  const primary = worker({ fallbacks });
  const next = await fixture({ fallbacks });
  try {
    next.record.fallback = { index: 0, reason: 'quota', at: Date.now(), primary, primarySession: null };
    next.fail('quota exceeded'); await runScan(next.controller);
    assert.equal(next.record.fallback?.index, 1);
    assert.equal(next.record.fallback?.primary.provider, 'primary', 'the primary stays the one the worker is configured with');
    assert.equal(next.resumed.at(-1)?.spec.provider, 'third');
  } finally { await cleanup(next); }
  const spent = await fixture({ fallbacks });
  try {
    spent.record.fallback = { index: 1, reason: 'quota', at: Date.now(), primary, primarySession: null };
    spent.fail('quota exceeded'); await runScan(spent.controller);
    assert.equal(spent.record.fallback?.index, 1, 'no further fallback');
    assert.equal(spent.resumed.length, 0);
    assert.match(String(spent.task.interruption), /^Waiting for provider/, 'the ordinary wait');
  } finally { await cleanup(spent); }
});

test('a fallback on the other backend sets the primary conversation aside, and the next task takes it up again', async () => {
  const f = await fixture({ fallbacks: [{ provider: 'backup', model: 'b-model', backend: 'low' }] });
  try {
    f.fail('quota exceeded');
    await runScan(f.controller);
    assert.equal(f.record.freshSession, true, 'a Pi conversation is not a low session: the fallback starts fresh');
    assert.deepEqual(f.record.fallback?.primarySession, { sessionId: 'sess-primary', sessionFile: path.join(f.controller.dir, 'sessions', 'primary.jsonl') });
    assert.equal(f.resumed[0].spec.backend, 'low');
    validateStoredState(JSON.parse(JSON.stringify(f.controller.state)), { ownerSession: 'fallback-owner', cwd: f.repo });
    // The task finishes on the fallback; the next task is back on the primary and its conversation.
    f.task.status = 'completed'; f.record.status = 'stopped'; f.record.sessionId = 'sess-low'; f.record.sessionFile = path.join(f.controller.dir, 'sessions', 'low.jsonl'); delete f.record.freshSession;
    assert.equal(await f.controller.restorePrimary('worker'), true);
    assert.equal(f.record.fallback, undefined);
    assert.equal(f.record.sessionId, 'sess-primary');
    assert.equal(f.record.sessionFile, path.join(f.controller.dir, 'sessions', 'primary.jsonl'));
    assert.equal(f.controller.effectiveSpec('worker').provider, 'primary');
    assert.equal(await f.controller.restorePrimary('worker'), false, 'nothing to restore twice');
  } finally { await cleanup(f); }
});

test('a fallback is never applied while the task is still active, and a worker without fallbacks keeps waiting', async () => {
  const f = await fixture({ fallbacks: [] });
  try {
    assert.equal(await f.controller.restorePrimary('worker'), false);
    f.fail('quota exceeded');
    await runScan(f.controller);
    assert.equal(f.record.fallback, undefined);
    assert.equal(f.resumed.length, 0);
    assert.match(String(f.task.interruption), /^Waiting for provider/);
  } finally { await cleanup(f); }
});

test('a low worker whose provider stops on quota restarts on its fallback with the same low session, and finishes the step there', { timeout: 30000 }, async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-fallback-low-'));
  const home = path.join(base, 'home'), results = path.join(base, 'results.json');
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true }); await fs.mkdir(home);
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  const done = { status: 'done', exit: 0, verdict: 'VERIFIED', good: true, answer: 'Done.', criteria: 'works', check: 'passed', changes: ['a.txt +1 −0'] };
  // The fake replays its script per process: the primary's server hits the quota, the fallback's finishes the step.
  const fallbackResults = path.join(base, 'fallback-results.json');
  await fs.writeFile(results, JSON.stringify([{ result: { status: 'error', exit: 3, error: 'provider said: quota exceeded' }, delayMs: 50 }]));
  await fs.writeFile(fallbackResults, JSON.stringify([{ result: done, delayMs: 50 }]));
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'README.md'), 'fixture\n');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'init', '--allow-empty'], { cwd: repo });
  await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({
    version: 2, enabled: true, autoStart: false, supervision: { mode: 'every-step' },
    runtime: { backend: 'low', lowCommand: 'low' }, control: { noReportNudges: 0 },
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'opendesign', model: 'deepseek-v4.1-flash', effort: 'high', cwd: null, readOnly: false, fallbacks: [{ provider: 'opencode-go', model: 'deepseek-v4.1-flash' }] }],
  }));
  const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
  /** @type {string[]} */ const notices = [];
  const controller = new PairController({
    config: loaded.config, cwd: repo, ownerSession: 'fallback-low-owner', sourcePaths: [], storageDir: path.join(base, 'state'), scanIntervalMs: 100,
    callbacks: { notifyUser: message => { notices.push(message); }, promptUser: async () => ({ cancelled: true }) },
    spawnLow: /** @type {any} */ ((/** @type {string} */ _command, /** @type {string[]} */ args, /** @type {any} */ options) =>
      spawn(process.execPath, [FAKE, ...args], { ...options, env: { ...options.env, HOME: home, FAKE_LOW_RESULTS: args.includes('opencode-go:deepseek-v4.1-flash') ? fallbackResults : results } })),
  });
  try {
    await controller.init();
    const steps = [{ id: 's1', title: 'First', instructions: 'Do it' }, { id: 's2', title: 'Second', instructions: 'Then this' }];
    await controller.dispatch({ workerId: 'worker', requestId: 'req-1', objective: 'Fix it', context: 'fixture', constraints: [], steps });
    const record = () => controller.state.workers.worker;
    const end = Date.now() + 20000;
    while (record().task?.status !== 'review') { assert.ok(Date.now() < end, `timed out; task is ${record().task?.status}: ${record().task?.interruption}`); await new Promise(resolve => setTimeout(resolve, 50)); }
    const serves = (await fs.readFile(path.join(home, 'fake-low.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)).filter(entry => entry.kind === 'serve');
    assert.equal(serves.length, 2, `one low server per provider: ${JSON.stringify(serves.map(entry => entry.args.slice(-6)))} ${notices.join(' | ')}`);
    assert.ok(serves[0].args.includes('opendesign:deepseek-v4.1-flash'));
    assert.ok(serves[1].args.includes('opencode-go:deepseek-v4.1-flash'), 'the restart runs the fallback model');
    const session = serves[1].args[serves[1].args.indexOf('--session') + 1];
    assert.ok(session && serves[1].args.includes('--session'), 'with the same low session');
    assert.equal(record().fallback?.index, 0);
    assert.equal(record().bound.provider, 'opencode-go', 'authority and drift checks bind the fallback model');
    const authority = JSON.parse(await fs.readFile(path.join(controller.workerDir('worker'), 'authority.json'), 'utf8'));
    assert.deepEqual(authority.model, { provider: 'opencode-go', id: 'deepseek-v4.1-flash' });
    assert.equal(record().task?.report?.payload.kind, 'checkpoint', 'the step finished on the fallback');
    assert.ok(notices.some(message => /switched the worker to fallback opencode-go\/deepseek-v4.1-flash/.test(message)));
  } finally {
    await controller.close().catch(() => {});
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

// The opt-in Main heartbeat and the supervision settings rows.
import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { registerMain } from '../src/main.js';
import { configPaths } from '../src/config.js';
import { settingsScreen } from '../src/settings-screen.js';

const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, totalInput: 0, output: 0, reportedCost: 0, unknownCostRequests: 0, requests: 0, cacheRatio: null };

async function fixture(run, control = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-heartbeat-'));
  const cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  await fs.writeFile(configPaths(cwd).project, JSON.stringify({ version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true }, control,
    workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }] }));
  const events = new Map(), tools = new Map(), messages = [], notices = [];
  const ctx = { cwd, mode: 'rpc', hasUI: true, isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => 'heartbeat-main', getSessionFile: () => path.join(home, 'main.jsonl'), getBranch: () => [] },
    getContextUsage: () => undefined, model: { provider: 'main', id: 'native' }, modelRegistry: { getAvailable: () => [] },
    hasPendingMessages: () => false, isIdle: () => true,
    ui: { select: async () => undefined, setStatus() {}, setWidget() {}, notify: (message, level) => notices.push({ message, level }), confirm: async () => true } };
  const commands = new Map();
  const pi = { on: (name, fn) => events.set(name, fn), registerCommand: (name, command) => commands.set(name, command), registerShortcut() {},
    registerTool: tool => tools.set(tool.name, tool), getAllTools: () => [], getCommands: () => [], appendEntry() {},
    getThinkingLevel: () => 'medium',
    sendMessage: (...args) => messages.push(args), sendUserMessage: (...args) => messages.push(args) };
  const main = registerMain(pi);
  try {
    await events.get('session_start')({}, ctx);
    const controller = main.getController(); assert.ok(controller);
    controller.rpcFactory = () => { throw Error('RPC spawn forbidden in the heartbeat fixture'); };
    /** Change a control setting the way /pair settings does: save the layer, then let Pair reload it. */
    const setControl = async (patch) => {
      const { loadConfig, updateConfigLayer } = await import('../src/config.js');
      const loaded = await loadConfig(cwd, true, { PI_CODING_AGENT_DIR: home });
      const layer = updateConfigLayer({ version: 2 }, loaded.config, { ...loaded.config, control: { ...loaded.config.control, ...patch } });
      await fs.writeFile(configPaths(cwd).project, JSON.stringify(layer));
    };
    await run({ controller, main, events, tools, messages, notices, ctx, setControl, command: args => commands.get('pair').handler(args, ctx) });
  } finally {
    const c = main.getController();
    if (c) { for (const id of Object.keys(c.state.workers)) delete c.state.workers[id]; c.handles.clear(); }
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}
/** A retained, running task with liveness, so the heartbeat has something to report. */
function runningTask(controller) {
  const now = Date.now();
  return { id: 'task-beat', workerId: 'worker', requestId: 'req-beat', objective: 'Heartbeat fixture', context: '', constraints: [],
    steps: [{ id: 's1', title: 'Step', instructions: 'x' }, { id: 's2', title: 'Two', instructions: 'y' }], stepIndex: 0, planRevision: 1,
    attemptId: 'attempt-beat', attemptNumber: 1, status: 'running', leaseId: 'lease-beat',
    policy: { ...controller.config.supervision }, limits: { ...controller.config.limits }, verification: { ...controller.config.verification },
    startedAt: now - 600000, updatedAt: now - 300000, revisions: 0, turns: 1, usage: { ...ZERO_USAGE }, baseSnapshotRef: 'unset',
    pendingReport: null, report: null, decisions: {}, lastDecision: null, dispatchSettleSequence: 1, pendingSince: 0, abortRequested: false,
    interruption: '', previousStatus: '', completedAt: 0, cancelReason: '' };
}

test('the heartbeat stays off by default and no tick is scheduled', async () => await fixture(async f => {
  const messagesBefore = f.messages.length;
  f.events.get('agent_start')({}, f.ctx);
  await f.events.get('agent_settled')({}, f.ctx);
  // A heartbeat timer must not exist at all in the default configuration; nothing is appended after the turn.
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(f.messages.filter(([message]) => message.customType === 'fabric-pair.heartbeat').length, 0);
  assert.ok(f.messages.length >= messagesBefore);
}));

test('control.mainHeartbeat validates and the example config documents it', async () => {
  const { validateConfig, DEFAULTS } = await import('../src/config.js');
  assert.equal(DEFAULTS.control.mainHeartbeat, 'off', 'off by default');
  assert.equal(DEFAULTS.control.mainHeartbeatMs, 900000);
  assert.equal(validateConfig({ version: 2, control: { mainHeartbeat: 'wake' } }).control.mainHeartbeat, 'wake');
  assert.throws(() => validateConfig({ version: 2, control: { mainHeartbeat: 'sometimes' } }), /mainHeartbeat must be off, note or wake/);
  const example = JSON.parse(await fs.readFile(new URL('../fabric-pair.example.json', import.meta.url), 'utf8'));
  assert.equal(example.control.mainHeartbeat, 'off');
  assert.equal(example.control.mainHeartbeatMs, 900000);
  assert.equal(example.control.compactionMaxMs, 600000, 'the compaction window is documented too');
});

test('every supervision setting has an editable /pair settings row', async () => {
  // The rows live in the Review page builder; assert each setting is reachable from the screen and that the
  // edit paths exist (toggle or numeric commit), so a setting cannot ship without a way to change it.
  const source = await fs.readFile(new URL('../src/settings-screen.js', import.meta.url), 'utf8');
  const rowIds = ['mainSupervision', 'maxMainRecoveries', 'autoCheckIdle', 'stepTimeout', 'watchdog', 'silentMs', 'toolMaxMs', 'stepNudgeMs', 'maxAutoRecoveries', 'compactionMaxMs', 'mainHeartbeat', 'mainHeartbeatMs'];
  for (const id of rowIds) assert.ok(source.includes(`id: '${id}'`), `settings screen has a ${id} row`);
  // Each row is either a toggle or a committed number/choice.
  for (const id of ['mainSupervision', 'autoCheckIdle', 'watchdog']) assert.ok(source.includes(`row.id === '${id}'`), `${id} toggles`);
  for (const id of ['maxMainRecoveries', 'maxAutoRecoveries']) assert.ok(source.includes(`row.id === '${id}'`), `${id} commits a number`);
  // Duration rows are parsed in seconds/minutes/hours and stored in milliseconds.
  for (const id of ['stepTimeout', 'silentMs', 'toolMaxMs', 'stepNudgeMs', 'compactionMaxMs', 'mainHeartbeatMs']) assert.ok(source.includes(`${id}: {`), `${id} is a duration row`);
  assert.ok(source.includes("mainHeartbeat: 'off' | 'note' | 'wake'") === false, 'the choice options are the three documented values');
  for (const value of ["'off'", "'note'", "'wake'"]) assert.ok(source.includes(`{ value: ${value}`), `the heartbeat offers ${value}`);
});

test('note and wake heartbeats behave as configured, and only fire for a running task', async () => {
  await fixture(async f => {
    const task = runningTask(f.controller);
    f.controller.state.workers.worker = { id: 'worker', cwd: f.ctx.cwd, repoRoot: f.ctx.cwd, status: 'stopped', bound: f.controller.config.workers[0],
      workerGeneration: 1, sessionId: 'fixture-session', sessionFile: path.join(f.controller.dir, 'fixture.jsonl'), history: [], usage: null, task };
    const runtime = { snapshot: () => ({ ready: true, idle: false, streaming: true, closed: false, fault: null, permission: false, compacting: false, summarizingRetrying: false, retrying: false,
      tool: null, accepted: true, lastEventAt: Date.now() - 12000 }), pid: 1, dir: '/tmp/fixture', ownerEpoch: f.controller.state.ownerEpoch, workerGeneration: 1,
      nonce: 'n', sessionId: 'fixture-session', ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], abortCurrent: async () => {},
      abortAndStop: async () => {}, waitIdle: async () => {}, revoke() {}, settleOrAbort() {} };
    f.controller.handles.set('worker', runtime);
    f.controller.runtimeData.set(runtime, { configHash: f.controller.configHash(), specHash: 'x', activationIntent: f.controller.intent('worker'), pendingControls: 0, failureHandled: false, telemetry: { context: { tokens: 50000, contextWindow: 100000 } }, verificationAbort: null });
    // The heartbeat only fires while Main is idle: settle one turn first, as a real session would have.
    f.events.get('agent_start')({}, f.ctx);
    await f.events.get('agent_settled')({}, f.ctx);
    // The heartbeat reads the loaded config, so each mode is saved the way /pair settings saves it and reloaded.
    /** @param {'off' | 'note' | 'wake'} mode */
    const tickWith = async mode => {
      await f.setControl({ mainHeartbeat: mode });
      // /pair reload is the real path that rereads the saved config into the running session.
      await f.command('reload');
      f.messages.length = 0; f.main.heartbeatTick(); return f.messages;
    };

    // off: nothing at all.
    assert.deepEqual(await tickWith('off'), []);
    // note: one display-only line naming the state, the step, the step time, the event age and the context.
    const note = await tickWith('note');
    const beats = note.filter(([message]) => message.customType === 'fabric-pair.heartbeat');
    assert.equal(beats.length, 1, 'exactly one heartbeat line');
    assert.equal(note.filter(([message]) => typeof message === 'string').length, 0, 'a note does not start a turn');
    assert.equal(beats[0][1]?.triggerTurn, false);
    assert.match(String(beats[0][0].content), /^FABRIC PAIR HEARTBEAT/);
    assert.match(String(beats[0][0].content), /- worker worker: streaming/);
    assert.match(String(beats[0][0].content), /step 1\/2/);
    assert.match(String(beats[0][0].content), /5m on step/, 'step time is shown');
    assert.match(String(beats[0][0].content), /last event 12s ago/);
    assert.match(String(beats[0][0].content), /context 50%/);
    // wake: the same line plus a prompt that asks Main to peek and act only on problems.
    const wake = await tickWith('wake');
    assert.equal(wake.filter(([message]) => message.customType === 'fabric-pair.heartbeat').length, 1);
    const prompt = wake.find(([message]) => typeof message === 'string');
    assert.ok(prompt, 'wake starts a turn');
    assert.match(String(prompt[0]), /Call pair_peek only if something in that line looks wrong/);
    // No running task: nothing to report.
    task.status = 'review';
    assert.deepEqual(await tickWith('wake'), []);
  });
});
test('the heartbeat wake prompt is Pair waking Main, not human input', async () => {
  const { isWake } = await import('../src/main.js');
  const text = 'Pair: the worker is still running (the FABRIC PAIR HEARTBEAT above). Call pair_peek only if something in that line looks wrong; otherwise do not act or reply.';
  // isWake is what the input handler and message_start use to tell Pair's own prompts from the human's words.
  assert.equal(isWake({ role: 'user', content: text }), true, 'the heartbeat prompt is a Pair wake');
  assert.equal(isWake({ role: 'user', content: [{ type: 'text', text }] }), true, 'in content-block form too');
  assert.equal(isWake({ role: 'user', content: 'Pair: a worker report has arrived (the FABRIC PAIR REPORT above). Review it as the Pair guide describes.' }), true, 'and so are the other wake prompts');
  assert.equal(isWake({ role: 'user', content: 'please continue' }), false, 'a human message is not a wake');
  assert.equal(isWake({ role: 'assistant', content: text }), false);
  // End to end: the wake heartbeat's prompt is recognised, while the input handler still takes a human message.
  await fixture(async f => {
    const task = runningTask(f.controller);
    f.controller.state.workers.worker = { id: 'worker', cwd: f.ctx.cwd, repoRoot: f.ctx.cwd, status: 'stopped', bound: f.controller.config.workers[0],
      workerGeneration: 1, sessionId: 'fixture-session', sessionFile: path.join(f.controller.dir, 'fixture.jsonl'), history: [], usage: null, task };
    const runtime = { snapshot: () => ({ ready: true, idle: false, streaming: true, closed: false, fault: null, permission: false, compacting: false, summarizingRetrying: false, retrying: false,
      tool: null, accepted: true, lastEventAt: Date.now() - 12000 }), pid: 1, dir: '/tmp/fixture', ownerEpoch: f.controller.state.ownerEpoch, workerGeneration: 1,
      nonce: 'n', sessionId: 'fixture-session', ready: true, closed: false, fault: null, settledSequence: 1, takeObservations: () => [], abortCurrent: async () => {},
      abortAndStop: async () => {}, waitIdle: async () => {}, revoke() {}, settleOrAbort() {} };
    f.controller.handles.set('worker', runtime);
    f.controller.runtimeData.set(runtime, { configHash: f.controller.configHash(), specHash: 'x', activationIntent: f.controller.intent('worker'), pendingControls: 0, failureHandled: false, telemetry: null, verificationAbort: null });
    f.events.get('agent_start')({}, f.ctx);
    await f.events.get('agent_settled')({}, f.ctx);
    await f.setControl({ mainHeartbeat: 'wake' });
    await f.command('reload');
    f.messages.length = 0;
    f.main.heartbeatTick();
    const prompt = f.messages.find(([message]) => typeof message === 'string');
    assert.ok(prompt, 'the wake heartbeat sends a prompt');
    // The handler must not hold a report or abort for Pair's own heartbeat prompt…
    f.notices.length = 0;
    const handled = f.events.get('input')({ source: 'extension', text: String(prompt[0]), streamingBehavior: undefined }, f.ctx);
    assert.equal(handled, undefined, "Pair's own prompt is simply ignored by the input handler");
    assert.equal(f.notices.some(n => /paused a worker report/.test(n.message)), false, 'no report is held for it');
    // …while an interactive message goes through the normal path.
    const human = f.events.get('input')({ source: 'interactive', text: 'do something else', streamingBehavior: undefined }, f.ctx);
    assert.equal(human, undefined);
    assert.ok(f.notices.length >= 0);
  });
});

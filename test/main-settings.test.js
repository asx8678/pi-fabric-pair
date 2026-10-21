import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { registerMain } from '../src/main.js';
import { configPaths, DEFAULTS } from '../src/config.js';

async function fixture(run, { global, project = { version: 2, autoStart: false }, trusted = true, mode = 'rpc', fabric } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-settings-main-'));
  const cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  const files = configPaths(cwd);
  if (global) await fs.writeFile(files.global, JSON.stringify(global));
  await fs.writeFile(files.project, JSON.stringify(project));
  const events = new Map(), commands = new Map(), tools = new Map(), actions = [], notices = [], confirmations = [], widgets = [], messages = [], titles = [];
  let confirmed = true;
  const screens = [];
  const ctx = { cwd, mode, hasUI: true, isProjectTrusted: () => trusted,
    sessionManager: { getSessionId: () => 'settings-test-owner' }, getContextUsage: () => undefined,
    model: { provider: 'main', id: 'native' }, modelRegistry: { getAvailable: () => [], find: () => undefined },
    ui: { select: async (_title, rows) => {
      assert.ok(actions.length, 'unexpected dialog'); const next = actions.shift();
      if (next === undefined) return undefined;
      const value = rows.find(row => row.startsWith(next)); assert.ok(value, `missing ${next}`); return value;
    }, setStatus: () => {}, setWidget: () => {}, notify: (message, level) => notices.push({ message, level }), setWidget: (key, component) => widgets.push({ key, component }),
    // A custom view is the settings screen: keep it mounted so a test can read what it shows.
    custom: (factory, options) => new Promise(resolve => { const screen = { component: factory({ terminal: { columns: 100, rows: 40 }, requestRender() {} }, null, null, resolve), options }; screens.push(screen); }),
    confirm: async (...args) => { confirmations.push(args); return confirmed; }, setTitle: title => titles.push(title) }
  };
  const fabricTools = [];
  if (fabric) {
    const root = path.join(base, 'fabric-package');
    await fs.mkdir(path.join(root, 'dist'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'pi-fabric', version: fabric }));
    fabricTools.push({ name: 'fabric_exec', sourceInfo: { path: path.join(root, 'dist', 'index.js') } });
  }
  const pi = { on: (name, fn) => events.set(name, fn), registerCommand: (name, command) => commands.set(name, command), registerShortcut: () => {}, registerTool: tool => tools.set(tool.name, tool), getAllTools: () => fabricTools, getCommands: () => [], sendMessage: (...args) => messages.push(args), sendUserMessage: (...args) => messages.push(args) };
  const main = registerMain(pi);
  try {
    await events.get('session_start')({}, ctx);
    const controller = main.getController(); assert.ok(controller);
    let spawns = 0; controller.rpcFactory = () => { spawns++; throw Error('RPC spawn forbidden in settings fixture'); };
    await run({ controller, getController: () => main.getController(), files, actions, notices, confirmations, tools, events, ctx, widgets, messages, titles, screens, spawns: () => spawns,
      confirm: value => { confirmed = value; },
      command: args => commands.get('pair').handler(args, ctx), home, cwd });
  } finally {
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

for (const command of ['start worker']) { // the old dashboard-menu variant was retired with the TUI redesign
  test(`fresh startup preflight via ${command || 'dashboard'} lists all blockers after repair is declined without constructing a runtime`, () => fixture(async f => {
    f.confirm(false);
    if (!command) f.actions.push('Start worker');
    await f.command(command);
    assert.equal(f.confirmations.length, 1);
    assert.equal(f.confirmations[0][0], 'Fix Fabric settings for Pair');
    assert.equal(f.actions.length, 0);
    assert.equal(f.spawns(), 0); assert.equal(f.controller.handles.size, 0);
    assert.equal(Object.keys(f.controller.state.workers).length, 0);
    assert.equal(f.notices.length, 1); assert.equal(f.notices[0].level, 'error');
    for (const field of ['shellHangMs = 0', 'maxDepth = 0', path.join(f.home, 'fabric.json'), path.join(await fs.realpath(f.cwd), '.pi', 'fabric.json')]) assert.ok(f.notices[0].message.includes(field), field);
    assert.match(f.notices[0].message, /retry \/pair start/);
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(f.notices.length, 1, 'scanner does not repeat a known setup rejection');
    assert.equal(f.spawns(), 0); assert.equal(f.controller.handles.size, 0);
    assert.equal(Object.keys(f.controller.state.workers).length, 0);
    await assert.rejects(fs.stat(path.join(f.home, 'fabric.json')), /ENOENT/, 'native global config is not created');
    await assert.rejects(fs.stat(path.join(f.cwd, '.pi', 'fabric.json')), /ENOENT/, 'native project config is not created');
  }, { project: { version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));
}

test('enabled autostart without a model is a setup hint, not an error loop', () => fixture(async f => {
  assert.equal(f.notices.length, 1); assert.match(f.notices[0].message, /Pair setup: choose a worker model/);
  assert.equal(f.notices[0].level, 'info'); assert.equal(f.spawns(), 0);
}, { project: { version: 2, enabled: true, autoStart: true } }));

test('reload rereads scoped settings and indicator while retaining the Main binding without autostart', () => fixture(async f => {
  const controller = f.controller, model = f.ctx.model, epoch = controller.state.ownerEpoch;
  const next = { version: 2, enabled: true, autoStart: true, workers: [{ id: 'worker', provider: 'fixture', model: 'new-worker', effort: 'high', cwd: null, readOnly: false }] };
  const bytes = JSON.stringify(next); await fs.writeFile(f.files.project, bytes);
  await fs.writeFile(f.files.global, JSON.stringify({ version: 2, limits: { maxReportsPerTask: 75 } }));
  await fs.writeFile(f.files.ui, JSON.stringify({ indicator: 'off' }));
  await f.command('reload');
  assert.equal(f.getController(), controller); assert.equal(controller.state.ownerEpoch, epoch);
  assert.equal(f.ctx.model, model); assert.equal(controller.config.workers[0].model, 'new-worker');
  assert.equal(controller.config.limits.maxReportsPerTask, 75); assert.equal(controller.config.indicator, 'off');
  assert.equal(controller.closing, false); assert.equal(f.spawns(), 0); assert.deepEqual(f.messages, []);
  assert.equal(await fs.readFile(f.files.project, 'utf8'), bytes, 'reload is read-only');
  assert.match(f.notices.at(-1).message, /configuration reloaded/);
}));

test('invalid configuration cannot escape the command boundary or replace valid settings, and reload can recover', () => fixture(async f => {
  const before = structuredClone(f.controller.config), epoch = f.controller.state.ownerEpoch;
  for (const bytes of ['{broken', JSON.stringify({ version: 2, unexpected: true })]) {
    await fs.writeFile(f.files.project, bytes);
    await assert.doesNotReject(f.command('reload'));
    assert.equal(f.notices.at(-1).level, 'error'); assert.deepEqual(f.controller.config, before);
    await assert.doesNotReject(f.command('restart worker'));
    assert.equal(f.notices.at(-1).level, 'error'); assert.deepEqual(f.controller.config, before);
    assert.equal(f.spawns(), 0); assert.equal(f.controller.closing, false);
  }
  await fs.writeFile(f.files.project, JSON.stringify({ version: 2, autoStart: false, limits: { maxReportsPerTask: 60 } }));
  await f.command('reload');
  assert.equal(f.controller.config.limits.maxReportsPerTask, 60);
  assert.equal(f.controller.state.ownerEpoch, epoch); assert.equal(f.notices.at(-1).level, 'info');
}));

async function activeTaskFixture(f) {
  const c = f.controller, spec = c.config.workers[0];
  const task = { id: 'active-task', workerId: spec.id, requestId: 'active-request', objective: 'Isolated active-task fixture', context: '', constraints: [],
    steps: [{ id: 'one', title: 'Work', instructions: 'fixture' }], stepIndex: 0, planRevision: 1, attemptId: 'active-attempt', attemptNumber: 1,
    status: 'running', leaseId: 'active-lease', policy: structuredClone(c.config.supervision), limits: structuredClone(c.config.limits),
    verification: structuredClone(c.config.verification), startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 7, usage: null,
    baseSnapshotRef: '/unused-fixture', pendingReport: null, report: null, decisions: {}, lastDecision: null };
  const record = { id: spec.id, cwd: f.cwd, repoRoot: f.cwd, status: 'working', bound: spec, workerGeneration: 1,
    sessionId: 'fake-worker-session', sessionFile: path.join(f.home, 'fake-session.jsonl'), history: [], usage: null, task };
  c.state.workers[spec.id] = record;
  await c.writeAuthority(spec.id, 'running');
  const change = () => c.emit('change', c.summary()); change();
  return { task, record, change, clear: () => { delete c.state.workers[spec.id]; change(); } };
}

test('reload preserves active authorization and stages the worker model without a replacement', () => fixture(async f => {
  const active = await activeTaskFixture(f);
  try {
    const before = JSON.stringify(active.task), hash = f.controller.configHash(), intent = f.controller.intent('worker');
    const authority = await fs.readFile(path.join(f.controller.workerDir('worker'), 'authority.json'), 'utf8');
    await fs.writeFile(f.files.project, JSON.stringify({ version: 2, enabled: true, autoStart: true, workers: [{ id: 'worker', provider: 'fixture', model: 'changed', effort: 'low', cwd: null, readOnly: false }] }));
    await f.command('reload');
    assert.equal(f.controller.configHash(), hash); assert.equal(f.controller.intent('worker'), intent);
    assert.equal(JSON.stringify(active.task), before); assert.equal(f.controller.pendingConfig.workers[0].model, 'changed');
    assert.equal(await fs.readFile(path.join(f.controller.workerDir('worker'), 'authority.json'), 'utf8'), authority);
    assert.match(f.notices.at(-1).message, /staged/); assert.equal(f.spawns(), 0);
    await f.command('restart worker');
    assert.match(f.notices.at(-1).message, /pending until all tasks/);
    assert.equal(JSON.stringify(active.task), before); assert.equal(f.controller.intent('worker'), intent);
  } finally { active.clear(); }
}, { project: { version: 2, enabled: true, autoStart: false } }));

test('reload ignores untrusted project edits', () => fixture(async f => {
  await fs.writeFile(f.files.project, '{invalid untrusted settings');
  await fs.writeFile(f.files.global, JSON.stringify({ version: 2, autoStart: false, limits: { maxReportsPerTask: 63 } }));
  await f.command('reload');
  assert.equal(f.controller.config.limits.maxReportsPerTask, 63); assert.equal(f.notices.at(-1).level, 'info');
}, { trusted: false }));

for (const viaMenu of [false, true]) test(`worker restart ${viaMenu ? 'menu' : 'command'} loads disk settings and reports failures without shutting down Main`, () => fixture(async f => {
  const model = f.ctx.model, epoch = f.controller.state.ownerEpoch, calls = [];
  await fs.writeFile(f.files.project, JSON.stringify({ version: 2, enabled: true, autoStart: false, workers: [{ id: 'new-worker', provider: 'fixture', model: 'new-model', effort: 'low', cwd: null, readOnly: false }] }));
  let fail = true;
  f.controller.restart = async id => {
    calls.push(id); assert.equal(f.controller.config.workers[0].model, 'new-model');
    if (fail) throw Error('Worker model unavailable');
    return { task: { status: 'interrupted' } };
  };
  // Without the TUI, bare /pair is the select menu: restart sits under More…, and the menu reopens until dismissed.
  const restart = async () => { if (viaMenu) f.actions.push('More…', 'Restart worker', undefined); await f.command(viaMenu ? '' : 'restart'); assert.equal(f.actions.length, 0, 'every menu choice was used'); };
  await assert.doesNotReject(restart());
  assert.equal(f.notices.at(-1).level, 'error'); assert.match(f.notices.at(-1).message, /Worker model unavailable/);
  assert.equal(f.controller.closing, false); assert.equal(f.ctx.model, model); assert.equal(f.controller.state.ownerEpoch, epoch);
  fail = false; await restart();
  assert.deepEqual(calls, ['new-worker', 'new-worker']); assert.equal(f.notices.at(-1).level, 'info');
  assert.match(f.notices.at(-1).message, /started.*no model turn.*Work remains held/);
  assert.deepEqual(f.messages, []);
}));

/** A worker with a plan and a status, so a restart either interrupts a step or does not. */
function taskRecord(status) {
  return { id: 'restart-task', workerId: 'worker', requestId: 'restart-request', objective: 'Restart fixture', context: '', constraints: [],
    steps: [{ id: 'one', title: 'Work', instructions: 'fixture' }, { id: 'two', title: 'More', instructions: 'fixture' }], stepIndex: 1, planRevision: 1,
    attemptId: 'restart-attempt', attemptNumber: 1, status, leaseId: 'restart-lease', policy: structuredClone(DEFAULTS.supervision),
    limits: structuredClone(DEFAULTS.limits), verification: structuredClone(DEFAULTS.verification), startedAt: Date.now() - 60000,
    updatedAt: Date.now(), revisions: 0, turns: 3, usage: null, baseSnapshotRef: '/unused-fixture', pendingReport: null, report: null,
    decisions: {}, lastDecision: null };
}
for (const via of ['command', 'menu']) test(`a ${via} restart asks first while a task runs, and not without one`, () => fixture(async f => {
  const c = f.controller, spec = c.config.workers[0];
  let restarts = 0;
  c.restart = async id => { restarts++; return { task: { status: 'interrupted' } }; };
  /** @param {string | null} status null for a worker with no task at all */
  const show = status => {
    c.state.workers[spec.id] = { id: spec.id, cwd: f.cwd, repoRoot: f.cwd, status: 'working', bound: spec, workerGeneration: 1,
      sessionId: 'fake-worker-session', sessionFile: path.join(f.home, 'fake-session.jsonl'), history: [], usage: null, task: status ? taskRecord(status) : null };
    c.emit('change', c.summary());
  };
  const restart = async () => {
    if (via === 'menu') { f.actions.push('More…', 'Restart worker', undefined); await f.command(''); assert.equal(f.actions.length, 0, 'every menu choice was used'); }
    else await f.command('restart');
  };
  // Restarting may also offer the Fabric profile repair; only the restart prompt itself is counted here.
  const restartPrompts = () => f.confirmations.filter(([title]) => title === 'Restart worker').length;
  try {
    // A worker resting between tasks restarts without a prompt, exactly as before.
    // A worker with no task restarts without a prompt, exactly as before.
    show(null);
    await restart();
    assert.equal(restarts, 1, 'the taskless restart ran');
    assert.equal(restartPrompts(), 0, 'no task means nothing to interrupt: no prompt');
    // A running task is interrupted, so a declined confirmation must stop the restart.
    show('running');
    f.confirm(false);
    await restart();
    assert.equal(restartPrompts(), 1, 'the running restart asked');
    const [title, message] = f.confirmations.find(([name]) => name === 'Restart worker');
    assert.equal(title, 'Restart worker');
    assert.match(message, /^Restart worker worker\? It is running a task; the current step is interrupted\./);
    assert.match(message, /conversation and file changes are kept/);
    assert.equal(restarts, 1, 'a declined restart does not run');
    // Accepting runs it.
    f.confirm(true);
    await restart();
    assert.equal(restarts, 2, 'an accepted restart runs');
    assert.equal(restartPrompts(), 2);
    // A finished task is not interrupted either.
    show('completed');
    await restart();
    assert.equal(restartPrompts(), 2, 'a finished task needs no prompt');
    assert.equal(restarts, 3);
    // A held (paused) task still counts as an open task, so it asks too.
    show('paused');
    await restart();
    assert.equal(restartPrompts(), 3, 'an open held task asks');
    assert.equal(restarts, 4);
  } finally { delete c.state.workers[spec.id]; }
}, { project: { version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: 'fixture', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('stop during a restart configuration read prevents a later launch', () => fixture(async f => {
  let restarts = 0; f.controller.restart = async () => { restarts++; };
  const update = f.controller.updateConfig.bind(f.controller);
  f.controller.updateConfig = async config => { await update(config); await f.controller.stop('worker'); };
  await f.command('restart worker');
  assert.equal(restarts, 0); assert.match(f.notices.at(-1).message, /restart was superseded/);
  assert.equal(f.controller.closing, false);
}));

test('a restart cannot cross a Main session change while reloading settings', () => fixture(async f => {
  let restarts = 0, rebinding;
  f.controller.restart = async () => { restarts++; };
  const update = f.controller.updateConfig.bind(f.controller);
  f.controller.updateConfig = async config => {
    await update(config); f.ctx.sessionManager.getSessionId = () => 'next-main-session';
    rebinding = f.events.get('session_start')({}, f.ctx);
  };
  await f.command('restart worker'); await rebinding;
  assert.equal(restarts, 0); assert.match(f.notices.at(-1).message, /Main session changed/);
  assert.notEqual(f.getController(), f.controller); assert.equal(f.getController().ownerSession, 'next-main-session');
}));

test('registered Main message hook preserves measured history through abort placeholders and clears at boundaries', t => fixture(async f => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const emit = (name, event = {}) => f.events.get(name)(event, f.ctx);
  const response = (usage, extra = {}) => emit('message_end', { message: { role: 'assistant', usage, ...extra } });
  const sample = () => f.getController().summary().main.lastUsage;
  const zero = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: { total: 0 } };
  const cached = { input: 4425, cacheRead: 82048, cacheWrite: 0, output: 27 };
  for (const usage of [undefined, null, {}, zero, { output: 10 }]) {
    response(usage);
    assert.equal(sample(), null, 'unmeasured Main stays unknown');
  }
  response(cached, { stopReason: 'toolUse' });
  const measured = sample();
  assert.equal(measured.cacheRatio, 82048 / 86473);
  assert.equal(measured.observedAt, 1000);
  t.mock.timers.tick(59);
  response(zero, { stopReason: 'error', errorMessage: 'This operation was aborted' });
  assert.strictEqual(sample(), measured, 'report-stop placeholder preserves the exact sample');
  for (const usage of [undefined, null, {}, zero, { output: 1 }]) {
    t.mock.timers.tick(1000);
    response(usage);
    assert.strictEqual(sample(), measured);
    assert.equal(sample().observedAt, 1000, 'ignored samples cannot refresh historical age');
  }
  await emit('before_agent_start', { systemPrompt: 'Fixture' });
  emit('agent_start'); emit('agent_settled');
  assert.strictEqual(sample(), measured, 'normal run/idle events retain measured history');
  response({ input: 66898, cacheRead: 0 });
  const miss = sample();
  assert.equal(miss.cacheRatio, 0);
  assert.equal(miss.totalInput, 66898);
  assert.equal(miss.observedAt, 6059);
  response(zero);
  assert.strictEqual(sample(), miss);

  for (const boundary of ['model_select', 'session_compact', 'session_start']) {
    response(cached);
    if (boundary === 'model_select') f.ctx.model = { provider: 'main', id: 'other-model' };
    if (boundary === 'session_start') f.ctx.sessionManager.getSessionId = () => 'cache-main-new-session';
    await emit(boundary);
    assert.equal(sample(), null, boundary);
    for (const usage of [zero, undefined]) {
      response(usage);
      assert.equal(sample(), null, `${boundary}: cannot resurrect a prior sample`);
    }
  }
  assert.equal(f.getController().ownerSession, 'cache-main-new-session');
  assert.equal(f.getController().handles.size, 0);
  assert.equal(f.spawns(), 0);
  assert.deepEqual(f.messages, [], 'observation hooks do not request model turns');
}));


test('Main is pointed at cache.* only when the loaded Fabric has the cache provider', async () => {
  const guide = async fabric => {
    let content;
    await fixture(async f => { content = (await f.events.get('before_agent_start')({ systemPrompt: 'Fixture' }, f.ctx))?.systemPrompt; },
      { project: { version: 2, enabled: true, autoStart: false }, fabric });
    return content;
  };
  const old = await guide('0.96.3');
  assert.match(old, /This Fabric \(0\.96\.3\) has no cache provider \(added in 0\.97\.0\)/);
  assert.doesNotMatch(old, /inspect warming with cache\.status\(\)/);
  const current = await guide('0.97.0');
  assert.match(current, /Fabric's cache provider is loaded, but this Pi has no scoped warming API/, 'stock Pi (through 1.1.0) has no acquireCacheWarming');
  assert.match(await guide(undefined), /this version is unknown/, 'no readable Fabric version is stated as unknown');
  for (const text of [old, current]) {
    assert.match(text, /^Fixture\n\nFabric Pair provides/, 'the guide is appended to the system prompt');
    assert.match(text, /Never simulate warming/);
  }
});

test('typed pause and cancel ask first, and a declined prompt leaves the task alone', () => fixture(async f => {
  const calls = [];
  f.controller.pause = async id => { calls.push(`pause ${id}`); };
  f.controller.cancel = async (id, reason) => { calls.push(`cancel ${id}: ${reason}`); };
  f.confirm(false);
  await f.command('pause'); await f.command('cancel worker no longer needed');
  assert.deepEqual(f.confirmations.map(([title]) => title), ['Pause worker', 'Cancel task']);
  assert.deepEqual(calls, [], 'nothing runs without a yes');
  f.confirm(true);
  await f.command('pause'); await f.command('cancel worker no longer needed');
  assert.deepEqual(calls, ['pause worker', 'cancel worker: no longer needed']);
}, { project: { version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('the attention cue works with the indicator off, and puts the title back once nothing needs the human', () => fixture(async f => {
  const summary = f.controller.summary();
  assert.ok(summary.workers.length, 'the configured worker is in the summary');
  f.controller.emit('change', { ...summary, enabled: true, autoDeliverReports: false, waitingReports: 2 });
  assert.equal(f.widgets.filter(widget => widget.component !== undefined).length, 0, 'the indicator stays off');
  assert.match(f.titles.at(-1) ?? '', /^! pair · 2 reports waiting · delivery off — /, 'the cue still marks the title');
  f.controller.emit('change', { ...summary, enabled: true, autoDeliverReports: false, waitingReports: 0 });
  assert.equal(f.titles.at(-1), `π - ${path.basename(f.cwd)}`, "Pi's own title is back");
}, { mode: 'tui', project: { version: 2, enabled: true, autoStart: false, indicator: 'off', attentionCue: true, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('/pair settings in a TUI opens the dedicated settings screen, not the select menu', () => fixture(async f => {
  const settings = f.command('settings');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.screens.length, 1, 'exactly one custom view: the settings screen');
  const screen = f.screens[0];
  assert.equal(screen.options.overlay, true, 'the screen is an overlay over the chat');
  const shown = screen.component.render(100).map(line => line.replace(/\u001b\[[0-9;]*m/g, '')).join('\n');
  assert.match(shown, /Pair settings/, 'the frame names the screen');
  // At 100 columns the tab bar scrolls, so the first pages are what it shows; every page is reachable by tabbing.
  for (const page of ['Workers', 'Review', 'Supervision', 'Limits']) assert.ok(shown.includes(page), `the ${page} page is offered`);
  assert.match(shown, /esc|close/, 'the keys are on screen');
  assert.deepEqual(f.actions, [], 'no select menu replaced the editor');
  screen.component.handleInput('q');
  await settings;
  assert.equal(f.notices.length, 0, 'closing the screen says nothing and changes nothing');
}, { mode: 'tui', project: { version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: '', model: '', effort: 'medium', cwd: null, readOnly: false }] } }));


test('a settings save from the TUI keeps keys written to the file after the screen loaded, and says it merged', () => fixture(async f => {
  // The user's real bug: saving one setting rewrote the file from the copy loaded at session start, deleting
  // mainSupervision, maxMainRecoveries and limits that had been written to it since.
  const settings = f.command('settings');
  await new Promise(resolve => setTimeout(resolve, 10));
  const screen = f.screens[0];
  // Somebody edits the file while the screen is open.
  const onDisk = JSON.parse(await fs.readFile(f.files.project, 'utf8'));
  await fs.writeFile(f.files.project, JSON.stringify({ ...onDisk, mainSupervision: true, maxMainRecoveries: 5 }));
  screen.component.handleInput('\t');            // Review page
  screen.component.handleInput(' ');              // flip the first toggle row there
  for (let waited = 0; waited < 100 && !f.notices.some(n => /settings saved/.test(n.message)); waited++) await new Promise(resolve => setTimeout(resolve, 10));
  const written = JSON.parse(await fs.readFile(f.files.project, 'utf8'));
  assert.equal(written.mainSupervision, true, 'the externally written key survives the save');
  assert.equal(written.maxMainRecoveries, 5, 'and so does the other one');
  assert.ok(f.notices.some(n => /settings saved/.test(n.message) && /merged/i.test(n.message)), 'the status reports the merge');
  screen.component.handleInput('q');
  await settings;
}, { mode: 'tui', project: { version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('a settings save refuses a file that became invalid instead of overwriting it', () => fixture(async f => {
  const settings = f.command('settings');
  await new Promise(resolve => setTimeout(resolve, 10));
  const screen = f.screens[0];
  const invalid = JSON.stringify({ version: 2, limits: { maxReportsPerTask: 'many' } });
  await fs.writeFile(f.files.project, invalid);
  screen.component.handleInput('\t');
  screen.component.handleInput(' ');
  for (let waited = 0; waited < 100 && !f.notices.some(n => /not saved|settings saved/i.test(n.message)); waited++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(await fs.readFile(f.files.project, 'utf8'), invalid, 'the invalid file is left exactly as it was');
  screen.component.handleInput('q');
  await settings;
}, { mode: 'tui', project: { version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('a menu start asks before displacing a running worker, and a declined prompt starts nothing', () => fixture(async f => {
  // Pair runs one worker at a time, so starting ds2 stops the live worker. A menu item is one keystroke, so it
  // asks first and names both workers; a typed /pair start ds2 is a deliberate choice and switches without asking.
  const controller = f.getController(), spec = controller.config.workers[0];
  // A retained record plus a handle makes that worker read as live, without spawning a process in this fixture.
  controller.state.workers[spec.id] = { id: spec.id, cwd: f.cwd, repoRoot: f.cwd, status: 'ready', bound: spec, workerGeneration: 1,
    sessionId: 'fake-worker-session', sessionFile: path.join(f.home, 'fake-session.jsonl'), history: [], usage: null, task: null };
  controller.handles.set(spec.id, { pid: 4242, permission: null });
  controller.emit('change', controller.summary());
  /** @type {string[]} */ const starts = [];
  controller.start = async id => { starts.push(id); throw Error('RPC spawn forbidden in settings fixture'); };
  const prompts = () => f.confirmations.filter(([title]) => title === 'Switch worker');
  f.confirm(false);
  f.actions.push('Start worker');
  await f.command('');
  assert.equal(prompts().length, 1, `the start asks first (${JSON.stringify(f.confirmations)})`);
  assert.equal(prompts()[0][1], 'Stop worker and start ds2? Pair runs one worker at a time.');
  assert.deepEqual(starts, [], 'a declined switch starts nothing');
  assert.ok(controller.handles.has(spec.id), 'declining did not stop the live worker either');
  // The typed command names its target, so it goes straight to switchTo, which enforces the same rule itself.
  await f.command('start ds2').catch(() => {});
  assert.equal(prompts().length, 1, 'a typed start does not ask');
  delete controller.state.workers[spec.id]; controller.handles.delete(spec.id);
}, { project: { version: 2, enabled: true, autoStart: false, workers: [
  { id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false },
  { id: 'ds2', provider: 'test', model: 'second', effort: 'low', cwd: null, readOnly: false }] } }));

test('the non-TUI settings menu saves through the same merge path', () => fixture(async f => {
  // The select menu is the second settings route; both must merge, not rewrite from the session's copy.
  const onDisk = JSON.parse(await fs.readFile(f.files.project, 'utf8'));
  await fs.writeFile(f.files.project, JSON.stringify({ ...onDisk, mainSupervision: true }));
  f.actions.push('Enabled for new work', undefined);
  await f.command('settings');
  const written = JSON.parse(await fs.readFile(f.files.project, 'utf8'));
  assert.equal(written.enabled, false, `the menu toggle is saved (${JSON.stringify(f.notices)})`);
  assert.equal(written.mainSupervision, true, 'the key written after the session loaded survives the menu save');
}, { mode: 'rpc', project: { version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));


test('the non-TUI menu offers Edit as JSON and refuses an invalid layer without writing it', () => fixture(async f => {
  // The second settings route has the same escape hatch, and the same rule: validate before the file is touched.
  const before = await fs.readFile(f.files.project, 'utf8');
  f.ctx.ui.editor = async () => JSON.stringify({ version: 2, limits: { maxReportsPerTask: 'many' } });
  f.actions.push('Edit as JSON…', undefined);
  await f.command('settings');
  assert.equal(await fs.readFile(f.files.project, 'utf8'), before, 'an invalid layer never reaches the file');
  assert.ok(f.notices.some(item => /not saved/i.test(item.message) && /maxReportsPerTask/i.test(item.message)), 'the menu reports why: ' + JSON.stringify(f.notices));
  // A valid layer goes through the same saveLayer path as the screen.
  f.ctx.ui.editor = async () => JSON.stringify({ version: 2, supervision: { maxRevisions: 4 }, workers: [
    { id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] });
  f.actions.push('Edit as JSON…', undefined);
  await f.command('settings');
  const written = JSON.parse(await fs.readFile(f.files.project, 'utf8'));
  assert.equal(written.supervision.maxRevisions, 4, 'the valid layer is on disk: ' + JSON.stringify(written));
  assert.equal(f.getController().config.supervision.maxRevisions, 4, 'and the controller reloaded it');
  assert.deepEqual(f.actions, [], 'every menu choice was used');
}, { mode: 'rpc', project: { version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('saving a runtime field while a task runs says it is staged, in the real host path', () => fixture(async f => {
  // The staged note needs the controller's own answer about work in flight, not a value the screen invents.
  const c = f.getController(), spec = c.config.workers[0];
  c.state.workers[spec.id] = { id: spec.id, cwd: f.cwd, repoRoot: f.cwd, status: 'working', bound: spec, workerGeneration: 1,
    sessionId: 'fake-worker-session', sessionFile: path.join(f.home, 'fake-session.jsonl'), history: [], usage: null,
    task: { id: 'task-runtime', workerId: spec.id, status: 'running', steps: [], stepIndex: 0 } };
  c.emit('change', c.summary());
  const settings = f.command('settings');
  await new Promise(resolve => setTimeout(resolve, 10));
  const screen = f.screens[0];
  // Tab to Runtime and open its Program row, then save a different program.
  const page = () => screen.component.render(200).map(line => line.replace(/\u001b\[[0-9;]*m/g, '')).join('\n');
  for (let step = 0; step < 11 && !/\[ Runtime \]/.test(page()); step++) screen.component.handleInput('\t');
  assert.match(page(), /\[ Runtime \]/, 'the Runtime page is reachable by tabbing');
  screen.component.handleInput('j');
  screen.component.handleInput('\r');
  for (let index = 0; index < 2; index++) screen.component.handleInput('\u007f');
  for (const key of ['p', 'i', 'x']) screen.component.handleInput(key);
  screen.component.handleInput('\r');
  for (let waited = 0; waited < 100 && !f.notices.some(item => /settings saved/i.test(item.message)); waited++) await new Promise(resolve => setTimeout(resolve, 10));
  const shown = screen.component.render(200).map(line => line.replace(/\u001b\[[0-9;]*m/g, '')).join('\n');
  assert.match(shown, /A task is running, so the change is staged and applies at the next worker restart/, 'the real path knows a task is running');
  assert.equal(JSON.parse(await fs.readFile(f.files.project, 'utf8')).runtime.command, 'pix', 'the value is still saved');
  screen.component.handleInput('q');
  await settings;
  delete c.state.workers[spec.id];
}, { mode: 'tui', project: { version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('duplicating a worker from the screen saves through the host merge path', () => fixture(async f => {
  const settings = f.command('settings');
  await new Promise(resolve => setTimeout(resolve, 10));
  const screen = f.screens[0], cells = line => line.replace(/\u001b\[[0-9;]*m/g, '');
  const shown = () => screen.component.render(200).map(cells).join('\n');
  // Walk to the Duplicate row by its label rather than counting: the list grows as workers are added.
  const view = screen.component.view;
  for (let step = 0; step < 20 && view.currentRow().id !== 'duplicate'; step++) screen.component.handleInput('j');
  assert.equal(view.currentRow().id, 'duplicate', 'the Duplicate row is selected');
  screen.component.handleInput('\r');
  assert.match(shown(), /Copy this worker under a new id/, 'the copy asks for its id inline');
  for (const key of ['c', 'o', 'p', 'y']) screen.component.handleInput(key);
  screen.component.handleInput('\r');
  // The copy closes the overlay for the host to save through the merge path, then reopens on the new worker.
  for (let waited = 0; waited < 200 && f.screens.length < 2; waited++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.screens.length, 2, 'the screen reopened after the host saved');
  const written = JSON.parse(await fs.readFile(f.files.project, 'utf8'));
  assert.deepEqual(written.workers.map(worker => worker.id), ['worker', 'copy']);
  assert.ok(f.notices.some(item => /Copied worker worker to copy/.test(item.message)), 'the host reports the copy: ' + JSON.stringify(f.notices));
  const reopened = f.screens[1];
  assert.equal(reopened.component.view.session.workerId, 'copy', 'the reopened screen edits the new worker');
  // The reopened screen is the one to close: the first view is already resolved.
  reopened.component.handleInput('q');
  await settings;
}, { mode: 'tui', project: { version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('rows show where each value comes from, read from the files the session loaded', () => fixture(async f => {
  const settings = f.command('settings');
  await new Promise(resolve => setTimeout(resolve, 10));
  const screen = f.screens[0], view = screen.component.view;
  const line = pattern => screen.component.render(160).map(item => item.replace(/\u001b\[[0-9;]*m/g, '')).join('\n').split('\n').find(item => pattern.test(item)) ?? '';
  while (view.session.page !== 'review') screen.component.handleInput('\t');
  // This fixture's project file sets supervision.maxRevisions; everything else on the page is a default.
  assert.match(line(/Revision limit/), /project\s*│$/, 'the project file sets it: ' + line(/Revision limit/));
  assert.match(line(/Review policy/), /default\s*│$/, 'an untouched row says default: ' + line(/Review policy/));
  // A worker row reads the source of the workers array as a whole, which this project file also sets.
  while (view.session.page !== 'workers') screen.component.handleInput('\t');
  assert.match(line(/Model/), /project\s*│$/, 'a worker setting follows the workers array: ' + line(/Model/));
  screen.component.handleInput('q');
  await settings;
}, { mode: 'tui', project: { version: 2, supervision: { maxRevisions: 7 }, workers: [
  { id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('reset removes the field from the project file through the merge path, leaving the rest', () => fixture(async f => {
  const settings = f.command('settings');
  await new Promise(resolve => setTimeout(resolve, 10));
  const screen = f.screens[0], view = screen.component.view;
  while (view.session.page !== 'review') screen.component.handleInput('\t');
  while (view.currentRow().id !== 'revisions') screen.component.handleInput('j');
  assert.match(screen.component.render(160).map(l => l.replace(/\u001b\[[0-9;]*m/g, '')).join('\n'),
    /Revision limit +7 +project/, 'the project file sets it, so the row says project');
  screen.component.handleInput('r');
  for (let waited = 0; waited < 200 && !/Reset/.test(view.session.status); waited++) await new Promise(resolve => setTimeout(resolve, 10));
  const written = JSON.parse(await fs.readFile(f.files.project, 'utf8'));
  assert.equal(written.supervision, undefined, 'the field and its emptied section are gone from the project file');
  assert.deepEqual(Object.keys(written).sort(), ['autoStart', 'version', 'workers'], 'nothing else was written away: ' + JSON.stringify(written));
  assert.match(view.session.status, /✔ Reset — Revision limit now comes from/);
  screen.component.handleInput('q');
  await settings;
}, { mode: 'tui', project: { version: 2, supervision: { maxRevisions: 7 }, autoStart: false,
  workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('Edit as JSON writes a valid layer and never writes an invalid one', () => fixture(async f => {
  const settings = f.command('settings');
  await new Promise(resolve => setTimeout(resolve, 10));
  const screen = f.screens[0], view = screen.component.view;
  const before = await fs.readFile(f.files.project, 'utf8');
  while (view.session.page !== 'general') screen.component.handleInput('\t');
  while (view.currentRow().id !== 'json') screen.component.handleInput('j');
  // An invalid layer is refused and the file is untouched. Declining the offer to edit again ends the attempt:
  // the invalid value never becomes a draft, so nothing loops.
  f.ctx.ui.editor = async () => JSON.stringify({ version: 2, supervision: { maxRevisions: 999 } });
  f.ctx.ui.confirm = async () => false;
  screen.component.handleInput('\r');
  for (let waited = 0; waited < 200 && !/Not saved/.test(view.session.status); waited++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.match(view.session.status, /✖ Not saved: maxRevisions must be/);
  assert.equal(await fs.readFile(f.files.project, 'utf8'), before, 'an invalid layer never reaches the file');
  // A valid one is written through saveConfig and the screen reloads from disk. The invalid attempt offered
  // another try by reopening, so the newest screen is the one to edit from now on.
  f.ctx.ui.editor = async () => JSON.stringify({ version: 2, supervision: { maxRevisions: 9 }, workers: [
    { id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] });
  f.ctx.ui.confirm = async () => true;
  assert.equal(f.screens.length, 2, 'an invalid layer offers another try in a fresh screen');
  assert.equal(f.screens[1].component.view.session.rowId, 'json', 'and lands on the row that was being edited');
  f.screens[1].component.handleInput('\r');
  for (let waited = 0; waited < 200 && f.screens.length < 3; waited++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.screens.length, 3, 'a valid layer saves and the screen reloads from the file');
  const written = JSON.parse(await fs.readFile(f.files.project, 'utf8'));
  assert.equal(written.supervision.maxRevisions, 9, 'the valid layer is on disk');
  assert.equal(f.getController().config.supervision.maxRevisions, 9, 'and the controller reloaded it');
  f.screens[2].component.handleInput('q');
  await settings;
}, { mode: 'tui', project: { version: 2, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] } }));

test('worker add and remove edit the file that lists the workers, not the scope the session last saved to', () => fixture(async f => {
  // The workers live in the global file; this trusted project saves to its own file by default. Before, a removal
  // wrote the remaining workers into the project file and left the global list (and the "removed" worker) as it was.
  await f.command('worker remove ds2');
  const global = JSON.parse(await fs.readFile(f.files.global, 'utf8')), project = JSON.parse(await fs.readFile(f.files.project, 'utf8'));
  assert.deepEqual(global.workers.map(worker => worker.id), ['worker'], 'removed from the list that had it');
  assert.equal('workers' in project, false, 'the project file was not given a copy of the list');
  assert.deepEqual(f.getController().config.workers.map(worker => worker.id), ['worker']);
  assert.ok(f.notices.some(item => /Removed worker ds2/.test(item.message)), JSON.stringify(f.notices));
  await f.command('worker add third test/model low');
  assert.deepEqual(JSON.parse(await fs.readFile(f.files.global, 'utf8')).workers.map(worker => worker.id), ['worker', 'third']);
  assert.equal('workers' in JSON.parse(await fs.readFile(f.files.project, 'utf8')), false);
}, { global: { version: 2, workers: [{ id: 'worker', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }, { id: 'ds2', provider: 'test', model: 'model', effort: 'low', cwd: null, readOnly: false }] },
  project: { version: 2, enabled: true, autoStart: false } }));

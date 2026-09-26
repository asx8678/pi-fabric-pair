import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { registerMain } from '../src/main.js';
import { fakeWarming } from './helpers/warming.mjs';
import { configPaths } from '../src/config.js';

async function fixture(run, { global, project = { version: 2, autoStart: false }, trusted = true, mode = 'rpc', sdk } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-settings-main-'));
  const cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  const files = configPaths(cwd);
  if (global) await fs.writeFile(files.global, JSON.stringify(global));
  await fs.writeFile(files.project, JSON.stringify(project));
  const events = new Map(), commands = new Map(), tools = new Map(), actions = [], notices = [], confirmations = [], widgets = [], messages = [];
  let confirmed = true;
  const ctx = { ...(sdk ? { acquireCacheWarming: sdk.acquireCacheWarming } : {}), cwd, mode, hasUI: true, isProjectTrusted: () => trusted,
    sessionManager: { getSessionId: () => 'settings-test-owner' }, getContextUsage: () => undefined,
    model: { provider: 'main', id: 'native' }, modelRegistry: { getAvailable: () => [] },
    ui: { select: async (_title, rows) => {
      assert.ok(actions.length, 'unexpected dialog'); const next = actions.shift();
      if (next === undefined) return undefined;
      const value = rows.find(row => row.startsWith(next)); assert.ok(value, `missing ${next}`); return value;
    }, notify: (message, level) => notices.push({ message, level }), setWidget: (key, component) => widgets.push({ key, component }),
    confirm: async (...args) => { confirmations.push(args); return confirmed; } }
  };
  const pi = { on: (name, fn) => events.set(name, fn), registerCommand: (name, command) => commands.set(name, command), registerTool: tool => tools.set(tool.name, tool), getAllTools: () => [], getCommands: () => [], sendMessage: (...args) => messages.push(args), sendUserMessage: (...args) => messages.push(args) };
  const main = registerMain(pi);
  try {
    await events.get('session_start')({}, ctx);
    const controller = main.getController(); assert.ok(controller);
    let spawns = 0; controller.rpcFactory = () => { spawns++; throw Error('RPC spawn forbidden in settings fixture'); };
    await run({ controller, getController: () => main.getController(), files, actions, notices, confirmations, tools, events, ctx, widgets, messages, spawns: () => spawns,
      confirm: value => { confirmed = value; },
      command: args => commands.get('pair').handler(args, ctx), home, cwd });
  } finally {
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

test('public settings command autosaves scoped changes, switches inheritance, and never starts on edits', () => fixture(async f => {
  const starts = []; f.controller.start = async id => { starts.push(id); };
  const globalBefore = await fs.readFile(f.files.global, 'utf8');
  f.actions.push('Save scope', 'global', 'Enabled', 'Save scope', 'project', 'Autostart', 'Done');
  await f.command('settings');
  assert.deepEqual(JSON.parse(await fs.readFile(f.files.global, 'utf8')), { version: 2, enabled: true }, 'removed limit keys are dropped from saves');
  assert.equal(JSON.parse(globalBefore).limits.maxTurnsPerStep, 55, 'legacy file kept readable');
  assert.ok(!('maxTurnsPerStep' in f.controller.config.limits), 'deprecated keys never reach effective config');
  assert.deepEqual(JSON.parse(await fs.readFile(f.files.project, 'utf8')), { version: 2, autoStart: true, limits: { maxReportsPerTask: 12 } });
  assert.equal(f.controller.config.limits.maxReportsPerTask, 12);
  assert.deepEqual(starts, []); assert.equal(f.spawns(), 0);
  await assert.rejects(fs.stat(f.files.ui), /ENOENT/, 'behavior edits do not rewrite indicator');
  const file = await fs.stat(f.files.project);
  f.actions.push('Done'); await f.command('settings');
  assert.equal((await fs.stat(f.files.project)).mtimeMs, file.mtimeMs);
  await f.command('indicator off');
  const ui = await fs.stat(f.files.ui); await f.command('indicator off');
  assert.equal((await fs.stat(f.files.ui)).mtimeMs, ui.mtimeMs);
  assert.deepEqual(starts, []); assert.equal(f.notices.filter(n => n.level === 'error').length, 0);
  assert.ok(f.tools.has('pair_dispatch') && f.tools.has('pair_status'));
}, { global: { version: 2, limits: { maxTurnsPerStep: 55 } }, project: { version: 2, autoStart: false, limits: { maxTurnsPerStep: 17, maxReportsPerTask: 12 } } }));

test('write failure leaves current value intact, later edit succeeds, saved runtime failure is distinct', () => fixture(async f => {
  await fs.rename(f.files.project, `${f.files.project}.held`); await fs.mkdir(f.files.project);
  f.actions.push('Enabled', 'Done'); await f.command('settings');
  assert.equal(f.controller.config.enabled, false); assert.match(f.notices.at(-1).message, /not saved/);
  await fs.rmdir(f.files.project); await fs.rename(`${f.files.project}.held`, f.files.project);
  f.actions.push('Autostart', 'Done'); await f.command('settings');
  assert.equal(JSON.parse(await fs.readFile(f.files.project, 'utf8')).autoStart, true);
  f.controller.updateConfig = () => { throw Error('runtime held'); };
  f.actions.push('Enabled', 'Done'); await f.command('settings');
  assert.equal(JSON.parse(await fs.readFile(f.files.project, 'utf8')).enabled, true);
  assert.match(f.notices.at(-1).message, /settings saved.*Runtime reload\/reconciliation required: runtime held/);
  assert.equal(f.notices.at(-1).level, 'warning'); assert.equal(f.spawns(), 0);
}));

test('migration requires explicit scoped consent and preserves backup; indicator does not migrate', () => fixture(async f => {
  const bytes = await fs.readFile(f.files.project, 'utf8');
  assert.equal(f.controller.config.enabled, false, 'legacy enablement is not renewed consent');
  await f.command('indicator off'); assert.equal(await fs.readFile(f.files.project, 'utf8'), bytes);
  f.confirm(false); f.actions.push('Enabled', 'Done'); await f.command('settings');
  assert.equal(await fs.readFile(f.files.project, 'utf8'), bytes);
  assert.equal(f.controller.config.enabled, false);
  f.confirm(true); f.actions.push('Advanced', 'Review/migrate', 'Done'); await f.command('settings');
  assert.equal(JSON.parse(await fs.readFile(f.files.project, 'utf8')).enabled, false);
  assert.equal(await fs.readFile(`${f.files.project}.v1.bak`, 'utf8'), bytes);
  assert.equal(f.confirmations.length, 2); assert.equal(f.spawns(), 0);
}, { project: { version: 1, enabled: true, autoStart: false } }));

for (const command of ['start worker', '']) {
  test(`fresh startup preflight via ${command || 'dashboard'} lists all blockers once without constructing a runtime`, () => fixture(async f => {
    if (!command) f.actions.push('Start worker');
    await f.command(command);
    assert.equal(f.actions.length, 0);
    assert.equal(f.spawns(), 0); assert.equal(f.controller.handles.size, 0);
    assert.equal(Object.keys(f.controller.state.workers).length, 0);
    assert.equal(f.notices.length, 1); assert.equal(f.notices[0].level, 'error');
    for (const field of ['shellHangMs = 0', 'maxDepth = 0', 'prewalk.enabled = false', path.join(f.home, 'fabric.json'), path.join(await fs.realpath(f.cwd), '.pi', 'fabric.json')]) assert.ok(f.notices[0].message.includes(field), field);
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

test('reload preserves active authorization and stages the worker model without a replacement', () => fixture(async f => {
  const active = await activeWarmingFixture(f);
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

for (const dashboard of [false, true]) test(`worker restart ${dashboard ? 'dashboard' : 'command'} loads disk settings and reports failures without shutting down Main`, () => fixture(async f => {
  const model = f.ctx.model, epoch = f.controller.state.ownerEpoch, calls = [];
  await fs.writeFile(f.files.project, JSON.stringify({ version: 2, enabled: true, autoStart: false, workers: [{ id: 'new-worker', provider: 'fixture', model: 'new-model', effort: 'low', cwd: null, readOnly: false }] }));
  let fail = true;
  f.controller.restart = async id => {
    calls.push(id); assert.equal(f.controller.config.workers[0].model, 'new-model');
    if (fail) throw Error('Worker model unavailable');
    return { task: { status: 'interrupted' } };
  };
  const restart = async () => { if (dashboard) f.actions.push('Restart worker'); await f.command(dashboard ? '' : 'restart'); };
  await assert.doesNotReject(restart());
  assert.equal(f.notices.at(-1).level, 'error'); assert.match(f.notices.at(-1).message, /Worker model unavailable/);
  assert.equal(f.controller.closing, false); assert.equal(f.ctx.model, model); assert.equal(f.controller.state.ownerEpoch, epoch);
  fail = false; await restart();
  assert.deepEqual(calls, ['new-worker', 'new-worker']); assert.equal(f.notices.at(-1).level, 'info');
  assert.match(f.notices.at(-1).message, /started.*no model turn.*Work remains held/);
  assert.deepEqual(f.messages, []);
}));

test('dashboard exposes reload and rejects bad arguments without runtime work', () => fixture(async f => {
  f.actions.push('Reload configuration'); await f.command('');
  assert.match(f.notices.at(-1).message, /configuration reloaded/);
  await f.command('reload worker'); assert.match(f.notices.at(-1).message, /Use \/pair reload/);
  await f.command('restart worker extra'); assert.match(f.notices.at(-1).message, /Use \/pair restart/);
  assert.equal(f.spawns(), 0);
}));

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

test('public Main usage events update the widget, clear stale context observations, and respect indicator off without inference', () => fixture(async f => {
  const theme = { fg: (_color, text) => text };
  const lines = () => {
    const widget = f.widgets.at(-1);
    assert.equal(widget.key, 'fabric-pair');
    assert.equal(typeof widget.component, 'function');
    return widget.component({}, theme).render(200);
  };
  const row = () => lines()[1];
  const activityOnly = lines();
  assert.equal(activityOnly.length, 1, 'missing usage adds no cache row or spacer');
  assert.match(activityOnly[0], /M● W○/);
  const emit = (name, event = {}) => f.events.get(name)(event, f.ctx);
  const response = usage => emit('message_end', { message: { role: 'assistant', usage } });
  assert.equal(row(), undefined);
  const beforeUsage = f.widgets.length;
  response({ input: 50, cacheRead: 25, cacheWrite: 25, output: 5 });
  assert.ok(f.widgets.length > beforeUsage, 'message_end refreshes the widget through the controller change event');
  assert.equal(f.controller.summary().main.lastUsage.cacheRatio, 0.25);
  assert.equal(f.controller.summary().main.lastUsage.totalInput, 100);
  assert.match(row(), /^ Cache read \(last\): M 25\.0%$/);
  assert.doesNotMatch(row(), /ago/, 'no age timer beside the cache share');
  assert.equal(lines()[0], activityOnly[0], 'cache observations do not alter activity');
  emit('agent_start'); emit('agent_settled');
  assert.match(row(), /M 25\.0%/, 'idle Main retains the last request');
  emit('message_end', { message: { role: 'user' } });
  assert.match(row(), /M 25\.0%/, 'non-assistant messages do not replace usage');
  response({ input: 20, cacheRead: 0, cacheWrite: 0 });
  assert.match(row(), /M 0\.0%/, 'new request replaces, not accumulates with, prior usage');
  emit('model_select');
  assert.equal(f.controller.summary().main.lastUsage, null);
  assert.deepEqual(lines(), activityOnly, 'clearing Main usage removes the row without a spacer');
  response({ input: 0, cacheRead: 20, cacheWrite: 0 });
  assert.match(row(), /M 100\.0%/);
  emit('session_compact');
  assert.equal(f.controller.summary().main.lastUsage, null);
  assert.deepEqual(lines(), activityOnly, 'clearing Main usage removes the row without a spacer');
  response({ input: 0, cacheRead: 0, cacheWrite: 0 });
  assert.equal(f.controller.summary().main.lastUsage, null);
  assert.deepEqual(lines(), activityOnly, 'zero-input observation stays unknown and adds no cache row');
  await f.command('indicator off');
  assert.equal(f.widgets.at(-1).component, undefined);
  response({ input: 30, cacheRead: 10, cacheWrite: 0 });
  assert.equal(f.widgets.at(-1).component, undefined, 'usage cannot re-enable the indicator');
  await f.command('indicator minimal');
  assert.match(row(), /M 25\.0%/);
  assert.equal(f.spawns(), 0);
  assert.deepEqual(f.messages, [], 'display events do not request turns or send warming prompts');
}, { mode: 'tui' }));

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
  assert.deepEqual(f.messages, [], 'observation hooks do not request model turns or warming');
}));

async function activeWarmingFixture(f) {
  const c = f.controller, spec = c.config.workers[0];
  const task = { id: 'warming-task', workerId: spec.id, requestId: 'warming-request', objective: 'Isolated lease fixture', context: '', constraints: [],
    steps: [{ id: 'one', title: 'Work', instructions: 'fixture' }], stepIndex: 0, planRevision: 1, attemptId: 'warming-attempt', attemptNumber: 1,
    status: 'running', leaseId: 'warming-lease', policy: structuredClone(c.config.supervision), limits: structuredClone(c.config.limits),
    verification: structuredClone(c.config.verification), startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 7, usage: null,
    baseSnapshotRef: '/unused-fixture', pendingReport: null, report: null, decisions: {}, lastDecision: null };
  const record = { id: spec.id, cwd: f.cwd, repoRoot: f.cwd, status: 'working', bound: spec, workerGeneration: 1,
    sessionId: 'fake-worker-session', sessionFile: path.join(f.home, 'fake-session.jsonl'), history: [], usage: null, task };
  c.state.workers[spec.id] = record;
  await c.writeAuthority(spec.id, 'running');
  const change = () => c.emit('change', c.summary()); change();
  return { task, record, change, clear: () => { delete c.state.workers[spec.id]; change(); } };
}

test('registered Main warming hooks require explicit active work and hold one scoped lease through review', () => {
  const sdk = fakeWarming();
  return fixture(async f => {
    const native = path.join(f.home, 'settings.json'), bytes = '{"cacheWarming":"off","keep":1}\n'; await fs.writeFile(native, bytes);
    assert.equal(sdk.stats.acquisitions, 0, 'retained-ready/no-task is not eligible');
    const active = await activeWarmingFixture(f), c = f.controller;
    try {
      assert.equal(sdk.leases.size, 1);
      const taskBefore = JSON.stringify(active.task), acquisitions = sdk.stats.acquisitions;
      for (let i = 0; i < 10; i++) {
        active.change(); f.events.get('agent_settled')({}, f.ctx);
        assert.equal(await f.events.get('cache_warming_decision')({ action: 'stop' }, f.ctx), undefined);
      }
      for (const status of ['awaiting_settle', 'question', 'review', 'blocked', 'running']) {
        active.task.status = status; active.record.status = status === 'running' ? 'working' : status; active.change();
        assert.equal(sdk.stats.acquisitions, acquisitions, `${status}: repeated intervals cannot move native clocks`);
      }
      active.record.status = 'working';
      assert.equal(JSON.stringify(active.task), taskBefore);
      const originalConfig = structuredClone(c.config);
      await c.updateConfig({ ...c.config, runtime: { ...c.config.runtime, requestTimeoutMs: c.config.runtime.requestTimeoutMs + 1 } });
      assert.equal(c.summary().settingsPending, true);
      assert.equal(sdk.stats.acquisitions, acquisitions, 'staged profile changes do not restart current lease');
      await c.updateConfig(originalConfig);
      for (const status of ['paused', 'interrupted', 'completed', 'cancelled']) {
        active.task.status = status; active.change(); assert.equal(sdk.leases.size, 0, status);
        active.task.status = 'running'; active.change(); assert.equal(sdk.leases.size, 1);
      }
      for (const status of ['error', 'stopped', 'paused']) {
        active.record.status = status; active.change(); assert.equal(sdk.leases.size, 0, status);
        active.record.status = 'working'; active.change(); assert.equal(sdk.leases.size, 1);
      }
      await c.updateConfig({ ...c.config, enabled: false }); assert.equal(sdk.leases.size, 0);
      await c.updateConfig({ ...c.config, enabled: true, cacheWarming: 'off' }); assert.equal(sdk.leases.size, 0);
      await c.updateConfig({ ...c.config, cacheWarming: 'active' }); assert.equal(sdk.leases.size, 1);
      const status = await f.tools.get('pair_status').execute('status', {}, undefined, undefined, f.ctx);
      assert.equal(status.details.cacheWarming, 'active');
      assert.equal(status.details.main.warming.held, true);
      assert.equal(status.details.main.warming.requested, true);
      assert.equal(active.task.turns, 7, 'no budget reset');
      assert.equal(await fs.readFile(native, 'utf8'), bytes);
      assert.equal(f.spawns(), 0);
      assert.deepEqual(f.messages, [], 'no prompts, paid requests or model continuations');
    } finally { active.clear(); }
    assert.equal(sdk.leases.size, 0);
  }, { project: { version: 2, enabled: true, autoStart: false, cacheWarming: 'active' }, sdk });
});

test('registered Main default-off and unsupported SDK diagnostics never silently claim enabled warming', async () => {
  const sdk = fakeWarming();
  await fixture(async f => {
    const active = await activeWarmingFixture(f);
    try { assert.equal(sdk.stats.acquisitions, 0); assert.equal(f.controller.summary().main.warming.requested, false); }
    finally { active.clear(); }
  }, { project: { version: 2, enabled: true, autoStart: false }, sdk });
  await fixture(async f => {
    const active = await activeWarmingFixture(f);
    try {
      assert.deepEqual(f.controller.summary().main.warming, { supported: false, requested: true, held: false, error: null });
      assert.equal(await f.events.get('cache_warming_decision')({ action: 'warm' }, f.ctx), undefined);
      assert.deepEqual(f.messages, []);
    } finally { active.clear(); }
  }, { project: { version: 2, enabled: true, autoStart: false, cacheWarming: 'active' } });
});

test('Main releases for compaction, rebind, closing and shutdown without touching other native owners', async () => {
  const sdk = fakeWarming(), other = sdk.acquireCacheWarming('idle');
  await fixture(async f => {
    const active = await activeWarmingFixture(f);
    try {
      assert.equal(sdk.leases.size, 2);
      await f.events.get('session_before_compact')({}, f.ctx); assert.equal(sdk.leases.size, 1);
      await f.events.get('session_compact_failed')({}, f.ctx); assert.equal(sdk.leases.size, 2);
      const stale = { ...f.ctx, sessionManager: { getSessionId: () => 'settings-test-owner' } };
      delete f.controller.state.workers.worker; // fixture removes its memory-only actor before rebinding
      f.ctx.sessionManager.getSessionId = () => 'warming-next-session';
      await f.events.get('session_start')({}, f.ctx);
      assert.equal(sdk.leases.size, 1, 'rebind releases before closing the old controller');
      await f.events.get('cache_warming_decision')({ action: 'warm' }, stale);
      assert.equal(sdk.leases.size, 1, 'old context cannot acquire on a new binding');
      await f.getController().close();
      assert.equal(sdk.leases.size, 1);
      await f.events.get('session_shutdown')({}, f.ctx);
      assert.equal(sdk.leases.size, 1);
    } finally { delete f.controller.state.workers.worker; }
  }, { project: { version: 2, enabled: true, autoStart: false, cacheWarming: 'active' }, sdk });
  other(); assert.equal(sdk.leases.size, 0);
});

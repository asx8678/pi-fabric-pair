import { initTheme } from '@earendil-works/pi-coding-agent'; try { initTheme('dark'); } catch {}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { registerMain } from '../src/main.js';
import { configPaths } from '../src/config.js';

async function fixture(run, { global, project = { version: 2, autoStart: false }, trusted = true, mode = 'rpc', fabric } = {}) {
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
  const ctx = { cwd, mode, hasUI: true, isProjectTrusted: () => trusted,
    sessionManager: { getSessionId: () => 'settings-test-owner' }, getContextUsage: () => undefined,
    model: { provider: 'main', id: 'native' }, modelRegistry: { getAvailable: () => [] },
    ui: { select: async (_title, rows) => {
      assert.ok(actions.length, 'unexpected dialog'); const next = actions.shift();
      if (next === undefined) return undefined;
      const value = rows.find(row => row.startsWith(next)); assert.ok(value, `missing ${next}`); return value;
    }, setStatus: () => {}, setWidget: () => {}, notify: (message, level) => notices.push({ message, level }), setWidget: (key, component) => widgets.push({ key, component }),
    confirm: async (...args) => { confirmations.push(args); return confirmed; } }
  };
  const fabricTools = [];
  if (fabric) {
    const root = path.join(base, 'fabric-package');
    await fs.mkdir(path.join(root, 'dist'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'pi-fabric', version: fabric }));
    fabricTools.push({ name: 'fabric_exec', sourceInfo: { path: path.join(root, 'dist', 'index.js') } });
  }
  const pi = { on: (name, fn) => events.set(name, fn), registerCommand: (name, command) => commands.set(name, command), registerTool: tool => tools.set(tool.name, tool), getAllTools: () => fabricTools, getCommands: () => [], sendMessage: (...args) => messages.push(args), sendUserMessage: (...args) => messages.push(args) };
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

for (const dashboard of [false, true]) test(`worker restart ${dashboard ? 'dashboard' : 'command'} loads disk settings and reports failures without shutting down Main`, { skip: dashboard ? 'stale: written before the safe-boundary delivery and TUI redesign (commits 50bef22..d5b6289); needs re-derivation, see tests/README.md' : false }, () => fixture(async f => {
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
    await fixture(async f => { content = (await f.events.get('before_agent_start')({ systemPrompt: 'Fixture' }, f.ctx))?.message?.content; },
      { project: { version: 2, enabled: true, autoStart: false }, fabric });
    return content;
  };
  const old = await guide('0.96.3');
  assert.match(old, /This Fabric \(0\.96\.3\) has no cache provider \(added in 0\.97\.0\)/);
  assert.doesNotMatch(old, /inspect warming with cache\.status\(\)/);
  const current = await guide('0.97.0');
  assert.match(current, /Fabric's cache provider is loaded, but this Pi has no scoped warming API/, 'stock Pi 0.87.1 has no acquireCacheWarming');
  assert.match(await guide(undefined), /this version is unknown/, 'no readable Fabric version is stated as unknown');
  for (const text of [old, current]) assert.match(text, /Never simulate warming/);
});

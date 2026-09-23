import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import extension from '../src/extension.js';
import { registerMain } from '../src/main.js';
import { fixture, assignment, awaitReport, approve } from './helpers.js';
import { atomicJSON } from '../src/util.js';

async function host(t, options = {}) {
  const f = await fixture(t, options);
  const before = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = f.home;
  const originalScenario = process.env.FAKE_PI_SCENARIO;
  process.env.FAKE_PI_SCENARIO = options.scenario || 'checkpoint';
  await atomicJSON(path.join(f.home, 'fabric-pair.json'), f.config);
  const events = new Map(), tools = new Map(), commands = new Map(), messages = [], widgets = [], notifications = [];
  let abortCount = 0;
  const pi = {
    on(name, handler) { if (!events.has(name)) events.set(name, []); events.get(name).push(handler); return () => {}; },
    registerTool(tool) { tools.set(tool.name, tool); },
    registerCommand(name, value) { commands.set(name, value); },
    getAllTools() { return [{ name: 'fabric_exec' }, ...(options.noFovea ? [] : [{ name: 'fovea_focus' }]), ...tools.values()]; },
    getCommands() { return [{ name: 'fabric', source: 'extension' }, ...(options.noFovea ? [] : [{ name: 'fovea', source: 'extension' }])]; },
    sendMessage(value, delivery) { messages.push({ value, delivery }); }, appendEntry() {}
  };
  const ctx = {
    cwd: f.cwd, mode: 'tui', hasUI: true, model: { provider: 'fixture', id: 'main-model', contextWindow: 100000 },
    isProjectTrusted: () => true, isIdle: () => true, abort: () => abortCount++,
    sessionManager: { getSessionId: () => 'main-host-test', getSessionFile: () => path.join(f.tmp, 'main.jsonl') },
    modelRegistry: { getAvailable: () => [{ provider: 'fixture', id: 'worker-model' }] },
    getContextUsage: () => ({ tokens: 500, contextWindow: 100000, percent: 0.5 }),
    ui: { setWidget(key, lines) { widgets.push({ key, lines }); },
      notify(message, level) { notifications.push({ message, level }); },
      confirm: async () => false, select: async () => undefined, input: async () => undefined, editor: async () => undefined }
  };
  const registration = registerMain(pi);
  const emit = async name => { for (const fn of events.get(name) || []) await fn({ type: name, reason: 'startup' }, ctx); };
  await emit('session_start'); const c = registration.getController(); assert.ok(c); f.controllers.push(c);
  t.after(async () => {
    await emit('session_shutdown');
    if (before === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = before;
    if (originalScenario === undefined) delete process.env.FAKE_PI_SCENARIO; else process.env.FAKE_PI_SCENARIO = originalScenario;
  });
  return { ...f, c, pi, ctx, events, emit, tools, commands, widgets, messages, notifications, getAbortCount: () => abortCount };
}

test('extension factory registers resources synchronously without spawning a process', () => {
  const registrations = [];
  const pi = { on: n => registrations.push(n), registerTool: t => registrations.push(t.name), registerCommand: n => registrations.push(n) };
  assert.equal(extension(pi), undefined);
  assert.ok(registrations.includes('session_start')); assert.ok(registrations.includes('pair'));
  assert.ok(registrations.includes('pair_dispatch')); assert.ok(!registrations.includes('model'));
});

test('Main registers separate Pair controls without replacing native UI or /model', async t => {
  const h = await host(t);
  assert.deepEqual([...h.commands.keys()], ['pair']);
  assert.deepEqual([...h.tools.keys()].sort(), ['pair_cancel', 'pair_decide', 'pair_dispatch', 'pair_inspect', 'pair_status']);
  assert.ok(h.widgets.every(w => w.key === 'fabric-pair'));
  assert.equal(h.c.handles.size, 0); // no worker model calls just to draw UI
});

test('indicator off/minimal is rendering only, including while a worker is running', async t => {
  const h = await host(t, { scenario: 'hang' });
  await h.c.dispatch(assignment('ui', 'worker', 1));
  const before = h.c.summary().workers[0], count = h.messages.length;
  await h.commands.get('pair').handler('indicator off', h.ctx);
  assert.equal(h.widgets.at(-1).lines, undefined);
  const after = h.c.summary().workers[0];
  assert.equal(after.pid, before.pid); assert.equal(after.sessionId, before.sessionId);
  assert.equal(after.task.status, 'running'); assert.equal(h.messages.length, count);
  await h.commands.get('pair').handler('indicator minimal', h.ctx);
  assert.match(h.widgets.at(-1).lines[0], /^M[●◉] W/);
  assert.equal(h.c.summary().workers[0].pid, before.pid);
});

test('Main receives reports in its existing session as follow-ups, not a model switch', async t => {
  const h = await host(t);
  await h.tools.get('pair_dispatch').execute('call-1', assignment('tool-dispatch', 'worker', 1), undefined, undefined, h.ctx);
  await awaitReport(h.c);
  const report = h.messages.find(m => m.value.customType === 'fabric-pair.report');
  assert.ok(report); assert.equal(report.delivery.deliverAs, 'followUp'); assert.equal(report.delivery.triggerTurn, true);
  assert.equal(h.ctx.model.id, 'main-model');
  await approve(h.c);
});

test('Main native compaction restores only coordination state without starting a turn', async t => {
  const h = await host(t); await h.c.dispatch(assignment('main-compact')); await awaitReport(h.c);
  const worker = h.c.summary().workers[0]; await h.emit('session_compact');
  const restore = h.messages.find(m => m.value.customType === 'fabric-pair.task-state');
  assert.ok(restore); assert.equal(restore.delivery.triggerTurn, false); assert.equal(restore.delivery.deliverAs, 'nextTurn');
  assert.equal(h.c.summary().workers[0].sessionId, worker.sessionId);
});

test('Main missing required Fovea refuses dispatch before creating a worker', async t => {
  const h = await host(t, { noFovea: true });
  await assert.rejects(() => h.tools.get('pair_dispatch').execute('call-2', assignment(), undefined, undefined, h.ctx), /Main has no Fovea/);
  assert.equal(h.c.handles.size, 0);
});

test('Main direct edit gate applies only while a Pair task is active', async t => {
  const h = await host(t);
  const hook = h.events.get('tool_call')[0];
  assert.equal(await hook({ toolName: 'edit' }, h.ctx), undefined);
  await h.c.dispatch(assignment('edit-gate')); await awaitReport(h.c);
  assert.equal((await hook({ toolName: 'extensions.edit' }, h.ctx)).block, true);
  assert.equal(await hook({ toolName: 'read' }, h.ctx), undefined);
  await h.c.cancel('worker'); assert.equal(await hook({ toolName: 'edit' }, h.ctx), undefined);
});

test('hiding the indicator does not change repository evidence or stale an approval', async t => {
  const h = await host(t); await h.c.dispatch(assignment('ui-review', 'worker', 1));
  const report = await awaitReport(h.c), hash = report.checkpoint.checkpointHash;
  await h.commands.get('pair').handler('indicator off', h.ctx);
  assert.equal((await h.c.evidence.capture(h.cwd)).hash, hash);
  await approve(h.c); assert.equal(h.c.record('worker').task.status, 'completed');
});

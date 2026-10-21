// The /pair dashboard end to end: keys pressed in the TUI view run through main.js to the controller and the config
// file, with fake low workers that really start and stop. The UI tests check each key in isolation; this checks the wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerMain } from '../src/main.js';
import { configPaths } from '../src/config.js';
const FAKE = fileURLToPath(new URL('./helpers/fake-low.mjs', import.meta.url));
const strip = s => s.replace(/\u001b\[[0-9;]*m/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('dashboard keys run end to end: start, switch, stop, default, add, remove (keep or discard), settings pick', { timeout: 60000 }, async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-menu-e2e-'));
  const cwd = path.join(base, 'repo'), home = path.join(base, 'agent'), fakeHome = path.join(base, 'home');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home); await fs.mkdir(fakeHome);
  execFileSync('git', ['init', '-q'], { cwd });
  await fs.writeFile(path.join(cwd, 'README.md'), 'x\n');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'init', '--allow-empty'], { cwd });
  execFileSync('git', ['add', '.'], { cwd }); execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'files'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  const files = configPaths(cwd);
  const w = (id, model) => ({ id, provider: 'test', model, effort: 'low', cwd: null, readOnly: false });
  await fs.writeFile(files.project, JSON.stringify({ version: 2, enabled: true, autoStart: false,
    runtime: { backend: 'low', lowCommand: 'low' }, requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [w('worker', 'one'), w('ds2', 'two')] }));
  const events = new Map(), commands = new Map(), notices = [], confirmations = [], screens = [], inputs = [], selects = [];
  const ctx = { cwd, mode: 'tui', hasUI: true, isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => 'menu-e2e-owner', getSessionFile: () => undefined, getEntries: () => [], getBranch: () => [] }, getContextUsage: () => undefined,
    model: { provider: 'main', id: 'native' }, modelRegistry: { getAvailable: () => [{ provider: 'test', id: 'three', reasoning: true }], find: () => undefined },
    ui: { select: async (title, rows) => { selects.push([title, rows]); const want = inputs.shift(); return want === undefined ? undefined : rows.find(r => r.startsWith(want)); },
      input: async (title) => { selects.push([title]); return inputs.shift(); },
      setStatus: () => {}, setWidget: () => {}, setTitle: () => {}, notify: (message, level) => notices.push({ message, level }),
      custom: (factory, options) => new Promise(resolve => { screens.push({ component: factory({ terminal: { columns: 100, rows: 40 }, requestRender() {} }, null, null, resolve), options }); }),
      confirm: async (...args) => { confirmations.push(args); return true; } } };
  const pi = { on: (n, f) => events.set(n, f), registerCommand: (n, c) => commands.set(n, c), registerShortcut: () => {}, registerTool: () => {}, getAllTools: () => [], getCommands: () => [], getThinkingLevel: () => 'medium', appendEntry: () => {}, sendMessage: () => {}, sendUserMessage: () => {} };
  const main = registerMain(pi);
  try {
    await events.get('session_start')({}, ctx);
    const c = main.getController(); assert.ok(c);
    c.spawnLow = (_cmd, args, options) => spawn(process.execPath, [FAKE, ...args], { ...options, env: { ...options.env, HOME: fakeHome } });
    const live = id => !!c.summary().workers.find(x => x.id === id)?.pid;
    const until = async (what, fn, ms = 15000) => { const end = Date.now() + ms; while (!fn()) { assert.ok(Date.now() < end, `timed out: ${what}\n${JSON.stringify(notices.slice(-4))}\n${shown()}`); await sleep(50); } };
    const screen = () => screens[screens.length - 1];
    const shown = () => screens.length ? strip(screen().component.render(100).join('\n')) : '';
    const press = async (...keys) => { for (const k of keys) { screen().component.handleInput(k); await sleep(30); } };
    const reopened = async n => until('dashboard reopened', () => screens.length > n);

    const dash = commands.get('pair').handler('', ctx);
    await until('dashboard open', () => screens.length === 1);
    assert.match(shown(), /worker/); assert.match(shown(), /ds2/);

    // n starts the selected (first) worker
    let n = screens.length; await press('n'); await reopened(n);
    await until('worker live', () => live('worker'));

    // down to ds2, n: asks to switch, stops worker, starts ds2
    n = screens.length; await press('j', 'n'); await reopened(n);
    await until('ds2 live', () => live('ds2'));
    assert.ok(!live('worker'), 'the other worker was stood down');
    assert.ok(confirmations.some(([t]) => t === 'Switch worker'), 'switch asked first');

    // x stops ds2 (selection kept on ds2)
    n = screens.length; await press('x'); await reopened(n);
    await until('ds2 stopped', () => !live('ds2'));

    // * makes ds2 the default
    n = screens.length; await press('*'); await reopened(n);
    let file = JSON.parse(await fs.readFile(files.project, 'utf8'));
    assert.deepEqual(file.workers.map(x => x.id), ['ds2', 'worker'], 'default moves it first');

    // a adds a worker: id, then model and effort pickers
    n = screens.length;
    inputs.push('third', 'test/three', 'low');
    await press('a'); await reopened(n);
    file = JSON.parse(await fs.readFile(files.project, 'utf8'));
    assert.deepEqual(file.workers.map(x => x.id), ['ds2', 'worker', 'third'], `added: ${JSON.stringify(notices.slice(-3))}`);
    assert.ok(c.config.workers.some(x => x.id === 'third'), 'the running controller has it without a restart');

    // start third, then D removes it while live: stopped and gone, no restart
    for (let i = 0; i < 5; i++) await press('j');
    n = screens.length; await press('n'); await reopened(n);
    await until('third live', () => live('third'));
    // D asks one question, keep or discard the conversation; keeping needs no second prompt.
    const asked = confirmations.length;
    n = screens.length; inputs.push('Remove, keep'); await press('D'); await reopened(n);
    await until('third gone', () => !c.summary().workers.some(x => x.id === 'third'));
    const removal = selects.find(([title]) => /^Remove worker third\?/.test(title));
    assert.ok(removal, 'D asks which removal');
    assert.match(removal[0], /It is running, so it is stopped first/, 'the question says a running worker is stopped');
    assert.deepEqual(removal[1], ['Remove, keep its conversation', 'Remove and discard its conversation']);
    assert.equal(confirmations.length, asked, 'keeping asks nothing more');
    file = JSON.parse(await fs.readFile(files.project, 'utf8'));
    assert.deepEqual(file.workers.map(x => x.id), ['ds2', 'worker']);
    assert.ok(c.summary().workers.every(x => !x.pid), 'no worker left running');
    assert.ok(notices.some(x => /Removed worker third.*its conversation was kept/.test(x.message)));

    // Discarding from the dashboard confirms first, since it cannot be undone.
    n = screens.length; inputs.push('fourth', 'test/three', 'low'); await press('a'); await reopened(n);
    for (let i = 0; i < 5; i++) await press('j');
    n = screens.length; inputs.push('Remove and discard'); await press('D'); await reopened(n);
    await until('fourth gone', () => !c.summary().workers.some(x => x.id === 'fourth'));
    assert.ok(confirmations.slice(asked).some(([title, body]) => title === 'Remove worker' && /not recoverable/.test(body)), 'discard confirms');
    assert.ok(notices.some(x => /Removed worker fourth.*its conversation was discarded/.test(x.message)));
    // Cancelling the question removes nothing.
    n = screens.length; await press('D'); await reopened(n);
    assert.equal(c.summary().workers.length, 2, 'a cancelled removal keeps the worker');

    // More: restart a live worker, reload settings, status, inbox, doctor, help; each view closes back to the dashboard
    n = screens.length; await press('n'); await reopened(n); // start whichever worker the removal left selected
    const sel2 = c.summary().workers.find(x => x.pid)?.id; assert.ok(sel2, 'a worker is live again');
    const pidBefore = c.summary().workers.find(x => x.id === sel2).pid;
    n = screens.length; await press('m', 'r'); await reopened(n);
    await until('restarted with a new process', () => { const x = c.summary().workers.find(y => y.id === sel2); return !!x?.pid && x.pid !== pidBefore; });
    n = screens.length; await press('m', 'l'); await reopened(n);
    assert.ok(notices.some(x => /reloaded/i.test(x.message)) || /reloaded/i.test(shown()), 'reload says so');
    for (const key of ['i', 'b', 'd']) {
      n = screens.length; await press('m', key); await until(`view ${key} open`, () => screens.length > n);
      const m = screens.length; await press('\u001b'); await until(`view ${key} closed`, () => screens.length > m);
    }
    await press('?'); assert.match(shown(), /add worker/i, 'help lists the keys'); await press('?');
    n = screens.length; await press('x'); await reopened(n);
    await until('stopped', () => c.summary().workers.every(x => !x.pid));

    // s opens settings; pick worker from the list with Enter, then close back to the dashboard
    n = screens.length; await press('s'); await until('settings open', () => screens.length > n);
    assert.match(shown(), /Pair settings/);
    for (let i = 0; i < 20 && !/^\s*▸ · worker/m.test(shown().replace(/│/g, '')); i++) await press('k');
    await press('\r');
    assert.match(shown(), /· worker +editing/, 'Enter picked the worker in settings');
    n = screens.length; await press('\u001b'); await reopened(n);
    await press('q'); await dash;
    assert.ok(!notices.some(x => /Pair settings saved/.test(x.message)), `worker-list edits say what changed, once: ${JSON.stringify(notices)}`);
    assert.ok(notices.some(x => /Removed worker third/.test(x.message)) && notices.some(x => x.message === 'Added worker third — test/three, low.'), 'the added worker is described once');
  } finally {
    await events.get('session_shutdown')({}, ctx).catch(() => {});
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

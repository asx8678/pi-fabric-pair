import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleWidth } from '@earendil-works/pi-tui';
import { settingsScreen } from '../src/settings-screen.js';
import { DEFAULTS, validateConfig } from '../src/config.js';
import { overlayRows } from '../src/ui.js';

/** No theme, no keybindings: the screen must read without either, like the tests and a bare terminal. */
const MODELS = [{ provider: 'alpha', id: 'one', reasoning: true }, { provider: 'beta', id: 'two', reasoning: true },
  { provider: 'moonshot', id: 'kimi-k2', name: 'Kimi K2', reasoning: true },
  { provider: 'opendesign', id: 'deepseek-v4.1-flash', name: 'DeepSeek Flash', reasoning: true }];
const strip = string => string.replace(/\u001b\[[0-9;]*m/g, '');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
/** The Enter key, spelled without an escape so an editor cannot turn it into a line break. */
const ENTER = String.fromCharCode(13);

/**
 * A fake ctx.ui.custom: every custom view becomes the current component, and done() resolves that view's promise,
 * which is what makes a close (or a dialog round trip) observable.
 * @param {{rows?: number, columns?: number, models?: {provider: string, id: string, reasoning?: boolean, thinkingLevelMap?: Partial<Record<string, string | null>>}[], trusted?: boolean}} [options]
 */
function screenHost(options = {}) {
  const models = options.models ?? MODELS;
  /** @type {{component: any, views: number, applied: any[], calls: any[], overlayOptions: any, editor: string | undefined, confirm: boolean, options: Record<string, unknown>}} */
  const state = { component: null, views: 0, applied: [], calls: [], overlayOptions: null, editor: undefined, confirm: true, options: {} };
  const ctx = { mode: 'tui', isProjectTrusted: () => options.trusted ?? true, model: { provider: 'main', id: 'native' },
    modelRegistry: { getAvailable: () => models, find: (provider, id) => models.find(model => model.provider === provider && model.id === id) },
    ui: {
      editor: async (title, prefill) => { state.calls.push(['editor', title, prefill]); return state.editor; },
      confirm: async (title, message) => { state.calls.push(['confirm', title, message]); return state.confirm; },
      notify: (...args) => state.calls.push(['notify', ...args]),
      select: async (...args) => { state.calls.push(['select', ...args]); return undefined; },
      input: async (...args) => { state.calls.push(['input', ...args]); return undefined; },
      custom(factory, viewOptions = {}) {
        state.views++; state.overlayOptions = viewOptions;
        return new Promise(resolve => {
          state.component = factory({ terminal: options.rows ? { rows: options.rows, columns: options.columns ?? 100 } : { columns: options.columns ?? 100 }, requestRender() {} }, null, null, resolve);
        });
      }
    } };
  return { ctx, state };
}

/** @param {Record<string, unknown>} [overrides] */
const base = (overrides = {}) => validateConfig({ version: 2, enabled: true, workers: [{ id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false }], ...overrides });

/**
 * Opens the screen and returns its promise, leaving the first view mounted.
 * @param {ReturnType<typeof screenHost>} host
 * @param {{start?: any, scope?: 'project' | 'global', onApply?: (next: any, scope: any) => Promise<any>, options?: Record<string, unknown>}} [settings]
 */
async function open(host, { start = base(), scope = 'project', onApply, options = {} } = {}) {
  const apply = onApply ?? (async (next, target) => { host.state.applied.push([next, target]); return next; });
  const run = settingsScreen(host.ctx, start, scope, apply, { loadScope: async target => (target === 'global' ? base({ enabled: false }) : start), ...host.state.options, ...options });
  await tick();
  host.state.run = run;
}
const press = (host, ...keys) => { for (const key of keys) host.state.component.handleInput(key); };
const text = (host, width = 100) => strip(host.state.component.render(width).join('\n'));

/** Down `count` rows on the page, then Enter. */
const commitRow = (host, count) => { for (let index = 0; index < count; index++) press(host, 'j'); press(host, '\r'); };

/** The visible page labels come from one list, so a test names a page instead of counting tabs. */
const PAGE_ORDER = ['Workers', 'Review', 'Supervision', 'Limits', 'Verification', 'Peer review', 'Runtime', 'Requirements', 'Evidence', 'Display', 'General'];
/**
 * Tab forward (or back) until the named page is the bracketed one, so adding a page never renumbers a test.
 * @param {ReturnType<typeof screenHost>} host @param {string} label
 */
function goPage(host, label) {
  for (let step = 0; step < PAGE_ORDER.length * 2; step++) {
    if (currentPage(host) === label) return;
    press(host, '\t');
  }
  throw new Error(`no page ${label}: ${text(host).split('\n')[1]}`);
}
/**
 * The active page, read from the bracketed tab. Rendering at 200 columns keeps every tab on the bar, so this does
 * not depend on which pages the narrow bar happens to show.
 * @param {ReturnType<typeof screenHost>} host @returns {string}
 */
function currentPage(host) {
  const match = /\[ ([^\]]+) \]/.exec(text(host, 200));
  return match ? match[1] : '';
}
/** Opens the review page and lands on a row of it. */
const reviewRow = (host, count) => { goPage(host, 'Review'); commitRow(host, count); };

/** Opens the general page and lands on a row of it. */
const generalRow = (host, count) => { goPage(host, 'General'); commitRow(host, count); };
/** The first rendered line matching a pattern (a whole test may otherwise be one string). */
const lineOf = (host, /** @type {RegExp} */ pattern, width = 100) => text(host, width).split('\n').find(line => pattern.test(line)) ?? '';
/**
 * Close the screen and wait for settingsScreen to settle. Esc first, because an open inline input would otherwise
 * swallow the q as text — a test that forgets it would hang instead of failing.
 */
const quit = (host, /** @type {string[]} */ keys = ['\u001b', 'q']) => { press(host, ...keys); return host.state.run; };

test('the settings screen is one framed overlay whose every line is exactly the render width', async () => {
  const host = screenHost();
  await open(host);
  assert.equal(host.state.overlayOptions.overlay, true, 'the screen is its own overlay, not a menu in place of the editor');
  const overlay = host.state.overlayOptions.overlayOptions();
  assert.equal(overlay.anchor, 'center');
  assert.equal(overlay.maxHeight, '80%');
  assert.equal(overlay.minWidth, 40);
  assert.equal(overlay.width, 90, '90% of a 100-column terminal: Pair\'s usual overlay width');
  for (const width of [100, 48]) {
    const lines = host.state.component.render(width);
    assert.equal(visibleWidth(lines[0]), width, `top border at ${width}`);
    assert.ok(strip(lines[0]).startsWith('╭') && strip(lines[0]).includes('Pair settings'), `title in the frame at ${width}`);
    assert.ok(strip(lines[0]).includes('Saves to: this project'), 'the scope label says where a save goes: ' + strip(lines[0]));
    assert.equal(visibleWidth(lines.at(-1)), width, `bottom border at ${width}`);
    assert.ok(strip(lines.at(-1)).startsWith('╰') && strip(lines.at(-1)).endsWith('╯'));
    for (const line of lines.slice(1, -1)) {
      assert.equal(visibleWidth(line), width, `interior line at ${width}: ${strip(line)}`);
      assert.ok(strip(line).startsWith('│') && strip(line).endsWith('│'), 'sides: ' + strip(line));
    }
    // The keys and the selected row survive both widths.
    assert.match(text(host, width), /▸ Model/);
    assert.match(text(host, width), /esc|close/);
  }
  press(host, 'q');
  await host.state.run;
});

test('tab, arrows and h/l change page in both directions and wrap, marking the page without colour', async () => {
  const host = screenHost();
  await open(host);
  const page = () => text(host).split('\n')[1];
  // The bar scrolls: eleven pages do not fit 60 columns, so the first page shows with a ▸ marking the rest.
  assert.match(page(), /\[ Workers \]/, 'the active page is bracketed, not only coloured');
  assert.match(page(), /▸/, 'the bar says it continues past the right edge');
  press(host, '\t');
  assert.match(page(), /\[ Review \] · Supervision/, 'tab moves one page and the bar keeps the current page visible');
  press(host, 'h');
  assert.match(page(), /\[ Workers \]/, 'h goes back');
  press(host, 'l');
  assert.match(page(), /\[ Review \]/, 'l goes forward');
  // From the last page, tab wraps to the first and h wraps back to the last.
  goPage(host, 'General');
  assert.equal(currentPage(host), 'General', 'the last page is reachable');
  assert.match(page(), /◂/, 'the bar says it continues past the left edge');
  press(host, '\t');
  assert.match(page(), /\[ Workers \]/, 'tab wraps from the last page to the first');
  press(host, 'h');
  assert.equal(currentPage(host), 'General', 'h wraps backwards');
  press(host, '\u001b[Z');
  assert.equal(currentPage(host), 'Display', 'shift+tab goes back');
  press(host, 'l');
  assert.equal(currentPage(host), 'General', 'l goes forward');
  press(host, '\u001b[D');
  assert.equal(currentPage(host), 'Display', 'left arrow goes back');
  press(host, '\u001b[C');
  assert.equal(currentPage(host), 'General', 'right arrow goes forward');
  press(host, 'q');
  await host.state.run;
});

test('a toggle flips and saves on Enter and on Space, always with the scope being edited', async () => {
  for (const key of ['\r', ' ']) {
    const host = screenHost();
    await open(host);
    goPage(host, 'Review');
    for (let index = 0; index < 6; index++) press(host, 'j'); // Deliver reports automatically is the last review row
    press(host, key);
    await tick();
    assert.equal(host.state.applied.length, 1, `${JSON.stringify(key)} saves once`);
    assert.equal(host.state.applied[0][0].autoDeliverReports, false, 'the existing field flips');
    assert.equal(host.state.applied[0][1], 'project', 'the save names the scope');
    assert.match(text(host), /✔ Saved — Deliver reports automatically: Off \(this project's settings\)/);
    press(host, 'q');
    await host.state.run;
  }
});

test('a choice opens an option list in the same box: Enter, down, Enter saves; Esc saves nothing', async () => {
  const host = screenHost();
  await open(host);
  press(host, 'j', '\r');
  assert.match(text(host), /▸ ✓ medium/, 'the current value is marked and highlighted');
  assert.match(text(host), /enter choose/, 'the list brings its own keys');
  press(host, '\u001b');
  await tick();
  assert.equal(host.state.applied.length, 0, 'Esc returns without a change');
  press(host, '\r', 'j', '\r');
  await tick();
  assert.equal(host.state.applied.length, 1, 'Enter, down, Enter saves');
  assert.equal(host.state.applied[0][0].workers[0].effort, 'high', 'and it is the option below medium');
  assert.match(text(host), /✔ Saved — Thinking effort: high/);
  // Space is the quick change: the next value without a list (high wraps around to off).
  press(host, ' ');
  await tick();
  assert.equal(host.state.applied.length, 2);
  assert.equal(host.state.applied[1][0].workers[0].effort, 'off');
  press(host, 'q');
  await host.state.run;
});

test('a number row rejects what is out of range with an inline error, then saves a whole number', async () => {
  const host = screenHost();
  await open(host);
  goPage(host, 'Review');
  commitRow(host, 2); // Revision limit, below the policy and step size rows
  assert.match(text(host), /enter save/);
  for (let index = 0; index < 2; index++) press(host, '\u007f');
  press(host, '2', '5', '\r');
  await tick();
  assert.equal(host.state.applied.length, 0, 'out of range saves nothing');
  assert.match(text(host), /Enter a whole number from 0 to 20\./);
  assert.match(text(host), /25/, 'the input stays open with the rejected text');
  for (let index = 0; index < 2; index++) press(host, '\u007f');
  press(host, '7', '\r');
  await tick();
  assert.equal(host.state.applied.length, 1);
  assert.equal(host.state.applied[0][0].supervision.maxRevisions, 7);
  assert.match(text(host), /✔ Saved — Revision limit: 7/);
  press(host, 'q');
  await host.state.run;
});

test('a blank workspace saves null, meaning the same workspace as Main', async () => {
  const host = screenHost();
  await open(host, { start: base({ workers: [{ id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: '/tmp/worker', readOnly: false }] }) });
  commitRow(host, 3); // Workspace
  assert.match(text(host), /▸ Workspace.*\/tmp\/worker/, 'the row is an open input prefilled with the path');
  for (let index = 0; index < 12; index++) press(host, '\u007f');
  press(host, '\r');
  await tick();
  assert.equal(host.state.applied.length, 1);
  assert.equal(host.state.applied[0][0].workers[0].cwd, null);
  assert.match(text(host), /✔ Saved — Workspace: same as Main/);
  press(host, 'q');
  await host.state.run;
});

test('the model picker filters the signed-in models, then clamps the effort and says so in the status line', async () => {
  const models = [{ provider: 'beta', id: 'two', reasoning: true, thinkingLevelMap: { medium: null } }, { provider: 'alpha', id: 'one', reasoning: true }];
  const host = screenHost({ models });
  await open(host);
  press(host, '\r');
  assert.match(text(host), /alpha\/one/, 'the available models are listed, sorted');
  assert.match(text(host), /▸ alpha\/one/, 'the current one is preselected');
  press(host, 'b', 'e');
  assert.match(text(host), /▸ beta\/two/, 'typing filters the list down to the match');
  assert.doesNotMatch(text(host), /│ {2,}alpha\/one/, 'the other model is filtered out of the list');
  press(host, '\r');
  await tick();
  assert.equal(host.state.applied.length, 1);
  assert.equal(host.state.applied[0][0].workers[0].model, 'two');
  assert.equal(host.state.applied[0][0].workers[0].effort, 'high', 'medium is unsupported by this model, so the effort is clamped up');
  assert.match(text(host), /✔ Saved — Model: beta\/two · thinking effort changed from medium to high/);
  assert.deepEqual(host.state.calls.filter(call => call[0] === 'notify'), [], 'the overlay never posts a notification over itself');
  press(host, 'q');
  await host.state.run;
});

test('no signed-in models is a warning in the status line, not a dialog', async () => {
  const host = screenHost({ models: [] });
  await open(host);
  press(host, '\r');
  assert.match(text(host), /No signed-in models\. Set up a provider in Pi first \(\/login\)\./);
  assert.equal(host.state.views, 1, 'no second view is opened');
  assert.deepEqual(host.state.calls, []);
  press(host, 'q');
  await host.state.run;
});

test('a failed save says so and keeps showing the last saved values', async () => {
  const host = screenHost();
  await open(host, { onApply: async () => { throw new Error('the config directory is read-only'); } });
  press(host, 'j', '\r', 'j', '\r');
  await tick();
  assert.match(text(host), /✖ Not saved: the config directory is read-only/);
  press(host, '\u001b');
  assert.match(text(host), /Thinking effort {2}medium/, 'the old value is still the one shown');
  press(host, '\u001b');
  await host.state.run;
});

test('Save to switches scope through loadScope without saving, and the next save goes to that scope', async () => {
  const host = screenHost();
  await open(host);
  goPage(host, 'General');
  commitRow(host, 4); // Save to
  press(host, 'j', '\r');
  await tick();
  assert.equal(host.state.applied.length, 0, 'switching scope copies nothing and saves nothing');
  assert.match(text(host), /Now editing global settings\. Switching copies nothing\./);
  assert.match(text(host), /Saves to: all projects \(global\)/, 'the frame names the scope being edited');
  press(host, 'k', '\r');
  await tick();
  assert.equal(host.state.applied.length, 1, 'the next change is saved');
  assert.equal(host.state.applied[0][1], 'global', 'into the scope the screen now edits');
  assert.match(text(host), /global settings\)/);
  press(host, 'q');
  await host.state.run;
});

test('verification commands close the view, use Pi\'s editor and confirm, then reopen on the same page and row', async () => {
  const host = screenHost();
  host.state.editor = JSON.stringify([{ name: 'tests', command: 'npm', args: ['test'] }]);
  await open(host);
  goPage(host, 'Verification');
  press(host, '\r');
  assert.match(text(host), /▸ Verification commands/);
  await tick();
  const editor = host.state.calls.find(call => call[0] === 'editor');
  assert.ok(editor, 'the editor ran outside the overlay');
  assert.deepEqual(JSON.parse(editor[2]), [], 'prefilled with the configured commands');
  assert.ok(host.state.calls.some(call => call[0] === 'confirm' && call[1] === 'Authorize verification commands'), 'the existing authorization confirm still runs: ' + host.state.calls.map(call => String(call[0])).join(','));
  assert.equal(host.state.views, 2, 'the screen reopened after the dialog');
  assert.equal(host.state.applied.length, 1);
  assert.equal(host.state.applied[0][0].verification.commands.length, 1);
  assert.match(text(host), /✔ Saved — Verification commands: 1 configured/);
  assert.equal(currentPage(host), 'Verification', 'back on the same page');
  assert.match(text(host), /▸ Verification commands/, 'and on the same row');
  press(host, 'q');
  await host.state.run;
});

test('a declined verification confirm keeps the old commands and still reopens', async () => {
  const host = screenHost();
  host.state.editor = JSON.stringify([{ name: 'tests', command: 'npm', args: ['test'] }]);
  host.state.confirm = false;
  await open(host);
  goPage(host, 'Verification');
  press(host, '\r');
  await tick();
  assert.equal(host.state.applied.length, 0);
  assert.match(text(host), /Verification commands left unchanged\./);
  press(host, 'q');
  await host.state.run;
});

test('a save on a scope with a pending migration runs outside the overlay and reopens with its result', async () => {
  const host = screenHost();
  await open(host, { options: { migrationPending: () => true } });
  press(host, 'j', ' '); // Thinking effort: the quick change
  await tick();
  assert.equal(host.state.views, 2, 'the view was resolved and reopened');
  assert.equal(host.state.applied.length, 1);
  assert.equal(host.state.applied[0][0].workers[0].effort, 'high');
  assert.match(text(host), /✔ Saved — Thinking effort: high/);
  press(host, 'q');
  await host.state.run;
});

test('the render never exceeds the rows Pi allows, and keeps the selected row, the keys and the border', async () => {
  for (const rows of [20, 10]) {
    const host = screenHost({ rows });
    await open(host, { start: base({ supervision: { mode: 'every-step' } }) });
    const limit = overlayRows(rows);
    const seen = [];
    for (const key of ['j', 'j', 'j', 'j', 'j', '\t', 'j', 'j', 'j', '\t', 'j', '\t', 'j', 'j', 'j']) {
      press(host, key);
      const lines = host.state.component.render(100);
      const shown = strip(lines.join('\n'));
      seen.push(shown);
      assert.ok(lines.length <= limit, `rows ${rows}: ${lines.length} lines is more than ${limit}`);
      assert.ok(strip(lines.at(-1)).startsWith('╰'), `rows ${rows}: the bottom border survives`);
      assert.match(shown, /esc|close/, `rows ${rows}: the keys survive`);
      assert.match(shown, /▸/, `rows ${rows}: the selected row survives`);
    }
    press(host, 'q');
    await host.state.run;
  }
});

test('the box keeps one height while the pages have different numbers of rows', async () => {
  const host = screenHost({ rows: 40 });
  await open(host);
  const heights = new Set();
  for (const key of ['j', 'j', 'j', 'k', '\t', '\t', '\t']) { press(host, key); heights.add(host.state.component.render(100).length); }
  assert.equal(heights.size, 1, 'every page and row renders the same number of lines: ' + [...heights].join(','));
  press(host, 'q');
  await host.state.run;
});

test('Esc, Kitty Esc and q close the screen, while q typed into an input does not', async () => {
  for (const key of ['\u001b', '\u001b[27u', 'q']) {
    const host = screenHost();
    await open(host);
    press(host, key);
    await host.state.run;
    assert.equal(host.state.applied.length, 0, `${JSON.stringify(key)} changes nothing`);
  }
  const host = screenHost();
  await open(host);
  commitRow(host, 3); // Workspace, an inline Input
  press(host, 'q', 'u', 'i', 'e', 't', ' ');
  assert.match(text(host), /quiet/, 'printable keys reach the input, q included');
  press(host, '\u001b');
  await tick();
  assert.equal(host.state.applied.length, 0, 'the first Esc only cancels the input');
  press(host, '\u001b');
  await host.state.run;
  assert.equal(host.state.applied.length, 0, 'q did not close the screen from the input');
});

test('outside the TUI the select-based settings flow still runs', async () => {
  const host = screenHost();
  host.ctx.mode = 'rpc';
  await settingsScreen(host.ctx, base(), 'project', async next => next, {});
  assert.equal(host.state.views, 0, 'no custom view outside the TUI');
  assert.ok(host.state.calls.some(call => call[0] === 'select'), 'the menu() fallback ran');
});

test('the worker page can make a worker the default, move it up and remove it', async () => {
  const host = screenHost();
  const start = base({ workers: [{ id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false },
    { id: 'second', provider: 'beta', model: 'two', effort: 'high', cwd: null, readOnly: false }] });
  await open(host, { start });
  // The Workers page opens on the roster: one row per worker, the default starred, then the editing selector.
  assert.match(text(host), /★ worker +alpha\/one · medium/);
  assert.match(text(host), /· second +beta\/two · high/);
  assert.match(text(host), /Make default +already first/);
  assert.match(text(host), /Move up +at the top/);
  assert.match(text(host), /Remove +this worker/);
  // Switch to the second worker through the selector, then default it: the list order changes and is saved once.
  press(host, 'k', ENTER); await tick(); // up from Model onto Editing, open its list
  press(host, 'j', ENTER); await tick(); // choose the second worker
  assert.match(text(host), /Editing +second/);
  // Choosing a slot leaves the page on Model; below it are effort, read-only and workspace, then Make default.
  commitRow(host, 4); await tick();
  assert.equal(host.state.applied.length, 1, 'defaulting a worker saves once');
  assert.deepEqual(host.state.applied[0][0].workers.map(worker => worker.id), ['second', 'worker']);
  assert.match(text(host), /✔ Saved — Worker: second \(default\)/);
});

test('remove closes the screen and asks the host, which owns the conversation choice', async () => {
  const host = screenHost();
  const start = base({ workers: [{ id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false },
    { id: 'second', provider: 'beta', model: 'two', effort: 'high', cwd: null, readOnly: false }] });
  const asked = [];
  await open(host, { start, options: { removeWorker: async id => { asked.push(id); return { ...start, workers: start.workers.filter(worker => worker.id !== id) }; } } });
  // From Model: effort, read-only, workspace, default, move up, move down, duplicate, then Remove.
  commitRow(host, 8); await tick();
  assert.deepEqual(asked, ['worker'], 'the screen asks the host to remove the worker it shows');
  // The screen reopened on the next worker with the outcome in its status line.
  assert.match(text(host), /Removed worker worker|Worker +second/);
  press(host, 'q'); await tick();
});

test('the last worker cannot be removed from the screen', async () => {
  const host = screenHost();
  const asked = [];
  await open(host, { options: { removeWorker: async id => { asked.push(id); return null; } } });
  // With one worker the page has no Editing row either: Remove is eight rows below Model
  // (effort, read-only, workspace, default, move up, move down, duplicate, remove).
  for (let index = 0; index < 8; index++) press(host, 'j');
  press(host, '\r'); await tick();
  assert.deepEqual(asked, [], 'nothing was asked: there is no second worker to fall back on');
  assert.match(text(host), /at least one worker/);
});

test('the worker slot row switches which worker the page edits, without saving', async () => {
  const host = screenHost();
  const start = base({ workers: [{ id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false },
    { id: 'second', provider: 'beta', model: 'two', effort: 'high', cwd: null, readOnly: false }] });
  await open(host, { start });
  assert.match(text(host), /Editing +worker/);
  press(host, 'k', '\r'); // up from Model onto the Editing row, then open its list
  assert.match(text(host), /▸ ✓ worker/, 'the list marks the slot being edited');
  press(host, '\u001b');
  await tick();
  assert.match(text(host), /Editing +worker/, 'Esc leaves the list without switching');
  press(host, '\r', 'j', '\r');
  await tick();
  assert.equal(host.state.applied.length, 0, 'choosing a worker slot saves nothing');
  assert.match(text(host), /Editing +second/);
  assert.match(text(host), /▸ Model +beta\/two/, 'the page now edits the chosen slot');
  press(host, 'q');
  await host.state.run;
});

test('the model picker types every printable key, j and k included, into its filter', async () => {
  const host = screenHost();
  await open(host);
  press(host, '\r'); // Model row -> picker
  for (const glyph of 'kimi') press(host, glyph);
  assert.match(text(host), /kimi/, 'typing kimi keeps every letter');
  assert.match(text(host), /▸ moonshot\/kimi-k2/, 'and the matching model is the only offer');
  assert.doesNotMatch(text(host), /▸ alpha\/one/);
  // A fresh filter still works after the selection moves on.
  for (let index = 0; index < 4; index++) press(host, '\u007f');
  for (const glyph of 'deepseek') press(host, glyph);
  assert.match(text(host), /deepseek/, 'typing deepseek keeps every letter');
  assert.match(text(host), /▸ opendesign\/deepseek-v4\.1-flash/, 'and matches the deepseek model');
  press(host, '\u001b');
  await quit(host);
});

test('the picker describes the highlighted model, not the worker\'s current one', async () => {
  const host = screenHost();
  await open(host);
  press(host, '\r'); // open the picker; the worker's own model (deepseek) is highlighted first
  for (const glyph of 'kimi') press(host, glyph); // filter down to another model
  const shown = text(host);
  assert.match(shown, /moonshot\/kimi-k2 — Kimi K2\./, 'the highlighted model is named: ' + lineOf(host, /Thinking effort/));
  assert.match(shown, /Thinking effort: off, minimal, low, medium, high\./, 'with that model\'s own effort levels');
  assert.doesNotMatch(shown, /opendesign\/deepseek-v4\.1-flash — /, 'the worker\'s current model is not described instead');
  press(host, '\u001b');
  await quit(host);
});

test('an option list and the picker carry a heading that says what is being chosen', async () => {
  const host = screenHost();
  await open(host);
  press(host, 'j', '\r'); // Thinking effort
  assert.match(text(host), /│ Thinking effort {2,}│/, 'the list is headed with the row label');
  press(host, '\u001b');
  assert.doesNotMatch(text(host), /│ Thinking effort {2,}│/, 'the heading goes away with the list');
  press(host, 'k', '\r');
  assert.match(text(host), /│ Model · type to filter/, 'the picker is headed too');
  press(host, '\u001b');
  await quit(host);
});

test('an Input opened later still receives the focus Pi granted the overlay', async () => {
  const host = screenHost();
  await open(host);
  assert.equal(host.state.component.focused, false, 'nothing is focused in list mode');
  host.state.component.focused = true;
  assert.equal(host.state.component.focused, true, 'the view remembers it');
  press(host, 'j', 'j', 'j', '\r'); // Workspace
  assert.match(text(host), /\u001b_pi:c\u0007/, 'the open Input emits the hardware-cursor marker');
  press(host, '\u001b');
  await quit(host);
});

test('the migrate row appears only for a scope with a pending migration, marked pending', async () => {
  /** @type {'project' | null} */ let pending = null;
  const host = screenHost();
  host.state.options = { migrate: async scope => { pending = null; return undefined; }, migrationPending: scope => pending === scope };
  await open(host);
  goPage(host, 'General');
  assert.doesNotMatch(text(host), /Review or migrate this scope/, 'no pending migration: the row is not there');
  pending = 'project';
  for (let index = 0; index < PAGE_ORDER.length; index++) press(host, '\t'); // all the way round, back to General
  assert.match(text(host), /Review or migrate this scope…/, 'a pending migration offers the row');
  assert.match(lineOf(host, /Review or migrate/), /pending/, 'and says it is pending');
  press(host, '\u001b');
  await quit(host);
});

test('the migration outcome comes from the pending flag, even when every value stays the same', async () => {
  /** @type {'project' | null} */ let pending = 'project';
  const host = screenHost();
  host.state.options = { migrate: async () => { pending = null; return undefined; }, migrationPending: scope => pending === scope };
  await open(host);
  goPage(host, 'General');
  // Walk to the migrate row by id: the page gains rows as the screen grows.
  while (host.state.component.view.currentRow().id !== 'migrate') press(host, 'j');
  press(host, '\r');
  await tick();
  assert.equal(host.state.views, 2, 'the migration ran outside the overlay');
  assert.match(text(host), /✔ Migration applied — this project's settings/, 'reported as applied although nothing in the config changed');
  assert.doesNotMatch(text(host), /Migration not applied/);
  // A migration that stays pending reports that it was not applied.
  const second = screenHost();
  second.state.options = { migrate: async () => undefined, migrationPending: () => true };
  await open(second);
  goPage(second, 'General');
  while (second.state.component.view.currentRow().id !== 'migrate') press(second, 'j');
  press(second, '\r');
  await tick();
  assert.match(text(second), /Migration not applied\./);
  press(second, '\u001b');
  await quit(second);
  press(host, '\u001b');
  await quit(host);
});

test('a scope switch that fails says it could not switch, not that something was not saved', async () => {
  const host = screenHost();
  host.state.options = { loadScope: async () => { throw new Error('Trust this project first'); } };
  await open(host);
  goPage(host, 'General');
  press(host, 'j', 'j', 'j', 'j', '\r'); // Save to -> option list
  press(host, 'j', '\r'); // choose global, which fails to load
  await tick();
  assert.match(text(host), /✖ Could not switch to global settings: Trust this project first/);
  assert.doesNotMatch(text(host), /Not saved/);
  assert.equal(host.state.applied.length, 0, 'a failed switch saves nothing');
  await quit(host);
});
test('the list heading and the page height still hold on a short terminal', async () => {
  const host = screenHost({ rows: 12 });
  await open(host);
  press(host, 'j', '\r');
  const lines = host.state.component.render(100);
  assert.ok(lines.length <= 9, `rows 12 allow 9 lines, got ${lines.length}`);
  assert.match(strip(lines.join('\n')), /│ Thinking effort {2,}│/, 'the heading survives the shrink');
  assert.match(strip(lines.join('\n')), /enter choose/, 'so do the keys');
  press(host, '\u001b');
  await quit(host);
});

test('the status line says when a save had to merge into a file that changed', async () => {
  const host = screenHost();
  // The host reports that the file changed after this screen loaded.
  await open(host, { options: { merged: () => true } });
  press(host, 'j', ' '); // Thinking effort, quick change
  await tick();
  assert.equal(host.state.applied.length, 1);
  // At 100 columns the line truncates, so match the beginning; the 60-column fit is checked elsewhere.
  assert.match(text(host), /✔ Saved — Thinking effort: .*\. The file changed outside this screen/);
  press(host, 'q');
  await host.state.run;
});

test('an ordinary save says nothing about merging', async () => {
  const host = screenHost();
  await open(host, { options: { merged: () => false } });
  press(host, 'j', ' ');
  await tick();
  assert.doesNotMatch(text(host), /merged/);
  press(host, 'q');
  await host.state.run;
});

test('every leaf field of DEFAULTS except version has a row somewhere in the screen', async () => {
  // The screen's own page model is the only source, so a field added to DEFAULTS without a row fails this test.
  const host = screenHost();
  // Two workers, so the page shows every row it can: the Editing selector only exists with a choice to make.
  await open(host, { start: base({ workers: [
    { id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false },
    { id: 'second', provider: 'beta', model: 'two', effort: 'high', cwd: null, readOnly: false }] }) });
  /** @type {Set<string>} */ const rowIds = new Set();
  for (const label of PAGE_ORDER) {
    goPage(host, label);
    for (const row of host.state.component.view.rowsFor(host.state.component.view.session.page)) rowIds.add(row.id);
  }
  // Field names that differ from the row that edits them (the screen says model once for provider and model).
  /** @type {Record<string, string>} */
  const renamed = { 'limits.activeStepTimeoutMs': 'stepTimeoutLimit', 'verification.timeoutMs': 'verificationTimeout',
    'peerReview.enabled': 'peerEnabled', 'peerReview.provider': 'peerModel', 'peerReview.model': 'peerModel', 'peerReview.on': 'peerOn',
    'peerReview.timeoutMs': 'peerTimeout', 'runtime.backend': 'runtimeBackend', 'supervision.maxStepFiles': 'stepFiles',
    'supervision.maxRevisions': 'revisions', 'control.maxAutoRecoveriesPerStep': 'maxAutoRecoveries',
    'mainReadOnlyDuringTasks': 'mainReadOnly', 'workers': 'slot:worker',
    'supervision.mode': 'policy', 'supervision.summaryDetail': 'detail', 'supervision.maxRevisionsPerStep': 'revisionsPerStep',
    'verification.commands': 'verification', 'autoDeliverReports': 'autoDeliver', 'attentionCue': 'cue' };
  /** @type {string[]} */
  const missing = [];
  /** @param {string} field @param {unknown} value */
  const walk = (field, value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      if (field === 'version') return;
      const id = renamed[field] ?? field.split('.').at(-1);
      if (!rowIds.has(id)) missing.push(field);
      return;
    }
    for (const [key, inner] of Object.entries(value)) walk(field ? `${field}.${key}` : key, inner);
  };
  walk('', DEFAULTS);
  assert.deepEqual(missing, [], `these DEFAULTS fields have no row: ${missing.join(', ')}`);
  await quit(host);
});
test('a nullable row stores a number, and blank means none', async () => {
  const host = screenHost();
  await open(host);
  goPage(host, 'Limits');
  press(host, 'j', 'j', 'j', 'j', '\r'); // Cost limit: four rows below the step time limit
  assert.match(text(host), /enter save/, 'it opens an input');
  press(host, '1', '2', '\r');
  await tick();
  assert.equal(host.state.applied.length, 1);
  assert.equal(host.state.applied[0][0].limits.maxReportedCostUsd, 12);
  // The next nullable row takes a number too, opening on its stored value.
  press(host, 'j', '\r');
  assert.match(text(host), /▸ Output token limit/, 'the next row is the output token limit');
  press(host, '5', '0', '0', '\r');
  await tick();
  assert.equal(host.state.applied.length, 2);
  assert.equal(host.state.applied[1][0].limits.maxOutputTokens, 500);
  // Blank means none, which is a value: the row stores null rather than cancelling the edit.
  press(host, '\r');
  for (let index = 0; index < 3; index++) press(host, '\u007f');
  press(host, '\r');
  await tick();
  assert.equal(host.state.applied.length, 3);
  assert.equal(host.state.applied[2][0].limits.maxOutputTokens, null);
  assert.match(text(host), /Output token limit: none/);
  await quit(host);
});
test('a list row takes commas or lines and stores trimmed values', async () => {
  const host = screenHost();
  await open(host);
  goPage(host, 'Runtime');
  press(host, 'j', 'j', '\r'); // Arguments, below Backend and Program
  for (const key of ['a', ' ', 'b', ',', ' ', 'c']) press(host, key);
  press(host, '\r');
  await tick();
  assert.equal(host.state.applied.length, 1);
  assert.deepEqual(host.state.applied[0][0].runtime.commandArgs, ['a b', 'c']);
  assert.match(text(host), /Arguments +a b, c/);
  await quit(host);
});
test('a restart-bound row says so and stages the save while a task runs', async () => {
  const host = screenHost();
  await open(host, { options: { taskRunning: () => true } });
  goPage(host, 'Runtime');
  assert.match(text(host), /Restart-bound: applies at the next worker restart/, 'the hint says it needs a restart');
  // Backend, Program: the Program row is the first text field, and it opens on the stored value.
  press(host, 'j', '\r');
  for (let index = 0; index < 2; index++) press(host, '\u007f');
  press(host, 'p', 'i', 'x', '\r');
  await tick();
  assert.equal(host.state.applied.length, 1);
  assert.equal(host.state.applied[0][0].runtime.command, 'pix', 'the program is stored as typed');
  // The status line is long, so read it at a width where it is not clipped.
  assert.match(text(host, 160), /A task is running, so the change is staged and applies at the next worker restart/);
  await quit(host);
});
test('the tab bar fits 60 columns, keeps the active page on it and cuts between tabs, not through one', async () => {
  const host = screenHost();
  await open(host);
  for (const label of PAGE_ORDER) {
    goPage(host, label);
    for (const width of [40, 60, 100]) {
      const bar = strip(host.state.component.render(width)[1]);
      assert.ok(visibleWidth(bar) <= width, `${label} at ${width}: the bar is ${visibleWidth(bar)} wide`);
      assert.equal(currentPageAt(host, width), label, `${label} at ${width}: the active page is on the bar (${bar})`);
    }
    assert.doesNotMatch(strip(host.state.component.render(60)[1]).trimEnd(), /…\s*│$/, `${label}: the bar ends on a whole tab`);
  }
  await quit(host);
});
/** The bracketed tab in a render at a given width. @param {ReturnType<typeof screenHost>} host @param {number} width @returns {string} */
function currentPageAt(host, width) {
  const match = /\[ ([^\]]+) \]/.exec(strip(host.state.component.render(width)[1]));
  return match ? match[1] : '';
}
test('the Workers page lists every worker with its model and effort, the default marked', async () => {
  const host = screenHost();
  const start = base({ workers: [
    { id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false },
    { id: 'second', provider: 'beta', model: 'two', effort: 'high', cwd: null, readOnly: false },
    { id: 'third', provider: '', model: '', effort: 'low', cwd: null, readOnly: false }] });
  await open(host, { start });
  assert.match(text(host), /★ worker +alpha\/one · medium/, 'the default is starred and shows its model');
  assert.match(text(host), /· second +beta\/two · high/);
  assert.match(text(host), /· third +no model yet · low/, 'a worker without a model says so');
  const rows = host.state.component.view.rowsFor('workers');
  assert.deepEqual(rows.filter(row => row.kind === 'note').map(row => row.id), ['slot:worker', 'slot:second', 'slot:third']);
  await quit(host);
});
test('a worker can be duplicated under a new id, right after the original', async () => {
  const host = screenHost();
  const start = base({ workers: [
    { id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false },
    { id: 'second', provider: 'beta', model: 'two', effort: 'high', cwd: null, readOnly: false }] });
  await open(host, { start });
  press(host, 'k', '\r', 'j', '\r'); await tick(); // Editing -> second
  // From Model: effort, read-only, workspace, default, move up, move down, duplicate — seven rows down.
  press(host, 'j', 'j', 'j', 'j', 'j', 'j', 'j', '\r');
  assert.match(text(host), /Copy this worker under a new id/, 'the copy asks for its id in place');
  assert.match(text(host), /enter save {2}esc cancel/, 'the input is open');
  for (const key of ['t', 'h', 'i', 'r', 'd']) press(host, key);
  press(host, '\r');
  await tick();
  assert.equal(host.state.applied.length, 1);
  assert.deepEqual(host.state.applied[0][0].workers.map(worker => worker.id), ['worker', 'second', 'third']);
  assert.equal(host.state.applied[0][0].workers[2].model, 'two', 'the copy carries the settings');
  assert.match(text(host), /third copied from second/);
  await quit(host);
});
test('a duplicate id is refused with the reason and saves nothing', async () => {
  const host = screenHost();
  const start = base({ workers: [
    { id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false },
    { id: 'second', provider: 'beta', model: 'two', effort: 'high', cwd: null, readOnly: false }] });
  await open(host, { start });
  press(host, 'k', '\r', 'j', '\r'); await tick();
  press(host, 'j', 'j', 'j', 'j', 'j', 'j', 'j', '\r');
  for (const key of ['w', 'o', 'r', 'k', 'e', 'r']) press(host, key);
  press(host, '\r');
  await tick();
  assert.equal(host.state.applied.length, 0);
  assert.match(text(host), /✖ Not saved: A worker named worker already exists/);
  // The input stays open with the rejected id, so Esc closes it before the screen closes.
  assert.match(text(host), /enter save/, 'the input is still open on the refused id');
  await quit(host);
});
test('move down reorders the list and says where the worker now sits', async () => {
  const host = screenHost();
  const start = base({ workers: [
    { id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false },
    { id: 'second', provider: 'beta', model: 'two', effort: 'high', cwd: null, readOnly: false }] });
  await open(host, { start });
  // From Model: effort, read-only, workspace, default, move up, move down.
  press(host, 'j', 'j', 'j', 'j', 'j', 'j', '\r');
  await tick();
  assert.equal(host.state.applied.length, 1);
  assert.deepEqual(host.state.applied[0][0].workers.map(worker => worker.id), ['second', 'worker']);
  assert.match(text(host), /Worker order: worker is now 2 of 2/);
  await quit(host);
});
test('each row shows where its value comes from, and the label is dropped before the value when narrow', async () => {
  const host = screenHost();
  // A provenance map like loadConfig's: defaults everywhere, global overrides a few, project overrides one.
  host.state.options = { provenance: () => ({ 'supervision.mode': 'project', 'supervision.maxRevisions': 'global',
    'control.watchdog': 'global', 'verification.requirePassing': 'project', enabled: 'global' }) };
  await open(host);
  const lineOf = (pattern, width = 100) => strip(host.state.component.render(width).join('\n')).split('\n').find(line => pattern.test(line)) ?? '';
  // Review: the policy came from the project, the revision limit from the global file, the rest from the defaults.
  goPage(host, 'Review');
  // The frame's border follows the tag, so match the tag at the end of the interior.
  assert.match(lineOf(/Review policy/), /project\s*│$/, 'a project value says project');
  assert.match(lineOf(/Revision limit/), /global\s*│$/, 'a global value says global');
  // A row the map says nothing about has no provenance to show: absence is the honest answer, not "default".
  assert.doesNotMatch(lineOf(/Report detail/), /default|global|project/, 'an unmapped row carries no tag');
  goPage(host, 'General');
  assert.match(lineOf(/Pair enabled/), /global\s*│$/, 'the general page carries provenance too');
  // At 60 columns the tag is dropped so the value keeps its room, and every line still fits.
  goPage(host, 'Review');
  const narrow = strip(host.state.component.render(60).join('\n'));
  assert.doesNotMatch(narrow.split('\n').find(line => /Review policy/.test(line)) ?? '', /project/, 'no provenance tag at 60 columns');
  for (const line of host.state.component.render(60)) assert.ok(visibleWidth(strip(line)) <= 60, 'every line fits: ' + strip(line));
  await quit(host);
});
test('r resets a row the current scope sets, falling back to the global scope', async () => {
  const host = screenHost();
  // The project layer sets the review policy; resetting it leaves the value the global layer sets.
  const layers = { project: { version: 2, supervision: { mode: 'every-step' } }, global: { version: 2, supervision: { mode: 'final-only' } } };
  /** @type {Record<string, string>} */
  let provenance = { 'supervision.mode': 'project', 'supervision.maxRevisions': 'global' };
  const saved = [];
  host.state.options = {
    // The host reloads provenance after a save: model that here so the status line is checked against the truth.
    provenance: () => provenance,
    readLayer: async scope => structuredClone(layers[scope]),
    saveLayer: async (layer, scope) => {
      saved.push([scope, structuredClone(layer)]);
      provenance = { 'supervision.mode': 'global', 'supervision.maxRevisions': 'global' };
      return base({ supervision: { mode: 'final-only' } });
    }
  };
  await open(host);
  goPage(host, 'Review');
  while (host.state.component.view.currentRow().id !== 'policy') press(host, 'j');
  assert.match(lineOf(host, /Review policy/), /project\s*│$/, 'the project sets it before the reset');
  press(host, 'r'); await tick();
  assert.equal(saved.length, 1, 'the reset saved once: ' + JSON.stringify(host.state.component.view.session.status));
  assert.equal(saved[0][0], 'project', 'into the scope being edited');
  assert.equal(saved[0][1].supervision, undefined, 'the field — and the section it emptied — is gone from the layer');
  assert.match(text(host), /✔ Reset — Review policy now comes from the global scope\./);
  assert.match(lineOf(host, /Review policy/), /global\s*│$/, 'and the row says so afterwards');
  await quit(host);
});
test('resetting a global field falls back to the project scope, or to the default when it sets nothing', async () => {
  // The screen edits one scope at a time, so the same reset has to name the other direction of fallback.
  for (const [project, expected] of /** @type {[Record<string, unknown>, RegExp][]} */ ([
    [{ supervision: { mode: 'every-step' } }, /now comes from the project scope/],
    // With no provenance for the field the screen cannot claim which of the two answers it is, and says so rather
    // than guessing: the value is no longer in this scope's layer either way.
    [{}, /removed from global settings; it falls back\./]
  ])) {
    const host = screenHost();
    /** @type {Record<string, string>} */
    let provenance = { 'supervision.mode': 'global' };
    host.state.options = {
      provenance: () => provenance,
      readLayer: async scope => ({ version: 2, ...(scope === 'global' ? { supervision: { mode: 'final-only' } } : structuredClone(project)) }),
      saveLayer: async () => {
        provenance = 'supervision' in project ? { 'supervision.mode': 'project' } : {};
        return base();
      }
    };
    await open(host, { scope: 'global' });
    goPage(host, 'Review');
    while (host.state.component.view.currentRow().id !== 'policy') press(host, 'j');
    press(host, 'r'); await tick();
    assert.match(text(host), expected, 'a ' + JSON.stringify(project) + ' project: ' + text(host).split('\n').find(line => /Reset/.test(line)));
    await quit(host);
  }
});
test('r on a row this scope does not set changes nothing and says so', async () => {
  const host = screenHost();
  let saves = 0;
  host.state.options = {
    provenance: () => ({ 'supervision.maxRevisions': 'global' }),
    readLayer: async () => ({ version: 2 }),
    saveLayer: async () => { saves++; return base(); }
  };
  await open(host);
  goPage(host, 'Review');
  press(host, 'j', 'j', 'r'); await tick(); // Revision limit, set by the global scope
  assert.equal(saves, 0, 'nothing was written');
  assert.match(text(host), /Revision limit already comes from the global scope; this project's settings does not set it\./);
  await quit(host);
});
test('r on a row that is not a setting says there is nothing to reset', async () => {
  const host = screenHost();
  let saves = 0;
  host.state.options = { provenance: () => ({}), readLayer: async () => ({ version: 2 }), saveLayer: async () => { saves++; return base(); } };
  await open(host);
  // Make default is an action row, not a config field.
  while (host.state.component.view.currentRow().id !== 'default') press(host, 'j');
  press(host, 'r'); await tick();
  assert.equal(saves, 0);
  assert.match(text(host), /Make default is not a saved setting, so there is nothing to reset\./);
  await quit(host);
});
test('/ filters rows from every page, names their page, and Enter jumps to the row', async () => {
  const host = screenHost();
  await open(host);
  press(host, '/');
  assert.match(text(host), /Filter · every page/, 'the filter has a heading');
  assert.match(text(host), /Type to search every page by name or key/, 'an empty filter says what to type');
  for (const key of ['t', 'i', 'm', 'e', 'o', 'u', 't']) press(host, key);
  assert.match(text(host), /Step time limit +Supervision/, 'a match names its page');
  assert.match(text(host), /Command time limit +Verification/, 'matches come from other pages too');
  // The list scrolls under the input: the rest of the matches are reachable, and each names its own page.
  const all = host.state.component.view.filterState.matches.map(({ page, row }) => `${row.label}|${page}`);
  assert.ok(all.includes('Tool time limit|supervision'), 'Tool time limit is a match: ' + all.join(', '));
  press(host, '\r'); await tick();
  // Landing on the chosen row puts the screen on that row's own page.
  assert.equal(currentPage(host), 'Supervision', 'the screen moved to the page the match lives on');
  assert.match(text(host), /▸ Step time limit/, 'and the row is selected');
  await quit(host);
});
test('/ Esc clears the filter without moving, and a miss says so', async () => {
  const host = screenHost();
  await open(host);
  press(host, '/');
  for (const key of ['z', 'z', 'z']) press(host, key);
  assert.match(text(host), /No setting matches\./);
  press(host, '\u001b'); await tick();
  assert.match(text(host), /\[ Workers \]/, 'Esc returns to where the filter started');
  assert.doesNotMatch(text(host), /Filter · every page/);
  await quit(host);
});
test('the filter matches a key path as well as a label', async () => {
  const host = screenHost();
  await open(host);
  press(host, '/');
  for (const key of ['c', 'o', 'n', 't', 'r', 'o', 'l', '.']) press(host, key);
  assert.match(text(host), /Silence before a ping +Supervision/, 'a dotted key path finds its row');
  await quit(host);
});
test('Edit as JSON opens the scope layer, validates it, and saves through the host', async () => {
  const host = screenHost();
  const layer = { version: 2, supervision: { mode: 'every-step' } };
  const saved = [];
  host.ctx.ui.editor = async (title, prefill) => { host.state.calls.push(['editor', title, prefill]); return host.state.editor; };
  host.state.options = {
    readLayer: async () => structuredClone(layer),
    saveLayer: async (next, scope) => { saved.push([scope, structuredClone(next)]); return base({ supervision: { mode: 'milestones' } }); }
  };
  host.state.editor = JSON.stringify({ version: 2, supervision: { mode: 'milestones', maxRevisions: 5 } });
  await open(host);
  goPage(host, 'General');
  while (host.state.component.view.currentRow().id !== 'json') press(host, 'j');
  press(host, '\r'); await tick();
  const editor = host.state.calls.find(call => call[0] === 'editor');
  assert.ok(editor, 'the host editor ran outside the overlay');
  assert.deepEqual(JSON.parse(editor[2]), layer, 'prefilled with this scope layer, not the effective config');
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0][1], { version: 2, supervision: { mode: 'milestones', maxRevisions: 5 } }, 'the validated layer is what was saved');
  assert.match(text(host), /✔ Saved — the this project's settings file as JSON/);
  await quit(host);
});
test('Edit as JSON refuses an invalid layer, keeps the file unchanged and offers the error', async () => {
  const host = screenHost();
  let saves = 0;
  host.ctx.ui.editor = async () => host.state.editor;
  // Declining the offer to edit again ends the attempt with the error still on screen.
  host.ctx.ui.confirm = async (...args) => { host.state.calls.push(['confirm', ...args]); return false; };
  host.state.options = { readLayer: async () => ({ version: 2 }), saveLayer: async () => { saves++; return base(); } };
  // maxRevisions out of range: validateConfigLayer rejects it, so nothing may be written.
  host.state.editor = JSON.stringify({ version: 2, supervision: { maxRevisions: 999 } });
  await open(host);
  goPage(host, 'General');
  while (host.state.component.view.currentRow().id !== 'json') press(host, 'j');
  press(host, '\r'); await tick();
  assert.equal(saves, 0, 'an invalid layer is never saved');
  assert.match(text(host), /✖ Not saved: maxRevisions must be/);
  assert.ok(host.state.calls.some(call => call[0] === 'notify' && /not saved/i.test(String(call[1]))), 'and in a notification: ' + JSON.stringify(host.state.calls));
  assert.ok(host.state.calls.some(call => call[0] === 'confirm' && /not saved/i.test(String(call[1])) && /Edit it again\?/.test(String(call[2]))), 'and answered by that offer: ' + JSON.stringify(host.state.calls));
  // Malformed JSON is refused the same way.
  const second = screenHost();
  let secondSaves = 0;
  second.ctx.ui.confirm = async () => false;
  second.ctx.ui.editor = async () => '{ not json';
  second.state.options = { readLayer: async () => ({ version: 2 }), saveLayer: async () => { secondSaves++; return base(); } };
  await open(second);
  goPage(second, 'General');
  while (second.state.component.view.currentRow().id !== 'json') press(second, 'j');
  press(second, '\r'); await tick();
  assert.equal(secondSaves, 0, 'malformed JSON is never saved');
  assert.match(second ? text(second) : '', /✖ Not saved:/);
  await quit(host); await quit(second);
});
test('a refused JSON edit can be corrected in a second attempt, and only then is it saved', async () => {
  const host = screenHost();
  const offers = [];
  const saves = [];
  // Accept the offer once, then decline it, so the loop is bounded.
  host.ctx.ui.confirm = async (title, message) => { offers.push([title, message]); return offers.length === 1; };
  host.state.options = { readLayer: async () => ({ version: 2 }), saveLayer: async layer => { saves.push(structuredClone(layer)); return base({ supervision: { maxRevisions: 6 } }); } };
  const invalid = JSON.stringify({ version: 2, supervision: { maxRevisions: 999 } });
  const valid = JSON.stringify({ version: 2, supervision: { maxRevisions: 6 } });
  /** @type {string[]} */
  const prefills = [];
  host.ctx.ui.editor = async (_title, prefill) => { prefills.push(prefill); return prefills.length === 1 ? invalid : valid; };
  await open(host);
  goPage(host, 'General');
  while (host.state.component.view.currentRow().id !== 'json') press(host, 'j');
  press(host, '\r'); await tick();
  assert.equal(offers.length, 1, 'one offer after the invalid attempt');
  assert.equal(saves.length, 1, 'and exactly one save, of the corrected layer');
  assert.equal(saves[0].supervision.maxRevisions, 6, 'the corrected value is what was written');
  assert.equal(prefills.length, 2, 'the editor was opened twice');
  assert.equal(prefills[1], invalid, 'the second attempt reopens on what was typed, not a fresh copy of the file');
  assert.match(text(host), /✔ Saved/);
  await quit(host);
});
test('cancelling Edit as JSON changes nothing', async () => {
  const host = screenHost();
  let saves = 0;
  host.ctx.ui.editor = async () => undefined;
  host.state.options = { readLayer: async () => ({ version: 2 }), saveLayer: async () => { saves++; return base(); } };
  await open(host);
  goPage(host, 'General');
  while (host.state.component.view.currentRow().id !== 'json') press(host, 'j');
  press(host, '\r'); await tick();
  assert.equal(saves, 0);
  assert.match(text(host), /JSON editing cancelled; the file is unchanged\./);
  await quit(host);
});

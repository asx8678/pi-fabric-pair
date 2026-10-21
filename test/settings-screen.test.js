import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleWidth } from '@earendil-works/pi-tui';
import { settingsScreen } from '../src/settings-screen.js';
import { validateConfig } from '../src/config.js';
import { overlayRows } from '../src/ui.js';

/** No theme, no keybindings: the screen must read without either, like the tests and a bare terminal. */
const MODELS = [{ provider: 'alpha', id: 'one', reasoning: true }, { provider: 'beta', id: 'two', reasoning: true },
  { provider: 'moonshot', id: 'kimi-k2', name: 'Kimi K2', reasoning: true },
  { provider: 'opendesign', id: 'deepseek-v4.1-flash', name: 'DeepSeek Flash', reasoning: true }];
const strip = string => string.replace(/\u001b\[[0-9;]*m/g, '');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

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

/** Opens the review page and lands on a row of it. */
const reviewRow = (host, count) => { press(host, '\t'); commitRow(host, count); };

/** Opens the general page and lands on a row of it. */
const generalRow = (host, count) => { press(host, '\t', '\t', '\t'); commitRow(host, count); };
/** The first rendered line matching a pattern (a whole test may otherwise be one string). */
const lineOf = (host, /** @type {RegExp} */ pattern, width = 100) => text(host, width).split('\n').find(line => pattern.test(line)) ?? '';
/** Close the screen and wait for settingsScreen to settle. */
const quit = (host, /** @type {string[]} */ keys = ['q']) => { press(host, ...keys); return host.state.run; };

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
  assert.match(page(), /\[ Worker \] · Review · Display · General/, 'the active page is bracketed, not only coloured');
  press(host, '\t');
  assert.match(page(), /Worker · \[ Review \] · Display · General/);
  press(host, '\t', '\t');
  assert.match(page(), /Worker · Review · Display · \[ General \]/);
  press(host, '\t');
  assert.match(page(), /\[ Worker \]/, 'tab wraps from the last page to the first');
  press(host, 'h');
  assert.match(page(), /\[ General \]/, 'h wraps backwards');
  press(host, '\u001b[Z');
  assert.match(page(), /\[ Display \]/, 'shift+tab goes back');
  press(host, '\u001b[D');
  assert.match(page(), /\[ Review \]/, 'left arrow goes back');
  press(host, 'l');
  assert.match(page(), /\[ Display \]/, 'l goes forward');
  press(host, '\u001b[C');
  assert.match(page(), /\[ General \]/, 'right arrow goes forward');
  press(host, 'q');
  await host.state.run;
});

test('a toggle flips and saves on Enter and on Space, always with the scope being edited', async () => {
  for (const key of ['\r', ' ']) {
    const host = screenHost();
    await open(host);
    press(host, '\t');
    for (let index = 0; index < 4; index++) press(host, 'j'); // Deliver reports automatically is the last review row
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
  press(host, '\t');
  commitRow(host, 1); // Revision limit
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
  press(host, '\t', '\t', '\t');
  commitRow(host, 2); // Save to
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
  reviewRow(host, 3);
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
  assert.match(text(host), /\[ Review \] · Display/, 'back on the same page');
  assert.match(text(host), /▸ Verification commands/, 'and on the same row');
  press(host, 'q');
  await host.state.run;
});

test('a declined verification confirm keeps the old commands and still reopens', async () => {
  const host = screenHost();
  host.state.editor = JSON.stringify([{ name: 'tests', command: 'npm', args: ['test'] }]);
  host.state.confirm = false;
  await open(host);
  reviewRow(host, 3);
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

test('the worker slot row switches which worker the page edits, without saving', async () => {
  const host = screenHost();
  const start = base({ workers: [{ id: 'worker', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false },
    { id: 'second', provider: 'beta', model: 'two', effort: 'high', cwd: null, readOnly: false }] });
  await open(host, { start });
  assert.match(text(host), /Worker {11}worker/);
  press(host, 'k', '\r'); // up from Model onto the worker slot row, then open its list
  assert.match(text(host), /▸ ✓ worker/, 'the list marks the slot being edited');
  press(host, '\u001b');
  await tick();
  assert.match(text(host), /Worker {11}worker/, 'Esc leaves the list without switching');
  press(host, '\r', 'j', '\r');
  await tick();
  assert.equal(host.state.applied.length, 0, 'choosing a worker slot saves nothing');
  assert.match(text(host), /Worker {11}second/);
  assert.match(text(host), /▸ Model {12}beta\/two/, 'the page now edits the chosen slot');
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
  press(host, '\t', '\t', '\t');
  assert.doesNotMatch(text(host), /Review or migrate this scope/, 'no pending migration: the row is not there');
  pending = 'project';
  for (let index = 0; index < 4; index++) press(host, '\t'); // all the way round, back to General
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
  press(host, '\t', '\t', '\t', 'k', '\r'); // Save to ..., the row above migrate; then up onto migrate
  await tick();
  assert.equal(host.state.views, 2, 'the migration ran outside the overlay');
  assert.match(text(host), /✔ Migration applied — this project's settings/, 'reported as applied although nothing in the config changed');
  assert.doesNotMatch(text(host), /Migration not applied/);
  // A migration that stays pending reports that it was not applied.
  const second = screenHost();
  second.state.options = { migrate: async () => undefined, migrationPending: () => true };
  await open(second);
  press(second, '\t', '\t', '\t', 'k', '\r');
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
  press(host, '\t', '\t', '\t', 'j', 'j', '\r'); // Save to -> option list
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsUI } from '../src/ui.js';
import { DEFAULTS } from '../src/config.js';

async function run(actions, { input = [], editor, confirm = true, save, options = {}, original = DEFAULTS } = {}) {
  const menus = [], notices = [], saves = [], confirms = [];
  const ctx = { mode: 'rpc', model: { provider: 'main', id: 'native' }, isProjectTrusted: () => true,
    modelRegistry: { getAvailable: () => [] },
    ui: { select: async (title, rows) => {
      menus.push({ title, rows });
      assert.ok(actions.length, 'unexpected menu');
      const action = actions.shift();
      if (action === undefined) return undefined;
      const match = rows.find(row => row.startsWith(action));
      assert.ok(match, `missing ${action} in ${rows.join(', ')}`); return match;
    }, input: async () => input.shift(), editor: async () => editor,
    confirm: async (...args) => { confirms.push(args); return confirm; },
    notify: (message, level) => notices.push({ message, level }) }
  };
  await settingsUI(ctx, structuredClone(original), 'project', async (next, scope) => {
    if (save) await save(next, scope);
    saves.push({ next: structuredClone(next), scope });
  }, options);
  return { menus, notices, saves, confirms };
}

test('each edit autosaves before Done or Esc; common menu has nine rows and Main is context', async () => {
  for (const exit of ['Done', undefined]) {
    const result = await run(['Enabled', 'Autostart', exit]);
    assert.equal(result.saves.length, 2);
    assert.equal(result.saves[0].next.enabled, true);
    assert.equal(result.saves[1].next.autoStart, false);
    assert.equal(result.menus[0].rows.length, 9);
    assert.match(result.menus[0].title, /Main: main\/native/);
    assert.ok(!result.menus[0].rows.some(row => /Apply|Main:|Verification|Workspace/.test(row)));
    assert.match(result.menus[1].rows[0], /true/);
  }
});

test('cancel/no-op and Advanced navigation do not save', async () => {
  const result = await run(['Worker effort', undefined, 'Worker effort', 'medium', 'Advanced', 'Workspace', 'Back', 'Done']);
  assert.equal(result.saves.length, 0);
  assert.equal(result.notices.length, 0);
});

test('invalid value is discarded and later edits use last saved values', async () => {
  const result = await run(['Advanced', 'Revision limit', 'Back', 'Enabled', 'Done'], { input: ['-1'] });
  assert.equal(result.notices.length, 1);
  assert.match(result.notices[0].message, /not saved/);
  assert.equal(result.saves.length, 1);
  assert.equal(result.saves[0].next.supervision.maxRevisions, DEFAULTS.supervision.maxRevisions);
});

test('write rejection rolls back displayed draft and does not poison next edit', async () => {
  let calls = 0;
  const result = await run(['Enabled', 'Autostart', 'Done'], { save: async () => { if (++calls === 1) throw Error('disk full'); } });
  assert.match(result.menus[1].rows[0], /false/);
  assert.equal(result.saves.length, 1);
  assert.equal(result.saves[0].next.enabled, false);
  assert.match(result.notices[0].message, /not saved: disk full/);
});

test('scope switching replaces the view without saving/copying project defaults', async () => {
  const project = structuredClone(DEFAULTS); project.limits.maxReportsPerTask = 12;
  let loads = 0;
  const result = await run(['Save scope', 'global', 'Enabled', 'Done'], { original: project,
    options: { loadScope: async scope => { assert.equal(scope, 'global'); loads++; return structuredClone(DEFAULTS); } } });
  assert.equal(loads, 1); assert.equal(result.saves.length, 1);
  assert.equal(result.saves[0].scope, 'global');
  assert.equal(result.saves[0].next.limits.maxReportsPerTask, DEFAULTS.limits.maxReportsPerTask);
});

test('verification commands still require human authorization and unchanged editor is inert', async () => {
  for (const confirmed of [false, true]) {
    const result = await run(['Advanced', 'Verification commands', 'Done'], { editor: '[{"name":"test","command":"npm","args":["test"]}]', confirm: confirmed });
    assert.equal(result.confirms.length, 1); assert.equal(result.saves.length, confirmed ? 1 : 0);
  }
  const result = await run(['Advanced', 'Verification commands', 'Done'], { editor: '[]' });
  assert.equal(result.confirms.length, 0); assert.equal(result.saves.length, 0);
});

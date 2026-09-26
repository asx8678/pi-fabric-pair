import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsUI } from '../src/ui.js';
import { DEFAULTS, validateConfig } from '../src/config.js';

const fields = [
  { row: 'Revision limit', path: ['supervision', 'maxRevisions'], title: /Revision limit/, range: /integer.*0.*20/, valid: [['0', 0], ['20', 20]], invalid: ['-1', '21', '1.5'] }
];
const get = (config, field) => field.path.reduce((value, key) => value[key], config);
const set = (config, field, value) => {
  const parent = field.path.slice(0, -1).reduce((value, key) => value[key], config);
  parent[field.path.at(-1)] = value;
};
function configured() {
  const config = structuredClone(DEFAULTS);
  config.maxWorkers = 2;
  config.limits.maxReportedCostUsd = 4.5;
  return validateConfig(config);
}

async function run(actions, inputs, original = configured()) {
  const before = structuredClone(original), menus = [], prompts = [], notices = [], saves = [];
  const ctx = { mode: 'rpc', model: { provider: 'main', id: 'native' },
    ui: {
      select: async (_title, rows) => {
        menus.push(rows);
        assert.ok(actions.length, 'unexpected menu');
        const action = actions.shift();
        if (action === undefined) return undefined;
        const row = rows.find(row => row.startsWith(action));
        assert.ok(row, `missing ${action}`);
        return row;
      },
      input: async (title, placeholder) => {
        prompts.push({ title, placeholder });
        assert.ok(inputs.length, 'unexpected numeric input');
        return inputs.shift();
      },
      notify: (message, level) => notices.push({ message, level })
    }
  };
  await settingsUI(ctx, original, 'project', async (next, scope) => {
    assert.equal(scope, 'project');
    assert.deepEqual(validateConfig(next), next);
    saves.push(structuredClone(next));
  });
  assert.deepEqual(original, before, 'settings must not mutate the caller config');
  assert.equal(actions.length, 0);
  assert.equal(inputs.length, 0);
  return { menus, prompts, notices, saves };
}

for (const field of fields) {
  for (const [label, input] of [['blank', ''], ['whitespace', ' \t\n '], ['cancel', undefined]]) {
    test(`${field.row}: ${label} retains exact current value without errors or saves`, async () => {
      const original = configured();
      const result = await run(['Advanced', field.row, field.row, 'Done'], [input, undefined], original);
      assert.deepEqual(result.notices, []);
      assert.deepEqual(result.saves, []);
      assert.equal(result.prompts[0].placeholder, result.prompts[1].placeholder);
      assert.match(result.prompts[0].title, /blank keeps current/);
      assert.deepEqual(result.menus[1], result.menus[2]);
    });
  }

  for (const [input, value] of field.valid) {
    test(`${field.row}: accepts ${input} and persists only the validated edit`, async () => {
      const original = configured(), expected = structuredClone(original);
      set(expected, field, value);
      const result = await run(['Advanced', field.row, field.row, field.row, 'Done'], [input, '', undefined], original);
      assert.deepEqual(result.notices, []);
      assert.deepEqual(result.saves, [expected]);
      assert.match(result.prompts[0].title, field.title);
    });
  }

  for (const input of [...field.invalid, 'NaN', 'Infinity', '-Infinity', 'abc', 'none', 'off']) {
    test(`${field.row}: rejects ${input} with field/range and cannot poison later autosaves`, async () => {
      const original = configured();
      const result = await run(['Advanced', field.row, 'Back', 'Enabled', 'Done'], [input], original);
      assert.equal(result.notices.length, 1);
      assert.equal(result.notices[0].level, 'error');
      assert.match(result.notices[0].message, /Setting not saved:/);
      assert.match(result.notices[0].message, field.title);
      assert.match(result.notices[0].message, field.range);
      assert.doesNotMatch(result.notices[0].message, /Enter a positive number/);
      assert.deepEqual(result.menus[1], result.menus[2], 'invalid draft must be discarded');
      assert.deepEqual(result.saves, [{ ...original, enabled: true }]);
      assert.equal(get(result.saves[0], field), get(original, field));
    });
  }
}

test('all four removed limit rows are absent from Advanced settings', async () => {
  const result = await run(['Advanced', 'Done'], []);
  const advanced = result.menus[1];
  const removed = /Turn limit per step|Task timeout \(minutes\)|Reported inference budget|Preserved slot limit/;
  assert.ok(!advanced.some(row => removed.test(row)), 'removed limit settings must not be listed');
  assert.ok(advanced.some(row => row.startsWith('Revision limit')), 'revision limit remains configurable');
  assert.deepEqual(result.notices, []);
  assert.deepEqual(result.saves, []);
});

test('basic/Advanced navigation still works after row removal', async () => {
  const result = await run(['Advanced…', 'Back', 'Done'], []);
  assert.ok(result.menus[0].some(row => row.startsWith('Worker model')), 'basic menu renders');
  assert.ok(!result.menus[0].some(row => /^Revision limit/.test(row)), 'revision limit is only listed in Advanced');
  assert.ok(result.menus[1].some(row => row.startsWith('Revision limit')), 'Advanced menu renders');
  assert.ok(result.menus[2].some(row => row.startsWith('Worker model')), 'Back returns to the basic menu');
});

test('hidden budget and slot settings are retained through an unrelated autosave', async () => {
  const original = configured();
  const result = await run(['Enabled for new work', 'Done'], []);
  assert.deepEqual(result.saves, [{ ...original, enabled: true }]);
  assert.equal(result.saves[0].limits.maxReportedCostUsd, original.limits.maxReportedCostUsd);
  assert.equal(result.saves[0].maxWorkers, original.maxWorkers);
  assert.deepEqual(result.notices, []);
});

test('invalid numeric edit retains the last successful numeric autosave', async () => {
  const result = await run(['Advanced', 'Revision limit', 'Revision limit', 'Back', 'Enabled', 'Done'], ['0', '21']);
  assert.equal(result.notices.length, 1);
  assert.equal(result.saves.length, 2);
  assert.equal(result.saves[0].supervision.maxRevisions, 0);
  assert.equal(result.saves[1].supervision.maxRevisions, 0);
});

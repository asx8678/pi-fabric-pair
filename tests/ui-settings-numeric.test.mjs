import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsUI } from '../src/ui.js';
import { DEFAULTS, validateConfig } from '../src/config.js';

const fields = [
  { row: 'Revision limit', path: ['supervision', 'maxRevisions'], title: /Revision limit/, range: /integer.*0.*20/, valid: [['0', 0], ['20', 20]], invalid: ['-1', '21', '1.5'] },
  { row: 'Turn limit per step', path: ['limits', 'maxTurnsPerStep'], title: /Maximum turns per step/, range: /positive safe integer/, valid: [['1', 1], [' 17 ', 17]], invalid: ['0', '-1', '1.5', '9007199254740992'] },
  { row: 'Task timeout (minutes)', path: ['limits', 'taskTimeoutMs'], title: /Task timeout in minutes/, range: /positive.*minutes.*whole milliseconds/, valid: [['1.5', 90000], ['0.00005', 3]], invalid: ['0', '-1', '0.000001', '1e308', '150119987579.01654'] },
  { row: 'Reported inference budget (USD)', path: ['limits', 'maxReportedCostUsd'], title: /Inference-only reported USD budget/, range: /finite.*greater than 0/, valid: [['0.25', 0.25], ['1.5', 1.5]], invalid: ['0', '-1'] },
  { row: 'Preserved slot limit', path: ['maxWorkers'], title: /Preserved slot limit/, range: /integer.*1.*8/, valid: [['1', 1], ['8', 8]], invalid: ['0', '-1', '9', '1.5'] }
];
const get = (config, field) => field.path.reduce((value, key) => value[key], config);
const set = (config, field, value) => {
  const parent = field.path.slice(0, -1).reduce((value, key) => value[key], config);
  parent[field.path.at(-1)] = value;
};
function configured() {
  const config = structuredClone(DEFAULTS);
  config.maxWorkers = 2;
  config.limits.taskTimeoutMs = 59; // minutes -> milliseconds is not an exact floating-point round trip
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

  for (const input of [...field.invalid, 'NaN', 'Infinity', '-Infinity', 'abc', 'none', 'off'].filter(value => field.path.at(-1) !== 'maxReportedCostUsd' || !['none', 'off'].includes(value))) {
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

test('optional budget is cleared only by explicit none/off, including mixed case and whitespace', async () => {
  for (const input of ['none', 'off', ' NONE ', ' Off ']) {
    const original = configured();
    const result = await run(['Advanced', 'Reported inference budget', 'Reported inference budget', 'Done'], [input, ''], original);
    assert.deepEqual(result.notices, []);
    assert.equal(result.saves.length, 1);
    assert.equal(result.saves[0].limits.maxReportedCostUsd, null);
    assert.equal(result.prompts[0].placeholder, '4.5');
    assert.equal(result.prompts[1].placeholder, 'none');
    assert.match(result.prompts[0].title, /none\/off disables/);
  }
});

test('already-disabled budget stays inert for blank, whitespace, cancellation and explicit clear', async () => {
  const result = await run(['Advanced', ...Array(5).fill('Reported inference budget'), 'Done'], ['', ' \t ', undefined, 'none', 'off'], structuredClone(DEFAULTS));
  assert.deepEqual(result.saves, []);
  assert.deepEqual(result.notices, []);
});

test('unchanged placeholder input preserves exact stored timeout despite minute conversion', async () => {
  const original = configured();
  assert.notEqual(original.limits.taskTimeoutMs / 60000 * 60000, original.limits.taskTimeoutMs);
  const result = await run(['Advanced', 'Task timeout', 'Done'], [String(original.limits.taskTimeoutMs / 60000)], original);
  assert.deepEqual(result.notices, []);
  assert.deepEqual(result.saves, []);
});

test('invalid numeric edit retains the last successful numeric autosave', async () => {
  const result = await run(['Advanced', 'Revision limit', 'Revision limit', 'Back', 'Enabled', 'Done'], ['0', '21']);
  assert.equal(result.notices.length, 1);
  assert.equal(result.saves.length, 2);
  assert.equal(result.saves[0].supervision.maxRevisions, 0);
  assert.equal(result.saves[1].supervision.maxRevisions, 0);
});

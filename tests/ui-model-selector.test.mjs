import assert from 'node:assert/strict';
import test from 'node:test';
import { getKeybindings, visibleWidth } from '@earendil-works/pi-tui';
import { settingsUI } from '../src/ui.js';
import { DEFAULTS } from '../src/config.js';

const models = [
  { provider: 'zeta', id: 'shared', name: 'Friendly Writer', reasoning: false },
  { provider: 'alpha', id: 'shared', name: 'Thinking Model', reasoning: true },
];
const paste = (component, text) => component.handleInput(`\x1b[200~${text}\x1b[201~`);

async function settings({ available = models, worker = {}, interact, mode = 'tui', answer } = {}) {
  const original = structuredClone(DEFAULTS);
  Object.assign(original.workers[0], worker);
  const before = structuredClone(original);
  const main = Object.freeze({ provider: 'main', id: 'unchanged' });
  const notifications = [];
  let applied, customCalls = 0, inputCalls = 0, settingsCalls = 0, renders = 0;
  let offered;
  const ctx = {
    mode, model: main, modelRegistry: { getAvailable: () => available },
    ui: {
      input: async () => { inputCalls++; return undefined; },
      notify: (message, level) => notifications.push({ message, level }),
      select: async (title, choices) => {
        if (title.startsWith('Fabric Pair settings')) {
          return settingsCalls++ === 0 ? choices.find(row => row.startsWith('Worker model:')) : 'Apply';
        }
        offered = choices;
        return answer;
      },
      custom: async (factory) => {
        customCalls++;
        let completed = false, result;
        const component = factory(
          { requestRender: () => { renders++; } },
          { fg: (_color, text) => text, bold: text => text },
          getKeybindings(),
          value => { completed = true; result = value; },
        );
        component.focused = true;
        assert.equal(component.focused, true);
        interact(component, () => completed);
        assert.equal(completed, true, 'picker must finish on selection/cancel');
        component.invalidate();
        return result;
      },
    },
  };
  await settingsUI(ctx, original, 'global', async config => { applied = config; });
  assert.deepEqual(original, before, 'settings must only change a draft');
  assert.equal(ctx.model, main, 'worker selection must not change Main');
  assert.equal(inputCalls, 0, 'show models immediately, not a blank input-only dialog');
  assert.deepEqual(notifications.filter(n => n.level === 'error'), []);
  return { applied, notifications, customCalls, renders, offered };
}

test('models appear immediately, sorted, with keyboard navigation', async () => {
  const result = await settings({ interact(component) {
    const screen = component.render(100).join('\n');
    assert.match(screen, /alpha\/shared/);
    assert.match(screen, /zeta\/shared/);
    assert.ok(screen.indexOf('alpha/shared') < screen.indexOf('zeta/shared'));
    component.handleInput('\x1b[B');
    component.handleInput('\r');
  } });
  assert.equal(result.customCalls, 1);
  assert.equal(result.applied.workers[0].provider, 'zeta');
  assert.equal(result.applied.workers[0].effort, 'off');
});

for (const query of ['  FRIENDLY writer  ', 'ZETA/shared', 'shared']) {
  test(`live search accepts model names, provider/id and whitespace: ${query}`, async () => {
    const result = await settings({ interact(component) {
      paste(component, query);
      assert.match(component.render(100).join('\n'), /zeta\/shared/);
      component.handleInput('\r');
    } });
    assert.equal(result.applied.workers[0].provider, query === 'shared' ? 'alpha' : 'zeta');
  });
}

test('current worker is highlighted without hiding other models', async () => {
  const result = await settings({ worker: { provider: 'alpha', model: 'shared', effort: 'high' }, interact(component) {
    assert.match(component.render(100).join('\n'), /zeta\/shared/);
    component.handleInput('\r');
  } });
  assert.equal(result.applied.workers[0].provider, 'alpha');
  assert.equal(result.applied.workers[0].effort, 'high');
});

for (const key of ['\x1b', '\x03']) {
  test(`cancel ${JSON.stringify(key)} leaves the worker unchanged`, async () => {
    const worker = { provider: 'old', model: 'kept', effort: 'high' };
    const result = await settings({ worker, interact(component) { component.handleInput(key); } });
    for (const [key, value] of Object.entries(worker)) assert.equal(result.applied.workers[0][key], value);
  });
}

test('no matches is visible, Enter is inert, clearing search restores choices', async () => {
  await settings({ interact(component, completed) {
    paste(component, 'does-not-exist');
    assert.match(component.render(100).join('\n'), /No matching models/);
    component.handleInput('\r');
    assert.equal(completed(), false);
    component.handleInput('\x15');
    assert.match(component.render(100).join('\n'), /alpha\/shared/);
    component.handleInput('\r');
  } });
});

test('empty authenticated registry explains setup instead of opening a blank picker', async () => {
  const result = await settings({ available: [] });
  assert.equal(result.customCalls, 0);
  assert.match(result.notifications[0].message, /No authenticated\/available models/);
  assert.equal(result.applied.workers[0].model, '');
});

test('all models remain searchable past the former 300-model cap', async () => {
  const available = Array.from({ length: 350 }, (_, i) => ({ provider: 'provider', id: `model-${String(i).padStart(3, '0')}`, name: `Model ${i}` }));
  const result = await settings({ available, interact(component) {
    assert.ok(component.render(80).length < 20, 'large catalogs use a bounded viewport');
    paste(component, 'model-349');
    component.handleInput('\r');
  } });
  assert.equal(result.applied.workers[0].model, 'model-349');
});

test('picker respects narrow widths and resize', async () => {
  await settings({ interact(component) {
    for (const width of [24, 40, 100]) {
      for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width);
    }
    paste(component, 'no match');
    for (const line of component.render(12)) assert.ok(visibleWidth(line) <= 12);
    component.handleInput('\x1b');
  } });
});

test('RPC uses supported select immediately and retains canonical provider/id', async () => {
  const result = await settings({ mode: 'rpc', answer: 'zeta/shared' });
  assert.equal(result.customCalls, 0);
  assert.deepEqual(result.offered, ['alpha/shared', 'zeta/shared']);
  assert.equal(result.applied.workers[0].provider, 'zeta');
  assert.equal(result.applied.workers[0].model, 'shared');
});

test('RPC cancellation or an unoffered model cannot modify worker configuration', async () => {
  for (const answer of [undefined, 'unknown/model']) {
    const result = await settings({ mode: 'rpc', answer });
    assert.equal(result.applied.workers[0].model, '');
  }
});

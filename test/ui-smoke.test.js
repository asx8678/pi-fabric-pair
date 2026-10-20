import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../src/ui.js';
import { INDICATORS, isIndicator, validateConfig } from '../src/config.js';

// Proves the test harness works under node --test: src/ui.js imports @earendil-works/pi-tui and
// @earendil-works/pi-coding-agent at module load, exactly as Pi loads the extension.
test('ui.js imports the Pi harness under node --test', () => {
  assert.equal(typeof ui.symbol, 'function');
  assert.equal(ui.symbol('working'), '◉');
  assert.equal(ui.symbol('review'), '◐');
  assert.equal(ui.symbol('attention'), '!');
  assert.equal(ui.symbol('ready'), '●');
  assert.equal(ui.symbol('stopped'), '○');
});

test('pure renderers run headless', () => {
  assert.equal(ui.ageLabel(192000), '3m 12s');
  assert.equal(ui.kindLabel('final_review'), 'Final review');
  assert.deepEqual(ui.staleWorkers({ workers: [] }), []);
  const card = ui.pairMessageComponent({ content: 'FABRIC PAIR REPORT\n' + JSON.stringify({ workerId: 'w1', reportId: 'r1', kind: 'checkpoint', summary: 'Added retries.', checks: [{ name: 'typecheck', result: 'pass' }] }) }, {}, null);
  assert.ok(Array.isArray(card.render(80)));
});

test('config exposes the indicator modes the UI offers', () => {
  assert.ok(INDICATORS.includes('minimal'));
  assert.ok(INDICATORS.includes('compact'));
  assert.ok(INDICATORS.includes('off'));
  assert.equal(isIndicator('minimal'), true);
  assert.equal(isIndicator('nope'), false);
  assert.equal(validateConfig({ indicator: 'compact' }).indicator, 'compact');
});
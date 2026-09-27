import test from 'node:test';
import assert from 'node:assert/strict';
import { addUsage, normalizedUsage, selectLastMeasuredUsage } from '../src/metrics.js';

const hit = { input: 4425, cacheRead: 82048, cacheWrite: 0, output: 27, cost: { total: 0.01 } };
const zero = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: { total: 0 } };
const unusable = [undefined, null, {}, zero, { output: 12 }, { cost: { total: 1 } },
  { input: -1, cacheRead: NaN, cacheWrite: '20' }, { input: Infinity },
  { input: Number.MAX_VALUE, cacheRead: Number.MAX_VALUE }];

test('display selector preserves the last measurable sample and its timestamp through unusable events', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const measured = Object.freeze(selectLastMeasuredUsage(null, hit));
  assert.equal(measured.cacheRatio, 82048 / 86473);
  assert.equal(measured.observedAt, 1000);
  for (const usage of unusable) {
    t.mock.timers.tick(1000);
    assert.strictEqual(selectLastMeasuredUsage(measured, usage), measured);
    assert.equal(measured.observedAt, 1000);
  }
});

test('display selector cannot manufacture a known reading without measured input', () => {
  for (const previous of [undefined, null, normalizedUsage(zero)]) {
    for (const usage of unusable) assert.equal(selectLastMeasuredUsage(previous, usage), null);
  }
});

test('real zero-percent misses and cache-write-only requests replace prior hits without averaging', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const measured = selectLastMeasuredUsage(null, hit);
  t.mock.timers.tick(5000);
  const miss = selectLastMeasuredUsage(measured, { input: 66898, cacheRead: 0 });
  assert.equal(miss.cacheRatio, 0);
  assert.equal(miss.totalInput, 66898);
  assert.equal(miss.observedAt, 6000);
  assert.notStrictEqual(miss, measured);
  assert.strictEqual(selectLastMeasuredUsage(miss, zero), miss);
  const write = selectLastMeasuredUsage(measured, { cacheWrite: 20 });
  assert.equal(write.totalInput, 20);
  assert.equal(write.cacheRatio, 0);
  const cached = selectLastMeasuredUsage(miss, { cacheRead: 20 });
  assert.equal(cached.cacheRatio, 1);
  assert.equal(cached.totalInput, 20);
});

test('display filtering does not change response normalization or cumulative accounting', () => {
  const measured = normalizedUsage(hit);
  const placeholder = normalizedUsage(zero);
  assert.equal(placeholder.totalInput, 0);
  assert.equal(placeholder.cacheRatio, null);
  assert.equal(normalizedUsage(undefined), null);
  assert.strictEqual(selectLastMeasuredUsage(measured, zero), measured);
  const totals = addUsage(addUsage(null, measured), placeholder);
  assert.equal(totals.requests, 2, 'synthetic zero response remains accounted for');
  assert.equal(totals.totalInput, 86473);
  assert.equal(totals.output, 27);
  assert.equal(totals.reportedCost, 0.01);
  assert.equal(totals.cacheRatio, measured.cacheRatio);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, validateConfig, validateConfigLayer } from '../src/config.js';
import { validateTaskLimits } from '../src/contracts.js';
import { limitExceeded } from '../src/metrics.js';

const deferred = { activeStepTimeoutMs: 1800000, maxQueuedTasks: 8, maxQueuedReviews: 8, maxReportsPerTask: 40, maxReportBytes: 16384, maxAutomaticReportRepairs: 1, maxAutomaticRecoveryAttempts: 1, maxReportedCostUsd: null, maxOutputTokens: null };

test('effective defaults and config no longer carry the removed turn/duration limits', () => {
  assert.ok(!('maxTurnsPerStep' in DEFAULTS.limits) && !('taskTimeoutMs' in DEFAULTS.limits));
  const config = validateConfig({});
  assert.ok(!('maxTurnsPerStep' in config.limits) && !('taskTimeoutMs' in config.limits));
});

test('legacy config files with removed limits stay readable without enforcing them; unknown settings still error', () => {
  const legacy = validateConfig({ version: 2, limits: { maxTurnsPerStep: 5000, taskTimeoutMs: 300000000 } });
  assert.ok(!('maxTurnsPerStep' in legacy.limits) && !('taskTimeoutMs' in legacy.limits));
  assert.deepEqual(validateConfigLayer({ version: 2, limits: { maxTurnsPerStep: 55 } }), { version: 2 }, 'saves drop the deprecated keys');
  assert.throws(() => validateConfig({ version: 2, limits: { maxTurnsPerStep: 'huge' } }), /maxTurnsPerStep/);
  assert.throws(() => validateConfig({ version: 2, limits: { maxTurnsPerStepX: 1 } }), /Unknown limits setting/);
});

test('legacy task snapshots with removed limits stay valid; new snapshots omit them', () => {
  const legacy = validateTaskLimits({ maxTurnsPerStep: 5000, taskTimeoutMs: 300000000, ...deferred });
  assert.equal(legacy.maxTurnsPerStep, 5000, 'legacy values are retained in the borrowed snapshot');
  const modern = validateTaskLimits({ ...deferred });
  assert.ok(!('maxTurnsPerStep' in modern) && !('taskTimeoutMs' in modern));
});

test('removed limits never stop a task; cost and output-token budgets still do', () => {
  const hot = { turns: 999999, startedAt: Date.now() - 10 * 60 * 60 * 1000, usage: { reportedCost: 0, output: 0 } };
  assert.equal(limitExceeded(hot, { maxTurnsPerStep: 40, taskTimeoutMs: 1800000, maxReportedCostUsd: null, maxOutputTokens: null }), null, 'legacy snapshot values must not impose hidden limits');
  assert.equal(limitExceeded(hot, { maxReportedCostUsd: null, maxOutputTokens: null }), null);
  assert.equal(limitExceeded({ ...hot, usage: { reportedCost: 5, output: 0 } }, { maxReportedCostUsd: 1, maxOutputTokens: null }), 'Reported inference-cost budget reached');
  assert.equal(limitExceeded({ ...hot, usage: { reportedCost: 0, output: 9 } }, { maxReportedCostUsd: null, maxOutputTokens: 8 }), 'Output-token budget reached');
});

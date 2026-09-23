import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, validateConfig } from '../src/config.js';
import { validateDispatch, validateReport, validateDecision } from '../src/schema.js';
import { merge, parseJSONC, safeId, cleanText } from '../src/util.js';
import { addUsage, normalizedUsage, limitExceeded } from '../src/metrics.js';
import { gateTool, checkReadiness, sourcePaths } from '../src/native.js';
import { indicator, symbol } from '../src/ui.js';
import { assignment } from './helpers.js';

test('native JSONC inspection preserves URLs/escaped strings and handles trailing commas', () => {
  assert.deepEqual(parseJSONC('{"url":"https://x/y", /* x */ "quote":"a\\\"b", "items":[1,2,], // x\n}'), { url: 'https://x/y', quote: 'a"b', items: [1, 2] });
});
test('prototype pollution keys and traversal IDs are rejected', () => {
  assert.throws(() => merge({}, JSON.parse('{"__proto__":{"polluted":true}}')), /Unsafe/);
  for (const id of ['../worker', '/worker', '', 'a/b', 'a\\b']) assert.throws(() => safeId(id));
  assert.equal(safeId('worker-1'), 'worker-1');
});
test('schema validates work orders and enforces unique steps and bounded payloads', () => {
  assert.doesNotThrow(() => validateDispatch(assignment()));
  const dup = assignment(); dup.steps[1].id = dup.steps[0].id; assert.throws(() => validateDispatch(dup), /unique/);
  assert.throws(() => validateDispatch({ ...assignment(), unexpected: true }), /not allowed/);
  const huge = assignment(); huge.context = 'x'.repeat(64001); assert.throws(() => validateDispatch(huge));
});
test('question must contain an actual question; approval must bind a hash', () => {
  assert.throws(() => validateReport({ taskId: 'a', stepId: 'b', kind: 'question', summary: 'Need help' }), /question/);
  assert.throws(() => validateDecision({ workerId: 'w', taskId: 't', reportId: 'r', action: 'approve', feedback: 'fine' }), /checkpointHash/);
});
test('settings reject invalid limits, duplicate workers and unknown top-level options', () => {
  assert.throws(() => validateConfig({ maxWorkers: 0 }), /maxWorkers/);
  assert.throws(() => validateConfig({ typo: true }), /Unknown/);
  assert.throws(() => validateConfig({ workers: [DEFAULTS.workers[0], DEFAULTS.workers[0]] }), /Duplicate/);
  assert.throws(() => validateConfig({ indicator: 'always-warm' }), /indicator/);
  assert.equal(validateConfig({ indicator: 'off' }).indicator, 'off');
});
test('Pi usage normalization sums uncached input, cache reads, and cache writes', () => {
  const usage = normalizedUsage({ input: 100, cacheRead: 800, cacheWrite: 100, output: 10, cost: { total: .25 } });
  assert.equal(usage.totalInput, 1000); assert.equal(usage.cacheRatio, .8);
  const total = addUsage(null, usage); assert.equal(total.requests, 1); assert.equal(total.reportedCost, .25);
  assert.equal(addUsage(total, normalizedUsage({ input: 1 })).unknownCostRequests, 1);
  assert.equal(normalizedUsage(undefined), null);
});
test('invalid usage does not fabricate negative token counts or known prices', () => {
  const usage = normalizedUsage({ input: -1, cacheRead: '500', output: NaN });
  assert.equal(usage.totalInput, 0); assert.equal(usage.cacheRatio, null); assert.equal(usage.cost, null);
});
test('tool gate blocks all work without a lease and after a report', () => {
  for (const name of ['write', 'extensions.edit', 'fs.write', 'bash', 'mcp.remote.run', 'fabric_exec']) {
    assert.equal(gateTool(name, null, false)?.block, true);
    assert.equal(gateTool(name, { phase: 'running' }, true)?.block, true);
  }
});
test('read-only gate classifies replayed Fabric calls and refuses shell/delegation', () => {
  for (const name of ['read', 'extensions.fovea_focus', 'tools.list', 'fabric_exec']) assert.equal(gateTool(name, { phase: 'running' }, false, true), undefined);
  for (const name of ['bash', 'write', 'agents.run', 'extensions.subagent', 'mcp.db.execute']) assert.equal(gateTool(name, { phase: 'running' }, false, true)?.block, true);
});
test('writers also cannot recursively delegate', () => {
  assert.equal(gateTool('agents.spawn', { phase: 'running' }, false, false)?.block, true);
  assert.equal(gateTool('extensions.write', { phase: 'running' }, false, false), undefined);
});
test('indicators show readiness, not guaranteed cache warmth', () => {
  assert.equal(indicator({ workers: [{ status: 'review' }] }, false), 'M● W◐');
  assert.equal(symbol('attention'), '!');
  assert.equal(indicator({ workers: [{ status: 'working' }, { status: 'ready' }] }, true), 'M◉ W1◉ W2●');
});
test('terminal control sequences are removed from worker UI text', () => {
  assert.equal(cleanText('\x1b[31mhello\x1b[0m\x00'), 'hello');
});
test('extension source selection does not mistake skills/prompts for extensions', () => {
  const paths = sourcePaths({ getAllTools: () => [{ sourceInfo: { path: '/a/tool.ts' } }], getCommands: () => [{ source: 'skill', sourceInfo: { path: '/a/SKILL.md' } }, { source: 'extension', sourceInfo: { path: '/b/index.js' } }] });
  assert.deepEqual(paths, ['/a/tool.ts', '/b/index.js']);
});
test('readiness fails closed for missing extensions, ephemeral sessions and enabled Prewalk', () => {
  const p = { protocol: 1, cwd: '/repo', sessionId: 's', capabilities: { fabric: true, fovea: true, pairReport: true }, native: { prewalkDisabled: true } };
  const state = { sessionId: 's', sessionFile: '/session.jsonl', model: { provider: 'p', id: 'm' }, autoCompactionEnabled: true };
  const spec = { provider: 'p', model: 'm' };
  assert.doesNotThrow(() => checkReadiness(p, state, DEFAULTS, spec, '/repo'));
  assert.throws(() => checkReadiness({ ...p, capabilities: { ...p.capabilities, fovea: false } }, state, DEFAULTS, spec, '/repo'), /Fovea/);
  assert.throws(() => checkReadiness(p, { ...state, sessionFile: undefined }, DEFAULTS, spec, '/repo'), /persistence/);
  assert.throws(() => checkReadiness({ ...p, native: { prewalkDisabled: false } }, state, DEFAULTS, spec, '/repo'), /Prewalk/);
});

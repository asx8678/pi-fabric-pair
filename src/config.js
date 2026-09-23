import path from 'node:path';
import { agentDir, assert, atomicJSON, clone, merge, plain, readJSON, safeId } from './util.js';

export const DEFAULTS = Object.freeze({
  version: 1,
  enabled: false,
  autoStart: true,
  indicator: 'minimal',
  maxWorkers: 1,
  workers: [{ id: 'worker', provider: '', model: '', effort: 'medium', cwd: null, readOnly: false }],
  supervision: { mode: 'milestones', finalReview: true, maxRevisions: 3, summaryDetail: 'normal' },
  runtime: { command: 'pi', commandArgs: [], extraExtensions: [], extraSkills: [], inheritExtensions: true, startupTimeoutMs: 120000, requestTimeoutMs: 30000, shutdownTimeoutMs: 5000 },
  requirements: { fabric: true, fovea: true, prewalkDisabled: true, autoCompaction: true },
  limits: { maxTurnsPerStep: 40, taskTimeoutMs: 1800000, maxReportedCostUsd: null, maxOutputTokens: null },
  verification: { commands: [], requirePassing: true, timeoutMs: 120000 },
  evidence: { maxFiles: 25000, maxTotalBytes: 536870912, maxArtifactBytes: 67108864 },
  mainReadOnlyDuringTasks: true
});
export function validateConfig(raw = {}) {
  assert(plain(raw), 'Pair configuration must be an object');
  const allowed = Object.keys(DEFAULTS);
  for (const key of Object.keys(raw)) assert(allowed.includes(key), `Unknown Pair setting: ${key}`);
  for (const section of ['supervision', 'runtime', 'requirements', 'limits', 'verification', 'evidence']) {
    if (raw[section] === undefined) continue;
    assert(plain(raw[section]), `${section} must be an object`);
    for (const key of Object.keys(raw[section])) assert(Object.hasOwn(DEFAULTS[section], key), `Unknown ${section} setting: ${key}`);
  }
  const c = merge(DEFAULTS, raw);
  assert(c.version === 1, 'Unsupported Pair config version');
  for (const key of ['enabled', 'autoStart', 'mainReadOnlyDuringTasks']) assert(typeof c[key] === 'boolean', `${key} must be boolean`);
  assert(['minimal', 'off'].includes(c.indicator), 'indicator must be minimal or off');
  assert(Number.isInteger(c.maxWorkers) && c.maxWorkers >= 1 && c.maxWorkers <= 8, 'maxWorkers must be 1–8');
  assert(Array.isArray(c.workers) && c.workers.length >= 1 && c.workers.length <= 8, 'Configure 1–8 workers');
  const ids = new Set();
  for (const w of c.workers) {
    assert(plain(w), 'Invalid worker'); safeId(w.id, 'worker ID'); assert(!ids.has(w.id), 'Duplicate worker ID'); ids.add(w.id);
    for (const key of Object.keys(w)) assert(['id', 'provider', 'model', 'effort', 'cwd', 'readOnly'].includes(key), `Unknown worker setting ${key}`);
    for (const key of ['provider', 'model']) assert(typeof w[key] === 'string' && w[key].length < 1000, `worker.${key} must be a string`);
    assert(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(w.effort), 'Unsupported effort level');
    assert(w.cwd === null || typeof w.cwd === 'string', 'worker.cwd must be null or a path');
    assert(typeof w.readOnly === 'boolean', 'worker.readOnly must be boolean');
  }
  assert(['final', 'milestones', 'strict', 'adaptive'].includes(c.supervision.mode), 'Invalid supervision mode');
  assert(c.supervision.finalReview === true, 'This release always requires final review');
  assert(Number.isInteger(c.supervision.maxRevisions) && c.supervision.maxRevisions >= 0 && c.supervision.maxRevisions <= 20, 'maxRevisions must be 0–20');
  assert(['minimal', 'normal', 'detailed'].includes(c.supervision.summaryDetail), 'Invalid summary detail');
  assert(typeof c.runtime.command === 'string' && c.runtime.command.length > 0 && !c.runtime.command.includes('\0'), 'runtime.command is required');
  assert(typeof c.runtime.inheritExtensions === 'boolean', 'runtime.inheritExtensions must be boolean');
  assert(typeof c.verification.requirePassing === 'boolean', 'verification.requirePassing must be boolean');
  assert(Number.isSafeInteger(c.verification.timeoutMs) && c.verification.timeoutMs > 0, 'verification.timeoutMs must be a positive integer');
  for (const key of ['commandArgs', 'extraExtensions', 'extraSkills']) assert(Array.isArray(c.runtime[key]) && c.runtime[key].every(v => typeof v === 'string' && !v.includes('\0')), `runtime.${key} must be a string array`);
  for (const key of ['fabric', 'fovea', 'prewalkDisabled', 'autoCompaction']) assert(typeof c.requirements[key] === 'boolean', `requirements.${key} must be boolean`);
  for (const [obj, keys] of [[c.runtime, ['startupTimeoutMs', 'requestTimeoutMs', 'shutdownTimeoutMs']], [c.limits, ['maxTurnsPerStep', 'taskTimeoutMs']], [c.evidence, ['maxFiles', 'maxTotalBytes', 'maxArtifactBytes']]]) {
    for (const key of keys) assert(Number.isSafeInteger(obj[key]) && obj[key] > 0, `${key} must be a positive integer`);
  }
  for (const key of ['maxReportedCostUsd', 'maxOutputTokens']) assert(c.limits[key] === null || (Number.isFinite(c.limits[key]) && c.limits[key] > 0), `${key} must be positive or null`);
  assert(Array.isArray(c.verification.commands) && c.verification.commands.length <= 12, 'verification.commands must be an array of at most 12 commands');
  for (const v of c.verification.commands) {
    assert(plain(v) && typeof v.name === 'string' && typeof v.command === 'string' && v.command.length > 0 && Array.isArray(v.args) && v.args.every(a => typeof a === 'string'), 'Verification requires {name, command, args}');
    for (const key of Object.keys(v)) assert(['name', 'command', 'args'].includes(key), `Unknown verification command setting: ${key}`);
    assert(!v.command.includes('\0') && v.args.every(a => !a.includes('\0')), 'Invalid verification command');
  }
  return c;
}
export function configPaths(cwd, env = process.env) { return { global: path.join(agentDir(env), 'fabric-pair.json'), project: path.join(cwd, '.pi', 'fabric-pair.json'), ui: path.join(agentDir(env), 'fabric-pair-ui.json') }; }
export async function loadConfig(cwd, trusted, env = process.env) {
  const files = configPaths(cwd, env);
  const global = await readJSON(files.global, {});
  const local = trusted ? await readJSON(files.project, {}) : {};
  const config = validateConfig(merge(global, local));
  const ui = await readJSON(files.ui, {});
  if (ui.indicator !== undefined) { assert(['minimal', 'off'].includes(ui.indicator), 'Invalid indicator preference'); config.indicator = ui.indicator; }
  return { config, files, scope: trusted ? 'project' : 'global' };
}
export async function saveConfig(file, config) { const valid = validateConfig(config); await atomicJSON(file, valid); return clone(valid); }

/** Cosmetic preferences live outside the workspace so toggling them cannot stale a code checkpoint. */
export async function saveIndicator(file, indicator) {
  assert(['minimal', 'off'].includes(indicator), 'Invalid indicator preference');
  await atomicJSON(file, { version: 1, indicator });
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { agentDir, assert, atomicJSON, clone, digest, exists, merge, plain, readJSON, safeId } from './util.js';

export const CONFIG_VERSION = 2;
export const DEFAULTS = Object.freeze({
  version: CONFIG_VERSION,
  enabled: false,
  autoStart: true,
  indicator: 'minimal',
  maxWorkers: 1,
  workers: [{ id: 'worker', provider: '', model: '', effort: 'medium', cwd: null, readOnly: false }],
  supervision: { mode: 'milestones', finalReview: true, maxRevisions: 3, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
  runtime: { command: 'pi', commandArgs: [], extraExtensions: [], extraSkills: [], inheritExtensions: true, startupTimeoutMs: 120000, requestTimeoutMs: 30000, shutdownTimeoutMs: 5000 },
  requirements: { fabric: true, fovea: true, prewalkDisabled: true, autoCompaction: true },
  limits: {
    maxTurnsPerStep: 40, taskTimeoutMs: 1800000, activeStepTimeoutMs: 1800000,
    maxQueuedTasks: 8, maxQueuedReviews: 8, maxReportsPerTask: 40, maxReportBytes: 16384,
    maxAutomaticReportRepairs: 1, maxAutomaticRecoveryAttempts: 1,
    maxReportedCostUsd: null, maxOutputTokens: null
  },
  verification: { commands: [], requirePassing: true, timeoutMs: 120000 },
  evidence: { maxFiles: 25000, maxTotalBytes: 536870912, maxArtifactBytes: 67108864 },
  mainReadOnlyDuringTasks: true
});
const NESTED = ['supervision', 'runtime', 'requirements', 'limits', 'verification', 'evidence'];
const POLICY_ALIASES = { final: 'final-only', strict: 'every-step', 'final-only': 'final-only', milestones: 'milestones', 'every-step': 'every-step' };

function assertKeys(value, allowed, label) {
  assert(plain(value), `${label} must be an object`);
  for (const key of Object.keys(value)) assert(allowed.includes(key), `Unknown ${label} setting: ${key}`);
}
export function validateConfig(raw = {}) {
  assert(plain(raw), 'Pair configuration must be an object');
  const allowed = Object.keys(DEFAULTS);
  for (const key of Object.keys(raw)) assert(allowed.includes(key), `Unknown Pair setting: ${key}`);
  for (const section of NESTED) {
    if (raw[section] === undefined) continue;
    assertKeys(raw[section], Object.keys(DEFAULTS[section]), section);
  }
  const c = merge(DEFAULTS, raw);
  assert(c.version === CONFIG_VERSION, `Unsupported Pair config version ${c.version}; expected ${CONFIG_VERSION}`);
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
  assert(['final-only', 'milestones', 'every-step'].includes(c.supervision.mode), 'Invalid supervision mode');
  assert(c.supervision.finalReview === true, 'This release always requires final review');
  for (const key of ['maxRevisions', 'maxRevisionsPerStep']) assert(Number.isInteger(c.supervision[key]) && c.supervision[key] >= 0 && c.supervision[key] <= 20, `${key} must be 0–20`);
  assert(['minimal', 'normal', 'detailed'].includes(c.supervision.summaryDetail), 'Invalid summary detail');
  assert(typeof c.runtime.command === 'string' && c.runtime.command.length > 0 && !c.runtime.command.includes('\0'), 'runtime.command is required');
  assert(typeof c.runtime.inheritExtensions === 'boolean', 'runtime.inheritExtensions must be boolean');
  assert(typeof c.verification.requirePassing === 'boolean', 'verification.requirePassing must be boolean');
  assert(Number.isSafeInteger(c.verification.timeoutMs) && c.verification.timeoutMs > 0, 'verification.timeoutMs must be a positive integer');
  for (const key of ['commandArgs', 'extraExtensions', 'extraSkills']) assert(Array.isArray(c.runtime[key]) && c.runtime[key].every(v => typeof v === 'string' && !v.includes('\0')), `runtime.${key} must be a string array`);
  for (const key of ['fabric', 'fovea', 'prewalkDisabled', 'autoCompaction']) assert(typeof c.requirements[key] === 'boolean', `requirements.${key} must be boolean`);
  for (const [obj, keys] of [[c.runtime, ['startupTimeoutMs', 'requestTimeoutMs', 'shutdownTimeoutMs']], [c.limits, ['maxTurnsPerStep', 'taskTimeoutMs', 'activeStepTimeoutMs']], [c.evidence, ['maxFiles', 'maxTotalBytes', 'maxArtifactBytes']]]) {
    for (const key of keys) assert(Number.isSafeInteger(obj[key]) && obj[key] > 0, `${key} must be a positive integer`);
  }
  const boundedLimits = { maxQueuedTasks: [0, 128], maxQueuedReviews: [0, 128], maxReportsPerTask: [1, 1000], maxReportBytes: [1, 1048576], maxAutomaticReportRepairs: [0, 20], maxAutomaticRecoveryAttempts: [0, 20] };
  for (const [key, [minimum, maximum]] of Object.entries(boundedLimits)) assert(Number.isSafeInteger(c.limits[key]) && c.limits[key] >= minimum && c.limits[key] <= maximum, `${key} must be ${minimum}–${maximum}`);
  for (const key of ['maxReportedCostUsd', 'maxOutputTokens']) assert(c.limits[key] === null || (Number.isFinite(c.limits[key]) && c.limits[key] > 0), `${key} must be positive or null`);
  assert(Array.isArray(c.verification.commands) && c.verification.commands.length <= 12, 'verification.commands must be an array of at most 12 commands');
  for (const v of c.verification.commands) {
    assert(plain(v) && typeof v.name === 'string' && typeof v.command === 'string' && v.command.length > 0 && Array.isArray(v.args) && v.args.every(a => typeof a === 'string'), 'Verification requires {name, command, args}');
    for (const key of Object.keys(v)) assert(['name', 'command', 'args'].includes(key), `Unknown verification command setting: ${key}`);
    assert(!v.command.includes('\0') && v.args.every(a => !a.includes('\0')), 'Invalid verification command');
  }
  return c;
}

export function validateConfigLayer(raw) {
  assert(plain(raw), 'Pair configuration layer must be an object');
  assert(raw.version === CONFIG_VERSION, `Configuration layers must declare version ${CONFIG_VERSION}`);
  validateConfig(raw);
  return clone(raw);
}

function applyChangedFields(target, before, after) {
  let changed = false;
  for (const key of Object.keys(after)) {
    if (key === 'version') continue;
    if (plain(before[key]) && plain(after[key])) {
      const nested = plain(target[key]) ? clone(target[key]) : {};
      if (applyChangedFields(nested, before[key], after[key])) { target[key] = nested; changed = true; }
    } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) { target[key] = clone(after[key]); changed = true; }
  }
  return changed;
}

/** Apply only effective fields changed in the dialog to the selected raw scope layer. */
export function updateConfigLayer(currentLayer, beforeEffective, afterEffective) {
  const before = validateConfig(beforeEffective), after = validateConfig(afterEffective);
  const next = currentLayer && Object.keys(currentLayer).length ? validateConfigLayer(currentLayer) : { version: CONFIG_VERSION };
  applyChangedFields(next, before, after);
  return validateConfigLayer(next);
}

function migratePolicy(value, label) {
  assert(value !== 'adaptive', `${label} uses adaptive review; explicitly choose final-only, milestones, or every-step during migration`);
  const mode = POLICY_ALIASES[value];
  assert(mode, `${label} has unsupported review policy ${value}`);
  return mode;
}
function migrateShippedV1(raw, sourceFile, scope, targetFile) {
  assertKeys(raw, Object.keys({ ...DEFAULTS, version: 1 }), 'legacy Pair');
  const layer = clone(raw); delete layer.version; layer.version = CONFIG_VERSION;
  const warnings = [];
  if (raw.enabled === true) warnings.push('Legacy enabled:true was reset to false; re-enable deliberately after reviewing the migrated settings.');
  layer.enabled = false;
  if (layer.supervision?.mode) layer.supervision.mode = migratePolicy(layer.supervision.mode, sourceFile);
  validateConfig(layer);
  return { layer, migration: { scope, kind: 'fabric-pair-v1', sourceFile, targetFile, fromVersion: 1, toVersion: CONFIG_VERSION, warnings } };
}
function migrateHandoffV1(raw, sourceFile, scope, targetFile) {
  assertKeys(raw, ['schemaVersion', 'enabled', 'autoStart', 'worker', 'collaboration', 'ui', 'limits'], 'handoff Pair');
  assert(raw.schemaVersion === 1, `Unsupported handoff config version in ${sourceFile}`);
  if (raw.worker !== undefined) assertKeys(raw.worker, ['model', 'thinking', 'workspace', 'contextPolicy'], 'handoff worker');
  if (raw.collaboration !== undefined) assertKeys(raw.collaboration, ['reviewPolicy', 'questionPolicy', 'finalReview', 'maxRevisionsPerStep', 'summaryDetail'], 'handoff collaboration');
  if (raw.ui !== undefined) assertKeys(raw.ui, ['indicator', 'animation'], 'handoff ui');
  if (raw.limits !== undefined) assertKeys(raw.limits, ['maxActiveWorkers', 'maxQueuedTasks', 'maxQueuedReviews', 'maxReportsPerTask', 'maxReportBytes', 'maxAutomaticReportRepairs', 'maxAutomaticRecoveryAttempts', 'activeStepTimeoutMs', 'taskBudgetUsd'], 'handoff limits');
  assert(raw.worker?.contextPolicy === undefined || raw.worker.contextPolicy === 'native', 'Only native handoff contextPolicy can be migrated');
  assert(raw.collaboration?.questionPolicy === undefined || raw.collaboration.questionPolicy === 'ask-main-and-wait', 'Unsupported handoff questionPolicy');
  assert(raw.ui?.animation === undefined || raw.ui.animation === false, 'Animated handoff UI is unsupported');
  assert(raw.limits?.maxActiveWorkers === undefined || raw.limits.maxActiveWorkers === 1, 'Only one active V1 worker can be migrated');
  const model = typeof raw.worker?.model === 'string' ? raw.worker.model : '';
  const workspace = raw.worker?.workspace === undefined || raw.worker.workspace === 'current-project' ? null : raw.worker.workspace;
  const layer = {
    version: CONFIG_VERSION, enabled: false,
    ...(raw.autoStart === undefined ? {} : { autoStart: raw.autoStart }),
    ...(raw.ui?.indicator === undefined ? {} : { indicator: raw.ui.indicator }),
    workers: [{ id: 'worker', provider: '', model, effort: raw.worker?.thinking || 'medium', cwd: workspace, readOnly: false }],
    supervision: {
      mode: migratePolicy(raw.collaboration?.reviewPolicy || 'milestones', sourceFile), finalReview: raw.collaboration?.finalReview ?? true,
      ...(raw.collaboration?.maxRevisionsPerStep === undefined ? {} : { maxRevisionsPerStep: raw.collaboration.maxRevisionsPerStep }),
      summaryDetail: raw.collaboration?.summaryDetail || 'normal'
    },
    limits: {
      ...Object.fromEntries(['maxQueuedTasks', 'maxQueuedReviews', 'maxReportsPerTask', 'maxReportBytes', 'maxAutomaticReportRepairs', 'maxAutomaticRecoveryAttempts'].filter(key => raw.limits?.[key] !== undefined).map(key => [key, raw.limits[key]])),
      ...(raw.limits?.activeStepTimeoutMs === undefined ? {} : { activeStepTimeoutMs: raw.limits.activeStepTimeoutMs }),
      ...(raw.limits?.taskBudgetUsd === undefined ? {} : { maxReportedCostUsd: raw.limits.taskBudgetUsd })
    }
  };
  const warnings = ['Handoff provider identity is not inferred; choose the canonical provider/model before enabling.'];
  if (raw.enabled === true) warnings.push('Handoff enabled:true was reset to false; migration never grants new consent.');
  if ((raw.limits && Object.keys(raw.limits).some(key => key.startsWith('maxQueued') || key.startsWith('maxReport') || key.startsWith('maxAutomatic') || key === 'activeStepTimeoutMs')) || raw.collaboration?.maxRevisionsPerStep !== undefined) warnings.push('Queue, report, repair, recovery, active-step and per-step values are preserved in assignment policy; their R5 runtime enforcement remains pending and Pair will not advertise them as active limits.');
  validateConfig(layer);
  return { layer, migration: { scope, kind: 'handoff-v1', sourceFile, targetFile, fromVersion: 1, toVersion: CONFIG_VERSION, warnings } };
}
function currentLayer(raw, sourceFile) {
  assert(raw.version === CONFIG_VERSION, `Unsupported Pair config version ${raw.version} in ${sourceFile}`);
  validateConfig(raw); return { layer: clone(raw), migration: null };
}
async function readLayer(canonical, legacy, scope) {
  const hasCanonical = await exists(canonical), hasLegacy = await exists(legacy);
  assert(!(hasCanonical && hasLegacy), `Configuration conflict for ${scope}: both ${canonical} and ${legacy} exist. Keep one source or explicitly archive the other.`);
  if (!hasCanonical && !hasLegacy) return { layer: {}, migration: null };
  const sourceFile = hasCanonical ? canonical : legacy;
  const raw = await readJSON(sourceFile);
  assert(plain(raw), `Pair configuration must be an object: ${sourceFile}`);
  if (hasLegacy || raw.schemaVersion !== undefined) return migrateHandoffV1(raw, sourceFile, scope, canonical);
  if (raw.version === CONFIG_VERSION) return currentLayer(raw, sourceFile);
  if (raw.version === 1 || raw.version === undefined) return migrateShippedV1(raw, sourceFile, scope, canonical);
  throw new Error(`Unsupported Pair config version ${raw.version} in ${sourceFile}`);
}
function mark(value, source, provenance, prefix = '') {
  if (plain(value)) {
    for (const [key, child] of Object.entries(value)) mark(child, source, provenance, prefix ? `${prefix}.${key}` : key);
  } else if (prefix) provenance[prefix] = source;
}
function overlay(base, layer, source, provenance, prefix = '') {
  for (const [key, value] of Object.entries(layer)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (plain(value) && plain(base[key])) overlay(base[key], value, source, provenance, name);
    else { base[key] = clone(value); mark(value, source, provenance, name); }
  }
}

export function configPaths(cwd, env = process.env) {
  const home = agentDir(env);
  return { global: path.join(home, 'fabric-pair.json'), project: path.join(cwd, '.pi', 'fabric-pair.json'), legacyGlobal: path.join(home, 'pair.json'), legacyProject: path.join(cwd, '.pi', 'pair.json'), ui: path.join(home, 'fabric-pair-ui.json') };
}
const BACKUP_FIELDS = ['maxQueuedTasks', 'maxQueuedReviews', 'maxReportsPerTask', 'maxReportBytes', 'maxAutomaticReportRepairs', 'maxAutomaticRecoveryAttempts'];
function scopeFiles(files, scope) {
  assert(['global', 'project'].includes(scope), 'Backup import scope must be global or project');
  return scope === 'global' ? { target: files.global, legacy: files.legacyGlobal } : { target: files.project, legacy: files.legacyProject };
}
function backupNameMatches(file, target, legacy) {
  const name = path.basename(file);
  return [target, legacy].some(candidate => {
    const escaped = path.basename(candidate).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}\\.v1\\.bak(?:\\.[1-9][0-9]{0,2})?$`).test(name);
  });
}
/** Preview deferred values from one explicitly selected, retained V1 backup. */
export async function previewBackupImport(cwd, trusted, scope, backupFile, env = process.env) {
  assert(scope !== 'project' || trusted, 'Project backup import requires a trusted project');
  assert(typeof backupFile === 'string' && path.isAbsolute(backupFile), 'Choose an absolute V1 backup path');
  const files = configPaths(cwd, env), selected = scopeFiles(files, scope);
  const sourceFile = path.resolve(backupFile), targetFile = path.resolve(selected.target);
  assert(path.dirname(sourceFile) === path.dirname(targetFile) && backupNameMatches(sourceFile, selected.target, selected.legacy), 'Backup must be a selected .v1.bak or numbered backup from the chosen configuration scope');
  const stat = await fs.lstat(sourceFile).catch(() => null);
  assert(stat?.isFile() && !stat.isSymbolicLink(), `Backup is missing or is not a regular file: ${sourceFile}`);
  assert(await exists(targetFile), `Current V2 configuration is missing: ${targetFile}`);
  const raw = await readJSON(sourceFile); assert(plain(raw) && raw.schemaVersion === 1, 'Selected backup is not a handoff V1 configuration');
  const migrated = migrateHandoffV1(raw, sourceFile, scope, targetFile).layer;
  const current = validateConfigLayer(await readJSON(targetFile)), layer = clone(current), fields = {}, origins = {};
  for (const key of BACKUP_FIELDS) if (raw.limits?.[key] !== undefined) { layer.limits ||= {}; layer.limits[key] = migrated.limits[key]; fields[`limits.${key}`] = migrated.limits[key]; origins[`limits.${key}`] = `limits.${key}`; }
  if (raw.limits?.activeStepTimeoutMs !== undefined) { layer.limits ||= {}; layer.limits.activeStepTimeoutMs = migrated.limits.activeStepTimeoutMs; fields['limits.activeStepTimeoutMs'] = migrated.limits.activeStepTimeoutMs; origins['limits.activeStepTimeoutMs'] = 'limits.activeStepTimeoutMs'; }
  if (raw.collaboration?.maxRevisionsPerStep !== undefined) { layer.supervision ||= {}; layer.supervision.maxRevisionsPerStep = migrated.supervision.maxRevisionsPerStep; fields['supervision.maxRevisionsPerStep'] = migrated.supervision.maxRevisionsPerStep; origins['supervision.maxRevisionsPerStep'] = 'collaboration.maxRevisionsPerStep'; }
  assert(Object.keys(fields).length > 0, 'Selected backup has no deferred Pair fields to import');
  validateConfigLayer(layer);
  return { kind: 'handoff-v1-backup', scope, sourceFile, targetFile, sourceHash: digest(raw), targetHash: digest(current), layer, fields, origins };
}
/** Apply an unchanged preview atomically; the selected backup remains as migration history. */
export async function saveBackupImport(preview) {
  assert(plain(preview) && preview.kind === 'handoff-v1-backup', 'Invalid backup import preview');
  const targetFile = path.resolve(preview.targetFile), sourceFile = path.resolve(preview.sourceFile);
  const expectedLegacy = path.join(path.dirname(targetFile), 'pair.json');
  assert(path.basename(targetFile) === 'fabric-pair.json' && path.dirname(sourceFile) === path.dirname(targetFile) && backupNameMatches(sourceFile, targetFile, expectedLegacy), 'Backup import preview has invalid scope paths');
  const source = await readJSON(sourceFile), target = validateConfigLayer(await readJSON(targetFile));
  assert(digest(source) === preview.sourceHash, 'Selected backup changed after preview; inspect it again');
  assert(digest(target) === preview.targetHash, 'Current configuration changed after preview; inspect the import again');
  const layer = validateConfigLayer(preview.layer), changed = digest(layer) !== digest(target);
  if (changed) await atomicJSON(targetFile, layer);
  return { config: clone(layer), changed, sourceFile, fields: clone(preview.fields), origins: clone(preview.origins) };
}
export async function loadConfig(cwd, trusted, env = process.env) {
  const files = configPaths(cwd, env);
  const global = await readLayer(files.global, files.legacyGlobal, 'global');
  const project = trusted ? await readLayer(files.project, files.legacyProject, 'project') : { layer: {}, migration: null };
  const config = clone(DEFAULTS), provenance = {}; mark(DEFAULTS, 'default', provenance);
  overlay(config, global.layer, 'global', provenance); overlay(config, project.layer, 'project', provenance);
  const ui = await readJSON(files.ui, {});
  if (ui.indicator !== undefined) { assert(['minimal', 'off'].includes(ui.indicator), 'Invalid indicator preference'); config.indicator = ui.indicator; provenance.indicator = 'ui'; }
  return { config: validateConfig(config), files, scope: trusted ? 'project' : 'global', provenance, migrations: [global.migration, project.migration].filter(Boolean), layers: { global: clone(global.layer), project: clone(project.layer) } };
}
async function backupPath(file, version) {
  const base = `${file}.v${version}.bak`; if (!await exists(base)) return base;
  for (let i = 1; i < 1000; i++) { const candidate = `${base}.${i}`; if (!await exists(candidate)) return candidate; }
  throw new Error(`Too many migration backups for ${file}`);
}
export async function saveConfig(file, config, { migration = null, layer = false } = {}) {
  const valid = layer ? validateConfigLayer(config) : validateConfig(config); let backup = null;
  if (migration) {
    assert(path.resolve(file) === path.resolve(migration.targetFile), 'Migration target does not match the selected configuration scope');
    assert(await exists(migration.sourceFile), `Migration source disappeared: ${migration.sourceFile}`);
    if (path.resolve(migration.sourceFile) !== path.resolve(file)) assert(!await exists(file), `Migration target already exists: ${file}`);
    backup = await backupPath(migration.sourceFile, migration.fromVersion);
    await fs.rename(migration.sourceFile, backup);
    try { await atomicJSON(file, valid); }
    catch (error) { await fs.rename(backup, migration.sourceFile).catch(() => {}); throw error; }
  } else await atomicJSON(file, valid);
  return { config: clone(valid), backup };
}

/** Cosmetic preferences live outside the workspace so toggling them cannot stale a code checkpoint. */
export async function saveIndicator(file, indicator) {
  assert(['minimal', 'off'].includes(indicator), 'Invalid indicator preference');
  await atomicJSON(file, { version: CONFIG_VERSION, indicator });
}

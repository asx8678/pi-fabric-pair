import fs from 'node:fs/promises';
import path from 'node:path';
import { agentDir, assert, atomicJSON, digest, exists, merge, plain, readJSON as readUntypedJSON, safeId } from './util.js';

// Keep readJSON's argument-count semantics (a missing required file still throws).
/** @type {(file: string, fallback?: unknown, maxBytes?: number) => Promise<unknown>} */
const readJSON = readUntypedJSON;
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) { return plain(value); }
/** @param {unknown} value @returns {value is unknown[]} */
function isArray(value) { return Array.isArray(value); }

/** @typedef {'global' | 'project'} ConfigScope */
/** @typedef {'minimal' | 'off'} Indicator */
/** @typedef {{command: string, commandArgs: string[], extraExtensions: string[], extraSkills: string[], inheritExtensions: boolean, startupTimeoutMs: number, requestTimeoutMs: number, shutdownTimeoutMs: number}} RuntimeConfig */
/** @typedef {{fabric: boolean, fovea: boolean, prewalkDisabled: boolean, autoCompaction: boolean}} ConfigRequirements */
/** @typedef {{maxFiles: number, maxTotalBytes: number, maxArtifactBytes: number}} EvidenceConfig */
/** @typedef {{version: 2, enabled: boolean, autoStart: boolean, cacheWarming: 'off' | 'active', indicator: Indicator, maxWorkers: number, workers: import('./contracts.js').WorkerSpec[], supervision: import('./contracts.js').TaskPolicy, runtime: RuntimeConfig, requirements: ConfigRequirements, limits: import('./contracts.js').TaskLimits, verification: import('./contracts.js').VerificationPolicy, evidence: EvidenceConfig, mainReadOnlyDuringTasks: boolean}} PairConfig */
/** @typedef {'supervision' | 'runtime' | 'requirements' | 'limits' | 'verification' | 'evidence'} NestedConfigKey */
/** @typedef {Partial<Omit<PairConfig, NestedConfigKey>> & {supervision?: Partial<PairConfig['supervision']>, runtime?: Partial<RuntimeConfig>, requirements?: Partial<ConfigRequirements>, limits?: Partial<PairConfig['limits']>, verification?: Partial<PairConfig['verification']>, evidence?: Partial<EvidenceConfig>}} ConfigLayer */
/** @typedef {{scope: ConfigScope, kind: 'fabric-pair-v1' | 'handoff-v1', sourceFile: string, targetFile: string, fromVersion: 1, toVersion: 2, warnings: string[]}} ConfigMigration */
/** @typedef {{migration?: ConfigMigration | null, layer?: boolean}} SaveConfigOptions */
/** @typedef {{layer: ConfigLayer, migration: ConfigMigration | null}} ConfigLayerResult */
/** @typedef {{global: string, project: string, legacyGlobal: string, legacyProject: string, ui: string}} ConfigPaths */
/** @typedef {Record<string, ConfigScope | 'default' | 'ui'>} ConfigProvenance */
/** @typedef {{kind: 'handoff-v1-backup', scope: ConfigScope, sourceFile: string, targetFile: string, sourceHash: string, targetHash: string, layer: ConfigLayer, fields: Record<string, number>, origins: Record<string, string>}} BackupImportPreview */

export const CONFIG_VERSION = 2;
/** @type {Readonly<PairConfig>} */
export const DEFAULTS = Object.freeze(/** @satisfies {PairConfig} */ ({
  version: CONFIG_VERSION,
  enabled: false,
  autoStart: true,
  cacheWarming: 'off',
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
}));
/** @type {NestedConfigKey[]} */
const NESTED = ['supervision', 'runtime', 'requirements', 'limits', 'verification', 'evidence'];
/** @type {Record<string, import('./contracts.js').ReviewMode | undefined>} */
const POLICY_ALIASES = { final: 'final-only', strict: 'every-step', 'final-only': 'final-only', milestones: 'milestones', 'every-step': 'every-step' };

/** @param {unknown} value @param {readonly string[]} allowed @param {string} label @returns {asserts value is Record<string, unknown>} */
function assertKeys(value, allowed, label) {
  assert(isObject(value), `${label} must be an object`);
  for (const key of Object.keys(value)) assert(allowed.includes(key), `Unknown ${label} setting: ${key}`);
}
/** @param {unknown} [raw] @returns {PairConfig} */
export function validateConfig(raw = {}) {
  assert(isObject(raw), 'Pair configuration must be an object');
  const allowed = Object.keys(DEFAULTS);
  for (const key of Object.keys(raw)) assert(allowed.includes(key), `Unknown Pair setting: ${key}`);
  for (const section of NESTED) {
    if (raw[section] === undefined) continue;
    assertKeys(raw[section], Object.keys(DEFAULTS[section]), section);
  }
  /** @type {unknown} */
  const c = merge(DEFAULTS, raw);
  assertMergedConfig(c);
  return c;
}

// Validate the actual merged value before giving it a production config type.
/** @param {unknown} c @returns {asserts c is PairConfig} */
function assertMergedConfig(c) {
  assert(isObject(c), 'Pair configuration must be an object');
  assert(isObject(c.supervision) && isObject(c.runtime) && isObject(c.requirements) && isObject(c.limits) && isObject(c.verification) && isObject(c.evidence), 'Pair configuration sections must be objects');
  assert(c.version === CONFIG_VERSION, `Unsupported Pair config version ${c.version}; expected ${CONFIG_VERSION}`);
  for (const key of ['enabled', 'autoStart', 'mainReadOnlyDuringTasks']) assert(typeof c[key] === 'boolean', `${key} must be boolean`);
  assert(c.cacheWarming === 'off' || c.cacheWarming === 'active', 'cacheWarming must be off or active');
  assert(c.indicator === 'minimal' || c.indicator === 'off', 'indicator must be minimal or off');
  assert(typeof c.maxWorkers === 'number' && Number.isInteger(c.maxWorkers) && c.maxWorkers >= 1 && c.maxWorkers <= 8, 'maxWorkers must be 1–8');
  assert(isArray(c.workers) && c.workers.length >= 1 && c.workers.length <= 8, 'Configure 1–8 workers');
  /** @type {Set<string>} */
  const ids = new Set();
  for (const w of c.workers) {
    assert(isObject(w), 'Invalid worker'); const id = safeId(w.id, 'worker ID'); assert(!ids.has(id), 'Duplicate worker ID'); ids.add(id);
    for (const key of Object.keys(w)) assert(['id', 'provider', 'model', 'effort', 'cwd', 'readOnly'].includes(key), `Unknown worker setting ${key}`);
    for (const key of ['provider', 'model']) assert(typeof w[key] === 'string' && w[key].length < 1000, `worker.${key} must be a string`);
    assert(typeof w.effort === 'string' && ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(w.effort), 'Unsupported effort level');
    assert(w.cwd === null || typeof w.cwd === 'string', 'worker.cwd must be null or a path');
    assert(typeof w.readOnly === 'boolean', 'worker.readOnly must be boolean');
  }
  assert(typeof c.supervision.mode === 'string' && ['final-only', 'milestones', 'every-step'].includes(c.supervision.mode), 'Invalid supervision mode');
  assert(c.supervision.finalReview === true, 'This release always requires final review');
  for (const key of ['maxRevisions', 'maxRevisionsPerStep']) assert(typeof c.supervision[key] === 'number' && Number.isInteger(c.supervision[key]) && c.supervision[key] >= 0 && c.supervision[key] <= 20, `${key} must be 0–20`);
  assert(typeof c.supervision.summaryDetail === 'string' && ['minimal', 'normal', 'detailed'].includes(c.supervision.summaryDetail), 'Invalid summary detail');
  assert(typeof c.runtime.command === 'string' && c.runtime.command.length > 0 && !c.runtime.command.includes('\0'), 'runtime.command is required');
  assert(typeof c.runtime.inheritExtensions === 'boolean', 'runtime.inheritExtensions must be boolean');
  assert(typeof c.verification.requirePassing === 'boolean', 'verification.requirePassing must be boolean');
  assert(typeof c.verification.timeoutMs === 'number' && Number.isSafeInteger(c.verification.timeoutMs) && c.verification.timeoutMs > 0, 'verification.timeoutMs must be a positive integer');
  for (const key of ['commandArgs', 'extraExtensions', 'extraSkills']) assert(isArray(c.runtime[key]) && c.runtime[key].every(v => typeof v === 'string' && !v.includes('\0')), `runtime.${key} must be a string array`);
  for (const key of ['fabric', 'fovea', 'prewalkDisabled', 'autoCompaction']) assert(typeof c.requirements[key] === 'boolean', `requirements.${key} must be boolean`);
  /** @type {[Record<string, unknown>, string[]][]} */
  const positiveFields = [[c.runtime, ['startupTimeoutMs', 'requestTimeoutMs', 'shutdownTimeoutMs']], [c.limits, ['maxTurnsPerStep', 'taskTimeoutMs', 'activeStepTimeoutMs']], [c.evidence, ['maxFiles', 'maxTotalBytes', 'maxArtifactBytes']]];
  for (const [obj, keys] of positiveFields) {
    for (const key of keys) assert(typeof obj[key] === 'number' && Number.isSafeInteger(obj[key]) && obj[key] > 0, `${key} must be a positive integer`);
  }
  /** @type {Record<string, [number, number]>} */
  const boundedLimits = { maxQueuedTasks: [0, 128], maxQueuedReviews: [0, 128], maxReportsPerTask: [1, 1000], maxReportBytes: [1, 1048576], maxAutomaticReportRepairs: [0, 20], maxAutomaticRecoveryAttempts: [0, 20] };
  for (const [key, [minimum, maximum]] of Object.entries(boundedLimits)) assert(typeof c.limits[key] === 'number' && Number.isSafeInteger(c.limits[key]) && c.limits[key] >= minimum && c.limits[key] <= maximum, `${key} must be ${minimum}–${maximum}`);
  for (const key of ['maxReportedCostUsd', 'maxOutputTokens']) assert(c.limits[key] === null || (typeof c.limits[key] === 'number' && Number.isFinite(c.limits[key]) && c.limits[key] > 0), `${key} must be positive or null`);
  assert(isArray(c.verification.commands) && c.verification.commands.length <= 12, 'verification.commands must be an array of at most 12 commands');
  for (const v of c.verification.commands) {
    assert(isObject(v) && typeof v.name === 'string' && typeof v.command === 'string' && v.command.length > 0 && isArray(v.args) && v.args.every(a => typeof a === 'string'), 'Verification requires {name, command, args}');
    for (const key of Object.keys(v)) assert(['name', 'command', 'args'].includes(key), `Unknown verification command setting: ${key}`);
    assert(!v.command.includes('\0') && v.args.every(a => !a.includes('\0')), 'Invalid verification command');
  }
}

/** @param {unknown} raw @returns {asserts raw is ConfigLayer} */
function assertConfigLayer(raw) {
  assert(isObject(raw), 'Pair configuration layer must be an object');
  assert(raw.version === CONFIG_VERSION, `Configuration layers must declare version ${CONFIG_VERSION}`);
  validateConfig(raw);
}

/** @param {unknown} raw @returns {ConfigLayer} */
export function validateConfigLayer(raw) {
  assertConfigLayer(raw);
  return structuredClone(raw);
}

/** @param {Record<string, unknown>} target @param {Record<string, unknown>} before @param {Record<string, unknown>} after @returns {boolean} */
function applyChangedFields(target, before, after) {
  let changed = false;
  for (const key of Object.keys(after)) {
    if (key === 'version') continue;
    if (isObject(before[key]) && isObject(after[key])) {
      const nested = isObject(target[key]) ? structuredClone(target[key]) : {};
      if (applyChangedFields(nested, before[key], after[key])) { target[key] = nested; changed = true; }
    } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) { target[key] = structuredClone(after[key]); changed = true; }
  }
  return changed;
}

/** Apply only effective fields changed in the dialog to the selected raw scope layer.
 * @param {unknown} currentLayer @param {unknown} beforeEffective @param {unknown} afterEffective @returns {ConfigLayer} */
export function updateConfigLayer(currentLayer, beforeEffective, afterEffective) {
  const before = validateConfig(beforeEffective), after = validateConfig(afterEffective);
  const next = currentLayer && Object.keys(currentLayer).length ? validateConfigLayer(currentLayer) : { version: CONFIG_VERSION };
  applyChangedFields(next, before, after);
  return validateConfigLayer(next);
}

/** @param {unknown} value @param {string} label @returns {import('./contracts.js').ReviewMode} */
function migratePolicy(value, label) {
  assert(value !== 'adaptive', `${label} uses adaptive review; explicitly choose final-only, milestones, or every-step during migration`);
  const key = String(value);
  const mode = Object.hasOwn(POLICY_ALIASES, key) ? POLICY_ALIASES[key] : undefined;
  assert(mode, `${label} has unsupported review policy ${value}`);
  return mode;
}
/** @param {unknown} raw @param {string} sourceFile @param {ConfigScope} scope @param {string} targetFile @returns {ConfigLayerResult} */
function migrateShippedV1(raw, sourceFile, scope, targetFile) {
  assertKeys(raw, Object.keys({ ...DEFAULTS, version: 1 }), 'legacy Pair');
  const layer = structuredClone(raw); delete layer.version; layer.version = CONFIG_VERSION;
  /** @type {string[]} */
  const warnings = [];
  if (raw.enabled === true) warnings.push('Legacy enabled:true was reset to false; re-enable deliberately after reviewing the migrated settings.');
  layer.enabled = false;
  if (isObject(layer.supervision) && layer.supervision.mode) layer.supervision.mode = migratePolicy(layer.supervision.mode, sourceFile);
  assertConfigLayer(layer);
  return { layer, migration: { scope, kind: 'fabric-pair-v1', sourceFile, targetFile, fromVersion: 1, toVersion: CONFIG_VERSION, warnings } };
}
/** @param {unknown} raw @param {string} sourceFile @param {ConfigScope} scope @param {string} targetFile @returns {ConfigLayerResult} */
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
  const legacyLimits = raw.limits;
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
      ...Object.fromEntries(['maxQueuedTasks', 'maxQueuedReviews', 'maxReportsPerTask', 'maxReportBytes', 'maxAutomaticReportRepairs', 'maxAutomaticRecoveryAttempts'].filter(key => legacyLimits?.[key] !== undefined).map(key => [key, legacyLimits?.[key]])),
      ...(raw.limits?.activeStepTimeoutMs === undefined ? {} : { activeStepTimeoutMs: raw.limits.activeStepTimeoutMs }),
      ...(raw.limits?.taskBudgetUsd === undefined ? {} : { maxReportedCostUsd: raw.limits.taskBudgetUsd })
    }
  };
  const warnings = ['Handoff provider identity is not inferred; choose the canonical provider/model before enabling.'];
  if (raw.enabled === true) warnings.push('Handoff enabled:true was reset to false; migration never grants new consent.');
  if ((raw.limits && Object.keys(raw.limits).some(key => key.startsWith('maxQueued') || key.startsWith('maxReport') || key.startsWith('maxAutomatic') || key === 'activeStepTimeoutMs')) || raw.collaboration?.maxRevisionsPerStep !== undefined) warnings.push('Queue, report, repair, recovery, active-step and per-step values are preserved in assignment policy; their R5 runtime enforcement remains pending and Pair will not advertise them as active limits.');
  assertConfigLayer(layer);
  return { layer, migration: { scope, kind: 'handoff-v1', sourceFile, targetFile, fromVersion: 1, toVersion: CONFIG_VERSION, warnings } };
}
/** @param {Record<string, unknown>} raw @param {string} sourceFile @returns {ConfigLayerResult} */
function currentLayer(raw, sourceFile) {
  assert(raw.version === CONFIG_VERSION, `Unsupported Pair config version ${raw.version} in ${sourceFile}`);
  assertConfigLayer(raw); return { layer: structuredClone(raw), migration: null };
}
/** @param {string} canonical @param {string} legacy @param {ConfigScope} scope @returns {Promise<ConfigLayerResult>} */
async function readLayer(canonical, legacy, scope) {
  const hasCanonical = await exists(canonical), hasLegacy = await exists(legacy);
  assert(!(hasCanonical && hasLegacy), `Configuration conflict for ${scope}: both ${canonical} and ${legacy} exist. Keep one source or explicitly archive the other.`);
  if (!hasCanonical && !hasLegacy) return { layer: {}, migration: null };
  const sourceFile = hasCanonical ? canonical : legacy;
  const raw = await readJSON(sourceFile);
  assert(isObject(raw), `Pair configuration must be an object: ${sourceFile}`);
  if (hasLegacy || raw.schemaVersion !== undefined) return migrateHandoffV1(raw, sourceFile, scope, canonical);
  if (raw.version === CONFIG_VERSION) return currentLayer(raw, sourceFile);
  if (raw.version === 1 || raw.version === undefined) return migrateShippedV1(raw, sourceFile, scope, canonical);
  throw new Error(`Unsupported Pair config version ${raw.version} in ${sourceFile}`);
}
/** @param {unknown} value @param {ConfigProvenance[string]} source @param {ConfigProvenance} provenance @param {string} [prefix] */
function mark(value, source, provenance, prefix = '') {
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) mark(child, source, provenance, prefix ? `${prefix}.${key}` : key);
  } else if (prefix) provenance[prefix] = source;
}
/** @param {Record<string, unknown>} base @param {Record<string, unknown>} layer @param {ConfigProvenance[string]} source @param {ConfigProvenance} provenance @param {string} [prefix] */
function overlay(base, layer, source, provenance, prefix = '') {
  for (const [key, value] of Object.entries(layer)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (isObject(value) && isObject(base[key])) overlay(base[key], value, source, provenance, name);
    else { base[key] = structuredClone(value); mark(value, source, provenance, name); }
  }
}

/** @param {string} cwd @param {NodeJS.ProcessEnv} [env] @returns {ConfigPaths} */
export function configPaths(cwd, env = process.env) {
  const home = agentDir(env);
  return { global: path.join(home, 'fabric-pair.json'), project: path.join(cwd, '.pi', 'fabric-pair.json'), legacyGlobal: path.join(home, 'pair.json'), legacyProject: path.join(cwd, '.pi', 'pair.json'), ui: path.join(home, 'fabric-pair-ui.json') };
}
/** @type {(keyof Omit<import('./contracts.js').DeferredTaskLimits, 'activeStepTimeoutMs'>)[]} */
const BACKUP_FIELDS = ['maxQueuedTasks', 'maxQueuedReviews', 'maxReportsPerTask', 'maxReportBytes', 'maxAutomaticReportRepairs', 'maxAutomaticRecoveryAttempts'];
/** @param {unknown} scope @returns {asserts scope is ConfigScope} */
function assertScope(scope) { assert(scope === 'global' || scope === 'project', 'Backup import scope must be global or project'); }
/** @param {ConfigPaths} files @param {ConfigScope} scope */
function scopeFiles(files, scope) {
  assertScope(scope);
  return scope === 'global' ? { target: files.global, legacy: files.legacyGlobal } : { target: files.project, legacy: files.legacyProject };
}
/** @param {string} file @param {string} target @param {string} legacy @returns {boolean} */
function backupNameMatches(file, target, legacy) {
  const name = path.basename(file);
  return [target, legacy].some(candidate => {
    const escaped = path.basename(candidate).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}\\.v1\\.bak(?:\\.[1-9][0-9]{0,2})?$`).test(name);
  });
}
/** Preview deferred values from one explicitly selected, retained V1 backup.
 * @param {string} cwd @param {boolean} trusted @param {string} scope @param {string} backupFile @param {NodeJS.ProcessEnv} [env] @returns {Promise<BackupImportPreview>} */
export async function previewBackupImport(cwd, trusted, scope, backupFile, env = process.env) {
  assert(scope !== 'project' || trusted, 'Project backup import requires a trusted project');
  assert(typeof backupFile === 'string' && path.isAbsolute(backupFile), 'Choose an absolute V1 backup path');
  assertScope(scope);
  const files = configPaths(cwd, env), selected = scopeFiles(files, scope);
  const sourceFile = path.resolve(backupFile), targetFile = path.resolve(selected.target);
  assert(path.dirname(sourceFile) === path.dirname(targetFile) && backupNameMatches(sourceFile, selected.target, selected.legacy), 'Backup must be a selected .v1.bak or numbered backup from the chosen configuration scope');
  const stat = await fs.lstat(sourceFile).catch(() => null);
  assert(stat?.isFile() && !stat.isSymbolicLink(), `Backup is missing or is not a regular file: ${sourceFile}`);
  assert(await exists(targetFile), `Current V2 configuration is missing: ${targetFile}`);
  const raw = await readJSON(sourceFile); assert(isObject(raw) && raw.schemaVersion === 1, 'Selected backup is not a handoff V1 configuration');
  const migrated = validateConfig(migrateHandoffV1(raw, sourceFile, scope, targetFile).layer);
  const current = validateConfigLayer(await readJSON(targetFile)), layer = structuredClone(current);
  /** @type {Record<string, number>} */
  const fields = {};
  /** @type {Record<string, string>} */
  const origins = {};
  for (const key of BACKUP_FIELDS) if (isObject(raw.limits) && raw.limits[key] !== undefined) { layer.limits ||= {}; layer.limits[key] = migrated.limits[key]; fields[`limits.${key}`] = migrated.limits[key]; origins[`limits.${key}`] = `limits.${key}`; }
  if (isObject(raw.limits) && raw.limits.activeStepTimeoutMs !== undefined) { layer.limits ||= {}; layer.limits.activeStepTimeoutMs = migrated.limits.activeStepTimeoutMs; fields['limits.activeStepTimeoutMs'] = migrated.limits.activeStepTimeoutMs; origins['limits.activeStepTimeoutMs'] = 'limits.activeStepTimeoutMs'; }
  if (isObject(raw.collaboration) && raw.collaboration.maxRevisionsPerStep !== undefined) { layer.supervision ||= {}; layer.supervision.maxRevisionsPerStep = migrated.supervision.maxRevisionsPerStep; fields['supervision.maxRevisionsPerStep'] = migrated.supervision.maxRevisionsPerStep; origins['supervision.maxRevisionsPerStep'] = 'collaboration.maxRevisionsPerStep'; }
  assert(Object.keys(fields).length > 0, 'Selected backup has no deferred Pair fields to import');
  validateConfigLayer(layer);
  return { kind: 'handoff-v1-backup', scope, sourceFile, targetFile, sourceHash: digest(raw), targetHash: digest(current), layer, fields, origins };
}
/** Apply an unchanged preview atomically; the selected backup remains as migration history.
 * @param {BackupImportPreview} preview */
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
  return { config: structuredClone(layer), changed, sourceFile, fields: structuredClone(preview.fields), origins: structuredClone(preview.origins) };
}
/** @param {string} cwd @param {boolean} trusted @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<{config: PairConfig, files: ConfigPaths, scope: ConfigScope, provenance: ConfigProvenance, migrations: ConfigMigration[], layers: {global: ConfigLayer, project: ConfigLayer}}>} */
export async function loadConfig(cwd, trusted, env = process.env) {
  const files = configPaths(cwd, env);
  const global = await readLayer(files.global, files.legacyGlobal, 'global');
  const project = trusted ? await readLayer(files.project, files.legacyProject, 'project') : { layer: {}, migration: null };
  /** @type {PairConfig} */
  const config = structuredClone(DEFAULTS);
  /** @type {ConfigProvenance} */
  const provenance = {}; mark(DEFAULTS, 'default', provenance);
  overlay(config, global.layer, 'global', provenance); overlay(config, project.layer, 'project', provenance);
  const ui = await readJSON(files.ui, {});
  assert(ui !== null && ui !== undefined, 'Invalid indicator preference');
  if (typeof ui === 'object' && 'indicator' in ui && ui.indicator !== undefined) { assert(ui.indicator === 'minimal' || ui.indicator === 'off', 'Invalid indicator preference'); config.indicator = ui.indicator; provenance.indicator = 'ui'; }
  return { config: validateConfig(config), files, scope: trusted ? 'project' : 'global', provenance, migrations: [global.migration, project.migration].filter(migration => migration !== null), layers: { global: structuredClone(global.layer), project: structuredClone(project.layer) } };
}
/** Values shown while editing a layer. Global editing must never copy effective
 * project defaults; project editing includes global inheritance. UI is separate.
 * @param {Awaited<ReturnType<typeof loadConfig>>} loaded @param {ConfigScope} scope
 * @returns {PairConfig}
 */
export function configForScope(loaded, scope) {
  const config = merge(DEFAULTS, loaded.layers.global);
  const selected = scope === 'project' ? merge(config, loaded.layers.project) : config;
  return validateConfig({ ...selected, indicator: loaded.config.indicator });
}
/** @param {string} file @param {number} version @returns {Promise<string>} */
async function backupPath(file, version) {
  const base = `${file}.v${version}.bak`; if (!await exists(base)) return base;
  for (let i = 1; i < 1000; i++) { const candidate = `${base}.${i}`; if (!await exists(candidate)) return candidate; }
  throw new Error(`Too many migration backups for ${file}`);
}
/** @param {string} file @param {unknown} config @param {SaveConfigOptions} [options] @returns {Promise<{config: PairConfig | ConfigLayer, backup: string | null}>} */
export async function saveConfig(file, config, { migration = null, layer = false } = {}) {
  const valid = layer ? validateConfigLayer(config) : validateConfig(config);
  /** @type {string | null} */
  let backup = null;
  if (migration) {
    assert(path.resolve(file) === path.resolve(migration.targetFile), 'Migration target does not match the selected configuration scope');
    assert(await exists(migration.sourceFile), `Migration source disappeared: ${migration.sourceFile}`);
    if (path.resolve(migration.sourceFile) !== path.resolve(file)) assert(!await exists(file), `Migration target already exists: ${file}`);
    backup = await backupPath(migration.sourceFile, migration.fromVersion);
    await fs.rename(migration.sourceFile, backup);
    try { await atomicJSON(file, valid); }
    catch (error) {
      /** @type {string} */
      const sourceFile = migration.sourceFile;
      /** @type {string} */
      const failure = error instanceof Error ? error.message : String(error);
      try {
        // Keep an independent, byte-for-byte backup. Exclusive creation also
        // refuses a source recreated after the migration rename (including a symlink).
        await fs.copyFile(backup, sourceFile, fs.constants.COPYFILE_EXCL);
      } catch (restoreError) {
        throw new AggregateError([error, restoreError],
          `Configuration publication failed at ${file}: ${failure}. Restoration from ${backup} to ${sourceFile} also failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}. Backup retained at ${backup}; inspect both source and target before manual recovery.`,
          { cause: error });
      }
      throw new Error(`Configuration publication failed at ${file}: ${failure}. Original bytes restored to ${sourceFile}; backup retained at ${backup}.`, { cause: error });
    }
  } else await atomicJSON(file, valid);
  return { config: structuredClone(valid), backup };
}

/** Cosmetic preferences live outside the workspace so toggling them cannot stale a code checkpoint.
 * @param {string} file @param {string} indicator */
export async function saveIndicator(file, indicator) {
  assert(['minimal', 'off'].includes(indicator), 'Invalid indicator preference');
  await atomicJSON(file, { version: CONFIG_VERSION, indicator });
}

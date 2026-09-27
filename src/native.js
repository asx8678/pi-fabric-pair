import path from 'node:path';
import fs from 'node:fs/promises';
import { agentDir, assert, canonical, merge, ownerAlive, plain, readJSON, readJSONC, VERSION } from './util.js';

/**
 * @typedef {{name: string, source?: string, sourceInfo?: {path?: string}}} NativeRegistration
 * @typedef {{getAllTools: () => NativeRegistration[], getCommands: () => NativeRegistration[], getThinkingLevel: import('@earendil-works/pi-coding-agent').ExtensionAPI['getThinkingLevel']}} NativeAPI
 * @typedef {{cwd: string, model?: {provider: string, id: string, contextWindow: number}, sessionManager: {getSessionId: () => string, getSessionFile: () => string | undefined}, isProjectTrusted?: () => boolean, getContextUsage?: () => import('./contracts.js').StoredContextUsage | undefined}} NativeContext
 */
/** @param {unknown} name */
export function toolName(name) { return String(name || '').replace(/^extensions\./, ''); }
/** @param {Pick<NativeAPI, 'getAllTools' | 'getCommands'>} pi @returns {string[]} */
export function sourcePaths(pi) {
  const entries = [...(pi.getAllTools?.() || []), ...(pi.getCommands?.() || []).filter(c => c.source === 'extension' || c.source === undefined)];
  return [...new Set(entries.map(v => v.sourceInfo?.path).filter(/** @returns {v is string} */ v => typeof v === 'string' && path.isAbsolute(v) && /\.(?:[cm]?[jt]s)$/.test(v)))];
}
/** @param {string} source @param {readonly string[]} excludes */
export function excludedExtension(source, excludes) {
  const normal = path.resolve(source);
  return excludes.some(entry => {
    if (path.isAbsolute(entry)) { const root = path.resolve(entry); return normal === root || normal.startsWith(`${root}${path.sep}`); }
    const name = entry.split('/').filter(Boolean).join(path.sep);
    return name.length > 0 && normal.includes(`${path.sep}${name}${path.sep}`);
  });
}
/** @param {string} source */
async function packageRoot(source) {
  let dir = path.dirname(source);
  for (let i = 0; i < 8; i++) {
    try { await fs.access(path.join(dir, 'package.json')); return dir; } catch { /* keep walking */ }
    const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
  }
  return path.dirname(source);
}
/** @param {readonly string[]} sources @returns {Promise<{name: string, source: string}[]>} */
export async function turnStartingExtensions(sources) {
  const pattern = /triggerTurn\s*:\s*true|sendUserMessage\s*\(/;
  /** @type {{name: string, source: string}[]} */ const found = [];
  const seen = new Set();
  for (const source of sources) {
    const root = await packageRoot(source);
    if (seen.has(root)) continue; seen.add(root);
    let name = path.basename(root);
    try { const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')); if (plain(pkg) && typeof pkg.name === 'string') name = pkg.name; } catch { /* unnamed */ }
    if (name === 'pi-fabric-pair') continue;
    let files = 0, bytes = 0, hit = false;
    /** @param {string} dir */
    const walk = async dir => {
      /** @type {import('node:fs').Dirent[]} */ let entries = [];
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (hit || files > 400 || bytes > 32 * 1024 * 1024) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (!['node_modules', '.git', 'test', 'tests', '__tests__'].includes(entry.name)) await walk(full); continue; }
        if (!/\.(?:[cm]?js|[cm]?ts)$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
        files++;
        try { const text = await fs.readFile(full, 'utf8'); bytes += text.length; if (pattern.test(text)) hit = true; } catch { /* unreadable */ }
      }
    };
    await walk(root);
    if (hit) found.push({ name, source });
  }
  return found;
}
/** @param {string} workerDir @returns {string} */
export function meshRootFor(workerDir) {
  assert(path.isAbsolute(workerDir), 'Worker directory must be an absolute path');
  return path.join(workerDir, 'fabric', 'mesh');
}
/**
 * Live Fabric resident hosts recorded under a mesh root (`residency/<root digest>/owner.json`).
 * Detection only: the worker can write these files, so Pair never signals the recorded PID.
 * @param {string} meshRoot
 * @returns {Promise<{pid: number, hostId: string, file: string}[]>}
 */
export async function liveResidentHosts(meshRoot) {
  const root = path.join(meshRoot, 'residency');
  /** @type {string[]} */ let names;
  try { names = await fs.readdir(root); } catch (e) { if (plain(e) && e.code === 'ENOENT') return []; throw e; }
  /** @type {{pid: number, hostId: string, file: string}[]} */ const hosts = [];
  for (const name of names.sort().slice(0, 64)) {
    const file = path.join(root, name, 'owner.json');
    /** @type {unknown} */ let owner;
    try { owner = await readJSON(file, null, 64 * 1024); } catch { continue; }
    if (!plain(owner) || owner.format !== 1 || typeof owner.hostId !== 'string' || !owner.hostId.startsWith('resident:') || typeof owner.startedAt !== 'number') continue;
    const pid = owner.pid;
    if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 1) continue;
    if (await ownerAlive(owner)) hosts.push({ pid, hostId: owner.hostId, file });
  }
  return hosts;
}
/** First Fabric release with the `cache.*` prompt-cache provider. */
export const FABRIC_CACHE_VERSION = '0.97.0';
/** @param {unknown} version @returns {boolean | null} `null` when the version is unreadable */
export function fabricHasCache(version) {
  const have = typeof version === 'string' ? /^(\d+)\.(\d+)\.(\d+)/.exec(version) : null;
  if (!have) return null;
  const want = FABRIC_CACHE_VERSION.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (Number(have[i + 1]) !== want[i]) return Number(have[i + 1]) > want[i];
  return true;
}
/** @param {Pick<NativeAPI, 'getAllTools' | 'getCommands'>} pi @returns {Promise<unknown>} */
export function fabricVersion(pi) {
  const source = pi.getAllTools?.().find(t => t.name === 'fabric_exec')?.sourceInfo?.path || pi.getCommands?.().find(c => c.name === 'fabric')?.sourceInfo?.path;
  return packageVersion(source, 'pi-fabric');
}
/** @param {string | undefined | null} source @param {string} expectedName @returns {Promise<unknown>} */
export async function packageVersion(source, expectedName) {
  if (!source) return null;
  let dir = path.dirname(source);
  for (let i = 0; i < 10; i++) {
    try { /** @type {unknown} */ const p = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8')); if (plain(p) && p.name === expectedName) return p.version; } catch { /* source may be a bundled file */ }
    const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
  }
  return null;
}
/** @param {string} file @returns {Promise<Record<string, unknown>>} */
async function nativeObject(file) {
  const value = await readJSONC(file);
  assert(plain(value), `Native configuration must be an object: ${file}`);
  return value;
}
/** @typedef {Omit<import('./contracts.js').StoredNativeSettings, 'fabricShellHangMs' | 'fabricAgentMaxDepth'> & {fabricShellHangMs: unknown, fabricAgentMaxDepth: unknown}} NativeSettings */
/** @param {string} cwd @param {boolean} trusted @param {NodeJS.ProcessEnv} [env] @returns {Promise<NativeSettings>} */
export async function nativeSettings(cwd, trusted, env = process.env) {
  const home = agentDir(env);
  const settings = merge(await nativeObject(path.join(home, 'settings.json')), trusted ? await nativeObject(path.join(cwd, '.pi', 'settings.json')) : {});
  const fabric = merge(await nativeObject(path.join(home, 'fabric.json')), trusted ? await nativeObject(path.join(cwd, '.pi', 'fabric.json')) : {});
  return {
    agentDir: home,
    piCompaction: settings.compaction || {},
    cacheWarming: (await nativeObject(path.join(home, 'settings.json'))).cacheWarming ?? 'streaming',
    fabricCompaction: fabric.compaction || {},
    fabricShellHangMs: (plain(fabric.executor) ? fabric.executor.shellHangMs : undefined) ?? null,
    fabricAgentMaxDepth: (plain(fabric.agents) ? fabric.agents.maxDepth : undefined) ?? null,
    prewalkDisabled: plain(fabric.prewalk) && fabric.prewalk.enabled === false,
    prewalkAutoArm: plain(fabric.prewalk) && fabric.prewalk.enabled !== false && fabric.prewalk.alwaysRearm === true,
    prewalkConfigured: !!fabric.prewalk,
    note: 'File-level native configuration; session-only overrides may differ. RPC autoCompactionEnabled is authoritative for that switch.'
  };
}
/**
 * Whether Fabric would arm Prewalk by itself at session start. Fabric arms it
 * automatically only for a root session with `prewalk.alwaysRearm: true`; a
 * manual `/fabric prewalk` stays the user's choice. Probes recorded before
 * `prewalkAutoArm` existed keep the older, stricter reading.
 * @param {{prewalkDisabled: boolean, prewalkAutoArm?: boolean}} native
 */
export function prewalkAutoArms(native) {
  return typeof native.prewalkAutoArm === 'boolean' ? native.prewalkAutoArm : !native.prewalkDisabled;
}
/**
 * @param {{fabricShellHangMs: unknown, fabricAgentMaxDepth: unknown, prewalkDisabled: boolean, prewalkAutoArm?: boolean}} native
 * @param {{prewalkDisabled: boolean}} requirements `prewalkDisabled` keeps its config name; it now requires only that Prewalk cannot auto-arm.
 */
export function nativeProfileBlockers(native, requirements) {
  const blockers = [];
  if (native.fabricShellHangMs !== 0) blockers.push(`executor.shellHangMs = 0 (observed ${JSON.stringify(native.fabricShellHangMs)}; prevents untracked background shell jobs)`);
  if (native.fabricAgentMaxDepth !== 0) blockers.push(`agents.maxDepth = 0 (observed ${JSON.stringify(native.fabricAgentMaxDepth)}; prevents recursive agents)`);
  if (requirements.prewalkDisabled && prewalkAutoArms(native)) blockers.push('prewalk.alwaysRearm = false, or prewalk.enabled = false (Prewalk would arm itself at startup and hand the first edit to another model; Pair owns delegation)');
  return blockers;
}
/**
 * @param {string} cwd
 * @param {{prewalkDisabled: boolean}} requirements
 * @param {boolean | null} [trusted]
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function preflightNativeProfile(cwd, requirements, trusted = null, env = process.env) {
  const globalPath = path.join(agentDir(env), 'fabric.json'), projectPath = path.join(cwd, '.pi', 'fabric.json');
  const scopes = trusted === null ? [false, true] : [trusted];
  const profiles = await Promise.all(scopes.map(async trust => {
    try { return { trust, blockers: nativeProfileBlockers(await nativeSettings(cwd, trust, env), requirements), error: '' }; }
    catch (error) { return { trust, blockers: [], error: error instanceof Error ? error.message : String(error) }; }
  }));
  // With unknown trust, a project file that would break the trusted profile blocks now; a
  // worker that trusts it would otherwise hold its first task at readiness. A project file
  // that only repairs a blocked global profile still defers to readiness.
  const failed = (/** @type {typeof profiles[number]} */ profile) => profile.blockers.length > 0 || !!profile.error;
  const blocked = trusted === null ? failed(profiles[1]) : failed(profiles[0]);
  const details = profiles.map(profile => `${profile.trust ? 'If worker trusts project (project overrides global)' : 'Without worker project trust (global only)'}:\n${profile.error || (profile.blockers.length ? profile.blockers.map(item => `  - ${item}`).join('\n') : '  No file-level blockers.')}`).join('\n');
  return { blocked, message: `Pair profile setup for worker workspace ${cwd}\n${details}\nGlobal defaults: ${globalPath}\nProject override: ${projectPath} (only loaded by a trusted worker; takes precedence per field).\nSet the listed values in the applicable file(s), preserving unrelated settings, then retry /pair start. Pair edits native configuration only when you approve its offer at /pair start. Worker trust/session overrides, installed capabilities and provider authentication are still checked at startup.` };
}
/** @typedef {{file: string, field: string, from: unknown, to: unknown}} ProfileRepair */
/**
 * The field edits that clear preflight blockers. Each edit goes to the file whose value
 * wins: the project file when it sets the field (a trusted worker loads it), else global.
 * @param {string} cwd
 * @param {{prewalkDisabled: boolean}} requirements
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<ProfileRepair[]>}
 */
export async function nativeProfileRepairs(cwd, requirements, env = process.env) {
  const globalPath = path.join(agentDir(env), 'fabric.json'), projectPath = path.join(cwd, '.pi', 'fabric.json');
  const files = { [globalPath]: await nativeObject(globalPath), [projectPath]: await nativeObject(projectPath) };
  /** @param {string} file @param {string} field */
  const read = (file, field) => field.split('.').reduce((/** @type {unknown} */ at, key) => plain(at) ? at[key] : undefined, files[file]);
  const native = await nativeSettings(cwd, true, env), required = [];
  if (native.fabricShellHangMs !== 0) required.push(['executor.shellHangMs', 0]);
  if (native.fabricAgentMaxDepth !== 0) required.push(['agents.maxDepth', 0]);
  if (requirements.prewalkDisabled && prewalkAutoArms(native)) required.push(['prewalk.alwaysRearm', false]);
  /** @type {ProfileRepair[]} */
  const repairs = [];
  for (const [field, to] of required) {
    const inProject = read(projectPath, String(field)) !== undefined;
    repairs.push({ file: inProject ? projectPath : globalPath, field: String(field), from: read(inProject ? projectPath : globalPath, String(field)) ?? null, to });
    // A global value still applies to an untrusted worker, so repair it too.
    const globalValue = read(globalPath, String(field));
    if (inProject && globalValue !== undefined && globalValue !== to) repairs.push({ file: globalPath, field: String(field), from: read(globalPath, String(field)), to });
  }
  return repairs;
}
/**
 * Applies the user-approved repairs. Each touched file is backed up first and keeps its
 * mode; unrelated settings are preserved (JSONC comments are not, the backup keeps them).
 * @param {ProfileRepair[]} repairs
 * @returns {Promise<string[]>} backup paths
 */
export async function applyNativeProfileRepairs(repairs) {
  const backups = [], stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const file of [...new Set(repairs.map(repair => repair.file))]) {
    const value = await nativeObject(file);
    for (const { field, to } of repairs.filter(repair => repair.file === file)) {
      const keys = field.split('.'), last = /** @type {string} */ (keys.pop());
      let at = value;
      for (const key of keys) { if (!plain(at[key])) at[key] = {}; at = /** @type {Record<string, unknown>} */ (at[key]); }
      at[last] = to;
    }
    const stat = await fs.stat(file).catch(() => null), mode = stat ? stat.mode & 0o777 : 0o644;
    if (stat) { const backup = `${file}.before-pair-repair-${stamp}`; await fs.copyFile(file, backup); backups.push(backup); }
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode });
    await fs.rename(tmp, file);
  }
  return backups;
}
/** @typedef {Omit<import('./contracts.js').HistoricalProbeV1, 'nonce' | 'workerId' | 'ownerSession' | 'native'> & {native: NativeSettings}} NativeProbe */
/** @param {NativeAPI} pi @param {NativeContext} ctx @returns {Promise<NativeProbe>} */
export async function probeNative(pi, ctx) {
  const tools = pi.getAllTools?.() || [];
  const commands = pi.getCommands?.() || [];
  const names = tools.map(t => t.name);
  const hasFabric = names.includes('fabric_exec');
  const hasFovea = names.some(n => /^(extensions\.)?fovea_/.test(n)) || commands.some(c => /^fovea(?:$|[ :-])/.test(c.name));
  const foveaSource = tools.find(t => /fovea_/.test(t.name))?.sourceInfo?.path || commands.find(c => /^fovea/.test(c.name))?.sourceInfo?.path;
  const trusted = ctx.isProjectTrusted?.() === true;
  return {
    protocol: 1, pairVersion: VERSION, pid: process.pid,
    cwd: await canonical(ctx.cwd), trusted,
    sessionId: ctx.sessionManager.getSessionId(), sessionFile: ctx.sessionManager.getSessionFile(),
    model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id, contextWindow: ctx.model.contextWindow } : null,
    thinkingLevel: pi.getThinkingLevel(),
    capabilities: { fabric: hasFabric, fovea: hasFovea, pairReport: names.some(n => toolName(n) === 'pair_report') },
    versions: { fabric: await fabricVersion(pi), fovea: await packageVersion(foveaSource, 'pi-fovea') },
    sourcePaths: sourcePaths(pi),
    context: ctx.getContextUsage?.() || null,
    native: await nativeSettings(ctx.cwd, trusted),
    checkedAt: Date.now(),
    scope: 'Registration and configuration checks, not a proof of Fovea graph coverage or provider authentication.'
  };
}
/**
 * @param {{protocol: number, cwd: string, sessionId: string, sessionFile?: string, meshRoot?: string | null, model: {provider: string, id: string} | null, thinkingLevel: string | null, capabilities: {fabric: boolean, fovea: boolean, pairReport: boolean}, native: {fabricShellHangMs: unknown, fabricAgentMaxDepth: unknown, prewalkDisabled: boolean, prewalkAutoArm?: boolean}}} probe
 * @param {{sessionId: string, sessionFile?: string, model?: {provider: string, id: string}, thinkingLevel?: string, autoCompactionEnabled?: boolean}} rpcState
 * @param {{requirements: {fabric: boolean, fovea: boolean, prewalkDisabled: boolean, autoCompaction: boolean}}} config
 * @param {import('./contracts.js').WorkerSpec} worker
 * @param {string} cwd
 * @param {string} expectedMeshRoot
 */
export function checkReadiness(probe, rpcState, config, worker, cwd, expectedMeshRoot) {
  assert(probe.protocol === 1, 'Worker bridge protocol mismatch');
  assert(probe.cwd === cwd, 'Worker is running in the wrong workspace');
  assert(probe.meshRoot === expectedMeshRoot, 'Worker mesh environment does not match the Pair-owned private mesh root; refusing shared, inherited or unknown Fabric mesh state');
  assert(probe.sessionId === rpcState.sessionId, 'Worker bridge and RPC session identities differ');
  assert(typeof rpcState.sessionFile === 'string' && rpcState.sessionFile.length > 0, 'Worker session persistence is disabled');
  assert(probe.sessionFile === rpcState.sessionFile, 'Worker bridge and RPC session paths differ');
  assert(rpcState.model?.provider === worker.provider && rpcState.model?.id === worker.model, 'Selected worker model was not applied exactly');
  assert(rpcState.thinkingLevel === worker.effort, `Worker effort ${worker.effort} was not applied (Pi used ${rpcState.thinkingLevel}); ${worker.provider}/${worker.model} probably does not support it. Choose a supported effort in /pair settings.`);
  assert(probe.model?.provider === rpcState.model.provider && probe.model?.id === rpcState.model.id, 'Worker bridge and RPC model selections differ');
  assert(probe.thinkingLevel === rpcState.thinkingLevel, 'Worker bridge and RPC thinking levels differ');
  if (config.requirements.fabric) assert(probe.capabilities.fabric, 'Worker has no fabric_exec. Install/load pi-fabric or specify runtime.extraExtensions.');
  if (config.requirements.fovea) assert(probe.capabilities.fovea, 'Worker has no registered Fovea tools/command. Install/load pi-fovea or specify runtime.extraExtensions.');
  assert(probe.capabilities.pairReport, 'Worker reporting bridge did not load');
  assert(!(worker.readOnly && probe.capabilities.fabric), 'UNSUPPORTED_PROFILE: read-only Pair workers cannot safely expose generic Fabric providers without a pre-effect authorization seam. Use the qualified single-writer profile.');
  if (probe.capabilities.fabric) {
    const blockers = nativeProfileBlockers(probe.native, config.requirements);
    assert(!blockers.length, `UNSUPPORTED_PROFILE: ${blockers.join('; ')}. Check ${path.join(agentDir(), 'fabric.json')} and ${path.join(cwd, '.pi', 'fabric.json')} (trusted project fields override global). Run /pair start to have Pair offer the fix.`);
  }
  if (config.requirements.autoCompaction) assert(rpcState.autoCompactionEnabled, 'Worker automatic compaction is disabled in native Pi settings. Enable it before using Pair.');
}
/** @param {unknown} name */
export function isDirectMutation(name) {
  const n = toolName(name);
  return /^(write|edit|apply_patch)$/.test(n) || /^(fs\.)?(write|edit|append|delete|remove|rename|move|mkdir|copy)(File|Dir)?$/.test(n) || /^(file|files)\.(write|edit|delete|move|copy)/.test(n);
}
/** @param {unknown} name */
function isReadCapability(name) {
  const n = toolName(name);
  return /^(read|grep|find|ls|pair_report)$/.test(n) || /^fovea_(sketch|focus|dwell|impact)$/.test(n) || /^(tools\.(list|describe|search)|schema\.(status|list|get)|compact\.status|state\.get)$/.test(n) || /^(fs|files|file)\.(read|stat|list|exists|glob|search)/.test(n);
}
/** @param {unknown} name @param {unknown} input */
export function requestsDetachedEffect(name, input) {
  const n = toolName(name);
  return /^(bash|powershell)$/.test(n) && input !== null && (typeof input === 'object' || typeof input === 'function') && (('background' in input && input.background === true) || ('run_in_background' in input && input.run_in_background === true) || ('monitor' in input && input.monitor !== undefined));
}
/** Fabric provider actions whose effect outlives the call, with what each one leaves behind. */
const DETACHING_FABRIC_ACTIONS = new Map([
  ['agents.spawn', 'left an agent running after the call'],
  ['agents.create', 'created a persistent actor'],
  ['agents.import', 'created a persistent actor'],
  ['agents.subscribe', 'registered a lasting lifecycle subscription that can start later turns'],
  ['jev.spawn', 'left a background program running'],
  ['cache.hold', 'started a paid prompt-cache warming lease'],
  ['components.apply', 'changed Fabric component configuration']
]);
/** @param {unknown} name @param {unknown} details */
function fabricResultProxy(name, details) {
  return typeof name === 'string' && plain(details) && details.kind === 'pi-fabric.tool-result-proxy.v1' && details.ref === name;
}
/**
 * Fabric provider actions raise no `tool_call`, so they pass Pair's gate. Fabric proxies their
 * results through `tool_result`; a successful one of these left an agent, actor, resident host,
 * program, subscription, paid lease or configuration change behind.
 * @param {unknown} name @param {unknown} details
 */
export function detachedProviderEffect(name, details) {
  return fabricResultProxy(name, details) && DETACHING_FABRIC_ACTIONS.has(String(name));
}
/** @param {string} name @returns {string} */
export function detachedEffectDescription(name) {
  return DETACHING_FABRIC_ACTIONS.get(name) || 'left work running after the call';
}
/** Fabric provider actions that write workspace files without raising `tool_call`. */
export const FABRIC_FILE_WRITERS = ['schema.commit'];
/** @param {unknown} name @param {unknown} details */
export function providerFileWrite(name, details) {
  return fabricResultProxy(name, details) && FABRIC_FILE_WRITERS.includes(String(name));
}
/**
 * `code` with string literals and comments blanked, so a `fabric_exec` program (TypeScript or
 * Python) is matched on what it calls, not on text it only carries, such as an edit payload or
 * a grep pattern. Heuristic: template expressions count as text, and a JavaScript regex literal
 * holding a quote can shift the pairing. The `tool_result` checks remain the backstop.
 * @param {string} code
 */
export function executableText(code) {
  let out = '', i = 0;
  while (i < code.length) {
    const c = code[i], next = code[i + 1] ?? '';
    if ((c === '/' && next === '/') || (c === '#' && !/[\w$]/.test(next))) { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (c === '/' && next === '*') { const end = code.indexOf('*/', i + 2); i = end < 0 ? code.length : end + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const close = c !== '`' && code.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      i += close.length;
      while (i < code.length && !code.startsWith(close, i)) {
        if (close.length === 1 && c !== '`' && code[i] === '\n') break;
        i += code[i] === '\\' ? 2 : 1;
      }
      i += close.length; out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}
/**
 * Fabric refs a `fabric_exec` program calls directly: `schema.commit(...)` outside strings and
 * comments, or a literal `tools.call({ref: "schema.commit"})`. A computed ref is not found.
 * @param {unknown} code @param {Iterable<string>} refs @returns {string[]}
 */
export function programCalls(code, refs) {
  if (typeof code !== 'string') return [];
  const text = executableText(code);
  return [...refs].filter(ref => {
    const [provider, action] = ref.split('.'); // Fabric refs are word characters only
    return new RegExp(`(?<![\\w$.])${provider}\\s*\\.\\s*${action}\\s*\\(`).test(text)
      || new RegExp(`\\bref["']?\\s*[:=]\\s*(["'\`])${provider}\\.${action}\\1`).test(code);
  });
}
/** @param {unknown} name @param {unknown} input @returns {string[]} detaching Fabric refs a worker program calls */
export function detachingProgramCalls(name, input) {
  return toolName(name) === 'fabric_exec' && plain(input) ? programCalls(input.code, DETACHING_FABRIC_ACTIONS.keys()) : [];
}
/** Pi's cache warmer refreshes when expected savings reach this many dollars. */
const PI_MIN_EXPECTED_SAVINGS_USD = 0.05;
/**
 * @typedef {{provider?: unknown, id?: unknown, api?: unknown, cost?: unknown, promptCache?: {short?: unknown, long?: unknown}}} WarmedModel
 */
/**
 * Pi prices a refresh from the last assistant message on the branch. A Pair report ends the
 * worker's run on an aborted request with no usage, so Pi sees a zero-token prompt and never
 * warms. This prices a measured prompt of `tokens` the way Pi does (dollars per million, tiers).
 * @param {WarmedModel | null | undefined} model @param {number} tokens
 * @returns {{missCost: number, warmCost: number} | null}
 */
function refreshCosts(model, tokens) {
  const cost = model?.cost;
  if (!plain(cost) || !(tokens > 0)) return null;
  /** @type {Record<string, unknown>} */ let rates = cost, above = -1;
  for (const tier of Array.isArray(cost.tiers) ? cost.tiers : []) {
    if (plain(tier) && typeof tier.inputTokensAbove === 'number' && tokens > tier.inputTokensAbove && tier.inputTokensAbove > above) { rates = tier; above = tier.inputTokensAbove; }
  }
  /** @param {string} key */
  const rate = key => { const value = rates[key]; return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value / 1_000_000 : 0; };
  const hit = rate('cacheRead') * tokens;
  const miss = (typeof cost.cacheWrite === 'number' && cost.cacheWrite > 0 ? rate('cacheWrite') : rate('input')) * tokens;
  return { missCost: Math.max(0, miss - hit), warmCost: hit + rate('output') };
}
/**
 * Whether Pi can replay this model's request as a short refresh. Pi 0.87.1's Codex request
 * builder sends no output cap, so a Codex "refresh" would regenerate a whole reply.
 * @param {WarmedModel | null | undefined} model
 */
export function shortWarmReplay(model) { return model?.api !== 'openai-codex-responses'; }
/** Whether Pi knows a prompt-cache lifetime for this model; without one Pi never warms it. @param {WarmedModel | null | undefined} model */
function hasCacheLifetime(model) {
  const cache = model?.promptCache;
  return !!cache && [cache.short, cache.long].some(seconds => typeof seconds === 'number' && seconds > 0);
}
/** Lifetime, in seconds, Pair assumes for a model Pi knows none for: provider caches mostly fade after 3-5 idle minutes. */
export const DEFAULT_CACHE_LIFETIME_S = 240;
/**
 * Pi's warmer runs only for models with a `promptCache` lifetime, and Pi 0.87.1 ships one only for
 * Anthropic models. Give the model about to run a default so warming works for every model. A
 * lifetime Pi already knows is never changed, and Codex models are left without one.
 * @param {WarmedModel | null | undefined} model @returns {boolean} whether the default was applied
 */
export function ensureCacheLifetime(model) {
  if (!model || hasCacheLifetime(model) || !shortWarmReplay(model)) return false;
  try { model.promptCache = { ...(plain(model.promptCache) ? model.promptCache : {}), short: DEFAULT_CACHE_LIFETIME_S }; return true; }
  catch { return false; } // a frozen model keeps Pi's own behaviour
}
/**
 * Pi's idle-phase warming assumes a 15% chance that another request follows. Pair knows better
 * in two places: while a worker report waits for Main (Main's reply continues the worker), and
 * while Main waits for the worker (the report starts Main's next turn). There Pair applies Pi's
 * own savings rule with that request treated as certain. Returns `warm` only where that rule
 * warms and Pi's estimate did not; never a stop Pi did not choose. When Pi saw no saving
 * (a zero-token prompt), `measuredPrompt` (the last measured request's input tokens) is priced instead.
 * @param {unknown} event @param {WarmedModel | null | undefined} [model] @param {number} [measuredPrompt]
 * @returns {'warm' | undefined}
 */
export function reviewWarmingAction(event, model, measuredPrompt = 0) {
  if (!plain(event) || !shortWarmReplay(model)) return undefined;
  const { continuationProbability: p, action } = event;
  // Pi still prices the refresh's one output token, so a zero-token prompt shows as missCost 0 alone.
  const { missCost, warmCost } = event.missCost === 0 ? refreshCosts(model, measuredPrompt) ?? event : event;
  if (typeof missCost !== 'number' || typeof warmCost !== 'number' || typeof p !== 'number' || ![missCost, warmCost, p].every(Number.isFinite)) return undefined;
  if (p >= 1 || action === 'warm') return undefined;
  return missCost - warmCost >= PI_MIN_EXPECTED_SAVINGS_USD ? 'warm' : undefined;
}
/** Whether this Pi exposes the scoped warming API Fabric's `cache.hold` needs. @param {unknown} ctx */
export function scopedCacheWarming(ctx) {
  return ctx !== null && typeof ctx === 'object' && typeof Reflect.get(ctx, 'acquireCacheWarming') === 'function';
}
/**
 * @param {unknown} name
 * @param {Pick<import('./contracts.js').Authority, 'phase'> | null | undefined} authority
 * @param {boolean} latched
 * @param {boolean} [readOnly]
 * @returns {import('@earendil-works/pi-coding-agent').ToolCallEventResult | undefined}
 */
export function gateTool(name, authority, latched, readOnly = false) {
  const n = toolName(name);
  if (!authority || authority.phase !== 'running' || (latched && n !== 'pair_report')) return { block: true, reason: 'PAIR_WAIT: no implementation lease is active. Wait for Main; do not continue or start another agent.' };
  if (/^(subagent|delegate|spawn_agent|pair_dispatch)$/.test(n)) return { block: true, reason: 'Pair workers cannot delegate or create other workers.' };
  if (readOnly && n !== 'fabric_exec' && !isReadCapability(n)) return { block: true, reason: `Read-only Pair worker cannot execute ${n}. Use read/Fovea tools, not shell or mutable providers.` };
  return undefined;
}

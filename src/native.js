import path from 'node:path';
import fs from 'node:fs/promises';
import { agentDir, assert, canonical, merge, plain, readJSONC, VERSION } from './util.js';

/** Public Pi API subset used for probing; no private session/runtime APIs.
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
/** Package metadata is observational, not a validated version contract.
 * @param {string | undefined | null} source @param {string} expectedName @returns {Promise<unknown>}
 */
export async function packageVersion(source, expectedName) {
  if (!source) return null;
  let dir = path.dirname(source);
  for (let i = 0; i < 10; i++) {
    try { /** @type {unknown} */ const p = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8')); if (plain(p) && p.name === expectedName) return p.version; } catch { /* source may be a bundled file */ }
    const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
  }
  return null;
}
/** Validate only the JSONC object boundary; selected policy values remain unknown
 * until the exact readiness/worker comparisons or persisted-probe validator.
 * @param {string} file @returns {Promise<Record<string, unknown>>}
 */
async function nativeObject(file) {
  const value = await readJSONC(file);
  assert(plain(value), `Native configuration must be an object: ${file}`);
  return value;
}
/** Unvalidated native observations must not masquerade as StoredNativeSettings.
 * @typedef {Omit<import('./contracts.js').StoredNativeSettings, 'fabricShellHangMs' | 'fabricAgentMaxDepth'> & {fabricShellHangMs: unknown, fabricAgentMaxDepth: unknown}} NativeSettings
 */
/** @param {string} cwd @param {boolean} trusted @param {NodeJS.ProcessEnv} [env] @returns {Promise<NativeSettings>} */
export async function nativeSettings(cwd, trusted, env = process.env) {
  const home = agentDir(env);
  const settings = merge(await nativeObject(path.join(home, 'settings.json')), trusted ? await nativeObject(path.join(cwd, '.pi', 'settings.json')) : {});
  const fabric = merge(await nativeObject(path.join(home, 'fabric.json')), trusted ? await nativeObject(path.join(cwd, '.pi', 'fabric.json')) : {});
  return {
    agentDir: home,
    // Only selected non-secret policy fields are retained.
    piCompaction: settings.compaction || {},
    cacheWarming: (await nativeObject(path.join(home, 'settings.json'))).cacheWarming ?? 'streaming',
    fabricCompaction: fabric.compaction || {},
    fabricShellHangMs: (plain(fabric.executor) ? fabric.executor.shellHangMs : undefined) ?? null,
    fabricAgentMaxDepth: (plain(fabric.agents) ? fabric.agents.maxDepth : undefined) ?? null,
    prewalkDisabled: plain(fabric.prewalk) && fabric.prewalk.enabled === false,
    prewalkConfigured: !!fabric.prewalk,
    note: 'File-level native configuration; session-only overrides may differ. RPC autoCompactionEnabled is authoritative for that switch.'
  };
}
/** @typedef {Omit<import('./contracts.js').HistoricalProbeV1, 'nonce' | 'workerId' | 'ownerSession' | 'native'> & {native: NativeSettings}} NativeProbe */
/** AR-02 uses the public API, not a context/private thinking-level mirror.
 * @param {NativeAPI} pi
 * @param {NativeContext} ctx
 * @returns {Promise<NativeProbe>}
 */
export async function probeNative(pi, ctx) {
  const tools = pi.getAllTools?.() || [];
  const commands = pi.getCommands?.() || [];
  const names = tools.map(t => t.name);
  const hasFabric = names.includes('fabric_exec');
  const hasFovea = names.some(n => /^(extensions\.)?fovea_/.test(n)) || commands.some(c => /^fovea(?:$|[ :-])/.test(c.name));
  const fabricSource = tools.find(t => t.name === 'fabric_exec')?.sourceInfo?.path || commands.find(c => c.name === 'fabric')?.sourceInfo?.path;
  const foveaSource = tools.find(t => /fovea_/.test(t.name))?.sourceInfo?.path || commands.find(c => /^fovea/.test(c.name))?.sourceInfo?.path;
  const trusted = ctx.isProjectTrusted?.() === true;
  return {
    protocol: 1, pairVersion: VERSION, pid: process.pid,
    cwd: await canonical(ctx.cwd), trusted,
    sessionId: ctx.sessionManager.getSessionId(), sessionFile: ctx.sessionManager.getSessionFile(),
    model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id, contextWindow: ctx.model.contextWindow } : null,
    thinkingLevel: pi.getThinkingLevel(),
    capabilities: { fabric: hasFabric, fovea: hasFovea, pairReport: names.some(n => toolName(n) === 'pair_report') },
    versions: { fabric: await packageVersion(fabricSource, 'pi-fabric'), fovea: await packageVersion(foveaSource, 'pi-fovea') },
    sourcePaths: sourcePaths(pi),
    context: ctx.getContextUsage?.() || null,
    native: await nativeSettings(ctx.cwd, trusted),
    checkedAt: Date.now(),
    scope: 'Registration and configuration checks, not a proof of Fovea graph coverage or provider authentication.'
  };
}
/** Exact readback after setters: an ACK alone does not establish readiness.
 * @param {{protocol: number, cwd: string, sessionId: string, sessionFile?: string, model: {provider: string, id: string} | null, thinkingLevel: string | null, capabilities: {fabric: boolean, fovea: boolean, pairReport: boolean}, native: {fabricShellHangMs: unknown, fabricAgentMaxDepth: unknown, prewalkDisabled: boolean}}} probe
 * @param {{sessionId: string, sessionFile?: string, model?: {provider: string, id: string}, thinkingLevel?: string, autoCompactionEnabled?: boolean}} rpcState
 * @param {{requirements: {fabric: boolean, fovea: boolean, prewalkDisabled: boolean, autoCompaction: boolean}}} config
 * @param {import('./contracts.js').WorkerSpec} worker
 * @param {string} cwd
 */
export function checkReadiness(probe, rpcState, config, worker, cwd) {
  assert(probe.protocol === 1, 'Worker bridge protocol mismatch');
  assert(probe.cwd === cwd, 'Worker is running in the wrong workspace');
  assert(probe.sessionId === rpcState.sessionId, 'Worker bridge and RPC session identities differ');
  assert(typeof rpcState.sessionFile === 'string' && rpcState.sessionFile.length > 0, 'Worker session persistence is disabled');
  assert(probe.sessionFile === rpcState.sessionFile, 'Worker bridge and RPC session paths differ');
  assert(rpcState.model?.provider === worker.provider && rpcState.model?.id === worker.model, 'Selected worker model was not applied exactly');
  assert(rpcState.thinkingLevel === worker.effort, 'Selected worker thinking level was not applied exactly');
  assert(probe.model?.provider === rpcState.model.provider && probe.model?.id === rpcState.model.id, 'Worker bridge and RPC model selections differ');
  assert(probe.thinkingLevel === rpcState.thinkingLevel, 'Worker bridge and RPC thinking levels differ');
  if (config.requirements.fabric) assert(probe.capabilities.fabric, 'Worker has no fabric_exec. Install/load pi-fabric or specify runtime.extraExtensions.');
  if (config.requirements.fovea) assert(probe.capabilities.fovea, 'Worker has no registered Fovea tools/command. Install/load pi-fovea or specify runtime.extraExtensions.');
  assert(probe.capabilities.pairReport, 'Worker reporting bridge did not load');
  assert(!(worker.readOnly && probe.capabilities.fabric), 'UNSUPPORTED_PROFILE: read-only Pair workers cannot safely expose generic Fabric providers without a pre-effect authorization seam. Use the qualified single-writer profile.');
  if (probe.capabilities.fabric) {
    assert(probe.native.fabricShellHangMs === 0, 'UNSUPPORTED_PROFILE: Fabric executor.shellHangMs must be explicitly set to 0 so shell calls cannot spill into untracked background jobs.');
    assert(probe.native.fabricAgentMaxDepth === 0, 'UNSUPPORTED_PROFILE: Fabric agents.maxDepth must be explicitly set to 0; Pair workers cannot delegate or spawn recursive agents.');
  }
  if (config.requirements.prewalkDisabled && probe.capabilities.fabric) assert(probe.native.prewalkDisabled, 'Disable native Prewalk with /fabric prewalk --disable before using Pair. Pair never edits Fabric configuration itself.');
  if (config.requirements.autoCompaction) assert(rpcState.autoCompactionEnabled, 'Worker automatic compaction is disabled in native Pi settings. Enable it before using Pair.');
}
/** @param {unknown} name */
export function isDirectMutation(name) {
  const n = toolName(name);
  return /^(write|edit|apply_patch)$/.test(n) || /^(fs\.)?(write|edit|append|delete|remove|rename|move|mkdir|copy)(File|Dir)?$/.test(n) || /^(file|files)\.(write|edit|delete|move|copy)/.test(n);
}
/** @param {unknown} name */
export function isReadCapability(name) {
  const n = toolName(name);
  return /^(read|grep|find|ls|pair_report)$/.test(n) || /^fovea_(sketch|focus|dwell|impact)$/.test(n) || /^(tools\.(list|describe|search)|schema\.(status|list|get)|compact\.status|state\.get)$/.test(n) || /^(fs|files|file)\.(read|stat|list|exists|glob|search)/.test(n);
}
/** @param {unknown} name @param {unknown} input */
export function requestsDetachedEffect(name, input) {
  const n = toolName(name);
  return /^(bash|powershell)$/.test(n) && input !== null && (typeof input === 'object' || typeof input === 'function') && (('background' in input && input.background === true) || ('run_in_background' in input && input.run_in_background === true) || ('monitor' in input && input.monitor !== undefined));
}
/** @param {unknown} name @param {Pick<import('./contracts.js').Authority, 'phase'> | null | undefined} authority
 * @param {boolean} latched @param {boolean} [readOnly]
 * @returns {import('@earendil-works/pi-coding-agent').ToolCallEventResult | undefined}
 */
export function gateTool(name, authority, latched, readOnly = false) {
  const n = toolName(name);
  if (!authority || authority.phase !== 'running' || latched) return { block: true, reason: 'PAIR_WAIT: no implementation lease is active. Wait for Main; do not continue or start another agent.' };
  if (/^(agents|actors|crew|swarm)\./.test(n) || /^(subagent|delegate|spawn_agent|pair_dispatch)$/.test(n)) return { block: true, reason: 'Pair workers cannot delegate or create other workers.' };
  // fabric_exec is an outer envelope. Fabric replays nested tool_call hooks;
  // each nested call is classified separately. This is workflow gating, not a sandbox.
  if (readOnly && n !== 'fabric_exec' && !isReadCapability(n)) return { block: true, reason: `Read-only Pair worker cannot execute ${n}. Use read/Fovea tools, not shell or mutable providers.` };
  return undefined;
}

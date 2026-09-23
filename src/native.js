import path from 'node:path';
import fs from 'node:fs/promises';
import { agentDir, assert, canonical, merge, readJSONC, VERSION } from './util.js';

export function toolName(name) { return String(name || '').replace(/^extensions\./, ''); }
export function sourcePaths(pi) {
  const entries = [...(pi.getAllTools?.() || []), ...(pi.getCommands?.() || []).filter(c => c.source === 'extension' || c.source === undefined)];
  return [...new Set(entries.map(v => v.sourceInfo?.path).filter(v => typeof v === 'string' && path.isAbsolute(v) && /\.(?:[cm]?[jt]s)$/.test(v)))];
}
export async function packageVersion(source, expectedName) {
  if (!source) return null;
  let dir = path.dirname(source);
  for (let i = 0; i < 10; i++) {
    try { const p = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8')); if (p.name === expectedName) return p.version; } catch { /* source may be a bundled file */ }
    const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
  }
  return null;
}
export async function nativeSettings(cwd, trusted, env = process.env) {
  const home = agentDir(env);
  const settings = merge(await readJSONC(path.join(home, 'settings.json')), trusted ? await readJSONC(path.join(cwd, '.pi', 'settings.json')) : {});
  const fabric = merge(await readJSONC(path.join(home, 'fabric.json')), trusted ? await readJSONC(path.join(cwd, '.pi', 'fabric.json')) : {});
  return {
    agentDir: home,
    // Only selected non-secret policy fields are retained.
    piCompaction: settings.compaction || {},
    cacheWarming: (await readJSONC(path.join(home, 'settings.json'))).cacheWarming ?? 'streaming',
    fabricCompaction: fabric.compaction || {},
    fabricShellHangMs: fabric.executor?.shellHangMs ?? null,
    fabricAgentMaxDepth: fabric.agents?.maxDepth ?? null,
    prewalkDisabled: fabric.prewalk?.enabled === false,
    prewalkConfigured: !!fabric.prewalk,
    note: 'File-level native configuration; session-only overrides may differ. RPC autoCompactionEnabled is authoritative for that switch.'
  };
}
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
    thinkingLevel: ctx.thinkingLevel ?? null,
    capabilities: { fabric: hasFabric, fovea: hasFovea, pairReport: names.some(n => toolName(n) === 'pair_report') },
    versions: { fabric: await packageVersion(fabricSource, 'pi-fabric'), fovea: await packageVersion(foveaSource, 'pi-fovea') },
    sourcePaths: sourcePaths(pi),
    context: ctx.getContextUsage?.() || null,
    native: await nativeSettings(ctx.cwd, trusted),
    checkedAt: Date.now(),
    scope: 'Registration and configuration checks, not a proof of Fovea graph coverage or provider authentication.'
  };
}
export function checkReadiness(probe, rpcState, config, worker, cwd) {
  assert(probe.protocol === 1, 'Worker bridge protocol mismatch');
  assert(probe.cwd === cwd, 'Worker is running in the wrong workspace');
  assert(probe.sessionId === rpcState.sessionId, 'Worker bridge and RPC session identities differ');
  assert(typeof rpcState.sessionFile === 'string' && rpcState.sessionFile.length > 0, 'Worker session persistence is disabled');
  assert(rpcState.model?.provider === worker.provider && rpcState.model?.id === worker.model, 'Selected worker model was not applied exactly');
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
export function isDirectMutation(name) {
  const n = toolName(name);
  return /^(write|edit|apply_patch)$/.test(n) || /^(fs\.)?(write|edit|append|delete|remove|rename|move|mkdir|copy)(File|Dir)?$/.test(n) || /^(file|files)\.(write|edit|delete|move|copy)/.test(n);
}
export function isReadCapability(name) {
  const n = toolName(name);
  return /^(read|grep|find|ls|pair_report)$/.test(n) || /^fovea_(sketch|focus|dwell|impact)$/.test(n) || /^(tools\.(list|describe|search)|schema\.(status|list|get)|compact\.status|state\.get)$/.test(n) || /^(fs|files|file)\.(read|stat|list|exists|glob|search)/.test(n);
}
export function requestsDetachedEffect(name, input) {
  const n = toolName(name);
  return /^(bash|powershell)$/.test(n) && input?.background === true;
}
export function gateTool(name, authority, latched, readOnly = false) {
  const n = toolName(name);
  if (!authority || authority.phase !== 'running' || latched) return { block: true, reason: 'PAIR_WAIT: no implementation lease is active. Wait for Main; do not continue or start another agent.' };
  if (/^(agents|actors|crew|swarm)\./.test(n) || /^(subagent|delegate|spawn_agent|pair_dispatch)$/.test(n)) return { block: true, reason: 'Pair workers cannot delegate or create other workers.' };
  // fabric_exec is an outer envelope. Fabric replays nested tool_call hooks;
  // each nested call is classified separately. This is workflow gating, not a sandbox.
  if (readOnly && n !== 'fabric_exec' && !isReadCapability(n)) return { block: true, reason: `Read-only Pair worker cannot execute ${n}. Use read/Fovea tools, not shell or mutable providers.` };
  return undefined;
}

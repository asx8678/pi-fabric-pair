import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { meshRootFor, nativeSettings, nativeProfileBlockers, preflightNativeProfile, prewalkAutoArms, checkReadiness, detachedProviderEffect, detachingProgramCalls, fabricHasCache, gateTool, liveResidentHosts, pairToolRoute, refusedProgramReason, toolPlacement, requestsDetachedEffect } from '../src/native.js';

const valid = { executor: { shellHangMs: 0 }, agents: { maxDepth: 0 }, prewalk: { enabled: false } };
async function fixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-profile-'));
  const cwd = path.join(base, 'worker'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  try { await run({ cwd, home, env: { PI_CODING_AGENT_DIR: home } }); }
  finally { await fs.rm(base, { recursive: true, force: true }); }
}

test('fresh profile lists all exact required fields and actionable paths at once', () => fixture(async ({ cwd, home, env }) => {
  const result = await preflightNativeProfile(cwd, { prewalkDisabled: true }, null, env);
  assert.equal(result.blocked, true);
  for (const value of ['executor.shellHangMs = 0', 'agents.maxDepth = 0', path.join(home, 'fabric.json'), path.join(cwd, '.pi', 'fabric.json')]) assert.ok(result.message.includes(value), value);
  assert.ok(!result.message.includes('prewalk.'), 'an unconfigured Prewalk never auto-arms, so it is not a blocker');
  assert.match(result.message, /trusted worker/); assert.match(result.message, /authentication are still checked/);
  assert.deepEqual(await fs.readdir(home), []);
}));

test('project precedence and worker trust are explicit; Main trust is not borrowed', () => fixture(async ({ cwd, home, env }) => {
  await fs.writeFile(path.join(home, 'fabric.json'), JSON.stringify(valid));
  await fs.writeFile(path.join(cwd, '.pi', 'fabric.json'), JSON.stringify({ prewalk: { enabled: true, alwaysRearm: true }, executor: { shellHangMs: 25 } }));
  assert.equal((await preflightNativeProfile(cwd, { prewalkDisabled: true }, true, env)).blocked, true);
  assert.equal((await preflightNativeProfile(cwd, { prewalkDisabled: true }, false, env)).blocked, false);
  const uncertain = await preflightNativeProfile(cwd, { prewalkDisabled: true }, null, env);
  assert.equal(uncertain.blocked, true, 'unknown worker trust blocks project settings that would fail the trusted profile');
  assert.match(uncertain.message, /observed 25/);
  assert.equal(nativeProfileBlockers(await nativeSettings(cwd, true, env), { prewalkDisabled: true }).length, 2);
  const separate = path.join(cwd, 'separate'); await fs.mkdir(separate);
  assert.equal((await preflightNativeProfile(separate, { prewalkDisabled: true }, true, env)).blocked, false, 'no Main project override leaks into another workspace');
}));

test('worker readiness shares aggregate checks and is still authoritative', () => {
  const model = { provider: 'test', id: 'model' }, cwd = '/isolated/worker', sessionFile = '/isolated/session.jsonl';
  const probe = { protocol: 1, cwd, sessionId: 'session', sessionFile, meshRoot: '/isolated/mesh', model, thinkingLevel: 'low', capabilities: { fabric: true, fovea: true, pairReport: true }, native: { fabricShellHangMs: null, fabricAgentMaxDepth: 5, prewalkDisabled: false } };
  const state = { sessionId: 'session', sessionFile, model, thinkingLevel: 'low', autoCompactionEnabled: true };
  assert.throws(() => checkReadiness(probe, state, { requirements: { fabric: true, fovea: true, prewalkDisabled: true, autoCompaction: true } }, { ...model, model: model.id, effort: 'low', readOnly: false }, cwd, '/isolated/mesh'), error => {
    for (const key of ['shellHangMs = 0', 'maxDepth = 0', 'prewalk.alwaysRearm = false']) assert.ok(error.message.includes(key));
    return true;
  });
});

test('only Prewalk auto-arm blocks Pair; manual Prewalk stays available to Main and the worker profile', () => fixture(async ({ cwd, home, env }) => {
  const profile = prewalk => fs.writeFile(path.join(home, 'fabric.json'), JSON.stringify({ ...valid, prewalk }));
  const blockers = async () => nativeProfileBlockers(await nativeSettings(cwd, false, env), { prewalkDisabled: true });
  await profile({ enabled: true });
  assert.deepEqual(await blockers(), [], 'enabled without alwaysRearm is armed only by an explicit /fabric prewalk');
  await profile({ enabled: false, alwaysRearm: true });
  assert.deepEqual(await blockers(), [], 'a disabled Prewalk cannot auto-arm');
  await profile({ alwaysRearm: true });
  assert.equal((await blockers()).length, 1);
  assert.match((await blockers())[0], /prewalk\.alwaysRearm = false/);
  assert.equal(nativeProfileBlockers({ fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: false, prewalkAutoArm: true }, { prewalkDisabled: false }).length, 0, 'the requirement can still be switched off');
  assert.equal(prewalkAutoArms({ prewalkDisabled: false }), true, 'a probe recorded before prewalkAutoArm keeps the stricter reading');
  assert.equal(prewalkAutoArms({ prewalkDisabled: true }), false);
  assert.equal(prewalkAutoArms({ prewalkDisabled: false, prewalkAutoArm: false }), false);
}));

test('meshRootFor derives a stable absolute private root per worker directory', () => {
  const first = meshRootFor('/pair/state/workers/first'), second = meshRootFor('/pair/state/workers/second');
  assert.equal(first, '/pair/state/workers/first/fabric/mesh');
  assert.equal(second, '/pair/state/workers/second/fabric/mesh');
  assert.notEqual(first, second, 'separate worker directories get separate private namespaces');
  assert.equal(meshRootFor('/pair/state/workers/first'), first, 'the root is stable across repeated derivations');
  assert.throws(() => meshRootFor('relative/workers/first'), /absolute/);
});

test('readiness requires the exact Pair-owned private mesh root observation', () => {
  const model = { provider: 'test', id: 'model' }, cwd = '/isolated/worker', sessionFile = '/isolated/session.jsonl', root = '/pair/state/workers/worker/fabric/mesh';
  const state = { sessionId: 'session', sessionFile, model, thinkingLevel: 'low', autoCompactionEnabled: true };
  const config = { requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true } };
  const worker = { ...model, model: model.id, effort: 'low', readOnly: false };
  const probe = { protocol: 1, cwd, sessionId: 'session', sessionFile, meshRoot: root, model, thinkingLevel: 'low', capabilities: { fabric: false, fovea: false, pairReport: true }, native: { fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: false } };
  checkReadiness(probe, state, config, worker, cwd, root);
  assert.throws(() => checkReadiness({ ...probe, meshRoot: '/elsewhere/fabric/mesh' }, state, config, worker, cwd, root), /private mesh root/);
  assert.throws(() => checkReadiness({ ...probe, meshRoot: null }, state, config, worker, cwd, root), /private mesh root/);
  assert.throws(() => checkReadiness({ ...probe, meshRoot: 'relative/fabric/mesh' }, state, config, worker, cwd, root), /private mesh root/);
  const { meshRoot: absent, ...withoutObservation } = probe;
  assert.throws(() => checkReadiness(withoutObservation, state, config, worker, cwd, root), /private mesh root/);
});

test('only Fabric 0.97.0 and newer count as having the cache provider', () => {
  for (const version of ['0.97.0', '0.97.1', '0.98.0', '0.100.0', '1.0.0', '0.97.0-beta.1']) assert.equal(fabricHasCache(version), true, version);
  for (const version of ['0.96.3', '0.93.0', '0.9.99']) assert.equal(fabricHasCache(version), false, version);
  for (const version of [null, undefined, '', 'latest', 97]) assert.equal(fabricHasCache(version), null, String(version));
});

test('Fabric provider results that leave something running are detached effects', () => {
  const proxy = ref => ({ kind: 'pi-fabric.tool-result-proxy.v1', ref, result: { id: 'x' } });
  for (const ref of ['agents.spawn', 'agents.create', 'agents.import', 'jev.spawn']) assert.equal(detachedProviderEffect(ref, proxy(ref)), true, ref);
  for (const ref of ['agents.run', 'agents.status', 'mesh.put', 'jev.run', 'tasks.list']) assert.equal(detachedProviderEffect(ref, proxy(ref)), false, ref);
  assert.equal(detachedProviderEffect('agents.create', proxy('agents.spawn')), false, 'the proxy must describe this exact action');
  assert.equal(detachedProviderEffect('agents.create', { ref: 'agents.create' }), false, 'only Fabric result proxies count');
  assert.equal(detachedProviderEffect('agents.create', null), false);
  const running = { phase: 'running' };
  assert.equal(gateTool('subagent', running, false)?.block, true, 'captured delegation tools still raise tool_call and stay blocked');
  assert.equal(gateTool('bash', running, false), undefined);
});

test('Fabric sessions, adopted tasks and mesh grants outlive the call', () => {
  const proxy = ref => ({ kind: 'pi-fabric.tool-result-proxy.v1', ref, result: { id: 'x' } });
  for (const ref of ['sessions.open', 'tasks.adopt', 'mesh.grant']) {
    assert.equal(detachedProviderEffect(ref, proxy(ref)), true, ref);
    assert.deepEqual(detachingProgramCalls('fabric_exec', { code: `await ${ref}({ id: "x" })` }), [ref]);
  }
  for (const ref of ['sessions.read', 'sessions.stop', 'tasks.get', 'tasks.stop', 'mesh.publish', 'programs.run']) assert.equal(detachedProviderEffect(ref, proxy(ref)), false, ref);
});

test('durable shell tasks and their completion notices are detached shell work', () => {
  for (const input of [{ command: 'npm run dev', durable: true }, { command: 'make', durable: true, notify: { topic: 'build' } }, { command: 'make', notify: { topic: 'build' } }]) assert.equal(requestsDetachedEffect('bash', input), true, JSON.stringify(input));
  for (const input of [{ command: 'ls' }, { command: 'ls', durable: false }]) assert.equal(requestsDetachedEffect('bash', input), false, JSON.stringify(input));
});

test('worker programs cannot run saved programs or change their effort', () => {
  assert.match(refusedProgramReason('fabric_exec', { code: 'return await programs.run({ id: "p1" })' }) ?? '', /programs\.run: it runs saved code/);
  assert.match(refusedProgramReason('fabric_exec', { code: 'await thinking.set({ level: "high", scope: "session" })' }) ?? '', /thinking\.set: it changes the effort/);
  assert.match(refusedProgramReason('fabric_exec', { code: 'await tools.call({ ref: "programs.run", input: {} })' }) ?? '', /programs\.run/);
  for (const code of ['await thinking.status()', 'await programs.list()', 'const note = "programs.run(x)"; // thinking.set(y)']) assert.equal(refusedProgramReason('fabric_exec', { code }), null, code);
  assert.equal(refusedProgramReason('bash', { code: 'programs.run()' }), null);
});

test('resident hosts are read from owner.json under the mesh root and never signalled', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-resident-'));
  const live = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  try {
    const meshRoot = path.join(base, 'fabric', 'mesh');
    assert.deepEqual(await liveResidentHosts(meshRoot), [], 'no residency directory means no host');
    const exited = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await once(exited, 'exit');
    const owner = async (name, value) => {
      await fs.mkdir(path.join(meshRoot, 'residency', name), { recursive: true });
      await fs.writeFile(path.join(meshRoot, 'residency', name, 'owner.json'), JSON.stringify(value));
    };
    const startedAt = Date.now();
    await owner('a-live', { format: 1, hostId: 'resident:live', pid: live.pid, token: 't', startedAt, readyAt: startedAt });
    await owner('b-exited', { format: 1, hostId: 'resident:exited', pid: exited.pid, token: 't', startedAt, readyAt: startedAt });
    await owner('c-string-pid', { format: 1, hostId: 'resident:bad', pid: String(live.pid), startedAt });
    await owner('d-format', { format: 2, hostId: 'resident:bad', pid: live.pid, startedAt });
    await owner('e-host', { format: 1, hostId: 'other', pid: live.pid, startedAt });
    await fs.mkdir(path.join(meshRoot, 'residency', 'f-empty'));
    const hosts = await liveResidentHosts(meshRoot);
    assert.deepEqual(hosts, [{ pid: live.pid, hostId: 'resident:live', file: path.join(meshRoot, 'residency', 'a-live', 'owner.json') }]);
    assert.equal(live.exitCode, null, 'detection sends no signal');
    assert.equal(live.signalCode, null);
  } finally {
    live.kill();
    await fs.rm(base, { recursive: true, force: true });
  }
});

test('Fabric tool placement decides how a role calls Pair tools', () => {
  const reply = result => ({ events: { emit: (channel, data) => { assert.equal(channel, 'pi-fabric:tool-placement:v1'); assert.deepEqual(data.tools, ['pair_report']); data.reply(result); } } });
  const full = toolPlacement(reply({ version: 1, mode: 'full-code', tools: { pair_report: 'unavailable' } }), ['pair_report']);
  assert.equal(pairToolRoute(full, 'pair_report', true), 'program', 'unavailable before Fabric starts its runtime still means a program call');
  assert.equal(pairToolRoute(toolPlacement(reply({ version: 1, mode: 'full-code', tools: { pair_report: 'model' } }), ['pair_report']), 'pair_report', true), 'direct');
  assert.equal(pairToolRoute(toolPlacement(reply({ version: 1, mode: 'enforce', tools: { pair_report: 'unavailable' } }), ['pair_report']), 'pair_report', true), 'unreachable');
  assert.equal(toolPlacement({ events: { emit() {} } }, ['pair_report']), null, 'no reply: no Fabric, or one older than 0.103.0');
  assert.equal(pairToolRoute(null, 'pair_report', true), 'program');
  assert.equal(pairToolRoute(null, 'pair_report', false), 'direct');
  assert.equal(toolPlacement({}, ['pair_report']), null);
});

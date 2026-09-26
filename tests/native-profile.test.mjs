import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nativeSettings, nativeProfileBlockers, preflightNativeProfile, checkReadiness } from '../src/native.js';

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
  for (const value of ['executor.shellHangMs = 0', 'agents.maxDepth = 0', 'prewalk.enabled = false', path.join(home, 'fabric.json'), path.join(cwd, '.pi', 'fabric.json')]) assert.ok(result.message.includes(value), value);
  assert.match(result.message, /trusted worker/); assert.match(result.message, /authentication are still checked/);
  assert.deepEqual(await fs.readdir(home), []);
}));

test('project precedence and worker trust are explicit; Main trust is not borrowed', () => fixture(async ({ cwd, home, env }) => {
  await fs.writeFile(path.join(home, 'fabric.json'), JSON.stringify(valid));
  await fs.writeFile(path.join(cwd, '.pi', 'fabric.json'), JSON.stringify({ prewalk: { enabled: true }, executor: { shellHangMs: 25 } }));
  assert.equal((await preflightNativeProfile(cwd, { prewalkDisabled: true }, true, env)).blocked, true);
  assert.equal((await preflightNativeProfile(cwd, { prewalkDisabled: true }, false, env)).blocked, false);
  const uncertain = await preflightNativeProfile(cwd, { prewalkDisabled: true }, null, env);
  assert.equal(uncertain.blocked, false, 'unknown worker trust defers conditional failures to worker readiness');
  assert.match(uncertain.message, /observed 25/);
  assert.equal(nativeProfileBlockers(await nativeSettings(cwd, true, env), { prewalkDisabled: true }).length, 2);
  const separate = path.join(cwd, 'separate'); await fs.mkdir(separate);
  assert.equal((await preflightNativeProfile(separate, { prewalkDisabled: true }, true, env)).blocked, false, 'no Main project override leaks into another workspace');
}));

test('worker readiness shares aggregate checks and is still authoritative', () => {
  const model = { provider: 'test', id: 'model' }, cwd = '/isolated/worker', sessionFile = '/isolated/session.jsonl';
  const probe = { protocol: 1, cwd, sessionId: 'session', sessionFile, model, thinkingLevel: 'low', capabilities: { fabric: true, fovea: true, pairReport: true }, native: { fabricShellHangMs: null, fabricAgentMaxDepth: 5, prewalkDisabled: false } };
  const state = { sessionId: 'session', sessionFile, model, thinkingLevel: 'low', autoCompactionEnabled: true };
  assert.throws(() => checkReadiness(probe, state, { requirements: { fabric: true, fovea: true, prewalkDisabled: true, autoCompaction: true } }, { ...model, model: model.id, effort: 'low', readOnly: false }, cwd), error => {
    for (const key of ['shellHangMs = 0', 'maxDepth = 0', 'prewalk.enabled = false']) assert.ok(error.message.includes(key));
    return true;
  });
});

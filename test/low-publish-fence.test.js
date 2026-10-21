// A low report reaches Pair the way a Pi worker's pair_report does: the latch first, then the inbox. Between those
// two writes Pi re-checks the report's authority (worker.js assertReportAuthority) so a lease that was revoked while
// the report was being written cannot publish anything. low has no in-worker gate, so the runtime must do the same
// check itself; this pins it, and the second test shows the same report publishing when the lease is intact.
//
// The runtime is driven over a scripted child rather than the fake low CLI: the fake deletes its inbox on /stop,
// which would erase exactly the evidence a fence test has to look at. Nothing is spawned and nothing waits.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { LowRuntime } from '../src/low-runtime.js';

/** A child process stand-in: `--serve` prints its session, `--send` answers with one result line. @returns {any} */
function scriptedChild() {
  return Object.assign(new EventEmitter(), { pid: 91234, stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true, killed: false, exitCode: null });
}

/** A low runtime whose server is a scripted child, plus the fence the test drives. */
async function fixture(/** @type {boolean} */ revokeWhilePublishing) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-publish-'));
  const home = path.join(base, 'home'), sessions = path.join(home, '.low', 'sessions'), workerDir = path.join(base, 'worker');
  await fs.mkdir(sessions, { recursive: true }); await fs.mkdir(workerDir, { recursive: true });
  const sessionFile = path.join(sessions, 's1.jsonl');
  await fs.writeFile(sessionFile, '{"id":"s1"}\n');
  await fs.mkdir(sessionFile.replace(/\.jsonl$/, '.inbox'), { recursive: true });
  await fs.writeFile(path.join(workerDir, 'authority.json'), JSON.stringify({
    version: 1, ownerSession: 'owner', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1, phase: 'running',
    leaseId: 'lease-1', attemptId: 'attempt-1', readOnly: false, model: { provider: 'opendesign', id: 'deepseek-v4.1-flash' },
    repoRoot: base, updatedAt: Date.now(),
    task: { id: 'task-1', objective: 'Fix add()', planRevision: 1, attemptId: 'attempt-1', attemptNumber: 1, constraints: [],
      steps: [{ id: 's1', title: 'One', instructions: 'Do it', acceptance: [] }], stepIndex: 0,
      policy: { mode: 'every-step', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal', maxStepFiles: 5 },
      // Exactly config.js DEFAULTS.limits, which is what the controller clones into a task.
      limits: { activeStepTimeoutMs: 1800000, maxReportsPerTask: 40, maxReportBytes: 16384, maxAutomaticReportRepairs: 1, maxReportedCostUsd: null, maxOutputTokens: null },
      lastDecision: null },
  }));
  /** @type {{current: boolean}} */ const fence = { current: true };
  const runtime = new LowRuntime(/** @type {any} */ ({
    ownerSession: 'owner', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1, nonce: 'nonce-1', dir: workerDir, cwd: base,
    sessionFile, sessionId: null, freshSession: false, onWake: () => {},
    config: { runtime: { startupTimeoutMs: 2000, requestTimeoutMs: 2000, shutdownTimeoutMs: 1000 }, requirements: { fabric: false, fovea: false, prewalkDisabled: true, autoCompaction: true } },
    spec: { id: 'worker', provider: 'opendesign', model: 'deepseek-v4.1-flash', effort: 'high', cwd: null, readOnly: false },
    entryPath: 'entry.js', low: { command: 'low', args: [], home },
    isCurrent: () => fence.current,
    // The publish window is where the lease is revoked, if this test asks for it.
    beforePublish: () => { if (revokeWhilePublishing) fence.current = false; },
    spawnLow: /** @type {any} */ ((/** @type {string} */ _command, /** @type {string[]} */ args) => {
      const child = scriptedChild();
      if (args.includes('--serve')) setImmediate(() => child.stderr.write('[session ' + sessionFile + ']\n'));
      else setImmediate(() => {
        child.stdout.write(JSON.stringify({ status: 'done', exit: 0, verdict: 'VERIFIED', good: true, answer: 'Done.', changes: ['calc.py +1 −1'] }) + '\n');
        child.emit('close', 0, null);
      });
      return child;
    }),
  }));
  return { base, workerDir, sessionFile, fence, runtime };
}

/** Run one task to completion through the activation surface the controller uses. */
async function runTask(/** @type {Awaited<ReturnType<typeof fixture>>} */ f) {
  const { runtime } = f;
  const token = runtime.reserveActivation(/** @type {any} */ ({ taskId: 'task-1', attemptId: 'attempt-1', attemptNumber: 1, leaseId: 'lease-1', planRevision: 1, workerGeneration: 1 }));
  await runtime.prepareActivation(token);
  await runtime.activate(token, 'FABRIC PAIR WORK ORDER\n{}');
  await runtime.waitIdle(5000);
}

test('a report whose lease is revoked between its latch and its inbox write never reaches the inbox', async () => {
  const f = await fixture(true);
  try {
    await runTask(f);
    // The latch is written first, so the report exists on disk — and stops there.
    assert.ok(await fs.stat(path.join(f.workerDir, 'latch.json')).then(() => true, () => false), 'the latch was written');
    assert.deepEqual(await fs.readdir(path.join(f.workerDir, 'inbox')).catch(() => []), [], 'nothing was published to the inbox');
  } finally { await f.runtime.abortAndStop('test over').catch(() => {}); await fs.rm(f.base, { recursive: true, force: true }).catch(() => {}); }
});

test('with the lease intact the same report publishes, so the test is about the fence and not a silent runtime', async () => {
  const f = await fixture(false);
  try {
    await runTask(f);
    const published = await fs.readdir(path.join(f.workerDir, 'inbox'));
    assert.equal(published.length, 1, 'one report reached the inbox: ' + JSON.stringify(published));
    assert.match(published[0], /^report-.*\.json$/);
  } finally { await f.runtime.abortAndStop('test over').catch(() => {}); await fs.rm(f.base, { recursive: true, force: true }).catch(() => {}); }
});

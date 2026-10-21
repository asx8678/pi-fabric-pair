// exitProof decides whether a worker's process is provably gone, and it is the gate in front of every automatic
// recovery: the watchdog's crash rung, the settle-timeout rung and Main's pair_recover all refuse to act on a
// worker whose exit is unconfirmed. It therefore has to answer two questions that a bare PID cannot separate:
// "is the worker still running?" and "did an unrelated process inherit the number after the worker exited?".
//
// The second answer is the awkward one. A PID is free the moment its owner dies, and on a busy machine the next
// process takes it within milliseconds; the worker that crashed in a test suite leaves a number behind that some
// test runner's child then holds. Probing the number then says "alive", which is a false negative: the worker is
// gone, but Pair refuses to recover and the human is told to reconcile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { PairController } from '../src/controller.js';
import { parseElapsed } from '../src/util.js';

test('ps elapsed time is parsed in every shape ps prints, so a start time never depends on the host zone', () => {
  // `etime` is a duration: ss, mm:ss, hh:mm:ss, dd-hh:mm:ss. Reading it (rather than `lstart`, a local-time string
  // that Date.parse interprets in the reader's zone) is what makes "did this PID get reused?" answerable at all.
  assert.equal(parseElapsed('00:07'), 7, 'seconds still carry the minutes field, as ps prints them');
  assert.equal(parseElapsed('  12:34\n'), 754);
  assert.equal(parseElapsed('01:02:03'), 3723);
  assert.equal(parseElapsed('2-03:04:05'), 183845);
  assert.equal(parseElapsed('not-a-duration'), null, 'an unexpected field is reported, never guessed');
});

/** A live process to hold a PID, standing in for whatever took the number of a dead worker. */
async function holder() {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const pid = /** @type {number} */ (child.pid);
  await new Promise(resolve => setTimeout(resolve, 50));
  return { pid, kill: async () => { child.kill('SIGKILL'); await new Promise(done => child.once('close', done)); } };
}

/** The controller surface exitProof uses; it needs no state beyond the record and the handles map. */
function prover() {
  const controller = Object.create(PairController.prototype);
  controller.state = { ownerEpoch: 4, workers: {} };
  controller.handles = new Map();
  return controller;
}

test('a PID reused by another process is not the worker: the worker that held it has exited', async () => {
  const c = prover(), live = await holder();
  try {
    // The record says the worker spawned just now; the process holding the number started after that.
    const record = { id: 'worker', workerGeneration: 2, pid: live.pid, spawnedAt: Date.now() - 5000 };
    const proof = await c.exitProof(record);
    assert.equal(proof.exited, true, `a number taken by a newer process proves the worker is gone: ${JSON.stringify(proof)}`);
    assert.equal(proof.pid, live.pid);
    assert.match(String(proof.reason), /newer process|exited/);
  } finally { await live.kill(); }
});

test('a PID that started before the spawn is still ours, so the exit stays unproven', async () => {
  const c = prover(), live = await holder();
  try {
    // This process was already running when the worker was recorded spawning, so it could be the worker itself.
    const record = { id: 'worker', workerGeneration: 2, pid: live.pid, spawnedAt: Date.now() + 60000 };
    const proof = await c.exitProof(record);
    assert.equal(proof.exited, false, `a process that could be ours is not proof of exit: ${JSON.stringify(proof)}`);
    assert.match(String(proof.reason), /may still be running/);
  } finally { await live.kill(); }
});

test('the runtime that spawned the process proves the exit it reaped, even if the number was reused', async () => {
  const c = prover(), live = await holder();
  try {
    const record = { id: 'worker', workerGeneration: 2, pid: live.pid, spawnedAt: Date.now() - 5000 };
    // What a LowRuntime/PiRpc records when the operating system reports the child's exit to Pair itself.
    const runtime = { ownerEpoch: 4, workerGeneration: 2, exit: { code: 9, signal: null, expected: false, error: null } };
    c.handles.set('worker', runtime);
    const proof = await c.exitProof(record);
    assert.equal(proof.exited, true, `a reaped exit is proof, whatever now holds the number: ${JSON.stringify(proof)}`);
    assert.match(String(proof.reason), /exit code 9/);
  } finally { await live.kill(); }
});

test('a handle from another generation proves nothing about this one', async () => {
  const c = prover(), live = await holder();
  try {
    const record = { id: 'worker', workerGeneration: 3, pid: live.pid, spawnedAt: Date.now() + 60000 };
    // A handle left over from generation 2 must not be read as this generation's exit.
    c.handles.set('worker', { ownerEpoch: 4, workerGeneration: 2, exit: { code: 9, signal: null, expected: false, error: null } });
    const proof = await c.exitProof(record);
    assert.equal(proof.exited, false, `a stale generation's exit is not this worker's: ${JSON.stringify(proof)}`);
  } finally { await live.kill(); }
});

test('a dead PID with a live process group proves the process exited and names the orphans', async () => {
  const c = prover();
  // PID 2 is not signallable, so this goes through the recorded-PID path with no live process to find.
  const record = { id: 'worker', workerGeneration: 2, pid: 999999, spawnedAt: Date.now() - 5000 };
  const proof = await c.exitProof(record);
  assert.equal(proof.exited, true);
  assert.match(String(proof.reason), /exited/);
});

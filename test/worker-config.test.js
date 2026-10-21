
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, validateConfig } from '../src/config.js';
import { addWorker, describeWorker, duplicateWorker, findWorker, makeDefault, moveWorker, removeWorker, splitModel, updateWorker, workerIndex } from '../src/worker-config.js';

/** A config with two workers, a and b, in that order. */
const two = (extra = {}) => validateConfig({
  ...structuredClone(DEFAULTS),
  workers: [
    { id: 'a', provider: 'alpha', model: 'one', effort: 'medium', cwd: null, readOnly: false },
    { id: 'b', provider: 'beta', model: 'two', effort: 'low', cwd: '/tmp/elsewhere', readOnly: true }
  ],
  ...extra
});
const ids = config => config.workers.map(worker => worker.id);

test('addWorker appends a validated worker and refuses a duplicate or unsafe id', () => {
  const config = two();
  const added = addWorker(config, { id: 'c', provider: 'gamma', model: 'three' });
  assert.deepEqual(ids(added), ['a', 'b', 'c'], 'the new worker goes last');
  assert.deepEqual(findWorker(added, 'c'), { id: 'c', provider: 'gamma', model: 'three', effort: 'medium', cwd: null, readOnly: false }, 'defaults fill the rest');
  assert.deepEqual(ids(config), ['a', 'b'], 'the input config is not mutated');
  // A blank model is allowed: the settings screen asks for one before the worker can start.
  assert.equal(findWorker(addWorker(config, { id: 'blank' }), 'blank').model, '');
  assert.throws(() => addWorker(config, { id: 'a' }), /A worker named a already exists/);
  assert.throws(() => addWorker(config, { id: '../escape' }), /worker ID/);
  // Validation runs once, on the finished list: an unsupported effort or a non-boolean readOnly is refused there.
  assert.throws(() => addWorker(config, { id: 'ok', effort: 'extreme' }), /Unsupported effort/);
  assert.throws(() => addWorker(config, { id: 'ok', readOnly: 1 }), /readOnly must be boolean/);
  assert.equal(addWorker(config, { id: 'c' }).workers.length, 3);
});

test('duplicateWorker copies the settings under a new id, next to the original, and shares nothing', () => {
  const config = two();
  const copy = duplicateWorker(config, 'a', 'a2');
  assert.deepEqual(ids(copy), ['a', 'a2', 'b'], 'the copy sits right after its source');
  assert.deepEqual(copy.workers[1], { ...config.workers[0], id: 'a2' }, 'settings are copied, the id is not');
  assert.notEqual(copy.workers[1], config.workers[0], 'a distinct object');
  assert.throws(() => duplicateWorker(config, 'a', 'b'), /already exists/);
  assert.throws(() => duplicateWorker(config, 'missing', 'x'), /No worker missing\. Configured: a, b/);
  // Duplicating from a nested object does not alias it either.
  copy.workers[1].cwd = '/tmp/other';
  assert.equal(config.workers[0].cwd, null);
});

test('removeWorker drops an entry but never the last one', () => {
  assert.deepEqual(ids(removeWorker(two(), 'a')), ['b']);
  assert.throws(() => removeWorker(two(), 'missing'), /No worker missing/);
  const single = addWorker(two(), { id: 'only' });
  assert.deepEqual(ids(removeWorker(removeWorker(single, 'a'), 'b')), ['only'], 'two removals leave the last worker');
  assert.throws(() => removeWorker(validateConfig({ ...structuredClone(DEFAULTS), workers: [{ id: 'a', provider: '', model: '', effort: 'medium', cwd: null, readOnly: false }] }), 'a'),
    /at least one worker/);
});

test('moveWorker reorders and clamps at the ends; the config is validated either way', () => {
  const config = addWorker(two(), { id: 'c' });
  assert.deepEqual(ids(moveWorker(config, 'c', -1)), ['a', 'c', 'b']);
  assert.deepEqual(ids(moveWorker(config, 'c', -5)), ['c', 'a', 'b'], 'a big step up stops at the top');
  assert.deepEqual(ids(moveWorker(config, 'a', 5)), ['b', 'c', 'a'], 'and a big step down at the bottom');
  assert.equal(moveWorker(config, 'a', -3), config, 'moving past the end changes nothing at all');
  assert.throws(() => moveWorker(config, 'a', 0), /non-zero/);
  assert.throws(() => moveWorker(config, 'a', 1.5), /non-zero whole number/);
});

test('makeDefault moves the worker first, which is what autoStart and a bare command use', () => {
  const config = addWorker(two(), { id: 'c', provider: 'gamma', model: 'three' });
  const next = makeDefault(config, 'c');
  assert.deepEqual(ids(next), ['c', 'a', 'b']);
  assert.equal(next.workers[0].model, 'three', 'the same worker, now first');
  assert.equal(makeDefault(next, 'c'), next, 'already default: unchanged');
  assert.throws(() => makeDefault(config, 'nope'), /No worker nope/);
});

test('updateWorker changes only the fields it is given', () => {
  const config = two();
  const next = updateWorker(config, 'b', { effort: 'high' });
  assert.deepEqual(next.workers[1], { ...config.workers[1], effort: 'high' });
  assert.deepEqual(next.workers[0], config.workers[0], 'the other worker is untouched');
  assert.throws(() => updateWorker(config, 'b', { id: 'c' }), /Unknown worker setting id/);
  assert.throws(() => updateWorker(config, 'b', { effort: 'extreme' }), /Unsupported effort/);
  assert.throws(() => updateWorker(config, 'b', { cwd: 42 }), /cwd must be null or a path/);
});

test('workerIndex and describeWorker read the list without changing it', () => {
  const config = two();
  assert.equal(workerIndex(config, 'b'), 1);
  assert.throws(() => workerIndex(config, 'zzz'), /No worker zzz\. Configured: a, b/);
  assert.equal(describeWorker(config.workers[0]), 'a — alpha/one, medium');
  assert.equal(describeWorker(config.workers[1]), 'b — beta/two, low, read-only, in /tmp/elsewhere');
  assert.equal(describeWorker({ id: 'x', provider: '', model: '', effort: 'high', cwd: null, readOnly: false }), 'x — no model yet, high');
  assert.deepEqual(ids(config), ['a', 'b'], 'still unchanged');
});

test('splitModel reads provider/model, or a bare model of the same provider', () => {
  const config = two();
  assert.deepEqual(splitModel(config, 'gamma/three'), { provider: 'gamma', model: 'three' });
  assert.deepEqual(splitModel(config, 'three'), { provider: 'alpha', model: 'three' }, 'a bare name uses the first worker\'s provider');
  assert.deepEqual(splitModel(config, ''), { provider: '', model: '' });
  assert.deepEqual(splitModel(config, undefined), { provider: '', model: '' });
  assert.deepEqual(splitModel(config, 'a/b/c'), { provider: 'a', model: 'b/c' }, 'only the first slash splits');
});

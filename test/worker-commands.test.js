import test from 'node:test';
import { statusText } from '../src/ui.js';
import assert from 'node:assert/strict';
import { PAIR_COMMANDS, pairCommandDescription, pairCompletions } from '../src/commands.js';
import { readWorkerTokens, workerListText } from '../src/worker-config.js';
import { dashboardMoreItems, dashboardItems } from '../src/ui.js';

const ids = ['worker', 'ds2'];
/** @param {string} prefix */
const values = prefix => pairCompletions(prefix, ids).map(item => item.value);

test('/pair worker is a registered command with a description and its four verbs', () => {
  assert.ok(PAIR_COMMANDS.includes('worker'));
  assert.match(pairCommandDescription(''), /worker/);
  assert.deepEqual(values('worker '), ['worker list', 'worker add', 'worker remove', 'worker default']);
  // Every verb describes itself, so the completion list explains what each does.
  for (const item of pairCompletions('worker ', ids)) assert.ok(item.description && item.description.length > 8, `${item.value} has a description`);
});

test('the worker-ID slot completes configured workers, and only where an ID is accepted', () => {
  assert.deepEqual(values('worker remove '), ['worker remove worker', 'worker remove ds2']);
  assert.deepEqual(values('worker remove d'), ['worker remove ds2']);
  assert.deepEqual(values('worker default d'), ['worker default ds2']);
  // 'worker list' and 'worker add' take no existing ID, so offering one would be wrong.
  assert.deepEqual(values('worker list '), []);
  assert.deepEqual(values('worker add '), []);
  assert.deepEqual(values('worker add fresh '), []);
});

test('after a complete worker ID, remove offers exactly the conversation choice', () => {
  assert.deepEqual(values('worker remove ds2 '), ['worker remove ds2 keep', 'worker remove ds2 discard']);
  assert.deepEqual(values('worker remove ds2 d'), ['worker remove ds2 discard']);
  assert.deepEqual(values('worker remove ds2 k'), ['worker remove ds2 keep']);
  const [keep, discard] = pairCompletions('worker remove ds2 ', ids);
  assert.match(keep.description, /Keep its conversation/);
  assert.match(discard.description, /Delete its session/);
  // An ID that is not configured gets no choice: there is nothing to choose about it.
  assert.deepEqual(values('worker remove nope '), []);
});

test('start and stop complete configured worker IDs', () => {
  assert.deepEqual(values('start '), ['start worker', 'start ds2']);
  assert.deepEqual(values('stop d'), ['stop ds2']);
});

test('workerListText shows every worker, marks the default and labels a never-started one', () => {
  const text = workerListText([
    { id: 'worker', model: 'opendesign/deepseek', effort: 'high', readOnly: false, status: 'ready' },
    { id: 'ds2', model: '/', effort: 'max', readOnly: true, status: 'not_started' },
  ]);
  assert.match(text, /★ worker \(default\)/, 'the first worker is marked as the default');
  assert.match(text, /opendesign\/deepseek, high/);
  assert.match(text, /· ds2/, 'every configured worker is listed');
  assert.match(text, /no model yet/, 'an unconfigured model is labelled, not blank');
  assert.match(text, /not started/, 'a never-started worker says so');
  assert.match(text, /read-only/);
  assert.ok(text.split('\n').every(line => line.length <= 60), 'the list fits 60 columns');
});

test('pair_status reads "not started" for a configured worker that never ran', () => {
  const summary = { ownerSession: 'test', ownerEpoch: 1, enabled: true, autoDeliverReports: true, waitingReports: 0, main: null,
    workers: [{ id: 'worker', model: 'p/m', effort: 'low', readOnly: false, status: 'ready', pid: 10, workspaceGit: true, task: null },
      { id: 'ds2', model: 'p/m', effort: 'low', readOnly: false, status: 'not_started', pid: null, workspaceGit: true, task: null }] };
  const text = statusText(summary, null, Date.now());
  assert.match(text, /## Worker · ds2/);
  assert.match(text, /State +· not started|State +.*not started/, text);
  // It is offered a way to start, not shown as broken: a model is chosen and the workspace is a repository.
  assert.match(text, /Next +\/pair start/);
  assert.match(text, /## Worker · worker/);
});

test('the More menu can add, remove and default a worker, matching /pair worker', () => {
  const summary = { ownerSession: 'test', ownerEpoch: 1, enabled: true, autoDeliverReports: true, waitingReports: 0, main: null,
    workers: [{ id: 'worker', model: 'p/m', effort: 'low', readOnly: false, status: 'ready', pid: 10, workspaceGit: true, task: null },
      { id: 'ds2', model: 'p/m', effort: 'low', readOnly: false, status: 'not_started', pid: null, workspaceGit: true, task: null }] };
  const more = dashboardMoreItems(summary);
  const actions = name => more.filter(item => item.action === name);
  assert.equal(actions('add-worker').length, 1, 'adding a worker is in the menu');
  // The default entry is useful only for a worker that is not already first.
  assert.deepEqual(actions('default-worker').map(item => item.workerId), ['ds2']);
  assert.deepEqual(actions('remove-worker').map(item => item.workerId), ['worker', 'ds2']);
  // Every worker keeps its own start and stop row in the main list, not only the first.
  const items = dashboardItems(summary);
  // 'worker' has a pid, so it gets stop; 'ds2' has none, so it gets start. Both rows exist for both workers.
  assert.deepEqual(items.filter(item => item.action === 'start').map(item => item.workerId), ['ds2']);
  assert.deepEqual(items.filter(item => item.action === 'stop').map(item => item.workerId), ['worker']);
});

test('workerListText explains how to add the first worker rather than showing an empty table', () => {
  assert.match(workerListText([]), /No workers are configured\./);
  assert.match(workerListText([]), /worker add/);
});

// The backend word and the effort word share tokens ('low' is both), so the CLI reading is worth pinning: it decides
test('a worker added from the CLI reads the backend and the effort apart, including the ambiguous "low"', () => {
  const spec = tokens => {
    const { positionals, backend } = readWorkerTokens(tokens);
    return { effort: positionals[1] || 'medium', backend, model: positionals[0] };
  };
  assert.deepEqual(spec(['p/m']), { effort: 'medium', backend: undefined, model: 'p/m' }, 'no backend given: the worker follows the project');
  // 'low' as the only word after the model keeps its old meaning. A worker added that way must not silently become a
  // low-backend worker at medium effort.
  assert.deepEqual(spec(['p/m', 'low']), { effort: 'low', backend: undefined, model: 'p/m' }, "'low' alone is still the effort, as it always was");
  assert.deepEqual(spec(['p/m', 'high']), { effort: 'high', backend: undefined, model: 'p/m' });
  assert.deepEqual(spec(['p/m', 'high', 'low']), { effort: 'high', backend: 'low', model: 'p/m' }, 'with the model and effort filled, the next word is the backend');
  assert.deepEqual(spec(['p/m', 'low', 'low']), { effort: 'low', backend: 'low', model: 'p/m' }, "'low low' is a low worker at low effort");
  // 'pi' is never an effort level, so it is always the backend, whatever position it is in.
  assert.deepEqual(spec(['p/m', 'pi']), { effort: 'medium', backend: 'pi', model: 'p/m' });
  assert.deepEqual(spec(['pi', 'p/m']), { effort: 'medium', backend: 'pi', model: 'p/m' }, 'the backend may come first too');
});

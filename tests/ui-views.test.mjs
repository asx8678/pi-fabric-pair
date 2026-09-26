// Offline coverage for the dashboard, report card, diff coloring and scrollable text view.
import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleWidth } from '@earendil-works/pi-tui';
import { createTextView, dashboardHeader, dashboardItems, diffLineColor, humanPatch, indicator, planWorker, reportCardLines, reportLineColor, taskListLines } from '../src/ui.js';

function view(lines, options = {}) {
  let closed = 0;
  const v = createTextView(lines, { title: 'T', rows: () => 13, close: () => { closed++; }, ...options }); // page = 13 - 8 = 5
  const body = (width = 60) => v.render(width).slice(3, -2);
  return { v, body, footer: (width = 60) => v.render(width).at(-1), closed: () => closed };
}
const numbered = n => Array.from({ length: n }, (_, i) => `line ${i + 1}`);

test('text view pages by terminal height and supports top/bottom and page keys', () => {
  const t = view(numbered(20));
  assert.deepEqual(t.body(), numbered(5));
  t.v.handleInput('\x1b[6~'); assert.equal(t.body()[0], 'line 6');
  t.v.handleInput('G'); assert.equal(t.body().at(-1), 'line 20');
  t.v.handleInput('j'); assert.equal(t.body().at(-1), 'line 20', 'scrolling stops at the end');
  t.v.handleInput('g'); assert.equal(t.body()[0], 'line 1');
  t.v.handleInput('\x1b[B'); assert.equal(t.body()[0], 'line 2');
  assert.match(t.footer(), /^2–6 \/ 20/);
  t.v.handleInput('q'); assert.equal(t.closed(), 1);
});

test('text view routes keys through the keybinding manager before raw fallbacks', () => {
  const keys = { matches: (data, id) => (data === 'X' && id === 'tui.select.down') || (data === 'Z' && id === 'tui.select.cancel') };
  const t = view(numbered(20), { keys });
  t.v.handleInput('X'); assert.equal(t.body()[0], 'line 2', 'a remapped down key scrolls');
  t.v.handleInput('Z'); assert.equal(t.closed(), 1, 'a remapped cancel key closes');
});

test('search jumps to matches, n/N move between them and wrap, misses are reported', () => {
  const t = view([...numbered(10), 'needle one', ...numbered(10), 'Needle two']);
  for (const key of ['/', 'n', 'e', 'e', 'd', 'l', 'e', '\r']) t.v.handleInput(key);
  assert.equal(t.body()[0], 'needle one');
  t.v.handleInput('n'); assert.ok(t.body().includes('Needle two'), 'search is case-insensitive');
  t.v.handleInput('n'); assert.equal(t.body()[0], 'needle one'); assert.match(t.footer(), /search wrapped/);
  t.v.handleInput('N'); assert.ok(t.body().includes('Needle two'));
  for (const key of ['/', 'z', 'z', '\x7f', 'q', '\r']) t.v.handleInput(key);
  assert.match(t.footer(), /not found: zq/, 'backspace edits the query');
  assert.equal(t.closed(), 0, 'keys typed into the search prompt never close the view');
});

test('[ and ] jump between diff files only when sections are enabled', () => {
  const patch = ['diff --git a/a b/a', ...numbered(8), 'diff --git a/b b/b', ...numbered(8)];
  const t = view(patch, { section: /^diff --git / });
  t.v.handleInput(']'); assert.equal(t.body()[0], 'diff --git a/b b/b');
  t.v.handleInput('['); assert.equal(t.body()[0], 'diff --git a/a b/a');
  const plain = view(patch); plain.v.handleInput(']'); assert.equal(plain.body()[0], 'diff --git a/a b/a');
});

test('wrapping measures display width, so wide characters never overflow', () => {
  const t = view(['漢'.repeat(60)]);
  for (const line of t.v.render(30)) assert.ok(visibleWidth(line) <= 30, `too wide: ${visibleWidth(line)}`);
});

test('diff lines are colored by role and the painter is applied', () => {
  assert.equal(diffLineColor('diff --git a/x b/x'), 'warning');
  assert.equal(diffLineColor('+++ b/x'), 'muted'); assert.equal(diffLineColor('--- a/x'), 'muted');
  assert.equal(diffLineColor('@@ -1 +1 @@'), 'accent');
  assert.equal(diffLineColor('+added'), 'success'); assert.equal(diffLineColor('-removed'), 'error');
  assert.equal(diffLineColor(' context'), null);
  const theme = { fg: (color, text) => `<${color}>${text}</>` };
  const t = view(['+x', ' y'], { theme, paint: diffLineColor });
  assert.deepEqual(t.v.render(60).slice(3, 5), ['<success>+x</>', ' y']);
});

const reportView = {
  workerId: 'worker', taskId: 't1', objective: 'Add login', taskStatus: 'review', step: 2, steps: 3, reportId: 'report-abc', kind: 'checkpoint',
  summary: 'Added the form\nWired validation', question: null, decisions: ['Used zod'], workerChecks: [{ name: 'unit', result: 'pass', detail: 'all green' }],
  checkpointHash: 'a'.repeat(64), changed: ['src/login.js', 'src/form.js'], patchTruncated: false,
  verification: [{ name: 'tests', passed: true, timedOut: false, code: 0 }, { name: 'lint', passed: false, timedOut: false, code: 2 }, { name: 'e2e', passed: false, timedOut: true, code: null }],
  acknowledged: false,
};

test('report card separates Pair-captured evidence from worker claims', () => {
  const lines = reportCardLines(reportView);
  assert.equal(lines[0], 'Checkpoint from worker · step 2/3 · report-abc');
  assert.ok(lines.includes('  Added the form') && lines.includes('  Wired validation'));
  assert.ok(lines.includes('Changed files (captured by Pair): 2'));
  assert.ok(lines.includes('  ✔ tests') && lines.includes('  ✖ lint (exit 2)') && lines.includes('  ✖ e2e (timed out)'));
  assert.ok(lines.includes('Worker-reported checks (claims, not verified)') && lines.includes('  ✔ unit — all green'));
  assert.equal(lines.at(-1), `Checkpoint ${'a'.repeat(12)} · not yet read by Main`);
  assert.equal(reportLineColor('  ✖ lint (exit 2)'), 'error'); assert.equal(reportLineColor('Summary'), 'accent'); assert.equal(reportLineColor('  plain'), null);
  const none = reportCardLines({ ...reportView, verification: [], workerChecks: [], decisions: [], kind: 'question', question: 'Which DB?' });
  assert.ok(none.includes('  none configured — no independent checks ran'));
  assert.ok(none.includes('Question for Main') && none.includes('  Which DB?'));
});

const worker = (id, status, task = null, extra = {}) => ({ id, status, model: 'p/m', effort: 'low', pid: null, sessionId: null, task, observation: null, ...extra });
const task = (status, stepList = [{ id: 's', title: 'Step', state: 'active' }]) => ({ id: 't', status, step: 1, steps: stepList.length, reportId: status === 'review' ? 'report-1' : null, reportedCost: 0.1234, stepList });

test('dashboard puts waiting reports first and offers only applicable lifecycle actions', () => {
  const review = dashboardItems({ waitingReports: 1, workers: [worker('worker', 'review', task('review'), { pid: 42, sessionId: 's' })] });
  assert.deepEqual(review.slice(0, 3).map(i => i.action), ['report', 'diff', 'yield']);
  assert.equal(review[0].label, 'Review checkpoint');
  assert.ok(!review.some(i => i.action === 'start'), 'a running worker is not offered Start');
  assert.ok(review.some(i => i.action === 'stop') && review.some(i => i.action === 'cancel'));
  const idle = dashboardItems({ waitingReports: 0, workers: [worker('worker', 'not_started')] }).map(i => i.action);
  assert.deepEqual(idle, ['start', 'restart', 'status', 'inbox', 'settings', 'reload', 'doctor', 'close']);
  const running = dashboardItems({ workers: [worker('worker', 'working', task('running'), { pid: 1, sessionId: 's' })] }).map(i => i.action);
  assert.ok(running.includes('pause') && running.includes('transcript') && !running.includes('resume'));
  const paused = dashboardItems({ workers: [worker('worker', 'paused', task('paused'), { pid: 1 })] }).map(i => i.action);
  assert.ok(paused.includes('resume') && !paused.includes('pause'));
  const two = dashboardItems({ workers: [worker('a', 'not_started'), worker('b', 'question', { ...task('question'), reportId: 'r' })] });
  assert.equal(two[0].label, 'Review question (b)'); assert.equal(two[0].workerId, 'b');
});

test('dashboard header summarizes each worker and waiting reports', () => {
  assert.equal(dashboardHeader({ waitingReports: 2, workers: [worker('worker', 'working', task('running'))] }), 'W ◉ working · step 1/1 · $0.12  |  2 reports waiting');
  assert.equal(dashboardHeader({ workers: [worker('a', 'not_started'), worker('b', 'ready')] }), 'W1 ○ not started  |  W2 ● ready');
});

test('the widget shows the plan of the active worker, labeled when there are several', () => {
  const done = task('completed', [{ id: 'x', title: 'Old', state: 'done' }]);
  const active = task('running', [{ id: 'y', title: 'New work', state: 'active' }]);
  const summary = { workers: [worker('a', 'ready', done), worker('b', 'working', active)] };
  assert.equal(planWorker(summary).id, 'b');
  assert.deepEqual(taskListLines(summary), ['▶ 1. New work']);
  assert.match(indicator(summary, false, undefined, 0), / W2 □ 0\/1$/);
  assert.match(indicator({ workers: [worker('w', 'working', active)] }, false, undefined, 0), /◉.* □ 0\/1$/, 'a single worker needs no plan label');
  assert.doesNotMatch(indicator({ workers: [worker('w', 'working', active)] }, false, undefined, 0), / W □/);
});

test('the human patch names real files and drops blob-store headers', () => {
  const stored = [
    '', '### "src/a.js" (file → file)',
    'diff --git a/state/blobs/aa/111 b/state/blobs/bb/222', 'index 111..222 100644',
    '--- a/state/blobs/aa/111', '+++ b/state/blobs/bb/222', '@@ -1 +1 @@', '-old', '+new',
    '', '### "img.png" (absent → file)', 'before: none', 'after: 333', 'Use pair_inspect(file) for immutable contents; symlink targets are shown as stored text and are not followed.',
    '', '### "gone.txt" (file → absent)', 'before: 444', 'after: none',
  ].join('\n');
  assert.deepEqual(humanPatch(stored, new Map([['img.png', null]])).split('\n'), [
    '### src/a.js (file → file)', '--- a/src/a.js', '+++ b/src/a.js', '@@ -1 +1 @@', '-old', '+new',
    '', '### img.png (absent → file)', '(binary or unreadable file; pair_inspect it for details)',
    '', '### gone.txt (file → absent)', 'before: 444', 'after: none',
  ]);
  assert.equal(diffLineColor('### src/a.js (file → file)'), 'warning', 'file headers stand out and anchor [ / ] jumps');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleWidth } from '@earendil-works/pi-tui';
import { STALE_AGE_MS, activityAge, ageLabel, indicator, indicatorWidget, progressBar, staleWorkers, stepColor, stepSymbol, taskListLines } from '../src/ui.js';

const wrap = { accent: 36, success: 32, warning: 33, error: 31, muted: 90, dim: 2 };
const theme = { fg: (color, text) => '\x1b[' + wrap[color] + 'm' + text + '\x1b[0m' };
const summary = (steps, extra = {}) => ({ workers: [{ id: 'worker', task: { stepList: steps, ...extra } }], main: null });

test('step symbol/color map covers every display state', () => {
  assert.equal(stepSymbol('done'), '✔');
  assert.equal(stepSymbol('active'), '▶');
  assert.equal(stepSymbol('review'), '◐');
  assert.equal(stepSymbol('held'), '⏸');
  assert.equal(stepSymbol('todo'), '○');
  assert.deepEqual([stepColor('done'), stepColor('active'), stepColor('review'), stepColor('held'), stepColor('todo')], ['success', 'accent', 'warning', 'warning', 'dim']);
});

test('taskListLines renders per-step states and stays empty without a plan', () => {
  assert.deepEqual(taskListLines({ workers: [{ id: 'worker', task: null }], main: null }), []);
  const s = summary([
    { id: 's1', title: 'Create marker', state: 'done' },
    { id: 's2', title: 'Harden bridge', state: 'active' },
    { id: 's3', title: 'Wire UI', state: 'todo' },
  ]);
  const lines = taskListLines(s);
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes('✔ 1. Create marker'));
  assert.ok(lines[1].includes('▶ 2. Harden bridge'));
  assert.ok(lines[2].includes('○ 3. Wire UI'));
});

test('long plans collapse past the widget cap with a +N more line', () => {
  const steps = Array.from({ length: 10 }, (_, i) => ({ id: 's' + i, title: 'Step ' + i, state: 'todo' }));
  const lines = taskListLines(summary(steps), null, 7);
  assert.equal(lines.length, 8);
  assert.ok(lines[lines.length - 1].includes('+ 3 more'));
});

test('widget renders the activity line plus painted steps, truncating to width', () => {
  const s = summary([
    { id: 's1', title: 'A very long step title that will not fit into a narrow status bar at all', state: 'active' },
  ], { step: 1, steps: 1, status: 'running' });
  const widget = indicatorWidget(s, true, theme);
  const lines = widget.render(40);
  assert.equal(lines.length, 2, 'widget must show the head line and the step line');
  assert.ok(lines[0].includes('M◉'));
  assert.ok(lines[1].includes('▶ 1.'));
  assert.ok(lines[1].includes('\x1b[36m'), 'the active step must be painted with the accent color');
  for (const line of lines) assert.ok(visibleWidth(line) <= 40, 'widget lines must not exceed the render width');
  widget.invalidate();
});

test('progressBar counts approved steps and scales long plans', () => {
  assert.deepEqual(progressBar(2, 5), { filled: 2, empty: 3, label: '2/5', percent: 40 });
  assert.deepEqual(progressBar(7, 14), { filled: 5, empty: 5, label: '7/14', percent: 50 });
  assert.deepEqual(progressBar(5, 5), { filled: 5, empty: 0, label: '5/5', percent: 100 });
  assert.deepEqual(progressBar(0, 1), { filled: 0, empty: 1, label: '0/1', percent: 0 });
  assert.deepEqual(progressBar(0, 0), { filled: 0, empty: 1, label: '0/0', percent: 0 });
});

test('activity age derives from observation and exchange timestamps', () => {
  assert.equal(activityAge({ observation: { at: 15 }, lastExchange: { at: 10 } }, 20), 5, 'the newest observation wins');
  assert.equal(activityAge({ observation: { at: 5 }, lastExchange: null }, 20), 15);
  assert.equal(activityAge({ observation: null, lastExchange: null }, 20), 0, 'no events yet must read as fresh, not stale');
});

test('ageLabel formats seconds then minutes', () => {
  assert.equal(ageLabel(0), '0s');
  assert.equal(ageLabel(42000), '42s');
  assert.equal(ageLabel(65000), '1m 5s');
});

test('working worker shows a live age badge with heartbeat blink and stale marker', () => {
  const working = (at) => ({ workers: [{ id: 'worker', status: 'working', observation: { at } }], main: null });
  const oddPhase = indicator(working(1000), false, theme, 3000);
  assert.ok(oddPhase.includes('\x1b[2mW◉'), 'odd heartbeat phase dims the working dot');
  const evenPhase = indicator(working(1000), false, theme, 1000);
  assert.ok(evenPhase.includes('\x1b[32mW◉'), 'even phase keeps the state color');
  assert.ok(evenPhase.includes('\x1b[90m0s'), 'fresh badge is muted and counts from zero');
  const quiet = indicator(working(1000), false, theme, 200000);
  assert.ok(quiet.includes('\x1b[33m'), 'silence past the pulse window turns warning');
  assert.ok(!quiet.includes('stale'));
  const stale = indicator(working(1000), false, theme, 400000);
  assert.ok(stale.includes('stale') && stale.includes('\x1b[31m'), 'hard silence becomes an error-colored stale marker');
  const idle = indicator({ workers: [{ id: 'worker', status: 'ready' }], main: null }, false, theme, 400000);
  assert.ok(!idle.includes('stale'), 'no liveness badge without active work');
});

test('active worker badges show the running tool, task cost and context pressure', () => {
  const mk = (observation, reportedCost) => ({ workers: [{ id: 'worker', status: 'working', observation, task: { reportedCost } }], main: null });
  const withTool = indicator(mk({ at: 1000, currentTool: 'fabric_exec' }, 0), false, theme, 1000);
  assert.ok(withTool.includes('fabric_exec'), 'the running tool is shown');
  const withCost = indicator(mk({ at: 1000 }, 0.0117), false, theme, 1000);
  assert.ok(withCost.includes('$0.0117'), 'task cost is shown');
  const warm = indicator(mk({ at: 1000, context: { percent: 78.4 } }, 0), false, theme, 1000);
  assert.ok(warm.includes('ctx 78%') && warm.includes('\x1b[33m'), 'context pressure warns above 75%');
  const hot = indicator(mk({ at: 1000, context: { percent: 95 } }, 0), false, theme, 1000);
  assert.ok(hot.includes('ctx 95%') && hot.includes('\x1b[31m'), 'context pressure errors above 90%');
  const cool = indicator(mk({ at: 1000, context: { percent: 42 } }, 0), false, theme, 1000);
  assert.ok(!cool.includes('ctx'), 'no pressure badge below 75%');
  const zeroCost = indicator(mk({ at: 1000 }, 0), false, theme, 1000);
  assert.ok(!zeroCost.includes('$'), 'zero cost is not shown');
});

test('staleWorkers lists only silent active workers for one-shot alerting', () => {
  const summary = { workers: [
    { id: 'a', status: 'working', observation: { at: 1000 } },
    { id: 'b', status: 'ready', observation: { at: 1000 } },
    { id: 'c', status: 'working', observation: { at: 400000 } },
  ], main: null };
  const stale = staleWorkers(summary, 500000);
  assert.deepEqual(stale.map(worker => worker.id), ['a'], 'fresh or inactive workers never count');
  assert.ok(stale[0].ageMs >= STALE_AGE_MS);
  assert.deepEqual(staleWorkers({ workers: [{ id: 'd', status: 'working' }], main: null }, 500000), [], 'no events yet reads as fresh, never stale');
});

test('indicator appends the painted progress bar only while a plan exists', () => {
  const withTask = summary([
    { id: 's1', title: 'One', state: 'done' },
    { id: 's2', title: 'Two', state: 'active' },
  ], { step: 2, steps: 2, status: 'running' });
  const plain = indicator(withTask, false);
  assert.ok(plain.includes('■□ 1/2'), 'bar plus approved count must follow the worker token');
  const painted = indicator(withTask, false, theme);
  assert.ok(painted.includes('\x1b[32m■'), 'filled cells use the success color');
  const idle = indicator({ workers: [{ id: 'worker', status: 'ready', task: null }], main: null }, false, theme);
  assert.ok(!idle.includes('■'), 'no bar without an active plan');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { visibleWidth } from '@earendil-works/pi-tui';
import { createDashboard, createFollowView, dashboardAction, dashboardKeys, dashboardLines, dashboardMoreKeys, dashboardView } from '../src/ui.js';

const NOW = 1_700_000_000_000;
const strip = (/** @type {string} */ text) => text.replace(/\u001b\[[0-9;]*m/g, '');
const step = (/** @type {string} */ title, /** @type {string} */ state) => ({ id: title, title, state });
/** @param {object} [over] @returns {any} */
function task(over = {}) {
  return { id: 'task-1', objective: 'Add retry and backoff to the fetch client', status: 'running', step: 2, steps: 3, reportedCost: 0.14,
    startedAt: NOW - 192000, stepRevisions: 1, limitNotice: null, checkpointHash: null, updatedAt: NOW - 1000, lastVerification: [],
    limits: { maxRevisions: 20, maxRevisionsPerStep: 3, maxReportedCostUsd: 2, maxOutputTokens: null },
    stepList: [step('Add retry policy type', 'done'), step('Wire retries into fetch client', 'active'), step('Tests for backoff', 'todo')], ...over };
}
/** @param {object} [over] @returns {any} */
function worker(over = {}) {
  return { id: 'w1', model: 'anthropic/claude-opus', effort: 'high', status: 'working', pid: 42, sessionId: 'session-1', task: task(),
    observation: { at: NOW - 5000, currentTool: 'edit', currentTarget: 'src/http/client.js', context: { tokens: 82000, contextWindow: 200000, percent: 41 } }, ...over };
}
/** @param {object} [over] @returns {any} */
function summary(over = {}) {
  return { ownerSession: 'session-1', ownerEpoch: 1, directory: '/tmp/pair', enabled: true, autoDeliverReports: true, settingsPending: false,
    main: { model: 'provider/model', busy: false }, mainPhase: null, waitingReports: 0, workers: [worker()], cacheNote: '', ...over };
}
const plain = (/** @type {string[]} */ lines) => lines.map(strip).join('\n');

const CASES = {
  'working': summary(),
  'review with failed verification': summary({ workers: [worker({ status: 'review', task: task({ status: 'review', reportId: 'report-1', checkpointHash: 'abcdef012345', lastVerification: [{ name: 'typecheck', passed: true, timedOut: false, code: 0 }, { name: 'test', passed: false, timedOut: false, code: 1 }] }) })] }),
  'no task': summary({ workers: [worker({ task: null, status: 'ready' })] }),
  'several workers': summary({ workers: [worker(), worker({ id: 'w2', status: 'ready', task: null })] }),
  'paused': summary({ workers: [worker({ status: 'paused', task: task({ status: 'paused' }) })] }),
  'off': summary({ enabled: false, workers: [worker({ status: 'stopped', task: null, pid: null })] }),
  'no worker': summary({ workers: [] }),
  'waiting reports': summary({ autoDeliverReports: false, waitingReports: 2, workers: [worker({ status: 'review', task: task({ status: 'review', reportId: 'r' }) })] }),
};

test('the dashboard never renders wider than the width it is given', () => {
  for (const [name, s] of Object.entries(CASES)) {
    for (const width of [20, 40, 60, 100, 160]) {
      for (const line of dashboardLines(s, width, NOW)) {
        assert.ok(visibleWidth(strip(line)) <= width, name + ' at ' + width + ': ' + JSON.stringify(strip(line)));
      }
    }
  }
  assert.deepEqual(dashboardLines(CASES.working, 0, NOW), []);
});

test('a working dashboard shows the model, the state, the plan and the current step', () => {
  const lines = dashboardLines(CASES.working, 100, NOW);
  const text = plain(lines);
  assert.ok(text.includes('Pair'), text);
  assert.ok(text.includes('claude-opus'), text);
  assert.ok(text.includes('high'), text);
  assert.ok(text.includes('◉'), 'the shared classifier icon', text);
  assert.ok(text.includes('3m12s'), 'elapsed time', text);
  assert.ok(text.includes('$0.14'), 'reported cost', text);
  assert.ok(text.includes('ctx 41%'), 'context', text);
  assert.ok(text.includes('step 2/3'), text);
  assert.ok(text.includes('Add retry and backoff to the fetch client'), 'objective', text);
  assert.ok(text.includes('✔ 1 Add retry policy type'), text);
  assert.ok(text.includes('▶ 2 Wire retries into fetch client'), text);
  assert.ok(text.includes('editing src/http/client.js'), 'the dashboard keeps full paths', text);
  assert.ok(text.includes('rev 1/3'), text);
  assert.ok(text.includes('○ 3 Tests for backoff'), text);
  assert.ok(/✔ 1 .*approved/.test(text), 'finished steps are marked approved', text);
  // Only applicable keys are offered.
  assert.ok(text.includes('t transcript'), text);
  assert.ok(text.includes('p pause'), text);
  assert.ok(text.includes('c cancel'), text);
  assert.ok(text.includes('s settings'), text);
  assert.ok(text.includes('m more'), text);
  assert.ok(text.includes('? help'), text);
  assert.equal(text.includes('r report'), false, 'no report is waiting, so r must not appear');
});

test('a review with failed verification shows Pair verified and no pause key', () => {
  const s = CASES['review with failed verification'], text = plain(dashboardLines(s, 100, NOW));
  assert.ok(text.includes('◐'), text);
  assert.ok(text.includes('Last checkpoint'), text);
  assert.ok(text.includes('Pair verified'), text);
  assert.ok(text.includes('✔ typecheck'), text);
  assert.ok(text.includes('✖ test'), text);
  assert.ok(text.includes('Pair verification failed: test'), 'the alert is repeated', text);
  assert.ok(text.includes('r report') && text.includes('d diff'), text);
  assert.equal(text.includes('p pause'), false, 'a task in review cannot be paused');
  assert.ok(text.includes('c cancel'), text);
});

test('the dashboard without a task is a readiness screen', () => {
  const ready = plain(dashboardLines(CASES['no task'], 100, NOW));
  assert.ok(ready.includes('● ready'), ready);
  assert.ok(ready.includes('ready for the next task'), ready);
  assert.equal(ready.includes('Start the worker'), false);
  const stopped = summary({ workers: [worker({ task: null, status: 'stopped', pid: null, observation: null })] });
  const text = plain(dashboardLines(stopped, 100, NOW));
  assert.ok(text.includes('not running'), text);
  assert.ok(text.includes('Press n to start the worker.'), text);
  assert.ok(text.includes('n start'), text);
  const off = plain(dashboardLines(CASES.off, 100, NOW));
  assert.ok(off.includes('Pair is off'), off);
  assert.ok(off.includes('○ off'), off);
  const unset = summary({ workers: [worker({ task: null, status: 'stopped', pid: null, model: '' })] });
  const unsetText = plain(dashboardLines(unset, 100, NOW));
  assert.ok(unsetText.includes('No worker model is chosen yet.'), unsetText);
  assert.ok(unsetText.includes('Press s to choose the worker model.'), unsetText);
  assert.ok(unsetText.includes('○ set up'), unsetText);
});

test('several workers name the worker in the header', () => {
  const text = plain(dashboardLines(CASES['several workers'], 100, NOW));
  assert.ok(text.startsWith('Pair · w1'), text);
  assert.ok(text.includes('t transcript'), text);
});

test('the keys follow the state, so a key is only offered when it applies', () => {
  const running = dashboardKeys(CASES.working).map(item => item.key);
  assert.deepEqual(running, ['t', 'p', 'c', 's', 'm', '?']);
  const review = dashboardKeys(CASES['review with failed verification']).map(item => item.key);
  assert.deepEqual(review, ['r', 'd', 't', 'c', 's', 'm', '?']);
  // Without a worker the settings key stays; more and help are always reachable.
  assert.deepEqual(dashboardKeys(CASES['no worker']).map(item => item.key), ['s', 'm', '?']);
  const paused = dashboardKeys(CASES.paused).map(item => item.key);
  assert.ok(paused.includes('p'), paused.join(','));
  assert.equal(dashboardAction('p', CASES.paused), 'resume', 'p resumes a held task');
  assert.equal(dashboardAction('p', CASES.working), 'pause', 'p pauses a running task');
  // Keys that do not apply return null instead of acting.
  assert.equal(dashboardAction('p', CASES['no task']), null);
  assert.equal(dashboardAction('r', CASES.working), null);
  assert.equal(dashboardAction('d', CASES.working), null);
  assert.equal(dashboardAction('y', CASES.working), null);
  assert.equal(dashboardAction('y', CASES['waiting reports']), 'yield');
  // Close always works.
  assert.equal(dashboardAction('q', CASES.working), 'close');
  assert.equal(dashboardAction('\u001b', CASES.working), 'close');
  // More and help are reachable from every state.
  for (const s of Object.values(CASES)) {
    assert.equal(dashboardAction('m', s), 'more');
    assert.equal(dashboardAction('?', s), 'help');
  }
  // The "more" row replaces the main hints.
  const more = plain(dashboardLines(CASES.working, 100, NOW, { more: true }));
  assert.ok(more.includes('r restart worker'), more);
  assert.ok(more.includes('l reload settings'), more);
  assert.ok(more.includes('d doctor'), more);
  assert.equal(more.includes('c cancel'), false, more);
  assert.deepEqual(dashboardMoreKeys().map(item => item.action), ['restart', 'status', 'inbox', 'reload', 'doctor', 'help']);
});

test('a notice is shown under the state and does not break the layout', () => {
  const text = plain(dashboardLines(CASES.working, 60, NOW, { notice: 'Paused worker w1.' }));
  assert.ok(text.includes('Paused worker w1.'), text);
  for (const line of dashboardLines(CASES.working, 60, NOW, { notice: 'x'.repeat(200) })) assert.ok(visibleWidth(strip(line)) <= 60);
});

/** A fake controller: the component only needs summary(), on('change') and off('change'). */
function fakeController(initial) {
  const events = new EventEmitter();
  let current = initial;
  return {
    events,
    listenerCount: () => events.listenerCount('change'),
    summary: () => current,
    on: events.on.bind(events),
    off: events.off.bind(events),
    set(next) { current = next; events.emit('change', next); },
  };
}

test('the open dashboard subscribes to the controller and releases it on close', () => {
  const controller = fakeController(CASES.working);
  const view = createDashboard(controller, { now: () => NOW, tickMs: 1_000_000 });
  assert.equal(controller.listenerCount(), 1, 'one listener while open');
  assert.equal(view.subscribed, true);
  assert.ok(plain(view.render(100)).includes('Wire retries'), 'renders the current summary');
  // A controller change updates the screen in place: no reopen, no new listener.
  controller.set(CASES['review with failed verification']);
  assert.ok(plain(view.render(100)).includes('r report'), 'the render follows the change event');
  assert.equal(controller.listenerCount(), 1, 'still exactly one listener');
  // esc closes and releases.
  assert.deepEqual(view.handleInput('\u001b'), []);
  assert.equal(view.closed, true);
  assert.equal(view.subscribed, false);
  assert.equal(controller.listenerCount(), 0, 'no listener after close');
  // A late change cannot reach a closed view.
  controller.set(CASES['no task']);
  assert.equal(controller.listenerCount(), 0);
});

test('disposing the dashboard clears its timer and listener', async () => {
  const controller = fakeController(CASES.working);
  const view = createDashboard(controller, { now: () => NOW, tickMs: 5 });
  assert.equal(controller.listenerCount(), 1);
  view.dispose();
  assert.equal(controller.listenerCount(), 0);
  assert.equal(view.subscribed, false);
  // Disposing twice is harmless.
  view.dispose();
  assert.equal(controller.listenerCount(), 0);
});

test('a chosen action is returned for main.js to run, and the view unsubscribes', () => {
  const controller = fakeController(CASES['review with failed verification']);
  const view = createDashboard(controller, { now: () => NOW, tickMs: 1_000_000 });
  let closedWith = 'unset';
  view.attach(/** @param {unknown} value */ value => { closedWith = value; });
  assert.deepEqual(view.handleInput('r'), ['report']);
  assert.deepEqual(view.handleInput('d'), ['diff']);
  assert.deepEqual(view.handleInput('p'), [], 'pause does not apply, so nothing happens');
  assert.equal(closedWith, 'unset', 'the view stays open for a read-only action');
  assert.deepEqual(view.handleInput('c'), ['cancel']);
  // m and ? open their rows without leaving.
  assert.deepEqual(view.handleInput('m'), []);
  assert.equal(view.more, true);
  assert.deepEqual(view.handleInput('l'), ['reload']);
  assert.equal(view.more, false);
  assert.deepEqual(view.handleInput('?'), []);
  assert.equal(view.help, true);
  assert.deepEqual(view.handleInput('?'), []);
  assert.equal(view.help, false);
  // q closes through the attached callback.
  view.handleInput('q');
  assert.equal(closedWith, undefined);
  assert.equal(controller.listenerCount(), 0);
});

test('the help row lists every key, including the more actions', () => {
  const text = plain(dashboardLines(CASES['review with failed verification'], 140, NOW, { help: true }));
  // The hint row wraps, so a pair can straddle a line break; assert on the words instead.
  for (const key of ['r report', 'd diff', 't transcript', 'c cancel', 's settings', 'm more', '? help', 'restart worker', 'reload', 'doctor']) {
    assert.ok(text.includes(key), 'help should mention ' + key + ': ' + text);
  }
});

test('follow mode refreshes, pins to the bottom and unpins when scrolled up', async () => {
  let content = Array.from({ length: 40 }, (_, index) => 'line ' + index).join('\n');
  /** @type {number[]} */
  const reads = [];
  const source = { read: async () => { reads.push(1); return content; } };
  // A real timer, so the refresh path is exercised; a defensive guard keeps the tick small.
  const view = createFollowView(source, { tickMs: 5 });
  await new Promise(resolve => setTimeout(resolve, 15));
  const first = view.render(40);
  assert.ok(first.length > 0);
  assert.ok(plain(first).includes('line 39'), 'pinned to the newest lines: ' + plain(first));
  // Scrolling up unpins, so new content no longer jumps.
  view.handleInput('k');
  assert.equal(view.pinned, false);
  content += '\nline 40';
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(view.pinned, false, 'a refresh never re-pins a scrolled-up view');
  assert.ok(!plain(view.render(40)).includes('line 40'), 'a scrolled-up view stays where it is: ' + plain(view.render(40)));
  // G repins to the bottom and the next refresh keeps it there.
  view.handleInput('G');
  assert.equal(view.pinned, true);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.ok(plain(view.render(40)).includes('line 40'), 'a repinned view follows new lines');
  const readsWhileOpen = reads.length;
  assert.ok(readsWhileOpen >= 2, 'the timer refreshed the transcript');
  view.dispose();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(reads.length, readsWhileOpen, 'no refresh after dispose');
  view.dispose();
});

test('the overlay is registered with overlay options and releases on dispose or action', async () => {
  /** @type {any} */
  let captured = null;
  const ctx = { mode: 'tui', ui: { custom(/** @type {any} */ factory, /** @type {any} */ options) { captured = { component: factory({ requestRender() {} }, null, null, (/** @type {unknown} */ value) => { captured.done = value; }), options }; return Promise.resolve('resolved'); } } };
  const controller = fakeController(CASES.working);
  await dashboardView(ctx, controller, {});
  assert.equal(captured.options.overlay, true, 'the dashboard is an overlay');
  const options = captured.options.overlayOptions();
  assert.equal(options.width, '90%');
  assert.equal(options.anchor, 'center');
  assert.equal(options.maxHeight, '80%');
  assert.ok(captured.component.render(100).length > 3);
  assert.equal(controller.listenerCount(), 1);
  // Pi discarding the view must release the subscription.
  captured.component.dispose();
  assert.equal(controller.listenerCount(), 0);
  // A chosen action is handed to Pi's done() and also releases the subscription.
  const second = fakeController(CASES['review with failed verification']);
  await dashboardView(ctx, second, {});
  captured.component.handleInput('t');
  assert.deepEqual(captured.done, { action: 'transcript', workerId: 'w1' }, 'the choice names the worker it was made for');
  assert.equal(second.listenerCount(), 0);
  // Outside a TUI the dashboard declines, so callers keep their select-based fallback.
  assert.equal(await dashboardView({ mode: 'rpc', ui: {} }, second, {}), undefined);
});

/**
 * A fake ctx.ui.custom: keeps the component and records every done() call, so a close that never reaches
 * Pi shows up as an empty list.
 * @param {{columns?: number, rows?: number}} [terminal]
 */
function overlayHost(terminal) {
  /** @type {{component: any, options: any, done: unknown[], frames: number}} */
  const host = { component: null, options: null, done: [], frames: 0 };
  const ctx = { mode: 'tui', ui: { custom(/** @type {any} */ factory, /** @type {any} */ options) {
    host.component = factory({ terminal, requestRender() { host.frames++; } }, null, null, (/** @type {unknown} */ value) => { host.done.push(value); });
    host.options = options;
    return Promise.resolve(undefined);
  } } };
  return { host, ctx: /** @type {any} */ (ctx) };
}

test('q and esc close the dashboard overlay, in every keyboard encoding', async () => {
  for (const key of ['q', '\u001b', '\u001b[27u']) {
    assert.equal(dashboardAction(key, CASES.working), 'close', JSON.stringify(key));
    const { host, ctx } = overlayHost();
    const controller = fakeController(CASES.working);
    await dashboardView(ctx, controller, {});
    host.component.handleInput(key);
    assert.deepEqual(host.done, [undefined], `${JSON.stringify(key)} must close the overlay, not leave a dead screen`);
    assert.equal(controller.listenerCount(), 0);
  }
  // A rebound cancel key closes too.
  const keys = { matches: (/** @type {string} */ data, /** @type {string} */ id) => id === 'tui.select.cancel' && data === 'Z' };
  assert.equal(dashboardAction('Z', CASES.working, undefined, keys), 'close');
});

test('the overlay fits the terminal: a readable width and never taller than Pi allows', async () => {
  const titles = ['Add retry policy type', 'Thread the policy through', 'Classify retryable errors', 'Wire retries into fetch client', 'Jitter', 'Tests for backoff', 'Tests for jitter', 'Docs', 'Changelog', 'Metrics', 'Logging', 'Cleanup'];
  const tall = summary({ workers: [worker({ task: task({ step: 4, steps: 12, stepList: titles.map((title, index) => step(title, index < 3 ? 'done' : index === 3 ? 'active' : 'todo')) }) })] });
  const { host, ctx } = overlayHost({ columns: 200, rows: 20 });
  await dashboardView(ctx, fakeController(tall), {});
  const options = host.options.overlayOptions();
  assert.equal(options.width, 102, 'the frame plus a 100-column body on a wide terminal');
  assert.equal(options.maxHeight, '80%');
  const lines = host.component.render(options.width);
  assert.ok(lines.length <= 16, `20 rows leave 16 for the overlay, got ${lines.length}`);
  assert.ok(strip(lines.at(-2)).includes('? help'), 'the keys survive: ' + strip(lines.at(-2)));
  assert.ok(lines.every((/** @type {string} */ line) => visibleWidth(strip(line)) <= options.width));
  host.component.dispose();
  const narrow = overlayHost({ columns: 80, rows: 40 });
  await dashboardView(narrow.ctx, fakeController(tall), {});
  assert.equal(narrow.host.options.overlayOptions().width, 72);
  narrow.host.component.dispose();
});

test('a tall plan sheds detail in order and always keeps the keys', () => {
  const titles = ['Add retry policy type', 'Thread the policy through', 'Classify retryable errors', 'Wire retries into fetch client', 'Jitter', 'Tests for backoff', 'Tests for jitter', 'Docs', 'Changelog', 'Metrics', 'Logging', 'Cleanup'];
  const timeline = [
    { type: 'decision', step: 1, action: 'revise', feedback: 'use exponential backoff', at: NOW - 90000 },
    { type: 'decision', step: 1, action: 'approve', feedback: '', at: NOW - 80000 },
    { type: 'decision', step: 4, action: 'revise', feedback: 'cap the delay', at: NOW - 10000 },
  ];
  const recentActivity = [{ at: NOW - 3000, tool: 'read', target: 'src/a.js' }, { at: NOW - 2000, tool: 'edit', target: 'src/b.js' }, { at: NOW - 1000, tool: 'bash', target: 'npm test' }];
  const tall = summary({ workers: [worker({ recentActivity, task: task({ step: 4, steps: 12, timeline, stepList: titles.map((title, index) => step(title, index < 3 ? 'done' : index === 3 ? 'active' : 'todo')) }) })] });
  const full = plain(dashboardLines(tall, 100, NOW)).split('\n');
  for (const part of ['Recent activity', 'use exponential backoff', 'cap the delay', 'Add retry policy type', 'Cleanup']) assert.ok(full.some(line => line.includes(part)), part);
  /** @type {Set<string>} */
  const stages = new Set();
  for (let max = full.length; max >= 6; max--) {
    const lines = dashboardLines(tall, 100, NOW, { maxRows: max }).map(strip), text = lines.join('\n');
    assert.ok(lines.length <= max, `${max} rows rendered ${lines.length}`);
    assert.ok(lines.at(-1)?.includes('? help'), `${max} rows lost the keys:\n${text}`);
    if (max >= 10) assert.ok(text.includes('▶ 4 Wire retries into fetch client'), `${max} rows lost the current step:\n${text}`);
    if (!text.includes('Recent activity') && text.includes('use exponential backoff')) stages.add('no activity');
    if (text.includes('cap the delay') && !text.includes('use exponential backoff')) stages.add('current step history');
    if (!text.includes('cap the delay') && text.includes('Add retry policy type')) stages.add('no history');
    if (text.includes('✔ 1–3 approved') && !text.includes('Add retry policy type') && text.includes('Cleanup')) stages.add('folded');
    if (/… \d+ more steps?/.test(text)) stages.add('cut');
  }
  assert.deepEqual([...stages], ['no activity', 'current step history', 'no history', 'folded', 'cut']);
});

test('the open dashboard asks Pi for a frame on every change and on its timer', async () => {
  const controller = fakeController(CASES.working);
  let frames = 0;
  const view = createDashboard(controller, { now: () => NOW, tickMs: 5, onChange: () => { frames++; } });
  controller.set(CASES['review with failed verification']);
  assert.equal(frames, 1, 'a change asks for a frame at once');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.ok(frames >= 2, `the timer keeps the clock moving (${frames})`);
  view.dispose();
  const after = frames;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(frames, after, 'no frame after dispose');
  // A failing repaint request never breaks the listener.
  const quiet = createDashboard(controller, { now: () => NOW, tickMs: 1_000_000, onChange: () => { throw new Error('no frame'); } });
  assert.doesNotThrow(() => controller.set(CASES.working));
  quiet.dispose();
});

test('w shows the next worker, and the choice names the worker it was made for', async () => {
  const s = CASES['several workers'];
  assert.deepEqual(dashboardKeys(s).map(item => item.key), ['t', 'p', 'c', 'w', 's', 'm', '?']);
  const view = createDashboard(fakeController(s), { now: () => NOW, tickMs: 1_000_000 });
  assert.equal(view.workerId, 'w1');
  assert.deepEqual(view.handleInput('w'), []);
  assert.equal(view.workerId, 'w2');
  assert.ok(plain(view.render(100)).includes('Pair · w2'), plain(view.render(100)));
  assert.deepEqual(view.handleInput('p'), [], 'w2 has no task, so p does nothing');
  view.handleInput('w');
  assert.equal(view.workerId, 'w1', 'w wraps around');
  view.dispose();
  const { host, ctx } = overlayHost();
  await dashboardView(ctx, fakeController(s), {});
  host.component.handleInput('w');
  host.component.handleInput('t');
  assert.deepEqual(host.done, [{ action: 'transcript', workerId: 'w2' }]);
});

test('More offers stop while the worker runs, status and inbox, and esc steps back', () => {
  assert.deepEqual(dashboardMoreKeys(CASES.working).map(item => item.key), ['r', 'x', 'i', 'b', 'l', 'd', '?']);
  const stopped = summary({ workers: [worker({ task: null, status: 'stopped', pid: null })] });
  assert.deepEqual(dashboardMoreKeys(stopped).map(item => item.action), ['restart', 'status', 'inbox', 'reload', 'doctor', 'help']);
  const view = createDashboard(fakeController(CASES.working), { now: () => NOW, tickMs: 1_000_000 });
  for (const [key, action] of [['x', 'stop'], ['i', 'status'], ['b', 'inbox']]) {
    view.handleInput('m');
    assert.deepEqual(view.handleInput(key), [action]);
    assert.equal(view.more, false, 'an action leaves More');
  }
  view.handleInput('m');
  assert.deepEqual(view.handleInput('t'), [], 'a key of the main row does nothing in More');
  assert.equal(view.more, true);
  view.handleInput('\u001b[27u');
  assert.equal(view.more, false, 'esc steps back to the dashboard');
  assert.equal(view.closed, false, 'and does not close it');
  view.handleInput('m');
  view.handleInput('?');
  assert.equal(view.help, true, '? in More opens the help list');
  view.handleInput('m');
  assert.equal(view.help, false);
  view.dispose();
  const idle = createDashboard(fakeController(stopped), { now: () => NOW, tickMs: 1_000_000 });
  idle.handleInput('m');
  assert.deepEqual(idle.handleInput('x'), [], 'no process, so nothing to stop');
  idle.dispose();
});

test('help lists one key per line with what it does', () => {
  const lines = dashboardLines(CASES.working, 100, NOW, { help: true }).map(strip), text = lines.join('\n');
  assert.ok(lines.some(line => line.trim() === 'Keys'), text);
  assert.ok(lines.some(line => line.trim() === 'More (press m, then the key)'), text);
  const line = (/** @type {string} */ start) => lines.find(item => item.trimStart().startsWith(start + ' ')) ?? '';
  assert.ok(line('p pause').includes('stop the current step and hold the task'), text);
  assert.ok(line('x stop worker').includes('the conversation is kept'), text);
  assert.ok(line('esc close').includes('q too'), text);
  assert.equal(line('p pause').indexOf('stop the current'), line('t transcript').indexOf("follow the worker's"), 'descriptions share one column');
  assert.equal(text.includes('Wire retries'), false, 'the list replaces the plan');
  assert.equal(lines.at(-1)?.trim(), 'esc back');
  for (const item of lines) assert.ok(visibleWidth(item) <= 100);
  // A narrow overlay wraps a description under its column instead of cutting it off.
  const narrow = dashboardLines(CASES.working, 50, NOW, { help: true }).map(strip);
  assert.equal(narrow.slice(narrow.findIndex(item => item.trim() === 'Keys')).some(item => item.includes('…')), false, narrow.join('\n'));
  const at = narrow.findIndex(item => item.trimStart().startsWith('c cancel '));
  const column = narrow[at].indexOf('end the task');
  assert.match(narrow[at + 1], new RegExp(`^ {${column}}\\S`), 'the rest of the description hangs under its first word');
  for (const item of narrow) assert.ok(visibleWidth(item) <= 50, JSON.stringify(item));
});

test('o switches the transcript between one line per call and full output', async () => {
  /** @type {boolean[]} */
  const asked = [];
  const source = { read: async (/** @type {{full?: boolean}} */ options = {}) => { asked.push(options.full === true); return options.full ? 'every output line' : 'one line per call'; } };
  let updates = 0;
  const view = createFollowView(source, { tickMs: 1_000_000, onUpdate: () => { updates++; } });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(asked, [false]);
  assert.equal(updates, 1, 'a loaded transcript asks for a frame');
  let text = plain(view.render(80));
  assert.ok(text.includes('one line per call') && text.includes('following · one line per tool call'), text);
  view.handleInput('o');
  assert.equal(view.full, true);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(asked, [false, true]);
  text = plain(view.render(80));
  assert.ok(text.includes('every output line') && text.includes('following · full output'), text);
  assert.ok(text.includes('o fold output'), text);
  view.dispose();
});

test('a mode switch during a read reads again in the mode now shown', async () => {
  /** @type {Array<{full: boolean, resolve: (text: string) => void}>} */
  const pending = [];
  const source = { read: (/** @type {{full?: boolean}} */ options = {}) => new Promise(resolve => { pending.push({ full: options.full === true, resolve }); }) };
  const view = createFollowView(source, { tickMs: 1_000_000 });
  view.handleInput('o');
  assert.equal(pending.length, 1, 'one read at a time');
  pending[0].resolve('folded text');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(pending.length, 2);
  assert.equal(pending[1].full, true);
  assert.equal(plain(view.render(80)).includes('folded text'), false, 'a read in the old mode is dropped');
  pending[1].resolve('full text');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(plain(view.render(80)).includes('full text'));
  view.dispose();
});

test('scrolling back to the end follows again, and esc closes in any encoding', async () => {
  const content = Array.from({ length: 40 }, (_, index) => 'line ' + index).join('\n');
  let closed = 0;
  const view = createFollowView({ read: async () => content }, { tickMs: 1_000_000, onClose: () => { closed++; } });
  await new Promise(resolve => setTimeout(resolve, 5));
  view.render(60);
  view.handleInput('k');
  assert.equal(view.pinned, false);
  view.handleInput('j');
  assert.equal(view.pinned, true, 'down to the last line follows again');
  view.handleInput('\u001b[5~');
  assert.equal(view.pinned, false, 'page up');
  view.handleInput(' ');
  assert.equal(view.pinned, true, 'a page down that reaches the end follows again');
  view.handleInput('\u001b[H');
  assert.equal(view.pinned, false, 'home');
  assert.ok(plain(view.render(60)).includes('line 0'));
  view.handleInput('\u001b[F');
  assert.equal(view.pinned, true, 'end');
  assert.ok(plain(view.render(60)).includes('line 39'));
  view.handleInput('\u001b[27u');
  assert.equal(closed, 1);
});

test('transcript lines are styled by their marker and wrap under their text', async () => {
  const long = '  → Run the tests · ' + 'pi.bash, '.repeat(12) + 'pi.edit';
  const text = ['◆ worker', '  I will run the tests.', long, '  ← 12 passed (+3 lines)', '  ✖ fabric_exec · boom'].join('\n');
  /** @type {Array<[string, string]>} */
  const painted = [];
  const theme = { fg: (/** @type {any} */ color, /** @type {string} */ value) => { painted.push([color, strip(value)]); return value; }, bold: (/** @type {string} */ value) => value };
  const view = createFollowView({ read: async () => text }, { tickMs: 1_000_000, theme });
  await new Promise(resolve => setTimeout(resolve, 5));
  const lines = view.render(50).map(strip);
  const at = lines.findIndex(line => line.includes('→ Run the tests'));
  assert.ok(at > 0, lines.join('\n'));
  assert.match(lines[at + 1], /^ {5}\S/, 'the wrapped part hangs under the call text');
  for (const line of lines) assert.ok(visibleWidth(line) <= 50, JSON.stringify(line));
  const colorOf = (/** @type {string} */ start) => painted.find(([, value]) => value.startsWith(start))?.[0];
  assert.equal(colorOf('◆ worker'), 'accent');
  assert.equal(colorOf('→ Run the tests'), 'muted');
  assert.equal(colorOf('← 12 passed'), 'dim');
  assert.equal(colorOf('✖ fabric_exec'), 'warning');
  assert.equal(colorOf('I will run'), undefined, "the worker's own words keep the default color");
  view.dispose();
});

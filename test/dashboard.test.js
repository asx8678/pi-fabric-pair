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
  assert.deepEqual(dashboardMoreKeys().map(item => item.action), ['restart', 'reload', 'doctor', 'help']);
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
  assert.equal(captured.done, 'transcript');
  assert.equal(second.listenerCount(), 0);
  // Outside a TUI the dashboard declines, so callers keep their select-based fallback.
  assert.equal(await dashboardView({ mode: 'rpc', ui: {} }, second, {}), undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { visibleWidth } from '@earendil-works/pi-tui';
import { ACTION_HELP, ACTION_HELP_MAX, createDashboard, createFollowView, dashboardAction, dashboardItems, dashboardKeys, dashboardLines, dashboardMenu, dashboardMoreKeys, dashboardView, menu, statusText } from '../src/ui.js';

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
// The overlay draws a box, so a view line carries a border and a padding space on each side. Tests that assert
// wording compare the interior only; the box itself is asserted by its own test.
const interior = (/** @type {string} */ line) => { const text = strip(line); return text.startsWith('│') ? text.slice(2, -2) : text; };
/** Whether a line is inside the box's interior: needed now that the overlay is framed. */
const framed = (/** @type {string} */ line) => strip(line).startsWith('│');
const plain = (/** @type {string[]} */ lines) => lines.map(interior).join('\n');

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
  // Pair off is said once, not twice (no banner above the readiness sentence).
  assert.equal(off.match(/Pair is off/g)?.length, 1, off);
  assert.ok(off.includes('○ off'), off);
  // The controller refuses to start a worker while Pair is off, so no start key is offered.
  assert.equal(off.includes('n start'), false, off);
  assert.equal(dashboardKeys(CASES.off).some(item => item.action === 'start'), false);
  const unset = summary({ workers: [worker({ task: null, status: 'stopped', pid: null, model: '' })] });
  const unsetText = plain(dashboardLines(unset, 100, NOW));
  assert.ok(unsetText.includes('No worker model is chosen yet.'), unsetText);
  assert.ok(unsetText.includes('Press s to choose the worker model.'), unsetText);
  assert.ok(unsetText.includes('○ set up'), unsetText);
});

test('Pair off offers settings, never a start key the controller would refuse', () => {
  const off = CASES.off;
  assert.equal(off.enabled, false);
  const keys = dashboardKeys(off).map(item => item.key);
  assert.equal(keys.includes('n'), false, 'no start key while Pair is off: ' + keys.join(','));
  assert.equal(dashboardKeys(off).some(item => item.action === 'start'), false);
  // The key that turns Pair on is offered here, and the sentence names that same key.
  const turnOn = dashboardKeys(off).find(item => item.action === 'enable');
  assert.ok(turnOn, 'a key to turn Pair on: ' + keys.join(','));
  assert.equal(turnOn.key, 'o');
  for (const width of [20, 40, 60, 100]) {
    const lines = dashboardLines(off, width, NOW).map(strip);
    const text = lines.join('\n');
    assert.equal((text.match(/Pair is off/g) || []).length, 1, width + ': ' + text);
    // Narrow widths truncate the sentence rather than repeating it; the key survives as far as it can.
    assert.ok(text.includes('Pair is off'), width + ': ' + text);
    if (width >= 40) assert.ok(text.includes('Press o to turn it on'), width + ': ' + text);
    assert.ok(lines[1].includes('claude-opus'), 'the identity line stays: ' + text);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, width + ': ' + JSON.stringify(line));
  }
  // The hint row offers the same key, so the sentence and the keys cannot disagree.
  assert.ok(/o turn Pair on/.test(plain(dashboardLines(off, 100, NOW))), plain(dashboardLines(off, 100, NOW)));
  // Turning Pair on brings the key back.
  const on = summary({ workers: [worker({ task: null, status: 'stopped', pid: null, observation: null })] });
  assert.ok(dashboardKeys(on).some(item => item.action === 'start'));
});

test('Pair off is still announced on the screens that show a plan or no worker at all', () => {
  // The readiness sentence is the only notice on a no-task screen, so these two need the banner instead.
  const withTask = summary({ enabled: false, workers: [worker()] });
  const noWorker = summary({ enabled: false, workers: [] });
  for (const [name, s] of Object.entries({ 'a running task': withTask, 'no worker': noWorker })) {
    for (const width of [40, 60, 100]) {
      const lines = dashboardLines(s, width, NOW).map(strip);
      const text = lines.join('\n');
      assert.equal((text.match(/Pair is off/g) || []).length, 1, name + ' at ' + width + ': ' + text);
      assert.ok(text.includes('Pair is off'), name + ' at ' + width + ': ' + text);
      if (width >= 60) assert.ok(text.includes('Pair is off. Press o to turn it on.'), name + ' at ' + width + ': ' + text);
      for (const line of lines) assert.ok(visibleWidth(line) <= width, width + ': ' + JSON.stringify(line));
    }
  }
  // The plan screen keeps its header identity line and its plan; the banner sits under the title.
  const taskLines = dashboardLines(withTask, 100, NOW).map(strip);
  assert.equal(taskLines[0], 'Pair', taskLines.join('\n'));
  assert.ok(taskLines[1].includes('Pair is off'), taskLines.join('\n'));
  assert.ok(taskLines.some(line => line.includes('Wire retries into fetch client')), taskLines.join('\n'));
  // No start key while off, even with a plan on screen.
  assert.equal(dashboardKeys(withTask).some(item => item.action === 'start'), false);
  // A finished task off screen shows the Last task line and still states Pair off once.
  const done = summary({ enabled: false, workers: [worker({ status: 'ready', task: task({ status: 'completed', step: 3, updatedAt: NOW - 30000, stepList: ['A', 'B', 'C'].map(title => step(title, 'done')) }) })] });
  const doneText = plain(dashboardLines(done, 100, NOW));
  assert.equal((doneText.match(/Pair is off/g) || []).length, 1, doneText);
  assert.ok(doneText.includes('Last task'), doneText);
});

test('several workers name the worker in the header', () => {
  const text = plain(dashboardLines(CASES['several workers'], 100, NOW));
  assert.ok(text.startsWith('Pair · w1'), text);
  assert.ok(text.includes('t transcript'), text);
});

test('the keys follow the state, so a key is only offered when it applies', () => {
  // A single worker has no roster to manage beyond itself, so no remove/default, but add is always there.
  const running = dashboardKeys(CASES.working).map(item => item.key);
  assert.deepEqual(running, ['t', 'p', 'c', 'x', 'a', 's', 'm', '?']);
  const review = dashboardKeys(CASES['review with failed verification']).map(item => item.key);
  assert.deepEqual(review, ['r', 'd', 't', 'c', 'x', 'a', 's', 'm', '?']);
  // Without a worker: add a worker is the way out, and the settings key stays; more and help are always reachable.
  assert.deepEqual(dashboardKeys(CASES['no worker']).map(item => item.key), ['a', 's', 'm', '?']);
  // Removing is offered only when another worker would remain, because the controller refuses the last one.
  assert.equal(dashboardKeys(CASES.working).some(item => item.action === 'remove-worker'), false);
  assert.equal(dashboardKeys(CASES['several workers']).some(item => item.action === 'remove-worker'), true);
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

/** Keys the dashboard actually offers, so a test never asserts a key the state does not have. */
const hintKey = (/** @type {any} */ s, /** @type {any} */ row, /** @type {string} */ action) => row.find((/** @type {any} */ item) => item.action === action)?.key;

/** Every hint the main row offers for this state. */
function offeredHints(/** @type {any} */ s) { return dashboardKeys(s); }
const questionCase = summary({ workers: [worker({ status: 'question', task: task({ status: 'question', reportId: 'report-1', reportKind: 'question' }) })] });
const HINT_CASES = { waiting: CASES['waiting reports'], question: questionCase, 'several workers': CASES['several workers'] };

test('a key hint is never split from its label, at any width', () => {
  for (const [name, s] of Object.entries(HINT_CASES)) {
    const hints = offeredHints(s);
    for (const width of [40, 50, 60, 72, 100]) {
      const lines = dashboardLines(s, width, NOW).map(strip);
      // The hint row sits at the end of the surface: only those lines are checked.
      const tail = lines.slice(Math.max(0, lines.findLastIndex(line => !/^  /.test(line)) + 1));
      for (const hint of hints) {
        for (const line of tail) {
          if (!line.includes(hint.label)) continue;
          assert.ok(line.includes(hint.key + ' ' + hint.label), name + ' at ' + width + ': "' + hint.label + '" sits apart from its key: ' + JSON.stringify(line));
        }
      }
      // Every hint is rendered somewhere, so the row never silently loses one.
      for (const hint of hints) assert.ok(tail.some(line => line.includes(hint.key + ' ' + hint.label)), name + ' at ' + width + ': missing ' + hint.key + ' ' + hint.label + ' in ' + JSON.stringify(tail));
      // The same holds for the More row and the help/back row.
      for (const options of [{ more: true }, { help: true }]) {
        const moreLines = dashboardLines(s, width, NOW, options).map(strip);
        const moreTail = moreLines.slice(Math.max(0, moreLines.findLastIndex(line => !/^  /.test(line)) + 1));
        for (const hint of dashboardMoreKeys(s)) {
          for (const line of moreTail) {
            if (!line.includes(hint.label)) continue;
            assert.ok(line.includes(hint.key + ' ' + hint.label), name + ' at ' + width + ' (' + Object.keys(options)[0] + '): ' + JSON.stringify(line));
          }
        }
        assert.ok(moreLines.some(line => line.trimEnd().endsWith('esc back')), name + ' at ' + width + ': esc back is split: ' + JSON.stringify(moreLines.slice(-4)));
      }
    }
  }
});

test('the dashboard never shows a bare slash command', () => {
  const states = {
    'error': summary({ workers: [worker({ status: 'error', error: 'RPC worker exited with code 1: ENOENT pi', task: null, pid: null })] }),
    'stopped': summary({ workers: [worker({ task: null, status: 'stopped', pid: null, observation: null })] }),
    'paused': CASES.paused,
    'interrupted': summary({ workers: [worker({ status: 'interrupted', task: task({ status: 'interrupted' }) })] }),
    // The controller's own wording for a generation it cannot prove exited.
    'exit unconfirmed': summary({ workers: [worker({ status: 'error', error: 'EXIT_UNCONFIRMED: worker vanished. Stop/reconcile before reusing this generation.', task: null, pid: null })] }),
    'held after a crash': summary({ workers: [worker({ status: 'error', error: 'EXIT_UNCONFIRMED: worker vanished. Stop/reconcile before reusing this generation.', task: task({ status: 'paused' }), status2: 'error' })] }),
    'no model': summary({ workers: [worker({ task: null, status: 'stopped', pid: null, model: '' })] }),
    'not a git repo': summary({ workers: [worker({ task: null, status: 'stopped', pid: null, workspaceGit: false })] }),
  };
  for (const [name, s] of Object.entries(states)) {
    for (const width of [40, 60, 100]) {
      const lines = dashboardLines(s, width, NOW).map(strip);
      for (const line of lines) assert.equal(line.includes('/pair'), false, name + ' at ' + width + ' shows a command: ' + JSON.stringify(line));
    }
  }
  // The hint names a key the dashboard actually offers in that state.
  const stopped = states.stopped, stoppedText = plain(dashboardLines(stopped, 100, NOW));
  const startKey = hintKey(stopped, dashboardKeys(stopped), 'start');
  assert.ok(startKey, 'a stopped worker with a model offers start');
  assert.ok(stoppedText.includes('Press ' + startKey + ' to start the worker.'), stoppedText);
  const held = states.paused, heldText = plain(dashboardLines(held, 100, NOW));
  const resumeKey = hintKey(held, dashboardKeys(held), 'resume');
  assert.ok(resumeKey, 'a held task offers resume');
  assert.ok(heldText.includes('Press ' + resumeKey + ' to resume the task.'), heldText);
  // A crashed worker with a held task: stop first, then resume, using the keys the rows offer.
  const crash = states['held after a crash'], crashText = plain(dashboardLines(crash, 100, NOW));
  const stopKey = hintKey(crash, dashboardMoreKeys(crash), 'stop');
  const crashResume = hintKey(crash, dashboardKeys(crash), 'resume');
  if (stopKey && crashResume) assert.ok(crashText.includes('Press m then ' + stopKey + ' to stop, then ' + crashResume + ' to resume the task.'), crashText);
  else assert.equal(/\/pair/.test(crashText), false, crashText);
  // EXIT_UNCONFIRMED reconcile is said once, by the warning line, so the hint does not repeat it.
  const unconfirmedLines = dashboardLines(states['exit unconfirmed'], 100, NOW).map(strip);
  const unconfirmed = unconfirmedLines.join('\n');
  assert.ok(unconfirmed.includes('press ! to reconcile'), unconfirmed);
  // The hint does not add a second instruction for the same key.
  assert.equal(unconfirmedLines.some(line => /^Press .*reconcile/i.test(line)), false, unconfirmed);
  // No offered key applies (no model, no start): a plain sentence, not a command.
  const unset = plain(dashboardLines(states['no model'], 100, NOW));
  assert.ok(unset.includes('No worker model is chosen yet.'), unset);
  assert.ok(unset.includes('Press s to choose the worker model.'), unset);
  assert.ok(plain(dashboardLines(states['not a git repo'], 100, NOW)).includes('not a Git repository'), 'a plain sentence when no key applies');
});

test('the header drops whole items and never ends in a cut word', () => {
  const cases = { ...CASES, question: questionCase };
  for (const [name, s] of Object.entries(cases)) {
    if (!s.workers.length) continue;
    for (const width of [40, 60, 72, 100]) {
      const lines = dashboardLines(s, width, NOW).map(strip);
      // The identity line follows the title (and, for a stopped Pair, the off notice).
      const header = lines.find(line => line.includes('claude-opus')) ?? '';
      assert.equal(header.includes('…'), false, name + ' at ' + width + ' cuts the header mid-word: ' + JSON.stringify(header));
      assert.ok(header.includes('claude-opus'), name + ' at ' + width + ' keeps the model: ' + JSON.stringify(header));
      if (s.workers[0].task && !['completed', 'cancelled'].includes(s.workers[0].task.status)) {
        assert.ok(/step \d+\/\d+/.test(header), name + ' at ' + width + ' keeps the step: ' + JSON.stringify(header));
      }
    }
  }
  // The numbers go in a fixed order: ctx first, then cost, then elapsed, then the effort.
  const header = (/** @type {any} */ s, /** @type {number} */ width) => strip(dashboardLines(s, width, NOW).find(line => line.includes('claude-opus')) ?? '');
  const working = CASES.working;
  assert.ok(header(working, 100).includes('ctx 41%'), header(working, 100));
  const narrow = header(working, 52);
  assert.equal(narrow.includes('ctx'), false, narrow);
  assert.ok(narrow.includes('3m12s'), narrow);
  assert.ok(narrow.includes('step 2/3'), narrow);
  assert.ok(header(working, 40).includes('◉ working'), header(working, 40));
});

test('a finished task leaves one Last task line above the readiness sentence', () => {
  const completed = summary({ workers: [worker({ status: 'ready', task: task({ status: 'completed', step: 3, updatedAt: NOW - 30000, stepList: ['A', 'B', 'C'].map(title => step(title, 'done')) }) })] });
  const doneText = plain(dashboardLines(completed, 100, NOW));
  assert.ok(doneText.includes('Last task'), doneText);
  assert.ok(doneText.includes('✔ Add retry and backoff to the fetch client'), doneText);
  assert.ok(doneText.includes('3/3 approved'), doneText);
  assert.ok(doneText.includes('2m42s'), 'the frozen elapsed time: ' + doneText);
  assert.ok(doneText.includes('$0.14'), doneText);
  const doneLines = dashboardLines(completed, 100, NOW).map(strip);
  const lastAt = doneLines.findIndex(line => line.includes('Last task'));
  assert.ok(doneLines[lastAt + 1].includes('ready for the next task'), 'the line sits above the readiness sentence: ' + doneLines.join('\n'));

  const cancelled = summary({ workers: [worker({ status: 'stopped', pid: null, task: task({ status: 'cancelled', step: 2 }) })] });
  const cancelledText = plain(dashboardLines(cancelled, 100, NOW));
  assert.ok(cancelledText.includes('Last task'), cancelledText);
  assert.ok(cancelledText.includes('✖ cancelled at step 2/3'), cancelledText);
  assert.ok(cancelledText.includes('Add retry and backoff to the fetch client'), cancelledText);

  // Narrow widths shorten the objective, never the numbers, and never exceed the width.
  for (const width of [20, 40, 60]) {
    for (const s of [completed, cancelled]) {
      const lines = dashboardLines(s, width, NOW);
      for (const line of lines) assert.ok(visibleWidth(strip(line)) <= width, width + ': ' + JSON.stringify(strip(line)));
      const text = plain(lines);
      // The label shortens at the narrowest widths; the result is always marked as a finished task.
      assert.ok(/Last task|✔|✖/.test(text), width + ': ' + text);
    }
    // The count survives even when the words around it are gone.
    assert.ok(plain(dashboardLines(cancelled, width, NOW)).includes('2/3'), 'the count survives at ' + width);
  }
  // The Last task line already gives the count, so the header line drops "step N/M".
  /** @param {any} s */
  const doneLinesFor = s => dashboardLines(s, 100, NOW).map(strip);
  const header = (/** @type {any} */ s) => doneLinesFor(s).find((line) => line.includes('claude-opus')) ?? '';
  assert.equal(header(completed).includes('step '), false, 'no step count next to Last task: ' + header(completed));
  assert.ok(header(completed).includes('✔ done'), header(completed));
  assert.ok(header(cancelled).includes('○ off'), header(cancelled));
  // A running task keeps the step in its header.
  assert.ok(doneLinesFor(CASES.working).some(line => line.includes('claude-opus') && line.includes('step 2/3')), doneLinesFor(CASES.working).join('\n'));
  // The line is stable: the same summary and clock always render the same text.
  assert.deepEqual(dashboardLines(completed, 100, NOW), dashboardLines(completed, 100, NOW));
});

test('every help description fits one line at 60 columns', () => {
  // The descriptions are a fixed table: keep each one short enough for the narrowest overlay.
  for (const [action, text] of Object.entries(ACTION_HELP)) {
    assert.ok(text.length <= ACTION_HELP_MAX, action + ' description is ' + text.length + ' characters: ' + text);
  }
  // At 60 columns each description occupies its own line, with no hanging continuation.
  for (const [name, s] of Object.entries(CASES)) {
    for (const options of [{ help: true }, { more: true }]) {
      const lines = dashboardLines(s, 60, NOW, options).map(strip);
      const keysAt = lines.findIndex(line => line.trim() === 'Keys');
      if (keysAt < 0) continue;
      for (let index = keysAt; index < lines.length - 1; index++) {
        // A key row starts at four spaces; a continuation row starts at the shared description column.
        if (!/^ {4}\S/.test(lines[index])) continue;
        const column = lines[index].search(/\S{2,}\s{2,}\S/);
        if (column < 0) continue;
        const indented = lines[index].slice(0, column).length;
        assert.equal(new RegExp('^ {' + indented + '}\\S').test(lines[index + 1]), false, name + ': a description wrapped at 60 columns: ' + JSON.stringify(lines[index]) + ' / ' + JSON.stringify(lines[index + 1]));
      }
    }
  }
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
  // The frame holds at the widest and the narrowest allowed overlay: exact width, corners, sides, keys last.
  for (const width of [options.width, 72, 40]) {
    const box = host.component.render(width).map(strip);
    assert.equal(visibleWidth(box[0]), width, 'top border at ' + width);
    assert.ok(box[0].startsWith('╭') && box[0].endsWith('╮'), 'rounded top: ' + box[0]);
    assert.ok(box.at(-1)?.startsWith('╰') && box.at(-1)?.endsWith('╯'), 'rounded bottom: ' + box.at(-1));
    assert.ok(box.slice(1, -1).every(framed), 'every interior line has its sides');
    assert.ok(box.every(line => visibleWidth(line) === width), 'every line is exactly the overlay width');
    assert.ok(box.at(-2)?.includes('? help'), 'the keys sit on the line just above the bottom border: ' + box.at(-2));
  }
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
  assert.deepEqual(dashboardKeys(s).map(item => item.key), ['t', 'p', 'c', 'x', 'a', 'D', 'w', 's', 'm', '?']);
  const view = createDashboard(fakeController(s), { now: () => NOW, tickMs: 1_000_000 });
  assert.equal(view.workerId, 'w1');
  // The second worker carries 'make default'; the first, which already is the default, does not.
  assert.equal(dashboardKeys(s, 'w2').some(item => item.action === 'default-worker'), true);
  assert.equal(dashboardKeys(s, 'w1').some(item => item.action === 'default-worker'), false);
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
  assert.ok(line('p pause').includes('hold the task after this step'), text);
  assert.ok(line('x stop worker').includes('conversation is kept'), text);
  assert.ok(line('esc close').includes('q too'), text);
  assert.equal(line('p pause').indexOf('hold the task'), line('t transcript').indexOf("follow the worker's"), 'descriptions share one column');
  assert.equal(text.includes('Wire retries'), false, 'the list replaces the plan');
  assert.equal(lines.at(-1)?.trim(), 'esc back');
  for (const item of lines) assert.ok(visibleWidth(item) <= 100);
  // A narrow overlay wraps a description under its column instead of cutting it off.
  const narrow = dashboardLines(CASES.working, 50, NOW, { help: true }).map(strip);
  assert.equal(narrow.slice(narrow.findIndex(item => item.trim() === 'Keys')).some(item => item.includes('…')), false, narrow.join('\n'));
  // A description longer than its column continues under its first word, not at the left margin.
  const at = narrow.findIndex(item => item.trimStart().startsWith('esc close '));
  const column = narrow[at].indexOf('close (q too)');
  assert.ok(column > 0, narrow.join('\n'));
  assert.match(narrow[at + 1], new RegExp(`^ {${column}}\\S`), 'the rest of the description hangs under its first word');
  // At 60 columns every description fits on its own line.
  const wide = dashboardLines(CASES.working, 60, NOW, { help: true }).map(strip);
  for (let index = 0; index < wide.length - 1; index++) {
    if (!/^ {4}\S/.test(wide[index])) continue;
    const next = wide[index + 1];
    assert.equal(/^ {23}\S/.test(next), false, 'no description may wrap at 60 columns: ' + JSON.stringify(wide[index]) + ' / ' + JSON.stringify(next));
  }
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

test('the dashboard lists every worker with its default, model, effort and state, and marks the selected one', () => {
  const two = summary({ workers: [
    worker({ id: 'w1', model: 'anthropic/claude-opus', effort: 'high', status: 'working' }),
    worker({ id: 'w2', model: 'opencode-go/deepseek-v4.1-flash', effort: 'max', status: 'not_started', task: null, pid: null, sessionId: null }),
  ] });
  const lines = dashboardLines(two, 100, NOW).map(strip);
  const text = lines.join('\n');
  // Both workers are listed, with the default marked and the never-started one labelled as such.
  assert.match(text, /▸ w1 \(default\)/, text);
  assert.match(text, /opencode-go\/deepseek-v4\.1-flash/, text);
  assert.match(text, /not started/, 'a never-started worker says so: ' + text);
  assert.match(text, / high/, 'the effort is shown');
  assert.match(text, /step 2\/3/, 'a worker with a task shows its step');
  // The second row is not selected, so it carries the blank marker and no default tag.
  const row2 = lines.find(line => line.includes('w2 '));
  assert.ok(row2 && !row2.startsWith('▸'), row2);
  // Selecting w2 moves the marker and the detail below it.
  const selected = dashboardLines(two, 100, NOW, { workerId: 'w2' }).map(strip);
  const row2b = selected.find(line => line.includes('w2 '));
  assert.ok(row2b.startsWith('▸'), row2b);
  // The other worker keeps its row, unmarked, so the list never hides a configured worker.
  assert.ok(selected.some(line => /^ {2}w1 /.test(line)), selected.join('\n'));
});

test('a single worker shows no roster: the screen stays the compact plan it was', () => {
  const text = dashboardLines(CASES.working, 100, NOW).map(strip).join('\n');
  assert.equal(/▸/.test(text), false, text);
  assert.equal(text.includes('(default)'), false, text);
});

test('the roster fits 60 columns and drops the default tag before the state', () => {
  const two = summary({ workers: [
    worker({ id: 'w1', model: 'opendesign/deepseek-v4.1-flash', effort: 'high' }),
    worker({ id: 'worker-with-a-long-id', model: 'opencode-go/deepseek-v4.1-flash', effort: 'max', status: 'not_started', task: null, pid: null, sessionId: null }),
  ] });
  for (const width of [40, 60, 100]) {
    const lines = dashboardLines(two, width, NOW, { workerId: 'worker-with-a-long-id' }).map(strip);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, width + ': ' + JSON.stringify(line));
  }
  const narrow = dashboardLines(two, 40, NOW).map(strip).join('\n');
  assert.match(narrow, /not started/, 'the state survives truncation: ' + narrow);
});

test('up and down move the selection, and the choice names the worker it acts on', async () => {
  const two = CASES['several workers'];
  const view = createDashboard(fakeController(two), { now: () => NOW, tickMs: 1_000_000 });
  assert.equal(view.workerId, 'w1');
  view.handleInput('j');
  assert.equal(view.workerId, 'w2', 'down selects the next worker');
  view.handleInput('k');
  assert.equal(view.workerId, 'w1', 'up selects the previous one');
  view.handleInput('k');
  assert.equal(view.workerId, 'w1', 'up at the top stays put instead of wrapping');
  view.handleInput('\u001b[B');
  assert.equal(view.workerId, 'w2', 'the arrow key works too');
  view.handleInput('\u001b[A');
  assert.equal(view.workerId, 'w1');
  // The arrow keys only move the selection; they never resolve the view.
  assert.deepEqual(view.handleInput('\u001b[B'), []);
  // A single worker has nothing to move between.
  const one = createDashboard(fakeController(CASES.working), { now: () => NOW, tickMs: 1_000_000 });
  one.handleInput('j');
  assert.equal(one.workerId, 'w1');
  one.dispose(); view.dispose();
  // And the overlay returns the selected worker with the action. Both workers hold a task, so 'c' applies to
  // either and the assertion is about the selection, not about which keys a ready worker has.
  const both = summary({ workers: [worker(), worker({ id: 'w2', task: task(), pid: 43, sessionId: 'session-2' })] });
  const { host, ctx } = overlayHost();
  await dashboardView(ctx, fakeController(both), {});
  host.component.handleInput('j');
  const moved = plain(host.component.render(100));
  assert.ok(moved.includes('▸ w2'), 'the overlay shows the new selection: ' + moved);
  host.component.handleInput('c');
  assert.deepEqual(host.done, [{ action: 'cancel', workerId: 'w2' }]);
});

test('n, x, a, D, * and o are offered only when they apply, and run on the selected worker', async () => {
  const ready = summary({ workers: [
    worker({ task: null, status: 'ready', pid: 42, sessionId: null, observation: null }),
    worker({ id: 'w2', task: null, status: 'not_started', pid: null, sessionId: null, observation: null }),
  ] });
  const keys = dashboardKeys(ready, 'w2').map(item => item.key);
  assert.ok(keys.includes('n'), 'a stopped worker with a model can be started: ' + keys.join(','));
  assert.ok(keys.includes('a'), 'a worker can be added');
  assert.ok(keys.includes('D'), 'a worker can be removed while another remains');
  assert.ok(keys.includes('*'), 'the non-first worker can be made the default');
  // The worker with a process gets stop on the main row; the stopped one does not.
  assert.equal(dashboardKeys(ready, 'w1').some(item => item.action === 'stop'), true);
  assert.equal(dashboardKeys(ready, 'w2').some(item => item.action === 'stop'), false, 'nothing runs on w2, so nothing to stop');
  const running = dashboardKeys(CASES.working).map(item => item.key);
  assert.equal(running.includes('n'), false, 'a running worker offers no start');
  // Pair off: only the key that turns it on, never a start the controller would refuse.
  const off = dashboardKeys(CASES.off).map(item => item.key);
  assert.equal(off.includes('n'), false, off.join(','));
  assert.ok(off.includes('o'), off.join(','));
  // Every one of them resolves through dashboardAction, and the overlay returns it with the selected worker.
  for (const [key, action] of [['a', 'add-worker'], ['D', 'remove-worker'], ['*', 'default-worker']]) {
    assert.equal(dashboardAction(key, CASES['several workers'], 'w2'), action, key);
    const { host, ctx } = overlayHost();
    await dashboardView(ctx, fakeController(CASES['several workers']), {});
    host.component.handleInput('j');
    host.component.handleInput(key);
    assert.deepEqual(host.done, [{ action, workerId: 'w2' }], key + ' acts on the selected worker');
  }
});

test('o turns Pair on from the dashboard, and the sentence names that key', async () => {
  const off = CASES.off;
  assert.equal(dashboardAction('o', off), 'enable');
  assert.equal(dashboardAction('o', CASES.working), null, 'nothing to turn on while Pair is on');
  const text = plain(dashboardLines(off, 100, NOW));
  assert.ok(text.includes('Press o to turn it on'), text);
  assert.ok(text.includes('o turn Pair on'), 'the hint row names the same key: ' + text);
  const { host, ctx } = overlayHost();
  await dashboardView(ctx, fakeController(off), {});
  host.component.handleInput('o');
  // The overlay names the worker it was shown for; 'enable' itself is about Pair, not that worker.
  assert.deepEqual(host.done, [{ action: 'enable', workerId: 'w1' }]);
});

test('the non-TUI menu offers Start, Stop, Add, Remove, Make default and Turn Pair on', () => {
  const two = summary({ workers: [worker({ task: null, status: 'ready', pid: 42 }), worker({ id: 'w2', task: null, status: 'not_started', pid: null, sessionId: null })] });
  const items = dashboardItems(two), actions = new Set(items.map(item => item.action));
  for (const action of ['start', 'stop', 'add-worker', 'remove-worker', 'default-worker']) assert.ok(actions.has(action), 'the menu offers ' + action);
  assert.equal(dashboardItems(summary({ enabled: false, workers: [] })).some(item => item.action === 'enable'), true, 'turn Pair on is in the menu');
  // The list itself is in the menu, with the default marked, so a reader can see what exists without starting
  // a worker first. One row states the order; acting on a worker is the per-worker rows above it.
  const roster = items.find(item => item.action === 'worker');
  assert.ok(roster, items.map(item => item.label).join(' | '));
  assert.match(String(roster.value), /w1 \(default\), w2/, String(roster.value));
  assert.equal(dashboardItems(summary({ workers: [worker()] })).some(item => item.action === 'add-worker'), true);
});

test('without the TUI, the menu names the worker an action is for, so each choice runs on its own worker', async () => {
  const two = summary({ workers: [worker(), worker({ id: 'w2', pid: 43, sessionId: 'session-2' })] });
  const items = dashboardItems(two), entries = dashboardMenu(items);
  /** @type {string[]} */
  let offered = [];
  /** @param {string} choice */
  const pick = choice => menu(/** @type {any} */ ({ mode: 'rpc', ui: { select: async (/** @type {string} */ _title, /** @type {string[]} */ options) => { offered = options; return choice; } } }), entries, { title: 'Pair' });
  const id = await pick('Worker · w2 · Pause');
  assert.equal(new Set(offered).size, offered.length, 'every option is unique');
  assert.ok(offered.includes('Worker · w1 · Pause') && offered.includes('Worker · w2 · Pause'), offered.join(' | '));
  assert.deepEqual({ action: items[Number(id)].action, workerId: items[Number(id)].workerId }, { action: 'pause', workerId: 'w2' });
  assert.equal(items[Number(await pick('Worker · w1 · Cancel task'))].workerId, 'w1');
  assert.ok(offered.includes('Status'), 'a label that appears once is offered as it is');
  assert.equal(await pick('Close'), undefined);
  assert.equal(await pick(/** @type {any} */ (undefined)), undefined, 'a dismissed select chooses nothing');
});

test('a worker on a provider fallback shows the fallback model in the roster and in /pair status', () => {
  const fallback = { model: 'openai/gpt-backup', backend: 'low', reason: '429 rate limit', at: NOW - 60000 };
  const two = summary({ workers: [worker({ fallback, backend: 'pi' }), worker({ id: 'w2', status: 'ready', task: null })] });
  for (const width of [60, 100]) {
    const lines = dashboardLines(two, width, NOW).map(strip);
    const row = lines.find(line => line.includes('w1') && line.includes('working'));
    assert.ok(row && /gpt-backup|fallback/.test(row), lines.join('\n'));
    assert.ok(lines.every(line => visibleWidth(line) <= width), lines.join('\n'));
  }
  const wide = dashboardLines(two, 100, NOW).map(strip).find(line => line.includes('w1') && line.includes('working'));
  assert.match(String(wide), /openai\/gpt-backup · fallback · low/);
  assert.doesNotMatch(String(wide), /claude-opus/);
  const text = statusText(two, null, NOW);
  assert.match(text, /Fallback\s+openai\/gpt-backup · low for the rest of this task/);
  assert.doesNotMatch(statusText(summary(), null, NOW), /Fallback/);
});

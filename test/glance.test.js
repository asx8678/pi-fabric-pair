import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleWidth } from '@earendil-works/pi-tui';
import { boardLines, boardWidget, createIndicatorSurface, dashboardHeader, dashboardLines, doctorText, fitSegments, footerBadge, indicator, liveLine, liveWidget, statusText, widgetSignature, workerState } from '../src/ui.js';
import { INDICATORS, isIndicator, validateConfig } from '../src/config.js';

const NOW = 1_700_000_000_000;
/** @param {string} text @returns {string} */
const strip = text => text.replace(/\u001b\[[0-9;]*m/g, '');
/** @param {string} title @param {string} state @returns {{id: string, title: string, state: string}} */
const step = (title, state, id = title) => ({ id, title, state });
/**
 * @param {object} [over]
 * @returns {any}
 */
function task(over = {}) {
  return { id: 'task-1', attemptId: 'attempt-1', attemptNumber: 1, objective: 'Add retry and backoff to the fetch client', status: 'running',
    step: 2, steps: 4, revisions: 1, reportId: null, reportKind: null, lastDecision: null, checkpointHash: null, reportedCost: 0.14,
    startedAt: NOW - 192000, turns: 3,
    stepList: [step('Add retry policy type', 'done'), step('Wire retries into fetch client', 'active'), step('Tests for backoff', 'todo'), step('Document retries', 'todo')],
    stepRevisions: 1, limits: { maxRevisions: 20, maxRevisionsPerStep: 3, maxReportedCostUsd: 2, maxOutputTokens: null },
    limitNotice: null, updatedAt: NOW - 1000, lastVerification: [], ...over };
}
/** @param {object} [over] @returns {any} */
function worker(over = {}) {
  return { id: 'w1', model: 'anthropic/claude-opus', effort: 'high', readOnly: false, status: 'working', pid: 42, sessionId: 'session-1',
    sessionFile: null, workerGeneration: 1, cwd: '/tmp', workspaceGit: true, task: task(),
    observation: { at: NOW - 5000, currentTool: 'edit', currentTarget: 'src/http/client.js' },
    usage: null, lastExchange: null, error: null, pendingConfiguration: false, ...over };
}
/** @param {object} [over] @returns {any} */
function summary(over = {}) {
  return { ownerSession: 'session-1', ownerEpoch: 1, directory: '/tmp/pair', enabled: true, autoDeliverReports: true, settingsPending: false,
    main: { model: 'provider/model', busy: false }, mainPhase: null, waitingReports: 0, workers: [worker()], cacheNote: '', ...over };
}
/** A theme that records every color name it is asked for. */
function recordingTheme() {
  /** @type {string[]} */
  const calls = [];
  return { calls, fg: (color, text) => { calls.push(color); return String(text); } };
}
const allDone = () => task({ status: 'completed', step: 4, stepRevisions: 0, stepList: ['Add retry policy type', 'Wire retries into fetch client', 'Tests for backoff', 'Document retries'].map(title => step(title, 'done')) });

const STATES = {
  working: summary(),
  starting: summary({ workers: [worker({ status: 'starting', task: task({ status: 'activating' }) })] }),
  review: summary({ workers: [worker({ status: 'review', task: task({ status: 'review', reportID: null }) })] }),
  'final review': summary({ workers: [worker({ status: 'review', task: task({ status: 'review', reportKind: 'final_review' }) })] }),
  question: summary({ workers: [worker({ status: 'question', task: task({ status: 'question' }) })] }),
  blocked: summary({ workers: [worker({ status: 'blocked', task: task({ status: 'blocked' }) })] }),
  attention: summary({ workers: [worker({ status: 'attention', error: 'EXIT_UNCONFIRMED: worker vanished' })] }),
  error: summary({ workers: [worker({ status: 'error', error: 'worker crashed' })] }),
  permission: summary({ workers: [worker({ status: 'permission' })] }),
  stalled: summary({ workers: [worker({ observation: { at: NOW - 400000, currentTool: 'bash', currentTarget: 'npm test' } })] }),
  paused: summary({ workers: [worker({ status: 'paused', task: task({ status: 'paused' }) })] }),
  interrupted: summary({ workers: [worker({ status: 'interrupted', task: task({ status: 'interrupted' }) })] }),
  done: summary({ workers: [worker({ status: 'ready', task: allDone() })] }),
  ready: summary({ workers: [worker({ status: 'ready', task: null })] }),
  off: summary({ enabled: false, workers: [worker({ status: 'stopped', task: null, pid: null })] }),
  'not set up': summary({ workers: [worker({ model: '', status: 'stopped', task: null, pid: null })] }),
  stopped: summary({ workers: [worker({ status: 'stopped', task: null, pid: null })] }),
  'waiting reports': summary({ autoDeliverReports: false, waitingReports: 2, workers: [worker({ status: 'review', task: task({ status: 'review' }) })] }),
  several: summary({ workers: [worker(), worker({ id: 'w2', status: 'ready', task: null, pid: 43 }), worker({ id: 'w3', status: 'review', task: task({ status: 'review' }) })] }),
};

test('the badge stays tiny for every state and never carries the step title', () => {
  for (const [name, s] of Object.entries(STATES)) {
    const badge = strip(footerBadge(s, NOW));
    const cap = s.workers.length > 1 ? 32 : 24;
    assert.ok(visibleWidth(badge) <= cap, `${name}: ${badge} is wider than ${cap}`);
    for (const w of s.workers) {
      for (const item of w.task?.stepList ?? []) assert.equal(badge.includes(item.title), false, `${name}: badge leaked the step title ${item.title}`);
    }
    assert.equal(badge.includes('Wire retries'), false, `${name}: badge leaked the step title`);
  }
});

test('the badge uses the shared vocabulary for each state', () => {
  /** @type {Record<string, [string, string]>} */
  const expected = {
    working: ['◉', '3m'], starting: ['◉', 'starting'], review: ['◐', 'review'], 'final review': ['◐', 'final'],
    question: ['◐', 'question'], blocked: ['◐', 'blocked'], attention: ['!', 'attention'], error: ['!', 'attention'],
    permission: ['!', 'permission'], stalled: ['!', 'idle 6m'], paused: ['⏸', 'paused'], interrupted: ['⏸', 'interrupted'],
    done: ['✔', 'done'], ready: ['●', 'ready'], off: ['○', 'off'], 'not set up': ['○', 'set up'], stopped: ['○', 'off'],
    'waiting reports': ['!', '2 reports'],
  };
  for (const [name, [icon, word]] of Object.entries(expected)) {
    const badge = strip(footerBadge(STATES[name], NOW));
    assert.ok(badge.startsWith('pair '), `${name}: ${badge}`);
    assert.ok(badge.includes(icon), `${name}: expected ${icon} in ${badge}`);
    assert.ok(badge.includes(word), `${name}: expected "${word}" in ${badge}`);
  }
});

test('the badge shows progress n/m for plan states and worker tags with several workers', () => {
  assert.equal(strip(footerBadge(STATES.working, NOW)), 'pair ◉ 2/4 3m');
  assert.equal(strip(footerBadge(STATES.review, NOW)), 'pair ◐ 2/4 review');
  assert.equal(strip(footerBadge(STATES.done, NOW)), 'pair ✔ 4/4 done');
  assert.equal(strip(footerBadge(STATES.attention, NOW)), 'pair ! attention');
  const many = strip(footerBadge(STATES.several, NOW));
  assert.equal(many, 'pair w1 ◉2/4 w2 ● w3 ◐2/4');
  assert.ok(visibleWidth(many) <= 32);
});

test('a clipped worker label never leaks an SGR reset into painted text', () => {
  // A second worker whose id is wider than the ten columns a label keeps.
  const long = summary({ workers: [worker(), worker({ id: 'reviewer-long-id', status: 'review', task: task({ status: 'review' }) })] });
  const badge = footerBadge(long, NOW);
  assert.equal(badge.includes('\u001b'), false, JSON.stringify(badge));
  assert.equal(badge, 'pair w1 ◉2/4 reviewer-… ◐2/4');
  // Without a theme nothing is painted, so no surface may carry an escape sequence at all.
  const live = liveLine(long, 100, undefined, NOW);
  assert.equal(live.length, 1);
  assert.equal(live[0].includes('\u001b'), false, JSON.stringify(live[0]));
  const board = boardLines(long, 100, undefined, NOW);
  for (const line of board) assert.equal(line.includes('\u001b'), false, JSON.stringify(line));
  // The board names the other worker with the same clipped label.
  assert.ok(board.some(line => line.includes('reviewer-…')), board.join('\n'));
  assert.equal(board.some(line => line.includes('reviewer-long-id')), false, board.join('\n'));
  // Even the narrowest badge, where the entries overflow into '+N', stays free of escapes.
  const crowd = summary({ workers: [worker(), ...'abcdefghij'.split('').map((id, index) => worker({ id: 'long-worker-' + id, status: 'ready', task: null, pid: 43 + index }))] });
  assert.equal(footerBadge(crowd, NOW).includes('\u001b'), false);
  assert.ok(strip(footerBadge(crowd, NOW)).includes('+'), 'the crowd must overflow into +N');
});

test('a worker who needs the human leads the badge and keeps its own colour', () => {
  // w1 works a plan; w2 crashed. The badge must lead with w2 and not paint it the plan worker's green.
  const crashed = summary({ workers: [worker(), worker({ id: 'w2', status: 'error', pid: null, task: null, error: 'Worker exited unexpectedly' })] });
  assert.equal(footerBadge(crashed, NOW), 'pair w2 ! w1 ◉2/4');
  /** @type {Array<[string, string]>} */
  const painted = [];
  const theme = { fg: (/** @type {string} */ color, /** @type {string} */ text) => { painted.push([color, text]); return '<' + color + '>' + text + '</>'; } };
  const badge = indicator(crashed, false, theme, NOW);
  // 'pair' wears the first entry's colour and joins its run; the plan worker keeps its own green.
  assert.equal(badge, '<error>pair w2 !</> <success>w1 ◉2/4</>', badge);
  assert.deepEqual(painted, [['error', 'pair w2 !'], ['success', 'w1 ◉2/4']]);
  // A warning worker comes after an error one but still ahead of the calm ones, and every entry keeps its colour.
  const warn = summary({ workers: [worker(), worker({ id: 'w2', status: 'permission' }), worker({ id: 'w3', status: 'error', pid: null, task: null, error: 'gone' })] });
  assert.equal(footerBadge(warn, NOW), 'pair w3 ! w2 ! w1 ◉2/4');
});

test('the painted badge strips back to the plain badge, including the +N overflow', () => {
  // The plain-text theme: what a paint returns is exactly what the plain badge would have said.
  const theme = recordingTheme();
  for (const [name, s] of Object.entries(STATES)) {
    assert.equal(strip(indicator(s, false, theme, NOW)), footerBadge(s, NOW), name);
  }
  const staff = (/** @type {number} */ count) => summary({
    workers: [worker(), worker({ id: 'w2', status: 'review', task: task({ status: 'review' }) }), ...Array.from({ length: count - 2 }, (_, index) => worker({ id: 'w' + (index + 3), status: 'ready', task: null, pid: 43 + index }))] });
  for (const count of [3, 4, 5, 6, 8]) {
    const s = staff(count);
    const plain = footerBadge(s, NOW), painted = indicator(s, false, theme, NOW);
    assert.equal(strip(painted), plain, `${count} workers: ${painted}`);
    assert.ok(visibleWidth(plain) <= 32, `${count} workers: ${plain} is ${visibleWidth(plain)} wide`);
    if (count >= 5) assert.ok(plain.includes('+'), `${count} workers should overflow into +N: ${plain}`);
  }
  // The overflow marker itself is dim, and the entries before it keep their own colours.
  /** @type {Array<[string, string]>} */
  const painted = [];
  const tag = (/** @type {string} */ color, /** @type {string} */ text) => { painted.push([color, text]); return '<' + color + '>' + text + '</>'; };
  const marked = indicator(staff(6), false, { fg: tag }, NOW);
  assert.ok(marked.includes('<dim>+'), marked);
  assert.ok(marked.includes('<accent>w2 ◐2/4</>'), marked);
  // 'pair' and w1 share a colour and stay one run; then w2's accent, w3, and the dim marker.
  assert.deepEqual(painted, [['success', 'pair w1 ◉2/4'], ['accent', 'w2 ◐2/4'], ['success', 'w3 ●'], ['dim', '+3']], JSON.stringify(painted));
  // A single worker's badge is still one painted run, exactly as before.
  const one = /** @type {Array<[string, string]>} */ ([]);
  const single = indicator(STATES.working, false, { fg: (color, text) => { one.push([color, text]); return String(text); } }, NOW);
  assert.deepEqual(one, [['success', 'pair ◉ 2/4 3m']]);
  assert.equal(single, 'pair ◉ 2/4 3m');
});

test('the badge is steady: identical input gives identical output at any time phase', () => {
  for (const [name, s] of Object.entries(STATES)) {
    const first = footerBadge(s, NOW);
    for (const phase of [0, 500, 1000, 1500, 1999, 2000, 2001, 3000, 4000]) {
      assert.equal(footerBadge(s, NOW + phase), first, `${name} changed at + ${phase}ms (blink)`);
    }
  }
});

test('the painted badge is the indicator text', () => {
  const theme = recordingTheme();
  const painted = indicator(STATES.working, false, theme, NOW);
  assert.equal(strip(painted), footerBadge(STATES.working, NOW));
  assert.ok(theme.calls.includes('success'));
  // Calm states paint calm colors; only needs-human states paint warning/error.
  const calm = recordingTheme();
  indicator(STATES.review, false, calm, NOW);
  assert.equal(calm.calls.some(color => color === 'warning' || color === 'error'), false, 'review must stay calm');
  const loud = recordingTheme();
  indicator(STATES.attention, false, loud, NOW);
  assert.ok(loud.calls.includes('error'));
});

test('state colors: warning and error only when the human must act', () => {
  // 'not set up' is warning on purpose: no model is chosen and only the human can fix that.
  /** @type {Record<string, string[]>} */
  const calm = { review: [], 'final review': [], question: [], blocked: [], working: [], starting: [], done: [], ready: [], off: [], stopped: [], several: [] };
  for (const name of Object.keys(calm)) {
    const s = STATES[name], state = workerState(s, s.workers[0], false, NOW);
    assert.equal(['warning', 'error'].includes(state.color), false, `${name} painted ${state.color}`);
  }
  for (const [name, color] of Object.entries({ attention: 'error', error: 'error', permission: 'warning', stalled: 'warning', paused: 'warning', interrupted: 'warning', 'waiting reports': 'warning', 'not set up': 'warning' })) {
    const s = STATES[name];
    assert.equal(workerState(s, s.workers[0], false, NOW).color, color, `${name} should be ${color}`);
  }
});

test('the live line never exceeds the width it is given', () => {
  for (const [name, s] of Object.entries(STATES)) {
    for (const width of [20, 40, 60, 80, 120, 200]) {
      const lines = liveLine(s, width, undefined, NOW);
      assert.ok(lines.length <= 1, `${name} rendered ${lines.length} lines`);
      for (const line of lines) assert.ok(visibleWidth(strip(line)) <= width, `${name} at ${width}: "${strip(line)}" (${visibleWidth(strip(line))})`);
    }
  }
});

test('the live line keeps the n/m count and the title, and adds detail as width grows', () => {
  const s = STATES.working;
  for (const width of [20, 40, 60, 80, 120, 200]) {
    const line = strip(liveLine(s, width, undefined, NOW)[0]);
    assert.ok(line.includes('2/4'), `width ${width}: "${line}" lost the step count`);
  }
  // Below ~35 columns the title cannot keep its 16-column minimum, so the count stands alone.
  for (const width of [40, 60, 80, 120, 200]) {
    const line = strip(liveLine(s, width, undefined, NOW)[0]);
    assert.ok(line.includes('Wire retries'), `width ${width}: "${line}" lost the title`);
  }
  // The count is labelled so it is never read as '2 approved'; even at 20 columns it keeps that word.
  assert.equal(strip(liveLine(s, 20, undefined, NOW)[0]), '■■■▣▣□□□□□ step 2/4');
  const wide = strip(liveLine(s, 200, undefined, NOW)[0]);
  for (const part of ['■■■▣▣□□□□□ step 2/4', '▶ Wire retries into fetch client', 'editing client.js', '3m12s', 'rev 1/3', '$0.14/$2.00']) {
    assert.ok(wide.includes(part), `200 columns should include ${part}: ${wide}`);
  }
  // Only the basename, so the live line keeps room for the title.
  assert.equal(wide.includes('src/http/client.js'), false, 'the live line shows a basename, not the path');
  const medium = strip(liveLine(s, 80, undefined, NOW)[0]);
  assert.equal(medium.includes('$0.14'), false, 'cost is the lowest priority and should be gone at 80');
  assert.ok(medium.includes('editing client.js'), medium);
  // A command target is not a path, so it stays as given.
  const command = summary({ workers: [worker({ observation: { at: NOW - 5000, currentTool: 'bash', currentTarget: 'npm test -- --watch' } })] });
  assert.ok(strip(liveLine(command, 200, undefined, NOW)[0]).includes('running npm test -- --watch'));
});

test('the bar gives the step under way its own cells, in its color', () => {
  /** @type {Array<[string, string]>} */
  const painted = [];
  const theme = { fg: (/** @type {string} */ color, /** @type {string} */ text) => { painted.push([color, text]); return text; } };
  // One of four approved and step 2 under way: approved cells, then the current step's, then the rest.
  liveLine(STATES.working, 20, theme, NOW);
  const cells = (/** @type {string} */ color, /** @type {string} */ text) => painted.some(([c, t]) => c === color && t === text);
  assert.ok(cells('success', '■■■') && cells('accent', '▣▣') && cells('dim', '□□□□□'), JSON.stringify(painted));
  // A held step's cells carry its warning.
  painted.length = 0;
  const held = summary({ workers: [worker({ status: 'paused', task: task({ status: 'paused', stepList: [step('Add retry policy type', 'done'), step('Wire retries into fetch client', 'held'), step('Tests for backoff', 'todo'), step('Document retries', 'todo')] }) })] });
  liveLine(held, 20, theme, NOW);
  assert.ok(cells('warning', '▣▣'), JSON.stringify(painted));
  // With every step approved nothing is under way.
  assert.equal(strip(liveLine(STATES.done, 20, undefined, NOW)[0]), '■■■■■■■■■■ step 4/4');
});

test('a cancelled task leaves the live line and the board at once', () => {
  const cancelled = summary({ workers: [worker({ status: 'ready', task: task({ status: 'cancelled' }) })] });
  assert.deepEqual(liveLine(cancelled, 80, undefined, NOW), []);
  assert.deepEqual(boardLines(cancelled, 80, undefined, NOW), []);
});

test('a finished plan stops its clock and leaves when its badge settles', () => {
  // Finished a second ago after 3m11s of work.
  const at = (/** @type {number} */ now) => strip(liveLine(STATES.done, 200, undefined, now)[0] ?? '');
  assert.ok(at(NOW).includes('3m11s'), at(NOW));
  assert.ok(at(NOW + 5 * 60000).includes('3m11s'), 'the clock stopped when the task ended: ' + at(NOW + 5 * 60000));
  assert.ok(strip(boardLines(STATES.done, 80, undefined, NOW + 5 * 60000)[0]).includes('3m11s'));
  // Ten minutes after it finished the plan leaves, as the ✔ badge does.
  assert.deepEqual(liveLine(STATES.done, 200, undefined, NOW + 10 * 60000), []);
  assert.deepEqual(boardLines(STATES.done, 80, undefined, NOW + 10 * 60000), []);
  // Another worker's plan then takes the line.
  const s = summary({ workers: [worker({ status: 'ready', task: allDone() }), worker({ id: 'w2', status: 'paused', task: task({ status: 'paused', objective: 'Second objective' }) })] });
  assert.ok(strip(liveLine(s, 200, undefined, NOW)[0]).includes('4/4'), 'the fresh ✔ shows first');
  const later = strip(liveLine(s, 200, undefined, NOW + 10 * 60000)[0] ?? '');
  assert.ok(later.startsWith('w2 ') && later.includes('2/4'), later);
  assert.ok(strip(boardLines(s, 80, undefined, NOW + 10 * 60000)[0]).includes('Second objective'));
});

test('a held task names its state and next step, and its clock stops', () => {
  // 30 minutes of work, held 12 minutes ago, with no observation so only the held age can move anything.
  const held = summary({ workers: [worker({ status: 'paused', task: task({ status: 'paused', startedAt: NOW - 30 * 60000, updatedAt: NOW - 12 * 60000, stepList: [step('Add retry policy type', 'done'), step('Wire retries into fetch client', 'held'), step('Tests for backoff', 'todo'), step('Document retries', 'todo')] }), observation: null })] });
  const live = (/** @type {number} */ now) => strip(liveLine(held, 120, undefined, now)[0] ?? '');
  assert.ok(live(NOW).includes('paused 12m · /pair resume'), live(NOW));
  // The clock stopped when the task was held: 30m of work minus the 12m it has been waiting.
  assert.ok(live(NOW).includes('18m00s'), live(NOW));
  assert.equal(live(NOW).includes('held '), false, 'the old wording is gone: ' + live(NOW));
  // Half a minute later nothing has moved, because neither the clock nor the held minutes have.
  for (const delta of [1000, 30000, 59000]) assert.equal(live(NOW + delta), live(NOW), `a held task must not redraw at + ${delta}ms`);
  // A minute later the held age moves; the elapsed time does not.
  assert.ok(live(NOW + 60000).includes('paused 13m · /pair resume'), live(NOW + 60000));
  assert.ok(live(NOW + 60000).includes('18m00s'), live(NOW + 60000));
  const heldBoard = boardLines(held, 90, undefined, NOW).map(strip);
  assert.ok(heldBoard.some(line => line.includes('paused 12m · /pair resume')), heldBoard.join('\n'));
  // The signature follows the same rule: steady for a tick, moved once a minute.
  for (const delta of [1000, 30000, 59000]) assert.equal(widgetSignature(held, 'minimal', NOW), widgetSignature(held, 'minimal', NOW + delta), `steady at + ${delta}ms`);
  assert.notEqual(widgetSignature(held, 'minimal', NOW), widgetSignature(held, 'minimal', NOW + 60000), 'the held age moves once a minute');
  assert.notEqual(widgetSignature(held, 'minimal', NOW + 60000), widgetSignature(held, 'minimal', NOW + 120000));
  // An interrupted task is worded the same way.
  const interrupted = summary({ workers: [worker({ status: 'interrupted', task: task({ status: 'interrupted', startedAt: NOW - 30 * 60000, updatedAt: NOW - 65 * 60000 }), observation: null })] });
  const interruptedLine = strip(liveLine(interrupted, 120, undefined, NOW)[0] ?? '');
  assert.ok(interruptedLine.includes('interrupted 65m · /pair resume'), interruptedLine);
  // A crashed worker holding a paused task is an attention state, and its row points at the reconcile step.
  const crashHeld = summary({ workers: [worker({ status: 'error', error: 'EXIT_UNCONFIRMED: worker vanished', task: task({ status: 'paused', startedAt: NOW - 30 * 60000, updatedAt: NOW - 12 * 60000 }), observation: null })] });
  const crashRow = boardLines(crashHeld, 140, undefined, NOW).map(strip).find(line => line.includes('⚠'));
  assert.ok(crashRow?.includes('/pair reconcile'), `an unconfirmed exit is reconciled first: ${crashRow}`);
  assert.ok(boardLines(interrupted, 90, undefined, NOW).map(strip).some(line => line.includes('interrupted 65m')), 'the board names the interrupted state');
  // No surface says 'held <age>' any more.
  for (const [name, s] of Object.entries({ held, interrupted })) {
    for (const now of [NOW, NOW + 60000]) {
      assert.equal(/\bheld \d/.test(strip(liveLine(s, 120, undefined, now)[0] ?? '')), false, name);
      for (const line of boardLines(s, 90, undefined, now)) assert.equal(/\bheld \d/.test(strip(line)), false, name);
      for (const line of dashboardLines(s, 90, now)) assert.equal(/\bheld \d/.test(strip(line)), false, name);
    }
  }
});

test('the widget signature ticks only while a task runs', () => {
  assert.notEqual(widgetSignature(STATES.working, 'minimal', NOW), widgetSignature(STATES.working, 'minimal', NOW + 1000), 'a running clock redraws each second');
  const done = summary({ workers: [worker({ status: 'ready', task: allDone(), observation: null })] });
  assert.equal(widgetSignature(done, 'minimal', NOW), widgetSignature(done, 'minimal', NOW + 9 * 60000), 'a finished task has nothing to redraw');
  assert.notEqual(widgetSignature(done, 'minimal', NOW), widgetSignature(done, 'minimal', NOW + 10 * 60000), 'the plan leaving is a change');
  const cancelled = summary({ workers: [worker({ status: 'ready', task: task({ status: 'cancelled' }), observation: null })] });
  assert.equal(widgetSignature(cancelled, 'minimal', NOW), widgetSignature(cancelled, 'minimal', NOW + 5000));
});

test('the live line without a task is empty', () => {
  assert.deepEqual(liveLine(summary({ workers: [worker({ task: null })] }), 80, undefined, NOW), []);
  assert.deepEqual(liveLine(summary({ workers: [] }), 80, undefined, NOW), []);
  assert.deepEqual(liveLine(STATES.working, 0, undefined, NOW), []);
});

test('segments drop lowest rank first and the title flexes to its minimum', () => {
  /** @returns {import('../src/ui.js').LiveSegment[]} */
  const segments = () => [
    { rank: 1, key: 'progress', color: 'dim', text: '1/3', plain: '1/3' },
    { rank: 3, key: 'title', color: 'accent', text: '▶ Short', plain: '▶ Short', flex: true, min: 16 },
    { rank: 5, key: 'elapsed', color: 'muted', text: '3m12s', plain: '3m12s' },
    { rank: 7, key: 'cost', color: 'muted', text: '$0.14', plain: '$0.14' },
  ];
  const wide = fitSegments(segments(), 200);
  assert.ok(wide?.includes('$0.14') && wide.includes('3m12s') && wide.includes('Short'));
  // The title is too short to flex, so space pressure removes the lowest ranks first.
  const narrow = fitSegments(segments(), 20);
  assert.ok(narrow && !narrow.includes('$0.14'), `cost should drop first: ${narrow}`);
  assert.ok(narrow.includes('3m12s') === false, `elapsed should drop second: ${narrow}`);
  assert.ok(narrow.includes('1/3') && narrow.includes('▶ Short'), String(narrow));
  assert.ok(visibleWidth(String(narrow)) <= 20);
  // A long title flexes to its 16-column minimum before a higher rank is dropped.
  const flexing = () => [
    { rank: 1, key: 'progress', color: 'dim', text: '1/3', plain: '1/3' },
    { rank: 3, key: 'title', color: 'accent', text: '▶ A step title that is quite long indeed', plain: '▶ A step title that is quite long indeed', flex: true, min: 16 },
    { rank: 7, key: 'cost', color: 'muted', text: '$0.14', plain: '$0.14' },
  ];
  // The title is the point of the line: while it would have to give up anything more, cost goes instead.
  const fitted = String(fitSegments(flexing(), 40));
  assert.equal(fitted.includes('$0.14'), false, `cost goes before the long title shortens: ${fitted}`);
  assert.ok(fitted.includes('A step title that is quite long'), `the title keeps its width: ${fitted}`);
  assert.ok(visibleWidth(fitted) <= 40);
  assert.ok(visibleWidth(String(fitSegments(flexing(), 26))).valueOf() <= 26);
  // A rank-2 alert survives while anything above rank 2 remains.
  /** @type {import('../src/ui.js').LiveSegment[]} */
  const withAlert = [{ rank: 1, key: 'progress', color: 'dim', text: '2/4', plain: '2/4' },
    { rank: 2, key: 'alert', color: 'warning', text: '⚠ no activity 6m', plain: '⚠ no activity 6m' },
    { rank: 3, key: 'title', color: 'accent', text: '▶ Wire retries into the fetch client', plain: '▶ Wire retries into the fetch client', flex: true, min: 16 }];
  const alertLine = fitSegments(withAlert.map(segment => ({ ...segment })), 60);
  assert.ok(alertLine?.includes('⚠ no activity 6m'), `alert must survive at 60: ${alertLine}`);
  assert.ok(alertLine.includes('Warning') === false);
  // Progress and the alert are the last two to remain ('2/4 · ⚠ no activity 6m' is exactly 22 wide).
  assert.equal(fitSegments(withAlert.map(segment => ({ ...segment })), 22), '2/4 · ⚠ no activity 6m');
  assert.equal(fitSegments(withAlert.map(segment => ({ ...segment })), 20), '2/4');
  // When even that cannot fit, nothing survives and the caller drops the line.
  assert.equal(fitSegments([{ rank: 1, key: 'progress', color: 'dim', text: '2/4', plain: '2/4' }], 2), null);
});

test('an active alert survives at 60 columns', () => {
  const stalled = strip(liveLine(STATES.stalled, 60, undefined, NOW)[0]);
  assert.ok(stalled.includes('⚠ no activity 6m'), stalled);
  assert.ok(stalled.includes('2/4'), stalled);
  const permission = strip(liveLine(STATES.permission, 60, undefined, NOW)[0]);
  assert.ok(permission.includes('⚠ permission dialog'), permission);
});

test('step revisions at the limit and a failed verification raise a live alert', () => {
  const limited = summary({ workers: [worker({ task: task({ stepRevisions: 3 }) })] });
  assert.ok(strip(liveLine(limited, 120, undefined, NOW)[0]).includes('revision limit'));
  const failed = summary({ workers: [worker({ status: 'review', task: task({ status: 'review', lastVerification: [{ name: 'typecheck', passed: true, timedOut: false, code: 0 }, { name: 'test', passed: false, timedOut: false, code: 1 }] }) })] });
  assert.ok(strip(liveLine(failed, 120, undefined, NOW)[0]).includes('Pair verification failed: test'));
});

test('the board has a header, one row per step, and stays within the width', () => {
  const lines = boardLines(STATES.working, 80, undefined, NOW).map(strip);
  assert.equal(lines.length, 5, lines.join('\n'));
  assert.ok(lines[0].startsWith('Pair · Add retry and backoff'), lines[0]);
  assert.ok(lines[0].endsWith('3m12s · $0.14/$2.00'), lines[0]);
  assert.ok(lines[1].startsWith('✔ 1 Add retry policy type'));
  assert.ok(lines[2].startsWith('▶ 2 Wire retries into fetch client'));
  assert.ok(lines[2].includes('editing client.js'), lines[2]);
  assert.ok(lines[2].includes('rev 1/3'));
  assert.ok(lines[3].startsWith('○ 3 Tests for backoff'));
  for (const width of [20, 40, 60, 80, 120, 160]) {
    for (const line of boardLines(STATES.working, width, undefined, NOW)) assert.ok(visibleWidth(strip(line)) <= width, `${width}: ${strip(line)}`);
  }
});

test('a long plan collapses finished steps into one row', () => {
  const steps = Array.from({ length: 12 }, (_, index) => step(`Step ${index + 1}`, index < 6 ? 'done' : index === 6 ? 'active' : 'todo', `s${index + 1}`));
  const long = summary({ workers: [worker({ task: task({ step: 7, steps: 12, stepList: steps }) })] });
  const lines = boardLines(long, 80, undefined, NOW).map(strip);
  // The folded row uses the same word as the dashboard's folded row.
  assert.ok(lines.some(line => line.startsWith('✔ 1–6 approved')), lines.join('\n'));
  assert.equal(lines.filter(line => /^✔ 1–\d+ approved$/.test(line)).length, 1);
  assert.equal(lines.some(line => line.endsWith(' done')), false, lines.join('\n'));
  assert.ok(lines.length <= 1 + 1 + (12 - 6), lines.join('\n'));
  // Short plans keep every row.
  const short = boardLines(STATES.working, 80, undefined, NOW).map(strip);
  assert.equal(short.some(line => line.endsWith(' done')), false);
});

test('the board shows every alert the live line shows, and an attention row says what to do', () => {
  /** @param {object} over @returns {string[]} */
  const board = over => boardLines(summary({ workers: [worker(over)] }), 90, undefined, NOW).map(strip);
  /** @param {object} over @returns {string} */
  const live = over => strip(liveLine(summary({ workers: [worker(over)] }), 120, undefined, NOW)[0] ?? '');
  /** @param {string[]} lines @returns {string | undefined} */
  const alertRow = lines => lines.find(line => line.includes('⚠'));
  // A plain working worker has no alert on either surface.
  assert.equal(alertRow(board({})), undefined, 'a plain working fixture needs no alert');
  assert.equal(live({}).includes('⚠'), false);
  // Every alert the live line raises now reaches the board too, with the same words.
  /** @type {Record<string, object>} */
  const cases = {
    'failed verification': { task: task({ lastVerification: [{ name: 'test', passed: false, timedOut: false, code: 1 }] }) },
    'limit notice': { task: task({ limitNotice: 'Reported inference-cost budget reached' }) },
    'step revision limit': { task: task({ stepRevisions: 3 }) },
    'context 92%': { observation: { at: NOW - 5000, currentTool: 'edit', currentTarget: 'src/http/client.js', context: { tokens: 184000, contextWindow: 200000, percent: 92 } } },
    'permission dialog': { status: 'permission' },
    'stalled worker': { observation: { at: NOW - 400000, currentTool: 'bash', currentTarget: 'npm test' } },
  };
  for (const [name, over] of Object.entries(cases)) {
    const row = alertRow(board(over));
    assert.ok(row, `${name}: the board should carry an alert row: ` + board(over).join(' | '));
    assert.ok(live(over).includes(row.replace('⚠ ', '')) || name === 'permission dialog' || name === 'stalled worker', `${name}: the board alert should match the live one: ${row}`);
    assert.ok(visibleWidth(row) <= 90, `${name}: ${row}`);
  }
  assert.equal(alertRow(board(cases['failed verification'])), '⚠ Pair verification failed: test');
  // An attention alert names the error and the next step, which the live line leaves to its own line.
  const crashed = board({ status: 'error', pid: null, error: 'Worker exited unexpectedly (code 1)', observation: { at: NOW - 60000, currentTool: 'bash', currentTarget: 'npm test' } });
  const crashedRow = alertRow(crashed);
  assert.ok(crashedRow, crashed.join('\n'));
  assert.ok(crashedRow.includes('Worker exited unexpectedly'), crashedRow);
  assert.ok(crashedRow.includes('/pair'), crashedRow);
  assert.equal(crashedRow.includes('npm test'), false, 'the stale tool never reaches the alert row');
  for (const width of [20, 30, 45, 60, 90, 120]) {
    for (const line of boardLines(summary({ workers: [worker({ status: 'error', pid: null, error: 'Worker exited unexpectedly (code 1)' })] }), width, undefined, NOW)) {
      assert.ok(visibleWidth(strip(line)) <= width, `${width}: ${strip(line)}`);
    }
  }
  // The next step outranks the error: a long error gives way, clipped with '…', so the command survives.
  const vanished = summary({ workers: [worker({ status: 'error', pid: null, error: 'EXIT_UNCONFIRMED: worker vanished. Stop/reconcile before reusing this generation.' })] });
  /** @param {number} width @returns {string} */
  const vanishedRow = width => boardLines(vanished, width, undefined, NOW).map(strip).find(line => line.includes('⚠')) ?? '';
  for (const width of [90, 60]) {
    const row = vanishedRow(width);
    assert.ok(row.endsWith('/pair reconcile'), `${width}: the next step must survive: ${row}`);
    assert.ok(/… · \/pair reconcile$/.test(row), `${width}: the error is clipped with an ellipsis: ${row}`);
    assert.ok(visibleWidth(row) <= width, `${width}: ${row}`);
  }
  // Without room for both, the error goes entirely and the alert text and next step still stand.
  assert.equal(vanishedRow(46), '⚠ worker needs attention · /pair reconcile');
  // No row ever ends in a dangling separator, at any width.
  for (const width of [20, 30, 40]) {
    for (const line of boardLines(vanished, width, undefined, NOW).map(strip)) {
      assert.equal(/·…$| · $/.test(line), false, `${width}: dangling separator in ${line}`);
      assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
    }
  }
  // Every alert row, at every width from 12 to 100: no clip lands on a separator or a space, and it fits.
  const crashedFixture = summary({ workers: [worker({ status: 'error', pid: null, error: 'Worker exited unexpectedly (code 1)' })] });
  const yieldOff = summary({ autoDeliverReports: false, waitingReports: 2, workers: [worker({ status: 'review', task: task({ status: 'review', reportId: 'r' }) })] });
  const noPlan = summary({ workers: [worker({ status: 'error', pid: null, task: null, error: 'Worker exited unexpectedly (code 1)' })] });
  /** @param {string[]} lines @returns {string[]} */
  const alertRows = lines => lines.filter(line => line.includes('⚠'));
  for (let width = 12; width <= 100; width++) {
    /** @type {Array<[string, string[]]>} */
    const rowsBySurface = [
      ['vanished', alertRows(boardLines(vanished, width, undefined, NOW).map(strip))],
      ['crashed', alertRows(boardLines(crashedFixture, width, undefined, NOW).map(strip))],
      ['yield off', alertRows(boardLines(yieldOff, width, undefined, NOW).map(strip))],
      // The no-plan alert line above the editor has the same shape and the same rule.
      ['no-plan alert', liveLine(noPlan, width, undefined, NOW).map(strip)],
    ];
    for (const [name, lines] of rowsBySurface) {
      assert.ok(lines.length > 0, `${name} at ${width}: the alert row should render`);
      for (const line of lines) {
        assert.equal(/[·\s]…$/.test(line) || / · $/.test(line), false, `${name} at ${width}: a clip landed on a separator: ${line}`);
        assert.ok(visibleWidth(line) <= width, `${name} at ${width}: ${line}`);
      }
    }
  }
});

test('the board renders nothing without a task and paints with the theme', () => {
  assert.deepEqual(boardLines(summary({ workers: [worker({ task: null })] }), 80, undefined, NOW), []);
  const theme = recordingTheme();
  const lines = boardLines(STATES.working, 80, theme, NOW);
  assert.ok(lines.length > 0);
  assert.ok(theme.calls.includes('success') && theme.calls.includes('accent'));
  for (const line of lines) assert.ok(visibleWidth(strip(line)) <= 80);
});

test('the live widget and board widget never exceed their width, and drop lines at zero width', () => {
  for (const [name, widget] of /** @type {const} */ ([['live', liveWidget], ['board', boardWidget]])) {
    for (const width of [0, 1, 20, 40, 60, 80, 120, 200]) {
      const lines = widget(() => STATES.working, /** @type {any} */ (null)).render(width);
      for (const line of lines) assert.ok(visibleWidth(strip(line)) <= width || width === 0, `${name} at ${width}: ${strip(line)}`);
      if (width === 0) assert.deepEqual(lines, []);
    }
    assert.deepEqual(widget(() => null, /** @type {any} */ (null)).render(80), []);
  }
});

test('the status view is quiet: no placeholder rows, no legend, no warming paragraph', () => {
  /** A measured cache read of 98.8%: every field validateUsageObservation requires. */
  const cacheUsage = { input: 12, cacheRead: 988, cacheWrite: 0, totalInput: 1000, output: 4, cacheRatio: 0.988, cost: 0, observedAt: NOW - 5000 };
  const busy = statusText(STATES.working, null, NOW);
  // Step rows carry the symbol alone; "complete ✔ 1." would repeat what the symbol says.
  assert.ok(busy.includes('  ✔ 1. Add retry policy type'), busy);
  assert.equal(busy.includes('complete'), false, busy);
  // The progress row uses the live line's bar words and says "step 2 of 4".
  assert.ok(busy.includes('Progress    ■▣□□ step 2 of 4 · 1 approved'), busy);
  assert.ok(busy.includes('step 2 of 4'), busy);
  assert.equal(busy.includes('1/4 approved'), false, busy);
  // The legend and the warming explanation moved to /pair doctor; status keeps one pointer.
  assert.equal(busy.includes('## Legend'), false, busy);
  assert.equal(busy.includes('Warming'), false, busy);
  assert.equal(busy.includes("Pi's native idle refreshes"), false, busy);
  assert.ok(busy.includes('Legend and cache warming details: /pair doctor'), busy);
  // Measured data still shows, and the speed label is the same everywhere: no "avg " prefix.
  const measuredSpeed = summary({ workers: [worker({ observation: { at: NOW - 5000, currentTool: 'edit', speed: { tokens: 4000, seconds: 80 } } })] });
  const withSpeed = statusText(measuredSpeed, null, NOW);
  assert.ok(withSpeed.includes('Speed       50.0 tok/s'), withSpeed);
  assert.equal(withSpeed.includes('avg '), false, 'the speed label carries no "avg " prefix: ' + withSpeed);
  const liveWithSpeed = strip(liveLine(measuredSpeed, 200, undefined, NOW)[0]);
  assert.ok(liveWithSpeed.includes('50.0 tok/s'), liveWithSpeed);
  assert.equal(liveWithSpeed.includes('avg '), false, liveWithSpeed);
  // An unmeasured speed leaves no empty detail behind: no dangling separator in the header.
  const noSpeed = summary({ workers: [worker({ observation: { at: Date.now() - 1000, currentTool: 'edit', currentTarget: 'src/x.js' } })] });
  const header = dashboardHeader(noSpeed).join(' | ');
  assert.equal(/ ·\s*$/.test(header), false, 'no trailing separator: ' + header);
  assert.equal(header.includes('tok/s'), false, header);
  // The same holds on the live line.
  assert.equal(strip(liveLine(noSpeed, 200, undefined, NOW)[0]).includes('tok/s'), false);

  // A worker with nothing measured prints no Speed, no Cache and no Context row, only what it knows.
  const bare = summary({ workers: [worker({ observation: null })] });
  const quiet = statusText(bare, null, NOW);
  assert.equal(quiet.includes('tok/s'), false, quiet);
  assert.equal(quiet.includes('unknown'), false, quiet);
  assert.equal(quiet.includes('Context'), false, quiet);
  assert.equal(quiet.includes('## Activity'), false, 'nothing in flight and nothing measured: ' + quiet);
  // An idle worker keeps no stale tool from its last run.
  const idle = summary({ workers: [worker({ status: 'ready', task: null, observation: { at: NOW - 5000, currentTool: 'edit', currentTarget: 'src/x.js', context: { tokens: 82000, contextWindow: 200000, percent: 41 } } })] });
  const idleText = statusText(idle, null, NOW);
  assert.equal(idleText.includes('## Activity'), false, 'an idle worker shows no stale tool data: ' + idleText);
  assert.equal(idleText.includes('Tool'), false, idleText);
  // A worker with a tool but no task still shows the tool: it is working right now.
  const toolOnly = summary({ workers: [worker({ status: 'working', task: null, observation: { at: NOW - 5000, currentTool: 'bash' } })] });
  assert.ok(statusText(toolOnly, null, NOW).includes('Tool'), statusText(toolOnly, null, NOW));
  // A cache reading shows when one exists; a context row only with data.
  const measured = summary({ workers: [worker({ observation: { at: NOW - 5000, currentTool: 'edit', context: { tokens: 82000, contextWindow: 200000, percent: 41 }, lastUsage: cacheUsage } })] });
  const measuredText = statusText(measured, null, NOW);
  assert.ok(measuredText.includes('last read 98.8%'), measuredText);
  assert.ok(measuredText.includes('82k of 200k tokens (41%)'), measuredText);
  // Main's own cache row follows the same rule.
  const noMainCache = summary({ main: { model: 'provider/model', busy: false, lastUsage: null } });
  assert.equal(statusText(noMainCache, null, NOW).includes('last read unknown'), false);
  // summary.cacheNote stays in status only when it says something.
  assert.equal(statusText(STATES.working, null, NOW).includes('Cache observations describe'), false);
  const noted = summary({ cacheNote: 'Cache observations describe past requests.' });
  assert.ok(statusText(noted, null, NOW).includes('Cache observations describe past requests.'), statusText(noted, null, NOW));
});

test('/pair doctor carries the legend and the warming explanation, and status points at it', () => {
  /** @param {object} [over] */
  const doctor = (over = {}) => doctorText({
    main: { model: { provider: 'anthropic', id: 'claude-opus' }, thinkingLevel: 'high', trusted: true, capabilities: { fabric: true, fovea: true, pairReport: true }, versions: { fabric: '0.97.0', fovea: '0.31.1' } },
    pair: summary(), configuration: { version: 1, scope: 'global', pendingMigrations: [] }, blockers: [], raw: { ok: true }, ...over });
  const text = doctor({ native: { cacheWarming: 'off' } });
  assert.ok(text.includes('## Legend'), text);
  for (const part of ['● ready', '◉ working', '◐ waiting on Main', '! needs attention', 'Bar: ■ approved', '▣ the step under way', 'Heartbeat', 'Cache: cacheRead', 'Speed: weighted streaming output tokens per second']) {
    assert.ok(text.includes(part), 'the legend should keep ' + part + ': ' + text);
  }
  assert.ok(text.includes('## Native cache warming'), text);
  assert.ok(text.includes("Pi's native idle refreshes"), text);
  assert.ok(text.includes('native off (not warmed)'), 'the native setting is quoted: ' + text);
  assert.ok(text.includes('Fabric cache.hold'), text);
  // The summary's cache note rides along here too.
  assert.ok(doctor({ native: { cacheWarming: 'idle' }, pair: summary({ cacheNote: 'Cache observations describe past requests.' }) }).includes('Cache observations describe past requests.'));
  // Without native settings the section still explains warming, just without a setting to quote.
  const bare = doctor();
  assert.ok(bare.includes("Pi's native idle refreshes"), bare);
  assert.equal(bare.includes('native off'), false, bare);
  // The doctor view still has its own sections.
  for (const part of ['## Main session', '## Extensions', '## Configuration', '## Workers', '## Raw data']) assert.ok(text.includes(part), part);
  // And the status view only points here.
  const status = statusText(summary(), null, NOW);
  assert.equal(status.includes('## Legend'), false);
  assert.ok(status.includes('/pair doctor'), status);
});

test('statusText and dashboardHeader still render after the classifier move', () => {
  const text = statusText(STATES.working, null, NOW);
  assert.ok(text.includes('## Worker · w1'));
  assert.ok(text.includes('◉ working'));
  assert.ok(text.includes('## Task · task-1'));
  assert.ok(text.includes('▶ 2. Wire retries into fetch client'));
  assert.ok(!text.includes('undefined'));
  // The dashboard header keeps its shape (state sentence plus details, no badge words).
  // dashboardHeader reads the wall clock, so give it fresh activity to see the working state.
  const live = summary({ workers: [worker({ observation: { at: Date.now() - 1000, currentTool: 'edit', currentTarget: 'src/http/client.js' } })] });
  const header = dashboardHeader(live).join(' | ');
  assert.ok(header.includes('◉ Worker working on step 2/4'), header);
  assert.ok(header.includes('Wire retries into fetch client'), header);
  // A silent worker is reported as needing attention, not as working.
  assert.ok(dashboardHeader(STATES.stalled).join(' | ').startsWith('! Worker idle'));
  assert.ok(header.includes('Wire retries into fetch client'));
});


test('the working badge shows elapsed time, never an alert label', () => {
  assert.equal(strip(footerBadge(STATES.working, NOW)), 'pair ◉ 2/4 3m');
  const cases = {
    'failed verification': task({ lastVerification: [{ name: 'typecheck', passed: true, timedOut: false, code: 0 }, { name: 'test', passed: false, timedOut: false, code: 1 }] }),
    'limit notice': task({ limitNotice: 'Reported inference-cost budget reached' }),
    'step revisions at the limit': task({ stepRevisions: 3 }),
    'all three': task({ stepRevisions: 3, limitNotice: 'Output-token budget reached', lastVerification: [{ name: 'test', passed: false, timedOut: false, code: 1 }] }),
  };
  for (const [name, t] of Object.entries(cases)) {
    const s = summary({ workers: [worker({ task: t })] });
    const state = workerState(s, s.workers[0], false, NOW);
    assert.ok(state.reason, `${name}: the alert should still set a reason`);
    const badge = strip(footerBadge(s, NOW));
    assert.equal(badge, 'pair ◉ 2/4 3m', `${name}: ${badge}`);
    // The alert belongs to the live line instead.
    assert.ok(strip(liveLine(s, 160, undefined, NOW)[0]).includes('⚠'), `${name}: the live line should carry the alert`);
  }
});

test('the live line says "step N/M" while the bar is drawn and drops the word only with the bar', () => {
  const s = STATES.working;
  // A drawn bar always carries the labelled count.
  for (const width of [20, 40, 60, 80, 100, 160, 200]) {
    const line = strip(liveLine(s, width, undefined, NOW)[0]);
    assert.ok(line.includes('□') || line.includes('■') || line.includes('▣'), `${width}: expected a bar in ${line}`);
    assert.ok(line.includes('step 2/4'), `${width}: the count must read as a step: ${line}`);
    assert.equal(/ · 2\/4/.test(line), false, `${width}: a bare count next to a bar: ${line}`);
  }
  // The bare count is reached only when the bar itself is gone, i.e. every lower rank went first.
  for (const width of [6, 8, 10]) {
    const bare = strip(liveLine(s, width, undefined, NOW)[0] ?? '');
    assert.equal(bare, '2/4', `the bare count stands alone at ${width}: ${bare}`);
  }
  // The bar keeps ■ for approved steps and ▣ for the step under way, never a third glyph.
  const bar = strip(liveLine(s, 40, undefined, NOW)[0]).split(' ')[0];
  assert.match(bar, /^■+▣+□+$/, bar);
});

test('a narrower bar is preferred over dropping the alert or the step title', () => {
  const alerting = {
    'failed verification': summary({ workers: [worker({ status: 'review', task: task({ status: 'review', reportId: 'r', reportKind: 'checkpoint', lastVerification: [{ name: 'typecheck', passed: true, timedOut: false, code: 0 }, { name: 'test', passed: false, timedOut: false, code: 1 }] }) })] }),
    'stalled worker': STATES.stalled,
    'waiting reports': STATES['waiting reports'],
    'permission dialog': STATES.permission,
  };
  for (const [name, s] of Object.entries(alerting)) {
    for (const width of [40, 50, 60, 80]) {
      const line = strip(liveLine(s, width, undefined, NOW)[0] ?? '');
      assert.ok(line.includes('⚠'), `${name} at ${width} lost its alert: ${line}`);
      assert.ok(line.includes('2/4'), `${name} at ${width} lost the step count: ${line}`);
      assert.ok(visibleWidth(line) <= width, `${name} at ${width}: ${line}`);
    }
  }
  // The alert text itself survives while the bar gives up its cells.
  for (const width of [40, 50]) {
    assert.ok(strip(liveLine(alerting['failed verification'], width, undefined, NOW)[0] ?? '').includes('Pair verification failed: test'), width + ' should keep the alert text');
    assert.ok(strip(liveLine(STATES.stalled, width, undefined, NOW)[0] ?? '').includes('no activity 6m'), width + ': ' + strip(liveLine(STATES.stalled, width, undefined, NOW)[0] ?? ''));
    assert.ok(strip(liveLine(STATES['waiting reports'], width, undefined, NOW)[0] ?? '').includes('2 reports waiting'), width + ' should keep the waiting alert');
  }
  // The same rule protects the step title: a narrower bar lets it keep a reading width at 30-45 columns.
  for (const width of [30, 32, 35, 40, 45]) {
    const line = strip(liveLine(STATES.working, width, undefined, NOW)[0] ?? '');
    const title = line.slice(line.indexOf('▶ '), line.indexOf('▶ ') + 16);
    assert.ok(visibleWidth(title) >= 16, `${width} should keep a 16-column title: ${line}`);
    assert.ok(line.includes('step 2/4'), `${width}: the count stays labelled: ${line}`);
    assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  }
});

test('a completed live line carries no speed, and a stopped worker shows no context', () => {
  // The live line: a finished task keeps its elapsed time and cost, and drops the streaming speed too.
  const finished = summary({ workers: [worker({ status: 'ready', task: allDone(), observation: { at: NOW - 5000, speed: { tokens: 4000, seconds: 80 }, context: { tokens: 82000, contextWindow: 200000, percent: 41 } } })] });
  const line = strip(liveLine(finished, 200, undefined, NOW)[0]);
  assert.equal(line.includes('tok/s'), false, 'a finished task is not streaming: ' + line);
  assert.ok(line.includes('3m11s'), line);
  assert.ok(line.includes('$0.14'), line);
  // A running task still shows its measured speed.
  assert.ok(strip(liveLine(summary({ workers: [worker({ observation: { at: NOW - 5000, currentTool: 'edit', speed: { tokens: 4000, seconds: 80 } } })] }), 200, undefined, NOW)[0]).includes('50.0 tok/s'));

  // The dashboard header: a context reading belongs to a running process only.
  /** @param {{status: string, pid: number | null, percent: number | null}} options */
  const withContext = ({ status, pid, percent }) => summary({ workers: [worker({ status, pid, task: null, observation: percent == null ? null : { at: NOW - 5000, context: { tokens: 82000, contextWindow: 200000, percent } } })] });
  /** @param {any} s */
  const header = s => strip(dashboardLines(s, 100, NOW).find(text => text.includes('claude-opus')) ?? '');
  assert.ok(header(withContext({ status: 'ready', pid: 42, percent: 41 })).includes('ctx 41%'), header(withContext({ status: 'ready', pid: 42, percent: 41 })));
  for (const gone of [{ status: 'stopped', pid: null, percent: 41 }, { status: 'error', pid: null, percent: 41 }, { status: 'not_started', pid: null, percent: 41 }]) {
    const text = header(withContext(gone));
    assert.equal(text.includes('ctx'), false, gone.status + ' keeps no stale context: ' + text);
  }
});

test('a finished plan shows no activity and no step revisions', () => {
  const live = strip(liveLine(STATES.done, 200, undefined, NOW)[0]);
  assert.ok(live.includes('✔ all steps approved'), live);
  assert.equal(live.includes('editing client.js'), false, `a finished plan has no activity: ${live}`);
  assert.equal(live.includes('rev 1/3'), false, `a finished plan has no step revisions: ${live}`);
  // Elapsed time and cost stay: they describe what the task took.
  assert.ok(live.includes('3m11s'), live);
  assert.ok(live.includes('$0.14'), live);
  const board = boardLines(STATES.done, 80, undefined, NOW).map(strip);
  assert.equal(board.some(line => line.includes('editing client.js')), false, board.join('\n'));
  assert.equal(board.some(line => line.includes('rev ')), false, board.join('\n'));
  assert.ok(board[0].includes('3m11s'), board[0]);
  // A running plan still shows both.
  assert.ok(strip(liveLine(STATES.working, 200, undefined, NOW)[0]).includes('editing client.js'));
  assert.ok(strip(liveLine(STATES.working, 200, undefined, NOW)[0]).includes('rev 1/3'));
});

test('a crashed or stopped worker reports no tool activity on any surface', () => {
  // The controller keeps the last observation, so the tool is still there: it is history, not activity.
  const crashed = summary({ workers: [worker({ status: 'error', pid: null, error: 'Worker exited unexpectedly (code 1)', observation: { at: NOW - 60000, currentTool: 'bash', currentTarget: 'npm test' } })] });
  const live = strip(liveLine(crashed, 100, undefined, NOW)[0] ?? '');
  assert.ok(live.includes('worker needs attention'), live);
  assert.equal(live.includes('npm test'), false, `a crashed worker has no current tool: ${live}`);
  assert.equal(live.includes('running'), false, live);
  const board = boardLines(crashed, 100, undefined, NOW).map(strip);
  assert.equal(board.some(line => line.includes('npm test')), false, board.join('\n'));
  // The step row keeps its revisions: those describe the task, not the dead process.
  assert.ok(board.some(line => line.includes('rev 1/3')), board.join('\n'));
  const dashboard = dashboardLines(crashed, 100, NOW).map(strip);
  assert.equal(dashboard.some(line => line.includes('npm test')), false, dashboard.join('\n'));
  assert.equal(dashboard.some(line => line.includes('running npm')), false, dashboard.join('\n'));
  const status = statusText(crashed, null, NOW);
  assert.equal(/^\s*Tool\s/m.test(status), false, status);
  // A stopped worker with a live-looking observation is just as quiet.
  const stopped = summary({ workers: [worker({ status: 'stopped', pid: null, task: null, observation: { at: NOW - 60000, currentTool: 'bash', currentTarget: 'npm test' } })] });
  assert.equal(statusText(stopped, null, NOW).includes('Tool'), false);
  assert.equal(strip(liveLine(stopped, 120, undefined, NOW)[0] ?? '').includes('npm test'), false);
  // A stalled worker still counts: it has a live process and a task, so what it is stuck on is the point.
  assert.ok(strip(liveLine(STATES.stalled, 120, undefined, NOW)[0]).includes('running npm test'));
  assert.ok(statusText(STATES.stalled, null, NOW).includes('Tool'), 'a stalled worker still reports its tool');
});

test('the 100-column working case keeps the full title and the activity', () => {
  const line = strip(liveLine(STATES.working, 100, undefined, NOW)[0]);
  assert.ok(line.includes('▶ Wire retries into fetch client'), line);
  assert.equal(line.includes('…'), false, `nothing should be cut at 100 columns: ${line}`);
  assert.ok(line.includes('editing client.js'), line);
  // The title is protected: only the numbers give way, and only as the width demands.
  const long = summary({ workers: [worker({ task: task({ stepList: [step('Add retry policy type', 'done'), step('Wire retries into the fetch client so 429 responses honour Retry-After', 'active'), step('Tests for backoff', 'todo'), step('Document retries', 'todo')] }) })] });
  const narrow = strip(liveLine(long, 100, undefined, NOW)[0]);
  // A long title keeps a wide share of the line; a short one is never truncated at all.
  assert.ok(narrow.includes('▶ Wire retries into the fetch client so'), `the long title keeps its first 40 columns at 100: ${narrow}`);
  const titleWidth = narrow.slice(narrow.indexOf('▶'), narrow.indexOf(' · editing')).length;
  assert.ok(titleWidth >= 36, `the title keeps ${titleWidth} columns at 100: ${narrow}`);
  assert.equal(narrow.includes('tok/s'), false, `speed is measured detail and should go: ${narrow}`);
});

test('several workers are named by id in the badge and the live line', () => {
  const many = STATES.several;
  const badge = strip(footerBadge(many, NOW));
  assert.ok(badge.includes('w1') && badge.includes('w2') && badge.includes('w3'), badge);
  assert.equal(/W\d/.test(badge), false, 'no positional tags: ' + badge);
  const line = strip(liveLine(many, 200, undefined, NOW)[0]);
  assert.ok(line.startsWith('w1 '), line);
  // The same id appears in the dashboard title.
  const heading = strip(dashboardLines(many, 100, NOW)[0]);
  assert.equal(heading, 'Pair · w1', heading);
  // A long id is clipped to ten columns, and a lone worker keeps no label at all.
  const longId = summary({ workers: [worker({ id: 'worker-with-a-long-name' }), worker({ id: 'w2', status: 'ready', task: null, pid: 43 })] });
  const clipped = strip(footerBadge(longId, NOW)).split(' ')[1];
  assert.ok(clipped.endsWith('…'), `the long id is clipped: ${clipped}`);
  assert.ok(visibleWidth(clipped) <= 10, `the label stays within 10 columns: ${clipped}`);
  assert.ok(strip(footerBadge(longId, NOW)).startsWith('pair ' + clipped + ' ◉2/4'), strip(footerBadge(longId, NOW)));
  assert.equal(strip(liveLine(STATES.working, 200, undefined, NOW)[0]).startsWith('■'), true, 'a lone worker has no label');
});

test('the board names the other busy and attention-needing workers', () => {
  const many = summary({ workers: [worker(), worker({ id: 'w2', status: 'review', task: task({ id: 't2', objective: 'Refactor logging', status: 'review', step: 1, steps: 2, stepList: [step('Split logger', 'active'), step('Docs', 'todo')] }) })] });
  const lines = boardLines(many, 80, undefined, NOW).map(strip);
  const row = lines.find(line => line.includes('w2'));
  assert.ok(row, lines.join('\n'));
  assert.match(row, /^◐ w2 1\/2 Split logger · review$/, row);
  for (const line of lines) assert.ok(visibleWidth(line) <= 80, line);
  // An idle worker with no task and no attention need is not listed.
  const idle = summary({ workers: [worker(), worker({ id: 'w2', status: 'ready', task: null, pid: 43 }), worker({ id: 'w3', status: 'stopped', task: null, pid: null })] });
  assert.equal(boardLines(idle, 80, undefined, NOW).map(strip).some(line => line.includes('w2')), false);
  // A worker that needs attention is listed even without a task, with its error.
  const attention = summary({ workers: [worker(), worker({ id: 'w2', status: 'attention', task: null, pid: 43, error: 'EXIT_UNCONFIRMED: worker vanished' })] });
  const attentionRow = boardLines(attention, 80, undefined, NOW).map(strip).find(line => line.includes('w2'));
  assert.ok(attentionRow, 'the second worker needs attention: ' + boardLines(attention, 80, undefined, NOW).map(strip).join('\n'));
  assert.ok(attentionRow.includes('EXIT_UNCONFIRMED'), attentionRow);
  assert.match(attentionRow, / · attention$/, attentionRow);
  // A paused worker with a task is listed too.
  const paused = summary({ workers: [worker(), worker({ id: 'w2', status: 'paused', task: task({ status: 'paused', objective: 'Second objective' }) })] });
  assert.ok(boardLines(paused, 80, undefined, NOW).map(strip).some(line => line.includes('w2')), 'paused is listed');
  // At most three rows plus a count.
  const crowd = summary({ workers: [worker(), ...Array.from({ length: 5 }, (_, index) => worker({ id: 'w' + (index + 2), status: 'review', task: task({ id: 't' + index, status: 'review', objective: 'Objective ' + (index + 2), stepList: [step('A', 'active'), step('B', 'todo')] }) }))] });
  const crowdLines = boardLines(crowd, 80, undefined, NOW).map(strip);
  assert.equal(crowdLines.filter(line => /^◐ w\d /.test(line)).length, 3, crowdLines.join('\n'));
  assert.ok(crowdLines.includes('… 2 more workers'), crowdLines.join('\n'));
  for (const width of [20, 40, 60, 80, 100, 160]) {
    for (const line of boardLines(crowd, width, undefined, NOW)) assert.ok(visibleWidth(strip(line)) <= width, width + ': ' + strip(line));
  }
});

test('the widget signature changes when another worker changes', () => {
  const many = STATES.several, other = summary({ workers: [worker(), worker({ id: 'w2', status: 'review', task: task({ id: 't2', status: 'review' }) })] });
  assert.notEqual(widgetSignature(many, 'board', NOW), widgetSignature(other, 'board', NOW));
  // A step moving on the other worker's plan is a change too.
  const moved = summary({ workers: [worker(), worker({ id: 'w2', status: 'working', task: task({ id: 't2', step: 3, stepList: [step('A', 'done'), step('B', 'done'), step('C', 'active')] }) })] });
  const before = summary({ workers: [worker(), worker({ id: 'w2', status: 'working', task: task({ id: 't2', step: 2, stepList: [step('A', 'done'), step('B', 'active'), step('C', 'todo')] }) })] });
  assert.notEqual(widgetSignature(moved, 'board', NOW), widgetSignature(before, 'board', NOW));
});

test('an errored worker with no task shows one alert line in minimal and board modes', () => {
  const errored = summary({ workers: [worker({ status: 'error', error: 'RPC worker exited with code 1: ENOENT pi', task: null, pid: null })] });
  const live = strip(liveLine(errored, 100, undefined, NOW)[0] ?? '');
  assert.match(live, /^! worker needs attention · RPC worker exited with code 1: ENOENT pi · open \/pair$/, live);
  const board = boardLines(errored, 100, undefined, NOW).map(strip);
  assert.equal(board.length, 1, board.join('\n'));
  assert.equal(board[0], live, 'the board shows the same alert line');
  // A permission dialog reads differently and stays calm.
  const permission = summary({ workers: [worker({ status: 'permission', task: null })] });
  assert.ok(strip(liveLine(permission, 100, undefined, NOW)[0] ?? '').includes('permission dialog'), strip(liveLine(permission, 100, undefined, NOW)[0] ?? ''));
  // With several workers the row names the one that needs attention.
  const many = summary({ workers: [worker({ task: null, status: 'ready', pid: null }), worker({ id: 'w2', status: 'error', error: 'worker crashed', task: null, pid: null })] });
  const named = strip(liveLine(many, 100, undefined, NOW)[0] ?? '');
  assert.ok(named.startsWith('! w2 '), named);
  for (const width of [20, 40, 60, 80, 100, 160]) {
    for (const line of [...liveLine(errored, width, undefined, NOW), ...boardLines(errored, width, undefined, NOW)]) {
      assert.ok(visibleWidth(strip(line)) <= width, width + ': ' + strip(line));
    }
  }
  // Removing the error removes the line: a healthy worker with no task draws nothing.
  assert.deepEqual(liveLine(summary({ workers: [worker({ task: null, status: 'ready' })] }), 100, undefined, NOW), []);
  assert.deepEqual(boardLines(summary({ workers: [worker({ task: null, status: 'ready' })] }), 100, undefined, NOW), []);
});

test('the indicator surface shows and clears the no-task alert in both widget modes', () => {
  /** @type {{widgets: Array<any>, status: Array<string | undefined>, last: any}} */
  const log = { widgets: [], status: [], last: null };
  const ui = {
    theme: { fg: (/** @type {string} */ color, /** @type {string} */ text) => text },
    /** @param {string} key @param {string | undefined} text */
    setStatus(key, text) { log.status.push(text); },
    /** @param {string} key @param {any} factory */
    setWidget(key, factory) { log.widgets.push(factory); if (factory) log.last = factory; },
  };
  const surface = createIndicatorSurface(ui);
  /** @param {number} width */
  const draw = width => /** @type {any} */ (log.last)({ requestRender() {} }, ui.theme).render(width);
  const errored = summary({ workers: [worker({ status: 'error', error: 'worker crashed', task: null, pid: null })] });
  for (const mode of ['minimal', 'board']) {
    surface.update(errored, mode, false, NOW);
    const lines = draw(100); 
    assert.equal(lines.length, 1, mode + ': ' + JSON.stringify(lines));
    assert.ok(strip(lines[0]).includes('worker needs attention'), mode + ': ' + strip(lines[0]));
  }
  // Clearing the alert removes the widget content.
  surface.update(summary({ workers: [worker({ task: null, status: 'ready' })] }), 'minimal', false, NOW);
  assert.deepEqual(draw(100), []);
  surface.update(null, 'minimal', false, NOW);
  assert.deepEqual(draw(100), []);
  assert.equal(log.widgets.at(-1), undefined);
});

test('a board row keeps its detail and flexes a long title first', () => {
  const long = 'Wire retries into the fetch client so 429 responses honour the Retry-After header';
  const s = summary({ workers: [worker({ task: task({ stepList: [step('Add retry policy type', 'done'), step(long, 'active'), step('Tests for backoff', 'todo')] }) })] });
  const lines = boardLines(s, 80, undefined, NOW).map(strip);
  const active = lines.find(line => line.includes('▶'));
  assert.ok(active, lines.join('\n'));
  assert.ok(active.includes('editing client.js'), `detail dropped at 80: ${active}`);
  assert.ok(active.includes('rev 1/3'), `revisions dropped at 80: ${active}`);
  assert.ok(active.includes('…'), `the title should be truncated, not deleted: ${active}`);
  assert.ok(visibleWidth(active) <= 80, active);
  // A short title is never truncated to make room for the detail.
  const short = boardLines(STATES.working, 80, undefined, NOW).map(strip).find(line => line.includes('▶'));
  assert.equal(short.includes('…'), false, short);
  // Review and held rows keep their right-hand words too.
  const review = boardLines(summary({ workers: [worker({ status: 'review', task: task({ status: 'review', reportKind: 'checkpoint', stepList: [step(long, 'review'), step('Tests', 'todo')] }) })] }), 80, undefined, NOW).map(strip);
  assert.ok(review[1].includes('review by Main'), review[1]);
  assert.ok(review[1].includes('…'), review[1]);
  const held = boardLines(summary({ workers: [worker({ status: 'paused', task: task({ status: 'paused', stepList: [step(long, 'held'), step('Tests', 'todo')] }) })] }), 80, undefined, NOW).map(strip);
  assert.ok(held[1].includes('paused'), held[1]);
  // Below the title minimum the detail is what goes.
  const narrow = boardLines(s, 30, undefined, NOW).map(strip);
  for (const line of narrow) assert.ok(visibleWidth(line) <= 30, line);
});

test('every waiting state is named, with the same words on all three surfaces', () => {
  const holding = (/** @type {string} */ state) => [step('Add retry policy type', 'done'), step('Wire retries into fetch client', state), step('Tests for backoff', 'todo')];
  /** @type {Array<[string, string, any, string]>} */
  const cases = [
    ['checkpoint review', 'review', { status: 'review', reportKind: 'checkpoint', stepList: holding('review') }, 'review by Main'],
    ['final review', 'review', { status: 'review', reportKind: 'final_review', stepList: holding('review') }, 'final review by Main'],
    ['question', 'question', { status: 'question', reportKind: null, stepList: holding('review') }, 'question for Main'],
    ['blocked', 'blocked', { status: 'blocked', reportKind: null, stepList: holding('review') }, 'blocker for Main'],
  ];
  for (const [name, status, over, word] of cases) {
    // No current tool: the word has to carry the state on its own.
    const s = summary({ workers: [worker({ status, task: task(over), observation: null })] });
    const live = strip(liveLine(s, 100, undefined, NOW)[0] ?? '');
    assert.ok(live.includes(word), `${name}: the live line should say "${word}": ${live}`);
    assert.ok(live.includes('◐ Wire retries into fetch client'), `${name}: ${live}`);
    const board = boardLines(s, 80, undefined, NOW).map(strip).find(line => line.includes('Wire retries'));
    assert.ok(board?.includes(word), `${name}: the board row should say "${word}": ${board}`);
    const dashboard = dashboardLines(s, 80, NOW).map(strip).find(line => line.includes('Wire retries'));
    assert.ok(dashboard?.includes(word), `${name}: the dashboard row should say "${word}": ${dashboard}`);
  }
  // The four words differ, so the surfaces are no longer interchangeable.
  const words = cases.map(([, , , word]) => word);
  assert.equal(new Set(words).size, words.length, words.join(', '));
  // A held step names the task's own state.
  const held = summary({ workers: [worker({ status: 'paused', task: task({ status: 'paused', stepList: holding('held') }), observation: null })] });
  assert.ok(boardLines(held, 80, undefined, NOW).map(strip).some(line => line.includes('paused')), 'the board names the paused task');
  assert.ok(dashboardLines(held, 80, NOW).map(strip).some(line => line.includes('paused')), 'the dashboard names the paused task');
  const interrupted = summary({ workers: [worker({ status: 'interrupted', task: task({ status: 'interrupted', stepList: holding('held') }), observation: null })] });
  assert.ok(boardLines(interrupted, 80, undefined, NOW).map(strip).some(line => line.includes('interrupted')), 'the board names the interrupted task');
  // The live line already carries a paused alert, so it adds no word of its own.
  assert.equal(strip(liveLine(held, 120, undefined, NOW)[0] ?? '').includes('· paused ·'), false);
  // No step row says the old words any more. The pause alert's own wording is the next step's business.
  for (const [name, s] of Object.entries({ paused: held, interrupted, ...Object.fromEntries(cases.map(([label, status, over]) => [label, summary({ workers: [worker({ status, task: task(over), observation: null })] })])) })) {
    const rows = [...boardLines(s, 80, undefined, NOW), ...dashboardLines(s, 80, NOW)].map(strip).filter(line => line.includes('Wire retries'));
    assert.ok(rows.length >= 2, `${name}: the step row should render: ` + rows.join('\n'));
    // The word is the row's whole right-hand detail, so no row's detail column is one of the old ones.
    for (const line of rows) {
      const detail = (line.split(/\s{2,}/).pop() ?? '').trim();
      assert.equal(['waiting for Main', 'for Main', 'held'].includes(detail), false, `${name}: the detail column still reads "${detail}"`);
    }
  }
});

test('the indicator surface swaps the widget when the mode changes', () => {
  /** @type {{status: Array<string | undefined>, widgets: Array<unknown>, calls: string[], theme: {fg(color: string, text: string): string}}} */
  const log = { status: [], widgets: [], calls: [], theme: { fg: (color, text) => { log.calls.push(color); return text; } } };
  /** A fake ui that records what main.js would call. */
  const ui = {
    theme: log.theme,
    /** @param {string} key @param {string | undefined} text */
    setStatus(key, text) { log.calls.push(`setStatus:${key}`); log.status.push(text); },
    /** @param {string} key @param {any} factory @param {any} options */
    setWidget(key, factory, options) {
      log.calls.push(`setWidget:${key}:${factory ? 'factory' : 'none'}:${options?.placement ?? ''}`);
      log.widgets.push(factory);
      if (factory) log.last = factory;
    },
    last: null,
  };
  const surface = createIndicatorSurface(ui);
  const render = () => surface.widget?.render?.(40) ?? null;
  void render;
  const draw = (/** @type {number} */ width, /** @type {number} */ lines) => {
    const factory = /** @type {any} */ (log.last);
    const component = factory({ requestRender() {} }, log.theme);
    return component.render(width);
  };
  // minimal registers a one-line live widget above the editor.
  surface.update(STATES.working, 'minimal', false, NOW);
  assert.equal(log.widgets.length, 1);
  assert.ok(log.calls.includes('setWidget:fabric-pair:factory:aboveEditor'));
  assert.equal(draw(80, 1).length, 1);
  assert.ok(draw(80, 1)[0].includes('2/4'));
  // board replaces the component instead of leaving the live line drawing.
  surface.update(STATES.working, 'board', false, NOW);
  assert.ok(log.calls.includes('setWidget:fabric-pair:none:'), 'the old widget must be removed first');
  assert.equal(log.widgets.filter(Boolean).length, 2, 'board registers a new factory');
  assert.ok(draw(80, 1).length > 3, 'the board draws several rows');
  // back to minimal swaps again.
  surface.update(STATES.working, 'minimal', false, NOW);
  assert.equal(log.widgets.filter(Boolean).length, 3);
  assert.equal(draw(80, 1).length, 1);
  // compact removes the widget but keeps the badge.
  surface.update(STATES.working, 'compact', false, NOW);
  assert.equal(log.widgets.at(-1), undefined);
  assert.equal(log.status.at(-1), footerBadge(STATES.working, NOW));
  // off removes both.
  surface.update(STATES.working, 'off', false, NOW);
  assert.equal(log.status.at(-1), undefined);
  // No task removes both as well.
  surface.update(null, 'minimal', false, NOW);
  assert.equal(log.status.at(-1), undefined);
  // Repeating an unchanged update does not re-register the widget.
  surface.update(STATES.working, 'minimal', false, NOW);
  const registrations = log.widgets.length;
  surface.update(STATES.working, 'minimal', false, NOW);
  assert.equal(log.widgets.length, registrations);
  surface.clear();
  assert.equal(log.widgets.at(-1), undefined);
  assert.equal(log.status.at(-1), undefined);
});


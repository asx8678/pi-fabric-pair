import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleWidth } from '@earendil-works/pi-tui';
import { boardLines, boardWidget, createIndicatorSurface, dashboardHeader, fitSegments, footerBadge, indicator, liveLine, liveWidget, statusText, widgetSignature, workerState } from '../src/ui.js';
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
  assert.equal(many, 'pair W1 ◉2/4 W2 ● W3 ◐2/4');
  assert.ok(visibleWidth(many) <= 32);
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
  assert.equal(strip(liveLine(s, 20, undefined, NOW)[0]), '■■■▣▣□□□□□ 2/4');
  const wide = strip(liveLine(s, 200, undefined, NOW)[0]);
  for (const part of ['■■■▣▣□□□□□ 2/4', '▶ Wire retries into fetch client', 'editing client.js', '3m12s', 'rev 1/3', '$0.14/$2.00']) {
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
  assert.equal(strip(liveLine(STATES.done, 20, undefined, NOW)[0]), '■■■■■■■■■■ 4/4');
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
  assert.ok(later.startsWith('W2 ') && later.includes('2/4'), later);
  assert.ok(strip(boardLines(s, 80, undefined, NOW + 10 * 60000)[0]).includes('Second objective'));
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
  const fitted = String(fitSegments(flexing(), 40));
  assert.ok(fitted.includes('$0.14'), `cost survives while the title can flex: ${fitted}`);
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
  assert.ok(lines.some(line => line.startsWith('✔ 6 done')), lines.join('\n'));
  assert.equal(lines.filter(line => line.startsWith('✔ ') && line.endsWith(' done')).length, 1);
  assert.ok(lines.length <= 1 + 1 + (12 - 6), lines.join('\n'));
  // Short plans keep every row.
  const short = boardLines(STATES.working, 80, undefined, NOW).map(strip);
  assert.equal(short.some(line => line.endsWith(' done')), false);
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
  const review = boardLines(summary({ workers: [worker({ status: 'review', task: task({ status: 'review', stepList: [step(long, 'review'), step('Tests', 'todo')] }) })] }), 80, undefined, NOW).map(strip);
  assert.ok(review[1].includes('waiting for Main'), review[1]);
  assert.ok(review[1].includes('…'), review[1]);
  const held = boardLines(summary({ workers: [worker({ status: 'paused', task: task({ status: 'paused', stepList: [step(long, 'held'), step('Tests', 'todo')] }) })] }), 80, undefined, NOW).map(strip);
  assert.ok(held[1].includes('held'), held[1]);
  // Below the title minimum the detail is what goes.
  const narrow = boardLines(s, 30, undefined, NOW).map(strip);
  for (const line of narrow) assert.ok(visibleWidth(line) <= 30, line);
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


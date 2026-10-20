import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { visibleWidth } from '@earendil-works/pi-tui';
import { ACTIVITY_LIMIT, FEEDBACK_EXCERPT, TIMELINE_LIMIT, appendTimeline, decisionEntry, excerpt, normalizeActivity, normalizeTimeline, pushActivity, reportEntry } from '../src/timeline.js';
import { APP_TITLE, attentionOf, createAttentionCue, piTitle, ringBell } from '../src/cue.js';
import { dashboardKeys, dashboardLines, stepHistory, timelineLine } from '../src/ui.js';
import { taskSummary } from '../src/controller.js';
import { validateConfig } from '../src/config.js';
import { validateStoredState } from '../src/contracts.js';

const NOW = 1_700_000_000_000;
const strip = (/** @type {string} */ text) => text.replace(/\u001b\[[0-9;]*m/g, '');
const step = (/** @type {string} */ title, /** @type {string} */ state) => ({ id: title, title, state });

// ---------- timeline ----------

test('the timeline keeps the newest sixty entries', () => {
  /** @type {any[]} */
  let timeline = [];
  for (let index = 1; index <= 80; index++) timeline = appendTimeline(timeline, reportEntry({ reportId: `report-${index}`, kind: 'checkpoint', step: 1, at: index }));
  assert.equal(timeline.length, TIMELINE_LIMIT);
  assert.equal(timeline.at(-1).reportId, 'report-80', 'the newest entry survives');
  assert.equal(timeline[0].reportId, 'report-21', 'the oldest entries are dropped');
  // An over-long stored timeline is trimmed on read.
  assert.equal(normalizeTimeline(Array.from({ length: 100 }, (_, index) => ({ type: 'report', reportId: `r${index}`, step: 1, kind: 'checkpoint', at: index, verification: { passed: 0, failed: 0 } }))).length, TIMELINE_LIMIT);
});

test('decision feedback is stored as a one-line excerpt of at most 160 characters', () => {
  const long = 'x'.repeat(500);
  assert.equal(excerpt(long).length, FEEDBACK_EXCERPT);
  assert.equal(excerpt(`line one\nline two\t\t and more`), 'line one line two and more');
  const entry = decisionEntry({ reportId: 'r1', step: 2, action: 'revise', at: 5, feedback: long });
  assert.equal(entry.feedback.length, FEEDBACK_EXCERPT);
  assert.deepEqual(Object.keys(entry).sort(), ['action', 'at', 'feedback', 'reportId', 'step', 'type']);
  assert.equal(entry.type, 'decision');
});

test('a report entry records only how many Pair checks passed and failed', () => {
  const entry = reportEntry({ reportId: 'r1', kind: 'checkpoint', step: 3, at: 10, verification: [{ name: 'typecheck', passed: true }, { name: 'test', passed: false }, { name: 'lint', passed: false }] });
  assert.deepEqual(entry, { type: 'report', reportId: 'r1', step: 3, kind: 'checkpoint', at: 10, verification: { passed: 1, failed: 2 } });
  // No output, artifact path or check name leaks into history.
  assert.equal(JSON.stringify(entry).includes('typecheck'), false);
});

test('an absent or corrupt timeline reads as history-free, never throwing', () => {
  assert.deepEqual(normalizeTimeline(undefined), []);
  assert.deepEqual(normalizeTimeline(null), []);
  assert.deepEqual(normalizeTimeline('not an array'), []);
  assert.deepEqual(normalizeTimeline([null, 5, 'x', {}, { type: 'report' }, { type: 'unknown', reportId: 'r' }]), []);
  // Valid entries survive a corrupt neighbour, and odd fields are normalised.
  const mixed = normalizeTimeline([{ type: 'decision', reportId: 'r1', step: -4, action: 'approve', at: 'soon', feedback: 42 }]);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].step, 1);
  assert.equal(mixed[0].at, 0);
  assert.equal(mixed[0].feedback, '');
});

test('the task projection carries the timeline and older tasks keep working', () => {
  const older = { id: 't', requestId: 'r', attemptId: 'a', attemptNumber: 1, objective: 'o', status: 'running', stepIndex: 0, revisions: 0, turns: 0, startedAt: 1, usage: null, lastDecision: null, steps: [{ id: 's1', title: 'One' }] };
  assert.deepEqual(taskSummary(/** @type {any} */ (older)).timeline, []);
  const withHistory = { ...older, timeline: [reportEntry({ reportId: 'r1', kind: 'checkpoint', step: 1, at: 2 })] };
  assert.equal(taskSummary(/** @type {any} */ (withHistory)).timeline.length, 1);
});

// ---------- activity ring buffer ----------

test('the activity ring buffer keeps the newest eight events', () => {
  /** @type {any[]} */
  let activity = [];
  for (let index = 1; index <= 20; index++) activity = pushActivity(activity, { tool: 'bash', target: `cmd-${index}`, at: index });
  assert.equal(activity.length, ACTIVITY_LIMIT);
  assert.equal(ACTIVITY_LIMIT, 8);
  assert.equal(activity.at(-1).target, 'cmd-20');
  assert.equal(activity[0].target, 'cmd-13');
  // A stored file longer than the limit is trimmed too.
  assert.equal(normalizeActivity({ version: 1, events: Array.from({ length: 30 }, (_, index) => ({ tool: 'read', target: `f${index}`, at: index })) }).length, ACTIVITY_LIMIT);
});

test('activity reading is tolerant of a missing, truncated or hand-edited file', () => {
  assert.deepEqual(normalizeActivity(null), []);
  assert.deepEqual(normalizeActivity(undefined), []);
  assert.deepEqual(normalizeActivity({}), []);
  assert.deepEqual(normalizeActivity('garbage'), []);
  assert.deepEqual(normalizeActivity({ version: 1, events: 'nope' }), []);
  assert.deepEqual(normalizeActivity({ events: [null, { tool: '' }, { tool: 5 }, { target: 'no tool' }] }), []);
  // A bare array is accepted, and known fields are trimmed.
  const partial = normalizeActivity([{ tool: 'edit', target: 'src/a.js', at: 7 }, { tool: 'bash' }]);
  assert.equal(partial.length, 2);
  assert.deepEqual(partial[0], { tool: 'edit', target: 'src/a.js', at: 7 });
  assert.deepEqual(partial[1], { tool: 'bash', target: '', at: 0 });
});

test('activity is written beside telemetry, not into it', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-activity-'));
  try {
    // The worker's writer keeps its own file; telemetry.json is never opened for this.
    const file = path.join(dir, 'activity.json');
    await fs.writeFile(file, JSON.stringify({ version: 1, events: pushActivity([], { tool: 'edit', target: 'a.js', at: 1 }) }));
    const read = normalizeActivity(JSON.parse(await fs.readFile(file, 'utf8')));
    assert.deepEqual(read, [{ tool: 'edit', target: 'a.js', at: 1 }]);
    assert.equal(await fs.readdir(dir).then(names => names.includes('telemetry.json')), false);
    // A truncated file (a torn write) reads as no activity instead of throwing.
    await fs.writeFile(file, '{"version":1,"events":[{"tool":"ed');
    const torn = await fs.readFile(file, 'utf8').then(text => { try { return JSON.parse(text); } catch { return null; } });
    assert.deepEqual(normalizeActivity(torn), []);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

// ---------- dashboard history and activity ----------

/** @param {object} [over] @returns {any} */
function task(over = {}) {
  return { id: 'task-1', objective: 'Add retry and backoff', status: 'running', step: 2, steps: 2, reportedCost: 0.14, startedAt: NOW - 192000,
    stepRevisions: 1, limitNotice: null, checkpointHash: null, lastVerification: [], updatedAt: NOW - 1000,
    limits: { maxRevisions: 20, maxRevisionsPerStep: 3, maxReportedCostUsd: 2, maxOutputTokens: null },
    stepList: [step('Add retry policy type', 'done'), step('Wire retries into fetch client', 'active')], timeline: [], ...over };
}
/** @param {object} [over] @returns {any} */
function summary(over = {}) {
  return { enabled: true, autoDeliverReports: true, main: { busy: false }, waitingReports: 0, recentActivity: [],
    workers: [{ id: 'w1', model: 'anthropic/claude-opus', effort: 'high', status: 'working', pid: 42, sessionId: 's1', task: task(), recentActivity: [],
      observation: { at: NOW - 5000, currentTool: 'edit', currentTarget: 'src/http/client.js' } }], ...over };
}

test('history lines describe a revise, an approval and a failed check', () => {
  assert.deepEqual(timelineLine({ type: 'decision', reportId: 'r1', step: 2, action: 'revise', at: 1, feedback: 'wrap the jitter' }), { step: 2, color: 'warning', text: '↻ revise: wrap the jitter' });
  assert.deepEqual(timelineLine({ type: 'decision', reportId: 'r1', step: 2, action: 'approve', at: 1, feedback: '' }), { step: 2, color: 'success', text: '✔ approved' });
  assert.deepEqual(timelineLine({ type: 'decision', reportId: 'r1', step: 2, action: 'answer', at: 1, feedback: 'yes' }), { step: 2, color: 'accent', text: '↻ answer: yes' });
  assert.equal(timelineLine({ type: 'decision', reportId: 'r1', step: 2, action: 'cancel', at: 1, feedback: '' }).text, '✖ cancelled');
  assert.equal(timelineLine({ type: 'report', reportId: 'r1', step: 2, kind: 'checkpoint', at: 1, verification: { passed: 1, failed: 2 } }).text, '↻ report checkpoint · 2 Pair checks failed');
  assert.equal(timelineLine({ type: 'report', reportId: 'r1', step: 2, kind: 'checkpoint', at: 1, verification: { passed: 2, failed: 0 } }).text, '↻ report checkpoint');
  // History is per step and bounded.
  const timeline = [
    { type: 'decision', reportId: 'a', step: 1, action: 'approve', at: 1, feedback: '' },
    { type: 'decision', reportId: 'b', step: 2, action: 'revise', at: 2, feedback: 'one' },
    { type: 'decision', reportId: 'c', step: 2, action: 'revise', at: 3, feedback: 'two' },
    { type: 'decision', reportId: 'd', step: 2, action: 'revise', at: 4, feedback: 'three' },
    { type: 'decision', reportId: 'e', step: 2, action: 'revise', at: 5, feedback: 'four' }
  ];
  assert.deepEqual(stepHistory(/** @type {any} */ (timeline), 1).map(line => line.text), ['✔ approved']);
  assert.deepEqual(stepHistory(/** @type {any} */ (timeline), 2).map(line => line.text), ['↻ revise: two', '↻ revise: three', '↻ revise: four']);
  assert.deepEqual(stepHistory(undefined, 2), []);
});

test('the dashboard renders history under its step and a Recent activity section', () => {
  const timeline = [
    { type: 'report', reportId: 'r1', step: 2, kind: 'checkpoint', at: NOW - 4000, verification: { passed: 1, failed: 1 } },
    { type: 'decision', reportId: 'r1', step: 2, action: 'revise', at: NOW - 3000, feedback: 'honour Retry-After on 429' }
  ];
  const activity = [
    { tool: 'edit', target: 'src/http/client.js', at: NOW - 5000 },
    { tool: 'bash', target: 'npm test', at: NOW - 2000 }
  ];
  const s = summary({ workers: [{ ...summary().workers[0], task: task({ timeline }), recentActivity: activity }] });
  const text = dashboardLines(s, 100, NOW).map(strip).join('\n');
  assert.ok(text.includes('↻ revise: honour Retry-After on 429'), text);
  assert.ok(text.includes('1 Pair check failed'), text);
  assert.ok(text.includes('Recent activity'), text);
  assert.ok(text.includes('npm test'), text);
  // A failing timeline must not widen a line.
  for (const width of [40, 60, 100, 160]) for (const line of dashboardLines(s, width, NOW)) assert.ok(visibleWidth(strip(line)) <= width, width + ': ' + strip(line));
});

test('a task and worker without history or activity still render', () => {
  const s = summary();
  const text = dashboardLines(s, 100, NOW).map(strip).join('\n');
  assert.equal(text.includes('Recent activity'), false);
  assert.equal(text.includes('↻'), false);
  // An absent field is the same as an empty one.
  const bare = summary({ workers: [{ ...summary().workers[0], task: task({ timeline: undefined }), recentActivity: undefined }] });
  assert.ok(dashboardLines(bare, 100, NOW).length > 3);
});

// ---------- attention cue ----------

/** @param {object} [over] @returns {any} */
function cueSummary(over = {}) {
  const base = summary();
  return { ...base, workers: [{ ...base.workers[0], ...(over.worker || {}) }] };
}
/** A fake ui that records titles, plus an injected bell writer (production never needs ui.terminal). */
function fakeUi() {
  /** @type {string[]} */
  const titles = [];
  /** @type {string[]} */
  const writes = [];
  return { titles, writes, setTitle: (/** @type {string} */ title) => { titles.push(title); }, bell: () => { writes.push('\u0007'); } };
}

test('attentionCue defaults to false and is a validated boolean', () => {
  assert.equal(validateConfig({}).attentionCue, false);
  assert.equal(validateConfig({ attentionCue: true }).attentionCue, true);
  assert.throws(() => validateConfig({ attentionCue: 'yes' }), /attentionCue must be boolean/);
});

test('Pi\'s own title format is restored exactly', () => {
  assert.equal(APP_TITLE, 'π');
  assert.equal(piTitle('/home/me/project'), 'π - project');
  assert.equal(piTitle('/home/me/project/'), 'π - project');
  assert.equal(piTitle('/home/me/project', 'fabric work'), 'π - fabric work - project');
  assert.equal(piTitle('/home/me/project', undefined), 'π - project');
});

test('only states that need the human raise attention', () => {
  // The clock is pinned, so a stale-looking fixture cannot masquerade as a stalled worker.
  const at = (/** @type {any} */ s) => attentionOf(s, NOW);
  assert.equal(at(cueSummary()).needed, false, 'working is Main\'s job, not the human\'s');
  assert.equal(at(cueSummary({ worker: { status: 'review', task: task({ status: 'review' }) } })).needed, false, 'review waits for Main');
  assert.equal(at(cueSummary({ worker: { status: 'question', task: task({ status: 'question' }) } })).needed, false);
  assert.equal(at(cueSummary({ worker: { status: 'blocked', task: task({ status: 'blocked' }) } })).needed, false);
  const attention = at(cueSummary({ worker: { status: 'attention', error: 'EXIT_UNCONFIRMED' } }));
  assert.equal(attention.needed, true);
  assert.ok(attention.reason.length > 0);
  assert.equal(at(cueSummary({ worker: { status: 'permission' } })).needed, true);
  assert.equal(at(cueSummary({ worker: { status: 'paused', task: task({ status: 'paused' }) } })).needed, true);
  assert.equal(at(cueSummary({ worker: { status: 'interrupted', task: task({ status: 'interrupted' }) } })).needed, true);
  assert.equal(at(cueSummary({ worker: { observation: { at: NOW - 400000 } } })).needed, true, 'a silent worker needs the human');
  const waiting = at({ ...cueSummary(), autoDeliverReports: false, waitingReports: 2 });
  assert.equal(waiting.needed, true);
  assert.ok(waiting.reason.includes('delivery off'));
  // A disabled Pair has nothing to attend to.
  assert.equal(at({ ...cueSummary(), enabled: false }).needed, false);
});

test('the cue sets the title and rings once per new attention event', () => {
  const ui = fakeUi();
  const cue = createAttentionCue(ui, { cwd: '/home/me/project', enabled: true, bell: ui.bell });
  const working = cueSummary();
  cue.update(working, NOW);
  assert.equal(ui.titles.length, 0, 'nothing to say while the worker works');
  // The worker needs the human: one title, one bell.
  const attention = cueSummary({ worker: { status: 'attention', error: 'EXIT_UNCONFIRMED: worker vanished' } });
  cue.update(attention, NOW);
  assert.equal(ui.titles.length, 1);
  assert.ok(ui.titles[0].startsWith('! pair · '), ui.titles[0]);
  assert.ok(ui.titles[0].endsWith(' — π - project'), ui.titles[0]);
  assert.equal(ui.writes.filter(data => data === '\u0007').length, 1, 'one bell');
  // The same attention state stays quiet.
  cue.update(attention, NOW); cue.update(attention, NOW + 1000);
  assert.equal(ui.titles.length, 1, 'no repeated title');
  assert.equal(ui.writes.length, 1, 'no repeated bell');
  // Resolved: Pi\'s title is restored, no bell.
  cue.update(working, NOW);
  assert.equal(ui.titles.at(-1), 'π - project');
  assert.equal(ui.writes.length, 1);
  // A new attention event later fires again, exactly once.
  cue.update(cueSummary({ worker: { status: 'permission' } }), NOW);
  assert.equal(ui.titles.length, 3);
  assert.equal(ui.writes.length, 2);
});

test('the cue does nothing when disabled and restores the title on shutdown', () => {
  const off = fakeUi();
  const disabled = createAttentionCue(off, { cwd: '/home/me/project', enabled: false });
  disabled.update(cueSummary({ worker: { status: 'attention', error: 'boom' } }), NOW);
  disabled.restore();
  assert.deepEqual(off.titles, []);
  assert.deepEqual(off.writes, []);
  // Enabled: restore() puts Pi\'s title back without a bell.
  const on = fakeUi();
  const cue = createAttentionCue(on, { cwd: '/home/me/project', sessionName: 'work', enabled: true, bell: on.bell });
  cue.update(cueSummary({ worker: { status: 'permission' } }), NOW);
  assert.equal(on.writes.length, 1);
  cue.restore();
  assert.equal(on.titles.at(-1), 'π - work - project');
  assert.equal(on.writes.length, 1);
  assert.equal(cue.attention, false);
});

test('a terminal without a bell or a failing setTitle never breaks a render', () => {
  const thrower = { setTitle: () => { throw new Error('no title'); } };
  const cue = createAttentionCue(thrower, { cwd: '/p', enabled: true, bell: () => { throw new Error('no bell'); } });
  assert.doesNotThrow(() => cue.update(cueSummary({ worker: { status: 'permission' } }), NOW));
  assert.doesNotThrow(() => cue.restore());
  const noTerminal = { setTitle: () => {} };
  assert.doesNotThrow(() => createAttentionCue(noTerminal, { cwd: '/p', enabled: true }).update(cueSummary({ worker: { status: 'permission' } }), NOW));
});

test('a stall that grows rings once, and the title follows its age', () => {
  const ui = fakeUi();
  const cue = createAttentionCue(ui, { cwd: '/home/me/project', enabled: true, bell: ui.bell });
  const stalled = cueSummary({ worker: { observation: { at: NOW - 400000 } } });
  cue.update(stalled, NOW);
  assert.equal(ui.writes.length, 1);
  assert.deepEqual(ui.titles, ['! pair · no activity 6m — π - project']);
  // Minutes later the same worker is still silent: the title says so, and the bell stays quiet.
  for (const minutes of [1, 2, 3]) cue.update(stalled, NOW + minutes * 60000);
  assert.equal(ui.writes.length, 1, 'one bell per event, not one per minute');
  assert.equal(ui.titles.length, 4);
  assert.equal(ui.titles.at(-1), '! pair · no activity 9m — π - project');
  // Renders within the same minute write nothing.
  cue.update(stalled, NOW + 3 * 60000 + 1000);
  assert.equal(ui.titles.length, 4, 'an unchanged title is not written again');
  // A second worker in trouble is a new event, and so is the first one changing what it needs.
  const second = { ...stalled, workers: [...stalled.workers, { ...stalled.workers[0], id: 'w2', status: 'permission', observation: { at: NOW } }] };
  cue.update(second, NOW + 4 * 60000);
  assert.equal(ui.writes.length, 2);
  cue.update(cueSummary({ worker: { status: 'permission' } }), NOW + 5 * 60000);
  assert.equal(ui.writes.length, 3);
});

test('waiting reports are one event however many wait', () => {
  const ui = fakeUi();
  const cue = createAttentionCue(ui, { cwd: '/p', enabled: true, bell: ui.bell });
  const waiting = (/** @type {number} */ count) => ({ ...cueSummary(), autoDeliverReports: false, waitingReports: count });
  assert.ok(attentionOf(waiting(2), NOW).events.includes('reports'));
  assert.deepEqual(attentionOf(waiting(3), NOW).events, attentionOf(waiting(2), NOW).events, 'the count is not part of the event');
  cue.update(waiting(2), NOW);
  cue.update(waiting(3), NOW + 1000);
  assert.equal(ui.writes.length, 1, 'a third report joining is the same event');
  assert.ok(ui.titles.at(-1)?.includes('3 reports waiting'), ui.titles.at(-1));
  // Delivered, then waiting again: a new event.
  cue.update(waiting(0), NOW + 2000);
  assert.equal(ui.titles.at(-1), 'π - p');
  cue.update(waiting(1), NOW + 3000);
  assert.equal(ui.writes.length, 2);
});

test('restore leaves a title the cue never changed alone', () => {
  const ui = fakeUi();
  const cue = createAttentionCue(ui, { cwd: '/home/me/project', enabled: true, bell: ui.bell });
  cue.update(cueSummary(), NOW);
  cue.restore();
  assert.deepEqual(ui.titles, [], 'nothing needed the human, so Pi keeps its own title');
  // Attention that already resolved restored the title itself; restore adds nothing.
  cue.update(cueSummary({ worker: { status: 'permission' } }), NOW);
  cue.update(cueSummary(), NOW + 1000);
  const written = ui.titles.length;
  cue.restore();
  assert.equal(ui.titles.length, written);
  // After a restore the same attention is new again.
  cue.update(cueSummary({ worker: { status: 'permission' } }), NOW + 2000);
  cue.restore();
  cue.update(cueSummary({ worker: { status: 'permission' } }), NOW + 3000);
  assert.equal(ui.writes.length, 3);
  assert.ok(ui.titles.at(-1)?.startsWith('! pair · '), 'the title is written again after a restore');
});

test('a renamed session gets the cue title back, with the new name and no second bell', () => {
  const ui = fakeUi();
  const cue = createAttentionCue(ui, { cwd: '/home/me/project', sessionName: 'old', enabled: true, bell: ui.bell });
  const permission = cueSummary({ worker: { status: 'permission' } });
  cue.update(permission, NOW);
  assert.ok(ui.titles.at(-1)?.endsWith(' — π - old - project'), ui.titles.at(-1));
  // Pi rewrote its own title for the new name, so the same text must be written again.
  cue.retitle('new');
  cue.update(permission, NOW + 1000);
  assert.ok(ui.titles.at(-1)?.startsWith('! pair · ') && ui.titles.at(-1)?.endsWith(' — π - new - project'), ui.titles.at(-1));
  assert.equal(ui.writes.length, 1, 'the same event, so no second bell');
  // The same name set again still made Pi rewrite its title, so the unchanged text is written again.
  const written = ui.titles.length;
  cue.retitle('new');
  cue.update(permission, NOW + 2000);
  assert.equal(ui.titles.length, written + 1);
  cue.restore();
  assert.equal(ui.titles.at(-1), 'π - new - project');
  // Without attention Pi's own title is already right, so a rename writes nothing.
  const quiet = fakeUi();
  const idle = createAttentionCue(quiet, { cwd: '/p', enabled: true, bell: quiet.bell });
  idle.update(cueSummary(), NOW);
  idle.retitle('renamed');
  idle.update(cueSummary(), NOW + 1000);
  assert.deepEqual(quiet.titles, []);
});

test('the dashboard hides the start key until a model is chosen', () => {
  const stopped = cueSummary({ worker: { task: null, status: 'stopped', pid: null, model: '' } });
  assert.equal(dashboardKeys(stopped).some((/** @type {any} */ item) => item.action === 'start'), false, 'no model means start cannot work');
  assert.ok(dashboardKeys(stopped).some((/** @type {any} */ item) => item.action === 'settings'), 'settings still covers that state');
  const ready = cueSummary({ worker: { task: null, status: 'stopped', pid: null } });
  assert.ok(dashboardKeys(ready).some((/** @type {any} */ item) => item.action === 'start'));
});

test('state written before the timeline existed still validates, and a stored timeline validates', () => {
  /** @param {unknown} timeline @returns {any} */
  const state = timeline => ({ version: 1, ownerSession: 's', ownerEpoch: 1, cwd: '/tmp', requests: {}, notices: {},
    workers: { w1: { id: 'w1', cwd: '/tmp', repoRoot: '/tmp', status: 'ready', sessionId: 's1', sessionFile: null, workerGeneration: 1,
      bound: { id: 'w1', provider: 'p', model: 'm', effort: 'high', cwd: null, readOnly: false }, history: [], usage: null,
      task: { id: 't1', requestId: 'q1', objective: 'o', context: '', constraints: [], steps: [{ id: 's1', title: 'One', instructions: 'i' }], stepIndex: 0, planRevision: 1,
        status: 'review', leaseId: 'l1', policy: { mode: 'milestones', finalReview: true, maxRevisions: 20, maxRevisionsPerStep: 3, summaryDetail: 'normal' },
        limits: { maxReportedCostUsd: null, maxOutputTokens: null, activeStepTimeoutMs: 1, maxReportsPerTask: 1, maxReportBytes: 1, maxAutomaticReportRepairs: 0, maxAutomaticRecoveryAttempts: 0 },
        verification: { commands: [], requirePassing: true, timeoutMs: 1000 }, startedAt: 1, updatedAt: 1, revisions: 0, turns: 0, usage: null,
        baseSnapshotRef: '/tmp/b.json', pendingReport: null, report: null, decisions: {}, lastDecision: null, workerId: 'w1', attemptId: 'a1', attemptNumber: 1,
        ...(timeline === undefined ? {} : { timeline }) } } } });
  // The running Main reads state written before this change: no timeline, no problem.
  assert.doesNotThrow(() => validateStoredState(state(undefined), { ownerSession: 's', cwd: '/tmp' }));
  assert.doesNotThrow(() => validateStoredState(state([]), { ownerSession: 's', cwd: '/tmp' }));
  assert.doesNotThrow(() => validateStoredState(state([
    { type: 'report', reportId: 'r1', step: 1, kind: 'checkpoint', at: 2, verification: { passed: 2, failed: 0 } },
    { type: 'decision', reportId: 'r1', step: 1, action: 'approve', at: 3, feedback: 'ok' }
  ]), { ownerSession: 's', cwd: '/tmp' }));
  // A corrupt entry is rejected rather than silently kept.
  assert.throws(() => validateStoredState(state([{ type: 'nope', reportId: 'r1', step: 1, action: 'approve', at: 3, feedback: '' }]), { ownerSession: 's', cwd: '/tmp' }));
  assert.throws(() => validateStoredState(state('nope'), { ownerSession: 's', cwd: '/tmp' }));
});

test('the default bell writes to a TTY stdout and nothing else', () => {
  // The real writer inspects process.stdout.isTTY, so a test can stand in for the stream.
  const descriptor = Object.getOwnPropertyDescriptor(process, 'stdout');
  /** @param {boolean | undefined} isTTY */
  const withStdout = (/** @type {boolean | undefined} */ isTTY) => {
    /** @type {string[]} */
    const written = [];
    Object.defineProperty(process, 'stdout', { configurable: true, value: { isTTY, write: (/** @type {string} */ data) => { written.push(data); return true; } } });
    return written;
  };
  try {
    let written = withStdout(true);
    ringBell();
    assert.deepEqual(written, ['\u0007'], 'a TTY gets exactly one BEL');
    // A skipped bell (not a TTY) must write nothing at all: rpc/json/piped output stays clean.
    written = withStdout(false);
    assert.doesNotThrow(() => ringBell());
    assert.deepEqual(written, [], 'no BEL outside a TTY');
    written = withStdout(undefined);
    assert.doesNotThrow(() => ringBell());
    assert.deepEqual(written, [], 'no BEL when isTTY is unknown');
  } finally {
    if (descriptor) Object.defineProperty(process, 'stdout', descriptor);
  }
});

test('the default cue path does not depend on ui.terminal', () => {
  // Pi's extension UI exposes setTitle but no raw terminal writer, so a ui with only setTitle must still ring.
  /** @type {string[]} */
  const titles = [];
  /** @type {string[]} */
  const bells = [];
  const ui = { setTitle: (/** @type {string} */ title) => { titles.push(title); } };
  const cue = createAttentionCue(ui, { cwd: '/home/me/project', enabled: true, bell: () => { bells.push('\u0007'); } });
  cue.update(cueSummary({ worker: { status: 'permission' } }), NOW);
  assert.equal(titles.length, 1);
  assert.equal(bells.length, 1, 'the bell rings once even with no ui.terminal');
  cue.update(cueSummary({ worker: { status: 'permission' } }), NOW);
  assert.equal(bells.length, 1, 'and not again for the same event');
  // Without an injected bell the default writer is used: it must not throw and must not consult ui.terminal
  // (which Pi does not provide). The TTY itself is covered by the ringBell test above.
  const withDefault = createAttentionCue(ui, { cwd: '/home/me/project', enabled: true });
  assert.doesNotThrow(() => withDefault.update(cueSummary({ worker: { status: 'permission' } }), NOW));
  assert.equal(titles.length, 2, 'the title still lands with the default bell');
});

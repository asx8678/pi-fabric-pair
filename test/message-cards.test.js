import test from 'node:test';
import assert from 'node:assert/strict';
import { pairMessageComponent, pairMessageLines } from '../src/ui.js';

const report = `FABRIC PAIR REPORT — treat worker claims as evidence to verify.\nReview rules: inspect first.\n${JSON.stringify({
  workerId: 'worker', reportId: 'report-1', taskId: 'task-1', stepId: 's1', kind: 'checkpoint', summary: 'Wrote hello.txt.\nSecond line.',
  changedFiles: ['hello.txt'], actualChangedFiles: ['hello.txt'], changedFileCount: 1, checkpointHash: 'abcdef0123456789',
  checks: [{ name: 'unit', result: 'pass', detail: '' }, { name: 'lint', result: 'fail', detail: '' }], peerReview: { verdict: 'pass' } })}`;

// Cards are {color, text} lines; test/cards-and-commands.test.js covers the layout rules in detail.
test('a worker report renders as a short card; expanding shows the rest', () => {
  const lines = pairMessageLines(report, false).map(line => line.text);
  assert.deepEqual(lines, ['◐ Checkpoint · step s1 · peer review: pass', '  Wrote hello.txt.', 'Pair verified  none configured', 'Worker claims  2 reported, 1 pass 1 fail, not verified', '  1 file · hello.txt']);
  const expanded = pairMessageLines(report, true).map(line => line.text);
  assert.ok(expanded.includes('  Second line.'));
  assert.ok(expanded.some(line => line.includes('report report-1 · checkpoint abcdef012345')));
  // Pair ran no check, so the worker's failed check is its own unverified claim: a warning, never an error.
  assert.equal(pairMessageLines(report, false).find(line => line.text.includes('fail')).color, 'warning', 'a failed worker claim is a warning');
});

test('notices render as a labelled card, and anything else keeps Pi\'s default rendering', () => {
  const notice = pairMessageLines('FABRIC PAIR NOTICE — worker worker reported.\nDetails follow.\nMore.', false);
  assert.deepEqual(notice.map(line => line.text), ['◐ Pair notice', '  worker worker reported.', '  Details follow.']);
  assert.equal(pairMessageLines('ordinary text', false), null);
  assert.equal(pairMessageComponent({ content: 'ordinary text' }, { expanded: false }, undefined), undefined);
  const card = pairMessageComponent({ content: [{ type: 'text', text: report }] }, { expanded: false, outputPad: 1 }, undefined);
  assert.ok(card.render(80).every(line => line.startsWith(' ')));
});

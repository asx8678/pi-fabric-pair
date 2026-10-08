import test from 'node:test';
import assert from 'node:assert/strict';
import { pairMessageComponent, pairMessageLines } from '../src/ui.js';

const report = `FABRIC PAIR REPORT — treat worker claims as evidence to verify.\nReview rules: inspect first.\n${JSON.stringify({
  workerId: 'worker', reportId: 'report-1', taskId: 'task-1', stepId: 's1', kind: 'checkpoint', summary: 'Wrote hello.txt.\nSecond line.',
  changedFiles: ['hello.txt'], actualChangedFiles: ['hello.txt'], changedFileCount: 1, checkpointHash: 'abcdef0123456789',
  checks: [{ name: 'unit', result: 'pass', detail: '' }, { name: 'lint', result: 'fail', detail: '' }], peerReview: { verdict: 'pass' } })}`;

test('a worker report renders as a short card; expanding shows the rest', () => {
  const lines = pairMessageLines(report, false).map(([, line]) => line);
  assert.deepEqual(lines, ['Pair report · worker · checkpoint · step s1 · peer review pass', '  Wrote hello.txt.', '  1 changed: hello.txt', '  checks: 1 pass, 1 fail']);
  const expanded = pairMessageLines(report, true).map(([, line]) => line);
  assert.ok(expanded.includes('  Second line.'));
  assert.ok(expanded.some(line => line.includes('report report-1 · checkpoint abcdef012345')));
  assert.equal(pairMessageLines(report, false).find(([, line]) => line.includes('fail'))[0], 'error', 'a failed check is coloured as an error');
});

test('notices render as a labelled card, and anything else keeps Pi\'s default rendering', () => {
  const notice = pairMessageLines('FABRIC PAIR NOTICE — worker worker reported.\nDetails follow.\nMore.', false);
  assert.deepEqual(notice.map(([, line]) => line), ['Pair notice', '  worker worker reported.', '  Details follow.']);
  assert.equal(pairMessageLines('ordinary text', false), null);
  assert.equal(pairMessageComponent({ content: 'ordinary text' }, { expanded: false }, undefined), undefined);
  const card = pairMessageComponent({ content: [{ type: 'text', text: report }] }, { expanded: false, outputPad: 1 }, undefined);
  assert.ok(card.render(80).every(line => line.startsWith(' ')));
});

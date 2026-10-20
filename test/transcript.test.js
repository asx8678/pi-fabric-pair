import test from 'node:test';
import assert from 'node:assert/strict';
import { callLabel, transcriptText } from '../src/transcript.js';

const NL = String.fromCharCode(10);
/** @param {string} text @returns {any} */
const pair = text => ({ role: 'user', content: [{ type: 'text', text }] });
/** @param {...any} content @returns {any} */
const worker = (...content) => ({ role: 'assistant', content });
/** @param {string} name @param {object} args @returns {any} */
const call = (name, args) => ({ type: 'toolCall', id: name, name, arguments: args });
/** @param {string} text @param {object} [over] @returns {any} */
const result = (text, over = {}) => ({ role: 'toolResult', toolName: 'fabric_exec', isError: false, content: [{ type: 'text', text }], ...over });
const fabric = (/** @type {string} */ name, /** @type {string} */ code) => call('fabric_exec', { display: { name, description: '' }, code });

test('a tool call is one line: a Fabric call names its label and the tools its code uses', () => {
  assert.equal(callLabel('fabric_exec', { display: { name: 'Run the tests' }, code: 'await pi.bash({ command: "npm test" }); await pi.bash({ command: "npm run lint" });' }), 'Run the tests · pi.bash');
  assert.equal(callLabel('fabric_exec', { display: { name: 'Fix and report' }, code: 'await pi.edit(a); await pi.bash (b); await extensions.pair_report(c);' }), 'Fix and report · pi.edit, pi.bash, extensions.pair_report');
  assert.equal(callLabel('fabric_exec', { code: 'const text = await pi.read({ path });' }), 'fabric_exec · pi.read', 'without a label the tool name stands in');
  assert.equal(callLabel('fabric_exec', { display: { name: 'Think' }, code: 'return 1;' }), 'Think');
  // Other tools show what they act on.
  assert.equal(callLabel('read', { path: 'src/ui.js' }), 'read src/ui.js');
  assert.equal(callLabel('bash', { command: 'npm test\n  -- --watch' }), 'bash npm test -- --watch');
  assert.equal(callLabel('grep', { pattern: 'TODO', path: '' }), 'grep TODO', 'an empty path is skipped');
  assert.equal(callLabel('custom', { count: 3 }), 'custom');
  assert.equal(callLabel('custom', null), 'custom');
  assert.ok(callLabel('fabric_exec', { display: { name: 'x'.repeat(500) } }).length <= 120, 'a long label is clipped');
});

test('the transcript names who speaks and folds tool results to one line', () => {
  const text = transcriptText([
    pair('Add retries to the fetch client.'),
    worker({ type: 'thinking', thinking: 'secret plan' }, { type: 'text', text: 'Reading the client first.' }, fabric('Read the client', 'await pi.read({ path: "src/http/client.js" })')),
    result('export function fetchJson(url) {\n  return fetch(url);\n\n}\n'),
    worker(fabric('Run the tests', 'await pi.bash({ command: "npm test" })')),
    result('Runtime error: boom\n    at line 3', { isError: true }),
    worker({ type: 'text', text: 'Done.' }),
  ]);
  assert.equal(text, [
    '◆ Pair',
    '  Add retries to the fetch client.',
    '',
    '◆ worker',
    '  Reading the client first.',
    '  → Read the client · pi.read',
    '  ← export function fetchJson(url) { (+2 lines)',
    '  → Run the tests · pi.bash',
    '  ✖ fabric_exec · Runtime error: boom (+1 line)',
    '  Done.',
  ].join(NL));
  assert.equal(text.includes('secret plan'), false, 'thinking is not part of the transcript');
});

test('a long prompt keeps its opening, and full mode shows everything', () => {
  const prompt = Array.from({ length: 40 }, (_, index) => `rule ${index + 1}`).join(NL);
  const output = Array.from({ length: 12 }, (_, index) => `ok ${index + 1}`).join(NL);
  const messages = [pair(prompt), worker(fabric('Check', 'pi.bash(x)')), result(output)];
  const folded = transcriptText(messages).split(NL);
  assert.deepEqual(folded.slice(0, 8), ['◆ Pair', '  rule 1', '  rule 2', '  rule 3', '  rule 4', '  rule 5', '  rule 6', '  … 34 more lines · o shows everything']);
  assert.ok(folded.includes('  ← ok 1 (+11 lines)'), folded.join(NL));
  const full = transcriptText(messages, { full: true }).split(NL);
  assert.ok(full.includes('  rule 40'), 'the whole prompt');
  assert.ok(full.includes('  ← ok 1'), full.join(NL));
  assert.ok(full.includes('      ok 12'), 'every output line, indented under its result');
  assert.equal(full.some(line => line.includes('more lines')), false);
});

test('a long run keeps its newest part and says what it left out', () => {
  // More messages than the folded window: the oldest leave, and a result never starts the view without its call.
  const many = [pair('start')];
  for (let index = 0; index < 100; index++) many.push(worker(fabric(`Step ${index}`, 'pi.bash(x)')), result(`output ${index}`));
  many.push(worker({ type: 'text', text: 'All done.' }));
  // 202 messages: the last 120 start at the result of step 40, whose call is outside the window.
  const text = transcriptText(many);
  const lines = text.split(NL);
  assert.equal(lines[0], '… earlier messages not shown');
  assert.equal(lines[2], '◆ worker');
  assert.equal(lines[3], '  → Step 41 · pi.bash', 'the window starts at a call, not at an orphaned result');
  assert.equal(text.includes('output 40'), false);
  assert.ok(text.includes('← output 99'), 'the newest result is kept');
  assert.equal(text.includes('◆ Pair'), false, 'the first prompt is outside the window');
  // A transcript too large for the view drops its oldest lines first.
  const huge = Array.from({ length: 30 }, (_, index) => worker({ type: 'text', text: `${index} ${'word '.repeat(600)}` }));
  const capped = transcriptText(huge);
  assert.ok(capped.length <= 61000, `capped at ${capped.length}`);
  assert.ok(capped.startsWith('… earlier lines not shown'), capped.slice(0, 60));
  assert.ok(capped.includes('  29 word'), 'the newest message survives');
  // No single output line can fill the view.
  const wide = transcriptText([pair('x'), worker(fabric('Dump', 'pi.bash(x)')), result(`first${NL}${'y'.repeat(5000)}`)], { full: true });
  assert.ok(wide.split(NL).every(line => line.length <= 2000), 'lines are clipped');
});

test('odd entries never break the transcript', () => {
  assert.equal(transcriptText([]), 'No messages yet.');
  assert.equal(transcriptText([null, 'text', 42]), 'No messages yet.');
  const text = transcriptText([
    { role: 'user', content: 'plain string prompt' },
    { role: 'assistant', content: 'plain string reply' },
    { role: 'toolResult', content: [] },
    { role: 'system', content: [{ type: 'image' }] },
    { content: [{ type: 'text', text: 'no role' }] },
  ]);
  assert.equal(text, ['◆ Pair', '  plain string prompt', '', '◆ worker', '  plain string reply', '  ← (no output)', '', '◆ system', '  (empty)', '', '◆ unknown', '  no role'].join(NL));
  // Terminal control sequences in output cannot reach the view.
  assert.equal(transcriptText([worker({ type: 'text', text: 'red \u001b[31mtext\u001b[0m \u0007done' })]).includes('\u001b'), false);
});

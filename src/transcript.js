/**
 * The worker transcript as text: what the worker said, one line per tool call and per result, and the
 * prompts Pair sent, folded so a long run stays readable. With `full`, every result and prompt is whole.
 * Pure, so it can be tested without a session file.
 */
import { isRpcRecord } from './rpc.js';
import { cleanText } from './util.js';

/** Beyond this many characters only the newest part of the transcript is kept. */
const TRANSCRIPT_LIMIT = 60000;
/** Recent messages read: folded messages are short, so more of them fit. */
const FOLDED_MESSAGES = 120;
const FULL_MESSAGES = 40;
/** A folded prompt keeps its first lines. */
const PROMPT_LINES = 6;
/** No single line is longer than this, so one huge output cannot fill the view. */
const LINE_LIMIT = 2000;

/** @param {string} text @param {number} max @returns {string} */
function oneLine(text, max) {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
/** @param {string} line @returns {string} */
function clip(line) { return line.length > LINE_LIMIT ? `${line.slice(0, LINE_LIMIT - 1)}…` : line; }
/** @param {unknown} content @returns {string} */
function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.flatMap(block => (isRpcRecord(block) && block.type === 'text' && typeof block.text === 'string' ? [block.text] : [])).join('\n');
}
/**
 * One line naming a tool call. A Fabric call shows its own label and the tools its code calls
 * (`Run the tests · pi.bash`); any other tool shows its target (`read src/ui.js`).
 * @param {string} name
 * @param {unknown} args
 * @returns {string}
 */
export function callLabel(name, args) {
  if (!isRpcRecord(args)) return name;
  const display = isRpcRecord(args.display) && typeof args.display.name === 'string' ? oneLine(args.display.name, 120) : '';
  const used = typeof args.code === 'string' ? [...new Set(args.code.match(/\b(?:pi|extensions)\.[A-Za-z_]\w*(?=\s*\()/g) ?? [])] : [];
  if (display || used.length) return [display || name, used.join(', ')].filter(Boolean).join(' · ');
  const target = ['path', 'file_path', 'command', 'cmd', 'pattern', 'query', 'url'].map(key => args[key]).find(value => typeof value === 'string' && value.trim());
  return typeof target === 'string' ? `${name} ${oneLine(target, 120)}` : name;
}
/**
 * The transcript text the follow view shows. Lines start with a marker the view styles: `◆` who speaks,
 * `→` a tool call, `←` its result, `✖` a failed one, `…` what was folded away.
 * @param {readonly unknown[]} messages the session's messages, oldest first
 * @param {{full?: boolean}} [options]
 * @returns {string}
 */
export function transcriptText(messages, { full = false } = {}) {
  /** @type {string[]} */
  const lines = [];
  let speaker = '';
  /** @param {string} who */
  const speak = who => {
    if (speaker === who) return;
    if (lines.length) lines.push('');
    lines.push(`◆ ${who}`);
    speaker = who;
  };
  const records = messages.filter(isRpcRecord);
  let first = Math.max(0, records.length - (full ? FULL_MESSAGES : FOLDED_MESSAGES));
  // A result whose call fell outside the window would read without context.
  while (first > 0 && first < records.length && records[first].role === 'toolResult') first++;
  if (first > 0) lines.push('… earlier messages not shown');
  for (const message of records.slice(first)) {
    const role = typeof message.role === 'string' ? message.role : 'unknown';
    if (role === 'assistant') {
      speak('worker');
      const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : Array.isArray(message.content) ? message.content.filter(isRpcRecord) : [];
      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) lines.push(...cleanText(block.text, 100000).trim().split('\n').map(line => clip(`  ${line}`)));
        else if (block.type === 'toolCall' && typeof block.name === 'string') lines.push(`  → ${callLabel(block.name, block.arguments)}`);
      }
    } else if (role === 'toolResult') {
      speak('worker');
      const output = cleanText(textOf(message.content), full ? 200000 : 20000).split('\n');
      const at = output.findIndex(line => line.trim());
      const head = message.isError === true ? `  ✖ ${typeof message.toolName === 'string' ? message.toolName : 'tool'} · ` : '  ← ';
      const first = at < 0 ? '(no output)' : output[at].trim();
      if (full) lines.push(clip(`${head}${first}`), ...(at < 0 ? [] : output.slice(at + 1)).map(line => clip(`      ${line}`)));
      else {
        const more = at < 0 ? 0 : output.slice(at + 1).filter(line => line.trim()).length;
        lines.push(`${head}${oneLine(first, 160)}${more ? ` (+${more} line${more === 1 ? '' : 's'})` : ''}`);
      }
    } else {
      speak(role === 'user' ? 'Pair' : role);
      const text = cleanText(textOf(message.content), full ? 200000 : 50000).trim();
      const body = text ? text.split('\n') : ['(empty)'];
      // A task prompt can run to hundreds of lines; folded, it keeps its opening.
      const kept = full ? body : body.slice(0, PROMPT_LINES);
      lines.push(...kept.map(line => clip(`  ${full ? line : oneLine(line, 300)}`)));
      if (kept.length < body.length) lines.push(`  … ${body.length - kept.length} more line${body.length - kept.length === 1 ? '' : 's'} · o shows everything`);
    }
  }
  if (!lines.length) return 'No messages yet.';
  // Keep the newest part: the end of the conversation is what a follow view is for.
  let size = lines.reduce((sum, line) => sum + line.length + 1, 0), start = 0;
  while (size > TRANSCRIPT_LIMIT && start < lines.length - 1) size -= lines[start++].length + 1;
  return (start ? ['… earlier lines not shown', '', ...lines.slice(start)] : lines).join('\n');
}

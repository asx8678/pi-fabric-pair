// Offline JSONL framing coverage for PiRpc.consume: no child process is spawned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PiRpc } from '../src/rpc.js';

function transport(options) {
  const rpc = new PiRpc(options), events = [], faults = [];
  rpc.on('event', event => events.push(event.n));
  rpc.on('fault', error => faults.push(error.message));
  rpc.on('diagnostic', () => {}); // fail() tries to stop a never-started process
  return { rpc, events, faults, feed: text => rpc.consume(Buffer.from(text)) };
}

test('frames split across chunks, multi-byte characters and CRLF are reassembled', () => {
  const t = transport();
  const bytes = Buffer.from('{"type":"e","n":1,"s":"héllo ✓"}\r\n{"type":"e","n":2}\n');
  for (const byte of bytes) t.rpc.consume(Buffer.from([byte]));
  assert.deepEqual(t.events, [1, 2]);
  assert.deepEqual(t.faults, []);
});

test('an invalid frame faults the transport but later frames in the same chunk still arrive', () => {
  const t = transport();
  t.feed('{"type":"e","n":1}\nnot json\n{"type":"e","n":2}\n{"type":"e","n":3}\n');
  assert.deepEqual(t.events, [1, 2, 3]);
  assert.equal(t.faults.length, 1);
  assert.match(t.faults[0], /Invalid worker protocol/);
});

test('a fault raised while a frame is partially buffered keeps that frame intact', () => {
  const t = transport();
  t.feed('{"type":"e",');
  t.rpc.fail(new Error('deadline elsewhere'));
  t.feed('"n":1}\n{"type":"e","n":2}\n');
  assert.deepEqual(t.events, [1, 2], 'the frame spanning the fault is not torn');
  assert.deepEqual(t.faults, ['deadline elsewhere']);
});

test('an oversized incomplete frame is skipped up to the next boundary, then parsing resumes', () => {
  const t = transport({ maxLineBytes: 64 });
  t.feed(`{"type":"e","n":0,"pad":"${'x'.repeat(100)}`);
  assert.equal(t.faults.length, 1);
  t.feed(`${'y'.repeat(50)}"}\n{"type":"e","n":1}\n`);
  assert.deepEqual(t.events, [1]);
});

test('a large frame delivered in many chunks is assembled once', () => {
  const t = transport();
  const payload = 'x'.repeat(8 * 1024 * 1024), text = `{"type":"e","n":1,"p":"${payload}"}\n`;
  for (let i = 0; i < text.length; i += 64 * 1024) t.feed(text.slice(i, i + 64 * 1024));
  assert.deepEqual(t.events, [1]);
  assert.deepEqual(t.faults, []);
});

// The low runtime's clock rules: the status-file heartbeat, which is what tells a quiet server from a dead one.
// Pure, and driven by an injected clock: no process and no wait, so the edges cannot flake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heartbeatFresh } from '../src/low-runtime.js';

const NOW = 1_700_000_000_000;

test('a heartbeat is fresh until it is the window old, then it is not', () => {
  assert.equal(heartbeatFresh(NOW, NOW), true, 'a heartbeat written now');
  assert.equal(heartbeatFresh(NOW - 29_999, NOW), true, 'one millisecond inside the window');
  assert.equal(heartbeatFresh(NOW - 30_000, NOW), false, 'exactly the window old is already stale');
  assert.equal(heartbeatFresh(NOW - 10 * 60_000, NOW), false, 'ten minutes of silence');
});

test('a heartbeat in the future is never fresh, and neither is a missing one', () => {
  // A host clock that jumped, or a file copied between machines, must not make a frozen server look alive for ever.
  assert.equal(heartbeatFresh(NOW + 1, NOW), false);
  assert.equal(heartbeatFresh(NOW + 60 * 60_000, NOW), false);
  assert.equal(heartbeatFresh(0, NOW), false, 'no timestamp at all');
  assert.equal(heartbeatFresh(Number.NaN, NOW), false);
  assert.equal(heartbeatFresh(NOW, Number.NaN), false);
});

test('the window is a parameter, so an older low or a test can use its own', () => {
  assert.equal(heartbeatFresh(NOW - 50_000, NOW, 60_000), true);
  assert.equal(heartbeatFresh(NOW - 50_000, NOW), false);
  assert.equal(heartbeatFresh(NOW - 1_000, NOW, 1_000), false, 'a zero-width window accepts nothing');
});

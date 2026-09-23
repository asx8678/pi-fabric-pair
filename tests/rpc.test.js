import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, until } from './helpers.js';
import { RpcUncertainError } from '../src/rpc.js';

test('JSONL transport preserves UTF-8 split across individual bytes', async t => {
  const { c } = await fixture(t); await c.start('worker');
  assert.deepEqual(await c.handles.get('worker').rpc.send('fixture_utf8'), { text: 'Zażółć 🐐' });
});
test('RPC rejects unknown commands without restarting the session', async t => {
  const { c } = await fixture(t); await c.start('worker'); const rpc = c.handles.get('worker').rpc, pid = rpc.pid;
  await assert.rejects(() => rpc.send('unsupported'), /unknown fixture/);
  assert.equal((await rpc.send('get_state')).sessionId, c.state.workers.worker.sessionId); assert.equal(rpc.pid, pid);
});
test('acknowledgement timeout is explicitly uncertain and clears pending requests', async t => {
  const { c } = await fixture(t); await c.start('worker'); const rpc = c.handles.get('worker').rpc;
  await assert.rejects(() => rpc.send('fixture_timeout', {}, 50), RpcUncertainError);
  assert.equal(rpc.pending.size, 0); assert.ok(await rpc.send('get_state'));
});
test('malformed stdout faults the transport rather than interpreting it as a report', async t => {
  const { c } = await fixture(t); await c.start('worker'); const rpc = c.handles.get('worker').rpc;
  await assert.rejects(() => rpc.send('fixture_bad_json'), /Non-protocol/);
  await until(() => rpc.closed);
});
test('unexpected process exit rejects pending commands', async t => {
  const { c } = await fixture(t); await c.start('worker'); const rpc = c.handles.get('worker').rpc;
  await assert.rejects(() => rpc.send('fixture_exit'), /exited/);
  assert.equal(rpc.pending.size, 0);
});
test('stop closes owned child process cleanly and is idempotent', async t => {
  const { c } = await fixture(t); await c.start('worker'); const rpc = c.handles.get('worker').rpc;
  await c.stop('worker'); await rpc.stop(); assert.equal(rpc.closed, true);
});

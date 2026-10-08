import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyConfigured } from '../src/evidence.js';
import { atomicJSON } from '../src/util.js';

test('N verification checks take N captures: each check starts from the previous after-state', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-verify-'));
  try {
    let captures = 0;
    const config = { commands: [{ name: 'a', command: process.execPath, args: ['-e', ''] }, { name: 'b', command: process.execPath, args: ['-e', ''] }], timeoutMs: 10000 };
    const results = await verifyConfigured(config, dir, path.join(dir, 'checks'), undefined, { expectedHash: 'h0', captureSource: async () => { captures++; return 'h0'; } });
    assert.deepEqual(results.map(r => r.passed), [true, true]);
    assert.equal(captures, 2);
    captures = 0;
    const drift = await verifyConfigured(config, dir, path.join(dir, 'checks2'), undefined, { expectedHash: 'h0', captureSource: async () => `h${++captures}` });
    assert.equal(drift.length, 1, 'a change during the first check stops the run');
    assert.match(drift[0].output, /VERIFICATION_SOURCE_DRIFT: the workspace changed while running check a/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('a non-durable atomic write is still whole and replaces the file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-atomic-'));
  try {
    const file = path.join(dir, 'telemetry.json');
    await atomicJSON(file, { n: 1 }, { durable: false });
    await atomicJSON(file, { n: 2 }, { durable: false, compact: true });
    assert.equal(await fs.readFile(file, 'utf8'), '{"n":2}\n');
    assert.deepEqual((await fs.readdir(dir)).filter(name => name.endsWith('.tmp')), []);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('agent_end and turn_end arrive by type only, at any size, and quietly', async () => {
  const { PiRpc } = await import('../src/rpc.js');
  const rpc = new PiRpc({}), events = [], diagnostics = [];
  rpc.on('event', event => events.push(event)); rpc.on('diagnostic', d => diagnostics.push(d));
  const messages = Array.from({ length: 50 }, (_, i) => ({ role: 'assistant', content: [{ type: 'text', text: `reply ${i}` }] }));
  const frame = `${JSON.stringify({ type: 'agent_end', messages })}\n{"type":"turn_end","toolResults":[]}\n{"type":"e"}\n`;
  for (let i = 0; i < frame.length; i += 37) rpc.consume(Buffer.from(frame.slice(i, i + 37)));
  assert.deepEqual(events, [{ type: 'agent_end', payloadOmitted: true }, { type: 'turn_end', payloadOmitted: true }, { type: 'e' }]);
  assert.deepEqual(diagnostics, [], 'an ordinary-sized frame is not worth a diagnostic');
});

test('a ChatGPT sign-in OpenAI model is never warmed, like Codex', async () => {
  const { shortWarmReplay, signedIn, ensureCacheLifetime } = await import('../src/native.js');
  const chatgpt = { provider: 'openai', id: 'gpt', api: 'openai-responses' };
  assert.equal(shortWarmReplay(chatgpt), true, 'with an API key the request is capped');
  assert.equal(shortWarmReplay(chatgpt, true), false);
  assert.equal(shortWarmReplay({ provider: 'openai-codex', api: 'openai-codex-responses' }), false);
  assert.equal(signedIn({ isUsingOAuth: model => model.provider === 'openai' }, chatgpt), true);
  assert.equal(signedIn(undefined, chatgpt), false);
  assert.equal(signedIn({ isUsingOAuth() { throw new Error('no registry'); } }, chatgpt), false);
  assert.equal(ensureCacheLifetime({ ...chatgpt }, true), false, 'no default lifetime, so Pi never refreshes it');
  assert.equal(ensureCacheLifetime({ ...chatgpt }, false), true);
});

test('runtime.mcp defaults to on and must be a boolean', async () => {
  const { DEFAULTS, validateConfig } = await import('../src/config.js');
  assert.equal(DEFAULTS.runtime.mcp, true);
  assert.equal(validateConfig({ runtime: { mcp: false } }).runtime.mcp, false);
  assert.throws(() => validateConfig({ runtime: { mcp: 'no' } }), /runtime\.mcp must be boolean/);
});

// Protocol-contract fixture, NOT the real Pi, Fabric, or Fovea implementations.
// It exercises the real worker bridge and real child-process transport without credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { registerWorker } from '../../src/worker.js';
const argv = process.argv.slice(2), value = flag => argv[argv.indexOf(flag) + 1];
const sessionFile = argv.includes('--session') ? value('--session') : path.join(value('--session-dir'), 'retained.jsonl');
let data;
try { data = JSON.parse((await fs.readFile(sessionFile, 'utf8')).split('\n')[0]); }
catch { data = { id: randomUUID(), messages: [] }; }
const persist = async () => { await fs.mkdir(path.dirname(sessionFile), { recursive: true }); await fs.writeFile(sessionFile, JSON.stringify(data) + '\n'); };
await persist();
let autoCompaction = true;
try { autoCompaction = JSON.parse(await fs.readFile(path.join(process.env.PI_CODING_AGENT_DIR, 'settings.json'), 'utf8')).compaction?.enabled !== false; } catch {}
let model = { provider: value('--provider'), id: value('--model'), contextWindow: 100000, reasoning: true }, effort = 'medium';
let busy = false, compacting = false, activeAbort = null, exiting = false;
let scenario = process.env.FAKE_PI_SCENARIO || 'checkpoint';
const handlers = new Map(), commands = new Map(), tools = new Map(), dialogs = new Map();
const emit = message => process.stdout.write(JSON.stringify(message) + '\n');
const ui = {
  notify(message, notifyType) { emit({ type: 'extension_ui_request', id: randomUUID(), method: 'notify', message, notifyType }); },
  async confirm(title, message) { const id = randomUUID(); emit({ type: 'extension_ui_request', id, method: 'confirm', title, message }); return new Promise(resolve => dialogs.set(id, frame => resolve(frame.confirmed === true))); }
};
const ctx = {
  cwd: process.cwd(), mode: 'rpc', hasUI: true, ui,
  get model() { return model; }, get thinkingLevel() { return effort; }, get signal() { return activeAbort?.signal; },
  sessionManager: { getSessionId: () => data.id, getSessionFile: () => sessionFile },
  isProjectTrusted: () => true, isIdle: () => !busy, hasPendingMessages: () => false,
  abort() { activeAbort?.abort(); }, shutdown() { shutdown(); },
  getContextUsage: () => ({ tokens: 100 + data.messages.length * 10, contextWindow: 100000, percent: (100 + data.messages.length * 10) / 1000 })
};
const pi = {
  registerTool(tool) { tools.set(tool.name, tool); }, registerCommand(name, definition) { commands.set(name, definition); },
  on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); return () => {}; },
  getAllTools() { return [{ name: 'fabric_exec' }, { name: 'fovea_focus' }, ...[...tools.values()].map(t => ({ name: t.name }))]; },
  getCommands() { return [{ name: 'fabric', source: 'extension' }, { name: 'fovea', source: 'extension' }, ...[...commands.keys()].map(name => ({ name, source: 'extension' }))]; },
  sendMessage(message) { data.messages.push({ role: 'custom', content: message.content }); },
  appendEntry(type, info) { data.messages.push({ role: 'entry', content: JSON.stringify({ type, info }) }); }
};
async function hooks(name, event = {}) { let result; for (const handler of handlers.get(name) || []) { const r = await handler({ type: name, ...event }, ctx); if (r !== undefined) result = r; } return result; }
registerWorker(pi);
await hooks('session_start', { reason: 'startup' });
const state = () => ({ model, thinkingLevel: effort, isStreaming: busy, isCompacting: compacting, sessionId: data.id, sessionFile, autoCompactionEnabled: autoCompaction, pendingMessageCount: 0, messageCount: data.messages.length });
async function invoke(name, input) {
  const id = randomUUID();
  const gated = await hooks('tool_call', { toolName: name, toolCallId: id, input });
  if (gated?.block) throw new Error(gated.reason);
  emit({ type: 'tool_execution_start', toolName: name, toolCallId: id }); await hooks('tool_execution_start', { toolName: name, toolCallId: id });
  let answer;
  if (name === 'write') { await fs.writeFile(path.join(ctx.cwd, input.path), input.content); answer = { content: [{ type: 'text', text: 'written' }] }; }
  else answer = await tools.get(name).execute(id, input, ctx.signal, undefined, ctx);
  await hooks('tool_execution_end', { toolName: name, toolCallId: id, result: answer }); emit({ type: 'tool_execution_end', toolName: name, toolCallId: id, result: answer });
  return answer;
}
async function run(message) {
  try {
    activeAbort = new AbortController();
    await hooks('before_agent_start', { systemPrompt: 'Fixture system prompt', prompt: message });
    data.messages.push({ role: 'user', content: message });
    emit({ type: 'agent_start' }); await hooks('agent_start');
    emit({ type: 'turn_start' }); await hooks('turn_start');
    if (scenario === 'hang') { await new Promise(resolve => activeAbort.signal.addEventListener('abort', resolve, { once: true })); return; }
    if (scenario === 'permission') { const allowed = await ui.confirm('Run check?', 'Fixture permission request'); if (!allowed) throw new Error('Permission denied by parent'); }
    const a = JSON.parse(await fs.readFile(path.join(process.env.PI_FABRIC_PAIR_WORKER_DIR, 'authority.json'), 'utf8'));
    if (scenario === 'write') await invoke('write', { path: 'generated.txt', content: `generated for ${a.task.id} step ${a.task.stepIndex}\n` });
    const assistant = { role: 'assistant', content: [{ type: 'text', text: 'Fixture work completed.' }], usage: { input: 20, cacheRead: 100, cacheWrite: 10, output: 5, cost: { total: .001 } } };
    data.messages.push(assistant); await hooks('message_end', { message: assistant }); emit({ type: 'message_end', message: assistant });
    if (scenario === 'no-report') return;
    const final = a.task.policy.mode === 'final' || a.task.stepIndex === a.task.steps.length - 1;
    const ask = scenario === 'question' && !a.task.lastDecision;
    const payload = { taskId: a.task.id, stepId: a.task.steps[a.task.stepIndex].id, kind: ask ? 'question' : final ? 'final_review' : 'checkpoint', summary: ask ? 'Need a design choice.' : 'Bounded fixture implementation complete.', ...(ask ? { question: 'Preserve compatibility?' } : {}), checks: [{ name: 'worker-reported check', result: 'pass' }] };
    const answer = await invoke('pair_report', payload);
    data.messages.push({ role: 'toolResult', content: answer.content });
    // Exercise a spurious continuation after a report: it must be gated.
    if (process.env.FAKE_FOVEA_CONTINUE === '1') { await hooks('turn_start'); const block = await hooks('tool_call', { toolName: 'fs.write', toolCallId: 'fabric_late', input: { path: 'must-not-exist' } }); if (!block?.block) throw new Error('Gate failed'); }
  } catch (error) {
    emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: String(error) }], stopReason: 'error' } });
  } finally {
    emit({ type: 'agent_end' }); await hooks('agent_end'); await hooks('agent_before_settle');
    busy = false; await persist(); await hooks('agent_settled'); emit({ type: 'agent_settled' });
  }
}
async function handle(frame) {
  if (frame.type === 'extension_ui_response') { dialogs.get(frame.id)?.(frame); dialogs.delete(frame.id); return; }
  const ok = data => emit({ type: 'response', id: frame.id, command: frame.type, success: true, ...(data === undefined ? {} : { data }) });
  try {
    if (frame.type === 'get_state') return ok(state());
    if (frame.type === 'get_available_thinking_levels') return ok({ levels: ['off', 'low', 'medium', 'high'] });
    if (frame.type === 'get_available_models') return ok({ models: [model] });
    if (frame.type === 'set_model') { model = { ...model, provider: frame.provider, id: frame.modelId }; await hooks('model_select'); return ok(model); }
    if (frame.type === 'set_thinking_level') { effort = frame.level; return ok(); }
    if (frame.type === 'get_commands') return ok({ commands: pi.getCommands() });
    if (frame.type === 'get_messages') return ok({ messages: data.messages });
    if (frame.type === 'get_session_stats') return ok({ messages: data.messages.length });
    if (frame.type === 'clear_queue') return ok({ steering: [], followUp: [] });
    if (frame.type === 'abort') { activeAbort?.abort(); return ok(); }
    if (frame.type === 'compact') {
      compacting = true; emit({ type: 'auto_compaction_start' }); await hooks('session_before_compact');
      const before = data.messages.length; data.messages = [{ role: 'custom', content: 'Fixture compacted history' }];
      await hooks('session_compact'); await persist(); compacting = false; emit({ type: 'auto_compaction_end' }); return ok({ tokensBefore: before * 10, summary: 'fixture', firstKeptEntryId: 'fixture-entry' });
    }
    if (frame.type === 'prompt') {
      if (frame.message.startsWith('/pair-bridge ')) { await commands.get('pair-bridge').handler(frame.message.slice('/pair-bridge '.length), ctx); return ok(); }
      if (busy) throw new Error('already streaming'); busy = true; ok(); setTimeout(() => run(frame.message), 10); return;
    }
    if (frame.type === 'fixture_timeout') return;
    if (frame.type === 'fixture_utf8') { const buffer = Buffer.from(JSON.stringify({ type: 'response', command: frame.type, id: frame.id, success: true, data: { text: 'Zażółć 🐐' } }) + '\n'); for (const byte of buffer) process.stdout.write(Buffer.from([byte])); return; }
    if (frame.type === 'fixture_bad_json') { process.stdout.write('not JSON\n'); return; }
    if (frame.type === 'fixture_exit') { process.exit(13); }
    throw new Error('unknown fixture command');
  } catch (error) { emit({ type: 'response', id: frame.id, command: frame.type, success: false, error: String(error) }); }
}
async function shutdown() {
  if (exiting) return; exiting = true; activeAbort?.abort();
  await new Promise(resolve => setTimeout(resolve, 20)); await hooks('session_shutdown'); await persist(); process.exit(0);
}
const input = readline.createInterface({ input: process.stdin }); input.on('line', line => { handle(JSON.parse(line)).catch(error => process.stderr.write(String(error))); });
input.on('close', shutdown); process.on('SIGTERM', shutdown);

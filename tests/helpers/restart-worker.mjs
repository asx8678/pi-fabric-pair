// Offline Pi RPC host for process replacement tests. Runs the actual Pair worker
// bridge; any prompt other than the bridge command is rejected (no inference).
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { registerWorker } from '../../src/worker.js';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const sessionFile = arg('--session'), cwd = await fs.realpath(process.cwd());
const entryPath = fileURLToPath(new URL('../../src/extension.js', import.meta.url));
let history = (await fs.readFile(sessionFile, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
if (!history.length) {
  history = [{ type: 'session', version: 3, id: randomUUID(), timestamp: new Date().toISOString(), cwd }];
  await fs.writeFile(sessionFile, `${JSON.stringify(history[0])}\n`);
}
const sessionId = history[0].id, events = new Map(), commands = new Map(), tools = new Map();
let model = { provider: arg('--provider'), id: arg('--model'), contextWindow: 100000 };
let thinkingLevel = history.findLast(entry => entry.type === 'thinking_level_change')?.thinkingLevel || 'medium';
async function append(entry) {
  const value = { id: randomUUID(), parentId: history.at(-1).type === 'session' ? null : history.at(-1).id, timestamp: new Date().toISOString(), ...entry };
  history.push(value); await fs.appendFile(sessionFile, `${JSON.stringify(value)}\n`);
}
const previousModel = history.findLast(entry => entry.type === 'model_change');
if (previousModel?.provider !== model.provider || previousModel?.modelId !== model.id) await append({ type: 'model_change', provider: model.provider, modelId: model.id });
const registration = name => ({ name, source: 'extension', sourceInfo: { path: entryPath } });
const send = event => process.stdout.write(`${JSON.stringify(event)}\n`);
const ctx = {
  cwd, get model() { return model; }, isProjectTrusted: () => false, getContextUsage: () => undefined,
  sessionManager: { getSessionId: () => sessionId, getSessionFile: () => sessionFile },
  abort: () => {}, shutdown: () => process.exit(0),
  ui: { notify: (message, notifyType) => send({ type: 'extension_ui_request', method: 'notify', message, notifyType }) },
};
registerWorker({
  on: (name, handler) => events.set(name, handler),
  registerTool: tool => tools.set(tool.name, tool),
  registerCommand: (name, command) => commands.set(name, command),
  getAllTools: () => [...tools.keys()].map(registration),
  getCommands: () => [...commands.keys()].map(registration),
  getThinkingLevel: () => thinkingLevel,
});
await events.get('session_start')({}, ctx);
const input = readline.createInterface({ input: process.stdin });
for await (const line of input) {
  const request = JSON.parse(line);
  await fs.appendFile(path.join(process.env.PI_FABRIC_PAIR_WORKER_DIR, 'test-rpc.jsonl'), `${JSON.stringify({ generation: Number(process.env.PI_FABRIC_PAIR_WORKER_GENERATION), ...request })}\n`);
  try {
    let data = {};
    switch (request.type) {
      case 'get_state': data = { sessionId, sessionFile, model, thinkingLevel, isStreaming: false, isCompacting: false, pendingMessageCount: 0, autoCompactionEnabled: true }; break;
      case 'get_entries': data = { entries: history.slice(1), leafId: history.length > 1 ? history.at(-1).id : null }; break;
      case 'get_commands': data = { commands: [...commands.keys()].map(registration) }; break;
      case 'get_available_thinking_levels': data = { levels: ['off', 'low', 'medium', 'high'] }; break;
      case 'set_model':
        if (request.modelId === 'unavailable') throw Error('Fixture worker model is unavailable');
        model = { ...model, provider: request.provider, id: request.modelId }; break;
      case 'set_thinking_level':
        if (thinkingLevel !== request.level) { thinkingLevel = request.level; await append({ type: 'thinking_level_change', thinkingLevel }); }
        break;
      case 'prompt':
        if (!/^\/pair-bridge (probe|load)$/.test(request.message)) throw Error('Inference is forbidden in the restart fixture');
        await commands.get('pair-bridge').handler(request.message.split(' ')[1], ctx); break;
      case 'clear_queue': case 'abort': break;
      case 'test_history':
        await append({ type: 'message', message: { role: 'user', content: 'Keep this conversation and its earlier requirements.', timestamp: Date.now() } });
        await append({ type: 'custom', customType: 'fixture.retained-context', data: { keep: true } });
        break;
      case 'test_bad_frame': process.stdout.write('invalid JSON\n'); continue;
      default: throw Error(`Unexpected fixture RPC: ${request.type}`);
    }
    send({ type: 'response', id: request.id, command: request.type, success: true, data });
  } catch (error) { send({ type: 'response', id: request.id, command: request.type, success: false, error: error.message }); }
}
await events.get('session_shutdown')({}, ctx);
if (process.connected) process.disconnect();

#!/usr/bin/env node
/** Opt-in startup/identity check using YOUR installed Pi. Does not request inference. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createInterface } from 'node:readline/promises';
import { PairController } from '../src/controller.js';
import { loadConfig, validateConfig } from '../src/config.js';
import { atomicJSON, cleanText, readJSON, uid } from '../src/util.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm run test:live -- --cwd /your/git/repository [--worker worker] [--config /path/fabric-pair.json] [--trust-project-config]');
  console.log('Uses locally configured Pi/Fabric/Fovea. Prompts are relayed to you. No task or model inference is requested by this script.');
  process.exit(0);
}
let cwd = process.cwd(), workerId, configFile, trustConfig = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--trust-project-config') trustConfig = true;
  else if (['--cwd', '--worker', '--config'].includes(arg)) {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
    const value = args[++i];
    if (arg === '--cwd') cwd = path.resolve(value);
    if (arg === '--worker') workerId = value;
    if (arg === '--config') configFile = path.resolve(value);
  } else throw new Error(`Unknown option ${arg}`);
}
let controller, terminal;
const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fabric-pair-live-'));
const exit = async signal => { await controller?.close().catch(() => {}); terminal?.close(); console.error(`Stopped: ${signal}. Test session retained in ${storageDir}`); process.exit(130); };
process.once('SIGINT', () => exit('SIGINT')); process.once('SIGTERM', () => exit('SIGTERM'));
try {
  const config = configFile ? validateConfig(await readJSON(configFile)) : (await loadConfig(cwd, trustConfig)).config;
  workerId ||= config.workers[0].id;
  console.log(`Starting an identity/readiness probe for ${workerId}; no implementation task will run.`);
  console.log('Third-party extensions still execute their own startup hooks. Use a separate Pi test profile first.');
  controller = await new PairController({ config, cwd, ownerSession: uid('live-smoke'), storageDir,
    callbacks: {
      notifyUser(message, level) { console.error(`[${level}] ${cleanText(message)}`); },
      async promptUser(id, event) {
        if (!process.stdin.isTTY) return { cancelled: true };
        terminal ||= createInterface({ input: process.stdin, output: process.stdout });
        console.log(`\n[${id}] ${cleanText(event.title || event.method)}\n${cleanText(event.message || '')}`);
        if (event.method === 'confirm') return { confirmed: (await terminal.question('Approve? Type yes; anything else denies: ')).trim() === 'yes' };
        if (event.method === 'select') {
          event.options.forEach((option, i) => console.log(`${i + 1}. ${cleanText(option)}`));
          const selected = Number(await terminal.question('Choice number, or blank to cancel: '));
          return Number.isInteger(selected) && selected >= 1 && selected <= event.options.length ? { value: event.options[selected - 1] } : { cancelled: true };
        }
        const value = await terminal.question('Response (blank cancels): ');
        return value ? { value } : { cancelled: true };
      }
    }
  }).init();
  await controller.start(workerId);
  const handle = controller.handles.get(workerId), first = await handle.rpc.send('get_state');
  await handle.rpc.send('prompt', { message: '/pair-bridge probe' });
  const second = await handle.rpc.send('get_state');
  if (first.sessionId !== second.sessionId || first.sessionFile !== second.sessionFile) throw new Error('Session identity changed during the no-inference probe');
  const report = { passed: true, inferenceRequestedByScript: false, checkedAt: new Date().toISOString(), node: process.version,
    workerId, pid: handle.rpc.pid, sessionId: second.sessionId, sessionFile: second.sessionFile,
    model: { provider: second.model?.provider, id: second.model?.id }, native: controller.record(workerId).probe,
    limitation: 'Startup and identity only. Run the documented bounded live task to verify actual provider calls, Fabric/Fovea behavior, and cache usage.' };
  await atomicJSON(path.join(storageDir, 'live-smoke-result.json'), report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`PASS: startup/identity checks. Local report: ${path.join(storageDir, 'live-smoke-result.json')}`);
} catch (error) {
  console.error(`FAIL: ${cleanText(error instanceof Error ? error.message : error)}`);
  console.error(`Diagnostics and any created session remain in ${storageDir}`);
  process.exitCode = 1;
} finally { await controller?.close().catch(error => console.error(cleanText(error))); terminal?.close(); }

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runCommand } from '../src/evidence.js';
import { PairController } from '../src/controller.js';
import { PiRpc } from '../src/rpc.js';
import { DEFAULTS, validateConfig } from '../src/config.js';
import { atomicJSON, delay, merge } from '../src/util.js';
export const mockPi = fileURLToPath(new URL('./fixtures/mock-pi.js', import.meta.url));
export async function fixture(t, options = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-test-')), cwd = path.join(tmp, 'repo'), home = path.join(tmp, 'agent');
  await fs.mkdir(cwd); await fs.mkdir(home);
  for (const args of [['init', '-q'], ['config', 'user.email', 'test@example.invalid'], ['config', 'user.name', 'Pair Test']]) await runCommand('git', args, { cwd });
  await fs.writeFile(path.join(cwd, 'README.md'), 'fixture repository\n');
  await runCommand('git', ['add', '.'], { cwd }); await runCommand('git', ['commit', '-qm', 'fixture'], { cwd });
  await atomicJSON(path.join(home, 'settings.json'), { compaction: { enabled: true }, cacheWarming: 'off' });
  await atomicJSON(path.join(home, 'fabric.json'), { prewalk: { enabled: false } });
  const config = validateConfig(merge(DEFAULTS, { autoStart: false, runtime: { command: process.execPath, commandArgs: [mockPi], startupTimeoutMs: 10000, requestTimeoutMs: 3000, shutdownTimeoutMs: 1000 }, workers: [{ id: 'worker', provider: 'fixture', model: 'worker-model', effort: 'medium', cwd: null, readOnly: false }], ...options.config }));
  const notices = [], warnings = [], dialogs = [];
  let c;
  function makeController(owner = 'main-session') {
    return new PairController({ config, cwd, ownerSession: owner, storageDir: path.join(tmp, `state-${owner}`),
      rpcFactory: opts => new PiRpc({ ...opts, env: { ...opts.env, PI_CODING_AGENT_DIR: home, FAKE_PI_SCENARIO: options.scenario || 'checkpoint', FAKE_FOVEA_CONTINUE: options.foveaContinue ? '1' : '0' } }),
      callbacks: {
        notifyMain: (message, details) => { notices.push({ message, details }); },
        notifyUser: (message, level) => warnings.push({ message, level }),
        promptUser: async (id, event) => { dialogs.push({ id, event }); return { confirmed: true }; }
      }
    });
  }
  c = await makeController().init();
  const controllers = [c];
  t.after(async () => { for (const ctrl of controllers) await ctrl.close().catch(() => {}); await fs.rm(tmp, { recursive: true, force: true }); });
  return { tmp, cwd, home, config, notices, warnings, dialogs, c, makeController, controllers };
}
export function assignment(requestId = 'request-1', workerId = 'worker', steps = 2) {
  return { workerId, requestId, objective: 'Complete bounded fixture changes', constraints: ['Preserve compatibility'], steps: Array.from({ length: steps }, (_, i) => ({ id: `step-${i + 1}`, title: `Step ${i + 1}`, instructions: 'Read the repository and submit a report.', acceptance: ['Review evidence'] })) };
}
export async function until(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(25); }
  throw new Error('Timed out waiting for test condition');
}
export async function awaitReport(c, id = 'worker', kind) {
  const report = await until(() => { const r = c.state.workers[id]; return r?.task?.report && ['review', 'question', 'blocked'].includes(r.task.status) && (!kind || r.task.report.payload.kind === kind) ? r.task.report : null; });
  await c.serial.drain();
  return report;
}
export async function approve(c, id = 'worker') {
  const t = c.state.workers[id].task; await c.inspect(id);
  return c.decide({ workerId: id, taskId: t.id, reportId: t.report.reportId, action: 'approve', feedback: 'Reviewed immutable fixture evidence.', checkpointHash: t.report.checkpoint.checkpointHash });
}

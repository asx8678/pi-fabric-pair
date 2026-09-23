#!/usr/bin/env node
/** Deterministic native Pi/Fabric/Fovea regression probes. No network or paid inference. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PairController } from '../src/controller.js';
import { validateConfig } from '../src/config.js';
import { runCommand } from '../src/evidence.js';
import { PiRpc } from '../src/rpc.js';
import { atomicJSON, cleanText, delay, uid } from '../src/util.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const providerExtension = fileURLToPath(new URL('./fixtures/native-offline-provider.js', import.meta.url));
const args = process.argv.slice(2); let keep = false, outputFile = null, all = false, help = false;
const requested = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--keep') keep = true;
  else if (arg === '--all') all = true;
  else if (arg === '--help') help = true;
  else if (arg === '--output') {
    const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('Missing value for --output');
    outputFile = path.resolve(value);
  } else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
  else requested.push(arg);
}
if (all) requested.splice(0, requested.length, 'provider', 'post-report-provider', 'background', 'implicit-background', 'idle-restart');
if (help || requested.length === 0) {
  console.log('Usage: npm run test:native -- [--all | provider post-report-provider background implicit-background idle-restart] [--keep] [--output file]');
  console.log('Environment: PI_FABRIC_PAIR_NATIVE_SOURCE_AGENT_DIR, PAIR_NATIVE_PI_COMMAND, PAIR_NATIVE_FABRIC_EXTENSION, PAIR_NATIVE_FOVEA_EXTENSION');
  process.exit(help ? 0 : 2);
}
for (const scenario of requested) if (!['provider', 'post-report-provider', 'background', 'implicit-background', 'idle-restart'].includes(scenario)) throw new Error(`Unknown native scenario: ${scenario}`);

const sourceAgentDir = path.resolve(process.env.PI_FABRIC_PAIR_NATIVE_SOURCE_AGENT_DIR || process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'));
async function extensionEntry(packageName, override) {
  if (override) return path.resolve(override);
  const packageDir = path.join(sourceAgentDir, 'npm', 'node_modules', packageName);
  const manifest = JSON.parse(await fs.readFile(path.join(packageDir, 'package.json'), 'utf8'));
  const entry = manifest.pi?.extensions?.[0];
  if (typeof entry !== 'string') throw new Error(`${packageName} has no pi.extensions entry`);
  return path.resolve(packageDir, entry);
}
const fabricExtension = await extensionEntry('pi-fabric', process.env.PAIR_NATIVE_FABRIC_EXTENSION);
const foveaExtension = await extensionEntry('pi-fovea', process.env.PAIR_NATIVE_FOVEA_EXTENSION);
for (const file of [providerExtension, fabricExtension, foveaExtension]) await fs.access(file);

async function git(cwd, args) {
  const result = await runCommand('git', args, { cwd });
  if (result.code !== 0) throw new Error(result.stderr || `git ${args[0]} failed`);
}
async function waitFor(fn, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(100); }
  throw new Error('Timed out waiting for native Pair state');
}
async function fileText(file) { return fs.readFile(file, 'utf8').catch(error => error.code === 'ENOENT' ? null : Promise.reject(error)); }
async function readLog(file) {
  const text = await fileText(file); if (!text) return [];
  return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

async function runScenario(scenario) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `fabric-pair-native-${scenario}-`));
  const cwd = path.join(root, 'repo'), home = path.join(root, 'agent'), logFile = path.join(root, 'native-hooks.jsonl');
  await fs.mkdir(cwd); await fs.mkdir(home);
  await atomicJSON(path.join(home, 'settings.json'), { defaultProjectTrust: 'always', cacheWarming: 'off', enableInstallTelemetry: false, enableAnalytics: false, compaction: { enabled: true }, packages: [] });
  await atomicJSON(path.join(home, 'fabric.json'), { prewalk: { enabled: false }, executor: { language: 'typescript', shellHangMs: scenario === 'implicit-background' ? 100 : 0 }, agents: { maxDepth: 0 }, mcp: { enabled: false } });
  await fs.writeFile(path.join(cwd, 'README.md'), 'Deterministic native Fabric Pair fixture\n');
  await fs.writeFile(path.join(cwd, '.gitignore'), '.pi/\n');
  await git(cwd, ['init', '-q']); await git(cwd, ['config', 'user.name', 'Pair native fixture']);
  await git(cwd, ['config', 'user.email', 'pair-native@example.invalid']); await git(cwd, ['add', '.']); await git(cwd, ['commit', '-qm', 'fixture']);
  const config = validateConfig({ enabled: true, autoStart: false, runtime: { command: process.env.PAIR_NATIVE_PI_COMMAND || 'pi', commandArgs: [], inheritExtensions: false,
    extraExtensions: [fabricExtension, foveaExtension, providerExtension], startupTimeoutMs: 60000, requestTimeoutMs: 30000, shutdownTimeoutMs: 5000 },
    workers: [{ id: 'worker', provider: 'pair-native-offline', model: 'fixture', effort: 'off', cwd: null, readOnly: scenario === 'provider' }] });
  const observations = []; let controller;
  const result = { scenario, passed: false, root: keep ? root : undefined, node: process.version,
    launcher: process.env.PAIR_NATIVE_PI_COMMAND || 'pi', extensionPaths: { fabric: fabricExtension, fovea: foveaExtension } };
  try {
    controller = await new PairController({ config, cwd, ownerSession: uid('native-main'), storageDir: path.join(root, 'state'),
      callbacks: { notifyMain: (_message, details) => observations.push({ type: 'notice', details }), notifyUser: (message, level) => observations.push({ type: 'notification', level, message: cleanText(message) }), promptUser: async () => ({ cancelled: true }) },
      rpcFactory: options => new PiRpc({ ...options, env: { ...options.env, PI_CODING_AGENT_DIR: home, PAIR_NATIVE_SCENARIO: scenario, PAIR_NATIVE_LOG: logFile } })
    }).init();
    await controller.start('worker');
    const record = controller.record('worker'); result.sessionId = record.sessionId; result.versions = record.probe?.versions;
    result.sessionFileExistsAfterStart = await fs.access(record.sessionFile).then(() => true, () => false);
    if (scenario === 'idle-restart') {
      await controller.stop('worker');
      try { await controller.start('worker'); result.restarted = true; }
      catch (error) { result.restartError = cleanText(error instanceof Error ? error.message : error); }
      result.passed = result.restarted === true && controller.record('worker').sessionId === result.sessionId;
    } else {
      await controller.dispatch({ workerId: 'worker', requestId: `native-${scenario}`, objective: `Run deterministic ${scenario} safety regression`, steps: [{ id: 'probe', title: 'Probe native safety', instructions: 'Execute only the deterministic fixture program and report.' }] });
      await waitFor(() => ['review', 'interrupted', 'paused'].includes(controller.record('worker').task.status));
      result.taskStatus = controller.record('worker').task.status; result.controllerError = controller.record('worker').error || null;
      if (['background', 'implicit-background'].includes(scenario)) {
        const lateFile = path.join(cwd, 'late.txt'); result.lateFileAtReview = await fileText(lateFile);
        if (result.taskStatus === 'review') {
          const task = controller.record('worker').task; await controller.inspect('worker');
          try { result.approval = await controller.decide({ workerId: 'worker', taskId: task.id, reportId: task.report.reportId, action: 'approve', feedback: 'Deterministic native regression', checkpointHash: task.report.checkpoint.checkpointHash }); }
          catch (error) { result.approvalError = cleanText(error instanceof Error ? error.message : error); }
        }
        await delay(6000); result.lateFileAfterWait = await fileText(lateFile);
        result.passed = result.taskStatus === 'review' ? result.lateFileAtReview !== null : result.lateFileAfterWait === null;
      }
    }
  } catch (error) { result.error = cleanText(error instanceof Error ? error.message : error); }
  finally { await controller?.close().catch(() => {}); }
  const hooks = await readLog(logFile);
  result.hookTools = hooks.filter(event => event.type === 'tool_call').map(event => event.toolName);
  result.providerResults = hooks.filter(event => event.type === 'tool_result' && event.toolName === 'state.transition').map(event => ({ isError: !!event.isError, toolCallId: event.toolCallId }));
  if (scenario === 'provider') result.passed = /^UNSUPPORTED_PROFILE:/.test(result.error || '') && result.providerResults.length === 0;
  if (scenario === 'implicit-background') result.passed = /UNSUPPORTED_PROFILE:.*shellHangMs/.test(result.error || '') && result.providerResults.length === 0 && result.lateFileAfterWait == null;
  if (scenario === 'post-report-provider') result.passed = !result.error && result.taskStatus === 'review' && result.providerResults.filter(event => !event.isError).length === 1;
  result.observations = observations;
  if (!keep) await fs.rm(root, { recursive: true, force: true });
  return result;
}

const results = [];
for (const scenario of requested) results.push(await runScenario(scenario));
const report = { passed: results.every(result => result.passed), checkedAt: new Date().toISOString(), projectRoot, sourceAgentDir, results };
if (outputFile) await atomicJSON(outputFile, report);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;

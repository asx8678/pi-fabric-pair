// Per-step controls: scope (the repository-relative globs a step may change), effort (the thinking level a step runs
// at, where its backend supports one), and acceptance (the step's criteria with the worker's verdict on each).
//
// The scope matcher, the schema rules and the low mapping are pure, so they are tested directly. The gate, the
// per-step effort and the checkpoint notice are tested through the same fixtures the controller uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { scopeMatches, outOfScope, scopeEscapes } from '../src/scope.js';
import { validateDispatch, validate } from '../src/schema.js';
import { validateReportPayload } from '../src/contracts.js';
import { DEFAULTS, validateConfig } from '../src/config.js';
import { pairMessageLines } from '../src/ui.js';
import { registerWorker } from '../src/worker.js';
import { lowReportPayload } from '../src/low-runtime.js';
import { PairController } from '../src/controller.js';
import { PiRuntime } from '../src/actor-runtime.js';
import { digest } from '../src/util.js';

const step = (extra = {}) => ({ id: 'one', title: 'One', instructions: 'Do it', ...extra });

test('a scope matches repository-relative globs, and refuses entries that leave the repository', () => {
  const scope = ['src/util.js', 'docs/**', 'test/*.test.js', 'src/low/'];
  assert.equal(scopeMatches(scope, 'src/util.js'), true);
  assert.equal(scopeMatches(scope, 'src/util.ts'), false, 'a plain name is not a prefix of a longer name');
  assert.equal(scopeMatches(scope, 'docs/a/b.md'), true, '** spans segments');
  assert.equal(scopeMatches(scope, 'test/x.test.js'), true);
  assert.equal(scopeMatches(scope, 'test/nested/x.test.js'), false, '* stays in one segment');
  assert.equal(scopeMatches(scope, 'src/low/a.js'), true, 'a trailing / is the directory tree');
  assert.equal(scopeMatches(scope, 'other.js'), false);
  assert.equal(scopeMatches([], 'anything/at/all'), true, 'no scope means no restriction');
  assert.equal(scopeMatches(undefined, 'anything/at/all'), true, 'an absent scope too');
  // A scope cannot name something outside the repository it is relative to.
  for (const bad of ['/etc/passwd', '../outside', 'a/../../b', 'C:/windows']) assert.equal(scopeEscapes(bad), true, bad);
  assert.equal(scopeEscapes('src/a.js'), false);
  assert.deepEqual(outOfScope(['src/**'], ['src/a.js', 'docs/b.md'], '/repo'), ['docs/b.md']);
  assert.deepEqual(outOfScope(['src/**'], ['/repo/src/a.js', '/repo/docs/b.md'], '/repo'), ['/repo/docs/b.md'], 'absolute paths are compared repository-relative');
});

test('each wildcard means exactly one thing: ? one character, * one segment, ** any number of directories', () => {
  // "?" is exactly one character. It is not an optional character and not a prefix: "src/util?" covers "src/util2"
  // and "src/utils", and never the file literally named "src/util".
  assert.equal(scopeMatches(['src/util?'], 'src/util'), false, '? needs its one character');
  assert.equal(scopeMatches(['src/util?'], 'src/util2'), true);
  assert.equal(scopeMatches(['src/util?'], 'src/utils'), true);
  assert.equal(scopeMatches(['src/util?'], 'src/utilzz'), false, '? is one character, not two');
  // "*" stays inside one segment.
  assert.equal(scopeMatches(['src/*.js'], 'src/a.js'), true);
  assert.equal(scopeMatches(['src/*.js'], 'src/d/a.js'), false);
  assert.equal(scopeMatches(['src/*.js'], 'src/a.ts'), false, 'the extension is part of the pattern');
  // "**" spans directories, and covers zero of them when more segments follow.
  assert.equal(scopeMatches(['src/**'], 'src/a.js'), true);
  assert.equal(scopeMatches(['src/**'], 'src/d/e/a.js'), true);
  assert.equal(scopeMatches(['src/**'], 'src'), false, '** needs something under it');
  assert.equal(scopeMatches(['**/*.js'], 'a.js'), true, 'a leading ** also covers no directory at all');
  assert.equal(scopeMatches(['**/*.js'], 'src/d/a.js'), true);
  assert.equal(scopeMatches(['src/**/test.js'], 'src/test.js'), true, '** may stand for no directory');
  assert.equal(scopeMatches(['src/**/test.js'], 'src/d/test.js'), true);
  assert.equal(scopeMatches(['src/**/test.js'], 'src/d/e/test.js'), true);
  // A wildcard-free name with no extension is a directory: it covers the tree under it, not a file of that name.
  assert.equal(scopeMatches(['src/util'], 'src/util/a.js'), true);
  assert.equal(scopeMatches(['src/util'], 'src/util.js'), false, 'a glob is not a prefix of a longer file name');
  // An extensioned name matches only itself.
  assert.equal(scopeMatches(['src/a.js'], 'src/a.js'), true);
  assert.equal(scopeMatches(['src/a.js'], 'src/a.jsx'), false);
  assert.equal(scopeMatches(['src/a.js'], 'src/a.js/b'), false);
});

test('a step may declare scope and effort, and the schema refuses a scope that escapes the repository', () => {
  const base = { workerId: 'worker', requestId: 'req-1', objective: 'Goal', steps: [step({ scope: ['src/**'], effort: 'max' })] };
  const valid = validateDispatch(structuredClone(base));
  assert.deepEqual(valid.steps[0].scope, ['src/**']);
  assert.equal(valid.steps[0].effort, 'max');
  for (const bad of ['/etc/**', '../**', 'src/../../x/**', 'C:/x/**']) {
    assert.throws(() => validateDispatch({ ...structuredClone(base), steps: [step({ scope: [bad] })] }), /repository-relative glob/, bad);
  }
  assert.throws(() => validateDispatch({ ...structuredClone(base), steps: [step({ effort: 'turbo' })] }), /input\.steps\[0\]\.effort/, 'an unknown effort is refused');
  // The same rules hold for a plan Main revises, because revise carries the same step schema.
  assert.throws(() => validateDispatch({ ...structuredClone(base), steps: [step({ scope: 'src/**' })] }), /scope must be an array/);
});

test('reports may carry acceptance claims, bounded and with a verdict per criterion', () => {
  const payload = { taskId: 'task-1', stepId: 'one', kind: 'checkpoint', summary: 'Done', acceptance: [{ criterion: 'npm test passes', met: true, evidence: 'npm test: 570 passed' }] };
  assert.deepEqual(validateReportPayload(structuredClone(payload)).acceptance, payload.acceptance);
  // A claim without a verdict is not a claim.
  assert.throws(() => validateReportPayload({ ...payload, acceptance: [{ criterion: 'x' }] }), /acceptance\[0\]\.met/);
  assert.throws(() => validateReportPayload({ ...payload, acceptance: [{ criterion: 'x'.repeat(201), met: true }] }), /criterion/);
  assert.throws(() => validateReportPayload({ ...payload, acceptance: [{ criterion: 'x', met: true, evidence: 'e'.repeat(501) }] }), /evidence/);
  assert.throws(() => validateReportPayload({ ...payload, acceptance: Array.from({ length: 33 }, (_, i) => ({ criterion: `c${i}`, met: true })) }), /too large/);
  // An empty criterion says nothing, so it is refused rather than shown as a blank row.
  assert.throws(() => validateReportPayload({ ...payload, acceptance: [{ criterion: '   ', met: true }] }), /must not be empty/);
});

test('the report card shows how many criteria were met, and each verdict when expanded', () => {
  const report = { kind: 'checkpoint', stepId: 'one', summary: 'Did it', acceptance: [{ criterion: 'tests pass', met: true, evidence: '38 passed' }, { criterion: 'docs updated', met: false, evidence: 'README still says the old thing' }] };
  const collapsed = pairMessageLines(`FABRIC PAIR REPORT\n${JSON.stringify(report)}`, false) ?? [];
  assert.ok(collapsed.some(line => /Acceptance\s+1\/2 met/.test(line.text)), collapsed.map(line => line.text).join('\n'));
  const expanded = pairMessageLines(`FABRIC PAIR REPORT\n${JSON.stringify(report)}`, true) ?? [];
  const text = expanded.map(line => line.text).join('\n');
  assert.match(text, /✔ tests pass — 38 passed/);
  assert.match(text, /✖ docs updated — README still says the old thing/);
});

test('enforceStepScope is a supervision setting, defaults off, and stays out of configHash()', () => {
  assert.equal(DEFAULTS.supervision.enforceStepScope, false, 'off by default: a scope is advisory until asked to enforce');
  assert.equal(validateConfig({ version: 2, supervision: { enforceStepScope: true } }).supervision.enforceStepScope, true);
  assert.throws(() => validateConfig({ version: 2, supervision: { enforceStepScope: 'yes' } }), /enforceStepScope must be boolean/);
  // Like every policy field it is not worker identity: changing it never interrupts a running worker by itself.
  const controller = c => new PairController({ config: validateConfig(c), cwd: '/tmp', ownerSession: 'owner', sourcePaths: [] });
  assert.equal(controller({ version: 2 }).configHash(), controller({ version: 2, supervision: { enforceStepScope: true } }).configHash(),
    'the scope enforcement flag is not part of the config hash');
});

/** A worker extension over a fixture authority, the way handoff-safety does it, so the gate can be asked directly. */
async function workerFixture(run, { steps = [step()], enforceStepScope } = {}) {
  // realpath: the temp root is a symlink on macOS, and the gate compares the write target against the real root.
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pair-step-scope-')));
  const dir = path.join(base, 'worker'), cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await Promise.all([dir, cwd, home].map(p => fs.mkdir(p)));
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  const authority = { version: 1, ownerSession: 'scope-owner', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1,
    phase: 'running', leaseId: 'scope-lease-1', attemptId: 'scope-attempt-1', readOnly: false, model: { provider: 'fake', id: 'model' }, repoRoot: cwd,
    ...(enforceStepScope === undefined ? {} : { enforceStepScope }),
    task: { id: 'scope-task', objective: 'Scope fixture', planRevision: 1, attemptId: 'scope-attempt-1', attemptNumber: 1, constraints: [], steps, stepIndex: 0,
      policy: { ...structuredClone(DEFAULTS.supervision) }, limits: structuredClone(DEFAULTS.limits), lastDecision: null }, updatedAt: Date.now() };
  await fs.writeFile(path.join(dir, 'authority.json'), JSON.stringify(authority));
  const events = new Map(), tools = new Map(), commands = new Map(), messages = [];
  const pi = { on: (name, fn) => events.set(name, fn), registerTool: tool => tools.set(tool.name, tool),
    registerCommand: (name, command) => commands.set(name, command), registerShortcut: () => {}, getAllTools: () => [...tools.values()],
    getCommands: () => [...commands.keys()].map(name => ({ name })), getThinkingLevel: () => 'high',
    sendMessage: (...args) => messages.push(args), sendUserMessage: () => assert.fail('No prompts allowed') };
  const ctx = { cwd, model: { provider: 'fake', id: 'model', contextWindow: 200000 },
    sessionManager: { getSessionId: () => 'scope-session', getSessionFile: () => path.join(base, 'scope-session.jsonl') },
    getContextUsage: () => undefined, isProjectTrusted: () => false,
    abort: () => {}, shutdown: () => {}, ui: { setStatus: () => {}, setWidget: () => {}, notify: () => {} } };
  const env = { PI_FABRIC_PAIR_WORKER_ID: 'worker', PI_FABRIC_PAIR_OWNER: 'scope-owner', PI_FABRIC_PAIR_OWNER_EPOCH: '1',
    PI_FABRIC_PAIR_WORKER_GENERATION: '1', PI_FABRIC_PAIR_NONCE: 'scope-nonce', PI_FABRIC_PAIR_WORKER_DIR: dir };
  registerWorker(pi, env);
  try {
    await events.get('session_start')({}, ctx);
    await run({ ctx, events, dir, cwd, packet: async () => JSON.parse((await events.get('before_agent_start')({ systemPrompt: 'x' }, ctx)).message.content) });
  } finally {
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

test('an enforced scope refuses a write outside it inside the Pi worker, and names the scope', () => workerFixture(async f => {
  const call = input => f.events.get('tool_call')({ toolName: 'write', input, toolCallId: 'call-1' }, f.ctx);
  assert.equal(await call({ path: 'src/inside.js', content: 'x' }), undefined, 'a write inside the scope is allowed');
  const blocked = await call({ path: 'docs/outside.md', content: 'x' });
  assert.equal(blocked?.block, true, 'a write outside the scope is refused');
  assert.match(String(blocked?.reason), /SCOPE_REFUSED: docs\/outside\.md is outside this step's scope is src\/\*\*/);
  // edit and apply_patch take the same path.
  assert.equal((await f.events.get('tool_call')({ toolName: 'edit', input: { path: 'README.md' }, toolCallId: 'call-2' }, f.ctx))?.block, true);
  // The scope is relative to the repository, so an absolute path inside it is still inside it.
  assert.equal(await call({ path: path.join(f.cwd, 'src', 'deep', 'a.js'), content: 'x' }), undefined);
}, { steps: [step({ scope: ['src/**'] })], enforceStepScope: true }));

test('without enforcement the same write is allowed: a scope is advisory until it is enforced', () => workerFixture(async f => {
  assert.equal(await f.events.get('tool_call')({ toolName: 'write', input: { path: 'docs/outside.md', content: 'x' }, toolCallId: 'call-1' }, f.ctx), undefined);
}, { steps: [step({ scope: ['src/**'] })], enforceStepScope: false }));

test('a write outside the repository is still refused first, scope or no scope', () => workerFixture(async f => {
  const blocked = await f.events.get('tool_call')({ toolName: 'write', input: { path: '../escape.js', content: 'x' }, toolCallId: 'call-1' }, f.ctx);
  assert.match(String(blocked?.reason), /outside this Pair workspace/);
}, { steps: [step({ scope: ['src/**'] })], enforceStepScope: true }));

test('the work order says the step\'s scope, effort and acceptance criteria in words', () => workerFixture(async f => {
  const packet = await f.packet();
  assert.deepEqual(packet.authorizedStep.scope, ['src/**']);
  assert.equal(packet.authorizedStep.effort, 'max');
}, { steps: [step({ scope: ['src/**'], effort: 'max', acceptance: ['tests pass', 'docs updated'] })] }));

/** A PiRuntime over an in-process host that records commands and can offer a chosen set of thinking levels. */
async function piRuntime({ levels = ['low', 'medium', 'high', 'xhigh', 'max'], workerEffort = 'high' } = {}) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pair-step-effort-')));
  const cwd = base, dir = path.join(cwd, 'worker');
  await fs.mkdir(dir, { recursive: true });
  const entryPath = path.join(cwd, 'entry.js'); await fs.writeFile(entryPath, '');
  const sessionFile = path.join(dir, 'session.jsonl');
  const header = { type: 'session', version: 3, id: 'effort-session', cwd, timestamp: new Date().toISOString() };
  await fs.writeFile(sessionFile, JSON.stringify(header) + '\n');
  const calls = [];
  class FakeRpc extends EventEmitter {
    pid = 6161; closed = false; model = { provider: 'fixture', id: 'model' }; thinkingLevel = workerEffort;
    start() {}
    async send(command, fields = {}) {
      calls.push({ command, fields: structuredClone(fields) });
      switch (command) {
        case 'get_state': return { model: { ...this.model }, thinkingLevel: this.thinkingLevel, sessionId: header.id, sessionFile, isStreaming: false, isCompacting: false, pendingMessageCount: 0, autoCompactionEnabled: true };
        case 'get_entries': return { entries: [], leafId: null };
        case 'get_available_thinking_levels': return { levels };
        case 'set_thinking_level': { const level = String(fields.level); if (!levels.includes(level)) throw new Error('unsupported'); this.thinkingLevel = level; return {}; }
        case 'get_commands': return { commands: [{ name: 'pair-bridge', source: 'extension', sourceInfo: { path: entryPath } }] };
        case 'prompt': {
          await fs.writeFile(path.join(dir, 'probe.json'), JSON.stringify({ protocol: 1, pairVersion: '0.1.0', pid: this.pid, cwd, trusted: true, sessionId: header.id, sessionFile,
            nonce: 'nonce-effort', workerId: 'worker', ownerSession: 'main', ownerEpoch: 1, workerGeneration: 1, scope: 'offline effort fixture', model: { ...this.model, contextWindow: 1000000 }, thinkingLevel: this.thinkingLevel,
            capabilities: { fabric: false, fovea: false, pairReport: true }, meshRoot: path.join(dir, 'fabric', 'mesh'), versions: {}, sourcePaths: [entryPath], context: null,
            native: { agentDir: path.join(cwd, 'agent'), note: 'fixture', piCompaction: {}, cacheWarming: 'off', fabricCompaction: {}, fabricShellHangMs: 0, fabricAgentMaxDepth: 0, prewalkDisabled: true, prewalkConfigured: true }, checkedAt: Date.now() }));
          return { disposition: /^\/pair-bridge /.test(fields.message) ? 'handled' : 'started' };
        }
        default: return {};
      }
    }
    async abortAndStop() { this.closed = true; this.emit('exit', { code: 0, signal: null, expected: true, error: null }); }
  }
  const rpc = new FakeRpc();
  const runtime = new PiRuntime({
    rpcOptions: { command: 'fixture-no-process', args: [], cwd, env: {}, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 },
    rpcFactory: () => rpc, ownerSession: 'main', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1,
    nonce: 'nonce-effort', dir, cwd, sessionFile, sessionId: header.id, freshSession: false,
    config: { runtime: { startupTimeoutMs: 3000, requestTimeoutMs: 1000, shutdownTimeoutMs: 1000 }, requirements: { fabric: false, fovea: false, prewalkDisabled: true, autoCompaction: true }, control: { compactionMaxMs: 5000 } },
    spec: { id: 'worker', provider: 'fixture', model: 'model', effort: workerEffort, cwd: null, readOnly: false }, entryPath, onWake() {}, isCurrent: () => true,
  });
  await runtime.ensureStarted();
  return { runtime, rpc, calls, sessionFile, base, cleanup: async () => { await runtime.abortAndStop('cleanup').catch(() => {}); await fs.rm(base, { recursive: true, force: true }).catch(() => {}); } };
}

test('a step effort is set before the work and accepted by the drift checks, then restored', async () => {
  const f = await piRuntime({ workerEffort: 'high' });
  try {
    const sets = () => f.calls.filter(call => call.command === 'set_thinking_level').map(call => call.fields.level);
    assert.deepEqual(sets(), ['high'], 'startup set the worker\'s own level once');
    await f.runtime.setStepEffort('max');
    assert.deepEqual(sets(), ['high', 'max'], 'the step\'s level was applied through the RPC');
    assert.equal(f.rpc.thinkingLevel, 'max');
    // The exact-state and bridge checks accept the controller-set level: a full readiness round trip passes.
    const activation = f.runtime.reserveActivation({ workerGeneration: 1, taskId: 'task-1', attemptId: 'attempt-1', leaseId: 'lease-1' });
    await f.runtime.prepareActivation(activation);
    // A prepared activation is consumed by revoking it, as the controller does when a start is superseded.
    f.runtime.revoke('step effort test finished with this activation');
    // A level the controller did not set is still a drift, even while a step effort applies.
    const drifted = f.runtime.reserveActivation({ workerGeneration: 1, taskId: 'task-2', attemptId: 'attempt-2', leaseId: 'lease-2' });
    f.rpc.thinkingLevel = 'low';
    await assert.rejects(f.runtime.prepareActivation(drifted), /drifted/);
    f.rpc.thinkingLevel = 'max';
  } finally { await f.cleanup(); }
});

test('restoring the step effort puts the worker\'s own level back', async () => {
  const f = await piRuntime({ workerEffort: 'medium' });
  try {
    await f.runtime.setStepEffort('xhigh');
    assert.equal(f.rpc.thinkingLevel, 'xhigh');
    await f.runtime.clearStepEffort();
    assert.equal(f.rpc.thinkingLevel, 'medium', 'the worker runs at its own level again');
    // And a second restore is a no-op: nothing is remembered, so nothing is sent.
    const before = f.calls.filter(call => call.command === 'set_thinking_level').length;
    await f.runtime.clearStepEffort();
    assert.equal(f.calls.filter(call => call.command === 'set_thinking_level').length, before);
  } finally { await f.cleanup(); }
});

test('a level the model does not offer is refused rather than silently not applied', async () => {
  const f = await piRuntime({ levels: ['low', 'medium', 'high'], workerEffort: 'high' });
  try {
    await assert.rejects(f.runtime.setStepEffort('max'), /does not offer effort max \(it offers low, medium, high\)/);
    assert.equal(f.rpc.thinkingLevel, 'high', 'the worker stayed at its own level');
  } finally { await f.cleanup(); }
});

test('a low worker refuses a step effort it cannot honour, with the reason, instead of running at another level', async () => {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pair-step-low-')));
  const repo = path.join(base, 'repo'); await fs.mkdir(path.join(repo, '.pi'), { recursive: true });
  const config = validateConfig({ version: 2, enabled: true, autoStart: false, runtime: { backend: 'low', lowCommand: 'low' },
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'opendesign', model: 'deepseek-v4.1-flash', effort: 'high', cwd: null, readOnly: false }] });
  const controller = new PairController({ config, cwd: repo, ownerSession: 'step-effort-owner', sourcePaths: [], storageDir: path.join(base, 'state'),
    callbacks: { notifyUser: () => {}, promptUser: async () => ({ cancelled: true }) } });
  await controller.init();
  try {
    const dispatch = extra => ({ workerId: 'worker', requestId: 'req-effort', objective: 'Effort', steps: [step(extra)] });
    // The same level the worker serves is fine: nothing would change.
    assert.equal(controller.stepEffort('worker', step({ effort: 'high' })), null, 'the worker\'s own effort needs no change');
    assert.equal(controller.stepEffort('worker', step()), null, 'no step effort needs no change');
    assert.throws(() => controller.stepEffort('worker', step({ effort: 'max' })), /UNSUPPORTED_PROFILE: a low worker cannot change effort per step \(this step asks for max, the worker serves high\)/);
    // And the refusal happens at dispatch, before a task exists.
    await assert.rejects(controller.dispatch(dispatch({ effort: 'max' })), /UNSUPPORTED_PROFILE/);
    assert.equal(controller.state.workers.worker?.task ?? null, null, 'no task was created for a step this worker cannot run');
  } finally { await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }).catch(() => {}); }
});

test('the controller applies a step effort to a Pi worker and restores it for the next step', async () => {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pair-step-effort-ctl-')));
  const repo = path.join(base, 'repo'); await fs.mkdir(path.join(repo, '.pi'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const config = validateConfig({ version: 2, enabled: true, autoStart: false,
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'opencode', model: 'model', effort: 'high', cwd: null, readOnly: false }] });
  const controller = new PairController({ config, cwd: repo, ownerSession: 'step-effort-owner', sourcePaths: [], storageDir: path.join(base, 'state'),
    callbacks: { notifyUser: () => {}, promptUser: async () => ({ cancelled: true }) } });
  await controller.init();
  const applied = [], cleared = [];
  try {
    // A stand-in for a live Pi runtime's per-step effort surface.
    controller.handles.set('worker', /** @type {any} */ ({ setStepEffort: async level => { applied.push(level); }, clearStepEffort: async () => { cleared.push(1); } }));
    await controller.applyStepEffort('worker', step({ effort: 'max' }));
    assert.deepEqual(cleared, [1], 'the previous step\'s effort is cleared first');
    assert.deepEqual(applied, ['max']);
    // A step with no effort of its own still clears: the worker returns to its own level.
    await controller.applyStepEffort('worker', step());
    assert.deepEqual(applied, ['max'], 'nothing is set when the step asks for nothing');
    assert.equal(cleared.length, 2);
    assert.equal(controller.stepEffort('worker', step({ effort: 'high' })), null, 'the worker\'s own level is not a change');
    assert.equal(controller.stepEffort('worker', step({ effort: 'xhigh' })), 'xhigh');
  } finally { controller.handles.clear(); await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }).catch(() => {}); }
});

/** A controller with one worker record and a report, enough to read reportMessage and the approval path. */
async function reportFixture({ supervision = {}, steps = [step()], changed = ['src/a.js'], enforce } = {}) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pair-step-report-')));
  const repo = path.join(base, 'repo'); await fs.mkdir(path.join(repo, '.pi'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'README.md'), 'fixture\n');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo });
  const config = validateConfig({ version: 2, enabled: true, autoStart: false, supervision: { enforceStepScope: enforce === true },
    requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
    workers: [{ id: 'worker', provider: 'opencode', model: 'model', effort: 'high', cwd: null, readOnly: false }] });
  const controller = new PairController({ config, cwd: repo, ownerSession: 'step-report-owner', sourcePaths: [], storageDir: path.join(base, 'state'),
    callbacks: { notifyUser: () => {}, promptUser: async () => ({ cancelled: true }) } });
  await controller.init();
  /** @type {any} */ const r = { id: 'worker', cwd: repo, repoRoot: repo, status: 'review', sessionId: null, sessionFile: null,
    bound: controller.config.workers[0], history: [], usage: null, error: null, lastObservation: null, lastExchange: null, staleReports: [], probe: null, workerGeneration: 1, task: null };
  controller.state.workers.worker = r;
  r.task = { id: 'task-scope', workerId: 'worker', requestId: 'req-scope', objective: 'Scope', context: '', constraints: [], steps, stepIndex: 0, planRevision: 1,
    attemptId: 'attempt-scope', attemptNumber: 1, status: 'review', leaseId: 'lease-scope', policy: { ...structuredClone(DEFAULTS.supervision), ...supervision }, limits: structuredClone(DEFAULTS.limits),
    verification: { commands: [], requirePassing: true, timeoutMs: 1000 }, startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, stepRevisions: 0, turns: 1, usage: null,
    baseSnapshotRef: path.join(base, 'base.json'), pendingReport: null, report: null, decisions: {}, lastDecision: null };
  const payload = { taskId: 'task-scope', stepId: steps[0].id, kind: /** @type {const} */ ('checkpoint'), summary: 'Did it', stepComplete: true,
    acceptance: [{ criterion: 'tests pass', met: true, evidence: 'npm test' }] };
  // A checkpoint Pair captured itself, from the real workspace, so approval's own staleness check passes.
  const captured = await controller.evidence.capture(repo);
  const checkpoint = await controller.evidence.checkpoint('task-scope', 'report-scope', captured, captured, []);
  checkpoint.changed = changed;
  r.task.report = { version: 1, reportId: 'report-scope', workerId: 'worker', ownerSession: 'step-report-owner', ownerEpoch: 1, workerGeneration: 1, nonce: 'n', sessionId: 's',
    leaseId: 'lease-scope', attemptId: 'attempt-scope', attemptNumber: 1, planRevision: 1, payload, payloadHash: digest(payload), createdAt: Date.now(),
    checkpoint, snapshotRef: path.join(base, 'snap.json'), inspectedAt: Date.now() };
  return { controller, repo, base, cleanup: async () => { await controller.close().catch(() => {}); await fs.rm(base, { recursive: true, force: true }).catch(() => {}); } };
}

test('a checkpoint that changed files outside the step scope says so, for either backend', async () => {
  const f = await reportFixture({ steps: [step({ scope: ['src/**'] })], changed: ['src/a.js', 'docs/guide.md', 'README.md'] });
  try {
    const message = f.controller.reportMessage(f.controller.record('worker'));
    assert.match(message, /STEP_SCOPE: this step's scope is src\/\*\*, but 2 files are outside it: docs\/guide\.md, README\.md/);
    // The card carries the same sentence as a warning row.
    const card = pairMessageLines(message, false) ?? [];
    assert.ok(card.some(line => line.color === 'warning' && /STEP_SCOPE/.test(line.text)), card.map(line => `${line.color}:${line.text}`).join('\n'));
  } finally { await f.cleanup(); }
});

test('a checkpoint inside the step scope carries no notice, and a step without a scope never has one', async () => {
  const inside = await reportFixture({ steps: [step({ scope: ['src/**'] })], changed: ['src/a.js', 'src/deep/b.js'] });
  try { assert.doesNotMatch(inside.controller.reportMessage(inside.controller.record('worker')), /STEP_SCOPE/); } finally { await inside.cleanup(); }
  const none = await reportFixture({ steps: [step()], changed: ['anything/at/all.js'] });
  try { assert.doesNotMatch(none.controller.reportMessage(none.controller.record('worker')), /STEP_SCOPE/); } finally { await none.cleanup(); }
});

test('approval refuses an out-of-scope checkpoint only when the scope is enforced', async () => {
  // Advisory (the default): the report names the files and Main decides.
  const advisory = await reportFixture({ steps: [step({ scope: ['src/**'] })], changed: ['src/a.js', 'docs/guide.md'] });
  try {
    const decided = await advisory.controller.decide({ workerId: 'worker', taskId: 'task-scope', reportId: 'report-scope', action: 'approve',
      checkpointHash: advisory.controller.record('worker').task.report.checkpoint.checkpointHash, feedback: 'Approved with a doc touch' });
    assert.equal(decided.status, 'completed', 'an advisory scope does not block approval');
  } finally { await advisory.cleanup(); }
  // Enforced: the same checkpoint is refused, with the files named.
  const enforced = await reportFixture({ steps: [step({ scope: ['src/**'] })], changed: ['src/a.js', 'docs/guide.md'], enforce: true });
  try {
    await assert.rejects(enforced.controller.decide({ workerId: 'worker', taskId: 'task-scope', reportId: 'report-scope', action: 'approve',
      checkpointHash: enforced.controller.record('worker').task.report.checkpoint.checkpointHash, feedback: 'Approved' }), /STEP_SCOPE: this checkpoint changed a file outside the step's scope \(docs\/guide\.md\)/);
    assert.equal(enforced.controller.record('worker').task.status, 'review', 'the review obligation is preserved');
  } finally { await enforced.cleanup(); }
});

test('low states its criteria and its second look as acceptance claims', () => {
  const task = { id: 'task-low', stepIndex: 0, steps: [{ id: 'one' }], policy: { mode: 'milestones' }, limits: {} };
  const payload = lowReportPayload({ status: 'done', exit: 0, verdict: 'VERIFIED', good: true, answer: 'Fixed it.', criteria: 'add(2, 3) == 5', check: 'passed on the final tree',
    claims: { held: ['the test now passes'], contradicted: ['nothing else changed'], uncertain: [] } }, /** @type {any} */ (task));
  assert.deepEqual(payload.acceptance, [
    { criterion: 'add(2, 3) == 5', met: true, evidence: "low's check: passed on the final tree" },
    { criterion: 'the test now passes', met: true, evidence: 'low second look: held' },
    { criterion: 'nothing else changed', met: false, evidence: 'low second look: contradicted' }
  ]);
  // A low run that only states its criteria still gets a claim, and an unverified verdict marks it unmet.
  const bare = lowReportPayload({ status: 'done', exit: 1, verdict: 'UNVERIFIED', good: false, answer: 'Tried.', criteria: 'the bug is gone' }, /** @type {any} */ (task));
  assert.equal(bare.acceptance[0].met, false, 'an unverified run does not claim its criterion met');
  // Nothing to claim, nothing added: the payload keeps its exact old shape.
  assert.equal(Object.hasOwn(lowReportPayload({ status: 'done', exit: 0, verdict: 'NO CHECK', answer: 'Nothing to do.' }, /** @type {any} */ (task)), 'acceptance'), false);
});

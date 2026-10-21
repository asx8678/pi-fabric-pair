// Blocked commands and a shell timeout limit for Pi workers.
//
// The guard has two halves. In a Pi worker it runs inside the process, in the tool_call handler: a bash/powershell call
// whose command matches control.blockedCommands is refused before it runs, one without a timeout or with a longer one
// is given control.defaultShellTimeoutS, and a fabric_exec program is scanned because its nested pi.bash calls never
// come back through that handler (one asking for more than the limit is refused). A call that ran into its timeout
// gets a note in its result so the worker does not rerun the hung command. On the low backend there is no such place to stand, so the truth is documented and doctor says
// it: low's sandbox is the only guard for shell work.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULTS, loadConfig, validateConfig } from '../src/config.js';
import { PairController } from '../src/controller.js';
import { blockedCommandPattern, guardProgramShell, guardShellCall, shellProgramCalls, shellProgramTimeouts, shellTimeoutNote } from '../src/native.js';
import { registerWorker } from '../src/worker.js';
import { lowBackendGuardNote } from '../src/worker-config.js';

const step = (extra = {}) => ({ id: 'one', title: 'One', instructions: 'Do it', ...extra });
const CONTROL = { blockedCommands: DEFAULTS.control.blockedCommands, defaultShellTimeoutS: DEFAULTS.control.defaultShellTimeoutS };

test('the default list names exactly the commands a worker may not run, and matches them', () => {
  const blocked = ['git commit -m x', 'git push origin main', 'git reset --hard HEAD~1', 'git checkout -- src/a.js', 'git clean -fd', 'git clean -xfd',
    'git rebase main', 'git stash', 'git stash pop', 'git branch -D feature', 'npm publish', 'pnpm publish', 'yarn publish', 'bun publish', 'sudo rm x', 'sudo',
    // Every spelling of a recursive force-delete of the whole tree or the home directory.
    'rm -rf /', 'rm -rf ~', 'rm -fr /', 'rm -r -f /', 'rm -Rf /', 'rm -f -r /'];
  for (const command of blocked) assert.ok(blockedCommandPattern(command, CONTROL.blockedCommands), `should block: ${command}`);
  // Ordinary work is not touched, including commands that merely mention a blocked word.
  // A rule must match the command, not a longer word or a scoped path: these are all ordinary work.
  const allowed = ['npm test', 'npm run build', 'git status', 'git diff', 'git add -A', 'git commitx', 'git stashx', 'git pushx', 'git cleanx',
    'ls -la', 'rm -rf ./build', 'rm -rf build', 'rm -rf node_modules', 'git log --oneline', 'echo push', 'grep -r commit src',
    'npx tsc -p tsconfig.json', 'git branch --list', 'node --test', 'sudoers file'];
  for (const command of allowed) assert.equal(blockedCommandPattern(command, CONTROL.blockedCommands), null, `should allow: ${command}`);
  // A pattern that does not compile never blocks work, and an empty list blocks nothing.
  assert.equal(blockedCommandPattern('git push', ['(unclosed']), null);
  assert.equal(blockedCommandPattern('git push', []), null);
});

test('a destructive command is found behind a pipe, && or ;', () => {
  for (const command of ['echo hi && git push', 'cd x; npm publish', 'true | sudo tee /etc/x', 'make install\ngit commit -m x']) {
    assert.ok(blockedCommandPattern(command, CONTROL.blockedCommands), `should block: ${JSON.stringify(command)}`);
  }
});

test('the shell timeout is the default for a call without one and the limit for a call asking more', () => {
  const none = { command: 'npm test' }; guardShellCall('bash', none, CONTROL);
  assert.equal(none.timeout, 600, 'a call without a timeout gets the default');
  const own = { command: 'npm test', timeout: 30 }; guardShellCall('bash', own, CONTROL);
  assert.equal(own.timeout, 30, "a shorter timeout of the worker's own is kept");
  // In Pair's records every call that ran past ten minutes was hung: a worker asking 900 or 1200 gets the limit.
  const long = { command: 'npm test', timeout: 900 }; guardShellCall('bash', long, CONTROL);
  assert.equal(long.timeout, 600, 'a longer one is cut to the limit');
  const exact = { command: 'npm test', timeout: 600 }; guardShellCall('bash', exact, CONTROL);
  assert.equal(exact.timeout, 600);
  const off = { command: 'npm test' }; guardShellCall('bash', off, { blockedCommands: [], defaultShellTimeoutS: 0 });
  assert.equal(off.timeout, undefined, '0 disables the injection');
  // A non-shell tool is left alone, and so is a shell call with no command Pair can read.
  const write = { path: 'a.js', content: 'x' }; guardShellCall('write', write, CONTROL);
  assert.deepEqual(write, { path: 'a.js', content: 'x' });
  assert.equal(guardShellCall('bash', {}, CONTROL), undefined);
});

test('a blocked direct call is refused with the rule named, and allowed ones are not', () => {
  const blocked = guardShellCall('bash', { command: 'git push' }, CONTROL);
  assert.equal(blocked?.block, true);
  assert.match(String(blocked?.reason), /^BLOCKED_COMMAND: /);
  assert.match(String(blocked?.reason), /git\\s\+push/, 'the rule is named so the worker can report precisely');
  assert.equal(guardShellCall('bash', { command: 'npm test' }, CONTROL), undefined);
  assert.equal(guardShellCall('powershell', { command: 'git commit -m x' }, CONTROL)?.block, true, 'powershell is a shell too');
});

test('a fabric_exec program is scanned, because its nested shell calls bypass the direct gate', () => {
  // A literal command is read out of the source and judged like a direct call.
  const literal = [
    'await pi.bash({ command: "git push origin main" })',
    "await pi.bash({command: 'git commit -m x'})",
    'await pi.bash({ cmd: `npm publish` })',
    'tools.call({ ref: "bash", args: { command: "git clean -f" } })',
    'await pi.bash({ command: "rm -rf /" })'
  ];
  for (const code of literal) {
    const verdict = guardProgramShell('fabric_exec', { code }, CONTROL);
    assert.equal(verdict?.block, true, `should block: ${code}`);
    assert.match(String(verdict?.reason), /^BLOCKED_COMMAND: /);
  }
  // A command the program builds at run time cannot be checked before it runs, so it is refused rather than run blind.
  const computed = guardProgramShell('fabric_exec', { code: 'await pi.bash({ command: parts.join(" ") })' }, CONTROL);
  assert.equal(computed?.block, true);
  assert.match(String(computed?.reason), /builds at run time/);
  // Programs with no shell, and shell calls with an ordinary command, pass.
  for (const code of ['console.log(1)', 'await pi.bash({ command: "npm test" })', 'const a = 1', 'await pi.read("a.js")']) {
    assert.equal(guardProgramShell('fabric_exec', { code }, CONTROL), undefined, `should allow: ${code}`);
  }
  // A shell reference Pair cannot resolve to a literal at all is also refused.
  assert.deepEqual(shellProgramCalls('await pi.bash({command: someVar})'), [null]);
  // A non-fabric tool is not this guard's business.
  assert.equal(guardProgramShell('bash', { code: 'git push' }, CONTROL), undefined);
});

test("a fabric_exec shell call over the timeout limit is refused with the limit named; the shell's own timeout is not the option", () => {
  // The option is read from the call's own object: text inside the command, a nested object and a template
  // expression are not it.
  assert.deepEqual(shellProgramTimeouts('await pi.bash({cmd: `cd ${cwd} && timeout 900 cargo test {x}`, timeout: 300, env: {timeout: 5000}})'), [300]);
  assert.deepEqual(shellProgramTimeouts('await pi.bash({cmd: "ls"}); await pi.bash({ command: "x", timeout: 1200, settle: true })'), [null, 1200]);
  assert.deepEqual(shellProgramTimeouts('await pi.bash({cmd: `a ${f({timeout: 9000})}`, timeout: 30})'), [30]);
  assert.deepEqual(shellProgramTimeouts('console.log(1)'), []);
  // The shape a worker really writes: refused, nothing run, the limit and the reason named.
  const over = guardProgramShell('fabric_exec', { code: 'const t = await pi.bash({cmd: `cd ${cwd} && node --test test/a.test.js`, timeout: 900, settle: true});' }, CONTROL);
  assert.equal(over?.block, true);
  assert.match(String(over?.reason), /^SHELL_TIMEOUT_LIMIT: a shell call asks for timeout 900s; Pair's limit is 600s/);
  assert.match(String(over?.reason), /--test-timeout/, 'the refusal says how to bound a test run');
  // At or under the limit, with none, or with the guard's limit off, the program runs.
  for (const code of ['await pi.bash({cmd: "npm test", timeout: 600})', 'await pi.bash({cmd: "timeout 900 npm test", timeout: 120})', 'await pi.bash({cmd: "npm test"})']) {
    assert.equal(guardProgramShell('fabric_exec', { code }, CONTROL), undefined, `should allow: ${code}`);
  }
  assert.equal(guardProgramShell('fabric_exec', { code: 'await pi.bash({cmd: "npm test", timeout: 900})' }, { ...CONTROL, defaultShellTimeoutS: 0 }), undefined);
  // A blocked command is still reported as blocked, not as a timeout.
  assert.match(String(guardProgramShell('fabric_exec', { code: 'await pi.bash({cmd: "git push", timeout: 900})' }, CONTROL)?.reason), /^BLOCKED_COMMAND/);
});

test('a shell call that ran into its timeout gets a note: it hung, do not run it again unchanged', () => {
  // The exact result a worker got after its 900-second test run hung, through fabric_exec.
  const hung = [{ type: 'text', text: 'true\n\nRuntime error: {"message":"Command timed out after 900 seconds","name":"Error"}' }];
  const note = shellTimeoutNote('fabric_exec', hung);
  assert.match(String(note), /^PAIR: this command hung for 900s and was stopped\. Do not run it again unchanged or with a longer timeout/);
  assert.match(String(note), /report the step blocked/);
  assert.ok(shellTimeoutNote('bash', [{ type: 'text', text: 'partial output\n\nCommand timed out after 30 seconds' }]));
  // Anything else is left alone: another failure, another tool, no text.
  assert.equal(shellTimeoutNote('fabric_exec', [{ type: 'text', text: 'Runtime error: Execution cancelled' }]), null);
  assert.equal(shellTimeoutNote('read', hung), null);
  assert.equal(shellTimeoutNote('bash', undefined), null);
});

/** A real Pair worker (registerWorker) over a temporary authority file, so tool_call is the production handler. */
async function workerFixture(shellGuard, run) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pair-shell-guard-')));
  const dir = path.join(base, 'worker'), cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await Promise.all([dir, cwd, home].map(p => fs.mkdir(p)));
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  const authority = { version: 1, ownerSession: 'guard-owner', ownerEpoch: 1, workerId: 'worker', workerGeneration: 1,
    phase: 'running', leaseId: 'guard-lease-1', attemptId: 'guard-attempt-1', readOnly: false, model: { provider: 'fake', id: 'model' }, repoRoot: cwd,
    ...(shellGuard === undefined ? {} : { shellGuard }),
    task: { id: 'guard-task', objective: 'Guard fixture', planRevision: 1, attemptId: 'guard-attempt-1', attemptNumber: 1, constraints: [], steps: [step()], stepIndex: 0,
      policy: { ...structuredClone(DEFAULTS.supervision) }, limits: structuredClone(DEFAULTS.limits), lastDecision: null }, updatedAt: Date.now() };
  await fs.writeFile(path.join(dir, 'authority.json'), JSON.stringify(authority));
  const events = new Map(), tools = new Map(), commands = new Map();
  const pi = { on: (name, fn) => events.set(name, fn), registerTool: tool => tools.set(tool.name, tool),
    registerCommand: (name, command) => commands.set(name, command), registerShortcut: () => {}, getAllTools: () => [...tools.values()],
    getCommands: () => [...commands.keys()].map(name => ({ name })), getThinkingLevel: () => 'high',
    sendMessage: () => {}, sendUserMessage: () => assert.fail('No prompts allowed') };
  const ctx = { cwd, model: { provider: 'fake', id: 'model', contextWindow: 200000 },
    sessionManager: { getSessionId: () => 'guard-session', getSessionFile: () => path.join(base, 'guard-session.jsonl') },
    getContextUsage: () => undefined, isProjectTrusted: () => false,
    abort: () => {}, shutdown: () => {}, ui: { setStatus: () => {}, setWidget: () => {}, notify: () => {} } };
  const env = { PI_FABRIC_PAIR_WORKER_ID: 'worker', PI_FABRIC_PAIR_OWNER: 'guard-owner', PI_FABRIC_PAIR_OWNER_EPOCH: '1',
    PI_FABRIC_PAIR_WORKER_GENERATION: '1', PI_FABRIC_PAIR_NONCE: 'guard-nonce', PI_FABRIC_PAIR_WORKER_DIR: dir };
  registerWorker(pi, env);
  const call = input => events.get('tool_call')({ toolName: 'bash', input, toolCallId: 'call-1' }, ctx);
  try {
    await events.get('session_start')({}, ctx);
    await run({ events, ctx, dir, cwd, call, program: code => events.get('tool_call')({ toolName: 'fabric_exec', input: { code }, toolCallId: 'call-2' }, ctx) });
  } finally {
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

test('inside a real Pair worker, tool_call refuses a blocked command and bounds an unbounded one', () => workerFixture(CONTROL, async f => {
  const blocked = await f.call({ command: 'git push origin main' });
  assert.equal(blocked?.block, true, 'the worker is stopped before the command runs');
  assert.match(String(blocked?.reason), /BLOCKED_COMMAND/);
  // An allowed call passes through the guard and is given the default timeout.
  const input = { command: 'npm test' };
  assert.equal(await f.call(input), undefined);
  assert.equal(input.timeout, 600, 'the timeout is injected into the call itself');
  // A fabric_exec program that would push is refused for the same reason.
  const program = await f.program('await pi.bash({ command: "git push" })');
  assert.equal(program?.block, true);
}));

test('inside a real Pair worker, a timed-out result keeps its own text and gains the note; other results are untouched', () => workerFixture(CONTROL, async f => {
  const content = [{ type: 'text', text: 'Runtime error: {"message":"Command timed out after 600 seconds"}' }];
  const changed = await f.events.get('tool_result')({ toolName: 'fabric_exec', toolCallId: 'call-3', input: { code: 'x' }, content, isError: true, details: { kept: 1 }, structuredContent: { s: 1 } }, f.ctx);
  assert.equal(changed?.content?.[0], content[0], 'the original result is kept first');
  assert.match(String(changed?.content?.[1]?.text), /^PAIR: this command hung for 600s/);
  assert.deepEqual([changed?.details, changed?.structuredContent], [{ kept: 1 }, { s: 1 }], 'details and structured content survive the change');
  assert.equal(changed?.isError, undefined, 'it stays the error it was');
  assert.equal(await f.events.get('tool_result')({ toolName: 'fabric_exec', toolCallId: 'call-4', input: { code: 'x' }, content: [{ type: 'text', text: 'boom' }], isError: true }, f.ctx), undefined);
  // A program asking for more than the limit is refused before it runs.
  const program = await f.program('await pi.bash({ command: "npm test", timeout: 1800 })');
  assert.match(String(program?.reason), /^SHELL_TIMEOUT_LIMIT/);
}));

test('a worker whose authority carries no shell guard runs as before (older authority files still load)', () => workerFixture(undefined, async f => {
  const input = { command: 'git push origin main' };
  assert.equal(await f.call(input), undefined, 'without a guard nothing is refused');
  assert.equal(input.timeout, undefined, 'and nothing is injected');
}));

test('/pair doctor tells a human plainly that a low worker is unguarded, and says nothing for a Pi one', () => {
  const note = lowBackendGuardNote('cheap', 'low');
  assert.ok(note, 'a low worker gets a note');
  // The note must name the setting a human would otherwise trust, the reason it does not apply, and the way out.
  assert.match(note, /control\.blockedCommands does not apply/, 'it names the setting that does not apply');
  assert.match(note, /--protect names paths, not commands/, 'and why the low option is not a substitute');
  assert.match(note, /sandbox is the only guard/, 'the honest claim: the sandbox is all there is');
  assert.match(note, /Run the worker on "pi"/, 'and the actionable alternative');
  assert.ok(note.includes('cheap'), 'the worker is named');
  assert.equal(lowBackendGuardNote('worker', 'pi'), null, 'a Pi worker has the gate, so there is nothing to warn about');
});

test('the blocked list is config-only, validated, and outside configHash()', () => {
  // A pattern that will never compile is refused where a human edits it, not silently never matched in a worker.
  assert.throws(() => validateConfig({ version: 2, control: { blockedCommands: ['(unclosed'] } }), /control.blockedCommands has an invalid pattern/);
  assert.throws(() => validateConfig({ version: 2, control: { blockedCommands: 'git push' } }), /control.blockedCommands must be an array/);
  assert.throws(() => validateConfig({ version: 2, control: { defaultShellTimeoutS: -1 } }), /control.defaultShellTimeoutS must be 0–86400/);
  assert.equal(DEFAULTS.control.blockedCommands.length, 13, 'thirteen rules by default');
  assert.equal(DEFAULTS.control.defaultShellTimeoutS, 600, 'ten minutes by default');
});

test('every work order states the command rule; the timeout limit is only promised where Pair enforces it', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-command-rule-'));
  try {
    for (const [backend, promised] of [['pi', true], ['low', false]]) {
      const repo = path.join(base, backend);
      await fs.mkdir(path.join(repo, '.pi'), { recursive: true });
      await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({ version: 2, enabled: true, autoStart: false,
        requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true },
        workers: [{ id: 'worker', provider: 'p', model: 'm', effort: 'high', cwd: null, readOnly: false, backend }] }));
      const loaded = await loadConfig(repo, true, { PI_CODING_AGENT_DIR: path.join(base, 'agent') });
      const controller = new PairController({ config: loaded.config, cwd: repo, ownerSession: `rule-${backend}`, sourcePaths: [], storageDir: path.join(base, `state-${backend}`), scanIntervalMs: 600000,
        callbacks: { notifyUser: () => {}, superviseMain: () => {}, noticeMain: () => {}, promptUser: async () => ({ cancelled: true }) } });
      await controller.init();
      try {
        const rule = controller.commandRule('worker');
        assert.match(rule, /^\nCOMMANDS\nKeep every command bounded\./);
        assert.match(rule, /--test-timeout=60000/);
        assert.match(rule, /A command that timed out is hung: do not rerun it unchanged/);
        // Low has no shell guard (its sandbox is the guard), so its worker is not told of a cap Pair cannot apply.
        assert.equal(/caps shell timeouts at 600s/.test(rule), promised, `${backend} worker`);
      } finally { await controller.close().catch(() => {}); }
    }
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

// Focused offline regression coverage for the bounded non-interrupting handoff:
// durable inbox retention, explicit Main phase/yield with run-token fencing,
// one settlement-boundary delivery cycle, truthful offered/acknowledged
// receipts, queued-user-input priority, reload/shutdown recovery. No inference,
// no native runtime, temporary state fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerMain } from '../src/main.js';
import { indicatorWidget, statusText } from '../src/ui.js';
import { configPaths } from '../src/config.js';
import { validateStoredState } from '../src/contracts.js';
import { digest } from '../src/util.js';
import { PiRpc } from '../src/rpc.js';

const host = fileURLToPath(new URL('./helpers/restart-worker.mjs', import.meta.url));

async function fixture(run, { project, rpc = 'forbidden' } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-handoff-'));
  const cwd = path.join(base, 'repo'), home = path.join(base, 'agent');
  await fs.mkdir(path.join(cwd, '.pi'), { recursive: true }); await fs.mkdir(home);
  execFileSync('git', ['init', '-q'], { cwd });
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = home;
  const defaults = { version: 2, enabled: true, autoStart: false, requirements: { fabric: false, fovea: false, prewalkDisabled: false, autoCompaction: true }, workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'low', cwd: null, readOnly: false }] };
  await fs.writeFile(configPaths(cwd).project, JSON.stringify({ ...defaults, ...project, workers: project?.workers || defaults.workers, requirements: project?.requirements || defaults.requirements }));
  const events = new Map(), commands = new Map(), tools = new Map(), messages = [], notices = [];
  let pendingInput = false;
  const ctx = { cwd, mode: 'rpc', hasUI: true, isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => 'handoff-test-owner', getSessionFile: () => path.join(home, 'main-session.jsonl') }, getContextUsage: () => undefined,
    model: { provider: 'main', id: 'native' }, modelRegistry: { getAvailable: () => [] },
    hasPendingMessages: () => pendingInput,
    ui: { select: async () => undefined, notify: (message, level) => notices.push({ message, level }),
      setWidget: () => {}, confirm: async () => true } };
  const pi = { on: (name, fn) => events.set(name, fn), registerCommand: (name, command) => commands.set(name, command),
    registerTool: tool => tools.set(tool.name, tool), getAllTools: () => [], getCommands: () => [], appendEntry: () => {},
    getThinkingLevel: () => 'medium',
    sendMessage: (...args) => messages.push(args), sendUserMessage: (...args) => messages.push(args) };
  const main = registerMain(pi);
  try {
    await events.get('session_start')({}, ctx);
    const controller = main.getController(); assert.ok(controller);
    let spawns = 0;
    if (rpc === 'forbidden') controller.rpcFactory = () => { spawns++; throw Error('RPC spawn forbidden in the handoff fixture'); };
    else controller.rpcFactory = options => { spawns++; return new PiRpc({ ...options, env: { ...options.env, PI_CODING_AGENT_DIR: home } }); };
    await run({ controller, getController: () => main.getController(), events, commands, tools, messages, notices, ctx,
      spawns: () => spawns, command: args => commands.get('pair').handler(args, ctx), base, cwd, home,
      setPending: value => { pendingInput = value; },
      run: () => events.get('before_agent_start')({ systemPrompt: 'fixture prompt' }, ctx),
      input: () => events.get('input')({}, ctx),
      toolCall: name => events.get('tool_call')({ toolName: name }, ctx),
      boundary: (over = {}) => events.get('agent_before_settle')({ type: 'agent_before_settle', outcome: 'completed', entries: [], continue: false,
        // Realistic final-assistant settlement: canContinue is false before our draft;
        // native recomputes it after committing the injected entries.
        context: { canContinue: false, pendingMessages: [] }, ...over }, ctx) });
  } finally {
    await events.get('session_shutdown')({}, ctx);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
}

/** Inject one finalized-report task + unacknowledged notice directly into durable
 * state, mirroring the exact persisted shapes finalizeReport produces, with a real
 * immutable checkpoint so pair_inspect observes actual evidence. */
async function injectReview(c, cwd, { kind = 'checkpoint', question, decisions, stepComplete, reportId = `report-${Math.random().toString(36).slice(2, 10)}`, taskId = `task-${Math.random().toString(36).slice(2, 10)}` } = {}) {
  const spec = c.config.workers[0];
  const status = kind === 'question' ? 'question' : kind === 'blocked' ? 'blocked' : 'review';
  const payload = { taskId, stepId: 'one', kind, summary: `Fixture ${kind} summary distinct from any question`,
    ...(question !== undefined ? { question } : {}), ...(decisions?.length ? { decisions } : {}), ...(stepComplete !== undefined ? { stepComplete } : {}) };
  const base = await c.evidence.capture(cwd);
  const checkpoint = await c.evidence.checkpoint(taskId, reportId, base, base, []);
  const task = { id: taskId, workerId: spec.id, requestId: 'request-fixture', objective: 'Handoff delivery fixture', context: '', constraints: [],
    steps: [{ id: 'one', title: 'Work', instructions: 'fixture' }], stepIndex: 0, planRevision: 1, attemptId: 'attempt-fixture', attemptNumber: 1,
    status, leaseId: 'lease-fixture', policy: structuredClone(c.config.supervision), limits: structuredClone(c.config.limits),
    verification: structuredClone(c.config.verification), startedAt: Date.now(), updatedAt: Date.now(), revisions: 0, turns: 1, usage: null,
    baseSnapshotRef: '/fixture/base', pendingReport: null, decisions: {}, lastDecision: null,
    report: { version: 1, reportId, workerId: spec.id, ownerSession: c.ownerSession, ownerEpoch: c.state.ownerEpoch, workerGeneration: 1,
      nonce: 'nonce-fixture', sessionId: 'session-fixture', leaseId: 'lease-fixture', attemptId: 'attempt-fixture', attemptNumber: 1, planRevision: 1,
      payload, payloadHash: digest(payload), createdAt: Date.now(), checkpoint, snapshotRef: '/fixture/snapshot' } };
  // status 'stopped' models a retained review whose worker process is gone; the
  // record stays fully valid and closable without a live runtime handle.
  const record = { id: spec.id, cwd, repoRoot: cwd, status: 'stopped', bound: spec, workerGeneration: 1,
    sessionId: 'session-fixture', sessionFile: path.join(cwd, 'fixture-session.jsonl'), history: [], usage: null, task };
  c.state.workers[spec.id] = record;
  c.state.requests['request-fixture'] = { hash: digest('request-fixture'), taskId, workerId: spec.id, acceptedAt: Date.now(), status };
  c.state.notices[reportId] = { reportId, workerId: spec.id, taskId, ownerEpoch: c.state.ownerEpoch, workerGeneration: 1,
    attemptId: 'attempt-fixture', deliveryOperationId: 'delivery-fixture', status: 'pending', createdAt: Date.now() };
  await c.persist();
  return { task, record, notice: c.state.notices[reportId], reportId, taskId };
}

const tool = (f, name, params = {}) => f.tools.get(name).execute('call', params, undefined, undefined, f.ctx);

 test('dispatch durably opens the explicit Main phase while reports stay retained, not auto-delivered', { timeout: 15000 }, () => fixture(async f => {
  const dispatch = { workerId: 'worker', requestId: 'request-dispatch', objective: 'Fixture dispatch', steps: [{ id: 'one', title: 'Work', instructions: 'fixture' }] };
  // The offline helper host rejects the work-order prompt, so activation fails
  // after the durable dispatch receipt — exactly the retention path under test.
  await assert.rejects(tool(f, 'pair_dispatch', dispatch), /Inference is forbidden/);
  const c = f.getController();
  assert.equal(c.state.mainPhase.status, 'open', 'dispatch durably opens the explicit Main phase');
  assert.ok(c.state.mainPhase.revision >= 1, 'the phase carries a real monotonic revision token');
  assert.ok(c.phaseEligible(), 'the fresh binding owns the phase it recorded');
  assert.equal(c.record('worker').task.status, 'interrupted', 'the assignment is retained, not replayed');
  const persisted = JSON.parse(await fs.readFile(path.join(c.dir, 'state.json'), 'utf8'));
  assert.equal(persisted.mainPhase.status, 'open');
  assert.deepEqual(f.messages, [], 'no automatic sendMessage or user-message queueing');
  assert.equal(await f.boundary(), undefined, 'an open phase never receives boundary delivery');
  assert.ok(f.spawns() >= 1);
}, { project: { runtime: { command: process.execPath, commandArgs: [host], inheritExtensions: false, startupTimeoutMs: 5000, requestTimeoutMs: 2000, shutdownTimeoutMs: 300 } }, rpc: 'real' }));

test('finalized reports stay retained through streaming, inter-tool gaps and settlement during an open phase', () => fixture(async f => {
  const { notice } = await injectReview(f.controller, f.cwd);
  f.events.get('agent_start')({}, f.ctx);            // streaming begins
  assert.deepEqual(f.messages, [], 'streaming alone never triggers a Main followUp');
  assert.equal(notice.status, 'pending');
  assert.equal(f.controller.summary().waitingReports, 1, 'waiting UI data exposes the retained report');
  assert.equal(await f.boundary(), undefined, 'no explicit yield: the settlement boundary offers nothing');
  f.controller.setPhase('open');                       // explicit open phase (as dispatch would)
  assert.equal(await f.boundary(), undefined, 'an open phase never receives boundary delivery');
  f.events.get('agent_settled')({}, f.ctx);           // settlement alone never closes the phase
  assert.equal(f.controller.state.mainPhase.status, 'open');
  assert.equal(notice.status, 'pending', 'report remains retained and unoffered');
  assert.deepEqual(f.messages, []);
  assert.equal(f.controller.summary().waitingReports, 1);
}));

test('pair_yield repeat reads return the same report until an explicit acknowledgment', () => fixture(async f => {
  const { notice, reportId, taskId } = await injectReview(f.controller, f.cwd);
  const first = await tool(f, 'pair_yield');
  assert.equal(first.details.phase, 'yielded');
  assert.equal(first.details.reports.length, 1);
  assert.equal(first.details.reports[0].reportId, reportId);
  assert.equal(first.details.reports[0].taskId, taskId);
  assert.equal(first.details.reports[0].stepId, 'one');
  assert.equal(first.details.reports[0].stepComplete, null);
  assert.match(first.details.reports[0].requirement, /pair_inspect/);
  assert.equal(notice.status, 'offered');
  assert.equal(notice.channel, 'tool-result');
  assert.ok(Number.isInteger(notice.offeredAt), 'truthful offer receipt is persisted');
  assert.equal(f.controller.summary().waitingReports, 1, 'an offer is not a confirmed delivery: still waiting');
  assert.deepEqual(f.messages, [], 'explicit retrieval causes no separate model wakeup');
  const second = await tool(f, 'pair_yield');
  assert.equal(second.details.reports.length, 1, 'repeat reads are not destructive: the same report returns');
  assert.equal(second.details.reports[0].reportId, reportId);
  assert.equal(f.controller.summary().waitingReports, 1);
  await f.controller.inspect('worker', reportId);     // explicit Main read acknowledges receipt
  assert.ok(Number.isInteger(notice.observedAt), 'observation receipt is truthful and explicit');
  assert.equal(f.controller.summary().waitingReports, 0, 'acknowledgment clears the waiting count');
  const third = await tool(f, 'pair_yield');
  assert.deepEqual(third.details.reports, [], 'an acknowledged report is not re-offered');
  const status = await tool(f, 'pair_status');
  assert.equal(status.details.mainPhase.status, 'yielded');
  assert.ok(status.details.mainPhase.revision >= 1);
}));

test('a question report keeps its exact question, step and worker decisions through compaction', () => fixture(async f => {
  const question = 'Which storage driver should the fixture use for migrations?';
  const { reportId } = await injectReview(f.controller, f.cwd, { kind: 'question', question, decisions: ['driver choice affects migration format'], stepComplete: false });
  const yielded = await tool(f, 'pair_yield');
  const report = yielded.details.reports.find(item => item.reportId === reportId);
  assert.ok(report, 'the question report is retrieved');
  assert.equal(report.kind, 'question');
  assert.equal(report.question, question, 'the exact bounded question text survives compaction');
  assert.doesNotMatch(report.summary, new RegExp(question), 'summary does not duplicate the question');
  assert.equal(report.stepId, 'one');
  assert.equal(report.stepComplete, false, 'step completion semantics survive compaction');
  assert.deepEqual(report.workerDecisions, ['driver choice affects migration format'], 'worker-reported decision items survive compaction');
}));

test('a blocked report keeps its distinct question through compaction', () => fixture(async f => {
  const question = 'Blocked: the fixture cannot proceed without credentials.';
  const { reportId } = await injectReview(f.controller, f.cwd, { kind: 'blocked', question });
  const yielded = await tool(f, 'pair_yield');
  const report = yielded.details.reports.find(item => item.reportId === reportId);
  assert.ok(report, 'the blocked report is retrieved');
  assert.equal(report.kind, 'blocked');
  assert.equal(report.question, question);
  assert.equal(report.workerDecisions, undefined, 'no invented decision items');
  assert.doesNotMatch(report.summary, new RegExp(question));
}));

test('the settlement boundary delivers once after an explicit yield with a realistic final-assistant context', () => fixture(async f => {
  await tool(f, 'pair_yield');                        // explicit yield with nothing ready yet
  const { notice, reportId } = await injectReview(f.controller, f.cwd); // finalizes during the remaining run
  const other = { type: 'custom', customType: 'other.extension', data: { keep: true } };
  // Default fixture context is the realistic completed final-assistant settlement:
  // canContinue false, no pending messages. Native recomputes canContinue after
  // committing our draft, so this must still deliver exactly once.
  const result = await f.boundary({ entries: [other], continue: false });
  assert.ok(result, 'a yielded phase with a ready report receives one bounded offer');
  assert.equal(result.continue, true, 'the boundary ensures one next provider request');
  assert.equal(result.entries[0], other, 'other extensions\' boundary drafts are preserved');
  assert.equal(result.entries[1].type, 'custom_message');
  assert.equal(result.entries[1].customType, 'fabric-pair.report');
  assert.equal(result.entries[1].details.reportId, reportId);
  assert.match(result.entries[1].content, /FABRIC PAIR REPORT/);
  assert.equal(notice.status, 'offered');
  assert.equal(notice.channel, 'boundary');
  assert.equal(f.controller.state.mainPhase.status, 'open', 'delivery reopens the phase: one bounded cycle per yield');
  assert.ok(f.controller.state.mainPhase.revision >= 2, 'the reopen is a fresh revision');
  assert.deepEqual(f.messages, [], 'boundary delivery never touches message queues or user input');
  await f.controller.inspect('worker', reportId);     // acknowledge before another report can exist
  assert.equal(await f.boundary(), undefined, 'the delivered cycle is bounded; no second injection');
  // Only a completed run is eligible; an aborted run never receives an injection.
  await tool(f, 'pair_yield');
  await injectReview(f.controller, f.cwd);
  assert.equal(await f.boundary({ outcome: 'aborted' }), undefined, 'an aborted run never receives an injection');
  const delivered = await f.boundary();
  assert.ok(delivered, 'a re-yield within the same run re-arms one more bounded cycle');
}));

test('queued user input refuses the offer before it is consumed and keeps native priority', () => fixture(async f => {
  await tool(f, 'pair_yield');
  const { notice } = await injectReview(f.controller, f.cwd);
  assert.equal(await f.boundary({ context: { canContinue: true, pendingMessages: [{ role: 'user', content: 'queued user question' }] } }), undefined,
    'queued user input in the boundary preview refuses the offer');
  assert.equal(notice.status, 'pending', 'the offer was never consumed');
  f.setPending(true);
  assert.equal(await f.boundary(), undefined, 'live pending session input refuses the offer');
  assert.equal(notice.status, 'pending');
  f.setPending(false);
  const delivered = await f.boundary();
  assert.ok(delivered, 'with user input drained the same run\'s boundary delivers');
  assert.equal(notice.channel, 'boundary');
  assert.deepEqual(f.messages, [], 'user input is never dequeued or transformed by Pair');
}));

test('user input arriving during offer persistence drops the drafts but never the obligation', () => fixture(async f => {
  await tool(f, 'pair_yield');
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  const c = f.controller, original = c.boundaryOffer.bind(c);
  c.boundaryOffer = async permit => { const drafts = await original(permit); f.setPending(true); return drafts; };
  assert.equal(await f.boundary(), undefined, 'fresh pending input after the persist await drops the drafts');
  f.setPending(false);
  assert.equal(notice.status, 'offered', 'the receipt was persisted');
  assert.equal(notice.channel, 'boundary');
  assert.ok(!('observedAt' in notice), 'the dropped offer is unacknowledged, not silently consumed');
  assert.equal(c.summary().waitingReports, 1, 'the obligation stays visible');
  const recovered = await tool(f, 'pair_yield');
  assert.equal(recovered.details.reports[0].reportId, reportId, 'the dropped offer stays explicitly retrievable');
}));

test('new accepted Main work revokes an unused yield; a later unrelated run never reuses it', () => fixture(async f => {
  await tool(f, 'pair_yield');                        // yield recorded for the current run
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  const before = f.controller.state.mainPhase.revision;
  await f.run();                                      // a fresh agent run: new accepted user work
  assert.equal(f.controller.state.mainPhase.status, 'open', 'new work synchronously revokes the unused yield');
  assert.ok(f.controller.state.mainPhase.revision > before, 'revocation is a fresh phase revision');
  assert.deepEqual(f.messages, [], 'revocation is observation-only: no input consumed, no queue touched');
  assert.equal(await f.boundary(), undefined, 'the stale yield never authorizes the new run\'s boundary');
  assert.equal(notice.status, 'pending', 'the report was never consumed');
  assert.equal(f.controller.summary().waitingReports, 1);
  const explicit = await tool(f, 'pair_yield');       // conservative fallback: explicit review only
  assert.equal(explicit.details.reports[0].reportId, reportId);
  assert.equal(f.controller.phasePermit().runToken, `1:1`, 'the fresh yield is bound to the new run');
}));

test('a late result after a settled yield needs the next explicit review once new work began', () => fixture(async f => {
  await tool(f, 'pair_yield');                        // Main yields; nothing ready
  f.events.get('agent_settled')({}, f.ctx);           // run settles (never closes the phase)
  assert.equal(f.controller.state.mainPhase.status, 'yielded');
  const { notice } = await injectReview(f.controller, f.cwd); // late result while Main is idle
  assert.deepEqual(f.messages, [], 'no automatic idle wakeup exists');
  assert.equal(f.controller.summary().waitingReports, 1, 'waiting UI exposes the manual fallback');
  await f.run();                                      // the user starts a new unrelated planning phase
  assert.equal(await f.boundary(), undefined, 'a new unrelated phase is not eligible just because a previous run yielded');
  assert.equal(notice.status, 'pending');
  const explicit = await tool(f, 'pair_yield');       // the explicit conservative fallback
  assert.equal(explicit.details.reports.length, 1);
}));

test('a late result within the still-current yielded run is delivered at its final boundary', () => fixture(async f => {
  await tool(f, 'pair_yield');
  const { notice } = await injectReview(f.controller, f.cwd); // arrives before settlement, same run
  const delivered = await f.boundary();
  assert.ok(delivered, 'the current yielded run\'s legitimate final boundary delivers once');
  assert.equal(notice.channel, 'boundary');
}));

test('/pair yield is the explicit human manual channel and /pair inbox remains the redelivery fallback', () => fixture(async f => {
  const { notice } = await injectReview(f.controller, f.cwd);
  await f.command('yield');
  assert.equal(f.messages.length, 1, 'exactly one explicit human-triggered delivery');
  const [message, options] = f.messages[0];
  assert.equal(message.customType, 'fabric-pair.report');
  assert.deepEqual(options, { deliverAs: 'followUp', triggerTurn: true });
  assert.equal(notice.status, 'offered');
  assert.equal(notice.channel, 'manual');
  assert.equal(f.controller.state.mainPhase.status, 'yielded');
  await f.command('yield');
  assert.equal(f.messages.length, 2, 'an unacknowledged offer is re-delivered on explicit human request');
  await f.controller.inspect('worker', notice.reportId);
  await f.command('yield');
  assert.equal(f.messages.length, 2, 'an acknowledged report is not re-delivered');
  notice.status = 'pending'; delete notice.observedAt; await f.controller.persist();
  await f.command('inbox');
  assert.ok(f.messages.length >= 3, 'confirmed inbox redelivery re-offers retained reports');
  assert.equal(notice.status, 'offered');
}));

test('reload keeps handoff state readable; a stale phase never authorizes and unacknowledged offers stay retrievable', () => fixture(async f => {
  const offered = await injectReview(f.controller, f.cwd);
  await tool(f, 'pair_yield');                        // offers the report; records the yielded phase
  await f.events.get('session_start')({}, f.ctx);     // controller replacement (reload/rebind)
  const c = f.getController();
  assert.notEqual(c, f.controller);
  assert.equal(c.state.mainPhase.status, 'yielded', 'phase remains readable after replacement');
  assert.equal(c.phaseEligible(), null, 'the stale owner epoch never implies current readiness');
  assert.equal(c.summary().mainPhase.current, false);
  assert.equal(await f.boundary(), undefined, 'a stale phase/owner offer is rejected');
  assert.deepEqual(f.messages, []);
  assert.equal(c.summary().waitingReports, 1, 'the offered-unacknowledged report is still a visible obligation');
  const again = await tool(f, 'pair_yield');           // controller replacement alone never marks it received
  assert.equal(again.details.reports.length, 1);
  assert.equal(again.details.reports[0].reportId, offered.reportId, 'the unobserved offered result is explicitly retrievable after reload');
  assert.equal(c.state.notices[offered.reportId].channel, 'tool-result');
  await c.inspect('worker', offered.reportId);        // acknowledge, then a fresh report can exist
  const fresh = await injectReview(c, f.cwd);
  const yielded = await tool(f, 'pair_yield');
  assert.equal(yielded.details.reports.length, 1);
  assert.equal(yielded.details.reports[0].reportId, fresh.reportId);
  assert.equal(c.phaseEligible()?.status, 'yielded', 'a fresh explicit yield re-arms delivery');
}));

test('shutdown before the offer persists leaves the report pending and unconsumed', () => fixture(async f => {
  await tool(f, 'pair_yield');
  const { notice } = await injectReview(f.controller, f.cwd);
  const c = f.controller, original = c.boundaryOffer.bind(c);
  let release = () => {};
  const gate = new Promise(resolve => { release = resolve; });
  c.boundaryOffer = async () => { await gate; return original(c.phasePermit()); };
  const pending = f.boundary();
  const shuttingDown = f.events.get('session_shutdown')({}, f.ctx); // shutdown races the in-flight offer
  release();
  assert.equal(await pending, undefined, 'the stale offer is dropped after the await, never replayed');
  await shuttingDown;
  assert.deepEqual(f.messages, []);
  const persisted = JSON.parse(await fs.readFile(path.join(c.dir, 'state.json'), 'utf8'));
  assert.equal(persisted.notices[notice.reportId].status, 'pending', 'nothing was consumed; the obligation is recoverable');
}));

test('shutdown after the offer persists leaves it offered-but-unacknowledged and recoverable', () => fixture(async f => {
  await tool(f, 'pair_yield');
  const { notice } = await injectReview(f.controller, f.cwd);
  const c = f.controller, original = c.boundaryOffer.bind(c);
  let release = () => {};
  const gate = new Promise(resolve => { release = resolve; });
  let markPersisted = () => {};
  const persisted = new Promise(resolve => { markPersisted = resolve; });
  c.boundaryOffer = async permit => { const drafts = await original(permit); markPersisted(); await gate; return drafts; };
  const pending = f.boundary(); // offer persists, drafts not yet returned
  await persisted;                                     // the offered receipt is durable
  const shuttingDown = f.events.get('session_shutdown')({}, f.ctx);
  release();
  assert.equal(await pending, undefined, 'post-persist loss is detected and the drafts are dropped');
  await shuttingDown;
  const stored = JSON.parse(await fs.readFile(path.join(c.dir, 'state.json'), 'utf8'));
  assert.equal(stored.notices[notice.reportId].status, 'offered', 'the truthful receipt survives');
  assert.ok(!('observedAt' in stored.notices[notice.reportId]), 'never marked received by replacement or shutdown');
  assert.deepEqual(f.messages, []);
}));

test('status and widget expose the waiting phase explicitly', () => fixture(async f => {
  await injectReview(f.controller, f.cwd);
  const summary = f.controller.summary();
  assert.equal(summary.waitingReports, 1);
  assert.equal(summary.mainPhase, null, 'no phase exists before dispatch or yield');
  const text = statusText(summary);
  assert.match(text, /Waiting reports: 1 unacknowledged/);
  assert.doesNotMatch(text, /Main phase:/, 'no phase line before a phase exists');
  await f.controller.setPhase('open');
  const withPhase = statusText(f.controller.summary());
  assert.match(withPhase, /Main phase: open \(explicit, non-authorizing\)/);
  const widget = indicatorWidget(f.controller.summary(), true, { fg: (_color, line) => line });
  const lines = widget.render(80);
  assert.ok(lines.some(line => line.includes('1 pair report waiting')));
}));

test('a phase recorded by a foreign owner is readable but never eligible', () => fixture(async f => {
  await injectReview(f.controller, f.cwd);
  f.controller.state.mainPhase = { status: 'yielded', since: Date.now(), ownerSession: 'another-main', ownerEpoch: f.controller.state.ownerEpoch, revision: 1, runToken: '1:0' };
  await f.controller.persist();
  assert.equal(f.controller.phaseEligible(), null);
  assert.equal(await f.boundary(), undefined);
  assert.deepEqual(f.messages, []);
}));

test('retrieval mechanically enforces the single-unresolved-report invariant', () => fixture(async f => {
  await injectReview(f.controller, f.cwd);
  await injectReview(f.controller, f.cwd);            // fixture-only impossible state
  await assert.rejects(tool(f, 'pair_yield'), /UNSUPPORTED_PROFILE.*one unresolved report/);
  assert.deepEqual(f.messages, []);
}));

test('decide resolves a report once, records observation on inspect, and reopens the phase', () => fixture(async f => {
  const { notice, reportId, taskId } = await injectReview(f.controller, f.cwd);
  await tool(f, 'pair_yield');
  await f.controller.inspect('worker', reportId);      // explicit Main read of the checkpoint
  assert.ok(Number.isInteger(notice.observedAt), 'observation receipt is truthful and explicit');
  const decision = { workerId: 'worker', taskId, reportId, action: 'cancel', feedback: 'fixture cancellation' };
  const first = await tool(f, 'pair_decide', decision);
  assert.equal(first.details.status, 'cancelled');
  assert.equal(notice.status, 'resolved');
  assert.equal(f.controller.state.mainPhase.status, 'open', 'a decision is explicit Main activity and reopens the phase');
  const duplicate = await tool(f, 'pair_decide', decision);
  assert.equal(duplicate.details.duplicate, true, 'a duplicate decision cannot advance twice');
  assert.equal(notice.status, 'resolved');
  assert.equal(f.controller.summary().waitingReports, 0);
}));

test('persisted handoff records validate: legacy and interim shapes stay readable, malformed data is rejected', () => fixture(async f => {
  const { reportId } = await injectReview(f.controller, f.cwd);
  await tool(f, 'pair_yield');
  const c = f.controller, file = path.join(c.dir, 'state.json');
  const read = async () => JSON.parse(await fs.readFile(file, 'utf8'));
  const state = await read();
  assert.equal(state.mainPhase.status, 'yielded');
  assert.ok(Number.isInteger(state.mainPhase.revision), 'the phase revision is persisted');
  assert.equal(typeof state.mainPhase.runToken, 'string', 'the run token is persisted');
  assert.equal(state.notices[reportId].status, 'offered');
  assert.equal(state.notices[reportId].channel, 'tool-result');
  assert.ok(['armed', 'activity'].every(key => Object.hasOwn(state.mainPhase, key)), 'arming and activity are persisted');
  const expected = { ownerSession: c.ownerSession, cwd: await fs.realpath(f.cwd) };
  validateStoredState(state, expected);
  const legacy = structuredClone(state); delete legacy.mainPhase;
  validateStoredState(legacy, expected);              // older data without a phase stays readable
  const interim = structuredClone(state); delete interim.mainPhase.revision; delete interim.mainPhase.runToken; delete interim.mainPhase.armed; delete interim.mainPhase.activity;
  validateStoredState(interim, expected);             // interim phase shape stays readable (recovered conservatively)
  const badPhase = structuredClone(state); badPhase.mainPhase.status = 'bogus';
  assert.throws(() => validateStoredState(badPhase, expected), /mainPhase/);
  const badChannel = structuredClone(state); badChannel.notices[reportId].channel = 'telepathy';
  assert.throws(() => validateStoredState(badChannel, expected), /channel/);
}));

test('same-run user input supersedes the yield even after its queues drain', () => fixture(async f => {
  await tool(f, 'pair_yield');                        // armed empty yield for the current run
  f.input();                                          // steering/follow-up input arrives mid-run
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  assert.equal(f.controller.state.mainPhase.status, 'open', 'input synchronously supersedes the yield');
  assert.deepEqual(f.messages, [], 'input is never consumed, transformed or blocked');
  assert.equal(await f.boundary({ context: { canContinue: false, pendingMessages: [] } }), undefined,
    'drained queues do not resurrect the superseded yield');
  assert.equal(notice.status, 'pending', 'the report was never consumed');
  const explicit = await tool(f, 'pair_yield');
  assert.equal(explicit.details.reports[0].reportId, reportId, 'explicit retrieval remains the fallback');
}));

test('same-run non-Pair tool admission after a yield supersedes it; Pair tools do not', () => fixture(async f => {
  await tool(f, 'pair_yield');                        // armed empty yield for the current run
  f.toolCall('read');                                 // a later pi.read-style tool is new Main work
  assert.equal(f.controller.state.mainPhase.status, 'open', 'non-Pair tool admission supersedes the yield');
  const first = await injectReview(f.controller, f.cwd);
  assert.equal(await f.boundary(), undefined, 'the superseded yield never delivers');
  assert.equal(first.notice.status, 'pending', 'the report was never consumed');
  const recovered = await tool(f, 'pair_yield');      // explicit fallback retrieves it
  assert.equal(recovered.details.reports[0].reportId, first.reportId);
  await f.controller.inspect('worker', first.reportId); // acknowledge before re-arming
  // Positive control: Pair tool admission never revokes Pair's own phase transitions.
  await tool(f, 'pair_yield');                        // empty yield re-arms the boundary
  f.toolCall('pair_inspect');
  const second = await injectReview(f.controller, f.cwd);
  const delivered = await f.boundary();
  assert.ok(delivered, 'a pair_* tool call did not stale the armed yield');
  assert.equal(delivered.entries[0].details.reportId, second.reportId);
  assert.ok(Number.isInteger(first.notice.observedAt) && first.notice.status === 'offered', 'the acknowledged earlier report is never auto-replayed');
}));

test('a yield whose tool result returned reports consumes the automatic delivery permission', () => fixture(async f => {
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  const direct = await tool(f, 'pair_yield');
  assert.equal(direct.details.reports.length, 1, 'the direct retrieval returned the report');
  assert.equal(f.controller.phasePermit().armed, false, 'returning results consumes the automatic offer permission');
  assert.equal(await f.boundary(), undefined, 'no redundant automatic model continuation after direct retrieval');
  assert.equal(notice.status, 'offered');
  const repeat = await tool(f, 'pair_yield');
  assert.equal(repeat.details.reports[0].reportId, reportId, 'explicit repeat reads return the same stable IDs');
  assert.deepEqual(f.messages, [], 'no duplicate turns were scheduled');
}));

test('a consumed offer is stale after a new run even when every queue is empty', () => fixture(async f => {
  await tool(f, 'pair_yield');                        // armed empty yield
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  const c = f.controller, original = c.boundaryOffer.bind(c);
  let markPersisted = () => {};
  const persisted = new Promise(resolve => { markPersisted = resolve; });
  c.boundaryOffer = async permit => { const consumed = await original(permit); markPersisted(); await f.run(); return consumed; };
  assert.equal(await f.boundary({ context: { canContinue: false, pendingMessages: [] } }), undefined,
    'the consumed-offer token is verified against the new run identity before returning drafts');
  assert.equal(notice.status, 'offered', 'the receipt is durable');
  assert.ok(!('observedAt' in notice), 'the dropped offer is unacknowledged, not consumed');
  const recovered = await tool(f, 'pair_yield');
  assert.equal(recovered.details.reports[0].reportId, reportId, 'the obligation stays explicitly retrievable');
}));

test('a consumed offer is stale after same-run activity invalidation and after cancellation', () => fixture(async f => {
  await tool(f, 'pair_yield');
  const first = await injectReview(f.controller, f.cwd);
  const c = f.controller, original = c.boundaryOffer.bind(c);
  c.boundaryOffer = async permit => { const consumed = await original(permit); c.noteActivity(); return consumed; };
  assert.equal(await f.boundary(), undefined, 'same-run input/new work during persistence stales the offer');
  assert.equal(first.notice.status, 'offered');
  assert.ok(await tool(f, 'pair_yield'), 'the dropped offer stays explicitly retrievable');
  await c.inspect('worker', first.reportId);           // acknowledge, then a fresh cycle can exist
  // Cancellation/resolution during persistence stales the offer and resolves the obligation.
  await c.setPhase('yielded', `1:0`, true); await c.persist();
  const second = await injectReview(c, f.cwd);
  const again = c.boundaryOffer.bind(c);
  c.boundaryOffer = async permit => {
    const consumed = await again(permit);
    await c.decide({ workerId: 'worker', taskId: second.taskId, reportId: second.reportId, action: 'cancel', feedback: 'fixture cancellation during persistence' });
    return consumed;
  };
  assert.equal(await f.boundary(), undefined, 'resolving the report during persistence stales the offer');
  assert.equal(c.state.notices[second.reportId].status, 'resolved');
  assert.equal(c.summary().waitingReports, 0);
}));

test('missing readiness observations fail closed: automatic delivery defers, explicit retrieval works', () => fixture(async f => {
  await tool(f, 'pair_yield');
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  const warnings = f.notices.length;
  delete f.ctx.hasPendingMessages;                   // runtime without the live pending-input capability
  assert.equal(await f.boundary({ context: undefined }), undefined,
    'unknown pending-input observations are never inferred as empty');
  assert.equal(notice.status, 'pending', 'nothing was consumed');
  assert.ok(f.notices.length > warnings, 'the deferral is actionable in the UI');
  assert.match(f.notices.at(-1).message, /pair_yield|deferred/);
  f.ctx.hasPendingMessages = () => false;
  assert.equal(await f.boundary({ context: { canContinue: false } }), undefined,
    'a missing boundary preview is still unknown, never empty');
  const explicit = await tool(f, 'pair_yield');
  assert.equal(explicit.details.reports[0].reportId, reportId, 'explicit retrieval is unaffected');
}));

test('legacy delivered and failed receipts stay visible and are recoverable explicitly, never automatically', () => fixture(async f => {
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  notice.status = 'delivered'; await f.controller.persist();   // legacy fire-and-forget receipt without observedAt
  assert.equal(f.controller.summary().waitingReports, 1, 'legacy uncertain receipts stay visible');
  f.controller.setPhase('yielded', '1:0', true); await f.controller.persist();
  assert.equal(await f.boundary(), undefined, 'legacy uncertain receipts are never auto-delivered');
  const recovered = await tool(f, 'pair_yield');
  assert.equal(recovered.details.reports[0].reportId, reportId, 'explicit recovery re-offers the legacy receipt');
  assert.equal(notice.channel, 'tool-result');
  await f.controller.inspect('worker', reportId);
  assert.equal(f.controller.summary().waitingReports, 0);
  notice.status = 'delivery_failed'; delete notice.observedAt; await f.controller.persist();
  assert.equal(f.controller.summary().waitingReports, 1, 'failed deliveries stay visible obligations');
  assert.ok((await tool(f, 'pair_yield')).details.reports.length === 1, 'failed deliveries are explicitly retrievable');
}));

test('in-flight manual deliveries are visible but never handed back by retrieval or boundary', () => fixture(async f => {
  const { notice } = await injectReview(f.controller, f.cwd);
  notice.status = 'delivery_pending'; await f.controller.persist();
  assert.equal(f.controller.summary().waitingReports, 1, 'in-flight deliveries stay visible');
  assert.deepEqual((await tool(f, 'pair_yield')).details.reports, [], 'retrieval never races an in-flight manual delivery');
  f.controller.setPhase('yielded', '1:0', true); await f.controller.persist();
  assert.equal(await f.boundary(), undefined, 'in-flight deliveries are not boundary-eligible');
}));

test('a pending notice that was explicitly read is consistently acknowledged', () => fixture(async f => {
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  notice.observedAt = Date.now(); await f.controller.persist();  // explicit read recorded while still pending
  assert.equal(f.controller.summary().waitingReports, 0, 'observedAt acknowledges regardless of status');
  assert.deepEqual((await tool(f, 'pair_yield')).details.reports, []);
  assert.ok(reportId);
}));

test('input admitted before the queued yield transaction executes supersedes the stale request', () => fixture(async f => {
  const c = f.controller, original = c.yieldMain.bind(c);
  c.yieldMain = async runToken => { const pending = original(runToken); f.input(); return pending; };
  const yielded = await tool(f, 'pair_yield');      // yield requested; input races in before the transaction runs
  assert.equal(yielded.details.phase, 'yielded', 'the explicit retrieval itself still succeeds');
  assert.deepEqual(f.messages, [], 'the input was never consumed or transformed');
  const { notice, reportId } = await injectReview(f.controller, f.cwd);
  assert.equal(await f.boundary(), undefined, 'the stale yield never delivers: its captured activity epoch was superseded');
  assert.equal(notice.status, 'pending');
  assert.equal((await tool(f, 'pair_yield')).details.reports[0].reportId, reportId, 'explicit retrieval remains available');
}));

test('compact retrieval preserves all schema-bounded worker decisions', () => fixture(async f => {
  const decisions = Array.from({ length: 12 }, (_, index) => `fixture decision ${index + 1}`);
  const { reportId } = await injectReview(f.controller, f.cwd, { kind: 'question', question: 'Fixture question for many decisions?', decisions });
  const yielded = await tool(f, 'pair_yield');
  const report = yielded.details.reports.find(item => item.reportId === reportId);
  assert.equal(report.workerDecisions.length, 12, 'all already-bounded decisions are preserved, none silently sliced');
  assert.deepEqual(report.workerDecisions, decisions);
}));

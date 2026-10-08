import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicJSON, assert, bounded, digest, inside, mkdirPrivate, plain, PROTOCOL, readJSON, safeId, Serial, uid } from './util.js';
import { assertReportSize, reportSchema, validateReport } from './schema.js';
import { validateAuthority, validateLatch, validateReportEnvelope } from './contracts.js';
import { detachedEffectDescription, detachedProviderEffect, detachingProgramCalls, ensureCacheLifetime, gateTool, pairToolRoute, isDirectMutation, nativeSettings, probeNative, providerFileWrite, refusedProgramReason, requestsDetachedEffect, reviewWarmingAction, signedIn, toolName, toolPlacement } from './native.js';
import { addSpeedSample, selectLastMeasuredUsage } from './metrics.js';

/** @typedef {import('@earendil-works/pi-coding-agent').ExtensionAPI} ExtensionAPI */
/** @typedef {import('@earendil-works/pi-coding-agent').ExtensionContext} ExtensionContext */
/** @typedef {import('./contracts.js').Authority} Authority */
/** @typedef {import('./contracts.js').ReportEnvelope} ReportEnvelope */
/** @typedef {import('@earendil-works/pi-coding-agent').AgentToolResult<{pairReportId: string}>} ReportToolResult */

/** @param {unknown} error @param {string} code @returns {boolean} */
function hasErrorCode(error, code) { return error !== null && typeof error === 'object' && 'code' in error && error.code === code; }

/** @param {ExtensionContext} ctx @returns {import('./contracts.js').StoredContextUsage | undefined} */
function contextUsage(ctx) { const usage = ctx.getContextUsage?.(); return usage ? { ...usage } : undefined; }

/** @param {string} name @param {unknown} args @param {string} cwd @returns {string | null} */
function toolTarget(name, args, cwd) {
  if (args === null || typeof args !== 'object') return null;
  const n = name.replace(/^extensions\./, '');
  if (/^(bash|powershell)$/.test(n)) {
    const command = 'command' in args && typeof args.command === 'string' ? args.command.trim() : '';
    const program = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(\S+)/.exec(command)?.[1];
    return program ? path.basename(program).slice(0, 40) : null;
  }
  const file = ('path' in args && typeof args.path === 'string' && args.path) || ('file_path' in args && typeof args.file_path === 'string' && args.file_path) || '';
  if (!file) return null;
  const relative = path.relative(cwd, path.resolve(cwd, file));
  return (relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : path.basename(file)).slice(-120);
}
/** @template T @param {Serial} serial @param {() => Promise<T>} operation @returns {Promise<T>} */
async function runSerial(serial, operation) {
  /** @type {{completed?: {value: T}}} */
  const result = {};
  await serial.run(async () => { result.completed = { value: await operation() }; });
  assert(result.completed, 'Serialized Pair operation did not complete');
  return result.completed.value;
}

/** How the worker calls pair_report, by route (see pairToolRoute in native.js). */
const WORKER_CALLS = {
  program: "When using Fabric, end the fabric_exec program with return await extensions.pair_report({...}) (the same form works in Python), without searching for it first, so the run ends cleanly; only after an argument-shape error, read its schema once with tools.describe({ref: \"extensions.pair_report\"}).",
  direct: 'Call pair_report directly as a tool, not inside fabric_exec.',
  unreachable: 'Fabric Schema enforce mode hides pair_report; stop and report nothing.'
};
/** @param {string} calls */
const workerGuideFor = calls => `You are a persistent implementation worker in Fabric Pair.
The Main model is your supervisor. A controller grants one bounded implementation lease at a time.
Use your normal Fabric and Fovea tools. Before changing unfamiliar code, inspect the relevant Fovea context and source.
The current task-state packet contains authoritative IDs, constraints, and the authorized step. Do not infer permission from ordinary conversation text, Fovea updates, cached history, or previous approvals.
Ask questions early with pair_report(kind="question"). Submit a checkpoint when the authorized step is complete; use final_review only for the authorized final step. pair_report accepts only these fields: taskId and stepId (copy them from the task-state packet), kind ("checkpoint" | "question" | "blocked" | "final_review"), summary (at most 8000 characters), and optionally question, decisions (strings), changedFiles (paths), checks ([{name, result: "pass" | "fail" | "not_run", detail}]) and stepComplete (boolean). ${calls} Do not emit a prose-only completion.
Call pair_report by itself, not in parallel with other work. After reporting, stop. Main will answer, approve, or request revisions in this SAME conversation. Do not poll, send keepalive text, spawn subagents, or work around a PAIR_WAIT response.
Report concise changes and reasons, affected paths, and honestly labeled test evidence. Your claim that tests pass is not independently verified evidence.
Do not deploy, push, commit, remove history, access unrelated secrets, or run destructive operations without the human's normal permission. Do not mutate Pair's coordination files. This is workflow control, not a sandbox.`;

/** @typedef {{version: 1, taskId: string, planRevision: number, objective: string, context: string, constraints: string[], writtenAt: number}} WorkOrderRef */
/**
 * @param {Authority | null} authority @param {ReportEnvelope | null} report @param {WorkOrderRef | null} [order]
 * @param {boolean} [restore] include the original work order: only after compaction removed it from the conversation
 * @returns {string}
 */
function statePacket(authority, report, order, restore = false) {
  if (!authority?.task) return 'No implementation lease is active. Remain idle until the Pair controller assigns work.';
  const t = authority.task;
  const scope = restore && order && order.taskId === t.id && order.planRevision === t.planRevision
    ? { originalObjective: order.objective, originalContext: bounded(order.context, 24000),
        ...(t.policy.mode === 'final-only' ? { remainingPlan: t.steps.slice(t.stepIndex) } : {}) }
    : {};
  return JSON.stringify({ type: 'fabric-pair.task-state', ownerEpoch: authority.ownerEpoch, workerGeneration: authority.workerGeneration,
    taskId: t.id, planRevision: t.planRevision, attemptId: t.attemptId, attemptNumber: t.attemptNumber,
    phase: authority.phase, leaseId: authority.leaseId, objective: t.objective,
    constraints: t.constraints, authorizedStep: t.steps[t.stepIndex],
    supervision: t.policy.mode, mayCompleteRemainingPlan: t.policy.mode === 'final-only',
    lastDecision: t.lastDecision || null, submittedReportId: report?.reportId || null,
    ...scope,
    instruction: authority.phase === 'running' && !report ? 'Execute only the authorized scope.' : 'Wait; do not execute additional work.' });
}
/** @param {unknown} raw @returns {WorkOrderRef | null} */
function validateWorkOrder(raw) {
  if (raw === null || !plain(raw)) return null;
  const { version, taskId, planRevision, objective, context, constraints, writtenAt } = raw;
  if (version !== 1 || typeof taskId !== 'string' || typeof objective !== 'string' || typeof context !== 'string') return null;
  if (typeof planRevision !== 'number' || !Number.isInteger(planRevision) || planRevision < 1) return null;
  if (!Array.isArray(constraints) || !constraints.every(entry => typeof entry === 'string')) return null;
  return { version: 1, taskId, planRevision, objective, context, constraints, writtenAt: typeof writtenAt === 'number' ? writtenAt : 0 };
}

/** @param {ExtensionAPI} pi @param {NodeJS.ProcessEnv} [env] */
export function registerWorker(pi, env = process.env) {
  const workerId = safeId(env.PI_FABRIC_PAIR_WORKER_ID, 'worker ID');
  const ownerSession = String(env.PI_FABRIC_PAIR_OWNER || '');
  const ownerEpoch = Number(env.PI_FABRIC_PAIR_OWNER_EPOCH), workerGeneration = Number(env.PI_FABRIC_PAIR_WORKER_GENERATION);
  const nonce = String(env.PI_FABRIC_PAIR_NONCE || '');
  const candidateDir = env.PI_FABRIC_PAIR_WORKER_DIR;
  assert(typeof candidateDir === 'string' && path.isAbsolute(candidateDir) && ownerSession && nonce && Number.isSafeInteger(ownerEpoch) && ownerEpoch > 0 && Number.isSafeInteger(workerGeneration) && workerGeneration > 0, 'Invalid Pair worker environment');
  const dir = candidateDir; // Keep the validated string type inside hoisted async helpers.
  const gateFile = path.join(dir, 'authority.json');
  const latchFile = path.join(dir, 'latch.json');
  const workOrderFile = path.join(dir, 'work-order.json');
  const reportSerial = new Serial(), telemetrySerial = new Serial();
  /** @type {ExtensionContext | undefined} */
  let ctxRef;
  /** @type {Authority | null} */
  let authority = null;
  /** @type {WorkOrderRef | null} */
  let workOrder = null;
  /** @type {ReportEnvelope | null} */
  let report = null;
  /** @type {string | null} */
  let currentTool = null;
  /** @type {string | null} */
  let currentTarget = null;
  /** @type {import('./observations.js').UsageObservation | null} */
  let lastUsage = null;
  /** @type {{tokens: number, seconds: number} | null} */
  let speed = null;
  /** @type {number | null} */
  let speedStart = null;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let parentTimer;
  let compacting = false, stopped = false;
  /** @type {Map<string, number>} */ const reportRejections = new Map();
  /** @type {string | null} */
  let repairsExhausted = null;
  const hadIpc = process.connected !== undefined;
  let parentDead = false;
  const parentGone = () => {
    if (parentDead) return;
    parentDead = true; stopped = true; ctxRef?.abort(); ctxRef?.shutdown();
  };
  if (process.connected === false) parentGone();
  if (process.channel) {
    process.channel.unref?.();
    process.once('disconnect', parentGone);
  }
  /** @type {import('./contracts.js').StoredDetachedEffectV1 | null} */
  let detachedEffect = null;

  /** @returns {Promise<Authority>} */
  async function load() {
    const next = validateAuthority(await readJSON(gateFile, null), { ownerSession, ownerEpoch, workerId, workerGeneration });
    authority = next;
    try { workOrder = validateWorkOrder(await readJSON(workOrderFile, null)); } catch { workOrder = null; }
    /** @type {unknown} */
    const rawLatch = await readJSON(latchFile, null);
    const latch = rawLatch === null ? null : validateLatch(rawLatch);
    const currentLatch = latch !== null && latch.ownerEpoch === ownerEpoch && latch.workerGeneration === workerGeneration && latch.leaseId === next.leaseId && latch.attemptId === next.attemptId;
    if (currentLatch) {
      validateReport(latch.report.payload); assert(latch.report.payloadHash === digest(latch.report.payload), 'Latched report payload hash mismatch');
      assert(latch.report.ownerSession === ownerSession && latch.report.workerId === workerId && latch.report.nonce === nonce, 'Latched report producer mismatch');
    }
    report = currentLatch ? latch.report : null;
    return next;
  }
  /** @param {import('./contracts.js').ReportEnvelope} retained @returns {Promise<void>} */
  async function assertReportAuthority(retained) {
    /** @type {import('./contracts.js').Authority} */
    const current = validateAuthority(await readJSON(gateFile, null), { ownerSession, ownerEpoch, workerId, workerGeneration });
    assert(current.phase === 'running', 'PAIR_WAIT: this step is not authorized');
    assert(!detachedEffect, 'PAIR_DETACHED_EFFECT: a shell job, agent, actor or other Fabric effect outlived its call; this worker must stop and reconcile before reporting.');
    assert(retained.ownerSession === ownerSession && retained.ownerEpoch === ownerEpoch && retained.workerId === workerId && retained.workerGeneration === workerGeneration && retained.nonce === nonce, 'Report producer mismatch');
    assert(current.task && retained.leaseId === current.leaseId && retained.attemptId === current.attemptId && retained.attemptNumber === current.task.attemptNumber && retained.planRevision === current.task.planRevision && retained.payload.taskId === current.task.id && retained.payload.stepId === current.task.steps[current.task.stepIndex].id, 'PAIR_WAIT: report authority was superseded');
  }
  /** @param {import('./contracts.js').ReportEnvelope} retained @returns {Promise<void>} */
  async function publishReport(retained) {
    validateReportEnvelope(retained);
    /** @type {string} */
    const inboxFile = path.join(path.dirname(latchFile), 'inbox', `${retained.reportId}.json`);
    /** @type {string} */
    const staged = `${inboxFile}.${uid('publication')}.tmp`;
    await mkdirPrivate(path.dirname(inboxFile));
    try {
      await atomicJSON(staged, retained);
      await assertReportAuthority(retained);
      try { await fs.link(staged, inboxFile); }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        /** @type {import('./contracts.js').ReportEnvelope} */
        const existing = validateReportEnvelope(await readJSON(inboxFile, undefined));
        assert(Object.entries(retained).every(([key, value]) => JSON.stringify(Reflect.get(existing, key)) === JSON.stringify(value)), `Conflicting immutable report at ${inboxFile}; retained report remains in ${latchFile}`);
      }
    } finally { await fs.unlink(staged).catch(() => {}); }
  }
  /** The newest telemetry not yet written; queued writes take it, so a burst of events writes once. @type {{packet: import('./contracts.js').StoredTelemetryV1, durable: boolean} | null} */
  let telemetryNext = null;
  /**
   * Telemetry is display state for the controller and Pi awaits each hook, so writes skip fsync unless
   * `durable` (a detached effect or a report, which the controller must still see after a crash).
   * @param {ExtensionContext | undefined} [ctx] @param {boolean} [durable] @returns {Promise<void>}
   */
  async function telemetry(ctx = ctxRef, durable = false) {
    if (!ctx || stopped) return;
    {
      /** @type {import('./contracts.js').StoredTelemetryV1} */
      const packet = {
        version: PROTOCOL, nonce, ownerSession, ownerEpoch, workerId, workerGeneration, pid: process.pid, sessionId: ctx.sessionManager.getSessionId(),
        context: contextUsage(ctx) || null, currentTool, currentTarget, lastUsage, compacting, detachedEffect, speed,
        phase: report ? 'waiting' : authority?.phase || 'idle', model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : null,
        at: Date.now()
      };
      telemetryNext = { packet, durable: durable || !!telemetryNext?.durable };
    }
    await telemetrySerial.run(async () => {
      const next = telemetryNext; telemetryNext = null;
      if (next) await atomicJSON(path.join(dir, 'telemetry.json'), next.packet, { durable: next.durable });
    });
  }
  /** @param {ExtensionContext} ctx @returns {Promise<void>} */
  async function probe(ctx) {
    ctxRef = ctx; await load();
    const status = await probeNative(pi, {
      cwd: ctx.cwd, model: ctx.model, sessionManager: ctx.sessionManager,
      isProjectTrusted: () => ctx.isProjectTrusted?.() === true,
      getContextUsage: () => contextUsage(ctx)
    });
    const meshRoot = process.env.PI_FABRIC_MESH_ROOT ?? null;
    await atomicJSON(path.join(dir, 'probe.json'), { ...status, meshRoot, nonce, workerId, ownerSession, ownerEpoch, workerGeneration });
    await telemetry(ctx);
  }
  /** @param {ExtensionContext} ctx @returns {boolean} */
  function expectedModel(ctx) {
    if (!authority?.model || !ctx.model) return true;
    return ctx.model.provider === authority.model.provider && ctx.model.id === authority.model.id;
  }
  function waiting() { return !authority || authority.phase !== 'running' || !!report || repairsExhausted === authority.leaseId; }

  pi.registerTool({
    name: 'pair_report', label: 'Pair report', executionMode: 'sequential',
    description: 'Submit a question, immutable-review checkpoint, blocker, or final review to Main. This yields the implementation lease. Call alone and stop after it succeeds.',
    promptSnippet: 'Report to Main and yield the current Pair step.',
    parameters: reportSchema,
    /** @returns {Promise<ReportToolResult>} */
    async execute(_callId, input, _signal, _update, ctx) {
      return runSerial(reportSerial, /** @returns {Promise<ReportToolResult>} */ async () => {
        await load();
        assert(authority && authority.phase === 'running', 'PAIR_WAIT: this step is not authorized');
        assert(repairsExhausted !== authority.leaseId, 'PAIR_WAIT: the report repair limit for this step was reached; stop and wait for Main');
        const lease = authority.leaseId;
        try { return await submitReport(input, ctx); }
        catch (error) { if (!/^PAIR_(WAIT|DETACHED_EFFECT)/.test(error instanceof Error ? error.message : String(error))) rejectedReport(lease, ctx); throw error; }
      });
    }
  });
  /** @param {string} lease @param {ExtensionContext} ctx */
  function rejectedReport(lease, ctx) {
    const count = (reportRejections.get(lease) || 0) + 1;
    reportRejections.clear(); reportRejections.set(lease, count);
    const limits = authority?.task?.limits;
    const allowed = limits && 'maxAutomaticReportRepairs' in limits && typeof limits.maxAutomaticReportRepairs === 'number' ? limits.maxAutomaticReportRepairs : 1;
    if (count <= allowed) return;
    repairsExhausted = lease;
    ctx.ui.notify(`Pair: the worker's report was rejected ${count} times (repair limit ${allowed}); the worker stopped and the task is held.`, 'warning');
    ctx.abort();
  }
  /** @param {unknown} input @param {ExtensionContext} ctx @returns {Promise<ReportToolResult>} */
  async function submitReport(input, ctx) {
    const params = validateReport(input);
    assert(authority && authority.phase === 'running', 'PAIR_WAIT: this step is not authorized');
    assert(!detachedEffect, 'PAIR_DETACHED_EFFECT: a shell job, agent, actor or other Fabric effect outlived its call; this worker must stop and reconcile before reporting.');
    const task = authority.task;
    assertReportSize(params, task?.policy.summaryDetail, task?.limits);
    assert(task && params.taskId === task.id && params.stepId === task.steps[task.stepIndex].id, 'Report task/step does not match the current lease');
    if (report) {
      /** @type {import('./contracts.js').ReportEnvelope} */
      const retained = report;
      assert(retained.payloadHash === digest(params), 'A different report already closed this lease');
      await publishReport(retained);
      await telemetry(ctx, true);
      ctx.ui.notify(`fabric-pair:report:${retained.reportId}`, 'info');
      return { content: [{ type: 'text', text: `Report ${retained.reportId} already submitted. Stop and wait.` }], details: { pairReportId: retained.reportId }, terminate: true };
    }
    if (task.policy.mode === 'final-only') assert(params.kind !== 'checkpoint', 'Final-only policy requires final_review after the whole plan, or a question/blocker.');
    if (params.kind === 'final_review') assert(task.policy.mode === 'final-only' || task.stepIndex === task.steps.length - 1, 'Not authorized to finish later steps');
    const result = validateReportEnvelope({ version: PROTOCOL, reportId: uid('report'), workerId, ownerSession, ownerEpoch, workerGeneration, nonce,
      sessionId: ctx.sessionManager.getSessionId(), leaseId: authority.leaseId, attemptId: task.attemptId, attemptNumber: task.attemptNumber, planRevision: task.planRevision,
      payload: params, payloadHash: digest(params), createdAt: Date.now() });
    report = result;
    await atomicJSON(latchFile, validateLatch({ ownerEpoch, workerGeneration, leaseId: authority.leaseId, attemptId: task.attemptId, report: result }));
    await publishReport(result);
    await telemetry(ctx, true);
    ctx.ui.notify(`fabric-pair:report:${result.reportId}`, 'info');
    // `terminate` ends the run after this result (Fabric carries it out of a program that returns it);
    // the controller aborts only a run that has not settled shortly after accepting the report.
    return { content: [{ type: 'text', text: `Report ${result.reportId} recorded. Do not call more tools. Yield and wait for Main in this session.` }], details: { pairReportId: result.reportId }, terminate: true };
  }
  pi.registerCommand('pair-bridge', {
    description: 'Internal Pair worker control (not a model instruction).',
    async handler(args, ctx) {
      const operation = args.trim();
      assert(['probe', 'load'].includes(operation), 'Unsupported Pair bridge command');
      await probe(ctx);
    }
  });
  pi.on('session_start', async (_event, ctx) => {
    ctxRef = ctx; stopped = parentDead; lastUsage = null; speed = null; speedStart = null;
    if (parentDead) { ctx.abort(); ctx.shutdown(); return; }
    await mkdirPrivate(dir); await load(); await probe(ctx);
    clearInterval(parentTimer);
    const parentPid = Number(env.PI_FABRIC_PAIR_PARENT_PID);
    if (!hadIpc && Number.isInteger(parentPid) && parentPid > 1) {
      parentTimer = setInterval(() => {
        try { process.kill(parentPid, 0); } catch (e) { if (hasErrorCode(e, 'ESRCH')) parentGone(); }
      }, 2000); parentTimer.unref?.();
    }
  });
  /** The worker's guide, worded once from Fabric's tool placement so the system prompt stays byte-stable. @type {string | undefined} */
  let workerGuide;
  pi.on('before_agent_start', async (event, ctx) => {
    ctxRef = ctx;
    try {
      await load();
      if (stopped) { ctx.abort(); return undefined; }
      assert(!waiting() && authority && authority.task, 'PAIR_WAIT: the worker is retained but has no active implementation lease');
      assert(expectedModel(ctx), 'Worker model changed outside Pair. Stop and reconcile its selected model.');
    } catch (error) { ctx.abort(); throw error; }
    ensureCacheLifetime(ctx.model, signedIn(ctx.modelRegistry, ctx.model));
    workerGuide ??= workerGuideFor(WORKER_CALLS[pairToolRoute(toolPlacement(pi, ['pair_report']), 'pair_report', (pi.getAllTools?.() || []).some(t => t.name === 'fabric_exec'))]);
    return { systemPrompt: `${event.systemPrompt}\n\n${workerGuide}`, message: {
      customType: 'fabric-pair.task-state', content: statePacket(authority, report, workOrder), display: false,
      details: { ownerEpoch, workerGeneration, leaseId: authority.leaseId, attemptId: authority.task.attemptId, planRevision: authority.task.planRevision }
    } };
  });
  pi.on('turn_start', async (_event, ctx) => {
    ctxRef = ctx;
    try { await load(); } catch (error) { ctx.abort(); throw error; } // unreadable/invalid authority never runs a turn
    if (stopped || waiting() || !expectedModel(ctx)) ctx.abort(); // catches automatic/Fovea continuations too
    await telemetry(ctx);
  });
  pi.on('tool_call', async (event, ctx) => {
    ctxRef = ctx; await load();
    assert(authority, 'PAIR_WAIT: no implementation lease is active');
    if (stopped) { ctx.abort(); return { block: true, reason: 'PAIR_WAIT: parent controller is gone; retained worker is stopping' }; }
    const blocked = gateTool(event.toolName, authority, !!report || repairsExhausted === authority.leaseId, !!authority.readOnly);
    if (blocked) { if (waiting()) ctx.abort(); return blocked; }
    if (!expectedModel(ctx)) { ctx.abort(); return { block: true, reason: 'Pair worker model changed unexpectedly' }; }
    const detaching = detachingProgramCalls(event.toolName, event.input);
    if (detaching.length) return { block: true, reason: `Pair workers cannot call ${detaching.join(', ')}: each leaves work running or changes shared state after the call. Do this step's work directly in this session.` };
    const refused = refusedProgramReason(event.toolName, event.input);
    if (refused) return { block: true, reason: refused };
    const n = toolName(event.toolName);
    if (/^(bash|powershell)$/.test(n)) {
      const policy = await nativeSettings(ctx.cwd, ctx.isProjectTrusted?.() === true, env);
      if (policy.fabricShellHangMs !== 0) return { block: true, reason: 'UNSUPPORTED_PROFILE: Fabric executor.shellHangMs must remain 0 for Pair shell calls.' };
    }
    if (requestsDetachedEffect(n, event.input)) return { block: true, reason: 'Pair does not permit detached/background shell work. Run a bounded foreground command and wait for its result before reporting.' };
    if (isDirectMutation(n)) {
      const input = event.input;
      const target = input !== null && typeof input === 'object'
        ? ('path' in input ? input.path : undefined) || ('file_path' in input ? input.file_path : undefined)
        : undefined;
      if (typeof target === 'string') {
        const absolute = path.resolve(ctx.cwd, target);
        if (!inside(authority.repoRoot || ctx.cwd, absolute)) return { block: true, reason: 'Direct write is outside this Pair workspace' };
        let existing = absolute;
        for (;;) {
          try { const real = await fs.realpath(existing); if (!inside(authority.repoRoot || ctx.cwd, real)) return { block: true, reason: 'Direct write follows a symlink outside this Pair workspace' }; break; }
          catch (e) { if (!hasErrorCode(e, 'ENOENT')) throw e; const parent = path.dirname(existing); if (parent === existing) break; existing = parent; }
        }
      }
    }
    return undefined;
  });
  pi.on('tool_result', async (event, ctx) => {
    const details = event.details;
    if (event.isError) return undefined;
    /** @type {number | null} */ let pid = null;
    let text;
    if (detachedProviderEffect(event.toolName, details)) {
      text = `PAIR_DETACHED_EFFECT: Fabric ${event.toolName} ${detachedEffectDescription(event.toolName)}. Pair workers cannot leave work running or change shared state past a call; the worker is shutting down so the human can reconcile.`;
    } else if (report && providerFileWrite(event.toolName, details)) {
      text = `PAIR_DETACHED_EFFECT: Fabric ${event.toolName} wrote files after pair_report closed the lease. The worker is shutting down so the human can reconcile the checkpoint.`;
    } else if (/^(bash|powershell)$/.test(toolName(event.toolName)) && details !== null && typeof details === 'object' && 'running' in details && details.running === true) {
      pid = 'pid' in details && typeof details.pid === 'number' && Number.isInteger(details.pid) ? details.pid : null;
      text = 'PAIR_DETACHED_EFFECT: the shell call is still running. The worker is shutting down so Main can reconcile without publishing a moving checkpoint.';
    } else return undefined;
    detachedEffect = { toolCallId: event.toolCallId, toolName: event.toolName, pid, detectedAt: Date.now() };
    await telemetry(ctx, true); ctx.abort();
    setTimeout(() => ctx.shutdown(), 0);
    return { isError: true, content: [{ type: 'text', text }], details: event.details };
  });
  pi.on('tool_execution_start', async (event, ctx) => { currentTool = event.toolName; currentTarget = toolTarget(event.toolName, event.args, ctx.cwd); await telemetry(ctx); });
  pi.on('tool_execution_end', async (_event, ctx) => { currentTool = null; currentTarget = null; await telemetry(ctx); });
  pi.on('message_start', async event => {
    if (event.message?.role === 'assistant') speedStart = performance.now();
  });
  pi.on('message_end', async (event, ctx) => {
    if (event.message?.role === 'assistant') {
      speed = addSpeedSample(speed, speedStart, performance.now(), event.message.usage);
      speedStart = null;
    }
    if (event.message?.role === 'assistant' && event.message.usage) { lastUsage = selectLastMeasuredUsage(lastUsage, event.message.usage); await telemetry(ctx); }
  });
  pi.on('session_before_compact', async (_event, ctx) => { compacting = true; speedStart = null; await telemetry(ctx); });
  /** The task state sent after the last compaction, until the queued copy is in the model's context. @type {string | null} */
  let restored = null;
  pi.on('session_compact', async (_event, ctx) => {
    compacting = false; await load();
    restored = statePacket(authority, report, workOrder, true);
    pi.sendMessage({ customType: 'fabric-pair.task-state', content: restored, display: false }, { triggerTurn: false });
    await telemetry(ctx);
  });
  // Pi compacts inside a run before the next model request and holds the message above until that
  // turn ends, while Fabric's summary can cut the current work order short. Until the queued copy
  // lands, add the task state to each request so the first response after compaction has it.
  pi.on('context', event => {
    const packet = restored;
    if (packet === null) return undefined;
    if (event.messages.some(m => m.role === 'custom' && m.customType === 'fabric-pair.task-state' && m.content === packet)) { restored = null; return undefined; }
    return { messages: [...event.messages, { role: 'custom', customType: 'fabric-pair.task-state', content: packet, display: false, timestamp: Date.now() }] };
  });
  pi.on('session_compact_failed', async (_event, ctx) => { compacting = false; await telemetry(ctx); });
  pi.on('agent_before_settle', async (_event, ctx) => { if (waiting()) ctx.abort(); });
  // Fires only when the user's native cacheWarming mode allows idle refreshes; Pair never changes that setting.
  pi.on('cache_warming_decision', async (event, ctx) => {
    if (stopped) return undefined;
    try { await load(); } catch { return undefined; }
    const awaitingMain = authority?.phase === 'waiting' && !!authority.task && !!report && report.payload.kind !== 'final_review';
    const action = awaitingMain ? reviewWarmingAction(event, ctx.model, lastUsage?.totalInput, signedIn(ctx.modelRegistry, ctx.model)) : undefined;
    return action ? { action } : undefined;
  });
  pi.on('agent_settled', async (_event, ctx) => { currentTool = null; currentTarget = null; await telemetry(ctx); });
  pi.on('model_select', async (_event, ctx) => { speed = null; speedStart = null; await telemetry(ctx); });
  pi.on('session_shutdown', async () => {
    stopped = true; clearInterval(parentTimer); process.removeListener('disconnect', parentGone); await reportSerial.drain(); await telemetrySerial.drain();
  });
  return { load, probe, getState: () => ({ authority, report }) };
}

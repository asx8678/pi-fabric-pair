import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicJSON, assert, bounded, digest, inside, mkdirPrivate, plain, PROTOCOL, readJSON, safeId, Serial, uid } from './util.js';
import { assertReportSize, reportSchema, validateReport } from './schema.js';
import { validateAuthority, validateLatch, validateReportEnvelope } from './contracts.js';
import { gateTool, isDirectMutation, nativeSettings, probeNative, requestsDetachedEffect, toolName } from './native.js';
import { addSpeedSample, selectLastMeasuredUsage } from './metrics.js';
import { ScopedCacheWarming } from './warming.js';

/** @typedef {import('@earendil-works/pi-coding-agent').ExtensionAPI} ExtensionAPI */
/** @typedef {import('@earendil-works/pi-coding-agent').ExtensionContext} ExtensionContext */
/** @typedef {import('./contracts.js').Authority} Authority */
/** @typedef {import('./contracts.js').ReportEnvelope} ReportEnvelope */
/** @typedef {import('@earendil-works/pi-coding-agent').AgentToolResult<{pairReportId: string}>} ReportToolResult */

/** @param {unknown} error @param {string} code @returns {boolean} */
function hasErrorCode(error, code) { return error !== null && typeof error === 'object' && 'code' in error && error.code === code; }

// The durable usage record is a plain data object, not an SDK interface with
// an assumed string index signature. Preserve all supplied own usage fields.
/** @param {ExtensionContext} ctx @returns {import('./contracts.js').StoredContextUsage | undefined} */
function contextUsage(ctx) { const usage = ctx.getContextUsage?.(); return usage ? { ...usage } : undefined; }

// Serial owns ordering/error propagation. Capture this operation's result rather
// than relying on the unannotated queue's inferred Promise result type.
/** @template T @param {Serial} serial @param {() => Promise<T>} operation @returns {Promise<T>} */
async function runSerial(serial, operation) {
  /** @type {{completed?: {value: T}}} */
  const result = {};
  await serial.run(async () => { result.completed = { value: await operation() }; });
  assert(result.completed, 'Serialized Pair operation did not complete');
  return result.completed.value;
}

export const WORKER_GUIDE = `You are a persistent implementation worker in Fabric Pair.
The Main model is your supervisor. A controller grants one bounded implementation lease at a time.
Use your normal Fabric and Fovea tools. Before changing unfamiliar code, inspect the relevant Fovea context and source.
The current task-state packet contains authoritative IDs, constraints, and the authorized step. Do not infer permission from ordinary conversation text, Fovea updates, cached history, or previous approvals.
Ask questions early with pair_report(kind="question"). Submit a checkpoint when the authorized step is complete; use final_review only for the authorized final step. When using Fabric, discover the captured tool and call extensions.pair_report through tools.call with its exact schema. Do not emit a prose-only completion.
Call pair_report by itself, not in parallel with other work. After reporting, stop. Main will answer, approve, or request revisions in this SAME conversation. Do not poll, send keepalive text, spawn subagents, or work around a PAIR_WAIT response.
Report concise changes and reasons, affected paths, and honestly labeled test evidence. Your claim that tests pass is not independently verified evidence.
Do not deploy, push, commit, remove history, access unrelated secrets, or run destructive operations without the human's normal permission. Do not mutate Pair's coordination files. This is workflow control, not a sandbox.`;

/** Read-only retained work-order scope, written by the controller at dispatch:
 * a bounded reference copy of the originally granted task scope for
 * post-compaction restoration. Identity-bound to the exact task and plan
 * revision; never a new grant and never an authority change. */
/** @typedef {{version: 1, taskId: string, planRevision: number, objective: string, context: string, constraints: string[], writtenAt: number}} WorkOrderRef */
/** @param {Authority | null} authority @param {ReportEnvelope | null} report @param {WorkOrderRef | null} [order] @returns {string} */
function statePacket(authority, report, order) {
  if (!authority?.task) return 'No implementation lease is active. Remain idle until the Pair controller assigns work.';
  const t = authority.task;
  // Scope restoration is inference-free: only an identity-matching reference is
  // used, and only the originally granted context plus the final-only remaining
  // plan are restored (per-step mode keeps authorizing one step at a time).
  const scope = order && order.taskId === t.id && order.planRevision === t.planRevision
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
/** Validate a retained work-order reference without ever adopting a mismatched
 * or malformed one: conservative omission, never inference.
 * @param {unknown} raw @returns {WorkOrderRef | null} */
function validateWorkOrder(raw) {
  if (raw === null || !plain(raw)) return null;
  const { version, taskId, planRevision, objective, context, constraints, writtenAt } = raw;
  if (version !== 1 || typeof taskId !== 'string' || typeof objective !== 'string' || typeof context !== 'string') return null;
  if (typeof planRevision !== 'number' || !Number.isInteger(planRevision) || planRevision < 1) return null;
  if (!Array.isArray(constraints) || !constraints.every(entry => typeof entry === 'string')) return null;
  return { version: 1, taskId, planRevision, objective, context, constraints, writtenAt: typeof writtenAt === 'number' ? writtenAt : 0 };
}

/** Worker role: public Pi hooks + a private local outbox; it never starts children.
 * @param {ExtensionAPI} pi @param {NodeJS.ProcessEnv} [env] */
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
  /** @type {WorkOrderRef | null} Read-only retained scope reference; null when absent/mismatched. */
  let workOrder = null;
  /** @type {ReportEnvelope | null} */
  let report = null;
  /** @type {string | null} */
  let currentTool = null;
  /** Display sample: the last measured request. Retained with its original
   * observedAt across compaction and model changes (a new session starts from
   * unknown); only a real measurement, including a 0% miss, replaces it. */
  /** @type {import('./observations.js').UsageObservation | null} */
  let lastUsage = null;
  /** Measured average streaming throughput for this worker session and model:
   * summed provider-reported output tokens over summed message_start→message_end
   * seconds. Pi emits message_start only once the provider response begins
   * streaming, so pre-response request/prefill latency is excluded; tool
   * execution and idle gaps are never counted. Cleared at session/model
   * boundaries so different sessions or models are never mixed. */
  /** @type {{tokens: number, seconds: number} | null} */
  let speed = null;
  /** @type {number | null} Monotonic message_start mark of the pending assistant response. */
  let speedStart = null;
  const warming = new ScopedCacheWarming();
  let warmingSession = '', warmingBinding = 0, warmingCheck = 0;
  const releaseWarming = () => { warmingCheck++; warming.release(); };
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let parentTimer;
  let compacting = false, stopped = false;
  const hadIpc = process.connected !== undefined;
  let parentDead = false;
  const parentGone = () => {
    if (parentDead) return;
    parentDead = true; stopped = true; releaseWarming(); ctxRef?.abort(); ctxRef?.shutdown();
  };
  if (process.connected === false) parentGone();
  if (process.channel) {
    process.channel.unref?.();
    process.once('disconnect', parentGone);
  }
  /** @type {import('./contracts.js').StoredDetachedEffectV1 | null} */
  let detachedEffect = null;

  /** @param {Authority} current @param {ExtensionContext | undefined} ctx */
  function applyWarming(current, ctx) {
    warmingCheck++; // a newer authority load fences an older asynchronous decision read
    const requested = !!(ctx && !stopped && !parentDead && !compacting && !detachedEffect && warmingSession === ctx.sessionManager.getSessionId()
      && current.cacheWarming === 'active' && current.task && ['running', 'waiting'].includes(current.phase)
      && ctx.model?.provider === current.model.provider && ctx.model?.id === current.model.id);
    warming.reconcile(ctx, requested, String(warmingBinding));
  }
  /** Fresh authority, not telemetry or a retained report, decides Pair eligibility.
   * @param {ExtensionContext} ctx
   */
  async function reconcileWarming(ctx) {
    const check = ++warmingCheck;
    if (stopped || parentDead || warmingSession !== ctx.sessionManager.getSessionId()) { warming.release(); return; }
    try {
      const fresh = validateAuthority(await readJSON(gateFile, null), { ownerSession, ownerEpoch, workerId, workerGeneration });
      if (check !== warmingCheck || stopped || parentDead) return;
      applyWarming(fresh, ctx);
    } catch (error) {
      if (check === warmingCheck) { warming.release(); warming.observation.error = `Warming authority unavailable: ${String(error).slice(0, 1000)}`; }
    }
  }
  /** @returns {Promise<Authority>} */
  async function load() {
    const warmingRead = ++warmingCheck;
    try {
    const next = validateAuthority(await readJSON(gateFile, null), { ownerSession, ownerEpoch, workerId, workerGeneration });
    authority = next;
    // Read-only scope reference; absence, mismatch or a malformed file is
    // conservative omission and must never weaken authority-file validation
    // or break the hook. Raw invalid JSON is omitted, not fatal.
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
    if (warmingRead === warmingCheck) applyWarming(next, ctxRef);
    return next;
    } catch (error) { releaseWarming(); throw error; }
  }
  /** Check fresh authority without replacing the retained report. @param {import('./contracts.js').ReportEnvelope} retained @returns {Promise<void>} */
  async function assertReportAuthority(retained) {
    /** @type {import('./contracts.js').Authority} */
    const current = validateAuthority(await readJSON(gateFile, null), { ownerSession, ownerEpoch, workerId, workerGeneration });
    assert(current.phase === 'running', 'PAIR_WAIT: this step is not authorized');
    assert(!detachedEffect, 'PAIR_DETACHED_EFFECT: a shell job outlived its Fabric call; this worker must stop and reconcile before reporting.');
    assert(retained.ownerSession === ownerSession && retained.ownerEpoch === ownerEpoch && retained.workerId === workerId && retained.workerGeneration === workerGeneration && retained.nonce === nonce, 'Report producer mismatch');
    assert(current.task && retained.leaseId === current.leaseId && retained.attemptId === current.attemptId && retained.attemptNumber === current.task.attemptNumber && retained.planRevision === current.task.planRevision && retained.payload.taskId === current.task.id && retained.payload.stepId === current.task.steps[current.task.stepIndex].id, 'PAIR_WAIT: report authority was superseded');
  }
  /** Publish only complete retained bytes, never replacing an occupied inbox name. @param {import('./contracts.js').ReportEnvelope} retained @returns {Promise<void>} */
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
        // Compare every envelope field, including original-order V1 payload bytes;
        // JSON whitespace / envelope key ordering do not change record identity.
        assert(Object.entries(retained).every(([key, value]) => JSON.stringify(Reflect.get(existing, key)) === JSON.stringify(value)), `Conflicting immutable report at ${inboxFile}; retained report remains in ${latchFile}`);
      }
    } finally { await fs.unlink(staged).catch(() => {}); }
  }
  /** @param {ExtensionContext | undefined} [ctx] @returns {Promise<void>} */
  async function telemetry(ctx = ctxRef) {
    if (!ctx || stopped) return;
    await telemetrySerial.run(async () => {
      /** @type {import('./contracts.js').StoredTelemetryV1} */
      const packet = {
        version: PROTOCOL, nonce, ownerSession, ownerEpoch, workerId, workerGeneration, pid: process.pid, sessionId: ctx.sessionManager.getSessionId(),
        context: contextUsage(ctx) || null, currentTool, lastUsage, compacting, detachedEffect, warming: warming.snapshot(), speed,
        phase: report ? 'waiting' : authority?.phase || 'idle', model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : null,
        at: Date.now()
      };
      await atomicJSON(path.join(dir, 'telemetry.json'), packet);
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
    // Truthful live launch-environment observation: report exactly the mesh root
    // this worker process inherited, even when a launcher dropped or replaced it.
    // Environment readback is not a proof of Fabric store health or an OS sandbox.
    const meshRoot = process.env.PI_FABRIC_MESH_ROOT ?? null;
    await atomicJSON(path.join(dir, 'probe.json'), { ...status, meshRoot, nonce, workerId, ownerSession, ownerEpoch, workerGeneration });
    await telemetry(ctx);
  }
  /** @param {ExtensionContext} ctx @returns {boolean} */
  function expectedModel(ctx) {
    if (!authority?.model || !ctx.model) return true;
    return ctx.model.provider === authority.model.provider && ctx.model.id === authority.model.id;
  }
  function waiting() { return !authority || authority.phase !== 'running' || !!report; }

  pi.registerTool({
    name: 'pair_report', label: 'Pair report', executionMode: 'sequential',
    description: 'Submit a question, immutable-review checkpoint, blocker, or final review to Main. This yields the implementation lease. Call alone and stop after it succeeds.',
    promptSnippet: 'Report to Main and yield the current Pair step.',
    parameters: reportSchema,
    /** @returns {Promise<ReportToolResult>} */
    async execute(_callId, input, _signal, _update, ctx) {
      return runSerial(reportSerial, /** @returns {Promise<ReportToolResult>} */ async () => {
        const params = validateReport(input); await load();
        assert(authority && authority.phase === 'running', 'PAIR_WAIT: this step is not authorized');
        assert(!detachedEffect, 'PAIR_DETACHED_EFFECT: a shell job outlived its Fabric call; this worker must stop and reconcile before reporting.');
        const task = authority.task;
        assertReportSize(params, task?.policy.summaryDetail);
        assert(task && params.taskId === task.id && params.stepId === task.steps[task.stepIndex].id, 'Report task/step does not match the current lease');
        if (report) {
          /** @type {import('./contracts.js').ReportEnvelope} */
          const retained = report;
          assert(retained.payloadHash === digest(params), 'A different report already closed this lease');
          await publishReport(retained);
          await telemetry(ctx);
          // Publication is not a controller acknowledgement; this only wakes Main.
          ctx.ui.notify(`fabric-pair:report:${retained.reportId}`, 'info');
          ctx.abort();
          return { content: [{ type: 'text', text: `Report ${retained.reportId} already submitted. Stop and wait.` }], details: { pairReportId: retained.reportId }, terminate: true };
        }
        if (task.policy.mode === 'final-only') assert(params.kind !== 'checkpoint', 'Final-only policy requires final_review after the whole plan, or a question/blocker.');
        if (params.kind === 'final_review') assert(task.policy.mode === 'final-only' || task.stepIndex === task.steps.length - 1, 'Not authorized to finish later steps');
        const result = validateReportEnvelope({ version: PROTOCOL, reportId: uid('report'), workerId, ownerSession, ownerEpoch, workerGeneration, nonce,
          sessionId: ctx.sessionManager.getSessionId(), leaseId: authority.leaseId, attemptId: task.attemptId, attemptNumber: task.attemptNumber, planRevision: task.planRevision,
          payload: params, payloadHash: digest(params), createdAt: Date.now() });
        // Latch before exposing the report, so sibling/nested tool hooks see the stop immediately.
        report = result;
        await atomicJSON(latchFile, validateLatch({ ownerEpoch, workerGeneration, leaseId: authority.leaseId, attemptId: task.attemptId, report: result }));
        await publishReport(result);
        await telemetry(ctx);
        // This is a notification wakeup, not a model message or an acknowledgement channel.
        ctx.ui.notify(`fabric-pair:report:${result.reportId}`, 'info');
        // A captured pair_report can be nested inside fabric_exec. Abort the outer
        // invocation as well as returning terminate so no later provider call runs.
        ctx.abort();
        return { content: [{ type: 'text', text: `Report ${result.reportId} recorded. Do not call more tools. Yield and wait for Main in this session.` }], details: { pairReportId: result.reportId }, terminate: true };
      });
    }
  });
  // AR-02: probe/load are extension commands only. Neither may request a model turn.
  // V1 telemetry below remains diagnostic; PiRuntime's RPC tool-ID map owns lifecycle/idle eligibility.
  pi.registerCommand('pair-bridge', {
    description: 'Internal Pair worker control (not a model instruction).',
    async handler(args, ctx) {
      const operation = args.trim();
      assert(['probe', 'load'].includes(operation), 'Unsupported Pair bridge command');
      await probe(ctx);
    }
  });
  pi.on('session_start', async (_event, ctx) => {
    releaseWarming(); warmingSession = ctx.sessionManager.getSessionId(); warmingBinding++;
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
  // Pi only logs a throwing handler and continues the turn, so every failure here
  // must abort explicitly rather than rely on the throw to stop a paid request.
  pi.on('before_agent_start', async (event, ctx) => {
    ctxRef = ctx;
    try {
      await load();
      if (stopped) { ctx.abort(); return undefined; }
      assert(!waiting() && authority && authority.task, 'PAIR_WAIT: the worker is retained but has no active implementation lease');
      assert(expectedModel(ctx), 'Worker model changed outside Pair. Stop and reconcile its selected model.');
    } catch (error) { ctx.abort(); throw error; }
    return { systemPrompt: `${event.systemPrompt}\n\n${WORKER_GUIDE}`, message: {
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
    const blocked = gateTool(event.toolName, authority, !!report, !!authority.readOnly);
    if (blocked) { if (waiting()) ctx.abort(); return blocked; }
    if (!expectedModel(ctx)) { ctx.abort(); return { block: true, reason: 'Pair worker model changed unexpectedly' }; }
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
    if (!/^(bash|powershell)$/.test(toolName(event.toolName)) || event.isError || details === null || typeof details !== 'object' || !('running' in details) || details.running !== true) return undefined;
    const pid = 'pid' in details && typeof details.pid === 'number' && Number.isInteger(details.pid) ? details.pid : null;
    detachedEffect = { toolCallId: event.toolCallId, toolName: event.toolName, pid, detectedAt: Date.now() };
    await telemetry(ctx); ctx.abort();
    // This is a last-resort fail-closed path if policy changed during a run. It
    // prevents a checkpoint but does not claim the spilled OS process was killed.
    setTimeout(() => ctx.shutdown(), 0);
    return { isError: true, content: [{ type: 'text', text: 'PAIR_DETACHED_EFFECT: the shell call is still running. The worker is shutting down so Main can reconcile without publishing a moving checkpoint.' }], details: event.details };
  });
  pi.on('tool_execution_start', async (event, ctx) => { currentTool = event.toolName; await telemetry(ctx); });
  pi.on('tool_execution_end', async (_event, ctx) => { currentTool = null; await telemetry(ctx); });
  pi.on('message_start', async event => {
    // A start whose end never arrives (aborted/incomplete generation) is discarded by the next start.
    if (event.message?.role === 'assistant') speedStart = performance.now();
  });
  pi.on('message_end', async (event, ctx) => {
    if (event.message?.role === 'assistant') {
      speed = addSpeedSample(speed, speedStart, performance.now(), event.message.usage);
      speedStart = null;
    }
    if (event.message?.role === 'assistant' && event.message.usage) { lastUsage = selectLastMeasuredUsage(lastUsage, event.message.usage); await telemetry(ctx); }
  });
  pi.on('cache_warming_decision', async (_event, ctx) => {
    await reconcileWarming(ctx); await telemetry(ctx);
    // Never override native economics with warm, nor stop another owner's lease.
    // Native validates the effective mode again after this awaited hook.
  });
  pi.on('session_before_compact', async (_event, ctx) => { compacting = true; releaseWarming(); speedStart = null; await telemetry(ctx); });
  pi.on('session_compact', async (_event, ctx) => {
    compacting = false; await load();
    // Restore bounded coordination state, not the transcript; never trigger a paid turn just to restore state.
    pi.sendMessage({ customType: 'fabric-pair.task-state', content: statePacket(authority, report, workOrder), display: false }, { deliverAs: 'nextTurn', triggerTurn: false });
    await telemetry(ctx);
  });
  pi.on('session_compact_failed', async (_event, ctx) => { compacting = false; await reconcileWarming(ctx); await telemetry(ctx); });
  pi.on('agent_before_settle', async (_event, ctx) => { if (waiting()) ctx.abort(); });
  pi.on('agent_settled', async (_event, ctx) => { currentTool = null; await reconcileWarming(ctx); await telemetry(ctx); });
  pi.on('model_select', async (_event, ctx) => { releaseWarming(); speed = null; speedStart = null; await reconcileWarming(ctx); await telemetry(ctx); });
  pi.on('session_shutdown', async () => {
    stopped = true; releaseWarming(); clearInterval(parentTimer); process.removeListener('disconnect', parentGone); await reportSerial.drain(); await telemetrySerial.drain();
  });
  return { load, probe, getState: () => ({ authority, report }) };
}

import { validateTaskPolicy, validateTaskLimits, validateReportEnvelope } from './contracts.js';

/**
 * Internal, non-authorizing view of ONE existing assignment/attempt. Not a disk or
 * wire format, migration adapter, trust boundary, or second source of truth.
 * Controller owns assignment/fence/holds; later trusted storage, effect, accounting
 * and Main consumers must supply observations. Matching source tags authenticate
 * nothing. Canonical workspace/repository bindings must be supplied, not resolved here.
 * History references are opaque retention references, never execution evidence.
 * No task replacement, grant rotation, obligation resolution or slot release exists.
 */

/** @typedef {import('./contracts.js').TaskPolicy} TaskPolicy */
/** @typedef {import('./contracts.js').TaskLimits} TaskLimits */
/** @typedef {import('./contracts.js').LegacyTaskPolicy} LegacyTaskPolicy */
/** @typedef {import('./contracts.js').LegacyTaskLimits} LegacyTaskLimits */
/** @typedef {import('./contracts.js').Step} Step */
/** @typedef {import('./contracts.js').VerificationPolicy} VerificationPolicy */
/** @typedef {import('./contracts.js').ReportEnvelope} ReportEnvelope */
/** @typedef {{workspace: string, repoRoot: string, ownerSession: string, ownerEpoch: number, workerId: string, workerGeneration: number, sessionId: string, nonce: string}} Fence */
/** @typedef {{fence: Fence, taskId: string, planRevision: number, attemptId: string, attemptNumber: number, leaseId: string}} Identity */
/** @typedef {{observationId: string, at: number}} Witness */
/** @typedef {'disabled' | 'stopped' | 'paused' | 'stale-owner' | 'legacy' | 'budget' | 'unknown-accounting' | 'uncertain-effect' | 'uncertain-delivery' | 'unsupported'} HoldReason */
/** @typedef {{costUsd: number | null, outputTokens: number | null, activeMs: number | null, turns: number | null, revisions: number | null, reports: number | null}} SpendingValues */
/** @typedef {(SpendingValues & {kind: 'unknown'}) | ({kind: 'complete', source: 'trusted-accounting', observation: Witness, costUsd: number, outputTokens: number, activeMs: number, turns: number, revisions: number, reports: number})} Spending */
/** @typedef {{kind: 'current', identity: Identity, status: 'assigned' | 'active' | 'waiting' | 'cancelled', steps: Step[], stepIndex: number, policy: TaskPolicy, limits: TaskLimits, verification: VerificationPolicy, spending: Spending, pending: ReportEnvelope | null, historyRefs: string[]}} CurrentTask */
/** @typedef {{kind: 'question' | 'blocked' | 'checkpoint' | 'final_review', reportId: string | null, reportRef: string}} LegacyObligation */
/** @typedef {{kind: 'legacy-held', taskId: string | null, identity: Identity | null, status: 'held' | 'cancelled', policy: LegacyTaskPolicy | null, limits: LegacyTaskLimits | null, spending: SpendingValues & {kind: 'unknown'}, pending: LegacyObligation | null, historyRefs: string[]}} LegacyTask */
/** @typedef {Witness & {source: 'storage'}} CommitObservation */
/** @typedef {Witness & {source: 'authority-publication'}} PublicationObservation */
/** @typedef {{at: number, reason: HoldReason | 'report' | 'cancelled'}} Closure */
/** @typedef {{operationId: string, identity: Identity, preparedAt: number}} GrantBase */
/** @typedef {{phase: 'none'} | (GrantBase & ({phase: 'prepared', commit: null, publication: null, closure: null} | {phase: 'committed', commit: CommitObservation, publication: null, closure: null} | {phase: 'open', commit: CommitObservation, publication: PublicationObservation, closure: null} | {phase: 'closed', commit: CommitObservation | null, publication: PublicationObservation | null, closure: Closure}))} Grant */
/** @typedef {Witness & ({stage: 'sent', source: 'rpc-send'} | {stage: 'accepted', source: 'rpc-ack'} | {stage: 'started', source: 'worker-observation'} | {stage: 'settled', source: 'effect-settlement'})} WorkerObservation */
/** @typedef {{operationId: string, stage: 'prepared' | 'sent' | 'accepted' | 'started' | 'settled', observations: WorkerObservation[]}} WorkerDelivery */
/** @typedef {Witness & ({stage: 'notified', source: 'main-notification'} | {stage: 'observed', source: 'main-observation'})} MainObservation */
/** @typedef {{noticeId: string, reportId: string, queuedAt: number, stage: 'queued' | 'notified' | 'observed', observations: MainObservation[]}} MainDelivery */
/** @typedef {{source: 'worker-runtime', sequence: number, at: number, status: 'unknown' | 'idle' | 'busy' | 'stopped'}} RuntimeObservation */
/** @typedef {{source: 'user-command', sequence: number, at: number, command: 'stop' | 'disable' | 'pause' | 'start' | 'enable' | 'resume' | 'cancel'}} ControlObservation */
/** @typedef {Witness & {source: 'storage' | 'rpc' | 'effect-boundary' | 'main-notification', operationId: string, message: string}} Failure */
/** @typedef {{mode: 'internal-non-authorizing', fence: Fence, task: CurrentTask | LegacyTask, grant: Grant, holds: HoldReason[], control: ControlObservation | null, runtime: RuntimeObservation | null, workerDelivery: WorkerDelivery | null, mainDelivery: MainDelivery | null, failures: Failure[]}} CoordinationModel */
/** @typedef {{fence: Fence, at: number}} EventBase */
/** @typedef {EventBase & ({kind: 'prepare-grant', source: 'controller-assignment', operationId: string} | {kind: 'grant-committed', source: 'storage', operationId: string, leaseId: string, observationId: string} | {kind: 'authority-published', source: 'authority-publication', operationId: string, leaseId: string, observationId: string} | {kind: 'lifecycle', source: 'user-command', sequence: number, command: 'stop' | 'disable' | 'pause' | 'start' | 'enable' | 'resume' | 'cancel'} | {kind: 'owner-replaced', source: 'ownership', next: Fence} | {kind: 'report', source: 'worker-report', report: ReportEnvelope, noticeId: string} | {kind: 'runtime', observation: RuntimeObservation} | {kind: 'worker-delivery', operationId: string, observation: WorkerObservation} | {kind: 'main-delivery', noticeId: string, reportId: string, observation: MainObservation} | {kind: 'failure', failure: Failure} | {kind: 'unsupported', source: 'controller', family: 'dispatch' | 'continuation' | 'checkpoint' | 'decision' | 'notice-resolution' | 'reset' | 'usage' | 'counter' | 'policy-amendment' | 'reconciliation'})} TransitionEvent */
/** @typedef {'prepared' | 'committed' | 'published' | 'lifecycle' | 'fenced' | 'report-retained' | 'observed' | 'duplicate' | 'admission-held' | 'uncertain' | 'unsupported-family' | 'closed-lease' | 'invalid-input' | 'identity-conflict' | 'operation-conflict' | 'observation-conflict' | 'out-of-order' | 'report-conflict'} TransitionReason */
/** @typedef {{kind: 'apply' | 'noop' | 'hold', nonAuthorizing: true, reason: TransitionReason, model: CoordinationModel} | {kind: 'reject', nonAuthorizing: true, reason: TransitionReason}} TransitionResult */

const FENCE_KEYS = ['workspace', 'repoRoot', 'ownerSession', 'ownerEpoch', 'workerId', 'workerGeneration', 'sessionId', 'nonce'];
/** @type {readonly HoldReason[]} */
const HOLDS = ['disabled', 'stopped', 'paused', 'stale-owner', 'legacy', 'budget', 'unknown-accounting', 'uncertain-effect', 'uncertain-delivery', 'unsupported'];
const SPENDING_KEYS = ['costUsd', 'outputTokens', 'activeMs', 'turns', 'revisions', 'reports'];

/** @param {unknown} condition @param {string} message @returns {asserts condition} */
function check(condition, message) { if (!condition) throw new Error(message); }
/** @param {unknown} value @returns {asserts value is Record<string, unknown>} */
function assertRecord(value) { check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected record'); }
/** All listed keys are required; unknown keys are corruption, not defaults. @param {unknown} value @param {readonly string[]} keys */
function record(value, keys) {
  assertRecord(value);
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, 'Inherited record schema is unsupported');
  check(Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'Unexpected or missing record keys');
  return value;
}
/** @param {unknown} value @returns {unknown[]} */
function list(value) {
  check(Array.isArray(value), 'Expected array');
  /** @type {unknown[]} */
  const result = [];
  for (let index = 0; index < value.length; index++) {
    check(Object.hasOwn(value, index), 'Sparse or inherited array slot');
    result.push(value[index]);
  }
  return result;
}
/** @param {unknown} value @param {number} [max] */
function text(value, max = 10000) { check(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'Invalid text'); return value; }
/** @param {unknown} value @param {number} [min] */
function integer(value, min = 0) { check(typeof value === 'number' && Number.isSafeInteger(value) && value >= min, 'Invalid safe integer'); return value; }
/** @param {unknown} value */
function amount(value) { check(typeof value === 'number' && Number.isFinite(value) && value >= 0, 'Invalid amount'); return value; }
/** @template {string} T @param {unknown} value @param {readonly T[]} options @returns {T} */
function choice(value, options) { const result = options.find(option => option === value); check(result !== undefined, 'Invalid discriminant'); return result; }
/** @param {unknown} value */
function token(value) { const result = text(value, 128); check(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result) && !Object.hasOwn(Object.prototype, result) && result !== 'prototype', 'Invalid token'); return result; }
/** @param {unknown} value */
function id(value) { const result = token(value); check(result.length <= 80, 'Invalid ID'); return result; }
/** @param {unknown} value @returns {Fence} */
function fence(value) {
  const v = record(value, FENCE_KEYS);
  return { workspace: text(v.workspace), repoRoot: text(v.repoRoot), ownerSession: text(v.ownerSession), ownerEpoch: integer(v.ownerEpoch, 1), workerId: id(v.workerId), workerGeneration: integer(v.workerGeneration, 1), sessionId: text(v.sessionId), nonce: text(v.nonce) };
}
/** @param {unknown} value @returns {Identity} */
function identity(value) {
  const v = record(value, ['fence', 'taskId', 'planRevision', 'attemptId', 'attemptNumber', 'leaseId']);
  return { fence: fence(v.fence), taskId: id(v.taskId), planRevision: integer(v.planRevision, 1), attemptId: id(v.attemptId), attemptNumber: integer(v.attemptNumber, 1), leaseId: token(v.leaseId) };
}
/** @param {unknown} value @returns {Witness} */
function witness(value) { const v = record(value, ['observationId', 'at']); return { observationId: id(v.observationId), at: integer(v.at) }; }
/** @param {Record<string, unknown>} value @returns {Witness} */
function witnessFields(value) { return witness({ observationId: value.observationId, at: value.at }); }
/** @param {unknown} value @returns {Spending} */
function spending(value) {
  assertRecord(value);
  const kind = choice(value.kind, ['unknown', 'complete']);
  const v = record(value, ['kind', ...SPENDING_KEYS, ...(kind === 'complete' ? ['source', 'observation'] : [])]);
  const costUsd = v.costUsd === null ? null : amount(v.costUsd);
  const outputTokens = v.outputTokens === null ? null : integer(v.outputTokens);
  const activeMs = v.activeMs === null ? null : integer(v.activeMs);
  const turns = v.turns === null ? null : integer(v.turns);
  const revisions = v.revisions === null ? null : integer(v.revisions);
  const reports = v.reports === null ? null : integer(v.reports);
  if (kind === 'unknown') return { kind, costUsd, outputTokens, activeMs, turns, revisions, reports };
  check(costUsd !== null && outputTokens !== null && activeMs !== null && turns !== null && revisions !== null && reports !== null, 'Incomplete spending');
  return { kind, source: choice(v.source, ['trusted-accounting']), observation: witness(v.observation), costUsd, outputTokens, activeMs, turns, revisions, reports };
}
/** @param {unknown} value @returns {Step} */
function step(value) {
  assertRecord(value);
  const v = record(value, ['id', 'title', 'instructions', ...('acceptance' in value ? ['acceptance'] : [])]);
  const result = { id: id(v.id), title: text(v.title, 200), instructions: text(v.instructions, 24000) };
  return Object.hasOwn(v, 'acceptance') ? { ...result, acceptance: list(v.acceptance).map(entry => text(entry, 2000)) } : result;
}
/** @param {unknown} value @returns {VerificationPolicy} */
function verification(value) {
  const v = record(value, ['commands', 'requirePassing', 'timeoutMs']);
  check(typeof v.requirePassing === 'boolean', 'Invalid verification requirement');
  const commands = list(v.commands).map(entry => {
    const command = record(entry, ['name', 'command', 'args']);
    const args = list(command.args).map(arg => { check(typeof arg === 'string' && arg.length <= 10000, 'Invalid command argument'); return arg; });
    check(args.length <= 256, 'Too many command arguments');
    return { name: text(command.name, 1000), command: text(command.command), args };
  });
  check(commands.length <= 12, 'Too many verification commands');
  return { commands, requirePassing: v.requirePassing, timeoutMs: integer(v.timeoutMs, 1) };
}
/** @param {unknown} value @returns {CurrentTask | LegacyTask} */
function task(value) {
  assertRecord(value);
  const kind = choice(value.kind, ['current', 'legacy-held']);
  const common = ['kind', 'identity', 'status', 'policy', 'limits', 'spending', 'pending', 'historyRefs'];
  const v = record(value, [...common, ...(kind === 'current' ? ['steps', 'stepIndex', 'verification'] : ['taskId'])]);
  const historyRefs = list(v.historyRefs).map(entry => text(entry));
  check(new Set(historyRefs).size === historyRefs.length, 'Duplicate history reference');
  const spent = spending(v.spending);
  if (kind === 'legacy-held') {
    check(historyRefs.length > 0 && spent.kind === 'unknown', 'Legacy needs retained history and uncertain accounting');
    const historicalIdentity = v.identity === null ? null : identity(v.identity);
    const taskId = v.taskId === null ? null : id(v.taskId);
    check(!historicalIdentity || historicalIdentity.taskId === taskId, 'Legacy task identity mismatch');
    let pending = null;
    if (v.pending !== null) {
      const p = record(v.pending, ['kind', 'reportId', 'reportRef']);
      pending = { kind: choice(p.kind, ['question', 'blocked', 'checkpoint', 'final_review']), reportId: p.reportId === null ? null : id(p.reportId), reportRef: text(p.reportRef) };
    }
    return { kind, taskId, identity: historicalIdentity, status: choice(v.status, ['held', 'cancelled']), policy: v.policy === null ? null : validateTaskPolicy(v.policy, 'legacy.policy', { legacy: true }), limits: v.limits === null ? null : validateTaskLimits(v.limits, 'legacy.limits', { legacy: true }), spending: spent, pending, historyRefs };
  }
  const steps = list(v.steps).map(step), stepIndex = integer(v.stepIndex);
  check(steps.length >= 1 && steps.length <= 32 && new Set(steps.map(s => s.id)).size === steps.length && stepIndex < steps.length, 'Invalid plan');
  return { kind, identity: identity(v.identity), status: choice(v.status, ['assigned', 'active', 'waiting', 'cancelled']), steps, stepIndex, policy: validateTaskPolicy(v.policy), limits: validateTaskLimits(v.limits), verification: verification(v.verification), spending: spent, pending: v.pending === null ? null : validateReportEnvelope(v.pending), historyRefs };
}
/** @param {unknown} value @returns {Grant} */
function grant(value) {
  assertRecord(value);
  const phase = choice(value.phase, ['none', 'prepared', 'committed', 'open', 'closed']);
  if (phase === 'none') { record(value, ['phase']); return { phase }; }
  const v = record(value, ['phase', 'operationId', 'identity', 'preparedAt', 'commit', 'publication', 'closure']);
  const base = { operationId: id(v.operationId), identity: identity(v.identity), preparedAt: integer(v.preparedAt) };
  let commit = null, publication = null;
  if (v.commit !== null) { const c = record(v.commit, ['source', 'observationId', 'at']); commit = { source: choice(c.source, ['storage']), ...witnessFields(c) }; check(commit.at >= base.preparedAt, 'Commit predates preparation'); }
  if (v.publication !== null) { const p = record(v.publication, ['source', 'observationId', 'at']); publication = { source: choice(p.source, ['authority-publication']), ...witnessFields(p) }; check(commit && publication.at >= commit.at, 'Publication without prior commit'); }
  if (phase === 'closed') {
    const c = record(v.closure, ['at', 'reason']);
    const closure = { at: integer(c.at), reason: choice(c.reason, [...HOLDS, 'report', 'cancelled']) };
    check(closure.at >= (publication?.at ?? commit?.at ?? base.preparedAt), 'Closure predates grant');
    return { ...base, phase, commit, publication, closure };
  }
  check(v.closure === null, 'Non-closed grant has closure');
  if (phase === 'prepared') { check(commit === null && publication === null, 'Prepared grant contains observations'); return { ...base, phase, commit, publication, closure: null }; }
  check(commit !== null, 'Missing commit');
  if (phase === 'committed') { check(publication === null, 'Committed grant already published'); return { ...base, phase, commit, publication, closure: null }; }
  check(publication !== null, 'Open grant missing publication');
  return { ...base, phase, commit, publication, closure: null };
}
/** @param {unknown} value @returns {WorkerObservation} */
function workerObservation(value) {
  const v = record(value, ['stage', 'source', 'observationId', 'at']), w = witnessFields(v);
  switch (choice(v.stage, ['sent', 'accepted', 'started', 'settled'])) {
    case 'sent': return { ...w, stage: 'sent', source: choice(v.source, ['rpc-send']) };
    case 'accepted': return { ...w, stage: 'accepted', source: choice(v.source, ['rpc-ack']) };
    case 'started': return { ...w, stage: 'started', source: choice(v.source, ['worker-observation']) };
    case 'settled': return { ...w, stage: 'settled', source: choice(v.source, ['effect-settlement']) };
  }
}
/** @param {unknown} value @returns {MainObservation} */
function mainObservation(value) {
  const v = record(value, ['stage', 'source', 'observationId', 'at']), w = witnessFields(v);
  if (v.stage === 'notified') return { ...w, stage: 'notified', source: choice(v.source, ['main-notification']) };
  return { ...w, stage: choice(v.stage, ['observed']), source: choice(v.source, ['main-observation']) };
}
/** @param {unknown} value @returns {RuntimeObservation} */
function runtime(value) {
  const v = record(value, ['source', 'status', 'sequence', 'at']);
  return { sequence: integer(v.sequence, 1), at: integer(v.at), source: choice(v.source, ['worker-runtime']), status: choice(v.status, ['unknown', 'idle', 'busy', 'stopped']) };
}
/** @param {unknown} value @returns {ControlObservation} */
function control(value) {
  const v = record(value, ['source', 'sequence', 'at', 'command']);
  return { source: choice(v.source, ['user-command']), sequence: integer(v.sequence, 1), at: integer(v.at), command: choice(v.command, ['stop', 'disable', 'pause', 'start', 'enable', 'resume', 'cancel']) };
}
/** @param {unknown} value @returns {Failure} */
function failure(value) {
  const v = record(value, ['source', 'operationId', 'message', 'observationId', 'at']);
  return { ...witnessFields(v), source: choice(v.source, ['storage', 'rpc', 'effect-boundary', 'main-notification']), operationId: id(v.operationId), message: text(v.message) };
}
/** @param {{stage: string, observationId: string, at: number}[]} observations @param {readonly string[]} stages @param {string} stage @param {number} since */
function ordered(observations, stages, stage, since) {
  check(observations.length === stages.indexOf(stage), 'Delivery stage lacks exact observation prefix');
  const ids = new Set();
  observations.forEach((o, i) => { check(o.stage === stages[i + 1] && o.at >= since && !ids.has(o.observationId), 'Conflicting or unordered delivery observation'); since = o.at; ids.add(o.observationId); });
}
/** @param {unknown} value @returns {WorkerDelivery} */
function workerDelivery(value) {
  const v = record(value, ['operationId', 'stage', 'observations']);
  return { operationId: id(v.operationId), stage: choice(v.stage, ['prepared', 'sent', 'accepted', 'started', 'settled']), observations: list(v.observations).map(workerObservation) };
}
/** @param {unknown} value @returns {MainDelivery} */
function mainDelivery(value) {
  const v = record(value, ['noticeId', 'reportId', 'queuedAt', 'stage', 'observations']);
  const result = { noticeId: id(v.noticeId), reportId: id(v.reportId), queuedAt: integer(v.queuedAt), stage: choice(v.stage, ['queued', 'notified', 'observed']), observations: list(v.observations).map(mainObservation) };
  ordered(result.observations, ['queued', 'notified', 'observed'], result.stage, result.queuedAt);
  return result;
}

/**
 * Throws on malformed shape or inconsistent records. Does NOT establish trusted
 * provenance, durable commit, canonical paths, settlement, or authorization.
 * Spending is a retained observation snapshot, NOT live post-grant accounting.
 * Partial historical identity/bytes belong to historyRefs; null stays unknown.
 * @param {unknown} value @returns {CoordinationModel}
 */
export function validateCoordinationModel(value) {
  const v = record(value, ['mode', 'fence', 'task', 'grant', 'holds', 'control', 'runtime', 'workerDelivery', 'mainDelivery', 'failures']);
  const model = { mode: choice(v.mode, ['internal-non-authorizing']), fence: fence(v.fence), task: task(v.task), grant: grant(v.grant), holds: list(v.holds).map(h => choice(h, HOLDS)), control: v.control === null ? null : control(v.control), runtime: v.runtime === null ? null : runtime(v.runtime), workerDelivery: v.workerDelivery === null ? null : workerDelivery(v.workerDelivery), mainDelivery: v.mainDelivery === null ? null : mainDelivery(v.mainDelivery), failures: list(v.failures).map(failure) };
  const { task: t, grant: g, holds, workerDelivery: w, mainDelivery: m } = model;
  check(new Set(holds).size === holds.length, 'Duplicate hold');
  if (model.control !== null) {
    const command = model.control.command;
    if (command === 'stop' || command === 'disable' || command === 'pause') {
      check(holds.includes(command === 'stop' ? 'stopped' : command === 'disable' ? 'disabled' : 'paused') && (g.phase === 'none' || g.phase === 'closed'), 'Control closure/hold mismatch');
    }
    if (command === 'enable') check(!holds.includes('disabled'), 'Enable retained disabled hold');
    if (command === 'start') check(!holds.includes('stopped'), 'Start retained stopped hold');
    if (command === 'cancel') check(t.status === 'cancelled', 'Cancellation intent lost');
    if (command === 'resume') check(holds.includes('unsupported') || (t.pending !== null && !holds.includes('paused')), 'Resume must restore wait or remain unsupported');
  }
  if (t.spending.kind === 'unknown') check(holds.includes('unknown-accounting'), 'Unknown accounting needs hold');
  if (t.kind === 'legacy-held') check(holds.includes('legacy') && g.phase === 'none' && w === null && m === null, 'Legacy cannot grant or imply current delivery');
  else {
    const a = t.identity.fence, b = model.fence;
    check(a.workspace === b.workspace && a.repoRoot === b.repoRoot && a.workerId === b.workerId && a.ownerEpoch <= b.ownerEpoch && a.workerGeneration <= b.workerGeneration && (a.ownerEpoch !== b.ownerEpoch || a.ownerSession === b.ownerSession) && (a.workerGeneration !== b.workerGeneration || (a.sessionId === b.sessionId && a.nonce === b.nonce)), 'Assignment is not an ancestor of current fence');
    const bound = JSON.stringify(a) === JSON.stringify(b);
    check(bound || holds.includes('stale-owner'), 'Stale assignment needs hold');
    if (g.phase !== 'none') check(JSON.stringify(g.identity) === JSON.stringify(t.identity), 'Grant/task mismatch');
    if (t.pending !== null) {
      const p = t.pending, i = t.identity, f = i.fence;
      check(p.workerId === f.workerId && p.ownerSession === f.ownerSession && p.ownerEpoch === f.ownerEpoch && p.workerGeneration === f.workerGeneration && p.nonce === f.nonce && p.sessionId === f.sessionId && p.leaseId === i.leaseId && p.attemptId === i.attemptId && p.attemptNumber === i.attemptNumber && p.planRevision === i.planRevision && p.payload.taskId === i.taskId && p.payload.stepId === t.steps[t.stepIndex].id, 'Pending report identity mismatch');
      check(t.policy.mode !== 'final-only' || p.payload.kind !== 'checkpoint', 'Final-only checkpoint');
      check(p.payload.kind !== 'final_review' || t.policy.mode === 'final-only' || t.stepIndex === t.steps.length - 1, 'Premature final review');
      check(g.phase === 'closed' && g.publication !== null && p.createdAt >= g.publication.at, 'Report needs published closed grant');
      check(m !== null && m.reportId === p.reportId && m.queuedAt >= p.createdAt && (t.status === 'waiting' || t.status === 'cancelled'), 'Pending obligation/notice mismatch');
    } else check(m === null && t.status !== 'waiting', 'Notice/wait without obligation');
    if (g.phase === 'closed') {
      check(g.closure.reason !== 'report' || t.pending !== null, 'Report closure lost obligation');
      check(g.closure.reason !== 'cancelled' || t.status === 'cancelled', 'Cancellation closure without intent');
      check(m === null || m.queuedAt >= g.closure.at, 'Notice predates closure');
    }
    if (t.status === 'cancelled') check(g.phase === 'none' || g.phase === 'closed', 'Cancelled task has admission');
    if (t.status === 'assigned') check(t.pending === null && (g.phase === 'none' || g.publication === null), 'Assigned task was published');
    if (t.status === 'active') check(t.pending === null && g.phase !== 'none' && g.publication !== null, 'Active task lacks publication');
  }
  if (g.phase === 'none') check(w === null, 'Delivery without grant');
  else {
    check(w !== null && w.operationId === g.operationId, 'Grant/delivery mismatch');
    ordered(w.observations, ['prepared', 'sent', 'accepted', 'started', 'settled'], w.stage, g.publication?.at ?? g.preparedAt);
    check(w.stage === 'prepared' || g.publication !== null, 'Delivery without publication');
    if (g.phase === 'closed' && w.observations.length) check(w.observations[0].at <= g.closure.at, 'Send occurred after closure');
    if (t.spending.kind === 'complete') check(t.spending.observation.at <= g.preparedAt, 'Spending snapshot postdates preparation');
    if (g.phase !== 'closed') check(t.kind === 'current' && holds.length === 0 && t.pending === null && t.status !== 'cancelled', 'Admission with hold/obligation');
    if (g.phase === 'open') check(t.kind === 'current' && t.status === 'active', 'Open grant not active');
    if (g.phase === 'closed' && g.publication !== null && w.stage !== 'settled') check(holds.includes('uncertain-effect'), 'Closed published grant needs effect hold');
  }
  const failureIds = new Set();
  for (const f of model.failures) {
    check(!failureIds.has(f.observationId), 'Duplicate failure observation'); failureIds.add(f.observationId);
    const main = f.source === 'main-notification';
    check(main ? m !== null && f.operationId === m.noticeId && f.at >= m.queuedAt : g.phase !== 'none' && f.operationId === g.operationId && f.at >= g.preparedAt, 'Failure operation mismatch');
    check(holds.includes(f.source === 'effect-boundary' ? 'uncertain-effect' : 'uncertain-delivery') && (g.phase === 'none' || g.phase === 'closed'), 'Failure without closure/hold');
  }
  return model;
}

/** Syntactic provenance only. Trusted callers, not tool payloads, must produce events. @param {unknown} value @returns {TransitionEvent} */
export function validateTransitionEvent(value) {
  assertRecord(value);
  const base = { fence: fence(value.fence), at: integer(value.at) };
  const common = ['kind', 'fence', 'at'];
  switch (choice(value.kind, ['prepare-grant', 'grant-committed', 'authority-published', 'lifecycle', 'owner-replaced', 'report', 'runtime', 'worker-delivery', 'main-delivery', 'failure', 'unsupported'])) {
    case 'prepare-grant': { const v = record(value, [...common, 'source', 'operationId']); return { ...base, kind: 'prepare-grant', source: choice(v.source, ['controller-assignment']), operationId: id(v.operationId) }; }
    case 'grant-committed': { const v = record(value, [...common, 'source', 'operationId', 'leaseId', 'observationId']); return { ...base, kind: 'grant-committed', source: choice(v.source, ['storage']), operationId: id(v.operationId), leaseId: token(v.leaseId), observationId: id(v.observationId) }; }
    case 'authority-published': { const v = record(value, [...common, 'source', 'operationId', 'leaseId', 'observationId']); return { ...base, kind: 'authority-published', source: choice(v.source, ['authority-publication']), operationId: id(v.operationId), leaseId: token(v.leaseId), observationId: id(v.observationId) }; }
    case 'lifecycle': { const v = record(value, [...common, 'source', 'sequence', 'command']); return { ...base, kind: 'lifecycle', ...control({ source: v.source, sequence: v.sequence, at: v.at, command: v.command }) }; }
    case 'owner-replaced': { const v = record(value, [...common, 'source', 'next']); return { ...base, kind: 'owner-replaced', source: choice(v.source, ['ownership']), next: fence(v.next) }; }
    case 'report': { const v = record(value, [...common, 'source', 'report', 'noticeId']); const report = validateReportEnvelope(v.report); check(base.at >= report.createdAt, 'Report received before creation'); return { ...base, kind: 'report', source: choice(v.source, ['worker-report']), report, noticeId: id(v.noticeId) }; }
    case 'runtime': { const v = record(value, [...common, 'observation']); const observation = runtime(v.observation); check(base.at === observation.at, 'Observation time mismatch'); return { ...base, kind: 'runtime', observation }; }
    case 'worker-delivery': { const v = record(value, [...common, 'operationId', 'observation']); const observation = workerObservation(v.observation); check(base.at === observation.at, 'Observation time mismatch'); return { ...base, kind: 'worker-delivery', operationId: id(v.operationId), observation }; }
    case 'main-delivery': { const v = record(value, [...common, 'noticeId', 'reportId', 'observation']); const observation = mainObservation(v.observation); check(base.at === observation.at, 'Observation time mismatch'); return { ...base, kind: 'main-delivery', noticeId: id(v.noticeId), reportId: id(v.reportId), observation }; }
    case 'failure': { const v = record(value, [...common, 'failure']); const f = failure(v.failure); check(base.at === f.at, 'Failure time mismatch'); return { ...base, kind: 'failure', failure: f }; }
    case 'unsupported': { const v = record(value, [...common, 'source', 'family']); return { ...base, kind: 'unsupported', source: choice(v.source, ['controller']), family: choice(v.family, ['dispatch', 'continuation', 'checkpoint', 'decision', 'notice-resolution', 'reset', 'usage', 'counter', 'policy-amendment', 'reconciliation']) }; }
  }
}

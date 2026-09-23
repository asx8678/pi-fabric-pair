import { validateCoordinationModel, validateTransitionEvent } from './coordination.js';

/** @typedef {import('./coordination.js').CoordinationModel} CoordinationModel */
/** @typedef {import('./coordination.js').TransitionEvent} TransitionEvent */
/** @typedef {import('./coordination.js').TransitionResult} TransitionResult */
/** @typedef {import('./coordination.js').TransitionReason} TransitionReason */
/** @typedef {import('./coordination.js').HoldReason} HoldReason */
/** @typedef {import('./coordination.js').Closure} Closure */
/** @typedef {import('./coordination.js').ReportEnvelope} ReportEnvelope */

/** Inputs have already been checked/constructed in fixed field order. @param {unknown} a @param {unknown} b */
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
/** Preserve payload serialization semantics while ignoring envelope key order. @param {ReportEnvelope} a @param {ReportEnvelope} b */
function sameReport(a, b) {
  return a.version === b.version && a.reportId === b.reportId && a.workerId === b.workerId && a.ownerSession === b.ownerSession && a.ownerEpoch === b.ownerEpoch && a.workerGeneration === b.workerGeneration && a.nonce === b.nonce && a.sessionId === b.sessionId && a.leaseId === b.leaseId && a.attemptId === b.attemptId && a.attemptNumber === b.attemptNumber && a.planRevision === b.planRevision && a.createdAt === b.createdAt && a.payloadHash === b.payloadHash && same(a.payload, b.payload);
}
/** @param {TransitionReason} reason @returns {TransitionResult} */
function reject(reason) { return { kind: 'reject', nonAuthorizing: true, reason }; }
/** Revalidate all constructed outcomes; no decision is an executable effect. @param {CoordinationModel} model @param {'apply' | 'noop' | 'hold'} kind @param {TransitionReason} reason @returns {TransitionResult} */
function result(model, kind, reason) { return { kind, nonAuthorizing: true, reason, model: validateCoordinationModel(model) }; }
/** @param {CoordinationModel} model @param {HoldReason} reason @returns {CoordinationModel} */
function addHold(model, reason) { return model.holds.includes(reason) ? model : { ...model, holds: [...model.holds, reason] }; }
/** @param {CoordinationModel} model @param {number} at @param {Closure['reason']} reason @returns {CoordinationModel} */
function close(model, at, reason) {
  const g = model.grant;
  /** @type {CoordinationModel} */
  let next = g.phase === 'none' || g.phase === 'closed' ? model : { ...model, grant: { ...g, phase: 'closed', closure: { at, reason } } };
  if (g.phase !== 'none' && g.publication !== null && model.workerDelivery?.stage !== 'settled') next = addHold(next, 'uncertain-effect');
  return next;
}
/** @param {CoordinationModel} model */
function grantTime(model) {
  const g = model.grant;
  return g.phase === 'none' ? 0 : Math.max(g.closure?.at ?? g.publication?.at ?? g.commit?.at ?? g.preparedAt, model.workerDelivery?.observations[0]?.at ?? 0);
}
/** This snapshot is only a lower bound after work; no accounting is inferred here. @param {import('./coordination.js').CurrentTask} t */
function exhausted(t) {
  const s = t.spending, l = t.limits;
  return (s.costUsd !== null && l.maxReportedCostUsd !== null && s.costUsd >= l.maxReportedCostUsd)
    || (s.outputTokens !== null && l.maxOutputTokens !== null && s.outputTokens >= l.maxOutputTokens)
    || (s.activeMs !== null && s.activeMs >= Math.min(l.taskTimeoutMs, l.activeStepTimeoutMs))
    || (s.turns !== null && s.turns >= l.maxTurnsPerStep)
    || (s.reports !== null && s.reports >= l.maxReportsPerTask);
}

/**
 * Pure single-attempt coordination decisions. Malformed inputs reject; validation
 * cannot authenticate issuers. Prepared/committed/open are MODEL states, never
 * permission to publish authority or execute. No clocks, IDs, callbacks or I/O.
 *
 * Supported: grant preparation/commit/publication; lifecycle holds and cancellation
 * intent; ownership fencing; one hash-checked pending report; independent witnessed
 * Worker stages and Main notified/observed stages; runtime and failure observations.
 *
 * Unsupported events close/hold, never approximate success: dispatch creation,
 * continuation/new leases, checkpoint/decision/notice resolution, reset, accounting
 * updates, amendments, reconciliation. Settlement bookkeeping alone cannot finalize
 * a report or release occupancy. Uncertainty is sticky until future reconciliation.
 * Spending, policy, verification, plan and retained history are never rewritten.
 * Control/runtime sequences are independently monotonic within a fence. Delivery
 * witness IDs are scoped to their channel; failure IDs to the retained assignment.
 * Exact duplicate events are inert; older control/runtime sequences reject.
 * @param {unknown} snapshot @param {unknown} input @returns {TransitionResult}
 */
export function reduceCoordination(snapshot, input) {
  let model, event;
  try { model = validateCoordinationModel(snapshot); event = validateTransitionEvent(input); }
  catch { return reject('invalid-input'); }
  return transition(model, event);
}

/** @param {CoordinationModel} model @param {TransitionEvent} event @returns {TransitionResult} */
function transition(model, event) {
  if (!same(model.fence, event.fence)) return reject('identity-conflict');
  const t = model.task, g = model.grant;
  switch (event.kind) {
    case 'prepare-grant': {
      if (g.phase !== 'none') {
        if (g.operationId !== event.operationId) return reject('operation-conflict');
        if (g.preparedAt !== event.at) return reject('observation-conflict');
        return result(model, g.phase === 'closed' ? 'hold' : 'noop', g.phase === 'closed' ? 'closed-lease' : 'duplicate');
      }
      if (t.kind !== 'current' || !same(t.identity.fence, model.fence)) return result(model, 'hold', 'admission-held');
      if (t.status !== 'assigned' || t.pending !== null || model.holds.length) return result(model, 'hold', 'admission-held');
      if (t.spending.kind !== 'complete' || t.spending.observation.at > event.at || (model.control !== null && event.at < model.control.at)) return reject('out-of-order');
      if (exhausted(t)) return result(addHold(model, 'budget'), 'hold', 'admission-held');
      return result({ ...model, grant: { phase: 'prepared', operationId: event.operationId, identity: t.identity, preparedAt: event.at, commit: null, publication: null, closure: null }, workerDelivery: { operationId: event.operationId, stage: 'prepared', observations: [] } }, 'apply', 'prepared');
    }
    case 'grant-committed':
    case 'authority-published': {
      if (g.phase === 'none' || g.operationId !== event.operationId || g.identity.leaseId !== event.leaseId) return reject('operation-conflict');
      if (t.kind !== 'current' || !same(t.identity.fence, model.fence)) return reject('identity-conflict');
      const old = event.kind === 'grant-committed' ? g.commit : g.publication;
      const observation = { source: event.source, observationId: event.observationId, at: event.at };
      if (old !== null) return same(old, observation) ? result(model, 'noop', 'duplicate') : reject('observation-conflict');
      if (g.phase === 'closed') return result(model, 'hold', 'closed-lease');
      if (model.holds.length) return result(model, 'hold', 'admission-held');
      if (event.at < grantTime(model)) return reject('out-of-order');
      if (event.kind === 'grant-committed') {
        if (g.phase !== 'prepared') return reject('out-of-order');
        return result({ ...model, grant: { ...g, phase: 'committed', commit: { source: 'storage', observationId: event.observationId, at: event.at } } }, 'apply', 'committed');
      }
      if (g.phase !== 'committed') return reject('out-of-order');
      return result({ ...model, task: { ...t, status: 'active' }, grant: { ...g, phase: 'open', publication: { source: 'authority-publication', observationId: event.observationId, at: event.at } } }, 'apply', 'published');
    }
    case 'lifecycle': {
      const control = { source: event.source, sequence: event.sequence, at: event.at, command: event.command };
      if (model.control?.sequence === event.sequence) return same(model.control, control) ? result(model, 'noop', 'duplicate') : reject('observation-conflict');
      if (event.at < grantTime(model) || (model.control !== null && (event.sequence < model.control.sequence || event.at < model.control.at))) return reject('out-of-order');
      model = { ...model, control };
      if (event.command === 'enable' || event.command === 'start') {
        const remove = event.command === 'enable' ? 'disabled' : 'stopped';
        const next = { ...model, holds: model.holds.filter(h => h !== remove) };
        return result(next, 'apply', 'lifecycle');
      }
      if (event.command === 'resume') {
        // Removing pause restores only an existing wait; never another prompt.
        if (t.pending === null) return result(addHold(close(model, event.at, 'unsupported'), 'unsupported'), 'hold', 'unsupported-family');
        const next = { ...model, holds: model.holds.filter(h => h !== 'paused') };
        return result(next, next.holds.length ? 'hold' : 'apply', 'admission-held');
      }
      if (event.command === 'cancel') return result({ ...close(model, event.at, 'cancelled'), task: { ...t, status: 'cancelled' } }, 'apply', 'lifecycle');
      const reason = event.command === 'stop' ? 'stopped' : event.command === 'disable' ? 'disabled' : 'paused';
      const next = addHold(close(model, event.at, reason), reason);
      return result(next, 'apply', 'lifecycle');
    }
    case 'owner-replaced': {
      const a = model.fence, b = event.next;
      if (same(a, b)) return result(model, 'noop', 'duplicate');
      if (event.at < grantTime(model)) return reject('out-of-order');
      if (a.workspace !== b.workspace || a.repoRoot !== b.repoRoot || a.workerId !== b.workerId || b.ownerEpoch < a.ownerEpoch || b.workerGeneration < a.workerGeneration || (b.ownerEpoch === a.ownerEpoch && b.ownerSession !== a.ownerSession) || (b.workerGeneration === a.workerGeneration && (b.sessionId !== a.sessionId || b.nonce !== a.nonce)) || (b.ownerEpoch === a.ownerEpoch && b.workerGeneration === a.workerGeneration)) return reject('identity-conflict');
      return result({ ...addHold(close(model, event.at, 'stale-owner'), 'stale-owner'), fence: b, control: null, runtime: null }, 'apply', 'fenced');
    }
    case 'report': {
      if (t.kind !== 'current' || !same(t.identity.fence, model.fence)) return reject('identity-conflict');
      if (t.pending !== null) return sameReport(t.pending, event.report) && model.mainDelivery?.noticeId === event.noticeId ? result(model, 'noop', 'duplicate') : reject('report-conflict');
      if (g.phase === 'none' || g.publication === null) return reject('out-of-order');
      if (event.at < grantTime(model) || event.report.createdAt < g.publication.at) return reject('out-of-order');
      // Full envelope identity/scope/hash checks belong to the aggregate validator.
      // Retain even a matching late report after pause/cancel; do not reopen its lease.
      /** @type {CoordinationModel} */
      const next = { ...close(model, event.at, 'report'), task: { ...t, status: t.status === 'cancelled' ? 'cancelled' : 'waiting', pending: event.report }, mainDelivery: { noticeId: event.noticeId, reportId: event.report.reportId, queuedAt: event.at, stage: 'queued', observations: [] } };
      try { return result(next, 'apply', 'report-retained'); }
      catch { return reject('report-conflict'); }
    }
    case 'runtime': {
      const old = model.runtime;
      if (old?.sequence === event.observation.sequence) return same(old, event.observation) ? result(model, 'noop', 'duplicate') : reject('observation-conflict');
      if (old && (event.observation.sequence < old.sequence || event.at < old.at)) return reject('out-of-order');
      // Idle/stopped are observations only, never effect-settlement evidence.
      return result({ ...model, runtime: event.observation }, 'apply', 'observed');
    }
    case 'worker-delivery': {
      const w = model.workerDelivery, o = event.observation;
      if (!w || g.phase === 'none' || w.operationId !== event.operationId) return reject('operation-conflict');
      const old = w.observations.find(entry => entry.stage === o.stage || entry.observationId === o.observationId);
      if (old) return same(old, o) ? result(model, 'noop', 'duplicate') : reject('observation-conflict');
      const stages = ['prepared', 'sent', 'accepted', 'started', 'settled'];
      if (stages.indexOf(o.stage) !== stages.indexOf(w.stage) + 1 || g.publication === null || o.at < (w.observations.at(-1)?.at ?? g.publication.at)) return reject('out-of-order');
      // No new send after closure. ACK/start/settlement can refine an already-sent
      // operation after closure, without changing task/holds/runtime/admission.
      if (o.stage === 'sent' && g.phase !== 'open') return result(model, 'hold', 'closed-lease');
      return result({ ...model, workerDelivery: { ...w, stage: o.stage, observations: [...w.observations, o] } }, 'apply', 'observed');
    }
    case 'main-delivery': {
      const m = model.mainDelivery, o = event.observation;
      if (!m || m.noticeId !== event.noticeId || m.reportId !== event.reportId) return reject('operation-conflict');
      const old = m.observations.find(entry => entry.stage === o.stage || entry.observationId === o.observationId);
      if (old) return same(old, o) ? result(model, 'noop', 'duplicate') : reject('observation-conflict');
      const stages = ['queued', 'notified', 'observed'];
      if (stages.indexOf(o.stage) !== stages.indexOf(m.stage) + 1 || o.at < (m.observations.at(-1)?.at ?? m.queuedAt)) return reject('out-of-order');
      return result({ ...model, mainDelivery: { ...m, stage: o.stage, observations: [...m.observations, o] } }, 'apply', 'observed');
    }
    case 'failure': {
      const f = event.failure;
      const old = model.failures.find(entry => entry.observationId === f.observationId);
      if (old) return same(old, f) ? result(model, 'noop', 'duplicate') : reject('observation-conflict');
      if (f.source === 'main-notification' ? !model.mainDelivery || f.operationId !== model.mainDelivery.noticeId || f.at < model.mainDelivery.queuedAt : g.phase === 'none' || g.operationId !== f.operationId) return reject('operation-conflict');
      if (f.at < grantTime(model)) return reject('out-of-order');
      const reason = f.source === 'effect-boundary' ? 'uncertain-effect' : 'uncertain-delivery';
      return result({ ...addHold(close(model, f.at, reason), reason), failures: [...model.failures, f] }, 'hold', 'uncertain');
    }
    case 'unsupported': {
      if (event.at < grantTime(model)) return reject('out-of-order');
      return result(addHold(close(model, event.at, 'unsupported'), 'unsupported'), 'hold', 'unsupported-family');
    }
  }
  return unreachable(event);
}
/** Compile-time exhaustiveness, not a permissive fallback. @param {never} event @returns {never} */
function unreachable(event) { throw new Error(`Unreachable event: ${String(event)}`); }

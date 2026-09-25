import { CoordinationValidationError, validateCoordinationModel, validateTransitionEvent, validateCoordinationModelInContext, validateTransitionEventInContext, appendCoordinationModelInContext } from './coordination.js';
import { requireValidationContext } from './actor-contract-common.js';

/**
 * Pure, internal non-authorizing workflow transition facade. The closed event union
 * and deterministic journal fold live with model validation so every returned model
 * revalidates the same historical rules, rather than trusting mutable projections.
 *
 * Bounded modeled coverage: committed dispatch and fresh continuation grants;
 * independent prompt/notice facts; effect barriers, finalization and inspection;
 * immutable decisions; accounting/counters, amendments, reconciliation and archived
 * live-slot reset. Unsafe forms remain explicit unsupported holds. No execution,
 * provenance authentication, clocks, IDs, callbacks, filesystem or policy copy-in.
 * The journal is workflow-lifetime retention, not a persistence adapter. Closure is
 * absorbing; replay never implies command acceptance, effect settlement or consent.
 */

/** @typedef {import('./coordination.js').CoordinationModel} CoordinationModel */
/** @typedef {import('./coordination.js').TransitionEvent} TransitionEvent */
/** @typedef {import('./coordination.js').TransitionResult} TransitionResult */
/** @typedef {import('./coordination.js').TransitionReason} TransitionReason */
/** @typedef {import('./actor-contract-common.js').ValidationContext} ValidationContext */

/** Internal mandatory-context reducer. Only expected kernel conflicts are adapted;
 * structured common errors (especially capacity) propagate to the aggregate, and
 * programming errors escape. Validate registration outside both catch boundaries
 * and before inspecting either input. Returned views are genuine deeply immutable
 * kernel results in this context; no redundant reparse or caller cache authority.
 * @param {unknown} snapshot @param {unknown} input @param {ValidationContext} context @returns {TransitionResult}
 */
export function reduceCoordinationInContext(snapshot,input,context) {
  requireValidationContext(context);
  let model, event;
  try { model = validateCoordinationModelInContext(snapshot,context); event = validateTransitionEventInContext(input,context); }
  catch (error) {
    if (!(error instanceof CoordinationValidationError)) throw error;
    return Object.freeze({kind:'reject',nonAuthorizing:true,reason:'invalid-input'});
  }
  try {
    const next = appendCoordinationModelInContext(model,event,context), outcome = next.outcome;
    return Object.freeze({kind:outcome.kind,nonAuthorizing:true,reason:outcome.reason,model:outcome.kind === 'noop' ? model : next});
  } catch (error) {
    if (!(error instanceof CoordinationValidationError)) throw error;
    return Object.freeze({kind:'reject',nonAuthorizing:true,reason:'operation-conflict'});
  }
}

/** Always revalidate returned snapshots, including inert/stale/duplicate outcomes.
 * @param {CoordinationModel} model @param {'apply'|'noop'|'hold'} kind @param {TransitionReason} reason @returns {TransitionResult}
 */
function result(model,kind,reason) { return {kind,nonAuthorizing:true,reason,model:validateCoordinationModel(model)}; }

/**
 * Validate, tentatively append, then validate the full historical projection.
 * A failed append is rejected atomically. Applied duplicates and raw stale-owner
 * facts leave the model unchanged. Exact capacity/evidence-held proposals may be
 * re-evaluated after prerequisites change, without changing their retained content.
 * Only expected validation/conflict errors become rejections; programming errors
 * escape. No receipts/counters/leases are allocated by an inert duplicate.
 * No reduce result is an effect capability. Executor revalidation remains external.
 * @param {unknown} snapshot @param {unknown} input @returns {TransitionResult}
 */
export function reduceCoordination(snapshot,input) {
  let model, event;
  try { model = validateCoordinationModel(snapshot); event = validateTransitionEvent(input); }
  catch (error) {
    if (!(error instanceof CoordinationValidationError)) throw error;
    return {kind:'reject',nonAuthorizing:true,reason:'invalid-input'};
  }
  try {
    const next = validateCoordinationModel({mode:model.mode,genesis:model.genesis,events:[...model.events,event]});
    const outcome = next.outcome;
    return result(outcome.kind === 'noop' ? model : next,outcome.kind,outcome.reason);
  } catch (error) {
    if (!(error instanceof CoordinationValidationError)) throw error;
    return {kind:'reject',nonAuthorizing:true,reason:'operation-conflict'};
  }
}

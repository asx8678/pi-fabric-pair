// Staged pure model (AR-03/H1). Not imported by the live Main/Worker path; see docs/ACTOR-RPC-IMPLEMENTATION-PLAN.md.
/**
 * Private AR-03 Config V3 leaf adapter. Pure, non-authorizing and acyclic.
 *
 * Thin executable wrapper over the accepted `ar3-common-abi/2` closed
 * constructor. Acceptance is a configuration preview only: no filesystem,
 * clock, identity, RPC, native profile or Apply. All normalization, defaults,
 * legacy/actor-pair profiling and alias reconciliation live in the frozen
 * common constructor. Aggregate composition must call
 * `validateActorConfigV3InContext(value, itsOwnContext)` directly so a single
 * registered operation context covers the whole aggregate; this one-argument
 * wrapper is only for a standalone config leaf and creates exactly one context.
 *
 * @module actor-config-contracts
 */
import {
  createValidationContext,
  validateActorConfigV3InContext,
} from './actor-contract-common.js';

/** @typedef {import('./actor-contract-common.js').ActorConfigV3} ActorConfigV3 */
/** @typedef {import('./actor-contract-common.js').LegacyActorConfigV3} LegacyActorConfigV3 */
/** @typedef {import('./actor-contract-common.js').ActorPairActorConfigV3} ActorPairActorConfigV3 */
/** @typedef {import('./actor-contract-common.js').RuntimeConfigV3} RuntimeConfigV3 */
/** @typedef {import('./actor-contract-common.js').SafetyPolicyV3} SafetyPolicyV3 */
/** @typedef {import('./actor-contract-common.js').MailboxLimitsV3} MailboxLimitsV3 */
/** @typedef {import('./actor-contract-common.js').WorkflowConfigV3} WorkflowConfigV3 */
/** @typedef {import('./actor-contract-common.js').LegacyWorkerV3} LegacyWorkerV3 */
/** @typedef {import('./actor-contract-common.js').ActorConfigMode} ActorConfigMode */
/** @typedef {import('./actor-contract-common.js').IndicatorV3} IndicatorV3 */
/** @typedef {import('./actor-contract-common.js').ActorCapacityV3} ActorCapacityV3 */
/** @typedef {import('./actor-contract-common.js').ActorIdlePolicyV3} ActorIdlePolicyV3 */
/** @typedef {import('./actor-contract-common.js').TaskPolicy} ConfigTaskPolicy */
/** @typedef {import('./actor-contract-common.js').TaskLimits} ConfigTaskLimits */
/** @typedef {import('./actor-contract-common.js').VerificationPolicy} ConfigVerification */
/** @typedef {import('./actor-contract-common.js').EvidenceLimits} ConfigEvidence */
/** @typedef {import('./actor-contract-common.js').WorkerRequirements} ConfigWorkerRequirements */
/** @typedef {import('./actor-contract-common.js').WorkerResources} ConfigWorkerResources */
/** @typedef {import('./actor-contract-common.js').SupervisorResources} ConfigSupervisorResources */

/** @param {unknown} value @returns {ActorConfigV3} */
export function validateActorConfigV3(value) {
  return validateActorConfigV3InContext(value, createValidationContext());
}

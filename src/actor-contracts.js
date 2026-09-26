// Staged pure model (AR-03/H1). Not imported by the live Main/Worker path; see docs/ACTOR-RPC-IMPLEMENTATION-PLAN.md.
/**
 * Pure AR-03 leaf-contract facade; no runtime registration or activation.
 * These validators establish intrinsic shape/hash consistency, not readiness,
 * provenance, permissions or aggregate historical-prefix validity.
 *
 * Actor control requires the caller's explicit expected binding. Aggregate
 * replay belongs to actor-model; its operation budgets use private common
 * context-aware helpers, not repeated standalone config validation.
 */
export { validateActorConfigV3 } from './actor-config-contracts.js';
export {
  validateActorRecordV2,
  validateWorkflowRecordV2,
  validateActivationRecordV2,
} from './actor-record-contracts.js';
export {
  validateMailboxEnvelopeV2,
  validateActorControlV2,
} from './actor-wire-contracts.js';

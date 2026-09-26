// Staged pure model (AR-03/H1). Not imported by the live Main/Worker path; see docs/ACTOR-RPC-IMPLEMENTATION-PLAN.md.
/**
 * AR3-T08 canonical actor/workflow composition (pure, non-authorizing).
 *
 * Owns the five agreed aggregate exports only. Composes the accepted leaf
 * contracts (actor-contract-common / actor-migration-contracts) and the accepted
 * implementation kernel (coordination.js / transitions.js). It does NOT create a
 * second implementation reducer, ActorHost, runtime observer, timer, queue pump or
 * policy copy-in, and is not imported by any runtime module.
 *
 * Canonical root is one ActorStateV2 (version 2, encoding pair-actor-state/1):
 * genesis + consecutive event journal + archiveHead. Actor-domain events are a
 * closed union; implementation-domain events carry an already-closed kernel
 * TransitionEvent and are replayed by the implementation kernel per workflow.
 * Every derived view (actors, workflows, mailboxes, accounting) is rebuilt from
 * history and checked, never accepted as an independent authority.
 *
 * Validators accept inert unknown input and throw structured expected
 * ContractValidationError ({code, path, category: corrupt|unsupported}); the
 * reducer converts expected validation failures to non-authorizing outcomes.
 * Unexpected programming errors escape. A caller ArchiveValidationContext is
 * untrusted checked data. Capture, reconstruction and cache comparison share one
 * registered common ValidationContext, including activation/control leaves and
 * kernel parsing/replay. The kernel additionally meters real traversal/copy/scan
 * work and reuses only its own same-operation immutable results. The reducer also
 * retains a lexical, validated actor prefix and forks its complete private graph
 * for one shared append step. External roots/caches always reconstruct fully.
 * Final-view and reserve captures remain fully charged. This is not a measured workflow-fit or
 * complete actor-domain intermediate-work proof (remaining M8 review).
 * No clocks, UUIDs, filesystem, RPC, callbacks, handles or
 * capability checks occur here.
 *
 * R1 foundation: concrete discriminated readonly payload/event/view types,
 * typed mutable fold collections split from deep-readonly published types,
 * inert capture before any property read, narrow kernel-error adaptation,
 * deeply immutable checked returns, closed nested scope branches, UTF-8 byte
 * text bounds and bounded structural V2 equality. R2 adds per-root-prefix public
 * kernel reduction and concrete producer/control/settlement correlation. This is
 * not full M2-M8 closure. R3 adds bounded current-segment artifact retention,
 * exact T04 inspection contents and separate delivered-reply observations, with
 * kernel receipt/candidate/commit and mirror qualification. Evidence sources are
 * exact retained report projections, not arbitrary filesystem/binary artifacts.
 * R3-C1 preserves exact summary/verification coverage. R3-C2 adds optional
 * pre-work native base identities and complete model-local UTF-8 change proofs
 * for all/patch/file. These are NOT authenticated native rendered Git patches.
 * Only admitted applied approvals advance the optional base; legacy histories
 * without a timely base retain only their previously supported coverage.
 * LA adds lifecycle/reservation, amendment and attributed-accounting folds.
 * LR adds exact human-authorized terminal logical dispositions, evidence-named
 * supervisor null resolutions with immutable proof history, and independent
 * settlement/output production facts. Optional raw omissions remain omissions.
 * Mailbox envelope/dedup/service history and quiescent archive carryover are modeled.
 * Evidence-bound mailbox reconciliation is modeled; Host eligibility and full M8/path qualification remain open. No pure replay proves host provenance or
 * physical inspection; no source/receipt/derived view is an effect capability.
 */

import {
  COMMON_BOUNDS,
  ContractValidationError,
  createValidationContext,
  decodeReferencedPairJSON,
  consumeReference,
  consumeValidationWork,
  captureValidationWork,
  requireValidationContext,
  validateBudgetSnapshot,
  encodeLegacyV1 as commonEncodeLegacyV1,
  hashBytes as commonHashBytes,
  inspectLegacySource,
  legacyPayloadDigest as commonLegacyPayloadDigest,
  validateDeadlineWindow,
  encodePairJSON as commonEncodePairJSON,
  ensureInert,
  pairDigest as commonPairDigest,
  projectKernelAssignment,
  validateActorControlBinding,
  validateActorBinding,
  validateActorConfigV3InContext,
  validateActorDefinitionV3,
  validateArchiveReferenceV2,
  validateArtifactRef,
  validateAssignmentSnapshotV2,
  validateHash,
  validateId,
  validateOwnerBinding,
  validateReviewerWitness,
} from './actor-contract-common.js';
import {
  validateArchiveCheckpointV2,
  validateArchiveValidationContext,
  projectHeldLegacyWorkerViewInContext,
} from './actor-migration-contracts.js';
import {
  CoordinationValidationError,
  validateCoordinationModelInContext,
  validateTransitionEventInContext,
} from './coordination.js';
import { reduceCoordinationInContext } from './transitions.js';
import { validateActivationRecordV2InContext } from './actor-record-contracts.js';
import { validateActorControlV2InContext, validateAuthorityArtifactV2InContext, validateMailboxEnvelopeV2InContext } from './actor-wire-contracts.js';

/** @typedef {import('./actor-wire-contracts.js').MailboxEnvelopeV2} MailboxEnvelopeV2 */

/** @typedef {import('./actor-record-contracts.js').ActivationRecordV2} ProducerActivation */
/** @typedef {import('./actor-wire-contracts.js').ActorControlV2} ActorControlV2 */
/** @typedef {import('./actor-wire-contracts.js').AuthorityArtifactV2} AuthorityArtifactV2 */
/** @typedef {Readonly<{authority:AuthorityArtifactV2,eventId:Id,issuer:ActorBinding,retainedAt:number,sequence:number,segmentId:Id}>} RetainedAuthority */
/** @typedef {Readonly<{status:'verified',eventId:Id,inputHash:Hash}>} SubmissionEvidence */
/** @typedef {Readonly<{retentionEventId:Id,sequence:number,authorityHash:Hash,proofRootRevision:number}>} AuthorityEvidence */
/** @typedef {import('./actor-contract-common.js').ActorControlBinding} ActorControlBinding */
/** @typedef {import('./actor-contract-common.js').Identity} Identity */
/** @typedef {DeepReadonly<import('./coordination.js').ReviewLink>} ReviewLink */
/** @typedef {Readonly<{observationId:Id, at:number, phase:'native-settled'|'transport-closed'|'aborted'}>} ProducerSettlement */
/** @typedef {Readonly<{observationId:Id, at:number, stage:'sent'|'accepted'|'rejected'|'started', commandId:Id, inputHash:Hash}>} ProducerDelivery */
/** Original production is optional; at/receivedAt are receipt facts, never invented production.
 * @typedef {Readonly<{observationId:Id,at:number}>} OutputObservation */
/** @typedef {Readonly<{activationId:Id, intentId:Id, at:number, receivedAt:number, observation?:OutputObservation, admissionDenial:AdmissionDenial|null, control:ActorControlV2}>} SupervisorIntent */
/** @typedef {Readonly<{metric:'inputTokens'|'outputTokens'|'costUsd',unknownObservationId:Id,evidenceObservationId:Id}>} SupervisorResolution */
/** @typedef {SupervisorResolution & Readonly<{reconciledBy:Id,at:number}>} SupervisorResolutionView */
/** @typedef {Readonly<{authorization:HumanAuthorization,obligationIds:readonly Id[]}>} LogicalDisposition */
/** Ref is the named debt; evidenceId distinguishes later facts about the same ref.
 * @typedef {Readonly<{ref:Id,kind:'task'|'held-commitment'|'report'|'question'|'intent',evidenceId:Id}>} LogicalDebt */
/** @typedef {LogicalDisposition & Readonly<{observationId:Id,at:number,obligations:readonly LogicalDebt[]}>} TerminalDispositionView */

/** @typedef {import('./actor-contract-common.js').ValidationContext} ValidationContext */
/** @typedef {import('./actor-contract-common.js').Id} Id */
/** @typedef {import('./actor-contract-common.js').Hash} Hash */
/** @typedef {import('./actor-contract-common.js').Fence} Fence */
/** @typedef {import('./actor-contract-common.js').ActorBinding} ActorBinding */
/** @typedef {import('./actor-contract-common.js').OwnerBinding} OwnerBinding */
/** @typedef {import('./actor-contract-common.js').ArtifactRef} ArtifactRef */
/** @typedef {import('./actor-contract-common.js').ReviewerWitness} ReviewerWitness */
/** @typedef {import('./actor-contract-common.js').AssignmentSnapshotV2} AssignmentSnapshotV2 */
/** @typedef {import('./actor-contract-common.js').ActorDefinitionV3} ActorDefinitionV3 */
/** @typedef {import('./actor-contract-common.js').ActorConfigV3} ActorConfigV3 */
/** @typedef {import('./actor-contract-common.js').ArchiveReferenceV2} ArchiveReferenceV2 */
/** @typedef {import('./actor-migration-contracts.js').ArchiveCheckpointV2} ArchiveCheckpointV2 */
/** @typedef {import('./actor-migration-contracts.js').ArchiveValidationContext} ArchiveValidationContext */
/** Recursive publication mapping over concrete JSON records, unions and arrays.
 * Mutable actor fold records/collections below remain separate; kernel APIs
 * accept unknown, so these readonly views require no mutable downcast or ABI change.
 * @template T
 * @typedef {T extends object ? {readonly [K in keyof T]: DeepReadonly<T[K]>} : T} DeepReadonly
 */
/** @typedef {DeepReadonly<import('./coordination.js').TransitionEvent>} TransitionEvent */
/** @typedef {DeepReadonly<import('./coordination.js').CoordinationModel>} CoordinationModel */
/** @typedef {DeepReadonly<import('./coordination.js').Genesis>} KernelGenesis */

/** @typedef {'workflow-ineligible'|'producer-ineligible'|'producer-retired'|'producer-expired'|'prior-held-commitment'|'budget'|'unknown-accounting'} AdmissionDenial */
/** @typedef {import('./actor-contract-common.js').BudgetSnapshot} BudgetSnapshot */
/** @typedef {Readonly<{authorizationId:Id, principal:'human', authorizedAt:number, reason:string, owner:OwnerBinding, main:ActorBinding}>} HumanAuthorization */
/** @typedef {Readonly<{enabled:boolean, paused:boolean, stopped:boolean, revision:number, changedBy:Id|null}>} ActorLifecycle */
/** @typedef {Readonly<{kind:'kernel-control-authorized',issuer:ActorBinding,event:Extract<TransitionEvent,{kind:'lifecycle'}>,authorization:HumanAuthorization}>} KernelControlPayload */
/** @typedef {Readonly<{kind:'actor-lifecycle', issuer:ActorBinding, actorId:Id, expectedRevision:number, command:'enable'|'disable'|'start'|'stop'|'pause'|'resume', authorization:HumanAuthorization}>} ActorLifecyclePayload */
/** @typedef {Readonly<{kind:'workflow-amended', issuer:ActorBinding, operationId:Id, expectedRevision:Id, before:BudgetSnapshot, after:BudgetSnapshot, kernelOperationId:Id|null, authorization:HumanAuthorization}>} WorkflowAmendedPayload */
/** Trusted producer-scoped completeness observation, not a caller-provided total.
 * Coverage must equal the exact retained metric observations of a retired run.
 * @typedef {Readonly<{observationId:Id,at:number,coveredObservationIds:readonly Id[],resolutions?:readonly SupervisorResolution[],observer:ActorBinding,binding:ActorControlBinding,metricCoverage:readonly Readonly<{observationId:Id,metric:'inputTokens'|'outputTokens'|'costUsd'}>[],deliveryObservationIds:readonly Id[],settlementObservationIds:readonly Id[],containmentObservationId:Id|null}>} SupervisorAccountingView */
/** @typedef {Readonly<{kind:'supervisor-accounting-reconciled',issuer:ActorBinding,activationId:Id,binding:ActorControlBinding,source:'trusted-accounting',observationId:Id,at:number,coveredObservationIds:readonly Id[],resolutions?:readonly SupervisorResolution[]}>} SupervisorAccountingPayload */
/** @typedef {Readonly<{kind:'workflow-escalated', issuer:ActorBinding, reason:string, authorization:HumanAuthorization}>} WorkflowEscalatedPayload */
/** @typedef {Readonly<{kind:'activation-contained', issuer:ActorBinding, activationId:Id, binding:ActorControlBinding, observationId:Id, at:number, outcome:'not-sent'|'contained', deliveryObservationIds:readonly Id[], settlementObservationId:Id|null, settlementObservationIds?:readonly Id[], barrierId:Id|null}>} ActivationContainedPayload */
/** @typedef {Readonly<{observationId:Id, at:number, outcome:'not-sent'|'contained', deliveryObservationIds:readonly Id[], settlementObservationId:Id|null, settlementObservationIds?:readonly Id[], barrierId:Id|null}>} ContainmentView */
/** @typedef {Readonly<{delivery:boolean, run:boolean, effects:boolean, output:boolean}>} ReservationView */
/** @typedef {Readonly<{gapId:Id, metric:'inputTokens'|'outputTokens'|'costUsd'|'activeMs'|'turns'|'revisions'|'reports'|'repairAttempts'|'recoveryAttempts'|'attempts'|'requests'|'unknownCostRequests', taskId:Id|null, stepId:Id|null, activationId:Id|null, reason:string}>} UsageGapView */
/** A derived denial of actor consequence, NOT another kernel commitment registry.
 * The canonical event and unchanged kernel retain the storage observation.
 * @typedef {Readonly<{nonAuthorizing:true, eventId:Id, observationId:Id, operationId:Id, intentKind:'dispatch'|'prompt'|'decision'|'grant'|'publication'|'amendment'|'automatic-action'|'reconciliation'|'reset', reason:AdmissionDenial}>} HeldCommitment */
/** @typedef {'planning'|'implementing'|'waiting'|'review'|'completed'|'cancelled'|'escalated'} WorkflowStatus */
/** @typedef {'disabled'|'stopped'|'paused'|'stale-owner'|'legacy'|'budget'|'unknown-accounting'|'uncertain-effect'|'uncertain-delivery'|'unsupported'|'capacity'|'evidence'|'interrupted'} HoldReason */
/** @typedef {Readonly<{kind:'root'|'actor'|'workflow'|'activation'|'operation'|'mailbox', id:Id}>} HoldScope */
/** @typedef {Readonly<{causeId:Id, reason:HoldReason, scope:HoldScope, at:number, resolvedBy:Id|null}>} ActorHoldCause */
/** @typedef {Readonly<{id:Id, title:string, description:string}>} PlanStepV2 */
/** @typedef {Readonly<{admissionAt:number, expiresAt:number}>} DeadlineWindow */
/** @typedef {Readonly<{kind:'all'|'summary'|'patch'|'verification'}>|Readonly<{kind:'file', path:string}>} InspectionScope */
/** @typedef {'consumed'|'rejected'|'not-sent'|'unknown'} MailboxOutcome */

// ---------------------------------------------------------------------------
// Concrete discriminated actor payload union
// ---------------------------------------------------------------------------

/** Closed, inline current-segment sources. No archive resolver availability grants
 * retention; Main records bytes, not an external storage capability.
 * @typedef {Readonly<{kind:'inspection'}>|Readonly<{kind:'evidence', evidenceId:Id, reportId:Id, checkpointHash:Hash, part:'envelope'|'finalized-report'|'checkpoint'|'summary'|'verification'|'structured-change', encoding:'pair-json/1'|'pair-json-v1/1'|'bytes', hashDomain:'bytes'|'authority'|'mailbox'|'inspection'|'actor-event'|'control'}>} ArtifactPurpose */
/** @typedef {Readonly<{path:string, kind:'file'|'symlink'|'missing', sha:Hash|null, size:number, executable:boolean}>} NativeSnapshotEntry */
/** Native identity only: construction order is root/head/entries and each entry
 * path/kind/sha/size/executable. No capturedAt, totalBytes, baseHash or patch.
 * @typedef {Readonly<{root:string, head:string|null, entries:readonly NativeSnapshotEntry[]}>} NativeSnapshotIdentity */
/** @typedef {Readonly<{path:string, before:string|null, after:string|null}>} ChangeImage */
/** Complete changed images; unchanged entries are covered by both native identities.
 * report is the exact stored finalized report, including original V1 payload order.
 * @typedef {Readonly<{version:1, encoding:'pair-model-change-proof/1', taskId:Id, reportId:Id, before:NativeSnapshotIdentity, after:NativeSnapshotIdentity, files:readonly ChangeImage[], report:DeepReadonly<import('./contracts.js').FinalizedReport>}>} StructuredChangeProof */
/** Null identity/hash means an admitted approval lacked a checked next snapshot;
 * the optional stronger chain is permanently unavailable, not silently reused.
 * @typedef {Readonly<{taskId:Id, dispatchOperationId:Id, identity:NativeSnapshotIdentity|null, nativeHash:Hash|null, establishedBy:Id, advancedBy:Id|null, reportId:Id|null}>} TaskBaseView */
/** @typedef {Readonly<{kind:'task-base-recorded', issuer:ActorBinding, taskId:Id, dispatchOperationId:Id, identity:NativeSnapshotIdentity}>} TaskBasePayload */
/** @typedef {Readonly<{kind:'artifact-retained', issuer:ActorBinding, artifact:ArtifactRef, original:string, purpose:ArtifactPurpose}>} ArtifactRetainedPayload */
/** Complete inline wrapper, not a referenced raw source or transport-byte claim.
 * @typedef {Readonly<{kind:'artifact-retained',issuer:ActorBinding,purpose:Readonly<{kind:'inspection-content'}>,artifact:ArtifactRef,inspection:InspectionArtifact}>} InlineInspectionPayload */
/** @typedef {Readonly<{kind:'artifact-retained',issuer:ActorBinding,purpose:Readonly<{kind:'authority-content'}>,authority:AuthorityArtifactV2}>} AuthorityRetainedPayload */
/** Main's observed delivery of an already retained reply, independently of native
 * settlement and independently of the kernel's later storage observation.
 * @typedef {Readonly<{kind:'inspection-delivery-observed',issuer:ActorBinding,activationId:Id,reply:ArtifactRef,observation:Readonly<{observationId:Id,at:number}>}>} InspectionDeliveryPayload */
/** @typedef {Readonly<{activationId:Id,reply:ArtifactRef,observation:Readonly<{observationId:Id,at:number}>,retainedAt:number,sequence:number}>} InspectionDeliveryView */
/** @typedef {import('./actor-wire-contracts.js').InspectionRequestV2|import('./actor-wire-contracts.js').InspectionReplyV2|import('./actor-wire-contracts.js').InspectionReceiptV2} InspectionArtifact */
/** @typedef {import('./actor-wire-contracts.js').PayloadRefV2} InspectionEvidenceRef */
/** @typedef {Readonly<{artifact:ArtifactRef, byteLength:number, retainedAt:number, sequence:number}>} RetentionFacts */
/** Raw source byte facts never become canonical inline-byte provenance.
 * @typedef {Readonly<{originalBytesHash:Hash}>|Readonly<{originalBytesHash:null,canonicalBytesHash:Hash}>} InspectionByteFacts */
/** Only validated concrete wrappers or exact kernel-derived evidence, never a
 * broad unchecked object map. Original text or inline content stays in its event.
 * @typedef {RetentionFacts & ((InspectionByteFacts & Readonly<{kind:'inspection', inspection:InspectionArtifact}>)|Readonly<{kind:'evidence', originalBytesHash:Hash, purpose:Extract<ArtifactPurpose,{kind:'evidence'}>, proof:StructuredChangeProof|null, beforeHash:Hash|null, afterHash:Hash|null}>)} RetainedArtifact */
/** @typedef {Readonly<{requestId:Id, replyId:Id, receiptId:Id, scope:InspectionScope, evidenceIds:readonly Id[], delivery:Readonly<{observationId:Id,at:number}>}>} QualifiedInspection */

/** Supplied semantic preimage, never reconstructed from receipt/journal fields.
 * @typedef {Readonly<{version:2,kind:'workflow-submission',storeId:Id,workflowId:Id,workflowRevision:Id,requestId:Id,owner:OwnerBinding,issuer:ActorBinding,objective:string,constraints:readonly string[],supervisorId:Id,implementerId:Id,lifetimeDeadlineAt:number|null,assignment:AssignmentSnapshotV2,implementationGenesis:KernelGenesis}>} WorkflowSubmissionInputV2 */
/** @typedef {Readonly<{kind:'workflow-submitted', issuer:ActorBinding, requestId:Id, inputHash:Hash, objective:string, constraints:readonly string[], supervisorId:Id, implementerId:Id, lifetimeDeadlineAt:number|null, assignment:AssignmentSnapshotV2, implementationGenesis:KernelGenesis, submissionInput?:WorkflowSubmissionInputV2}>} WorkflowSubmittedPayload */
/** @typedef {Readonly<{kind:'plan-recorded', issuer:ActorBinding, activationId:Id, intentId:Id, workflowRevision:Id, planRevision:number, steps:readonly PlanStepV2[]}>} PlanRecordedPayload */
/** Structural extensions live only in the retained wire controls, never a second
 * actor-event copy. Recording a structural plan is not installation/admission.
 * @typedef {import('./actor-wire-contracts.js').PlanChangeV2} PlanChangeV2
 * @typedef {import('./actor-wire-contracts.js').PlanLinkV2} PlanLinkV2
 * @typedef {DeepReadonly<import('./coordination.js').CurrentTask>} CurrentTask
 * @typedef {DeepReadonly<import('./coordination.js').CatalogEntry>} CatalogEntry
 * @typedef {Readonly<{payload:PlanRecordedPayload,eventId:Id,at:number}>} PlanRecord
 * @typedef {Readonly<{lineageId:Id,stepIds:readonly Id[],accounting:Readonly<import('./coordination.js').Ledger>,gaps:ReadonlyArray<import('./coordination.js').AccountingGap>}>} PlanLineageView
 * @typedef {Readonly<{workflowId:Id,workflowRevision:Id,taskId:Id,taskPlanRevision:number,workflowPlanRevision:number,catalog:readonly CatalogEntry[],remainingStepIds:readonly Id[],currentStepId:Id|null,planLink:PlanLinkV2|null,planHash:Hash,lineage:readonly PlanLineageView[],reviewDebt:ReadonlyArray<import('./coordination.js').ReviewDebt>}>} TaskPlanView */
/** @typedef {Readonly<{kind:'activation-issued', issuer:ActorBinding, workflowRevision:Id, activationId:Id, operationId:Id, intentId:Id, intentHash:Hash, role:'supervisor'|'implementer', actorId:Id, deadline:DeadlineWindow, producer:ProducerActivation, control:ActorControlV2}>} ActivationIssuedPayload */
/** @typedef {Readonly<{kind:'activation-delivery-observed', issuer:ActorBinding, activationId:Id, observation:ProducerDelivery}>} ActivationDeliveryPayload */
/** @typedef {Readonly<{kind:'supervisor-intent-recorded', issuer:ActorBinding, activationId:Id, control:ActorControlV2, observation?:OutputObservation}>} SupervisorIntentPayload */
/** @typedef {Readonly<{kind:'activation-settled', issuer:ActorBinding, activationId:Id, observationId:Id, at:number, phase:'native-settled'|'transport-closed'|'aborted', role:'supervisor'|'implementer'}>} ActivationSettledPayload */
/** @typedef {Readonly<{kind:'mailbox-enqueued', issuer:ActorBinding, messageId:Id, targetId:Id, targetRole:'main'|'supervisor'|'implementer', lane:'ordinary'|'reserved-control', priority:'normal'|'question-answer'|'control', operationId:Id, idempotencyKey:Id, epochSegment:Id, bytes:number, payloadHash:Hash, envelope?:MailboxEnvelopeV2}>} MailboxEnqueuedPayload */
/** @typedef {Readonly<{kind:'mailbox-disposition', issuer:ActorBinding, messageId:Id, outcome:MailboxOutcome, observationId:Id}>} MailboxDispositionPayload */
/** @typedef {'sent'|'accepted'|'started'|'run-settled'|'rejected'|'ingress'} DeliveryStage */
/** @typedef {'participant-consumed'|'main-consumed'|'rejected-before-execution'|'proven-not-sent'|'terminally-contained'|'incomplete-hold'} ResolutionKind */
/** @typedef {Readonly<{kind:'attempt-binding',messageId:Id,operationId:Id}>|Readonly<{kind:'delivery-observation',messageId:Id,operationId:Id,observationId:Id}>|Readonly<{kind:'ingress-receipt',receiptId:Id}>|Readonly<{kind:'containment',activationId:Id,observationId:Id}>|Readonly<{kind:'effect-barrier',barrierId:Id}>|Readonly<{kind:'kernel-reconciliation',operationId:Id}>} EvidenceRef */
/** @typedef {Readonly<{kind:'mailbox-attempt-bound',issuer:ActorBinding,messageId:Id,operationId:Id,commandId:Id,inputHash:Hash,controlHash:Hash,messageHash:Hash,activationId:Id|null,at:number}>} MailboxAttemptPayload */
/** @typedef {Readonly<{kind:'mailbox-delivery-observed',issuer:ActorBinding,messageId:Id,operationId:Id,observation:Readonly<{observationId:Id,at:number,stage:DeliveryStage,actor:ActorBinding,commandId:Id,inputHash:Hash}>,at:number}>} MailboxDeliveryPayload */
/** @typedef {Readonly<{kind:'mailbox-reconciled',issuer:ActorBinding,messageId:Id,dispositionObservationId:Id,priorResolutionId:Id|null,reconciliationId:Id,observationId:Id,at:number,resolution:Readonly<{kind:ResolutionKind,evidence:readonly EvidenceRef[]}>}>} MailboxReconciledPayload */
/** @typedef {Readonly<{payload:MailboxAttemptPayload,consumer:ActorBinding,at:number,owner:OwnerBinding,segmentId:Id}>} AttemptBinding */
/** @typedef {Readonly<{payload:MailboxDeliveryPayload,at:number,owner:OwnerBinding,segmentId:Id}>} StageFact */
/** @typedef {Readonly<{payload:MailboxReconciledPayload,at:number,owner:OwnerBinding,segmentId:Id}>} ResolutionRecord */
/** @typedef {MailboxOutcome|'terminally-contained'|null} EffectiveMailboxDisposition */
/** @typedef {Readonly<{kind:'question-raised', issuer:ActorBinding, activationId:Id, questionId:Id, reportId:Id}>} QuestionRaisedPayload */
/** @typedef {Readonly<{kind:'answer-recorded', issuer:ActorBinding, questionId:Id, answerId:Id, activationId:Id, intentId:Id, operationId:Id}>} AnswerRecordedPayload */
/** @typedef {Readonly<{kind:'attempt-opened', issuer:ActorBinding, activationId:Id, attemptId:Id, planRevision:number, stepId:Id}>} AttemptOpenedPayload */
/** @typedef {Readonly<{kind:'report-observed', issuer:ActorBinding, activationId:Id, attemptId:Id, reportId:Id, reportHash:Hash, stepId:Id, reportKind:'question'|'checkpoint'|'blocked'|'final_review'}>} ReportObservedPayload */
/** @typedef {Readonly<{kind:'effects-observed', issuer:ActorBinding, activationId:Id, barrierId:Id, coverage:'complete'|'partial'|'unknown', admittedEffectIds:readonly Id[], settledEffectIds:readonly Id[], containedEffectIds:readonly Id[], unknownEffectIds:readonly Id[], observationId:Id}>} EffectsObservedPayload */
/** @typedef {Readonly<{kind:'inspection-recorded', issuer:ActorBinding, activationId:Id, receiptId:Id, requestId:Id, replyId:Id, reportId:Id, checkpointHash:Hash, scope:InspectionScope, review:ReviewLink, evidenceIds:readonly Id[]}>} InspectionRecordedPayload */
/** @typedef {Readonly<{kind:'decision-recorded', issuer:ActorBinding, activationId:Id, operationId:Id, action:'approve'|'revise'|'answer'|'cancel', reportId:Id, checkpointHash:Hash, review:ReviewerWitness, continuationOperationId:Id|null}>} DecisionRecordedPayload */
/** @typedef {Readonly<{kind:'supervisor-usage-recorded', issuer:ActorBinding, activationId:Id, usageId:Id, observationId:Id, observedAt:number, metric:'inputTokens'|'outputTokens'|'costUsd', value:number|null}>} SupervisorUsageRecordedPayload */
/** @typedef {Readonly<{kind:'hold-recorded', issuer:ActorBinding, holdId:Id, reason:HoldReason, scope:HoldScope, at:number}>} HoldRecordedPayload */
/** @typedef {Readonly<{kind:'lifecycle',actorId:Id,revision:number}>|Readonly<{kind:'budget',workflowId:Id,budgetRevision:Id}>|Readonly<{kind:'containment',workflowId:Id,activationId:Id}>|Readonly<{kind:'kernel',workflowId:Id,causeId:Id}>|Readonly<{kind:'accounting',workflowId:Id,activationId:Id}>|Readonly<{kind:'mailbox',messageId:Id,reconciliationId:Id}>} HoldResolution */
/** @typedef {Readonly<{kind:'hold-resolved', issuer:ActorBinding, holdId:Id, observationId:Id, resolution:HoldResolution}>} HoldResolvedPayload */
/** @typedef {Readonly<{kind:'owner-transitioned', issuer:ActorBinding, next:OwnerBinding}>} OwnerTransitionedPayload */
/** @typedef {Readonly<{kind:'workflow-closed', issuer:ActorBinding, workflowId:Id, outcome:'completed'|'cancelled'|'escalated', observationId:Id, disposition?:LogicalDisposition}>} WorkflowClosedPayload */

/** @typedef {KernelControlPayload|SupervisorAccountingPayload|ActorLifecyclePayload|WorkflowAmendedPayload|WorkflowEscalatedPayload|ActivationContainedPayload|TaskBasePayload|InspectionDeliveryPayload|ArtifactRetainedPayload|InlineInspectionPayload|AuthorityRetainedPayload|WorkflowSubmittedPayload|PlanRecordedPayload|ActivationIssuedPayload|ActivationDeliveryPayload|SupervisorIntentPayload|ActivationSettledPayload|MailboxEnqueuedPayload|MailboxDispositionPayload|MailboxAttemptPayload|MailboxDeliveryPayload|MailboxReconciledPayload|QuestionRaisedPayload|AnswerRecordedPayload|AttemptOpenedPayload|ReportObservedPayload|EffectsObservedPayload|InspectionRecordedPayload|DecisionRecordedPayload|SupervisorUsageRecordedPayload|HoldRecordedPayload|HoldResolvedPayload|OwnerTransitionedPayload|WorkflowClosedPayload} ActorPayload */

// ---------------------------------------------------------------------------
// Canonical root / event / genesis and published view types
// ---------------------------------------------------------------------------

/** @typedef {Readonly<{eventId:Id, sequence:number, at:number, owner:OwnerBinding, workflowId:Id|null, domain:'actor', payload:ActorPayload}>} ActorDomainEvent */
/** @typedef {Readonly<{eventId:Id, sequence:number, at:number, owner:OwnerBinding, workflowId:Id|null, domain:'implementation', payload:TransitionEvent}>} ImplementationDomainEvent */
/** @typedef {ActorDomainEvent|ImplementationDomainEvent} ActorWorkflowEventV2 */

/** @typedef {Readonly<{storeId:Id, initialOwner:OwnerBinding, actorDefinitions:readonly ActorDefinitionV3[], configSnapshot:ActorConfigV3, heldLegacyRefs:readonly ArtifactRef[], checkpoint:ArchiveCheckpointV2|null}>} ActorGenesisV2 */
/** @typedef {Readonly<{version:2, encoding:'pair-actor-state/1', segmentId:Id, genesis:ActorGenesisV2, events:readonly ActorWorkflowEventV2[], archiveHead:ArchiveReferenceV2|null}>} ActorStateV2 */
/** @typedef {Readonly<{segmentId:Id, genesis:ActorGenesisV2, events:readonly ActorWorkflowEventV2[], archiveHead:ArchiveReferenceV2|null}>} ParsedRoot */

/** @typedef {Readonly<{actorId:Id, role:'supervisor'|'implementer', definition:ActorDefinitionV3, binding:ActorBinding|null, status:'enabled'|'disabled'|'paused'|'stopped', lifecycle:ActorLifecycle, openActivations:number, holds:readonly HoldReason[]}>} ActorViewEntry */
/** @typedef {Readonly<{actors:readonly ActorViewEntry[]}>} ActorView */
/** @typedef {Readonly<{messageId:Id, targetId:Id, targetRole:'main'|'supervisor'|'implementer', lane:'ordinary'|'reserved-control', priority:'normal'|'question-answer'|'control', operationId:Id, idempotencyKey:Id, epochSegment:Id, bytes:number, payloadHash:Hash, envelope:MailboxEnvelopeV2, workflowId:Id|null, enqueuedAt:number, disposition:MailboxOutcome|null, released:boolean, attempts:readonly (AttemptBinding & Readonly<{stages:readonly StageFact[]}>)[], resolutions:readonly (ResolutionRecord & Readonly<{currentlySatisfied:boolean}>)[], effectiveDisposition:EffectiveMailboxDisposition}>} MailboxEntryView */
/** @typedef {Readonly<{actorId:Id, ordinaryCount:number, ordinaryBytes:number, controlCount:number, controlBytes:number, maxQueuedPerActor:number, entries:readonly MailboxEntryView[], priorityStreak:number, nextFairMessageId:Id|null, nextMessageId:Id|null}>} MailboxView */
/** Original observation identity, not usageId, is the accounting key. Input is totalInput (including cache) for kernel observations.
 * @typedef {Readonly<{usageId:Id, observationId:Id, observedAt:number, producerId:Id, producer:ActorBinding, operationId:Id, activationId:Id, workflowId:Id, taskId:Id|null, stepId:Id|null, source:'supervisor'|'implementer', metric:'inputTokens'|'outputTokens'|'costUsd', value:number|null, known:boolean}>} UsageEntryView */
/** @typedef {Readonly<{workflowId:Id, inputTokens:number, outputTokens:number, costUsd:number, producers:readonly UsageEntryView[], taskLedgers:readonly Readonly<{taskId:Id,accounting:DeepReadonly<import('./coordination.js').AccountingSnapshot>}>[], gaps:readonly UsageGapView[], causesUnknownCost:boolean}>} WorkflowUsageView */
/** @typedef {Readonly<{workflows:readonly WorkflowUsageView[], inputTokens:number, outputTokens:number, costUsd:number, complete:boolean}>} AccountingView */

/** @typedef {Readonly<{activationId:Id, authorityEvidence:AuthorityEvidence, role:'supervisor'|'implementer', actorId:Id, operationId:Id, intentId:Id, intentHash:Hash, deadline:DeadlineWindow, settled:boolean, settlementObservation:Id|null, settlement:ProducerSettlement|null, producer:ProducerActivation, control:ActorControlV2, deliveries:readonly ProducerDelivery[], containment:ContainmentView|null, accounting:SupervisorAccountingView|null, accountingComplete:boolean, accountingHistory:readonly SupervisorAccountingView[], resolutions:readonly SupervisorResolutionView[], settlements:readonly ProducerSettlement[], nativeSettlement:ProducerSettlement|null, containments:readonly ContainmentView[], containmentComplete:boolean, reservation:ReservationView, closed:boolean}>} ActivationView */
/** @typedef {Readonly<{questionId:Id, reportId:Id, activationId:Id, answeredBy:Id|null}>} QuestionView */
/** @typedef {Readonly<{answerId:Id, questionId:Id, activationId:Id, intentId:Id, operationId:Id, answer:string}>} AnswerView */
/** @typedef {Readonly<{attemptId:Id, activationId:Id, planRevision:number, stepId:Id, reportId:Id|null}>} AttemptView */
/** @typedef {Readonly<{reportId:Id, attemptId:Id, activationId:Id, reportHash:Hash, reportKind:'question'|'checkpoint'|'blocked'|'final_review', stepId:Id, barrierId:Id|null}>} ReportView */
/** @typedef {Readonly<{barrierId:Id, activationId:Id, coverage:'complete'|'partial'|'unknown'}>} EffectView */
/** @typedef {Readonly<{receiptId:Id, requestId:Id, replyId:Id, reportId:Id, checkpointHash:Hash, activationId:Id, scope:InspectionScope, review:ReviewLink, evidenceIds:readonly Id[], delivery:Readonly<{observationId:Id,at:number}>}>} InspectionView */
/** @typedef {Readonly<{operationId:Id, action:'approve'|'revise'|'answer'|'cancel', reportId:Id, checkpointHash:Hash|null, continuationOperationId:Id|null, activationId:Id|null, source:'main-decision'|'supervisor-control'}>} DecisionView */

/** @typedef {Readonly<{
  workflowId:Id, requestId:Id, inputHash:Hash, submissionEvidence:SubmissionEvidence, authorities:readonly RetainedAuthority[], objective:string, constraints:readonly string[],
  owner:OwnerBinding, supervisorId:Id, implementerId:Id, status:WorkflowStatus,
  workflowRevision:Id, planRevision:number, steps:readonly PlanStepV2[], planRecorded:boolean, planIntentId:Id|null, plans:readonly PlanRecord[], taskPlans:readonly TaskPlanView[], structuralRevisionOperations:readonly Id[], assignment:AssignmentSnapshotV2, budget:BudgetSnapshot, amendments:readonly WorkflowAmendedPayload[], lifetimeDeadlineAt:number|null,
  unresolvedObligations:readonly Id[], dispositions:readonly TerminalDispositionView[], closureObservations:readonly WorkflowClosedPayload[], heldCommitments:readonly HeldCommitment[], taskBases:readonly TaskBaseView[],
  activations:readonly ActivationView[], intents:readonly SupervisorIntent[], questions:readonly QuestionView[], answers:readonly AnswerView[], attempts:readonly AttemptView[], controls:readonly KernelControlPayload[], disposed:boolean, reports:readonly ReportView[],
  decisions:readonly DecisionView[], inspections:readonly InspectionView[], artifacts:readonly RetainedArtifact[], inspectionDeliveries:readonly InspectionDeliveryView[],
  usage:readonly UsageEntryView[], holds:readonly ActorHoldCause[],
  implementationGenesis:KernelGenesis
}>} WorkflowView */

/** @typedef {Readonly<{nonAuthorizing:true, state:ActorStateV2, genesis:ActorGenesisV2, events:readonly ActorWorkflowEventV2[], actor:ActorView, workflows:readonly WorkflowView[], mailboxes:readonly MailboxView[], accounting:AccountingView, implementation:Readonly<Record<string, CoordinationModel>>}>} ActorModelView */
/** @typedef {ActorModelView} ActorStateValidation */
/** @typedef {ActorModelView} ActorWorkflowModel */
/** @typedef {import('./actor-migration-contracts.js').LegacyWorkerView} LegacyWorkerView */
/** @typedef {import('./actor-migration-contracts.js').HeldLegacyProjectionContext} HeldLegacyProjectionContext */
/** @typedef {'applied'|'duplicate'|'input-conflict'|'held'|'invalid-input'|'operation-conflict'|'capacity'|'unsupported'|'epoch-rejected'} ActorTransitionReason */
/** @typedef {Readonly<{kind:'apply'|'noop'|'hold', nonAuthorizing:true, reason:ActorTransitionReason, model:ActorModelView}>|Readonly<{kind:'reject', nonAuthorizing:true, reason:ActorTransitionReason}>} ActorTransitionResult */

// ---------------------------------------------------------------------------
// Mutable internal fold record types
// ---------------------------------------------------------------------------

/** @typedef {{activationId:Id, authorityEvidence:AuthorityEvidence, role:'supervisor'|'implementer', actorId:Id, operationId:Id, intentId:Id, intentHash:Hash, deadline:DeadlineWindow, settled:boolean, settlementObservation:Id|null, settlement:ProducerSettlement|null, producer:ProducerActivation, control:ActorControlV2, deliveries:readonly ProducerDelivery[], containment:ContainmentView|null, accounting:SupervisorAccountingView|null, accountingHistory:SupervisorAccountingView[], resolutions:SupervisorResolutionView[], settlements:ProducerSettlement[], containments:ContainmentView[], closed:boolean}} ActivationRecord */
/** @typedef {{questionId:Id, reportId:Id, activationId:Id, answeredBy:Id|null}} QuestionRecord */
/** @typedef {AnswerView} AnswerRecord */
/** @typedef {{attemptId:Id, activationId:Id, planRevision:number, stepId:Id, reportId:Id|null}} AttemptRecord */
/** @typedef {{reportId:Id, attemptId:Id, activationId:Id, reportHash:Hash, reportKind:'question'|'checkpoint'|'blocked'|'final_review', stepId:Id, barrierId:Id|null}} ReportRecord */
/** @typedef {{barrierId:Id, activationId:Id, coverage:'complete'|'partial'|'unknown'}} EffectRecord */
/** @typedef {InspectionView} InspectionRecord */
/** @typedef {{operationId:Id, action:'approve'|'revise'|'answer'|'cancel', reportId:Id, checkpointHash:Hash, continuationOperationId:Id|null, activationId:Id}} DecisionRecord */
/** @typedef {{causeId:Id, reason:HoldReason, scope:HoldScope, at:number, resolvedBy:Id|null}} HoldRecord */
/** @typedef {{messageId:Id, targetId:Id, targetRole:'main'|'supervisor'|'implementer', lane:'ordinary'|'reserved-control', priority:'normal'|'question-answer'|'control', operationId:Id, idempotencyKey:Id, epochSegment:Id, bytes:number, payloadHash:Hash, envelope:MailboxEnvelopeV2, workflowId:Id|null, enqueuedAt:number, disposition:MailboxOutcome|null, released:boolean, consumer:ActorBinding}} MailboxEntryRecord */

/** @typedef {{c:ValidationContext, workflowId:Id, requestId:Id, inputHash:Hash, submissionEvidence:SubmissionEvidence, authorities:Map<Id,RetainedAuthority>, objective:string, constraints:readonly string[], owner:OwnerBinding, supervisorId:Id, implementerId:Id, status:WorkflowStatus, workflowRevision:Id, planRevision:number, steps:readonly PlanStepV2[], planRecorded:boolean, planIntentId:Id|null, plans:Map<Id,PlanRecord>, taskPlans:Map<Id,TaskPlanView>, structuralRevisionOperations:Set<Id>, intents:Map<string, SupervisorIntent>, artifacts:Map<string, RetainedArtifact>, inspectionDeliveries:Map<Id, InspectionDeliveryView>, taskBases:Map<Id, TaskBaseView>, heldCommitments:HeldCommitment[], dispositions:TerminalDispositionView[], closureObservations:WorkflowClosedPayload[], implementationGenesis:KernelGenesis, assignment:AssignmentSnapshotV2, budget:BudgetSnapshot, amendments:WorkflowAmendedPayload[], controls:Map<Id,KernelControlPayload>, lifetimeDeadlineAt:number|null, activations:Map<string, ActivationRecord>, questions:Map<string, QuestionRecord>, answers:Map<string, AnswerRecord>, attempts:Map<string, AttemptRecord>, reports:Map<string, ReportRecord>, effects:Map<string, EffectRecord>, inspections:Map<string, InspectionRecord>, decisions:Map<string, DecisionRecord>, usage:UsageEntryView[], holds:HoldRecord[], closed:boolean, disposed:boolean, openReportId:Id|null}} WorkflowRuntime */
/** @typedef {{actorId:Id, targetRole:'main'|'supervisor'|'implementer', ordinary:MailboxEntryRecord[], control:MailboxEntryRecord[], keys:Map<string,MailboxEntryRecord>, dispositions:Map<string,Readonly<{payload:MailboxDispositionPayload,at:number,owner:OwnerBinding}>>, priorityStreak:number, maxQueuedPerActor:number}} MailboxRuntime */
/** @typedef {{c:ValidationContext, publications:Map<Id,Map<Id,PublishedGrantWitness>>, eventIds:Map<Id,number>, archivedEventIds:Set<Id>, ordinaryCount:number, time:number, mainBinding:ActorBinding|null, lifecycles:Map<Id,ActorLifecycle>, authorizations:Set<Id>, genesis:ActorGenesisV2, segmentId:Id, owner:OwnerBinding, bindings:Map<string,ActorBinding>, workflows:Map<string, WorkflowRuntime>, order:Id[], mailboxes:Map<string, MailboxRuntime>, mailboxMessages:Map<Id,MailboxEntryRecord>, mailboxObservations:Set<Id>, mailboxAttempts:Map<Id,Map<Id,AttemptBinding>>, mailboxStageFacts:Map<Id,Map<Id,Map<Id,StageFact>>>, mailboxResolutions:Map<Id,readonly ResolutionRecord[]>, mailboxObservationIds:Set<Id>, actorObservationIds:Set<Id>, holds:HoldRecord[], operations:Set<string>, activations:Set<string>, reports:Set<string>, receipts:Set<string>, usageIds:Set<string>, implementation:Record<string, CoordinationModel>, outcome:'apply'|'noop'|'hold', eventCount:number, usage:UsageEntryView[]}} Replay */

const ACTOR_KINDS = /** @type {const} */ (['kernel-control-authorized','supervisor-accounting-reconciled','actor-lifecycle','workflow-amended','workflow-escalated','activation-contained','task-base-recorded','inspection-delivery-observed','artifact-retained','workflow-submitted','plan-recorded','activation-issued','activation-delivery-observed','supervisor-intent-recorded','activation-settled','mailbox-enqueued','mailbox-disposition','mailbox-attempt-bound','mailbox-delivery-observed','mailbox-reconciled','question-raised','answer-recorded','attempt-opened','report-observed','effects-observed','inspection-recorded','decision-recorded','supervisor-usage-recorded','hold-recorded','hold-resolved','owner-transitioned','workflow-closed']);
const METRIC_KINDS = /** @type {const} */ (['inputTokens','outputTokens','costUsd']);
const REASONS = /** @type {const} */ (['disabled','stopped','paused','stale-owner','legacy','budget','unknown-accounting','uncertain-effect','uncertain-delivery','unsupported','capacity','evidence','interrupted']);
const HOLD_CODES = new Set(['admission-hold','unresolved-reference','unsettled-activation','mailbox-capacity']);

/** @param {string} code @param {string} path @param {string} message @param {'corrupt'|'unsupported'} [category] @returns {never} */
function fail(code, path, message, category = 'corrupt') { throw new ContractValidationError(code, path, message, category); }
/** @param {unknown} condition @param {string} code @param {string} path @param {string} message @param {'corrupt'|'unsupported'} [category] @returns {asserts condition} */
function ok(condition, code, path, message, category = 'corrupt') { if (!condition) fail(code, path, message, category); }
/** @param {unknown} value @param {string} path @returns {Record<string, unknown>} */
function plain(value, path) { ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid-shape', path, 'Expected closed record'); return /** @type {Record<string, unknown>} */ (value); }
/** @param {unknown} value @param {readonly string[]} keys @param {readonly string[]} optional @param {string} path @returns {Record<string, unknown>} */
function closed(value, keys, optional, path) {
  const v = plain(value, path);
  ok(Object.keys(v).every(k => keys.includes(k) || optional.includes(k)), 'unexpected-field', path, 'Unexpected field');
  ok(keys.every(k => Object.hasOwn(v, k)), 'missing-field', path, 'Missing required field');
  return v;
}
/** @param {unknown} value @param {string} path @param {number} [min] @param {number} [max] @returns {unknown[]} */
function arr(value, path, min = 0, max = COMMON_BOUNDS.maxEvents) { ok(Array.isArray(value), 'invalid-shape', path, 'Expected array'); ok(value.length >= min && value.length <= max, 'capacity', path, 'Array bound exceeded'); return value; }
/** @param {unknown} value @param {string} path @param {number} [min] @returns {number} */
function int(value, path, min = 0) { ok(typeof value === 'number' && Number.isSafeInteger(value) && value >= min, 'invalid-counter', path, 'Expected safe integer'); return /** @type {number} */ (value); }
/** Bounded structural UTF-8 byte text. Rejects lone surrogates and enforces the
 * accepted scalar-valid UTF-8 byte ceiling, not a UTF-16 code-unit count.
 * @param {unknown} value @param {string} path @param {number} [max] @returns {string} */
function str(value, path, max = COMMON_BOUNDS.maxTextBytes) {
  ok(typeof value === 'string', 'invalid-text', path, 'Expected bounded text');
  const s = /** @type {string} */ (value);
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const low = s.charCodeAt(i + 1);
      ok(low >= 0xdc00 && low <= 0xdfff, 'invalid-text', path, 'Lone surrogate');
      bytes += 4; i++;
    } else {
      ok(c < 0xdc00 || c > 0xdfff, 'invalid-text', path, 'Lone surrogate');
      bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    ok(bytes <= max, 'invalid-text', path, 'Text byte limit exceeded');
  }
  return s;
}
/** @template {string} T @param {unknown} value @param {readonly T[]} options @param {string} path @returns {T} */
function pick(value, options, path) { const match = options.find(x => x === value); ok(match !== undefined, 'invalid-discriminant', path, 'Unsupported value'); return /** @type {T} */ (match); }
/** @param {unknown} value @param {string} path @returns {Id} */
function id(value, path) { return /** @type {Id} */ (validateId(value, path)); }
/** @param {unknown} value @param {string} path @returns {Hash} */
function hash(value, path) { return /** @type {Hash} */ (validateHash(value, path)); }
/** Bounded structural equality: property-order insensitive, array-order
 * sensitive, depth-capped. Used only on already-captured/private JSON, including
 * validated V1 implementation events inside V2 envelopes/caches. This comparison
 * does not canonicalize or hash them: kernel parsing still validates each original-
 * order decision inputHash before comparison. No new V1 hash failure is established.
 * @param {unknown} a @param {unknown} b @param {number} [depth] @returns {boolean} */
function same(a, b, depth = 0) {
  if (a === b) return true;
  if (depth > COMMON_BOUNDS.maxDepth) return false;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i], depth + 1)) return false;
    return true;
  }
  const ra = /** @type {Record<string, unknown>} */ (a), rb = /** @type {Record<string, unknown>} */ (b);
  const ka = Object.keys(ra), kb = Object.keys(rb);
  if (ka.length !== kb.length) return false;
  for (const k of ka) { if (!Object.hasOwn(rb, k) || !same(ra[k], rb[k], depth + 1)) return false; }
  return true;
}
/** Deep-freeze privately captured/constructed plain JSON in place. Bounded by the
 * values already admitted by the shared validators; cycles guarded by `seen`.
 * @template T @param {T} value @param {WeakSet<object>} [seen] @returns {T} */
function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  Object.freeze(value);
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) deepFreeze(value[i], seen); }
  else { const r = /** @type {Record<string, unknown>} */ (value); for (const key of Object.keys(r)) deepFreeze(r[key], seen); }
  return value;
}
/** Adapt ONLY the expected kernel class at a parse seam. Programming errors escape.
 * @param {unknown} error @param {string} path @returns {never} */
function rethrowKernel(error, path) {
  if (error instanceof CoordinationValidationError) {
    const category = error.message.startsWith('Unsupported') ? 'unsupported' : 'corrupt';
    fail('invalid-shape', path, error.message, category);
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Event payload parsing
// ---------------------------------------------------------------------------

/** @param {unknown} value @param {string} path @param {ValidationContext} c @returns {KernelGenesis} */
function parseKernelGenesis(value, path, c) {
  const deepFreeze = freezingInContext(c);
  /** @type {CoordinationModel} */ let model;
  try { model = validateCoordinationModelInContext({ mode: 'internal-non-authorizing', genesis: value, events: [] }, c); }
  catch (error) { return rethrowKernel(error, path); }
  const g = model.genesis;
  return deepFreeze({ fence: g.fence, legacy: g.legacy, holds: g.holds });
}

/** Every key is supplied and checked, including the complete kernel seed. The
 * equality check prevents any nested parser projection from changing the preimage.
 * @param {unknown} value @param {string} path @param {ValidationContext} c @returns {WorkflowSubmissionInputV2} */
function parseSubmissionInput(value, path, c) {
  const v = closed(value,['version','kind','storeId','workflowId','workflowRevision','requestId','owner','issuer','objective','constraints','supervisorId','implementerId','lifetimeDeadlineAt','assignment','implementationGenesis'],[],path);
  ok(v.version === 2 && v.kind === 'workflow-submission','invalid-field',path,'Expected complete workflow submission input v2');
  const text = stringsInContext(c);
  /** @type {WorkflowSubmissionInputV2} */
  const input = {version:2,kind:'workflow-submission',storeId:id(v.storeId,path),workflowId:id(v.workflowId,path),workflowRevision:id(v.workflowRevision,path),requestId:id(v.requestId,path),owner:validateOwnerBinding(v.owner,c),issuer:validateActorBinding(v.issuer,c),objective:text(v.objective,path),constraints:arraysInContext(c)(v.constraints,path,0,64).map(x => text(x,path,1000)),supervisorId:id(v.supervisorId,path),implementerId:id(v.implementerId,path),lifetimeDeadlineAt:v.lifetimeDeadlineAt === null ? null : int(v.lifetimeDeadlineAt,path),assignment:validateAssignmentSnapshotV2(v.assignment,c),implementationGenesis:parseKernelGenesis(v.implementationGenesis,path,c)};
  ok(sameWork(value,input,c),'inconsistent-reference',path,'Submission input must retain complete supplied content');
  return freezeWork(input,c);
}

/** @param {unknown} value @param {string} path @param {ValidationContext} c @returns {DeadlineWindow} */
function parseDeadline(value, path, c) {
  const deepFreeze = freezingInContext(c);
  const v = closed(value, ['admissionAt', 'expiresAt'], [], path);
  const admissionAt = int(v.admissionAt, `${path}.admissionAt`);
  const expiresAt = int(v.expiresAt, `${path}.expiresAt`);
  ok(expiresAt >= admissionAt && expiresAt - admissionAt <= COMMON_BOUNDS.maxRequestLifetimeMs, 'invalid-counter', path, 'Invalid request deadline window');
  return deepFreeze({ admissionAt, expiresAt });
}

/** @param {unknown} value @param {string} path @param {ValidationContext} c @returns {PlanStepV2} */
function parseStep(value, path, c) {
  const deepFreeze = freezingInContext(c), str = stringsInContext(c);
  const v = closed(value, ['id', 'title', 'description'], [], path);
  return deepFreeze({ id: id(v.id, `${path}.id`), title: str(v.title, `${path}.title`, 1000), description: str(v.description, `${path}.description`, COMMON_BOUNDS.maxTextBytes) });
}

/** Shared-context leaf validation is intrinsic only. The fold compares this binding
 * with the actual earlier producer; supplied expected data is never a capability.
 * @param {unknown} value @param {string} path @param {ValidationContext} c @returns {ActorControlV2} */
function parseControl(value, path, c) {
  const v = closed(value, ['content','digest'], [], path);
  const content = closed(v.content, ['binding','input'], [], `${path}.content`);
  return validateActorControlV2InContext(v, validateActorControlBinding(content.binding, c), c);
}

/** Exactly the accepted settlement-free link; no fabricated settlement witness.
 * @param {unknown} value @param {string} path @param {ValidationContext} c @returns {ReviewLink} */
function parseReviewLink(value, path, c) {
  const deepFreeze = freezingInContext(c);
  const v = closed(value, ['actor','profile','workflowId','workflowRevision','activationId','intentId','intentHash','operationId','reportId','reportHash','checkpointHash','request','reply','receipt'], [], path);
  const actor = validateActorBinding(v.actor, c);
  ok(actor.role === 'supervisor' && v.profile === 'supervisor-restricted', 'invalid-field', path, 'Expected restricted supervisor');
  return deepFreeze({actor, profile:'supervisor-restricted', workflowId:id(v.workflowId, path), workflowRevision:id(v.workflowRevision, path), activationId:id(v.activationId, path), intentId:id(v.intentId, path), intentHash:hash(v.intentHash, path), operationId:id(v.operationId, path), reportId:id(v.reportId, path), reportHash:hash(v.reportHash, path), checkpointHash:hash(v.checkpointHash, path), request:validateArtifactRef(v.request,c), reply:validateArtifactRef(v.reply,c), receipt:validateArtifactRef(v.receipt,c)});
}

/** @param {ReviewerWitness} review @returns {ReviewLink} */
function reviewLinkOf(review) { const {settlement, ...link} = review; return link; }

/** @param {ProducerActivation} a @param {Id} operationId @param {Hash} inputHash @returns {ActorControlBinding} */
function producerBinding(a, operationId, inputHash) {
  return {wireVersion:2, owner:a.owner, actor:a.actor, nonce:a.nonce, operationId, profile:a.profile, workflowId:a.workflowId, workflowRevision:a.workflowRevision, activationId:a.activationId, identity:a.identity, inputHash, grantProof:a.grantProof};
}

/** @param {unknown} value @param {ActorBinding} issuer @param {ValidationContext} c @param {string} at @returns {HumanAuthorization} */
function parseHumanAuthorization(value, issuer, c, at) {
  const deepFreeze = freezingInContext(c);
  const v = closed(value,['authorizationId','principal','authorizedAt','reason','owner','main'],[],at);
  const main = validateActorBinding(v.main,c), owner = validateOwnerBinding(v.owner,c);
  ok(issuer.role === 'main' && sameWork(issuer,main,c) && main.ownerSession === owner.ownerSession && main.ownerEpoch === owner.ownerEpoch && main.sessionId === owner.ownerSession,'inconsistent-reference',at,'Human authorization requires exact Main/owner binding');
  return deepFreeze({authorizationId:id(v.authorizationId,at),principal:pick(v.principal,['human'],at),authorizedAt:int(v.authorizedAt,at),reason:str(v.reason,at),owner,main});
}

/** @param {unknown} value @param {string} path @param {ValidationContext} c @returns {ActorPayload} */
function parseActorPayload(value, path, c) {
  const deepFreeze = freezingInContext(c), arr = arraysInContext(c), str = stringsInContext(c);
  const v = plain(captureValidationWork(value,path,c), path);
  const kind = pick(v.kind, ACTOR_KINDS, `${path}.kind`);
  const issuer = validateActorBinding(v.issuer, c);
  switch (kind) {
    case 'kernel-control-authorized': {
      const n = closed(v,['kind','issuer','event','authorization'],[],path);
      const event = parseImplementationPayload(n.event,path,c);
      ok(event.kind === 'lifecycle','invalid-field',path,'Only closed kernel lifecycle control is authorized here');
      return deepFreeze({kind,issuer,event,authorization:parseHumanAuthorization(n.authorization,issuer,c,path)});
    }
    case 'supervisor-accounting-reconciled': {
      const n = closed(v,['kind','issuer','activationId','binding','source','observationId','at','coveredObservationIds'],['resolutions'],path);
      ok(issuer.role === 'main','invalid-field',path,'Accounting reconciliation requires Main');
      const coveredObservationIds = arr(n.coveredObservationIds,path,1).map(x => id(x,path));
      ok(new Set(workArray(coveredObservationIds,c)).size === coveredObservationIds.length,'conflicting-duplicate',path,'Duplicate accounting coverage');
      const optional = Object.hasOwn(n,'resolutions') ? {resolutions:arr(n.resolutions,path).map(raw => {
        const r = closed(raw,['metric','unknownObservationId','evidenceObservationId'],[],path);
        return {metric:pick(r.metric,METRIC_KINDS,path),unknownObservationId:id(r.unknownObservationId,path),evidenceObservationId:id(r.evidenceObservationId,path)};
      })} : {};
      return deepFreeze({kind,issuer,activationId:id(n.activationId,path),binding:validateActorControlBinding(n.binding,c),source:pick(n.source,['trusted-accounting'],path),observationId:id(n.observationId,path),at:int(n.at,path),coveredObservationIds,...optional});
    }
    case 'actor-lifecycle': {
      const n = closed(v,['kind','issuer','actorId','expectedRevision','command','authorization'],[],path);
      return deepFreeze({kind,issuer,actorId:id(n.actorId,path),expectedRevision:int(n.expectedRevision,path),command:pick(n.command,['enable','disable','start','stop','pause','resume'],path),authorization:parseHumanAuthorization(n.authorization,issuer,c,path)});
    }
    case 'workflow-amended': {
      const n = closed(v,['kind','issuer','operationId','expectedRevision','before','after','kernelOperationId','authorization'],[],path);
      return deepFreeze({kind,issuer,operationId:id(n.operationId,path),expectedRevision:id(n.expectedRevision,path),before:validateBudgetSnapshot(n.before,c),after:validateBudgetSnapshot(n.after,c),kernelOperationId:n.kernelOperationId === null ? null : id(n.kernelOperationId,path),authorization:parseHumanAuthorization(n.authorization,issuer,c,path)});
    }
    case 'workflow-escalated': {
      const n = closed(v,['kind','issuer','reason','authorization'],[],path);
      return deepFreeze({kind,issuer,reason:str(n.reason,path),authorization:parseHumanAuthorization(n.authorization,issuer,c,path)});
    }
    case 'activation-contained': {
      const n = closed(v,['kind','issuer','activationId','binding','observationId','at','outcome','deliveryObservationIds','settlementObservationId','barrierId'],['settlementObservationIds'],path);
      ok(issuer.role === 'main','invalid-field',path,'Containment requires Main observation');
      const deliveryObservationIds = arr(n.deliveryObservationIds,path).map(x => id(x,path));
      ok(new Set(workArray(deliveryObservationIds,c)).size === deliveryObservationIds.length,'conflicting-duplicate',path,'Duplicate delivery coverage');
      const optional = Object.hasOwn(n,'settlementObservationIds') ? {settlementObservationIds:parseNamedIds(n.settlementObservationIds,path,c)} : {};
      return deepFreeze({kind,issuer,activationId:id(n.activationId,path),binding:validateActorControlBinding(n.binding,c),observationId:id(n.observationId,path),at:int(n.at,path),outcome:pick(n.outcome,['not-sent','contained'],path),deliveryObservationIds,settlementObservationId:n.settlementObservationId === null ? null : id(n.settlementObservationId,path),barrierId:n.barrierId === null ? null : id(n.barrierId,path),...optional});
    }
    case 'task-base-recorded': {
      const n = closed(v,['kind','issuer','taskId','dispatchOperationId','identity'],[],path);
      ok(issuer.role === 'main', 'invalid-field', path, 'Pre-work base requires Main');
      return deepFreeze({kind,issuer,taskId:id(n.taskId,path),dispatchOperationId:id(n.dispatchOperationId,path),identity:parseNativeIdentity(n.identity,path,c)});
    }
    case 'inspection-delivery-observed': {
      const n = closed(v,['kind','issuer','activationId','reply','observation'],[],path);
      const o = closed(n.observation,['observationId','at'],[],`${path}.observation`);
      ok(issuer.role === 'main', 'invalid-field', path, 'Inspection delivery observation requires Main');
      return deepFreeze({kind,issuer,activationId:id(n.activationId,path),reply:validateArtifactRef(n.reply,c),observation:{observationId:id(o.observationId,path),at:int(o.at,path)}});
    }
    case 'artifact-retained': {
      ok(issuer.role === 'main', 'invalid-field', path, 'Source retention requires Main');
      const purpose = plain(v.purpose, `${path}.purpose`);
      const purposeKind = pick(purpose.kind, ['inspection','inspection-content','evidence','authority-content'], `${path}.purpose.kind`);
      if (purposeKind === 'inspection-content') {
        const n = closed(v,['kind','issuer','purpose','artifact','inspection'],[],path);
        closed(purpose,['kind'],[],`${path}.purpose`);
        // Actual structured content pays capture/encoding/work costs. Its nested
        // references pay here once; replay uses this private parsed event only.
        const artifact = validateArtifactRef(n.artifact,c), inspection = parseInspectionArtifact(n.inspection,c,`${path}.inspection`);
        ok(artifact.hash === inspection.digest,'inconsistent-reference',path,'Inline inspection artifact must hash its content');
        return deepFreeze({kind,issuer,purpose:{kind:purposeKind},artifact,inspection});
      }
      if (purposeKind === 'authority-content') {
        const n = closed(v,['kind','issuer','purpose','authority'],[],path);
        closed(purpose,['kind'],[],`${path}.purpose`);
        const a = closed(n.authority,['content','digest'],[],`${path}.authority`), content = plain(a.content,`${path}.authority.content`);
        // Intrinsic parsing only. Retention supplies the actual replay binding.
        const expected = {owner:validateOwnerBinding(content.owner,c),workflowId:id(content.workflowId,path),workflowRevision:id(content.workflowRevision,path)};
        return deepFreeze({kind,issuer,purpose:{kind:purposeKind},authority:validateAuthorityArtifactV2InContext(n.authority,expected,c)});
      }
      const n = closed(v, ['kind','issuer','artifact','original','purpose'], [], path);
      /** @type {ArtifactPurpose} */ let checked;
      if (purposeKind === 'inspection') { closed(purpose, ['kind'], [], path); checked = {kind:'inspection'}; }
      else {
        closed(purpose, ['kind','evidenceId','reportId','checkpointHash','part','encoding','hashDomain'], [], `${path}.purpose`);
        const encoding = pick(purpose.encoding, ['pair-json/1','pair-json-v1/1','bytes'], path);
        const hashDomain = pick(purpose.hashDomain, ['bytes','authority','mailbox','inspection','actor-event','control'], path);
        ok(hashDomain === 'bytes' || encoding === 'pair-json/1', 'invalid-field', path, 'Domain-separated evidence requires pair-json/1');
        const part = pick(purpose.part,['envelope','finalized-report','checkpoint','summary','verification','structured-change'],path);
        ok(part !== 'structured-change' || encoding === 'pair-json/1' && hashDomain === 'bytes', 'unsupported-encoding', path, 'Structured change requires pair-json/1 with source-byte hash', 'unsupported');
        checked = {kind:'evidence', evidenceId:id(purpose.evidenceId,path), reportId:id(purpose.reportId,path), checkpointHash:hash(purpose.checkpointHash,path), part, encoding, hashDomain};
      }
      const result = deepFreeze({kind, issuer, artifact:validateArtifactRef(n.artifact,c), original:str(n.original,`${path}.original`,COMMON_BOUNDS.maxEnvelopeBytes), purpose:checked});
      return result;
    }
    case 'workflow-submitted': {
      const n = closed(v, ['kind', 'issuer', 'requestId', 'inputHash', 'objective', 'constraints', 'supervisorId', 'implementerId', 'lifetimeDeadlineAt', 'assignment', 'implementationGenesis'], ['submissionInput'], path);
      const optional = Object.hasOwn(n,'submissionInput') ? {submissionInput:parseSubmissionInput(n.submissionInput,`${path}.submissionInput`,c)} : {};
      const constraints = arr(n.constraints, `${path}.constraints`, 0, 64).map((x, i) => str(x, `${path}.constraints.${i}`, 1000));
      ok(issuer.role === 'main', 'invalid-field', `${path}.issuer`, 'Workflow submission is a Main intent');
      const assignment = validateAssignmentSnapshotV2(n.assignment, c);
      const supervisorId = id(n.supervisorId, `${path}.supervisorId`);
      const implementerId = id(n.implementerId, `${path}.implementerId`);
      ok(assignment.participants.implementer.id === implementerId, 'inconsistent-reference', `${path}.implementerId`, 'Assignment implementer mismatch');
      ok(assignment.participants.supervisor !== null && assignment.participants.supervisor.id === supervisorId, 'inconsistent-reference', `${path}.supervisorId`, 'Assignment supervisor mismatch');
      return deepFreeze({ kind, issuer, requestId: id(n.requestId, `${path}.requestId`), inputHash: hash(n.inputHash, `${path}.inputHash`), objective: str(n.objective, `${path}.objective`), constraints, supervisorId, implementerId, lifetimeDeadlineAt: n.lifetimeDeadlineAt === null ? null : int(n.lifetimeDeadlineAt, `${path}.lifetimeDeadlineAt`), assignment, implementationGenesis: parseKernelGenesis(n.implementationGenesis, `${path}.implementationGenesis`, c), ...optional });
    }
    case 'plan-recorded': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'intentId', 'workflowRevision', 'planRevision', 'steps'], [], path);
      const steps = arr(n.steps, `${path}.steps`, 1, 64).map((x, i) => parseStep(x, `${path}.steps.${i}`,c));
      ok(new Set(workArray(workArray(steps,c).map(s => s.id),c)).size === steps.length, 'conflicting-duplicate', `${path}.steps`, 'Duplicate plan step ID');
      ok(issuer.role === 'supervisor', 'invalid-field', `${path}.issuer`, 'Plan must be issued by the supervisor');
      return deepFreeze({ kind, issuer, activationId: id(n.activationId, `${path}.activationId`), intentId: id(n.intentId, `${path}.intentId`), workflowRevision: id(n.workflowRevision, `${path}.workflowRevision`), planRevision: int(n.planRevision, `${path}.planRevision`, 1), steps });
    }
    case 'activation-issued': {
      const n = closed(v, ['kind', 'issuer', 'workflowRevision', 'activationId', 'operationId', 'intentId', 'intentHash', 'role', 'actorId', 'deadline', 'producer', 'control'], [], path);
      const role = pick(n.role, ['supervisor', 'implementer'], `${path}.role`);
      ok(issuer.role === 'supervisor' || issuer.role === 'main', 'invalid-field', `${path}.issuer`, 'Activation issuer must be Main or supervisor');
      return deepFreeze({ kind, issuer, workflowRevision: id(n.workflowRevision, `${path}.workflowRevision`), activationId: id(n.activationId, `${path}.activationId`), operationId: id(n.operationId, `${path}.operationId`), intentId: id(n.intentId, `${path}.intentId`), intentHash: hash(n.intentHash, `${path}.intentHash`), role, actorId: id(n.actorId, `${path}.actorId`), deadline: parseDeadline(n.deadline, `${path}.deadline`,c), producer: validateActivationRecordV2InContext(n.producer, c), control: parseControl(n.control, `${path}.control`, c) });
    }
    case 'activation-delivery-observed': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'observation'], [], path);
      const o = closed(n.observation, ['observationId', 'at', 'stage', 'commandId', 'inputHash'], [], `${path}.observation`);
      return deepFreeze({kind, issuer, activationId:id(n.activationId, `${path}.activationId`), observation:{observationId:id(o.observationId, `${path}.observation.observationId`), at:int(o.at, `${path}.observation.at`), stage:pick(o.stage, ['sent','accepted','rejected','started'], `${path}.observation.stage`), commandId:id(o.commandId, `${path}.observation.commandId`), inputHash:hash(o.inputHash, `${path}.observation.inputHash`)}});
    }
    case 'supervisor-intent-recorded': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'control'], ['observation'], path);
      const control = parseControl(n.control, `${path}.control`, c);
      ok(issuer.role === 'supervisor' && ['plan','answer','review'].includes(control.content.input.kind), 'invalid-field', path, 'Expected supervisor output control');
      const optional = Object.hasOwn(n,'observation') ? {observation:parseOutputObservation(n.observation,path)} : {};
      return deepFreeze({kind, issuer, activationId:id(n.activationId, `${path}.activationId`), control,...optional});
    }
    case 'activation-settled': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'observationId', 'at', 'phase', 'role'], [], path);
      const role = pick(n.role, ['supervisor', 'implementer'], `${path}.role`);
      const phase = pick(n.phase, ['native-settled', 'transport-closed', 'aborted'], `${path}.phase`);
      ok(issuer.role === role || issuer.role === 'main', 'invalid-field', `${path}.issuer`, 'Settlement must be reported by its producing actor');
      return deepFreeze({ kind, issuer, activationId: id(n.activationId, `${path}.activationId`), observationId: id(n.observationId, `${path}.observationId`), at: int(n.at, `${path}.at`), phase, role });
    }
    case 'mailbox-enqueued': {
      const n = closed(v, ['kind', 'issuer', 'messageId', 'targetId', 'targetRole', 'lane', 'priority', 'operationId', 'idempotencyKey', 'epochSegment', 'bytes', 'payloadHash'], ['envelope'], path);
      const targetRole = pick(n.targetRole, ['main', 'supervisor', 'implementer'], `${path}.targetRole`);
      const lane = pick(n.lane, ['ordinary', 'reserved-control'], `${path}.lane`);
      const priority = pick(n.priority, ['normal', 'question-answer', 'control'], `${path}.priority`);
      ok(lane === 'reserved-control' ? priority === 'control' : priority !== 'control', 'invalid-field', `${path}.priority`, 'Lane/priority mismatch');
      const envelope = Object.hasOwn(n,'envelope') ? {envelope:validateMailboxEnvelopeV2InContext(n.envelope,c)} : {};
      return deepFreeze({ kind, issuer, messageId: id(n.messageId, `${path}.messageId`), targetId: id(n.targetId, `${path}.targetId`), targetRole, lane, priority, operationId: id(n.operationId, `${path}.operationId`), idempotencyKey: id(n.idempotencyKey, `${path}.idempotencyKey`), epochSegment: id(n.epochSegment, `${path}.epochSegment`), bytes: int(n.bytes, `${path}.bytes`), payloadHash: hash(n.payloadHash, `${path}.payloadHash`), ...envelope });
    }
    case 'mailbox-disposition': {
      const n = closed(v, ['kind', 'issuer', 'messageId', 'outcome', 'observationId'], [], path);
      const outcome = pick(n.outcome, ['consumed', 'rejected', 'not-sent', 'unknown'], `${path}.outcome`);
      return deepFreeze({ kind, issuer, messageId: id(n.messageId, `${path}.messageId`), outcome, observationId: id(n.observationId, `${path}.observationId`) });
    }
    case 'mailbox-attempt-bound': {
      const n = closed(v,['kind','issuer','messageId','operationId','commandId','inputHash','controlHash','messageHash','activationId','at'],[],path);
      return deepFreeze({kind,issuer,messageId:id(n.messageId,path),operationId:id(n.operationId,path),commandId:id(n.commandId,path),inputHash:hash(n.inputHash,path),controlHash:hash(n.controlHash,path),messageHash:hash(n.messageHash,path),activationId:n.activationId === null ? null : id(n.activationId,path),at:int(n.at,path)});
    }
    case 'mailbox-delivery-observed': {
      const n = closed(v,['kind','issuer','messageId','operationId','observation','at'],[],path);
      const o = closed(n.observation,['observationId','at','stage','actor','commandId','inputHash'],[],`${path}.observation`);
      return deepFreeze({kind,issuer,messageId:id(n.messageId,path),operationId:id(n.operationId,path),at:int(n.at,path),observation:{observationId:id(o.observationId,path),at:int(o.at,path),stage:pick(o.stage,['sent','accepted','started','run-settled','rejected','ingress'],path),actor:validateActorBinding(o.actor,c),commandId:id(o.commandId,path),inputHash:hash(o.inputHash,path)}});
    }
    case 'mailbox-reconciled': {
      const n = closed(v,['kind','issuer','messageId','dispositionObservationId','priorResolutionId','reconciliationId','observationId','at','resolution'],[],path);
      const r = closed(n.resolution,['kind','evidence'],[],`${path}.resolution`);
      const evidence = workArray(arr(r.evidence,`${path}.resolution.evidence`,1),c).map((ref,i) => parseMailboxEvidence(ref,`${path}.resolution.evidence.${i}`,c));
      return deepFreeze({kind,issuer,messageId:id(n.messageId,path),dispositionObservationId:id(n.dispositionObservationId,path),priorResolutionId:n.priorResolutionId === null ? null : id(n.priorResolutionId,path),reconciliationId:id(n.reconciliationId,path),observationId:id(n.observationId,path),at:int(n.at,path),resolution:{kind:pick(r.kind,['participant-consumed','main-consumed','rejected-before-execution','proven-not-sent','terminally-contained','incomplete-hold'],path),evidence}});
    }
    case 'question-raised': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'questionId', 'reportId'], [], path);
      ok(issuer.role === 'implementer', 'invalid-field', `${path}.issuer`, 'Question must come from the implementer');
      return deepFreeze({ kind, issuer, activationId: id(n.activationId, `${path}.activationId`), questionId: id(n.questionId, `${path}.questionId`), reportId: id(n.reportId, `${path}.reportId`) });
    }
    case 'answer-recorded': {
      const n = closed(v, ['kind', 'issuer', 'questionId', 'answerId', 'activationId', 'intentId', 'operationId'], [], path);
      ok(issuer.role === 'supervisor', 'invalid-field', `${path}.issuer`, 'Answer must come from the supervisor');
      return deepFreeze({ kind, issuer, questionId: id(n.questionId, `${path}.questionId`), answerId: id(n.answerId, `${path}.answerId`), activationId: id(n.activationId, `${path}.activationId`), intentId:id(n.intentId, `${path}.intentId`), operationId:id(n.operationId, `${path}.operationId`) });
    }
    case 'attempt-opened': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'attemptId', 'planRevision', 'stepId'], [], path);
      return deepFreeze({ kind, issuer, activationId: id(n.activationId, `${path}.activationId`), attemptId: id(n.attemptId, `${path}.attemptId`), planRevision: int(n.planRevision, `${path}.planRevision`, 1), stepId: id(n.stepId, `${path}.stepId`) });
    }
    case 'report-observed': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'attemptId', 'reportId', 'reportHash', 'stepId', 'reportKind'], [], path);
      const reportKind = pick(n.reportKind, ['question', 'checkpoint', 'blocked', 'final_review'], `${path}.reportKind`);
      ok(issuer.role === 'implementer', 'invalid-field', `${path}.issuer`, 'Report must come from the implementer');
      return deepFreeze({ kind, issuer, activationId: id(n.activationId, `${path}.activationId`), attemptId: id(n.attemptId, `${path}.attemptId`), reportId: id(n.reportId, `${path}.reportId`), reportHash: hash(n.reportHash, `${path}.reportHash`), stepId: id(n.stepId, `${path}.stepId`), reportKind });
    }
    case 'effects-observed': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'barrierId', 'coverage', 'admittedEffectIds', 'settledEffectIds', 'containedEffectIds', 'unknownEffectIds', 'observationId'], [], path);
      const coverage = pick(n.coverage, ['complete', 'partial', 'unknown'], `${path}.coverage`);
      const admitted = arr(n.admittedEffectIds, `${path}.admittedEffectIds`).map((x, i) => id(x, `${path}.admittedEffectIds.${i}`));
      const settled = arr(n.settledEffectIds, `${path}.settledEffectIds`).map((x, i) => id(x, `${path}.settledEffectIds.${i}`));
      const contained = arr(n.containedEffectIds, `${path}.containedEffectIds`).map((x, i) => id(x, `${path}.containedEffectIds.${i}`));
      const unknown = arr(n.unknownEffectIds, `${path}.unknownEffectIds` , 0).map((x, i) => id(x, `${path}.unknownEffectIds.${i}`));
      ok(workArray([...workArray(settled,c), ...workArray(contained,c), ...workArray(unknown,c)],c).every(x => workArray(admitted,c).includes(x)), 'inconsistent-reference', path, 'Unadmitted effect');
      ok(new Set(workArray([...workArray(settled,c), ...workArray(contained,c), ...workArray(unknown,c)],c)).size === settled.length + contained.length + unknown.length, 'conflicting-duplicate', path, 'Effect classifications overlap');
      return deepFreeze({ kind, issuer, activationId: id(n.activationId, `${path}.activationId`), barrierId: id(n.barrierId, `${path}.barrierId`), coverage, admittedEffectIds: admitted, settledEffectIds: settled, containedEffectIds: contained, unknownEffectIds: unknown, observationId: id(n.observationId, `${path}.observationId`) });
    }
    case 'inspection-recorded': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'receiptId', 'requestId', 'replyId', 'reportId', 'checkpointHash', 'scope', 'review', 'evidenceIds'], [], path);
      const scope = parseScope(n.scope, `${path}.scope`,c);
      const review = parseReviewLink(n.review, `${path}.review`, c);
      ok(issuer.role === 'supervisor', 'invalid-field', `${path}.issuer`, 'Inspection must come from the supervisor');
      const receiptId = id(n.receiptId, `${path}.receiptId`), requestId = id(n.requestId, `${path}.requestId`), replyId = id(n.replyId, `${path}.replyId`);
      ok(requestId !== replyId && requestId !== receiptId && replyId !== receiptId, 'conflicting-duplicate', path, 'Inspection logical IDs must be distinct');
      const evidenceIds = arr(n.evidenceIds, `${path}.evidenceIds`, 0, COMMON_BOUNDS.maxInspectionReceipts).map((x, i) => id(x, `${path}.evidenceIds.${i}`));
      return deepFreeze({ kind, issuer, activationId: id(n.activationId, `${path}.activationId`), receiptId, requestId, replyId, reportId: id(n.reportId, `${path}.reportId`), checkpointHash: hash(n.checkpointHash, `${path}.checkpointHash`), scope, review, evidenceIds });
    }
    case 'decision-recorded': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'operationId', 'action', 'reportId', 'checkpointHash', 'review', 'continuationOperationId'], [], path);
      const action = pick(n.action, ['approve', 'revise', 'answer', 'cancel'], `${path}.action`);
      const review = validateReviewerWitness(n.review, c);
      ok(issuer.role === 'supervisor', 'invalid-field', `${path}.issuer`, 'Decision must come from the supervisor');
      const continuationOperationId = n.continuationOperationId === null ? null : id(n.continuationOperationId, `${path}.continuationOperationId`);
      ok(action !== 'cancel' || continuationOperationId === null, 'invalid-field', `${path}.continuationOperationId`, 'Cancellation cannot continue; other outcomes are kernel-derived');
      return deepFreeze({ kind, issuer, activationId: id(n.activationId, `${path}.activationId`), operationId: id(n.operationId, `${path}.operationId`), action, reportId: id(n.reportId, `${path}.reportId`), checkpointHash: hash(n.checkpointHash, `${path}.checkpointHash`), review, continuationOperationId });
    }
    case 'supervisor-usage-recorded': {
      const n = closed(v, ['kind', 'issuer', 'activationId', 'usageId', 'observationId', 'observedAt', 'metric', 'value'], [], path);
      const metric = pick(n.metric, METRIC_KINDS, `${path}.metric`);
      ok(issuer.role === 'supervisor', 'invalid-field', `${path}.issuer`, 'Supervisor usage must come from the supervisor');
      const value = n.value;
      ok(value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER && (metric === 'costUsd' || Number.isSafeInteger(value)), 'invalid-counter', `${path}.value`, 'Expected unknown or safe nonnegative metric');
      return deepFreeze({ kind, issuer, activationId: id(n.activationId, `${path}.activationId`), usageId: id(n.usageId, `${path}.usageId`), observationId: id(n.observationId, `${path}.observationId`), observedAt:int(n.observedAt,`${path}.observedAt`), metric, value });
    }
    case 'hold-recorded': {
      const n = closed(v, ['kind', 'issuer', 'holdId', 'reason', 'scope', 'at'], [], path);
      const reason = pick(n.reason, REASONS, `${path}.reason`);
      const s = closed(n.scope, ['kind', 'id'], [], `${path}.scope`);
      const sk = pick(s.kind, ['root', 'actor', 'workflow', 'activation', 'operation', 'mailbox'], `${path}.scope.kind`);
      return deepFreeze({ kind, issuer, holdId: id(n.holdId, `${path}.holdId`), reason, scope: { kind: sk, id: id(s.id, `${path}.scope.id`) }, at: int(n.at, `${path}.at`) });
    }
    case 'hold-resolved': {
      const n = closed(v,['kind','issuer','holdId','observationId','resolution'],[],path), r = plain(n.resolution,path);
      ok(issuer.role === 'main','invalid-field',path,'Hold resolution requires Main');
      const rk = pick(r.kind,['lifecycle','budget','containment','kernel','accounting','mailbox'],path);
      /** @type {HoldResolution} */ let resolution;
      if (rk === 'lifecycle') { closed(r,['kind','actorId','revision'],[],path); resolution = {kind:rk,actorId:id(r.actorId,path),revision:int(r.revision,path)}; }
      else if (rk === 'budget') { closed(r,['kind','workflowId','budgetRevision'],[],path); resolution = {kind:rk,workflowId:id(r.workflowId,path),budgetRevision:id(r.budgetRevision,path)}; }
      else if (rk === 'kernel') { closed(r,['kind','workflowId','causeId'],[],path); resolution = {kind:rk,workflowId:id(r.workflowId,path),causeId:id(r.causeId,path)}; }
      else if (rk === 'mailbox') { closed(r,['kind','messageId','reconciliationId'],[],path); resolution = {kind:rk,messageId:id(r.messageId,path),reconciliationId:id(r.reconciliationId,path)}; }
      else { closed(r,['kind','workflowId','activationId'],[],path); resolution = {kind:rk,workflowId:id(r.workflowId,path),activationId:id(r.activationId,path)}; }
      return deepFreeze({kind,issuer,holdId:id(n.holdId,path),observationId:id(n.observationId,path),resolution});
    }
    case 'owner-transitioned': {
      const n = closed(v, ['kind', 'issuer', 'next'], [], path);
      ok(issuer.role === 'main', 'invalid-field', `${path}.issuer`, 'Owner transition is a Main intent');
      return deepFreeze({ kind, issuer, next: validateOwnerBinding(n.next, c) });
    }
    case 'workflow-closed': {
      const n = closed(v, ['kind', 'issuer', 'workflowId', 'outcome', 'observationId'], ['disposition'], path);
      const outcome = pick(n.outcome, ['completed', 'cancelled', 'escalated'], `${path}.outcome`);
      ok(issuer.role === 'main' || issuer.role === 'supervisor', 'invalid-field', `${path}.issuer`, 'Closure must be Main or supervisor');
      /** @type {{disposition?:LogicalDisposition}} */ const optional = {};
      if (Object.hasOwn(n,'disposition')) {
        const d = closed(n.disposition,['authorization','obligationIds'],[],path);
        optional.disposition = {authorization:parseHumanAuthorization(d.authorization,issuer,c,path),obligationIds:parseNamedIds(d.obligationIds,path,c)};
      }
      return deepFreeze({ kind, issuer, workflowId: id(n.workflowId, `${path}.workflowId`), outcome, observationId: id(n.observationId, `${path}.observationId`),...optional });
    }
  }
  return fail('unsupported-version', path, 'Unknown actor event kind', 'unsupported');
}

/** @param {unknown} value @param {string} path @returns {OutputObservation} */
function parseOutputObservation(value,path) {
  const o = closed(value,['observationId','at'],[],path);
  return {observationId:id(o.observationId,path),at:int(o.at,path)};
}
/** @param {unknown} value @param {string} path @param {ValidationContext} c @returns {Id[]} */
function parseNamedIds(value,path,c) {
  const ids = arraysInContext(c)(value,path).map(x => id(x,path));
  ok(new Set(workArray(ids,c)).size === ids.length,'conflicting-duplicate',path,'Duplicate named reference');
  return ids;
}

/** Closed inspection-view scope. Every non-file branch rejects extra keys too.
 * @param {unknown} value @param {string} path @param {ValidationContext} c @returns {InspectionScope} */
function parseScope(value, path, c) {
  const deepFreeze = freezingInContext(c), str = stringsInContext(c);
  const v = plain(value, path);
  const k = pick(v.kind, ['all', 'summary', 'patch', 'verification', 'file'], `${path}.kind`);
  if (k === 'file') {
    const n = closed(v, ['kind', 'path'], [], path), file = str(n.path, `${path}.path`, COMMON_BOUNDS.maxTextBytes);
    consumeValidationWork(c,file.length,'actor.scope-trim');
    ok(file.trim().length > 0, 'invalid-text', `${path}.path`, 'Inspection file path must be nonempty');
    return deepFreeze({kind:'file',path:file});
  }
  closed(v, ['kind'], [], path);
  return deepFreeze({ kind: /** @type {'all'|'summary'|'patch'|'verification'} */ (k) });
}

/** @param {unknown} value @param {string} path @param {ValidationContext} c @returns {TransitionEvent} */
function parseImplementationPayload(value, path, c) {
  try { return validateTransitionEventInContext(value, c); }
  catch (error) { return rethrowKernel(error, path); }
}

/** @param {unknown} value @param {string} path @param {ValidationContext} c @returns {ActorWorkflowEventV2} */
function parseWorkflowEvent(value, path, c) {
  const deepFreeze = freezingInContext(c);
  const v = closed(value, ['eventId', 'sequence', 'at', 'owner', 'workflowId', 'domain', 'payload'], [], path);
  const eventId = id(v.eventId, `${path}.eventId`);
  const sequence = int(v.sequence, `${path}.sequence`, 1);
  const at = int(v.at, `${path}.at`);
  const owner = validateOwnerBinding(v.owner, c);
  const workflowId = v.workflowId === null ? null : id(v.workflowId, `${path}.workflowId`);
  const domain = pick(v.domain, ['actor', 'implementation'], `${path}.domain`);
  if (domain === 'actor') {
    const payload = parseActorPayload(v.payload,`${path}.payload`,c);
    const event = deepFreeze({eventId,sequence,at,owner,workflowId,domain:/** @type {const} */ ('actor'),payload});
    if (payload.kind === 'task-base-recorded' || payload.kind === 'artifact-retained' || payload.kind === 'inspection-delivery-observed') ok(Buffer.byteLength(encodePairJSON(event,c),'utf8') <= COMMON_BOUNDS.maxEnvelopeBytes, 'capacity', path, 'Inspection event including metadata exceeds envelope bound');
    return event;
  }
  return deepFreeze({ eventId, sequence, at, owner, workflowId, domain: /** @type {'implementation'} */ ('implementation'), payload: parseImplementationPayload(v.payload, `${path}.payload`, c) });
}

/** @param {unknown} value @param {string} path @param {ValidationContext} c @returns {ParsedRoot} */
function parseRoot(value, path, c) {
  const deepFreeze = freezingInContext(c);
  const v = closed(value, ['version', 'encoding', 'segmentId', 'genesis', 'events', 'archiveHead'], [], path);
  ok(v.version === 2, 'unsupported-version', `${path}.version`, 'Expected actor state version 2', 'unsupported');
  ok(v.encoding === 'pair-actor-state/1', 'unsupported-version', `${path}.encoding`, 'Expected pair-actor-state/1', 'unsupported');
  const segmentId = id(v.segmentId, `${path}.segmentId`);
  const genesis = parseGenesis(v.genesis, `${path}.genesis`, c);
  const rawEvents = arr(v.events, `${path}.events`, 0, COMMON_BOUNDS.maxEvents);
  const events = workArray(rawEvents,c).map((entry, i) => parseWorkflowEvent(entry, `${path}.events.${i}`, c));
  /** @type {Set<Id>} */ const seen = new Set();
  consumeValidationWork(c,events.length,'actor.event-invariants');
  for (let i = 0; i < events.length; i++) {
    ok(events[i].sequence === i + 1, 'invalid-counter', `${path}.events.${i}.sequence`, 'Sequence must be consecutive from 1');
    ok(!seen.has(events[i].eventId), 'conflicting-duplicate', `${path}.events.${i}.eventId`, 'Duplicate event ID');
    seen.add(events[i].eventId);
  }
  const archiveHead = v.archiveHead === null ? null : validateArchiveReferenceV2(v.archiveHead, c);
  return deepFreeze({ segmentId, genesis, events, archiveHead });
}

/** @param {unknown} value @param {string} path @param {ValidationContext} c @returns {ActorGenesisV2} */
function parseGenesis(value, path, c) {
  const deepFreeze = freezingInContext(c), arr = arraysInContext(c);
  const v = closed(value, ['storeId', 'initialOwner', 'actorDefinitions', 'configSnapshot', 'heldLegacyRefs', 'checkpoint'], [], path);
  const storeId = id(v.storeId, `${path}.storeId`);
  const initialOwner = validateOwnerBinding(v.initialOwner, c);
  /** @type {Set<Id>} */ const actorIds = new Set();
  const actorDefinitions = arr(v.actorDefinitions, `${path}.actorDefinitions`, 1, COMMON_BOUNDS.maxActorDefinitions).map((entry, i) => {
    const def = validateActorDefinitionV3(entry, c);
    ok(!actorIds.has(def.id), 'conflicting-duplicate', `${path}.actorDefinitions.${i}`, 'Duplicate actor definition ID');
    actorIds.add(def.id);
    return def;
  });
  const configSnapshot = validateActorConfigV3InContext(v.configSnapshot, c);
  /** @type {Set<string>} */ const refs = new Set();
  const heldLegacyRefs = arr(v.heldLegacyRefs, `${path}.heldLegacyRefs`, 0, COMMON_BOUNDS.maxReferences).map((entry, i) => {
    const ref = validateArtifactRef(entry, c);
    ok(!refs.has(ref.ref), 'conflicting-duplicate', `${path}.heldLegacyRefs.${i}`, 'Duplicate held-legacy ref');
    refs.add(ref.ref);
    return ref;
  });
  const checkpoint = v.checkpoint === null ? null : validateArchiveCheckpointV2(v.checkpoint, c);
  return deepFreeze({ storeId, initialOwner, actorDefinitions, configSnapshot, heldLegacyRefs, checkpoint });
}

// ---------------------------------------------------------------------------
// Inspection artifact resolution (checked content, not refs)
// ---------------------------------------------------------------------------

/** Locator text is not identity. JSON tuple encoding is unambiguous even when a
 * locator contains separators. Neither different hashes nor workflows overwrite.
 * @param {ArtifactRef} ref @param {ValidationContext} c @returns {string} */
function artifactKey(ref,c) { const tuple = [ref.ref,ref.hash]; chargeActorWork(tuple,c); return JSON.stringify(tuple); }

/** Conservative portable POSIX names, without normalization or filesystem access.
 * Non-ASCII names, backslashes, dot segments, .git and case aliases are unsupported.
 * @param {unknown} value @param {string} at @param {ValidationContext} c @returns {string} */
function nativePath(value, at, c) {
  const name = stringsInContext(c)(value,at);
  consumeValidationWork(c,name.length,'actor.path-split');
  const parts = name.split('/');
  ok(workArray(parts,c).every(p => /^[A-Za-z0-9_.-]+$/.test(p) && p !== '.' && p !== '..' && p.toLowerCase() !== '.git' && !p.endsWith('.')), 'unsupported-path', at, 'Expected unaliased portable repository-relative path', 'unsupported');
  return name;
}

/** Reject case aliases at every path component, not only at whole-file names.
 * @param {readonly string[]} names @param {string} at @param {ValidationContext} c */
function nativeNamesUnaliased(names, at, c) {
  /** @type {Map<string,string>} */ const spellings = new Map();
  for (const name of workArray(names,c)) {
    let prefix = '';
    for (const part of workArray(name.split('/'),c)) {
      consumeValidationWork(c,prefix.length + part.length + 1,'actor.path-prefix');
      prefix = prefix ? `${prefix}/${part}` : part;
      consumeValidationWork(c,prefix.length * 2,'actor.path-alias');
      const key = prefix.toLowerCase(), previous = spellings.get(key);
      ok(previous === undefined || previous === prefix, 'unsupported-path', at, 'Snapshot path component has a case alias', 'unsupported');
      spellings.set(key,prefix);
    }
  }
}

/** This constructor deliberately reproduces native evidence.js field order, NOT
 * V2 sorted order. Input member order is immaterial; entry ARRAY order is not.
 * Inline values were captured by the root/event or referenced-source decoder.
 * @param {unknown} value @param {string} at @param {ValidationContext} c @returns {NativeSnapshotIdentity} */
function parseNativeIdentity(value, at, c) {
  const str = stringsInContext(c), arr = arraysInContext(c), deepFreeze = freezingInContext(c);
  const v = closed(value,['root','head','entries'],[],at);
  const root = str(v.root,at);
  ok(root.startsWith('/') && root !== '/', 'unsupported-path', at, 'Expected absolute repository root', 'unsupported');
  consumeValidationWork(c,root.length,'actor.root-path');
  nativePath(root.slice(1),at,c);
  const head = v.head === null ? null : str(v.head,at);
  ok(head === null || /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(head), 'invalid-field', at, 'Unsupported native Git HEAD');
  let previous = '';
  /** @type {Set<string>} */ const aliases = new Set();
  const entries = arr(v.entries,at).map(raw => {
    const e = closed(raw,['path','kind','sha','size','executable'],[],at);
    const path = nativePath(e.path,at,c), kind = pick(e.kind,['file','symlink','missing'],at);
    const sha = e.sha === null ? null : hash(e.sha,at), size = int(e.size,at);
    ok(typeof e.executable === 'boolean', 'invalid-field', at, 'Expected executable boolean');
    const executable = e.executable;
    consumeValidationWork(c,path.length * 3 + previous.length,'actor.native-entry-name');
    ok(path > previous && !aliases.has(path.toLowerCase()), 'inconsistent-reference', at, 'Native entries must be sorted, unique and unaliased');
    previous = path; aliases.add(path.toLowerCase());
    ok(kind === 'missing' ? sha === null && size === 0 && !executable : sha !== null && (kind !== 'symlink' || size > 0 && !executable), 'inconsistent-reference', at, 'Invalid native kind/hash/size/mode');
    if (kind === 'file' && size === 0) ok(sha === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'inconsistent-reference', at, 'Empty file has wrong native byte hash');
    return Object.freeze({path,kind,sha,size,executable});
  });
  nativeNamesUnaliased(workArray(entries,c).map(e => e.path),at,c);
  for (const e of workArray(entries,c)) {
    consumeValidationWork(c,e.path.length * 2,'actor.native-parent-split');
    const parts = e.path.toLowerCase().split('/'); parts.pop();
    while (parts.length) { workArray(parts,c); ok(!aliases.has(parts.join('/')), 'unsupported-path', at, 'Entry cannot be a parent of another entry', 'unsupported'); parts.pop(); }
  }
  return deepFreeze({root,head,entries});
}

/** Account the complete constructed identity before hashing its exact native
 * JSON.stringify preimage. No digest is inferred from a locator or claimed hash.
 * @param {NativeSnapshotIdentity} identity @param {WorkflowRuntime} wf @param {ValidationContext} c @param {string} at @returns {Hash} */
function nativeIdentityHash(identity, wf, c, at) {
  ok(identity.root === wf.assignment.workspace.repoRoot, 'inconsistent-reference', at, 'Snapshot root differs from assigned repository');
  ok(identity.entries.length <= wf.assignment.evidence.maxFiles, 'capacity', at, 'Snapshot exceeds assigned file count');
  let total = 0;
  for (const e of workArray(identity.entries,c)) { total += e.size; ok(Number.isSafeInteger(total) && total <= wf.assignment.evidence.maxTotalBytes, 'capacity', at, 'Snapshot byte total exceeds assigned bound'); }
  return legacyPayloadDigest(identity,c);
}

/** Complete supported image, not a diff rendering or base64/binary carrier.
 * null means absent/missing according to the identity; empty file means "".
 * Symlink text is inspected but never resolved/followed. Every byte hash charges c.
 * @param {unknown} value @param {NativeSnapshotEntry|undefined} entry @param {ValidationContext} c @param {string} at @returns {string|null} */
function checkedImage(value, entry, c, at) {
  if (entry === undefined || entry.kind === 'missing') { ok(value === null, 'inconsistent-reference', at, 'Absent/missing image must be null'); return null; }
  const text = stringsInContext(c)(value,at);
  consumeValidationWork(c,text.length * 2,'actor.image-scan');
  ok(!text.includes('\0') && (entry.kind !== 'symlink' || text.length > 0), 'unsupported-encoding', at, 'Only complete NUL-free UTF-8 file/target text is supported', 'unsupported');
  ok(Buffer.byteLength(text,'utf8') === entry.size && hashBytes(text,c) === entry.sha, 'inconsistent-reference', at, 'Image byte length/hash differs from native entry');
  return text;
}

/** One decoded source contains both complete identities, every changed image and
 * the exact finalized report. Native patchTruncated is preserved IN that report;
 * complete alternate material never claims to repair/authenticate diff.patch.
 * No supplied baseHash/completeness flag/timestamp/manifest can establish a base.
 * @param {unknown} value @param {WorkflowRuntime} wf @param {DeepReadonly<import('./coordination.js').RetainedReport>} retained @param {ValidationContext} c @param {string} at
 * @returns {Readonly<{proof:StructuredChangeProof,beforeHash:Hash,afterHash:Hash}>} */
function parseStructuredChange(value, wf, retained, c, at) {
  const same = comparisonInContext(c), deepFreeze = freezingInContext(c);
  const v = closed(value,['version','encoding','taskId','reportId','before','after','files','report'],[],at);
  ok(v.version === 1 && v.encoding === 'pair-model-change-proof/1', 'unsupported-version', at, 'Expected model-local complete change proof v1', 'unsupported');
  ok(retained.content.kind === 'finalized', 'inconsistent-reference', at, 'Proof requires finalized report');
  const report = retained.content.report, taskId = id(v.taskId,at), reportId = id(v.reportId,at);
  ok(taskId === retained.producerIdentity.taskId && taskId === report.payload.taskId && reportId === report.reportId, 'inconsistent-reference', at, 'Proof changed task/report identity');
  ok(same(v.report,report) && legacyPayloadDigest(plain(v.report,at).payload,c) === retained.envelope.payloadHash, 'inconsistent-reference', at, 'Proof lacks exact finalized report and original V1 payload');
  const base = wf.taskBases.get(taskId);
  ok(base !== undefined && base.identity !== null && base.nativeHash !== null, 'unresolved-reference', at, 'No timely pre-work or admitted approval base');
  const before = parseNativeIdentity(v.before,at,c), after = parseNativeIdentity(v.after,at,c);
  const beforeHash = nativeIdentityHash(before,wf,c,at), afterHash = nativeIdentityHash(after,wf,c,at);
  ok(beforeHash === base.nativeHash && same(before,base.identity) && afterHash === report.checkpoint.checkpointHash, 'inconsistent-reference', at, 'Proof does not bind both native snapshot identities');
  const old = new Map(workArray(before.entries,c).map(e => [e.path,e])), next = new Map(workArray(after.entries,c).map(e => [e.path,e]));
  consumeValidationWork(c,old.size + next.size,'actor.change-keys');
  const names = sortWork(workSet(new Set(workArray([...old.keys(),...next.keys()],c)),c),c);
  nativeNamesUnaliased(names,at,c);
  // Explicit native entry reconstruction above makes structural equality identical
  // to native JSON.stringify(entry || null), including mode and missing/absence.
  const changed = workArray(names,c).filter(name => !same(old.get(name) ?? null,next.get(name) ?? null));
  ok(same(changed,report.checkpoint.changed), 'inconsistent-reference', at, 'Proof omits/adds/reorders actual report changes');
  const rawFiles = arr(v.files,at,0,wf.assignment.evidence.maxFiles);
  ok(rawFiles.length === changed.length, 'inconsistent-reference', at, 'Proof must contain every changed path exactly once');
  let changedBytes = 0;
  const files = workArray(rawFiles,c).map((raw,i) => {
    const f = closed(raw,['path','before','after'],[],at), path = nativePath(f.path,at,c);
    ok(path === changed[i], 'inconsistent-reference', at, 'Image path is not the exact sorted changed entry');
    changedBytes += next.get(path)?.size ?? 0;
    ok(Number.isSafeInteger(changedBytes) && changedBytes <= wf.assignment.evidence.maxArtifactBytes, 'capacity', at, 'Changed after-images exceed assigned artifact limit');
    return Object.freeze({path,before:checkedImage(f.before,old.get(path),c,at),after:checkedImage(f.after,next.get(path),c,at)});
  });
  // Fresh concrete reconstruction also pays nodes/bytes; no equality-based credit.
  const proof = deepFreeze({version:/** @type {const} */ (1),encoding:/** @type {const} */ ('pair-model-change-proof/1'),taskId,reportId,before,after,files,report});
  encodePairJSON(proof,c);
  return Object.freeze({proof,beforeHash,afterHash});
}

/** T04-sized reference occurrence, charged once when its source is decoded.
 * Resolution below reuses the same fold-owned checked source, not an equal copy.
 * @param {unknown} value @param {unknown} bytes @param {number} maximum @param {ValidationContext} c @param {string} at @returns {{artifact:ArtifactRef,byteLength:number}} */
function sizedArtifact(value, bytes, maximum, c, at) {
  const artifact = validateArtifactRef(value,c), byteLength = int(bytes,at,1);
  ok(byteLength <= maximum, 'capacity', at, 'Referenced payload exceeds bound');
  consumeReference(byteLength,c,at,'payload');
  return {artifact,byteLength};
}

/** @param {unknown} value @param {ValidationContext} c @param {string} at @returns {InspectionEvidenceRef} */
function parseInspectionEvidence(value, c, at) {
  const deepFreeze = freezingInContext(c);
  const v = closed(value,['artifact','byteLength','encoding','hashDomain'],[],at);
  const sized = sizedArtifact(v.artifact,v.byteLength,COMMON_BOUNDS.maxReferenceBytes,c,at);
  const encoding = pick(v.encoding,['pair-json/1','pair-json-v1/1','bytes'],at);
  const hashDomain = pick(v.hashDomain,['bytes','authority','mailbox','inspection','actor-event','control'],at);
  ok(hashDomain === 'bytes' || encoding === 'pair-json/1', 'invalid-field', at, 'Domain-separated content requires pair-json/1');
  return deepFreeze({...sized,encoding,hashDomain});
}

/** Concrete T04 parity: exact wrapper/content keys, scalars, scope, references,
 * finite deadline, observation, digest and canonical envelope bound. This is an
 * artifact constructor, NOT a fabricated control envelope. No enclosing transport
 * inputHash exists here; the earlier review hash must equal its retained intent.
 * @param {unknown} value @param {ValidationContext} c @param {string} at @returns {InspectionArtifact} */
function parseInspectionArtifact(value, c, at) {
  const same = comparisonInContext(c), deepFreeze = freezingInContext(c), arr = arraysInContext(c);
  const w = closed(value,['content','digest'],[],at), v = plain(w.content,`${at}.content`);
  const kind = pick(v.kind,['inspection-request','inspection-reply','inspection-receipt'],at);
  const extras = kind === 'inspection-request' ? ['deadline'] : kind === 'inspection-reply' ? ['replyId','request','requestBytes','evidence','at'] : ['replyId','receiptId','request','requestBytes','reply','replyBytes','delivery'];
  closed(v,['version','kind','actor','profile','workflowId','workflowRevision','activationId','intentId','intentHash','operationId','reportId','reportHash','checkpointHash','scope','requestId',...extras],[],at);
  ok(v.version === 2, 'unsupported-version', at, 'Expected inspection version 2', 'unsupported');
  const actor = validateActorBinding(v.actor,c);
  ok(actor.role === 'supervisor' && v.profile === 'supervisor-restricted', 'invalid-field', at, 'Expected restricted supervisor');
  const digest = hash(w.digest,at);
  const binding = {actor,profile:/** @type {const} */ ('supervisor-restricted'),workflowId:id(v.workflowId,at),workflowRevision:id(v.workflowRevision,at),activationId:id(v.activationId,at),intentId:id(v.intentId,at),intentHash:hash(v.intentHash,at),operationId:id(v.operationId,at),reportId:id(v.reportId,at),reportHash:hash(v.reportHash,at),checkpointHash:hash(v.checkpointHash,at),scope:parseScope(v.scope,at,c)};
  const requestId = id(v.requestId,at);
  ok(requestId !== binding.intentId, 'inconsistent-reference', at, 'Inspection request must differ from earlier intent');
  /** @type {InspectionArtifact} */ let result;
  if (kind === 'inspection-request') result = {content:{...binding,version:2,kind,requestId,deadline:validateDeadlineWindow(v.deadline,c)},digest};
  else {
    const replyId = id(v.replyId,at), request = sizedArtifact(v.request,v.requestBytes,COMMON_BOUNDS.maxEnvelopeBytes,c,at);
    ok(replyId !== requestId && request.artifact.hash !== digest, 'inconsistent-reference', at, 'Inspection IDs/artifacts must differ');
    if (kind === 'inspection-reply') {
      const evidence = arr(v.evidence,at,0,COMMON_BOUNDS.maxReferences).map((ref,i) => parseInspectionEvidence(ref,c,`${at}.evidence.${i}`));
      result = {content:{...binding,version:2,kind,requestId,replyId,request:request.artifact,requestBytes:request.byteLength,evidence,at:int(v.at,at)},digest};
    } else {
      const receiptId = id(v.receiptId,at), reply = sizedArtifact(v.reply,v.replyBytes,COMMON_BOUNDS.maxEnvelopeBytes,c,at);
      const delivery = closed(v.delivery,['observationId','at'],[],at);
      ok(receiptId !== requestId && receiptId !== replyId && reply.artifact.hash !== digest && !same(request.artifact,reply.artifact), 'inconsistent-reference', at, 'Receipt IDs/artifacts must differ');
      result = {content:{...binding,version:2,kind,requestId,replyId,receiptId,request:request.artifact,requestBytes:request.byteLength,reply:reply.artifact,replyBytes:reply.byteLength,delivery:{observationId:id(delivery.observationId,at),at:int(delivery.at,at)}},digest};
    }
  }
  ok(digest === pairDigest('inspection',v,c), 'inconsistent-reference', at, 'Inspection content digest mismatch');
  ok(Buffer.byteLength(encodePairJSON(w,c),'utf8') <= COMMON_BOUNDS.maxEnvelopeBytes, 'capacity', at, 'Inspection wrapper exceeds envelope bound');
  return deepFreeze(result);
}

/** @param {import('./actor-wire-contracts.js').InspectionBindingV2} v */
function inspectionSubject(v) {
  return {actor:v.actor,profile:v.profile,workflowId:v.workflowId,workflowRevision:v.workflowRevision,activationId:v.activationId,intentId:v.intentId,intentHash:v.intentHash,operationId:v.operationId,reportId:v.reportId,reportHash:v.reportHash,checkpointHash:v.checkpointHash,scope:v.scope};
}

/** Historical producer/control/report proof, with no current-eligibility gate.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {import('./actor-wire-contracts.js').InspectionBindingV2} v @param {number} time @param {string} at @returns {SupervisorIntent} */
function inspectionProducer(replay, wf, v, time, at) {
  const same = comparisonInContext(replay.c);
  const a = activationOf(wf,v.activationId,at), intent = wf.intents.get(v.intentId);
  ok(intent !== undefined && intent.activationId === a.activationId && a.role === 'supervisor' && outputTime(intent) <= time, 'inconsistent-reference', at, 'Inspection precedes actual supervisor intent');
  const {binding,input} = intent.control.content;
  ok(same(v.actor,a.producer.actor) && same(v.actor,binding.actor) && v.profile === binding.profile && v.workflowId === wf.workflowId && v.workflowRevision === a.producer.workflowRevision && v.intentHash === binding.inputHash && v.operationId === binding.operationId, 'inconsistent-reference', at, 'Inspection changed historical producer/control');
  ok(input.kind === 'review' && input.payload.reportId === v.reportId && input.payload.reportHash === v.reportHash && input.payload.checkpointHash === v.checkpointHash && same(input.payload.scope,v.scope), 'inconsistent-reference', at, 'Inspection differs from original review output');
  const report = kernelOf(replay,wf,at).reports[v.reportId];
  ok(report !== undefined && report.envelope.payloadHash === v.reportHash && report.acceptedAt <= time && report.content.kind === 'finalized' && report.finalizationWitness !== null && report.finalizationWitness.at <= time && report.content.report.checkpoint.checkpointHash === v.checkpointHash, 'inconsistent-reference', at, 'Inspection lacks original finalized report/checkpoint');
  identityProducer(wf,report.producerIdentity,at);
  if (v.scope.kind === 'file') ok(workArray(report.content.report.checkpoint.changed,replay.c).includes(v.scope.path), 'inconsistent-reference', at, 'Inspection file outside checkpoint');
  return intent;
}

/** No archive fallback: only events already applied in this exact segment fold.
 * @param {WorkflowRuntime} wf @param {ArtifactRef} artifact @param {string} at @returns {RetainedArtifact} */
function retainedArtifact(wf, artifact, at) {
  const same = comparisonInContext(wf.c);
  const source = wf.artifacts.get(artifactKey(artifact,wf.c));
  ok(source !== undefined && same(source.artifact,artifact), 'inconsistent-reference', at, 'Artifact lacks earlier current-segment retention');
  return source;
}

/** Coverage table for exact kernel projections validated by retainArtifact:
 * summary      <- summary | envelope | finalized-report (actual payload.summary)
 * verification <- verification | checkpoint | finalized-report (complete stored
 *                 checkpoint.verification results, NOT external log contents)
 * all / patch / file require a checked StructuredChangeProof, handled separately.
 * A purpose label, checkpoint hash, changed path, snapshotRef or patchTruncated
 * flag is not content. Combining metadata projections cannot fill that gap.
 * This predicate consumes fold-owned checked purposes, never caller trust flags.
 * @param {Extract<ArtifactPurpose,{kind:'evidence'}>['part']} part @param {InspectionScope} scope @returns {boolean} */
function inspectionPartCoversScope(part, scope) {
  switch (scope.kind) {
    case 'summary': return part === 'summary' || part === 'envelope' || part === 'finalized-report';
    case 'verification': return part === 'verification' || part === 'checkpoint' || part === 'finalized-report';
    case 'all': case 'patch': case 'file': return false;
  }
}

/** Shared by reply/receipt retention and every receipt/decision/mirror resolver.
 * Every selected source must validate, and at least one must contain the whole
 * requested supported projection. An empty selection never establishes scope;
 * a checked verification projection may itself be the actual empty result array.
 * @param {WorkflowRuntime} wf @param {import('./actor-wire-contracts.js').InspectionReplyContentV2} reply @param {string} at @returns {readonly Id[]} */
function inspectionEvidenceIds(wf, reply, at) {
  let covered = false;
  const ids = workArray(reply.evidence,wf.c).map(ref => {
    const source = retainedArtifact(wf,ref.artifact,at);
    ok(source.kind === 'evidence' && source.byteLength === ref.byteLength && source.purpose.encoding === ref.encoding && source.purpose.hashDomain === ref.hashDomain && source.purpose.reportId === reply.reportId && source.purpose.checkpointHash === reply.checkpointHash && source.retainedAt <= reply.at, 'inconsistent-reference', at, 'Evidence is not the exact earlier report/checkpoint source');
    const proof = source.proof;
    const complete = source.purpose.part === 'structured-change' && proof !== null && source.beforeHash !== null && source.afterHash === reply.checkpointHash && proof.reportId === reply.reportId && proof.report.payloadHash === reply.reportHash;
    const filePath = reply.scope.kind === 'file' ? reply.scope.path : null;
    covered = (complete && proof !== null && (filePath === null || workArray(proof.files,wf.c).some(f => f.path === filePath))) || inspectionPartCoversScope(source.purpose.part,reply.scope) || covered;
    return source.purpose.evidenceId;
  });
  ok(new Set(workArray(ids,wf.c)).size === ids.length, 'conflicting-duplicate', at, 'Evidence fact repeated');
  ok(covered, 'inconsistent-reference', at, 'Selected checked contents do not cover inspection scope; all/patch/file require complete immutable change material');
  return Object.freeze(ids);
}

/** C2 bounded one-proof chain (no archive sources): per fold, the proof source
 * costs 1 reference, request 1, reply 3 (source + request + proof), receipt 3
 * (source + request + reply): 8 total. With byte lengths P/Q/R/S respectively,
 * referenced bytes are 2P + 3Q + 2R + S. A reducer validates the untrusted base
 * once, then forks its private prefix: a candidate/commit/mirror with no new
 * source costs 8 references, not 16. The first source in a second chain costs
 * 8 + 1 = 9; completing both chains costs 16, with no doubled prefix resolution.
 * Inline task bases add no reference or hidden decode. They still pay root/event
 * capture, envelope encoding, native preimage and constructed-view accounting.
 * Proof decoding pays original source and decoded nodes/bytes; native identities,
 * original report payload and the concrete proof reconstruction are encoded in c;
 * every changed file/target image hash separately pays its UTF-8 source bytes.
 * Retention resolvers reuse these actual fold-owned objects without decoding.
 * Additional chains/archives may exhaust the unchanged operation cap. All new
 * reference occurrences still pay; no fresh context or equality credit is used.
 * Q01 inline inspection-content carries the full wrapper instead of a raw source:
 * request costs 0 references, reply 2, receipt 2, plus the unchanged proof 1 = 5.
 * Referenced bytes are 2P + 2Q + R; inline wrapper capture/encode/hash/freeze and
 * publication still pay in c. Two such chains plus two archives cost 12 refs.
 * This is source-level accounting, not a measured public reachability result or
 * closure of remaining actor-domain intermediate-work and public-fit M8 review.
 */

/** Record one source after decoding/accounting it in the enclosing operation.
 * JSON evidence must equal a real retained kernel fact (V1 also preserves order).
 * The model-local verification part selects the entire existing finalized
 * checkpoint.verification array; no new wire/archive shape or claimed log bytes.
 * Raw bytes support exact UTF-8 report summary only. The structured-change part
 * requires one complete pair-json/1 source with a raw byte hash, prior base and
 * both checked native identities. Arbitrary rendered/native diffs stay unsupported.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {ArtifactRetainedPayload|InlineInspectionPayload} p @param {number} time @param {number} sequence @param {ValidationContext} c @param {string} at */
function retainArtifact(replay, wf, p, time, sequence, c, at) {
  const same = comparisonInContext(c), deepFreeze = freezingInContext(c);
  const key = artifactKey(p.artifact,c);
  ok(!wf.artifacts.has(key), 'conflicting-duplicate', at, 'Artifact identity already retained; replacement is forbidden');
  ok(workMap(replay.workflows,c).reduce((n,w) => n + w.artifacts.size,0) < COMMON_BOUNDS.maxReferences, 'capacity', at, 'Retained source count exceeds segment bound');
  if ('inspection' in p) {
    // Intrinsic parsing already checked and charged this concrete inline source.
    // Canonical encoding is real work, not evidence of original transport bytes.
    const canonical = encodePairJSON(p.inspection,c), byteLength = Buffer.byteLength(canonical,'utf8');
    qualifyInspectionSource(replay,wf,p.artifact,p.inspection,byteLength,time,sequence,c,at);
    wf.artifacts.set(key,deepFreeze({kind:'inspection',artifact:p.artifact,byteLength,originalBytesHash:null,canonicalBytesHash:hashBytes(canonical,c),retainedAt:time,sequence,inspection:p.inspection}));
    return;
  }
  consumeValidationWork(c,p.original.length,'actor.reference-source');
  const purpose = p.purpose;
  if (purpose.kind === 'evidence') {
    ok(!workMap(wf.artifacts,c).some(s => s.kind === 'evidence' && s.purpose.evidenceId === purpose.evidenceId), 'conflicting-duplicate', at, 'Evidence logical ID reused');
    const report = kernelOf(replay,wf,at).reports[purpose.reportId];
    ok(report !== undefined && report.content.kind === 'finalized' && report.finalizationWitness !== null && report.acceptedAt <= time && report.finalizationWitness.at <= time && report.content.report.checkpoint.checkpointHash === purpose.checkpointHash, 'inconsistent-reference', at, 'Evidence precedes actual report/checkpoint');
    identityProducer(wf,report.producerIdentity,at);
    if (purpose.part === 'structured-change') {
      ok(purpose.encoding === 'pair-json/1' && purpose.hashDomain === 'bytes', 'unsupported-encoding', at, 'Structured change requires pair-json/1 with exact source-byte hash', 'unsupported');
      const decoded = decodeReferencedPairJSON(p.original,c,'payload');
      ok(p.artifact.hash === decoded.originalBytesHash, 'inconsistent-reference', at, 'Structured source raw-byte hash mismatch');
      const checked = parseStructuredChange(decoded.value,wf,report,c,at);
      wf.artifacts.set(key,deepFreeze({kind:'evidence',artifact:p.artifact,byteLength:decoded.byteLength,originalBytesHash:decoded.originalBytesHash,retainedAt:time,sequence,purpose,...checked}));
      return;
    }
    const fact = purpose.part === 'envelope' ? report.envelope : purpose.part === 'finalized-report' ? report.content.report : purpose.part === 'checkpoint' ? report.content.report.checkpoint : purpose.part === 'verification' ? report.content.report.checkpoint.verification : report.envelope.payload.summary;
    /** @type {number} */ let byteLength;
    /** @type {Hash} */ let originalBytesHash;
    if (purpose.encoding === 'bytes') {
      ok(purpose.part === 'summary' && purpose.hashDomain === 'bytes' && p.original === fact, 'inconsistent-reference', at, 'Raw evidence must be the exact retained report summary');
      byteLength = Buffer.byteLength(p.original,'utf8');
      consumeReference(byteLength,c,at,'payload');
      originalBytesHash = hashBytes(p.original,c);
      ok(p.artifact.hash === originalBytesHash, 'inconsistent-reference', at, 'Raw evidence hash mismatch');
    } else if (purpose.encoding === 'pair-json-v1/1') {
      const decoded = inspectLegacySource(p.original,c,'payload');
      ok(decoded.kind === 'decoded', 'invalid-shape', at, 'Evidence V1 source cannot be decoded');
      ok(encodeLegacyV1(decoded.value,c) === encodeLegacyV1(fact,c), 'inconsistent-reference', at, 'V1 evidence changed retained fact/property order');
      byteLength = decoded.byteLength; originalBytesHash = decoded.originalBytesHash;
      ok(purpose.hashDomain === 'bytes' && p.artifact.hash === originalBytesHash, 'inconsistent-reference', at, 'V1 evidence reference must hash original bytes');
    } else {
      const decoded = decodeReferencedPairJSON(p.original,c,'payload');
      ok(same(decoded.value,fact), 'inconsistent-reference', at, 'Evidence differs from retained kernel fact');
      // Even a V2 evidence reference cannot repair/reorder a nested V1 report
      // payload while continuing to claim its original envelope payloadHash.
      if (purpose.part === 'envelope' || purpose.part === 'finalized-report') ok(legacyPayloadDigest(plain(decoded.value,at).payload,c) === report.envelope.payloadHash, 'inconsistent-reference', at, 'Evidence changed original V1 payload hash/order');
      byteLength = decoded.byteLength; originalBytesHash = decoded.originalBytesHash;
      const digest = purpose.hashDomain === 'bytes' ? originalBytesHash : pairDigest(purpose.hashDomain,decoded.value,c);
      ok(p.artifact.hash === digest, 'inconsistent-reference', at, 'Evidence content-domain digest mismatch');
    }
    ok(byteLength > 0, 'capacity', at, 'Empty evidence source');
    wf.artifacts.set(key,deepFreeze({kind:'evidence',artifact:p.artifact,byteLength,originalBytesHash,retainedAt:time,sequence,purpose,proof:null,beforeHash:null,afterHash:null}));
    return;
  }
  const decoded = decodeReferencedPairJSON(p.original,c,'payload');
  const inspection = parseInspectionArtifact(decoded.value,c,at);
  qualifyInspectionSource(replay,wf,p.artifact,inspection,decoded.byteLength,time,sequence,c,at);
  wf.artifacts.set(key,deepFreeze({kind:'inspection',artifact:p.artifact,byteLength:decoded.byteLength,originalBytesHash:decoded.originalBytesHash,retainedAt:time,sequence,inspection}));
}

/** Identical producer/content/byte/delivery proof for raw and inline sources.
 * Only private parsed wrappers reach here; no resolver or cache can bypass it.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {ArtifactRef} artifact @param {InspectionArtifact} inspection @param {number} byteLength @param {number} time @param {number} sequence @param {ValidationContext} c @param {string} at */
function qualifyInspectionSource(replay,wf,artifact,inspection,byteLength,time,sequence,c,at) {
  const same = comparisonInContext(c), v = inspection.content;
  ok(byteLength <= COMMON_BOUNDS.maxEnvelopeBytes && artifact.hash === inspection.digest, 'inconsistent-reference', at, 'Inspection reference must hash content, not original bytes/wrapper');
  inspectionProducer(replay,wf,v,time,at);
  if (v.kind === 'inspection-request') {
    const intent = wf.intents.get(v.intentId);
    ok(intent !== undefined && outputTime(intent) <= v.deadline.admissionAt && v.deadline.admissionAt <= time && time < v.deadline.expiresAt, 'inconsistent-reference', at, 'Request retention outside earlier intent/deadline');
  } else {
    const requestSource = retainedArtifact(wf,v.request,at);
    ok(requestSource.kind === 'inspection' && requestSource.inspection.content.kind === 'inspection-request', 'inconsistent-reference', at, 'Missing earlier request content');
    const request = requestSource.inspection.content;
    ok(same(inspectionSubject(v),inspectionSubject(request)) && v.requestId === request.requestId && v.requestBytes === requestSource.byteLength && v.request.hash !== inspection.digest, 'inconsistent-reference', at, 'Request binding/bytes mismatch');
    if (v.kind === 'inspection-reply') {
      ok(requestSource.retainedAt <= v.at && v.at <= time && v.at < request.deadline.expiresAt, 'inconsistent-reference', at, 'Reply outside retained request/deadline');
      inspectionEvidenceIds(wf,v,at);
    } else {
      const replySource = retainedArtifact(wf,v.reply,at);
      ok(replySource.kind === 'inspection' && replySource.inspection.content.kind === 'inspection-reply', 'inconsistent-reference', at, 'Missing earlier reply content');
      const reply = replySource.inspection.content;
      ok(same(inspectionSubject(v),inspectionSubject(reply)) && v.requestId === reply.requestId && v.replyId === reply.replyId && same(v.request,reply.request) && v.replyBytes === replySource.byteLength && v.reply.hash !== v.request.hash && v.reply.hash !== inspection.digest, 'inconsistent-reference', at, 'Receipt changed reply/request binding/bytes');
      inspectionEvidenceIds(wf,reply,at);
      ok(reply.at <= v.delivery.at && replySource.retainedAt <= v.delivery.at && v.delivery.at <= time && v.delivery.at < request.deadline.expiresAt, 'inconsistent-reference', at, 'Receipt delivery outside earlier reply/deadline');
      const delivery = wf.inspectionDeliveries.get(v.delivery.observationId);
      ok(delivery !== undefined && same(delivery.observation,v.delivery) && same(delivery.reply,v.reply) && delivery.activationId === v.activationId && delivery.sequence < sequence && delivery.retainedAt <= time, 'inconsistent-reference', at, 'Receipt lacks its exact earlier Main delivery observation');
      ok(!workMap(wf.artifacts,c).some(s => s.kind === 'inspection' && s.inspection.content.kind === 'inspection-receipt' && s.inspection.content.delivery.observationId === v.delivery.observationId), 'conflicting-duplicate', at, 'Inspection delivery observation reused');
    }
  }
}

/** Uses only prefix-retained, once-decoded concrete sources. The receipt's event
 * time is STORAGE observation time, not necessarily its earlier delivery time;
 * kernel observationId is independent of delivery.observationId/native settlement.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {ReviewLink} review @param {InspectionScope} declaredScope @param {number} receiptAt @param {string} path @returns {QualifiedInspection} */
function resolveInspection(replay, wf, review, declaredScope, receiptAt, path) {
  const same = comparisonInContext(replay.c), deepFreeze = freezingInContext(replay.c);
  reviewIntent(replay,wf,review,path);
  const a = retainedArtifact(wf,review.request,path), b = retainedArtifact(wf,review.reply,path), d = retainedArtifact(wf,review.receipt,path);
  ok(a.kind === 'inspection' && b.kind === 'inspection' && d.kind === 'inspection', 'inconsistent-reference', path, 'Review references non-inspection sources');
  const request = a.inspection.content, reply = b.inspection.content, receipt = d.inspection.content;
  ok(request.kind === 'inspection-request' && reply.kind === 'inspection-reply' && receipt.kind === 'inspection-receipt', 'inconsistent-reference', path, 'Review artifact kinds mismatch');
  const expected = {...review,scope:declaredScope};
  ok(same(inspectionSubject(request),inspectionSubject(expected)) && same(inspectionSubject(reply),inspectionSubject(expected)) && same(inspectionSubject(receipt),inspectionSubject(expected)), 'inconsistent-reference', path, 'Whole inspection reviewer/scope chain mismatch');
  ok(request.requestId === reply.requestId && request.requestId === receipt.requestId && reply.replyId === receipt.replyId && same(reply.request,review.request) && same(receipt.request,review.request) && same(receipt.reply,review.reply), 'inconsistent-reference', path, 'Inspection logical IDs/references mismatch');
  ok(reply.requestBytes === a.byteLength && receipt.requestBytes === a.byteLength && receipt.replyBytes === b.byteLength && new Set([review.request.hash,review.reply.hash,review.receipt.hash]).size === 3, 'inconsistent-reference', path, 'Inspection exact byte lengths/content identities mismatch');
  ok(a.sequence < b.sequence && b.sequence < d.sequence && a.retainedAt <= reply.at && b.retainedAt <= receipt.delivery.at && d.retainedAt <= receiptAt && request.deadline.admissionAt <= reply.at && reply.at <= receipt.delivery.at && receipt.delivery.at < request.deadline.expiresAt, 'inconsistent-reference', path, 'Inspection was not timely and retained before use');
  const delivery = wf.inspectionDeliveries.get(receipt.delivery.observationId);
  ok(delivery !== undefined && same(delivery.observation,receipt.delivery) && same(delivery.reply,review.reply) && delivery.activationId === review.activationId && b.sequence < delivery.sequence && delivery.sequence < d.sequence && delivery.retainedAt <= d.retainedAt, 'inconsistent-reference', path, 'Receipt lacks exact earlier delivery observation');
  inspectionProducer(replay,wf,request,request.deadline.admissionAt,path);
  return deepFreeze({requestId:request.requestId,replyId:reply.replyId,receiptId:receipt.receiptId,scope:declaredScope,evidenceIds:inspectionEvidenceIds(wf,reply,path),delivery:receipt.delivery});
}

/** @param {Replay} replay @param {WorkflowRuntime} wf @param {Extract<TransitionEvent,{kind:'evidence-receipt'}>} receipt @param {string} at @returns {QualifiedInspection} */
function qualifyKernelInspection(replay, wf, receipt, at) {
  const same = comparisonInContext(replay.c);
  ok(receipt.review !== undefined, 'inconsistent-reference', at, 'Supervisor receipt has no review link');
  const ids = resolveInspection(replay,wf,receipt.review,receipt.scope,receipt.at,at);
  ok(ids.requestId === receipt.requestId && ids.replyId === receipt.replyId && ids.receiptId === receipt.receiptId && receipt.reportId === receipt.review.reportId && receipt.checkpointHash === receipt.review.checkpointHash && same(receipt.reader,receipt.review.actor), 'inconsistent-reference', at, 'Kernel receipt differs from checked content');
  return ids;
}

/** Same intrinsic chain at candidate, immutable commitment, and mirror. Uses the
 * historical receipt time, never the later candidate/commit wall time as expiry.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {CoordinationModel} kernel @param {Extract<TransitionEvent,{kind:'decide',source:'supervisor-control'}>} e @param {string} at */
function qualifyDecisionInspection(replay, wf, kernel, e, at) {
  const same = comparisonInContext(replay.c);
  ok(e.inspectionReceiptIds.length > 0, 'inconsistent-reference', at, 'Supervisor decision requires inspection');
  for (const key of workArray(e.inspectionReceiptIds,replay.c)) {
    const receipt = kernel.evidence[key];
    ok(receipt !== undefined && receipt.at <= e.at && same(receipt.review,reviewLinkOf(e.review)), 'inconsistent-reference', at, 'Decision lacks exact earlier receipt');
    const inspection = qualifyKernelInspection(replay,wf,receipt,at);
    ok(inspection.delivery.at <= e.review.settlement.at, 'inconsistent-reference', at, 'Producing native settlement precedes inspected reply delivery');
  }
  const intent = historicalSettledIntent(wf,e.review.activationId,e.review.intentId,e.at,at,replay.c), a = activationOf(wf,e.review.activationId,at);
  const native = nativeSettlement(a,replay.c);
  ok(native !== null && same(e.review.settlement,{observationId:native.observationId,at:native.at}) && intent.control.content.binding.inputHash === e.review.intentHash, 'inconsistent-reference', at, 'Decision changed actual producing settlement/intent');
  qualifyStructuralDecision(replay,wf,kernel,e,intent,at);
}

/** Complete immutable task catalog, sorted by ID (including retired members).
 * Legacy steps keep their original optional acceptance; no brief reconstructs it.
 * @param {CurrentTask} task @param {ValidationContext} c @returns {readonly CatalogEntry[]} */
function taskCatalog(task,c) {
  const entries = task.stepCatalog ?? Object.fromEntries(workArray(task.steps,c).map(step => [step.id,{step,replaces:[],lineageId:step.id,retiredBy:null}]));
  return workArray(sortWork(workKeys(entries,c),c),c).map(key => entries[key]);
}

/** Sum each original member exactly once; gaps remain separate, never zero proof.
 * @param {CurrentTask} task @param {Id} stepId @param {ValidationContext} c */
function lineageAccounting(task,stepId,c) {
  const group = task.stepCatalog?.[stepId]?.lineageId;
  const members = group === undefined ? [stepId] : workArray(taskCatalog(task,c),c).filter(e => e.lineageId === group).map(e => e.step.id);
  const first = task.accounting.steps[members[0]];
  ok(first !== undefined,'inconsistent-reference','plan.lineage','Missing original member ledger');
  const total = {...first};
  for (const key of workArray(members,c).slice(1)) {
    const ledger = task.accounting.steps[key];
    ok(ledger !== undefined,'inconsistent-reference','plan.lineage','Missing original member ledger');
    for (const metric of workKeys(total,c)) {
      const name = /** @type {keyof import('./coordination.js').Ledger} */ (metric);
      total[name] = addAmount(total[name],ledger[name],!['costUsd','inputTokens','outputTokens'].includes(name));
    }
  }
  return total;
}

/** Canonical structural preimage: only plan coordinates, ID-ordered complete
 * catalog (content/retirement/lineage), executable remainder/current and prior
 * plan link. No times, accounting, debt or derived admission flags are hashed.
 * The first plan has an explicit null link; a proposal's future link is never
 * substituted for the retained plan's link to manufacture its expected hash.
 * @param {WorkflowRuntime} wf @param {CurrentTask} task @param {ValidationContext} c */
function taskPlanProjection(wf,task,c) {
  const catalog = taskCatalog(task,c), remainingStepIds = workArray(task.steps,c).slice(task.stepIndex).map(s => s.id);
  return freezeWork({workflowId:wf.workflowId,workflowRevision:wf.workflowRevision,taskId:task.taskId,taskPlanRevision:task.planRevision,workflowPlanRevision:wf.planRevision,catalog,remainingStepIds,currentStepId:remainingStepIds[0] ?? null,planLink:task.structuralPlan?.planLink ?? null},c);
}

/** @param {WorkflowRuntime} wf @param {CurrentTask} task @param {ValidationContext} c @returns {TaskPlanView} */
function projectTaskPlan(wf,task,c) {
  const projection = taskPlanProjection(wf,task,c), catalog = projection.catalog;
  const groups = sortWork(workSet(new Set(workArray(catalog,c).map(e => e.lineageId)),c),c);
  const lineage = workArray(groups,c).map(lineageId => {
    const stepIds = workArray(catalog,c).filter(e => e.lineageId === lineageId).map(e => e.step.id);
    return {lineageId,stepIds,accounting:lineageAccounting(task,stepIds[0],c),gaps:workArray(task.accounting.gaps,c).filter(g => g.stepId === null || workArray(stepIds,c).includes(g.stepId))};
  });
  return freezeWork({...projection,planHash:pairDigest('operation-input',projection,c),lineage,reviewDebt:task.structuralPlan?.reviewDebt ?? []},c);
}

/** Exact live coordinates are checked at proposal, record, candidate and commit;
 * historical mirrors use the immutable correlation below, not today's counters.
 * Merges and removal of outstanding non-current review debt deliberately remain
 * unsupported, as in the kernel. Workflow coordinate amendments after the first
 * structural candidate remain unsupported by the kernel's pinned-coordinate rule.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {CoordinationModel} kernel @param {PlanChangeV2} change @param {number} time @param {string} at */
function checkStructuralBasis(replay,wf,kernel,change,time,at) {
  const c = replay.c, x = change.expected, task = kernel.task, report = kernel.reports[x.reportId];
  // Deliberately unsupported even when the predecessors are lineage siblings;
  // this wave admits splits with one predecessor per introduced step, not merges.
  ok(workArray(change.introducedSteps,c).every(entry => entry.replaces.length <= 1),'unsupported-plan',at,'Structural lineage merges are unsupported','unsupported');
  ok(task?.kind === 'current' && task.taskId === x.taskId && task.obligation?.kind === 'report' && task.obligation.reportId === x.reportId,'inconsistent-reference',at,'Structural plan lacks the current report obligation');
  const plan = wf.taskPlans.get(x.taskId), grant = kernel.grants[x.grantOperationId];
  // Recompute even for the FIRST proposal/candidate. Kernel hash syntax and a
  // caller's expected coordinates are not evidence of this canonical preimage.
  const projection = taskPlanProjection(wf,task,c), planHash = pairDigest('operation-input',projection,c);
  ok(x.planHash === planHash,'hash-mismatch',at,'Structural expected plan hash does not bind the retained canonical projection');
  ok(plan !== undefined && plan.planHash === planHash && x.workflowId === wf.workflowId && x.workflowRevision === wf.workflowRevision && x.workflowPlanRevision === wf.planRevision && x.taskPlanRevision === task.planRevision && x.currentStepId === task.steps[task.stepIndex]?.id,'inconsistent-reference',at,'Structural plan coordinates differ from the admitted catalog');
  ok(x.accountingRevision === task.accounting.revision && x.budgetRevision === task.budgetRevision && x.budgetHash === task.budgetHash && x.workflowBudgetRevision === wf.budget.budgetRevision && x.workflowBudgetHash === wf.budget.budgetHash,'inconsistent-reference',at,'Structural plan accounting/budget snapshot mismatch');
  ok(report !== undefined && report.content.kind === 'finalized' && report.finalizationWitness !== null && report.acceptedAt <= time && report.finalizationWitness.at <= time && report.envelope.payloadHash === x.reportHash && report.content.report.checkpoint.checkpointHash === x.checkpointHash && report.envelope.payload.stepId === x.currentStepId && report.grantOperationId === x.grantOperationId && grant !== undefined && grant.phase === 'closed' && grant.stepId === x.currentStepId && grant.identity.planRevision === x.taskPlanRevision && task.currentGrantOperationId === x.grantOperationId,'inconsistent-reference',at,'Structural plan lacks its exact finalized report/current grant');
  ok(change.next.taskPlanRevision === addAmount(x.taskPlanRevision,1,true) && change.next.workflowPlanRevision === addAmount(x.workflowPlanRevision,1,true),'invalid-counter',at,'Structural revisions must advance once');
}

/** Resolve the exact earlier same-activation output, including original control
 * hash and production ordering. No timestamp or operation-ID equality alone is proof.
 * @param {WorkflowRuntime} wf @param {Id} activationId @param {PlanLinkV2} link @param {number} time @param {string} at @param {ValidationContext} c */
function linkedStructuralPlan(wf,activationId,link,time,at,c) {
  const intent = wf.intents.get(link.intentId), a = activationOf(wf,activationId,at);
  ok(intent !== undefined && intent.activationId === activationId && link.activationId === activationId && a.role === 'supervisor','inconsistent-reference',at,'Plan link lacks its earlier same-activation intent');
  const {binding,input} = intent.control.content;
  ok(input.kind === 'plan' && input.payload.change !== undefined && link.intentHash === binding.inputHash && link.operationId === binding.operationId && link.controlHash === intent.control.digest && sameWork(binding,producerBinding(a.producer,link.operationId,link.intentHash),c) && outputTime(intent) <= time,'inconsistent-reference',at,'Plan link changed original producer/control/production');
  return {intent,change:input.payload.change,steps:input.payload.steps,planRevision:input.payload.planRevision};
}

/** Shared exact plan -> review -> native settlement -> delivered all-inspection
 * chain for candidate, commit and decision-recorded. The record must already be
 * retained; neither a review alone nor a later mirror installs a structural plan.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {CoordinationModel} kernel @param {Extract<TransitionEvent,{kind:'decide',source:'supervisor-control'}>} e @param {SupervisorIntent} review @param {string} at */
function qualifyStructuralDecision(replay,wf,kernel,e,review,at) {
  const c = replay.c, input = review.control.content.input;
  ok(input.kind === 'review','inconsistent-reference',at,'Decision lacks review control');
  const link = input.payload.planLink;
  ok((link === undefined) === (e.planChange === undefined),'inconsistent-reference',at,'Structural review/candidate extension mismatch');
  if (link === undefined || e.planChange === undefined) return;
  const plan = linkedStructuralPlan(wf,review.activationId,link,outputTime(review),at,c), record = wf.plans.get(link.intentId);
  historicalSettledIntent(wf,review.activationId,link.intentId,e.at,at,c);
  ok(record !== undefined && record.at <= e.at && record.payload.activationId === review.activationId && record.payload.planRevision === plan.change.next.workflowPlanRevision && e.input.action === 'revise' && sameWork(e.planChange.change,plan.change,c) && sameWork(e.planChange.planLink,link,c) && sameWork(e.planChange.planSettlement,e.review.settlement,c),'inconsistent-reference',at,'Structural candidate differs from recorded plan/link/native settlement');
  const x = plan.change.expected;
  ok(x.taskId === e.input.taskId && x.reportId === e.review.reportId && x.reportHash === e.review.reportHash && x.checkpointHash === e.review.checkpointHash && input.payload.scope.kind === 'all' && workArray(e.inspectionReceiptIds,c).some(key => kernel.evidence[key]?.scope.kind === 'all'),'inconsistent-reference',at,'Structural revise requires the exact report and delivered all-scope inspection');
}

/** A structural proposal is consumed only by its admitted commit, not by a
 * later unrelated plan. Superseded candidates drain only with their replacement
 * chain's admitted commitment; their original identities remain inspectable.
 * @param {WorkflowRuntime} wf @param {CoordinationModel} kernel @param {SupervisorIntent} intent @param {ValidationContext} c */
function structuralOutputConsumed(wf,kernel,intent,c) {
  const candidates = workRecord(kernel.intents,c).filter(i => i.kind === 'decide');
  let candidate = workArray(candidates,c).find(i => i.source === 'supervisor-control' && (i.review.intentId === intent.intentId || i.planChange?.planLink.intentId === intent.intentId));
  for (let n = 0; candidate !== undefined && n <= candidates.length; n++) {
    if (wf.structuralRevisionOperations.has(candidate.operationId)) return true;
    const operationId = candidate.operationId;
    candidate = workArray(candidates,c).find(i => i.source === 'supervisor-control' && i.planChange?.change.supersedesDecisionOperationId === operationId);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Fold
// ---------------------------------------------------------------------------

/** Historical evidence only: created after an applied kernel publication leaves
 * its grant open. Exact immutable linkage, not a second grant state machine.
 * @typedef {Readonly<{rootRevision:number, identity:Identity, commit:Extract<TransitionEvent,{kind:'grant-committed'}>, publication:Extract<TransitionEvent,{kind:'authority-published'}>}>} PublishedGrantWitness */

/** Each scan pays its candidate slots and a real field/text preflight before
 * callbacks/short-circuiting. Nested Map/Set contents are visited only by their
 * own workMap/workSet scan, not implicitly treated as JSON. Native value-vector
 * allocation is preceded by a slot charge. These helpers use the fold's explicit
 * registered operation context, never a new budget.
 * @template T @param {readonly T[]} values @param {ValidationContext} c @returns {readonly T[]} */
function workArray(values,c) { consumeValidationWork(c,values.length,'actor.scan'); for (const value of values) chargeActorWork(value,c); return values; }
/** @template T @param {Map<string,T>} values @param {ValidationContext} c @returns {T[]} */
function workMap(values,c) { consumeValidationWork(c,values.size,'actor.map'); const result = [...values.values()]; workArray(result,c); return result; }
/** Key-vector allocation is unavoidable, as in common capture. Bound it before
 * a value-vector allocation or subsequent scan/copy.
 * @param {object} value @param {ValidationContext} c @returns {string[]} */
function workKeys(value,c) { const keys = Object.keys(value); consumeValidationWork(c,keys.length,'actor.keys'); for (const key of keys) consumeValidationWork(c,key.length,'actor.key'); return keys; }
/** @template T @param {Readonly<Record<string,T>>} values @param {ValidationContext} c @returns {T[]} */
function workRecord(values,c) { const keys = workKeys(values,c); consumeValidationWork(c,keys.length,'actor.record'); const result = keys.map(k => values[k]); workArray(result,c); return result; }
/** @template T @param {Set<T>} values @param {ValidationContext} c @returns {T[]} */
function workSet(values,c) { consumeValidationWork(c,values.size,'actor.set'); return [...values]; }
/** Native sort comparator charges every actual comparison, including text spans.
 * @param {string[]} values @param {ValidationContext} c @returns {string[]} */
function sortWork(values,c) { consumeValidationWork(c,values.length,'actor.sort'); return values.sort((a,b) => { consumeValidationWork(c,1 + a.length + b.length,'actor.sort-comparison'); return a < b ? -1 : a > b ? 1 : 0; }); }
/** @template T @param {T} value @param {ValidationContext} c @returns {T} */
function freezeWork(value,c) { chargeActorWork(value,c); return deepFreeze(value); }
/** Lexical comparison adapter, not an ambient budget. Only captured/private
 * values reach these call sites. Each comparison pays both full candidate trees.
 * @param {ValidationContext} c @returns {(a:unknown,b:unknown)=>boolean} */
function comparisonInContext(c) { return (a,b) => sameWork(a,b,c); }
/** Preflight the freeze traversal in the same operation.
 * @param {ValidationContext} c */
function freezingInContext(c) {
  /** @template T @param {T} value @returns {T} */
  function freeze(value) { return freezeWork(value,c); }
  return freeze;
}
/** @param {ValidationContext} c */
function arraysInContext(c) {
  /** @param {unknown} value @param {string} path @param {number} [min] @param {number} [max] */
  function array(value,path,min = 0,max = COMMON_BOUNDS.maxEvents) { return workArray(arr(value,path,min,max),c); }
  return array;
}
/** @param {ValidationContext} c */
function stringsInContext(c) {
  /** @param {unknown} value @param {string} path @param {number} [max] */
  function text(value,path,max = COMMON_BOUNDS.maxTextBytes) { if (typeof value === 'string') consumeValidationWork(c,value.length,'actor.parse-text'); return str(value,path,max); }
  return text;
}
/** Already inert/private JSON only. Repeated comparison visits pay repeatedly;
 * unlike capture this grants no ownership or node/byte credit.
 * @param {unknown} value @param {ValidationContext} c @param {number} [depth] */
function chargeActorWork(value,c,depth = 0) {
  consumeValidationWork(c,1,'actor.work');
  ok(depth <= c.maxDepth,'capacity','actor.work','Work depth exceeded');
  if (typeof value === 'string') { consumeValidationWork(c,value.length,'actor.text'); return; }
  if (value === null || typeof value !== 'object') return;
  const keys = Object.keys(value); consumeValidationWork(c,keys.length,'actor.keys');
  for (const key of keys) { consumeValidationWork(c,key.length,'actor.key'); chargeActorWork(/** @type {Record<string,unknown>} */ (value)[key],c,depth + 1); }
}
/** @param {unknown} a @param {unknown} b @param {ValidationContext} c */
function sameWork(a,b,c) { chargeActorWork(a,c); chargeActorWork(b,c); return same(a,b); }

/** Real serialization preflight over captured JSON, including each object's key
 * sort/comparisons. It reserves traversal/text work for the common encoder; it
 * does not replace its capture, exact byte/source charging or hash domain. Every
 * repeated occurrence is visited again, including when common owns the capture.
 * @param {unknown} value @param {ValidationContext} c @param {number} [depth] */
function canonicalWork(value,c,depth = 0) {
  consumeValidationWork(c,1,'actor.canonical');
  ok(depth <= c.maxDepth,'capacity','actor.canonical','Canonical work depth exceeded');
  if (typeof value === 'string') { consumeValidationWork(c,value.length,'actor.canonical-text'); return; }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    consumeValidationWork(c,value.length,'actor.canonical-array');
    for (const entry of value) canonicalWork(entry,c,depth + 1);
  } else for (const key of sortWork(workKeys(value,c),c)) canonicalWork(Reflect.get(value,key),c,depth + 1);
}
/** @param {unknown} value @param {ValidationContext} c @returns {string} */
function encodePairJSON(value,c) {
  const captured = ensureInert(value,'actor.encode',c);
  canonicalWork(captured,c);
  const text = commonEncodePairJSON(captured,c);
  consumeValidationWork(c,text.length,'actor.encoded-text');
  return text;
}
/** @param {import('./actor-contract-common.js').DigestDomain} domain @param {unknown} value @param {ValidationContext} c @returns {Hash} */
function pairDigest(domain,value,c) {
  const captured = ensureInert(value,'actor.digest',c);
  canonicalWork(captured,c);
  return commonPairDigest(domain,captured,c);
}
/** Legacy inputs at these private call sites are already captured/constructed.
 * Do not recapture as V2 or sort: original property order and omissions survive.
 * @param {unknown} value @param {ValidationContext} c @returns {string} */
function encodeLegacyV1(value,c) {
  chargeActorWork(value,c);
  const text = commonEncodeLegacyV1(value,c);
  consumeValidationWork(c,text.length,'actor.legacy-text');
  return text;
}
/** @param {unknown} value @param {ValidationContext} c @returns {Hash} */
function legacyPayloadDigest(value,c) { chargeActorWork(value,c); return commonLegacyPayloadDigest(value,c); }
/** All actor byte-hash call sites supply validated UTF-8 text, never handles.
 * @param {string} value @param {ValidationContext} c @returns {Hash} */
function hashBytes(value,c) { consumeValidationWork(c,value.length,'actor.hash-text'); return commonHashBytes(value,c); }
/** Checked sums preserve reported decimals but never silently overflow/lose a
 * positive increment. Integral counters must stay safe integers.
 * @param {number} a @param {number} b @param {boolean} [integral] */
function addAmount(a,b,integral = false) {
  const n = a + b;
  ok(Number.isFinite(n) && n <= Number.MAX_SAFE_INTEGER && n >= a && n >= b && (b === 0 || n > a) && (a === 0 || n > b) && (!integral || Number.isSafeInteger(n)),'invalid-counter','accounting','Unsafe aggregate arithmetic');
  return n;
}
/** @param {Replay} replay @param {Id} actorId @returns {ActorLifecycle} */
function lifecycleOf(replay,actorId) {
  const value = replay.lifecycles.get(actorId);
  ok(value !== undefined,'inconsistent-reference','actorId','Unregistered lifecycle target');
  return value;
}
/** @param {Replay} replay @param {HumanAuthorization} authorization @param {ActorBinding} issuer @param {string} at */
function authorizeHuman(replay,authorization,issuer,at) {
  ok(issuer.role === 'main' && sameWork(authorization.main,issuer,replay.c) && sameWork(authorization.owner,replay.owner,replay.c) && sameWork(replay.mainBinding,issuer,replay.c) && authorization.authorizedAt <= replay.time,'inconsistent-reference',at,'Authorization is not current Main on this branch');
  ok(!replay.authorizations.has(authorization.authorizationId),'conflicting-duplicate',at,'Human authorization reused');
  replay.authorizations.add(authorization.authorizationId);
}
/** Original kernel observations remain authoritative even before actor mirrors.
 * @param {ActivationRecord} a @param {CoordinationModel} kernel @param {ValidationContext} c @returns {readonly Readonly<{observationId:Id,at:number,stage:string}>[]} */
function deliveryFacts(a,kernel,c) {
  if (a.role === 'supervisor') return workArray(a.deliveries,c);
  const delivery = kernel.promptDeliveries[a.operationId];
  return delivery === undefined ? [] : workArray(delivery.observations,c).map(d => ({observationId:d.observationId,at:d.at,stage:d.observation.stage}));
}
/** Original native kernel facts count even before their actor mirror. No ID/time is invented.
 * @param {ActivationRecord} a @param {CoordinationModel} kernel @param {ValidationContext} c @returns {ProducerSettlement[]} */
function settlementFacts(a,kernel,c) {
  const facts = workArray(a.settlements,c).slice();
  if (a.role === 'implementer') for (const d of workArray(kernel.promptDeliveries[a.operationId]?.observations ?? [],c)) {
    if (d.observation.stage !== 'run-settled') continue;
    const fact = {observationId:d.observationId,at:d.at,phase:/** @type {const} */ ('native-settled')};
    const prior = workArray(facts,c).find(f => f.phase === fact.phase || f.observationId === fact.observationId);
    ok(prior === undefined || sameWork(prior,fact,c),'conflicting-duplicate','settlement','Native actor/kernel facts conflict');
    if (prior === undefined) facts.push(fact);
  }
  return facts;
}
/** One durable native observation cannot move between producing activations,
 * including when its retained projection changes family (output/settlement).
 * Existing per-family checks still bind exact content, phase and original time.
 * @param {Replay} replay @param {ActivationRecord} a @param {Id} observationId @param {ValidationContext} c @param {string} at */
function checkProducedObservationOwner(replay, a, observationId, c, at) {
  for (const wf of workMap(replay.workflows,c)) {
    ok(!workMap(wf.intents,c).some(i => i.observation?.observationId === observationId && i.activationId !== a.activationId),'conflicting-duplicate',at,'Native observation belongs to another output producer');
    const kernel = kernelOf(replay,wf,at);
    ok(!workMap(wf.activations,c).some(other => other.activationId !== a.activationId && workArray(settlementFacts(other,kernel,c),c).some(s => s.observationId === observationId)),'conflicting-duplicate',at,'Native observation belongs to another settlement producer');
  }
}

/** @param {ActivationRecord} a @param {ValidationContext} c @returns {ProducerSettlement|null} */
function nativeSettlement(a,c) { return workArray(a.settlements,c).find(s => s.phase === 'native-settled') ?? null; }
/** @param {readonly Id[]} declared @param {readonly Id[]} actual @param {ValidationContext} c */
function exactIds(declared,actual,c) {
  const ids = new Set(workArray(actual,c));
  return declared.length === ids.size && new Set(workArray(declared,c)).size === declared.length && workArray(declared,c).every(x => ids.has(x));
}
/** @param {ContainmentView} containment @param {readonly ProducerSettlement[]} facts @param {ValidationContext} c */
function settlementCoverage(containment,facts,c) {
  const ids = containment.settlementObservationIds ?? (containment.settlementObservationId === null ? [] : [containment.settlementObservationId]);
  return (containment.settlementObservationId === null || workArray(ids,c).includes(containment.settlementObservationId)) && exactIds(ids,workArray(facts,c).map(f => f.observationId),c) && workArray(facts,c).every(f => f.at <= containment.at);
}
/** Complete coverage is a derived prefix property, never a permanent flag.
 * @param {ActivationRecord} a @param {CoordinationModel} kernel @param {ValidationContext} c */
function containmentComplete(a,kernel,c) {
  const contained = a.containment;
  if (contained === null) return false;
  const deliveries = deliveryFacts(a,kernel,c), settlements = settlementFacts(a,kernel,c);
  if (!settlementCoverage(contained,settlements,c) || !exactIds(contained.deliveryObservationIds,workArray(deliveries,c).map(d => d.observationId),c) || !workArray(deliveries,c).every(d => d.at <= contained.at)) return false;
  if (contained.outcome === 'not-sent' && (deliveries.length !== 0 || settlements.length !== 0)) return false;
  if (a.role === 'supervisor') return contained.barrierId === null;
  const grant = kernel.grants[a.producer.grantProof.grantOperationId], b = contained.barrierId === null ? undefined : kernel.barriers[contained.barrierId];
  return grant?.phase === 'closed' && grant.latestBarrierId === contained.barrierId && b !== undefined && b.at <= contained.at && b.sessionContained && b.coverage === 'complete' && b.unknownEffectIds.length === 0 && workArray(b.admittedEffectIds,c).every(x => workArray(b.settledEffectIds,c).includes(x) || workArray(b.containedEffectIds,c).includes(x));
}
/** @param {SupervisorIntent} intent */
function outputTime(intent) { return intent.observation?.at ?? intent.at; }
/** @param {Replay} replay @param {WorkflowRuntime} wf @param {SupervisorIntent} intent @returns {AdmissionDenial|null} */
function intentAdmissionDenial(replay,wf,intent) {
  const a = activationOf(wf,intent.activationId,'intent');
  // Receipt-time denial is retained diagnostic history, not a commitment.
  // Reevaluate transient lifecycle/hold eligibility when consuming the output;
  // historical production, current ownership/retirement/expiry and immutable
  // held-commitment denial remain enforced by their actual consuming paths.
  return producerAdmissionDenial(replay,wf,a) ?? (replay.time >= intent.control.content.input.deadline.expiresAt || replay.time >= a.deadline.expiresAt ? 'producer-expired' : null);
}
/** @param {WorkflowRuntime} wf @param {ActivationRecord} a @param {CoordinationModel} kernel @param {ValidationContext} c @returns {ReservationView} */
function activationReservation(wf,a,kernel,c) {
  const deliveries = deliveryFacts(a,kernel,c);
  const sent = workArray(deliveries,c).some(d => d.stage === 'sent'), accepted = workArray(deliveries,c).some(d => d.stage === 'accepted'), rejected = workArray(deliveries,c).some(d => d.stage === 'rejected'), started = workArray(deliveries,c).some(d => d.stage === 'started');
  const contained = containmentComplete(a,kernel,c);
  // Once containment was needed, an uncovered fact must not silently inherit
  // its release through an otherwise settled compatibility path.
  const delivery = !contained && (a.containment !== null || !sent || !accepted || rejected);
  const run = !contained && (!started || !workArray(settlementFacts(a,kernel,c),c).some(s => s.phase === 'native-settled'));
  let effects = false;
  if (a.role === 'implementer') {
    const grant = kernel.grants[a.producer.grantProof.grantOperationId];
    const barrier = grant?.latestBarrierId === null || grant?.latestBarrierId === undefined ? undefined : kernel.barriers[grant.latestBarrierId];
    effects = grant === undefined || grant.phase !== 'closed' || barrier === undefined || barrier.coverage !== 'complete' || barrier.unknownEffectIds.length !== 0 || !workArray(barrier.admittedEffectIds,c).every(x => workArray(barrier.settledEffectIds,c).includes(x) || workArray(barrier.containedEffectIds,c).includes(x));
  }
  const intents = workMap(wf.intents,c).filter(i => i.activationId === a.activationId);
  const output = a.role === 'supervisor' && !wf.closed && !contained && (intents.length === 0 || workArray(intents,c).some(i => {
    if (i.activationId !== a.activationId) return false;
    if (i.control.content.input.kind === 'plan' && i.control.content.input.payload.change !== undefined) return !structuralOutputConsumed(wf,kernel,i,c);
    if (i.control.content.input.kind === 'review' && structuralOutputConsumed(wf,kernel,i,c)) return false;
    if (i.control.content.input.kind === 'plan') return wf.planIntentId !== i.intentId && !workMap(wf.intents,c).some(later => later.intentId === wf.planIntentId && outputTime(later) >= outputTime(i));
    if (i.control.content.input.kind === 'answer') return !workMap(wf.answers,c).some(answer => answer.intentId === i.intentId && answer.activationId === a.activationId && !heldCommitment(wf,answer.operationId));
    return !workRecord(kernel.decisions,c).some(d => d.candidate.source === 'supervisor-control' && d.candidate.review.activationId === a.activationId && d.candidate.review.intentId === i.intentId && !heldCommitment(wf,d.candidate.operationId));
  }));
  return {delivery,run,effects,output};
}
/** @param {CoordinationModel} kernel @param {ValidationContext} c */
function kernelReservationPending(kernel,c) {
  return workRecord(kernel.grants,c).some(g => {
    if (g.phase !== 'closed') return true;
    if (g.publication === null) return false;
    const b = g.latestBarrierId === null ? undefined : kernel.barriers[g.latestBarrierId];
    return b === undefined || b.coverage !== 'complete' || b.unknownEffectIds.length !== 0 || !workArray(b.admittedEffectIds,c).every(id => workArray(b.settledEffectIds,c).includes(id) || workArray(b.containedEffectIds,c).includes(id));
  }) || workRecord(kernel.notices,c).some(n => n.resolution === null);
}
/** Logical evidence remains immutable; dispositions cover exact witnessed debts,
 * not future facts that happen to mention the same reference.
 * @param {WorkflowRuntime} wf @param {CoordinationModel} kernel @param {ValidationContext} c @returns {LogicalDebt[]} */
function unresolvedLogicalDebts(wf,kernel,c) {
  /** @type {LogicalDebt[]} */ const debts = [];
  for (const task of workRecord(kernel.tasks,c)) if (task.obligation !== null) {
    const ref = task.obligation.kind === 'report' ? task.obligation.reportId : task.obligation.operationId;
    debts.push({ref,kind:'task',evidenceId:ref});
  }
  for (const held of workArray(wf.heldCommitments,c)) {
    debts.push({ref:held.operationId,kind:'held-commitment',evidenceId:held.observationId});
    const intent = kernel.intents[held.operationId];
    if (intent?.kind === 'decide') debts.push({ref:intent.input.reportId,kind:'held-commitment',evidenceId:held.observationId});
  }
  for (const report of workRecord(kernel.reports,c)) {
    const ref = report.envelope.reportId, decision = kernel.decisions[ref];
    if (decision === undefined || heldCommitment(wf,decision.candidate.operationId)) debts.push({ref,kind:'report',evidenceId:ref});
  }
  for (const question of workMap(wf.questions,c)) {
    const decision = kernel.decisions[question.reportId];
    const answer = question.answeredBy === null ? undefined : wf.answers.get(question.answeredBy);
    if ((answer === undefined || heldCommitment(wf,answer.operationId)) && (decision === undefined || heldCommitment(wf,decision.candidate.operationId))) debts.push({ref:question.questionId,kind:'question',evidenceId:question.questionId});
  }
  for (const intent of workMap(wf.intents,c)) {
    const kind = intent.control.content.input.kind;
    const structural = intent.control.content.input.kind === 'plan' && intent.control.content.input.payload.change !== undefined;
    const consumed = structural ? structuralOutputConsumed(wf,kernel,intent,c) : kind === 'review' && structuralOutputConsumed(wf,kernel,intent,c) ? true : kind === 'plan' ? wf.planIntentId === intent.intentId || workMap(wf.intents,c).some(i => i.intentId === wf.planIntentId && outputTime(i) >= outputTime(intent)) : kind === 'answer' ? workMap(wf.answers,c).some(a => a.intentId === intent.intentId && !heldCommitment(wf,a.operationId)) : workRecord(kernel.decisions,c).some(d => d.candidate.source === 'supervisor-control' && d.candidate.review.intentId === intent.intentId && !heldCommitment(wf,d.candidate.operationId));
    if (!consumed) debts.push({ref:intent.intentId,kind:'intent',evidenceId:intent.intentId});
  }
  return workArray(debts,c).filter(debt => !workArray(wf.dispositions,c).some(d => workArray(d.obligations,c).some(old => sameWork(old,debt,c))));
}
/** Logical disposition never waives physical facts or notices.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {CoordinationModel} kernel @returns {Id[]} */
function workflowObligations(replay,wf,kernel) {
  const c = replay.c, ids = new Set(workArray(unresolvedLogicalDebts(wf,kernel,c),c).map(d => d.ref));
  for (const notice of workRecord(kernel.notices,c)) if (notice.resolution === null) ids.add(notice.noticeId);
  for (const a of workMap(wf.activations,c)) if (reserved(activationReservation(wf,a,kernel,c))) ids.add(a.activationId);
  for (const grant of workRecord(kernel.grants,c)) {
    const b = grant.latestBarrierId === null ? undefined : kernel.barriers[grant.latestBarrierId];
    if (grant.phase !== 'closed' || grant.publication !== null && (b === undefined || b.coverage !== 'complete' || b.unknownEffectIds.length !== 0 || !workArray(b.admittedEffectIds,c).every(x => workArray(b.settledEffectIds,c).includes(x) || workArray(b.containedEffectIds,c).includes(x)))) ids.add(grant.operationId);
  }
  return workSet(ids,c);
}
/** @param {ReservationView} reservation */
function reserved(reservation) { return reservation.delivery || reservation.run || reservation.effects || reservation.output; }
/** @param {Replay} replay @param {WorkflowRuntime} wf @param {HoldScope} scope */
function scopeApplies(replay,wf,scope) {
  switch (scope.kind) {
    case 'root': return scope.id === replay.genesis.storeId;
    case 'workflow': return scope.id === wf.workflowId;
    case 'actor': return scope.id === wf.supervisorId || scope.id === wf.implementerId;
    case 'mailbox': return replay.mailboxMessages.get(scope.id)?.workflowId === wf.workflowId || scope.id === wf.supervisorId || scope.id === wf.implementerId;
    case 'activation': return wf.activations.has(scope.id);
    case 'operation': return workMap(wf.activations,replay.c).some(a => a.operationId === scope.id || a.producer.grantProof.grantOperationId === scope.id) || workMap(wf.intents,replay.c).some(i => i.control.content.binding.operationId === scope.id) || kernelOf(replay,wf,'holds').intents[scope.id] !== undefined;
  }
}
/** @param {Replay} replay @param {HoldScope} scope @param {string} at */
function checkHoldScope(replay,scope,at) {
  ok(scope.kind === 'root' ? scope.id === replay.genesis.storeId : scope.kind === 'mailbox' ? replay.mailboxMessages.has(scope.id) || replay.lifecycles.has(scope.id) : scope.kind === 'actor' ? replay.lifecycles.has(scope.id) : workMap(replay.workflows,replay.c).some(w => scopeApplies(replay,w,scope)),'inconsistent-reference',at,'Hold scope has no historical subject');
}
/** @param {Replay} replay @param {WorkflowRuntime} wf @returns {HoldRecord[]} */
function scopedHolds(replay,wf) {
  /** @type {Map<Id,HoldRecord>} */ const holds = new Map();
  for (const h of workArray(replay.holds,replay.c)) if (scopeApplies(replay,wf,h.scope)) holds.set(h.causeId,h);
  for (const h of workArray(wf.holds,replay.c)) holds.set(h.causeId,h);
  return workMap(holds,replay.c);
}
/** @param {WorkflowRuntime} wf @returns {AssignmentSnapshotV2} */
function effectiveAssignment(wf) { return {...wf.assignment,...wf.budget}; }

/** Full bootstrap and incremental append use exactly the same step, including
 * historical root proofs and publication witnesses. No event/reference replay is
 * used to recover an already validated same-operation prefix.
 * @param {ParsedRoot} root @param {ValidationContext} c @param {Replay|null} [prior] @returns {Replay} */
function runFold(root, c, prior = null) {
  const replay = prior ?? createReplay(root.genesis, root.segmentId, c);
  if (prior !== null) {
    ok(replay.c === c,'inconsistent-reference','archive.replay','Archive prefix belongs to another operation');
    ok(sameWork(root.genesis.initialOwner,replay.owner,c),'inconsistent-reference','archive.owner','New segment changed retained owner');
    ok(sameWork(root.genesis.configSnapshot,replay.genesis.configSnapshot,c) && sameWork(root.genesis.actorDefinitions,replay.genesis.actorDefinitions,c) && sameWork(root.genesis.heldLegacyRefs,replay.genesis.heldLegacyRefs,c),'unsupported-archive','archive.genesis','Rotation cannot change configuration, definitions or legacy carrier identities','unsupported');
    consumeValidationWork(c,replay.eventIds.size,'actor.archive-event-index');
    for (const id of replay.eventIds.keys()) { consumeValidationWork(c,id.length,'actor.archive-event-id'); replay.archivedEventIds.add(id); }
    replay.genesis = root.genesis; replay.segmentId = root.segmentId;
    replay.eventIds = new Map(); replay.eventCount = 0; replay.ordinaryCount = 0; replay.outcome = 'noop';
    // Old publication coordinates cannot witness a current-segment activation.
    // All durable obligations, identities, budgets and service history remain.
    // In particular plans, admitted taskPlans and structural revision identities
    // carry over verbatim; rotation never installs an uncommitted proposal.
    replay.publications = new Map();
  }
  for (const event of workArray(root.events,c)) appendActorStep(replay,root,event,c);
  return replay;
}

/** @param {Replay} replay @param {ParsedRoot} root @param {ActorWorkflowEventV2} event @param {ValidationContext} c */
function appendActorStep(replay, root, event, c) {
  requireValidationContext(c);
  ok(replay.c === c && replay.genesis === root.genesis && replay.segmentId === root.segmentId, 'inconsistent-reference', 'actor.prefix', 'Private fold/root binding mismatch');
  const i = replay.eventCount, publications = replay.publications;
  ok(i < COMMON_BOUNDS.maxEvents, 'capacity', 'actor.events', 'Event capacity exhausted');
  ok(event.sequence === i + 1, 'invalid-counter', `events.${i}.sequence`, 'Sequence must be consecutive from 1');
  ok(root.events[i] === event, 'inconsistent-reference', `events.${i}`, 'Private append differs from its journal position');
  ok(!replay.eventIds.has(event.eventId) && !replay.archivedEventIds.has(event.eventId), 'conflicting-duplicate', `events.${i}.eventId`, 'Duplicate current or archived event ID');
  consumeValidationWork(c,event.eventId.length,'actor.event-index');
  replay.eventIds.set(event.eventId,i);
  if (ordinaryEvent(event)) replay.ordinaryCount++;
  const same = comparisonInContext(c), deepFreeze = freezingInContext(c);
  consumeValidationWork(c,1,'actor.fold');
  if (event.domain === 'actor' && event.payload.kind === 'workflow-submitted') {
    ok(event.payload.submissionInput !== undefined,'unsupported-preimage',`events.${i}`,'Submission lacks supplied input content','unsupported');
  }
  if (event.domain === 'actor' && event.payload.kind === 'activation-issued') {
    const proof = event.payload.producer.grantProof;
    const retained = event.workflowId === null ? undefined : replay.workflows.get(event.workflowId)?.authorities.get(event.payload.activationId);
    ok(retained !== undefined && retained.segmentId === replay.segmentId && retained.sequence <= proof.rootRevision,'unsupported-preimage',`events.${i}`,'Activation lacks authority content in its current segment prefix','unsupported');
    ok(proof.rootRevision <= i, 'inconsistent-reference', `events.${i}`, 'Producer proof names a future root');
    consumeValidationWork(c,proof.rootRevision * 2,'actor.producer-prefix');
    const prefix = root.events.slice(0,proof.rootRevision);
    const source = prefix[retained.sequence - 1];
    ok(source !== undefined && source.domain === 'actor' && source.payload.kind === 'artifact-retained' && 'authority' in source.payload && source.workflowId === event.workflowId && source.eventId === retained.eventId && source.sequence === retained.sequence && source.at === retained.retainedAt && same(source.payload.authority,retained.authority) && same(source.payload.issuer,retained.issuer),'inconsistent-reference',`events.${i}`,'Authority retention differs from its actual prefix event');
    ok(prefix.some(e => e.domain === 'actor' && e.payload.kind === 'workflow-submitted' && e.workflowId === event.workflowId), 'inconsistent-reference', `events.${i}`, 'Producer proof precedes workflow establishment');
    ok(proof.rootHash === pairDigest('state',{version:2,encoding:'pair-actor-state/1',segmentId:root.segmentId,genesis:root.genesis,events:prefix,archiveHead:root.archiveHead},c), 'inconsistent-reference', `events.${i}`, 'Producer proof does not bind its historical root prefix');
    if (event.payload.role === 'implementer') {
      const witness = publications.get(proof.workflowId)?.get(proof.grantOperationId);
      ok(proof.workflowId === event.workflowId && witness !== undefined && witness.rootRevision <= proof.rootRevision && same(witness.identity,proof.identity), 'inconsistent-reference', `events.${i}`, 'Producer proof lacks its historical open grant publication');
      const grant = replay.implementation[proof.workflowId]?.grants[proof.grantOperationId];
      ok(grant !== undefined && same(grant.identity,witness.identity) && same(grant.commit,witness.commit) && same(grant.publication,witness.publication), 'inconsistent-reference', `events.${i}`, 'Producer grant differs from its historical commit/publication');
    }
  }
  checkMailboxObservationNamespace(replay,event,`events.${i}`,c);
  applyActorEvent(replay, event, c, `events.${i}`);
  retainActorObservationIds(replay,event,c);
  refreshMailboxRelease(replay,c);
  if (event.domain === 'actor' && event.payload.kind === 'mailbox-delivery-observed' && replay.outcome !== 'noop') {
    const entry = replay.mailboxMessages.get(event.payload.messageId);
    if (entry !== undefined && workArray(replay.mailboxResolutions.get(entry.messageId) ?? [],c).some(r => !mailboxResolutionSatisfied(replay,entry,r,c))) replay.outcome = 'hold';
  }
  if (event.domain === 'implementation' && event.workflowId !== null && event.payload.kind === 'authority-published' && replay.outcome === 'apply') {
    const grant = replay.implementation[event.workflowId].grants[event.payload.operationId];
    // Reuse the frozen kernel's actual result: raw noops and held/closed
    // publications cannot witness an open grant. Later success keeps its own
    // root revision, never the revision of an earlier inert mention.
    if (grant !== undefined && grant.phase === 'open' && grant.commit !== null && grant.publication !== null && same(grant.publication,event.payload)) {
      let workflowPublications = publications.get(event.workflowId);
      if (workflowPublications === undefined) { workflowPublications = new Map(); publications.set(event.workflowId,workflowPublications); }
      if (!workflowPublications.has(grant.operationId)) workflowPublications.set(grant.operationId,deepFreeze({rootRevision:i + 1,identity:grant.identity,commit:grant.commit,publication:grant.publication}));
    }
  }
}

/** @param {ActorGenesisV2} genesis @param {Id} segmentId @param {ValidationContext} c @returns {Replay} */
function createReplay(genesis, segmentId, c) {
  requireValidationContext(c);
  consumeValidationWork(c,genesis.actorDefinitions.length * 2,'actor.lifecycle-genesis');
  /** @type {Map<Id,ActorLifecycle>} */ const lifecycles = new Map(genesis.actorDefinitions.map(d => [d.id,Object.freeze({enabled:genesis.configSnapshot.enabled,paused:false,stopped:false,revision:0,changedBy:null})]));
  /** @type {Replay} */
  const replay = {
    c, publications:new Map(), eventIds:new Map(), archivedEventIds:new Set(), ordinaryCount:0, time:0, mainBinding:null, lifecycles, authorizations:new Set(),
    genesis, segmentId, owner: genesis.initialOwner, bindings: new Map(),
    workflows: new Map(), order: [], mailboxes: new Map(), mailboxMessages:new Map(), mailboxObservations:new Set(), mailboxAttempts:new Map(), mailboxStageFacts:new Map(), mailboxResolutions:new Map(), mailboxObservationIds:new Set(), actorObservationIds:new Set(), holds: [],
    operations: new Set(), activations: new Set(), reports: new Set(), receipts: new Set(), usageIds: new Set(),
    implementation: {}, outcome: 'noop', eventCount: 0, usage: [],
  };
  return replay;
}

/** Closed evidence references are names, never proof until resolved in the fold.
 * @param {unknown} value @param {string} path @param {ValidationContext} c @returns {EvidenceRef} */
function parseMailboxEvidence(value,path,c) {
  requireValidationContext(c);
  const v = plain(value,path), kind = pick(v.kind,['attempt-binding','delivery-observation','ingress-receipt','containment','effect-barrier','kernel-reconciliation'],path);
  if (kind === 'attempt-binding' || kind === 'delivery-observation') {
    closed(v,kind === 'attempt-binding' ? ['kind','messageId','operationId'] : ['kind','messageId','operationId','observationId'],[],path);
    const base = {messageId:id(v.messageId,path),operationId:id(v.operationId,path)};
    return kind === 'attempt-binding' ? {kind,...base} : {kind,...base,observationId:id(v.observationId,path)};
  }
  if (kind === 'containment') { closed(v,['kind','activationId','observationId'],[],path); return {kind,activationId:id(v.activationId,path),observationId:id(v.observationId,path)}; }
  if (kind === 'effect-barrier') { closed(v,['kind','barrierId'],[],path); return {kind,barrierId:id(v.barrierId,path)}; }
  if (kind === 'ingress-receipt') { closed(v,['kind','receiptId'],[],path); return {kind,receiptId:id(v.receiptId,path)}; }
  closed(v,['kind','operationId'],[],path); return {kind,operationId:id(v.operationId,path)};
}

/** @param {Replay} replay @returns {number} */
function unresolvedCount(replay) { return workMap(replay.workflows,replay.c).filter(wf => { const kernel = kernelOf(replay,wf,'reservation'); return !wf.disposed || kernelReservationPending(kernel,replay.c) || workflowObligations(replay,wf,kernel).length > 0; }).length; }
/** @param {Replay} replay @param {string} actorId @returns {number} */
function openActivations(replay, actorId) { let n = 0; for (const wf of workMap(replay.workflows,replay.c)) for (const a of workMap(wf.activations,replay.c)) if (a.actorId === actorId && reserved(activationReservation(wf,a,kernelOf(replay,wf,'reservation'),replay.c))) n++; return n; }

/** @param {ActorWorkflowEventV2} ev @param {string} at @returns {Id} */
function workflowIdOf(ev, at) { ok(ev.workflowId !== null, 'inconsistent-reference', at, 'Actor event requires workflow'); return ev.workflowId; }

/** @param {Replay} replay @param {string} workflowId @returns {WorkflowRuntime} */
function workflowOf(replay, workflowId) {
  const wf = replay.workflows.get(workflowId);
  ok(wf !== undefined, 'unresolved-reference', 'workflowId', 'Unknown workflow');
  return wf;
}

/** @param {Replay} replay @param {ActorBinding} actor @param {string} at */
function checkIssuer(replay, actor, at) {
  ok(actor.ownerSession === replay.owner.ownerSession && actor.ownerEpoch === replay.owner.ownerEpoch, 'inconsistent-reference', at, 'Issuer owner mismatch');
  if (actor.role === 'main') {
    ok(actor.sessionId === replay.owner.ownerSession, 'inconsistent-reference', at, 'Main session mismatch');
    ok(replay.mainBinding === null || sameWork(replay.mainBinding,actor,replay.c),'inconsistent-reference',at,'Main binding changed inside the current owner branch');
    replay.mainBinding ??= actor;
    return;
  }
  const definition = workArray(replay.genesis.actorDefinitions,replay.c).find(d => d.id === actor.actorId);
  ok(definition !== undefined && definition.role === actor.role && definition.model === actor.model, 'inconsistent-reference', at, 'Unregistered actor role/model');
}

/** @param {Replay} replay @param {WorkflowRuntime} wf @param {ValidationContext} c @param {string} at */
function checkAssignment(replay, wf, c, at) {
  const same = comparisonInContext(c);
  const config = replay.genesis.configSnapshot, a = wf.assignment, f = wf.implementationGenesis.fence;
  ok(config.mode === 'actor-pair', 'admission-hold', at, 'Actor workflow requires actor-pair configuration');
  ok(config.workflow.supervisorId === wf.supervisorId && config.workflow.implementerId === wf.implementerId, 'inconsistent-reference', at, 'Workflow participants differ from config');
  ok(a.configHash === pairDigest('config', config, c), 'inconsistent-reference', at, 'Assignment config digest mismatch');
  for (const definition of [a.participants.supervisor, a.participants.implementer]) {
    ok(definition !== null && same(workArray(replay.genesis.actorDefinitions,c).find(d => d.id === definition.id), definition) && same(workArray(config.actors,c).find(d => d.id === definition.id), definition), 'inconsistent-reference', at, 'Assignment definition differs from registration/config');
  }
  ok(same(a.policy, config.supervision) && same(a.limits, config.limits) && same(a.verification, config.verification) && same(a.evidence, config.evidence) && same(a.workerRequirements, config.workerRequirements) && same(a.workerResources, config.workerResources) && same(a.supervisorResources, config.supervisorResources), 'inconsistent-reference', at, 'Assignment differs from immutable config');
  ok(f.workerId === wf.implementerId && f.workspace === a.workspace.cwd && f.repoRoot === a.workspace.repoRoot && f.ownerSession === wf.owner.ownerSession && f.ownerEpoch === wf.owner.ownerEpoch, 'inconsistent-reference', at, 'Kernel genesis/workspace/owner mismatch');
}

/** Retain prospective content only. No activation lookup, binding installation,
 * operation reservation, synthetic control or external-reference charge.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {AuthorityRetainedPayload} p @param {ActorDomainEvent} ev @param {ValidationContext} c @param {string} at */
function retainAuthority(replay, wf, p, ev, c, at) {
  const same = comparisonInContext(c);
  ok(p.issuer.role === 'main' && same(p.issuer,replay.mainBinding) && same(wf.owner,replay.owner) && same(ev.owner,replay.owner),'inconsistent-reference',at,'Authority retention requires current workflow owner and exact Main');
  const authority = validateAuthorityArtifactV2InContext(p.authority,{owner:replay.owner,workflowId:wf.workflowId,workflowRevision:wf.workflowRevision},c), content = authority.content;
  ok(!replay.activations.has(content.activationId) && !workMap(replay.workflows,c).some(w => w.authorities.has(content.activationId)),'conflicting-duplicate',at,'Authority activation retention must be globally unique and prospective');
  checkAssignment(replay,wf,c,at);
  checkIssuer(replay,content.actor,at);
  const participant = content.actor.role === 'supervisor' ? wf.assignment.participants.supervisor : wf.assignment.participants.implementer;
  ok(participant !== null && content.actor.actorId === participant.id && content.actor.role === participant.role && content.actor.model === participant.model && content.profile === participant.extensionProfile,'inconsistent-reference',at,'Authority differs from assigned participant/model/profile');
  ok(ev.at >= wf.assignment.assignedAt && ev.at <= content.deadline.admissionAt && content.deadline.expiresAt <= wf.budget.deadline,'inconsistent-reference',at,'Authority retention/deadline lies outside submission or admission');
  const command = content.command;
  ok(command.payload.objective === wf.objective && same(command.payload.constraints,wf.constraints),'inconsistent-reference',at,'Authority command differs from submitted goal');
  if (content.actor.role === 'supervisor') {
    ok(content.actor.actorId === wf.supervisorId && command.kind === 'goal' && content.identity === null,'inconsistent-reference',at,'Supervisor authority command/identity mismatch');
  } else {
    const kernel = kernelOf(replay,wf,at), grant = kernel.grants[content.grantOperationId];
    const witness = replay.publications.get(wf.workflowId)?.get(content.grantOperationId);
    ok(content.actor.actorId === wf.implementerId && wf.planRecorded && command.kind === 'assignment' && content.identity !== null && grant !== undefined && grant.phase === 'open' && grant.commit !== null && grant.publication !== null && same(content.identity,grant.identity) && same(content.identity.fence,kernel.fence),'inconsistent-reference',at,'Implementer authority lacks its actual open grant');
    ok(witness !== undefined && witness.rootRevision < ev.sequence && same(witness.identity,grant.identity) && same(witness.commit,grant.commit) && same(witness.publication,grant.publication) && grant.prepared.at <= ev.at && grant.commit.at <= ev.at && grant.publication.at <= ev.at && !heldCommitment(wf,grant.operationId),'inconsistent-reference',at,'Authority lacks an applied/open publication witness');
    const task = kernel.tasks[content.identity.taskId], dispatch = task === undefined ? undefined : kernel.intents[task.dispatchOperationId];
    const commit = task === undefined ? undefined : kernel.commitments[task.dispatchOperationId];
    ok(task !== undefined && kernel.task?.kind === 'current' && kernel.task.taskId === task.taskId && task.currentGrantOperationId === grant.operationId && same(task.identity,content.identity) && dispatch?.kind === 'dispatch-requested' && commit !== undefined && commit.at <= ev.at && same(task.genesis,dispatch.assignment) && !heldCommitment(wf,task.dispatchOperationId),'inconsistent-reference',at,'Authority lacks the actual committed task/assignment');
    const step = workArray(wf.steps,c).find(s => s.id === grant.stepId), kernelStep = workArray(task.steps,c).find(s => s.id === grant.stepId);
    // The authority command carries the brief PlanStepV2 (id/title/description), so
    // the brief projection is compared against the FULL retained step. A structural
    // plan keeps complete content (including acceptance) in its catalog; a legacy
    // task has no catalog and therefore must still have no acceptance at all.
    const full = workArray(taskCatalog(task,c),c).map(entry => entry.step).find(s => s.id === grant.stepId);
    ok(step !== undefined && kernelStep !== undefined && full !== undefined && same(command.payload.step,step) && full.id === step.id && full.title === step.title && full.instructions === step.description && full.id === kernelStep.id && full.title === kernelStep.title && full.instructions === kernelStep.instructions && sameWork(full.acceptance,kernelStep.acceptance,c) && (task.stepCatalog !== undefined || full.acceptance === undefined || full.acceptance.length === 0),'inconsistent-reference',at,'Authority assignment differs from recorded/kernel step');
  }
  wf.authorities.set(content.activationId,freezeWork({authority,eventId:ev.eventId,issuer:p.issuer,retainedAt:ev.at,sequence:ev.sequence,segmentId:replay.segmentId},c));
}

/** Prefix membership is checked by appendActorStep for historical and new events.
 * This comparison precedes ordinary admission gates: a present mismatch is never
 * a lifecycle hold. The producer/control leaf checks retain their own full rules.
 * @param {WorkflowRuntime} wf @param {ActivationIssuedPayload} p @param {number} time @param {ValidationContext} c @param {string} at @returns {AuthorityEvidence} */
function activationAuthority(wf, p, time, c, at) {
  const retained = wf.authorities.get(p.activationId), producer = p.producer, proof = producer.grantProof;
  ok(retained !== undefined && retained.sequence <= proof.rootRevision,'unsupported-preimage',at,'Activation lacks authority content in its named prefix','unsupported');
  const authority = retained.authority, content = authority.content, same = comparisonInContext(c);
  ok(retained.retainedAt <= time && retained.retainedAt <= producer.intent.at && retained.retainedAt <= producer.dispatch.deadline.admissionAt,'inconsistent-reference',at,'Authority retention postdates issuance/admission');
  ok(same(content.owner,producer.owner) && same(content.actor,producer.actor) && content.profile === producer.profile && content.nonce === producer.nonce && content.workflowId === producer.workflowId && content.workflowRevision === producer.workflowRevision && content.activationId === producer.activationId && same(content.identity,producer.identity) && content.grantOperationId === proof.grantOperationId,'inconsistent-reference',at,'Retained authority differs from full producer/proof binding');
  ok(authority.digest === proof.authorityHash && (producer.authorityRef === null || producer.authorityRef.hash === authority.digest),'hash-mismatch',at,'Retained authority digest differs from producer proof/reference');
  const input = p.control.content.input;
  ok(same(content.deadline,p.deadline) && same(content.deadline,producer.dispatch.deadline) && same(content.deadline,input.deadline) && content.command.kind === input.kind && same(content.command.payload,input.payload),'inconsistent-reference',at,'Retained authority deadline/command differs from original dispatch control');
  return freezeWork({retentionEventId:retained.eventId,sequence:retained.sequence,authorityHash:authority.digest,proofRootRevision:proof.rootRevision},c);
}

/** No missing-kernel fallback: submission must already have established genesis.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {string} at @returns {CoordinationModel} */
function kernelOf(replay, wf, at) {
  const kernel = replay.implementation[wf.workflowId];
  ok(kernel !== undefined, 'inconsistent-reference', at, 'Missing historical kernel genesis');
  return kernel;
}

/** Current actor-domain eligibility, separate from kernel task/budget rules.
 * Cancellation/lifecycle observations do not call this admission predicate.
 * Reservation and budget gates additionally apply at fresh activation/kernel admission.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {string} at @param {Id|null} [actorId] */
function eligible(replay, wf, at, actorId = wf.implementerId) {
  ok(workflowAdmissionDenial(replay,wf,actorId) === null, 'admission-hold', at, 'Actor workflow admission is held');
}

/** Past held commitments are never reauthorized by resolving a later hold. Their
 * observations remain inspectable; cancellation/reconciliation do not use this gate.
 * Terminal disposal retains denied consequences and requires physical obligations to drain.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {Id|null} [actorId] @returns {AdmissionDenial|null} */
function workflowAdmissionDenial(replay, wf, actorId = wf.implementerId) {
  if (wf.heldCommitments.length > 0) return 'prior-held-commitment';
  if (wf.closed || !sameWork(wf.owner,replay.owner,replay.c)) return 'workflow-ineligible';
  if (actorId !== null) {
    const lifecycle = lifecycleOf(replay,actorId);
    if (!lifecycle.enabled || lifecycle.paused || lifecycle.stopped) return 'workflow-ineligible';
  }
  const holds = scopedHolds(replay,wf);
  if (workArray(holds,replay.c).some(h => {
    if (h.resolvedBy !== null || !scopeApplies(replay,wf,h.scope)) return false;
    if (h.scope.kind === 'root' || h.scope.kind === 'workflow') return true;
    if (actorId === null) return false;
    if (h.scope.kind === 'actor' || h.scope.kind === 'mailbox') return h.scope.id === actorId || h.scope.kind === 'mailbox' && replay.mailboxMessages.get(h.scope.id)?.targetId === actorId;
    if (h.scope.kind === 'activation') return wf.activations.get(h.scope.id)?.actorId === actorId;
    return workMap(wf.activations,replay.c).some(a => a.actorId === actorId && (a.operationId === h.scope.id || a.producer.grantProof.grantOperationId === h.scope.id)) || actorId === wf.implementerId && kernelOf(replay,wf,'holds').intents[h.scope.id] !== undefined;
  })) return 'workflow-ineligible';
  return null;
}

/** Current binding is separate from immutable historical producer evidence.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {ActivationRecord} a @returns {AdmissionDenial|null} */
function producerAdmissionDenial(replay, wf, a) {
  if (workflowAdmissionDenial(replay,wf,a.actorId) !== null) return 'producer-ineligible';
  if (workArray(a.settlements,replay.c).some(s => s.phase !== 'native-settled')) return 'producer-retired';
  if (replay.time >= a.deadline.expiresAt) return 'producer-expired';
  const acceptedPlan = wf.planIntentId === null ? undefined : wf.intents.get(wf.planIntentId);
  const planProducer = acceptedPlan?.activationId === a.activationId && acceptedPlan.control.content.input.kind === 'plan' && acceptedPlan.control.content.input.payload.planRevision === wf.planRevision;
  if (!sameWork(a.producer.owner,replay.owner,replay.c) || !sameWork(replay.bindings.get(a.actorId),a.producer.actor,replay.c) || a.producer.workflowRevision !== wf.workflowRevision || !planProducer && a.producer.workflowPlanRevision !== (wf.planRecorded ? wf.planRevision : 1) || a.containment !== null || workArray(a.deliveries,replay.c).some(d => d.stage === 'rejected')) return 'producer-ineligible';
  return null;
}

/** @param {WorkflowRuntime} wf @param {Id} activationId @param {string} at @returns {ActivationRecord} */
function activationOf(wf, activationId, at) {
  const a = wf.activations.get(activationId);
  ok(a !== undefined, 'inconsistent-reference', at, 'No historical producing activation');
  return a;
}

/** @param {Replay} replay @param {WorkflowRuntime} wf @param {Id} activationId @param {Id} intentId @param {number} time @param {string} at @returns {SupervisorIntent} */
function settledIntent(replay, wf, activationId, intentId, time, at) {
  const intent = historicalSettledIntent(wf,activationId,intentId,time,at,replay.c);
  ok(intentAdmissionDenial(replay,wf,intent) === null, 'admission-hold', at, 'Producer/output is no longer eligible');
  return intent;
}

/** Intrinsic historical proof only: missing/future facts are invalid, not held facts.
 * @param {WorkflowRuntime} wf @param {Id} activationId @param {Id} intentId @param {number} time @param {string} at @param {ValidationContext} c @returns {SupervisorIntent} */
function historicalSettledIntent(wf, activationId, intentId, time, at, c) {
  const a = activationOf(wf,activationId,at), intent = wf.intents.get(intentId);
  ok(intent !== undefined && intent.activationId === activationId && a.role === 'supervisor', 'inconsistent-reference', at, 'No matching retained supervisor intent');
  const settlement = nativeSettlement(a,c);
  ok(settlement !== null && settlement.at <= time && outputTime(intent) <= settlement.at, 'inconsistent-reference', at, 'Producer has no matching prior native settlement/production correlation');
  const deliveries = workArray(a.deliveries,c);
  ok(workArray(deliveries,c).some(d => d.stage === 'sent' && d.at <= time) && workArray(deliveries,c).some(d => d.stage === 'accepted' && d.at <= time) && !workArray(deliveries,c).some(d => d.stage === 'rejected'),'inconsistent-reference',at,'Settlement alone does not resolve original dispatch/ACK facts');
  return intent;
}

/** Bind the exact retained output control, not whichever activation reviewed a report.
 * No settlement is needed for an earlier receipt. R3 additionally qualifies its
 * prior retained sources/delivery at the kernel boundary, without a mirror cycle.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {ReviewLink} review @param {string} at @returns {SupervisorIntent} */
function reviewIntent(replay, wf, review, at) {
  const same = comparisonInContext(replay.c);
  const a = activationOf(wf, review.activationId, at), intent = wf.intents.get(review.intentId);
  ok(intent !== undefined && intent.activationId === a.activationId && a.role === 'supervisor', 'inconsistent-reference', at, 'Review lacks its actual producing intent');
  const {binding, input} = intent.control.content;
  ok(same(review.actor, a.producer.actor) && same(review.actor, binding.actor) && review.profile === binding.profile && review.workflowId === wf.workflowId && review.workflowRevision === a.producer.workflowRevision && review.intentHash === binding.inputHash && review.operationId === binding.operationId, 'inconsistent-reference', at, 'Review producer/control chain mismatch');
  ok(input.kind === 'review' && input.payload.reportId === review.reportId && input.payload.reportHash === review.reportHash && input.payload.checkpointHash === review.checkpointHash, 'inconsistent-reference', at, 'Review differs from retained control input');
  return intent;
}

/** @param {WorkflowRuntime} wf @param {Identity} identity @param {string} at @returns {ActivationRecord} */
function identityProducer(wf, identity, at) {
  const matches = workMap(wf.activations,wf.c).filter(a => a.role === 'implementer' && sameWork(a.producer.identity, identity,wf.c));
  ok(matches.length === 1, 'inconsistent-reference', at, 'Implementation identity lacks one original producer');
  return matches[0];
}

/** @param {WorkflowRuntime} wf @param {Id} operationId @param {string} at @returns {ActivationRecord} */
function commandProducer(wf, operationId, at) {
  const matches = workMap(wf.activations,wf.c).filter(a => a.role === 'implementer' && a.operationId === operationId);
  ok(matches.length === 1, 'inconsistent-reference', at, 'Prompt lacks its original activation reservation');
  return matches[0];
}

/** Intrinsic candidate/commit correlation, deliberately free of current actor
 * admission gates (see kernelAdmissionDenial). The accepted kernel alone decides
 * task admission, holds, grant closure, accounting and continuation outcomes.
 * The internal context reducer reuses only genuine immutable kernel results from
 * this registered operation. External histories/caches still reconstruct fully.
 * Incremental steps fork projections (preserving private task aliases), retain
 * original-order canonical events and pay for scans/copies/materialization.
 * Growing prefixes still cost work; producer root-prefix hashes also pay the
 * unchanged common budget. No full workflow resource fit is implied.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {CoordinationModel} kernel @param {TransitionEvent} e @param {number} time @param {ValidationContext} c @param {string} at */
function correlateKernel(replay, wf, kernel, e, time, c, at) {
  const same = comparisonInContext(c);
  const f = e.fence;
  ok(f.workerId === wf.implementerId && f.workspace === wf.assignment.workspace.cwd && f.repoRoot === wf.assignment.workspace.repoRoot, 'inconsistent-reference', at, 'Kernel event outside assigned implementer workspace');
  if (e.kind === 'owner-replaced') {
    ok(same(f, kernel.fence) && e.next.workerId === f.workerId && e.next.workspace === f.workspace && e.next.repoRoot === f.repoRoot && e.next.ownerSession === replay.owner.ownerSession && e.next.ownerEpoch === replay.owner.ownerEpoch, 'inconsistent-reference', at, 'Owner replacement lacks actor branch transition');
    return;
  }
  ok(f.ownerSession === replay.owner.ownerSession && f.ownerEpoch === replay.owner.ownerEpoch, 'inconsistent-reference', at, 'Kernel receiver owner mismatch');
  // A stale receiver fence is an inert kernel noop, not permission to apply facts.
  if (!same(f, kernel.fence)) return;
  switch (e.kind) {
    case 'lifecycle': {
      const control = wf.controls.get(e.observationId);
      ok(control !== undefined && sameWork(control.event,e,c) && sameWork(control.authorization.owner,replay.owner,c) && sameWork(control.issuer,replay.mainBinding,c),'inconsistent-reference',at,'Kernel control lacks prior exact current-Main authorization');
      return;
    }
    case 'dispatch-requested': {
      ok(wf.planRecorded && wf.planIntentId !== null, 'inconsistent-reference', at, 'Dispatch precedes the accepted supervisor plan');
      const plan = wf.intents.get(wf.planIntentId);
      ok(plan !== undefined, 'inconsistent-reference', at, 'Missing producing plan');
      historicalSettledIntent(wf, plan.activationId, plan.intentId, Math.min(time,e.at), at, c);
      ok(same(e.assignment, projectKernelAssignment(effectiveAssignment(wf), c)) && e.lifetimeDeadlineAt === wf.lifetimeDeadlineAt, 'inconsistent-reference', at, 'Kernel assignment/deadline differs from workflow snapshot');
      ok(e.request.requestId === wf.requestId && e.request.workerId === wf.implementerId && e.request.objective === wf.objective && (e.request.constraints === undefined ? wf.constraints.length === 0 : same(e.request.constraints, wf.constraints)) && e.request.context === undefined, 'inconsistent-reference', at, 'Dispatch request differs from submitted goal');
      ok(e.request.steps.length === wf.steps.length && workArray(e.request.steps,c).every((s,i) => s.id === wf.steps[i].id && s.title === wf.steps[i].title && s.instructions === wf.steps[i].description && (s.acceptance === undefined || s.acceptance.length === 0)), 'inconsistent-reference', at, 'Kernel steps differ from producer plan (description maps to instructions)');
      return;
    }
    case 'intent-committed': {
      const intent = kernel.intents[e.operationId];
      ok(intent !== undefined, 'inconsistent-reference', at, 'Commit precedes its exact retained kernel intent');
      // This immutable intent was correlated at its own accepted root prefix.
      // The kernel has just checked this observation's original V1 intent hash,
      // kind and time. Do not reinterpret its old receiver as the current one or
      // let later facts repair it. Inspection recorrelation uses historical
      // receipt/candidate times, never this storage commitment as request expiry.
      if (intent.kind === 'decide' && intent.source === 'supervisor-control') {
        qualifyDecisionInspection(replay,wf,kernel,intent,at);
        // Superseded late commitments stay kernel-held. Do not reinterpret their
        // historical basis as a new proposal against today's plan/accounting.
        const superseded = workRecord(kernel.intents,c).some(i => i.kind === 'decide' && i.source === 'supervisor-control' && i.planChange?.change.supersedesDecisionOperationId === intent.operationId);
        if (intent.planChange !== undefined && !superseded && !heldCommitment(wf,intent.operationId)) checkStructuralBasis(replay,wf,kernel,/** @type {PlanChangeV2} */ (intent.planChange.change),e.at,at);
      }
      return;
    }
    case 'prepare-grant': {
      ok(same(e.identity.fence, kernel.fence), 'inconsistent-reference', at, 'Grant identity differs from receiver fence');
      const task = kernel.tasks[e.identity.taskId];
      const dispatch = task === undefined ? undefined : kernel.intents[task.dispatchOperationId];
      ok(task !== undefined && dispatch?.kind === 'dispatch-requested' && sameWork(task.genesis,dispatch.assignment,c), 'inconsistent-reference', at, 'Grant lacks its original committed assignment');
      return;
    }
    case 'grant-committed': case 'authority-published': {
      const grant = kernel.grants[e.operationId];
      ok(grant !== undefined && grant.identity.leaseId === e.leaseId, 'inconsistent-reference', at, 'Grant observation differs from original preparation');
      // These are observations, not actor admission. activation-issued calls
      // eligible before consuming the published grant; dispatch-prepared and its
      // commitment recheck workflow and exact producer admission separately.
      // No actor grant ledger or rewrite of the kernel's observed phase is needed.
      return;
    }
    case 'dispatch-prepared': {
      const a = commandProducer(wf, e.operationId, at), p = a.producer, grant = kernel.grants[e.grantOperationId];
      ok(p.commandId === e.commandId && p.grantProof.grantOperationId === e.grantOperationId && same(p.intent.inputRef,e.input) && p.dispatch.inputHash === e.input.hash && grant !== undefined && same(p.identity,grant.identity) && same(a.control.content.binding,producerBinding(p,a.operationId,a.intentHash)) && e.at >= p.intent.at, 'inconsistent-reference', at, 'Prompt changed original command/input/grant/identity/control');
      return;
    }
    case 'worker-delivery': {
      const a = commandProducer(wf,e.operationId,at);
      ok(same(a.producer.identity,e.identity) && a.producer.commandId === e.commandId && a.producer.dispatch.inputHash === e.inputHash, 'inconsistent-reference', at, 'Delivery changed producer identity');
      const o = e.observation;
      ok(e.at >= a.producer.intent.at,'inconsistent-reference',at,'Delivery predates its original producing command');
      if (o.stage === 'started' || o.stage === 'run-settled') ok(o.activationId === a.activationId, 'inconsistent-reference', at, 'Delivery changed activation');
      if (o.stage === 'run-settled') {
        const fact = {observationId:e.observationId,at:e.at,phase:/** @type {const} */ ('native-settled')};
        const old = workArray(a.settlements,c).find(s => s.phase === fact.phase || s.observationId === fact.observationId);
        ok(old === undefined || same(old,fact),'conflicting-duplicate',at,'Kernel native observation conflicts with retained settlement');
        checkProducedObservationOwner(replay,a,fact.observationId,c,at);
      }
      return;
    }
    case 'report': {
      const r = e.report;
      const matches = workMap(wf.activations,c).filter(a => { const i = a.producer.identity; return i !== null && i.taskId === r.payload.taskId && i.attemptId === r.attemptId && i.attemptNumber === r.attemptNumber && i.leaseId === r.leaseId && i.planRevision === r.planRevision && i.fence.workerId === r.workerId && i.fence.ownerSession === r.ownerSession && i.fence.ownerEpoch === r.ownerEpoch && i.fence.workerGeneration === r.workerGeneration && i.fence.sessionId === r.sessionId && i.fence.nonce === r.nonce; });
      ok(matches.length === 1, 'inconsistent-reference', at, 'Report lacks its exact historical producer');
      return;
    }
    case 'effects-reconciled': {
      const a = identityProducer(wf,e.identity,at);
      ok(a.producer.grantProof.grantOperationId === e.operationId, 'inconsistent-reference', at, 'Effect barrier changed original grant');
      return;
    }
    case 'evidence-receipt': {
      if (e.review !== undefined) {
        const intent = reviewIntent(replay,wf,e.review,at), input = intent.control.content.input;
        ok(same(e.reader,e.review.actor) && outputTime(intent) <= e.at && input.kind === 'review' && same(input.payload.scope,e.scope), 'inconsistent-reference', at, 'Receipt reader/scope/time differs from producing intent');
        qualifyKernelInspection(replay,wf,e,at);
      }
      else ok(e.reader.role === 'main', 'inconsistent-reference', at, 'Supervisor receipt requires producer linkage');
      return;
    }
    case 'decide': {
      if (e.source === 'main-decision') { checkIssuer(replay,e.reviewer,at); return; }
      const intent = reviewIntent(replay,wf,e.review,at), a = activationOf(wf,e.review.activationId,at);
      historicalSettledIntent(wf,a.activationId,e.review.intentId,Math.min(time,e.at),at,c);
      const native = nativeSettlement(a,c);
      ok(native !== null && same(e.review.settlement,{observationId:native.observationId,at:native.at}), 'inconsistent-reference', at, 'Decision changed producing settlement');
      const input = intent.control.content.input;
      ok(input.kind === 'review' && input.payload.action === e.input.action && input.payload.reason === e.input.feedback && input.payload.reportId === e.input.reportId && (e.input.checkpointHash === undefined || input.payload.checkpointHash === e.input.checkpointHash), 'inconsistent-reference', at, 'Kernel decision differs from supervisor control');
      ok(e.operationId !== e.review.operationId && e.operationId !== a.operationId, 'inconsistent-reference', at, 'Kernel and supervisor operations are distinct namespaces');
      qualifyDecisionInspection(replay,wf,kernel,e,at);
      if (e.planChange !== undefined) checkStructuralBasis(replay,wf,kernel,/** @type {PlanChangeV2} */ (e.planChange.change),e.at,at);
      return;
    }
    case 'usage-observed': {
      const a = activationOf(wf,e.activationId,at);
      ok(a.role === 'implementer' && same(a.producer.actor,e.participant) && a.producer.identity !== null && a.producer.identity.taskId === e.taskId, 'inconsistent-reference', at, 'Usage changed producer identity/model/task');
      return;
    }
    case 'amendment-proposed': {
      const amendment = workArray(wf.amendments,c).find(a => a.kernelOperationId === e.operationId), task = kernel.tasks[e.taskId];
      ok(amendment !== undefined && task !== undefined && sameWork(amendment.authorization.owner,replay.owner,c) && sameWork(amendment.authorization.main,replay.mainBinding,c),'inconsistent-reference',at,'Kernel amendment lacks earlier current-Main workflow authorization');
      ok(e.authorization.authorizationId === amendment.authorization.authorizationId && e.authorization.authorizedAt === amendment.authorization.authorizedAt && e.authorization.reason === amendment.authorization.reason && e.expectedBudgetRevision === task.budgetRevision && e.beforeHash === task.budgetHash,'inconsistent-reference',at,'Kernel amendment changed human authorization or expected task revision');
      const policy = {...task.policy}, limits = {...task.limits}; let deadline = task.lifetimeDeadlineAt;
      for (const change of workArray(e.changes,c)) {
        switch (change.field) {
          case 'summaryDetail': policy.summaryDetail = change.value; break;
          case 'maxRevisions': case 'maxRevisionsPerStep': policy[change.field] = change.value; break;
          case 'lifetimeDeadlineAt': deadline = change.value; break;
          case 'maxReportedCostUsd': case 'maxOutputTokens': limits[change.field] = change.value; break;
          default: limits[change.field] = change.value;
        }
      }
      ok(sameWork(policy,amendment.after.policy,c) && sameWork(limits,amendment.after.limits,c) && deadline === amendment.after.deadline,'inconsistent-reference',at,'Kernel amendment does not project exact authorized workflow budget');
      return;
    }
    case 'counter-observed': {
      const a = commandProducer(wf,e.operationId,at);
      ok(a.producer.identity !== null && a.producer.identity.taskId === e.taskId && (e.counter.kind !== 'active-interval' || e.counter.activationId === a.activationId), 'inconsistent-reference', at, 'Counter changed producer');
      return;
    }
    // These accepted kernel branches bind their retained report/task/operation or
    // source themselves. They do not acquire a supervisor identity or settlement.
    case 'checkpoint-finalized': case 'checkpoint-current': case 'notice-resolved':
    case 'main-delivery': case 'budget-evaluated':
    case 'automatic-action-prepared': case 'reconciliation-proposed': case 'reset-requested':
    case 'runtime': case 'failure': case 'unsupported': return;
  }
}

/** Admission is evaluated only after intrinsic correlation succeeds. No catch
 * converts malformed inputs or programming failures into observed held facts.
 * Pure candidates use a no-append hold; exactly bound storage observations use
 * the derived heldCommitments path in applyImplementation.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {CoordinationModel} kernel @param {TransitionEvent} e @param {number} time @param {string} at @returns {AdmissionDenial|null} */
function kernelAdmissionDenial(replay, wf, kernel, e, time, at) {
  const same = comparisonInContext(replay.c);
  const admits = e.kind === 'dispatch-requested' || e.kind === 'prepare-grant' || e.kind === 'grant-committed' || e.kind === 'authority-published' || e.kind === 'dispatch-prepared' || e.kind === 'automatic-action-prepared' || e.kind === 'decide' && e.input.action !== 'cancel';
  if (admits) {
    const actorId = e.kind === 'decide' ? e.source === 'supervisor-control' ? wf.supervisorId : null : wf.implementerId;
    const denial = workflowAdmissionDenial(replay,wf,actorId) ?? budgetDenial(replay,wf,time,e.kind === 'decide' && e.input.action === 'revise');
    if (denial !== null) return denial;
    const task = kernel.task;
    if (task?.kind === 'current' && (!sameWork(task.policy,wf.budget.policy,replay.c) || !sameWork(task.limits,wf.budget.limits,replay.c) || task.lifetimeDeadlineAt !== wf.budget.deadline)) return 'budget';
  }
  switch (e.kind) {
    case 'intent-committed': {
      const intent = kernel.intents[e.operationId];
      ok(intent !== undefined, 'inconsistent-reference', at, 'Commit precedes its original intent');
      if (heldCommitment(wf,e.operationId)) return 'prior-held-commitment';
      return kernelAdmissionDenial(replay,wf,kernel,intent,time,at);
    }
    case 'dispatch-requested': {
      const intent = wf.planIntentId === null ? undefined : wf.intents.get(wf.planIntentId);
      ok(intent !== undefined, 'inconsistent-reference', at, 'Missing producing plan');
      return workflowAdmissionDenial(replay,wf) ?? intentAdmissionDenial(replay,wf,intent);
    }
    case 'prepare-grant': {
      if (openActivations(replay,wf.implementerId) > 0) return 'producer-retired';
      return workflowAdmissionDenial(replay,wf);
    }
    case 'grant-committed': case 'authority-published': return workflowAdmissionDenial(replay,wf);
    case 'dispatch-prepared': {
      const a = commandProducer(wf,e.operationId,at);
      if (settlementFacts(a,kernel,replay.c).length > 0 || a.closed) return 'producer-retired';
      if (time >= a.deadline.expiresAt) return 'producer-expired';
      if (a.producer.identity === null || !same(a.producer.identity.fence,kernel.fence)) return 'producer-ineligible';
      return workflowAdmissionDenial(replay,wf) ?? producerAdmissionDenial(replay,wf,a);
    }
    case 'decide': {
      if (e.reviewer.ownerSession !== replay.owner.ownerSession || e.reviewer.ownerEpoch !== replay.owner.ownerEpoch) return 'producer-ineligible';
      const denial = e.input.action === 'cancel' ? null : workflowAdmissionDenial(replay,wf,e.source === 'supervisor-control' ? wf.supervisorId : null);
      if (e.source !== 'supervisor-control') return denial;
      const intent = wf.intents.get(e.review.intentId);
      ok(intent !== undefined,'inconsistent-reference',at,'Missing producing decision intent');
      const reviewDenial = denial ?? intentAdmissionDenial(replay,wf,intent);
      if (reviewDenial !== null || e.planChange === undefined) return reviewDenial;
      const plan = wf.intents.get(e.planChange.planLink.intentId);
      ok(plan !== undefined,'inconsistent-reference',at,'Missing producing structural plan intent');
      return intentAdmissionDenial(replay,wf,plan);
    }
    default: return null; // Observations and Main containment/reconciliation.
  }
}

/** @param {WorkflowRuntime} wf @param {Id} operationId @returns {boolean} */
function heldCommitment(wf, operationId) { return workArray(wf.heldCommitments,wf.c).some(h => h.operationId === operationId); }

/** Retain distinct denied storage observations even for an already denied
 * operation. A prior logical disposition covers facts, never future phases.
 * Retry wrappers keep the original receipt/denial without duplicating its debt.
 * @param {WorkflowRuntime} wf @param {HeldCommitment} fact @param {ValidationContext} c */
function retainHeldCommitment(wf, fact, c) {
  const old = workArray(wf.heldCommitments,c).find(h => h.observationId === fact.observationId);
  if (old !== undefined) {
    ok(old.operationId === fact.operationId && old.intentKind === fact.intentKind,'conflicting-duplicate','heldCommitment','Held storage observation changed operation or phase');
    return;
  }
  wf.heldCommitments.push(freezingInContext(c)(fact));
}

/** A denied consequence cannot close/advance the actor workflow merely because
 * the non-authorizing kernel records it. Explicit admitted cancellation survives.
 * @param {WorkflowRuntime} wf @param {CoordinationModel} kernel @param {boolean} [cancellation] */
function syncKernelStatus(wf, kernel, cancellation = false) {
  if (wf.closed || wf.heldCommitments.length > 0 && !cancellation) return;
  const task = kernel.task;
  if (task?.kind !== 'current') return;
  if (task.status === 'completed' || task.status === 'cancelled') { wf.status = task.status; wf.closed = true; }
  else if (task.obligation?.kind === 'report') { const report = kernel.reports[task.obligation.reportId]; wf.status = report.envelope.payload.kind === 'question' ? 'waiting' : 'review'; }
  else wf.status = 'implementing';
}

/** Called only for an actor-admitted kernel APPLY commitment, never a candidate,
 * stale/noop, held kernel result or actor-denied storage observation. A previously
 * checked source is reused by identity, with no decoding or extra reference.
 * Legacy Main approvals still work; without a checked next image they invalidate
 * the optional stronger base rather than keeping a stale before-image alive.
 * @param {WorkflowRuntime} wf @param {CoordinationModel} prior @param {CoordinationModel} next @param {Extract<TransitionEvent,{kind:'intent-committed'}>} commit @param {Id} eventId @param {ValidationContext} c @param {string} at */
function advanceTaskBase(wf, prior, next, commit, eventId, c, at) {
  const same = comparisonInContext(c), deepFreeze = freezingInContext(c);
  const intent = prior.intents[commit.operationId];
  if (intent?.kind !== 'decide' || intent.input.action !== 'approve' || wf.heldCommitments.length > 0) return;
  const decision = next.decisions[intent.input.reportId];
  if (prior.commitments[commit.operationId] !== undefined || prior.decisions[intent.input.reportId] !== undefined || decision === undefined) return;
  ok(same(next.commitments[commit.operationId],commit) && same(decision.commit,commit) && same(decision.candidate,intent), 'inconsistent-reference', at, 'Base advancement lacks exact new committed approval');
  const base = wf.taskBases.get(decision.producerIdentity.taskId);
  if (base === undefined || base.identity === null || base.nativeHash === null) return;
  const report = next.reports[intent.input.reportId];
  ok(report !== undefined && report.content.kind === 'finalized', 'inconsistent-reference', at, 'Approved base lacks finalized report');
  const checkpointHash = report.content.report.checkpoint.checkpointHash;
  const source = workMap(wf.artifacts,c).find(s => s.kind === 'evidence' && s.proof !== null && s.proof.taskId === base.taskId && s.proof.reportId === intent.input.reportId && s.retainedAt <= commit.at && s.beforeHash === base.nativeHash && s.afterHash === checkpointHash);
  const checked = source?.kind === 'evidence' && source.proof !== null ? source : null;
  const advanced = deepFreeze({...base,identity:checked?.proof?.after ?? null,nativeHash:checked?.afterHash ?? null,advancedBy:eventId,reportId:id(intent.input.reportId,at)});
  encodePairJSON(advanced,c);
  wf.taskBases.set(base.taskId,advanced);
}

/** @param {Replay} replay @param {ImplementationDomainEvent} ev @param {ValidationContext} c @param {string} at */
function applyImplementation(replay, ev, c, at) {
  const deepFreeze = freezingInContext(c);
  ok(ev.workflowId !== null, 'inconsistent-reference', at, 'Implementation event requires an earlier workflow');
  const wf = replay.workflows.get(ev.workflowId);
  ok(wf !== undefined, 'inconsistent-reference', at, 'Implementation event precedes workflow establishment');
  const kernel = kernelOf(replay,wf,at), e = ev.payload;
  ok(e.at <= ev.at, 'inconsistent-reference', at, 'Future kernel observation');
  // Original implementer observation identity/content is checked by the same
  // kernel step for both historical and incremental folds. No actor-side usage
  // shortcut can disagree with receipt conflicts or bypass receiver fencing.
  const step = reduceCoordinationInContext(kernel,e,c);
  ok(step.kind !== 'reject', 'operation-conflict', at, 'Kernel rejected append');
  // Applied duplicates and stale receiver noops acquire no new authority.
  if (step.kind === 'noop') { replay.outcome = 'noop'; return; }
  correlateKernel(replay,wf,kernel,e,ev.at,c,at);
  const introduces = e.kind === 'dispatch-requested' || e.kind === 'prepare-grant' || e.kind === 'dispatch-prepared' || e.kind === 'decide' || e.kind === 'amendment-proposed' || e.kind === 'automatic-action-prepared' || e.kind === 'reconciliation-proposed' || e.kind === 'reset-requested';
  if (introduces && 'operationId' in e && kernel.intents[e.operationId] === undefined && kernel.grants[e.operationId] === undefined) {
    // A prompt consumes its already reserved actor operation; every other kernel
    // operation is globally unique across workflows and actor output namespaces.
    if (e.kind !== 'dispatch-prepared') ok(!replay.operations.has(e.operationId),'conflicting-duplicate',at,'Operation reused across actor/kernel domains');
    replay.operations.add(e.operationId);
  }
  const denial = kernelAdmissionDenial(replay,wf,kernel,e,replay.time,at);
  if (denial !== null) {
    // Only these storage observations have an actor admission consequence.
    // Their original intent/hash/identity have already passed kernel and actor
    // correlation. An unsuccessful proposal has no durable append receipt.
    ok(e.kind === 'intent-committed' || e.kind === 'grant-committed' || e.kind === 'authority-published', 'admission-hold', at, 'Proposal denied before actor admission');
    const intentKind = e.kind === 'intent-committed' ? e.intentKind : e.kind === 'grant-committed' ? 'grant' : 'publication';
    retainHeldCommitment(wf,{nonAuthorizing:true,eventId:ev.eventId,observationId:e.observationId,operationId:e.operationId,intentKind,reason:denial},c);
  }
  // Raw kernel facts are deliberately preserved, not an authorizing aggregate
  // view. Consumers must also observe the reconstructed actor disposition.
  replay.implementation[wf.workflowId] = step.model;
  replay.outcome = denial === null ? step.kind : 'hold';
  const intent = e.kind === 'intent-committed' ? kernel.intents[e.operationId] : undefined;
  const cancellation = denial === null && (e.kind === 'lifecycle' && e.command === 'cancel' || e.kind === 'intent-committed' && step.model.commitments[e.operationId] !== undefined && intent?.kind === 'decide' && intent.input.action === 'cancel');
  if (e.kind === 'lifecycle' && denial === null && step.kind === 'apply') {
    const old = lifecycleOf(replay,wf.implementerId), next = {...old,revision:addAmount(old.revision,1,true),changedBy:ev.eventId};
    if (e.command === 'enable' || e.command === 'disable') next.enabled = e.command === 'enable';
    if (e.command === 'start' || e.command === 'stop') next.stopped = e.command === 'stop';
    if (e.command === 'resume' || e.command === 'pause') next.paused = e.command === 'pause';
    replay.lifecycles.set(wf.implementerId,Object.freeze(next));
  }
  if (denial === null && step.kind === 'apply' && e.kind === 'intent-committed') {
    advanceTaskBase(wf,kernel,step.model,e,ev.eventId,c,at);
    const decision = intent?.kind === 'decide' ? step.model.decisions[intent.input.reportId] : undefined;
    if (wf.heldCommitments.length === 0 && intent?.kind === 'decide' && intent.source === 'supervisor-control' && intent.planChange !== undefined && kernel.decisions[intent.input.reportId] === undefined && decision !== undefined && sameWork(decision.commit,e,c) && sameWork(decision.candidate,intent,c)) {
      const {change,planLink} = intent.planChange, task = step.model.tasks[change.expected.taskId];
      ok(!wf.structuralRevisionOperations.has(e.operationId) && task !== undefined && task.planRevision === change.next.taskPlanRevision && task.structuralPlan?.workflowPlanRevision === change.next.workflowPlanRevision,'inconsistent-reference',at,'Structural installation lacks exact new kernel commitment');
      wf.structuralRevisionOperations.add(e.operationId);
      wf.planRevision = change.next.workflowPlanRevision; wf.planIntentId = planLink.intentId; wf.planRecorded = true;
      // Brief assignment compatibility only; full content/acceptance lives in
      // taskPlans.catalog. Retired IDs remain available for late attribution.
      wf.steps = deepFreeze(workArray(task.steps,c).map(step => ({id:step.id,title:step.title,description:step.instructions})));
    }
  }
  // Store only actor-admitted projections. A denied kernel commitment must not
  // leak a new catalog/current/debt through later observations or mirror events.
  // A retained held consequence can still carry genuinely updated accounting (a
  // late counter for a retired predecessor, for example). Publish the derived
  // lineage for held kernels too; a rejected step has no retained model to read.
  if (denial === null && wf.heldCommitments.length === 0) {
    for (const task of workRecord(step.model.tasks,c)) wf.taskPlans.set(task.taskId,projectTaskPlan(wf,task,c));
  }
  syncKernelStatus(wf,step.model,cancellation);
  if (cancellation && !wf.closed) { wf.closed = true; wf.status = 'cancelled'; }
  if (e.kind === 'worker-delivery') {
    const a = commandProducer(wf,e.operationId,at);
    if (a.containment !== null && !containmentComplete(a,step.model,c)) replay.outcome = 'hold';
  }
}

/** @param {Replay} replay @param {ActorWorkflowEventV2} ev @param {ValidationContext} c @param {string} at */
function applyActorEvent(replay, ev, c, at) {
  const same = comparisonInContext(c), deepFreeze = freezingInContext(c);
  ok(same(ev.owner, replay.owner), 'inconsistent-reference', `${at}.owner`, 'Event receiver owner does not match the current branch owner');
  replay.eventCount++;
  // Admission uses the historical receipt high-water mark, not a backdated
  // payload timestamp. Independent native observation timestamps remain intact.
  replay.time = Math.max(replay.time,ev.at);
  replay.outcome = 'apply';
  if (ev.domain === 'implementation') return applyImplementation(replay, ev, c, at);
  const p = ev.payload;
  const kind = p.kind;
  const issuer = p.issuer;
  // Observations keep their original producing owner/session after receiver
  // succession. Only consequences require current admission; Main always binds
  // the current branch. No historical issuer is promoted to current authority.
  const historical = issuer.role !== 'main' && 'activationId' in p && ['activation-delivery-observed','activation-settled','supervisor-usage-recorded','supervisor-intent-recorded','report-observed','question-raised','attempt-opened','effects-observed','inspection-recorded','decision-recorded','answer-recorded'].includes(kind);
  if (p.kind === 'mailbox-delivery-observed' && issuer.role !== 'main') {
    const attempt = replay.mailboxAttempts.get(p.messageId)?.get(p.operationId);
    ok(attempt !== undefined && sameWork(issuer,attempt.consumer,c),'inconsistent-reference',at,'Delivery issuer changed its retained consumer');
  } else if (historical && 'activationId' in p && typeof p.activationId === 'string') {
    const wf = workflowOf(replay,workflowIdOf(ev,at)), a = activationOf(wf,p.activationId,at);
    ok(sameWork(issuer,a.producer.actor,c),'inconsistent-reference',at,'Observation changed original producer');
  } else checkIssuer(replay, issuer, at);
  switch (kind) {
    case 'kernel-control-authorized': {
      const wf = workflowOf(replay,workflowIdOf(ev,at)), kernel = kernelOf(replay,wf,at);
      authorizeHuman(replay,p.authorization,issuer,at);
      ok(sameWork(p.event.fence,kernel.fence,c) && p.event.at >= ev.at && !wf.controls.has(p.event.observationId),'inconsistent-reference',at,'Control must bind the current kernel and a fresh subsequent observation');
      wf.controls.set(p.event.observationId,p);
      return;
    }
    case 'supervisor-accounting-reconciled': {
      const wf = workflowOf(replay,workflowIdOf(ev,at)), a = activationOf(wf,p.activationId,at);
      ok(issuer.role === 'main' && same(issuer,replay.mainBinding) && a.role === 'supervisor' && same(p.binding,producerBinding(a.producer,a.operationId,a.intentHash)), 'inconsistent-reference',at,'Accounting requires current Main and exact original producer/operation; a source tag is not authentication');
      const old = workArray(a.accountingHistory,c).find(proof => proof.observationId === p.observationId);
      if (old !== undefined) {
        ok(old.at === p.at && same(old.observer,issuer) && same(old.binding,p.binding) && same(old.coveredObservationIds,p.coveredObservationIds) && same(old.resolutions,p.resolutions),'conflicting-duplicate',at,'Accounting original observation changed');
        replay.outcome = 'noop'; return;
      }
      ok(p.at <= ev.at && (a.accounting === null || a.accounting.at < p.at),'inconsistent-reference',at,'Completeness requires a new nonfuture observation');
      ok(!workMap(replay.workflows,c).some(w => workMap(w.activations,c).some(other => workArray(other.accountingHistory,c).some(proof => proof.observationId === p.observationId))),'conflicting-duplicate',at,'Accounting observation reused');
      const entries = supervisorEntries(wf,a,c);
      ok(!workArray(entries,c).some(e => e.observationId === p.observationId),'conflicting-duplicate',at,'Completeness cannot name a metric observation as its own identity');
      /** @type {SupervisorResolution[]} */ const named = [];
      for (const resolution of workArray(p.resolutions ?? [],c)) {
        ok(!workArray(named,c).some(r => r.metric === resolution.metric && (r.unknownObservationId === resolution.unknownObservationId || r.evidenceObservationId === resolution.evidenceObservationId)),'conflicting-duplicate',at,'Duplicate resolution or reused evidence');
        named.push(resolution);
        const original = workArray(entries,c).find(e => e.metric === resolution.metric && e.observationId === resolution.unknownObservationId);
        const evidence = workArray(entries,c).find(e => e.metric === resolution.metric && e.observationId === resolution.evidenceObservationId);
        ok(original !== undefined && original.value === null && evidence !== undefined && evidence.value !== null && original.observationId !== evidence.observationId && original.observedAt <= p.at && evidence.observedAt <= p.at && same(original.producer,evidence.producer) && same(original.producer,a.producer.actor) && original.operationId === a.operationId && evidence.operationId === a.operationId && original.workflowId === wf.workflowId && evidence.workflowId === wf.workflowId,'inconsistent-reference',at,'Resolution requires actual same-producer/activation/operation/workflow/metric null and known observations');
        const prior = workArray(a.resolutions,c).find(r => r.metric === resolution.metric && (r.unknownObservationId === resolution.unknownObservationId || r.evidenceObservationId === resolution.evidenceObservationId));
        ok(prior === undefined || prior.unknownObservationId === resolution.unknownObservationId && prior.evidenceObservationId === resolution.evidenceObservationId,'conflicting-duplicate',at,'Immutable resolution changed or evidence reused');
        if (prior === undefined) a.resolutions.push(deepFreeze({...resolution,reconciledBy:p.observationId,at:p.at}));
      }
      const kernel = kernelOf(replay,wf,at);
      const proof = deepFreeze({observationId:p.observationId,at:p.at,coveredObservationIds:p.coveredObservationIds,...(p.resolutions === undefined ? {} : {resolutions:p.resolutions}),observer:issuer,binding:p.binding,metricCoverage:workArray(entries,c).map(e => ({observationId:e.observationId,metric:e.metric})),deliveryObservationIds:workArray(deliveryFacts(a,kernel,c),c).map(d => d.observationId),settlementObservationIds:workArray(settlementFacts(a,kernel,c),c).map(s => s.observationId),containmentObservationId:a.containment?.observationId ?? null});
      ok(supervisorAccountingComplete(wf,a,kernel,c,proof),'inconsistent-reference',at,'Completeness requires actual native completion or complete containment and exact resolved coverage of all three metrics');
      a.accounting = proof; a.accountingHistory.push(proof);
      return;
    }
    case 'actor-lifecycle': {
      ok(ev.workflowId === null,'inconsistent-reference',at,'Actor lifecycle is root-scoped');
      authorizeHuman(replay,p.authorization,issuer,at);
      const old = lifecycleOf(replay,p.actorId);
      ok(old.revision === p.expectedRevision,'inconsistent-reference',at,'Lifecycle revision conflict');
      const next = {...old,revision:addAmount(old.revision,1,true),changedBy:ev.eventId};
      switch (p.command) {
        case 'enable': next.enabled = true; break;
        case 'disable': next.enabled = false; break;
        case 'start': next.stopped = false; break;
        case 'stop': next.stopped = true; break;
        case 'pause': next.paused = true; break;
        case 'resume': next.paused = false; break;
      }
      // No assignment, identity, deadline, attempt, accounting or obligation reset.
      replay.lifecycles.set(p.actorId,Object.freeze(next));
      return;
    }
    case 'workflow-amended': {
      const wf = workflowOf(replay,workflowIdOf(ev,at)), kernel = kernelOf(replay,wf,at);
      authorizeHuman(replay,p.authorization,issuer,at);
      ok(!wf.closed && sameWork(wf.owner,replay.owner,c),'admission-hold',at,'Cannot amend a closed or former-owner workflow');
      ok(p.expectedRevision === wf.budget.budgetRevision && sameWork(p.before,wf.budget,c) && p.after.assignedAt === wf.assignment.assignedAt && p.after.budgetRevision === p.operationId && p.operationId !== p.expectedRevision,'inconsistent-reference',at,'Amendment must bind exact prior/new immutable lifetime snapshots');
      ok(sameWork(p.after.policy,{...p.before.policy,maxRevisions:p.after.policy.maxRevisions,maxRevisionsPerStep:p.after.policy.maxRevisionsPerStep,summaryDetail:p.after.policy.summaryDetail},c),'inconsistent-reference',at,'Workflow amendment cannot change policy permissions');
      ok(!replay.operations.has(p.operationId) && p.kernelOperationId !== p.operationId,'conflicting-duplicate',at,'Amendment operation reused');
      ok(workArray(wf.amendments,c).every(a => a.kernelOperationId === null || kernel.commitments[a.kernelOperationId] !== undefined),'admission-hold',at,'Previous task budget amendment is still uncommitted');
      const task = kernel.task;
      ok(task === null ? p.kernelOperationId === null : task.kind === 'current' && p.kernelOperationId !== null && kernel.intents[p.kernelOperationId] === undefined && kernel.grants[p.kernelOperationId] === undefined,'inconsistent-reference',at,'Task budget amendment needs its own future kernel operation');
      replay.operations.add(p.operationId);
      wf.amendments.push(p); wf.budget = p.after; wf.lifetimeDeadlineAt = p.after.deadline;
      return;
    }
    case 'workflow-escalated': {
      const wf = workflowOf(replay,workflowIdOf(ev,at));
      authorizeHuman(replay,p.authorization,issuer,at);
      ok(!wf.closed,'admission-hold',at,'Terminal outcome is absorbing');
      wf.closed = true; wf.status = 'escalated';
      return;
    }
    case 'activation-contained': {
      const wf = workflowOf(replay,workflowIdOf(ev,at)), a = activationOf(wf,p.activationId,at), kernel = kernelOf(replay,wf,at);
      ok(sameWork(p.binding,producerBinding(a.producer,a.operationId,a.intentHash),c) && p.at >= a.producer.intent.at && p.at <= ev.at,'inconsistent-reference',at,'Containment changed original producer/operation/time');
      const observation = deepFreeze({observationId:p.observationId,at:p.at,outcome:p.outcome,deliveryObservationIds:p.deliveryObservationIds,settlementObservationId:p.settlementObservationId,barrierId:p.barrierId,...(p.settlementObservationIds === undefined ? {} : {settlementObservationIds:p.settlementObservationIds})});
      const old = workArray(a.containments,c).find(o => o.observationId === p.observationId);
      if (old !== undefined) { ok(same(old,observation),'conflicting-duplicate',at,'Containment original observation changed'); replay.outcome = 'noop'; return; }
      ok(!workMap(replay.workflows,c).some(w => workMap(w.activations,c).some(other => other !== a && workArray(other.containments,c).some(o => o.observationId === p.observationId))),'conflicting-duplicate',at,'Containment original identity reused for another producer');
      const facts = deliveryFacts(a,kernel,c), settlements = settlementFacts(a,kernel,c);
      ok(workArray(facts,c).every(d => d.at <= p.at && workArray(p.deliveryObservationIds,c).includes(d.observationId)) && p.deliveryObservationIds.length === facts.length,'inconsistent-reference',at,'Containment must cover exact independent delivery facts');
      ok(settlementCoverage(observation,settlements,c),'inconsistent-reference',at,'Containment must cover every retained independent settlement fact');
      if (p.outcome === 'not-sent') ok(facts.length === 0 && settlements.length === 0,'inconsistent-reference',at,'Not-sent contradicts retained execution facts');
      if (a.role === 'implementer') {
        const grant = kernel.grants[a.producer.grantProof.grantOperationId], barrier = p.barrierId === null ? undefined : kernel.barriers[p.barrierId];
        ok(grant !== undefined && grant.phase === 'closed' && grant.latestBarrierId === p.barrierId && barrier !== undefined && barrier.at <= p.at && barrier.sessionContained && barrier.coverage === 'complete' && barrier.unknownEffectIds.length === 0 && workArray(barrier.admittedEffectIds,c).every(x => workArray(barrier.settledEffectIds,c).includes(x) || workArray(barrier.containedEffectIds,c).includes(x)),'inconsistent-reference',at,'Implementer containment requires latest complete session-contained kernel barrier');
      } else ok(p.barrierId === null,'inconsistent-reference',at,'Supervisor cannot borrow implementer effects');
      ok(a.containment === null || a.containment.at < p.at && a.containment.observationId !== p.observationId,'conflicting-duplicate',at,'Containment observation did not advance');
      a.containment = observation; a.containments.push(observation);
      return;
    }
    case 'task-base-recorded': {
      const wf = workflowOf(replay,workflowIdOf(ev,at)), kernel = kernelOf(replay,wf,at);
      eligible(replay,wf,at);
      const task = kernel.tasks[p.taskId], dispatch = kernel.intents[p.dispatchOperationId], commit = kernel.commitments[p.dispatchOperationId];
      ok(!wf.taskBases.has(p.taskId) && task !== undefined && kernel.task?.kind === 'current' && kernel.task.taskId === p.taskId && task.status === 'assigned' && task.identity === null && task.dispatchOperationId === p.dispatchOperationId, 'inconsistent-reference', at, 'Base requires the initial committed current task exactly once');
      ok(dispatch?.kind === 'dispatch-requested' && dispatch.taskId === p.taskId && same(dispatch.fence,kernel.fence) && commit !== undefined && commit.at <= ev.at && !heldCommitment(wf,p.dispatchOperationId), 'inconsistent-reference', at, 'Base lacks admitted dispatch commitment');
      // Conservative boundary: even an earlier held prepare attempt closes this
      // optional opportunity. No capture timestamp or later report can reopen it.
      ok(!workArray(kernel.events,c).some(e => e.kind === 'prepare-grant' && e.identity.taskId === p.taskId) && !workRecord(kernel.reports,c).some(r => r.producerIdentity.taskId === p.taskId) && !workMap(wf.activations,c).some(a => a.producer.identity?.taskId === p.taskId), 'inconsistent-reference', at, 'Base is too late: task authority/work was already attempted');
      const nativeHash = nativeIdentityHash(p.identity,wf,c,at);
      const base = deepFreeze({taskId:p.taskId,dispatchOperationId:p.dispatchOperationId,identity:p.identity,nativeHash,establishedBy:ev.eventId,advancedBy:null,reportId:null});
      encodePairJSON(base,c);
      wf.taskBases.set(p.taskId,base);
      return;
    }
    case 'inspection-delivery-observed': {
      const wf = workflowOf(replay,workflowIdOf(ev,at)), source = retainedArtifact(wf,p.reply,at);
      ok(source.kind === 'inspection' && source.inspection.content.kind === 'inspection-reply', 'inconsistent-reference', at, 'Delivery requires earlier actual reply');
      const reply = source.inspection.content, requestSource = retainedArtifact(wf,reply.request,at);
      ok(requestSource.kind === 'inspection' && requestSource.inspection.content.kind === 'inspection-request', 'inconsistent-reference', at, 'Delivery requires earlier request');
      ok(p.activationId === reply.activationId && source.retainedAt <= p.observation.at && reply.at <= p.observation.at && p.observation.at <= ev.at && p.observation.at < requestSource.inspection.content.deadline.expiresAt, 'inconsistent-reference', at, 'Delivery activation/time/deadline mismatch');
      inspectionProducer(replay,wf,reply,p.observation.at,at);
      ok(!wf.inspectionDeliveries.has(p.observation.observationId) && !workMap(wf.inspectionDeliveries,c).some(d => same(d.reply,p.reply)), 'conflicting-duplicate', at, 'Inspection delivery observation/reply reused');
      ok(wf.inspectionDeliveries.size < COMMON_BOUNDS.maxInspectionReceipts, 'capacity', at, 'Inspection delivery count exhausted');
      wf.inspectionDeliveries.set(p.observation.observationId,deepFreeze({activationId:p.activationId,reply:p.reply,observation:p.observation,retainedAt:ev.at,sequence:ev.sequence}));
      return;
    }
    case 'artifact-retained': {
      const wf = workflowOf(replay,workflowIdOf(ev,at));
      // Observation, not fresh activation/decision admission. Later holds do not
      // erase truthful source facts; the consuming candidate has its own gate.
      if ('authority' in p) retainAuthority(replay,wf,p,ev,c,at);
      else retainArtifact(replay,wf,p,ev.at,ev.sequence,c,at);
      return;
    }
    case 'workflow-submitted': {
      const workflowId = ev.workflowId;
      ok(workflowId !== null, 'missing-field', `${at}.workflowId`, 'Submission requires a workflow ID');
      const input = p.submissionInput;
      ok(input !== undefined,'unsupported-preimage',at,'Submission lacks supplied input content','unsupported');
      ok(input.storeId === replay.genesis.storeId && input.workflowId === workflowId && input.workflowRevision === p.requestId && input.requestId === p.requestId && same(input.owner,ev.owner) && same(input.owner,replay.owner) && same(input.issuer,p.issuer) && same(input.issuer,replay.mainBinding),'inconsistent-reference',at,'Submission input store/workflow/owner/Main mismatch');
      ok(input.objective === p.objective && same(input.constraints,p.constraints) && input.supervisorId === p.supervisorId && input.implementerId === p.implementerId && input.lifetimeDeadlineAt === p.lifetimeDeadlineAt && same(input.assignment,p.assignment) && same(input.implementationGenesis,p.implementationGenesis),'inconsistent-reference',at,'Submission input differs from submitted payload');
      ok(pairDigest('workflow-input',input,c) === p.inputHash,'hash-mismatch',at,'Supplied submission input digest mismatch');
      ok(!replay.workflows.has(workflowId), 'conflicting-duplicate', `${at}.workflowId`, 'Workflow ID reused');
      ok(unresolvedCount(replay) < COMMON_BOUNDS.maxUnresolvedWorkflows, 'unresolved-workflow', `${at}.workflowId`, 'Only one unresolved workflow is admitted', 'unsupported');
      /** @type {WorkflowRuntime} */
      const wf = {
        c, workflowId, requestId: p.requestId, inputHash: p.inputHash, submissionEvidence:deepFreeze({status:'verified',eventId:ev.eventId,inputHash:p.inputHash}), authorities:new Map(), objective: p.objective, constraints: p.constraints,
        owner: ev.owner, supervisorId: p.supervisorId, implementerId: p.implementerId, status: 'planning',
        workflowRevision: p.requestId, planRevision: 0, steps: [], planRecorded: false, planIntentId: null, plans: new Map(), taskPlans: new Map(), structuralRevisionOperations: new Set(), intents: new Map(), artifacts: new Map(), inspectionDeliveries: new Map(), taskBases: new Map(), heldCommitments: [], dispositions: [], closureObservations: [],
        implementationGenesis: p.implementationGenesis, assignment: p.assignment, budget:{budgetRevision:p.assignment.budgetRevision,policy:p.assignment.policy,limits:p.assignment.limits,assignedAt:p.assignment.assignedAt,deadline:p.assignment.deadline,budgetHash:p.assignment.budgetHash}, amendments:[], controls:new Map(), lifetimeDeadlineAt: p.lifetimeDeadlineAt,
        activations: new Map(), questions: new Map(), answers: new Map(), attempts: new Map(), reports: new Map(),
        effects: new Map(), inspections: new Map(), decisions: new Map(), usage: [], holds: [], closed: false, disposed:false, openReportId: null,
      };
      checkAssignment(replay, wf, c, at);
      ok(p.assignment.assignedAt <= ev.at && p.lifetimeDeadlineAt === p.assignment.deadline, 'inconsistent-reference', at, 'Future assignment or mismatched immutable lifetime deadline');
      replay.implementation[workflowId] = validateCoordinationModelInContext({mode:'internal-non-authorizing', genesis:p.implementationGenesis, events:[]},c);
      replay.workflows.set(workflowId, wf); replay.order.push(workflowId);
      eligible(replay,wf,at); eligible(replay,wf,at,wf.supervisorId);
      ok(budgetDenial(replay,wf,replay.time) === null,'admission-hold',at,'Submission exceeds immutable lifetime budget');
      return;
    }
    case 'plan-recorded': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      eligible(replay,wf,at,wf.supervisorId);
      ok(issuer.actorId === wf.supervisorId, 'inconsistent-reference', at, 'Plan issuer is not the workflow supervisor');
      ok(p.planRevision === addAmount(wf.planRevision,1,true), 'invalid-counter', `${at}.planRevision`, 'Plan revision must advance exactly once');
      const intent = settledIntent(replay, wf, p.activationId, p.intentId, ev.at, at);
      const input = intent.control.content.input;
      ok(input.kind === 'plan' && input.payload.planRevision === p.planRevision && same(input.payload.steps, p.steps) && same(issuer, intent.control.content.binding.actor), 'inconsistent-reference', at, 'Plan differs from actual producer control');
      ok(p.workflowRevision === wf.workflowRevision, 'inconsistent-reference', at, 'Plan changes its producing workflow revision');
      const kernel = kernelOf(replay,wf,at);
      if (input.payload.change !== undefined) {
        checkStructuralBasis(replay,wf,kernel,input.payload.change,outputTime(intent),at);
        ok(!wf.plans.has(p.intentId),'conflicting-duplicate',at,'Structural plan already recorded');
        wf.plans.set(p.intentId,deepFreeze({payload:p,eventId:ev.eventId,at:ev.at}));
        return; // Proposal only: the exact admitted revise commitment installs it.
      }
      ok(wf.status === 'planning' && workRecord(kernel.intents,c).every(i => i.kind !== 'dispatch-requested'), 'admission-hold', at, 'Legacy plan changes must precede immutable kernel dispatch');
      wf.plans.set(p.intentId,deepFreeze({payload:p,eventId:ev.eventId,at:ev.at}));
      wf.planRevision = p.planRevision; wf.planIntentId = p.intentId;
      wf.steps = p.steps; wf.planRecorded = true;
      return;
    }
    case 'activation-issued': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      const authorityEvidence = activationAuthority(wf,p,ev.at,c,at);
      eligible(replay, wf, at, p.actorId);
      ok(budgetDenial(replay,wf,replay.time) === null,'admission-hold',at,'Workflow lifetime/usage/step budget is exhausted or unknown');
      const producer = p.producer, control = p.control;
      checkIssuer(replay, producer.actor, at);
      ok(issuer.role === 'main', 'inconsistent-reference', at, 'Activation reservation requires Main');
      ok(producer.activationId === p.activationId && producer.operationId === p.operationId && producer.role === p.role && producer.actor.actorId === p.actorId && producer.intent.intentId === p.intentId && producer.intent.inputHash === p.intentHash && same(producer.dispatch.deadline,p.deadline), 'inconsistent-reference', at, 'Activation summary differs from concrete producer');
      ok(same(producer.owner,replay.owner) && producer.workflowId === wf.workflowId && producer.workflowRevision === wf.workflowRevision && p.workflowRevision === wf.workflowRevision && producer.workflowPlanRevision === (wf.planRecorded ? wf.planRevision : 1), 'inconsistent-reference', at, 'Producer workflow/branch mismatch');
      ok(producer.grantProof.storeId === replay.genesis.storeId && producer.intent.at === ev.at && producer.dispatch.deadline.admissionAt === ev.at && replay.time < producer.dispatch.deadline.expiresAt && producer.dispatch.deadline.expiresAt <= wf.budget.deadline, 'inconsistent-reference', at, 'Producer store/time mismatch');
      const previousBinding = replay.bindings.get(p.actorId);
      ok(previousBinding === undefined || same(previousBinding,producer.actor) || producer.actor.generation > previousBinding.generation, 'inconsistent-reference', at, 'Actor session changed without advancing generation');
      ok(producer.intent.byteLength === Buffer.byteLength(encodePairJSON(control.content.input,c),'utf8'), 'inconsistent-reference', at, 'Dispatch input byte length mismatch');
      ok(workRecord(producer.observations,c).every(o => o === null) && producer.resolution === null, 'inconsistent-reference', at, 'Issuance cannot import future observations or resolution');
      ok(same(control.content.binding,producerBinding(producer,p.operationId,p.intentHash)) && control.content.input.requestId === producer.commandId && producer.intent.intentId === producer.commandId && same(control.content.input.deadline,producer.dispatch.deadline), 'inconsistent-reference', at, 'Original dispatch control mismatch');
      ok(producer.intent.inputRef !== null && producer.intent.inputRef.hash === p.intentHash && producer.dispatch.inputHash === p.intentHash, 'inconsistent-reference', at, 'Missing original command input reference');
      ok(!replay.operations.has(p.operationId) && !workMap(replay.workflows,c).some(w => workMap(w.activations,c).some(a => a.producer.commandId === producer.commandId || a.producer.intent.intentId === producer.intent.intentId)), 'conflicting-duplicate', at, 'Producer operation/command/intent reused');
      ok(openActivations(replay,p.actorId) < 1, 'unsettled-activation', at, 'One unresolved activation per actor');
      const activationId = p.activationId;
      ok(!replay.activations.has(activationId), 'conflicting-duplicate', `${at}.activationId`, 'Activation ID reused');
      if (p.role === 'implementer') {
        ok(wf.planRecorded, 'admission-hold', at, 'Implementer activation requires a recorded plan');
        ok(p.actorId === wf.implementerId && p.workflowRevision === wf.workflowRevision, 'inconsistent-reference', at, 'Implementer binding mismatch');
        const kernel = kernelOf(replay,wf,at), grant = kernel.grants[producer.grantProof.grantOperationId];
        ok(grant !== undefined && grant.phase === 'open' && grant.commit !== null && grant.publication !== null && producer.identity !== null && same(producer.identity,grant.identity) && same(producer.identity.fence,kernel.fence), 'inconsistent-reference', at, 'Implementer producer lacks its published kernel grant');
        ok(!workMap(wf.activations,c).some(a => a.producer.grantProof.grantOperationId === grant.operationId), 'conflicting-duplicate', at, 'Grant already has a producer');
        const input = control.content.input;
        const step = workArray(wf.steps,c).find(s => s.id === grant.stepId);
        ok(input.kind === 'assignment' && input.payload.objective === wf.objective && same(input.payload.constraints,wf.constraints) && same(input.payload.step,step), 'inconsistent-reference', at, 'Dispatch control differs from assigned step');
      } else {
        ok(p.actorId === wf.supervisorId && producer.identity === null, 'inconsistent-reference', at, 'Supervisor binding mismatch');
        const input = control.content.input;
        ok(input.kind === 'goal' && input.payload.objective === wf.objective && same(input.payload.constraints,wf.constraints), 'inconsistent-reference', at, 'Supervisor dispatch differs from submitted goal');
      }
      replay.activations.add(activationId); replay.operations.add(p.operationId);
      replay.bindings.set(p.actorId,producer.actor);
      /** @type {ActivationRecord} */
      const record = { activationId, authorityEvidence, role: p.role, actorId: p.actorId, operationId: p.operationId, intentId: p.intentId, intentHash: p.intentHash, deadline: p.deadline, settled: false, settlementObservation: null, settlement: null, producer, control, deliveries: [], containment:null, accounting:null, accountingHistory:[], resolutions:[], settlements:[], containments:[], closed: false };
      wf.activations.set(activationId, record);
      return;
    }
    case 'activation-delivery-observed': {
      const wf = workflowOf(replay, workflowIdOf(ev,at)), a = activationOf(wf,p.activationId,at), o = p.observation;
      ok(issuer.role === 'main' || same(issuer,a.producer.actor), 'inconsistent-reference', at, 'Delivery observer mismatch');
      ok(o.commandId === a.producer.commandId && o.inputHash === a.producer.dispatch.inputHash && o.at >= a.producer.intent.at && o.at <= ev.at, 'inconsistent-reference', at, 'Delivery command/input/time mismatch');
      const old = workArray(a.deliveries,c).find(d => d.stage === o.stage || d.observationId === o.observationId);
      if (old !== undefined) { ok(same(old,o),'conflicting-duplicate',at,'Delivery original observation changed'); replay.outcome = 'noop'; return; }
      if (a.role === 'implementer') {
        const delivery = kernelOf(replay,wf,at).promptDeliveries[a.operationId];
        ok(delivery !== undefined && workArray(delivery.observations,c).some(d => d.observationId === o.observationId && d.at === o.at && d.observation.stage === o.stage && d.commandId === o.commandId && d.inputHash === o.inputHash), 'inconsistent-reference', at, 'Actor delivery is not a retained kernel observation');
      }
      a.deliveries = [...workArray(a.deliveries,c),o];
      if (a.containment !== null && !containmentComplete(a,kernelOf(replay,wf,at),c) || workArray(a.deliveries,c).some(d => d.stage === 'rejected') && (workArray(a.deliveries,c).some(d => d.stage === 'started' || d.stage === 'accepted') || a.settlements.length > 0)) replay.outcome = 'hold';
      return;
    }
    case 'supervisor-intent-recorded': {
      const wf = workflowOf(replay,workflowIdOf(ev,at)), a = activationOf(wf,p.activationId,at);
      const {binding,input} = p.control.content;
      ok(a.role === 'supervisor' && same(issuer,a.producer.actor) && same(binding,producerBinding(a.producer,binding.operationId,binding.inputHash)), 'inconsistent-reference', at, 'Output changed producing activation identity');
      const old = wf.intents.get(input.requestId);
      if (old !== undefined) {
        ok(old.activationId === a.activationId && same(old.control,p.control) && same(old.observation,p.observation),'conflicting-duplicate',at,'Output original identity/content changed');
        replay.outcome = 'noop'; return;
      }
      const producedAt = p.observation?.at ?? ev.at, native = nativeSettlement(a,c);
      ok(producedAt <= ev.at && producedAt >= a.producer.intent.at && workArray(a.deliveries,c).some(d => d.stage === 'started' && d.at <= producedAt),'inconsistent-reference',at,'Output has no actual producing run/time');
      // With omitted production evidence, late receipt is only an upper bound.
      // Retain it, but never pretend it proves production before native completion.
      ok(p.observation === undefined || native === null || producedAt <= native.at,'inconsistent-reference',at,'Original output contradicts native completion');
      ok(input.causationId === a.producer.intent.intentId && input.correlationId === a.operationId && input.deadline.admissionAt <= producedAt,'inconsistent-reference',at,'Output changed original dispatch or predates its request');
      if (input.kind === 'review' || input.kind === 'answer') {
        const report = kernelOf(replay,wf,at).reports[input.payload.reportId];
        ok(report !== undefined && report.acceptedAt <= producedAt && report.envelope.payloadHash === input.payload.reportHash, 'inconsistent-reference', at, 'Supervisor output precedes its actual report');
        if (input.kind === 'review') ok(report.content.kind === 'finalized' && report.finalizationWitness !== null && report.finalizationWitness.at <= producedAt && report.content.report.checkpoint.checkpointHash === input.payload.checkpointHash, 'inconsistent-reference', at, 'Review output precedes its actual finalized checkpoint');
        else ok(report.envelope.payload.kind === 'question', 'inconsistent-reference', at, 'Answer output does not name a question');
      } else ok(input.kind === 'plan' && input.payload.planRevision >= a.producer.workflowPlanRevision,'inconsistent-reference',at,'Plan output predates its producing revision');
      if (input.kind === 'plan' && input.payload.change !== undefined) {
        const change = input.payload.change, kernel = kernelOf(replay,wf,at);
        checkStructuralBasis(replay,wf,kernel,change,producedAt,at);
        const task = kernel.tasks[change.expected.taskId], catalog = new Map(workArray(taskCatalog(task,c),c).map(entry => [entry.step.id,entry.step]));
        for (const entry of workArray(change.introducedSteps,c)) {
          ok(!catalog.has(entry.step.id),'inconsistent-reference',at,'Structural introduction reuses catalog ID');
          catalog.set(entry.step.id,entry.step);
        }
        const brief = workArray(change.remainingStepIds,c).map(key => {
          const step = catalog.get(key);
          ok(step !== undefined,'inconsistent-reference',at,'Structural remainder names unknown step');
          return {id:step.id,title:step.title,description:step.instructions};
        });
        ok(input.payload.planRevision === change.next.workflowPlanRevision && same(input.payload.steps,brief),'inconsistent-reference',at,'Structural plan brief differs from full executable remainder');
        // A later proposal may supersede a candidate for this report. Its own
        // review must resolve this already-retained output, not an earlier review.
      }
      if (input.kind === 'review' && input.payload.planLink !== undefined) {
        const plan = linkedStructuralPlan(wf,a.activationId,input.payload.planLink,producedAt,at,c), x = plan.change.expected;
        ok(input.payload.action === 'revise' && input.payload.scope.kind === 'all' && x.reportId === input.payload.reportId && x.reportHash === input.payload.reportHash && x.checkpointHash === input.payload.checkpointHash,'inconsistent-reference',at,'Structural review changed plan report/checkpoint or lacks all scope');
      }
      ok(!workMap(replay.workflows,c).some(w => w.intents.has(input.requestId) || workMap(w.activations,c).some(other => other.intentId === input.requestId) || p.observation !== undefined && workMap(w.intents,c).some(i => i.observation?.observationId === p.observation?.observationId)) && !replay.operations.has(binding.operationId), 'conflicting-duplicate', at, 'Supervisor intent/operation/original observation reused');
      if (p.observation !== undefined) checkProducedObservationOwner(replay,a,p.observation.observationId,c,at);
      let denial = producerAdmissionDenial(replay,wf,a);
      if (replay.time >= input.deadline.expiresAt || producedAt >= input.deadline.expiresAt) denial ??= 'producer-expired';
      if (p.observation === undefined && native !== null && ev.at > native.at) denial ??= 'producer-ineligible';
      if (input.kind === 'plan' && input.payload.change === undefined && (wf.status !== 'planning' || input.payload.planRevision !== addAmount(wf.planRevision,1,true) || workRecord(kernelOf(replay,wf,at).intents,c).some(i => i.kind === 'dispatch-requested'))) denial ??= 'workflow-ineligible';
      replay.operations.add(binding.operationId);
      wf.intents.set(input.requestId,deepFreeze({activationId:a.activationId,intentId:input.requestId,at:ev.at,receivedAt:ev.at,...(p.observation === undefined ? {} : {observation:p.observation}),admissionDenial:denial,control:p.control}));
      if (denial !== null) replay.outcome = 'hold';
      return;
    }
    case 'activation-settled': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      const a = wf.activations.get(p.activationId);
      ok(a !== undefined && a.role === p.role && (issuer.role === 'main' || same(issuer,a.producer.actor)), 'inconsistent-reference', at, 'Unknown or mismatched activation settlement');
      ok(p.at >= a.producer.intent.at && p.at <= ev.at, 'inconsistent-reference', at, 'Settlement time outside producing history');
      if (p.phase === 'native-settled') {
        if (a.role === 'supervisor') ok(workArray(a.deliveries,c).some(d => d.stage === 'started' && d.at <= p.at), 'inconsistent-reference', at, 'Native settlement lacks producing run');
        else { const delivery = kernelOf(replay,wf,at).promptDeliveries[a.operationId]; ok(delivery !== undefined && workArray(delivery.observations,c).some(d => d.observation.stage === 'run-settled' && d.observation.activationId === a.activationId && d.observationId === p.observationId && d.at === p.at), 'inconsistent-reference', at, 'Settlement is not the retained kernel run observation'); }
      }
      const fact = deepFreeze({observationId:p.observationId,at:p.at,phase:p.phase});
      const old = workArray(a.settlements,c).find(s => s.phase === p.phase || s.observationId === p.observationId);
      if (old !== undefined) { ok(same(old,fact),'conflicting-duplicate',at,'Settlement phase/original identity changed'); replay.outcome = 'noop'; return; }
      const retained = workArray(settlementFacts(a,kernelOf(replay,wf,at),c),c).find(s => s.phase === p.phase || s.observationId === p.observationId);
      ok(retained === undefined || same(retained,fact),'conflicting-duplicate',at,'Settlement conflicts with original kernel native fact');
      checkProducedObservationOwner(replay,a,p.observationId,c,at);
      if (p.phase === 'native-settled') ok(workMap(wf.intents,c).every(i => i.activationId !== a.activationId || i.observation === undefined || i.observation.at <= p.at),'inconsistent-reference',at,'Native completion contradicts original production');
      a.settlements.push(fact);
      // First observed phase remains the compatibility projection, never proof
      // of native completion. All consumers below use independent facts.
      if (a.settlement === null) { a.settled = true; a.settlementObservation = p.observationId; a.settlement = fact; }
      if (a.containment !== null && !containmentComplete(a,kernelOf(replay,wf,at),c) || workArray(a.deliveries,c).some(d => d.stage === 'rejected') && p.phase === 'native-settled') replay.outcome = 'hold';
      return;
    }
    case 'mailbox-enqueued': return applyMailboxEnqueue(replay, p, ev, at);
    case 'mailbox-disposition': return applyMailboxDisposition(replay, p, ev, at);
    case 'mailbox-attempt-bound': return applyMailboxAttempt(replay,p,ev,at,c);
    case 'mailbox-delivery-observed': return applyMailboxDelivery(replay,p,ev,at,c);
    case 'mailbox-reconciled': return applyMailboxReconciliation(replay,p,ev,at,c);
    case 'question-raised': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      const a = wf.activations.get(p.activationId);
      ok(a !== undefined && a.role === 'implementer' && a.actorId === issuer.actorId, 'inconsistent-reference', at, 'Question activation mismatch');
      const report = wf.reports.get(p.reportId);
      ok(report !== undefined && report.reportKind === 'question' && report.activationId === p.activationId && same(issuer,a.producer.actor), 'inconsistent-reference', at, 'Question requires its own retained question report');
      ok(!wf.questions.has(p.questionId), 'conflicting-duplicate', `${at}.questionId`, 'Question ID reused');
      wf.questions.set(p.questionId, { questionId: p.questionId, reportId: p.reportId, activationId: p.activationId, answeredBy: null });
      syncKernelStatus(wf,kernelOf(replay,wf,at));
      return;
    }
    case 'answer-recorded': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      const q = wf.questions.get(p.questionId);
      ok(q !== undefined, 'unresolved-reference', `${at}.questionId`, 'Unknown question');
      ok(q.answeredBy === null, 'conflicting-duplicate', `${at}.questionId`, 'Question already answered');
      const intent = historicalSettledIntent(wf,p.activationId,p.intentId,ev.at,at,c);
      const input = intent.control.content.input, report = kernelOf(replay,wf,at).reports[q.reportId], decision = kernelOf(replay,wf,at).decisions[q.reportId];
      ok(input.kind === 'answer' && input.payload.reportId === q.reportId && report !== undefined && input.payload.reportHash === report.envelope.payloadHash && same(issuer,intent.control.content.binding.actor), 'inconsistent-reference', at, 'Answer differs from producing control');
      ok(decision !== undefined && decision.candidate.operationId === p.operationId && decision.candidate.source === 'supervisor-control' && decision.candidate.review.activationId === p.activationId && decision.candidate.input.action === 'answer' && decision.candidate.input.feedback === input.payload.answer, 'inconsistent-reference', at, 'Answer has no exact committed kernel decision');
      ok(!wf.answers.has(p.answerId), 'conflicting-duplicate', `${at}.answerId`, 'Answer ID reused');
      if (heldCommitment(wf,p.operationId)) replay.outcome = 'hold';
      q.answeredBy = p.answerId;
      wf.answers.set(p.answerId, { answerId:p.answerId, questionId:p.questionId, activationId:p.activationId, intentId:p.intentId, operationId:p.operationId, answer:input.payload.answer });
      syncKernelStatus(wf,kernelOf(replay,wf,at));
      return;
    }
    case 'attempt-opened': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      const a = wf.activations.get(p.activationId);
      ok(a !== undefined && a.role === 'implementer' && same(issuer,a.producer.actor), 'inconsistent-reference', at, 'Attempt activation mismatch');
      const kernel = kernelOf(replay,wf,at), identity = a.producer.identity, grant = kernel.grants[a.producer.grantProof.grantOperationId];
      ok(identity !== null && grant !== undefined && grant.commit !== null && grant.publication !== null && identity.attemptId === p.attemptId && identity.planRevision === p.planRevision && grant.stepId === p.stepId && kernel.commitments[a.operationId] !== undefined, 'inconsistent-reference', at, 'Attempt lacks committed kernel prompt/grant identity');
      ok(!wf.attempts.has(p.attemptId), 'conflicting-duplicate', `${at}.attemptId`, 'Attempt ID reused');
      ok(workArray(wf.steps,c).some(s => s.id === p.stepId) || workArray(wf.taskPlans.get(identity.taskId)?.catalog ?? [],c).some(entry => entry.step.id === p.stepId), 'inconsistent-reference', at, 'Attempt step outside immutable workflow catalog');
      // Retain the attempt mirror for late report/effect attribution, never as
      // fresh prompt permission. Its held commitment remains separately visible.
      wf.attempts.set(p.attemptId, { attemptId: p.attemptId, activationId: p.activationId, planRevision: p.planRevision, stepId: p.stepId, reportId: null });
      if (heldCommitment(wf,a.operationId)) replay.outcome = 'hold';
      syncKernelStatus(wf,kernel);
      return;
    }
    case 'report-observed': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      const attempt = wf.attempts.get(p.attemptId);
      ok(attempt !== undefined && attempt.activationId === p.activationId && attempt.stepId === p.stepId, 'inconsistent-reference', at, 'Report attempt mismatch');
      const kernel = kernelOf(replay,wf,at), retained = kernel.reports[p.reportId], a = activationOf(wf,p.activationId,at);
      ok(retained !== undefined && same(retained.producerIdentity,a.producer.identity) && same(issuer,a.producer.actor) && retained.envelope.payloadHash === p.reportHash && retained.envelope.payload.kind === p.reportKind && retained.envelope.attemptId === p.attemptId && retained.envelope.payload.stepId === p.stepId, 'inconsistent-reference', at, 'Actor report differs from retained kernel report');
      ok(!replay.reports.has(p.reportId), 'conflicting-duplicate', `${at}.reportId`, 'Report ID reused');
      replay.reports.add(p.reportId);
      wf.reports.set(p.reportId, { reportId: p.reportId, attemptId: p.attemptId, activationId: p.activationId, reportHash: p.reportHash, reportKind: p.reportKind, stepId: p.stepId, barrierId: null });
      attempt.reportId = p.reportId; wf.openReportId = p.reportId;
      syncKernelStatus(wf,kernel);
      return;
    }
    case 'effects-observed': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      const a = wf.activations.get(p.activationId);
      ok(a !== undefined && a.role === 'implementer' && (issuer.role === 'main' || same(issuer,a.producer.actor)), 'inconsistent-reference', at, 'Effects activation mismatch');
      const barrier = kernelOf(replay,wf,at).barriers[p.barrierId];
      ok(barrier !== undefined && same(barrier.identity,a.producer.identity) && barrier.operationId === a.producer.grantProof.grantOperationId && barrier.observationId === p.observationId && barrier.coverage === p.coverage && same(barrier.admittedEffectIds,p.admittedEffectIds) && same(barrier.settledEffectIds,p.settledEffectIds) && same(barrier.containedEffectIds,p.containedEffectIds) && same(barrier.unknownEffectIds,p.unknownEffectIds), 'inconsistent-reference', at, 'Actor effects differ from retained kernel barrier');
      ok(!wf.effects.has(p.barrierId), 'conflicting-duplicate', `${at}.barrierId`, 'Barrier ID reused');
      wf.effects.set(p.barrierId, { barrierId: p.barrierId, activationId: p.activationId, coverage: p.coverage });
      return;
    }
    case 'inspection-recorded': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      const report = wf.reports.get(p.reportId);
      ok(report !== undefined, 'unresolved-reference', `${at}.reportId`, 'Inspection requires a retained report');
      const a = wf.activations.get(p.activationId);
      ok(a !== undefined && a.role === 'supervisor' && a.actorId === issuer.actorId, 'inconsistent-reference', at, 'Inspection activation mismatch');
      const review = p.review;
      ok(review.reportId === p.reportId && review.reportHash === report.reportHash && review.checkpointHash === p.checkpointHash, 'inconsistent-reference', at, 'Inspection report/checkpoint mismatch');
      ok(review.workflowId === wf.workflowId && review.workflowRevision === wf.workflowRevision, 'inconsistent-reference', at, 'Inspection workflow revision mismatch');
      ok(review.activationId === p.activationId, 'inconsistent-reference', at, 'Inspection witness activation mismatch');
      reviewIntent(replay,wf,review,at);
      const retained = kernelOf(replay,wf,at).evidence[p.receiptId];
      ok(retained !== undefined && same(retained.review,review) && retained.requestId === p.requestId && retained.replyId === p.replyId && same(retained.scope,p.scope) && same(issuer,review.actor), 'inconsistent-reference', at, 'Actor inspection lacks exact earlier kernel receipt');
      ok(retained.at <= ev.at, 'inconsistent-reference', at, 'Actor mirror precedes kernel receipt time');
      const ids = qualifyKernelInspection(replay,wf,retained,`${at}.review`);
      ok(new Set(workArray(p.evidenceIds,c)).size === p.evidenceIds.length && p.evidenceIds.length === ids.evidenceIds.length && workArray(p.evidenceIds,c).every(key => workArray(ids.evidenceIds,c).includes(key)), 'inconsistent-reference', at, 'Actor evidence IDs differ from exact retained evidence facts');
      ok(ids.requestId === p.requestId && ids.replyId === p.replyId && ids.receiptId === p.receiptId, 'inconsistent-reference', at, 'Derived inspection IDs do not match the declared event');
      ok(!replay.receipts.has(ids.receiptId), 'conflicting-duplicate', `${at}.receiptId`, 'Inspection receipt ID reused');
      replay.receipts.add(ids.receiptId);
      wf.inspections.set(ids.receiptId, deepFreeze({receiptId:ids.receiptId,requestId:ids.requestId,replyId:ids.replyId,reportId:p.reportId,checkpointHash:p.checkpointHash,activationId:p.activationId,scope:ids.scope,review,evidenceIds:ids.evidenceIds,delivery:ids.delivery}));
      return;
    }
    case 'decision-recorded': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      const report = wf.reports.get(p.reportId);
      ok(report !== undefined, 'unresolved-reference', `${at}.reportId`, 'Decision requires a retained report');
      const a = wf.activations.get(p.activationId);
      ok(a !== undefined && a.role === 'supervisor' && a.actorId === issuer.actorId, 'unsettled-activation', at, 'Decision requires its producing supervisor activation');
      const native = nativeSettlement(a,c), review = p.review;
      ok(native !== null && review.activationId === p.activationId && same(review.settlement,{observationId:native.observationId,at:native.at}), 'inconsistent-reference', at, 'Decision settlement does not name genuine native completion');
      ok(review.reportId === p.reportId && review.reportHash === report.reportHash && review.checkpointHash === p.checkpointHash, 'inconsistent-reference', at, 'Decision report/checkpoint mismatch');
      ok(review.workflowId === wf.workflowId && review.workflowRevision === wf.workflowRevision, 'inconsistent-reference', at, 'Decision workflow revision mismatch');
      const kernel = kernelOf(replay,wf,at), decision = kernel.decisions[p.reportId];
      ok(decision !== undefined && decision.candidate.source === 'supervisor-control' && decision.candidate.operationId === p.operationId && same(decision.candidate.review,review) && same(decision.candidate.reviewer,issuer) && decision.candidate.input.action === p.action && decision.candidate.continuationOperationId === p.continuationOperationId, 'inconsistent-reference', at, 'Actor decision lacks its exact committed kernel candidate');
      qualifyDecisionInspection(replay,wf,kernel,decision.candidate,at);
      // Observation of the kernel result, not a second approval gate. A commit
      // held at its actor prefix stays held; this mirror cannot reauthorize it.
      ok(!wf.decisions.has(p.operationId), 'conflicting-duplicate', `${at}.operationId`, 'Decision operation ID reused');
      const action = p.action;
      if (action === 'answer') ok(report.reportKind === 'question', 'inconsistent-reference', at, 'Answer decision requires a question report');
      if (action === 'approve') ok(report.reportKind === 'checkpoint' || report.reportKind === 'final_review', 'inconsistent-reference', at, 'Approval requires a checkpoint/final-review report');
      if (heldCommitment(wf,p.operationId)) replay.outcome = 'hold';
      wf.decisions.set(p.operationId, { operationId: p.operationId, action, reportId: p.reportId, checkpointHash: p.checkpointHash, continuationOperationId: p.continuationOperationId, activationId: p.activationId });
      syncKernelStatus(wf,kernel);
      return;
    }
    case 'supervisor-usage-recorded': {
      const wf = workflowOf(replay, workflowIdOf(ev,at));
      const a = wf.activations.get(p.activationId);
      ok(a !== undefined && a.role === 'supervisor' && same(issuer,a.producer.actor), 'inconsistent-reference', at, 'Supervisor usage activation mismatch');
      ok(p.observedAt >= a.producer.intent.at && p.observedAt <= ev.at && workArray(a.deliveries,c).some(d => d.stage === 'started' && d.at <= p.observedAt),'inconsistent-reference',at,'Usage lacks original producing run/time');
      /** @type {UsageEntryView} */
      const entry = {usageId:p.usageId,observationId:p.observationId,observedAt:p.observedAt,producerId:issuer.actorId,producer:issuer,operationId:a.operationId,activationId:p.activationId,workflowId:wf.workflowId,taskId:null,stepId:null,source:'supervisor',metric:p.metric,value:p.value,known:p.value !== null};
      const key = usageKey(entry,c), old = workArray(wf.usage,c).find(e => usageKey(e,c) === key);
      if (old !== undefined) { ok(old.value === entry.value && old.observedAt === entry.observedAt,'conflicting-duplicate',at,'Original observation changed metric/time'); replay.outcome = 'noop'; return; }
      wf.usage.push(Object.freeze(entry));
      // Completeness is derived against the enlarged set. Never erase the old
      // proof, its resolutions, or the raw unknown observation.
      return;
    }
    case 'hold-recorded': {
      ok(issuer.role === 'main' && p.at <= ev.at,'inconsistent-reference',at,'Hold requires current Main and nonfuture observation');
      checkHoldScope(replay,p.scope,at);
      ok(!workArray(replay.holds,c).some(h => h.causeId === p.holdId),'conflicting-duplicate',at,'Hold cause reused');
      const cause = /** @type {HoldRecord} */ ({causeId:p.holdId,reason:p.reason,scope:p.scope,at:p.at,resolvedBy:null});
      replay.holds.push(cause);
      if (p.scope.kind === 'workflow') workflowOf(replay,p.scope.id).holds.push(cause);
      return;
    }
    case 'hold-resolved': {
      const cause = workArray(replay.holds,c).find(x => x.causeId === p.holdId && x.resolvedBy === null), r = p.resolution;
      ok(cause !== undefined,'unresolved-reference',at,'Unknown unresolved hold');
      if (r.kind === 'mailbox') {
        const entry = replay.mailboxMessages.get(r.messageId), records = replay.mailboxResolutions.get(r.messageId) ?? [], head = records[records.length - 1];
        ok(entry !== undefined && ev.workflowId === entry.workflowId && cause.reason === 'uncertain-delivery' && cause.scope.kind === 'mailbox' && cause.scope.id === r.messageId && head !== undefined && head.payload.reconciliationId === r.reconciliationId && head.payload.observationId === p.observationId && head.payload.priorResolutionId !== null && head.payload.at >= cause.at && head.at <= ev.at && head.payload.resolution.kind !== 'incomplete-hold' && mailboxResolutionSatisfied(replay,entry,head,c) && entry.released,'inconsistent-reference',at,'Mailbox hold requires the new currently satisfied chain-head correction');
      } else if (r.kind === 'lifecycle') {
        const lifecycle = lifecycleOf(replay,r.actorId);
        ok(cause.scope.kind === 'actor' && cause.scope.id === r.actorId && lifecycle.revision === r.revision && lifecycle.changedBy === p.observationId && (cause.reason === 'disabled' && lifecycle.enabled || cause.reason === 'paused' && !lifecycle.paused || cause.reason === 'stopped' && !lifecycle.stopped),'inconsistent-reference',at,'Lifecycle resolution does not clear this reason/scope');
      } else {
        const wf = workflowOf(replay,r.workflowId), kernel = kernelOf(replay,wf,at);
        ok(scopeApplies(replay,wf,cause.scope),'inconsistent-reference',at,'Resolution changes hold scope');
        if (r.kind === 'budget') ok(cause.reason === 'budget' && cause.scope.kind === 'workflow' && wf.budget.budgetRevision === r.budgetRevision && workArray(wf.amendments,c).some(a => a.operationId === p.observationId && a.after.budgetRevision === r.budgetRevision) && budgetDenial(replay,wf,replay.time) !== 'budget','inconsistent-reference',at,'Budget hold requires its effective amendment, not a reset');
        else if (r.kind === 'containment') {
          const a = activationOf(wf,r.activationId,at);
          ok((cause.reason === 'uncertain-delivery' || cause.reason === 'uncertain-effect' || cause.reason === 'interrupted') && (cause.scope.kind === 'activation' && cause.scope.id === a.activationId || cause.scope.kind === 'operation' && (cause.scope.id === a.operationId || cause.scope.id === a.producer.grantProof.grantOperationId)) && a.containment?.observationId === p.observationId && !reserved(activationReservation(wf,a,kernel,c)),'inconsistent-reference',at,'Containment does not resolve this producer reservation');
        } else if (r.kind === 'accounting') {
          const a = activationOf(wf,r.activationId,at);
          ok(cause.reason === 'unknown-accounting' && cause.scope.kind === 'activation' && cause.scope.id === a.activationId && a.accounting?.observationId === p.observationId && !workArray(workflowUsage(replay,wf).gaps,c).some(g => g.activationId === a.activationId),'inconsistent-reference',at,'Accounting resolution lacks exact producer coverage');
        } else {
          const held = workArray(kernel.holdCauses,c).find(h => h.causeId === r.causeId && h.reason === cause.reason && h.resolvedBy === p.observationId);
          ok(held !== undefined && (cause.scope.kind === 'workflow' && held.scope.kind === 'task' && kernel.tasks[held.scope.id] !== undefined || cause.scope.kind === 'operation' && held.scope.kind === 'operation' && held.scope.id === cause.scope.id),'inconsistent-reference',at,'Kernel resolution does not match reason and exact scope');
        }
      }
      cause.resolvedBy = p.observationId;
      return;
    }
    case 'owner-transitioned': {
      const next = p.next;
      ok(next.ownerEpoch >= replay.owner.ownerEpoch && next.branchRevision !== replay.owner.branchRevision, 'inconsistent-reference', at, 'Invalid branch/owner transition');
      if (replay.owner.ownerEpoch !== next.ownerEpoch) {
        for (const wf of workMap(replay.workflows,c)) if (!wf.closed) wf.holds.push({ causeId: `${at}:stale-owner`, reason: 'stale-owner', scope: { kind: 'workflow', id: wf.workflowId }, at: ev.at, resolvedBy: null });
      }
      if (next.ownerSession !== replay.owner.ownerSession || next.ownerEpoch !== replay.owner.ownerEpoch) replay.mainBinding = null;
      replay.owner = next;
      return;
    }
    case 'workflow-closed': {
      const workflowId = p.workflowId;
      const wf = workflowOf(replay, workflowId);
      ok(wf.status === 'completed' || wf.status === 'cancelled' || wf.status === 'escalated', 'admission-hold', at, 'Workflow closure requires a terminal decision or escalation');
      ok(ev.workflowId === workflowId && p.outcome === wf.status, 'inconsistent-reference', at, 'Closure cannot rewrite kernel-derived terminal outcome');
      ok(issuer.role === 'main','inconsistent-reference',at,'Workflow disposal requires current Main');
      const old = workArray(wf.closureObservations,c).find(o => o.observationId === p.observationId);
      if (old !== undefined) { ok(same(old,p),'conflicting-duplicate',at,'Closure original identity changed'); replay.outcome = 'noop'; return; }
      ok(!workMap(replay.workflows,c).some(other => other !== wf && workArray(other.closureObservations,c).some(o => o.observationId === p.observationId)),'conflicting-duplicate',at,'Closure original identity reused for another workflow');
      const kernel = kernelOf(replay,wf,at);
      ok(workMap(wf.activations,c).every(a => !reserved(activationReservation(wf,a,kernel,c))) && !kernelReservationPending(kernel,c),'unsettled-activation',at,'Terminal workflow still owns activation/effect/output/notice obligations');
      const debts = unresolvedLogicalDebts(wf,kernel,c), ids = workSet(new Set(workArray(debts,c).map(d => d.ref)),c);
      if (p.disposition !== undefined) {
        authorizeHuman(replay,p.disposition.authorization,issuer,at);
        ok(p.disposition.authorization.authorizedAt <= ev.at && exactIds(p.disposition.obligationIds,ids,c),'inconsistent-reference',at,'Disposition must name the exact unresolved logical set');
        wf.dispositions.push(deepFreeze({...p.disposition,observationId:p.observationId,at:ev.at,obligations:debts}));
      }
      wf.closureObservations.push(p);
      // Replay the formerly unsafe closure as retained held evidence, not a
      // forged human disposition or an erroneous slot release.
      if (ids.length > 0 && p.disposition === undefined) { replay.outcome = 'hold'; return; }
      wf.closed = true; wf.disposed = true;
      return;
    }
  }
  return fail('unsupported-version', at, 'Unknown actor event kind', 'unsupported');
}

/** @param {Replay} replay @param {MailboxEnqueuedPayload} p @param {ActorDomainEvent} ev @param {string} at */
function applyMailboxEnqueue(replay, p, ev, at) {
  const c = replay.c, same = comparisonInContext(c), envelope = p.envelope;
  ok(envelope !== undefined,'unsupported-mailbox',at,'Mailbox admission requires supplied complete envelope content','unsupported');
  ok(p.issuer.role === 'main' && same(p.issuer,replay.mainBinding),'inconsistent-reference',at,'Only current Main records mailbox ingress');
  ok(!workArray(replay.genesis.actorDefinitions,c).some(d => d.id === p.issuer.actorId),'inconsistent-reference',at,'Main mailbox identity must be distinct from participants');
  const content = envelope.content, key = content.key, binding = content.control.content.binding;
  ok(same(binding.owner,replay.owner) && key.epoch.storeId === replay.genesis.storeId && ev.workflowId === binding.workflowId,'inconsistent-reference',at,'Mailbox owner/store/workflow mismatch');
  checkIssuer(replay,binding.actor,at);
  const targetId = key.consumer.kind === 'main' ? replay.mainBinding?.actorId : key.consumer.actor.actorId;
  const targetRole = key.consumer.kind === 'main' ? 'main' : key.consumer.actor.role;
  ok(targetId === p.targetId && targetRole === p.targetRole && p.messageId === key.messageId && p.operationId === key.operationId && p.idempotencyKey === key.idempotencyKey && p.epochSegment === key.epoch.segmentId && p.lane === content.lane && p.priority === content.priority && p.payloadHash === envelope.digest,'inconsistent-reference',at,'Mailbox metadata differs from its complete envelope');
  ok(p.bytes === Buffer.byteLength(encodePairJSON(envelope,c),'utf8'),'inconsistent-reference',at,'Mailbox byte count differs from actual content');
  ok(workRecord(content.delivery,c).every(x => x === null),'inconsistent-reference',at,'Initial ingress cannot preload delivery or disposition facts');
  let mb = replay.mailboxes.get(p.targetId);
  const dedup = encodePairJSON([key.domain,key.epoch,key.producer,key.consumer,key.idempotencyKey],c);
  const existing = mb?.keys.get(dedup);
  if (existing !== undefined) {
    ok(same(existing.envelope,envelope),'conflicting-duplicate',at,'Mailbox retry changed original identity or content');
    replay.outcome = 'noop'; return;
  }
  const current = replay.bindings.get(binding.actor.actorId);
  ok(current === undefined || same(current,binding.actor),'inconsistent-reference',at,'Mailbox participant is not the retained generation/session');
  if (binding.workflowId !== null) {
    const wf = workflowOf(replay,binding.workflowId);
    ok(binding.workflowRevision === wf.workflowRevision && (binding.actor.actorId === wf.supervisorId || binding.actor.actorId === wf.implementerId),'inconsistent-reference',at,'Mailbox workflow participant/revision mismatch');
  }
  ok(!replay.mailboxMessages.has(p.messageId),'conflicting-duplicate',at,'Mailbox message identity already retained');
  ok(key.epoch.segmentId === replay.segmentId && key.epoch.archive === null,'epoch-rejected',at,'Unseen mailbox content must belong to the current unarchived segment');
  const deadline = content.control.content.input.deadline;
  ok(content.createdAt <= ev.at && ev.at <= deadline.admissionAt,'inconsistent-reference',at,'Mailbox ingress falls outside original creation/admission');
  ok(replay.time < deadline.expiresAt,'admission-hold',at,'Mailbox input has expired');
  const config = replay.genesis.configSnapshot;
  const maxEnvelope = config.mode === 'actor-pair' ? config.mailbox.maxEnvelopeBytes : COMMON_BOUNDS.maxEnvelopeBytes;
  ok(p.bytes <= maxEnvelope,'mailbox-capacity',at,'Envelope exceeds configured byte limit');
  if (mb === undefined) { mb = {actorId:p.targetId,targetRole:p.targetRole,ordinary:[],control:[],keys:new Map(),dispositions:new Map(),priorityStreak:0,maxQueuedPerActor:mailboxCapacity(replay)}; replay.mailboxes.set(p.targetId,mb); }
  ok(mb.targetRole === p.targetRole,'inconsistent-reference',at,'Mailbox target role changed');
  const occupancy = mailboxOccupancy(p.lane === 'ordinary' ? mb.ordinary : mb.control,c);
  const countLimit = p.lane === 'ordinary' ? mb.maxQueuedPerActor : COMMON_BOUNDS.maxControlEnvelopes;
  const byteLimit = p.lane === 'ordinary' ? COMMON_BOUNDS.maxMailboxBytes : COMMON_BOUNDS.maxControlBytes;
  ok(occupancy.count < countLimit && occupancy.bytes + p.bytes <= byteLimit,'mailbox-capacity',at,'Mailbox live count/byte capacity reached');
  /** @type {MailboxEntryRecord} */
  const entry = {messageId:p.messageId,targetId:p.targetId,targetRole:p.targetRole,lane:p.lane,priority:p.priority,operationId:p.operationId,idempotencyKey:p.idempotencyKey,epochSegment:p.epochSegment,bytes:p.bytes,payloadHash:p.payloadHash,envelope,workflowId:ev.workflowId,enqueuedAt:ev.at,disposition:null,released:false,consumer:key.consumer.kind === 'main' ? p.issuer : key.consumer.actor};
  (p.lane === 'ordinary' ? mb.ordinary : mb.control).push(entry);
  mb.keys.set(dedup,entry); replay.mailboxMessages.set(p.messageId,entry);
}

/** @param {Replay} replay @param {MailboxDispositionPayload} p @param {ActorDomainEvent} ev @param {string} at */
function applyMailboxDisposition(replay, p, ev, at) {
  const c = replay.c;
  ok(p.issuer.role === 'main' && sameWork(p.issuer,replay.mainBinding,c),'inconsistent-reference',at,'Only current Main records mailbox dispositions');
  const entry = replay.mailboxMessages.get(p.messageId);
  ok(entry !== undefined,'unresolved-reference',at,'Disposition names an unknown mailbox message');
  ok(ev.workflowId === entry.workflowId && ev.at >= entry.enqueuedAt,'inconsistent-reference',at,'Disposition changed the retained workflow or predates ingress');
  const mb = replay.mailboxes.get(entry.targetId);
  ok(mb !== undefined,'inconsistent-reference',at,'Retained mailbox index is missing');
  const prior = mb.dispositions.get(p.messageId);
  if (prior !== undefined) {
    ok(prior.payload.outcome !== 'unknown' || p.outcome === 'unknown','unsupported-mailbox',at,'Unknown delivery needs an evidence-bound reconciliation protocol','unsupported');
    ok(prior.at === ev.at && sameWork(prior.owner,ev.owner,c) && sameWork(prior.payload,p,c),'conflicting-duplicate',at,'Mailbox disposition changed original observation, time or owner');
    replay.outcome = 'noop'; return;
  }
  ok(!replay.mailboxObservations.has(p.observationId) && !replay.mailboxObservationIds.has(p.observationId),'conflicting-duplicate',at,'Mailbox disposition observation reused');
  if (p.outcome === 'consumed' || p.outcome === 'unknown') {
    ok(nextMailboxMessage(mb,c) === p.messageId,'inconsistent-reference',at,'Service bypasses control priority or bounded mailbox fairness');
    if (entry.lane === 'ordinary') mb.priorityStreak = entry.priority === 'question-answer' ? Math.min(2,mb.priorityStreak + 1) : 0;
  }
  entry.disposition = p.outcome; entry.released = p.outcome !== 'unknown';
  mb.dispositions.set(p.messageId,freezeWork({payload:p,at:ev.at,owner:ev.owner},c)); replay.mailboxObservations.add(p.observationId);
}

/** Only identities actually introduced by observations occupy this namespace;
 * evidence/hold-resolution references do not introduce another observation.
 * Existing legacy mirrors may share their legacy IDs, but never a new mailbox ID.
 * @param {unknown} value @param {ValidationContext} c @returns {Id[]} */
function observationNames(value,c) {
  requireValidationContext(c);
  /** @type {Id[]} */ const result = [];
  /** @param {unknown} node @param {number} [depth] */
  function visit(node,depth = 0) {
    consumeValidationWork(c,1,'actor.observation-namespace');
    ok(depth <= c.maxDepth,'capacity','observationId','Observation namespace depth exceeded');
    if (node === null || typeof node !== 'object') return;
    for (const key of workKeys(node,c)) {
      const child = Reflect.get(node,key);
      if ((key === 'observationId' || key === 'reconciliationId') && typeof child === 'string') result.push(id(child,'observationId'));
      else visit(child,depth + 1);
    }
  }
  visit(value);
  return [...workArray(result,c)];
}
/** @param {ActorWorkflowEventV2} ev */
function introducesMailboxObservation(ev) { return ev.domain === 'actor' && (ev.payload.kind === 'mailbox-delivery-observed' || ev.payload.kind === 'mailbox-reconciled'); }
/** @param {Replay} replay @param {ActorWorkflowEventV2} ev @param {string} at @param {ValidationContext} c */
function checkMailboxObservationNamespace(replay,ev,at,c) {
  requireValidationContext(c);
  ok(!replay.mailboxObservationIds.has(ev.eventId),'conflicting-duplicate',at,'Event ID reuses a mailbox observation identity');
  if (introducesMailboxObservation(ev) || ev.domain === 'actor' && ev.payload.kind === 'hold-resolved') return;
  for (const name of observationNames(ev.payload,c)) ok(!replay.mailboxObservationIds.has(name),'conflicting-duplicate',at,'Mailbox observation identity reused by another event');
}
/** @param {Replay} replay @param {ActorWorkflowEventV2} ev @param {ValidationContext} c */
function retainActorObservationIds(replay,ev,c) {
  requireValidationContext(c);
  if (introducesMailboxObservation(ev)) return;
  for (const name of observationNames(ev.payload,c)) replay.actorObservationIds.add(name);
}
/** @param {Replay} replay @param {Id} name @param {string} at @param {ValidationContext} c */
function freshMailboxObservation(replay,name,at,c) {
  requireValidationContext(c);
  ok(!replay.mailboxObservationIds.has(name) && !replay.actorObservationIds.has(name) && !replay.mailboxObservations.has(name) && !replay.eventIds.has(name) && !replay.archivedEventIds.has(name),'conflicting-duplicate',at,'Observation/reconciliation identity is lifetime unique');
}
/** @param {Replay} replay @param {MailboxAttemptPayload|MailboxDeliveryPayload|MailboxReconciledPayload} p @param {ActorDomainEvent} ev @param {string} at @param {ValidationContext} c */
function mailboxSubject(replay,p,ev,at,c) {
  requireValidationContext(c);
  const entry = replay.mailboxMessages.get(p.messageId);
  ok(entry !== undefined && entry.workflowId === ev.workflowId,'inconsistent-reference',at,'Mailbox fact changed its retained message/workflow');
  ok(p.issuer.role === 'main' && sameWork(p.issuer,replay.mainBinding,c) || p.kind === 'mailbox-delivery-observed' && sameWork(p.issuer,entry.consumer,c),'inconsistent-reference',at,'Mailbox facts require current Main or the retained delivery consumer');
  ok(p.at >= entry.enqueuedAt && p.at <= ev.at,'inconsistent-reference',at,'Mailbox fact predates enqueue or is future');
  return entry;
}
/** @param {Replay} replay @param {MailboxAttemptPayload} p @param {ActorDomainEvent} ev @param {string} at @param {ValidationContext} c */
function applyMailboxAttempt(replay,p,ev,at,c) {
  const entry = mailboxSubject(replay,p,ev,at,c), control = entry.envelope.content.control, b = control.content.binding;
  const previous = replay.mailboxAttempts.get(p.messageId)?.get(p.operationId);
  if (previous !== undefined) {
    ok(previous.at === ev.at && sameWork(previous.owner,ev.owner,c) && sameWork(previous.payload,p,c),'conflicting-duplicate',at,'Attempt binding changed original content/time/owner');
    replay.outcome = 'noop'; return;
  }
  ok(p.operationId === entry.operationId && p.operationId === b.operationId && p.messageHash === entry.payloadHash && p.controlHash === control.digest && p.commandId === control.content.input.requestId && p.inputHash === b.inputHash && p.activationId === b.activationId,'inconsistent-reference',at,'Attempt must bind the exact retained envelope/control/input/activation');
  if (p.activationId !== null) {
    const wf = entry.workflowId === null ? undefined : replay.workflows.get(entry.workflowId), a = wf?.activations.get(p.activationId);
    ok(a !== undefined && sameWork(a.producer.actor,b.actor,c) && sameWork(a.producer.identity,b.identity,c) && sameWork(a.producer.grantProof,b.grantProof,c),'inconsistent-reference',at,'Attempt lacks its retained activation and producer');
    if (entry.targetRole !== 'main') ok(a.operationId === p.operationId && a.control.digest === p.controlHash,'inconsistent-reference',at,'Participant attempt is not the authorized activation command');
  }
  const attempts = replay.mailboxAttempts.get(p.messageId) ?? new Map();
  attempts.set(p.operationId,freezeWork({payload:p,consumer:entry.consumer,at:ev.at,owner:ev.owner,segmentId:replay.segmentId},c));
  replay.mailboxAttempts.set(p.messageId,attempts);
}
/** @param {Replay} replay @param {MailboxDeliveryPayload} p @param {ActorDomainEvent} ev @param {string} at @param {ValidationContext} c */
function applyMailboxDelivery(replay,p,ev,at,c) {
  const entry = mailboxSubject(replay,p,ev,at,c), attempt = replay.mailboxAttempts.get(p.messageId)?.get(p.operationId), o = p.observation;
  ok(attempt !== undefined,'inconsistent-reference',at,'Delivery requires an already retained attempt binding');
  ok(o.commandId === attempt.payload.commandId && o.inputHash === attempt.payload.inputHash && sameWork(o.actor,attempt.consumer,c) && o.at >= entry.enqueuedAt && o.at <= p.at,'inconsistent-reference',at,'Delivery changed attempt, consumer or original observation time');
  ok(o.stage !== 'ingress' || entry.targetRole === 'main','inconsistent-reference',at,'Ingress is a Main-consumer fact');
  const operations = replay.mailboxStageFacts.get(p.messageId) ?? new Map(), facts = operations.get(p.operationId) ?? new Map(), previous = facts.get(o.observationId);
  if (previous !== undefined) {
    ok(previous.at === ev.at && sameWork(previous.owner,ev.owner,c) && sameWork(previous.payload,p,c),'conflicting-duplicate',at,'Delivery observation changed original fact/time/owner');
    replay.outcome = 'noop'; return;
  }
  freshMailboxObservation(replay,o.observationId,at,c);
  facts.set(o.observationId,freezeWork({payload:p,at:ev.at,owner:ev.owner,segmentId:replay.segmentId},c));
  operations.set(p.operationId,facts); replay.mailboxStageFacts.set(p.messageId,operations);
  replay.mailboxObservationIds.add(o.observationId);
  // Contradictions are retained, never treated as conflicting delivery facts.
  // The required explicit mailbox hold is checked at the complete-root boundary.
}
/** Resolve each reference in its domain before applying the minimum matrix.
 * No receipt store in this aggregate retains a mailbox ingress receipt. An
 * inspection/kernel receipt is not interchangeable with one; use a real ingress
 * stage witness instead. Kernel command reconciliation is supplemental evidence,
 * never a substitute for any row's minimum proof.
 * @param {Replay} replay @param {MailboxEntryRecord} entry @param {MailboxReconciledPayload} p @param {ValidationContext} c */
function mailboxEvidence(replay,entry,p,c) {
  requireValidationContext(c);
  const at = 'mailbox.resolution', refs = workArray(p.resolution.evidence,c);
  const anchors = workArray(refs,c).filter(r => r.kind === 'attempt-binding');
  ok(anchors.length === 1,'unsupported-mailbox',at,'Resolution requires exactly one attempt-binding witness','unsupported');
  const anchor = anchors[0];
  ok(anchor.kind === 'attempt-binding' && anchor.messageId === entry.messageId,'inconsistent-reference',at,'Evidence names another message');
  const attempt = replay.mailboxAttempts.get(entry.messageId)?.get(anchor.operationId);
  ok(attempt !== undefined && attempt.payload.at <= p.at,'inconsistent-reference',at,'Evidence lacks an earlier retained attempt');
  const wf = entry.workflowId === null ? undefined : replay.workflows.get(entry.workflowId);
  const a = attempt.payload.activationId === null ? undefined : wf?.activations.get(attempt.payload.activationId);
  const kernel = wf === undefined ? undefined : kernelOf(replay,wf,at);
  const facts = workMap(replay.mailboxStageFacts.get(entry.messageId)?.get(anchor.operationId) ?? new Map(),c);
  /** @type {StageFact[]} */ const deliveries = [];
  /** @type {ContainmentView|null} */ let containment = null;
  /** @type {CoordinationModel['barriers'][string]|null} */ let barrier = null;
  const seen = new Set();
  for (const ref of refs) {
    const key = encodePairJSON(ref,c);
    ok(!seen.has(key),'conflicting-duplicate',at,'Repeated evidence reference'); seen.add(key);
    if (ref.kind === 'attempt-binding') continue;
    if (ref.kind === 'delivery-observation') {
      ok(ref.messageId === entry.messageId && ref.operationId === anchor.operationId,'inconsistent-reference',at,'Delivery evidence changed message/attempt');
      const fact = replay.mailboxStageFacts.get(ref.messageId)?.get(ref.operationId)?.get(ref.observationId);
      ok(fact !== undefined && fact.payload.observation.at <= p.at,'inconsistent-reference',at,'Missing or future delivery evidence');
      deliveries.push(fact);
    } else if (ref.kind === 'containment') {
      ok(a !== undefined && a.operationId === anchor.operationId && a.control.digest === attempt.payload.controlHash && entry.targetRole !== 'main' && ref.activationId === a.activationId && containment === null,'inconsistent-reference',at,'Containment changed activation/attempt or was repeated');
      containment = workArray(a.containments,c).find(f => f.observationId === ref.observationId) ?? null;
      ok(containment !== null && containment.at <= p.at,'inconsistent-reference',at,'Missing or future containment observation');
    } else if (ref.kind === 'effect-barrier') {
      ok(a?.role === 'implementer' && a.operationId === anchor.operationId && a.control.digest === attempt.payload.controlHash && entry.targetRole !== 'main' && kernel !== undefined && barrier === null,'inconsistent-reference',at,'Effects require the exact implementer attempt/producer');
      barrier = kernel.barriers[ref.barrierId] ?? null;
      ok(barrier !== null && barrier.operationId === a.producer.grantProof.grantOperationId && sameWork(barrier.identity,a.producer.identity,c) && barrier.at <= p.at,'inconsistent-reference',at,'Barrier is not retained for this exact activation/grant');
    } else if (ref.kind === 'kernel-reconciliation') {
      const intent = kernel?.intents[ref.operationId], delivery = kernel?.promptDeliveries[anchor.operationId];
      ok(a?.role === 'implementer' && a.operationId === anchor.operationId && intent?.kind === 'reconciliation-proposed' && intent.finding.kind === 'command' && intent.finding.targetOperationId === anchor.operationId && delivery !== undefined && delivery.intent.grantOperationId === a.producer.grantProof.grantOperationId && sameWork(kernel?.grants[delivery.intent.grantOperationId]?.identity,a.producer.identity,c) && delivery.intent.commandId === attempt.payload.commandId && delivery.intent.input.hash === attempt.payload.inputHash && kernel?.commitments[ref.operationId] !== undefined && wf !== undefined && !heldCommitment(wf,ref.operationId) && intent.at <= p.at,'inconsistent-reference',at,'Kernel reconciliation lacks exact retained command/producer/commitment correlation');
    } else {
      const wrongDomain = replay.receipts.has(ref.receiptId) || workMap(replay.workflows,c).some(w => w.artifacts.has(ref.receiptId) || kernelOf(replay,w,at).receipts[ref.receiptId] !== undefined);
      ok(!wrongDomain,'inconsistent-reference',at,'An inspection/kernel receipt is not mailbox ingress');
      fail('unsupported-mailbox',at,'No retained mailbox ingress-receipt domain; a bound ingress observation is required','unsupported');
    }
  }
  return {attempt,a,kernel,facts,deliveries,containment,barrier};
}
/** @param {readonly DeliveryStage[]} stages */
function contradictoryStages(stages) {
  return stages.includes('rejected') && stages.some(s => s === 'accepted' || s === 'started' || s === 'run-settled' || s === 'ingress');
}
/** @param {Replay} replay @param {MailboxEntryRecord} entry @param {ResolutionRecord} record @param {ValidationContext} c @returns {boolean} */
function mailboxResolutionSatisfied(replay,entry,record,c) {
  const p = record.payload, proof = mailboxEvidence(replay,entry,p,c), {a,kernel,containment,barrier} = proof;
  const stages = workArray(proof.facts,c).map(f => f.payload.observation.stage);
  // Native facts for the exact outbound command count even before a mailbox
  // mirror. An output message's producer run is NOT its delivery attempt.
  const native = a !== undefined && kernel !== undefined && a.operationId === proof.attempt.payload.operationId ? deliveryFacts(a,kernel,c) : [];
  const allStages = [...workArray(stages,c),...workArray(native,c).map(f => f.stage)];
  if (a !== undefined && kernel !== undefined && a.operationId === proof.attempt.payload.operationId && workArray(settlementFacts(a,kernel,c),c).some(s => s.phase === 'native-settled')) allStages.push('run-settled');
  /** @param {DeliveryStage} stage */
  const has = stage => workArray(proof.deliveries,c).some(f => f.payload.observation.stage === stage);
  const completeBarrier = barrier !== null && a !== undefined && kernel !== undefined && kernel.grants[a.producer.grantProof.grantOperationId]?.phase === 'closed' && kernel.grants[a.producer.grantProof.grantOperationId]?.latestBarrierId === barrier.barrierId && barrier.coverage === 'complete' && barrier.sessionContained && barrier.unknownEffectIds.length === 0 && workArray(barrier.admittedEffectIds,c).every(x => workArray(barrier.settledEffectIds,c).includes(x) || workArray(barrier.containedEffectIds,c).includes(x));
  const completeContainment = containment !== null && a !== undefined && kernel !== undefined && containmentComplete({...a,containment},kernel,c) && workArray(proof.facts,c).every(f => f.payload.observation.at <= containment.at && (f.payload.observation.stage === 'run-settled' ? workArray(settlementFacts(a,kernel,c),c).some(s => s.at === f.payload.observation.at) : workArray(deliveryFacts(a,kernel,c),c).some(d => d.stage === f.payload.observation.stage && d.at === f.payload.observation.at)));
  switch (p.resolution.kind) {
    case 'participant-consumed': return entry.targetRole !== 'main' && (has('accepted') || has('started')) && !contradictoryStages(allStages);
    case 'main-consumed': return entry.targetRole === 'main' && has('ingress') && !contradictoryStages(allStages);
    case 'rejected-before-execution': return has('rejected') && !workArray(allStages,c).some(s => s === 'accepted' || s === 'started' || s === 'run-settled' || s === 'ingress');
    case 'proven-not-sent': return entry.targetRole !== 'main' && allStages.length === 0 && (a === undefined || kernel === undefined || settlementFacts(a,kernel,c).length === 0) && (a?.role === 'implementer' ? completeBarrier && barrier !== null && barrier.admittedEffectIds.length === 0 : a?.role === 'supervisor' && containment?.outcome === 'not-sent' && completeContainment);
    case 'terminally-contained': return entry.targetRole !== 'main' && completeContainment && (a?.role !== 'implementer' || completeBarrier && containment?.barrierId === barrier?.barrierId);
    case 'incomplete-hold': return true;
  }
}
/** @param {Replay} replay @param {MailboxReconciledPayload} p @param {ActorDomainEvent} ev @param {string} at @param {ValidationContext} c */
function applyMailboxReconciliation(replay,p,ev,at,c) {
  const entry = mailboxSubject(replay,p,ev,at,c), original = replay.mailboxes.get(entry.targetId)?.dispositions.get(entry.messageId);
  ok(original?.payload.outcome === 'unknown' && original.payload.observationId === p.dispositionObservationId && p.at >= original.at,'inconsistent-reference',at,'Reconciliation must name the retained original unknown disposition');
  const records = replay.mailboxResolutions.get(p.messageId) ?? [], previous = workArray(records,c).find(r => r.payload.reconciliationId === p.reconciliationId);
  if (previous !== undefined) {
    ok(previous.at === ev.at && sameWork(previous.owner,ev.owner,c) && sameWork(previous.payload,p,c),'conflicting-duplicate',at,'Resolution changed original evidence/outcome/time/owner');
    replay.outcome = 'noop'; return;
  }
  freshMailboxObservation(replay,p.reconciliationId,at,c); freshMailboxObservation(replay,p.observationId,at,c);
  ok(p.reconciliationId !== p.observationId,'conflicting-duplicate',at,'Reconciliation and observation identities must differ');
  const head = records[records.length - 1];
  ok(p.priorResolutionId === (head?.payload.reconciliationId ?? null) && (head === undefined || p.at > head.payload.at),'conflicting-duplicate',at,'Correction must name the exact chain head and advance original time');
  const record = freezeWork({payload:p,at:ev.at,owner:ev.owner,segmentId:replay.segmentId},c);
  ok(mailboxResolutionSatisfied(replay,entry,record,c),'unsupported-mailbox',at,'Resolution does not satisfy its retained evidence matrix; record incomplete-hold instead','unsupported');
  replay.mailboxResolutions.set(p.messageId,freezeWork([...workArray(records,c),record],c));
  replay.mailboxObservationIds.add(p.reconciliationId); replay.mailboxObservationIds.add(p.observationId);
  if (p.resolution.kind === 'incomplete-hold') replay.outcome = 'hold';
}
/** Corrections replace the effective outcome, never the original disposition or
 * proof record. A latest incomplete/invalid correction always occupies its lane.
 * @param {Replay} replay @param {MailboxEntryRecord} entry @param {ValidationContext} c @returns {EffectiveMailboxDisposition} */
function effectiveMailboxDisposition(replay,entry,c) {
  requireValidationContext(c);
  if (entry.disposition !== 'unknown') return entry.disposition;
  const records = replay.mailboxResolutions.get(entry.messageId) ?? [], head = records[records.length - 1];
  if (head === undefined || !mailboxResolutionSatisfied(replay,entry,head,c)) return 'unknown';
  switch (head.payload.resolution.kind) {
    case 'participant-consumed': case 'main-consumed': return 'consumed';
    case 'rejected-before-execution': return 'rejected';
    case 'proven-not-sent': return 'not-sent';
    case 'terminally-contained': return 'terminally-contained';
    case 'incomplete-hold': return 'unknown';
  }
}
/** Recompute after EVERY fold (including native late facts) and before public
 * occupancy/archive checks. No supplied or copied released flag is authority.
 * @param {Replay} replay @param {ValidationContext} c */
function refreshMailboxRelease(replay,c) {
  requireValidationContext(c);
  for (const entry of workMap(replay.mailboxMessages,c)) {
    const effective = effectiveMailboxDisposition(replay,entry,c);
    entry.released = effective !== null && effective !== 'unknown';
  }
}
/** A contradiction must have an explicit message-scoped hold. Contradictory
 * retained facts (a rejection plus any progress fact in one attempt) hold on
 * their own, whether or not any resolution record exists; since facts are
 * never retracted, only a later evidence-bound satisfied correction (in
 * practice terminally-contained) can resolve such a hold. An already resolved
 * hold is valid only while its named, later correction still proves a
 * releasing outcome. No automatic resolution or implicit resend is possible.
 * @param {Replay} replay @param {ValidationContext} c */
function validateMailboxHolds(replay,c) {
  requireValidationContext(c);
  refreshMailboxRelease(replay,c);
  for (const entry of workMap(replay.mailboxMessages,c)) {
    const records = replay.mailboxResolutions.get(entry.messageId) ?? [];
    let contradicted = false;
    const attemptMap = replay.mailboxAttempts.get(entry.messageId) ?? new Map();
    const mirrorMap = replay.mailboxStageFacts.get(entry.messageId) ?? new Map();
    for (const operationId of [...attemptMap.keys(), ...[...mirrorMap.keys()].filter(k => !attemptMap.has(k))]) {
      const stages = workMap(mirrorMap.get(operationId) ?? new Map(),c).map(f => f.payload.observation.stage);
      const attempt = attemptMap.get(operationId);
      if (attempt !== undefined && attempt.payload.activationId !== null && entry.workflowId !== null) {
        const wf = replay.workflows.get(entry.workflowId), a = wf?.activations.get(attempt.payload.activationId);
        if (wf !== undefined && a !== undefined && a.operationId === operationId) {
          const kernel = kernelOf(replay,wf,'mailbox.holds');
          stages.push(...workArray(deliveryFacts(a,kernel,c),c).map(f => f.stage));
          if (workArray(settlementFacts(a,kernel,c),c).some(s => s.phase === 'native-settled')) stages.push('run-settled');
        }
      }
      if (contradictoryStages(stages)) { contradicted = true; break; }
    }
    if (contradicted) {
      const held = workArray(replay.holds,c).some(h => h.reason === 'uncertain-delivery' && h.scope.kind === 'mailbox' && h.scope.id === entry.messageId && (h.resolvedBy === null || workArray(records,c).some(r => r.payload.observationId === h.resolvedBy && r.payload.priorResolutionId !== null && r.payload.resolution.kind !== 'incomplete-hold' && mailboxResolutionSatisfied(replay,entry,r,c))));
      ok(held,'admission-hold','mailbox.holds','Contradictory delivery facts require hold-recorded reason uncertain-delivery scoped to the message');
    }
    for (const record of workArray(records,c)) {
      if (mailboxResolutionSatisfied(replay,entry,record,c)) continue;
      const covered = workArray(replay.holds,c).some(h => h.reason === 'uncertain-delivery' && h.scope.kind === 'mailbox' && h.scope.id === entry.messageId && (h.resolvedBy === null || entry.released && workArray(records,c).some(r => r.payload.observationId === h.resolvedBy && r.payload.at > record.payload.at && r.payload.priorResolutionId !== null && r.payload.resolution.kind !== 'incomplete-hold' && mailboxResolutionSatisfied(replay,entry,r,c))));
      ok(covered,'admission-hold','mailbox.holds','Contradicted mailbox resolution requires hold-recorded reason uncertain-delivery scoped to its message');
    }
  }
}

/** @param {Replay} replay @returns {number} */
function mailboxCapacity(replay) {
  const cfg = replay.genesis.configSnapshot;
  if (cfg.mode === 'actor-pair') return Math.min(cfg.mailbox.maxQueuedPerActor, COMMON_BOUNDS.maxQueuedPerActor);
  return COMMON_BOUNDS.defaultQueuedPerActor;
}

/** Live occupancy only. Terminal entries remain in history and dedup indexes;
 * unknown dispositions are not released. Admission and views share this scan.
 * @param {readonly MailboxEntryRecord[]} entries @param {ValidationContext} c
 * @returns {{count:number,bytes:number}} */
function mailboxOccupancy(entries,c) {
  let count = 0, bytes = 0;
  for (const entry of workArray(entries,c)) {
    if (entry.released) continue;
    count++; bytes += entry.bytes;
  }
  return {count,bytes};
}

/** Replay-derived service history bounds priority bursts; selection alone never
 * advances the cursor. Host must additionally establish runtime eligibility.
 * @param {MailboxRuntime} mb @param {ValidationContext} c @returns {Id|null} */
function nextFair(mb,c) {
  const ready = workArray(mb.ordinary,c).filter(e => e.disposition === null);
  const normal = workArray(ready,c).find(e => e.priority === 'normal');
  const priority = workArray(ready,c).find(e => e.priority === 'question-answer');
  return ((mb.priorityStreak >= 2 ? normal ?? priority : priority ?? normal)?.messageId) ?? null;
}
/** @param {MailboxRuntime} mb @param {ValidationContext} c @returns {Id|null} */
function nextMailboxMessage(mb,c) {
  return workArray(mb.control,c).find(e => e.disposition === null)?.messageId ?? nextFair(mb,c);
}

// ---------------------------------------------------------------------------
// Archive binding and replay
// ---------------------------------------------------------------------------

/** @param {ParsedRoot} root @param {ArchiveValidationContext} ctx @param {ValidationContext} c @returns {Replay|null} */
function bindArchive(root, ctx, c) {
  const same = comparisonInContext(c);
  ok(ctx.storeId === root.genesis.storeId, 'inconsistent-reference', 'archiveContext.storeId', 'Archive context store mismatch');
  /** @type {Map<string,string>} */ const resolved = new Map();
  if (ctx.kind === 'empty') {
    ok(root.genesis.checkpoint === null && root.archiveHead === null && root.genesis.heldLegacyRefs.length === 0, 'inconsistent-reference', 'archiveHead', 'Empty archive context requires an empty initial segment');
    ok(ctx.head === null && ctx.segments.length === 0 && ctx.artifacts.length === 0, 'inconsistent-reference', 'archiveContext', 'Empty archive context must be explicitly empty');
    return null;
  }
  // Archive byte hashes are NOT inspection-content hashes. This map supports
  // legacy visibility only and is never passed to any segment's source fold.
  // Checked inline evidence remains in carried replay; this external byte map
  // cannot authenticate fresh inspection content or cross-segment authority.
  for (const artifact of workArray(ctx.artifacts,c)) {
    const key = artifactKey(artifact.reference,c), prior = resolved.get(key);
    ok(prior === undefined || prior === artifact.original, 'conflicting-duplicate', 'archiveContext.artifacts', 'Conflicting original bytes for full archive identity');
    resolved.set(key,artifact.original);
  }
  const last = ctx.segments[ctx.segments.length - 1];
  const lastCheckpoint = last.checkpoint;
  ok(same(root.archiveHead, ctx.head), 'inconsistent-reference', 'archiveHead', 'Root archive head does not name the context head');
  ok(root.genesis.checkpoint !== null && same(root.genesis.checkpoint, lastCheckpoint), 'inconsistent-reference', 'genesis.checkpoint', 'Root genesis checkpoint does not bind the last archived segment');
  ok(root.segmentId === lastCheckpoint.nextSegmentId, 'inconsistent-reference', 'segmentId', 'Current segment ID is not the predecessor checkpoint next segment');
  ok(same(root.genesis.initialOwner, lastCheckpoint.owner), 'inconsistent-reference', 'genesis.initialOwner', 'Branch owner does not continue the archived checkpoint');
  for (const segment of workArray(ctx.segments,c)) ok(segment.reference.segmentId !== root.segmentId, 'epoch-rejected', 'segmentId', 'Current segment ID reuses an archived epoch');
  /** @type {{events:number, operations:Set<Id>, activations:Set<Id>, reports:Set<Id>, inputTokens:number, outputTokens:number, costUsd:number, costsKnown:boolean}} */
  const running = { events: 0, operations: new Set(), activations: new Set(), reports: new Set(), inputTokens: 0, outputTokens: 0, costUsd: 0, costsKnown: true };
  /** @type {Replay|null} */ let priorReplay = null;
  consumeValidationWork(c,ctx.segments.length,'actor.archive-segments');
  for (let i = 0; i < ctx.segments.length; i++) {
    const segment = ctx.segments[i];
    const decoded = parseRoot(segment.decoded, `archiveContext.segments.${i}.decoded`, c);
    ok(decoded.segmentId === segment.reference.segmentId, 'inconsistent-reference', `archiveContext.segments.${i}`, 'Archived decoded segment identity mismatch');
    const replay = runFold(decoded, c, priorReplay);
    priorReplay = replay;
    running.events += decoded.events.length;
    for (const o of workArray(workSet(replay.operations,c),c)) running.operations.add(o);
    for (const o of workArray(workSet(replay.activations,c),c)) running.activations.add(o);
    for (const o of workArray(workSet(replay.reports,c),c)) running.reports.add(o);
    const usage = deriveUsage(replay);
    running.inputTokens = usage.inputTokens; running.outputTokens = usage.outputTokens; running.costUsd = usage.costUsd;
    running.costsKnown = usage.complete;
    const checkpoint = segment.checkpoint;
    ok(checkpoint.counters.events === running.events, 'inconsistent-reference', `archiveContext.segments.${i}.checkpoint.counters.events`, 'Archived event counter mismatch');
    ok(checkpoint.counters.operations === running.operations.size, 'inconsistent-reference', `archiveContext.segments.${i}.checkpoint.counters.operations`, 'Archived operation counter mismatch');
    ok(checkpoint.counters.activations === running.activations.size, 'inconsistent-reference', `archiveContext.segments.${i}.checkpoint.counters.activations`, 'Archived activation counter mismatch');
    ok(checkpoint.counters.reports === running.reports.size, 'inconsistent-reference', `archiveContext.segments.${i}.checkpoint.counters.reports`, 'Archived report counter mismatch');
    /** @type {(declared:number, total:number)=>boolean} */
    const spendBound = (declared, total) => running.costsKnown ? declared === total : total <= declared;
    ok(spendBound(checkpoint.counters.inputTokens, running.inputTokens), 'inconsistent-reference', `archiveContext.segments.${i}.checkpoint.counters.inputTokens`, 'Archived input token counter mismatch');
    ok(spendBound(checkpoint.counters.outputTokens, running.outputTokens), 'inconsistent-reference', `archiveContext.segments.${i}.checkpoint.counters.outputTokens`, 'Archived output token counter mismatch');
    ok(spendBound(checkpoint.counters.costUsd, running.costUsd), 'inconsistent-reference', `archiveContext.segments.${i}.checkpoint.counters.costUsd`, 'Archived cost counter mismatch');
    const at = `archiveContext.segments.${i}.checkpoint`;
    validateMailboxHolds(replay,c);
    ok(!workArray(replay.holds,c).some(h => h.scope.kind === 'mailbox' && replay.mailboxMessages.has(h.scope.id) && h.resolvedBy === null),'unsupported-archive',at,'Unresolved mailbox holds block rotation','unsupported');
    ok(same(checkpoint.owner,replay.owner),'inconsistent-reference',at,'Checkpoint owner differs from actual replay');
    const actors = workMap(replay.bindings,c);
    if (replay.mainBinding !== null) actors.push(replay.mainBinding);
    ok(checkpoint.actors.length === actors.length && workArray(actors,c).every(actor => workArray(checkpoint.actors,c).some(declared => same(actor,declared))),'inconsistent-reference',at,'Checkpoint actor bindings differ from actual retained bindings');
    ok(unresolvedCount(replay) === 0 && workMap(replay.mailboxes,c).every(mb => mailboxOccupancy(mb.ordinary,c).count === 0 && mailboxOccupancy(mb.control,c).count === 0) && usage.complete,'unsupported-archive',at,'Rotation requires quiescent workflows, mailboxes, effects and known accounting','unsupported');
    ok(checkpoint.obligations.length === 0 && checkpoint.dispositions.length === 0,'unsupported-archive',at,'External checkpoint obligation/disposition claims need a qualified carryover protocol','unsupported');
  }
  for (const ref of workArray(root.genesis.heldLegacyRefs,c)) ok(resolved.has(artifactKey(ref,c)) || workArray(lastCheckpoint.artifacts,c).some(a => a.ref === ref.ref && a.hash === ref.hash), 'unresolved-reference', 'genesis.heldLegacyRefs', 'Held legacy ref is not retained by exact archive identity');
  return priorReplay;
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

/** Key is producer/session/generation/activation/operation + original observation
 * and metric scope. usageId is retained provenance, never dedup authority.
 * @param {UsageEntryView} e @param {ValidationContext} c */
function usageKey(e,c) {
  const p = e.producer;
  const tuple = [e.source,p.actorId,p.role,p.ownerSession,p.ownerEpoch,p.generation,p.sessionId,p.model,e.workflowId,e.activationId,e.operationId,e.observationId,e.metric];
  chargeActorWork(tuple,c); return JSON.stringify(tuple);
}
/** @param {WorkflowRuntime} wf @param {ActivationRecord} a @param {ValidationContext} c */
function supervisorEntries(wf,a,c) {
  return workArray(wf.usage,c).filter(e => e.source === 'supervisor' && e.activationId === a.activationId && e.workflowId === wf.workflowId && e.operationId === a.operationId && sameWork(e.producer,a.producer.actor,c));
}
/** Raw known observations are summed exactly once. Resolving a null supplies
 * coverage only: it never creates another charge or overwrites the raw record.
 * @param {ActivationRecord} a @param {UsageEntryView} entry @param {readonly UsageEntryView[]} entries @param {number} time @param {ValidationContext} c */
function supervisorEntryKnown(a,entry,entries,time,c) {
  if (entry.observedAt > time) return false;
  if (entry.value !== null) return true;
  return workArray(a.resolutions,c).some(r => r.at <= time && r.metric === entry.metric && r.unknownObservationId === entry.observationId && workArray(entries,c).some(e => e.metric === r.metric && e.observationId === r.evidenceObservationId && e.value !== null && e.observedAt <= time));
}
/** Fresh completeness covers usage AND the exact retirement/delivery prefix.
 * Old proof and replacement provenance survive invalidation by any new facts.
 * @param {WorkflowRuntime} wf @param {ActivationRecord} a @param {CoordinationModel} kernel @param {ValidationContext} c @param {SupervisorAccountingView|null} [proof] */
function supervisorAccountingComplete(wf,a,kernel,c,proof = a.accounting) {
  if (proof === null) return false;
  const entries = supervisorEntries(wf,a,c), deliveries = deliveryFacts(a,kernel,c), settlements = settlementFacts(a,kernel,c);
  // An original observation may carry several metrics. A later new metric
  // under an already-covered ID still enlarges the witnessed prefix.
  if (proof.metricCoverage.length !== entries.length || !workArray(entries,c).every(e => workArray(proof.metricCoverage,c).some(m => m.observationId === e.observationId && m.metric === e.metric))) return false;
  if (!exactIds(proof.coveredObservationIds,workArray(entries,c).map(e => e.observationId),c) || !exactIds(proof.deliveryObservationIds,workArray(deliveries,c).map(d => d.observationId),c) || !exactIds(proof.settlementObservationIds,workArray(settlements,c).map(s => s.observationId),c) || proof.containmentObservationId !== (a.containment?.observationId ?? null)) return false;
  if (!workArray(deliveries,c).every(d => d.at <= proof.at) || !workArray(settlements,c).every(s => s.at <= proof.at)) return false;
  const native = workArray(settlements,c).find(s => s.phase === 'native-settled');
  const completed = native !== undefined && native.at <= proof.at && workArray(['sent','accepted','started'],c).every(stage => workArray(deliveries,c).some(d => d.stage === stage && d.at <= native.at)) && !workArray(deliveries,c).some(d => d.stage === 'rejected');
  const contained = a.containment !== null && a.containment.at <= proof.at && containmentComplete(a,kernel,c);
  return (completed || contained) && workArray(METRIC_KINDS,c).every(metric => workArray(entries,c).some(e => e.metric === metric)) && workArray(entries,c).every(e => supervisorEntryKnown(a,e,entries,proof.at,c));
}
/** @param {Replay} replay @param {WorkflowRuntime} wf @returns {WorkflowUsageView} */
function workflowUsage(replay,wf) {
  const c = replay.c, kernel = kernelOf(replay,wf,'accounting');
  /** @type {Map<string,UsageEntryView>} */ const union = new Map();
  /** @param {UsageEntryView} entry */
  function retain(entry) {
    chargeActorWork(entry,c);
    const key = usageKey(entry,c), old = union.get(key);
    if (old !== undefined) {
      ok(old.value === entry.value && old.taskId === entry.taskId && old.stepId === entry.stepId && old.observedAt === entry.observedAt,'conflicting-duplicate','accounting','Original observation changed metric or scope');
    } else union.set(key,entry);
  }
  for (const e of workArray(wf.usage,c)) retain(e);
  for (const e of workRecord(kernel.usage,c)) {
    const a = activationOf(wf,e.activationId,'accounting');
    for (const metric of METRIC_KINDS) {
      const value = metric === 'inputTokens' ? e.usage.totalInput : metric === 'outputTokens' ? e.usage.output : e.usage.cost;
      retain({usageId:e.usageId,observationId:e.observationId,observedAt:e.usage.observedAt,producerId:e.participant.actorId,producer:e.participant,operationId:a.operationId,activationId:e.activationId,workflowId:wf.workflowId,taskId:e.taskId,stepId:e.stepId,source:'implementer',metric,value,known:value !== null});
    }
  }
  const producers = workMap(union,c);
  let inputTokens = 0, outputTokens = 0, costUsd = 0;
  for (const e of workArray(producers,c)) {
    if (e.value === null) continue;
    if (e.metric === 'inputTokens') inputTokens = addAmount(inputTokens,e.value);
    else if (e.metric === 'outputTokens') outputTokens = addAmount(outputTokens,e.value);
    else costUsd = addAmount(costUsd,e.value);
  }
  const taskLedgers = workRecord(kernel.tasks,c).map(task => ({taskId:task.taskId,accounting:task.accounting}));
  let accountedInput = 0, accountedCost = 0, accountedOutput = 0;
  for (const task of workArray(taskLedgers,c)) { accountedInput = addAmount(accountedInput,task.accounting.lifetime.inputTokens); accountedCost = addAmount(accountedCost,task.accounting.lifetime.costUsd); accountedOutput = addAmount(accountedOutput,task.accounting.lifetime.outputTokens); }
  for (const e of workArray(producers,c)) if (e.source === 'supervisor' && e.value !== null) {
    if (e.metric === 'inputTokens') accountedInput = addAmount(accountedInput,e.value);
    if (e.metric === 'costUsd') accountedCost = addAmount(accountedCost,e.value);
    if (e.metric === 'outputTokens') accountedOutput = addAmount(accountedOutput,e.value);
  }
  // Reconciled task totals already include their observations. Union supervisor
  // lower bounds once; do not add task totals to their own producer entries.
  inputTokens = Math.max(inputTokens,accountedInput); costUsd = Math.max(costUsd,accountedCost); outputTokens = Math.max(outputTokens,accountedOutput);
  /** @type {UsageGapView[]} */ const gaps = [];
  for (const task of workRecord(kernel.tasks,c)) for (const gap of workArray(task.accounting.gaps,c)) gaps.push({...gap,taskId:task.taskId,activationId:null});
  // Input coverage comes from the kernel's command/observation/crash/reconcile
  // scopes. Never recreate an unconditional gap after valid reconciliation.
  const legacy = kernel.genesis.legacy;
  if (legacy !== null) for (const cause of workArray(kernel.genesis.holds,c)) if (cause.reason === 'unknown-accounting') gaps.push({gapId:cause.causeId,metric:'inputTokens',taskId:legacy.taskId,stepId:null,activationId:null,reason:'legacy-input-coverage-missing'});
  // Held legacy has no input field or accounting adoption path. Its mandatory
  // original kernel unknown-accounting cause cannot become complete zero here.
  for (const a of workMap(wf.activations,c)) {
    if (a.role !== 'supervisor') continue;
    const mayHaveRun = workArray(a.deliveries,c).some(d => d.stage === 'sent' || d.stage === 'accepted' || d.stage === 'started') || a.settlement !== null || a.containment?.outcome === 'contained';
    if (!mayHaveRun || a.containment?.outcome === 'not-sent' && containmentComplete(a,kernel,c)) continue;
    const complete = supervisorAccountingComplete(wf,a,kernel,c);
    for (const metric of METRIC_KINDS) {
      const entries = workArray(producers,c).filter(e => e.activationId === a.activationId && e.metric === metric);
      if (complete) continue;
      gaps.push({gapId:a.activationId,metric,taskId:null,stepId:null,activationId:a.activationId,reason:entries.length === 0 ? 'missing-supervisor-observation' : 'supervisor-observations-not-complete'});
    }
  }
  consumeValidationWork(c,producers.length + gaps.length,'actor.accounting-publication');
  return {workflowId:wf.workflowId,inputTokens,outputTokens,costUsd,producers,taskLedgers,gaps,causesUnknownCost:workArray(gaps,c).some(g => g.metric === 'costUsd')};
}
/** Pure derivation: never adds to replay.usage/usageIds or workflow arrays. Both
 * archive replay and repeated view derivations visit the same original facts.
 * @param {Replay} replay @returns {AccountingView} */
function deriveUsage(replay) {
  const workflows = workMap(replay.workflows,replay.c).map(wf => workflowUsage(replay,wf));
  let inputTokens = 0, outputTokens = 0, costUsd = 0;
  for (const wf of workArray(workflows,replay.c)) { inputTokens = addAmount(inputTokens,wf.inputTokens); outputTokens = addAmount(outputTokens,wf.outputTokens); costUsd = addAmount(costUsd,wf.costUsd); }
  return {workflows,inputTokens,outputTokens,costUsd,complete:workArray(workflows,replay.c).every(w => w.gaps.length === 0)};
}

/** Effective workflow union and kernel task/step ledgers have different scopes.
 * Kernel reconciliation may raise a lower bound: use max, not an additional charge
 * of both the observation and its task subtotal. No unknown is treated as zero.
 * @param {Replay} replay @param {WorkflowRuntime} wf @param {number} time @param {boolean} [prospectiveRevise] @returns {AdmissionDenial|null} */
function budgetDenial(replay,wf,time,prospectiveRevise = false) {
  const c = replay.c, b = wf.budget, usage = workflowUsage(replay,wf), kernel = kernelOf(replay,wf,'budget');
  if (time >= b.deadline || time - b.assignedAt >= b.limits.taskTimeoutMs) return 'budget';
  let supervisorCost = 0, supervisorOutput = 0, implementationCost = 0, implementationOutput = 0;
  for (const e of workArray(usage.producers,c)) if (e.source === 'supervisor' && e.value !== null) {
    if (e.metric === 'costUsd') supervisorCost = addAmount(supervisorCost,e.value);
    if (e.metric === 'outputTokens') supervisorOutput = addAmount(supervisorOutput,e.value);
  }
  // Only admitted structural commits overlap the workflow counter and the
  // kernel lifetime revision ledger. Ordinary revise charges and independent
  // pre-dispatch plan revisions remain distinct, including across task restarts.
  const planRevisions = Math.max(0,wf.planRevision - 1);
  ok(wf.structuralRevisionOperations.size <= planRevisions,'inconsistent-reference','budget.revisions','Structural revision overlap exceeds installed workflow revisions');
  let revisions = planRevisions - wf.structuralRevisionOperations.size, reports = 0, repairs = 0, recoveries = 0;
  for (const task of workRecord(kernel.tasks,c)) {
    const a = task.accounting.lifetime;
    implementationCost = addAmount(implementationCost,a.costUsd); implementationOutput = addAmount(implementationOutput,a.outputTokens);
    revisions = addAmount(revisions,a.revisions,true); reports = addAmount(reports,a.reports,true);
    repairs = addAmount(repairs,a.repairAttempts,true); recoveries = addAmount(recoveries,a.recoveryAttempts,true);
    const currentStep = task.steps[task.stepIndex];
    const s = currentStep === undefined ? undefined : lineageAccounting(task,currentStep.id,c);
    if (s !== undefined && (s.activeMs >= b.limits.activeStepTimeoutMs || s.turns >= b.limits.maxTurnsPerStep || s.revisions > b.policy.maxRevisionsPerStep)) return 'budget';
  }
  const cost = Math.max(usage.costUsd,addAmount(supervisorCost,implementationCost));
  const output = Math.max(usage.outputTokens,addAmount(supervisorOutput,implementationOutput));
  // A pending revise is charged by the kernel at commitment, after admission.
  // Count that prospective charge here so an admission decision can never leave
  // the aggregate allowance exceeded once the committed charge is applied.
  const chargedRevisions = prospectiveRevise ? addAmount(revisions,1,true) : revisions;
  if (b.limits.maxReportedCostUsd !== null && cost >= b.limits.maxReportedCostUsd || b.limits.maxOutputTokens !== null && output >= b.limits.maxOutputTokens || chargedRevisions > b.policy.maxRevisions || reports >= b.limits.maxReportsPerTask || repairs > b.limits.maxAutomaticReportRepairs || recoveries > b.limits.maxAutomaticRecoveryAttempts) return 'budget';
  // No input-token limit exists in TaskLimits. Its explicit completeness gap
  // affects accounting completeness, not unrelated cost/output/step admission.
  return workArray(usage.gaps,c).some(g => g.metric !== 'inputTokens') ? 'unknown-accounting' : null;
}

/** @param {Replay} replay @returns {Readonly<{view: readonly WorkflowView[], mailboxes: readonly MailboxView[], actor: ActorView, accounting: AccountingView}>} */
function deriveViews(replay) {
  const accounting = deriveUsage(replay), c = replay.c;
  const view = workArray(replay.order,c).map(workflowId => {
    const wf = workflowOf(replay, workflowId), kernel = kernelOf(replay,wf,'workflows');
    const usage = workArray(accounting.workflows,c).find(w => w.workflowId === workflowId);
    ok(usage !== undefined,'inconsistent-reference','accounting','Missing derived workflow accounting');
    /** @type {WorkflowView} */
    const result = {
      workflowId, requestId: wf.requestId, inputHash: wf.inputHash, submissionEvidence:wf.submissionEvidence, authorities:Object.freeze(workMap(wf.authorities,c)), objective: wf.objective, constraints: wf.constraints,
      owner: wf.owner, supervisorId: wf.supervisorId, implementerId: wf.implementerId, status: wf.status,
      workflowRevision: wf.workflowRevision, planRevision: wf.planRevision, steps: wf.steps, planRecorded:wf.planRecorded, planIntentId:wf.planIntentId,
      plans:Object.freeze(workMap(wf.plans,c)), taskPlans:Object.freeze(workMap(wf.taskPlans,c)), structuralRevisionOperations:Object.freeze(workSet(wf.structuralRevisionOperations,c)), assignment:wf.assignment, budget:wf.budget, amendments:workArray(wf.amendments,c).slice(), lifetimeDeadlineAt:wf.lifetimeDeadlineAt,
      // Held consequences remain visible even if raw kernel commitment cleared
      // a report obligation. Do not publish a denied continuation as admitted.
      unresolvedObligations: Object.freeze(workflowObligations(replay,wf,kernel)),
      dispositions:Object.freeze(workArray(wf.dispositions,c).slice()), closureObservations:Object.freeze(workArray(wf.closureObservations,c).slice()),
      heldCommitments: Object.freeze(workArray(wf.heldCommitments,c).slice()),
      taskBases: Object.freeze(workMap(wf.taskBases,c)),
      activations: Object.freeze(workMap(wf.activations,c).map(a => Object.freeze({ activationId: a.activationId, authorityEvidence:a.authorityEvidence, role: a.role, actorId: a.actorId, operationId: a.operationId, intentId: a.intentId, intentHash: a.intentHash, deadline: a.deadline, settled: a.settled, settlementObservation: a.settlementObservation, settlement: a.settlement, producer: a.producer, control: a.control, deliveries: a.deliveries, containment:a.containment, containments:Object.freeze(workArray(a.containments,c).slice()), accounting:a.accounting, accountingComplete:supervisorAccountingComplete(wf,a,kernel,c), accountingHistory:Object.freeze(workArray(a.accountingHistory,c).slice()), resolutions:Object.freeze(workArray(a.resolutions,c).slice()), settlements:Object.freeze(settlementFacts(a,kernel,c)), nativeSettlement:workArray(settlementFacts(a,kernel,c),c).find(s => s.phase === 'native-settled') ?? null, containmentComplete:containmentComplete(a,kernel,c), reservation:activationReservation(wf,a,kernel,c), closed: !reserved(activationReservation(wf,a,kernel,c)) }))),
      intents: Object.freeze(workMap(wf.intents,c)),
      questions:Object.freeze(workMap(wf.questions,c)), answers:Object.freeze(workMap(wf.answers,c)), attempts:Object.freeze(workMap(wf.attempts,c)), controls:Object.freeze(workMap(wf.controls,c)), disposed:wf.disposed,
      artifacts: Object.freeze(workMap(wf.artifacts,c)),
      inspectionDeliveries: Object.freeze(workMap(wf.inspectionDeliveries,c)),
      reports: Object.freeze(workRecord(kernel.reports,c).map(r => Object.freeze({ reportId:r.envelope.reportId, attemptId:r.producerIdentity.attemptId, activationId:identityProducer(wf,r.producerIdentity,'workflows.reports').activationId, reportHash:r.envelope.payloadHash, reportKind:r.envelope.payload.kind, stepId:r.envelope.payload.stepId, barrierId:r.finalizationWitness === null ? null : r.finalizationWitness.barrierId }))),
      decisions: Object.freeze(workArray(workRecord(kernel.decisions,c).filter(d => !heldCommitment(wf,d.candidate.operationId)),c).map(d => Object.freeze({ operationId:d.candidate.operationId, action:d.candidate.input.action, reportId:d.candidate.input.reportId, checkpointHash:d.candidate.source === 'supervisor-control' ? d.candidate.review.checkpointHash : d.candidate.input.checkpointHash ?? null, continuationOperationId:d.candidate.continuationOperationId, activationId:d.candidate.source === 'supervisor-control' ? d.candidate.review.activationId : null, source:d.candidate.source }))),
      inspections: Object.freeze(workMap(wf.inspections,c)),
      usage: Object.freeze(usage.producers),
      holds: Object.freeze(workArray(scopedHolds(replay,wf),c).map(h => freezeWork({ causeId: h.causeId, reason: h.reason, scope: { ...h.scope }, at: h.at, resolvedBy: h.resolvedBy },c))),
      implementationGenesis: wf.implementationGenesis,
    };
    return Object.freeze(result);
  });
  const mailboxes = workMap(replay.mailboxes,c).map(mb => {
    const entries = workArray([...workArray(mb.ordinary,c), ...workArray(mb.control,c)],c).map(e => Object.freeze({ messageId: e.messageId, targetId: e.targetId, targetRole: e.targetRole, lane: e.lane, priority: e.priority, operationId: e.operationId, idempotencyKey: e.idempotencyKey, epochSegment: e.epochSegment, bytes: e.bytes, payloadHash: e.payloadHash, envelope:e.envelope, workflowId:e.workflowId, enqueuedAt:e.enqueuedAt, disposition: e.disposition, released: e.released, attempts:workMap(replay.mailboxAttempts.get(e.messageId) ?? new Map(),c).map(a => ({...a,stages:workMap(replay.mailboxStageFacts.get(e.messageId)?.get(a.payload.operationId) ?? new Map(),c)})), resolutions:workArray(replay.mailboxResolutions.get(e.messageId) ?? [],c).map(r => ({...r,currentlySatisfied:mailboxResolutionSatisfied(replay,e,r,c)})), effectiveDisposition:effectiveMailboxDisposition(replay,e,c) }));
    const ordinary = mailboxOccupancy(mb.ordinary,c), control = mailboxOccupancy(mb.control,c);
    return Object.freeze({ actorId: mb.actorId, ordinaryCount: ordinary.count, ordinaryBytes: ordinary.bytes, controlCount: control.count, controlBytes: control.bytes, maxQueuedPerActor: mb.maxQueuedPerActor, entries: Object.freeze(entries), priorityStreak:mb.priorityStreak, nextFairMessageId: nextFair(mb,c), nextMessageId:nextMailboxMessage(mb,c) });
  });
  const actors = workArray(replay.genesis.actorDefinitions,c).map(def => {
    const lifecycle = lifecycleOf(replay,def.id);
    /** @type {HoldReason[]} */ const holds = [];
    if (!lifecycle.enabled) holds.push('disabled');
    if (lifecycle.stopped) holds.push('stopped');
    if (lifecycle.paused) holds.push('paused');
    for (const h of workArray(replay.holds,c)) if (h.resolvedBy === null && (h.scope.kind === 'root' || (h.scope.kind === 'actor' || h.scope.kind === 'mailbox') && h.scope.id === def.id || workMap(replay.workflows,c).some(w => (w.supervisorId === def.id || w.implementerId === def.id) && scopeApplies(replay,w,h.scope)))) holds.push(h.reason);
    for (const wf of workMap(replay.workflows,c)) if (wf.supervisorId === def.id || wf.implementerId === def.id) for (const h of workArray(wf.holds,c)) if (h.resolvedBy === null) holds.push(h.reason);
    /** @type {ActorViewEntry['status']} */ const status = !lifecycle.enabled ? 'disabled' : lifecycle.stopped ? 'stopped' : lifecycle.paused ? 'paused' : 'enabled';
    return Object.freeze({actorId:def.id,role:def.role,definition:def,binding:replay.bindings.get(def.id) ?? null,status,lifecycle,openActivations:openActivations(replay,def.id),holds:Object.freeze(workSet(new Set(workArray(holds,c)),c))});
  });
  // Publish copied collections only, never the mutable fold's maps or arrays.
  const views = {view,mailboxes,actor:{actors},accounting};
  chargeActorWork(views,c);
  return deepFreeze(views);
}

// ---------------------------------------------------------------------------
// Aggregate builder
// ---------------------------------------------------------------------------

/** This value never crosses a public boundary. It is produced only by complete
 * root/archive/fold validation, then retained lexically by one reducer invocation.
 * No global registry, caller cache, frozen flag or equality can manufacture it.
 * @typedef {{root:ParsedRoot,replay:Replay}} ActorPrefix
 * @typedef {{model:ActorModelView,outcome:'apply'|'noop'|'hold',prefix:ActorPrefix}} ActorComposition */

/** @param {unknown} value @param {unknown} archiveContext @param {ValidationContext} c @returns {ActorModelView} */
function buildModelInContext(value, archiveContext, c) { return composeModelInContext(value,archiveContext,c).model; }

/** @param {unknown} value @param {unknown} archiveContext @param {ValidationContext} c @returns {ActorComposition} */
function composeModelInContext(value, archiveContext, c) {
  const captured = ensureInert(value, 'actorState', c);
  const ctx = validateArchiveValidationContext(archiveContext, c);
  const root = parseRoot(captured, 'actorState', c);
  const prior = bindArchive(root, ctx, c);
  const replay = runFold(root, c, prior);
  return publishActorPrefix({root,replay},c);
}

/** Publication never exports replay Maps/Sets. Some public records share frozen
 * fold values; a later append must fork them regardless of their frozen flags.
 * @param {ActorPrefix} prefix @param {ValidationContext} c @returns {ActorComposition} */
function publishActorPrefix(prefix,c) {
  requireValidationContext(c);
  const {root,replay} = prefix;
  ok(replay.c === c && replay.genesis === root.genesis && replay.segmentId === root.segmentId && replay.eventCount === root.events.length && replay.eventIds.size === replay.eventCount,'inconsistent-reference','actor.prefix','Private publication does not cover the complete checked root');
  validateMailboxHolds(replay,c);
  const views = deriveViews(replay);
  /** @type {ActorStateV2} */
  const state = Object.freeze({ version: 2, encoding: 'pair-actor-state/1', segmentId: root.segmentId, genesis: root.genesis, events: Object.freeze(root.events), archiveHead: root.archiveHead });
  /** @type {Record<string, CoordinationModel>} */
  const implementation = {};
  for (const key of workKeys(replay.implementation,c)) implementation[key] = replay.implementation[key];
  /** @type {ActorModelView} */
  const model = freezeWork({ nonAuthorizing: true, state, genesis: root.genesis, events: state.events, actor: views.actor, workflows: views.view, mailboxes: views.mailboxes, accounting: views.accounting, implementation },c);
  // Charge the complete newly constructed public representation, including each
  // repeated cache occurrence, before publication. This bounded capture makes a
  // real detached copy; it does not grant equality credit to this typed model or
  // replace the kernel's separate shared-context intermediate-work guard.
  ensureInert(model, 'actorModel', c);
  return {model, outcome:replay.outcome, prefix};
}

/** Fork only the private fold graph. Memoization preserves hold aliases between
 * replay.holds and workflow.holds (and every other graph alias). Maps/Sets are
 * actually copied; Object.freeze(Map) is never treated as immutability. Only the
 * registered context, parsed immutable genesis and exact C4-owned kernel models
 * are shared. No caller object reaches this function.
 * @param {ActorPrefix} prefix @param {ValidationContext} c @returns {Replay} */
function forkActorReplay(prefix,c) {
  requireValidationContext(c);
  const replay = prefix.replay;
  ok(replay.c === c,'inconsistent-reference','actor.prefix','Prefix belongs to a different operation');
  /** @type {Map<object,object>} */ const seen = new Map();
  seen.set(c,c); seen.set(replay.genesis,replay.genesis);
  for (const key of workKeys(replay.implementation,c)) {
    const kernel = replay.implementation[key]; seen.set(kernel,kernel);
  }
  /** Exact graph copier over private records, arrays and collections only.
   * @param {unknown} value @param {number} [depth] @returns {unknown} */
  function fork(value,depth = 0) {
    consumeValidationWork(c,1,'actor.fork');
    if (typeof value === 'string') consumeValidationWork(c,value.length,'actor.fork-text');
    if (value === null || typeof value !== 'object') return value;
    const prior = seen.get(value);
    if (prior !== undefined) return prior;
    ok(depth <= c.maxDepth,'capacity','actor.fork','Private fork depth exceeded');
    if (value instanceof Map) {
      /** @type {Map<unknown,unknown>} */ const out = new Map(); seen.set(value,out);
      consumeValidationWork(c,value.size * 2,'actor.fork-map');
      for (const [key,entry] of value) out.set(fork(key,depth + 1),fork(entry,depth + 1));
      return out;
    }
    if (value instanceof Set) {
      /** @type {Set<unknown>} */ const out = new Set(); seen.set(value,out);
      consumeValidationWork(c,value.size,'actor.fork-set');
      for (const entry of value) out.add(fork(entry,depth + 1));
      return out;
    }
    /** @type {object} */ const out = Array.isArray(value) ? [] : {};
    seen.set(value,out);
    for (const key of workKeys(value,c)) Object.defineProperty(out,key,{value:fork(Reflect.get(value,key),depth + 1),enumerable:true,writable:true,configurable:true});
    return out;
  }
  // The copier preserves every field, collection kind and alias of this Replay,
  // including plans/taskPlans and the once-only structural revision Set; no
  // append shares mutable plan projections with its prefix.
  // This assertion is internal construction, never validation of caller data.
  return /** @type {Replay} */ (fork(replay));
}

/** Copy journal slots, not event contents; common candidate/publication capture
 * still visits every occurrence. No equality credit is assigned by this copy.
 * @param {readonly ActorWorkflowEventV2[]} events @param {ActorWorkflowEventV2} event @param {ValidationContext} c @returns {readonly ActorWorkflowEventV2[]} */
function appendActorJournal(events,event,c) {
  consumeValidationWork(c,events.length + 1,'actor.journal-copy');
  return Object.freeze([...events,event]);
}

/** Root closure/genesis/archive binding are inherited from the actual private
 * checked root, never from equality with candidate bytes or archiveContext.
 * Only the parsed new event is appended; all its historical correlation and
 * reference resolution runs in the shared step. Candidate capture/sizing remains
 * separate work in the caller, and publication charges every cache occurrence.
 * @param {ActorPrefix} prefix @param {ActorWorkflowEventV2} event @param {ValidationContext} c @returns {ActorComposition} */
function appendActorPrefix(prefix,event,c) {
  const replay = forkActorReplay(prefix,c), base = prefix.root;
  const root = {segmentId:base.segmentId,genesis:base.genesis,archiveHead:base.archiveHead,events:appendActorJournal(base.events,event,c)};
  appendActorStep(replay,root,event,c);
  return publishActorPrefix({root,replay},c);
}

/** @param {unknown} value @param {unknown} archiveContext @returns {ActorModelView} */
function buildModel(value, archiveContext) {
  return buildModelInContext(value, archiveContext, createValidationContext());
}

/** @param {unknown} value @returns {ArchiveValidationContext} */
function archiveContextOf(value) {
  return /** @type {ArchiveValidationContext} */ (value);
}

/** Reduce input is either the canonical root or the actual ActorModelView shape.
 * Capture before any property access, close the complete envelope, reconstruct
 * from canonical state plus checked archive data, then compare EVERY cache.
 * No cache is authority and no new public validation operation/context is started.
 * The private prefix is returned only after ALL supplied caches compare.
 * @param {unknown} value @param {unknown} archiveContext @param {ValidationContext} c @returns {ActorComposition} */
function reconstructModelInContext(value, archiveContext, c) {
  const captured = ensureInert(value, 'model', c);
  const v = plain(captured, 'model');
  if (!Object.hasOwn(v, 'state')) return composeModelInContext(captured, archiveContext, c);
  const cacheKeys = /** @type {const} */ (['genesis', 'events', 'actor', 'workflows', 'mailboxes', 'accounting', 'implementation']);
  closed(v, ['nonAuthorizing', 'state', ...cacheKeys], [], 'model');
  ok(v.nonAuthorizing === true, 'invalid-shape', 'model.nonAuthorizing', 'Model envelope must be non-authorizing');
  const reconstructed = composeModelInContext(v.state, archiveContext, c);
  for (const key of workArray(cacheKeys,c)) {
    ok(sameWork(v[key], reconstructed.model[key],c), 'inconsistent-reference', `model.${key}`, 'Model cache does not match canonical reconstruction');
  }
  return reconstructed;
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/** @param {unknown} value @param {ArchiveValidationContext} context @returns {ActorStateValidation} */
export function validateActorStateV2(value, context) {
  return buildModel(value, archiveContextOf(context));
}

/** Project canonical kernel legacy history or an explicitly resolved held-state
 * evidence record. Neither branch creates execution identity or admits effects.
 * `known` is recognition, not provenance, accounting completeness or readiness.
 * @param {unknown} value @param {string} workerId
 * @param {ArchiveValidationContext|HeldLegacyProjectionContext} context @returns {LegacyWorkerView} */
export function projectLegacyWorkerView(value, workerId, context) {
  const c = createValidationContext();
  const held = projectHeldLegacyWorkerViewInContext(value, workerId, context, c);
  if (held !== null) return held;
  const model = buildModelInContext(value, archiveContextOf(context), c);
  const workerKey = validateId(workerId, 'workerId');
  chargeActorWork(workerKey,c);
  /** @type {WorkflowView|null} */ let found = null;
  for (const wf of workArray(model.workflows,c)) {
    if (wf.implementationGenesis.legacy === null || wf.implementationGenesis.fence.workerId !== workerKey) continue;
    ok(found === null, 'ambiguous-legacy-worker', 'workerId', 'Multiple retained histories name this legacy worker', 'unsupported');
    found = wf;
  }
  if (found === null) fail('unknown-legacy-worker', 'workerId', 'No held legacy worker identity is present in canonical history', 'unsupported');
  // Use replayed status/holds, not stale genesis status after cancellation.
  const kernel = model.implementation[found.workflowId], legacy = kernel.task;
  ok(legacy !== null && legacy.kind === 'legacy-held', 'unsupported-legacy-worker', 'workerId', 'Retained legacy history no longer has a representable legacy task', 'unsupported');
  ok(legacy.identity === null || legacy.identity.fence.workerId === workerKey, 'inconsistent-reference', 'workerId', 'Legacy execution identity names another worker');
  const reasons = new Set(workArray(kernel.holds,c));
  const actor = workArray(model.actor.actors,c).find(entry => entry.actorId === workerKey);
  if (actor !== undefined) for (const reason of workArray(actor.holds,c)) reasons.add(reason);
  for (const hold of workArray(found.holds,c)) if (hold.resolvedBy === null) reasons.add(hold.reason);
  const diagnostics = ['legacy-source-diagnostics-unavailable'];
  if (legacy.identity === null) diagnostics.push('legacy-execution-identity-unknown');
  if (legacy.taskId === null) diagnostics.push('legacy-task-unknown');
  /** @type {LegacyWorkerView} */
  const view = {
    nonAuthorizing: true, workerId: workerKey, session: legacy.identity?.fence.sessionId ?? null,
    status: legacy.status, heldReasons: workSet(reasons,c), taskRef: legacy.taskId,
    pendingObligationRefs: legacy.pending === null ? [] : [legacy.pending.reportRef],
    historyRefs: workArray(legacy.historyRefs,c).slice(), diagnostics, known: true,
  };
  // Projection allocation/publication stays in the same operation as replay.
  ensureInert(view, 'legacyWorkerView', c);
  return freezeWork(view,c);
}

/** @param {unknown} value @param {ArchiveValidationContext} context @returns {ActorWorkflowModel} */
export function validateActorWorkflowModel(value, context) {
  return buildModel(value, archiveContextOf(context));
}

/** @param {unknown} value @returns {ActorWorkflowEventV2} */
export function validateActorWorkflowEvent(value) {
  const c = createValidationContext();
  const captured = ensureInert(value, 'event', c);
  return parseWorkflowEvent(captured, 'event', c);
}

/** A reserved-control envelope is the only actor-domain event that consumes the
 * control/disposition reserve rather than ordinary admission capacity.
 * @param {ActorWorkflowEventV2} ev @returns {boolean} */
function ordinaryEvent(ev) {
  if (ev.domain !== 'actor') return true;
  const p = ev.payload;
  return !(p.kind === 'mailbox-enqueued' && p.lane === 'reserved-control');
}

/** @param {unknown} model @param {unknown} event @param {ArchiveValidationContext} context @returns {ActorTransitionResult} */
export function reduceActorWorkflow(model, event, context) {
  const c = createValidationContext();
  /** @type {ActorModelView|undefined} */
  let base;
  try {
    const capturedEvent = ensureInert(event, 'event', c);
    const parsedEvent = parseWorkflowEvent(capturedEvent, 'event', c);
    const checked = reconstructModelInContext(model, context, c);
    base = checked.model;
    consumeValidationWork(c,parsedEvent.eventId.length,'actor.event-index');
    const existingIndex = checked.prefix.replay.eventIds.get(parsedEvent.eventId);
    const existing = existingIndex === undefined ? undefined : base.events[existingIndex];
    if (existing !== undefined) {
      if (sameWork(existing, parsedEvent,c)) return Object.freeze({ kind: 'noop', nonAuthorizing: true, reason: 'duplicate', model: base });
      return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'operation-conflict' });
    }
    if (parsedEvent.sequence !== base.events.length + 1) return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'input-conflict' });
    const ordinary = ordinaryEvent(parsedEvent);
    if (ordinary) {
      const ordinaryEvents = checked.prefix.replay.ordinaryCount + 1;
      if (ordinaryEvents > COMMON_BOUNDS.maxEvents - COMMON_BOUNDS.reservedEvents) return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'capacity' });
    }
    // Still capture/size the complete candidate in c. It confers no replay
    // ownership: the append consumes only the lexically retained checked prefix.
    const candidate = ensureInert({ ...base.state, events: appendActorJournal(base.state.events,parsedEvent,c) }, 'candidateState', c);
    if (ordinary) {
      const bytes = Buffer.byteLength(encodePairJSON(candidate, c), 'utf8');
      if (bytes > COMMON_BOUNDS.maxBytes - COMMON_BOUNDS.reservedBytes) return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'capacity' });
    }
    const next = appendActorPrefix(checked.prefix, parsedEvent, c);
    if (next.outcome === 'noop') return Object.freeze({kind:'noop',nonAuthorizing:true,reason:'duplicate',model:base});
    if (next.outcome === 'hold') return Object.freeze({kind:'hold',nonAuthorizing:true,reason:'held',model:next.model});
    return Object.freeze({ kind: 'apply', nonAuthorizing: true, reason: 'applied', model: next.model });
  } catch (error) {
    if (error instanceof CoordinationValidationError) return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'operation-conflict' });
    if (error instanceof ContractValidationError) {
      const code = error.code;
      if (code === 'capacity') return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'capacity' });
      if (code === 'unsupported-preimage' || code === 'unsupported-mailbox' || code === 'unsupported-archive') return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'unsupported' });
      // Pure proposals denied before admission may hold without appending. This
      // unchanged base is NOT a durable receipt for the attempted event. Exactly
      // bound storage observations use applyImplementation's retained disposition
      // path instead; intrinsic conflicts reject and programming errors escape.
      if (HOLD_CODES.has(code)) { if (base === undefined) return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'input-conflict' }); return Object.freeze({ kind: 'hold', nonAuthorizing: true, reason: code === 'mailbox-capacity' ? 'capacity' : 'held', model: base }); }
      if (code === 'epoch-rejected') return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'epoch-rejected' });
      if (code === 'conflicting-duplicate') return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'operation-conflict' });
      return Object.freeze({ kind: 'reject', nonAuthorizing: true, reason: 'input-conflict' });
    }
    throw error;
  }
}

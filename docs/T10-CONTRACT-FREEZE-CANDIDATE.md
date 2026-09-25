# T10 — stopped-source contract freeze candidate

**Status: RATIFIED FREEZE (2026-09-25) — see §9.** Independent T09 review completed with all findings corrected and independently verified ([T09 §6](T09-FOUNDATION-REVIEW-CHECKPOINT.md)); the pinned gates pass at the frozen source identity. The freeze covers the exact facade/aggregate signatures, artifact forms, bounds, both event namespaces, ownership/publication/crash matrices as design of record, and the H1-L decision below. It is NOT runtime/native acceptance and does not authorize live cutover; FR-06 (Host integration) remains open work under the amendment path in §9. Exact type expressions are source inventory, not semantic acceptance or a standalone schema: recursive fields/defaults/invariants still belong to the linked validators.

## 1. Acceptance ledger for this request

| ID | Concrete check | State |
|---|---|---|
| FR-01 | Preserve stopped source, all 11 public signatures and 106 original requirements. | PASS: all 24 production files/tsconfig unchanged; 11 signatures and 106 original rows preserved. Authorized follow-up adds one pinned type dependency and corresponding lock entries. |
| FR-02 | Diagnose review startup and obtain actual independent source coverage/findings. | **PASS** (2026-09-25): three disjoint area reviews + per-correction re-reviews + three Astra verification runs, all source-accessing and read-only; every finding closed. See [T09 §6](T09-FOUNDATION-REVIEW-CHECKPOINT.md). |
| FR-03 | Capture exact artifact forms, codecs, bounds and both event namespaces. | PASS, bounded inventory: 32 expressions and source locations match AST exactly; 32 actor/27 kernel names and existing bounds captured. |
| FR-04 | Specify owner/readers, publication/readback, crash and incompatible-peer rules. | Candidate matrix below and [H1-0 publication contract](H1-0-PUBLICATION-CONTRACT.md); needs review and implementation. |
| FR-05 | Resolve findings and record final static/package results, including the pinned gate. | **PASS** (2026-09-25): all findings resolved and independently verified (Astra FIX VERIFIED, zero open issues); typecheck exit 0 and pack:check exit 0 (88 files) at aggregate digest `26096bba…`. Not runtime acceptance. |
| FR-06 | Integrate Host/store/runtime after gates, with real legacy admission and immediate containment. | NOT OPEN; the single-implementer adapter is a concrete missing contract, not existing actor-pair behavior. |

## 2. Stopped boundary

Current ordered `shasum -a 256 src/*.js package.json tsconfig.json` listing SHA-256: `46ab4aaff0c9a1b3b17e048b90efc04e284a945d3af745f3d69535cdd7376fa9` (24 JS files). Only the approved development-dependency declaration differs from the preparation listing `ffbdbace2cf23a78d56385bfafe1e00c1ff7d5b1190e72b1e5d0ce5588838981`; all production source remains identical to [D5 verification](D5-HELD-CARRIER-CONTRACT.md).

Facade: `validateActorConfigV3/1`, `validateActorRecordV2/1`, `validateWorkflowRecordV2/1`, `validateActivationRecordV2/1`, `validateMailboxEnvelopeV2/1`, `validateActorControlV2/2`.

Aggregate: `validateActorStateV2/2`, `projectLegacyWorkerView/3`, `validateActorWorkflowModel/2`, `validateActorWorkflowEvent/1`, `reduceActorWorkflow/3`. All arguments required. Only the projection accepts the explicit held resolver context; other aggregate contexts remain `ArchiveValidationContext`. Private helpers are not new facade symbols.

Active package/config/state/wire remain `0.1.0/2/1/1`. Main tools: `pair_dispatch`, `pair_decide`, `pair_inspect`, `pair_status`, `pair_cancel`. Worker: `pair_report`. Future validators remain outside the active extension import graph. `pair_submit`, Supervisor and ActorHost are not active/registered.

## 3. Mechanically captured source forms

### OwnerBinding

Source: [`src/actor-contract-common.js:55`](../src/actor-contract-common.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{ownerSession:string, ownerEpoch:number, branchRevision:Id}>
```

### ActorBinding

Source: [`src/actor-contract-common.js:56`](../src/actor-contract-common.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{actorId:Id, role:'main'|'supervisor'|'implementer', ownerSession:string, ownerEpoch:number, generation:number, sessionId:string, model:string|null}>
```

### Identity

Source: [`src/actor-contract-common.js:59`](../src/actor-contract-common.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{fence:Fence, taskId:Id, planRevision:number, attemptId:Id, attemptNumber:number, leaseId:Token}>
```

### ArtifactRef

Source: [`src/actor-contract-common.js:57`](../src/actor-contract-common.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{ref:string, hash:Hash}>
```

### ArchiveReferenceV2

Source: [`src/actor-contract-common.js:87`](../src/actor-contract-common.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{storeId:Id, segmentId:Id, originalHash:Hash, byteLength:number, priorRoot:Id|null}>
```

### AssignmentSnapshotV2

Source: [`src/actor-contract-common.js:74`](../src/actor-contract-common.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
KernelAssignmentProjection & Readonly<{evidence:EvidenceLimits, workerRequirements:WorkerRequirements, participants:Readonly<{supervisor:ActorDefinitionV3|null, implementer:ActorDefinitionV3}>, workerResources:WorkerResources, supervisorResources:SupervisorResources, workspace:WorkspaceBinding, assignedAt:number, deadline:number, budgetRevision:Id, budgetHash:Hash}>
```

### ConfigCommonV3

Source: [`src/actor-contract-common.js:1116`](../src/actor-contract-common.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version:3, enabled:boolean, autoStart:boolean, indicator:IndicatorV3, supervision:TaskPolicy, safety:SafetyPolicyV3, limits:TaskLimits, verification:VerificationPolicy, evidence:EvidenceLimits, workerRequirements:WorkerRequirements, workerResources:WorkerResources, supervisorResources:SupervisorResources, runtime:RuntimeConfigV3}>
```

### LegacyActorConfigV3

Source: [`src/actor-contract-common.js:1117`](../src/actor-contract-common.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
ConfigCommonV3 & Readonly<{mode:'legacy', maxWorkers:number, workers:readonly LegacyWorkerV3[]}>
```

### ActorPairActorConfigV3

Source: [`src/actor-contract-common.js:1118`](../src/actor-contract-common.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
ConfigCommonV3 & Readonly<{mode:'actor-pair', actors:readonly ActorDefinitionV3[], workflow:WorkflowConfigV3, mailbox:MailboxLimitsV3, capacity:ActorCapacityV3, idlePolicy:ActorIdlePolicyV3}>
```

### ActorGenesisV2

Source: [`src/actor-model.js:266`](../src/actor-model.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{storeId:Id, initialOwner:OwnerBinding, actorDefinitions:readonly ActorDefinitionV3[], configSnapshot:ActorConfigV3, heldLegacyRefs:readonly ArtifactRef[], checkpoint:ArchiveCheckpointV2|null}>
```

### ActorStateV2

Source: [`src/actor-model.js:267`](../src/actor-model.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version:2, encoding:'pair-actor-state/1', segmentId:Id, genesis:ActorGenesisV2, events:readonly ActorWorkflowEventV2[], archiveHead:ArchiveReferenceV2|null}>
```

### ActorDomainEvent

Source: [`src/actor-model.js:262`](../src/actor-model.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{eventId:Id, sequence:number, at:number, owner:OwnerBinding, workflowId:Id|null, domain:'actor', payload:ActorPayload}>
```

### ImplementationDomainEvent

Source: [`src/actor-model.js:263`](../src/actor-model.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{eventId:Id, sequence:number, at:number, owner:OwnerBinding, workflowId:Id|null, domain:'implementation', payload:TransitionEvent}>
```

### ActorTransitionResult

Source: [`src/actor-model.js:305`](../src/actor-model.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{kind:'apply'|'noop'|'hold', nonAuthorizing:true, reason:ActorTransitionReason, model:ActorModelView}>|Readonly<{kind:'reject', nonAuthorizing:true, reason:ActorTransitionReason}>
```

### ActorRecordV2

Source: [`src/actor-record-contracts.js:50`](../src/actor-record-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version: 2, actorId: string, definition: ActorDefinitionV3, workspace: ActorWorkspaceV2, sessionId: string|null, sessionPath: string|null, generation: number, operational: 'enabled'|'paused'|'stopped', holds: readonly HoldCauseV2[], runtime: RuntimeObservationV2|null, mailboxRef: string|null, activationRefs: readonly string[], retentionRefs: readonly string[]}>
```

### WorkflowRecordV2

Source: [`src/actor-record-contracts.js:55`](../src/actor-record-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version: 2, workflowId: string, requestId: string, inputHash: string, owner: OwnerBinding, objective: string, constraints: readonly string[], participants: Readonly<{supervisor: string|null, implementer: string}>, workflowRevision: string, planRevision: number, budget: BudgetSnapshot, assignment: AssignmentSnapshotV2|null, status: 'planning'|'implementing'|'waiting'|'review'|'needs-user'|'completed'|'cancelled'|'interrupted', steps: readonly StepV2[], currentStep: string|null, currentTask: TaskRefV2|null, currentReport: ArtifactRef|null, currentDecision: ArtifactRef|null, obligations: readonly ObligationV2[]}>
```

### ActivationRecordV2

Source: [`src/actor-record-contracts.js:64`](../src/actor-record-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version: 2, activationId: string, operationId: string, commandId: string, role: 'supervisor'|'implementer', profile: 'supervisor-restricted'|'worker-native', owner: OwnerBinding, actor: ActorBinding, nonce: string, workflowId: string, workflowRevision: string, workflowPlanRevision: number, identity: Identity|null, authorityRef: ArtifactRef|null, grantProof: GrantCommitProofV2, intent: ActivationIntentV2, dispatch: ActivationDispatchV2, observations: Readonly<{ack: AckFactV2|null, run: RunFactV2|null, report: ReportFactV2|null, settlement: SettlementFactV2|null, effectBarrier: BarrierFactV2|null}>, resolution: ResolutionV2|null}>
```

### MailboxKeyV2

Source: [`src/actor-wire-contracts.js:69`](../src/actor-wire-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{domain:'pair-mailbox/2', epoch:AdmissionEpochV2, messageId:string, idempotencyKey:string, operationId:string, producer:EndpointV2, consumer:EndpointV2}>
```

### MailboxContentV2

Source: [`src/actor-wire-contracts.js:83`](../src/actor-wire-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version:2, key:MailboxKeyV2, createdAt:number, lane:'ordinary'|'reserved-control', priority:'normal'|'question-answer'|'control', control:ActorControlV2, delivery:MailboxDeliveryV2}>
```

### ActorControlV2

Source: [`src/actor-wire-contracts.js:125`](../src/actor-wire-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Hashed<ControlContentV2>
```

### AuthorityContentV2

Source: [`src/actor-wire-contracts.js:90`](../src/actor-wire-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version:2,owner:OwnerBinding,actor:ActorBinding,profile:'supervisor-restricted'|'worker-native',nonce:string,workflowId:string,workflowRevision:string,activationId:string,identity:Identity|null,grantOperationId:string,deadline:DeadlineWindow,command:PromptV2}>
```

### InspectionRequestContentV2

Source: [`src/actor-wire-contracts.js:72`](../src/actor-wire-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
InspectionBindingV2 & Readonly<{version:2, kind:'inspection-request', requestId:string, deadline:DeadlineWindow}>
```

### InspectionReplyContentV2

Source: [`src/actor-wire-contracts.js:73`](../src/actor-wire-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
InspectionBindingV2 & Readonly<{version:2, kind:'inspection-reply', requestId:string, replyId:string, request:ArtifactRef, requestBytes:number, evidence:readonly PayloadRefV2[], at:number}>
```

### InspectionReceiptContentV2

Source: [`src/actor-wire-contracts.js:74`](../src/actor-wire-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
InspectionBindingV2 & Readonly<{version:2, kind:'inspection-receipt', requestId:string, replyId:string, receiptId:string, request:ArtifactRef, requestBytes:number, reply:ArtifactRef, replyBytes:number, delivery:Observation}>
```

### DispositionContentV2

Source: [`src/actor-wire-contracts.js:80`](../src/actor-wire-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version:2, receiptId:string, key:MailboxKeyV2, inputHash:string, at:number, outcome:DispositionV2}>
```

### HeldLegacyProjectionContext

Source: [`src/actor-migration-contracts.js:39`](../src/actor-migration-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version:2, kind:'held-legacy', sourceInput:string|Uint8Array, backupInput:string|Uint8Array|null}>
```

### LegacyWorkerView

Source: [`src/actor-migration-contracts.js:42`](../src/actor-migration-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{nonAuthorizing:true, workerId:string, session:string|null, status:'held'|'cancelled', heldReasons:readonly string[], taskRef:string|null, pendingObligationRefs:readonly string[], historyRefs:readonly string[], diagnostics:readonly string[], known:boolean}>
```

### HeldLegacyEvidenceV2

Source: [`src/actor-migration-contracts.js:62`](../src/actor-migration-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version:2, encoding:'pair-held-legacy/1', nonAuthorizing:true, evidenceId:string, operation:LegacyOperationV2, source:LegacyByteRefV2, backup:LegacyBackupV2, sourceVersion:number|null, profile:LegacyProfileV2, preservation:LegacyPreservationV2, visibility:RetentionVisibilityV2, artifacts:readonly LegacyByteRefV2[], obligations:readonly RetainedObligationRefV2[], primaryIssue:MigrationIssueV2|null, rollbackIssue:MigrationIssueV2|null}>
```

### MigrationManifestV2

Source: [`src/actor-migration-contracts.js:64`](../src/actor-migration-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version:2, encoding:'pair-migration/1', nonAuthorizing:true, migrationId:string, owner:OwnerBinding, legacy:HeldLegacyEvidenceV2, primaryIssue:MigrationIssueV2|null, rollbackIssue:MigrationIssueV2|null, adoption:'requires-reconciliation'}> & (Readonly<{stage:'classified'|'backed-up', target:null, commitRef:null}>|Readonly<{stage:'prepared', target:MigrationTargetV2, commitRef:null}>|Readonly<{stage:'committed', target:MigrationTargetV2, commitRef:ArtifactRef}>|Readonly<{stage:'held', target:MigrationTargetV2|null, commitRef:ArtifactRef|null}>)
```

### ArchiveCheckpointV2

Source: [`src/actor-migration-contracts.js:70`](../src/actor-migration-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version:2, encoding:'pair-archive-checkpoint/1', nonAuthorizing:true, archive:ArchiveRefV2, rootHash:string, rootRevision:number, nextSegmentId:string, owner:OwnerBinding, actors:readonly ActorBinding[], counters:ArchiveCountersV2, dispositions:readonly ArchiveDispositionV2[], artifacts:readonly LegacyByteRefV2[], obligations:readonly RetainedObligationRefV2[]}>
```

### ArchiveSegmentV2

Source: [`src/actor-migration-contracts.js:82`](../src/actor-migration-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{reference:ArchiveRefV2, checkpoint:ArchiveCheckpointV2, original:string, decoded:ArchiveReplayInputV2}>
```

### ArchiveValidationContext

Source: [`src/actor-migration-contracts.js:87`](../src/actor-migration-contracts.js). Exact type expression; recursive aliases and semantic constraints remain in the source validators.

```typescript
Readonly<{version:2, kind:'empty', storeId:string, head:null, segments:readonly [], artifacts:readonly []}>|Readonly<{version:2, kind:'chain', storeId:string, head:ArchiveRefV2, segments:readonly [ArchiveSegmentV2, ...ArchiveSegmentV2[]], artifacts:readonly ArchiveResolvedArtifactV2[]}>
```

### Common bounds and hash domains

```javascript
const COMMON_BOUNDS = Object.freeze({
  maxDepth: 32, maxNodes: 250000, maxBytes: 16777216,
  maxReferences: 16, maxReferenceBytes: 4194304, maxReferencedBytes: 16777216,
  maxEvents: 16384, reservedEvents: 256, reservedBytes: 524288,
  maxActorDefinitions: 64, maxUnresolvedWorkflows: 1,
  defaultQueuedPerActor: 8, maxQueuedPerActor: 64, maxMailboxBytes: 4194304,
  maxControlEnvelopes: 8, maxControlBytes: 524288, maxEnvelopeBytes: 65536,
  maxUnresolvedOperations: 256, maxInspectionReceipts: 256,
  maxTextBytes: 10000, maxRequestLifetimeMs: 300000,
});
const DOMAINS = Object.freeze(['config', 'state', 'actor-event', 'workflow-input', 'operation-input', 'authority', 'mailbox', 'control', 'inspection', 'migration', 'archive']);
```

### Event namespaces

Actor events (32): `kernel-control-authorized`, `supervisor-accounting-reconciled`, `actor-lifecycle`, `workflow-amended`, `workflow-escalated`, `activation-contained`, `task-base-recorded`, `inspection-delivery-observed`, `artifact-retained`, `workflow-submitted`, `plan-recorded`, `activation-issued`, `activation-delivery-observed`, `supervisor-intent-recorded`, `activation-settled`, `mailbox-enqueued`, `mailbox-disposition`, `mailbox-attempt-bound`, `mailbox-delivery-observed`, `mailbox-reconciled`, `question-raised`, `answer-recorded`, `attempt-opened`, `report-observed`, `effects-observed`, `inspection-recorded`, `decision-recorded`, `supervisor-usage-recorded`, `hold-recorded`, `hold-resolved`, `owner-transitioned`, `workflow-closed`.

Implementation-kernel events (27): `dispatch-requested`, `intent-committed`, `prepare-grant`, `grant-committed`, `authority-published`, `dispatch-prepared`, `effects-reconciled`, `checkpoint-finalized`, `evidence-receipt`, `checkpoint-current`, `decide`, `notice-resolved`, `worker-delivery`, `main-delivery`, `usage-observed`, `counter-observed`, `budget-evaluated`, `amendment-proposed`, `automatic-action-prepared`, `reconciliation-proposed`, `reset-requested`, `lifecycle`, `owner-replaced`, `report`, `runtime`, `failure`, `unsupported`.

## 4. Codec, reader/writer and effect boundary

V2 digests are SHA-256 over UTF-8 `pair/<domain>/v2\n` followed by `encodePairJSON` canonical bytes. Original-byte hashes are plain SHA-256 of exact bytes. V1 payload hashes remain SHA-256 of historical `JSON.stringify(decoded)` bytes, never V2 sorted keys. `V1Carrier` retains original text and both hashes; invalid UTF-8 remains externally retained binary, not replacement-decoded text. Resource accounting uses one operation context; metadata references do not each constitute a separately resolved byte occurrence.

| Artifact / checker | Future writer and reader | Commit/readback / rejection boundary |
|---|---|---|
| Config V3 / `validateActorConfigV3` | Explicit Main configuration transaction; Host immutable snapshots; role-limited adapters. Current loader remains V2. | Preview/default normalization is not admission; no implicit actor-pair conversion. Complete Apply/rollback before binding a new revision. |
| Root / state/model validators | ActorStore alone publishes; ActorHost alone adopts transitions; Controller/Main consume derived views. | Complete bounded decode, archive resolution and historical replay; never trust a model cache. H1-0 supplies the physical protocol, not these pure validators. |
| Record leaves | Intrinsic parser boundaries, then aggregate history/cross-record proof. | No second leaf-file database; valid ACK/run/settlement fields are not observed effects. |
| Actor/implementation events | Main consent and fenced participant observations enter Host; Host assigns canonical identity/order. | Exact role/owner/revision/input and prefix; atomic rejection. All pure reducer results remain non-authorizing. |
| Authority / private authority validator | Host publishes; bridge reads its exact launch binding. Worker cannot issue canonical authority. | Reserve identity, write and read back exact content, then recheck owner/workspace/config/readiness before send. File equality is not consumption. |
| Actor control / `validateActorControlV2(value, expected)` | Host↔role adapter; expected binding comes from Host's owned runtime, not incoming data. | Exact wire/profile negotiation first. V1 peers never consume V2 grants; no unknown-send retry. |
| Mailbox / envelope validator and aggregate | Producer-owned immutable inbox/outbox/latch; Host owns canonical admission/dedup/receipts. | Notify only wakes scanning. Full key/input/epoch proof; transport ACK, consumption, logical disposition and effect settlement stay distinct. Preserve late contradictions and occupancy. |
| Inspection request/reply/receipt | Host resolver plus actual consumer-delivery observation, bound to eligible supervisor activation. | Raw and Q01 inline forms retain required preimages/accounting; inline content never proves delivery. Reject stale plan/checkpoint/identity. |
| Held legacy / evidence validator and projection | Store retains source/backup bytes; Host resolves; Main read-only consumers project. | No generated execution identity, actor or supervisor. Supplied equality is not durable backup; binary/unknown data stays non-runnable and discoverable. |
| Migration / manifest validator | Same Store owner stages metadata; Host handles explicit consent/adoption/reconciliation. | Stage is a retained claim, not durable commit. Exact backup/readback before authorized replacement; preserve primary and rollback errors. |
| Archive / private leaves + aggregate replay | Store owns immutable roots/checkpoints; Host owns quiescence; resolver supplies bounded complete chain. | Publish referenced bytes/checkpoint before next head. No dropped prefix, erased debt/counters or cap enlargement. |
| Runtime / PiRuntime + observations | PiRuntime alone owns exact process/RPC/UI handles; Host admits fenced consequences. | Native settlement, provider usage and effect barrier are distinct. `agent_end` or PID disappearance alone never proves reuse safe. |

The actor names above map to closed branches in `parseActorPayload`/`applyActorEvent`; the implementation names retain their separate kernel parser/reducer. These inventories are review coverage targets, not independent disposition approval.

## 5. H1's missing legacy execution adapter

`actor-model.js:checkAssignment` requires `config.mode === 'actor-pair'`, configured supervisor/implementer IDs and both non-null actor definitions. `workflow-submitted` reaches this gate. A valid `LegacyActorConfigV3` therefore does **not** supply H1's required single-implementer dispatch path.

Keep that actor-pair guard intact. No fake supervisor, forced actor-pair config, direct kernel-write bypass or parallel `state.workers` database. Before legacy cutover, H1-0 must select and independently review a canonical legacy-domain admission amendment (or a separately specified mode-discriminated root under the same owner), with exact identity/grant/replay/archive/projection obligations. This is an H1 integration design gap, not a claim that the current actor-pair gate is itself defective.

## 6. Concrete reviewer startup blocker

Installed `pi-fabric/dist/worker.js` imports `guardFabricWorker` from `/Users/adam2/projects/pi-kiro-acp/dist/src/policy/fabric.js`, calling it before `createRunningRecord`/`writeRunRecord`. Effective non-secret `/Users/adam2/.pi/agent/kiro-acp.json` has `policy.kiroOnly:true`, `models.workerId:'auto'`. The guard rejects non-`kiro-acp/…` selectors, disabled extensions and alternate Claude/Veda runners. Current live `tools.models()` exposes no `kiro-acp` entry. This is a concrete current startup incompatibility matching the previous Astra requests/empty logs; no recovered stderr establishes the cause of every historical failure.

No guard/settings/upstream edit, original-worker fallback, forbidden provider, credential read or identical retry was used. Reload Pi with the configured Kiro provider successfully registered, discover its actual model key, then start a fresh read-only review. Main diagnosis is not independent review.

T09 still needs actual findings/coverage across D1–D6, all symbols/kinds, both D5 branches, Q01, mailbox/late facts/archive carryover, replanning, authority/usage and corrected Evidence paths. T10 then needs finding closure, final source identity, static/package evidence and an accepted H1 handoff. The authorized follow-up below installs the pinned development dependencies and passes TypeScript 5.9.3 without mappings or suppressions; prior TS6 results remain supplemental history. No Host source, live worker, migration, settings Apply, commit or release is introduced.

## 7. Historical preparation checks — before authorized dependency installation

- **PASS:** exact source/package/tsconfig listing hash unchanged; all 24 production JS files protected. No source/config/dependency/test files added or changed.
- **PASS:** all 32 captured type expressions and their line/path locations equal the TypeScript AST; exact six facade/five aggregate signatures remain. This is declaration inventory, not independent validation of all semantics/defaults.
- **PASS:** all 106 original acceptance rows equal Git HEAD byte-for-byte and in order; both candidate owner records retain `branchRevision`.
- **PASS:** eight touched documentation files, 146 resolving local file links and clean whitespace. Links were checked for file existence, not all historical heading anchors.
- **PASS:** registered `npm run pack:check -- --json`, 88 packaged files including both candidates; no test/dependency entries or written tarball.
- **BLOCKED:** `node_modules/.bin/tsc` remains absent. No unchanged compiler check was rerun or dependency installed. Earlier clean supplemental compilation remains attributed to the D5 source snapshot.
- **NOT PERFORMED:** independent source review, ratified freeze, Host implementation/cutover and native/crash verification. No new failed agent launch was necessary after the policy mismatch was identified.

The initial temporary AST visitor had a missing brace; it was corrected before any document was written. One ledger edit had an unnecessary unmatched heading anchor; only that file's witnessed assignment anchor was retried. Neither issue changed source or weakened a gate.

## 8. Authorized pinned-toolchain follow-up

The user approved installation. Initial `npm ci --ignore-scripts --no-audit --no-fund` installed the existing lockfile without changing it. The first registered typecheck found exactly three diagnostics: missing `@earendil-works/pi-tui` at `src/ui.js:75`, then implicit `any` for `render(w)` and `handleInput(data)`. Those parameters already have contextual types from `Component`; the dependency was only nested under the SDK and unavailable to this root-level type-only import.

Correction: add **`@earendil-works/pi-tui: 0.87.1`** to `devDependencies`, matching the installed SDK's TUI, and run `npm install --ignore-scripts --no-audit --no-fund`. No source annotation, `any`, shim, path mapping, suppression, compiler exclusion or `skipLibCheck` change. The manifest changes by exactly one line. The lock adds the direct TUI package and its root-level `get-east-asian-width` and `marked` dependencies; every pre-existing locked package record is deeply equal to its preceding value. All five installed direct dependencies match their exact pins:

| Package | Installed version |
|---|---|
| `@earendil-works/pi-coding-agent` | `0.87.1` |
| `@earendil-works/pi-tui` | `0.87.1` |
| `@modelcontextprotocol/sdk` | `1.30.0` |
| `@types/node` | `24.13.6` |
| `typescript` | `5.9.3` |

**PASS:** `npm run typecheck -- --pretty false`, exit 0, zero diagnostics under the unmodified strict project configuration. **PASS:** registered `npm run pack:check -- --json`, 88 files, no bundled tests/dependencies or written tarball. `node_modules/` is ignored by Git. No automated tests, new test files, native worker or extension load was performed. Lifecycle scripts stayed disabled; native dependency usability and runtime behavior are not certified.

Preservation: all 24 production JS files are unchanged; their ordered checksum-list digest is `c21ff5da515ae6abe1eba79488a5d89e75564252611aa8b4d6061805e7a90010`. Removing only the TUI dev-dependency line restores the original manifest hash `3790b1a1092d06e56f7f9b3eeedeb21dde2b0fba10695eb6a65bcad4d1090ad6`; replacing only its entry in the combined listing restores the previous source/package/tsconfig digest. Current package hash: `81518b1bf8b766ce64e3edcad3abf3cd5aa43d33e56a3e08e4796ebcbfa3af49`. Current lockfile hash: `8dd1dd6aa30fc30bf84cf7658beaa17b53d099a07d0397d348f96d84a0345277`.

This closes the missing pinned-compiler prerequisite only. Independent T09 review, ratified T10 freeze, the H1 legacy-admission decision, Host/runtime implementation and native qualification remain open. Earlier unavailable/compiler-failure statements in historical checkpoints remain historical, not current gate status.
## 9. Ratified freeze — 2026-09-25

**Frozen surface.** The 11 public signatures (six facade, five aggregate with exact arities), active package/config/state/wire versions `0.1.0/2/1/1`, Main tools `pair_dispatch`/`pair_decide`/`pair_inspect`/`pair_status`/`pair_cancel`, Worker `pair_report`, the 32 actor and 27 kernel event namespaces, and all captured bounds/hash domains in §3–§4 are the design of record at the final source identity below.

**Frozen source identity.** Ordered `shasum -a 256 src/*.js package.json tsconfig.json` aggregate: `26096bbaa5a3f7f3f50793724b7ef65bcce11c889afeb3a4c6a8916c2c1ed316`. Changed since the §2 preparation boundary (review corrections, all independently verified): `src/actor-model.js` `02e4bcec…`, `src/actor-runtime.js` `ea9f47f7…`, `src/rpc.js` `40dcac0e…`, `src/worker.js` `24d15419…`. The corrections are part of the frozen surface; no facade/aggregate signature, registration or version changed.

**Gates.** Pinned `npm run typecheck -- --pretty false` exit 0; `npm run pack:check` exit 0 (88 files). Evidence chain: [T09 §6](T09-FOUNDATION-REVIEW-CHECKPOINT.md).

**H1-L decision (design of record).** Legacy single-implementer work is admitted through a *mode-discriminated root under the same Host/Store owner*, not by weakening the actor-pair branch: `checkAssignment` and the actor-pair gate remain strict and unchanged; legacy roots use the H1-0 `root.kind:'held-legacy'`/migration digest domain with their own closed admission requiring a single implementer binding (from `LegacyActorConfigV3`), exact owner/grant/replay/archive/projection obligations and no supervisor synthesis; `projectLegacyWorkerView` remains the read-only projection; Host alone admits canonical consequences. H1-A must make this executable; the H1 review covers it before any cutover.

**Amendment path.** Any later semantic change to a frozen form goes through: written amendment in this document (new §), independent review of the affected stopped source, pinned gates at the new source identity, and re-freeze. No silent drift.

**Explicit non-goals.** This ratification is not native/runtime qualification (P7/N12 remains blocked pending owner authorization), not authorization for live cutover, migration execution, worker launches or settings Apply, and not a claim of power-loss durability or provider compatibility. FR-06 (Host/store/runtime integration) remains open under the H1 ordered slices.

## 10. H1-L corrective design amendment — fresh execution is not held evidence

**Status: selected design for implementation, independently design-reviewed; NOT an executable-contract freeze or cutover approval.** The user authorized H1 repair, independent re-review, H1-B/C integration and disposable runtime qualification. Kimi's wrapper proposal was independently reviewed by Astra (`fef700f5c9b14963a75ce1aca86c40ad`). The verdict was to block that proposal as written and select a distinct fresh executable branch. This section supersedes only §9's instruction to admit executable legacy work through `root.kind:'held-legacy'` using `LegacyActorConfigV3`. The foundation signatures, actor-pair gate and inert held-evidence semantics stay frozen.

### Closed root boundary

| HEAD root kind | Canonical digest domain | Payload contract | Admission |
|---|---|---|---|
| `actor` | `state` | Existing `ActorStateV2` | Existing actor-pair rules, unchanged |
| `held-legacy` | `migration` | Existing `HeldLegacyEvidenceV2` | Permanently non-authorizing |
| `legacy-fresh` | `migration` | New closed `LegacyExecutionRootV2`, distinct encoding and validator | Explicit fresh-only single-implementer admission |

The new kind is not accepted by Store until its complete executable validators and Host consumers have passed stopped-source review. A kind tag or caller-supplied receipt cannot widen admission. No held-to-fresh conversion, supervisor synthesis, reconstructed historical attempts or automatic migration is permitted.

### Fresh creation and active configuration

Fresh genesis requires explicit complete absent/new classification, canonical workspace/store ownership, no legacy input, no orphaned staging/artifacts, no unresolved workspace occupancy, and verified publication of the first root before any effect. Missing HEAD alone is insufficient. A genuinely fresh root requires no fabricated evidence or backup.

The new branch uses a named, closed admission binding to a fully validated active Config V2 snapshot and its canonical digest, not a claimed Config V3 conversion. Preserve every configured identity (up to eight); exactly one selected implementer may be admitted. Resolve and validate provider/model, effective runtime/extensions, workspace, permission, policy, evidence and verification bindings from actual configuration and observations. Unsupported profiles reject before effects. Config V3 remains future and the existing actor-pair gate remains unchanged.

### Required execution and replay contracts

Every operation-specific reservation binds exact owner, branch, generation, configuration, expected root revision and workspace, plus immutable payload/source and operation identity. The closed operation set must cover spawn, authority/control/prompt/notice delivery, report acceptance, per-command verification, archive and containment. Sends bind recipient, exact content/hash, command/activation and deadline; verification binds each command to source/run/workspace evidence.

ACK, recipient acceptance, start, native settlement and effect settlement are independent provenance-bearing facts, not one success status or arbitrary JSON. Unknown delivery cannot license resend. Native exit alone cannot release admitted-effect debt. Local revoke precedes every await on cancellation; persistence failure does not prevent exact-owned-runtime containment and both failures must be retained.

Define closed control, event, mailbox, accounting and obligation forms with deterministic committed-prefix validation. Replay reconstructs facts, never re-executes effects. Archives/checkpoints must preserve reservations, deduplication, counters, late facts and unresolved obligations. Until archive publication/replay exists, rotation rejects without truncation; that restriction is safe but does not close H1-C archive acceptance. The existing held projection remains unchanged; fresh executable state requires its own read-only projection.

### Review and activation gates

H1-A/D repairs and independent re-review remain first. Implement the new branch and H1-B behind the closed public gate; independently review its exact schemas, validators and consumers, then run pinned gates and record the new source inventory before re-freezing. Coordinate all readers/writers and reject incompatible peers before activating H1-C. No partial active config/wire version bump is authorized by this design.

Qualification must distinguish genuinely fresh stores from retained/orphaned input; preserve eight slots with one admission; prove held roots remain inert; exercise verification reservations, independent delivery/settlement observations, restart/archive obligation carryover and incompatible-reader rejection. Disposable local checks do not certify power loss, all filesystems or provider compatibility. Current results and remaining gates belong to [the H1 execution ledger](H1-EXECUTION-LEDGER.md).




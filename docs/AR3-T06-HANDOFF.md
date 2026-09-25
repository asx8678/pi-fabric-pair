# AR3-T06 — Leaf facade and kernel/model handoff

**Status: T01–06 accepted. Independent T06 reviewer `94c9d2b5ab9d4ccfb29b9b770fec07cf` ACCEPTED the facade and concrete handoff with no corrections.** Main reconfirms all reviewed hashes and the static checkpoint. This unlocks T07, followed sequentially by T08 with the same DeepSeek/Zro model owner; it does not implement either task, activate runtime or complete the AR-03 freeze. See [task ledger](AR-03-AGENT-TASKS.md), [shared ABI](AR3-T01-INTERFACE.md), [D1–D6](AR3-01-DECISIONS.md), and [testing policy](TESTING.md).

## 1. Acceptance ledger and public boundary

`src/actor-contracts.js` contains only three direct re-export declarations. It preserves the actual leaf functions, with no adapter that could omit `expected`, reset a budget or replace a validated result.

| Exact runtime export | Required signature | Implementation |
|---|---|---|
| `validateActorConfigV3` | `(value: unknown): ActorConfigV3` | `actor-config-contracts.js:41` |
| `validateActorRecordV2` | `(value: unknown): ActorRecordV2` | `actor-record-contracts.js:940` |
| `validateWorkflowRecordV2` | `(value: unknown): WorkflowRecordV2` | `actor-record-contracts.js:948` |
| `validateActivationRecordV2` | `(value: unknown): ActivationRecordV2` | `actor-record-contracts.js:956` |
| `validateMailboxEnvelopeV2` | `(value: unknown): MailboxEnvelopeV2` | `actor-wire-contracts.js:550` |
| `validateActorControlV2` | `(value: unknown, expected: ActorControlBinding): ActorControlV2` | `actor-wire-contracts.js:540` |

No default export, wildcard, migration/context/digest export, aggregate export or Pi registration. Concrete readonly return types resolve through the re-exports. Expected binding remains required at runtime and in the type signature; it is validated as untrusted data, not inferred from the control being admitted.

| Acceptance check | Evidence |
|---|---|
| T02 four findings closed | Independent Astra `3c0fdb33245348a58b8a77028dcc68a5`: ACCEPT for the actual constructor/adapter; no corrective source edits. Main rechecked unchanged reviewed hashes. |
| Exact facade inventory/signatures | TypeScript AST/checker resolves exactly the six names above, five one-argument functions and one required two-argument function, with concrete return types. |
| Pure acyclic dependency graph | Facade → config/records/wire → common and existing contract/observation leaves; private migration → common/contracts. No cycle or incoming production-module import of any new contract module. |
| Source preservation | All five accepted module hashes unchanged. Protected 21-file digest remains `deba92ae02fec0045b1aafbdee69cd9ea73f5cca5b507c4fdb0197a475a25f42`. No active consumer, package/config/state/wire/default/schema/example/guard change. |
| Syntax / whitespace | All six new contract modules pass `node --check`; `git diff --check` passes. No ESM module load. |
| Required full project compiler | `npm run typecheck -- --pretty false` fails: `tsc: command not found`; pinned 5.9.3 is unavailable. No install or config narrowing. |
| Supplemental full-source compiler | Existing config, TS 6.0.3 with documented dependency-resolution overrides: **23 roots / 350 baseline source diagnostics / zero all six contract modules / zero dependency-global**. Exit 2, not a project pass. |
| Independent T06 integration gate | ACCEPT: Astra `94c9d2b5ab9d4ccfb29b9b770fec07cf` passes exports, signatures, graph/isolation, schema/handoff and scope. No required corrections. T07 is unlocked, not implemented. |

Frozen source SHA-256:

```text
actor-contracts.js           041bd32dd90a26f59e895e6267d7a04f11dd7dfc58a66bf9f1bd60abe86da647
actor-contract-common.js     3dea650b3dd8b67b33d5830758b69978cc1c226cdc37df65ac03834f8c951db4
actor-config-contracts.js    5a826428c72fe412dedcd9b239b3f3b67562bb061bed48301ca6cdcb82ee0ce2
actor-record-contracts.js    44e168a8048e3d35b70d2d220bbb3305842ad15a26b02037de5c448bee0d66ff
actor-wire-contracts.js      f581e32d8cc6e7e12763b868eb73cd13bf04a9794894c455420e66de9b07dd20
actor-migration-contracts.js b9ddbb32666287074066a3465a4b994b8a816dc8b6f9c2d864aa1cac12115f03
```

Common has 69 runtime exports. Removing only its closed Config V3 addition restores accepted 68-helper SHA `de1a7d18529ef7e59752e8e23d565c0fda953fc91e025a0a0e3ae4d8a17bbcb4`; no accepted helper body was changed. Individual leaf counts remain config 1, records 3, wire 2 and migration 5.

## 2. Operation budget and config handoff

The facade is a standalone-leaf API, not aggregate admission. T08 owns one operation budget over the root, context, references and derived representations; calling individually bounded public leaves is not proof of a bounded aggregate. Do not reset budgets, grant content-equality credit to separately supplied copies or re-hash original bytes unnecessarily.

For aggregate config use **`validateActorConfigV3InContext(value, context)`** from common with the same registered context. It captures once and performs one closed reconciliation; public `validateActorConfigV3` deliberately creates its own standalone context. Use common encoding/digests on their checked results in that same context. Do not wrap public normalizers in a second reconciliation. Existing historical assignment validation requires complete fields and never applies present config defaults.

Config keeps the full legacy policy/limits/evidence/verification/resources inventory, preview semantics and normalized requirements-alias equality. Actor-pair alone emits fixed `capacity:{maxResidentActors:2,maxActiveModelCalls:2,maxActiveActivationsPerActor:1}` and `idlePolicy:{idleTimeoutMs:600000,retainDuringUnresolvedWorkflow:true}`. Include every normalized field in config hashes; no live capacity, timer, readiness or permission follows from these values.

## 3. Exact expected peer and reviewer contracts

These are **existing accepted leaf types**, not new kernel event schemas. All records are closed. `Id`, bounded text, lowercase SHA-256 hash and safe-integer constraints remain those of common. Unknown identities are never invented.

```text
OwnerBinding = {ownerSession, ownerEpoch, branchRevision}
ActorBinding = {actorId, role, ownerSession, ownerEpoch, generation,
                sessionId, model: text|null}
ArtifactRef = {ref: bounded-text, hash: Hash}
ActorControlBinding = {
  wireVersion: 2, owner: OwnerBinding, actor: ActorBinding,
  nonce, operationId, profile, workflowId: Id|null,
  workflowRevision: Id|null, activationId: Id|null,
  identity: Identity|null, inputHash: Hash,
  grantProof: GrantCommitProofV2|null
}
GrantCommitProofV2 = {
  storeId, rootRevision: integer>=1, rootHash,
  grantOperationId, authorityHash, owner, actor, profile, nonce,
  workflowId, workflowRevision, activationId, identity: Identity|null
}
ReviewerWitness = {
  actor: ActorBinding, profile: 'supervisor-restricted',
  workflowId, workflowRevision, activationId,
  intentId, intentHash, operationId,
  settlement: {observationId, at: nonnegative-safe-integer},
  reportId, reportHash, checkpointHash,
  request: ArtifactRef, reply: ArtifactRef, receipt: ArtifactRef
}
```

Source: `actor-contract-common.js:54–85,963–1042` and `actor-wire-contracts.js:519–545`. Owner/participant session and epoch agree; workflow ID/revision are paired; activation requires workflow. A supervisor has no implementer identity/lease and uses the restricted profile. Active implementers require their own matching fence/identity; proof fields must agree with the enclosing binding. No digest establishes publication/provenance.

`ReviewerWitness.actor.role` is `supervisor`. `intentHash` is the retained supervisor intent's immutable T04 control-input hash. For a retained V1 report, `reportHash` is the original report envelope's **payloadHash**, not its byte hash or a V2 wrapper hash. `checkpointHash` is the finalized kernel checkpoint. Settlement names an actual producing-activation observation; there is no invented settlement hash. The witness digest covers the whole closed value in the `inspection` domain.

### Inspection references are not logical IDs

Source: `actor-wire-contracts.js:70–78,293–336`. Each artifact is `{content,digest}`, where digest is `pairDigest('inspection', content, context)`. Common binding fields on all three contents are:

```text
actor, profile:'supervisor-restricted', workflowId, workflowRevision,
activationId, intentId, intentHash, operationId,
reportId, reportHash, checkpointHash, scope
```

`scope` is `{kind:'all'|'summary'|'patch'|'verification'}` or `{kind:'file',path}`. Contents then add exactly:

| Kind | Additional fields (all required) |
|---|---|
| `inspection-request` | `version:2, kind, requestId, deadline:{admissionAt,expiresAt}` |
| `inspection-reply` | `version:2, kind, requestId, replyId, request:ArtifactRef, requestBytes, evidence:PayloadRefV2[], at` |
| `inspection-receipt` | `version:2, kind, requestId, replyId, receiptId, request:ArtifactRef, requestBytes, reply:ArtifactRef, replyBytes, delivery:{observationId,at}` |

`PayloadRefV2` is `{artifact:ArtifactRef, byteLength, encoding:'pair-json/1'|'pair-json-v1/1'|'bytes', hashDomain:'bytes'|'authority'|'mailbox'|'inspection'|'actor-event'|'control'}`. Byte counts and digest domains are distinct: inspection artifact refs name content digests, not text byte hashes. Request/reply/receipt IDs and artifacts are distinct. Intent is earlier content, not a self-referential inspection hash.

T08 must resolve all three refs to retained checked artifacts at the correct earlier prefixes, match their whole reviewer/activation/intent/workflow/report/checkpoint/scope chain and logical IDs, and prove producing settlement before decision application. Only the resolved content supplies kernel `requestId`, `replyId`, `receiptId`. Never cast `ArtifactRef.ref` to an ID, fabricate missing IDs, conflate receipt delivery with run/effect settlement or treat a caller's `verified` flag as evidence. Receipt observation and later producing settlement are separate facts; do not require a future settlement merely to retain an earlier inspection receipt.

## 4. Exact archive-context handoff

Use private `validateArchiveValidationContext(value, context?)` from migration with the aggregate's registered budget. Its public data type `ArchiveValidationContext` is distinct from the internal accounting handle `ValidationContext`.

```text
ArchiveRefV2 = {storeId, segmentId, originalHash, byteLength,
                priorRoot: Id|null}
LegacyByteRefV2 = {ref, hash, byteLength}
ArchiveValidationContext =
  {version:2, kind:'empty', storeId, head:null, segments:[], artifacts:[]}
  | {version:2, kind:'chain', storeId, head:ArchiveRefV2,
     segments:[ArchiveSegmentV2, ...], artifacts:ArchiveResolvedArtifactV2[]}
ArchiveSegmentV2 = {reference:ArchiveRefV2, checkpoint:ArchiveCheckpointV2,
                    original: exact-UTF8-text, decoded:ArchiveReplayInputV2}
ArchiveResolvedArtifactV2 = {reference:LegacyByteRefV2, original:exact-UTF8-text}
ArchiveCheckpointV2 = {
  version:2, encoding:'pair-archive-checkpoint/1', nonAuthorizing:true,
  archive:ArchiveRefV2, rootHash, rootRevision, nextSegmentId,
  owner:OwnerBinding, actors:ActorBinding[], counters:ArchiveCountersV2,
  dispositions:ArchiveDispositionV2[], artifacts:LegacyByteRefV2[],
  obligations:RetainedObligationRefV2[]
}
ArchiveReplayInputV2 = {
  version:2, encoding:'pair-actor-state/1', segmentId,
  genesis:{storeId, initialOwner, actorDefinitions, configSnapshot,
           heldLegacyRefs, checkpoint:ArchiveCheckpointV2|null},
  events:ArchiveReplayEventInputV2[], archiveHead:ArchiveRefV2|null
}
ArchiveReplayEventInputV2 = {
  eventId, sequence, at, owner, workflowId:Id|null,
  domain:'actor'|'implementation', payload:JSONRecord
}
```

Exact subordinate types and validators: `actor-migration-contracts.js:41–81,429–605`. Counters are `events,operations,activations,reports,inputTokens,outputTokens,costUsd`. A disposition is `{operationId,outcome:'completed'|'cancelled'|'failed'|'reconciled',receipt:ArtifactRef}`. Retained obligations contain `obligationId,kind,sourcePath,subject,visibility:{inspect,cancel,reconcile}`, plus `status:'pending'|'uncertain',resolution:null` or `status:'resolved',resolution:ArtifactRef`; visibility entries and subject are ArtifactRefs. Kinds are question/review/blocker/cancellation/activation.

The chain is oldest-first from an explicit null predecessor, bounded and internally checked for raw bytes/decoded hashes, root revisions, rotation, unique identities, retained artifact coverage and obligation visibility. Every explicit representation pays. `priorRoot` is a prior segment ID, not a root hash. These leaves intentionally leave `configSnapshot` and domain payloads as bounded replay inputs, **not validated Config V3 or admitted actor events**.

T08 must validate those domains/config snapshots, replay every prefix, verify resulting counters/participants/obligations and bind the current root's store, segment, archive head and genesis checkpoint to the supplied chain. Host later proves source provenance and actual durable publication/adoption. Migration/held-legacy helpers additionally require separately supplied original source and backup inputs; a classifier DTO, UTF-8 text or matching hash is never a durable binary backup. Full legacy projection remains T08, not this facade.

## 5. Sequential kernel/model ownership

T06 and T07 remain accepted. Main verified Astra R1C's six focused corrections at `89974e46…`, with 0 owned diagnostics and unchanged baseline/frozen/protected hashes. This is a baseline, not full T08 acceptance. The user authorized the next [R2 historical-prefix/producer stage](AR3-T08-R2-PLAN.md); use the [live task ledger](AR-03-AGENT-TASKS.md) for its current owner/status. Main owns shared/docs/static checks; six contracts and kernel stay frozen. No concurrent writer/reviewer, T09 start or runtime activation.

### T07 accepted for aggregate handoff

Accepted `coordination.js` SHA `ccd59af0d175158c209f8dbcb4d34dda6a034c35bedf3d0ea8942d13fd703b81`; transitions unchanged. The closed 14-field receipt link excludes settlement and now uses accepted strict actor/artifact validators. Supervisor decisions require the full witness, nonempty matching retained evidence and a known model; new receipt retention checks original report payload hash and intrinsic inspection relationships. All five findings are closed. The [accepted kernel handoff](AR3-T07-HANDOFF.md) supersedes candidate wording and pins exact schemas, narrow error handling, review evidence and T08's remaining content/prefix/current-mapping/budget obligations.

On the final accepted kernel Main confirmed syntax/whitespace, all six frozen contract hashes, protected 19-file digest, unchanged transitions, exact 27 kinds and three kernel exports. Inverting only the final F2 import/four calls/comment exactly restored independently reviewed `b252070b…`. That T07 checkpoint's full existing-config supplemental TS6.0.3 was 23 roots/350 baseline source diagnostics/zero kernel, contracts or dependency-global; sorted diagnostic SHA `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. T08 owned diagnostics progressed from 19 on `70ed005e…`, to 4 on R1/R1B `3d581a2e…`, to 0 on Astra R1C `89974e46…`. Main confirmed current 24 roots/350 unchanged source diagnostics/zero dependency-global, exact five exports/no consumer/cycle and unchanged frozen/protected hashes. Inverting R1C's 24 logged replacements restores `3d581a2e…` exactly. Six focused corrections are verified; full T08 semantics remain open. [Current evidence](AR3-T08-FINDINGS.md). No passing full build or runtime qualification.

### Pre-T07 preservation checkpoint

Main reconfirmed all six accepted module hashes after T06 review. The concurrent wire-change notification was checked: its hash still equals the accepted `f581e32d…`, not a new source delta. Before authorized kernel edits:

- `coordination.js`: `eab97ce71540df9adc0157b40dc6385402ba354de53930e311e47990aaaea854`.
- `transitions.js`: `03b01e30eb80a09df69c3b1da65adad20cd87d4f6c6063c3340e60d874d3c982`.
- Original 21-file digest remains `deba92ae02fec0045b1aafbdee69cd9ea73f5cca5b507c4fdb0197a475a25f42` at this checkpoint. T07 intentionally opens only those two kernel files, not the whole protection set.
- The remaining **19 files** hash to `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`: `src/{actor-runtime,config,contracts,controller,evidence,extension,main,metrics,native,observations,rpc,schema,ui,util,worker}.js`, plus `package.json`, `package-lock.json`, `tsconfig.json`, `fabric-pair.example.json`. Same sorted relative-path + NUL + bytes + NUL digest recipe.
- AST `KINDS` remains 27 names in its existing order; SHA-256 of `JSON.stringify(kinds)` is `1aac920310d3a6a9f84bd669052f9228e677234fe94d560215f3c6941dff7f79`.
- Full existing-config supplemental TS6.0.3: 23 roots, 350 source diagnostics, zero each kernel module and zero dependency-global. Sorted source diagnostics (`{file:relativePath,start,code,message:flattenedWithSpaces}`, sorted by serialized value using `localeCompare`) have JSON SHA-256 `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. This is an attribution baseline, not a passing build.

### Kernel/model execution requirements

Pre-T07 source seams (baseline `eab97ce7…`, not current candidate line numbers): `coordination.js:299,301` parses existing receipt/decision shapes; `approvalReady`/`decisionReady` at `482,517–532` gates Main review; replay at `869–885` retains evidence and decision intent; commitment rechecks readiness. `transitions.js` delegates validation/replay and catches expected kernel errors, not arbitrary programming errors.

T07 adds closed activation-bound receipt linkage and a distinct `supervisor-control` decision branch using these accepted schemas. Keep the existing Main branch and role/owner predicates intact; do not relabel a supervisor as Main or let one activation reuse another's receipt. Bind original report/checkpoint, actual resolved inspection IDs, retained intent and producing settlement; prove intrinsic/kernel-prefix relationships there and actor-domain histories in T08. New branch types and readiness must be implemented together, without a second mutable registry or opaque trust flag. If a missing private helper is genuinely needed, report its concrete ABI dependency to Main rather than editing frozen leaf files.

Preserve all **27 kind names**, the 24 reused families, inactive automatic actions, absorbing closed grants, Main source rules, independent early report/run versus ACK facts, immutable lifetime/per-step accounting and expected-error behavior. Supervisor usage remains actor-domain usage, never fabricated implementer usage. T08 still must implement the five selected aggregate exports and atomic `nonAuthorizing:true` outcomes, full prefix replay, lifetime/step ledgers, holds/obligations, mailbox epochs/fairness/capacity and read-only legacy projections.

No tests, probes, fixtures, generated check scripts, installs, ESM loads, workers, runtime activation, version changes or live configuration. Static/source acceptance does not measure runtime/native regression risk or complete AR3-04/05 and the AR-04 handoff.

# T01 common ABI correction gate

**Status: T01 common implementation and `ar3-common-abi/2` handoff ACCEPTED; complete AR-03 format freeze remains open.** The rejected-candidate history below is preserved as evidence, not current gate status. T02–05 are now unblocked. Governing [task cards](AR-03-AGENT-TASKS.md), [selected D1–D6](AR3-01-DECISIONS.md) and [no-tests policy](TESTING.md) apply.

## Rejected-candidate and recovery chronology (historical)

- Candidate writer: DeepSeek/Zro `2a5aa2940f70432ca91775e0e3b482e6`; candidate `src/actor-contract-common.js`, SHA-256 `011d41afd0694a0d83ff254e1133a4eed735e64715bebad5a509686ef84c9b7b`.
- Independent Astra code review: `98bb8f52a57344d79bcc5d964891b309`, terminal completed, **BLOCKED**. Scope-only review `5f966af6b0b74b9e9a2170dd51a39e63` passed architecture/ownership, not source.
- Main also read the implementation and witnessed its input/context/error/hash defects. Pinned typecheck: `tsc` unavailable. Full supplemental TS 6.0.3: 18 roots, 351 source / 0 dependency diagnostics; one new TS8024 at the nonexistent `isReservedId` JSDoc `path` parameter. Pre-existing 350 remain.
- DeepSeek corrective run `56d4adfde546491db2606b9602fc69f6` ended incomplete after replacing the candidate with a 69-line fragment, SHA-256 `5b3229639b85ba961056a45c0e5a192aafa0603b20461ee69d85f88e437d44f4`. Its terminal response did not deliver a completed correction. A syntax exit 0 did not detect the missing implementation; mechanical source inspection did. No source acceptance.
- Main disclosed recovery/integration on Astra. Single current recovery writer: `openai-codex/gpt-6-astra`, run `1aec840b2282457e979292b11c45e278`, only `src/actor-contract-common.js`. Main owns documents and old-source integration. No concurrent writer. A separate fresh Astra reviewer must check its completed candidate; the recovering writer does not independently approve itself.
- DeepSeek T02–05 writers remain unlaunched. Only T01 recovery proceeds; no parallel whole-workflow retry. Original 21 production/config/tooling files and original 106 requirement rows matched their protected digests before recovery; the new module remains unconsumed by runtime.
- Two read-only DeepSeek inventories were attempted: `5cacbd2029664514a6446576e76ef3fa` returned an incomplete report; `42c1ea936e0b479296c68bc3eeb77972` returned inconsistent/repetitive proposals. Neither establishes an accepted ABI. Main instead inspected `config.js` defaults/validation, concrete contracts and kernel parsers directly.

## Recovery and acceptance checkpoint

Astra recovery delivered 919 lines and 67 actual runtime helper exports in `src/actor-contract-common.js`, SHA-256 `5f424493ea826fffee1000e2f61cf47b2add9778690291ed67f69e1cb84640d0`. Main read the full validation/schema path and independently confirmed: no syntax/owned whitespace diagnostics; imports only `node:crypto`, `node:util`, `./observations.js`; all 21 protected files and original 106-row section unchanged; package dry-run includes the common module (41 files, no bundles); full supplemental TS 6.0.3 checks 18 roots with 350 existing source / 0 dependency / 0 common diagnostics, exit 2. The pinned compiler remains unavailable; this is not a passing project compiler gate.

Fresh independent read-only Astra review `db2a348bb148423e9b8155b406cd20cd` completed with **BLOCKED**: the prior P1 defects were source-witnessed closed, but concrete validator outputs lost their private checked-input association and caused duplicate budget charges; the legacy decoder also incorrectly inherited V2 duplicate-key rejection; and the reviewer vocabulary needed an explicit mapping. Main corrected legacy duplicate parsing (charge all input occurrences, last value wins without moving the first key), required nonempty effective assignment cwd, and ratified the reviewer table below. Astra budget correction `19672d80d0874ad98c8ce324e89a8e55` delivered private `derived`/`validated` reconciliation and updated all concrete-validator, normalization, projection and carrier pipelines. Main inspected those paths and independently verified corrected SHA-256 `5878648e1d670095090c6f6bcf5c74a7e5e8ce4b8a342c7b659c8c63c17556a2`: 67 runtime exports, unchanged imports, no syntax/owned-whitespace errors, the same protected 21-file and original requirement-section digests. Supplemental TS 6.0.3 again reports 18 roots, 350 existing source diagnostics, zero common/dependency/global diagnostics (exit 2). Pinned compiler and behavioral qualification remain unavailable. Fresh independent targeted review `fbc7a6394e724d22b80180654470779b` completed **ACCEPT for the T02–05 source handoff**, with no corrective findings. Main’s static/preservation checks above satisfy its remaining condition. T01 is accepted at the corrected SHA; behavioral/native qualification and the full-project compiler gate are not passed. No dependent leaf writer has started. Structural Contour output was advisory across the entire dirty worktree; its complexity exposure and partial graph resolution do not certify this module.

## Initial review findings — closed at the accepted checkpoint

| # | Source finding | Required correction / acceptance |
|---|---|---|
| 1 | `ensureInert` skips validation for any supplied context | Private aggregate budget plus actual checked-input association. A fresh/unrelated/forged context never authorizes reads or skips validation of newly supplied data. |
| 2 | Proxy, nonenumerable and extra-array properties bypass checks | Reject proxies before reflection; descriptor-first inspection of all own keys; no supplied getter/method/toJSON execution. Reject holes, symbols, extra array properties and non-JSON hidden fields. |
| 3 | `{}` assignment loses `__proto__` fields or changes output prototype | Use own data properties or null-prototype output; preserve and freeze all retained data. |
| 4 | Bounds omit keys/encoding overhead and accept unbounded options | Check finite safe options within D3 caps; exact canonical UTF-8 byte accounting, including keys/escapes/punctuation/numbers, before oversized allocation; one aggregate budget for reference decode/shape/copy/hash work. No subtree reset. Deadline overrides cannot exceed D3. |
| 5 | All thrown values become expected contract errors | Import/recognize actual `UsageValidationError`; adapt only known validation failures. Unexpected errors escape unchanged. |
| 6 | Raw-text hash is mislabeled legacy payload hash; new surrogate restriction breaks V1 | Preserve lossless original JSON text; distinguish exact original-byte SHA-256, V1 `JSON.stringify(decodedOriginal)` payload hash, and canonical V2 wrapper hash. Separate V1-compatible inert/parser path, including bounded duplicate-member last-value/first-key-order semantics of the current JSON.parse reader; V2 still rejects duplicate keys. Provide bounded arbitrary-byte hashing including corrupt/non-UTF-8 data. Reject BOM consistently at V2 string/byte entries. |
| 7 | Control/reviewer closed types omit required identities | Implement the exact intrinsic bindings below; leave actual provenance and prior-prefix proof to Host/model, not a boolean. |
| 8 | Assignment schema/default mapping/preimages deferred to later competing writers | Implement concrete common definitions/snapshot types/validators and explicit shared projections below before fan-out. Generic hash primitives do not complete later wire/artifact schemas. |

The stale JSDoc parameter must also be removed. Syntax alone and worker completion do not close these findings. No behavioral tests/probes are authorized; retain that qualification limit.

## Ratified shared schema: `ar3-common-abi/2`

These are internal pure types/validators, not additional Pi tool registrations. Keep the six public facade and five public model signatures unchanged. The corrective source must supply an exact export/signature inventory before acceptance.

### Namespaces and role definitions

- Existing kernel-compatible `OwnerBinding`, seven-field `ActorBinding`, `Fence`, `Identity` retain their current shapes. Config/budget/accounting/workflow/branch revision values are logical string IDs; plan/attempt/generation/owner-epoch counters are safe integers. Existing lease tokens remain up to 128 characters; new logical IDs remain at most 80.
- `ActorDefinitionV3` exact fields: `id`, `role: supervisor|implementer`, `provider`, `model`, `effort`, `cwd`, `extensionProfile`, `readOnly`. Effort uses the existing six levels. `cwd` is nullable. Provider/model may be empty only as unselected preview data; a definition does not establish readiness.
- Supervisor profile is `supervisor-restricted` with `readOnly:true`; implementer profile is `worker-native`, with legacy `readOnly` preserved as data. Representation does not qualify an unsupported native profile or relax existing readiness checks.
- `WorkerRequirements`: exact booleans `fabric`, `fovea`, `prewalkDisabled`, `autoCompaction`.
- `WorkerResources`: exact `commandArgs`, `extraExtensions`, `extraSkills` arrays and `inheritExtensions` boolean. `SupervisorResources` has the same keys but empty arrays and `inheritExtensions:false`. Host-generated restricted bridge arguments are not user-supplied resources.

### Concrete immutable assignment

`AssignmentSnapshotV2` exact required fields:

```text
configRevision, configHash,
policy, limits, verification, evidence, workerRequirements,
participants: { supervisor: ActorDefinitionV3|null, implementer: ActorDefinitionV3 },
workerResources, supervisorResources,
workspace: { cwd, repoRoot, allowedPaths: string[] },
assignedAt, deadline, budgetRevision, budgetHash
```

- `policy`, `limits`, `verification` are concrete current `TaskPolicy`, `TaskLimits`, `VerificationPolicy` shapes and semantics, not opaque dictionaries. Preserve required final review and all supported policy/deferred fields; no adaptive mode.
- `evidence` is exactly positive-safe-integer `maxFiles`, `maxTotalBytes`, `maxArtifactBytes`.
- Every stored snapshot field is required; no missing historical field is filled from current defaults. `workspace.cwd` is a nonempty effective assignment directory, not null or deferred inheritance; only config actor definitions allow nullable preview cwd. Selected workflow participants require nonempty provider/model, unlike config preview. Participant IDs/roles are distinct; null supervisor represents legacy operation only, with mode agreement checked by the aggregate/config consumer.
- `assignedAt` is a nonnegative safe integer. Under current positive `taskTimeoutMs` policy, `deadline` equals checked `assignedAt + limits.taskTimeoutMs`; overflow rejects. Do not add null timeouts as a new product feature. Workflow deadline and task/active-step clocks remain different scopes.
- Budget hash preimage is exactly `pairDigest('state', {budgetRevision, policy, limits, assignedAt, deadline})`. It excludes its own hash and never erases prior spending. Config hash references the complete normalized config; intrinsic snapshot validation cannot prove correspondence without the config/history.
- `projectKernelAssignment(snapshot)` returns exactly `{configRevision, configHash, policy, limits, verification}`. It is derived, not a second writable snapshot.

### Defaults, aliases and preimages

Common pure constants/normalizers for the shared policy/limits/verification/evidence/requirements/resource groups reproduce current `config.js:DEFAULTS` values without importing its filesystem-bearing module. Future Config V3 normalization applies them **before** `pairDigest('config', normalizedConfigV3)`; stored snapshots do not normalize defaults. Normalize `final` to `final-only`, `strict` to `every-step`; arrays replace, not merge. New mode/actor/workflow fields remain explicit until T02 implements their complete contract; no actor activation follows from preview.

“Six deferred limits” is historical shorthand, not permission to omit actual fields: retain `activeStepTimeoutMs`, both queue capacities, both report bounds, both automatic-action allowances, and policy `maxRevisionsPerStep`, alongside the other current fields. Null spending caps, zero queue/action allowances and positive timeouts keep their distinct semantics.

### Intrinsic control, proof and reviewer bindings

Keep `ActorControlBinding`'s existing `wireVersion`, `owner`, `actor`, `nonce`, `operationId` and add:

```text
profile,
workflowId: Id|null, workflowRevision: Id|null,
activationId: Id|null,
identity: Identity|null,
inputHash: Hash,
grantProof: GrantCommitProofV2|null
```

`wireVersion` is literally 2. `actor` is the participant peer; `owner` names Main. Workflow ID/revision are both null or both present; activation requires workflow. Implementer identity matches its actor/fence; active implementer requires identity. Supervisor has no implementation identity/lease. Profile matches participant role. T04 supplies the final closed per-kind wire unions and decides which null observation/handshake cases are admissible; the common comparator does not grant authority.

`GrantCommitProofV2` exact fields:

```text
storeId, rootRevision:number>=1, rootHash,
grantOperationId, authorityHash,
owner, actor, profile, nonce,
workflowId, workflowRevision, activationId,
identity: Identity|null
```

Shared fields must agree with an enclosing binding where present. Supervisor identity is null; implementer identity is required. Root/authority hashes refer to immutable earlier content; no self-referential artifact hash. Actual root publication/provenance/current lifecycle checks remain later Host responsibilities.

### Exact ReviewerWitness vocabulary and kernel mapping

Main ratifies this complete closed shape from the recovered source, replacing the ambiguous rejected-candidate phrase “retains its existing fields”:

```text
actor: ActorBinding,
profile: 'supervisor-restricted',
workflowId: Id, workflowRevision: Id, activationId: Id,
intentId: Id, intentHash: Hash, operationId: Id,
settlement: {observationId: Id, at: nonnegative-safe-integer},
reportId: Id, reportHash: Hash, checkpointHash: Hash,
request: ArtifactRef, reply: ArtifactRef, receipt: ArtifactRef
```

`actor.role` must be `supervisor`. `intentId` names the retained supervisor intent; `intentHash` is its frozen T04 immutable control-input digest. `operationId` names the associated control/review operation. For a retained V1 report, `reportHash` means the original envelope's **payloadHash**, not the original JSON byte hash or a new V2 wrapper digest; `reportId` and the actor/workflow/activation mapping bind the producer. `checkpointHash` is the exact finalized checkpoint used by the existing kernel.

Each `ArtifactRef` is exactly `{ref: bounded-text, hash: Hash}`. These are references to immutable inspection artifacts, **not interchangeable with logical IDs**. T04 defines their closed request/reply/receipt content and digest domains. T08 resolves them against checked retained artifacts and historical prefixes: the request yields `requestId`; the reply yields its `replyId` and matching `requestId`; the receipt yields `receiptId` and matching `requestId`/`replyId`, reviewer activation, evidence scope and report/checkpoint bindings. Only then does T07's checked adapter populate the kernel's existing receipt ID fields. Never cast a file path/ref string to an ID, invent missing IDs, or accept a mere “verified” flag.

The settlement remains an identified observation, with no invented settlement hash. T08 must prove its producing-activation relationship and prior-prefix existence. This common leaf validates intrinsic structure only; no artifact resolution or authentication is claimed. Legacy Main receipt/review remains the existing kernel branch.

Keep the current minimal `ArchiveReferenceV2` fields (`storeId`, `segmentId`, `originalHash`, `byteLength`, nullable `priorRoot` ID). T05 must supply full context/hash/revision/chain proof; this common reference alone does not claim it.

### Scope of common hash projections

- Reviewer witness: inspection-domain digest of the complete closed immutable witness.
- Grant proof: authority-domain digest of the closed **proof value**, not a claim to define the future full authority-file hash. Its `authorityHash` is a reference to separate content; never its own digest.
- Archive reference: archive-domain digest of all closed reference fields, not the whole archive file.
- Control identity projection excludes only `inputHash`; T04 defines final immutable control-input preimage from this identity, closed kind/payload and immutable deadline. These low-level primitives must not advertise completed wire admission or hash arbitrary fields as if a final contract had validated them.
- All final artifact/reader/writer preimages still require T04/T06/T10 integration and freeze. Required shared projections above must already be real code before the four writers launch.

## Actual private-module handoff inventory

Mechanically extracted from the corrected candidate (67 runtime exports); this is not a claim that the six facade or five model exports already exist. Concrete readonly return types and exact discriminants are in `src/actor-contract-common.js` JSDoc; use `import('./actor-contract-common.js').TypeName`, not guessed `expect*` helpers. `BudgetState`, `capture`, `derived`, `validated`, and closed-shape parsers are **private**, not consumer bypass APIs.

```text
SHARED_ABI_REVISION, PAIR_JSON_ENCODING, V1_CARRIER_ENCODING, COMMON_BOUNDS
ContractValidationError(code, path, message, category = 'corrupt')
rethrowValidationError(error)
validateId(value, path = 'id')
validateToken(value, path = 'token')
validateHash(value, path = 'hash')
validateCounter(value, path = 'counter')
incrementCounter(value, path = 'counter')
isReservedId(value)
createValidationContext(options = {})
consumeReference(byteLength, context, path = 'reference', kind = 'payload')
ensureInert(value, path = 'value', context)
ensureLegacyInert(value, path = 'legacy', context)
decodePairJSON(input, context)
decodeLegacyV1(input, context)
decodeReferencedPairJSON(input, context, kind = 'payload')
encodePairJSON(value, context)
encodeLegacyV1(value, context)
pairDigest(domain, value, context)
hashBytes(input, context)
legacyPayloadDigest(value, context)
createV1Carrier(input, context)
validateV1Carrier(value, context)
DEFAULT_TASK_POLICY, DEFAULT_TASK_LIMITS, DEFAULT_VERIFICATION, DEFAULT_EVIDENCE
DEFAULT_WORKER_REQUIREMENTS, DEFAULT_WORKER_RESOURCES, DEFAULT_SUPERVISOR_RESOURCES
validateTaskPolicy(value, context)
validateTaskLimits(value, context)
validateVerificationPolicy(value, context)
validateEvidenceLimits(value, context)
validateWorkerRequirements(value, context)
validateWorkerResources(value, context)
validateSupervisorResources(value, context)
normalizeTaskPolicy(value = {}, context)
normalizeTaskLimits(value = {}, context)
normalizeVerificationPolicy(value = {}, context)
normalizeEvidenceLimits(value = {}, context)
normalizeWorkerRequirements(value = {}, context)
normalizeWorkerResources(value = {}, context)
normalizeSupervisorResources(value = {}, context)
validateActorDefinitionV3(value, context)
validateOwnerBinding(value, context)
validateActorBinding(value, context)
validateFence(value, context)
validateIdentity(value, context)
validateArtifactRef(value, context)
validateDeadlineWindow(value, context)
budgetSnapshotDigest(value, context)
validateBudgetSnapshot(value, context)
validateAssignmentSnapshotV2(value, context)
projectKernelAssignment(value, context)
validateGrantCommitProofV2(value, context)
validateActorControlBinding(value, context)
assertActorControlBinding(value, expected, context)
projectControlIdentity(value, context)
grantProofDigest(value, context)
validateReviewerWitness(value, context)
reviewerWitnessDigest(value, context)
validateArchiveReferenceV2(value, context)
archiveReferenceDigest(value, context)
```

Except the two mandatory-reference APIs, optional `context` starts a budget only when absent. Consumer operations create one context at their outer boundary and pass it to every nested helper. A caller original is never cached, even if frozen; keep returned detached values. Within common-owned transformations, corresponding paid occurrence paths are reused; missing defaults pay new nodes/bytes, alias growth pays additional bytes, subset projections do not refund omitted input, and source bytes remain separately bounded. A newly supplied/repeated input subtree is not trusted merely because another input looked equal. Do not create per-subtree budgets or invent an “already checked” flag. Report a concrete composition/API obstacle to T06 rather than bypassing checks.

Capacity ceilings: root depth 0 with maximum depth 32; 250,000 value occurrences; 16 MiB each aggregate canonical/source-byte ceiling; 16 references / 16 MiB referenced total; payload references at most 4 MiB (archive segments may reach 16 MiB). Config actor definitions at most 64; one unresolved workflow; ordinary queue default 8 / maximum 64; mailbox 4 MiB; reserved controls 8 / 512 KiB; inline envelope 64 KiB; unresolved operations and inspection receipts 256 each; text 10,000 UTF-8 bytes; request lifetime at most 300,000 ms. Full event/reserved capacity constants remain in `COMMON_BOUNDS` and D3. Options are positive safe integers bounded by these ceilings.

`ContractValidationError` carries `code`, `path`, `category: corrupt|unsupported`; unrelated errors escape. Only actual recognized usage-validation errors are adapted. No live clock is read. Hash domains are exactly `config`, `state`, `actor-event`, `workflow-input`, `operation-input`, `authority`, `mailbox`, `control`, `inspection`, `migration`, `archive`, with `pair/<domain>/v2\n` prefix and `pair-json/1` canonical bytes. A V1 carrier's `payloadHash` hashes its own decoded original value; when the carrier wraps a whole envelope that is **not** the envelope's nested report-payload hash. The reviewer mapping above explicitly uses the latter for retained V1 reports. T04 must not conflate these digests.

## Additive legacy-source inspection — accepted

Astra `7988c8fd377b450a92b00ea38862fcb3` specified T05's ABI gap; Main implemented the helper and wire consumer after both writers stopped. Current accepted common SHA `de1a7d18529ef7e59752e8e23d565c0fda953fc91e025a0a0e3ae4d8a17bbcb4`: **68 runtime exports**, including the error class. Removing only the added block exactly restores the accepted 67-export SHA; existing helper source is unchanged. At helper acceptance, syntax passed and full-source TS6.0.3 had 22 roots/351 source diagnostics (350 old + 1 migration scaffold), zero common/wire/records/config and zero dependency/global. The post-T05-delivery checkpoint below supersedes that diagnostic count. Independent implementation reviewer `97a5d577d29943f08fb45d37b08eb74b` ACCEPTED with no findings, scoped to this helper and its retained-report consumer. No public facade/tool/version changed.

```ts
type LegacySourceKind = 'state' | 'payload' | 'archive';
type LegacyInspectionIssue = Readonly<{
  code: string; path: string; message: string; category: ErrorCategory;
}>;
type LegacySourceInspection =
  | Readonly<{ kind: 'decoded'; byteLength: number; originalBytesHash: Hash;
      original: string; value: JSONValue; legacyPayloadHash: Hash }>
  | Readonly<{ kind: 'held'; byteLength: number; originalBytesHash: Hash;
      original: string | null; issue: LegacyInspectionIssue }>;
inspectLegacySource(input: unknown, context: ValidationContext,
  sourceKind: LegacySourceKind): LegacySourceInspection;
```

Context and source class are mandatory. T05 selects the class from its closed operation, not an untrusted source label: state is an unreferenced source bounded by the operation ceiling; payload is a reference up to 4 MiB; archive is a reference up to 16 MiB. Both reference classes share the existing 16-reference/16-MiB aggregate; overrides only tighten limits.

Implementation must preflight source/reference capacity before allocation/hash/decode, privately snapshot accepted byte input and charge each occurrence exactly once. Compute the original hash directly from that admitted snapshot; decode UTF-8 fatally without BOM stripping, then use existing `decodeText(..., true, ...)` once. Compute the payload hash from `JSON.stringify(decoded)` privately, not via another public capture/hash call. Preserve every V1 duplicate occurrence's budget, last-value/first-key-order behavior, inert `toJSON` fields and escaped lone surrogates. Do not alter the existing 67 helpers, expose private `derived`/`validated`, reset budgets or introduce trusted flags.

Before bounded inspection, invalid context/kind/input, oversized/exhausted admission or unrepresentable source strings throw structured validation errors without byte facts. After inspection, recognized UTF-8/BOM/JSON/finite-number/decoded-capacity failures return frozen held outcomes with established byte length/hash, exact text when available, and no partial decoded value/payload hash. Consumed budget is not refunded. Catch only common validation errors in the narrow decode stage and the known native invalid-UTF-8 error; programming/allocation errors escape.

The frozen outcome is an inspection DTO, **not** a V2 serialization contract or byte backup. Invalid UTF-8 has `original:null`; caller/Host must retain exact supplied binary bytes until a durable binary backup/reference exists, never dispose of them or replace them with lossy text. Oversized/uninspected inputs stay held without fabricated hashes. For decoded input, T05 passes `value` to non-authorizing `classifyStoredState`; it can assemble the existing carrier from its encoding constant, exact `original`, `originalBytesHash` and `legacyPayloadHash`, capture that new V2 wrapper once, then hash the returned checked wrapper. Wrapper overhead must fit; no second legacy decode/hash of the same source. Whole-source payload hash is not a report envelope's nested payload hash.

The legacy-inspection addition and its T05 handoff are accepted. Migration SHA `b9ddbb32666287074066a3465a4b994b8a816dc8b6f9c2d864aa1cac12115f03` passed independent review `48c897235b664d58a15b1369728752ad` with no blocking findings; Main closes T05 source/static acceptance. Post-delivery full-source supplemental check: 22 roots/350 baseline diagnostics, zero all five contract modules/dependency/global. Common/records/wire/migration are accepted; T02 and aggregate/runtime qualification remain open.

## Closed Config V3 constructor — accepted

Main implemented the ratified closed constructor at `actor-contract-common.js:1057–1248`, SHA `3dea650b3dd8b67b33d5830758b69978cc1c226cdc37df65ac03834f8c951db4`, 69 exports, following design review `de11cfbe3b6b4d579a0373a7938a372c`. Removing only its block restores accepted 68-helper SHA `de1a7d18529ef7e59752e8e23d565c0fda953fc91e025a0a0e3ae4d8a17bbcb4`. Original-owner DeepSeek's adapter is SHA `5a826428c72fe412dedcd9b239b3f3b67562bb061bed48301ca6cdcb82ee0ce2`. Fresh combined Astra `3c0fdb33245348a58b8a77028dcc68a5` accepted actual source and closed all four findings without edits. Main reconfirms hashes, exact signature/context and aliases. The subsequent six-export facade and [T06 handoff](AR3-T06-HANDOFF.md) also passed independent review `94c9d2b5ab9d4ccfb29b9b770fec07cf`. Neither is a full project compiler pass or runtime qualification.

```ts
validateActorConfigV3InContext(value: unknown, context: ValidationContext): ActorConfigV3;
```

Context is mandatory at runtime and must already be registered. The entry calls `validated(value, 'config', context, configV3)` once, where `configV3` is an unexported closed constructor. Move the existing Config V3 schema/types into common and reuse only its private non-accounting parsers (`policy`, `limits`, `verification`, `evidence`, `requirements`, `resources`, `supervisorResources`, `definition`). A private default merge operates on already captured input; all constructed containers freeze before the one final reconciliation. Do not call accounting normalizers/`withDefaults`, expose `derived`, accept a callback/trusted result, reset budgets or recapture the completed tree. Existing 68 helper implementations remain unchanged; the addition would make 69. Common must not import the config leaf or runtime modules.

Main selects these **actor-pair-only fixed profiles**, from D3's initial target and the freeze plan's future idle policy; omitted groups/members get these values, alternatives reject as unsupported. These are explicit schema/default choices, not permission to activate timers, extra workers or inference:

```ts
capacity: Readonly<{maxResidentActors:2, maxActiveModelCalls:2, maxActiveActivationsPerActor:1}>;
idlePolicy: Readonly<{idleTimeoutMs:600000, retainDuringUnresolvedWorkflow:true}>;
```

Legacy mode rejects these groups and retains its prior behavior. Existing one-workflow and one-writer fields stay in their current groups. No adjustable ranges, zero/null timeout semantics or retention opt-out are introduced.

Main also selects **normalize-first requirements-alias equality**: independently validate both closed partial declarations against the four shared boolean defaults, reject unequal effective values (`conflicting-alias`, `config.workerRequirements`, `unsupported`), emit only `workerRequirements`. Compare scalars without accounting normalizers. Renaming a sole `requirements` alias receives no cross-path credit: the emitted new path is charged and the consumed old path is not refunded.

Preview corrections preserve 999 UTF-16-code-unit provider/model caps plus the separate common 10000-byte bound; cwd accepts null or bounded text including empty; command uses length-based nonempty/no NUL/10000-byte checks, not trimming or a 1000-byte cap. All private parser paths retain their enclosing config/array path.

Main integrates the existing DeepSeek constructor into common; the original DeepSeek model owns the small one-argument `validateActorConfigV3(value)` adapter creating one context. Aggregate callers use the mandatory-context common entry. Fresh independent review and static evidence must accept both before T06, which still exposes exactly six facade exports. Complete normalized config hashes include capacity and idle policy.

## Next gate

T01–06 and common’s 69-export ABI are accepted and frozen. The exact six-export facade and [concrete handoff](AR3-T06-HANDOFF.md) passed independent integration review. The retained DeepSeek/Zro model owner may now implement T07's two kernel extensions, then T08 sequentially. Frozen-leaf dependencies must be reported to Main, not silently patched. No model/runtime activation or complete format freeze is claimed.

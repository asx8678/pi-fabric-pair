# AR3-T07 — Accepted kernel to aggregate handoff

**Accepted by Main for T08 implementation, not runtime qualification.** Package/config/state/wire remain `0.1.0`/V2/V1/V1; no live activation, consumer, default or registration change. T01–07 accepted (7/10); full T08 remains BLOCKED. Main verified the R1C foundation at `89974e46…`; the user subsequently authorized [R2 prefix/producer/commitment work](AR3-T08-R2-PLAN.md). See the [live task ledger](AR-03-AGENT-TASKS.md) for current ownership/status and [findings](AR3-T08-FINDINGS.md) for stopped-source evidence. Kernel remains frozen; T09/T10 unstarted.

Read alongside [T06 exact leaf handoff](AR3-T06-HANDOFF.md), [D1–D6 and selected signatures](AR3-01-DECISIONS.md), [task ledger](AR-03-AGENT-TASKS.md) and [testing policy](TESTING.md).

## 1. Accepted source and evidence

```text
src/coordination.js ccd59af0d175158c209f8dbcb4d34dda6a034c35bedf3d0ea8942d13fd703b81
src/transitions.js  03b01e30eb80a09df69c3b1da65adad20cd87d4f6c6063c3340e60d874d3c982
```

- Whole-kernel correction review `afa8bad5436e4636b123483a8a82f8da` closed F1/F3/F4/F5 on `b252070b…`, leaving only F2's widened actor/ref text domain.
- Same DeepSeek owner `88621cb110a54e6886e897f46236b905` added accepted common actor/ref validators only inside the new link, via the existing class-specific adapter.
- Main mechanically inverted exactly the two added imports, four validator calls and associated comment: SHA becomes `b252070b072bcc767dea11ce39b30d53daba356c632e33bcef95a9155f272a4c`. No other reviewed byte changed.
- Independent delta-only reviewer `2ddb6179dac4488d943fec01ef222674` returned **ACCEPT-F2-for-T07-handoff**, no remaining defect. This is combined acceptance evidence, not a claim that the last reviewer repeated the whole review or ran commands.
- Final syntax/whitespace pass. All six accepted leaf hashes, protected 19-file digest `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`, transitions and 27-kind names/order match the T06 handoff.
- Full existing-config supplemental TS6.0.3: **23 roots / 350 unchanged source diagnostics / zero kernel, six contracts or dependency-global**. Sorted diagnostic SHA `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. Exit 2, not a passing project build. Pinned `tsc` remains unavailable; no installs or narrowed config.

Public kernel exports remain `CoordinationValidationError`, `validateTransitionEvent`, `validateCoordinationModel`; transitions exports `reduceCoordination`. No new facade or Pi symbol. All 27 kinds, 24 reused families and inactive automatic-action behavior remain.

## 2. Concrete new event branches

Existing `Fence`, IDs, safe integers, original V1 decision input and legacy hash rules are unchanged. `ReviewLink` has **exactly** the following fields, no `settlement`:

```text
ReviewLink = {
  actor: ActorBinding, profile: 'supervisor-restricted',
  workflowId, workflowRevision, activationId,
  intentId, intentHash, operationId,
  reportId, reportHash, checkpointHash,
  request: ArtifactRef, reply: ArtifactRef, receipt: ArtifactRef
}
```

This is `Omit<ReviewerWitness,'settlement'>` with actual closed runtime validation, not only a type assertion. `reviewLink` uses common actor/artifact validators for strict scalar and 10,000-byte UTF-8 text rules; remaining ID/hash fields use unchanged kernel validators. Role must be supervisor. These standalone intrinsic checks do **not** supply T08's aggregate budget.

```text
evidence-receipt = {
  kind:'evidence-receipt', source:'inspection-boundary',
  fence, at, observationId,
  receiptId, requestId, replyId, reportId, checkpointHash,
  reader:ActorBinding, scope, review?:ReviewLink
}
```

`scope` is `{kind:'all'|'summary'|'patch'|'verification'}` or `{kind:'file',path}`. The absent-review legacy branch retains its prior shape/behavior. A present link requires the exact same supervisor actor as `reader`, same report/checkpoint, distinct request/reply/receipt logical IDs, `intentId !== requestId`, and distinct artifact values/content hashes. Ref strings are not logical IDs and need not be path-unique. Retention additionally requires a finalized retained report/current named checkpoint, original envelope `payloadHash` equality and any file scope within that checkpoint. Receipt delivery does not require the later producing settlement.

```text
supervisor decide = {
  kind:'decide', source:'supervisor-control', fence, at, observationId,
  operationId, input, inputHash, reviewer:ActorBinding,
  inspectionReceiptIds:Id[], checkpointObservationId:Id|null,
  continuationOperationId:Id|null, review:ReviewerWitness
}
```

`input` is the unchanged schema-validated V1 decision input and `inputHash` preserves its original JSON property order. The full closed `ReviewerWitness` is exactly T06 §3, including `settlement:{observationId,at}`. Main uses `source:'main-decision'` with the same legacy fields but **no review**, still requiring Main role. Unrelated branches also reject `review`.

## 3. Kernel guarantees and limits

Source path: event validation → exact branch parsing → retained evidence → decision readiness → immutable intent → intent readiness → committed decision recheck → canonical journal replay. See `coordination.js:159–176,295–365,560–627,746–757,967–985,1195–1235` and `transitions.js:25–51`.

For supervisor decisions the kernel requires a known model, matching reviewer/full witness, original report payload hash/checkpoint, settlement time no later than the decision, a **nonempty** receipt list and every listed receipt retained with the exact projected shared link. Candidate and committed application both recheck. Full producing-activation history is not established by a caller-supplied witness.

Approval's finalized/all-scope/current-checkpoint checks remain approval-specific; current-owner, continuation, absorbing-grant, immutable accounting/gaps/amendments, dedup and independent ACK/run/report protections remain. Supervisor usage is not injected into the implementer ledger. Main/lifecycle cancellation remains separate. Expected common `ContractValidationError` is adapted narrowly; unrelated programming errors escape. The pre-existing generic schema-Error limitation is unchanged.

## 4. Mandatory T08 composition obligations

Implement only new `src/actor-model.js`, using the accepted kernel rather than a second implementation reducer. The five exact selected exports are:

| Export | Required arguments |
|---|---|
| `validateActorStateV2` | `(value, context:ArchiveValidationContext)` |
| `projectLegacyWorkerView` | `(value, workerId, context:ArchiveValidationContext)` |
| `validateActorWorkflowModel` | `(value, context:ArchiveValidationContext)` |
| `validateActorWorkflowEvent` | `(value)` |
| `reduceActorWorkflow` | `(model, event, context:ArchiveValidationContext)` |

All input roots are untrusted; concrete readonly types and structured expected errors are required. Context is checked archive data, not the internal budget handle or a capability. Initial roots require explicit empty archive context.

1. Validate canonical D1 root/genesis/event history and archived segments at **each historical prefix**, deriving all views. Bind current store/segment/head/checkpoint and validate archived config/domain payloads. No independently writable actor/worker/accounting registry or future-fact repair.
2. Establish one operation budget across root, archive context, references and derived representations. Use `validateActorConfigV3InContext` with that registered context; public standalone leaf calls do not prove aggregate bounds. Do not fabricate checked-input credit or silently widen accepted schemas. Report concrete missing helper dependencies to Main before altering frozen modules.
3. Resolve all three retained inspection artifacts to actual checked content, digests/byte bounds and logical IDs. Match complete actor/profile/workflow/revision/activation/earlier intent+hash/supervisor operation/report/checkpoint/scope/delivery chain at the proper prefixes. Artifact refs never stand in for IDs.
4. Prove the named actual producing-activation settlement before applying supervisor plan/answer/review/decision, not before retaining an earlier receipt. Recheck current actor/workflow/model eligibility, holds, reservations and ownership at admission and commitment. Keep delivery, run settlement, effect settlement and application separate.
5. Preserve one unresolved workflow, one implementer writer and per-actor reservations, independent holds/obligations, immutable workflow/task/step budgets and authorized amendments. Derive deduplicated supervisor+implementer usage unions, retain unknowns/gaps, and never reset spend on resume or charge it twice.
6. Enforce mailbox count/byte capacity, reserved control, disposition-before-release, retained uncertainty, epoch-bound dedup and persisted fairness. Cover the complete vertical path and specified crash windows with closed event/issuer/operation tables. No scheduler or runtime launches.
7. Atomically apply/noop/hold/reject with `nonAuthorizing:true`; expected input conflicts do not partially mutate projections, and programming errors escape. Legacy views remain read-only/inert with unresolved facts visible, never runnable V1 authority.

Do not conflate supervisor operation with kernel decision operation, workflow revision with implementation plan revision, or supervisor generation/session/model with implementer fences. Host provenance, durable publication, effect authorization and actual execution remain AR-04+. No tests/probes/fixtures/ESM loads/native workers/runtime activation/version/default/schema/example/registration changes. T09 independent integration review and T10 final freeze remain unstarted.

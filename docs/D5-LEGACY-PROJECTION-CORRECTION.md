# D5 / MF-01 — truthful retained-kernel legacy projection

**Follow-up:** the [held-byte projection amendment](D5-HELD-CARRIER-CONTRACT.md) now implements the separate raw-source retention path without actor/identity synthesis. This document retains the earlier kernel-only correction's scope and evidence. Both source slices still await independent T09/T10 closure.

**Status: MF-01 source-corrected with 25 bounded public outcomes and zero supplemental diagnostics; independent review remains blocked. Scope: existing public projection, not completion of D5 migration or T09/T10.** Main exclusively owns `src/actor-model.js` for this correction. No other production file, public signature, active version, resource cap or registration changes. Prior finding: [T09 checkpoint](T09-FOUNDATION-REVIEW-CHECKPOINT.md).

## Contract fixed before editing

`projectLegacyWorkerView(value, workerId, context)` still accepts a canonical actor root and explicit archive context, fully validates/replays them, and returns a deeply frozen, non-authorizing view. It does not accept a cached model as authority, load files, adopt a worker or create a workflow/actor/identity. It uses one registered operation context for replay, scanning, copying, output capture and freezing.

Supported input for this correction is **an already represented retained kernel legacy record in canonical workflow history**. Raw State V1 bytes, `HeldLegacyEvidenceV2`, unknown historical identities without such a representation and unresolved external carriers are not newly admitted. Existing archive quiescence/held-reference restrictions remain unchanged. Their complete pure representation/resolver contract remains a separate D5 freeze requirement; H1 later adds durable backup/loading and public-tool routing. No caller should manufacture a supervisor or runnable assignment just to pass this projection's input schema.

| Output / behavior | Exact meaning |
|---|---|
| `known:true` | Exactly one validated workflow contains the requested retained legacy worker; not identity completeness, provenance, runtime readiness, accounting completeness or whole-migration support. Unknown or ambiguous worker matches reject as unsupported. |
| `workerId` | Exact requested ID matched to canonical kernel genesis. |
| `taskRef` | Retained legacy task ID, including explicit `null`. No replacement ID. |
| `session` | Original `legacy.identity.fence.sessionId` only when the retained identity exists and names this worker. Otherwise missing identity yields `null`; a foreign worker identity rejects. Never substitute the current receiving genesis fence's session for historical execution identity. |
| `status` | Replayed kernel legacy task's `held`/`cancelled` status. Logical cancellation does not prove physical containment or clear retained obligations/history. A non-legacy current task is not silently projected as the old task. |
| `pendingObligationRefs` | Singleton `pending.reportRef` when pending is non-null, even when `reportId` or task ID is null; otherwise empty. These are retained reference strings, not fabricated IDs or verified artifact contents. Cancellation alone does not remove the reference. |
| `historyRefs` | Exact retained nonempty history references, in order. No normalization or filesystem/provenance assertion. |
| `heldReasons` | Stable deduplicated union of current unresolved kernel holds, applicable actor holds and unresolved workflow holds. Preserve extra reasons; exclude resolved causes. |
| `diagnostics` | Explicit projection limitations: `legacy-source-diagnostics-unavailable` always (kernel carrier contains no original diagnostics); `legacy-execution-identity-unknown` / `legacy-task-unknown` when absent. These are diagnostic codes, not artifact paths or a claim that stored-source diagnostics were inspected. |

The output has no new fields. Reference strings are copied from already validated kernel data; they do not pretend to be newly resolved `ArtifactRef` occurrences. Their actual scan/copy/output costs are still paid. Exhaustion rejects; no new context, cap change or free output traversal is allowed.

## Acceptance ledger

| ID | Check | Result |
|---|---|---|
| D5-01 | Accepted public history with null identity/task/report ID preserves pending and ordered nonempty history; missing session remains null. | PASS, bounded public checks |
| D5-02 | Existing identity retains its original session, not the receiving session; foreign worker identity fails closed. | PASS |
| D5-03 | Current holds survive/deduplicate; resolved holds disappear; lifecycle cancellation is reflected without erasing pending/history. | PASS: kernel/actor pause dedup, resume, actor-only stop, workflow hold and replayed cancel |
| D5-04 | No-pending and initially cancelled cases remain truthful; unknown/unsupported inputs reject without mutation. | PASS for represented kernel data and rejected raw/unresolved inputs; no universal migration claim |
| D5-05 | Single shared budget, bounded output, deeply frozen detached arrays, repeatable public result and preserved input. | PASS: public mutation/capacity checks and AST-confirmed shared context through replay/capture/freeze |
| D5-06 | Five aggregate/six facade exports, 27 kernel kinds, active versions/defaults/registrations and original 106 requirements unchanged; affected syntax and all-root supplemental compilation. | PASS: exact one-function inverse and 23 protected source hashes; 24 roots, zero supplemental diagnostics. Pinned gate remains unavailable. |
| D5-07 | Fresh independent stopped-source review; whole-foundation T09 and complete D5 carrier support remain separate. | BLOCKED: fresh reviewer failed before source access; no independent verdict |

## Pre-correction public reproduction

An accepted one-event canonical `workflow-submitted` history was populated with a validated `legacy-held` record: null task/identity/report ID, `pending.reportRef:'retained/question.json'`, two nonempty history references and kernel reasons `legacy`, `unknown-accounting`, `evidence`. The existing public projection returned empty pending/history arrays, omitted `evidence`, and exposed receiving session `worker` despite missing historical identity. Input bytes were unchanged. This is direct public-API evidence for MF-01, not just a source assertion.

The no-file probe reused prior in-memory canonical root data, not removed test files. A first `structuredClone` carrier was rejected for a cross-realm prototype; plain JSON input established the accepted reproduction. No scope or validator was weakened to admit that carrier.

## Implementation and verification

Only the `projectLegacyWorkerView` function/comment changed in production. Restoring that single block **in memory** reproduces the entire prior actor-model SHA `c3812a4d23b72aa7ae78f533103ea676a729dcebb8bc020161196de07bbb5777`. All other 23 production files retain ordered listing digest `aeb1071810bb878f2201bbd43e4a9d3f0a197a8d3e9965e0f415becf9b5f11c1`. No active consumer of the projection exists. Q01/reducer/mailbox/archive internals are byte-identical; unchanged passing histories were not rerun.

Stopped actor-model SHA-256: `ffb01537c2c1f691300f996a3dcd2a89d792788f425ce1b4122bb09abcf5138d`. Ordered `shasum -a 256 src/*.js package.json tsconfig.json` listing SHA-256: `001a8a02cb8ff5f8f3ef23af6272804f04c93713eda999316cb5badc0ec7fc91`.

Main verified **25 distinct public-API outcomes** with no test/fixture/runner files: exact pending/history, nullable task/session, original session versus receiving fence, foreign identity rejection, extra holds, diagnostic limitations, input preservation, frozen/detached arrays, repeatability, no-pending, initial/replayed cancellation, unknown worker, nonlegacy/raw/unresolved inputs, pause dedup/resume, root-scoped actor stop, workflow hold, forged cache rejection and byte-capacity rejection. Two initial probe prerequisites were corrected without production changes: actor-lifecycle requires `workflowId:null`; an excessive array length reports invalid-field, whereas the byte-budget overflow reports capacity. Only those two failed probe setups were rerun. The ESM refresh also required a `file://` URL rather than a query on a bare absolute path.

`node --check src/actor-model.js` and whitespace checks pass. AST inspection confirms unchanged five aggregate arities and six facade exports, exactly one projection-created validation context, and that replay/output capture/freeze all receive it. All 106 original acceptance rows remain byte-for-byte equal to Git HEAD. The existing in-memory supplemental checker reports **TypeScript 6.0.3, 24 roots, zero diagnostics**, with the installed SDK 0.87.1/Node22/MCP/TUI declaration mappings documented in the C6 checkpoint. No tsconfig, package, shim, exclusion or suppression changes. The registered pinned check is still unavailable (`tsc` absent in the prior attempt); that unchanged failure was not rerun or called a pass.

Fresh read-only Astra reviewer `bb55e930b7c540cfad1fdadf23ed6b78`, assigned MF-01 plus whole-foundation T09 coverage, failed with **Agent transport exited without a result**, zero turns and zero tool calls. No findings or independent CLEAR resulted. It was not restarted. Contour's working-tree pass covered the wider historical dirty patch and showed advisory decision-load exposure in applyEvent/applyActorEvent/correlateKernel; it is not correctness or T09 evidence and prompted no unrelated refactor.

Final registered `npm run pack:check` passed with **85 files**, including this correction checkpoint, the T09 checkpoint and corrected actor-model; no tarball/install was created. Final preservation checks confirmed eight changed documentation files, 102 resolving local file links, all 106 original rows, clean whitespace and unchanged source identity since the probes. Replacing only the current actor-model hash in the complete source/package/tsconfig listing restores the prior T09 listing hash, confirming no configuration or other production changes.

## Remaining boundary

MF-01 is source-corrected and boundedly checked, **not independently closed**. The follow-up held-carrier amendment now supplies the separate byte-validated read-only representation/resolver for workers outside kernel history; it is source-implemented and boundedly checked, not independently frozen. Define that exact input/correlation/unknown-field contract before extending source; do not invent execution identity, a supervisor, an authorizing workflow or file provenance. Preserve original bytes and unknown obligations. Fresh full-foundation T09 and T10 exact reader/writer/crash freeze remain required before H1; native/crash/install and pinned-toolchain qualification remain open.

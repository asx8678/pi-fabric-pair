# Unknown-delivery reconciliation and structural replanning — implementation checkpoint

**Status: source implemented and partially verified; the application is NOT complete.** Interfaces are frozen in [the P0 contract](P0-RECONCILIATION-REPLAN-CONTRACT.md) and the delivery order remains [next delivery execution](NEXT-DELIVERY-EXECUTION.md). This checkpoint records what exists, the independent findings, and the gates still open. The [scope-checked next implementation plan](NEXT-IMPLEMENTATION-PLAN.md) corrects the remaining sequence and Q01 design options without changing its acceptance requirement. It is not runtime, Host or native acceptance.

**Subsequent Q01 correction:** [inline-retention checkpoint](Q01-INLINE-INSPECTION-CHECKPOINT.md) supersedes the open capacity status below for explicitly inline histories: 102 acceptance-bearing events, two full inspection chains, closure and six rotations pass; seventh rejects at the unchanged cap. Raw histories retain their original limit. Earlier findings/hashes below remain historical evidence. F1/T09/T10 is next.

## 1. What is implemented

Three files changed; three writers owned disjoint files and stopped before integration:

| File | SHA-256 (integrating revision) | Content |
|---|---|---|
| `src/actor-wire-contracts.js` | `9acf41639ad6f04ddf933d8ffae196098ac383dbd74292403063e88ec44d33d6` | `PlanStepFullV2` / `PlanChangeV2` / `PlanLinkV2` and their private validators; optional `change` on supervisor plan output; optional `planLink` on review; structural limits aligned with the kernel's Step schema |
| `src/coordination.js` | `5e0948488909d7a1cced301c4681363299f2980419986a000922322798901dcd` | Immutable step catalog, lineage groups with merge rejection, lineage-aware caps, 32 lifetime-ID bound, atomic structural revise with once-only charge, named permanent candidate supersession, standalone/context parity |
| `src/actor-model.js` | `e13c46b7dcb08e8ecd7f4f12c3bf27bb0a0b2e1f18288900ec0d757e9ffe0aa2` | M1-B mailbox reconciliation (three new actor kinds, evidence matrix, derived occupancy, contradiction holds, fork/cache/archive carryover) and E2 aggregate integration (plan/review/settlement/inspection correlation, canonical plan-hash recomputation, lineage/review-debt views, once-only revision accounting) |

No new kernel event kind (still 27), no new digest domain, no cap increase, no new facade/config/runtime entry, no test/fixture/runner file, no install or commit.

## 2. Defects found by independent verification and fixed

Two separate Astra reviewers inspected stopped source only. Every finding was corrected and the corrections are what the current revision contains:

1. **Wire/kernel divergence** (retry round 1): the wire allowed 65 acceptance entries, a looser instruction limit, plan revision `0`, and duplicate `replaces`/`removedStepIds` — proposals that the kernel must reject. The wire now matches the kernel's authoritative Step schema (acceptance <=64, revision >=1, duplicate IDs rejected). The instruction bound is deliberately *stricter* on the wire because the shared text validator always enforces the 10,000-byte text bound; no control can pass the wire and then fail kernel parsing on length.
2. **Unenforced structural hash** (round 1): the kernel accepted `expected.planHash` opaquely, so the first candidate could bind nothing. The aggregate now recomputes the canonical `operation-input` projection hash and compares the retained budget hashes.
3. **Prospective revision charge missing from admission** (round 2): admission compared the *pre-charge* aggregate revision total, so a case with `maxRevisions=1` and one pre-dispatch plan revision could commit a second revise and leave the allowance exceeded. `budgetDenial` now accepts a prospective-revise flag, and revise admission counts the charge the kernel will apply at commitment.
4. **Stale published lineage after a retained hold** (round 2): a late counter for a retired predecessor updated the retained kernel and produced a real hold, but the derived `taskPlans` lineage was refreshed only for applying steps, so `lineage[].gaps` stayed stale. Publication now derives lineage for retained held kernels as well.
5. Two strict-type/JSDoc defects introduced during integration (deep kernel typedef imports that broke JSDoc parsing and widened `activationId`) were repaired; the result compiles with **zero diagnostics across all 24 production roots**.

## 3. Checks actually witnessed

| Check | Result |
|---|---|
| Strict compilation, 24 production roots, installed TypeScript with real SDK/Node/MCP/TUI declarations | 0 diagnostics |
| Kernel surface | 27 event kinds, 6 exports with unchanged arities |
| Aggregate public surface | exactly 5 exports (`projectLegacyWorkerView`, `reduceActorWorkflow`, `validateActorStateV2`, `validateActorWorkflowEvent`, `validateActorWorkflowModel`) |
| Mailbox `M1-B` public behavior | unknown stays occupied; evidence-gated resolution releases count and bytes exactly once while keeping the original `unknown` disposition, attempt bindings and resolution records; foreign attempt, forged or missing evidence, `proven-not-sent` without qualified containment, chain-head violations and identity reuse are rejected; only current Main records and only the retained consumer may observe delivery |
| Structural wire limits | 10/10 (acceptance 64 accepted / 65 rejected, revision `0` rejected, next-revision drift rejected, duplicate removed/replacement IDs rejected, in-bound instructions accepted) |

Every behavioral check ran the real exported entrypoints on a genuine prerequisite history (real submission, retained authority content, real supervisor activation, validated envelope). No private cache or injected derived state was used as a positive path.

## 4. Independent public-path results after this checkpoint revision

**Mailbox contradiction and archive paths: verified.** An independent probe (Astra, source untouched - all three hashes still match section 1) exercised the real public entrypoints:

- Late accepted delivery invalidated both `rejected-before-execution` and `proven-not-sent`; without an explicit hold the exact first error was `admission-hold` / `mailbox.holds` / "Contradicted mailbox resolution requires hold-recorded reason uncertain-delivery scoped to its message". With the hold, occupancy was restored while the original resolution and the late fact were both preserved, and a fresh correction plus `hold-resolved` released again.
- Rotation was blocked for unknown, incomplete and held obligations, including released entries with an unresolved hold. Valid releases survived **two rotations**, preserving attempt bindings, stage facts and resolution records.
- Exact retries were no-append noops (including after rotation); changed retries and all six forged-cache variants were rejected.

**Q01 full public E2 history: partially proved; one original blocker corrected, archive capacity still open.** An independent probe built the structural revise end to end: the revise committed (task/workflow revisions 1 to 2, `step1` replaced by `step3`, `step2` removed, one revision charge, review debt transferred), the approved base did not advance, and a fresh continuation grant succeeded with the new revision and a fresh attempt/lease identity. All four requested negatives behaved correctly:

| Negative | Observed |
|---|---|
| Stale accounting/budget coordinate | rejected `inconsistent-reference`, "Structural plan accounting/budget snapshot mismatch" |
| Wrong `planHash` | rejected `hash-mismatch`, "Structural expected plan hash does not bind the retained canonical projection" |
| Superseded candidate's late commit | correctly **held** (kernel `admission-held`, `intentReady` superseded); the replacement committed and the old retry could not resurrect it |
| Revise advancing the approved base | valid revise preserved the base; a forged/replacement base was rejected |

The acceptance-omitted variant reached **102 accepted events** including two complete inspection chains, mailbox reconciliation and closure, with replay/cache parity. The original two findings have the following status:

1. **Acceptance-bearing structural steps — FIXED.** The continuation authority's brief step is now compared against the FULL retained catalog step, so a structural successor may carry `acceptance` while legacy tasks (no catalog) must still have none. Verified: the variant that previously stopped at `events.60` now applies `worker-activation2-authority` at sequence 61 and continues with `continuation1` published and the new revision installed. The check was strengthened, not weakened: id, title and instructions must match the full step exactly and acceptance must match the kernel step.
2. **The current two-chain representation does not fit the unchanged 16-reference allowance — OPEN, needs a scoped representation/accounting correction or an explicit policy decision if no valid correction exists.** Exact arithmetic from the independent probe: one complete one-proof inspection chain costs **8 reference occurrences** (proof 1, request 1, reply 3, receipt 3), so two chains cost 16 and ordinary replay of the history succeeds at exactly the cap. Archived replay additionally charges the archived-segment reference, needing 17, so the first rotation fails `capacity` at `events.87` while replaying sequence 88 (`inspection2-receipt`). The 16 cap is defined at `src/actor-contract-common.js:26` and enforced at `:321-325`; the raw closed root is only 136,036 bytes, so this is not a byte-size problem and no locator trick or artifact-text reduction removes the occurrences.

   The scope recheck confirms the charge sites in `parseInspectionArtifact`, `decodeReferencedPairJSON` and archive-context validation. This is a genuine limit for the current representation, not a proof that every evidence-preserving representation is impossible. No redundant-charge defect has yet been established. The earlier one-occurrence reply/receipt proposal is unproven and is not a frozen design.

   Follow [N1](NEXT-IMPLEMENTATION-PLAN.md#3-n1--resolve-q01-without-changing-its-goal): audit every occurrence and all shared budgets, design/review exact closed representation and compatibility semantics before editing, then qualify the complete acceptance-bearing history and supported archive depth. No cap increase, reset context, equality credit, fake locator or omitted evidence is permitted. A one-chain archive or non-archived two-chain history does **not** satisfy Q01; any such scope change needs explicit approval and must not be recorded as the original check passing. No production code was changed for this finding in the planning recheck.

## 5. Still open — not acceptance

- **Q01 independent review**: the complete acceptance-bearing history through rotation now passes bounded public checks under the inline-retention amendment; fresh F1/T09/T10 review remains required. The original raw representation is not silently reinterpreted.
- **H1 Host/runtime integration**: inventory complete and [planned](H1-ACTORHOST-INTEGRATION-PLAN.md); no Host code exists yet.
- **H1 order**: F1/T09/T10 first, then H1-A + H1-D store/held loader, H1-B durable effects, H1-C + M1-H coherent cutover per [the revised H1 plan](H1-ACTORHOST-INTEGRATION-PLAN.md). An unused helper must not be counted as integration.
- **M1-H**: durable mailbox attempt/evidence publication and eligibility-aware Host service. The pure M1-B protocol does not prove transport provenance.
- **F1/T09/T10, R1/R2, S1/C1/O1, F2**: independent foundation review, restricted supervisor, supervised runtime, sleep/wake, configuration Apply, observability and the final release review remain unstarted.

A clean compilation, a green bounded probe set and a fixed reviewer finding do not certify the product, the runtime path or provider/native behavior.

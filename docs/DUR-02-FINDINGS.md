# DUR-02 — Controller durable-latch ingestion

**Bounded source/local checkpoint, not native or crash-recovery qualification.** Astra `83ece39105ed4677b5b94e233c34061f` stopped after editing only `src/controller.js`. Main reviewed the stopped delivery and corrected one witnessed stale-owner defect. Other source ownership remains in [the completion ledger](COMPLETION-EXECUTION-PLAN.md).

## Implemented path

Existing scheduled scan → fault/configuration containment → exact runtime/control/task fence → ordered inbox ingestion → bounded owned-runtime `latch.json` read/`validateLatch` → same `acceptReport` → one revocation and unchanged pending envelope → durable waiting authority/state → original settlement/idle/configured verification/evidence/checkpoint/notice path.

No worker waiting-gate bypass, inference restart, lease grant, fabricated report identity, latch mutation or budget reset. The latch read has a 16 MiB bound. Same-ID duplicates compare every immutable envelope field, including original-order payload/hash/timestamp; finalized checkpoint additions are excluded. Historical notice/decision metadata alone is not duplicate-content proof. Missing local archive originals remain unproven and cannot be manufactured by archiving that candidate.

Non-overwriting link/unlink archival preserves the first original; occupied archives require complete equality. Publication failure retains existing containment ownership. Finalization queues and rechecks the original control/task/pending envelope, including after observation callbacks. A settlement arriving during an absent-latch read cannot immediately justify no-report interruption; the next scheduled scan revisits it.

## Witnessed failure and Main correction

The initial bounded run reached **15 successful assertions, then failed** `old-owner-latch-stale-not-current-interruption`. `acceptReport` asserted current ownerSession before stale classification, so a valid retained latch from a prior Main session could interrupt unrelated running work.

Main changed two anchors: protocol/worker validation remains strict; complete retained same-ID evidence is still checked first; ownerSession now participates in the stale producer/binding predicate with epoch/generation/nonce/session/task/lease/attempt. This does not permit old-owner adoption. Same-ID changed owner content remains a conflict; a genuine native settlement with no admissible current report still interrupts.

## Main evidence and limitations

- Initial run used actual selected Controller methods and real stored/schema envelope/latch validators. Fifteen preceding assertions covered latch-only acceptance, preserved envelope/one revoke, bounded read, duplicate deadline, complete same-ID conflict, single report per lease, finalization/duplicate checkpoint additions, read/publication revocation, publication-failure containment, settlement-during-absence deferral, next-scan absence, after-observation finalization fencing, and unproven historical archive handling. The run was **failing overall**, not retrospectively relabeled passing.
- After correction, **13 affected-path assertions passed**: eight stale bindings (ownerSession, ownerEpoch, workerGeneration, nonce, sessionId, leaseId, attemptId, attemptNumber), repeat-scan stale dedup, same-ID owner conflict, historical original proof without adoption, wrong-worker containment, and settled/no-current-report interruption. Unchanged passing cases were not rerun.
- These are no-file, in-memory evaluations of selected actual source. Filesystem/native/evidence/notification/serialization boundaries were explicit adapters. They do not establish real disk atomicity, native event behavior, full public startup/recovery or crash durability; no project ESM import, test/fixture/runner file, native process or provider call occurred.
- Controller syntax and scoped whitespace: pass. The stopped cohort compiler before Main's two-anchor correction had zero Controller diagnostics and 345 project diagnostics. Combined checking after ongoing T08-LA/TYPES-CW edits remains pending; do not claim a clean build.

Current Controller SHA:

```text
ed990c9971eb903a4aa4b259d148bb6a909ee7d22d211dc4f1742224610d2468
```

Remaining V1 orphan/history reconciliation, persistent checkpoint-commit crash windows, immutable lifetime-budget resume, original-byte migration and canonical ActorHost ownership belong to later stages. This patch does not activate State V2 or complete AR-04.

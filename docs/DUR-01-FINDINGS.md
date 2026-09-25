# DUR-01 — bounded report publication and config restoration

Writer `3faa28d9fa59434a841344f02d75c491` completed and stopped. Only `src/config.js` and `src/worker.js` were assigned/changed. **Source review, syntax/whitespace and local checks completed; full compiler comparison is pending the independent C4/DUR-02 writers stopping. No runtime/product qualification.** Current ownership is in [completion execution](COMPLETION-EXECUTION-PLAN.md).

## Reviewed source

- `config.js:252–279`: migration still validates scope/conflicts and archives before publishing. On publication failure, exclusive `copyFile(..., COPYFILE_EXCL)` restores independent original bytes without consuming the backup or overwriting an occupied source. Successful restore throws a contextual error retaining the primary cause; failed restore throws `AggregateError([primary,restore])` with both causes and recovery paths. Normal success/defaults/version remain unchanged. Backup selection and power-loss/atomic-visibility concerns remain outside this correction.
- `worker.js:45–88`: current latch validates the retained report producer; private `assertReportAuthority` rechecks available V1 authority/environment/task/lease/attempt fields and detached effects. `publishReport` stages complete retained content, checks authority, atomically links without replacing an occupied inbox name, and validates a complete identical existing envelope on EEXIST. Original-order payload equality is preserved. `readJSON` uses no-follow file opening and regular-file/size checks; malformed/conflicting files are not overwritten.
- `worker.js:125–144`: an admitted identical retry republishes the retained report, then notifies/aborts; it does not mint another report or claim controller acknowledgement. Initial publication still follows durable latch creation.

Checked source identities:

```text
src/config.js 9664a303ba77607466bdd32e6ae2d8114e92d13cdd9dfb68a4323ae4ee958189
src/worker.js cdb86202aa9f7fdf597137428492a125757c7a7afa2492ea3951c5cd02390018
```

## Actual checks and limits

`node --check` on both stopped files and their `git diff --check` passed. **15 bounded no-file checks passed** using actual selected `backupPath`, `saveConfig`, `assertReportAuthority` and `publishReport` functions, with explicit in-memory filesystem adapters and supplied validation/data. Cases: nonmigration/migration success, backup-preserving restore, both failures retained, occupied restore path preserved, immutable publication, fresh authority before link, staging cleanup, identical retry, conflicting envelope and payload order, revocation, detached effects, producer mismatch and lease mismatch. An initial check-program lexical-scope error was corrected; it was not a source defect. No test/fixture/runner or reusable check script was created; no project ESM, actual filesystem durability, worker/native process or full Controller path was exercised.

## Public-path finding and next correction

**DUR-01 is not complete recovery.** Main traced `native.js:109` and worker before-agent/turn/tool gates: a latched worker is intentionally blocked from fresh model work, including a newly requested report retry. Do not weaken this gate or treat the isolated publisher checks as public recovery evidence.

The existing Controller scanner reads inbox reports and can then declare a settled worker ended without a report. It does not currently ingest the matching retained latch. Its duplicate early return also checks IDs without comparing complete original contents. **DUR-02** assigns only `src/controller.js` to close that witnessed current-runtime path: bounded validated latch → exact existing accept/settlement/evidence flow, complete duplicate comparison, after-await revocation fences, no old-owner adoption or new inference/grant. Initial Controller SHA is `54111de1c76a32bad9a57b3cc003ed9c2697b5e3078da4ff427696fa96d842e9`.

V1 authority has no session/nonce fields of its own: the fresh authority check uses its actual declared fields, while report nonce/producer binding is checked against the worker environment. Do not invent unavailable authority fields or infer physical provenance from these records. Authority-read/link races and directory fsync remain unqualified. Full Host crash/orphan recovery remains AR-04.

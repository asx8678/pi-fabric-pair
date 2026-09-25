# Mailbox/archive foundation checkpoint — not app completion

Scope and remaining delivery order: [NEXT-DELIVERY-EXECUTION.md](NEXT-DELIVERY-EXECUTION.md). Main changed only `src/actor-model.js` and `src/actor-wire-contracts.js` plus documentation. Existing kernel/common/record/migration/facade/runtime/config/util work is preserved. No retained test/fixture/runner/script files were added. No dependency installs, live workers or user-data migrations were performed; behavioral checks were no-file public-module probes.

## Implemented M1-A

- Aggregate ingress retains the real closed `MailboxEnvelopeV2`; a private mandatory-context adapter reuses the actual wire predicates in the same bounded operation.
- Metadata, canonical UTF-8 bytes, owner/store/workflow and full producer/consumer identities must agree. Main is the sole recorder; Main/participant recipient directions are represented. Configured envelope limits and independent ordinary/control capacities are enforced.
- Complete content and endpoint/epoch/idempotency identity determine retries. Message IDs and disposition observation IDs cannot alias other messages. Released entries retain dedup evidence.
- Exact retained retries are no-append noops before **fresh-message** generation/workflow checks, while still requiring current Main/owner and complete content equality. New stale messages remain rejected.
- Disposition records retain full payload, original timestamp and owner. Retries cannot rewrite any of them. A changed unknown outcome remains unsupported until evidence-bound reconciliation exists.
- Ready control traffic precedes ordinary traffic. Service history allows at most two question/answer messages before an available normal message; selecting status does not advance history. Main dispositions record actual modeled service, including unknown attempts. Host must additionally establish runtime eligibility.

Metadata-only old enqueue events remain intrinsically parseable but full aggregate replay explicitly reports unsupported; missing content is not reconstructed. Active V1 readers/formats are unchanged.

## Implemented A1-A

Verified archived segments now fold into one carried private state, then replay the current segment. Rotation no longer resets lifecycle/holds, actual owner/actor bindings, closed workflow/evidence/budget history, mailbox entries/dedup/fairness or prior event identities. Complete graph forking and cache reconstruction include the new records.

Checkpoint owner and actor bindings must equal actual replay; cumulative counters must match, without adding already-cumulative usage twice. Quiescent rotation requires no unresolved workflow, occupied mailbox, reserved activation/kernel effect or unknown accounting. Configuration/definitions/legacy carrier identities cannot change implicitly. Prior event IDs cannot be reused. A prior segment's authority sequence/publication coordinates cannot qualify a new current-segment activation.

Existing migration-leaf original-byte/hash/predecessor/reference checks are retained. External checkpoint obligation/disposition claims, non-quiescent rollover and cross-segment activation proof consumption remain explicitly unsupported. This is bounded semantic replay, not durable archive publication, deletion permission, held-legacy adoption or complete storage recovery.

## Checks and independent review

1. Main ran **22** initial actual-module public/leaf checks for bidirectional envelopes, metadata forgery, identity conflicts, Main-only ingress/dispositions, configured limits, control precedence, unknown occupancy, context guard/work budget, lifecycle/dedup carryover, two rotations, old event IDs, checkpoint/config forgery and original-byte integrity.
2. **Five** additional checks covered the two-priority burst and reset, disposition workflow/time, cursor retry/cache forgery, genuine submission → terminal escalation/closure → archive history/budget retention, and an actual E1 authority-prefix activation. Mailbox proposals in the scheduling check are non-authorizing retained input, not proof that their claimed activation ran.
3. DeepSeek reviewer `8d976129ba9e4607a653e49d67df9ebd` failed before model admission; the task was never sent and no review occurred.
4. Independent Astra reviewer `1373400a4157468e9d5e0edbb87e05fb` stopped **BLOCKED** on two real defects: changed disposition observation times were accepted, and current-generation checks preceded exact retained-message dedup. No additional defect was witnessed in the inspected slice. Main corrected both (and retained owner with timestamp).
5. **Four** focused public checks then passed using genuine generation-1 activation, qualified not-sent containment and genuine generation-2 activation: exact old-envelope retry; new stale versus current generation admission; exact versus changed disposition time; canonical replay/atomic failed retry. These supersede the earlier disposition-retry expectation that used a new timestamp.
6. Reviewer `4c2e71ccf4ab42aba3fe1f5307726949` stopped **CLEAR for both corrections**, including retained-map/fork/cache integration. This is source-only review, not T09 or full-application acceptance.
7. A further public history exercised actual sent/accepted/started observations, native settlement, attributed nonzero usage, trusted accounting reconciliation and terminal closure. Across **two archive rotations**, totals remained exactly **7 input tokens, 3 output tokens and 1.5 cost units**; the original budget deadline and stopped lifecycle survived. No injected/private derived cache was used.

The initial supplemental compiler found only three missing/mismatched mailbox-helper JSDoc parameter diagnostics; those annotations were corrected. Final syntax checks passed for both edited modules. Supplemental compilation with installed TypeScript **6.0.3** and real SDK/Node/MCP/TUI declarations covered **all 24 configured production roots, zero diagnostics**, without exclusions, shims, installs or tsconfig changes. The first final compiler invocation exposed only an unnecessary deprecated `baseUrl` in the probe; removing that probe-only option resolved it without a source change.

Mechanical checks confirmed the original one-argument public mailbox validator, two-argument private context helper **not** exported by the facade, and exactly the existing five aggregate exports. All **259** then-current local documentation links resolved; no test/fixture/script file changes were found. `git diff --check` passed. Package dry-run (scripts disabled) succeeded with **76 files**, the new plan/checkpoint included, no test/fixture/dependency/session directories and no tarball publication.

Final source SHA-256:
- `src/actor-model.js`: `121fd084954fc85da25e7f946863f236add77987e484a81d6d1bf4d753934875`
- `src/actor-wire-contracts.js`: `257813572a93eb8c0748573fbeb6b68d691d21fb7bc762ebf03b1c0c02a012c2`

A final bounded Contour scan of the **whole dirty worktree**, not only this slice, reported 22 changed source files, 124 structural findings, zero policy violations/file-extraction gaps and 37 unresolved imports. Its five displayed findings were complexity advisories in aggregate/kernel/runtime reducers; no score-based rewrite was made. The remaining findings were not exhaustively reviewed, graph resolution is partial, and this does not substitute for T09 or prove runtime correctness. No retained automated suite or native qualification is claimed.

## Still open

M1-B evidence-bound unknown reconciliation and runtime eligibility; complete E2 structural replanning/budget lineage/supersession; full implementer/report/inspection/approval resource fit; held-legacy projection and durable archive/store integration; T09/T10; ActorHost, restricted supervisor, supervised runtime, sleep/wake, safe Apply, observability and final release review. A successful bounded model history does not close these gates.

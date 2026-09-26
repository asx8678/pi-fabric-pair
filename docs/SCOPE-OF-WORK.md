# Scope of work — qualify Fabric Pair V1

**Current seven-part completion request:** [NEXT-IMPLEMENTATION-PLAN.md §8](NEXT-IMPLEMENTATION-PLAN.md#8-seven-part-completion-plan) is the consolidated delivery handoff: independent review/freeze; coupled Host/store and legacy/migration/archive/recovery; restricted two-runtime supervision; optional sleep; configuration/observability; then separately authorized native qualification. The §10 no-tests directive was superseded by the P3 testing-documentation reconciliation: the retained offline suite is re-adopted as regression coverage and described in [README](../README.md) and [TESTING.md](TESTING.md). This planning update changes no production code or provider configuration.

> **Owner directive (historical):** all automated tests, fixtures, test/probe runners, and generated test evidence were removed, and adding or regenerating them was prohibited at the time. **Superseded by the P3 reconciliation decision:** the retained offline suite is re-adopted as regression coverage for its listed areas and documented in [README](../README.md), [TESTING.md](TESTING.md) and [CHANGELOG](../CHANGELOG.md). **[§10](#10-current-scope-after-test-removal) is retained as historical scope framing, not a current prohibition.** Earlier implementation requirements remain context; earlier test deliverables and pass counts are historical, not current release certification.

**Status:** implementation in progress, not release-qualified. AR-01/NEXT-02/AR-02 source checkpoints are historical delivered slices; AR-03 is now partly implemented, with seven of ten tasks accepted at the last stable baseline and T08 incomplete. The user's **complete all** instruction is tracked in [the completion execution ledger](COMPLETION-EXECUTION-PLAN.md): accounting, durable-retry and LR/prefix corrections have bounded source checkpoints. The renewed five-area plan-and-implement request is mapped to concrete checks in [the delivery plan](FIVE-AREA-DELIVERY-PLAN.md), with submission/authority implementation and the latest [mailbox/archive foundation](MAILBOX-ARCHIVE-CHECKPOINT.md) boundedly checked. Unknown-delivery reconciliation and structural replanning are now source-implemented and partially checked; see the [current checkpoint](RECONCILIATION-REPLAN-CHECKPOINT.md). The [Q01 inline-retention checkpoint](Q01-INLINE-INSPECTION-CHECKPOINT.md) now covers the full acceptance-bearing public history through archive under unchanged caps; independent foundation review remains open. The [scope-checked next implementation plan](NEXT-IMPLEMENTATION-PLAN.md) corrects the remaining order: Q01 → F1/T09/T10 → coherent Host/held-migration/mailbox integration → supervisor/workflow → sleep/configuration/observability. The [downstream audit](DOWNSTREAM-RUNTIME-SCOPE-AUDIT.md) identifies the remaining runtime integration, not completed delivery. Remaining model/review/Host/supervisor/workflow/idle/configuration work is dependency-ordered, not delivered. This is not runtime or V1 release certification.

**Baseline:** submitted `pi-fabric-pair` 0.1.0, the original handoff, and the review performed in this conversation.

**Execution plan:** [historical no-tests implementation sequence](IMPLEMENTATION-PLAN.md#13-active-implementation-plan-after-test-removal), as explicitly reconciled by the [actor-owned RPC roadmap](ACTOR-RPC-IMPLEMENTATION-PLAN.md).

**Release ledger:** [ACCEPTANCE-LEDGER.md](ACCEPTANCE-LEDGER.md).

## 1. Scope decision

Finish and harden the existing standalone extension. Do **not** restart the project or expand it into a multi-agent framework.

The target is an explicitly enabled Main session plus **one active code writer, one unresolved workflow and one serialized workflow-review flow**. The actor-owned RPC roadmap refines the retained worker as a restricted supervisor plus an implementer; actor mode cannot activate multiple implementation writers. This roadmap, not a wholesale V1 rewrite, governs future architecture work. Preserve the worker map and IDs for future expansion. Main remains the user's native conversation, model and UI. Worker retains normal, verified Fabric/Fovea resources under a tested capability profile.

The original `pi-fabric-pair-handoff/IMPLEMENTATION_PLAN.md` and `ACCEPTANCE_TESTS.md` remain the requirements baseline. This scope orders the remaining work; it does not silently waive V1 acceptance rows. Proposed compatibility choices below require approval before becoming product policy.

## 2. What already exists and should be retained

- Ordinary extension registration, Main/Worker role separation and one JSONL RPC adapter.
- Asynchronous dispatch, questions, checkpoint decisions, cancellation, worker reuse and private coordination state.
- Report/task/lease identities, duplicate-decision protection, content-addressed evidence and stale-snapshot checks.
- Minimal/off indicator, settings dialogs, native Main model control and no custom compactor/warmer.
- Production runtime guards and documentation that distinguish source inspection from behavioral qualification. The removed test suites are not a retained deliverable.

Historical checkpoints recorded 55, 59, 81 and finally 86 offline passes plus five narrow native scenarios. Their suites, runners and artifacts have since been removed and those counts are not current evidence. The historical pinned-toolchain implementation compiler run exited 2 with 538 Pair-source and zero dependency diagnostics, down from the 620-source baseline. Retained tooling is `typecheck` and `pack:check`, not automated behavioral acceptance. The supplied Pi/Fabric/Fovea reference sources remain outside the edit scope.

Implemented so far: disabled-by-default opt-in, V2 disabled migration previews with explicit backup-on-save, shipped/handoff format detection, conflict diagnostics, field provenance, normalized review aliases, malformed-role rejection, bounded deferred-limit preservation, distinct active-step/per-step policy fields and confirmation-gated import of explicitly selected retained backups, one live/unresolved worker across preserved slots, unsupported read-only Fabric rejection, post-report outer-invocation abort, explicit-background rejection, required zero shell auto-spill/no agent recursion, Pi-owned empty-session materialization, symlink-ancestor evidence rejection, batch-level verification snapshot checks, exact Fovea read-tool names, exact development pins/lockfile, and runtime-validated state/policy/limits/authority/latch/report envelopes with guarded identity counters and explicit known-legacy identity migration. This is progress evidence, not whole-matrix release certification; full strict typing, transition/delivery/queue contracts, admitted-effect concurrency, Main writer coverage, branch fencing, lifecycle semantics, queues/budgets, UI/permissions/context, and packaging installation gates remain.

## 3. Original defects and remaining remediation

The table records the original review findings, not eleven unchanged failures. Narrow regression fixes for DEF-01–DEF-05 and DEF-09 are recorded in section 2 and the acceptance ledger; remaining coverage and product work are prioritized in section 8. No remediation package is certified complete.

| ID | Work item and observed gap | Primary code | Phase |
|---|---|---|---|
| DEF-01 | Gate every reachable task-affecting action. A native `state.transition` committed from a read-only worker, including after `pair_report`. Pi `tool_call` replay is not a universal Fabric provider preflight. | `src/native.js`, `src/worker.js`, `src/controller.js` | R0, R2 |
| DEF-02 | Require known-effect quiescence. A native background shell job changed source after Pair had accepted the task as completed. | `src/controller.js`, `src/worker.js`, `src/rpc.js` | R0, R2 |
| DEF-03 | Prevent evidence traversal through symlinked ancestors. Outside sentinel bytes were copied into the evidence store. | `src/evidence.js`, `src/util.js` | R3 |
| DEF-04 | Handle native lazy session persistence. Start → stop → start before the first assistant message fails because Pi has not created the file. | `src/controller.js`, `src/native.js` | R0, R4 |
| DEF-05 | Bind executed checks to the exact reviewed source. Checks can pass before a later command changes the checkpoint. | `src/evidence.js`, `src/controller.js` | R3 |
| DEF-06 | Fence ownership on same-session `/tree` navigation. No branch event/epoch currently invalidates old grants. Source finding; native reproduction still required. | `src/main.js`, `src/controller.js`, `src/worker.js` | R4 |
| DEF-07 | Make stop sticky and implement distinct on/off/pause/resume semantics. Dispatch currently restarts a stopped worker; disabling leaves its grant active. | `src/main.js`, `src/controller.js`, `src/config.js` | R1, R4 |
| DEF-08 | Exclude human waiting from active execution budgets. Review waiting currently consumes `taskTimeoutMs`. | `src/metrics.js`, `src/controller.js` | R5 |
| DEF-09 | Use real Fovea tool names and prove coverage. The original classifier rejected `fovea_sketch` and `fovea_dwell`; the names are now corrected, but native root/parser coverage remains. | `src/native.js`, tests | R2, R6 |
| DEF-10 | Enforce Main's single-writer policy across the supported effect surface, not just direct edit/write names. | `src/main.js`, capability-profile integration | R2 |
| DEF-11 | Complete bounded cooperation: queued tasks/reviews, report limits, per-step revisions, plan revisions, escalation and delivery recovery. | `src/controller.js`, `src/schema.js`, `src/config.js` | R4, R5 |

DEF-01 and DEF-02 are integration blockers, not name-allowlist or prompting fixes. The initial task is to establish a supported public mechanism or explicitly reject the affected profile.

## 4. Included V1 completion work

- **Configuration and consent:** disabled by default, deliberate enablement, trusted scope/provenance, finite limits, safe migration, model-native effort validation, immutable per-assignment policy.
- **Runtime and ownership:** verified resource selection/deduplication, retained native identities, sticky lifecycle holds, branch/generation fences, conservative crash recovery and idempotent shutdown.
- **Authorization:** no new effects after yielding; already admitted effects reconciled before evidence freeze; no recursive delegation; independent human permission authority.
- **Evidence:** bounded complete-enough source identity, safe paths, immutable artifacts, explicit omissions, observed verification tied to snapshot identity, revalidation before approval and continuation.
- **Cooperation:** original `final-only`, `milestones`, `every-step` semantics; questions always allowed; Main escalation; final review required by default, with an explicitly user-configured opt-out that never disables safety checks.
- **Context/accounting:** native compaction in both participants, bounded state restoration, Fovea root/coverage verification, actual model/effort observations and deduplicated usage. Unknown prices/cache data remain unknown.
- **UI/permissions:** all planned `/pair` lifecycle commands, Apply/Cancel, pending settings, serialized worker-labelled dialogs, cancellation/timeouts, narrow-terminal and ASCII support; indicator remains cosmetic.
- **Qualification:** deterministic native integration, negative/fault tests, full acceptance evidence, clean packed installation/removal and supported-profile documentation.

All applicable original V1 rows remain release requirements. A documented limitation is not a substitute for rejecting an unsafe runtime profile.

## 5. Deferred or excluded

**Defer to separately qualified VNext:** multiple simultaneous workers, parallel investigators, parallel writer worktrees, integration/merge automation, adaptive supervision, automatic model routing and cost-optimization experiments. Existing configurations/history must be preserved; unsupported activation must fail clearly, not silently drop workers. A single read-only slot may be supported only if independently qualified; parallel read-only operation is not needed for V1.

**Not part of this work:** replacing Pair's Main-owned actor model over the existing retained Pi RPC transport with upstream Fabric actors/SDK or another actor model, a new transport, distributed scheduler, remote service, daemon, web dashboard, custom compactor/cache warmer, OS sandbox, autonomous deployment, destructive artifact cleanup, or replacement of native Pi/Fabric UI. This does not exclude the explicitly approved in-repo actor-owned RPC implementation plan.

No Pi/Fabric/Fovea source, installed dependency, production settings or credential file may be patched to make Pair pass. If an upstream change is necessary, prepare a separate request and seek explicit scope approval. Paid-provider tests and benchmarks require separate budget authorization.

## 6. Compatibility decisions and implementation status

The implemented rows describe the current uncommitted working tree, not release qualification. The remaining choices still require a recorded compatibility decision:

| Decision | Recommendation / required treatment |
|---|---|
| Source language | Preserve executable ESM JavaScript and add strict TypeScript `checkJs`/JSDoc checking plus public Pi types. Avoid a bulk rename/rewrite. This is an explicit alternative to the handoff's TypeScript-source preference; use incremental TypeScript instead if selected by the owner. |
| Config filenames | **Implemented in the working tree:** canonical `fabric-pair.json` and cosmetic `fabric-pair-ui.json`; handoff `pair.json` is a disabled preview requiring explicit Apply, and same-scope filename conflicts fail. Explicit same-scope re-import of older handoff backups is implemented; failure-injection/native qualification remains (§9.1). |
| Config version | **Configuration foundation implemented:** V2, disabled previews, backup-on-save, legacy-consent reset and deferred-field preservation/import. Record compatibility for already-saved V2 files and retained tasks before enforcing queue/time/revision semantics; fault/native qualification remains (§9.1). |
| Review aliases | **Implemented in the working tree:** `final` → `final-only`, `strict` → `every-step`, milestones retained and `adaptive` rejected pending explicit selection. Full policy semantics and native qualification remain R5/R6. |
| Required final review | Keep default `true`; implement the original explicit opt-out only after verified quiescence/evidence checks work. Label completion `not Main-reviewed`. Models cannot change it. |
| Empty native sessions | **Selected and implemented:** Pair creates a private empty path and passes public `--session`; Pi writes and owns the JSONL header. Startup verifies a nonempty file, exact path and stable session ID. No inference or fabricated JSONL is used. |
| Supported environment | First qualification candidate: the reviewed Node 24+/macOS native stack, pinned by actual build/resource identity. Linux and Windows/Bun are not certified by package version alone; add each only after its applicable tests pass. |

Keep Pi-supplied peer declarations consistent with Pi's packaging contract. Pin development/test versions and record supported profiles; a peer `"*"` must not be presented as universal runtime support.

## 7. Deliverables and completion

Deliverables: corrected Pair modules, permanent unit/RPC/native regression fixtures, a reproducible isolated test profile, strict checks and a lockfile, updated schema/example/skill/UI docs, `docs/INTEGRATION_PROBE.md`, refreshed compatibility/security/testing reports, a completed acceptance ledger, and a clean installable artifact.

Completion means:

1. Every applicable V1 ledger row has required-layer evidence for the selected profile.
2. Every DEF item is closed by behavior tests, not just prose or mock hook calls.
3. Retained Main/Worker identities survive ordinary work; supported stop/recovery semantics are honest.
4. Report → quiescence → evidence → verification → decision → continuation cannot skip a safety gate.
5. Unsupported configurations fail at setup/activation before effects; Main remains usable.
6. No upstream modifications, unwanted model calls, hidden privilege grants or fabricated cost claims.

Do not assign a firm delivery date before R0 establishes the public API path. The critical uncertainty is feasibility of enforcement/persistence, not the amount of UI work.

## 8. Remaining scope after the first safety slice

**Implementation baseline:** HEAD `ca09923` plus the current uncommitted R1 configuration and IMP-01/02 corrective foundation patch on `main`. Recorded evidence is 86 offline passes and five deterministic native scenarios; neither closes R0–R7. The seven earlier disposable fixture/function/registration checks below remain gap observations, not feature passes or native qualification. Five focused regressions now cover bounded verification output/full artifacts, restart round-trip, activation state-save containment, failed revocation shutdown, and stored decision/report/current-state relationships. Legacy pending-review migration and the broader durability/version/type work remain open.

### Release boundary

- **Required for the first V1:** all applicable core ledger rows on one explicitly advertised Node 24+/macOS Pi/Fabric/Fovea profile. Main-write authorization, known-effect reconciliation, ownership fencing and recovery are release blockers, not optional hardening.
- **Separate profile expansion:** Linux, Windows, Bun and additional upstream/provider combinations need their own applicable qualification before being advertised. They do not block a deliberately macOS-only release. Unsafe effect/configuration profiles must still be rejected; an untested OS is not automatically certified by the package manifest.
- **Optional, separately authorized evidence:** paid live-provider workflows and cost/cache benchmarks (H06–H07). Require an explicit provider/budget decision; do not include them in default CI or claim savings without measurements. Deterministic native Main/Worker qualification remains mandatory.
- **Still VNext:** parallel workers/investigators, parallel worktree writers and integration/merge automation. Do not expand these while completing the one-worker invariants.

### Required work packages and exit checks

Paths below are relative to the package root. Symbol references describe the reviewed working tree; line references in §9 are review-time anchors, not stable APIs.

| Work package | Remaining scope and source witness | Completion evidence |
|---|---|---|
| **R1 — Configuration, consent and contracts** | V2 normalization now previews shipped V1 and handoff `pair.json` as disabled, requires explicit Apply, archives the source, reports conflicts/provenance, replaces arrays, ignores untrusted project files, normalizes `final`/`strict`, rejects `adaptive`, and rejects malformed roles. Owner epochs now advance on controller replacement, worker generations on process replacement, attempts on continuation, and report/decision delivery has durable operation IDs. The six deferred limits and distinct active-step/per-step fields now have bounded V2 representation, fresh-import and explicit retained-backup import paths, and dispatch-time policy/limit copies. Preservation across resume and runtime consumption remain open; these are not yet lifetime-immutable task policies. Still required: full grant/hold state-machine contracts, strict checking and a pinned development lockfile. | Current U coverage proves old/current/handoff input, untrusted project isolation, conflict, malformed role, disabled consent, backup, provenance, selected-scope layer saves, cancelled/repeated/stale backup import, custom limits, assignment snapshots, incomplete-model rejection and invalid-effort no-inference rejection. A02, A04–A05 and A07 still require remaining T/N evidence; native/TUI settings and write-failure injection remain. |
| **R0/R2 — Main authorization and admitted effects** | `src/main.js`'s `tool_call` hook gates only direct mutation names. `PairController.scan/activate` use settlement/idle/compaction observations, and `src/worker.js` retains a single `currentTool`, not an operation barrier. Prove a public enforcement mechanism or an immutable restricted surface for Main and Worker; close admission atomically and reconcile every admitted call/job by grant/generation before evidence capture. Include profile widening, recursion, sibling calls, cancellation and another Pair owner in the same workspace. | E01–E04, E12, F10, H11 with real native/captured/provider paths. Adversarial simultaneous calls must finish or become explicitly uncertain before review; sequential post-report abort alone is insufficient. Missing public coverage is a no-go requiring rejection or a separately approved upstream request. |
| **R3 — Finish evidence qualification** | Symlink-ancestor and batch-level mutation regressions pass. `verifyConfigured` in `src/evidence.js` still runs checks without per-command source identity; `PairController.finalizeReport` compares only around the whole batch. Add identity-bound results and checks between commands, continuation-time revalidation, path-swap/storage integrity cases, dirty/mode/comment/binary/rename coverage and explicit omissions. | E05–E11, including mutation followed by restoration within a batch, stale approval during a readiness wait, outside-path sentinel exclusion and dirty-user-change preservation. No claim of an OS sandbox or immunity to arbitrary hostile filesystem races. |
| **R1/R4 — Branch and generation fencing** | Durable owner epoch, worker generation, attempt and delivery-operation identities are now persisted and carried through worker authority, handshakes, reports, latches, decisions and Main delivery entries; offline restart/rotation checks pass. `src/main.js` still has no same-session tree-navigation event fence, and crash/rebind delivery reconciliation is not implemented. | C08–C11, D12–D13, H01–H02: native `/tree`, fork/new/reload, stale queued reports/decisions and competing owners cannot renew obsolete authority. Normal message progression must not invalidate legitimate work. |
| **R4 — Lifecycle, transport and crash recovery** | `stopUnlocked` closes a process without a durable dispatch hold; `resume` renews a lease instead of restoring a pending question/review as waiting. Add distinct on/off/start/stop/pause/resume semantics, resource deduplication, conservative session observations, durable delivery reconciliation, schema-validated state, bounded transport/UI buffers and idempotent owned-process shutdown. | B02–B13, C01–C12, H01–H03: three native assignments retain identity/PID during normal use; explicit restart retains conversation, not PID. Crash windows, missing history, parent death, disk failure, negative/late RPC responses and cancellation never cause blind replay or kill an unrelated PID. |
| **R5 — Queues, policies and budgets** | `dispatchUnlocked` rejects another unresolved assignment rather than queueing it. `src/metrics.js:19–24` counts time since `startedAt`; `resume` resets that timestamp/turns and copies current policy. Implement finite durable task/review queues, UTF-8 report limits, per-step revisions, plan revisions, `needs_user`, bounded report-only repair and deduplicated delivery. Accumulate active time by state, excluding review/question/permission/queue/paused waits without erasing prior work on resume. | D01–D15 and G15 with fake-clock and crash/replay tests; overflow is explicit backpressure, approvals cannot advance twice, resumed work cannot reset budgets, and task policy remains immutable except explicitly authorized changes. |
| **R6 — Context, permissions, native UI and accounting** | Existing registration/mock tests are not native qualification. Complete real Main/Worker compaction and recovery, bounded/deduplicated restoration, actual Fovea root/parser coverage, all four permission-dialog paths, cancellation/rebind, pending settings, native effort/reviewer observations, usage-event deduplication and narrow/ASCII/theme/input behavior. | F01–F15 and G01–G15 at their specified layers: no hidden inference/warmer, no privilege from code approval, no lost decision during compaction, no misleading unknown cost/cache data, and UI remains cosmetic. |
| **R7 — Installable release and evidence** | `pack:check` is a dry-run only. Produce/inspect a real tarball; install in a fresh isolated profile outside the source tree; verify imports, skills, one-copy resource loading, disable/removal and preserved histories. Add opt-in redacted diagnostics and update every public schema/example/skill/doc against actual behavior. | A01, A11–A12, G16, H04–H05 plus the full ledger: deterministic native Main-and-Worker plan/question/revision/final workflow, native TUI checks, supported/rejected-profile evidence and durable sanitized artifacts tied to exact source/build identities. |

### Recommended execution order

The four implementation slices below refine R1–R5; they do not replace the remaining R6/R7 work or waive original acceptance rows. Paths are package-relative; new helper/test paths are proposed, not existing registrations.

| Slice | Included deliverables / primary files | Exit checks and boundary |
|---|---|---|
| **S1 — Strict pinned tooling (R1)** | Exact development pins for TypeScript, Node typings and the qualified public Pi types; `package-lock.json`, strict `allowJs`/`checkJs`/`noEmit`/Node-compatible `tsconfig.json`, JSDoc boundary types, `npm run typecheck` and a CI gate. Primary files: `package.json`, `src/*.js`, `scripts/check.js`, proposed type-test fixtures/CI. Retain executable ESM JS and Pi peer requirements. | Fresh `npm ci`, strict checking of every production module, deliberate invalid API/event/state fixtures rejected, existing checks green, and a packed runtime-load smoke test without development dependencies. No broad `any`, ignored source errors, bulk language rewrite or bundled Pi/Fabric/Fovea. This is tooling, not authorization proof. |
| **S2 — Validated shared contracts (R1)** | Versioned state, authority/latch, report, delivery, queue, policy and counter contracts; runtime parsers and explicit legacy migrations; a pure transition table with independent tests. Carry the task's policy **and limits** into Worker authority. Primary files: `src/schema.js`, `src/controller.js`, `src/worker.js`, `src/rpc.js`, minimal proposed `src/contracts.js`/transition helper and tests. | Round trips and boundary validation reject malformed/unknown state, invalid or overflowing counters and inconsistent identity tuples before a grant. Known legacy state/history is preserved by explicit migration. Pure transition tests cover hold precedence, closed-grant replay, pending obligations and uncertain delivery. No queue pump, automatic repair or mutation retry is enabled in this slice; live transition enforcement is S3. |
| **S3 — Safety integration (R2/R3/R4)** | Wire the contracts into admission/quiescence, durable stop/off/pause, review-preserving resume, same-session branch/rebind fencing and separate worker-delivery/Main-notice journals. Preserve task policy and cumulative budgets across resume; changes require explicit policy authorization. Complete per-command verification identity and revalidation after readiness waits. Primary files: `src/controller.js`, `src/worker.js`, `src/main.js`, `src/native.js`, `src/rpc.js`, `src/evidence.js`. | Permanent lifecycle, stale-owner, competing-writer, concurrent-effect, disk/crash and source-mutation regressions; relevant native gates close on the advertised surface. Unknown effects/delivery remain held, not review-ready or blindly replayed. Pending questions/reviews survive pause/restart/resume. No unconditional exactly-once transport claim. |
| **S4 — Enforce bounded cooperation (R5)** | Consume all six migrated queue/report/repair/recovery fields plus active-step time and per-step revisions. Durable single-worker task/review queues, explicit backpressure, unique-report accounting, UTF-8 payload checks at both ingress points, report-only repair and bounded reconciliation. Primary files: `src/controller.js`, `src/worker.js`, `src/schema.js`, `src/metrics.js`, fixtures/tests. | Boundary/zero/overflow/Unicode tests; duplicate delivery consumes no extra report or action; replay/restart does not reset counters; fake-clock waits do not spend active budgets. A queue acknowledgement grants no execution. Repair cannot obtain an implementation lease; recovery never blindly repeats a mutation. D08/D10–D11 remain open until these consumers pass. |
| **Release follow-through — R6/R7** | Native context/Fovea/permissions/usage/TUI behavior, full Main-and-Worker workflows, actual isolated tarball install/disable/remove and source/build-linked evidence. | Every applicable original V1 acceptance row passes at its required layer. The S1 runtime-load smoke test and existing five worker-side native scenarios do not close this release gate. |

**Dependency rules:**

- S1 scaffolding starts first; S1 annotations and S2 concrete contracts may be co-developed. Neither foundation is complete with excluded production modules, unvalidated disk/RPC data or placeholder types. Do not rebuild migration features already covered offline.
- Run R0 GATE-A/GATE-B public effect-coverage/quiescence probes alongside S1/S2. A missing public seam requires pre-effect rejection of that profile or a separately approved upstream request, not a prompting workaround. Five narrow native passes do not settle these gates.
- Integrate S3 controller changes sequentially: validated loading/persistence, holds and policy continuity, admission/quiescence, then branch/delivery reconciliation. R3 evidence work can proceed independently, but safe continuation must pass before S4 activation. Keep admitted effects closed throughout failed transitions.
- Specify queue occupancy/reservation and zero semantics before enabling S4: a zero queue cannot justify losing a required review. Keep payload-byte, transport-envelope, active-time, legacy wall-clock and native RPC deadlines distinct; record compatibility before changing old policy semantics.
- Migration follow-ups remain in scope: write-failure/rollback and stale-scope tests, native/TUI trust/import qualification, and versioned handling of already-saved V2 files/tasks. Configuration acceptance is not runtime enforcement.

**Current bounded progress:** [M1-A/A1-A](MAILBOX-ARCHIVE-CHECKPOINT.md) implements envelope/content dedup, persistent service history and quiescent archive state carryover. Two independently identified retry defects were corrected and re-reviewed. M1-B unknown reconciliation and E2 structural replanning are source-implemented with bounded checks, not fully accepted; Q01's bounded public-model history now passes, while foundation review/freeze and Host/runtime integration remain open under [the corrected implementation order](NEXT-IMPLEMENTATION-PLAN.md).

**Current implementation target:** finish AR-03's remaining actor lifecycle/accounting/mailbox/archive/public-path work and the shared-budget seams, then independent T09 review and T10 re-freeze. [Completion execution](COMPLETION-EXECUTION-PLAN.md) records exact live ownership and subsequent AR-04 coherent Host/migration/publication, AR-05 supervisor, AR-06 two-runtime workflow, AR-07 idle policy and AR-08 configuration/observability. Independent legacy durability fixes may precede Host integration without activating formats. Existing source checkpoints do not close runtime gates; parallel writers/worktrees, automatic recovery and new transports remain outside the approved product scope.

### Focused next scope: M1-B and E2

The [implementation plan](RECONCILIATION-REPLANNING-IMPLEMENTATION-PLAN.md) records the now source-implemented reducer paths: immutable unknown-delivery resolution, late contradictory facts, report-boundary structural commit, lifetime step catalog/shared budget lineage, review debt and permanent candidate supersession. It also addresses once-only counting when task and workflow plan revisions advance together. Preserve V1 hashes/formats, 27 kernel kinds and existing caps. This batch remains pure-model work; Q01's bounded public-model history passes; fresh independent foundation review is pending. Host-backed evidence production and eligible service are M1-H, integrated with the coherent H1 cutover after foundation freeze. No new runtime/config rollout or test files are authorized. All feature acceptance rows remain open.

## 9. Scope check of the five outstanding items

These are overlapping deliverables, not five independent projects. R1 defines the contracts; R2 enforces grants; R4 implements lifecycle/ownership/recovery; R5 consumes those contracts for queues. “Remaining R2–R7 qualification” includes missing runtime implementation, not just more tests. Retain the one-worker V1 boundary.

### 9.1 Deferred queue-field migration — R1 schema, R5 enforcement

**Implemented configuration foundation:** `src/config.js` now normalizes all six handoff limits with finite bounds and explicit zero semantics, preserves `activeStepTimeoutMs` and `maxRevisionsPerStep` separately from the existing wall-clock/task-wide fields, and snapshots them into new assignments. `/pair import-backup` previews one explicitly named same-scope handoff `.v1.bak` (including numbered backups), requires confirmation, preserves the source and unrelated V2 fields, and rejects untrusted project, redirected or stale previews. Pair does not search for a backup and warns that R5 enforcement is pending.

**Implementation boundary:** `PairController.dispatchUnlocked` copies policy/limits, but `resume` replaces them and resets timing (`src/controller.js:461–468`). `writeAuthority` omits task limits (`183–189`), and Worker still checks a summary-specific JavaScript character count (`src/worker.js:82–83`). S2 must transport validated limits; S3/S4 must preserve policy and enforce the correct counters/bytes/time. The current snapshot test proves independence from later config-object mutation, not lifetime immutability.

| Original field | Current config default | Consumer / required meaning |
|---|---|---|
| `maxQueuedTasks` | 8 | Durable pending assignments, excluding the active assignment; one executing worker, not parallel activation. |
| `maxQueuedReviews` | 8 | Bounded pending Main notices/reviews; preserve required reviews and return backpressure before accepting more work. |
| `maxReportsPerTask` | 40 | Unique reports across attempts/revisions/restarts; duplicate delivery does not consume another report. |
| `maxReportBytes` | 16384 | UTF-8 serialized report payload, checked at worker and controller ingress; separately bound the transport envelope. |
| `maxAutomaticReportRepairs` | 1 | Report-only repair, never another implementation lease; zero disables repair. |
| `maxAutomaticRecoveryAttempts` | 1 | Bounded reconciliation, never blind mutation replay; zero disables automatic recovery. |

Remaining work:

- R5 must enforce the normalized values at durable task/review queue, UTF-8 report ingress, report-count, report-only repair and conservative recovery boundaries. Zero may disable a queue/automatic action; it must never silently increase a limit or drop a required review.
- Implement active-only monotonic time and per-step revisions using the distinct preserved fields. Existing wall-clock/task-wide and native transport limits remain separate until an explicit compatibility change.
- Add write-failure/rollback injection, native/TUI import and trust checks, Unicode report-boundary tests and distributed-V2 upgrade handling before release. Keep the retained source as history and expose scope provenance; do not infer enforcement from configuration acceptance.

**Current exit status:** custom values round-trip through fresh handoff import and explicit already-migrated backup import in U tests, including cancellation, repeated import, trust/path and stale-preview cases. A06's offline migration/provenance requirement is covered. D08, D10–D11 and H03 remain open until runtime enforcement and failure matrices pass.

### 9.2 Full grant/hold state machine — R1/R2/R4 safety blocker

**Current witnesses:** `PairController.updateConfig`, `dispatchUnlocked`, `activate`, `pauseUnlocked/resume/stopUnlocked`; Worker authorization hooks; Main settings apply and command handlers in `src/main.js`. A stop can still be undone by model dispatch; disabling configuration still leaves current authority running; pause/resume during review still creates another attempt and supersedes the unanswered notice. The IMP-02 slice now runtime-validates persisted state and state/authority/latch/report identities, rejects corrupt/exhausted identity counters, explicitly migrates known pre-identity fields and carries assignment limits in authority. This is contract hardening, not the required grant/hold transition model; all three lifecycle defects remain open.

Required work:

- Separate **task state**, **runtime state**, **grant state** and durable **hold reasons**. Define one transition table and centralize authority-changing transitions rather than scattering boolean checks. Existing IDs are useful foundations, not proof of an enforced state machine.
- Bind grants and operations to canonical workspace, owner session/epoch, worker slot/generation/native session, task/plan revision/step or group, attempt and lease. Make admission atomic with `running → quiescing → waiting/paused/closed`; a closed lease cannot reopen by replaying an older authority/latch.
- `/pair stop`: persist a root-session dispatch hold even if no process exists; close owned runtime(s), retain history. Neither model dispatch, autostart nor a queue pump clears it. `/pair off`: disable new work, revoke admission, reconcile admitted effects, persist and close. Settings disable must use the same transition, not only change a boolean.
- `/pair on` may clear the disabled hold after validation; `/pair start` may deliberately clear a stop hold and reconnect without inference. Neither silently resumes interrupted work. `/pair resume` reconciles first and restores pending question/review/blocker as waiting; it must not supersede that obligation or reset budgets/policy. Specify hold precedence and cancellation/reset behavior explicitly.
- Track each admitted operation/job by stable identity and outcome. `agent_settled`, an idle flag, an outer abort and one `currentTool` are not an admitted-effect barrier. Unknown completion remains held/needs-user, never review-ready. Configured verification gets narrowly scoped authority, not an unrestricted Main write bypass.
- Define runtime validation/versioning for persisted state and journals. Reject malformed/overflowing identity counters; migrate known legacy shapes explicitly instead of silently normalizing corrupt counters back to 0/1. Persist recovery identity before granting effects; disk errors must leave authority closed.
- Make the S2 contract boundary explicit: persisted state version versus wire protocol version; task/runtime/grant discriminants; hold reasons and precedence; complete identity tuple; assignment policy/limits; queue entries, unique report/repair/recovery counters and delivery records. Validate at Controller and Worker load/ingress points; an annotation or object cast is not validation. Add a guarded increment for each identity counter and retain corrupt bytes for diagnosis rather than rewriting them as new state. Keep transition decisions independently testable; side effects remain in the existing controller/bridge, not a new workflow engine.

**Exit:** stop-before-start and stop-after-task both stay held; off/disable closes existing authorization; review/question survive pause/restart/resume; concurrent report/tool/pause/cancel/close cannot admit late work; holds and accounting survive reload. Cover DEF-07, E01–E04/E12, C04–C10, D13 and H01–H03. GATE-A/GATE-B still require a demonstrated public enforcement/tracking seam or explicit pre-effect rejection of an unsafe profile.

### 9.3 Same-session branch fencing and crash/rebind — R4 safety blocker

**Current witnesses:** `registerMain.bind/ready/notifyMain` (`src/main.js:41–78`) check session/root but no branch; event registrations at 151–179 contain no `session_before_tree`/`session_tree`. `PairController.init` advances epochs and rewrites stopped authority, and report ingress checks identities, but `decideUnlocked` does not require an explicit rebind of a retained old-epoch report. A fixture restart approved such a report under epoch 2 after it was produced under epoch 1. Delivery IDs exist, but `deliverNotice/inbox` and `activate/decideUnlocked` lack a reconciled delivery journal.

Required work:

- Fence admission and capture plain identity before navigation/replacement; handle committed tree navigation with a fresh context and owner epoch. Handle cancellation, no-op navigation, failed summarization, fork/new/resume/reload and delayed callbacks. Normal message leaves and compaction must not invalidate legitimate work. An abandoned branch cannot answer a current permission dialog or renew a grant.
- Qualify the existing public hooks, not a proposed private API. Both the supplied source and installed Pi declarations expose `session_before_tree`, `session_tree` and reasoned `session_shutdown`. Source: `source refernce/pi/packages/coding-agent/src/core/extensions/types.ts:584–674`; navigation dispatch: `agent-session.ts:3594–3660`. A cancellable pre-event is not proof that navigation committed.
- Introduce an explicit adoption/rebind operation for retained pending reports, after ownership and evidence reconciliation. Check identity at decision consumption, permission reply, notice delivery and activation, not only report ingress. Keep stale data for diagnosis; stale messages must be inert even if still visible in Main.
- Journal worker delivery as prepared/sent/accepted/started/settled, with uncertain outcomes and bounded reconciliation; correlate actual worker observations before resending anything. Use separate Main notice queued/observed/resolved states. Pi `sendMessage` and `appendEntry` return `void`, not durable recipient acknowledgements (`extensions/types.ts:1483–1499`); a return from either is not proof the model consumed a report.
- Reconcile state, worker authority/latch/outbox/archive, native session identity and branch-local Main delivery entries after each crash window. `scan` currently archives inbox files and `init` drops `pendingReport` during interruption; required reviews must not disappear in that window. Retain one logical report/decision and never replay effects to repair notification uncertainty. If the public API cannot disambiguate delivery, surface uncertainty/manual reconciliation rather than claim unconditional exactly-once transport.
- Test competing owners, stale handles/nonces, wrong/missing session files, partial/corrupt journals, disk-full and parent death. Never kill a process only because its PID appears in saved state.

**Exit:** U/R crash-injection matrix plus native same-session `/tree`, fork/new/reload and stale queued report/decision/UI tests satisfy C08–C11, D05–D06/D12–D13 and H01–H03. The existing native `idle-restart` scenario only stops/starts a worker under the **same controller**; it is not native controller-replacement or branch-recovery evidence.

### 9.4 Strict pinned development tooling — R1, then release CI

**Current witness:** `package.json` pins TypeScript 5.9.3, Node typings 24.13.6, Pi public types 0.87.1 and development-only `@modelcontextprotocol/sdk` 1.30.0 separately from the Pi `*` peer declaration. `tsconfig.json` now uses Pi's Node16/`resolveJsonModule` profile. Fresh `npm ci --ignore-scripts`, zero-vulnerability audit, the isolated contract module, and `npm run test:types` pass; the latter compiles a public `ExtensionAPI` fixture and witnesses intended TS2769/TS2339 failures. The full command now has zero dependency declaration diagnostics but still fails with 620 Pair-source diagnostics. Contract parsers still return generic records, so isolated success is not typed consumer safety. Bottom-up source annotations, CI and actual packed-runtime loading remain open. `scripts/check.js` still checks syntax/resources/example/tests rather than invoking the failing strict gate.

Required work:

- Keep executable ESM JS; add `allowJs`, `checkJs`, `strict`, `noEmit` and compatible Node module resolution. Annotate public Pi extension/context/tool/event contracts and Pair config/state/report/grant/RPC unions. Treat decoded JSON as untrusted until runtime validation; static checking does not validate disk or RPC data.
- Pin exact development versions of TypeScript, Node typings and the qualified public Pi types; commit `package-lock.json` and use `npm ci`. Preserve Pi-required peer `"*"` declarations for imported Pi packages; pin the test profile separately and do not bundle Pi/Fabric/Fovea or depend on hoisted development modules at runtime. See Pi `docs/packages.md`, “Declare dependencies”.
- Add `npm run typecheck` and a documented strict CI gate. Include all production modules; extend typed boundaries to scripts/fixtures/tests, with any incremental exclusions explicit and temporary. Broad `any`, `@ts-nocheck` or ignored source errors do not close this item.
- Keep ordinary tests offline after dependency installation. Separate deterministic native/package/TUI jobs from optional paid-provider jobs. Match schemas/examples/command registrations mechanically, including current normalized policy names.

**Exit:** fresh `npm ci` + strict typecheck + existing checks pass reproducibly; a deliberate invalid extension/event/state shape fails the typecheck; runtime loads from the packaged artifact without development dependencies. This does not require converting the whole project to TypeScript or changing its transport.

### 9.5 Remaining R2–R7 implementation and qualification

| Package | Still required, beyond the slices above | Exit evidence |
|---|---|---|
| **R2** | Full Main and Worker effect coverage, admitted sibling-call/job reconciliation, immutable capability restrictions/no profile widening or recursion, workspace-wide Pair writer exclusion. Retain read-only/auto-spill rejections until independently qualified. | E01–E04, E12, F10, H11 on actual native/captured/provider paths; GATE-A/B must close before advertising safety. |
| **R3** | Per-command source/run identity in `verifyConfigured`; detect mutation then restoration between checks. Revalidate the approved snapshot after idle/readiness waits and immediately before the next lease. Complete path-swap, manifest/blob integrity, dirty/mode/comment/rename/binary and omission cases. | E05–E11 U/N evidence; failed/stale checks cannot authorize a different snapshot, and user changes/outside sentinels remain safe. |
| **R4** | Durable holds, branch/crash recovery above, canonical resource selection/deduplication, bounded RPC/event/UI queues, negative/late responses, stderr/backpressure, shutdown/orphan handling and retained-session observations. | B02–B13, C01–C12, H01–H03; three native assignments retain actual Main/Worker IDs and worker PID; explicit restart retains history, not PID. |
| **R5** | Implement bounded task/review queues on **one** worker, question priority without starvation, plan revisions/boundaries, per-step revisions, total report/activation bounds, `needs_user`, safe report-only repair, active-only monotonic budgets and immutable task policy. Finish documented review semantics, including the separately specified user-only final-review opt-out once safety prerequisites hold. | D01–D15 and G15: fake-clock/Unicode/overflow/crash/replay tests; waits and resume neither spend nor erase active budgets; queued acknowledgement grants no work. |
| **R6** | Real Main/Worker compaction/overflow and deduplicated restoration, Fovea root/parser/provenance behavior, four native permission dialogs with cancellation/rebind, actual reviewer/effort observations, model-specific effort picker (`max` only when supported), usage-event deduplication/unknown costs, TUI width/theme/ASCII/input and cancel-settings behavior. | F01–F15 and G01–G15 at each applicable layer (including shared R0/R2 gates); mocks alone do not qualify native context/permissions/UI. |
| **R7** | Deterministic native **Main and Worker** end-to-end question/revision/final/subsequent-task workflow; actual tarball creation and clean install/disable/remove; opt-in redacted diagnostics; synchronized public docs/schema/example/skill and durable sanitized source/build-linked evidence. | Every applicable row among the 101 V1 requirements on the advertised profile; A01/A11–A12/G16/H04–H05 plus the full workflow. Five worker-side native scenarios and a dry-run package are insufficient. |

**Priority and dependency decision:** repair reproduced verification-output and activation-failure regressions first, then complete typed/versioned records, migration, pure transitions, durable publication/rollback and the strict foundation gate. Run dependency-profile qualification and public effect-seam probes in parallel where they do not conflict with shared-file edits. Next integrate R2/R4 holds, ownership and delivery recovery with R3 evidence safety. Only then enable R5 queues/repair/budgets, followed by R6 and R7 full qualification. Independent R3 work can proceed while an upstream feasibility gate is blocked. Do not estimate a release date or promise universal exactly-once delivery before those gates close.

**Implementation checkpoint acceptance:** all 106 original ledger rows remain. Upstream sources are untouched. The coherent package checkpoint passes 86 offline tests, five rerun native scenarios, public type fixtures, isolated contract checking, clean install/audit and a 34-entry dry-run package. The complete typecheck still fails with 620 Pair-source diagnostics; B2 durability, B4 versioned legacy retention and FND-06–08 remain open. Parallel workers, new OS/runtime profiles and paid benchmarks remain separate, not hidden V1 expansion.

### 9.6 Corrective foundation execution plan

B1–B8 remain historical subdivisions of IMP-01–04. Production changes for bounded output, immediate activation-failure containment, the pinned compiler profile and selected B4 validations remain in source. Their deleted test evidence does not certify current behavior. Continue from [the active NEXT-01–06 plan](IMPLEMENTATION-PLAN.md#13-active-implementation-plan-after-test-removal), not the historical fixture/runner instructions.

## 10. Current scope after test removal

**Superseded for testing:** the no-tests directive in this section is historical. The retained offline suite is re-adopted as regression coverage (see [TESTING.md](TESTING.md)), and the exclusions below no longer forbid that suite or new regression tests.

### Version and product boundaries

| Version label | Current value | Next treatment |
|---|---|---|
| Package | `0.1.0` (`package.json`) | No release bump in this checkpoint. |
| Product | V1, incomplete | One active writer, one unresolved workflow and serialized review; future supervisor and implementer actors are separately disabled/gated and cannot become multiple writers. |
| Configuration | V2 (`src/config.js:5`) | Preserve saved configuration and migration/consent behavior. |
| Persisted state | V1 (`src/contracts.js:3`) | Target V2 only with complete held-legacy migration and consumers. |
| Pair wire | V1 (`src/contracts.js:4`) | Decide independently; incompatible grant/handshake fields need explicit dual-side versioning. |
| Later product | Unnumbered VNext | Parallel workers/worktrees, merging and routing remain deferred. No product V2/V3 is defined. |

### Source-confirmed gaps and owners

Named witnesses below include AR-01, NEXT-02 and AR-02. Earlier line ranges elsewhere describe planning snapshots. AR-02 changes legacy runtime lifecycle/Controller integration; it does not activate stored-state migration, actor mode or consumers of the pure transition kernel.

| Current source witness | Gap / required treatment | Next owner |
|---|---|---|
| `src/contracts.js`, `src/observations.js`; `validateUsageObservation`, `validateUsageTotals`, `classifyStoredState` | AR-01 delivered concrete aggregate stored/current/historical records, nested usage and pure non-authorizing classification. Classification remains unwired; shared model/layout freeze, original-byte backup and consumers remain open. | AR-02/03/04 / B4 |
| `src/coordination.js`, `src/transitions.js`; scattered Controller/Worker mutations remain | The 27-kind internal journal model now covers bounded dispatch/continuation, checkpoint/decision, notice, reset, accounting/amendment and reconciliation paths with non-authorizing outcomes. Review corrections and remaining unsupported forms are in the joint runbook §10. No runtime consumers or completed actor/storage freeze. | NEXT-02 / B5, then NEXT-03/04 |
| `src/contracts.js:migrateStoredState`; `PairController.init` | V1 migration still creates missing legacy attempt identity without original-state backup. AR-02 preserves pending reports and quarantines ambiguous prior launches; truthful held-legacy migration/consumers and full recovery remain open. | AR-03/04 / NEXT-03 |
| `PiRuntime`, `PiRpc`; `PairController.reserveStart/activate/stopReserved` | AR-02 persists launch/grant intent before spawn/authority, verifies retained history/readiness, bounds protocol/UI and separates idle EOF from containment. It is not an atomic multi-file grant/obligation transaction or complete orphan reconciliation. | AR-03/04 / NEXT-04 |
| `src/worker.js:pair_report`; Controller report/control paths | DUR-01 now republishes an identical retained report and verifies complete conflicting content; DUR-02 scans the current runtime's retained latch. Preserve the latch-before-exposure stop fence and pending reports. Restart-independent durable obligations/notices/recovery remain incomplete. | NEXT-03/04 |
| `src/config.js:252–264` | DUR-01 preserves the backup, restores exclusively and reports primary plus restoration failure. Preserve that fix; full durable Apply/migration crash qualification remains open. | NEXT-04 / B6 |
| `PairController.resume` | Resume still copies current policy/limits, resets turn/time fields and supersedes notices. Held state must be blocked in the foundation; complete policy-preserving lifecycle integration is later IMP-05. | NEXT-02/03 guards; later IMP-05 |
| `tsconfig.json`, `package.json`, current compiler evidence | All production JS remains included. The [authorized toolchain follow-up](T10-CONTRACT-FREEZE-CANDIDATE.md#8-authorized-pinned-toolchain-follow-up) now passes pinned TypeScript 5.9.3 with exact project dependencies and no suppressions/exclusions. Earlier unavailable/supplemental results are historical. Preserve strict typing throughout integration; only `typecheck`/`pack:check` are registered and neither closes a runtime gate. | Every integration batch; NEXT-05/06 / B7+B8 |

### Included in the next bounded checkpoint

- Co-design concrete state/legacy/grant/delivery/usage/counter types and pure transitions; record version choices before integration.
- Preserve session/history/evidence and unresolved review/question obligations through held migration, validation and status/inspect paths. No automatic adoption of legacy work.
- Complete durable publication/reconciliation and explicit configuration rollback failures. Keep existing activation-failure containment and unsupported-profile restrictions.
- Complete strict production annotations and static-only CI/package inspection, with truthful status documentation.
- Keep executable JS, the existing Pi RPC architecture and production validators/evidence functionality. The former no-tests directive did not remove runtime validation or the product's user-configured verification feature; this checkpoint does not run it.

**Order (reconciled):** AR-01 records, NEXT-02 internal transition model and AR-02 retained-runtime slice source-delivered → AR-03 complete actor/storage/wire reader-writer freeze → AR-04 coherent ActorHost/migration/publication integration → NEXT-05 strict typing → NEXT-06 static/package/docs → AR-05 restricted supervisor → AR-06 two-runtime supervised workflow → AR-07 optional idle policy → AR-08 configuration/observability. Original NEXT/AR dependencies may overlap only at their explicitly assigned launch points. Lifecycle/admitted-effect/evidence safety remains foundational; adaptive supervision, parallel writers and new transports stay excluded.

**Current next steps:** follow the [seven-part implementation handoff](NEXT-IMPLEMENTATION-PLAN.md#8-seven-part-completion-plan). Q01 and pure D5 projections are source-implemented with bounded checks; independent T09 review and T10 freeze still precede H1. Resolve H1-L single-implementer admission, co-develop Store/held loading before any legacy rewrite, then integrate durable effects and canonical Controller/mailbox/archive consumers. Supervisor/workflow, optional sleep and configuration/observability follow. Native qualification is a separately gated P7/N12 deliverable, not a compiler result. Kiro is not a Pair requirement; reviewer/provider environment changes are outside this planning update.

**Foundation runbook:** [AR-03 actor/workflow contract and storage/wire freeze](AR-03-CONTRACT-FREEZE-PLAN.md) maps the current runtime/model gap, proposed fields and pure exports, mailbox/budget invariants, all readers/writers, crash outcomes, ten implementation checks and the AR-04 integration handoff. Reuse the 27 event kinds; leave active versions and runtime admission unchanged. This document plan does not close the freeze or any runtime gate.

**Joint source checkpoint:** [NEXT-01-02-PLAN.md §10](NEXT-01-02-PLAN.md#10-next-02-transition-model-source-checkpoint) records internal transition coverage and the reader/writer handoff; [AR-01](STORED-RECORDS-PLAN.md#9-ar-01-source-checkpoint) records stored-record/classification delivery. Neither activates the classifier/kernel in runtime. The [AR-02 checkpoint](ACTOR-RPC-IMPLEMENTATION-PLAN.md#11-ar-02-source-checkpoint) records legacy-runtime integration, review corrections, bounded compatibility and unverified behavior. Active state/wire versions stay at V1 until the later coordinated migration/publication rollout; a model-ready helper is not yet runtime enforcement.

### Exclusions and completion boundary

The removed historical tests, fixtures, compiler-negative cases and smoke/native/probe runners remain historical and are not restored; the retained offline suite in [TESTING.md](TESTING.md) is the current regression coverage. Do not add queue pumping, automatic recovery/repair, multiworker activation, a new transport, a TS build migration, paid inference, new OS profiles or upstream patches. No workers or user-configured verification are launched during the planning/static checks.

Implementation progress may be recorded after source walkthrough and static checks. `npm run typecheck` must ultimately pass without suppressions/exclusions; package dry-run confirms contents only. This does **not** close test-dependent foundation, native/fault/installation or V1 release gates. Preserve the original requirements as unverified, not silently waived. If the retained suite's coverage is insufficient for a gate, keep that gate blocked and do not advertise unattended safety.

**Reconciled planning deliverables:** this scope check, [the active implementation plan](IMPLEMENTATION-PLAN.md#13-active-implementation-plan-after-test-removal), and [the current implementation ledger](ACCEPTANCE-LEDGER.md#current-no-tests-implementation-ledger). Production changes, test creation/execution and commits/pushes are not part of this planning turn.

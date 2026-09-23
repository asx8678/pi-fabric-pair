# Scope of work — qualify Fabric Pair V1

**Status:** implementation in progress; first safety slice committed as `7583104`. Not a V1 release certification.

**Baseline:** submitted `pi-fabric-pair` 0.1.0, the original handoff, and the review performed in this conversation.

**Execution plan:** [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

**Release ledger:** [ACCEPTANCE-LEDGER.md](ACCEPTANCE-LEDGER.md).

## 1. Scope decision

Finish and harden the existing standalone extension. Do **not** restart the project or expand it into a multi-agent framework.

The release target is an explicitly enabled Main session plus **one retained native Pi RPC worker, one active code writer, and one serialized Main review queue**. Preserve the worker map and IDs for future expansion. Main remains the user's native conversation, model and UI. Worker retains normal, verified Fabric/Fovea resources under a tested capability profile.

The original `pi-fabric-pair-handoff/IMPLEMENTATION_PLAN.md` and `ACCEPTANCE_TESTS.md` remain the requirements baseline. This scope orders the remaining work; it does not silently waive V1 acceptance rows. Proposed compatibility choices below require approval before becoming product policy.

## 2. What already exists and should be retained

- Ordinary extension registration, Main/Worker role separation and one JSONL RPC adapter.
- Asynchronous dispatch, questions, checkpoint decisions, cancellation, worker reuse and private coordination state.
- Report/task/lease identities, duplicate-decision protection, content-addressed evidence and stale-snapshot checks.
- Minimal/off indicator, settings dialogs, native Main model control and no custom compactor/warmer.
- Offline tests and documentation that honestly distinguish a mock host from native integration.

The pre-implementation review ran **55 offline tests** and reproduced three native failures. The first implementation slice now passes **59 offline tests**, a 33-entry package dry-run, and five deterministic native scenarios on Node 24.21.0/macOS with Pi **0.87.1**, Fabric **0.93.0**, and Fovea **0.29.2**. No network/paid inference or installed-source modification was used.

Implemented so far: disabled-by-default opt-in, one live/unresolved worker across preserved slots, unsupported read-only Fabric rejection, post-report outer-invocation abort, explicit-background rejection, required zero shell auto-spill/no agent recursion, Pi-owned empty-session materialization, symlink-ancestor evidence rejection, snapshot-bound verification, and exact Fovea read-tool names. This is progress evidence, not whole-matrix release certification; admitted-effect concurrency, Main writer coverage, branch fencing, lifecycle semantics, queues/budgets, UI/permissions/context, and packaging installation gates remain.

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

**Not part of this work:** actor/SDK alternatives, another transport, distributed scheduler, remote worker service, daemon, web dashboard, custom compactor/cache warmer, OS sandbox, autonomous deployment, destructive artifact cleanup, or replacement of native Pi/Fabric UI.

No Pi/Fabric/Fovea source, installed dependency, production settings or credential file may be patched to make Pair pass. If an upstream change is necessary, prepare a separate request and seek explicit scope approval. Paid-provider tests and benchmarks require separate budget authorization.

## 6. Proposed compatibility decisions

Unless explicitly marked implemented below, these remain recommendations requiring a recorded compatibility decision:

| Decision | Recommendation / required treatment |
|---|---|
| Source language | Preserve executable ESM JavaScript and add strict TypeScript `checkJs`/JSDoc checking plus public Pi types. Avoid a bulk rename/rewrite. This is an explicit alternative to the handoff's TypeScript-source preference; use incremental TypeScript instead if selected by the owner. |
| Config filenames | Keep shipped `fabric-pair.json` and cosmetic `fabric-pair-ui.json` as canonical storage; offer an explicit importer for the handoff's `pair.json`/example shape. If both exist, report conflict and require a choice, not an undocumented merge. |
| Config version | Introduce a versioned normalized schema/migration when semantics change. Back up the old file; dry-run migration; preserve unknown/unsupported settings for diagnosis. Do not reinterpret an old implicit `enabled:true` as new consent. |
| Review aliases | Migrate `final` → `final-only`, `strict` → `every-step`; preserve milestone intent. `adaptive` needs explicit user selection of a V1 policy, not a silent weakening. |
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

**Reviewed baseline:** `7583104` on `main`. The existing 59 offline passes and five deterministic native passes cover narrow scenarios; they do not close R0–R7. This review changes planning/evidence records only, not runtime behavior.

### Release boundary

- **Required for the first V1:** all applicable core ledger rows on one explicitly advertised Node 24+/macOS Pi/Fabric/Fovea profile. Main-write authorization, known-effect reconciliation, ownership fencing and recovery are release blockers, not optional hardening.
- **Separate profile expansion:** Linux, Windows, Bun and additional upstream/provider combinations need their own applicable qualification before being advertised. They do not block a deliberately macOS-only release. Unsafe effect/configuration profiles must still be rejected; an untested OS is not automatically certified by the package manifest.
- **Optional, separately authorized evidence:** paid live-provider workflows and cost/cache benchmarks (H06–H07). Require an explicit provider/budget decision; do not include them in default CI or claim savings without measurements. Deterministic native Main/Worker qualification remains mandatory.
- **Still VNext:** parallel workers/investigators, parallel worktree writers and integration/merge automation. Do not expand these while completing the one-worker invariants.

### Required work packages and exit checks

Paths below are relative to the package root. References identify the inspected baseline, not new implementation claims.

| Work package | Remaining scope and source witness | Completion evidence |
|---|---|---|
| **R1 — Configuration, consent and contracts** | `src/config.js:19–75` validates only version 1, merges global/trusted project values, and saves the effective object. Add versioned migration/import with backup and dry-run, filename-conflict handling, field provenance and scope-safe saves. Distinguish legacy persisted `enabled:true` from deliberate new consent. Complete role guards, review-policy aliases, host-owned identity/report contracts, native effort validation, strict checking and a pinned development lockfile. | A02, A04–A07 and contract tests: old/current/handoff input, untrusted project, conflict, malformed role, invalid effort, cancelled settings and no-inference opt-in. Preserve configured slots/history; do not silently reinterpret `adaptive`. |
| **R0/R2 — Main authorization and admitted effects** | `src/main.js:152–156` gates only direct mutation names. `src/controller.js:307–319` uses settlement/idle/compaction observations, and `src/worker.js` retains a single `currentTool`, not an operation barrier. Prove a public enforcement mechanism or an immutable restricted surface for Main and Worker; close admission atomically and reconcile every admitted call/job by grant/generation before evidence capture. Include profile widening, recursion, sibling calls, cancellation and another Pair owner in the same workspace. | E01–E04, E12, F10, H11 with real native/captured/provider paths. Adversarial simultaneous calls must finish or become explicitly uncertain before review; sequential post-report abort alone is insufficient. Missing public coverage is a no-go requiring rejection or a separately approved upstream request. |
| **R3 — Finish evidence qualification** | Symlink-ancestor and batch-level mutation regressions pass. `src/evidence.js:163–175` still runs checks without per-command source identity; `src/controller.js:344–366` compares only around the whole batch. Add identity-bound results and checks between commands, continuation-time revalidation, path-swap/storage integrity cases, dirty/mode/comment/binary/rename coverage and explicit omissions. | E05–E11, including mutation followed by restoration within a batch, stale approval during a readiness wait, outside-path sentinel exclusion and dirty-user-change preservation. No claim of an OS sandbox or immunity to arbitrary hostile filesystem races. |
| **R1/R4 — Branch and generation fencing** | `src/main.js:38–43` binds by session/root; its event registrations have no same-session tree-navigation fence. Existing worker nonces/task leases do not replace owner epochs. Define durable owner epoch, worker generation and delivery-operation identities, then carry them through grants, reports, decisions and rebinds. | C08–C11, D12–D13, H01–H02: native `/tree`, fork/new/reload, stale queued reports/decisions and competing owners cannot renew obsolete authority. Normal message progression must not invalidate legitimate work. |
| **R4 — Lifecycle, transport and crash recovery** | `stopUnlocked` closes a process without a durable dispatch hold; `resume` renews a lease instead of restoring a pending question/review as waiting. Add distinct on/off/start/stop/pause/resume semantics, resource deduplication, conservative session observations, durable delivery reconciliation, schema-validated state, bounded transport/UI buffers and idempotent owned-process shutdown. | B02–B13, C01–C12, H01–H03: three native assignments retain identity/PID during normal use; explicit restart retains conversation, not PID. Crash windows, missing history, parent death, disk failure, negative/late RPC responses and cancellation never cause blind replay or kill an unrelated PID. |
| **R5 — Queues, policies and budgets** | `dispatchUnlocked` rejects another unresolved assignment rather than queueing it. `src/metrics.js:19–24` counts time since `startedAt`; `resume` resets that timestamp/turns and copies current policy. Implement finite durable task/review queues, UTF-8 report limits, per-step revisions, plan revisions, `needs_user`, bounded report-only repair and deduplicated delivery. Accumulate active time by state, excluding review/question/permission/queue/paused waits without erasing prior work on resume. | D01–D15 and G15 with fake-clock and crash/replay tests; overflow is explicit backpressure, approvals cannot advance twice, resumed work cannot reset budgets, and task policy remains immutable except explicitly authorized changes. |
| **R6 — Context, permissions, native UI and accounting** | Existing registration/mock tests are not native qualification. Complete real Main/Worker compaction and recovery, bounded/deduplicated restoration, actual Fovea root/parser coverage, all four permission-dialog paths, cancellation/rebind, pending settings, native effort/reviewer observations, usage-event deduplication and narrow/ASCII/theme/input behavior. | F01–F15 and G01–G15 at their specified layers: no hidden inference/warmer, no privilege from code approval, no lost decision during compaction, no misleading unknown cost/cache data, and UI remains cosmetic. |
| **R7 — Installable release and evidence** | `pack:check` is a dry-run only. Produce/inspect a real tarball; install in a fresh isolated profile outside the source tree; verify imports, skills, one-copy resource loading, disable/removal and preserved histories. Add opt-in redacted diagnostics and update every public schema/example/skill/doc against actual behavior. | A01, A11–A12, G16, H04–H05 plus the full ledger: deterministic native Main-and-Worker plan/question/revision/final workflow, native TUI checks, supported/rejected-profile evidence and durable sanitized artifacts tied to exact source/build identities. |

### Recommended execution order

1. **Next implementation slice: R1 contracts and migration.** Settle compatibility decisions and define shared epoch/generation/grant/delivery/hold contracts. Keep GATE-A/GATE-B feasibility probes active in parallel; five green native scenarios do not settle those gates.
2. **Safety slice: R2 plus R4 ownership/lifecycle, with R3 evidence completion.** Integrate shared controller transitions sequentially. Do not proceed to a release claim if admitted effects or stale ownership can bypass the barrier.
3. **Cooperation slice: R5.** Build queues, review policies and active-only budgets on the proven state/ownership transitions; do not paper over missing recovery with retries.
4. **Qualification slice: R6 then R7.** Complete native context/permission/UI/accounting evidence, clean installation/removal and the full applicable acceptance ledger.

Each slice needs small invariant-focused commits, targeted tests and direct behavioral probes. Keep required-but-unrun rows open. The quoted outstanding list is a summary, not permission to omit R3 evidence cases, strict checking, resource selection, context/permissions or accounting.

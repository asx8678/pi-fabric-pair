# Scope of work — qualify Fabric Pair V1

**Status:** proposed remediation scope; not an implementation or release certification.

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

## 3. Mandatory defect remediation

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
| DEF-09 | Use real Fovea tool names and prove coverage. Current read-only classification rejects `fovea_sketch` and `fovea_dwell`. | `src/native.js`, tests | R2, R6 |
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

These are implementation recommendations, not changes already made:

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

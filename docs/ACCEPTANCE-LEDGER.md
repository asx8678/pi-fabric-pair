# V1 acceptance ledger

> **Owner directive:** all automated tests, fixtures, test/probe runners, and generated test evidence were removed. Do not add or regenerate tests. Every test-backed status below is historical and no longer reproducible from this repository; no test-dependent gate is currently certified.

**Status:** development work in progress; no retained automated suites and no current test-backed certification. The source still contains the earlier R1/B1–B4 implementation changes, but all prior pass counts are historical. The latest combined compiler run exits 2 with 538 Pair-source and zero dependency diagnostics (620-source baseline). Contracts, schema, coordination and transitions have zero module diagnostics; the overall source gate still fails. The active implementation list is [NEXT-01–06](#current-no-tests-implementation-ledger), not the older test-writing tasks below. No remediation phase or release gate is marked complete.

**Plan:** [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). **Scope:** [SCOPE-OF-WORK.md](SCOPE-OF-WORK.md).

This ledger preserves every required-result row and test layer from the original handoff's `ACCEPTANCE_TESTS.md`: **101 V1 requirements, 3 VNext rows and 2 optional live-evidence rows**. R0–R7 are the new remediation packages; they do not imply completion of the handoff's original phases.

## How to use

- U = unit, R = fake RPC child, N = actual Pi/Fabric/Fovea with deterministic provider, T = terminal/package, L = separately authorized paid-provider evidence.
- The owner column identifies the primary work package; R7 checks every applicable V1 row, including cross-phase dependencies.
- The 55/59/81/86-offline and five-native counts describe pre-removal history only. Neither a historical pass nor a present static check certifies current behavioral requirements. See [current scope](SCOPE-OF-WORK.md#10-current-scope-after-test-removal).
- For current implementation work record source revision/diff, reviewed execution paths, static commands/results, versions and explicit limitations. Do not add tests, runners or test artifacts to populate this ledger; keep credentials/transcripts out of shared notes.
- Current implementation statuses are planned, in progress, source-reviewed or statically checked. They are not behavioral passes. Original required-layer acceptance remains unverified/blocked or explicitly rejected as unsupported; an unsafe supported profile cannot be waived by documentation.

## Current no-tests implementation ledger

This is the active task tracker for [plan §13](IMPLEMENTATION-PLAN.md#13-active-implementation-plan-after-test-removal). It subdivides existing B4–B8 scope and does not add or replace any of the 106 original requirement rows. NEXT-01/02 are **in progress**; NEXT-03–06 remain planned. No batch is complete. Types and source reviews alone do not establish runtime correctness.

The [joint NEXT-01/02 runbook](NEXT-01-02-PLAN.md#9-current-implementation-checkpoint) records the first concrete validator/schema slice and bounded pure coordination kernel, with exact unsupported families and evidence. Active formats are unchanged. Model freeze and NEXT-03/04 runtime integration remain open; the unused transition helper is not enforcement.

**Next bounded batch — planned:** [Stored-record contracts and legacy classification](STORED-RECORDS-PLAN.md). Source maps/design reviews establish SR-01–06 and SR-A01–08; they are not implementation or behavioral passes. This planning pass changes documents only, adds no tests and does not rerun the compiler. The last recorded 538-source/0-dependency result remains the baseline.

| Item | Existing mapping | Planned deliverable | Implementation/static completion evidence | Status |
|---|---|---|---|---|
| NEXT-01 | B4 / IMP-02 | Concrete current/held-legacy records, nested validation, state/wire compatibility decisions. | Concrete leaf/report/authority/latch and dispatch/decision returns are source-reviewed; two validator gaps fixed. Aggregate stored-state/usage/legacy classification and compatibility freeze remain open. | In progress; not complete |
| NEXT-02 | B5 / IMP-03 | Pure task/runtime/grant/hold/delivery transitions with explicit uncertainty. | Bounded 510-line coordination/transitions kernel source-reviewed with zero module diagnostics. Eleven event variants; unsupported families hold explicitly. No runtime consumers, slot release or model-ready claim. | In progress; not complete |
| NEXT-03 | B4 / IMP-02 | Recoverable state-V2 migration, preserved review/history, truthful held-state consumers. | Source trace through init/persist/status/inspect/admission; held legacy work cannot authorize. Joint rollout with NEXT-04. | Planned |
| NEXT-04 | B2+B6 / IMP-02 | Durable grant/report obligations, startup reconciliation, explicit config rollback failure. | Reviewed commit/publication/retention/error ordering with original/recovery errors and recoverable paths retained. Fault/crash behavior remains unverified. | Planned |
| NEXT-05 | B7 / IMP-01/04 | Complete strict production annotations. | Full production typecheck exits zero, with no source or dependency diagnostics, suppressions or exclusions. | Planned |
| NEXT-06 | B8 implementation portion / IMP-04 | Static-only CI, package/source registration inspection and truthful documentation. | Reproducible install, compiler/static CI and package-content review; no behavioral/native/install certification. | Planned |

**Historical planning acceptance:** the preceding planning-only pass confirmed all **106 unique original requirement IDs**, eight historical FND rows, six NEXT rows and the retained `typecheck`/`pack:check` scripts. That pass ran no compiler or workers; it is superseded by the implementation evidence below, not erased.

**Current implementation checkpoint:** three Astra xhigh assignments completed with disjoint ownership, followed by parent source review and the 538-source/0-dependency compiler result. Syntax/whitespace checks pass; the full compiler does not. Shipped-default reference/serialization preservation and the reducer's missing-input rejection were observed with no-file direct invocations only. No tests, fixtures, runners or test artifacts were created; no workers launched. Package/config/state/wire remain `0.1.0`/V2/V1/V1. Details and explicit unsupported families are in [runbook §9](NEXT-01-02-PLAN.md#9-current-implementation-checkpoint).

**Open qualification boundary:** original FND-01–08 and V1 behavioral/native/fault/installation requirements are not certified under the removed-test evidence. NEXT-06 is a static implementation checkpoint, not a substitute release gate. Later V1 implementation follows IMP-05–13; VNext stays deferred.

## Original requirements

| ID | Gate | Required layer(s) | Owner | Review baseline / remaining evidence | Required result (original) |
|---|---|---|---|---|---|
| A01 | V1 | T | R7 | Source/manifest checked; installed-package test pending | Only Pair-owned resources load; no upstream file edits or fork required. |
| A02 | V1 | U,T | R1 | Offline factory test; T qualification pending | No worker, socket, watcher or timer is started in the registration factory. |
| A03 | V1 | N | R4 | Unqualified; required-layer evidence pending | Exactly one worker starts automatically, without another terminal or model greeting. |
| A04 | V1 | U,N | R1 | Disabled default, incomplete-model pre-start rejection, invalid-effort no-inference rejection and V1/handoff enabled-consent reset pass offline; native/TUI setup-status evidence remains | No paid worker work; Main remains usable; a clear setup status is available. |
| A05 | V1 | U,N | R1 | Explicit Main/Worker and malformed/ambiguous role checks pass offline; native role matrix remains | Explicit worker role is recognized; no nested controller or recursive worker spawning. |
| A06 | V1 | U | R1 | U pass: V2 preview/backup/conflict, array replacement, provenance, selected-scope saves, trust isolation, bounded deferred fields and confirmation-gated retained-backup import | Documented precedence and provenance; native context settings remain upstream-owned. |
| A07 | V1 | N | R1 | Untrusted project files are ignored in U; native trust/resource-execution evidence remains | No implied trust, no unauthorized config or resource execution. |
| A08 | V1 | N | R4 | Native narrow-profile startup only; dedup not qualified | One canonical Fabric/Fovea/Pair copy per runtime; duplicate hooks are not installed. |
| A09 | V1 | N | R0 | Native startup validates the selected effort; offline invalid-effort no-inference rejection passes; full effective-profile/identity matrix remains | Actual session/model/effort/root/resource identities validated; registration is not misreported as remote auth success. |
| A10 | V1 | N | R6 | Registration only; parser coverage not qualified | Coverage/error is surfaced; required capability failures block delegation, not hidden success. |
| A11 | V1 | T | R7 | Pack dry-run only; clean installation pending | Runtime imports, extension entry and skills resolve without hoisted dev dependencies. |
| A12 | V1 | T | R7 | Unqualified; required-layer evidence pending | Upstream Pi/Fabric/Fovea and original TUI remain usable; live owned work is handled explicitly. |
| B01 | V1 | R,N | R0 | Adapter/source audit and partial native use; full contract pending | All required requests and UI replies are possible without private-field access; negative acknowledgements rejected. |
| B02 | V1 | R | R4 | Offline UTF-8 test passed; full framing cases pending | Exactly one valid record decoded; UTF-8 boundaries handled correctly. |
| B03 | V1 | R | R4 | Unqualified; required-layer evidence pending | Strict LF framing; JSON Unicode characters are preserved. |
| B04 | V1 | R | R4 | Unqualified; required-layer evidence pending | Each promise receives its own response; event records remain independently handled. |
| B05 | V1 | R | R4 | Partial offline negative-response test; all commands pending | Correct failure, no ready/accepted/completed false positive. |
| B06 | V1 | R | R4 | Unqualified; required-layer evidence pending | Listener was installed first; completion/report not lost. |
| B07 | V1 | R | R4 | Unqualified; required-layer evidence pending | Task fails/pauses correctly; command acknowledgement is not treated as completion. |
| B08 | V1 | R | R4 | Unqualified; required-layer evidence pending | Checkpoint not finalized at premature end event. |
| B09 | V1 | R | R4 | Unqualified; required-layer evidence pending | No deadlock from unread stdout; memory and diagnostic retention stay bounded. |
| B10 | V1 | R | R4 | Offline malformed-frame test; oversize coverage pending | Clear bounded protocol failure; no silent JSON truncation or unrelated state mutation. |
| B11 | V1 | R,N | R4 | Partial native startup; negative profile cases pending | Real readiness timeout/error, not successful status after a fixed sleep. |
| B12 | V1 | R | R4 | Offline timeout covered; reconciliation windows pending | Operation becomes uncertain; reconciliation prevents blind duplicate dispatch. |
| B13 | V1 | R | R4 | Unqualified; required-layer evidence pending | Stderr stays diagnostic; UI records are dispatched to the UI adapter, not cast blindly as agent events. |
| C01 | V1 | N | R4 | Mock retention evidence; three native assignments pending | Same actual Worker PID/session ID and same Main session ID during normal operation. |
| C02 | V1 | N | R4 | Mock coverage and native yield; complete native reuse pending | Process remains open and accepts the next prompt; no per-run stop/dispose/new-session path. |
| C03 | V1 | N | R4 | Unqualified; required-layer evidence pending | Main remains usable; no wait-cycle deadlock and no accidental new Main instance. |
| C04 | V1 | N | R4 | Native deterministic idle start/stop/reopen passes with the same Pi-written session ID/file; broader lifecycle matrix remains | Worker process closes deliberately; stored conversation can be reopened without pretending PID continuity. |
| C05 | V1 | N | R4 | Native idle worker closes and reopens without session deletion; broader shutdown/orphan matrix remains | Owned worker closes, state is persisted, no silent session deletion. |
| C06 | V1 | R,N | R4 | Unqualified; required-layer evidence pending | No uncontrolled orphan remains under the tested platform policy; interrupted authority is not silently renewed. |
| C07 | V1 | N | R4 | Native recovery qualification pending | Same conversation can be reopened; incomplete side effects marked uncertain; edit is not blindly replayed. |
| C08 | V1 | U,N | R4 | Report-ingress identity fencing covered offline; scope probe accepts a retained old-epoch report decision without explicit rebind; same-session branch hooks missing | Old reports/grants cannot affect unrelated new ownership; pause/rebind is explicit. |
| C09 | V1 | N | R4 | Native reload qualification pending | Stale contexts/listeners are not used; association/history preserved or explicitly suspended. |
| C10 | V1 | U,R | R4 | Offline owner-epoch/worker-generation handshake and restart coverage; native stale-process cases pending | No false readiness or killing unrelated PID; generation checks reject stale state. |
| C11 | V1 | U,N | R4 | Offline same-owner lock test; full native ownership pending | It cannot automatically adopt/control the first instance's worker by name. |
| C12 | V1 | U,N | R4 | Pi-written empty-session bootstrap passes natively; missing retained files still fail closed in U; native missing-file case remains | Explicit error; no blank replacement falsely reported as the same retained session. |
| D01 | V1 | U,N | R5 | Mock question/answer passed; full native Main/Worker pending | Report arrives in existing Main context; decision resumes the same Worker conversation. |
| D02 | V1 | U,N | R5 | Mock checkpoint/revision and retained-worker attempt rotation evidence; native sequence pending | Correct step/attempt/revision tracking; next scope dispatched once. |
| D03 | V1 | U,N | R5 | Mock final approval evidence; safety prerequisites fail | Task stays pending until required Main acceptance and checks. |
| D04 | V1 | U | R5 | Unqualified; required-layer evidence pending | Rejected; host identity and Main-only decision authority prevail. |
| D05 | V1 | U,R | R5 | Partial identity handling; durable replay windows pending | One durable report, one Main notification, one decision target. |
| D06 | V1 | U,R | R5 | Offline duplicate-decision test; native/crash windows pending | Idempotent result; no second continuation or authorization. |
| D07 | V1 | N | R5 | Unqualified; required-layer evidence pending | Report queues; user output not arbitrarily interrupted or lost. |
| D08 | V1 | U | R5 | Source gap: bounded task/review queues missing | Backpressure/clear rejection; no required review silently dropped. |
| D09 | V1 | U,N | R5 | Policy names normalized; complete boundary/group/final-review semantics and native policy matrix remain | Exactly the documented gates; questions remain possible in every policy. |
| D10 | V1 | U,N | R5 | Immediate interruption; bounded repair policy incomplete | Never completed automatically; bounded repair then escalation, not an infinite loop. |
| D11 | V1 | U,N | R5 | Source gap: per-step/report bounds incomplete | Needs-user/paused; no automatic limit increase or endless repair. |
| D12 | V1 | U | R5 | Source gap: explicit plan-revision transition incomplete | Incompatible decisions rejected; no approval of superseded scope. |
| D13 | V1 | U,N | R5 | Partial mock cancellation; pending-decision races pending | Late decision/report cannot restart cancelled work. |
| D14 | V1 | U,N | R5 | Unqualified; required-layer evidence pending | UI/controller state only; no Main inference or duplicate transcript context per update. |
| D15 | V1 | N | R5 | Unqualified; required-layer evidence pending | Main can answer without needless implementation delegation or mutation trigger. |
| E01 | V1 | N | R2 | Native sequential post-report provider call is fenced by outer abort; simultaneous admitted-effect reconciliation remains | New unauthorized operation blocked; previously admitted operations reconciled before freeze. |
| E02 | V1 | N | R2 | Generic-provider limitation documented; read-only Fabric profile rejects before inference; full writer surface matrix remains | Tested enforcement coverage documented; unsupported side-effect path rejected, not silently assumed covered. |
| E03 | V1 | N | R2 | Native explicit background request is blocked and nonzero shellHangMs profile rejects before inference; broader job matrix remains | Checkpoint not finalized until tracked work quiesces or manual reconciliation is required. |
| E04 | V1 | N | R2 | Source gap: Main shell/provider paths not gated | Single-writer policy pauses/blocks the conflict; no silent overlapping ownership. |
| E05 | V1 | U,N | R3 | Offline stale-source rejection; native cases pending | Snapshot is stale; decision cannot authorize newer code. |
| E06 | V1 | U,N | R3 | Hash-based design; dedicated regression pending | Content identity change recognized even if Fovea reports no semantic drift. |
| E07 | V1 | U,N | R3 | Source handling exists; coverage matrix pending | Snapshot/evidence explicitly accounts for them or marks bounded coverage gaps. |
| E08 | V1 | U | R3 | U regression passes: symlinked parent rejected and outside sentinel hash absent from evidence blobs | Rejected; no private-state write or outside-workspace read through a forged path. |
| E09 | V1 | N | R3 | Baseline capture exists; native dirty-workspace proof pending | Changes preserved; no automatic reset/stash/stage/commit and no false attribution. |
| E10 | V1 | U,N | R3 | Claim/observed distinction exists; full-layer tests pending | Status remains worker-reported, not verified-pass. |
| E11 | V1 | U,N | R3 | U regression passes: a mutating configured check interrupts and publishes no checkpoint; native cases remain | Cannot certify the newer checkpoint without rerun/revalidation. |
| E12 | V1 | N | R2 | Read-only/auto-spill profiles reject; arbitrary external effects and admitted concurrency remain unqualified | Explicit limitation/manual review; no claim local file hashes prove all effects. |
| F01 | V1 | N | R6 | Mock compaction only; native engine proof pending | Fabric engine metadata observed; same worker session/PID; task authority retained. |
| F02 | V1 | N | R6 | Mock restoration only; native Main proof pending | Worker unaffected; current report/plan/constraints restored for next real review. |
| F03 | V1 | U,N | R6 | Unqualified; required-layer evidence pending | Per-model native settings applied independently; no copied Main token limit. |
| F04 | V1 | U,N | R6 | Unqualified; required-layer evidence pending | Distinct semantics; Pair does not compact at `targetContextRatio` as if it were a trigger. |
| F05 | V1 | N | R6 | Unqualified; required-layer evidence pending | Native recovery remains enabled; no Pair suppression to preserve a cache. |
| F06 | V1 | R,N | R6 | Unqualified; required-layer evidence pending | Queued, then applied once to reconstructed current state. |
| F07 | V1 | N | R6 | Unqualified; required-layer evidence pending | Error surfaced; task/decision/history preserved; no new blank session. |
| F08 | V1 | U,N | R6 | Packet design exists; dedup/freshness proof pending | Identical packets are not injected every turn; no model greeting/ack call. |
| F09 | V1 | N | R6 | Native registration only; actual graph/root coverage pending | Correct explicit root and useful bounded results/coverage in each runtime. |
| F10 | V1 | N | R2 | Mock Fovea-like hook only; full native hold proof pending | Closed task grant remains closed; no unauthorized next step; no unbounded continuation loop. |
| F11 | V1 | N | R6 | Unqualified; required-layer evidence pending | Context behavior acknowledged; hidden is not treated as disabled. |
| F12 | V1 | N | R6 | Unqualified; required-layer evidence pending | Correct supported handling of both provenance paths; review gate independent of provenance. |
| F13 | V1 | N | R6 | Unqualified; required-layer evidence pending | No wrong-root answer/work; trust/root selection explicit. |
| F14 | V1 | U,N | R6 | Unqualified; required-layer evidence pending | Work order includes the constraint; Fovea is not assumed to transmit conversation knowledge. |
| F15 | V1 | N | R0 | File-setting conflict checks; effective native policy proof pending | Conflict detected and explicitly resolved/rejected; no double handoff or model switch. |
| G01 | V1 | R,N | R6 | Mock confirm path; four native dialog types pending | Correct worker-labelled dialog; matching response ID delivered. |
| G02 | V1 | R,N | R6 | Full denial/cancel/timeout/shutdown matrix pending | Safe explicit outcome; no silent approval or indefinite hidden hang. |
| G03 | V1 | U,N | R6 | Unqualified; required-layer evidence pending | Independent authorities; code approval does not approve the restricted operation. |
| G04 | V1 | T,N | R6 | Offline rendering-only tests; T/N qualification pending | Only Pair rendering changes; session IDs, prompts, queues and warming policy unchanged. |
| G05 | V1 | T | R6 | Source gap: width/ASCII/native-input qualification | Tiny indicator/settings usable; no overflow or dependence on color alone. |
| G06 | V1 | T | R6 | Unqualified; required-layer evidence pending | No worker termination, model request or unintended config save. |
| G07 | V1 | T,N | R6 | Mock idle effort change and invalid-effort rejection pass; native pending/model coverage remains | Pending state shown; applied only at safe boundary and validated natively. |
| G08 | V1 | T,N | R6 | Mock Main model ownership; native/reviewer identity pending | Native ownership retained; Pair never snaps back; decisions record actual reviewer model. |
| G09 | V1 | R,T | R6 | Unqualified; required-layer evidence pending | Do not clobber Main editor/title; important errors still visible when indicator off. |
| G10 | V1 | U | R6 | Offline Pi-disjoint arithmetic; inclusive-shape coverage pending | Correct normalization and weighted aggregate ratios; no cache/input double count. |
| G11 | V1 | U,R | R6 | Source gap: usage identity deduplication not proven | Count once; report display does not re-charge worker usage to Main. |
| G12 | V1 | U,N | R6 | Partial arithmetic/display coverage; native unknown-data cases pending | Unknown/N/A displayed; no invented zero cost or hot-cache guarantee. |
| G13 | V1 | N | R6 | No-heartbeat design; complete native idle proof pending | No LLM call and no fake prompt heartbeat from Pair. |
| G14 | V1 | U,N | R6 | No warmer implementation; native policy proof pending | Does not silently enable paid warming or alter global native settings. |
| G15 | V1 | U,N | R6 | Partial mock soft-budget test; active-time semantics fail | New work bounded by policy; in-flight cost uncertainty honestly reported. |
| G16 | V1 | U,T | R7 | Redacted diagnostic export not implemented | No credentials or unsolicited raw prompts/source; terminal controls sanitized. |
| H01 | V1 | U,R | R4 | Durable outbox exists; crash-window qualification pending | Parent recovers report once and does not lose required review. |
| H02 | V1 | U,R | R4 | Delivery-operation IDs persisted, but no reconciled delivery journal; decision/send crash-window tests remain | Reconcile worker grant before deciding to resend; no duplicated mutation. |
| H03 | V1 | U | R4 | Offline corrupt-init test; disk-full/journal matrix pending | Explicit error/fail-closed authority; damaged data preserved for diagnosis. |
| H04 | V1 | T | R7 | Current 33-entry dry-run passes; actual tarball inspection/clean installation remains | No credentials, sessions, state, node_modules or upstream code copies accidentally included. |
| H05 | V1 | T,N | R7 | No fully qualified supported/unsupported profile pair | Supported stack passes; unsupported profile fails with actionable compatibility detail. |
| H06 | Opt-in evidence | L | Optional later | Not run; separate authorization required | End-to-end proof with exact versions and authorized spend; same conversations continue. |
| H07 | Opt-in evidence | L | Optional later | Not run; separate authorization required | Quality and total billable work reported; no savings claim from cache ratio alone. |
| H08 | VNext | N | Deferred VNext | Deferred; not a V1 feature | Reports route correctly; independent contexts; one Main review queue; bounded concurrency. |
| H09 | VNext | N | Deferred VNext | Deferred; not a V1 feature | Other worker's session, Fovea view and authority unaffected. |
| H10 | VNext | N | Deferred VNext | Deferred; not a V1 feature | Separate evidence/base/branch, no shared session file; combined tests after serialized integration. |
| H11 | V1 | U,N | R2 | Name-gate and maxDepth readiness checks pass offline; real recursion/profile-widening routes unqualified | Rejected under V1/V1.1 policy; no uncontrolled recursion. |

## Supplemental regression ledger

These make the review findings explicit where an original acceptance row covers a broader scenario.

| Regression | Owner | Acceptance links | Exact behavioral check |
|---|---|---|---|
| DEF-01 | R0/R2 | E01, E02, H11 | Real Fabric generic/direct provider calls, including `state.transition`, cannot mutate in a read-only or closed grant. No recursive worker/agent route or capability-profile widening bypasses the restriction. |
| DEF-02 | R0/R2 | E03, E12 | A job that returns `running:true`, explicitly or through auto-detachment, cannot produce a review-ready/finally accepted checkpoint before known effects settle; unknown jobs escalate. |
| DEF-03 | R3 | E08 | Replace a tracked file's parent with an outside symlink; no outside sentinel bytes enter evidence blobs, logs or review content. Test path swapping and final-component symlinks too. |
| DEF-04 | R0/R4 | A09, C04, C05, C12 | Start → stop → reopen with zero inference follows the approved honest identity policy; persisted/uncertain missing history never falls back to a blank session. |
| DEF-05 | R3 | E05, E11 | Mutate source during or after a passing command, including a later configured formatter/codegen command; old check results cannot certify the new checkpoint. |
| DEF-06 | R4 | C08, C09, D12, D13 | Native same-session tree navigation invalidates prior authority/report delivery while ordinary new message leaves do not. |
| DEF-07 | R1/R4 | A04, A12, C04, C05, D13 | Stop then model dispatch/queue drain stays held. Off revokes/quiesces existing work and closes its process. On/start never silently resumes an interrupted task. |
| DEF-08 | R5 | D11, G15 | Advance a fake monotonic clock during question/review/permission waits: active execution time does not grow; actual active work and uncertainty are not erased on resume. |
| DEF-09 | R2/R6 | A10, F09 | Real `fovea_sketch`, `fovea_focus`, `fovea_dwell`, `fovea_impact` execute under the intended read policy with correct root and reported coverage. |
| DEF-10 | R2 | E04 | Main direct/native/captured/shell/provider source mutations cannot overlap the worker's write lease; explicitly scoped verification and reads remain usable. |
| DEF-11 | R4/R5 | D05–D12, H01–H03 | Queue/report/revision limits, plan revisions, report-only repair, delivery deduplication and crash reconciliation are enforced without silent drops or duplicate effects. |

## Follow-up scope-gap observations

These seven bounded checks were run against HEAD `ca09923` plus the uncommitted R1 patch using disposable repositories and the production Pair controller/worker bridge with the protocol fixture. No network, paid model or installed-source modification was used. They demonstrated remaining scope, **not** seven passing product guarantees. At that documentation-only checkpoint the feature suites remained 68 offline tests and five narrow native scenarios. The later deferred-migration implementation adds five focused regressions, bringing the current suite to 73/5; the other observations remain open.

| Check | Observed behavior | Required remediation / acceptance links |
|---|---|---|
| Stop then model dispatch | Dispatch restarts the stopped worker and advances its generation without an explicit start. | Durable dispatch hold; DEF-07, C04–C05, D13. |
| Disable during a running task | `updateConfig({enabled:false})` leaves authority phase `running` and the worker connected. | Off/settings-disable must revoke/quiesce/close; DEF-07, A04/A12, E01. |
| Pause/resume a pending review | Resume creates another attempt and supersedes the unanswered review notice. | Restore waiting obligation, not execution; D03/D13, H01. |
| Controller replacement with retained review | A report from owner epoch 1 is approved as completed under epoch 2 with no explicit rebind. | Decision/rebind fence, not only ingress fence; C08/C10, H02. |
| Handoff import → Apply → reload | Originally, six deferred values survived only in the backup. Current U regressions preserve them in bounded V2 assignment policy and support explicit retained-backup import. | Configuration/provenance side remediated for A06; actual queue/report/repair/recovery enforcement remains D08/D10–D11. |
| Budget function during review wait | `limitExceeded` returns a duration-limit error for an old `startedAt` even with task status `review`. | Active-only accounting and no reset on resume; DEF-08, D11/G15. |
| Main event registration | Neither `session_before_tree` nor `session_tree` is registered. | Qualify and integrate public branch events; DEF-06, C08–C09. |

Local probe command: `node /tmp/pair-remaining-scope-probes.mjs`. This temporary script is not a durable release artifact. Convert its behaviors into permanent targeted regressions in the owning implementation slices; native branch/effect/crash qualification is still required. See [detailed scope](SCOPE-OF-WORK.md#9-scope-check-of-the-five-outstanding-items).

Native evidence boundary: `scripts/native-regressions.js` drives a Pair controller with a native **worker** and records Main callbacks. Its `idle-restart` case stops/starts that worker under the same controller. It does not exercise native Main extension branch navigation, controller replacement, queue recovery or a complete Main-and-Worker review workflow.

## Ordered-slice acceptance — implementation evidence and remaining gates

> **Historical pre-removal snapshot:** the tables in this section are not current commands or certification. In particular, `test:types` and the offline/native runners no longer exist. Use the current NEXT-01–06 ledger above.

S1–S4 are execution subdivisions of R1–R5, not new product phases or additions to the 106 original requirements. See [ordered scope](SCOPE-OF-WORK.md#recommended-execution-order) and [executable batches](IMPLEMENTATION-PLAN.md#11-executable-implementation-batches). S1/S2 map to IMP-01–04, S3 to IMP-05–08, S4 to IMP-09–11, and R6/R7 to IMP-12–13; R0 feasibility proceeds in parallel. Partial implementation does not mark a slice or original requirement complete.

| Item | Status | Current evidence | Still required |
|---|---|---|---|
| IMP-01 | in progress / source gate failing | Exact dev pins/lockfile, Pi-compatible Node16/JSON profile, clean install/audit and public positive/intended-negative compiler fixtures pass. Dependency declaration diagnostics are zero. | Full `typecheck` still fails with 620 Pair-source diagnostics; source annotations, CI and actual packed-runtime load remain. |
| IMP-02 | in progress / partial corrective pass | B1 output/artifact round-trip; B2 state-save/revocation containment; selected B4 decision/report/current-state relationships; runtime guards, counters and authority limits. | Durable grant/crash behavior, authority-write and RPC uncertainty matrix, concrete records/return types, state V2 and held legacy reviews, usage/delivery/queue contracts and persistence/import rollback matrix. |
| IMP-03/04 | not started | `test:types` exists, but no transition model or strict integration gate is claimed. | Pure transition model, complete strict annotations, CI and actual package smoke gate. |

| Slice | Planned acceptance evidence | Original requirements / boundary |
|---|---|---|
| S1 — tooling | Clean `npm ci`; strict production typecheck; deliberately invalid public API/event/state fixtures rejected; current checks retained; packed runtime loads without dev dependencies. | Engineering gate supporting A02/A06/A11; does not close A11 clean installation or any native safety gate. |
| S2 — contracts | State/wire version and legacy-migration tests; malformed identities/counter overflow rejected; authority round trip preserves task policy **and limits**; pure hold/closed-grant/uncertain-delivery transition tests; migration write-failure/stale-scope cases. | A06, B02–B05, C08–C11, D12–D13, H01–H03 as applicable; actual native behavior remains S3/R7. |
| S3 — safety | Sticky stop-before-start/after-task; disable revokes admission; pending review/question and policy/cumulative counters survive resume/restart; stale branch/report/decision denial; concurrent-effect, disk/crash and per-command/post-readiness evidence regressions on the supported surface. | DEF-01–DEF-08, B/C/H ownership/recovery rows, E01–E12 and GATE-A/B; retain any required-layer gaps. |
| S4 — limit consumers | Each migrated bound at its actual queue/report/repair/recovery boundary; exact/over-bound and zero cases; UTF-8 payload/envelope separation; duplicate/replay accounting; fake-clock waits; no repair implementation lease or recovery mutation replay. | D01–D15/G15; D08/D10–D11 remain open until the required consumers/layers pass. R6/R7 still qualify the full release. |

Current source status: resume still replaces copied policy/limits and resets time, and Worker report sizing still uses a character-count summary cap. The IMP-02 batch corrected the earlier authority omission: `writeAuthority` now carries validated task limits and the Worker validates the authority before use. Existing dispatch/authority snapshot coverage is not lifetime immutability or configured byte enforcement.

## Corrective foundation acceptance

This table preserves the **historical pre-removal** engineering/regression snapshot for [B1–B8](IMPLEMENTATION-PLAN.md#12-corrective-foundation-and-remaining-implementation-plan), not additions to the 106 original requirement rows. Historical pass/partial labels are not current certification: their executable evidence has been removed. Current work uses NEXT-01–06 above; original test-dependent FND gates remain unverified, including FND-01.

| Check | Batch / owning IMP | Layer / original links | Historical pre-removal evidence and status | Original required completion evidence |
|---|---|---|---|---|
| FND-01 — verification producer/validator bounds | B1 / IMP-02 | U,R; E05/E11 | **Pass:** `bounded()` includes its marker within the declared character limit; exact/small/ASCII/multibyte cases pass. A 7,000-character successful command retains its complete artifact while a 6,000-character summary persists and survives controller restart. Existing failed-check approval rejection still passes. | Complete at this layer. UTF-8 report-byte enforcement remains IMP-09 and is not implied by this character/display bound. |
| FND-02 — grant publication failure containment | B2+B6 / IMP-02; later IMP-06 native gate | U,R; E01/E12/H03 | **Partial pass:** the authority-write/state-persist/RPC-send region now shares one failure handler. Injected ENOSPC revokes to read-back-confirmed `paused` before any work prompt; injected EACCES during revocation stops/removes the owned Worker while preserving both errors. | Add running-authority-write, negative/late RPC and restart/crash windows; durable grant identity and reconciliation remain B6. Unknown effects stay held. Immediate B2 tests alone do not close this row. |
| FND-03 — versioned migration and required current fields | B4 / IMP-02 | U,R; C08/C10/D12/H01/H03 | **Partial pass:** current partial deferred-limit shapes and mixed present/missing identity tuples now fail; complete known pre-deferred-policy shapes remain legacy-tolerant. A current state missing only owner epoch is no longer rewritten to zero. | Legacy pending review still fails; STATE_VERSION remains 1 and old migration still generates task identity for known pre-identity work. Implement state V2, truthful held legacy work, all-status fixtures and unchanged-input/failure guarantees before closure. |
| FND-04 — complete typed records and cross-record identity | B4 / IMP-02 | U,R; C08/H02/H03 | **Partial pass:** stored decision/last-decision unions reject bad action/delivery/identity fields; reports bind to task, worker, plan step and unresolved current attempt. Historical resolved reports continue across attempt rotation. Cross-task and unknown-step fixtures fail. | Parsers still return generic records; usage, stale-report, observation, delivery, notice, request/status, queue and cumulative-counter shapes/relationships remain incomplete. Add concrete return types and full positive/malformed fixtures before closure. |
| FND-05 — complete compiler boundary | B3+B7 / IMP-01/04 | U; engineering gate for A02/A11 | **Partial pass:** fresh install/audit and public `ExtensionAPI` positive plus intended TS2769/TS2339 negatives pass. Pi-compatible Node16/JSON settings and exact secure MCP peer reduce dependency diagnostics from 42 to zero. | Full production check still fails with 620 Pair-source diagnostics. Complete concrete source annotations and add state-shape negatives/CI without suppressions or exclusions. |
| FND-06 — pure transition invariants | B5 / IMP-03 | U; DEF-07/D13/H01–H03 | **Unrun/open:** no transition model/test suite exists under this backlog. | Table-driven task/runtime/grant/hold/delivery matrix, closure and stale ownership, reordered event cases, preserved review obligations/policy/counters, explicit uncertainty. Runtime/native enforcement still requires IMP-05–07. |
| FND-07 — storage, report and import fault matrix | B6 / IMP-02 | U,R; A06/C08/D06/D12/H03 | **Open with two live fault regressions:** state persist ENOSPC and revocation EACCES now exercise immediate containment; existing corrupt-JSON lock release remains. A failed config rollback is still swallowed in `config.js`. | Write/sync/rename/backup/rollback and disposable-crash tests at state/authority/latch/inbox/archive/send/notice boundaries; retained input/history, recoverable backups, truthful errors, reacquirable locks, no lost review or blind mutation replay. |
| FND-08 — strict foundation integration gate | B8 / IMP-04 | U,R,T; engineering support for A01/A11 | **Partial:** reproducible install/audit, compiler fixtures, 86 offline checks, 34-entry dry-run package and five affected native scenarios pass. Contour reports no policy violations but has stated graph gaps/advisories. | Full typecheck, CI and real tarball import/resource smoke outside the development tree remain; retain durable sanitized evidence. This is not full native install/disable/remove or release certification. |

**Checkpoint evidence boundary:** `npm ci --ignore-scripts`, `npm run check` (86 pass), `npm run test:types`, isolated strict `src/contracts.js`, `npm run pack:check`, high-severity audit and `npm run test:native` (five pass) were run on 2026-09-23. Full `npm run typecheck -- --pretty false` exits 2 with 620 Pair-source and zero dependency diagnostics. The native run used installed Pi 0.87.1/Fabric 0.93.1/Fovea 0.29.2; supplied Fabric source remains 0.93.0. No paid inference ran. `/tmp` probes/logs remain temporary review artifacts; permanent tests now replace B1, immediate B2 and selected B4 witnesses, but B6 and legacy-pending fixtures remain.

## Evidence portability

The former native runners, fixtures, compiler fixtures and generated result files were removed at the owner's direction. Historical absolute `/tmp` paths and pre-removal pass counts are not reproducible current evidence. Do not restore those runners or create substitutes. Current records may contain source-review notes and static command outcomes only; the release evidence gap remains explicit.

## Final release gate

R7 closes this ledger only after every applicable V1 requirement has the required-layer evidence for the advertised profile. Optional paid tests and VNext features remain separate; neither a syntax check, the existing offline pass count, a startup probe nor a tarball dry-run is a replacement for this gate.

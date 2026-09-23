# V1 acceptance ledger

**Status:** baseline/planning ledger, not a pass report. No remediation phase is marked complete.

**Plan:** [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). **Scope:** [SCOPE-OF-WORK.md](SCOPE-OF-WORK.md).

This ledger preserves every required-result row and test layer from the original handoff's `ACCEPTANCE_TESTS.md`: **101 V1 requirements, 3 VNext rows and 2 optional live-evidence rows**. R0–R7 are the new remediation packages; they do not imply completion of the handoff's original phases.

## How to use

- U = unit, R = fake RPC child, N = actual Pi/Fabric/Fovea with deterministic provider, T = terminal/package, L = separately authorized paid-provider evidence.
- The owner column identifies the primary work package; R7 checks every applicable V1 row, including cross-phase dependencies.
- Baseline notes describe the prior review. Existing 55 passing offline tests do not certify the same behavior at N/T layers. A native failure is not waived because its unit counterpart passes.
- Replace/add evidence as work proceeds: source revision/hash, test name, command, OS/Node, exact runtime/build/resource identities, observed IDs/PIDs, result, sanitized artifact path and limitations. Do not include credentials or full source/transcripts in shared evidence.
- Allowed final statuses: pass, fail, blocked, or explicitly rejected unsupported profile. Skipped/unrun required tests cannot be marked pass. An unsafe supported profile is a failure, not a documentation-only exception.

## Original requirements

| ID | Gate | Required layer(s) | Owner | Review baseline / remaining evidence | Required result (original) |
|---|---|---|---|---|---|
| A01 | V1 | T | R7 | Source/manifest checked; installed-package test pending | Only Pair-owned resources load; no upstream file edits or fork required. |
| A02 | V1 | U,T | R1 | Offline factory test; T qualification pending | No worker, socket, watcher or timer is started in the registration factory. |
| A03 | V1 | N | R4 | Unqualified; required-layer evidence pending | Exactly one worker starts automatically, without another terminal or model greeting. |
| A04 | V1 | U,N | R1 | Disabled default and pre-start rejection covered offline; native/TUI setup-status evidence remains | No paid worker work; Main remains usable; a clear setup status is available. |
| A05 | V1 | U,N | R1 | Offline role coverage; malformed-role checks pending | Explicit worker role is recognized; no nested controller or recursive worker spawning. |
| A06 | V1 | U | R1 | Config exists; migration/provenance incomplete | Documented precedence and provenance; native context settings remain upstream-owned. |
| A07 | V1 | N | R1 | Unqualified; required-layer evidence pending | No implied trust, no unauthorized config or resource execution. |
| A08 | V1 | N | R4 | Native narrow-profile startup only; dedup not qualified | One canonical Fabric/Fovea/Pair copy per runtime; duplicate hooks are not installed. |
| A09 | V1 | N | R0 | Partial native startup/capture; profile/persistence gaps | Actual session/model/effort/root/resource identities validated; registration is not misreported as remote auth success. |
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
| C08 | V1 | U,N | R4 | Source gap: no same-session branch fence | Old reports/grants cannot affect unrelated new ownership; pause/rebind is explicit. |
| C09 | V1 | N | R4 | Native reload qualification pending | Stale contexts/listeners are not used; association/history preserved or explicitly suspended. |
| C10 | V1 | U,R | R4 | Partial nonce/lock coverage; stale-process cases pending | No false readiness or killing unrelated PID; generation checks reject stale state. |
| C11 | V1 | U,N | R4 | Offline same-owner lock test; full native ownership pending | It cannot automatically adopt/control the first instance's worker by name. |
| C12 | V1 | U,N | R4 | Pi-written empty-session bootstrap passes natively; missing retained files still fail closed in U; native missing-file case remains | Explicit error; no blank replacement falsely reported as the same retained session. |
| D01 | V1 | U,N | R5 | Mock question/answer passed; full native Main/Worker pending | Report arrives in existing Main context; decision resumes the same Worker conversation. |
| D02 | V1 | U,N | R5 | Mock checkpoint/revision evidence; native sequence pending | Correct step/attempt/revision tracking; next scope dispatched once. |
| D03 | V1 | U,N | R5 | Mock final approval evidence; safety prerequisites fail | Task stays pending until required Main acceptance and checks. |
| D04 | V1 | U | R5 | Unqualified; required-layer evidence pending | Rejected; host identity and Main-only decision authority prevail. |
| D05 | V1 | U,R | R5 | Partial identity handling; durable replay windows pending | One durable report, one Main notification, one decision target. |
| D06 | V1 | U,R | R5 | Offline duplicate-decision test; native/crash windows pending | Idempotent result; no second continuation or authorization. |
| D07 | V1 | N | R5 | Unqualified; required-layer evidence pending | Report queues; user output not arbitrarily interrupted or lost. |
| D08 | V1 | U | R5 | Source gap: bounded task/review queues missing | Backpressure/clear rejection; no required review silently dropped. |
| D09 | V1 | U,N | R5 | Source gap: policy names/semantics differ | Exactly the documented gates; questions remain possible in every policy. |
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
| E12 | V1 | N | R2 | Limitations documented; unsafe profiles not rejected | Explicit limitation/manual review; no claim local file hashes prove all effects. |
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
| G07 | V1 | T,N | R6 | Mock idle effort change; native pending/model coverage pending | Pending state shown; applied only at safe boundary and validated natively. |
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
| H02 | V1 | U,R | R4 | Uncertain outcomes acknowledged; decision/send reconciliation pending | Reconcile worker grant before deciding to resend; no duplicated mutation. |
| H03 | V1 | U | R4 | Offline corrupt-init test; disk-full/journal matrix pending | Explicit error/fail-closed authority; damaged data preserved for diagnosis. |
| H04 | V1 | T | R7 | Baseline 27-file dry-run passed; actual archive recheck pending | No credentials, sessions, state, node_modules or upstream code copies accidentally included. |
| H05 | V1 | T,N | R7 | No fully qualified supported/unsupported profile pair | Supported stack passes; unsupported profile fails with actionable compatibility detail. |
| H06 | Opt-in evidence | L | Optional later | Not run; separate authorization required | End-to-end proof with exact versions and authorized spend; same conversations continue. |
| H07 | Opt-in evidence | L | Optional later | Not run; separate authorization required | Quality and total billable work reported; no savings claim from cache ratio alone. |
| H08 | VNext | N | Deferred VNext | Deferred; not a V1 feature | Reports route correctly; independent contexts; one Main review queue; bounded concurrency. |
| H09 | VNext | N | Deferred VNext | Deferred; not a V1 feature | Other worker's session, Fovea view and authority unaffected. |
| H10 | VNext | N | Deferred VNext | Deferred; not a V1 feature | Separate evidence/base/branch, no shared session file; combined tests after serialized integration. |
| H11 | V1 | U,N | R2 | Name-gate unit test only; real provider route unqualified | Rejected under V1/V1.1 policy; no uncontrolled recursion. |

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

## Evidence portability

The initial review's temporary artifacts were `/tmp/pair-review.3zLc5G/probes.mjs`, `offline-provider.js`, `native-probe.mjs`, and native result JSON files. They may disappear: R0 must promote portable reproductions into the project test suite and record fresh results. Release qualification must not depend on those absolute paths.

## Final release gate

R7 closes this ledger only after every applicable V1 requirement has the required-layer evidence for the advertised profile. Optional paid tests and VNext features remain separate; neither a syntax check, the existing offline pass count, a startup probe nor a tarball dry-run is a replacement for this gate.

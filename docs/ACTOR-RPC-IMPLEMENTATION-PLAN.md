# Actor-owned RPC: reconciled implementation plan

**Status:** AR-01, NEXT-02 and AR-02 are source-delivered checkpoints. AR-03 is partly implemented: seven of ten tasks accepted at the stable baseline, T08 incomplete, T09/T10 unstarted. The user's **complete all** instruction is tracked in [completion execution](COMPLETION-EXECUTION-PLAN.md), with bounded shared-budget/durability/LR checkpoints and the [five-area delivery plan](FIVE-AREA-DELIVERY-PLAN.md) now recording submission/authority checks and the latest [M1-A/A1-A mailbox/archive checkpoint](MAILBOX-ARCHIVE-CHECKPOINT.md), not a complete foundation freeze. The [next-delivery order](NEXT-DELIVERY-EXECUTION.md) keeps unknown reconciliation, structural replanning and complete public-path qualification ahead of Host/runtime integration. AR-04–08 remain subsequent implementation stages. Actor mode and automatic idle sleep are not activated; runtime/release qualification remains open.

AR-01 delivers concrete stored-record/usage validation and non-authorizing legacy classification, plus compatible caller corrections. See the [source checkpoint](STORED-RECORDS-PLAN.md#9-ar-01-source-checkpoint) for historical evidence: syntax passed, the pinned compiler was unavailable and supplemental full-source checking then failed. The latest bounded checkpoint now records zero supplemental diagnostics across all 24 roots; the pinned/native gates remain separate. Existing legacy identity fabrication and durable obligation/recovery integration remain deferred hazards; AR-02 now preserves pending reports through interruption/stop and conservatively quarantines uncertain prior launches.

**Code baseline:** `078820d2c94057dfa9a808054a2890559e494f96` (`0.1.0`), initially clean working tree. Paths below are relative to `pi-fabric-pair/` unless otherwise identified. Symbol names are the navigation anchors; line ranges describe this baseline.

**Inputs:** all documents and the proposed configuration in the sibling `pair-actor-rpc-plan/`, the current production code, `NEXT-01-02-PLAN.md`, `STORED-RECORDS-PLAN.md`, the acceptance ledger, and supplied Pi/Fabric reference sources. This roadmap reconciles their execution order; it does not replace the original requirements or certify them.

## 1. Recommendation

Proceed with **Pair-owned logical actors over the existing retained Pi RPC transport**, not native Fabric actors wrapping additional Pair workers.

- Main remains the user-facing Pi session and keeps its user-selected model.
- Astra is a supervisor actor with its own persistent session and restricted tools.
- Sol is an implementer actor with its own persistent session and the supported worker profile.
- Each actor owns at most one live RPC process. Actor records are deterministic host state, not additional model conversations.
- One Main-owned `ActorHost` controls identities, queues, grants, decisions, process lifetime and recovery.
- V1 admits one unresolved workflow and one implementation writer per canonical repository workspace. Two resident processes do not mean two writers.
- Both participants remain resident while their workflow is unresolved. After all obligations drain, each healthy idle runtime may sleep after **600,000 ms**, retaining actor identity and session history.
- Explicit stop prevents automatic wake; planned sleep does not. Unknown effects require reconciliation, not prompt replay.

The code already retains workers between assignments. The change is principally an **ownership, persistence, authorization and routing refactor**, with a restricted second participant and a new idle policy. Do not replace the transport or begin by deleting the one-worker guard.

Keep ESM JavaScript/JSDoc/checkJs, no new runtime dependencies, no upstream edits, no daemon, no custom compactor/cache warmer, and no provider-cache or exactly-once-effect promises. Follow the repository's no-tests policy. Planning does not authorize worker launches, provider calls, configured verification, dependency installation, commits or pushes.

## 2. Review evidence and limits

| Check | Result obtained in this review |
|---|---|
| Handoff integrity | All seven entries in `pair-actor-rpc-plan/SHA256SUMS` verified. Original files remain unchanged. |
| Main source identity | Nine of ten principal JS hashes listed in `SOURCE_REVIEW.md` match. `contracts.js` differs: current SHA-256 `8bdebf2dda1d3110690f7865d3169c4d1ee06a7a35d862fc3628f98e7f9b5069`; current validators/migration were inspected rather than assuming archive equivalence. |
| Environment | Node `24.21.0`, npm `11.19.0`. Installed metadata: Pi `0.87.1`, Fabric `0.93.1`, Fovea `0.29.2`. These do not establish the eventual configured child executable/profile. |
| Supplied references | Pi `0.87.1` at `b313731b8`; Fabric `0.93.0` at `0c742a0`; Fovea `0.29.2` at `b594483`. Reference sources are not live qualification. |
| Syntax | `node --check` succeeded for all 15 current `src/*.js` modules on Node 24. |
| Patch integrity before edits | `git diff --check` passed. |
| Full compiler | Not run: project `node_modules` and a PATH `tsc` were absent; no dependencies installed. The last documented result is 538 source/0 dependency diagnostics, not a new measurement. README's 620 count is older. |
| Actor surfaces | No `pair_submit`, `pair_control`, `classifyStoredState`, usage-validator exports, actor host/runtime modules or `idleTimeoutMs` implementation found. `reduceCoordination` is defined but not consumed by Controller/Main/Worker. |
| Behavioral evidence | No tests, probes, children, provider requests, configured checks or session-data access performed. All runtime acceptance remains unverified. |

The installed RPC/command/event/extension/CLI documentation and supplied public source were checked. In the supplied Fabric source, `src/actors/manager.ts` calls `this.agents.run(...)` for an activation and passes `actor.sessionFile`; that is not evidence of a public resident-runtime backend seam. Do not invent `agents.create({runtime: 'resident'})`.

## 3. What actually needs changing

### 3.1 Reuse, do not rebuild

| Existing asset | Preserve |
|---|---|
| `rpc.js: PiRpc`, `RpcUncertainError` | LF/UTF-8 framing, command IDs, continuously drained stdout, stderr diagnostics, uncertainty and process-group containment. |
| `controller.js: startUnlocked`, `activate`, `waitIdle` | Explicit session path/ID, readiness checks, retained process, selected model/profile checks; move lifecycle ownership behind one runtime adapter. |
| `worker.js: registerWorker`, `load`, `pair_report` | Generation/epoch/nonce/session/attempt/lease checks, durable report latch before outbox publication, yield, parent-liveness handling and pre-effect gates. |
| `evidence.js` and report finalization | Source snapshots, content-addressed blobs, configured checks, stable-checkpoint comparisons and hash revalidation before approval. |
| `contracts.js`, `coordination.js`, `transitions.js` | Strict wire validation, original payload hashing, non-authorizing transition results and sticky uncertainty. Complete the missing families and integrate them. |
| Main UI/configuration | Native Main model ownership, user permission dialogs, trusted-project layering, selected-scope saves, explicit migration consent and rendering-only indicator changes. |

### 3.2 Source-backed blockers and deltas

| Priority / finding | Witness | Required change / owning batch |
|---|---|---|
| P0 — Compatibility mismatch in compaction events | `rpc.js:71–76`, `controller.js:133–138` use `auto_compaction_start/end`. Supplied Pi `agent-session.ts:177,2409,2769`, installed declarations and JSON event docs expose `compaction_start/end`. | Normalize the actual supported event vocabulary, including retry and manual compaction. Do not rely on the current `rpc.compacting` flag for sleep safety. AR-02. |
| P0 — Recovery discards obligations | `controller.js:init:33–43`, `activationFailed`, `interrupt`, `stopUnlocked`, `cancelUnlocked`; several paths set `pendingReport = null`. | Retain report/latch/outbox/decision/effect references; interruption/cancel is not evidence of settlement or resolution. AR-01/03/04. |
| P0 — Legacy migration fabricates identity | `contracts.js:migrateStoredState:264–289` generates absent attempt IDs; initialization immediately persists migrated state. | First implement pure classification, then original-byte backup and held-state migration with all readers/writers together. Never authorize from synthesized history. AR-01/04. |
| P0 — Reducer is an unused, partial model | `transitions.js:47–69,158–171`; delivery currently requires `sent → accepted → started → settled`. | Complete dispatch/continuation/review/reset/accounting/reconciliation; reconcile real events that can precede ACK rather than forcing receipt order. Wire one effect executor. AR-03/04. |
| P0 — Startup is not a durable launch transaction | `controller.js:startUnlocked:108–166` increments generation/spawns before persisting the resulting root state. | Persist launch reservation/session reference/generation before spawn; record readiness and exit separately. Recover launch-intent uncertainty without opening the same session twice. AR-02/04. |
| P0 — Current lock is Main-session scoped, not workspace scoped | `controller.js:init:29–30`; `util.js:acquireLock:106–125`; one-worker guard sees only local handles. | Add shared canonical-workspace writer/verification ownership; different Main sessions must not both acquire the same workspace. Stale-owner handling must account for surviving children, not only the parent PID. AR-04, mandatory before AR-06. |
| P0 — Long operations occupy the global serial queue | `start`, `dispatch`, `decide`, `scan → finalizeReport`, `inbox`, `close`. | Short validate/reserve/commit transitions; readiness, RPC, source capture, verification and UI work outside the root lock; revalidate completion fences. AR-02/04. |
| P0 — Supervisor profile does not exist | `extension.js:10–26`; `controller.js:81,97–98`; `native.js:60–75`. | Explicit supervisor role, isolated resource selection, exact active-tool allowlist and scoped reads. Retain the unsafe read-only-Fabric rejection for unsupported profiles. AR-05. |
| P0 — Review authority is globally Main-specific | `main.js:9–14,49–54,89–90`; `controller.js:432–478` uses `report.inspectedAt` and `mainObservation.model`. | Reviewer-bound immutable-evidence receipt, structured supervisor intents and host authorization. Main inspection cannot satisfy Astra's review. AR-05/06. |
| P1 — Permission state is a boolean and old UI replies can outlive intent | `controller.js:193–208`, `main.js:56–68`; forwarding checks only whether that handle is closed. | Bounded dialog map keyed by generation/activation/request; timeout/cancel/rebind invalidation; no affirmative reply after authority revocation. Editor dialogs also need a host deadline. AR-02/04/06. |
| P1 — Stop and idle close are currently the same destructive path | `rpc.js:103–120` clears queue and aborts before EOF. No idle timer exists. | Separate `closeIdle` from `abortAndStop`; do not erase queued native work to manufacture idle eligibility. AR-02/07. |
| P1 — Unbounded pending work | `rpc.js:send/write`; `controller.js:h.pendingEvents`, `uiSerial`; one `currentTool` scalar. | Request/frame/event/dialog bounds, write backpressure, correlated in-flight tool set, overflow-to-hold policy. Reserve capacity for containment/control. AR-02/04. |
| P1 — Dormant validator/writer mismatches | `controller.js:167` writes `diagnosticFile`, rejected by `contracts.js:250`; `schema.js` allows short checkpoint strings on answer/revise while `contracts.js:101` requires a hash. | Implement the existing stored-record plan's source-backed compatibility corrections. Do not weaken approval validation. AR-01. |
| P1 — Lifetime budgets and several configured limits are not enforced as required | `resume:491–500` replaces policy/limits and resets `startedAt`; `decideUnlocked` resets turns on continuations; `metrics.js:19–25` checks only four limits; worker reports use summary character limits. | Durable workflow/step counters and deadlines, explicit budget amendment, UTF-8 byte limits, report/revision limits and cumulative Astra+Sol usage. Preserve unknown costs. AR-03/04/06. |
| P1 — Main's edit guard is not general single-writer enforcement | `main.js:177–180` blocks recognized direct mutations, not arbitrary shell/provider effects. | Define the supported Main pre-effect profile during a writer/evidence reservation. Deny unsupported mutating/opaque entrypoints or report the profile unsupported; do not advertise complete isolation. AR-06. |
| P1 — Notification/dedup is weaker than durable observation | `deliverNotice` marks delivered after optional callback; `acceptReport:366–367` returns for a known ID without comparing the old payload. | Separate published/notified/observed/resolved, compare duplicate identity+original hash, retain conflicting evidence. AR-03/04/06. |
| P1 — Configuration and presentation are worker-shaped | `config.js:5–76,95–102,156–270`; `main.js:34–39,95–108`; `ui.js:11–35,85–136`. | Versioned actor config/layer migration and safe Apply; actor/runtime/workflow status and stale telemetry. The supplied V3 JSON is rejected today. AR-04–08. |

Additional containment boundary: `close()` currently catches stop errors and can proceed to release the owner lock. The new owner must not claim successful shutdown or allow reuse of a session/workspace whose process/effects are still uncontained. Persist a hold and surface the failure; numeric PID reuse is not proof that an unrelated process belongs to Pair.

## 4. Refinements to the supplied plan

1. **Keep its P0/P1 foundation, but split it into bounded work.** Stored-record classification is already specified in detail; do not bundle it with the entire actor state machine. Preserve SR-01–06 and SR-A01–08.
2. **Make protocol compatibility a first runtime gate.** Fix the witnessed compaction event mismatch during extraction, not at final qualification. Read `get_state` after setters; verify thinking as well as model and session.
3. **Freeze causal observations, not an assumed event order.** RPC ACK, start, report and settlement are separate facts. A fast start/settlement before ACK must remain attributable without prematurely freeing admission.
4. **Introduce recovery storage before the second actor.** The classifier alone cannot fix startup loss. Canonical state, journaled grants, held-state UI and child wire admission must ship coherently.
5. **Move enabling automatic idle sleep after the full workflow.** Its pure predicate can be developed earlier, but enabling it before questions, permissions, verification and both-participant holds exist invites premature shutdown.
6. **Separate supervisor construction from two-runtime activation.** The original P5 end-to-end flow cannot run while P6 still owns the one-live-worker admission change. AR-05 constructs the restricted role; AR-06 changes admission and routes the complete flow together.
7. **Bring budgets, cancellation and workspace ownership forward.** They are prerequisites for supervised dispatch, not finishing touches in observability.
8. **Keep public/configuration wiring in the feature batch.** Do not leave working internal methods with missing schemas, registrations, Fabric capture documentation or selected-layer settings support.
9. **Namespace acceptance IDs.** The handoff's A01–A35 conflict with existing repository Axx meanings. This document refers to them as `AR-A01`–`AR-A35`; original ledger IDs and their unverified status remain intact.

## 5. Architecture and field ownership

```text
Main tools / user commands
          |
    PairController                 compatibility facade; no second registry
          |
       ActorHost                   sole root-state writer and scheduler
       /   |    \
 workflow mailbox operation journal + workspace/session reservations
       \   |    /
   role-authorized activation
          |
       PiRuntime                   one generation, one PiRpc, one session
          |
        PiRpc                      public JSONL transport
       /     \
 supervisor  implementer           role-specific participant bridge
```

Suggested focused modules (new names are internal proposals, not upstream APIs):

| Module | Responsibility |
|---|---|
| `observations.js` | Existing planned pure usage-validation leaf. |
| `actor-runtime.js` | `PiRuntime`: startup/readiness, normalized lifecycle, activation observation, telemetry, idle close and containment. |
| `actor-host.js` | Canonical registry, resource reservations, scheduling and bounded effect execution. |
| `actor-mailbox.js` | Bounded typed durable envelopes, idempotency and activation reservation. |
| `actor-bridge.js` | Private file request/reply protocol, role binding, limits, deadlines and reconciliation. |
| `supervisor.js` | `registerSupervisor`, allowed reads/inspection, `pair_control`, yield and compaction state packet. |
| `workflow.js` | Plan/question/review/continuation/completion orchestration through validated transitions. |
| `idle-policy.js` | Pure eligibility and host generation-token deadline coordination. |

Keep current/historical stored contracts in `contracts.js`; introduce `actor-contracts.js` only if a clean pure dependency boundary warrants it. Keep reducers free of filesystem/RPC/model calls. Runtime handles, abort controllers and timers never enter serialized state.

### Durable identity and operation model

- **Actor:** stable ID/role/profile, exact model/thinking, canonical workspace, session path/ID, `enabled | paused | stopped`, generation, mailbox refs and retention holds.
- **Runtime observation:** `sleeping | starting | idle | busy | stopping | faulted`, diagnostic PID, readiness/context timestamps and fault. Disk PID/status is not proof of a live owned process.
- **Workflow:** objective, constraints, revision, participant IDs, planning/implementing/waiting/completed/cancelled/interrupted state, task/report refs, policy snapshot, budgets/deadlines and unresolved obligations.
- **Activation:** actor/generation/workflow revision/input hash, authority reference, `queued | dispatch-intent | accepted | rejected | uncertain | settled | resolved`, with independent ACK/run/report observations. A cancelled activation may still have unsettled effects.
- **Operation:** immutable ID/input hash/target binding plus prepared/published/observed outcomes. Keep operation records in the canonical state initially; authority/outbox/reply files are separately observed publications, not a fictional multi-file transaction.
- **Inspection receipt:** actor, generation, activation, session/model binding, report/checkpoint, requested evidence scope and reply/receipt identity. It attests to evidence delivery through the authorized tool, not cognitive understanding or code correctness.

Every trusted event is stamped from its bound handle/bridge, never a model-selected sender. Extend rather than replace epoch, nonce, session, attempt, lease, task revision and checkpoint fences. Preserve the original payload representation when validating existing hashes.

Persist intent before each authority publication/prompt dispatch; persist the observed outcome afterward. A crash between those writes remains uncertain. Do not describe deduplication as exactly-once external execution. Bound retained records; archive only resolved history under an explicit dedup-retention policy, never evict an unresolved operation to make room.

### Locks and scheduling

Use short root transitions and actor-local dispatch reservations. Execute slow host effects outside the root lock, then validate the captured state revision/generation before committing results. Deterministic bridge reads and human dialogs must be serviceable while a model runs; no tool waits for another model.

Maintain separate reservations for:

1. Main/actor session ownership and launching/stopping generations;
2. resident runtime count;
3. active model count and one activation per actor;
4. one unresolved workflow;
5. canonical-workspace implementation writer and checkpoint verification/freeze.

Workspace ownership must cover cooperating Pair hosts, not merely the current `handles` map. External editors/untracked processes remain outside this workflow control; detect moving evidence and hold rather than claim an OS sandbox.

## 6. Ordered implementation batches

Each batch ends with source/registration inspection, syntax checks, a full compiler result when pinned dependencies are available, and an explicit report of unverified runtime criteria. Do not install dependencies or widen the batch implicitly.

### AR-00 — Baseline and decisions (this planning pass)

**Deliver:** this gap map, compatibility/version boundary, dependency order and acceptance ledger. Preserve the handoff and old requirement history.

**Exit:** source findings are distinguished from runtime evidence. The actual configured child command/model/profile still needs admission during implementation; metadata alone is not sufficient.

### AR-01 — Finish the existing stored-record slice

**Files:** `contracts.js`, new `observations.js`, only necessary compatible caller annotations; stored-record plan/ledger.

- Execute SR-01–06: concrete current/historical records, precise nullable usage, action-specific decision metadata, `diagnosticFile`, independently profiled diagnostics and pure `classifyStoredState`.
- Preserve contextual owner/workspace checks, original values/hashes, historical report tuples, receipts surviving reset and ambiguous obligations.
- Keep config V2/state V1/wire V1 and existing runtime behavior. Do not wire classification into `init`, migrate real data or add actor fields to active records here.

**Exit:** SR-A01–08 source/static checks satisfied; mechanically confirm the classifier and two usage-validator exports and absence of runtime consumers. New modules have no attributable compiler errors; the overall failing baseline remains visible.

### AR-02 — Extract and correct one retained PiRuntime

**Files:** `rpc.js`, new `actor-runtime.js`, lifecycle portions of `controller.js`, `native.js` and bridge telemetry as required.

- Preserve single-live-worker admission and existing public tools.
- Build a single-flight `ensureStarted` boundary; Controller remains the durable launch-intent owner until AR-04.
- Reuse `PiRpc`; normalize `compaction_start/end`, assistant/summarization retry, queue updates, tool IDs, settlement, UI and exit/fault observations against the pinned Pi contract.
- Install observers before commands. Distinguish extension-command probes from inference; `/pair-bridge probe/load` must never become a greeting or work prompt.
- Re-read exact session/model/thinking after initialization/setters; reject drift and missing/corrupt history. Do not assume successful setter ACK proves final selection.
- Add bounded pending requests/writes/events/dialogs and real backpressure. Overflow or ambiguous partial writes hold the activation; no automatic mutating resend.
- Introduce separate `closeIdle(expectedGeneration)` and `abortAndStop(reason)`. Keep automatic sleep disabled. Require confirmed exit before another generation opens the session.
- Move readiness/shutdown waits out of long root transactions without creating a second mutable lifecycle owner. UI requests have identity-bound cancellation/deadlines, not one permission boolean.

**Exit:** one-worker legacy call path uses PiRuntime end to end; correct event names and tool/queue/retry observations are mechanically traced. `agent_settled` retains stdin. No actor mode or timer is enabled. AR-A02/03/13–19/24–25 remain behavioral requirements.

### AR-03 — Complete the authority/workflow model and freeze storage

**Detailed execution runbook:** [AR-03 contract-freeze plan](AR-03-CONTRACT-FREEZE-PLAN.md), prepared after reviewing current concurrent runtime changes and scope. Start with AR3-01's interface/gap reconciliation; AR3-02–05 cover pure records/model composition, field/reader-writer/crash freeze and the AR-04 handoff. This is a plan, not a completed freeze or runtime integration.

**Prerequisite slice delivered before AR-02:** the [NEXT-02 source checkpoint](NEXT-01-02-PLAN.md#10-next-02-transition-model-source-checkpoint) implements 27 pure event kinds and records internal identity/obligation/accounting semantics. This is not the final actor registry, persistent format, trusted producer protocol or V2 wire. The remaining bullets below still govern the complete freeze before AR-04 activation.

**Files:** `contracts.js`, `coordination.js`, `transitions.js`, proposed actor contracts/mailbox/workflow shapes; documentation.

- Reuse the delivered 27-kind kernel for dispatch, answer/revise/approve, evidence receipt, result settlement, notice resolution, reconciliation, reset, budgets and amendments. Extend only witnessed missing actor/workflow semantics; do not reimplement these families as a competing reducer.
- Model early run events independently of command acceptance. Preserve late observations after closure without reopening a grant.
- Define actor operational state, holds, mailbox capacity/idempotency, workflow revisions and bounded role-specific inputs. Represent all stop/pause/cancel/interruption states with unresolved obligations intact.
- Define immutable task/workflow budget snapshots, per-step versus workflow counters, accounting unknowns and authorized amendments. Resume/restart must not reset lifetime deadlines or grant budget changes.
- Freeze Config V3/State V2/actor-control wire V2 readers/writers and the legacy projection before activation. No raw reducer result authorizes an effect.

**Exit:** complete state/issuer/operation table for the required vertical flow; explicit crash-window outcomes; no active format change yet. This completes the model handoff, not runtime safety.

### AR-04 — Integrate canonical ActorHost, persistence and recovery with one implementer

**Files:** `actor-host.js`, `actor-mailbox.js`, Controller facade, durable I/O helpers, contracts, Worker bridge, Main held-state UI/config adapters.

- Build one canonical registry/store. A V2 worker maps to an implementer actor with the same ID/session path; retain `workers/<id>/sessions/`. Do not independently mutate both `state.workers` and `state.actors`.
- Backup exact original bytes before replacement, including rejected inputs. Classification's borrowed decoded object is not a byte backup. Preserve reports/latches/archives/evidence; hold ambiguous legacy work without invented execution identity.
- Roll out State V2 and wire admission together with all consumers and rollback diagnostics. Old peers cannot ignore required grant-commit proof. Keep source backups and read-only legacy evidence access.
- Persist launch/activation/delivery intent, publish and read back authority, dispatch outside the root lock, commit observed outcomes. Every mutation path goes through one host transition/effect boundary.
- Reconcile outbox/latch and pending decisions after restart; compare duplicate payloads, never clear them simply because an owner epoch changed.
- Add workspace/session ownership and surviving-child containment before reuse. Handle stale-owner lock races and PID identity uncertainty conservatively.
- Preserve unknown outcomes and cumulative budgets; explicit stop is sticky. Cancel revokes admission immediately but releases occupancy only after containment/settlement.
- Surface held state through status/inspect/cancel/reconcile paths even when startup cannot admit a runtime. Preserve both primary and rollback errors, including config migration rollback failures.

**Exit:** trace legacy submit → durable reservation → grant → prompt → report → evidence → decision through the canonical host; trace every failure to a retained hold and next permitted action. Only one implementer is admitted; supervision and automatic sleep stay disabled.

### AR-05 — Build the restricted supervisor and deterministic bridge

**Files:** `supervisor.js`, `actor-bridge.js`, `extension.js`, `native.js`, schemas, contracts, evidence receipts and role instructions.

- Add explicit supervisor initialization; only Main creates ActorHost. Reject missing, mixed and conflicting environment bindings. Consider lazy role imports so participants do not initialize Main dependencies.
- Start Astra with automatic extension discovery disabled and only the explicit supervisor bridge. Do not inherit Main's arbitrary extensions, generic Fabric/MCP execution, shell, mutable tools or recursive actors.
- Admit the exact `read/grep/find/ls` plus supervisor Pair tools profile; enforce canonical allowed paths, default search roots and symlink policy before reads. Read/search availability alone is not path confinement.
- Control CLI/resource inputs: inherited `commandArgs`, explicit extensions/skills/templates and tool selectors cannot silently bypass the restricted profile. Verify loaded and active tools after startup; fail unsupported combinations before inference.
- Retain Main/Sol Fabric/Fovea readiness requirements. Supervisor exceptions are role-specific, not a global downgrade.
- Implement bounded file-based control requests/replies: role-stamped IDs, original payload hash, host correlation, capacity, timeout, replay policy and durable receipts. Notify frames only wake scanning; they are not authoritative delivery.
- `pair_control` publishes exactly one plan/answer/review/blocker intent and yields. `pair_inspect` may await a bounded deterministic host reply, never another LLM. Bind receipts to this reviewer activation and evidence identity.

**Exit:** supervisor tool/role admission and all bridge paths are source-reviewed; participant tools cannot start children, mint authority or grant human permissions. No end-to-end two-runtime completion is claimed yet.

### AR-06 — Admit two runtimes and wire the entire supervised workflow

**Files:** ActorHost/scheduler, `workflow.js`, Controller adapters, Main/Worker/Supervisor, schemas/configuration, metrics and safety UI.

- Replace the live-worker assertion with checked capacities: two residents, at most two model activations globally, one per actor, one unresolved workflow, one implementation writer. Idle residents consume no active-inference permit.
- Register `pair_submit` in Main and return a durable receipt promptly. Acquire participant retention holds before dispatch; arrange no-inference startup/readiness for both participants. If either fails admission, hold visibly rather than issue unauthorized work.
- Complete: goal → Astra plan/yield → Sol assignment → Sol question/yield → Astra answer/yield → fresh Sol attempt → frozen evidence → Astra inspect/review/yield → approve/revise → complete or escalate.
- Persist supervisor intents and wait for their producing activation's settled boundary before applying them. Validate exact workflow/revision/report/checkpoint/receipt and user-owned scope/policy. Never permit scope, model/tool, permission, budget or review-policy escalation via model payloads.
- Keep old `pair_dispatch/decide` available only through legacy mode/validated internal adapters; actor mode cannot bypass supervisor policy with the old Main tool path.
- Retain the writer/evidence reservation during verification and approval hash revalidation. Fence results after every outside-lock wait, including cancellation during a check or source read.
- Route human dialogs to Main with exact actor-bound identity; revoke/invalidate on cancellation, deadline, model/session drift or rebind. No affirmative stale replies.
- Aggregate durable per-workflow Astra+Sol usage and report/revision limits before every new activation. Session totals span older workflows: use attributable observations/deltas, not the whole lifetime total. Avoid double-counting compaction/tool-reported usage and preserve gaps/unknowns. Keep Main and warming costs separately labeled.
- Enforce/report the supported Main mutation profile during work; do not claim the current direct-edit check excludes arbitrary shell/provider effects.

**Exit:** each public entry point reaches the same host authorization path, no circular model wait exists, and both actors remain held throughout unresolved workflow states. Original single-worker mode remains available; actor mode requires explicit Apply and is still unqualified behaviorally.

### AR-07 — Enable ten-minute idle sleep and safe cold wake

**Files:** `idle-policy.js`, ActorHost/PiRuntime, config/status.

- Eligibility is a conjunction: enabled, healthy idle runtime, no active/pending activation, no native continuation/retry/compaction/tool/permission work, no queued control/reply/report/verification operation, and no unresolved workflow or retention hold.
- Use monotonic elapsed time and a generation/deadline token. Store wall timestamps only for display. Status/telemetry/health reads never extend the deadline.
- Serialize timer expiry with mailbox admission. New work first cancels the deadline; shutdown first queues new work until the old process exits, then starts the same validated session under a new generation.
- `get_state` does not expose every retry/extension condition. Combine supported event/bridge observations; unknown eligibility means no sleep. Its pending-message count covers steering/follow-up, not every possible extension obligation.
- Keep bounded next-turn coordination packets reconstructible from durable state; never mistake one for a model heartbeat or clear real pending work to force idle.
- Planned idle close uses EOF without work abort/queue clearing. Stop/cancel/shutdown use containment. Sleep never resets session, budgets, actor IDs or explicit-stop state.

**Exit:** all eligibility branches and timer/admission/exit races are traceable in production source. No shutdown at 599,999 ms; eligible close begins at or after 600,000 ms, not an exact scheduling guarantee. AR-A05–12 and AR-A26–31 remain unverified until separately authorized observations.

### AR-08 — Finish configuration, observability and implementation checkpoint

**Files:** `config.js`, Main/UI/metrics, schema exports and `docs/tool-schemas.json`, example config, skills, README, architecture/security/compatibility/acceptance docs.

- Finish safe-boundary Apply: cosmetic changes never wake actors; model/thinking changes require readback at a safe boundary; role/cwd/capability changes require explicit replacement/reset semantics and a new runtime generation as appropriate.
- Display separate actor operational, runtime and workflow states; selected/observed model, session ID/path, generation/PID, mailbox depth, retention reasons/deadline, permissions, retry/compaction/verification and timestamped context/cost observations. Mark sleeping telemetry stale, not zero.
- Show workflow escalation/final outcomes in Main rather than every internal exchange. Keep a durable Main result notice/receipt with no false observed claim.
- Complete strict production annotations without narrowing `tsconfig.json`, weakening strictness or adding broad suppressions. Run the existing full typecheck with pinned dependencies when authorized; zero diagnostics is the implementation gate, not runtime qualification.
- Update obsolete command/test claims in existing docs and publish the exact source/API/version evidence. Run `pack:check` only for packaging review; inspect included new modules/skills/schemas.

**Exit:** one consistent package surface and current implementation report; every unresolved runtime criterion remains marked unverified. No unattended/native/release certification from static checks.

## 7. Configuration and compatibility decisions

The handoff's `proposed-actor-config.json` is a design example, not a file to install now. Preserve its disabled/explicit-opt-in posture.

| Domain | Rollout decision |
|---|---|
| Config V2 → V3 | Normalize V2 worker settings into an explicit legacy mode with unchanged IDs and no automatic Astra delegation. Switching to `actor-pair` requires user review/Apply and exact configured participant IDs. Astra/Sol are example labels, not mandatory renamed histories or model IDs. |
| V1 config/handoff imports | Keep existing disabled previews and explicit `.v1.bak` import support through the version adapters; do not bypass trust/provenance/array-replacement semantics. |
| Actor profiles | Use named `supervisor-restricted` and `worker-native`. Legacy extension/skill settings remain worker-scoped; no silent inheritance into Astra. Preserve old evidence, verification and limit settings omitted from the illustration. |
| Legacy `requirements` | Map deliberately to V3 `workerRequirements` for Main/Sol; do not apply generic Fabric requirements to restricted Astra. Reject conflicting old/new declarations. |
| Idle policy | Actor-pair V1 uses 600,000 ms and retained unresolved workflows. Legacy mode remains unchanged unless the user explicitly selects the new lifecycle policy. Do not silently activate this on upgrade. |
| Safety settings | One writer, no uncertain activation replay, explicit interruption reconciliation, required final review, human permission via Main and stop-on-Main-exit are V1 invariants. Unsupported relaxing values reject rather than being decorative knobs. |
| Capacities | One unresolved workflow; a second submission rejects before a success receipt. Actor mailbox capacity is for typed internal activations, not an implied queue of concurrent user workflows. Resident and active capacities are separate. |
| Existing deferred limits | Preserve V2 `maxQueuedTasks`, `maxQueuedReviews`, automatic repair/recovery settings and distinct active-step/per-step limits. Publish mode-specific enforced/deferred/unsupported status; do not silently equate them to actor mailbox capacity or enable automatic replay. |
| State V1 → V2 | Exact-byte backup, validated migration manifest, unchanged source session paths and held ambiguous obligations. Unknown/future versions are not normalized into executable state. No silent downgrade from live V2. |
| Wire V1 → actor-control V2 | Explicit per-role handshake and compatible legacy report adapter. Add actor/workflow/activation/grant-proof binding coherently; retain V1 payload hash rules and historical archives. An old child cannot consume a new grant without admission. |
| Evidence formats | Keep existing content hashes and manifests readable; store actor/inspection provenance alongside them or version additions explicitly. Do not rewrite historical approvals as Astra decisions. |
| Rollback | Stop/contain new children first. Restore backups only through an explicit offline recovery path; old binaries must not operate concurrently on new-format state or newer source effects. Preserve primary and rollback failure details. |

Before AR-04, freeze a reader/writer table covering `state.json`, actor/workflow/operation records, `authority.json`, `latch.json`, report inbox/archive, bridge requests/replies, telemetry/probe files, Main notices, history/reset archives, evidence/check results, config layers/backups and cosmetic UI configuration. Each row names validator/version, writer, readers, commit/readback rule and incompatible-peer behavior.

## 8. Public surfaces and end-to-end wiring checks

| Surface | Principal / required wiring |
|---|---|
| `pair_submit` (new) | Main → schema/validation → enabled actor-mode/user scope → durable workflow receipt. Never wait for workflow completion. |
| `pair_control` (new) | Astra → role bridge → durable correlated intent → producing activation settlement → host validation/transition. Plan, answer, review or blocker only. |
| `pair_inspect` (extended) | Legacy Main or authorized actor reviewer → immutable artifact read → bound inspection receipt; no caller-supplied arbitrary artifact path. |
| `pair_report` (preserved) | Sol → lease checks/latch → bounded outbox → host report retention → settlement/evidence → supervisor mailbox. |
| `pair_status` (extended) | Read-only snapshot with state/usage freshness; no inference, wake or idle-deadline reset. |
| `pair_cancel` (mode-aware) | Main/user exact task/workflow → admission revocation → cancellation/containment observations. Astra uses bounded control escalation, not arbitrary process control. |
| `pair_dispatch`, `pair_decide` | Legacy compatibility or private validated adapter; no independent bypass in actor mode. |
| `/pair` commands/settings | Explicit actor start/stop/pause/resume/reset plus workflow status/cancel/reconciliation; preserve legacy worker aliases. Default targets must be mode-aware, not blindly `config.workers[0]`. |

Mechanically verify registration, runtime validators, JSDoc symbols, role availability, documented schemas, config defaults/layer migration, Apply, guides/skills and callers in the batch introducing each surface. Ordinary Fabric capture exposes Main/Sol extension tools; restricted Astra calls its registered tools directly without generic Fabric.

## 9. Acceptance ledger and qualification boundary

### Planning acceptance (this change)

- [x] Read the supplied plan and compare it against the actual checkout, not archive claims alone.
- [x] Trace Main → Controller → RPC → Worker report → settled evidence → Main decision, plus restart/stop/configuration paths.
- [x] Identify retained assets, missing public symbols, version domains and source-backed additional blockers.
- [x] Define bounded dependency-ordered batches, ownership, migration, public/config wiring and concrete exits.
- [x] Record current static evidence and avoid representing historical tests/compiler totals as new runs.
- [ ] Implement actor mode. Not part of this planning change.
- [ ] Qualify runtime behavior. Not performed or implied.

### Implementation/runtime requirements

`AR-Axx` below means Axx in the supplied `VERIFICATION_CRITERIA.md`, not the same-numbered original repository requirement. Every row is **planned; runtime unverified**.

| Coverage | Required outcome | Owning batches |
|---|---|---|
| AR-A01–04 | No startup inference; single-flight/session reuse; asynchronous question/answer continuation. | AR-02/04–06 |
| AR-A05–12 | Both workflow holds, exact idle eligibility, timer races and same-session cold wake; status is observational. | AR-06/07 |
| AR-A13–19 | Correct retry/compaction/settlement vocabulary and ordering; ACK loss/crash/stale generation/missing history held safely. | AR-02–04/06 |
| AR-A20–24 | Restricted supervisor, one writer, idempotent decisions, reviewer-bound current evidence and human-only permission. | AR-04–06 |
| AR-A25–28 | Cancel waits safely, stopped actor does not auto-wake, Main shutdown contains children, restart reconciles. | AR-02/04/06/07 |
| AR-A29–32 | Native compaction/context freshness, cumulative budgets, bounded mailbox/idempotency. | AR-03/04/06–08 |
| AR-A33–35 | Coordinated migrations, failed publication never authorizes, role/profile/version drift holds visibly. | AR-01–06/08 |
| Additional source finding | Canonical workspace lock rejects a competing Main owner; failed child containment cannot release ownership for reuse. | AR-04/06 |
| Additional source finding | Permission replies after cancel/rebind reject; full dialog/tool/event state cannot overflow silently. | AR-02/04/06 |
| Additional source finding | Empty verification commands display **no checks configured**, not tests passed. | AR-05/06/08 |

Under `TESTING.md`, do not add tests, fixtures, compiler-negative cases, simulation scripts or live probes. Runtime criteria describe required behavior; they are not instructions to execute it. Any future runtime qualification needs separate owner authorization consistent with that policy. Until evidence exists, do not mark actor mode safe for unattended work.

Per batch report: modified symbols/files; preserved/new invariants; state/wire/config compatibility; public registrations/call paths; exact static commands and exit statuses; remaining compiler diagnostics; any explicitly authorized observations; outstanding AR-A/original requirement IDs; next bounded assignment.

## 10. First implementation assignment (historical)

**Implement AR-01 only**, using `STORED-RECORDS-PLAN.md` as its detailed runbook. Own `contracts.js` and `observations.js`; make only necessary compatible caller annotations. Preserve runtime behavior, active version constants, session paths and all current worktree changes. Do not launch actors, change configuration on disk, migrate real state or restore tests.

This was the AR-01 assignment. Its source checkpoint and the later NEXT-02 model slice are retained as history. AR-02 is now recorded below; do not remove the worker guard or activate proposed formats before their complete readers/writers and safety boundaries exist.

## 11. AR-02 source checkpoint

**Status:** source-implemented, independently reviewed and statically checked; not behavioral/native/release qualification. One retained legacy worker now uses `PiRuntime` end to end. No tests, fixtures, runners, live probes, workers, configured verification, dependency installation, user configuration or session-data changes were performed.

### Delivered source and ownership

- **`src/actor-runtime.js` (new):** one immutable generation; single-flight `ensureStarted`; activation reservation/preparation/send fences; exact session/model/thinking and fresh bridge readback; full-history validation; bounded lifecycle observations/dialogs; `abortCurrent`, `closeIdle(expectedGeneration)` and `abortAndStop(reason)`.
- **`src/rpc.js`:** bounded JSONL requests/writes, fatal UTF-8/framing validation, final-write guards and absolute expiry, callback/drain backpressure, reserved control capacity, correlated ACKs and finite EOF/TERM/KILL containment. Only actual close or proven failed spawn establishes exit. Intentional revocation can continue observing an already-written ACK under its original deadline; it cannot unsend bytes or authorize a resend.
- **`src/controller.js`:** durable V1 launch pathname/generation reservation before file creation/spawn; a runtime handle is the lifecycle owner. Readiness, RPC, verification/evidence and shutdown waits are outside the root serial, with fenced commits. Cancellation revokes immediately; all bounded observations drain before budget/grant/checkpoint decisions. Shutdown joins outside-serial verification before releasing ownership.
- **`src/native.js`, `src/main.js`, `src/worker.js`:** public `pi.getThinkingLevel()` and exact readback; owner-bound cancellable select/confirm/input; denied worker editor forwarding; late-bind shutdown protection; bridge probe/load remain extension commands, not model instructions. Existing telemetry wire stays diagnostic and unchanged.

### Acceptance checks and source witnesses

| Check | Source evidence / limitation |
|---|---|
| Single generation and admission | `PairController.reserveStart/startReserved/stopReserved`, `PiRuntime.ensureStarted`. Persist path/generation/starting intent first; count starting/stopping/unconfirmed handles. Prior uncertain V1 launches quarantine all slots and cannot be erased by reset. |
| No speculative bridge inference; retained identity | `PiRuntime.#bridgeCommand/#start/#verifyRetainedHistory`, `checkReadiness`. Exact `get_commands` extension/source before slash prompts; remove old probe; compare fresh nonce/owner/generation/PID and exact session/model/thinking; strict V3 history and full `get_entries` prefix preservation. Missing/corrupt/oversized history is held, not replaced. |
| Native lifecycle | `PiRuntime.#observe/#waitIdle`. Pi 0.87.1 `compaction_start/end`, assistant/summarization retry, queue snapshots, tool IDs and `agent_settled`; `agent_end` is not idle. Settlement retains stdin. Abort ACK is not settlement. Native failure-only overflow completion is admitted without inventing another start. |
| Bounds and uncertainty | `PiRpc.send/enqueue/pump`, runtime mailboxes/dialogs. 32 ordinary + 8 control requests; 32 ordinary + 16 control writes, 16 MiB + 64 KiB lanes; 16 MiB frame limit; 256 observations/1 MiB, drained in batches of 32; 8 dialogs/64 KiB, one displayed; 128 tools; history 16 MiB/100,000 entries. Overflow/malformed protocol/write or ACK uncertainty holds; no automatic mutating retry. These are internal bounds, not new config fields. |
| Permission identity | Runtime dialog map separates unrevoked startup permissions from current attempted/unsettled work. Recheck identity/deadline at dequeue, user completion and actual write; late dialogs after revocation cannot inherit a null activation. Editor has no cancellable Pi API and is denied. |
| Idle versus containment | `closeIdle` requires fresh idle axes/generation and uses EOF without manufacturing idle through queue clearing. Destructive stop revokes, clears/aborts, closes stdin, then uses bounded TERM/KILL escalation. Exit-unconfirmed ownership remains held. No automatic idle timer/call site is enabled. |
| End-to-end compatibility | Main tools/commands → Controller → PiRuntime → PiRpc → worker bridge/report → settled evidence → Main decision traced. Config V2, state V1, wire V1, package 0.1.0, one live worker/unresolved assignment and existing public registrations remain unchanged. Kernel/classifier remain unwired. |

Review corrected report-before-ACK revocation, observation draining/wakeup and notification loss, outside-serial verification joining, late-dialog admission, Pi's actual `{content} | null` context-edit encoding, overflow exhaustion, abort/settlement ordering, malformed transcript/tool results, timer-only write expiry and missing budget warnings. The final independent correction review reported no remaining finding in those corrected paths. Contour supplied structural exposure/advisories, not a correctness certificate.

### Static and direct interface evidence

- `node --check` for every `src/*.js`, and `git diff --check`: pass.
- `npm run typecheck -- --pretty false`: blocked (`tsc: command not found`); no dependencies installed.
- Supplemental **TypeScript 6.0.3**, all 17 production roots, strict project options with only host `typeRoots`/module-resolution paths: **350 Pair-source / 0 dependency diagnostics**, down from the measured **554** immediately before AR-02. `actor-runtime.js`, `rpc.js`, `controller.js`, contracts/observations/schema/kernel have zero diagnostics. Remaining: config 69, evidence 48, extension 1, main 65, metrics 2, native 14, UI 33, util 30, worker 88. The overall check exits 2; this is not the pinned TS5.9.3 gate.
- Supplemental resolution: TypeScript `/Users/adam2/.pi/agent/npm/node_modules/typescript/lib/typescript.js`; `typeRoots` points to the adjacent `@types`; Pi resolves to `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent`, other packages to the host npm root. No source exclusions, suppressions, generated fixtures or emitted files.
- Direct no-file module-load/API inspection loaded `PiRuntime`, `PiRpc` and `PairController` and listed their methods without constructing/launching a worker. AST inspection confirmed unchanged five Main tools plus `pair_report`, `/pair` and `/pair-bridge`; only Controller imports PiRuntime, and only transitions imports coordination.
- Package dry-run includes `src/actor-runtime.js` through existing `files: ["src", ...]`; no registration/manifest/dependency change. All **106 original requirement rows** remain byte-for-byte unchanged. Kernel, contracts, config, manifest and tsconfig hashes match the start-of-batch snapshot.

### Remaining boundary and next batch

AR-A01–04/13–19/24–25 and all original native/fault/permission/release requirements remain **runtime unverified**, not passed. Declared peer `*` does not qualify arbitrary Pi versions or inherited extensions. Without an external fingerprint, valid history replacement/truncation predating the launch snapshot cannot be detected. Strict history/uncorrelated activity can conservatively hold a generation. V1 has no complete orphan-reconciliation UI/journal: ambiguous prior launches require explicit offline reconciliation, not reset/retry.

AR-02 does not implement canonical cross-Main workspace locking, actor registry/mode, held-legacy original-byte migration, atomic multi-file grants/obligations, complete same-session branch fencing, queue pumping, or lifetime-budget amendments. Legacy `resume` still copies policy/limits and resets time/turn counters; the pure model's stronger semantics are not runtime enforcement. A fail-closed runtime boundary is not a substitute for AR-04.

**Next: AR-03**, complete actor/workflow/authority contracts and the Config V3 / State V2 / actor-control wire V2 reader-writer freeze. Only after that comes AR-04's coherent host/migration/publication integration. Active versions and single-worker admission stay unchanged until the coordinated rollout is implemented.


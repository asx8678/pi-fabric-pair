# AR-03 — Actor/workflow contracts and storage/wire freeze

**Status: AR3-01 decisions and AR3-02 pure leaf/facade source are accepted through T01–06, including independent facade/handoff review `94c9d2b5ab9d4ccfb29b9b770fec07cf`. AR3-03–05 and the complete AR-03 format freeze remain open.** See [actual source/ABI checkpoint](AR3-T06-HANDOFF.md) and [task ledger](AR-03-AGENT-TASKS.md). T07/T08 may now implement the kernel/model slice sequentially; remaining tables stay targets where the checkpoint does not identify accepted code. No active disk/wire rollout or runtime admission is claimed.

**Governing scope:** [SCOPE-OF-WORK.md §10](SCOPE-OF-WORK.md#10-current-scope-after-test-removal), [actor roadmap AR-03/04](ACTOR-RPC-IMPLEMENTATION-PLAN.md#ar-03--complete-the-authorityworkflow-model-and-freeze-storage), [implementation sequence](IMPLEMENTATION-PLAN.md#reconciled-bounded-slices), [acceptance ledger](ACCEPTANCE-LEDGER.md#current-no-tests-implementation-ledger), and [no-tests policy](TESTING.md). Earlier test instructions and runbook “next AR-02” text describe historical checkpoints, not current instructions.

## 1. Scope decision and completion boundary

Proceed with the four requested deliverables, in order:

| Requested work | Existing scope | AR-03 deliverable |
|---|---|---|
| Reconcile concurrent runtime changes; retain 27 existing event kinds | R1/R2/R4; NEXT-01/02; AR-02 → AR-03 interface | Source-backed producer/consumer gap register and explicit non-authorizing adapter contract. |
| Missing actor states, mailbox/idempotency, workflow revisions and lifetime budgets | R1/R4/R5/R6 | Pure typed records, validators and only the additional model semantics required by the actor workflow. |
| Config V3 / State V2 / wire V2 freeze | NEXT-01/02; AR-A33–35 | Field/discriminant definitions, bounded encoding/hash rules, version/role admission, all-reader/all-writer matrix and crash outcomes. |
| AR-04 handoff | NEXT-03/04 | Ordered canonical-host, migration/publication, held-state consumer and recovery integration checklist. |

**Unchanged now and throughout AR-03:** package `0.1.0`, active `CONFIG_VERSION = 2`, `STATE_VERSION = 1`, `WIRE_VERSION = 1`, public tools/commands and single-live-worker restriction. No runtime imports of the new actor model; reducer results remain non-authorizing. Keep executable ESM JS with strict JSDoc/checkJs, not a TS-source rewrite.

**Excluded:** active migration, ActorHost/effect executor, bridge filesystem implementation, queue pumping, supervisor startup, two-runtime activation, idle timer, automatic repair/recovery, new transport/platform, dependency installs, production settings/session changes, tests/fixtures/runners/live probes, commits/pushes. Existing configured-verification functionality is preserved but not invoked. Future architecture requirements may be modeled without enabling them.

**AR-03 exit:** a source-reviewed model/contract freeze and usable AR-04 integration specification. Not: native correctness, admitted-effect enforcement, completed NEXT-01/02 foundations, or release/unattended qualification. The missing pinned compiler and full-source diagnostics remain visible gates.

## 2. Source baseline and concurrent-change reconciliation

Planning baseline: HEAD `078820d2c94057dfa9a808054a2890559e494f96` plus existing uncommitted changes, including untracked `actor-runtime.js` and the actor roadmap. Another Fovea session reported runtime changes; current files were inspected rather than assuming the previous AR-02 review covered that delta. This was a bounded interface/source review, not a complete concurrency audit.

Protection snapshot: 17 production JS modules plus `package.json`, `package-lock.json`, `tsconfig.json` and `fabric-pair.example.json`; SHA-256 over sorted relative path + NUL + file bytes + NUL: `deba92ae02fec0045b1aafbdee69cd9ea73f5cca5b507c4fdb0197a475a25f42`. This is a planning preservation witness, not a freeze of other sessions' work. Re-inventory changed files before implementation; never overwrite their edits.

Most recent source check in this session: all-source syntax/whitespace pass; supplemental TS **6.0.3** checks all **17 roots**, exits **2**, with **350 source / 0 dependency diagnostics**. Runtime/RPC/Controller and contract/kernel modules have zero. Pinned `npm run typecheck` was previously blocked by missing `tsc`; no install or fresh pinned success is implied.

### 2.1 Reuse table and specific gaps

| Current witness | Already present — preserve | Remaining AR-03 specification; later runtime owner |
|---|---|---|
| `coordination.js:KINDS`, `validateTransitionEvent`, `validateCoordinationModel`; `transitions.js:reduceCoordination` | 27 kinds; canonical genesis/events, checked derived projections, expected-validation versus programming-error distinction; `nonAuthorizing: true`. | Compose actor/workflow semantics around this implementation kernel. Do not recreate dispatch, grants, evidence, decisions, notices, budgets or reset as a competing state machine. |
| Kernel `Fence`, `Identity`, `ActorBinding`, `AssignmentSnapshot`, `Grant`, `CurrentTask`, `AccountingSnapshot` | Existing owner/session/generation/nonce/task/attempt/lease fences; immutable snapshots, lifetime and step ledgers, explicit gaps/amendments. | Add workflow/actor/reviewer activation identity without renaming historical identities or using one actor's generation for another. |
| `PiRuntime` `ActivationIdentity`, `reserveActivation`, `prepareActivation`, `activate`, `takeObservations` | Generation-bound local token with serial, pre-send/late-completion fences and bounded native observations. | Local serial/type/timestamp is not durable activation identity. Host must reserve a durable activation/command identity before send and correlate handle/token observations to it. No adapter may stamp a late event using whichever activation happens to be current. Ambiguous attribution holds. |
| `PiRpc.send/enqueue/pump` | Bounded lanes, absolute write expiry, before-write guard, ACK/write uncertainty, no automatic resend. | Durable dispatch intent, original input hash and command correlation belong to Host, not transport. ACK, start, report, native settlement and effect barrier remain independent facts. |
| `PairController.reserveStart/startReserved/activate/stopReserved` | Durable V1 launch/grant intent; outside-root readiness/containment and fenced commits. | Specify root revision/branch and operation bindings for the future sole ActorHost writer; do not add a parallel actor registry to Controller. |
| `PiRuntime.#waitIdle/abortCurrent/closeIdle/abortAndStop` | Event-owned `agent_settled`; retained stdin, separate idle EOF versus containment; exit uncertainty holds. | Runtime idle is not a known-effect barrier, durable grant, review receipt or permission. Map observations, not authorization. No new idle policy call site. |
| `native.js:checkReadiness`; Main `promptUser` | Exact model/thinking/session readback; cancellable select/confirm/input; worker editor denied. | Freeze role/profile/handshake and future actor/workflow/dialog bindings. Keep Main as the only human permission broker; review approval grants no tool privilege. |
| `PairController.resume`, report scan/finalization; Worker `pair_report` | Pending reports retained/archived; V1 still copies policy/limits, resets turn/time fields, and latch can precede inbox publication. | Specify no-reset lifetime semantics and lossless obligations/adoption. Runtime conversion and delivery repair belong to AR-04+, not this batch. |
| `contracts.js:classifyStoredState` and `migrateStoredState` | Pure non-authorizing profile classification; active legacy migration still exists. | Freeze original-byte manifest and held-legacy shape. Never call identity-fabricating migration to manufacture V2 execution proof. |
| `config.js`, `observations.js`, `evidence.js`, Main registration/UI | V2 trust/layer/Apply/import rules; explicit usage unknowns; evidence hashes and public tools. | Preserve these consumers in the freeze matrix, including ignored/deferred settings; no format bump or schema/example/tool change now. |

### 2.2 Preserve the existing event union

Mechanical inventory found exactly:

```text
dispatch-requested, intent-committed, prepare-grant, grant-committed,
authority-published, dispatch-prepared, effects-reconciled,
checkpoint-finalized, evidence-receipt, checkpoint-current, decide,
notice-resolved, worker-delivery, main-delivery, usage-observed,
counter-observed, budget-evaluated, amendment-proposed,
automatic-action-prepared, reconciliation-proposed, reset-requested,
lifecycle, owner-replaced, report, runtime, failure, unsupported
```

The [AR3-01 disposition table](AR3-01-DECISIONS.md#2-individual-27-kind-disposition) classifies every kind: **24 reuse**, **2 bounded extensions** (`evidence-receipt`, `decide`) and **1 not involved** (`automatic-action-prepared`). Any extension needs a concrete missing actor-flow invariant and backward compatibility analysis; 27 is the reuse baseline, not an arbitrary ban on necessary additive kinds. Preserve late observations after closure without reopening a grant, early run/report before ACK, and retained conflicting histories. Existing supervisor accounting/correlation and arbitrary-plan replacement limitations are not solved by relabeling implementer events.

## 3. Ordered implementation slices and ownership

| Slice | Deliverable and files | Entry/exit and writer discipline |
|---|---|---|
| **AR3-01 — Reconcile and decide representation** | Update this runbook's source gap register; inspect `actor-runtime.js`, `rpc.js`, Controller, Main/native/Worker and the three pure modules. Record D1–D6 below. | First assignment. Re-read drift; trace legacy dispatch → prompt → report → evidence → decision and shutdown. Freeze interface vocabulary before shared-file writes. No runtime fixes hidden in this slice; a concrete blocker gets a separate bounded AR-02 correction. |
| **AR3-02 — Actor/storage/wire leaves** | New pure `src/actor-contracts.js`; only necessary reusable leaf annotations in `contracts.js`/`observations.js`. | Implement the planned records/validators below without changing active constants or current validators' acceptance. Host identity is a required input, never inferred from model payloads. |
| **AR3-03 — Workflow composition and lifetime semantics** | Proposed pure `src/actor-model.js` composes `coordination.js`/`transitions.js`; extend the existing kernel only for an evidenced gap. | No second implementation-grant reducer or independent serialized projection. Complete the issuer/operation table, role-bound inputs, supervisor usage attribution, holds, revisions and immutable budgets. All results explicitly non-authorizing. |
| **AR3-04 — Freeze formats and legacy projection** | Pure V3/V2 contracts/codecs/projections, final field and reader/writer tables; this runbook and compatibility docs. | Resolve every D1–D6 choice, bounds, zero/null/default meaning, hash rule and downgrade action. Include all current consumers; no filesystem reader/writer is switched on. |
| **AR3-05 — Review, static checkpoint, AR-04 handoff** | Source review, syntax, full existing compiler command and package dry-run; acceptance ledger and governing plans. | Mechanically confirm exports/dependencies/versions/registrations and 106 original rows. Report pinned versus supplemental results separately. A completed source handoff is not a passing compiler/runtime/release gate. |

**Agent execution cards:** [next ten implementation tasks](AR-03-AGENT-TASKS.md) split AR3-02–05 into ordered, exclusive-file assignments. T01 implements common primitives/codec, T02–05 implement four private pure leaf helpers in parallel, T06 integrates the six-export `actor-contracts.js` facade, one model owner performs T07 then T08, and T09/T10 provide independent review/final integration. This internal leaf split preserves the selected public signatures and does not authorize runtime consumers. Tasks are prepared, not executed.

**Parallelism:** source inventory and independent review can be read-only in parallel. One writer owns `coordination.js` + `transitions.js` + actor composition; a different writer may own actor-contract leaves only after signatures are agreed. Parent/integrator owns shared `contracts.js` changes and documentation. No simultaneous writers to shared modules; no agent count/model selection is authorized by this plan alone.

### Planned pure public symbols (module exports, not Pi tools)

- `actor-contracts.js`: `validateActorConfigV3`, `validateActorRecordV2`, `validateWorkflowRecordV2`, `validateActivationRecordV2`, `validateMailboxEnvelopeV2`, `validateActorControlV2`.
- `actor-model.js`: `validateActorStateV2`, `projectLegacyWorkerView`, `validateActorWorkflowModel`, `validateActorWorkflowEvent`, `reduceActorWorkflow`; compose existing kernel behavior rather than duplicate it. AR3-01 moves aggregate state validation and legacy projection here to require full replay without a leaf/model dependency cycle. See [selected signatures](AR3-01-DECISIONS.md#shared-next-slice-signatures).
- Preserve `classifyStoredState`, `validateStoredState`, `validateTransitionEvent`, `validateCoordinationModel`, `reduceCoordination` and existing exports. Record a justified rename of a planned symbol here before declaring implementation complete.
- Dependency direction: actor-contract leaves may depend on current contracts/usage leaves; actor-model may depend on those and the implementation kernel. Current contracts and runtime must not import actor-model; avoid a contract/kernel cycle. No new Pi registrations or runtime consumers during AR-03.

## 4. Record and invariant inventory to freeze

Names below are proposed field vocabulary; AR3-02/04 must ratify exact nesting and reject extra fields. This table is a work specification, **not an already accepted schema**. Separate immutable intent, observed fact, derived view and execution permission.

| Record | Required field groups / relationships | Critical invariant |
|---|---|---|
| `ActorRecordV2` | `actorId`, `role`, `profile`, canonical `cwd/repoRoot`; selected provider/model/thinking; session ID/path; generation; operational state; independent hold causes; mailbox/activation/retention references. | One canonical registry; V2 workers keep IDs and `workers/<id>/sessions/` paths. Null/unverified session identity is not readiness. Never serialize child handles, timers, abort controllers or promises. |
| Actor operational state | `enabled | paused | stopped`; root disabled/ownership holds remain independent; cause ID/scope/created-at/resolution witness. | Stop persists even without a process. Dispatch/autostart/queue activity cannot clear it. Start/on do not imply resume or inference. Clearing one hold never clears unrelated holds. |
| Runtime observation | `sleeping | starting | idle | busy | stopping | faulted`, generation, observation sequence/time, selected/observed binding, context/usage freshness and diagnostic PID/exit. | Observational only. Disk PID or idle cannot prove process ownership, permission, quiescence or an effect's outcome. Restart invalidates readiness, not the saved history. |
| `WorkflowRecordV2` | workflow/request ID + input hash; owner/branch binding; objective/constraints; supervisor/implementer IDs; revision, plan revision, steps/current step; planning/implementing/waiting/review/needs-user/completed/cancelled/interrupted status; current task/report/decision refs; assignment snapshot and obligations. | One unresolved workflow. A second submission fails before a success receipt. Pending question/review/blocker survives pause, interruption, cancellation and generation replacement until an explicit disposition is retained. |
| `ActivationRecordV2` | activation/operation/command IDs; actor role/generation/session/model/profile; workflow + revision; task/attempt/lease where applicable; immutable input/ref/hash; authority/grant-commit proof ref; dispatch intent; independent ACK/run/report/settlement/effect-barrier observations; resolution. | An implementer activation references the existing kernel grant. Supervisor activation is not an implementation lease. Report or run may precede ACK. Closure/cancellation cannot erase uncertain effects or release reservations prematurely. |
| `MailboxEnvelopeV2` | version; message/idempotency key; operation, producer and consumer binding; kind; workflow/expected revision; correlation/causation IDs; bounded role-specific payload/ref/hash; creation/expiry; durable admission/reservation/disposition and reply reference. | Model-supplied identity is checked against a host-stamped binding, not trusted as a principal. Queued/admitted receipt is not a model activation. Deadline does not delete an unresolved obligation. |
| `OperationRecordV2` | immutable operation ID/type/input hash; target and expected root/workflow revisions; prepared/committed intent; publication/dispatch observations, uncertainty/error; resolution/receipt. | Root state commits before publication/dispatch. Independent files are not an atomic transaction. Immutable idempotency does not promise exactly-once external execution. |
| `ActorControlV2` | wire version, kind, request/reply IDs; complete owner/actor/generation/session/nonce/profile/role binding; workflow/revision/activation and task/attempt/lease as appropriate; input hash; deadline; intent/grant-commit proof and response/disposition. | Actor identity, grant proof and role requirements are checked on both sides. Unsupported required fields/version/profile reject before inference/effects. An unbound V1 peer cannot receive a V2 grant. |
| `InspectionReceiptV2` | request/reply/receipt IDs; reviewer actor/generation/activation/session/model; workflow revision; original report and checkpoint hashes; requested evidence scope; delivery witness. | Evidence delivery is not model understanding. A receipt from another activation/model/report/revision cannot authorize this review. Revalidate current source separately. |
| Assignment/budget snapshot | config revision/hash; initial policy, limits, verification, role/capability and workspace scope; assigned-at, absolute lifetime deadline; budget revision/hash; authorized amendment references. | Resume/restart/config edits cannot replace the assignment snapshot, reset counters/deadline or widen scope/tools/model/permissions/review policy. |
| Accounting observations | stable observation/request ID + source; actor/generation/activation/workflow/task/step attribution; cost/token/request/turn/report/revision/attempt/active-interval measures; timestamp/clock identity; explicit gaps. | Reuse `UsageObservation`, `AccountingSnapshot` and the kernel ledger. Known zero differs from missing/null; workflow totals are deduplicated attributable supervisor + implementer usage, not whole native-session totals. |
| Migration/held legacy | original path/byte length/hash, exact-byte backup ref, source version/profile, validation issue, source bindings/history/evidence/obligation refs, migration operation/stage and explicit adoption outcome. | Never invent an old execution identity. Rejected/unknown input remains preserved and inert. A borrowed decoded object is not an exact-byte backup. |
| `LegacyWorkerView` | stable old ID/session/history and diagnostic/status/held-reason references derived from canonical actors/workflows. | Read-only, non-authorizing compatibility view; not independently mutable `state.workers`, not a V1 write-back, and not input to the legacy authorizing validator. Unrepresentable state must be explicit, never silently dropped. |

### 4.1 Mailbox, duplicate and capacity rules

1. Freeze independent **count and UTF-8 byte** limits for queued inputs, envelopes, replies, receipts, journals and archives. The supplied config's `maxQueuedPerActor: 8` / `maxEnvelopeBytes: 65536` are candidates, not active config. Transport's 16 MiB bound is not a mailbox budget. Bound referenced payloads too.
2. Key idempotency by protocol domain + original producer/target binding + operation/message ID. Same key and same original payload hash returns the retained receipt/disposition without repeating inference or grant creation. Same key with changed content is a retained conflict/hold, not last-write-wins. Current caller authorization is revalidated before any reply is disclosed.
3. Reserve ordinary capacity before returning an accepted receipt; account separately for queued versus active/reserved slots and required review/result obligations. Zero ordinary capacity admits no new work requiring that capacity; it never silently becomes unbounded or discards existing work. Provide bounded reserved control/disposition capacity so full queues cannot suppress cancellation or failure reporting.
4. Persist consumed/resolved dispositions before releasing ordinary occupancy. Unknown execution remains reserved/held. Freeze question/control priority and a bounded fairness rule without adding a scheduler now. Cancellation may revoke admission immediately, but cannot claim effect settlement.
5. Freeze a replay horizon/tombstone and archival policy. Never evict unresolved records; resolved dedup history may leave memory only with durable retention and a rule rejecting unverifiable old IDs. Storage pressure backpressures/holds, not implicit forget-and-replay. Native session compaction is unrelated to durable mailbox/journal retention.

### 4.2 Workflow, issuer and revision rules

The complete vertical path is **Main goal → supervisor plan/yield → implementer assignment → question/yield → supervisor answer/yield → fresh implementer attempt → retained report → effect reconciliation + immutable evidence → supervisor inspection/review/yield → approve/revise → completion/escalation**. The model defines this flow; no participants launch in AR-03.

| Operation/fact | Principal / required binding | Commit/apply boundary |
|---|---|---|
| Submit / cancel / lifecycle / budget amendment | User/Main intent with current owner/branch and expected revision; human authority must be distinguished from a Main model's suggestion. | Host persists validated intent. Model payload cannot manufacture consent or scope/budget enlargement. |
| Plan / answer / review / blocker | Host-stamped supervisor actor/generation/activation and exact workflow revision; only bounded role-specific content. | Retain intent first; apply only after its producing activation settles and all required evidence/accounting prerequisites hold. |
| Implementation report | Worker bridge's original producer identity, task/attempt/lease, workflow mapping and payload hash. | Retain once independently of prompt ACK; finalization requires known-effect reconciliation, not only `agent_settled`. |
| Runtime/transport observations | Bound runtime handle and reserved durable activation/command, not model-selected sender. | Late observations remain historical; inconsistent or unattributable facts hold, never reopen a closed grant. |
| Storage/publication/evidence/accounting | Dedicated trusted boundary with operation/hash/revision/coverage witness. | A source tag in JSON is not authentication. AR-04 constructs these facts after observed I/O and revalidation. |
| Recovery / adoption / reset / archive | Explicit current user/host authorization, retained original identity and complete obligation/accounting/containment/archive coverage. | No “resume = new lease”, archive-before-preservation, or deletion of uncertain history. |

Freeze `workflowRevision`, `planRevision`, actor `generation`, attempt number and budget revision as distinct counters/identities; increment only at their named commits and reject overflow. Every decision references the exact report, checkpoint, inspection receipts and expected revision. A plan amendment does not silently rewrite prior steps/history or authorize new scope. Define outcomes for duplicate, stale, future, conflicting and wrong-principal inputs.

### 4.3 Lifetime budgets and unknowns

- Keep task wall-clock/lifetime deadline, active-step time, per-step turns/revisions, workflow totals and native RPC/UI deadlines distinct. Existing `taskTimeoutMs` must not be silently reinterpreted as active-only time. Preserve the kernel's assignment-anchored lifetime deadline and identified monotonic active intervals; no process-clock subtraction across generations without a reconciliation witness.
- Active time excludes queue, permission, question, review and paused waits. Lifetime/wall-clock deadlines continue according to the frozen policy; idle sleep and resume do not extend them.
- Aggregate supervisor and implementer observations under one workflow with dedup IDs. Reused sessions contain older workflows: whole-session totals are not current spend. Define authoritative message usage versus compaction/summary/tool usage to prevent double counting. Main/warming observations remain separate; no warming is introduced.
- Budget evaluation reads an immutable accounting revision plus gap set. Unknown price/effects/accounting stays unknown; a cap cannot be declared satisfied by treating missing data as zero. Exhausted budgets can retain evidence and publish a bounded no-new-inference result without admitting another activation.
- Amendments name the expected budget revision, exact changed fields, authorization and absolute deadline if changed. Reuse the current kernel's explicit allowed amendment fields; no policy copy-in from current config. Reductions preserve obligations and never erase spend. Automatic repair/recovery limits may be represented and remain inactive.

## 5. Version and reader/writer freeze

### 5.1 Configuration V3 field families

Retain the supplied example's `version`, `enabled`, `mode`, `autoStart`, `indicator`, `actors`, `workflow`, `runtime`, `mailbox`, `supervision`, `safety`, `workerRequirements`, `limits`, `verification`, **and preserve current `evidence` plus omitted deferred limits**. Ratify exact field names/defaults in AR3-04; do not copy the illustrative JSON into an active config.

- `mode: legacy | actor-pair`; V2 workers map to explicit legacy mode with unchanged IDs/model/session roots and no automatic supervisor. V1/handoff imports remain disabled previews requiring Apply; existing trusted-layer provenance, array replacement and retained-backup import semantics survive.
- Actor definitions bind stable ID/role/provider/model/effort/cwd/profile. `supervisor-restricted` cannot inherit arbitrary worker commandArgs/extensions/skills/resources; freeze separate permitted launch inputs. Actor IDs are selected values, not mandatory Astra/Sol renames.
- Workflow participant IDs must exist with matching distinct roles. Future actor-pair capacities are at most two residents/two active model activations, one activation per actor, **one implementer writer and one unresolved workflow**. These are distinct reservations, not a broadened `maxWorkers` switch.
- Carry current supervision, verification/evidence limits and all six deferred fields. Publish a mode-specific enforced/deferred/unsupported matrix. Legacy `maxQueuedTasks` is not actor mailbox capacity, and retained automatic-action settings do not turn automation on. `requirements` → `workerRequirements` mapping rejects conflicting declarations.
- Preserve human permission via Main, explicit resume after interruption, no uncertain replay, required final review and owned-child containment on Main exit. Unsupported relaxing values reject. Original user-only final-review opt-out remains a separately gated implementation requirement, not a new AR-03 exception.
- The future actor-pair idle policy is 600,000 ms with retention during unresolved workflow; V2/legacy upgrades do not enable it. Runtime deadlines, idle timeout and lifetime workflow deadline are separate.

### 5.2 State V2 and wire V2 field families

State root design must cover `version`, root revision and owner/branch/config binding; **one** actor registry; workflow and activation identities; canonical coordination history; operation/mailbox/notice/inspection/accounting references; reservations/holds; migration/archive references and retained errors. Each data item has one canonical owner; indexes/projections are derived and checked, not independent mutable truth. D1 decides exact nesting/encoding before serialization code is finalized.

Wire V2 must cover per-role handshake, authority, report/control envelopes, latch/disposition, request/reply/receipt, probe/telemetry and incompatible-peer behavior. Do not reuse a generic opaque `Record<string, unknown>` as a completed boundary. Unknown required kind/version/role or missing grant proof is non-authorizing. Preserve historical V1 envelope/hash semantics through an explicit role-bound adapter; never add V2 fields and pretend a V1 peer checks them. Pi's own native JSONL/session formats are not renumbered.

### 5.3 Exhaustive persistence/publication matrix

In AR3-04, every row must name the **exact schema/version/validator**, complete field/default/null/bound rules, canonical owner, writer/readers, commit/readback/hash rule and incompatible-peer outcome. The table below assigns the mandatory rows and migration boundary, not implemented I/O.

| Artifact / surface | Writer → all required readers | Frozen ordering and compatibility obligation |
|---|---|---|
| `state.json`, actor/workflow/activation records | ActorHost sole writer → loader, scheduler, Controller facade, status/UI/inspect/cancel/reconcile, migration/rollback | Exact-byte backup/classification first; root revision and complete cross-ref validation; no dual worker/actor writer; unknown version held. |
| Coordination history, operation journal and effect reservations | Host → recovery, grant/effect executor, archive, derived views | Intent commit before effects; canonical history/derived projection rules; bounded replay/retention; contradictory observations preserved. |
| Actor mailboxes, idempotency/disposition records | Host (bridge ingress only proposes) → host admission/recovery, bounded participant reply reader | Durable capacity reservation before receipt; original input hash and retained outcome; no eviction of unresolved work. |
| `authority.json` | Host → Worker/supervisor role gate, startup recovery | Committed operation/grant proof + publication hash/readback; recipient binds role/version/generation/session/nonce; stale/incompatible peer denied. |
| `latch.json` | Implementer bridge → report publisher, Host recovery | Latch records original result; missing inbox is a delivery-repair obligation, not proof of success and never permission to repeat implementation effects. |
| Report `inbox/` and `archive/` | Implementer bridge publishes; Host retains then archives → review/evidence/recovery/history | Preserve V1 payload/hash and producer identity; compare duplicates/conflicts; archive only after durable retained ingress. |
| Supervisor bridge requests/replies and inspection receipts | Participant request → Host role validator; Host reply → originating activation, recovery/inspection | File paths derived from validated IDs; bounded payload/reference; durable correlation, exact producer settlement and receipt scope; notify is only a wake hint. |
| `probe.json` / `telemetry.json` | Participant native bridge → PiRuntime readiness, Host diagnostics/UI | Fresh owner/nonce/generation/role/profile handshake; session/model readback; telemetry remains observational, timestamped and stale-aware. |
| Main notices / native custom delivery entries | Host owns notice intent; Main publishes notification/observation → inbox/decision/recovery | Published/notified/observed/resolved are distinct. `sendMessage`/`appendEntry` returning void is not recipient acknowledgement; native entries are evidence, not a second notice registry. |
| Task/history/reset archives and dedup tombstones | Host archive boundary → status/inspect/adoption/reset/recovery | Original identities, receipt/hash/coverage manifest and unresolved references retained; no deletion by reset merely to free occupancy. |
| Evidence blobs/manifests and verification results | Existing evidence boundary under Host reservation → Main/reviewer inspection, approval/continuation/recovery | Preserve old hashes; version additions explicitly; source identity before/after EACH configured command and final continuation revalidation; stale or incomplete evidence holds. |
| `fabric-pair.json`, legacy `pair.json`, layer previews and backups | Explicit user Apply/config adapter → loader, Main/settings, Host, role launch builder | V2/handoff remain readable as explicit legacy/disabled previews; trust/provenance/array semantics preserved; no auto actor-pair switch, silent overwrite or downgrade. |
| `fabric-pair-ui.json` | Cosmetic UI Apply → Main/UI | Cosmetic-only; no authority/policy change, model call, wake or idle-deadline reset. |
| Native Pi session JSONL and resource settings | Pi is session writer; Pair reserves paths → PiRuntime/history reader, explicit archive references | Preserve native V3 bytes/IDs/paths and AR-02 full-history checks; no fabricated header, custom compactor or automatic blank replacement. Never migrate upstream settings. |

### 5.4 Decisions that must be closed before calling the freeze complete

| ID | Decision owner / required resolution |
|---|---|
| **D1 — Canonical representation** | Model + contract integrator chooses the State V2 root/actor/workflow ownership and exact canonical journal representation. Prefer existing genesis/events with validated derived views; never persist independently writable copies of grants, actor projections or accounting totals. Specify event domain/version and conversion if an actor wrapper is needed. |
| **D2 — Correlation and actor composition** | Model writer freezes supervisor activation/usage/decision correlation, native-event ambiguity outcomes, branch revision and the mapping into all reused kernel families. Decide additive event kinds only from witnessed gaps; no invented runtime provenance. |
| **D3 — Bounds, fairness and replay retention** | Contract + model writers freeze finite count/byte/reference/depth limits, ordinary versus reserved control capacity, zero semantics, fairness and maximum live history/replay work. Specify overflow/archive/tombstone behavior and crash accounting; no unfinished “bounded later” contract. |
| **D4 — Encoding and proof** | Contract writer freezes canonical V2 serialization, hash domains/algorithms and original V1 hash compatibility; immutable payload versus envelope hashing; exact grant/publication proof and role handshake. A digest/source label alone does not authenticate the producer. |
| **D5 — Migration and legacy view** | Integrator enumerates supported historical profiles, backup manifest/stages, held reasons, representable read-only views, explicit adoption and unknown-version/rejected-byte outcomes. Every preserved obligation has a discoverable reader. |
| **D6 — Coordinated version activation** | Integrator records when each actual loader/writer/Apply/role consumer switches. AR-04 can first adapt V2 config into the canonical legacy Host; Config V3 user-facing activation waits for every required reader/Apply/role gate. State/wire rollout is coordinated, not a global constant bump. AR-06/08 may finish consumers/UI but cannot leave a partially admitted format active. |

D1–D6 are selected and source-reviewed in the [AR3-01 decision record](AR3-01-DECISIONS.md). The independent review's identifier-grammar finding was corrected against the existing validators. Design selection is not implemented codec/validator coverage or full freeze completion: AR3-02–04 must implement and cross-check every field/branch/reader/writer. No approved safety/product boundary changes.

## 6. Crash and uncertainty outcome table

For each row AR3-04 records exact retained fields, allowed resolver/issuer and next permitted operation. AR-04 later implements the filesystem/process behavior. No automatic mutating replay is implied.

| Window / observation | Required durable/model outcome |
|---|---|
| Before launch/grant/dispatch intent commits | No effect authorization; a purely uncommitted proposal can be rejected. Never infer an issued command from planned intent. |
| Intent committed, authority missing/not read back | Prepared/held publication with original operation/hash; no prompt. Reconciliation may repair the same proven-safe publication, not mint a new lease. |
| Authority visible, publication/outcome commit missing | Retain uncertainty, close admission and reconcile matching owner/grant proof; publication does not prove activation or effects. |
| Prompt may have been written; ACK absent or negative conflicts with run/report | Preserve independent send/ACK/run/report facts; unknown/conflict holds. Proven-not-written may be explicitly rescheduled under a new valid reservation; possibly written is never blindly resent. |
| Report/started/settled observed before ACK | Retain under the original activation; do not fabricate ACK, drop the report, or force a linear receipt order. Native settlement alone is not an effect barrier. |
| Latch committed, report inbox absent | Retain original report bytes/hash as delivery obligation; repair publication only with matching stored result and identity. Never rerun work to recreate a report. |
| Inbox read, root retention fails, or archive move interrupted | Do not discard the only report copy. Recovery compares durable retained ingress, archive and original hash before deduplication/advancement. |
| Supervisor intent retained but producer not settled | Intent remains pending/inert; no implementation continuation, approval or scope change. |
| Decision committed, continuation publication/ACK unknown | Retain decision, pending notice/disposition and fresh-attempt identity; unknown delivery holds without replay or loss of the required review. |
| Cancel/stop/off/owner navigation while startup, dialog, evidence or verification waits | Revoke admission immediately; late completions are fenced/history. Holds and reservations remain until containment/effect/accounting obligations resolve. No stale affirmative UI response. |
| Child exit/PID/session history cannot be proved | Held generation/workspace; no replacement process on the same history, no kill from saved PID alone, no empty-history substitution. |
| Budget interval ends on crash or cost/usage attribution is missing | Preserve prior totals and explicit gap; no reset/zero-fill or cross-process monotonic-clock subtraction. A user-approved amendment is not a fabricated accounting observation. |
| Source changes during verification or after review while readiness waits | Bind each check to before/after source identity and current reservation; stale receipt cannot approve a different checkpoint or mint continuation. |
| State/config replacement or rollback fails | Preserve original bytes, migration operation and both primary/rollback failures with recoverable paths. No success claim, silent rollback failure, or old binary acting on live V2 data. |
| Capacity overflow, malformed/future version, conflicting duplicate | Bounded rejection/hold plus retained diagnostic identity; control/disposition remains possible. Never widen capacity or drop an unresolved review/receipt. |
| Archive/reset interrupted | Retain live obligations and archive coverage uncertainty. Detach only after confirmed coverage, containment and authorized disposition; reset is not a reconciliation bypass. |

## 7. AR-04 integration handoff

Deliver an explicit source map from every current mutation to its future **sole Host** operation. At minimum cover Controller init/persist/updateConfig, reserveStart/startReserved/activate, report scan/accept/finalize/inspect, decisions/continuation, notice delivery, resume/pause/cancel/stop/reset/close; Worker authority/latch/report; Main binding/navigation/settings/permissions; evidence/check and usage producers.

Integration order:

1. **Canonical loader and owner:** preserve exact source bytes; classify; acquire canonical workspace/session ownership; validate State V2 or construct a held legacy migration proposal. Store owner/branch/generation identity before effects. Expose held status/inspect/cancel/reconcile even if no runtime can start.
2. **Single store and compatible views:** replace Controller mutation ownership with one ActorHost while preserving legacy public behavior through checked adapters. `workers/<id>/sessions/` stays unchanged; no second writable `workers` registry.
3. **Durable operations/publication:** commit launch/grant/dispatch intent, publish/read back authority, dispatch outside the root lock, fence completion by root revision/owner/actor/workflow/activation, then commit observed outcome. Integrate State V2 and role/wire V2 admission coherently; old peers remain inert rather than ignoring required proof.
4. **Effects, evidence and accounting:** establish admitted-effect coverage or reject unsupported profiles. Retain the writer/checkpoint reservation through per-command verification and approval/continuation revalidation. Join attributed usage/gaps and permission cancellation; idle/settled is never substituted for this barrier.
5. **Recovery and obligations:** reconcile latch/outbox/archive/notices, pending supervisor intents and uncertain commands; explicit old-report adoption and no-reset lifetime resume. Implement sticky stop/off/branch fences and surviving-child containment without unsafe PID inference.
6. **Full legacy vertical path first:** submit → durable reservation → grant/prompt → report → effects/evidence → decision/continuation, plus failure/hold paths, with one implementer only. New supervisor runtime/tool bridge remains AR-05; two-runtime workflow AR-06; automatic idle AR-07; remaining config/UI/observability AR-08.

AR-04 must not begin format activation while D1–D6, a required reader/writer, supported effect boundary or held-state consumer is missing. Pure contracts do not authenticate observations or authorize execution. Preserve the recorded pinned-typecheck failure and behavior-qualification gaps through handoff.

## 8. Acceptance ledger for the implementation batch

**AR3-A01 has source/interface evidence in the completed AR3-01 checkpoint. AR3-A02–10 remain open implementation/static gates.** The AR3-01 review/checks cover its documentation boundary only, not these future validators or the full freeze. These IDs supplement, not replace, original requirements or `AR-Axx` runtime criteria.

| ID | Concrete implementation/static check | Scope / runtime requirements retained |
|---|---|---|
| AR3-A01 | Snapshot concurrent sources; complete the 27-kind reuse/gap map and runtime producer correlation table; no unreviewed runtime edits. | NEXT-02; AR-A13–19 |
| AR3-A02 | Concrete actor/hold/workflow/activation records; one canonical owner per datum; current runtime snapshots cannot authorize effects. | R1/R2/R4; AR-A01–04/20–28 |
| AR3-A03 | Full mailbox role/input/correlation/idempotency, byte/count/zero/overflow/expiry/fairness and replay-retention rules with pure validators. | R5; D08/D10–D13; AR-A32 |
| AR3-A04 | Vertical issuer/state/operation table includes producing-supervisor settlement, reviewer-bound receipts, stale/conflicting inputs and explicit uncertainty. | R2/R3/R4; AR-A03–04/20–24 |
| AR3-A05 | Lifetime + per-step budgets survive resume/restart; supervisor/implementer usage deduplicated; accounting unknowns and user-authorized amendments preserved. | R5/R6; D08/D10–D11/G15; AR-A30–31 |
| AR3-A06 | D1–D6 closed; Config V3/State V2/wire V2 validators and exhaustive reader/writer/version matrix match, with legacy projection and incompatible-peer behavior. | NEXT-01/03/04; AR-A33–35 |
| AR3-A07 | Each crash row has retained state, resolver principal and permitted next operation; migration preserves original bytes/obligations and does not manufacture identity. | R4; H01–H03; AR-A16–19/25–28/33–35 |
| AR3-A08 | AR-04 source map names every effect/mutation owner, revision recheck, publication/retention step and held-state consumer; no runtime integration yet. | NEXT-03/04; R2/R3/R4 |
| AR3-A09 | Mechanically confirm planned exports/types and dependency direction; active constants, tools/commands/default config/example/manifest unchanged; all 106 original rows retained. | NEXT-01/02/06; A01–A07 |
| AR3-A10 | Independent source review plus syntax/whitespace, full compiler and package-content inspection; exact failures/limitations reported, no suppressed/excluded source or tests/artifacts. | NEXT-05/06; no runtime criterion certified |

### Permitted checks and stop conditions

Use source walkthrough and existing static commands: `node --check` on changed/all production JS as appropriate; `git diff --check`; `npm run typecheck -- --pretty false`; `npm run pack:check` (dry-run only). No compiler-negative fixtures, test scripts, simulation/native/live probe runners or configured verification runs. Do not install dependencies without separate authorization.

Mechanically inspect exports, imports, literals, registrations and reader/writer coverage with bounded read-only checks. If the pinned compiler is unavailable, report that failure; the documented full-source supplemental recipe may locate diagnostics but cannot pass the pinned gate. New pure modules and touched contract/kernel modules must have no new attributable diagnostics; the pre-existing full-source failure remains a blocker, not an implicit exception or exclusion. Packaging and syntax do not prove behavior.

Stop/reconcile if concurrent source drift invalidates the interface map, a new concrete AR-02 blocker appears, a required effect/provenance seam has no supported producer, a freeze choice remains ambiguous, or implementation would require activating a format/runtime early. Keep unsupported paths explicitly held; do not weaken guards to complete the checklist.

## 9. Planning-turn evidence

- Source and governing scope reviewed; proposed config cross-checked without installing it. Runtime code, active formats and upstream sources are outside this planning edit.
- Original requirement section baseline SHA-256: `145692f8e567158f864e4d2d2af5b76757150998fd28d15bf1886acd4a209d79`; 106 unique IDs. Original rows and historical qualification status must remain unchanged.
- **Jev planning review:** foreground run `227a620a-8409-481a-994f-aeeb2bd59361`, terminal `completed`, one evaluation/one tool call, 6,108 input + 180 output tokens. One live TypeSafe judgment over task-relevant evidence and bounded plan excerpts; no repository effects, browser/model-worker probes or live session data. Limits: 60 seconds, one evaluation, one tool call, 12,000 reported tokens.
- Jev selected `ALIGNED` (0.99 confidence) and `RECONCILE_AND_FREEZE_INTERFACES`; planning handoff score 2.69 on a 0–3 rubric. Advisory premature-activation/qualification-overclaim judgments were 0.10/0.08. These are not calibrated safety probabilities, source verification or permission to act; incomplete excerpt coverage and runtime qualification remain explicit limitations. Main authored and checked the plan.
- **Final planning checks passed:** whitespace (`git diff --check`); 12 local links/anchors; all 21 protected production/config/tooling files match the captured digest; the 106 original requirement rows match their section digest; all 27 existing event names, ten AR3 acceptance rows and six D1–D6 decisions are present. Package dry-run lists 37 files including this runbook and the existing runtime, with no bundled dependencies or tarball created.
- No source edits, compiler rerun, tests, fixtures, reusable check scripts, workers, installs or session-data changes in this documentation-only planning turn. Compiler numbers in §2 are the preceding current-source assessment, not a new successful gate. Planning acceptance does not mark AR3-A01–10 or original runtime rows implemented/passed.

**Current slice:** [AR3-01 decisions and verification](AR3-01-DECISIONS.md#9-slice-acceptance-and-remaining-boundary). Next, AR3-02 implements the pure leaves using the reviewed signatures. Do not redo the kernel or wire ActorHost. Finish AR3-05 before handing executable integration to AR-04.

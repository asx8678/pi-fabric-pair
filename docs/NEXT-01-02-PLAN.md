# NEXT-01 + NEXT-02 — Joint implementation plan

**Status:** implementation in progress. The first source slice adds concrete leaf/report/authority/latch and public payload returns, checked primitive narrowing, and a bounded pure single-assignment kernel. Broader aggregates and the complete transition model are not yet complete. This is the detailed runbook for [implementation plan §13.2–13.3](IMPLEMENTATION-PLAN.md#13-active-implementation-plan-after-test-removal), within [the current V1 scope](SCOPE-OF-WORK.md#10-current-scope-after-test-removal).

**Goal:** co-design concrete validated coordination records and a pure transition model, so migration and durable runtime integration can follow without inventing identities, losing reviews or treating uncertainty as success.

**Owner boundary:** no tests, fixtures, test/probe runners, fault simulators or test artifacts. Use source review and static checking only. Keep executable ESM JavaScript/JSDoc; no TypeScript-source rewrite, worker launch, provider call, commit, push or upstream edit. Paths below are package-relative. Proposed symbols/files are not existing registrations.

## 1. Deliverable and rollout boundaries

### Included now

- Inventory each record's producer, validator, consumer and persistence/wire ownership.
- Concrete JSDoc types and runtime validators for every consumed state/policy/identity/report/decision/usage/observation/delivery/counter field.
- A truthful held-legacy model and a state-V2 layout specification, without activating migration or changing live formats.
- A small pure `src/transitions.js` with typed events, immutable decisions and explicit rejection/hold/duplicate outcomes.
- A frozen compatibility decision, production integration map and static-check handoff to NEXT-03/04.
- Compatible existing validator call sites may gain annotations and stronger validation; any newly rejected formerly accepted shape must be documented, not disguised as typing cleanup.

### Deferred to the owning batches

- **NEXT-03:** backup/migration I/O, held-state status/inspect/cancellation UI, active state-V2 readers/writers and legacy disposition.
- **NEXT-04:** grant preparation/commit storage, authority publication, report retention/reconciliation, rollback and actual Controller/Worker transition wiring.
- **NEXT-05:** the remaining all-production annotation backlog; these joint batches must not conceal its diagnostics.
- **NEXT-06:** static CI/package integration. **IMP-05–08:** complete command lifecycle, effect admission/settlement and evidence enforcement.
- No queues, automatic repair/recovery, final-review opt-out, new public command/tool or capability widening is enabled here.

**Completion distinction:** a typed contract/transition module may be marked *source-reviewed/model-ready*. It is not a runtime state-machine completion while production paths still mutate state independently. NEXT-01/02 remain integration-pending until NEXT-03/04 consume the model; no original behavioral gate is closed by compilation.

## 2. Current source anchors

| Concern | Existing producers/readers | Current gap to address in the model |
|---|---|---|
| State/task/worker records | `controller.js:init/persist/dispatchUnlocked`, `contracts.js:validateStoredState/validateStoredTask/validateWorkerRecord` | Generic `JSONObject` returns, partly opaque nested fields, current/legacy V1 shapes mixed together. |
| Policy/limits/steps | `config.js:DEFAULTS/validateConfig`, `schema.js:stepSchema/validateDispatch`, `contracts.js:validateTaskPolicy/validateTaskLimits` | Concrete current versus known-legacy shapes and validated stored-plan uniqueness are needed. |
| Migration | `contracts.js:migrateStoredState`, `controller.js:init` | Missing legacy attempt identity is generated today; startup can clear pending reports. Model held legacy work instead; actual migration replacement remains NEXT-03. |
| Grant/authority/latch | `controller.js:writeAuthority/activate`, `worker.js:load`, `contracts.js:validateAuthority/validateLatch` | Phase strings lack durable grant/hold/commit semantics; current wire is V1. |
| Reports/evidence | `worker.js:pair_report`, `controller.js:acceptReport/finalizeReport`, `evidence.js:checkpoint`, report validators | Current versus historical identity and evidence provenance must remain separate; typing must preserve payload hashes. |
| Decisions/notices | `controller.js:decideUnlocked/deliverNotice/inbox`, decision and notice validators | Callback completion currently becomes `delivered`; it is not proof that Main observed the notice. |
| Usage/observations | `metrics.js:normalizedUsage/addUsage`, `main.js:modelObservation`, `worker.js:telemetry`, `controller.js:scan` | Missing token observations can become zero today; incomplete accounting must remain distinguishable from known zero. |
| Lifecycle | `controller.js:pauseUnlocked/interrupt/resume/stopUnlocked/cancelUnlocked` | Mutations are scattered; resume replaces policy/limits and resets time/counters. Model correct rules now, integrate them later. |

Do not rewrite these paths merely to match a draft diagram. Preserve actual persisted field names, optional-field presence and current public schemas until their versioned rollout is ready.

## 3. Shared design decisions

### 3.1 Versions and compatibility

| Surface | During NEXT-01/02 | Later rollout rule |
|---|---|---|
| Package/product | Package `0.1.0`, product V1 | No release bump or product V2/V3 scope. |
| Configuration | `CONFIG_VERSION = 2` | No new config fields or consent changes. |
| Persisted state | Keep active `STATE_VERSION = 1` | Specify V2, but activate only with complete NEXT-03/04 producers/consumers. |
| Pair wire | Keep active `WIRE_VERSION = 1` | Mandatory committed-grant proof is an incompatible requirement: record the exact field/handshake change and coordinated wire-version decision before rollout. No old worker may silently ignore it. |
| Draft coordination model | Internal, explicitly non-authorizing | It is not a second persisted source of truth and is never accepted merely because an incoming JSON object resembles it. |

Classify the three documented V1 families using global identity layout and per-task policy-layout facts: pre-identity, identity-bearing pre-deferred-policy, and current identity-bearing. Mixed identity presence or partial deferred fields within one task are corruption, not defaults; independently complete legacy/current task snapshots may coexist and must retain per-task classification. Policy aliases are a separate compatibility axis. Unsupported combinations remain explicit; an empty task set proves no policy era. Classification must not mutate input, assign IDs, reset spending or write files. Keep the existing active migration until its complete replacement is ready; do not partially change its storage behavior here. See the [detailed decision table](STORED-RECORDS-PLAN.md#5-legacy-classification-decision-table).

For future state V2, specify a discriminated `current` versus `legacy-held` task record. The latter retains history/report references, unknown identity/accounting and reconciliation reasons, and cannot supply an execution grant. Resolved historical reports retain their original producer tuple; only current unresolved obligations must match the active task/attempt.

### 3.2 Record families and ownership

Keep shared aggregate/historical types and classification in `src/contracts.js`. The [stored-record batch plan](STORED-RECORDS-PLAN.md#4-planned-types-apis-and-dependency-direction) permits one small pure `src/observations.js` numeric-validation leaf for disjoint implementation; contracts may import it, never the reverse. These are planned changes. `transitions.js` may import types/validators from contracts or the internal coordination layer. Contracts must not import coordination, the transition engine, controller, worker or filesystem utilities; avoid a circular graph and a generic workflow framework.

| Family | Required shape/relationship decisions |
|---|---|
| Identity | Reuse canonical workspace/repository binding, owner session/epoch, worker/native-session generation, task/plan, authorized step or final-only plan scope, attempt and lease. Keep nonce/session checks from current envelopes. Missing identity is explicit, never a plausible substitute ID. |
| Policy and plan | Snapshot supervision/limits/verification at assignment; unique step IDs and valid indices; current versus known-legacy optional fields. Keep current final-review-required behavior and aliases unchanged. |
| Task/worker state | Separate task progress, runtime observation and unresolved obligation. Terminal task intent does not imply all effects have settled or the worker can accept another assignment. |
| Grant/holds | Distinguish no grant, prepared, committed, open and permanently closed. Define task-bound grant operation identity for NEXT-04. Holds include disabled, deliberately stopped, paused, stale owner, legacy reconciliation, budget exhaustion and uncertain effect/delivery. Multiple holds may coexist. |
| Report/checkpoint | Separate worker claims from controller-produced immutable checkpoint facts. Bind task/worker/step/current attempt when authorizing; validate hash/provenance and preserve legitimate history. |
| Decision/request | Action-discriminated answer/approve/revise/cancel records, request/decision idempotency and exact target references. Same ID plus conflicting content is rejection, not a retry. |
| Worker delivery | Prepared → sent → accepted → started → settled, with explicit uncertainty. Evidence for one stage must not imply the next. Preserve operation identity across reconciliation. |
| Main notice | Queued → notified → observed → resolved, with uncertainty. Old `delivered` can map at most to notified unless a supported observation exists. A void callback is not Main observation. |
| Usage/observations | Validate finite nonnegative observations and safe cumulative counters; preserve `null`/unknown distinctly from known zero. Do not infer complete spending from a partial reported-cost subtotal or missing observations. Existing aggregates with no completeness provenance must not be upgraded to fully known accounting merely because their stored numbers are nonnegative. |
| Future occupancy/counters | Specify queued versus active occupancy, required-review reservation and report/revision/automatic-attempt identities/counters. No queue admission/pump or limit consumer is implemented now. Unknown historical counters remain held/unknown. |

Use a field-ownership map: one authoritative owner for each persisted field; a transition snapshot is an immutable view of those validated records, not an independently evolving copy. Plan creation may initialize demonstrably new counters to zero; legacy absence cannot.

### 3.3 Parsing and hashing rules

- Treat decoded JSON as `unknown`. A loose `JSONObject` is acceptable only inside validation/classification, not as the final consumed record type.
- Use checked assertion/narrowing routines or explicit typed construction after full validation. No blanket `as`, broad `any`, or inferred trust from a matching version number.
- Validate finite numbers, bounds, discriminants, required/unknown keys, duplicate IDs, references and lifecycle relationships. Separate a shape error from a legal shape that still cannot authorize work.
- Do not normalize/reorder a report payload before comparing its existing `JSON.stringify`-based hash. Retain optional-field presence and accepted serialization order, or explicitly preserve the original hashed payload after validation. This is a typed rewrite, not a hash-format migration.
- Document genuine compatibility tightening before changing an existing parser. Do not silently rewrite older saved policy/usage/delivery records into the draft model.
- Unknown observation is neither corrupt-present data nor success. Do not change `metrics.js` null/zero semantics piecemeal while current consumers still assume the old totals; define the adapter and rollout with NEXT-03/04.

## 4. Proposed internal module surface

These are proposed module exports/types, **not Pi tools or commands**. Preserve existing exported validator names and argument contracts while replacing their generic return types. `validateStoredState`, `validateAuthority`, report/latch/policy/limit validators and `incrementCounter` continue to serve current-format callers.

| Proposed internal symbol | Contract |
|---|---|
| `classifyStoredState(value)` | Pure classification of documented current/legacy layouts with validated metadata and explicit reasons; no migration, fabricated identity or I/O. Any retained raw legacy content remains non-authorizing. |
| `validateUsageObservation(value)` / `validateUsageTotals(value)` | Concrete nullable V1 observation/totals validation in the planned observation leaf. Preserve stored values; do not add provenance/completeness fields or treat existing aggregates as complete spending. |
| `validateCoordinationModel(value)` | Validate the draft internal model and its cross-record invariants. It does not replace the active V1 disk parser or prove a durable commit. |
| `validateTransitionEvent(value)` | Validate the event union and required identity/data fields. It cannot authenticate the claimed issuer; provenance must come from trusted producer code. |
| `reduceCoordination(snapshot, event)` | Pure immutable decision in `src/transitions.js`, returning `TransitionResult`; no RPC, clocks, random IDs, files, model calls or callbacks. |

Define `CoordinationModel`, `TransitionEvent`, `TransitionResult`, `HoldReason`, grant/delivery unions and current/legacy record types explicitly. Name leaf helpers consistently with existing validators; do not expose every private parser as a public API.

`TransitionResult` has four distinct outcomes: `apply` with a next model and bounded disposition; `noop` for a witnessed identical duplicate/stale inert event; `reject` with a reason code; or `hold` with preserved obligations and reconciliation reasons. Every outcome is **non-executable**. An `apply` result or prepared grant is not permission to send a prompt: the caller must satisfy the durable admission protocol in NEXT-04. No embedded commands, closures or generic effect executor are added.

Inputs supply any timestamp, elapsed interval, candidate new live identity or supported observation explicitly. The reducer never calls `Date.now()`/`uid()` or guesses unknown crash duration. It must not mutate input records, their nested arrays/maps or retained report/history objects.

## 5. Transition specification and producer map

This table is a prose implementation specification, not an executable test matrix.

| Event family | Required model result | Trusted producer / later consumer |
|---|---|---|
| Dispatch requested | Reject disabled/stopped/held/conflicting assignment; identical request is idempotent. Otherwise prepare, never directly open, a new grant. | `dispatchUnlocked`, validated config/work order; NEXT-03/04. |
| Grant commit / authority publication observed | Advance prepared → committed → open only from matching trusted storage/publication observations for the same operation and identity, with no admission hold. A delayed publication observation cannot reopen a closed lease. It does not prove that work started or settled. | Future NEXT-04 storage protocol and Worker verification; never a model-supplied commit assertion. |
| Stop / disable / pause | Close admission in the model; preserve pending review/question and spending. Record independent hold reasons. Physical shutdown/settlement is not assumed. | Main lifecycle/settings → controller, then NEXT-04/IMP-05. |
| Enable / start | Clear only the matching disabled/deliberate-stop hold when explicitly authorized. No task lease or automatic resume is granted. | Trusted user command path; public commands remain unchanged in this batch. |
| Resume | Restore an outstanding question/review/blocker wait without a prompt. Unknown/stale/exhausted state stays held. Any permitted work continuation needs a new grant, never reopening the old closed lease. | `resume`; preserve assignment policy/cumulative counters, later IMP-05 integration. |
| Owner/process replaced | Invalidate old admission and retain unresolved obligations; keep uncertainty about admitted work. Stale events cannot change current task state. | `init`, `startUnlocked`, branch/rebind path; NEXT-03/04 and IMP-07. |
| Report received | Check exact current identity and hash, close the lease, retain the obligation and wait for settlement/evidence. Same report/content does not spend again; conflict rejects. A latch alone does not prove delivery. | `pair_report`, `acceptReport`, wire validators. |
| Settlement / checkpoint observed | Advance to question/blocked/review only from supported settlement and required validated evidence facts. Idle/RPC acknowledgement is insufficient. Unknown facts retain a hold. | `scan`, `finalizeReport`; actual effect/evidence guarantees remain IMP-06/08. |
| Answer / approve / revise | Bind to the unresolved report and current identity. Approval needs inspected/current checkpoint and required verification facts from Controller, not worker claims. Advance once; `stepComplete:false` retains the step; final approval terminates the task. Prepare any continuation separately. | `decideUnlocked`; post-readiness revalidation remains required. |
| Cancel / reset | Preserve history, close admission and retain unresolved physical-effect uncertainty. Reset cannot erase an active obligation or manufacture a fresh safe session. | `cancelUnlocked`, `reset`; later durable integration. |
| Storage/RPC failure or timeout | Preserve original failure and operation identity; close/hold admission; no success inference, blind prompt replay or counter refund. | `activationFailed`, RPC/storage handlers; NEXT-04. |
| Notice/delivery observation | Advance only the witnessed stage. A late acknowledgement may refine delivery facts but cannot reopen a closed grant; lost/notified is not observed/resolved. | `deliverNotice`, `inbox`, supported Main observation. |
| Usage / counter observation | Accept only identity-bound observations with checked finite values and safe increments. Identifiable repeats do not spend twice; conflicting values reject. Missing identity/completeness or an unknown crash interval stays uncertain, not zero or a guessed increment. | `scan`, usage/telemetry producers and future active-time accounting; do not invent upstream observation guarantees. |
| Budget / policy amendment | Exhaustion adds a hold. An explicit authorized amendment is separate from resume; unknown accounting cannot become zero and unrelated holds remain. | Typed config/user boundary; no new amendment API now. |

**Issuer rule:** tool/report payloads cannot self-declare human authority, committed storage, inspected evidence or effect settlement. Event producers must obtain those facts from the corresponding trusted local boundary. Until a public observation surface exists, use unavailable/uncertain, not a fabricated successful event.

**Closure and ordering rule:** stale events are inert, conflicting duplicate identities reject, and closed grants are absorbing. Delivery bookkeeping may still advance after closure without granting execution. Cancellation/completion cannot release the single-writer slot while admitted effects remain unknown. A pending review obligation cannot disappear because a notice was retried, a worker restarted or a task was paused.

## 6. Joint execution slices

These J01–J06 labels are substeps of NEXT-01/02, not new roadmap phases.

| Slice | Implementation work | Primary files | Exit before next slice |
|---|---|---|---|
| J01 — Inventory and draft decisions | Enumerate actual fields, current/legacy versions, producer trust, nullable observations and map/reference ownership; draft the model/transition vocabulary together. | Contracts/schema/config/metrics and Controller/Worker source review; this document/architecture. | Every consumed family has an owner; undecidable legacy values are explicitly held/unknown; no current version bump. |
| J02 — Concrete leaf types | First make primitive assertions, numeric bounds, literal/enum narrowing and collection helpers preserve precise types. Then add identity, policy/limits/steps, usage/observations, report/checkpoint/decision and hold/delivery/counter types with checked leaf validators. | `src/contracts.js`; minimal annotations in config/schema/metrics. | Concrete returns; no unchecked casts; hash/optional-field compatibility retained; known current-versus-legacy differences documented. |
| J03 — Aggregate contracts | Compose typed task/worker/state/authority/latch/request/notice contracts and draft-model invariants; add pure legacy classification without wiring a new migration. Trace existing validator callers. | `src/contracts.js`, necessary compatible caller/schema annotations. | Unknown JSON is validated before consumption; current active formats/signatures remain intact; incompatible rollout is explicitly deferred. |
| J04 — Pure transition model | Implement `src/transitions.js` and event/result unions alongside J03. Use exhaustive event handling, immutable updates and explicit deny/hold/noop outcomes. | Proposed `src/transitions.js`, shared contract types; architecture state table. | Every event family has a stated result/issuer; no I/O, random identity, hidden reset or source of new execution authority. |
| J05 — Freeze and handoff | Reconcile model fields with the reducer and real consumers; freeze the V2 layout, held-state representation and later wire decision. List exact guards/writes/events to replace in NEXT-03/04. | This document, architecture, implementation plan/ledger; no active migration switch. | One agreed reader/writer/transition map; every unmigrated mutation and unsupported observation is named; no claim that an unused reducer enforces runtime safety. |
| J06 — Static review checkpoint | Inspect changed source and module/public-schema registrations; run syntax checks and full production compiler; record remaining diagnostics and source-reviewed invariants. | Changed production modules, docs/ledger. | Model-ready status with explicit integration gaps; original behavior gates remain unverified. |

**Order:** J01 → J02 → J03 + J04 co-development → J05 → J06. Integrate shared `contracts.js` edits sequentially. Review each record together with the transitions that consume it; do not design all types first and discover incompatible lifecycle semantics later. The first production edit after this plan should be J02's leaf contracts, following J01's field/decision inventory—not a state-version bump or controller rewrite.

## 7. Static completion criteria and restrictions

When production implementation starts, use existing development dependencies. If installation is required, use the pinned lockfile with `npm ci --ignore-scripts`. For changed files, use `node --check <file>`. After meaningful contract/transition changes, run `npm run typecheck -- --pretty false` and inspect both source and dependency diagnostics. Use `git diff --check` for patch integrity. Run `pack:check` only when packaging changes warrant it.

- No new tests, examples masquerading as test fixtures, compiler-negative cases, behavioral probes, mock hosts or test runners. No worker/process exercise or user-configured verification execution.
- No compiler exclusions, weaker strictness, `@ts-nocheck`, broad `any` or unchecked parser casts. Keep every production module included by `tsconfig.json`.
- The last recorded full check had 620 source diagnostics, not 620 independent defects. Record actual new totals after implementation; do not claim a green project from a partial/isolated check. Resolve diagnostics in the introduced contract/transition surface; remaining cross-module work must be explicitly assigned to NEXT-05.
- A count reduction is not proof of correct migration, grant ordering or native behavior. This joint checkpoint does not require finishing unrelated NEXT-05 typing, but cannot hide a failed full compiler result.
- New internal exports must match this document or the document must be updated. Existing Pi tools/commands, public schemas, config defaults and active version constants must not change inadvertently.
- Verify the dependency direction and every proposed consumer by source inspection. A function that is merely defined/exported is not an operational guard.

## 8. Joint implementation ledger

Statuses distinguish the current source slice from outstanding implementation. No behavioral certification is claimed; the original test deletions remain intact. Three Astra xhigh assignments completed: schema typing, isolated coordination/transitions implementation and read-only contract review. Parent reviewed the combined source, fixed the two witnessed validator gaps and checked the final compiler result.

| ID | Concrete check | Status / evidence required |
|---|---|---|
| J01 | Field/producer/consumer/version inventory and compatibility decisions recorded. | In progress: active leaf/report/authority producers traced; state/wire remain V1 and config V2. Model compatibility freeze still pending. |
| J02 | Concrete leaf record types/validators preserve hashes, identities, policy and nullable observations. | Partial: concrete leaf/report/authority/latch plus dispatch/decision returns; original public input objects and serialization retained. Sparse slots and inherited declared fields reject. Production usage/observation records remain open. Contracts/schema have zero compiler diagnostics. |
| J03 | Aggregate current/legacy contracts enforce consumed-field/reference invariants without activating V2. | Planned: detailed [stored-record/classification runbook](STORED-RECORDS-PLAN.md) now defines SR-01–06, source-backed legacy profiles, ownership and static acceptance. No production implementation in that planning pass. |
| J04 | Pure transition event union covers closure, holds, waits, duplicates, delivery and uncertainty. | Partial: 11 event variants in the bounded single-assignment kernel, source-reviewed with zero module diagnostics. Unsupported families explicitly hold; complete transition coverage and model freeze remain open. No Controller/Worker wiring. |
| J05 | Frozen model and integration handoff identify every unconverted Controller/Worker path. | Partial handoff in §9: dependency direction and absent runtime consumers inspected. Trusted producers, complete aggregates, history retention and durable protocols remain open; layout is not frozen. |
| J06 | Static results and remaining risks are recorded without recreating tests or claiming release qualification. | Current slice recorded in §9: syntax and whitespace checks pass; full compiler exits 2 with 538 source/0 dependency diagnostics. Four core contract/schema/model modules have zero diagnostics. No tests written or release gate claimed. |

**Handoff to NEXT-03/04:** version/layout decision; concrete types/validators; transition module; required event provenance; every persisted/authority/latch/notice reader and writer; preserved legacy-byte/history/obligation requirements; and a list of runtime mutations not yet replaced. No active state/wire format changes until that integrated rollout is ready. The original 106 requirement rows and FND gates remain unchanged and unverified where behavioral evidence is absent.

## 9. Current implementation checkpoint

### Delivered source and exact boundary

- `src/contracts.js`: concrete checked leaf/report/checkpoint/authority/latch returns; current versus legacy policy/limit overloads; declared inherited fields and sparse array slots rejected without copying valid public records. `validateStoredTask`, `validateWorkerRecord`, `validateStoredState` and legacy classification still need aggregate work.
- `src/schema.js`: concrete `DispatchPayload`, approval-discriminated `DecisionPayload` and shared `ReportPayload`; all ten runtime exports and serialized schema construction remain unchanged. Required/optional/nested fields and all array slots are checked.
- `src/util.js`: assertion and safe-ID narrowing annotations, with no runtime-body change in this slice.
- `src/coordination.js` (319 lines): `validateCoordinationModel`, `validateTransitionEvent`, concrete internal task/fence/grant/hold/spending/delivery/failure records. Internal records may be reconstructed for comparison; public report/policy payloads retain their original representation. This is not a storage migration, authentication layer or persisted second source of truth.
- `src/transitions.js` (191 lines): `reduceCoordination`, a pure single-assignment/attempt kernel. All outcomes carry `nonAuthorizing: true`; no output is an executable effect. Only this module imports the coordination module; Controller/Worker/Main have no imports or consumers of either new module.

| Delivered event family | Implemented semantics |
|---|---|
| `prepare-grant`, `grant-committed`, `authority-published` | Distinct prepared/committed/open observations; exact operation/fence checks; closed lease cannot reopen. Source tags do not prove durable commit or trusted publication. |
| `lifecycle`, `owner-replaced` | Independent stop/disabled/pause holds; cancellation keeps occupancy and obligations; generation replacement fences the original assignment. Enable/start never produce a new grant; resume can restore an existing wait only. |
| `report`, `worker-delivery`, `main-delivery`, `runtime`, `failure` | Hash/identity-bound pending report retention, explicit duplicate/conflict outcomes, sequenced observations and sticky uncertainty. Worker progresses only through supplied sent/accepted/started/settled witnesses; Main stops at observed. ACK/idle do not settle effects. |
| `unsupported` | Dispatch creation, continuation/new leases, checkpoints, decisions, notice resolution, reset, accounting/counter updates, policy amendments and reconciliation explicitly close/hold rather than approximate success. |

Policy, spending snapshots and history references are retained, not updated or treated as live accounting. Legacy unknowns remain unknown and held. No task replacement, obligation resolution, slot release, queue pump or runtime limit enforcement is implemented. Trusted event provenance, separate live accounting/clocks, durable commit/publication/settlement and storage-backed original-byte/history retention remain integration work.

### Evidence and remaining work

- Syntax checks passed for contracts, schema, util and both new model modules; `git diff --check` passed. Structural review reported advisory complexity in the aggregate validator/reducer and an unrelated historical computed-import coverage gap; it does not certify correctness.
- Final `npm run typecheck -- --pretty false`: **exit 2, 538 Pair-source diagnostics, zero dependency diagnostics**, down from the 620 baseline. Contracts, schema, coordination and transitions each have zero diagnostics. Remaining: controller 134, Main 126, Worker 89, evidence 48, UI 33, util 30, native 29, RPC 23, metrics 17, config 9.
- Two no-file direct invocations were recorded: shipped policy/limit defaults return the same objects with unchanged serialization; missing reducer input returns `reject / invalid-input / nonAuthorizing: true`. These are narrow observations, not transition coverage or behavioral certification. No fixture, test/probe runner or artifact was written; no workers or configured verification were launched.
- Package remains `0.1.0`, config V2, state V1 and wire V1. No new Pi tools/commands, schema fields, dependencies, configuration entries, suppressions or source exclusions were introduced by this slice.
- NEXT-01/02 remain **in progress**, not model-ready or complete. Immediate next batch: [stored records and legacy classification](STORED-RECORDS-PLAN.md), scoped to contracts and pure classification only. After that, complete the unsupported event families and freeze the reader/writer compatibility map. NEXT-03/04 must then integrate migration and durable runtime consumers together; NEXT-05/06 and the original qualification gates remain open.

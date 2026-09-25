# AR3-01 — Runtime/model reconciliation and shared decisions

**Status: AR3-01 design/interface slice complete at its source/documentation boundary.** Decisions are selected, independently reviewed and mechanically checked as recorded in §9. It does not implement AR3-02 validators, complete the AR-03 format freeze, change active versions or authorize runtime integration.

Runbook: [AR-03 contract-freeze plan](AR-03-CONTRACT-FREEZE-PLAN.md). Governing [scope](SCOPE-OF-WORK.md#10-current-scope-after-test-removal) and [testing policy](TESTING.md) remain unchanged. All module signatures below are proposed next-slice interfaces, not shipped APIs. No production source changes in this slice.

## 1. Reconciled baseline and source findings

All 21 protected source/config/tooling files match the planning snapshot: SHA-256 `deba92ae02fec0045b1aafbdee69cd9ea73f5cca5b507c4fdb0197a475a25f42` under the runbook's sorted path/NUL/bytes/NUL algorithm. HEAD remains `078820d2c94057dfa9a808054a2890559e494f96`; previous uncommitted work is preserved. The reported concurrent edits are included in this baseline, not overwritten. No new concrete AR-02 regression was established by this bounded interface trace; that is not a complete runtime audit.

| Source witness | Observed contract and consequence |
|---|---|
| `PairController.reserveStart/startReserved`, `activate` | Reserves V1 generation/session pathname before construction. Grants persist before authority publication; slow readiness is outside the root serial, followed by identity rechecks. Future Host retains this ordering; it adds durable operation/proof, not another lifecycle owner. |
| `PiRuntime.reserveActivation/activate/revoke` | Local token is task/attempt/lease/generation plus serial. Revoke clears `#activation`; events have no native prompt correlation. Host attribution cannot be reconstructed from the latest snapshot after revoke. |
| `PiRpc.send` | Allocates `randomUUID()` internally and returns command data, not the actual request ID/write receipt. Passing an `id` in `fields` cannot establish a host-owned durable command ID. A new future internal seam is required; no adapter pretending it already exists. |
| `PiRuntime.RuntimeObservation`, `#enqueue`, `takeObservations`; Controller `consumeObservations` | Bounded native summaries have type/time and selected payload, not durable observation IDs/activation binding. Current consumption uses the current task. Durable per-activation accounting needs a new future bound observation envelope; source tags/timestamps are not sufficient. |
| Controller `acceptReport/finalizeReport` | Report may precede ACK; pending envelope is retained and authority revoked. Idle and before/after batch captures gate current verification. These are not the kernel's admitted-effect barrier or per-command verification bindings. Duplicate report early-return does not compare original payloads; future ingress must. |
| Kernel `decisionReady` (`coordination.js`) | Explicitly requires `reviewer.role === 'main'`; `decide.source` accepts only `main-decision`. Supervisor review cannot be activated by relabeling it as Main. This is a specific bounded extension requirement. |
| Kernel `approvalReady` / `evidence-receipt` | Reader binding includes role/owner/generation/session/model, but no reviewer activation ID. Add exact reviewer-activation linkage for actor review; do not weaken legacy receipt checks. |
| Kernel `usage-observed` | Rejects non-implementer participants as held; implementer attribution requires one committed prompt delivery and identified activation. A supervisor accounting producer is missing, not implicitly supported by the `ActorBinding` role union. |
| Kernel `validateCoordinationModel`, `reduceCoordination` | Canonical genesis/events and independently checked derived projections; non-authorizing. Reuse as the sole implementation-grant/obligation reducer. |
| Controller `resume`; `contracts.js:classifyStoredState` | Resume resets policy/limits/turn/time; classifier retains a borrowed decoded object and unchecked binding. Neither meets lifetime-budget or exact-byte migration requirements. Fix integration later; do not change them in AR3-01. |
| Main `promptUser`, native `checkReadiness`, Worker `pair_report` | Current generation/dialog and exact readback gates stay. Worker latch-before-inbox remains a delivery-reconciliation window. Main is the human permission broker; denied worker editor remains denied. |
| Controller `close` | Revokes/aborts, contains all owned handles, joins outside-serial scan/verification, drains persistence, and retains ownership if exit is unconfirmed. Preserve this boundary during Host conversion. |

### Call-path handoff

`Main dispatch → Controller reservation → PiRuntime local token/readiness → durable V1 state → authority → PiRuntime load/readback → PiRpc write/ACK → Worker report/latch/inbox → Controller retained report/revocation → native settlement/idle → evidence/verification → notice → exact decision → fresh continuation`.

AR-04 must insert durable command/activation/observation identities and effect/verification witnesses at their actual producing boundaries. It must not fill them in from a later mutable task or infer them from successful ACK/idle. Same-session branch ownership and cross-Main workspace reservations remain separate integration requirements. All slow completions recheck owner, branch, actor generation, workflow revision and original operation before commit; uncorrelated late facts are retained as uncertainty, not silently charged or discarded.

## 2. Individual 27-kind disposition

“Reuse” preserves the existing implementation-kernel semantics. Actor envelope metadata may add correlation but cannot relax them. “Bounded extension” is explicitly assigned to AR3-03, not implemented here. “Not involved” retains an existing family without enabling its runtime effect. No replacement implementation-grant reducer is introduced.

| Existing kind | Disposition | Exact mapping / missing boundary |
|---|---|---|
| `dispatch-requested` | Reuse | Commit bounded implementer assignment after the host validates a settled supervisor plan; workflow submission itself is an actor-domain intent. |
| `intent-committed` | Reuse | Storage witness for the same immutable operation/hash; no pretend multi-file commit. |
| `prepare-grant` | Reuse | Implementation grant only; actor model additionally checks workflow accounting/holds before preparing it. |
| `grant-committed` | Reuse | Names the committed implementation grant; host owns actual commit proof. |
| `authority-published` | Reuse | Observed publication of that grant, not implied by a write attempt. |
| `dispatch-prepared` | Reuse | Exact host command ID/input hash after durable reservation; future RPC ID seam required. |
| `effects-reconciled` | Reuse | Complete bound admitted-effect coverage, not `agent_settled`/idle/current-tool scalar. |
| `checkpoint-finalized` | Reuse | Original report, effect barrier and per-command source/verification bindings. |
| `evidence-receipt` | Bounded extension | Preserve legacy Main receipt; actor receipt additionally binds the exact supervisor activation/workflow revision and delivered reply. |
| `checkpoint-current` | Reuse | Source revalidation under workspace reservation for the exact decision/continuation operation. |
| `decide` | Bounded extension | Preserve `main-decision`/Main branch. Add explicit supervisor-control branch with settled producing activation, immutable intent/hash and activation-bound inspection receipts; never impersonate Main. |
| `notice-resolved` | Reuse | Resolve only the bound immutable decision; notification and resolution remain independent. |
| `worker-delivery` | Reuse | Independent write/ACK/run/report/barrier facts for an implementer prompt; no fabricated send/ACK order. |
| `main-delivery` | Reuse | Published/notified/observed are distinct; Main's void APIs do not acknowledge model consumption. |
| `usage-observed` | Reuse | Implementer attribution stays strict. Supervisor usage goes through actor-domain activation/accounting records, never fake implementer delivery. |
| `counter-observed` | Reuse | Identified implementer turns/monotonic intervals. Supervisor intervals have their own actor attribution; no cross-generation clock subtraction. |
| `budget-evaluated` | Reuse | Preserve checked task/accounting/budget revision. Actor model adds workflow-total/gap admission, not a replacement task ledger. |
| `amendment-proposed` | Reuse | Existing explicit human-authorized whitelist and expected revision; workflow-level amendments must bind the corresponding policy scope. |
| `automatic-action-prepared` | Not involved | Remains modeled/held as appropriate; no automatic repair/recovery launch in this batch. Preserve configured allowances without enabling them. |
| `reconciliation-proposed` | Reuse | Explicit trusted findings, evidence and old identities; no automatic adoption. Add actor-domain reconciliation where no implementation task exists. |
| `reset-requested` | Reuse | Archive/containment/obligation prerequisites stay; actor root detach adds registry/reference checks. |
| `lifecycle` | Reuse | Existing task/root holds preserved; actor-domain operational holds do not override or clear them. |
| `owner-replaced` | Reuse | Implementation fence changes with explicit ownership transition; actor root also records branch/config owner binding. |
| `report` | Reuse | Original V1 payload/hash/producer identity retained through a bound V2 envelope, not rewritten. |
| `runtime` | Reuse | Kernel unknown/idle/busy/stopped projection derived conservatively from richer actor runtime observations, never authority. |
| `failure` | Reuse | Retain operation-bound storage/RPC/effect/notice failures; root actor failures get equivalent typed actor-domain records. |
| `unsupported` | Reuse | Preserve explicit holds and truthful unsupported families; no permissive fallback. |

Selected: **24 reuse, 2 bounded extensions, 1 not involved**. Keep the 27 kind names; new actor-domain events are namespaced separately. Their exact closed field unions are an AR3-03 implementation deliverable, not permission for a generic opaque payload escape hatch.

## 3. D1 — Canonical representation and module ownership

**Selected:** one canonical root history plus immutable archived-history references, with derived actor/workflow indexes. ActorHost will be the sole writer. No independently writable `state.actors`, `state.workers`, grants, mailbox status or accounting totals alongside a competing journal.

Target serialized root vocabulary:

```text
ActorStateV2 = {
  version: 2,
  encoding: 'pair-actor-state/1',
  segmentId: ID,
  genesis: ActorGenesisV2,
  events: ActorWorkflowEventV2[],
  archiveHead: ArchiveRefV2 | null
}
ActorGenesisV2 = {
  storeId, initialOwner, actorDefinitions, configSnapshot,
  heldLegacyRefs, checkpoint: ArchiveCheckpointV2 | null
}
ActorWorkflowEventV2 = {
  eventId, sequence, at, owner, workflowId: ID | null,
  domain: 'actor' | 'implementation',
  payload: ActorEventV2 | ImplementationEventV2
}
```

`sequence` is a positive safe integer and strictly consecutive within the current segment; `eventId` is unique unless an exact duplicate is rejected before append. `initialOwner`/event owner contain Main session, owner epoch and explicit branch revision; a normal message append/compaction is not branch replacement. `segmentId` is a unique admission/dedup epoch within the stable store, bound by the prior archive checkpoint; never reuse it on segment rotation. Store/config/actor IDs and native session IDs are separate namespaces. The exact discriminated payload fields are validated, not arbitrary `unknown`/extra keys. Root `version: 2` is a target, never a change to the active V1 constant.

The actor fold processes root events in order. For implementation-domain events it selects the workflow's implementation genesis and **one** kernel event subsequence, then uses the existing implementation kernel. It must validate actor correlation at each historical prefix, not validate all past grants against only the latest actor state. No future settlement, amendment or evidence can retroactively make an earlier grant admissible. An event that yields a hold remains a retained fact; rejection does not partially mutate either projection.

Actor records, workflow records, operation/mailbox records and accounting summaries are derived typed views. They are not independently stored input to the effect executor. A cache, if later added, must be recomputed/compared and cannot be a second writer. Root validation returns both the immutable canonical input and checked projections with `nonAuthorizing: true`. Actual provenance/ownership/effect admission remains AR-04's responsibility.

### Archive/checkpoint rule

No active-workflow journal compaction. When bounds approach, pause new ordinary admission; reserved control/disposition capacity remains. Once all workflows, effects, receipts and ownership transitions covered by a segment are resolved, an explicit archive operation may preserve the exact canonical segment and a checkpoint manifest for the next segment. Manifest binds prior head, byte hash, root revision, actors/session bindings, cumulative counters, resolved dispositions and every retained original-byte/evidence reference. It is never generated by deleting obligations to fit the bound.

A checkpoint is loaded only after a Host archive resolver verifies the referenced bytes/hash/chain and supplies the bounded checked archive context to full validation. Missing context is held, not trusted because its JSON says “verified”. Do not replay an unbounded chain: the first implementation supports a configured bounded archive context or requires offline reconciliation when it cannot establish the checkpoint. AR3-04 must implement this explicit checkpoint validation/retention boundary before activating archival. No destructive garbage collection or native session compaction is introduced.

### Selected module graph and API ownership adjustment

```text
actor-contracts.js → contracts.js / observations.js (leaf validation only)
actor-model.js → actor-contracts.js + coordination.js + transitions.js
current runtime modules → unchanged (no actor-model import in AR-03)
```

The [ten-task fan-out](AR-03-AGENT-TASKS.md) permits private `actor-contract-common.js`, `actor-config-contracts.js`, `actor-record-contracts.js`, `actor-wire-contracts.js` and `actor-migration-contracts.js` beneath the leaf facade for exclusive-file ownership. This is a modular implementation split, not additional Pi APIs or another state owner. Pure common/archive validators may also be consumed by actor-model; no helper imports actor-model or the facade. The six public leaf and five aggregate export names/ownership below remain unchanged.

Move the planned `validateActorStateV2` and `projectLegacyWorkerView` exports to **`actor-model.js`**. They require canonical replay/cross-record validation; exporting them from the leaf module would create a cycle or encourage a merely shape-checked “validated state”. Names remain unchanged, location is deliberately revised before code exists. `contracts.js` and the implementation kernel must not import actor-model.

## 4. D2 — Durable correlation, reviewer extension and accounting

### Host/runtime seam to implement later

1. Host reserves `activationId`, `operationId`, `commandId`, actor/generation/session/model/profile and workflow revision before a prompt. For implementer work it also binds task/attempt/lease and the kernel grant; supervisor work has no implementation lease. Plain persisted PID is never a process credential.
2. AR-04 adds an **internal trusted request-ID/write-observation seam** to PiRpc/PiRuntime. The host-provided command ID must be the actual outgoing RPC ID, with duplicate/in-flight ID rejection. Existing legacy calls may keep their current internal UUID behavior. Actor dispatch cannot enter the wire without the durable reservation and final owner/grant/revision/expiry guard.
3. PiRuntime stamps an observation at ingress using its generation-scoped retained dispatch binding, local monotonic observation sequence and original activation token, **before queueing**. The host maps that tuple to durable observation identity and commits it once. Retain the binding after revoke until run/transport/effect ambiguity is resolved; never borrow the next activation's identity.
4. ACK/write observation uses the actual command ID. Native session events do not carry that ID; attribution requires exclusive generation/activation observation boundaries and a known clean start. If multiple interpretations remain possible (including a trailing native event), retain an unattributed observation/gap and hold. Queue order or wall-clock time alone is not proof. No next activation while the old dispatch boundary remains uncertain.
5. A report uses its original bridge producer tuple and payload hash, independent of ACK timing. A `notify` frame only wakes the scanner. A native run-settled event is distinct from complete admitted-effect settlement. All identities are stamped/checked at the Host/bridge boundary, not accepted from model text.

These are required future seams, not claims about today's `PiRuntime`/`PiRpc` APIs. No runtime edit in AR3-01 or AR3-02 is implied.

### Kernel extension boundary

Keep existing Main decision/receipt branches unchanged. A supervisor decision uses a distinct source branch, tentatively `supervisor-control`, and a required reviewer-activation witness: actor/role/generation/session/model/profile, workflow/revision, activation, retained intent ID/hash, settlement observation and inspection request/reply/receipt refs. Actor-root replay proves each referenced fact existed in the proper earlier prefix and binds the exact report/checkpoint. Kernel validation checks the corresponding payload/identity relationships and retains `nonAuthorizing: true`; a self-asserted witness is not authentication.

Extend `evidence-receipt` with that actor-review linkage and `decide` with the explicit supervisor branch and readiness predicate. Do not remove the existing Main role check globally, relabel the supervisor as Main, or let two activations on the same session/model share a receipt. If a full pure extension cannot be validated without a second mutable registry, reject the design rather than insert an opaque trust boolean. Exact branch types and history checks must be implemented together in AR3-03.

### One observation, explicit scopes

Implementation usage remains in its kernel subsequence with current source checks/gaps. Supervisor usage is in actor-domain records bound to a committed supervisor activation. Workflow totals are a **derived union**, keyed by original producer/observation identity, of implementation observations plus supervisor observations, not another independently incremented copy of either ledger. Root admission checks workflow totals/completeness as well as kernel task/step constraints. Do not feed supervisor usage into the kernel under an implementer identity.

Immutable workflow policy/limits/deadline are captured at submission. Task/step projections inherit the appropriate snapshot, not current config. Task-local accounting and workflow aggregate accounting have explicitly different scopes; summing task totals and their individual observations again is forbidden. Summary/compaction usage needs an authoritative correlated source or a gap; whole-session totals include old workflows. Main/warming costs remain separate. No fabricated zero/completeness or reset on resume. Human amendment records bind expected revision, exact allowed field changes and consent; model-generated plans/reviews cannot amend budgets or permissions.

## 5. D3 — Initial finite bounds and retention policy

**Selected design ceilings**, not active configuration or a performance qualification. Apply both count and canonical UTF-8 byte bounds before acceptance; the tighter one wins. AR3-02 implements pure validation; AR3-04 must match all producers/readers. Capacity changes after activation require explicit compatible policy/version treatment, not silently larger defaults.

| Domain | Initial ceiling / semantics |
|---|---|
| Active canonical segment | 16 MiB total canonical JSON; 16,384 events; depth 32; 250,000 aggregate JSON nodes. Reserve 512 KiB and 256 event slots for control/disposition inside those totals. Ordinary admission stops before consuming the reserve. |
| Registered actor definitions | 64; inactive legacy slots can remain. Oversized migration is backed up and held, never truncated. Live capacity remains one legacy worker until later gates; actor-pair target is two residents/two active model calls, one per actor, one implementation writer. |
| Unresolved workflows | Exactly one admitted unresolved workflow. A second submission receives rejection before an accepted receipt; no hidden user-workflow queue. |
| Ordinary actor mailbox | Default 8 queued/reserved inputs; configurable 0–64; active activation tracked separately. Zero disables new ordinary admission, not retained obligations. Byte bound: at most 4 MiB ordinary retained envelopes per actor, also bounded by root segment capacity. |
| Reserved actor control lane | 8 bounded control/disposition envelopes, at most 512 KiB per actor, inside root reserve. Only cancellation, failure/disposition and reconciliation control; never implementation prompts disguised as control. |
| Envelope/event and inline result | 65,536 canonical UTF-8 bytes including identity/metadata; one referenced payload/blob at most 4 MiB, aggregate referenced bytes needed for one admission/validation at most 16 MiB. A reference is not a size-limit bypass. |
| Report payload | Retain current task-snapshot `maxReportBytes`; separately enforce envelope/transport bounds. Values exceeding the selected envelope require a bounded artifact reference or rejection, never silent text truncation. V1 legacy parsing/hash rules remain unchanged. |
| Unresolved operations / inspection receipts | 256 unresolved operations globally; 256 outstanding inspection/delivery receipts. Record occupancy explicitly. All consume segment/event limits; no overwrite or eviction to make room. |
| IDs / hashes / text | New logical IDs use the existing exact grammar `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$`: initial alphanumeric, then alphanumeric/underscore/hyphen, 80 characters maximum. Reject `prototype` and all own property names of `Object.prototype`, matching stored/kernel/path boundaries. No dots or leading underscore/hyphen; no silent identifier renaming. Hash: 64 lowercase hex. Paths/native session IDs are separate bounded text fields (at most 10,000 UTF-8 bytes), not filesystem authority. Other inline text bounded by its envelope. Identity/revision counters are safe integers with checked increments. |
| Deadline | Each new bridge request has finite `expiresAt`, at most 300,000 ms beyond admission time; no implicit renewal. Workflow lifetime deadline may be explicitly null where policy permits. Transport/UI deadlines remain separate. Expired issued work is uncertain, not “not executed”. |
| Archive validation | At most 16 referenced immutable archive/checkpoint artifacts and 16 MiB decoded context per online validation; larger/unverifiable history holds for explicit offline reconciliation. Historical evidence blobs retain their existing separate limits; this cap concerns coordination replay context, not source evidence or native conversation length. |

All depth/node/reference limits apply across the validation operation, not separately per nested object to multiply the budget. Leaves also reject cycles/accessors/non-JSON values before traversing/serializing. Exact cost/byte arithmetic and deadline comparisons are deterministic code, not model judgments.

**Fairness:** control/disposition is serviced first; within ordinary inputs, at most two consecutively ready question/answer-priority items may precede an already eligible non-priority item, then serve the oldest eligible one. Persist the fairness cursor/sequence in the canonical event history; restart cannot reset starvation accounting. Ineligible/stale entries get a retained disposition, not repeated priority. This is a scheduling model for later implementation, not a pump in AR-03.

**Dedup horizon:** unresolved operations never expire out of storage. For a resolved archived segment, retain a store/segment-bound admission epoch and immutable archive reference. A stale request from an older epoch is rejected or answered through a bounded verified archived receipt; it is never treated as a new operation because its receipt is absent from memory. Return any old receipt only after current caller authorization and original target binding are checked. No unconditional exactly-once promise and no background archive deletion.

**Exhaustion:** ordinary capacity failure rejects before acceptance. Reserve exhaustion/disk failure is a fatal admission hold/containment condition for AR-04; preserve the last good canonical state and report uncertain containment if a new diagnostic cannot be persisted. Never claim an unrecorded stop is durable or discard unresolved records to continue.

## 6. D4 — Versioned encoding, hashes and grant proof

Select codec **`pair-json/1`** for new V2 canonical values: inert JSON only; recursively sort object keys by ECMAScript UTF-16 code-unit order; preserve array order; no whitespace; JSON string/number encoding as in ECMAScript `JSON.stringify`; finite numbers only, normalize negative zero to zero; reject lone surrogates, cycles, symbols, accessors, `toJSON`/custom prototypes, `undefined`, BigInt and duplicate raw JSON keys. V2 raw-byte decoders must reject duplicate keys before constructing an object. The separate V1 carrier decoder retains the current JSON.parse last-value/first-key-order duplicate-member behavior under bounded parsing, with exact original text/byte hash kept separately from the legacy payload digest. Shape validators cannot recover duplicates already erased by a generic parse. No floats for identity/counter/time fields; finite nonnegative decimals remain allowed for explicitly typed costs.

New digest domain is SHA-256 of UTF-8 `pair/<domain>/v2\n` followed by the canonical JSON bytes. Closed domains are config, state, actor-event, workflow-input, operation-input, authority, mailbox, control, inspection, migration and archive. Freeze the exact included fields for each envelope: payload/input hash excludes delivery status, retries and mutable timestamps; full immutable artifact hash includes its version and complete published content. Do not hash a field that contains its own digest.

**V1 exception:** current `contracts.js` and kernel `payloadDigest` use `JSON.stringify(original payload)` in original property order. Preserve those bytes/representation and existing evidence/manifests verbatim; do not canonicalize old reports/approvals into a new hash. A V2 wrapper carries the original V1 representation/hash plus its own domain-separated wrapper hash. Exact source-byte backup uses SHA-256 of original bytes without the V2 JSON domain. Hashes name content; none authenticate a principal.

Select grant proof vocabulary: store ID, root commit revision/hash, grant operation ID, immutable input/authority hash, owner session/epoch/branch, actor role/profile/generation/session/nonce, workflow/revision/activation, and implementer task/attempt/lease where applicable. The Host persists intent and immutable publication before exposing an authorizing readback. Recipient admission requires both that matching proof and a current owner/lifecycle admission binding; an old immutable grant artifact by itself cannot override later revocation. AR-04 owns atomic publication/readback/ownership; loss or stale binding holds. A role handshake lists accepted wire/contract profile and exact runtime binding; V1 peers cannot silently ignore V2 proof.

## 7. D5 — Migration and read-only legacy projection

Selected source families are exactly those recognized by `classifyStoredState`: pre-identity versus identity-bearing V1, pre-deferred versus current policy/limits, supported historical/current diagnostic records and the existing explicit final/strict aliases. Mixed, partial, corrupt or future layouts are rejected/held with the original bytes; no new heuristic shape recognition.

Future migration manifest fields: `migrationId`, source path/version/profile, exact byte length/hash, backup path/hash, proposed target store/version/hash, owner/branch binding, stage (`classified | backed-up | prepared | committed | held`), retained obligation/artifact refs, primary issue and rollback issue. Byte capture precedes decode/classification and source replacement; reject/oversize still preserves source and a recoverable diagnostic reference. If exact backup cannot be established, no replacement.

Recognized legacy execution identity is not trusted merely because fields exist; missing identity stays missing. Preserve worker ID/session paths and original reports/latches/history/evidence; adopt only through an explicit current authorization plus ownership, containment, accounting and evidence reconciliation. Fresh target IDs may identify migration records but must never be described as historical execution IDs. No active `migrateStoredState(...createAttemptId)` call is used to supply V2 grant provenance.

`projectLegacyWorkerView(state, workerId, context)` replays validated canonical state and returns a read-only `{nonAuthorizing:true, workerId, session, status, heldReasons, taskRef, pendingObligationRefs, historyRefs, diagnostics}` view. Missing/unrepresentable old fields remain explicit; never synthesize a runnable V1 task/authority, write `state.workers`, or feed this view to the legacy authorizing validator. Held legacy state remains inspectable/cancellable/reconcilable even when startup is denied. Existing public tools gain mode-aware adapters only in later integration.

**D5 additive implementation amendment:** [held-carrier contract](D5-HELD-CARRIER-CONTRACT.md) adds an explicit held-only resolver context to this projection. With `kind:'held-legacy'`, `value` is validated `HeldLegacyEvidenceV2` plus separately supplied original/backup bytes; no actor/workflow/config or historical identity is manufactured. Recognized workers and unknown held sources expose retained references without admission. The other four aggregate APIs and archive context schema do not accept this context. This source-implemented amendment awaits independent review/T10 and does not activate migration or a second state writer.

## 8. D6 — Staged activation and shared signatures

| Stage | Allowed format/interface behavior | Still forbidden |
|---|---|---|
| AR3-01 | Ratified decisions, source map, signatures and review | Production edits or implemented-format claim |
| AR3-02/03 | Pure leaf/aggregate validators and model composition with literal future version branches; unconsumed by runtime | Changing active constants/defaults/registrations, live reader/writer activation |
| AR3-04/05 | Exhaustive per-field codecs/readers/writers/crash tables verified against pure source; handoff | Claiming authenticated producer or runtime safety from a pure validator |
| AR-04 legacy Host | Explicit V2 config adapter into canonical legacy Host; coordinated State V2 + participant wire/admission rollout with complete held-state consumers | Partial grants readable by old peers, second registry, automatic actor-pair opt-in |
| AR-05/06 | Restricted role/bridge, then complete two-runtime workflow only after every required role/config/Apply/reader gate exists | Enabling a mode whose reader or consent path is deferred to AR-08 |
| AR-07/08 | Separately gated idle policy; finish consistent config/UI/observability | Retroactive default enablement or hidden format/permission relaxation |

Config V3 `mode` distinguishes legacy and actor-pair. Disabled V2 defaults retain unselected provider/model values through preview; admission still requires exact valid selection before inference. Preserve `evidence`, all deferred queue/repair/recovery fields and worker-scoped extension/skill inputs omitted from the illustrative actor config. Conflict of legacy `requirements` with `workerRequirements` rejects. Actor-pair cannot inherit unrestricted supervisor resources. A syntactically accepted config is not loaded-tool/model/profile qualification.

### Shared next-slice signatures

All accept inert `unknown`, validate to concrete readonly JSDoc types, and throw structured expected validation errors (`code`, `path`, `category: corrupt|unsupported`) without swallowing programming errors. No clock/UUID/filesystem/RPC calls. A caller-supplied `context` is data to validate, not a capability.

| Module / export | Selected signature / obligation |
|---|---|
| `actor-contracts.js: validateActorConfigV3` | `(value: unknown): ActorConfigV3` — strict mode/role/config/limit leaves; no active loader call. |
| `validateActorRecordV2` | `(value: unknown): ActorRecordV2` — intrinsic fields/holds/reference shape; aggregate proves their history. |
| `validateWorkflowRecordV2` | `(value: unknown): WorkflowRecordV2` — immutable snapshot, revision/participant/obligation fields; no fake completeness. |
| `validateActivationRecordV2` | `(value: unknown): ActivationRecordV2` — independent intent/ACK/run/settlement observations and role-specific binding. |
| `validateMailboxEnvelopeV2` | `(value: unknown): MailboxEnvelopeV2` — bounded closed role/kind payload, correlation, original hash, lifetime/disposition shape. |
| `validateActorControlV2` | `(value: unknown, expected: ActorControlBinding): ActorControlV2` — exact expected peer/owner/role/version/generation/session/nonce and operation correlation required, not optional. |
| `actor-model.js: validateActorStateV2` | `(value: unknown, context: ArchiveValidationContext): ActorStateValidation` — canonical root + replayed views + `nonAuthorizing:true`; initial segment uses an explicit empty archive context. No shape-only state admission. |
| `projectLegacyWorkerView` | `(value: unknown, workerId: string, context: ArchiveValidationContext \| HeldLegacyProjectionContext): LegacyWorkerView` — canonical actor replay or explicit byte-validated held evidence under the D5 amendment; never independently stored execution state. |
| `validateActorWorkflowModel` | `(value: unknown, context: ArchiveValidationContext): ActorWorkflowModel` — historical-prefix validation of actor and implementation domains. |
| `validateActorWorkflowEvent` | `(value: unknown): ActorWorkflowEventV2` — closed shape, bounded encoding/counters and immutable inputs; history checks belong to full replay. |
| `reduceActorWorkflow` | `(model: unknown, event: unknown, context: ArchiveValidationContext): ActorTransitionResult` — atomic apply/noop/hold/reject, always non-authorizing, unexpected errors escape. |

`ArchiveValidationContext` consists of bounded immutable decoded artifacts plus their original byte/hash facts and prior-root bindings supplied by the Host resolver. Pure validators recheck internal equality/cross-refs; they cannot certify that supplied bytes came from a file. This trust split is explicit. The final exact type fields/codecs are implemented and cross-checked in AR3-02–04 before freeze completion.

## 9. Slice acceptance and remaining boundary

| Check | Required evidence |
|---|---|
| C1 Source reconciliation | Protected digest unchanged; exact runtime command/observation/receipt/accounting gaps recorded from source. |
| C2 Kernel reuse | Every current KINDS entry appears once in §2; 24 reuse / 2 bounded extension / 1 not involved; no renamed/removed event or source edit. |
| C3 Decisions/signatures | D1–D6 selected with concrete representation, finite bounds, codec, correlation and rollout; two export ownership moves reconciled with runbook. |
| C4 Vertical path/uncertainty | Source trace and later Host responsibilities preserve report-before-ACK, original identities, pending obligations, known-effect barriers, immutable lifetime budgets and confirmed-exit admission. |
| C5 Independent review | One narrowly scoped read-only verifier checks the decision record against source/runbook; parent resolves findings, not merely trusts prose. |
| C6 Mechanical preservation | Whitespace/local anchors/symbol coverage and 21 protected file + original 106 requirement digests match. No tests/workers/install/source/version changes. |

**Independent source review:** read-only Astra run `3dad2fbe3f344c0f8b851dd8dafdd6fb` completed with read/grep/find/ls only. It confirmed the 27-kind disposition, runtime ID/observation seams, Main-only reviewer and supervisor accounting gaps, canonical-history ownership, bounded archive rules, hash compatibility, migration and all 11 planned exports. One P2 finding: the draft ID grammar allowed dots/non-alphanumeric starts inconsistent with existing boundaries. Parent inspected `coordination.js:token/id`, `contracts.js:ID_PATTERN/RESERVED_IDS` and `util.js:safeId`, and corrected D3 to their exact shared grammar/exclusions. No remaining unaddressed source finding in that review; no behavioral certification.

**Mechanical checks passed:** 21 protected source/config/tooling files unchanged; all 106 original requirement rows unchanged; exactly 27 kind rows (24/2/1), all 11 proposed shared exports present in both documents; corrected ID grammar/exclusions match existing source; 10 local links/anchors valid; whitespace clean. Package dry-run has 38 files including this decision record, no bundles or tarball. Proposed actor-contract/model modules still do not exist, as expected for AR3-01. C1–C6 are satisfied at this slice's source/documentation boundary. Most recent supplemental compiler result remains 350 source / 0 dependency diagnostics with clean core modules; pinned compiler unavailable. No compiler rerun for unchanged source, no behavioral qualification, and no claim that future validator exports exist.

Foreman observer: `5d192010-293d-4d3e-a7f0-f3be6c1beabe`, consented settlement cadence with only Jev evaluation/advice, bounded selected text and one steering attempt. Final observed state: **timed_out**, before Main settlement; nine turn events consumed, zero dropped, **zero assessments, zero tokens and zero advice delivered**. It was not restarted. No Jev endorsement is claimed; the independent source review and mechanical results above supply this slice's evidence. Observer launch/termination is not acceptance.

**Next after this slice:** AR3-02 implements the pure leaf records/validators using these shared decisions. AR3-03 implements/reviews actor composition and the two precise kernel extensions; AR3-04/05 must still finish field-level freeze/static review. ActorHost remains AR-04.

# P0 — frozen contract for unknown-delivery reconciliation and structural replanning

**Status:** frozen interface for the implementation wave. This document authorizes no behavior by itself; every shape below must be implemented and then independently reviewed. It refines [the implementation plan](RECONCILIATION-REPLANNING-IMPLEMENTATION-PLAN.md) §4–§5 with exact names so three writers can work on disjoint files without guessing each other's shapes.

Sources unchanged at freeze time: 24 production files, digest `62853c66dbc7091f3f4be95a5022c9d54c9a5caf2c333d27126afba411060f91`.

## 0. Hard rules

1. One writer per file. `actor-wire-contracts.js`, `coordination.js` and `actor-model.js` are owned by different writers in this wave; `actor-contracts.js`, `actor-contract-common.js`, `contracts.js`, `schema.js`, config, facade, runtime and V1 formats are **not** touched.
2. No new digest domain, no cap increase, no new kernel event kind. Exactly three new **actor** event kinds are added (all in `ACTOR_KINDS`).
3. All parsing/folding uses the existing scoped helpers (mandatory registered context, `ok`/`pick`/`id`/`hash`/`plain`/`closed`/`workArray`/`freezeWork`/`sameWork`) and existing bounds.
4. Immutable history is never rewritten. Original payload, outer observation timestamp and owner stay exactly as first retained.
5. Missing or contradictory proof yields an explicit unsupported/held outcome, never a synthesized success, never a resend, never eviction of an obligation.
6. Run `node --check` on the edited file and report exact results. Add no files other than the ones named for the writer. No tests, fixtures, runners or installs.

## 1. M1-B — mailbox reconciliation

### 1.1 New actor event kinds

**`mailbox-attempt-bound`** — binds one mailbox message to the one operation attempt authorized to deliver it. Required before any delivery observation for that message.

```
{ kind, issuer:ActorBinding, messageId:Id, operationId:Id, commandId:Id,
  inputHash:Hash, controlHash:Hash, messageHash:Hash,
  activationId:Id|null, at:number }
```
- `issuer` must be the current retained Main, the same rule as `mailbox-enqueued`/`mailbox-disposition`.
- `messageHash` must equal the retained entry's `payloadHash` (envelope digest). `controlHash` must equal `control.digest` of the retained envelope; `commandId`/`inputHash` must equal the retained control's input request ID and binding input hash.
- `activationId` is non-null only for activation-borne traffic; inactive/control traffic keeps `null`.
- Unique by `(messageId, operationId)`; a second distinct binding for the same pair conflicts.

**`mailbox-delivery-observed`** — one durable transport/production fact for a bound attempt.

```
{ kind, issuer:ActorBinding, messageId:Id, operationId:Id,
  observation:{ observationId:Id, at:number, stage:DeliveryStage, actor:ActorBinding, commandId:Id, inputHash:Hash },
  at:number }
```
- `DeliveryStage` = `'sent' | 'accepted' | 'started' | 'run-settled' | 'rejected' | 'ingress'`.
- The attempt binding must already be retained; `commandId`/`inputHash` must match it. `actor` must equal the retained binding's consumer actor for that direction.
- `observationId` is globally unique across the actor workload (never reused by another event or by `mailboxObservations`). Original `at` cannot be future relative to the enclosing event, cannot precede the enqueue, and cannot be moved to another producer.
- Stage facts are retained as an ordered set per `(messageId, operationId)`; identical retries are no-append noops, contradictory re-use of the same `observationId` conflicts.

**`mailbox-reconciled`** — the one resolution record for an original `unknown` disposition.

```
{ kind, issuer:ActorBinding, messageId:Id,
  dispositionObservationId:Id, priorResolutionId:Id|null,
  reconciliationId:Id, observationId:Id, at:number,
  resolution:{ kind:ResolutionKind, evidence: readonly EvidenceRef[] } }
```
- `issuer` is current Main. `dispositionObservationId` must equal the observation ID of the retained original `unknown` disposition for that message.
- `priorResolutionId` is `null` for the first record and otherwise the exact `reconciliationId` of the record it corrects; the chain must be acyclic and totally ordered by `at`.
- `reconciliationId` and `observationId` are lifetime-unique and distinct from each other and from every other actor observation ID.
- Exact retries (same message, disposition, prior, reconciliation ID, evidence, `at`, owner and outer event time) are no-append noops. Changed evidence/`at`/owner/outcome under the same `reconciliationId` conflicts. A changed correction is a *new* record naming `priorResolutionId`.

```
ResolutionKind = 'participant-consumed' | 'main-consumed' | 'rejected-before-execution'
               | 'proven-not-sent'  | 'terminally-contained' | 'incomplete-hold'
```

```
EvidenceRef =
  | { kind:'attempt-binding',        messageId:Id, operationId:Id }
  | { kind:'delivery-observation',   messageId:Id, operationId:Id, observationId:Id }
  | { kind:'ingress-receipt',        receiptId:Id }
  | { kind:'containment',            activationId:Id, observationId:Id }
  | { kind:'effect-barrier',         barrierId:Id }
  | { kind:'kernel-reconciliation',  operationId:Id }
```
Every reference must resolve to an already-retained fact inside this workflow/segment, in the right domain, for the same attempt. A reference that resolves to a fact of the wrong kind, workflow, message or producer is `inconsistent-reference`. Naked hashes, free-form reasons, source labels and unvalidated operation-ID equality are not evidence.

### 1.2 Minimum evidence per resolution

| `ResolutionKind` | Minimum retained evidence |
|---|---|
| `participant-consumed` | `attempt-binding` + a `delivery-observation` with stage `accepted` or `started` for that exact attempt |
| `main-consumed` | `attempt-binding` + an `ingress-receipt` retained for the same message, or a `delivery-observation` with stage `ingress` |
| `rejected-before-execution` | `attempt-binding` + `delivery-observation` stage `rejected`, and no retained `accepted`/`started`/`run-settled` for that attempt |
| `proven-not-sent` | `attempt-binding`, no retained delivery observation for that attempt, plus an `effect-barrier` (implementer traffic) or `containment` with outcome `not-sent` and complete coverage (supervisor traffic) |
| `terminally-contained` | `attempt-binding` + `containment` for the exact activation, plus `effect-barrier` when implementation effects were possible |
| `incomplete-hold` | `attempt-binding` at minimum; retained but **releases nothing** |

The writer must also reject, as `unsupported-mailbox`, any case the frozen matrix cannot cover (for example an inactive/control message with no real ingress or transport witness).

### 1.3 Derivation, occupancy and late facts

Retained per-replay additions (names are part of this contract):

- `mailboxAttempts: Map<Id, Map<Id, AttemptBinding>>` — message → operation → binding.
- `mailboxStageFacts: Map<Id, Map<Id, Map<Id, StageFact>>>` — message → operation → observation ID → fact.
- `mailboxResolutions: Map<Id, readonly ResolutionRecord[]>` — message → ordered records (original plus corrections).
- `mailboxObservationIds: Set<Id>` — global uniqueness registry for new observation/reconciliation IDs, kept separate from the existing `mailboxObservations` epoch set.

Rules:

1. Effective state = original disposition plus every currently-valid resolution. Occupancy releases **exactly once**, in the original lane and byte count, only for a resolution class whose minimum evidence is currently satisfied.
2. Reconciliation never re-serves a message, never advances `priorityStreak`, and never selects the next message. The original first-attempt selection already advanced history.
3. `mailboxOccupancy` keeps its signature and meaning: it counts non-released entries. `incomplete-hold` leaves an entry non-released.
4. Contradiction re-evaluation: when a later `mailbox-delivery-observed` fact exists for a bound attempt, any `proven-not-sent` or `rejected-before-execution` resolution whose minimum evidence no longer holds becomes **not currently satisfied**; the entry returns to occupied, the resolution record stays retained verbatim, and a `hold-recorded` with `reason:'uncertain-delivery'`/`scope:{kind:'mailbox',id:messageId}` is required for the state to validate. A later `hold-resolved` may clear it only for a new, currently-satisfied resolution naming the prior one. Late truth is never rejected and old proof is never deleted.
5. Adding a new resolution whose `reconciliationId`/`observationId` is already retained conflicts. Adding one that names a different prior chain head conflicts.
6. Fork, incremental append, full replay and cache reconstruction must produce byte-identical results. `released` is a derived field, never authority: a forged `released:true` in a supplied cache must be recomputed and rejected when it disagrees.
7. Quiescent archive rotation still requires no unresolved mailbox obligation: an entry with an unsatisfied resolution or `incomplete-hold` blocks rotation exactly as an original `unknown` does. Original dispositions, attempt bindings, stage facts and resolution records survive rotation.

### 1.4 Public surface

- `MailboxEntryView` gains `attempts`, `resolutions` and `effectiveDisposition` views; `MailboxView` gains nothing new in this wave beyond what those entries carry.
- No new export on `src/actor-contracts.js`, no config field, no runtime tool.
- `validateMailboxEnvelopeV2(value)` keeps arity 1. Any new private adapter takes the mandatory registered context as its last parameter and stays unexported.

## 2. E2 — structural replanning

### 2.1 Frozen wire shapes (writer: wire file only)

```
PlanChangeV2 = Readonly<{
  version: 1,
  expected: Readonly<{ taskId:Id, workflowId:Id, workflowRevision:Id,
    taskPlanRevision:number, workflowPlanRevision:number, planHash:Hash,
    currentStepId:Id, reportId:Id, reportHash:Hash, checkpointHash:Hash,
    grantOperationId:Id, accountingRevision:Id,
    budgetRevision:Id, budgetHash:Hash,
    workflowBudgetRevision:Id, workflowBudgetHash:Hash }>,
  next: Readonly<{ taskPlanRevision:number, workflowPlanRevision:number }>,
  remainingStepIds: readonly Id[],
  introducedSteps: readonly Readonly<{ step:PlanStepFullV2, replaces: readonly Id[] }>[],
  removedStepIds: readonly Id[],
  current: Readonly<{kind:'keep'}>|Readonly<{kind:'replace',successorStepId:Id}>,
  supersedesDecisionOperationId: Id|null
}>

PlanStepFullV2 = Readonly<{ id:Id, title:string, instructions:string, acceptance?: readonly string[] }>

PlanLinkV2 = Readonly<{ activationId:Id, intentId:Id, intentHash:Hash,
  operationId:Id, controlHash:Hash }>
```

- `change` is optional on supervisor `plan` payloads only (`kind:'plan'`, same activation, produced before the review of the same activation).
- `planLink` is optional on `review` payloads only, and only meaningful with `action:'revise'`.
- Kernel supervisor-control `decide` carries optional `planChange` = `{change:PlanChangeV2, planLink:PlanLinkV2, planSettlement:Readonly<{observationId:Id,at:number}>}`.
- Legacy `DecisionInput`/`inputHash` semantics are unchanged when these fields are absent. Absent fields must not appear as `undefined` keys in hashed projections.
- The structural hash uses the existing `operation-input` domain over a canonical projection of: workflow/task plan coordinates, the complete immutable catalog (id-order), the executable order, the current selection, retirement/lineage links and the plan link. No timestamps, no mutable caches, no `released`-style derived flags.
- Validation rules the wire writer must enforce: `next.taskPlanRevision === expected.taskPlanRevision + 1`; `next.workflowPlanRevision === expected.workflowPlanRevision + 1`; `remainingStepIds` nonempty, unique, `<= COMMON_BOUNDS.maxPlanSteps` (reuse the existing 32-step bound rather than inventing a cap); `introducedSteps` IDs unique and disjoint from `removedStepIds`; every `replaces`/`successorStepId`/`supersedesDecisionOperationId` present and well-formed; `acceptance` preserved as an optional array without substitution.

### 2.2 Kernel semantics (writer: kernel file only)

1. Retain an immutable step **catalog** (all lifetime IDs, original content, retirement/lineage) separate from the executable remainder and the current selection. Existing grants/reports/ledgers keep their original step attribution.
2. Lineage groups: a fresh unrelated step forms its own group; each replacement/split joins its predecessor's group; every successor shares that group's allowance. Merges are **rejected** with an explicit conflict reason in this wave. Group consumption is summed from original member ledgers, counting each original member once; gaps/unknowns are preserved.
3. `exhausted`, revise admission, and any per-step cap read the lineage group, not only `t.steps[t.stepIndex]`.
4. Lifetime distinct step IDs per workflow must not exceed the existing 32-step bound, counting retired IDs; restarting a task does not replenish it.
5. The successful structural `revise` charges revisions **once** against the original reviewed step/group and the lifetime ledger, advances task and workflow plan revisions once, installs the new catalog/order/current/debt atomically, consumes the report once, and creates the continuation obligation in the same tentative fold.
6. No partial mutation on failure: a failed commit leaves plan, catalog, ledgers, counters, obligation and report consumption unchanged.
7. Candidate supersession: a valid new candidate atomically marks exactly the named prior uncommitted same-report candidate superseded; the prior identity and any late commit stay retained but permanently ineligible. A failed replacement must not disturb the prior candidate.
8. `revise` never advances the approved workspace base. Unapproved work transfers to the named successor as review debt.
9. Standalone `validateCoordinationModel`/`reduceCoordination` must apply the same supersession and plan checks; no behavior may exist only in the context-aware path.

### 2.3 Aggregate integration (later wave, `actor-model.js`)

Deferred to a second wave owned by whoever integrates after the kernel lands: actor `plan-recorded`/`supervisor-intent-recorded` structural branch, `planRecorded`/revision projections, exact plan→review→settlement→inspection→candidate correlation, once-only revision accounting in `budgetDenial`, derived plan/lineage/review-debt views, fork/archive carryover, and `advanceTaskBase` preservation. The mailbox writer in this wave must not touch these paths.

## 3. Review gates

Each writer stops after its own file, runs `node --check`, and reports: exact edits, shapes implemented, rules deliberately left unsupported, and unrun checks. Independent verification by a different model then inspects the frozen contract against the actual source and reports witnessed defects only. Compilation, link, documentation and packaging checks remain Main's integration step.

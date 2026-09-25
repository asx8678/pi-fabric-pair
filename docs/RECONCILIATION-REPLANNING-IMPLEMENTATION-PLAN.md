# Unknown-delivery reconciliation and structural replanning — implementation plan

**Status: historical implementation contract; M1-B/E2 source is now implemented and partially checked.** See the [checkpoint](RECONCILIATION-REPLAN-CHECKPOINT.md) and [current next implementation plan](NEXT-IMPLEMENTATION-PLAN.md). The original planning pass changed documentation only; this document's requirements and acceptance rows remain in force. It refines M1-B and E2 from [next delivery execution](NEXT-DELIVERY-EXECUTION.md), within [current scope §10](SCOPE-OF-WORK.md#10-current-scope-after-test-removal). The [mailbox/archive checkpoint](MAILBOX-ARCHIVE-CHECKPOINT.md) remains the implemented baseline. Earlier [C6 structural proposals](C6-PLAN-PREIMAGE-PROPOSAL.md) are background, not current source contracts.

## 1. Scope and completion boundary

Implement the **pure, evidence-bound model protocols** first, then qualify their combined public execution path. Do not equate that with Host/transport recovery being operational.

Included:
- Unknown mailbox delivery evidence, exact reconciliation, preserved originals, derived capacity/holds and late contradictions.
- Report-boundary replacement/reordering/removal/splitting of remaining work; immutable history, shared budget lineage, review debt and candidate supersession.
- Parser → historical/incremental reducer → private fork → derived views/cache validation → archive carryover, with existing resource caps.
- Existing V1 compatibility, actual public-path probes, stopped-source review and a precise Host handoff.

Not included: ActorHost implementation, sending/retrying RPCs, scheduler/runtime eligibility, automatic adoption, migration of user data, settings Apply, new providers/transports, parallel writers/worktrees or release certification. Host-backed evidence production and durable publication are **M1-H**, after H1; requiring the complete Host before the pure M1-B protocol would create a dependency cycle.

Preserve the existing dirty work, particularly `src/util.js`. No new test/fixture/runner/script files, installs, native/paid workers or commits. Bounded no-file public-module probes are allowed during implementation; none is claimed as executed by this planning pass.

## 2. Source-confirmed findings

Line numbers describe the audited snapshot; function/case names are the durable anchors.

| Finding | Source witness | Required change |
|---|---|---|
| Unknown → terminal rewrite is deliberately unsupported. Original disposition payload/time/owner are immutable. | `src/actor-model.js:2667`, `applyMailboxDisposition` | Add a separate reconciliation record, not a permissive overwrite. |
| Unknown consumes count/bytes but is not selected for service. Fairness history already advances on the first unknown attempt. | `mailboxOccupancy`, `nextFair`, `nextMailboxMessage` | Release only on qualified resolution; do not serve again or advance fairness again. |
| Wire has `reconcile` and `resolved` disposition shapes, but validates shape/hash/reference domains, not actual delivery provenance. | `src/actor-wire-contracts.js:266`, `disposition`; `controlInput` reconcile branch | Add retained, target-bound evidence and aggregate consumption. A valid receipt digest is not authority. |
| Existing delivery/settlement/containment facts are usable building blocks, with independent effect and usage obligations. | `deliveryFacts`, `settlementFacts`, `containmentComplete`, `activation-contained` in `actor-model.js`; `reconcile` in `coordination.js:784` | Reuse exact qualified facts; a kernel command reconciliation or tag alone is not a mailbox proof. |
| Plans are currently pre-dispatch only; post-dispatch plan output is held. | `actor-model.js:2296` `plan-recorded`; `:2366` `supervisor-intent-recorded` | Add an explicit structural-plan branch; do not remove the existing initial-plan guard. |
| `revise` returns `continue`; commit charges a revision and installs a continuation without changing steps or task plan revision. | `coordination.js:716` `decisionOutcome`; `:899` `commitIntent` decide branch | Install the structural change atomically at the existing commitment boundary. |
| Another ready candidate for the same report conflicts; there is no named supersession state. | `coordination.js:1142` decide branch; `intentReady` | Retain a permanent supersession disposition and fence late commitments. |
| Actor plan steps omit kernel acceptance criteria. Initial dispatch explicitly disallows nonempty criteria not present in the producer plan. | `actor-wire-contracts.js` `PlanStepV2`; `actor-model.js:1836` dispatch correlation; `contracts.js` `Step` | New introduced steps need complete kernel content; never silently drop acceptance criteria. |
| Per-step caps read the physical current step ledger. | `coordination.js:644` `exhausted`, `decisionReady`, `charge`; `actor-model.js:2908` `budgetDenial` | New IDs must share inherited consumption/unknowns, not reset allowances. |
| Aggregate revision budget adds `wf.planRevision - 1` to task revision spending. | `actor-model.js:2908` `budgetDenial` | Once a structural revise advances both, identify the shared charge and count it once. Do not simply sum or collapse independent charges with `max`. |
| Approved workspace base advances only on committed approve; actor-denied commitments remain retained. | `advanceTaskBase`, `kernelAdmissionDenial`, `retainHeldCommitment`, `applyImplementation` | Preserve both invariants through structural changes and supersession. |
| Replay already carries quiescent archives and copies private graphs. | `runFold`, `bindArchive`, `forkActorReplay`, kernel `fork` | Add new history/index/view fields end to end; do not trust cached `released` or plan fields. |

## 3. Delivery sequence and ownership

All rows below are **planned, not started**. Main remains integrator. Shared-file writers must run sequentially; read-only reviews may run independently once a slice is stopped.

| Stage | Deliverable | Primary files | Exit condition |
|---|---|---|---|
| P0 — contract freeze | Ratify the closed field/issuer/evidence matrices below, receipt coverage by message kind, revision/hash rules and compatibility cases. | This plan, wire/model/kernel interface notes | No unspecified proof class can release occupancy or authorize a replan. |
| MB1 — delivery evidence | Retain exact delivery-attempt/receipt evidence and immutable observation identity. | `actor-wire-contracts.js`, `actor-model.js` | Both mailbox directions and supported control/activation cases have explicit proof paths; unsupported cases stay held. |
| MB2 — reconciliation fold | Separate reconciliation history, derived resolution/occupancy, late-fact invalidation, scoped holds and immutable retries. | `actor-model.js` | M01–M07 below pass through public entrypoints, including archive/cache paths. |
| RP1 — structural contracts | Closed optional proposal/link/change on actor supervisor branches only; full step content and hash projections. | `actor-wire-contracts.js`, `coordination.js`, `actor-model.js` | V1/ordinary revise payloads and hashes unchanged when fields are absent. |
| RP2 — kernel plan/lineage | Immutable catalog/order/history, lineage-aware caps, current disposition and candidate supersession; atomic commit. | `coordination.js`; `transitions.js` only if type/result integration requires it | R01–R06 kernel behavior works through existing reducer entries, not a parallel reducer. |
| RP3 — actor integration | Real plan/review/settlement/inspection correlation, actor-prefix gates, once-only revision charges and review debt. | `actor-model.js`, necessary wire integration | R07–R10 pass; no mutation waits for or is reauthorized by an actor mirror. |
| Q1 — combined qualification | Actual public workflow, replay/cache/archive parity, bounds, compatibility and independent stopped-source review. | Owned source corrections plus ledgers | All acceptance rows have witnessed evidence or explicit blocking gaps; no blanket completion from compilation. |
| M1-H — later Host integration | Durable reservation/evidence publication before effects, eligible service/retry decisions and crash recovery. | Future H1 runtime/store scope | Separate native/crash qualification; not counted as MB1/MB2 delivery. |

Default source set: `actor-model.js`, `actor-wire-contracts.js`, `coordination.js`. Keep `actor-contracts.js`, common bounds/hash domains, active config, V1 formats and runtime registration unchanged. `actor-record-contracts.js` is opened only if a separately frozen public record projection actually needs extension; the authoritative event journal/derived catalog is not a reason to silently widen a closed record. No new standalone helper file or public export without a real consumer and explicit interface decision.

## 4. M1-B: evidence-bound unknown delivery

### 4.1 Separate original outcome, resolution and execution debt

Keep the original `mailbox-disposition` with outcome `unknown` and its exact observation ID, timestamp, owner and payload forever. Add a separate **proposed** `mailbox-reconciled` actor event and a **proposed** `mailbox-delivery-observed` evidence event where existing retained facts are insufficient. Register both in actor kinds, types, closed parsing, fold, forks and views; these are not new kernel kinds.

The reconciliation payload must bind:
- Current Main as recorder; original mailbox key/epoch, message ID, envelope digest and operation-input hash.
- Original unknown observation ID; expected prior resolution ID (null for the first); lifetime-unique reconciliation operation/observation identity and original time.
- A closed resolution kind, with exact typed references to earlier retained delivery/ingress/containment facts and their scope. No free-form reason, source label or naked hash is sufficient evidence.

Evidence records retain original observer, observed time, exact producer/consumer/owner/generation/session/profile, request/reply/correlation/causation identity and content. Target identity comes from the retained envelope, not caller-supplied current actor lookup. Where an ACK names only an operation/command rather than the full mailbox key, require an earlier persisted **delivery-attempt-to-message binding**. Operation-ID equality alone cannot distinguish two envelopes carrying the same command. New service histories must create this binding before attempted delivery; historical missing bindings are not synthesized after a failure.

Names and closed discriminants are proposed here and frozen in P0 before edits. Existing `DispositionReceiptV2` may be used as the outbound result carrier; it is not its own proof. Add only a private mandatory-context adapter if the aggregate needs existing receipt predicates. Keep the public one-argument mailbox validator and facade unchanged.

### 4.2 Proof matrix

| Resolution | Minimum evidence | Effect |
|---|---|---|
| Delivered/consumed by participant | Actual accepted/started producer observation bound to the exact command/control and earlier mailbox-attempt mapping, or an exact authenticated-ingress receipt whose full target binding is retained | Release mailbox occupancy only. Do not mark native run/effects/usage complete or approve the workflow. |
| Delivered/consumed by Main | Exact retained ingress record/committed handling result bound to the original complete control and consumer; rejection is a different outcome | Release transport obligation only; retained supervisor output is not automatically an admitted plan/decision. |
| Rejected before execution | Exact receiver rejection and coverage showing this attempt was not accepted/started; retain contradictory observations | Release only the proven mailbox obligation. Never translate an arbitrary cancellation into receiver rejection. |
| Proven not-sent | Positive trusted transport/admission-closure evidence for the exact attempt; compatible qualified containment and complete relevant retained coverage | Release that mailbox slot. Absence of a `sent` record, expiry, EOF, process exit or actor stop is not this proof. |
| Terminally contained/resolved | Matching producer/attempt; admission closed; genuine native settlement or qualified containment, and the latest complete effect barrier where implementation effects were possible | Resolve transport uncertainty only to the proved terminal outcome. Unknown accounting, review debt and other holds remain. |
| Unsupported/incomplete/contradictory | Missing mapping, foreign scope, unsupported inactive-control receipt, incomplete effect coverage, or only generic `reconcile.evidence` references | Remain unknown/held; no resend, release, fabricated success or archive eligibility. |

P0 must enumerate activation requests, participant-to-Main outputs, and inactive/control traffic (probe/handshake/cancel/reconcile/disposition). Do not force an activation ID onto an inactive message. An inactive case without an actual ingress/transport witness is explicitly unsupported, not silently covered by activation containment. Existing generic kernel `reconciliation-proposed` evidence membership does not independently prove a particular mailbox attempt.

### 4.3 Reduction, retries and late facts

1. Validate current recording authority and exact historical target. Evidence must already exist in the accepted prefix; original observation time may be earlier than receipt time but cannot be future or move between producers. Old-generation evidence may settle its historical obligation without granting current-generation authority.
2. Compare exact retained reconciliation retries before fresh revision/admission checks. Identical retries return no-append noop; changed evidence, time, owner or outcome conflicts. A named prior-resolution link permits a new corrective observation, not mutation of the old one.
3. Derive effective delivery state from original disposition plus qualified reconciliation history. Retain full history and dedup keys. Expose original disposition, resolution identity/status and effective occupancy separately.
4. Release both item and byte occupancy exactly once, in the original lane. Reconciliation does not advance the priority streak or execute the message again. Control reserve remains independent.
5. Reevaluate negative/coverage-dependent proofs when later delivery, settlement or effect facts arrive. Retain genuine late contradictory facts and invalidate the applicable release; show uncertainty rather than rejecting truth or deleting the old proof. If capacity is now exceeded, backpressure new work—do not evict obligations to restore a cosmetic count.
6. Resolve only a hold whose reason/scope and exact uncertainty have been proved resolved. Keep effect/accounting/lifecycle/ownership/review holds independent. A queue release is never permission to dispatch a continuation.
7. Carry originals, evidence, attempt bindings and resolution/tombstone identities through quiescent archives. Unresolved/contradictory delivery continues to block rotation. No relaxation of current cross-segment authority restrictions.

## 5. E2: reviewed structural replanning

### 5.1 Supported policy

Use the already chosen report-boundary policy: actual report, closed implementation admission, genuine native completion or sufficient containment, settled admitted effects, finalized checkpoint and qualified supervisor review. Supervisor plan/review production itself still requires genuine native settlement; a synthetic logical close does not qualify it.

Support reorder/add/remove of not-yet-executed remaining work and explicit replacement/split of the current unapproved step. No-report emergency action remains terminal cancellation/containment. The current selection must be the first executable remaining step: `keep` retains the current ID at the head; `replace` selects its named successor at the head. Approved/executed history cannot be deleted, renamed or rescheduled. Distinct lifetime IDs are bounded to 32 **per workflow**, including retired IDs and any task projections; restarting a task cannot replenish the limit.

Replacing current work requires a named successor that carries review debt. An empty remaining plan is not completion via `revise`; use the existing separately qualified approval/cancellation paths. Revision of feedback alone remains the existing nonstructural `revise` behavior.

### 5.2 Proposed closed structure and linkage

Freeze a version-1 structural proposal containing:

| Field | Meaning |
|---|---|
| `expected` | Exact task ID, workflow identity/revision, independent task/workflow plan revisions, structural plan hash, current step ID, report ID/hash/checkpoint, grant operation, accounting revision, task budget revision/hash and workflow budget revision/hash. |
| `next` | Task plan revision = prior + 1; workflow plan revision = prior + 1. They need not have the same numeric value. |
| `remainingStepIds` | Complete ordered executable remainder; unique, nonempty and within lifetime bounds. |
| `introducedSteps` | Full `{id,title,instructions,acceptance?}` plus explicit `replaces` IDs; preserve omitted versus present optional fields. No description-only substitute. |
| `removedStepIds` | Complete accounting for previously pending IDs absent from the new order; no overlap/omission/history deletion. |
| `current` | `{kind:'keep'}` or `{kind:'replace',successorStepId}`; successor must be introduced, in the new order and inherit the current lineage/debt. |
| `supersedesDecisionOperationId` | Null or the exact retained, uncommitted candidate for the same report; no wildcard supersession. |

Use an optional `change` on supervisor `plan` output. Its existing brief step list must exactly project the proposed remaining full catalog; it is not a second editable plan. Use an optional `planLink` on `review` only for action `revise`. The link names the exact earlier plan activation/intent/input hash/operation/control hash.

**Avoid a circular proof:** plan precedes review in the same supervisor activation. Neither produced payload can name a future native settlement or its own future digest. After that activation settles, the kernel supervisor-control `decide` candidate carries optional `planChange`, containing the exact proposal and the plan link plus its actual settlement observation. Existing reviewer evidence binds the review and the same settlement. Validate all of this against retained controls, not a reconstructed lookalike.

Keep the legacy `DecisionInput` and its `inputHash` unchanged. The existing whole-candidate `intentRef` commitment hash must include the optional structural change and supersession target. Absent fields must stay absent in old V1 hashes/member-order semantics. Old readers must reject unsupported new shapes, not ignore them.

Define the structural hash over a frozen canonical projection in the existing `operation-input` domain: task/workflow plan coordinates, immutable full catalog, executable order/current choice, retirement/lineage and review-debt links. Do not hash mutable caches or timestamps into the structure; accounting/budgets are separately bound by `expected`. Publish the exact projection/order in P0. No new digest domain or larger cap is proposed.

### 5.3 Kernel state and budget lineage

Retain separate structures for immutable step catalog, executable remainder/current selection, plan history, retired/superseded steps, lineage and review debt. Keep original grants, reports, observations and per-step ledgers attributed to their original IDs; `task.steps` replacement alone is insufficient.

Use derived **lineage groups of original step IDs**, not copied balances:
- A fresh unrelated step starts its own group. A replacement/split inherits its predecessor's group; every successor shares that same group allowance.
- A merge, if admitted, unions predecessor groups deterministically, including all existing descendants. Deduplicate original member IDs; never add copied inherited balances multiple times. If merge semantics are not fully frozen/qualified, reject merges explicitly rather than calling them fresh steps.
- Sum original member-ledger consumption once for cap decisions; preserve metric-specific gaps and unknowns. Keep lifetime totals unchanged except genuine new charges. Removing a step never refunds consumption or discards gaps.
- Update `exhausted`, revise admission, aggregate `budgetDenial`, accounting reconciliation and projections consistently. Reconciliation still covers the full original catalog's ledger keys; no replacing retired ledgers with only the active remainder.
- Charge the successful revise once against the original reviewed step/group and lifetime. Count its linked task/workflow revision advance once at workflow level; keep unrelated pre-dispatch plan revisions and other revise charges distinct by original charge identity.
- Keep assignment time, absolute lifetime deadline, participants, workspace, policy, limits, verification and configuration unchanged. Structural changes are not human budget amendments.

### 5.4 Candidate supersession and atomic commitment

A replacement candidate must first pass intrinsic structure and current evidence checks. Atomically retain it and mark the specifically named old uncommitted candidate superseded. The same-report old identity remains retained forever. No other candidate or committed decision may be displaced, and a failed replacement cannot kill the old candidate.

`intentReady`, candidate admission and commitment must consult supersession state, including public standalone kernel replay. An exact old candidate/commit retry cannot resurrect it. Actor-prefix denied commitments remain denied even if lifecycle/accounting later recovers; neither a new mirror nor a resolved hold can repair a historical denial.

At successful `intent-committed`:
1. Recheck expected task/workflow/plan/accounting/budget coordinates, owner/producer eligibility, report/grant/barrier/checkpoint freshness, complete inspection, proposal/review linkage and native settlement.
2. Consume the report once; retain old current work as superseded, not approved; install the new catalog/order/lineage/review debt and advance both plan revisions.
3. Charge once and create the exact continuation obligation in the same tentative fold. On failure, publish none of these mutations.
4. Synchronize actor plan state only when the kernel commit applied **and** the actor-prefix gate admitted it. `decision-recorded` remains an observational mirror, not a second commit gate. Extend accepted-plan producer exemptions narrowly to the exact committed structural plan; do not globally relax stale plan-revision checks.
5. The next implementation attempt needs fresh grant/attempt/lease, authority publication, prompt reservation and delivery. Old attempts retain the old plan revision. A committed plan is not permission to reuse them.

Revise does not advance `taskBases`/approved workspace identity. Transfer all unapproved changes/reports to the named successor; future approval needs all-scope evidence from the last approved base through the actual final checkpoint, not only the latest step's delta.

## 6. Compatibility, bounds and implementation rules

- Keep the existing 27 kernel event kinds; extend only the supervisor-control decide branch. Main-decision, plain revise and old initial plans retain their exact behavior/serialization.
- Add actor event kinds only for the explicit mailbox protocol. Mechanically check registrations, parser variants, public projections and rejected unknown fields. Do not expose a new runtime tool or config switch for an unintegrated model.
- Standalone kernel validation intentionally uses its historical unmetered scope; integrated validation must keep the caller's registered context. Use existing scoped parsing/traversal helpers and equivalent closed predicates. Do not route an integrated branch through a public validator that creates a fresh budget, or require an absent context on old standalone calls.
- Retain current node/byte/depth/event/work/reference caps, including 16 references. Real inline content pays real capture/hash/copy/publication costs. Two inspection chains plus replan/reconciliation must be checked in one public history; no reference exemptions or fabricated locators.
- New derived fields must survive fork, full replay, incremental append, caller-cache reconstruction, immutable publication and archive carryover. Return informative unsupported/held outcomes for missing historic proof, not synthesized evidence.
- Scope edits by stopped slice. Wire/model may change for MB; kernel/wire/model coordination is mandatory for E2. No overlapping writers on these files.

## 7. Acceptance ledger for implementation

All rows are **OPEN** until actual implementation and permitted checks witness them. Use public validators/reducers and genuine prerequisite events; no private injected cache accepted as a positive path.

| ID | Concrete check |
|---|---|
| M01 | Unknown remains occupied; exact positive participant/Main receipt releases its original count/bytes once; unrelated effect/accounting/review holds remain. |
| M02 | Wrong message/epoch/owner/generation/command/input, missing attempt mapping, future/moved observation, and forged receipt/reference cannot resolve delivery. Historical-generation facts cannot authorize current work. |
| M03 | Evidence-backed not-sent/rejected/contained paths succeed for supported kinds; timeout/EOF/stop/cancel/no-sent-record/incomplete barrier alone fail. Inactive/control coverage follows the explicit proof matrix. |
| M04 | Exact reconciliation retry is no-append noop; changed original time/content/owner and observation reuse conflict; dedup and fairness history survive release. |
| M05 | Late contradictory facts are retained, invalidate inadequate negative proof and reestablish uncertainty; capacity backpressures rather than evicts; no automatic resend. |
| M06 | Both directions/lanes, reserved control capacity and unknown archive blocking remain correct; reconciled quiescent archive preserves evidence/tombstones through two rotations. |
| M07 | Full replay = incremental append; forged resolution/released/cache fields reject; failed append leaves its input unchanged; unrelated source/config untouched. |
| R01 | Real report-boundary keep/reorder/add/remove/current replacement/split commits the exact complete plan; instructions and acceptance criteria survive. Merge is either fully lineage-qualified or explicitly rejected. |
| R02 | Reused/33rd lifetime ID, incomplete partition, mutation of old content, removal/rescheduling of approved history, missing current successor and no-report replan reject. |
| R03 | Every stale expected revision/hash and changed budget/accounting between candidate and commitment prevents application without partial plan/report/counter mutation. |
| R04 | Repeated splits/replacements and any supported merge share consumption/gaps; caps and deadline are not reset; workflow revision charge is counted once, unrelated charges remain distinct. |
| R05 | Named valid replacement supersedes only its uncommitted same-report predecessor; invalid replacement is atomic; superseded candidate and late commitment never regain eligibility. |
| R06 | Crash/replay before commitment retains old plan; after commitment applies once; duplicate commitment does not consume/charge/advance twice; next attempt uses fresh identity and new revision. |
| R07 | Genuine same-activation plan → review intent → actual inspection request/reply/receipt delivery → native completion → candidate/commit links exactly; reordered/foreign/missing/late/unsettled proof and fake hashes cannot authorize structure. |
| R08 | Actor pause/stop/off/owner/generation/expiry holds gate both candidate and commit; admitted observation mirrors do not resurrect superseded/held commitments. |
| R09 | Replaced unapproved work remains review debt, approved base stays unchanged on revise, and later all-scope approval covers the complete carried delta. |
| R10 | Lineage/history/debt/supersession survive fork/cache checks and quiescent archives; legacy Main decisions/ordinary revise hashes and behavior remain unchanged. |
| Q01 | Full root → submission/authority/plan → dispatch/report → actual inspection/replan → fresh continuation/report/approval → mailbox resolution/closure/archive runs under unchanged caps, with two real inspection chains. |
| Q02 | All configured production roots compile; requested kinds/fields/private helpers/facade/config/packaging are mechanically checked; fresh stopped-source review findings resolved. Pinned/native/Host evidence remains explicitly separate. |

## 8. Planning verification and next action

This plan follows the live reducers, not just historical proposals. The planning pass fingerprints all 24 production source files and verifies documentation links/whitespace after edits. It does not run model behavior or claim new compiler/native results.

**Current next implementation action:** M1-B/E2 source has landed under P0, and the [Q01 inline-retention correction](Q01-INLINE-INSPECTION-CHECKPOINT.md) now passes the full acceptance-bearing two-chain archive requirement under unchanged caps. Proceed to fresh F1/T09/T10 before Host cutover. The earlier MB/RP sequence above is implementation history, not an instruction to reimplement delivered source.

# AR3-T08 — Partial candidate and completion-gap ledger

**BLOCKED, not accepted. T01–07 remain accepted (7/10); T09/T10 have not started.** This is a source/static gap record, not a runtime test result or a completed AR-03 freeze.

## Ownership and snapshot

- Completed writer: `c8445b62d6dd47428e6ba70910a9c7b0`, retained `zro/deepseek-v4.1-flash`, high. Its full report explicitly declares partial delivery; reported workflow budgets/amendments/deadlines and concrete event types are unfinished.
- Assigned production file: `src/actor-model.js`. Historical C2 checked SHA `3b20e31337c1aa441c499a34bb16b8d71b1c503f1b9de88fceb60e8f2b443aaf`: [bounded C2 content linkage](AR3-T08-R3-C2-FINDINGS.md), 0 owned diagnostics, 44 isolated outcomes and preserved frozen/protected boundaries. Reversing its 35 replacements restores verified C1 `5f816703…`. Whole-public-path/work qualification remains partial.
- Read-only Astra completion-gap auditor `c1485c5245b84b0f89efe72725c08274` completed with **BLOCKED**, independently confirming M1–M8 and adding the requirements below. Its full report was collected. It ran no commands and did not re-audit every frozen leaf/kernel branch. This is **not T09**. The original writer and auditor are both stopped; the live task ledger records any subsequently assigned correction run.
- Current model candidate: **T08-LA stopped**, with [Main's compiler/correction checkpoint](T08-LA-TYPES-CW-CHECKPOINT.md). [Read-only bounded LA review](T08-LA-REVIEW.md) stopped BLOCKED, not T09. C6-KA and TYPES-INTEGRATION are now STOPPED: [Main's exact checkpoint](C6-KA-TYPES-INTEGRATION-CHECKPOINT.md) records 21 bounded accounting/replay/aggregation outcomes, 43 validation/evidence/telemetry outcomes and zero supplemental diagnostics over all 24 roots. They do not close the full path/resource/lifecycle/mailbox/archive gates. [The completion ledger](COMPLETION-EXECUTION-PLAN.md) records any next owner; earlier findings remain historical, not blanket acceptance.
- Governing checks: [T08 task](AR-03-AGENT-TASKS.md#t08--implement-canonical-actorworkflow-composition), [accepted kernel handoff](AR3-T07-HANDOFF.md), [leaf handoff](AR3-T06-HANDOFF.md), [D1–D6](AR3-01-DECISIONS.md), [testing policy](TESTING.md).

## Bounded correction checkpoints — R2, C1 and C2 verified

R2 F1–F4 and C1's metadata-overclaim rejection are preserved. [C2 `3b20e313…`](AR3-T08-R3-C2-FINDINGS.md) adds the earlier task base, exact native identities and complete supported structured before/after material behind real inspection references. Main verified 44 isolated outcomes and 0 owned/350 unchanged baseline diagnostics. This is not native Git-diff authentication or whole-public-reducer approval qualification: C2-7/8 and R3-8 remain partial. Full T08 and broader gates stay open.

## R1C verified baseline — six focused corrections verified by Main

Astra `1703d39bf30c4c639f85c5292f61e8bf` (`openai-codex/gpt-6-astra`, high) delivered a nonempty handoff after 369 seconds and stopped. Main collected the terminal result (19 turns, 18 tool calls, exit 0), reviewed the changed paths and inspected the actual log. Only read/grep/edit surfaces were used. Two focused `pi.edit` calls changed only `src/actor-model.js`; one failed grep was corrected. No shell, write, script, test or project ESM execution occurred in this run.

**Verified R1C source:** SHA `89974e46c09586ec8879ec79ca3aa19ea3b8cccf20db56b0d05f38809f934e4e`, 90,926 bytes. Reversing all 24 logged replacements in memory exactly recovers starting `3d581a2eed60b010974d96c6178160a8106b797eddc4b074aaba3094d02bb03b`. This is the verified baseline, not a hash assertion about R2's moving source.

| Focused acceptance item | Main's source/static evidence |
|---|---|
| 1. Four diagnostics and draft debris | CLOSED for this patch. Placeholder removed with real `deepFreeze` JSDoc retained (259–271); `parseActorPayload.c` typed (309–310); unsupported ternary and duplicate operations assertion removed (440,926). Full-source attribution reports **0 actor-model diagnostics**, down from 4. |
| 2. Reject forged/missing/extra envelope caches | CLOSED for this patch. `reconstructModelInContext` (1038–1050) captures before access, distinguishes root from actual envelope, closes all nine envelope keys, requires `nonAuthorizing:true`, reconstructs with the same context and compares all seven caches (`genesis/events/actor/workflows/mailboxes/accounting/implementation`). Mismatch produces structured expected validation failure; reducer converts it to a frozen rejection. No cache is a second registry. |
| 3. Deep immutable publication | CLOSED for this patch. Parsed events/root, copied hold scopes, workflow/mailbox arrays, aggregate/kernel projections and legacy output are deeply frozen (454–489,968–1020,1075). Every reducer wrapper is frozen (1110–1143), and successful/hold/noop models come from the deep-frozen builder. Common capture (317–369) copies caller values into private frozen records; no caller input is frozen or mutated by publication. |
| 4. Deep-readonly public types | CLOSED for this patch. Concrete `DeepReadonly<T>` maps kernel Genesis/TransitionEvent/CoordinationModel (79–87), while mutable fold maps/records remain private (172–187,578–588). Local collections are typed and the unchecked fence downcast is removed. Five selected return aliases and required context parameters remain intact; no frozen ABI change. |
| 5. Hold-scope scalar | CLOSED for this patch. Closed hold scope uses accepted `id()` for `scope.id` without the old whole-scope assertion (418–422). |
| 6. Honest limits | CLOSED for this patch. Header/equality/fairness/reserve comments explicitly retain unpaid aggregate work, separate reserve context, missing fairness service history and validated V1 equality reach (17–31,238–242,874–876,1119–1121). Kernel original-order hashing is unchanged. |

Main independently ran `node --check`, whitespace checks and inline static compiler/AST/hash inspection **after the writer stopped**, without loading project ESM or writing check scripts:

- Syntax and tracked/untracked-source whitespace: pass.
- Supplemental TS **6.0.3**, unchanged full config/resolution overrides: **24 roots / 350 source diagnostics / 0 actor-model / 0 dependency-global**, exit **2**. All 350 pre-existing diagnostics retain fingerprint `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. This is not a passing project build; the pinned-compiler availability issue is not repaired.
- Exact five runtime exports, arities **2/3/2/1/3**, selected JSDoc return names and required parameters: pass. No incoming production import and no cycle in the composition dependency closure.
- All six frozen contract hashes plus both kernel hashes match. Protected 19-file digest remains `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`, preserving active versions/defaults/config/registrations/guard.
- No external ABI need for this focused patch. No behavioral test, probe, native qualification, independent T09 review or runtime activation is claimed.

**R1C disposition:** Main verified the six-item foundation correction by targeted source/static review, not full M1/M8/T08. M2–M8 semantics remain open. R2 now owns the next bounded prefix/producer/commitment stage under its separate acceptance ledger. **7/10 accepted; T09/T10 unstarted.** Outside-file seams must be evidenced before edits.

## R1B delivery — no edits; subsequent Astra transfer approved

Owner-approved edit-only R1B `a3640b2a56fb4d34a5523d5a869121c3` (`zro/deepseek-v4.1-flash`, high) ended after 22 seconds with an empty result, process exit 0, six turns and five tool calls. Four calls successfully read repository docs/source. The fifth contained malformed TypeScript read orchestration (`offset:221].`); the tool rejected it before execution. The last assistant content was thinking-only “Typo. Continue.” No correction or usable handoff followed. This was not a tool-permission denial.

Main collected the terminal result and inspected the actual five-call log: no edit/write/shell call occurred. Main independently reconfirmed `src/actor-model.js` SHA `3d581a2eed60b010974d96c6178160a8106b797eddc4b074aaba3094d02bb03b`. The four known owned diagnostics and six foundation findings below are unchanged; no compiler rerun was needed. R1B introduced no new script or source delta. Do not confuse its empty delivery with the earlier R1 script-policy violation.

Evidence: `/var/folders/h9/04n59szn6793rg31xhy64b400000gp/T/pi-fabric-runs-vC3Y1R/a3640b2a56fb4d34a5523d5a869121c3/events.jsonl` and collected terminal envelope. The stderr also reports an initial mesh-publish warning, but reads succeeded; that warning is not established as the cause of the empty delivery.

**Subsequent owner decision:** “do next” approved the Astra edit-only transfer. Main launched fresh T08-R1C, which delivered the focused patch and is now terminal. The current checkpoint above records Main's verification. R1/R1B were not restarted; full T08 semantics and T09/T10 remain gated.

## R1 stopped snapshot — partial, historical evidence

R1 `edb684db01294e6995adbbca7535b59e` (`zro/deepseek-v4.1-flash`, high) ended after 608 seconds, process exit 0, but its final text was only “The draft had a typo and was incomplete. Let me write the complete, correct file.” That is not a usable handoff, precise ABI request or completed assignment. Do not resume/restart this terminal run.

Main read the **entire actual 1,129-line, 89,329-byte source** at SHA `3d581a2eed60b010974d96c6178160a8106b797eddc4b074aaba3094d02bb03b`. The full write succeeded; subsequent correction attempts failed on malformed tool code or mismatched exact anchors. This is substantive partial code, not an empty scaffold, but the promised final correction did not land.

### Main's R1 static evidence (historical; superseded by R1C above)

- `node --check src/actor-model.js`: pass. No project ESM load.
- Full existing-config supplemental TS6.0.3, documented resolution overrides: **24 roots / 354 source diagnostics = unchanged 350 baseline + 4 actor-model / zero dependency-global**, exit 2. This is not a project pass. Main used inline compiler API, not the worker's generated script.
- Owned diagnostics: **TS8024×2 at line 250** (`value` and `seen` JSDoc attached to a zero-parameter placeholder), **TS2322 at 251** (`deepFreezePlaceholder` returns undefined as generic T), **TS7006 at 301** (`parseActorPayload` parameter `c` lacks a context annotation).
- Other-source diagnostic fingerprint remains `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`.
- All six frozen contract and both accepted kernel hashes match T06/T07. Protected 19-file digest remains `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`.
- AST still finds exactly the five exports with arities 2/3/2/1/3; no incoming production consumer. Active versions/configuration/registration files are preserved by the protected digest. No independent reviewer has accepted this R1 snapshot.

### Witnessed foundation progress and remainder

Progress: 18 concrete actor payload branches and typed views/fold records were added; ID/hash imports and the replay receipt set now exist. The reducer captures its event/model before property reads. Kernel parse seams narrowly adapt the expected kernel error class. Payload construction and kernel projections now call a recursive freeze helper. Hold/non-file scope records are closed, text checks scalar-valid UTF-8 bytes, and V2 equality is property-order insensitive. These are source observations, not executed behavior checks or closure of M1/M8.

Corrections required on historical R1 `3d581a2e…`, with original line numbers (all six subsequently corrected and verified for R1C above):

1. **Four actual compiler errors remain** at 250–251/301. Remove the unused placeholder without breaking the real helper's JSDoc and type the real context argument. Do not suppress/exclude/cast around errors. Simplify the leftover unsupported-category ternary at 431 and duplicated operations-counter assertion at 915–916 rather than preserving draft debris.
2. **Model envelope caches are still ignored** (`modelStateOf`, 1026–1033). It checks only `nonAuthorizing` then extracts `.state`; extra keys and missing/forged `genesis`, `events`, actor/workflow/mailbox/accounting/kernel projections are never closed or compared. Capture first, close the actual returned-envelope form, rebuild and compare every supplied cache under the same operation, without accepting a second registry or mutating caller data.
3. **Published values remain mutable**: `deriveViews` returns ordinary `view` and `mailboxes` arrays (958–988), inserted directly into the shallow-frozen aggregate at 1009. Generated stale-owner hold scopes (788) are also only shallowly copied into published holds (972). Every reducer result wrapper at 1094–1125 is an unfrozen object. Complete deep immutable publication for every apply/noop/hold/reject path and nested model value; a readonly annotation is not runtime freezing.
4. **Readonly public types remain shallow across kernel data.** `KernelGenesis`, `TransitionEvent`, `CoordinationModel` are imported mutable kernel types (76–78; kernel 49,62–64) exposed inside public payload/events/views (94,119,151,154). Add concrete deep-readonly publication types without widening frozen kernel signatures, broad casts or making mutable fold records public. Audit untyped local collections too.
5. **Hold scope ID type/runtime mismatch**: `HoldScope.id` is an `Id` (82), but its constructor validates only unrestricted bounded text and casts the whole scope (413). Apply the actual scalar validator required by that closed type; do not conceal unvalidated values behind assertions.
6. **Correct unsupported completion claims in source comments**: the header asserts a whole-operation budget (20–21), yet ordinary reserve encoding still starts a fresh context (1103) and derived/kernel work remains uncharged; `nextFair` still has no persisted service history. Structural equality must not be described as never reaching V1 data when it compares complete validated implementation events. Kernel decision parsing independently checks its original-order input hash (`coordination.js:360`); preserve that behavior—no newly demonstrated V1 hash failure is claimed here.

The original **M2–M8 semantic blockers remain open**, including full-witness receipt parsing at 105/384, bare-layer/archive-only inspection, end-of-fold kernel replay, incomplete producer/reservation/budget/mailbox/archive behavior and aggregate budget accounting. Clearing these four diagnostics alone does not complete even the R1 foundation, much less T08. No new precise private-ABI dependency was delivered.

### Worker scope incident and recovery gate

The completed run's tool log confirms that call 15 **wrote `/tmp/tscheck.mjs` and executed it**, and call 23 executed it again. This violates the explicit no-generated-check-scripts and exclusive-source-write instructions. Do not cite either script invocation as permitted acceptance evidence or claim no such script was written. Main's current compiler counts above were independently obtained through permitted inline compiler API.

Evidence: `/var/folders/h9/04n59szn6793rg31xhy64b400000gp/T/pi-fabric-runs-vC3Y1R/edb684db01294e6995adbbca7535b59e/events.jsonl`, tool calls 15/23; failed final edit calls 25/26/29; successful source write call 22. Main did not execute, reuse, modify or remove the temporary script. Its prior existence/contents are not established, so do not delete it as automatic cleanup.

**Recovery history:** the earlier approval launched same-model edit-only R1B, which ended without edits/result. The subsequent “do next” approved Astra R1C, now delivered and checked by Main. No completed run was resumed. Main retains static checks/shared/docs. The original temporary-script incident remains recorded; no authorization to use/delete that script or expand tools.

## Main's initial-candidate static evidence (70ed005e…)

On the stopped snapshot, without importing any project ESM:

| Check | Result |
|---|---|
| New-file syntax / repository whitespace | `node --check src/actor-model.js` and `git diff --check`: pass |
| Six frozen contracts and both kernel hashes | All match the accepted handoffs |
| Protected 19-file digest | `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`, unchanged |
| Runtime exports / arities | Exactly `validateActorStateV2`/2, `projectLegacyWorkerView`/3, `validateActorWorkflowModel`/2, `validateActorWorkflowEvent`/1, `reduceActorWorkflow`/3 |
| Incoming source imports | No production module imports `actor-model.js` |
| Full supplemental TS 6.0.3 | Existing config, documented resolution overrides: **24 roots / 369 source diagnostics / 19 actor-model / 0 dependency-global**; exit 2 |
| Other source diagnostics | Same 350 baseline, fingerprint `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730` |

The 19 new errors comprise TS2304×3, TS2339×6, TS2345×2, TS7006×4, TS8024×2 and TS18046×2. Examples: missing `validateId`/`validateHash` imports (120/122/878), nonexistent `ReviewerWitness.scope` (386), nonexistent replay `receipts` (588–589), `never[]` collections, unknown `p.scope`, implicit-any callbacks, and JSDoc parameter mismatches (132/862). Syntax is not enough to establish a working validator. The pinned compiler is still unavailable; no install was attempted. A compiler build alone would not close the following source findings.

## Initial-candidate source findings — historical M1 evidence; M2–M8 remain open

Main read the complete initial candidate and relevant accepted capture/usage/kernel interfaces. These findings are source-derived, not executed counterexamples, and their line numbers refer to `70ed005e…`. R1/R1C correct the focused boundary/type/immutability defects; current verification is recorded above. M2–M8 and independent review/refinements remain open, so historical wording below is not a claim that R1C still has the original 19 diagnostics.

### M1 — P1: public input/type/immutable-output boundary is incomplete

`id`/`hash` reference unimported names; inspection references an uncreated `receipts` set. Public event payload and workflow views use broad `Record<string,unknown>` instead of concrete discriminated readonly records (74–91,157–287). `createReplay` has untyped maps, which conceal unchecked cast-driven data flow (429–437). The reducer reads `model.state` before inert capture (919–925), allowing accessors/proxies to run. Returned event payloads and many nested derived records are only shallowly frozen (300–309,816–859); `parseScope`/hold scope do not consistently close keys. Correct the real constructor and boundary, not just compiler annotations or casts. Do not suppress diagnostics or expose invented checked-input markers.

### M2 — P1: actor/kernel correlation is not validated at historical prefixes

Implementation-domain events only check the outer owner/fence and append to a per-workflow list (455–465); the kernel is invoked after the entire actor fold (416–424). A workflow can therefore be supplied later, and later actor facts do not gate the original kernel admission/commit prefix. Conversely, actor report/decision paths maintain a parallel workflow truth without binding to the actual kernel report/decision result (556–618). Supervisor kernel `decide`/`intent-committed` can bypass the actor-domain settlement checks. Advance one kernel projection at each root prefix, enforce the concrete actor-to-kernel mapping then and again at commitment, and derive actor application from retained kernel facts rather than a second implementation reducer.

### M3 — P1: issuer, reservation, lifecycle and settlement enforcement is incomplete

Many branches check only a role or actor ID, not the complete registered actor/model/session/generation/current owner/branch. `plan-recorded` applies without a producing activation/intent/settlement; `answer-recorded` accepts a settled supervisor activation without full issuer/intent binding (486–500,539–552). Supervisor activation admission has no per-actor reservation check; implementer admission only checks the named actor's unsettled count (501–520). Native settlement immediately frees `openActivations`, despite unresolved effects/uncertain dispatch (442,522–531). Holds are recorded/resolved but never gate admission; disabled/stop state is not represented and actor views always report enabled/no holds (628–652,835). Several late actor events can reset a terminal workflow's phase, and initial/revised plans/escalation are not a complete vertical path. Add closed authority/operation/state transitions, independent obligations/holds and absorbing terminal behavior with actual producer settlement before application, without requiring future settlement for receipt retention.

### M4 — P1: inspection path is both unreachable and under-validated

`inspection-recorded` requires a full `ReviewerWitness`, including future producing settlement, instead of the settlement-free retained link (242–251). Resolution only reads archive artifacts; the required empty initial archive context has none, so the first workflow cannot inspect (365–400,740–751). It compares `request.scope` with nonexistent `review.scope`, rejecting normal checked scopes. Resolved contents are not closed against the accepted T04 shapes and do not bind request/reply byte counts, reply/receipt scopes, deadline/evidence/delivery (365–400). Decision matching chooses any receipt with report/checkpoint rather than the complete activation/intent/actor/operation/artifact chain (594–618). Provide a bounded current-segment retained-artifact path and exact accepted content validation at the correct earlier prefixes; do not widen the frozen archive schema or fabricate settlement. Report a concrete missing helper dependency if truly needed.

### M5 — P1: workflow budgets and observation accounting are unfinished

`lifetimeDeadlineAt` is stored but not enforced; no workflow policy/limit amendment event exists (93,161–174,475–484). `deriveUsage` deduplicates by caller usage ID instead of the full original producer/observation identity, omits implementer input usage, loses implementer cost from per-workflow views, and never propagates gaps into their hardcoded `causesUnknownCost:false` (790–842). Supervisor observation IDs are discarded by the fold (619–626). Enforce immutable workflow/task/step ledgers, absolute deadlines, explicit authorized amendments and a correctly scoped union with unknown accounting retained. No fabricated zero/completeness or reset on resume.

### M6 — P1: mailbox occupancy, fairness, dedup and reserves do not implement D3

Admission trusts declared `bytes`/`payloadHash` without a retained envelope/content (197–204,663–690). Reserved control is only a lane/priority label; no closed cancellation/failure/reconciliation payload table or required-result reservation exists. Dedup compares only payload hash/epoch, not the full immutable target/operation/envelope. Disposition sets `released` but count/byte admission still charges every historical entry, so occupancy never frees (677–687,695–716). An `unknown` disposition cannot later be reconciled to a terminal disposition. `nextFair` recomputes from current ready order, with no persisted serviced cursor or eligibility checks (723–734). Root `ordinaryEvent` grants reserve access only to control enqueue, so actual dispositions/settlements/stop/reconciliation can be blocked at ordinary exhaustion (906–941); serialized-root validation also lacks the same admission gates. Implement count/actual-byte occupancy and disposition-before-release while retaining history, bounded full-key dedup, persisted fairness, and a closed reserve-consuming control/disposition table.

### M7 — P1: archive and legacy continuity checks are incomplete

Archive folds receive one map containing all context artifacts, without prefix availability checks (751–763). Checkpoint actor validation is only `actors.length >= 1`; dispositions/obligations and quiescence are not compared to derived history (775–784). `replay.operations` is never populated; arbitrary larger unknown-spend counters are accepted. The current replay is reinitialized without carrying applicable archived obligations/holds/accounting/identity state. Legacy projection reads a cast of the implementation genesis, ignores retained histories/obligations, and emits empty reference arrays with `known:true` (876–890). Bind every exact checkpoint field to checked historical results, require allowed rotation/quiescence, retain unknown spend rather than certify arbitrary counters, and derive complete inert legacy diagnostics/references from verified canonical history.

### M8 — P1: there is no single operation budget over replay and derived values

`buildModel` starts a context each time; `reduceActorWorkflow` independently validates the event, base, candidate and ordinary encoding with separate contexts (847–859,918–952). Derived state/views/kernel representations are never charged in the shared context. Every inspection reference is decoded again from raw text, even if migration already charged that explicit source (365–376,740–763). The common helper's paid-source association applies only to its own captured/constructed results (common:317–440); it does not bless arbitrary local result objects. Preserve shared capture across the entire public operation, charge bounded derived work, enforce the per-event/envelope ceiling as well as aggregate limits, and avoid double charging original bytes. A frozen kernel's internal validator is not proof of aggregate boundedness; report any exact missing ABI instead of bypassing this requirement.

## Independent completion-gap audit — complete, BLOCKED

Astra `c1485c5245b84b0f89efe72725c08274` read the complete candidate, both complete handoffs, decisions/runbook and relevant accepted source. It independently confirms M1–M8. Read/grep/find only; no command, write or behavior execution. Compiler/hash results above remain Main's evidence. The reviewer confirms correct `ensureInert(value,path,context)` argument order, same-context builder config validation, exact five exports, no active consumer, unchanged active formats, and class-specific catches that must be retained.

Required additions/refinements to the grouped findings:

- **M1:** public parse boundaries also leak expected `CoordinationValidationError` without contract `code/path/category`; adapt them narrowly. Kernel projections are mutable and must be included in deep result validation/immutability. Guard resolved JSON as a non-null record before `Object.keys`. There is **no undefined-context finding**: TS2304×3 is the missing ID/hash helper references; line 862 is only unmatched JSDoc.
- **M2:** the reducer discards kernel `hold` and can return `apply`, while actor-side hold returns the old model without retaining a required held fact. Preserve both atomicity and required retained observations. The kernel already validates its own prefixes; the missing checks are actor correlation at those exact prefixes and commitments.
- **M3:** bind definitions/config hash/workspace/assignment/kernel fence as well as IDs. Retain actual target actor, command/profile/nonce/input/control/grant/identity and independent dispatch observations, not asserted intent IDs/hashes. Keep settlement time/phase. Enforce global operation uniqueness, reason-specific hold resolution and complete question/answer content. Preserve review/blocker/cancellation/delivery/containment obligations, not only unanswered question IDs. Main cancellation, revised plan/step progression and escalation must be reachable.
- **M4:** T04 artifacts are **`{content,digest}`**, not bare content; the candidate hashes the wrong decoded layer. Add retained current-segment artifacts rather than relaxing the explicit empty archive-context schema. Correct actor inspection rejection does not secure kernel receipts while M2 permits bypass. Preserve all-scope/current-checkpoint approval predicates and exact supervisor operation versus kernel decision operation namespaces.
- **M5:** duplicate observation under a new usage ID currently double-charges; colliding supervisor/implementer IDs suppress real implementer spend. Bind original producer/observation and metric scopes, retain provenance/gaps/lower bounds, enforce checked aggregate arithmetic and immutable workflow/task assignment mapping. Never replace unknowns with zero or certify larger arbitrary counters.
- **M6:** require globally unique message IDs and target/issuer-authorized dispositions; include full producer generation/session/operation/envelope in dedup. Persist actual service history, eligibility and control priority. Root validation must repeat every admission/reserve rule, not only reducer appends.
- **M7:** compare checkpoint owner to final replay owner and held-legacy references by full hash/reference, not names. The migration leaf already checks raw hashes, declared chain/rotation/retention continuity; do not rewrite it to compensate for missing aggregate semantic crossbindings. Prove quiescence before rotation and preserve applicable identities, counters, unknowns and retained obligations in subsequent views/admission.
- **M8:** distinguish separately supplied occurrences from reuse of an already checked occurrence. Charge actual derived representations and prefix work without fresh-budget resets or re-decoding/re-hashing an already paid original occurrence. A standalone bounded kernel call is not aggregate-budget evidence.
- **P2 / cross-cutting:** public payloads/views and internal collections need concrete discriminated readonly types. Close hold and all scope branches; use strict UTF-8 text ceilings and bounded structural/canonical equality for V2. Property-order-sensitive `JSON.stringify` equality is wrong for equivalent V2 bindings. **Original V1 property-order/hash behavior must remain unchanged.**

### Concrete private-ABI disposition

No frozen-file edit is authorized by this review alone.

- Common already exports `validateId`, `validateHash`, same-context capture/config helpers and `projectKernelAssignment` (`common:956`). Missing imports, model receipt state, assignment mapping and current-segment artifact retention are model defects, not absent ABI.
- Wire's public `validateActorControlV2(value,expected)` and `validateMailboxEnvelopeV2(value)` always create standalone contexts; context-aware `control`/`inspection` are private (`wire:299,520–551`). Records expose only standalone wrappers (`records:940–956`). If the correction needs direct same-context reuse, report exact private entrypoints, required expected-binding argument and types to Main before changing any accepted module.
- Kernel has no exported shared-context/incremental-prefix API. Demonstrate bounded composition around existing APIs or specify a minimal private seam. This does not authorize rewriting accepted kernel semantics.
- Common's private derived-result association does not justify a generic caller-controlled “trust/credit this result” API; no necessity for that widening was established.

### Bounded correction sequence

One explicitly assigned writer and one stopped-snapshot stage at a time. The owner approved Astra for R1C after the DeepSeek deliveries; R1C is complete for its focused six-item patch, not the entire sequence:

1. **R1 — technical foundation:** focused constructor/type/capture/immutability corrections are now verified by Main at R1C `89974e46…`, with 0 owned diagnostics. No outside-file ABI was needed for this patch. This is not full M1/M8 or T08 acceptance; retain the original boundary requirements for subsequent changes.
2. **R2 — bounded prefix/correlation patch:** verified at `b5288b20…`, including focused F1–F4. Historical producer records, per-prefix commitment correlation and validated publication witnesses are implemented; no full M2/T08 or runtime qualification is inferred.
3. Current-segment inspection and full vertical path.
4. Lifecycle/obligations/reservations plus immutable budgets/accounting.
5. Mailbox occupancy/dedup/fairness/reserve classification.
6. Archive quiescence/carryover/checkpoint/legacy projection.
7. Main's stable-snapshot static/preservation checks and independent source closure; only a genuinely reviewable complete checkpoint may enter T09.

Later stages may be coalesced where their implementation is inseparable, but not silently reassigned or claimed closed by foundation-only work. Main owns schema/ABI integration decisions. No source writer overlaps another or a mutable-snapshot reviewer.

## Next gate

**Current gate:** the user's complete-all instruction authorizes [the staged completion scope](COMPLETION-EXECUTION-PLAN.md). C4's bounded seam is checked; T08-LA/TYPES-CW delivered stopped candidates. LA source review stopped with concrete blockers; C6-KA accounting and final validation integration are active; the prior zero-edit loader failure is documented in the completion ledger. Earlier runs stay terminal. Mailbox, archive and complete public-path/fit obligations still follow, before T09/T10 and AR-04–08. Seven accepted tasks are the last stable baseline, not new moving-source acceptance.

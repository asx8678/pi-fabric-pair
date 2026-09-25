# Next 10 implementation tasks — AR-03 agent fan-out

**Status: seven AR-03 tasks accepted at the historical baseline; T08 remains partial, T09 attempted but blocked, T10 not opened.** The user requested **complete all**. The [current completion ledger](COMPLETION-EXECUTION-PLAN.md) owns live status; older slice reports below are historical. Q01 has complete bounded public-model evidence. The [T09 checkpoint](T09-FOUNDATION-REVIEW-CHECKPOINT.md) records three failed read-only reviewer transports with zero source access, actual mechanical/package results and Main's MF-01/D5 legacy-projection finding. [MF-01 is now source-corrected](D5-LEGACY-PROJECTION-CORRECTION.md) with 25 bounded public outcomes and zero 24-root supplemental diagnostics; a fourth fresh reviewer failed before source access. The [held-carrier amendment](D5-HELD-CARRIER-CONTRACT.md) also now passes 39 bounded outcomes and the supplemental compiler; a fifth fresh reviewer failed before source access. Independent D5/foundation closure remains open. All source writers remain stopped. No independent T09 acceptance or runtime qualification is claimed.

### T07 accepted kernel checkpoint

**ACCEPTED for T08 handoff** at `coordination.js` SHA `ccd59af0d175158c209f8dbcb4d34dda6a034c35bedf3d0ea8942d13fd703b81`; transitions remains `03b01e30…`. Independent whole-kernel correction reviewer `afa8bad5436e4636b123483a8a82f8da` closed F1/F3/F4/F5 on `b252070b…`. Same-owner `88621cb110a54e6886e897f46236b905` made only the remaining common-validator import/link calls and accurate comment; Main's exact inverse reconstructs `b252070b…`, preserving all other reviewed bytes. Independent F2-only reviewer `2ddb6179dac4488d943fec01ef222674` ACCEPTED that delta with no remaining finding. Combined review, source walkthrough and static evidence close the bounded T07 task; full actor-domain historical replay remains T08, not an already qualified behavior.

1. **T07-F1 / P1 — CLOSED by `afa8bad…`:** outer `parseEvent` admits `review`; exact branch checks still reject it for Main and unrelated events. Supervisor-control requires the full witness.
2. **T07-F2 / P1 — CLOSED by `2ddb617…` plus Main exact-delta proof:** the 14-field settlement-free link and full decision witness remain separate. Only `reviewLink` now uses accepted `validateActorBinding`/`validateArtifactRef` through the contract-error adapter, enforcing the same UTF-8-byte/scalar domain as the full witness. Legacy helpers/receipts are unchanged; no placeholder or receipt mutation. Standalone intrinsic validation is not aggregate budget proof.
3. **T07-F3 / P1 — CLOSED by `afa8bad…`:** supervisor readiness requires nonempty evidence and every listed receipt must exist and match the exact shared link. Candidate and commitment both recheck; approval-only all-scope/current-checkpoint and Main/lifecycle cancellation remain separate.
4. **T07-F4 / P2 — CLOSED by `afa8bad…`:** unknown models remain representable, but `model:null` is not supervisor decision-ready. No identity is invented or compared against an implementer's model/session/generation. T08 still proves actual selected/producing eligibility.
5. **T07-F5 / P2 — CLOSED by `afa8bad…`:** new-link receipt retention matches original report `payloadHash`; parsing requires distinct logical request/reply/receipt IDs, earlier intent/request separation and distinct/non-self-referential inspection artifacts/content hashes. No path-only uniqueness or ref-to-ID conflation; legacy receipts unchanged.

Independent source review confirms candidate/commit readiness, the separate Main branch, approval/continuation/grant/accounting/usage/dedup protections and class-specific error adaptation. All five T07 defects are now closed through the combined review and exact-delta proof. [T07 handoff](AR3-T07-HANDOFF.md) records the concrete new schemas and required T08 historical/current checks. Host provenance/durability/effect admission remain later work. These targeted T07 reviews are not T09.

Main static evidence on accepted `ccd59af0…`: syntax/whitespace pass; exact inverse of only the final import/four validator calls/comment restores independently reviewed `b252070b…`. Six frozen contract hashes, protected 19-file digest, transitions and 27-kind inventory match. Three kernel exports unchanged. Full existing-config supplemental TS6.0.3 stays 23 roots / 350 baseline source diagnostics / zero kernel, contracts and dependency-global; diagnostic SHA `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`, exit 2, not a project pass. No tests/probes/project ESM execution or runtime qualification.

### Current execution ledger

| Task / gate | Assigned owner/model | Status |
|---|---|---|
| Scope gate | read-only `openai-codex/gpt-6-astra`, run `5f966af6b0b74b9e9a2170dd51a39e63` | Completed: scope/ownership pass; six common-ABI dependencies must be pinned before fan-out; no T01 source review |
| T01 common implementation | original recovery plus Main additions; independent supplements `97a5d577d29943f08fb45d37b08eb74b` and `3c0fdb33245348a58b8a77028dcc68a5` | ACCEPTED current SHA `3dea650b3dd8b67b33d5830758b69978cc1c226cdc37df65ac03834f8c951db4`, 69 exports. Removing only the independently accepted closed Config V3 block restores accepted 68-helper `de1a7d18529ef7e59752e8e23d565c0fda953fc91e025a0a0e3ae4d8a17bbcb4`. Original helper bodies remain unchanged and legacy inspection remains accepted. |
| T01 code review | independent read-only Astra `fbc7a6394e724d22b80180654470779b`, plus Main static/preservation checks | ACCEPT for leaf handoff; all prior witnessed findings closed. Main: syntax/whitespace and protected digests pass; supplemental TS6 18 roots / 350 existing source / 0 common / 0 dependency diagnostics. Pinned compiler unavailable; behavior qualification not claimed. |
| T02 Config V3 | Main constructor; original-owner DeepSeek adapter `be6829bc2bf440e08bf23f2eefbdac40`; independent Astra `3c0fdb33245348a58b8a77028dcc68a5` | ACCEPTED. Combined source review closes all four findings with no edits. Common SHA `3dea650b3dd8b67b33d5830758b69978cc1c226cdc37df65ac03834f8c951db4`; adapter SHA `5a826428c72fe412dedcd9b239b3f3b67562bb061bed48301ca6cdcb82ee0ce2`, 43 lines, one export/argument/context and 19 aliases. Main reconfirms hashes, signatures and full-source static evidence; no runtime qualification. |
| T03 records | DeepSeek correction `674b7dd8f8af46b28916077ad413c84f`; Astra source review `4150537f9b2043e7b16f74a9e66e5137`; Main typing closure | ACCEPTED at SHA `44e168a8048e3d35b70d2d220bbb3305842ad15a26b02037de5c448bee0d66ff`. Independent review closed all 7 semantic findings; Main added only the 3 requested JSDoc collection types. Syntax and focused TS6 records+imports pass with 0 diagnostics; checker resolves `Set<string>` / `Map<string, StepV2>` with no `any` arguments. Removing only those comments exactly reproduces independently reviewed SHA `c514f0c752b9a2ce1927316632a36ba1a0b6f95819494e4cbfa292957536448c`. 3 one-argument exports unchanged; no runtime qualification. |
| T04 wire/mailbox | Astra writer `315cae6c83e5415d92043465d356e930`; Main ABI integration; independent review `6871a03d99be4b11a6c4e679eecda4ca` | ACCEPTED at SHA `f581e32d8cc6e7e12763b868eb73cd13bf04a9794894c455420e66de9b07dd20`. Reviewer ACCEPT/no blocking findings across the complete candidate; common-helper review separately accepted. Two exact public-facing signatures, syntax/0 owned full-source TS errors, stable digest reconfirmed. Historical-prefix/provenance/aggregate admission remain T08/Host, not runtime qualification. Prior scaffold-only attempts remain rejected. |
| T05 migration/archive | Astra writer `cb1b1555feaa42fdbf977b6704b07bb2`; independent reviewer `48c897235b664d58a15b1369728752ad` | ACCEPTED at SHA `b9ddbb32666287074066a3465a4b994b8a816dc8b6f9c2d864aa1cac12115f03`. Complete source review ACCEPT/no blocking findings; Main confirms stable hash, five exact exports, syntax/full-source 0 owned diagnostics and 15 typed collections/no local `any`. Private byte verification and archive inputs are accepted, not Host provenance, durable publication or aggregate replay. |
| T06 | Main integrator; independent Astra `94c9d2b5ab9d4ccfb29b9b770fec07cf` | ACCEPTED at facade SHA `041bd32dd90a26f59e895e6267d7a04f11dd7dfc58a66bf9f1bd60abe86da647`. Review passes all exports/signatures, graph/isolation and concrete schema/handoff gates with no corrections. Main reconfirms all six hashes and full-source static evidence. [Handoff](AR3-T06-HANDOFF.md) now unlocks T07; no model/runtime/full-freeze acceptance. |
| T07 then T08 | C6-KA `c6579fc8d6b64fd6b2419df662a699d1` STOPPED; next ownership in [completion ledger](COMPLETION-EXECUTION-PLAN.md) | [Main accounting/typing checkpoint](C6-KA-TYPES-INTEGRATION-CHECKPOINT.md): 21 bounded accounting outcomes, 43 validation outcomes, zero supplemental diagnostics. LR and prefix now have separately qualified source-slice acceptance, not full paths. E1 writer `2226895cb10a4762a03e13a5b5393c0b` terminated without a final handoff. Main recovered the source, checked the evidence path and corrected released mailbox occupancy; [checkpoint](C6-PREIMAGE-CHECKPOINT.md). No child writer remains active. Replanning, full mailbox/archive handling and the full path remain. Not T09 or full T08 acceptance. |
| T09 | fresh independent read-only reviewer using an actually registered, policy-permitted model | Blocked before source access. Current Kiro-only guard/model-registration mismatch diagnosed; see T10 preparation. |
| T10 | Main integration/corrections and static checkpoint | Source inventory and publication/reader-writer candidates drafted; independent review, finding closure and ratified freeze still blocked. |

A run's `completed` status is not an accepted task. Main accepts only actual source, the required interface inventory, independent findings/resolutions and allowed static evidence. Empty/failed tasks never unlock dependents; no silent model fallback or parallel whole-workflow retry. Current source/toolchain failures and behavior-qualification limits remain visible. This decomposes the approved [AR-03 runbook](AR-03-CONTRACT-FREEZE-PLAN.md) and [AR3-01 decisions](AR3-01-DECISIONS.md), not a new architecture or permission to activate actors. Goal: finish AR3-02–05 and deliver an implementable AR-04 handoff.

All paths below are relative to **`/Users/adam2/projects/pair/pi-fabric-pair`**. Preserve the current uncommitted source and untracked runtime/contract documents; a clean HEAD worktree would omit this baseline.

**Corrective ABI and finding ledger:** [T01 interface revision 2 target](AR3-T01-INTERFACE.md). Main selected the concrete shared snapshot/binding schemas after witnessing the failed revision-1 implementation. T01 code and this linked interface gate are accepted; final leaf/model integration and the complete format freeze remain open.

### Latest stable leaf checkpoint

After T05 delivery with all writers stopped, Main confirmed syntax/whitespace, exact candidate hashes and the protected 21-file digest. Full existing-config supplemental TS **6.0.3**: **22 roots, 350 source diagnostics, all baseline**, zero common/config/records/wire/migration and zero dependency/global. The migration scaffold's TS2304 is gone. Five T05 exports and 15 typed collection constructors were mechanically checked; no `any` collection arguments or local bindings. Common remains 68 exports, config 1, records 3, wire 2, migration 5. Pinned 5.9.3 is absent; full no-emit remains exit 2, not a project pass or behavioral qualification.

T01–06 are now accepted. Facade/handoff reviewer `94c9d2b5ab9d4ccfb29b9b770fec07cf` found no blocking integration defects or missing T06 schemas; all candidate hashes still match. Static checkpoint remains 23 roots/350 baseline source diagnostics/zero six contract modules and dependency-global; pinned compiler is unavailable. Before T07, Main additionally confirms both kernel files have zero attributable diagnostics, records the unchanged 27-kind inventory and freezes a 19-file protection set excluding only T07's authorized `coordination.js`/`transitions.js`. The reported concurrent wire update matches its accepted hash and requires no rework. T07 is authorized; T08 remains sequential and runtime qualification remains open.

### T05 accepted private ABI

Accepted source `b9ddbb32666287074066a3465a4b994b8a816dc8b6f9c2d864aa1cac12115f03` exports `validateMigrationManifestV2(value, sourceInput, backupInput, context?)`, `validateHeldLegacyEvidenceV2(value, sourceInput, backupInput, context?)`, and `validateArchiveRefV2`, `validateArchiveCheckpointV2`, `validateArchiveValidationContext` each taking `(value, context?)`. These are private helpers, not additions to the six-export facade. Missing/unresolved backups require `backupInput: null`; supplied bytes establish equality, not durable publication.

Explicit empty context: `{version:2, kind:'empty', storeId, head:null, segments:[], artifacts:[]}`. A chain is oldest-to-newest, with each segment carrying `reference`, `checkpoint`, `original`, `decoded` and each resolved artifact carrying `reference`, `original`; explicit representations each consume budget. T08 must validate domain payloads/config, replay historical prefixes and bind the context to the current root/checkpoint. Host owns provenance, durable binary backup and publication. The source/classifier/inspection DTO is never a byte-backup substitute. Independent source review is complete, not runtime qualification.

### T05 single-capture ABI dependency

Astra implementer `6b79ebe0d96c4166930d292f21ceaed6` stopped without edits instead of bypassing the accepted budget. Main inspected `actor-contract-common.js:464–480,563–576,602–638` and `contracts.js:750`: decoding legacy bytes and then hashing them charges source bytes twice; carrier construction/validation already performs both jobs internally but does not return the decoded value required by `classifyStoredState`. The classifier's borrowed object remains non-authorizing and is not a byte backup.

Read-only Astra `7988c8fd377b450a92b00ea38862fcb3` specified the bounded helper. After T04 stopped, Main implemented it and integrated the wire consumer without changing existing common functions. Independent implementation reviewer `97a5d577d29943f08fb45d37b08eb74b` ACCEPTED with no findings; Main's source/static gate is closed. The exact contract and current SHA are in the interface handoff. No alternate parser, budget reset, unchecked marker or fabricated oversized-source facts were introduced. This unblocks T05's resumed implementation but is not acceptance of migration/full wire and does not fix T02's separate reconciliation gap.

### Historical leaf review findings — now closed

**T02**, original Astra `0451129ee84f4497842c7b5f6f921c49`, was **BLOCKED** on the former 417-line candidate. All four findings below are now **CLOSED** by fresh combined review `3c0fdb33245348a58b8a77028dcc68a5`; retain them as history, not an open queue:

1. **P1 — common composition obstacle:** local runtime/safety/mailbox defaults and final roots (`actor-config-contracts.js:174–194,316–322,337,366–410`) use `Object.freeze` without common's private reconciliation. Normalization/default/alias growth is undercharged, and encoding the newly assembled root with the same context recharges its whole tree. Integrator must design a closed, validated reconciliation path; simply recapturing the root, resetting budgets or exposing caller-controlled trusted flags is not a fix. Keep accepted common stable while T04/T05 writers use its current ABI; report the concrete interaction rather than reopening it generally.
2. **P2 — preview compatibility:** local byte checks conflate the 999-code-unit provider/model cap with a 999-byte cap; empty legacy cwd is wrongly rejected; runtime command adds an unratified 1,000-byte restriction. Align with retained V2/common preview semantics and the independent D3 10,000-byte bound, without promoting previews to readiness.
3. **P2 — missing actor-pair inventory:** distinct resident, global active-model and per-actor activation capacities, plus idle policy/unresolved-workflow retention, need typed fields/defaults or an explicit ratified scope decision. This is shape-only work, not runtime activation.
4. **P3 — paths:** `checkKeys` at lines 104–105 ignores its supplied path and always reports root `config.`; preserve nested paths.

Former T06 questions are resolved: Main ratified normalize-first effective requirements-alias equality and the closed common constructor; the accepted public adapter has one argument/context. Aggregate consumers use the mandatory-context common entry. No forged-context bypass or corrective source edit remains in the accepted T02 review.

**T03**, fresh Astra `4150537f9b2043e7b16f74a9e66e5137`: all seven original semantic findings below are closed. Its remaining no-`any` finding was confined to empty Sets (old lines 732,812) and Map (792). Main supplied exactly `Set<string>` / `Map<string, StepV2>` annotations; focused compiler/type inspection and digest reconstruction verify this narrow correction without runtime changes. T03 is now accepted by Main; the reviewer did not independently run compiler checks or issue an unconditional pass on the earlier unannotated snapshot.

### T03 review/correction checkpoint

Independent Astra `2b987e3ce90144529d679a7601811b2d` completed **BLOCKED** on the original candidate SHA `ecddaa95944512d4d697dbcdd52b8ca52fac1c373a2224a1ec0ec84e33e10eb8`. Main independently traced those public constructors and measured 10 owned diagnostics. The brief for corrective writer `674b7dd8f8af46b28916077ad413c84f` required preserving existing complete code and closing all findings below, not restarting the file. That writer has now finished; the corrected candidate and fresh-review status are recorded above:

1. `textValue` enforces characters only: apply the exact **10,000 UTF-8-byte** text bound with bounded local counting. No common change is required.
2. One activation input reference incorrectly permits aggregate **16 MiB**: enforce **4 MiB per referenced input**. Main selects `inputRef:null → byteLength:0` to mean no retained input bytes, not proof of an empty original input or dispatch permission. T08 holds unresolved input; non-null reference content/byte/hash proof remains the resolver's job.
3. Remove equality/order comparisons between workflow-plan and implementation-task-plan revisions. Keep comparisons within the workflow-plan namespace and exact task identity/grant correspondence; T08 proves their mapping.
4. Match a runtime binding's role to the actor definition. For the same generation, compare explicit known session ID and non-null model label with the actor's selected values. Model label is `${definition.provider}/${definition.model}`, matching current `controller.js` projection. Preserve unknowns and older-generation session/model observations; no liveness claim.
5. Reject duplicate hold, obligation and step IDs within their enclosing records. Compare populated current-task/selected-step task references by task ID and task-plan revision, plus attempt ID when both are known; do not infer an unknown attempt.
6. A present authority reference's hash must match the enclosed grant proof's `authorityHash`; publication/provenance is still deferred.
7. Reconcile accepted shape, return value and type: Main selects nested runtime `freshness:{context,usage}` consistently; require/emit the declared obligation `version:2`.

Static corrections: invalid `ErrorCategory:'capacity'`; missing `validateShape` parameter/callback annotations; constraints inferred as `unknown[]`; absent concrete `ActivationRecordV2` typedef; redundant impossible Main-role comparison after narrowing. No `any`, suppression or opaque replacement. Independent ACK/run/report/settlement/barrier/resolution retention remains unchanged—do not invent ACK-before-report or settlement-before-retained-resolution gates.

The reviewer found no current duplicate-budget charge from the private returned records, no failure of initial inert capture or same-context nested validation, and no authority claim. Do not broaden the correction into T08 provenance/replay or rewrite accepted common. Source and corrected static results need a fresh independent review before T03 acceptance. The worker's assertion that the old 350 diagnostics were unchanged was not accepted: Main measured **362** on the stable 21-root snapshot (350 old + 2 config + 10 records; zero dependencies/global). Its reported ESM export-load check is not runtime qualification and must not be repeated as a behavioral probe in corrections.

### Astra pre-fan-out interface gate

Scope review `5f966af6b0b74b9e9a2170dd51a39e63` passed the task/ownership boundary and identified six requirements for the accepted T01 ABI. They are implementation handoff requirements, not already verified code:

1. **Namespace mapping:** current kernel config/budget/accounting revisions are string IDs; plan/attempt counters are numeric; existing lease tokens allow 128 characters. Do not coerce all revisions to numbers or all legacy tokens to new 80-character IDs.
2. **Config → assignment snapshot:** exact shared field mapping/default materialization before hashing, including evidence/verification/deferred limits/resources; unselected preview values are not activation readiness.
3. **One validation budget:** private aggregate-budget threading under unchanged public signatures; explicit admission-time ownership; adapt known validation errors only and allow programming errors to escape.
4. **Lossless V1 carrier and hash preimages:** retain the original JSON representation/property ordering in V2 wrappers; distinguish original-byte, legacy payload, immutable-input and canonical wrapper digests. Do not canonicalize a nested V1 object and thereby change its original digest after reload.
5. **Reviewer witness:** shared exact activation/intent/settlement/workflow/report/checkpoint/request/reply/receipt binding, with no provenance boolean; T08 later proves historical-prefix existence.
6. **Archive references:** shared store/segment/original byte length/hash/prior-root bindings now; T05 later supplies the complete bounded context and explicit empty-context representation. A classifier's borrowed object is not a byte backup.

Main must witness these in actual common source and its accepted handoff before launching T02–05. The T01 retry was steered with these findings; one successful steering delivery is not evidence they were implemented.

## Launch order — do not launch ten competing writers

```text
Wave 1:  T01 shared primitives/codec/interface owner
                   |
Wave 2:  T02 config || T03 records || T04 wire/mailbox || T05 migration/archive
                   |
Wave 3:  T06 facade integration and leaf validation gate
                   |
Wave 4:  T07 kernel extensions -> T08 actor composition (sequential; approved Astra R1C/R2)
                   |
Wave 5:  T09 independent read-only review
                   |
Wave 6:  T10 corrections, complete freeze and integration handoff
```

**Maximum useful parallel writers: four, during Wave 2.** One integrator owns T01/T06/T10 and all shared documents. The user approved Astra's R1C correction and subsequent R2 prefix/correlation stage as exceptions to the original T07/T08 same-model rule; the accepted kernel stays frozen. Never overlap writers on the kernel/composition boundary. T09 must be a different agent from implementation owners. These are ten assignments, not ten simultaneously live agents.

Only start a task after its prerequisites are delivered and the integrator has accepted the interface. Do not use waiting loops or ask agents to guess unfinished dependencies. Read-only inventories may overlap a wave, but their reports are not verification of later edits.

## Shared prompt — prepend to each task

> Work only in `/Users/adam2/projects/pair/pi-fabric-pair`. First verify the canonical Git toplevel and read `package.json`, `docs/TESTING.md`, `docs/AR-03-CONTRACT-FREEZE-PLAN.md` and `docs/AR3-01-DECISIONS.md`. Abort with zero changes on a repository mismatch. Read the relevant source before editing. Implement your assigned task; do not merely produce another implementation plan. Edit only your exclusive files. If another file must change, report the exact dependency to the integrator rather than editing it. Preserve existing and concurrent changes; never reset/clean/stash, commit, push or overwrite another agent's file.
>
> Keep executable ESM JavaScript, strict JSDoc and concrete runtime validators. No broad `any`, suppressions, source exclusions or placeholder success. No tests, fixtures, compiler-negative cases, reusable check/probe scripts, live workers, configured verification, installs, upstream edits, credentials or real configuration/session data. No ActorHost/runtime wiring, automatic repair/recovery, supervisor launch, queue pump, idle timer, active version/default/schema/example change or new Pi tool registration. Package/config/state/wire remain 0.1.0/V2/V1/V1 and the live-worker guard remains. Pure results authorize nothing. Preserve original V1 hashes and histories.
>
> Shared contract syntax, limits and identity must match the accepted T01 handoff; never silently widen a field to accommodate another agent. Stop and report a concrete mismatch. Return modified paths, exact exports/signatures, source-backed invariants, command results and unresolved integration needs. Do not call a static check runtime qualification. Do not delegate or spawn additional agents.

Reviewer T09 gets read/grep/find/ls only and verifies identity by absolute package/runbook reads, without shell. Owner-approved Astra R1C/R2 writers get read/grep/find/ls/edit only: Main verifies canonical Git root; the child first reads absolute `package.json` and aborts on mismatch. Main alone runs static checks after the writer stops. Other writers may use only their explicitly approved static-command tools. No approval settings or extra capabilities are granted here.

## Private leaf split for disjoint ownership

The selected public module boundary remains unchanged. Add **private pure helper modules** beneath the facade to allow Wave 2 writers to avoid the same file:

```text
actor-contract-common.js     inert values, scalar/binding validators, bounds, codec/digests
  ^        ^       ^       ^
config   records   wire   migration contract helpers
  \        |       |       /
          actor-contracts.js       six agreed leaf exports
                   ^
          actor-model.js           five agreed aggregate/model exports
                   |
     coordination.js / transitions.js (existing implementation kernel)
```

These helper filenames are assignments, not proof they exist. They introduce no second registry/reducer or public Pi surface. Each helper imports common primitives and only already-agreed existing contract/usage leaves; helpers do not import the facade, actor-model, runtime, or each other's unfinished implementations. Shared identity/reference JSDoc types and intrinsic validators therefore belong to T01, not four divergent copies. Coordinator approves a necessary acyclic cross-helper dependency before implementation.

## T01 — Implement shared primitives, bounded codec and interface baseline

- **Owner:** integrator / common-contract writer.
- **Exclusive writes:** new `src/actor-contract-common.js`; integrator may update the shared runbook/decision record to document exact private symbols and field handoff. No changes to current runtime or active constants.
- **Prerequisites:** none; AR3-01 is the selected design baseline.
- **Implement:** inert-JSON/shape validation, structured contract errors, exact existing ID grammar/reserved names, hashes/counters/null/optional semantics, immutable parsed values, shared owner/actor/control/reference bindings and D3 limits. Implement the pure `pair-json/1` encoder/domain-separated digest and bounded raw decoder with duplicate-key rejection; do not rely on `JSON.parse` to detect erased duplicate keys. Keep original V1 payload hashing separate.
- **Required handoff:** exact shared typedefs/signatures/error behavior, numeric bounds, binding/reference schemas and hash-included fields for T02–05. Declare how aggregate depth/node/byte budgets are shared across nested validation; helpers must not restart the budget for each object. Clock/deadline comparison inputs are explicit, never `Date.now()` in the pure leaves.
- **Done when:** common module is real code, its exports are inspected, syntax is clean, and the four leaf tasks can implement against one stable interface without guessing shared fields. No future-format activation.
- **Verification:** source walkthrough against D1–D6 and the existing `id/token/safeId`/V1 digest implementations; `node --check` for the new file; integrator's targeted type diagnostics. Record any missing pinned compiler instead of installing it.

## T02 — Implement the Config V3 contract

- **Owner:** config-contract agent.
- **Exclusive write:** new `src/actor-config-contracts.js`.
- **Depends on:** accepted T01.
- **Implement:** `validateActorConfigV3` and concrete readonly types for legacy/actor-pair modes, actors/profiles, selected model/thinking, workflow participant IDs, capacities, mailbox, supervision, safety, limits, verification, evidence and worker requirements. Preserve disabled/unselected previews and every retained V2 deferred field. Reject conflicting old/new requirements and unsupported relaxing safety values. Separate worker resources from restricted-supervisor launch inputs.
- **Do not edit:** active `src/config.js`, defaults, example JSON, settings UI or package manifest. Validation does not load resources, select a model or apply config.
- **Done when:** every field/default/null/zero/role relationship is explicit, and shape acceptance is distinguished from later native profile/model admission. Preserve user opt-in; no automatic V2-to-actor-pair conversion.
- **Handoff:** named export, field table and unsupported/conflict outcomes for T06/T10. Run own-file syntax; report attributable type issues.

## T03 — Implement actor, workflow and activation record leaves

- **Owner:** record-contract agent.
- **Exclusive write:** new `src/actor-record-contracts.js`.
- **Depends on:** accepted T01.
- **Implement:** `validateActorRecordV2`, `validateWorkflowRecordV2`, `validateActivationRecordV2`; operational holds versus runtime observations; role/session/generation/profile binding; immutable assignment/budget snapshots; workflow/plan/budget revisions; independent command/run/report/settlement facts; pending question/review/blocker and cancellation dispositions.
- **Boundary:** leaves validate intrinsic structure/invariants only. Full historical-prefix/cross-record proof belongs to actor-model. Do not pretend a valid record proves a live process, complete accounting, effect settlement or an authenticated sender.
- **Done when:** no ambiguous status boolean or free-form opaque substitute remains; exact role-specific fields and null/zero meanings are typed; no reset-on-resume or independent mutable accounting copy is introduced.
- **Handoff:** three exports, concrete record/hold/obligation shapes, cross-record checks reserved for T08, and own-file static results.

## T04 — Implement mailbox and actor-control wire contracts

- **Owner:** wire-contract agent.
- **Exclusive write:** new `src/actor-wire-contracts.js`.
- **Depends on:** accepted T01; use its shared bindings, not unfinished record/helper code.
- **Implement:** `validateMailboxEnvelopeV2` and `validateActorControlV2(value, expected)` with closed role/kind unions, required peer/version/owner/session/nonce/generation/operation binding, original input hash and correlation/causation IDs, finite request expiry fields, count/UTF-8/reference bounds and ordinary versus reserved-control classification.
- **Specify as typed data:** immutable duplicate/conflict/disposition receipts, archive/admission epoch binding and reviewer activation/inspection request/reply identity. Actual dedup occupancy/history checks happen in T08; source labels and supplied expected bindings do not authenticate themselves.
- **Do not implement:** filesystem mailbox scanning, RPC sends, role startup, scheduler or retries. Preserve V1 envelope/hash compatibility through explicitly typed wrappers, not by silently relabeling a V1 grant V2.
- **Done when:** wrong principal/version/missing proof and malformed/oversized payloads have explicit validator outcomes; unknown execution remains distinct from rejection/not-sent. Report symbols, schema/hash boundaries and own-file static results.

## T05 — Implement migration, archive and legacy-evidence leaves

- **Owner:** migration-contract agent.
- **Exclusive write:** new `src/actor-migration-contracts.js`.
- **Depends on:** accepted T01.
- **Implement:** private typed validators for `MigrationManifestV2`, `ArchiveRefV2`, `ArchiveCheckpointV2`, `ArchiveValidationContext` and held legacy evidence/reference records. Reuse `classifyStoredState` only as non-authorizing recognition. Preserve exact byte length/hash/source/backup refs, source profile and both primary/rollback errors; bound archive count/decoded context and retained obligation coverage.
- **Do not implement:** disk backup/replacement, archive deletion, migration execution or `projectLegacyWorkerView`. The latter remains a full-replay actor-model export, not a shape-only helper. Missing historical identities stay missing; new migration IDs are not old execution proof.
- **Done when:** unknown/corrupt/oversized/incomplete backup or archive inputs remain held/inert; all retained obligations have typed references and explicit visibility requirements. No unbounded archive chain or self-asserted “verified” flag.
- **Handoff:** exact private signatures and archive-context input for T08/T10, source compatibility findings, own-file static results.

## T06 — Integrate the leaf facade and close AR3-02

- **Owner:** integrator, not another competing leaf writer.
- **Exclusive writes:** new `src/actor-contracts.js`; integration-only corrections to T01–05 files **after their writers have finished**. Any truly necessary current `contracts.js`/`observations.js` adjustment is integrator-owned, separately reviewed and must preserve current acceptance/exports.
- **Depends on:** accepted T02–05 results and stopped/completed leaf writers.
- **Implement:** facade exports exactly the six selected leaf validators from the accepted helper implementations; retain a pure acyclic graph and concrete shared types. Resolve mismatched field/hash/default interpretations against D1–D6, not with permissive unions/`any`.
- **Done when:** all six exports are mechanically present, helper dependencies and all planned typed fields reconcile, source/runtime consumers and versions remain unchanged, and AR3-02 has a source/static checkpoint.
- **Verification:** full project compiler command once at this integration boundary, all new-module syntax, export/import inspection and whitespace. New/touched contract modules must not introduce attributable diagnostics. If pinned `tsc` is unavailable, report it and use the documented supplemental full-source recipe only as diagnostic evidence; do not narrow the project config.
- **Gate for T07/T08:** hand off the exact supervisor reviewer witness, expected binding and archive-context schemas before the model owner edits the kernel.

## T07 — Implement the two bounded kernel extensions

- **Owner:** model owner, retained for T08.
- **Exclusive writes:** `src/coordination.js`, `src/transitions.js`.
- **Depends on:** accepted T06 reviewer/witness contract.
- **Implement:** activation-bound `evidence-receipt` and an explicit supervisor-control `decide` branch. Preserve existing Main-only branches and source/identity/hash rules. Bind supervisor intent/producing settlement/workflow revision/report/checkpoint/inspection receipts; no relabeling as Main and no global removal of role predicates.
- **Preserve:** the 27 kind names, 24 reused families, inactive automatic-action behavior, absorbing grant closure, independent early report/run versus ACK facts and expected-error handling. Do not duplicate the implementation reducer. Supervisor usage is not fake implementer usage.
- **Done when:** each changed predicate has a source walkthrough and historical-prefix compatibility explanation; existing legacy shapes keep their prior behavior; unexpected programming errors are not swallowed.
- **Verification:** changed-file syntax and focused type diagnostics; source inspection of current/legacy reader branches. No tests, fixtures or simulated flows. Full completion still depends on aggregate replay in T08.

## T08 — Implement canonical actor/workflow composition

- **Owner:** C6-KA and the disjoint Controller/contracts/evidence/Main integration writer are STOPPED; Main's [bounded checkpoint](C6-KA-TYPES-INTEGRATION-CHECKPOINT.md) records exact scope/hashes/checks. C6-PREFIX and both subsequent bounded reviewers are STOPPED: [prefix checkpoint](C6-PREFIX-FINDINGS.md) has24 outcomes and source-slice CLEAR; two Evidence findings were corrected with17 focused outcomes. C6-LR writer `d70eebcf5b3d445bb0724bb52bd2402f` STOPPED: sourcecd84cda3…, actual one-file audit/syntax/whitespace and combined24-root zero supplemental diagnostics. Main24 bounded outcomes; reviewer `b3efd56de9034bd1893a04a4eda6b489` STOPPED BLOCKED. [Two actor-only corrections](C6-LR-FINDINGS.md) at2590f1f… have17 focused outcomes and zero combined supplemental diagnostics; corrective reviewer c8 STOPPED and found cross-family namespace hole. Main source329bdcf… has10 further focused outcomes/zero full supplemental diagnostics; namespace reviewer `1a04be95e37d43ee858d80493c01d9f1` STOPPED CLEAR for corrected LR source slice only. Task8 still open. The [completion ledger](COMPLETION-EXECUTION-PLAN.md) is authoritative; do not resume stopped writers.
- **Current bounded write boundary:** no source writer. Main holds all source after checked [C6-LR corrections](C6-LR-FINDINGS.md). All LR reviewers stopped CLEAR for corrected329bdcf… source slice; no source writer; plan/preimage proposal is collected but no implementation permission opened. Coordination/common/record/wire/transitions remain held. Old hash/coverage semantics, 27 kernel kinds, all five signatures and numerical limits must survive; no runtime activation, tests or child execution.
- **Depends on:** accepted T06 and completed T07.
- **Implement:** all five agreed exports: `validateActorStateV2`, `projectLegacyWorkerView`, `validateActorWorkflowModel`, `validateActorWorkflowEvent`, `reduceActorWorkflow`. Replay canonical actor/implementation events at their historical prefixes. Reuse the implementation kernel, derive actor/workflow/index/ledger views, and atomically apply/noop/hold/reject with `nonAuthorizing: true`.
- **Cover:** one unresolved workflow, one implementation writer, per-actor activation reservations, independent holds/obligations, producing-supervisor settlement before decision application, exact reviewer receipts, immutable lifetime/per-step budgets and authorized amendments, supervisor/implementer observation dedup/gaps, mailbox capacity/fairness/epoch/disposition, bounded archive context and read-only held legacy projection.
- **Do not implement:** ActorHost, actual storage/RPC/effect execution, runtime observers, timers or queue pumping. A digest/schema match is not provenance or effect authorization. No present-day Controller adapter imports this module.
- **Done when:** complete closed event/issuer/state/operation tables correspond to actual code; no derived view is a second writable registry; late/unknown observations cannot reopen authority or reset spending.
- **Verification:** source walkthrough of the full vertical path plus crash/uncertainty cases, all model/kernel syntax, concrete export/type and acyclic import checks; report actual full-source diagnostics at the integration boundary.

## T09 — Independent read-only verification

- **Owner:** a fresh reviewer, not a writer of T01–08.
- **Tools:** read/grep/find/ls only. **No file writes or shell.**
- **Depends on:** a stable T08 checkpoint accepted for review; no unfinished writer changing the reviewed files.
- **Review:** actual source against the 11 public symbols, D1–D6, all 27 existing kind dispositions, proposed field tables, raw decoder/hash rules, current V1 compatibility, archive/dedup bounds, supervisor decision/usage attribution, historical-prefix correctness, atomic rejected outcomes and no active integration. Trace public facade → leaf/model → kernel dependencies.
- **Required output:** prioritized findings with file/symbol and witnessed failure mechanism, minimum correction, and explicit unreviewed areas. Distinguish an implementation defect from missing runtime qualification. Do not report “all safe” from a worker completion claim or static check.
- **Done when:** the integrator has a usable independent findings list or a scoped no-findings report. Reviewer prose is not a compiler result, and does not itself close defects.

## T10 — Correct, freeze, verify and hand off AR-04

- **Owner:** integrator, after writers/reviewer finish; corrections may be assigned back one owner at a time.
- **Exclusive writes:** demonstrated correction files under explicit ownership transfer; `docs/AR-03-CONTRACT-FREEZE-PLAN.md`, `docs/AR3-01-DECISIONS.md`, compatibility/scope/implementation/acceptance documents as needed. Do not edit original requirement rows or create public actor examples before activation.
- **Depends on:** T09 findings and all owner result reports.
- **Implement:** fix witnessed gaps; replace every proposed field/schema/default/bound/hash/reader-writer/crash placeholder with exact implemented references. Close D1–D6 at the contract/model level and account for AR3-A01–10 without calling runtime gates passed. Freeze the full artifact/reader/writer/commit/readback/incompatible-peer matrix and the ordered AR-04 source/effect-owner handoff.
- **Verify:** `node --check` on final production source; `git diff --check`; full registered `npm run typecheck -- --pretty false`; `npm run pack:check`; mechanical 11-export/dependency/27-kind/active-version/tool-registration/config/default/manifest and original 106-row preservation checks. Inspect failures and fix attributable issues; do not rerun unchanged passing checks or hide the existing full-project failure. Do not install dependencies without authorization.
- **Completion statement:** separate implemented contracts/model, exact static results, independent findings/resolutions and still-unverified runtime/native/install gates. Full pinned typecheck is not passed merely because the new modules are clean. No actual tarball install, workers or test/probe execution in this batch.
- **Next after acceptance:** AR-04 canonical Host, actual migration/publication/recovery and one implementer. Do not start it inside one of these leaf/model agents.

## Required result format for every agent

```text
Task ID / completed or blocked:
Repo identity checked:
Files changed (exclusive ownership respected):
Actual exports and shared-interface revision used:
Concrete invariants/source paths reviewed:
Static commands + exit status (or unavailable toolchain):
Remaining findings / integration requests:
No tests, live workers, installs, runtime activation or version changes:
```

For T09 replace “files changed” with “files/symbols reviewed” and list findings; no commands are required from its read-only tool set. The integrator owns actual static command evidence.

## Practical assignment recommendation

- Strong implementation/reasoning agents for T01, T03, T04 and especially T07–08.
- Bounded source-inventory/config/migration agents for T02/T05, with the same correctness gate; a lighter model is not an exemption from concrete validators.
- A separate strong read-only reviewer for T09. Model labels are not evidence of correctness.
- Start **T01 now**. Once accepted, spawn **T02–T05 together**. Do not reopen AR3-01 or produce another broad architecture plan unless a concrete source contradiction requires it.

Planning verification passed: ten unique task cards; four disjoint Wave-2 write files; all 11 agreed public symbols covered; five local links/anchors and whitespace valid; 21 protected production/config/tooling files and all original 106 requirement rows unchanged. Package dry-run contains this plan (39 files, no bundles or tarball). No agents, workers, tests or installs were run by this planning change. Completing these ten tasks would finish the remaining AR-03 implementation scope, **not the entire product or AR-04–08**. No percentage or release-readiness claim follows from the number of tasks.

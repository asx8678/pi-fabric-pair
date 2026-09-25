# T08-R2 — Verified bounded correction and historical findings

## Completed R2 Main checkpoint — F1–F4 verified; full T08 still open

C2 `fec9a43d63494c77b2e3f3d01e898d55` completed after 161 seconds, 10 turns / 9 tool calls / exit 0. Main collected its terminal handoff and audited one `pi.edit` containing four replacements in **`src/actor-model.js` only**. Actual tool surfaces were read/find/grep/edit, with no failed calls or child command/execution/test/probe. All R2 writers were stopped at this checkpoint; completed runs must not restart. Subsequent R3 is governed by [its ledger](AR3-T08-R3-PLAN.md); consult [live ownership](AR-03-AGENT-TASKS.md).

The delivered SHA `97f9976b8de3754b096e50b60e549619a0d76d967a8e839616549cb927b426f5` had one private JSDoc parse diagnostic, TS1005 at line 623. After the writer stopped, Main added the missing closing `}` only. Final checked SHA: **`b5288b201ea080398866713b7987cca280760548f4242bac504fef050abed639`**, 138,759 bytes / 1,621 split-lines. Reversing Main's one-character correction reconstructs the exact delivered hash; reversing C2's four recorded replacements then reconstructs exact C1 SHA `ca70e0b1…`. Thus C1/F1–F3 and all unrelated model source are preserved byte-for-byte outside the stated F4 delta.

### F4 closure and bounded behavior

- `PublishedGrantWitness` (621–623) is readonly historical `{rootRevision,identity,commit,publication}` with exact kernel event types. `runFold` (626–661) owns a fresh private workflow → grant → witness map for each segment/archive fold; it is neither input nor a public cache/capability.
- Recording (648–656) follows replay and requires **apply**, actual grant **open**, non-null commit/publication and exact equality to that publication event. The first witness records `i + 1`, the prefix length that actually includes publication. Noop/held/closed mentions cannot establish it; a later success records its own later revision. Entries are bounded by root events, with no new prefix replay.
- Consumption (640–644) requires exact workflow/grant/full identity, `witness.rootRevision <= proof.rootRevision`, and immutable commit/publication linkage to the consumed grant. Existing root-hash/future-revision checks and current activation admission remain. Only implementers require this witness; supervisor bootstrap remains unchanged.
- This closes F4's specific later-publication repair gap. It does not turn a historical witness into fresh authority, relax C1 retirement/hold/observation rules, or qualify M4 artifact content.

### Independent verification

| Check | Main result |
|---|---|
| Syntax / source and repository whitespace | Pass on delivered executable source; final source differs only by a closing brace inside JSDoc. Final docs/source whitespace checked separately. |
| Public boundary / dependency graph | Exact five exports, arities 2/3/2/1/3, required arguments and selected return names; no incoming production consumer or composition import cycle. The final annotation fix does not touch these. |
| Frozen / protected files | Six contract and two kernel hashes match; protected 19-file SHA `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738` unchanged. No active version/config/default/schema/example/registration/guard changes. |
| Full-config supplemental TS6.0.3 after correction | **24 roots / 350 unchanged source diagnostics / 0 actor-model / 0 dependency-global**, exit **2**, not a passing project build. Baseline SHA `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. |
| Focused in-memory behavioral probe | **11/11 expected outcomes** from the actual extracted `runFold` function: earlier valid publication; stale mention plus later success cannot repair an earlier proof; later valid proof succeeds; noop/held/closed publication supplies no witness; wrong workflow/grant/lease and future revision reject; supervisor bootstrap needs no implementer witness. |

The final probe is an explicitly additional, one-off Main check beyond the original static-only checklist: it used supplied kernel outcomes/hash callbacks, not execution of the kernel or full aggregate validator. **No tests, fixtures or runners were added, no files were written by the probe, and no project ESM/native/live runtime was loaded.** It validates only the isolated witness boundary; it is not full-model behavioral qualification, a revived test suite or T09. Child restrictions were unchanged. C1's other paths retain source-review/static evidence rather than gaining behavioral certification from this probe.

**Disposition:** the bounded historical-prefix/producer-correlation patch and focused F1–F4 corrections are verified at this checkpoint. No known finding from this correction set remains open. Full T08/R2 qualification, M3 lifecycle/held-consequence reconciliation, M4 artifact qualification, M5 accounting, M6 mailbox policy, M7 archive carryover and M8 aggregate work remain open. Per-prefix kernel validation/root hashing costs remain; no aggregate-budget proof or external ABI change is claimed. **T01–07 accepted (7/10), T09/T10 unstarted.** Next bounded work in the existing completion order is current-segment inspection/artifact correlation and the full vertical path, with any inseparable lifecycle reconciliation scoped explicitly before assignment.

Historical checkpoints and assignments below retain their original source-hash context; they are not active-writer or current-blocker declarations.

## R2-C1 stopped checkpoint — focused F1–F3 correction verified

Astra `62f2fb2bc00c4a83b7cf767902680433` completed after 410 seconds (14 turns, 13 tool calls, exit 0) with a substantive handoff. Main audited the actual log: read/find/grep/edit only, three successful edit requests, all targeting `src/actor-model.js`, no failed calls or shell/write/script/test/probe/project ESM execution. This run is terminal and is not to be restarted.

Main independently checked source SHA **`ca70e0b1b15f1438e8aee158700b0f1949c95c1cec8be2ba6bd59e26f5fd3730`**, 136,615 bytes, 1,598 split-lines:

- Syntax/whitespace, exact five exports/arities/required arguments/selected returns, no incoming production consumer and acyclic composition imports: pass.
- All six contracts and both kernel hashes match; protected 19-file SHA remains `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`.
- Full-config supplemental TS6.0.3: **24 roots / 350 unchanged source diagnostics / 0 actor-model / 0 dependency-global**, exit 2. Baseline SHA remains `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. No full project-build or runtime qualification claim.

Main's targeted source review verifies the focused F1–F3 correction:

| Finding | Current source disposition |
|---|---|
| F1 retired producer admission | `kernelAdmissionDenial` (898–925) rejects fresh prompt authority from settled/closed, expired, wrong-fence or superseded producers. `producerAdmissionDenial` (720–723) binds current owner/actor/revision. Candidate checks and commitment rechecks share the predicate; already-applied kernel noops return before acquiring new authority (952–953). |
| F2 observation vs admission | `correlateKernel` checks immutable historical facts; `kernelAdmissionDenial` separately checks current actor eligibility. `applyImplementation` (944–973) retains correctly bound storage observations and emits frozen `heldCommitments` when actor admission is denied. Malformed/missing original intents still reject. Publication facts do not require a redundant actor grant registry; actual activation/prompt use remains gated. |
| F2 consequence publication | `syncKernelStatus` does not advance held actor consequences (934–940), and `deriveViews` hides denied decisions/continuations while retaining unresolved operation/report references (1412–1427). Held attempt/decision mirrors remain observations, not authority (1144,1209). Main cancellation still follows the frozen kernel's applicable rules. |
| F3 no-append proposal holds | The reducer (1553–1595) retains observed held models but allows pure admission-denied proposals to return the unchanged base. The comment no longer promises a durable receipt for a non-appended event. No broad error catch or fabricated proposal log was added. |

New derived-only schema: `WorkflowView.heldCommitments` contains readonly `{nonAuthorizing:true,eventId,observationId,operationId,intentKind:'dispatch'|'prompt'|'decision',reason:'workflow-ineligible'|'producer-ineligible'|'producer-retired'|'producer-expired'|'prior-held-commitment'}`. These entries come only from canonical replay, are deeply frozen and are covered by complete `workflows` cache comparison (1491–1506). No new root event schema, export or external ABI was added.

This closes the **focused F1–F3 correction**, not full R2/T08, M3–M8 or T09. Explicit reconciliation of held actor consequences remains M3; resolving a later hold does not clear them automatically. M4 artifact qualification and M8 aggregate cost remain open. Main's further source review found F4 below, within the already-authorized historical-prefix requirement.

## F4 / P1 — historical finding, closed at `b5288b20…`

**Completed focused correction:** same-Astra R2-C2 `fec9a43d63494c77b2e3f3d01e898d55` is terminal. Main verified the F4 witness after a one-character JSDoc correction; see the latest checkpoint above. No active writer or outside-file ABI change.

On `ca70e0b1…`, `runFold` (622–637) validates the producer's historical root hash but uses `prefix.some(...)` over raw `authority-published` events, matching only workflow and grant operation (633). It does not establish that the named grant was actually published in that prefix.

Concrete source mechanism, not an executed counterexample:

1. Frozen `coordination.js:803–807` makes a stale receiver-fence event an inert **noop** before it can establish grant state. Its `authority-published` parser (322) accepts the closed shape; actual publication is established only by the validated transition (898–907).
2. Aggregate `applyImplementation:952–953` leaves kernel state unchanged for that noop. Canonical-root validation nevertheless replays and preserves the supplied root journal; it does not remove raw noop entries.
3. A proof prefix can therefore contain a stale noop `authority-published` naming operation G without any actual publication of G. A later valid publication can establish G in the live projection before activation issuance.
4. The proof hash can correctly cover the earlier inert prefix, and the raw `prefix.some` passes. `activation-issued` then checks the **later current** published grant, allowing later facts to fill the missing publication in the proof's own prefix. Reducer noops normally do not append, but public canonical-root validation must not assume every input journal was generated by that reducer.

**Required focused R2-C2 correction:** bind producer grant proof to a publication witness established by validated replay **at or before `proof.rootRevision`**, with the exact workflow/grant/identity/commit/publication binding. A raw mention, stale noop, wrong grant/lease or a later successful publication is insufficient. Preserve genuine earlier published proofs and the initial supervisor bootstrap.

Use the smallest bounded private fold index/witness derived only from accepted historical kernel states/events; do not accept caller-supplied checked flags, consult only the final current grant, recursively replay entire prefix histories, add a new public export, alter frozen modules or reimplement kernel grant semantics. Record what the frozen transition actually established, including outcome/phase/identity as needed; do not treat a held/closed publication as an open grant merely from its event kind. This is historical evidence, not a second writable authority registry or new host capability.

Scope remains exclusive edit-only `src/actor-model.js`, same Astra model, preserving C1/F1–F3 and all R1C boundaries. No new event/public cache is expected; report any genuine outside-file dependency before editing. Main owns docs and checks after the writer stops. All previous no-shell/write/tests/probes/generated scripts/project-ESM/runtime restrictions remain. The original R2 run and C1 are completed, not restarted.

Required source walkthrough: (a) correctly published grant already in the named prefix succeeds; (b) stale/noop mention plus later actual publication does not repair the earlier proof; (c) wrong workflow/grant/lease/identity, future revision and held/closed publication do not become an open grant witness; (d) later actor holds/retirement still obey C1's admission/observation separation; (e) supervisor pre-plan bootstrap remains reachable. No behavioral fixtures or execution. Return exact witness type/lifetime/indexing, symbols/lines, remaining gaps and checks NOT RUN (Main-owned).

**Disposition at the historical C1 checkpoint:** F1–F3 were verified and F4 still blocked the prefix stage. The later Main/C2 checkpoint above closes F4; full T08 and T09/T10 gates remain unchanged.


## Original R2 stopped delivery and independent static evidence

Astra `fcaafd17e1664a6eae041cd8e36e3513` completed after 1,120 seconds with a substantive **partial** handoff (38 turns, 37 tool calls, process exit 0). It explicitly did not claim R2/M2 completion. No external ABI necessity was established. This run is terminal; subsequent correction must be a new bounded assignment, not a restart.

Main independently checked `src/actor-model.js` at SHA **`26eaffa09053e25462d0f70f5b53c548e643b9bdb09f57ee38e5ee66b77f7188`**, 129,395 bytes, 1,507 split-lines:

- Syntax, tracked/untracked source whitespace: pass.
- Full existing-config supplemental TS **6.0.3** with the same documented resolution overrides: **24 roots / 350 source diagnostics / 0 actor-model / 0 dependency-global**, exit **2**. Other-source fingerprint remains `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. This is not a passing project build or a repair of pinned-compiler availability.
- Exact five runtime exports, arities **2/3/2/1/3**, required arguments and selected return aliases: pass. No incoming production consumer; no composition dependency cycle.
- All six accepted contract hashes and both accepted kernel hashes match. Protected 19-file digest remains `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`; no active-format/default/config/registration/guard change.
- Actual worker log uses only read/grep/edit. All 15 edit requests target `src/actor-model.js`: 13 succeeded, two failed exact-anchor matching; one grep regex also failed. No worker shell/write/script/test/probe/project ESM execution. Main inspected log data, not replayed tool code.
- An optional text-only inverse attempt was **not established**: short status replacements needed branch scoping, and indiscriminately reversing a repeated replacement then touched already-equivalent newly inserted text. That proof failure is not evidence of a source defect and changed no file. Do not claim an exact inverse to R1C; use the actual edit log, frozen hashes and source review.

Main read the actual producer parsers, prefix fold/correlation helpers, actor branches, view publication and reducer. The observations below are source-derived, **not executed behavioral tests or independent T09 review**.

## Useful delivered work — preserve it

- `runFold` / `applyImplementation` (618–635,877–890) now establish kernel genesis at workflow submission and reduce each implementation prefix. Missing workflow history cannot be supplied later. Archived folds use the same path.
- Concrete accepted-leaf producer/control records, delivery observations, supervisor output intents, native settlement phase/time and historical root proof bindings are retained (331–413,936–1023). Bootstrap can issue a supervisor goal before recording the first plan.
- `checkAssignment`, `settledIntent`, `reviewIntent` and `correlateKernel` (675–866) add assignment/config/workspace mappings and original producer/control/receipt/settlement checks. Workflow-plan and kernel-plan namespaces remain distinct.
- Actor attempt/report/effect/decision mirrors bind retained kernel facts; published reports/decisions/obligations derive from the kernel (1034–1129,1324–1343). Earlier review linkage is settlement-free; complete M4 artifact qualification is still unfinished.
- `composeModelInContext` and the reducer preserve a kernel `hold` model/journal (1369–1384,1488–1490), instead of converting it to apply. R1C cache validation, deep freezing, concrete readonly types and five-export boundary remain in source; static checks are clean for this module.
- Public-kernel revalidation and prefix hashing have repeated, potentially quadratic-or-worse cost. M8 aggregate work accounting is explicitly **not** complete.

## Main correction findings on `26eaffa0…`

### F1 / P1 — prompt candidate/commit does not recheck producer retirement

`activation-settled` (1009–1021) admits `aborted` or `transport-closed` for an issued activation without requiring a prior committed prompt, and sets its settlement. `correlateKernel`'s `dispatch-prepared` branch (804–809) checks workflow eligibility, original command/input/grant, owner/revision and deadline, but not the producer's terminal settlement/current exact binding. `intent-committed` (779–782) merely reuses that same predicate. The actor-only negative settlement is not visible to the frozen kernel, so its own grant checks cannot substitute for the missing producer check.

**Correction:** at fresh prompt admission and commitment, check the original producer's still-applicable reservation/lifecycle, exact current binding and immutable owner/identity/control linkage. A previously aborted/transport-closed or superseded producer must not acquire new prompt authority. Do not re-authorize already-applied duplicates, reject every legitimate prompt, or drop late truthful observations simply because current admission is denied. Preserve the separation between original producer evidence and current admission.

### F2 / P1 — observation retention and current actor admission remain conflated

The writer flags `grant-committed` / `authority-published` (794–802) because their observed kernel phase does not encode actor-only holds. **Kernel phase alone is not a demonstrated admission bug:** `activation-issued` and prompt use have actor eligibility gates, and a non-authorizing observed fact is not an effect capability. Prove whether those existing explicit admission events suffice for the late-grant path; only add a disposition where needed to prevent an actual bypass or ambiguity. Do not rewrite kernel phase or create a redundant grant registry merely to mirror actor holds.

The same distinction needs review at `intent-committed`: recursive correlation (779–782) can throw `admission-hold` for an otherwise correctly bound storage observation. `applyImplementation` then never installs `step.model` (885–888), and the reducer returns the unchanged base (1495–1500). A real, exactly bound late storage fact must not disappear merely because its actor consequence is currently ineligible. Missing original intent, wrong immutable hash/identity or malformed data is a different case and must still reject.

**Correction:** separate (a) retained, intrinsically valid observations of an established original operation from (b) permission to consume/apply it at the current actor prefix. Use the smallest closed, typed, immutable model-local disposition/derivation necessary, computed only from canonical history; prove existing explicit admission gates where they already suffice. Do not mutate the frozen kernel's grant phase, invent its semantics, treat observed publication/commit as actor authorization, or create a second independently writable implementation registry. Blocked consequences must stay blocked in actor projections/use paths. A later explicit eligible admission may be distinct, but cannot retroactively relabel an earlier held observation or repair its historical prefix. Keep Main cancellation/reconciliation/containment paths available.

### F3 / Main clarification — not every held proposal needs a journal receipt

The original handoff calls every unchanged-base actor admission hold an unretained append. The governing [R2-6 requirement](AR3-T08-R2-PLAN.md) prohibits losing **required observations** or fabricating applied transitions; it does **not** require persisting every unsuccessful proposal.

- A pure proposal denied before admission may return a frozen `hold` with the unchanged base and no fabricated append receipt.
- An intrinsically invalid, conflicting or unsupported history must not become an apparently accepted observation by a broad catch.
- An actual, exactly bound observation that must be retained needs an explicit retained/disposition path; do not discard it through the generic proposal-hold catch.

Classify the relevant actor/kernel paths explicitly. Remove the overbroad source implication that any no-append hold inherently requires a new durable proposal log. This clarification does not waive F2 or authorize silently erasing observations.

## Focused R2-C1 acceptance and authority (historical assignment)

The user's existing request covers historical-prefix replay and producer/commitment correlation. Main previously assigned C1 `62f2fb2bc00c4a83b7cf767902680433` for F1–F3; that run is now terminal and its focused correction is verified above. The separate C2 F4 assignment remains within the original [R2-1–R2-8 ledger](AR3-T08-R2-PLAN.md). [Live status](AR-03-AGENT-TASKS.md). No completed run is restarted and no model owner is changed.

Allowed: focused edits to existing `src/actor-model.js`, including necessary closed model-local disposition fields/derivations under the original R2 authority. Dispositions must be rebuilt and cache-checked, never accepted as caller authority. Precise new external ABI needs must go to Main before external edits; no such need is established so far. Frozen leaf schemas/kernel/active formats remain untouched. No whole-file rewrite or full M3–M8 implementation.

Required source walkthroughs (not tests/fixtures):

1. Normal grant preparation → actor hold → valid late grant commit/publication: retain the truthful observation and enforce denied/held actor consequences at actual admission/use. If existing fresh activation admission already supplies the required check, demonstrate it rather than add a redundant registry. Later eligibility cannot retroactively repair an earlier prefix.
2. Issued producer → aborted/transport-closed → proposed prompt: no new authority. Candidate prepared while valid → producer retirement → late valid commit: distinguish observed commitment from denied actor use. Exact already-applied duplicate remains inert; malformed/conflicting observations still reject.
3. Settled supervisor candidate → new actor hold → late storage commitment: no current actor-eligibility bypass and no disappearance of an exactly bound required observation. Missing/future producer/intent/receipt cannot become a retained success.
4. Pure proposal blocked before admission: unchanged-base hold is explicitly non-appending. No blanket catch converts input errors or programming errors into admitted facts.
5. Re-walk the reachable initial-plan → dispatch → report → supervisor candidate/commit path and separate Main cancellation, with all original R1C immutability/cache/type/signature checks preserved. Clearly retain M4 artifact and other M3–M8 limits.

Writer remains **read/grep/find/ls/edit only**, no shell/write, alternate tool bypass, tests/probes/fixtures/generated scripts/project ESM loads, delegation, temporary files or runtime changes. Do not use/read/modify/delete `/tmp/tscheck.mjs`. Main owns shared/docs/static checks after the writer stops. No concurrent writer/reviewer or moving-snapshot compiler.

Return a nonempty F1–F3/R2-1–R2-8 handoff with concrete new schemas, observation-versus-admission table, source paths, remaining gaps/costs and any exact ABI need. Checks are NOT RUN by the child. **R2 and full T08 are not accepted; 7/10 accepted; T09/T10 unstarted.**

# T08-R3-C3 — Main-checked local accounting correction

**Historical C3 checkpoint; current follow-on ownership is in [completion execution](COMPLETION-EXECUTION-PLAN.md).** At this stopped snapshot: **bounded implementation verified; not complete public-path, C3/R3/T08 or runtime acceptance.** `src/actor-model.js` SHA **`a41af8da335cc7db65129de333dc73a7c0c41df68698fde606c58f0c1584bab3`**, 186,867 UTF-8 bytes / 2,144 split-lines. **7/10 accepted; T08 partial/BLOCKED, T09/T10 unstarted; no agents running.** Original [C3](AR3-T08-R3-C3-PLAN.md), [C2](AR3-T08-R3-C2-PLAN.md), [R3](AR3-T08-R3-PLAN.md) and 106 acceptance requirements remain unchanged.

## Delivery and exact delta

Astra `33942617876d450fa8de108294d83f61` (`openai-codex/gpt-6-astra`, high) completed after 596 seconds, 41 turns / 40 Fabric calls, exit 0, and stopped editing. Main collected its complete terminal handoff, inspected all tool-start records and reviewed the changed functions before checking them. First tool action read absolute repository `package.json`; package identity was correct. Only permitted read/ls/grep/edit surfaces occurred: 50 reads, one ls, 19 greps and one focused edit with five replacements. One read/grep batch hit an escaped-parenthesis regex error; no shell/write/execution or unauthorized edit occurred. The terminal result is a source-only report, not executed integration evidence.

Main reversed the five logged replacements **in memory** and recovered exact C2 SHA `3b20e31337c1aa441c499a34bb16b8d71b1c503f1b9de88fceb60e8f2b443aaf`. Thus the change notification contains no unexplained source delta relative to that baseline.

| Current location | Reviewed change |
|---|---|
| 23–26, 924–925 | Comments accurately separate local representation charging from unmetered frozen/helper/intermediate work. |
| `composeModelInContext`, 2010–2018 | Capture/charge the complete constructed frozen model with `ensureInert(model, 'actorModel', c)` before publication. Repeated cache occurrences pay. The returned typed model is not marked as common-owned by equality. The detached capture is a real additional allocation, not prepayment for prior construction. |
| `reduceActorWorkflow`, 2111–2123 | Construct/capture one candidate in the existing operation context. Ordinary reserve encoding and candidate composition consume that exact common-owned capture; the old fresh-context reserve bypass is gone. Ordinary event/byte reserves are unchanged. |
| `reduceActorWorkflow`, 2130–2131 | Actual `ContractValidationError.code === 'capacity'` becomes frozen, non-authorizing `reject/capacity` with no model. Other rejection, hold and unexpected-error handling is unchanged. |

No other reachability blocker was established or production correction attempted. No cap, schema, import/export, registration, frozen kernel or contract changed.

## Main verification

- Syntax (`node --check`) and repository whitespace (`git diff --check`) passed.
- All **eight frozen hashes** and **19 protected files** match. Protected digest remains `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`.
- Five exports, arities, required parameters and return types verified by AST: `validateActorStateV2`/2/`ActorStateValidation`; `projectLegacyWorkerView`/3/`LegacyWorkerView`; `validateActorWorkflowModel`/2/`ActorWorkflowModel`; `validateActorWorkflowEvent`/1/`ActorWorkflowEventV2`; `reduceActorWorkflow`/3/`ActorTransitionResult`.
- Imports unchanged; static import/export and dynamic import/require scan finds **zero consumers**, dependency walk **zero cycles**. No new registration required or added.
- Supplemental **TS6.0.3**, unchanged full config, **24 roots**, external type-root/wildcard module-resolution overrides: exact before/after diagnostic records match, **350 other-source / 0 actor-model / 0 dependency-global**, zero new diagnostics. The before text was the hash-verified reversed C2 source. This is not a passing project build or restoration of the pinned TS5.9.3 command. Diagnostic semantics remain failing (equivalent exit 2).
- This run's diagnostic fingerprint is `334f31ccc33f433fa626e85f21b24eda4d97ecde5eba27438279cefa321669fc`, using sorted JSON records with full messages. This is a **different serialization**, not a claimed match to historical fingerprint `7aab6bdc…`; direct before/after equality establishes no diagnostic change.
- **23 bounded one-off in-memory checks passed**, with actual model composition/reconstruction/reducer/equality/freezing functions and real common capture/context/encoding helpers. No test files, fixtures, runners, generated scripts, project ESM/native modules or runtime were loaded/created.

The combined static command initially exited 1 because a broad string consumer scan matched two comments in frozen files. AST inspection corrected this to zero actual consumers; the unchanged passing compiler comparison was not rerun. A separate provenance allowlist initially omitted explicitly allowed `pi.ls`; that audit was corrected. Neither was a production defect or a source change.

### Exact isolated-check boundary

Actual model functions included composition, reconstruction, ordinary-event classification and reducer, plus their structural helpers. Real common helpers supplied capture, private context registration, occurrence/byte accounting, encoding and errors. **Event/root parsing, archive validation/binding, fold, usage and view derivation used explicit supplied callbacks/data. No real genesis/config/producer/kernel/inspection workflow was executed.** These are local accounting checks, not public aggregate certification.

The 23 outcomes cover: local append; one shared context; identical captured candidate at sizing/composition; two full view charges with exact repeated node/byte occurrences; no equality/provenance credit for the original typed model; cumulative candidate byte capacity; final-view node capacity; root/full-view equivalence; extra charge for supplied caches; each of seven cache conflicts; duplicate before candidate construction; same-ID conflict; sequence conflict; retained non-authorizing hold; candidate noop returning the base; inert capture before getter/parser access; unexpected error escape.

Observed **supplied-skeleton-only** costs were 84 nodes / 1,302 canonical bytes for the initial root append, 120 / 1,863 for a subsequent root append, 138 / 2,134 for the equivalent full-view append. They do **not** bound the actual workflow, archive, leaf validation or growing kernel replay. The earlier C2 44 isolated outcomes were not rerun or relabelled as current public-path evidence.

## C3 acceptance ledger

| ID | Main disposition |
|---|---|
| C3-1 | **Partial.** Expanded initial-root source obligation sequence delivered; neither actual public execution nor a numerical whole-operation fit established. |
| C3-2 | **Partial.** Producer/operation/content preimages traced, with two missing-witness limits below. No field table is treated as an executed positive chain. |
| C3-3 | **Bounded local correction checked.** Shared candidate/reserve context, complete final-view charging and actual capacity-code classification; no cap increase, reset or fake credit. Not full M8. |
| C3-4 | **Partial overall.** Local actual reconstruction/cache/returned-view boundaries checked with supplied fold/parser callbacks. Real workflow round-trip remains unverified. |
| C3-5 | **Attribution delivered; full M8 blocked at frozen seams.** Real shared charges distinguished from separately validated and unmetered work. No invented aggregate total. |
| C3-6 | **Delivered.** Only witnessed in-file defects corrected; frozen/protected scope confirmed. No other in-file blocker established. |
| C3-7 | **Partial overall.** Changed boundary outcomes checked locally; existing producer/inspection/held/base-preservation source predicates untouched. Not full-system behavioral coverage. |
| C3-8 | **Delivered.** Terminal report, stopped-source checks, precise evidence limits and live ledger updated; no task/runtime overclaim. |

**C2-7/8 remain partial.** R3-1/3/7/8 remain incomplete. Existing R3-2/4/5/6 bounded source/static evidence is preserved, not promoted to full aggregate acceptance. C3 is terminal, not an automatically renewed assignment.

## Expanded source witness — UNEXECUTED

The collected handoff contains 57 ordered obligation groups, with some groups representing multiple separate events. Its representative change means four UTF-8 bytes (`old` plus newline → `new` plus newline), not literal backslash characters. No before/after digest or total resource usage was measured for this sequence.

| Groups | Actual earlier-source obligations traced in the handoff |
|---|---|
| 1–9 | Empty root/context with exactly two configured actors; checked immutable assignment and kernel genesis; workflow submission; distinct planning supervisor dispatch/proof/control; sent/accepted/started facts; bound plan output; native settlement; independently observed usage; recorded plan. |
| 10–18 | Kernel dispatch binds settled plan and original-order request/assignment/deadline. Exact storage commitment creates task/accounting revision. Main records before identity **before every grant attempt**. Grant preparation binds accounting/budget revisions; commitment and publication precede implementer issuance and its historical root proof. Original prompt preparation/commit binds command, input ref and producer. |
| 19–30 | Actor attempt mirror; separate kernel sent/accepted/started facts and exact actor mirrors; actual turn/active-interval/usage observations; original-order V1 final-review report; actor report mirror establishes later mirror prerequisite. |
| 31–39 | Separate native run settlement and actor settlement; effect barrier bound to report/grant closure with actual admitted/settled edit; effect-settled delivery and actor effect mirror; finalized checkpoint with exact verification bindings; optional real accounting reconciliation candidate/commit and budget evaluation, without invented completeness. |
| 40–49 | New supervisor goal activation/proof; separate sent/accepted/started facts; exact all-scope approve output after finalized report; prior native base plus complete structured before/after proof; exact request, reply, delivered-reply observation and receipt original texts/refs/bytes. |
| 50–57 | Earlier kernel receipt and actor inspection mirror; native reviewer settlement after intent and delivered inspection; independent supervisor usage; operation-bound checkpoint-current observation; distinct supervisor-control kernel decision candidate; exact storage commitment; actor decision mirror. |

Every operation/command/activation/intent/task/step/attempt/lease/fence namespace must remain distinct where the actual branches require it. Digest domains remain separate: original-order V1 request/report/decision and parsed-kernel intent hashes; native `root,head,entries` snapshot hashes; V2 state/control/input/inspection/config domains; exact original proof/source-byte hashes. Artifact refs are not logical inspection IDs. Actor report/inspection/decision mirrors require their actual prior records; they cannot supply future kernel prerequisites.

Accounting reconciliation is **not** silently implied by approval: Main inspected frozen `decisionReady` (`coordination.js:615+`); it does not generally require complete task accounting. Actual reconciled observations are required to claim completeness. Main notices and mailbox scheduling are separate, unqualified paths, not fabricated prerequisites to this direct activation trace.

### Two explicit missing-witness limits

1. **Authority-content preimage:** producer/control validation checks hash agreement and the implementer path checks actual grant publication, but this selected root journal does not retain the complete earlier authority-content preimage. The wire authority domain has a defined preimage; that is not evidence it was retained in this actor history. No new authority registry or Host provenance guarantee was invented.
2. **Submission input digest:** `workflow-submitted.inputHash` is shape-checked and retained; the branch does not recompute a defined workflow-input preimage. Goal/dispatch fields are correlated separately. No new digest contract was invented.

These limit a claim of a fully witnessed chain. They do **not** prove every positive workflow is rejected, nor authorize speculative schema changes.

## Whole-operation accounting and exact external boundary

A real append includes event and root/full-view captures, constructor/leaf validation, explicit archive binding, historical-prefix hashing, every growing kernel replay, reference/source work, completed base view, candidate capture/reserve encoding, candidate reconstruction and completed next view. Full-view input also pays for every independently supplied cache occurrence.

With one complete C2 proof/request/reply/receipt chain and empty archive, each fold consumes 8 reference occurrences and `2P + 3Q + 2R + S` referenced bytes. Two complete folds consume 16 references and twice that byte expression. This is reference arithmetic, **not** a positive public operation-fit measurement. Shared counters remain capped at 250,000 values, depth 32, 16 MiB canonical/source/referenced-byte ceilings and 16 references, with unchanged per-source limits.

New final-view capture bounds a published representation; it does not retroactively charge intermediate allocations, freezes, structural comparisons, filtering or kernel execution. K kernel events invoke the frozen public reducer K times over growing journals per fold. Even linear replay would give a quadratic prefix sum; internal scans/copies can add work. Unshared leaf contexts and unmetered kernel execution are not repaired by encoding their outputs afterward.

| Frozen symbol and aggregate caller | Missing seam for complete shared accounting |
|---|---|
| `validateActivationRecordV2(value)` → producer record, from `parseActorPayload` | Intrinsic capture/constructors run with a separately created context. |
| `validateActorControlV2(value, expected)` → control, from `parseControl` | Untrusted control/binding capture and digest/envelope validation have their own context. |
| `validateTransitionEvent(value)` → event, from `parseImplementationPayload` | Frozen kernel closed/inert parser has no aggregate work/context parameter. |
| `validateCoordinationModel(value)` → model, from genesis and kernel transitions | Complete history/projection revalidation has no shared-context/work entry. |
| `reduceCoordination(snapshot, input)` → transition result, from `applyImplementation` | Revalidates growing snapshots/journals/results; neither incremental nor shared-budget entry exists. |

**No outside ABI was needed for this delivered patch.** A future leaf seam would need mandatory `(value,c)` / `(value,expected,c)`, unchanged concrete returns/predicates, registered-context validation, capture-before-access and actual constructor/source charging—not caller checked flags or content-equality credits. A kernel seam additionally needs a reviewed replay/work contract; adding an unused context argument does not close M8. These are reported requirements, **not approved or newly registered APIs**.

## Next gate

Do not restart C3 or launch another isolated-check loop as if that proves the complete public workflow. The next implementation decision must distinguish (a) the still-unverified actual public path and quantitative fit, and (b) the explicitly frozen leaf/kernel accounting boundary requiring separate scope/ABI approval. No outside-file edit is authorized by this handoff. General M3/M5–M8, archive carryover, Host and runtime remain open. [Testing policy](TESTING.md) and unmeasured regression risk remain in force.

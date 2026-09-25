# T08-R3 — Fail-closed coverage and remaining inspection gap

**Historical R3/C3 checkpoint status:** current implementation ownership is in [completion execution](COMPLETION-EXECUTION-PLAN.md). At this stopped checkpoint: Main verified bounded C3 `a41af8da…`; [exact evidence and remaining limits](AR3-T08-R3-C3-FINDINGS.md) supersede the earlier checkpoints below. Local reserve/final-view accounting and capacity reporting are checked; whole-public-path/fit and full M8 remain incomplete. All R3/C1/C2/C3 runs terminal; **7/10 accepted; no agents running; full R3/T08 not accepted.**

## Historical Main checkpoint — C1 verified; content coverage then unavailable

C1 `2e6f268129464945a2174d77d072f55d` completed after 258 seconds, 15 turns / 14 tool calls, with a substantive handoff. Main collected the terminal result and independently audited read/grep/edit only, one successful edit request with **seven replacements**, and two failed read/search calls. No child commands/tests/probes or outside-file edit. The original R3 and C1 writers are stopped and must not be restarted; the separately assigned C2 run does not change this historical checkpoint.

Checked **`src/actor-model.js` SHA `5f8167039b278c4b89c3986a8db1cd965a40a7ab7d8dc95d4a2717e682a09874`**, 167,830 bytes / 1,923 split-lines. Main evaluated only literal edit data from the logged tool request (not worker program execution); reversing all seven replacements reconstructs exact original R3 SHA `1fcf6fb1…`. Other R3/R2 source is byte-preserved outside this focused delta.

### Closed correction and supported coverage

`inspectionPartCoversScope` (738–744) establishes the explicit table below. `inspectionEvidenceIds` (751–761) requires every selected reference to validate and at least one checked projection to cover the whole supported scope. The new closed `ArtifactPurpose.part:'verification'` is registered in both the concrete type and parser (136/410), selecting the actual entire finalized `checkpoint.verification` array (782). Receipt retention now rechecks the same gate (831); reply retention, resolver, kernel receipt, candidate/commit and actor mirrors share that gate.

| Scope | Sufficient earlier checked content | Not established |
|---|---|---|
| `summary` | Exact summary, report envelope or finalized report containing the real payload summary | Empty selection; checkpoint/verification-only selection |
| `verification` | Exact complete stored verification array, checkpoint or finalized report | Empty selection; summary/envelope-only selection; external log-file contents |
| `all`, `patch`, `file` | **None yet; fail closed** | Even combined metadata, changed-path membership, `snapshotRef` or a checkpoint hash does not establish immutable file/diff contents |

Selecting a checked actual empty verification array is supported; selecting no evidence is not. A summary/verification inspection and supervisor **revise** path remains source-reachable subject to the unchanged kernel's readiness/budget/continuation predicates. Main/lifecycle branches are unchanged. No full-model execution proves that entire path yet.

### Main verification

- Syntax, source/repository whitespace, exact five exports/arities 2/3/2/1/3, required parameters/selected returns and dependency graph pass; no incoming production consumer.
- Mechanically confirmed **22 unchanged model event kinds**, both R3 event registrations and closed evidence part inventory `envelope,finalized-report,checkpoint,summary,verification`. No new event or runtime registration in C1.
- Six frozen contract and two kernel hashes match. Protected 19-file SHA remains `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`.
- Supplemental full-config TS6.0.3: **24 roots / 350 unchanged source diagnostics / 0 actor-model / 0 dependency-global**, exit **2**. Baseline fingerprint remains `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. Not a passing project build or pinned-compiler repair.
- **21/21 focused isolated outcomes matched**, exit 0. All four previously failing broader-scope cases now reject specifically for insufficient coverage; also rejected summary-as-verification, envelope-as-verification, verification/checkpoint-as-summary, empty selections and combined-metadata-as-all. Incorrect verification-array contents reject against the actual retained fact. Positive checks cover all six supported part/scope combinations, an actual empty verification array, timely inspection with late storage, and one locator with distinct artifact hashes.

The probe used actual extracted coverage, retention, parser, delivery and qualification functions with supplied leaf codec/budget and pre-existing producer/kernel callbacks. It did **not** run the complete aggregate, kernel or native runtime. No test/fixture/runner files were created and no project ESM was loaded. Exact-delta preservation plus focused checks does not certify unrelated lifecycle/accounting/archive behavior.

**R3-F1 is closed in this bounded fail-closed scope.** This does not close full M4/R3/T08 or imply that rejecting every full-scope inspection completes the requested vertical approval path.

## R3-F2 — Content implemented; public vertical-path qualification remains open

[C2 at `3b20e313…`](AR3-T08-R3-C2-FINDINGS.md) supplies the native snapshot preimage, earlier task/dispatch base and complete supported before/after image proof. Exact raw/V1/V2 hash domains, complete changes, report/verification material, deletion/mode/symlink semantics and shared inspection qualification have source/static and bounded direct evidence. Arbitrary native `diff.patch`, general binary material and unsupported paths remain unavailable.

The isolated positive receipt/settlement chain and base-promotion checks do not execute the complete initial-root → public reducer → supervisor candidate/commit → actor mirror path. Retention-only 8/16 reference measurements exclude full root/prefix/kernel/cache work. **C2-7/8 and R3-8 remain partial.** Subsequent [checked C3](AR3-T08-R3-C3-FINDINGS.md) closes the local reserve-context gap and charges final views, but its expanded workflow table is unexecuted and frozen leaf/kernel work remains outside the shared budget.

R3-2/4/5/6 retain bounded source/static evidence. R3-3 gains positive supported content evidence; R3-1/3/7/8 are not promoted to complete aggregate acceptance. C3 adds bounded local accounting evidence, not complete M8. Prior-checkpoint carryover, general M3/M5–M8 and Host/runtime qualification remain open. **7/10 accepted; full T08 not accepted; T09/T10 unstarted; no active writer.**

Historical delivery findings and assignment criteria below refer to the original `1fcf6fb1…` snapshot and are not current active-owner or open-F1 declarations.

## Original R3 stopped checkpoint (historical)

R3 writer `b8be61ccc82c48a09065d247644b6cbc` (`openai-codex/gpt-6-astra`, high) is **completed**, not to be restarted. Main collected the complete terminal handoff: 1,048 seconds, 33 turns, 32 tool calls, exit 0. The writer explicitly marked R3-3/R3-7/R3-8 partial; completion was not acceptance.

Checked `src/actor-model.js` SHA **`1fcf6fb15a5c4c06736411bc75d20af4ef0e8fdcad13e972efd269adc9335431`**, 165,489 bytes / 1,892 split-lines. Main's tool-event audit of the exact run log supplied by `agents.wait` confirms read/grep/edit only, first absolute package read, nine edit requests all naming this file: seven successful, two failed; two additional read/search programs failed. No child shell/write/test/probe/delegation. This audit used run tool events, not a Pi session transcript; oversized `agents.log` paging was truncated and was not treated as complete evidence.

| Static / boundary check | Main result |
|---|---|
| Syntax / whitespace | `node --check src/actor-model.js`, repository diff whitespace and source trailing-whitespace inspection pass. |
| Public surface | Exactly the five required runtime exports, arities 2/3/2/1/3, required arguments and selected return names. No incoming production consumer or composition dependency cycle. |
| Frozen source | Six accepted contract hashes and both kernel hashes match T06/T07. Protected 19-file SHA remains `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`. |
| Full-config supplemental TS6.0.3 | **24 roots / 350 unchanged source diagnostics / 0 actor-model / 0 dependency-global**, exit **2**. Baseline diagnostic SHA `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. Not a passing project build or repair of pinned-compiler availability. |

No external ABI need was established. New imports are existing common primitives. The source remains non-authorizing and inactive; no registration/runtime/version/default/schema changes are accepted.

## Source progress and limits

The patch adds closed Main-issued `artifact-retained` and `inspection-delivery-observed` events; replay-owned full `[ref,hash]` indexes; exact T04 wrapper constructors; original UTF-8 byte counts/hashes distinct from inspection-content digests; independent delivery observations; and common qualification at kernel receipt, supervisor candidate/commit and actor mirrors. New artifact/delivery/inspection fields are included in reconstructed workflow views and the existing whole-cache comparison.

Only current-segment journal-retained sources qualify. Global archive bytes no longer authorize inspection, and archive segments reconstruct their own retention histories. Prior-checkpoint inspection carryover remains explicitly unsupported (M7).

Evidence purpose currently selects only actual kernel report `envelope`, `finalized-report`, `checkpoint` or `summary`. It has no actual immutable file/blob/diff result or manifest-backed source binding. This limitation alone could be an honest partial implementation **only if unsupported inspection coverage is not accepted as established**. R3-F1 below violates that boundary.

### R3 acceptance attribution

| Row | Main status at this snapshot |
|---|---|
| R3-1 | Bounded current-segment retention and earlier-prefix isolation present; prior-checkpoint carryover remains fail-closed/deferred. |
| R3-2 | Concrete wrapper/hash/byte/temporal structure implemented, with targeted evidence below; not a full leaf or aggregate behavioral qualification. |
| R3-3 | **BLOCKED by R3-F1:** the declared scope is not proven by the retained evidence selection. |
| R3-4 | Qualification is wired through all required kernel/actor paths, but **R3-F1 propagates through those same paths**. Wiring is not closure. |
| R3-5 | R2 observation/admission and late-commit paths preserved by source review; timely-delivery/late-storage helper behavior checked. Full held-commit integration not behaviorally qualified. |
| R3-6 | Concrete reconstructed fields, immutable results and exact public/static boundary checked. |
| R3-7 | Partial: new work uses the enclosing context; existing standalone-leaf contexts, reserve-size context, repeated prefix/kernel work and aggregate accounting remain M8. One summary-evidence chain consumed eight reference occurrences in the isolated fold check; this is not a full reducer budget proof. |
| R3-8 | **BLOCKED:** no qualified full-scope approval vertical path is established; the writer's source ordering can reach an inadequately inspected approval. |

## Historical R3-F1 / P1 — Scope claims exceeded checked evidence

### Witnessed mechanism

- `inspectionEvidenceIds` (`actor-model.js:727–736`) iterates `reply.evidence` and validates each retained source's bytes, encoding/domain, report/checkpoint and time. It never proves that the selected `purpose.part` covers `reply.scope`. An empty array returns `[]` successfully.
- `retainArtifact` (`742–808`) permits an exact report summary as evidence. No branch establishes actual immutable file/patch contents. `inspectionProducer` (`705–716`) checks a file path is listed as changed, not that its contents were inspected.
- `resolveInspection` (`814–828`) proves scope equality across request/reply/receipt and the reviewer, then returns `scope:declaredScope` after only the above per-reference checks. Equality of the labels does not establish their coverage.
- `qualifyKernelInspection` (`832–837`), `qualifyDecisionInspection` (`842–852`), and kernel correlation (`1116–1137`) propagate that unestablished scope to receipt/candidate/commit acceptance. Actor mirror checks do not repair it.
- Frozen kernel `approvalReady` (`coordination.js:547`) intentionally consumes the retained `scope.kind === 'all'` prerequisite plus its other exact current-checkpoint/reader checks. Therefore empty or summary-only artifact evidence can satisfy the new aggregate's supposed all-scope content gate when the unrelated prerequisites hold.
- Existing immutable inspection results (`evidence.js:148–160`) distinguish all-scope patch/verification/checkpoint results from per-file immutable bytes/hash/deletion results. Report summary or finalized-report metadata does not contain that file/diff content. This is the unchanged uninspected-checkpoint requirement (proposal A23), not a request for physical provenance from a pure model.

### Direct bounded evidence

Main evaluated actual extracted R3 parser/retention/delivery/qualification functions in memory. Common codec/budget/leaf checks and existing producer/kernel lookup callbacks were supplied for controlled valid inputs. This is **not a project module load, full aggregate/kernel execution or host/runtime qualification**. No files, tests, fixtures or runners were written.

Ten expected outcomes matched:

- Valid summary inspection with exact retained summary accepted.
- Same locator with distinct content hashes accepted.
- Timely delivery with receipt storage/decision after request expiry accepted.
- Wrong request byte count, extra reply field, missing earlier delivery, expired delivery, mismatched declared scope, missing source at candidate, and settlement before inspected delivery rejected.

**Four blocking unexpected acceptances** passed both kernel-receipt and decision qualification:

1. `scope:{kind:'all'}`, `evidence:[]` — accepted, no evidence IDs, six source/reference occurrences.
2. `scope:{kind:'all'}`, only exact report-summary evidence — accepted.
3. `scope:{kind:'file',path:'file.js'}`, changed path listed but only report-summary evidence — accepted.
4. `scope:{kind:'patch'}`, only report-summary evidence — accepted.

Each summary-only case used eight source/reference occurrences. Correct wrapper/content hashes, earlier retention, delivery, producer/report/checkpoint linkage and producing settlement were supplied; the failure is missing coverage validation, not malformed input construction. The probe exited **1** because these four expectations failed. **Do not report 14 passing cases or a qualified vertical path.**

## Historical R3-C1 assignment — same approved stage and owner

The user's R3 request already covers exact inspection contents and the complete receipt/decision path. A new same-model, nonrecursive, edit-only correction may address **R3-F1 only**, starting from the checked hash above. This is not restarting the completed R3 run, changing the owner/model, authorizing T09 or expanding frozen-file access. Live run ID/status belongs in [the task ledger](AR-03-AGENT-TASKS.md).

Acceptance criteria:

1. Establish an explicit scope-to-checked-content coverage table. Qualify actual retained content for the requested scope, not merely equal scope labels or nonempty arbitrary evidence. In particular, adding `evidence.length > 0` alone does not close summary-only `all`/`file`/`patch` or analogous verification overclaims.
2. Apply the same coverage rule at earlier retention/qualification, kernel receipt, supervisor candidate/immutable commitment and actor mirror as applicable, without a mirror cycle or future-source repair. Preserve valid supported summary/verification paths only where their actual contents cover the scope. Preserve full ref/hash identity, exact bytes/digests, deadline/delivery rules and native-settlement separation.
3. **Unsupported or insufficient coverage must not become a qualified broader receipt or approval.** If existing checked facts cannot establish full inspection, fail closed for that coverage and report the exact missing model-local content/mapping or external ABI. Do not relabel partial evidence as `all`, fabricate snapshot/patch contents, accept a caller trust flag, weaken frozen kernel approval predicates, or claim a completed vertical approval path by rejecting it wholesale.
4. Where soundly achievable within this existing file and the original closed-model-local R3 authority, implement the missing concrete content linkage rather than merely planning it. Do not silently invent a new external wire/archive schema or undertake full M3/M5–M8 work. If a real outside-file seam is needed, stop at that boundary with exact symbol/arguments/return/validation/budget requirements.
5. Preserve all already checked R3/R2 behavior, especially no future settlement for an earlier receipt and no retroactive expiration of timely historical inspection at a late valid commitment. Intrinsically valid bound late observations retain their held consequences; invalid/unsupported inspection assertions acquire no authority. No automatic clearing of held commitments.
6. Preserve capture/cache/deep-readonly foundations, exact five exports and required signatures, frozen/protected files and zero owned diagnostics. No new hidden contexts, source-equality credit, budget reset or oversized-source bypass. Document any scope/cost limitation that remains.

Exclusive child edits: existing **`src/actor-model.js`**, focused `pi.edit`, read/grep/find/ls/edit only. Main owns shared/common/facade/docs/checks. First action is the absolute package identity read. No shell/write/tests/probes/fixtures/runners/generated scripts/project ESM/delegation/alternate execution. Preserve unrelated dirty work and do not use/read/modify/delete `/tmp/tscheck.mjs`.

Return a nonempty correction handoff: exact changes and scope coverage table; the four failing counterpaths plus analogous insufficient verification; a genuinely supported positive path (not an asserted label); missing content/ABI and R3-1–R3-8 status; unchanged observation/commitment semantics and explicit cost limits. Child checks remain **NOT RUN, Main-owned**. Main performs focused source/static and isolated behavioral rechecks only after the writer stops.

**Current disposition:** C1 verified the bounded fail-closed R3-F1 correction at `5f816703…`. R3-F2 above blocks complete immutable-content coverage and full-scope supervisor approval. R3/full T08 remain unaccepted; 7/10 accepted, T09/T10 unstarted, no active agents. No new writer or general lifecycle/accounting/mailbox/archive assignment is authorized by this status update.

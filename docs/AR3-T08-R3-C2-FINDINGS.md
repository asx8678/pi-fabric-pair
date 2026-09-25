# T08-R3-C2 — Immutable-content checkpoint and remaining public-path gap

**Main-verified bounded C2 checkpoint; not full C2/R3/T08 acceptance.** Checked `src/actor-model.js` SHA **`3b20e31337c1aa441c499a34bb16b8d71b1c503f1b9de88fceb60e8f2b443aaf`**, 186,353 bytes / 2,134 split-lines. Original [C2](AR3-T08-R3-C2-PLAN.md) and [R3](AR3-T08-R3-PLAN.md) criteria unchanged. C2 and subsequent C3 are terminal; [latest C3 evidence](AR3-T08-R3-C3-FINDINGS.md) does not promote this public-path gate. **7/10 accepted; T08 open, T09/T10 unstarted; no agents running.**

## Stopped delivery and preservation

Astra `6f6d3a237db64c98b25f64ab630ebeb6` (`openai-codex/gpt-6-astra`, high) completed after 800 seconds, 35 turns / 34 tool programs, with a nonempty handoff. Main collected the terminal result. Run-log audit confirms the first absolute package read, read/grep/edit only, seven successful edit calls / **35 replacements**, and one failed tool program. All edits name existing `src/actor-model.js`. Main interpreted only literal edit data, not worker program execution; reversing the replacements in memory restores exact C1 SHA `5f8167039b278c4b89c3986a8db1cd965a40a7ab7d8dc95d4a2717e682a09874`.

No child commands/tests, outside-file edits or delegation. Main changed documentation only. Six frozen contracts, both kernel files and protected 19-file SHA `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738` match. Do not restart the completed writer.

## Concrete representation

- **`task-base-recorded`**: Main-issued `{kind,issuer,taskId,dispatchOperationId,identity}` (150, 185, 253, 406–410, 1473–1487). Outer canonical event supplies workflow/owner/sequence. Requires the admitted committed current unstarted task and no earlier retained grant preparation, implementer activation or report. No timestamp or late manifest can bootstrap it. Histories without this optional fact retain C1 summary/verification behavior.
- **Native identity**: `{root,head,entries}`, entries `{path,kind,sha,size,executable}` (693–731). Explicit native property order and sorted entry order reproduce SHA-256 of native `JSON.stringify(identity)`, separately from V2 canonical hashes. Root matches assigned repository; counts/total bytes obey assigned evidence bounds. Safe integer, missing/empty/kind/mode and path/alias checks are explicit.
- **Structured proof**: `{version:1,encoding:'pair-model-change-proof/1',taskId,reportId,before,after,files,report}`. Images are `{path,before:string|null,after:string|null}` (139–161, 737–789). Both identities, the entire changed set, every supported image and exact finalized report are checked. Nested report payload must preserve its original V1 member order/hash; a V2-sorted rewrite does not preserve that hash.
- **Evidence part `structured-change`** requires `encoding:'pair-json/1'`, `hashDomain:'bytes'` (429–430, 944–950). Reference hash is the original source-text byte hash. Actual checked material—not its label—qualifies scope (893–909): file selects its named changed image; patch covers all changes; all includes the exact report/checkpoint/verification. Frozen wire wrappers are unchanged.
- **Derived data**: evidence `proof/beforeHash/afterHash` (null for legacy projections), and replay-owned `taskBases` entries `{taskId,dispatchOperationId,identity,nativeHash,establishedBy,advancedBy,reportId}`. Deeply frozen, reconstructed in views and fully cache-compared (1945+, 2027+), never an independent writable registry.
- **Base advancement** (1413–1429) is called only for a new actor-admitted kernel-apply commitment (1459). Exact committed approve plus earlier checked proof promotes that report's current identity. Candidates, revise/answer/cancel, noop and held outcomes do not advance. Approval without checked next material invalidates the optional chain instead of preserving a stale base; later proof cannot repair it.

Supported material is complete NUL-free well-formed UTF-8, at most 10,000 bytes/image, with conservative ASCII POSIX paths. Empty files, additions, deletion to missing/absence, mode changes and symlink target text are distinct. Symlinks are never followed. General binary/base64, invalid/truncated images, directory/submodule/special entries and unsupported paths remain unavailable.

This is **not native `diff.patch` authentication or reproduction**. Its storage-dependent/truncated rendering remains unsupported. An unchanged native `patchTruncated:true` may coexist with genuinely complete alternate image material; the latter does not rewrite or certify the former. No active producer/renderer, Host provenance or effect permission is added.

## Main verification

- Syntax and whitespace pass. Exact five required exports, arities **2/3/2/1/3**, selected returns and acyclic graph preserved; no incoming production consumer.
- **23 model event kinds**: base event is present in union, inventory, parser, fold and envelope-bound gate. Evidence purpose registration and derived-view initialization/projection are present. No active runtime/config registration changed.
- Supplemental existing-config **TS6.0.3: 24 roots / 350 unchanged other-source diagnostics / 0 actor-model / 0 dependency-global**, exit **2**. Baseline SHA `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. Not a passing project build or pinned-compiler closure.
- **44 distinct isolated outcomes matched**: nine initially passing checks plus 35 corrected rechecks. Initial Main setup omitted the actual `fail` helper and shared mutable before/after inputs; both setup errors were repaired without production edits. Failed attempts are not product failures or passing evidence.
- Positive cases: exact native preimage, Main pre-work binding, actual `old\n` → `new\n` contents covering all/patch/file/summary/verification, immutable images, addition/empty/deletion/mode/symlink cases, real wrapper/delivery/receipt and settled-decision qualification, late storage, exact approval-base promotion and unchanged native truncation metadata.
- Counterpaths: late/duplicate/non-Main/held-dispatch bases, malformed/aliased/conflicting paths, wrong base/root, omitted images, bad bytes/nulls, altered report/V1 order, NUL/surrogate/oversize material, raw-hash/format mismatch, empty/metadata-only broader scope, wrong reply reference, premature settlement and revise/held/duplicate/no-proof promotion guards.

Checks extracted actual selected model functions and real common codec/hash/registered-budget helpers, including real inspection-producer and delivery predicates. **Kernel projections and activation/control facts were supplied input data.** No full aggregate, kernel, public reducer or native runtime was executed. No test/fixture/runner files or project ESM loads. No T09 review is implied.

### Measured retention accounting, not whole-model accounting

One isolated complete retention chain: **8 references / 8,012 referenced bytes**, 295 charged nodes / 6,607 charged bytes / 4,162 source bytes. Two folds in the **same registered context**: **16 references / 16,024 referenced bytes**, 590 nodes / 13,214 bytes / 8,324 source bytes. A seventeenth reference rejects. The implementation formula is `2P + 3Q + 2R + S` for proof/request/reply/receipt source lengths.

These figures include selected base/retention/qualification work, **not** complete root capture, historical grant/publication reconstruction, every kernel replay, final views or public base/candidate reconstruction. They verify reference arithmetic, not public append reachability or aggregate work. Extra chains/archives still face the unchanged cap.

## Acceptance and next gate

| Criterion | Main disposition |
|---|---|
| C2-1 | Bounded source/static/direct evidence for native identity/hash rules. |
| C2-2 | Initial base and advancement/invalidation checked; whole lifecycle not qualified. |
| C2-3 | Complete supported image/change linkage and rejection paths checked. |
| C2-4 | Concrete inspectable subset verified; native diff text remains unsupported. |
| C2-5 | Checked-content coverage and C1 fail-closed preservation verified. |
| C2-6 | Shared chain and commitment guard reviewed; selected receipt/settlement checks pass, not full kernel/aggregate execution. |
| C2-7 | **Partial:** real retention accounting verified; public reachability/work unverified. |
| C2-8 | **Partial:** handoff, registrations, preservation and positive internal chain verified; complete public candidate/commit/mirror path unverified. |

R3-2/4/5/6 retain bounded source/static evidence. R3-3 gains positive supported content evidence; R3-1/3/7/8 are not promoted to complete aggregate acceptance. Archived-prefix carryover, general M3/M5–M8 and Host/runtime qualification remain open.

**Following gate remains incomplete:** actual initial-root → public reducer → full-scope supervisor candidate/commit → actor mirror reachability and quantitative whole-operation fit. Subsequent C3 Astra `33942617876d450fa8de108294d83f61` completed; Main checked [local accounting corrections at `a41af8da…`](AR3-T08-R3-C3-FINDINGS.md), including the fresh-context reserve gap. Its detailed source obligation table is unexecuted; frozen leaf/kernel M8 seams are now explicit. No restart, cap increase, trusted-state shortcut or new task acceptance; no active writer.

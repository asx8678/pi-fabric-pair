# T08-R3-C2 — Immutable content linkage and positive full-scope inspection

**Execution:** C2 Astra `6f6d3a237db64c98b25f64ab630ebeb6` remains terminal at verified `3b20e313…`, with [C2-7/8 partial](AR3-T08-R3-C2-FINDINGS.md). Subsequent C3 Astra `33942617876d450fa8de108294d83f61` also completed; Main checked [bounded `a41af8da…`](AR3-T08-R3-C3-FINDINGS.md), not complete public-path/work acceptance. No restart, no agents running. **7/10 accepted.** Original criteria unchanged.

## Authorization and ownership

The user said **“do next”** after Main verified C1's fail-closed correction and identified immutable snapshot and patch/file evidence linkage as the remaining [R3-F2 blocker](AR3-T08-R3-FINDINGS.md). This authorizes a new bounded continuation of R3, not a restart of terminal R3/C1 or a change of model owner. **T01–07 remain accepted (7/10), full T08 remains BLOCKED, T09/T10 are unstarted.** [The task ledger](AR-03-AGENT-TASKS.md) owns live run status.

- Main reconfirmed repository `/Users/adam2/projects/pair/pi-fabric-pair`, stopped model SHA **`5f8167039b278c4b89c3986a8db1cd965a40a7ab7d8dc95d4a2717e682a09874`**, all eight frozen hashes and the protected 19-file digest before assignment.
- Same approved Astra `openai-codex/gpt-6-astra`, high, one nonrecursive source writer with **read/grep/find/ls/edit only**, extensions enabled. Mandatory first action: read absolute repository `package.json`, verify `pi-fabric-pair@0.1.0`, stop with zero edits on mismatch. No shell identity command.
- Exclusive edits: **existing `src/actor-model.js`**, focused `pi.edit`, no whole-file rewrite. Necessary closed **model-local** snapshot/base/content-proof events, artifact purposes and reconstructed readonly views are authorized below; enumerate exact shapes and issuer/prefix rules. No public export addition or second independently writable registry.
- Six accepted contract modules, `coordination.js`, `transitions.js`, `evidence.js`, Controller/runtime, active formats/config/defaults/examples/registrations/guard and other production files remain frozen. Main owns shared/common/facade/docs/integration decisions. A real outside-file need requires exact symbol, arguments, result, validation/accounting semantics and caller **before** an external edit.
- No concurrent writer/reviewer, child delegation, bash/write, alternate execution/provider workaround, tests/probes/fixtures/runners/generated scripts, project ESM execution, installation, native/live work or runtime activation. Do not use/read/modify/delete `/tmp/tscheck.mjs`. Preserve unrelated dirty work, including `%1`. Child checks are **NOT RUN, Main-owned**.
- Read [testing policy](TESTING.md), the [R3 ledger](AR3-T08-R3-PLAN.md), [latest findings](AR3-T08-R3-FINDINGS.md), [D1–D6](AR3-01-DECISIONS.md), [T01 ABI](AR3-T01-INTERFACE.md), [T06 artifact types](AR3-T06-HANDOFF.md), [T07 kernel obligations](AR3-T07-HANDOFF.md), and relevant source. This assignment supersedes older active-owner wording, not accepted contracts.

## Witnessed source facts — do not guess these formats

### Native snapshot and report

`evidence.js:73–118` captures sorted unique Git path names. Each entry is constructed in this order:

```text
{path, kind:'file'|'symlink'|'missing', sha:string|null,
 size:nonnegative integer, executable:boolean}
```

Missing entries have `sha:null`, `size:0`, `executable:false`. Files hash exact bytes; symlinks hash the UTF-8 target text and are not followed. The snapshot identity is **`{root, head, entries}` in that field order**; `head` may be null. The existing hash is raw SHA-256 of `JSON.stringify(identity)` (`util.js:12`), **not** a V2 domain-separated/canonical digest. The returned snapshot additionally includes `hash`, `capturedAt`, `totalBytes`; the latter metadata is not in that identity hash. Exact native field/entry order matters. A typed reconstruction must explicitly reproduce this native preimage, not hash a V2-sorted variant or trust a supplied `hash`.

`checkpoint` (`evidence.js:125–146`) compares the sorted union of before/after entry paths using exact native entry representations, derives all changes (including executable/kind/missing/absence changes), and stores:

```text
{version:1, taskId, reportId, baseHash, checkpointHash, root,
 changed, changedBytes,
 files:[{path,before:entry|null,after:entry|null}],
 snapshot:current, verification, patchTruncated, createdAt}
```

The frozen finalized report retains only `{path,checkpointHash,changed,verification,patchTruncated}` and `snapshotRef`, not that manifest or file contents (`contracts.js:51–53`, `coordination.js:190–197`). The manifest's asserted `baseHash` is not covered by the current snapshot's checkpoint hash. A locator's basename is not proof of a digest or original bytes.

### Native diff is a separate artifact

`evidence.js:130–145` generates `diff.patch` using `git diff --no-index` for changed regular-file blobs, otherwise writes before/after hash summaries. That string can contain storage-dependent headers and be truncated. Neither its bytes nor the base manifest are authenticated merely by the current snapshot hash. `inspect` (`148–160`) returns all-scope patch/checkpoint/verification metadata or a requested file's independently checked blob bytes/hash/deletion result. Never execute this module or the diff command from the pure model.

### Base lifetime

Controller captures/saves a task base before its work (`controller.js:315–322`), uses it when finalizing reports (`529–538`), and moves the base to the approved report snapshot **on approve**, not revise/answer (`621–641`). The pure kernel creates a committed task with task ID/dispatch operation but **no base snapshot fact** (`coordination.js:587–595`). Therefore an unbound before-image or caller manifest cannot establish the original task base. Add the minimum model-local prefix fact instead of pretending the kernel already stores one.

### Current actor-model path and cost

At the starting hash, C1's `inspectionPartCoversScope` (`738–744`) permits only actual summary/verification projections. `inspectionEvidenceIds` (`751–761`) is shared by reply/receipt retention, resolver, kernel receipt, candidate/commit and mirrors; preserve its fail-closed rationale. Current evidence retention requires a finalized report (`772+`), so pre-work base retention needs a distinct valid model-local path, not a circular demand for a future report.

`reduceActorWorkflow` (`1878+`) reconstructs base and candidate using the **same** registered context. One supported current inspection chain already uses eight source/reference occurrences per fold. Extra out-of-line sources can make an apparently valid standalone proof impossible to append under the 16-reference operation limit. Count both folds. A genuinely inline, closed base-snapshot value may be charged as root/event data rather than adding an unnecessary reference; this is **not** permission to decode raw embedded source text for free, skip bytes/nodes, hide source copies or reset contexts. Full M8 is still open.

## Model-local representation decision

Do not attempt to authenticate arbitrary `diff.patch` text with only the checkpoint hash. For this inactive pure model, a **closed, versioned structured change proof containing complete verified before/after image material** is an acceptable model-local patch representation. It is stronger than metadata, not a fabricated native Git diff. Pin its exact encoding/fields in the source and handoff. T04 request/reply/receipt and `PayloadRefV2` wrappers remain unchanged; the new representation is actual retained evidence behind an existing payload reference, not a silently changed wire envelope or active producer.

A complete structured proof must identify the real report/task, bind both native snapshot identities, enumerate the exact entire change set and contain the bytes/material actually needed to inspect each supported before/after state. An asserted digest, flag, path, byte count or metadata projection is not that material. A `file` view selects exact verified material for the requested path; a `patch` view covers all changes; `all` additionally includes the report/summary and complete stored verification/checkpoint material, all bound to the same checked history. It is acceptable to package a complete bounded proof in one evidence source to avoid gratuitous references, but every supplied byte/value still pays the existing operation bounds.

If legacy rendered patch text is retained, do not qualify it unless its actual semantics/content are checked against the immutable images. Otherwise explicitly leave that representation unsupported. Do not claim byte-for-byte `git diff` compatibility, host provenance, native inspector integration or binary support not actually implemented. Any later ActorHost rendering/producer must explicitly implement and review the new model-local proof; no active caller is changed here.

## Acceptance ledger — C2 / R3-F2

| ID | Concrete required behavior |
|---|---|
| C2-1 Native snapshot proof | Construct closed, bounded, concrete snapshot identities and exact native digest preimages. Bind root to the assigned repository, safe path identity to the actual entry, sorted/unique complete entry sets, kind/sha/size/executable consistency and safe aggregate arithmetic. Reject malformed hash/order/root/path aliases and unsupported forms without silently normalizing hashed data. No filesystem access, symlink traversal or locator-to-digest inference. Preserve native/V1 hashes separately from V2 wrapper and raw-source hashes. |
| C2-2 Prior base binding | Introduce a minimal Main-issued canonical pre-work base fact bound to the actual workflow/committed task/dispatch and owner history. Establish it before that task's initial implementation authority/work can be consumed (choose and document the exact conservative boundary), never retroactively from a later report or a claimed capture timestamp. Do not break existing summary/verification-only histories merely because they lack this optional stronger proof; those histories simply cannot acquire full coverage retroactively. Permit later base advancement only from a genuinely admitted committed approval and its exact checked report snapshot, not revise/answer/cancel, a candidate, stale/noop mention, denied/held commitment or future fact. Cover initial and subsequent-report rules explicitly. |
| C2-3 Complete image/change linkage | Bind the current native identity digest to the actual finalized report checkpoint and the before identity to C2-2. Recompute the full sorted changed set and compare it with the retained report. Check exact before/after contents, raw digest, byte length and kind/mode metadata for every claimed image. Distinguish absent, missing, empty file, deletion, addition, same-hash metadata change and symlink target data. Explicitly bound/support or reject binary/encoding/truncated cases; never silently drop a changed entry or treat metadata as its bytes. A supplied base/current manifest, proof's own hash or opaque snapshotRef cannot bootstrap its own truth. |
| C2-4 Concrete inspectable representation | Implement the closed model-local structured change proof described above, with truthful completeness/encoding semantics. A nontrivial supported positive case must contain actual changed content—not only hashes or an empty workspace. Retain exact original source, declared ref/digest/byte semantics and complete field validation. Native patchTruncated must not be ignored or rewritten: distinguish any genuinely complete alternate material from the old truncated rendering, otherwise hold/reject incomplete coverage. No spoofed 'verified' or caller-provided completeness authority. |
| C2-5 Scope coverage | Extend coverage from actual checked contents, not a new purpose label alone. `file` requires the named complete checked file/deletion material; `patch` covers the exact complete change set; `all` covers that set plus the same report/summary and full stored verification/checkpoint material. Keep C1's supported summary/verification rules, reject its original four overclaim cases and mixed/unrelated/partial data. Report exactly which encodings/kinds remain unsupported. The new body must be the material named by the delivered reply's evidence refs. |
| C2-6 Prefix/decision integration | Use the common checked chain at source retention, reply/receipt, kernel receipt, supervisor candidate, immutable commitment and actor mirrors. Preserve distinct Main/lifecycle branches, operation namespaces, all-scope/current-checkpoint approval predicates, historical delivery versus native settlement and current actor eligibility. Timely historical inspection does not expire retroactively at late storage; intrinsically valid late commitments retain denied/held actor consequences. No future source/base repair, mirror cycle, automatic held-commit clearance or base promotion from a held result. |
| C2-7 Bounded append reachability | Show a small nontrivial complete proof fits actual existing envelope/root/depth/node/source/reference limits in **both** validation and public append, including base+candidate reconstruction. Avoid unnecessary reference indirection; do not relabel out-of-line decoding as free inline work, create hidden contexts, skip common accounting, enlarge caps or award equality credit to separate sources. If a real private seam is unavoidable, report its exact contract before a frozen-file edit. Keep residual M8/archived-prefix/large-history costs explicit instead of claiming aggregate-work closure. |
| C2-8 Complete handoff/preservation | Give a reachable positive full-scope receipt → actual settled supervisor candidate → commitment → mirror source sequence, including the earlier base and changed file bytes, plus malformed/omitted/wrong-base/stale/held/bounds counterpaths. All new records/events/views are closed, deeply immutable, replay-owned and fully cache-compared. Preserve capture-before-access, concrete readonly types, the exact five exports/required signatures, no consumer/cycle and all frozen boundaries. No any/suppression/trusted-state fabrication, live integration, general lifecycle/accounting/mailbox/archive expansion or claim that T08 is complete. |

The exact model-local shape, internal helpers and safe supported encoding subset are implementation choices inside these constraints, not permission to change frozen leaves. Prefer a coherent bounded complete positive path over broad permissive format support. If a requirement is genuinely blocked, preserve useful fail-closed work and name the exact missing fact/seam; rejecting all full-scope approvals is not completion of this assignment.

## Delivery and Main verification

Return a nonempty terminal handoff:

1. Edited path; C2-1–C2-8 and inherited R3-1–R3-8 done/partial/blocked with exact symbols/lines.
2. Every new closed shape/event/issuer and native/V2/raw hash preimage; exact structured-patch versus native-rendered-patch distinction; supported/unsupported encoding and kind table.
3. Initial and approval-advanced base lifecycle, with explicit source-prefix/commitment requirements and held/noop rejection.
4. Positive nontrivial full-scope walkthrough and counterpaths; per-public-operation reference/source/byte work, including both reducer folds; precise ABI need if any.
5. Preserved C1/R2 protections, remaining limits, and checks **NOT RUN, Main-owned**.

Public runtime exports remain exactly `validateActorStateV2`/2 → `ActorStateValidation`, `projectLegacyWorkerView`/3 → `LegacyWorkerView`, `validateActorWorkflowModel`/2 → `ActorWorkflowModel`, `validateActorWorkflowEvent`/1 → `ActorWorkflowEventV2`, `reduceActorWorkflow`/3 → `ActorTransitionResult`; all parameters required and results non-authorizing. Initial archive context remains explicitly empty.

Main reviews/checks only the stopped source: syntax/whitespace, exact public symbols and new closed registrations, dependency graph, frozen/protected hashes, full-config supplemental TS6.0.3 attribution and bounded one-off in-memory checks of actual changed functions. No test files/fixtures/runners or project/native module loads. Report any supplied callbacks and unverified whole-model behavior honestly; isolated checks do not qualify the runtime or T09.

Starting compiler checkpoint: **24 roots / 350 unchanged source diagnostics / 0 actor-model / 0 dependency-global**, exit **2**, baseline SHA `7aab6bdc4b933b27bd72034ca5e8a6a7e4f57223a5cd757742c4c60e519a8730`. Protected 19-file SHA `fd43f0f2dd50745aed4df6d007522e180ac6badd514da7085f2d1b369ef69738`. Pinned compiler availability/project build and all runtime/qualification gates remain open.

Main records verified closure or precise findings before any later assignment. No completed run is restarted; no moving-source compiler or simultaneous source reviewer. This is R3-F2 implementation, not full T08 acceptance.

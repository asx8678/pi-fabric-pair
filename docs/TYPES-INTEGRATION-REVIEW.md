# Typing/validation integration — independent review and correction

## Independent finding boundary

Read-only Astra `257ea3d72e1e4b81984fb23b0955f915` STOPPED with **BLOCKED**, inspecting the stopped contracts/Controller/evidence/Main slice only. It did not inspect the moving actor model and ran no checks/commands, edits or native/provider execution. This is not T09.

1. **Medium: default summary inspection bypassed intrinsic snapshot validation.** Former `src/evidence.js:240–257` validated snapshot/hash/root only inside the file branch. A malformed retained snapshot could pass ordinary pair_inspect and reach Controller's inspectedAt publication (`src/controller.js:795–798`), the approval prerequisite at line736. Move intrinsic snapshot and manifest hash/root checks ahead of the branch; this is not a provenance oracle or full manifest authentication.
2. **Medium: summary patch read was unbounded.** Former evidence.js:257 loaded the entire diff.patch via fs.readFile and only then truncated presentation. Use an actual bounded read consistent with producer output. This was retained debt, not a newly introduced regression.

The reviewer otherwise supported telemetry shape/binding/post-await fencing, valid stale versus malformed behavior, DUR-02 old-owner latch classification/duplicate comparison, snapshot/capture ordering, owned references, file inspection, Main's five tools/real validators and migration scope/consent by source inspection. Close failure may still mask an earlier read/stat error.

## Main correction — source and focused observations

Main edited **src/evidence.js only**, disjoint from actor-prefix owner `884b09f9b7a44cff99af82c69b6350cd`.

- Snapshot validation and snapshot/manifest hash/root binding now run before either inspection branch. File after-image checks remain.
- Summary patch uses the existing bounded file-handle reader, not readFile. Producer's existing 1,048,576 UTF-16-unit truncation remains unchanged, now named MAX_PATCH_CHARS. MAX_PATCH_BYTES is 3,145,728: UTF-8 requires at most three bytes per UTF-16 unit, including lone-surrogate replacement. This avoids rejecting valid non-ASCII producer patches while bounding actual reads. Presentation truncation remains 60000 units.
- No Controller change: its real inspect method awaits evidence before entering the transaction that sets inspectedAt, and still rechecks control/report identity.

Corrected evidence SHA-256: `ba374b0db17f645175b7b6fde923c1a0fb20e64b9ed27765a14ae96df4327610` (supersedes the evidence hash in the earlier C6 checkpoint; other slice files unchanged).

Syntax and Evidence-only diff whitespace pass. **17 focused outcomes pass** using actual selected Evidence/validator/helpers and the whole actual Controller.inspect method with explicit in-memory filesystem/control adapters: preserved producer limit; bounded valid summary; invalid SHA/hash/root/missing snapshot rejected before patch open; maximal three-byte Unicode patch accepted; oversize rejected before bytes/handle closed; growth/stat drift/non-regular/read-failure rejection; file inspection preserved; valid summary publishes inspectedAt; malformed or oversized summary cannot publish that prerequisite; post-await revocation blocks publication. All filesystem-write/spawn surfaces were blocked; no native runtime or test/fixture/runner files were created.

The original independent verdict remains a historical BLOCKED result, not retrospectively CLEAR. Main has corrected and locally checked both findings; this is not a fresh independent re-review. The later [stopped prefix/Evidence combined check](C6-PREFIX-FINDINGS.md) covers the correction and again passes all24 roots with zero supplemental diagnostics. This still is not pinned or native/runtime certification.

Trusted storage, ancestor directory/symlink replacement, platform O_NOFOLLOW/Git races, full manifest authentication, close-error masking, pinned compiler and native/runtime gates remain qualified. Main Apply binding races and UI width remain separate work.

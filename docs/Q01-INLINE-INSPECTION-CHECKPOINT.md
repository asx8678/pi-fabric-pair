# Q01 inline inspection — implementation checkpoint

**Status: N1/Q01 public-model history now passes the bounded checks below. F1/T09/T10 independent review/re-freeze remains open; no Host/runtime/native qualification.** Contract: [inline inspection amendment](Q01-INLINE-INSPECTION-CONTRACT.md). Next order: [implementation plan](NEXT-IMPLEMENTATION-PLAN.md).

## Source delivered

Only `src/actor-model.js` changed in production:

```text
SHA-256 c3812a4d23b72aa7ae78f533103ea676a729dcebb8bc020161196de07bbb5777
```

- Adds the closed `artifact-retained` / `purpose:{kind:'inspection-content'}` carrier with the complete structured inspection wrapper. Intrinsic parsing checks the wrapper and charges every nested reference in the operation's shared context.
- Factors `qualifyInspectionSource` so raw and inline forms use the same actual historical producer, intent, finalized report, scope/evidence, source length, deadline and observed-delivery gates.
- Retains canonical inline wrapper length/hash with `originalBytesHash:null` and `canonicalBytesHash`; does not claim original transport bytes. Existing raw inspection and evidence forms keep their original text, hashes, lengths and reference charges.
- Private parsed payload ownership permits replay to consume its actual checked inline wrapper without a second parse. No supplied cache flag, equality discount, new context, invented locator or skipped archive charge.
- Old/new forms are explicit, never automatically migrated. Active versions, public exports, kernel kinds, facade, wire schema and all caps are unchanged. There is still no Host consumer.

Other 23 production files are unchanged by this pass. Before/after SHA-256 of their ordered `shasum -a 256` listing: `aeb1071810bb878f2201bbd43e4a9d3f0a197a8d3e9965e0f415becf9b5f11c1`.

## Full public history and measured boundary

Current no-file checks read previously retained raw event data, rebuild all dependencies in memory, and call only public aggregate entrypoints. They do not execute the old file-writing runners, inject a derived cache as authority, call a private kernel to advance history, or generate new test/fixture/runner/output files. The seed is the prior 102-event history (original raw segment SHA-256 `2ab56a6e7e282a7e94b16d180dd9d631d8ad1eb4933fd6f69b831505b5da044d`). Actual new control/inspection hashes, named-prefix proofs and public-model commitment hashes were recomputed, not bypassed.

**102 events applied**, including:

1. Submission/authority, supervisor plan, implementation dispatch/grant/publication.
2. First report, effect/accounting settlement, genuine all-scope inspection chain.
3. Structural revise with successor `acceptance:['Replacement complete']`, fresh continuation grant and implementer authority.
4. Second implementation/report, complete second all-scope inspection chain, final approval and Main notice resolution.
5. Unknown mailbox reconciliation, released occupancy and workflow closure.

Final workflow is `completed`, accounting complete, unresolved obligations empty. The successor's acceptance survives in the kernel/catalog. Revise preserves the approved base and charges one revision; `step1`/`step3` share lineage, report1 debt transfers to step3, and final report2 approval clears debt/advances the base. Replay matches incremental public data, a JSON-roundtripped model cache validates on duplicate retry, and every accepted reduction leaves its input unchanged. Comparison is canonical data equality, not JS prototype identity.

| Rotation count | Outcome | Reference budget |
|---|---|---|
| 0 | Complete two-chain history applies | 10 |
| 1 | Pass; full workflow/mailbox/accounting carried | 11 |
| 2 | Pass; required second rotation covered | 12 |
| 3–6 | Pass; actor lifecycle also carried | 13–16 |
| 7 | Correct rejection: `capacity`, `reference`, `Aggregate reference limit exceeded` | Would require 17 |

Later segments contain actual public Main-authorized actor-lifecycle pause events; empty segments are not archivable and were not counted as passing rotations. Checkpoint event counts/revisions are cumulative. Each rotation is a fresh public operation whose archive replay uses one shared context; this is not a context reset within a replay. At the cap, not every additional reference-bearing append/retry is guaranteed to fit. No unbounded-retention claim.

The unchanged raw representation still validates the original non-archived history and still rejects its first archive at the 17th reference. Existing callers must deliberately select the new inline carrier to obtain the new fit; no historical bytes are rewritten.

## Targeted checks

**36 targeted checks passed**, in addition to the full 102-event construction and rotation series:

- Six valid intrinsic inline events; missing wrapper, extra fields/original, wrong issuer and wrapper/artifact digest mismatch rejected.
- Rehashed but incorrect request/evidence lengths, missing request source, historical producer, scope, delivery identity/timing and empty all-scope evidence rejected by actual replay gates.
- Duplicate source identity rejected. Seventeen equal nested reference occurrences still exceed the cap; no hash-equality credit.
- Oversized malformed content rejected; shared depth, object-node and byte exhaustion rejected. Existing per-event envelope/work/source-count checks remain source-reviewed and enabled; no claim that every work/envelope threshold was separately exhausted.
- Forged canonical hash, invented original-byte claim and changed byte length in cached views rejected. Canonical hash/length derived from every inline inspection matches its actual wrapper.
- Raw source hashes and cache shape preserved; raw archive capacity behavior preserved; mixed raw reply after an inline request succeeds with exact actual lengths.
- Stale structural coordinate, wrong plan hash and attempted base replacement rejected. Superseded late commitment remains held when replaying the retained supersession history through current public APIs; no old plan resurrection.
- Shared lineage/debt/once-only charge, final debt clearance/base advancement, and six-pass/seventh-fail rotation boundary checked.

Probe-construction mistakes were inspected and corrected without product edits: current versus named historical proof prefix, prototype-sensitive equality, cumulative archive revision/empty segments, and an oversized-array shape rejection mistaken for aggregate node exhaustion. The corrected node-overflow input rejects `capacity` / `event.extra.124972` / `Own-key limit exceeded`. These setup failures are not concealed product passes.

## Static and review evidence

- `node --check src/actor-model.js`: pass.
- Supplemental strict TypeScript check: **24 production roots, zero diagnostics**, using installed TypeScript and actual SDK/Node/MCP/TUI declarations. Not the unavailable pinned-toolchain gate.
- Public source declarations remain five aggregate exports; the six coordination exports and 27 kernel kinds are untouched. No new runtime tool/config registration, facade or package-script entry.
- `git diff --check`: pass at stopped source. Other-production fingerprint matches before/after.
- Bounded Contour working-tree review ran. It covers accumulated uncommitted work, not just this slice, and reported complexity advisories in existing reducer/runtime functions. It is structural exposure, **not** independent semantic CLEAR or T09.

## Acceptance ledger and next action

| Check | Status |
|---|---|
| IC-01 closed intrinsic carrier | Bounded public checks passed |
| IC-02 identical historical proof gates | Shared source path + targeted public negatives passed |
| IC-03 raw/mixed compatibility | Bounded public checks passed |
| IC-04 byte provenance/cache/parity | Bounded public checks passed |
| IC-05 complete acceptance-bearing Q01 + rotations | Passed for the public-model history described above |
| IC-06 resource bounds | Reference/depth/node/byte rejection witnessed; work/envelope/source-count guards source-reviewed, not exhaustive threshold qualification |
| IC-07 static/surface/preservation | Supplemental compile and preservation pass; independent F1/T09/T10 and pinned gate remain open |

**Next: N2 / F1 — fresh stopped-source T09 review, resolve findings, then T10 contract/matrix/hash re-freeze.** Include this additive carrier and its original-versus-canonical byte distinction. Host cutover remains behind that gate. No live workers, paid/native probes, installation, settings Apply, user-data migration or commits occurred.

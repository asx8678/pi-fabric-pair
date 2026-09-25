# C6-PREIMAGE / M1-C — bounded source checkpoint

## Delivery and ownership

The E1 writer `2226895cb10a4762a03e13a5b5393c0b` terminated after a provider usage-limit error, without a normal final handoff. Main recovered the actual `src/actor-model.js` and `src/actor-wire-contracts.js` candidate; termination itself was not acceptance. Main then made the separately scoped M1-C occupancy correction in actor-model only. No writer is running for this slice. The separate runtime reader stopped; its integration findings are summarized in [the downstream audit](DOWNSTREAM-RUNTIME-SCOPE-AUDIT.md).

Evidence candidate identities before M1-C:
- actor-model: `5001c58a1995a2cbbf0b9cd3de5e47095a86bfb96925fb8b18c534d6e1e73b34`
- actor-wire-contracts: `5602ebc51bb8fac5d97bfe18cf83506f394cedb3048f576b2ecf621da119de43`

After M1-C, actor-model is `0bb34dc46c318a90ce7b85ad97a86e7f26a12bcb412933612d6975ed36662bd6`; wire is unchanged. Main did not change util.js (observed SHA `6da4784d6aaed318b6aa4d2f1e9e35e9ae513f402a0929ad512d9582ae973e4b`). Existing unrelated dirty work is preserved.

## Implemented evidence path

- Closed supplied semantic submission input includes owner/Main, workflow/store/request, participants, deadline, full assignment and implementation genesis. Its digest and duplicated content must match the actual submitted event.
- Main retains prospective inline authority before activation. The private mandatory-context wire leaf reuses real authority predicates; it does not manufacture an external reference or authority-control wrapper.
- Shared historical/incremental replay verifies actual prefix membership, producer/proof/dispatch/command/deadline correlations and derived evidence caches. Implementer retention additionally checks the applied/open kernel publication and actual assignment; this branch has source inspection, not a completed public implementer history in this checkpoint.
- Missing earlier evidence is explicitly unsupported. Present conflicts reject. No reconstructed historical evidence, original-byte provenance claim or V1 runtime rollout.

Main directly imported actual production modules in no-file Node invocations. The initial run had 16 passing checks and three incorrect probe assertions: strict prototype equality was inappropriate for canonical JSON, and structuredClone preserved aliases that unintentionally changed both compared fields. Corrected detached negative inputs and canonical comparison passed, along with seven additional checks (10/10 in that run). No production defect was inferred from those three initial probe errors.

Covered: genuine initial root → submission → prospective supervisor authority → actual-prefix activation; canonical replay parity; immutable evidence/fork isolation; omitted input and missing/after-prefix authority; conflicting objective/owner/Main/store/deadline/participants/genesis/hash; conflicting retained owner/workflow/command/deadline; exact retries and unique retention; forged derived caches; invalid-context-before-access; zero inline-reference charging; real authority-control reference and byte-length checks; real byte/work exhaustion; atomic rejection. These are bounded observations, not a retained regression suite or full-workflow acceptance.

## M1-C: live mailbox capacity

The public reducer reproduced a terminally consumed entry as `released:true`, yet ordinaryCount=1 and ordinaryBytes=17; the next message incorrectly held for capacity at a configured limit of one.

One metered `mailboxOccupancy` scan now supplies both admission and published counts/bytes for ordinary and reserved-control lanes. It excludes only released entries. History, dedup keys and unknown outcomes are not deleted or rewritten. Journal/root limits remain unchanged.

Ten no-file public-path checks passed: each terminal outcome (consumed/rejected/not-sent) releases and reuses ordinary capacity; unknown outcomes remain occupied with no-append capacity holds; dedup survives release and rejects conflicting payloads; full control count/byte capacity is reusable; control unknowns remain occupied independently of ordinary admission; zero ordinary capacity preserves control reserve; stale cached counts reject; failed admission preserves caller/base data. Historical/incremental parity was checked on resulting histories.

This does not fix the metadata-only mailbox envelope, incomplete full-key/content dedup, unknown-to-terminal reconciliation proof, provisional fairness selector, archive carryover or runtime mailbox integration. M1 remains open.

## Static/review boundary

Syntax checks passed for both modified evidence modules. The stopped final supplemental compiler covered all 24 configured production roots with zero diagnostics, using installed TypeScript and real SDK/Node/MCP/TUI declaration mappings. No source exclusions, shims, dependency installs or tsconfig changes. The unavailable pinned-toolchain gate remains separate.

Final mechanical checks confirmed eight protected wire/facade/common/record/migration/kernel/transition/util hashes unchanged by M1-C, 115 local documentation links resolving, and clean whitespace. `npm pack --dry-run --ignore-scripts --json` succeeded with 74 files, including the implementation/checkpoint and no test, fixture, dependency or session directories; no tarball was created. This is package-content inspection, not installation verification.

The five aggregate arities remain 2/3/2/1/3 in their documented order. The new three-argument authority leaf remains private-module-only; no facade/runtime tool/config entry is added. Main source review traced parser → shared fold → private fork → published caches → public consumer. Contour's stopped working-tree scan reported no extraction gaps or policy violations, but complexity advisories and partial graph coverage; it is not independent correctness certification.

Independent E1/M1-C review, full implementer/report/inspection/approval history, two-chain resource fit, E2 replanning, full M1/A1, T09/T10 and AR-04–08 remain open. No tests, fixtures, runners, generated scripts, live workers, settings changes or user-data migrations were added or run.

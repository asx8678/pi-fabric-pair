# C6-KA and typing integration — bounded source checkpoint

## Status and exact ownership

Both replacement leaves STOPPED successfully: C6-KA `c6579fc8d6b64fd6b2419df662a699d1` changed only `src/coordination.js`/`src/actor-model.js`; TYPES-INTEGRATION `6beb59d36e384fd5bb650bb141427f25` changed only `src/contracts.js`/`src/controller.js`/`src/evidence.js`/`src/main.js`. Main inspected their actual retained native tool logs: first call was the absolute package.json read; calls were read/find/grep/edit only and every edit matched its assigned scope. This accounts for the unattributed six-file Fovea mutation notice; it does not infer provenance from that notice alone.

No production source change was needed during Main's checks. No tests, fixture/runner files, generated scripts, runtime/native/provider executions, installs, settings changes or commits were added. The inline checks below are bounded selected-source observations, not retained suites or original requirement acceptance. AR-03 remains **7/10 accepted**, T08 partial, T09/T10 and AR-04–08 open.

## Implemented boundaries

- Kernel usage is keyed by original observation identity, preserving caller usageId as provenance. Retry equality covers the complete producer/activation/task/step/value/observed-time tuple. Distinct original observations sharing a caller ID charge separately.
- Kernel inputTokens has real lifetime/step lower bounds and command/usage/crash coverage. Historical external reconciliation omissions survive parsing and intent hashing; derived accounting preserves unproven input gaps and known lower bounds. Explicit reconciliation replaces totals without adding observations again. Actor aggregation consumes those ledgers instead of generating permanent per-observation input gaps.
- `validateCurrentTelemetry()` and `validateSnapshot()` return checked originals without normalization. Controller validates before consuming telemetry, binds the exact current runtime tuple, ignores valid stale diagnostics and uses existing fenced containment for malformed input. Base snapshot reads now go through owned, bounded, hash/repository-bound `Evidence.readSnapshot()` before checkpointing.
- Evidence SHA syntax is checked before selecting blob paths; snapshot/after-image checks precede inspection reads. The bounded byte reader checks actual bytes and final file identity. Main uses SDK-declared broad parameter typing and actual dispatch/decision validators, not unsafe casts. Five registrations and the earlier migration-layer fix remain.

## Stopped-source compiler and public surface

All six changed files pass `node --check`; `git diff --check` passes. Full unchanged-tsconfig source set: **24 roots, zero supplemental TypeScript diagnostics**. This is TypeScript **6.0.3**, installed SDK **0.87.1**, SDK-local Node declarations **22.19.19**, MCP **1.30.0**, and installed SDK-local TUI declarations. It is NOT the unavailable pinned TypeScript 5.9.3/Node declarations 24.13.6 gate.

In-memory checker resolution only: SDK maps to `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.d.ts`; TUI to that package's `node_modules/@earendil-works/pi-tui/dist/index.d.ts`; MCP wildcard to `/Users/adam2/.pi/agent/npm/node_modules/@modelcontextprotocol/sdk/dist/esm/*`; typeRoots prefer SDK-local Node then global npm types. No package/tsconfig edits, shims, source exclusions or suppression. Earlier counts used different available declaration resolution and are not a like-for-like reduction claim.

Mechanically confirmed: aggregate exports/arities `validateActorStateV2(2)`, `projectLegacyWorkerView(3)`, `validateActorWorkflowModel(2)`, `validateActorWorkflowEvent(1)`, `reduceActorWorkflow(3)`; six facade exports; 27 kernel kinds; Main registrations `pair_dispatch`, `pair_decide`, `pair_inspect`, `pair_status`, `pair_cancel`; both new contract validators and `Evidence.readSnapshot(2)`. Package remains 0.1.0 with only typecheck/pack:check scripts. Common budget source matches C4 exactly: depth32, nodes250000, bytes16777216, references16 and all other ceilings/reserves unchanged.

## Bounded direct observations

**Accounting: 21 outcomes across two bounded programs.** Actual selected kernel/common/schema/stored/usage declarations, actual context-aware public parse/append methods and a 15-event dispatch → grant → committed prompt → usage → historical reconciliation → explicit input reconciliation sequence. Fourteen initial assertions passed: no-usage lifetime/step input gaps, exact fractional lower bounds, duplicate caller IDs, inert original retries, six conflicting-original fields rejected without changing the frozen base, original omitted input fields/hash, lower-bound/gap preservation and exact explicit resolution. The next assertion was overstrict Node prototype equality: ordinary and null-prototype inert records differed although the public full-projection validator accepted their exact values. No source fix was made. A focused follow-up checked JSON-value replay equality, frozen publication and five aggregate cases (7 outcomes). Those aggregate cases call actual `workflowUsage` with the real kernel results and explicitly minimal private activation/usage inputs: no full actor workflow or provenance claim.

**Validation/evidence/telemetry: 43 outcomes.** Actual selected validators/Evidence methods and the unchanged telemetry try/catch extracted from Controller.scan, with explicit in-memory filesystem/Controller adapters. Covered current telemetry, historical/partial/unknown/malformed identities, accessor non-execution, snapshot order/hash/path/HEAD/size/count/timestamp checks, exact owned reference and repository binding, pre-open rejection, bounded-read growth/stat drift/oversize/close behavior, valid inspection and pre-blob invalid SHA rejection, pre-effect invalid checkpoint rejection, seven stale identity fields, malformed/corrupt containment, revocation across await, absent diagnostics and model-drift containment. All write/spawn surfaces were blocked. A preceding inline-template syntax error entered zero checks; raw-string quoting was corrected and the 43 outcomes then passed.

These are not full Controller.scan, complete initial-root → approval → mirror, native filesystem/RPC, provenance or release checks. No fake whole-workflow certification is derived from the local adapters.

## Subsequent independent review

The stopped reviewer found two default-summary Evidence.inspect gaps not exercised by the earlier file-inspection checks. Main corrected both and verified 17 focused outcomes at the real Controller.inspect consumer boundary; see [review/correction record](TYPES-INTEGRATION-REVIEW.md). The following hashes and zero-diagnostic result describe the preceding stopped snapshot. Corrected evidence hash is recorded in that follow-up. The subsequent [stopped prefix/Evidence combined checkpoint](C6-PREFIX-FINDINGS.md) again passes all24 roots with zero supplemental diagnostics.

## Snapshot identities

| File under src/ | SHA-256 |
|---|---|
| coordination.js | `da7e918031b2d1d1327fb82e5cd5ff1b0400c2877935adc9dd4bc7e412106038` |
| actor-model.js | `41806198581a3d0903c0a52acddc0dbc07e94bcd93075575a9721a14bd03bbfa` |
| contracts.js | `36d1a81b6274f28e498b7914e6f6a80ebc5750771d734515b8074672820dc580` |
| controller.js | `2154432990cb466e4aca6eff58bc1ec4b1043e5aa5a25bcb566d5b2ec40315a2` |
| evidence.js | `1fc99876f7b88efc2ab6011dd5ab527e2490f75fd7181eb2d55ee65f6b707088` |
| main.js | `3e3cc00c5e829188a9d0c639641c69391c0998a8b67ab0360fbae6335862f72a` |
| actor-contract-common.js | `7775ef91679a9ed5337c48bc66fecb4ecfdc75d24b98500b0b3ab09e44b17de0` |

## Remaining obligations / next bounded scope

- Genuine same-operation private actor-prefix reuse and remaining actor-work metering: repeated base+candidate replay currently spends 8+9 references at the second inspection chain, beyond max16. Do not raise/reset counters or credit equality as ownership. This independent mechanism is next so complete-path checks can become feasible.
- C6-LR logical terminal disposition/slot retention, supervisor null-metric reconciliation, independent abort/transport/native settlement and original output production timing; explicit structural replanning; mailbox occupancy/dedup/bytes/fairness/reserves; archive/legacy carryover; full-path resource fit and preimage obligations.
- Fresh independent reviews, T09/T10, ActorHost/supervisor/two-runtime/sleep/configuration integration. Main Apply binding races and UI width remain reported separate work.
- Evidence still requires trusted storage: ancestor symlinks/directory replacement, platform O_NOFOLLOW and Git path races remain qualified; full manifest authentication is not provided. Hash syntax is not a sandbox.
- Pinned toolchain, native/runtime and release gates remain unverified. See [live execution ledger](COMPLETION-EXECUTION-PLAN.md) for any newly assigned writer, rather than restarting these stopped leaves.

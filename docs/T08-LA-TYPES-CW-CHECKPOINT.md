# T08-LA and TYPES-CW — stopped candidate checkpoint

**Not complete T08 or product acceptance.** Writers `3851c0f09e8e457e909e9caf59f549df` (actor-model.js) and `8535d661c2654680b5c3faf321347507` (config.js/worker.js) delivered substantive source changes and stopped. Neither ran compiler/tests/probes. Main owns checks and subsequent assignments.

## Lifecycle/accounting candidate

Adds independent delivery/run/effect/output reservations; actual lifecycle and scoped hold state; Main-bound authorizations; immutable workflow assignment/budget/amendment revisions; historical-prefix/commitment budget gating; absorbing terminal outcomes and explicit disposal; original producer/observation accounting, supervisor reconciliation and implementer input/output/cost/gaps. Usage derivation no longer mutates the replay ledger. New/repeated traversals use C4's shared work counter.

New closed actor events: actor-lifecycle, kernel-control-authorized, workflow-amended, workflow-escalated, activation-contained, supervisor-accounting-reconciled. HumanAuthorization binds authorizationId/principal/authorizedAt/reason/owner/main. Hold resolution has a reason-specific witness union; hold scope adds actor. Supervisor usage retains observedAt and explicit null/decimal cost. Views expose lifecycle/reservations/containment/accounting, immutable budget history, questions/answers/attempts/control/disposal and scoped provenance/gaps. Five public signatures remain intended unchanged; no runtime integration.

Main corrected one real TS18047: capture `a.accounting` in a stable checked local before nested accounting-coverage callbacks. No cast or weakened null check.

Reported kernel seams, now source-confirmed as current limitations but not yet independently scoped:

1. `coordination.js` usage branch indexes `p.usage[e.usageId]`; distinct producer observations with colliding caller usage IDs cannot both enter that map. Aggregate derivation alone cannot repair rejected kernel facts.
2. The existing immutable task/decision/amendment model does not implement postdispatch structural step/plan replacement. Ordinary rework and structural replanning must not be conflated; require a minimal same-reducer design if structural replacement is necessary.
3. Kernel accounting has no input-token completeness metric/reconciliation. The new aggregate honestly retains normalized-input uncertainty rather than certifying zero/completeness. TaskLimits has no input-token limit; that gap is not itself a cost/output budget gate.

Reservations, hold resolution, terminal disposal and full positive-path reachability still require independent bounded source review and Main behavioral checks. A read-only LA review is being assigned; it is **not T09**, since mailbox/archive/full-path work remains open.

## Config/worker typing candidate

Config now exports concrete scope/config/layer/migration/options/path/provenance/import-preview typedefs and validates unknown boundary data before narrowing. Worker uses actual SDK API/context/tool-result types plus concrete authority/report/telemetry/environment/timer/error data. No new runtime exports; defaults, active versions, DUR-01 backup/error/identity guarantees and worker waiting gate remain intended unchanged.

Main corrected two TS2345 closure errors by capturing the validated environment directory into a new stable `dir` local. The same existing absolute-path/owner/epoch/generation checks still run first; no unchecked assertion or permission bypass.

Follow-up in Main/UI: replace nonexistent `migration.migrated` with the actual loaded scope layer, preserving selected edits, consent and restoration semantics; type scope indexing/dialog callbacks with the new config types. This is an assigned integration correction, not already verified Apply behavior.

## Actual stopped-source compiler evidence

Syntax for actor-model/config/worker and repository whitespace passed before the two stable-local corrections. The first full supplemental TS6.0.3 run reported 230 diagnostics, including nullable accounting, captured directory, and unresolved SDK cascades.

Resolving the SDK package directory did **not** fix Node16 ESM lookup. Main then resolved the actual installed **SDK 0.87.1 `dist/index.d.ts`** explicitly, without changing project files or installing anything. After the local corrections:

- **188 production source diagnostics**: evidence 48, main 61, metrics 2, native 14, ui 33, util 30.
- **Zero** actor-model, core, Controller, config, worker or extension diagnostics.
- **Two dependency diagnostics**: SDK `path.PlatformPath` against globally supplied Node 26.6.2 declarations, and Google SDK's MCP client declaration lookup.
- SDK-local Node 22.19.19 declarations include PlatformPath; global Node 26.6.2 does not. Installed MCP SDK is the requested 1.30.0, but its ESM declaration path needs proper resolution. These are dependency-environment checks, not permission to introduce shims/suppressions. Pinned TypeScript 5.9.3 and Node declarations 24.13.6 remain unavailable in the checked locations.

This is **not a passing build** and not the pinned toolchain. Count reductions alone do not establish behavioral equivalence. The larger runtime/native/crash/installation gates remain unchanged; no tests, fixtures, generated checking scripts, native execution, installation or activation occurred.

See [live ownership and remaining stages](COMPLETION-EXECUTION-PLAN.md) and [DUR-02's corrected recovery checkpoint](DUR-02-FINDINGS.md).

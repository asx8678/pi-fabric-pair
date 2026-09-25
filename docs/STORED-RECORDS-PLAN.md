# Stored-record contracts and legacy classification — implementation plan

**Status:** AR-01 source slice implemented and reviewed; intended-toolchain compiler gate remains blocked. See [§9](#9-ar-01-source-checkpoint) for exact evidence and limitations. This is the bounded NEXT-01 / J02–J03 slice with a compatibility handoff to J05; it does not complete NEXT-01/02 or activate NEXT-03/04. The original plan below came from zro DeepSeek V4.1 Flash source maps, Astra xhigh design reviews and committed historical producers.

**Parent runbook:** [NEXT-01-02-PLAN.md](NEXT-01-02-PLAN.md). **Tracker:** [ACCEPTANCE-LEDGER.md](ACCEPTANCE-LEDGER.md#current-no-tests-implementation-ledger).

**Owner boundary:** no tests, fixtures, negative compiler cases, simulations, smoke/native/probe runners or generated test evidence. Keep executable ESM JavaScript with JSDoc/checkJs. No worker launches, configured verification, application-provider calls, installs, commits, pushes, upstream edits or session-data reads/writes. Agent inference is separately authorized for the planning/implementation assignments; it is not a Pair Worker run.

## 1. Outcome and exclusions

Deliver concrete validated V1 stored records plus a pure, context-free `classifyStoredState(value)` that recognizes only documented layouts, preserves original data and reports explicit rejection/reconciliation reasons.

Included:
- Usage observation/totals contracts and typed validation of consumed nested diagnostic fields.
- Task, worker, request, notice, history and root-state types with source-backed relationships.
- Separate historical contracts for proven pre-identity nested records.
- Compatibility corrections needed by existing writers, particularly `diagnosticFile`.
- Pure classification without migration, fabricated identities, normalization or authorization.
- Source review, syntax/compiler evidence and an explicit later-integration handoff.

Excluded:
- Replacing `migrateStoredState`, wiring classification into `PairController.init`, clearing/restoring reports, backup/reconciliation I/O or held-state UI.
- New grants, continuation/decision/reset reducers, queue pumping, accounting updates or runtime limit enforcement.
- Reinterpreting V1 delivery or usage as trusted observation, completed effects or complete spending.
- New Pi tools/commands, package exports, configuration keys/dependencies, version bumps, broad source-typing cleanup or CI work.

Package remains `0.1.0`, config V2, state V1 and wire V1. Existing startup can still fabricate legacy attempt identity and clear some pending reports; adding an unused classifier does **not** fix those runtime hazards. Their coherent replacement remains NEXT-03/04.

## 2. Source-backed producer/consumer map

Current paths are package-relative; historical references use commit `7583104`. Line ranges describe this planning snapshot; symbols are the durable navigation anchors.

| Record | Authoritative producer / retention | Current validation / consumers | Required planning treatment |
|---|---|---|---|
| Root state | `controller.js:init/persist` (26–58) | `contracts.js:validateStoredState` (292–301) | Separate context-free shape validation from external owner/workspace binding; keep current public signature and write order. |
| Worker | `controller.js:startUnlocked` (108–169) | `validateWorkerRecord` (249–261), `summary`, UI | Concrete required fields and lifecycle optionals; preserve nullable session/usage/task, optional observations/probe/error and `diagnosticFile`. |
| Task | `controller.js:dispatchUnlocked` (211–234), report/decision/lifecycle methods | `validateStoredTask` (219–245), Worker authority projection | Typed plan/policy/limits/verification, counters, report/decision maps and all seven lifecycle optionals. Do not insert persisted discriminants. |
| Request receipt | `dispatchUnlocked`; status synchronized by `persist` (53–58) | Idempotency lookup (213–214), root validator | Hash is of original dispatch input. Receipts may outlive current tasks and reset workers; no pruning or mandatory live-target relationship. |
| Main notice | `finalizeReport` (405), `deliverNotice` (415–424), decide/resume/cancel | Root validator, inbox, Main callback | Preserve six V1 status values and optional timestamps/errors. Callback completion is not Main observation or settlement. |
| History / archives | Dispatch writes prior task and appends history, retaining 40 entries (220–222); reset archives worker (519–525) | History validator; archive files are retained references | Validate metadata, not filesystem existence; no requirement that all receipts/notices point into the bounded retained history. |
| Usage observation / totals | `metrics.js:normalizedUsage/addUsage` (1–17), Controller scan, Worker/Main telemetry | Opaque today in task/worker records; limits/UI consume fields | Finite nonnegative token numbers, USD cost/subtotal, counters and timestamp; preserve partial/unknown semantics. |
| Stored telemetry | `worker.js:telemetry` (53–59), Controller scan (323–332) | `lastObservation`, model comparison, status/UI | Validate consumed identity/model/context/usage/tool/phase fields; retained telemetry is not a fresh handshake or accounting proof. |
| Exchange / stale report metadata | `activate`, `finalizeReport`, `acceptReport` (299,369,403) | UI and diagnostic retention | Concrete exchange direction/kind/time; stale report ID/reason/time; no active-report authority inferred from diagnostics. |
| Stored probe | `native.js:probeNative/checkReadiness`, `worker.js` (64–65), Controller start/probe | Runtime readiness checks precede storage; stored field is currently opaque | Type source-backed stored metadata without treating a saved probe as fresh readiness. Keep unknown external extension data explicitly untrusted. |

Startup currently reads → migrates → validates → increments root epoch → changes worker/task status → may clear pending reports → writes stopped authority → persists. That order is a witnessed risk, not permission to rearrange it in this batch.

## 3. Compatibility decisions to freeze before editing

1. **Keep original public data.** Checked validators return the original validated records. Do not reconstruct/default/reorder report payloads, recalculate a hash over normalized data, or mutate policy/limits. `JSON.stringify` payload hashing stays unchanged.
2. **Correct witnessed writer/validator mismatches without discarding metadata.** `controller.js:167` writes `diagnosticFile` before `persist`, but the current worker allow-list rejects it. Add a bounded optional path string; do not require the best-effort artifact write to succeed or discard the reference. Also make stored decision checkpoint metadata action-specific: both historical and current public schemas accept an optional nonempty string of at most 64 characters for `answer`/`revise`, and Controller stores it unchanged or null. The current stored guard incorrectly requires SHA-256 for every continuation action. Preserve those non-approval strings as non-authoritative metadata; approval retains its required exact SHA-256 and checkpoint validation. Cancellation remains its small no-checkpoint variant. Broader startup rollback/error handling is deferred.
3. **Separate zero, absence and invalid values.** Stored root `ownerEpoch` and worker `workerGeneration` may be zero before ownership/start increments. Existing positive report/notice/authority minima remain positive. Missing identity cannot be replaced with zero or borrowed from a report/map key.
4. **Do not invent accounting completeness.** Observation token fields are finite nonnegative numbers, including fractions accepted by the current normalizer; they are not elapsed milliseconds. Cost fields are USD. Request/unknown-cost counts are safe nonnegative counters; observation time is a timestamp. A V1 cost subtotal or zero-filled token record does not prove complete spending. Preserve `null`, missing optional fields and stored values; do not change `metrics.js` aggregation/zero-filling behavior in this batch.
5. **No silent strictness drift.** Validate every consumed nested field and reject malformed present values. Do not make all historical metadata a closed enum or require live references just because the current writer uses a small vocabulary. Strictness changes need a named writer/reader witness and a compatibility decision.
6. **Validate records, not capabilities.** Stored telemetry/probe identity is historical metadata. Missing freshness/binding/provenance remains unchecked; valid numbers and source tags cannot authorize work. Diagnostic profile is independent of root identity layout: migration adds root/worker/task identities but leaves old observations/probes unchanged. A valid identity-bearing root can therefore contain a proven historical diagnostic variant without being mixed-identity corruption.
7. **Preserve notice history.** `delivered` means at most notification; the current optional callback may even be absent. Do not map it to `observed`. `error` and `deliveredAt` may survive later status changes; do not impose status-specific absence rules without a clearing writer.
8. **Scope cross-record relationships.** Validate map-key/worker/bound/task agreement, plan uniqueness/index, receipt/notice/decision links when the referenced records are retained, and contradictions between matching identities. Historical receipts may survive reset, and old reports/decisions must retain old producer tuples.
9. **Do not over-bind reports.** Preserve the distinction in `validateTaskReportIdentity`: task/worker/plan attachment versus current-attempt matching. Pending/current waiting-undecided reports use the applicable task attempt/revision/lease and existing step/final-only policy rules. Resolved history need not match today's producer tuple. Do not impose root-epoch equality: restart advances it while retaining waits. An interrupted report without proof of resolution is ambiguous, not automatically resolved history.
10. **External nested boundaries stay honest.** For external context/native metadata, validate the fields actually consumed against supported source/API declarations; retain unconsumed extension JSON as explicitly unknown-valued data. No whole stored record may remain a falsely concrete generic object. Unproven consumed variants block their profile with an explicit unsupported result, not an invented complete type.

## 4. Planned types, APIs and dependency direction

### Stored contracts — one owner in `src/contracts.js`

Add concrete types for `StoredTaskV1`, `StoredWorkerV1`, `StoredStateV1`, request/notice/history entries, exchange/stale-report records and source-backed telemetry/probe records. Keep private parsers private unless a real module dependency requires an export.

- `validateStoredTask` and `validateWorkerRecord` remain internal helpers with checked concrete returns.
- `validateStoredState(value, expected)` retains its exported name, argument contract, throwing behavior and explicit `expected.ownerSession`/`expected.cwd` checks. Its concrete return covers currently accepted identity-bearing V1 records, including documented pre-deferred task policy/limits.
- Factor private context-free shape/profile validation underneath that wrapper and the classifier. Do not validate a stored identity by passing it back as its own trusted `expected` value.
- Historical root/task/worker/report/notice/decision/telemetry/probe records have separate types/guards with proven omissions and field domains. Do not describe them as current records whose required identity fields have been filled or broadly made optional. Select proven telemetry/probe profiles independently from global root identity layout; their survival after migration is source-backed compatibility, not fresh provenance. Historical decision domains must be checked by action, not by subtracting identity fields from today's stricter guard.
- Do not add discriminants, completeness flags, migration reasons or model fields to the active disk format. Classification metadata lives in the result envelope only.

### Independent numeric observation leaf — proposed `src/observations.js`

This small pure module allows genuinely disjoint implementation and keeps numeric observation semantics out of the growing aggregate validator. It is a deliberate refinement of the parent runbook's module guidance, not a generic parsing framework.

- Define `UsageObservation` and `UsageTotals` for the exact locally produced fields in `metrics.js:1–17`.
- Export `validateUsageObservation(value)` and `validateUsageTotals(value)` with concrete nullable returns; optional label parameters may be added consistently with existing validators. Required stored `usage` presence is checked by the aggregate wrapper; `undefined` is not silently turned into a stored `null`.
- Observation fields: `input`, `cacheRead`, `cacheWrite`, `totalInput`, `output`, `cacheRatio`, `cost`, `observedAt`. Totals: the five token fields, `cacheRatio`, `reportedCost`, `unknownCostRequests`, `requests`.
- Preserve existing finite token/floating-point semantics. Do not use exact recomputed floating-point equality as proof of arithmetic consistency. Validate safe counters and sensible nullable/range relationships that current producers establish; reject overflow/nonfinite present data rather than replacing it with zero.
- Do not import `contracts`, `util`, `config`, Controller/Worker, native hooks, filesystem or clocks. The helpers validate observations; they do not create observations or aggregate spending. Metrics production logic remains unchanged.

```text
observations (pure leaf)
    ↑ imports
contracts (aggregate + historical profiles + classifyStoredState)
    ↑ imports/types
existing Controller/Worker/schema; coordination → transitions

util → contracts already exists; no reverse import is permitted.
```

Keep `classifyStoredState` in `contracts.js` so it shares private profile validation; do not create a second aggregate parser or a contracts ↔ classifier cycle merely to parallelize edits. Parent/Main integrates shared edits only after the assigned writer hands ownership back.

### Classifier — new internal module export, not a Pi registration

Proposed result contract:

```text
Common: nonAuthorizing: true; original: unknown (unchanged borrowed input)

Recognized:
  kind: 'recognized'
  identityLayout: 'pre-identity' | 'identity-bearing'
  taskLayouts: readonly per-task path/policy-layout/alias facts
  diagnosticLayouts: readonly per-path current/historical diagnostic-profile facts
  storedBinding: { ownerSession, cwd }
  bindingStatus: 'unchecked'
  reconciliationReasons: readonly { code, path }[]

Rejected:
  kind: 'rejected'
  category: 'corrupt' | 'unsupported'
  issue: { code, path, message }
```

`recognized` requires validation of the complete selected supported profile, not just marker detection. `original` is neither an archival copy nor a trusted typed state. No context, time, ID factory, callback, filesystem or migration call is accepted. Classify inert decoded JSON; reject malformed/non-JSON shapes without coercion, accessor evaluation or serialization normalization. Retained nested hashes are checked using their original payload representation.

Proposed stable rejection codes: `invalid-field`, `missing-required-field`, `mixed-identity`, `partial-policy-layout`, `hash-mismatch`, `inconsistent-reference`, `unsupported-version`, `unsupported-shape`, `unsupported-policy`. Preserve path and category at the point of failure; do not infer codes by parsing free-form error messages. The current throwing validator wrapper remains compatible while classifier results are explicit. Do not catch operational/programming failures and misreport them as harmless historical data.

## 5. Legacy classification decision table

**I markers:** root `ownerEpoch`; every worker's `workerGeneration`; every non-null task's `workerId`, `attemptId`, `attemptNumber`. Presence means own-property presence, including present zero/null; value validation is separate.

**D markers per task:** policy `maxRevisionsPerStep`; limits `activeStepTimeoutMs`, `maxQueuedTasks`, `maxQueuedReviews`, `maxReportsPerTask`, `maxReportBytes`, `maxAutomaticReportRepairs`, `maxAutomaticRecoveryAttempts`.

| Observed layout | Planned classification |
|---|---|
| V1, all I absent, complete source-backed pre-identity profile, all task D absent | Recognized pre-identity, non-authorizing; preserve missing identities and original nested historical layouts. |
| V1, all I present/valid, each task D wholly absent | Recognized identity-bearing, per-task pre-deferred-policy facts. Identity presence does not prove historical provenance; earlier migration can synthesize it. |
| V1, all I present/valid, task D wholly present/valid | Recognized identity-bearing, per-task current-policy facts; never an authorization or complete-accounting result. |
| Different tasks have independently complete pre-deferred/current D layouts | Preserve each task's layout. Do not reject merely because different tasks have different complete eras, or label the whole state fully current. |
| Identity-bearing root with a proven historical telemetry/probe variant | Recognize the independently selected diagnostic profile, retain missing diagnostic identity and record unchecked provenance. Migration leaves these records untouched; do not infer their era from I alone. |
| Only some I present, or only some D present within one task | Reject `mixed-identity` or `partial-policy-layout`; no defaults or fallback to a looser profile. |
| Identity-bearing with no tasks | Recognize the empty compatible shape; task-layout facts are empty, not inferred evidence of a policy era. |
| `final`/`strict` policy aliases in an otherwise supported profile | Keep spelling; record alias/reconciliation metadata independently of identity layout. Existing migration normalizes aliases regardless of I presence; classifier must not. |
| Historical `adaptive` | Explicit `unsupported-policy`; source-proven history is not permission to normalize it into a supported policy. Validate the selected structural profile so malformed present data is not hidden by an unsupported label. |
| Pre-identity plus current D fields or another unproven combination | `unsupported-shape` until a committed producer/profile is established. Migration permissiveness alone is not historical evidence. |
| Required non-profile field missing, malformed present field, invalid hash, contradictory retained reference | Corrupt rejection with exact code/path. Do not retry a different profile after validation failure. |
| Unknown valid version / missing or malformed version | `unsupported-version` / corrupt input respectively. No future coordination-model object may masquerade as stored V1. |
| Different external owner/workspace | Same syntactic classification with binding unchecked; contextual rejection remains in `validateStoredState(value, expected)` and future integration. |
| Retained report with insufficient resolution/current-obligation evidence | Keep original report and an explicit reconciliation reason; do not infer resolved history, settlement or admission. |

### Proven historical omissions

At `7583104`, Controller root/worker/task producers omit exactly the I additions (`controller.js:31–32,103,219–222`), and config has no D fields (`config.js:11–15`). Historical nested contracts must additionally cover:

- Report envelope lacks `ownerEpoch`, `workerGeneration`, `attemptId`, `attemptNumber` (`worker.js:89–91`).
- Notice lacks `ownerEpoch`, `workerGeneration`, `attemptId`, `deliveryOperationId` (`controller.js:368–369`).
- Non-cancel decision lacks those same four identity/delivery fields (`controller.js:416–418`); cancellation remains its small separate action shape. Historical `answer`/`revise` checkpoint metadata is null or a nonempty string of at most 64 characters, not necessarily a SHA-256 hash (`schema.js:24–30,57–61`). Approval still requires SHA-256. Current `schema.js:47,92–94` and `controller.js:452` retain the same non-approval domain, so the planned stored-guard correction is also needed for current records.
- Telemetry lacks `ownerSession`, `ownerEpoch`, `workerGeneration` (`worker.js:48–55`).
- Probe adds `nonce`, `workerId`, `ownerSession`, but lacks `ownerEpoch`/`workerGeneration` (`worker.js:57–63`). Both historical diagnostics can remain under an identity-bearing root because migration does not rewrite them.

Historical tasks already supplied `planRevision`, `leaseId`, `usage`, report/decision slots and `lastDecision`; workers already supplied usage/task/history. Missing such fields is not a documented compatibility exemption. Verify any additional historical observation/probe variant before accepting it; do not invent an all-optional legacy bag.

## 6. Implementation slices and agent ownership

The source maps/design reviews for this plan are complete. Reuse them unless source changes; fan out new readers only for an actual unresolved boundary.

| Slice | Work / exit | Owner and files | Dependency |
|---|---|---|---|
| SR-01 — Freeze profiles | Final per-field required/optional/null/domain table, supported external consumed fields and historical profile omissions; public result/error contract agreed. Record compatibility exceptions above. | Parent + light DeepSeek readers only for remaining source/API questions; planning docs. | Before implementation. |
| SR-02 — Numeric leaves | Implement precise nullable usage validators and types; preserve original records and existing semantics. | Astra xhigh A: new `src/observations.js` only. | Frozen SR-01 APIs. |
| SR-03 — Aggregate contracts | Concrete current/historical records, independently profiled diagnostics, action-specific decision metadata, compatible `diagnosticFile`, scoped reference validation, private shape validation and unchanged contextual wrapper. | Astra xhigh B: `src/contracts.js` only. | Can develop alongside SR-02 using frozen interfaces; integrate after leaf output is available. |
| SR-04 — Pure classification | Implement the decision table and tagged results over shared profile validators; no migration or runtime wiring. | Same Astra B or Parent after explicit handoff: `src/contracts.js`. Never a simultaneous second writer. | SR-03 profiles. |
| SR-05 — Compatibility review | Review startup-error persistence, history/reset retention, alias/mixed-layout decisions, ambiguity/provenance, hash preservation and static diagnostics. | Independent Astra xhigh C, read-only; DeepSeek may mechanically check symbols/imports. | Completed implementation, not a half-written snapshot. |
| SR-06 — Integrate and record | Parent resolves findings and only necessary compatible caller annotations/guards; final syntax/compiler/diff inspection, updated field map and ledger. | Parent; no concurrent edits to handed-back source. | SR-02–05. |

Planning fan-out used `zro/deepseek-v4.1-flash` for two bounded inventories and `openai-codex/gpt-6-astra` at `xhigh` for two design reviews. Future implementation uses the roles above, not many agents writing the same file. Each agent must first verify the exact repository root, preserve all pre-existing changes/deleted tests, own explicit paths and abort without changes on a root mismatch. No delegated tests or unapproved scope expansion.

If source-backed safe validation requires an incompatible field or a real lifecycle/migration change, stop that part as blocked and move it to NEXT-03/04. Do not weaken a validator, cast around missing evidence, change a version constant or rewrite startup merely to finish this batch.

## 7. Acceptance ledger and verification

The rows below are implementation acceptance criteria, with current evidence recorded in §9. They are not behavioral passes. The SR rows supplement J03; they do not replace/add product requirements to the original 106-row ledger.

| Check | Source/static evidence required |
|---|---|
| SR-A01 — Concrete consumed records | Aggregate wrappers return checked concrete types; consumed usage/telemetry/exchange/probe/history/request/notice fields have explicit validation or an honestly untrusted external slot. No broad `any`, unchecked decoded casts, suppressions or exclusions. |
| SR-A02 — Compatibility | Source traces show optional `diagnosticFile` survives startup failure persistence; non-approval checkpoint strings are retained without weakening approval; zero identity minima remain layer-specific; request receipts survive reset; old diagnostics survive identity migration; notice metadata/status and old producer tuples remain intact. |
| SR-A03 — Legacy profiles | Every accepted omission has a current/committed producer witness; global I and per-task D rules are explicit; aliases are separate; partial/malformed data cannot trigger a permissive fallback. |
| SR-A04 — Classification boundary | Mechanically confirm `classifyStoredState`, `validateUsageObservation`, `validateUsageTotals`; every classifier result is non-authorizing, binding unchecked on recognition, and original data is not changed. No active classifier consumers or new Pi registrations/config entries. |
| SR-A05 — Hash/retention semantics | Inspect original-object returns, payload hash order, absence of generated identity/defaulting and retained unknown accounting. No claim that a borrowed decoded object preserves original JSON bytes. |
| SR-A06 — Pure dependency direction | Contracts may import observation leaves, never util/config/controller/worker/coordination/transitions; observation validation has no clocks/I/O/IDs. Current migration/startup/write ordering is untouched. |
| SR-A07 — Combined static result | Syntax-check changed JS; run the existing full typecheck once all writers finish; inspect diagnostics by file and cause. New/changed contract/observation modules must have zero diagnostics; trace/fix attributable compatible caller regressions rather than hiding them. Record remaining overall failure honestly. |
| SR-A08 — No-tests / scope integrity | `git diff --check`, source/export/import/package inspection; no tests, fixtures, runners or artifacts restored. Preserve versions and pre-existing working-tree changes. No workers, benchmark/native runs or configured verification. |

Future commands: `node --check` on changed production modules, `npm run typecheck -- --pretty false`, `git diff --check`, and bounded source/registration searches. No added compiler fixture or standalone validation script. A failing full compiler is evidence to inspect, not a reason to rerun unchanged checks or suppress diagnostics.

Last recorded implementation baseline is **538 Pair-source diagnostics / zero dependency diagnostics**, with contracts/schema/coordination/transitions clean. This planning pass does not rerun the compiler and establishes no new behavior or release qualification. A reduced count is not proof of migration, history retention or durable delivery.

## 8. Completion and later handoff

This batch may finish when SR-A01–08 have source/static evidence and the supported-versus-unsupported profile map is explicit. NEXT-01/02 as a whole still require the remaining transition families and the shared layout/reader-writer freeze.

NEXT-03/04 must separately retain exact original bytes **before** decoding/replacement (including rejected input), preserve referenced history/reports/evidence, replace identity-fabricating migration, retain unresolved obligations during startup, add truthful held-state consumers and integrate durable publication/settlement. `classifyStoredState(value)` cannot recover bytes already discarded by `readJSON`; neither its borrowed `original` nor an `atomicJSON` reserialization is an original-byte backup.

No claim of runtime enforcement, complete accounting, settled effects, installed/native safety or a passed original acceptance gate follows from this plan or from compiler success.

## 9. AR-01 source checkpoint

**Revision/scope:** working diff against `078820d2c94057dfa9a808054a2890559e494f96`. Production changes are limited to `src/contracts.js`, new `src/observations.js`, and compatible caller updates in `src/controller.js` / `src/metrics.js`. Astra xhigh handled disjoint source work, independent read-only review and caller integration; zro DeepSeek V4.1 Flash audited historical producers. Parent reconciled the delivered code and static results. No commit was created.

### Delivered field and profile closure

| Record surface | Implemented domain / boundary |
|---|---|
| Usage observation | All token fields and `totalInput` are required finite nonnegative numbers, including fractional values. `cacheRatio` and `cost` are explicitly nullable; timestamps are checked. Validate stored arithmetic/ratio relationships without reconstructing values. |
| Usage totals | Required finite token/subtotal fields; safe request counters with unknown-price requests bounded by total requests. Null totals remain null, and reported cost never becomes complete spending. |
| Root / worker | Concrete current and pre-identity types; closed own-field shapes, IDs, binding strings, worker spec, statuses and nested records. Current root epoch and worker generation allow zero. `diagnosticFile` is optional retained metadata. |
| Task / report / decision | Concrete policies/limits, steps and index, counters/timestamps, usage, nullable pending/finalized reports, decision maps and optional lifecycle metadata. Validate original payload hashes and attached task/step/attempt/lease/plan relationships without rewriting the producer tuple. Non-approval checkpoint strings retain the public schema domain; approval still requires its checkpoint hash. |
| Requests / history / notices | Validate consumed receipt/history fields and notice delivery metadata/status. Check map keys, duplicate identities and ownership contradictions among retained records. Receipts may outlive reset or bounded history; absence alone does not fabricate a target or prove delivery. |
| Telemetry / exchange / probe | Check consumed context/model/tool/usage/native fields. `detachedEffect` is a nullable record, not a boolean; its PID is producer-retained integer metadata, not OS-liveness evidence. Pi probe thinking accepts `max`; omitted `sessionFile` follows the upstream serialization contract. Unconsumed external extension/native slots stay `unknown`, not trusted capabilities. |
| Input purity | Reject proxies, accessors, non-JSON values, cycles and sparse arrays before reading/hashing. Helpers return original checked objects and do not add fields, defaults, identities or timestamps. |

Root identity layout is either `identity-bearing` or the exact proven `pre-identity` omissions. Per-task policy layout is independently `current-policy` or `pre-deferred-policy`; `final`/`strict` aliases are reported, not normalized. Historical diagnostics can survive under a migrated identity-bearing root. Partial identity/policy groups and contradictions are corrupt; valid but unproven versions/shapes and adaptive policy are unsupported. There is no permissive fallback after a failed current-profile validation.

`classifyStoredState(value)` returns `recognized` or `rejected`, always `nonAuthorizing: true` and the borrowed `original`. Recognition includes `identityLayout`, task/diagnostic layouts, stored binding, `bindingStatus: 'unchecked'`, and reconciliation reasons. Rejection exposes typed category/code/path/message; unexpected programming failures escape. Classification has **no active consumers** and adds no tools, commands or configuration.

### Review corrections and caller compatibility

- Accept `running`, `awaiting_settle` and `interrupted` as stored worker observations: `startUnlocked` already copies nonterminal task status into the worker. This corrects a writer/guard mismatch, not lifecycle design.
- A stale `previousStatus` cannot attach an old retained report to a resumed attempt. Suspended reports bind as current only with matching attempt evidence (historical lease/plan fence); otherwise unresolved evidence remains ambiguous. Producer tuples are not rebased to current root/worker identities.
- Controller updates add truthful task-presence/handle/notice/decision types, equivalent optional-field conditions, and early failures for absent tasks/reports. They do not reorder authority or durable effects.
- Metrics uses explicit typed accumulation instead of the dynamic-key loop. Zero-fill, reported-cost/unknown-price counters and ratio calculations retain their existing semantics; validation itself never aggregates or repairs usage.

### Evidence and remaining gates

| Check | Current evidence / limitation |
|---|---|
| SR-A01–03 | Concrete consumed records and source-backed current/historical profiles implemented and independently reviewed; compatibility corrections above integrated. This is not an exhaustive behavioral profile check. |
| SR-A04–06 | Public exports/import direction mechanically located. Narrow no-file direct calls recognized an empty production startup shape as non-authorizing, rejected missing input, preserved references/serialization, and accepted nullable/producer-generated usage with fractional counts, zero cost and unknown-price accounting. No classifier runtime registration exists. |
| SR-A07 | Changed JS passes `node --check`. `npm run typecheck -- --pretty false` cannot run the pinned compiler: project dependencies are absent (`tsc: command not found`). No install or tsconfig edit was made. Supplemental full-source evidence below is not a replacement for this gate. |
| SR-A08 | `git diff --check` passes; source/static scope inspected. No tests, fixtures, runners, negative compiler cases or generated test evidence added. No Pair workers, configured verification or application-provider runs; session data, upstream files and package/config/version entries were untouched. |

Supplemental check used available **TypeScript 6.0.3 / `@types/node` 26.6.2**, all **16** current production roots and the existing strict/checkJs options, with in-memory external package/type resolution only. It exits **2**: **554 Pair-source / 0 dependency diagnostics**, versus **599** for HEAD under the same supplemental resolution. `contracts.js` and `observations.js` have **zero** diagnostics; compatible caller integration introduces no new attributable diagnostics. Remaining module counts: config 69, controller 104, evidence 48, extension 1, main 126, metrics 2, native 29, rpc 23, ui 33, util 30, worker 89. These are **not comparable** to the older pinned-toolchain 538 count and do not make the overall source gate pass.

AST-body comparison against HEAD confirmed `migrateStoredState`, Controller `init` / `persist` / `writeAuthority`, and `limitExceeded` unchanged. Consequently existing identity-fabricating migration and pending-report clearing remain unfixed. Package/config/state/wire stay `0.1.0`/V2/V1/V1; decoded-object preservation is not an original-byte backup. Next: resolve the pinned static gate, then AR-02 event compatibility, followed by the separately planned actor ownership and coherent recovery/obligation integration. No runtime, migration, native or release qualification is claimed.

# Next implementation plan — scope-checked foundation to runtime

**Current seven-part delivery view:** [§8](#8-seven-part-completion-plan) maps the renewed request to the existing N/AR/NI work packages and adds an explicit native qualification gate. It is the current execution handoff; §7 remains historical verification. This update is documentation-only. No foundation freeze, runtime activation or provider change is implied.

**Status: N1 implemented and boundedly checked; N2/F1 attempted but blocked.** The [T09 checkpoint](T09-FOUNDATION-REVIEW-CHECKPOINT.md) records three reviewer transport failures before source access, actual static/package results and Main's MF-01 legacy-projection finding. The [MF-01 correction](D5-LEGACY-PROJECTION-CORRECTION.md) now preserves references/current holds and missing historical identity, with 25 bounded outcomes and zero 24-root supplemental diagnostics. A fresh reviewer again failed before source access. The [held-carrier amendment](D5-HELD-CARRIER-CONTRACT.md) now supplies the remaining pure D5 byte-backed projection with 39 bounded outcomes and zero supplemental diagnostics. A fifth fresh reviewer also failed before source access. Independent source acceptance and T10 freeze remain prerequisites for H1. The [Q01 checkpoint](Q01-INLINE-INSPECTION-CHECKPOINT.md) records the complete acceptance-bearing public history and archive fit. The original planning pass was documentation-only; its verification record below is historical, not the current implementation result. This is the current dependency-order correction to the previous next-steps list. Requirements remain in [scope §10](SCOPE-OF-WORK.md#10-current-scope-after-test-removal), the [actor roadmap](ACTOR-RPC-IMPLEMENTATION-PLAN.md), and the [original acceptance ledger](ACCEPTANCE-LEDGER.md). This plan does not waive Q01, any of the 106 original requirements, or AR-A01–35.

## 1. Review verdict

The proposed work areas are substantially correct, but starting H1 immediately and postponing foundation review until after runtime work is **not** correct. The corrected critical path is:

```text
N0 status/contract baseline
 -> N1 Q01 accounting/representation correction + complete public model history
 -> N2 F1 / T09 independent foundation review -> T10 re-freeze
 -> N3 H1 contract/cutover design
 -> N4 H1-A + H1-D store and held loader
 -> N5 H1-B durable effect boundary + evidence/capability safety
 -> N6 H1-C + M1-H coherent runtime/Controller/mailbox cutover
 -> N7 R1 / AR-05 restricted supervisor
 -> N8 R2 / AR-06 supervised workflow (two runtimes, one writer)
 -> N9 S1 / AR-07 optional sleep/wake
 -> N10 C1/O1 / AR-08 configuration and observability completion
 -> N11 F2 final integration review and explicit qualification gaps
```

Safe-boundary configuration, stop/off, diagnostic status, branch fencing and permission revocation are introduced with their first runtime consumer (N4–N8), **not** deferred wholesale to N9/N10. N10 finishes those surfaces. N9 and N10 may be developed independently after N8 where file ownership does not overlap. Host design/read-only inventories may proceed while N1 is blocked; runtime cutover may not bypass N2.

| Correction | Source / requirement witness | Planning consequence |
|---|---|---|
| M1-B/E2 are no longer merely planned | `actor-model.js`: mailbox attempt/delivery/reconciliation parsing and reduction, `retainAuthority`, task-plan views; `coordination.js`: catalog/lineage/supersession; [checkpoint](RECONCILIATION-REPLAN-CHECKPOINT.md) | Preserve implemented source. Finish qualification rather than implement these features again. |
| Q01 was open at planning; N1 now checked | [Current checkpoint](Q01-INLINE-INSPECTION-CHECKPOINT.md); source charge trace in §3 below | Complete 102-event acceptance-bearing history plus rotations now passes. Independent foundation review/re-freeze remains open. |
| T09/T10 precede H1 | Completion ledger T09 → T10 → AR-04; five-area F1 → H1 | A later F2 review cannot substitute for the pre-Host foundation freeze. |
| Held loading must precede writable cutover | `PairController.init` calls `migrateStoredState(loaded, () => uid('attempt'))`, increments epoch and writes authority/state | H1-D must ship with H1-A before H1-C, not after normal V1 loading has already rewritten the input. |
| Existing locks are narrower than required | Controller directory is keyed by canonical cwd + Main session; `persistSerial` serializes one Controller's writes | Need workspace-wide writer/evidence ownership, not a second per-session mutex. Sharing a directory alone does not prove a race; canonical authority and delegated publication ownership must be explicit. |
| Abort cannot wait for healthy storage | `revoke` fences synchronously; `publishControl` schedules containment when authority publication fails | Reservation-first applies to granting/sending new work. Preserve fail-closed emergency containment even when durable writes fail. |
| Legacy fixes already exist | `worker.js:publishReport`, Controller latch scanning, `config.js:saveConfig`; DUR-01/DUR-02 | Do not regress identical retry, full-content conflict checks, retained latches or backup-preserving AggregateError handling. A pre-publication latch is also a local stop fence, not proof of new execution authority. |
| The old list omitted safety consumers | `verifyConfigured` has no per-command snapshot binding; Controller compares batch before/after snapshots; Main has no tree-navigation hooks; role entrypoint only selects Main/Worker | Explicitly include evidence identity, admitted-effect coverage, branch/permission fencing, and role/tool confinement. |

## 2. Scope and current baseline

- Retain executable ESM JS/checkJs, existing Pi JSONL RPC, native Main, one unresolved workflow and one implementation writer. `PiRuntime` remains the sole owner of each native process; ActorHost owns durable domain decisions, not a competing process lifecycle.
- Current active versions: package `0.1.0`, Config V2, State V1, Pair wire V1. Config V3/State V2/control-wire V2 validators are future contracts, not activation. Freeze the exact compatibility matrix before changing any active version or reader/writer.
- Preserve disabled-by-default rollout, retained IDs/session paths, V1 hashes, all caps, 27 kernel kinds, six facade and five aggregate public exports plus the existing coordination interface unless a separately recorded interface amendment is reviewed. No automatic historical identity synthesis/adoption.
- M1-A/A1-A and M1-B/E2 have source and bounded historical checks, not Host provenance or release qualification. The acceptance-bearing full Q01 path now has bounded public-model evidence in the new checkpoint; independent foundation/runtime qualification remains open. Prior supplemental 24-root compiler success is historical, not a compiler run performed by this planning pass.
- No production implementation, tests/fixtures/runners/generated checking scripts, dependency installation, live/native/paid-provider calls, settings Apply, user-data migration, commits or release in this planning pass. Preserve dirty work, including `src/util.js` and `%1`. Do not rely on temporary probe scripts as durable acceptance evidence.
- The current no-tests scope excludes enabling queue pumping and automatic recovery/repair. Original queue/report/repair/recovery requirements remain mapped below and unverified; enabling autonomous consumers needs an explicit scope decision, not an implicit feature flag. User-authorized bounded delivery is not permission to replay an uncertain mutation.

## 3. N1 — resolve Q01 without changing its goal

### Source-backed reference accounting

**Implementation update:** the [closed inline carrier](Q01-INLINE-INSPECTION-CONTRACT.md) is implemented in actor-model only. Raw forms retain the costs below; full inline inspection content reduces each one-proof chain to 5 reference occurrences. Two inline chains plus two rotations cost 12; six rotations pass at 16 and the seventh rejects. No cap or Q01 scope changed.

The present **one-proof** inspection representation charges:

| Retained source | Outer raw-source decode | Nested reference occurrences | Total |
|---|---:|---:|---:|
| Structured proof | 1 | 0 | 1 |
| Request | 1 | 0 | 1 |
| Reply | 1 | request + evidence = 2 | 3 |
| Receipt | 1 | request + reply = 2 | 3 |
| One chain | | | **8** |

Witnesses: `actor-model.js:sizedArtifact`, `parseInspectionEvidence`, `parseInspectionArtifact`, `retainArtifact`; `actor-contract-common.js:consumeReference/decodeReferencedPairJSON`; `actor-migration-contracts.js:validateArchiveValidationContext`. Two chains use 16; replaying their first archived segment adds one archive decode, requiring at least 17 against `maxReferences:16`. Additional proof references/segments add costs. These are distinct declared occurrences under the present representation; no double-charge defect has been established by this review.

This proves a limit for the **current representation/history**, not that every evidence-preserving representation is impossible. The earlier proposal to reduce reply/receipt to one occurrence is a design hypothesis, not an implemented or reviewed solution. A one-chain archive or non-archived two-chain history does **not** pass unchanged Q01.

### Implementation procedure

1. Record every source occurrence, exact byte/hash domain, retention owner, standalone-wire reader and aggregate reader. Separate genuine repeated references from any redundant traversal of the same already-checked source. Include one and two rotations in the budget worksheet; do not optimize only the seventeenth occurrence.
2. Investigate an evidence-preserving bounded representation. An explicit inline-content form may be considered only if it actually carries the complete content and pays all capture/encode/hash/copy/node/byte/work costs; relabeling an external reference as an ID/locator or silently skipping its charge is forbidden. Retain complete request/reply/receipt, delivery, producer and original-byte evidence.
3. Before source edits, amend the frozen inspection/retention contract with exact closed fields, hash/original-byte semantics, old/new form treatment and both wire/aggregate consumers. Prefer no public-symbol or active-version change; incompatible retained forms need explicit versioned treatment, not an overloaded old meaning.
4. Implement with one owner for shared wire/model changes. Keep the same aggregate context across historical/incremental/archive validation. No cap increases, context resets, hash-equality credit or trusted-cache shortcut.
5. Qualify full Q01 with nonempty successor acceptance, both real inspection chains, final approval, mailbox reconciliation/closure and archive replay. Preserve stale-coordinate/hash rejection, permanent stale-candidate hold, approved-base preservation, lineage/debt/accounting and replay/cache/input-immutability checks. Qualify further supported rotations and honest capacity rejection at the boundary; no unbounded archive claim.
6. If no valid representation fits, stop with the exact budget/compatibility finding and request a specific contract/scope decision. Do not silently replace Q01 or mark F1/H1 ready.

## 4. Implementation batches, ownership and exits

All new file names below are proposals until the corresponding contract is frozen. Main owns integration/docs; only one writer touches a shared file at a time.

| Batch | Deliverable / main files | Dependency and exit |
|---|---|---|
| N0 — reconcile baseline | Scope, this plan, next-delivery/five-area/completion/acceptance ledgers; preserve historical checkpoints | Documentation-only. Identify source-present vs boundedly checked vs integration-pending. No old pending row becomes accepted merely through wording. |
| N1 — Q01 | `actor-model.js`, private inspection wire/record leaves as justified; common/migration contracts only after a scoped amendment | Follow §3. Keep full Q01 and resource limits. Recheck mailbox paths only where changed readers/contexts affect them; retain historical proof otherwise. |
| N2 — F1/T09/T10 | Stopped complete foundation, all 11 public symbols, issuer/field/reader/writer/crash matrices, compatibility/package contracts | Independent review includes the latest acceptance fix and unresolved TYPES-REVIEW/Evidence findings. Close MF-01 and exact D5 pure held-projection support before the freeze; H1-D later supplies durable loading, not a substitute for this contract. Fix findings, repeat affected checks, freeze hashes/arities/formats and AR-04 handoff. No moving-source CLEAR. |
| N3 — H1 interface/cutover | [H1 plan](H1-ACTORHOST-INTEGRATION-PLAN.md); proposed `actor-host.js`, `actor-store.js`, `actor-mailbox.js`; existing Controller/runtime/contracts | N2. Decide canonical layout/commit marker, durability model, fencing, raw backup and legacy-mode path. Legacy single-implementer execution must not fabricate a supervisor to satisfy actor-pair proofs. |
| N4 — H1-A + H1-D | Store/Host, held loader/migration contracts, read-only Controller/Main diagnostics | N3. Store and workspace ownership; original-byte backup and fail-closed classification before rewrite; torn/missing/conflicting records held. Sessions/evidence/latches/obligations preserved. No active format switch yet. |
| N5 — H1-B + safety | Host, Controller, `actor-runtime.js`, `rpc.js`, Worker bridge, `evidence.js`, `native.js`, Main branch/permission hooks | N4. Durable admission/reservation/readback before new effects; independent observed outcomes; no blind resend. Long I/O outside state lock, fence on completion. Emergency containment on persistence failure. Supported effect profile or pre-effect rejection; workspace reservation through verification and pre-grant revalidation. |
| N6 — H1-C + M1-H | Controller facade, Host/mailbox/store, Main/Worker, versioned authority/probe/telemetry/bridge contracts | N5. All public single-implementer paths use one canonical owner; coherent State/wire cutover with all consumers and held fallback. Durable mailbox attempt/evidence/receipt publication, eligible bounded service, priority/control reserve, late contradiction handling, notices and durable quiescent archive publication. No old writer or unsafe legacy bypass survives cutover. |
| N7 — R1 / AR-05 | Proposed `supervisor.js`, `actor-bridge.js`; `extension.js`, `native.js`, schemas and evidence receipts | N6. Explicit restricted role, confined canonical read/search paths, no inherited generic Fabric/MCP/shell/delegation bypass. One deterministic control/inspection bridge, exact reviewer-bound receipts and no LLM-to-LLM blocking wait. |
| N8 — R2 / AR-06 | Proposed `workflow.js`; Host/mailbox, Controller/Main/Worker/Supervisor, schema/config/metrics | N7. Register Main `pair_submit` with durable receipt; two residents/at most two activations globally/one per actor/one writer. Complete goal-plan-question-answer-report-inspect-revise-approve-escalate loop; settled producer boundary; human-only permission. Enforce report bytes, budgets, immutable assignments, dedup/unknown usage and active-only time. Legacy tools are mode-checked adapters. |
| N9 — S1 / AR-07 | Proposed `idle-policy.js`; Host/PiRuntime and config/status | N8. Optional monotonic 600,000 ms eligibility with all obligation/effect debt clear, generation/activity token and EOF recheck; cold wake only after exit proof and retained-session validation. Stop/off already sticky from N5/N6. |
| N10 — C1/O1 / AR-08 | Config/Main/UI/metrics/schema/example/skill/docs | N8; coordinate idle settings with N9. Finish explicit active/pending Apply, readback/replacement rules, trust/scope/branch fencing and cosmetic no-wake behavior. Distinct runtime/actor/workflow/hold state; stale versus unknown usage/context; notice published/observed/resolved distinction. |
| N11 — F2 | Complete stopped source, typings, public surfaces, package and docs | N1–N10. Fresh independent integration review, pinned all-root strict check and actual registration/config/package inventory on the integrated source. The current foundation's pinned check already passed; later source changes need their own evidence. Native/crash/install qualification is N12, not this static gate. |
| N12 — native qualification | Actual installed package, retained legacy and actor-pair runtimes, owned disposable workspace/store; compatibility and acceptance notes | N11 plus explicit approval of execution/evidence method, profile and any inference cost under the no-tests policy. Use §8.5; no new test/fixture/runner files. Block unobservable crash/effect cases rather than claiming a native pass from static checks. |

### Safety work missing from the previous list

- **Effect coverage/quiescence (GATE-A/B, DEF-01/02/10):** name gates, `agent_settled`, one current-tool flag and ACK are not an admitted-effect barrier. Enumerate supported direct/captured/provider/shell paths. Unsupported profiles must fail before effects; do not patch upstream or substitute prompting.
- **Evidence (R3):** per-command source/run identity, process containment outcome, path/blob/manifest integrity, writer reservation during verification and immediate pre-grant revalidation. Current batch before/after equality misses mutation/restoration between checks. Do not promise arbitrary within-command mutation detection without an enforcing mechanism; unsupported cases stay held.
- **Ownership (R4):** workspace exclusion plus same-session tree/fork/rebind fencing. A pre-navigation callback does not prove navigation committed. Old permission/report/notice callbacks remain inert; PID-only evidence cannot authorize killing or reuse.
- **Bounded cooperation (R5):** trace all six migrated queue/report/repair/recovery limits, active-step time and per-step revisions to durable consumers or an explicit unsupported/not-enabled state. Zero never drops a required review. Report-only repair never obtains an implementation lease. No autonomous queue/recovery rollout under the current exclusion.
- **Native context/permissions/UI (R6/R7):** resource identity/Fovea coverage, compaction restoration, model/effort readback, four dialog types, stale replies, narrow/ASCII UI, installation/removal remain requirements—not covered by model replay or a clean compiler.

## 5. Acceptance ledger for the next implementation

These are concrete implementation checks, not new claims of passes. Source/static checks and permitted bounded no-file public checks are distinct from behavioral/native qualification. Do not create tests, runners or reusable probe artifacts. Where policy prevents sufficient evidence, leave the row blocked.

| ID | Required check | Gate |
|---|---|---|
| NI-01 | Current representation cost traced to every occurrence; amendment lists closed forms/readers/hash domains and aggregate work bounds. | N1 |
| NI-02 | Complete acceptance-bearing Q01, two inspection chains and archive, unchanged caps; supported further rotations quantified. | N1 |
| NI-03 | Stale/hash/base/supersession negatives; once-only revision charge, lineage/debt and replay/cache parity; affected mailbox contradiction/rotation regressions. | N1 |
| NI-04 | Fresh stopped T09 findings closed; T10 exact signatures, formats, issuers, readers/writers, crash matrix and hashes recorded. | N2 |
| NI-05 | Two Main sessions cannot own the same workspace writer/evidence lease; uncertain orphan identity stays held. | N4/N5 |
| NI-06 | Exact original bytes (including malformed/non-UTF8 input) survive failed migration; no guessed attempt/session/supervisor; held status/inspect/cancel work without a runtime. | N4 |
| NI-07 | Journal/root/archive write, rename, sync and commit windows classified; torn/contradictory roots never authorize. Durable-publication claims match the supported filesystem. | N4/N6 |
| NI-08 | Spawn/grant/prompt/decision/verification admission has prior durable identity/reservation; after-await completion checks exact ownership/config/branch/generation. | N5 |
| NI-09 | Failed publication closes admission and still attempts containment; unknown exit/effects retain reservations and obligations. | N5 |
| NI-10 | ACK, accepted, started, native-settled and effect-settled remain separate; unknown delivery cannot be blindly resent or released. | N5/N6 |
| NI-11 | Complete latch/inbox/outbox/decision/notice identity survives retry/restart; duplicate is no extra work; conflicting bytes are held. | N6 |
| NI-12 | M1-H receipts have real producer/transport provenance; eligibility/fairness/control reserve and late corrections reach durable public views. | N6 |
| NI-13 | Legacy and actor modes reach one owner, not two mutable registries; incompatible peers rejected; all held-state consumers and rollback paths exist before version activation. | N6 |
| NI-14 | Supported effect paths enforce grant closure and known-effect quiescence or reject pre-effect; no prompt/name-only authority. | N5/N8 |
| NI-15 | Verification binds each command to source/run evidence; safe paths, known containment, preserved base, immediate pre-grant snapshot validation. | N5/N8 |
| NI-16 | Tree/fork/rebind and cancellation invalidate stale permissions, delivery and grants; ordinary compaction does not erase legitimate work. | N5/N8 |
| NI-17 | Supervisor confinement and exact role/tool/resource admission; proposal and inspection receipts bind actual producing activation. | N7 |
| NI-18 | `pair_submit` registered and reaches durable workflow; full question/revise/final loop; one writer; legacy bypass rejected. | N8 |
| NI-19 | UTF-8 ingress limits at both ends, lifetime report/activation/revision accounting, active-only time, preserved unknown usage and all configured limit consumers. | N8 |
| NI-20 | Idle debt/race matrix, threshold, EOF/exit ordering and retained-session cold wake; stop/off never auto-clear. | N9 |
| NI-21 | Apply/Cancel, pending versus active revision, immutable assignments, disable containment and backup/rollback errors; cosmetic changes do not wake. | N10 |
| NI-22 | Truthful runtime/actor/workflow/usage/notice UI; all public tools, schemas, example, skill and packaged modules agree. | N10/N11 |
| NI-23 | All production roots strict, no suppressions/exclusions; pinned toolchain separately identified; original native/fault/install requirements neither erased nor labeled passed by source review. | N11 |

## 6. Ownership, parallel work and verification

- Main integrates and owns status/acceptance decisions. One shared-file writer at a time; independent readers can inventory contracts, charge paths and capability seams concurrently. Evidence work may proceed in a disjoint source slice after interface agreement, but cannot enable grants ahead of Host safety.
- A worker/model label is not verification. Use a fresh independent stopped-source review; if reviewer transport is unavailable, keep that gate open. Fan-out is optional execution tooling, not a product dependency and not a reason to skip F1.
- Do not rerun unchanged passing checks. After each implementation slice, check changed public paths and negatives, shared-context bounds and all-root type integration; escalate for cross-cutting changes. Record exact failures, fix, then repeat affected checks.
- This planning pass checks source references, document links, requirement-ID preservation, public declarations, unchanged production/config fingerprints and documentation whitespace. It runs no product behavior, compiler, workers or user verification commands.

## 7. Original planning verification actually performed

- Source walkthrough traced live Controller → PiRuntime/PiRpc → Worker publication → Controller evidence/decision, plus inspection/archive reference charging. No Host consumer was found; proposed Host/supervisor/workflow/idle modules remain absent.
- Checked 10 planning/ledger documents: 130 local links resolve; new/changed plan heading links resolve; no trailing whitespace. `git diff --check` passed.
- All **106 original requirement IDs** remain in the same order as HEAD, with 106 unique IDs. NI-01–23 contains exactly 23 unique implementation checks; none is marked passed by this planning review.
- Mechanically confirmed 27 kernel kinds, six coordination exports and five aggregate exports; package scripts remain only `typecheck` and `pack:check`.
- All 24 production JS files plus package/lockfile/tsconfig/example configuration are unchanged by this pass. Before/after combined SHA-256: `7a8d62912d9cc1b235a9f6debf8e824ff8ff223c4cb2d284f1d23c69d9b989db` (hash of the ordered `shasum -a 256` listing).
- **Not run:** compiler, model behavior/probe scripts, package installation, workers, user-configured verification, native/crash checks or migrations. Prior compiler/probe results above remain attributed historical evidence.

**Next executable assignment:** P1 / N2: obtain an independent read-only foundation review of the exact stopped source, using an owner-approved **non-Kiro** reviewer with demonstrated source access. Kiro is not a Pair dependency or a prerequisite to install. Prior reviewer startup failures supplied no acceptance; if the current harness still refuses the selected reviewer, report that environment blocker and seek a separate environment repair, without changing global providers/policies in Pair work. Review both D5 projection branches, Q01 inline retention, all corrected model paths and unresolved TYPES-REVIEW/Evidence findings. Resolve findings and record the T10 freeze before opening H1 source implementation. Do not reimplement already-delivered pure D5/Q01 work without a finding. H1-0 and H1-L design can be examined read-only meanwhile; this is not permission for writable cutover.

## 8. Seven-part completion plan

### 8.1 Scope verdict and current source

All seven requested items belong to the existing scope; they are **not seven completed features**. This section refines delivery order without replacing the 106 original requirement rows, AR-A01–35 or NI-01–23. The baseline is package/config/state/wire `0.1.0/2/1/1`. The pinned TypeScript 5.9.3 typecheck and package dry-run passed in the [toolchain follow-up](T10-CONTRACT-FREEZE-CANDIDATE.md#8-authorized-pinned-toolchain-follow-up); they are not native evidence and were not rerun for this documentation update.

| Source witness | Present behavior / remaining gap |
|---|---|
| `extension.js:roleFromEnvironment`, `main.js:registerMain` | Only Main and Worker roles; Main registers dispatch/decide/inspect/status/cancel. No active Supervisor or `pair_submit`. |
| `controller.js:PairController.init/persist/dispatch/activate` | Session-derived V1 store, local serialization, mutable worker state and partial pre-effect reservations. Init still calls `migrateStoredState` with an attempt-ID generator; this is not truthful held-byte loading or a workspace-wide canonical owner. |
| `actor-runtime.js:PiRuntime`, `rpc.js:PiRpc` | Retained process, session, RPC, lifecycle and containment implementation to reuse, not replace with a second process manager. |
| `actor-model.js:checkAssignment` | Actor-pair-only workflow admission. A valid legacy configuration and `projectLegacyWorkerView` do not supply executable single-implementer admission. |
| `worker.js:publishReport`, Controller scan/finalize/decide, `evidence.js` | Real latch-before-report, duplicate repair and evidence paths to preserve; durable Host/mailbox outcomes and complete effect/verification containment still need integration. |
| `actor-contracts.js`, `actor-model.js`, `coordination.js` | Foundation source and bounded checks exist. Future validators/reducers are not imported into the live Controller path. T09 has no independent verdict and T10 is a candidate. |
| `config.js`, `ui.js`, `metrics.js`, `schema.js` | Legacy settings/status exist; actor-mode Apply, role/workflow observability and all limit consumers remain integration work. |

Reuse [H1](H1-ACTORHOST-INTEGRATION-PLAN.md), its [publication candidate](H1-0-PUBLICATION-CONTRACT.md), the [actor roadmap](ACTOR-RPC-IMPLEMENTATION-PLAN.md) and existing corrected model semantics. Proposed new filenames below are not claims of existing modules. Do not edit provider projects, install/remove providers, patch upstream, activate multiple writers, introduce a transport or restore tests.

### 8.2 Deliverables, owners and exits

Main owns integration, acceptance records and shared-file assignments. Each source slice has one writer; independent readers may work concurrently. An independent reviewer is not the writer whose changes are being certified.

| Requested item | Implementation package / files | Concrete exit (all currently open) |
|---|---|---|
| **P1 — Independent review and freeze** | N2 / F1 / T09–T10. Existing actor contract/model/kernel files; Evidence/Main typing boundaries; T10 inventory. NI-04. | Fresh source-accessing review covers every assigned area at recorded source hashes; findings are fixed and re-reviewed. Freeze all 11 public signatures, exact schemas/hash domains/bounds, 32 actor and 27 kernel event names, issuers, readers/writers, archive/held forms and compatibility/crash obligations. Record static/package results and unresolved native gates separately. |
| **P2 — Canonical Host/store/runtime integration** | N3–N5 / H1-A/B. Proposed `actor-host.js`, `actor-store.js`; Controller, PiRuntime/PiRpc, Evidence, native/Main/Worker adapters. NI-05/07–10/14–16. | One Host owns domain decisions; one Store publishes selected commits; PiRuntime alone owns each process. Store/workspace ownership, durable reservation/readback before new effects, outside-lock I/O and after-await fencing are real call paths. Failed persistence still triggers immediate local revoke and best-effort exact-owned-runtime containment. Depends on P3's held loader before writable cutover. |
| **P3 — Legacy admission, migration, archives and recovery** | N3–N6 / H1-L/D/C + M1-H. Migration/contracts/Host/Store, proposed `actor-mailbox.js`, Controller and all held consumers. NI-06/07/10–13. | Reviewed single-implementer admission uses the same canonical owner without inventing a supervisor or historical identity. Exact-byte backup precedes replacement; status/inspect/cancel can expose held data without launching a process. Durable mailbox, latch/decision/notice recovery and bounded archive replay preserve obligations, dedup and cumulative usage. All legacy public mutations reach Host; no parallel V1 writer survives cutover. |
| **P4 — Restricted Supervisor and two-runtime workflow** | N7–N8 / AR-05–06. Proposed `supervisor.js`, `actor-bridge.js`, `workflow.js`; extension/native/Main/Worker, Host, schemas and config admission. NI-17–19 plus NI-14–16. | Explicit restricted role and canonical read/search confinement; no shell/generic Fabric/MCP/delegation escape. `pair_control` yields; `pair_inspect` only waits for a bounded deterministic Host reply. Main `pair_submit` returns a durable receipt. Full plan/question/answer/report/inspect/revise/approve/escalate loop works with two residents, at most two activations globally, one per actor, one unresolved workflow and **one writer**. Legacy dispatch/decide cannot bypass actor-mode policy. |
| **P5 — Optional sleep/wake** | N9 / AR-07. Proposed `idle-policy.js`; Host/PiRuntime/config/status. NI-20. | Explicit opt-in, disabled by default. A monotonic 600,000 ms threshold applies only with known-clear activation/native/mailbox/permission/verification/retention debt. Generation-bound timer and admission/EOF/exit races are fenced; wake reuses validated retained history only after exit proof. Unknown eligibility prevents sleep; explicit stop/off remains sticky. |
| **P6 — Configuration, observability and UI** | N10 / AR-08. Config/Main/UI/metrics/schema, `docs/tool-schemas.json`, example, skill and user docs. NI-21–22. | Pending versus active revisions, Apply/Cancel, readback and replacement boundaries are explicit. Disable contains rather than merely hiding UI. Cosmetic edits do not wake actors. Actor/runtime/workflow/hold/notice/usage/context views distinguish actual, stale and unknown facts. Registrations, schemas, defaults, layer migration, commands, examples, skill and package contents agree. |
| **P7 — Native end-to-end verification** | N11/F2 then N12; compatibility/testing/acceptance handoff. NI-23 and original native/terminal requirements. | Independent integration review plus pinned all-root typecheck/package inventory, followed by separately authorized actual-runtime observations in §8.5. Record exact profile and outcomes; do not certify unavailable fault cases, unsupported platforms or original required test layers from a build/manual subset. |

### 8.3 Executable order and contract decisions

The numbered request is a feature grouping, not permission to integrate Host before held loading. Use this sequence:

```text
P1: stopped foundation review -> findings -> T10 freeze
 -> P2a: review H1-0 + resolve H1-L; amend/re-review affected frozen contracts
 -> P2b + P3a: canonical Store/Host + exact-byte held loader/read-only consumers
 -> P2c: durable effect adapters and immediate containment
 -> P3b: one-owner legacy/public-tool + mailbox/archive cutover -> H1 review
 -> P4a: restricted Supervisor/bridge -> P4b: two-runtime workflow
 -> P5 optional idle + P6 full configuration/observability (disjoint work only)
 -> N11: stopped integration review + strict/package/surface checks
 -> P7/N12: approved native qualification -> truthful completion decision
```

Required contract decisions before their first writer:

1. **H1-L representation:** choose one closed, non-authorizing-until-committed single-implementer admission/root branch under the same Host/Store. Keep the actor-pair branch strict. Review its record, reducer, digest, archive, projection and peer consequences; amend T10 where semantics change. The H1-0 HEAD union currently has no executable-legacy member. Do not hide this gap in a wrapper, dummy Supervisor or a second `state.workers` authority.
2. **Physical Store contract:** ratify H1-0's stable namespace, canonical workspace key, lock acquisition/release, HEAD selection, immutable root/commit/archive references, byte/depth budgets and sync/readback sequence. No lock stealing, newest-file recovery, rename-only durability claim, unselected-tail deletion or automatic archive GC. File/directory sync support is a profile gate.
3. **Effect capability contract:** enumerate supported direct/captured/provider/shell paths and how each is admitted, observed and contained. ACK/native settlement is not effect settlement. Bind verification per command to source/run evidence and retain writer occupancy until safe reconciliation. If the public API cannot enforce a profile, reject it before effects; do not weaken the barrier or patch upstream.
4. **Coherent compatibility cutover:** enumerate every config/state/authority/probe/telemetry/bridge/mailbox reader and writer and its rejection/held behavior. Preserve Config V2 until its separate complete rollout. Backups, held consumers and old-writer closure precede State/wire activation. An unmodified V1 controller does not honor the new workspace lock and cannot coexist authoritatively.
5. **Actor-mode entry contract:** P4 must include the minimum complete mode/config validation, permission and explicit Apply gate it needs; P6 cannot be used to postpone these safety prerequisites. Future Config V3 validators alone do not enable actor mode. Use configured model identities; Astra/Sol are example roles, not required provider names. Supervision and sleep never auto-enable during migration.

P2/P3 are one coherent delivery, not independently shippable partial format upgrades. After H1 acceptance, Supervisor implementation and selected read-only UI/design work may be split; shared Host/Controller/schema/config edits remain serialized. Strict annotations accompany each slice, not a cleanup phase after activation.

### 8.4 First bounded assignment and evidence discipline

**First assignment: P1, read-only review, no production writer yet.** Inventory the actual source hash and dirty worktree; keep existing changes. Confirm the selected independent reviewer can read a source file before any fan-out. Possible non-overlapping review areas:

- Leaf/common/config/record/wire/migration contracts: exact exported signatures, byte/hash/resource budgets, both D5 held projections and compatibility.
- Aggregate/kernel: full Q01 history, replanning/reconciliation, mailbox contradictions/service history, rotations, late facts, terminal disposition, bounds and cumulative accounting.
- Runtime handoff/Evidence: current Controller/Worker/PiRuntime ownership, unresolved TYPES-REVIEW findings, per-command verification, issuer/permission/branch fences, H1-0 crash and publication assumptions.

Each reviewer returns source locations, reproduction reasoning, severity, coverage/omissions and exact snapshot identity. Main consolidates findings, assigns one correction writer per shared file and requests fresh review of affected stopped source. A transport failure, partial slice review, writer self-review or structural navigation report is not T09 CLEAR. H1-L is a subsequent explicit amendment, not a circular demand that H1 implementation already exist before T10.

For every implementation slice record: files/public symbols; before/after source identity; preserved invariants; changed reader/writer/version matrix; affected static and explicitly permitted bounded checks; exact failures/fixes; review verdict; remaining NI/AR/original rows. Do not rerun unchanged passing checks without a reason. No tests, fixtures, reusable probe scripts or generated test evidence are added. Run the registered pinned typecheck after source integration and `pack:check` when shipped surfaces change; neither proves behavior.

### 8.5 Native qualification matrix and authorization gate

This request plans native verification; it does **not** run it or override [TESTING.md](TESTING.md). Before P7, agree explicitly on a manual observation/evidence method consistent with the no-tests policy (or a separately approved policy amendment), exact runtime/model profile, bounded inference budget if needed, and an isolated disposable workspace/store/session namespace. No production user-state migration, broad process kills, provider changes or shared-state reset. Until this approval exists, P7 is **BLOCKED**, not implicitly authorized by the plan.

Record source/package identity, installed Pi/Fabric/Fovea/Node versions and resource identities, OS/filesystem, selected/observed models, configuration, operation/generation/session identities, expected versus observed behavior and limitations. Keep credentials and private transcripts out of shared notes. Startup-only observations must not be presented as a full inferred workflow; a dry-run archive is not a clean installation.

| Scenario group | Required direct observation / failure exit |
|---|---|
| Actual installation and admission | Load the actual packed extension without hoisted dev dependencies; validate tools/resources/roles and peer/profile rejection before inference; supported uninstall leaves upstream and retained data intact. |
| Legacy retained round trip | Dispatch -> question -> answer -> report -> inspect -> revise -> approve/final/cancel through Host; ordinary turns and compaction retain real session identity/history. Duplicate request/decision produces no second effect. |
| Full actor-pair round trip | Submit -> Supervisor plan/yield -> implementer question/yield -> answer -> new attempt -> frozen evidence -> exact Supervisor inspection/review -> revision and final acceptance/escalation. Main stays responsive; no circular model wait. |
| Confinement and ownership | A competing Main/workspace alias cannot acquire writer/evidence ownership. Supervisor cannot mutate, escape read roots, spawn children or grant permissions. Unsupported Main/Worker effect paths reject before execution. |
| Permissions and evidence | All supported dialog types, denial/timeout and stale replies after cancel/rebind; permission remains human-owned. Wrong/stale evidence, changed source, verification failure and empty verification configuration cannot produce false approval. |
| Migration and recovery | Exact malformed/non-UTF8 legacy bytes remain preserved and inspectable. Mixed peers, unknown legacy identity, missing retained history and orphan ownership stay held; no fabricated identity or automatic resume. |
| Publication/crash windows | Exercise observable root/archive/HEAD/authority windows in the isolated owned instance; missing/corrupt/torn selected records hold. Failure of hold publication still attempts containment. Unknown outcomes never free occupancy or trigger blind resend. Unsupported/unobservable power-loss behavior remains unqualified. |
| Mailbox/late facts | Latch-only recovery, lost ACK, identical/conflicting duplicate, outbox/notice restart and late contradictory settlement preserve obligations; producer origin and accepted/started/settled distinctions remain visible. |
| Limits/accounting/archive | Ingress UTF-8 bytes, control reserve/fair service, activation/revision/report budgets, active-only time, unknown usage and once-only charging; full-prefix archive reopen retains evidence/dedup/counters within unchanged bounds. |
| Stop/sleep/wake races | Cancellation/disable/shutdown contain exact owned children. Opted-in idle does not close at 599,999 ms; eligibility at/after 600,000 ms, new-work/EOF/exit races and same-history cold wake are observed. Stop remains sticky. Disabled sleep is not a passed sleep check. |
| Configuration and UI | Apply/Cancel, pending/active revisions, model readback and role/cwd replacement; status does not wake. Narrow/ASCII UI, stale sleeping context, unknown costs and result-notice published/observed/resolved states remain truthful. |

Faults may be induced only within explicitly authorized owned instances using supported operational controls, not new test-only production hooks or harnesses. If the method cannot establish a required case under current policy, leave that case unverified. Native observations do not replace the original U/R/N/T/L required-layer obligations wholesale; no full release/unattended-safety claim while applicable requirements remain unsupported or unqualified.

### 8.6 Planning acceptance ledger

This ledger certifies only the scope/plan update, never P1–P7 implementation.

| ID | Planning check | Result |
|---|---|---|
| SP-01 | Seven items mapped to current source, N/AR/NI owners and concrete exits; P2/P3 ordering and H1-L gap explicit. | Source walkthrough complete. |
| SP-02 | All 106 original requirement rows and NI-01–23 unchanged; AR-A01–35 roadmap retained. | PASS: 106 original rows and 23 NI rows byte-identical to the pre-edit baseline; unchanged roadmap covers AR-A01–35. |
| SP-03 | Changed documentation links/anchors and whitespace valid; authoritative entrypoints agree. | PASS: 139 local documentation links/anchors checked across six edited docs; whitespace checks pass; entrypoints point here. |
| SP-04 | Eleven public signatures, active versions, registrations and package commands mechanically confirmed. | PASS: AST confirms 11 signatures, six facade exports, 32/27 event names, five Main tools plus Worker report, active 0.1.0/2/1/1 versions and only two package scripts. |
| SP-05 | Only designated planning/status docs changed; source, package/lock/config and existing dirty work preserved. | PASS: all 86 non-target worktree files retain the same combined SHA-256, including source, package/lock/config and existing dirty files. |

**Verification receipt:** documentation/source-inventory checks only; the original 106 requirement-row hash is `351902ae93471bed4589e12c4bf0bec0a91bb46215ca176f8325efbbff64d14f`, NI-row hash is `4e2282666fc048131a53d29c43d5dc2656f7452bc8000614aa3e75b8ca1a42ff`, and the before/after combined fingerprint of all 86 non-target worktree files is `33fb322ebcca4c9f87fd67979a0dd25991d175d753de28cf1735d46e3743b9df`. AST inspection also confirms the live extension import graph reaches Controller/PiRuntime/PiRpc, not the future actor facade/model. All seven proposed integration modules remain absent.

No typecheck, product behavior, review agent, native worker, configured verification, dependency/provider installation, settings Apply, user-data migration, commit or release is run by this planning update. The next action remains the P1 assignment above.

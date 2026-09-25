# T09 foundation review — blocked checkpoint

**Later correction:** [D5/MF-01](D5-LEGACY-PROJECTION-CORRECTION.md) is now source-corrected with 25 bounded public outcomes and zero 24-root supplemental diagnostics. A fourth fresh reviewer also failed before source access. The subsequent [held-carrier amendment](D5-HELD-CARRIER-CONTRACT.md) implements the external-byte projection with 39 bounded outcomes; a fifth reviewer failed before source access even with normal extension loading. Independent closure and T10 remain open. The stopped hashes and checks below describe the original pre-correction review attempt, not the corrected source.

**Current follow-up:** [T10 preparation](T10-CONTRACT-FREEZE-CANDIDATE.md) captures 32 exact source type expressions, bounds and 32 actor/27 kernel event names; [H1-0](H1-0-PUBLICATION-CONTRACT.md) drafts publication/recovery/effect ownership. Source remains stopped. A concrete startup mismatch is now witnessed: the installed worker calls a Kiro-only guard before writing its run record, prior requests selected Astra, and the live model registry has no Kiro entry. No guard was bypassed or identical retry launched. Reload with the configured Kiro provider registered, then obtain fresh read-only coverage. Historical stderr is unavailable, so this diagnosis is not proof of every prior failure's cause.

**Status: independent foundation review COMPLETED 2026-09-25 (see §6); T10 RATIFIED (see [T10 §9](T10-CONTRACT-FREEZE-CANDIDATE.md)); AR-04/H1 opened for the H1-L decision and the closed-gate store/host slice. Native/runtime qualification remains unverified.** This checkpoint originally followed the [Q01 implementation](Q01-INLINE-INSPECTION-CHECKPOINT.md) and [N2 plan](NEXT-IMPLEMENTATION-PLAN.md). Sections 1–5 preserve the historical blocked state; §6 records the completed independent review, corrections and verification evidence.

## 1. Stopped source and failed independent runs

Package identity: `pi-fabric-pair@0.1.0`. All 24 production JS files remain stopped. Actor-model SHA-256:

```text
c3812a4d23b72aa7ae78f533103ea676a729dcebb8bc020161196de07bbb5777
```

SHA-256 of the ordered output of `shasum -a 256 src/*.js package.json tsconfig.json`:

```text
218f5733d09492a8569993244cd5b755f52bf2784914abb3292e32b2c86f2580
```

Three fresh, nonrecursive Astra reviewers were assigned disjoint read-only coverage, native read/grep/find/ls only, `extensions:false`, no shell or writes. Every run failed with **“Agent transport exited without a result”**, zero turns, zero tool calls and zero model usage. They did not perform the required first package read or inspect any source. The retained run event stream inspected for T09-A was empty; no root cause beyond transport failure is established by that log.

| Run | Intended coverage | Actual outcome |
|---|---|---|
| `a05143b9eb634b70995552b5d1a2f968` | Submission/authority, inspection/raw-inline accounting, prefix composition, structural replanning and stale commitments | Failed before review |
| `d81f9df5584b4df09eec0c289c455063` | Mailbox/dedup/reconciliation/late facts, lifecycle/reservations, usage and archive carryover | Failed before review |
| `4a3907336355436b86f1ef02371f2f6a` | Six-symbol facade/leaves, D1–D6, legacy projection, actual consumers, compatibility and the two corrected Evidence findings | Failed before review |

Discovery of the alternate official Claude runner also failed: `spawn claude ENOENT`. No alternate reviewer launched, no dependencies/tools were installed, and no global configuration was changed. These outcomes are execution blockers, not CLEAR or BLOCKED source verdicts from reviewers. Do not restart the completed handles or count prior scoped reviews as full T09.

## 2. Main-witnessed pre-freeze finding

### MF-01 — P1: legacy projection drops preserved obligation/history references — SOURCE-CORRECTED; INDEPENDENT CLOSURE OPEN

**Witnesses:** `src/coordination.js:305–313` (`legacy`), `:1496–1501` (`parseGenesis`); `src/actor-model.js:421–427` (`parseKernelGenesis`), `:2520–2545` (`workflow-submitted`), `:3664–3678` (`projectLegacyWorkerView`).

The kernel's closed legacy record preserves `pending.reportRef` and requires **nonempty** `historyRefs`. Aggregate parsing retains that validated genesis. The public projection selects a workflow with that legacy record, but its return always supplies `pendingObligationRefs: []`, `historyRefs: []` and `diagnostics: []`, and uses only two constant held reasons. It never reads the retained pending/history fields. Thus any successfully projected legacy worker loses at least its mandatory history references in this view; a pending report reference is also hidden. The canonical history is not deleted, and no runtime consumer is active, but the required read-only discoverability contract is not implemented truthfully.

This is a **source-witnessed Main finding**, not a new behavioral probe or an independent reviewer verdict. It must not be deferred entirely to H1-D: D5/T08/T10 already require a truthful pure projection. Later filesystem backup, provenance, adoption and tool routing remain H1 work.

**Minimum correction and acceptance:**

- Derive pending/history references from validated retained facts, including a pending report with unknown/null report ID but an existing report reference. Do not fabricate an obligation ID or an execution identity.
- Preserve applicable held/unknown facts rather than implying that an empty array proves absence. Specify what `known`, session, diagnostics and cancellation status actually describe.
- Explicitly separate representable kernel legacy history from external held-byte carriers. `bindArchive` rejects nonempty `heldLegacyRefs` in an empty archive context (`:3242`); the chain branch checks retained identities (`:3299`) but does not turn `HeldLegacyEvidenceV2` into a worker view. Do not claim universal V1 migration from the existing function name.
- Keep held state non-authorizing, shared operation budgets and immutable output; never create a runnable assignment/supervisor merely to make an old worker inspectable. If the supported carrier path needs an amendment, freeze its exact input/resolver and failure semantics before implementing it.
- Main must check retained pending/history visibility, unknown fields, cancelled/held states and rejection without input mutation using permitted no-file checks; then obtain fresh independent review. No test/probe files are authorized.

D5 support and unsupported forms need explicit closure before T10. Merely copying two arrays is not evidence that every held migration profile is represented.

## 3. Exact public-surface inventory

The required **11 public symbols** are six facade exports plus five aggregate exports. The coordination module's separate public/internal helper inventory is not a substitute for the facade.

| Public entry | Implementation | Arity |
|---|---|---|
| `validateActorConfigV3` | `actor-contracts.js` → `actor-config-contracts.js` | 1 |
| `validateActorRecordV2` | facade → `actor-record-contracts.js` | 1 |
| `validateWorkflowRecordV2` | facade → `actor-record-contracts.js` | 1 |
| `validateActivationRecordV2` | facade → `actor-record-contracts.js` | 1 |
| `validateMailboxEnvelopeV2` | facade → `actor-wire-contracts.js` | 1 |
| `validateActorControlV2` | facade → `actor-wire-contracts.js` | 2 |
| `validateActorStateV2` | `actor-model.js` | 2 |
| `projectLegacyWorkerView` | `actor-model.js` | 3 |
| `validateActorWorkflowModel` | `actor-model.js` | 2 |
| `validateActorWorkflowEvent` | `actor-model.js` | 1 |
| `reduceActorWorkflow` | `actor-model.js` | 3 |

Main mechanically checked exact names/arities via the installed TypeScript parser without executing project modules. Import/export dependency traversal is acyclic; neither the facade nor aggregate model is reachable from the active `src/extension.js` import graph. A correct symbol inventory does not close MF-01 or qualify any implementation semantics.

## 4. Checks actually performed

| Check | Result / limit |
|---|---|
| `node --check` for all production JS | **PASS: 24 files** |
| `git diff --check` | **PASS** |
| Public surface / static dependency graph | **PASS:** exact 6 + 5 exports/arities, acyclic static graph, no active facade/model consumer |
| Kernel kind preservation | **PASS:** exact ordered list of all 27 original kinds |
| Active formats/defaults | **PASS:** Config 2, State 1, wire 1; disabled default; `maxWorkers:1` |
| Tool registrations / manifest | **PASS:** Main `pair_dispatch`, `pair_decide`, `pair_inspect`, `pair_status`, `pair_cancel`; Worker `pair_report`; package entry `./src/extension.js`, skills `./skills`. No active `pair_submit` or supervisor integration claimed. |
| Original acceptance rows | **PASS:** all 106 complete original rows equal Git HEAD, in order; SHA-256 of rows joined with newline: `351902ae93471bed4589e12c4bf0bec0a91bb46215ca176f8325efbbff64d14f` |
| Registered `npm run typecheck -- --pretty false` | **BLOCKED / exit 127:** `sh: tsc: command not found`. No compiler diagnostic result and no pinned certification. |
| Registered `npm run pack:check` | **PASS / exit 0:** dry-run, ignore scripts, 83 files before this documentation checkpoint. Not an installation or release. |
| Independent T09 review | **NOT PERFORMED:** all three transports failed before source access |
| New behavioral/native/crash/install checks | **NOT RUN** |

An earlier parallel check batch was aborted by a sibling malformed grep pattern; those aborted commands have no result. The registered command outcomes above come from the subsequent all-settled invocation, not the aborted batch. Previous Q01 behavioral results and the zero-diagnostic supplemental compiler checkpoint remain historical evidence; they were not rerun or relabeled as this pass's checks. No project ESM was loaded for the AST inventory, and no checking script was written to disk.

## 5. Current acceptance and next handoff

| Gate | Current status |
|---|---|
| NI-01–03 / N1 Q01 | Prior bounded checkpoint retained; not rerun |
| NI-04 / N2 T09/T10 | **BLOCKED:** fresh independent coverage absent; both D5 projection branches are implemented and await review; final field/issuer/reader-writer/crash freeze remains open |
| T08-PATH | Complete acceptance-bearing Q01 model/history/archive evidence exists; no longer accurately described as wholly pending. Independent/full runtime qualification remains open. |
| H1 / AR-04 | Not opened; no source writer or partial format activation |

MF-01's represented-kernel projection correction is delivered in the linked follow-up. The held-byte representation/resolver follow-up is also implemented; fresh independent review of the complete current foundation is still required. Do not weaken admission or synthesize identity to expose legacy data. After affected Main checks, a fresh independent reviewer must cover **the entire current foundation**, including Q01, mailbox/replanning, all 11 symbols, all 27 kind dispositions, D1–D6 and the corrected Evidence paths. Re-capture source hashes after any correction.

After compliant reviewer startup, use at most two concurrent read-only assignments: (A) actor-model/kernel histories, Q01, authority/usage, mailbox/reconciliation/replan/archive and both D5 projections; (B) common/facade/record/wire/migration contracts, D1–D6, exact schemas, V1 compatibility and corrected Evidence paths. Both first read the absolute package identity, use only read/grep/find/ls with extensions enabled as required by policy, and report witnessed paths/findings/coverage exclusions. Discover the actual registered model key; do not infer it or launch forbidden runners. Together they must cover the whole current foundation; completion without source access is not acceptance.

Only then may Main resolve findings, ratify the prepared exact formats/issuers/reader-writer/publication/readback/crash/incompatible-peer matrices and issue the ordered AR-04 handoff. The [H1 plan](H1-ACTORHOST-INTEGRATION-PLAN.md) remains design-only. No cap increase, Q01 reduction, original requirement waiver or runtime safety certification is introduced here.
## 6. Independent review completion and correction record — 2026-09-25

All reviews below are fresh read-only runs (`extensions:false`, native `read`/`grep`/`find`/`ls` only, cwd `pi-fabric-pair`, `recursive:false`). No tests, probes, shell execution, runtime loads or credential access were performed by any reviewer. Main applied corrections as the single writer per file; every correction was re-reviewed by a fresh independent run.

### 6.1 Review chain

| Step | Reviewer / model | Scope | Verdict |
|---|---|---|---|
| Availability smoke | `openai-codex/gpt-6-luna` (run `ab4d9c38…`) | `src/actor-model.js` source access + `checkAssignment` admission mode | Source read confirmed; actor-pair admission witnessed |
| Area A | `gpt-6-luna` (run `ccd7bc56…`) | contracts/compatibility: config/record/wire/migration contracts, held projections, bounds, namespaces | **CLEAR**, no findings |
| Area B | `gpt-6-luna` (run `d0073515…`) | aggregate/kernel: Q01, mailbox, reconciliation, replanning, rotations, late facts, accounting | **FINDINGS**: B-01 contradictory mailbox delivery stages could pass without an uncertain-delivery hold |
| Area C | `gpt-6-luna` (run `58cdadcb…`) | runtime handoff/Evidence: ownership, verification, fences, containment, crash assumptions | **FINDINGS**: C-1 retained-history branch not fenced; C-2 parent watchdog cannot distinguish PID reuse |
| Re-review 1 | `gpt-6-luna` (runs `d7a031f3…`, `fc47ee8f…`, `5b73e3d0…`) | targeted verification of corrections B-01/C-1/C-2 | C-1 **FIX VERIFIED**; B-01 **NEW ISSUES** (native-only contradiction gap, HIGH); C-2 **NEW ISSUES** (listener registration race, MEDIUM) |
| Work-order validation | `zro/glm-5.3` in-session handoff (orchestrator) | all six residual edit anchors | All anchors confirmed exact and unique; semantics validated |
| Astra verify 1 | `openai-codex/gpt-6-astra` (fresh child run) | residual fixes B-01 + C-2 | B-01 all checks PASS; C-2 **FIX INADEQUATE**: cleared-channel disconnect race (HIGH) |
| Astra verify 2 | `gpt-6-astra` (fresh child run) | C-2 amendment (latch outside channel guard) | Original HIGH fixed; **LOW** residual: PID fallback installable after mid-await disconnect |
| Astra verify 3 | `gpt-6-astra` (fresh child run) | C-2 final amendment (`hadIpc` fallback restriction) | **FIX VERIFIED**, zero open issues |

Implementation notes: the `zro/deepseek-v4.1-flash` implementer handoff was scheduled per owner direction but preempted by the owner's next instruction before execution; Main applied the already-validated work order verbatim instead. Per owner directive, no comments or tests are written; only type-carrying JSDoc required by the pinned `checkJs` gate is retained.

### 6.2 Corrections and final source identity

| Finding | Correction (files) | Independent closure |
|---|---|---|
| B-01 mailbox contradiction hold | `contradictoryStages` helper; consumed resolutions require no contradiction; `validateMailboxHolds` scans the union of attempt bindings and mirrored facts per attempt, with native kernel facts admitted only for the exact matching operation | Astra verify 1 + 3: **VERIFIED** |
| C-1 retained-branch continuity | `PiRuntime#leaf` fence + `#descendsFrom`; active leaf must equal or descend from the verified leaf | Luna re-review: **FIX VERIFIED** |
| C-2 parent-loss liveness | owned IPC channel in `rpc.js` stdio; latched `parentDead`/`parentGone` registered synchronously at load; already-disconnected latch outside the channel guard; `hadIpc` restricts the PID fallback to launches that never had IPC; `before_agent_start`/`turn_start`/`tool_call` fail closed | Astra verify 3: **VERIFIED** |

Gates at final state: `npm run typecheck -- --pretty false` exit 0; `npm run pack:check` exit 0 (88 files). Final ordered aggregate `shasum -a 256 src/*.js package.json tsconfig.json` digest: `26096bbaa5a3f7f3f50793724b7ef65bcce11c889afeb3a4c6a8916c2c1ed316`. Changed files: `src/actor-model.js` `02e4bcec…`, `src/actor-runtime.js` `ea9f47f7…`, `src/rpc.js` `40dcac0e…`, `src/worker.js` `24d15419…`. All 11 public facade/aggregate signatures, active versions `0.1.0/2/1/1`, tool registrations and event namespaces are unchanged.

### 6.3 Coverage and remaining limits

Covered: contracts/compatibility (Area A), aggregate/kernel incl. Q01, mailbox/reconciliation/replanning/accounting (Area B), runtime ownership/verification/fences/crash assumptions (Area C), plus targeted re-reviews of every correction. Not covered and not certified: native/runtime behavior, crash/filesystem durability, power-loss, installation, provider profiles, migration execution and actor-mode workflow. Same-session branch recovery and per-command verification remain runtime-unqualified. These limits are consistent with [TESTING.md](TESTING.md); native qualification (P7/N12) remains blocked pending owner authorization.

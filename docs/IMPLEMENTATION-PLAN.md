# Implementation plan — remediate and qualify Fabric Pair V1

> **Owner directive:** all automated tests, fixtures, test/probe runners, and generated test evidence were removed. Do not add or regenerate tests. **Execute only the current sequence in [§13](#13-active-implementation-plan-after-test-removal).** Earlier work packages retain useful implementation requirements, but their test-writing instructions and test-backed pass counts are historical, not active deliverables or current certification. Current allowed commands are in §10.

**Status:** implementation in progress; first safety slice committed as `7583104`. No R0–R7 package is yet certified complete.

**Scope:** [SCOPE-OF-WORK.md](SCOPE-OF-WORK.md).

**Acceptance:** [ACCEPTANCE-LEDGER.md](ACCEPTANCE-LEDGER.md), mapped to the original handoff.

**Principle:** retain the working architecture; prove safety-critical integration before expanding features.

R0–R7 below are **remediation work packages**, not assertions that the original handoff's P0–P7 were completed.

## Current checkpoint

Source inspection after test removal confirms package `0.1.0`, configuration schema V2, persisted state V1 and Pair wire V1. Product V1 remains incomplete; VNext is deferred and no product V2/V3 roadmap is approved. Preserve the existing opt-in, single-worker restrictions, retained sessions, evidence guards, configuration migration and immediate activation-failure containment.

NEXT-01/02 are in progress: concrete leaf/public payload validators and a bounded pure coordination/transition kernel are implemented and source-reviewed, without runtime consumers. Complete aggregate state/legacy records, the remaining transition families, model freeze, durable runtime integration and production typing remain blockers. The latest full compiler exits 2 with **538 Pair-source and zero dependency diagnostics** (620-source baseline); contracts, schema and both new model modules have zero diagnostics. No CI workflow or active version change is introduced. Tests, fixtures, runners and result artifacts remain removed, so the old 86/5 counts are historical only. See [the exact implementation boundary](NEXT-01-02-PLAN.md#9-current-implementation-checkpoint).

The current source witnesses and scope boundary are in [SCOPE-OF-WORK.md §10](SCOPE-OF-WORK.md#10-current-scope-after-test-removal). The [current implementation ledger](ACCEPTANCE-LEDGER.md#current-no-tests-implementation-ledger) separates planned work, source review and static checks from original behavioral acceptance.

### Next bounded slices

1. **NEXT-01 + NEXT-02:** co-design concrete records and pure transition rules (B4/B5), then freeze the state/wire compatibility decision.
2. **NEXT-03 + NEXT-04:** integrate held legacy migration, current-state consumers and durable grant/report/import storage (B4/B6). Merge shared controller/worker changes sequentially; do not activate an incomplete format or journal.
3. **NEXT-05:** finish strict annotations across every production module (B7), building on the concrete types rather than hiding diagnostics.
4. **NEXT-06:** add static-only CI, inspect packaging and reconcile documentation (implementation portion of B8). This is not the original test-dependent foundation or release gate.
5. **Later V1:** lifecycle/policy continuity, admitted-effect settlement, branch/delivery recovery and evidence revalidation before report/budget consumers, queues or automatic repair/recovery. Then complete native UI, context, permissions and accounting.

Only public-source/API review of R0 feasibility may proceed alongside this checkpoint; do not recreate native probes or harnesses. Unsupported effect surfaces remain rejected. Existing production verification features remain intact, but this planning work neither configures nor runs them. Parallel workers, new runtimes/platforms, a TypeScript-source rewrite and paid inference are outside the next checkpoint.

## 1. Dependency order and working method

```text
R0: public-interface feasibility + reproducible failing regressions
 └─ R1: contracts, opt-in and migrations
     ├─ R2: authorization + known-effect quiescence
     ├─ R3: evidence containment + verification identity
     └─ R4: native lifecycle, ownership and delivery recovery
         [R2 + R3 + R4 converge]
          └─ R5: bounded cooperation + active-only budgets
              └─ R6: context, permissions, UI and accounting
                  └─ R7: full release qualification
```

R3's isolated evidence work can proceed during an R0 integration blocker. R2 and R4 share grant/ownership contracts: agree those in R1 and integrate sequentially where they touch the same controller transitions. No phase may advertise a supported profile before the relevant native gates pass.

- Work only in `pi-fabric-pair` and disposable fixtures. Do not mutate `source refernce` or installed packages.
- Original baseline: `054952d` (`Initial commit`); first safety slice: `7583104`. This scope review uses HEAD `ca09923` plus the existing uncommitted R1 configuration/contracts patch. Follow the user's commit/push policy and never include unrelated workspace content.
- Keep a small change per invariant with regression evidence; follow the user's commit policy.
- Preserve the original acceptance wording/layers. Update ledger status with test names, version/build identities, commands and redacted artifacts.
- Prefer existing modules; extract a small state/authorization helper only when it gives transitions an independent test boundary. Do not add a generic workflow engine or new backend.
- Default tests are offline. Native tests use a deterministic provider and isolated agent directory, not production auth/configuration. No LLM greeting, cache heartbeat, production repository mutation or private API shortcut.

## 2. R0 — Public-interface feasibility and native regression harness

**Primary files:** `tests/fixtures/`, proposed `tests/native/`, `scripts/`, `docs/COMPATIBILITY.md`, proposed `docs/INTEGRATION_PROBE.md`.

### Work

1. Inventory exact installed launcher, Pi/Fabric/Fovea versions/builds, resource paths, supported OS/Node, extension trust and effective policy surfaces. Record source-checkout identity separately from installed build identity. Do not export secrets.
2. Promote the review's disposable provider/harness into portable test fixtures: resolve configured resources rather than hard-code this machine's absolute paths. Retain cleanup, bounded deadlines and no-network provider behavior.
3. Reproduce three native failures against unchanged Pair: (a) provider mutation before/after report in one `fabric_exec`, (b) approval before a background write finishes, (c) start/stop/reopen before any assistant message. Add native branch-navigation coverage rather than treating a source finding as a runtime pass.
4. Audit the **publicly supported** way to constrain every reachable Fabric action, including generic `tools.call`, direct proxies, provider management, MCP, agents, captured tools, shell and alternative execution runtimes. Check whether a guest can widen the selected surface. Pi `tool_call`/`tool_result` replay and activity observation are not interchangeable with pre-effect authorization.
5. Prove the available foreground/background-job lifecycle contract, including implicit shell detachment after `shellHangMs`, concurrent calls, cancellation, reload and pending job ownership.
6. Prove native lazy-persistence behavior and supported no-inference persistence/resume options. Nonempty `sessionFile` is not evidence of materialization. Do not write Pi session JSONL yourself.
7. Complete the original P0 interface probes with the real stack: two retained assignments, one Main reply, captured report, permission allow/deny/cancel, Fabric compaction metadata, closed grant under actual Fovea continuation, and no competing Prewalk ownership.

### Explicit go/no-go decisions

| Gate | GO requires | If unavailable |
|---|---|---|
| GATE-A: effect coverage | A demonstrated public per-action authorization route, or a supported immutable/restricted capability profile that removes every ungated effect path. | Reject that profile before dispatch; document the missing seam and smallest upstream request. Do not invent a hook or substitute a prompt. |
| GATE-B: quiescence | Supported effect/job tracking or restrictions that prevent untracked detachment for the admitted surface. | Refuse effectful activation/checkpoint publication for the unsupported path. `agent_settled` alone is insufficient. |
| GATE-C: empty sessions | A supported no-inference identity-preserving path, or an explicitly approved scope amendment for clearly labelled never-used sessions. | Keep recovery qualification blocked. Do not fabricate continuity or send a greeting to force a session file. |

A supported mechanism demonstrated in a small harness is the R0 feasibility exit; the Pair regressions become green through R2/R4. Missing seams block release, not independent evidence/configuration work. Restricting native context functionality or required Fabric/Fovea capabilities is not an acceptable hidden workaround.

**Output:** reproducible fixtures, red baseline evidence, selected supported profile and an interface decision record. No broad UI or multiworker work before this decision.

## 3. R1 — Normalize V1 contracts, consent and migration

**Progress boundary:** migration previews/backups, layer-only saves, role guards, normalized policy names, identity fields, bounded deferred-field representation and explicit retained-backup import are implemented in the current patch. Remaining R1 work is strict pinned tooling, typed/runtime-validated shared contracts and migration fault/version-compatibility follow-ups. Task policy is copied at dispatch but currently replaced on resume; Worker authority does not yet carry task limits. R2/R4 own live grant/hold enforcement and lifecycle integration; R5 owns limit consumption. Preserve this division rather than declaring R1 complete when only configuration fields exist.

**Primary files:** `src/config.js`, `src/schema.js`, `src/extension.js`, `src/util.js`, `src/controller.js`, `src/worker.js`, `src/rpc.js`, examples, `package.json`, proposed strict-check configuration/lockfile/CI and small shared contract/transition helpers with focused tests. All production modules remain in the strict-check scope.

### Work

- Implement disabled-by-default setup and a validated role guard. Malformed/ambiguous worker role must fail clearly, not initialize a Main controller. Registration-only loads must stay side-effect-free.
- Approve the compatibility choices in the scope document. Add one normalized configuration version and explicit migration of the current shipped shape and original handoff example. Never choose a model/provider for an incomplete configuration.
- Expose `final-only`, `milestones`, `every-step`; store explicit review boundaries/groups in bounded work orders. Default final review to required; the user-only opt-out does not bypass quiescence/verification.
- Preserve worker IDs/history but qualify one active worker/writer. Reject unsupported simultaneous/multi-workspace activation with a migration explanation; do not silently delete configured slots.
- Implement trust-aware global/project precedence, provenance, arrays-replace semantics, safe explicit saves and configuration conflict diagnostics. Native Pi/Fabric/Fovea settings stay upstream-owned.
- Validate bounds in the handoff example: 8 queued tasks, 8 queued reviews, 40 reports/task, 16,384 report bytes, 1 report repair, 1 bounded recovery reconciliation, 3 revisions/step and 1,800,000 ms active-step time. These are proposed engineering defaults, not automatic increases or measured optima. Keep existing useful token/turn/evidence/request bounds.
- Define finite discriminated report/decision schemas, including `needs_user`, identity/version fences and host-owned IDs. Enforce UTF-8 byte bounds, not only JavaScript string length.
- Specify shared durable contracts: owner epoch, worker generation, grant/attempt, delivery operation ID/state, immutable assignment policy, checkpoint/evidence identity, session materialization and lifecycle hold reasons. Retain current identifiers where possible.
- Add strict static checking against public Pi types. Recommended implementation is ESM JS with `checkJs`/JSDoc; no runtime upstream imports are needed just for types. Pin dev tooling/test dependencies and add a lockfile.

**Exit:** defaults cannot start paid work; configuration/schema/migration/role tests pass; the original example is accepted through the documented import path; no runtime authority changes merely from opening/cancelling settings.

## 4. R2 — Enforce grants and known-effect quiescence

**Primary files:** `src/native.js`, `src/worker.js`, `src/controller.js`, `src/main.js`; the supported integration mechanism selected in R0.

### Work

1. Apply GATE-A to the actual selected surface. Give worker and Main distinct permissions. Prevent recursive agents and profile widening. For unknown effects, require the supported human policy or reject them; never presume they are read-only.
2. Make grant admission atomic relative to yielding: `running → quiescing → waiting/paused/closed`. A reload of an older authority/latch must not reopen the same closed grant. Validate identity/model/epoch before each admitted effect.
3. Close admission before publishing a report. Track operations by stable call/job ID and grant generation; a single `currentTool` display field is not a barrier. Drain already admitted effects without granting new ones.
4. For V1, reject explicit background work unless GATE-B proves tracked completion/cancellation. Also handle implicit detachment and jobs started before report/pause. Unknown completion means `needs_user`/unverified effects, never review-ready.
5. Require current-generation native settlement, no native retry/compaction/pending task execution, and resolved known effects before evidence capture. Preserve contextual notices; do not blindly clear all queued user/decision messages.
6. Enforce Main's single-writer policy across all admitted paths. Review reads are allowed; configured verification has explicit authority. Arbitrary bash is not a read capability. Where multiple Pair Main instances share a workspace, do not allow a second uncoordinated Pair writer or adoption by worker name.
7. Recognize actual Fovea tools: `fovea_sketch`, `fovea_focus`, `fovea_dwell`, `fovea_impact`. Test captured and native paths rather than only invoking `gateTool()` directly.
8. Keep authorization separate from human permissions. Fovea notifications, context restoration and review approval cannot reopen a grant or approve a permission dialog.

**Exit:** E01–E04 and H11 pass for the supported profile, including same-program post-report calls, native/captured/provider paths, simultaneous siblings, explicit/implicit background jobs, Fovea continuation and Main mutation attempts. Unsupported combinations fail before effects. Pair remains a workflow controller, not an OS sandbox.

## 5. R3 — Contained evidence and snapshot-bound verification

**Primary files:** `src/evidence.js`, `src/util.js`, `src/controller.js`, proposed evidence regression tests.

### Work

- Resolve/check every path component under the canonical allowed workspace. Protect intermediate symlink traversal as well as the final file; reject changed/unsafe ancestry before reading outside bytes. Use supported descriptor/path validation appropriate to the tested platform; do not claim a lone `realpath` check eliminates all races.
- Hash/store symlink target text without following it. Preserve pre-existing dirty changes and modes, deletes, renames, binaries and untracked files. Explicitly reject or report unsupported submodules, path encodings, ignored/generated state and oversize evidence. Never stash/reset/stage/commit as evidence preparation.
- Bound bytes while streaming as well as before reading; quarantine incomplete artifacts and validate storage destinations/manifests before serving them.
- After R2 quiescence, capture source identity S0. Record each permitted verification command, run identity, exit/abort/timeout, coverage and source hash. Recheck source during the verification sequence and at its end. If a check/build/formatter or another writer changes relevant source, invalidate earlier results; rerun only under a finite policy or require a fresh checkpoint.
- Do not mix formatting/code generation and verification into an implicit loop. If preparation mutates source, make it explicit, recapture, then run the required checks against that identity.
- Publish immutable evidence only for a stable snapshot S. `observed_pass` must name S; reported claims remain `worker_reported`, missing coverage `incomplete/unavailable`.
- Revalidate approval identity and live source immediately before the decision **and before the next grant**, after any idle/probe wait. Changed source returns to stale/reconciliation state, never silently updates an existing approval.

**Exit:** symlink-ancestor sentinel never enters blobs/review; mutation between checks cannot certify new source; hash changes including comments/modes invalidate approval; dirty user changes survive; E05–E11 pass with bounded coverage gaps documented.

## 6. R4 — Retention, lifecycle holds, ownership and recovery

**Primary files:** `src/controller.js`, `src/main.js`, `src/worker.js`, `src/rpc.js`, `src/native.js`, persistence helpers.

### Work

- Implement GATE-C with explicit `unmaterialized / persisted / uncertain / missing` session observations. Keep the mock explicit about Pi's lazy default versus the now-qualified explicit-session bootstrap; do not infer persistence merely from a sessionFile string. Missing history after accepted/started work must never use the never-used exception. Verify actual session/model/effort/root on start and each safe continuation.
- Select/deduplicate canonical resources through supported mechanisms; do not forward every Main source blindly. Preserve required provider extensions, tools, skills and trusted instructions without loading unnecessary orchestrators/UI extensions. Reject conflicting effective Prewalk/continuation policy rather than changing it silently.
- Separate lifecycle holds from task status. `/pair stop` holds dispatch for the current root session, closes owned runtimes and preserves history. `/pair off` disables new work, quiesces/persists the task and closes the runtime. Neither the queue pump nor `pair_dispatch` clears those holds.
- `/pair on` validates consent/configuration; it does not silently resume interrupted work. `/pair start` may reconnect without inference. `/pair resume` explicitly reconciles first: restore a pending question/review as waiting, not an implementation grant. Reset is confirmed and archives history.
- Fence `/new`, fork, `/tree`, reload and session replacement. Same-session tree navigation advances an owner epoch and pauses authority; ordinary message leaves do not. Capture plain identity data before invalidation and use fresh contexts after rebinding.
- Use a durable delivery progression: `prepared → sent → accepted → started → settled`, with `uncertain` on ambiguous windows. Persist before sends, correlate bridge acknowledgements, reconcile prior operation/report/grant identity before any retry. Command acceptance is not completion.
- Recover an outbox report or a persisted decision exactly once by identity without replaying mutations. Retain pending records on failure; reject old-generation decisions. Do not archive an unconsumed required report merely to make room.
- Validate persisted state versions/shape; preserve corrupt files and partial journals for diagnosis, fail closed on disk errors, and release ownership locks safely. Never kill a PID simply because an old status file mentions it.
- Bound request/event/UI queues and diagnostic retention. Add fragmented/coalesced/CRLF/Unicode framing, backpressure, oversize records, out-of-order/late/negative responses and provider-error tests. Keep shutdown idempotent and platform-qualified, including abrupt parent death.

**Exit:** C01–C12, B02–B13 and H01–H03 pass at their required layers; stop is sticky; branch navigation fences old work; three native assignments retain PID/session during normal operation; explicit restart resumes persisted history without claiming PID continuity.

## 7. R5 — Complete bounded cooperation and active-time budgets

**Primary files:** `src/controller.js`, `src/schema.js`, `src/metrics.js`, `src/config.js`, Main tools and skill.

### Work

- Add a bounded durable task queue and one serialized review queue; questions get priority with starvation prevention. Accepting a queued task does not grant execution. Queue overflow returns explicit backpressure before side effects.
- Implement the three original policies using explicit plan boundaries. Bind every report/decision to task, step/group, attempt, plan revision, owner and checkpoint. A bounded revised-plan payload must create a new revision and invalidate incompatible pending approvals.
- Add `needs_user`, per-step revision counts, total report/activation bounds and one bounded report-only repair when safe. Repair must not reopen implementation authority. If a safe report-only surface cannot be provided, escalate instead of retrying effects.
- Persist notice state before enqueueing into Main, record supported delivery observation, deduplicate outbox/event replays and fence stale queued messages. Do not erase unrelated Main messages to remove a stale report.
- Track active execution elapsed time by state transitions/monotonic deltas. Exclude human answer/review/permission waits, paused/stopped intervals and queue wait; use separate finite transport, verification and native-recovery deadlines. Do not reset elapsed work or budgets after restart/revision. Unknown crash duration requires reconciliation, not optimistic zero.
- Preserve immutable task policy; stage worker/model/effort/policy changes for a safe boundary. Explicit budget changes are user-owned, never an automatic recovery step.
- Keep dispatch prompt and return asynchronous: no lock held while waiting for Main's decision or a human dialog; ordinary progress causes no Main inference.

**Exit:** D01–D15 pass. Repeated/late approvals never advance twice; long review waits do not exhaust active time; limits cannot be bypassed by a new report/lease/resume; Main stays responsive to unrelated conversation.

## 8. R6 — Native context, permissions, UI and accounting

**Primary files:** `src/main.js`, `src/worker.js`, `src/native.js`, `src/ui.js`, `src/metrics.js`, `skills/fabric-pair/SKILL.md`.

### Work

- Exercise real Fabric compaction/overflow in both participants and observe engine metadata. Restore a bounded packet only when changed or missing after compaction/recovery; do not rewrite dynamic status into the leading prompt or trigger an acknowledgement call. Queue decisions during compaction; failure preserves state/history.
- Verify Fovea focus/impact/sketch/dwell, correct root and useful parser coverage. Include hidden sync and attributed versus shell/editor drift. Registration is not a parser/auth/permission success claim.
- Relay select/confirm/input/editor using exact correlated identity and safe original option mapping. One visible dialog, bounded wait/cancellation, explicit denial without UI, no privilege granted by code approval. Shutdown/rebind must release pending requests and stale UI safely.
- Finish `/pair`, settings/status/on/off/pause/resume/stop/reset-worker and preserve useful existing start/doctor/inbox/inspect controls. Apply/Cancel must be side-effect-safe. Show current and pending worker selections; discover native effort levels for the selected model, including `max` only where supported.
- Preserve native `/model`/Main effort. Record the actual reviewer model on a decision, not merely a stale observation. Minimal/off remains cosmetic; use public width/keybinding/theme APIs, ASCII fallback and sanitized terminal text. No worker cosmetic request may clobber Main's editor/title.
- Normalize usage once at the correct boundary: Pi disjoint counters remain disjoint; test provider-inclusive data without subtracting cache twice. Deduplicate cumulative/final/replayed usage using native identity. Do not charge report display as another inference. Separate observed worker cost, partial Main attribution and unavailable warming/tool spend.
- Keep status/doctor/menu rendering local and free of model calls. Never enable native paid warming as a consequence of Pair enablement.

**Exit:** F01–F15 and G01–G15 pass at applicable layers; real compaction and permission evidence is required, not just mock hooks. Missing telemetry stays unknown.

## 9. R7 — Release qualification and documentation

**Primary files:** tests/scripts, `README.md`, `docs/COMPATIBILITY.md`, `docs/TESTING.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, schema/example/skill, package metadata and test-result artifacts.

1. Run a real deterministic **Main and Worker** workflow: plan → question → answer → checkpoint → revise → checkpoint → approve → next step → final acceptance; then subsequent tasks with native IDs/PIDs checked. Test Main busy, compaction, permissions, cancellation, crash and resume, not just worker startup.
2. Exercise deliberate unsupported versions/resource/capability profiles and confirm actionable pre-effect rejection. Publish only the exact qualified profile(s).
3. Build an actual tarball, inspect it, install outside the development tree in a fresh profile, verify runtime imports/skills/resource deduplication, then disable/remove. A dry-run or import of the source tree is insufficient.
4. Run native TUI checks for resize/narrow widths/wide characters/ASCII/theme/keybindings and modal cancellation; verify print/RPC mode guards.
5. Provide opt-in redacted diagnostic export without credentials, raw prompts/source or uncontrolled terminal escapes. Keep detailed local evidence private; do not package native logs/state.
6. Reconcile every V1 ledger row with its required layer, artifact, build identity and actual result. Only a profile that is explicitly rejected at setup can be labelled unsupported; do not mark a core unmet guarantee as a skipped pass.
7. Update advertised scope, defaults, schemas, migrations, recovery instructions and test results. Remove unqualified multiworker/safety claims. Record paid tests as not run unless separately approved; no cost-saving claim without a baseline.

**Exit:** all applicable V1 rows pass for the advertised profile, original upstream files are untouched, histories are preserved, clean installation/removal works, and no known DEF item remains open.

## 10. Proposed verification commands and final handoff

Only `npm run typecheck` and `npm run pack:check` remain registered. Keep the exact development pins and lockfile. Use `npm ci --ignore-scripts` only when an installation is needed. Inspect changed JavaScript syntax with `node --check <file>` and documentation/whitespace with `git diff --check` as appropriate. These are static checks, not behavioral evidence.

Do not recreate `tests/`, fixtures, compiler-negative cases, smoke/native/probe runners, `test:*` commands, `check` as a disguised test suite, or generated test-result artifacts. Proposed CI must run only reproducible installation, the production compiler and package dry-run with scripts disabled. Do not launch workers, inject faults, make provider calls, or run user-configured verification as part of this checkpoint's checks.

After meaningful production edits, record the full compiler result and both source/dependency diagnostic counts; do not relax strictness, exclude production modules or use broad casts/suppressions. Inspect package contents when packaging changes. A successful compiler or tarball listing cannot certify migration, crash consistency, native behavior or install/remove safety.

Final implementation report: files changed, implementation status, source walkthroughs, static command outcomes, unresolved runtime risks and remaining blocked acceptance gates. No commit, push, publish or upstream modification without authorization. Creating this plan does not complete an implementation batch.

## 11. Executable implementation batches

> **Historical backlog:** this section predates the no-tests directive. Preserve its product requirements, but execute §13 instead of its old fixture, runner or native-test instructions. Files described here may have been deleted.

**Baseline:** HEAD `ca09923` plus the existing uncommitted R1/migration implementation began with 73 offline tests and five narrow native scenarios. IMP-01/02 have now started; the progress record below distinguishes implemented evidence from open acceptance. The IMP items subdivide the agreed S1–S4/R0–R7 scope without adding a worker, backend, transport or paid-test requirement. Paths below are package-relative. Unchecked items remain incomplete even when some listed files or tests now exist.

### 11.1 Preparation and decisions

Before the first edit, record the working-tree diff and tracked/untracked source hashes. Preserve the existing patch, including `tests/config.test.js`; do not reset it or bundle unrelated changes. Work in small invariant-focused batches and follow the user's commit/push authorization. Do not promise a release date while public effect seams are unresolved.

Record these decisions alongside the implementing batch:

| Decision | Required before / treatment |
|---|---|
| DEV — tooling profile | IMP-01: select exact TypeScript and Node-24 typings versions compatible with the tested public Pi types. Use the recorded Pi 0.87.1 profile initially; keep required peer `*` declarations separate from exact dev/test pins. Do not invent new pins or patch installed packages to make checking pass. |
| VERSION — stored and wire compatibility | IMP-02: distinguish configuration, persisted-state and wire versions. Specify migrations for known legacy state and saved V2 policy. Reject unknown versions, corrupt present counters and overflow; do not silently reset them. If old task consumption cannot be reconstructed, retain history and require reconciliation rather than assume zero usage. |
| HOLD — authority semantics | IMP-03: separate task/runtime/grant state and durable hold reasons. `on` clears only the disabled hold; deliberate `start` may clear stop, but neither resumes a pending task. Pending review/question survives resume. Uncertain effects, stale ownership and exhausted budgets need their own reconciliation/authorization, not a generic resume bypass. |
| DELIVERY — observations | IMP-03/07: distinguish worker command prepared/sent/accepted/started/settled from Main notice queued/notified/observed/resolved, with uncertainty states. A void callback or RPC acceptance is not proof of model consumption or effect completion; use only supported observations. |
| BOUNDS — occupancy and policy | IMP-03/09/10: define queued versus active occupancy, reservation of required review capacity, duplicate identity, zero behavior, and report payload versus transport envelope bytes. Keep active-step time, existing wall-clock limits and RPC/verification deadlines distinct. Reject impossible activation combinations before effects; never silently raise a smaller configured bound. Record any change to legacy timeout/revision semantics explicitly. |

### 11.2 Dependency map

```text
IMP-01 tooling scaffold -> IMP-02 validated boundaries -> IMP-03 transition model
                  annotations/contracts co-developed -> IMP-04 strict foundation gate

R0 GATE-A/GATE-B feasibility ----------------------------------+ (parallel)
                                                               v
IMP-04 -> IMP-05 holds/policy -> IMP-06 admission/quiescence -> IMP-07 recovery/transport
IMP-02 -> IMP-08 isolated evidence work -------------------------+ (parallel where safe)

IMP-05 + IMP-06 + IMP-07 + IMP-08 validated together = S3 SAFETY GATE
  -> IMP-09 reports/budgets -> IMP-10 queues/review policies -> IMP-11 bounded automation
  -> IMP-12 native context/UI/accounting -> IMP-13 release qualification
```

IMP-08 may begin while a public-seam probe is blocked, but continuation tests must be integrated with the final grant path. Shared `src/controller.js`/`src/worker.js` changes are integrated sequentially, not as conflicting parallel edits. S1 scaffolding alone is not a strict-green foundation.

**Parallel R0 track:** extend `scripts/native-regressions.js` and isolated fixtures to witness Main/Worker native, captured and generic-provider paths, profile widening, sibling calls, detachment and cancellation. Record the supported pre-effect admission and completion-tracking mechanism, or a concrete rejected profile and minimal upstream request. No production credentials, paid calls or installed/reference-source modifications. GATE-A/B must have a supported implementation path before IMP-06 is accepted; an upstream request needs separate approval.

### 11.3 First implementation target — S1/S2 foundation

#### Foundation progress — 2026-09-23

- **IMP-01 in progress, source gate still failing:** exact `typescript@5.9.3`, `@types/node@24.13.6`, Pi public types `0.87.1` and development-only `@modelcontextprotocol/sdk@1.30.0` are pinned. Node16 plus `resolveJsonModule` matches Pi's compiler profile. Clean install/audit and `test:types` pass with public `ExtensionAPI` positive and intended TS2769/TS2339 negative fixtures. Dependency diagnostics fell from 42 to zero; the full command still reports **620 Pair-source errors**. CI, source annotations and packed-runtime loading remain open.
- **IMP-02 in progress, corrective slice partially passing:** B1 producer/validator bounds and full-artifact retention pass. B2 immediately revokes a failed publication, preserves the original error and stops the owned Worker when revocation cannot be confirmed; B6 crash/durable-grant coverage is still required. B4 now validates stored decisions and report task/worker/step/current-attempt relationships, preserves historical resolved reports, rejects partial current limits and mixed identity absence, and no longer applies legacy tolerance to every stored task. Legacy pending reviews, canonical state version 2, concrete parser return types, usage/delivery/queue records and full migration/fault matrices remain open.
- **IMP-03/04 remain open.** No pure transition module, complete source annotation, CI or actual packed-runtime smoke gate exists. Existing deferred limits are transported and validated, not newly enforced. No queue, automatic repair/recovery or profile-widening claim is made.


- [ ] **IMP-01 — Pin tooling and establish the check surface.**
  - Files: `package.json`, proposed `package-lock.json`, `tsconfig.json`, type-test fixtures and CI configuration; update testing docs when dependency installation becomes required.
  - Add exact dev pins, ESM/Node-compatible `allowJs`, `checkJs`, `strict`, `noEmit`, public Pi imports used for types, and `npm run typecheck`. Start boundary annotations in extension registration, config, JSON helpers and RPC callbacks. Include all production modules; report remaining diagnostics rather than hiding them.
  - Check: clean isolated `npm ci` resolves the lockfile and the real compiler; basic valid/invalid Pi API fixtures prove checking is active. Existing extension registration remains synchronous and does not start a worker or inference. Full strict completion is IMP-04, after the concrete contracts land.

- [ ] **IMP-02 — Add runtime-validated durable and wire contracts.**
  - Files: proposed `src/contracts.js`, existing `src/schema.js`, `src/util.js`, `src/config.js`, `src/controller.js`, `src/worker.js`, `src/rpc.js`; proposed `tests/contracts.test.js` and legacy/corrupt fixtures.
  - Define typed state, task policy/limits, identity tuple, authority/latch/report, delivery, queue-entry and counter records. Treat decoded JSON as unknown until validated; wire parsers into actual load/ingress paths. Add guarded counter increments and explicit known-version migration before authority can be opened. Carry assignment policy **and limits** into Worker authority, checked by both sides.
  - Check: valid state/authority round trips; unknown/malformed versions, unsafe IDs, negative/fractional/overflowing counters and mismatched identities fail closed. Known legacy history/pending obligations survive migration. Add config-import write-failure/rollback, stale-source/target/scope and preserved-history tests without changing successful import semantics. Disk failure must not leave a newly opened grant or a stuck ownership lock; retain diagnostic input.

- [ ] **IMP-03 — Specify and test the pure transition model.**
  - Files: a minimal proposed `src/transitions.js` or equivalent helper, `src/contracts.js`, proposed `tests/transitions.test.js`.
  - Centralize legal transitions and invariants for grant closure, holds, waiting obligations, policy/counter continuity and separate worker/Main delivery records. Reuse existing IDs; bind canonical workspace, owner session/epoch, worker/native-session generation, task/plan/step-or-group, attempt and lease. No generic workflow engine or new executor.
  - Check: a table-driven event/state matrix rejects invalid combinations, reopening a closed lease, stale ownership, dropping a required review, erasing counters and turning uncertainty into success. Concurrent-event orderings have deterministic safe outcomes. Runtime consumers still use the existing controller; these tests alone do not certify native enforcement.

- [ ] **IMP-04 — Close the strict foundation gate.**
  - Files: remaining `src/*.js` annotations, public extension/tool/context/event types, relevant scripts/fixtures/test boundaries, proposed compiler regression tests, CI and packed-runtime smoke runner.
  - Complete `npm run typecheck` with every production module included; no broad `any`, `@ts-nocheck` or ignored production diagnostics. Keep any non-production typing exclusions explicit and temporary. Positive fixtures must compile; negative API/event/state fixtures must fail for the intended errors. CI runs reproducible install, typecheck and current offline checks without paid credentials.
  - Check: fresh `npm ci` + typecheck + `npm run check`; exact public registrations/schema/example names remain aligned. Create an actual tarball in disposable storage and load its extension/skill from outside the source tree without development dependencies or hoisted modules. Preserve Pi peer requirements and do not bundle Pi/Fabric/Fovea. This import smoke test is not IMP-13's install/disable/remove qualification.

**Foundation checkpoint:** IMP-01–04 are the next bounded implementation target. Deliver executable validators, independent transition tests, reproducible strict checking and a recorded migration/version decision. Do not add queues, automatic report repair/recovery, live lifecycle guarantees or multiworker activation here. Runtime validation may reject corrupt state; do not disguise a behavior change as a type annotation.

### 11.4 Safety, cooperation and release batches

| Batch | Depends on | Implementation and primary files | Acceptance gate |
|---|---|---|---|
| **IMP-05 — Durable lifecycle and policy continuity** | IMP-04 | Integrate hold transitions in `src/controller.js`, `src/main.js`, `src/worker.js`; register/wire `on`/`off`, explicit start/stop/pause/resume and settings disable through the same controller transitions. Preserve pending reports, task policy and accumulated counters; any budget/policy amendment is separately authorized and recorded. | Stop before startup and after completion remains sticky against model dispatch/autostart; disable closes admission; pause/resume of question/review restores waiting without a new attempt. Holds and policy survive restart, no timing reset, no hidden model request. Use `tests/controller.test.js`, `tests/main.test.js` and fault fixtures. This is not yet full quiescence certification. |
| **IMP-06 — Complete admission and quiescence** | IMP-05 and R0 GATE-A/B mechanism | `src/native.js`, `src/worker.js`, `src/controller.js`, `src/main.js`: close admission atomically, track admitted calls/jobs by grant/generation, reconcile before checkpoint capture, and enforce Main/Worker/workspace-wide Pair writer exclusion. Restrict configured verification separately from arbitrary Main effects. | Native/captured/provider/Fovea/sibling/background/profile-widening/competing-owner tests. No effect admitted after closure; admitted work either settles or leaves explicit uncertainty/needs-user. Reject unsupported surfaces before effects; an idle flag, outer abort or `currentTool` is not the barrier. |
| **IMP-07 — Branch, delivery, transport and retention recovery** | IMP-06 | `src/main.js`, `src/controller.js`, `src/worker.js`, `src/rpc.js`, `src/native.js`: public branch/shutdown fencing; explicit adoption of retained reports; durable worker-delivery and Main-notice journals; resource deduplication; bounded RPC/event/UI buffering and conservative session observations. | Native tree/fork/new/reload, cancellation/no-op navigation and stale decision/UI tests; crash injection before/after persist/send/accept/start/settle; framing/oversize/backpressure/late/negative replies, parent death and disk errors. Preserve pending reports/history, never replay uncertain mutations or kill an unrelated saved PID. Three normal assignments retain native IDs/PID; explicit restart retains history, not PID. |
| **IMP-08 — Complete evidence and continuation safety** | IMP-02 for isolated work; IMP-06/07 for final integration | `src/evidence.js`, `src/util.js`, `src/controller.js`: per-command run/source identity; pre/post-command and final checks; approval revalidation after readiness/idle waits immediately before the next grant; path/storage integrity and explicit omission handling. | Mutation then restoration between verification commands invalidates evidence; source changes during readiness cannot receive the approved lease. Path-swap/symlink sentinel, dirty changes, mode/comment/rename/binary, manifest/blob tampering and bounded omission tests. No OS-sandbox or arbitrary-filesystem-race immunity claim. |
| **IMP-09 — Enforce reports and active budgets** | S3 safety gate: IMP-05–08 | `src/worker.js`, `src/controller.js`, `src/schema.js`, `src/metrics.js`: enforce `maxReportBytes` at both payload ingress points and `maxReportsPerTask` by unique identity; separate transport-envelope bounds. Persist active monotonic elapsed time and per-step/group revision counts. Preserve cost/token/turn observations and implement usage dedup needed for correct budget enforcement. | Exact/over-bound UTF-8 tests including multibyte characters; duplicates do not spend another report. Fake-clock queue/review/question/permission/paused waits spend no active time; revisions/resume/restart do not reset work. Unknown crash duration/cost stays unknown or requires reconciliation, not zero. Define the relation to old summary, wall-clock and task-wide revision caps explicitly. |
| **IMP-10 — Durable queues and complete review policies** | IMP-09 | `src/controller.js`, `src/schema.js`, `src/main.js`, `src/ui.js`, bundled skill/schema docs: enforce `maxQueuedTasks` and `maxQueuedReviews`; one task pump and serialized review delivery, reserved review capacity, explicit backpressure, question priority without starvation. Complete explicit plan boundaries/revisions, `final-only`/`milestones`/`every-step`, needs-user flow and user-only final-review opt-out after safety checks. | Queue acceptance grants no work and remains inert under holds; overflow/zero never drops an obligation. Crash/replay/order/duplicate decisions advance once. Plan revisions invalidate incompatible approvals. Opt-out completion is labelled not Main-reviewed, stays human-owned, and cannot bypass quiescence/evidence/verification. |
| **IMP-11 — Bounded report-only repair and recovery** | IMP-10 plus a proven restricted repair surface | `src/controller.js`, `src/worker.js`, `src/schema.js`, `src/rpc.js`: consume `maxAutomaticReportRepairs` and `maxAutomaticRecoveryAttempts`; persist counters before attempting work and preserve them across restarts. Keep report repair distinct from implementation authority; recovery is reconciliation, not blind resubmission. | Zero disables the automatic action; exact/exhausted limits escalate visibly without completion claims or automatic budget increases. Duplicate failures cannot reset counters. A repair cannot edit source, delegate or open a normal implementation lease. If no safe public repair surface exists, leave automation unavailable and require human reconciliation; do not waive any resulting V1 gap. |
| **IMP-12 — Native context, permissions, UI and accounting** | IMP-11; test fixtures may be built earlier | Finish R6 in `src/main.js`, `src/worker.js`, `src/native.js`, `src/ui.js`, `src/metrics.js`, skill/docs and native/TUI fixtures. Real compaction/overflow/restoration, Fovea roots/parser/provenance, all four permission dialogs, pending settings/model-specific effort, reviewer/usage observations and accessible minimal/off UI. | Applicable F/G rows at their required layers: cancellation/rebind never answers stale UI, compaction loses no decision, usage is deduplicated, unknown prices remain unknown, no hidden inference/paid warming. Test narrow/wide-character/ASCII/theme/input behavior and native migration/trust/settings paths. |
| **IMP-13 — Reproducible V1 release qualification** | IMP-12 and all applicable earlier gates | Extend native Main **and** Worker workflow and package runners; synchronize public docs/config/schema/skill and supported-profile declarations; retain sanitized artifacts tied to exact source/build identities. | Full question/answer/revise/approve/final/subsequent-task workflow; actual clean tarball install/disable/remove outside the source tree; required TUI/resource/recovery matrix and all 101 applicable V1 rows reconciled. No upstream patches or credentials/logs in the package. Extra OS profiles, paid benchmarks and VNext remain separate. |

### 11.5 Per-batch completion and stop rules

1. Add the smallest regression/negative fixture for the invariant, witness the baseline gap where applicable, implement the real load/command/ingress path, and verify both success and refusal behavior. Do not count synthetic hook calls as native qualification.
2. For state or wire changes, round-trip both current and known-legacy records and inject failures at persist/read/rename/send boundaries. Preserve the original data/history on a failed migration; corruption is not a fresh session.
3. Mechanically confirm every added export, command registration, configuration field and example/documented option. For new `on`/`off` or queue status behavior, verify the user-facing path as well as controller methods.
4. Run targeted tests first, then typecheck and the coherent package checkpoint. Use the native tests affected by changed execution boundaries; full expanded native/TUI/install matrices close release, not every documentation edit.
5. Review the coherent patch, resolve witnessed correctness findings, update the acceptance ledger with exact commands/layers/artifacts and distinguish planned, passed, failed, blocked and rejected-profile outcomes. Commit/push only under the user's policy; keep unrelated work out.
6. Stop effectful rollout if admission, persistence, ownership, source identity or outcome cannot be established. Keep Main usable with an actionable held/unsupported state. Do not compensate with a prompt, guessed acknowledgement, automatic permission, new blank worker session or mutation retry.

**Current implementation stop point:** B1 is complete at its layer; B2 immediate containment and B3 dependency/public-type qualification are implemented but do not close B6/B8; B4 is partial. IMP-01/02 remain incomplete, and IMP-03/later batches have not started. Current evidence is 86/5 plus compiler fixtures; the 620-source-error command remains a failing gate.

## 12. Corrective foundation and remaining implementation plan

> **Historical checkpoint:** progress and test evidence below predate test removal. §13 is the current execution plan; no test-writing instruction or old pass label in this section overrides it.

**Status:** implementation in progress. B1 is complete at its defined layer; B2 immediate containment and B3 dependency/public-type work are implemented; B4 is partial; B5–B8 remain open. These are execution sub-batches of IMP-01–04, not new product phases. The next acceptance target remains a corrected, strictly checked foundation—not queues, automatic recovery or release qualification. All paths below are package-relative; names are proposals unless present in source/package scripts.

### 12.1 Evidence baseline and acceptance ledger

The preceding review reran `npm run typecheck -- --pretty false` (exit 2) and 14 existing contract/config tests, then used temporary probes to reproduce the gaps. The implementation checkpoint converted the B1, immediate B2 and selected B4 witnesses into repository tests. Fresh `npm ci --ignore-scripts`, `npm run check` (86/86), `npm run test:types`, isolated strict `src/contracts.js`, `npm run pack:check`, zero-vulnerability audit and `npm run test:native` (5/5) pass. The full compiler still exits 2 with 620 Pair-source diagnostics and zero dependency diagnostics. No paid-provider suite was run. Temporary `/tmp` probes/logs remain investigation aids, not release artifacts.

| Witness | Review-baseline failure (see ledger for current status) | Owning batch / ledger check |
|---|---|---|
| `src/util.js:26`, `src/evidence.js:171`, `src/contracts.js:208` | A passing command's 7,000-character output becomes a 6,045-character bounded summary, which the 6,000-character checkpoint validator rejects. | B1 / FND-01 |
| `src/controller.js:255–275` | Injected state-persist failure after authority publication leaves authority `running`, stored task `paused`, and Worker connected. | B2 then B6 / FND-02 |
| `src/contracts.js:142–180` | Legacy state with a pending review fails on missing nested report owner epoch. Removing a current owner epoch causes replacement with zero; missing current `maxReportBytes` is accepted. | B4 / FND-03 |
| `src/contracts.js:52,114–142` | Malformed decision records and a finalized report targeting a different task pass stored-state validation. | B4 / FND-04 |
| `tsconfig.json`, public Pi type import | 620 Pair source errors plus 41 dependency TS1543 JSON-import-attribute errors and one dependency TS2307 missing MCP SDK declaration. | B3/B7 / FND-05 |

The remaining planned checks are FND-06 (pure transitions), FND-07 (durability/import fault matrix) and FND-08 (strict/CI/packed-runtime gate). See [the supplemental foundation ledger](ACCEPTANCE-LEDGER.md#corrective-foundation-acceptance). These supplement, not replace, the original 101 V1 requirements.

### 12.2 Execution order and boundaries

```text
B1 reproduce gaps + output fix -> B2 immediate failed-publication containment
B3 qualify compiler/dependency profile --------------------------+ (parallel)
B4 typed/versioned records <-> B5 pure transition specification  |
                     -> B6 durable publication and rollback     |
B7 bottom-up annotations (alongside B4–B6; integrate serially) ---+
                     -> B8 STRICT FOUNDATION GATE (IMP-01–04)
                     -> IMP-05–08 S3 SAFETY GATE
                     -> IMP-09 reports/budgets -> IMP-10 queues -> IMP-11 automation
                     -> IMP-12 native/UI/accounting -> IMP-13 release
```

Run R0 public effect-admission/quiescence probes in parallel; an unsupported public effect surface blocks IMP-06, not isolated contract/compiler work. Independent R3 evidence work may proceed where it does not compete for controller/worker edits. Integrate shared-file changes sequentially. B2 is an immediate containment correction, not a substitute for B6 crash consistency or IMP-06 admitted-effect settlement. Do not roll out autonomous work while failure containment is unresolved.

### 12.3 B1 — Reproduce the gaps and fix verification-output bounds

**Maps to:** IMP-02; FND-01. **Files:** `src/util.js`, `src/evidence.js`, `src/contracts.js`, `tests/contracts.test.js`, `tests/advanced.test.js`; focused evidence test file if useful.

1. Convert the review witnesses into named regression cases with valid-current-state controls. Preserve the failing baseline as evidence; do not mark expected failures as feature passes or silently skip them.
2. Define the verification-summary bound once and include the truncation marker within that bound. Preserve complete local command artifacts. Keep this character/display limit distinct from future UTF-8 `maxReportBytes` enforcement.
3. Align producer and validator contracts without loosening them arbitrarily. Audit other `bounded()` consumers for marker/short-limit assumptions.

**Accept:** exact/over-bound and multibyte output, small bounds, and a verbose passing configured command survive checkpoint persistence and controller restart. Failing commands still block approval. FND-01 passes; unrelated reproduced failures remain explicitly open until their owning batches.

### 12.4 B2 — Contain failed authority publication immediately

**Maps to:** IMP-02, prerequisite to IMP-05/06; FND-02 partial. **Files:** `src/controller.js`, existing RPC ownership/shutdown path, `tests/controller.test.js`, `tests/advanced.test.js`.

1. Cover the whole activation write/persist/send boundary, not only the final RPC calls. On any failed or uncertain grant publication, stop further dispatch and record the original failure without treating it as successful activation.
2. Revoke authorization on failure. If revocation cannot be written or confirmed, stop the currently owned Worker handle through the supported shutdown path; never act on an unverified PID from disk. Keep a live hold and visible needs-reconciliation outcome even when storage is unavailable.
3. Do not retry the model prompt or assume that abort means all effects have settled. Preserve ambiguous outcomes for B6/IMP-07 reconciliation.

**Accept:** inject failure at state save, authority save, and revocation save. No new work prompt is sent after an uncommitted activation; the old `running` authority is not usable by a connected Worker. If process/effect termination cannot be established, the operation stays uncertain and no checkpoint is accepted. Also test negative/late RPC acknowledgements and error propagation. Restart/crash consistency is still B6, so B2 alone cannot close FND-02.

### 12.5 B3 — Qualify the strict development profile

**Maps to:** IMP-01/04; FND-05 dependency side. **Files:** `package.json`, `package-lock.json`, `tsconfig.json`, proposed `tests/types/` fixtures and compiler runner.

1. Retain exact current pins as the reproducible baseline. Compile a minimal positive fixture importing the **public** Pi `ExtensionAPI`/context types, separate from Pair's annotation errors.
2. Resolve the 41 JSON-import-attribute declaration errors and missing MCP SDK declaration using a verified compatible published dependency/toolchain profile and justified exact development dependencies. Do not invent a version, patch installed/reference packages, or import private modules to evade declarations.
3. Keep Node/ESM resolution appropriate for the actual runtime. Do not count `skipLibCheck`, blanket ambient shims, broad `any` or production exclusions as meeting the existing strict gate. If a third-party declaration exception is unavoidable, obtain an explicit acceptance change and record the unresolved limitation rather than silently changing the gate.
4. Preserve Pi peer `*` requirements separately from exact dev pins, and keep Pi/Fabric/Fovea out of bundled runtime dependencies.

**Accept:** fresh isolated `npm ci --ignore-scripts` plus the minimal public-type positive fixture succeeds. Invalid public API/event fixtures fail for their intended diagnostics, not unresolved imports. Record compiler/package versions and all diagnostic origins. Dependency blockers may not be omitted from the total.

### 12.6 B4 — Complete typed records and versioned migration

**Maps to:** IMP-02; FND-03/04. **Files:** `src/contracts.js`, `src/config.js`, `src/schema.js`, `src/util.js`, controller/worker/RPC ingress, `tests/contracts.test.js`, `tests/advanced.test.js`, proposed `tests/fixtures/state/`.

1. Define concrete JSDoc types/discriminated unions for current stored state, worker/task records, policy/limits, producer identity, reports/checkpoints, decisions, usage, grants/holds, worker delivery, Main notices, queue entries/reservations and cumulative counters. Parsers accept `unknown` and return the validated concrete type—not a generic `Record<string, unknown>` or an unchecked cast.
2. Validate every nested consumed field and relationship. Current pending/unresolved records must bind to their worker/task/plan/step/attempt and operation identities. A legitimately retained resolved report from an earlier attempt keeps its historical producer identity; do not require all historical records to equal the current owner/attempt. Distinguish history from records allowed to authorize work.
3. Validate finite/nonnegative usage and counters; unknown observations remain explicit. Reject invalid decision actions/delivery states, dangling current references, conflicting duplicate IDs, cross-task reports and malformed present fields. Align runtime schemas and public tool/config schemas with parity tests.
4. Introduce a new canonical persisted-state version (planned `STATE_VERSION = 2`) rather than reusing V1 for incompatible required records. Keep configuration V2 independent. Finalize the B4/B5 layout before publishing it. Decide the Pair wire version separately; any incompatible required authority/handshake change gets an explicit version check on both sides, not silent compatibility. Pi's JSONL transport is unchanged.
5. Recognize documented V1 shapes explicitly: pre-identity, identity-bearing pre-deferred-policy, and current identity-bearing records. Mixed/ambiguous partial identities fail closed. Remove universal `legacy: true` for canonical current tasks. A missing current epoch, attempt or required limit is corruption, not a default.
6. Preserve legacy bytes, sessions, reports, notices and evidence. Migrate unresolved legacy work into a held/reconciliation-required representation with truthful unknown identity/accounting, not a newly invented authorization tuple. Support legacy pending question/review/blocker records as well as empty/running tasks. Never auto-resume or reset spent budgets during migration.

**Accept:** old/current round-trip fixtures for idle, running, awaiting-settle, paused, question, review, blocked, completed and cancelled states; rejected mixed/unknown versions; current missing/negative/fractional/exhausted identity tests; invalid decision/usage/cross-record tests; preserved legacy report/history bytes. Invalid state must not overwrite the input, open a grant or retain an ownership lock. Legacy acceptance means safe retention, not automatic adoption. Queue types may be tested now; no enqueue command or queue pump is enabled.

### 12.7 B5 — Specify the pure transition model

**Maps to:** IMP-03; FND-06. **Files:** proposed `src/transitions.js`, `tests/transitions.test.js`, `src/contracts.js`. Co-develop with B4; freeze both before B6 storage integration.

- Separate task state, runtime state, grant state and durable hold reasons. Define legal transitions for stop/off/on/start/pause/resume/cancel/reset, owner replacement, report/decision arrival, effect completion and storage/delivery failure. Pure decisions perform no RPC, I/O or model calls.
- `on` clears only disabled hold; explicit `start` may clear deliberate stop but opens no task lease. Ordinary dispatch/autostart cannot clear either. Review/question/blocker waits survive pause/resume. Pending reports are not discarded on restart. Policy and accumulated budgets change only through a separately authorized amendment.
- Bind grants to workspace and owner/worker/native-session/task/plan/step/attempt identities. A closed grant never reopens under the same lease; stale branch/owner/report decisions are inert. Uncertain effect or delivery outcomes cannot transition to success by a timeout or generic resume.
- Distinguish Worker command prepared/sent/accepted/started/settled/uncertain from Main notice queued/notified/observed/resolved/uncertain. An RPC acknowledgement is not settled work; a void notification callback is not Main observation. Preserve unavailable observations as uncertainty.
- Specify queue occupancy, review reservations, report identity and automatic-attempt counters for later consumers. Zero means no waiting backlog/automatic attempt as appropriate, never loss of a required review. Queued acceptance grants no execution.

**Accept:** a table-driven event/state matrix plus reordered/racing event sequences rejects reopening closed leases, stale identities, lost review obligations, policy/counter resets and uncertainty-to-success shortcuts. Pure transition tests are not native enforcement qualification; full lifecycle integration is IMP-05–07.

### 12.8 B6 — Make persistence, publication and import failures safe

**Maps to:** IMP-02 with the B5 grant/delivery records; FND-02/07. **Files:** `src/controller.js`, `src/worker.js`, `src/util.js`, `src/config.js`, `src/rpc.js`, proposed `tests/persistence.test.js`, existing controller/config tests and disposable child fault fixtures.

1. Add a small injectable Pair-storage boundary or equivalent bounded fault seam; do not build another workflow engine. Make write, sync, rename, read and crash windows testable without changing real user files or relying on filesystem permissions being enforced for the test user.
2. Define a durable grant operation/revision protocol: persist validated preparation/commit evidence before publishing usable authority, bind authority to that durable identity, then record actual send/accept/start/settle observations. The Worker must not use an uncommitted or stale authority record. Two atomic renames are not a multi-file transaction; reordering them alone does not solve crashes.
3. Reconcile before reopening admission on startup. A crash after grant publication, prompt send, acceptance or settlement cannot trigger blind mutation resubmission. If state cannot establish completion, retain a hold and the original failure/evidence. Close/stop the owned Worker on unrecoverable publication failure as in B2; failure to prove quiescence blocks review.
4. Journal/reconcile latch, inbox, archive and pending report obligations. A latch written before inbox failure must not cause a retry to claim delivery that never occurred. Archiving an accepted report or restarting while awaiting settlement must not erase its required review. Main notices and decisions retain stable IDs across retries.
5. For config migration and retained-backup import, validate scope and source/target freshness, preserve the backup, and make write/rename/rollback failures explicit. A failed rollback retains recoverable bytes and reports their paths; do not swallow it or overwrite a concurrently changed file. Source files, unrelated settings and consent remain unchanged on rejected imports.
6. Specify file/directory sync guarantees for the supported platform and clean private temporary files. Do not claim power-loss atomicity or filesystem-race immunity beyond what is implemented and tested.

**Accept fault matrix:** before/after temp write, file sync, target rename, authority publication, Worker send/acknowledgement, latch publication, inbox publication, archive move, notice callback, backup move, destination replacement and rollback. Cover `ENOSPC`/`EACCES`/rename errors and disposable-process crashes. On restart: no uncommitted usable grant, no erased history or pending review, released/reacquirable ownership lock, explicit uncertainty, and no automatic replay of uncertain mutations. FND-02 closes only after both live-failure and restart cases pass. Broader native branch/effect tracking remains IMP-06/07.

### 12.9 B7 — Close production annotations bottom-up

**Maps to:** IMP-01/04; FND-05 Pair side. **Files/order:**

1. B4 concrete contracts and `src/util.js`: typed assertions, unknown JSON ingress, errno narrowing, generic async `Serial` and filesystem helpers.
2. `src/config.js`, `src/schema.js`, `src/metrics.js`: normalized config/layers/migration previews, exact schemas, nullable observations and budgets.
3. `src/rpc.js`, `src/native.js`, `src/evidence.js`: request/response/event/UI unions, pending operations, cancellation/ownership and evidence records.
4. `src/controller.js`: explicit initialized/uninitialized states, Worker handle and callbacks, typed journals/transitions and safe state narrowing.
5. `src/worker.js`, `src/main.js`, `src/ui.js`, `src/extension.js`: public Pi extension/context/tool/event types and model-specific nullable UI state.

The 620 source diagnostics are a baseline, not 620 independent defects: controller 134, Main 130, Worker 92, config 69, evidence 48, util/UI 33 each, native 29, RPC 23, metrics 17 and schema 12. Fix root contracts before callback annotations. Re-run the smallest affected tests and inspect new diagnostics after each batch. Do not introduce unchecked casts to make generic parser outputs appear typed. Annotate relevant test/harness boundaries too; any deferred non-production coverage is explicit, never a production exclusion.

**Accept:** every production module passes the full project typecheck with concrete boundary types; positive state/API/event fixtures compile and negative fixtures fail with expected diagnostic codes. No module-level suppressions, relaxed strictness or silently omitted dependency errors.

### 12.10 B8 — Close the foundation checkpoint

**Maps to:** IMP-04; FND-08. **Files:** package scripts, proposed compiler/package runners and CI configuration, tests, testing docs and evidence metadata.

1. Add `test:types` and `test:package` only with real runners. Compiler-negative fixtures are checked in a separate test project and must fail for the intended reason; normal production `typecheck` must succeed.
2. CI runs reproducible dependency installation, full strict checking, compiler fixtures, `npm run check` and packed-runtime smoke tests without paid credentials. `check` already includes the offline suite; do not duplicate it with an immediate unchanged `npm test` run.
3. Build an actual tarball in disposable storage. Extract/load its extension factory and bundled skill outside the development tree without development dependencies, hoisted packages or `NODE_PATH`; verify imports/resources and no factory-time worker startup. Do not bundle upstream packages. This is not IMP-13's native install/disable/remove test.
4. Re-run affected deterministic native scenarios for authority/report boundaries; extend the fixture matrix where a new invariant needs native evidence. The existing five scenarios remain narrow and do not certify Main branch recovery or full effect quiescence.
5. Reconcile FND-01–08 with source hashes, commands, outcomes and sanitized durable artifacts. Preserve original acceptance rows and working-tree changes; commit/push only when authorized.

**Foundation gate (all required):** reproduced correctness failures fixed; typed current/legacy contracts and transition matrix pass; failure/rollback matrix passes; clean install plus full `typecheck`, `test:types`, `check` and actual `test:package` pass. No open compiler-origin errors or disguised skipped invariants. This closes IMP-01–04 only, not S3 safety or V1 release.

### 12.11 After foundation: safety first, then limit consumers

Complete the unchanged IMP-05–08 scope from §11.4: durable lifecycle holds/policy continuity, proven pre-effect admission and admitted-effect quiescence, branch/ownership/delivery recovery, per-command evidence and post-readiness approval revalidation. GATE-A/B public-seam feasibility is mandatory; keep unsupported profiles rejected before effects. No queue draining or automatic action is enabled before this integrated **S3 safety gate** passes.

| Consumer / batch | Implementation rule | Minimum acceptance |
|---|---|---|
| `maxReportBytes`, `maxReportsPerTask` / IMP-09 | Check `Buffer.byteLength(JSON.stringify(payload), 'utf8')` on Worker and Controller ingress; separately cap transport envelopes. Persist unique admitted logical report identities; identical retransmissions do not spend another report, conflicting duplicates fail. | Exact/over-bound ASCII and multibyte payloads, duplicate/replay/crash cases, terminal escalation instead of dropping a required report. Define how invalid-report repair relates to counting before implementation. |
| `activeStepTimeoutMs`, `maxRevisionsPerStep` / IMP-09 | Persist accumulated active monotonic time and per-step/group revisions. Exclude queue/review/question/permission/paused waits; do not reset on resume/restart. Keep wall-clock/task-wide limits and transport deadlines distinct. | Fake-clock waits, revisions, resume and crash/restart preserve spending. Unknown crash duration/cost remains unknown or held, not zero. |
| `maxQueuedTasks`, `maxQueuedReviews` / IMP-10 | One durable task pump and serialized Main review delivery. Define pending versus active occupancy and reserve required review capacity before execution. Zero disables backlog, not mandatory review; reject/backpressure impossible admission without silently raising a bound. | Zero/exact/overflow, duplicates, held startup, crash/order recovery, question priority without starvation; accepted queue entries grant no work and reviews are never lost. |
| `maxAutomaticReportRepairs`, `maxAutomaticRecoveryAttempts` / IMP-11 | Persist attempts before action; zero disables automation. Repair is confined to reporting and cannot obtain an implementation lease. Recovery reconciles known outcomes rather than resending uncertain mutations. | Exhaustion/replay/restart cannot reset counters or widen permissions; no source edit/delegation through repair. Without a proven restricted surface, remain unavailable with human reconciliation. |

Then implement IMP-12 native context/permissions/UI/accounting and IMP-13 complete Main-and-Worker, actual install/disable/remove and release qualification. The separately authorized final-review opt-out, supported review policies and remaining original acceptance rows stay in scope; parallel workers, new platforms and paid benchmarks remain separate.

**Historical next action superseded:** use §13 below. The 86-offline/5-native results above predate removal of the suites and are not current qualification.

## 13. Active implementation plan after test removal

### 13.1 Objective, version boundary and method

Deliver a source-reviewed, strictly checked foundation for the existing **single-worker product V1**. Keep package `0.1.0` during this work unless a release/version change is separately approved. Keep executable ESM JavaScript with JSDoc/checkJs; asking about TypeScript was not authorization for a language/build migration.

- Configuration stays V2. Persisted state is V1 today; target canonical state V2 only when its migration and every consuming path are ready.
- Pair wire is V1 today. If durable grant identity adds incompatible required authority/handshake fields, version that wire contract explicitly and update Controller and Worker together. Old wire records may be preserved as history, never silently treated as current authorization. Pi's JSONL transport is unchanged.
- VNext remains an unnumbered deferred feature bucket; no product V2 or V3 is scheduled by this work.
- No tests, fixtures, test/probe runners, fault simulators or test artifacts may be written or restored. Review source and use only §10's static commands. Original behavioral acceptance remains unverified.
- Preserve existing changes and deleted test files in the working tree; no resets, commits or pushes. Do not edit reference/installed upstream sources, user credentials or live session data.

Use NEXT-01–06 below as the current task list. These IDs subdivide the existing B4–B8 work, not new product phases. All paths are package-relative; new files are proposals until implemented. [Scope §10](SCOPE-OF-WORK.md#10-current-scope-after-test-removal) contains the inspected code witnesses; the [current ledger](ACCEPTANCE-LEDGER.md#current-no-tests-implementation-ledger) records status.

```text
NEXT-01 records + NEXT-02 transitions (co-design and freeze)
    -> NEXT-03 held migration / consumers
    -> NEXT-04 durable publication / retention / rollback
    -> NEXT-05 complete production typing
    -> NEXT-06 static integration checkpoint (not release certification)
```

Develop annotations with each batch, not only at NEXT-05. Integrate NEXT-03/04 sequentially as one coherent state-format rollout; do not ship a new version constant with old consumers or an unimplemented commit protocol. Public effect-seam source review may run independently, but no automated probes are reintroduced.

### 13.2 NEXT-01 — Concrete records and compatibility contract (B4)

**Joint execution runbook:** [NEXT-01 + NEXT-02 plan](NEXT-01-02-PLAN.md). Follow its J01–J06 slices for both batches. It defines the record inventory, compatibility fences, pure event/result model and static handoff; it does not activate state V2 or runtime grant enforcement.

**Immediate implementation plan:** [Stored-record contracts and legacy classification](STORED-RECORDS-PLAN.md). SR-01–06 specify nested/aggregate types, source-backed historical profiles, the context-free classifier, writer/validator corrections (`diagnosticFile` and non-approval checkpoint metadata), independently profiled old diagnostics, disjoint agent ownership and the no-tests static ledger. This narrower plan is ready; its implementation has not started.

**Files:** `src/contracts.js`, `src/schema.js`, `src/config.js`, `src/metrics.js`, architecture documentation. **Depends on:** current source inventory; co-design with NEXT-02.

1. Replace generic validated `JSONObject` outputs with concrete JSDoc record/discriminated-union returns. Cover current state, retained legacy state, worker/task, grant/holds, policy/limits, report/checkpoint/decision, observation/usage, delivery/notice/request, and cumulative counters. Define future queue records without a queue pump or new enqueue API.
2. Validate nested consumed fields, finite usage, safe counters and map-key/reference identity relationships at every decoded boundary. Distinguish current unresolved authorization from resolved historical producer identities. Preserve unknown accounting explicitly, not as zero.
3. Specify state-V2 fields, the held-legacy representation, grant operation identity and delivery state names together with NEXT-02. Enumerate the documented V1 shapes; unknown/mixed versions or malformed present fields fail closed.
4. Record configuration/state/wire compatibility and the handling of old authority/latch/inbox records. Do not bump only `STATE_VERSION` or invent an old attempt/owner identity to make validation pass.

**Implementation exit:** every consumed record has an explicit type/validator and a documented reader/writer/version route. Source review traces unknown JSON to validation before authorization; compiler diagnostics are recorded. No behavioral pass is claimed.

### 13.3 NEXT-02 — Pure transition rules (B5)

**Files:** `src/coordination.js`, `src/transitions.js`, `src/contracts.js`, architecture documentation. A bounded internal kernel now exists; [runbook §9](NEXT-01-02-PLAN.md#9-current-implementation-checkpoint) lists implemented and unsupported families. **Depends on:** NEXT-01 draft types; freeze both before NEXT-03/04.

1. Separate task status, worker runtime, grant lifecycle and durable hold reasons. Pure helpers return a decision/new state without RPC, filesystem or model calls.
2. Define stop/off/on/start/pause/resume/cancel/reset, ownership replacement, report/decision arrival, storage failure and uncertain-delivery transitions. A closed lease never reopens. `on` clears only disabled hold; `start` may clear deliberate stop but grants no task execution.
3. Preserve waiting questions/reviews/blockers, assignment policy and cumulative spending. Unknown effects, exhausted budgets and stale ownership cannot be bypassed by generic resume; amendments require separate explicit user authorization.
4. Keep Worker prepared/sent/accepted/started/settled/uncertain distinct from Main notice queued/notified/observed/resolved/uncertain. A callback return or RPC acknowledgement cannot establish model observation or completed effects.
5. Document the transition table and each consuming controller/worker entry point. Wire the helpers into production guards in NEXT-03/04; do not count an unused helper as a completed state machine.

**Implementation exit:** source-reviewed transition table, exhaustive typed event handling and explicit denied/held outcomes. Concurrency, process settlement and native enforcement remain unqualified.

### 13.4 NEXT-03 — Held legacy migration and complete consumers (B4)

**Files:** `src/contracts.js`, `src/controller.js`, `src/util.js`; `src/main.js`/`src/ui.js` for truthful retained-state display; `src/worker.js` where wire reading changes. **Depends on:** frozen NEXT-01/02 layout; integrate with NEXT-04 before activating the complete format.

1. Read the original stored bytes as untrusted data. Classify only documented V1 layouts, preserve original state/session/report/evidence bytes in recoverable storage, then validate the entire candidate before replacement. Unknown/corrupt input must not be overwritten or leave an ownership lock held.
2. Convert unresolved legacy work to a held/reconciliation-required union. Keep missing identity/usage unknown; do not create fabricated attempt IDs, silently reset spent budgets or auto-resume. Completed history remains read-only history, not a fresh authorization source.
3. Stop clearing pending reports on startup/interruption/stop solely to make a task fit a status. Retain report obligations and reconnect them to notices/history after supported reconciliation. Legacy waiting review/question/blocker state must remain inspectable.
4. Update init/persist/authority generation/status/inspect/decision paths together. Old reports cannot authorize new work. While held, dispatch/resume/approval must reject clearly; provide truthful display and explicit cancellation/disposition without deleting history. Automatic adoption or a new unrestricted recovery command is out of scope.
5. Publish state V2 only when every producer/consumer can handle the chosen union. Keep configuration V2 independent and refuse incompatible worker-wire versions before work.

**Implementation exit:** a source walkthrough covers empty, active, waiting, paused, terminal and legacy-held records through load → migrate → validate → persist → display/admission. A migration backup alone is not proof of crash safety; NEXT-04 must complete publication/rollback handling.

### 13.5 NEXT-04 — Durable grant, report and import paths (B2/B6)

**Files:** `src/controller.js`, `src/worker.js`, `src/util.js`, `src/config.js`, `src/rpc.js`, contracts/transitions. **Depends on:** NEXT-01/02; joint rollout with NEXT-03.

1. Implement a small durable grant operation/commit protocol. Persist validated preparation and commit identity before exposing usable authority; require the Worker to verify that authority against the committed identity. Two independent atomic renames are not a transaction.
2. Reconcile startup against workspace/owner/worker generation/task/attempt/lease and delivery records before reopening admission. Record prepared/sent/acknowledged/settled observations truthfully; negative, late or missing acknowledgements remain explicit. Never automatically resend an uncertain mutation.
3. Keep immediate activation-failure revocation/owned-process containment. If write/read-back or shutdown cannot establish containment, retain a visible hold and both the original and recovery failures; do not trust a PID recovered from disk.
4. Make report latch → inbox → archive → required-review retention recoverable. An identical report retry after an inbox failure must reconcile/re-publish the same logical report instead of claiming successful delivery from its latch alone. Persist obligation identity before considering archival/notice completion safe; conflicting duplicates fail.
5. Fix configuration rollback error swallowing. Recheck source/target/scope freshness, preserve backup bytes, avoid overwriting a changed destination and report recoverable paths plus both failures. Keep unrelated settings and consent unchanged.
6. Define supported file/directory sync and private-temp cleanup behavior. Bound stored records by existing limits; do not build a generic journal service. Do not claim power-loss or filesystem-race guarantees beyond the implemented protocol.

**Implementation exit:** source review documents ordering, pre/post-publication failure outcomes and restart holds at every durable boundary. Static checking passes for the introduced shapes. Disk/crash/RPC fault behavior is still unverified without tests; this batch cannot close the original FND-02/FND-07 evidence gates.

### 13.6 NEXT-05 — Complete strict production typing (B7)

**Files/order:** contracts/transitions/util → config/schema/metrics → RPC/native/evidence → controller → worker/Main/UI/extension.

Finish real boundary and callback types, initialized/uninitialized controller state, error narrowing and public Pi context/event/tool contracts. Keep strict `checkJs`, all production modules, exact development pins and zero runtime dependency additions. Do not suppress diagnostics, introduce broad `any` or unchecked parser casts, or exclude a difficult module. Preserve the existing direct-load ESM entry.

**Static exit:** full `npm run typecheck` exits successfully with zero source and dependency diagnostics. The old 620 count is a baseline, not 620 independent bugs. Run the compiler after meaningful changes; no compiler fixtures or negative-test runner are added.

### 13.7 NEXT-06 — Static integration and truthful handoff (B8 implementation portion)

**Files:** proposed `.github/workflows/static-checks.yml`, `package.json` only if needed, existing lockfile/compiler config, README/scope/ledger/compatibility docs. **Depends on:** NEXT-03–05.

1. Add Node-24 CI using `npm ci --ignore-scripts`, production `typecheck`, and `npm pack --dry-run --ignore-scripts`. Keep package scripts limited to actual non-test tooling; no hidden native/smoke steps or test-artifact upload.
2. Inspect package contents, extension/skill paths, exports and public schema/config names. Mechanically confirm registrations at source level. Keep upstream packages external; preserve exact dev pins and the current peer contract.
3. Record source revision/diff, static command outcomes and each remaining behavior gap. Do not resurrect the deleted tests/runners or treat their old results as current. Keep all original release requirements visible but unverified where their evidence is absent.

**Checkpoint exit:** source-reviewed implementation plus green strict checking/static CI and coherent package contents. This is **not** clean-install runtime qualification, the original FND-08 foundation gate, S3 safety closure or a V1 release. Actual runtime/installation behavior remains unqualified under the no-tests policy.

### 13.8 Later V1 work and stop rules

After the bounded foundation implementation, continue the existing scope in this order; none is a product V2 feature:

1. **IMP-05:** integrate durable lifecycle holds through every public command/settings path. In particular, replace current resume policy/time resets with preserved assignment policy, cumulative counters and waiting obligations. Until then, incompatible or held continuations remain blocked.
2. **IMP-06–08:** establish supported pre-effect admission and admitted-effect settlement; Main/Worker writer exclusion; branch/ownership/delivery recovery and bounded transport; per-command evidence identity and approval revalidation immediately before continuation. Source/API review may identify an unsupported seam; reject it rather than widen profiles or modify upstream sources.
3. **IMP-09:** UTF-8 report-size and logical-report-count enforcement, durable active-step time and per-step revision spending. Preserve unknown crash intervals and separate payload/envelope limits.
4. **IMP-10:** one durable task queue/pump and one serialized review queue, reserved mandatory-review capacity, backpressure and complete review-policy semantics. Zero backlog must not drop mandatory reviews.
5. **IMP-11:** restricted report-only repair and conservative recovery with attempts persisted before action. No implementation lease for repair or replay of uncertain mutations.
6. **IMP-12–13:** native context/permissions/UI/accounting implementation, supported-profile documentation and release work. Original native/fault/installation evidence gates remain unverified; static success cannot authorize release claims or unattended use.

No queue draining, automation or capability widening is enabled by NEXT-01–06. Keep unsupported/uncertain paths held. VNext parallel workers, merging/model routing, new platforms, paid inference and a TS-source rewrite require separate scope approval. If qualification cannot be established within the no-tests directive, record it as blocked; do not recreate tests under another name.

**First implementation action:** follow [the joint NEXT-01/02 runbook](NEXT-01-02-PLAN.md): inventory actual fields/producers/versions (J01), then implement concrete leaf contracts (J02) and co-develop aggregate validation with pure transitions (J03/J04). Freeze the integration map before NEXT-03/04. The runbook is planned work, not a completed model or runtime rollout.

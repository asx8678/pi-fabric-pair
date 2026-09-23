# Implementation plan — remediate and qualify Fabric Pair V1

**Status:** ready for implementation review/approval; no production changes made by preparing this plan.

**Scope:** [SCOPE-OF-WORK.md](SCOPE-OF-WORK.md).

**Acceptance:** [ACCEPTANCE-LEDGER.md](ACCEPTANCE-LEDGER.md), mapped to the original handoff.

**Principle:** retain the working architecture; prove safety-critical integration before expanding features.

R0–R7 below are **remediation work packages**, not assertions that the original handoff's P0–P7 were completed.

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
- Work from the existing clean source-control baseline (`054952d`, `Initial commit`). Keep planning documents and implementation edits visible as uncommitted work until the owner requests commits; do not commit unrelated workspace content.
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

**Primary files:** `src/config.js`, `src/schema.js`, `src/extension.js`, `src/util.js`, examples, `package.json`, proposed strict-check configuration/lockfile.

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

- Implement GATE-C with explicit `unmaterialized / persisted / uncertain / missing` session observations. Correct the mock's eager-file behavior. Missing history after accepted/started work must never use the never-used exception. Verify actual session/model/effort/root on start and each safe continuation.
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

Existing commands: `npm test`, `npm run check`, `npm run pack:check`. The last is only a tarball dry-run; `test:live` currently checks startup/identity only.

Add clearly separated commands during implementation: `test:unit`, `test:rpc`, `test:native` (real stack, deterministic provider), `test:tui`, `test:package`, and `typecheck`. Keep `npm test` offline; native tests must resolve an explicitly configured isolated profile and fail clearly if prerequisites are missing. Paid tests must use a separate opt-in command/budget, never default CI.

Run the smallest relevant checks for each change; rerun broad native/packaging qualification at the release boundary. Do not repeatedly rerun unchanged passing tests as a substitute for closing a failed invariant.

Final implementation report: scope delivered, remaining unsupported profiles, exact source/build versions, all commands/results/skips, regression artifacts, package/commit location if applicable, installation/enablement/removal, preserved-history/recovery behavior and any explicitly authorized live cost. Planning document creation is not completion of any remediation phase.

# Testing policy

The repository retains a bounded automated offline suite for the live runtime. It is regression coverage for the areas below, not release, native or unattended certification.

## Suites

Scoped warming coverage is offline: `tests/warming.test.mjs` exercises ownership,
other-owner composition, default-off validation and trusted layering. Main and
Worker registered-hook fixtures cover actual lifecycle handlers, review waits,
opt-out, stale/cancelled authority, model/session/parent/shutdown boundaries and
unchanged native settings bytes. Controller tests prove warming policy publication
preserves authority identity/budgets and the original report, and fails closed on
publication errors. Fake SDK leases issue no provider requests and do not certify
the native 30-minute cap; the separate native SDK component must verify that cap,
post-hook effective-mode fencing and zero-token economics before live deployment.

`npm test` runs the retained test files with `node --test`:

- `tests/cache-observation.test.mjs` — display-only sample selection, zero/absent/unusable usage, unchanged historical timestamps, true 0% misses, and unchanged normalization/cumulative accounting.
- `tests/worker-cache-observation.test.mjs` — actual registered Worker hooks and `pair_report` in isolated temporary telemetry/authority fixtures: cached request → report/abort → zero-token error; immutable report/yield behavior; true misses; model/session and compaction success/failure clearing. No worker process, provider or warming request is used.
- Main cache regressions in `tests/main-settings.test.mjs` exercise registered usage hooks, zero-token abort placeholders, actual misses, original sample age and model/compaction/session resets. `tests/ui-cache-observation.test.mjs` retains quiet unknown rows, visible measured zero, stable labels, legend and width checks.

- `tests/controller-scan-recovery.test.mjs` — controller scan and recovery semantics: a retained inbox report freezes the review checkpoint; re-presenting a report is an idempotent duplicate; a stale report is quarantined and settling without an admissible report holds the lease; malformed inbox entries are contained rather than dropped.
- `tests/evidence-deletion.test.mjs` — deleted-source evidence: deleted tracked files remain visible through immutable checkpoint evidence; the after-image is served for modified files; deleted binary and oversized files stay bounded and flagged; deleted symlinks expose stored target text without following it; before-image hash and size are re-verified and bound to the saved base snapshot.
- `tests/ui-model-selector.test.mjs` — model-picker UI: immediate sorted listing, keyboard navigation and current-worker highlight, no-match and empty-registry states, search past the former 300-model cap, narrow-width resize, and safe RPC select/cancel behavior.
- `tests/ui-settings-autosave.test.mjs` — compact common/Advanced navigation, per-edit persistence, Done/Esc, canceled/no-op/invalid/failed drafts, scope switching and verification consent via standard RPC dialogs.
- `tests/main-settings.test.mjs` — public command wiring with isolated temporary config/state, sparse global/project inheritance, indicator no-ops, write/runtime failure distinction, migration consent/backup, and pre-spawn setup feedback. No inference or real worker process is launched.
- `tests/native-profile.test.mjs` — aggregate exact prerequisites, actual worker workspace paths, project precedence/trust uncertainty, no native mutation, and shared authoritative readiness validation.
- The controller scan suite also exercises staged active/idle settings, retained report approval, scanner interleaving, newest-edit retention, no-op/indicator behavior, and confirmed-exit/drift fail-closed guards using mock runtime controls.
- `tests/ui-task-list.test.mjs` — task list and widget rendering: per-step state symbols/colors, plan caps, progress bars, activity age and heartbeat/stale markers, budget badges, and the indicator bar.

`npm run test:ui` runs the model-picker suite alone. Pass counts recorded in older planning documents are historical and non-authoritative.

## Running the checks

```bash
npm test
npm run test:ui
npm run typecheck
npm run pack:check
```

`npm test` and `test:ui` are the behavioral checks. `typecheck` is the pinned strict project check; `pack:check` is an npm package dry run. Neither `typecheck` nor `pack:check` loads or behaviorally qualifies the extension. Install from the committed lockfile with `npm ci --ignore-scripts --no-audit --no-fund`; lifecycle scripts stay disabled, so that setup does not qualify native components.

The optional `build:host`/`check:host` commands concern parked native source (Darwin arm64/macOS only) and are not installation or packaging prerequisites; they are not behavioral certification. See the [private storage contract](H1-PERSISTENT-STORAGE-CONTRACT.md).

## Current supervised MVP observation

The bounded actual Pi/Fabric/Fovea loop passed with a deterministic loopback model: question/answer, detached-work rejection, writes/reports, immutable inspection, revision/approval, duplicate/stale decision checks, one retained session, active cancellation and confirmed stop. No paid inference, user-profile change or retained probe file was involved. See [QUICKSTART.md](QUICKSTART.md) and [COMPATIBILITY.md](COMPATIBILITY.md) for versions and limits. This does not certify the historical requirement matrix, interactive TUI, real providers, multi-controller use or crash recovery.

## Limits

The suite is offline and mock-host only: it drives real child processes and a mock Pi host running the actual worker bridge, not live providers. Observations are on macOS and Linux only. It does **not** qualify:

- live provider calls or paid inference;
- crash recovery or power-loss durability;
- the interactive Main TUI;
- unattended operation;
- Windows or any unobserved OS/runtime/profile.

Changes outside the retained suite still require manual review and carry unmeasured regression risk. The package must not be represented as release-qualified, natively certified, or safe for unattended work.

## Planned native qualification

[The seven-part plan §8.5](NEXT-IMPLEMENTATION-PLAN.md#85-native-qualification-matrix-and-authorization-gate) lists the actual-runtime observations still needed after integration. Bounded inline manual probes may use disposable workspaces and isolated state only; they do not establish worker/effect settlement, new-owner transfer, power-loss behavior or public cutover. This does not authorize migration of real user data, valuable-workspace or unattended execution, dependency installation, or settings changes in the user's profile. Record observations and their limits in the [H1 execution ledger](H1-EXECUTION-LEDGER.md); authorization is not a passing result. A manual subset cannot silently satisfy all original U/R/N/T/L requirements. Power-loss durability, unobserved providers/platforms and unmeasured regression risk remain explicit limits.

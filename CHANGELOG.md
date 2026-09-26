# Changelog

## Unreleased

- Removed the per-step model turn limit and overall task timeout, including their Advanced settings rows, status budget ratios and live enforcement. Old configurations and task snapshots that still carry `maxTurnsPerStep`/`taskTimeoutMs` stay readable; the deprecated values are checked, then dropped from effective config and normal saves, and never enforce anything. Reported-cost and output-token budgets, revision limits and review/cancellation timeouts are unchanged; widget/status telemetry keeps raw elapsed time and turn counts without limit ratios.

- Added explicit Pair `cacheWarming: off|active` opt-in (default off), requesting native session-scoped idle leases only during enabled active work/review. Global settings and other owners remain untouched; old SDKs report unsupported with no fallback. Fresh Worker authority gates native decisions; native cost/TTL/replayability and 30-minute idle safety remain authoritative. Added isolated policy/lease/registered-hook/publication tests and diagnostics; native SDK counterpart and installation are separate pending components.

- Preserve Main/Worker last measured cache observations and their original timestamps when report-stop/error events contain zero input or no usable usage. Real measured 0% requests still replace previous hits; model/session/compaction clearing and inference accounting remain separate. Added helper and registered-hook regressions, including the actual Worker report/abort path. Documented native idle warming eligibility, paid refreshes and no cache-hit guarantee; no warming settings are changed.

- Numeric settings now retain current values on blank/whitespace/cancel, with field-specific range/type errors and explicit `none`/`off` budget clearing. Zero revisions and valid fractional minutes/USD are supported; invalid edits cannot leak into later autosaves.
- Both `/pair start` and dashboard start now await startup inside the command error boundary, reporting aggregate setup blockers once without creating a worker on rejection.
- Added a neutral Main/worker `Cache read (last)` widget row and consistent status output: last-request cache-read share and observation age, including idle/review states. Unknown roles are hidden in the widget (no row/spacer if all are unknown), while status diagnostics retain unknown and measured 0.0% stays visible. Configured worker labels remain stable; no cache-residency/TTL guarantee, warming request or extra model call. Widget lines also fit tiny terminal widths.

- Replaced Apply/Cancel settings drafts with per-edit scoped atomic autosave, disposable invalid/failed drafts, Done/Esc close, and a nine-row common menu plus Advanced. Scope switching excludes project overrides from global editing; migrations and verification retain explicit human consent.
- Staged runtime-affecting changes without revoking active authorization or racing scanner containment. Explicit `/pair start` reconciles after terminal tasks and confirmed exits; indicator/no-op edits do not restart workers. Saving and runtime setup outcomes are separate.
- Added aggregate file-profile preflight with required Fabric values, worker workspace paths, precedence and trust limitations; authoritative worker readiness still checks all fields. Added isolated command, profile, autosave and transition regressions.

- Reconciled the testing documentation with the retained offline suite (P3). README, `docs/TESTING.md` and `docs/SCOPE-OF-WORK.md` now describe the current tests instead of the superseded no-tests directive; the suite itself is unchanged.

## 0.1.0 — 2026-09-23

Initial standalone source release. No Pi, Fabric, or Fovea fork.

- Persistent Pi RPC workers with per-Main-session ownership and explicit recovery.
- Asynchronous work orders, questions, review checkpoints, revision and cancellation.
- Hash-bound local evidence, inspection-before-approval, and user-configured verification.
- Native Fabric/Fovea presence checks and native context-management delegation.
- Main and worker roles; nested-tool workflow gates; no recursive Pair spawning.
- Separate `/pair` dialogs and an optional minimal indicator.
- Isolated workspace rules for multiple workers; default one worker.
- Observed cache usage and soft inference/turn/time limits, not guaranteed cache residency.
- Offline tests using real child processes and a mock Pi host running the actual worker bridge.

This release is not certified against live provider calls or the full installed
Pi/Fabric/Fovea stack. See `docs/TESTING.md` before enabling it on valuable work.

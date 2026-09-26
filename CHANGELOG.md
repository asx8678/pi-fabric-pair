# Changelog

## Unreleased

- Added `/pair restart [worker]` and `/pair reload`, also available from the dashboard. Restart rereads settings and replaces only the worker after confirmed exit, retaining its conversation, progress and evidence while Main stays open. Interrupted work requires explicit resume; model changes stay staged until tasks finish or are cancelled. Reload validates saved settings without launching workers, and invalid files preserve the last valid configuration. Added command and child-process regressions for failures, retained history and lifecycle races.

- Fixed retained-worker startup when native model selection records a default thinking level before Pair applies the configured effort. Each setter's observed history suffix is validated separately; exact final selection, append-only history, branch checks and aggregate suffix bounds remain enforced. Cancelling an already-exited worker no longer attempts a dead-process abort RPC, and containment retains the original fault alongside recovery guidance. Added isolated startup and cancellation regressions; no automatic inference retry or conversation reset.

- Removed visible timing from the widget and `/pair status`: worker rows no longer show a numeric activity-age badge, elapsed task duration or turn counts, and the `Cache read (last)` percentages no longer carry an "ago" timer. Internal timestamps, startedAt/turn counters, liveness thresholds (2m pulse stop, 5m stale), one-shot stale notifications with their diagnostic durations, heartbeat behavior and raw machine-readable telemetry are unchanged; a silent worker is still marked with a plain error-colored `stale` badge/row, and a stale task still reports plain STALE guidance without an elapsed number.
- Unstaged ordinary file↔directory replacements no longer block checkpoints. A tracked file whose path became a directory is captured as a missing path — its removed before-image stays inspectable from immutable evidence — while Git still enumerates the new nonignored descendants; a former directory replaced by a regular file records its removed descendants as missing beside the new file. True submodules and embedded Git repositories still fail explicitly: gitlinks are identified by index metadata (mode 160000) rather than directory shape alone; untracked nested-repository directory names are rejected, and so is a tracked path whose replacement directory carries nested-repository metadata (a `.git` directory, gitfile or symlink marker, never followed or recursed into). Symlink-ancestor escape rejection, leaf-symlink capture, special-file rejection and evidence bounds are unchanged, and NUL-delimited index parsing handles spaces, tabs, newlines and multiple merge stages.
- Added an average streaming-throughput label to the worker indicator row (`W avg 42.3 tok/s`; explicit `avg — tok/s` while unavailable) and `/pair status`. The value is a weighted aggregate — summed provider-reported output tokens over summed measured `message_start`→`message_end` seconds per worker session/model — so 100 tokens in 1s plus 100 tokens in 3s averages 50 tok/s, not 66.7. Pi emits `message_start` only once the provider response begins streaming, so pre-response request/prefill latency is excluded and tool execution or idle gaps are never counted; zero-output, unmatched, and nonpositive/nonfinite samples are dropped without touching a good aggregate. The aggregate resets on session/model boundaries, survives compaction (pending timing clears, the completed average remains) and stays visible in waiting/ready/paused states.

- Removed the per-step model turn limit and overall task timeout, including their Advanced settings rows, status budget ratios and live enforcement. Old configurations and task snapshots that still carry `maxTurnsPerStep`/`taskTimeoutMs` stay readable; the deprecated values are checked, then dropped from effective config and normal saves, and never enforce anything. Reported-cost and output-token budgets, revision limits and review/cancellation timeouts are unchanged; raw elapsed time and turn counts stay in machine-readable telemetry only — the widget and status no longer display them.

- Added explicit Pair `cacheWarming: off|active` opt-in (default off), requesting native session-scoped idle leases only during enabled active work/review. Global settings and other owners remain untouched; old SDKs report unsupported with no fallback. Fresh Worker authority gates native decisions; native cost/TTL/replayability and 30-minute idle safety remain authoritative. Added isolated policy/lease/registered-hook/publication tests and diagnostics; native SDK counterpart and installation are separate pending components.

- Preserve Main/Worker last measured cache observations and their original timestamps when report-stop/error events contain zero input or no usable usage. Real measured 0% requests still replace previous hits; model/session/compaction clearing and inference accounting remain separate. Added helper and registered-hook regressions, including the actual Worker report/abort path. Documented native idle warming eligibility, paid refreshes and no cache-hit guarantee; no warming settings are changed.

- Numeric settings now retain current values on blank/whitespace/cancel, with field-specific range/type errors and explicit `none`/`off` budget clearing. Zero revisions and valid fractional minutes/USD are supported; invalid edits cannot leak into later autosaves.
- Both `/pair start` and dashboard start now await startup inside the command error boundary, reporting aggregate setup blockers once without creating a worker on rejection.
- Added a neutral Main/worker `Cache read (last)` widget row and consistent status output: last-request cache-read share (percentages only, no age timers), including idle/review states. Unknown roles are hidden in the widget (no row/spacer if all are unknown), while status diagnostics retain unknown and measured 0.0% stays visible. Configured worker labels remain stable; no cache-residency/TTL guarantee, warming request or extra model call. Widget lines also fit tiny terminal widths.

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

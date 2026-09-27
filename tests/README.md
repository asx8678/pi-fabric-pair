# Tests

`npm test` runs every `tests/*.test.mjs` file offline with Node's built-in runner.
No model request, package installation or real profile write happens; fixtures
use isolated temporary directories and fake Pi RPC hosts
(`tests/helpers/restart-worker.mjs`, plus an in-process host in
`runtime-startup.test.mjs`). The fakes honour `get_entries { since }` the way Pi
does, because `PiRuntime` verifies retained history incrementally.

## Stale coverage

The suite was removed in commit c74becf and restored after the safe-boundary
report delivery and TUI redesign (50bef22..d5b6289). On 2026-09-27 the stale
tests were triaged (owner-approved):

- Re-derived and running again: the activation fences in `handoff-safety`
  (workspace drift and branch navigation around the renewed authorization, the
  running-intent and pre-prompt fences, contained renewal, dispatch work-order
  scope, and the negative control). `pair_decide`/`pair_dispatch` now return once
  recorded and activate the worker in the background, so the tests wait for
  `controller.activations` (`settled`) and expect the held reason on the record
  plus only a passive `fabric-pair.notice` to Main (`onlyHeldNotice`). The armed
  yield navigation test runs with `autoDeliverReports: false`, the channel it
  covers. In `controller-scan-recovery`, the retained-report test runs in manual
  delivery; the duplicate-report and unchanged-latch tests wait for the first
  automatic delivery before asserting that repeats change nothing; the drifted
  answer test waits for the background activation.
- Removed: tests of interfaces that no longer exist: `tests/stale/ui-*` (the
  multi-line widget API and the old `Done`/`Back` settings menus), the old
  settings-dashboard tests in `main-settings`, and the old status-label test in
  `worker-speed`. The startup-preflight test keeps its `/pair start` variant.
- Still skipped: two verification tests in `handoff-safety` expect drift to
  reject; verification now records it as a failed `VERIFICATION_SOURCE_DRIFT`
  check. `tests/stale/handoff-delivery.test.mjs` covers the armed-yield delivery
  model written before automatic delivery; it does not run.

Re-derive a skipped test from the current behaviour and un-skip it; do not
delete it just because it is red.

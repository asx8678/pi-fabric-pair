# Tests

`npm test` runs every `tests/*.test.mjs` file offline with Node's built-in runner.
No model request, package installation or real profile write happens; fixtures
use isolated temporary directories and fake Pi RPC hosts
(`tests/helpers/restart-worker.mjs`, plus an in-process host in
`runtime-startup.test.mjs`). The fakes honour `get_entries { since }` the way Pi
does, because `PiRuntime` verifies retained history incrementally.

## Stale coverage

The suite was removed in commit c74becf and restored after the safe-boundary
report delivery and TUI redesign (50bef22..d5b6289). Tests that encode the old
behaviour are kept rather than silently adjusted:

- `tests/stale/` holds files that import the removed multi-line widget API
  (`indicatorWidget`, `taskListLines`, `budgetBadges`, `reportLineColor`) or
  drive the old `Done`/`Back` settings menus. They do not run.
- Individual tests in `handoff-safety`, `main-settings`, `worker-speed` and
  `controller-scan-recovery` carry `{ skip: 'stale: …' }` for the same reason.

Each stale test states an invariant the current code should still honour
(workspace drift rejection, idempotent duplicate reports, settings autosave).
Re-derive the expectation from the current behaviour and un-skip it; do not
delete it just because it is red.

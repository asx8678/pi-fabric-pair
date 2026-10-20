# Tests

`npm test` runs every `test/**/*.test.js` file offline with Node's built-in runner.
No model request, package installation or real profile write happens: fixtures use
isolated temporary directories, point `PI_CODING_AGENT_DIR` (or the controller's
storage directory) there, and use fake Pi RPC hosts (`test/helpers/restart-worker.js`,
plus an in-process host in `runtime-startup.test.js`). The fakes honour
`get_entries { since }` the way Pi does, because `PiRuntime` verifies retained
history incrementally.

- UI and pure-module suites: `cards-and-commands`, `dashboard`, `glance`,
  `history-and-cue`, `task-summary`, `transcript`, `ui-smoke`.
- Controller, worker, runtime and safety suites: `cache-observation`,
  `controller-restart`, `controller-scan-recovery`, `efficiency`,
  `evidence-deletion`, `evidence-replacement`, `handoff-safety`, `main-settings`,
  `message-cards`, `native-profile`, `removed-limits`, `rpc-framing`,
  `runtime-startup`, `worker-speed`.

## History

The controller, worker and safety suites lived in `tests/*.test.mjs` until commit
4ef0fc4 removed them. On 2026-10-20 they were restored here as `*.test.js`, so
`npm test` runs them with the UI suites. Fixture updates for the current code:
the fake hosts answer `/pair-bridge` with `{disposition: 'handled'}`, and the
mock Pi APIs gained `registerShortcut`. The source exports `DEFAULTS`,
`validateConfigLayer`, `validateTaskLimits`, `speedLabel` and
`roleFromEnvironment` again for these tests.

Re-derived from the current behaviour at the same time:

- `controller-scan-recovery`: the transcript test expects `transcriptText`'s
  rendering and also covers the unchanged-file cache.
- `efficiency`: the ChatGPT sign-in fixture has a priced prompt cache, so signing
  in is the only reason it is never warmed; the unpriced case is its own assertion.
- `message-cards`: cards are `{color, text}` lines, and a failed worker claim is a
  warning, not an error.
- `runtime-startup`: since commit dc0a663 any valid effort change in the startup
  suffix is accepted (another extension may restore a per-model effort); an
  unknown level is still rejected.
- `handoff-safety`: verification records source drift as a failed
  `VERIFICATION_SOURCE_DRIFT` check and stops there, instead of rejecting.
- `main-settings`: the restart variant through the menu goes through More…, as
  bare `/pair` does without the TUI.

An earlier triage (2026-09-27, owner-approved) re-derived the activation fences in
`handoff-safety` and removed tests of interfaces that no longer exist (the
multi-line widget API, the old settings menus and the old status label).

## Stale coverage

`test/stale/handoff-delivery.test.mjs` covers the armed-yield delivery model
written before automatic delivery. It keeps the `.mjs` name so `npm test` does
not run it, and its imports predate the move into `stale/`.

Re-derive a stale or skipped test from the current behaviour and un-skip it; do
not delete it just because it is red.

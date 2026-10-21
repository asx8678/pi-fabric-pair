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
  `liveness`, `peek-steer`, `runtime-startup`, `step-limit-escape`,
  `supervision-notices`, `watchdog-core`, `worker-speed`, `config-merge`,
  `pair-owned-paths`, `pair-config-checkpoint`, `worker-management`,
  `worker-removal`, `worker-commands`.
- `heartbeat-docs`: the opt-in Main heartbeat (off adds nothing; `note` appends one
  display-only line with state, step, step time, event age and context; `wake` also
  starts a turn), that every supervision setting has an editable `/pair settings` row,
  and that the example config documents `control.mainHeartbeat` and
  `control.compactionMaxMs`.
- `provider-recover`: the provider error classifier (quota vs transient, exponential
  backoff capped at 15 min, bounded waits per step), a scheduled retry that survives a
  Main restart (checked over retained records, so it fires for a record parked in
  `error` and with no live handle at all), escalation when the waits are spent, a
  crash recovered only with a proven exit, `pair_recover` proving the exit before refusing or proceeding, the
  per-approved-step recovery refill, and the liveness/provider error in a supervision
  notice.
- `watchdog-hangs`: a tool past `control.toolMaxMs` is stopped and the step
  re-activated with guidance (and a tool in flight is never treated as silence); a
  frozen worker (no answer to `get_state`) is stopped and re-activated; a silent but
  responsive one gets exactly one ping per episode and is aborted at 2 x `silentMs`;
  once recoveries are spent Main is supervised; none of it fires while a report
  settles, a checkpoint is frozen or a latch exists; `PiRuntime.ping` answers through
  the control path; and the live badge shows a running tool's duration.
- `compaction-window`: a between-run compaction (Fabric compacts right after a
  run settles) is maintenance, not stray agent work: it is not aborted, no
  "began without a Pair lease" notice is sent, agent work outside a lease is still
  rejected, `control.compactionMaxMs` bounds it (and 0 restores the old refusal),
  retained-history verification accepts a between-lease compaction entry and still
  refuses any other, the settle clocks and checkpoint freezing wait for it, the next
  activation waits before prompting, and the dashboard says "compacting".
- `watchdog-core`: the `control` settings (defaults, bounds, and that they never
  change `configHash()`), `autoRecover` (bounded per step; refuses human pauses,
  spent budgets and unconfirmed exits; records a timeline note and a toast), the
  missing-report re-prompt then escalation, the soft step nudge once per step
  (steered with `by: 'watchdog'`, never spending a recovery, once per step
  attempt), the pending-retry CHECK suppression, and that old state without
  `t.watchdog` loads. Two are ordering tests: the re-prompt resume runs only
  after `scheduleScan`'s containment jobs have settled (slow `abortCurrent`,
  real sequencing, no stubbed resume), and a revised attempt of the same step
  gets its own nudge.
- `peek-steer`: `pair_peek` (bounded, no RPC) and `pair_steer` (fenced to the
  current running lease, bounded per step, recorded in the timeline), their schemas
  and registration, and `/pair steer`. Three of them drive a real `PiRuntime`
  over an in-process fake host, so the activation fence is exercised as it is in
  production: a mid-run steer reaches the host, a previous attempt and a settled run
  are refused with no `steer` command sent.
- `liveness`: the runtime's last event, running tool, provider retry, last error and
  compaction start; the pure `classifyLiveness` projection (including `silent`), its
  presence in `pair_status`/`summary()`, the provider error in the no-report
  interruption, and the stale warning ignoring tools and retries.
- `supervision-notices`: scaled per-task caps, the pure delivery predicate, Main
  checks for reports Pair will not deliver itself, the once-per-state idle wake,
  the human toasts and the supervision-off notice.
- `step-limit-escape`: re-planning a step past its per-step revision limit, and
  Main's own fix of a step (`fix` → edit → `fixed`) including the verification
  refusal, the fencing and the worker continuation note.

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
- `config-merge`: `changedLayer`/`readScopeLayer`/`layerChangedExternally`: a
  save writes only the fields the edit changed onto the layer read from disk just
  before saving (a key written externally after load survives; an external change to
  the same field takes the user's value; an invalid file refuses the save and is
  left byte for byte untouched; an unchanged edit writes nothing).
- `pair-owned-paths`: Pair's own config files — the project and legacy project
  files, `.v<version>.bak` backups, and `.pi/fabric-pair*` — are excluded from
  `capture` (a tracked config too) and from `checkpoint.changed`; a snapshot frozen
  before the exclusion still approves after a settings edit (`currentWorkspace`
  recomputes its hash without those paths); a real source change is still
  `STALE_CHECKPOINT`; and `writesOnlyPairConfig`/`writtenPaths` decide Main's
  read-only exception (Pair config only, mixed batches and other paths blocked).
- `pair-config-checkpoint`: the same exclusion end to end through `registerMain`:
  dispatch a step, edit `.pi/fabric-pair.json` and a backup while the review waits,
  approve, and see the checkpoint list only the worker's file; a real source edit
  after the report is still refused as `STALE_CHECKPOINT`.
- `worker-management`: `Controller.switchTo` stops an idle live worker and then
  starts the requested one (the fake `rpcFactory` asserts no two processes overlap),
  refuses to displace one holding an unresolved task and names that worker and task,
  is a plain start when nothing is live, and is what a dispatch to a non-live worker
  uses; a dispatch that is refused outright stops nothing.
- `worker-removal`: `removeWorker` refuses a live process, an unresolved task, an
  unknown id and the last worker; it archives the state record the way `reset` does,
  deletes the worker directory only with `keepConversation: false`, keeps it
  otherwise so adding the same id resumes the same session file, and restores the
  record when the config save fails.
- `worker-commands`: the `/pair worker` completions (verb, then configured IDs only
  for `remove`/`default`, then keep/discard), `/pair start|stop <id>` IDs,
  `workerListText` fitting 60 columns and labelling a never-started worker, and
  `/pair status` reading "not started" for a configured worker that never ran.
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

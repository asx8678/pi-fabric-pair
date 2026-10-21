# Tests

`npm test` runs every `test/**/*.test.js` file offline with Node's built-in runner.
No model request, package installation or real profile write happens: fixtures use
isolated temporary directories, point `PI_CODING_AGENT_DIR` (or the controller's
storage directory) there, and use fake Pi RPC hosts (`test/helpers/restart-worker.js`,
plus an in-process host in `runtime-startup.test.js`). The fakes honour
`get_entries { since }` the way Pi does, because `PiRuntime` verifies retained
history incrementally.

- UI and pure-module suites: `cards-and-commands`, `dashboard`, `dashboard-e2e`, `glance`,
  `history-and-cue`, `task-summary`, `transcript`, `ui-smoke`.
- Controller, worker, runtime and safety suites: `cache-observation`,
  `controller-restart`, `controller-scan-recovery`, `efficiency`,
  `evidence-deletion`, `evidence-replacement`, `handoff-safety`, `main-settings`,
  `message-cards`, `native-profile`, `removed-limits`, `rpc-framing`,
  `liveness`, `peek-steer`, `runtime-startup`, `step-limit-escape`,
  `supervision-notices`, `watchdog-core`, `worker-speed`, `config-merge`,
  `pair-owned-paths`, `pair-config-checkpoint`, `worker-management`,
  `worker-removal`, `worker-commands`, `worker-config`, `low-runtime`.
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
- `step-controls`: the controls a step can carry. A step's `scope` is a list of
  repository-relative globs (absolute paths and `..` are refused at dispatch and
  in a revised plan); an out-of-scope change is named in the report
  (`STEP_SCOPE`) and, with `supervision.enforceStepScope` on, is also refused
  inside a Pi worker and refused at approval. A step's `effort` is applied to a Pi
  worker through `set_thinking_level` before its prompt — accepted by the drift
  checks because the controller set it — and restored for the next step; a low
  worker refuses a level it cannot serve instead of running at another one.
  Reports may carry `acceptance: [{criterion, met, evidence}]`, shown in the report
  card, and low's `criteria`/`claims` map into them; an unknown level and an
  escaping glob are refused.
- `shell-guard`: a Pair worker cannot run the commands its human reserved. In the
  Pi worker's `tool_call`, a bash/powershell call whose command matches
  `control.blockedCommands` (13 regexes by default: commit, push, reset --hard,
  checkout --, clean -f, rebase, stash, branch -D, publish, sudo, and recursive
  force-deletes of / or ~) is refused with the rule named, and a call without a
  timeout, or asking for more, gets `control.defaultShellTimeoutS` (600, 0
  disables). A `fabric_exec` program is scanned too, because its nested `pi.bash`
  calls never reach that handler: a literal command is checked, a computed one is
  refused, and so is a call whose own `timeout` option is over the limit (the scan
  is a check, not a rewrite; the shell's `timeout 300 …` inside a command is not
  the option). A result that ran into its timeout keeps its text and gains a note
  not to rerun the hung command, and every work order states the command rule,
  with the limit only for a Pi worker. Both settings
  are control, so outside `configHash()`; the list is config-only and validated (an
  invalid regex is refused). A low worker has no such hook — `--protect` takes paths,
  not commands — so its sandbox is the only guard and `/pair doctor` says so.
- `provider-fallback`: `workers[].fallbacks` (at most 4; provider and model, optional
  effort and backend; a read-only worker cannot fall back to low) and
  `control.fallbackAfterWaits` (2, outside `configHash()`) validate; a quota stop
  switches at once and a rate limit after the configured waits, by stopping the
  process and resuming the step on the fallback without spending a recovery; the
  chain moves on and, spent, falls back to the ordinary wait; a fallback on the other
  backend sets the primary conversation aside and the next task restores it; and,
  end to end on the fake low, a quota stop restarts `low --serve` on the fallback
  model with the same `--session` and the step finishes there with authority bound
  to the fallback model. `controller-restart` covers the Pi restart on the fallback
  model with the same conversation.
- `auto-repair`: mechanical failures stop costing Main a turn. A failed
  configured check, checks that describe a different workspace than the checkpoint
  (`VERIFICATION_SOURCE_DRIFT`) and an oversized every-step checkpoint
  (`STEP_TOO_LARGE`) are not delivered: Pair re-queues the same step to the same
  worker with its own finding and the bounded failing output, up to
  `control.autoRepairsPerStep` (2, outside `configHash()`), through the same
  continuation fence a `decide(revise)` uses, recorded on the timeline as a
  watchdog action and without spending `maxRevisions` or `maxRevisionsPerStep`.
  Past the bound the report reaches Main and its message says how many repairs were
  tried and what each found. A question, a blocker, a clean checkpoint, an
  out-of-scope write and a worker's own failure are never repaired this way.
- `session-hygiene`: a task never starts in a bloated context. The two
  thresholds (`control.compactBeforeTaskTokens`, 200k, and
  `control.freshSessionAboveTokens`, 600k, 0 disables either) are config control,
  outside `configHash()`; above the first a Pi worker is compacted before the work
  prompt and a low worker starts a fresh session instead; above the second the
  conversation is replaced, the old session file archived in the worker's history
  and the record marked so the next start opens a new one; a bounded compaction is
  stopped at `control.compactionMaxMs`; and a worker Pair never measured is left
  alone rather than compacted on a guess.
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
  rendering and also covers the unchanged-file cache. An answer or revise after the
  workspace was edited is now accepted (it used to be refused as `STALE_CHECKPOINT`):
  the result and the worker's message list the changed files, an answer without edits
  carries no list, and approve still requires the exact checkpoint.
- `efficiency`: the ChatGPT sign-in fixture has a priced prompt cache, so signing
  in is the only reason it is never warmed; the unpriced case is its own assertion.
- `message-cards`: cards are `{color, text}` lines, and a failed worker claim is a
  warning, not an error.
- `runtime-startup`: since commit dc0a663 any valid effort change in the startup
  suffix is accepted (another extension may restore a per-model effort); an
  unknown level is still rejected.
- `handoff-safety`: verification records source drift as a failed
  `VERIFICATION_SOURCE_DRIFT` check and stops there, instead of rejecting. A revise
  that accepted workspace edits fences the renewed lease on the capture it accepted,
  so a further edit during the readiness wait is still refused.
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
  A base snapshot that still lists the config produces a checkpoint with no `.pi`
  entry in `changed`, `files` or `diff.patch` — `checkpoint` projects both sides
  through `withoutPairOwned` and persists the projected snapshots under the hashes
  its manifest names — while a real addition or deletion of source is still listed.
  `snapshotDelta` ignores Pair-owned paths on both sides too.
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
  unknown id and the last worker; with `stopFirst` (the host's removal) it cancels
  the task and stops the process first, but checks the last-worker rule before
  touching anything; it archives the state record the way `reset` does,
  deletes the worker directory only with `keepConversation: false`, keeps it
  otherwise so adding the same id resumes the same session file, and restores the
  record when the config save fails.
- The dashboard suite also covers the Workers list: every configured worker with
  its default marker, provider/model, effort, state (including `not started` for a
  worker that never ran) and task step; the selection moving with `↑`/`↓`, `j`/`k`
  and `w`; `n`/`x`/`a`/`D`/`*`/`o` offered only when they apply (no start while Pair is
  off, no remove for the last worker, `*` only for a worker that is not first) and
  resolved with the selected worker; the Pair-off sentence naming the same `o` key
  as the hint row; every row and key line inside 60 columns; and the non-TUI menu
  offering Start, Stop, Add, Remove, Make default and Turn Pair on plus a roster row.
- `worker-commands`: the `/pair worker` completions (verb, then configured IDs only
  for `remove`/`default`, then keep/discard), `/pair start|stop <id>` IDs,
  `workerListText` fitting 60 columns and labelling a never-started worker, and
  `/pair status` reading "not started" for a configured worker that never ran.
- `documentation`: the example config documents every leaf field of `DEFAULTS` and
  validates as a saved file (and has no field `DEFAULTS` lacks); the README's settings
  table names every page in `src/settings-screen.js` and describes provenance, reset,
  the filter, Edit as JSON, merge-on-save and the checkpoint exclusion; the skill has
  its Workers section naming the one-at-a-time rule and the roster commands, and
  states the config-edit exception Main may use; and this file names every suite
  `npm test` runs, so a new suite cannot ship undocumented.
- `worker-config`: the pure roster helpers — `addWorker` (the id is validated and
  unique, a bare model inherits the first worker's provider), `updateWorker`,
  `duplicateWorker` (copies model and effort under a new id, right after the
  original), `moveWorker` (clamped at the ends), `makeDefault`, `removeWorker`
  (refuses the last one) and `describeWorker`/`splitModel`.
- `low-heartbeat`: the pure `heartbeatFresh` rule behind a low worker's ping — fresh until exactly the window
  old and stale from then on, never fresh when the timestamp is in the future or missing (a host clock that
  jumped must not make a frozen server look alive), and a window parameter an older low or a test can set.
  No process and no wait, so the edges cannot flake.
- `low-watchdog`: the watchdog rungs against a real `LowRuntime` on the fake low host, proving the same scan
  code paths drive both backends: a run past `control.toolMaxMs` is stopped and the step re-activated with
  guidance (its run is the watchdog's `tool`); a quiet worker with no run under way is `silent` and, after the
  ping, aborts the stalled request; a server that stops answering is the frozen rung and is stopped; a server
  that exits mid-task leaves a provable exit (`exitProof`) so a crash may be recovered and nothing is reported
  from the dying task.
- `exit-proof`: `exitProof`, the gate in front of every automatic recovery (the watchdog's crash and
  settle-timeout rungs, Main's `pair_recover`). It separates "the worker is still running" from "an unrelated
  process inherited its PID number after it exited": a number taken by a process that started after the spawn
  proves the exit, one that could be ours proves nothing, the runtime's own reaped exit is proof whatever now
  holds the number, a handle from an older generation proves nothing, and `parseElapsed` reads every `ps etime`
  shape (`ps lstart` is a local-time string, so it is read in the wrong zone and was an hour off here), and
  `exitProof` prefers the exit the runtime itself reaped — the proof that survives the PID number being reused,
  which is what made the crash rung flaky under a busy suite.
- `low-publish-fence`: a low report is published the way Pi publishes `pair_report` — latch, re-check of the
  lease, then inbox — driven over a scripted child rather than the fake CLI (the fake deletes its inbox on
  `/stop`, which would erase the evidence). A lease revoked inside that window leaves the latch and no inbox
  entry; with the lease intact the same report publishes, so the test cannot pass by never publishing at all.
- `per-worker-backend`: `spec.backend` (with `runtime.backend` as the default) resolved by `workerBackend`, a
  worker's own `lowCommand`/`lowArgs` by `workerLow`, an old config file that has neither loading unchanged and
  gaining no field, invalid values refused, one worker's backend change being restart-bound while the other worker
  and the project runtime stay put, a mixed roster reporting each backend, `addWorker` with and without a backend,
  and the read-only refusal following the worker rather than the project.
- `backend-choice`: the runtime a start constructs comes from that worker's spec — a low worker gets a real
  `LowRuntime` whose spawn carries its own command and arguments (asserted on the argv the stub was handed), a
  worker with no backend follows the project in both directions, and a mixed roster switches from the Pi worker to
  the low one under the one-live-worker rule.
- `backend-staging`: `runtime.backend` is inside `configHash()`, so switching it stages a restart while a worker
  is retained (the live config keeps the backend the process started with) and applies at once when none is.
- `low-runtime`: the `runtime.backend === 'low'` path against
  `helpers/fake-low.mjs`, which speaks low's inbox protocol, so the low worker starts,
  takes a turn and stops without Pi RPC or a model request.
- `dashboard-e2e`: the `/pair` dashboard end to end through `main.js`, with fake low
  workers that really start and stop: start, switch, stop, make default, add, remove
  a running worker (keep, discard after a confirmation, or cancel), restart, reload, the status, inbox and doctor views, help, and
  picking a worker in settings; worker-list edits notify once, without the generic
  "settings saved" line.
- `settings-screen`: the TUI settings screen driven by keypresses against a fake
  `ctx.ui.custom`: one framed overlay whose every line is exactly the render width,
  page movement wrapping both ways, and one row kind at a time (toggle on Enter and on
  Space, choice list, number with its bounds and inline error, text, model picker with
  filter and effort clamp, nullable `none` numbers, comma/line lists, the verification
  editor with its authorization confirm). It also covers what the pages are for: the
  Workers page listing every worker with its model and effort and the default marked,
  add/duplicate/remove/make default/move up and down, the tab bar fitting 60 columns
  and keeping the active page on it, one test that walks `DEFAULTS` and asserts every
  leaf field except `version` has a row on some page, restart-bound rows saying so and
  staging the save while a task runs, provenance labels (`default`/`global`/`project`,
  dropped at 60 columns), reset with `r` falling back to the other scope and to the
  default (and refusing a field this scope does not set), the `/` filter matching
  labels and key paths across pages, and Edit as JSON (valid saves; an invalid or
  malformed layer is refused with the file left unchanged and the editor reopened on
  the typed draft; cancel changes nothing). `main-settings` repeats the merge,
  provenance, reset and JSON paths through the real host, in both the TUI and the
  non-TUI menu.
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

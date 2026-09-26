# Pair reference

Detailed controls, configuration, review policies, and cache behavior.
For first use, follow the [quickstart](QUICKSTART.md).

## Review policies

| Review policy | When Main reviews |
| --- | --- |
| `every-step` | After each small step in the dispatched plan. A step may change at most `supervision.maxStepFiles` files (default 5): a larger checkpoint cannot be approved, so Main asks for smaller steps. Use this for first runs. |
| `milestones` | After each planned milestone. This is the configuration default. |
| `final-only` | After the full assigned plan; questions and blockers can still return earlier. |

Final review is required in every policy. `every-step` and `milestones` both review
each dispatched step; they differ in how Main is asked to size steps, and `every-step`
additionally enforces the step size limit.

## Commands

Commands with an optional worker ID use the first configured worker by default.
`/pair stop` without an ID stops all owned workers.

| Command | Purpose |
| --- | --- |
| `/pair` | Open the dashboard. It lists what needs you, any missing setup (turn Pair on, choose the worker model), and the worker's model and effort, which you can change in place. It stays open between actions (closing once a delivery hands the turn to Main); restart, reload and doctor are under **More…**. |
| `/pair settings` | Edit settings with scoped autosave. |
| `/pair start [worker]` | Start the worker or reconcile staged settings when eligible. |
| `/pair restart [worker]` | Reread settings and replace only the worker process, retaining its conversation. |
| `/pair reload` | Reread saved Pair settings without restarting Main or launching a worker. |
| `/pair status` | Inspect task state, sessions, usage, and warming diagnostics. |
| `/pair doctor` | Check configuration and extension registrations. |
| `/pair transcript [worker]` | Read the recent worker conversation. |
| `/pair report [worker]` | Show the current report as a card: summary, question, Pair-captured files and checks, then worker claims. Read-only: it never marks the report inspected for Main. |
| `/pair diff [worker]` | Scroll the checkpoint diff with real file names and added-file contents. Keys: ↑/↓, PgUp/PgDn, `g`/`G`, `/` search, `n`/`N`, `[`/`]` previous/next file, Esc. Read-only, like `/pair report`. |
| `/pair inbox` | Inspect unresolved reports and recovery delivery options. |
| `/pair yield` | Explicitly send retained, unacknowledged reports to Main now. An idle Main starts a turn for them; a busy Main reads them right after its current work. |
| `/pair reconcile [worker]` | After Main crashed or was killed, prove that the previous worker process exited so the worker can be used again. If it may still run, Pair offers to stop that process group, and as a last resort asks you to confirm it is gone. The task stays held; nothing is replayed. |
| `/pair pause [worker]` | Abort current work and hold the assignment. |
| `/pair resume [worker]` | Confirm continuation after inspecting interrupted work. |
| `/pair cancel [worker] [reason]` | Cancel the assignment and retain the conversation. |
| `/pair stop [worker\|all]` | Stop owned worker processes and retain their history. Asks first when this would interrupt a running task. |
| `/pair reset-worker [worker]` | Explicitly confirm a fresh conversation; archive the old state. |
| `/pair indicator minimal` / `compact` / `off` | Choose what Pair shows: the status line plus the current plan step (`minimal`, the default), the status line only (`compact`), or nothing (`off`). |

Cancellation and stopping do not undo files already written. Normal Main shutdown
also stops owned workers.

### Status line

Pair shows one line in Pi's footer, under its own status key beside other
extensions' statuses. It says in plain words what is happening and who has the
work, then the current step, what the worker is doing right now, and metrics:

```text
pair · ◉ Worker working on step 2/5 · Wire controller · editing src/controller.js · 42.3 tok/s · $0.013 · cache M 99% W 100%
pair · ◉ Worker revising step 2/5 · Wire controller · running npm · 38.1 tok/s
pair · ◐ Checkpoint 2/5 ready for review · Wire controller · Main is reviewing
pair · ◐ Question for Main · step 2/5 · Main is busy; delivered when its current work is done
pair · ● Task done · worker ready · gpt-6-luna · max
pair · ○ Worker stopped · not a Git repo
pair · ○ Worker not set up · /pair to choose a model
```

The worker's activity comes from its current tool: a file path relative to the
workspace for file tools, and only the program name for shell commands (never
their arguments). The icon blinks while the worker is active and the line says
`no activity for 5+ min` after five minutes of silence. Speed appears only while
the worker runs (`— tok/s` until measured), context pressure above 75%. No
elapsed time or turn count is shown. Pi cuts the footer from the right, so the
most important words come first. In `minimal` mode a second line above the
editor shows the plan's approved/total bar and current step. The indicator is
display-only and never affects work. `/pair status` lists every step.

## Report delivery, phases and branches

Finalized worker reports always wait in Pair's durable inbox. With the default
`autoDeliverReports: true` they are also delivered to Main automatically (see
**Automatic delivery** below). With `autoDeliverReports: false` they never wake Main
and are retrieved explicitly.

- **`pair_yield`** returns every unacknowledged report — pending, offered
  (including legacy `delivered` receipts) or failed — as compact summaries in
  the tool result, preserving the exact question text, step identity, completion
  semantics and worker decisions. Repeat reads return the same stable report
  IDs; reading consumes nothing.
- **Acknowledgment is explicit.** An offer is only a delivery attempt. A report
  stops waiting when `pair_inspect` reads it (`observedAt`) or `pair_decide`
  resolves it. A triggered delivery is recorded as offered only after Main's
  session observably receives the report message; otherwise it returns to
  pending.
- **One settlement-boundary delivery per empty yield.** A `pair_yield` that
  returned no reports arms the current run's settlement boundary: one report
  finalizing before that run settles is injected once as a boundary entry
  (public `agent_before_settle` entries/continue). A yield that already returned
  results consumes that permission. Pending user input, non-Pair tool work, new
  runs, branch navigation, and pending-input state that cannot be confidently
  observed all defer or revoke the offer; dropped offers stay retrievable.
  `canContinue` is deliberately not pre-gated — native validates it after
  committing the draft.
- **Automatic delivery (`autoDeliverReports`, default `true`).** A finalized
  report is durable pending work and **never interrupts Main**:
  - *Main is working* (generating, running tools, compacting, or holding queued
    messages): nothing is sent. When Main's run completes normally and no user
    message is queued, the report is appended at that run's settlement boundary
    (`agent_before_settle`), so Main reviews it after finishing its own work, in
    the same run. If a user message is queued, the run continues with it first.
  - *Main's run settles with the report still waiting* (for example a queued
    message took the boundary): the report is sent from the `agent_settled`
    handler. Pi defers that turn and runs it in order with anything else queued at
    settlement, including a prompt you submit meanwhile.
  - *Main is idle*: the report starts a Main turn. Pair re-checks that Main is
    idle in the same tick as the send. If your prompt still collides with that
    turn (another extension's input handler was busy), Pair takes over your
    prompt, stops the report run, and sends your message next as a normal
    prompt, so it is never rejected or lost.
  - *Main's run was aborted or failed*: Main is not woken; the report waits for
    the next run's boundary, `pair_yield` or `/pair yield`.

  Your prompt never carries a report. A sent report is recorded as `offered`
  only once Main's session observably holds it; while Main is busy the wait
  continues (a queued report is read when the run drains it). If an idle Main's
  session does not hold it, the send is retried (at most 3 attempts), and a
  report already present in Main's session is never sent twice. Only
  never-offered reports are sent automatically, at most
  `limits.maxReportsPerTask` (default 40) per task; after that, reports wait
  for `/pair inbox`. `deliveries.jsonl` in Pair's state directory logs each
  claim, deferral, observation and retry.
- **Manual fallback.** With `autoDeliverReports: false`, a result arriving after
  a yielded Main has settled stays retained with a waiting indicator until the
  next explicit `pair_yield`, or the human `/pair yield` / `/pair inbox`
  redelivery. No timer-based inference exists in either mode.
- **Main phase.** Dispatch records an explicit, non-authorizing `open` phase;
  `pair_yield` records a `yielded` phase bound to the exact agent run (run
  token, monotonic revision, logical activity epoch). New user input, non-Pair
  tool admission and new agent runs supersede an unused yield synchronously.

### Branch navigation and review reconciliation

Tree navigation (never ordinary turns, leaf appends, settlement or compaction)
advances a persisted conversation-branch counter and:

- invalidates unused yields and in-flight delivery offers (reports stay
  retained and retrievable);
- makes decisions resting on a previous branch's inspection stale: approving
  or continuing requires re-running `pair_inspect` on the current branch, which
  re-pins the branch metadata;
- is fenced through the whole renewal — decision reservation, every post-await
  check, the activation transaction, running-authority publication, and the RPC
  write guard immediately before prompt bytes leave. Navigation observed at any
  of those points holds the renewal: the task is interrupted, the authority
  file is overwritten to a hold, no work prompt is sent, and the error stays
  visible on the record. Recovery is explicit and has two distinct cases:

  - An **uncommitted stale review** — the decision itself was rejected — needs
    only a fresh `pair_inspect` on the current branch before deciding again.
  - A **contained renewal** — the decision committed, then the activation was
    held — leaves the task interrupted with the owned generation held: inspect
    the retained evidence and outcomes, explicitly stop the held generation
    (confirmed exit) and only then `/pair resume` continues the same
    conversation. Re-inspection alone does not restore a committed decision
    to review. An unconfirmed exit (for example after Main crashed) is resolved
    with `/pair reconcile`, never with reset, history deletion or lock removal.

Inspections pin the branch they actually read: the branch is captured before
the first await and re-verified at transaction admission and after the
asynchronous evidence read, so an inspection crossing navigation never
acknowledges the newer branch. Omitting `pair_inspect`'s optional report ID pins
the actual current report. Missing/legacy branch metadata authorizes only while
no navigation has ever occurred; it never implies a current-context inspection
afterwards. A paused question/review/blocker survives repeated pauses and
controller reload, and resume restores the waiting decision instead of rotating
a new lease. Dispatch also retains a bounded, identity-bound `work-order.json`
scope reference so the worker can restore the original objective/context (and
the final-only remaining plan) after compaction — a read-only reference, never
a new grant.

## Configuration
Start with the settings UI or [the complete example](../fabric-pair.example.json).
Pair is disabled by default. Its `autoStart` default is `true`, so deliberately
switch it off for the manual-start setup in the quickstart.

| File | Role |
| --- | --- |
| `<agent-dir>/fabric-pair.json` | Global behavior settings. |
| `<trusted-project>/.pi/fabric-pair.json` | Trusted project overrides. |
| `<agent-dir>/fabric-pair-ui.json` | Personal indicator preference. |

The agent directory normally means `~/.pi/agent`. Untrusted project settings are
not loaded. Arrays replace inherited arrays. Scope switching shows the selected
layer; global editing excludes project overrides, and only changed fields are
saved to that layer.

Ordinary settings edits do not launch work. Runtime and model changes remain staged
while a worker or task is retained. Finish or cancel the task, then run
`/pair start` or `/pair restart` to apply them after a confirmed worker exit, keeping
the conversation without replaying work. Reload reads global settings, trusted
project overrides and the indicator preference without writing those files or
triggering autostart. Invalid configuration reports an error and preserves the
last valid settings and live worker; correct the file and reload again.
Workspace changes require an explicit reset. Project
configuration edits can invalidate a frozen review checkpoint.

Policy, verification, and limit changes normally apply to new assignments.
Explicit resume can adopt updated policy and limits while retaining recorded
usage. Setting `enabled: false` prevents new work; use pause, cancel, or stop to
control an existing assignment.

Legacy configuration opens as a disabled migration preview. Use **Advanced >
Review/migrate selected scope** to review and confirm migration. An explicitly
selected archived backup can be previewed with
`/pair import-backup <global|project> <absolute-path>`.

### Verification commands

Configure checks through **Advanced > Verification commands** or the corresponding
JSON fields:

```json
{
  "verification": {
    "commands": [
      { "name": "unit tests", "command": "npm", "args": ["test"] }
    ],
    "requirePassing": true,
    "timeoutMs": 120000
  }
}
```

Pair runs these commands in the worker's Git root at code-review checkpoints.
They run with your permissions. Choose checks that leave source files unchanged.
If the workspace changes before or while a check runs, that check is recorded as
failed (`VERIFICATION_SOURCE_DRIFT`) and the rest are skipped; the report still
reaches Main. If files keep changing while the checkpoint is frozen, Pair retries a
few times and then holds the task without stopping the worker; resume once other
writers are done. With `requirePassing: true`, failed checks block approval.

An empty command list means **no independent checks ran**.

### Limits

| Setting | Enforced as |
| --- | --- |
| `limits.activeStepTimeoutMs` (30 min) | A running step that has not reported in this time is paused; the worker process is kept. |
| `limits.maxReportedCostUsd`, `limits.maxOutputTokens` | Reaching either pauses the task. Both default to `null` (no budget). |
| `limits.maxReportsPerTask` (40) | Automatic deliveries per task; later reports wait for `/pair inbox`. |
| `limits.maxReportBytes` (16384) | Upper bound on one report; the summary-detail policy may set a lower one. |
| `limits.maxAutomaticReportRepairs` (1) | Rejected `pair_report` attempts the worker may fix and resubmit per step; past that it stops and the task is held. |
| `supervision.maxRevisions` / `maxRevisionsPerStep` (20 / 3) | Revisions per task and per step. The per-step limit stops one step from looping; the task limit bounds the whole plan. |
| `supervision.maxStepFiles` (5) | `every-step` only: files one step may change and still be approved. |

`limits.maxQueuedTasks`, `maxQueuedReviews` and `maxAutomaticRecoveryAttempts` are
deprecated: Pair runs one assignment at a time and never recovers automatically.
They are still accepted in older files and backups, then ignored.

### Worker extensions

With `runtime.inheritExtensions: true` (default) the worker loads Main's extensions.
Some start turns on their own (retries, queued messages). In a worker such a turn
has no Pair lease: Pair aborts it and keeps the worker, and a tool call the Pair
gate blocked is harmless; only a tool that actually ran without a lease stops the
worker. `/pair doctor` lists inherited extensions that can start turns; leave out
the ones the worker does not need with `runtime.excludeExtensions` (package names
such as `"pi-retry"`, or absolute paths). Keep provider extensions your worker
model needs.

## Context, warming and cost

Main and Worker keep their own Pi conversations and use native context management.
Pair restores a small task-state packet after compaction without requesting an
extra model turn.

The status line's **cache** reading (`cache M 99% W 100%`) and `/pair status`
show the last measured request for each role:

```text
cache-read share = cacheRead / (input + cacheRead + cacheWrite)
```

Zero-input report/abort events preserve the previous sample and its timestamp,
and worker compaction or model changes keep the historical sample with its
original timestamp; only a new worker session starts from unknown. A measured miss
appears as `0%` (`0.0%` in `/pair status`). The status line rounds down to a whole
percent, so a near miss never shows as 100%. Unknown samples are hidden in the
status line and remain explicit in `/pair status`. Shares are shown as percentages only — the underlying
timestamps stay validated and retained internally for staleness handling and are
never displayed as an age, cache-lifetime estimate or prediction of the next hit.

Optional `cacheWarming: "active"` is a JSON-only Pair setting, **off by default**.
After explicit acceptance of refresh costs, it can request native session-scoped
idle warming during eligible work and review waits. It needs the proposed
`ctx.acquireCacheWarming("idle")` capability and a separately deployed compatible
native SDK. Older SDKs report unsupported and make no fallback requests.

Pair leaves persisted native warming settings untouched. Native eligibility,
economics, and safety windows remain authoritative; holding a lease does not prove
a refresh occurred or guarantee a cache hit. The native counterpart and live
deployment remain separate from this Pair implementation.

Pair's reported inference budgets exclude Main usage, native warming, external
tools, and unknown prices. Use provider-side controls for an overall spending cap.

## Current limits

This version is for supervised experimentation. Its workflow controls cover
bounded assignments, evidence, and review; OS and tool permissions still govern
what processes can do.

- **One live worker and one unresolved assignment.** Additional configured slots
  are for sequential use. Increasing `maxWorkers` does not enable parallel work.
  `pair_dispatch` and `pair_decide` return once the assignment or decision is
  durable; the worker starts in the background, and a failure is reported to you
  and to Main.
- **One writer per repository.** A repository lock stops a second Pair session
  (another Main session or process) from dispatching into a repository while a
  task there is unresolved. Unattended operation is not qualified.
- **The supported worker is a writer.** Read-only workers with generic Fabric,
  background/monitored shell jobs, and recursive workers are rejected.
- **Uncertain state stays held.** After Main crashes, Pair proves the old worker
  process exited when it starts again; if it cannot, `/pair reconcile` resolves it.
  Missing or corrupt histories need explicit reconciliation. Pair does not silently
  replace a lost conversation. Retained worker sessions of any size are verified
  incrementally.
- **Approval covers captured source.** It does not certify databases, external
  services, ignored files, or arbitrary shell side effects. Pair does not create
  branches, merge, commit, push, or deploy on your behalf.

A bounded integration run exercised actual **Pi 0.87.1, Fabric 0.96.3,
Fovea 0.31.1, and Node 24 on macOS**, using a deterministic local model. It covered
the question/review/revision loop, retained sessions, rejection of stale or
duplicate decisions, cancellation, and confirmed stop. It did not qualify paid
providers, the interactive Main TUI, or other platforms. See
[compatibility](COMPATIBILITY.md) and
[security boundaries](SECURITY.md). That run predates the report-delivery,
phase/branch-fencing, retained-scope, reconciliation, repository-lock and
background-activation behavior described above: those are covered by offline
tests with fakes of Pi and the worker RPC, and have **not** been natively qualified.
Pair is verified against Pi `>=0.87.1 <0.88.0` and warns on other versions. The Pair package loaded into a running session
may differ from this checkout's source.

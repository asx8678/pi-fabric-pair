# Pair reference

Detailed controls, configuration, review policies, and cache behavior.
For first use, follow the [quickstart](QUICKSTART.md).

## Review policies

| Review policy | When Main reviews |
| --- | --- |
| `every-step` | After each small step in the dispatched plan. Use this for first runs. |
| `milestones` | After each planned milestone. This is the configuration default. |
| `final-only` | After the full assigned plan; questions and blockers can still return earlier. |

Final review is required in every policy.

## Commands

Commands with an optional worker ID use the first configured worker by default.
`/pair stop` without an ID stops all owned workers.

| Command | Purpose |
| --- | --- |
| `/pair` | Open the dashboard menu. |
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
| `/pair yield` | Explicitly deliver retained, unacknowledged reports to Main. |
| `/pair pause [worker]` | Abort current work and hold the assignment. |
| `/pair resume [worker]` | Confirm continuation after inspecting interrupted work. |
| `/pair cancel [worker] [reason]` | Cancel the assignment and retain the conversation. |
| `/pair stop [worker\|all]` | Stop owned worker processes and retain their history. |
| `/pair reset-worker [worker]` | Explicitly confirm a fresh conversation; archive the old state. |
| `/pair indicator off` / `minimal` | Hide or show Pair's widget. |

Cancellation and stopping do not undo files already written. Normal Main shutdown
also stops owned workers.

Worker restart keeps Main's session, model and controller running. It waits for
the old worker's confirmed exit before opening the same conversation in a new
process. An interrupted assignment keeps its progress, budgets and evidence;
inspect its changes and use `/pair resume [worker]` to continue. Restart requests
no model turn. A later stop or Main shutdown cancels a pending restart.

Restart also reloads the worker's native configuration and extensions through
normal process startup. Pair settings can be reread separately with `/pair reload`;
this does not reload Main's extensions or native settings. Both controls are
available in the `/pair` dashboard.

## Report delivery, phases and branches

Finalized worker reports are never pushed into Main's conversation automatically
and never wake an idle Main. They wait in Pair's durable inbox and are retrieved
explicitly.

- **`pair_yield`** returns every unacknowledged report — pending, offered
  (including legacy `delivered` receipts) or failed — as compact summaries in
  the tool result, preserving the exact question text, step identity, completion
  semantics and worker decisions. Repeat reads return the same stable report
  IDs; reading consumes nothing.
- **Acknowledgment is explicit.** An offer is only a delivery attempt. A report
  stops waiting when `pair_inspect` reads it (`observedAt`) or `pair_decide`
  resolves it. `sendMessage` channels are fire-and-forget and are never treated
  as confirmed delivery.
- **One settlement-boundary delivery per empty yield.** A `pair_yield` that
  returned no reports arms the current run's settlement boundary: one report
  finalizing before that run settles is injected once as a boundary entry
  (public `agent_before_settle` entries/continue). A yield that already returned
  results consumes that permission. Pending user input, non-Pair tool work, new
  runs, branch navigation, and pending-input state that cannot be confidently
  observed all defer or revoke the offer; dropped offers stay retrievable.
  `canContinue` is deliberately not pre-gated — native validates it after
  committing the draft.
- **Automatic delivery (`autoDeliverReports`, default `true`).** Each finalized
  report is also sent to an idle Main as a follow-up message that starts a
  turn. If Main is running, delivery waits for Main's `agent_settled`, so it
  never interrupts Main. Only never-offered reports are sent (a `pair_yield` or
  armed-yield delivery that got there first wins), and at most
  `limits.maxReportsPerTask` (default 40) per task; after that, reports wait
  for `/pair inbox`. Main inspects it and approves, answers or revises; a
  revise sends the fixes back to the worker, bounded by the revision limit. The
  notice records `channel: "auto"`.
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
    to review. Unknown or unconfirmed exits still require offline
    reconciliation — never reset, history deletion or lock removal.

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
They run with your permissions. Choose checks that leave source files unchanged:
a check that modifies the workspace requires a fresh report. With
`requirePassing: true`, failed checks block approval.

An empty command list means **no independent checks ran**.

## Context, warming and cost

Main and Worker keep their own Pi conversations and use native context management.
Pair restores a small task-state packet after compaction without requesting an
extra model turn.

The widget's **Cache read (last)** row shows the last measured request for each
role:

```text
cache-read share = cacheRead / (input + cacheRead + cacheWrite)
```

Zero-input report/abort events preserve the previous sample and its timestamp,
and worker compaction or model changes keep the historical sample with its
original timestamp; only a new worker session starts from unknown. A measured miss
appears as `0.0%`; unknown samples are hidden in the widget and
remain explicit in status. Shares are shown as percentages only — the underlying
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
- **One controller and writer per workspace.** Cross-controller exclusion,
  unattended operation, and automatic crash recovery are not qualified.
- **The supported worker is a writer.** Read-only workers with generic Fabric,
  background/monitored shell jobs, and recursive workers are rejected.
- **Uncertain state stays held.** Unknown exits or missing/corrupt histories need
  explicit reconciliation. Pair does not silently replace a lost conversation.
- **Approval covers captured source.** It does not certify databases, external
  services, ignored files, or arbitrary shell side effects. Pair does not create
  branches, merge, commit, push, or deploy on your behalf.
- **Some retained settings are future-facing.** Queue, report, repair, recovery,
  active-step, and per-step migration fields are preserved; their presence is not
  a claim that all associated limits are enforced.

A bounded integration run exercised actual **Pi 0.87.1, Fabric 0.96.3,
Fovea 0.31.1, and Node 24 on macOS**, using a deterministic local model. It covered
the question/review/revision loop, retained sessions, rejection of stale or
duplicate decisions, cancellation, and confirmed stop. It did not qualify paid
providers, the interactive Main TUI, or other platforms. See
[compatibility](COMPATIBILITY.md) and
[security boundaries](SECURITY.md). That run predates the report-delivery,
phase/branch-fencing and retained-scope behavior described above: those have
**not** been natively qualified. The Pair package loaded into a running session
may differ from this checkout's source.

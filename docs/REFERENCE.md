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
| `/pair status` | Inspect task state, sessions, usage, and warming diagnostics. |
| `/pair doctor` | Check configuration and extension registrations. |
| `/pair transcript [worker]` | Read the recent worker conversation. |
| `/pair inbox` | Inspect unresolved reports and recovery delivery options. |
| `/pair pause [worker]` | Abort current work and hold the assignment. |
| `/pair resume [worker]` | Confirm continuation after inspecting interrupted work. |
| `/pair cancel [worker] [reason]` | Cancel the assignment and retain the conversation. |
| `/pair stop [worker\|all]` | Stop owned worker processes and retain their history. |
| `/pair reset-worker [worker]` | Explicitly confirm a fresh conversation; archive the old state. |
| `/pair indicator off` / `minimal` | Hide or show Pair's widget. |

Cancellation and stopping do not undo files already written. Normal Main shutdown
also stops owned workers.

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
`/pair start` to apply them after a confirmed worker exit, keeping the conversation
without replaying work. Workspace changes require an explicit reset. Project
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

Zero-input report/abort events preserve the previous sample and its timestamp.
A measured miss appears as `0.0%`; unknown samples are hidden in the widget and
remain explicit in status. Observation age describes a past request, not provider
cache lifetime or a prediction of the next hit.

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
[compatibility](COMPATIBILITY.md), [testing scope](TESTING.md), and
[security boundaries](SECURITY.md).

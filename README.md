# pi-fabric-pair

**Keep your Main conversation. Give implementation a persistent worker. Review each handoff.**

![Main and Worker steam engines with four massive pistons compressing glowing steam, dark silhouettes, and illustrative last-request cache-read gauges showing 99% and 100%.](docs/assets/pi-fabric-pair-cache-pressure.png)

*Illustrative readings: each role has its own history and active context. The
gauges show cache-read share from a past request, not current cache fullness.*

Pi Fabric Pair is a standalone [Pi](https://github.com/earendil-works/pi) extension
for working with a dedicated coding partner. You plan and discuss in Main.
A separate Pi worker implements the assigned work, brings back questions and code
checkpoints, and keeps its conversation across revisions and completed tasks.

Both sides use your existing [Fabric](https://github.com/monotykamary/pi-fabric)
and [Fovea](https://github.com/monotykamary/pi-fovea) setup. Main keeps its model.
You choose the worker's provider, model, and effort separately.

[Get started](#get-started) | [Workflow](#how-it-works) | [Commands](#commands) | [Configuration](#configuration) | [Current limits](#current-limits)

> **Experimental supervised MVP, v0.1.0.** The supported starting profile is one
> Main, one writer, and one unresolved assignment in a disposable Git workspace.
> Begin with manual startup and every-step review.

## What you get

- **A worker that remembers the job.** Questions, revisions, and subsequent tasks
  use the retained worker conversation. Completing a task leaves it ready for the
  next dispatch.
- **Main stays available.** Dispatch returns immediately. Reports arrive in your
  existing Main conversation, so you can keep discussing the work.
- **Review tied to actual code.** Pair captures immutable workspace evidence.
  Approval requires an inspected checkpoint and its exact hash; later source
  changes invalidate that approval.
- **Checks you control.** Configure project verification commands and require
  them to pass at review checkpoints. Worker claims and independently run checks
  are shown separately.
- **Visible progress.** The widget shows activity, plan steps, review progress,
  time and turn budgets, and the last measured cache-read share.
- **A small extension surface.** JavaScript runtime, no runtime npm dependencies,
  no upstream fork, and no native build required.

## How it works

```text
You <--> Main -- bounded plan step --> Worker
          ^                             |
          |                        implement / ask
          |                             v
          +-- report + frozen evidence -+
          |
          +-- answer or revise ------> same Worker
          +-- approve ---------------> next step or done
```

Main owns the plan and review. The worker receives the constraints and context
Main includes in the assignment; it has its own conversation and does not inherit
Main's private chat automatically.

1. **Dispatch.** Main sends a bounded plan through `pair_dispatch`. Pair
   authorizes the current step and starts the worker.
2. **Report.** The worker calls `pair_report` with a question, blocker, checkpoint,
   or final-review request. It yields control.
3. **Inspect.** Pair waits for the worker to settle, runs configured checks, and
   captures the workspace evidence. Main reads it with `pair_inspect`.
4. **Decide.** Main uses `pair_decide` to answer, request a revision, or approve.
   The same worker continues. Final approval completes the task and retains the
   conversation.

Reports are delivered automatically. `/pair inbox` exposes retained reports when
you need to inspect them.

**Review gates control Main's decisions.** They do not automatically ask the human
to approve every step. If you want that involvement, tell Main explicitly.

| Review policy | When Main reviews |
| --- | --- |
| `every-step` | After each small step in the dispatched plan. Use this for first runs. |
| `milestones` | After each planned milestone. This is the configuration default. |
| `final-only` | After the full assigned plan; questions and blockers can still return earlier. |

Final review is required in every policy.

## Get started

### 1. Load the extension

You need **Node.js 24+**, Git, and a working Pi installation with Fabric and Fovea.
Configure provider access in Pi first. Pair uses that profile and stores model
identifiers, without copying authentication files.

```sh
git clone https://github.com/asx8678/pi-fabric-pair.git
cd pi-fabric-pair
pi install "$PWD"
```

For a single invocation, load the entry file from your implementation project:

```sh
cd /path/to/disposable/git/project
pi -e /absolute/path/to/pi-fabric-pair/src/extension.js
```

Use one loading method. The extension runs directly from source; installing its
development dependencies or compiling TypeScript is unnecessary for normal use.
Keep Pair state outside the implementation Git working tree. Its default location
under `~/.pi/agent` does this.

### 2. Set the worker's Fabric profile

Merge these fields into the worker's effective `fabric.json`, preserving your
other settings:

```json
{
  "prewalk": { "enabled": false },
  "executor": { "shellHangMs": 0 },
  "agents": { "maxDepth": 0 }
}
```

| Location | How it applies |
| --- | --- |
| `~/.pi/agent/fabric.json` | Global defaults; use `<PI_CODING_AGENT_DIR>/fabric.json` if you override the agent directory. |
| `<worker-workspace>/.pi/fabric.json` | Overrides global fields when the worker trusts that project. |

These settings disable Prewalk delegation, automatic background shell spill, and
recursive agents for the supported Pair profile. If Main shares that profile, the
settings affect it too. Pair checks these values without editing them. Keep native
automatic compaction enabled.

### 3. Choose the worker and start

Open `/pair settings`:

| Setting | First-run value |
| --- | --- |
| Enabled for new work | On |
| Autostart | Off |
| Worker model | An authenticated provider/model from your Pi registry |
| Worker effort | A level supported by that model |
| Review policy | `every-step` |
| Final review | Required |

Valid edits save immediately. **Done** or Esc closes the menu; saved changes stay
saved. Main's model remains under Pi's `/model` command. Workspace, limits, and
verification commands are available under **Advanced**.

Then run:

```text
/pair start worker
/pair doctor
```

Startup checks the worker's session, model, extensions, and required profile.
Neither command requests a model turn. For separate workspaces, custom extension
paths, or startup blockers, see the [detailed quickstart](docs/QUICKSTART.md).

### 4. Give Main a small task

For example:

> Use Pair's configured worker to add an empty-state message to the task list.
> Dispatch one bounded step, inspect the returned diff and verification results,
> and ask me before approving it. Keep the existing styling.

Main receives Pair's tools and workflow instructions. Delegation happens through
its tool calls; natural-language requests are not automatically intercepted.

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

Start with the settings UI or [the complete example](fabric-pair.example.json).
Pair is disabled by default. Its `autoStart` default is `true`, so deliberately
switch it off for the manual first-run profile above.

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
[compatibility](docs/COMPATIBILITY.md), [testing scope](docs/TESTING.md), and
[security boundaries](docs/SECURITY.md).

## Development

Install the pinned development dependencies, then run the retained checks:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run typecheck
npm run pack:check
```

The offline suite covers controller transitions, settings, profiles, evidence,
cache observations, and scoped warming. The package dry run verifies what ships;
it does not qualify a live provider integration.

The public runtime uses `PairController`, `PiRuntime`, `PiRpc`, and the worker
bridge. The ActorHost/ActorStore redesign and native Store remain parked in the
checkout and are excluded from the package.

## Documentation

| Document | Start here for |
| --- | --- |
| [Quickstart](docs/QUICKSTART.md) | Setup details and the first supervised task. |
| [Configuration example](fabric-pair.example.json) | The complete V2 configuration shape. |
| [Compatibility](docs/COMPATIBILITY.md) | Inspected upstream versions and integration boundaries. |
| [Security](docs/SECURITY.md) | Permissions, evidence coverage, and stored information. |
| [Testing](docs/TESTING.md) | Reproducible checks and what they establish. |
| [Changelog](CHANGELOG.md) | Changes to the extension. |

[MIT license](LICENSE).

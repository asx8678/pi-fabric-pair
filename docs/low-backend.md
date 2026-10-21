# The low worker backend

Pair can run its worker on [low](https://github.com/asx8678/low) instead of a Pi RPC process. Main stays the same Pi +
Fabric + Fovea session; only the worker changes. Review gates, checkpoints, evidence and decisions work the same
way.

## Turn it on

Set the backend in `.pi/fabric-pair.json` (or the global file). The worker's provider and model are low's: a
provider name from `~/.config/low/providers.toml` and one of its models.

```json
{
  "runtime": { "backend": "low", "lowCommand": "low" },
  "requirements": { "fabric": false, "fovea": false, "prewalkDisabled": false, "autoCompaction": true },
  "workers": [{ "id": "worker", "provider": "opendesign", "model": "deepseek-v4.1-flash", "effort": "high", "cwd": null, "readOnly": false }]
}
```

| Setting | Meaning |
| --- | --- |
| `runtime.backend` | `"pi"` (the default) or `"low"`. |
| `runtime.lowCommand` | The low binary, `low` on `PATH` by default. |
| `runtime.lowArgs` | Arguments placed before Pair's own, e.g. `["--protect", "secrets"]`. |

The worker needs a low build that has `low --send "/steer <text>"` and `low --send /abort`, and for the live
view below, the status file (`low --send /status` prints it). Switching the backend
changes the runtime config, so it applies the next time the worker starts (`/pair stop`, then `/pair start`).

## How it works

- **Start.** Pair runs `low --serve -m <provider>:<model> --effort <effort>` in the worker's workspace and reads the
  session from its `[session …]` line. A restarted worker passes `--session <id>` and continues the same
  conversation.
- **A step.** Each work order (and each answer or revision from Main) is one `low --send --json` task in that
  session. low's JSON result becomes the worker's report, written to the same latch and inbox a Pi worker's
  `pair_report` uses, so the controller does not know which backend wrote it.
- **Report mapping.**

  | low result | Pair report |
  | --- | --- |
  | exit 0 (VERIFIED, NO CHECK, NO CHANGES) | `checkpoint`, or `final_review` on the last step or under `final-only`; `stepComplete: true` |
  | exit 1 (UNVERIFIED) | the same kind, `stepComplete: false`, with the `low verdict` check marked `fail` |
  | exit 4 (question) | `question` |
  | exit 3 (error) or 5 (stopped) | `blocked` |

  low's answer is the summary, shortened to fit the step's summary policy. Its changed files go into
  `changedFiles`. Its verdict is the `low verdict` check, which is the worker's claim like any other: Pair still
  captures its own checkpoint and runs its own verification commands.

  low's other evidence goes to Main as well:

  | low result | Pair report |
  | --- | --- |
  | `criteria` | decision `Done means: …` |
  | `claims` (the second look low takes when no check covers the report) | check `low second look`: `fail` if a claim is contradicted, `pass` if claims held, with the claims listed |
  | `steers.dropped` | a decision saying how many of Main's steers came after low's last request and were not taken |
  | `plan` | decision `low's plan (2/3 done): ✓ …; · …` |
  | `undo` | decision `Undo low's changes: git restore …` |

  When the report would not fit the summary policy, the plan and the undo line go first, then the claims' text
  (their counts stay), and only then is the answer shortened.
- **Steer and abort.** `/pair steer` and `pair_steer` send `low --send "/steer <text>"`; the steer goes with the
  task's next model request. While it waits it shows as pending in the progress below; one that came too late is
  named in the report. Cancelling, a budget stop or the watchdog sends `low --send /abort`, which stops the task as
  Ctrl-C would. An aborted task leaves no report.
- **Watching a running task.** low's server keeps `status.json` in its inbox, and Pair reads it every 2 seconds
  while a task runs:
  - its `moved` time (when low's activity, requests, runs or steers last changed) is the worker's last event, so
    the watchdog's silence rules see a stuck task even while the server is alive;
  - the run under way is the worker's tool, with its real start time;
  - each new run is added to the worker's recent activity (`activity.json`, as a Pi worker writes it);
  - `peek` (`pair_peek`) adds `progress`: the activity, step, run under way, what the model said it is after,
    the plan, requests, tokens and steers pending and taken. Its `lastAssistantText` and `/pair transcript` read
    low's session log.
  - The watchdog's ping checks that the server process is there and that the file's heartbeat (rewritten every
    second) is under 30 seconds old.

  A low without the status file still works: the session log's growth is then the worker's heartbeat.
- **Time limits.** low ends a `run()` after 10 minutes and the repository check after 30, while Pair's watchdog
  stops a tool after `control.toolMaxMs` (15 minutes by default). A repository whose low `check` takes longer than
  that needs a larger `toolMaxMs`.
  The heartbeat also pauses while an idle server re-sends the conversation to keep the prompt cache warm, so a
  task sent then waits for that request (and its retries) before low takes it.
- **Stop.** Pair sends `low --send /stop`, then signals the process group if low has not exited.

## Differences from the Pi worker

- No Fabric, Fovea or `pair_report` inside the worker. low uses its own `run(code)` tool and sandbox. Each work
  order ends with a short note telling the model to answer with its report instead of calling `pair_report`.
- The lease gate is structural: low only works while Pair has a task of it in flight. There is no authority file
  inside the worker that a tool call checks.
- A low worker cannot be read-only; Pair refuses `readOnly: true` with the low backend.
- Pair does not check the `requirements` (Fabric, Fovea, prewalk, compaction) for a low worker, but `/pair doctor`
  still reports them; setting them to `false` as above keeps its report about Main only.
- Usage comes from low's result once per task (prompt, cached and output tokens), not per request; the running
  totals are in `peek`'s progress.

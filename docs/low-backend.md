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

The backend is a per-worker setting, so the same project can run a Pi worker and a low worker:

```json
{
  "runtime": { "backend": "pi", "lowCommand": "low" },
  "workers": [
    { "id": "fast", "provider": "opendesign", "model": "deepseek-v4.1-flash", "effort": "high", "cwd": null, "readOnly": false },
    { "id": "cheap", "provider": "opencode-go", "model": "deepseek-v4.1-flash", "effort": "max", "cwd": null, "readOnly": false, "backend": "low", "lowArgs": ["--protect", "secrets"] }
  ]
}
```

| Setting | Meaning |
| --- | --- |
| `workers[].backend` | `"pi"` or `"low"` for this worker. Optional: without it the worker follows `runtime.backend`. |
| `workers[].lowCommand` | This worker's low binary. Optional: falls back to `runtime.lowCommand`. |
| `workers[].lowArgs` | This worker's arguments. Optional: falls back to `runtime.lowArgs`. |
| `runtime.backend` | The project default, `"pi"` unless you set it. |
| `runtime.lowCommand` | The default low binary, `low` on `PATH`. |
| `runtime.lowArgs` | Default arguments placed before Pair's own, e.g. `["--protect", "secrets"]`. |

The worker needs a low build that has `low --send "/steer <text>"` and `low --send /abort`, and for the live
view below, the status file (`low --send /status` prints it). A backend change is restart-bound for the worker that
changed: it applies the next time that worker starts (`/pair stop`, then `/pair start`), and the other workers are
not affected. Only one worker runs at a time, whichever backends they use (`/pair start <id>` stops an idle live
worker and starts the other). The Fabric, Fovea, Prewalk and compaction requirements apply to Pi workers only, so a low worker
starts in a project that configures them.

## How it works

- **Start.** Pair runs `low --serve -m <provider>:<model> --effort <effort>` in the worker's workspace and reads the
  session from its `[session …]` line. A restarted worker passes `--session <id>` and continues the same
  conversation.
- **A step.** Each work order (and each answer or revision from Main) is one `low --send --json` task in that
  session. low's JSON result becomes the worker's report, written to the same latch and inbox a Pi worker's
  `pair_report` uses, so the controller does not know which backend wrote it.
- **Later steps by title only.** Under step-by-step supervision a low worker's plan carries the authorized step in
  full and every other step as `{id, title, authorized}`. low has no `pair_report` to stop it at the end of a step,
  and given a later step's instructions it did that step in the same turn, leaving Main nothing to review per step.
  `final-only` keeps the whole plan, since every step is authorized there.
- **Report mapping.**

  | low result | Pair report |
  | --- | --- |
  | exit 0 (VERIFIED, NO CHECK, NO CHANGES) | `checkpoint`, or `final_review` on the last step or under `final-only`; `stepComplete: true` |
  | exit 1 (UNVERIFIED) | the same kind, `stepComplete: false`, with the `low verdict` check marked `fail` |
  | exit 4 (question) | `question` |
  | exit 3 (error) or 5 (stopped) | `blocked` |
  | exit 3 with a provider error (a rate limit, a quota stop) | no report: the run ends the way a Pi worker's does after a provider error, so Pair waits it out or switches to the worker's next `fallbacks` entry instead of asking Main |

  A fallback restarts `low --serve` on the fallback's model with the same `--session`, so low keeps its own
  conversation; one on the Pi backend starts a fresh Pi conversation with the whole plan. Both last for the task.

  low's answer is the summary, shortened to fit the step's summary policy. Its changed files go into
  `changedFiles`. Its verdict is the `low verdict` check, which is the worker's claim like any other: Pair still
  captures its own checkpoint and runs its own verification commands.

  low's other evidence goes to Main as well:

  | low result | Pair report |
  | --- | --- |
  | `criteria` | decision `Done means: …`, and an acceptance claim whose verdict is the step's outcome |
  | `claims` entries | acceptance claims: `held` met, `contradicted` and `uncertain` not met |
  | `claims` (the second look low takes when no check covers the report) | check `low second look`: `fail` if a claim is contradicted, `pass` if claims held, with the claims listed |
  | `steers.dropped` | a decision saying how many of Main's steers came after low's last request and were not taken |
  | `plan` | decision `low's plan (2/3 done): ✓ …; · …` |
  | `undo` | decision `Undo low's changes: git restore …` |

  When the report would not fit the summary policy, the plan and the undo line go first, then the claims' text
  (their counts stay), and only then is the answer shortened.
- **A step's own effort.** low takes `--effort` when its server starts and refuses any option but `--send`, `--session` and `--json` on a task, so a low worker serves one effort for its whole session. A step that declares a different `effort` is refused at dispatch with that reason; pass the level to the worker instead, or run the step on a Pi worker, which can change effort per step.
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
- **Stop.** Pair sends `low --send /stop`, then signals the process group if low has not exited. The
  `/stop` send is best effort — Pair does not wait on it, and falls back to the process group when it fails or
  races the server's exit — so a stopped worker is confirmed by a proven, expected exit rather than by low
  having answered `/stop`. Pair's own tests wait on that exit; a `/stop` line in low's transcript is a
  convenience, not a guarantee.

## What low has no gate for

A Pi worker enforces the lease inside the process: `pair_report` refuses outside a lease, tools are gated, and a
stray turn is aborted. low has no extension API, so that gate does not exist and three things are protected on
Pair's side only. They are checked in `test/low-publish-fence.test.js`, `test/low-runtime.test.js` and
`test/low-watchdog.test.js`.

- **Work outside a lease.** low only works while Pair has sent a task, and every task is sent under an authority
  file Pair wrote for that exact lease. A result that arrives after the lease was revoked or superseded is
  discarded: `LowRuntime#finish` publishes only when the activation is still current, and the payload it would
  write is stamped with the authority's task, lease and attempt. The write itself is fenced the way Pi's is: the
  latch first, then the activation is re-checked, then the inbox — so a lease revoked while the report was being
  written (`/pair cancel`, a stop, a new dispatch) leaves the latch on disk and the inbox untouched, and nothing a
  later task could mistake for its own appears. The controller keeps its own rule too — a report is accepted only
  for the current task, attempt and lease — so a stray low process cannot report into a later step even if it
  kept running.
- **A steer outside a lease.** `steerCurrent` and `steer` require the *current, accepted, unsettled* activation and
  match its task, attempt, lease and worker generation before anything is sent. A steer for a previous attempt, a
  settled run or a task that was cancelled is refused with `STEER_REFUSED` rather than silently queued into
  whatever low is doing.
- **A blocked command.** A Pi worker refuses the destructive commands `control.blockedCommands` names, inside its
  own process, before the command runs. low has no hook that sees a command: `run()` executes its own code in its
  own sandbox, and low's only command-adjacent option is `--protect <PATH>`, which keeps a **path** from being
  changed. It is not a command pattern list, so Pair does not pass `blockedCommands` to low and does not pretend
  it does. **low's sandbox is the only guard for shell work in a low worker.** A step that must not run
  `git push`, `npm publish` or `sudo` should run on a Pi worker.
- **A tool call.** There is no in-worker gate at all. low's `run()` executes in its own sandbox, and the lease is
  what bounds it in time: Pair's watchdog stops a run past `toolMaxMs`, and an abort or a stop sends low
  `/abort`/`/stop` and then signals the process group. Pair does not inspect what the code inside `run()` does.
  If you need that, run the worker on Pi.

## Proving a crash

The watchdog's crash rung, its settle-timeout rung and Main's `pair_recover` all ask the same question before they
act: is the previous worker process *provably* gone? Pair answers it in `exitProof`, and there are three ways to
answer yes, in order of strength:

1. **The runtime reaped the exit.** When the process Pair spawned ends, the operating system tells Pair, and the
   runtime records the exit code or signal. That is proof whatever the PID number means afterwards, and it is what
   the crash test asserts (`exit code 9` for the fake host's crash).
2. **The PID is dead or foreign, and its process group is not alive.** Nothing is left to run.
3. **The PID is alive but belongs to a newer process.** A number is free the instant its owner dies, so an
   unrelated process can take it; the start time is what tells them apart. That start time comes from
   `ps -o etime=`, not `ps -o lstart=`: `lstart` prints a local-time string that `Date.parse` reads in the
   reader's zone, so it is an hour wrong on a host whose zone differs from the one the string was rendered in —
   and an hour is exactly the scale that silently defeats the check.

Anything else is unconfirmed, and every recovery path treats unconfirmed as "no": the task is held, the human is
told to reconcile, and nothing restarts. The one thing that is deliberately *not* automatic is an orphaned process
group after a proven exit: `exitProof` says so in its reason and the human stops it.

One limitation is deliberate: **a low worker's context is not compacted by Pair.** low manages its own context
inside a session, and Pair sees only token counts in `status.json`. Pair's compaction window
(`control.compactionMaxMs`) and its maintenance compaction apply to Pi workers only; for low, `/pair reset-worker`
is the lever.

## Differences from the Pi worker

- No Fabric, Fovea or `pair_report` inside the worker. low uses its own `run(code)` tool and sandbox. Each work
  order ends with a short note telling the model to answer with its report instead of calling `pair_report`.
- The lease gate is structural: low only works while Pair has a task of it in flight. There is no authority file
  inside the worker that a tool call checks.
- A low worker cannot be read-only; Pair refuses `readOnly: true` with the low backend. The refusal is in config
  validation, so such a file never loads or saves — not only a refused start — and it applies to a worker that only
  inherits the backend from `runtime.backend` as well as to one that sets `backend: "low"` itself. Edit as JSON is
  refused the same way.
- Pair does not check the `requirements` (Fabric, Fovea, prewalk, compaction) for a low worker, but `/pair doctor`
  still reports them; setting them to `false` as above keeps its report about Main only.
- Usage comes from low's result once per task (prompt, cached and output tokens), not per request; the running
  totals are in `peek`'s progress.

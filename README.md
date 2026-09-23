# Fabric Pair

**A standalone Pi extension for a persistent Main/Worker coding workflow.**

Keep your normal Main model and conversation. Delegate implementation to retained
Pi RPC worker conversations. Receive questions and code checkpoints back in Main,
review the actual evidence, and approve or revise the next step.

This package does **not** modify Pi, Fabric, Fovea, the Fabric TUI, or either native
Prewalk mode. It has **no runtime npm dependencies** and loads directly as a
JavaScript Pi extension. No build step is required.

## Release status

Version **0.1.0**, source release. The implementation and offline tests are included.
The tests run actual child processes and the actual Pair worker bridge, but their
Pi/Fabric/Fovea host is a **protocol fixture**, not the real upstream applications.
No live provider calls or full-stack runtime certification were performed in the
build environment. Validate the small live workflow described in
[Testing](docs/TESTING.md) before using valuable repositories or unattended work.

The source contracts inspected for this release are Pi **0.87.1**, Fabric
**0.93.0**, and Fovea **0.29.2**. These are inspection targets, not a claim that
every combination of those packages and providers has passed integration tests.
See [Compatibility](docs/COMPATIBILITY.md).

## What is implemented

- Persistent Pi RPC subprocesses. Ending a task does not stop the worker, replace
  its conversation, switch Main's model, or request compaction.
- Automatic startup after a worker model has been configured; one live worker by
  default, up to eight explicitly configured slots.
- Work orders, questions, blockers, checkpoints, final review, approve/revise,
  cancellation, pause, explicit recovery, and duplicate-decision protection.
- Durable controller state outside model context; nonce/session/task/lease-bound
  reports; no automatic replay after an uncertain failure.
- Immutable Git-worktree evidence, hash-bound approvals, and human-configured
  verification commands. A worker saying “tests passed” is not independently
  verified evidence.
- Separate `/pair` settings/status dialogs and an optional tiny `M● W◐` widget.
  `/model` still belongs to Pi. Fabric's own UI is unchanged.
- Worker provider/model/effort, review policy, report detail, budgets, worker
  workspaces, and read-only configuration.
- Fabric/Fovea registration checks and native Pi/Fabric context-management reuse.
  Pair does not implement a second compactor or cache warmer.
- Local usage observations, real-event activity states, human permission-dialog
  forwarding, and conservative tool gates, including Fabric's replayed nested
  calls. These are workflow controls, **not an OS sandbox**.

## Requirements

Use Node **24 or newer**, Git, a compatible Pi installation, and your normal
installed Fabric and Fovea extensions. Pi must be available as `pi` on PATH unless
`runtime.command` is configured otherwise. Configure model access in Pi itself;
Pair stores model identifiers, never copies your provider credentials.

Implementation work must run in a Git working tree. The Pair state directory
must be **outside that working tree**. Default storage is under your Pi agent
configuration directory, ordinarily `~/.pi/agent`.

## Install

Extract the ZIP into its own folder, for example:

```text
~/src/
├── pi-fabric-pair/       # this package; editable
├── pi-fabric/            # optional read-only reference checkout
└── pi-fovea/             # optional read-only reference checkout
```

Inspect the source, then either install the local package:

```bash
pi install /absolute/path/to/pi-fabric-pair
```

or load it for one invocation:

```bash
cd /path/to/your/git/project
pi -e /absolute/path/to/pi-fabric-pair
```

Do not load two separate copies of Pair into one Main host. Pi's normal resource
deduplication should handle an installed path also passed with `-e`, but using
only one loading method is easier to diagnose.

No `npm install` or TypeScript compilation is necessary for this package.
Upstream Fabric/Fovea must already be installed and usable in your Pi profile.
The ZIP does not bundle or modify those projects.

### One-time setup

1. Use native `/model` to choose Main. Pair never selects it for you.
2. Disable native Prewalk for Pair work with `/fabric prewalk --disable`.
   Pair checks this persisted configuration and refuses conflicting delegation;
   it does not silently edit Fabric settings. Re-enable Prewalk yourself when
   returning to that independent workflow.
3. Open `/pair settings`. Select the worker provider/model and supported effort.
   Choose `milestones` to begin; keep final review required.
4. Apply. With autostart enabled, Pair starts the worker and checks its session,
   model, Fabric/Fovea registrations, and native compaction switch.
5. Use `/pair doctor`, then try a small, disposable task.

After setup, start `pi` normally. The configured worker starts automatically
without a model prompt solely to announce readiness. Ask Main to plan and delegate
an implementation. Main receives the collaboration instructions and tools.
Actual delegation remains an LLM tool-use decision: the extension does not
silently intercept every natural-language request or replace Prewalk.

## Everyday controls

| Command | Behavior |
|---|---|
| `/pair` | Own menu: settings, status, transcript, start, pause, stop. |
| `/pair settings` | Main model is displayed; worker and collaboration settings are editable. |
| `/pair status` | Session identities, PID, task state, context and observed cache usage. |
| `/pair doctor` | Registration/configuration checks; no task inference requested. |
| `/pair start [worker]` | Start or reconnect the configured worker without resetting it. |
| `/pair pause [worker]` | Revoke the implementation lease and abort current work; keep the conversation. |
| `/pair resume [worker]` | Human-confirmed recovery; inspect existing changes before continuing. |
| `/pair cancel [worker] [reason]` | Cancel the task, not the conversation. No rollback of files. |
| `/pair stop [worker\|all]` | Stop owned worker processes; retain histories and evidence. |
| `/pair transcript [worker]` | Read-only recent worker transcript. No arbitrary control-message injection. |
| `/pair inbox` | Inspect unresolved reports and explicitly redeliver after recovery. |
| `/pair reset-worker [worker]` | Confirm a new conversation; old state/history remains archived. |
| `/pair indicator off` | Remove only Pair's widget. |
| `/pair indicator minimal` | Show the compact widget again. |

For commands taking a worker ID, the default is the first configured worker.
`/pair stop` without an ID stops all currently owned workers.

### Minimal indicator

```text
M● W◉
```

`●` ready, `◉` working/starting, `◐` waiting, `○` stopped/not started, `!` attention.
For several configured workers, the labels become `W1`, `W2`, etc.

The indicator does **not** assert that models are resident in GPU memory or that
provider caches are guaranteed hot. There is no animation timer, model heartbeat,
or prompt injection for displaying it. Personal indicator changes are stored in
`fabric-pair-ui.json` outside the implementation repository so they do not stale a
review checkpoint.

## How a task runs

Main provides a complete bounded plan, relevant user constraints, and acceptance
criteria through `pair_dispatch`. The controller authorizes one step and returns
an acknowledgement immediately. Main stays available for your messages.

The worker implements that step, then calls `pair_report` with a question,
checkpoint, blocker, or final-review request. It yields its lease. The controller
waits for Pi's settled boundary, runs any user-configured checks, and freezes the
actual workspace evidence. It then queues a report in **the same Main session**.

Main retrieves evidence with `pair_inspect`, reviews it, then calls `pair_decide`.
An approval must name the exact checkpoint hash, and the current workspace must
still match it. A valid approval authorizes the next step or accepts completion;
a revision or answer resumes the same worker conversation.

Captured tools are normally available through Fabric as `extensions.pair_*`.
Discover the actual catalog and use `tools.call({ref,args})`; do not assume a
synthetic global `pair` API exists. The bundled skill contains exact examples.

### Review policies

- **Milestones:** every dispatched plan milestone requires review. Recommended.
- **Strict:** the same enforced gate, with Main instructed to plan smaller steps.
  This is not semantic proof that every individual edit stayed in scope.
- **Adaptive:** milestone gates plus early risk/uncertainty reports. Extra
  `stepComplete:false` checkpoints do not advance the plan.
- **Final:** all listed steps are authorized in one assignment; questions and
  blockers are still allowed; final acceptance is still mandatory.

The controller enforces valid transitions and withholding the next lease. It
cannot prove code quality, prevent every side effect of an already-running shell
command, or turn two agreeing models into a correctness proof.

## Configuration

Behavior settings are merged from:

```text
<PI_CODING_AGENT_DIR>/fabric-pair.json
<trusted-project>/.pi/fabric-pair.json
```

Project settings load only when Pi says that project is trusted. The default
agent directory is `~/.pi/agent`. Personal cosmetic preferences in
`<PI_CODING_AGENT_DIR>/fabric-pair-ui.json` override only the indicator.

Start with the UI or [the complete example](fabric-pair.example.json). Replace the
placeholder model/provider with identifiers actually shown by your Pi registry.
Do not copy authentication files into Pair configuration.

Changes to an active worker's model, effort, role, or workspace are not applied
mid-task. Complete or cancel first. Workspace changes require an explicit reset;
old session files remain available. Policy/budget changes normally apply to new
tasks; explicit human resume adopts current policy/limits but does not erase
already recorded usage or revisions.

`enabled:false` stops new dispatches and future autostart. It does not secretly
kill an already-running task. Use `/pair pause`, `/pair cancel`, or `/pair stop`
for that explicit lifecycle action.

### Resource loading

Default `runtime.inheritExtensions:true` keeps native worker discovery enabled
and forwards known Main extension source paths. This covers globally installed
extensions and extensions explicitly loaded into Main. Command/skill paths are
not mistaken for extension modules.

For a narrower test stack, set `inheritExtensions:false` and provide absolute
Fabric/Fovea extension paths in `runtime.extraExtensions`. Pair then disables
automatic extension discovery and does not forward arbitrary Main sources. Pair's
own worker entry is always included. Use `runtime.extraSkills` for resources not
found by normal Pi discovery. Native authentication/configuration remains in the
inherited Pi agent profile.

A registration check is not a proof of graph coverage, language support, provider
quota, or successful inference. Confirm Fovea's actual output in your live task.

### Verification commands

Only the human configuration can add automatically executed verification argv:

```json
{
  "verification": {
    "commands": [{ "name": "unit tests", "command": "npm", "args": ["test"] }],
    "requirePassing": true,
    "timeoutMs": 120000
  }
}
```

These commands run at code-review checkpoints in that worker's Git root. They
have your OS permissions. They are passed as argv with `shell:false`, but the
program itself can still run scripts or have side effects. Prefer deterministic,
read-only checks; commands that format files deliberately change the checkpoint.
Cancellation can abort controller-owned checks.

With no configured commands, Pair reports no independently run checks. It does
not label worker claims as verified or claim that an empty list means tests ran.

## Multiple workers

Default maximum: one. Configure explicit worker IDs, models, roles, and workspaces
before raising the live-worker limit.

Read-only workers may share a repository. An active writer must not overlap
another active worker's repository, even when that other worker is awaiting
review. Use separate Git worktrees for parallel implementation. Pair does not
create branches, merge changes, commit, push, or deploy for you.

Each worker retains its own process and conversation; reports are tagged and
reviewed by one Main session. Starting extra workers does not make Main generate
concurrently in multiple hidden copies. More workers also means additional
context, memory, and potential provider usage.

## Context, warming and cost

Both sides run normal Pi/Fabric/Fovea. Native automatic compaction must be enabled
by default readiness policy. Pair never replaces `session_before_compact` with
its own summary engine. It restores only a bounded task-state packet after native
compaction, without launching a turn merely for restoration.

Native cache warming is **not changed** by Pair. For eligible providers, configure
Pi's own `cacheWarming` policy deliberately; an `idle` setting can incur refresh
usage between tasks. Compaction and provider expiry can reduce cache reuse while
the conversation remains intact.

Pair's cache ratio uses Pi's separated usage fields:

```text
cacheRead / (input + cacheRead + cacheWrite)
```

The UI says **last observed** and includes age. Unknown data remains unknown.
Worker cost counters and caps cover reported task inference only. They exclude
Main inference, native warming, external tool billing, and unknown prices. All
cost/output/turn/time caps are soft runtime stops, not a provider-side hard spend
limit; a response or command already running can overshoot.

## State and recovery

State is stored under `<agentDir>/fabric-pair/sessions/<workspace+Main hash>/`.
It contains controller metadata, worker session files, report outboxes, immutable
local source blobs/diffs, and verification logs. Files are private by default.
Raw code and logs can contain sensitive data: see [Security](docs/SECURITY.md).

Normal task completion keeps the worker open. Main shutdown stops owned children
and retains their files. Resuming the same Main session reopens the appropriate
worker conversation. A crash creates an attention-needed task, not an automatic
retry. A missing session file is an error, never a blank replacement.

Message delivery across a crash is not exactly once. Reports have durable IDs;
use `/pair inbox` after recovery. Duplicate decisions cannot repeat a step.

## Develop and test

```bash
cd /path/to/pi-fabric-pair
npm test
npm run check
npm run pack:check
```

No downloads or model credentials are needed for these commands. The source ZIP
contains development tests; the smaller npm manifest omits them.

For an opt-in check of your own installed stack:

```bash
npm run test:live -- --cwd /path/to/disposable/git/repository \
  --config /absolute/path/to/your/fabric-pair.json
```

This requests startup/identity checks, not model inference. It forwards permission
prompts to a terminal and cancels them in noninteractive mode. Existing third-party
extensions still run their own startup hooks. Full instructions and the bounded
live acceptance checklist are in [Testing](docs/TESTING.md).

## Deliberate boundaries

No background daemon, permanent-cache promise, shared model cache, built-in web UI,
automatic merge, arbitrary direct worker chat, recursive worker spawning, custom
compactor, or fork of upstream TUI is included. The transcript viewer is read-only;
use the review protocol to issue work and decisions.

Linux subprocess behavior is exercised by the supplied test run. macOS and Windows
terminal/runtime compatibility remain to be tested locally. On Windows, configure
an actual executable (or `node` plus the appropriate CLI path) rather than relying
on a shell-only command shim.

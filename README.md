# Fabric Pair

**A standalone Pi extension for a persistent Main/Worker coding workflow.**

Keep your normal Main model and conversation. Delegate implementation to retained
Pi RPC worker conversations. Receive questions and code checkpoints back in Main,
review the actual evidence, and approve or revise the next step.

This package does **not** modify Pi, Fabric, Fovea, the Fabric TUI, or either native
Prewalk mode. It has **no runtime npm dependencies** and loads directly as a
JavaScript Pi extension. The supervised MVP package contains only the 15-file public runtime; no native Store build or ActorHost migration is required.

## Release status

Version **0.1.0: experimental supervised MVP**. Start with the [short quickstart](docs/QUICKSTART.md): one Main, one writer, manual startup and every-step review in a disposable Git workspace. Actual Pi/Fabric/Fovea qualification passed question/answer, report/inspection/revision/approval, duplicate/stale-decision rejection, retained-session continuation, active cancellation and confirmed stop. The run used a deterministic loopback model, not a paid provider or an interactive Main TUI. This is not production, unattended, cross-controller or crash-recovery certification. A bounded automated suite now covers the live runtime (`npm test`; see the [testing policy](docs/TESTING.md)); historical pass counts from the removed suites remain non-reproducible.

The retained suite is regression coverage for its listed areas only, not release or unattended certification. Do not use this version for valuable repositories or unattended work. See the current [testing policy](docs/TESTING.md) and [compatibility notes](docs/COMPATIBILITY.md).

**Architecture cut:** the ActorHost/ActorStore redesign, native Store, new actor model and archive rotation are parked in the source checkout and excluded from the MVP package. They are not prerequisites for this public workflow. The live path remains `extension -> main -> PairController -> PiRuntime/PiRpc -> worker`; `actor-runtime.js` is part of that live path.

An uncertain prior worker exit blocks launches/reset pending offline reconciliation; missing or corrupt retained history is never replaced automatically. Worker editor dialogs are denied because Pi exposes no cancellable editor API. Crash recovery and interactive permission/dialog behavior remain unqualified.

## What is implemented

- Persistent Pi RPC subprocesses. Ending a task does not stop the worker, replace
  its conversation, switch Main's model, or request compaction.
- Disabled by default; after explicit enablement, automatic startup is available once a worker model has been configured. V1 permits one live worker and one unresolved assignment. Up to eight configured slot identities are preserved for sequential use/future qualification, but parallel activation fails closed.
- Work orders, questions, blockers, checkpoints, final review, approve/revise,
  cancellation, pause, explicit recovery, and duplicate-decision protection.
- Durable controller state outside model context; owner-epoch/worker-generation/attempt/session/lease-bound reports and delivery-operation IDs; no automatic replay after an uncertain failure. Same-session branch recovery remains unqualified.
- Immutable Git-worktree evidence, hash-bound approvals, and human-configured
  verification commands. A worker saying “tests passed” is not independently
  verified evidence.
- Separate `/pair` settings/status dialogs and a status widget: colored Main/Worker
  activity dots, flow arrows, plan step list, approval progress bar, and a liveness
  heartbeat with stale detection. `/model` still belongs to Pi. Fabric's own UI is unchanged.
- Worker provider/model/effort, review policy, report detail, budgets, and worker
  workspaces. Read-only configuration is preserved, but a read-only worker with
  generic Fabric providers is rejected until that profile has a pre-effect gate.
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

Use the source checkout or extract the small npm tarball into its own folder, for example:

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
The package does not bundle or modify those projects.

### One-time setup

1. Use native `/model` to choose Main. Pair never selects it for you.
2. Configure the worker's effective `fabric.json` with native Prewalk disabled, no shell auto-spill, and no recursive agents:
   ```json
   { "prewalk": { "enabled": false }, "executor": { "shellHangMs": 0 }, "agents": { "maxDepth": 0 } }
   ```
   Pair checks these persisted fields and refuses conflicting profiles; it does not silently edit Fabric settings. Re-enable/change them yourself when returning to an independent workflow.
3. Open `/pair settings`, deliberately turn **Enabled for new work** on, select one writer provider/model and supported effort, set **Autostart off**, and choose **every-step** review. Keep final review required. A read-only Fabric worker is rejected as unsupported.
4. Each valid edit saves immediately. Choose **Done** (or Esc), then run `/pair start worker`. Pair checks its Pi-written session, exact model, Fabric/Fovea registrations, native compaction, and Fabric safety profile without requesting a model turn.
5. Use `/pair doctor`, then try one small task in a disposable Git workspace. Do not run another Main/Pair or another writer against that workspace.

After setup, load Pair normally and start the worker explicitly. Ask Main to plan
and delegate one bounded implementation step, inspect its report, and ask you
before approving. Main receives the collaboration instructions and tools.
Actual delegation remains an LLM tool-use decision: the extension does not
silently intercept every natural-language request or replace Prewalk.

## Everyday controls

| Command | Behavior |
|---|---|
| `/pair` | Own menu: settings, status, transcript, start, pause, stop. |
| `/pair settings` | Compact autosaving menu; Main is context, worker model/effort and policy are editable, further controls live in Advanced. |
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
| `/pair import-backup <global\|project> <absolute-path>` | Preview and confirm deferred policy fields from one explicitly selected retained `.v1.bak`; never searches for a backup. |
| `/pair indicator off` | Remove only Pair's widget. |
| `/pair indicator minimal` | Show the compact widget again. |

For commands taking a worker ID, the default is the first configured worker.
`/pair stop` without an ID stops all currently owned workers.

### Minimal indicator

```text
M● ← W◐
Cache read (last): M 50.0% 5s ago · W 0.0% 2m 10s ago
```

`●` ready, `◉` working/starting, `◐` waiting, `○` stopped/not started, `!` attention.
`M` is Main; workers follow configured order as `W`, or `W1`, `W2`, etc. for several
workers. Known cache shares remain visible while idle or awaiting review. Roles
without a known share are omitted without renumbering workers; when none are
known, the cache row is omitted entirely (no blank spacer).

Cache read is `cacheRead / (input + cacheRead + cacheWrite)` for each role's **last
measured historical request**, not cumulative task usage. Zero-input/absent usage
(including a report-stop abort placeholder) does not replace a measured sample or
refresh its timestamp. Without a prior measurement the share remains unknown.
A real nonzero-input request with no cache reads replaces the prior value with
`0.0%`; misses are never smoothed away. Model/session changes and compaction clear
observations rather than carrying a sample into a different context. Age is time
since that measurement, **not** provider TTL, cache occupancy or a warm/cold
prediction. Low percentages are neutral, not errors. `/pair status` retains
explicit `unknown` diagnostics; narrow widgets truncate rather than wrap.

The indicator does **not** assert that models are resident in GPU memory or that
provider caches are guaranteed hot. It reuses the existing UI-only refresh, with
no new polling, model calls, warming requests or prompt injection. Personal
indicator changes are stored in `fabric-pair-ui.json` outside the implementation
repository so they do not stale a review checkpoint. Changes in this source
checkout do not automatically update a separately installed Pair package.

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
- **Every-step:** Main must plan and approve each small step. This is not semantic
  proof that every individual edit stayed in scope.
- **Final-only:** all listed steps are authorized in one assignment; questions and
  blockers are still allowed; final acceptance is still mandatory.

Legacy `final` and `strict` names migrate to `final-only` and `every-step`.
`adaptive` is not silently weakened; migration requires an explicit V1 policy.

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

The common settings menu has nine rows. **Advanced** retains worker selection/addition,
workspace, read-only mode, limits, summary detail and human-authorized verification.
Completed valid changes autosave; Done/Esc never rolls back saved edits. Cancel/no-op,
invalid input or a failed write leaves the last saved value intact. Scope switching
only changes the view: global shows defaults without project overrides; project
includes global inheritance. Only changed fields are persisted atomically to that
layer (worker arrays remain replacement values). Indicator uses its separate UI file.

Saving does not start, stop or rebind workers. Autostart runs on session startup.
Runtime/model changes are staged while any generation/task is retained: finish or
cancel the task, then explicitly `/pair start` to reconcile at confirmed idle exit
and resume the same conversation without replaying work. Policy/limit/verification
changes are for new assignments; explicit resume keeps its existing limit/policy
amendment behavior. Unconfirmed exits/interrupted tasks remain held. Project file
edits may stale immutable checkpoints; no evidence check is bypassed.

File-level startup preflight reports all known Fabric prerequisites and actual paths:
`executor.shellHangMs=0`, `agents.maxDepth=0`, `prewalk.enabled=false`. Trusted worker
project fields override global defaults. Main cannot assume worker trust (especially
in a separate workspace); unknown trust is rejected early only if both possible
profiles fail. Custom launch commands/arguments defer to worker readiness. Preflight
is not provider authentication, and Pair never edits native configuration.

Configuration schema **V2** uses `final-only`, `milestones`, and `every-step`.
Arrays replace the lower-precedence array; they are not concatenated.
`pair_status` and `/pair doctor` expose field provenance (`default`, `global`,
`project`, or cosmetic `ui`). Untrusted project configuration is not read.

Existing shipped V1 `fabric-pair.json` files and the handoff's `pair.json` shape
are loaded only as a disabled migration preview. Legacy `enabled:true` never
carries forward as consent, and Pair does not infer a missing provider. Review
the settings, choose **Advanced → Review/migrate selected scope**, and confirm to archive the exact legacy source as
a `.v1.bak` file and atomically write V2. If `pair.json` and
`fabric-pair.json` coexist in one scope, Pair reports a conflict instead of
choosing silently. Handoff queue/report/repair/recovery values and the distinct
active-step/per-step semantics are preserved in V2 assignment policy, but are not
advertised as enforced until their R5 consumers land. An already archived handoff
backup can be imported only by explicitly naming it with `/pair import-backup` and
confirming the field preview; Pair never guesses the newest backup. `adaptive`
requires an explicit supported-policy choice.

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

V1's live-worker and unresolved-assignment maximum is one. Additional explicit worker IDs, models, and workspaces are preserved as sequential/future slots; raising the legacy `maxWorkers` field does not enable parallel activation.

Read-only workers with required generic Fabric and every form of parallel
activation—including separate Git worktrees—are currently rejected as
`UNSUPPORTED_PROFILE`. Pair does not create branches, merge changes, commit,
push, or deploy for you.

When selected sequentially, a configured slot retains its own persisted
conversation; reports remain tagged and reviewed by one Main session. A prior
assignment must be resolved and its retained process stopped before another slot
can start. Each activated slot still has separate context, memory, and potential
provider usage.

## Context, warming and cost

Both sides run normal Pi/Fabric/Fovea. Native automatic compaction must be enabled
by default readiness policy. Pair never replaces `session_before_compact` with
its own summary engine. It restores only a bounded task-state packet after native
compaction, without launching a turn merely for restoration.

Pair leaves **persisted native warming settings unchanged**. Its separate Pair
configuration policy `cacheWarming: "off" | "active"` defaults to `off`, including
existing installations. Enabling Pair alone does not authorize paid warming.
After explicit cost consent, `"active"` opts into one **native session-scoped idle
warming lease** per role while Pair is enabled and has eligible current work:
running, settling, questions, review or blockers. Bare retained-ready workers,
paused/interrupted/terminal/error tasks, closing sessions and disabled Pair do not
qualify. Review waits do not restart or extend the native safety window.

This optional policy is currently JSON-only in Pair's global/project
`fabric-pair.json` layers (trusted project overrides win); normal settings edits
preserve it. For example, explicitly add `"cacheWarming": "active"` to the chosen
Pair layer after deployment and consent, **not** to native `settings.json`.
`fabric-pair.example.json` intentionally keeps it off. A loaded policy change is
published as nonauthorizing worker metadata, never a new work lease or budget
reset. Failed publication contains the owned worker rather than leaving a stale
paid opt-in. Worker refresh decisions reread validated current authority; a
retained report or old telemetry cannot authorize warming after cancellation.

The required public SDK capability is
`ctx.acquireCacheWarming("idle"): () => void`. Old SDKs remain usable and report
**unsupported**, with no global-setting or paid-prompt fallback. Releasing Pair's
idempotent lease leaves native policy and other owners intact; they may independently
allow warming even when Pair is inactive. Pair never returns a forced `warm`
decision, creates a warming scheduler, sends fake prompts, or changes model TTLs.
The SDK must reconcile effective policy on release and recheck it after awaited
warming decision hooks, without restarting a native run.

Pi's persisted base modes are `off`, `streaming` (eligible active runs only), and
`idle` (also eligible between-run waits). An opted-in Pair lease temporarily requests
native idle behavior without changing that base policy. Native replayability,
active-tier `promptCache` lifetime, expiry deadline and at least $0.05 estimated
avoided-miss-cost checks still apply. The **30-minute idle cap** (and one-hour
streaming safety window) stays measured from the original real request, not a
lease acquisition, UI tick or refresh. Sleep/late timers do not authorize a new
window. Acquiring again does not revive an expired run; no synthetic request is
sent to start one. Missing TTL metadata stays ineligible.

These eligible native refreshes can incur **paid usage**, recorded in native Pi
session totals, not model context or Pair inference-only budgets. Status distinguishes
requested policy, SDK support, held Main lease and last-reported Worker lease from
actual refresh usage and historical cache-read samples. A held lease is not evidence
that a refresh occurred, or that any provider cache is resident.

This Pair component uses the proposed SDK contract; the native SDK counterpart and
user-authorized installation/reload remain separate deployment steps. Workspace
source changes do not update an already loaded package. No live/native setting is
changed by this implementation. See installed Pi `docs/settings.md` and
`docs/models.md` for the native version's eligibility/lifetime contract.

Even eligible native idle warming only reduces avoidable misses: provider expiry,
eviction, changed prefixes, compaction, routing and provider policy can still
cause misses while the same conversation remains intact. Neither warming nor a
recent high observed ratio guarantees cache residency or the next request's hit.

Pair's cache ratio uses Pi's separated usage fields:

```text
cacheRead / (input + cacheRead + cacheWrite)
```

The UI reports the **last measured historical request** and its observation age.
Unknown data remains unknown; retaining a sample does not retain a provider cache.
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

## Development checks

The repository retains a bounded automated offline suite for the live runtime (`npm test`; see [docs/TESTING.md](docs/TESTING.md) for coverage and limits). Removed historical suites are not reproducible and are not current evidence.

```bash
cd /path/to/pi-fabric-pair
npm test
npm run typecheck
npm run pack:check
```

`npm test` runs the retained suite; `npm run test:ui` runs the model-picker suite alone. The remaining commands are static/package checks, not behavioral tests.

From the source checkout, the pinned strict `typecheck` passes. `pack:check` performs an npm package dry run, not behavioral qualification. The optional `build:host`/`check:host` commands concern parked source only and are not MVP installation or packaging prerequisites.

## Deliberate boundaries

No background daemon, permanent-cache promise, shared model cache, built-in web UI,
automatic merge, arbitrary direct worker chat, recursive worker spawning, custom
compactor, or fork of upstream TUI is included. The transcript viewer is read-only;
use the review protocol to issue work and decisions.

No operating-system subprocess behavior is currently qualified by a retained automated suite. On Windows, configure an actual executable (or `node` plus the appropriate CLI path) rather than relying on a shell-only command shim.

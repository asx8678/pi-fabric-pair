# Architecture and invariants

## Scope

Pair is one package with two roles. `extension.js` selects its role from the
controller-owned worker environment. The Main role registers human UI and
supervisor tools. The Worker role registers reporting and execution gates only;
it never starts another Pair manager. The extension factory registers resources
synchronously. Process creation begins in a session lifecycle event or an explicit
command/tool, not during module import.

No upstream private modules are imported. Ordinary registered tools are captured
by Fabric as extension capabilities. We use a small adapter to Pi's documented
JSONL RPC rather than inheriting private fields from its `RpcClient`: the adapter
needs access to extension UI replies, process ownership, uncertain-response
handling, and bounded stream parsing. This is not a new wire protocol or gRPC.

`src/contracts.js` is the runtime trust boundary for decoded coordination data. It keeps the persisted-state version separate from the wire version, validates exact state/policy/limit/authority/latch/report shapes, binds latch and nested report identities, and performs only explicit known-legacy migration. Present malformed or exhausted identity counters fail closed rather than being normalized. Static types do not replace these checks.

## Normal workflow

1. Main dispatches a work order with a client request ID and complete bounded plan.
2. Controller checks Main/worker prerequisites, selects a retained worker, checks
   overlap with active workers, and snapshots the initial source state.
3. Controller writes a validated implementation authority containing the exact task, plan
   revision, step, model, owner epoch, worker generation, task attempt, lease, assignment policy and assignment limits. The Worker validates it again before use. A `/pair-bridge load` command refreshes worker
   state without invoking a model. The work prompt is then sent once.
4. Worker uses normal Fabric/Fovea and returns a structured `pair_report` tool call.
5. The bridge latches that epoch/generation/attempt/lease tuple before publishing a report into a private local
   outbox. Later tool calls under the same lease are blocked. A UI notification is
   only a wakeup; the outbox is authoritative.
6. Controller validates the decoded report envelope before reading identities, then checks the incarnation nonce, owner session/epoch, worker slot/generation, session, task attempt/lease, plan revision, step, payload schema, and payload hash.
7. Controller waits for the native settled event, runs preconfigured checks, and
   freezes/rechecks a source snapshot. It does not review a moving checkpoint:
   drift during a check fails that check, and drift while freezing is retried a
   few times before the task is held (the worker process is kept).
8. The finalized report is stored in Pair's durable inbox as pending work. With
   `autoDeliverReports` (default) it reaches Main only at a safe boundary: the
   settlement boundary of a normally completed Main run with no queued user
   input, a send from the `agent_settled` handler (Pi defers it in order with
   prompts submitted during settlement), or a new turn when Main is idle, with
   the idle check repeated in the same tick as the send. An idle turn starts
   through Pi's normal prompt path (the report is appended, then a fixed Pair
   prompt), so `before_agent_start` applies Fabric's system prompt as on user
   turns and the cached prefix matches. It never interrupts a
   running turn or rides on the user's prompt. With it off, Main retrieves
   reports with `pair_yield`, or one report armed by an empty yield is delivered
   at the current run's settlement boundary. No entire worker transcript is
   copied into Main.
9. Main retrieves immutable evidence, then answers, approves, revises or cancels
   through the decision tool. Approval binds to the snapshot hash and requires the
   live source snapshot still to match.
10. A continuation grants a fresh attempt ID and lease only after the previous worker run has
    settled and native readiness has been rechecked. Completion revokes authority
    but leaves the process/session open.

Questions and blockers follow the same correlation mechanism. Questions accept
answers; approval is reserved for review checkpoints. Final-only mode authorizes
the whole listed plan, but still requires a `final_review` before acceptance.

## States

Worker presentation state is distinct from task state. A process can be alive
while its task is waiting or paused. A report can be durably stored while Main
has not yet processed its notification.

Typical task states:

```text
activating -> running -> awaiting_settle -> question -> activating
                                        -> review -> activating | completed
                                        -> blocked -> activating | cancelled
activating/running/review/question -> paused | interrupted | cancelled
paused/interrupted --explicit human resume--> activating
```

`activating` is a granted attempt whose work prompt has not been sent yet:
running intent is persisted before the prompt, so a task found `activating`
after a crash provably never received it.

A valid approval may leave the same step active when `stepComplete:false` is used.
Otherwise it advances one step. No step can be advanced twice by the same report.
Revisions are bounded per task (`maxRevisions`) and per step (`maxRevisionsPerStep`).

## Persistence

The workspace/Main-session identity selects a private state directory. A PID
ownership lock prevents two live controllers attaching to the same state; its
owner record is written before the lock directory is renamed into place, and a
lock whose PID was reused by a newer process is treated as stale. A separate
repository lock allows one unresolved Pair task per repository across sessions.
Failed initialization releases its lock. Controller replacement advances a
durable owner epoch; each worker process replacement advances its generation.
The worker's PID is recorded at spawn: on restart after a crash, Pair proves the
previous generation exited (gone, owned by another user, or a reused PID) and
otherwise holds it until `/pair reconcile`.
State files are atomically replaced (with a directory fsync) and restrictive
permissions; this is not a transactional database or a distributed exactly-once
guarantee. Resolved notices and old request IDs are archived beside their task,
and evidence of tasks older than the last few is collected at the next dispatch.

Stored data includes:

- `state.json`: owner epoch, worker generations, task attempts, request IDs, decisions and delivery operation records.
- `workers/<id>/sessions/`: Pi-owned session JSONL files.
- `workers/<id>/authority.json`: current controller-issued implementation lease.
- `workers/<id>/latch.json`: worker report already committed for the lease.
- `workers/<id>/inbox/` and `archive/`: structured reports and stale/quarantined reports.
- `workers/<id>/probe.json` and `telemetry.json`: local readiness and activity.
- `evidence/blobs/`: content-addressed source bytes.
- `evidence/snapshots/`: full source fingerprints stored separately from small state.
- `evidence/<task>/<report>/`: manifest and immutable diff.
- `checks/`: controller-run check argv, outcomes and bounded output.
- `tasks/`: archived completed/cancelled task metadata.

Sensitive logs/code stay local unless a model explicitly receives selected report
or evidence content through its normal provider request. Pair creates no external
service or analytics endpoint. Keep the state directory outside every active
implementation working tree to avoid recursive evidence capture.

## Process lifecycle

Each retained worker owns one RPC connection and one session file. Responses are
correlated with unpredictable IDs. An acknowledgement timeout means **unknown
outcome**, not “nothing happened”; dispatch is not automatically retried.
Malformed or oversized JSON frames are a protocol fault; stray non-JSON lines
from an extension are kept as bounded diagnostics. Stderr is kept separately and
bounded; startup diagnostics can be retained privately for investigation. The
work prompt's acknowledgement waits through Pi's preflight (compaction,
before-agent hooks) and is extended while a compaction is visibly running.
Signals are only ever sent to a validated child PID's process group, never to
PID 0/1, Pair's own process or its parent.

A normal prompt completion does not close stdin. Stop revokes authority, cancels
queued work, aborts the current run, sends EOF, then escalates to process-group
termination if the child does not exit. Worker bridges also check parent liveness.
Main shutdown stops owned workers; Pair starts no daemon of its own. Fabric can:
a durable `agents.spawn`/`agents.create` in the worker launches a detached
resident host before Fabric's depth check. The worker treats that call as a
detached effect and shuts down. The controller refuses to freeze a checkpoint
while a resident host recorded under the worker's private mesh is alive, and
warns when one outlives a stop. It never signals that host: its PID comes from a
file the worker can write, so the human stops it.

After an interruption, the human must inspect changes and explicitly resume or
cancel. Resume reuses the existing Pi session and tells the worker to reconcile
side effects before proceeding. Missing session files fail closed. Explicit reset
starts a new conversation later and archives old metadata rather than deleting
history automatically.

Native model changes are not transferred between participants. Main's `/model`
remains native. Worker changes require an idle/no-active-task boundary. Effort is
validated against the actual worker model's supported levels. Unexpected model
changes while executing are treated as interference and interrupt the task.

## Context and Fovea

Both hosts load native extensions. Pair verifies registered capabilities; it does
not instantiate a second repository graph or infer coverage from registration.
Fovea's context differs by conversation. User constraints known only to Main must
be present in the work order.

Native Pi/Fabric retains ownership of compaction. Pair observes lifecycle events
and appends only a bounded task-state packet after successful compaction, using
`nextTurn` without triggering inference. All critical approval/task state is also
outside the transcript. Native file-level policy is reported separately from the
RPC automatic-compaction switch; session-only native overrides may differ.

Fovea or other extensions can request continuations. The worker bridge rechecks
its durable authority at turn/tool boundaries. A report closes a lease before
publication. Nested `pi.*` and captured-tool calls inside Fabric raise `tool_call`
and are gated too. Fabric provider actions (`agents.*`, `jev.*`, `mesh.*`, …)
do not; the worker sees them only afterwards, through Fabric's `tool_result`
proxy, and treats a successful `agents.spawn`, `agents.create`, `agents.import`,
`agents.subscribe`, `jev.spawn`, `cache.hold` or `components.apply`, or a
`schema.commit` after the report latched, as a detached effect. Before a program
runs, the worker also blocks a `fabric_exec` whose code calls one of those
detaching actions directly, and Main blocks one that calls `schema.commit` while
it supervises a task; the check ignores strings and comments, so a computed ref
reaches only the result check. `agents.maxDepth: 0` is what stops Fabric
child runs. Current in-flight effects
cannot be rolled back by a future hook, so the controller also waits for settled
execution and verifies immutable evidence before review.

## V1 worker scope

The registry remains keyed by explicit worker IDs so existing slot identities and
history are not discarded. The qualified V1 runtime nevertheless permits only one
live worker and one unresolved assignment across all slots. Auto-start selects the
first configured slot; attempts to activate another slot fail with an explicit
`UNSUPPORTED_PROFILE` error, even when it uses an independent Git worktree. The
controller checks unresolved work before starting a second process.

Parallel inference, read-only Fabric workers, parallel writer worktrees, branch
integration and automated merge machinery are deferred until independently
qualified. Git worktrees would not isolate external services, ports, databases or
user shell sessions in any case. The controller still serializes state transitions;
cancel/pause/stop can abort controller-owned verification without waiting for its
full configured timeout.

## Staged, not live

The live path is `extension.js` → `main.js` / `worker.js` → `controller.js` →
`actor-runtime.js` → `rpc.js`. The actor and coordination modules
(`actor-*.js` and `actor-*.mjs` except `actor-runtime.js`, plus
`coordination.js` and `transitions.js`) are a staged
pure model for the AR-03 freeze and H1 ActorHost integration. Nothing on the live
path imports them, and they grant no authority. See
[ACTOR-RPC-IMPLEMENTATION-PLAN.md](ACTOR-RPC-IMPLEMENTATION-PLAN.md).

## UI and metrics

UI callbacks render controller state. They do not drive the state machine and do
not send model heartbeats. Pair only uses its own widget key, its own footer
status key and dialogs; no native footer/header/editor replacement occurs. Turning the indicator off writes
a cosmetic preference outside the repository and has no dispatch side effect.

Cache ratios are timestamped observations using Pi's separated usage categories.
The plugin does not infer GPU residency, guarantee next-request hits, or run its
own cache warmer. It only answers Pi's native `cache_warming_decision` in each role
while the other role will certainly continue it (Main while the worker works, the
worker while its report waits), never for a Codex model, and never with `stop`;
it gives a model with no Pi cache lifetime a 240 s default before a run.
The worker's pre-prompt history check tolerates a warm refresh's `usage` entry
announced mid-check. Soft limits stop further task execution when observations show
a threshold, but cannot provide a provider-enforced total spend ceiling.

## Handoff: durable inbox, phases and branch fencing

Reports finalize into a durable inbox of notices. With `autoDeliverReports`
(default) each one is delivered at Main's next safe boundary (see step 8 above);
a send is recorded as offered only once Main's session observably holds it, and
a report already present in Main's session is never sent again.
The other delivery channels are explicit: `pair_yield` returns compact reports in
the tool result; an armed empty yield grants exactly one settlement-boundary
entry injection (public `agent_before_settle` entries/continue) fenced by the
exact permit; humans redeliver via `/pair yield` and `/pair inbox`.

Receipts are truthful: notices record `offeredAt`/`channel` per attempt and
`observedAt`/`observedBranch` for explicit reads; legacy `delivered` is
readable while new attempts record `offered` (never `delivered` as confirmed
delivery), and explicit re-offer or resolution may update those notices. The
persisted `mainPhase` (status, monotonic revision, run
token, armed flag, activity epoch, owner binding) is non-authorizing: it only
channels delivery, and a missing or stale phase never implies readiness.

A volatile logical activity epoch is bumped on user input, non-Pair tool
admission and new agent runs; a persisted branch counter is bumped only by tree
navigation. Inspections capture and re-verify the branch across their awaits;
decisions and renewals are fenced against both, synchronously through the
activation transaction, authority publication and the RPC pre-prompt write
guard. Contained renewals interrupt the task and overwrite authority to a hold
without sending work.

Dispatch writes a bounded, identity-bound `work-order.json` beside the authority
file: a read-only retained copy of the granted objective/context. The worker
restores it (plus the final-only remaining plan) in the task-state packet after
compaction, validating identity and omitting mismatched or malformed
references; it is never a new grant and never changes the authority document.
`agentDir` follows the public native tilde semantics (`~`, `~/...`).

## Delivery and security limits
Report notification is at-least-once recoverable, not exactly-once. Persisted IDs,
a session check before any resend, and idempotent decisions prevent duplicate
advancement. A crash mid-delivery returns the report to pending; it is sent again
only if Main's session does not already hold it. Reports are treated
as untrusted content, not as new permissions.

Tool gates are workflow restrictions. A powerful shell, external tool server,
or extension still has its configured OS/app permissions. Pair is not adversarial
isolation; see `SECURITY.md`.

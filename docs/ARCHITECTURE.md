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

## Normal workflow

1. Main dispatches a work order with a client request ID and complete bounded plan.
2. Controller checks Main/worker prerequisites, selects a retained worker, checks
   overlap with active workers, and snapshots the initial source state.
3. Controller writes an implementation authority containing the exact task, plan
   revision, step, model and lease. A `/pair-bridge load` command refreshes worker
   state without invoking a model. The work prompt is then sent once.
4. Worker uses normal Fabric/Fovea and returns a structured `pair_report` tool call.
5. The bridge latches that lease before publishing a report into a private local
   outbox. Later tool calls under the same lease are blocked. A UI notification is
   only a wakeup; the outbox is authoritative.
6. Controller validates the incarnation nonce, owner, worker/session identity,
   lease, plan revision, task, step, schema, and payload hash.
7. Controller waits for the native settled event, runs preconfigured checks, and
   freezes/rechecks a source snapshot. It does not review a moving checkpoint.
8. Main gets a compact custom follow-up in its current conversation. No entire
   worker transcript is copied into Main.
9. Main retrieves immutable evidence, then answers, approves, revises or cancels
   through the decision tool. Approval binds to the snapshot hash and requires the
   live source snapshot still to match.
10. A continuation grants a fresh lease only after the previous worker run has
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
running -> awaiting_settle -> question -> running
                          -> review -> running | completed
                          -> blocked -> running | cancelled
running/review/question -> paused | interrupted | cancelled
paused/interrupted --explicit human resume--> running
```

A valid approval may leave the same step active when `stepComplete:false` is used.
Otherwise it advances one step. No step can be advanced twice by the same report.
Revision count is per task, not an unlimited count reset at every checkpoint.

## Persistence

The workspace/Main-session identity selects a private state directory. A PID
ownership lock prevents two live controllers attaching to the same state. Failed
initialization releases its lock. A dead owner can be reconciled on restart.
State files are atomically replaced with restrictive permissions; this is not a
transactional database or a distributed exactly-once guarantee.

Stored data includes:

- `state.json`: workers, current task, request IDs, decisions and delivery records.
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
Malformed or oversized stdout is a protocol fault. Stderr is kept separately and
bounded; startup diagnostics can be retained privately for investigation.

A normal prompt completion does not close stdin. Stop revokes authority, cancels
queued work, aborts the current run, sends EOF, then escalates to process-group
termination if the child does not exit. Worker bridges also check parent liveness.
Main shutdown stops owned workers; there is no daemon surviving Main.

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
publication. Nested Fabric tool events are gated too. Current in-flight effects
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

## UI and metrics

UI callbacks render controller state. They do not drive the state machine and do
not send model heartbeats. Pair only uses its own widget key and dialogs; no
native footer/header/editor replacement occurs. Turning the indicator off writes
a cosmetic preference outside the repository and has no dispatch side effect.

Cache ratios are timestamped observations using Pi's separated usage categories.
The plugin does not infer GPU residency, guarantee next-request hits, or run its
own cache warmer. Soft limits stop further task execution when observations show
a threshold, but cannot provide a provider-enforced total spend ceiling.

## Delivery and security limits

Report notification is at-least-once recoverable, not exactly-once. Persisted IDs
and idempotent decisions prevent duplicate advancement. A crash between enqueue
and persistence can require manual `/pair inbox` redelivery. Reports are treated
as untrusted content, not as new permissions.

Tool gates are workflow restrictions. A powerful shell, external tool server,
or extension still has its configured OS/app permissions. Pair is not adversarial
isolation; see `SECURITY.md`.

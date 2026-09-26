# Handoff scope amendment (current)

This is a concise amendment to the historical scope documents
([SCOPE-OF-WORK.md](SCOPE-OF-WORK.md),
[NEXT-IMPLEMENTATION-PLAN.md](NEXT-IMPLEMENTATION-PLAN.md)). It records what the
bounded non-interrupting handoff change actually delivers and accepts. It does
not rewrite, satisfy or reclassify any historical V1 requirement; those remain
open unless explicitly listed here.

## Delivered (active controller behavior)

- **Durable inbox with automatic review delivery.** Finalized reports persist
  as notices. With `autoDeliverReports` (default `true`, changed 2026-09-26
  because the workflow otherwise stalled after every report), each
  never-offered report is sent to an **idle** Main as a follow-up that starts a
  turn, never interrupting a running Main; it is sent at Main's `agent_settled`
  if Main was busy, at most once per report and at most `maxReportsPerTask`
  times per task. With it off, explicit channels only:
  `pair_yield` returns compact reports in the tool result; an armed empty yield
  grants exactly one settlement-boundary delivery after `agent_before_settle`;
  `/pair yield` and `/pair inbox` are the human fallbacks.
- **Truthful receipts.** `offeredAt`/`channel` record each delivery attempt;
  `observedAt`/`observedBranch` record explicit reads; `pair_decide` resolves.
  Repeat reads return the same stable IDs; legacy `delivered` receipts stay
  readable, new delivery attempts record `offered` (never `delivered` as
  confirmed delivery), and explicit re-offer or resolution may update those
  notices' status.
- **Explicit, non-authorizing Main phase.** `open` on dispatch, `yielded` on
  `pair_yield` (run token, monotonic revision, armed flag, activity epoch,
  owner binding). New input, non-Pair tool admission and new runs supersede an
  unused yield synchronously. A missing or stale phase never implies readiness.
- **Branch fencing.** Tree navigation (only) advances a persisted branch
  counter; inspections pin the branch they read, decisions on a stale branch
  require explicit re-inspection, and renewals are synchronously fenced through
  the activation transaction, authority publication and the RPC pre-prompt
  write guard. Contained renewals hold the task without sending work.
- **Decision-wait continuity.** Paused question/review/blocker holds survive
  repeated pauses and reload; `resume` restores the waiting decision with the
  original lease/attempt, notice and report intact.
- **Verification source identity.** Every configured check is bound to the
  checkpointed source hash before and after, with hashes retained in check
  artifacts; drift between or during checks fails the whole verification.
  Documented limit: endpoint snapshots do not isolate transient within-command
  mutations restored before command exit, and no atomic exclusion of external
  writers is claimed.
- **Renewal revalidation.** Source and branch are re-captured after the final
  readiness wait, immediately before renewed running authority; drift rejects
  the renewal and holds the task.
- **Retained scope.** Dispatch writes an identity-bound, read-only
  `work-order.json` reference; the worker restores the original context and the
  final-only remaining plan after compaction, omitting mismatched or malformed
  references. Never a new grant, never an authority change.
- **Native agentDir semantics.** `~` and `~/...` expand per the installed SDK's
  public semantics; profiles untouched.

## Explicitly parked / not activated

- The ActorHost/Supervisor redesign and the parked actor runtime remain plans;
  no actor scheduler or second scheduler exists.
- Backlogs, automatic repair and automatic recovery remain off.
- Queues, workspace-wide locks, multi-writer and multi-controller coordination
  remain open V1 obligations, not waived.
- No private Pi hooks, upstream patches, shared settings or profile changes.
- No automatic idle `sendMessage` wakeup: a late result after a yielded Main
  has settled stays retained with waiting UI and requires the next explicit
  review or the human fallback. This limitation is deliberate and documented.
- Fovea steering remains native and independent; Pair neither suppresses nor
  alters it.

## Current acceptance (handoff slice)

- Reports retained/verified; with `autoDeliverReports` on, one automatic
  follow-up per never-offered report to an idle Main, capped per task; with it
  off, no automatic Main followUp during an open phase.
- Dispatch leaves the Main phase open; explicit yield/review receives ready
  results; no polling, heartbeats or timer inference.
- No unrelated queue mutation or Main abort; other extensions' boundary drafts
  preserved; stale phase/owner/branch offers rejected.
- Truthful offered/observed/resolved receipts; duplicate offers/decisions
  cannot advance twice.
- Legacy/reload behavior safe; branch reconciliation explicit; strict typecheck
  and the offline suite pass.

## Qualification status

All evidence is offline: registered-hook fixtures, isolated temporary state and
real offline helper child processes. Native qualification (live agent loop,
interactive TUI, real providers, paid inference) is **NOT RUN** and must not be
claimed. The Pair package loaded into a running session may differ from the
checkout source. Review policies and the final-review requirement are
unchanged. One misconfigured fixture briefly spawned the real `pi` binary with
a fixture provider name during test development; it refused to start offline
and is recorded as an offline refusal, not a qualification pass.

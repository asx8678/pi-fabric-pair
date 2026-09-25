# Downstream runtime scope — read-only handoff

Reader `10532ca2ca3c421e9088285c91b52fca` stopped after a read-only audit. It verified package identity and examined the runtime/configuration consumers, deliberately excluding the then-moving actor-model/wire implementation. This summary is an integration plan, not execution evidence or approval to activate actor formats.

## Actual baseline

`extension.js → main.js/registerMain → PairController → PiRuntime → PiRpc → registerWorker → latch/inbox → Controller evidence → Main inspection/decision` remains the executable path. Active versions are Config V2, State V1 and Pair wire V1. Pure V2 actor contracts/reducers are not runtime enforcement. There is no canonical ActorHost/store/mailbox integration or supervisor scheduler. Preserve PiRuntime as the one native process owner rather than extracting a second lifecycle manager.

Already corrected: identical current-lease report retry republishes its envelope; inbox/latch scanning compares retained content; pending reports survive interruption; configuration restoration retains the backup and exposes restoration failure. These are not restart-independent recovery, acknowledged delivery, obligation reconciliation or durable Apply transactions.

## Dependency-ordered implementation

| Area | Concrete integration still required |
|---|---|
| AR-04 Host/store | One canonical state/effect owner, Controller compatibility projection, durable reservation/publication/readback and outside-lock completion fences. No second mutable worker registry. Resolve legacy single-implementer versus actor-pair kernel paths explicitly; never invent a supervisor to bridge the difference. |
| Recovery/migration | Open read-only/held before rewriting state; preserve exact binary input and session paths; explicit manifest/backup/publication crash states; no synthesized historical attempts or automatic old-owner adoption. Reconcile latch, outbox, report, decision and notice obligations without a live runtime. |
| Workspace ownership | Canonical repository-wide writer/evidence ownership, acquisition/release tokens and uncertain launch retention. Main-session locks and parent-PID liveness do not prove child exit. Never signal a PID solely because it appears on disk. |
| RPC/effect correlation | Persist command identity before send and preserve ACK/run/report/native-settlement/effect-settlement as independent facts. Expose correlation through PiRpc without resending uncertain commands. Version authority/probe/telemetry/bridge readers and writers together. |
| AR-05 supervisor | Explicit role-local launch resources and confined read/search tools; deterministic Host proposal/inspection bridge with original input, producer binding and immutable delivered evidence receipts. Tool-name selection or prompts alone are not confinement. Deny unsupported provider/effect profiles. |
| AR-06 workflow | Two retained runtimes, at most one activation per actor and one implementation writer. Prompt durable submission receipt; complete planning/question/report/inspection/review routing; mode-checked legacy adapters; durable usage dedup and unknown accounting. Main branch fencing and complete admitted-effect coverage remain required. |
| Verification | Per-command source/run identity, workspace reservation through checks, and immediate pre-grant snapshot revalidation. Batch-only before/after snapshots miss intermediate mutation/restoration. A timeout flag does not prove verification-process containment. |
| AR-07 sleep | Monotonic ten-minute eligibility, exact generation/activity token, Host obligation debt plus runtime/transport axes, reversible sleep reservation and actual EOF recheck. Confirm exit before cold wake with exact retained session continuity. Stop/off remain sticky; no timer currently enforces this policy. |
| AR-08 Apply/status | Active/pending behavioral revisions, immutable in-flight assignment, branch/trust/source-layer fences, safe-boundary readback and immediate disable containment. Distinguish actor/runtime/workflow/hold states, selected/observed resources, stale/unknown telemetry and notice publication/observation/resolution. Update Main/UI/schema/example/package surfaces together. |

Foundation evidence, replanning, mailbox/archive and full-path freeze remain prerequisites for activating State V2/wire V2. Original-byte durability and host provenance cannot be inferred from the new semantic preimage checks. No native workflow, crash recovery, confinement, sleep race, UI or installation acceptance was executed by this reader.

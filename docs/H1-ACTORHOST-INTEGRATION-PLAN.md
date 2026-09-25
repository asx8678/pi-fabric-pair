# H1 — ActorHost / durable runtime integration plan

**Status: persistent private macOS Store, non-admitting Host transitions and bounded archives are implemented, with scoped correction reviews and disposable observations. Full H1-A/D acceptance, H1-B/C, new-owner/effect handoff and integrated runtime qualification remain open.** See [the execution ledger](H1-EXECUTION-LEDGER.md) and [T10 §10's corrective legacy-root design](T10-CONTRACT-FREEZE-CANDIDATE.md#10-h1-l-corrective-design-amendment--fresh-execution-is-not-held-evidence). The original no-implementation inventory below is historical. This revised plan follows the [scope-checked next implementation plan](NEXT-IMPLEMENTATION-PLAN.md), [AR-04](ACTOR-RPC-IMPLEMENTATION-PLAN.md#ar-04--integrate-canonical-actorhost-persistence-and-recovery-with-one-implementer) and scope §10. It corrects the earlier H1-A → B → C → D ordering: held loading must precede writable cutover, and emergency containment must not depend on successful persistence.

**Preparation follow-up:** [H1-0 publication/recovery contract](H1-0-PUBLICATION-CONTRACT.md) now specifies a candidate namespace, full owner/branch fencing, commit selection/sync/readback, orphan/crash classification and effect matrix. [T10's exact source inventory](T10-CONTRACT-FREEZE-CANDIDATE.md) records the remaining review blocker and the real legacy-admission gap: the aggregate's `checkAssignment` currently admits actor-pair workflows only. A valid legacy config is not an implemented single-implementer adapter. These are review candidates, not freeze/implementation acceptance.

## 1. Current source and corrections to the inventory

| Witness | Actual gap / preservation requirement |
|---|---|
| `PairController.init/persist`: session-derived store directory, `acquireLock`, `persistSerial`, `state.json` | Existing local serialization is real, but not a canonical workspace-wide writer/evidence owner. No competing mutable workers/actors registry may be introduced. |
| `PairController.init`: `migrateStoredState(loaded, () => uid('attempt'))`, epoch increment, authority writes | Classify/open read-only before any rewrite. Retain exact raw bytes and explicit held legacy state; no synthesized historical identity. |
| `PairController.intents/revoke` | Intent fence is memory-only. Durable owner/generation/operation identity must govern restart; keep synchronous in-memory revocation before any await. |
| `reserveStart/activate`, `publishControl/contain` | Launch/run already have partial reservation ordering. Preserve containment on failed publication; no rule may require a successful disk write before aborting an unsafe live process. |
| Worker `pair_report/publishReport`, Controller latch scan | Latch closes the worker locally before publication; identical retry repairs the immutable inbox and verifies complete duplicate content. Preserve DUR-01/DUR-02. Worker files are untrusted, fenced producer publications—not a second canonical state store. Co-location alone is not a defect. |
| `Evidence.verifyConfigured`, Controller checkpoint path | Batch snapshot equality is not per-command source/run evidence or known process/effect containment. Integrate writer reservation, per-command binding and fresh pre-grant revalidation. |
| `extension.js`, `main.js`, Controller imports | Only Main/Worker operational roles; public tools use legacy Controller/PiRuntime. Pure actor reducers are non-authorizing and have no Host consumer. |
| `config.js:saveConfig` | Backup-preserving restoration and primary+rollback AggregateError are already corrected. Preserve them; full transactional Apply remains open. |

## 2. Pre-implementation contract decisions (H1-0)

H1-0 may be drafted read-only, but implementation/cutover depends on complete Q01 and F1/T09/T10. The [T09 checkpoint](T09-FOUNDATION-REVIEW-CHECKPOINT.md) leaves independent review blocked. [MF-01's represented-kernel projection](D5-LEGACY-PROJECTION-CORRECTION.md) is now source-corrected and boundedly checked; the [explicit held-carrier path](D5-HELD-CARRIER-CONTRACT.md) is also source-implemented and boundedly checked. Independent closure is still required before T10. H1-D's durable loader must consume that corrected contract, not defer its truthfulness until runtime integration. Freeze:

1. **One authority owner:** ActorHost serializes domain decisions; proposed ActorStore owns durable journal/root/checkpoint publication. PiRuntime alone owns process/RPC lifecycle. Worker telemetry/probe/latch/outbox are bounded producer-owned inputs with full fencing; only Host admits their canonical consequences.
2. **Two ownership scopes:** store-owner token plus canonical workspace writer/evidence reservation. Main-session locks alone cannot exclude a second Main in the same repository. Define canonical/symlink/worktree aliases, token acquisition/release, uncertain orphan retention and stale-lock handling. Never kill or adopt by PID alone.
3. **Commit protocol:** exact journal/root/manifest paths, authoritative commit marker, revision/owner checks, file and directory synchronization/readback, orphan staging policy and bounded read limits. Define which crash windows are readable/held; atomic rename alone is not proof of power-loss durability. Do not discard unknown tails as if they never happened.
4. **Legacy versus actor execution:** decide the valid single-implementer legacy adapter and actor-pair reducer path explicitly. Do not fabricate a supervisor, a report, a settlement or a grant to make legacy input satisfy actor proofs. No independently mutable `state.workers` and `state.actors`.
5. **Migration/version matrix:** exact raw-byte backup (including rejected/binary input), explicit consent/adoption semantics, retained session paths, held diagnostics, authority/probe/telemetry/bridge peer negotiation and rollback. Config remains V2 until its separate explicit rollout; State/wire reader-writer changes must be coordinated. No partial active version bump.
6. **Effect/outcome matrix:** spawn, authority publication, prompt/control/notice delivery, report acceptance, verification, archive publication and containment; distinguish identity reservation, attempted send, transport ACK, consumer acceptance/start, native settlement and admitted-effect settlement.

## 3. Ordered implementation slices

| ID | Deliverable / files | Prerequisites and exit |
|---|---|---|
| H1-L decision | Select/review canonical legacy single-implementer admission/root amendment; no fake supervisor or parallel registry. | T09/T10 and H1-0 design. Decide before implementing the storage/legacy cutover contract; all corresponding semantic changes require review. |
| H1-A | Canonical store/owner and durable transition boundary. Proposed `actor-store.js`, `actor-host.js`; Controller integration contract. | H1-0. Single canonical writer, immutable committed prefix, bounded/torn/conflicting-input classification, explicit commit/readback and workspace ownership rules. Not a live cutover by itself. |
| H1-D (moved forward) | Held loader and read-only recovery consumers; migration contracts, Host, Controller/Main status/inspect/cancel. | Co-developed with H1-A, completed before any writable cutover. Backup exact input before replacement; preserve sessions/reports/latches/evidence/obligations; unknown legacy identity stays inert. Invalid input must remain diagnosable without starting a runtime. |
| H1-B | Durable identity/reservation and fenced effects; Host, Controller, PiRuntime/PiRpc, Worker bridge, Evidence/native/Main safety consumers. | H1-A/D. Reserve/publish/read back before granting new work; I/O outside short state transitions; recheck after waits. Unsupported effect profile rejects before inference/effects. Synchronous revoke and best-effort containment remain available if persistence fails; completion uncertainty stays held. |
| H1-C + M1-H | Coherent Controller/public-tool cutover and durable mailbox producer/service path; Host/mailbox, Main/Worker, all versioned readers/writers. | H1-B plus held consumers and transport evidence producer. Trace dispatch/report/inspect/decide/status/cancel through one owner; no synthesized legacy identity, duplicate mutable state or unsafe old-wire bypass. Durable mailbox receipts, notice/latch/outbox reconciliation and quiescent archive publication actually reach the model. |

H1-C preserves supported V1 public semantics and retained data—not every unsafe legacy startup behavior. Ambiguous old work must become held rather than “load and behave identically.” Source stages may be integrated behind a closed gate; none authorizes user-data migration or enables supervision/sleep automatically.

## 4. Transaction and failure discipline

Normal authorization path:

1. Inside the short Host transition: validate exact owner/workspace/mode, immutable assignment, budget, hold and expected revision; compute the pure non-authorizing result.
2. Durably publish the reservation/identity and required authority content, with the specified readback/commit evidence. A pure reducer `apply` result alone grants nothing.
3. Run bounded external work outside the state lock. Transport command IDs are persisted before send. ACK is not recipient consumption or effect settlement.
4. Re-enter with the original identity and fresh fence checks. Retain actual observed completion/unknown outcome; late results cannot revive old admission or erase obligations.
5. On restart, classify completed, provably not-started and unknown reservations from actual evidence. Do not infer not-started from missing ACK, an empty cache or absence of a process handle; do not automatically resend unknown work.

Safety exception: revoke local admission immediately on cancellation/disable/publication failure. Attempt durable hold publication, but if it fails, **still attempt containment of the exact live owned runtime**. Preserve/report both failures. Do not claim successful durable stop, release workspace occupancy, or grant new work until known containment/settlement and durable reconciliation exist. Never generalize this exception into permission to start new work without reservation.

Legacy/latch safety: keep the local report latch before exposure; repair exact retained content without reopening implementation authority. A notify frame only wakes scanning. Receipt production requires actual Host/consumer observations, not the fact that a file can be parsed.

## 5. Acceptance and handoff

Use NI-05–16 in the [next implementation acceptance ledger](NEXT-IMPLEMENTATION-PLAN.md#5-acceptance-ledger-for-the-next-implementation). Required paths include competing owners, held legacy input, interrupted publication, unknown spawn/send, stale callbacks, latch-only report recovery, duplicate/conflicting delivery, budget/hold persistence, rejected unsafe profiles, branch/permission invalidation and evidence revalidation.

Before AR-05, trace the complete single-implementer public path through the actual Host and durable store; qualify parser/reducer/fork/cache/archive consumers together. No unused helper, memory-only adapter or model-only probe closes H1. Independent stopped-source review and all-root static checks are required; native/crash/filesystem/install behavior remains unverified wherever execution is unavailable or prohibited.

No test/fixture/runner/generated script, dependency install, live worker, settings Apply, actual migration, commit or release is authorized by this plan. Permitted bounded no-file checks belong to the implementation pass, not this planning pass. H1 and M1-H are integrated prerequisites for R1/R2, not a reason to reopen already delivered pure M1-B semantics without a finding.

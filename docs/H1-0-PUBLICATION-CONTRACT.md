# H1-0 — publication, recovery and runtime handoff candidate

**Status: DESIGN CANDIDATE, not implemented or frozen.** This makes the pre-implementation decisions in [H1](H1-ACTORHOST-INTEGRATION-PLAN.md) concrete enough for review. [T10](T10-CONTRACT-FREEZE-CANDIDATE.md) and independent T09 acceptance remain prerequisites. No new store, lease, codec, migration, active schema or runtime admission is created by this document.

## 1. Source-grounded boundaries and open decisions

- `PairController.init/persist` currently owns mutable V1 state, a session-derived directory/lock, identity-synthesizing migration and `atomicJSON`. It must be replaced as a writer during one coherent cutover, not wrapped with a second actor registry.
- `util.atomicJSON` synchronizes its temporary file before rename but does not sync the parent directory or read back publication. `acquireLock` is session-local and reclaims based on PID disappearance. Neither is sufficient for the new durable/workspace contract; do not silently relabel them.
- `PiRuntime.reserveActivation` reserves an in-memory token before awaits, `activate` is single-use even on failure, and `revoke` is synchronous. Preserve these properties while putting durable reservations before external admission.
- `actor-model.js:checkAssignment` accepts actor-pair workflows only. **H1-L remains an explicit unsolved contract:** select a single-implementer legacy admission/root amendment, then implement and review it under the same Store/Host ownership. Do not relax the actor-pair branch, invent a supervisor, or cut over legacy dispatch directly to the current aggregate.
- This candidate selects the protocol below for review, not native filesystem qualification. Local-filesystem profile support must be established before enabling it; network/sync-folder/unsupported durability profiles fail closed.

## 2. Single owner and namespace

ActorHost is the sole domain-decision owner. ActorStore is its sole canonical publisher. PiRuntime owns process/RPC/UI handles, never canonical workflow state. Evidence verification and worker producer files supply observations to Host; they do not publish authoritative state. Controller becomes a facade/projection consumer, not a second mutable writer.

Candidate storage root: `<agentDir>/fabric-pair/stores/<storeId>/`. `storeId` is stable after explicit store creation, not derived from a changing Main session. Locators are generated safe IDs under fixed private directories; arbitrary artifact `ref` values never become unconstrained filesystem paths.

Workspace/evidence reservation key: SHA-256 of UTF-8 `pair/workspace-owner/v1\n` followed by canonical `encodePairJSON({kind:'git-common-dir'|'workspace',root:canonicalPath})`. For Git, use the real path from `git rev-parse --path-format=absolute --git-common-dir`; this deliberately excludes concurrent writers across linked worktrees of the same repository. For supported non-Git workspaces, use canonical real workspace root. Persist actual canonical cwd/repo root/common-dir facts separately. Symlink aliases map to one reservation. Revalidate these identities before every grant/verification effect; unknown or changed identity holds. This is a conservative selected scope, not a claim that distinct repositories share a reservation.

Reservations live at `<agentDir>/fabric-pair/workspace-locks/<key>/`; the store lock is `<storeRoot>/.owner-lock/`. Acquire workspace reservation first, then store lock, consistently. Exclusive creation must precede metadata publication; a directory with missing/torn metadata means initializing/unknown, never free. Candidate lock fields are all required and closed: `version:1`, `encoding:'pair-owner-lock/1'`, `scope:'store'|'workspace'` (must match its path), `token` (fresh safe token), `storeId`, `workspace` (same complete identity fields as HEAD), `owner:{ownerSession,ownerEpoch,branchRevision}`, `process:{pid,instanceId,startedAt}`. `pid` is a positive safe integer; `instanceId` is a fresh Main-process instance ID and `startedAt` its nonnegative safe-integer startup observation, not an OS-authenticated birth certificate, historical worker identity or lease expiry. Use the metadata byte/depth ceilings below. Executable validators remain H1-A work. Neither these serialized fields nor PID disappearance are a transferable capability or stale-lock reclamation proof.

No automatic steal, TTL expiry, PID-only cleanup or adopt-by-PID. Release only the exact owned token after durable quiescence and known containment/effect settlement; a failed release leaves the namespace held. Retain uncertain orphan reservations for explicit offline reconciliation. Do not delete another owner's lock in a cleanup catch. The lock API must prevent recursive cleanup from crossing a replaced/symlinked path.

Mixed old/new controllers are unsupported: an unmodified V1 controller does not honor the workspace reservation. A new lock is not proof that such a controller is absent. Cutover requires coordinated writer/peer closure and an explicit qualified migration boundary, not automatic coexistence. No side-by-side V1/V2 authorities for the same worker/workspace.

## 3. Candidate physical publication format

These are **new private H1 storage formats**, not declarations that already exist in source:

| Path | Meaning / ownership |
|---|---|
| `HEAD.json` | Sole selected commit pointer; never choose a tip by newest filename, timestamp or largest revision. |
| `commits/<commitId>.json` | Immutable exact copy of that commit's HEAD bytes, retaining the predecessor pointer. |
| `roots/<commitId>.json` | Immutable root bytes bound by the commit record. Actor root or held-evidence root; not independent actor/workflow leaf stores. |
| `archives/<segmentId>/root.json`, `checkpoint.json` | Immutable admitted old root/checkpoint with exact reference/byte facts. |
| `legacy/<captureId>/source.bin`, `backup.bin` | Exact original bytes and verified backup, including non-UTF8. Never reinterpret an omitted/oversized source as empty. |
| `staging/<commitId>/` | Uncommitted publication material; retained on uncertainty, never auto-promoted on reopen. |
| `artifacts/<artifactId>` | Host-owned immutable evidence bytes. Producer publications have separate bounded ingress directories and are not canonical commits. |

Candidate HEAD fields, all required and no extras:

`version:1`, `encoding:'pair-store-head/1'`, `storeId`, `commitId`, `revision`, `previous:null|{ref,hash,byteLength}`, `owner:{ownerSession,ownerEpoch,branchRevision}`, `workspace:{cwd,repoRoot,gitCommonDir:null|string,ownershipKey}`, `root:{kind:'actor'|'held-legacy',ref,hash,byteLength}`, `rootDigest:{domain:'state'|'migration',hash}`.

IDs/counters/hashes use existing safe grammars and integer bounds. First revision is 1 with `previous:null`; later revisions require the exact previous immutable marker/ref/hash and one-step revision increment. `root.kind` fixes its digest domain (`actor→state`, `held-legacy→migration`). Root raw-byte hash, length, canonical digest and decoded shape must all agree. Owner/workspace must agree with the held live ownership and root where applicable. Held-evidence roots have no actor admission. This union has **no legacy-executable member** until H1-L is ratified.

HEAD is canonical `pair-json/1` with no trailing newline; private marker raw hashes use exact bytes. The metadata reader must use a small separate fixed ceiling (candidate 16 KiB, depth 8) and an aggregate operation read budget; it must not use that ceiling to enlarge root/reference budgets. A source root's full existing validators and limits still apply. The reviewed H1-0 design precedes implementation; H1-A must make these header/lock fields, optionality, path layout and bounds executable before H1 acceptance/cutover. Do not create a circular requirement for H1 code to exist before the foundation T10 freeze.

## 4. Commit transaction and linearization

1. Host, under its short decision serializer, verifies current owner/workspace/mode/config, expected root revision, immutable input and all holds/budgets. Compute the pure transition; it still authorizes nothing. Install one pending-publication slot for this expected revision/token so no competing transition can publish another successor.
2. Store performs I/O outside the short Host decision lock, on one publication queue. Recheck exact lock token, live HEAD bytes and expected revision before publication. Serialize once; account for actual bytes. Write private staged files with exclusive creation and restrictive permissions. Flush and close each handle, retaining primary and cleanup errors.
3. Publish required immutable root/artifact/archive files using no-overwrite semantics on the same supported filesystem; an existing target is only an idempotent success if complete bytes/binding match. Flush containing directories. Read back bounded regular files without following symlinks, verify exact bytes/hash/length and relevant pure validators. Conflicting/torn/non-regular paths hold, never overwrite.
4. Publish and sync `commits/<commitId>.json`, including its directory. Write/flush/close a unique temporary HEAD; atomically replace `HEAD.json`; sync the store directory; reopen and verify HEAD, immutable marker and root bindings. The HEAD replacement is the selection point, but **successful durable-publication acknowledgement requires directory sync and readback too**. Unsupported sync/readback is a hold, not a silent fallback to rename-only.
5. Re-enter Host with the original pending token and current revocation fence. Adopt the committed root/view only with Store's exact verified result. If cancellation/owner change occurred while writing, retain the committed facts but issue no effect; follow with a held transition when possible. A JSON-shaped receipt supplied by a caller/worker is never a Store capability.
6. Clear the pending slot only to a known committed or explicitly held state. On ambiguous publication, reopen/compare exact committed bytes before any later normal transition. Do not restore an old in-memory model and overwrite a possibly published successor. Do not auto-delete unselected roots or staged tails as though no effect could have followed.

The Store may retain a complete validated root as its journal unit; it must not also maintain a separately writable event journal with a conflicting commit point. Archive rotation is another committed root transition, after bounded full-prefix validation/quiescence. Old bytes remain retained. No automatic archive garbage collection is authorized by H1-A.

## 5. Crash/reopen matrix

| Last known point | Read-only reopen | What may execute |
|---|---|---|
| No namespace/HEAD and no legacy/input/staged artifacts | Explicit absent/new-store classification, not implicit migration success. | Nothing until owner/profile validation and explicit first commit. |
| Source exists but backup incomplete, unequal, unflushed or unreadable | Preserve original; expose held source plus primary/rollback issues. | No replacement, identity synthesis, adoption or task replay. |
| Staged/immutable files exist; HEAD absent | Initial publication uncertain; retain orphan inventory. Do not infer empty store or select highest commit. | Nothing; explicit reconciliation required. |
| Valid old HEAD; unselected new files exist | Select and validate old committed prefix; retain unselected material as uncommitted/unknown diagnostics. | No replay of potentially attempted effects; new work requires complete reconciliation/admission. |
| HEAD replacement visible but acknowledgement/sync unknown | Revalidate marker/root/full prefix; recovered reservations remain uncertain. A readable tip does not prove a past external effect never started. | No resend or automatic resume. |
| Selected HEAD/root/reference corrupt, missing, conflicting, oversized or unsupported | Held reader; preserve exact available evidence. Never silently fall back to an older authorizing root. | Inspection and exact-live-handle containment only; no grants. |
| Archive files published but next HEAD not selected | Old HEAD stays selected; retain new archive staging. | Do not drop the old prefix or reset dedup/accounting. |
| Next HEAD selected with missing/invalid archive chain | Hold; no bounded-prefix truncation or synthetic empty context. | No grants or verification effects. |
| Containment attempted but process/effect outcome unknown | Keep owner/workspace occupancy and obligations held, even if durable hold publication failed. | Only further exact-owned-handle containment/reconciliation; no new work. |

Offline manipulation of all bytes by a principal with filesystem write access is not authenticated merely by hashes. Host permission/producer-origin checks, private ownership and supported environment qualification remain necessary.

## 6. Effect/outcome handoff

| Effect | Durable reservation before effect | Observation that may advance state | Uncertain result |
|---|---|---|---|
| Spawn | Owner/store/workspace, actor generation, session/profile selection, spawn operation identity | Exact owned PiRuntime process plus negotiated binding/readiness | Hold; never retry/adopt/kill by PID alone. |
| Authority/control/prompt send | Exact immutable content/hash, operation/command/activation identity, deadline, recipient binding | Observed write attempt and ACK separately; consumer run/consumption separately | Preserve reservation and unknown delivery; do not infer not-sent from missing ACK. |
| Report/latch/outbox | Producer keeps local closed latch before exposure; Host reserves canonical acceptance | Complete immutable content plus matching producer/session/attempt/current history | Repair identical publication only; never reopen producer authority. |
| Verification | Per-command immutable source/run binding and workspace/effect reservation | Actual command outcome and current source/effect checks | No fabricated pass or grant from batch snapshot equality. |
| Archive | Quiescence/admission cut, exact prior-root/checkpoint and retained obligations | Full publication/readback, new selected root, complete replay | Preserve old bytes and all counters/dedup; no free capacity from unproven truncation. |
| Cancel/contain | **Safety exception:** local revoke happens synchronously before any await; attempt durable hold but do not wait for its success | Exact live runtime containment and separate admitted-effect settlement | Report both persistence/containment failures; retain occupancy and debt. |

After every await, recheck current owner, generation, intent, revocation and immutable input. New effect admission always requires durable reservation and fresh fence checks. The containment exception only removes authority; it cannot authorize a spawn, prompt, verification or new workflow.

## 7. Ordered integration ownership and acceptance

1. **T09/T10:** independent source coverage, finding closure, exact final inventory/matrices and toolchain evidence. Reload/provider registration is presently required for a policy-compliant reviewer.
2. **H1-L decision:** choose/review the canonical single-implementer representation and its compatible peer/version matrix. Do not smuggle this missing branch into a storage wrapper.
3. **H1-A/D co-development:** one owner implements `actor-store.js`/`actor-host.js`, closed metadata validators and held loader, including caller-owned binary retention and read-only status/inspect consumers. No active default change or live cutover yet.
4. **H1-B:** durable reservation/effect sequencing across Host, Controller, PiRuntime/PiRpc and Evidence; preserve synchronous revoke and single-use prompt semantics.
5. **H1-C/M1-H:** coordinated public-tool and all reader/writer/bridge cutover, with no writable legacy state alongside the canonical root. Old/unsupported peers reject before inference/effects. Config rollout remains explicit.

Acceptance must exercise competing owners/aliases/worktrees, missing lock metadata, symlink/replacement hazards, every publication failure window, held source/backup mismatch, unknown spawn/send, stale callbacks, latch-only repair, duplicate/conflicting delivery, late facts, archive carryover, branch/config invalidation and immediate containment despite failed persistence. Model/static checks do not certify power-loss durability or native providers. No test/fixture/runner files, dependency installs, actual migrations, native workers, commits or releases are introduced by this candidate.

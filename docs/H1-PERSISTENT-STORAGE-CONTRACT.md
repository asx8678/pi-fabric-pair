# H1 persistent storage and dormant Host amendment

Status: implemented candidate under independent review. This is a private H1 storage/build amendment, not public cutover or overall Pair readiness. The active V1 controller is unchanged. T10 §10's fresh executable legacy root remains separate work.

## Supported native deployment

The shipped N-API 8 backend targets Darwin arm64, Node 24, macOS 27.0 or newer, private local APFS. Actual local observations used macOS 27.2 and Node 24.21.0. Other operating systems, architectures, Node majors and older macOS are not qualified by this backend. Package-level Node >=24 compatibility for the existing extension is not a claim of broader native-store compatibility.

The backend uses retained directory descriptors and descriptor-relative traversal, file creation and rename. Capabilities are addon-branded objects, not caller-supplied file descriptors or arbitrary N-API externals. Symlinked, replaced, non-private, multiply linked or non-regular selected paths reject. Unsupported preflight does not compile or download anything.

A local filesystem type cannot prove a directory is not synchronized. The trusted deployment caller must explicitly exclude synchronization for the selected canonical agent directory:

```js
await qualifyProfile(agentDir, { synchronization: 'excluded-by-operator' });
```

This operator attestation is process-local and bound to the verified root identity. Subsequent one-argument qualification checks require that registration. It is not an OS sync detector, a persisted model-supplied receipt, or effect authority. Root replacement invalidates registration. Public integration must obtain this decision through a trusted deployment path; it must not automatically attest an arbitrary configured directory. Network/sync-managed deployments remain unsupported.

Explicit local rebuild, using already installed matching headers:

```sh
NODE_INCLUDE_DIR=/opt/homebrew/include/node node src/native-store/build.js
```

The command pins arm64, minimum macOS 27.0, N-API 8 and strict compiler warnings. No install hook or runtime compilation is added. The target-specific binary is packaged with its C source/build command. Rebuilding for another target is not, by itself, qualification of that target.

## Reusable permanent reservations

Workspace reservation remains first, then Store reservation. Their directories and `anchor` files are permanent; release never deletes a possibly replaced owner's namespace. A nonblocking kernel `flock` serializes access to each retained anchor. Kernel-lock availability after a process exits is not proof of clean release.

`lock.json` retains the closed owner/workspace/process/token binding. A durable `release.json` uses the private form:

```
{version:1, encoding:'pair-owner-clean/1', token, lockHash,
 head:null|{hash,byteLength}, storeId, workspaceKey, gate:'never-admitted'}
```

Reacquisition requires exact canonical proof bytes binding the prior lock token/metadata and selected HEAD, plus the same supported Store/workspace binding. Renewal replaces lock metadata with a fresh token; a crash after renewal leaves the old clean proof invalid. Active, missing, malformed, conflicting or unknown metadata remains held even if the kernel lock is available. This is not PID/TTL reclamation.

Clean release requires exact selected HEAD, complete known inventory, no pending publication/capture, and no external effect admission. History-bearing actor roots also require a one-shot Host-private handoff bound to the capability, HEAD bytes, revision, validated quiescent model and current revocation fence. JSON cannot reconstruct that handoff. Unknown grants, reservations, obligations or actual effects cannot be discharged by native process exit or a caller's success claim.

**Current limitation:** the supported lifecycle is same-owner/same-Store, never-externally-admitted quiescence. New Main owner-session/epoch transfer, workspace transfer to another Store, and clean release after an externally admitted runtime lifetime remain unsupported. `markStoreAdmitted` is irreversible in this slice and must run before any future external effect. Do not call these limitations completed runtime settlement.

## Host transition boundary

The dormant Host exposes `initialize(expected, root)`, `transition(expected, event)`, `planArchive(expected, checkpoint)`, `archive(expected, checkpoint)`, `inspect`, `project`, `revoke`, and `release`. Expected bindings are `{owner, workspace, configSnapshot, branchRevision, revision}`.

Initialization requires truly absent storage and an empty exact-owner actor-pair genesis. There is no arbitrary public root-replacement method. Host validates/captures inputs, checks exact expected bindings, computes the frozen pure reducer result against its privately adopted model, and publishes only that candidate. A pending publication token blocks conflicting transitions. Adoption requires the exact Store result; synchronous revocation prevents late facts from restoring admission. Inspections and pure reducer/model results remain non-authorizing. No actual worker runtime is attached in this slice.

Held input stays non-authorizing and cannot become fresh executable legacy work. The actor-pair gate is unchanged. Owner transitions needing a new Store ownership protocol reject instead of rewriting genesis/history.

## Archives and bounded physical history

Archive planning and resolution use the frozen checkpoint/archive-context validators and full actor replay. The old selected root and checkpoint are immutable publications before the successor HEAD. Source bytes, hashes, references, cumulative counters, deduplication and projected state must agree. Reopen resolves and validates the same complete context. Replay reconstructs facts and never resends effects. Unresolved obligations block rotation where the frozen replay contract requires quiescence.

This slice retains all physical predecessor markers and roots; it does not reset `previous`, revisions or accounting and does not garbage-collect history. The private physical limit is now **48 commits and 256 aggregate inventory entries**, replacing the initial 64-total-entry budget that exhausted at roughly eighteen commits. The native per-directory ceiling remains 64 entries and the Store operation read budget remains 64 MiB; existing actor/reference bounds are unchanged. Preflight includes transient publication and final readback costs. Exhaustion must reject before selecting an unrecoverable successor.

Archives therefore do not promise unlimited runtime or remove the physical cap. A further bounded physical-checkpoint/retention design is needed to continue beyond this retained-prefix limit without discarding evidence.

## Typed source and shipped runtime

Host/archive/quiescence implementations are checked `.mts` sources and statically imported shipped `.mjs` artifacts. Runtime never imports `.ts`/`.mts` from `node_modules` or invokes TypeScript. Strict typecheck includes typed sources and build scripts; no suppression or source exclusion substitutes for checking.

```sh
npm run build:host
npm run check:host
npm run typecheck
npm run pack:check
```

`build:host` performs strict typecheck before explicit generation. `check:host` rejects stale generated artifacts; packaging checks it. Building requires the pinned development compiler, not a new runtime dependency. Packed-load qualification must use ordinary Node from a disposable `node_modules` location, not a development-only TypeScript loader.

## Acceptance boundary

Exact source hashes, independent review findings, disposable native and packaged lifecycle observations, and remaining work are recorded in [H1-EXECUTION-LEDGER.md](H1-EXECUTION-LEDGER.md). Typecheck, native build, same-owner dormant reopen and source review are not proof of power-loss durability, provider behavior, a settled real worker, or H1-B/C completion. Public cutover stays closed until the remaining owner/effect/legacy/mailbox integration is accepted.

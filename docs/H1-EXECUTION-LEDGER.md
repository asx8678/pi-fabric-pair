# H1 execution ledger

> Parked architecture checkpoint: this ledger is not the supervised MVP delivery gate. The owner chose the existing public Controller/PiRuntime workflow; ActorHost/Store/native/archive sources are preserved but excluded from its package. See `ACCEPTANCE-LEDGER.md` for the current MVP observations. The hashes and packaging metadata below describe the earlier H1 checkpoint, before that delivery cut.

Status: PARTIAL persistent-Store/Host/archive implementation checkpoint; the final native/Store correction reviews passed for their bounded scopes. H1-B/C, new-owner transfer and admitted-effect settlement remain unfinished. NOT runtime-ready. The current pass and private-format amendment supersede earlier Linux-temporary-only/permanently-unreleasable implementation descriptions below; earlier hashes and findings remain historical evidence. The user authorized H1 repair, independent re-review, H1-B/C integration, and disposable runtime qualification. No new comments or test files, no valuable-workspace or unattended qualification, no automatic migration, no dependency installation, commit, or release.

## Next blocker implementation pass

The user requested the next persistent macOS ownership/release, Host transition, and archive work. This pass is implementation, not authorization to enable public cutover or relax unresolved safety conditions.

| Check | Acceptance observation | State |
|---|---|---|
| P1 | Real native descriptor-anchored I/O on local macOS persistent private storage; no Linux-/tmp-only workaround, no silent compilation or network dependency fetch | Implemented; native build and disposable APFS checks passed on the exact qualified target; power loss unqualified |
| P2 | Acquire, valid publication, durable clean release, and reacquisition; competing owners rejected; abrupt owner death, malformed metadata or invalid release proof remain held | Same-owner never-admitted lifecycle observed; live/cross-Store workspace contention, SIGKILL and malformed proof stay held. New-owner/admitted-effect transfer OPEN |
| P3 | Namespace replacement and symlink hazards cannot redirect owned mutation; stale capability cannot publish or release a newer owner | Anchored identity/type-tag handling reviewed; bounded native checks passed. No arbitrary same-UID mutation or exhaustive race/crash certification |
| H2 | Host computes legal pure transitions from its exact privately adopted model; arbitrary replacement roots rejected; failed/late publication cannot revive admission | Non-admitting actor-pair boundary reviewed; legal transition/fence/reinitialization checks observed. Real effect runtime OPEN |
| A2 | Archive/checkpoint publication and reopen preserve counters, deduplication, retained debt and replayed state; no auto-reexecution or premature truncation | Quiescent archive/reopen/dedup observed; replay/retention source-reviewed. Real mailbox/debt carryover and effect settlement unqualified |
| A3 | Physical commit/inventory/readback capacity remains bounded across archive and later publication; old immutable bytes retained and explicit capacity failures precede mutation | Final per-directory/overlay-budget corrections FIX VERIFIED; mutation-free capture overflow and near-budget archive rejection observed, with provenance below |
| Q2 | Independent stopped-source review plus strict types, packaging/native build, direct disposable lifecycle probes and exact source hashes | Scoped reviews passed; strict types/generated freshness/packaged load/targeted native checks passed. Not whole-H1 or public-runtime acceptance |

Astra implemented Store/I/O/native backend and build integration; Kimi implemented the Host/archive adapters. Main integrated corrections and evidence; independent Astra/GLM reviews and DeepSeek packaged observations are recorded below. All source authors and reviewers have stopped. Native code/build support is permitted as production implementation; no tests, test fixtures/runners, dependency installation, user settings changes or real-data migration are introduced.

A native kernel lock is not a crash-recovery proof: a free OS lock with an active/unknown durable lease must remain held. Any reusable permanent-lock namespace or physical checkpoint-format change requires an explicit private-format amendment and independent review before acceptance. The table distinguishes witnessed scopes from still-unqualified scenarios.

## Persistent Store / Host / archive checkpoint

The private-format and deployment amendment is [H1-PERSISTENT-STORAGE-CONTRACT.md](H1-PERSISTENT-STORAGE-CONTRACT.md). Supported observations target Darwin arm64, macOS 27.2, Node 24.21.0 and private writable local APFS, with explicit process-local operator synchronization exclusion. Native loading requires Node major exactly 24 and macOS >=27.0. The profile explicitly reports `powerLossQualified:false` and `syncFoldersSupported:false`; an APFS/local/private check is not a synchronization detector.

### Independent findings and correction closure

| Review | Verdict and disposition |
|---|---|
| Native `26a41b13e3ec47bc850757b005ff6324` | Prior foreign-pointer HIGH, primary/cleanup errno and unknown-sync qualification corrections verified. One remaining MEDIUM: inventory hid compound ENOENT/cleanup failures |
| Host/Store/archive `a793e0a8d9a54db0b417e2113280898a` | No authority resurrection identified in the non-admitting boundary. Three MEDIUM preflights: rejected owner poisoned a clean lease; capture 65 exceeded a per-directory bound; archive completion budget checked after archive mutation |
| Native correction `61572e19ce8b4892ab9b6d45583a5f83` (GLM) | CLEAR on stopped native/IO source and binary. Native errors now carry operation metadata; only uncomplicated initial open-directory absence normalizes to an empty complete inventory. Identity-validation/compound/cleanup failures remain incomplete with diagnostics |
| Store correction `6e842ce7c76846e6bee69210c9e9d73b` (Astra) | FIX VERIFIED for all three, exact before/after Store hash. Both proofs, selected binding, inventory and completion capacity precede either existing lock replacement; per-directory bounds precede mutation; archive overlay validation and measured completion budget precede writes, with postwrite validation preserved |

The correction review found no concrete local regressions or unresolved correction blockers. These are scoped verdicts, not certification of H1-B/C, power-loss durability or an attached worker. Native allocation-error/OOM handling remains an unqualified extreme-failure path; no allocator-fault qualification is claimed.

### Executed observations and provenance

- Independent packaged qualification `37cc1f96a2f0444ab2ad821da8a68fd6` (DeepSeek), before the final four corrections: actual `npm pack` with prepack, extraction into disposable `node_modules`, ordinary Node import of shipped `.mjs` and native addon; initialize/transition/release, fresh-process same-owner reopen and later transition; archive/reopen, duplicate event rejection, new event publication; exact fence, reinitialization, JSON/cross-capability handoff, unknown material/admission, missing/corrupt archive rejection. It did not use a TypeScript loader or start workers/inference. Its Store hash was `86eb02d1f284f70e8235f75c8c26525c46bedf42b21be2f07adfa547e2563d0f`; unchanged Host/archive hashes appear below.
- Correction author `f403f6eea99c468ba441a8a2a53ac753` (Astra), final Store hash below: init/release/reopen/rotation; rejected owner mismatch and malformed second proof leave both reservations unchanged; interrupted renewal remains held; capture 65 rejects without mutation. A synthetic 1,428,327-byte root with nine retained commits caused archive budget rejection before any Store-tree/HEAD mutation; later publication and clean release succeeded. These particular near-budget/history-bearing-owner probes are author-executed, independently source-reviewed, not independently reproduced.
- Main, final native/IO hash: explicit native rebuild using installed compiler/headers; real missing/empty directory behavior, native operation metadata and forged-capability rejection. In-process injected primary-plus-cleanup, identity-validation, AggregateError and retained-anchor-cleanup failures all returned `complete:false`; nested causes were retained. Injection does not reproduce a native `close(2)` failure.
- Main, final packaged Store hash below: actual tarball contained 104 files, including the native addon and shipped Host modules, with no tests/fixtures or bundled dependencies; extracted to disposable `node_modules` and loaded with ordinary Node. A separately spawned owned child acquired the Store; same-Store and different-Store/same-workspace attempts stayed held. After Main killed only that child with SIGKILL and observed its exact exit, reacquisition still stayed held and original lock bytes were unchanged. This is process-death evidence, not a power-loss simulation.
- Main, same final package: corrupting the second reservation's clean proof rejected acquisition without changing either lock record; restoring the exact proof allowed same-owner acquire/release. Sixty-four pending captures remained readable; capture 65 rejected without any legacy-directory change. Release correctly stayed held while captures were unresolved. Owned descriptors/processes were closed and all disposable tarball/package/Store/workspace data removed.
- Final strict `typecheck`, `check:host` and whitespace checks passed. The native source was explicitly rebuilt; no installation/download or automatic compilation occurred. Public Main dispatch/decide/inspect/status/cancel still use `PairController`; Worker `pair_report` remains registered. No live public module imports the new Host, and `Host.inspect()` still reports `admission:false`.
- Contour checkpoint `e7e8ab795e1ba8dca617de57e9d5e8be474bbcf880b5f5b2f87839cad7a49155` was advisory only: broad working-tree complexity exposure and expected typed/generated callable duplication, with no policy violations. C and native binary coverage are explicit gaps. No score-driven rewrite or correctness acceptance was inferred.

No retained test, fixture or runner files, new explanatory code comments, dependency installs, user-profile changes, real-data migration, commits or releases were added. The earlier no-inference PiRpc baseline was not rerun and is not Pair runtime qualification.

### Current source identity

| Source | SHA-256 |
|---|---|
| `src/actor-store.js` | `c777e56f8f0b6c9d1b75bf03651e6994bd9a4dadfad019e66b8540136ae808d7` |
| `src/actor-store-io.js` | `865adc826af1328d4d3735eef85232783302f299cd1d606a39cb5f646b6453f8` |
| `src/actor-host.js` | `3fdc72049f417100fb4fe3f9dc46a5b7e7d606914e1ccebc02ed7d47cba7ec1b` |
| `src/actor-host-domain.mts` | `90ec148efcecdfed48dac8c78fb3516e2847849aa6d4a83bcfcceff1cf43c3e1` |
| `src/actor-host-domain.mjs` | `c4c0bd21a48affdc2aec8f5992661332953d005cd341ec51ea179cd18beb83df` |
| `src/actor-archive.mts` | `4440d6f6ede4ec8f7221d0938ff3d31d851ac1e4cf4f704e94975337237b0cd5` |
| `src/actor-archive.mjs` | `9e4a26f9213f473b37aa8d47830653704f8d7cdc0f93ca3d5cf2174eea6e7f70` |
| `src/actor-host-quiescence.mts` | `6556170359fa9806ea01159ebda8b9822830c728b1af89ee85df9017096d4c3d` |
| `src/actor-host-quiescence.mjs` | `44d4987d41fa3df1d2468dfe25605d6cd86bd2a5d70d50c250efe2bb9d73f97d` |
| `src/native-store/store.c` | `1364fe80af2f1d3347a0bd857ca397d10ccd32fcef5e77b71edf74b0058cfe26` |
| `src/native-store/build.js` | `1259b8b0de575bba215cfe8b5a17dbc5b563d494c0bc6c1bad109320e8a4f013` |
| `src/native-store/build/store-darwin-arm64.node` | `3ea7da9b0d6b7b6ebacbe2f5bd91307f0daf5f57da132f3c888b823b857089fc` |
| `scripts/build-host.mjs` | `b410227d312acc9f29d1c9b171976d91379ad69f8aaf3c2c7bd18b87d71aebe0` |
| `tsconfig.json` | `d5fbdca58a92ca983c10bc20c42d0209234ae27060af67e825ae2fc603db188a` |
| `package.json` | `6a8a28fb3eb7c51f7cbc6e445647625666e08616d27146c98abc086cbbe08f9b` |

### Remaining implementation and readiness gate

1. History-bearing new owner-session/epoch transfer and workspace/Store handoff. A free kernel lock after unclean death must continue to hold; no PID/TTL reclaim.
2. Complete runtime effect admission, prior durable reservations, post-await fences, exact containment and durable settlement before release. Current clean release supports only never-externally-admitted quiescence.
3. T10 §10 executable fresh-legacy forms and consumers, followed by coherent H1-B/C public/mailbox producer-consumer cutover. Held evidence is never executable authority.
4. Actual integrated worker/provider/parent-loss/crash qualification on disposable workspaces. Real mailbox/debt archive carryover and power-loss behavior remain unqualified.
5. A separate physical retention/checkpoint design if operation must continue beyond the retained-prefix ceiling: 48 physical commits, 64 entries per directory, 256 aggregate entries and 64 MiB per Store operation. Archives preserve evidence but do not remove that physical ceiling.

**Pair is still not ready for dependable or unattended use. Public cutover remains disabled.**

## Baseline

The independent Astra H1-A review (`4b99e6ff5b5d487586188c3d5614b2f2`) returned FINDINGS: A01–A19, two blockers, thirteen high, four medium. Main source inspection confirmed both blockers, evidence overwrite, and absent Host integration. Typecheck and pack:check passed before this repair pass; neither is runtime acceptance. Public tools still route to legacy PairController. The H1 integration plan's original no-implementation statement is historical: store/Host scaffolding exists but is not accepted.

## Earlier repair acceptance checks (historical)

| Check | Required evidence | Current state |
|---|---|---|
| A01/A02, NI-05 | Canonical workspace plus store exclusion; exact retained ownership capability; live HEAD/revision compare before publish; competing/stale owners rejected | PARTIAL: static identity/continuity repairs reviewed; native ownership and full Host transition boundary open |
| A03/A04/A06/A19, NI-07 | Private supported filesystem; identity-safe namespaces; no-overwrite immutable publication; full writes, ancestor sync and readback; uncertainty holds | BLOCKED by R4: no supported persistent/Darwin ownership or clean release/reacquisition |
| A05/A07/A08/A09/A10/A15/A16, NI-07 | Bounded strict canonical reads; complete root/prefix/reference validation; preflight size/depth; selected data verified before admission | PARTIAL: supported static paths reviewed; archive and full-size supplied-root publication remain unsupported |
| A11/A12/A18, NI-06/07 | All namespace inventories bounded with explicit incompleteness; crash outcomes and primary/cleanup errors preserved | Static fixes reviewed; bounded recovery/diagnostic observations passed; native crash behavior open |
| A13/A14/A17, NI-06 | Exact immutable source/backup snapshots, including empty and malformed input; repeated conflicts preserve original evidence | Static repairs and disposable I/O checks passed; positive owned capture unqualified on Darwin |
| Independent H1-A/D acceptance | Stopped-source Astra review of exact repaired source; corrections independently rechecked | Reviewed with residual acceptance gaps; NOT PASS |
| H1-L executable root | Resolve T10 §9 executable held-legacy language against nonAuthorizing HeldLegacyEvidenceV2 through a closed, independently reviewed amendment; no fabricated supervisor/history | T10 §10 design selected; executable forms/consumers not implemented |
| H1-B, NI-08/09/10/14/15/16 | Prior durable reservations for effects; fresh fences after awaits; synchronous revoke plus containment even when publication fails; unknown completion retained | BLOCKED / NOT IMPLEMENTED |
| H1-C/M1-H, NI-11/12/13 | Dispatch/report/inspect/decide/status/cancel through one Host; actual durable producer/consumer receipts; held consumers and version boundary before activation | BLOCKED / NOT IMPLEMENTED; public import gate remains closed |
| Qualification | Strict all-root typecheck, packaging, registration/version checks, bounded inline filesystem/process/native probes on disposable workspaces; explicit limits for power loss and unsupported environments | Types/package/inventory and isolated observations passed; integrated Pair/native/crash qualification open |

## Work ownership

- GLM 5.3: initial store research; run timed out after 900 seconds without writing source. No implementation acceptance is attributed to that run.
- Astra author runs: Store/Host repair and targeted corrections.
- Kimi K3: read-only root/cutover design and path trace; its executable-held wrapper proposal was rejected in favor of T10 §10's distinct fresh branch.
- DeepSeek V4.1 Flash: runtime fence audit, qualification plan, and isolated no-inference PiRpc observation.
- Main: ledger, integration decisions, source-only recovery display corrections, and independent disposable observations.
- Independent Astra reviewer runs: separate clean contexts from author runs, verifying stopped source and exact hashes.

Writable public cutover stays closed until prerequisite checks pass. A helper, successful command, advisory structural score, or model verdict alone does not close an acceptance row. Power-loss durability cannot be established by source inspection or normal process-crash probes.

## First repair checkpoint

Astra author run `595a464b0ad9400ea3e10bca2cf5ef24` completed the first coherent repair, adding `src/actor-store-io.js` and revising Store/Host. Its 49 inline checks are author-reported, not independent acceptance. Main independently ran typecheck, packaging and `git diff --check` successfully at these hashes:

| Source | SHA-256 |
|---|---|
| `src/actor-store.js` | `90f4b7e8838fe3c2b33e47ccc711432cc953b47158342f5d212d815c75c6598d` |
| `src/actor-host.js` | `b22d04a549ffb64292c3268ec525287c82f4b66953cbade53fc1fd90d3042195` |
| `src/actor-store-io.js` | `3fca236138ab3a3ca56d960ea29f639c8704497d31821c9cfcb1eddbabd8bb55` |

Main's 19 disposable inline observations passed: exact binary/private immutable I/O; conflict rejection with original bytes retained; per-file and aggregate ceilings; symlink rejection; zero-byte I/O; explicit absent classification; invalid-UTF8 and dangling selected HEAD held; bounded inventory overflow; primary-plus-cleanup retention; detached publication buffers; forged publication/capture capability rejection; zero startup timestamp; canonical workspace aliases; Host publication before ownership rejected; unsupported Darwin acquisition holds before namespace mutation. Temporary data was removed. These do not establish positive owned-store publication, release or runtime admission.

### Independent review: FINDINGS

Clean reviewer `4b2088ff35814387a83518c317ff9f1e` verified all three hashes before and after reading stopped source. The earlier queued reviewer `079b4209ab53427888b9deed05abef7a` was INCOMPLETE because its author wait used a malformed identifier; no acceptance is attributed to that run.

The clean review closed the original creation/byte/codec/inventory/snapshot/schema defects in the supported static paths, but found seven remaining issues:

| ID | Finding | State |
|---|---|---|
| R1 | Mutation helpers reopen fresh path identities rather than the acquired namespace identities | FIX VERIFIED, supported static path |
| R2 | Independently valid replacement roots can reset logical history despite a valid physical predecessor | Continuity FIX VERIFIED; complete Host domain-transition boundary remains open |
| R3 | Strict rejection loses available held-root/source visibility; source-kind limits too narrow | Recovery display corrected through focused reviews; source-kind observation limits fixed; full-size supplied-root publication remains limited |
| R4 | Release permanently retains reservations; Linux temporary-only write profile excludes persistent/Darwin deployment | OPEN, blocks H1-A/D acceptance |
| R5 | Resulting inventory/final-readback capacity not fully reserved before HEAD replacement | FIX VERIFIED; finite capacity rejects before mutation, archive rotation absent |
| R6 | Exported HEAD validator accesses nested kind getter before rejecting it | FIX VERIFIED |
| R7 | Nested primary/cleanup detail lost by diagnostic stringification | FIX VERIFIED |

Author correction run `d54bae238bcf49c392ae5282fa47f586` completed its changes; Main then corrected the residual source-only recovery display and metadata-preservation issue. All source authors and reviewers have stopped. The remaining gates are not waived: safe rejection of unsupported deployment is not usable release/restart support, and H1-B/C cannot be declared complete while H1-A/D remains unaccepted.

## Native transport baseline, not Pair qualification

DeepSeek run `1ac5095b56f342c9b0ce6de1f2e98978` reported two successful bounded no-inference launches of installed Pi 0.87.1 through the real `PiRpc`, using isolated temporary cwd/agent/session directories and offline/discovery-disabled flags. `get_state` and `get_commands` responded; there were no prompts, faults or provider inference. Exact child close was observed with code 0, expected true; disposable state was removed after known stop. Main did not independently rerun this passing baseline.

This establishes only the observed local transport startup/response/close path. It did not load a Pair worker or Fabric, exercise producer reports/grants/verification/cancellation/parent-death, qualify owned Store publication on Darwin, or establish effect settlement or power-loss durability. NI-08–16 and native end-to-end acceptance remain open.

## Earlier repair checkpoint and limits (historical)

Independent reviewer `569f79f060d043e9aed910ca7d89a741` verified R1/R2/R5/R6/R7 on the stopped correction source, retaining R3's missing-backup display gap and R4. Main added a source-validated, backup-unverified display without changing persisted declarations or assigning relaxed evidence. Reviewer `263520678ed44209be5cf339f47e7e89` identified an unknown-backup-field sanitization defect in that fallback. Main preserved the complete original declaration while changing only the observed availability discriminant. Reviewer `5564d7002fb94cfc8db3a9d5a6c144d9` returned FIX VERIFIED for that exact bypass, with matching before/after hash. These are bounded correction verdicts, not full H1 acceptance.

Final source identity:

| Source | SHA-256 |
|---|---|
| `src/actor-store.js` | `44bee7a67e3d42b7e24b2733fdae4ad0e8cc4195a21905e19776861ebb2e93c0` |
| `src/actor-host.js` | `3437ba3e46c0629bae52591de02edde75937d35477534a2feb620cbf4513002b` |
| `src/actor-store-io.js` | `6ea76e4acbf6cdc5bbc4468d808d05c5401dbacd2c27a991b6f1a34de4164aa8` |

Main's additional disposable observations: eight recovery/diagnostic checks, four recognized-session/debt cases (missing backup, corrupt backup, intact backup, tampered source), and four strict-metadata cases (valid, unknown backup field, unknown reference field, unknown root field). All passed after correcting the probe's initially fabricated workspace key to the real canonical resolver result. The initial invalid key was correctly rejected. Temp data was removed; no test/fixture/runner files were added to the repository.

Strict no-emit typecheck and whitespace checks passed at the final source hash. Package dry-run inventory contains 92 files, including all three store/Host modules and no bundled tests or dependencies. Main public dispatch/decide/inspect/status/cancel and Worker pair_report registrations remain present. Frozen actor-model/runtime/rpc/worker hashes remain unchanged. No live module imports the new Host/Store. Structural Contour output is advisory only and confers no correctness acceptance.

**Remaining implementation, not a permission issue:** a reviewed persistent filesystem backend for the actual target platform; identity-safe clean release/reacquisition after durable quiescence and known effect settlement; the full Host domain-decision boundary; archive/replay capacity and obligations; T10 §10's executable fresh-legacy forms; H1-B reservations/fences and H1-C coordinated public/mailbox cutover. Then qualify the actual integrated worker lifecycle on disposable workspaces. The current Linux temporary-only, permanently retained-lock implementation is not a usable persistent product and is not presented as completion of the user's request.



# Fabric-first plan

Prepared 2026-09-27. **Status:** Phase 1 items 1.1–1.5 are implemented in Pair only (see the ACCEPTANCE-LEDGER entry of 2026-09-27); 1.6 needs native-run authorization. Phases 0 and 2–5 wait for the owner decisions in section 4.

| Component | Version inspected |
|---|---|
| Pair | commit `61981db` plus the uncommitted cache-warming removal |
| Fabric | 0.97.0, commit `9bf9503`, in `../pi-fabric`; installed 0.97.0 since 2026-09-27 (was 0.96.3) |
| Fovea | 0.31.1, commit `3e9d89f`, in `../pi-fovea` |
| Pi | 0.87.1 installed; reference source `b313731b8` |

## 1. Direction

Fabric is Pair's base. Pair keeps only what Fabric does not provide: a supervised, evidence-backed review loop around one worker. Everything else is taken from Fabric or requested upstream, not rebuilt in Pair.

1. **Stop building a second actor system.** NEXT-IMPLEMENTATION-PLAN §8 P1–P5 plans a Pair-owned actor host, store, mailbox, supervisor and sleep/wake. Fabric already ships persistent actors (`agents.create`), serial mailboxes, mesh compare-and-swap state, durable residency, and Jev/Foreman supervisors.
2. **Stop switching Fabric off for Main.** Pair requires `agents.maxDepth: 0`, `executor.shellHangMs: 0` and `prewalk.enabled: false` in the Fabric profile that Main shares with the worker. Main therefore loses child agents, workflows, councils, `rlm`, automatic background shells and prewalk.
3. **Keep Pair's retained worker runtime for now.** Fabric's actors close their Pi process after every activation, and Fabric does not export its local Pi worker manager. Re-evaluate moving the worker onto a Fabric actor once Fabric can keep an actor's process alive.

## 2. Re-check of the earlier recommendation

The review earlier in this session proposed five small items. Each was re-checked against source.

| Earlier item | Re-check | Outcome |
|---|---|---|
| Use `fovea_impact` in review | Confirmed. `fovea_impact` accepts `files`; every checkpoint carries its exact changed-file list; Pair never mentions the tool. | Keep, Phase 1.4 |
| Approval risk for `pair_*` tools | Confirmed that captured-tool risk comes only from the user's `capture.risks` (`pi-fabric/src/capture/catalog.ts:76`). Every Fabric risk class defaults to `allow`, so this only affects users who tighten approvals. | Demote to a documentation snippet, Phase 1.5 |
| Port Fabric's oversized-history fix | Corrected. `agent_end.messages` holds the current run's new messages, not the session (`pi/packages/agent/src/agent-loop.ts`). A larger exposure exists: `/pair transcript` calls `get_messages`, which returns the whole current context in one line, and an oversized or malformed reply holds the worker. | Keep, re-scoped, Phase 1.3 |
| Port Fabric's stalled-retry watchdog | Porting it would re-implement a Fabric feature. Pair already warns after five silent minutes and pauses at the step time limit. | Drop |
| Check Fovea turn sync in Main | Confirmed in code. On every Main `turn_end`, Fovea polls watched roots and sends a `steer` with `triggerTurn: true` when files changed (`pi-fovea/src/index.ts:474`). The worker's edits count. | Keep as a live check, Phase 1.6 |

New findings from the re-check:

- **Shared-profile restrictions** (section 1, point 2) are the largest way Pair under-uses Fabric. The owner's draft `../fabric-issue-per-process-restrictions.md` already describes the upstream fix. Fabric has no supported per-process config: `PI_FABRIC_AGENT_DIR` only moves session exports, and the variables Fabric sets for its own children (`PI_FABRIC_DEPTH`, `PI_FABRIC_TOOL_ALLOWLIST`, `PI_FABRIC_CAPABILITY_REQUIREMENTS`) are undocumented and digest- or budget-coupled.
- **The prewalk requirement is stricter than needed.** Fabric auto-arms prewalk only when `prewalk.alwaysRearm` is true and the session is a Fabric root (`pi-fabric/src/prewalk/arm.ts:68`). Requiring `alwaysRearm` not to be true protects the worker and gives Main manual prewalk back.
- **Pair would start inside Fabric child agents.** `roleFromEnvironment` (`src/extension.js:6`) treats every process without `PI_FABRIC_PAIR_ROLE` as Main. Fabric's Pi children load extensions by default, so once Main can spawn agents, each child would register a Pair Main controller and, with `autoStart`, try to start its own worker. Today `maxDepth: 0` hides this. It must be fixed before any restriction is relaxed. Fabric's resident host runs with `--no-extensions`, so only agent and actor children are affected.
- **Residency matters less for cache than the README implies.** Provider prompt caches key on the request prefix, so a resumed session with an unchanged prefix should still read from cache within the provider's TTL. A live process mainly saves startup time and keeps in-process extension state warm, such as Fovea's code graph. Phase 5 measures this before any migration decision.

## 3. Scope check

| Planned work | Current scope reference | Status |
|---|---|---|
| Child-inert guard, transport fixes, Fovea review guidance, docs | SCOPE-OF-WORK §4 runtime/ownership and context items | In scope |
| Relax prewalk requirement to `alwaysRearm` | Profile policy is Pair's own; §6 lists compatibility decisions | In scope; record the decision |
| Stop P1–P5 actor host, store, supervisor, sleep | NEXT-IMPLEMENTATION-PLAN §8; SCOPE-OF-WORK header and §10 point to it | Scope change, needs D1 |
| Retire or archive the parked actor layer | ACCEPTANCE-LEDGER: "Park, do not finish or delete" | Scope change, needs D2 |
| Upstream requests to Fabric and Fovea | SCOPE-OF-WORK §5: "prepare a separate request and seek explicit scope approval" | Needs D3 |
| Worker-only restrictions; Main uses Fabric agents | §5 forbids Pair changing shared settings; DEF-10 Main single-writer is open | In scope once U1 ships; widens DEF-10, needs D5 |
| Move the worker onto a Fabric actor | §5: "Not part of this work: replacing … with upstream Fabric actors/SDK" | Excluded today; needs D1 and U2 |
| Automated tests | SCOPE-OF-WORK header and §10 say the suite was removed again; commit `61981db` restored it and `npm test` runs | Docs are stale; needs D4 |

## 4. Owner decisions

- **D1 Direction.** Adopt Fabric-first. Amend SCOPE-OF-WORK §5 and retire P1–P5 of NEXT-IMPLEMENTATION-PLAN §8. P6 (configuration and observability for the existing single-worker mode) and P7 (separately authorized native qualification) remain.
- **D2 Parked actor layer.** Either keep it parked unchanged, or tag it and remove it from the main tree. Recommended: tag and remove. It is 11,231 lines plus 306 in `src/native-store/`, and no live module imports it.
- **D3 Upstream requests.** Approve filing U1–U3 in section 6, plus the existing `../fabric-issue-mesh-highwater.md` draft.
- **D4 Test policy.** Confirm the restored offline suite is current regression coverage, and correct the scope wording.
- **D5 Main's agents during an active task.** After Phase 4, Pair cannot block `agents.*` in Main, because provider actions do not pass Pi's `tool_call` hook. Choose one:
  - Guidance plus existing checkpoint drift detection.
  - Recommend `approvals.agent: "ask"` in Fabric.
  - Keep Main's agents disabled until Fabric offers a gate.

## 5. Phases

```text
Phase 0 decisions ─┬─ Phase 1 Pair-side fixes ──────────────┐
                   ├─ Phase 2 retire duplicated roadmap      │
                   └─ Phase 3 upstream requests ─┬─ U1 ships ─┴─ Phase 4 worker-only restrictions
                                                 └─ U2 ships ─── Phase 5 evaluate worker on a Fabric actor
```

### Phase 0: record decisions

- Commit the pending cache-warming removal as its own change.
- After D1–D4, add the section 8 text to SCOPE-AMENDMENT.md and correct the test-policy wording in SCOPE-OF-WORK.
- **Exit:** the decisions are recorded and the working tree is clean before Phase 1 starts.

### Phase 1: Pair-side fixes

No upstream dependency. Each item is small and independent.

**1.1 Stay inert inside Fabric children.**
- In `src/extension.js`, when `PI_FABRIC_PAIR_ROLE` is unset and `PI_FABRIC_PARENT_RUN` is set, register nothing: no tools, commands or hooks.
- Without the marker, behaviour is unchanged, so an unrecognized child fails toward today's behaviour.
- The marker is undocumented; U1 asks Fabric to document it.
- **Tests:** `roleFromEnvironment` cases for child, worker and Main environments.

**1.2 Relax the prewalk requirement.**
- `nativeSettings` (`src/native.js:88`) also reads `prewalk.alwaysRearm`.
- `nativeProfileBlockers` (`src/native.js:108`) replaces the `prewalk.enabled = false` blocker with "`prewalk.alwaysRearm` must not be true".
- Add the new stored-probe field as optional in `src/contracts.js`, so probes already on disk stay valid. Keep the `requirements.prewalkDisabled` key name for config compatibility and document its narrower meaning.
- Update the doctor line (`src/ui.js:695`) and the profile snippets in README, QUICKSTART and SECURITY.
- Backstop: an in-place prewalk switch changes the worker's model, which Pair already detects as model drift and holds.
- **Tests:** `tests/native-profile.test.mjs`.

**1.3 Keep large payloads off the RPC frame path.**
- **(a) Transcript.** `PairController.transcript` (`src/controller.js:1544`) reads the verified session tail that `PiRuntime` already keeps (`#history.tail`, the last 64 entries) instead of calling `get_messages`. A read-only view can then no longer fault a running worker.
- **(b) Oversized lifecycle events.** In `src/rpc.js` `consume`/`frame`, when an incomplete line that starts with `{"type":"agent_end"` or `{"type":"turn_end"` exceeds `maxLineBytes`, discard the rest of that line and emit the event without its payload arrays. `PiRuntime` reads neither `messages` nor `toolResults`. Any other oversized frame still faults.
- This fixes Pair's own transport, which Pair must own until U2. It is not a re-implemented Fabric feature.
- **Tests:** `tests/rpc-framing.test.mjs` with an oversized `agent_end` line; a transcript test on a fake retained history.

**1.4 Review with Fovea.**
- When Main's probe reports Fovea, the report requirement text in `reportMessage` (`src/controller.js:927`) and `compactReport` (`src/controller.js:1126`) tells Main to run `extensions.fovea_impact({ files: actualChangedFiles })` for review order and blast radius before approving.
- Add the same line to MAIN_GUIDE (`src/main.js:10`) and to "Reports and review" in `skills/fabric-pair/SKILL.md:80`.

**1.5 Document approval risk for Pair tools.**
- Add a `capture.risks` snippet to README and REFERENCE. Pair never edits Fabric configuration itself.

| Tool | Suggested risk |
|---|---|
| `pair_status`, `pair_inspect` | `read` |
| `pair_yield`, `pair_cancel` | `write` |
| `pair_dispatch`, `pair_decide` | `agent` |
| `pair_report` (worker) | `write` |

**1.6 Live check of Fovea turn sync in Main.** This needs native-run authorization under SCOPE-OF-WORK / NEXT-IMPLEMENTATION-PLAN §8.5.
- During an active task, observe whether Main receives `pi-fovea-sync` steers for the worker's edits and starts extra turns.
- Record the result. If confirmed, file U3.
- Pair does not suppress Fovea (SCOPE-AMENDMENT).

**Phase 1 exit:**
- `npm run typecheck`, `npm test`, and `check:host` while the parked layer exists, all pass.
- `pack:check` lists the same 31 files.
- An ACCEPTANCE-LEDGER entry records the work.

### Phase 2: retire the duplicated roadmap

Requires D1, and D2 for step 2.

1. **Mark the actor plans as superseded.** This covers NEXT-IMPLEMENTATION-PLAN §8 P1–P5, ACTOR-RPC-IMPLEMENTATION-PLAN, the H1, AR-03 and AR3 plans, and `../pair-actor-rpc-plan`. Keep them as history. Point the SCOPE-OF-WORK header and §10 "Current next steps" at this plan.
2. **If D2 is "tag and remove":**
   - Tag the pre-removal commit `parked-actor-layer`.
   - Remove the parked files listed in the ledger, `scripts/build-host.mjs` and `tsconfig.staged.json`.
   - Remove the `build:host`, `check:host` and `typecheck:staged` scripts.
   - Remove live-module exports kept only for the parked layer, after checking each for other callers with `tsc --noUnusedLocals` and a cross-file scan.
3. **Exit:** typecheck and `npm test` pass; `pack:check` lists the same 31 files, since the parked code was never packed.

### Phase 3: upstream requests

Runs in parallel with Phases 1 and 2 after D3. See section 6.

### Phase 4: worker-only restrictions

Starts after U1 ships.

1. **Launch the worker with Fabric's restriction layer.** Start the worker (`src/controller.js:300`) with the supported restriction layer: child agents off, `shellHangMs: 0`, prewalk off.
2. **Check the worker, not the shared profile.** Profile checks move from the shared files to the worker's effective configuration:
   - The worker probe reports its effective limits.
   - `nativeProfileBlockers` checks only the worker.
   - Main's doctor stops requiring `maxDepth` and `shellHangMs`.
   - The worker's per-shell recheck (`src/worker.js:318`) reads effective values instead of re-reading files.
3. **Let Main use Fabric agents for read-only work.** MAIN_GUIDE (`src/main.js:12`) allows exploration and independent review, for example `council.run` on a high-risk checkpoint. It still forbids handoff and prewalk for a Pair task. Apply D5.
4. **Exit:** typecheck and tests pass, then native qualification of the relaxed Main profile under §8.5 authorization.

### Phase 5: evaluate the worker on a Fabric actor

Starts after U2 ships.

1. **Measure.** This needs paid or native authorization. Compare:
   - Activation latency, cold versus warm.
   - Cache-read share on a resumed actor session versus Pair's worker.
   - Fovea graph warm-up in a large repository.
2. **Design, if acceptable.** Write a design for Pair as a Fabric component:
   - A `pair.*` provider with per-action risk.
   - The worker as an `agents.create` Pi actor with a tool allowlist and `requires`.
   - Delivery to Main through actor `followUp` and `triggerTurn`.
   - Pair's evidence and review gate unchanged.
   - This would retire `src/rpc.js`, `src/actor-runtime.js`, and Pair's own delivery and receipt code.
3. **Exit:** an owner decision. This phase is not an implementation commitment.

## 6. Upstream requests

- **U1 Fabric: per-process restrictions.** File the existing draft `../fabric-issue-per-process-restrictions.md`, which asks for:
  - A restrict-only per-process config layer.
  - Documented `PI_FABRIC_MESH_ROOT` and `PI_FABRIC_PROJECT_ROOT`.
  - A depth check on actor creation.

  Add one request: a documented way for an extension to detect that it runs inside a Fabric child, such as a supported `PI_FABRIC_PARENT_RUN`.
- **U2 Fabric: actor runtime retention and binding.** Fabric's own `docs/prompt-cache.md` names this as future work. Ask for:
  - An actor option to keep its Pi process alive for a bounded idle period between activations.
  - A way for the creating host to bind extra environment or extension arguments to an actor's child, so a host extension can assign it a role.
  - Ideally, a documented execution-backend seam.
  - `cwd` on actor definitions: actors run in the creator's directory today (Fabric's `docs/agents.md`), and a Pair worker may use its own workspace.
  - A cross-process `cache.hold` target, or a host API for it: `target` is only the calling session, so Main's Fabric cannot warm the worker. Pair uses Pi's native `cache_warming_decision` for the worker until then.
- **U3 Fovea: external-writer sync** (only if 1.6 confirms the extra turns). Ask for a way to suppress or tag sync steers caused by a known external writer, or a documented yield protocol. Fovea already yields to pi-queue-steer through a global.
- **Existing draft.** File `../fabric-issue-mesh-highwater.md`.

## 7. What stays Pair's own

These have no Fabric or Fovea equivalent and are not duplication:

- Content-addressed workspace snapshots, immutable checkpoints, diffs and blob inspection (`src/evidence.js`).
- The report, inspect and decide protocol with task, lease, attempt and report identities and duplicate protection.
- The worker authority gate: tool gate, report latch, lease fencing, detached-effect containment.
- Verification commands bound to the frozen snapshot, with drift detection. Fabric's `state.verify` runs commands but does not bind them to a checkpoint.
- The repository writer lock and Main read-only mode during tasks.
- The retained Pi RPC worker runtime, until U2 and Phase 5.
- Pair's settings, status line and dashboard.

## 8. Risks

- **The child marker can change.** 1.1 relies on an undocumented Fabric variable. It fails toward current behaviour, and U1 asks Fabric to document it.
- **Relaxing prewalk exposes the worker to arming by other extensions.** An extension in the worker could arm prewalk through `FABRIC_PREWALK_REQUEST_EVENT`. The model-drift hold catches it, and `runtime.excludeExtensions` can remove such extensions.
- **Upstream may decline U1 or U2.** Phases 4 and 5 then stay blocked and Main keeps today's restricted profile. Phases 1 and 2 still stand on their own.
- **Phase 4 widens DEF-10.** A child agent that Main spawns can write the worker's repository. D5 must be decided first.
- **Removing the parked layer drops in-tree design work.** The tag keeps it retrievable.

## 9. Proposed scope amendment text

To add to SCOPE-AMENDMENT.md only after D1–D4 are decided.

> **Fabric-first direction (decided YYYY-MM-DD).** Pi Fabric is Pair's base. Pair implements only the supervised, evidence-backed review loop around one worker. Features Fabric provides are used from Fabric or requested upstream, never rebuilt in Pair. NEXT-IMPLEMENTATION-PLAN §8 P1–P5 (actor host, store, mailbox, supervisor, sleep/wake) are withdrawn; P6 and P7 remain. The parked actor layer is [kept parked | archived at tag `parked-actor-layer` and removed]. Upstream requests U1–U3 in FABRIC-FIRST-PLAN.md are approved for filing. The SCOPE-OF-WORK §5 exclusion of Fabric actors is replaced by: "Moving the worker onto Fabric actors requires Fabric runtime retention (U2) and a separate owner decision after the Phase 5 measurements." The restored offline suite (`npm test`) is current regression coverage.

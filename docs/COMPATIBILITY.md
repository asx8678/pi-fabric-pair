# Compatibility and inspected upstream contracts

## Historical supervised MVP observation (predates the handoff changes)

**Current native qualification: NOT RUN.** The observation below predates the
report-delivery, phase/branch-fencing, retained-scope, reconciliation, repository-lock and
background-activation changes; it is
retained as historical evidence and does not qualify this checkout.

The historical public Controller/PiRuntime/PiRpc/Worker path was exercised on **Pi 0.87.1, Fabric 0.96.3, Fovea 0.31.1, Node 24 and macOS**. A disposable Git workspace and private temporary agent directory used an OpenAI-compatible deterministic loopback model, with no real provider credentials or paid inference.

Observed: real extension loading/readiness, foreground-only gate rejection of monitoring/background aliases, question/answer, worker file writes, report/immutable inspection, revision and next-step/final approval in one retained session, duplicate requests/decisions, rejection of uninspected/wrong-hash/stale approvals, cancellation of an active model stream, and confirmed worker exit on stop. The report-settlement and detached-effect fixes also received an independent scoped CLEAR source review.

This is a bounded manual qualification, not a retained automated suite, paid-provider certification, interactive TUI/permission-dialog qualification, cross-controller exclusion, process-tree isolation, automatic crash recovery or power-loss proof. See [QUICKSTART.md](QUICKSTART.md) for the supported profile. The native ActorStore and parked redesign are not MVP runtime dependencies.

## Historical source inspection

Originally inspected on **2026-09-23** from the supplied reference sources: Pi 0.87.1, Fabric 0.93.0 and Fovea 0.29.2. Before test removal, a checkpoint was run against installed Pi 0.87.1, Fabric 0.93.1 and Fovea 0.29.2 with a deterministic local provider on Node 24/macOS. Those results are historical only: their runners and artifacts were removed at the owner's direction and are no longer reproducible from this repository. No current native, provider, operating-system, terminal, or live-model qualification is claimed.

## Source targets

| Project | Package version inspected | Repository |
|---|---|---|
| Pi coding agent | 0.87.1 | https://github.com/earendil-works/pi |
| Fabric | 0.93.0 (contracts); 0.97.0 `cache` provider, result proxy and `fabric_exec` input (installed: 0.97.0) | https://github.com/monotykamary/pi-fabric |
| Fovea | 0.29.2 | https://github.com/monotykamary/pi-fovea |

Versions identify the source inspected, not npm publication status or a live
compatibility certification. Use the versions already proven in your environment,
compare these contracts and run the permitted static checks before updating.
Behavioral/native qualification requires separate owner authorization.

## Source provenance

Git blob IDs identify exact fetched files independently of later changes to `main`.

| Repository path | Git blob SHA |
|---|---|
| `pi/packages/coding-agent/package.json` | `62c01de66311365016b0513bda74aed29e181ac2` |
| `pi/packages/coding-agent/src/core/extensions/types.ts` | `41bc4e6721999a721818252875c1ebd7637a3309` |
| `pi/packages/coding-agent/src/modes/rpc/rpc-types.ts` | `1cbd49a898382f0fbb409a7d241ad694b2f59e0d` |
| `pi/packages/coding-agent/src/modes/rpc/rpc-client.ts` | `8b8b8cc380ab60ed86200749d67d80213ff6e17f` |
| `pi/packages/coding-agent/src/core/source-info.ts` | `c8c9837d1fc87dc7b3ec4facebdc34eadafc87f7` |
| `pi-fabric/package.json` | `7065083503c2cca37b36565394023d022e7dcfae` |
| `pi-fabric/src/protocol.ts` | `08ac41f2c331f9ffdaedd7497878d4ec73d99bb2` |
| `pi-fovea/package.json` | `6d1972be797a1e79e6b16bbd51a331b337685a06` |

Fabric code-search responses referenced commit
`0c742a021e229602626ca76b6db5e831f38cb258`. This is the search snapshot, not a promise
that every fetched `main` file came from that exact commit.

## Public interfaces used

- Pi extension factory; `registerTool`, `registerCommand`, `getAllTools`,
  `getCommands`, source metadata, and lifecycle hooks.
- Own UI via `ctx.ui.select/input/confirm/editor/custom/setWidget`.
- `pi.sendMessage` custom messages with follow-up/next-turn delivery.
- Read-only session identity, model registry and context observations; public `pi.getThinkingLevel()`.
- Pi JSONL commands including prompt, get_state, set_model, available effort levels,
  set_thinking_level, clear_queue, abort, get_entries, get_commands, and extension UI responses. `/pair transcript` reads the retained session file instead of `get_messages`, whose single-line reply grows with the worker's context.
- Pi `agent_settled` and compaction events. `agent_end` alone is not sufficient.
- Fabric replay of nested host `tool_call` events with fully qualified tool refs.
- Normal Fabric capture of `pair_*` registered extension tools.
- Fabric 0.97.0 `cache.status` / `cache.hold` / `cache.release` provider actions for prompt-cache warming (Pair holds no native leases itself). Pair reads the loaded Fabric's package version: below 0.97.0 Main's guide says warming is unavailable and `/pair doctor` notes it; everything else works on 0.96.3.
- Fabric's nested result proxy: provider actions (`agents.*`, `jev.*`, `mesh.*`, …) raise no `tool_call`, but their successful results pass through Pi's `tool_result` with `toolName` set to the action ref and `details.kind` `pi-fabric.tool-result-proxy.v1` (present in 0.96.3 and 0.97.0, `src/core/tool-result-proxy.ts`). The worker treats a successful `agents.spawn`, `agents.create`, `agents.import`, `agents.subscribe`, `jev.spawn`, `cache.hold` or `components.apply` as a detached effect, and so is a `schema.commit` (which writes files with no `tool_call`, `src/schema/controller.ts`) after the report latched.
- Fabric's `fabric_exec` input is one `code` string (`src/fabric-exec-tool.ts`) and its outer `tool_call` fires before the program runs. Pair reads that code, outside strings and comments, to block a worker program that calls a detaching action directly and, while Main supervises a task, a Main program that calls `schema.commit`.
- Pi's native cache warmer (0.87.1 `core/cache-warmer.js`): modes `off`/`streaming`/`idle` read from global settings only; a `cache_warming_decision` event carries `warmCost`, `missCost`, `continuationProbability` (0.15 when idle) and Pi's `action`, and the last handler's `action` wins. Pi refreshes when expected savings reach $0.05. Pi 0.87.1 has no `acquireCacheWarming`, which Fabric's `cache.hold` needs. Pi warms only models with a `promptCache` lifetime (built-in: Anthropic only; `models.json` `modelOverrides` add one, including for extension providers); Pair sets a 240 s default on the model object Pi passes to its warmer (`ctx.model` is `agent.state.model`, checked in a live process) when none is known. Pi refreshes at 90% of the lifetime, stops idle warming 30 minutes after the last real request, and records each refresh as a `usage` session entry announced by an `entry_appended` RPC event, which the worker's history check tolerates. Pair answers `cache_warming_decision` for Main while the worker works and for the worker while its report waits. Its Codex request builder (`openai-codex-responses`) sends no output cap, so a refresh there is a full reply; Pair never requests one. The ChatGPT Codex backend rejects `max_output_tokens`, `prompt_cache_options` and `prompt_cache_retention` for `gpt-6-astra` (checked 2026-09-27), so neither Pi nor Fabric can refresh or extend a Codex cache there.
- Fabric's resident-host layout: a durable request writes `<PI_FABRIC_MESH_ROOT>/residency/<sha256(root id)>/owner.json` with `format: 1`, `hostId`, `pid` and `startedAt` (0.96.3 and 0.97.0, `src/residency/protocol.ts`). Fabric launches the host before its depth check. Pair reads these files under the worker's private mesh and never signals the recorded PID.
- Fabric's `PI_FABRIC_PARENT_RUN`, which Fabric sets on every child agent and actor it launches (inspected in Fabric 0.97.0 `src/worker.ts`). Pair loads inert when it is present. The variable is not a documented Fabric contract; an upstream request asks for one. Without it, role detection is unchanged.
- Fabric's Prewalk auto-arm rule: only a root session with `prewalk.alwaysRearm: true` arms itself (Fabric 0.97.0 `src/prewalk/arm.ts`). Pair's profile check requires that auto-arm is off, not that Prewalk is disabled.
- Pi's RPC `agent_end` and `turn_end` lines repeat the run's messages and the turn's tool results. Pair delivers an oversized one by type only, since it reads neither payload; any other oversized line still faults the worker.

Source/documentation references:

- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md
- https://pi.dev/docs/latest/packages
- https://pi.dev/docs/latest/settings
- https://github.com/monotykamary/pi-fabric/blob/main/docs/providers.md
- https://github.com/monotykamary/pi-fovea

## Adapter choice

The exported Pi RPC client was reviewed. Its basic command API is useful, but the
inspected class keeps its transport private and does not expose the full worker
UI/lifecycle control required here through the inspected public methods. Pair uses
its own small JSONL adapter instead of monkey-patching that class. It uses the
same public wire contract, not a replacement runtime.

Pair does not import Fabric/Fovea internals or require them as npm runtime imports.
They are independently loaded Pi extensions. Local JSON tool schemas are ordinary
JSON Schema objects; real Pi/Fabric schema capture must be verified in the first
local integration test. No mock test can certify an upstream schema-loader change.

Pair configuration schema V2 is the current package format. Shipped V1
`fabric-pair.json` and handoff V1 `pair.json` are accepted only as disabled
migration previews; explicit settings Apply archives the legacy source before
writing V2. Settings writes update only changed fields in the selected raw scope layer, preserving inherited values and unrelated overrides. Same-scope old/new filename conflicts and `adaptive` migration fail
with actionable errors. Handoff report/repair limits and distinct active-step/per-step
fields are migrated and enforced; handoff queue and automatic-recovery limits are
accepted and dropped (deprecated). A previously
archived handoff `.v1.bak` is imported only from an explicitly selected, scope-matching
regular file after confirmation; Pair does not search for one. These limits are not
yet enforced by R5 runtime consumers. Migration and selected-layer settings behavior
have offline coverage only. The five deterministic native scenarios exercise narrow
worker safety/retention paths, not native migration/settings or a full Main-and-Worker workflow. Clean packaged installation remains open.

## AR-02 source compatibility boundary

The retained legacy worker now uses Pair's `PiRuntime` over `PiRpc`; no upstream
actor SDK, second writer, automatic sleep, or active format change is introduced.
Installed and supplied Pi **0.87.1** public RPC/event declarations were compared.
`compaction_start/end`, assistant/summarization retries, `queue_update`, correlated
tool IDs and `agent_settled` are observed; `agent_end` is not idle. The peer `*`
does not certify other Pi versions or inherited extension combinations.

Bridge `probe/load` calls require the exact extension command/source before any
slash prompt. Fresh probe and session/model/thinking readback are checked; native
V3 history is validated and compared through full `get_entries`, not truncated
model-visible messages. Pi's actual producer persists context-edit replacements
as `{content: ...} | null`; older prose examples differ. Oversized, missing or
unverifiable history holds without replacement. Valid offline truncation before
the launch snapshot cannot be detected without an external fingerprint.

Worker dialogs are bounded and tied to startup or a current implementation
activation. Select/confirm/input use public cancellation and timeout options.
Worker editor requests are denied because Pi's editor API has no cancellation
option; Main's own editor/UI remains unchanged. An ambiguous prior generation
blocks launches and reset until its exit is proven at startup or with
`/pair reconcile`.

See [the AR-02 checkpoint](ACTOR-RPC-IMPLEMENTATION-PLAN.md#11-ar-02-source-checkpoint)
for source/static evidence and remaining gaps. None of this is native qualification.

## Pure D5 held-carrier boundary (not runtime activation)

The [held-carrier amendment](D5-HELD-CARRIER-CONTRACT.md) extends only `projectLegacyWorkerView` with an explicit `HeldLegacyProjectionContext` alongside its unchanged archive context. It reads the existing non-authorizing held-evidence record against exact supplied source/backup bytes, preserves recognized historical profiles and unknown/corrupt data visibility, and never generates an actor, workflow, supervisor or execution identity. Raw bytes remain caller-owned until durable backup; equality is not durability or provenance. State/model/reducer admission does not accept this context. Active Config V2/State V1/wire V1, Main/Worker registrations, defaults and package entrypoints are unchanged. The source amendment is boundedly checked, not independently frozen; Host loading/adoption/public-tool routing remain gated on T09/T10.

## Environment

**Pinned static toolchain restored:** the authorized local install uses SDK/TUI 0.87.1, MCP 1.30.0, Node declarations 24.13.6 and TypeScript 5.9.3. `npm run typecheck -- --pretty false` now passes unchanged project options without path mappings, shims or suppressions. A direct TUI dev pin is required by `src/ui.js`'s type-only `Component` import; SDK-private nesting is not a root dependency. Production source is unchanged. Lifecycle scripts were disabled and no native/runtime qualification follows; [checkpoint](T10-CONTRACT-FREEZE-CANDIDATE.md#8-authorized-pinned-toolchain-follow-up).

Target: Node >=24, because Fabric 0.93.0 requires it. The current working-tree checks passed on Darwin 27.2.0 arm64, Node 24.21.0, and Apple Git 2.54.0. The historical source artifact also ran its earlier 55-test suite on Linux/Node 22, but that does **not** qualify the upstream Fabric stack on Node 22.

The profile exercised by the five native scenarios is explicitly enabled and uses one writer with persisted sessions; this is not full V1 profile qualification. Its restrictions include `prewalk.enabled:false`, `executor.shellHangMs:0`, and `agents.maxDepth:0`. Explicit background shells and read-only workers with generic Fabric are rejected. Windows/Linux native operation, Bun-compiled Pi, specific live providers, custom extension combinations, terminal input/rendering, and provider cache warming still need profile-specific verification.

## Stored-state compatibility: handoff and branch fencing

Persisted state gained optional, conservatively recovered fields; all older
shapes remain readable and non-authorizing:

- `state.mainPhase` — optional `{status: open|yielded, since, ownerSession,
  ownerEpoch, revision?, runToken?, armed?, activity?}`. Interim records
  without `revision`/`runToken`/`armed`/`activity` stay readable but are never
  boundary-eligible. A stale owner binding (reload/rebind) leaves the phase
  inert; a missing phase never implies yield.
- `state.branch` — optional monotonic conversation-branch counter, advanced
  only by tree navigation. Absence is the initial/default counter value; it
  does not prove that navigation never occurred before branch tracking existed.
- Notice receipts — optional `offeredAt`, `channel`
  (`tool-result|boundary|manual`), `observedAt`, `observedBranch`. Legacy
  `delivered` statuses stay readable; NEW delivery attempts record `offered`
  and never write `delivered` as confirmed delivery, though explicit re-offer
  or pair_decide resolution may update those notices' status. Legacy receipts
  without branch metadata authorize only while the branch counter is still at
  its initial value.
- `work-order.json` (worker directory) — versioned read-only scope reference
  written at dispatch. Missing, mismatched or malformed files are omitted
  conservatively; `authority.json` validation is unchanged and still strict.
- Paused question/review/blocker holds survive controller reload and repeated
  pauses; `resume` restores the waiting decision without rotating a lease.
  Older interrupted/mid-implementation recovery semantics are unchanged.

These behaviors are not covered by any bundled automated suite; native qualification of
them is NOT RUN, and a Pair package loaded into a running session may differ from
the checkout source.

## Upgrade checklist
Record installed versions and any patches. Inspect source and run the retained
static checks: `npm run typecheck` (pinned strict project check) and
`npm run pack:check` (an npm package dry run); neither loads or behaviorally
qualifies the extension. On macOS/arm64, the optional `npm run build:host` /
`npm run check:host` commands concern the parked native source only
([private storage contract](H1-PERSISTENT-STORAGE-CONTRACT.md)) and are not
installation or packaging prerequisites. Install from the committed lockfile
with `npm ci --ignore-scripts --no-audit --no-fund`; lifecycle scripts stay
disabled, so that setup does not qualify native components. The offline suite
(`npm test`) covers the transport, runtime startup, controller recovery and
evidence paths; it makes no model requests, so passing it does not make the
package release-qualified, natively certified, or safe for unattended work.
Tool capture, settlement, permissions, compaction, Fovea continuation and session
reuse remain behavioral requirements, not currently certified outcomes. Separate
owner authorization is required for future runtime evidence. Do not weaken a
failing prerequisite merely to make the readiness indicator green.

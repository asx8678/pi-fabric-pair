# Compatibility and inspected upstream contracts

Originally inspected on **2026-09-23** from the supplied reference sources: Pi 0.87.1, Fabric 0.93.0 and Fovea 0.29.2. Before test removal, a checkpoint was run against installed Pi 0.87.1, Fabric 0.93.1 and Fovea 0.29.2 with a deterministic local provider on Node 24/macOS. Those results are historical only: their runners and artifacts were removed at the owner's direction and are no longer reproducible from this repository. No current native, provider, operating-system, terminal, or live-model qualification is claimed.

## Source targets

| Project | Package version inspected | Repository |
|---|---|---|
| Pi coding agent | 0.87.1 | https://github.com/earendil-works/pi |
| Fabric | 0.93.0 | https://github.com/monotykamary/pi-fabric |
| Fovea | 0.29.2 | https://github.com/monotykamary/pi-fovea |

Versions identify the source inspected, not npm publication status or a live
compatibility certification. Use the versions already proven in your environment,
compare these contracts, and run the acceptance checks before updating.

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
- Read-only session identity, model registry and context observations.
- Pi JSONL commands including prompt, get_state, set_model, available effort levels,
  set_thinking_level, clear_queue, abort, get_messages, and extension UI responses.
- Pi `agent_settled` and compaction events. `agent_end` alone is not sufficient.
- Fabric replay of nested host `tool_call` events with fully qualified tool refs.
- Normal Fabric capture of `pair_*` registered extension tools.

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
with actionable errors. Handoff queue/report/repair/recovery limits plus distinct
active-step/per-step fields are retained in V2 assignment snapshots. A previously
archived handoff `.v1.bak` is imported only from an explicitly selected, scope-matching
regular file after confirmation; Pair does not search for one. These limits are not
yet enforced by R5 runtime consumers. Migration and selected-layer settings behavior
have offline coverage only. The five deterministic native scenarios exercise narrow
worker safety/retention paths, not native migration/settings or a full Main-and-Worker workflow. Clean packaged installation remains open.

## Environment

Target: Node >=24, because Fabric 0.93.0 requires it. The current working-tree checks passed on Darwin 27.2.0 arm64, Node 24.21.0, and Apple Git 2.54.0. The historical source artifact also ran its earlier 55-test suite on Linux/Node 22, but that does **not** qualify the upstream Fabric stack on Node 22.

The profile exercised by the five native scenarios is explicitly enabled and uses one writer with persisted sessions; this is not full V1 profile qualification. Its restrictions include `prewalk.enabled:false`, `executor.shellHangMs:0`, and `agents.maxDepth:0`. Explicit background shells and read-only workers with generic Fabric are rejected. Windows/Linux native operation, Bun-compiled Pi, specific live providers, custom extension combinations, terminal input/rendering, and provider cache warming still need profile-specific verification.

## Upgrade checklist

Record installed versions and any patches. Run offline tests, then the no-task
startup probe and a small live task. Confirm tool capture, the settled event,
UI permissions, native compaction, Fovea continuations, and reuse of session IDs.
Do not weaken a failing prerequisite merely to make the readiness indicator green.

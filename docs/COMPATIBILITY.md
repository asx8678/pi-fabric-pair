# Compatibility and inspected upstream contracts

Inspected on **2026-09-23** using the public GitHub connector. No upstream source
checkout, dependency tree, credentials, or patched application is bundled here.
The build environment had no installed `pi` executable; it therefore could not
run a real Pi/Fabric/Fovea inference test.

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

## Environment

Target: Node >=24, because the inspected Fabric manifest requires that version.
Offline tests in the build environment ran on Linux using Node 22.16.0 and Git
2.47.3. The standalone Pair code runs there, but this does **not** lower Fabric's
Node requirement. No claim of full-stack operation on Node 22 is made.

macOS/Windows, Bun-compiled Pi, specific provider aliases, custom extensions,
terminal input/rendering, and provider cache warming need local verification.
Windows shell shims may need an executable/CLI-path configuration because Pair
uses `shell:false`.

## Upgrade checklist

Record installed versions and any patches. Run offline tests, then the no-task
startup probe and a small live task. Confirm tool capture, the settled event,
UI permissions, native compaction, Fovea continuations, and reuse of session IDs.
Do not weaken a failing prerequisite merely to make the readiness indicator green.

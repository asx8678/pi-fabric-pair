# Deterministic native integration probe

This is the R0 executable feasibility harness. It uses the actual installed Pi, Fabric and Fovea extensions with a local deterministic provider. It makes **no network request and no paid model request**. Each scenario gets an isolated agent directory, Pair state directory and disposable Git repository.

## Run

```bash
npm run test:native
# or one scenario
node scripts/native-regressions.js provider --keep --output /tmp/pair-native.json
```

By default the harness finds `pi-fabric` and `pi-fovea` through `~/.pi/agent/npm/node_modules` and launches `pi` from `PATH`. Overrides:

- `PI_FABRIC_PAIR_NATIVE_SOURCE_AGENT_DIR`
- `PAIR_NATIVE_PI_COMMAND`
- `PAIR_NATIVE_FABRIC_EXTENSION`
- `PAIR_NATIVE_FOVEA_EXTENSION`

`--keep` retains private temporary fixtures for diagnosis. `--output` writes a structured report. Do not publish retained state without reviewing it.

## Scenarios and pass conditions

| Scenario | Invariant |
|---|---|
| `provider` | A read-only worker with generic Fabric providers is rejected at startup with `UNSUPPORTED_PROFILE`, before inference or effects. This profile is deferred until a pre-effect provider authorization seam exists. |
| `post-report-provider` | A writer may use an approved provider during its lease, but a second generic `state.transition` after `pair_report` cannot run; reporting aborts the containing Fabric invocation. |
| `background` | An explicit `background:true` shell request is rejected before launch and cannot later mutate the workspace. |
| `implicit-background` | A profile with nonzero Fabric `executor.shellHangMs` is rejected during readiness, before inference or shell launch. Public worker shutdown did not reliably cancel an already-spilled OS process, so V1 does not claim that fallback is safe. |
| `idle-restart` | A retained, never-inferred native session can stop and reopen with the same identity without fabricating a transcript or requesting inference. |

The command intentionally exits nonzero while a safety gate is open. A red result is preserved evidence, not a flaky test to skip. Unit/mock passes cannot override it. The supported worker profile explicitly requires `executor.shellHangMs: 0` and `agents.maxDepth: 0`; Pair rechecks shell policy before every shell call and rejects `background:true`. An unexpected spilled result interrupts and shuts down the worker, but is not treated as proof that the OS process was canceled.

## Latest deterministic result

On 2026-09-23, `npm run test:native` passed all five scenarios on Darwin arm64 / Node 24.21.0 with Pi 0.87.1, Fabric 0.93.0, and Fovea 0.29.2:

- read-only generic-Fabric profile rejected before inference/effects;
- one permitted writer `state.transition` before report and no second transition after report;
- explicit background shell blocked with no late file;
- nonzero `shellHangMs` profile rejected before inference/effects;
- idle session file materialized by Pi and reopened with the same ID without inference.

The structured local result was `/tmp/pi-fabric-pair-native-result-4.json`; `/tmp` is not durable release evidence, so rerun the command at later checkpoints. These passes qualify only their stated scenarios.

## Public-interface finding

Pi's `tool_call` hook is a supported pre-execution block for top-level tools and for Pi/captured tools replayed by Fabric. Generic Fabric providers are invoked inside Fabric's action registry; the documented generic extension seam is nested `tool_result`, which is post-effect middleware. Therefore Pair's existing `gateTool()` cannot authorize `state.*`, `schema.*`, MCP, agents, or arbitrary providers merely by wrapping `fabric_exec`.

V1 must either:

1. use a supported immutable/closed-world worker capability profile that contains required Fabric/Fovea functionality but excludes every ungated effect; or
2. obtain a supported pre-effect authorization seam upstream; or
3. reject the unsafe profile before dispatch.

Prompt instructions, result rewriting, and private dependency patches are not acceptable substitutes.

## Evidence-hardening work started in parallel

Independent R3 fixes now reject tracked files reached through symlinked directory ancestors and reject a checkpoint if configured verification changes source. Their permanent offline regressions live in `tests/advanced.test.js`.

# Testing policy

This repository retains a bounded automated test suite for the live runtime. `npm test` runs the retained Node test files — at the time of writing 34 tests across model-picker UI behavior, widget plan/liveness rendering, controller scan recovery semantics, and immutable deleted-source evidence. Historical pass counts from the removed suites remain non-reproducible and are not current evidence.

The retained suite is regression coverage for the listed areas only. It is not release, native, or unattended certification, and no test-dependent acceptance row beyond those areas is certified.

## Current supervised MVP observation

The bounded actual Pi/Fabric/Fovea loop now passed with a deterministic loopback model: question/answer, detached-work rejection, writes/reports, immutable inspection, revision/approval, duplicate/stale decision checks, one retained session, active cancellation and confirmed stop. No paid inference, user-profile change or retained probe file was involved. See [QUICKSTART.md](QUICKSTART.md) and [COMPATIBILITY.md](COMPATIBILITY.md) for versions and limits. This does not certify the historical requirement matrix, interactive TUI, real providers, multi-controller use or crash recovery.

For the MVP source checkout, use `npm run typecheck` and `npm run pack:check`; normal `npm pack` runs the strict typecheck. Only the 15-file public runtime and help/skill assets ship. The optional Host/native commands below concern parked source and are not install or packaging prerequisites. Historical source-checkpoint links below refer to repository-only documents, not shipped runtime dependencies.

Retained development checks and optional parked-source build commands are:

```bash
npm test
npm run test:ui
npm run typecheck
npm run check:host
npm run pack:check

npm run build:host
node src/native-store/build.js
```

`npm test` runs the retained behavioral tests; `test:ui` runs the model-picker suite alone. The remaining commands are static and packaging checks. The registered `typecheck` now passes with the exact pinned development dependencies; see [the toolchain checkpoint](T10-CONTRACT-FREEZE-CANDIDATE.md#8-authorized-pinned-toolchain-follow-up). Install from the committed lockfile with `npm ci --ignore-scripts --no-audit --no-fund`; lifecycle scripts remain disabled, so this setup does not qualify native components. `pack:check` is only an npm package dry run and does not load or qualify the extension.

`build:host` checks typed sources and explicitly regenerates shipped `.mjs`; `check:host` verifies freshness. The native build uses an installed compiler and Node 24 headers, downloads nothing, and targets Darwin arm64/macOS >=27.0 only. These commands are not native or behavioral certification. See the [private storage contract](H1-PERSISTENT-STORAGE-CONTRACT.md).

Disposable inline observations now include ordinary Node loading from a packed `node_modules` location, dormant initialize/transition/archive/release/reopen, and held rejection paths. They do not establish worker/effect settlement, new-owner transfer, power-loss behavior, or public cutover. Exact scope and source identities are in the [H1 execution ledger](H1-EXECUTION-LEDGER.md).

Changes outside the retained suite's coverage still require manual review and carry unmeasured regression risk. The package must not be represented as release-qualified, natively certified, or safe for unattended work.

## Planned native qualification

[The seven-part plan §8.5](NEXT-IMPLEMENTATION-PLAN.md#85-native-qualification-matrix-and-authorization-gate) lists the actual-runtime observations still needed after integration. For the current H1 implementation pass, the owner authorized runtime qualification under the then-applicable no-test-files restriction, since superseded for the live runtime by the retained suite above. Bounded inline manual probes may use disposable workspaces and isolated state only. This does not authorize migration of real user data, valuable-workspace or unattended execution, dependency installation, settings changes in the user's profile, or restoration of test suites/runners. Record observations and their limits in the [H1 execution ledger](H1-EXECUTION-LEDGER.md); authorization is not a passing result. A manual subset cannot silently satisfy all original U/R/N/T/L requirements. Power-loss durability, unobserved providers/platforms, and unmeasured regression risk remain explicit limits.

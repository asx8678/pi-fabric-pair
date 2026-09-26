# Pair-owned worker mesh isolation

Status: planned; implementation delegated for review. This is not a claim of completion or native qualification.

## Goal and ownership

Prevent Pair-managed workers from sharing Main's, a project's, or an inherited Fabric mesh accidentally. Keep the implementation entirely in `pi-fabric-pair`, using Fabric's existing `PI_FABRIC_MESH_ROOT` child-process environment override. Pair's RPC/file coordination remains unchanged.

Main's existing mesh warning is a separate incident: this work neither repairs nor moves Main's state. No upstream edits, installed dependency patches, production configuration changes, automatic repairs, or new launcher are included.

## Design

1. Derive one absolute mesh root under each retained Pair worker directory: `workers/<id>/fabric/mesh`. Create private directories before spawning the child. Reuse the root across process generations and retained-session restarts; never key it by PID, worker generation, or a random launch identifier.
2. Set `PI_FABRIC_MESH_ROOT` only in that child's explicit environment, overriding any inherited value. Do not mutate Main's `process.env`, workspace settings, or `PI_FABRIC_PROJECT_ROOT`.
3. Add a bounded worker-probe observation of its mesh launch environment and require an exact match to the controller-owned expected root before granting execution authority. Validate the observation on startup and readiness rechecks. Describe it truthfully as environment/path verification, not proof of Fabric store health or an OS sandbox.
4. Keep historical stored probes readable when they lack the new observation, but reject missing/malformed/mismatched observations at live worker readiness. Update every affected strict validator and test fixture coherently; do not weaken generation, nonce, session, or quiescence checks.
5. Retain existing confirmed-exit fencing. An already-running old worker is not hot-reconfigured by a source edit. Adoption requires an explicit worker restart at a safe boundary after deployment/reload; no automatic restart, reset, model call, or conversation replacement.
6. New private namespaces do not automatically contain old shared Fabric state (including Fabric memory/schema data). Document this transition explicitly. Never copy, delete, rewrite high-water counters, or silently rotate a damaged private store. Unsupported/custom launchers that fail to preserve the binding must fail readiness rather than fall back to shared storage. This is not protection against a malicious launcher writing elsewhere before the probe.

## Milestones

- M1: Implement launch isolation, live probe validation, backward-compatible stored observations, and focused offline regressions.
- M2: Document ownership, transition/restart behavior and limits; update this ledger with actual commands and results; submit immutable final evidence for Main review.

## Acceptance ledger

- [ ] A parent `PI_FABRIC_MESH_ROOT` and worker cwd/project cannot select the managed worker mesh instead of Pair's explicit root.
- [ ] Private roots differ across worker slots/Pair owner directories, but remain stable across stop/start, worker generation changes, and retained session reload.
- [ ] Main's environment, workspace mesh, existing shared state and installed packages remain untouched.
- [ ] Missing, malformed, and mismatched live mesh observations refuse readiness and prevent task prompts/authority; correct observations succeed.
- [ ] Historical state/probes without the new observation remain readable; malformed new fields still fail validation.
- [ ] Worker-only restart retains the complete Pi session identity/history and existing exit-confirmation behavior.
- [ ] Focused offline tests and strict typecheck pass. Include direct behavior checks for environment propagation and namespace persistence, not just a build.
- [ ] If a helper module is added, the package allowlist includes it and pack inspection confirms it ships.
- [ ] Docs accurately distinguish environment isolation from store health, Main recovery, adversarial isolation, and native qualification.

## Constraints and verification

Preserve all pre-existing uncommitted work. Keep executable ESM JavaScript with strict JSDoc/checkJs. No commits, pushes, installs, real provider calls, source-reference edits, production mesh mutations, or changes to Pair's running configuration. Use temporary offline fixtures only. Do not run the full suite by default: start with native-profile, runtime-startup, controller-restart and directly affected persistence/probe tests, escalating only on evidence of cross-cutting risk. Record failures, inspect them, and iterate; do not claim tests were run merely because they are listed.

The current tree already contains substantial unrelated work and retained restart tests; immutable Pair evidence must be reviewed against the dispatch baseline, not treated as ownership of the entire git diff.

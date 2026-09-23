# Changelog

## 0.1.0 — 2026-09-23

Initial standalone source release. No Pi, Fabric, or Fovea fork.

- Persistent Pi RPC workers with per-Main-session ownership and explicit recovery.
- Asynchronous work orders, questions, review checkpoints, revision and cancellation.
- Hash-bound local evidence, inspection-before-approval, and user-configured verification.
- Native Fabric/Fovea presence checks and native context-management delegation.
- Main and worker roles; nested-tool workflow gates; no recursive Pair spawning.
- Separate `/pair` dialogs and an optional minimal indicator.
- Isolated workspace rules for multiple workers; default one worker.
- Observed cache usage and soft inference/turn/time limits, not guaranteed cache residency.
- Offline tests using real child processes and a mock Pi host running the actual worker bridge.

This release is not certified against live provider calls or the full installed
Pi/Fabric/Fovea stack. See `docs/TESTING.md` before enabling it on valuable work.

# Supervised Pair MVP: quickstart

One Main, one retained writer, one unresolved assignment. Start manually and review every step. Begin in a disposable Git repository; do not run another Main/Pair process or another writer against the same workspace.

The public workflow was exercised with actual **Pi 0.87.1, Fabric 0.96.3 and Fovea 0.31.1**, using a deterministic loopback model on Node 24/macOS. This qualifies the observed integration path, not paid-provider behavior, interactive UI, crash recovery or unattended operation. Pair is workflow coordination, not a security sandbox.

## 1. Load Pair

Pi, Fabric and Fovea must already be installed and usable. Choose an already-authenticated worker provider/model. Pair does not install dependencies or change your profile for you.

From this checkout:

```sh
cd /path/to/disposable/git/project
pi -e /absolute/path/to/pi-fabric-pair/src/extension.js
```

For the small npm tarball, extract it to its own directory, then load the extracted entry:

```sh
mkdir -p /path/to/pair-mvp
tar -xzf /path/to/pi-fabric-pair-0.1.0.tgz -C /path/to/pair-mvp
cd /path/to/disposable/git/project
pi -e /path/to/pair-mvp/package/src/extension.js
```

Use one loading method; do not load duplicate copies. No TypeScript compilation or native Store build is needed. Keep Pair state outside the implementation Git working tree; the default Pi agent directory does this.

## 2. Configure the foreground-only profile

The worker's effective `fabric.json` must contain:

```json
{
  "prewalk": { "enabled": false },
  "executor": { "shellHangMs": 0 },
  "agents": { "maxDepth": 0 }
}
```

Global defaults are in `<PI_CODING_AGENT_DIR>/fabric.json` (normally `~/.pi/agent/fabric.json`). Fields in `<worker-workspace>/.pi/fabric.json` take precedence only if the worker trusts that project. A separate worker workspace has its own project file and trust decision.

Pair gathers these file-level blockers before spawning when reliably knowable. Worker trust is not borrowed from Main: if trust is unknown, preflight rejects only when both trusted and untrusted profiles fail; otherwise the worker readiness check decides. Custom runtime commands/arguments skip Main’s best-effort preflight because their environment may differ. No preflight proves provider authentication or installed capability readiness.

If Main and Worker share this profile, these settings affect both. Pair verifies them, never silently changes them. Keep native auto-compaction enabled. No monitored/background shell jobs, detached processes or recursive workers are supported.

## 3. Enable and start manually

Keep Pair `cacheWarming` at its default `off` unless the human explicitly accepts
native refresh costs. Optional `active` is a JSON-only Pair policy, not a native
global setting: see [Context, warming and cost](../README.md#context-warming-and-cost).
It needs the new session-scoped SDK capability and separately reviewed deployment;
older SDKs honestly report unsupported and do not fall back to paid prompts.

Open `/pair settings` and set:

- **Enabled for new work:** on.
- **Autostart:** off.
- **Worker:** one writer, with the exact provider/model and supported effort you intend to use.
- **Review policy:** `every-step`; final review stays required.
- **Advanced → Verification commands:** configure and explicitly authorize relevant bounded project checks if needed. Empty commands means no project checks were run, not that tests passed.

Every completed valid edit saves immediately; **Done** or Esc closes without undoing saved changes. Canceled/no-op/invalid edits do not save. Save scope switches the displayed layer without copying values: global editing excludes project overrides. Worker selection, workspace, limits and verification are under **Advanced**. Main stays under `/model`.

Ordinary settings edits do not start or replay worker work; runtime-profile changes are staged. The opted-in warming preference changes only nonauthorizing metadata, but failed publication stops the owned worker fail-closed rather than retaining a stale paid opt-in. Autostart is for the next Main session. After configuring, run:

```text
/pair start worker
/pair doctor
```

If a retained worker exists, runtime changes stay staged while its current task uses the original profile. Finish or cancel that task, then explicitly run `/pair start` to stop the old generation, confirm its exit and rebind the same conversation. No work is replayed. Unknown exits and interrupted tasks still require explicit recovery; workspace changes still require an explicit reset. Policy/limit/verification edits affect new assignments (explicit resume retains its existing budget-amendment behavior). Project configuration writes may stale a frozen checkpoint; they do not bypass evidence checks.

Start/doctor do not request a model turn. If startup reports missing Fabric/Fovea, load those existing packages or configure their explicit extension paths; do not disable readiness checks to proceed.

## 4. Ask Main for one small change

For example:

> Use Pair's configured worker to make one small change. Dispatch one bounded step, inspect its report and actual diff, and ask me before approving it. Do not use a separate ad-hoc agent.

Main uses `pair_dispatch`, receives the worker's question/report, and uses `pair_inspect` before `pair_decide`. `answer`, `revise` and `approve` continue the same worker conversation. Approval requires the exact inspected checkpoint hash and unchanged workspace; failed configured checks block it. Final approval completes the task but leaves the worker conversation available.

Every-step review gates Main's decisions; it is not an automatic human-permission dialog. Tell Main explicitly if you want to approve each decision yourself. Do not poll: reports are delivered automatically. `/pair inbox` shows retained reports if you miss a notification.

## 5. Cancel or stop

```text
/pair cancel worker
/pair stop worker
```

Cancel revokes the assignment; it does not roll back files. Stop waits for the owned worker to exit. Normal Main shutdown also stops owned workers.

If Pair reports an uncertain exit, corrupt/missing history or an unknown effect, stop and inspect the retained state. Do not delete locks/history, reset the worker to bypass a hold, or start a second Main against that workspace. Automatic crash recovery is deliberately outside this MVP.

## What is deliberately absent

The tarball contains the 15-file public runtime and help/skill assets. ActorHost/ActorStore migration, the native macOS Store, the new actor model and archive rotation remain parked in the source checkout and are not runtime or installation prerequisites. No user-data migration is performed.

# Testing and local acceptance

## What was actually tested

The release build ran **55 offline tests** on Linux, Node 22.16.0, Git 2.47.3.
The machine-readable result is `TEST-RESULTS.json` in the source ZIP. The test
harness uses real child processes, real JSONL streams, real files and Git worktrees,
and the production Pair worker bridge. It does not use live model credentials.

The Pi host and Fabric/Fovea registrations/events inside those children are test
fixtures. Their synthetic token/cost fields exercise arithmetic only; they are
not evidence of real cache savings or provider retention. The full installed
Pi/Fabric/Fovea stack and native terminal were **not run** in the build environment.
There was no installed `pi` executable.

## Reproduce offline checks

From the extracted source directory:

```bash
npm test
npm run check
npm run pack:check
```

No dependency installation or network request is needed. `check` validates all
production/script JavaScript syntax, package resources, extension factory,
example configuration, then runs the tests. `pack:check` inspects what would enter
the npm package; it does not publish anything.

Tests cover:

- One PID/session across steps and subsequent tasks; explicit restart resumes history.
- Asynchronous question/answer and review loops; duplicate requests/decisions.
- Immutable evidence retrieval and stale-checkpoint rejection.
- Independent configured checks and rejection of failed verification.
- Mock native compaction hooks and task-state restoration in Main and Worker.
- Fovea-like continuation attempts blocked after a report.
- Multiple read-only workers; overlapping writer rejection; independent worktrees.
- Cancellation, interruption, revision/soft budget limits and no silent replay.
- Human permission forwarding, invalid-report quarantine, and ownership locks.
- Native prerequisite failures and a missing retained session file.
- Worker effort changes at safe boundaries and final-only review behavior.
- Minimal/off UI semantics, including toggling without changing a checkpoint.
- UTF-8 stream fragmentation, malformed stdout, unknown responses, timeouts and exit.
- Configuration/schema validation, path-safe IDs, and usage normalization.

## Test a separate Pi profile first

Use a test profile outside the implementation repository, for example:

```bash
export PI_CODING_AGENT_DIR="$HOME/.pi-pair-dev"
```

Install/configure your known-good Pi/Fabric/Fovea resources and native provider
access in that profile. Do not blindly copy your entire live profile or upload
credentials. Load the local Pair package and use a disposable Git repository.
Disable native Prewalk for this workflow. Keep normal tool permissions enabled.

Pair targets Node >=24 with the inspected Fabric source. Running Pair's isolated
tests on Node 22 does not mean the real stack supports that environment.

## Startup probe using your actual installation

After configuring a worker model and native requirements:

```bash
npm run test:live -- --cwd /path/to/disposable/git/repository \
  --config /absolute/path/to/fabric-pair.json
```

Without `--config`, the script reads global Pair configuration. Project Pair
configuration is ignored unless you explicitly pass `--trust-project-config`.
That flag authorizes reading Pair's project config; it does not bypass Pi's own
project trust mechanism.

The script starts a retained worker, requests native state and the bridge probe,
checks identity twice, records a private result, and stops the process. It requests
**no model inference or implementation task**. Other installed extensions execute
their own startup hooks and may have behavior outside Pair's control. Permissions
are explicitly relayed in an interactive terminal; otherwise they are cancelled.

This probe confirms registration/configuration and process/session basics. It does
not authenticate every future request, prove Fovea coverage, certify JSON schema
capture, or prove provider caching. Failure keeps diagnostics/session files in the
printed private temporary directory.

## Required small live task

Use a tiny repository with one source module and a deterministic test. Give Main
this task after choosing modest limits:

> Use Fabric Pair. Review this small repository with Fovea, then ask the worker to
> add one tested behavior in two milestones. Require approval between milestones.
> Do not commit, push, deploy, or alter unrelated files.

Observe `/pair status` before, between, and after steps. Confirm:

1. Main never changes model automatically. Main can answer a separate question.
2. Worker uses the selected provider/model/effort and actually calls Fovea.
3. The captured Pair schemas work through your Fabric executor language.
4. Worker PID/session file/session ID remain the same between assignments.
5. Worker questions arrive in Main without manual message copying.
6. Main can read real immutable evidence and approve or request one revision.
7. Configured checks run, and worker-reported check claims are distinguished.
8. Final approval accepts the task without destroying the worker process.
9. Observed cache/usage reflects your provider's real data, or explicitly unknown.
10. No unexpected delegation/Prewalk hook switches either selected model.

Keep this test explicitly budgeted. A passed mock suite is not a reason to authorize
broad unattended implementation immediately.

## Compaction and Fovea gate tests

First test in a disposable profile. Trigger native worker compaction using the
RPC command from a developer harness or reach a deliberately smaller native
threshold on a sufficiently bounded task. Use the same Pi/Fabric compaction policy
as Main; do not replace it with a mock summary.

Verify the same worker session survives, native Fabric compaction actually runs,
and the current authorization is restored. Compact Main too and confirm that it
still references the right report/checkpoint. Then force a Fovea update while the
worker is waiting for review: useful context may be delivered, but no next-step
mutation may occur without a new lease. Check nested `fabric_exec` actions, not
only direct Pi `edit` calls.

## Failure tests

- Deny a worker permission prompt. It must not be approved silently.
- Change a file after a checkpoint; an old approval must be rejected.
- Pause or cancel while a check is running; the owned check must stop promptly.
- Stop the worker during implementation, then explicitly resume. Existing effects
  must be inspected rather than automatically repeated.
- Resume the same Main session after restart and inspect `/pair inbox`.
- Temporarily remove a required extension. Startup/dispatch must report the problem.
- Hide/show the indicator during work and review. Session IDs, files and task
  authority must not change from that cosmetic action.
- Attempt a second writer in the same worktree; dispatch must be refused.

## What a failure report should contain

Keep secrets out of shared reports. Include Pi/Fabric/Fovea versions and installation
sources, OS/Node/terminal, sanitized Pair config, failing command, source test name,
worker/main session identifiers if appropriate, and the relevant event/diagnostic
excerpt. Do not send API keys, `auth.json`, OAuth tokens, or full proprietary
transcripts unless you intentionally authorize that disclosure.

Missing public APIs should be fixed in the adapter or proposed upstream. Do not
make tests pass by editing installed `node_modules` or importing private managers.

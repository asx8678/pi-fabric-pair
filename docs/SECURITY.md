# Security and operational boundaries

## Threat model

Pair runs as a trusted extension under your own OS account, alongside trusted Pi
extensions and authorized tools. It protects against accidental workflow errors:
stale approvals, duplicate deliveries, cross-session routing, unintentional
worker resets, missing prerequisites, and continuation after an approval gate.
It is **not** a sandbox against a malicious model with a powerful shell, malicious
extension, or adversarial process running as your user.

A process boundary isolates JavaScript globals. It does not isolate the filesystem,
credentials, network, external services, or all child processes. Apply your normal
container/OS/tool permissions for security-sensitive work.

## Authorization

The human configures models, workspaces, read-only mode, verification argv, and
limits. Main authorizes bounded implementation steps; that is distinct from the
human's permission for commands or external actions. Worker UI requests are
forwarded to the human. Missing UI means cancel/deny, never implicit approval.

Read-only workers deny shell and unknown capability names by default. Writers
are prevented from recursively invoking known agent/actor delegation surfaces.
Direct file edits are checked against workspace boundaries and symlink escapes.
Raw shell commands and external tool servers still need independent permission
controls; a workflow gate cannot determine every possible shell side effect.
Main's read-only-during-task option covers recognized direct mutation tools, not
arbitrary shell execution. It is an ergonomic safeguard, not complete isolation.

## Report handling

Worker reports are schema validated and bound to an owner, worker, process nonce,
session, task, plan revision and implementation lease. IDs are path-safe, reject
prototype-inherited names, and are not accepted as arbitrary file paths. Duplicate
report decisions cannot advance a step twice.

Private file permissions and nonces reduce accidental cross-process mixing; a
same-user adversary may still edit those files. Do not treat them as authenticated
messages across an untrusted network boundary.

Main is instructed to regard source text, worker reports and test output as
untrusted evidence, not instructions that grant additional permissions. Prompt
instructions are not a proof against prompt injection.

## Review evidence

Evidence snapshots cover Git-tracked files and nonignored untracked files under
the worktree root. They include source bytes, file modes, symlink target text, and
deletions. They do not recursively follow symlinks or automatically analyze Git
submodule contents. Submodules currently fail snapshot capture rather than being
silently omitted. Large snapshots also fail configured limits explicitly.

Ignored/generated files, external state, running services, database contents,
ports, credentials, and environment changes are outside the source fingerprint.
An approved code snapshot is not approval of a deployment or a proof that every
external side effect is correct. Configure meaningful checks and inspect gaps.

Evidence retrieval is required before approval, but it cannot prove the model
actually performed a competent review. Hashes bind approval to exact captured
source, not to semantics. External edits after a checkpoint invalidate approval.

## Stored information

Private Pair state may contain raw source code, diffs, user constraints, model
outputs, paths, session logs, and test output. Source or logs may include secrets.
The package never asks you to paste API keys into its settings and does not copy
provider authentication files. Child runtimes inherit your authorized environment
and native Pi profile, which can contain sensitive configuration.

There is no Pair telemetry endpoint. Normal model requests still send selected
context to your configured provider. Do not assume evidence retrieval is offline
once Main receives its content and makes a provider request.

Restrict access and apply your own retention policy. Automatic garbage collection
is intentionally absent in this release. Explicit reset archives rather than
removes old sessions. Keep Pair state outside implementation worktrees and do not
commit it to your repositories. After stopping Pair and verifying what is needed,
you may delete its own state directories manually; do not delete native Pi
credentials or unrelated session directories.

## Failure policy

An unknown RPC outcome does not cause an automatic retry. A missing session file
does not cause a blank replacement. Interruptions need explicit reconciliation.
Cancellation and shutdown are best effort and do not roll back writes already
performed. Long-running detached external jobs may outlive a tool unless managed
by their own runtime. Native warming/provider requests can have already incurred
cost when a local stop is issued.

Soft cost counters exclude unknown price categories, Main inference, native
warming, and external tools. Use provider-side quotas for a true spending boundary.

## Safe first use

Use a separate test profile and disposable repository. Disable native Prewalk for
Pair work, start with one worker, retain human permission prompts, and configure
small turn/time limits. Test recovery and compaction before unattended workloads.

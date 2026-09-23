# Implementation notes for the next CLI agent

Start in this package, not inside a Fabric fork. Source is executable ESM JavaScript
with explicit schemas and runtime validation. There are no runtime dependency
imports from Pi/Fabric/Fovea and no compiled `dist` step. Pi loads the default
factory from the manifest. Public wire/resource contracts are recorded separately.

Do not describe the offline mock suite as live integration certification. First run
`npm run check`, then use the user's exact installed versions for startup and a
small live task. Prioritize fixing any real schema/tool capture, RPC lifecycle,
Fovea continuation or permission-dialog discrepancy before adding UI polish.

Keep these boundaries intact:

- Main's model selection remains native; never restore a previous model behind the user.
- No process reset at checkpoints and no blank session on missing history.
- Main/Worker contexts differ; dispatch constraints explicitly.
- Source evidence and coordination state remain outside model-only memory.
- Settings/indicator UI does not replace Fabric's footer or TUI components.
- No prompting loop used as a heartbeat or custom cache-warming scheduler.
- Native compaction remains enabled; a cache hit is not more important than bounded context.
- Never introduce monkey-patches/private manager imports to pass a smoke test.

Potential later work, intentionally not required for this source release:

- Certified adapters for more installed Pi versions and terminal platforms.
- More granular read-only capability metadata instead of the conservative name allowlist.
- Searchable advanced dashboard, semantic checkpoint grouping, or extra review modes.
- Optional explicit workspace provisioning/merge planning, with human approval.
- Bounded evidence retention/garbage collection and richer total-cost accounting.
- Native warming telemetry integration where a stable public event exposes it.

There is no unattended daemon, web interface, automatic branch integration, or
external distributed queue. Do not add those merely to make the architecture look
more general. A small, reliable retained-worker controller is the goal.

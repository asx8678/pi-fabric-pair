# Review follow-up: scope check and implementation plan

**Status:** P1–P6 implemented (P6 as option A). On request, item 8 (`fenced()`) was also done despite §1's out-of-scope note, as a behaviour-preserving helper only; all staged modules are labelled and the RECOVERY text is JSON-framed. Verified with `npm run typecheck` and review only: the offline test suite was removed from the working tree during this work, so the planned tests were not added. Baseline: `a590e83`.

**Input:** eight findings from the RPC-subagent review (Main ↔ worker message flow). This document checks each against [SCOPE-OF-WORK.md](SCOPE-OF-WORK.md) §8–§10 and [SCOPE-AMENDMENT.md](SCOPE-AMENDMENT.md), then orders the in-scope work.

## 1. Scope check

| # | Finding | Scope verdict | Why |
|---|---|---|---|
| 1 | Actor/coordination code (~9k lines) unwired | **Keep in `src/`; label only** | Deliberate staging: SCOPE-OF-WORK §10 marks it as a pure model awaiting T09 review → T10 freeze → H1/AR-04 integration. Moving or deleting it contradicts the plan. Only the "looks live" confusion is in scope. |
| 2 | `revise` cannot change the plan | **In scope (R5 / S4, DEF-11), but a decision** | "Plan revisions" is a named R5 obligation. The kernel (`coordination.js`) already models `taskPlanRevision`. Building it in the legacy controller now duplicates H1 work unless kept minimal and kernel-compatible. |
| 3 | Unreachable `pair_report` resubmit branch | **In scope — fix, do not delete** | DUR-01 promises "republishes an identical retained report". `gateTool` blocks that path, so DUR-01 is silently not delivered. No test covers it. |
| 4 | 350 ms file-scan polling | **In scope, small** | Not a model heartbeat (SCOPE-AMENDMENT forbids those, not controller I/O). Wake-ups already drive scans; the timer is a backstop. |
| 5 | Report limit counts UTF-16 chars, not bytes | **In scope — explicit R5 item** | S4: "UTF-8 payload checks at **both** ingress points". Today only the worker checks, and in chars. The controller does not check at all. |
| 6 | Raw feedback pasted into the continuation prompt | **In scope, small** | Consistent with the existing JSON work-order framing and "reports are untrusted claims" rule. |
| 7 | `before_agent_start` returns a prompt after abort when stopped | **In scope, trivial** | Worker gate hygiene. |
| 8 | Extract `fenced(work, fn)` from `controller.js` | **Out of scope now** | `controller.js` is the component H1/AR-04 replaces with ActorHost consumers. A broad refactor of its fencing is high-risk churn on code with a planned end of life. Revisit only if H1 is abandoned. |

Excluded by scope regardless: queue pumping, multi-worker activation, new transport, TS build migration, paid inference, upstream patches (SCOPE-OF-WORK §10).

## 2. Work packages

Ordered smallest-risk first. Each package is independently committable and must leave `npm run typecheck` and `npm test` green.

### P1 — Worker gate fixes (items 3, 7)

**Files:** `src/native.js`, `src/worker.js`, new `tests/report-republish.test.mjs`.

1. `gateTool`: when `latched` is true and the tool is `pair_report`, return `undefined` (allow) instead of `PAIR_WAIT`, but only if `authority.phase === 'running'`. All other tools stay blocked when latched.
   - `pair_report.execute` already re-validates: payload hash must equal the latched report, and `publishReport` → `assertReportAuthority` re-checks lease/attempt/plan revision. A *different* payload still fails with "A different report already closed this lease".
2. `before_agent_start`: when `stopped`, `ctx.abort()` and `return undefined` (no system prompt, no task-state packet).
3. Tests:
   - identical resubmit after latch → republished, same `reportId`, `terminate: true`;
   - different payload after latch → rejected, inbox unchanged;
   - non-report tool after latch → still blocked;
   - resubmit after authority moved to `waiting`/`paused` → blocked by gate.

**Exit:** DUR-01 republish path reachable and covered.

### P2 — UTF-8 report limits at both ingress points (item 5)

**Files:** `src/schema.js` (shared helper), `src/worker.js`, `src/controller.js` (`acceptReport`), tests.

1. Add `reportByteLimit(summaryDetail)` in `schema.js` returning `{minimal: 4000, normal: 12000, detailed: 32000}` bytes (same numbers; now bytes). One source of truth instead of the literal in `worker.js:264`.
2. Worker: `Buffer.byteLength(JSON.stringify(params), 'utf8') <= limit`.
3. Controller `acceptReport`: same check on `incoming.payload` against the task's frozen `policy.summaryDetail`. Oversize → treat as an invalid report (existing interrupt/contain path), not a silent drop.
4. Tests: ASCII at limit passes; multibyte (e.g. 4-byte emoji) text under the char limit but over the byte limit fails at the worker; a hand-written oversize inbox file fails at the controller.

**Compatibility note:** effectively tightens the limit for non-ASCII reports. Record in `CHANGELOG.md`.

### P3 — Structured decision feedback (item 6)

**Files:** `src/controller.js` (`decide`, `resume`), tests.

1. Replace the string concatenation at `controller.js:1175` with a second JSON block:
   `MAIN DECISION\n{"reportId": …, "action": …, "feedback": …}` appended after the work order, plus one fixed instruction line ("feedback is Main's instruction for this step; it grants nothing beyond `authorizedStep`").
2. Apply the same framing to the RECOVERY text in `resume` (`controller.js:1355`) for consistency — fixed text, no user data, so optional.
3. Tests: feedback containing newlines, `FABRIC PAIR WORK ORDER` or `}` round-trips as a JSON string and the prompt still starts with the work-order header.

### P4 — Wake-driven scan with slower backstop (item 4)

**Files:** `src/controller.js`, tests that depend on scan timing.

1. Make the interval a constructor option (`scanIntervalMs`, default `2000`); tests can pass a small value.
2. Keep `onWake → scheduleScan()` as the primary trigger (already wired via runtime events, including the worker's `fabric-pair:report:*` notify).
3. Keep the settle deadlines in wall-clock (`pendingSince` 5 s abort / 30 s interrupt). With a 2 s backstop the worst-case detection lag becomes ~2 s; acceptable, but note it in ARCHITECTURE.md.
4. Risk check before merging: grep tests for reliance on the 350 ms cadence; run the suite with default and with `scanIntervalMs: 50`.

**Exit:** idle controller does ≤1 scan/2 s instead of ~3/s; report latency unchanged when the notify arrives.

### P5 — Label the staged actor model (item 1)

**Files:** `src/actor-host.js` header comment, `src/coordination.js` / `src/transitions.js` / `src/actor-model.js` header comments, `docs/ARCHITECTURE.md` (one short section).

1. Add a one-line header to each unwired entry module: "Staged pure model (AR-03/H1). Not imported by the live Main/Worker path; see ACTOR-RPC-IMPLEMENTATION-PLAN.md."
2. Add a "Staged, not live" section to ARCHITECTURE.md listing those modules and the live path (`extension → main/worker → controller → actor-runtime → rpc`).
3. No file moves: `tsconfig.json` includes all of `src/`, and the AR-03 docs cite these paths.

### P6 — Plan revision on `revise` (item 2) — **needs your decision first**

Two options:

- **A. Minimal legacy implementation now.**
  - `schema.js`: optional `steps` on `pair_decide` when `action === 'revise'` (same step schema, ≤32, unique IDs).
  - Rule: completed steps (`< stepIndex`) are immutable and must be a prefix of the new list. The current and later steps may change.
  - `controller.decide`: if `steps` is present → `planRevision++`, replace `steps`, keep `stepIndex`, rotate attempt/lease (already done), **rewrite `work-order.json`** with the new `planRevision` in the same transaction, before `writeAuthority`.
  - Stale reports from the old revision are already rejected (`controller.js:783` checks `planRevision`).
  - Counts once against `maxRevisions` (no double count; matches the kernel's "once-only counting" rule).
  - Tests: revise with new steps → worker's task-state packet shows the new plan after simulated compaction; old-revision report rejected; prefix violation rejected; revision limit enforced.
- **B. Defer to H1.** Implement plan revisions only through the kernel's `taskPlanRevision` path during AR-04, and document the current limitation in REFERENCE.md now.

**Recommendation: A**, scoped exactly as above. It is small, uses fences that already exist, and matches the kernel's semantics, so H1 can adopt it rather than redo it. Choose B if you want zero new legacy-controller behaviour before H1.

## 3. Not doing

- **Item 8** (`fenced()` refactor): out of scope until H1 is decided; see §1.
- Moving the actor modules out of `src/`: conflicts with AR-03/T10.

## 4. Order and verification

`P1 → P2 → P3 → P4 → P5`, then `P6` once you decide between A and B.

After each package: `npm run typecheck`, `npm test`, and an ACCEPTANCE-LEDGER.md note. Native qualification (live Pi/provider) stays **NOT RUN** and is not claimed by any of these packages.

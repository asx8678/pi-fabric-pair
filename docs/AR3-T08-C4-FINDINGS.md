# T08 C4 — bounded shared-context checkpoint

**Writer stopped; Main checked the integration seam, not full T08/M8 or release safety.** Astra `eda8ef690f594f2cab3ff2fe04ec6287` edited only the six opened core files. DUR-01 and DUR-02 also stopped before the compiler/source checks. T01–07 remain the seven accepted tasks; T09/T10 are not started.

## Implemented seam

- Mandatory-context `validateActivationRecordV2InContext(value,c)` and `validateActorControlV2InContext(value,expected,c)` preserve standalone wrappers and mandatory untrusted expected binding.
- Kernel `validateTransitionEventInContext`, `validateCoordinationModelInContext`, `appendCoordinationModelInContext` and facade `reduceCoordinationInContext` share the registered context used by actor parsing, genesis and historical/candidate folds.
- `requireValidationContext`, `consumeValidationWork`, `captureValidationWork` are explicit internal module exports, not tools or caller trust markers. Registration is checked before input access.
- Kernel scope caches use exact private immutable identities and the exact operation context. External histories/projections are reconstructed/compared. Incremental and historical paths call the same `projectStep`; the projection fork preserves internal task/tasks aliases without mutable snapshot sharing.
- Node/depth/source/byte/reference ceilings are unchanged. Separate work units account for visits/slots and UTF-16 text/key spans, copying, scan/comparison preflights, freezing and serialization/parsing. Repeated scans pay repeatedly; native short-circuit scans conservatively preflight their whole candidate span. Ceiling is `maxNodes * maxDepth + maxBytes` (24,777,216 by default), not CPU time, memory measurement or new active configuration. C3 still charges the complete final aggregate view.

## Main-owned evidence

- Syntax of all six core files and Controller, plus `git diff --check`: pass.
- Supplemental TS6.0.3 full existing config with documented global resolution overrides: **24 roots, 345 diagnostics, zero in the six core files or Controller, zero dependency-global diagnostics**. This is a failing project check, not pinned TS5.9.3. Remaining errors: config 69, evidence 48, extension 1, main 65, metrics 2, native 14, ui 33, util 30, worker 83. DUR-01's new migration access also inherits the incorrectly null-only options inference; typing follow-up must fix the real descriptor. Do not claim all 345 are unchanged baseline errors merely because the total fell from 350.
- **25 bounded outcomes passed**, evaluating selected actual pure source declarations in memory, with actual common/schema/stored validators and actual kernel/reducer bodies. No project ESM import, file fixture, generated script or native process: standalone/incremental equivalence for dispatch request, committed task, pause and cancel; unchanged bases, deeply frozen publications and task/tasks aliases; duplicate identity/noop; conflicting append atomicity; forged supplied projection rejection; cross-context reconstruction; four context-before-proxy-access guards; real shared-work exhaustion with structured capacity.
- AST checks: exactly five aggregate exports with arities 2/3/2/1/3; nine named private helper exports resolve once; aggregate dependency closure acyclic; no incoming production actor-model consumer. Facade/config-contract/migration-contract hashes still match T06. Package/config/state remain 0.1.0/V2/V1; no registration/default/runtime activation edits.
- Contour working-tree checkpoint covers the larger accumulated patch, not only C4: no extraction gaps/policy violations, 102 advisory structural findings, partial relationship graph. Largest displayed witnesses are `correlateKernel`, `applyActorEvent`, kernel `applyEvent` and runtime `#observe`. Exposure is not a correctness approval; no score-driven rewrite.
- A generic inverse-edit audit could not unambiguously reverse overlapping/coalesced kernel replacements. It is **not accepted preservation evidence**. The opened files have new identities below, not a claim that their old hashes remain unchanged.

## Stopped checkpoint identities

```text
actor-contract-common.js 7775ef91679a9ed5337c48bc66fecb4ecfdc75d24b98500b0b3ab09e44b17de0
actor-record-contracts.js 85b4f070575dc6b9d47580cd063cc7acc07a610873ad51629f7e491d33c1204b
actor-wire-contracts.js 1776990221f13393a14ad8ab5f935158a212e914f119980fa68b4e24313596ed
coordination.js 2467bef9c09add629fff9c391d4cb6692c6c1939768528e9cadc3dce3869a0aa
transitions.js 0a76b46d220f8c5992b2d5d4eae87ae5295c9adf169fb54cc7a3f33ed387ba08
actor-model.js 6db47ae6f3c1cde8659086d6786759849bbd3ae23d1f396761d6eb023a312d79
```

The private seam is available for the next explicitly assigned actor-model corrections. Common/record/wire/kernel/transitions are held at this checkpoint unless Main opens another precise seam. T10 must consolidate the final independent review/freeze; this local checkpoint is not that freeze.

## Still open

Full public initial-root → plan → implementation → inspection → approval → mirror path and quantitative resource fit; remaining actor-domain intermediate-work accounting; M3/M5–M7 and missing-preimage semantics; complete independent review, runtime integration and compiler/install/native qualification. No full workflow was executed by these 25 outcomes. See [live completion ledger](COMPLETION-EXECUTION-PLAN.md).

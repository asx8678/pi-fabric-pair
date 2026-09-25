# D5 — explicit held-byte projection contract

**Status: source-implemented and boundedly checked (39 outcomes); independent review and T10 freeze remain blocked. Not runtime-active.** Main owns `actor-migration-contracts.js` and the dispatch/type seam in `actor-model.js`. This extends the [represented-kernel correction](D5-LEGACY-PROJECTION-CORRECTION.md) without constructing a workflow, supervisor, activation or historical identity.

## Additive public input, unchanged output and arity

`projectLegacyWorkerView(value, workerId, context)` retains its three arguments and existing canonical-root/archive-context behavior. An explicit alternate context is now specified:

```text
HeldLegacyProjectionContext = {
  version: 2,
  kind: 'held-legacy',
  sourceInput: string | Uint8Array | Buffer,
  backupInput: string | Uint8Array | Buffer | null
}
```

For this branch, `value` is the existing closed `HeldLegacyEvidenceV2` (`pair-held-legacy/1`), with `operation:'stored-state'`. It is a canonical non-authorizing retention record, not State V2 or a runnable registry. Context bytes are resolver inputs, never a persisted V2 field or a claim of durable backup. The context must be an ordinary/null-prototype record with exactly four enumerable own data fields; proxies, accessors, extras and wrong versions reject without invoking getters. Byte inputs retain the common inspector's exact closed byte-view rules.

Only the explicit context selects this branch. Raw V1 objects, guessed profiles, digest-only evidence and unresolved locators do not qualify. Actor state/model/event/reducer APIs and archive context schemas remain unchanged and cannot use this branch to authorize execution. No active Config/State/wire version or registration changes.

## Validation and preservation

- Reuse `validateHeldLegacyEvidenceV2`'s exact metadata/source/backup/profile/obligation checks. Factor its existing body into one private inspection operation so projection consumes the already-decoded original, never a second decode or classifier DTO as authority. Its standalone return and arity remain unchanged.
- A single operation context covers metadata, original and optional backup inputs, reference occurrences, hashing, classification and projection work/output. State source bytes retain existing state-source charging; backup is a separate occurrence. No cap increases, context reset or equality credit.
- Recognized source families remain exactly `classifyStoredState`'s pre-identity and identity-bearing profiles, including supported aliases and diagnostic layouts. New heuristic recognition is forbidden.
- Malformed/future/mixed/invalid-UTF8 sources can produce an explicitly unknown held view only when their exact byte facts and rejection/undecodable metadata validate. `known:false`, null session/task and conservative retained references do not assert that the requested worker exists. Preinspection admission failures, exhausted projection budgets and mismatched source/backup facts throw. The existing inspector may retain a post-capture decode failure (including decode depth/capacity) with exact admitted byte facts; that can validate an unknown held view only within the same remaining budget. No refund, second decode, fabricated facts or unbudgeted diagnostic fallback.
- Invalid UTF-8 still requires the caller/Host to retain its binary input. `original:null`, supplied backup equality and a pure view are not a durable backup. No filesystem effects occur here.

## Derived view semantics

Output fields remain `nonAuthorizing`, `workerId`, `session`, `status`, `heldReasons`, `taskRef`, `pendingObligationRefs`, `historyRefs`, `diagnostics`, `known`.

- For recognized state, the requested ID must exist as an own worker key. Session comes only from the stored worker's explicit `sessionId`; missing/unrepresentable text yields null plus a diagnostic, never a generated identity. Task ID/status come from the stored task; only stored `cancelled` maps to cancelled, all other statuses stay held. Neither cancellation nor absence of a task proves containment.
- History includes the exact original-source and visibility references, declared artifacts/backup, and representable stored session/history/diagnostic paths. Those are reader hints, not fetched bytes, verified paths or capabilities. The original source remains discoverable even when a V1 string cannot enter V2.
- Pending references conservatively include subject plus inspect/cancel/reconcile references of obligations for this worker and its notices, and unscoped obligations. Other workers' scoped obligations are excluded by exact path boundaries. Caller-declared `resolved` is not sufficient to hide a source obligation: resolution remains unverified and visible. Unknown source classification retains every declared obligation.
- V1 empty, oversized-UTF8 or lone-surrogate display/path strings are not normalized or truncated. They stay in the original carrier; the view substitutes null/omits only that unusable path and records the exact source-field limitation. Whole-source coverage remains.
- Diagnostics expose classification, binding/identity/accounting/backup uncertainty, unknown worker scope, retained source diagnostics, unsafe display fields, and primary/rollback issue codes/paths. They never claim provenance or current telemetry.
- All returned arrays are stable-deduplicated, detached and deeply frozen. No raw decoded V1 object escapes as V2; caller inputs remain unchanged.

## Acceptance ledger

| ID | Required outcome | Status |
|---|---|---|
| HC-01 | Recognized pre-identity and identity-bearing workers project without actor config/workflow/supervisor or generated IDs. | PASS, bounded public inputs |
| HC-02 | Tasks, pending question/review/cancellation and notices remain discoverable; worker-path boundaries exclude another worker; fake resolved labels cannot erase debt. | PASS: real pending question report, task/cancellation and notice review coverage; exact worker/notice filtering. Existing all-kind coverage validator preserved byte-for-byte. |
| HC-03 | Exact source/carrier/profile/hash/backup mismatch rejects; supplied/missing/unresolved backup semantics unchanged. | PASS, public mismatch/backup checks plus exact validation-body preservation |
| HC-04 | Future/corrupt/mixed/invalid-UTF8 input stays unknown and held with original references; unsafe V1 strings remain preserved without unsafe V2 output. | PASS, including retained decode-depth failure and duplicate-member V1 semantics |
| HC-05 | Hostile context accessors/proxies/prototypes/extras reject without invocation; mutation/frozen output and budget bounds verified. | PASS: zero getter/proxy-trap calls; byte and declared-artifact capacity rejection; immutable/detached output |
| HC-06 | Existing represented-kernel projection, validators and archive/model APIs retain their behavior; no held-context admission bypass. | PASS: canonical references/cancel/pause/resume regressions, unchanged closed archive context, state/model/reducer reject held-only inputs |
| HC-07 | 11 public facade/model symbols/arities, active versions/registrations, 27 kinds, 106 original rows, affected syntax and all-root compiler checked. | PASS: AST/public inventory and protected source hashes; 24 supplemental roots, zero diagnostics; pinned gate still unavailable |
| HC-08 | Fresh independent foundation review, exact T10 matrix and Host handoff. | BLOCKED: fresh reviewer transport failed before any source access; no independent verdict or Host handoff |

## Implementation and verification checkpoint

Only `src/actor-model.js` and `src/actor-migration-contracts.js` changed in this slice. The model owns one operation context and dispatches only the explicit held resolver tag; other inputs retain canonical replay. The migration leaf shares its existing exact inspection with projection, avoiding a second decode or metadata recapture. In-memory inverse reconstruction restores the complete prior migration module byte-for-byte after removing the additive helper/types and wrapper factoring; existing validation conditions and accounting are unchanged. Historical/future identifier predicates are also identical.

Stopped source identities (SHA-256):

- `src/actor-model.js`: `e39492d6b1d5555b235a1a08eb369a379c8601c00f02b3c0ae0c92318d7b7447`.
- `src/actor-migration-contracts.js`: `a20eac84e887a3e35468cbaad257ddfad3a6dea6ff7f9c08333b746c398a4761`.
- Ordered `shasum -a 256 src/*.js package.json tsconfig.json` listing: `ffbdbace2cf23a78d56385bfafe1e00c1ff7d5b1190e72b1e5d0ce5588838981`. Restoring only these two entries to the preceding D5 snapshot restores `001a8a02cb8ff5f8f3ef23af6272804f04c93713eda999316cb5badc0ec7fc91`, protecting the other 22 source files and package/tsconfig.

Main verified **39 distinct bounded outcomes** through the existing public API, using ephemeral commands/in-memory inputs, with no new test, fixture or runner files. Coverage includes both identity profiles, missing workers, actual pending question reports, task aliases/cancellation, missing coverage, forged resolution, exact worker/notice routing, byte/backup inconsistencies, future/malformed/mixed/non-UTF8 sources, retained decode-depth failure, duplicate-member V1 semantics, unsafe historical text, diagnostic issues, frozen/detached output, hostile accessors/proxies/prototypes/extra fields, byte/artifact capacity, state/model/reducer admission isolation and four affected canonical projection/archive regressions. Binary preservation is checked as caller-supplied bytes, not claimed as a durable backup.

Initial probe issues were resolved without production changes: the task fixture omitted required `steps[].instructions`; a deep legacy JSON failure is deliberately retained by the existing inspector after byte capture, not necessarily thrown. A later probe incorrectly equated each visibility metadata reference with a separately resolved byte occurrence; the corrected check verifies the actual 16-declared-artifact limit rejects 17. A preservation checker had a mistyped replacement hash and was corrected to select exact filenames. Successful unrelated checks were not rerun. These are checker corrections, not changes to admission or resource caps.

Affected syntax, all 11 facade/model symbol arities, inactive/acyclic dependency graph, package entrypoints, whitespace and the unchanged 106 original acceptance rows pass. Protected source hashes retain all active versions, defaults, registrations and 27 kernel kinds. The post-edit in-memory **TypeScript 6.0.3** check reports **24 roots, zero diagnostics**, using the actual project options plus installed SDK 0.87.1/Node22/MCP/TUI declaration mappings; no shim, suppression, exclusion, project/config/install change. Pinned `tsc` is still absent, so this is supplemental evidence, not a pinned-check pass. Package dry-run passes with **86 files**, including this contract and both affected modules, and no test/dependency entries or written tarball.

Fresh read-only Astra reviewer `a8a29d72eaef4b42b836cd39a2bdd12b` used normal extension loading rather than repeating the failed extension-disabled profile, while retaining only read/grep/find/ls. It again failed with **Agent transport exited without a result**, **zero turns and zero tool calls**. This is the fifth T09/MF-01/D5 attempt before source access, not independent source evidence. No transport loop or provider/settings change followed. Contour reviewed the wider dirty patch: 22 source files, 139 advisory findings, zero policy violations/file-extraction gaps; graph resolution remains partial, and this is not correctness approval or T09 coverage.

**Remaining:** obtain independent stopped-source coverage of both D5 branches and the entire current foundation; resolve actual findings; complete T10's exact field/issuer/reader-writer/crash matrix and compatible Host handoff. Runtime backup, loading, publication, tool routing, containment/cancellation, archives, role bridge, two-runtime flow and native qualification remain later work. No active format, runtime import, second registry, permission expansion or test file was added.

Host backup/publication/cancel/reconcile effects, full reader routing, durable archives and adoption remain H1 work after T09/T10. The pure view provides discoverability, not a new writer or permission to execute old work.

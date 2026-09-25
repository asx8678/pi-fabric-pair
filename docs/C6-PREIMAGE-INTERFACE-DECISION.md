# C6-PREIMAGE — Main interface decision and implementation scope

Status: approved for the named two-file source implementation under the user's renewed plan-and-implement instruction. Baseline actor-model329bdcf; read-only interface reader13bfa3d84ea34ced9bc5f27f66e333bd STOPPED, full handoff collected. This supersedes the provisional missing-field inventory and historical-readability recommendation in C6-PLAN-PREIMAGE-PROPOSAL.md, not its separate structural replanning proposal. Implementation is now present with Main's bounded checks in [the checkpoint](C6-PREIMAGE-CHECKPOINT.md). Independent review, the complete implementer workflow and runtime rollout remain open.

## Main decisions

- Prove genuinely supplied **semantic content**, not original JSON spelling, original human text or authorship. Do not serialize an old record and call it original bytes. Host original-byte provenance remains AR-04.
- Use the **strict unsupported** aggregate support boundary. Standalone intrinsic events preserve optional omissions. In the single shared historical/incremental step, submission without supplied input and activation without authority in its named prefix fail with `unsupported-preimage` (category unsupported); reducer maps this explicitly to existing reject/unsupported, not a hold or generic input-conflict. Old full histories containing these omissions become unsupported by this strengthened pure V2 aggregate. Preserve caller bytes/records; do not migrate, rewrite hashes, fabricate diagnostic models or invent evidence. Existing active V1 runtime/state/wire readers are unchanged.
- No new evidence gate in eligible(), no historical exemption, caller-trusted replay mode, new dates/markers or cache credit. Later content cannot repair an earlier submission or proof prefix. Present malformed/mismatched evidence conflicts; ordinary lifecycle proposal holds and truthful held-storage observations keep their existing semantics.
- Genuinely inline authority uses zero external references, but pays all real capture/copy/encoding/digest/work/final-view charges in the original registered context. No cap increases, context reset, exempted payloadRef or fabricated authority-control wrapper.

## Submission input

Optional `submissionInput` only on workflow-submitted. When present it is a closed `WorkflowSubmissionInputV2` with all fields required:

`version:2`, `kind:'workflow-submission'`, `storeId`, `workflowId`, `workflowRevision`, `requestId`, complete `owner`, complete `issuer`, `objective`, ordered `constraints`, `supervisorId`, `implementerId`, `lifetimeDeadlineAt:number|null`, complete checked `assignment`, complete checked `implementationGenesis`.

No defaults/reconstruction. Compare storeId to actor genesis; workflowId to non-null outer event; initial workflowRevision to requestId; requestId/objective/constraints/participant IDs/lifetime deadline/assignment/kernel genesis to the exact submitted payload; owner to outer/current owner; issuer to payload/current Main. Preserve all existing config/participant/model/resource/workspace/fence/assignment time/budget checks. Deadline still exactly equals immutable assignment deadline (null cannot qualify). Assignment's existing closed keys and all nested content are retained; genesis includes full fence, nullable legacy and holds.

Verify `pairDigest('workflow-input', submissionInput, sameContext) === payload.inputHash`. This is existing pair/workflow-input/v2 plus pair-json canonical content. Exclude inputHash itself. EventId/sequence/outer at are receipt/journal coordinates, not content. Config snapshot is committed through exact assignment.configHash plus existing definition checks; root/archive/context are bound by later state prefix. Do not add a request context absent from the current protocol.

Derived workflow `submissionEvidence:{status:'verified',eventId,inputHash}` only after successful comparison. Under strict policy there is no reachable unknown-evidence aggregate; unsupported input remains retained input, not a fabricated view.

## Inline authority event and leaf

Add a distinct closed branch of existing `artifact-retained`:

`{kind:'artifact-retained', issuer:ActorBinding, purpose:{kind:'authority-content'}, authority:AuthorityArtifactV2}`.

There is no artifact reference/original string on this branch. Existing inspection/evidence branches keep their exact fields/reference charges/decoding behavior. Authority is existing `{content,digest}`; content retains version, owner, actor, profile, nonce, workflowId, workflowRevision, activationId, identity, grantOperationId, deadline, command. Digest covers content only; no root/proof/input-hash cycle.

Explicitly approve one **private-module**, mandatory-three-argument export in actor-wire-contracts.js:

`validateAuthorityArtifactV2InContext(value, expected, context): AuthorityArtifactV2`.

Closed expected `AuthorityRetentionBindingV2={owner:OwnerBinding,workflowId:Id,workflowRevision:Id}`. Reject unregistered context before accessing either input. Capture/validate untrusted expected and value. Extract/reuse actual intrinsic authority predicates: complete actor/owner/profile/nonce/identity coherence, active participant/model and role-appropriate command, deadline rules, intrinsic text/envelope limits, content digest and the three expected bindings. Retain existing authority() control/proof/reference/byte-length predicates and real payloadRef charging. Expected shape intentionally does not prove a future activation.

Standalone event parsing may derive expectation from already captured content for intrinsic validation only. Retention must supply actual replay owner/workflow/revision. No new facade export, kernel kind or public root/version/config change.

## Retention, proof and consumption

Private WorkflowRuntime `authorities:Map<Id,RetainedAuthority>` keyed by content.activationId; record `{authority,eventId,issuer,retainedAt,sequence}`. Publish a copied/frozen WorkflowView.authorities array. Unique retention for activation ID across workflows in current segment; conflicting/replacement retention rejects. Exact event retries remain existing event-ID noops. Pending content does NOT reserve an activation/operation/native run, change binding or create authority.

Chronology: qualified submission → for implementer actual kernel grant prepare/commit/applied-open publication → Main retains prospective content → compute actual root prefix including it → activation issuance → existing dispatch/native/settlement consequences.

At retention: current exact Main/owner/existing workflow; participant role/model and immutable config/assignment/workspace; supervisor command exact submitted objective/constraints; implementer command exact submitted goal plus recorded named step, identity and actual open kernel grant/commit/publication. Proposed generation/session/nonce/activation/deadline are checked content, not proof an activation already exists. Never call activationOf() for prospective retention or install replay.bindings. Existing applied/open publication witness remains authoritative: raw/noop/held/closed publications cannot qualify. Kernel grant publication must not require the future activation's content.

At activation: matching retained content must be inside producer.grantProof.rootRevision, not later. Compare owner, full actor tuple/profile/nonce, workflow/revision, activationId, identity, grantOperationId, digest to proof.authorityHash and any authorityRef.hash, complete deadline to payload/dispatch/original control, command exactly to original goal/assignment control. Preserve dispatch request/command/intent/operation/hash/ref/byte length, production/current-owner/time and all current admission predicates. Retention at must not postdate issuance/admission. Historical root hash and implementer applied/open publication witness must still be verified by appendActorStep. Current-open grant check still applies. A locator's hash agreement is not authenticity.

Derived activation `authorityEvidence:{retentionEventId,sequence,authorityHash,proofRootRevision}`; no public caller can supply/trust it instead of replay. New fields/indexes participate in actual initialization, private alias-preserving fork, final view and every cache comparison. Preserve raw omitted payload keys and original event hash identity.

## Compatibility and atomicity ledger

- Omitted preimage: intrinsic event parseable, strengthened full aggregate unsupported at first semantic consumption, historical and incremental alike.
- Missing or after-prefix authority: unsupported, no append. Mismatched retained content/proof/digest: conflict, no append.
- Unsupported archive history: same shared-fold result; no inferred content from checkpoint/hash/cache. Existing original carriers remain untouched.
- Later matching content: can qualify only a fresh not-yet-admitted activation with an actual later prefix, never rewrite old acceptance.
- Already-committed facts behind an unsupported history: retained raw records, not a reconstructed authorizing/qualified model. No promise that reducer can return a base when base reconstruction fails.
- Valid evidence and ordinary denial: preserve no-append holds. Denied bound storage phases retain original per-fact provenance and permanent operation denial. Source content cannot revive them.
- Invalid context, capacity, hash, duplicate or binding failure: no caller/base mutation or partial candidate publication. Charge scans/copies/digests/final encoding in same context, including real archive decoding but never fake inline decoding.

## Ownership and checks

One named writer may edit ONLY src/actor-model.js and src/actor-wire-contracts.js. Main owns docs and verification. No common/records/config/migration/coordination/transitions/facade/runtime/util changes; preserve util concurrent edit. Five aggregate signatures/arities2/3/2/1/3 and all prior LR/PREFIX/accounting semantics stay fixed. No replan/mailbox/archive redesign in this slice. All external caps, hash domains and V1 contracts stay fixed.

Writer uses native read/grep/find/ls/edit only; first action absolute package.json verifies pi-fabric-pair@0.1.0. No execution/delegation/tests/fixtures/scripts/settings/installs/commits; never /tmp/tscheck.mjs. Stop with exact changes, unrun checks and unresolved issues. Main performs targeted actual-source no-file probes, complete supplemental compiler, symbol/callsite/unchanged-file checks and stopped independent review. Full public two-chain fit, T09 and native/Host qualification remain separate gates.

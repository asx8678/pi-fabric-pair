# C6-PLAN / PREIMAGE — frozen-core proposal, not an approved interface

Read-only proposer `6ed616e881a8412ba6d7f7c57f537280` STOPPED. Package identity verified; no source edits/execution. It deliberately did not read the then-moving actor-model.js. Its full handoff remains in the retained agent log. This digest preserves concrete recommendations, not Main approval or completion. No plan/preimage source boundary is open. LR review/corrections must be collected first; use the live execution ledger.

## Structural plan seam

Frozen coordination CurrentTask/newTask/decisionOutcome/commitIntent install steps once; revise feedback does not replace the structure. Human amendments are a closed budget whitelist and must stay so. Grants/reports/ledgers retain step identity; replacing only task.steps breaks attribution. Existing wire plan lacks full kernel acceptance criteria and an exact structural-change/review linkage.

Recommended optional closed `planChange` only on supervisor-control `decide` with action revise, preserving27 kernel kinds:

- `change.version:1`.
- `expected`: taskPlanRevision, workflowPlanRevision, planHash, currentStepId, grantOperationId, accountingRevision, budgetRevision.
- `next`: independently incremented taskPlanRevision and workflowPlanRevision.
- Complete ordered `remainingStepIds`, `introducedSteps:[{step,replaces}]`, `removedStepIds`.
- `current:{kind:'keep'} | {kind:'replace',successorStepId}`.
- `supersedesDecisionOperationId:Id|null`.
- Exact earlier `plan` link: activationId, intentId, intentHash, operationId, controlHash, actual settlement observationId/at.

Step means complete kernel `{id,title,instructions,acceptance?}`, not a lossy wire description. Existing retained step content is immutable; changes need lifetime-fresh IDs. Every previous pending ID appears exactly once in remaining or removed sets; historical/executed work cannot be erased/rescheduled. Plan hash uses existing operation-input domain over a defined structural projection. Preserve absent old optional fields and V1 input hash/member-order rules; full candidate commitment includes planChange.

Add optional change to a plan output, and an exact plan-output link to revise review. The plan cannot contain its own hash/future settlement. Recommended same supervisor activation for plan and review, plan preceding review. Aggregate must correlate actual dispatch/producer/root, exact outputs, report/checkpoint, complete all-scope material and delivered inspection, actual native completion and current eligibility at candidate AND commitment. Metadata labels alone cannot prove this.

### Main decisions still required

1. **Report-boundary current-step replacement:** recommended only after actual report, closed grant admission, native completion or explicitly adequate containment, complete effects, finalized checkpoint and qualified review. Retain old current step as superseded, not approved; transfer outstanding review debt to named successor. Revise must not advance approved workspace base. Future approval covers all retained unapproved changes.
2. **Budget lineage:** new IDs do not reset per-step allowance; replacements/splits inherit cumulative consumption/unknowns while original ledgers remain. Preserve global caps, assignment/workspace/participants/verification/deadlines.
3. **Lifetime count:** recommended32 lifetime distinct steps, including retired, not32 replenished per replan. This interpretation is NOT yet approved.
4. **Supersession:** recommend named atomic supersession only of an uncommitted candidate for the same report. Retain old candidate/IDs; late commitment remains held and cannot apply. Current generic candidate conflict could otherwise deadlock stale proposals.
5. **No-report emergency:** existing decide requires a report. Nonterminal replacement after containment with no report needs another explicit contract; terminal cancellation remains available. Never fabricate a report or reuse LR terminal abandonment as nonterminal plan permission.

Successful commit atomically rechecks guards, consumes report once, charges revise once against original step/lifetime, installs structure and continuation debt. New work still requires fresh grant/attempt/lease/reconciliation/publication/prompt/delivery. Crash before commit retains old plan; replay after commit applies one change. Actor-denied commitments stay denied despite mirrors/resolved holds.

Derived state needs immutable step catalog/history, executable order/current selection, retirement/replacement/budget lineage and review debt, plus applied/superseded/held candidate dispositions. Future scopes: coordination, wire and stopped aggregate; record contracts only if closed public workflow record shapes change. Keep facade/API/V1 authority formats unless separately authorized. No src/step-machine.js exists; real transition machinery is coordination.js/transitions.js.

## Preimage seam

Keep separate: hash syntax, semantic content commitment, and runtime provenance. Frozen record code checks authority/proof and dispatch hash agreement, not content/publication. Wire already defines closed AuthorityContentV2 and its digest, but this does not establish retained aggregate content. Kernel authority-published is operation/lease observation, not content. Grant publication hash is not the authority semantic digest. C3 also leaves workflow-submitted.inputHash without a defined verified submission preimage.

### Recommended inline authority content

Retain actual `{content:AuthorityContentV2,digest}` in an explicit aggregate inline variant of artifact-retained/purpose authority-content, before the proof prefix claimed to contain it. Exact enclosing aggregate fields remain to be decided from stopped source.

Existing content fields: version, owner, actor, profile, nonce, workflowId, workflowRevision, activationId, identity, grantOperationId, deadline, command. Verify `pairDigest('authority',content,sameContext)`, exact current-Main/owner retention, producer tuple/profile/nonce, workflow/activation/grant/identity, actual original command/deadline, immutable assignment/config/participants/workspace, and exact producer authorityHash. Implementer publication must be actual applied/open within named historical prefix. A matching reference/hash alone does not establish content or Host authority.

Suggested private leaf export in actor-wire-contracts.js: `validateAuthorityArtifactV2InContext(value,expected,context)`. Mandatory registered context checked before input access; mandatory untrusted expected binding validated; reuse actual authority-content predicates without constructing a synthetic control or charging a nonexistent external ref. No new facade export/kernel kind/hash domain proposed, but this leaf ABI still needs explicit permission.

### Recommended original semantic submission input

Optional actual supplied `submissionInput` on workflow-submitted, provisionally closed:
version2, kind workflow-submission, storeId, workflowId, workflowRevision, requestId, owner, issuer, objective, constraints, complete checked assignment. Verify existing workflow-input domain and every duplicated outer/config field. Main must inventory all meaningful original aggregate inputs before finalizing this shape; do not omit separately supplied context or other semantics.

This proves supplied semantic content, not original JSON spelling/human authorship. If original bytes are required, a separate real bounded encoding/original/byteLength/rawSHA carrier is needed, duplicate-key-aware decoding and decoded-content comparison. Never serialize an old object and call it original bytes.

### Compatibility/resource decision still open

Recommend historical readability with explicit unknown preimage status, requiring authentic content for new fully evidenced admission. Later matching content cannot repair an earlier prefix. Present malformed/mismatched scope/digest rejects; absent remains unknown; unknown encodings unsupported. No fabricated locators/commands/IDs or source-tag authority. Exact policy cannot be inferred from event dates or invented markers.

Two inspection chains already consume16 references. Wire payloadRef charges a reference even when a wrapper carries content. Prefer a real closed inline variant, NOT an exempted reference. Meter all representation, encode/decode/hash/compare/copy/freeze/publication work and bytes in the original context; no higher caps/context reset/equality credit. Large content may genuinely fail unchanged envelope/text/depth/root/work limits. Aggregate submission validation may remain local; record/migration changes are not automatic permission. Actual archive carryover/source bounds remain separate work.

## Required future integration / gates

After LR review: reconcile actual aggregate field inventory, settlement histories, held disposition, supersession, preimage status and archive behavior; Main must approve precise interface and nonoverlapping ownership. Keep C4 registered-context kernels/C6 genuine actor prefix and full cache/publication checks. New indexes belong to replay/fork state. Full public workflow, two-chain quantitative fit, archive/legacy, T09/T10 and actual Host/native provenance remain OPEN. No execution evidence or approval is inferred from this proposal.

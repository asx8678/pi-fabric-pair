# Q01 — inline inspection retention amendment

**Status: implemented; bounded public evidence is in the [Q01 checkpoint](Q01-INLINE-INSPECTION-CHECKPOINT.md). Independent F1/T09/T10 remains open.** Implements N1 in [the next implementation plan](NEXT-IMPLEMENTATION-PLAN.md). Main owns `src/actor-model.js` only for this correction. No cap, kernel/wire/facade/export/active-version change; no Host/runtime activation. All existing dirty files remain preserved.

## Closed additive form

Add this disjoint branch to the existing actor `artifact-retained` payload:

```text
{
  kind: 'artifact-retained',
  issuer: ActorBinding (current Main),
  purpose: { kind: 'inspection-content' },
  artifact: ArtifactRef,
  inspection: InspectionRequestV2 | InspectionReplyV2 | InspectionReceiptV2
}
```

`inspection` is the complete existing `{content,digest}` wrapper, not a digest, ID, original-text string, reconstructed receipt or storage locator. `original` is forbidden on this branch. No extra keys in the payload/purpose/wrapper/content. Existing `purpose:{kind:'inspection'}` with `artifact,original` remains unchanged and pays its original reference/decode charges. Evidence (including the original-byte structured change proof) remains unchanged. No automatic conversion or historical rewriting.

`artifact` names the actual fully retained content for subsequent lookups; it does not cause external I/O or stand in for missing content. Its hash must equal the existing `inspection` content-domain digest. All nested request/reply/evidence ArtifactRefs remain actual reference occurrences and retain their charges and exact earlier-source/byte-length checks. Standalone wire inspection envelopes are unchanged; they already carry complete structured wrappers and charge nested references. This amendment concerns only their aggregate retention carrier, not the T04 inspection wire shape.

## Parsing and replay ownership

- The intrinsic actor parser validates the complete inline wrapper using the existing aggregate inspection parser in the same registered operation context. Reference occurrences are charged here exactly once for this source. Standalone event validation checks intrinsic content, not historical producer/delivery authority.
- Replay consumes that already-checked concrete payload from its private parsed event, not an externally asserted checked-cache flag. The raw branch still decodes/parses during retention. Both paths call the same historical inspection qualification: exact earlier producer/intent/report/checkpoint/scope, request/reply, deadline, evidence coverage and independently observed delivery.
- No reparse/reference discount based on equal hashes; no fresh context or skipped archive charge. Duplicate source identity remains forbidden. Source count, event-envelope size, root/node/depth/work limits and final-view capture all remain enforced.
- Full inline content pays root/event capture, freeze/reconstruction, canonical encoding, hashing, byte length and publication/fork/cache comparison work. It is not a free reference or byte exemption.

## Byte and provenance semantics

For raw retained sources, preserve `originalBytesHash` and `byteLength` exactly as before.

For inline retained inspection views publish:

```text
kind: 'inspection'
artifact, inspection, retainedAt, sequence
byteLength: UTF-8 length of encodePairJSON(inspection)
originalBytesHash: null
canonicalBytesHash: SHA-256 of those canonical wrapper bytes
```

Null original-byte hash is deliberate: supplied structured content is not evidence of original transport whitespace/order/bytes. Canonical bytes are genuine encoding of the supplied retained object, not a fabricated external preimage. The source event retains the complete object. No byte-domain evidence claim may be invented from its semantic digest. All requestBytes/replyBytes must equal the actual retained source length (raw original length for raw sources, canonical length for inline sources). Existing raw histories/views remain unchanged. Mixed forms are valid only with exact actual lengths; replay never rewrites links to make them fit. Raw original-byte evidence/proofs and archive original text remain intact.

## Reference worksheet

For each one-proof chain: proof source 1; inline request 0; inline reply 2 (request + evidence); inline receipt 2 (request + reply) = **5**. The existing raw form stays **8**. Two inline chains cost 10, first archived replay 11, two archived segments 12. Referenced payload bytes are `2P + 2Q + R` per inline chain (proof P, request Q, reply R); inline wrapper/event costs separately pay the ordinary shared budget. Additional evidence or archive sources still charge, and capacity rejection remains truthful. This is a source-derived bound to be checked through public history, not a promise of unbounded retention or a measured pass.

## Acceptance ledger

The table records the initial gates; their actual outcomes and qualifications are recorded in the linked implementation checkpoint. Do not read the initial Open entries as the current implementation status.

| ID | Required check | Initial state |
|---|---|---|
| IC-01 | Closed inline intrinsic form; malformed/missing wrapper, hash mismatch, extra original/fields, wrong issuer rejected. | Open |
| IC-02 | Same historical proof gates for both forms; missing source, wrong producer/bytes/scope/delivery/order/time rejected. | Open |
| IC-03 | Original raw history/view/hash/charging unchanged; no implicit migration; mixed forms enforce actual lengths. | Open |
| IC-04 | New views expose null original hash + actual canonical hash; forged view/cache rejected; input immutable and historical/incremental parity. | Open |
| IC-05 | Full acceptance-bearing Q01: two inspection chains, revise/supersession/base/lineage/budget checks, continuation/final approval, mailbox resolution/closure, first and second rotations. | Open |
| IC-06 | Real reference/byte/node/depth/work/envelope/source-count capacity failures remain; no context reset or equal-hash credit. | Open |
| IC-07 | All production roots compile, 27 kernel kinds / 6 coordination / 5 aggregate exports unchanged; untouched-source fingerprints; independent stopped-source review remains separate. | Open |

No test/fixture/runner/generated checking files, installs, live/native/paid workers, Apply, migrations or commits. Bounded no-file public checks may reuse previously retained input data but must not execute old file-writing runners or count their past assertions as new evidence. Record exact source identity, current results and limits in a checkpoint. F1/T09/T10 and Host work remain gated after this correction.

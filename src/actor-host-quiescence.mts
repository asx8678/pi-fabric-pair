import { assert } from './util.js';
import { archiveHash } from './actor-archive.mjs';
import { validateActorStateV2 } from './actor-model.js';
import type { ActorModelView } from './actor-model.js';
import type { ArchiveValidationContext } from './actor-migration-contracts.js';

type ReleaseProof = { capability: object; headBytes: Buffer; revision: number; valid: () => boolean };
const releases = new WeakMap<object, ReleaseProof>();

export function assertHostQuiescent(model: ActorModelView) {
  assert(model.accounting.complete && model.genesis.heldLegacyRefs.length === 0, 'Unknown accounting or legacy obligations retain occupancy');
  assert(model.actor.actors.every(a => a.openActivations === 0 && a.holds.length === 0), 'Actor holds retain occupancy');
  assert(model.mailboxes.every(m => m.entries.every(e => e.released)), 'Mailbox obligations retain occupancy');
  assert(model.workflows.every(w => w.disposed && w.unresolvedObligations.length === 0 && w.holds.every(h => h.resolvedBy !== null) && w.activations.every(a => !a.reservation.delivery && !a.reservation.run && !a.reservation.effects && !a.reservation.output)), 'Workflow or physical obligations retain occupancy');
}

export function createHostReleaseHandoff(capability: object, headBytes: Buffer, revision: number, root: unknown, context: ArchiveValidationContext, valid: () => boolean) {
  assertHostQuiescent(validateActorStateV2(root, context));
  const handoff = Object.freeze(Object.create(null)) as object;
  releases.set(handoff, { capability, headBytes: Buffer.from(headBytes), revision, valid });
  return handoff;
}

export function discardHostReleaseHandoff(handoff: object) { releases.delete(handoff); }

export function consumeHostReleaseHandoff(handoff: unknown, capability: object, headBytes: Buffer, revision: number) {
  assert(handoff !== null && typeof handoff === 'object', 'Host release handoff required');
  const proof = releases.get(handoff);
  releases.delete(handoff);
  assert(proof !== undefined && proof.capability === capability && proof.revision === revision && proof.headBytes.equals(headBytes) && proof.valid(), 'Unknown, transferred, stale or consumed Host release handoff');
  return Object.freeze({ nonAuthorizing: true, revision, headHash: archiveHash(headBytes), gate: 'never-admitted' });
}

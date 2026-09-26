// Staged pure model (AR-03/H1). Not imported by the live Main/Worker path; see docs/ACTOR-RPC-IMPLEMENTATION-PLAN.md.
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { COMMON_BOUNDS, decodePairJSON, encodePairJSON, pairDigest, validateId } from './actor-contract-common.js';
import { validateArchiveCheckpointV2, validateArchiveValidationContext } from './actor-migration-contracts.js';
import { validateActorStateV2 } from './actor-model.js';
import { assert } from './util.js';
import type { ArchiveCheckpointV2, ArchiveValidationContext, ArchiveSegmentV2, ArchiveResolvedArtifactV2 } from './actor-migration-contracts.js';
import type { ActorStateV2, ActorModelView } from './actor-model.js';

export type ArchiveFile = Readonly<{ ref: string; bytes: Buffer }>;
export function snapshotArchiveFiles(value: unknown): readonly ArchiveFile[] {
  assert(Array.isArray(value) && !types.isProxy(value) && value.length === 2, 'Rotation requires exactly two archive files');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.freeze([0, 1].map(index => {
    const slot = descriptors[String(index)];
    assert(slot !== undefined && Object.hasOwn(slot, 'value'), 'Archive files require inert entries');
    const file = slot.value;
    assert(file !== null && typeof file === 'object' && !types.isProxy(file), 'Invalid archive file');
    const fields = Object.getOwnPropertyDescriptors(file);
    assert(Reflect.ownKeys(fields).length === 2 && fields.ref?.enumerable && Object.hasOwn(fields.ref, 'value') && fields.bytes?.enumerable && Object.hasOwn(fields.bytes, 'value'), 'Invalid archive file fields');
    const ref = fields.ref.value, bytes = fields.bytes.value;
    assert(typeof ref === 'string' && /^archives\/[A-Za-z0-9_-]+\/(root|checkpoint)\.json$/.test(ref), 'Invalid archive locator');
    assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= COMMON_BOUNDS.maxBytes, 'Archive byte ceiling exceeded');
    return Object.freeze({ ref, bytes: Buffer.from(bytes) });
  }));
}

export type ArchiveReader = (ref: string, maximum: number) => Promise<Buffer>;
export const ARCHIVE_READ_LIMIT = COMMON_BOUNDS.maxReferencedBytes;
export const archiveHash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const same = (a: unknown, b: unknown) => encodePairJSON(a) === encodePairJSON(b);

export function emptyArchiveContext(storeId: string): ArchiveValidationContext {
  return validateArchiveValidationContext({ version: 2, kind: 'empty', storeId, head: null, segments: [], artifacts: [] });
}

export async function readArchiveContext(value: unknown, read: ArchiveReader): Promise<ArchiveValidationContext> {
  const root = decodePairJSON(encodePairJSON(value)) as unknown as ActorStateV2;
  assert(root !== null && typeof root === 'object' && root.genesis !== null && typeof root.genesis === 'object', 'Invalid archive root');
  const storeId = validateId(root.genesis.storeId, 'storeId');
  if (root.archiveHead === null) {
    const context = emptyArchiveContext(storeId);
    validateActorStateV2(root, context);
    return context;
  }
  const segments: ArchiveSegmentV2[] = [], artifacts: ArchiveResolvedArtifactV2[] = [];
  const visited = new Set<string>(), retained = new Map<string, ArchiveCheckpointV2['artifacts'][number]>();
  let checkpoint = validateArchiveCheckpointV2(root.genesis.checkpoint), remaining = ARCHIVE_READ_LIMIT;
  const load = async (ref: string, maximum: number) => {
    assert(remaining > 0, 'Archive aggregate byte limit exceeded');
    const bytes = Buffer.from(await read(ref, Math.min(maximum, remaining)));
    assert(bytes.length > 0 && bytes.length <= maximum && bytes.length <= remaining, 'Archive read exceeds byte ceiling');
    remaining -= bytes.length;
    const text = bytes.toString('utf8');
    assert(Buffer.from(text, 'utf8').equals(bytes), 'Archive requires exact UTF-8');
    return text;
  };
  while (true) {
    const id = validateId(checkpoint.archive.segmentId, 'segmentId');
    assert(!visited.has(id) && visited.size < COMMON_BOUNDS.maxReferences, 'Archive cycle or reference capacity');
    visited.add(id);
    const base = `archives/${id}`;
    const stored = validateArchiveCheckpointV2(decodePairJSON(await load(`${base}/checkpoint.json`, COMMON_BOUNDS.maxBytes)));
    assert(same(stored, checkpoint), 'Stored checkpoint differs from selected checkpoint');
    const original = await load(`${base}/root.json`, COMMON_BOUNDS.maxBytes);
    const decoded = decodePairJSON(original) as unknown as ArchiveSegmentV2['decoded'];
    segments.unshift({ reference: checkpoint.archive, checkpoint, original, decoded });
    for (const ref of checkpoint.artifacts) {
      assert(/^(artifacts\/[A-Za-z0-9_-]+|legacy\/[A-Za-z0-9_-]+\/(source|backup)\.bin)$/.test(ref.ref), 'Unsupported archive artifact locator');
      const prior = retained.get(ref.ref);
      assert(prior === undefined || same(prior, ref), 'Conflicting retained artifact');
      retained.set(ref.ref, ref);
    }
    assert(visited.size + retained.size <= COMMON_BOUNDS.maxReferences, 'Archive reference capacity');
    if (decoded.genesis.checkpoint === null) break;
    checkpoint = validateArchiveCheckpointV2(decoded.genesis.checkpoint);
  }
  for (const reference of retained.values()) artifacts.push({ reference, original: await load(reference.ref, COMMON_BOUNDS.maxReferenceBytes) });
  const context = validateArchiveValidationContext({ version: 2, kind: 'chain', storeId, head: root.archiveHead, segments, artifacts });
  validateActorStateV2(root, context);
  return context;
}

function preserved(before: ActorModelView, after: ActorModelView) {
  for (const key of ['actor', 'workflows', 'mailboxes', 'accounting', 'implementation'] as const) assert(same(before[key], after[key]), `Archive changed ${key} projection`);
}

export function planArchiveRotation(rootBytes: Buffer, context: ArchiveValidationContext, proposedCheckpoint: unknown) {
  const bytes = Buffer.from(rootBytes), root = decodePairJSON(bytes.toString('utf8'));
  assert(Buffer.from(encodePairJSON(root)).equals(bytes), 'Archive requires exact canonical selected root bytes');
  const before = validateActorStateV2(root, context), checkpoint = validateArchiveCheckpointV2(proposedCheckpoint);
  const ref = checkpoint.archive;
  assert(ref.storeId === before.genesis.storeId && ref.segmentId === before.state.segmentId && ref.originalHash === archiveHash(bytes) && ref.byteLength === bytes.length, 'Archive source byte binding mismatch');
  assert(checkpoint.rootHash === pairDigest('state', before.state), 'Archive source digest mismatch');
  const nextContext = validateArchiveValidationContext({ version: 2, kind: 'chain', storeId: ref.storeId, head: ref,
    segments: [...context.segments, { reference: ref, checkpoint, original: bytes.toString('utf8'), decoded: before.state }], artifacts: context.artifacts });
  const state = { ...before.state, segmentId: checkpoint.nextSegmentId, archiveHead: ref,
    genesis: { ...before.genesis, initialOwner: checkpoint.owner, checkpoint }, events: [] };
  const model = validateActorStateV2(state, nextContext);
  preserved(before, model);
  return Object.freeze({ nonAuthorizing: true as const, model, context: nextContext,
    rootBytes: Buffer.from(encodePairJSON(model.state)),
    files: Object.freeze([{ ref: `archives/${ref.segmentId}/root.json`, bytes },
      { ref: `archives/${ref.segmentId}/checkpoint.json`, bytes: Buffer.from(encodePairJSON(checkpoint)) }]) });
}

export function validateArchiveSuccessor(prior: unknown, next: unknown, context: ArchiveValidationContext) {
  const after = validateActorStateV2(next, context);
  const before = decodePairJSON(encodePairJSON(prior)) as unknown as ActorStateV2;
  if (before.segmentId === after.state.segmentId) {
    assert(same(before.genesis, after.genesis) && same(before.archiveHead, after.state.archiveHead), 'Actor genesis/archive continuity mismatch');
    assert(Array.isArray(before.events) && after.state.events.length >= before.events.length, 'Actor event prefix discarded');
    for (let i = 0; i < before.events.length; i++) assert(same(before.events[i], after.state.events[i]), 'Actor event prefix changed');
  } else {
    assert(context.kind === 'chain', 'Rotation requires complete archive chain');
    const last = context.segments.at(-1)!;
    assert(same(last.decoded, before) && last.original === encodePairJSON(before), 'Rotation does not archive exact predecessor');
    assert(after.state.events.length === 0 && same(after.genesis.actorDefinitions, before.genesis.actorDefinitions) && same(after.genesis.configSnapshot, before.genesis.configSnapshot) && same(after.genesis.heldLegacyRefs, before.genesis.heldLegacyRefs), 'Rotation changed genesis or appended events');
    const previousContext = context.segments.length === 1 ? emptyArchiveContext(context.storeId) : validateArchiveValidationContext({ ...context, head: before.archiveHead, segments: context.segments.slice(0, -1) });
    preserved(validateActorStateV2(before, previousContext), after);
  }
  return after;
}

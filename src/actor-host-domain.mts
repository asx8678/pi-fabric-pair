// Staged pure model (AR-03/H1). Not imported by the live Main/Worker path; see docs/ACTOR-RPC-IMPLEMENTATION-PLAN.md.
import path from 'node:path';
import * as Store from './actor-store.js';
import { readBounded, readBudget, withDirectory } from './actor-store-io.js';
import { COMMON_BOUNDS, decodePairJSON, encodePairJSON, validateId } from './actor-contract-common.js';
import { validateActorStateV2, validateActorWorkflowModel, validateActorWorkflowEvent, reduceActorWorkflow, projectLegacyWorkerView } from './actor-model.js';
import { emptyArchiveContext, readArchiveContext, planArchiveRotation, archiveHash } from './actor-archive.mjs';
import { assert } from './util.js';
import { assertHostQuiescent as quiescent, createHostReleaseHandoff, discardHostReleaseHandoff } from './actor-host-quiescence.mjs';
import type { ActorModelView } from './actor-model.js';
import type { ArchiveValidationContext } from './actor-migration-contracts.js';
import type { OwnerBinding, ActorConfigV3 } from './actor-contract-common.js';

type Options = { storeRoot: string; storeId: string; owner: unknown; workspace: unknown; process: unknown };
type Selected = NonNullable<Awaited<ReturnType<typeof Store.readHead>>>;
export type HostExpected = Readonly<{ owner: OwnerBinding; workspace: ReturnType<typeof Store.validateWorkspaceRecord>; configSnapshot: ActorConfigV3; branchRevision: string; revision: number }>;
const same = (a: unknown, b: unknown) => encodePairJSON(a) === encodePairJSON(b);
const detach = (value: unknown) => decodePairJSON(encodePairJSON(value));

export function createActorHostDomain(options: Options) {
  const input = detach(options) as unknown as Options;
  assert(input !== null && typeof input === 'object' && Object.keys(input).sort().join(',') === 'owner,process,storeId,storeRoot,workspace', 'Invalid Host options');
  const storeRoot = Store.storePaths(input.storeRoot).root, storeId = validateId(input.storeId, 'storeId');
  const owner = Store.validateOwnerRecord(input.owner), workspace = Store.validateWorkspaceRecord(input.workspace), processRecord = Store.validateProcessRecord(input.process);
  let phase: 'new' | 'acquiring' | 'owned' | 'held' | 'released' = 'new';
  let capability: object | null = null, selected: Selected | null = null, model: ActorModelView | null = null;
  let context: ArchiveValidationContext = emptyArchiveContext(storeId);
  let chain: Promise<unknown> = Promise.resolve(), pending: object | null = null, generation = 0, trulyAbsent = false, captures = false;
  const serialize = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = chain.then(operation, operation);
    chain = result.then(() => undefined, () => undefined);
    return result;
  };
  const requireOwned = () => {
    assert(phase === 'owned' && capability !== null, 'Host has no active ownership');
    return capability;
  };
  const revoke = () => { generation++; if (phase !== 'released') phase = 'held'; };
  const previous = () => selected === null ? null : ({ ref: `commits/${selected.head.commitId}.json`, hash: archiveHash(selected.headBytes), byteLength: selected.headBytes.length, revision: selected.head.revision });
  const resolve = (value: unknown) => withDirectory('/', async () => {
    const budget = readBudget();
    return readArchiveContext(value, (ref, maximum) => readBounded(path.join(storeRoot, ref), maximum, budget));
  });
  const adopt = async (readback: Selected | null) => {
    if (readback === null) { selected = null; model = null; context = emptyArchiveContext(storeId); return; }
    assert(readback.head.storeId === storeId && same(readback.head.workspace, workspace) && same(readback.head.owner, owner), 'Selected Host binding mismatch');
    let nextModel: ActorModelView | null = null, nextContext = emptyArchiveContext(storeId);
    if (readback.head.root.kind === 'actor') {
      nextContext = await resolve(readback.rootValue);
      nextModel = validateActorWorkflowModel(readback.rootValue, nextContext);
    }
    selected = { ...readback, headBytes: Buffer.from(readback.headBytes), rootBytes: Buffer.from(readback.rootBytes) };
    model = nextModel; context = nextContext;
  };
  const checkExpected = (value: unknown, initialize = false) => {
    requireOwned();
    assert(pending === null, 'Host publication already pending');
    assert(!captures, 'Unresolved captures retain occupancy');
    const expected = detach(value) as unknown as HostExpected;
    assert(expected !== null && typeof expected === 'object' && Object.keys(expected).sort().join(',') === 'branchRevision,configSnapshot,owner,revision,workspace', 'Invalid expected Host fence');
    assert(same(expected.owner, owner) && same(expected.workspace, workspace) && expected.branchRevision === owner.branchRevision, 'Host owner/workspace/branch fence mismatch');
    assert(expected.revision === (selected?.head.revision ?? 0), 'Host expected revision mismatch');
    if (!initialize) {
      assert(model !== null && model.genesis.configSnapshot.mode === 'actor-pair', 'Actor-pair model required; legacy remains non-executable');
      assert(same(expected.configSnapshot, model.genesis.configSnapshot), 'Host configuration fence mismatch');
    }
    return expected;
  };
  const publish = (nextModel: ActorModelView, nextContext: ArchiveValidationContext, operation?: (owned: object, input: Store.PublishInput) => Promise<Awaited<ReturnType<typeof Store.publishCommit>>>) => {
    const owned = requireOwned(), epoch = generation, token = Object.freeze({}), prior = previous();
    const rootBytes = Buffer.from(encodePairJSON(nextModel.state));
    const captured = Store.snapshotPublish({ rootKind: 'actor', rootBytes, previous: prior });
    pending = token;
    return serialize(async () => {
      try {
        assert(phase === 'owned' && capability === owned && generation === epoch, 'Host revoked before publication');
        const result = await (operation ?? Store.publishCommit)(owned, captured);
        const readback = await Store.readHead(storeRoot);
        assert(readback !== null && same(readback.head, result.head) && readback.rootBytes !== null && readback.rootBytes.equals(rootBytes), 'Store publication/readback mismatch');
        await adopt(readback);
        assert(model !== null && same(model.state, nextModel.state) && same(context, nextContext), 'Selected model/context differs from proposal');
        const revoked = phase !== 'owned' || capability !== owned || generation !== epoch;
        return Object.freeze({ nonAuthorizing: true, committed: true, revoked, head: readback.head, model });
      } catch (error) {
        revoke();
        try { await adopt(await Store.readHead(storeRoot)); } catch { }
        throw error;
      } finally { if (pending === token) pending = null; }
    });
  };
  return Object.freeze({
    storeRoot, storeId,
    acquire() {
      assert(phase === 'new', 'Host acquisition is single-use');
      phase = 'acquiring'; const epoch = generation;
      return serialize(async () => {
        try {
          const before = await Store.classifyStore(storeRoot);
          trulyAbsent = before.state === 'absent';
          const result = await Store.acquireStoreLock({ storeRoot, storeId, owner, workspace, process: processRecord });
          capability = result.capability;
          if (generation !== epoch || phase !== 'acquiring') return Object.freeze({ state: 'held', nonAuthorizing: true, issue: 'Host revoked during acquisition; reservation retained' });
          if (capability === null) { phase = 'held'; return { state: result.state, nonAuthorizing: true, issue: result.issue }; }
          await adopt(await Store.readHead(storeRoot));
          if (generation !== epoch || phase !== 'acquiring') return Object.freeze({ state: 'held', nonAuthorizing: true, issue: 'Host revoked during adoption; reservation retained' });
          phase = selected !== null && model === null ? 'held' : 'owned';
          return Object.freeze({ state: phase, nonAuthorizing: true, issue: result.issue });
        } catch (error) { revoke(); throw error; }
      });
    },
    initialize(expectedValue: unknown, root: unknown) {
      const expected = checkExpected(expectedValue, true);
      assert(trulyAbsent && selected === null && model === null && !captures, 'Initialization requires a truly absent store');
      const proposed = validateActorStateV2(detach(root), emptyArchiveContext(storeId));
      assert(proposed.state.events.length === 0 && proposed.genesis.storeId === storeId && same(proposed.genesis.initialOwner, owner), 'Initialization requires exact empty owner-bound genesis');
      assert(proposed.genesis.configSnapshot.mode === 'actor-pair' && same(expected.configSnapshot, proposed.genesis.configSnapshot), 'Initialization requires exact actor-pair configuration');
      trulyAbsent = false;
      return publish(proposed, emptyArchiveContext(storeId));
    },
    transition(expectedValue: unknown, event: unknown) {
      checkExpected(expectedValue);
      const captured = validateActorWorkflowEvent(event);
      const result = reduceActorWorkflow(model, captured, context);
      if (result.kind === 'reject' || result.kind === 'noop' || same(result.model.state, model!.state)) return Promise.resolve(result);
      assert(same(result.model.genesis.configSnapshot, model!.genesis.configSnapshot), 'Transition changed immutable configuration');
      let currentOwner = result.model.genesis.initialOwner;
      for (const entry of result.model.events) if (entry.domain === 'actor' && entry.payload.kind === 'owner-transitioned') currentOwner = entry.payload.next;
      assert(same(currentOwner, owner), 'Owner change requires a new Store ownership protocol');
      return publish(result.model, context);
    },
    planArchive(expectedValue: unknown, checkpoint: unknown) {
      checkExpected(expectedValue); quiescent(model!);
      assert(selected?.rootBytes !== null && selected?.rootBytes !== undefined, 'Selected root bytes required');
      return planArchiveRotation(selected.rootBytes, context, checkpoint);
    },
    archive(expectedValue: unknown, checkpoint: unknown) {
      checkExpected(expectedValue); quiescent(model!);
      assert(selected?.rootBytes !== null && selected?.rootBytes !== undefined, 'Selected root bytes required');
      const plan = planArchiveRotation(selected.rootBytes, context, checkpoint);
      return publish(plan.model, plan.context, (owned, input) => Store.publishArchiveCommit(owned, input, plan.files));
    },
    revoke,
    release() {
      revoke();
      return serialize(async () => {
        const owned = capability;
        if (owned === null || pending !== null || captures) return Object.freeze({ state: 'held', released: false, retained: true });
        try {
          const live = await Store.readHead(storeRoot);
          assert((live === null && selected === null) || (live !== null && selected !== null && live.headBytes.equals(selected.headBytes)), 'Release selected revision changed');
          let proof: object | undefined;
          if (selected !== null) {
            assert(model !== null && selected.head.root.kind === 'actor', 'Held legacy cannot clean-release');
            quiescent(model);
            const epoch = generation, revision = selected.head.revision, headBytes = Buffer.from(selected.headBytes);
            proof = createHostReleaseHandoff(owned, headBytes, revision, model.state, context, () => generation === epoch && phase === 'held' && pending === null && capability === owned && selected !== null && selected.headBytes.equals(headBytes));
          }
          try {
            const result = await Store.releaseStoreLock(owned, proof);
            if (result.released) { phase = 'released'; capability = null; }
            return result;
          } finally { if (proof !== undefined) discardHostReleaseHandoff(proof); }
        } catch (error) { return Object.freeze({ state: 'held', released: false, retained: true, issue: error instanceof Error ? error.message : String(error) }); }
      });
    },
    inspect() { return Object.freeze({ nonAuthorizing: true, state: phase, admission: false, pending: pending !== null, revision: selected?.head.revision ?? 0, model }); },
    project(workerId: string) {
      assert(model !== null, 'No adopted actor model');
      return projectLegacyWorkerView(model.state, validateId(workerId, 'workerId'), context);
    },
    read: () => serialize(() => Store.readHead(storeRoot)),
    classify: () => serialize(() => Store.classifyStore(storeRoot)),
    heldCapture(captureId: string, sourceBytes: Buffer) {
      const owned = requireOwned(), epoch = generation;
      assert(pending === null, 'Publication pending');
      const id = validateId(captureId, 'captureId');
      assert(Buffer.isBuffer(sourceBytes) && sourceBytes.length <= COMMON_BOUNDS.maxBytes, 'Invalid held capture bytes');
      const bytes = Buffer.from(sourceBytes); captures = true;
      return serialize(async () => {
        try {
          assert(generation === epoch && phase === 'owned', 'Host revoked before capture');
          const result = await Store.heldCapture(owned, id, bytes);
          assert(generation === epoch && phase === 'owned', 'Host revoked during capture');
          return result;
        } catch (error) { revoke(); throw error; }
      });
    },
    heldInventory: () => serialize(() => Store.heldInventory(storeRoot)),
    inspectHeld: (workerId?: string) => serialize(() => Store.inspectHeld(storeRoot, workerId)),
  });
}

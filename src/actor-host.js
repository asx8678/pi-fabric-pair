// Staged pure model (AR-03/H1). Not imported by the live Main/Worker path; see docs/ACTOR-RPC-IMPLEMENTATION-PLAN.md.
import { createActorHostDomain } from './actor-host-domain.mjs';

/** @param {{storeRoot:string, storeId:string, owner:unknown, workspace:unknown, process:unknown}} options */
export function createActorHost(options) {
  return createActorHostDomain(options);
}

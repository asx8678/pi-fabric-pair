import { createActorHostDomain } from './actor-host-domain.mjs';

/** @param {{storeRoot:string, storeId:string, owner:unknown, workspace:unknown, process:unknown}} options */
export function createActorHost(options) {
  return createActorHostDomain(options);
}

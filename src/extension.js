import { registerMain } from './main.js';
import { registerWorker } from './worker.js';
import { assert } from './util.js';

/**
 * Pair's role in this Pi process. A Fabric child agent or actor (Fabric sets
 * PI_FABRIC_PARENT_RUN on every child it launches) is `inert`: it must neither
 * start a Main controller of its own nor act as a Pair worker through inherited
 * worker variables. Without the marker, detection is unchanged.
 * @param {Record<string, string | undefined>} env
 * @returns {'main' | 'worker' | 'inert'}
 */
export function roleFromEnvironment(env = process.env) {
  if (env.PI_FABRIC_PARENT_RUN) return 'inert';
  const raw = env.PI_FABRIC_PAIR_ROLE;
  const hasWorkerBinding = ['PI_FABRIC_PAIR_WORKER_ID', 'PI_FABRIC_PAIR_WORKER_DIR', 'PI_FABRIC_PAIR_OWNER', 'PI_FABRIC_PAIR_OWNER_EPOCH', 'PI_FABRIC_PAIR_WORKER_GENERATION', 'PI_FABRIC_PAIR_NONCE'].some(key => env[key]);
  if (raw === undefined || raw === '') {
    assert(!hasWorkerBinding, 'Ambiguous Pair role: worker binding exists without PI_FABRIC_PAIR_ROLE=worker');
    return 'main';
  }
  assert(raw === 'main' || raw === 'worker', `Invalid PI_FABRIC_PAIR_ROLE: ${raw}`);
  if (raw === 'main') assert(!hasWorkerBinding, 'Ambiguous Pair role: Main cannot carry worker binding variables');
  return raw;
}

/** @param {import('@earendil-works/pi-coding-agent').ExtensionAPI} pi */
export default function fabricPair(pi) {
  const role = roleFromEnvironment();
  if (role === 'worker') registerWorker(pi);
  else if (role === 'main') registerMain(pi);
}

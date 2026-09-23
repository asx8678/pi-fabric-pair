/**
 * Standalone Pi entry point. Pi supplies the host API; this package has no
 * runtime npm dependencies and does not import Fabric or Fovea internals.
 */
import { registerMain } from './main.js';
import { registerWorker } from './worker.js';
import { assert } from './util.js';

/** @param {Record<string, string | undefined>} env */
export function roleFromEnvironment(env = process.env) {
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
  if (roleFromEnvironment() === 'worker') registerWorker(pi);
  else registerMain(pi);
}

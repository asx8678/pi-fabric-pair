/**
 * Standalone Pi entry point. Pi supplies the host API; this package has no
 * runtime npm dependencies and does not import Fabric or Fovea internals.
 * @param {import('@earendil-works/pi-coding-agent').ExtensionAPI} pi
 */
import { registerMain } from './main.js';
import { registerWorker } from './worker.js';
export default function fabricPair(pi) {
  if (process.env.PI_FABRIC_PAIR_ROLE === 'worker') registerWorker(pi);
  else registerMain(pi);
}

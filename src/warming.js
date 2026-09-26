/** Local guards keep this SDK adapter independent of storage/contracts (which
 * validate its diagnostic records). No runtime import cycle through util.js.
 * @param {unknown} condition @param {string} message @returns {asserts condition}
 */
function assert(condition, message) { if (!condition) throw new TypeError(message); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function plain(value) { return value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }

/** @typedef {{supported: boolean, requested: boolean, held: boolean, error: string | null}} WarmingObservation */
/** Proposed public SDK capability; optional for compatibility with older Pi versions.
 * @typedef {{sessionManager: {getSessionId: () => string}, acquireCacheWarming?: (mode: 'streaming' | 'idle') => (() => void)}} WarmingContext
 */

/** Nonpersistent ownership only. Native Pi owns scheduling, costs, TTLs and safety
 * windows. Reconciliation never starts a request or restarts a native warming run.
 */
export class ScopedCacheWarming {
  constructor() {
    /** @type {(() => void) | null} */ this.releaseLease = null;
    this.key = ''; this.failed = false;
    /** @type {WarmingObservation} */ this.observation = { supported: false, requested: false, held: false, error: null };
  }
  /** @returns {WarmingObservation} */
  snapshot() { return { ...this.observation }; }
  release() {
    const release = this.releaseLease; this.releaseLease = null;
    this.key = ''; this.failed = false;
    this.observation.requested = false; this.observation.held = false;
    try { release?.(); } catch (error) { this.observation.error = `Native lease release failed: ${String(error).slice(0, 1000)}`; }
  }
  /** A stable binding key, not the identity of per-event context objects.
   * @param {WarmingContext | null | undefined} ctx @param {boolean} requested @param {string} binding
   * @returns {WarmingObservation}
   */
  reconcile(ctx, requested, binding) {
    const key = ctx ? `${binding}:${ctx.sessionManager.getSessionId()}` : '';
    if (!requested || this.key && this.key !== key) this.release();
    const supported = typeof ctx?.acquireCacheWarming === 'function';
    if (!supported && this.releaseLease) this.release();
    this.observation.supported = supported; this.observation.requested = requested;
    if (!requested || !ctx || !supported) return this.snapshot();
    if (this.releaseLease || this.failed) return this.snapshot();
    this.key = key;
    try {
      const release = ctx.acquireCacheWarming?.('idle');
      assert(typeof release === 'function', 'Native warming capability did not return a release function');
      this.releaseLease = release; this.observation.held = true; this.observation.error = null;
    } catch (error) {
      this.failed = true; this.observation.error = `Scoped native warming unavailable: ${String(error).slice(0, 1000)}`;
    }
    return this.snapshot();
  }
}

/** Diagnostic validation only, never warming or implementation authority.
 * @param {unknown} value @returns {WarmingObservation}
 */
export function validateWarmingObservation(value) {
  assert(plain(value), 'Invalid scoped warming observation');
  assert(Object.keys(value).every(k => ['supported', 'requested', 'held', 'error'].includes(k)), 'Unknown scoped warming field');
  for (const key of ['supported', 'requested', 'held']) assert(typeof value[key] === 'boolean', `Invalid warming.${key}`);
  assert(value.error === null || typeof value.error === 'string' && value.error.length <= 2000, 'Invalid warming.error');
  assert(!value.held || value.supported && value.requested, 'Contradictory held warming lease');
  return /** @type {WarmingObservation} */ (value);
}

/** @param {unknown} value @returns {string} */
export function warmingLabel(value) {
  if (value == null) return 'not observed';
  const v = validateWarmingObservation(value);
  if (v.error) return v.error;
  if (!v.supported) return `${v.requested ? 'requested; ' : ''}unsupported SDK (no fallback)`;
  return v.held ? 'idle lease held (not proof of refresh or cache residency)' : v.requested ? 'requested; no lease held' : 'inactive (native/other owners unchanged)';
}

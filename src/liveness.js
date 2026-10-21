/**
 * Liveness: the pure projection that lets Pair and Main tell a busy worker from a hung one.
 *
 * It reads a runtime snapshot, the task and the worker's own telemetry, and answers one question: what is
 * this worker doing right now, and how long has it been doing it? Nothing here performs I/O or keeps state,
 * so the same inputs always give the same classification and the watchdog can be tested with a fake clock.
 */
/** @typedef {'starting' | 'streaming' | 'tool' | 'retrying' | 'compacting' | 'dialog' | 'silent' | 'idle' | 'stopped'} LivenessState */
/** Default silence threshold before a running worker counts as silent. */
export const DEFAULT_SILENT_MS = 60000;
/**
 * @typedef {object} Liveness
 * @property {LivenessState} state
 * @property {number | null} lastEventAgoMs
 * @property {{name: string, forMs: number} | null} tool
 * @property {{attempt: number | null, maxAttempts: number | null, delayMs: number | null, errorMessage: string | null, at: number} | null} retry
 * @property {{message: string, at: number, source: 'assistant' | 'retry' | 'compaction'} | null} lastError
 * @property {number | null} stepElapsedMs
 * @property {number | null} stepTimeoutMs
 * @property {{tokens: number | null, contextWindow: number | null, percent: number | null} | null} context
 */

/** @param {unknown} value @returns {number | null} a finite non-negative number, else null */
const ms = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
/** @param {unknown} value @returns {Record<string, unknown> | null} */
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : null;

/**
 * The context picture for a worker, without the rest of its telemetry.
 * @param {unknown} value
 * @returns {Liveness['context']}
 */
function contextOf(value) {
  const usage = plain(value);
  if (!usage) return null;
  const tokens = typeof usage.tokens === 'number' && Number.isFinite(usage.tokens) && usage.tokens >= 0 ? usage.tokens : null;
  const contextWindow = typeof usage.contextWindow === 'number' && Number.isFinite(usage.contextWindow) && usage.contextWindow > 0 ? usage.contextWindow : null;
  const percent = tokens !== null && contextWindow !== null ? Math.floor((tokens / contextWindow) * 100) : null;
  return { tokens, contextWindow, percent };
}

/**
 * Classify one worker's liveness.
 *
 * The order matters: an explicit stall signal (a running tool, a provider retry, a compaction, a dialog) is
 * reported before plain streaming, and 'silent' only applies when the runtime is genuinely not idle and no
 * such signal explains the quiet.
 * @param {{snapshot?: unknown, task?: unknown, telemetry?: unknown, now?: number, silentMs?: number}} input
 * @returns {Liveness}
 */
export function classifyLiveness({ snapshot, task, telemetry, now = Date.now(), silentMs = DEFAULT_SILENT_MS } = {}) {
  const snap = plain(snapshot);
  const record = plain(task);
  const observed = plain(telemetry);
  const threshold = ms(silentMs) ?? DEFAULT_SILENT_MS;
  /** @param {unknown} value @returns {number | null} an absolute timestamp */
  const at = value => { const n = ms(value); return n === null || n === 0 ? null : n; };

  const lastEventAt = snap ? at(snap.lastEventAt) : null;
  const lastEventAgoMs = lastEventAt === null ? null : Math.max(0, now - lastEventAt);
  /** @type {Liveness['retry']} */
  const retry = snap && plain(snap.retry) ? /** @type {Liveness['retry']} */ (snap.retry) : null;
  /** @type {Liveness['lastError']} */
  const lastError = snap && plain(snap.lastError) ? /** @type {Liveness['lastError']} */ (snap.lastError) : null;
  const toolEntry = snap ? plain(snap.tool) : null;
  const toolName = toolEntry && typeof toolEntry.name === 'string' ? toolEntry.name : null;
  const toolStart = at(toolEntry?.startedAt);
  /** @type {Liveness['tool']} */
  const tool = toolName && toolStart !== null ? { name: toolName, forMs: Math.max(0, now - toolStart) } : toolName ? { name: toolName, forMs: 0 } : null;

  const stepStartedAt = at(record?.updatedAt);
  const stepElapsedMs = stepStartedAt === null ? null : Math.max(0, now - stepStartedAt);
  const limits = plain(record?.limits);
  // The projection carries the step timeout in its limits; a task saved without it simply has none.
  const stepTimeoutMs = ms(limits?.activeStepTimeoutMs);

  const status = typeof record?.status === 'string' ? record.status : '';
  const running = status === 'running' || status === 'activating' || status === 'awaiting_settle';

  /** @type {LivenessState} */
  let state;
  // A closed or faulted process is the one thing no other signal can soften.
  if (!snap || snap.closed === true || typeof snap.fault === 'string') state = 'stopped';
  // No work in flight: the process is either waiting for instructions or not there.
  else if (!running) state = snap.ready === true && snap.idle === true ? 'idle' : 'stopped';
  else if (snap.permission === true) state = 'dialog';
  else if (tool) state = 'tool';
  else if (snap.retrying === true) state = 'retrying';
  else if (snap.compacting === true || snap.summarizationRetrying === true) state = 'compacting';
  else if (snap.ready !== true) state = 'starting';
  // A quiet runtime that says it is not idle and has reported nothing for a while is the dangerous case, even
  // when it still claims to be streaming: a stalled model request looks exactly like that.
  else if (snap.idle === false && (lastEventAgoMs === null || lastEventAgoMs >= threshold)) state = 'silent';
  else if (snap.streaming === true) state = 'streaming';
  else if (snap.idle === true) state = 'idle';
  else state = 'streaming';

  return { state, lastEventAgoMs, tool, retry, lastError, stepElapsedMs, stepTimeoutMs, context: contextOf(observed?.context) };
}
/**
 * Whether a state means "something is happening", so a stale warning must not fire.
 * @param {LivenessState | null | undefined} state
 * @returns {boolean}
 */
export function livenessActive(state) { return state === 'starting' || state === 'streaming' || state === 'tool' || state === 'retrying' || state === 'compacting' || state === 'dialog'; }
/**
 * A one-line description of what a worker is doing, for a supervision notice or a status row.
 * @param {Liveness | null | undefined} liveness
 * @returns {string}
 */
export function livenessLine(liveness) {
  if (!liveness) return 'liveness unknown';
  const age = liveness.lastEventAgoMs === null ? 'no events yet' : `last event ${Math.max(0, Math.round(liveness.lastEventAgoMs / 1000))}s ago`;
  const parts = [liveness.state, age];
  if (liveness.tool) parts.push(`tool ${liveness.tool.name} for ${Math.max(0, Math.round(liveness.tool.forMs / 1000))}s`);
  if (liveness.retry) parts.push(`provider retry ${liveness.retry.attempt ?? '?'}/${liveness.retry.maxAttempts ?? '?'}${liveness.retry.errorMessage ? `: ${liveness.retry.errorMessage}` : ''}`);
  if (liveness.context?.percent !== null && liveness.context?.percent !== undefined) parts.push(`context ${liveness.context.percent}%`);
  return parts.join(' · ');
}

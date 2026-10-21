/**
 * Provider failures: telling a rate limit from a quota stop, and how long Pair waits before trying again.
 *
 * Pure and keyed on the error text a provider actually returns, so a supervised worker pauses for a bounded,
 * predictable time instead of stalling until a human notices.
 */

/** A quota stop needs a long wait: nothing Pair does will restore an exhausted account or credit balance. */
const QUOTA = /quota|usage limit|hit your limit|insufficient|credit|billing|exceeded your/i;
/** A transient failure usually clears in seconds or minutes. */
const TRANSIENT = /rate.?limit|overload|timeout|timed out|ECONN|network|socket|stream|terminated|unavailable|\b(429|500|502|503|504|529)\b/i;
/** The backoff never grows past this, however many waits deep a step is. */
export const MAX_TRANSIENT_WAIT_MS = 15 * 60_000;

/** @typedef {'quota' | 'transient'} ProviderFailureKind */
/**
 * @typedef {object} ProviderFailure
 * @property {ProviderFailureKind} kind
 * @property {string} reason bounded, one line, safe to show
 * @property {number} waitMs how long Pair should wait before it retries
 */

/**
 * Classify a provider error and compute its bounded wait.
 *
 * Quota always waits the configured quota cooldown. Transient doubles per wait already spent for this step, up
 * to MAX_TRANSIENT_WAIT_MS. An error that matches neither, or no error at all, classifies as null: Pair then
 * keeps its ordinary missing-report path rather than inventing a wait.
 * @param {unknown} message @param {{providerCooldownMs: number, quotaCooldownMs: number, waits?: number}} control
 * @returns {ProviderFailure | null}
 */
export function classifyProviderError(message, control) {
  const text = typeof message === 'string' ? message.replace(/\s+/g, ' ').trim() : '';
  if (!text) return null;
  const reason = text.slice(0, 300);
  const quota = typeof control?.quotaCooldownMs === 'number' && Number.isFinite(control.quotaCooldownMs) ? control.quotaCooldownMs : 900000;
  const base = typeof control?.providerCooldownMs === 'number' && Number.isFinite(control.providerCooldownMs) ? control.providerCooldownMs : 60000;
  const waits = typeof control?.waits === 'number' && Number.isFinite(control.waits) && control.waits > 0 ? Math.trunc(control.waits) : 0;
  // Quota is checked first: "rate limit exceeded your quota" is a quota stop, not a short backoff.
  if (QUOTA.test(text)) return { kind: 'quota', reason, waitMs: Math.max(1000, Math.trunc(quota)) };
  if (TRANSIENT.test(text)) return { kind: 'transient', reason, waitMs: Math.min(MAX_TRANSIENT_WAIT_MS, Math.max(1000, Math.trunc(base * 2 ** Math.min(waits, 20)))) };
  return null;
}

/**
 * How many waits a step may still use.
 * @param {number} maxProviderWaits @param {number} waits already spent
 * @returns {boolean}
 */
export function providerWaitsLeft(maxProviderWaits, waits) { return Number.isFinite(maxProviderWaits) && waits < Math.trunc(maxProviderWaits); }

/**
 * The pin-to-a-minute label for a scheduled retry, as the interruption text shows it.
 * @param {number} at @returns {string} HH:MM in local time, or 'later' when the value is not a time
 */
export function retryClock(at) {
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return 'later';
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * The interruption text a task carries while it waits for the provider.
 * @param {{reason: string, retryAt: number, waits: number, maxWaits: number}} input
 * @returns {string}
 */
export function providerWaitText({ reason, retryAt, waits, maxWaits }) {
  return `Waiting for provider (${reason}) — automatic retry at ${retryClock(retryAt)} (${waits}/${maxWaits})`;
}

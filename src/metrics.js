import { validateUsageObservation } from './observations.js';

/** @typedef {import('./observations.js').UsageObservation} UsageObservation */
/** @typedef {import('./observations.js').UsageTotals} UsageTotals */
/** @typedef {'input' | 'cacheRead' | 'cacheWrite' | 'output'} UsageToken */

/** @param {unknown} value @returns {value is number} */
const finiteNumber = value => Number.isFinite(value);

/**
 * @param {(Partial<Record<UsageToken, unknown>> & {cost?: {total?: unknown} | null}) | null | undefined} usage
 * @returns {UsageObservation | null}
 */
export function normalizedUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  /** @param {UsageToken} key */
  const finite = key => finiteNumber(usage[key]) && usage[key] >= 0 ? usage[key] : 0;
  const input = finite('input'), cacheRead = finite('cacheRead'), cacheWrite = finite('cacheWrite'), output = finite('output');
  const totalInput = input + cacheRead + cacheWrite;
  const cost = usage.cost && finiteNumber(usage.cost.total) && usage.cost.total >= 0 ? usage.cost.total : null;
  return { input, cacheRead, cacheWrite, totalInput, output, cacheRatio: totalInput ? cacheRead / totalInput : null, cost, observedAt: Date.now() };
}
/** Select display telemetry only; accounting still consumes every normalized response.
 * Report-stop/error placeholders with no measured input must not erase a sample or
 * refresh its timestamp. A real request with zero cache reads IS a new measurement.
 * Callers clear their retained sample explicitly at model/session/compaction boundaries.
 * @param {unknown} previous
 * @param {Parameters<typeof normalizedUsage>[0]} usage
 * @returns {UsageObservation | null}
 */
export function selectLastMeasuredUsage(previous, usage) {
  const next = normalizedUsage(usage);
  if (next && Number.isFinite(next.totalInput) && next.totalInput > 0) return next;
  const retained = validateUsageObservation(previous ?? null, 'Last measured usage');
  return retained && retained.totalInput > 0 ? retained : null;
}
/** @param {Partial<UsageTotals> | null | undefined} total @param {UsageObservation} usage @returns {UsageTotals} */
export function addUsage(total = {}, usage) {
  total ||= {};
  /** @type {UsageTotals} */
  const out = { ...total,
    input: (total.input || 0) + usage.input,
    cacheRead: (total.cacheRead || 0) + usage.cacheRead,
    cacheWrite: (total.cacheWrite || 0) + usage.cacheWrite,
    totalInput: (total.totalInput || 0) + usage.totalInput,
    output: (total.output || 0) + usage.output,
    reportedCost: (total.reportedCost || 0) + (usage.cost || 0),
    unknownCostRequests: (total.unknownCostRequests || 0) + (usage.cost === null ? 1 : 0),
    requests: (total.requests || 0) + 1,
    cacheRatio: null
  };
  out.cacheRatio = out.totalInput ? out.cacheRead / out.totalInput : null;
  return out;
}
/** Enforced task budgets: reported inference cost and output tokens only. The former
 * per-step turn limit and overall task duration limit were removed and are never
 * checked here, even when a legacy snapshot still carries their values.
 * @param {{usage?: Partial<UsageTotals> | null}} task
 * @param {import('./contracts.js').BaseTaskLimits} limits @returns {string | null}
 */
export function limitExceeded(task, limits) {
  if (limits.maxReportedCostUsd !== null && (task.usage?.reportedCost || 0) >= limits.maxReportedCostUsd) return 'Reported inference-cost budget reached';
  if (limits.maxOutputTokens !== null && (task.usage?.output || 0) >= limits.maxOutputTokens) return 'Output-token budget reached';
  return null;
}

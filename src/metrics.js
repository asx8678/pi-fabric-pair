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
/** @param {unknown} previous @param {Parameters<typeof normalizedUsage>[0]} usage @returns {UsageObservation | null} */
export function selectLastMeasuredUsage(previous, usage) {
  const next = normalizedUsage(usage);
  if (next && Number.isFinite(next.totalInput) && next.totalInput > 0) return next;
  const retained = validateUsageObservation(previous ?? null, 'Last measured usage');
  return retained && retained.totalInput > 0 ? retained : null;
}
/**
 * @param {{tokens: number, seconds: number} | null} speed
 * @param {number | null} start
 * @param {number} end
 * @param {unknown} usage
 * @returns {{tokens: number, seconds: number} | null}
 */
export function addSpeedSample(speed, start, end, usage) {
  if (start === null || !Number.isFinite(start) || !Number.isFinite(end)) return speed;
  const observed = normalizedUsage(/** @type {Parameters<typeof normalizedUsage>[0]} */ (usage));
  if (!observed || !(observed.output > 0)) return speed;
  const seconds = (end - start) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return speed;
  return { tokens: (speed?.tokens || 0) + observed.output, seconds: (speed?.seconds || 0) + seconds };
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
/** The configured, task-scoped figures a per-task cap is derived from. @typedef {{policy?: {maxRevisions?: unknown, maxRevisionsPerStep?: unknown} | null, limits?: object | null, steps?: unknown}} CapSources */
/** The caps in force for one task. @typedef {{maxRevisions: number, maxReportsPerTask: number}} EffectiveCaps */
const FALLBACK_MAX_REVISIONS = 20;
const FALLBACK_MAX_REVISIONS_PER_STEP = 3;
const FALLBACK_MAX_REPORTS_PER_TASK = 40;
/** @param {unknown} value @param {number} fallback @returns {number} */
const capNumber = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
/**
 * The per-task caps in force, scaled to the length of the current plan.
 *
 * Configured values are floors, never ceilings: a plan Main has revised to be longer than the configured
 * revision budget may still be revised and delivered, so a long plan cannot stall on a cap written for a
 * short one. A call site with no task at hand (no steps) falls back to the configured value.
 * @param {CapSources | null | undefined} task
 * @returns {EffectiveCaps}
 */
export function effectiveCaps(task) {
  const steps = Array.isArray(task?.steps) ? task.steps.length : 0;
  const policy = task?.policy;
  const configuredRevisions = capNumber(policy?.maxRevisions, FALLBACK_MAX_REVISIONS);
  const configuredPerStep = capNumber(policy?.maxRevisionsPerStep, FALLBACK_MAX_REVISIONS_PER_STEP);
  const limits = task?.limits;
  // maxReportsPerTask is a config/limit field, not part of BaseTaskLimits; read it defensively.
  const configuredReports = capNumber(limits && Object.hasOwn(limits, 'maxReportsPerTask') ? /** @type {Record<string, unknown>} */ (limits).maxReportsPerTask : undefined, FALLBACK_MAX_REPORTS_PER_TASK);
  return {
    maxRevisions: Math.max(configuredRevisions, steps * 2),
    // Every step may be revised its per-step allowance, and each revision is a report that must reach Main.
    maxReportsPerTask: Math.max(configuredReports, steps * (configuredPerStep + 2))
  };
}

/** @param {{usage?: Partial<UsageTotals> | null}} task @param {import('./contracts.js').BaseTaskLimits} limits @returns {string | null} */
export function limitExceeded(task, limits) {
  if (limits.maxReportedCostUsd !== null && (task.usage?.reportedCost || 0) >= limits.maxReportedCostUsd) return 'Reported inference-cost budget reached';
  if (limits.maxOutputTokens !== null && (task.usage?.output || 0) >= limits.maxOutputTokens) return 'Output-token budget reached';
  return null;
}

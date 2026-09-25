import { types as nodeTypes } from 'node:util';

/**
 * Numeric observations retained by metrics.js, not proof of complete accounting.
 * Validators borrow the original inert JSON record; they never fill or sum fields.
 */

/**
 * @typedef {object} UsageNumbers
 * @property {number} input
 * @property {number} cacheRead
 * @property {number} cacheWrite
 * @property {number} totalInput
 * @property {number} output
 * @property {number | null} cacheRatio
 */

/**
 * A normalized response observation. Token numbers may be fractional or zero-filled
 * by the producer; a known cost does not establish complete token observations.
 * @typedef {UsageNumbers & {cost: number | null, observedAt: number}} UsageObservation
 */

/**
 * A reported USD subtotal and response counters, not a complete spending total.
 * Unknown prices contribute zero to reportedCost without becoming known prices.
 * @typedef {UsageNumbers & {reportedCost: number, unknownCostRequests: number, requests: number}} UsageTotals
 */

/** Known data errors may be classified without parsing human-readable messages. */
export class UsageValidationError extends TypeError {
  /** @param {'invalid-field' | 'missing-required-field'} code @param {string} path @param {string} message */
  constructor(code, path, message) {
    super(message);
    this.name = 'UsageValidationError'; this.code = code; this.path = path;
  }
}

const NUMBER_FIELDS = ['input', 'cacheRead', 'cacheWrite', 'totalInput', 'output', 'cacheRatio'];
const OBSERVATION_FIELDS = [...NUMBER_FIELDS, 'cost', 'observedAt'];
const TOTAL_FIELDS = [...NUMBER_FIELDS, 'reportedCost', 'unknownCostRequests', 'requests'];

/** @param {unknown} condition @param {string} message @param {string} path @param {'invalid-field' | 'missing-required-field'} [code] @returns {asserts condition} */
function invariant(condition, message, path, code = 'invalid-field') {
  if (!condition) throw new UsageValidationError(code, path, message);
}

/**
 * Every field in these closed, flat shapes is required. Check descriptors before
 * reading values; reject proxies before reflection can execute a caller's traps.
 * Frozen records and records with a null prototype need no normalization.
 * @param {unknown} value
 * @param {readonly string[]} fields
 * @param {string} label
 * @returns {asserts value is Record<string, unknown>}
 */
function assertRecord(value, fields, label) {
  invariant(value !== null && typeof value === 'object' && !nodeTypes.isProxy(value) && !Array.isArray(value), `${label} must be a plain record`, label);
  /** @type {unknown} */
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${label} must have a plain or null prototype`, label);
  for (const key of Reflect.ownKeys(value)) {
    invariant(typeof key === 'string', `${label} must not contain symbol fields`, label);
    invariant(fields.includes(key), `${label}.${key} is not allowed`, `${label}.${key}`);
  }
  for (const key of fields) {
    const at = `${label}.${key}`;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    invariant(descriptor !== undefined, `${at} must be an own field`, at, 'missing-required-field');
    invariant(Object.hasOwn(descriptor, 'value') && descriptor.enumerable === true, `${at} must be an enumerable data field`, at);
  }
}

/** @param {unknown} value @param {string} label @returns {number} */
function nonnegative(value, label) {
  invariant(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${label} must be a finite nonnegative number`, label);
  return value;
}

/** @param {unknown} value @param {string} label @returns {number} */
function counter(value, label) {
  const result = nonnegative(value, label);
  invariant(Number.isSafeInteger(result), `${label} must be a safe nonnegative integer`, label);
  return result;
}

/**
 * Called only after all fields have been checked as own data properties.
 * @param {Record<string, unknown>} value
 * @param {string} label
 * @returns {asserts value is Record<string, unknown> & UsageNumbers}
 */
function assertUsageNumbers(value, label) {
  const input = nonnegative(value.input, `${label}.input`);
  const cacheRead = nonnegative(value.cacheRead, `${label}.cacheRead`);
  const cacheWrite = nonnegative(value.cacheWrite, `${label}.cacheWrite`);
  const totalInput = nonnegative(value.totalInput, `${label}.totalInput`);
  nonnegative(value.output, `${label}.output`);

  // Nonnegative sums and their accumulations cannot be smaller than a component.
  // Do not recompute their sum: independent floating-point accumulation can differ.
  invariant(totalInput >= input && totalInput >= cacheRead && totalInput >= cacheWrite, `${label}.totalInput must be at least each input component`, `${label}.totalInput`);
  if (input === 0 && cacheRead === 0 && cacheWrite === 0) {
    invariant(totalInput === 0, `${label}.totalInput must be zero when all input components are zero`, `${label}.totalInput`);
  }

  if (totalInput === 0) {
    invariant(value.cacheRatio === null, `${label}.cacheRatio must be null when totalInput is zero`, `${label}.cacheRatio`);
  } else {
    const ratio = nonnegative(value.cacheRatio, `${label}.cacheRatio`);
    invariant(ratio <= 1, `${label}.cacheRatio must be at most one`, `${label}.cacheRatio`);
    // A positive cacheRead can still yield a zero ratio through underflow.
    if (cacheRead === 0) invariant(ratio === 0, `${label}.cacheRatio must be zero when cacheRead is zero`, `${label}.cacheRatio`);
    if (cacheRead === totalInput) invariant(ratio === 1, `${label}.cacheRatio must be one when cacheRead equals totalInput`, `${label}.cacheRatio`);
  }
}

/** @param {unknown} value @param {string} label @returns {asserts value is UsageObservation} */
function assertUsageObservation(value, label) {
  assertRecord(value, OBSERVATION_FIELDS, label);
  assertUsageNumbers(value, label);
  if (value.cost !== null) nonnegative(value.cost, `${label}.cost`);
  counter(value.observedAt, `${label}.observedAt`);
}

/** @param {unknown} value @param {string} label @returns {asserts value is UsageTotals} */
function assertUsageTotals(value, label) {
  assertRecord(value, TOTAL_FIELDS, label);
  assertUsageNumbers(value, label);
  nonnegative(value.reportedCost, `${label}.reportedCost`);
  const requests = counter(value.requests, `${label}.requests`);
  const unknownCostRequests = counter(value.unknownCostRequests, `${label}.unknownCostRequests`);
  invariant(unknownCostRequests <= requests, `${label}.unknownCostRequests must not exceed requests`, `${label}.unknownCostRequests`);
  // Do not infer price or token completeness from counters, zeros or a subtotal.
}

/**
 * Validate without mutation, normalization or replacement. Only null is absent;
 * undefined (including an omitted argument) is malformed, not an empty record.
 * @param {unknown} value
 * @param {string} [label]
 * @returns {UsageObservation | null}
 */
export function validateUsageObservation(value, label = 'usage observation') {
  if (value === null) return null;
  assertUsageObservation(value, label);
  return value;
}

/**
 * Validate the reported subtotal as stored; do not reinterpret unknown prices.
 * @param {unknown} value
 * @param {string} [label]
 * @returns {UsageTotals | null}
 */
export function validateUsageTotals(value, label = 'usage totals') {
  if (value === null) return null;
  assertUsageTotals(value, label);
  return value;
}

/**
 * Pure helpers for the two small histories Pair keeps: a bounded per-task timeline of reports and decisions,
 * and a bounded ring buffer of worker tool events. Both are additive data: a task or file written before
 * they existed still loads and simply has no history.
 */

/** The timeline keeps the most recent entries; anything older is dropped. */
export const TIMELINE_LIMIT = 60;
/** Decision feedback is stored as an excerpt this long, never the whole text. */
export const FEEDBACK_EXCERPT = 160;
/** The activity ring buffer keeps this many tool events. */
export const ACTIVITY_LIMIT = 8;

/** @typedef {{type: 'report', reportId: string, step: number, kind: string, at: number, verification: {passed: number, failed: number}}} TimelineReport */
/** @typedef {{type: 'decision', reportId: string, step: number, action: string, at: number, feedback: string}} TimelineDecision */
/** @typedef {TimelineReport | TimelineDecision} TimelineEntry */
/** @typedef {{tool: string, target: string, at: number}} ActivityEvent */

/** @param {unknown} value @returns {boolean} */
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value @returns {number} */
const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
/** @param {unknown} value @param {number} max @returns {string} */
const shortText = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Appends an entry and keeps only the newest entries. Absent history starts empty; a corrupt entry is dropped.
 * @param {TimelineEntry[] | undefined | null} timeline
 * @param {TimelineEntry} entry
 * @returns {TimelineEntry[]}
 */
export function appendTimeline(timeline, entry) {
  const kept = normalizeTimeline(timeline);
  kept.push(entry);
  return kept.length > TIMELINE_LIMIT ? kept.slice(kept.length - TIMELINE_LIMIT) : kept;
}

/**
 * Reads a stored timeline tolerantly: entries that do not look like the two known shapes are skipped, so a
 * hand-edited or older file cannot break loading.
 * @param {unknown} value
 * @returns {TimelineEntry[]}
 */
export function normalizeTimeline(value) {
  if (!Array.isArray(value)) return [];
  /** @type {TimelineEntry[]} */
  const entries = [];
  for (const item of value) {
    if (!isObject(item)) continue;
    const record = /** @type {{type?: unknown, reportId?: unknown, step?: unknown, kind?: unknown, at?: unknown, action?: unknown, feedback?: unknown, verification?: unknown}} */ (item);
    if (typeof record.reportId !== 'string' || !record.reportId) continue;
    if (record.type === 'report') {
      const check = isObject(record.verification) ? /** @type {{passed?: unknown, failed?: unknown}} */ (record.verification) : {};
      entries.push({ type: 'report', reportId: record.reportId.slice(0, 120), step: Math.max(1, Math.trunc(finite(record.step))), kind: shortText(record.kind, 40) || 'report', at: finite(record.at), verification: { passed: Math.max(0, Math.trunc(finite(check.passed))), failed: Math.max(0, Math.trunc(finite(check.failed))) } });
    } else if (record.type === 'decision') {
      entries.push({ type: 'decision', reportId: record.reportId.slice(0, 120), step: Math.max(1, Math.trunc(finite(record.step))), action: shortText(record.action, 20) || 'unknown', at: finite(record.at), feedback: excerpt(record.feedback) });
    }
  }
  return entries.length > TIMELINE_LIMIT ? entries.slice(entries.length - TIMELINE_LIMIT) : entries;
}

/**
 * A decision's feedback as a one-line excerpt.
 * @param {unknown} value
 * @returns {string}
 */
export function excerpt(value) { return shortText(value, FEEDBACK_EXCERPT); }

/**
 * The report entry recorded when a report is finalized.
 * @param {{reportId: string, kind: string, step: number, at: number, verification?: {name: string, passed: boolean}[]}} input
 * @returns {TimelineReport}
 */
export function reportEntry({ reportId, kind, step, at, verification = [] }) {
  const checks = Array.isArray(verification) ? verification : [];
  return { type: 'report', reportId, step, kind, at, verification: { passed: checks.filter(check => check.passed === true).length, failed: checks.filter(check => check.passed !== true).length } };
}

/**
 * The decision entry recorded when a decision is written.
 * @param {{reportId: string, step: number, action: string, at: number, feedback?: string}} input
 * @returns {TimelineDecision}
 */
export function decisionEntry({ reportId, step, action, at, feedback = '' }) {
  return { type: 'decision', reportId, step, action, at, feedback: excerpt(feedback) };
}

/**
 * Appends one tool event to the activity ring buffer, keeping the newest ACTIVITY_LIMIT entries.
 * @param {ActivityEvent[] | undefined | null} activity
 * @param {ActivityEvent} event
 * @returns {ActivityEvent[]}
 */
export function pushActivity(activity, event) {
  const kept = normalizeActivity(activity);
  kept.push({ tool: shortText(event.tool, 80), target: shortText(event.target, 300), at: finite(event.at) });
  return kept.length > ACTIVITY_LIMIT ? kept.slice(kept.length - ACTIVITY_LIMIT) : kept;
}

/**
 * Reads an activity file tolerantly: a missing, truncated or hand-edited file yields [] (or the valid entries).
 * @param {unknown} value
 * @returns {ActivityEvent[]}
 */
export function normalizeActivity(value) {
  /** @type {unknown[]} */
  const list = isObject(value) && Array.isArray(/** @type {{events?: unknown}} */ (value).events) ? /** @type {{events: unknown[]}} */ (value).events
    : Array.isArray(value) ? value : [];
  /** @type {ActivityEvent[]} */
  const events = [];
  for (const item of list) {
    if (!isObject(item)) continue;
    const record = /** @type {{tool?: unknown, target?: unknown, at?: unknown}} */ (item);
    if (typeof record.tool !== 'string' || !record.tool) continue;
    events.push({ tool: record.tool.slice(0, 80), target: shortText(record.target, 300), at: finite(record.at) });
  }
  return events.length > ACTIVITY_LIMIT ? events.slice(events.length - ACTIVITY_LIMIT) : events;
}

import { Input, SelectList, matchesKey, truncateToWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { assert, briefError, cleanText, clone } from './util.js';
import { INDICATORS, validateConfig } from './config.js';
import { validateUsageObservation } from './observations.js';
import { warmingLabel } from './warming.js';

/** @typedef {import('@earendil-works/pi-coding-agent').ExtensionContext} UIContext */
/** @typedef {Readonly<ReturnType<import('./controller.js').PairController['summary']>>} PairSummary */
/** @typedef {(next: import('./config.js').PairConfig, scope: import('./config.js').ConfigScope) => Promise<import('./config.js').PairConfig | void>} ApplySettings */
/** @typedef {{loadScope?: (scope: import('./config.js').ConfigScope) => Promise<import('./config.js').PairConfig>, migrate?: (scope: import('./config.js').ConfigScope) => Promise<import('./config.js').PairConfig | void>}} SettingsOptions */

/** Read controller's unknown observation boundary through the actual SDK shape.
 * @param {unknown} value @returns {Readonly<import('@earendil-works/pi-coding-agent').ContextUsage> | null}
 */
function contextUsage(value) {
  if (value == null) return null;
  assert(typeof value === 'object' && !Array.isArray(value), 'Invalid Main context observation');
  assert('tokens' in value && (value.tokens === null || (typeof value.tokens === 'number' && Number.isFinite(value.tokens))), 'Invalid Main context tokens');
  assert('contextWindow' in value && typeof value.contextWindow === 'number' && Number.isFinite(value.contextWindow), 'Invalid Main context window');
  assert('percent' in value && (value.percent === null || (typeof value.percent === 'number' && Number.isFinite(value.percent))), 'Invalid Main context percentage');
  return { tokens: value.tokens, contextWindow: value.contextWindow, percent: value.percent };
}

/** @param {string} status @returns {string} */
export function symbol(status) {
  if (['working', 'settling', 'starting'].includes(status)) return '◉';
  if (['question', 'review', 'blocked', 'permission'].includes(status)) return '◐';
  if (['attention', 'error', 'interrupted'].includes(status)) return '!';
  if (status === 'ready') return '●';
  return '○';
}
/** Semantic activity colors; every name must exist in the active Pi theme.
 * @typedef {'accent' | 'success' | 'warning' | 'error' | 'muted' | 'dim'} IndicatorColor */

/** Theme companion of symbol(): one semantic color per activity status.
 * @param {string} status @returns {IndicatorColor} */
function statusColor(status) {
  if (['working', 'settling', 'starting'].includes(status)) return 'success';
  if (['question', 'review', 'blocked', 'permission'].includes(status)) return 'warning';
  if (['attention', 'error', 'interrupted'].includes(status)) return 'error';
  if (status === 'ready') return 'muted';
  return 'dim';
}
/** The activity pulse stops after this long without worker telemetry/exchange
 * events; long model turns are legitimate, so this is deliberately generous. */
export const PULSE_MAX_AGE_MS = 120000;
/** Beyond this silence the worker is flagged stale for explicit reconciliation. */
export const STALE_AGE_MS = 300000;
/** Milliseconds since the worker's most recent observed activity (telemetry or
 * exchange). Zero before the first event: a just-started worker is not stale.
 * @param {PairSummary['workers'][number]} worker @param {number} [now]
 * @returns {number} */
export function activityAge(worker, now = Date.now()) {
  const last = Math.max(worker.observation?.at || 0, worker.lastExchange?.at || 0);
  return last > 0 ? Math.max(0, now - last) : 0;
}
/** @param {number} ageMs @returns {string} */
export function ageLabel(ageMs) {
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
/** Active workers silent past STALE_AGE_MS; for one-shot alerting, not rendering.
 * @param {PairSummary} summary @param {number} [now]
 * @returns {{id: string, ageMs: number}[]} */
export function staleWorkers(summary, now = Date.now()) {
  return summary.workers
    .filter(w => ['working', 'settling', 'starting'].includes(w.status) && activityAge(w, now) >= STALE_AGE_MS)
    .map(w => ({ id: w.id, ageMs: activityAge(w, now) }));
}

/** Direction of the active exchange flow, from the same status set as symbol().
 * '→' points at the worker while a dispatched plan/step is heading there or being
 * worked; '←' points at Main while a worker report/question waits for a decision.
 * @param {string} status @returns {'' | '→' | '←'} */
function flowArrow(status) {
  if (['working', 'settling', 'starting'].includes(status)) return '→';
  if (['question', 'review', 'blocked', 'permission'].includes(status)) return '←';
  return '';
}
/** Average measured assistant streaming throughput for the worker row: summed
 * provider-reported output tokens over summed message_start→message_end seconds.
 * message_start fires when the provider response begins streaming, so
 * pre-response request/prefill latency is excluded along with tool execution
 * and idle gaps; unusable samples never touch the aggregate. Unavailable is
 * explicit, never a fabricated zero.
 * @param {{tokens?: unknown, seconds?: unknown} | null | undefined} speed
 * @returns {string} */
export function speedLabel(speed) {
  const tokens = speed?.tokens, seconds = speed?.seconds;
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0
    || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return 'avg — tok/s';
  return `avg ${(tokens / seconds).toFixed(1)} tok/s`;
}
/** Read the optional current-telemetry streaming-throughput aggregate from a worker
 * observation; historical/legacy observations have none and stay unavailable.
 * @param {PairSummary['workers'][number]['observation']} observation
 * @returns {{tokens?: unknown, seconds?: unknown} | null | undefined} */
function observedSpeed(observation) {
  return observation && typeof observation === 'object' && 'speed' in observation
    ? /** @type {{tokens?: unknown, seconds?: unknown} | null | undefined} */ (observation.speed) : undefined;
}
/** One line of worker-supplied or plan text for inline display: control and escape
 * sequences stripped, whitespace (including newlines) collapsed, length bounded.
 * @param {unknown} value @param {number} [max] @returns {string} */
function inline(value, max = 200) { return cleanText(value, 4000).replace(/\s+/g, ' ').trim().slice(0, max); }
/** Reported cost in one format everywhere it is summarized. A tiny nonzero cost is
 * shown as an upper bound rather than rounded to a fabricated zero.
 * @param {number} cost @returns {string} */
export function costLabel(cost) {
  if (cost >= 0.1) return `$${cost.toFixed(2)}`;
  return cost >= 0.001 ? `$${cost.toFixed(3)}` : '<$0.001';
}
/** The next thing a person can do for a worker that is not running, if any.
 * @param {PairSummary['workers'][number]} worker @returns {string} */
function nextAction(worker) {
  if (['stopped', 'not_started'].includes(worker.status) && !worker.pid) return '/pair start';
  if (['paused', 'interrupted'].includes(worker.status) || ['paused', 'interrupted'].includes(worker.task?.status || '')) return '/pair resume';
  if (['attention', 'error'].includes(worker.status)) return '/pair';
  return '';
}
/** Last measured cache-read share per actor for the status line, whole percent
 * rounded down so a near-miss is never shown as 100%. Unknown shares are omitted;
 * labels are assigned before filtering so W1/W2 stay stable.
 * @param {PairSummary} summary @returns {string} */
function cacheBadge(summary) {
  const actors = [{ label: 'M', usage: summary.main?.lastUsage ?? null },
    ...summary.workers.map(w => ({ label: workerLabel(summary, w.id), usage: w.observation?.lastUsage ?? null }))]
    .flatMap(({ label, usage }) => {
      const observed = validateUsageObservation(usage, 'Last cache-read usage');
      return observed?.cacheRatio == null ? [] : [`${label} ${Math.floor(100 * observed.cacheRatio)}%`];
    });
  return actors.length ? `cache ${actors.join(' ')}` : '';
}
/** Pair's one-line status for Pi's footer (`setStatus`): each worker's state and
 * flow direction, then reports waiting for Main and the last cache reads. A flow
 * arrow precedes each worker token: `M● → W◉` while that worker holds the assigned
 * step, `M● ← W◐ question` while its report or question is with Main. While a worker
 * is active its dot blinks on a two-second heartbeat; past PULSE_MAX_AGE_MS the blink
 * stops, and past STALE_AGE_MS a plain error-colored `stale` marker appears. A worker
 * that is not running names its state and the command that continues it. Speed is
 * shown only while a worker runs, explicitly unavailable until measured. No elapsed
 * task time, turn count or numeric activity age is ever displayed. Pi truncates the
 * footer to the terminal width, so the most important tokens come first.
 * @param {PairSummary} summary @param {boolean} mainBusy
 * @param {{fg(color: IndicatorColor, text: string): string}} [theme]
 * @param {number} [now]
 * @returns {string} */
export function indicator(summary, mainBusy, theme, now = Date.now()) {
  /** @param {IndicatorColor} color @param {string} text @returns {string} */
  const paint = (color, text) => (theme ? theme.fg(color, text) : text);
  const dot = paint('dim', ' · ');
  const main = paint(mainBusy ? 'accent' : 'muted', `M${mainBusy ? '◉' : '●'}`);
  const workers = summary.workers.map(w => {
    const color = statusColor(w.status);
    const label = `${workerLabel(summary, w.id)}${symbol(w.status)}`;
    const arrow = flowArrow(w.status);
    const active = ['working', 'settling', 'starting'].includes(w.status);
    const age = activityAge(w, now);
    const dotColor = active && age <= PULSE_MAX_AGE_MS && Math.floor(now / 2000) % 2 === 1 ? 'dim' : color;
    const token = arrow ? `${paint(color, arrow)} ${paint(dotColor, label)}` : paint(dotColor, label);
    /** @type {string[]} */ const badges = [];
    if (!active && w.status !== 'ready') badges.push(paint(color, w.status === 'permission' ? 'needs permission' : w.status.replace(/_/g, ' ')));
    if (w.task && !['completed', 'cancelled'].includes(w.task.status)) badges.push(paint('muted', `step ${w.task.step}/${w.task.steps}`));
    if (active) {
      if (age >= STALE_AGE_MS) badges.push(paint('error', 'stale'));
      const tool = inline(w.observation?.currentTool, 40);
      if (tool) badges.push(paint('muted', tool));
      badges.push(paint('muted', speedLabel(observedSpeed(w.observation))));
      const percent = w.observation?.context?.percent;
      if (typeof percent === 'number' && percent > 75) badges.push(paint(percent > 90 ? 'error' : 'warning', `ctx ${Math.round(percent)}%`));
    }
    if (typeof w.task?.reportedCost === 'number' && w.task.reportedCost > 0) badges.push(paint('muted', costLabel(w.task.reportedCost)));
    const next = nextAction(w);
    if (next) badges.push(paint('dim', next));
    return badges.length ? `${token} ${badges.join(dot)}` : token;
  });
  const parts = [`${paint('dim', 'pair')} ${main} ${workers.join(paint('dim', ' │ '))}`];
  const waiting = summary.waitingReports || 0;
  if (waiting) {
    const reports = `${waiting} report${waiting === 1 ? '' : 's'}`;
    // Automatic delivery starts a Main turn as soon as Main is idle; without it Main or a person must fetch reports.
    parts.push(paint('warning', summary.autoDeliverReports === false ? `◐ ${reports} waiting · pair_yield or /pair yield` : `◐ ${reports} for Main`));
  }
  const cache = cacheBadge(summary);
  if (cache) parts.push(paint('muted', cache));
  return parts.join(dot);
}
/** Stable widget label for a configured worker: `W` alone, otherwise `W1`, `W2`…
 * @param {PairSummary} summary @param {string} id @returns {string} */
function workerLabel(summary, id) {
  return summary.workers.length === 1 ? 'W' : `W${summary.workers.findIndex(w => w.id === id) + 1}`;
}
/** The worker whose plan the widget shows: one that is working or waiting on Main
 * first, so a second worker's active plan is never hidden behind an idle first one.
 * @param {PairSummary} summary @returns {PairSummary['workers'][number] | undefined} */
export function planWorker(summary) {
  const planned = summary.workers.filter(w => Array.isArray(w.task?.stepList) && w.task.stepList.length > 0);
  return planned.find(w => ['working', 'settling', 'starting', 'question', 'review', 'blocked'].includes(w.status)) || planned[0];
}
/** Compact plan progress: one bar cell per step up to maxCells, then proportional.
 * Filled cells are approved steps only; the step under review/hold stays empty.
 * @param {number} done @param {number} total @param {number} [maxCells]
 * @returns {{filled: number, empty: number, label: string, percent: number}} */
export function progressBar(done, total, maxCells = 10) {
  const cells = Math.min(Math.max(1, total), Math.max(1, maxCells));
  const filled = total > 0 ? Math.min(cells, Math.round((cells * done) / total)) : 0;
  return { filled, empty: cells - filled, label: `${done}/${total}`, percent: total > 0 ? Math.round((100 * done) / total) : 0 };
}

/** Derived plan-step display states, matching controller's summary stepList.
 * @typedef {'done' | 'active' | 'review' | 'held' | 'todo'} StepState */

/** @param {StepState} state @returns {string} */
export function stepSymbol(state) {
  if (state === 'done') return '✔';
  if (state === 'active') return '▶';
  if (state === 'review') return '◐';
  if (state === 'held') return '⏸';
  return '○';
}
/** @param {StepState} state @returns {IndicatorColor} */
export function stepColor(state) {
  if (state === 'done') return 'success';
  if (state === 'active') return 'accent';
  if (state === 'review' || state === 'held') return 'warning';
  return 'dim';
}
/** Row prefix for one plan step: completed steps are labeled explicitly so a
 * lone checkmark is never ambiguous; every other state keeps its bare symbol.
 * stepSymbol itself stays unchanged as public API.
 * @param {StepState} state @returns {string} */
function stepPrefix(state) { return state === 'done' ? `complete ${stepSymbol(state)}` : stepSymbol(state); }
/** One-line view of the displayed worker's plan for the widget: the approved/total
 * bar, then the current step. The `n/total` label counts approved steps, so a lone
 * checkmark never has to carry that meaning. The full step list is in /pair status.
 * @param {PairSummary} summary
 * @param {{fg(color: IndicatorColor, text: string): string}} [theme]
 * @returns {string | null} */
export function planLine(summary, theme) {
  const worker = planWorker(summary);
  const list = worker?.task?.stepList;
  if (!worker || !list?.length) return null;
  /** @param {IndicatorColor} color @param {string} text @returns {string} */
  const paint = (color, text) => (theme ? theme.fg(color, text) : text);
  const done = list.filter(step => step.state === 'done').length;
  const bar = progressBar(done, list.length);
  const owner = summary.workers.length > 1 ? `${paint('muted', workerLabel(summary, worker.id))} ` : '';
  const parts = [`${owner}${paint('success', '■'.repeat(bar.filled))}${paint('dim', '□'.repeat(bar.empty))} ${paint('muted', bar.label)}`];
  const current = list.findIndex(step => ['active', 'review', 'held'].includes(step.state));
  if (current >= 0) {
    const step = list[current];
    parts.push(paint(stepColor(step.state), `${stepSymbol(step.state)} ${current + 1}. ${inline(step.title)}`));
    const later = list.length - current - 1;
    if (later) parts.push(paint('dim', `${later} more`));
  } else if (done === list.length) parts.push(paint('success', 'all steps approved'));
  return parts.join(paint('dim', ' · '));
}
/** Last measured request share only, never cumulative usage or a residency
 * estimate. The sample timestamp remains validated and retained internally for
 * staleness handling and boundary resets, but no age timer is displayed beside
 * the percentage. Legacy zero-input diagnostics keep an explicit unknown share.
 * @param {unknown} value @returns {string} */
function lastCacheRead(value) {
  const usage = validateUsageObservation(value, 'Last cache-read usage');
  if (!usage) return 'unknown';
  return usage.cacheRatio === null ? 'unknown' : `${(100 * usage.cacheRatio).toFixed(1)}%`;
}
/** Persistent plan widget. It is mounted once and reads the latest summary snapshot
 * on every render, so ticks and state changes only request a redraw instead of
 * rebuilding the component. It renders nothing while no plan is active. Lines
 * truncate, never wrap.
 * @param {() => PairSummary | null} current
 * @param {{fg(color: IndicatorColor, text: string): string}} theme
 * @returns {import('@earendil-works/pi-tui').Component} */
export function planWidget(current, theme) {
  return {
    render(width) {
      const summary = current();
      const line = summary && width > 0 ? planLine(summary, theme) : null;
      return line ? [' ' + truncateToWidth(line, Math.max(0, width - 2))] : [];
    },
    invalidate() {},
  };
}
/** Human status view: what needs attention first (each worker's state, task, plan
 * and live activity, then reports waiting for Main and Main itself), followed by
 * identities, warming and accounting under Details, and a short legend.
 * @param {PairSummary} summary @param {Readonly<Awaited<ReturnType<typeof import('./native.js').nativeSettings>>> | null} [native] @param {number} [now] @returns {string} */
export function statusText(summary, native = null, now = Date.now()) {
  const lines = ['FABRIC PAIR', ''];
  for (const w of summary.workers) {
    lines.push(`Worker ${w.id}: ${w.status === 'permission' ? 'needs permission' : w.status.replace(/_/g, ' ')} · ${w.model} · effort ${w.effort}`);
    if (w.error) lines.push(`  ATTENTION: ${w.error}`);
    if (w.task && ['working', 'settling', 'starting'].includes(w.status) && activityAge(w, now) >= STALE_AGE_MS) lines.push('  STALE: no recent worker activity; inspect the transcript or cancel');
    const next = nextAction(w);
    if (next) lines.push(`  Next: ${next}`);
    if (w.task) lines.push(`  Task: ${w.task.objective}`, `  ${w.task.id} · ${w.task.status} · step ${w.task.step}/${w.task.steps} · revisions ${w.task.revisions}${typeof w.task.reportedCost === 'number' && w.task.reportedCost > 0 ? ` · ${costLabel(w.task.reportedCost)}` : ''}`);
    if (Array.isArray(w.task?.stepList) && w.task.stepList.length > 0) {
      const bar = progressBar(w.task.stepList.filter(step => step.state === 'done').length, w.task.stepList.length);
      lines.push(`  Progress ${'■'.repeat(bar.filled)}${'□'.repeat(bar.empty)} ${bar.label} approved (${bar.percent}%)`);
      for (let i = 0; i < w.task.stepList.length; i++) { const step = w.task.stepList[i]; lines.push(`    ${stepPrefix(step.state)} ${i + 1}. ${step.title}`); }
    }
    const obs = w.observation;
    if (obs?.currentTool) lines.push(`  Tool: ${obs.currentTool}`);
    lines.push(`  Speed: ${speedLabel(observedSpeed(obs))}`);
    if (obs?.context) lines.push(`  Context: ${obs.context.tokens ?? 'unknown'} / ${obs.context.contextWindow ?? 'unknown'} tokens${obs.context.percent == null ? '' : ` (${obs.context.percent.toFixed(1)}%)`}${obs.compacting ? ' · compacting' : ''}`);
    lines.push(`  Last cache read: ${lastCacheRead(obs?.lastUsage ?? null)}`);
    if (w.pendingConfiguration) lines.push('  Settings change pending: applied before the next new task while this worker is idle.');
    lines.push('');
  }
  const waiting = summary.waitingReports || 0;
  if (waiting) {
    const reports = `${waiting} report${waiting === 1 ? '' : 's'} not yet read by Main`;
    lines.push(summary.autoDeliverReports === false
      ? `Reports waiting: ${reports}. Automatic delivery is off (autoDeliverReports), so Main calls pair_yield or you run /pair yield or /pair inbox.`
      : `Reports for Main: ${reports}. Pair delivers each one as a new Main turn as soon as Main is idle; /pair yield delivers now.`,
    'Main reads a report with pair_inspect or pair_decide.', '');
  }
  lines.push(`Main: ${summary.main?.model || 'native /model'} · ${summary.main?.busy ? 'working' : 'ready'}`);
  if (summary.main?.context) {
    const c = contextUsage(summary.main.context);
    assert(c, 'Invalid Main context observation');
    lines.push(`  Context: ${c.tokens ?? 'unknown'} / ${c.contextWindow ?? 'unknown'} tokens`);
  }
  lines.push(`  Last cache read: ${lastCacheRead(summary.main?.lastUsage ?? null)}`, '');
  lines.push('Details', `  Owner session: ${summary.ownerSession}`);
  if (summary.mainPhase) lines.push(`  Main phase: ${summary.mainPhase.status} (explicit, non-authorizing)${summary.mainPhase.current ? '' : ' · stale binding: reports stay retained'}`);
  lines.push(`  Automatic report delivery: ${summary.autoDeliverReports === false ? 'off' : 'on'}`,
    `  Pair scoped warming policy: ${summary.cacheWarming || 'off'} (explicit opt-in; native safety windows unchanged)`, `  Main scoped warming: ${warmingLabel(summary.main?.warming)}`);
  if (native) lines.push(`  Native warming policy: ${native.cacheWarming} (persisted base policy; scoped leases/other owners may differ)`);
  for (const w of summary.workers) {
    const obs = w.observation;
    lines.push(`  ${w.id}: PID ${w.pid || 'not running'} · session ${w.sessionId || 'not created'}`, `    Workspace: ${w.cwd}`,
      `    Last reported scoped warming: ${warmingLabel(obs && 'warming' in obs ? obs.warming : undefined)}`);
    if (w.usage) lines.push(`    Inference only: ${w.usage.requests} responses · reported $${w.usage.reportedCost.toFixed(4)} · ${w.usage.unknownCostRequests} responses with unknown price`);
    if (w.lastExchange) lines.push(`    Last exchange: ${w.lastExchange.direction} · ${w.lastExchange.kind}`);
  }
  lines.push('', 'Legend',
    '  ● ready  ◉ working  ◐ waiting on Main  ○ stopped or not started  ! needs attention',
    '  → the work is with the worker  ← a report or question is with Main',
    '  plan: complete ✔ approved  ▶ in progress  ◐ in review  ⏸ held  ○ not started  ■/□ approved of total',
    '  heartbeat: the worker dot blinks while active and stops after 2m of silence; "stale" after 5m, with one warning per silent episode',
    '  cache: cacheRead/(input+cacheRead+cacheWrite) for the last measured request, not task totals; zero-input events do not replace a measurement',
    '  speed: average streaming output tokens/second (weighted); request latency and tool time are excluded, and unavailable is shown as —',
    '', summary.cacheNote, '', `Local state and evidence: ${summary.directory}`);
  return lines.map(s => cleanText(s, 20000)).join('\n');
}
/** @typedef {{paint?: (line: string) => IndicatorColor | null, section?: RegExp}} TextViewOptions */
/** @typedef {{matches(data: string, id: string): boolean}} KeyMatcher */
/** Scrollable read-only text body shared by status, transcript, report and diff
 * views. Keys go through the keybinding manager first (so remapped keys work),
 * with raw sequences and vi-style letters as fallbacks.
 * @param {string[]} raw
 * @param {{title: string, theme?: {fg(color: IndicatorColor, text: string): string} | null, keys?: KeyMatcher | null, rows?: () => number | undefined, close: () => void} & TextViewOptions} options
 * @returns {{render(width: number): string[], handleInput(data: string): void}} */
export function createTextView(raw, { title, theme, keys, rows = () => undefined, close, paint, section }) {
  let offset = 0, width = 80, message = '', lastQuery = '';
  // Raw line of the last search/section jump. A jump near the end is clamped to the
  // last page, so the top visible line is not where the next search should resume.
  /** @type {number | null} */ let cursor = null;
  /** @type {string | null} */ let query = null;
  /** @type {{width: number, lines: string[], starts: number[]}} */ let cache = { width: -1, lines: [], starts: [] };
  /** @param {IndicatorColor} color @param {string} text */
  const fg = (color, text) => (theme ? theme.fg(color, text) : text);
  const layout = () => {
    if (cache.width === width) return cache;
    /** @type {string[]} */ const lines = []; /** @type {number[]} */ const starts = [];
    const span = Math.max(20, width - 2);
    for (const line of raw) {
      starts.push(lines.length);
      const color = paint?.(line);
      // wrapTextWithAnsi measures display columns, so wide characters never overflow.
      const wrapped = line ? wrapTextWithAnsi(color ? fg(color, line) : line, span) : [];
      lines.push(...(wrapped.length ? wrapped : ['']));
    }
    return cache = { width, lines, starts };
  };
  const page = () => Math.max(5, (rows() || 28) - 8);
  const maxOffset = () => Math.max(0, layout().lines.length - page());
  const currentLine = () => { if (cursor !== null) return cursor; const { starts } = layout(); let i = 0; while (i + 1 < starts.length && starts[i + 1] <= offset) i++; return i; };
  /** Jump to the next raw line matching `test`, scanning in `step` direction and wrapping once.
   * @param {(line: string) => boolean} test @param {1 | -1} step @param {boolean} inclusive @param {string} missing */
  const jump = (test, step, inclusive, missing) => {
    const from = currentLine(), n = raw.length;
    for (let k = inclusive ? 0 : 1; k <= n; k++) {
      const i = ((from + step * k) % n + n) % n;
      if (test(raw[i])) { cursor = i; offset = Math.min(maxOffset(), layout().starts[i]); message = (step > 0 ? i < from : i > from) ? 'search wrapped' : ''; return; }
    }
    message = missing;
  };
  /** @param {1 | -1} step @param {boolean} inclusive */
  const search = (step, inclusive) => {
    if (!lastQuery) return;
    const needle = lastQuery.toLowerCase();
    jump(line => line.toLowerCase().includes(needle), step, inclusive, `not found: ${lastQuery}`);
  };
  /** @param {string} data @param {string} id @param {...string} fallbacks */
  const is = (data, id, ...fallbacks) => (keys?.matches(data, id) ?? false) || fallbacks.includes(data);
  return {
    render(w) {
      width = w;
      const { lines } = layout(); offset = Math.min(offset, maxOffset());
      const hints = ['↑/↓ scroll', 'PgUp/PgDn', 'g/G top/bottom', '/ search', ...(lastQuery ? ['n/N next/prev'] : []), ...(section ? ['[/] prev/next file'] : []), 'Esc close'];
      const position = `${lines.length ? offset + 1 : 0}–${Math.min(offset + page(), lines.length)} / ${lines.length}`;
      const footer = query !== null ? fg('accent', `/${query}▏  Enter search · Esc cancel`) : fg('dim', message ? `${position} · ${message}` : position);
      return [fg('accent', cleanText(title)), fg('dim', hints.join(' · ')), '', ...lines.slice(offset, offset + page()), '', footer].map(line => truncateToWidth(line, w));
    },
    handleInput(data) {
      if (query !== null) {
        if (is(data, 'tui.select.cancel', '\x1b')) query = null;
        else if (is(data, 'tui.select.confirm', '\r', '\n')) { lastQuery = query; query = null; search(1, true); }
        else if (data === '\x7f' || data === '\b') query = query.slice(0, -1);
        else if (!/[\x00-\x1f\x7f]/.test(data)) query += data;
        return;
      }
      message = '';
      if (!['n', 'N', ']', '['].includes(data)) cursor = null;
      if (is(data, 'tui.select.cancel', '\x1b', 'q') || is(data, 'tui.select.confirm', '\r', '\n')) close();
      else if (is(data, 'tui.select.up', '\x1b[A', 'k')) offset = Math.max(0, offset - 1);
      else if (is(data, 'tui.select.down', '\x1b[B', 'j')) offset = Math.min(maxOffset(), offset + 1);
      else if (is(data, 'tui.select.pageUp', '\x1b[5~', 'b')) offset = Math.max(0, offset - page());
      else if (is(data, 'tui.select.pageDown', '\x1b[6~', ' ')) offset = Math.min(maxOffset(), offset + page());
      else if (data === 'g' || data === '\x1b[H') offset = 0;
      else if (data === 'G' || data === '\x1b[F') offset = maxOffset();
      else if (data === '/') query = '';
      else if (data === 'n') search(1, false);
      else if (data === 'N') search(-1, false);
      else if (section && (data === ']' || data === '[')) jump(line => section.test(line), data === ']' ? 1 : -1, false, 'no other file');
    },
  };
}
/** @param {UIContext} ctx @param {string} title @param {string} text @param {TextViewOptions} [options] @returns {Promise<void>} */
export async function textView(ctx, title, text, options = {}) {
  if (ctx.mode !== 'tui' || typeof ctx.ui.custom !== 'function') { ctx.ui.notify(`${title}\n${cleanText(text, 10000)}`, 'info'); return; }
  const raw = cleanText(text, 100000).split('\n');
  await ctx.ui.custom((tui, theme, keys, done) => {
    const view = createTextView(raw, { ...options, title, theme, keys, rows: () => tui.terminal?.rows, close: () => done(undefined) });
    /** @type {import('@earendil-works/pi-tui').Component} */
    const component = { render: width => view.render(width), handleInput(data) { view.handleInput(data); tui.requestRender?.(); }, invalidate() {} };
    return component;
  }, { overlay: true });
}
/** Rewrite a stored checkpoint patch for people: real file names instead of Pair's
 * blob-store paths, and added files shown as `+` lines instead of only a hash.
 * Main's pair_inspect output is unchanged; this is display only.
 * @param {string} patch @param {Map<string, string | null>} [added] @returns {string} */
export function humanPatch(patch, added = new Map()) {
  /** @type {string[]} */ const out = [];
  /** @type {string | null} */ let file = null, skip = false;
  for (const line of patch.split('\n')) {
    const header = /^### ("(?:[^"\\]|\\.)*") \((\w+) → (\w+)\)$/.exec(line);
    if (header) {
      file = /** @type {string} */ (JSON.parse(header[1]));
      if (out.length && out.at(-1) !== '') out.push('');
      out.push(`### ${file} (${header[2]} → ${header[3]})`);
      skip = header[2] === 'absent' && header[3] === 'file' && added.has(file);
      if (skip) {
        const content = added.get(file);
        if (content == null) out.push('(binary or unreadable file; pair_inspect it for details)');
        else out.push(`--- /dev/null`, `+++ b/${file}`, ...content.replace(/\n$/, '').split('\n').map(text => `+${text}`));
      }
      continue;
    }
    if (skip || line.startsWith('diff --git ') || line.startsWith('index ')) continue;
    if (file !== null && line.startsWith('--- ') && !line.startsWith('--- /dev/null')) out.push(`--- a/${file}`);
    else if (file !== null && line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) out.push(`+++ b/${file}`);
    else out.push(line);
  }
  while (out.length && out[0] === '') out.shift();
  return out.join('\n');
}
/** Unified-diff line coloring for the checkpoint viewer.
 * @param {string} line @returns {IndicatorColor | null} */
export function diffLineColor(line) {
  if (line.startsWith('### ') || line.startsWith('diff --git ')) return 'warning';
  if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('index ')) return 'muted';
  if (line.startsWith('@@')) return 'accent';
  if (line.startsWith('+')) return 'success';
  if (line.startsWith('-')) return 'error';
  return null;
}
/** @typedef {NonNullable<ReturnType<import('./controller.js').PairController['reportView']>>} ReportView */
const KIND_LABEL = /** @type {const} */ ({ question: 'Question', checkpoint: 'Checkpoint', blocked: 'Blocker', final_review: 'Final review' });
/** @param {string} kind @returns {string} */
export function kindLabel(kind) { return Reflect.get(KIND_LABEL, kind) || kind; }
/** Human-readable card for one retained report. Controller-captured evidence
 * (changed paths, configured checks) is kept apart from the worker's own claims.
 * @param {ReportView} view @returns {string[]} */
export function reportCardLines(view) {
  const lines = [`${kindLabel(view.kind)} from ${view.workerId} · step ${view.step}/${view.steps} · ${view.reportId}`, `Task: ${view.objective}`, ''];
  lines.push('Summary', ...view.summary.split('\n').map(line => `  ${line}`), '');
  if (view.question) lines.push('Question for Main', ...view.question.split('\n').map(line => `  ${line}`), '');
  lines.push(`Changed files (captured by Pair): ${view.changed.length}`, ...view.changed.slice(0, 40).map(file => `  ${file}`));
  if (view.changed.length > 40) lines.push(`  + ${view.changed.length - 40} more — see the diff`);
  lines.push('', 'Verification (run by Pair)');
  if (!view.verification.length) lines.push('  none configured — no independent checks ran');
  for (const v of view.verification) lines.push(`  ${v.passed ? '✔' : '✖'} ${v.name}${v.passed ? '' : v.timedOut ? ' (timed out)' : ` (exit ${v.code ?? 'unknown'})`}`);
  if (view.workerChecks.length) {
    lines.push('', 'Worker-reported checks (claims, not verified)');
    for (const c of view.workerChecks) lines.push(`  ${c.result === 'pass' ? '✔' : c.result === 'fail' ? '✖' : '○'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  if (view.decisions.length) lines.push('', 'Worker decisions', ...view.decisions.map(d => `  • ${d}`));
  lines.push('', `Checkpoint ${view.checkpointHash.slice(0, 12)}${view.patchTruncated ? ' · patch truncated' : ''} · ${view.acknowledged ? 'read by Main' : 'not yet read by Main'}`);
  return lines;
}
/** @param {string} line @returns {IndicatorColor | null} */
export function reportLineColor(line) {
  if (/^ {2}✔/.test(line)) return 'success';
  if (/^ {2}✖/.test(line)) return 'error';
  if (/^[A-Z]/.test(line) && !line.startsWith('Task:')) return 'accent';
  return null;
}
/** @typedef {{label: string, action: 'report' | 'diff' | 'yield' | 'start' | 'pause' | 'resume' | 'cancel' | 'transcript' | 'restart' | 'stop' | 'status' | 'inbox' | 'settings' | 'reload' | 'doctor' | 'more' | 'back' | 'close', workerId?: string}} DashboardItem */
/** One-line dashboard header: each worker's state, step and cost, then waiting reports.
 * @param {PairSummary} summary @returns {string} */
export function dashboardHeader(summary) {
  const workers = summary.workers.map(w => {
    const parts = [`${workerLabel(summary, w.id)} ${symbol(w.status)} ${w.status.replace('_', ' ')}`];
    if (w.task && !['completed', 'cancelled'].includes(w.task.status)) parts.push(`step ${w.task.step}/${w.task.steps}`);
    if (typeof w.task?.reportedCost === 'number' && w.task.reportedCost > 0) parts.push(costLabel(w.task.reportedCost));
    return parts.join(' · ');
  });
  const waiting = summary.waitingReports || 0;
  return [...workers, ...(waiting ? [`${waiting} report${waiting === 1 ? '' : 's'} waiting`] : [])].join('  |  ');
}
/** Dashboard entries for the current state: what needs a human first, then only
 * the lifecycle actions that apply to each worker right now. Rarely needed
 * maintenance actions live under More… (dashboardMoreItems).
 * @param {PairSummary} summary @returns {DashboardItem[]} */
export function dashboardItems(summary) {
  /** @type {DashboardItem[]} */ const items = [];
  const many = summary.workers.length > 1;
  /** @param {string} text @param {string} id */
  const on = (text, id) => (many ? `${text} (${id})` : text);
  for (const w of summary.workers) {
    if (w.task?.reportId && ['question', 'review', 'blocked'].includes(w.task.status)) {
      items.push({ label: on(`Review ${w.task.status === 'review' ? 'checkpoint' : w.task.status}`, w.id), action: 'report', workerId: w.id });
      items.push({ label: on('View checkpoint diff', w.id), action: 'diff', workerId: w.id });
    }
  }
  const waiting = summary.waitingReports || 0;
  if (waiting) items.push({ label: `Deliver ${waiting} waiting report${waiting === 1 ? '' : 's'} to Main`, action: 'yield' });
  for (const w of summary.workers) {
    const task = w.task && !['completed', 'cancelled'].includes(w.task.status) ? w.task : null;
    if (task?.status === 'running') items.push({ label: on('Pause worker', w.id), action: 'pause', workerId: w.id });
    if (task && ['paused', 'interrupted'].includes(task.status)) items.push({ label: on('Resume worker', w.id), action: 'resume', workerId: w.id });
    if (task) items.push({ label: on('Cancel task', w.id), action: 'cancel', workerId: w.id });
    if (w.sessionId) items.push({ label: on('Worker transcript', w.id), action: 'transcript', workerId: w.id });
    if (w.pid) items.push({ label: on('Stop worker', w.id), action: 'stop', workerId: w.id });
    else items.push({ label: on('Start worker', w.id), action: 'start', workerId: w.id });
  }
  items.push({ label: 'Status', action: 'status' }, { label: 'Inbox', action: 'inbox' }, { label: 'Settings', action: 'settings' },
    { label: 'More…', action: 'more' }, { label: 'Close', action: 'close' });
  return items;
}
/** Maintenance actions behind the dashboard's More… entry.
 * @param {PairSummary} summary @returns {DashboardItem[]} */
export function dashboardMoreItems(summary) {
  const many = summary.workers.length > 1;
  // Restart rereads saved settings first and keeps any retained conversation, so it applies in every state.
  return [...summary.workers.map(w => /** @type {DashboardItem} */ ({ label: many ? `Restart worker (${w.id})` : 'Restart worker', action: 'restart', workerId: w.id })),
    { label: 'Reload configuration', action: 'reload' }, { label: 'Doctor', action: 'doctor' }, { label: 'Back', action: 'back' }];
}
/** Only an actual offered choice can enter a literal config field.
 * @template {string} Value
 * @param {import('@earendil-works/pi-coding-agent').ExtensionUIContext} ui
 * @param {string} title @param {readonly Value[]} choices @returns {Promise<Value | undefined>}
 */
async function selectValue(ui, title, choices) {
  const selected = await ui.select(title, [...choices]);
  return choices.find(choice => choice === selected);
}
/** @param {boolean} value @returns {string} */
function onOff(value) { return value ? 'On' : 'Off'; }
/** What each cosmetic indicator mode shows. @type {Readonly<Record<import('./config.js').Indicator, string>>} */
const INDICATOR_LABEL = { minimal: 'minimal (status line + current plan step)', compact: 'compact (status line only)', off: 'off (hidden)' };

/** @typedef {Readonly<{optional?: boolean, scale?: number, accepts: (value: number) => boolean, expected: string}>} NumberInputOptions */
/** @overload @param {UIContext} ctx @param {string} title @param {number} current @param {NumberInputOptions & {optional?: false}} options @returns {Promise<number>} */
/** @overload @param {UIContext} ctx @param {string} title @param {number | null} current @param {NumberInputOptions & {optional: true}} options @returns {Promise<number | null>} */
/** @param {UIContext} ctx @param {string} title @param {number | null} current @param {NumberInputOptions} options @returns {Promise<number | null>} */
async function numberInput(ctx, title, current, { optional = false, scale = 1, accepts, expected }) {
  // Pi input's second argument is a placeholder, not a prefilled value.
  const placeholder = current == null ? 'none' : String(current / scale);
  const input = await ctx.ui.input(`${title} (blank keeps current${optional ? '; none/off disables' : ''})`, placeholder);
  const text = input?.trim();
  // Preserve storage units exactly: even an unchanged minutes -> ms round trip
  // can introduce a fraction (e.g. 59 ms). Only convert actual edits.
  if (!text || text === placeholder) return current;
  if (optional && /^(none|off)$/i.test(text)) return null;
  const value = Number(text) * scale;
  assert(Number.isFinite(value) && accepts(value), `${title}: ${expected}`);
  return value;
}
/** @param {UIContext} ctx @param {import('./contracts.js').WorkerSpec} worker @returns {Promise<void>} */
async function pickModel(ctx, worker) {
  const models = [...await Promise.resolve(ctx.modelRegistry.getAvailable())]
    .sort((a, b) => `${a.provider}/${a.id}`.localeCompare(`${b.provider}/${b.id}`));
  if (!models.length) { ctx.ui.notify('No authenticated/available models. Configure the provider in Pi first (use /login).', 'warning'); return; }
  const title = 'Worker model (Main stays under /model)';
  /** @type {string | undefined} */ let answer;
  if (ctx.mode === 'tui' && typeof ctx.ui.custom === 'function') {
    answer = await ctx.ui.custom((_tui, theme, keys, done) => {
      const input = new Input({ placeholder: 'Type to filter models…' });
      const items = models.map(m => ({ value: `${m.provider}/${m.id}`, label: `${m.provider}/${m.id}`, description: m.name || '' }));
      /** @param {string} query */
      const makeList = query => {
        const filter = query.trim().toLowerCase();
        const list = new SelectList(items.filter(item => `${item.value} ${item.description}`.toLowerCase().includes(filter)), 10, {
          selectedPrefix: text => theme.fg('accent', text), selectedText: text => theme.fg('accent', text),
          description: text => theme.fg('muted', text), scrollInfo: text => theme.fg('dim', text),
          noMatch: () => theme.fg('warning', 'No matching models. Clear the filter to see all.')
        });
        list.onSelect = item => done(item.value);
        list.onCancel = () => done(undefined);
        return list;
      };
      let list = makeList('');
      list.setSelectedIndex(items.findIndex(item => item.value === `${worker.provider}/${worker.model}`));
      /** @type {import('@earendil-works/pi-tui').Component & import('@earendil-works/pi-tui').Focusable} */
      const component = {
        get focused() { return input.focused; },
        set focused(value) { input.focused = value; },
        render(width) {
          return [theme.fg('accent', title), '', ...input.render(width), '', ...list.render(width), '',
            theme.fg('dim', '↑/↓ navigate · type to filter · Enter select · Esc/Ctrl+C cancel')]
            .map(line => truncateToWidth(line, width));
        },
        handleInput(data) {
          if (keys.matches(data, 'tui.select.cancel') || matchesKey(data, 'ctrl+c')) { done(undefined); return; }
          if (keys.matches(data, 'tui.select.up') || keys.matches(data, 'tui.select.down') || keys.matches(data, 'tui.select.confirm')) list.handleInput(data);
          else {
            const previous = input.getValue();
            input.handleInput(data);
            if (input.getValue() !== previous) list = makeList(input.getValue());
          }
          _tui.requestRender();
        },
        invalidate() { input.invalidate(); list.invalidate(); }
      };
      return component;
    });
  } else {
    // RPC supports standard dialogs, but cannot render custom terminal components.
    answer = await ctx.ui.select(title, models.map(m => `${m.provider}/${m.id}`));
  }
  const model = models.find(m => `${m.provider}/${m.id}` === answer);
  if (model) { worker.provider = model.provider; worker.model = model.id; if (model.reasoning === false) worker.effort = 'off'; }
}
/** Own command-scoped dialogs only: never replaces Fabric's settings/dashboard/footer.
 * @param {import('@earendil-works/pi-coding-agent').ExtensionCommandContext} ctx
 * @param {import('./config.js').PairConfig} original @param {import('./config.js').ConfigScope} initialScope
 * @param {ApplySettings} onApply @param {SettingsOptions} [options] @returns {Promise<void>}
 */
export async function settingsUI(ctx, original, initialScope, onApply, options = {}) {
  let saved = clone(original), scope = initialScope, selected = saved.workers[0].id, advanced = false;
  for (;;) {
    // Each interaction gets a disposable draft. Invalid input and failed writes
    // cannot contaminate the next edit or appear as a saved value.
    const draft = clone(saved);
    const w = draft.workers.find(w => w.id === selected) || draft.workers[0]; selected = w.id;
    const common = [
      { id: 1, label: `Enabled for new work: ${onOff(draft.enabled)}` },
      { id: 4, label: `Worker model: ${w.provider}/${w.model || '(choose)'}` },
      { id: 5, label: `Worker effort: ${w.effort}` },
      { id: 8, label: `Review policy: ${draft.supervision.mode}` },
      { id: 2, label: `Autostart next session: ${onOff(draft.autoStart)}` },
      { id: 14, label: `Indicator: ${INDICATOR_LABEL[draft.indicator]}` },
      { id: 18, label: `Save scope: ${scope} (${scope === 'global' ? 'global defaults; project overrides excluded' : 'project overrides + inherited defaults'})` },
      { id: 20, label: 'Advanced…' }, { id: 21, label: 'Done' }
    ];
    const extra = [
      { id: 3, label: `Selected worker: ${w.id}` },
      { id: 6, label: `Read-only worker: ${onOff(w.readOnly)}` },
      { id: 7, label: `Workspace: ${w.cwd || '(Main workspace)'}` },
      { id: 9, label: `Revision limit: ${draft.supervision.maxRevisions}` },
      { id: 10, label: `Summary detail: ${draft.supervision.summaryDetail}` },
      { id: 16, label: 'Add worker' },
      { id: 17, label: `Verification commands: ${draft.verification.commands.length} (human-owned)` },
      ...(options.migrate ? [{ id: 22, label: 'Review/migrate selected scope…' }] : []),
      { id: 20, label: 'Back' }, { id: 21, label: 'Done' }
    ];
    const rows = advanced ? extra : common;
    const title = `Pair settings${advanced ? ' · Advanced' : ''} · saves automatically\nMain model: ${ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : 'not selected'} (change with /model)`;
    const choice = await ctx.ui.select(title, rows.map(row => row.label));
    const index = rows.find(row => row.label === choice)?.id;
    if (choice === undefined || index === 21) return;
    try {
      if (index === 20) { advanced = !advanced; continue; }
      if (index === 18) {
        const nextScope = await selectValue(ctx.ui, 'Save scope · switching does not copy or save values', ctx.isProjectTrusted?.() ? ['project', 'global'] : ['global']);
        if (nextScope && nextScope !== scope) {
          const next = options.loadScope ? await options.loadScope(nextScope) : saved;
          scope = nextScope; saved = clone(next);
        }
        continue;
      }
      if (index === 22) { const next = await options.migrate?.(scope); if (next) saved = clone(next); continue; }
      if (index === 1) draft.enabled = !draft.enabled;
      else if (index === 2) draft.autoStart = !draft.autoStart;
      else if (index === 3) selected = await selectValue(ctx.ui, 'Worker', draft.workers.map(w => w.id)) || selected;
      else if (index === 4) await pickModel(ctx, w);
      else if (index === 5) w.effort = await selectValue(ctx.ui, 'Effort (validated against the worker model at startup)', ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']) || w.effort;
      else if (index === 6) w.readOnly = !w.readOnly;
      else if (index === 7) { const value = await ctx.ui.input('Worker workspace: absolute path, or blank for Main', w.cwd || ''); if (value !== undefined) w.cwd = value.trim() || null; }
      else if (index === 8) {
        /** @type {readonly Readonly<{label: string, value: import('./contracts.js').ReviewMode}>[]} */
        const modes = [
          { label: 'Final-only: review after the complete plan; questions always allowed', value: 'final-only' },
          { label: 'Milestones: approve each dispatched plan milestone', value: 'milestones' },
          { label: 'Every-step: approve each small plan step; no step skipping', value: 'every-step' }
        ];
        const pick = await ctx.ui.select('Review policy · final acceptance is always required', modes.map(mode => mode.label));
        const mode = modes.find(mode => mode.label === pick); if (mode) draft.supervision.mode = mode.value;
      }
      else if (index === 9) draft.supervision.maxRevisions = await numberInput(ctx, 'Revision limit', draft.supervision.maxRevisions, {
        accepts: value => Number.isInteger(value) && value >= 0 && value <= 20, expected: 'enter an integer from 0 to 20.'
      });
      else if (index === 10) draft.supervision.summaryDetail = await selectValue(ctx.ui, 'Worker summary detail', ['minimal', 'normal', 'detailed']) || draft.supervision.summaryDetail;
      else if (index === 14) {
        const pick = await ctx.ui.select('Indicator · display only, no effect on work', INDICATORS.map(mode => INDICATOR_LABEL[mode]));
        draft.indicator = INDICATORS.find(mode => INDICATOR_LABEL[mode] === pick) || draft.indicator;
      }
      else if (index === 16) {
        const id = await ctx.ui.input('New worker ID (letters, digits, hyphens, underscores)');
        if (id) { draft.workers.push({ id, provider: '', model: '', effort: 'medium', cwd: null, readOnly: false }); selected = id; }
      }
      else if (index === 17) {
        const edited = await ctx.ui.editor('Trusted verification argv, run locally at checkpoints. Example: [{"name":"tests","command":"npm","args":["test"]}]', JSON.stringify(draft.verification.commands, null, 2));
        if (edited !== undefined) {
          /** @type {unknown} */ const commands = JSON.parse(edited);
          const valid = validateConfig({ verification: { ...draft.verification, commands } }).verification.commands;
          if (JSON.stringify(valid) !== JSON.stringify(saved.verification.commands) && await ctx.ui.confirm('Authorize verification commands', 'These commands execute automatically at review checkpoints with your OS permissions. Only add commands you trust.')) draft.verification.commands = valid;
        }
      }
      const next = validateConfig(draft);
      if (JSON.stringify(next) !== JSON.stringify(saved)) saved = clone(await onApply(next, scope) || next);
    } catch (error) { ctx.ui.notify(`Setting not saved: ${briefError(error)}`, 'error'); }
  }
}

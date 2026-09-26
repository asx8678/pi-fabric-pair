import { Input, SelectList, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
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
/** Whether a worker has a provider and model chosen; the summary joins them as `provider/model`.
 * @param {PairSummary['workers'][number]} worker @returns {boolean} */
function hasModel(worker) { return /^[^/]+\/.+$/.test(worker.model); }
/** Compact token count: 272000 → 272k, 1500000 → 1.5M.
 * @param {number | null | undefined} tokens @returns {string} */
function tokenLabel(tokens) {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens)) return 'unknown';
  if (tokens >= 1e6) return `${Number((tokens / 1e6).toFixed(1))}M`;
  return tokens >= 1000 ? `${Number((tokens / 1000).toFixed(1))}k` : String(tokens);
}
/** The next thing a person can do for a worker that is not running, if any. A worker
 * without a model needs settings before it can start.
 * @param {PairSummary['workers'][number]} worker @returns {string} */
function nextAction(worker) {
  if (['stopped', 'not_started'].includes(worker.status) && !worker.pid) return hasModel(worker) ? '/pair start' : '/pair settings';
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
/** Human status view in the panel markup (see panelFormat): each worker's state, task,
 * plan and live activity first, then reports waiting for Main and Main itself, with
 * identities, warming and accounting under Details and a short legend at the end.
 * @param {PairSummary} summary @param {Readonly<Awaited<ReturnType<typeof import('./native.js').nativeSettings>>> | null} [native] @param {number} [now] @returns {string} */
export function statusText(summary, native = null, now = Date.now()) {
  /** @param {string} key @param {string} value */
  const row = (key, value) => `  ${key.padEnd(10)}  ${value}`;
  /** @type {string[]} */ const lines = [];
  for (const w of summary.workers) {
    const active = ['working', 'settling', 'starting'].includes(w.status), obs = w.observation;
    lines.push(`## Worker · ${w.id}`, row('State', `${symbol(w.status)} ${w.status === 'permission' ? 'needs permission' : w.status.replace(/_/g, ' ')}`),
      row('Model', hasModel(w) ? `${w.model} · effort ${w.effort}` : 'not chosen yet'));
    if (w.error) lines.push(`! ${w.error}`);
    if (w.task && active && activityAge(w, now) >= STALE_AGE_MS) lines.push('! No recent worker activity. Read the transcript or cancel the task.');
    const next = nextAction(w);
    if (next) lines.push(row('Next', next === '/pair settings' ? '/pair settings, choose a worker model' : next));
    if (w.pendingConfiguration) lines.push(row('Settings', 'change pending; applied before the next task'));
    if (w.task) {
      const cost = typeof w.task.reportedCost === 'number' && w.task.reportedCost > 0 ? ` · ${costLabel(w.task.reportedCost)}` : '';
      lines.push('', `## Task · ${w.task.id}`, row('Objective', inline(w.task.objective, 2000)),
        row('Status', `${w.task.status} · step ${w.task.step} of ${w.task.steps} · ${w.task.revisions} revision${w.task.revisions === 1 ? '' : 's'}${cost}`));
      if (Array.isArray(w.task.stepList) && w.task.stepList.length > 0) {
        const bar = progressBar(w.task.stepList.filter(step => step.state === 'done').length, w.task.stepList.length);
        lines.push(row('Progress', `${'■'.repeat(bar.filled)}${'□'.repeat(bar.empty)} ${bar.label} approved`), '');
        w.task.stepList.forEach((step, i) => lines.push(`  ${stepPrefix(step.state)} ${i + 1}. ${inline(step.title, 500)}`));
      }
    }
    const speed = speedLabel(observedSpeed(obs));
    if (active || obs?.currentTool || obs?.context || !speed.includes('—')) {
      lines.push('', '## Activity');
      if (obs?.currentTool) lines.push(row('Tool', inline(obs.currentTool, 200)));
      if (active || !speed.includes('—')) lines.push(row('Speed', speed.replace(/^avg /, '')));
      if (obs?.context) lines.push(row('Context', `${tokenLabel(obs.context.tokens)} of ${tokenLabel(obs.context.contextWindow)} tokens${obs.context.percent == null ? '' : ` (${obs.context.percent.toFixed(0)}%)`}${obs.compacting ? ' · compacting' : ''}`));
      lines.push(row('Cache', `last read ${lastCacheRead(obs?.lastUsage ?? null)}`));
    }
    lines.push('');
  }
  const waiting = summary.waitingReports || 0;
  if (waiting) {
    lines.push('## Reports', row('Waiting', `${waiting} report${waiting === 1 ? '' : 's'} not yet read by Main`),
      summary.autoDeliverReports === false
        ? '> Automatic delivery is off: Main calls pair_yield, or run /pair yield or /pair inbox.'
        : '> Each report starts a Main turn as soon as Main is idle; /pair yield delivers now.', '');
  }
  lines.push('## Main', row('Model', `${summary.main?.model || 'native /model'} · ${summary.main?.busy ? 'working' : 'ready'}`));
  if (summary.main?.context) {
    const c = contextUsage(summary.main.context);
    assert(c, 'Invalid Main context observation');
    lines.push(row('Context', `${tokenLabel(c.tokens)} of ${tokenLabel(c.contextWindow)} tokens`));
  }
  lines.push(row('Cache', `last read ${lastCacheRead(summary.main?.lastUsage ?? null)}`), '');
  lines.push('## Details', row('Session', summary.ownerSession));
  if (summary.mainPhase) lines.push(row('Main phase', `${summary.mainPhase.status} (explicit, non-authorizing)${summary.mainPhase.current ? '' : ' · stale binding: reports stay retained'}`));
  lines.push(row('Delivery', summary.autoDeliverReports === false ? 'automatic delivery off' : 'automatic delivery on'),
    row('Warming', `Pair ${summary.cacheWarming || 'off'} (opt-in) · Main ${warmingLabel(summary.main?.warming)}${native ? ` · native ${native.cacheWarming}` : ''}`));
  for (const w of summary.workers) {
    const obs = w.observation;
    lines.push(row(w.id, `PID ${w.pid || 'not running'} · session ${w.sessionId || 'not created'}`), row('Workspace', w.cwd),
      row('Warming', `worker ${warmingLabel(obs && 'warming' in obs ? obs.warming : undefined)}`));
    if (w.usage) lines.push(row('Usage', `${w.usage.requests} responses · reported $${w.usage.reportedCost.toFixed(4)} · ${w.usage.unknownCostRequests} with unknown price (inference only)`));
    if (w.lastExchange) lines.push(row('Exchange', `${w.lastExchange.direction} · ${w.lastExchange.kind}`));
  }
  lines.push(row('State dir', summary.directory), '',
    '## Legend',
    '> ● ready  ◉ working  ◐ waiting on Main  ○ stopped  ! needs attention',
    '> → the work is with the worker  ← a report or question is with Main',
    '> Plan: ✔ approved  ▶ in progress  ◐ in review  ⏸ held  ○ not started',
    '> Heartbeat: the worker dot blinks while it is active; "stale" after 5 minutes of silence.',
    '> Cache: cacheRead ÷ (input + cacheRead + cacheWrite) of the last measured request, not task totals.',
    '> Speed: weighted streaming output tokens per second, excluding request latency and tool time.',
    `> ${summary.cacheNote}`);
  return lines.map(line => cleanText(line, 20000)).join('\n');
}
/** Pi theme colors Pair's panels use; every name exists in the active Pi theme.
 * @typedef {IndicatorColor | 'border' | 'borderMuted' | 'borderAccent' | 'text' | 'mdHeading'} PanelColor */
/** @typedef {{fg(color: PanelColor, text: string): string, bold?(text: string): string}} PanelTheme */
/** Widest panel, so long lines stay readable on wide terminals. */
const PANEL_MAX_WIDTH = 110;
/** Overlay placement for every Pair panel: centered, bounded width, most of the height.
 * Pi resolves this once when the panel opens; pi-tui clamps it if the terminal shrinks.
 * @param {{terminal?: {columns?: number}} | null | undefined} tui @returns {import('@earendil-works/pi-tui').OverlayOptions} */
export function panelOptions(tui) {
  return { width: Math.max(24, Math.min(PANEL_MAX_WIDTH, (tui?.terminal?.columns || 100) - 4)), maxHeight: '90%', anchor: 'center' };
}
/** Body lines inside a rounded border: the title sits in the top edge and key hints in
 * the bottom edge. Every row is padded to the full width, so nothing behind the panel
 * shows through and its edges are always visible.
 * @param {string[]} body @param {number} width
 * @param {{title: string, footer?: string, theme?: PanelTheme | null}} options @returns {string[]} */
export function frame(body, width, { title, footer = '', theme }) {
  /** @param {PanelColor} color @param {string} text */
  const fg = (color, text) => (theme ? theme.fg(color, text) : text);
  const bold = (/** @type {string} */ text) => (theme?.bold ? theme.bold(text) : text);
  const inner = Math.max(1, width - 4);
  /** @param {string} left @param {string} right @param {string} label @param {(text: string) => string} style */
  const edge = (left, right, label, style) => {
    const text = label ? ` ${truncateToWidth(label, Math.max(1, width - 6), '…')} ` : '';
    return fg('borderMuted', `${left}─`) + (text ? style(text) : '') + fg('borderMuted', `${'─'.repeat(Math.max(0, width - 3 - visibleWidth(text)))}${right}`);
  };
  const rows = body.map(line => {
    const text = truncateToWidth(line, inner, '');
    return `${fg('borderMuted', '│')} ${text}${' '.repeat(Math.max(0, inner - visibleWidth(text)))} ${fg('borderMuted', '│')}`;
  });
  return [edge('╭', '╮', title, text => fg('accent', bold(text))), ...rows, edge('╰', '╯', footer, text => fg('dim', text))];
}
/** Wrap one styled line to `span` columns, continuing under its own indent, after a
 * leading bullet or step symbol, or under a key/value row's value, never at the left edge.
 * @param {string} raw plain source line @param {string} styled the same line after styling
 * @param {number} span @returns {string[]} */
function wrapHanging(raw, styled, span) {
  const indent = /^ */.exec(raw)?.[0].length || 0;
  const marker = /^ *(?:complete ✔|[•✔✖○▶◐⏸!-]|\d+\.) /.exec(raw);
  // A `Key  value` row (see panelFormat) continues under its value column.
  const row = indent <= 2 ? /^ *[A-Za-z][\w ./()-]{0,22}? {2,}(?=\S)/.exec(raw) : null;
  const hang = Math.min(Math.floor(span / 2), marker ? marker[0].length : row ? row[0].length : indent);
  const lead = /^ */.exec(styled)?.[0].length || 0;
  // The first row uses the full width after its indent; the rest re-wrap under `hang`.
  const [first = '', ...rest] = wrapTextWithAnsi(styled.slice(lead), Math.max(10, span - indent));
  const more = rest.length ? wrapTextWithAnsi(rest.join(' '), Math.max(10, span - hang)) : [];
  return [' '.repeat(indent) + first, ...more.map(part => ' '.repeat(hang) + part)];
}
/** Lightweight markup for Pair's own panel text, readable as plain text too:
 * `## Heading`; `Key<2+ spaces>value` rows at indent 0 or 2 (dim key); `> note` (dim);
 * `! warning`; lines starting with a step or check symbol take its color. Lines indented
 * four or more spaces carry worker or repository text and are never styled.
 * @param {PanelTheme | null | undefined} theme @returns {(line: string) => string} */
export function panelFormat(theme) {
  /** @param {PanelColor} color @param {string} text */
  const fg = (color, text) => (theme ? theme.fg(color, text) : text);
  return line => {
    const indent = /^ */.exec(line)?.[0].length || 0, body = line.slice(indent), pad = ' '.repeat(indent);
    if (indent >= 4 || !body) return line;
    if (indent === 0 && body.startsWith('## ')) return fg('accent', theme?.bold ? theme.bold(body.slice(3)) : body.slice(3));
    if (body.startsWith('> ')) return pad + fg('dim', body.slice(2));
    if (body.startsWith('! ')) return pad + fg('warning', body);
    const step = /^(complete ✔|✔|✖|▶|◐|⏸|○) /.exec(body);
    if (step) return pad + fg(step[1] === '✖' ? 'error' : step[1].endsWith('✔') ? 'success' : step[1] === '▶' ? 'accent' : step[1] === '○' ? 'dim' : 'warning', body);
    const row = /^([A-Za-z][\w ./()-]{0,22}?)( {2,})(\S.*)$/.exec(body);
    if (row) return pad + fg('dim', row[1] + row[2]) + fg('text', row[3]);
    return line;
  };
}
/** `panel` styles Pair's own panel markup (panelFormat); `paint` colors whole lines; `format` styles each line.
 * @typedef {{panel?: boolean, paint?: (line: string) => IndicatorColor | null, format?: (line: string) => string, section?: RegExp}} TextViewOptions */
/** @typedef {{matches(data: string, id: string): boolean}} KeyMatcher */
/** Scrollable read-only panel shared by status, inbox, report, diff, transcript, yield and
 * doctor views: a bordered box with the title on top and position and key hints in the
 * bottom edge. Keys go through the keybinding manager first (so remapped keys work),
 * with raw sequences and vi-style letters as fallbacks.
 * @param {string[]} raw
 * @param {{title: string, theme?: PanelTheme | null, keys?: KeyMatcher | null, rows?: () => number | undefined, close: () => void} & TextViewOptions} options
 * @returns {{render(width: number): string[], handleInput(data: string): void}} */
export function createTextView(raw, { title, theme, keys, rows = () => undefined, close, paint, format, section }) {
  let offset = 0, width = 80, message = '', lastQuery = '';
  // Raw line of the last search/section jump. A jump near the end is clamped to the
  // last page, so the top visible line is not where the next search should resume.
  /** @type {number | null} */ let cursor = null;
  /** @type {string | null} */ let query = null;
  /** @type {{width: number, lines: string[], starts: number[]}} */ let cache = { width: -1, lines: [], starts: [] };
  /** @param {PanelColor} color @param {string} text */
  const fg = (color, text) => (theme ? theme.fg(color, text) : text);
  const styleLine = (/** @type {string} */ line) => { if (format) return format(line); const color = paint?.(line); return color ? fg(color, line) : line; };
  const layout = () => {
    if (cache.width === width) return cache;
    /** @type {string[]} */ const lines = []; /** @type {number[]} */ const starts = [];
    const span = Math.max(16, width - 4);
    for (const line of raw) {
      starts.push(lines.length);
      // wrapTextWithAnsi measures display columns, so wide characters never overflow.
      lines.push(...(line ? wrapHanging(line, styleLine(line), span) : ['']));
    }
    return cache = { width, lines, starts };
  };
  // Body rows: most of the terminal, minus the two border rows.
  const page = () => Math.max(3, Math.floor((rows() || 28) * 0.9) - 2);
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
      const scrolls = lines.length > page();
      const narrow = w < 72, position = scrolls ? [`${offset + 1}–${Math.min(offset + page(), lines.length)} of ${lines.length}`] : [];
      const footer = query !== null ? `/${query}▏ enter · esc`
        : [...position, ...(message ? [message] : []), ...(narrow ? [] : [...(scrolls ? ['↑↓ pgup pgdn g/G'] : []), '/ search', ...(lastQuery ? ['n/N'] : []), ...(section ? ['[ ] files'] : [])]), 'esc close'].join(' · ');
      return frame(lines.slice(offset, offset + page()), w, { title: cleanText(title), footer, theme });
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
  const raw = cleanText(text, 100000).replace(/\t/g, '    ').split('\n');
  /** @type {import('@earendil-works/pi-tui').TUI | null} */ let host = null;
  await ctx.ui.custom((tui, theme, keys, done) => {
    host = tui;
    const view = createTextView(raw, { ...options, ...(options.panel ? { format: panelFormat(theme) } : {}), title, theme, keys, rows: () => tui.terminal?.rows, close: () => done(undefined) });
    /** @type {import('@earendil-works/pi-tui').Component} */
    const component = { render: width => view.render(width), handleInput(data) { view.handleInput(data); tui.requestRender?.(); }, invalidate() {} };
    return component;
  }, { overlay: true, overlayOptions: () => panelOptions(host) });
}
/** One row of a Pair menu: a section heading, or a selectable item with an optional
 * current value (and its color) and a one-line hint shown while it is selected.
 * @typedef {{section: string} | {id: string, label: string, value?: string, tone?: PanelColor, hint?: string}} MenuEntry */
/** Interactive bordered menu: section headings, labels in one column and values in
 * another, the selected row marked with an arrow, and its hint below the list.
 * @param {MenuEntry[]} entries
 * @param {{title: string, subtitle?: string[], footer?: string, initial?: string, theme?: PanelTheme | null, keys?: KeyMatcher | null, rows?: () => number | undefined, done: (id: string | undefined) => void}} options
 * @returns {{render(width: number): string[], handleInput(data: string): void}} */
export function createMenuView(entries, { title, subtitle = [], footer = '↑↓ move · enter select · esc close', initial, theme, keys, rows = () => undefined, done }) {
  /** @param {PanelColor} color @param {string} text */
  const fg = (color, text) => (theme ? theme.fg(color, text) : text);
  const bold = (/** @type {string} */ text) => (theme?.bold ? theme.bold(text) : text);
  const items = entries.flatMap((entry, index) => ('id' in entry ? [index] : []));
  let selected = Math.max(0, items.findIndex(index => /** @type {{id: string}} */ (entries[index]).id === initial));
  const labelWidth = Math.min(30, Math.max(0, ...entries.map(entry => ('id' in entry && entry.value !== undefined ? visibleWidth(entry.label) : 0))));
  /** @param {string} data @param {string} id @param {...string} fallbacks */
  const is = (data, id, ...fallbacks) => (keys?.matches(data, id) ?? false) || fallbacks.includes(data);
  return {
    render(width) {
      const inner = Math.max(1, width - 4);
      /** @type {string[]} */ const body = [];
      for (const line of subtitle) body.push(fg('dim', line));
      if (subtitle.length) body.push('');
      /** @type {number} */ let selectedRow = 0;
      entries.forEach((entry, index) => {
        if (!('id' in entry)) { if (body.length && body.at(-1) !== '') body.push(''); body.push(fg('muted', bold(entry.section.toUpperCase()))); return; }
        const current = items[selected] === index;
        if (current) selectedRow = body.length;
        const label = entry.value === undefined ? entry.label : entry.label + ' '.repeat(Math.max(0, labelWidth - visibleWidth(entry.label)));
        const value = entry.value === undefined ? '' : `  ${fg(entry.tone || 'text', entry.value)}`;
        body.push(`${current ? fg('accent', '→ ') : '  '}${current ? fg('accent', bold(label)) : label}${value}`);
      });
      const hint = 'id' in entries[items[selected]] ? /** @type {{hint?: string}} */ (entries[items[selected]]).hint : undefined;
      // Keep the selected row visible when the list is taller than the panel.
      const room = Math.max(3, Math.floor((rows() || 28) * 0.9) - 2 - (hint ? 2 : 0));
      const start = body.length <= room ? 0 : Math.min(body.length - room, Math.max(0, selectedRow - Math.floor(room / 2)));
      const visible = body.slice(start, start + room);
      if (hint) visible.push('', ...wrapTextWithAnsi(fg('dim', hint), inner).slice(0, 2));
      return frame(visible, width, { title, footer, theme });
    },
    handleInput(data) {
      if (is(data, 'tui.select.cancel', '\x1b', 'q') || matchesKey(data, 'ctrl+c')) done(undefined);
      else if (is(data, 'tui.select.up', '\x1b[A', 'k')) selected = (selected - 1 + items.length) % items.length;
      else if (is(data, 'tui.select.down', '\x1b[B', 'j')) selected = (selected + 1) % items.length;
      else if (is(data, 'tui.select.confirm', '\r', '\n')) done(/** @type {{id: string}} */ (entries[items[selected]]).id);
    },
  };
}
/** Show a Pair menu and return the chosen item's id, or undefined on Escape. In RPC and
 * other non-TUI modes it falls back to Pi's standard select dialog with `Label: value`
 * rows and an explicit close row.
 * @param {UIContext} ctx @param {MenuEntry[]} entries
 * @param {{title: string, subtitle?: string[], footer?: string, initial?: string}} options @returns {Promise<string | undefined>} */
export async function menu(ctx, entries, options) {
  const items = /** @type {{id: string, label: string, value?: string}[]} */ (entries.filter(entry => 'id' in entry));
  if (!items.length) return undefined;
  if (ctx.mode !== 'tui' || typeof ctx.ui.custom !== 'function') {
    const labels = items.map(item => (item.value === undefined ? item.label : `${item.label}: ${item.value}`));
    const choice = await ctx.ui.select([options.title, ...(options.subtitle || [])].join('\n'), [...labels, 'Close']);
    return items[labels.indexOf(choice ?? '')]?.id;
  }
  /** @type {import('@earendil-works/pi-tui').TUI | null} */ let host = null;
  return ctx.ui.custom((tui, theme, keys, done) => {
    host = tui;
    const view = createMenuView(entries, { ...options, theme, keys, rows: () => tui.terminal?.rows, done });
    /** @type {import('@earendil-works/pi-tui').Component} */
    const component = { render: width => view.render(width), handleInput(data) { view.handleInput(data); tui.requestRender?.(); }, invalidate() {} };
    return component;
  }, { overlay: true, overlayOptions: () => panelOptions(host) });
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
/** Human-readable card for one retained report, in the panel markup. Controller-captured
 * evidence (changed paths, configured checks) is kept apart from the worker's own claims,
 * and worker-written text is indented four spaces so it is never styled.
 * @param {ReportView} view @returns {string[]} */
export function reportCardLines(view) {
  /** @param {string} key @param {string} value */
  const row = (key, value) => `  ${key.padEnd(10)}  ${value}`;
  /** @param {string} text */
  const quoted = text => text.split('\n').map(line => `    ${line}`);
  const lines = [row('From', `${view.workerId} · step ${view.step} of ${view.steps}`), row('Task', inline(view.objective, 2000)),
    row('Report', `${view.reportId} · ${view.acknowledged ? 'read by Main' : 'not yet read by Main'}`),
    row('Checkpoint', `${view.checkpointHash.slice(0, 12)}${view.patchTruncated ? ' · patch truncated' : ''}`), ''];
  lines.push('## Summary', ...quoted(view.summary), '');
  if (view.question) lines.push('## Question for Main', ...quoted(view.question), '');
  lines.push(`## Changed files · ${view.changed.length} (captured by Pair)`, ...view.changed.slice(0, 40).map(file => `    ${file}`));
  if (view.changed.length > 40) lines.push(`> ${view.changed.length - 40} more in the diff`);
  lines.push('', '## Verification (run by Pair)');
  if (!view.verification.length) lines.push('> None configured, so no independent checks ran.');
  for (const v of view.verification) lines.push(`  ${v.passed ? '✔' : '✖'} ${v.name}${v.passed ? '' : v.timedOut ? ' (timed out)' : ` (exit ${v.code ?? 'unknown'})`}`);
  if (view.workerChecks.length) {
    lines.push('', '## Worker-reported checks (claims, not verified)');
    for (const c of view.workerChecks) lines.push(`  ${c.result === 'pass' ? '✔' : c.result === 'fail' ? '✖' : '○'} ${inline(c.name, 200)}${c.detail ? ` · ${inline(c.detail, 500)}` : ''}`);
  }
  if (view.decisions.length) lines.push('', '## Worker decisions', ...view.decisions.flatMap(d => quoted(`• ${d}`)));
  return lines;
}
/** @typedef {{label: string, action: 'report' | 'diff' | 'yield' | 'start' | 'pause' | 'resume' | 'cancel' | 'transcript' | 'restart' | 'stop' | 'status' | 'inbox' | 'settings' | 'reload' | 'doctor' | 'more', workerId?: string, section: string, hint: string}} DashboardItem */
/** Dashboard summary lines: one per worker (state, model or its absence, step and cost),
 * then waiting reports.
 * @param {PairSummary} summary @returns {string[]} */
export function dashboardHeader(summary) {
  const workers = summary.workers.map(w => {
    const parts = [`${workerLabel(summary, w.id)} ${symbol(w.status)} ${w.status === 'permission' ? 'needs permission' : w.status.replace(/_/g, ' ')}`];
    parts.push(hasModel(w) ? w.model : 'no worker model chosen');
    if (w.task && !['completed', 'cancelled'].includes(w.task.status)) parts.push(`step ${w.task.step} of ${w.task.steps}`);
    if (typeof w.task?.reportedCost === 'number' && w.task.reportedCost > 0) parts.push(costLabel(w.task.reportedCost));
    return parts.join(' · ');
  });
  const waiting = summary.waitingReports || 0;
  return [...workers, ...(waiting ? [`◐ ${waiting} report${waiting === 1 ? '' : 's'} not yet read by Main`] : [])];
}
/** Dashboard entries for the current state: what needs a human first, then only the
 * lifecycle actions that apply to each worker right now, then Pair's views. Rarely
 * needed maintenance actions live under More… (dashboardMoreItems). Escape closes.
 * @param {PairSummary} summary @returns {DashboardItem[]} */
export function dashboardItems(summary) {
  /** @type {DashboardItem[]} */ const items = [];
  const many = summary.workers.length > 1;
  for (const w of summary.workers) {
    if (w.task?.reportId && ['question', 'review', 'blocked'].includes(w.task.status)) {
      const what = w.task.status === 'review' ? 'checkpoint' : w.task.status;
      items.push({ section: 'Needs you', label: `Review ${what}${many ? ` (${w.id})` : ''}`, action: 'report', workerId: w.id, hint: "Read the worker's report. Read-only: Main still inspects and decides." },
        { section: 'Needs you', label: `View checkpoint diff${many ? ` (${w.id})` : ''}`, action: 'diff', workerId: w.id, hint: 'Scroll the changes in this checkpoint with real file names.' });
    }
  }
  const waiting = summary.waitingReports || 0;
  if (waiting) items.push({ section: 'Needs you', label: `Deliver ${waiting} waiting report${waiting === 1 ? '' : 's'} to Main`, action: 'yield', hint: 'Send them to Main now. Each delivery starts a Main turn.' });
  for (const w of summary.workers) {
    const section = many ? `Worker · ${w.id}` : 'Worker', task = w.task && !['completed', 'cancelled'].includes(w.task.status) ? w.task : null;
    if (task?.status === 'running') items.push({ section, label: 'Pause', action: 'pause', workerId: w.id, hint: 'Abort the current step and hold the task.' });
    if (task && ['paused', 'interrupted'].includes(task.status)) items.push({ section, label: 'Resume', action: 'resume', workerId: w.id, hint: 'Continue the held task after checking interrupted work.' });
    if (task) items.push({ section, label: 'Cancel task', action: 'cancel', workerId: w.id, hint: 'End the task. The conversation and file changes are kept.' });
    if (w.sessionId) items.push({ section, label: 'Transcript', action: 'transcript', workerId: w.id, hint: "Read the worker's recent conversation." });
    if (w.pid) items.push({ section, label: 'Stop worker', action: 'stop', workerId: w.id, hint: 'Stop the worker process. Its conversation is kept for next time.' });
    else items.push({ section, label: 'Start worker', action: 'start', workerId: w.id, hint: hasModel(w) ? 'Launch the worker process. No model turn is requested.' : 'Choose a worker model in Settings first.' });
  }
  items.push({ section: 'Pair', label: 'Status', action: 'status', hint: 'Worker, task, Main and cache details.' },
    { section: 'Pair', label: 'Inbox', action: 'inbox', hint: 'Reports Main has not read yet.' },
    { section: 'Pair', label: 'Settings', action: 'settings', hint: 'Worker model, review policy, indicator and more.' },
    { section: 'Pair', label: 'More…', action: 'more', hint: 'Restart the worker, reload configuration, run doctor.' });
  return items;
}
/** Maintenance actions behind the dashboard's More… entry. Escape goes back.
 * @param {PairSummary} summary @returns {DashboardItem[]} */
export function dashboardMoreItems(summary) {
  const many = summary.workers.length > 1;
  // Restart rereads saved settings first and keeps any retained conversation, so it applies in every state.
  return [...summary.workers.map(w => /** @type {DashboardItem} */ ({ section: 'Maintenance', label: many ? `Restart worker (${w.id})` : 'Restart worker', action: 'restart', workerId: w.id, hint: 'Reread settings and replace the worker process. Its conversation is kept.' })),
    { section: 'Maintenance', label: 'Reload configuration', action: 'reload', hint: 'Reread saved Pair settings without restarting Main or starting a worker.' },
    { section: 'Maintenance', label: 'Doctor', action: 'doctor', hint: 'Check Fabric, Fovea and Pair setup. No inference.' }];
}
/** Menu rows for dashboard items, with a heading wherever the section changes.
 * @param {DashboardItem[]} items @returns {MenuEntry[]} */
export function dashboardMenu(items) {
  return items.flatMap((item, i) => [...(i === 0 || items[i - 1].section !== item.section ? [{ section: item.section }] : []), { id: String(i), label: item.label, hint: item.hint }]);
}
/** One unresolved report as the inbox lists it; `view` is its current card when the
 * report is still the worker's live one.
 * @typedef {{workerId: string, reportId: string, status: string, observedAt?: number, view?: ReportView | null}} InboxEntry */
/** Inbox panel in the panel markup: one card per unresolved report, or an explanation
 * of what the inbox holds when it is empty.
 * @param {InboxEntry[]} entries @param {boolean} autoDeliver @returns {string} */
export function inboxText(entries, autoDeliver) {
  /** @param {string} key @param {string} value */
  const row = (key, value) => `  ${key.padEnd(8)}  ${value}`;
  const how = autoDeliver ? '> Automatic delivery is on: each report starts a Main turn as soon as Main is idle.'
    : '> Automatic delivery is off: Main calls pair_yield, or deliver them with /pair yield.';
  if (!entries.length) return ['', '  ✔ Nothing waiting', '', '> Worker reports stay here until Main reads them with pair_inspect or pair_decide.', how].join('\n');
  const lines = [`> ${entries.length} report${entries.length === 1 ? '' : 's'} not yet resolved.`, how, ''];
  for (const entry of entries) {
    const view = entry.view?.reportId === entry.reportId ? entry.view : null;
    lines.push(`## ◐ ${view ? `${kindLabel(view.kind)} from ${entry.workerId} · step ${view.step} of ${view.steps}` : `Report from ${entry.workerId}`}`);
    if (view) lines.push(row('Summary', inline(view.summary.split('\n')[0], 300)));
    lines.push(row('Report', `${entry.reportId} · ${entry.status.replace(/_/g, ' ')}`), row('Main', entry.observedAt === undefined ? 'not yet read' : 'read'), '');
  }
  return lines.join('\n');
}
/** Readable doctor report: the checks that decide whether Pair can run, then the raw
 * diagnostic data for bug reports.
 * @param {{main: {model?: {provider: string, id: string} | null, thinkingLevel?: unknown, trusted?: boolean, capabilities: {fabric: boolean, fovea: boolean, pairReport: boolean}, versions: {fabric?: unknown, fovea?: unknown}}, pair: PairSummary, configuration: {version?: unknown, scope?: unknown, pendingMigrations?: readonly unknown[]}, blockers: string[], raw: unknown}} data
 * @returns {string} */
export function doctorText({ main, pair, configuration, blockers, raw }) {
  /** @param {boolean} ok @param {string} text */
  const check = (ok, text) => `  ${ok ? '✔' : '✖'} ${text}`;
  /** @param {unknown} version */
  const ver = version => (typeof version === 'string' ? ` ${version}` : '');
  const pending = Array.isArray(configuration.pendingMigrations) ? configuration.pendingMigrations.length : 0;
  const lines = ['## Main session',
    `  Model       ${main.model ? `${main.model.provider}/${main.model.id}` : 'not selected'}${typeof main.thinkingLevel === 'string' ? ` · thinking ${main.thinkingLevel}` : ''}`,
    `  Project     ${main.trusted ? 'trusted' : 'not trusted (project settings are ignored)'}`, '',
    '## Extensions', check(main.capabilities.fabric, main.capabilities.fabric ? `Fabric${ver(main.versions.fabric)} loaded` : 'Fabric not loaded'),
    check(main.capabilities.fovea, main.capabilities.fovea ? `Fovea${ver(main.versions.fovea)} loaded` : 'Fovea not loaded'), '',
    '## Worker Fabric profile', ...(blockers.length ? blockers.map(item => check(false, item)) : [check(true, 'shellHangMs, maxDepth and prewalk are set for Pair')]), '',
    '## Configuration', `  Version     ${String(configuration.version ?? 'unknown')} · ${String(configuration.scope ?? 'unknown')} scope`,
    check(pending === 0, pending === 0 ? 'no pending migrations' : `${pending} pending migration${pending === 1 ? '' : 's'}; review in /pair settings`),
    check(pair.enabled, pair.enabled ? 'enabled for new work' : 'disabled for new work; turn it on in /pair settings'), '',
    '## Workers', ...pair.workers.map(w => check(hasModel(w), `${w.id}: ${hasModel(w) ? `${w.model} · ${w.status.replace(/_/g, ' ')}` : 'no model chosen'}`)), '',
    '## Raw data', '> For bug reports.', ...JSON.stringify(raw, null, 2).split('\n').map(line => `    ${line}`)];
  return lines.join('\n');
}
/** Pick one option in a Pair menu, with the current one marked and a hint per option.
 * Only an offered option can be returned.
 * @template {string} Value
 * @param {UIContext} ctx @param {string} title @param {readonly {value: Value, hint?: string}[]} options @param {Value} [current]
 * @returns {Promise<Value | undefined>} */
async function chooseValue(ctx, title, options, current) {
  const id = await menu(ctx, options.map(option => ({ id: option.value, label: option.value, value: option.value === current ? '● current' : '', tone: /** @type {PanelColor} */ ('success'), hint: option.hint })),
    { title, initial: current, footer: '↑↓ move · enter choose · esc back' });
  return options.find(option => option.value === id)?.value;
}
/** @param {boolean} value @returns {string} */
function onOff(value) { return value ? 'On' : 'Off'; }
/** What each cosmetic indicator mode shows. @type {Readonly<Record<import('./config.js').Indicator, string>>} */
const INDICATOR_LABEL = { minimal: 'status line + current plan step', compact: 'status line only', off: 'hidden' };

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
    /** @type {import('@earendil-works/pi-tui').TUI | null} */ let host = null;
    answer = await ctx.ui.custom((_tui, theme, keys, done) => {
      host = _tui;
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
          const inner = Math.max(1, width - 4);
          return frame([theme.fg('dim', 'Main stays on its own model; change it with /model.'), '', ...input.render(inner), '', ...list.render(inner)], width,
            { title: 'Worker model', footer: '↑↓ move · type to filter · enter choose · esc cancel', theme });
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
    }, { overlay: true, overlayOptions: () => panelOptions(host) });
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
  let saved = clone(original), scope = initialScope, selected = saved.workers[0].id, advanced = false, lastEdited = 1;
  for (;;) {
    // Each interaction gets a disposable draft. Invalid input and failed writes
    // cannot contaminate the next edit or appear as a saved value.
    const draft = clone(saved);
    const w = draft.workers.find(w => w.id === selected) || draft.workers[0]; selected = w.id;
    const model = w.provider && w.model ? `${w.provider}/${w.model}` : '';
    /** @param {boolean} value @returns {PanelColor} */
    const tone = value => (value ? 'success' : 'dim');
    /** @type {MenuEntry[]} */
    const common = [
      { section: 'Pair' },
      { id: '1', label: 'Enabled for new work', value: onOff(draft.enabled), tone: draft.enabled ? 'success' : 'warning', hint: draft.enabled ? 'Main can delegate implementation to the worker.' : 'Pair accepts no new work while this is off.' },
      { id: '2', label: 'Autostart next session', value: onOff(draft.autoStart), tone: tone(draft.autoStart), hint: 'Start the worker when a session opens. No model turn is requested.' },
      { id: '14', label: 'Indicator', value: draft.indicator, hint: `${INDICATOR_LABEL[draft.indicator]}. Display only; never affects work.` },
      { id: '18', label: 'Save scope', value: scope, hint: scope === 'global' ? 'Global defaults for every project; project overrides are excluded.' : 'This project: its overrides plus inherited global defaults.' },
      { section: draft.workers.length > 1 ? `Worker · ${w.id}` : 'Worker' },
      { id: '4', label: 'Model', value: model || 'not chosen', tone: model ? 'text' : 'warning', hint: 'The model the worker runs. Main stays on its own model (/model).' },
      { id: '5', label: 'Effort', value: w.effort, hint: 'Thinking effort, checked against the worker model at startup.' },
      { id: '8', label: 'Review policy', value: draft.supervision.mode, hint: 'How often Main reviews. Final acceptance is always required.' },
      { section: 'More' },
      { id: '20', label: 'Advanced settings…', hint: 'Worker workspace, read-only mode, revision limit, verification commands, extra workers.' }
    ];
    /** @type {MenuEntry[]} */
    const extra = [
      { section: 'Worker' },
      ...(draft.workers.length > 1 ? [{ id: '3', label: 'Selected worker', value: w.id, hint: 'Which worker the settings below apply to.' }] : []),
      { id: '6', label: 'Read-only worker', value: onOff(w.readOnly), tone: tone(w.readOnly), hint: 'Read and Fovea tools only. Not supported together with Fabric.' },
      { id: '7', label: 'Workspace', value: w.cwd || 'same as Main', hint: 'Absolute path the worker edits. Blank uses the Main workspace.' },
      { section: 'Review' },
      { id: '9', label: 'Revision limit', value: String(draft.supervision.maxRevisions), hint: 'How many times Main may ask for revisions before the task stops.' },
      { id: '10', label: 'Summary detail', value: draft.supervision.summaryDetail, hint: 'How much detail the worker puts in its reports.' },
      { id: '17', label: 'Verification commands', value: `${draft.verification.commands.length} configured`, hint: 'Trusted commands Pair runs itself at every checkpoint, with your permissions.' },
      { section: 'Manage' },
      { id: '16', label: 'Add worker…', hint: 'Add another worker slot. Only one worker runs at a time.' },
      ...(options.migrate ? [{ id: '22', label: 'Review or migrate this scope…', hint: 'Preview and apply a pending settings migration for the selected scope.' }] : [])
    ];
    const index = Number(await menu(ctx, advanced ? extra : common, {
      title: `Pair settings${advanced ? ' · Advanced' : ''}`,
      subtitle: [`Saves automatically to the ${scope} scope.`, `Main model: ${ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : 'not selected'} (change with /model)`],
      footer: `↑↓ move · enter change · esc ${advanced ? 'back' : 'done'}`, initial: String(lastEdited)
    }) ?? NaN);
    if (Number.isNaN(index)) { if (advanced) { advanced = false; lastEdited = 20; continue; } return; }
    lastEdited = index;
    try {
      if (index === 20) { advanced = true; continue; }
      if (index === 18) {
        const nextScope = await chooseValue(ctx, 'Save scope', [...(ctx.isProjectTrusted?.() ? [{ value: /** @type {const} */ ('project'), hint: 'This project: its overrides plus inherited global defaults. Switching copies nothing.' }] : []),
          { value: /** @type {const} */ ('global'), hint: 'Global defaults for every project. Switching copies nothing.' }], scope);
        if (nextScope && nextScope !== scope) {
          const next = options.loadScope ? await options.loadScope(nextScope) : saved;
          scope = nextScope; saved = clone(next);
        }
        continue;
      }
      if (index === 22) { const next = await options.migrate?.(scope); if (next) saved = clone(next); continue; }
      if (index === 1) draft.enabled = !draft.enabled;
      else if (index === 2) draft.autoStart = !draft.autoStart;
      else if (index === 3) selected = await chooseValue(ctx, 'Selected worker', draft.workers.map(worker => ({ value: worker.id })), selected) || selected;
      else if (index === 4) await pickModel(ctx, w);
      else if (index === 5) w.effort = await chooseValue(ctx, 'Worker effort', /** @type {const} */ (['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).map(value => ({ value, hint: 'Checked against the worker model when it starts.' })), w.effort) || w.effort;
      else if (index === 6) w.readOnly = !w.readOnly;
      else if (index === 7) { const value = await ctx.ui.input('Worker workspace: absolute path, or blank for Main', w.cwd || ''); if (value !== undefined) w.cwd = value.trim() || null; }
      else if (index === 8) {
        /** @type {readonly {value: import('./contracts.js').ReviewMode, hint: string}[]} */
        const modes = [
          { value: 'final-only', hint: 'Review once after the complete plan. Questions are always allowed.' },
          { value: 'milestones', hint: 'Approve each dispatched plan milestone.' },
          { value: 'every-step', hint: 'Approve each small plan step. No step skipping.' }
        ];
        draft.supervision.mode = await chooseValue(ctx, 'Review policy · final acceptance is always required', modes, draft.supervision.mode) || draft.supervision.mode;
      }
      else if (index === 9) draft.supervision.maxRevisions = await numberInput(ctx, 'Revision limit', draft.supervision.maxRevisions, {
        accepts: value => Number.isInteger(value) && value >= 0 && value <= 20, expected: 'enter an integer from 0 to 20.'
      });
      else if (index === 10) draft.supervision.summaryDetail = await chooseValue(ctx, 'Summary detail', [{ value: 'minimal', hint: 'Shortest reports.' }, { value: 'normal', hint: 'Changes, reasons and evidence.' }, { value: 'detailed', hint: 'Fuller reasoning and evidence.' }], draft.supervision.summaryDetail) || draft.supervision.summaryDetail;
      else if (index === 14) {
        draft.indicator = await chooseValue(ctx, 'Indicator · display only', INDICATORS.map(mode => ({ value: mode, hint: `${INDICATOR_LABEL[mode][0].toUpperCase()}${INDICATOR_LABEL[mode].slice(1)}.` })), draft.indicator) || draft.indicator;
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

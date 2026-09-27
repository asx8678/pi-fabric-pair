import { Input, SelectList, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { keyHint, rawKeyHint } from '@earendil-works/pi-coding-agent';
import { assert, briefError, cleanText, clone } from './util.js';
import { INDICATORS, validateConfig } from './config.js';
import { EFFORT_LEVELS } from './contracts.js';
import { validateUsageObservation } from './observations.js';
import { warmingLabel } from './warming.js';

/** @typedef {import('@earendil-works/pi-coding-agent').ExtensionContext} UIContext */
/** @typedef {Readonly<ReturnType<import('./controller.js').PairController['summary']>>} PairSummary */
/** @typedef {(next: import('./config.js').PairConfig, scope: import('./config.js').ConfigScope) => Promise<import('./config.js').PairConfig | void>} ApplySettings */
/** @typedef {{loadScope?: (scope: import('./config.js').ConfigScope) => Promise<import('./config.js').PairConfig>, migrate?: (scope: import('./config.js').ConfigScope) => Promise<import('./config.js').PairConfig | void>}} SettingsOptions */

/** @param {unknown} value @returns {Readonly<import('@earendil-works/pi-coding-agent').ContextUsage> | null} */
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
/** @typedef {'accent' | 'success' | 'warning' | 'error' | 'muted' | 'dim' | 'text'} IndicatorColor */

export const PULSE_MAX_AGE_MS = 120000;
export const STALE_AGE_MS = 300000;
/** @param {PairSummary['workers'][number]} worker @param {number} [now] @returns {number} */
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
/** @param {PairSummary} summary @param {number} [now] @returns {{id: string, ageMs: number}[]} */
export function staleWorkers(summary, now = Date.now()) {
  return summary.workers
    .filter(w => ['working', 'settling', 'starting'].includes(w.status) && activityAge(w, now) >= STALE_AGE_MS)
    .map(w => ({ id: w.id, ageMs: activityAge(w, now) }));
}

/** @param {{tokens?: unknown, seconds?: unknown} | null | undefined} speed @returns {string} */
export function speedLabel(speed) {
  const tokens = speed?.tokens, seconds = speed?.seconds;
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0
    || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return 'avg — tok/s';
  return `avg ${(tokens / seconds).toFixed(1)} tok/s`;
}
/**
 * @param {PairSummary['workers'][number]['observation']} observation
 * @returns {{tokens?: unknown, seconds?: unknown} | null | undefined}
 */
function observedSpeed(observation) {
  return observation && typeof observation === 'object' && 'speed' in observation
    ? /** @type {{tokens?: unknown, seconds?: unknown} | null | undefined} */ (observation.speed) : undefined;
}
/** @param {unknown} value @param {number} [max] @returns {string} */
function inline(value, max = 200) { return cleanText(value, 4000).replace(/\s+/g, ' ').trim().slice(0, max); }
/** @param {number} cost @returns {string} */
export function costLabel(cost) {
  if (cost >= 0.1) return `$${cost.toFixed(2)}`;
  return cost >= 0.001 ? `$${cost.toFixed(3)}` : '<$0.001';
}
/** @param {PairSummary['workers'][number]} worker @returns {boolean} */
function hasModel(worker) { return /^[^/]+\/.+$/.test(worker.model); }
/** @param {number | null | undefined} tokens @returns {string} */
function tokenLabel(tokens) {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens)) return 'unknown';
  if (tokens >= 1e6) return `${Number((tokens / 1e6).toFixed(1))}M`;
  return tokens >= 1000 ? `${Number((tokens / 1000).toFixed(1))}k` : String(tokens);
}
/** @param {PairSummary['workers'][number]} worker @returns {string} */
function nextAction(worker) {
  if (['stopped', 'not_started'].includes(worker.status) && !worker.pid) return !hasModel(worker) ? '/pair to set up' : worker.workspaceGit === false ? 'not a Git repo' : '/pair start';
  if (['paused', 'interrupted'].includes(worker.status) || ['paused', 'interrupted'].includes(worker.task?.status || '')) return '/pair resume';
  if (['attention', 'error'].includes(worker.status)) return /^EXIT_UNCONFIRMED/.test(worker.error || '') ? '/pair reconcile' : '/pair';
  return '';
}
/** @param {PairSummary} summary @returns {string} */
function cacheBadge(summary) {
  const actors = [{ label: 'M', usage: summary.main?.lastUsage ?? null },
    ...summary.workers.map(w => ({ label: workerLabel(summary, w.id), usage: w.observation?.lastUsage ?? null }))]
    .flatMap(({ label, usage }) => {
      const observed = validateUsageObservation(usage, 'Last cache-read usage');
      return observed?.cacheRatio == null ? [] : [`${label} ${Math.floor(100 * observed.cacheRatio)}%`];
    });
  return actors.length ? `cache ${actors.join(' ')}` : '';
}
/** @param {string | null | undefined} tool @param {string | null | undefined} target @returns {string} */
function activityLabel(tool, target) {
  const name = inline(tool, 40).replace(/^extensions\./, '');
  if (!name) return '';
  const verb = /^(edit|apply_patch)$/.test(name) ? 'editing' : name === 'write' ? 'writing' : name === 'read' ? 'reading'
    : /^(bash|powershell)$/.test(name) ? 'running' : /^(grep|find|ls)$/.test(name) ? 'searching' : name === 'fabric_exec' ? 'running Fabric code'
    : name === 'pair_report' ? 'reporting to Main' : /^fovea_/.test(name) ? 'exploring code' : name;
  const what = inline(target, 60);
  return what && !/^(running Fabric code|reporting to Main)$/.test(verb) ? `${verb} ${what}` : verb;
}
/**
 * @param {PairSummary} summary
 * @param {PairSummary['workers'][number]} w
 * @param {boolean} mainBusy
 * @param {number} now
 * @returns {{icon: string, color: IndicatorColor, text: string, details: {text: string, color: IndicatorColor}[], active: boolean}}
 */
export function workerStage(summary, w, mainBusy, now) {
  /** @param {string} text @param {IndicatorColor} [color] */
  const d = (text, color = 'muted') => ({ text, color });
  const t = w.task && !['completed', 'cancelled'].includes(w.task.status) ? w.task : null;
  const step = t ? `step ${t.step}/${t.steps}` : '';
  const title = t ? inline(t.stepList?.find(s => ['active', 'review', 'held'].includes(s.state))?.title, 48) : '';
  const cost = typeof w.task?.reportedCost === 'number' && w.task.reportedCost > 0 ? [d(costLabel(w.task.reportedCost))] : [];
  /** @param {string} doing */
  const withMain = doing => {
    const waiting = summary.waitingReports || 0;
    if (waiting && summary.autoDeliverReports === false) return d('waiting · pair_yield or /pair yield', 'warning');
    if (waiting) return d(mainBusy ? 'Main is busy; delivered when its current work is done' : 'delivering to Main');
    return d(mainBusy ? `Main is ${doing}` : 'with Main');
  };
  if (!summary.enabled && !t) return { icon: '○', color: 'dim', text: 'Pair off', details: [d('/pair to turn on', 'dim')], active: false };
  if (!hasModel(w)) return { icon: '○', color: 'warning', text: 'Worker not set up', details: [d('/pair to choose a model', 'dim')], active: false };
  if (['error', 'attention'].includes(w.status)) return { icon: '!', color: 'error', text: 'Worker needs attention', details: [...(w.error ? [d(inline(w.error, 80), 'error')] : []), d(nextAction(w) || '/pair', 'dim')], active: false };
  if (w.status === 'permission') return { icon: '!', color: 'warning', text: 'Worker is asking for permission', details: [d('answer the dialog', 'dim')], active: false };
  if (t?.status === 'activating') return { icon: '◉', color: 'accent', text: `Worker starting ${step}`, details: [...(title ? [d(title, 'text')] : []), ...cost], active: true };
  if (t && ['running', 'awaiting_settle'].includes(t.status) && ['working', 'settling', 'starting', 'ready'].includes(w.status)) {
    const verb = t.status === 'awaiting_settle' || w.status === 'settling' ? 'finishing' : t.lastDecision === 'revise' ? 'revising' : t.lastDecision === 'answer' ? 'continuing' : 'working on';
    const age = activityAge(w, now), obs = w.observation, percent = obs?.context?.percent;
    const activity = obs?.compacting ? 'compacting its context' : activityLabel(obs?.currentTool, obs && 'currentTarget' in obs ? /** @type {string | null | undefined} */ (obs.currentTarget) : null);
    return { icon: '◉', color: 'success', text: `Worker ${verb} ${step}`, active: true, details: [
      ...(title ? [d(title, 'text')] : []),
      ...(age >= STALE_AGE_MS ? [d('no activity for 5+ min', 'error')] : activity ? [d(activity, 'accent')] : []),
      d(speedLabel(observedSpeed(obs)).replace(/^avg /, '')),
      ...(typeof percent === 'number' && percent > 75 ? [d(`context ${Math.round(percent)}%`, percent > 90 ? 'error' : 'warning')] : []),
      ...cost] };
  }
  if (t?.status === 'question') return { icon: '◐', color: 'warning', text: `Question for Main · ${step}`, details: [withMain('answering'), ...cost], active: false };
  if (t?.status === 'review') return { icon: '◐', color: 'warning', text: t.reportKind === 'final_review' ? 'Final review for Main' : `Checkpoint ${t.step}/${t.steps} ready for review`, details: [...(title ? [d(title, 'text')] : []), withMain('reviewing'), ...cost], active: false };
  if (t?.status === 'blocked') return { icon: '◐', color: 'warning', text: `Worker blocked · ${step}`, details: [withMain('looking at it'), ...cost], active: false };
  if (t && ['paused', 'interrupted'].includes(t.status)) return { icon: '⏸', color: 'warning', text: `Task ${t.status} · ${step}`, details: [d(nextAction(w) || '/pair resume', 'dim'), ...cost], active: false };
  if (w.status === 'starting') return { icon: '◉', color: 'accent', text: 'Worker starting', details: [], active: true };
  const model = w.model.split('/').pop() || w.model;
  if (w.pid && w.status === 'ready') return { icon: '●', color: 'success', text: w.task?.status === 'completed' ? 'Task done · worker ready' : 'Worker ready', details: [d(`${model} · ${w.effort}`)], active: false };
  const next = nextAction(w);
  return { icon: '○', color: next === 'not a Git repo' ? 'warning' : 'dim', text: 'Worker stopped', details: next ? [d(next, next === 'not a Git repo' ? 'warning' : 'dim')] : [], active: false };
}
/**
 * @param {PairSummary} summary
 * @param {boolean} mainBusy
 * @param {{fg(color: IndicatorColor, text: string): string}} [theme]
 * @param {number} [now]
 * @returns {string}
 */
export function indicator(summary, mainBusy, theme, now = Date.now()) {
  /** @param {IndicatorColor} color @param {string} text @returns {string} */
  const paint = (color, text) => (theme ? theme.fg(color, text) : text);
  const dot = paint('dim', ' · ');
  const primary = planWorker(summary) || summary.workers[0];
  const many = summary.workers.length > 1;
  const parts = [paint('dim', 'pair')];
  for (const w of primary ? [primary, ...summary.workers.filter(other => other !== primary)] : []) {
    const stage = workerStage(summary, w, mainBusy, now);
    const blinking = stage.active && activityAge(w, now) <= PULSE_MAX_AGE_MS && Math.floor(now / 2000) % 2 === 1;
    const label = many ? `${workerLabel(summary, w.id)} ` : '';
    if (w !== primary) { parts.push(paint(stage.color, `${label}${stage.icon} ${stage.text}`)); continue; }
    parts.push(paint(blinking ? 'dim' : stage.color, `${label}${stage.icon}`) + ' ' + paint(stage.color, stage.text), ...stage.details.map(detail => paint(detail.color, detail.text)));
  }
  const waiting = summary.waitingReports || 0, reviewing = primary?.task && ['question', 'review', 'blocked'].includes(primary.task.status);
  if (waiting && !reviewing) parts.push(paint('warning', `◐ ${waiting} report${waiting === 1 ? '' : 's'} for Main`));
  const cache = cacheBadge(summary);
  if (cache) parts.push(paint('dim', cache));
  return parts.join(dot);
}
/** @param {PairSummary} summary @param {string} id @returns {string} */
function workerLabel(summary, id) {
  return summary.workers.length === 1 ? 'W' : `W${summary.workers.findIndex(w => w.id === id) + 1}`;
}
/** @param {PairSummary} summary @returns {PairSummary['workers'][number] | undefined} */
export function planWorker(summary) {
  const planned = summary.workers.filter(w => Array.isArray(w.task?.stepList) && w.task.stepList.length > 0);
  return planned.find(w => ['working', 'settling', 'starting', 'question', 'review', 'blocked'].includes(w.status)) || planned[0];
}
/**
 * @param {number} done
 * @param {number} total
 * @param {number} [maxCells]
 * @returns {{filled: number, empty: number, label: string, percent: number}}
 */
export function progressBar(done, total, maxCells = 10) {
  const cells = Math.min(Math.max(1, total), Math.max(1, maxCells));
  const filled = total > 0 ? Math.min(cells, Math.round((cells * done) / total)) : 0;
  return { filled, empty: cells - filled, label: `${done}/${total}`, percent: total > 0 ? Math.round((100 * done) / total) : 0 };
}

/** @typedef {'done' | 'active' | 'review' | 'held' | 'todo'} StepState */

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
/** @param {StepState} state @returns {string} */
function stepPrefix(state) { return state === 'done' ? `complete ${stepSymbol(state)}` : stepSymbol(state); }
/** @param {PairSummary} summary @param {{fg(color: IndicatorColor, text: string): string}} [theme] @returns {string | null} */
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
/** @param {unknown} value @returns {string} */
function lastCacheRead(value) {
  const usage = validateUsageObservation(value, 'Last cache-read usage');
  if (!usage) return 'unknown';
  return usage.cacheRatio === null ? 'unknown' : `${(100 * usage.cacheRatio).toFixed(1)}%`;
}
/**
 * @param {() => PairSummary | null} current
 * @param {{fg(color: IndicatorColor, text: string): string}} theme
 * @returns {import('@earendil-works/pi-tui').Component}
 */
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
/**
 * @param {PairSummary} summary
 * @param {Readonly<Awaited<ReturnType<typeof import('./native.js').nativeSettings>>> | null} [native]
 * @param {number} [now]
 * @returns {string}
 */
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
    if (next) lines.push(row('Next', next === '/pair to set up' ? 'open /pair and choose the worker model'
      : next === 'not a Git repo' ? 'open Pi in a Git repository, or set the worker workspace in /pair settings → Advanced' : next));
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
        : '> Reports reach Main when its current work is done (at once if Main is idle); /pair yield sends them now.', '');
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
    lines.push(row(w.id, `PID ${w.pid || 'not running'} · session ${w.sessionId || 'not created'}`), row('Workspace', `${w.cwd}${w.workspaceGit === false ? ' · not a Git repository' : ''}`),
      row('Warming', `worker ${warmingLabel(obs && 'warming' in obs ? obs.warming : undefined)}`));
    if (w.usage) lines.push(row('Usage', `${w.usage.requests} responses · reported $${w.usage.reportedCost.toFixed(4)} · ${w.usage.unknownCostRequests} with unknown price (inference only)`));
    if (w.lastExchange) lines.push(row('Exchange', `${w.lastExchange.direction} · ${w.lastExchange.kind}`));
  }
  lines.push(row('State dir', summary.directory), '',
    '## Legend',
    '> ● ready  ◉ working  ◐ waiting on Main  ○ stopped  ! needs attention',
    '> Plan: ✔ approved  ▶ in progress  ◐ in review  ⏸ held  ○ not started',
    '> Heartbeat: the worker dot blinks while it is active; "stale" after 5 minutes of silence.',
    '> Cache: cacheRead ÷ (input + cacheRead + cacheWrite) of the last measured request, not task totals.',
    '> Speed: weighted streaming output tokens per second, excluding request latency and tool time.',
    `> ${summary.cacheNote}`);
  return lines.map(line => cleanText(line, 20000)).join('\n');
}
/** @typedef {IndicatorColor | 'border' | 'borderMuted' | 'borderAccent' | 'text' | 'mdHeading'} PanelColor */
/** @typedef {{fg(color: PanelColor, text: string): string, bold?(text: string): string}} PanelTheme */
/**
 * @param {string[]} body
 * @param {number} width
 * @param {{title: string, subtitle?: string[], hints?: string, theme?: PanelTheme | null}} options
 * @returns {string[]}
 */
export function chrome(body, width, { title, subtitle = [], hints = '', theme }) {
  /** @param {PanelColor} color @param {string} text */
  const fg = (color, text) => (theme ? theme.fg(color, text) : text);
  const bold = (/** @type {string} */ text) => (theme?.bold ? theme.bold(text) : text);
  const rule = fg('border', '─'.repeat(Math.max(1, width)));
  const pad = (/** @type {string} */ line) => ` ${truncateToWidth(line, Math.max(1, width - 2), '')}`;
  return [rule, '', pad(fg('accent', bold(title))), ...subtitle.map(line => pad(fg('muted', line))), '', ...body.map(pad), '', ...(hints ? [pad(hints), ''] : []), rule];
}
/** @param {...[string, string]} pairs @returns {string} */
function hints(...pairs) {
  return pairs.map(([key, action]) => (key.includes('.') ? keyHint(/** @type {import('@earendil-works/pi-tui').Keybinding} */ (key), action) : rawKeyHint(key, action))).join('  ');
}
/** @param {string} raw @param {string} styled @param {number} span @returns {string[]} */
function wrapHanging(raw, styled, span) {
  const indent = /^ */.exec(raw)?.[0].length || 0;
  const marker = /^ *(?:complete ✔|[•✔✖○▶◐⏸!-]|\d+\.) /.exec(raw);
  const row = indent <= 2 ? /^ *[A-Za-z][\w ./()-]{0,22}? {2,}(?=\S)/.exec(raw) : null;
  const hang = Math.min(Math.floor(span / 2), marker ? marker[0].length : row ? row[0].length : indent);
  const lead = /^ */.exec(styled)?.[0].length || 0;
  const [first = '', ...rest] = wrapTextWithAnsi(styled.slice(lead), Math.max(10, span - indent));
  const more = rest.length ? wrapTextWithAnsi(rest.join(' '), Math.max(10, span - hang)) : [];
  return [' '.repeat(indent) + first, ...more.map(part => ' '.repeat(hang) + part)];
}
/** @param {PanelTheme | null | undefined} theme @returns {(line: string) => string} */
export function panelFormat(theme) {
  /** @param {PanelColor} color @param {string} text */
  const fg = (color, text) => (theme ? theme.fg(color, text) : text);
  return line => {
    const indent = /^ */.exec(line)?.[0].length || 0, body = line.slice(indent), pad = ' '.repeat(indent);
    if (indent >= 4 || !body) return line;
    if (indent === 0 && body.startsWith('## ')) return fg('mdHeading', theme?.bold ? theme.bold(body.slice(3)) : body.slice(3));
    if (body.startsWith('> ')) return pad + fg('dim', body.slice(2));
    if (body.startsWith('! ')) return pad + fg('warning', body);
    const step = /^(complete ✔|✔|✖|▶|◐|⏸|○) /.exec(body);
    if (step) return pad + fg(step[1] === '✖' ? 'error' : step[1].endsWith('✔') ? 'success' : step[1] === '▶' ? 'accent' : step[1] === '○' ? 'dim' : 'warning', body);
    const row = /^([A-Za-z][\w ./()-]{0,22}?)( {2,})(\S.*)$/.exec(body);
    if (row) return pad + fg('muted', row[1] + row[2]) + fg('text', row[3]);
    return line;
  };
}
/** @typedef {{panel?: boolean, paint?: (line: string) => IndicatorColor | null, format?: (line: string) => string, section?: RegExp}} TextViewOptions */
/** @typedef {{matches(data: string, id: string): boolean}} KeyMatcher */
/**
 * @param {string[]} raw
 * @param {{title: string, theme?: PanelTheme | null, keys?: KeyMatcher | null, rows?: () => number | undefined, close: () => void} & TextViewOptions} options
 * @returns {{render(width: number): string[], handleInput(data: string): void}}
 */
export function createTextView(raw, { title, theme, keys, rows = () => undefined, close, paint, format, section }) {
  let offset = 0, width = 80, message = '', lastQuery = '';
  /** @type {number | null} */ let cursor = null;
  /** @type {string | null} */ let query = null;
  /** @type {{width: number, lines: string[], starts: number[]}} */ let cache = { width: -1, lines: [], starts: [] };
  /** @param {PanelColor} color @param {string} text */
  const fg = (color, text) => (theme ? theme.fg(color, text) : text);
  const styleLine = (/** @type {string} */ line) => { if (format) return format(line); const color = paint?.(line); return color ? fg(color, line) : line; };
  const layout = () => {
    if (cache.width === width) return cache;
    /** @type {string[]} */ const lines = []; /** @type {number[]} */ const starts = [];
    const span = Math.max(16, width - 2);
    for (const line of raw) {
      starts.push(lines.length);
      lines.push(...(line ? wrapHanging(line, styleLine(line), span) : ['']));
    }
    return cache = { width, lines, starts };
  };
  const page = () => Math.max(6, (rows() || 28) - 12);
  const maxOffset = () => Math.max(0, layout().lines.length - page());
  const currentLine = () => { if (cursor !== null) return cursor; const { starts } = layout(); let i = 0; while (i + 1 < starts.length && starts[i + 1] <= offset) i++; return i; };
  /** @param {(line: string) => boolean} test @param {1 | -1} step @param {boolean} inclusive @param {string} missing */
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
      const narrow = w < 72, position = scrolls ? fg('muted', `${offset + 1}–${Math.min(offset + page(), lines.length)} of ${lines.length}`) + '  ' : '';
      const keys = query !== null ? fg('accent', `/${query}▏`) + '  ' + hints(['tui.select.confirm', 'search'], ['tui.select.cancel', 'cancel'])
        : position + (message ? fg('warning', message) + '  ' : '') + hints(...(narrow ? [] : [...(scrolls ? /** @type {[string, string][]} */ ([['↑↓', 'scroll'], ['g/G', 'top/bottom']]) : []),
          /** @type {[string, string]} */ (['/', 'search']), ...(lastQuery ? /** @type {[string, string][]} */ ([['n/N', 'next/prev']]) : []), ...(section ? /** @type {[string, string][]} */ ([['[ ]', 'files']]) : [])]),
          ['tui.select.cancel', 'close']);
      return chrome(lines.slice(offset, offset + page()), w, { title: cleanText(title), hints: keys, theme });
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
  await ctx.ui.custom((tui, theme, keys, done) => {
    const view = createTextView(raw, { ...options, ...(options.panel ? { format: panelFormat(theme) } : {}), title, theme, keys, rows: () => tui.terminal?.rows, close: () => done(undefined) });
    /** @type {import('@earendil-works/pi-tui').Component} */
    const component = { render: width => view.render(width), handleInput(data) { view.handleInput(data); tui.requestRender?.(); }, invalidate() {} };
    return component;
  });
}
/** @typedef {{section: string} | {id: string, label: string, value?: string, tone?: PanelColor, hint?: string}} MenuEntry */
/**
 * @param {MenuEntry[]} entries
 * @param {{title: string, subtitle?: string[], confirm?: string, cancel?: string, initial?: string, theme?: PanelTheme | null, keys?: KeyMatcher | null, rows?: () => number | undefined, done: (id: string | undefined) => void}} options
 * @returns {{render(width: number): string[], handleInput(data: string): void}}
 */
export function createMenuView(entries, { title, subtitle = [], confirm = 'select', cancel = 'close', initial, theme, keys, rows = () => undefined, done }) {
  /** @param {PanelColor} color @param {string} text */
  const fg = (color, text) => (theme ? theme.fg(color, text) : text);
  const items = entries.flatMap((entry, index) => ('id' in entry ? [index] : []));
  let selected = Math.max(0, items.findIndex(index => /** @type {{id: string}} */ (entries[index]).id === initial));
  const labelWidth = Math.min(36, Math.max(0, ...entries.map(entry => ('id' in entry && entry.value !== undefined ? visibleWidth(entry.label) : 0))));
  /** @param {string} data @param {string} id @param {...string} fallbacks */
  const is = (data, id, ...fallbacks) => (keys?.matches(data, id) ?? false) || fallbacks.includes(data);
  return {
    render(width) {
      /** @type {string[]} */ const body = [];
      /** @type {number} */ let selectedRow = 0;
      entries.forEach((entry, index) => {
        if (!('id' in entry)) { if (body.length) body.push(''); body.push(fg('muted', entry.section)); return; }
        const current = items[selected] === index;
        if (current) selectedRow = body.length;
        const label = entry.value === undefined ? entry.label : entry.label + ' '.repeat(Math.max(0, labelWidth - visibleWidth(entry.label)));
        const value = entry.value === undefined || entry.value === '' ? '' : `  ${fg(current ? 'accent' : entry.tone === 'warning' ? 'warning' : 'muted', entry.value)}`;
        body.push(`${current ? fg('accent', '→ ') : '  '}${current ? fg('accent', label) : label}${value}`);
      });
      const hint = /** @type {{hint?: string}} */ (entries[items[selected]]).hint;
      const room = Math.max(6, (rows() || 28) - 12 - subtitle.length - (hint ? 3 : 0));
      const start = body.length <= room ? 0 : Math.min(body.length - room, Math.max(0, selectedRow - Math.floor(room / 2)));
      const visible = body.slice(start, start + room);
      if (body.length > room) visible.push(fg('dim', `  (${selected + 1}/${items.length})`));
      if (hint) visible.push('', ...wrapTextWithAnsi(hint, Math.max(10, width - 4)).slice(0, 3).map(line => fg('dim', `  ${line}`)));
      return chrome(visible, width, { title, subtitle, theme, hints: hints(['↑↓', 'navigate'], ['tui.select.confirm', confirm], ['tui.select.cancel', cancel]) });
    },
    handleInput(data) {
      if (is(data, 'tui.select.cancel', '\x1b', 'q') || matchesKey(data, 'ctrl+c')) done(undefined);
      else if (is(data, 'tui.select.up', '\x1b[A', 'k')) selected = (selected - 1 + items.length) % items.length;
      else if (is(data, 'tui.select.down', '\x1b[B', 'j')) selected = (selected + 1) % items.length;
      else if (is(data, 'tui.select.confirm', '\r', '\n')) done(/** @type {{id: string}} */ (entries[items[selected]]).id);
    },
  };
}
/**
 * @param {UIContext} ctx
 * @param {MenuEntry[]} entries
 * @param {{title: string, subtitle?: string[], confirm?: string, cancel?: string, initial?: string}} options
 * @returns {Promise<string | undefined>}
 */
export async function menu(ctx, entries, options) {
  const items = /** @type {{id: string, label: string, value?: string}[]} */ (entries.filter(entry => 'id' in entry));
  if (!items.length) return undefined;
  if (ctx.mode !== 'tui' || typeof ctx.ui.custom !== 'function') {
    const labels = items.map(item => (item.value ? `${item.label}: ${item.value}` : item.label));
    const choice = await ctx.ui.select([options.title, ...(options.subtitle || [])].join('\n'), [...labels, 'Close']);
    return items[labels.indexOf(choice ?? '')]?.id;
  }
  return ctx.ui.custom((tui, theme, keys, done) => {
    const view = createMenuView(entries, { ...options, theme, keys, rows: () => tui.terminal?.rows, done });
    /** @type {import('@earendil-works/pi-tui').Component} */
    const component = { render: width => view.render(width), handleInput(data) { view.handleInput(data); tui.requestRender?.(); }, invalidate() {} };
    return component;
  });
}
/** @param {string} patch @param {Map<string, string | null>} [added] @returns {string} */
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
/** @param {string} line @returns {IndicatorColor | null} */
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
/** @param {ReportView} view @returns {string[]} */
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
/** @typedef {{label: string, action: 'report' | 'diff' | 'yield' | 'reconcile' | 'enable' | 'model' | 'effort' | 'start' | 'pause' | 'resume' | 'cancel' | 'transcript' | 'restart' | 'stop' | 'status' | 'inbox' | 'settings' | 'reload' | 'doctor' | 'more', workerId?: string, section: string, hint: string, value?: string, tone?: PanelColor}} DashboardItem */
/** @param {PairSummary} summary @returns {string[]} */
export function dashboardHeader(summary) {
  const many = summary.workers.length > 1;
  const workers = summary.workers.map(w => {
    const stage = workerStage(summary, w, !!summary.main?.busy, Date.now());
    return [`${many ? `${workerLabel(summary, w.id)} ` : ''}${stage.icon} ${stage.text}`, ...stage.details.map(detail => detail.text).filter(text => !text.startsWith('/pair'))].join(' · ');
  });
  const waiting = summary.waitingReports || 0;
  return [...workers, ...(waiting ? [`◐ ${waiting} report${waiting === 1 ? '' : 's'} not yet read by Main`] : [])];
}
/** @param {PairSummary} summary @returns {DashboardItem[]} */
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
  if (waiting) items.push({ section: 'Needs you', label: `Deliver ${waiting} waiting report${waiting === 1 ? '' : 's'} to Main`, action: 'yield', hint: 'Send them to Main now, or right after its current work.' });
  if (!summary.enabled) items.push({ section: 'Set up', label: 'Turn Pair on', action: 'enable', value: 'off', tone: 'warning', hint: 'Pair accepts no new work while it is off. This turns it on for new work.' });
  for (const w of summary.workers) {
    if (!hasModel(w)) items.push({ section: 'Set up', label: many ? `Choose a model for ${w.id}` : 'Choose the worker model', action: 'model', workerId: w.id, value: 'not chosen', tone: 'warning', hint: 'Pick the model the worker runs. Main stays on its own model.' });
  }
  for (const w of summary.workers) {
    const section = many ? `Worker · ${w.id}` : 'Worker', task = w.task && !['completed', 'cancelled'].includes(w.task.status) ? w.task : null;
    if (hasModel(w)) items.push({ section, label: 'Model', action: 'model', workerId: w.id, value: w.model, hint: `Change the worker model. ${w.pid ? 'A running worker switches at its next restart.' : 'Main stays on its own model.'}` });
    items.push({ section, label: 'Effort', action: 'effort', workerId: w.id, value: w.effort, hint: 'Change the thinking effort, from the levels the worker model supports.' });
    if (task?.status === 'running') items.push({ section, label: 'Pause', action: 'pause', workerId: w.id, hint: 'Abort the current step and hold the task.' });
    if (task && ['paused', 'interrupted'].includes(task.status)) items.push({ section, label: 'Resume', action: 'resume', workerId: w.id, hint: 'Continue the held task after checking interrupted work.' });
    if (!w.pid && /^EXIT_UNCONFIRMED/.test(w.error || '')) items.push({ section: 'Needs you', label: `Reconcile ${w.id}`, action: 'reconcile', workerId: w.id, tone: 'warning', hint: 'Prove the previous worker process exited (or stop it), so the worker can be used again.' });
    if (task) items.push({ section, label: 'Cancel task', action: 'cancel', workerId: w.id, hint: 'End the task. The conversation and file changes are kept.' });
    if (w.sessionId) items.push({ section, label: 'Transcript', action: 'transcript', workerId: w.id, hint: "Read the worker's recent conversation." });
    if (w.pid) items.push({ section, label: 'Stop worker', action: 'stop', workerId: w.id, hint: 'Stop the worker process. Its conversation is kept for next time.' });
    else items.push({ section, label: 'Start worker', action: 'start', workerId: w.id, hint: !hasModel(w) ? 'Choose a worker model in Settings first.'
      : w.workspaceGit === false ? `${w.cwd} is not in a Git repository. Open Pi in a Git project, or set the worker workspace in Settings → Advanced.` : 'Launch the worker process. No model turn is requested.' });
  }
  items.push({ section: 'Pair', label: 'Status', action: 'status', hint: 'Worker, task, Main and cache details.' },
    { section: 'Pair', label: 'Inbox', action: 'inbox', hint: 'Reports Main has not read yet.' },
    { section: 'Pair', label: 'Settings', action: 'settings', hint: 'Worker model, review policy, indicator and more.' },
    { section: 'Pair', label: 'More…', action: 'more', hint: 'Restart the worker, reload configuration, run doctor.' });
  return items;
}
/** @param {PairSummary} summary @returns {DashboardItem[]} */
export function dashboardMoreItems(summary) {
  const many = summary.workers.length > 1;
  return [...summary.workers.map(w => /** @type {DashboardItem} */ ({ section: 'Maintenance', label: many ? `Restart worker (${w.id})` : 'Restart worker', action: 'restart', workerId: w.id, hint: 'Reread settings and replace the worker process. Its conversation is kept.' })),
    { section: 'Maintenance', label: 'Reload configuration', action: 'reload', hint: 'Reread saved Pair settings without restarting Main or starting a worker.' },
    { section: 'Maintenance', label: 'Doctor', action: 'doctor', hint: 'Check Fabric, Fovea and Pair setup. No inference.' }];
}
/** @param {DashboardItem[]} items @returns {MenuEntry[]} */
export function dashboardMenu(items) {
  return items.flatMap((item, i) => [...(i === 0 || items[i - 1].section !== item.section ? [{ section: item.section }] : []), { id: String(i), label: item.label, value: item.value, tone: item.tone, hint: item.hint }]);
}
/** @typedef {{workerId: string, reportId: string, status: string, observedAt?: number, view?: ReportView | null}} InboxEntry */
/** @param {InboxEntry[]} entries @param {boolean} autoDeliver @returns {string} */
export function inboxText(entries, autoDeliver) {
  /** @param {string} key @param {string} value */
  const row = (key, value) => `  ${key.padEnd(8)}  ${value}`;
  const how = autoDeliver ? '> Automatic delivery is on: each report reaches Main when its current work is done (at once if Main is idle).'
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
/**
 * @param {{main: {model?: {provider: string, id: string} | null, thinkingLevel?: unknown, trusted?: boolean, capabilities: {fabric: boolean, fovea: boolean, pairReport: boolean}, versions: {fabric?: unknown, fovea?: unknown}}, pair: PairSummary, configuration: {version?: unknown, scope?: unknown, pendingMigrations?: readonly unknown[]}, blockers: string[], raw: unknown, notes?: string[]}} data
 * @returns {string}
 */
export function doctorText({ main, pair, configuration, blockers, raw, notes = [] }) {
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
    check(pair.enabled, pair.enabled ? 'enabled for new work' : 'disabled for new work; turn it on in /pair settings'),
    ...notes.map(note => check(false, note)), '',
    '## Workers', ...pair.workers.flatMap(w => [check(hasModel(w), `${w.id}: ${hasModel(w) ? `${w.model} · ${w.status.replace(/_/g, ' ')}` : 'no model chosen'}`),
      check(w.workspaceGit !== false, w.workspaceGit === false ? `${w.id}: ${w.cwd} is not in a Git repository` : `${w.id}: workspace is a Git repository`)]), '',
    '## Raw data', '> For bug reports.', ...JSON.stringify(raw, null, 2).split('\n').map(line => `    ${line}`)];
  return lines.join('\n');
}
/**
 * @template {string} Value
 * @param {UIContext} ctx
 * @param {string} title
 * @param {readonly {value: Value, hint?: string}[]} options
 * @param {Value} [current]
 * @returns {Promise<Value | undefined>}
 */
async function chooseValue(ctx, title, options, current) {
  const id = await menu(ctx, options.map(option => ({ id: option.value, label: `${option.value === current ? '✓' : ' '} ${option.value}`, hint: option.hint })),
    { title, initial: current, confirm: 'choose', cancel: 'back' });
  return options.find(option => option.value === id)?.value;
}
/** @param {boolean} value @returns {string} */
function onOff(value) { return value ? 'On' : 'Off'; }
/** @type {Readonly<Record<import('./config.js').Indicator, string>>} */
const INDICATOR_LABEL = { minimal: 'status line + current plan step', compact: 'status line only', off: 'hidden' };

/** @typedef {Readonly<{optional?: boolean, scale?: number, accepts: (value: number) => boolean, expected: string}>} NumberInputOptions */
/**
 * @overload
 * @param {UIContext} ctx
 * @param {string} title
 * @param {number} current
 * @param {NumberInputOptions & {optional?: false}} options
 * @returns {Promise<number>}
 */
/**
 * @overload
 * @param {UIContext} ctx
 * @param {string} title
 * @param {number | null} current
 * @param {NumberInputOptions & {optional: true}} options
 * @returns {Promise<number | null>}
 */
/**
 * @param {UIContext} ctx
 * @param {string} title
 * @param {number | null} current
 * @param {NumberInputOptions} options
 * @returns {Promise<number | null>}
 */
async function numberInput(ctx, title, current, { optional = false, scale = 1, accepts, expected }) {
  const placeholder = current == null ? 'none' : String(current / scale);
  const input = await ctx.ui.input(`${title} (blank keeps current${optional ? '; none/off disables' : ''})`, placeholder);
  const text = input?.trim();
  if (!text || text === placeholder) return current;
  if (optional && /^(none|off)$/i.test(text)) return null;
  const value = Number(text) * scale;
  assert(Number.isFinite(value) && accepts(value), `${title}: ${expected}`);
  return value;
}
/** @typedef {{id: string, provider: string, name?: string, reasoning?: boolean, thinkingLevelMap?: Partial<Record<string, string | null>>}} EffortModel */
/** @param {EffortModel} model @returns {import('./contracts.js').Effort[]} */
export function supportedEfforts(model) {
  if (!model.reasoning) return ['off'];
  return EFFORT_LEVELS.filter(level => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    return level === 'xhigh' || level === 'max' ? mapped !== undefined : true;
  });
}
/** @param {EffortModel} model @param {import('./contracts.js').Effort} effort @returns {import('./contracts.js').Effort} */
export function clampEffort(model, effort) {
  const levels = supportedEfforts(model), at = EFFORT_LEVELS.indexOf(effort);
  if (levels.includes(effort)) return effort;
  return EFFORT_LEVELS.slice(at + 1).find(level => levels.includes(level)) || EFFORT_LEVELS.slice(0, Math.max(0, at)).reverse().find(level => levels.includes(level)) || levels[0] || 'off';
}
/** @param {UIContext} ctx @param {import('./contracts.js').WorkerSpec} worker @returns {EffortModel | undefined} */
function workerModel(ctx, worker) {
  return worker.provider && worker.model ? ctx.modelRegistry?.find(worker.provider, worker.model) : undefined;
}
/** @param {UIContext} ctx @param {import('./contracts.js').WorkerSpec} worker @returns {Promise<void>} */
async function pickEffort(ctx, worker) {
  const known = workerModel(ctx, worker), levels = known ? supportedEfforts(known) : EFFORT_LEVELS;
  /** @param {import('./contracts.js').Effort} level */
  const hint = level => {
    if (!known) return 'The worker model is not chosen or not in the registry, so this is checked when the worker starts.';
    const sent = known.thinkingLevelMap?.[level];
    return typeof sent === 'string' && sent !== level ? `Sent to ${known.provider} as "${sent}".` : `Supported by ${known.provider}/${known.id}.`;
  };
  worker.effort = await chooseValue(ctx, `Worker effort · ${known ? `${known.provider}/${known.id}` : 'model not chosen'}`, levels.map(value => ({ value, hint: hint(value) })), worker.effort) || worker.effort;
}
/**
 * @param {UIContext} ctx
 * @param {import('./config.js').PairConfig} config
 * @param {string} workerId
 * @returns {Promise<import('./config.js').PairConfig | undefined>}
 */
export async function chooseWorkerModel(ctx, config, workerId) {
  const next = clone(config), w = next.workers.find(worker => worker.id === workerId) || next.workers[0];
  const before = JSON.stringify(w);
  await pickModel(ctx, w);
  return JSON.stringify(w) === before ? undefined : validateConfig(next);
}
/**
 * @param {UIContext} ctx
 * @param {import('./config.js').PairConfig} config
 * @param {string} workerId
 * @returns {Promise<import('./config.js').PairConfig | undefined>}
 */
export async function chooseWorkerEffort(ctx, config, workerId) {
  const next = clone(config), w = next.workers.find(worker => worker.id === workerId) || next.workers[0];
  const before = w.effort;
  await pickEffort(ctx, w);
  return w.effort === before ? undefined : validateConfig(next);
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
          const inner = Math.max(1, width - 2);
          return chrome([...input.render(inner), '', ...list.render(inner)], width, { title: 'Worker model', subtitle: ['Main stays on its own model; change it with /model.'], theme,
            hints: hints(['↑↓', 'navigate'], ['type', 'filter'], ['tui.select.confirm', 'choose'], ['tui.select.cancel', 'cancel']) });
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
    answer = await ctx.ui.select(title, models.map(m => `${m.provider}/${m.id}`));
  }
  const model = models.find(m => `${m.provider}/${m.id}` === answer);
  if (model) {
    worker.provider = model.provider; worker.model = model.id;
    const effort = clampEffort(model, worker.effort);
    if (effort !== worker.effort) ctx.ui.notify(`Worker effort changed from ${worker.effort} to ${effort}: ${model.provider}/${model.id} supports ${supportedEfforts(model).join(', ')}.`, 'info');
    worker.effort = effort;
  }
}
/**
 * @param {import('@earendil-works/pi-coding-agent').ExtensionCommandContext} ctx
 * @param {import('./config.js').PairConfig} original
 * @param {import('./config.js').ConfigScope} initialScope
 * @param {ApplySettings} onApply
 * @param {SettingsOptions} [options]
 * @returns {Promise<void>}
 */
export async function settingsUI(ctx, original, initialScope, onApply, options = {}) {
  let saved = clone(original), scope = initialScope, selected = saved.workers[0].id, advanced = false, lastEdited = 4;
  for (;;) {
    const draft = clone(saved);
    const w = draft.workers.find(w => w.id === selected) || draft.workers[0]; selected = w.id;
    const model = w.provider && w.model ? `${w.provider}/${w.model}` : '';
    const known = workerModel(ctx, w), effortOk = !known || supportedEfforts(known).includes(w.effort);
    /** @type {MenuEntry[]} */
    const common = [
      { section: draft.workers.length > 1 ? `Worker · ${w.id}` : 'Worker' },
      { id: '4', label: 'Model', value: model || 'not chosen', tone: model ? undefined : 'warning', hint: 'The model the worker runs. Main stays on its own model (/model).' },
      { id: '5', label: 'Effort', value: effortOk ? w.effort : `${w.effort} (not supported)`, tone: effortOk ? undefined : 'warning',
        hint: known ? `${model} supports ${supportedEfforts(known).join(', ')}.` : 'Thinking effort. Checked against the worker model when it starts.' },
      { id: '8', label: 'Review policy', value: draft.supervision.mode, hint: 'How often Main reviews. Final acceptance is always required.' },
      { section: 'Pair' },
      { id: '1', label: 'Enabled for new work', value: onOff(draft.enabled), tone: draft.enabled ? undefined : 'warning', hint: draft.enabled ? 'Main can delegate implementation to the worker.' : 'Pair accepts no new work while this is off.' },
      { id: '2', label: 'Autostart next session', value: onOff(draft.autoStart), hint: 'Start the worker when a session opens. No model turn is requested.' },
      { id: '14', label: 'Indicator', value: draft.indicator, hint: `${INDICATOR_LABEL[draft.indicator]}. Display only; never affects work.` },
      { id: '18', label: 'Save scope', value: scope, hint: scope === 'global' ? 'Global defaults for every project; project overrides are excluded.' : 'This project: its overrides plus inherited global defaults.' },
      { section: 'More' },
      { id: '20', label: 'Advanced settings…', hint: 'Worker workspace, read-only mode, revision limit, verification commands, extra workers.' }
    ];
    /** @type {MenuEntry[]} */
    const extra = [
      { section: 'Worker' },
      ...(draft.workers.length > 1 ? [{ id: '3', label: 'Selected worker', value: w.id, hint: 'Which worker the settings below apply to.' }] : []),
      { id: '6', label: 'Read-only worker', value: onOff(w.readOnly), hint: 'Read and Fovea tools only. Not supported together with Fabric.' },
      { id: '7', label: 'Workspace', value: w.cwd || 'same as Main', hint: 'Absolute path the worker edits. Blank uses the Main workspace.' },
      { section: 'Review' },
      ...(draft.supervision.mode === 'every-step' ? [{ id: '11', label: 'Step size limit', value: `${draft.supervision.maxStepFiles ?? 5} files`, hint: 'Every-step only: a step that changes more files than this cannot be approved; Main asks for smaller steps.' }] : []),
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
      confirm: 'change', cancel: advanced ? 'back' : 'done', initial: String(lastEdited)
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
      else if (index === 5) await pickEffort(ctx, w);
      else if (index === 6) w.readOnly = !w.readOnly;
      else if (index === 7) { const value = await ctx.ui.input('Worker workspace: absolute path, or blank for Main', w.cwd || ''); if (value !== undefined) w.cwd = value.trim() || null; }
      else if (index === 8) {
        /** @type {readonly {value: import('./contracts.js').ReviewMode, hint: string}[]} */
        const modes = [
          { value: 'final-only', hint: 'Review once after the complete plan. Questions are always allowed.' },
          { value: 'milestones', hint: 'Approve each dispatched plan milestone.' },
          { value: 'every-step', hint: 'Approve each small plan step; a step may change at most the step size limit of files.' }
        ];
        draft.supervision.mode = await chooseValue(ctx, 'Review policy · final acceptance is always required', modes, draft.supervision.mode) || draft.supervision.mode;
      }
      else if (index === 9) draft.supervision.maxRevisions = await numberInput(ctx, 'Revision limit', draft.supervision.maxRevisions, {
        accepts: value => Number.isInteger(value) && value >= 0 && value <= 20, expected: 'enter an integer from 0 to 20.'
      });
      else if (index === 11) draft.supervision.maxStepFiles = await numberInput(ctx, 'Step size limit (files per step)', draft.supervision.maxStepFiles ?? 5, {
        accepts: value => Number.isInteger(value) && value >= 1 && value <= 1000, expected: 'enter an integer from 1 to 1000.'
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

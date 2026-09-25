import { Input, SelectList, matchesKey, truncateToWidth } from '@earendil-works/pi-tui';
import { assert, briefError, cleanText, clone } from './util.js';
import { validateConfig } from './config.js';
import { validateUsageObservation } from './observations.js';

/** @typedef {import('@earendil-works/pi-coding-agent').ExtensionContext} UIContext */
/** @typedef {Readonly<ReturnType<import('./controller.js').PairController['summary']>>} PairSummary */
/** @typedef {(next: import('./config.js').PairConfig, scope: import('./config.js').ConfigScope) => Promise<void>} ApplySettings */

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
export function statusColor(status) {
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
export function flowArrow(status) {
  if (['working', 'settling', 'starting'].includes(status)) return '→';
  if (['question', 'review', 'blocked', 'permission'].includes(status)) return '←';
  return '';
}
/** Without a theme the plain glyph line is returned; with one, each actor token is
 * painted. A flow arrow precedes each worker token: `M● → W◉` while that worker
 * holds the assigned step, `M● ← W◐` while its summary is with Main. While a worker
 * is active, its dot blinks on a two-second heartbeat and an age badge counts up
 * since its last real event; past PULSE_MAX_AGE_MS the blink stops, and past
 * STALE_AGE_MS the badge turns into a stale marker.
 * @param {PairSummary} summary @param {boolean} mainBusy
 * @param {{fg(color: IndicatorColor, text: string): string}} [theme]
 * @param {number} [now]
 * @returns {string} */
export function indicator(summary, mainBusy, theme, now = Date.now()) {
  /** @param {IndicatorColor} color @param {string} text @returns {string} */
  const paint = (color, text) => (theme ? theme.fg(color, text) : text);
  const main = paint(mainBusy ? 'accent' : 'muted', `M${mainBusy ? '◉' : '●'}`);
  const workers = summary.workers.map((w, i) => {
    const color = statusColor(w.status);
    const label = `${summary.workers.length === 1 ? 'W' : `W${i + 1}`}${symbol(w.status)}`;
    const arrow = flowArrow(w.status);
    if (!['working', 'settling', 'starting'].includes(w.status)) return arrow ? `${paint(color, arrow)} ${paint(color, label)}` : paint(color, label);
    const age = activityAge(w, now);
    const pulsing = age <= PULSE_MAX_AGE_MS;
    const dotColor = pulsing && Math.floor(now / 2000) % 2 === 1 ? 'dim' : color;
    const token = arrow ? `${paint(color, arrow)} ${paint(dotColor, label)}` : paint(dotColor, label);
    const badges = [paint(age >= STALE_AGE_MS ? 'error' : pulsing ? 'muted' : 'warning', age >= STALE_AGE_MS ? `stale ${ageLabel(age)}` : ageLabel(age))];
    if (typeof w.observation?.currentTool === 'string' && w.observation.currentTool) badges.push(paint('muted', w.observation.currentTool.slice(0, 40)));
    if (typeof w.task?.reportedCost === 'number' && w.task.reportedCost > 0) badges.push(paint('muted', `$${w.task.reportedCost.toFixed(4)}`));
    const percent = w.observation?.context?.percent;
    if (typeof percent === 'number' && percent > 75) badges.push(paint(percent > 90 ? 'error' : 'warning', `ctx ${Math.round(percent)}%`));
    return `${token} ${badges.join(' ')}`;
  });
  let progress = '';
  const tasked = summary.workers.find(w => Array.isArray(w.task?.stepList) && w.task.stepList.length > 0);
  if (tasked?.task?.stepList?.length) {
    const list = tasked.task.stepList;
    const bar = progressBar(list.filter(step => step.state === 'done').length, list.length);
    progress = ` ${paint('success', '■'.repeat(bar.filled))}${paint('dim', '□'.repeat(bar.empty))} ${paint('muted', bar.label)}`;
  }
  return `${[main, ...workers].join(' ')}${progress}`;
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
/** Per-step completion view of the first worker's active plan; plain text without a
 * theme (for /pair status) and painted with one (for the status-bar widget).
 * @param {PairSummary} summary
 * @param {{fg(color: IndicatorColor, text: string): string}} [theme]
 * @param {number} [maxSteps]
 * @returns {string[]} */
export function taskListLines(summary, theme, maxSteps = 7) {
  const worker = summary.workers.find(w => Array.isArray(w.task?.stepList) && w.task.stepList.length > 0);
  if (!worker?.task?.stepList?.length) return [];
  /** @param {IndicatorColor} color @param {string} text @returns {string} */
  const paint = (color, text) => (theme ? theme.fg(color, text) : text);
  const list = worker.task.stepList;
  const lines = list.slice(0, maxSteps).map((step, i) => paint(stepColor(step.state), `${stepSymbol(step.state)} ${i + 1}. ${step.title}`));
  if (list.length > maxSteps) lines.push(paint('dim', `+ ${list.length - maxSteps} more`));
  return lines;
}
/** Status-bar component: the colored activity line plus, while a plan is active,
 * its step list with per-step completion state. Lines truncate, never wrap.
 * @param {PairSummary} summary @param {boolean} mainBusy
 * @param {{fg(color: IndicatorColor, text: string): string}} theme
 * @param {number} [now]
 * @returns {import('@earendil-works/pi-tui').Component} */
export function indicatorWidget(summary, mainBusy, theme, now = Date.now()) {
  const lines = [indicator(summary, mainBusy, theme, now), ...taskListLines(summary, theme)];
  return {
    render(width) { const span = Math.max(12, width - 2); return lines.map(line => ' ' + truncateToWidth(line, span)); },
    invalidate() {},
  };
}
/** @param {PairSummary} summary @param {Readonly<Awaited<ReturnType<typeof import('./native.js').nativeSettings>>> | null} [native] @returns {string} */
export function statusText(summary, native = null) {
  const lines = ['FABRIC PAIR', '', `Main: ${summary.main?.model || 'native /model'} · ${summary.main?.busy ? 'working' : 'ready'}`, `Owner session: ${summary.ownerSession}`, ''];
  if (summary.main?.context) {
    const c = contextUsage(summary.main.context);
    assert(c, 'Invalid Main context observation');
    lines.push(`Main context: ${c.tokens ?? 'unknown'} / ${c.contextWindow ?? 'unknown'} tokens`);
  }
  const mainUsage = validateUsageObservation(summary.main?.lastUsage ?? null, 'Main last usage');
  if (mainUsage) lines.push(`Main last observed cache read: ${mainUsage.cacheRatio == null ? 'unknown' : (100 * mainUsage.cacheRatio).toFixed(1) + '%'} · ${Math.max(0, Math.floor((Date.now() - mainUsage.observedAt) / 1000))}s ago`);
  lines.push('');
  for (const w of summary.workers) {
    lines.push(`${w.id}: ${w.status} · ${w.model} · effort ${w.effort}`, `  PID: ${w.pid || 'not running'} · session: ${w.sessionId || 'not created'}`, `  Workspace: ${w.cwd}`);
    if (w.task) lines.push(`  ${w.task.id} · ${w.task.status} · step ${w.task.step}/${w.task.steps} · revisions ${w.task.revisions}`, `  ${w.task.objective}`);
    if (w.task && ['working', 'settling', 'starting'].includes(w.status)) { const age = activityAge(w); lines.push(`  Activity: ${ageLabel(age)} since the last worker event${age >= STALE_AGE_MS ? ' — STALE: inspect the transcript or cancel' : ''}`); }
    if (Array.isArray(w.task?.stepList) && w.task.stepList.length > 0) {
      const bar = progressBar(w.task.stepList.filter(step => step.state === 'done').length, w.task.stepList.length);
      lines.push(`  progress ${'■'.repeat(bar.filled)}${'□'.repeat(bar.empty)} ${bar.label} (${bar.percent}%)`);
      for (let i = 0; i < w.task.stepList.length; i++) { const step = w.task.stepList[i]; lines.push(`    ${stepSymbol(step.state)} ${i + 1}. ${step.title}`); }
    }
    const obs = w.observation;
    if (obs?.currentTool) lines.push(`  Tool: ${obs.currentTool}`);
    if (obs?.context) lines.push(`  Context: ${obs.context.tokens ?? 'unknown'} / ${obs.context.contextWindow ?? 'unknown'} tokens${obs.context.percent == null ? '' : ` (${obs.context.percent.toFixed(1)}%)`}${obs.compacting ? ' · compacting' : ''}`);
    if (obs?.lastUsage) lines.push(`  Last observed cache read: ${obs.lastUsage.cacheRatio == null ? 'unknown' : (100 * obs.lastUsage.cacheRatio).toFixed(1) + '%'} · ${Math.max(0, Math.floor((Date.now() - obs.lastUsage.observedAt) / 1000))}s ago`);
    else lines.push('  Cache: no observation for the current context');
    if (w.usage) lines.push(`  Inference only: ${w.usage.requests} responses · reported $${w.usage.reportedCost.toFixed(4)} · ${w.usage.unknownCostRequests} responses with unknown price`);
    if (w.lastExchange) lines.push(`  Last exchange: ${w.lastExchange.direction} · ${w.lastExchange.kind}`);
    if (w.pendingConfiguration) lines.push('  Settings change pending: applied before the next new task while this worker is idle.');
    if (w.error) lines.push(`  ATTENTION: ${w.error}`);
    lines.push('');
  }
  if (native) lines.push(`Native warming policy: ${native.cacheWarming} (provider-dependent; not changed by Pair)`, '');
  lines.push('● ready  ◉ working  ◐ waiting  ○ retained/stopped  ! attention', 'widget colors: main working accent · worker working success · waiting warning · attention error · idle muted', 'widget arrows: → plan/task heading to worker · ← summary/question back with Main', 'plan steps: ✔ done · ▶ in progress · ◐ in review · ⏸ held · ○ not started · ■/□ progress (approved/total)', 'worker liveness: age badge counts up since the last worker event · heartbeat blink stops after 2m silence · stale after 5m', 'widget badges: current tool while running · task cost · ctx pressure above 75% (error above 90%) · one stale toast per silent episode', '', summary.cacheNote, '', `Local state and evidence: ${summary.directory}`);
  return lines.map(s => cleanText(s, 20000)).join('\n');
}
/** @param {UIContext} ctx @param {string} title @param {string} text @returns {Promise<void>} */
export async function textView(ctx, title, text) {
  if (ctx.mode !== 'tui' || typeof ctx.ui.custom !== 'function') { ctx.ui.notify(`${title}\n${cleanText(text, 10000)}`, 'info'); return; }
  const raw = cleanText(text, 100000).split('\n');
  await ctx.ui.custom((_tui, _theme, _keys, done) => {
    let offset = 0, width = 80;
    const wrapped = () => raw.flatMap(line => {
      const lines = []; const chars = Array.from(line); const span = Math.max(20, width - 4);
      if (!chars.length) return [''];
      for (let i = 0; i < chars.length; i += span) lines.push(chars.slice(i, i + span).join(''));
      return lines;
    });
    /** @type {import('@earendil-works/pi-tui').Component} */
    const component = {
      render(w) { width = w; const all = wrapped(); return [cleanText(title), '↑/↓ scroll · PgUp/PgDn · Esc/Enter close', '', ...all.slice(offset, offset + 20), '', `${offset + 1}–${Math.min(offset + 20, all.length)} / ${all.length}`]; },
      handleInput(data) {
        if (['\x1b', '\r', '\n', 'q'].includes(data)) return done(undefined);
        if (data === '\x1b[A' || data === 'k') offset = Math.max(0, offset - 1);
        if (data === '\x1b[B' || data === 'j') offset = Math.min(Math.max(0, wrapped().length - 1), offset + 1);
        if (data === '\x1b[5~') offset = Math.max(0, offset - 20);
        if (data === '\x1b[6~') offset = Math.min(Math.max(0, wrapped().length - 1), offset + 20);
        _tui.requestRender?.();
      }, invalidate() {}
    };
    return component;
  }, { overlay: true });
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

/** @overload @param {UIContext} ctx @param {string} title @param {number} current @param {Readonly<{optional?: false, integer?: boolean}>} [options] @returns {Promise<number>} */
/** @overload @param {UIContext} ctx @param {string} title @param {number | null} current @param {Readonly<{optional: true, integer?: boolean}>} options @returns {Promise<number | null>} */
/** @param {UIContext} ctx @param {string} title @param {number | null} current @param {Readonly<{optional?: boolean, integer?: boolean}>} [options] @returns {Promise<number | null>} */
async function numberInput(ctx, title, current, { optional = false, integer = true } = {}) {
  const input = await ctx.ui.input(title, current == null ? 'none' : String(current));
  if (input === undefined) return current;
  if (optional && /^(none|off|)$/i.test(input.trim())) return null;
  const value = Number(input); assert(Number.isFinite(value) && (!integer || Number.isInteger(value)) && value > 0, 'Enter a positive number'); return value;
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
 * @param {ApplySettings} onApply @returns {Promise<void>}
 */
export async function settingsUI(ctx, original, initialScope, onApply) {
  const draft = clone(original); let scope = initialScope, selected = draft.workers[0].id;
  for (;;) {
    const w = draft.workers.find(w => w.id === selected) || draft.workers[0]; selected = w.id;
    const rows = [
      `Main: ${ctx.model?.provider || ''}/${ctx.model?.id || 'not selected'} (use /model)`,
      `Enabled for new work: ${draft.enabled}`, `Autostart: ${draft.autoStart}`, `Selected worker: ${w.id}`,
      `Worker model: ${w.provider}/${w.model || '(choose)'}`, `Worker effort: ${w.effort}`, `Read-only worker: ${w.readOnly}`, `Workspace: ${w.cwd || '(Main workspace)'}`,
      `Review policy: ${draft.supervision.mode}`, `Revision limit: ${draft.supervision.maxRevisions}`, `Summary detail: ${draft.supervision.summaryDetail}`,
      `Turn limit per step: ${draft.limits.maxTurnsPerStep}`, `Task timeout (minutes): ${draft.limits.taskTimeoutMs / 60000}`, `Reported inference budget (USD): ${draft.limits.maxReportedCostUsd ?? 'none'}`,
      `Indicator: ${draft.indicator}`, `Preserved slot limit (V1 live limit: 1): ${draft.maxWorkers}`, 'Add worker',
      `Verification commands: ${draft.verification.commands.length} (human-owned)`, `Save scope: ${scope}`, 'Apply', 'Cancel'
    ];
    const choice = await ctx.ui.select('Fabric Pair settings · changes apply at safe boundaries', rows);
    if (choice === undefined || choice === 'Cancel') return;
    const index = rows.indexOf(choice);
    try {
      if (index === 0) ctx.ui.notify('Use Pi’s native /model and effort controls for Main.', 'info');
      else if (index === 1) draft.enabled = !draft.enabled;
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
      else if (index === 9) { const input = await ctx.ui.input('Revision limit (0–20)', String(draft.supervision.maxRevisions)); if (input !== undefined) draft.supervision.maxRevisions = Number(input); }
      else if (index === 10) draft.supervision.summaryDetail = await selectValue(ctx.ui, 'Worker summary detail', ['minimal', 'normal', 'detailed']) || draft.supervision.summaryDetail;
      else if (index === 11) draft.limits.maxTurnsPerStep = await numberInput(ctx, 'Maximum turns per step', draft.limits.maxTurnsPerStep);
      else if (index === 12) draft.limits.taskTimeoutMs = 60000 * await numberInput(ctx, 'Task timeout in minutes', draft.limits.taskTimeoutMs / 60000, { integer: false });
      else if (index === 13) draft.limits.maxReportedCostUsd = await numberInput(ctx, 'Inference-only reported USD budget (none disables; excludes native warming/unknown prices)', draft.limits.maxReportedCostUsd, { optional: true, integer: false });
      else if (index === 14) draft.indicator = await selectValue(ctx.ui, 'Indicator (rendering only)', ['minimal', 'off']) || draft.indicator;
      else if (index === 15) draft.maxWorkers = await numberInput(ctx, 'Preserved slot limit (1–8; V1 activates one)', draft.maxWorkers);
      else if (index === 16) {
        const id = await ctx.ui.input('New worker ID (letters, digits, hyphens, underscores)');
        if (id) { draft.workers.push({ id, provider: '', model: '', effort: 'medium', cwd: null, readOnly: false }); selected = id; }
      }
      else if (index === 17) {
        const edited = await ctx.ui.editor('Trusted verification argv, run locally at checkpoints. Example: [{"name":"tests","command":"npm","args":["test"]}]', JSON.stringify(draft.verification.commands, null, 2));
        if (edited !== undefined) {
          /** @type {unknown} */ const commands = JSON.parse(edited);
          if (await ctx.ui.confirm('Authorize verification commands', 'These commands execute automatically at review checkpoints with your OS permissions. Only add commands you trust.')) {
            // Validate just the edited section, not unrelated in-progress fields.
            draft.verification.commands = validateConfig({ verification: { ...draft.verification, commands } }).verification.commands;
          }
        }
      }
      else if (index === 18) scope = await selectValue(ctx.ui, 'Save scope', ctx.isProjectTrusted?.() ? ['project', 'global'] : ['global']) || scope;
      else if (index === 19) { await onApply(validateConfig(draft), scope); return; }
    } catch (error) { ctx.ui.notify(briefError(error), 'error'); }
  }
}

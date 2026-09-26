import { Input, SelectList, matchesKey, truncateToWidth } from '@earendil-works/pi-tui';
import { assert, briefError, cleanText, clone } from './util.js';
import { validateConfig } from './config.js';
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
/** Compact whole-unit duration for budget badges: seconds below a minute, minutes above.
 * @param {number} ms @returns {string} */
export function minutesLabel(ms) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
}
/** Bounded, enforced task budgets — elapsed time against taskTimeoutMs and turns
 * against maxTurnsPerStep — the only in-step progress that can be measured
 * honestly before a checkpoint is approved. Colors escalate past 75%/90%.
 * @param {{startedAt?: number, turns?: number, turnLimit?: number, timeoutMs?: number}} task
 * @param {(color: IndicatorColor, text: string) => string} paint @param {number} [now]
 * @returns {string[]} */
export function budgetBadges(task, paint, now = Date.now()) {
  const badges = [];
  if (typeof task.timeoutMs === 'number' && task.timeoutMs > 0 && typeof task.startedAt === 'number' && task.startedAt > 0) {
    const elapsed = Math.max(0, now - task.startedAt), ratio = elapsed / task.timeoutMs;
    badges.push(paint(ratio > 0.9 ? 'error' : ratio > 0.75 ? 'warning' : 'muted', `${minutesLabel(elapsed)}/${minutesLabel(task.timeoutMs)}`));
  }
  if (typeof task.turns === 'number' && typeof task.turnLimit === 'number' && task.turnLimit > 0) {
    const ratio = task.turns / task.turnLimit;
    badges.push(paint(ratio > 0.9 ? 'error' : ratio > 0.75 ? 'warning' : 'muted', `${task.turns}/${task.turnLimit} turns`));
  }
  return badges;
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
    badges.push(...budgetBadges(w.task || {}, paint, now));
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
/** Last measured request only, never cumulative usage or a residency estimate.
 * Legacy zero-input diagnostics may still have an age but no cache-read share.
 * @param {unknown} value @param {number} now @returns {string} */
function lastCacheRead(value, now) {
  const usage = validateUsageObservation(value, 'Last cache-read usage');
  if (!usage) return 'unknown';
  const percent = usage.cacheRatio === null ? 'unknown' : `${(100 * usage.cacheRatio).toFixed(1)}%`;
  return `${percent} ${ageLabel(Math.max(0, now - usage.observedAt))} ago`;
}
/** Stable role labels follow the activity line and configured worker order.
 * Cache values are neutral observations, not success/error thresholds.
 * Unknown shares are omitted; labels are assigned before filtering.
 * @param {PairSummary} summary
 * @param {{fg(color: IndicatorColor, text: string): string}} theme
 * @param {number} now @returns {string | null} */
function cacheReadLine(summary, theme, now) {
  const actors = [{ label: 'M', usage: summary.main?.lastUsage ?? null },
    ...summary.workers.map((w, i) => ({ label: summary.workers.length === 1 ? 'W' : `W${i + 1}`, usage: w.observation?.lastUsage ?? null }))]
    .flatMap(({ label, usage }) => {
      const observed = validateUsageObservation(usage, 'Last cache-read usage');
      return observed?.cacheRatio == null ? [] : [`${label} ${lastCacheRead(observed, now)}`];
    });
  return actors.length === 0 ? null : theme.fg('dim', 'Cache read (last): ') + actors.map(actor => theme.fg('muted', actor)).join(theme.fg('dim', ' · '));
}
/** Status-bar component: activity, last-request cache observations, and, while a
 * plan is active, its step list. Lines truncate, never wrap.
 * @param {PairSummary} summary @param {boolean} mainBusy
 * @param {{fg(color: IndicatorColor, text: string): string}} theme
 * @param {number} [now]
 * @returns {import('@earendil-works/pi-tui').Component} */
export function indicatorWidget(summary, mainBusy, theme, now = Date.now()) {
  const cache = cacheReadLine(summary, theme, now);
  const lines = [indicator(summary, mainBusy, theme, now), ...(cache === null ? [] : [cache]), ...taskListLines(summary, theme)];
  return {
    render(width) { const span = Math.max(0, width - 2); return lines.map(line => width > 0 ? ' ' + truncateToWidth(line, span) : ''); },
    invalidate() {},
  };
}
/** @param {PairSummary} summary @param {Readonly<Awaited<ReturnType<typeof import('./native.js').nativeSettings>>> | null} [native] @param {number} [now] @returns {string} */
export function statusText(summary, native = null, now = Date.now()) {
  const lines = ['FABRIC PAIR', '', `Main: ${summary.main?.model || 'native /model'} · ${summary.main?.busy ? 'working' : 'ready'}`, `Owner session: ${summary.ownerSession}`, ''];
  if (summary.main?.context) {
    const c = contextUsage(summary.main.context);
    assert(c, 'Invalid Main context observation');
    lines.push(`Main context: ${c.tokens ?? 'unknown'} / ${c.contextWindow ?? 'unknown'} tokens`);
  }
  lines.push(`Pair scoped warming policy: ${summary.cacheWarming || 'off'} (explicit opt-in; native safety windows unchanged)`, `Main scoped warming: ${warmingLabel(summary.main?.warming)}`);
  lines.push(`Main last observed cache read: ${lastCacheRead(summary.main?.lastUsage ?? null, now)}`);
  lines.push('');
  for (const w of summary.workers) {
    lines.push(`${w.id}: ${w.status} · ${w.model} · effort ${w.effort}`, `  PID: ${w.pid || 'not running'} · session: ${w.sessionId || 'not created'}`, `  Workspace: ${w.cwd}`);
    if (w.task) lines.push(`  ${w.task.id} · ${w.task.status} · step ${w.task.step}/${w.task.steps} · revisions ${w.task.revisions}`, `  ${w.task.objective}`);
    if (w.task && ['working', 'settling', 'starting'].includes(w.status)) { const age = activityAge(w, now); lines.push(`  Activity: ${ageLabel(age)} since the last worker event${age >= STALE_AGE_MS ? ' — STALE: inspect the transcript or cancel' : ''}`); }
    if (w.task && typeof w.task.startedAt === 'number' && typeof w.task.timeoutMs === 'number' && typeof w.task.turns === 'number' && typeof w.task.turnLimit === 'number') lines.push(`  Budgets: ${minutesLabel(Math.max(0, now - w.task.startedAt))} of ${minutesLabel(w.task.timeoutMs)} elapsed · ${w.task.turns}/${w.task.turnLimit} turns`);
    if (Array.isArray(w.task?.stepList) && w.task.stepList.length > 0) {
      const bar = progressBar(w.task.stepList.filter(step => step.state === 'done').length, w.task.stepList.length);
      lines.push(`  progress ${'■'.repeat(bar.filled)}${'□'.repeat(bar.empty)} ${bar.label} (${bar.percent}%)`);
      for (let i = 0; i < w.task.stepList.length; i++) { const step = w.task.stepList[i]; lines.push(`    ${stepSymbol(step.state)} ${i + 1}. ${step.title}`); }
    }
    const obs = w.observation;
    if (obs?.currentTool) lines.push(`  Tool: ${obs.currentTool}`);
    if (obs?.context) lines.push(`  Context: ${obs.context.tokens ?? 'unknown'} / ${obs.context.contextWindow ?? 'unknown'} tokens${obs.context.percent == null ? '' : ` (${obs.context.percent.toFixed(1)}%)`}${obs.compacting ? ' · compacting' : ''}`);
    lines.push(`  Last reported scoped warming: ${warmingLabel(obs && 'warming' in obs ? obs.warming : undefined)}`);
    lines.push(`  Last observed cache read: ${lastCacheRead(obs?.lastUsage ?? null, now)}`);
    if (w.usage) lines.push(`  Inference only: ${w.usage.requests} responses · reported $${w.usage.reportedCost.toFixed(4)} · ${w.usage.unknownCostRequests} responses with unknown price`);
    if (w.lastExchange) lines.push(`  Last exchange: ${w.lastExchange.direction} · ${w.lastExchange.kind}`);
    if (w.pendingConfiguration) lines.push('  Settings change pending: applied before the next new task while this worker is idle.');
    if (w.error) lines.push(`  ATTENTION: ${w.error}`);
    lines.push('');
  }
  if (native) lines.push(`Native warming policy: ${native.cacheWarming} (persisted base policy; scoped leases/other owners may differ)`, '');
  lines.push('● ready  ◉ working  ◐ waiting  ○ retained/stopped  ! attention', 'widget colors: main working accent · worker working success · waiting warning · attention error · idle muted', 'widget arrows: → plan/task heading to worker · ← summary/question back with Main', 'cache read (last): M Main · W/W1/W2 configured workers in order · cacheRead/(input+cacheRead+cacheWrite) for the last measured request, not task totals · zero-input events do not replace a measured sample · unknown means no measurement · age is observation age, not provider TTL or cache residency', 'plan steps: ✔ done · ▶ in progress · ◐ in review · ⏸ held · ○ not started · ■/□ progress (approved/total)', 'worker liveness: age badge counts up since the last worker event · heartbeat blink stops after 2m silence · stale after 5m', 'widget badges: current tool while running · time/turn budgets (warn past 75% of their limits, error past 90%) · task cost · ctx pressure above 75% · one stale toast per silent episode', '', summary.cacheNote, '', `Local state and evidence: ${summary.directory}`);
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
      { id: 1, label: `Enabled for new work: ${draft.enabled}` },
      { id: 4, label: `Worker model: ${w.provider}/${w.model || '(choose)'}` },
      { id: 5, label: `Worker effort: ${w.effort}` },
      { id: 8, label: `Review policy: ${draft.supervision.mode}` },
      { id: 2, label: `Autostart next session: ${draft.autoStart}` },
      { id: 14, label: `Indicator: ${draft.indicator} (UI only)` },
      { id: 18, label: `Save scope: ${scope}` },
      { id: 20, label: 'Advanced…' }, { id: 21, label: 'Done' }
    ];
    const extra = [
      { id: 3, label: `Selected worker: ${w.id}` },
      { id: 6, label: `Read-only worker: ${w.readOnly}` },
      { id: 7, label: `Workspace: ${w.cwd || '(Main workspace)'}` },
      { id: 9, label: `Revision limit: ${draft.supervision.maxRevisions}` },
      { id: 10, label: `Summary detail: ${draft.supervision.summaryDetail}` },
      { id: 11, label: `Turn limit per step: ${draft.limits.maxTurnsPerStep}` },
      { id: 12, label: `Task timeout (minutes): ${draft.limits.taskTimeoutMs / 60000}` },
      { id: 13, label: `Reported inference budget (USD): ${draft.limits.maxReportedCostUsd ?? 'none'}` },
      { id: 15, label: `Preserved slot limit (V1 live limit: 1): ${draft.maxWorkers}` },
      { id: 16, label: 'Add worker' },
      { id: 17, label: `Verification commands: ${draft.verification.commands.length} (human-owned)` },
      ...(options.migrate ? [{ id: 22, label: 'Review/migrate selected scope…' }] : []),
      { id: 20, label: 'Back' }, { id: 21, label: 'Done' }
    ];
    const rows = advanced ? extra : common;
    const title = `Fabric Pair settings${advanced ? ' · Advanced' : ''} · autosave · ${scope === 'global' ? 'global defaults (project overrides excluded)' : 'project overrides + inherited defaults'}\nMain: ${ctx.model?.provider || ''}/${ctx.model?.id || 'not selected'} (use /model)`;
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
      else if (index === 11) draft.limits.maxTurnsPerStep = await numberInput(ctx, 'Maximum turns per step', draft.limits.maxTurnsPerStep, {
        accepts: value => Number.isSafeInteger(value) && value > 0, expected: `enter a positive safe integer (1–${Number.MAX_SAFE_INTEGER}).`
      });
      else if (index === 12) draft.limits.taskTimeoutMs = await numberInput(ctx, 'Task timeout in minutes', draft.limits.taskTimeoutMs, {
        scale: 60000, accepts: value => Number.isSafeInteger(value) && value > 0,
        expected: `enter positive finite minutes resolving to whole milliseconds (1–${Number.MAX_SAFE_INTEGER} ms).`
      });
      else if (index === 13) draft.limits.maxReportedCostUsd = await numberInput(ctx, 'Inference-only reported USD budget (excludes native warming/unknown prices)', draft.limits.maxReportedCostUsd, {
        optional: true, accepts: value => value > 0, expected: 'enter a finite USD amount greater than 0, or none/off to disable.'
      });
      else if (index === 14) draft.indicator = await selectValue(ctx.ui, 'Indicator (rendering only)', ['minimal', 'off']) || draft.indicator;
      else if (index === 15) draft.maxWorkers = await numberInput(ctx, 'Preserved slot limit (V1 activates one)', draft.maxWorkers, {
        accepts: value => Number.isInteger(value) && value >= 1 && value <= 8, expected: 'enter an integer from 1 to 8.'
      });
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

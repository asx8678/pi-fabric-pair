import { Box, Input, SelectList, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { keyHint, keyText, rawKeyHint } from '@earendil-works/pi-coding-agent';
import { assert, briefError, cleanText, clone } from './util.js';
import { INDICATORS, validateConfig } from './config.js';
import { EFFORT_LEVELS } from './contracts.js';
import { validateUsageObservation } from './observations.js';
import { DEFAULT_CACHE_LIFETIME_S, FABRIC_CACHE_VERSION } from './native.js';

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

/**
 * @template {string} C
 * @param {{fg(color: C, text: string): string} | null | undefined} theme
 * @returns {(color: C, text: string) => string}
 */
function painter(theme) { return (color, text) => (theme ? theme.fg(color, text) : text); }
/**
 * @param {{render(width: number): string[], handleInput(data: string): void}} view
 * @param {{requestRender?(): void}} tui
 * @returns {import('@earendil-works/pi-tui').Component}
 */
function viewComponent(view, tui) { return { render: width => view.render(width), handleInput(data) { view.handleInput(data); tui.requestRender?.(); }, invalidate() {} }; }

/** @param {string} status @returns {string} */
export function symbol(status) {
  if (['working', 'settling', 'starting'].includes(status)) return '◉';
  if (['question', 'review', 'blocked', 'permission'].includes(status)) return '◐';
  if (['attention', 'error', 'interrupted'].includes(status)) return '!';
  if (status === 'ready') return '●';
  return '○';
}
/** @typedef {'accent' | 'success' | 'warning' | 'error' | 'muted' | 'dim' | 'text'} IndicatorColor */

const STALE_AGE_MS = 300000;
/** How long a finished task keeps its ✔ badge before settling to “ready”. */
const DONE_BADGE_MS = 600000;
/** More plan rows than this and the board collapses finished steps into one row. */
const BOARD_ROW_CAP = 8;
/** A board row keeps this much of its step title before its right-hand detail is dropped. */
const ROW_TITLE_MIN = 16;
/** @param {PairSummary['workers'][number]} worker @param {number} [now] @returns {number} */
function activityAge(worker, now = Date.now()) {
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
function costLabel(cost) {
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
  if (worker.status === 'error' && /^EXIT_UNCONFIRMED/.test(worker.error || '')) return '/pair reconcile';
  const held = ['paused', 'interrupted'].includes(worker.status) || ['paused', 'interrupted'].includes(worker.task?.status || '');
  // A crashed or contained worker keeps its generation until an explicit stop; resume refuses before that.
  // A stopped worker with a held task resumes directly: resume starts the process itself.
  if (held) return worker.status === 'error' ? '/pair stop, then /pair resume' : '/pair resume';
  if (['stopped', 'not_started'].includes(worker.status) && !worker.pid) return !hasModel(worker) ? '/pair to set up' : worker.workspaceGit === false ? 'not a Git repo' : '/pair start';
  if (['attention', 'error'].includes(worker.status)) return '/pair';
  return '';
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
/** @typedef {'working' | 'starting' | 'waiting' | 'attention' | 'permission' | 'paused' | 'done' | 'ready' | 'off' | 'setup' | 'stopped'} WorkerStateKind */
/**
 * The one state vocabulary every surface reads (badge, live line, board, dashboard).
 * Pure: identical inputs give identical output at any time phase, so nothing blinks.
 * Badge words are fixed vocabulary, never prose: the badge shares one footer line with every other extension.
 * @typedef {object} WorkerState
 * @property {WorkerStateKind} kind
 * @property {string} icon
 * @property {IndicatorColor} color
 * @property {string} label short badge word ('review', 'idle 6m', 'off')
 * @property {string} text sentence for text views
 * @property {{text: string, color: IndicatorColor}[]} details
 * @property {boolean} active
 * @property {string} [reason] plain reason the human must act
 * @property {string} [next] the command that resolves it
 * @property {number} [step] 1-based
 * @property {number} [steps]
 * @property {string} [title] the current step title
 * @property {number} [startedAt]
 */
/** @param {number} ms @returns {string} */
function compactAge(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 120 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}
/** @param {number} ms @returns {string} */
function elapsedLabel(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}
/**
 * @param {PairSummary} summary
 * @param {PairSummary['workers'][number]} w
 * @param {boolean} mainBusy
 * @param {number} [now]
 * @returns {WorkerState}
 */
export function workerState(summary, w, mainBusy, now = Date.now()) {
  const primary = !summary.workers.length || (planWorker(summary) || summary.workers[0]) === w;
  /** @param {string} text @param {IndicatorColor} [color] */
  const d = (text, color = 'muted') => ({ text, color });
  const t = w.task && !['completed', 'cancelled'].includes(w.task.status) ? w.task : null;
  const step = t ? t.step : undefined, steps = t ? t.steps : undefined;
  const limits = t ? t.limits : undefined;
  // Escalations the worker cannot clear itself; each one is raised into details and the badge reason.
  const alerts = [
    ...(t?.limitNotice ? [{ text: `⚠ ${t.limitNotice}`, color: /** @type {const} */ ('warning') }] : []),
    ...(t && limits?.maxRevisionsPerStep !== null && limits?.maxRevisionsPerStep !== undefined && (t.stepRevisions ?? 0) >= limits.maxRevisionsPerStep ? [{ text: `⚠ step revision limit reached (${t.stepRevisions}/${limits.maxRevisionsPerStep})`, color: /** @type {const} */ ('warning') }] : []),
    ...(t?.lastVerification?.some(check => !check.passed) ? [{ text: `⚠ Pair verification failed: ${t.lastVerification.filter(check => !check.passed).map(check => check.name).join(', ')}`, color: /** @type {const} */ ('warning') }] : [])
  ];
  const title = t ? inline(t.stepList?.find(s => ['active', 'review', 'held'].includes(s.state))?.title, 400) : '';
  const cost = typeof w.task?.reportedCost === 'number' && w.task.reportedCost > 0 ? [d(costLabel(w.task.reportedCost))] : [];
  /** @param {string} doing */
  const withMain = doing => {
    const waiting = summary.waitingReports || 0;
    if (waiting) return d(mainBusy ? 'Main is busy; delivered when its current work is done' : 'delivering to Main');
    return d(mainBusy ? `Main is ${doing}` : 'with Main');
  };
  /**
   * @param {WorkerStateKind} kind @param {string} icon @param {IndicatorColor} color @param {string} label @param {string} text
   * @param {Partial<WorkerState>} [extra]
   * @returns {WorkerState}
   */
  const state = (kind, icon, color, label, text, extra = {}) => ({ kind, icon, color, label, text, details: [], active: false, step, steps, ...(title ? { title } : {}), ...(primary && w.task?.startedAt ? { startedAt: w.task.startedAt } : {}), ...extra });
  // Reports waiting while automatic delivery is off: only the human can hand them to Main.
  const waiting = summary.waitingReports || 0;
  const yieldNeeded = waiting > 0 && summary.autoDeliverReports === false;
  /**
   * Calm states are replaced by the human-needed yield state when reports cannot reach Main by themselves.
   * @template {WorkerState} S @param {S} calm @returns {S | WorkerState}
   */
  const unlessYield = calm => (yieldNeeded ? state('attention', '!', 'warning', `${waiting} report${waiting === 1 ? '' : 's'}`, 'Reports are waiting for Main', {
    details: [d(`${waiting} report${waiting === 1 ? '' : 's'} retained`, 'warning'), d('/pair yield to send them', 'dim')],
    reason: `${waiting} report${waiting === 1 ? '' : 's'} waiting · delivery off`, next: '/pair yield' }) : calm);
  if (!summary.enabled && !t) return state('off', '○', 'dim', 'off', 'Pair off', { details: [d('/pair to turn on', 'dim')] });
  if (!hasModel(w)) return state('setup', '○', 'warning', 'set up', 'Worker not set up', { details: [d('/pair to choose a model', 'dim')], reason: 'no model chosen' });
  if (['error', 'attention'].includes(w.status)) return state('attention', '!', 'error', 'attention', 'Worker needs attention', { details: [...(w.error ? [d(inline(w.error, 80), 'error')] : []), d(nextAction(w) || '/pair', 'dim')], reason: 'worker needs attention', next: nextAction(w) || '/pair' });
  if (w.status === 'permission') return state('permission', '!', 'warning', 'permission', 'Worker is asking for permission', { details: [d('answer the dialog', 'dim')], reason: 'permission dialog', next: 'answer the dialog' });
  if (t?.status === 'activating') return state('starting', '◉', 'accent', 'starting', `Worker starting step ${t.step}/${t.steps}`, { details: [...(title ? [d(title, 'text')] : []), ...cost], active: true });
  if (t && ['running', 'awaiting_settle'].includes(t.status) && ['working', 'settling', 'starting', 'ready'].includes(w.status)) {
    const finishing = t.status === 'awaiting_settle' || w.status === 'settling';
    const verb = finishing ? 'finishing' : t.lastDecision === 'revise' ? 'revising' : t.lastDecision === 'answer' ? 'continuing' : 'working on';
    const age = activityAge(w, now), obs = w.observation, percent = obs?.context?.percent;
    const activity = obs?.compacting ? 'compacting its context' : activityLabel(obs?.currentTool, obs && 'currentTarget' in obs ? /** @type {string | null | undefined} */ (obs.currentTarget) : null);
    const base = { active: true, details: [
      ...(title ? [d(title, 'text')] : []),
      ...(age >= STALE_AGE_MS ? [d(`no activity for ${ageLabel(age)}`, 'warning')] : activity ? [d(activity, 'accent')] : []),
      d(speedLabel(observedSpeed(obs)).replace(/^avg /, '')),
      ...(typeof percent === 'number' && percent > 75 ? [d(`context ${Math.round(percent)}%`, percent > 90 ? 'error' : 'warning')] : []),
      ...cost] };
    // A silent worker needs the human, so it is not merely 'working'.
    if (age >= STALE_AGE_MS) return state('attention', '!', 'warning', `idle ${compactAge(age)}`, `Worker idle ${ageLabel(age)}`, { ...base, reason: `no activity ${compactAge(age)}`, next: '/pair transcript' });
    return unlessYield(state('working', '◉', 'success', verb, `Worker ${verb} step ${t.step}/${t.steps}`, { ...base, details: [...alerts, ...base.details], ...(alerts.length ? { reason: alerts[0].text.replace(/^⚠ /, '') } : {}) }));
  }
  if (t?.status === 'question') return unlessYield(state('waiting', '◐', 'accent', 'question', `Question for Main · step ${t.step}/${t.steps}`, { details: [withMain('answering'), ...cost] }));
  if (t?.status === 'review') return unlessYield(state('waiting', '◐', 'accent', t.reportKind === 'final_review' ? 'final review' : 'review', t.reportKind === 'final_review' ? 'Final review for Main' : `Checkpoint ${t.step}/${t.steps} ready for review`, { details: [...(title ? [d(title, 'text')] : []), withMain('reviewing'), ...alerts, ...cost] }));
  if (t?.status === 'blocked') return unlessYield(state('waiting', '◐', 'accent', 'blocked', `Worker blocked · step ${t.step}/${t.steps}`, { details: [withMain('looking at it'), ...cost] }));
  if (t && ['paused', 'interrupted'].includes(t.status)) return state('paused', '⏸', 'warning', t.status, `Task ${t.status} · step ${t.step}/${t.steps}`, { details: [d(nextAction(w) || '/pair resume', 'dim'), ...cost], reason: `task ${t.status}`, next: nextAction(w) || '/pair resume' });
  if (w.status === 'starting') return state('starting', '◉', 'accent', 'starting', 'Worker starting', { active: true });
  const model = w.model.split('/').pop() || w.model;
  // A finished task keeps its ✔ for a while, then settles to ● ready; the step count is the whole plan.
  if (w.task?.status === 'completed' && (now - (w.task.updatedAt ?? 0)) < DONE_BADGE_MS) return { kind: 'done', icon: '✔', color: 'success', label: 'done', text: 'Task done · all steps approved', details: [d(`${w.task.steps}/${w.task.steps} approved · worker ready`, 'success')], active: false, step: w.task.steps, steps: w.task.steps, ...(w.task.startedAt ? { startedAt: w.task.startedAt } : {}) };
  if (w.pid && w.status === 'ready') return state('ready', '●', 'success', 'ready', 'Worker ready', { details: [d(`${model} · ${w.effort}`)] });
  const next = nextAction(w);
  return state('stopped', '○', 'dim', 'off', 'Worker stopped', { details: next ? [d(next, next === 'not a Git repo' ? 'warning' : 'dim')] : [], ...(next === 'not a Git repo' ? { reason: 'not a Git repo' } : {}) });
}
/**
 * The footer badge: tiny, steady, attention-first. It never carries the step title, because Pi renders
 * every extension's setStatus text on one shared line (\<=24 columns, \<=32 with several workers).
 * @param {PairSummary} summary
 * @param {number} [now]
 * @returns {string}
 */
export function footerBadge(summary, now = Date.now()) {
  const primary = planWorker(summary) || summary.workers[0];
  if (!primary) return 'pair ○ off';
  const busy = !!summary.main?.busy, many = summary.workers.length > 1, cap = many ? 32 : 24;
  const state = workerState(summary, primary, busy, now);
  if (!many) return truncateToWidth(['pair', ...singleBadgeParts(state, now)].join(' '), cap, '…');
  const order = [primary, ...summary.workers.filter(w => w !== primary)];
  /** @type {string[]} */
  const parts = [];
  for (let i = 0; i < order.length; i++) {
    const w = order[i], s = w === primary ? state : workerState(summary, w, busy, now);
    const entry = `${workerLabel(summary, w.id)} ${s.icon}${progressPart(s)}`;
    if (visibleWidth(['pair', ...parts, entry].join(' ')) > cap) { parts.push(`+${order.length - i}`); break; }
    parts.push(entry);
  }
  return truncateToWidth(['pair', ...parts].join(' '), cap, '…');
}
/**
 * The one badge form: steady icon, the step count where a step matters, then one short word.
 * Never the step title: Pi shares this line with every other extension's status text.
 * @param {WorkerState} state
 * @param {number} now
 * @returns {string[]}
 */
function singleBadgeParts(state, now) {
  return [state.icon, progressPart(state), badgeWord(state, now)].filter(part => part.length > 0);
}
/** @param {WorkerState} state @returns {string} */
function progressPart(state) {
  return STEP_KINDS.has(state.kind) && state.step && state.steps ? `${state.step}/${state.steps}` : '';
}
/** Kinds where the step count tells the human something; attention and idle states do not need it. */
const STEP_KINDS = new Set(['working', 'waiting', 'paused', 'done']);
/**
 * @param {WorkerState} state
 * @param {number} now
 * @returns {string}
 */
function badgeWord(state, now) {
  if (state.kind === 'working') {
    // A busy worker shows how long this task has run. Alerts (a failed check, a reached limit) belong to
    // the live line and the dashboard, never to a badge word: the badge is timeless vocabulary.
    return state.startedAt ? compactAge(now - state.startedAt) : 'working';
  }
  if (state.kind === 'attention') return state.reason ? state.label : 'attention';
  if (state.kind === 'waiting') return state.label === 'final review' ? 'final' : state.label;
  if (state.kind === 'stopped' || state.kind === 'off') return 'off';
  return state.label;
}
/**
 * The stage shape the text views, panels and dashboard already consume, derived from workerState.
 * @param {PairSummary} summary
 * @param {PairSummary['workers'][number]} w
 * @param {boolean} mainBusy
 * @param {number} now
 * @returns {{icon: string, color: IndicatorColor, text: string, details: {text: string, color: IndicatorColor}[], active: boolean}}
 */
function workerStage(summary, w, mainBusy, now) {
  const s = workerState(summary, w, mainBusy, now);
  return { icon: s.icon, color: s.color, text: s.text, details: s.details, active: s.active };
}
/**
 * The footer status text: the tiny badge, painted. Kept as the single entry point main.js calls.
 * @param {PairSummary} summary
 * @param {boolean} mainBusy
 * @param {{fg(color: IndicatorColor, text: string): string}} [theme]
 * @param {number} [now]
 * @returns {string}
 */
export function indicator(summary, mainBusy, theme, now = Date.now()) {
  void mainBusy; // workerState recomputes its own busy flag from the summary
  const paint = painter(theme);
  const state = summary.workers.length ? workerState(summary, planWorker(summary) || summary.workers[0], !!summary.main?.busy, now) : null;
  return paint(state ? state.color : 'dim', footerBadge(summary, now));
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
 * Whether a plan still belongs on the live line and the board: a cancelled task leaves at once, a completed
 * one when its ✔ badge settles, so a finished plan never lingers with a running clock.
 * @param {PairSummary['workers'][number]['task'] | undefined} task
 * @param {number} now
 * @returns {boolean}
 */
function taskShown(task, now) {
  if (!task?.stepList?.length || task.status === 'cancelled') return false;
  return task.status !== 'completed' || now - (task.updatedAt ?? 0) < DONE_BADGE_MS;
}
/** @param {PairSummary} summary @param {number} now @returns {PairSummary['workers'][number] | undefined} */
function glanceWorker(summary, now) {
  const first = planWorker(summary);
  return taskShown(first?.task, now) ? first : summary.workers.find(w => taskShown(w.task, now));
}
/** A task's running time; a completed task's clock stops when it finished. @param {{startedAt: number, status: string, updatedAt?: number | null}} task @param {number} now @returns {number} */
function taskElapsed(task, now) { return (task.status === 'completed' && task.updatedAt ? task.updatedAt : now) - task.startedAt; }
/**
 * @param {number} done
 * @param {number} total
 * @param {number} [maxCells]
 * @returns {{filled: number, empty: number, label: string, percent: number}}
 */
function progressBar(done, total, maxCells = 10) {
  const cells = Math.min(Math.max(1, total), Math.max(1, maxCells));
  const filled = total > 0 ? Math.min(cells, Math.round((cells * done) / total)) : 0;
  return { filled, empty: cells - filled, label: `${done}/${total}`, percent: total > 0 ? Math.round((100 * done) / total) : 0 };
}

/** @typedef {'done' | 'active' | 'review' | 'held' | 'todo'} StepState */

/** @param {StepState} state @returns {string} */
function stepSymbol(state) {
  if (state === 'done') return '✔';
  if (state === 'active') return '▶';
  if (state === 'review') return '◐';
  if (state === 'held') return '⏸';
  return '○';
}
/** @param {StepState} state @returns {IndicatorColor} */
function stepColor(state) {
  if (state === 'done') return 'success';
  // A checkpoint in review waits for Main, which is calm; a held step waits for the human.
  if (state === 'active' || state === 'review') return 'accent';
  if (state === 'held') return 'warning';
  return 'dim';
}
/** @param {StepState} state @returns {string} */
function stepPrefix(state) { return state === 'done' ? `complete ${stepSymbol(state)}` : stepSymbol(state); }
/** @typedef {{rank: number, key: string, color: IndicatorColor, text: string, plain: string, flex?: boolean, min?: number, paint?: (plain: string) => string}} LiveSegment */
const SEGMENT_SEPARATOR = ' · ';
/**
 * Approved steps fill the bar; the step under way gets its own cells, so `2/4` and the bar tell the same story.
 * @param {number} done @param {number} total @param {number} cells @param {boolean} current whether the next step is under way
 * @returns {{filled: number, current: number, empty: number}}
 */
function barCells(done, total, cells, current) {
  if (cells < 1 || !(total > 0)) return { filled: 0, current: 0, empty: Math.max(0, cells) };
  const filled = Math.min(cells, Math.round((cells * done) / total));
  const through = current ? Math.min(cells, Math.round((cells * (done + 1)) / total)) : filled;
  return { filled, current: through - filled, empty: cells - through };
}
/**
 * @param {number} done @param {number} total @param {number} cells @param {string} owner @param {string} count
 * @param {(color: IndicatorColor, text: string) => string} paint
 * @param {IndicatorColor | null} currentColor the current step's color, or null when no step is under way
 * @returns {LiveSegment}
 */
function progressSegment(done, total, cells, owner, count, paint, currentColor) {
  const { filled, current, empty } = barCells(done, total, cells, currentColor !== null);
  const bar = '■'.repeat(filled) + '▣'.repeat(current) + '□'.repeat(empty);
  return { rank: 1, key: 'progress', color: 'muted',
    text: (owner ? paint('muted', owner) + ' ' : '') + paint('success', '■'.repeat(filled)) + (current && currentColor ? paint(currentColor, '▣'.repeat(current)) : '') + paint('dim', '□'.repeat(empty)) + (bar ? ' ' : '') + paint('muted', count),
    plain: (owner ? owner + ' ' : '') + (bar ? bar + ' ' : '') + count };
}
/**
 * Greedy width fitting, kept separate so the drop order is testable on its own.
 * Lowest rank goes first; the flexing title shrinks to its minimum before any higher rank is dropped.
 * @param {LiveSegment[]} segments
 * @param {number} width
 * @returns {string | null} the fitted line, or null when even the progress segment does not fit
 */
export function fitSegments(segments, width) {
  const kept = segments.slice();
  /** @returns {string} */
  const joined = () => kept.map(segment => segment.text).join(SEGMENT_SEPARATOR);
  for (;;) {
    if (visibleWidth(joined()) <= width) return joined();
    const flex = kept.find(segment => segment.flex);
    if (flex) {
      const target = visibleWidth(flex.plain) - (visibleWidth(joined()) - width);
      if (target >= (flex.min ?? 16)) {
        const plain = truncateToWidth(flex.plain, target, '…');
        flex.plain = plain;
        flex.text = flex.paint ? flex.paint(plain) : plain;
        if (visibleWidth(joined()) <= width) return joined();
      }
    }
    // Progress (rank 1) always survives; an alert (rank 2) survives while any rank above it remains.
    let victim = -1;
    for (let index = 0; index < kept.length; index++) {
      const segment = kept[index];
      const droppable = segment.rank > 1 && (segment.rank > 2 || !kept.some(other => other.rank > 2));
      if (droppable && (victim < 0 || segment.rank > kept[victim].rank)) victim = index;
    }
    if (victim < 0) return null;
    kept.splice(victim, 1);
  }
}
/**
 * The live line above the editor (indicator 'minimal'): one width-aware line, or nothing without a task.
 * @param {PairSummary} summary
 * @param {number} width
 * @param {{fg(color: IndicatorColor, text: string): string}} [theme]
 * @param {number} [now]
 * @returns {string[]}
 */
export function liveLine(summary, width, theme, now = Date.now()) {
  if (!(width > 0)) return [];
  const worker = glanceWorker(summary, now);
  const list = worker?.task?.stepList;
  if (!worker || !list?.length) return [];
  const paint = painter(theme);
  const task = /** @type {NonNullable<PairSummary['workers'][number]['task']>} */ (worker.task);
  const done = list.filter(step => step.state === 'done').length, many = summary.workers.length > 1;
  const state = workerState(summary, worker, !!summary.main?.busy, now);
  const current = list.findIndex(step => ['active', 'review', 'held'].includes(step.state));
  const step = current >= 0 ? list[current] : null;
  const owner = many ? workerLabel(summary, worker.id) : '';
  const count = task.step + '/' + task.steps;
  /** @param {number} cells @returns {LiveSegment[]} */
  const build = cells => {
    /** @type {LiveSegment[]} */
    const segments = [progressSegment(done, list.length, cells, owner, count, paint, step ? stepColor(step.state) : null)];
    const alert = alertText(worker, state, now);
    if (alert) segments.push({ rank: 2, key: 'alert', color: alert.color, text: paint(alert.color, '⚠ ' + alert.text), plain: '⚠ ' + alert.text, paint: plain => paint(alert.color, plain) });
    const title = step ? inline(step.title, 400) : done === list.length ? 'all steps approved' : inline(task.objective, 200);
    const symbol = step ? stepSymbol(step.state) : '✔', titleColor = step ? stepColor(step.state) : 'success';
    segments.push({ rank: 3, key: 'title', color: titleColor, text: paint(titleColor, symbol + ' ' + title), plain: symbol + ' ' + title, flex: true, min: 16, paint: plain => paint(titleColor, plain) });
    const activity = activityText(worker);
    if (activity) segments.push({ rank: 4, key: 'activity', color: 'accent', text: paint('accent', activity), plain: activity, paint: plain => paint('accent', plain) });
    if (task.startedAt) { const elapsed = elapsedLabel(taskElapsed(task, now)); segments.push({ rank: 5, key: 'elapsed', color: 'muted', text: paint('muted', elapsed), plain: elapsed, paint: plain => paint('muted', plain) }); }
    const perStep = task.limits?.maxRevisionsPerStep;
    if ((task.stepRevisions ?? 0) > 0 && typeof perStep === 'number') {
      const revisions = 'rev ' + task.stepRevisions + '/' + perStep;
      segments.push({ rank: 6, key: 'revisions', color: 'muted', text: paint('muted', revisions), plain: revisions, paint: plain => paint('muted', plain) });
    }
    if (typeof task.reportedCost === 'number' && task.reportedCost > 0) {
      const budget = task.limits?.maxReportedCostUsd;
      const cost = typeof budget === 'number' ? costLabel(task.reportedCost) + '/' + costLabel(budget) : costLabel(task.reportedCost);
      segments.push({ rank: 7, key: 'cost', color: 'muted', text: paint('muted', cost), plain: cost, paint: plain => paint('muted', plain) });
    }
    // Slow cache reads and a measured speed only earn space when they say something notable.
    const cache = validateUsageObservation(worker.observation?.lastUsage ?? null, 'Last cache-read usage')?.cacheRatio;
    if (typeof cache === 'number' && cache < 0.5) { const text = 'cache ' + Math.round(cache * 100) + '%'; segments.push({ rank: 8, key: 'cache', color: 'muted', text: paint('muted', text), plain: text, paint: plain => paint('muted', plain) }); }
    const speed = speedLabel(observedSpeed(worker.observation)).replace('avg ', '');
    if (!speed.includes('—')) segments.push({ rank: 9, key: 'speed', color: 'muted', text: paint('muted', speed), plain: speed, paint: plain => paint('muted', plain) });
    return segments;
  };
  // A wide bar first, then progressively narrower ones: the n/m count always stays.
  for (const cells of [10, 8, 6, 4, 2, 0]) {
    const line = fitSegments(build(cells), width);
    if (line !== null) return [truncateToWidth(line, width, '…')];
  }
  return [];
}
/**
 * The one alert the live line shows, or null. Alerts mark the reasons a human must act.
 * @param {PairSummary['workers'][number]} worker
 * @param {WorkerState} state
 * @param {number} now
 * @returns {{text: string, color: IndicatorColor} | null}
 */
function alertText(worker, state, now) {
  if (state.kind === 'permission') return { text: 'permission dialog', color: 'warning' };
  if (state.kind === 'attention') return { text: state.reason || 'needs attention', color: state.color === 'error' ? 'error' : 'warning' };
  const percent = worker.observation?.context?.percent;
  if (typeof percent === 'number' && percent >= 90) return { text: 'context ' + Math.round(percent) + '%', color: 'error' };
  // Limits, step-revision caps and failed Pair verification are raised by workerState into details.
  const detail = state.details.find(item => item.color === 'warning' || item.color === 'error');
  if (detail) return { text: detail.text.replace('⚠ ', ''), color: detail.color };
  if (state.kind === 'paused') return { text: 'held ' + compactAge(now - (worker.task?.updatedAt ?? now)), color: 'warning' };
  return null;
}
/**
 * A short path ('client.js') when the target looks like a file, the target as given otherwise (a command).
 * The compact surfaces show basenames; the dashboard keeps the full path.
 * @param {unknown} target @returns {string | null | undefined}
 */
function baseName(target) {
  if (target == null) return target;
  if (typeof target !== 'string') return undefined;
  const trimmed = target.trim();
  if (!trimmed || /\s/.test(trimmed) || !trimmed.includes('/')) return trimmed;
  const base = trimmed.replace(/\/+$/, '').split('/').pop();
  return base || trimmed;
}
/** @param {PairSummary['workers'][number]} worker @param {boolean} [full] keep the full path (dashboard) */
function activityText(worker, full = false) {
  const observation = worker.observation;
  if (observation?.compacting) return 'compacting context';
  const target = observation && 'currentTarget' in observation ? /** @type {string | null | undefined} */ (observation.currentTarget) : null;
  return activityLabel(observation?.currentTool, full ? target : baseName(target));
}
/**
 * The board (indicator 'board'): a header line, then one row per step, with finished steps collapsed
 * into one '✔ N done' row when the plan is longer than the cap.
 * @param {PairSummary} summary
 * @param {number} width
 * @param {{fg(color: IndicatorColor, text: string): string}} [theme]
 * @param {number} [now]
 * @returns {string[]}
 */
export function boardLines(summary, width, theme, now = Date.now()) {
  if (!(width > 0)) return [];
  const worker = glanceWorker(summary, now);
  const list = worker?.task?.stepList;
  if (!worker || !list?.length) return [];
  const paint = painter(theme);
  const task = /** @type {NonNullable<PairSummary['workers'][number]['task']>} */ (worker.task);
  const state = workerState(summary, worker, !!summary.main?.busy, now);
  const spend = typeof task.reportedCost === 'number' && task.reportedCost > 0
    ? (typeof task.limits?.maxReportedCostUsd === 'number' ? costLabel(task.reportedCost) + '/' + costLabel(task.limits.maxReportedCostUsd) : costLabel(task.reportedCost)) : '';
  const meta = [task.startedAt ? elapsedLabel(taskElapsed(task, now)) : '', spend].filter(Boolean).join(' · ');
  const head = 'Pair · ' + inline(task.objective, 200);
  /** @typedef {{prefix: string, title: string, right: string, color: IndicatorColor}} BoardRow */
  const revisions = (task.stepRevisions ?? 0) > 0 && typeof task.limits?.maxRevisionsPerStep === 'number' ? 'rev ' + task.stepRevisions + '/' + task.limits.maxRevisionsPerStep : '';
  /** @type {BoardRow[]} */
  const rows = list.map((step, index) => ({
    prefix: stepSymbol(step.state) + ' ' + (index + 1) + ' ',
    title: inline(step.title, 200),
    right: step.state === 'active' ? [activityText(worker), revisions].filter(Boolean).join(' · ')
      : step.state === 'review' ? 'waiting for Main' : step.state === 'held' ? 'held' : '',
    color: stepColor(step.state) }));
  /** @type {BoardRow[]} */
  const shown = [];
  if (rows.length > BOARD_ROW_CAP) {
    const firstUnfinished = list.findIndex(step => step.state !== 'done');
    const finished = firstUnfinished < 0 ? rows.length : firstUnfinished;
    if (finished > 1) shown.push({ prefix: '✔ ', title: finished + ' done', right: '', color: 'success' });
    shown.push(...rows.slice(finished > 1 ? finished : 0));
  } else shown.push(...rows);
  const lines = [meta ? fitRow(head, meta, width) : truncateToWidth(head, width, '…'),
    ...shown.map(row => row.right ? fitRow(paint(row.color, row.prefix + row.title), row.right, width, row.prefix) : truncateToWidth(paint(row.color, row.prefix + row.title), width, '…'))];
  if (state.kind === 'attention' || state.kind === 'permission' || state.kind === 'paused') {
    const alert = alertText(worker, state, now);
    if (alert) lines.push(truncateToWidth(paint(alert.color, '⚠ ' + alert.text), width, '…'));
  }
  return lines;
}
/** @param {string} left @param {string} right @param {number} width @returns {string} */
function padBetween(left, right, width) {
  const gap = width - visibleWidth(left) - visibleWidth(right);
  return gap > 1 ? left + ' '.repeat(gap) + right : left + ' ' + right;
}
/**
 * A row with left and right text: the right side keeps its place and the left title shrinks to about 16
 * columns before the right side is dropped — the same rule the live line applies to its segments.
 * @param {string} left @param {string} right @param {number} width @param {string} [prefix] unstyled leading glyphs
 * @returns {string}
 */
function fitRow(left, right, width, prefix = '') {
  const gap = 2;
  const room = width - visibleWidth(right) - gap;
  if (room >= ROW_TITLE_MIN) {
    const fitted = truncateToWidth(left, room, '…');
    return padBetween(fitted, right, width);
  }
  // Too narrow for both: drop the right side, keep the title with the full width.
  void prefix;
  return truncateToWidth(left, width, '…');
}
/**
 * @param {() => PairSummary | null} current
 * @param {{fg(color: IndicatorColor, text: string): string}} theme
 * @param {(summary: PairSummary, width: number, theme: {fg(color: IndicatorColor, text: string): string}) => string[]} [draw]
 * @returns {import('@earendil-works/pi-tui').Component}
 */
export function summaryWidget(current, theme, draw = (summary, width) => liveLine(summary, width, theme)) {
  return {
    render(width) {
      const summary = current();
      if (!summary || !(width > 0)) return [];
      // A display failure must never break Pi's frame: an empty widget is the safe fallback.
      try { return draw(summary, width, theme).map(line => truncateToWidth(line, width, '…')); } catch { return []; }
    },
    invalidate() {},
  };
}
/**
 * The 'minimal' indicator widget: the live line, one row.
 * @param {() => PairSummary | null} current
 * @param {{fg(color: IndicatorColor, text: string): string}} theme
 * @returns {import('@earendil-works/pi-tui').Component}
 */
export function liveWidget(current, theme) { return summaryWidget(current, theme, (summary, width) => liveLine(summary, width, theme)); }
/**
 * The 'board' indicator widget: header plus step rows.
 * @param {() => PairSummary | null} current
 * @param {{fg(color: IndicatorColor, text: string): string}} theme
 * @returns {import('@earendil-works/pi-tui').Component}
 */
export function boardWidget(current, theme) { return summaryWidget(current, theme, (summary, width) => boardLines(summary, width, theme)); }

/**
 * What the widget draws, so an unchanged plan does not re-render. Plan structure comes from the summary;
 * the clock buckets cover the two values that move on their own (task elapsed and idle age), so a tick
 * re-renders only when a shown number can change.
 * @param {PairSummary} summary
 * @param {string} mode
 * @param {number} [now]
 * @returns {string}
 */
export function widgetSignature(summary, mode, now = Date.now()) {
  const plan = summary.workers.map(w => [w.id, w.status, w.pid, w.task ? [w.task.id, w.task.status, w.task.step, w.task.revisions, w.task.stepRevisions, w.task.reportId, w.task.lastDecision, w.task.stepList.map(step => [step.id, step.state]), w.task.reportedCost, w.task.limitNotice, w.task.lastVerification, w.task.updatedAt] : null, w.observation?.currentTool ?? null, w.observation && 'currentTarget' in w.observation ? w.observation.currentTarget ?? null : null, w.observation?.compacting ?? null, w.observation?.lastUsage ?? null, w.error ?? null]);
  const ticks = summary.workers.map(w => {
    const last = Math.max(w.observation?.at || 0, w.lastExchange?.at || 0);
    // A finished task's clock is frozen, so only a running one ticks; the shown flag flips when a done plan leaves.
    const t = w.task, running = !!t?.startedAt && !['completed', 'cancelled'].includes(t.status);
    return [t && running ? Math.floor((now - t.startedAt) / 1000) : 0, last > 0 ? Math.floor((now - last) / 60000) : 0, taskShown(t, now)];
  });
  return JSON.stringify([mode, plan, ticks, summary.waitingReports, summary.autoDeliverReports, summary.enabled, summary.main?.busy ?? null]);
}
/** @typedef {{setStatus(key: string, text: string | undefined): void, setWidget(key: string, factory: ((tui: import('@earendil-works/pi-tui').TUI, theme: {fg(color: IndicatorColor, text: string): string}) => import('@earendil-works/pi-tui').Component) | undefined, options?: {placement?: 'aboveEditor' | 'belowEditor'}): void, theme?: {fg(color: IndicatorColor, text: string): string}}} IndicatorUi */
/**
 * Keeps Pair's footer badge and its above-editor widget in step with one summary.
 * The widget remembers the mode it was created for, so switching minimal <-> board replaces the component
 * instead of leaving the old one drawing; compact, off and a missing task remove it.
 * @param {IndicatorUi} ui
 * @returns {{ui: IndicatorUi, update(summary: PairSummary | null, mode: string, mainBusy?: boolean, now?: number): void, clear(): void}}
 */
export function createIndicatorSurface(ui) {
  /** @type {{mode: string, signature: string, tui?: import('@earendil-works/pi-tui').TUI} | null} */
  let shown = null;
  /** @type {PairSummary | null} */
  let latest = null;
  /** @type {string | undefined | symbol} */
  let status = Symbol('unset');
  /** @param {string | undefined} text */
  const showStatus = text => {
    if (status === text) return;
    status = text;
    ui.setStatus('fabric-pair', text);
  };
  const removeWidget = () => {
    if (!shown) return;
    shown = null;
    ui.setWidget('fabric-pair', undefined);
  };
  return {
    ui,
    update(summary, mode, mainBusy = false, now = Date.now()) {
      if (!summary || mode === 'off') {
        latest = null;
        removeWidget();
        showStatus(undefined);
        return;
      }
      latest = summary;
      showStatus(indicator(summary, mainBusy, ui.theme, now));
      // compact is the badge alone; minimal and board stack a widget above the editor.
      if (mode !== 'minimal' && mode !== 'board') { removeWidget(); return; }
      if (shown && shown.mode !== mode) removeWidget();
      const signature = widgetSignature(summary, mode, now);
      // A summary returned by a fresh summary() call is a new object every tick, so compare content only.
      if (!shown) {
        // Record the mode before registering: Pi may create the component later, and a second update
        // must not register it again.
        /** @type {NonNullable<typeof shown>} */
        const entry = shown = { mode, signature };
        ui.setWidget('fabric-pair', (tui, theme) => {
          entry.tui = tui;
          return mode === 'board' ? boardWidget(() => latest, theme) : liveWidget(() => latest, theme);
        }, { placement: 'aboveEditor' });
      } else if (shown.signature !== signature) {
        shown.signature = signature;
        shown.tui?.requestRender?.();
      }
    },
    clear() { latest = null; removeWidget(); showStatus(undefined); },
  };
}
/** @typedef {'report' | 'diff' | 'transcript' | 'yield' | 'pause' | 'resume' | 'cancel' | 'settings' | 'restart' | 'reload' | 'doctor' | 'start' | 'reconcile' | 'stop' | 'status' | 'inbox' | 'worker' | 'more' | 'help' | 'close'} DashboardAction */
/** @typedef {{key: string, action: DashboardAction, label: string}} DashboardKeyHint */
/** What the dashboard resolves with: the chosen action and the worker it was shown for. @typedef {{action: DashboardAction, workerId?: string}} DashboardChoice */

/** The widest the overlay may be; wider terminals keep a readable column. */
const DASHBOARD_MAX_WIDTH = 100;
/** One line of explanation per action, for the help list. @type {Readonly<Record<DashboardAction, string>>} */
const ACTION_HELP = {
  report: "read the worker's report card", diff: "scroll the checkpoint's changes", transcript: "follow the worker's conversation",
  yield: 'send the waiting reports to Main', pause: 'stop the current step and hold the task', resume: 'continue the held task',
  cancel: 'end the task for good; file changes stay', reconcile: 'prove the previous worker process exited',
  start: 'launch the worker process', settings: 'worker model, review policy, indicator', worker: 'show the next worker',
  more: 'maintenance keys', help: 'this list', restart: 'restart the process; the conversation is kept',
  stop: 'stop the process; the conversation is kept', status: 'worker, task, Main and cache details',
  inbox: 'reports Main has not read yet', reload: 'reread the saved Pair settings', doctor: 'check Fabric, Fovea and Pair setup',
  close: 'close the dashboard',
};
/**
 * The rows an overlay may use: Pi clamps it to its maxHeight (80% here) and to the terminal less the margins.
 * @param {number} rows @returns {number}
 */
function overlayRows(rows) { return Math.max(1, Math.min(Math.floor(rows * 0.8), rows - 2)); }
/**
 * Pair's overlays: centered, and no wider than a readable column plus the frame on a wide terminal. Pi reads
 * these options once, when the overlay opens.
 * @param {number | undefined} columns
 * @returns {import('@earendil-works/pi-tui').OverlayOptions}
 */
function overlayOptions(columns) {
  const width = columns ? Math.min(DASHBOARD_MAX_WIDTH + 2, Math.floor(columns * 0.9)) : '90%';
  return { width, minWidth: 40, maxHeight: '80%', anchor: 'center', margin: 1 };
}

/**
 * The dashboard's keys for the current state. A key only exists when its action applies, so the hint line
 * can never offer a key that does nothing.
 * @param {PairSummary} summary
 * @param {string} [workerId]
 * @returns {DashboardKeyHint[]}
 */
export function dashboardKeys(summary, workerId) {
  const worker = (workerId ? summary.workers.find(w => w.id === workerId) : null) || planWorker(summary) || summary.workers[0];
  if (!worker) return [{ key: 's', action: 'settings', label: 'settings' }, { key: 'm', action: 'more', label: 'more' }, { key: '?', action: 'help', label: 'help' }];
  const task = worker.task && !['completed', 'cancelled'].includes(worker.task.status) ? worker.task : null;
  /** @type {DashboardKeyHint[]} */
  const keys = [];
  if (task?.reportId && ['question', 'review', 'blocked'].includes(task.status)) {
    keys.push({ key: 'r', action: 'report', label: 'report' }, { key: 'd', action: 'diff', label: 'diff' });
  }
  if (worker.sessionId) keys.push({ key: 't', action: 'transcript', label: 'transcript' });
  if ((summary.waitingReports || 0) > 0) keys.push({ key: 'y', action: 'yield', label: 'yield' });
  if (task && ['running', 'awaiting_settle'].includes(task.status)) keys.push({ key: 'p', action: 'pause', label: 'pause' });
  if (task && ['paused', 'interrupted'].includes(task.status)) keys.push({ key: 'p', action: 'resume', label: 'resume' });
  if (task) keys.push({ key: 'c', action: 'cancel', label: 'cancel' });
  if (!worker.pid && /^EXIT_UNCONFIRMED/.test(worker.error || '')) keys.push({ key: '!', action: 'reconcile', label: 'reconcile' });
  // Start needs a chosen model: without one it could only fail with a notice, and s settings covers that state.
  if (!worker.pid && task === null && hasModel(worker)) keys.push({ key: 'n', action: 'start', label: 'start' });
  if (summary.workers.length > 1) keys.push({ key: 'w', action: 'worker', label: 'next worker' });
  keys.push({ key: 's', action: 'settings', label: 'settings' }, { key: 'm', action: 'more', label: 'more' }, { key: '?', action: 'help', label: 'help' });
  return keys;
}
/**
 * Maps one keypress to an action, or null when the key does not apply to this state.
 * @param {string} data
 * @param {PairSummary} summary
 * @param {string} [workerId]
 * @param {KeyMatcher | null} [keys] Pi's keybindings, so a rebound cancel key closes too
 * @returns {DashboardAction | null}
 */
export function dashboardAction(data, summary, workerId, keys = null) {
  if (data === 'q' || isCancel(keys, data)) return 'close';
  const hint = dashboardKeys(summary, workerId).find(item => item.key === data);
  return hint ? hint.action : null;
}
/**
 * The row under the "More" key: maintenance actions and the views that are not needed every day.
 * Stop is offered only while the worker process runs.
 * @param {PairSummary} [summary]
 * @param {string} [workerId]
 * @returns {DashboardKeyHint[]}
 */
export function dashboardMoreKeys(summary, workerId) {
  const worker = summary ? dashboardWorker(summary, workerId) : undefined;
  return [{ key: 'r', action: 'restart', label: 'restart worker' }, ...(worker?.pid ? [/** @type {DashboardKeyHint} */ ({ key: 'x', action: 'stop', label: 'stop worker' })] : []),
    { key: 'i', action: 'status', label: 'status' }, { key: 'b', action: 'inbox', label: 'inbox' },
    { key: 'l', action: 'reload', label: 'reload settings' }, { key: 'd', action: 'doctor', label: 'doctor' }, { key: '?', action: 'help', label: 'help' }];
}
/** @param {PairSummary} summary @param {string | undefined} workerId @returns {string | undefined} */
function nextWorker(summary, workerId) {
  const ids = summary.workers.map(w => w.id), at = ids.indexOf(dashboardWorker(summary, workerId)?.id ?? '');
  return ids.length ? ids[(at + 1) % ids.length] : workerId;
}
/**
 * The short history line under a step: what happened to this step's reports and decisions.
 * @param {import('./timeline.js').TimelineEntry} entry
 * @returns {{text: string, color: IndicatorColor, step: number}}
 */
export function timelineLine(entry) {
  const step = Math.max(1, Math.trunc(entry.step));
  if (entry.type === 'report') {
    const failed = entry.verification.failed;
    return { step, color: failed ? 'warning' : 'muted', text: `↻ report ${entry.kind}${failed ? ` · ${failed} Pair check${failed === 1 ? '' : 's'} failed` : ''}` };
  }
  if (entry.action === 'approve') return { step, color: 'success', text: '✔ approved' };
  if (entry.action === 'revise') return { step, color: 'warning', text: `↻ revise: ${entry.feedback || 'no feedback'}` };
  if (entry.action === 'answer') return { step, color: 'accent', text: `↻ answer: ${entry.feedback || 'no feedback'}` };
  if (entry.action === 'cancel') return { step, color: 'warning', text: '✖ cancelled' };
  return { step, color: 'muted', text: `↻ ${entry.action}` };
}
/**
 * History lines for one step, newest last, bounded so the dashboard stays short.
 * @param {import('./timeline.js').TimelineEntry[] | undefined} timeline
 * @param {number} step
 * @param {number} [limit]
 * @returns {{text: string, color: IndicatorColor}[]}
 */
export function stepHistory(timeline, step, limit = 3) {
  const entries = Array.isArray(timeline) ? timeline.filter(entry => entry.step === step) : [];
  return entries.slice(Math.max(0, entries.length - limit)).map(entry => { const line = timelineLine(entry); return { text: line.text, color: line.color }; });
}

/** @param {PairSummary} summary @param {string} [workerId] @returns {PairSummary['workers'][number] | undefined} */
function dashboardWorker(summary, workerId) {
  return (workerId ? summary.workers.find(w => w.id === workerId) : null) || planWorker(summary) || summary.workers[0];
}
/** @param {string} notice @param {number} width @returns {string} */
const clampNotice = (notice, width) => truncateToWidth(notice, Math.max(1, width), '…');

/** How the dashboard sheds detail to fit its rows. @typedef {{history: 'all' | 'current' | 'none', collapse: boolean, limit?: number}} DashboardShape */
/**
 * What the dashboard shows. A pure function of the summary, the width and the clock, so it can be tested
 * without Pi: header, the state line, the plan with its current step, the last checkpoint, and the keys.
 * Given `maxRows` it sheds detail until it fits, in a fixed order: recent activity, the history of the other
 * steps, all history, then finished steps fold into one row, then the plan is cut after the current step.
 * The keys always stay.
 * @param {PairSummary} summary
 * @param {number} width
 * @param {number} [now]
 * @param {{workerId?: string, notice?: string | null, more?: boolean, help?: boolean, maxRows?: number, theme?: {fg(color: IndicatorColor | 'mdHeading', text: string): string, bold?(text: string): string} | null}} [options]
 * @returns {string[]}
 */
export function dashboardLines(summary, width, now = Date.now(), options = {}) {
  if (!(width > 0)) return [];
  const theme = options.theme ?? null, fg = painter(theme), bold = (/** @type {string} */ text) => (theme?.bold ? theme.bold(text) : text);
  const worker = dashboardWorker(summary, options.workerId);
  const room = Math.max(20, Math.min(width, DASHBOARD_MAX_WIDTH));
  /** @param {string} text */
  const fit = text => truncateToWidth(text, room, '…');
  /** @param {DashboardKeyHint} item */
  const keyText = item => `${fg('accent', item.key)} ${item.label}`;
  const back = `${fg('accent', 'esc')} back`;
  const row = options.help ? [back]
    : options.more ? [fg('muted', 'More ›'), ...dashboardMoreKeys(summary, worker?.id).map(keyText), back]
    : dashboardKeys(summary, worker?.id).map(keyText);
  // The hint row wraps rather than truncating and keeps its indent, so every key stays visible.
  const bottom = [...(options.notice ? [fg('warning', clampNotice(options.notice, room))] : []), '', ...wrapTextWithAnsi(row.join('  '), room - 2).map(line => `  ${line}`)];
  const waiting = summary.waitingReports || 0;
  const title = `Pair${worker && summary.workers.length > 1 ? ` · ${worker.id}` : ''}`;
  const top = [fit(`${fg('mdHeading', bold(title))}${waiting ? `  ${fg('warning', `◐ ${waiting} report${waiting === 1 ? '' : 's'} waiting for Main`)}` : ''}`)];
  if (!summary.enabled) top.push(fit(fg('warning', 'Pair is off. It accepts no new work until you turn it on.')));
  /** @type {(shape: DashboardShape) => string[]} */
  let content = () => [fit(fg('dim', 'No worker is configured. Open settings to add one.'))];
  /** @type {string[]} */
  let activityLines = [];
  if (worker) {
    const state = workerState(summary, worker, !!summary.main?.busy, now);
    const task = worker.task && !['completed', 'cancelled'].includes(worker.task.status) ? worker.task : null;
    const model = worker.model.split('/').pop() || worker.model;
    // One identity line: which model, what state, and the live numbers. The state word comes from the
    // shared classifier, so the dashboard can never disagree with the badge or the live line.
    const meta = [model, worker.effort].filter(Boolean).join(' · ');
    const measure = [
      task?.startedAt ? elapsedLabel(now - task.startedAt) : '',
      typeof task?.reportedCost === 'number' && task.reportedCost > 0 ? costLabel(task.reportedCost) : '',
      worker.observation?.context?.percent != null ? `ctx ${Math.round(worker.observation.context.percent)}%` : '',
      state.step ? `step ${state.step}/${state.steps}` : ''
    ].filter(Boolean).join(' · ');
    // A working state's label is a verb ('working on'); the dashboard names the state plainly instead.
    const stateWord = state.kind === 'working' ? 'working' : state.label;
    top.push(fit(`${fg('muted', meta)}   ${fg(state.color, `${state.icon} ${stateWord}`)}${measure ? '  ' + fg('muted', measure) : ''}`));
    // The state sentence is the header's job; here only what the human or Main must resolve is repeated.
    const pending = state.details.filter(detail => (detail.color === 'warning' || detail.color === 'error') && !detail.text.startsWith('/pair'));
    for (const detail of pending.slice(0, 2)) top.push(fit(fg(detail.color, detail.text)));
    top.push('');
    if (!task) {
      // Without a task the dashboard is a readiness screen: what is true now and what to do next.
      const readiness = !summary.enabled ? 'Pair is off: it accepts no new work until you turn it on.'
        : !hasModel(worker) ? 'No worker model is chosen yet.'
        : worker.pid ? `${model} is ready for the next task.`
        : 'The worker is not running.';
      const lines = [fit(fg('muted', readiness))];
      const next = nextAction(worker);
      if (next) lines.push(fit(fg('accent', next === '/pair to set up' ? 'Press s to choose the worker model.' : next === '/pair start' ? 'Press n to start the worker.' : next)));
      if (!worker.pid && /^EXIT_UNCONFIRMED/.test(worker.error || '')) lines.push(fit(fg('warning', 'The previous worker process may still be running: press ! to reconcile.')));
      if (!summary.enabled) lines.push(fit(fg('accent', 'Open settings (s) to turn Pair on.')));
      content = () => lines;
    } else {
      const objective = fit(fg('text', bold(inline(task.objective, 300))));
      const rows = task.stepList.map((step, index) => ({
        left: `${stepSymbol(step.state)} ${index + 1} ${inline(step.title, 200)}`,
        right: step.state === 'active' ? [activityText(worker, true), (task.stepRevisions ?? 0) > 0 && typeof task.limits?.maxRevisionsPerStep === 'number' ? `rev ${task.stepRevisions}/${task.limits.maxRevisionsPerStep}` : ''].filter(Boolean).join(' · ')
          : step.state === 'review' ? 'for Main' : step.state === 'held' ? 'held' : step.state === 'done' ? 'approved' : '',
        color: stepColor(step.state),
        // What happened to this step's reports: a revise with its feedback excerpt, an approval, a failed check.
        history: stepHistory(task.timeline, index + 1).map(item => fit(`    ${fg(item.color, item.text)}`)) }));
      // Align the right-hand column to the widest left cell, with two clear columns of space, shrinking
      // only when the width demands it.
      const widest = Math.max(...rows.map(item => visibleWidth(item.left)));
      const column = Math.min(widest + 2, Math.max(18, room - 24));
      /** @param {typeof rows[number]} item */
      const stepLine = item => (!item.right || room - visibleWidth(item.right) - 2 < 18 ? fit(fg(item.color, item.left))
        : fit(fg(item.color, item.left) + ' '.repeat(Math.max(1, column - visibleWidth(item.left))) + fg('muted', item.right)));
      const current = task.stepList.findIndex(step => ['active', 'review', 'held'].includes(step.state));
      const open = task.stepList.findIndex(step => step.state !== 'done');
      const finished = open < 0 ? rows.length : open;
      /** @param {number} count */
      const folded = count => fit(fg('success', count === 1 ? '✔ 1 approved' : `✔ 1–${count} approved`));
      const checks = Array.isArray(task.lastVerification) ? task.lastVerification : [];
      const verification = checks.length
        ? [fit(`  ${fg('muted', 'Last checkpoint')}  ${fg('muted', 'Pair verified')}  ${checks.map(check => `${check.passed ? fg('success', '✔') : fg('warning', '✖')} ${inline(check.name, 40)}`).join('  ')}`)]
        : task.checkpointHash ? [fit(`  ${fg('muted', 'Last checkpoint')}  ${fg('muted', 'no Pair checks configured')}`)] : [];
      content = ({ history, collapse, limit = Infinity }) => {
        // Finished steps fold into one row only when that saves a line.
        const skip = collapse && finished > 1 ? finished : 0;
        const steps = rows.slice(skip).flatMap((item, offset) => [stepLine(item),
          ...(history === 'all' || (history === 'current' && skip + offset === current) ? item.history : [])]);
        const body = [objective, ...(skip ? [folded(skip)] : []), ...steps, ...verification];
        if (body.length <= limit) return body;
        // Still too tall: the plan starts at its first open step and says how many steps it leaves out.
        const tail = rows.slice(finished).map(stepLine);
        const free = Math.max(1, limit - 2 - (finished ? 1 : 0) - verification.length);
        const hidden = tail.length - free;
        return [objective, ...(finished ? [folded(finished)] : []), ...tail.slice(0, free), ...(hidden > 0 ? [fit(fg('dim', `  … ${hidden} more step${hidden === 1 ? '' : 's'}`))] : []), ...verification];
      };
    }
    // Recent activity: the worker's own last tool events, oldest first, bounded by the ring buffer.
    const activity = Array.isArray(worker.recentActivity) ? worker.recentActivity : [];
    if (activity.length) activityLines = ['', fit(fg('muted', 'Recent activity')), ...activity.slice(-4).map(event => {
      const when = event.at > 0 ? elapsedLabel(Math.max(0, now - event.at)) : '';
      return fit(`  ${fg('dim', when.padStart(5))}  ${fg('muted', inline(event.tool.replace(/^extensions\./, ''), 40))}${event.target ? ' ' + fg('dim', inline(event.target, 160)) : ''}`);
    })];
  }
  if (options.help) {
    const help = helpLines(dashboardKeys(summary, worker?.id), dashboardMoreKeys(summary, worker?.id).filter(item => item.action !== 'help'), room, fg);
    content = () => help;
    activityLines = [];
  }
  return fitRows(top, content, activityLines, bottom, options.maxRows ?? Infinity);
}
/**
 * The help list: one key per line with what it does, the keys of this screen first, then the More row.
 * @param {DashboardKeyHint[]} now
 * @param {DashboardKeyHint[]} more
 * @param {number} room
 * @param {(color: IndicatorColor, text: string) => string} fg
 * @returns {string[]}
 */
function helpLines(now, more, room, fg) {
  const close = /** @type {DashboardKeyHint} */ ({ key: 'esc', action: 'close', label: 'close' });
  const all = [...now, close, ...more];
  const widest = Math.max(...all.map(item => visibleWidth(`${item.key} ${item.label}`)));
  // Descriptions start in one column and wrap under it, so a narrow overlay never cuts one off.
  const column = 4 + widest + 2;
  /** @param {DashboardKeyHint} item */
  const line = item => {
    const [first = '', ...rest] = wrapTextWithAnsi(item === close ? 'q too; in More and this list, both go back' : ACTION_HELP[item.action], Math.max(12, room - column));
    const head = `    ${fg('accent', item.key)} ${item.label}${' '.repeat(widest + 2 - visibleWidth(`${item.key} ${item.label}`))}`;
    return [head + fg('dim', first), ...rest.map(part => ' '.repeat(column) + fg('dim', part))].map(text => truncateToWidth(text, room, '…'));
  };
  return [fg('muted', '  Keys'), ...now.flatMap(line), ...line(close), '', fg('muted', '  More (press m, then the key)'), ...more.flatMap(line)];
}
/**
 * Fits the dashboard into `max` rows: the header and the keys stay, and the middle sheds detail in order.
 * @param {string[]} top
 * @param {(shape: DashboardShape) => string[]} content
 * @param {string[]} activity
 * @param {string[]} bottom
 * @param {number} max
 * @returns {string[]}
 */
function fitRows(top, content, activity, bottom, max) {
  const space = max - top.length - bottom.length;
  /** @type {DashboardShape[]} */
  const shapes = [{ history: 'all', collapse: false }, { history: 'current', collapse: false }, { history: 'none', collapse: false }, { history: 'none', collapse: true }];
  const full = content(shapes[0]);
  if (full.length + activity.length <= space) return [...top, ...full, ...activity, ...bottom];
  for (const shape of shapes) {
    const middle = content(shape);
    if (middle.length <= space) return [...top, ...middle, ...bottom];
  }
  const lines = [...top, ...content({ history: 'none', collapse: true, limit: Math.max(0, space) }), ...bottom];
  if (lines.length <= max) return lines;
  // A terminal too short for even that keeps the keys and cuts the middle.
  return [...lines.slice(0, Math.max(0, max - bottom.length)), ...bottom].slice(0, Math.max(1, max));
}
const DASHBOARD_TICK_MS = 2000;
/**
 * What the open dashboard needs from the controller: a live summary, a change subscription, and a way to
 * stop listening. Narrow on purpose, so the component can be tested with a fake controller.
 * @typedef {{summary(): PairSummary, on(event: 'change', listener: (summary: PairSummary) => void): unknown, off(event: 'change', listener: (summary: PairSummary) => void): unknown}} LiveSource */
/**
 * The thin overlay around dashboardLines. It subscribes to the controller while open and refreshes on a
 * timer, and asks Pi for a frame each time, because Pi repaints only on input or on request. Both are
 * released on dispose and on close.
 * @param {LiveSource} source
 * @param {{workerId?: string, initial?: string | null, theme?: PanelTheme | null, keys?: KeyMatcher | null, rows?: () => number | undefined, onChange?: () => void, now?: () => number, tickMs?: number}} [options]
 * @returns {{render(width: number): string[], handleInput(data: string): DashboardAction[], invalidate(): void, dispose(): void, attach(finish: (value?: unknown) => void): void, readonly closed: boolean, readonly subscribed: boolean, readonly notice: string | null, readonly more: boolean, readonly help: boolean, readonly workerId: string | undefined}}
 */
export function createDashboard(source, options = {}) {
  const clock = options.now ?? Date.now, keys = options.keys ?? null, fg = painter(options.theme ?? null);
  const notice = options.initial ?? null;
  let workerId = options.workerId;
  let more = false, help = false, closed = false, disposed = false;
  let summary = source.summary();
  /** @type {(() => void) | null} */
  let done = null;
  const changed = () => { try { options.onChange?.(); } catch { /* a repaint request must never break the listener */ } };
  /** @param {PairSummary} next */
  const listener = next => { summary = next; changed(); };
  source.on('change', listener);
  const timer = setInterval(() => { if (!closed) { summary = source.summary(); changed(); } }, options.tickMs ?? DASHBOARD_TICK_MS);
  timer.unref?.();
  const release = () => {
    if (disposed) return;
    disposed = true;
    source.off('change', listener);
    clearInterval(timer);
  };
  return {
    get closed() { return closed; },
    get subscribed() { return !disposed; },
    get notice() { return notice; },
    get more() { return more; },
    get help() { return help; },
    get workerId() { return dashboardWorker(summary, workerId)?.id; },
    /** @param {(value?: unknown) => void} finish */
    attach(finish) { done = finish; },
    render(w) {
      // A rule above and below marks the overlay over the chat; the rows it may use exclude them.
      const rows = options.rows?.();
      const lines = dashboardLines(summary, Math.max(1, w - 2), clock(), { theme: options.theme ?? null, workerId, notice, more, help, ...(rows ? { maxRows: Math.max(6, overlayRows(rows) - 2) } : {}) });
      const rule = fg('border', '─'.repeat(Math.max(1, w)));
      return [rule, ...lines.map(line => ` ${line}`), rule];
    },
    /**
     * One keypress. Navigation keys are handled here; everything else is returned for main.js to run. Keys
     * that do not apply to this state do nothing at all.
     * @param {string} data
     * @returns {DashboardAction[]}
     */
    handleInput(data) {
      if (closed) return [];
      if (more || help) {
        // q and esc step back to the dashboard; m leaves More, ? leaves help, and ? in More opens help.
        if (data === 'q' || isCancel(keys, data) || data === (more ? 'm' : '?') || (help && data === 'm')) { more = false; help = false; return []; }
        if (!more) return [];
        const action = dashboardMoreKeys(summary, workerId).find(item => item.key === data)?.action;
        if (action === 'help') { more = false; help = true; return []; }
        if (action) { more = false; return [action]; }
        return [];
      }
      const action = dashboardAction(data, summary, workerId, keys);
      if (!action) return [];
      if (action === 'more') { more = true; return []; }
      if (action === 'help') { help = true; return []; }
      if (action === 'worker') { workerId = nextWorker(summary, workerId); return []; }
      if (action === 'close') { closed = true; release(); done?.(); return []; }
      // A read-only view reopens the dashboard when it closes, so two custom views never stack.
      return [action];
    },
    invalidate() {},
    dispose() { release(); },
  };
}
/**
 * The dashboard overlay for a TUI context. Resolves with the chosen action and the worker it was shown for,
 * or undefined on close.
 * @param {UIContext} ctx
 * @param {LiveSource} source
 * @param {{workerId?: string, notice?: string | null, overlay?: boolean}} [options]
 * @returns {Promise<DashboardChoice | undefined>}
 */
export async function dashboardView(ctx, source, options = {}) {
  if (ctx.mode !== 'tui' || typeof ctx.ui.custom !== 'function') return undefined;
  /** @type {number | undefined} */
  let columns;
  return ctx.ui.custom((tui, theme, keys, done) => {
    columns = tui.terminal?.columns;
    const view = createDashboard(source, { workerId: options.workerId, initial: options.notice ?? null, theme, keys, rows: () => tui.terminal?.rows, onChange: () => tui.requestRender() });
    // q and esc end here: Pi's done() resolves the view and disposes the component.
    view.attach(() => done(undefined));
    const component = {
      /** @param {number} w */
      render(w) { return view.render(w); },
      invalidate() {},
      /** Pi calls this when the view is discarded without picking anything, so release here too. */
      dispose() { view.dispose(); },
      handleInput(/** @type {string} */ data) {
        const actions = view.handleInput(data);
        if (!actions.length) { tui.requestRender(); return; }
        const choice = { action: actions[0], workerId: view.workerId };
        view.dispose();
        done(choice);
      },
    };
    return component;
  }, { overlay: options.overlay !== false, overlayOptions: () => overlayOptions(columns) });
}
/** What a transcript view reads: the text, compact by default or with every output in full. @typedef {{read(options?: {full?: boolean}): Promise<string>}} FollowSource */
/** Rows a chrome() frame adds around its body with one subtitle line and a hint row. */
const CHROME_ROWS = 9;
/**
 * Follow mode for the transcript: refresh while open, stay pinned to the bottom until the human scrolls up,
 * and follow again once they scroll back to the end. `o` switches between one line per tool call and result
 * and the full output.
 * @param {FollowSource} source
 * @param {{title?: string, theme?: PanelTheme | null, keys?: KeyMatcher | null, rows?: () => number | undefined, onUpdate?: () => void, onClose?: () => void, tickMs?: number}} [options]
 * @returns {{render(width: number): string[], handleInput(data: string): void, invalidate(): void, dispose(): void, readonly pinned: boolean, readonly full: boolean}}
 */
export function createFollowView(source, options = {}) {
  const theme = options.theme ?? null, fg = painter(theme), keys = options.keys ?? null;
  const bold = (/** @type {string} */ text) => (theme?.bold ? theme.bold(text) : text);
  let text = 'loading…', pinned = true, full = false, disposed = false, reading = false;
  let offset = 0, page = 10, total = 0;
  /** @type {{width: number, text: string, lines: string[]}} */
  let cache = { width: -1, text: '', lines: [] };
  const refresh = () => {
    if (disposed || reading) return;
    reading = true;
    const asked = full;
    source.read({ full: asked }).then(next => next, error => `Could not read the transcript: ${briefError(error)}`).then(next => {
      reading = false;
      if (disposed) return;
      // o was pressed while this read ran: read again in the mode now shown.
      if (asked !== full) { refresh(); return; }
      if (next === text) return; // nothing new to paint
      text = next;
      try { options.onUpdate?.(); } catch { /* a repaint request must not stop the refresh */ }
    });
  };
  refresh();
  const timer = setInterval(refresh, options.tickMs ?? 2000);
  timer.unref?.();
  /** @param {number} width */
  const layout = width => {
    if (cache.width !== width || cache.text !== text) {
      const span = Math.max(10, width - 3);
      cache = { width, text, lines: cleanText(text, 200000).replace(/\t/g, '    ').split('\n').flatMap(line => transcriptLines(line, span, fg, bold)) };
    }
    return cache.lines;
  };
  /** @param {number} to */
  const scrollTo = to => { offset = Math.max(0, Math.min(to, total - page)); pinned = offset >= total - page; };
  const dispose = () => { if (disposed) return; disposed = true; clearInterval(timer); };
  return {
    get pinned() { return pinned; },
    get full() { return full; },
    /** @param {number} width */
    render(width) {
      const lines = layout(width), rows = options.rows?.();
      page = Math.max(3, (rows ? overlayRows(rows) : 24) - CHROME_ROWS);
      total = lines.length;
      offset = pinned ? Math.max(0, total - page) : Math.min(offset, Math.max(0, total - page));
      const position = total > page ? `${offset + 1}–${Math.min(offset + page, total)} of ${total}` : `${total} line${total === 1 ? '' : 's'}`;
      const subtitle = [pinned ? 'following' : 'paused, G follows', full ? 'full output' : 'one line per tool call', position].join(' · ');
      return chrome(lines.slice(offset, offset + page), width, { title: options.title ?? 'Transcript', subtitle: [subtitle], theme,
        hints: hints(['↑↓', 'scroll'], ['pgup/pgdn', 'page'], ['g/G', 'top/end'], ['o', full ? 'fold output' : 'full output'], ['tui.select.cancel', 'close']) });
    },
    /** @param {string} data */
    handleInput(data) {
      if (data === 'q' || isCancel(keys, data)) { dispose(); options.onClose?.(); return; }
      // Up never re-pins; reaching the end again, by any key, follows new lines.
      if (keyIs(keys, data, 'tui.select.up', ['k']) || matchesKey(data, 'up')) { if (total > page) { offset = Math.max(0, offset - 1); pinned = false; } }
      else if (keyIs(keys, data, 'tui.select.down', ['j']) || matchesKey(data, 'down')) scrollTo(offset + 1);
      else if (keyIs(keys, data, 'tui.select.pageUp', ['b']) || matchesKey(data, 'pageUp')) { if (total > page) { offset = Math.max(0, offset - page); pinned = false; } }
      else if (keyIs(keys, data, 'tui.select.pageDown', [' ']) || matchesKey(data, 'pageDown')) scrollTo(offset + page);
      else if (data === 'g' || matchesKey(data, 'home')) { if (total > page) { offset = 0; pinned = false; } }
      else if (data === 'G' || matchesKey(data, 'end')) pinned = true;
      else if (data === 'o') { full = !full; pinned = true; refresh(); }
    },
    invalidate() {},
    dispose,
  };
}
/**
 * One transcript line, styled by its marker and wrapped with a hanging indent so a long tool line stays
 * readable: ◆ who speaks, → a tool call, ← its result, ✖ a failed one, … what was folded away.
 * @param {string} line
 * @param {number} span
 * @param {(color: PanelColor, text: string) => string} fg
 * @param {(text: string) => string} bold
 * @returns {string[]}
 */
function transcriptLines(line, span, fg, bold) {
  if (!line.trim()) return [''];
  const indent = /^ */.exec(line)?.[0].length ?? 0, body = line.slice(indent);
  const header = body.startsWith('◆ '), marked = header || /^[→←✖…] /.test(body);
  /** @type {PanelColor | null} */
  const color = header ? 'accent' : body.startsWith('→ ') ? 'muted' : body.startsWith('✖ ') ? 'warning' : body.startsWith('← ') || body.startsWith('… ') || indent >= 4 ? 'dim' : null;
  const paint = (/** @type {string} */ part) => (color ? fg(color, header ? bold(part) : part) : part);
  const hang = Math.min(Math.floor(span / 2), indent + (marked ? 2 : 0));
  const [first = '', ...rest] = wrapTextWithAnsi(body, Math.max(8, span - indent));
  const more = rest.length ? wrapTextWithAnsi(rest.join(' '), Math.max(8, span - hang)) : [];
  return [' '.repeat(indent) + paint(first), ...more.map(part => ' '.repeat(hang) + paint(part))];
}
/**
 * The follow-mode transcript overlay. `onClose` runs however the view is left, so the caller can reopen the
 * dashboard without leaving a timer behind.
 * @param {UIContext} ctx
 * @param {FollowSource} source
 * @param {{title?: string, onClose?: () => void | Promise<void>}} [options]
 * @returns {Promise<void>}
 */
export async function followView(ctx, source, options = {}) {
  if (ctx.mode !== 'tui' || typeof ctx.ui.custom !== 'function') return undefined;
  try {
    await ctx.ui.custom((tui, theme, keys, done) => {
      const view = createFollowView(source, { title: options.title, theme, keys, rows: () => tui.terminal?.rows, onUpdate: () => tui.requestRender(), onClose: () => done(undefined) });
      return {
        /** @param {number} w */
        render(w) { return view.render(w); },
        invalidate() {},
        dispose() { view.dispose(); },
        handleInput(/** @type {string} */ data) { view.handleInput(data); tui.requestRender(); },
      };
    }, { overlay: true, overlayOptions: () => ({ width: '90%', minWidth: 40, maxHeight: '80%', anchor: 'center', margin: 1 }) });
  } finally { if (options.onClose) await options.onClose(); }
}
/** @param {unknown} value @returns {string} */
function lastCacheRead(value) {
  const usage = validateUsageObservation(value, 'Last cache-read usage');
  if (!usage) return 'unknown';
  return usage.cacheRatio === null ? 'unknown' : `${(100 * usage.cacheRatio).toFixed(1)}%`;
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
    row('Warming', `Pi's native idle refreshes, kept for Main while the worker works and for the worker while its report waits (models with a priced prompt cache, except Codex and ChatGPT sign-in models; ${DEFAULT_CACHE_LIFETIME_S} s lifetime where Pi knows none) · Pi through 1.3.0 sends none in a Pair session${native ? ` · native ${native.cacheWarming}${native.cacheWarming === 'idle' ? '' : ' (not warmed)'}` : ''} · Main can also use Fabric cache.hold (Fabric ${FABRIC_CACHE_VERSION}+ on a Pi with scoped warming) · Pair holds no leases`));
  for (const w of summary.workers) {
    lines.push(row(w.id, `PID ${w.pid || 'not running'} · session ${w.sessionId || 'not created'}`), row('Workspace', `${w.cwd}${w.workspaceGit === false ? ' · not a Git repository' : ''}`));
    if (w.usage) lines.push(row('Usage', `${w.usage.requests} responses · reported $${w.usage.reportedCost.toFixed(4)} · ${w.usage.unknownCostRequests} with unknown price (inference only)`));
    if (w.lastExchange) lines.push(row('Exchange', `${w.lastExchange.direction} · ${w.lastExchange.kind}`));
  }
  lines.push(row('State dir', summary.directory), '',
    '## Legend',
    '> ● ready  ◉ working  ◐ waiting on Main  ○ stopped  ! needs attention',
    '> Plan: ✔ approved  ▶ in progress  ◐ in review  ⏸ held  ○ not started',
    '> Heartbeat: the live line above the editor shows the current step; the worker counts as stale after 5 minutes of silence.',
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
function chrome(body, width, { title, subtitle = [], hints = '', theme }) {
  const fg = painter(theme);
  const bold = (/** @type {string} */ text) => (theme?.bold ? theme.bold(text) : text);
  const rule = fg('border', '─'.repeat(Math.max(1, width)));
  const pad = (/** @type {string} */ line) => ` ${truncateToWidth(line, Math.max(1, width - 2), '')}`;
  return [rule, '', pad(fg('accent', bold(title))), ...subtitle.map(line => pad(fg('muted', line))), '', ...body.map(pad), '', ...(hints ? [pad(hints), ''] : []), rule];
}
/** The default keys of the bindings Pair names in hints, for when Pi's own hint helpers are unavailable. */
const DEFAULT_KEYS = /** @type {Readonly<Record<string, string>>} */ ({ 'tui.select.cancel': 'esc', 'tui.select.confirm': 'enter', 'app.tools.expand': 'ctrl+o' });
/** @param {...[string, string]} pairs @returns {string} */
function hints(...pairs) {
  return pairs.map(([key, action]) => {
    // Pi's hint helpers read its theme; without one (a test, a host that never set it) the plain words still read.
    try { return key.includes('.') ? keyHint(/** @type {import('@earendil-works/pi-tui').Keybinding} */ (key), action) : rawKeyHint(key, action); } catch { return `${DEFAULT_KEYS[key] ?? key} ${action}`; }
  }).join('  ');
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
function panelFormat(theme) {
  const fg = painter(theme);
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
function createTextView(raw, { title, theme, keys, rows = () => undefined, close, paint, format, section }) {
  let offset = 0, width = 80, message = '', lastQuery = '';
  /** @type {number | null} */ let cursor = null;
  /** @type {string | null} */ let query = null;
  /** @type {{width: number, lines: string[], starts: number[]}} */ let cache = { width: -1, lines: [], starts: [] };
  const fg = painter(theme);
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
  const is = (data, id, ...fallbacks) => keyIs(keys, data, id, fallbacks);
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
      else if (data === 'g' || matchesKey(data, 'home')) offset = 0;
      else if (data === 'G' || matchesKey(data, 'end')) offset = maxOffset();
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
    const component = viewComponent(view, tui);
    return component;
  });
}
/** @typedef {{section: string} | {id: string, label: string, value?: string, tone?: PanelColor, hint?: string}} MenuEntry */
/**
 * @param {MenuEntry[]} entries
 * @param {{title: string, subtitle?: string[], confirm?: string, cancel?: string, initial?: string, theme?: PanelTheme | null, keys?: KeyMatcher | null, rows?: () => number | undefined, done: (id: string | undefined) => void}} options
 * @returns {{render(width: number): string[], handleInput(data: string): void}}
 */
function createMenuView(entries, { title, subtitle = [], confirm = 'select', cancel = 'close', initial, theme, keys, rows = () => undefined, done }) {
  const fg = painter(theme);
  const items = entries.flatMap((entry, index) => ('id' in entry ? [index] : []));
  let selected = Math.max(0, items.findIndex(index => /** @type {{id: string}} */ (entries[index]).id === initial));
  const labelWidth = Math.min(36, Math.max(0, ...entries.map(entry => ('id' in entry && entry.value !== undefined ? visibleWidth(entry.label) : 0))));
  /** @param {string} data @param {string} id @param {...string} fallbacks */
  const is = (data, id, ...fallbacks) => keyIs(keys, data, id, fallbacks);
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
    // A select hands back the chosen text, so each option must be unique. A label that appears more than once
    // (the same action for two workers) is named with its section, and a text that still repeats is numbered,
    // so every choice maps back to its own entry.
    /** @type {string[]} */
    const sections = [];
    let section = '';
    for (const entry of entries) { if ('id' in entry) sections.push(section); else section = entry.section; }
    const repeated = new Set(items.map(item => item.label).filter((label, i, all) => all.indexOf(label) !== i));
    /** @type {string[]} */
    const labels = [];
    items.forEach((item, i) => {
      const base = `${repeated.has(item.label) && sections[i] ? `${sections[i]} · ` : ''}${item.value ? `${item.label}: ${item.value}` : item.label}`;
      let text = base;
      for (let n = 2; labels.includes(text) || text === 'Close'; n++) text = `${base} (${n})`;
      labels.push(text);
    });
    const choice = await ctx.ui.select([options.title, ...(options.subtitle || [])].join('\n'), [...labels, 'Close']);
    return items[labels.indexOf(choice ?? '')]?.id;
  }
  return ctx.ui.custom((tui, theme, keys, done) => {
    const view = createMenuView(entries, { ...options, theme, keys, rows: () => tui.terminal?.rows, done });
    const component = viewComponent(view, tui);
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
    '## Worker Fabric profile', ...(blockers.length ? blockers.map(item => check(false, item)) : [check(true, 'shellHangMs, maxDepth and Prewalk auto-arm are set for Pair')]), '',
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
const INDICATOR_LABEL = { minimal: 'badge + one live line above the editor', compact: 'badge only', board: 'badge + plan board above the editor', off: 'hidden' };

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
function supportedEfforts(model) {
  if (!model.reasoning) return ['off'];
  return EFFORT_LEVELS.filter(level => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    return level === 'xhigh' || level === 'max' ? mapped !== undefined : true;
  });
}
/** @param {EffortModel} model @param {import('./contracts.js').Effort} effort @returns {import('./contracts.js').Effort} */
function clampEffort(model, effort) {
  const levels = supportedEfforts(model), at = EFFORT_LEVELS.indexOf(effort);
  if (levels.includes(effort)) return effort;
  return EFFORT_LEVELS.slice(at + 1).find(level => levels.includes(level)) || EFFORT_LEVELS.slice(0, Math.max(0, at)).reverse().find(level => levels.includes(level)) || levels[0] || 'off';
}
/**
 * The registry's model for a worker spec, when both are known.
 * @template M @param {{modelRegistry?: {find(provider: string, id: string): M | undefined}}} ctx
 * @param {{provider?: string | null, model?: string | null} | undefined} spec @returns {M | undefined}
 */
export function workerModel(ctx, spec) {
  return spec?.provider && spec.model ? ctx.modelRegistry?.find(spec.provider, spec.model) : undefined;
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
      { id: '23', label: 'Attention cue', value: onOff(draft.attentionCue), hint: draft.attentionCue ? 'Terminal title gains "! pair · <reason>" and one bell when a worker needs you.' : 'Off: the terminal title and bell are never changed by Pair.' },
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
      else if (index === 23) draft.attentionCue = !draft.attentionCue;
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

/** Whether input `data` is keybinding `id` (or one of the literal fallbacks). @param {{matches(data: string, id: string): boolean} | null | undefined} keys @param {string} data @param {string} id @param {string[]} fallbacks */
function keyIs(keys, data, id, fallbacks) { return (keys?.matches(data, id) ?? false) || fallbacks.includes(data); }
/**
 * Whether input `data` cancels: Pi's cancel binding, or Esc in any terminal encoding. Terminals with the Kitty
 * keyboard protocol send Esc as `\x1b[27u`, so comparing with `\x1b` alone misses it.
 * @param {KeyMatcher | null | undefined} keys @param {string} data @returns {boolean}
 */
function isCancel(keys, data) { return keyIs(keys, data, 'tui.select.cancel', ['\x1b']) || matchesKey(data, 'escape'); }
/** @param {unknown} content @returns {string} */
function messageText(content) {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map(part => (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '')).join('\n') : '';
}
/** @typedef {'accent' | 'success' | 'warning' | 'error' | 'muted' | 'dim' | null} CardColor */
/** @typedef {{color: CardColor, text: string}} CardLine */
/** @typedef {{kind: 'report' | 'notice' | 'supervision' | 'check', report: Record<string, any> | null, lines: string[]}} CardParse */

/**
 * Parses a Pair message into the card it should render. Reports carry JSON after a first header line;
 * anything unparsable returns null so Pi keeps its default rendering of the raw text.
 * @param {string} text
 * @returns {CardParse | null}
 */
export function parsePairMessage(text) {
  const kind = /^FABRIC PAIR (REPORT|NOTICE|SUPERVISION|CHECK)\b/.exec(text)?.[1];
  if (!kind) return null;
  const lower = /** @type {'report' | 'notice' | 'supervision' | 'check'} */ (kind.toLowerCase());
  if (lower !== 'report') return { kind: lower, report: null, lines: text.replace(/^FABRIC PAIR [A-Z]+\s*[—-]?\s*/, '').split('\n') };
  try {
    const report = JSON.parse(text.slice(text.indexOf('\n{') + 1));
    return report && typeof report === 'object' && !Array.isArray(report) ? { kind: 'report', report, lines: [] } : null;
  } catch { return null; }
}
/** @param {unknown} value @returns {Record<string, any>[]} */
function objectList(value) { return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : []; }
/** @param {unknown} value @returns {number | null} */
function finiteOrNull(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
/**
 * One line describing the checks Pair ran itself. This is the only place a verified result may appear.
 * @param {unknown} checks
 * @param {boolean} expanded
 * @returns {CardLine}
 */
function pairVerifiedLine(checks, expanded) {
  const list = objectList(checks);
  if (!list.length) return { color: 'muted', text: 'Pair verified  none configured' };
  /** @param {Record<string, any>} check @returns {string} */
  const one = check => {
    const name = inline(check.name, 80) || 'check';
    const passed = check.passed === true;
    const suffix = passed ? '' : check.timedOut === true ? ' (timed out)' : ` (exit ${finiteOrNull(check.code) ?? 'unknown'})`;
    return `${passed ? '✔' : '✖'} ${name}${suffix}`;
  };
  const shown = expanded ? list : list.slice(0, 3);
  const failed = list.filter(check => check.passed !== true).length;
  return { color: failed ? 'warning' : 'success', text: `Pair verified  ${shown.map(one).join('  ')}${shown.length < list.length ? '  …' : ''}` };
}
/**
 * One line describing the worker's own claims. It is never presented as verification.
 * @param {unknown} checks
 * @param {boolean} expanded
 * @returns {CardLine}
 */
function workerClaimsLine(checks, expanded) {
  const list = objectList(checks);
  if (!list.length) return { color: 'dim', text: 'Worker claims  none reported' };
  /** @param {Record<string, any>} check @returns {string} */
  const icon = check => (check.result === 'pass' ? '✔' : check.result === 'fail' ? '✖' : '○');
  const passed = list.filter(check => check.result === 'pass').length, failed = list.filter(check => check.result === 'fail').length;
  const phrase = failed ? `${list.length} reported, ${passed} pass ${failed} fail` : `${list.length} reported pass`;
  const shown = expanded ? ` (${list.map(check => `${icon(check)} ${inline(check.name, 60) || 'check'}`).join('; ')})` : '';
  return { color: failed ? 'warning' : 'muted', text: `Worker claims  ${phrase}, not verified${shown}` };
}
/** @param {Record<string, any>} report @param {boolean} expanded @returns {CardLine[]} */
function reportCard(report, expanded) {
  const summary = typeof report.summary === 'string' ? report.summary.split('\n').filter(line => line.trim()) : [];
  const files = Array.isArray(report.actualChangedFiles) ? report.actualChangedFiles : Array.isArray(report.changedFiles) ? report.changedFiles : [];
  const fileCount = finiteOrNull(report.changedFileCount) ?? files.length;
  const peer = report.peerReview && typeof report.peerReview === 'object' ? report.peerReview : null;
  const peerVerdict = peer && typeof peer.verdict === 'string' ? peer.verdict : null;
  const step = typeof report.stepId === 'string' ? report.stepId.replace(/^step[-_ ]/i, '') : null;
  // A question or a blocker exists for its question: show it even collapsed, so the card is actionable.
  const kind = String(report.kind || 'report');
  const question = typeof report.question === 'string' && report.question.trim() ? report.question : '';
  const asksSomething = (kind === 'question' || kind === 'blocked') && question.length > 0;
  /** @type {CardLine[]} */
  const lines = [];
  // Header: what kind of report, which step, and the peer verdict when one exists.
  const head = ['◐', kindLabel(String(report.kind || 'report')), step ? `· step ${step}` : '', peerVerdict ? `· peer review: ${peerVerdict}` : ''].filter(Boolean).join(' ');
  lines.push({ color: peerVerdict === 'fail' ? 'warning' : 'accent', text: head });
  // The first summary line, so the card is useful before expanding. A question report leads with its
  // question instead: that is the reason it was sent.
  const summaryLines = summary.flatMap(line => line.split('\n')).filter(line => line.trim());
  if (expanded) for (const line of summaryLines) lines.push({ color: null, text: `  ${inline(line, 2000)}` });
  else lines.push({ color: null, text: `  ${inline(asksSomething ? question : summaryLines[0] ?? '(no summary)', 400)}` });
  lines.push(pairVerifiedLine(report.independentlyRunChecks, expanded));
  lines.push(workerClaimsLine(report.checks, expanded));
  // Files: count plus the first few names. A collapsed question drops this row to stay within six lines.
  const shownFiles = expanded ? files : files.slice(0, 3);
  if (expanded || !asksSomething) lines.push({ color: 'muted', text: `  ${fileCount} file${fileCount === 1 ? '' : 's'}${shownFiles.length ? ` · ${shownFiles.map(file => inline(String(file), 120)).join(', ')}` : ''}${shownFiles.length < files.length ? ', …' : ''}` });
  // Warnings only when the controller set them; a collapsed card keeps them on one row.
  const notices = [report.stepSizeNotice, report.workerBudgetNotice].filter(notice => typeof notice === 'string' && notice.trim()).map(notice => inline(String(notice), 300));
  if (notices.length) lines.push({ color: 'warning', text: `⚠ ${notices.join(' · ')}` });
  if (!expanded) return lines;
  // Waiting for Main is calm (accent), not a warning: Main answers it.
  if (question) {
    lines.push({ color: 'accent', text: kind === 'blocked' ? '  Blocker for Main' : '  Question for Main' });
    for (const line of question.split('\n').filter(part => part.trim())) lines.push({ color: null, text: `    ${inline(line, 2000)}` });
  }
  if (files.length > shownFiles.length) for (const file of files.slice(shownFiles.length)) lines.push({ color: 'dim', text: `    ${inline(String(file), 200)}` });
  if (Array.isArray(report.decisions) && report.decisions.length) {
    lines.push({ color: 'muted', text: '  Worker decisions' });
    for (const decision of report.decisions) lines.push({ color: null, text: `    • ${inline(String(decision), 500)}` });
  }
  if (peer) {
    lines.push({ color: peerVerdict === 'fail' ? 'warning' : 'muted', text: `  Peer review  ${[peer.reviewer, peer.status, peerVerdict].filter(Boolean).join(' · ')}` });
    if (typeof peer.error === 'string' && peer.error.trim()) lines.push({ color: 'warning', text: `    error: ${inline(peer.error, 400)}` });
    if (typeof peer.findings === 'string') for (const line of peer.findings.split('\n').filter((/** @type {string} */ part) => part.trim()).slice(0, 12)) lines.push({ color: 'dim', text: `    ${inline(line, 500)}` });
  }
  lines.push({ color: 'dim', text: `  report ${inline(String(report.reportId || 'unknown'), 120)} · checkpoint ${inline(String(report.checkpointHash || 'unknown'), 64)}` });
  return lines;
}
/**
 * The card for one Pair message: a short, trustworthy summary that keeps Pair's own checks apart from
 * the worker's claims. Returns null when the text is not a Pair message (Pi then renders it normally).
 * @param {string} text
 * @param {boolean} expanded
 * @returns {CardLine[] | null}
 */
export function pairMessageLines(text, expanded) {
  const parsed = parsePairMessage(text);
  if (!parsed) return null;
  if (parsed.kind === 'report' && parsed.report) return reportCard(parsed.report, expanded);
  // One vocabulary, decided by message kind and never by guessing at the words:
  //   ◐ accent  — Pair is telling Main something it must handle (notice and check);
  //   ⚠ warning — supervision reports a worker problem;
  //   ✔ success is reserved for a finished task, so it never labels a notice.
  const body = parsed.lines.map(line => line.trim()).filter(Boolean);
  const supervision = parsed.kind === 'supervision';
  const tone = supervision ? 'warning' : 'accent';
  const icon = supervision ? '⚠' : '◐';
  const label = parsed.kind === 'notice' ? 'Pair notice' : supervision ? 'Pair supervision' : 'Pair check';
  const shown = expanded ? body : body.slice(0, 2);
  /** @type {CardLine[]} */
  const card = [{ color: tone, text: `${icon} ${label}` }, ...shown.map(line => ({ color: /** @type {CardColor} */ (supervision ? 'warning' : 'muted'), text: `  ${inline(line, expanded ? 2000 : 400)}` }))];
  return card;
}
/** The key that expands collapsed chat output, as Pi shows it ("ctrl+o" unless rebound). @returns {string} */
function expandKey() {
  try { return keyText('app.tools.expand') || DEFAULT_KEYS['app.tools.expand']; } catch { return DEFAULT_KEYS['app.tools.expand']; }
}
/**
 * The chat card for a Pair message, on the same background Pi gives its own custom messages. A collapsed
 * card that hides something ends its first line with the expand key, as Pi's collapsed tool output does.
 * @param {{content: unknown}} message @param {{expanded: boolean, outputPad?: number}} options
 * @param {{fg(color: any, text: string): string, bg?(color: any, text: string): string} | undefined} theme
 * @returns {import('@earendil-works/pi-tui').Component | undefined}
 */
export function pairMessageComponent(message, options, theme) {
  const text = messageText(message.content);
  const lines = pairMessageLines(text, options.expanded);
  if (!lines) return undefined;
  const padding = Math.max(0, options.outputPad ?? 1);
  /** @param {CardLine[] | null} card */
  const words = card => (card ?? []).map(line => line.text).join('\n');
  const hint = !options.expanded && words(pairMessageLines(text, true)) !== words(lines) ? ` (${expandKey()} to expand)` : '';
  /** @type {{color: CardColor, text: string}[]} */
  const card = lines;
  // With Pi's theme the Box pads the card; a theme without backgrounds gets plain side padding.
  const pad = theme?.bg ? '' : ' '.repeat(padding);
  const body = {
    invalidate() {},
    /** @param {number} width */
    render(width) {
      const inner = Math.max(10, width - pad.length * 2);
      return card.flatMap(({ color, text: line }, index) => {
        const painted = color && theme ? theme.fg(color, line) : line;
        const suffix = index === 0 && hint ? (theme ? theme.fg('dim', hint) : hint) : '';
        return wrapTextWithAnsi(painted + suffix, inner).map(part => pad + part);
      });
    },
  };
  if (!theme?.bg) return body;
  const bg = theme.bg.bind(theme);
  const box = new Box(padding, 1, line => bg('customMessageBg', line));
  box.addChild(body);
  return box;
}

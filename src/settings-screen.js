import { Input, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { briefError, clone } from './util.js';
import { INDICATORS, validateConfig, validateConfigLayer } from './config.js';
import { EFFORT_LEVELS } from './contracts.js';
import { INDICATOR_LABEL, authorizeVerification, boxFrame, clampEffort, effortHint, hints, isCancel, keyIs, onOff, overlayOptions, overlayRows, packHints, settingsUI, supportedEfforts, workerModel } from './ui.js';
import { duplicateWorker, makeDefault, moveWorker } from './worker-config.js';

/** @typedef {import('./ui.js').ApplySettings} ApplySettings */
/** @typedef {import('./ui.js').SettingsOptions} SettingsOptions */
/** @typedef {import('./ui.js').PanelTheme} PanelTheme */
/** @typedef {import('./config.js').PairConfig} PairConfig */
/** @typedef {import('./config.js').ConfigScope} ConfigScope */
/** @typedef {import('./contracts.js').Effort} Effort */
/** @typedef {import('./contracts.js').VerificationCommand} VerificationCommand */
/** @typedef {import('./contracts.js').WorkerSpec} WorkerSpec */
/** @typedef {{matches(data: string, id: string): boolean}} KeyMatcher */
/** @typedef {{provider: string, id: string, name?: string, reasoning?: boolean, thinkingLevelMap?: Partial<Record<string, string | null>>}} ScreenModel */
/** @typedef {'workers' | 'review' | 'supervision' | 'limits' | 'verification' | 'peerReview' | 'runtime' | 'requirements' | 'evidence' | 'display' | 'general'} SettingsPage */
/** @typedef {'list' | 'options' | 'model' | 'input' | 'filter'} ScreenMode */
/** @typedef {{value: string, label: string, hint: string}} RowOption */
/** @typedef {{id: string, label: string, value: string, hint: string, kind: 'toggle' | 'choice' | 'number' | 'nullable' | 'text' | 'list' | 'model' | 'peer-model' | 'add' | 'open' | 'action' | 'note', options?: readonly RowOption[], tone?: 'warning', work?: 'verification' | 'migrate' | 'json', restart?: boolean}} SettingsRow */
/** @typedef {'ok' | 'error' | 'info' | 'none'} StatusTone */
/** @typedef {{saved: PairConfig, scope: ConfigScope, workerId: string, page: SettingsPage, rowId: string, status: string, tone: StatusTone}} ScreenSession */
/** @typedef {{run: 'verification'} | {run: 'migrate'} | {run: 'json'} | {run: 'save', next: PairConfig, label: string, value: string} | {run: 'remove', workerId: string} | {run: 'duplicate', workerId: string, newId: string}} ScreenAnswer */
/** @typedef {{terminal?: {rows?: number, columns?: number}, requestRender?(): void}} ScreenTui */
/** @typedef {{ctx: import('./ui.js').UIContext, session: ScreenSession, models: ScreenModel[], onApply: ApplySettings, options: SettingsOptions, theme: PanelTheme | null, keys: KeyMatcher | null, tui: ScreenTui, done: (value?: ScreenAnswer) => void}} ViewOptions */

/** The pages, in tab order. The ids are stable so a reopen lands on the same page. */
const PAGES = /** @type {readonly {id: SettingsPage, label: string}[]} */ ([
  { id: 'workers', label: 'Workers' }, { id: 'review', label: 'Review' }, { id: 'supervision', label: 'Supervision' },
  { id: 'limits', label: 'Limits' }, { id: 'verification', label: 'Verification' }, { id: 'peerReview', label: 'Peer review' },
  { id: 'runtime', label: 'Runtime' }, { id: 'requirements', label: 'Requirements' }, { id: 'evidence', label: 'Evidence' },
  { id: 'display', label: 'Display' }, { id: 'general', label: 'General' }
]);
/** Model picker rows shown at once; the rest scroll under the filter. */
const MODEL_ROWS = 6;
/** The description lines the page list offers before the layout starts shrinking it. */
const DESC_LINES = 3;

/**
 * The config path each row shows, for provenance and reset. A row that is not a config field (an action, a note,
 * the scope selector) has no entry and therefore no provenance label and no reset.
 * @type {Record<string, string>}
 */
const ROW_PATH = {
  // Workers: the array is marked as one leaf, so every worker row reads the same source.
  model: 'workers', effort: 'workers', readOnly: 'workers', workspace: 'workers',
  // Review
  policy: 'supervision.mode', stepFiles: 'supervision.maxStepFiles', revisions: 'supervision.maxRevisions',
  revisionsPerStep: 'supervision.maxRevisionsPerStep', finalReview: 'supervision.finalReview', detail: 'supervision.summaryDetail',
  autoDeliver: 'autoDeliverReports',
  // Supervision
  mainSupervision: 'mainSupervision', maxMainRecoveries: 'maxMainRecoveries', autoCheckIdle: 'autoCheckIdle',
  stepTimeout: 'limits.activeStepTimeoutMs', watchdog: 'control.watchdog', silentMs: 'control.silentMs',
  toolMaxMs: 'control.toolMaxMs', stepNudgeMs: 'control.stepNudgeMs', maxAutoRecoveries: 'control.maxAutoRecoveriesPerStep',
  compactionMaxMs: 'control.compactionMaxMs', mainHeartbeat: 'control.mainHeartbeat', mainHeartbeatMs: 'control.mainHeartbeatMs',
  pingTimeoutMs: 'control.pingTimeoutMs', noReportNudges: 'control.noReportNudges', maxSteersPerStep: 'control.maxSteersPerStep',
  providerCooldownMs: 'control.providerCooldownMs', quotaCooldownMs: 'control.quotaCooldownMs', maxProviderWaits: 'control.maxProviderWaits',
  // Limits
  stepTimeoutLimit: 'limits.activeStepTimeoutMs', maxReportsPerTask: 'limits.maxReportsPerTask',
  maxReportBytes: 'limits.maxReportBytes', maxAutomaticReportRepairs: 'limits.maxAutomaticReportRepairs',
  maxReportedCostUsd: 'limits.maxReportedCostUsd', maxOutputTokens: 'limits.maxOutputTokens',
  // Verification
  verification: 'verification.commands', requirePassing: 'verification.requirePassing', verificationTimeout: 'verification.timeoutMs',
  // Peer review
  peerEnabled: 'peerReview.enabled', peerModel: 'peerReview.model', peerOn: 'peerReview.on', peerTimeout: 'peerReview.timeoutMs',
  // Runtime
  runtimeBackend: 'runtime.backend', command: 'runtime.command', commandArgs: 'runtime.commandArgs',
  lowCommand: 'runtime.lowCommand', lowArgs: 'runtime.lowArgs', extraExtensions: 'runtime.extraExtensions',
  excludeExtensions: 'runtime.excludeExtensions', extraSkills: 'runtime.extraSkills', inheritExtensions: 'runtime.inheritExtensions',
  mcp: 'runtime.mcp', startupTimeoutMs: 'runtime.startupTimeoutMs', requestTimeoutMs: 'runtime.requestTimeoutMs',
  shutdownTimeoutMs: 'runtime.shutdownTimeoutMs',
  // Requirements, evidence, display, general
  fabric: 'requirements.fabric', fovea: 'requirements.fovea', prewalkDisabled: 'requirements.prewalkDisabled',
  autoCompaction: 'requirements.autoCompaction',
  maxFiles: 'evidence.maxFiles', maxTotalBytes: 'evidence.maxTotalBytes', maxArtifactBytes: 'evidence.maxArtifactBytes',
  indicator: 'indicator', cue: 'attentionCue',
  enabled: 'enabled', autoStart: 'autoStart', maxWorkers: 'maxWorkers', mainReadOnly: 'mainReadOnlyDuringTasks'
};
/**
 * Search words a row should also match, where the stored field name differs from what a human calls it. The
 * time limits are the clearest case: the field is toolMaxMs, and everyone looks for "timeout".
 * @type {Record<string, string>}
 */
const ROW_ALIAS = {
  stepTimeout: 'timeout', stepTimeoutLimit: 'timeout', toolMaxMs: 'timeout', stepNudgeMs: 'timeout', silentMs: 'timeout ping',
  pingTimeoutMs: 'timeout ping', compactionMaxMs: 'timeout', mainHeartbeatMs: 'interval', verificationTimeout: 'timeout',
  peerTimeout: 'timeout', startupTimeoutMs: 'timeout', requestTimeoutMs: 'timeout', shutdownTimeoutMs: 'timeout',
  maxOutputTokens: 'tokens output', maxReportedCostUsd: 'cost budget usd', maxReportBytes: 'size bytes'
};
/** @param {ConfigScope} scope @returns {string} */
const scopeName = scope => (scope === 'project' ? "this project's settings" : 'global settings');
/** @param {string} text @param {number} width @returns {string} */
const clip = (text, width) => truncateToWidth(text, Math.max(0, width), '…');
/** @param {string} text @param {number} width @returns {string} */
const padRight = (text, width) => text + ' '.repeat(Math.max(0, width - visibleWidth(text)));
/** @param {string} text @returns {string} */
const capitalize = text => text[0].toUpperCase() + text.slice(1);

/** How a row was activated: Space is the quick change, Enter asks for the full change. */
/** @typedef {{quick: boolean}} Activate */
const ENTER = /** @type {Activate} */ ({ quick: false });
const SPACE = /** @type {Activate} */ ({ quick: true });

/**
 * The one saving rule of both settings UIs: validate, then only write when the scope's config really changed,
 * keeping whatever the save returned (the reloaded scope) as the new baseline.
 * @param {ScreenSession} session @param {PairConfig} next @param {ApplySettings} onApply @returns {Promise<void>}
 */
async function persist(session, next, onApply) {
  const config = validateConfig(next);
  if (JSON.stringify(config) !== JSON.stringify(session.saved)) session.saved = clone(await onApply(config, session.scope) || config);
}

/** @param {import('./ui.js').UIContext} ctx @returns {Promise<ScreenModel[]>} */
async function availableModels(ctx) {
  try {
    const list = await Promise.resolve(ctx.modelRegistry?.getAvailable?.() ?? []);
    return [...list]
      .map(model => ({ provider: String(model.provider), id: String(model.id), name: model.name, reasoning: model.reasoning, thinkingLevelMap: model.thinkingLevelMap }))
      .sort((a, b) => `${a.provider}/${a.id}`.localeCompare(`${b.provider}/${b.id}`));
  } catch { return []; }
}

/**
 * One settings overlay that stays open while the human edits. Every setting is a row on a page; anything that
 * needs a Pi dialog resolves the view, runs outside it, and reopens on the same page and row.
 */
class SettingsView {
  /** @param {ViewOptions} options */
  constructor(options) {
    this.ctx = options.ctx; this.session = options.session; this.models = options.models;
    this.onApply = options.onApply; this.options = options.options;
    this.theme = options.theme; this.keys = options.keys; this.tui = options.tui; this.finish = options.done;
    /** @type {ScreenMode} */ this.mode = 'list';
    /** @type {SettingsRow | null} */ this.editing = null;
    /** @type {{items: readonly RowOption[], index: number, hint: string} | null} */ this.optionsState = null;
    /** @type {Input | null} */ this.input = null;
    /** @type {{input: Input, index: number, peer?: boolean} | null} */ this.picker = null;
    /** @type {{input: Input, index: number, matches: {page: SettingsPage, row: SettingsRow}[]} | null} */ this.filterState = null;
    this.saving = false;
    // Pi sets focused once, when the overlay mounts in list mode, so Inputs opened later must be told themselves.
    this.wantsFocus = false;
  }

  /** @param {import('./ui.js').PanelColor} color @param {string} text @returns {string} */
  paint(color, text) { return this.theme ? this.theme.fg(color, text) : text; }
  /** @param {string} text @returns {string} */
  bold(text) { return this.theme?.bold ? this.theme.bold(text) : text; }

  /** Pi focuses the overlay component; the cursor belongs to whichever Input is open. */
  get focused() { return this.wantsFocus; }
  /** @param {boolean} value */
  set focused(value) { this.wantsFocus = value; const input = this.activeInput(); if (input) input.focused = value; }
  /**
   * An Input for this view: it carries the focus Pi granted the overlay, since Pi only sets that once at mount.
   * @param {string} value @param {string} [placeholder] @returns {Input}
   */
  openedInput(value, placeholder) { const input = prefilled(value, placeholder); input.focused = this.wantsFocus; return input; }
  /** @returns {Input | null} */
  activeInput() {
    if (this.mode === 'model') return this.picker?.input ?? null;
    if (this.mode === 'filter') return this.filterState?.input ?? null;
    return this.mode === 'input' ? this.input : null;
  }
  /** Re-render after this view changed something. */
  refresh() { this.tui.requestRender?.(); }

  // ---- the page model -------------------------------------------------------

  /** @returns {WorkerSpec} */
  worker() {
    const saved = this.session.saved;
    return saved.workers.find(worker => worker.id === this.session.workerId) || saved.workers[0];
  }

  /**
   * The rows of one page. Values come from the last saved config, so a failed save keeps showing it.
   * @param {SettingsPage} page @returns {SettingsRow[]}
   */
  rowsFor(page) {
    const saved = this.session.saved, worker = this.worker();
    /** @type {SettingsRow[]} */
    const rows = [];
    if (page === 'workers') {
      // The list itself, in order: the first entry is the default, so order is the one source of truth. One row per
      // configured worker, whatever the selection, because managing them is what this page is for.
      saved.workers.forEach((slot, index) => rows.push({ id: `slot:${slot.id}`, label: `${index === 0 ? '★' : '·'} ${slot.id}`,
        value: `${slot.provider && slot.model ? `${slot.provider}/${slot.model}` : 'no model yet'} · ${slot.effort}`, kind: 'note',
        hint: index === 0 ? `${slot.id} is the default: a bare /pair start and a dispatch to a worker use the first entry.` : `${slot.id} is not the default. Make default moves it first.` }));
      if (saved.workers.length > 1) rows.push({ id: 'worker', label: 'Editing', value: worker.id, kind: 'choice',
        options: saved.workers.map(slot => ({ value: slot.id, label: slot.id, hint: slot.id === worker.id ? 'The worker slot you are editing now.' : 'Edit this worker slot instead.' })),
        hint: 'Which worker slot this page edits. Only one worker runs at a time.' });
      const model = worker.provider && worker.model ? `${worker.provider}/${worker.model}` : '';
      rows.push({ id: 'model', label: 'Model', value: model || 'not chosen', kind: 'model', ...(model ? {} : { tone: /** @type {const} */ ('warning') }),
        hint: model ? `The model that writes the code. Main keeps its own model (${this.ctx.model ? `${this.ctx.model.provider}/${this.ctx.model.id}` : 'not selected'}); change that with /model.` : 'Choose the model the worker runs. Pair needs one before the worker can start.' });
      const known = /** @type {ScreenModel | undefined} */ (workerModel(this.ctx, worker));
      rows.push({ id: 'effort', label: 'Thinking effort', value: worker.effort, kind: 'choice', options: levelsFor(known).map(level => ({ value: level, label: level, hint: effortHint(known, level) })),
        hint: known ? `How hard the worker thinks. ${known.provider}/${known.id} supports ${supportedEfforts(known).join(', ')}.` : 'How hard the worker thinks. Checked against the worker model when it starts.' });
      rows.push({ id: 'readOnly', label: 'Read-only', value: onOff(worker.readOnly), kind: 'toggle',
        hint: 'On: the worker can only read and search; it cannot edit files. Not supported together with Fabric.' });
      rows.push({ id: 'workspace', label: 'Workspace', value: worker.cwd || 'same as Main', kind: 'text',
        hint: "The folder the worker edits, as an absolute path. Blank means Main's workspace." });
      // The list itself is editable here, not only in the commands: order is what "default" means.
      const at = saved.workers.findIndex(slot => slot.id === worker.id);
      rows.push({ id: 'default', label: 'Make default', value: at === 0 ? 'already first' : 'move first', kind: 'action',
        hint: 'A bare /pair start and a dispatch to a worker use the first entry. Moving this worker first makes it the default.' });
      rows.push({ id: 'moveUp', label: 'Move up', value: at === 0 ? 'at the top' : `position ${at + 1} of ${saved.workers.length}`, kind: 'action',
        hint: 'Move this worker one place earlier in the list.' });
      rows.push({ id: 'moveDown', label: 'Move down', value: at === saved.workers.length - 1 ? 'at the bottom' : `position ${at + 1} of ${saved.workers.length}`, kind: 'action',
        hint: 'Move this worker one place later in the list.' });
      rows.push({ id: 'duplicate', label: 'Duplicate', value: 'under a new id…', kind: 'action',
        hint: 'Copy this worker under a new id, right after it. The copy has the same settings but its own conversation.' });
      rows.push({ id: 'remove', label: 'Remove', value: saved.workers.length > 1 ? 'this worker…' : 'last worker',
        kind: 'action', ...(saved.workers.length > 1 ? {} : { tone: /** @type {const} */ ('warning') }),
        hint: saved.workers.length > 1 ? 'Remove this worker slot. Its conversation is kept unless you discard it.' : 'Pair needs at least one worker; add another before removing this one.' });
      rows.push({ id: 'add', label: 'Add a worker…', value: '', kind: 'add', hint: 'Add another worker slot. Only one worker runs at a time.' });
      return rows;
    }
    if (page === 'review') {
      rows.push({ id: 'policy', label: 'Review policy', value: saved.supervision.mode, kind: 'choice', options: POLICY_OPTIONS,
        hint: 'How often Main reviews the worker. Final acceptance is always required.' });
      // Shown for every mode rather than only every-step: a setting with no row in some configuration is a setting
      // the screen cannot be trusted to expose.
      rows.push({ id: 'stepFiles', label: 'Step size limit', value: `${saved.supervision.maxStepFiles ?? 5} files`, kind: 'number',
        hint: 'Every-step only: a step that changes more files than this cannot be approved; Main asks for smaller steps.' });
      rows.push({ id: 'revisions', label: 'Revision limit', value: String(saved.supervision.maxRevisions), kind: 'number',
        hint: 'How many times Main may send work back before the task stops (0–20).' });
      rows.push({ id: 'revisionsPerStep', label: 'Revisions per step', value: String(saved.supervision.maxRevisionsPerStep), kind: 'number',
        hint: 'How many times one step may be sent back before Main must approve it or move on (0–20).' });
      // Final review is not a setting this release can turn off, so the row states the fact instead of offering a lie.
      rows.push({ id: 'finalReview', label: 'Final review', value: 'always', kind: 'note',
        hint: 'Main accepts the finished task. Every task ends with this review; this release does not allow turning it off.' });
      rows.push({ id: 'detail', label: 'Report detail', value: saved.supervision.summaryDetail, kind: 'choice', options: DETAIL_OPTIONS,
        hint: 'How much the worker writes in each report.' });
      rows.push({ id: 'autoDeliver', label: 'Deliver reports automatically', value: onOff(saved.autoDeliverReports), kind: 'toggle',
        hint: "On: each worker report reaches Main as soon as Main's current work is done. Off: Main collects reports with pair_yield, or send them with /pair yield." });
      return rows;
    }
    if (page === 'supervision') {
      // Supervision: what Pair does on its own when the worker stalls, and how far it may go. None of these fields is
      // part of the worker's identity, so a change here never interrupts a running worker.
      rows.push({ id: 'mainSupervision', label: 'Main supervision', value: onOff(saved.mainSupervision), kind: 'toggle',
        hint: 'On: Pair tells Main when a task stops, and Main may recover it with pair_recover. Off: Main is told the facts but cannot resume; only the human can, with /pair resume.' });
      rows.push({ id: 'maxMainRecoveries', label: 'Main recoveries per task', value: String(saved.maxMainRecoveries), kind: 'number',
        hint: 'How many times Main may recover one task (0–20). One is given back each time it approves a step.' });
      rows.push({ id: 'autoCheckIdle', label: 'Check in when Main is idle', value: onOff(saved.autoCheckIdle), kind: 'toggle',
        hint: 'On: Pair asks idle Main to look at a task nobody is working on, and at reports it will not deliver by itself. Once per task state.' });
      rows.push({ id: 'stepTimeout', label: 'Step time limit', value: minutesLabel(saved.limits.activeStepTimeoutMs), kind: 'number',
        hint: 'Minutes a step may run before Pair pauses it for review. The watchdog nudges and, when it can, recovers before this is reached.' });
      rows.push({ id: 'watchdog', label: 'Watchdog', value: onOff(saved.control.watchdog), kind: 'toggle',
        hint: 'On: Pair itself re-prompts a run that ended without a report, nudges long steps, stops hung tools, restarts frozen workers and waits out provider limits — each within the budgets below.' });
      rows.push({ id: 'silentMs', label: 'Silence before a ping', value: durationLabel(saved.control.silentMs), kind: 'number',
        hint: 'How long a running worker may go without any event before Pair asks whether it is still alive. Twice this, the request is treated as stalled.' });
      rows.push({ id: 'toolMaxMs', label: 'Tool time limit', value: durationLabel(saved.control.toolMaxMs), kind: 'number',
        hint: 'How long one tool call may run before the watchdog stops it (watch modes, dev servers and interactive prompts never end).' });
      rows.push({ id: 'stepNudgeMs', label: 'Step nudge', value: durationLabel(saved.control.stepNudgeMs), kind: 'number',
        hint: 'How long a step may run before Pair asks the worker to report what is left. Once per step attempt; it does not pause anything.' });
      rows.push({ id: 'maxAutoRecoveries', label: 'Watchdog recoveries per step', value: String(saved.control.maxAutoRecoveriesPerStep), kind: 'number',
        hint: 'How many times the watchdog may restart a step on its own (0–20). Provider waits and nudges do not count.' });
      rows.push({ id: 'compactionMaxMs', label: 'Compaction time limit', value: durationLabel(saved.control.compactionMaxMs), kind: 'number',
        hint: 'How long a between-run compaction may take before Pair stops it. 0 refuses compaction outside a run. A generous limit lets a 1M-token worker compact instead of cancelling it.' });
      rows.push({ id: 'mainHeartbeat', label: 'Main heartbeat', value: saved.control.mainHeartbeat, kind: 'choice',
        options: [{ value: 'off', label: 'off', hint: 'Nothing extra is sent to Main.' }, { value: 'note', label: 'note', hint: 'One display-only line with the worker state, every interval.' }, { value: 'wake', label: 'wake', hint: 'A line and a short prompt asking Main to pair_peek and act only on problems.' }],
        hint: 'While a task runs and Main is idle: how often Main is reminded of the worker, and whether that starts a turn.' });
      rows.push({ id: 'mainHeartbeatMs', label: 'Heartbeat interval', value: durationLabel(saved.control.mainHeartbeatMs), kind: 'number',
        hint: 'How often the heartbeat fires while a task runs. Off costs nothing.' });
      // The control budgets that had no row before: each one is a real knob, so each one is editable here.
      rows.push({ id: 'pingTimeoutMs', label: 'Ping answer limit', value: durationLabel(saved.control.pingTimeoutMs), kind: 'number',
        hint: 'How long Pair waits for the worker to answer a liveness ping before treating the run as stalled.' });
      rows.push({ id: 'noReportNudges', label: 'Nudges without a report', value: String(saved.control.noReportNudges), kind: 'number',
        hint: 'How many times Pair re-prompts a run that ended without a report before it stops trying (0–5).' });
      rows.push({ id: 'maxSteersPerStep', label: 'Steers per step', value: String(saved.control.maxSteersPerStep), kind: 'number',
        hint: 'How many human steering messages one step may receive before further ones are refused (0–20).' });
      rows.push({ id: 'providerCooldownMs', label: 'Provider cooldown', value: durationLabel(saved.control.providerCooldownMs), kind: 'number',
        hint: 'How long Pair waits before retrying a provider that failed, unless it asked for a longer pause.' });
      rows.push({ id: 'quotaCooldownMs', label: 'Quota cooldown', value: durationLabel(saved.control.quotaCooldownMs), kind: 'number',
        hint: 'How long Pair waits when a provider reports an exhausted quota.' });
      rows.push({ id: 'maxProviderWaits', label: 'Provider waits per step', value: String(saved.control.maxProviderWaits), kind: 'number',
        hint: 'How many provider waits one step may use before Pair pauses the task for you (0–20).' });
      return rows;
    }
    if (page === 'limits') {
      rows.push({ id: 'stepTimeoutLimit', label: 'Step time limit', value: minutesLabel(saved.limits.activeStepTimeoutMs), kind: 'number',
        hint: 'Minutes a step may run before Pair pauses it for review. The watchdog nudges and, when it can, recovers before this is reached.' });
      rows.push({ id: 'maxReportsPerTask', label: 'Reports per task', value: String(saved.limits.maxReportsPerTask), kind: 'number',
        hint: 'How many reports one task may produce before Pair stops accepting more (1–1000).' });
      rows.push({ id: 'maxReportBytes', label: 'Report size limit', value: `${Math.round(saved.limits.maxReportBytes / 1024)} KB`, kind: 'number',
        hint: 'The largest report Pair accepts, in KB (1–1024). A longer report is refused and the worker asked for a shorter one.' });
      rows.push({ id: 'maxAutomaticReportRepairs', label: 'Report repairs', value: String(saved.limits.maxAutomaticReportRepairs), kind: 'number',
        hint: 'How many times Pair repairs a malformed report on its own before it asks Main (0–20).' });
      rows.push({ id: 'maxReportedCostUsd', label: 'Cost limit', value: nullableNumber(saved.limits.maxReportedCostUsd, value => `$${value}`), kind: 'nullable',
        hint: 'Refuse to start a step once the task has reported more than this. None means no limit.' });
      rows.push({ id: 'maxOutputTokens', label: 'Output token limit', value: nullableNumber(saved.limits.maxOutputTokens, value => `${value} tokens`), kind: 'nullable',
        hint: 'The largest output one model turn may produce. None uses the model default.' });
      return rows;
    }
    if (page === 'verification') {
      const names = saved.verification.commands.map(command => command.name);
      rows.push({ id: 'verification', label: 'Verification commands', value: names.length ? `${names.length} configured` : 'none', kind: 'open', work: 'verification',
        hint: `Commands Pair runs itself at every checkpoint, with your permissions (for example your tests). Enter opens the editor.${names.length ? ` Configured: ${names.join(', ')}.` : ''}` });
      rows.push({ id: 'requirePassing', label: 'Require passing', value: onOff(saved.verification.requirePassing), kind: 'toggle',
        hint: 'On: a checkpoint is refused while a verification command fails. Off: the result is reported, not enforced.' });
      rows.push({ id: 'verificationTimeout', label: 'Command time limit', value: durationLabel(saved.verification.timeoutMs), kind: 'number',
        hint: 'How long one verification command may run before Pair stops it.' });
      return rows;
    }
    if (page === 'peerReview') {
      rows.push({ id: 'peerEnabled', label: 'Peer review', value: onOff(saved.peerReview.enabled), kind: 'toggle',
        hint: 'On: a second model reads the work and its verdict is shown to Main. It never decides anything itself.' });
      rows.push({ id: 'peerModel', label: 'Reviewer model', value: saved.peerReview.provider && saved.peerReview.model ? `${saved.peerReview.provider}/${saved.peerReview.model}` : 'not chosen', kind: 'peer-model',
        ...(saved.peerReview.provider && saved.peerReview.model ? {} : { tone: /** @type {const} */ ('warning') }),
        hint: 'The model that reads the work. It needs a provider and model before peer review can be turned on.' });
      rows.push({ id: 'peerOn', label: 'Review when', value: saved.peerReview.on, kind: 'choice',
        options: [{ value: 'checkpoints', label: 'checkpoints', hint: 'Read every checkpoint report.' }, { value: 'final', label: 'final', hint: 'Read once, at the final review.' }],
        hint: 'Which reports the reviewer reads.' });
      rows.push({ id: 'peerTimeout', label: 'Review time limit', value: durationLabel(saved.peerReview.timeoutMs), kind: 'number',
        hint: 'How long the reviewer may take before its verdict is dropped and the task continues without it.' });
      return rows;
    }
    if (page === 'runtime') {
      rows.push({ id: 'runtimeBackend', label: 'Backend', value: saved.runtime.backend, kind: 'choice',
        options: [{ value: 'pi', label: 'pi', hint: 'Run the worker as a Pi process. Every other runtime row applies.' }, { value: 'low', label: 'low', hint: 'Run the worker through the low command and its arguments.' }],
        hint: `How a worker runs. Restart-bound: applies at the next worker restart.${this.taskNote()}` });
      rows.push({ id: 'command', label: 'Program', value: saved.runtime.command || 'pi', kind: 'text', restart: true,
        hint: 'The executable Pair starts for a worker. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'commandArgs', label: 'Arguments', value: listLabel(saved.runtime.commandArgs), kind: 'list', restart: true,
        hint: 'Arguments for the program, comma- or line-separated. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'lowCommand', label: 'low program', value: saved.runtime.lowCommand, kind: 'text', restart: true,
        hint: 'The command the low backend runs. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'lowArgs', label: 'low arguments', value: listLabel(saved.runtime.lowArgs), kind: 'list', restart: true,
        hint: 'Arguments for the low program, comma- or line-separated. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'extraExtensions', label: 'Extra extensions', value: listLabel(saved.runtime.extraExtensions), kind: 'list', restart: true,
        hint: 'Extensions the worker loads on top of yours, comma- or line-separated. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'excludeExtensions', label: 'Excluded extensions', value: listLabel(saved.runtime.excludeExtensions), kind: 'list', restart: true,
        hint: 'Extensions the worker must not load, comma- or line-separated. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'extraSkills', label: 'Extra skills', value: listLabel(saved.runtime.extraSkills), kind: 'list', restart: true,
        hint: 'Skill folders the worker loads on top of yours, comma- or line-separated. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'inheritExtensions', label: 'Inherit extensions', value: onOff(saved.runtime.inheritExtensions), kind: 'toggle', restart: true,
        hint: 'On: the worker loads the same extensions this session has. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'mcp', label: 'MCP servers', value: onOff(saved.runtime.mcp), kind: 'toggle', restart: true,
        hint: 'On: the worker loads your MCP servers. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'startupTimeoutMs', label: 'Startup limit', value: durationLabel(saved.runtime.startupTimeoutMs), kind: 'number', restart: true,
        hint: 'How long a worker process may take to become ready. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'requestTimeoutMs', label: 'Request limit', value: durationLabel(saved.runtime.requestTimeoutMs), kind: 'number', restart: true,
        hint: 'How long one request to the worker may take before Pair treats it as unanswered. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'shutdownTimeoutMs', label: 'Shutdown limit', value: durationLabel(saved.runtime.shutdownTimeoutMs), kind: 'number', restart: true,
        hint: 'How long Pair waits for a worker to exit before it says the exit is unconfirmed. Restart-bound: applies at the next worker restart.' });
      return rows;
    }
    if (page === 'requirements') {
      rows.push({ id: 'fabric', label: 'Fabric', value: onOff(saved.requirements.fabric), kind: 'toggle', restart: true,
        hint: 'On: a worker cannot start without Fabric, and Pair checks the tools it needs at preflight. Restart-bound.' });
      rows.push({ id: 'fovea', label: 'Fovea', value: onOff(saved.requirements.fovea), kind: 'toggle', restart: true,
        hint: 'On: a worker cannot start without Fovea. Restart-bound.' });
      rows.push({ id: 'prewalkDisabled', label: 'Prewalk disabled', value: onOff(saved.requirements.prewalkDisabled), kind: 'toggle', restart: true,
        hint: 'On: the worker starts with Prewalk turned off, because a Pair step is already a plan. Restart-bound.' });
      rows.push({ id: 'autoCompaction', label: 'Auto compaction', value: onOff(saved.requirements.autoCompaction), kind: 'toggle', restart: true,
        hint: 'On: the worker may compact its own conversation when it fills. Restart-bound.' });
      return rows;
    }
    if (page === 'evidence') {
      rows.push({ id: 'maxFiles', label: 'File limit', value: String(saved.evidence.maxFiles), kind: 'number', restart: true,
        hint: 'How many files one snapshot may cover. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'maxTotalBytes', label: 'Snapshot size limit', value: bytesLabel(saved.evidence.maxTotalBytes), kind: 'number', restart: true,
        hint: 'How much file content one snapshot may read in total. Restart-bound: applies at the next worker restart.' });
      rows.push({ id: 'maxArtifactBytes', label: 'File size limit', value: bytesLabel(saved.evidence.maxArtifactBytes), kind: 'number', restart: true,
        hint: 'Files larger than this are recorded by name and size, not content. Restart-bound: applies at the next worker restart.' });
      return rows;
    }
    if (page === 'display') {
      rows.push({ id: 'indicator', label: 'Indicator', value: saved.indicator, kind: 'choice',
        options: INDICATORS.map(indicator => ({ value: indicator, label: indicator, hint: `${capitalize(INDICATOR_LABEL[indicator])}.` })),
        hint: `What Pair shows above the editor. Display only; it never affects work. ${capitalize(INDICATOR_LABEL[saved.indicator])}.` });
      rows.push({ id: 'cue', label: 'Attention cue', value: onOff(saved.attentionCue), kind: 'toggle',
        hint: 'On: the terminal title gains "! pair · <reason>" and rings once when a worker needs you.' });
      return rows;
    }
    rows.push({ id: 'enabled', label: 'Pair enabled', value: onOff(saved.enabled), kind: 'toggle', ...(saved.enabled ? {} : { tone: /** @type {const} */ ('warning') }),
      hint: saved.enabled ? 'Main can hand implementation work to the worker.' : 'Pair accepts no new work while this is off.' });
    rows.push({ id: 'autoStart', label: 'Start with each session', value: onOff(saved.autoStart), kind: 'toggle',
      hint: 'Start the worker when a session opens. No model turn is requested.' });
    rows.push({ id: 'maxWorkers', label: 'Worker slots in use', value: String(saved.maxWorkers), kind: 'number',
      hint: 'How many configured workers the rest of Pair may start (1–8). The Workers page lists all of them.' });
    rows.push({ id: 'mainReadOnly', label: 'Main is read-only in a task', value: onOff(saved.mainReadOnlyDuringTasks), kind: 'toggle',
      hint: 'On: while a task runs, Main may not edit files; only the worker writes. Off: Main may edit too, at the risk of two writers.' });
    rows.push({ id: 'scope', label: 'Save to', value: this.session.scope === 'project' ? 'this project' : 'global', kind: 'choice', options: scopeOptions(this.ctx),
      hint: 'This project: overrides for this repository on top of the global defaults. Global: defaults for every project. Switching copies nothing.' });
    // The whole scope's file, edited as JSON: the escape hatch for a field the rows do not cover, and the quickest
    // way to copy settings between machines. It validates as a layer before it is written, so it cannot corrupt one.
    rows.push({ id: 'json', label: 'Edit as JSON…', value: 'this scope', kind: 'open', work: 'json',
      hint: 'Open this scope\'s settings file as JSON in the editor. It is validated before saving, and an invalid edit is refused with the file left as it was.' });
    // Only a scope with a pending migration offers it (and only a host that can run one): almost nobody has one.
    if (this.options.migrate && this.options.migrationPending?.(this.session.scope)) rows.push({ id: 'migrate', label: 'Review or migrate this scope…', value: 'pending', kind: 'open', work: 'migrate', tone: 'warning',
      hint: 'Preview and apply a pending settings migration for this scope.' });
    return rows;
  }

  /** The selected row, tracked by id so it survives rows appearing and disappearing. @returns {SettingsRow} */
  currentRow() {
    const rows = this.rowsFor(this.session.page);
    return rows.find(row => row.id === this.session.rowId) || rows[0];
  }
  /** @returns {number} */
  currentIndex() { return Math.max(0, this.rowsFor(this.session.page).findIndex(row => row.id === this.currentRow().id)); }

  // ---- rendering ------------------------------------------------------------

  /** @param {number} width @returns {string[]} */
  render(width) {
    const w = Math.max(2, Math.floor(width)), content = Math.max(1, w - 4);
    const rows = this.tui.terminal?.rows;
    return boxFrame(this.interior(content, rows ? overlayRows(rows) : 0), w, {
      title: 'Pair settings', right: this.session.scope === 'project' ? 'Saves to: this project' : 'Saves to: all projects (global)', theme: this.theme });
  }

  /**
   * The frame's interior: tabs, rows, description and status above the hints, inside the bottom border. Room runs
   * out in a fixed order (spacers, then description, then the row window), so the keys never scroll away.
   * @param {number} width @param {number} budget total overlay rows, or 0 when the terminal size is unknown
   * @returns {string[]}
   */
  interior(width, budget) {
    const lower = [this.statusLine(width), ...this.hintLines(width)];
    const available = budget ? Math.max(1, budget - 2 - lower.length) : Number.POSITIVE_INFINITY;
    const lines = [...this.upper(width, available), ...lower];
    if (!budget) return lines;
    // Last resort on a very short terminal: give up rows from the top, never the hints or the border.
    return lines.length + 2 <= budget ? lines : lines.slice(lines.length - Math.max(1, budget - 2));
  }

  /**
   * Everything above the status line for the current page, padded to the tallest page, so the box keeps one
   * height while moving between rows and pages.
   * @param {number} width @param {number} available @returns {string[]}
   */
  upper(width, available) {
    const current = this.pageLines(width, this.session.page, available);
    // Compare against the tallest page at the same room, so the box does not jump when moving between pages.
    let target = current.length;
    for (const page of PAGES) if (page.id !== this.session.page) target = Math.max(target, this.pageLines(width, page.id, available).length);
    return current.length >= target ? current : [...current, ...Array(target - current.length).fill('')];
  }

  /**
   * One page's upper block, shrunk to `available` lines: spacers first, then the description, then the rows.
   * @param {number} width @param {SettingsPage} page @param {number} available @returns {string[]}
   */
  pageLines(width, page, available) {
    const tabs = [this.tabLine(width)];
    const warn = this.session.saved.enabled ? [] : [this.paint('warning', clip('Pair is off — it accepts no new work. Turn it on in General.', width))];
    const list = page === this.session.page ? this.listLines(width) : this.rowsFor(page).map(row => this.rowLine(row, width, false));
    // An option list or picker replaces the rows, so one heading says what is being chosen.
    const heading = page === this.session.page && this.headingText() ? [this.paint('muted', clip(this.headingText(), width))] : [];
    // The description block keeps its full height, so the box does not jump when a row's explanation wraps shorter.
    const wrapped = wrapTextWithAnsi(this.descriptionText(page), Math.max(1, width)).slice(0, DESC_LINES);
    const description = Array.from({ length: DESC_LINES }, (_, index) => this.paint('dim', clip(wrapped[index] ?? '', width)));
    for (let win = list.length, desc = description.length, spacers = true; ;) {
      const start = windowStart(list.length, page === this.session.page ? this.listSelected() : 0, win);
      const lines = [...tabs, ...warn, ...heading, ...(spacers ? [''] : []), ...list.slice(start, start + win), ...(spacers ? [''] : []), ...description.slice(0, desc)];
      if (lines.length <= available) return lines;
      if (spacers) { spacers = false; continue; }
      if (desc > 0) { desc--; continue; }
      if (win > 1) { win--; continue; }
      return lines.slice(lines.length - Math.max(1, available));
    }
  }

  /**
   * The tab bar scrolls rather than truncating: eleven pages do not fit 60 columns, and a page you cannot see is a
   * page you cannot reach. The current page is always inside the window, which slides with it.
   * @param {number} width @returns {string}
   */
  tabLine(width) {
    // Brackets mark the active page without colour, for tests and terminals that have no theme.
    const sep = this.paint('dim', ' · '), labels = PAGES.map(page => page.label);
    /** @param {{id: SettingsPage, label: string}} page @returns {string} */
    const token = page => (page.id === this.session.page ? `[ ${page.label} ]` : page.label);
    const full = PAGES.map((/** @type {{id: SettingsPage, label: string}} */ page) => ({ text: this.paint(page.id === this.session.page ? 'accent' : 'muted', page.id === this.session.page ? this.bold(token(page)) : page.label) }));
    if (visibleWidth(full.map(item => item.text).join(sep)) <= width) return full.map(item => item.text).join(sep);
    // The window that shows the most whole tabs while keeping the current page visible, measured with its own ◂/▸
    // markers so a marker can never push a tab off the edge. Eleven pages make an exhaustive search cheap.
    const index = PAGES.findIndex(page => page.id === this.session.page);
    // Measured as it will be drawn: the active tab carries its brackets, which are two columns wider than its label.
    /** @param {number} from @param {number} to @returns {number} */
    const spanWidth = (from, to) => visibleWidth([...(from > 0 ? ['◂'] : []),
      ...labels.slice(from, to + 1).map((label, offset) => (from + offset === index ? `[ ${label} ]` : label)),
      ...(to < PAGES.length - 1 ? ['▸'] : [])].join(' · '));
    let best = { from: index, to: index, width: Number.POSITIVE_INFINITY };
    for (let from = 0; from <= index; from++) {
      for (let to = index; to < PAGES.length; to++) {
        const span = spanWidth(from, to);
        if (span > width) { if (to === index) continue; break; }
        // Prefer more tabs; between equal counts prefer the window whose left edge starts earliest.
        const count = to - from;
        if (count > best.to - best.from || (count === best.to - best.from && from < best.from)) best = { from, to, width: span };
      }
    }
    const parts = full.slice(best.from, best.to + 1).map(item => item.text);
    // A ◂/▸ says the bar continues past the edge it is on.
    if (best.from > 0) parts.unshift(this.paint('dim', '◂'));
    if (best.to < PAGES.length - 1) parts.push(this.paint('dim', '▸'));
    return clip(parts.join(sep), width);
  }

  /**
   * The interchangeable list of the page: the setting rows, an option list, or the model picker. All three are
   * windowed the same way, so shrinking has one shape to work with.
   * @param {number} width @returns {string[]}
   */
  listLines(width) {
    if (this.mode === 'options') return this.optionLines(width);
    if (this.mode === 'model') return this.pickerLines(width);
    if (this.mode === 'filter') return this.filterLines(width);
    const rows = this.rowsFor(this.session.page), selected = this.currentIndex();
    return rows.map((row, index) => this.rowLine(row, width, index === selected));
  }
  /** @returns {number} */
  listSelected() {
    if (this.mode === 'options') return this.optionsState?.index ?? 0;
    if (this.mode === 'model') return this.picker?.index ?? 0;
    if (this.mode === 'filter') return this.filterState?.index ?? 0;
    return this.currentIndex();
  }
  /**
   * The filter: its input, then one line per match naming the page it is on, so a match from another page is not
   * mistaken for one here.
   * @param {number} width @returns {string[]}
   */
  filterLines(width) {
    const state = this.filterState;
    if (!state) return [];
    const query = state.input.getValue().trim();
    if (!query) return [clip(state.input.render(width)[0] ?? '', width), this.paint('dim', clip('Type to search every page by name or key.', width))];
    if (!state.matches.length) return [clip(state.input.render(width)[0] ?? '', width), this.paint('warning', clip('No setting matches.', width))];
    return [clip(state.input.render(width)[0] ?? '', width), ...state.matches.map(({ page, row }, index) => {
      const on = index === state.index, label = `${row.label}`, where = this.pageLabel(page);
      const room = Math.max(1, width - 2 - where.length - 1);
      const line = `${on ? '▸' : ' '} ${padRight(clip(label, room), room)} ${this.paint('dim', where)}`;
      return clip(this.paint(on ? 'accent' : 'text', line), width);
    })];
  }

  /**
   * Where this row's value comes from: default, global or project. A row that is not a config field has none.
   * @param {SettingsRow} row @returns {'' | 'default' | 'global' | 'project'}
   */
  rowSource(row) {
    const path = ROW_PATH[row.id];
    if (!path) return '';
    const source = this.provenance()[path];
    return source === 'default' || source === 'global' || source === 'project' ? source : '';
  }
  /** The provenance map the host loaded, so the screen never invents one. @returns {Record<string, string>} */
  provenance() { return this.options.provenance?.() ?? {}; }
  /**
   * @param {SettingsRow} row @param {number} width @param {boolean} selected @returns {string}
   */
  rowLine(row, width, selected) {
    const labelWidth = this.labelWidth(width);
    const marker = selected ? '▸ ' : '  ';
    const label = padRight(clip(row.label, labelWidth), labelWidth);
    // The provenance tag sits at the right and is what goes first when room runs out: a value the human can still
    // read is worth more than its origin. At 60 columns it is dropped entirely.
    const source = this.rowSource(row);
    // 60 columns is the width every view must fit; the tag is the first thing to go there.
    const tag = source && width > 60 ? source : '';
    const room = Math.max(1, width - visibleWidth(marker) - labelWidth - 2 - (tag ? tag.length + 1 : 0));
    const editing = selected && this.mode === 'input' && this.editing?.id === row.id;
    const labelText = this.paint(selected ? 'accent' : 'text', label);
    // An open Input keeps its own rendering: the hardware-cursor markers it emits must not end up inside a colour run.
    if (editing && this.input) return clip(`${marker}${labelText}  ${this.input.render(room)[0] ?? ''}`, width);
    const value = clip(row.value, room);
    const shown = `${marker}${labelText}  ${this.paint(row.tone === 'warning' ? 'warning' : selected ? 'accent' : 'muted', value)}`;
    if (!tag) return clip(shown, width);
    // Pad so the tag ends flush right, then clip: a long value loses its tail, never the tag.
    const gap = Math.max(1, width - visibleWidth(shown) - tag.length);
    return clip(`${shown}${' '.repeat(gap)}${this.paint('dim', tag)}`, width);
  }

  /** @param {number} width @returns {number} */
  labelWidth(width) {
    const longest = this.rowsFor(this.session.page).reduce((most, row) => Math.max(most, visibleWidth(row.label)), 0);
    return Math.max(6, Math.min(longest, Math.floor(width * 0.45)));
  }

  /** @param {number} width @returns {string[]} */
  optionLines(width) {
    const state = this.optionsState;
    if (!state) return [];
    return state.items.map((item, index) => {
      const on = index === state.index;
      const mark = item.value === this.currentValue() ? '✓' : ' ';
      return clip(this.paint(on ? 'accent' : 'text', `${on ? '▸' : ' '} ${mark} ${item.label}`), width);
    });
  }

  /** The heading of the list replacing the rows, or '' when the rows themselves are shown. @returns {string} */
  headingText() {
    if (this.mode === 'options') return this.editing?.label ?? '';
    if (this.mode === 'filter') return 'Filter · every page';
    return this.mode === 'model' ? 'Model · type to filter' : '';
  }

  /** @param {number} width @returns {string[]} */
  pickerLines(width) {
    const picker = this.picker;
    if (!picker) return [];
    const items = this.filteredModels(), start = windowStart(items.length, picker.index, MODEL_ROWS);
    const list = items.length
      ? items.slice(start, start + MODEL_ROWS).map((model, offset) => {
        const index = start + offset;
        return clip(this.paint(index === picker.index ? 'accent' : 'text', `${index === picker.index ? '▸' : ' '} ${model.provider}/${model.id}`), width);
      })
      : [this.paint('warning', clip('No matching models. Clear the filter to see all.', width))];
    return [clip(picker.input.render(width)[0] ?? '', width), ...list];
  }

  /** The value Enter would choose: the open row's current option, so exactly one line carries a ✓. @returns {string} */
  currentValue() { return this.editing ? this.editing.value : ''; }

  /** @param {SettingsPage} page @returns {string} */
  descriptionText(page) {
    if (this.mode === 'filter') {
      const state = this.filterState, chosen = state?.matches[state?.index ?? 0];
      return chosen ? `${chosen.row.hint} (on the ${this.pageLabel(chosen.page)} page.)` : 'Type part of a setting name or its key, for example timeout. Enter jumps to the row.';
    }
    if (page !== this.session.page) return this.rowsFor(page)[0]?.hint ?? '';
    if (this.mode === 'options') return this.optionsState?.hint ?? '';
    if (this.mode === 'model') return this.pickerHint();
    const row = this.currentRow();
    // A restart-bound row says so in its own hint, on the row and not only in the status line afterwards.
    if (this.rowRestarts(row) && !/Restart-bound/.test(row.hint)) return `${row.hint} Restart-bound: applies at the next worker restart.${this.taskNote()}`;
    return row.hint;
  }

  /** @returns {string} */
  pickerHint() {
    const model = this.filteredModels()[this.picker?.index ?? 0];
    if (!model) return 'Type to filter the models signed in to Pi.';
    // About the highlighted model itself, not the worker's current one: this is the choice being made.
    return `${model.provider}/${model.id}${model.name ? ` — ${model.name}` : ''}. Thinking effort: ${supportedEfforts(model).join(', ')}.`;
  }

  /** @param {number} width @returns {string} */
  statusLine(width) {
    const text = this.saving ? 'Saving…' : this.session.status;
    if (!text) return '';
    const color = this.saving || this.session.tone === 'info' ? 'muted' : this.session.tone === 'error' ? 'error' : 'success';
    return clip(this.paint(color, text), width);
  }

  /** @param {number} width @returns {string[]} */
  hintLines(width) {
    /** @type {[string, string][]} */
    const pairs = this.mode === 'options' ? [['↑↓', 'move'], ['tui.select.confirm', 'choose'], ['tui.select.cancel', 'back']]
      : this.mode === 'model' ? [['↑↓', 'move'], ['type', 'filter'], ['tui.select.confirm', 'choose'], ['tui.select.cancel', 'back']]
        : this.mode === 'filter' ? [['↑↓', 'move'], ['type', 'search'], ['tui.select.confirm', 'go to'], ['tui.select.cancel', 'clear']]
          : this.mode === 'input' ? [['tui.select.confirm', 'save'], ['tui.select.cancel', 'cancel']]
            : [['↑↓', 'move'], ['tui.select.confirm', 'change'], ['space', 'quick change'], ['r', 'reset'], ['/', 'filter'], ['tab', 'page'], ['tui.select.cancel', 'close']];
    return packHints(pairs.map(pair => hints(pair)), width).map(line => this.paint('dim', clip(line, width)));
  }

  // ---- keys -----------------------------------------------------------------

  /** Every row of every page, with the page it lives on: the search space of the filter. */
  allRows() {
    /** @type {{page: SettingsPage, row: SettingsRow}[]} */
    const found = [];
    for (const page of PAGES) for (const row of this.rowsFor(page.id)) found.push({ page: page.id, row });
    return found;
  }
  /** The page label shown beside a filtered row. @param {SettingsPage} page @returns {string} */
  pageLabel(page) { return PAGES.find(item => item.id === page)?.label ?? page; }
  /**
   * Matches on the row's label and its config path, so "/timeout" finds the timeout rows on every page and
   * "/control." finds the supervision budgets.
   * @param {string} query @returns {{page: SettingsPage, row: SettingsRow}[]}
   */
  matchesFor(query) {
    const text = query.trim().toLowerCase();
    if (!text) return [];
    return this.allRows().filter(({ row }) => `${row.label} ${ROW_PATH[row.id] ?? ''} ${ROW_ALIAS[row.id] ?? ''}`.toLowerCase().includes(text));
  }
  openFilter() {
    const input = this.openedInput('', 'Filter settings by name or key…');
    this.filterState = { input, index: 0, matches: [] };
    this.mode = 'filter';
    this.refresh();
  }
  /** @param {string} data */
  filterKey(data) {
    const state = this.filterState;
    if (!state) { this.mode = 'list'; return; }
    if (isCancel(this.keys, data)) { this.filterState = null; this.mode = 'list'; this.session.status = ''; this.session.tone = 'none'; this.refresh(); return; }
    const count = state.matches.length;
    // No j/k fallbacks here: in a filter every printable key, j and k included, types.
    if (this.is(data, 'tui.select.up') || matchesKey(data, 'up')) { state.index = wrapIndex(state.index, -1, Math.max(1, count)); this.refresh(); return; }
    if (this.is(data, 'tui.select.down') || matchesKey(data, 'down')) { state.index = wrapIndex(state.index, 1, Math.max(1, count)); this.refresh(); return; }
    if ((this.is(data, 'tui.select.confirm', ['\r', '\n']) || matchesKey(data, 'enter')) && count) { this.jumpToMatch(); return; }
    const before = state.input.getValue();
    state.input.handleInput(data);
    if (state.input.getValue() !== before) { state.matches = this.matchesFor(state.input.getValue()); state.index = 0; }
    this.refresh();
  }
  /** Leave the filter and land on the row it points at, on that row's own page. */
  jumpToMatch() {
    const chosen = this.filterState?.matches[this.filterState.index];
    this.filterState = null; this.mode = 'list';
    if (!chosen) { this.refresh(); return; }
    this.session.page = chosen.page; this.session.rowId = chosen.row.id;
    this.session.status = `${chosen.row.label} — on the ${this.pageLabel(chosen.page)} page.`;
    this.session.tone = 'info';
    this.refresh();
  }
  /** @param {string} data */
  handleInput(data) {
    if (this.saving) return;
    if (this.mode === 'filter') { this.filterKey(data); return; }
    if (this.mode === 'options') this.optionKey(data);
    else if (this.mode === 'model') this.pickerKey(data);
    else if (this.mode === 'input') this.inputKey(data);
    else this.listKey(data);
  }

  /** @param {string} data @param {string} id @param {string[]} [fallbacks] @returns {boolean} */
  is(data, id, fallbacks = []) { return keyIs(this.keys, data, id, fallbacks); }

  /**
   * Reset one row to what the other scope (or the defaults) say: remove the field from this scope's layer and save
   * that layer through the merge path. A row this scope does not set has nothing to reset, and says so.
   * @param {SettingsRow} row
   */
  async resetRow(row) {
    const path = ROW_PATH[row.id], source = this.rowSource(row);
    if (!path) { this.session.status = `${row.label} is not a saved setting, so there is nothing to reset.`; this.session.tone = 'info'; this.refresh(); return; }
    if (source !== this.session.scope) {
      const from = source === 'default' ? 'the defaults' : `the ${source} scope`;
      this.session.status = `${row.label} already comes from ${from}; ${scopeName(this.session.scope)} does not set it.`;
      this.session.tone = 'info'; this.refresh(); return;
    }
    if (!this.options.readLayer || !this.options.saveLayer) { this.session.status = 'This host cannot reset a single setting.'; this.session.tone = 'error'; this.refresh(); return; }
    this.saving = true; this.refresh();
    try {
      // Read the layer fresh, drop only this field, and let the host save it: the same merge path every edit uses.
      const layer = /** @type {Record<string, unknown>} */ (structuredClone(await this.options.readLayer(this.session.scope)));
      removePath(layer, path);
      const next = await this.options.saveLayer(layer, this.session.scope);
      if (next) this.session.saved = clone(next);
      // The provenance map is the host's, and it reloads after a save: read it again rather than guessing. A source
      // equal to this scope would mean the host's map is stale (it still describes the layer just written), so it is
      // not repeated as the answer. With no map at all the honest answer is that this scope no longer sets the field.
      const after = this.rowSource(row);
      const from = after === 'default' ? 'the defaults' : after && after !== this.session.scope ? `the ${after} scope` : '';
      // Short enough for the status line: the fallback's name is only known when the host's map survived the save.
      this.session.status = from
        ? `✔ Reset — ${row.label} now comes from ${from}.`
        : `✔ Reset — ${row.label} removed from ${scopeName(this.session.scope)}; it falls back.`;
      this.session.tone = 'ok';
    } catch (error) { this.session.status = `✖ Not reset: ${briefError(error)}`; this.session.tone = 'error'; }
    this.saving = false; this.refresh();
  }
  /** @param {string} data */
  listKey(data) {
    if (data === 'q' || isCancel(this.keys, data)) { this.close(); return; }
    if (this.is(data, 'tui.select.up', ['k']) || matchesKey(data, 'up')) { this.move(-1); return; }
    if (this.is(data, 'tui.select.down', ['j']) || matchesKey(data, 'down')) { this.move(1); return; }
    if (this.is(data, 'tui.select.pageDown', ['l']) || matchesKey(data, 'tab') || matchesKey(data, 'right')) { this.page(1); return; }
    if (this.is(data, 'tui.select.pageUp', ['h']) || matchesKey(data, 'shift+tab') || matchesKey(data, 'left')) { this.page(-1); return; }
    if (this.is(data, 'tui.select.confirm', ['\r', '\n']) || matchesKey(data, 'enter')) { this.activate(this.currentRow(), ENTER); return; }
    if (data === ' ' || matchesKey(data, 'space')) this.activate(this.currentRow(), SPACE);
    if (data === 'r') { void this.resetRow(this.currentRow()); return; }
    // / starts a filter over every page's rows; it is not a printable search field, so it takes the key outright.
    if (data === '/') { this.openFilter(); return; }
  }

  /** @param {string} data */
  optionKey(data) {
    const state = this.optionsState;
    if (!state) { this.mode = 'list'; return; }
    if (isCancel(this.keys, data)) { this.mode = 'list'; this.optionsState = null; this.editing = null; this.refresh(); return; }
    if (this.is(data, 'tui.select.up', ['k']) || matchesKey(data, 'up')) this.stepOption(-1);
    else if (this.is(data, 'tui.select.down', ['j']) || matchesKey(data, 'down')) this.stepOption(1);
    else if (this.is(data, 'tui.select.confirm', ['\r', '\n']) || matchesKey(data, 'enter')) this.chooseOption();
  }

  /** @param {string} data */
  pickerKey(data) {
    const picker = this.picker;
    if (!picker) { this.mode = 'list'; return; }
    if (isCancel(this.keys, data)) { this.mode = 'list'; this.picker = null; this.refresh(); return; }
    const items = this.filteredModels();
    // No j/k fallbacks here: in a filter field every printable key, j and k included, types.
    if (this.is(data, 'tui.select.up') || matchesKey(data, 'up')) picker.index = wrapIndex(picker.index, -1, items.length);
    else if (this.is(data, 'tui.select.down') || matchesKey(data, 'down')) picker.index = wrapIndex(picker.index, 1, items.length);
    else if (this.is(data, 'tui.select.confirm', ['\r', '\n']) || matchesKey(data, 'enter')) { this.chooseModel(); return; }
    else {
      const before = picker.input.getValue();
      picker.input.handleInput(data);
      if (picker.input.getValue() !== before) picker.index = 0;
    }
    this.refresh();
  }

  /** @param {string} data */
  inputKey(data) {
    const input = this.input;
    if (!input) { this.mode = 'list'; return; }
    if (isCancel(this.keys, data)) { this.cancelInput(); return; }
    if (this.is(data, 'tui.select.confirm', ['\r', '\n']) || matchesKey(data, 'enter')) { this.submitInput(input.getValue()); return; }
    // Everything else, printable or not, belongs to the Input: q, h, l, j, k and space must type normally.
    input.handleInput(data);
    this.refresh();
  }

  /** @param {number} delta */
  move(delta) {
    const rows = this.rowsFor(this.session.page);
    if (!rows.length) return;
    this.session.rowId = rows[wrapIndex(this.currentIndex(), delta, rows.length)].id;
    this.refresh();
  }

  /** @param {number} delta */
  page(delta) {
    const index = PAGES.findIndex(page => page.id === this.session.page);
    const next = PAGES[wrapIndex(index, delta, PAGES.length)];
    this.session.page = next.id;
    this.session.rowId = this.rowsFor(next.id)[0].id;
    this.mode = 'list'; this.optionsState = null; this.editing = null; this.picker = null; this.input = null;
    this.refresh();
  }

  // ---- row actions ----------------------------------------------------------

  /** @param {SettingsRow} row @param {Activate} how */
  activate(row, how) {
    if (row.kind === 'open') { this.close({ run: /** @type {'verification' | 'migrate' | 'json'} */ (row.work) }); return; }
    // The worker list's own operations happen in the screen: they change the list, not a field of one worker.
    if (row.kind === 'action') { this.rowAction(row.id); return; }
    if (row.kind === 'toggle') { this.toggle(row); return; }
    if (row.kind === 'note') return;
    if (row.kind === 'model' || row.kind === 'peer-model') { this.openPicker(row.kind === 'peer-model'); return; }
    if (row.kind === 'number' || row.kind === 'nullable' || row.kind === 'text' || row.kind === 'list' || row.kind === 'add') { this.openInput(row); return; }
    if (how.quick) this.cycle(row);
    else this.openOptions(row);
  }

  /** @param {SettingsRow} row */
  toggle(row) {
    const next = clone(this.session.saved), worker = this.nextWorker(next), on = row.value !== 'On';
    if (row.id === 'readOnly') worker.readOnly = on;
    else if (row.id === 'cue') next.attentionCue = on;
    else if (row.id === 'autoDeliver') next.autoDeliverReports = on;
    else if (row.id === 'enabled') next.enabled = on;
    else if (row.id === 'autoStart') next.autoStart = on;
    else if (row.id === 'mainSupervision') next.mainSupervision = on;
    else if (row.id === 'autoCheckIdle') next.autoCheckIdle = on;
    else if (row.id === 'mainReadOnly') next.mainReadOnlyDuringTasks = on;
    else if (row.id === 'watchdog') next.control.watchdog = on;
    else if (row.id === 'requirePassing') next.verification.requirePassing = on;
    else if (row.id === 'peerEnabled') next.peerReview.enabled = on;
    else if (row.id === 'inheritExtensions') next.runtime.inheritExtensions = on;
    else if (row.id === 'mcp') next.runtime.mcp = on;
    else if (row.restart && Object.hasOwn(next.requirements, row.id)) Reflect.set(next.requirements, row.id, on);
    else return;
    this.commit(next, row.label, onOff(on), '', this.rowRestarts(row));
  }

  /** @param {SettingsRow} row */
  cycle(row) {
    const options = row.options ?? [];
    if (!options.length) return;
    this.applyChoice(row, options[wrapIndex(options.findIndex(option => option.value === row.value), 1, options.length)].value);
  }

  /** @param {SettingsRow} row */
  openOptions(row) {
    if (!row.options?.length) return;
    const index = Math.max(0, row.options.findIndex(option => option.value === row.value));
    this.editing = row; this.mode = 'options';
    this.optionsState = { items: row.options, index, hint: row.options[index].hint };
    this.refresh();
  }

  /** @param {number} delta */
  stepOption(delta) {
    const state = this.optionsState;
    if (!state) return;
    state.index = wrapIndex(state.index, delta, state.items.length);
    state.hint = state.items[state.index].hint;
    this.refresh();
  }

  chooseOption() {
    const state = this.optionsState, row = this.editing;
    this.mode = 'list'; this.optionsState = null; this.editing = null;
    if (state && row) this.applyChoice(row, state.items[state.index].value);
    else this.refresh();
  }

  /**
   * Apply a chosen option. The worker selector and the save scope change what you edit, not what is saved.
   * @param {SettingsRow} row @param {string} value
   */
  applyChoice(row, value) {
    if (row.id === 'worker') { this.session.workerId = value; this.session.rowId = 'model'; this.mode = 'list'; this.refresh(); return; }
    if (row.id === 'scope') { void this.switchScope(value === 'global' ? 'global' : 'project'); return; }
    const next = clone(this.session.saved), worker = this.nextWorker(next);
    if (row.id === 'effort') worker.effort = /** @type {Effort} */ (value);
    else if (row.id === 'policy') next.supervision.mode = /** @type {PairConfig['supervision']['mode']} */ (value);
    else if (row.id === 'detail') next.supervision.summaryDetail = /** @type {PairConfig['supervision']['summaryDetail']} */ (value);
    else if (row.id === 'indicator') next.indicator = /** @type {PairConfig['indicator']} */ (value);
    else if (row.id === 'mainHeartbeat') next.control.mainHeartbeat = /** @type {PairConfig['control']['mainHeartbeat']} */ (value);
    else { this.refresh(); return; }
    this.commit(next, row.label, value, '', this.rowRestarts(row));
  }

  /**
   * Switching scope shows that scope's values without saving anything; the next edit lands in the new scope.
   * @param {ConfigScope} scope
   */
  async switchScope(scope) {
    this.mode = 'list';
    if (scope === this.session.scope) { this.refresh(); return; }
    try {
      const next = this.options.loadScope ? await this.options.loadScope(scope) : this.session.saved;
      this.session.scope = scope; this.session.saved = clone(next);
      // The other scope may know other workers, so the row you were on may not exist there.
      const rows = this.rowsFor(this.session.page);
      this.session.rowId = rows.some(row => row.id === this.session.rowId) ? this.session.rowId : rows[0].id;
      this.session.status = `Now editing ${scopeName(scope)}. Switching copies nothing.`;
      this.session.tone = 'info';
    } catch (error) { this.session.status = `✖ Could not switch to ${scopeName(scope)}: ${briefError(error)}`; this.session.tone = 'error'; }
    this.refresh();
  }

  /** @param {SettingsRow} row */
  openInput(row) {
    // Each row opens on the value it stores, not the label it shows: sizes in MB, lists as text, none as blank.
    const saved = this.session.saved;
    const value = row.kind === 'list' ? /** @type {string[]} */ (Reflect.get(saved.runtime, row.id)).join(', ')
      : row.id === 'workspace' ? (this.worker().cwd || '')
        : row.kind === 'nullable' ? (Reflect.get(saved.limits, row.id) === null ? '' : String(Reflect.get(saved.limits, row.id)))
          : row.kind === 'number' ? String(openValue(saved, row.id)) : '';
    const placeholder = row.kind === 'add' ? 'New worker ID (letters, digits, hyphens, underscores)'
      : row.kind === 'list' ? 'Comma- or line-separated, or blank for none'
        : row.kind === 'nullable' ? 'A number, or blank for none'
          : row.kind === 'number' ? row.value : 'Absolute path, or blank for Main';
    this.editing = row; this.mode = 'input';
    this.input = this.openedInput(value, placeholder);
    this.input.onSubmit = text => this.submitInput(text);
    this.input.onEscape = () => this.cancelInput();
    this.refresh();
  }

  /** The hint suffix a restart-bound row carries, and what a save means while a task runs. @returns {string} */
  taskNote() {
    const running = this.options.taskRunning?.() === true;
    return running ? ' A task is running, so this change is staged and applies at the next worker restart.' : '';
  }
  /**
   * Whether a row describes the worker's identity, which is what configHash() covers: runtime, requirements, the
   * worker specs and evidence. A change to one of those is what a restart applies.
   * @param {SettingsRow} row @returns {boolean}
   */
  rowRestarts(row) {
    if (row.restart) return true;
    return ['model', 'effort', 'workspace', 'readOnly', 'duplicateId', 'add', 'remove', 'default', 'moveUp', 'moveDown', 'duplicate'].includes(row.id);
  }
  cancelInput() {
    this.mode = 'list'; this.input = null; this.editing = null;
    this.session.status = ''; this.session.tone = 'none';
    this.refresh();
  }

  /** @param {string} text */
  submitInput(text) {
    const row = this.editing, trimmed = text.trim();
    if (!row) { this.cancelInput(); return; }
    const next = clone(this.session.saved), worker = this.nextWorker(next);
    if (row.kind === 'number') {
      /** @type {[number, number]} */
      const [low, high] = row.id === 'stepFiles' ? [1, 1000] : [0, 20], value = Number(trimmed);
      // The supervision rows are edited in seconds, minutes or hours and stored in milliseconds.
      /** @type {Record<string, {unit: 'ms' | 'min' | 'minOrOff', low: number, high: number}>} */
      const durations = { stepTimeout: { unit: 'min', low: 60000, high: 86400000 }, silentMs: { unit: 'ms', low: 10000, high: 3600000 },
        toolMaxMs: { unit: 'ms', low: 60000, high: 86400000 }, stepNudgeMs: { unit: 'ms', low: 60000, high: 86400000 },
        compactionMaxMs: { unit: 'minOrOff', low: 0, high: 86400000 }, mainHeartbeatMs: { unit: 'ms', low: 60000, high: 86400000 } };
      const duration = durations[row.id];
      if (duration) {
        const ms = parseDuration(trimmed, duration.unit);
        if (ms === null || ms < duration.low || ms > duration.high) {
          this.session.status = `Enter a duration like 60 s, 5 min or 1 h (${Math.round(duration.low / 1000)}–${Math.round(duration.high / 1000)} s).`; this.session.tone = 'error'; this.refresh(); return;
        }
        if (row.id === 'stepTimeout') next.limits.activeStepTimeoutMs = ms;
        // These row ids are exactly the millisecond fields of control.
        else Reflect.set(next.control, row.id, ms);
        this.mode = 'list'; this.input = null; this.editing = null;
        this.commit(next, row.label, durationLabel(ms), '', this.rowRestarts(row));
        return;
      }
      if (trimmed === '' || !Number.isInteger(value) || value < low || value > high) {
        this.session.status = `Enter a whole number from ${low} to ${high}.`; this.session.tone = 'error'; this.refresh(); return;
      }
      const whole = wholeNumberRows(next);
      if (row.id === 'stepFiles') next.supervision.maxStepFiles = value;
      else if (row.id === 'revisions') next.supervision.maxRevisions = value;
      else if (row.id === 'maxMainRecoveries') next.maxMainRecoveries = value;
      else if (row.id === 'maxAutoRecoveries') next.control.maxAutoRecoveriesPerStep = value;
      else if (whole[row.id]) whole[row.id](value);
      else { this.refresh(); return; }
      this.mode = 'list'; this.input = null; this.editing = null;
      this.commit(next, row.label, row.id === 'stepFiles' ? `${value} ${value === 1 ? 'file' : 'files'}` : row.id === 'maxReportBytes' ? `${value} KB` : String(value), '', this.rowRestarts(row));
      return;
    }
    // A nullable row stores null for "none": blank means no limit, which is a value, not a cancel.
    if (row.kind === 'nullable') {
      if (trimmed === '') {
        Reflect.set(next.limits, row.id, null);
        this.mode = 'list'; this.input = null; this.editing = null;
        this.commit(next, row.label, 'none', '', this.rowRestarts(row));
        return;
      }
      const value = Number(trimmed);
      if (!Number.isFinite(value) || value <= 0) {
        this.session.status = 'Enter a positive number, or leave it blank for none.'; this.session.tone = 'error'; this.refresh(); return;
      }
      Reflect.set(next.limits, row.id, value);
      this.mode = 'list'; this.input = null; this.editing = null;
      this.commit(next, row.label, String(value), '', this.rowRestarts(row));
      return;
    }
    if (row.kind === 'list') {
      Reflect.set(next.runtime, row.id, parseList(text));
      this.mode = 'list'; this.input = null; this.editing = null;
      this.commit(next, row.label, listLabel(/** @type {string[]} */ (Reflect.get(next.runtime, row.id))), '', this.rowRestarts(row));
      return;
    }
    if (row.kind === 'text') {
      if (row.id === 'workspace') worker.cwd = trimmed || null;
      else if (row.id === 'command') next.runtime.command = trimmed || 'pi';
      else if (row.id === 'lowCommand') next.runtime.lowCommand = trimmed;
      else { this.refresh(); return; }
      this.mode = 'list'; this.input = null; this.editing = null;
      this.commit(next, row.label, row.id === 'workspace' ? trimmed || 'same as Main' : trimmed, '', this.rowRestarts(row));
      return;
    }
    if (row.id === 'duplicateId') {
      const source = this.nextWorker(next).id;
      // The host owns the save, so a copy takes the same merge path as adding or removing a worker: it runs the
      // helper itself, reports the outcome, and the screen reopens on the new worker.
      if (this.options.duplicateWorker) {
        this.mode = 'list'; this.input = null; this.editing = null;
        this.session.workerId = trimmed; this.session.rowId = 'model';
        this.close({ run: 'duplicate', workerId: source, newId: trimmed });
        return;
      }
      let copied;
      try { copied = duplicateWorker(next, source, trimmed); }
      catch (error) { this.session.status = `✖ Not saved: ${briefError(error)}`; this.session.tone = 'error'; this.refresh(); return; }
      this.mode = 'list'; this.input = null; this.editing = null;
      this.session.workerId = trimmed; this.session.rowId = 'model';
      this.commit(copied, 'Worker', `${trimmed} copied from ${source}`, '', true);
      return;
    }
    if (row.kind === 'add') {
      if (!trimmed) { this.session.status = 'Enter a worker ID: letters, digits, hyphens or underscores.'; this.session.tone = 'error'; this.refresh(); return; }
      /** @type {WorkerSpec} */
      const slot = { id: trimmed, provider: '', model: '', effort: 'medium', cwd: null, readOnly: false };
      next.workers.push(slot);
      try { validateConfig(next); } catch (error) { this.session.status = `✖ Not saved: ${briefError(error)}`; this.session.tone = 'error'; this.refresh(); return; }
      this.mode = 'list'; this.input = null; this.editing = null;
      this.session.workerId = slot.id; this.session.rowId = 'worker';
      this.commit(next, 'Worker', slot.id, '', true);
      return;
    }
    this.cancelInput();
  }

  // ---- model picker ---------------------------------------------------------

  /** @param {boolean} [peer] true when the choice is the peer reviewer's model rather than the worker's */
  openPicker(peer = false) {
    if (!this.models.length) { this.session.status = 'No signed-in models. Set up a provider in Pi first (/login).'; this.session.tone = 'error'; this.refresh(); return; }
    const saved = this.session.saved, current = peer ? `${saved.peerReview.provider}/${saved.peerReview.model}` : `${this.worker().provider}/${this.worker().model}`;
    const input = this.openedInput('', 'Type to filter models…');
    this.picker = { input, index: Math.max(0, this.models.findIndex(model => `${model.provider}/${model.id}` === current)), peer };
    this.mode = 'model';
    this.refresh();
  }

  /** @returns {ScreenModel[]} */
  filteredModels() {
    const query = (this.picker?.input.getValue() ?? '').trim().toLowerCase();
    return query ? this.models.filter(model => `${model.provider}/${model.id} ${model.name ?? ''}`.toLowerCase().includes(query)) : this.models;
  }

  chooseModel() {
    const model = this.filteredModels()[this.picker?.index ?? 0], peer = this.picker?.peer === true;
    this.mode = 'list'; this.picker = null;
    if (!model) { this.refresh(); return; }
    const next = clone(this.session.saved), worker = this.nextWorker(next);
    // The peer reviewer is a model like the worker's, so it picks from the same signed-in list.
    if (peer) {
      next.peerReview.provider = model.provider; next.peerReview.model = model.id;
      this.commit(next, 'Reviewer model', `${model.provider}/${model.id}`);
      return;
    }
    worker.provider = model.provider; worker.model = model.id;
    const before = worker.effort, effort = clampEffort(model, before);
    worker.effort = effort;
    // The effort can be clamped by the new model; say so here rather than in a notification over the overlay.
    this.commit(next, 'Model', `${model.provider}/${model.id}`, effort === before ? '' : ` · thinking effort changed from ${before} to ${effort}`, true);
  }

  // ---- worker list ----------------------------------------------------------

  /**
   * Make default, move up, or remove the worker this page edits. Each produces a validated config and goes through
   * commit(), so it saves by the same merge path as any field and the settings file is never rewritten wholesale.
   * @param {string} id
   */
  async rowAction(id) {
    const next = clone(this.session.saved), worker = this.nextWorker(next);
    const at = next.workers.findIndex(slot => slot.id === worker.id);
    if (id === 'default') {
      if (at === 0) { this.session.status = `${worker.id} is already the default.`; this.session.tone = 'none'; this.refresh(); return; }
      const moved = makeDefault(next, worker.id);
      await this.commit(moved, 'Worker', `${worker.id} (default)`, '', true);
      return;
    }
    if (id === 'moveUp' || id === 'moveDown') {
      const delta = id === 'moveUp' ? -1 : 1;
      const edge = id === 'moveUp' ? 'first' : 'last';
      if (delta < 0 ? at <= 0 : at >= next.workers.length - 1) { this.session.status = `${worker.id} is already ${edge}.`; this.session.tone = 'none'; this.refresh(); return; }
      const moved = moveWorker(next, worker.id, delta);
      await this.commit(moved, 'Worker order', `${worker.id} is now ${moved.workers.findIndex(slot => slot.id === worker.id) + 1} of ${moved.workers.length}`, '', true);
      return;
    }
    if (id === 'duplicate') {
      // The id is asked for in the same inline input every other text row uses, so the copy names itself.
      this.editing = { id: 'duplicateId', label: 'Copy id', value: '', kind: 'add', hint: `Copy ${worker.id} under a new id.` };
      this.mode = 'input';
      this.input = this.openedInput('', `New id for a copy of ${worker.id}`);
      if (this.input) { this.input.onSubmit = text => this.submitInput(text); this.input.onEscape = () => this.cancelInput(); }
      this.refresh();
      return;
    }
    if (id === 'remove') {
      if (next.workers.length < 2) { this.session.status = 'Pair needs at least one worker; add another before removing this one.'; this.session.tone = 'error'; this.refresh(); return; }
      // The screen removes the slot from the config; the conversation is the host's to keep or discard, so it asks
      // there and returns for the next worker. A refused removal leaves this screen showing the unchanged config.
      this.close({ run: 'remove', workerId: worker.id });
    }
  }

  // ---- saving ---------------------------------------------------------------

  /** @param {PairConfig} draft @returns {WorkerSpec} */
  nextWorker(draft) { return draft.workers.find(worker => worker.id === this.session.workerId) || draft.workers[0]; }

  /**
   * Save one change. A scope with a pending migration needs Pi's confirm, so that save resolves the view, applies
   * outside it, and reopens here with the outcome in the status line.
   * @param {PairConfig} next @param {string} label @param {string} value @param {string} [extra]
   */
  async commit(next, label, value, extra = '', restartBound = false) {
    if (this.saving) return;
    this.editing = null; this.optionsState = null;
    if (this.mode !== 'model') this.mode = 'list';
    if (this.options.migrationPending?.(this.session.scope)) { this.close({ run: 'save', next, label, value: `${value}${extra}` }); return; }
    this.saving = true; this.session.status = ''; this.session.tone = 'none';
    this.refresh();
    try {
      await persist(this.session, next, this.onApply);
      const merged = this.options.merged?.() ? ' The file changed outside this screen; your change was merged.' : '';
      // A restart-bound field changes what the worker process is, so a running worker keeps its old value until then.
      const staged = restartBound && this.options.taskRunning?.() === true ? ' A task is running, so the change is staged and applies at the next worker restart.' : '';
      this.session.status = `✔ Saved — ${label}: ${value}${extra} (${scopeName(this.session.scope)}).${merged}${staged}`;
      this.session.tone = 'ok';
    } catch (error) {
      this.session.status = `✖ Not saved: ${briefError(error)}`;
      this.session.tone = 'error';
    }
    this.saving = false;
    this.refresh();
  }

  /** @param {ScreenAnswer} [answer] */
  close(answer) {
    this.mode = 'list'; this.input = null; this.optionsState = null; this.editing = null; this.picker = null;
    this.finish(answer);
  }
}

/**
 * An Input holding `value`, with the cursor after the last character. setValue() alone leaves the cursor at the
 * start, so backspace would eat nothing and typing would prepend; typing the text arrives where a human expects.
 * @param {string} value @param {string} [placeholder] @returns {Input}
 */
function prefilled(value, placeholder) {
  const input = new Input({ placeholder });
  for (const glyph of value) input.handleInput(glyph);
  return input;
}
/** @param {ScreenModel | undefined} model @returns {readonly Effort[]} */
/**
 * Remove one dotted path from a config layer, pruning the section objects it leaves empty so the file stays as
 * small as the values in it. A missing path is not an error: the caller has already said what it expects.
 * @param {Record<string, unknown>} layer @param {string} path
 */
function removePath(layer, path) {
  const parts = path.split('.');
  /** @type {Record<string, unknown>[]} */
  const seen = [layer];
  let node = layer;
  for (const part of parts.slice(0, -1)) {
    const child = node[part];
    if (!child || typeof child !== 'object' || Array.isArray(child)) return;
    node = /** @type {Record<string, unknown>} */ (child); seen.push(node);
  }
  delete node[parts.at(-1) ?? ''];
  // Prune from the deepest section outwards: an empty section is the same as no section.
  for (let index = seen.length - 1; index >= 1; index--) {
    if (Object.keys(seen[index]).length) return;
    delete seen[index - 1][parts[index - 1]];
  }
}
/** @param {number | null} value @param {(value: number) => string} show @returns {string} */
function nullableNumber(value, show) { return value === null ? 'none' : show(value); }
/**
 * The whole-number rows whose id is not the field they store: each sets its own field on the draft config.
 * @param {import('./config.js').PairConfig} next @returns {Record<string, (value: number) => void>}
 */
function wholeNumberRows(next) {
  /** @type {Record<string, (value: number) => void>} */
  const ms = {
    pingTimeoutMs: value => { next.control.pingTimeoutMs = value; }, noReportNudges: value => { next.control.noReportNudges = value; },
    maxSteersPerStep: value => { next.control.maxSteersPerStep = value; }, providerCooldownMs: value => { next.control.providerCooldownMs = value; },
    quotaCooldownMs: value => { next.control.quotaCooldownMs = value; }, maxProviderWaits: value => { next.control.maxProviderWaits = value; }
  };
  return {
    ...ms,
    stepTimeoutLimit: value => { next.limits.activeStepTimeoutMs = value * 60000; },
    maxReportsPerTask: value => { next.limits.maxReportsPerTask = value; },
    maxReportBytes: value => { next.limits.maxReportBytes = value * 1024; },
    maxAutomaticReportRepairs: value => { next.limits.maxAutomaticReportRepairs = value; },
    maxWorkers: value => { next.maxWorkers = value; },
    revisionsPerStep: value => { next.supervision.maxRevisionsPerStep = value; },
    maxFiles: value => { next.evidence.maxFiles = value; },
    maxTotalBytes: value => { next.evidence.maxTotalBytes = value * 1048576; },
    maxArtifactBytes: value => { next.evidence.maxArtifactBytes = value * 1048576; },
    startupTimeoutMs: value => { next.runtime.startupTimeoutMs = value; }, requestTimeoutMs: value => { next.runtime.requestTimeoutMs = value; },
    shutdownTimeoutMs: value => { next.runtime.shutdownTimeoutMs = value; },
    verificationTimeout: value => { next.verification.timeoutMs = value; }, peerTimeout: value => { next.peerReview.timeoutMs = value; }
  };
}
/**
 * The raw stored value a number row opens with, so the input never shows its formatted label ("5 min", "16 KB").
 * @param {import('./config.js').PairConfig} saved @param {string} id @returns {number}
 */
function openValue(saved, id) {
  // The sections first (control, runtime, verification and limits field names are the row ids), then the rows whose
  // id differs from the field they store and the rows the screen formats (KB, MB).
  const { maxReportedCostUsd: _cost, maxOutputTokens: _output, ...limits } = saved.limits;
  const { commands: _commands, requirePassing: _require, ...verification } = saved.verification;
  const { backend: _backend, lowCommand: _lowCommand, lowArgs: _lowArgs, command: _command, commandArgs: _commandArgs,
    extraExtensions: _extra, excludeExtensions: _exclude, extraSkills: _skills, inheritExtensions: _inherit, mcp: _mcp, ...runtime } = saved.runtime;
  const { watchdog: _watchdog, mainHeartbeat: _heartbeat, ...control } = saved.control;
  /** @type {Record<string, number>} */
  const numbers = {
    ...control, ...runtime, ...verification, ...limits,
    stepFiles: saved.supervision.maxStepFiles ?? 5, revisions: saved.supervision.maxRevisions, revisionsPerStep: saved.supervision.maxRevisionsPerStep,
    maxMainRecoveries: saved.maxMainRecoveries,
    maxAutoRecoveries: saved.control.maxAutoRecoveriesPerStep, maxWorkers: saved.maxWorkers,
    maxReportBytes: Math.round(saved.limits.maxReportBytes / 1024),
    maxFiles: saved.evidence.maxFiles, maxTotalBytes: Math.round(saved.evidence.maxTotalBytes / 1048576), maxArtifactBytes: Math.round(saved.evidence.maxArtifactBytes / 1048576),
    stepTimeout: saved.limits.activeStepTimeoutMs, stepTimeoutLimit: saved.limits.activeStepTimeoutMs,
    verificationTimeout: saved.verification.timeoutMs, peerTimeout: saved.peerReview.timeoutMs
  };
  return numbers[id] ?? 0;
}
/** @param {readonly string[]} values @returns {string} a list as the row shows it; the input takes commas or lines */
function listLabel(values) { return values.length ? values.join(', ') : 'none'; }
/** Parse a comma- or line-separated list into trimmed, non-empty values. @param {string} value @returns {string[]} */
function parseList(value) { return String(value).split(/[,\n]/).map(item => item.trim()).filter(Boolean); }
/** File sizes are stored in bytes and edited in MB, the unit a human thinks in. @param {number} bytes @returns {string} */
function bytesLabel(bytes) { return `${Math.round(bytes / 1048576)} MB`; }
/** @param {number} ms @returns {string} a duration in the unit that reads best (s, min or h) */
function durationLabel(ms) {
  const minutes = Math.round(ms / 60000);
  if (ms >= 3600000 && ms % 3600000 === 0) return `${ms / 3600000} h`;
  if (ms > 0 && ms < 60000) return `${Math.round(ms / 1000)} s`;
  return `${minutes} min`;
}
/** @param {number} ms @returns {string} minutes, the unit the step limit is edited in */
function minutesLabel(ms) { return `${Math.max(1, Math.round(ms / 60000))} min`; }
/** Parse a duration the human typed back into milliseconds, in the unit the row shows. @param {string} value @param {'ms' | 'min' | 'minOrOff'} unit @returns {number | null} */
function parseDuration(value, unit) {
  const text = String(value).trim().toLowerCase().replace(/\s+/g, ' ');
  if (unit === 'minOrOff' && (text === '0' || text === 'off')) return 0;
  const match = /^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?$/.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  const suffix = match[2] || (unit === 'min' || unit === 'minOrOff' ? 'min' : 'min');
  const factor = suffix.startsWith('s') ? 1000 : suffix.startsWith('h') ? 3600000 : 60000;
  const ms = Math.round(amount * factor);
  return Number.isSafeInteger(ms) && ms >= 0 ? ms : null;
}
/** @param {ScreenModel | undefined} model */
function levelsFor(model) { return model ? supportedEfforts(model) : EFFORT_LEVELS; }
/** @param {number} index @param {number} delta @param {number} length @returns {number} */
function wrapIndex(index, delta, length) { return length ? ((index + delta) % length + length) % length : 0; }
/**
 * Where a window of `size` rows starts so `selected` stays inside it.
 * @param {number} total @param {number} selected @param {number} size @returns {number}
 */
function windowStart(total, selected, size) {
  if (size >= total) return 0;
  return Math.max(0, Math.min(selected - Math.floor(size / 2), total - size));
}
/** @param {import('./ui.js').UIContext} ctx @returns {RowOption[]} */
function scopeOptions(ctx) {
  return [...(ctx.isProjectTrusted?.() ? [{ value: 'project', label: 'this project', hint: 'This project: overrides for this repository on top of the global defaults. Switching copies nothing.' }] : []),
    { value: 'global', label: 'global', hint: 'Global: defaults for every project. Switching copies nothing.' }];
}
/** @type {readonly RowOption[]} */
const POLICY_OPTIONS = [
  { value: 'final-only', label: 'final-only', hint: 'Review once, after the whole plan. Questions are always allowed.' },
  { value: 'milestones', label: 'milestones', hint: 'Approve each milestone of the plan.' },
  { value: 'every-step', label: 'every-step', hint: 'Approve every small step; a step may change at most the step size limit of files.' }
];
/** @type {readonly RowOption[]} */
const DETAIL_OPTIONS = [
  { value: 'minimal', label: 'minimal', hint: 'Shortest reports.' },
  { value: 'normal', label: 'normal', hint: 'Changes, reasons and evidence.' },
  { value: 'detailed', label: 'detailed', hint: 'Fuller reasoning and evidence.' }
];

/**
 * The settings screen: in Pi's TUI one overlay that stays open while you edit; anywhere else, and when the host
 * has no custom views, the select-based settingsUI runs unchanged.
 * @param {import('@earendil-works/pi-coding-agent').ExtensionCommandContext} ctx
 * @param {PairConfig} original
 * @param {ConfigScope} initialScope
 * @param {ApplySettings} onApply
 * @param {SettingsOptions} [options]
 * @returns {Promise<void>}
 */
export async function settingsScreen(ctx, original, initialScope, onApply, options = {}) {
  if (!(ctx.mode === 'tui' && typeof ctx.ui.custom === 'function')) return settingsUI(ctx, original, initialScope, onApply, options);
  const models = await availableModels(ctx);
  /** @type {ScreenSession} */
  const session = { saved: clone(original), scope: initialScope, workerId: original.workers[0].id, page: /** @type {SettingsPage} */ ('workers'), rowId: 'model', status: '', tone: 'none' };
  /** @type {number | undefined} */
  let columns;
  for (;;) {
    /** @type {ScreenAnswer | undefined} */
    const answer = await ctx.ui.custom((tui, theme, keys, done) => {
      columns = tui.terminal?.columns;
      const view = new SettingsView({ ctx, session, models, onApply, options, theme: theme ?? null, keys: keys ?? null, tui, done });
      return {
        get focused() { return view.focused; },
        set focused(value) { view.focused = value; },
        // The view itself, so a host (or a test) can read the page model without re-deriving it from the render.
        view,
        /** @param {number} width */ render(width) { return view.render(width); },
        /** @param {string} data */ handleInput(data) { view.handleInput(data); },
        invalidate() { view.activeInput()?.invalidate(); }
      };
    }, { overlay: true, overlayOptions: () => overlayOptions(columns) });
    if (!answer) return;
    await runOutside(answer);
  }

  /**
   * Work that needs a Pi dialog and must therefore not run while this overlay is open. Whatever happens, the
   * screen reopens on the same page and row with the result in its status line.
   * @param {ScreenAnswer} answer @returns {Promise<void>}
   */
  async function runOutside(answer) {
    try {
      if (answer.run === 'save') {
        await persist(session, answer.next, onApply);
        session.status = `✔ Saved — ${answer.label}: ${answer.value} (${scopeName(session.scope)})`;
        session.tone = 'ok';
        return;
      }
      if (answer.run === 'migrate') {
        const before = options.migrationPending?.(session.scope) ?? false;
        const next = await options.migrate?.(session.scope);
        if (next) session.saved = clone(next);
        // A migration can leave every effective value the same, so the pending flag, not the config, is the outcome.
        const applied = before && !(options.migrationPending?.(session.scope) ?? false);
        session.status = applied ? `✔ Migration applied — ${scopeName(session.scope)}` : 'Migration not applied.';
        session.tone = applied ? 'ok' : 'info';
        return;
      }
      if (answer.run === 'remove') {
        // Removing a worker also decides its conversation, and that is destructive enough to ask outside the screen.
        // The host performs it and reopens the screen; a refusal keeps the list as it was.
        const next = await options.removeWorker?.(answer.workerId);
        if (next) { session.saved = clone(next); session.workerId = next.workers[0].id; session.rowId = 'worker'; }
        session.status = next ? `✔ Removed worker ${answer.workerId}` : 'Worker not removed.';
        session.tone = next ? 'ok' : 'info';
        return;
      }
      if (answer.run === 'json') {
        // The scope's whole file, as a layer. Each attempt validates before anything is written, and an invalid
        // edit is refused with an offer to edit again — never a partly written file.
        if (!options.readLayer || !options.saveLayer) { session.status = 'This host cannot edit the settings file as JSON.'; session.tone = 'error'; return; }
        // What was typed, so a refused edit can be offered back for correction instead of starting over. The
        // error itself is kept in the status line and in a notification even when the human declines.
        /** @type {string | undefined} */
        let draft;
        /** @param {unknown} error @param {string} text @returns {Promise<boolean>} */
        const again = async (error, text) => {
          const reason = briefError(error);
          session.status = `✖ Not saved: ${reason}`;
          session.tone = 'error';
          ctx.ui.notify(`Pair settings not saved: ${reason}`, 'error');
          if (!await ctx.ui.confirm('That JSON was not saved', `${reason}\n\nThe file is unchanged. Edit it again?`)) return false;
          session.status = `Editing again — ${reason}`;
          session.tone = 'info';
          return true;
        };
        for (;;) {
          const layer = await options.readLayer(session.scope);
          const edited = await ctx.ui.editor(`Pair settings for ${scopeName(session.scope)} as JSON. It is validated before it is saved; an invalid layer is refused and the file left as it was.`, draft ?? JSON.stringify(layer, null, 2));
          if (edited === undefined) { session.status = 'JSON editing cancelled; the file is unchanged.'; session.tone = 'info'; return; }
          /** @type {unknown} */
          let parsed;
          try { parsed = JSON.parse(edited); }
          catch (error) { if (await again(error, edited)) { draft = edited; continue; } session.status = `✖ Not saved: ${briefError(error)}`; session.tone = 'error'; return; }
          try { validateConfigLayer(parsed); }
          catch (error) { if (await again(error, edited)) { draft = edited; continue; } session.status = `✖ Not saved: ${briefError(error)}`; session.tone = 'error'; return; }
          const next = await options.saveLayer(/** @type {Record<string, unknown>} */ (parsed), session.scope);
          if (next) session.saved = clone(next);
          session.status = `✔ Saved — the ${scopeName(session.scope)} file as JSON`;
          session.tone = 'ok';
          return;
        }
      }
      if (answer.run === 'duplicate') {
        // Like removal, the host saves it: a copy is a config edit through the same merge path as any other.
        const next = await options.duplicateWorker?.(answer.workerId, answer.newId);
        if (next) { session.saved = clone(next); session.workerId = answer.newId; session.rowId = 'model'; }
        session.status = next ? `✔ Copied worker ${answer.workerId} to ${answer.newId}` : `Worker ${answer.workerId} was not copied.`;
        session.tone = next ? 'ok' : 'info';
        return;
      }
      const current = session.saved.verification.commands;
      const edited = await ctx.ui.editor('Trusted verification argv, run locally at checkpoints. Example: [{"name":"tests","command":"npm","args":["test"]}]', JSON.stringify(current, null, 2));
      if (edited === undefined) { session.status = 'Verification commands left unchanged.'; session.tone = 'info'; return; }
      /** @type {unknown} */ const parsed = JSON.parse(edited);
      const authorized = await authorizeVerification(ctx, current, /** @type {VerificationCommand[]} */ (parsed));
      if (!authorized) { session.status = 'Verification commands left unchanged.'; session.tone = 'info'; return; }
      const next = clone(session.saved);
      next.verification.commands = authorized;
      await persist(session, next, onApply);
      session.status = `✔ Saved — Verification commands: ${authorized.length} configured (${scopeName(session.scope)})`;
      session.tone = 'ok';
    } catch (error) { session.status = `✖ Not saved: ${briefError(error)}`; session.tone = 'error'; }
  }
}

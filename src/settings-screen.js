import { Input, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { briefError, clone } from './util.js';
import { INDICATORS, validateConfig } from './config.js';
import { EFFORT_LEVELS } from './contracts.js';
import { INDICATOR_LABEL, authorizeVerification, boxFrame, clampEffort, effortHint, hints, isCancel, keyIs, onOff, overlayOptions, overlayRows, packHints, settingsUI, supportedEfforts, workerModel } from './ui.js';

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
/** @typedef {'worker' | 'review' | 'display' | 'general'} SettingsPage */
/** @typedef {'list' | 'options' | 'model' | 'input'} ScreenMode */
/** @typedef {{value: string, label: string, hint: string}} RowOption */
/** @typedef {{id: string, label: string, value: string, hint: string, kind: 'toggle' | 'choice' | 'number' | 'text' | 'model' | 'add' | 'open', options?: readonly RowOption[], tone?: 'warning', work?: 'verification' | 'migrate'}} SettingsRow */
/** @typedef {'ok' | 'error' | 'info' | 'none'} StatusTone */
/** @typedef {{saved: PairConfig, scope: ConfigScope, workerId: string, page: SettingsPage, rowId: string, status: string, tone: StatusTone}} ScreenSession */
/** @typedef {{run: 'verification'} | {run: 'migrate'} | {run: 'save', next: PairConfig, label: string, value: string}} ScreenAnswer */
/** @typedef {{terminal?: {rows?: number, columns?: number}, requestRender?(): void}} ScreenTui */
/** @typedef {{ctx: import('./ui.js').UIContext, session: ScreenSession, models: ScreenModel[], onApply: ApplySettings, options: SettingsOptions, theme: PanelTheme | null, keys: KeyMatcher | null, tui: ScreenTui, done: (value?: ScreenAnswer) => void}} ViewOptions */

/** The pages, in tab order. The ids are stable so a reopen lands on the same page. */
const PAGES = /** @type {readonly {id: SettingsPage, label: string}[]} */ ([
  { id: 'worker', label: 'Worker' }, { id: 'review', label: 'Review' }, { id: 'display', label: 'Display' }, { id: 'general', label: 'General' }
]);
/** Model picker rows shown at once; the rest scroll under the filter. */
const MODEL_ROWS = 6;
/** The description lines the page list offers before the layout starts shrinking it. */
const DESC_LINES = 3;

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
    /** @type {{input: Input, index: number} | null} */ this.picker = null;
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
  activeInput() { return this.mode === 'model' ? this.picker?.input ?? null : this.mode === 'input' ? this.input : null; }
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
    if (page === 'worker') {
      if (saved.workers.length > 1) rows.push({ id: 'worker', label: 'Worker', value: worker.id, kind: 'choice',
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
      rows.push({ id: 'add', label: 'Add a worker…', value: '', kind: 'add', hint: 'Add another worker slot. Only one worker runs at a time.' });
      return rows;
    }
    if (page === 'review') {
      rows.push({ id: 'policy', label: 'Review policy', value: saved.supervision.mode, kind: 'choice', options: POLICY_OPTIONS,
        hint: 'How often Main reviews the worker. Final acceptance is always required.' });
      if (saved.supervision.mode === 'every-step') rows.push({ id: 'stepFiles', label: 'Step size limit', value: `${saved.supervision.maxStepFiles ?? 5} files`, kind: 'number',
        hint: 'Every-step only: a step that changes more files than this cannot be approved; Main asks for smaller steps.' });
      rows.push({ id: 'revisions', label: 'Revision limit', value: String(saved.supervision.maxRevisions), kind: 'number',
        hint: 'How many times Main may send work back before the task stops (0–20).' });
      rows.push({ id: 'detail', label: 'Report detail', value: saved.supervision.summaryDetail, kind: 'choice', options: DETAIL_OPTIONS,
        hint: 'How much the worker writes in each report.' });
      const names = saved.verification.commands.map(command => command.name);
      rows.push({ id: 'verification', label: 'Verification commands', value: names.length ? `${names.length} configured` : 'none', kind: 'open', work: 'verification',
        hint: `Commands Pair runs itself at every checkpoint, with your permissions (for example your tests). Enter opens the editor.${names.length ? ` Configured: ${names.join(', ')}.` : ''}` });
      rows.push({ id: 'autoDeliver', label: 'Deliver reports automatically', value: onOff(saved.autoDeliverReports), kind: 'toggle',
        hint: "On: each worker report reaches Main as soon as Main's current work is done. Off: Main collects reports with pair_yield, or send them with /pair yield." });
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
    rows.push({ id: 'scope', label: 'Save to', value: this.session.scope === 'project' ? 'this project' : 'global', kind: 'choice', options: scopeOptions(this.ctx),
      hint: 'This project: overrides for this repository on top of the global defaults. Global: defaults for every project. Switching copies nothing.' });
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

  /** @param {number} width @returns {string} */
  tabLine(width) {
    // Brackets mark the active page without colour, for tests and terminals that have no theme.
    const tabs = PAGES.map(page => (page.id === this.session.page ? this.paint('accent', this.bold(`[ ${page.label} ]`)) : this.paint('muted', page.label)));
    return clip(tabs.join(this.paint('dim', ' · ')), width);
  }

  /**
   * The interchangeable list of the page: the setting rows, an option list, or the model picker. All three are
   * windowed the same way, so shrinking has one shape to work with.
   * @param {number} width @returns {string[]}
   */
  listLines(width) {
    if (this.mode === 'options') return this.optionLines(width);
    if (this.mode === 'model') return this.pickerLines(width);
    const rows = this.rowsFor(this.session.page), selected = this.currentIndex();
    return rows.map((row, index) => this.rowLine(row, width, index === selected));
  }
  /** @returns {number} */
  listSelected() {
    if (this.mode === 'options') return this.optionsState?.index ?? 0;
    if (this.mode === 'model') return this.picker?.index ?? 0;
    return this.currentIndex();
  }

  /**
   * @param {SettingsRow} row @param {number} width @param {boolean} selected @returns {string}
   */
  rowLine(row, width, selected) {
    const labelWidth = this.labelWidth(width);
    const marker = selected ? '▸ ' : '  ';
    const label = padRight(clip(row.label, labelWidth), labelWidth);
    const room = Math.max(1, width - visibleWidth(marker) - labelWidth - 2);
    const editing = selected && this.mode === 'input' && this.editing?.id === row.id;
    const labelText = this.paint(selected ? 'accent' : 'text', label);
    // An open Input keeps its own rendering: the hardware-cursor markers it emits must not end up inside a colour run.
    if (editing && this.input) return clip(`${marker}${labelText}  ${this.input.render(room)[0] ?? ''}`, width);
    const value = clip(row.value, room);
    return clip(`${marker}${labelText}  ${this.paint(row.tone === 'warning' ? 'warning' : selected ? 'accent' : 'muted', value)}`, width);
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
    if (page !== this.session.page) return this.rowsFor(page)[0]?.hint ?? '';
    if (this.mode === 'options') return this.optionsState?.hint ?? '';
    if (this.mode === 'model') return this.pickerHint();
    return this.currentRow().hint;
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
        : this.mode === 'input' ? [['tui.select.confirm', 'save'], ['tui.select.cancel', 'cancel']]
          : [['↑↓', 'move'], ['tui.select.confirm', 'change'], ['space', 'quick change'], ['tab', 'page'], ['tui.select.cancel', 'close']];
    return packHints(pairs.map(pair => hints(pair)), width).map(line => this.paint('dim', clip(line, width)));
  }

  // ---- keys -----------------------------------------------------------------

  /** @param {string} data */
  handleInput(data) {
    if (this.saving) return;
    if (this.mode === 'options') this.optionKey(data);
    else if (this.mode === 'model') this.pickerKey(data);
    else if (this.mode === 'input') this.inputKey(data);
    else this.listKey(data);
  }

  /** @param {string} data @param {string} id @param {string[]} [fallbacks] @returns {boolean} */
  is(data, id, fallbacks = []) { return keyIs(this.keys, data, id, fallbacks); }

  /** @param {string} data */
  listKey(data) {
    if (data === 'q' || isCancel(this.keys, data)) { this.close(); return; }
    if (this.is(data, 'tui.select.up', ['k']) || matchesKey(data, 'up')) { this.move(-1); return; }
    if (this.is(data, 'tui.select.down', ['j']) || matchesKey(data, 'down')) { this.move(1); return; }
    if (this.is(data, 'tui.select.pageDown', ['l']) || matchesKey(data, 'tab') || matchesKey(data, 'right')) { this.page(1); return; }
    if (this.is(data, 'tui.select.pageUp', ['h']) || matchesKey(data, 'shift+tab') || matchesKey(data, 'left')) { this.page(-1); return; }
    if (this.is(data, 'tui.select.confirm', ['\r', '\n']) || matchesKey(data, 'enter')) { this.activate(this.currentRow(), ENTER); return; }
    if (data === ' ' || matchesKey(data, 'space')) this.activate(this.currentRow(), SPACE);
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
    if (row.kind === 'open') { this.close({ run: /** @type {'verification' | 'migrate'} */ (row.work) }); return; }
    if (row.kind === 'toggle') { this.toggle(row); return; }
    if (row.kind === 'model') { this.openPicker(); return; }
    if (row.kind === 'number' || row.kind === 'text' || row.kind === 'add') { this.openInput(row); return; }
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
    else return;
    this.commit(next, row.label, onOff(on));
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
    else { this.refresh(); return; }
    this.commit(next, row.label, value);
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
    const value = row.kind === 'number' ? row.value.replace(/ files$/, '') : row.id === 'workspace' ? (this.worker().cwd || '') : '';
    const placeholder = row.kind === 'add' ? 'New worker ID (letters, digits, hyphens, underscores)' : row.kind === 'number' ? row.value : 'Absolute path, or blank for Main';
    this.editing = row; this.mode = 'input';
    this.input = this.openedInput(value, placeholder);
    this.input.onSubmit = text => this.submitInput(text);
    this.input.onEscape = () => this.cancelInput();
    this.refresh();
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
      const [low, high] = row.id === 'stepFiles' ? [1, 1000] : [0, 20], value = Number(trimmed);
      if (trimmed === '' || !Number.isInteger(value) || value < low || value > high) {
        this.session.status = `Enter a whole number from ${low} to ${high}.`; this.session.tone = 'error'; this.refresh(); return;
      }
      if (row.id === 'stepFiles') next.supervision.maxStepFiles = value;
      else next.supervision.maxRevisions = value;
      this.mode = 'list'; this.input = null; this.editing = null;
      this.commit(next, row.label, row.id === 'stepFiles' ? `${value} ${value === 1 ? 'file' : 'files'}` : String(value));
      return;
    }
    if (row.kind === 'text') {
      worker.cwd = trimmed || null;
      this.mode = 'list'; this.input = null; this.editing = null;
      this.commit(next, row.label, trimmed || 'same as Main');
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
      this.commit(next, 'Worker', slot.id);
      return;
    }
    this.cancelInput();
  }

  // ---- model picker ---------------------------------------------------------

  openPicker() {
    if (!this.models.length) { this.session.status = 'No signed-in models. Set up a provider in Pi first (/login).'; this.session.tone = 'error'; this.refresh(); return; }
    const worker = this.worker(), input = this.openedInput('', 'Type to filter models…');
    this.picker = { input, index: Math.max(0, this.models.findIndex(model => `${model.provider}/${model.id}` === `${worker.provider}/${worker.model}`)) };
    this.mode = 'model';
    this.refresh();
  }

  /** @returns {ScreenModel[]} */
  filteredModels() {
    const query = (this.picker?.input.getValue() ?? '').trim().toLowerCase();
    return query ? this.models.filter(model => `${model.provider}/${model.id} ${model.name ?? ''}`.toLowerCase().includes(query)) : this.models;
  }

  chooseModel() {
    const model = this.filteredModels()[this.picker?.index ?? 0];
    this.mode = 'list'; this.picker = null;
    if (!model) { this.refresh(); return; }
    const next = clone(this.session.saved), worker = this.nextWorker(next);
    worker.provider = model.provider; worker.model = model.id;
    const before = worker.effort, effort = clampEffort(model, before);
    worker.effort = effort;
    // The effort can be clamped by the new model; say so here rather than in a notification over the overlay.
    this.commit(next, 'Model', `${model.provider}/${model.id}`, effort === before ? '' : ` · thinking effort changed from ${before} to ${effort}`);
  }

  // ---- saving ---------------------------------------------------------------

  /** @param {PairConfig} draft @returns {WorkerSpec} */
  nextWorker(draft) { return draft.workers.find(worker => worker.id === this.session.workerId) || draft.workers[0]; }

  /**
   * Save one change. A scope with a pending migration needs Pi's confirm, so that save resolves the view, applies
   * outside it, and reopens here with the outcome in the status line.
   * @param {PairConfig} next @param {string} label @param {string} value @param {string} [extra]
   */
  async commit(next, label, value, extra = '') {
    if (this.saving) return;
    this.editing = null; this.optionsState = null;
    if (this.mode !== 'model') this.mode = 'list';
    if (this.options.migrationPending?.(this.session.scope)) { this.close({ run: 'save', next, label, value: `${value}${extra}` }); return; }
    this.saving = true; this.session.status = ''; this.session.tone = 'none';
    this.refresh();
    try {
      await persist(this.session, next, this.onApply);
      this.session.status = `✔ Saved — ${label}: ${value}${extra} (${scopeName(this.session.scope)})`;
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
  const session = { saved: clone(original), scope: initialScope, workerId: original.workers[0].id, page: 'worker', rowId: 'model', status: '', tone: 'none' };
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

import { assert, briefError, cleanText, clone } from './util.js';
import { validateConfig } from './config.js';

export function symbol(status) {
  if (['working', 'settling', 'starting'].includes(status)) return '◉';
  if (['question', 'review', 'blocked', 'permission'].includes(status)) return '◐';
  if (['attention', 'error', 'interrupted'].includes(status)) return '!';
  if (status === 'ready') return '●';
  return '○';
}
export function indicator(summary, mainBusy) {
  const workers = summary.workers.map((w, i) => `${summary.workers.length === 1 ? 'W' : `W${i + 1}`}${symbol(w.status)}`);
  return `M${mainBusy ? '◉' : '●'} ${workers.join(' ')}`;
}
export function statusText(summary, native = null) {
  const lines = ['FABRIC PAIR', '', `Main: ${summary.main?.model || 'native /model'} · ${summary.main?.busy ? 'working' : 'ready'}`, `Owner session: ${summary.ownerSession}`, ''];
  if (summary.main?.context) {
    const c = summary.main.context;
    lines.push(`Main context: ${c.tokens ?? 'unknown'} / ${c.contextWindow ?? 'unknown'} tokens`);
  }
  const mainUsage = summary.main?.lastUsage;
  if (mainUsage) lines.push(`Main last observed cache read: ${mainUsage.cacheRatio == null ? 'unknown' : (100 * mainUsage.cacheRatio).toFixed(1) + '%'} · ${Math.max(0, Math.floor((Date.now() - mainUsage.observedAt) / 1000))}s ago`);
  lines.push('');
  for (const w of summary.workers) {
    lines.push(`${w.id}: ${w.status} · ${w.model} · effort ${w.effort}`, `  PID: ${w.pid || 'not running'} · session: ${w.sessionId || 'not created'}`, `  Workspace: ${w.cwd}`);
    if (w.task) lines.push(`  ${w.task.id} · ${w.task.status} · step ${w.task.step}/${w.task.steps} · revisions ${w.task.revisions}`, `  ${w.task.objective}`);
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
  lines.push('● ready  ◉ working  ◐ waiting  ○ retained/stopped  ! attention', '', summary.cacheNote, '', `Local state and evidence: ${summary.directory}`);
  return lines.map(s => cleanText(s, 20000)).join('\n');
}
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
    return {
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
  }, { overlay: true });
}
async function numberInput(ctx, title, current, { optional = false, integer = true } = {}) {
  const input = await ctx.ui.input(title, current == null ? 'none' : String(current));
  if (input === undefined) return current;
  if (optional && /^(none|off|)$/i.test(input.trim())) return null;
  const value = Number(input); assert(Number.isFinite(value) && (!integer || Number.isInteger(value)) && value > 0, 'Enter a positive number'); return value;
}
async function pickModel(ctx, worker) {
  const query = await ctx.ui.input('Filter worker models (blank lists all)', worker.model || '');
  if (query === undefined) return;
  const models = await Promise.resolve(ctx.modelRegistry.getAvailable());
  const selected = models.filter(m => `${m.provider}/${m.id} ${m.name || ''}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => `${a.provider}/${a.id}`.localeCompare(`${b.provider}/${b.id}`));
  if (!selected.length) { ctx.ui.notify('No matching authenticated/available models. Configure the provider in Pi first.', 'warning'); return; }
  const choices = selected.slice(0, 300);
  if (selected.length > 300) ctx.ui.notify('Showing the first 300 results; use a narrower filter.', 'info');
  const answer = await ctx.ui.select('Worker model (Main stays under /model)', choices.map(m => `${m.provider}/${m.id}`));
  const model = choices.find(m => `${m.provider}/${m.id}` === answer);
  if (model) { worker.provider = model.provider; worker.model = model.id; if (model.reasoning === false) worker.effort = 'off'; }
}
/** Own command-scoped dialogs only: never replaces Fabric's settings/dashboard/footer. */
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
      else if (index === 3) selected = await ctx.ui.select('Worker', draft.workers.map(w => w.id)) || selected;
      else if (index === 4) await pickModel(ctx, w);
      else if (index === 5) w.effort = await ctx.ui.select('Effort (validated against the worker model at startup)', ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']) || w.effort;
      else if (index === 6) w.readOnly = !w.readOnly;
      else if (index === 7) { const value = await ctx.ui.input('Worker workspace: absolute path, or blank for Main', w.cwd || ''); if (value !== undefined) w.cwd = value.trim() || null; }
      else if (index === 8) {
        const modes = { 'Final: review after the complete plan; questions always allowed': 'final', 'Milestones: approve each dispatched plan milestone': 'milestones', 'Strict: approve each small plan step; no step skipping': 'strict', 'Adaptive: milestone gates plus early risk/uncertainty checkpoints': 'adaptive' };
        const pick = await ctx.ui.select('Review policy · final acceptance is always required', Object.keys(modes)); if (pick) draft.supervision.mode = modes[pick];
      }
      else if (index === 9) { const input = await ctx.ui.input('Revision limit (0–20)', String(draft.supervision.maxRevisions)); if (input !== undefined) draft.supervision.maxRevisions = Number(input); }
      else if (index === 10) draft.supervision.summaryDetail = await ctx.ui.select('Worker summary detail', ['minimal', 'normal', 'detailed']) || draft.supervision.summaryDetail;
      else if (index === 11) draft.limits.maxTurnsPerStep = await numberInput(ctx, 'Maximum turns per step', draft.limits.maxTurnsPerStep);
      else if (index === 12) draft.limits.taskTimeoutMs = 60000 * await numberInput(ctx, 'Task timeout in minutes', draft.limits.taskTimeoutMs / 60000, { integer: false });
      else if (index === 13) draft.limits.maxReportedCostUsd = await numberInput(ctx, 'Inference-only reported USD budget (none disables; excludes native warming/unknown prices)', draft.limits.maxReportedCostUsd, { optional: true, integer: false });
      else if (index === 14) draft.indicator = await ctx.ui.select('Indicator (rendering only)', ['minimal', 'off']) || draft.indicator;
      else if (index === 15) draft.maxWorkers = await numberInput(ctx, 'Preserved slot limit (1–8; V1 activates one)', draft.maxWorkers);
      else if (index === 16) {
        const id = await ctx.ui.input('New worker ID (letters, digits, hyphens, underscores)');
        if (id) { draft.workers.push({ id, provider: '', model: '', effort: 'medium', cwd: null, readOnly: false }); selected = id; }
      }
      else if (index === 17) {
        const edited = await ctx.ui.editor('Trusted verification argv, run locally at checkpoints. Example: [{"name":"tests","command":"npm","args":["test"]}]', JSON.stringify(draft.verification.commands, null, 2));
        if (edited !== undefined) {
          const commands = JSON.parse(edited);
          if (await ctx.ui.confirm('Authorize verification commands', 'These commands execute automatically at review checkpoints with your OS permissions. Only add commands you trust.')) draft.verification.commands = commands;
        }
      }
      else if (index === 18) scope = await ctx.ui.select('Save scope', ctx.isProjectTrusted?.() ? ['project', 'global'] : ['global']) || scope;
      else if (index === 19) { await onApply(validateConfig(draft), scope); return; }
    } catch (error) { ctx.ui.notify(briefError(error), 'error'); }
  }
}

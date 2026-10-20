/**
 * The opt-in terminal attention cue: one title prefix and one bell per new attention event, and Pi's own
 * title restored as soon as nothing needs the human. Display only; it never affects work.
 */
import { planWorker, workerState } from './ui.js';

/** Pi's own title format uses this prefix (pi-coding-agent dist/config.js APP_TITLE, which the package does
 * not export from its entry point, so it is mirrored here). */
export const APP_TITLE = 'π';

/**
 * Pi's own title: `${APP_TITLE} - ${cwdBasename}` or `${APP_TITLE} - ${sessionName} - ${cwdBasename}`.
 * @param {string} cwd
 * @param {string | null | undefined} sessionName
 * @returns {string}
 */
export function piTitle(cwd, sessionName) {
  const base = String(cwd || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || cwd || '';
  return sessionName ? `${APP_TITLE} - ${sessionName} - ${base}` : `${APP_TITLE} - ${base}`;
}

/**
 * Whether this summary needs the human: the ! states, a still worker, or reports that cannot reach Main.
 * Everything that is Main's job (review, question, blocked) stays quiet.
 * @param {any} summary
 * @param {number} [now]
 * @returns {{needed: boolean, reason: string, key: string}}
 */
export function attentionOf(summary, now = Date.now()) {
  if (!summary || !summary.enabled || !Array.isArray(summary.workers) || !summary.workers.length) return { needed: false, reason: '', key: '' };
  /** @type {string[]} */
  const reasons = [];
  for (const worker of summary.workers) {
    const state = workerState(summary, worker, !!summary.main?.busy, now);
    if (['attention', 'permission', 'paused'].includes(state.kind)) reasons.push(state.reason || state.text);
  }
  if ((summary.waitingReports || 0) > 0 && summary.autoDeliverReports === false) reasons.push(`${summary.waitingReports} report${summary.waitingReports === 1 ? '' : 's'} waiting · delivery off`);
  if (!reasons.length) return { needed: false, reason: '', key: '' };
  const reason = reasons[0].length > 60 ? `${reasons[0].slice(0, 57)}…` : reasons[0];
  // The key is what distinguishes one attention event from the next.
  return { needed: true, reason, key: `${reasons.join('|')}|${summary.waitingReports || 0}` };
}

/**
 * The terminal bell, for real sessions. Pi's extension UI has setTitle but no raw terminal writer, so BEL goes
 * straight to stdout — and only to a real terminal: BEL moves no cursor, so it is safe beside Pi's renderer.
 * Writing elsewhere (rpc, json, a pipe) would corrupt output, so anything but a TTY is a no-op.
 */
export function ringBell() {
  try {
    if (process.stdout.isTTY === true && typeof process.stdout.write === 'function') process.stdout.write('\u0007');
  } catch { /* a terminal that refuses the bell is not a problem */ }
}
/**
 * The cue. It is called on every render and on every summary change; it only touches the terminal when the
 * attention state actually changes, so the bell rings once per new event and the title is set once.
 * @param {{setTitle(title: string): void}} ui
 * @param {{cwd: string, sessionName?: string | null, enabled: boolean, bell?: () => void}} options
 * @returns {{update(summary: any, now?: number): void, restore(): void, readonly attention: boolean, readonly cwd: string, readonly attentionEnabled: boolean}}
 */
export function createAttentionCue(ui, { cwd, sessionName = null, enabled, bell = ringBell }) {
  let last = '';
  let active = false;
  return {
    get attention() { return active; },
    cwd,
    attentionEnabled: enabled,
    update(summary, now = Date.now()) {
      if (!enabled) return;
      const attention = attentionOf(summary, now);
      if (attention.needed === active && attention.key === last) return;
      last = attention.needed ? attention.key : '';
      active = attention.needed;
      try {
        if (attention.needed) { ui.setTitle(`! pair · ${attention.reason} — ${piTitle(cwd, sessionName)}`); try { bell(); } catch { /* the title already landed */ } }
        else ui.setTitle(piTitle(cwd, sessionName));
      } catch { /* the title is a nicety, never a failure */ }
    },
    /** Restore Pi's own title, e.g. on shutdown. */
    restore() {
      if (!enabled) return;
      active = false; last = '';
      try { ui.setTitle(piTitle(cwd, sessionName)); } catch { /* ignore */ }
    },
  };
}

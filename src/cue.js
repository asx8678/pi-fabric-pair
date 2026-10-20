/**
 * The opt-in terminal attention cue: one title prefix and one bell per new attention event, and Pi's own
 * title restored as soon as nothing needs the human. Display only; it never affects work.
 */
import { workerState } from './ui.js';

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
 * Everything that is Main's job (review, question, blocked) stays quiet. Each event gets a stable id: a
 * stalled worker whose idle time grows, or a third report joining two that wait, is still the same event,
 * while a permission dialog or a second worker in trouble is a new one.
 * @param {any} summary
 * @param {number} [now]
 * @returns {{needed: boolean, reason: string, events: string[]}}
 */
export function attentionOf(summary, now = Date.now()) {
  if (!summary || !summary.enabled || !Array.isArray(summary.workers) || !summary.workers.length) return { needed: false, reason: '', events: [] };
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const events = [];
  for (const worker of summary.workers) {
    const state = workerState(summary, worker, !!summary.main?.busy, now);
    if (!['attention', 'permission', 'paused'].includes(state.kind)) continue;
    reasons.push(state.reason || state.text);
    events.push(`${worker.id}:${state.kind}:${state.next ?? ''}`);
  }
  if ((summary.waitingReports || 0) > 0 && summary.autoDeliverReports === false) {
    reasons.push(`${summary.waitingReports} report${summary.waitingReports === 1 ? '' : 's'} waiting · delivery off`);
    events.push('reports');
  }
  if (!reasons.length) return { needed: false, reason: '', events: [] };
  const reason = reasons[0].length > 60 ? `${reasons[0].slice(0, 57)}…` : reasons[0];
  return { needed: true, reason, events };
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
 * The cue. It is called on every render and on every summary change. The bell rings once per new event; the
 * title follows the reason text (a stalled worker's idle time) and is only written when that text changes.
 * @param {{setTitle(title: string): void}} ui
 * @param {{cwd: string, sessionName?: string | null, enabled: boolean, bell?: () => void}} options
 * @returns {{update(summary: any, now?: number): void, restore(): void, retitle(name: string | null | undefined): void, readonly attention: boolean, readonly cwd: string, readonly attentionEnabled: boolean}}
 */
export function createAttentionCue(ui, { cwd, sessionName = null, enabled, bell = ringBell }) {
  /** @type {string[]} */
  let last = [];
  let active = false;
  let shown = '';
  /** @param {string} title */
  const setTitle = title => {
    if (title === shown) return;
    shown = title;
    try { ui.setTitle(title); } catch { /* the title is a nicety, never a failure */ }
  };
  return {
    get attention() { return active; },
    cwd,
    attentionEnabled: enabled,
    update(summary, now = Date.now()) {
      if (!enabled) return;
      const attention = attentionOf(summary, now);
      // An event is new when the previous update did not have it; one that clears and comes back is new again.
      const fresh = attention.events.some(event => !last.includes(event));
      last = attention.events;
      if (!attention.needed && !active) return;
      active = attention.needed;
      setTitle(attention.needed ? `! pair · ${attention.reason} — ${piTitle(cwd, sessionName)}` : piTitle(cwd, sessionName));
      if (fresh) try { bell(); } catch { /* the title already landed */ }
    },
    /** Restore Pi's own title, on shutdown or when the cue is turned off. A title the cue never changed is left alone. */
    restore() {
      if (!enabled || !active) return;
      active = false; last = []; shown = '';
      try { ui.setTitle(piTitle(cwd, sessionName)); } catch { /* ignore */ }
    },
    /**
     * Pi rewrote its own title for a renamed session. The next update writes the cue's title again, with the
     * new name; the events are unchanged, so the bell stays quiet.
     */
    retitle(name) { sessionName = name ?? null; shown = ''; },
  };
}

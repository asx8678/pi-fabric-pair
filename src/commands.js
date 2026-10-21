/**
 * Pair's small, shared vocabulary: the /pair subcommands, which of them take a worker ID, the indicator
 * modes, and the one-line did-you-mean suggester. Kept pure so the command surface can be tested directly.
 */

/** @typedef {{value: string, label: string, description: string}} PairCompletion */

/** The /pair subcommands, in the order completion lists them. @type {readonly string[]} */
export const PAIR_COMMANDS = ['settings', 'status', 'report', 'diff', 'start', 'restart', 'reload', 'stop', 'pause', 'resume', 'cancel', 'steer', 'yield', 'reconcile', 'indicator', 'inbox', 'transcript', 'doctor', 'reset-worker', 'import-backup'];

/** @type {Record<string, string>} */
const COMMAND_DESCRIPTION = {
  settings: 'Choose the worker, review policy and limits',
  status: 'Read activity, progress and observed cache usage',
  report: 'Read the current report as a card',
  diff: 'Scroll the checkpoint diff',
  start: 'Start the worker and continue its conversation',
  restart: 'Restart the worker and reload settings',
  reload: 'Reload saved settings while Main stays open',
  stop: 'Stop the worker process, keeping its history',
  pause: 'Pause the task and hold the worker',
  resume: 'Resume a paused or interrupted task',
  cancel: 'Cancel the task and keep the conversation',
  steer: 'Send a running worker an instruction without cancelling',
  yield: 'Send retained reports to Main now',
  reconcile: 'Prove an old worker process exited',
  indicator: 'Choose the footer badge and live line',
  inbox: 'Inspect retained reports',
  transcript: 'Read the worker transcript',
  doctor: 'Diagnose Pair, Pi and Fabric setup',
  'reset-worker': 'Start the next task in a new conversation',
  'import-backup': 'Import retained Pair V1 limits',
};

/** Subcommands whose second token is a worker ID. */
export const WORKER_COMMANDS = ['start', 'stop', 'pause', 'resume', 'cancel', 'steer', 'restart', 'report', 'diff', 'transcript', 'reconcile', 'reset-worker'];

/** @type {Record<string, string>} */
export const INDICATOR_DESCRIPTION = {
  minimal: 'Badge plus one live line above the editor',
  compact: 'Badge only',
  board: 'Badge plus a plan board with a row per step',
  off: 'Hide Pair from the footer',
};

/** Subcommands that start a nested token: their next token is completed too. @type {Record<string, readonly string[]>} */
const NESTED = { indicator: ['minimal', 'compact', 'board', 'off'], 'import-backup': ['global', 'project'] };

/**
 * Levenshtein distance, bounded to the interesting range. Two rows are enough for short command names.
 * @param {string} a @param {string} b @returns {number}
 */
export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    /** @type {number[]} */
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

/**
 * The subcommands close enough to suggest, best first and at most three. A unique prefix answers on its
 * own (it counts even when the distance is larger than two); otherwise the prefix matches and every
 * command within edit distance two are listed together, prefixes first.
 * @param {string} word
 * @returns {string[]}
 */
export function nearestCommands(word) {
  const lower = word.trim().toLowerCase();
  if (!lower) return [];
  if (PAIR_COMMANDS.includes(lower)) return [lower];
  const prefixed = PAIR_COMMANDS.filter(command => command.startsWith(lower)).sort();
  if (prefixed.length === 1) return prefixed;
  const near = PAIR_COMMANDS.map(command => ({ command, distance: editDistance(lower, command) }))
    .filter(item => item.distance <= 2)
    .sort((a, b) => a.distance - b.distance || a.command.localeCompare(b.command))
    .map(item => item.command);
  return [...new Set([...prefixed, ...near])].slice(0, 3);
}

/**
 * The nearest subcommand, or null when nothing is close enough.
 * @param {string} word
 * @returns {string | null}
 */
export function nearestCommand(word) { return nearestCommands(word)[0] ?? null; }

/**
 * The message for a subcommand Pair does not know: every close suggestion (up to three) when there is
 * one, the plain pointer otherwise.
 * @param {string} word
 * @returns {string}
 */
export function unknownCommandMessage(word) {
  const nearest = nearestCommands(word);
  if (!nearest.length) return 'Unknown Pair command. Use /pair for the dashboard.';
  const list = nearest.length === 1 ? `/pair ${nearest[0]}` : `${nearest.slice(0, -1).map(command => `/pair ${command}`).join(', ')} or /pair ${nearest[nearest.length - 1]}`;
  return `Unknown Pair command "${word}". Did you mean ${list}?`;
}

/**
 * Completions for the /pair argument. Every item carries a description; a worker-ID slot completes the
 * configured workers, and the second token of indicator/import-backup completes its own values.
 * @param {string} prefix everything typed after '/pair '
 * @param {readonly string[]} workerIds
 * @returns {PairCompletion[]}
 */
export function pairCompletions(prefix, workerIds = []) {
  const typed = prefix;
  const parts = typed.trimStart().split(/\s+/);
  const endsWithSpace = /\s$/.test(typed);
  const complete = (/** @type {string} */ word) => word.toLowerCase().startsWith(typed.trimStart().toLowerCase());
  // Still on the first token: complete the subcommand names.
  if (parts.length <= 1 && !endsWithSpace) {
    return PAIR_COMMANDS.filter(complete).map(command => ({ value: command, label: command, description: COMMAND_DESCRIPTION[command] }));
  }
  const command = parts[0].toLowerCase();
  const nested = /** @type {readonly string[] | undefined} */ (NESTED[command]);
  const current = endsWithSpace ? '' : parts[parts.length - 1];
  if (nested && (parts.length === 2 || (parts.length === 1 && endsWithSpace))) {
    return nested.filter(option => option.startsWith(current)).map(option => ({
      value: `${command} ${option}`, label: option,
      description: command === 'indicator' ? INDICATOR_DESCRIPTION[option] : option === 'global' ? 'Pair-wide settings' : 'This project\'s overrides' }));
  }
  if (WORKER_COMMANDS.includes(command)) {
    const workerPrefix = endsWithSpace ? '' : parts[1] ?? '';
    if (parts.length <= 2) {
      return [...new Set(workerIds)].filter(id => id.startsWith(workerPrefix)).map(id => ({ value: `${command} ${id}`, label: id, description: `Worker ${id}` }));
    }
  }
  return [];
}

/**
 * The command description Pi shows next to /pair: one sentence.
 * @returns {string}
 */
export function pairCommandDescription() { return 'Pair worker dashboard, settings and controls'; }
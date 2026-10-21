import { assert, clone, plain, safeId } from './util.js';
import { validateConfig } from './config.js';
import { EFFORT_LEVELS } from './contracts.js';

/**
 * Pure worker-list edits. Every helper takes the effective config, returns a new validated config, and never
 * mutates its argument. The one-live-worker rule itself lives in the controller; these only decide what the
 * configuration says, so they are the same whichever route (settings screen, menu, command) asks.
 * @typedef {import('./config.js').PairConfig} PairConfig
 * @typedef {import('./contracts.js').WorkerSpec} WorkerSpec
 */

/** @param {unknown} value @returns {string} */
const id = value => safeId(value, 'worker ID');

/**
 * The index of a configured worker, or a message naming the ids that do exist.
 * @param {PairConfig} config @param {unknown} workerId @returns {number}
 */
export function workerIndex(config, workerId) {
  const wanted = id(workerId);
  const index = config.workers.findIndex(worker => worker.id === wanted);
  assert(index >= 0, `No worker ${wanted}. Configured: ${config.workers.map(worker => worker.id).join(', ')}`);
  return index;
}

/** @param {PairConfig} config @param {unknown} workerId @returns {WorkerSpec} */
export function findWorker(config, workerId) { return config.workers[workerIndex(config, workerId)]; }

/**
 * Read the tokens after the id in `/pair worker add <id> [provider/model] [effort] [pi|low]`.
 * 'pi' is never an effort level, so it always means the backend. 'low' is both a backend and an effort level: it keeps
 * its historical reading — the effort — unless the model and effort slots are already filled, which is what lets
 * 'p/m high low' and 'p/m low low' choose a low backend without breaking '/pair worker add w p/m low' from before.
 * @param {string[]} tokens
 * @returns {{positionals: string[], backend: 'pi' | 'low' | undefined}}
 */
export function readWorkerTokens(tokens) {
  /** @type {string[]} */ const positionals = [];
  /** @type {'pi' | 'low' | undefined} */ let backend;
  for (const token of tokens) {
    if (backend === undefined && (token === 'pi' || (token === 'low' && positionals.length >= 2))) {
      backend = /** @type {'pi' | 'low'} */ (token);
      continue;
    }
    positionals.push(token);
  }
  return { positionals, backend };
}

/** @param {PairConfig} config @param {WorkerSpec[]} workers @returns {PairConfig} */
const withWorkers = (config, workers) => validateConfig({ ...clone(config), workers });

/**
 * Add a worker. A new id is required; the model may be blank (the settings screen then asks for one).
 * @param {PairConfig} config
 * @param {{id: unknown, provider?: unknown, model?: unknown, effort?: unknown, cwd?: unknown, readOnly?: unknown, backend?: unknown, lowCommand?: unknown, lowArgs?: unknown}} spec
 * @returns {PairConfig}
 */
export function addWorker(config, spec) {
  const workerId = id(spec.id);
  assert(!config.workers.some(worker => worker.id === workerId), `A worker named ${workerId} already exists`);
  const effort = spec.effort ?? 'medium', cwd = spec.cwd ?? null;
  assert(typeof spec.provider === 'undefined' || typeof spec.provider === 'string', 'worker.provider must be a string');
  assert(typeof spec.model === 'undefined' || typeof spec.model === 'string', 'worker.model must be a string');
  if (cwd !== null) assert(typeof cwd === 'string', 'worker.cwd must be null or a path');
  // A wrong type is refused here rather than coerced: "readOnly: 1" silently meaning false is a surprise.
  assert(typeof spec.readOnly === 'undefined' || typeof spec.readOnly === 'boolean', 'worker.readOnly must be boolean');
  // The backend is optional on the way in: a new worker with no backend given follows runtime.backend, so the
  // config keeps no redundant field and adding a worker to a Pi project does not silently pin it to Pi.
  assert(typeof spec.backend === 'undefined' || spec.backend === 'pi' || spec.backend === 'low', 'worker.backend must be "pi" or "low"');
  assert(typeof spec.lowCommand === 'undefined' || (typeof spec.lowCommand === 'string' && spec.lowCommand.length > 0), 'worker.lowCommand must be a non-empty command');
  assert(typeof spec.lowArgs === 'undefined' || (Array.isArray(spec.lowArgs) && spec.lowArgs.every(entry => typeof entry === 'string')), 'worker.lowArgs must be a string array');
  /** @type {WorkerSpec} */
  const worker = { id: workerId, provider: /** @type {string} */ (spec.provider ?? ''), model: /** @type {string} */ (spec.model ?? ''),
    effort: /** @type {WorkerSpec['effort']} */ (effort), cwd: /** @type {string | null} */ (cwd), readOnly: /** @type {boolean} */ (spec.readOnly ?? false),
    ...(spec.backend === undefined ? {} : { backend: /** @type {WorkerSpec['backend']} */ (spec.backend) }),
    ...(spec.lowCommand === undefined ? {} : { lowCommand: /** @type {string} */ (spec.lowCommand) }),
    ...(spec.lowArgs === undefined ? {} : { lowArgs: /** @type {string[]} */ (spec.lowArgs) }) };
  return withWorkers(config, [...config.workers, worker]);
}

/**
 * Copy a worker under a new id, right after it, so a near-identical second worker (another model, say) is a
 * one-step change. The copy inherits nothing about the original's process or conversation: ids are what identify
 * those, so the copy starts fresh with the same settings.
 * @param {PairConfig} config @param {unknown} workerId @param {unknown} newId @returns {PairConfig}
 */
export function duplicateWorker(config, workerId, newId) {
  const index = workerIndex(config, workerId), target = id(newId);
  assert(!config.workers.some(worker => worker.id === target), `A worker named ${target} already exists`);
  const workers = [...config.workers];
  const copy = /** @type {Record<string, unknown>} */ ({ ...clone(workers[index]) });
  copy.id = target;
  workers.splice(index + 1, 0, /** @type {WorkerSpec} */ (copy));
  return withWorkers(config, workers);
}

/**
 * Remove a worker entry. The last one is never removed: Pair always has somewhere to dispatch.
 * @param {PairConfig} config @param {unknown} workerId @returns {PairConfig}
 */
export function removeWorker(config, workerId) {
  const index = workerIndex(config, workerId);
  assert(config.workers.length > 1, 'Pair needs at least one worker; add another before removing this one');
  return withWorkers(config, config.workers.filter((_, at) => at !== index));
}

/**
 * Move a worker by `delta` places (negative moves it up). Clamped to the ends rather than refused, so a key
 * pressed at the top of the list is a no-op instead of an error.
 * @param {PairConfig} config @param {unknown} workerId @param {number} delta @returns {PairConfig}
 */
export function moveWorker(config, workerId, delta) {
  const index = workerIndex(config, workerId);
  assert(Number.isInteger(delta) && delta !== 0, 'delta must be a non-zero whole number');
  const to = Math.min(config.workers.length - 1, Math.max(0, index + delta));
  if (to === index) return config;
  const workers = [...config.workers];
  const [moved] = workers.splice(index, 1);
  workers.splice(to, 0, moved);
  return withWorkers(config, workers);
}

/**
 * Make a worker the default by moving it first: autoStart, an argument-less command and a bare dispatch all use
 * the first entry, so "default" needs no second source of truth that could disagree with the list order.
 * @param {PairConfig} config @param {unknown} workerId @returns {PairConfig}
 */
export function makeDefault(config, workerId) {
  const index = workerIndex(config, workerId);
  if (index === 0) return config;
  return moveWorker(config, workerId, -index);
}

/**
 * Change one worker's settings. Only the fields given change, so a caller edits what it shows and nothing else.
 * @param {PairConfig} config @param {unknown} workerId @param {{provider?: unknown, model?: unknown, effort?: unknown, cwd?: unknown, readOnly?: unknown}} patch
 * @returns {PairConfig}
 */
export function updateWorker(config, workerId, patch) {
  const index = workerIndex(config, workerId);
  const allowed = ['provider', 'model', 'effort', 'cwd', 'readOnly'];
  for (const key of Object.keys(patch)) assert(allowed.includes(key), `Unknown worker setting ${key}`);
  /** @type {Record<string, unknown>} */
  const worker = { ...clone(config.workers[index]) };
  const given = /** @type {Record<string, unknown>} */ (patch);
  for (const key of allowed) if (Object.hasOwn(given, key)) worker[key] = given[key];
  if (worker.effort !== undefined) assert(EFFORT_LEVELS.some(level => level === worker.effort), `Unsupported effort level; use one of ${EFFORT_LEVELS.join(', ')}`);
  if (worker.cwd !== null) assert(typeof worker.cwd === 'string', 'worker.cwd must be null or a path');
  const workers = [...config.workers]; workers[index] = /** @type {WorkerSpec} */ (worker);
  return withWorkers(config, workers);
}

/** A short one-line description of a worker, for command output and menus. @param {WorkerSpec} worker @returns {string} */
export function describeWorker(worker) {
  const model = worker.provider && worker.model ? `${worker.provider}/${worker.model}` : 'no model yet';
  return `${worker.id} — ${model}, ${worker.effort}${worker.readOnly ? ', read-only' : ''}${plain(worker) && worker.cwd ? `, in ${worker.cwd}` : ''}`;
}

/**
 * The doctor note for a low worker, or null for a Pi one. It is a separate function so the claim can be tested where a
 * human reads it: a low worker has no in-worker tool_call gate, so `control.blockedCommands` is not a policy low can be
 * given (`--protect` names paths, not commands) and no shell timeout is injected. Naming the backend a step is safe on
 * is the actionable part.
 * @param {string} workerId @param {'pi' | 'low'} backend @returns {string | null}
 */
export function lowBackendGuardNote(workerId, backend) {
  if (backend !== 'low') return null;
  return `Worker ${workerId} runs on the low backend, which has no in-worker gate: control.blockedCommands does not apply to it (low's --protect names paths, not commands) and no shell timeout is injected, so low's own sandbox is the only guard for shell work. Run the worker on "pi" if a step must not run git push, npm publish or sudo`;
}

/**
 * The /pair worker list view: every configured worker in list order, the first marked as the default, and the
 * never-started ones labelled rather than omitted. Reads the summary rows the dashboard already builds.
 * @param {Array<Record<string, unknown>>} workers
 * @returns {string}
 */
export function workerListText(workers) {
  if (!workers.length) return ['No workers are configured.', '', '> Add one with /pair worker add <id> [provider/model] [effort] [pi|low].'].join('\n');
  const lines = [];
  workers.forEach((row, index) => {
    // Two lines per worker: the ID and its state, then the model settings. A long model name then never squeezes
    // the state out of view or widens the panel past 60 columns.
    const id = clip(String(row.id ?? ''), 20), model = typeof row.model === 'string' && row.model !== '/' ? row.model : 'no model yet';
    const status = row.status === 'not_started' ? 'not started' : clip(String(row.status ?? 'not started'), 16);
    const mark = index === 0 ? '★' : '·', here = index === 0 ? ' (default)' : '';
    lines.push('', `  ${mark} ${id}${here}`, `      ${status}`);
    // The backend is part of what a worker is: a roster that does not say it hides which process will run.
    const on = row.backend === 'low' ? 'low' : row.backend === 'pi' ? 'pi' : null;
    lines.push(`      ${clip(`${model}, ${String(row.effort ?? '')}${on ? `, ${on}` : ''}${row.readOnly ? ', read-only' : ''}`, 54)}`);
  });
  lines.push('', '> /pair start <id> and /pair stop <id>', '> switch between workers. /pair worker default <id>', '> moves it first: a bare start and a dispatch', '> to a worker use the first entry.');
  return lines.join('\n');
}
/**
 * Shorten to `width`, ending in an ellipsis, so a long model name cannot widen the table.
 * @param {string} text @param {number} width
 * @returns {string}
 */
function clip(text, width) { return text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`; }

/**
 * Fill a blank provider/model on a worker being added from one "provider/model" argument. Returns the fields to
 * pass to addWorker; a bare name with no slash is taken as a model on the same provider as the first worker.
 * @param {PairConfig} config @param {unknown} value @returns {{provider: string, model: string}}
 */
export function splitModel(config, value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { provider: '', model: '' };
  const slash = text.indexOf('/');
  if (slash > 0 && slash < text.length - 1) return { provider: text.slice(0, slash), model: text.slice(slash + 1) };
  return { provider: config.workers[0]?.provider || '', model: text };
}

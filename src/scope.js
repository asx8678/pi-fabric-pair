// Step scope: the repository-relative globs a step may change, and the one place that decides whether a path is
// inside them. A scope is Main's statement of which files a step is about; it is data in the work order, so it
// survives compaction, a restart and a change of conversation branch.
//
// The rules are deliberately small and explicit, because a wrong answer here either blocks legitimate work or
// lets a scope mean nothing:
//   - an entry is a repository-relative glob, using / as the separator;
//   - "*" matches within one path segment and "?" matches exactly one character (never zero, never two);
//   - "**" matches any number of directories, including none when more segments follow, so "src/**/test.js"
//     covers "src/test.js" and "src/d/e/test.js", while a trailing "src/**" needs something under "src";
//   - an entry with no wildcard that names a directory (no extension, or written with a trailing /) also covers
//     everything under it, so "src/util" is "src/util/**" and "docs/" is "docs/**";
//   - nothing may be absolute and no entry may contain "..": a scope cannot reach outside the repository.
import path from 'node:path';
import { assert } from './util.js';

/**
 * Whether an entry climbs out of the repository or is otherwise not a repository-relative glob.
 * @param {string} entry
 * @returns {boolean}
 */
export function scopeEscapes(entry) {
  if (typeof entry !== 'string' || entry.trim().length === 0) return true;
  const normalized = entry.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return true;
  if (/^[A-Za-z]:/.test(normalized)) return true; // a Windows drive is absolute too
  return normalized.split('/').some(segment => segment === '..');
}

/** @param {unknown[]} scope @param {string} label */
export function assertScope(scope, label) {
  assert(Array.isArray(scope), `${label} must be an array of repository-relative globs`);
  assert(scope.length <= 32, `${label} holds at most 32 globs`);
  for (const [index, entry] of scope.entries()) {
    assert(typeof entry === 'string', `${label}[${index}] must be a string`);
    assert(!scopeEscapes(entry), `${label}[${index}] must be a repository-relative glob, not ${JSON.stringify(entry)}: no absolute path and no ".."`);
    assert(entry.length <= 300, `${label}[${index}] is too long (300 characters)`);
  }
}

/**
 * A glob as a matcher over a repository-relative, /-separated path.
 * @param {string} entry
 * @returns {(file: string) => boolean}
 */
function matcher(entry) {
  let pattern = entry.replace(/\\/g, '/').replace(/^\.\//, '');
  // A trailing "/" says the entry is a directory: everything under it is in scope. A wildcard-free name that is a
  // directory (it says so, or carries no extension) covers its tree the same way.
  const directory = pattern.endsWith('/');
  if (directory) pattern = pattern.slice(0, -1);
  if (directory || (!/[*?]/.test(pattern) && !/\.[A-Za-z0-9]+$/.test(pattern))) pattern = `${pattern}/**`;
  // One wildcard syntax, segment by segment: "*" within a segment, "?" exactly one character, and "**" any number of
  // directories — zero of them when it is followed by more segments, so "src/**/test.js" covers "src/test.js" too.
  const segments = pattern.split('/');
  let source = '';
  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;
    // A globstar that spans directories already ends with the separator, so the next segment needs none.
    if (index > 0 && segments[index - 1] !== '**') source += '/';
    source += segment === '**'
      ? (last ? '(?:[^/]+/)*[^/]+' : '(?:[^/]+/)*')
      : Array.from(segment).map(part => part === '*' ? '[^/]*' : part === '?' ? '[^/]' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  }
  let expression;
  try { expression = new RegExp(`^(?:${source})$`); } catch { return () => false; }
  return file => expression.test(file);
}

/**
 * Whether a repository-relative path is inside the scope. An empty or absent scope covers everything: a step that
 * says nothing about files is not restricted, which is the behaviour every existing step already had.
 * @param {string[] | undefined} scope
 * @param {string} file repository-relative, /-separated
 * @returns {boolean}
 */
export function scopeMatches(scope, file) {
  if (!Array.isArray(scope) || scope.length === 0) return true;
  const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
  return scope.some(entry => matcher(entry)(normalized));
}

/**
 * The changed files a step's scope does not cover. Paths are compared repository-relative; a file outside the
 * repository (a worker may run in a subdirectory) cannot be in a repository-relative scope and is reported as such.
 * @param {string[] | undefined} scope @param {string[]} changed @param {string} repoRoot
 * @returns {string[]}
 */
export function outOfScope(scope, changed, repoRoot) {
  if (!Array.isArray(scope) || scope.length === 0) return [];
  return changed.filter(file => {
    const relative = path.isAbsolute(file) ? path.relative(repoRoot, file) : file;
    return !scopeMatches(scope, relative.split(path.sep).join('/'));
  });
}

/**
 * The sentence a block and a notice share, so a refusal and a warning say the same thing.
 * @param {string[]} scope
 * @returns {string}
 */
export function scopeSentence(scope) { return `this step's scope is ${scope.join(', ')}`; }

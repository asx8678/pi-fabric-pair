import fs from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assert, atomicJSON, bounded, canonical, digest, exists, inside, mkdirPrivate, plain, readJSON } from './util.js';
import { validateSnapshot } from './contracts.js';

const MAX_PATCH_CHARS = 1024 * 1024;
// Checkpoint truncation counts UTF-16 units. UTF-8 uses at most three bytes
// per unit (including replacement of an unpaired surrogate), so do not reject
// valid non-ASCII patches while bounding the actual retained-file read.
const MAX_PATCH_BYTES = MAX_PATCH_CHARS * 3;

/** @typedef {{cwd?: string, timeoutMs?: number, maxBytes?: number, signal?: AbortSignal}} CommandOptions */
/** @typedef {{code: number | null, signal: NodeJS.Signals | null, stdout: string, stderr: string, bytes: number, truncated: boolean, timedOut: boolean, aborted: boolean}} CommandResult */
/** Spawn failures have no signal/byte/abort observation; do not manufacture one.
 * @typedef {Pick<CommandResult, 'code' | 'stdout' | 'stderr' | 'timedOut' | 'truncated'> & Partial<Pick<CommandResult, 'signal' | 'bytes' | 'aborted'>>} VerificationCommandResult
 */
/** @typedef {{path: string, kind: 'missing' | 'file' | 'symlink', sha: string | null, size: number, executable: boolean}} SnapshotEntry */
/** Field order is part of the existing snapshot hash, not canonicalized JSON.
 * @typedef {{root: string, head: string | null, entries: SnapshotEntry[], hash: string, capturedAt: number, totalBytes: number}} Snapshot
 */
/** @typedef {{path: string, before: SnapshotEntry | null, after: SnapshotEntry | null}} CheckpointFile */
/** @typedef {{version: 1, taskId: string, reportId: string, baseHash: string, checkpointHash: string, root: string, changed: string[], changedBytes: number, files: CheckpointFile[], snapshot: Snapshot, verification: import('./contracts.js').VerificationResult[], patchTruncated: boolean, createdAt: number}} CheckpointManifest */
/** @typedef {{absolute: string, missing: true} | {absolute: string, missing: false, stat: import('node:fs').Stats}} WorkspaceEntry */
/** Inspection returns retained metadata, not a validated CheckpointManifest.
 * File inspection validates the snapshot and the selected after-image against it.
 * A deleted path is additionally authenticated against the exact saved base
 * snapshot named by manifest.baseHash, then served from its immutable
 * before-image blob. Other retained manifest metadata is not promoted to a
 * validated CheckpointManifest.
 * @typedef {{checkpointHash: unknown, baseHash: unknown, changed: unknown, verification: unknown, patchTruncated: unknown, patch: string, localArtifact: string}} InspectionSummary
 * @typedef {{file: string, deleted: true, kind: 'file' | 'symlink', sha: string, checkpointHash: unknown, binary: boolean, bytes: number, content: string | null, truncated: boolean} | {file: string, kind: unknown, sha: string, checkpointHash: unknown, binary: boolean, bytes: number, content: string | null, truncated: boolean}} FileInspection
 */
/** @param {string} command @param {string[]} args @param {CommandOptions} [options] @returns {Promise<CommandResult>} */
export async function runCommand(command, args, { cwd, timeoutMs = 30000, maxBytes = 1024 * 1024, signal } = {}) {
  assert(typeof command === 'string' && Array.isArray(args), 'Command and argv must be explicit');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' }, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true, detached: process.platform !== 'win32' });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), total = 0, truncated = false, timedOut = false, aborted = false, finished = false;
    let stopping = false;
    /** @type {Promise<void>} */
    let containment = Promise.resolve();
    /** @param {NodeJS.Signals} sig */
    const kill = sig => { try { if (process.platform !== 'win32') { if (child.pid !== undefined) process.kill(-child.pid, sig); } else child.kill(sig); } catch {} };
    const stop = () => {
      if (stopping) return;
      stopping = true; kill('SIGTERM');
      containment = new Promise(resolve => { setTimeout(() => { kill('SIGKILL'); resolve(); }, 1000); });
    };
    const onAbort = () => { aborted = true; stop(); };
    if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    /** @param {'stdout' | 'stderr'} which @param {Buffer} data */
    const collect = (which, data) => {
      total += data.length;
      const current = which === 'stdout' ? stdout : stderr;
      const remaining = Math.max(0, maxBytes - current.length);
      if (data.length > remaining) truncated = true;
      const next = Buffer.concat([current, data.subarray(0, remaining)]);
      if (which === 'stdout') stdout = next; else stderr = next;
    };
    child.stdout.on('data', chunk => collect('stdout', chunk)); child.stderr.on('data', chunk => collect('stderr', chunk));
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
    child.once('error', error => { if (!finished) { finished = true; cleanup(); void containment.then(() => reject(error)); } });
    child.once('close', (code, terminationSignal) => { if (!finished) { finished = true; cleanup(); void containment.then(() => resolve({ code, signal: terminationSignal, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), bytes: total, truncated, timedOut, aborted })); } });
  });
}
/** @param {string} cwd @param {string[]} args @param {CommandOptions} [options] @returns {Promise<string>} */
export async function git(cwd, args, options = {}) {
  const result = await runCommand('git', ['--no-pager', ...args], { cwd, maxBytes: 16 * 1024 * 1024, ...options });
  assert(result.code === 0 && !result.truncated, `git ${args[0]} failed: ${bounded(result.stderr || result.stdout, 2000)}`);
  return result.stdout;
}
/** @param {string} cwd @returns {Promise<string>} */
export async function repositoryRoot(cwd) {
  try { return canonical((await git(cwd, ['rev-parse', '--show-toplevel'])).trim()); }
  catch { throw new Error(`Pair requires a Git working tree for immutable review evidence: ${cwd}`); }
}
/** @param {string} root @param {string} name @returns {Promise<WorkspaceEntry>} */
async function workspaceEntry(root, name) {
  assert(!path.isAbsolute(name), `Unsafe absolute Git path: ${name}`);
  const absolute = path.resolve(root, name);
  assert(inside(root, absolute) && absolute !== root, `Unsafe Git path: ${name}`);
  const relative = path.relative(root, absolute);
  const parts = relative.split(path.sep).filter(Boolean);
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    cursor = path.join(cursor, part);
    let ancestor;
    try { ancestor = await fs.lstat(cursor); }
    catch (error) { if (plain(error) && error.code === 'ENOENT') return { absolute, missing: true }; throw error; }
    assert(ancestor.isDirectory() && !ancestor.isSymbolicLink(), `Unsafe symlink or non-directory ancestor in evidence path: ${name}`);
  }
  let stat;
  try { stat = await fs.lstat(absolute); }
  catch (error) { if (plain(error) && error.code === 'ENOENT') return { absolute, missing: true }; throw error; }
  return { absolute, stat, missing: false };
}
/** @param {import('node:fs').Stats} before @param {import('node:fs').Stats} after */
function sameEntry(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.mode === after.mode &&
    before.size === after.size && before.mtimeMs === after.mtimeMs;
}

/** Validate BEFORE selecting a content-addressed path. Syntax is not a sandbox:
 * parent-directory symlinks/replacement still require trusted Pair storage.
 * @param {string} directory @param {unknown} sha @returns {string}
 */
function blobPath(directory, sha) {
  assert(typeof sha === 'string' && sha.length === 64 && /^[a-f0-9]{64}$/.test(sha), 'Invalid evidence blob hash');
  return path.join(directory, sha);
}
/** Bound the actual read, not just a pre-read stat; reject final symlinks where
 * O_NOFOLLOW is available. This is not an ancestor-directory race defense.
 * @param {string} file @param {number} maxBytes @returns {Promise<Buffer>}
 */
async function readEvidenceBytes(file, maxBytes) {
  assert(Number.isSafeInteger(maxBytes) && maxBytes >= 0, 'Invalid evidence read limit');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat();
    assert(before.isFile() && Number.isSafeInteger(before.size) && before.size <= maxBytes, 'Invalid or oversized evidence file');
    const bytes = Buffer.alloc(before.size + 1); let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    const after = await handle.stat();
    assert(sameEntry(before, after) && length === before.size, 'Evidence file changed while reading');
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

export class Evidence {
  /** @param {string} baseDir @param {import('./config.js').EvidenceConfig} limits */
  constructor(baseDir, limits) { this.baseDir = baseDir; this.blobs = path.join(baseDir, 'blobs'); this.limits = limits; }
  /** @param {string} root @returns {Promise<Snapshot>} */
  async capture(root) {
    root = await canonical(root); await mkdirPrivate(this.blobs);
    const names = [...new Set((await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))].sort();
    assert(names.length <= this.limits.maxFiles, 'Workspace exceeds evidence.maxFiles; narrow the working tree or increase the reviewed limit');
    const headResult = await runCommand('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root });
    const head = headResult.code === 0 ? headResult.stdout.trim() : null;
    let total = 0;
    /** @type {SnapshotEntry[]} */
    const entries = [];
    for (const name of names) {
      const entry = await workspaceEntry(root, name);
      if (entry.missing) { entries.push({ path: name, kind: 'missing', sha: null, size: 0, executable: false }); continue; }
      const { absolute, stat } = entry;
      assert(!stat.isDirectory(), `Git submodule/directory ${name} requires its own Pair workspace; review evidence does not silently skip it`);
      assert(stat.isFile() || stat.isSymbolicLink(), `Unsupported file type: ${name}`);
      if (stat.isSymbolicLink()) {
        const bytes = Buffer.from(await fs.readlink(absolute));
        const stable = await workspaceEntry(root, name);
        assert(!stable.missing && stable.stat.isSymbolicLink() && sameEntry(stat, stable.stat), `Symlink changed while capturing evidence: ${name}`);
        total += bytes.length; assert(total <= this.limits.maxTotalBytes, 'Workspace exceeds evidence.maxTotalBytes');
        const sha = digest(bytes.toString('utf8'));
        if (!await exists(path.join(this.blobs, sha))) await fs.writeFile(path.join(this.blobs, sha), bytes, { flag: 'wx', mode: 0o600 }).catch(/** @param {unknown} e */ e => { if (!plain(e) || e.code !== 'EEXIST') throw e; });
        entries.push({ path: name, kind: 'symlink', sha, size: bytes.length, executable: false }); continue;
      }
      const remaining = this.limits.maxTotalBytes - total;
      assert(stat.size <= remaining, 'Workspace exceeds evidence.maxTotalBytes');
      const tmp = path.join(this.blobs, `.tmp-${randomUUID()}`);
      const handle = await fs.open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try {
        const before = await handle.stat();
        assert(sameEntry(stat, before) && before.isFile(), `Evidence path changed before capture: ${name}`);
        const hash = createHash('sha256'); let actual = 0;
        const transform = new Transform({
          /** FileHandle's binary stream supplies Buffer chunks; no text encoding is installed.
           * @param {Buffer} chunk @param {BufferEncoding} _encoding @param {import('node:stream').TransformCallback} done
           */
          transform(chunk, _encoding, done) {
            actual += chunk.length;
            if (actual > remaining) { done(new Error('Workspace exceeds evidence.maxTotalBytes while reading')); return; }
            hash.update(chunk); done(null, chunk);
          }
        });
        await pipeline(handle.createReadStream({ autoClose: false }), transform, createWriteStream(tmp, { flags: 'wx', mode: 0o600 }));
        const after = await handle.stat();
        const stable = await workspaceEntry(root, name);
        assert(sameEntry(before, after) && !stable.missing && stable.stat.isFile() && sameEntry(after, stable.stat) && actual === after.size, `File or evidence path changed while capturing: ${name}`);
        const resolved = await fs.realpath(absolute);
        assert(inside(root, resolved), `Evidence path resolves outside the workspace: ${name}`);
        const sha = hash.digest('hex');
        if (await exists(path.join(this.blobs, sha))) await fs.unlink(tmp); else await fs.rename(tmp, path.join(this.blobs, sha));
        total += actual;
        entries.push({ path: name, kind: 'file', sha, size: actual, executable: (after.mode & 0o111) !== 0 });
      } finally { await handle.close(); await fs.unlink(tmp).catch(() => {}); }
    }
    const identity = { root, head, entries };
    return { ...identity, hash: digest(identity), capturedAt: Date.now(), totalBytes: total };
  }
  /** @param {Snapshot} snapshot @returns {Promise<string>} */
  async saveSnapshot(snapshot) {
    validateSnapshot(snapshot, this.limits);
    const file = path.join(this.baseDir, 'snapshots', `${snapshot.hash}.json`);
    if (!await exists(file)) await atomicJSON(file, snapshot);
    return file;
  }
  /** Content-addressed empty blob used as the after-image of a deletion diff.
   * @returns {Promise<string>}
   */
  async ensureEmptyBlob() {
    const file = blobPath(this.blobs, digest(''));
    if (!await exists(file)) await fs.writeFile(file, Buffer.alloc(0), { flag: 'wx', mode: 0o600 }).catch(/** @param {unknown} e */ e => { if (!plain(e) || e.code !== 'EEXIST') throw e; });
    return file;
  }
  /** Only the exact reference produced by saveSnapshot is eligible. Never follow
   * an arbitrary retained path, even if it contains a structurally valid snapshot.
   * @param {string} reference @param {string} expectedRoot @returns {Promise<Snapshot>}
   */
  async readSnapshot(reference, expectedRoot) {
    const name = path.basename(reference), sha = name.slice(0, -5);
    const owned = `${blobPath(path.join(this.baseDir, 'snapshots'), sha)}.json`;
    assert(name === `${sha}.json` && reference === owned, 'Snapshot reference is not an owned content-addressed file');
    const bytes = await readEvidenceBytes(owned, 64 * 1024 * 1024);
    const snapshot = validateSnapshot(JSON.parse(bytes.toString('utf8')), this.limits);
    assert(snapshot.hash === sha && snapshot.root === expectedRoot, 'Snapshot reference/hash/repository mismatch');
    return snapshot;
  }
  /** @param {string} taskId @param {string} reportId @param {Snapshot} base @param {Snapshot} current
   * @param {import('./contracts.js').VerificationResult[]} [verification] @returns {Promise<import('./contracts.js').Checkpoint>}
   */
  async checkpoint(taskId, reportId, base, current, verification = []) {
    validateSnapshot(base, this.limits); validateSnapshot(current, this.limits);
    assert(base.root === current.root, 'Checkpoint snapshots belong to different repositories');
    const dir = path.join(this.baseDir, 'reports', taskId, reportId); await mkdirPrivate(dir);
    const old = new Map(base.entries.map(e => [e.path, e])); const next = new Map(current.entries.map(e => [e.path, e]));
    const names = [...new Set([...old.keys(), ...next.keys()])].sort();
    const changed = names.filter(name => JSON.stringify(old.get(name) || null) !== JSON.stringify(next.get(name) || null));
    const changedBytes = changed.reduce((n, name) => n + (next.get(name)?.size || 0), 0);
    assert(changedBytes <= this.limits.maxArtifactBytes, 'Changed source exceeds evidence.maxArtifactBytes; split the step before review');
    let patch = ''; let patchTruncated = false;
    for (const name of changed) {
      const a = old.get(name), b = next.get(name);
      patch += `\n### ${JSON.stringify(name)} (${a?.kind || 'absent'} → ${b?.kind || 'absent'})\n`;
      if (a?.sha && b?.sha && a.sha !== b.sha && a.kind === 'file' && b.kind === 'file') {
        const result = await runCommand('git', ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', blobPath(this.blobs, a.sha), blobPath(this.blobs, b.sha)], { cwd: current.root, maxBytes: 256000 });
        assert(result.code === 0 || result.code === 1, `Could not create immutable diff for ${name}`);
        patch += result.stdout; patchTruncated ||= result.truncated;
      } else if (a?.sha && a.kind === 'file' && !b?.sha) {
        // Deleted tracked source still has an immutable before-image. Diff it
        // against the content-addressed empty blob so removed logic is visible
        // in the patch instead of only hashes that force another inspection call.
        const result = await runCommand('git', ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', blobPath(this.blobs, a.sha), await this.ensureEmptyBlob()], { cwd: current.root, maxBytes: 256000 });
        assert(result.code === 0 || result.code === 1, `Could not create immutable deletion diff for ${name}`);
        patch += result.stdout; patchTruncated ||= result.truncated;
      } else patch += `before: ${a?.sha || 'none'}\nafter: ${b?.sha || 'none'}\nUse pair_inspect(file) for immutable contents; symlink targets are shown as stored text and are not followed.\n`;
      if (patch.length > MAX_PATCH_CHARS) { patch = patch.slice(0, MAX_PATCH_CHARS); patchTruncated = true; break; }
    }
    /** @type {CheckpointManifest} */
    const manifest = { version: 1, taskId, reportId, baseHash: base.hash, checkpointHash: current.hash, root: current.root, changed, changedBytes, files: changed.map(name => ({ path: name, before: old.get(name) || null, after: next.get(name) || null })), snapshot: current, verification, patchTruncated, createdAt: Date.now() };
    await fs.writeFile(path.join(dir, 'diff.patch'), patch, { mode: 0o600 });
    await atomicJSON(path.join(dir, 'manifest.json'), manifest);
    return { path: dir, checkpointHash: current.hash, changed, verification, patchTruncated };
  }
  /** Read and authenticate one captured entry's immutable blob for review.
   * The exact recorded length and hash are re-checked; no target is followed.
   * @param {SnapshotEntry} entry @returns {Promise<{kind: 'file' | 'symlink', sha: string, binary: boolean, bytes: number, content: string | null, truncated: boolean}>}
   */
  async describeBlob(entry) {
    assert(entry.kind === 'file' || entry.kind === 'symlink', 'Missing snapshot entries have no inspectable contents');
    assert(typeof entry.sha === 'string', 'Inspectable snapshot entry has no content hash');
    const content = await readEvidenceBytes(blobPath(this.blobs, entry.sha), entry.size);
    assert(content.length === entry.size, 'Immutable evidence blob failed its size check');
    assert(createHash('sha256').update(content).digest('hex') === entry.sha, 'Immutable evidence blob failed its hash check');
    const binary = entry.kind === 'file' && content.subarray(0, 8192).includes(0);
    return { kind: entry.kind, sha: entry.sha, binary, bytes: content.length, content: binary ? null : bounded(content.toString('utf8'), 60000), truncated: content.length > 60000 };
  }
  /** @param {string} artifact @param {string} [file] @returns {Promise<InspectionSummary | FileInspection>} */
  async inspect(artifact, file) {
    assert(inside(this.baseDir, artifact), 'Artifact outside Pair storage');
    const manifest = await readJSON(path.join(artifact, 'manifest.json'), undefined, 64 * 1024 * 1024);
    assert(plain(manifest), 'Invalid checkpoint manifest');
    // Summary inspection also marks the report inspected in Controller. Its
    // intrinsic snapshot binding must be checked before any patch is consumed.
    const snapshot = validateSnapshot(manifest.snapshot, this.limits);
    assert(snapshot.hash === manifest.checkpointHash && snapshot.root === manifest.root, 'Checkpoint snapshot identity mismatch');
    if (file !== undefined) {
      assert(Array.isArray(manifest.files), 'Invalid checkpoint file list');
      /** @type {unknown[]} */
      const files = manifest.files;
      const entry = files.find(e => { assert(plain(e), 'Invalid checkpoint file entry'); return e.path === file; });
      assert(plain(entry), 'Path is not in this checkpoint');
      const after = snapshot.entries.find(e => e.path === file);
      assert(JSON.stringify(entry.after) === JSON.stringify(after || null), 'Checkpoint after-image differs from its snapshot');
      if (after?.sha) {
        const described = await this.describeBlob(after);
        return { file, kind: described.kind, sha: described.sha, checkpointHash: manifest.checkpointHash, binary: described.binary, bytes: described.bytes, content: described.content, truncated: described.truncated };
      }
      // The path no longer exists. Recover the removed source from the immutable
      // before-image, authenticated against the exact base snapshot this
      // checkpoint was diffed from; manifest before-metadata alone is not trusted.
      assert(typeof manifest.baseHash === 'string', 'Invalid checkpoint base snapshot reference');
      const base = await this.readSnapshot(path.join(this.baseDir, 'snapshots', `${manifest.baseHash}.json`), manifest.root);
      const before = base.entries.find(e => e.path === file);
      assert(before && JSON.stringify(entry.before) === JSON.stringify(before), 'Checkpoint before-image differs from its base snapshot');
      assert(before.sha, 'Deleted path has no authenticated before-image');
      const described = await this.describeBlob(before);
      return { file, deleted: true, kind: described.kind, sha: described.sha, checkpointHash: manifest.checkpointHash, binary: described.binary, bytes: described.bytes, content: described.content, truncated: described.truncated };
    }
    const patch = await readEvidenceBytes(path.join(artifact, 'diff.patch'), MAX_PATCH_BYTES);
    return { checkpointHash: manifest.checkpointHash, baseHash: manifest.baseHash, changed: manifest.changed, verification: manifest.verification, patchTruncated: manifest.patchTruncated, patch: bounded(patch.toString('utf8'), 60000), localArtifact: artifact };
  }
}
/** @param {import('./contracts.js').VerificationPolicy} config @param {string} cwd @param {string} artifactDir
 * @param {AbortSignal} [signal] @returns {Promise<import('./contracts.js').VerificationResult[]>}
 */
export async function verifyConfigured(config, cwd, artifactDir, signal) {
  await mkdirPrivate(artifactDir);
  /** @type {import('./contracts.js').VerificationResult[]} */
  const results = [];
  for (const [i, check] of config.commands.entries()) {
    /** @type {VerificationCommandResult} */
    let result;
    try { result = await runCommand(check.command, check.args, { cwd, timeoutMs: config.timeoutMs, maxBytes: 1024 * 1024, signal }); }
    catch (e) { result = { code: null, stderr: String(e), stdout: '', timedOut: false, truncated: false }; }
    const evidencePath = path.join(artifactDir, `check-${i + 1}.json`);
    await atomicJSON(evidencePath, { name: check.name, command: check.command, args: check.args, ...result, at: Date.now() });
    results.push({ name: check.name, source: 'controller-configured', passed: result.code === 0 && !result.timedOut && !result.aborted, code: result.code, timedOut: !!result.timedOut, output: bounded((result.stdout || '') + '\n' + (result.stderr || ''), 6000), artifact: evidencePath });
    if (signal?.aborted) break;
  }
  return results;
}

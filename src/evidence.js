import fs from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assert, atomicJSON, bounded, canonical, digest, exists, inside, mkdirPrivate, plain, readJSON, signalGroup } from './util.js';
import { validateSnapshot } from './contracts.js';

const MAX_PATCH_CHARS = 1024 * 1024;
const MAX_PATCH_BYTES = MAX_PATCH_CHARS * 3;

/** @typedef {{cwd?: string, timeoutMs?: number, maxBytes?: number, signal?: AbortSignal}} CommandOptions */
/** @typedef {{code: number | null, signal: NodeJS.Signals | null, stdout: string, stderr: string, bytes: number, truncated: boolean, timedOut: boolean, aborted: boolean}} CommandResult */
/** @typedef {Pick<CommandResult, 'code' | 'stdout' | 'stderr' | 'timedOut' | 'truncated'> & Partial<Pick<CommandResult, 'signal' | 'bytes' | 'aborted'>>} VerificationCommandResult */
/** @typedef {{path: string, kind: 'missing' | 'file' | 'symlink', sha: string | null, size: number, executable: boolean}} SnapshotEntry */
/** @typedef {{root: string, head: string | null, entries: SnapshotEntry[], hash: string, capturedAt: number, totalBytes: number}} Snapshot */
/** @typedef {{path: string, before: SnapshotEntry | null, after: SnapshotEntry | null}} CheckpointFile */
/** @typedef {{version: 1, taskId: string, reportId: string, baseHash: string, checkpointHash: string, root: string, changed: string[], changedBytes: number, files: CheckpointFile[], snapshot?: Snapshot, verification: import('./contracts.js').VerificationResult[], patchTruncated: boolean, createdAt: number}} CheckpointManifest */
/** @typedef {{absolute: string, missing: true} | {absolute: string, missing: false, stat: import('node:fs').BigIntStats}} WorkspaceEntry */
/**
 * @typedef {{checkpointHash: unknown, baseHash: unknown, changed: unknown, verification: unknown, patchTruncated: unknown, patch: string, localArtifact: string}} InspectionSummary
 * @typedef {{file: string, deleted: true, kind: 'file' | 'symlink', sha: string, checkpointHash: unknown, binary: boolean, bytes: number, content: string | null, truncated: boolean} | {file: string, kind: unknown, sha: string, checkpointHash: unknown, binary: boolean, bytes: number, content: string | null, truncated: boolean}} FileInspection
 */
/** @param {string} command @param {string[]} args @param {CommandOptions} [options] @returns {Promise<CommandResult>} */
async function runCommand(command, args, { cwd, timeoutMs = 30000, maxBytes = 1024 * 1024, signal } = {}) {
  assert(typeof command === 'string' && Array.isArray(args), 'Command and argv must be explicit');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' }, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true, detached: process.platform !== 'win32' });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), total = 0, truncated = false, timedOut = false, aborted = false, finished = false;
    let stopping = false;
    /** @type {Promise<void>} */
    let containment = Promise.resolve();
    /** @param {NodeJS.Signals} sig */
    const kill = (/** @type {NodeJS.Signals} */ sig) => { try { signalGroup(child.pid, sig, child); } catch {} };
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
/** Whether Git ignores `relPath` in the repository at `cwd`, so review evidence leaves it out. @param {string} cwd @param {string} relPath */
export async function gitIgnores(cwd, relPath) {
  return (await runCommand('git', ['--no-pager', 'check-ignore', '-q', relPath], { cwd, maxBytes: 4096 })).code === 0;
}
/** @param {string} cwd @returns {Promise<string>} */
export async function repositoryRoot(cwd) {
  try { return canonical((await git(cwd, ['rev-parse', '--show-toplevel'])).trim()); }
  catch { throw new Error(`Pair needs a Git repository to record review evidence, and ${cwd} is not inside one. Open Pi in a Git project, or set the worker workspace in /pair settings → Advanced.`); }
}
/** @typedef {Map<string, 'dir' | 'gone'>} AncestorMemo */
/** @param {string} root @param {string} name @param {AncestorMemo} [memo] @returns {Promise<WorkspaceEntry>} */
async function workspaceEntry(root, name, memo = new Map()) {
  assert(!path.isAbsolute(name), `Unsafe absolute Git path: ${name}`);
  const absolute = path.resolve(root, name);
  assert(inside(root, absolute) && absolute !== root, `Unsafe Git path: ${name}`);
  const relative = path.relative(root, absolute);
  const parts = relative.split(path.sep).filter(Boolean);
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    cursor = path.join(cursor, part);
    const known = memo.get(cursor);
    if (known === 'gone') return { absolute, missing: true };
    if (known === 'dir') continue;
    let ancestor;
    try { ancestor = await fs.lstat(cursor); }
    catch (error) { if (plain(error) && error.code === 'ENOENT') { memo.set(cursor, 'gone'); return { absolute, missing: true }; } throw error; }
    if (ancestor.isSymbolicLink() || !ancestor.isDirectory()) {
      assert(ancestor.isFile(), `Unsafe symlink or non-directory ancestor in evidence path: ${name}`);
      memo.set(cursor, 'gone');
      return { absolute, missing: true };
    }
    memo.set(cursor, 'dir');
  }
  let stat;
  try { stat = await fs.lstat(absolute, { bigint: true }); }
  catch (error) { if (plain(error) && error.code === 'ENOENT') return { absolute, missing: true }; throw error; }
  return { absolute, stat, missing: false };
}
/**
 * @param {import('node:fs').Stats | import('node:fs').BigIntStats} before
 * @param {import('node:fs').Stats | import('node:fs').BigIntStats} after
 */
function sameEntry(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.mode === after.mode &&
    before.size === after.size && before.mtimeMs === after.mtimeMs;
}
/** @param {import('node:fs').BigIntStats} stat */
function statKey(stat) { return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.mode}`; }
const RACY_NS = 2_000_000_000n;

/** @param {string} directory @param {unknown} sha @returns {string} */
function blobPath(directory, sha) {
  assert(typeof sha === 'string' && sha.length === 64 && /^[a-f0-9]{64}$/.test(sha), 'Invalid evidence blob hash');
  return path.join(directory, sha);
}
/** @param {string} file @param {number} maxBytes @returns {Promise<Buffer>} */
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

/** @param {string} root @returns {Promise<Map<string, Set<string>>>} */
async function indexModes(root) {
  const listing = await git(root, ['ls-files', '-z', '--stage']);
  /** @type {Map<string, Set<string>>} */
  const modes = new Map();
  for (const record of listing.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    assert(tab > 0, 'Malformed Git index record');
    const name = record.slice(tab + 1);
    const fields = record.slice(0, tab).split(' ');
    assert(name && fields.length === 3 && /^[0-7]{6}$/.test(fields[0]) && /^[0-9a-f]{40,64}$/.test(fields[1]) && /^\d+$/.test(fields[2]), `Malformed Git index record: ${bounded(record, 200)}`);
    let set = modes.get(name);
    if (!set) modes.set(name, set = new Set());
    set.add(fields[0]);
  }
  return modes;
}
export class Evidence {
  /** @param {string} baseDir @param {import('./config.js').EvidenceConfig} limits */
  constructor(baseDir, limits) {
    this.baseDir = baseDir; this.blobs = path.join(baseDir, 'blobs'); this.limits = limits;
    /** @type {Map<string, {key: string, sha: string, size: number, executable: boolean}>} */
    this.hashCache = new Map();
    /** @type {Set<string>} */
    this.knownBlobs = new Set();
  }
  /** @param {string} sha */
  async hasBlob(sha) {
    if (this.knownBlobs.has(sha)) return true;
    if (!await exists(path.join(this.blobs, sha))) return false;
    this.knownBlobs.add(sha); return true;
  }
  /** @param {string} root @returns {Promise<Snapshot>} */
  async capture(root) {
    root = await canonical(root); await mkdirPrivate(this.blobs);
    const names = [...new Set((await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))].sort();
    assert(names.length <= this.limits.maxFiles, 'Workspace exceeds evidence.maxFiles; narrow the working tree or increase the reviewed limit');
    const indexed = await indexModes(root);
    const headResult = await runCommand('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root });
    const head = headResult.code === 0 ? headResult.stdout.trim() : null;
    const now = BigInt(Date.now()) * 1_000_000n;
    /** @type {AncestorMemo} */ const memo = new Map();
    let total = 0;
    /** @type {SnapshotEntry[]} */
    const entries = [];
    for (const name of names) {
      const entry = await workspaceEntry(root, name, memo);
      if (entry.missing) { entries.push({ path: name, kind: 'missing', sha: null, size: 0, executable: false }); continue; }
      const { absolute, stat } = entry;
      if (stat.isDirectory()) {
        const modes = indexed.get(name);
        assert(modes && !modes.has('160000'), `Git submodule/directory ${name} requires its own Pair workspace; review evidence does not silently skip it`);
        const marker = await fs.lstat(path.join(absolute, '.git')).catch(error => { if (plain(error) && error.code === 'ENOENT') return null; throw error; });
        assert(!marker, `Git submodule/directory ${name} requires its own Pair workspace; review evidence does not silently skip it`);
        entries.push({ path: name, kind: 'missing', sha: null, size: 0, executable: false });
        continue;
      }
      assert(stat.isFile() || stat.isSymbolicLink(), `Unsupported file type: ${name}`);
      if (stat.isSymbolicLink()) {
        const bytes = Buffer.from(await fs.readlink(absolute));
        const stable = await workspaceEntry(root, name, memo);
        assert(!stable.missing && stable.stat.isSymbolicLink() && sameEntry(stat, stable.stat), `Symlink changed while capturing evidence: ${name}`);
        total += bytes.length; assert(total <= this.limits.maxTotalBytes, 'Workspace exceeds evidence.maxTotalBytes');
        const sha = digest(bytes.toString('utf8'));
        if (!await this.hasBlob(sha)) { await fs.writeFile(path.join(this.blobs, sha), bytes, { flag: 'wx', mode: 0o600 }).catch(/** @param {unknown} e */ e => { if (!plain(e) || e.code !== 'EEXIST') throw e; }); this.knownBlobs.add(sha); }
        entries.push({ path: name, kind: 'symlink', sha, size: bytes.length, executable: false }); continue;
      }
      const size = Number(stat.size), remaining = this.limits.maxTotalBytes - total;
      assert(size <= remaining, 'Workspace exceeds evidence.maxTotalBytes');
      const key = statKey(stat), cached = this.hashCache.get(name);
      if (cached && cached.key === key && await this.hasBlob(cached.sha)) {
        total += cached.size;
        entries.push({ path: name, kind: 'file', sha: cached.sha, size: cached.size, executable: cached.executable });
        continue;
      }
      const tmp = path.join(this.blobs, `.tmp-${randomUUID()}`);
      const handle = await fs.open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try {
        const before = await handle.stat({ bigint: true });
        assert(sameEntry(stat, before) && before.isFile(), `Evidence path changed before capture: ${name}`);
        const hash = createHash('sha256'); let actual = 0;
        const transform = new Transform({
          /** @param {Buffer} chunk @param {BufferEncoding} _encoding @param {import('node:stream').TransformCallback} done */
          transform(chunk, _encoding, done) {
            actual += chunk.length;
            if (actual > remaining) { done(new Error('Workspace exceeds evidence.maxTotalBytes while reading')); return; }
            hash.update(chunk); done(null, chunk);
          }
        });
        await pipeline(handle.createReadStream({ autoClose: false }), transform, createWriteStream(tmp, { flags: 'wx', mode: 0o600 }));
        const after = await handle.stat({ bigint: true });
        const stable = await workspaceEntry(root, name, memo);
        assert(sameEntry(before, after) && !stable.missing && stable.stat.isFile() && sameEntry(after, stable.stat) && actual === Number(after.size), `File or evidence path changed while capturing: ${name}`);
        const resolved = await fs.realpath(absolute);
        assert(inside(root, resolved), `Evidence path resolves outside the workspace: ${name}`);
        const sha = hash.digest('hex');
        if (await this.hasBlob(sha)) await fs.unlink(tmp); else { await fs.rename(tmp, path.join(this.blobs, sha)); this.knownBlobs.add(sha); }
        const executable = (Number(after.mode) & 0o111) !== 0;
        if (now - after.mtimeNs > RACY_NS && now - after.ctimeNs > RACY_NS) this.hashCache.set(name, { key: statKey(after), sha, size: actual, executable });
        else this.hashCache.delete(name);
        total += actual;
        entries.push({ path: name, kind: 'file', sha, size: actual, executable });
      } finally { await handle.close(); await fs.unlink(tmp).catch(() => {}); }
    }
    if (this.hashCache.size > names.length) { const present = new Set(names); for (const name of this.hashCache.keys()) if (!present.has(name)) this.hashCache.delete(name); }
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
  /** @returns {Promise<string>} */
  async ensureEmptyBlob() {
    const file = blobPath(this.blobs, digest(''));
    if (!await exists(file)) await fs.writeFile(file, Buffer.alloc(0), { flag: 'wx', mode: 0o600 }).catch(/** @param {unknown} e */ e => { if (!plain(e) || e.code !== 'EEXIST') throw e; });
    return file;
  }
  /** @param {string} reference @param {string} expectedRoot @returns {Promise<Snapshot>} */
  async readSnapshot(reference, expectedRoot) {
    const name = path.basename(reference), sha = name.slice(0, -5);
    const owned = `${blobPath(path.join(this.baseDir, 'snapshots'), sha)}.json`;
    assert(name === `${sha}.json` && reference === owned, 'Snapshot reference is not an owned content-addressed file');
    const bytes = await readEvidenceBytes(owned, 64 * 1024 * 1024);
    const snapshot = validateSnapshot(JSON.parse(bytes.toString('utf8')), this.limits);
    assert(snapshot.hash === sha && snapshot.root === expectedRoot, 'Snapshot reference/hash/repository mismatch');
    return snapshot;
  }
  /**
   * @param {string} taskId
   * @param {string} reportId
   * @param {Snapshot} base
   * @param {Snapshot} current
   * @param {import('./contracts.js').VerificationResult[]} [verification]
   * @returns {Promise<import('./contracts.js').Checkpoint>}
   */
  async checkpoint(taskId, reportId, base, current, verification = []) {
    validateSnapshot(base, this.limits); validateSnapshot(current, this.limits);
    assert(base.root === current.root, 'Checkpoint snapshots belong to different repositories');
    const dir = path.join(this.baseDir, 'reports', taskId, reportId); await mkdirPrivate(dir);
    await this.saveSnapshot(current);
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
        const result = await runCommand('git', ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', blobPath(this.blobs, a.sha), await this.ensureEmptyBlob()], { cwd: current.root, maxBytes: 256000 });
        assert(result.code === 0 || result.code === 1, `Could not create immutable deletion diff for ${name}`);
        patch += result.stdout; patchTruncated ||= result.truncated;
      } else patch += `before: ${a?.sha || 'none'}\nafter: ${b?.sha || 'none'}\nUse pair_inspect(file) for immutable contents; symlink targets are shown as stored text and are not followed.\n`;
      if (patch.length > MAX_PATCH_CHARS) { patch = patch.slice(0, MAX_PATCH_CHARS); patchTruncated = true; break; }
    }
    /** @type {CheckpointManifest} */
    const manifest = { version: 1, taskId, reportId, baseHash: base.hash, checkpointHash: current.hash, root: current.root, changed, changedBytes, files: changed.map(name => ({ path: name, before: old.get(name) || null, after: next.get(name) || null })), verification, patchTruncated, createdAt: Date.now() };
    await fs.writeFile(path.join(dir, 'diff.patch'), patch, { mode: 0o600 });
    await atomicJSON(path.join(dir, 'manifest.json'), manifest);
    return { path: dir, checkpointHash: current.hash, changed, verification, patchTruncated };
  }
  /**
   * @param {SnapshotEntry} entry
   * @returns {Promise<{kind: 'file' | 'symlink', sha: string, binary: boolean, bytes: number, content: string | null, truncated: boolean}>}
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
    assert(typeof manifest.checkpointHash === 'string' && typeof manifest.root === 'string', 'Invalid checkpoint manifest identity');
    const snapshot = manifest.snapshot !== undefined ? validateSnapshot(manifest.snapshot, this.limits)
      : await this.readSnapshot(path.join(this.baseDir, 'snapshots', `${manifest.checkpointHash}.json`), manifest.root);
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
  /**
   * @param {{tasks: Set<string>, snapshots: Set<string>}} retain
   * @returns {Promise<{reports: number, snapshots: number, blobs: number}>}
   */
  async collect(retain) {
    /** @param {string} dir @returns {Promise<string[]>} */
    const list = dir => fs.readdir(dir).catch(error => { if (plain(error) && error.code === 'ENOENT') return []; throw error; });
    const reportsDir = path.join(this.baseDir, 'reports'), snapshotsDir = path.join(this.baseDir, 'snapshots');
    const live = new Set(retain.snapshots), removed = { reports: 0, snapshots: 0, blobs: 0 };
    /** @type {unknown[]} */ const embedded = [];
    for (const task of await list(reportsDir)) {
      const taskDir = path.join(reportsDir, task);
      if (!retain.tasks.has(task)) { await fs.rm(taskDir, { recursive: true, force: true }); removed.reports++; continue; }
      for (const report of await list(taskDir)) {
        const manifest = await readJSON(path.join(taskDir, report, 'manifest.json'), null, 64 * 1024 * 1024).catch(() => null);
        if (!plain(manifest)) continue;
        for (const key of ['checkpointHash', 'baseHash']) if (typeof manifest[key] === 'string') live.add(manifest[key]);
        if (manifest.snapshot !== undefined) embedded.push(manifest.snapshot);
      }
    }
    /** @type {Set<string>} */ const blobs = new Set([digest('')]);
    /** @param {unknown} snapshot */
    const mark = snapshot => { if (plain(snapshot) && Array.isArray(snapshot.entries)) for (const entry of snapshot.entries) if (plain(entry) && typeof entry.sha === 'string') blobs.add(entry.sha); };
    for (const name of await list(snapshotsDir)) {
      const file = path.join(snapshotsDir, name);
      if (!live.has(name.replace(/\.json$/, ''))) { await fs.rm(file, { force: true }); removed.snapshots++; continue; }
      mark(await readJSON(file, null, 64 * 1024 * 1024).catch(() => null));
    }
    embedded.forEach(mark);
    for (const name of await list(this.blobs)) {
      if (blobs.has(name)) continue;
      await fs.rm(path.join(this.blobs, name), { force: true }); removed.blobs++;
    }
    this.knownBlobs.clear();
    return removed;
  }
}
/**
 * @param {import('./contracts.js').VerificationPolicy} config
 * @param {string} cwd
 * @param {string} artifactDir
 * @param {AbortSignal} [signal]
 * @param {{expectedHash?: string, captureSource?: () => Promise<string>}} [identity]
 * @returns {Promise<import('./contracts.js').VerificationResult[]>}
 */
export async function verifyConfigured(config, cwd, artifactDir, signal, identity = {}) {
  await mkdirPrivate(artifactDir);
  /** @type {import('./contracts.js').VerificationResult[]} */
  const results = [];
  for (const [i, check] of config.commands.entries()) {
    let sourceHash = null, drift = null;
    if (identity.captureSource) {
      sourceHash = await identity.captureSource();
      if (identity.expectedHash && sourceHash !== identity.expectedHash) drift = `VERIFICATION_SOURCE_DRIFT: check ${check.name} would run against a different workspace state than the checkpointed evidence; it was not run.`;
    }
    if (drift) {
      const evidencePath = path.join(artifactDir, `check-${i + 1}.json`);
      await atomicJSON(evidencePath, { name: check.name, command: check.command, args: check.args, sourceHash, drift, at: Date.now() });
      results.push({ name: check.name, source: 'controller-configured', passed: false, code: null, timedOut: false, output: drift, artifact: evidencePath });
      break;
    }
    /** @type {VerificationCommandResult} */
    let result;
    try { result = await runCommand(check.command, check.args, { cwd, timeoutMs: config.timeoutMs, maxBytes: 1024 * 1024, signal }); }
    catch (e) { result = { code: null, stderr: String(e), stdout: '', timedOut: false, truncated: false }; }
    let afterHash = null;
    if (identity.captureSource) {
      afterHash = await identity.captureSource();
      if (afterHash !== sourceHash) drift = `VERIFICATION_SOURCE_DRIFT: the workspace changed while running check ${check.name}; this result does not describe the checkpointed source.`;
    }
    const evidencePath = path.join(artifactDir, `check-${i + 1}.json`);
    await atomicJSON(evidencePath, { name: check.name, command: check.command, args: check.args, ...(sourceHash === null ? {} : { sourceHash }), ...(afterHash === null ? {} : { afterHash }), ...(drift ? { drift } : {}), ...result, at: Date.now() });
    const output = bounded((result.stdout || '') + '\n' + (result.stderr || ''), 6000);
    results.push({ name: check.name, source: 'controller-configured', passed: !drift && result.code === 0 && !result.timedOut && !result.aborted, code: result.code, timedOut: !!result.timedOut, output: drift ? bounded(`${drift}\n${output}`, 6000) : output, artifact: evidencePath });
    if (drift || signal?.aborted) break;
  }
  return results;
}

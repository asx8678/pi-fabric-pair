import fs from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assert, atomicJSON, bounded, canonical, digest, exists, inside, mkdirPrivate, readJSON } from './util.js';

export async function runCommand(command, args, { cwd, timeoutMs = 30000, maxBytes = 1024 * 1024, signal } = {}) {
  assert(typeof command === 'string' && Array.isArray(args), 'Command and argv must be explicit');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' }, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true, detached: process.platform !== 'win32' });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), total = 0, truncated = false, timedOut = false, aborted = false, finished = false;
    let killTimer;
    const kill = sig => { try { process.platform !== 'win32' ? process.kill(-child.pid, sig) : child.kill(sig); } catch {} };
    const stop = () => { kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 1000); killTimer.unref?.(); };
    const onAbort = () => { aborted = true; stop(); };
    if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const collect = (which, data) => {
      total += data.length;
      const current = which === 'stdout' ? stdout : stderr;
      const remaining = Math.max(0, maxBytes - current.length);
      if (data.length > remaining) truncated = true;
      const next = Buffer.concat([current, data.subarray(0, remaining)]);
      if (which === 'stdout') stdout = next; else stderr = next;
    };
    child.stdout.on('data', chunk => collect('stdout', chunk)); child.stderr.on('data', chunk => collect('stderr', chunk));
    const cleanup = () => { clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', onAbort); };
    child.once('error', error => { if (!finished) { finished = true; cleanup(); reject(error); } });
    child.once('close', (code, terminationSignal) => { if (!finished) { finished = true; cleanup(); resolve({ code, signal: terminationSignal, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), bytes: total, truncated, timedOut, aborted }); } });
  });
}
export async function git(cwd, args, options = {}) {
  const result = await runCommand('git', ['--no-pager', ...args], { cwd, maxBytes: 16 * 1024 * 1024, ...options });
  assert(result.code === 0 && !result.truncated, `git ${args[0]} failed: ${bounded(result.stderr || result.stdout, 2000)}`);
  return result.stdout;
}
export async function repositoryRoot(cwd) {
  try { return canonical((await git(cwd, ['rev-parse', '--show-toplevel'])).trim()); }
  catch { throw new Error(`Pair requires a Git working tree for immutable review evidence: ${cwd}`); }
}
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
    catch (error) { if (error.code === 'ENOENT') return { absolute, missing: true }; throw error; }
    assert(ancestor.isDirectory() && !ancestor.isSymbolicLink(), `Unsafe symlink or non-directory ancestor in evidence path: ${name}`);
  }
  let stat;
  try { stat = await fs.lstat(absolute); }
  catch (error) { if (error.code === 'ENOENT') return { absolute, missing: true }; throw error; }
  return { absolute, stat, missing: false };
}
function sameEntry(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.mode === after.mode &&
    before.size === after.size && before.mtimeMs === after.mtimeMs;
}

export class Evidence {
  constructor(baseDir, limits) { this.baseDir = baseDir; this.blobs = path.join(baseDir, 'blobs'); this.limits = limits; }
  async capture(root) {
    root = await canonical(root); await mkdirPrivate(this.blobs);
    const names = [...new Set((await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))].sort();
    assert(names.length <= this.limits.maxFiles, 'Workspace exceeds evidence.maxFiles; narrow the working tree or increase the reviewed limit');
    const headResult = await runCommand('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root });
    const head = headResult.code === 0 ? headResult.stdout.trim() : null;
    let total = 0; const entries = [];
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
        if (!await exists(path.join(this.blobs, sha))) await fs.writeFile(path.join(this.blobs, sha), bytes, { flag: 'wx', mode: 0o600 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
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
        const transform = new Transform({ transform(chunk, _encoding, done) {
          actual += chunk.length;
          if (actual > remaining) { done(new Error('Workspace exceeds evidence.maxTotalBytes while reading')); return; }
          hash.update(chunk); done(null, chunk);
        } });
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
  async saveSnapshot(snapshot) {
    const file = path.join(this.baseDir, 'snapshots', `${snapshot.hash}.json`);
    if (!await exists(file)) await atomicJSON(file, snapshot);
    return file;
  }
  async checkpoint(taskId, reportId, base, current, verification = []) {
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
        const result = await runCommand('git', ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', path.join(this.blobs, a.sha), path.join(this.blobs, b.sha)], { cwd: current.root, maxBytes: 256000 });
        assert(result.code === 0 || result.code === 1, `Could not create immutable diff for ${name}`);
        patch += result.stdout; patchTruncated ||= result.truncated;
      } else patch += `before: ${a?.sha || 'none'}\nafter: ${b?.sha || 'none'}\nUse pair_inspect(file) for immutable contents; deletions and symlinks are not followed.\n`;
      if (patch.length > 1024 * 1024) { patch = patch.slice(0, 1024 * 1024); patchTruncated = true; break; }
    }
    const manifest = { version: 1, taskId, reportId, baseHash: base.hash, checkpointHash: current.hash, root: current.root, changed, changedBytes, files: changed.map(name => ({ path: name, before: old.get(name) || null, after: next.get(name) || null })), snapshot: current, verification, patchTruncated, createdAt: Date.now() };
    await fs.writeFile(path.join(dir, 'diff.patch'), patch, { mode: 0o600 });
    await atomicJSON(path.join(dir, 'manifest.json'), manifest);
    return { path: dir, checkpointHash: current.hash, changed, verification, patchTruncated };
  }
  async inspect(artifact, file) {
    assert(inside(this.baseDir, artifact), 'Artifact outside Pair storage');
    const manifest = await readJSON(path.join(artifact, 'manifest.json'), undefined, 64 * 1024 * 1024);
    if (file !== undefined) {
      const entry = manifest.files.find(e => e.path === file); assert(entry, 'Path is not in this checkpoint');
      const after = entry.after;
      if (!after?.sha) return { file, deleted: true, checkpointHash: manifest.checkpointHash };
      const content = await fs.readFile(path.join(this.blobs, after.sha));
      assert(createHash('sha256').update(content).digest('hex') === after.sha, 'Immutable evidence blob failed its hash check');
      const binary = content.subarray(0, 8192).includes(0);
      return { file, kind: after.kind, sha: after.sha, checkpointHash: manifest.checkpointHash, binary, bytes: content.length, content: binary ? null : bounded(content.toString('utf8'), 60000), truncated: content.length > 60000 };
    }
    return { checkpointHash: manifest.checkpointHash, baseHash: manifest.baseHash, changed: manifest.changed, verification: manifest.verification, patchTruncated: manifest.patchTruncated, patch: bounded(await fs.readFile(path.join(artifact, 'diff.patch'), 'utf8'), 60000), localArtifact: artifact };
  }
}
export async function verifyConfigured(config, cwd, artifactDir, signal) {
  await mkdirPrivate(artifactDir); const results = [];
  for (const [i, check] of config.commands.entries()) {
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

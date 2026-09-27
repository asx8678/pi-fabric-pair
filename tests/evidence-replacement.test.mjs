import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Evidence } from '../src/evidence.js';

const LIMITS = { maxFiles: 1000, maxTotalBytes: 16 * 1024 * 1024, maxArtifactBytes: 8 * 1024 * 1024 };
const MISSING = { kind: 'missing', sha: null, size: 0, executable: false };

async function fixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-evidence-replacement-test-'));
  await fs.mkdir(path.join(base, 'repo'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Pair Test'], { cwd: repo });
  return { base, repo, evidence: new Evidence(path.join(base, 'state'), LIMITS) };
}

function track(repo, name) {
  execFileSync('git', ['add', '--', name], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', `add ${name}`], { cwd: repo });
}

const byPath = snapshot => new Map(snapshot.entries.map(entry => [entry.path, entry]));

test('unstaged file-to-directory replacement checkpoints the removal and the new descendants', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    const original = 'export const mod = 1;\n// former ordinary file\n';
    await fs.writeFile(path.join(repo, 'module'), original);
    track(repo, 'module');
    const baseSnap = await evidence.capture(repo);
    await evidence.saveSnapshot(baseSnap);

    // Replace the tracked file with a directory without ever staging it.
    await fs.rm(path.join(repo, 'module'));
    await fs.mkdir(path.join(repo, 'module'));
    await fs.writeFile(path.join(repo, 'module', 'index.js'), 'export const v = 2;\n');
    await fs.writeFile(path.join(repo, 'module', 'spaced name.js'), 'export const s = 3;\n');

    const current = await evidence.capture(repo);
    const entries = byPath(current);
    assert.deepEqual(entries.get('module'), { path: 'module', ...MISSING }, 'the former file path is retained as missing');
    assert.equal(entries.get('module/index.js').kind, 'file', 'the new descendant is captured from Git enumeration');
    assert.equal(entries.get('module/spaced name.js').kind, 'file', 'filenames with spaces survive NUL-delimited parsing');

    const checkpoint = await evidence.checkpoint('task-r1', 'report-r1', baseSnap, current);
    assert.deepEqual(checkpoint.changed, ['module', 'module/index.js', 'module/spaced name.js']);
    const summary = await evidence.inspect(checkpoint.path);
    assert.ok(summary.changed.includes('module'), 'the summary lists the removed former file');

    const removed = await evidence.inspect(checkpoint.path, 'module');
    assert.equal(removed.deleted, true);
    assert.equal(removed.kind, 'file');
    assert.equal(removed.content, original, 'the removed before-image is served immutably');
    const added = await evidence.inspect(checkpoint.path, 'module/index.js');
    assert.equal(added.deleted, undefined);
    assert.equal(added.content, 'export const v = 2;\n', 'the new descendant content is served');
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('unstaged directory-to-file replacement checkpoints removed descendants and the new file', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    const original = 'export const old = 1;\n';
    await fs.mkdir(path.join(repo, 'mod'));
    await fs.writeFile(path.join(repo, 'mod', 'index.js'), original);
    track(repo, 'mod/index.js');
    const baseSnap = await evidence.capture(repo);
    await evidence.saveSnapshot(baseSnap);

    // Replace the tracked directory with a regular file without ever staging it.
    await fs.rm(path.join(repo, 'mod'), { recursive: true });
    await fs.writeFile(path.join(repo, 'mod'), 'export const replacement = 2;\n');

    const current = await evidence.capture(repo);
    const entries = byPath(current);
    assert.deepEqual(entries.get('mod/index.js'), { path: 'mod/index.js', ...MISSING }, 'the removed descendant obstructed by the new file is missing');
    assert.equal(entries.get('mod').kind, 'file', 'the replacing file is captured as an untracked other');

    const checkpoint = await evidence.checkpoint('task-r2', 'report-r2', baseSnap, current);
    assert.deepEqual(checkpoint.changed, ['mod', 'mod/index.js']);
    const removed = await evidence.inspect(checkpoint.path, 'mod/index.js');
    assert.equal(removed.deleted, true);
    assert.equal(removed.content, original, 'the deleted descendant is served from its immutable before-image');
    const added = await evidence.inspect(checkpoint.path, 'mod');
    assert.equal(added.deleted, undefined);
    assert.equal(added.content, 'export const replacement = 2;\n', 'the new file content is served');
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('indexed gitlink submodule directories still fail explicitly', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    await fs.writeFile(path.join(repo, 'root.txt'), 'root\n');
    track(repo, 'root.txt');
    const nested = path.join(repo, 'nested');
    await fs.mkdir(nested);
    execFileSync('git', ['init', '-q'], { cwd: nested });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: nested });
    execFileSync('git', ['config', 'user.name', 'Pair Test'], { cwd: nested });
    await fs.writeFile(path.join(nested, 'inner.txt'), 'inner\n');
    execFileSync('git', ['add', '--', 'inner.txt'], { cwd: nested });
    execFileSync('git', ['commit', '-q', '-m', 'nested'], { cwd: nested });
    // An embedded repository with a commit becomes an index gitlink (mode 160000).
    execFileSync('git', ['add', '--', 'nested'], { cwd: repo });
    await assert.rejects(() => evidence.capture(repo), /Git submodule\/directory nested requires its own Pair workspace/);
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('untracked nested Git repository directories still fail explicitly', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    await fs.writeFile(path.join(repo, 'root.txt'), 'root\n');
    track(repo, 'root.txt');
    const nested = path.join(repo, 'nested2');
    await fs.mkdir(nested);
    execFileSync('git', ['init', '-q'], { cwd: nested });
    await fs.writeFile(path.join(nested, 'inner.txt'), 'inner\n');
    // Git reports an untracked embedded repository as the directory name itself.
    await assert.rejects(() => evidence.capture(repo), /Git submodule\/directory nested2\/ requires its own Pair workspace/);
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('a tracked file replaced by a nested Git repository fails closed even though Git lists only the tracked path', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    const p = path.join(repo, 'p');
    await fs.writeFile(p, 'former ordinary file\n');
    execFileSync('git', ['add', '--', 'p'], { cwd: repo });
    await fs.rm(p);
    await fs.mkdir(p);
    execFileSync('git', ['init', '-q'], { cwd: p });
    await fs.writeFile(path.join(p, 'inner.js'), 'inner\n');
    // Lock the premise of this regression: the combined enumeration really
    // returns only the tracked path — no directory name, no descendants —
    // so only the live directory classification can catch the repository.
    const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repo }).toString('utf8');
    assert.equal(listed, 'p\0', 'Git lists only the tracked path, not the nested repository');
    await assert.rejects(() => evidence.capture(repo), /Git submodule\/directory p requires its own Pair workspace/);
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('a tracked file replaced by a directory carrying gitfile worktree metadata fails closed', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    const p = path.join(repo, 'p');
    await fs.writeFile(p, 'former ordinary file\n');
    execFileSync('git', ['add', '--', 'p'], { cwd: repo });
    await fs.rm(p);
    await fs.mkdir(p);
    await fs.writeFile(path.join(p, 'index.js'), 'plain\n');
    // Linked-worktree/submodule-style metadata: a regular .git gitfile. It is
    // detected by marker presence without following the gitdir reference.
    await fs.writeFile(path.join(p, '.git'), 'gitdir: /elsewhere/worktree\n');
    await assert.rejects(() => evidence.capture(repo), /Git submodule\/directory p requires its own Pair workspace/);
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('symlink ancestors are still rejected fail-closed', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    await fs.mkdir(path.join(repo, 'a'));
    await fs.writeFile(path.join(repo, 'a', 'b.txt'), 'b\n');
    track(repo, 'a/b.txt');
    const outside = path.join(base, 'outside');
    await fs.mkdir(outside);
    await fs.rm(path.join(repo, 'a'), { recursive: true });
    await fs.symlink(outside, path.join(repo, 'a'));
    await assert.rejects(() => evidence.capture(repo), /Unsafe symlink or non-directory ancestor in evidence path: a\/b\.txt/);
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('index parsing tolerates multiple merge stages, odd filenames and a replaced conflicted path', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    const weird = 'sp ace\tname';
    const newline = 'new\nline';
    await fs.writeFile(path.join(repo, weird), 'weird\n');
    await fs.writeFile(path.join(repo, newline), 'newline\n');
    await fs.writeFile(path.join(repo, 'f'), 'one\n');
    execFileSync('git', ['add', '--', weird, newline, 'f'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'weird names'], { cwd: repo });
    execFileSync('git', ['checkout', '-qb', 'other'], { cwd: repo });
    await fs.writeFile(path.join(repo, 'f'), 'two\n');
    execFileSync('git', ['commit', '-qam', 'two'], { cwd: repo });
    execFileSync('git', ['checkout', '-q', '-'], { cwd: repo });
    await fs.writeFile(path.join(repo, 'f'), 'three\n');
    execFileSync('git', ['commit', '-qam', 'three'], { cwd: repo });
    try { execFileSync('git', ['merge', 'other'], { cwd: repo, stdio: 'ignore' }); } catch { /* conflict leaves stages 1-3 in the index */ }

    // The conflicted path is an ordinary file in every stage; replace it with a
    // directory without staging, exactly like an ordinary unstaged replacement.
    await fs.rm(path.join(repo, 'f'));
    await fs.mkdir(path.join(repo, 'f'));
    await fs.writeFile(path.join(repo, 'f', 'g.txt'), 'g\n');

    const current = await evidence.capture(repo);
    const entries = byPath(current);
    assert.deepEqual(entries.get('f'), { path: 'f', ...MISSING }, 'the multi-stage path replaced by a directory is missing, not a submodule');
    assert.equal(entries.get('f/g.txt').kind, 'file');
    assert.equal(entries.get(weird).kind, 'file', 'tab-containing names are captured');
    assert.equal(entries.get(newline).kind, 'file', 'newline-containing names are captured');
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

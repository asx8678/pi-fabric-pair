import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Evidence } from '../src/evidence.js';

const LIMITS = { maxFiles: 1000, maxTotalBytes: 16 * 1024 * 1024, maxArtifactBytes: 8 * 1024 * 1024 };

async function fixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-evidence-test-'));
  const repo = await fs.realpath(path.join(base, 'repo'));
  await fs.mkdir(repo, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Pair Test'], { cwd: repo });
  return { base, repo, evidence: new Evidence(path.join(base, 'state'), LIMITS) };
}

function track(repo, name) {
  execFileSync('git', ['add', '--', name], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', `add ${name}`], { cwd: repo });
}

test('deleted tracked source is visible through immutable checkpoint evidence', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    const original = 'export const guard = 1;\n// removed logic\n';
    await fs.writeFile(path.join(repo, 'guard.js'), original);
    track(repo, 'guard.js');
    const baseSnap = await evidence.capture(repo);
    await evidence.saveSnapshot(baseSnap);
    await fs.rm(path.join(repo, 'guard.js'));
    const current = await evidence.capture(repo);
    const checkpoint = await evidence.checkpoint('task-1', 'report-1', baseSnap, current);

    assert.deepEqual(checkpoint.changed, ['guard.js'], 'deletion must be a changed path');
    const summary = await evidence.inspect(checkpoint.path);
    assert.ok(summary.changed.includes('guard.js'), 'summary must list the deleted path');
    assert.match(summary.patch, /-export const guard = 1;/, 'deletion diff must show removed source');
    assert.match(summary.patch, /-\/\/ removed logic/, 'deletion diff must retain all removed lines');

    const file = await evidence.inspect(checkpoint.path, 'guard.js');
    assert.equal(file.deleted, true, 'deleted path must be marked deleted');
    assert.equal(file.kind, 'file');
    assert.equal(file.binary, false);
    assert.equal(file.content, original, 'removed source must be recoverable byte for byte');
    assert.equal(file.sha, baseSnap.entries.find(entry => entry.path === 'guard.js').sha);
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('modified-file inspection still serves the new after-image', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    await fs.writeFile(path.join(repo, 'mod.js'), 'export const v = 1;\n');
    track(repo, 'mod.js');
    const baseSnap = await evidence.capture(repo);
    await evidence.saveSnapshot(baseSnap);
    await fs.writeFile(path.join(repo, 'mod.js'), 'export const v = 2;\n');
    const current = await evidence.capture(repo);
    const checkpoint = await evidence.checkpoint('task-2', 'report-2', baseSnap, current);
    const file = await evidence.inspect(checkpoint.path, 'mod.js');
    assert.equal(file.deleted, undefined, 'an existing file must not be marked deleted');
    assert.equal(file.kind, 'file');
    assert.equal(file.content, 'export const v = 2;\n', 'modified inspection must serve the after-image');
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('deleted binary and oversized files remain bounded and flagged', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    const binary = Buffer.concat([Buffer.from([0x00, 0x01, 0x02]), Buffer.from('data')]);
    await fs.writeFile(path.join(repo, 'blob.bin'), binary);
    await fs.writeFile(path.join(repo, 'big.txt'), 'x'.repeat(70000));
    track(repo, 'blob.bin');
    track(repo, 'big.txt');
    const baseSnap = await evidence.capture(repo);
    await evidence.saveSnapshot(baseSnap);
    await fs.rm(path.join(repo, 'blob.bin'));
    await fs.rm(path.join(repo, 'big.txt'));
    const current = await evidence.capture(repo);
    const checkpoint = await evidence.checkpoint('task-3', 'report-3', baseSnap, current);

    const bin = await evidence.inspect(checkpoint.path, 'blob.bin');
    assert.equal(bin.deleted, true);
    assert.equal(bin.binary, true, 'NUL-containing deletion must be flagged binary');
    assert.equal(bin.content, null, 'binary deletion must not return text payload');
    assert.equal(bin.bytes, binary.length);

    const big = await evidence.inspect(checkpoint.path, 'big.txt');
    assert.equal(big.deleted, true);
    assert.equal(big.binary, false);
    assert.equal(big.truncated, true, 'oversized deletion must report truncation');
    assert.ok(big.content.length <= 60000, 'oversized deletion content must stay bounded');
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('deleted symlink exposes the stored target text without following it', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    await fs.writeFile(path.join(repo, 'secret.txt'), 'TOP SECRET CONTENT\n');
    track(repo, 'secret.txt');
    await fs.symlink('secret.txt', path.join(repo, 'link.txt'));
    track(repo, 'link.txt');
    const baseSnap = await evidence.capture(repo);
    await evidence.saveSnapshot(baseSnap);
    await fs.rm(path.join(repo, 'link.txt'));
    const current = await evidence.capture(repo);
    const checkpoint = await evidence.checkpoint('task-4', 'report-4', baseSnap, current);

    const link = await evidence.inspect(checkpoint.path, 'link.txt');
    assert.equal(link.deleted, true);
    assert.equal(link.kind, 'symlink');
    assert.equal(link.content, 'secret.txt', 'only the link target is stored');
    assert.ok(!String(link.content).includes('TOP SECRET'), 'inspection must not follow the target');
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('deleted before-image hash and size are re-verified', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    await fs.writeFile(path.join(repo, 'guard.js'), 'export const guard = 1;\n');
    track(repo, 'guard.js');
    const baseSnap = await evidence.capture(repo);
    await evidence.saveSnapshot(baseSnap);
    await fs.rm(path.join(repo, 'guard.js'));
    const current = await evidence.capture(repo);
    const checkpoint = await evidence.checkpoint('task-5', 'report-5', baseSnap, current);

    const before = baseSnap.entries.find(entry => entry.path === 'guard.js');
    const blob = path.join(evidence.blobs, before.sha);
    await fs.writeFile(blob, 'export const guard = 9;\n');
    await assert.rejects(() => evidence.inspect(checkpoint.path, 'guard.js'), /hash check/);
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

test('deleted before-image is bound to the saved base snapshot', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    await fs.writeFile(path.join(repo, 'guard.js'), 'export const guard = 1;\n');
    track(repo, 'guard.js');
    const baseSnap = await evidence.capture(repo);
    const baseRef = await evidence.saveSnapshot(baseSnap);
    await fs.rm(path.join(repo, 'guard.js'));
    const current = await evidence.capture(repo);
    const checkpoint = await evidence.checkpoint('task-6', 'report-6', baseSnap, current);

    const manifestPath = path.join(checkpoint.path, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.files.find(entry => entry.path === 'guard.js').before = null;
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(() => evidence.inspect(checkpoint.path, 'guard.js'), /before-image differs from its base snapshot/);

    await fs.rm(baseRef);
    await assert.rejects(() => evidence.inspect(checkpoint.path, 'guard.js'), 'missing base snapshot must fail closed');
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
});

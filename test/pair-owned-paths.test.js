
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Evidence, pairOwned, snapshotDelta } from '../src/evidence.js';
import { currentWorkspace } from '../src/controller.js';
import { writtenPaths, writesOnlyPairConfig } from '../src/main.js';
import { configPaths } from '../src/config.js';

const LIMITS = { maxFiles: 1000, maxTotalBytes: 16 * 1024 * 1024, maxArtifactBytes: 8 * 1024 * 1024 };

async function fixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-owned-paths-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true });
  const repo = await fs.realpath(path.join(base, 'repo'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Pair Test'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'app.js'), 'export const v = 1;\n');
  execFileSync('git', ['add', '--', 'app.js'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: repo });
  return { base, repo, evidence: new Evidence(path.join(base, 'state'), LIMITS) };
}

test('Pair\'s own configuration is not worker evidence', () => {
  for (const name of ['.pi/fabric-pair.json', '.pi/pair.json', '.pi/fabric-pair.json.v1.bak', '.pi/fabric-pair.json.v1.bak.3',
    '.pi/pair.json.v2.bak', '.pi/fabric-pair-ui.json', '.pi/fabric-pair-notes.json'])
    assert.equal(pairOwned(name), true, `${name} belongs to Pair`);
  // Anchored to the repository root: a nested directory's .pi is the worker's, so nothing can hide there.
  for (const name of ['src/app.js', '.pi/fabric.json', '.pi/settings.json', 'fabric-pair.json', 'docs/.pi/fabric-pair.json.md', 'src/pair.json',
    'nested/.pi/fabric-pair.json', 'nested/.pi/pair.json', 'a/b/.pi/fabric-pair.json.v1.bak', '.pi/fabric-pair/x.json'])
    assert.equal(pairOwned(name), false, `${name} is worker evidence`);
});

test('a review frozen before the exclusion still approves after a settings edit', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    // The old behaviour: the config file was listed by Git, so capture included it.
    await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({ version: 2 }));
    await fs.writeFile(path.join(repo, 'step.js'), 'export const step = 1;\n');
    const baseSnap = await evidence.capture(repo); await evidence.saveSnapshot(baseSnap);
    await fs.writeFile(path.join(repo, 'step.js'), 'export const step = 2;\n');
    const withConfig = await evidence.capture(repo);
    assert.equal(withConfig.entries.some(entry => entry.path === '.pi/fabric-pair.json'), false, 'a fresh capture already excludes Pair\'s file');
    // Freeze the report the way older code did: a snapshot that still lists the config file.
    const legacySnapshot = structuredClone(withConfig);
    const bytes = await fs.readFile(path.join(repo, '.pi', 'fabric-pair.json'));
    const configEntry = { path: '.pi/fabric-pair.json', kind: /** @type {const} */ ('file'), sha: (await import('../src/util.js')).digest(bytes.toString('utf8')), size: bytes.length, executable: false };
    legacySnapshot.entries = [...legacySnapshot.entries, configEntry].sort((a, b) => a.path.localeCompare(b.path));
    legacySnapshot.totalBytes += bytes.length;
    // The report's hash must verify as a real snapshot identity; recompute it the way capture does.
    legacySnapshot.hash = (await import('../src/util.js')).digest({ root: legacySnapshot.root, head: legacySnapshot.head, entries: legacySnapshot.entries });
    const checkpoint = await evidence.checkpoint('task-old', 'report-old', baseSnap, legacySnapshot);
    // The human edits Pair settings while the report waits for approval.
    await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({ version: 2, mainSupervision: true }));
    const live = await evidence.capture(repo);
    assert.notEqual(live.hash, checkpoint.checkpointHash, 'the hashes differ, because the old report listed the config file');
    const report = { checkpoint: { checkpointHash: checkpoint.checkpointHash, changed: checkpoint.changed }, snapshotRef: path.join(base, 'state', 'snapshots', `${legacySnapshot.hash}.json`) };
    assert.equal(await currentWorkspace(live, { ...report, snapshot: legacySnapshot }), true, 'the report is still current: nothing but Pair\'s own file differs');
    // Changing real source still makes it stale.
    await fs.writeFile(path.join(repo, 'step.js'), 'export const step = 3;\n');
    const drifted = await evidence.capture(repo);
    assert.equal(await currentWorkspace(drifted, { ...report, snapshot: legacySnapshot }), false, 'a real source change is still stale');
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('Pair\'s configuration never appears in a checkpoint or its changed list', async () => {
  const { base, repo, evidence } = await fixture();
  try {
    const before = await evidence.capture(repo); await evidence.saveSnapshot(before);
    await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json'), JSON.stringify({ version: 2, mainSupervision: true }));
    await fs.writeFile(path.join(repo, '.pi', 'fabric-pair.json.v1.bak'), '{"version":2}');
    await fs.writeFile(path.join(repo, '.pi', 'pair.json.v2.bak.2'), '{"version":2}');
    await fs.writeFile(path.join(repo, 'real.js'), 'export const added = 1;\n');
    const after = await evidence.capture(repo);
    assert.deepEqual(snapshotDelta(before, after), ['real.js'], 'only the real file is a change');
    const checkpoint = await evidence.checkpoint('task-new', 'report-new', before, after);
    assert.deepEqual(checkpoint.changed, ['real.js'], 'the checkpoint lists only the real file');
    assert.equal(after.entries.some(entry => pairOwned(entry.path)), false, 'no Pair-owned path is captured at all');
    // A tracked Pair config (someone committed one) is excluded just the same.
    execFileSync('git', ['add', '-f', '--', '.pi/fabric-pair.json'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'track the config'], { cwd: repo });
    const tracked = await evidence.capture(repo);
    assert.equal(tracked.entries.some(entry => entry.path === '.pi/fabric-pair.json'), false, 'a tracked Pair config is still excluded');
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('Main may edit Pair\'s own config during a task, and nothing else', () => {
  const cwd = '/tmp/pair-gate-repo';
  const files = configPaths(cwd, { PI_CODING_AGENT_DIR: '/tmp/pair-gate-agent' });
  const project = path.relative(cwd, files.project), legacy = path.relative(cwd, files.legacyProject);
  // Allowed: exactly the project config, its legacy name, and other Pair-owned .pi files, by relative or absolute path.
  for (const input of [{ path: project }, { file_path: project }, { path: files.project }, { path: legacy }, { path: '.pi/fabric-pair.json.v2.bak' }, { files: [{ path: project }] }])
    assert.equal(writesOnlyPairConfig('edit', input, cwd), true, `${JSON.stringify(input)} is Pair's own config`);
  // Blocked: anything else, a mixed batch, nothing recognisable, and non-mutating tools.
  for (const input of [{ path: 'src/app.js' }, { path: '.pi/fabric-pair.json.md' }, { path: 'fabric-pair.json' }, { files: [{ path: project }, { path: 'src/app.js' }] }, {}, { path: '' }, { path: null }])
    assert.equal(writesOnlyPairConfig('write', input, cwd), false, `${JSON.stringify(input)} stays blocked`);
  // Blocked: anything outside this workspace, including another repository's Pair config.
  for (const input of [{ path: '../other/.pi/fabric-pair.json' }, { path: '../../tmp/.pi/pair.json' }, { path: '/tmp/pair-gate-agent/fabric-pair.json' },
    { files: [{ path: project }, { path: '../other/.pi/fabric-pair.json' }] }])
    assert.equal(writesOnlyPairConfig('write', input, cwd), false, `${JSON.stringify(input)} is outside the workspace`);
  // A nested .pi directory is the worker's file, not Pair's, so the gate blocks it too.
  assert.equal(writesOnlyPairConfig('edit', { path: 'nested/.pi/fabric-pair.json' }, cwd), false, 'a nested .pi is not Pair');
  // The workspace itself is not a file Pair may write, and '..' segments that stay inside are fine.
  assert.equal(writesOnlyPairConfig('edit', { path: '.' }, cwd), false, 'the workspace root is not a config file');
  assert.equal(writesOnlyPairConfig('edit', { path: 'sub/../.pi/fabric-pair.json' }, cwd), true, 'a path that normalizes inside is still Pair\'s');
  assert.equal(writesOnlyPairConfig('read', { path: project }, cwd), false, 'a read is not a mutation');
  assert.equal(writesOnlyPairConfig('edit', { path: project }, undefined), false, 'an unknown workspace blocks');
  assert.deepEqual(writtenPaths({ files: ['a', { path: 'b' }, { file_path: 'c' }] }), ['a', 'b', 'c']);
  assert.deepEqual(writtenPaths(null), []);
});

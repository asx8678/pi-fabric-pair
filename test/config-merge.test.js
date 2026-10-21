
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { changedLayer, configForScope, configPaths, layerChangedExternally, loadConfig, readScopeLayer, saveConfig, validateConfig } from '../src/config.js';

/** A temp agent dir + git repo, so nothing here touches the real ~/.pi or this checkout. */
async function fixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-config-merge-'));
  await fs.mkdir(path.join(base, 'repo', '.pi'), { recursive: true }); await fs.mkdir(path.join(base, 'agent'));
  const cwd = await fs.realpath(path.join(base, 'repo')), home = path.join(base, 'agent');
  execFileSync('git', ['init', '-q'], { cwd });
  const env = { ...process.env, PI_CODING_AGENT_DIR: home };
  return { base, cwd, home, env, files: configPaths(cwd, env) };
}
const project = (extra = {}) => ({ version: 2, enabled: true, autoStart: false, workers: [{ id: 'worker', provider: 'fixture', model: 'fixture-model', effort: 'medium', cwd: null, readOnly: false }], ...extra });

test('a save writes only the fields this edit changed onto the layer on disk', async () => {
  const { base, cwd, env, files } = await fixture();
  try {
    await fs.writeFile(files.project, JSON.stringify(project({ mainSupervision: true, maxMainRecoveries: 5, limits: { maxReportsPerTask: 12 } })));
    // What the screen loaded: the session's own copy, from before somebody edited the file.
    const loaded = await loadConfig(cwd, true, env);
    const before = configForScope(loaded, 'project');
    assert.equal(before.mainSupervision, true);
    // Somebody else now sets a key this screen never touched, and changes another one.
    await fs.writeFile(files.project, JSON.stringify(project({ mainSupervision: true, maxMainRecoveries: 5, limits: { maxReportsPerTask: 12 }, attentionCue: false, enabled: false })));
    // The human flips only the review policy in the screen.
    const after = { ...before, supervision: { ...before.supervision, mode: /** @type {const} */ ('every-step') } };
    const fresh = await readScopeLayer(cwd, 'project', true, env);
    assert.equal(layerChangedExternally(fresh, loaded.layers.project), true, 'the save can tell the file changed underneath it');
    const layer = changedLayer(fresh, before, after);
    assert.ok(layer, 'the edit produced a layer');
    await saveConfig(files.project, layer, { layer: true });
    const written = JSON.parse(await fs.readFile(files.project, 'utf8'));
    assert.deepEqual(written.supervision, { mode: 'every-step' }, 'the edited field is written');
    assert.equal(written.mainSupervision, true, 'a key written to the file after load survives');
    assert.equal(written.maxRecoveries ?? written.maxMainRecoveries, 5, 'and so does another one');
    assert.deepEqual(written.limits, { maxReportsPerTask: 12 }, 'a nested object the edit did not touch survives intact');
    assert.equal(written.attentionCue, false, 'an unrelated external change survives too');
    assert.equal(written.enabled, false, 'including one this screen never showed a change for');
    assert.ok(Array.isArray(written.workers) && written.workers.length === 1, 'the untouched worker list is still there');
    const merged = await loadConfig(cwd, true, env);
    assert.equal(configForScope(merged, 'project').mainSupervision, true, 'the reloaded config carries the preserved key');
    assert.equal(configForScope(merged, 'project').supervision.mode, 'every-step');
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('an external change to the very field being edited takes the user\'s value, and the rest is kept', async () => {
  const { base, cwd, env, files } = await fixture();
  try {
    await fs.writeFile(files.project, JSON.stringify(project({ maxMainRecoveries: 3, mainSupervision: true })));
    const loaded = await loadConfig(cwd, true, env), before = configForScope(loaded, 'project');
    assert.equal(before.maxMainRecoveries, 3, 'the screen shows 3');
    // Meanwhile the file was changed to 9 for that same field, and gained a key this screen never showed.
    await fs.writeFile(files.project, JSON.stringify(project({ maxMainRecoveries: 9, mainSupervision: true, autoCheckIdle: false })));
    const fresh = await readScopeLayer(cwd, 'project', true, env);
    assert.equal(configForScope(await loadConfig(cwd, true, env), 'project').maxMainRecoveries, 9, 'the file says 9');
    const after = { ...before, maxMainRecoveries: 5 };
    await saveConfig(files.project, changedLayer(fresh, before, after) ?? fresh, { layer: true });
    const written = JSON.parse(await fs.readFile(files.project, 'utf8'));
    assert.equal(written.maxMainRecoveries, 5, 'the value the human typed wins over the external one');
    assert.equal(written.mainSupervision, true, 'and the neighbour the screen already had is still there');
    assert.equal(written.autoCheckIdle, false, 'as is one only the external writer knew about');
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('an unreadable or invalid file refuses the save and is left byte for byte untouched', async () => {
  const { base, cwd, env, files } = await fixture();
  try {
    const loaded = await loadConfig(cwd, true, env), before = configForScope(loaded, 'project');
    for (const bytes of ['{not json', JSON.stringify({ version: 2, limits: { maxReportsPerTask: 'many' } })]) {
      await fs.writeFile(files.project, bytes);
      await assert.rejects(() => readScopeLayer(cwd, 'project', true, env), /Pair settings|JSON|maxReportsPerTask/);
      assert.equal(await fs.readFile(files.project, 'utf8'), bytes, 'the file is never rewritten');
    }
    // A refusal never reaches a write at all: there is no layer to save, so the caller's save cannot happen.
    const after = { ...before, mainSupervision: true };
    await assert.rejects(async () => { const fresh = await readScopeLayer(cwd, 'project', true, env); await saveConfig(files.project, changedLayer(fresh, before, after) ?? fresh, { layer: true }); });
    assert.equal(await fs.readFile(files.project, 'utf8'), JSON.stringify({ version: 2, limits: { maxReportsPerTask: 'many' } }));
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('an edit that changes nothing produces no layer, so the file is not rewritten', async () => {
  const { cwd, env, files, base } = await fixture();
  try {
    const loaded = await loadConfig(cwd, true, env), before = configForScope(loaded, 'project');
    const fresh = await readScopeLayer(cwd, 'project', true, env);
    assert.equal(changedLayer(fresh, before, validateConfig(before)), null, 'no difference, no write');
    assert.equal(layerChangedExternally(fresh, loaded.layers.project), false, 'nothing external happened either');
    assert.deepEqual(fresh, {}, 'and the file still does not exist');
    assert.equal(await fs.stat(files.project).then(() => 'exists', () => 'absent'), 'absent');
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

#!/usr/bin/env node
/** Offline package validation: no npm downloads, credentials, or model requests. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config.js';
const root = fileURLToPath(new URL('../', import.meta.url));
async function walk(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(p)); else files.push(p);
  }
  return files;
}
const sourceFiles = [...await walk(path.join(root, 'src')), ...await walk(path.join(root, 'scripts'))].filter(p => p.endsWith('.js'));
for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  assert.equal(result.status, 0, `Syntax check failed: ${file}`);
}
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.name, 'pi-fabric-pair');
for (const entry of pkg.pi.extensions) {
  await fs.access(path.join(root, entry));
  const module = await import(new URL(entry, new URL('../', import.meta.url)).href);
  assert.equal(typeof module.default, 'function', 'Pi extension must export a default factory');
}
for (const p of pkg.pi.skills) await fs.access(path.join(root, p, 'fabric-pair', 'SKILL.md'));
validateConfig(JSON.parse(await fs.readFile(path.join(root, 'fabric-pair.example.json'), 'utf8')));
for (const name of ['README.md', 'LICENSE', 'docs/COMPATIBILITY.md', 'docs/TESTING.md']) await fs.access(path.join(root, name));
console.log(`Validated ${sourceFiles.length} JavaScript files, package entry, skill, and example configuration.`);
const tests = (await fs.readdir(path.join(root, 'tests')).catch(e => { if (e.code === 'ENOENT') return []; throw e; })).filter(n => n.endsWith('.test.js')).sort().map(n => path.join(root, 'tests', n));
if (tests.length) {
  const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status || (result.error ? 1 : 0);
} else console.log('This installed package omits development tests. Run them from the source ZIP.');

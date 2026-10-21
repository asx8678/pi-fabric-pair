// The docs must describe what shipped: the example config covers every setting, the README names every settings
// page and the tools on it, the skill tells Main how to manage workers, and test/README lists every suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DEFAULTS, validateConfig } from '../src/config.js';

const read = name => fs.readFile(new URL(`../${name}`, import.meta.url), 'utf8');
/** Every leaf path of an object, so a nested field cannot hide behind its section. */
const leaves = (value, prefix = '') => Object.entries(value).flatMap(([key, item]) =>
  item && typeof item === 'object' && !Array.isArray(item) ? leaves(item, `${prefix}${key}.`) : [`${prefix}${key}`]);

test('the example config documents every setting and validates', async () => {
  const example = JSON.parse(await read('fabric-pair.example.json'));
  const documented = leaves(example);
  for (const path of leaves(DEFAULTS)) assert.ok(documented.includes(path), `the example config documents ${path}`);
  for (const path of documented) assert.ok(leaves(DEFAULTS).includes(path), `the example config has no unknown field: ${path}`);
  // A copy of the example is a usable starting point, not just readable: it passes the same validation as a saved file.
  assert.equal(validateConfig(example).version, 2);
});

test('the README names every settings page and the tools that make it quick', async () => {
  const readme = await read('README.md');
  const source = await read('src/settings-screen.js');
  // The page labels come from the screen itself, so adding a page without documenting it fails here.
  const block = /const PAGES = [^[]*\[([\s\S]*?)\n\]\);/.exec(source);
  assert.ok(block, 'PAGES is a literal list of pages');
  const labels = [...block[1].matchAll(/label: '([^']+)'/g)].map(match => match[1]);
  assert.ok(labels.length >= 11, `every page is in the list: ${labels.join(', ')}`);
  for (const label of labels) assert.ok(new RegExp(`\\| ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|`).test(readme), `the README table has a ${label} row`);
  // The four tools this release adds, each named where a reader looks for it.
  assert.match(readme, /\`default\`, \`global\` or \`project\`/, 'provenance is described');
  assert.match(readme, /\`r\` resets the selected row/, 'reset is described');
  assert.match(readme, /\`\/\` filters the rows/, 'the filter is described');
  assert.match(readme, /\*\*Edit as JSON…\*\*/, 'Edit as JSON is described');
  // Saving over a newer file, and Pair's own files staying out of the evidence, are the two rules readers ask about.
  assert.match(readme, /re-reads that scope's layer from disk and applies only the fields your\s+edit changed/, 'the merge-on-save rule is described');
  assert.match(readme, /excluded from every checkpoint/, 'the checkpoint exclusion is described');
});

test('the skill tells Main how to manage workers and what it may edit', async () => {
  const skill = await read('skills/fabric-pair/SKILL.md');
  // One live worker, the default's meaning and the three roster commands: what Main needs to not break the fence.
  assert.match(skill, /## Workers/, 'the skill has a Workers section');
  assert.match(skill, /Pair runs one at a time/);
  assert.match(skill, /\/pair worker default/);
  assert.match(skill, /\/pair worker add/);
  assert.match(skill, /\/pair worker remove/);
  // And the one workspace exception during a task, stated as a permission Main may actually use.
  assert.match(skill, /which you may edit directly/);
});

test('test/README lists every suite that npm test runs', async () => {
  const readme = await read('test/README.md');
  const files = (await fs.readdir(new URL('../test/', import.meta.url))).filter(name => name.endsWith('.test.js'));
  assert.ok(files.length > 30, 'the suites are still there');
  for (const file of files) {
    const name = file.replace(/\.test\.js$/, '');
    assert.ok(readme.includes(`\`${name}\``), `test/README mentions ${name}`);
  }
});

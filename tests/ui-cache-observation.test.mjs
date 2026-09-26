import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleWidth } from '@earendil-works/pi-tui';
import { normalizedUsage } from '../src/metrics.js';
import { indicator, indicatorWidget, statusText, taskListLines } from '../src/ui.js';

const now = 10_000_000;
const plain = { fg: (_color, text) => text };
const colors = { accent: 36, success: 32, warning: 33, error: 31, muted: 90, dim: 2 };
const ansi = { fg: (color, text) => { assert.ok(color in colors); return `\x1b[${colors[color]}m${text}\x1b[0m`; } };
const strip = text => text.replace(/\x1b\[[0-9;]*m/g, '');
const usage = (input, cacheRead, cacheWrite = 0, observedAt = now - 5000) => ({ ...normalizedUsage({ input, cacheRead, cacheWrite, output: 12 }), observedAt });
const worker = (id, lastUsage, status = 'ready') => ({ id, status, model: 'provider/model', effort: 'low', cwd: '/project', observation: { lastUsage } });
const summary = (main, workers = []) => ({ main, workers, ownerSession: 'owner', directory: '/state', cacheNote: 'Cache observations describe past requests. Pair does not guarantee retained provider cache.' });
const cacheRow = (s, theme = plain, at = now) => indicatorWidget(s, false, theme, at).render(1000)[1]?.trim();

for (const [name, observed, expected] of [
  ['zero percent', usage(100, 0), '0.0%'],
  ['fractional share including cache writes', usage(1, 1, 1), '33.3%'],
  ['full cache read', usage(0, 100), '100.0%'],
  ['old observation keeps the same share', usage(10, 10, 0, now - 3_661_000), '50.0%'],
  ['zero timestamp is still an observation', usage(0, 10, 0, 0), '100.0%'],
  ['future timestamp leaves the share unchanged', usage(10, 0, 0, now + 1000), '0.0%']
]) {
  test(`widget and status show last-request ${name} consistently`, () => {
    const s = summary({ lastUsage: observed }, [worker('worker', observed)]);
    assert.equal(cacheRow(s), `Cache read (last): M ${expected} · W ${expected}`);
    const text = statusText(s, null, now);
    assert.ok(text.includes(`Main last observed cache read: ${expected}\n`));
    assert.ok(text.includes(`  Last observed cache read: ${expected}\n`));
    assert.match(text, /cacheRead\/\(input\+cacheRead\+cacheWrite\).*last measured request, not task totals/);
    assert.doesNotMatch(text, /ago|observation age/, 'status carries no age beside the share');
    assert.doesNotMatch(cacheRow(s), /ago/, 'the widget row shows no age timer');
  });
}

for (const [name, observed, diagnostic] of [
  ['null observation', null, 'unknown'],
  ['undefined observation', undefined, 'unknown'],
  ['zero-input observation with null ratio', usage(0, 0), 'unknown']
]) {
  test(`widget omits ${name} without hiding status diagnostics or activity`, () => {
    const s = summary({ lastUsage: observed }, [worker('worker', observed)]);
    assert.deepEqual(indicatorWidget(s, false, plain, now).render(1000), [' M● W● avg — tok/s']);
    assert.equal(cacheRow(s), undefined, 'no cache row or blank spacer');
    const text = statusText(s, null, now);
    assert.ok(text.includes(`Main last observed cache read: ${diagnostic}\n`));
    assert.ok(text.includes(`  Last observed cache read: ${diagnostic}\n`));
  });
}

test('missing usage fields and absent Main/worker observations leave only activity', () => {
  for (const s of [summary({}, [{ ...worker('worker'), observation: {} }]), { workers: [{ id: 'worker', status: 'ready' }] }, summary(null, [{ ...worker('worker'), observation: null }])]) {
    assert.deepEqual(indicatorWidget(s, false, plain, now).render(1000), [' M● W● avg — tok/s']);
  }
});

test('no workers renders only Main activity and its known cache share if present', () => {
  for (const main of [null, undefined, {}, { lastUsage: usage(0, 0) }]) {
    assert.deepEqual(indicatorWidget(summary(main), false, plain, now).render(1000), [' M●']);
  }
  assert.equal(cacheRow(summary({ lastUsage: usage(10, 0) })), 'Cache read (last): M 0.0%');
});

test('idle, review and not-started workers remain ordered and cumulative usage is never substituted', () => {
  const workers = [worker('z-last-alphabetically', usage(10, 0), 'ready'), worker('a-first-alphabetically', usage(0, 10), 'review'), { ...worker('new', null, 'not_started'), observation: null, usage: { requests: 10, reportedCost: 0, unknownCostRequests: 0, cacheRatio: 1 } }];
  const s = summary(null, workers);
  assert.equal(cacheRow(s), 'Cache read (last): W1 0.0% · W2 100.0%');
  const lines = indicatorWidget(s, false, plain, now).render(1000);
  assert.equal(lines.length, 2, 'known cache shares remain visible without a plan');
  assert.match(lines[0], /M● W1● avg — tok\/s ← W2◐ review avg — tok\/s W3○ avg — tok\/s/, 'a waiting worker names what it waits on');
  const text = statusText(s, null, now);
  assert.ok(text.indexOf('z-last-alphabetically:') < text.indexOf('a-first-alphabetically:'));
  assert.ok(text.includes('new: not_started'));
  assert.match(text, /Last observed cache read: unknown\n  Inference only: 10 responses/);
});

test('mixed-known actors keep configured labels and order across gaps and clearing transitions', () => {
  const workers = [worker('first', null), worker('z-second', usage(10, 0)), worker('third', usage(0, 0)), worker('a-fourth', usage(0, 10))];
  const s = summary({ lastUsage: usage(10, 10) }, workers);
  assert.equal(cacheRow(s), 'Cache read (last): M 50.0% · W2 0.0% · W4 100.0%');
  s.main.lastUsage = null;
  workers[3].observation.lastUsage = undefined;
  assert.equal(cacheRow(s), 'Cache read (last): W2 0.0%', 'one remaining worker is not renamed W or W1');
  workers[1].observation.lastUsage = usage(0, 0);
  assert.deepEqual(indicatorWidget(s, false, plain, now).render(1000), [' M● W1● avg — tok/s W2● avg — tok/s W3● avg — tok/s W4● avg — tok/s']);
  s.main.lastUsage = usage(10, 0);
  assert.equal(cacheRow(s), 'Cache read (last): M 0.0%');
  assert.equal(cacheRow(summary(null, [worker('only', usage(0, 10))])), 'Cache read (last): W 100.0%');
});

test('cache row is neutral and ANSI/theme-aware without disturbing activity or task progress', () => {
  const w = { ...worker('worker', usage(100, 0), 'review'), task: { stepList: [{ id: 'one', title: 'Approved', state: 'done' }, { id: 'two', title: 'Review 界', state: 'review' }] } };
  const s = summary({ lastUsage: usage(0, 100) }, [w]);
  for (const mainUsage of [usage(0, 100), null]) {
    s.main.lastUsage = mainUsage;
    const lines = indicatorWidget(s, true, ansi, now).render(1000);
    assert.equal(strip(lines[0]).trim(), indicator(s, true, undefined, now));
    assert.deepEqual(lines.slice(2).map(line => strip(line).trim()), taskListLines(s));
    assert.equal(strip(lines[1]).trim(), cacheRow(s));
    assert.ok(lines[1].includes('\x1b[90m') && lines[1].includes('\x1b[2m'));
    for (const color of [31, 32, 33]) assert.ok(!lines[1].includes(`\x1b[${color}m`), 'cache share is not a severity scale');
  }
});

test('all widget lines fit every supplied width with known, mixed or absent cache data', () => {
  const known = summary({ lastUsage: usage(1, 1) }, Array.from({ length: 8 }, (_, i) => ({ ...worker(`worker-${i}`, usage(1, i), i === 0 ? 'working' : 'ready'), task: i === 0 ? { stepList: [{ title: '界'.repeat(80), state: 'active' }] } : null })));
  const mixed = summary(null, known.workers.map((w, i) => ({ ...w, observation: { lastUsage: i === 1 ? usage(1, 0) : null } })));
  const absent = summary({ lastUsage: usage(0, 0) }, known.workers.map(w => ({ ...w, observation: null })));
  for (const [s, hasCache] of [[known, true], [mixed, true], [absent, false], [summary(null), false]]) {
    const expectedRows = 1 + Number(hasCache) + taskListLines(s).length;
    for (const theme of [plain, ansi]) {
      const widget = indicatorWidget(s, true, theme, now);
      for (const width of [0, 1, 2, 3, 8, 12, 20, 40, 80, 160, 1000]) {
        const lines = widget.render(width);
        assert.equal(lines.length, expectedRows);
        for (const line of lines) assert.ok(visibleWidth(line) <= width, `${visibleWidth(line)} exceeds ${width}: ${JSON.stringify(line)}`);
        if (width === 0) assert.deepEqual(lines, Array(expectedRows).fill(''));
        if (width === 1000) {
          assert.equal(strip(lines[0]).trim(), indicator(s, true, undefined, now));
          assert.deepEqual(lines.slice(1 + Number(hasCache)).map(line => strip(line).trim()), taskListLines(s));
          assert.doesNotMatch(strip(lines.join('\n')), /unknown/);
        }
      }
      widget.invalidate();
    }
  }
});

test('malformed observations fail validation before unknown shares are filtered', () => {
  for (const invalid of [{ ...usage(10, 0), cacheRatio: null }, { ...usage(0, 0), observedAt: undefined }, { ...usage(0, 0), cacheRatio: 0 }, { ...usage(10, 0), cacheRatio: NaN }, { ...usage(0, 10), cacheRatio: 2 }, {}, false, 'unknown']) {
    for (const s of [summary({ lastUsage: invalid }), summary(null, [worker('worker', invalid)]), summary({ lastUsage: usage(0, 10) }, [worker('worker', invalid)])]) {
      assert.throws(() => indicatorWidget(s, false, plain, now), /Last cache-read usage/);
      assert.throws(() => statusText(s, null, now), /Last cache-read usage/);
    }
  }
});

import assert from 'node:assert/strict';

// Models only SDK lease ownership; deliberately no timer, model or provider API.
export function fakeWarming() {
  const leases = new Set();
  const stats = { acquisitions: 0, releases: 0, fail: false };
  return { stats, leases, acquireCacheWarming(mode) {
    assert.equal(mode, 'idle');
    stats.acquisitions++;
    if (stats.fail) throw Error('fake SDK unavailable');
    const lease = {}; leases.add(lease);
    return () => { if (leases.delete(lease)) stats.releases++; };
  } };
}

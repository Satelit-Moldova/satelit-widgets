import test from 'node:test';
import assert from 'node:assert/strict';
import { createProxy, Cache } from '../proxy/node/server.mjs';
import { startMockApi } from './mock-api.mjs';

const KEY = 'sat_live_TESTKEY_never_shown';

async function setup(opts = {}) {
  const api = await startMockApi();
  let clock = Date.parse('2026-11-19T12:00:00Z');
  const logs = [];
  const p = createProxy({ key: KEY, apiBase: api.base, origins: ['https://site.md'], now: () => clock, log: (l) => logs.push(l), ...opts });
  await new Promise((r) => p.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${p.server.address().port}`;
  return {
    api, p, base, logs,
    tick: (s) => { clock += s * 1000; },
    get: (path, headers = {}) => fetch(base + path, { headers }),
    close: async () => { await new Promise((r) => p.server.close(r)); await api.close(); },
  };
}

test('caches, sends the key upstream only, and never back', async () => {
  const t = await setup();
  try {
    const a = await t.get('/rates?lang=ro', { Origin: 'https://site.md' });
    assert.equal(a.status, 200);
    assert.equal(a.headers.get('x-cache'), 'MISS');
    assert.equal(a.headers.get('access-control-allow-origin'), 'https://site.md');
    const text = await a.text();
    assert.ok(text.includes('"EUR"'));
    assert.ok(!text.includes(KEY));
    assert.equal(a.headers.get('x-credits-remaining'), null);
    const b = await t.get('/rates?lang=ro&junk=1');
    assert.equal(b.headers.get('x-cache'), 'HIT');
    assert.equal(t.api.state.calls.length, 1);
    assert.equal(t.api.state.auth[0], `Bearer ${KEY}`);
    t.tick(3 * 3600 + 1);
    const c = await t.get('/rates?lang=ro');
    assert.equal(c.headers.get('x-cache'), 'MISS');
    assert.equal(t.api.state.calls.length, 2);
    const h = await (await t.get('/healthz')).json();
    assert.equal(h.credits_remaining, 1000);
    assert.ok(!JSON.stringify(h).includes(KEY));
  } finally { await t.close(); }
});

test('concurrent misses share one upstream call', async () => {
  const t = await setup();
  t.api.state.delayMs = 100;
  try {
    const all = await Promise.all(Array.from({ length: 8 }, () => t.get('/movies/cinemas/today?country=MD')));
    assert.ok(all.every((r) => r.status === 200));
    assert.equal(t.api.state.calls.length, 1);
  } finally { await t.close(); }
});

test('refuses foreign origins, unknown routes and bad values without calling the API', async () => {
  const t = await setup();
  try {
    assert.equal((await t.get('/rates', { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await t.get('/me')).status, 404);
    assert.equal((await t.get('/movies/titles/m603/full')).status, 404);
    assert.equal((await t.get('/news?per=999')).status, 422);
    const pre = await fetch(t.base + '/rates', { method: 'OPTIONS', headers: { Origin: 'https://site.md' } });
    assert.equal(pre.status, 204);
    assert.equal((await fetch(t.base + '/rates', { method: 'POST' })).status, 405);
    assert.equal(t.api.state.calls.length, 0);
  } finally { await t.close(); }
});

test('serves the stale copy when the API fails, 502 when there is none', async () => {
  const t = await setup();
  try {
    await t.get('/fuel');
    t.tick(2 * 3600 + 5);
    t.api.state.fail = true;
    const s = await t.get('/fuel');
    assert.equal(s.status, 200);
    assert.equal(s.headers.get('x-cache'), 'STALE');
    await t.api.close();
    const n = await t.get('/news?per=3');
    assert.ok(n.status === 502 || n.status === 503);
  } finally { await new Promise((r) => t.p.server.close(r)); }
});

test('no key: 503, no upstream call', async () => {
  const t = await setup({ key: '' });
  try {
    assert.equal((await t.get('/rates')).status, 503);
    assert.equal(t.api.state.calls.length, 0);
  } finally { await t.close(); }
});

test('per-IP limit on uncached requests', async () => {
  const t = await setup({ missPerIp: 2 });
  try {
    assert.equal((await t.get('/prices/search?q=lapte')).status, 200);
    assert.equal((await t.get('/prices/search?q=paine')).status, 200);
    const r = await t.get('/prices/search?q=oua');
    assert.equal(r.status, 429);
    assert.equal((await t.get('/prices/search?q=lapte')).headers.get('x-cache'), 'HIT');
  } finally { await t.close(); }
});

test('LRU drops the oldest entry', () => {
  const c = new Cache(2);
  c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3);
  assert.equal(c.get('b'), null);
  assert.equal(c.get('a'), 1);
});

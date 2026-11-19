// The Cloudflare worker, run in Node with a mock fetch and a mock Cache API.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../proxy/cloudflare-worker/src/worker.js';
import { sample } from './mock-api.mjs';

const KEY = 'sat_live_TESTKEY_never_shown';

/** Mimics caches.default: match/put by URL, stores a copy of the body. */
function mockCache() {
  const store = new Map();
  return {
    store,
    async match(req) {
      const e = store.get(req.url);
      return e ? new Response(e.body, { status: e.status, headers: e.headers }) : undefined;
    },
    async put(req, res) {
      store.set(req.url, { body: await res.text(), status: res.status, headers: Object.fromEntries(res.headers) });
    },
  };
}

function mockFetch() {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    if (f.fail) throw new Error('network down');
    const path = new URL(url).pathname.replace(/^\/v1/, '');
    const body = path === '/rates' ? sample('/rates') : path === '/fuel' ? sample('/fuel') : null;
    return body
      ? new Response(JSON.stringify(body), { status: 200 })
      : new Response('{"error":{"code":"not_found"}}', { status: 404 });
  };
  f.calls = calls;
  return f;
}

function setup(env = {}) {
  let clock = Date.parse('2026-11-19T12:00:00Z');
  const deps = { cache: mockCache(), fetch: mockFetch(), now: () => clock };
  const tasks = [];
  const ctx = { waitUntil: (p) => tasks.push(p) };
  const e = { SATELIT_API_KEY: KEY, ALLOWED_ORIGINS: 'https://site.md', ...env };
  const call = async (path, init = {}) => {
    const r = await worker.fetch(new Request('https://proxy.example' + path, init), e, ctx, deps);
    await Promise.all(tasks);
    return r;
  };
  return { deps, call, tick: (s) => { clock += s * 1000; } };
}

test('worker: miss, then hit from the Cache API, key only upstream', async () => {
  const t = setup();
  const a = await t.call('/rates?lang=ro', { headers: { Origin: 'https://site.md' } });
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('x-cache'), 'MISS');
  assert.equal(a.headers.get('access-control-allow-origin'), 'https://site.md');
  const body = await a.text();
  assert.ok(body.includes('Banca Națională a Moldovei'));
  assert.ok(!body.includes(KEY));
  const b = await t.call('/rates?junk=1&lang=ro');
  assert.equal(b.headers.get('x-cache'), 'HIT');
  assert.equal(t.deps.fetch.calls.length, 1);
  assert.equal(t.deps.fetch.calls[0].auth, `Bearer ${KEY}`);
  assert.equal(t.deps.fetch.calls[0].url, 'https://api.satelit.md/v1/rates?lang=ro');
});

test('worker: stale copy when the API is down past the TTL', async () => {
  const t = setup();
  await t.call('/fuel');
  t.tick(2 * 3600 + 10);
  t.deps.fetch.fail = true;
  const s = await t.call('/fuel');
  assert.equal(s.status, 200);
  assert.equal(s.headers.get('x-cache'), 'STALE');
  const none = await t.call('/rates');
  assert.equal(none.status, 502);
});

test('worker: refuses origins, routes and methods without calling the API', async () => {
  const t = setup();
  assert.equal((await t.call('/rates', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await t.call('/me')).status, 404);
  assert.equal((await t.call('/rates?lang=zz')).status, 422);
  assert.equal((await t.call('/rates', { method: 'POST' })).status, 405);
  assert.equal((await t.call('/rates', { method: 'OPTIONS', headers: { Origin: 'https://site.md' } })).status, 204);
  assert.equal(t.deps.fetch.calls.length, 0);
});

test('worker: BASE_PATH and a missing key', async () => {
  const t = setup({ BASE_PATH: '/satelit-proxy' });
  assert.equal((await t.call('/rates')).status, 404);
  assert.equal((await t.call('/satelit-proxy/rates')).status, 200);
  const n = setup({ SATELIT_API_KEY: '' });
  assert.equal((await n.call('/rates')).status, 503);
});

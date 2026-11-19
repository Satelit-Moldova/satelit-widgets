// Satelit widgets proxy as a Cloudflare Worker.
// The key is a secret (wrangler secret put SATELIT_API_KEY), never in wrangler.toml.
// Answers are kept in the Cache API of the data centre that served them.

import { resolve, originAllowed, parseOrigins, NEGATIVE_TTL, STALE_IF_ERROR } from './policy.js';

const API = 'https://api.satelit.md/v1';

function json(status, body, headers) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

function err(status, code, message, headers) { return json(status, { error: { code, message } }, headers); }

/** The cached copy carries when it was stored and its TTL; the Cache API keeps it for TTL + stale window. */
function toCache(status, body, ttl, now) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl + STALE_IF_ERROR}`,
      'X-Stored-At': String(now),
      'X-Ttl': String(ttl),
    },
  });
}

export default {
  async fetch(request, env, ctx, deps = {}) {
    const cache = deps.cache ?? caches.default;
    const doFetch = deps.fetch ?? fetch;
    const now = deps.now ? deps.now() : Date.now();
    const origins = parseOrigins(env.ALLOWED_ORIGINS);
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = { Vary: 'Origin' };
    if (origin && originAllowed(origin, origins)) {
      cors['Access-Control-Allow-Origin'] = origins.includes('*') ? '*' : origin;
      cors['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
      cors['Access-Control-Max-Age'] = '86400';
    }
    let path = url.pathname;
    const base = (env.BASE_PATH || '').replace(/\/+$/, '');
    if (base) {
      if (path !== base && !path.startsWith(base + '/')) return err(404, 'not_found', 'Not found.', cors);
      path = path.slice(base.length) || '/';
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return err(405, 'method_not_allowed', 'GET only.', { ...cors, Allow: 'GET, OPTIONS' });
    if (!originAllowed(origin, origins)) return err(403, 'origin_not_allowed', 'This origin is not allowed.', cors);

    const r = resolve(path, url.searchParams);
    if (!r.ok) return err(r.status, r.code, r.message, cors);
    if (!env.SATELIT_API_KEY) return err(503, 'not_configured', 'The proxy has no API key.', cors);

    // Cache key: the normalized upstream path on this worker's own host, so ?b&a and ?a&b share one copy.
    const cacheKey = new Request(`${url.origin}/__satelit-cache${r.upstream}`);
    const hit = await cache.match(cacheKey);
    let age = Infinity, ttl = 0;
    if (hit) { age = (now - +hit.headers.get('X-Stored-At')) / 1000; ttl = +hit.headers.get('X-Ttl'); }

    const out = async (res, state) => {
      const left = Math.max(0, Math.round(ttl - age));
      const maxAge = state === 'STALE' ? 60 : Math.min(state === 'MISS' ? ttl : left, 300);
      return json(res.status, await res.text(), { ...cors, 'Cache-Control': `public, max-age=${maxAge}`, 'X-Cache': state });
    };
    if (hit && age < ttl) return out(hit, 'HIT');

    try {
      const up = await doFetch(API + r.upstream, {
        headers: { Authorization: `Bearer ${env.SATELIT_API_KEY}`, Accept: 'application/json', 'User-Agent': 'satelit-widgets-worker/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      const body = await up.text();
      JSON.parse(body);
      if (up.status >= 429 && hit && age < ttl + STALE_IF_ERROR) return out(hit, 'STALE');
      if (up.status === 200 || up.status === 404 || up.status === 422) {
        ttl = up.status === 200 ? r.route.ttl : NEGATIVE_TTL;
        const put = cache.put(cacheKey, toCache(up.status, body, ttl, now));
        if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
      } else {
        console.log(`satelit-proxy: ${r.route.name} answered ${up.status}`);
      }
      age = 0;
      return out(new Response(body, { status: up.status }), 'MISS');
    } catch (e) {
      console.log(`satelit-proxy: ${r.route.name} failed: ${e.name === 'TimeoutError' ? 'timeout' : e.message}`);
      if (hit && age < ttl + STALE_IF_ERROR) return out(hit, 'STALE');
      return err(502, 'upstream_unavailable', 'The data API is not reachable right now.', cors);
    }
  },
};

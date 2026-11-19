#!/usr/bin/env node
// Satelit widgets proxy for Node 18+, zero dependencies.
// Holds the API key, lets through only the widgets' GET routes, caches answers, adds CORS.
//
//   SATELIT_API_KEY=sat_live_… ALLOWED_ORIGINS=https://example.md node proxy/node/server.mjs

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolve, originAllowed, parseOrigins, NEGATIVE_TTL, STALE_IF_ERROR } from './policy.mjs';

/** In-memory LRU: a Map keeps insertion order, so the first key is the oldest. */
export class Cache {
  constructor(max = 500) { this.max = max; this.map = new Map(); }
  get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    this.map.delete(key); this.map.set(key, e);
    return e;
  }
  set(key, e) {
    this.map.delete(key); this.map.set(key, e);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  get size() { return this.map.size; }
}

/** Fixed one-minute windows per key (IP): enough to stop a loop of uncached queries. */
export class Limiter {
  constructor(perMinute) { this.per = perMinute; this.win = 0; this.counts = new Map(); }
  take(key, now = Date.now()) {
    const w = Math.floor(now / 60000);
    if (w !== this.win) { this.win = w; this.counts.clear(); }
    const n = (this.counts.get(key) || 0) + 1;
    this.counts.set(key, n);
    return n <= this.per;
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

export function createProxy(opts = {}) {
  const cfg = {
    key: opts.key ?? process.env.SATELIT_API_KEY ?? '',
    apiBase: (opts.apiBase ?? process.env.SATELIT_API_BASE ?? 'https://api.satelit.md/v1').replace(/\/+$/, ''),
    origins: opts.origins ?? parseOrigins(process.env.ALLOWED_ORIGINS),
    basePath: (opts.basePath ?? process.env.BASE_PATH ?? '').replace(/\/+$/, ''),
    staticDir: opts.staticDir ?? process.env.STATIC_DIR ?? '',
    cacheMax: opts.cacheMax ?? (+process.env.CACHE_MAX || 500),
    missPerIp: opts.missPerIp ?? (+process.env.MISS_LIMIT_PER_MIN || 60),
    upstreamPerMin: opts.upstreamPerMin ?? (+process.env.UPSTREAM_LIMIT_PER_MIN || 300),
    timeoutMs: opts.timeoutMs ?? 10000,
    now: opts.now ?? (() => Date.now()),
    log: opts.log ?? ((line) => console.log(line)),
  };
  const cache = new Cache(cfg.cacheMax);
  const inflight = new Map();
  const perIp = new Limiter(cfg.missPerIp);
  const global = new Limiter(cfg.upstreamPerMin);
  const stats = { hits: 0, misses: 0, stale: 0, upstream: 0, errors: 0, credits_remaining: null, credits_limit: null };

  async function upstream(path) {
    stats.upstream++;
    const r = await fetch(cfg.apiBase + path, {
      headers: { Authorization: `Bearer ${cfg.key}`, Accept: 'application/json', 'User-Agent': 'satelit-widgets-proxy/1.0' },
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    const rem = r.headers.get('x-credits-remaining');
    if (rem != null) { stats.credits_remaining = +rem; stats.credits_limit = +r.headers.get('x-credits-limit'); }
    const body = await r.text();
    JSON.parse(body); // a non-JSON answer is a failure, never cached
    return { status: r.status, body };
  }

  /** One upstream call per cache key at a time: concurrent misses wait for the same answer. */
  function fetchOnce(key, path, ttl) {
    if (inflight.has(key)) return inflight.get(key);
    const p = upstream(path).then((res) => {
      const ok = res.status === 200;
      if (ok || res.status === 404 || res.status === 422) {
        cache.set(key, { ...res, storedAt: cfg.now(), ttl: ok ? ttl : NEGATIVE_TTL });
      }
      return res;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  function send(res, status, body, headers) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(body);
  }

  function errorBody(code, message) { return JSON.stringify({ error: { code, message } }); }

  async function serveStatic(req, res, pathname) {
    const root = resolvePath(cfg.staticDir);
    const file = normalize(join(root, decodeURIComponent(pathname === '/' ? '/demo/index.html' : pathname)));
    if (!file.startsWith(root)) return send(res, 404, errorBody('not_found', 'Not found.'));
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch { send(res, 404, errorBody('not_found', 'Not found.')); }
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const origin = req.headers.origin;
    const cors = {};
    if (origin && originAllowed(origin, cfg.origins)) {
      cors['Access-Control-Allow-Origin'] = cfg.origins.includes('*') ? '*' : origin;
      cors['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
      cors['Access-Control-Max-Age'] = '86400';
    }
    cors.Vary = 'Origin';

    if (url.pathname === '/healthz') {
      return send(res, 200, JSON.stringify({ ok: true, key_set: Boolean(cfg.key), cache_entries: cache.size, ...stats }), { 'Cache-Control': 'no-store' });
    }
    let path = url.pathname;
    if (cfg.basePath) {
      if (path !== cfg.basePath && !path.startsWith(cfg.basePath + '/')) {
        if (cfg.staticDir && req.method === 'GET') return serveStatic(req, res, path);
        return send(res, 404, errorBody('not_found', 'Not found.'));
      }
      path = path.slice(cfg.basePath.length) || '/';
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, errorBody('method_not_allowed', 'GET only.'), { ...cors, Allow: 'GET, OPTIONS' });
    if (!originAllowed(origin, cfg.origins)) return send(res, 403, errorBody('origin_not_allowed', 'This origin is not allowed.'), cors);

    const r = resolve(path, url.searchParams);
    if (!r.ok) {
      if (r.status === 404 && cfg.staticDir && !cfg.basePath) return serveStatic(req, res, url.pathname);
      return send(res, r.status, errorBody(r.code, r.message), cors);
    }
    if (!cfg.key) return send(res, 503, errorBody('not_configured', 'The proxy has no API key.'), cors);

    const key = r.upstream;
    const now = cfg.now();
    const hit = cache.get(key);
    const age = hit ? (now - hit.storedAt) / 1000 : Infinity;
    const out = (e, state) => {
      const left = Math.max(0, Math.round(e.ttl - (now - e.storedAt) / 1000));
      const maxAge = state === 'STALE' ? 60 : Math.min(left, 300);
      send(res, e.status, req.method === 'HEAD' ? '' : e.body, { ...cors, 'Cache-Control': `public, max-age=${maxAge}`, 'X-Cache': state });
    };
    if (hit && age < hit.ttl) { stats.hits++; return out(hit, 'HIT'); }

    stats.misses++;
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    if (!inflight.has(key) && (!perIp.take(ip, now) || !global.take('all', now))) {
      if (hit) { stats.stale++; return out(hit, 'STALE'); }
      return send(res, 429, errorBody('rate_limited', 'Too many uncached requests, try again in a minute.'), { ...cors, 'Retry-After': '60' });
    }
    try {
      const fresh = await fetchOnce(key, r.upstream, r.route.ttl);
      if (fresh.status !== 200 && hit && age < hit.ttl + STALE_IF_ERROR && fresh.status >= 429) {
        stats.stale++; return out(hit, 'STALE');
      }
      if (fresh.status !== 200) cfg.log(`satelit-proxy: ${r.route.name} answered ${fresh.status}`);
      return out(cache.get(key) || { ...fresh, storedAt: now, ttl: 0 }, 'MISS');
    } catch (e) {
      stats.errors++;
      cfg.log(`satelit-proxy: ${r.route.name} failed: ${e.name === 'TimeoutError' ? 'timeout' : e.message}`);
      if (hit && age < hit.ttl + STALE_IF_ERROR) { stats.stale++; return out(hit, 'STALE'); }
      return send(res, 502, errorBody('upstream_unavailable', 'The data API is not reachable right now.'), cors);
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      cfg.log(`satelit-proxy: ${e.message}`);
      if (!res.headersSent) send(res, 500, errorBody('internal', 'Internal error.'));
    });
  });
  return { server, cache, stats, cfg };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = +process.env.PORT || 8787;
  const host = process.env.HOST || '127.0.0.1';
  const { server, cfg } = createProxy();
  if (!cfg.key) console.warn('satelit-proxy: SATELIT_API_KEY is not set; data routes answer 503.');
  server.listen(port, host, () => console.log(`satelit-proxy listening on http://${host}:${port}${cfg.basePath || ''}`));
}

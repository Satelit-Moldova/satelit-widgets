// What the proxy lets through: only the GET routes the widgets call, only known query
// parameters with checked values, and how long each answer may be cached (seconds).
// The same file ships as proxy/cloudflare-worker/src/policy.js (a test keeps them equal).

const LANG = (v) => ['ro', 'ru', 'en', 'uk'].includes(v);
const KEY = (v) => /^[a-z0-9_-]{1,40}$/i.test(v);
const text = (min, max) => (v) => v.trim().length >= min && v.length <= max;
const int = (min, max) => (v) => /^\d{1,4}$/.test(v) && +v >= min && +v <= max;
const DATE = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const BOOL = (v) => v === 'true' || v === 'false';
const COUNTRY = (v) => /^[A-Z]{2}$/.test(v);

// TTLs follow the API's guidance: rates 1-6 h, fuel 1-3 h, prices 1-6 h, news 10-15 min, movie schedule 1-3 h.
export const ROUTES = [
  { name: 'rates', path: /^\/rates$/, ttl: 3 * 3600, params: { lang: LANG } },
  { name: 'fuel', path: /^\/fuel$/, ttl: 2 * 3600, params: { lang: LANG } },
  { name: 'news', path: /^\/news$/, ttl: 600, params: { lang: LANG, per: int(1, 20), category: KEY, region: KEY } },
  {
    name: 'prices-search', path: /^\/prices\/search$/, ttl: 3 * 3600, required: ['q'],
    params: { lang: LANG, q: text(2, 100), store: KEY, category: KEY, in_stock: BOOL },
  },
  { name: 'prices-item', path: /^\/prices\/items\/\d{1,9}$/, ttl: 3 * 3600, params: { lang: LANG } },
  {
    name: 'cinema-today', path: /^\/movies\/cinemas\/today$/, ttl: 2 * 3600,
    params: { lang: LANG, country: COUNTRY, city: text(1, 60), date: DATE },
  },
];

// Errors and "not found" are cached briefly so a bad query cannot cost credits in a loop.
export const NEGATIVE_TTL = 300;
// A copy past its TTL is still served when the API is down, for this long.
export const STALE_IF_ERROR = 24 * 3600;

/**
 * Checks a request path (already without the proxy's own prefix) and its query.
 * Returns {ok:true, route, upstream: "/rates?lang=ro"} with a normalized, sorted query
 * (unknown parameters dropped), or {ok:false, status, code, message}.
 */
export function resolve(pathname, searchParams) {
  let path = pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith('/v1/')) path = path.slice(3);
  const route = ROUTES.find((r) => r.path.test(path));
  if (!route) return { ok: false, status: 404, code: 'not_allowed', message: 'This route is not served by the proxy.' };
  const kept = [];
  for (const [k, v] of searchParams) {
    const check = route.params[k];
    if (!check) continue;
    if (!check(v)) return { ok: false, status: 422, code: 'invalid', message: `Bad value for "${k}".` };
    if (!kept.some(([kk]) => kk === k)) kept.push([k, k === 'q' || k === 'city' ? v.trim() : v]);
  }
  for (const req of route.required || []) {
    if (!kept.some(([k]) => k === req)) return { ok: false, status: 422, code: 'invalid', message: `"${req}" is required.` };
  }
  kept.sort(([a], [b]) => (a < b ? -1 : 1));
  const qs = kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return { ok: true, route, upstream: path + (qs ? `?${qs}` : '') };
}

/** Origin check: "*" allows any; otherwise an exact list. No Origin header (curl, same-origin GET) passes. */
export function originAllowed(origin, allowed) {
  if (!origin) return true;
  if (allowed.includes('*')) return true;
  return allowed.includes(origin.replace(/\/+$/, ''));
}

export function parseOrigins(value) {
  return String(value || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
}

// A stand-in for api.satelit.md built from tests/fixtures/samples.json (real answers, trimmed).
// Counts calls, records the Authorization header, and can be told to fail.
import http from 'node:http';
import { readFileSync } from 'node:fs';

const samples = JSON.parse(readFileSync(new URL('./fixtures/samples.json', import.meta.url), 'utf8'));

export function sample(route) { return samples[route].body; }

export function startMockApi() {
  const state = { calls: [], auth: [], fail: false, delayMs: 0 };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock');
    state.calls.push(url.pathname.replace(/^\/v1/, '') + url.search);
    state.auth.push(req.headers.authorization || '');
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
    if (state.fail) { res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' }); return res.end('{"error":{"code":"busy","message":"Busy."}}'); }
    const path = url.pathname.replace(/^\/v1/, '');
    let key = path;
    if (path === '/news') key = '/news?per=3';
    if (path === '/prices/search') key = '/prices/search?q=lapte';
    if (/^\/prices\/items\/\d+$/.test(path)) key = '/prices/items/3487';
    const s = samples[key];
    if (!s) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":{"code":"not_found","message":"Not found."}}'); }
    res.writeHead(s.status, { 'Content-Type': 'application/json', 'X-Credits-Remaining': '1000', 'X-Credits-Limit': '5000', 'X-Credits-Cost': '1' });
    res.end(JSON.stringify(s.body));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ server, state, base: `http://127.0.0.1:${server.address().port}/v1`, close: () => new Promise((r) => server.close(r)) });
  }));
}

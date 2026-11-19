import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, originAllowed, parseOrigins, ROUTES } from '../proxy/node/policy.mjs';

const q = (s) => new URLSearchParams(s);

test('allows the widget routes and normalizes the query', () => {
  assert.equal(resolve('/rates', q('lang=ru&x=1')).upstream, '/rates?lang=ru');
  assert.equal(resolve('/v1/news', q('per=5&lang=ro')).upstream, '/news?lang=ro&per=5');
  assert.equal(resolve('/prices/search', q('q=  lapte &lang=ro')).upstream, '/prices/search?lang=ro&q=lapte');
  assert.equal(resolve('/prices/items/3487', q('')).upstream, '/prices/items/3487');
  assert.equal(resolve('/movies/cinemas/today', q('country=MD&city=Chișinău')).upstream, '/movies/cinemas/today?city=Chi%C8%99in%C4%83u&country=MD');
});

test('refuses other routes and bad values', () => {
  assert.equal(resolve('/me', q('')).status, 404);
  assert.equal(resolve('/movies/titles/m603/full', q('')).status, 404);
  assert.equal(resolve('/prices/items/abc', q('')).status, 404);
  assert.equal(resolve('/../me', q('')).status, 404);
  assert.equal(resolve('/rates', q('lang=xx')).status, 422);
  assert.equal(resolve('/news', q('per=500')).status, 422);
  assert.equal(resolve('/prices/search', q('')).status, 422);
  assert.equal(resolve('/prices/search', q('q=a')).status, 422);
});

test('origins', () => {
  const list = parseOrigins('https://a.md, https://b.md/');
  assert.deepEqual(list, ['https://a.md', 'https://b.md']);
  assert.ok(originAllowed('https://b.md', list));
  assert.ok(!originAllowed('https://evil.example', list));
  assert.ok(originAllowed(undefined, list));
  assert.ok(originAllowed('https://any.example', ['*']));
});

test('the worker ships the same policy file', () => {
  const a = readFileSync(new URL('../proxy/node/policy.mjs', import.meta.url), 'utf8');
  const b = readFileSync(new URL('../proxy/cloudflare-worker/src/policy.js', import.meta.url), 'utf8');
  assert.equal(a, b);
});

test('the PHP proxy lists the same routes and TTLs', () => {
  const php = readFileSync(new URL('../proxy/php/satelit-proxy.php', import.meta.url), 'utf8');
  const found = [...php.matchAll(/'name' => '([a-z-]+)', 'path' => '[^']+', 'ttl' => (\d+)/g)].map((m) => [m[1], +m[2]]);
  assert.deepEqual(found, ROUTES.map((r) => [r.name, r.ttl]));
});

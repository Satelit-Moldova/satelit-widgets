// The widgets' render functions on real (trimmed) answers, run from the built file in a VM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';
import { build } from '../scripts/build.mjs';
import { sample } from './mock-api.mjs';

const dist = readFileSync(new URL('../dist/satelit-widgets.js', import.meta.url), 'utf8');
const ctx = { module: { exports: {} }, Intl, console };
vm.runInNewContext(dist, ctx);
const W = ctx.module.exports;

const el = (attrs = {}) => ({ getAttribute: (k) => (k in attrs ? attrs[k] : null) });

test('dist is built from src and stays small', () => {
  assert.equal(dist, build(), 'run npm run build');
  assert.ok(gzipSync(dist).length < 25 * 1024);
});

test('rates: values, change and the BNM line', () => {
  const html = W.widgets['satelit-rates'].render(sample('/rates'), el({ codes: 'USD,EUR' }), 'ro');
  assert.ok(html.indexOf('USD') < html.indexOf('EUR'));
  assert.match(html, /20,1411/);
  assert.match(html, /\+1,5%/);
  assert.ok(html.includes('Sursa: Banca Națională a Moldovei, bnm.md, CC BY 4.0'));
  assert.ok(html.includes('href="https://satelit.md"'));
});

test('converter: math on value/nominal, MDL base', () => {
  const list = sample('/rates').data;
  assert.ok(Math.abs(W._internals.convert(100, 'EUR', 'MDL', list) - 2014.11) < 1e-9);
  assert.ok(Math.abs(W._internals.convert(2014.11, 'MDL', 'EUR', list) - 100) < 1e-9);
  const html = W.widgets['satelit-converter'].render(sample('/rates'), el({ from: 'EUR', to: 'MDL', amount: '100' }), 'en');
  assert.match(html, /2,014\.11 MDL/);
  assert.ok(html.includes('aria-live="polite"'));
});

test('fuel: sorted by price, cap, links', () => {
  const html = W.widgets['satelit-fuel'].render(sample('/fuel'), el({ fuel: 'a95' }), 'ro');
  assert.ok(html.indexOf('Vento') < html.indexOf('Rompetrol'));
  assert.ok(html.indexOf('Rompetrol') < html.indexOf('Lukoil'));
  assert.match(html, /28,04 lei/);
  assert.match(html, /Plafon ANRE: 28,08 lei/);
});

test('cinema: city filter folds diacritics, past sessions dimmed', () => {
  const data = sample('/movies/cinemas/today');
  assert.equal(W._internals.cinemasIn(data.data, 'Chisinau').length, 2);
  assert.equal(W._internals.cinemasIn(data.data, 'Bălți').length, 1);
  const html = W.widgets['satelit-cinema'].render(data, el({ city: 'Chișinău' }), 'ro', { day: '2026-11-19', time: '12:00' });
  assert.ok(html.includes('Cineplex Mall'));
  assert.ok(!html.includes('Cineplex Balti'));
  assert.ok(html.includes('Badanta'));
  assert.match(html, /class="chip past"[^>]*>10:10/);
  assert.match(html, /class="chip"[^>]*>13:10/);
});

test('news: titles, outlets as links', () => {
  const html = W.widgets['satelit-news'].render(sample('/news?per=3'), el({ limit: '2' }), 'ro');
  assert.ok(html.includes('Igor Grosu'));
  assert.ok(html.includes('>Moldpres</a>'));
  assert.equal((html.match(/<li>/g) || []).length, 2);
});

test('prices: cheapest offer in stock, with the shop name', () => {
  const item = sample('/prices/items/3487').data;
  assert.equal(W._internals.bestOffer(item.offers).store.name, 'METRO');
  const html = W.widgets['satelit-prices'].render({ meta: null, items: [item] }, el({ q: 'lapte' }), 'ro');
  assert.match(html, /15,99 lei/);
  assert.ok(html.includes('>METRO</a>'));
  assert.ok(html.includes('în 4 magazine'));
});

test('escapes data and drops non-http links', () => {
  const evil = { data: [{ id: 'x', title: '<img src=x onerror=alert(1)>', sources: [{ name: 'a', url: 'javascript:alert(1)' }] }], meta: null };
  const html = W.widgets['satelit-news'].render(evil, el(), 'ro');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('javascript:'));
});

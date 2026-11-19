/*! satelit-widgets 1.0.0 | MIT | https://satelit.md */
(function(){'use strict';
var SCRIPT = typeof document !== 'undefined' ? document.currentScript : null;
var I18N = {
ro: {
loading: 'Se încarcă…', error: 'Datele nu sunt disponibile acum.', data: 'Date: Satelit',
rates: 'Cursul BNM', currency: 'Valuta', rate: 'Curs (MDL)', change7: '7 zile',
converter: 'Convertor valutar', amount: 'Suma', from: 'Din', to: 'În', result: 'Rezultat',
fuel: 'Prețuri la carburanți', network: 'Rețea', cap: 'Plafon ANRE', cheapest: 'cel mai ieftin',
cinema: 'Azi la cinema', noSessions: 'Nu sunt seanse azi.', soldOut: 'epuizat', book: 'Bilete',
news: 'Știri', prices: 'Prețuri', from_: 'de la', inStores: 'în {n} magazine', noResults: 'Nimic găsit.',
a95: 'Benzină 95', diesel: 'Motorină', lpg: 'GPL', updated: 'Actualizat'
},
ru: {
loading: 'Загрузка…', error: 'Данные сейчас недоступны.', data: 'Данные: Satelit',
rates: 'Курс НБМ', currency: 'Валюта', rate: 'Курс (MDL)', change7: '7 дней',
converter: 'Конвертер валют', amount: 'Сумма', from: 'Из', to: 'В', result: 'Результат',
fuel: 'Цены на топливо', network: 'Сеть', cap: 'Потолок ANRE', cheapest: 'дешевле всех',
cinema: 'Сегодня в кино', noSessions: 'Сегодня сеансов нет.', soldOut: 'распродано', book: 'Билеты',
news: 'Новости', prices: 'Цены', from_: 'от', inStores: 'в {n} магазинах', noResults: 'Ничего не найдено.',
a95: 'Бензин 95', diesel: 'Дизель', lpg: 'Газ', updated: 'Обновлено'
},
en: {
loading: 'Loading…', error: 'Data is not available right now.', data: 'Data: Satelit',
rates: 'BNM exchange rates', currency: 'Currency', rate: 'Rate (MDL)', change7: '7 days',
converter: 'Currency converter', amount: 'Amount', from: 'From', to: 'To', result: 'Result',
fuel: 'Fuel prices', network: 'Network', cap: 'ANRE cap', cheapest: 'cheapest',
cinema: 'In cinemas today', noSessions: 'No sessions today.', soldOut: 'sold out', book: 'Tickets',
news: 'News', prices: 'Prices', from_: 'from', inStores: 'in {n} shops', noResults: 'Nothing found.',
a95: 'Petrol 95', diesel: 'Diesel', lpg: 'LPG', updated: 'Updated'
}
};
function pickLang(el) {
var l = (el.getAttribute('lang') || (typeof document !== 'undefined' && document.documentElement.lang) || 'ro').slice(0, 2).toLowerCase();
return I18N[l] ? l : 'ro';
}
function t(lang, key, vars) {
var s = (I18N[lang] || I18N.ro)[key] || I18N.ro[key] || key;
if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
return s;
}
function esc(v) {
return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
});
}
function safeUrl(u) {
return /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
}
function num(lang, v, digits) {
if (v == null || isNaN(v)) return '–';
var loc = { ro: 'ro-MD', ru: 'ru-MD', en: 'en-GB' }[lang] || 'ro-MD';
return new Intl.NumberFormat(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}
function clampInt(v, def, min, max) {
var n = parseInt(v, 10);
if (isNaN(n)) n = def;
return Math.max(min, Math.min(max, n));
}
function proxyBase(el) {
var p = el.getAttribute('proxy') || (SCRIPT && SCRIPT.getAttribute('data-proxy')) || '/satelit-proxy';
return p.replace(/\/+$/, '');
}
var INFLIGHT = {};
function getJSON(url) {
if (!INFLIGHT[url]) {
INFLIGHT[url] = fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
return r.json().catch(function () { return {}; }).then(function (body) {
if (!r.ok || !body || body.error) {
delete INFLIGHT[url];
throw new Error((body && body.error && body.error.code) || 'http_' + r.status);
}
return body;
});
}, function (e) { delete INFLIGHT[url]; throw e; });
}
return INFLIGHT[url];
}
function apiUrl(el, path, params) {
var qs = Object.keys(params || {}).filter(function (k) { return params[k] != null && params[k] !== ''; })
.map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
return proxyBase(el) + path + (qs ? '?' + qs : '');
}
function footer(lang, meta, extra) {
var parts = [];
if (meta && meta.attribution) parts.push(esc(meta.attribution));
if (meta && meta.notice) parts.push(esc(meta.notice));
if (extra) parts.push(extra);
parts.push('<a href="https://satelit.md" target="_blank" rel="noopener">' + esc(t(lang, 'data')) + '</a>');
return '<footer class="ft">' + parts.join(' · ') + '</footer>';
}
var CSS = [
':host{display:block;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
'--sw-bg:#fff;--sw-fg:#1b1f24;--sw-muted:#5b6470;--sw-line:#e3e6ea;--sw-accent:#0a66c2;--sw-up:#b42318;--sw-down:#067647;--sw-chip:#f2f4f7;--sw-radius:12px}',
':host([theme=dark]){--sw-bg:#15181d;--sw-fg:#e8eaed;--sw-muted:#9aa3ae;--sw-line:#2a2f37;--sw-accent:#6cb4ff;--sw-up:#ff8a80;--sw-down:#7ee2a8;--sw-chip:#22272e}',
'@media (prefers-color-scheme:dark){:host([theme=auto]){--sw-bg:#15181d;--sw-fg:#e8eaed;--sw-muted:#9aa3ae;--sw-line:#2a2f37;--sw-accent:#6cb4ff;--sw-up:#ff8a80;--sw-down:#7ee2a8;--sw-chip:#22272e}}',
'.box{background:var(--sw-bg);color:var(--sw-fg);border:1px solid var(--sw-line);border-radius:var(--sw-radius);padding:14px 16px;box-sizing:border-box;max-width:100%;overflow:hidden}',
'h2{font-size:15px;margin:0 0 10px;font-weight:650}',
'table{width:100%;border-collapse:collapse}th,td{padding:6px 4px;border-bottom:1px solid var(--sw-line);text-align:left;vertical-align:top}',
'th{font-weight:600;color:var(--sw-muted);font-size:12px}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
'caption{text-align:left;font-weight:650;font-size:15px;padding-bottom:8px}',
'.up{color:var(--sw-up)}.down{color:var(--sw-down)}.muted{color:var(--sw-muted)}',
'.ft{margin-top:10px;font-size:11px;color:var(--sw-muted)}a{color:var(--sw-accent)}',
'ul{list-style:none;margin:0;padding:0}li{padding:8px 0;border-bottom:1px solid var(--sw-line)}li:last-child{border-bottom:0}',
'.chip{display:inline-block;background:var(--sw-chip);border-radius:999px;padding:2px 8px;margin:2px 4px 2px 0;font-size:12px;font-variant-numeric:tabular-nums;color:var(--sw-fg);text-decoration:none}',
'.chip.past{opacity:.45}.chip.out{text-decoration:line-through}',
'label{display:block;font-size:12px;color:var(--sw-muted);margin-bottom:2px}',
'input,select{font:inherit;color:var(--sw-fg);background:var(--sw-bg);border:1px solid var(--sw-line);border-radius:8px;padding:6px 8px;width:100%;box-sizing:border-box;min-height:36px}',
'.row{display:flex;gap:8px;flex-wrap:wrap}.row>div{flex:1 1 90px;min-width:0}',
'.big{font-size:22px;font-weight:700;margin-top:10px;font-variant-numeric:tabular-nums}',
'.film{display:flex;gap:10px}.film img,.film .ph{width:46px;height:69px;object-fit:cover;border-radius:6px;flex:none;background:var(--sw-chip)}',
'.t{font-weight:600}.small{font-size:12px}.status{color:var(--sw-muted)}'
].join('');
function defineWidget(tag, spec) {
if (typeof customElements === 'undefined' || customElements.get(tag)) return;
class El extends HTMLElement {
static get observedAttributes() { return spec.attrs.concat(['lang', 'proxy', 'limit']); }
}
El.prototype.connectedCallback = function () {
if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
if (!this.hasAttribute('theme')) this.setAttribute('theme', 'auto');
this.load();
};
El.prototype.attributeChangedCallback = function (name, oldV, newV) {
if (this.shadowRoot && oldV !== newV && name !== 'theme') this.load();
};
El.prototype.paint = function (inner) {
this.shadowRoot.innerHTML = '<style>' + CSS + '</style><div class="box" part="box">' + inner + '</div>';
};
El.prototype.load = function () {
var el = this, lang = pickLang(el), seq = (el._seq = (el._seq || 0) + 1);
el.paint('<p class="status" role="status">' + esc(t(lang, 'loading')) + '</p>');
Promise.resolve(spec.fetch(el, lang)).then(function (data) {
if (seq !== el._seq) return;
el.paint(spec.render(data, el, lang));
el.setAttribute('data-ready', '');
if (spec.after) spec.after(el, data, lang);
}).catch(function (e) {
if (seq !== el._seq) return;
el.paint('<p class="status" role="status">' + esc(t(lang, 'error')) + '</p>' + footer(lang));
el.setAttribute('data-error', String(e && e.message || e));
});
};
customElements.define(tag, El);
}
function attr(el, name, def) {
var v = el.getAttribute(name);
return v == null || v === '' ? def : v;
}
function perUnit(r) { return r.value / (r.nominal || 1); }
var rates = {
attrs: ['codes'],
fetch: function (el, lang) { return getJSON(apiUrl(el, '/rates', { lang: lang })); },
render: function (body, el, lang) {
var list = body.data || [];
var codes = attr(el, 'codes', '');
if (codes) {
var want = codes.toUpperCase().split(/[\s,]+/);
list = want.map(function (c) { return list.filter(function (r) { return r.code === c; })[0]; }).filter(Boolean);
}
list = list.slice(0, clampInt(attr(el, 'limit'), 5, 1, 50));
var date = list[0] && list[0].date;
var rows = list.map(function (r) {
var ch = r.change_7d_pct;
var cls = ch > 0 ? 'up' : ch < 0 ? 'down' : 'muted';
return '<tr><td><b>' + esc(r.code) + '</b> <span class="muted small">' + esc(r.name) + '</span></td>' +
'<td class="n">' + (r.nominal > 1 ? '<span class="muted small">' + esc(r.nominal) + ' = </span>' : '') + num(lang, r.value, 4) + '</td>' +
'<td class="n ' + cls + '">' + (ch == null ? '–' : (ch > 0 ? '+' : '') + num(lang, ch, 1) + '%') + '</td></tr>';
}).join('');
return '<table><caption>' + esc(t(lang, 'rates')) + (date ? ' <span class="muted small">' + esc(date) + '</span>' : '') + '</caption>' +
'<thead><tr><th scope="col">' + esc(t(lang, 'currency')) + '</th><th scope="col" class="n">' + esc(t(lang, 'rate')) +
'</th><th scope="col" class="n">' + esc(t(lang, 'change7')) + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
footer(lang, body.meta);
}
};
function convert(amount, from, to, list) {
function r(code) {
if (code === 'MDL') return 1;
var x = list.filter(function (i) { return i.code === code; })[0];
return x ? perUnit(x) : NaN;
}
return amount * r(from) / r(to);
}
var converter = {
attrs: ['from', 'to', 'amount'],
fetch: rates.fetch,
render: function (body, el, lang) {
var list = body.data || [];
var codes = ['MDL'].concat(list.map(function (r) { return r.code; }));
var from = attr(el, 'from', 'EUR').toUpperCase(), to = attr(el, 'to', 'MDL').toUpperCase();
var amount = parseFloat(attr(el, 'amount', '100')) || 0;
function sel(id, cur) {
return '<select id="' + id + '">' + codes.map(function (c) {
return '<option' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>';
}).join('') + '</select>';
}
var res = convert(amount, from, to, list);
return '<h2>' + esc(t(lang, 'converter')) + '</h2><div class="row">' +
'<div><label for="a">' + esc(t(lang, 'amount')) + '</label><input id="a" type="number" inputmode="decimal" min="0" step="any" value="' + esc(amount) + '"></div>' +
'<div><label for="f">' + esc(t(lang, 'from')) + '</label>' + sel('f', from) + '</div>' +
'<div><label for="to">' + esc(t(lang, 'to')) + '</label>' + sel('to', to) + '</div></div>' +
'<div class="big" id="r" aria-live="polite" aria-label="' + esc(t(lang, 'result')) + '">' + num(lang, res, 2) + ' ' + esc(to) + '</div>' +
'<div class="muted small">' + esc(t(lang, 'rates')) + (list[0] ? ' ' + esc(list[0].date) : '') + '</div>' +
footer(lang, body.meta);
},
after: function (el, body, lang) {
var root = el.shadowRoot, list = body.data || [];
function upd() {
var to = root.getElementById('to').value;
var v = convert(parseFloat(root.getElementById('a').value) || 0, root.getElementById('f').value, to, list);
root.getElementById('r').textContent = num(lang, v, 2) + ' ' + to;
}
['a', 'f', 'to'].forEach(function (id) { root.getElementById(id).addEventListener('input', upd); });
}
};
var fuel = {
attrs: ['fuel'],
fetch: function (el, lang) { return getJSON(apiUrl(el, '/fuel', { lang: lang })); },
render: function (body, el, lang) {
var d = body.data || {};
var f = attr(el, 'fuel', 'a95');
if (['a95', 'diesel', 'lpg'].indexOf(f) < 0) f = 'a95';
var nets = (d.networks || []).filter(function (n) { return n.prices && n.prices[f] != null && !n.stale; })
.sort(function (a, b) { return a.prices[f] - b.prices[f]; })
.slice(0, clampInt(attr(el, 'limit'), 8, 1, 100));
var cheapest = d.cheapest && d.cheapest[f];
var rows = nets.map(function (n) {
return '<tr><td>' + (safeUrl(n.url) ? '<a href="' + esc(n.url) + '" target="_blank" rel="noopener">' + esc(n.name) + '</a>' : esc(n.name)) +
(n.key === cheapest ? ' <span class="chip">' + esc(t(lang, 'cheapest')) + '</span>' : '') + '</td>' +
'<td class="n">' + num(lang, n.prices[f], 2) + ' lei</td></tr>';
}).join('');
var cap = d.cap && d.cap[f];
return '<table><caption>' + esc(t(lang, 'fuel')) + ': ' + esc(t(lang, f)) + ' <span class="muted small">' + esc(d.date || '') + '</span></caption>' +
'<thead><tr><th scope="col">' + esc(t(lang, 'network')) + '</th><th scope="col" class="n">MDL / l</th></tr></thead><tbody>' + rows + '</tbody></table>' +
(cap ? '<div class="muted small" style="margin-top:6px">' + esc(t(lang, 'cap')) + ': ' + num(lang, cap, 2) + ' lei</div>' : '') +
footer(lang, body.meta, 'ANRE');
}
};
function fold(s) {
return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function chisinauNow(date) {
var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
.formatToParts(date || new Date()).reduce(function (o, x) { o[x.type] = x.value; return o; }, {});
return { day: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute };
}
function cinemasIn(data, city) {
var want = fold(city);
return (data.cinemas || []).filter(function (c) { return !want || fold(c.cinema && c.cinema.city) === want; });
}
var cinema = {
attrs: ['city'],
fetch: function (el, lang) { return getJSON(apiUrl(el, '/movies/cinemas/today', { country: 'MD', lang: lang })); },
render: function (body, el, lang, now) {
var d = body.data || {};
var city = attr(el, 'city', '');
var limit = clampInt(attr(el, 'limit'), 6, 1, 50);
var n = now || chisinauNow();
var list = cinemasIn(d, city);
var html = list.map(function (c) {
var films = (c.films || []).slice(0, limit).map(function (f) {
var poster = f.pictures && f.pictures.poster && f.pictures.poster.s;
var chips = (f.sessions || []).map(function (s) {
var past = d.day === n.day && s.time < n.time;
var label = esc(s.time) + ' <span class="muted">' + esc([].concat(s.formats || []).join('/')) + (s.audio ? ' ' + esc(String(s.audio).toUpperCase()) : '') +
(s.subtitles ? ' sub ' + esc(String(s.subtitles).toUpperCase()) : '') + '</span>';
var cls = 'chip' + (past ? ' past' : '') + (s.sold_out ? ' out' : '');
var title = s.language ? ' title="' + esc(s.language + (s.hall ? ', ' + s.hall : '')) + '"' : '';
var extra = s.sold_out ? '<span class="muted small"> (' + esc(t(lang, 'soldOut')) + ')</span>' : '';
return safeUrl(s.booking_url) && !s.sold_out
? '<a class="' + cls + '" href="' + esc(s.booking_url) + '" target="_blank" rel="noopener"' + title + ' aria-label="' + esc(t(lang, 'book') + ' ' + s.time) + '">' + label + '</a>'
: '<span class="' + cls + '"' + title + '>' + label + extra + '</span>';
}).join('');
return '<li class="film">' + (safeUrl(poster) ? '<img src="' + esc(poster) + '" alt="" loading="lazy" width="46" height="69">' : '<span class="ph" aria-hidden="true"></span>') +
'<div><div class="t">' + esc(f.title || f.listed_title) + (f.year ? ' <span class="muted small">' + esc(f.year) + '</span>' : '') +
(f.rating && f.rating.value ? ' <span class="muted small">★ ' + num(lang, f.rating.value, 1) + '</span>' : '') + '</div><div>' + chips + '</div></div></li>';
}).join('');
return '<section><h2>' + esc(c.cinema.name) + ' <span class="muted small">' + esc(c.cinema.city) + (c.cinema.address ? ', ' + esc(c.cinema.address) : '') + '</span></h2><ul>' + films + '</ul></section>';
}).join('');
return '<h2>' + esc(t(lang, 'cinema')) + (city ? ' · ' + esc(city) : '') + ' <span class="muted small">' + esc(d.day || '') + '</span></h2>' +
(html || '<p class="muted">' + esc(t(lang, 'noSessions')) + '</p>') + footer(lang, body.meta);
}
};
function hhmm(iso) {
if (!iso) return '';
return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}
var news = {
attrs: ['category', 'region'],
fetch: function (el, lang) {
return getJSON(apiUrl(el, '/news', { lang: lang, per: clampInt(attr(el, 'limit'), 5, 1, 20), category: attr(el, 'category', ''), region: attr(el, 'region', '') }));
},
render: function (body, el, lang) {
var items = (body.data || []).slice(0, clampInt(attr(el, 'limit'), 5, 1, 20)).map(function (n) {
var src = (n.sources || []).filter(function (s) { return safeUrl(s.url); });
var title = src[0] ? '<a class="t" href="' + esc(src[0].url) + '" target="_blank" rel="noopener">' + esc(n.title) + '</a>' : '<span class="t">' + esc(n.title) + '</span>';
var outlets = src.slice(0, 3).map(function (s) { return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>'; }).join(', ');
return '<li>' + title + '<div class="muted small">' + esc(hhmm(n.published_at)) + (n.category ? ' · ' + esc(n.category.label) : '') +
(n.region && n.region.label ? ' · ' + esc(n.region.label) : '') + (outlets ? ' · ' + outlets : '') + '</div></li>';
}).join('');
return '<h2>' + esc(t(lang, 'news')) + '</h2><ul>' + (items || '<li class="muted">' + esc(t(lang, 'noResults')) + '</li>') + '</ul>' + footer(lang, body.meta);
}
};
function bestOffer(offers) {
var list = (offers || []).filter(function (o) { return o.price != null; });
var inStock = list.filter(function (o) { return o.in_stock; });
return (inStock.length ? inStock : list).sort(function (a, b) { return a.price - b.price; })[0] || null;
}
var prices = {
attrs: ['q'],
fetch: function (el, lang) {
var q = attr(el, 'q', '').trim();
if (q.length < 2) return { data: [], meta: null, items: [] };
var limit = clampInt(attr(el, 'limit'), 4, 1, 10);
return getJSON(apiUrl(el, '/prices/search', { q: q, lang: lang })).then(function (body) {
var top = (body.data || []).slice(0, limit);
return Promise.all(top.map(function (it) {
return getJSON(apiUrl(el, '/prices/items/' + encodeURIComponent(it.id), { lang: lang })).then(function (b) { return b.data; }, function () { return it; });
})).then(function (items) { return { data: body.data, meta: body.meta, items: items }; });
});
},
render: function (res, el, lang) {
var rows = (res.items || []).map(function (it) {
var o = bestOffer(it.offers);
var shop = o ? (safeUrl(o.url) ? '<a href="' + esc(o.url) + '" target="_blank" rel="noopener">' + esc(o.store && o.store.name) + '</a>' : esc(o.store && o.store.name)) : '';
var price = o ? o.price : it.min_price;
return '<tr><td><span class="t">' + esc(it.name) + '</span><div class="muted small">' + esc(t(lang, 'inStores', { n: it.stores })) + '</div></td>' +
'<td class="n">' + esc(t(lang, 'from_')) + ' <b>' + num(lang, price, 2) + ' lei</b>' + (shop ? '<div class="small">' + shop + '</div>' : '') + '</td></tr>';
}).join('');
return '<table><caption>' + esc(t(lang, 'prices')) + ': ' + esc(attr(el, 'q', '')) + '</caption><tbody>' +
(rows || '<tr><td class="muted">' + esc(t(lang, 'noResults')) + '</td></tr>') + '</tbody></table>' + footer(lang, res.meta);
}
};
var WIDGETS = {
'satelit-rates': rates, 'satelit-converter': converter, 'satelit-fuel': fuel,
'satelit-cinema': cinema, 'satelit-news': news, 'satelit-prices': prices
};
Object.keys(WIDGETS).forEach(function (tag) { defineWidget(tag, WIDGETS[tag]); });
var api = { version: '1.0.0', widgets: WIDGETS, _internals: { esc: esc, convert: convert, bestOffer: bestOffer, cinemasIn: cinemasIn, chisinauNow: chisinauNow, fold: fold, I18N: I18N } };
if (typeof window !== 'undefined') window.SatelitWidgets = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

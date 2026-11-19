/* Shared core: proxy fetch, i18n, formatting, the base element. */

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

/* Only http(s) links reach an href. */
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

/* Where the proxy lives: the element's proxy="", else data-proxy on the script tag, else /satelit-proxy. */
function proxyBase(el) {
  var p = el.getAttribute('proxy') || (SCRIPT && SCRIPT.getAttribute('data-proxy')) || '/satelit-proxy';
  return p.replace(/\/+$/, '');
}

/* One request per URL per page: two widgets on /rates share it. */
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

/* Required lines: the source's attribution when the API gives one, and the Satelit link always. */
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

/* Base element: shadow root, attribute changes reload, render(data) returns HTML. */
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

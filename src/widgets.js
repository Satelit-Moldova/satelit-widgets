/* The six widgets. Each has fetch(el, lang) -> data and a pure render(data, el, lang) -> HTML. */

function attr(el, name, def) {
  var v = el.getAttribute(name);
  return v == null || v === '' ? def : v;
}

/* ---------- rates ---------- */

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

/* ---------- converter ---------- */

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

/* ---------- fuel ---------- */

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

/* ---------- cinema ---------- */

function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/* "HH:MM" now in Chișinău, and today's date there. */
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

/* ---------- news ---------- */

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

/* ---------- prices ---------- */

/* The cheapest offer in stock, else the cheapest at all. */
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
      /* Each item's offers carry the shop names; a failed one just shows no shop. */
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

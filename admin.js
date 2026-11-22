/*
 * APX Capital – admin dashboard (admin.html)
 * 1. Sign in with the same GitHub token as the inline editor (kept in sessionStorage,
 *    so the edit links open straight into edit mode in the same tab).
 * 2. Visitor statistics come from the GoatCounter API with a read-only key
 *    ("Read statistics" permission only), entered once by the admin.
 */
(() => {
  'use strict';
  const REPO = 'capa79/apxcapital';
  const GH = `https://api.github.com/repos/${REPO}`;
  const GC = 'https://apxcapital.goatcounter.com/api/v0';
  const GH_KEY = 'apx-admin-token';
  const GC_KEY = 'apx-gc-key';
  const $ = id => document.getElementById(id);
  const fmt = n => (n || 0).toLocaleString('en-GB').replace(/,/g, ' ');

  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} }
  };

  let ghToken = null, gcKey = null, days = 30;

  /* ---------- GitHub sign in ---------- */
  async function gh(path) {
    const res = await fetch(GH + path, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${ghToken}`, 'X-GitHub-Api-Version': '2022-11-28' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.message || res.statusText); e.status = res.status; throw e; }
    return data;
  }
  async function verifyGh(t) {
    ghToken = t;
    const repo = await gh('');
    if (!repo.permissions || !repo.permissions.push) throw new Error('This token cannot write to the repository.');
  }
  async function signIn() {
    const t = $('gh-token').value.trim();
    const err = $('gh-err');
    if (!t) { err.textContent = 'Enter a token.'; return; }
    err.textContent = 'Checking…';
    try { await verifyGh(t); ss.set(GH_KEY, t); $('gh-token').value = ''; err.textContent = ''; showDash(); }
    catch (e) { ghToken = null; err.textContent = e.status === 401 ? 'Invalid or expired token.' : (e.message || 'Sign in failed.'); }
  }
  function signOut(e) {
    if (e) e.preventDefault();
    ss.del(GH_KEY); ss.del(GC_KEY); ghToken = null; gcKey = null;
    $('dash').classList.add('hidden'); $('signout').classList.add('hidden'); $('login').classList.remove('hidden');
    $('sub').textContent = 'Sign in to edit the site and see visitor statistics.';
  }

  function showDash() {
    $('login').classList.add('hidden');
    $('dash').classList.remove('hidden');
    $('signout').classList.remove('hidden');
    $('sub').textContent = 'Signed in. Edit pages, follow visits and see recent changes.';
    $('skipgc').checked = ls.get('skipgc') === 't';
    loadCommits();
    gcKey = ss.get(GC_KEY) || ls.get(GC_KEY);
    if (gcKey) { showStats(); } else { $('gc-login').classList.remove('hidden'); }
  }

  async function loadCommits() {
    const ul = $('commits');
    try {
      const list = await gh('/commits?per_page=6');
      ul.textContent = '';
      list.forEach(c => {
        const li = document.createElement('li');
        const s = document.createElement('span');
        s.textContent = c.commit.message.split('\n')[0];
        const sm = document.createElement('small');
        sm.textContent = new Date(c.commit.author.date).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        s.appendChild(sm); li.appendChild(s); ul.appendChild(li);
      });
      if (!list.length) ul.innerHTML = '<li class="empty">No changes yet.</li>';
    } catch (e) { ul.innerHTML = '<li class="empty">Could not load changes.</li>'; }
  }

  /* ---------- GoatCounter ---------- */
  // The API allows 4 requests per second, and the browser sends a CORS preflight
  // (OPTIONS) before every call because of the Authorization header – so each call
  // costs two requests. Space calls 700 ms apart (~3 requests/second incl. preflight).
  // A 429 on the preflight comes back without CORS headers and surfaces as
  // "Failed to fetch", so network errors are retried with a back-off as well.
  const GAP = 700;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let last = 0;
  async function gc(path, params, tries = 4) {
    const q = new URLSearchParams(params).toString();
    for (let i = 0; ; i++) {
      const wait = Math.max(0, last + GAP - Date.now());
      last = Date.now() + wait;
      if (wait) await sleep(wait);
      let res;
      try {
        res = await fetch(`${GC}${path}${q ? '?' + q : ''}`, { headers: { Authorization: `Bearer ${gcKey}` } });
      } catch (netErr) { // most often a rate-limited preflight
        if (i < tries - 1) { last = Date.now() + 1500 * (i + 1); continue; }
        throw new Error('GoatCounter is rate limiting requests. Wait a few seconds and press Refresh.');
      }
      if (res.status === 429 && i < tries - 1) {
        const reset = Number(res.headers.get('X-Rate-Limit-Reset')) || (i + 1);
        last = Date.now() + reset * 1000;
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(data.error || (data.errors && JSON.stringify(data.errors)) || res.statusText); e.status = res.status; throw e; }
      return data;
    }
  }

  // Cache results per period for a few minutes so switching periods or reloading the
  // page does not hit the API again. Refresh always fetches fresh numbers.
  const CACHE_MS = 5 * 60 * 1000;
  const cacheKey = n => `apx-gc-cache2-${n}-${new Date().toISOString().slice(0, 10)}`;
  const cacheGet = n => { try { const c = JSON.parse(ss.get(cacheKey(n)) || 'null'); return c && Date.now() - c.t < CACHE_MS ? c : null; } catch (e) { return null; } };
  const cacheSet = (n, data) => ss.set(cacheKey(n), JSON.stringify({ t: Date.now(), data }));

  async function connectGc() {
    const k = $('gc-key').value.trim();
    const err = $('gc-err');
    if (!k) { err.textContent = 'Enter a key.'; return; }
    err.textContent = 'Checking…';
    gcKey = k;
    try {
      await gc('/stats/total', range(1).cur);
      if ($('gc-remember').checked) ls.set(GC_KEY, k); else ss.set(GC_KEY, k);
      $('gc-key').value = ''; err.textContent = '';
      showStats();
    } catch (e) {
      gcKey = null;
      err.textContent = e.status === 401 ? 'Unknown key.' : e.status === 403 ? 'The key needs the “Read statistics” permission.' : 'Could not connect: ' + (e.message || 'error');
    }
  }
  function forgetGc() {
    ls.del(GC_KEY); ss.del(GC_KEY); gcKey = null;
    $('stats').classList.add('hidden'); $('gc-login').classList.remove('hidden');
  }
  function showStats() {
    $('gc-login').classList.add('hidden');
    $('stats').classList.remove('hidden');
    loadStats();
  }

  // UTC day boundaries, rounded to the hour as the API expects.
  const dayStart = (offset) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };
  const iso = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  function range(n) {
    const start = dayStart(-(n - 1));                       // first day 00:00 UTC
    const end = new Date(dayStart(1).getTime() - 1000);     // today 23:59:59 UTC
    const pStart = dayStart(-(2 * n - 1));
    const pEnd = new Date(start.getTime() - 1000);
    return { cur: { start: iso(start), end: iso(end) }, prev: { start: iso(pStart), end: iso(pEnd) } };
  }

  const NS = 'http://www.w3.org/2000/svg';
  function spark(stats) {
    const v = (stats || []).map(x => x.daily || 0);
    if (v.length < 2) return null;
    const max = Math.max(1, ...v), W = 70, H = 18;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(NS, 'polyline');
    p.setAttribute('points', v.map((x, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - 1 - x / max * (H - 2)).toFixed(1)}`).join(' '));
    svg.appendChild(p);
    return svg;
  }

  // opts.detail(item) -> API path for a drill-down list (or null); opts.detailName(item) -> label; opts.spark -> show per-day sparkline
  function fillList(id, items, nameOf, opts = {}) {
    const ul = opts.target || $(id);
    ul.textContent = '';
    if (!items || !items.length) { ul.innerHTML = '<li class="empty">No data for this period.</li>'; return; }
    const max = Math.max(...items.map(i => i.count), 1);
    items.forEach(i => {
      const li = document.createElement('li');
      const bar = document.createElement('i');
      bar.style.width = Math.max(2, Math.round(i.count / max * 100)) + '%';
      const s = document.createElement('span'); s.textContent = nameOf(i) || '(unknown)'; s.title = s.textContent;
      const b = document.createElement('b'); b.textContent = fmt(i.count);
      li.append(bar, s);
      if (opts.spark) { const sp = spark(i.stats); if (sp) li.appendChild(sp); }
      li.appendChild(b);
      ul.appendChild(li);
      const path = opts.detail && opts.detail(i);
      if (!path) return;
      li.classList.add('drill');
      li.tabIndex = 0; li.setAttribute('role', 'button'); li.setAttribute('aria-expanded', 'false');
      s.title = s.textContent + ' – click for details';
      let box = null;
      const toggle = async () => {
        if (box) { box.remove(); box = null; li.setAttribute('aria-expanded', 'false'); return; }
        li.setAttribute('aria-expanded', 'true');
        box = document.createElement('li'); box.className = 'subwrap';
        const sub = document.createElement('ul'); sub.className = 'list sub';
        sub.innerHTML = '<li class="empty">Loading…</li>';
        box.appendChild(sub); li.after(box);
        try {
          const d = await gc(path, { ...range(days).cur, limit: 10 });
          const rows = d.stats || d.refs || [];
          if (box) fillList(null, rows, opts.detailName || (x => x.name), { target: sub });
        } catch (e) { sub.innerHTML = '<li class="empty">Could not load details.</li>'; }
      };
      li.addEventListener('click', toggle);
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
  }

  const PAGE_NAMES = { '/': 'Home', '/index.html': 'Home', '/projects.html': 'Ventures', '/projects': 'Ventures', '/privacy.html': 'Privacy', '/privacy': 'Privacy' };
  const pageName = h => PAGE_NAMES[h.path] ? `${PAGE_NAMES[h.path]}  ·  ${h.path}` : (h.title || h.path);
  const refName = r => (r.name === '' ? 'Direct / unknown' : r.name);
  const SIZE_NAMES = { phone: 'Phones (up to 600 px)', tablet: 'Tablets (600–1000 px)', desktop: 'Computers (1000–1920 px)', desktophd: 'Large screens (over 1920 px)', unknown: 'Unknown' };
  const sizeName = s => SIZE_NAMES[s.id] || s.name || s.id;
  const pxName = s => (s.name === '' || s.name === '0' ? 'Unknown' : `${s.name} px wide`);
  const enc = encodeURIComponent;

  // Visitors by hour of day, summed over the period and shifted from UTC to this browser's time zone.
  function hourChart(stats) {
    const sum = new Array(24).fill(0);
    stats.forEach(d => (d.hourly || []).forEach((v, h) => { sum[h] += v; }));
    const off = Math.round(-new Date().getTimezoneOffset() / 60);
    const local = sum.map((_, h) => sum[((h - off) % 24 + 24) % 24]);
    const box = $('hours'); box.textContent = '';
    const max = Math.max(1, ...local), W = 480, H = 150, pb = 18;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Visitors by hour of day');
    const bw = W / 24;
    local.forEach((v, h) => {
      const hh = (H - pb - 4) * v / max;
      const r = document.createElementNS(NS, 'rect');
      [['class', 'b'], ['x', h * bw + bw * .15], ['y', H - pb - hh], ['width', bw * .7], ['height', Math.max(v ? 1 : 0, hh)], ['rx', 1]].forEach(([k, x]) => r.setAttribute(k, x));
      const t = document.createElementNS(NS, 'title'); t.textContent = `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59: ${v}`; r.appendChild(t);
      svg.appendChild(r);
      if (h % 3 === 0) { const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', h * bw + bw / 2); tx.setAttribute('y', H - 4); tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('class', 'ax'); tx.textContent = String(h).padStart(2, '0'); svg.appendChild(tx); }
    });
    box.appendChild(svg);
    const peak = local.indexOf(Math.max(...local));
    $('hours-peak').textContent = local[peak] ? `Busiest hour: ${String(peak).padStart(2, '0')}:00–${String(peak + 1).padStart(2, '0')}:00 (your local time)` : '';
  }

  function chart(stats) {
    const box = $('chart');
    let pts = stats.map(s => ({ label: s.day, v: s.daily }));
    let unit = 'day';
    if (days === 1) {
      const h = (stats[stats.length - 1] || { hourly: [] }).hourly || [];
      pts = h.map((v, i) => ({ label: String(i).padStart(2, '0') + ':00', v })); unit = 'hour';
    } else if (pts.length > 100) { // 12 months: group by week
      const w = [];
      pts.forEach((p, i) => { if (i % 7 === 0) w.push({ label: p.label, v: 0 }); w[w.length - 1].v += p.v; });
      pts = w; unit = 'week';
    }
    $('chart-title').textContent = `Visitors per ${unit}`;
    const W = 1000, H = 220, pl = 34, pb = 22, pt = 8;
    const max = Math.max(1, ...pts.map(p => p.v));
    const nice = max <= 5 ? 5 : Math.ceil(max / 5) * 5;
    const bw = (W - pl) / Math.max(pts.length, 1);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Visitors per ${unit}`);
    const el = (t, a) => { const e = document.createElementNS(ns, t); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
    [0, .5, 1].forEach(f => {
      const y = pt + (H - pt - pb) * (1 - f);
      svg.appendChild(el('line', { x1: pl, x2: W, y1: y, y2: y }));
      const tx = el('text', { x: pl - 6, y: y + 3, 'text-anchor': 'end', class: 'ax' }); tx.textContent = Math.round(nice * f); svg.appendChild(tx);
    });
    const every = Math.ceil(pts.length / 8);
    pts.forEach((p, i) => {
      const h = (H - pt - pb) * p.v / nice;
      const r = el('rect', { class: 'b', x: pl + i * bw + bw * .15, y: H - pb - h, width: Math.max(1, bw * .7), height: Math.max(p.v ? 1 : 0, h), rx: 1 });
      const tt = document.createElementNS(ns, 'title'); tt.textContent = `${p.label}: ${p.v} visitor${p.v === 1 ? '' : 's'}`; r.appendChild(tt);
      svg.appendChild(r);
      if (i % every === 0) {
        const lbl = unit === 'hour' ? p.label : new Date(p.label + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
        const tx = el('text', { x: pl + i * bw + bw / 2, y: H - 6, 'text-anchor': 'middle', class: 'ax' }); tx.textContent = lbl; svg.appendChild(tx);
      }
    });
    box.textContent = ''; box.appendChild(svg);
  }

  let loading = false;
  async function loadStats(force) {
    if (loading) return;
    loading = true;
    const err = $('stats-err'); err.textContent = '';
    $('updated').textContent = 'Loading…';
    const r = range(days);
    const q = { ...r.cur, limit: 10 };
    try {
      const cached = force === true ? null : cacheGet(days);
      let data;
      if (cached) data = cached.data;
      else {
        const step = (label, p) => { $('updated').textContent = `Loading ${label}…`; return p(); };
        data = {};
        data.total = await step('visitors', () => gc('/stats/total', r.cur));
        data.prev = await step('previous period', () => gc('/stats/total', r.prev));
        data.hits = await step('pages', () => gc('/stats/hits', { ...r.cur, limit: 50 }));
        data.refs = await step('referrers', () => gc('/stats/toprefs', q));
        data.loc = await step('countries', () => gc('/stats/locations', q));
        data.br = await step('browsers', () => gc('/stats/browsers', { ...q, limit: 6 }));
        data.sy = await step('systems', () => gc('/stats/systems', { ...q, limit: 6 }));
        data.sz = await step('screen sizes', () => gc('/stats/sizes', q));
        data.lang = await step('languages', () => gc('/stats/languages', q));
        data.camp = await step('campaigns', () => gc('/stats/campaigns', q));
        data.no = await step('regions in Norway', () => gc('/stats/locations/NO', { ...r.cur, limit: 15 }));
        cacheSet(days, data);
      }
      const { total, prev, hits, refs, loc, br, sy, sz, lang = {}, camp = {}, no = {} } = data;

      const st = total.stats || [];
      const today = st.length ? st[st.length - 1].daily : 0;
      const yday = st.length > 1 ? st[st.length - 2].daily : null;
      $('k-visitors').textContent = fmt(total.total - (total.total_events || 0));
      const cur = total.total - (total.total_events || 0), pv = prev.total - (prev.total_events || 0);
      const ch = $('k-change');
      if (pv > 0) { const p = Math.round((cur - pv) / pv * 100); ch.textContent = `${p >= 0 ? '▲' : '▼'} ${Math.abs(p)} % vs previous period (${fmt(pv)})`; ch.className = 'd ' + (p >= 0 ? 'up' : 'down'); }
      else { ch.textContent = 'No data for previous period'; ch.className = 'd'; }
      $('k-today').textContent = fmt(today);
      $('k-yesterday').textContent = days === 1 ? 'Per hour in the chart below' : (yday === null ? '' : `Yesterday: ${fmt(yday)}`);
      const best = st.reduce((a, s) => (s.daily > a.daily ? s : a), { daily: -1 });
      $('k-avg').textContent = fmt(Math.round(cur / Math.max(1, st.length) * 10) / 10);
      $('k-best').textContent = best.daily > 0 && days > 1 ? `Best day: ${new Date(best.day + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} (${fmt(best.daily)})` : '';
      $('k-events').textContent = fmt(total.total_events || 0);

      chart(st);
      hourChart(st);
      const H = hits.hits || [];
      const refsOf = h => (h.path_id ? `/stats/hits/${h.path_id}` : null);
      fillList('l-pages', H.filter(h => !h.event).slice(0, 10), pageName, { spark: days > 1, detail: refsOf, detailName: refName });
      fillList('l-events', H.filter(h => h.event).slice(0, 10), h => h.title || h.path, { spark: days > 1, detail: refsOf, detailName: refName });
      fillList('l-refs', refs.stats, refName, { detail: x => (x.name ? `/stats/toprefs/${enc(x.name)}` : null), detailName: x => pageName({ path: x.name }) });
      fillList('l-camp', camp.stats, s => s.name, { detail: x => `/stats/campaigns/${enc(x.id)}`, detailName: refName });
      fillList('l-loc', loc.stats, s => s.name, { detail: x => (x.id ? `/stats/locations/${enc(x.id)}` : null) });
      fillList('l-regions', no.stats, s => s.name);
      fillList('l-lang', lang.stats, s => s.name);
      fillList('l-browsers', br.stats, s => s.name, { detail: x => (x.name ? `/stats/browsers/${enc(x.name)}` : null) });
      fillList('l-systems', sy.stats, s => s.name, { detail: x => (x.name ? `/stats/systems/${enc(x.name)}` : null) });
      fillList('l-sizes', (sz.stats || []).filter(x => x.count > 0), sizeName, { detail: x => `/stats/sizes/${enc(x.id)}`, detailName: pxName });
      $('updated').textContent = 'Updated ' + new Date(cached ? cached.t : Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      $('updated').textContent = '';
      if (e.status === 401 || e.status === 403) { forgetGc(); $('gc-err').textContent = 'The statistics key no longer works. Add a new one.'; }
      else err.textContent = 'Could not load statistics: ' + (e.message || 'error');
    } finally { loading = false; }
  }

  /* ---------- wiring ---------- */
  $('gh-ok').addEventListener('click', signIn);
  $('gh-token').addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
  $('signout').addEventListener('click', signOut);
  $('gc-ok').addEventListener('click', connectGc);
  $('gc-key').addEventListener('keydown', e => { if (e.key === 'Enter') connectGc(); });
  $('gc-forget').addEventListener('click', forgetGc);
  $('refresh').addEventListener('click', () => loadStats(true));
  $('skipgc').addEventListener('change', e => { if (e.target.checked) ls.set('skipgc', 't'); else ls.del('skipgc'); });
  $('range').addEventListener('click', e => {
    const b = e.target.closest('button[data-days]'); if (!b || loading) return;
    days = Number(b.dataset.days);
    $('range').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    loadStats();
  });

  (async () => {
    const saved = ss.get(GH_KEY);
    if (!saved) return;
    try { await verifyGh(saved); showDash(); } catch (e) { ss.del(GH_KEY); ghToken = null; }
  })();
})();

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
  let last = 0;
  async function gc(path, params) {
    const wait = Math.max(0, last + 300 - Date.now()); // API allows 4 requests per second
    last = Date.now() + wait;
    if (wait) await new Promise(r => setTimeout(r, wait));
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`${GC}${path}${q ? '?' + q : ''}`, { headers: { Authorization: `Bearer ${gcKey}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || (data.errors && JSON.stringify(data.errors)) || res.statusText); e.status = res.status; throw e; }
    return data;
  }

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

  function fillList(id, items, nameOf, total) {
    const ul = $(id);
    ul.textContent = '';
    if (!items || !items.length) { ul.innerHTML = '<li class="empty">No data for this period.</li>'; return; }
    const max = total || Math.max(...items.map(i => i.count), 1);
    items.forEach(i => {
      const li = document.createElement('li');
      const bar = document.createElement('i');
      bar.style.width = Math.max(2, Math.round(i.count / max * 100)) + '%';
      const s = document.createElement('span'); s.textContent = nameOf(i) || '(unknown)'; s.title = s.textContent;
      const b = document.createElement('b'); b.textContent = fmt(i.count);
      li.append(bar, s, b); ul.appendChild(li);
    });
  }

  const PAGE_NAMES = { '/': 'Home', '/index.html': 'Home', '/projects.html': 'Ventures', '/projects': 'Ventures', '/privacy.html': 'Privacy', '/privacy': 'Privacy' };
  const pageName = h => PAGE_NAMES[h.path] ? `${PAGE_NAMES[h.path]}  ·  ${h.path}` : (h.title || h.path);
  const refName = r => (r.name === '' ? 'Direct / unknown' : r.name);

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
  async function loadStats() {
    if (loading) return;
    loading = true;
    const err = $('stats-err'); err.textContent = '';
    $('updated').textContent = 'Loading…';
    const r = range(days);
    const q = { ...r.cur, limit: 10 };
    try {
      const total = await gc('/stats/total', r.cur);
      const prev = await gc('/stats/total', r.prev);
      const hits = await gc('/stats/hits', { ...r.cur, limit: 50 });
      const refs = await gc('/stats/toprefs', q);
      const loc = await gc('/stats/locations', q);
      const br = await gc('/stats/browsers', { ...q, limit: 6 });
      const sy = await gc('/stats/systems', { ...q, limit: 6 });
      const sz = await gc('/stats/sizes', q);

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
      const H = hits.hits || [];
      fillList('l-pages', H.filter(h => !h.event).slice(0, 10), pageName);
      fillList('l-events', H.filter(h => h.event).slice(0, 10), h => h.title || h.path);
      fillList('l-refs', refs.stats, refName);
      fillList('l-loc', loc.stats, s => s.name);
      fillList('l-browsers', br.stats, s => s.name);
      fillList('l-systems', sy.stats, s => s.name);
      fillList('l-sizes', sz.stats, s => s.name);
      $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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
  $('refresh').addEventListener('click', loadStats);
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

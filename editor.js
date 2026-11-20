/*
 * APX Capital – inline text editor
 * Open https://apxcapital.no/#admin, sign in with a GitHub fine-grained token
 * (repo capa79/apxcapital, permission "Contents: Read and write").
 * Edits are saved as a commit to the current page's HTML file; GitHub Pages republishes in ~1 minute.
 */
(() => {
  'use strict';
  const REPO = 'capa79/apxcapital';
  const BRANCH = 'main';
  const FILE = (() => { const p = location.pathname.split('/').pop(); return !p ? 'index.html' : (p.includes('.') ? p : p + '.html'); })();
  const API = `https://api.github.com/repos/${REPO}`;
  const KEY = 'apx-admin-token';
  const EDITABLE = [
    'h1', 'h2', 'h3', 'p', '.eyebrow', '.kicker', '.hero-note', '.tag', '.card-no',
    '.principle span', '.ticker span > span', '.btn > span:not(.arrow)', '#navlinks a',
    '.contact-panel .label', '.contact-panel .big', '.contact-panel small', '.contact-mail',
    '.footbrand', '.legal', '.footlinks a'
  ].join(',');

  const store = {
    get() { try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v, remember) { try { (remember ? localStorage : sessionStorage).setItem(KEY, v); } catch (e) {} },
    clear() { try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) {} }
  };

  let token = null, editing = false, dirty = false;

  const css = `
  [data-editor-ui]{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:0;text-transform:none}
  .apx-ed-bar{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;display:flex;gap:8px;align-items:center;background:#111c2b;border:1px solid #c8a66a;border-radius:40px;padding:8px 10px 8px 18px;box-shadow:0 12px 40px rgba(0,0,0,.5);color:#f2f5f8;font-size:13px}
  .apx-ed-bar b{color:#e4c995;font-weight:600;margin-right:6px}
  .apx-ed-bar button,.apx-ed-modal button{border:1px solid rgba(215,226,239,.25);background:transparent;color:#f2f5f8;border-radius:30px;padding:8px 14px;font-size:12px;cursor:pointer}
  .apx-ed-bar button.primary,.apx-ed-modal button.primary{background:#c8a66a;border-color:#c8a66a;color:#111821;font-weight:700}
  .apx-ed-bar button:disabled{opacity:.45;cursor:default}
  .apx-ed-status{color:#9aa8b8;font-size:12px;min-width:90px}
  .apx-ed-back{position:fixed;inset:0;z-index:10000;background:rgba(4,8,14,.75);display:flex;align-items:center;justify-content:center;padding:20px}
  .apx-ed-modal{background:#0d1521;border:1px solid rgba(215,226,239,.16);border-radius:10px;max-width:440px;width:100%;padding:28px;color:#f2f5f8;font-size:14px;line-height:1.55}
  .apx-ed-modal h4{margin:0 0 8px;font:400 24px Georgia,serif}
  .apx-ed-modal p{color:#9aa8b8;margin:0 0 16px;font-size:13px}
  .apx-ed-modal input[type=password]{width:100%;padding:11px 12px;border-radius:6px;border:1px solid rgba(215,226,239,.25);background:#080d15;color:#f2f5f8;font-size:14px;margin-bottom:10px}
  .apx-ed-modal label{display:flex;gap:8px;align-items:center;color:#9aa8b8;font-size:12px;margin-bottom:16px}
  .apx-ed-modal .row{display:flex;gap:8px;justify-content:flex-end}
  .apx-ed-err{color:#ff9b8a;font-size:12px;min-height:18px;margin-bottom:8px}
  body.apx-editing [data-apx-edit]{outline:1px dashed rgba(228,201,149,.55);outline-offset:3px;cursor:text}
  body.apx-editing [data-apx-edit]:focus{outline:2px solid #e4c995;background:rgba(200,166,106,.06)}
  `;

  function ui(tag, attrs = {}, html = '') {
    const el = document.createElement(tag);
    el.setAttribute('data-editor-ui', '');
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    el.innerHTML = html;
    return el;
  }

  function injectStyle() {
    if (document.getElementById('apx-ed-style')) return;
    const s = ui('style', { id: 'apx-ed-style' }, css);
    document.head.appendChild(s);
  }

  async function gh(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.message || res.statusText); err.status = res.status; throw err; }
    return data;
  }

  async function verify(t) {
    token = t;
    const repo = await gh('');
    if (!repo.permissions || !repo.permissions.push) throw new Error('This token cannot write to the repository.');
    return true;
  }

  function loginDialog() {
    injectStyle();
    const back = ui('div', { class: 'apx-ed-back' });
    back.innerHTML = `
      <div class="apx-ed-modal" role="dialog" aria-modal="true" aria-labelledby="apx-ed-title">
        <h4 id="apx-ed-title">Admin sign in</h4>
        <p>Paste your GitHub access token for <b>${REPO}</b> (Contents: read and write).</p>
        <input type="password" id="apx-ed-token" autocomplete="off" placeholder="github_pat_…">
        <label><input type="checkbox" id="apx-ed-remember"> Remember on this device</label>
        <div class="apx-ed-err" id="apx-ed-err"></div>
        <div class="row"><button type="button" id="apx-ed-cancel">Cancel</button><button type="button" class="primary" id="apx-ed-ok">Sign in</button></div>
      </div>`;
    back.setAttribute('data-editor-ui', '');
    document.body.appendChild(back);
    const input = back.querySelector('#apx-ed-token');
    const err = back.querySelector('#apx-ed-err');
    input.focus();
    const close = () => { back.remove(); if (location.hash === '#admin') history.replaceState(null, '', location.pathname); };
    back.querySelector('#apx-ed-cancel').onclick = close;
    const submit = async () => {
      const t = input.value.trim();
      if (!t) { err.textContent = 'Enter a token.'; return; }
      err.textContent = 'Checking…';
      try {
        await verify(t);
        store.set(t, back.querySelector('#apx-ed-remember').checked);
        close();
        startEditing();
      } catch (e) {
        token = null;
        err.textContent = e.status === 401 ? 'Invalid or expired token.' : (e.message || 'Sign in failed.');
      }
    };
    back.querySelector('#apx-ed-ok').onclick = submit;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(); });
  }

  let bar, statusEl, saveBtn;
  function toolbar() {
    bar = ui('div', { class: 'apx-ed-bar', role: 'toolbar', 'aria-label': 'Editor' });
    bar.innerHTML = `<b>Edit mode</b><span class="apx-ed-status" id="apx-ed-status">Click any text to edit</span>
      <button type="button" class="primary" id="apx-ed-save" disabled>Publish</button>
      <button type="button" id="apx-ed-exit">Exit</button>
      <button type="button" id="apx-ed-logout">Sign out</button>`;
    document.body.appendChild(bar);
    statusEl = bar.querySelector('#apx-ed-status');
    saveBtn = bar.querySelector('#apx-ed-save');
    saveBtn.onclick = publish;
    bar.querySelector('#apx-ed-exit').onclick = () => stopEditing(true);
    bar.querySelector('#apx-ed-logout').onclick = () => { store.clear(); token = null; stopEditing(true); };
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) publish(); }
  }
  function onPaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }
  function onInput() { dirty = true; saveBtn.disabled = false; statusEl.textContent = 'Unsaved changes'; }
  function blockLinks(e) { if (editing && e.target.closest('a') && !e.target.closest('[data-editor-ui]')) e.preventDefault(); }
  function beforeUnload(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }

  function startEditing() {
    if (editing) return;
    injectStyle();
    editing = true; dirty = false;
    document.body.classList.add('apx-editing');
    document.querySelectorAll(EDITABLE).forEach(el => {
      if (el.closest('[data-editor-ui]')) return;
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
      el.setAttribute('data-apx-edit', '');
      el.addEventListener('keydown', onKey);
      el.addEventListener('paste', onPaste);
      el.addEventListener('input', onInput);
    });
    document.addEventListener('click', blockLinks, true);
    window.addEventListener('beforeunload', beforeUnload);
    toolbar();
  }

  function stopEditing(reloadIfDirty) {
    if (dirty && reloadIfDirty && !confirmDiscard()) return;
    editing = false;
    document.body.classList.remove('apx-editing');
    document.querySelectorAll('[data-apx-edit]').forEach(el => {
      el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); el.removeAttribute('data-apx-edit');
      el.removeEventListener('keydown', onKey); el.removeEventListener('paste', onPaste); el.removeEventListener('input', onInput);
    });
    document.removeEventListener('click', blockLinks, true);
    window.removeEventListener('beforeunload', beforeUnload);
    if (bar) bar.remove();
    if (location.hash === '#admin') history.replaceState(null, '', location.pathname);
    if (dirty && reloadIfDirty) { dirty = false; location.reload(); }
    dirty = false;
  }

  // In-page confirm without a blocking browser dialog
  function confirmDiscard() {
    if (bar && bar.dataset.confirm === '1') return true;
    if (bar) { bar.dataset.confirm = '1'; statusEl.textContent = 'Unsaved changes – click again to discard'; setTimeout(() => { if (bar) bar.dataset.confirm = ''; }, 4000); }
    return false;
  }

  function serialize() {
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll('[data-editor-ui]').forEach(n => n.remove());
    root.querySelectorAll('[data-apx-edit]').forEach(el => {
      el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); el.removeAttribute('data-apx-edit');
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n; while ((n = walker.nextNode())) n.nodeValue = n.nodeValue.replace(/\u00a0/g, ' ');
    });
    root.querySelectorAll('[style=""]').forEach(el => el.removeAttribute('style'));
    const body = root.querySelector('body');
    body.classList.remove('apx-editing');
    if (!body.getAttribute('class')) body.removeAttribute('class');
    const year = root.querySelector('#year'); if (year) year.textContent = '';
    const nav = root.querySelector('#navlinks'); if (nav) { nav.classList.remove('open'); }
    root.querySelectorAll('[class=""]').forEach(el => el.removeAttribute('class'));
    return '<!doctype html>\n' + root.outerHTML + '\n';
  }

  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function publish() {
    if (!dirty) return;
    saveBtn.disabled = true; statusEl.textContent = 'Publishing…';
    try {
      const current = await gh(`/contents/${FILE}?ref=${BRANCH}`);
      await gh(`/contents/${FILE}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: 'Update website text via editor',
          content: toBase64(serialize()),
          sha: current.sha,
          branch: BRANCH
        })
      });
      dirty = false;
      statusEl.textContent = 'Published – live in about a minute';
    } catch (e) {
      saveBtn.disabled = false;
      statusEl.textContent = e.status === 401 ? 'Session expired – sign in again' : 'Publish failed: ' + (e.message || 'error');
      if (e.status === 401) { store.clear(); }
    }
  }

  async function enter() {
    const saved = store.get();
    if (saved) {
      try { await verify(saved); startEditing(); return; } catch (e) { store.clear(); token = null; }
    }
    loginDialog();
  }

  function check() { if (location.hash === '#admin' && !editing) enter(); }
  window.addEventListener('hashchange', check);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check); else check();
})();

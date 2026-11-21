/* APX Capital – site behaviour (navigation, footer year, screenshot galleries) */
(() => {
  'use strict';
  const menu = document.getElementById('menu');
  const nav = document.getElementById('navlinks');
  if (menu && nav) {
    const set = open => { nav.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open)); };
    menu.addEventListener('click', () => set(!nav.classList.contains('open')));
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  document.querySelectorAll('.gallery').forEach(g => {
    const main = g.querySelector('.main-shot');
    const thumbs = g.querySelectorAll('.thumb');
    thumbs.forEach(t => t.addEventListener('click', () => {
      main.src = t.dataset.src;
      main.alt = t.dataset.alt;
      thumbs.forEach(x => { const on = x === t; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    }));
  });
})();

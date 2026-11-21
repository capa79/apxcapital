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

  // Hero animation: pointer parallax + pause when off-screen
  const fx = document.querySelector('.hero-fx');
  const hero = document.querySelector('.hero');
  if (fx && hero) {
    if (window.matchMedia('(pointer:fine)').matches && !window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
      let raf = 0;
      hero.addEventListener('pointermove', e => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = hero.getBoundingClientRect();
          fx.style.setProperty('--mx', ((e.clientX - r.left) / r.width - .5).toFixed(3));
          fx.style.setProperty('--my', ((e.clientY - r.top) / r.height - .5).toFixed(3));
        });
      });
      hero.addEventListener('pointerleave', () => { fx.style.setProperty('--mx', 0); fx.style.setProperty('--my', 0); });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => fx.classList.toggle('paused', !en.isIntersecting)).observe(hero);
    }
  }

  // Venture cards: rotate screenshots while visible
  if (!window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
    document.querySelectorAll('.vshot-imgs').forEach((box, n) => {
      const imgs = box.querySelectorAll('img');
      if (imgs.length < 2) return;
      let i = 0, timer = 0;
      const step = () => { imgs[i].classList.remove('on'); i = (i + 1) % imgs.length; imgs[i].classList.add('on'); };
      const run = on => { clearInterval(timer); timer = on ? setInterval(step, 4000) : 0; };
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([en]) => { setTimeout(() => run(en.isIntersecting), n * 1300); }).observe(box);
      } else run(true);
    });
  }
})();

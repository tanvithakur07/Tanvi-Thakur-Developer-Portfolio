(() => {
  const burger = document.querySelector('.burger'), menu = document.getElementById('menu');
  burger.addEventListener('click', () => { const o = menu.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
  menu.addEventListener('click', e => { if (e.target.tagName === 'A') { menu.classList.remove('open'); burger.setAttribute('aria-expanded', false); } });

  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => document.getElementById(b.dataset.open).showModal()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // Highlight the current section in the nav
  const links = [...menu.querySelectorAll('a')];
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach(a => { const s = document.querySelector(a.getAttribute('href')); if (s) io.observe(s); });

  // Resume: only download if the PDF really exists
  const r = document.getElementById('resume'), note = document.getElementById('resumeNote');
  r.addEventListener('click', async e => {
    try { const res = await fetch(r.href, { method: 'HEAD' }); if (res.ok) return; } catch (_) {}
    e.preventDefault(); note.hidden = false;
  });
})();

/* ---------- motion ---------- */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prog = document.querySelector('.prog');
  const onScroll = () => { const m = document.documentElement.scrollHeight - innerHeight; prog.style.setProperty('--p', m > 0 ? scrollY / m : 0); };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const sel = '.sec h2,.prose p,.core li,.card,.proj,.tl,.tl li,.three>div,.lead,.contact,.sec .actions,.plain li,.sub';
  const els = [...document.querySelectorAll(sel)];
  els.forEach(el => { if (!el.matches('h2,.tl')) el.classList.add('rv'); el.style.setProperty('--rd', [...el.parentElement.children].indexOf(el) % 6); });
  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .15 });
  els.forEach(el => io.observe(el));
  if (reduce) return;
  document.querySelectorAll('.proj').forEach(c => {
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.style.setProperty('--mx', x * 100 + '%'); c.style.setProperty('--my', y * 100 + '%');
      c.style.setProperty('--rx', ((.5 - y) * 6).toFixed(2) + 'deg'); c.style.setProperty('--ry', ((x - .5) * 8).toFixed(2) + 'deg');
    });
    c.addEventListener('pointerleave', () => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
  });
})();

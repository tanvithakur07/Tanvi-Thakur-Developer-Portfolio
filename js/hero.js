/* Hero: cursor-driven gaze, built on a graph of real frames (transparent character, no background rectangle).
 *
 * WHY A GRAPH: the source animation is one continuous performance, not a turntable. Its frames form a ring of
 * gaze directions (left -> up-left -> up -> up-right -> right -> down-right -> down -> down-left) plus "spokes" from the
 * neutral pose. Each frame is a node with a gaze coordinate (x = right, y = up). Edges join frames that are neighbours in
 * the video, or flow-interpolated in-betweens across blinks, and each edge has a cost equal to how much the picture changes.
 * Nothing else is ever connected, so two frames are only blended when they are genuinely adjacent poses.
 *
 * HOW IT TRACKS: the cursor (relative to the head, scaled by the hero size) becomes a desired gaze vector. The nearest frame
 * in gaze space is the target. The head then walks the cheapest path of edges to it (direct around the ring when two
 * directions are neighbours, via the neutral pose only when they are not), with eased speed. Frame-rate independent,
 * no overshoot, and the loop sleeps once she arrives.
 */
(() => {
  'use strict';
  const cv = document.getElementById('c'), hero = document.getElementById('top'), cfgEl = document.getElementById('hero-config');
  if (!cv || !hero || !cfgEl) return;
  let cfg; try { cfg = JSON.parse(cfgEl.textContent); } catch (_) { return; }
  const N = cfg.n, IDLE = cfg.idle, C = cfg.coords;
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)'), touchMQ = matchMedia('(hover: none)');
  if (reduceMQ.matches) return;                       // reduced motion: static poster, no listeners, no loop
  const ctx = cv.getContext('2d');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- graph: adjacency + all-pairs shortest path (Floyd-Warshall, ~10 ms for ~140 nodes) ---------- */
  const adj = Array.from({ length: N }, () => []), D = new Float32Array(N * N).fill(1e9);
  for (let i = 0; i < N; i++) D[i * N + i] = 0;
  cfg.edges.forEach(([a, b, c]) => { adj[a].push([b, c]); adj[b].push([a, c]); D[a * N + b] = D[b * N + a] = Math.min(D[a * N + b], c); });
  for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) { const dik = D[i * N + k]; if (dik > 1e8) continue; for (let j = 0; j < N; j++) { const v = dik + D[k * N + j]; if (v < D[i * N + j]) D[i * N + j] = v; } }
  const cost = (a, b) => { for (const [n, c] of adj[a]) if (n === b) return c; return 1; };
  const nextHop = (n, T) => { let best = -1, bc = 1e9; for (const [m, c] of adj[n]) { const v = c + D[m * N + T]; if (v < bc) { bc = v; best = m; } } return best; };

  /* ---------- asset loading: per tier, per strip; any failure falls back to the other tier, then to the poster ---------- */
  let tier = null, loading = null, ready = false, dead = false;
  const loadImg = src => new Promise((res, rej) => {
    const i = new Image(); i.decoding = 'async';
    i.onload = () => (i.decode ? i.decode().catch(() => {}).then(() => res(i)) : res(i));
    i.onerror = () => rej(new Error('failed ' + src)); i.src = src;
  });
  async function loadTier(name) {
    const t = cfg.tiers[name]; if (!t) throw new Error('no tier');
    return { name, w: t.w, h: t.h, per: t.per, imgs: await Promise.all(t.files.map(loadImg)) };
  }
  const wantedTier = () => (cv.width > 460 ? 'hi' : 'lo');
  async function ensureTier() {
    const name = wantedTier(); if (dead || loading || (tier && (tier.name === name || tier.name === 'hi'))) return;
    loading = loadTier(name).catch(() => (name === 'hi' ? loadTier('lo') : null)).catch(() => null);
    const t = await loading; loading = null;
    if (!t) { if (!tier) dead = true; return; }
    tier = t; if (!ready) { ready = true; hero.classList.add('hero-ready'); } lastKey = ''; draw();
  }
  function size() {
    const r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; lastKey = ''; }
    ensureTier(); draw();
  }

  /* ---------- state: the head sits on an edge (a -> b) at fraction t, or on node a when a === b ---------- */
  const S = { a: IDLE, b: IDLE, t: 0, v: 0, goal: IDLE, travel: 0 };
  let px = 0, py = 0, pointerIn = false, running = false, last = 0, inView = true, ambientOn = false, ambientGoal = IDLE, lastKey = '', geomDirty = true, G = null;
  const VMAX = 140, SK = 7, KA = 16;                 // max speed (cost units/s), arrival easing, acceleration smoothing

  function geom() {
    const h = hero.getBoundingClientRect(), c = cv.getBoundingClientRect();
    G = { l: h.left, r: h.right, t: h.top, b: h.bottom, cx: c.left + c.width / 2, cy: c.top + c.height * .30,
          rx: clamp(h.width * .34, 150, 520), ry: clamp(h.height * .32, 130, 380) };
    geomDirty = false;
  }
  // small neutral zone, then gradual change, reaching the full look only near the edge of the interaction area
  const NZ = .10, FULL = .62;                            // neutral zone radius; radius at which ~85% of the full look is reached
  const shape = r => { if (r <= FULL) { const u = clamp((r - NZ) / (FULL - NZ), 0, 1); return .85 * (.6 * u * u * (3 - 2 * u) + .4 * u); } return .85 + .15 * clamp((r - FULL) / (1 - FULL), 0, 1); };
  function nearestNode(gx, gy, hyst) {
    let best = S.goal, bd = 1e9, cd = 1e9;
    for (let i = 0; i < N; i++) { const d = (C[i][0] - gx) ** 2 + (C[i][1] - gy) ** 2; if (i === S.goal) cd = d; if (d < bd) { bd = d; best = i; } }
    return cd - bd > hyst ? best : S.goal;
  }
  function targetFromPointer() {
    if (!G || geomDirty) geom();
    if (px < G.l || px > G.r || py < G.t || py > G.b) return IDLE;                         // outside the hero: look at the camera
    const dx = (px - G.cx) / G.rx, dy = (G.cy - py) / G.ry, r = Math.hypot(dx, dy);
    if (r < NZ) return IDLE;
    const amp = shape(Math.min(1, r));
    return nearestNode(amp * dx / r, amp * dy / r, .008);
  }

  /* ---------- render: premultiplied-alpha interpolation between the two nodes of the current edge ---------- */
  function frame(g, alpha, op) {
    const t = tier, im = t.imgs[(g / t.per) | 0]; if (!im) return;
    ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha;
    ctx.drawImage(im, (g % t.per) * t.w, 0, t.w, t.h, 0, 0, cv.width, cv.height);
  }
  function draw() {
    if (!ready || !tier) return;
    const key = S.a + ':' + S.b + ':' + S.t.toFixed(3); if (key === lastKey) return; lastKey = key;
    ctx.imageSmoothingQuality = 'high'; ctx.clearRect(0, 0, cv.width, cv.height);
    if (S.a !== S.b && S.t > .004) { frame(S.a, 1 - S.t, 'source-over'); frame(S.b, S.t, 'lighter'); }
    else frame(S.a, 1, 'source-over');
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- loop: runs only while the head is moving ---------- */
  function wake() { if (!running && ready && inView && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(tick); } }
  function atNode(n, from) {                            // arrived at node n: stop, or pick the next edge of the cheapest route
    S.a = n; S.b = n; S.t = 0;
    if (n === S.goal) { S.v = 0; return true; }
    const m = nextHop(n, S.goal); if (m < 0) { S.v = 0; return true; }
    S.v = Math.abs(S.v) * (m === from ? .35 : 1);        // new edge is walked forward; doubling back loses most speed (no hard cusp)
    S.b = m; S.t = 0; return false;
  }
  function tick(now) {
    if (!running) return;
    const dt = Math.min(.05, Math.max(.001, (now - last) / 1000)); last = now;
    S.goal = ambientOn ? ambientGoal : (pointerIn ? targetFromPointer() : IDLE);
    if (S.a === S.b && atNode(S.a, -1)) { draw(); running = false; return; }
    const c = cost(S.a, S.b), costB = (1 - S.t) * c + D[S.b * N + S.goal], costA = S.t * c + D[S.a * N + S.goal];
    const dir = (S.v > .5 && costB < costA + .35 * c) ? 1 : (S.v < -.5 && costA < costB + .35 * c) ? -1 : (costB <= costA ? 1 : -1);
    const rem = dir > 0 ? costB : costA;
    const want = dir * Math.min(VMAX, rem * SK + 1.5);
    S.v += (want - S.v) * (1 - Math.exp(-dt * KA));    // signed speed: reversals pass smoothly through zero
    const dist = S.v * dt; S.travel += Math.abs(dist); S.t += dist / c;
    if (S.t >= 1) { if (atNode(S.b, S.a)) { draw(); running = false; return; } }
    else if (S.t <= 0) { if (atNode(S.a, S.b)) { draw(); running = false; return; } }
    draw(); requestAnimationFrame(tick);
  }

  /* ---------- input ---------- */
  function onPointer(e) {
    if (e.pointerType === 'touch' && e.type === 'pointermove' && !pointerIn) return;
    px = e.clientX; py = e.clientY; pointerIn = true; ambientOn = false; markActive(); wake();
  }
  function rest() { pointerIn = false; wake(); }
  const ac = new AbortController(), o = { signal: ac.signal, passive: true };
  addEventListener('pointermove', onPointer, o);
  addEventListener('pointerdown', onPointer, o);
  addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') rest(); }, o);
  addEventListener('pointercancel', rest, o);
  document.documentElement.addEventListener('pointerleave', rest, o);
  addEventListener('blur', rest, o);
  addEventListener('scroll', () => { geomDirty = true; if (pointerIn) wake(); }, o);
  addEventListener('resize', () => { geomDirty = true; size(); }, o);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pointerIn = false; running = false; } else wake(); }, o);
  if ('ResizeObserver' in window) new ResizeObserver(() => { geomDirty = true; size(); }).observe(cv);
  if ('IntersectionObserver' in window) new IntersectionObserver(es => {
    inView = es[0].isIntersecting;
    if (!inView) { pointerIn = false; ambientOn = false; S.a = S.b = S.goal = IDLE; S.t = 0; S.v = 0; draw(); running = false; } else wake();
  }, { threshold: .05 }).observe(hero);

  /* ---------- devices without a hover pointer: an occasional slow glance so the hero is not frozen ---------- */
  let idleSince = performance.now(); const markActive = () => { idleSince = performance.now(); };
  const nodeNear = (x, y) => { let b = 0, bd = 1e9; for (let i = 0; i < N; i++) { const d = (C[i][0] - x) ** 2 + (C[i][1] - y) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  function glance() {
    if (!touchMQ.matches || pointerIn || !inView || document.hidden || performance.now() - idleSince < 4000) return;
    ambientOn = true; ambientGoal = nodeNear(-.55, .15); wake();
    setTimeout(() => { ambientGoal = IDLE; setTimeout(() => { ambientOn = false; wake(); }, 1800); wake(); }, 1700);
  }
  const amb = setInterval(glance, 9000);
  addEventListener('pagehide', () => { clearInterval(amb); ac.abort(); running = false; }, { once: true });

  if (location.search.includes('debug')) window.__hero = { state: () => ({ p: S.travel, a: S.a, b: S.b, t: S.t, goal: S.goal, v: S.v, gx: C[S.a][0] * (1 - S.t) + C[S.b][0] * S.t, gy: C[S.a][1] * (1 - S.t) + C[S.b][1] * S.t, tier: tier && tier.name, ready }) };
  size();
})();

// shared behaviour for the retro-window pages (index-v2 / setup-v2):
// animated sky, theme toggle, draggable/collapsible windows, avatar tint, setup slideshow.
// load at the end of <body>, before the page's own script.
window.retro = (() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const root = document.documentElement;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the <head> script may already have restored a saved tint (hue or mono)
  let HUE = parseFloat(getComputedStyle(root).getPropertyValue('--h')) || 198;
  let MONO = root.classList.contains('mono');

  /* ================= background: stars, moon, wireframes ================= */
  const sky = $('#sky'), ctx = sky.getContext('2d');
  let W = 0, H = 0, lastT = performance.now(), shoot = null, moonHit = null;

  const stars = [];
  const starCount = Math.round(Math.min(380, Math.max(90, innerWidth * innerHeight / 4200)));
  for (let i = 0; i < starCount; i++) {
    stars.push({ x: Math.random(), y: Math.random(), z: .15 + Math.random() * .85,
                 s: Math.random() < .12 ? 2 : 1, p: Math.random() * 6.28, v: .6 + Math.random() * 1.8 });
  }

  // connect every pair of vertices at the minimum distance → wireframe edges
  function geo(verts) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let min = Infinity;
    for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) min = Math.min(min, d(verts[i], verts[j]));
    const e = [];
    for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) if (d(verts[i], verts[j]) <= min * 1.01) e.push([i, j]);
    const r = Math.max(...verts.map(v => Math.hypot(...v)));
    return { v: verts.map(v => v.map(c => c / r)), e };
  }
  const PHI = (1 + Math.sqrt(5)) / 2;
  const cube = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) cube.push([x, y, z]);
  const GEO = {
    tetra: geo([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]),
    cube: geo(cube),
    octa: geo([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]),
    icosa: geo([[0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI], [1, PHI, 0], [1, -PHI, 0],
                [-1, PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1]])
  };

  // x = fraction of width, y = position in viewport-heights, f = scroll parallax factor
  const SHAPES = [
    { g: 'icosa', x: .86, y: .72, s: .075, f: .55, a: 0,  b: .4, va: .18,  vb: .11 },
    { g: 'octa',  x: .10, y: 1.05, s: .05, f: .42, a: 1,  b: .2, va: -.14, vb: .2 },
    { g: 'cube',  x: .92, y: 1.55, s: .045, f: .62, a: .5, b: 1, va: .12,  vb: -.16 },
    { g: 'tetra', x: .14, y: 2.05, s: .05, f: .5,  a: 2,  b: .3, va: .2,   vb: .13 },
    { g: 'icosa', x: .62, y: 2.55, s: .055, f: .46, a: .3, b: 2, va: -.1,  vb: .15 },
    { g: 'octa',  x: .82, y: 3.0,  s: .04, f: .66, a: 1.2, b: .6, va: .16, vb: -.12 }
  ];

  // december snow (add ?snow to the address to preview it any time)
  const SNOW = new Date().getMonth() === 11 || /[?&]snow\b/.test(location.search);
  const flakes = [];
  if (SNOW) {
    const n = Math.round(Math.min(150, Math.max(50, innerWidth * innerHeight / 9000)));
    for (let i = 0; i < n; i++) {
      flakes.push({ x: Math.random(), y: Math.random(), s: Math.random() < .3 ? 4 : 3,
                    v: 18 + Math.random() * 30, d: Math.random() * 6.28, z: .3 + Math.random() * .7 });
    }
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    sky.width = Math.round(W * dpr); sky.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestDraw();
  }

  function draw(now) {
    // reduced motion: no scroll parallax either — the sky stays put like a fixed wallpaper
    const t = now / 1000, dt = Math.min(.05, (now - lastT) / 1000), sc = RM ? 0 : scrollY;
    const light = root.dataset.theme === 'light';
    lastT = now;

    // sky
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    if (light && MONO) { gr.addColorStop(0, '#d2d2d2'); gr.addColorStop(1, '#f4f4f4'); }
    else if (light) { gr.addColorStop(0, '#9ad8ff'); gr.addColorStop(1, '#eefaff'); }
    else if (MONO) { gr.addColorStop(0, '#020202'); gr.addColorStop(.55, '#0b0b0b'); gr.addColorStop(1, '#1b1b1b'); }
    else { gr.addColorStop(0, '#01030b'); gr.addColorStop(.55, '#04103a'); gr.addColorStop(1, '#0a2266'); }
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);

    // stars (square pixels, slow parallax)
    ctx.fillStyle = light ? '#ffffff' : MONO ? '#eeeeee' : '#dff4ff';
    for (const s of stars) {
      let y = (s.y * H - sc * s.z * .12) % H;
      if (y < 0) y += H;
      const tw = RM ? 1 : .55 + .45 * Math.sin(t * s.v + s.p);
      ctx.globalAlpha = (light ? .3 : .35 + .65 * s.z) * tw;
      ctx.fillRect(Math.round(s.x * W), Math.round(y), s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // the odd shooting star (night only)
    if (!light && !RM) {
      if (!shoot && Math.random() < dt / 7) {
        shoot = { x: W * (.25 + Math.random() * .7), y: H * Math.random() * .4,
                  vx: -(380 + Math.random() * 220), vy: 170 + Math.random() * 120, life: 0 };
      }
      if (shoot) {
        shoot.life += dt; shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt;
        const gx = shoot.x - shoot.vx * .12, gy = shoot.y - shoot.vy * .12;
        const sg = ctx.createLinearGradient(shoot.x, shoot.y, gx, gy);
        sg.addColorStop(0, 'rgba(235,248,255,.9)'); sg.addColorStop(1, 'rgba(235,248,255,0)');
        ctx.strokeStyle = sg; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(gx, gy); ctx.stroke();
        if (shoot.life > 1.2) shoot = null;
      }
    }

    const lc = MONO ? (light ? 'hsla(0,0%,25%,' : 'hsla(0,0%,82%,')
                    : (light ? `hsla(${HUE + 24},70%,35%,` : `hsla(${HUE},90%,75%,`);

    // moon (sun in light mode) with a tilted orbit ring
    const R = Math.max(34, Math.min(110, Math.min(W, H) * .08));
    const mx = W * .78, my = H * .26 - sc * .22, tilt = -.28;
    moonHit = my > -R ? { x: mx, y: my, r: R } : null;
    if (my > -R * 3) {
      const gl = ctx.createRadialGradient(mx, my, R * .6, mx, my, R * 3);
      gl.addColorStop(0, light ? (MONO ? 'rgba(255,255,255,.75)' : 'rgba(255,244,200,.6)')
                               : (MONO ? 'rgba(225,225,225,.18)' : 'rgba(190,225,255,.22)'));
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(mx - R * 3, my - R * 3, R * 6, R * 6);

      const th = RM ? 2 : t * .7;
      const ox = Math.cos(th) * R * 1.9, oy = Math.sin(th) * R * .42;
      const dot = [mx + ox * Math.cos(tilt) - oy * Math.sin(tilt), my + ox * Math.sin(tilt) + oy * Math.cos(tilt)];
      const dotFront = Math.sin(th) > 0;

      ctx.strokeStyle = lc + '.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(mx, my, R * 1.9, R * .42, tilt, Math.PI, Math.PI * 2); ctx.stroke();
      if (!dotFront) { ctx.fillStyle = lc + '.6)'; ctx.fillRect(dot[0] - 3, dot[1] - 3, 6, 6); }

      ctx.fillStyle = MONO ? '#f4f4f4' : light ? '#fff6d8' : '#f2f6ff';
      ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2); ctx.fill();
      if (!light) {
        ctx.fillStyle = MONO ? 'rgba(165,165,165,.35)' : 'rgba(160,185,220,.35)';
        for (const [cx2, cy2, cr] of [[-.3, -.2, .18], [.25, .15, .13], [-.05, .42, .1], [.38, -.35, .08]]) {
          ctx.beginPath(); ctx.arc(mx + cx2 * R, my + cy2 * R, cr * R, 0, Math.PI * 2); ctx.fill();
        }
      }

      ctx.strokeStyle = lc + '.9)';
      ctx.beginPath(); ctx.ellipse(mx, my, R * 1.9, R * .42, tilt, 0, Math.PI); ctx.stroke();
      if (dotFront) { ctx.fillStyle = lc + '1)'; ctx.fillRect(dot[0] - 3, dot[1] - 3, 6, 6); }
    }

    // floating wireframe polyhedra
    const band = H * 3.3;
    ctx.lineWidth = 1.25;
    for (const s of SHAPES) {
      const size = s.s * Math.min(W, H);
      let sy = s.y * H - sc * s.f;
      sy = ((sy + H * .4) % band + band) % band - H * .4;
      if (sy < -size * 2 || sy > H + size * 2) continue;
      const sx = s.x * W;
      const a = s.a + (RM ? 0 : t * s.va), b = s.b + (RM ? 0 : t * s.vb);
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const G = GEO[s.g];
      const pts = G.v.map(([x, y, z]) => {
        const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
        const y1 = y * cb - z1 * sb, z2 = y * sb + z1 * cb;
        const k = 1 / (1 + z2 * .22);
        return [sx + x1 * size * k, sy + y1 * size * k, z2];
      });
      for (const [i, j] of G.e) {
        const near = (1 - (pts[i][2] + pts[j][2]) / 2) / 2;
        ctx.strokeStyle = lc + (.3 + .45 * near).toFixed(2) + ')';
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
      }
      ctx.fillStyle = lc + '.9)';
      for (const p of pts) ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
    }

    // pixel snow: drifts down, sways a little, scrolls slightly slower than the page
    if (SNOW) {
      ctx.fillStyle = light ? (MONO ? '#8c8c8c' : `hsl(${HUE + 24},45%,60%)`) : '#ffffff';
      for (const f of flakes) {
        if (!RM) f.y += f.v * dt / H;
        if (f.y > 1.02) { f.y -= 1.04; f.x = Math.random(); }
        const x = (f.x + Math.sin(t * .6 + f.d) * .012 * f.z) * W;
        let y = (f.y * H - sc * f.z * .08) % H;
        if (y < 0) y += H;
        ctx.globalAlpha = .45 + .5 * f.z;
        ctx.fillRect(Math.round(x), Math.round(y), f.s, f.s);
      }
      ctx.globalAlpha = 1;
    }
  }

  // with reduced motion there's no loop — only redraw when something changes
  let pending = false;
  function requestDraw() {
    if (!RM || pending) return;
    pending = true;
    requestAnimationFrame(n => { pending = false; draw(n); });
  }
  function loop(now) { draw(now); requestAnimationFrame(loop); }

  addEventListener('resize', resize);
  resize();
  if (!RM) requestAnimationFrame(loop);

  /* ================= theme toggle ================= */
  const MOON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M10 1a7 7 0 1 0 5 11.5A6 6 0 0 1 10 1z"/></svg>';
  const SUN = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><rect x="5" y="5" width="6" height="6"/><rect x="7" y="0" width="2" height="3"/><rect x="7" y="13" width="2" height="3"/><rect x="0" y="7" width="3" height="2"/><rect x="13" y="7" width="3" height="2"/><rect x="2" y="2" width="2" height="2"/><rect x="12" y="2" width="2" height="2"/><rect x="2" y="12" width="2" height="2"/><rect x="12" y="12" width="2" height="2"/></svg>';
  const themeBtn = $('#themeBtn');
  function setTheme(t, save) {
    root.dataset.theme = t;
    themeBtn.innerHTML = t === 'dark' ? MOON : SUN;
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'switch to light mode' : 'switch to dark mode');
    if (save) { try { localStorage.setItem('aki-theme', t); } catch (e) {} }
    requestDraw();
  }
  themeBtn.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
  setTheme(root.dataset.theme === 'light' ? 'light' : 'dark', false);

  // easter egg: the moon (sun by day) in the sky also flips day/night
  const overMoon = e => moonHit && Math.hypot(e.clientX - moonHit.x, e.clientY - moonHit.y) <= moonHit.r &&
                        !e.target.closest('a, button, input, dialog, .win');
  document.addEventListener('click', e => { if (overMoon(e)) themeBtn.click(); });
  document.addEventListener('pointermove', e => { document.body.style.cursor = overMoon(e) ? 'pointer' : ''; }, { passive: true });

  /* ================= windows: drag by title bar (desktop), collapse ================= */
  const canDrag = matchMedia('(pointer: fine) and (min-width: 761px)');
  // where each window was last dropped, per page — survives reloads
  const posKey = win => `aki-pos:${location.pathname.split('/').pop() || 'index.html'}#${win.id}`;
  let zTop = 2;
  $$('.win').forEach(win => {
    const bar = win.querySelector('.bar'), btn = bar.querySelector('.min');
    let ox = 0, oy = 0, sx = 0, sy = 0, dragging = false;

    if (win.id) {
      try {
        const p = JSON.parse(localStorage.getItem(posKey(win)) || 'null');
        if (p && isFinite(p.x) && isFinite(p.y)) { ox = p.x; oy = p.y; }
      } catch (e) {}
    }
    // offsets only apply where dragging is possible (desktop); phones keep the plain stack
    const place = () => { win.style.translate = canDrag.matches && (ox || oy) ? `${ox}px ${oy}px` : ''; };
    place();
    canDrag.addEventListener('change', place);

    win.addEventListener('pointerdown', () => { win.style.zIndex = ++zTop; });

    bar.addEventListener('pointerdown', e => {
      if (!canDrag.matches || e.button !== 0 || e.target.closest('button, a')) return;
      dragging = true; sx = e.clientX - ox; sy = e.clientY - oy;
      bar.setPointerCapture(e.pointerId);
      win.classList.add('dragging');
    });
    bar.addEventListener('pointermove', e => {
      if (!dragging) return;
      ox = e.clientX - sx; oy = e.clientY - sy;
      win.style.translate = `${ox}px ${oy}px`;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      win.classList.remove('dragging');
      if (win.id) {
        try { localStorage.setItem(posKey(win), JSON.stringify({ x: Math.round(ox), y: Math.round(oy) })); } catch (e) {}
      }
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    // double-click a title bar to snap the window back (and forget its saved spot)
    bar.addEventListener('dblclick', e => {
      if (e.target.closest('button, a')) return;
      ox = oy = 0; win.style.translate = '';
      try { localStorage.removeItem(posKey(win)); } catch (e) {}
    });

    if (btn) {
      // collapsed windows stay collapsed on the next visit too
      const colKey = `aki-col:${location.pathname.split('/').pop() || 'index.html'}#${win.id}`;
      const setCollapsed = c => {
        win.classList.toggle('collapsed', c);
        btn.setAttribute('aria-expanded', String(!c));
        btn.textContent = c ? '+' : '–';
      };
      try { if (win.id && localStorage.getItem(colKey) === '1') setCollapsed(true); } catch (e) {}
      btn.addEventListener('click', () => {
        const c = !win.classList.contains('collapsed');
        setCollapsed(c);
        if (win.id) { try { c ? localStorage.setItem(colKey, '1') : localStorage.removeItem(colKey); } catch (e) {} }
      });
    }
  });

  /* ================= palette tint from the discord avatar ================= */
  // remembered so the next visit paints the right palette straight away (see the <head> script)
  function saveTint(v) { try { localStorage.setItem('aki-tint', String(v)); } catch (e) {} }

  function setHue(h) {
    HUE = h; MONO = false;
    root.classList.remove('mono');
    root.style.setProperty('--h', h);
    saveTint(h);
    requestDraw();
  }

  function setMono() {
    MONO = true;
    root.classList.add('mono');
    saveTint('mono');
    requestDraw();
  }

  function rgbToHs(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0];
    const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [Math.round(h * 60), Math.round(s * 100)];
  }

  // colourful avatar → tint everything that hue; grey avatar → monochrome
  function hueFromAvatar(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (avg < 30 || avg > 230) continue;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        if (!n) { setMono(); return; }
        const [h, s] = rgbToHs(r / n, g / n, b / n);
        if (s >= 18) setHue(h); else setMono();
      } catch (e) {}
    };
    img.src = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=48&h=48&fit=cover&output=png`;
  }

  let tinted = false;
  function applyAvatar(url) {
    const fav = $('#favicon');
    if (fav && fav.getAttribute('href') !== url) fav.href = url;
    if (!tinted) { tinted = true; hueFromAvatar(url); }
  }

  /* ================= setup photo slideshow (any page with #frame) ================= */
  // add/remove filenames here — order is shuffled on every load
  const PHOTOS = ['setup-desk.webp', 'setup-3.webp', 'setup-5.webp', 'setup-6.webp', 'setup-7.webp', 'setup-8.webp'];
  (function initSlideshow() {
    const frame = $('#frame');
    if (!frame) return;
    const order = PHOTOS.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // only the first photo loads right away; the rest wait until they're about to show (or the page is idle)
    const imgs = order.map((src, i) => {
      const im = new Image();
      im.dataset.src = src; im.alt = "aki's setup"; im.decoding = 'async';
      if (i === 0) { im.className = 'on'; im.src = src; }
      frame.appendChild(im);
      return im;
    });
    const ensure = i => { const im = imgs[i]; if (!im.getAttribute('src')) im.src = im.dataset.src; return im.dataset.src; };
    addEventListener('load', () => setTimeout(() => imgs.forEach((_, i) => ensure(i)), 1500), { once: true });
    let idx = 0, timer;
    function go(n) {
      idx = (n + imgs.length) % imgs.length;
      ensure(idx);
      ensure((idx + 1) % imgs.length);
      imgs.forEach((im, i) => im.classList.toggle('on', i === idx));
      $('#count').textContent = `${idx + 1} / ${imgs.length}`;
      restart();
    }
    function restart() {
      clearInterval(timer);
      if (!RM) timer = setInterval(() => go(idx + 1), 5000);
    }
    $('#prev').addEventListener('click', () => go(idx - 1));
    $('#next').addEventListener('click', () => go(idx + 1));
    go(0);

    // click (or enter/space on) the photo → full-size viewer you can flip through
    const dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', 'setup photos');
    dlg.innerHTML =
      '<div class="win shown lb-win">' +
        '<header class="bar"><span class="lb-title"></span>' +
          '<button class="min lb-close" type="button" aria-label="close photo viewer">×</button></header>' +
        '<div class="lb-body"><img class="lb-img" alt="">' +
          '<div class="ctrl"><button class="sq lb-prev" type="button" aria-label="previous photo">‹</button>' +
          '<span class="lb-count" aria-live="polite"></span>' +
          '<button class="sq lb-next" type="button" aria-label="next photo">›</button></div></div>' +
      '</div>';
    document.body.append(dlg);
    let lb = 0;
    const show = n => {
      lb = (n + imgs.length) % imgs.length;
      const img = dlg.querySelector('.lb-img');
      img.src = ensure(lb);
      img.alt = `aki's setup, photo ${lb + 1} of ${imgs.length}`;
      dlg.querySelector('.lb-title').textContent = `photo ${lb + 1}.jpg`;
      dlg.querySelector('.lb-count').textContent = `${lb + 1} / ${imgs.length}`;
    };
    const open = () => { clearInterval(timer); show(idx); dlg.showModal(); };
    dlg.querySelector('.lb-prev').addEventListener('click', () => show(lb - 1));
    dlg.querySelector('.lb-next').addEventListener('click', () => show(lb + 1));
    dlg.querySelector('.lb-close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });   // backdrop
    dlg.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') show(lb - 1);
      if (e.key === 'ArrowRight') show(lb + 1);
    });
    dlg.addEventListener('close', () => go(lb));   // slideshow carries on from the photo you stopped on

    frame.tabIndex = 0;
    frame.setAttribute('role', 'button');
    frame.setAttribute('aria-label', 'view setup photos full size');
    frame.addEventListener('click', open);
    frame.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  })();

  /* ================= boot intro: first page of a session only ================= */
  // the <head> script adds .booting (which hides the page) unless this session already booted
  if (root.classList.contains('booting')) {
    try { sessionStorage.setItem('aki-booted', '1'); } catch (e) {}
    const LINES = [
      'aki.os v2.0',
      'booting…',
      'loading peripherals ……… ok',
      'mounting /setup ……… ok',
      'connecting to discord ……… ok',
      'welcome back.'
    ];
    const boot = document.createElement('div');
    boot.className = 'fx-boot';
    boot.setAttribute('aria-hidden', 'true');
    const out = document.createElement('pre');
    boot.append(out);
    document.body.append(boot);
    let n = 0, done = false;
    const finish = () => {
      if (done) return;
      done = true;
      boot.classList.add('out');
      root.classList.remove('booting');
      setTimeout(() => boot.remove(), 500);
    };
    const step = () => {
      if (done) return;
      if (n < LINES.length) {
        out.textContent += (n ? '\n' : '') + LINES[n++];
        setTimeout(step, n === 1 ? 300 : 170);
      } else {
        setTimeout(finish, 420);
      }
    };
    step();
    // impatient? any click or key skips it
    addEventListener('pointerdown', finish, { once: true });
    addEventListener('keydown', finish, { once: true });
  }

  /* ================= effects: title glitch, film grain, vignette, fade-ups, page fade ================= */
  // the glitch copies of the hero title (css ::before/::after) read their text from here
  $$('.hero-title').forEach(h => { h.dataset.text = h.textContent.trim(); });

  // film grain: one random-noise tile, jittered around by css; plus a soft vignette
  (function addGrain() {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 160;
    const tctx = tile.getContext('2d'), noise = tctx.createImageData(160, 160);
    for (let i = 0; i < noise.data.length; i += 4) {
      const v = Math.random() * 255 | 0;
      noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = v;
      noise.data[i + 3] = 255;
    }
    tctx.putImageData(noise, 0, 0);
    const grain = document.createElement('div');
    grain.className = 'fx-grain';
    grain.style.backgroundImage = `url(${tile.toDataURL()})`;
    const vig = document.createElement('div');
    vig.className = 'fx-vig';
    [grain, vig].forEach(el => el.setAttribute('aria-hidden', 'true'));
    document.body.append(vig, grain);
  })();

  if (!RM) {
    // windows rise in as they scroll into view, a beat apart when several arrive together
    if ('IntersectionObserver' in window) {
      root.classList.add('reveal');
      const io = new IntersectionObserver(entries => {
        entries.filter(e => e.isIntersecting).forEach((e, i) => {
          e.target.style.setProperty('--rd', i * 80 + 'ms');
          e.target.classList.add('shown');
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: .06 });
      $$('.win').forEach(w => io.observe(w));
    }

    // fade the page out before going to the other page (same-site links only)
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a || a.target === '_blank' || e.defaultPrevented || e.button !== 0 ||
          e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault();
      root.classList.add('leaving');
      setTimeout(() => { location.href = url.href; }, 320);
    });
    // coming back with the back button restores a cached page — make sure it isn't still faded
    addEventListener('pageshow', e => { if (e.persisted) root.classList.remove('leaving'); });
  }

  return { RM, setHue, setMono, applyAvatar };
})();

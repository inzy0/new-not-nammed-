// Site-wide motion: page transitions, staggered reveal of cards as they enter the screen, and the moving background.
// Everything is skipped when the viewer asks for reduced motion.
export const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// Page transition: View Transitions API where available, CSS fade/slide otherwise.
export function transition(update) {
  if (reduced()) { update(); return; }
  if (document.startViewTransition && document.visibilityState === 'visible') {
    try { const t = document.startViewTransition(update); [t.ready, t.finished, t.updateCallbackDone].forEach(p => p?.catch(() => {})); return; } catch { /* fall through */ }
  }
  const v = document.getElementById('view');
  v.classList.remove('page-in'); update(); void v.offsetWidth; v.classList.add('page-in');
}

// Reveal: anything with .reveal (or the common card classes) fades up as it scrolls in, staggered.
const SEL = '.pcard, .card, .rcard, .ep, .story, .figgrid figure, .relrow, .person, .item, .pubcard, .nbsrc';
let io = null;
export function startReveal() {
  if (reduced() || !('IntersectionObserver' in window)) return;
  io = new IntersectionObserver(es => {
    let n = 0;
    for (const e of es) if (e.isIntersecting) { const el = e.target; el.style.transitionDelay = `${Math.min(n++, 6) * 55}ms`; el.classList.add('in'); io.unobserve(el); }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
  const scan = root => root.querySelectorAll?.(SEL).forEach(el => { if (!el.classList.contains('rv')) { el.classList.add('rv'); io.observe(el); } });
  scan(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches?.(SEL) && !n.classList.contains('rv')) { n.classList.add('rv'); io.observe(n); } scan(n); } })))
    .observe(document.getElementById('view'), { childList: true, subtree: true });
}

// Moving background: soft blobs that drift, plus a slow parallax with the pointer.
// ---------- living background ----------
// Styles: aurora (flowing ribbons), orbs (drifting colour fields), particles (constellation that reacts to the cursor),
// mesh (slow gradient wave). A soft glow follows the pointer. Settings live in Theme → Effects.
const FX_DEFAULT = { style: 'aurora', motion: 'full', glow: true, intensity: 1 };
export function fxSettings() { try { return { ...FX_DEFAULT, ...JSON.parse(localStorage.getItem('evd:fx') || '{}') }; } catch { return { ...FX_DEFAULT }; } }
export function setFx(patch) { const v = { ...fxSettings(), ...patch }; try { localStorage.setItem('evd:fx', JSON.stringify(v)); } catch {} applyFx(v); return v; }
let bgEl = null, glowEl = null, canvas = null, particlesOn = false;
function applyFx(v = fxSettings()) {
  const root = document.documentElement;
  const motion = reduced() ? 'off' : v.motion;
  root.dataset.fxStyle = v.style; root.dataset.fxMotion = motion; root.dataset.fxGlow = v.glow && motion !== 'off' ? 'on' : 'off';
  root.style.setProperty('--fx-int', String(Math.max(0.3, Math.min(1.6, Number(v.intensity) || 1))));
  root.style.setProperty('--fx-speed', motion === 'calm' ? '2.4' : '1');
  particlesOn = v.style === 'particles' && motion !== 'off';
  if (particlesOn) startParticles();
}
export function startBackground() {
  bgEl = document.createElement('div'); bgEl.className = 'bgfx'; bgEl.setAttribute('aria-hidden', 'true');
  bgEl.innerHTML = '<i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><b class="r1"></b><b class="r2"></b><b class="r3"></b><u class="mesh"></u>';
  canvas = document.createElement('canvas'); canvas.className = 'fxparticles'; canvas.setAttribute('aria-hidden', 'true');
  glowEl = document.createElement('div'); glowEl.className = 'cursorglow'; glowEl.setAttribute('aria-hidden', 'true');
  document.body.prepend(glowEl); document.body.prepend(canvas); document.body.prepend(bgEl);
  applyFx();
  // pointer: parallax + glow, eased toward the pointer every frame
  let tx = innerWidth / 2, ty = innerHeight / 3, gx = tx, gy = ty, run = false;
  const loop = () => {
    gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12;
    glowEl.style.transform = `translate(${gx}px, ${gy}px)`;
    bgEl.style.setProperty('--px', `${(gx / innerWidth - 0.5) * 34}px`); bgEl.style.setProperty('--py', `${(gy / innerHeight - 0.5) * 34}px`);
    pointer.x = gx; pointer.y = gy;
    if (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5) requestAnimationFrame(loop); else run = false;
  };
  addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; if (!run) { run = true; requestAnimationFrame(loop); } }, { passive: true });
}
const pointer = { x: -999, y: -999 };
function startParticles() {
  if (!canvas || canvas._running) return;
  canvas._running = true;
  const ctx = canvas.getContext('2d'); let W, H, pts;
  const size = () => { W = canvas.width = innerWidth * devicePixelRatio; H = canvas.height = innerHeight * devicePixelRatio; canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    const n = Math.min(110, Math.round(innerWidth * innerHeight / 16000)); pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: 1 + Math.random() * 1.8 })); };
  size(); addEventListener('resize', size, { passive: true });
  const tick = () => {
    if (!particlesOn || document.hidden) { canvas._running = false; ctx.clearRect(0, 0, W, H); return; }
    const css = getComputedStyle(document.documentElement); const a1 = css.getPropertyValue('--accent').trim() || '#E0563F', a2 = css.getPropertyValue('--accent-2').trim() || '#D174D2';
    const calm = document.documentElement.dataset.fxMotion === 'calm' ? 0.4 : 1, dpr = devicePixelRatio, mx = pointer.x * dpr, my = pointer.y * dpr;
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
      if (d2 < (140 * dpr) ** 2) { const f = 0.6 / Math.max(30, Math.sqrt(d2)); p.vx += dx * f * 0.05; p.vy += dy * f * 0.05; }
      p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx * calm * dpr + 0.05; p.y += p.vy * calm * dpr;
      if (p.x < 0) p.x += W; if (p.x > W) p.x -= W; if (p.y < 0) p.y += H; if (p.y > H) p.y -= H;
    }
    ctx.lineWidth = dpr * 0.7;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy, lim = (120 * dpr) ** 2;
      if (d < lim) { ctx.globalAlpha = (1 - d / lim) * 0.35; ctx.strokeStyle = a2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    for (const p of pts) { const near = Math.hypot(p.x - mx, p.y - my) < 160 * dpr; ctx.globalAlpha = near ? 0.95 : 0.6; ctx.fillStyle = near ? a1 : a2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * dpr * (near ? 1.8 : 1), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && particlesOn && !canvas._running) startParticles(); });
}

// 3D tilt + glare on cards (mouse/pen only; touch devices keep a flat, calm UI).
const TILT = '.pcard, .ep, .person-card, .minireel, .pstep, .planet-card, .pwu-badge';
export function startTilt() {
  if (reduced() || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let cur = null, raf = 0, last = null;
  const reset = el => { el.style.transform = ''; el.style.removeProperty('--gx'); el.style.removeProperty('--gy'); el.classList.remove('tilting'); };
  document.addEventListener('pointermove', e => {
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = last.target.closest?.(TILT);
      if (cur && cur !== el) reset(cur);
      cur = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (last.clientX - r.left) / r.width, py = (last.clientY - r.top) / r.height;
      const max = el.classList.contains('pcard') ? 2.2 : 5;
      el.classList.add('tilting');
      el.style.transform = `perspective(1100px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) translateY(-3px)`;
      el.style.setProperty('--gx', `${px * 100}%`); el.style.setProperty('--gy', `${py * 100}%`);
    });
  }, { passive: true });
  document.addEventListener('pointerleave', () => cur && reset(cur));
}

// Sliding pill under the active option of every segmented control (.seg).
export function startPills() {
  const place = seg => {
    let pill = seg.querySelector(':scope > .seg-pill');
    const on = seg.querySelector(':scope > button.on');
    if (!on) { pill?.remove(); seg.classList.remove('has-pill'); return; }
    if (!pill) { pill = document.createElement('span'); pill.className = 'seg-pill'; pill.setAttribute('aria-hidden', 'true'); seg.prepend(pill); seg.classList.add('has-pill'); }
    pill.style.width = `${on.offsetWidth}px`; pill.style.height = `${on.offsetHeight}px`;
    pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  };
  const scan = () => document.querySelectorAll('.seg').forEach(place);
  let t = 0;
  const later = () => { cancelAnimationFrame(t); t = requestAnimationFrame(scan); };
  new MutationObserver(later).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', later, { passive: true });
  document.fonts?.ready.then(later);
  document.addEventListener('scroll', e => { if (e.target.classList?.contains('seg')) later(); }, { capture: true, passive: true });
  later();
}

// Count numbers up when they appear (e.g. "8,465,021").
export function countUp(el, to) {
  if (reduced() || !Number.isFinite(to)) { el.textContent = to.toLocaleString(); return; }
  const t0 = performance.now(), dur = 1400;
  const step = now => { const k = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - k, 4); el.textContent = Math.round(to * e).toLocaleString(); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

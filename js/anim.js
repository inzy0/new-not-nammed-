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
export function startBackground() {
  const bg = document.createElement('div'); bg.className = 'bgfx'; bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = '<i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><span class="grain"></span>';
  document.body.prepend(bg);
  if (reduced()) return;
  let raf = 0;
  window.addEventListener('pointermove', e => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; const x = (e.clientX / innerWidth - 0.5) * 30, y = (e.clientY / innerHeight - 0.5) * 30; bg.style.setProperty('--px', `${x}px`); bg.style.setProperty('--py', `${y}px`); });
  }, { passive: true });
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

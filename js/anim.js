// Site-wide motion: page transitions, staggered reveal of cards as they enter the screen, and the moving background.
// Everything is skipped when the viewer asks for reduced motion.
export const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// Page transition: View Transitions API where available, CSS fade/slide otherwise.
export function transition(update) {
  if (reduced()) { update(); return; }
  if (document.startViewTransition) { try { document.startViewTransition(update); return; } catch { /* fall through */ } }
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

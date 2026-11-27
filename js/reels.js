// Reels: vertical, swipeable paper videos. Each reel is animated live from the paper itself:
// title → figure with the authors' caption → a verbatim finding → a verbatim limitation → citation.
// Only papers whose licence allows adaptations are shown. Tap the sound button to hear it (built-in voices).
import { h, store, splitSentences } from './util.js';
import { icon } from './icons.js';
import { searchArticles, getArticle, getFullText, abstractSections, keyOf } from './api.js';
import { studyDesign, reuse } from './verify.js';
import { domainByCode } from './ids.js';
import { figImg } from './figures.js';
import { coverDataUrl } from './imagegen.js';
import * as Pod from './podcast.js';
import { profile, bloomSVG } from './core.js';
import { likes, share, saveToLibrary, loadPosts } from './feed.js';
import { postSections, postEpisode } from './publish.js';

const view = document.getElementById('view');
const SLIDE_MS = 4200;

function pickLines(a, full) {
  const abs = abstractSections(a.abstractHtml);
  const secs = [...(abs.length ? abs : (full?.abstract || [])), ...(full?.sections || [])];
  const res = secs.filter(s => /result|finding|conclusion/i.test(s.title)).flatMap(s => splitSentences(s.text));
  const lim = secs.flatMap(s => splitSentences(s.text)).find(t => /\blimitation/i.test(t));
  return { finding: res[0] || splitSentences(secs[0]?.text || '')[0] || '', limitation: lim || '' };
}

function reelEl(a) {
  const key = keyOf(a);
  const slides = h('div', { class: 'rslides' });
  const bars = h('div', { class: 'rbars' });
  const bg = h('div', { class: 'rbg' }, h('img', { class: 'rfig cover-img kb', src: coverDataUrl(a, { w: 540, h: 960, withText: false }), alt: '' }));
  const el = h('section', { class: 'reel', dataset: { key } }, bg, h('div', { class: 'rshade' }), bars, slides);
  let data = { finding: '', limitation: '', fig: null }, built = false, timer = null, idx = 0;

  const slideDefs = () => [
    { k: studyDesign(a), t: a.title, s: `${a.journal} · ${a.year}`, cls: 'title' },
    data.fig ? { k: data.fig.label || 'Figure', t: (data.fig.caption || '').slice(0, 220), s: 'Caption written by the authors', cls: 'fig' } : null,
    data.finding ? { k: 'What they found', t: data.finding, s: 'Read word for word from the paper', cls: 'quote' } : null,
    { k: 'Limitation', t: data.limitation || 'No explicit limitation statement in the text available.', s: data.limitation ? 'Read word for word from the paper' : '', cls: 'quote' },
    { k: 'Source', t: a.doi ? `doi.org/${a.doi}` : (a.pmcid || `PMID ${a.pmid}`), s: `Licence ${reuse(a).label} · open the paper to read it all`, cls: 'cite' },
  ].filter(Boolean);

  async function build() {
    if (built) return; built = true;
    let full = null;
    if (a.pmcid && a.hasFullText) { try { full = await getFullText(a.pmcid); } catch { /* abstract only */ } }
    Object.assign(data, pickLines(a, full));
    data.fig = full?.figures?.find(f => f.href) || null;
    if (data.fig) { const img = figImg(a.pmcid, data.fig, 'rfig'); bg.replaceChildren(img); }
    render();
  }
  function render() {
    const defs = slideDefs();
    slides.replaceChildren(...defs.map((d, i) => h('div', { class: `rslide ${d.cls}` + (i === idx ? ' on' : '') },
      h('div', { class: 'rk' }, d.k), h('div', { class: 'rt' }, d.t), d.s ? h('div', { class: 'rs' }, d.s) : null)));
    bars.replaceChildren(...defs.map((_, i) => h('span', { class: i < idx ? 'done' : i === idx ? 'run' : '' }, h('i', { style: i === idx ? `animation-duration:${SLIDE_MS}ms` : '' }))));
  }
  function step() { const n = slideDefs().length; idx = (idx + 1) % n; render(); }
  el._play = async () => { await build(); if (timer) return; render(); timer = setInterval(step, SLIDE_MS); };
  el._stop = () => { clearInterval(timer); timer = null; };
  el.addEventListener('click', e => { if (e.target.closest('.rside, a, button')) return; step(); el._stop(); el._play(); });

  const likeB = h('button', { class: 'rbtn' + (likes.has(key) ? ' on' : ''), type: 'button', 'aria-label': 'Like', onclick: () => likeB.classList.toggle('on', likes.toggle(key)) }, icon('heart', 26), h('span', {}, 'Like'));
  el.append(h('div', { class: 'rside' }, likeB,
    h('button', { class: 'rbtn', type: 'button', 'aria-label': 'Listen', onclick: () => Pod.enqueue(a, 'brief', { playNow: true }) }, icon('volume', 26), h('span', {}, 'Listen')),
    h('button', { class: 'rbtn', type: 'button', 'aria-label': 'Save', onclick: () => saveToLibrary(a) }, icon('bookmark', 26), h('span', {}, 'Save')),
    h('button', { class: 'rbtn', type: 'button', 'aria-label': 'Share', onclick: () => share(a) }, icon('share', 26), h('span', {}, 'Share')),
    h('a', { class: 'rbtn', href: `#paper/${encodeURIComponent(key)}/discuss`, 'aria-label': 'Discuss' }, icon('chat', 26), h('span', {}, 'Discuss'))),
    h('a', { class: 'rinfo', href: `#paper/${encodeURIComponent(key)}` }, h('b', {}, (a.authors[0]?.name || a.authorString.split(',')[0] || '') + (a.authors.length > 1 ? ' et al.' : '')), h('span', {}, ' · open paper ›')));
  render();
  return el;
}

function postReel(p) {
  const secs = postSections(p);
  const sents = secs.flatMap(s => splitSentences(s.text).map(t => ({ t, src: s.title }))).filter(x => x.t.length > 40);
  const defs = [{ k: p.articleId ? 'Published with Evidara' : 'Evidara community', t: p.title, s: (p.authors || []).map(a => a.name).join(', '), cls: 'title' },
    ...sents.filter(x => /result|conclusion/i.test(x.src)).slice(0, 2).map(x => ({ k: x.src, t: x.t, s: 'From the article', cls: 'quote' })),
    { k: 'Read it', t: p.articleId || 'Community article', s: 'Open the article on Evidara', cls: 'cite' }];
  let idx = 0, timer = null;
  const slides = h('div', { class: 'rslides' }), bars = h('div', { class: 'rbars' });
  const bg = h('div', { class: 'rbg' }, p.images?.[0] ? h('img', { class: 'rfig', src: p.images[0].src, alt: '' }) : bloomSVG());
  const render = () => {
    slides.replaceChildren(...defs.map((d2, i) => h('div', { class: `rslide ${d2.cls}` + (i === idx ? ' on' : '') }, h('div', { class: 'rk' }, d2.k), h('div', { class: 'rt' }, d2.t), h('div', { class: 'rs' }, d2.s))));
    bars.replaceChildren(...defs.map((_, i) => h('span', { class: i < idx ? 'done' : i === idx ? 'run' : '' }, h('i', { style: i === idx ? `animation-duration:${SLIDE_MS}ms` : '' }))));
  };
  const el = h('section', { class: 'reel' }, bg, h('div', { class: 'rshade' }), bars, slides,
    h('div', { class: 'rside' }, h('button', { class: 'rbtn', type: 'button', 'aria-label': 'Listen', onclick: () => Pod.enqueueEpisode(postEpisode(p, 'short')) }, icon('volume', 26), h('span', {}, 'Listen')),
      h('a', { class: 'rbtn', href: `#post/${encodeURIComponent(p.id)}` }, icon('external', 24), h('span', {}, 'Open'))),
    h('a', { class: 'rinfo', href: `#post/${encodeURIComponent(p.id)}` }, h('b', {}, (p.authors?.[0]?.name || 'Evidara') + ((p.authors || []).length > 1 ? ' et al.' : '')), h('span', {}, ' · open article ›')));
  el._play = () => { if (timer) return; render(); timer = setInterval(() => { idx = (idx + 1) % defs.length; render(); }, SLIDE_MS); };
  el._stop = () => { clearInterval(timer); timer = null; };
  render();
  return el;
}

export async function reels([startKey]) {
  const pr = profile(); const d = domainByCode(pr.domain);
  const feed = h('div', { class: 'reels', tabindex: 0, 'aria-label': 'Reels: scroll or use arrow keys' });
  const side = h('aside', { class: 'reels-side' },
    h('h2', {}, 'Reels'),
    h('p', { class: 'meta' }, `Open-access papers in ${d ? d[1] : 'medicine'}, each animated from its own title, figure, finding, limitation and citation. Nothing is invented. Only papers whose licence allows adaptations appear.`),
    h('p', { class: 'meta' }, 'Scroll, swipe or press ↑/↓. Tap a reel to skip ahead. Listen plays it as a podcast.'),
    h('a', { class: 'btn small ghost', href: '#profile' }, 'Change domain'));
  view.replaceChildren(h('div', { class: 'reels-wrap' }, feed, side));
  let cursor = '*', busy = false, done = false;
  const seen = new Set();
  const io = new IntersectionObserver(es => es.forEach(e => (e.isIntersecting && e.intersectionRatio > 0.6 ? e.target._play?.() : e.target._stop?.())), { threshold: [0, 0.6, 1] });
  const add = a => { const k = keyOf(a); if (seen.has(k) || !reuse(a).derivatives) return; seen.add(k); const el = reelEl(a); feed.append(el); io.observe(el); };
  async function more() {
    if (busy || done) return; busy = true;
    try {
      const r = await searchArticles({ query: d ? d[2] : 'medicine', days: 60, cursor, pageSize: 15 });
      r.results.forEach(add);
      done = !r.next || r.next === cursor; cursor = r.next;
      if (!feed.children.length && !done) { busy = false; return more(); }
    } catch (e) {
      feed.append(h('div', { class: 'reel empty-reel' }, h('p', {}, `Could not load reels: ${e.message}`), h('button', { class: 'btn small', type: 'button', onclick: e2 => { e2.currentTarget.parentElement.remove(); busy = false; more(); } }, 'Retry')));
    } finally { busy = false; }
  }
  feed.addEventListener('scroll', () => { if (feed.scrollTop + feed.clientHeight * 3 > feed.scrollHeight) more(); }, { passive: true });
  feed.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); feed.scrollBy({ top: (e.key === 'ArrowDown' ? 1 : -1) * feed.clientHeight, behavior: 'smooth' }); }
  });
  if (startKey?.startsWith('post:')) { const p = (await loadPosts()).find(x => x.id === startKey.slice(5)); if (p) { const el = postReel(p); feed.append(el); io.observe(el); } }
  else if (startKey) { try { const a = await getArticle(startKey); if (a) add(a); } catch { /* continue with feed */ } }
  for (const p of (await loadPosts()).filter(x => !d || x.domain === d[0]).slice(0, 5)) { if (startKey === 'post:' + p.id) continue; const el = postReel(p); feed.append(el); io.observe(el); }
  await more();
  feed.focus({ preventScroll: true });
  const stopAll = () => { if (!document.body.contains(feed)) { feed.querySelectorAll('.reel').forEach(r => r._stop?.()); io.disconnect(); window.removeEventListener('hashchange', stopAll); } };
  window.addEventListener('hashchange', stopAll);
}

// Explore: live, infinite feed of open-access papers (Europe PMC), alphaXiv/Instagram style.
import { h, store, toast, copyText, splitSentences } from './util.js';
import { icon } from './icons.js';
import { DOMAINS, domainByCode } from './ids.js';
import { searchArticles, getArticle, getFullText, abstractSections, keyOf, openAccessTotal } from './api.js';
import { checks, score, studyDesign, reuse } from './verify.js';
import { STYLES as CITE } from './cite.js';
import { figImg } from './figures.js';
import { coverDataUrl, aiImages, coverChoice } from './imagegen.js';
import * as Pod from './podcast.js';
import * as Lib from './library.js';
import { profile, bloomSVG } from './core.js';
import { countUp } from './anim.js';
import { online, user, api, requireSignedIn, requireVerified } from './backend.js';

const view = document.getElementById('view');

// ---------- small shared pieces ----------
export const likes = {
  has: k => !!store.get('likes', {})[k],
  toggle(k) { const m = store.get('likes', {}); m[k] ? delete m[k] : (m[k] = 1); store.set('likes', m); return !!m[k]; },
  set(k, on) { const m = store.get('likes', {}); on ? (m[k] = 1) : delete m[k]; store.set('likes', m); },
};
// Like button behaviour shared by cards, paper pages and reels. Online: server toggle with a live count.
export async function toggleLike(k, btn) {
  if (online()) {
    if (!requireSignedIn('like papers')) return;
    try { const r = await api('/likes/' + encodeURIComponent(k), { method: 'POST' }); likes.set(k, r.liked); paintLike(btn, r.liked, r.count); } catch (e) { toast(e.message); }
    return;
  }
  paintLike(btn, likes.toggle(k));
}
export function paintLike(btn, on, count) {
  if (!btn) return;
  btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (count != null) { let c = btn.querySelector('.lc'); if (!c) { c = h('span', { class: 'lc' }); btn.append(c); } c.textContent = count ? String(count) : ''; }
}
// Fetch like counts for everything with data-like on the page.
export async function refreshLikeCounts(root = document) {
  if (!online()) return;
  const btns = [...root.querySelectorAll('[data-like]')]; if (!btns.length) return;
  const keys = [...new Set(btns.map(b => b.dataset.like))].slice(0, 60);
  try { const r = await api('/likes?keys=' + keys.map(encodeURIComponent).join(',')); btns.forEach(b => { const k = b.dataset.like; const mine = r.mine.includes(k); likes.set(k, mine); paintLike(b, mine, r.counts[k] || 0); }); } catch { /* ignore */ }
}
export const follows = { has: k => !!store.get('follows', {})[k], toggle(k, name) { const m = store.get('follows', {}); m[k] ? delete m[k] : (m[k] = name || k); store.set('follows', m); if (online() && user()) api('/follows/' + encodeURIComponent(k), { method: 'POST', body: { name } }).catch(() => {}); return !!m[k]; }, all: () => store.get('follows', {}) };

export async function share(a) {
  const url = `${location.origin}${location.pathname}#paper/${encodeURIComponent(keyOf(a))}`;
  try { if (navigator.share) { await navigator.share({ title: a.title, url }); return; } } catch { return; }
  copyText(url);
}
export function saveToLibrary(a) { Lib.add({ kind: 'reading', title: a.title, source: keyOf(a) }); toast('Saved to Library'); }

export function blurb(a, n = 2) {
  const abs = abstractSections(a.abstractHtml);
  const pref = abs.find(s => /result|finding|conclusion/i.test(s.title)) || abs[0];
  return pref ? splitSentences(pref.text).slice(0, n).join(' ') : '';
}

export function authorChips(a, max = 4) {
  const list = a.authors.slice(0, max).map(x => h('span', { class: 'achip', title: x.orcid ? `ORCID ${x.orcid}` : '' },
    h('span', { class: 'av' }, (x.name || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()), x.name,
    x.orcid ? h('span', { class: 'orcid', title: 'Has ORCID' }, icon('check', 12)) : null));
  if (a.authors.length > max) list.push(h('span', { class: 'achip more' }, `+${a.authors.length - max}`));
  if (!a.authors.length && a.authorString) list.push(h('span', { class: 'achip' }, a.authorString.split(',').slice(0, 3).join(',')));
  return h('div', { class: 'achips' }, ...list);
}

function actionBtn(name, label, onclick, on = false, text = '') {
  return h('button', { class: 'act' + (on ? ' on' : ''), type: 'button', 'aria-label': label, title: label, 'aria-pressed': on ? 'true' : 'false', onclick }, icon(name, 18), text ? h('span', {}, text) : null);
}

// Lazy figure loader: fetch full text only when the card scrolls near the viewport (max 3 at a time).
const lazyQ = []; let lazyActive = 0;
function pumpLazy() {
  while (lazyActive < 3 && lazyQ.length) {
    const job = lazyQ.shift(); lazyActive++;
    job().finally(() => { lazyActive--; pumpLazy(); });
  }
}
const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); const fn = e.target._load; if (fn) { lazyQ.push(fn); pumpLazy(); } }
}, { rootMargin: '1000px 0px' }) : null;

function mediaFor(a, tall = false) {
  const box = h('div', { class: 'media' + (tall ? ' tall' : '') }, h('div', { class: 'media-ph' }, bloomSVG(), h('span', {}, studyDesign(a))));
  const k = keyOf(a);
  const cover = async () => {
    const choice = coverChoice.get(k);
    if (choice?.ai != null) { const ai = await aiImages(k); if (ai[choice.ai]) { box.replaceChildren(h('img', { class: 'media-img cover-img kb', src: ai[choice.ai].src, alt: 'AI illustration of the study topic' }), h('div', { class: 'media-cap' }, h('b', {}, 'AI illustration'), ' · not from the paper')); return true; } }
    const src = coverDataUrl(a, tall ? { w: 540, h: 960 } : { w: 960, h: 540 });
    if (src) box.replaceChildren(h('img', { class: 'media-img cover-img', src, alt: `${studyDesign(a)} cover` }));
    return choice === 'design';
  };
  box._load = async () => {
    const pinned = await cover();
    if (pinned || !a.pmcid || !a.hasFullText) return;
    try {
      const full = await getFullText(a.pmcid);
      const fig = full.figures.find(f => f.href);
      if (!fig) return;
      box.replaceChildren(figImg(a.pmcid, fig, 'media-img'),
        h('div', { class: 'media-cap' }, h('b', {}, fig.label || 'Figure'), ' ', (fig.caption || '').slice(0, 180) + ((fig.caption || '').length > 180 ? '…' : '')));
    } catch { /* keep placeholder */ }
  };
  if (io) io.observe(box); else { lazyQ.push(box._load); pumpLazy(); }
  return box;
}

export function paperCard(a) {
  const key = keyOf(a);
  const sc = score(checks(a));
  const r = reuse(a);
  const href = `#paper/${encodeURIComponent(key)}`;
  const likeBtn = actionBtn('heart', 'Like', () => toggleLike(key, likeBtn), likes.has(key));
  likeBtn.dataset.like = key;
  return h('article', { class: 'pcard' },
    h('a', { class: 'ptitle', href }, a.title),
    authorChips(a),
    h('div', { class: 'pmeta' }, `${a.journal || 'Journal'} · ${a.date} · ${studyDesign(a)}`),
    h('div', { class: 'chips' }, h('span', { class: `chip ${sc.cls}` }, sc.label), a.source === 'PPR' ? h('span', { class: 'chip warn' }, 'Preprint') : null, h('span', { class: 'chip' }, r.label)),
    blurb(a) ? h('p', { class: 'pblurb' }, blurb(a), h('span', { class: 'src-tag' }, ' (from the abstract)')) : null,
    h('a', { href, class: 'media-link', 'aria-label': 'Open paper' }, mediaFor(a)),
    h('div', { class: 'actions' },
      likeBtn,
      actionBtn('bookmark', 'Save to library', () => saveToLibrary(a)),
      actionBtn('share', 'Share', () => share(a)),
      r.derivatives ? actionBtn('headphones', 'Listen (The Brief)', () => Pod.enqueue(a, 'brief', { playNow: true }), false, 'Listen') : null,
      r.derivatives ? h('a', { class: 'act', href: `#reels/${encodeURIComponent(key)}`, title: 'Watch as reel' }, icon('reels', 18), h('span', {}, 'Reel')) : null,
      h('a', { class: 'act', href: `${href}/discuss`, title: 'Discuss' }, icon('chat', 18), h('span', {}, 'Discuss')),
      h('span', { class: 'act-meta' }, `cited ${a.citedBy}`),
      actionBtn('external', 'Copy citation (Vancouver)', () => copyText(CITE.Vancouver(a)))));
}

// ---------- Explore ----------
const DESIGN_Q = { any: '', rct: ' AND PUB_TYPE:"Randomized Controlled Trial"', sr: ' AND (PUB_TYPE:"Systematic Review" OR PUB_TYPE:"Meta-Analysis")', review: ' AND PUB_TYPE:"Review"', case: ' AND PUB_TYPE:"Case Reports"', guide: ' AND PUB_TYPE:"Practice Guideline"' };
const HIGH = '(PUB_TYPE:"Randomized Controlled Trial" OR PUB_TYPE:"Systematic Review" OR PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Practice Guideline")';
const isoAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// Each feed states exactly how it is built (shown under the tabs). No hidden ranking.
export const FEEDS = [
  { id: 'foryou', name: 'For you', how: 'Your domains, newest first' },
  { id: 'all', name: 'All fields', how: 'Every field of health research, newest first' },
  { id: 'trending', name: 'Trending', how: 'Your domains, most cited in the last 90 days' },
  { id: 'mustread', name: 'Must-read', how: 'Guidelines, systematic reviews, meta-analyses and randomised trials in your domains from the last year, most cited first' },
  { id: 'gems', name: 'Underrated gems', how: 'High-evidence designs (trials, reviews, guidelines) from 1–3 years ago with 3 citations or fewer' },
  { id: 'preprints', name: 'Preprints', how: 'Not yet peer reviewed: newest preprints in your domains' },
  { id: 'india', name: 'India focus', how: 'Papers with an Indian affiliation in your domains, newest first' },
  { id: 'top', name: 'Top liked', how: 'Most liked by Evidara members in the last 7 days' },
  { id: 'liked', name: 'Liked', how: 'Papers you liked' },
  { id: 'community', name: 'Community', how: 'Posts published on Evidara after admin verification' },
];

function feedQuery(st, domains) {
  const doms = domains.map(c => domainByCode(c)).filter(Boolean);
  let base = doms.length ? doms.map(d => `(${d[2]})`).join(' OR ') : 'medicine OR health OR clinical OR disease OR patients';
  if (st.q) base = `(${base}) AND (${st.q})`;
  const f = st.tab;
  if (f === 'all') return { query: st.q || 'medicine OR health OR clinical OR disease OR patients OR nursing OR "public health"', days: st.days, sort: 'date' };
  if (f === 'trending') return { query: base, days: Math.max(st.days || 90, 90), sort: 'cited' };
  if (f === 'mustread') return { query: base, raw: ` AND ${HIGH}`, days: 365, sort: 'cited' };
  if (f === 'gems') return { query: base, raw: ` AND ${HIGH} AND CITED:[0 TO 3] AND FIRST_PDATE:[${isoAgo(1095)} TO ${isoAgo(365)}]`, days: 0, sort: 'date' };
  if (f === 'preprints') return { query: base, raw: ' AND SRC:PPR', days: st.days || 30, sort: 'date', openOnly: false };
  if (f === 'india') return { query: base, raw: ' AND AFF:"India"', days: st.days || 90, sort: 'date' };
  return { query: base, days: st.days, sort: 'date' };
}

export async function explore() {
  const pr = profile();
  const st = store.get('explore', {});
  Object.assign(st, { tab: st.tab || 'foryou', design: st.design || 'any', preprints: st.preprints ?? true, days: st.days ?? 30, feeds: st.feeds?.length ? st.feeds : [pr.domain] });
  if (!FEEDS.some(f => f.id === st.tab)) st.tab = 'foryou';
  const save = () => store.set('explore', st);
  const center = h('div', { class: 'center' }), rail = h('aside', { class: 'rail' });
  view.replaceChildren(h('div', { class: 'cols' }, center, rail));

  const q = h('input', { type: 'search', class: 'bigsearch', placeholder: 'Search millions of open-access papers, e.g. "sepsis biomarkers in children"', 'aria-label': 'Search papers', value: st.q || '' });
  const doSearch = () => { st.q = q.value.trim(); save(); load(true); };
  q.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  const searchRow = h('div', { class: 'searchrow' }, q, h('button', { class: 'searchbtn', type: 'button', 'aria-label': 'Search', onclick: doSearch }, icon('search', 20)));

  const stories = h('div', { class: 'stories', role: 'list', 'aria-label': 'Domains' });
  const tabs = h('div', { class: 'seg feeds', role: 'tablist' });
  const how = h('div', { class: 'how' });
  const drawStories = () => stories.replaceChildren(
    h('a', { class: 'story reelstory', href: '#reels', role: 'listitem' }, h('span', { class: 'ring2' }, icon('reels', 26)), h('span', { class: 'st-l' }, 'Reels')),
    ...[...new Set([...st.feeds, ...DOMAINS.map(d => d[0])])].slice(0, 18).map(c => {
      const d = domainByCode(c); const on = st.tab === 'foryou' && st.feeds.length === 1 && st.feeds[0] === c;
      return h('button', { class: 'story' + (on ? ' on' : ''), type: 'button', role: 'listitem', title: d[1], onclick: () => { st.feeds = [c]; st.tab = 'foryou'; save(); drawTabs(); drawStories(); load(true); paperOfTheDay(potd, st.feeds); } },
        h('span', { class: 'ring2' }, h('b', {}, c)), h('span', { class: 'st-l' }, d[1].split(/[ &/]/)[0]));
    }));
  const drawTabs = () => {
    tabs.replaceChildren(...FEEDS.map(f => h('button', { type: 'button', role: 'tab', class: f.id === st.tab ? 'on' : '', onclick: () => { st.tab = f.id; save(); drawTabs(); drawStories(); load(true); } }, f.name)));
    how.textContent = FEEDS.find(f => f.id === st.tab).how + (st.design !== 'any' && !['mustread', 'gems', 'liked', 'community'].includes(st.tab) ? ' · design filter on' : '');
  };
  const filt = h('div', { class: 'filterbox', hidden: true });
  const design = h('select', { 'aria-label': 'Study design' }, ...[['any', 'Any design'], ['rct', 'Randomised trials'], ['sr', 'Systematic reviews / meta-analyses'], ['review', 'Reviews'], ['case', 'Case reports'], ['guide', 'Guidelines']].map(([v, l]) => h('option', { value: v, selected: v === st.design }, l)));
  const days = h('select', { 'aria-label': 'Time window' }, ...[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last year'], [0, 'Any time']].map(([v, l]) => h('option', { value: v, selected: v === st.days }, l)));
  const pp = h('input', { type: 'checkbox', checked: st.preprints, 'aria-label': 'Include preprints' });
  const feedsBox = h('div', { class: 'chips' });
  const drawFeeds = () => feedsBox.replaceChildren(...DOMAINS.map(([c, l]) => h('button', { type: 'button', class: 'chip pick' + (st.feeds.includes(c) ? ' on' : ''), onclick: () => {
    st.feeds = st.feeds.includes(c) ? st.feeds.filter(x => x !== c) : [...st.feeds, c]; if (!st.feeds.length) st.feeds = [pr.domain]; save(); drawFeeds(); drawStories(); } }, l)));
  filt.append(h('div', { class: 'row' }, design, days, h('label', { class: 'row', style: 'gap:6px' }, pp, 'Include preprints'),
    h('button', { class: 'btn small', type: 'button', onclick: () => { st.design = design.value; st.days = +days.value; st.preprints = pp.checked; save(); filt.hidden = true; drawTabs(); load(true); } }, 'Apply')),
    h('div', { class: 'meta', style: 'margin:12px 0 6px' }, 'Your domains (used by For you, Trending, Must-read, Underrated gems, Preprints and India focus):'), feedsBox);
  const toolbar = h('div', { class: 'toolbar' },
    h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Filters and domains', title: 'Filters and domains', onclick: () => (filt.hidden = !filt.hidden) }, icon('filter', 18)),
    tabs);

  const status = h('div', { class: 'meta', style: 'margin:6px 2px 10px' });
  const newPill = h('button', { class: 'newpill', type: 'button', hidden: true, onclick: () => { newPill.hidden = true; load(true); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  const list = h('div', { class: 'plist' });
  const sentinel = h('div', { class: 'sentinel' }, h('span', { class: 'spinner' }));
  const hero = compactHero();
  const potd = h('div', {});
  drawStories(); drawTabs(); drawFeeds();
  center.append(searchRow, stories, toolbar, how, filt, newPill, hero.el, potd, status, list, sentinel);
  paperOfTheDay(potd, st.feeds);
  communityBlock(potd, st.feeds);

  let cursor = '*', busy = false, done = false, topId = null, gen = 0, count = 0, reelBuf = [];
  const addReelStrip = () => {
    const items = reelBuf.splice(0, 8);
    if (items.length < 3) { reelBuf.unshift(...items); return; }
    list.append(h('section', { class: 'reelstrip' }, h('div', { class: 'rhead' }, h('b', {}, 'Reels from your feed'), h('a', { href: '#reels' }, 'Watch all ›')),
      h('div', { class: 'hscroll reels-h' }, ...items.map(a => h('a', { class: 'minireel', href: `#reels/${encodeURIComponent(keyOf(a))}` }, mediaFor(a, true), h('span', { class: 'mr-t' }, a.title))))));
  };
  async function load(reset) {
    if (busy && !reset) return;
    const my = ++gen;
    if (reset) { cursor = '*'; done = false; count = 0; reelBuf = []; list.replaceChildren(...[1, 2, 3].map(() => h('div', { class: 'pcard skeleton' }))); }
    busy = true; sentinel.hidden = false;
    try {
      if (['liked', 'community', 'top'].includes(st.tab)) { await loadLocal(st.tab, my); return; }
      const fq = feedQuery(st, st.feeds);
      let raw = fq.raw || '';
      if (!['mustread', 'gems'].includes(st.tab)) raw += DESIGN_Q[st.design] || '';
      if (!st.preprints && st.tab !== 'preprints') raw += ' NOT SRC:PPR';
      const r = await searchArticles({ query: fq.query, raw, days: fq.days, cursor, sort: fq.sort, pageSize: 12, openOnly: fq.openOnly !== false });
      if (my !== gen) return;
      if (reset) { list.replaceChildren(); topId = r.results[0]?.id || null; hero.set(r.results.slice(0, 6)); }
      status.textContent = `${r.hitCount.toLocaleString()} papers in this feed`;
      for (const a of r.results) {
        list.append(paperCard(a)); count++;
        if (reuse(a).derivatives) reelBuf.push(a);
        if (count % 6 === 0) addReelStrip();
      }
      refreshLikeCounts(list);
      if (!r.results.length && reset) list.append(h('div', { class: 'empty' }, 'Nothing here yet. Widen the time window or add domains.'));
      done = !r.next || r.next === cursor || r.results.length < 12;
      cursor = r.next;
    } catch (e) {
      if (my !== gen) return;
      const retry = h('button', { class: 'btn small', type: 'button', onclick: () => { err.remove(); load(reset); } }, 'Retry');
      const err = h('div', { class: 'empty' }, `Could not load papers: ${e.message}. `, retry);
      if (reset) list.replaceChildren(err); else list.append(err);
    } finally { if (my === gen) { busy = false; sentinel.hidden = done; } }
  }
  async function loadLocal(kind, my) {
    done = true;
    if (kind === 'top') {
      if (!online()) { list.replaceChildren(h('div', { class: 'empty' }, 'Community likes appear when Evidara accounts are connected.')); status.textContent = ''; return; }
      const top = ((await api('/likes/top?days=7')).top || []).filter(t => !t.key.startsWith('post:')).slice(0, 20);
      if (my !== gen) return;
      list.replaceChildren(...(top.length ? [] : [h('div', { class: 'empty' }, 'No likes in the last 7 days yet.')]));
      status.textContent = `${top.length} most-liked papers this week`;
      for (const t of top) { try { const a = await getArticle(t.key); if (my !== gen) return; if (a) list.append(paperCard(a)); } catch { /* skip */ } }
      refreshLikeCounts(list);
    } else if (kind === 'liked') {
      let keys = Object.keys(store.get('likes', {}));
      if (online() && user()) { try { keys = (await api('/likes/mine')).keys; } catch { /* local */ } }
      list.replaceChildren(...(keys.length ? [] : [h('div', { class: 'empty' }, 'Papers you like appear here. Tap ♥ on any paper.')]));
      status.textContent = `${keys.length} liked on this device`;
      for (const k of keys.slice(0, 40)) { try { const a = await getArticle(k); if (my !== gen) return; if (a) list.append(paperCard(a)); } catch { /* skip */ } }
    } else {
      const posts = await loadPosts();
      if (my !== gen) return;
      status.textContent = `${posts.length} verified community post${posts.length === 1 ? '' : 's'}`;
      list.replaceChildren(...(posts.length ? posts.map(postCard) : [h('div', { class: 'empty' }, 'No published community posts yet. Write one in Publish; it appears here after admin verification.')]));
    }
  }
  if ('IntersectionObserver' in window) {
    const so = new IntersectionObserver(es => { if (es[0].isIntersecting && !busy && !done && list.children.length) load(false); }, { rootMargin: '1400px 0px' });
    so.observe(sentinel);
  }
  const poll = setInterval(async () => {
    if (!document.body.contains(list)) { clearInterval(poll); return; }
    if (!['foryou', 'all', 'preprints', 'india'].includes(st.tab)) return;
    try {
      const fq = feedQuery(st, st.feeds);
      const r = await searchArticles({ query: fq.query, raw: fq.raw || '', days: 3, pageSize: 5, openOnly: fq.openOnly !== false });
      const idx = r.results.findIndex(x => x.id === topId);
      const fresh = idx < 0 ? r.results.length : idx;
      if (fresh > 0 && topId) { newPill.textContent = `↑ ${fresh}${fresh >= 5 ? '+' : ''} new paper${fresh > 1 ? 's' : ''}`; newPill.hidden = false; }
    } catch { /* ignore */ }
  }, 180000);
  buildRail(rail, list);
  load(true);
}

// Paper of the day: high-evidence open-access papers from your domains (last 30 days) whose licence allows
// audio/video; one is picked per calendar day (the same pick all day for the same domains).
async function paperOfTheDay(box, feeds) {
  const day = new Date().toISOString().slice(0, 10);
  const doms = feeds.map(c => domainByCode(c)).filter(Boolean);
  const query = doms.map(d => `(${d[2]})`).join(' OR ') || 'medicine';
  try {
    const r = await searchArticles({ query, raw: ` AND ${HIGH}`, days: 30, pageSize: 25, sort: 'cited' });
    const pool = r.results.filter(a => reuse(a).derivatives);
    if (!pool.length) { box.replaceChildren(); return; }
    let hsh = 0; for (const c of day + feeds.join()) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
    const a = pool[hsh % Math.min(pool.length, 10)];
    const card = paperCard(a);
    card.classList.add('potd');
    card.prepend(h('div', { class: 'potd-tag' }, icon('studio', 16), ` Paper of the day · ${new Date().toLocaleDateString([], { day: 'numeric', month: 'short' })}`));
    box.replaceChildren(card);
  } catch { box.replaceChildren(); }
}

async function communityBlock(after, feeds) {
  const posts = (await loadPosts()).filter(p => feeds.includes(p.domain)).slice(0, 3);
  if (!posts.length) return;
  after.after(h('section', { class: 'reelstrip commblock' }, h('div', { class: 'rhead' }, h('b', {}, 'From the Evidara community'), h('a', { href: '#publish-with-us' }, 'Publish with us ›')), ...posts.map(postCard)));
}

let postsCache = null;
export function resetPosts() { postsCache = null; }
export async function loadPosts() {
  if (postsCache) return postsCache;
  try { const r = await fetch('data/posts.json', { cache: 'no-cache' }); postsCache = r.ok ? await r.json() : []; } catch { postsCache = []; }
  if (!Array.isArray(postsCache)) postsCache = [];
  if (online()) { try { const srv = (await api('/posts?limit=100')).posts || []; const ids = new Set(srv.map(p => p.id)); postsCache = [...srv, ...postsCache.filter(p => !ids.has(p.id))]; } catch { /* static list only */ } }
  // On the admin's own device, approved-but-not-yet-exported posts show too (marked as local preview).
  try { const { idb } = await import('./idb.js'); const local = await idb.get('adm:posts'); if (Array.isArray(local)) { const ids = new Set(postsCache.map(p => p.id)); local.forEach(p => { if (!ids.has(p.id)) postsCache.push({ ...p, localPreview: true }); }); } } catch { /* none */ }
  return postsCache;
}
const absText = p => typeof p.abstract === 'string' ? p.abstract : Object.values(p.abstract || {}).filter(Boolean).join(' ');
export function postCard(p) {
  return h('article', { class: 'pcard pubcard' },
    h('div', { class: 'potd-tag' }, icon('check', 14), p.articleId ? ` Published with Evidara · ${p.articleId}` : ' Verified community post', p.localPreview ? ' · local preview (not exported yet)' : ''),
    p.images?.[0] ? h('a', { href: `#post/${encodeURIComponent(p.id)}`, class: 'media-link' }, h('div', { class: 'media' }, h('img', { class: 'media-img', src: p.images[0].src, alt: p.images[0].alt || '' }))) : null,
    h('a', { class: 'ptitle', href: `#post/${encodeURIComponent(p.id)}` }, p.title),
    h('div', { class: 'achips' }, ...(p.authors || []).map(x => h('span', { class: 'achip' }, h('span', { class: 'av' }, (x.name || '?').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()), x.name, x.memberId ? h('span', { class: 'idbadge sm' }, x.memberId) : null))),
    h('div', { class: 'pmeta' }, `${p.type || 'Article'} · ${p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : ''}`),
    absText(p) ? h('p', { class: 'pblurb' }, absText(p).slice(0, 320) + (absText(p).length > 320 ? '…' : '')) : null,
    h('div', { class: 'chips' }, ...(p.keywords || []).slice(0, 6).map(k => h('span', { class: 'chip' }, k))));
}

function compactHero() {
  const ring = h('div', { class: 'ring' }, '01'), ghost = h('div', { class: 'ghost' }, '02');
  const copy = h('div', { class: 'hero-copy' }, 'Loading…');
  let items = [], i = 0;
  const show = () => {
    if (!items.length) return;
    const a = items[i];
    ring.textContent = String(i + 1).padStart(2, '0'); ghost.textContent = String(((i + 1) % items.length) + 1).padStart(2, '0');
    copy.replaceChildren(h('a', { href: `#paper/${encodeURIComponent(keyOf(a))}` }, a.title), h('span', {}, `${a.journal} · ${studyDesign(a)}`));
  };
  const el = h('section', { class: 'hero compact' },
    h('div', { class: 'bloom' }, bloomSVG()),
    h('div', { class: 'hero-left' }, h('div', { class: 'kicker' }, new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })),
      h('h1', {}, 'Daily', h('br'), 'Evidence'),
      h('div', { class: 'arrows' },
        h('button', { class: 'circle-btn', type: 'button', 'aria-label': 'Previous paper', onclick: () => { if (items.length) { i = (i - 1 + items.length) % items.length; show(); } } }, '←'),
        h('button', { class: 'circle-btn', type: 'button', 'aria-label': 'Next paper', onclick: () => { if (items.length) { i = (i + 1) % items.length; show(); } } }, '→'))),
    h('div', { class: 'hero-right' }, h('div', { class: 'numeral' }, ring, ghost), copy));
  return { el, set(list) { items = list; i = 0; if (items.length) show(); else copy.textContent = 'No papers in this window.'; } };
}

function buildRail(rail, list) {
  const total = h('b', {}, '…');
  openAccessTotal().then(n => countUp(total, n)).catch(() => (total.textContent = 'Millions'));
  const people = h('div', {});
  const drawPeople = () => {
    const seen = new Map();
    list.querySelectorAll('.achip[title^="ORCID"]').forEach(ch => {
      const orcid = ch.title.replace('ORCID ', ''); const name = ch.childNodes[1]?.textContent || '';
      if (!seen.has(orcid) && seen.size < 5) seen.set(orcid, name);
    });
    if (!seen.size) { people.replaceChildren(h('div', { class: 'meta' }, 'Authors with an ORCID appear here as the feed loads.')); return; }
    people.replaceChildren(...[...seen].map(([orcid, name]) => {
      const fb = h('button', { class: 'follow' + (follows.has(orcid) ? ' on' : ''), type: 'button', onclick: () => { const on = follows.toggle(orcid, name); fb.classList.toggle('on', on); fb.textContent = on ? 'Following' : '+ Follow'; } }, follows.has(orcid) ? 'Following' : '+ Follow');
      return h('div', { class: 'person' }, h('span', { class: 'av lg' }, name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()),
        h('a', { href: `#researcher/${encodeURIComponent('orcid:' + orcid)}` }, h('b', {}, name), h('div', { class: 'meta' }, `ORCID ${orcid}`)), fb);
    }));
  };
  if ('MutationObserver' in window) new MutationObserver(() => drawPeople()).observe(list, { childList: true });
  drawPeople();
  const q = Pod.state();
  rail.append(
    h('div', { class: 'rcard' }, h('div', { class: 'meta' }, 'Searchable right now'), h('div', { class: 'bignum' }, total), h('div', { class: 'meta' }, 'open-access papers in Europe PMC, loaded live as you scroll.')),
    h('div', { class: 'rcard' }, h('div', { class: 'rhead' }, h('b', {}, 'Researchers in your feed'), h('a', { href: '#people' }, 'See all')), people,
      h('div', { class: 'meta', style: 'margin-top:10px' }, 'Are you a researcher? ', h('a', { href: '#profile' }, 'Create your profile →'))),
    h('div', { class: 'rcard' }, h('div', { class: 'rhead' }, h('b', {}, 'Explore more')),
      h('a', { class: 'rlink', href: '#reels' }, icon('reels', 18), ' Reels: papers as short videos'),
      h('a', { class: 'rlink', href: '#podcasts' }, icon('podcast', 18), ` Podcasts${q.queue.length ? ` · ${q.queue.length} queued` : ''}`),
      h('a', { class: 'rlink', href: '#studio' }, icon('studio', 18), ' Studio: prompts for images, video, audio')),
    h('div', { class: 'rfoot' }, 'Data: Europe PMC, OpenAlex, PMC Open Access archive. Each article\'s licence applies. No patient data, ever.'));
}

// Explore: live, infinite feed of open-access papers (Europe PMC), alphaXiv/Instagram style.
import { h, store, toast, copyText, splitSentences } from './util.js';
import { icon } from './icons.js';
import { DOMAINS, domainByCode } from './ids.js';
import { searchArticles, getFullText, abstractSections, keyOf, openAccessTotal } from './api.js';
import { checks, score, studyDesign, reuse } from './verify.js';
import { STYLES as CITE } from './cite.js';
import { figImg } from './figures.js';
import * as Pod from './podcast.js';
import * as Lib from './library.js';
import { profile, bloomSVG } from './core.js';

const view = document.getElementById('view');

// ---------- small shared pieces ----------
export const likes = { has: k => !!store.get('likes', {})[k], toggle(k) { const m = store.get('likes', {}); m[k] ? delete m[k] : (m[k] = 1); store.set('likes', m); return !!m[k]; } };
export const follows = { has: k => !!store.get('follows', {})[k], toggle(k, name) { const m = store.get('follows', {}); m[k] ? delete m[k] : (m[k] = name || k); store.set('follows', m); return !!m[k]; }, all: () => store.get('follows', {}) };

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
}, { rootMargin: '600px 0px' }) : null;

function mediaFor(a) {
  const box = h('div', { class: 'media' }, h('div', { class: 'media-ph' }, bloomSVG(), h('span', {}, studyDesign(a))));
  if (!a.pmcid || !a.hasFullText) return box;
  box._load = async () => {
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
  const likeBtn = actionBtn('heart', 'Like', () => { const on = likes.toggle(key); likeBtn.classList.toggle('on', on); likeBtn.setAttribute('aria-pressed', on); }, likes.has(key));
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

export async function explore() {
  const pr = profile();
  const st = store.get('explore', { tab: 'foryou', design: 'any', preprints: true, days: 30, feeds: [pr.domain] });
  const save = () => store.set('explore', st);
  const center = h('div', { class: 'center' }), rail = h('aside', { class: 'rail' });
  view.replaceChildren(h('div', { class: 'cols' }, center, rail));

  // search
  const q = h('input', { type: 'search', class: 'bigsearch', placeholder: 'Search millions of open-access papers, e.g. "sepsis biomarkers in children"', 'aria-label': 'Search papers', value: st.q || '' });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { st.q = q.value.trim(); save(); load(true); } });
  const searchRow = h('div', { class: 'searchrow' }, q, h('button', { class: 'searchbtn', type: 'button', 'aria-label': 'Search', onclick: () => { st.q = q.value.trim(); save(); load(true); } }, icon('search', 20)));

  // tabs + filter
  const tabDefs = [['foryou', 'For you'], ['trending', 'Trending'], ['latest', 'Latest (all)']];
  const tabs = h('div', { class: 'seg' }, ...tabDefs.map(([k, l]) => h('button', { type: 'button', class: k === st.tab ? 'on' : '', onclick: e => { st.tab = k; save(); tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); load(true); } }, l)));
  const filt = h('div', { class: 'filterbox', hidden: true });
  const design = h('select', { 'aria-label': 'Study design' }, ...[['any', 'Any design'], ['rct', 'Randomised trials'], ['sr', 'Systematic reviews / meta-analyses'], ['review', 'Reviews'], ['case', 'Case reports'], ['guide', 'Guidelines']].map(([v, l]) => h('option', { value: v, selected: v === st.design }, l)));
  const days = h('select', { 'aria-label': 'Time window' }, ...[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last year'], [0, 'Any time']].map(([v, l]) => h('option', { value: v, selected: v === st.days }, l)));
  const pp = h('input', { type: 'checkbox', checked: st.preprints, 'aria-label': 'Include preprints' });
  const feedsBox = h('div', { class: 'chips' });
  const drawFeeds = () => feedsBox.replaceChildren(...DOMAINS.map(([c, l]) => h('button', { type: 'button', class: 'chip pick' + (st.feeds.includes(c) ? ' on' : ''), onclick: () => {
    st.feeds = st.feeds.includes(c) ? st.feeds.filter(x => x !== c) : [...st.feeds, c]; if (!st.feeds.length) st.feeds = [pr.domain]; save(); drawFeeds(); } }, l)));
  drawFeeds();
  filt.append(h('div', { class: 'row' }, design, days, h('label', { class: 'row', style: 'gap:6px' }, pp, 'Include preprints'),
    h('button', { class: 'btn small', type: 'button', onclick: () => { st.design = design.value; st.days = +days.value; st.preprints = pp.checked; save(); filt.hidden = true; load(true); } }, 'Apply')),
    h('div', { class: 'meta', style: 'margin:12px 0 6px' }, 'Your feeds ("For you" and "Trending" combine these domains):'), feedsBox);
  const toolbar = h('div', { class: 'toolbar' },
    h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Filters and feeds', title: 'Filters and feeds', onclick: () => (filt.hidden = !filt.hidden) }, icon('filter', 18)),
    tabs, h('button', { class: 'btn small ghost', type: 'button', onclick: () => (filt.hidden = !filt.hidden) }, '+ Feeds'));

  const status = h('div', { class: 'meta', style: 'margin:6px 2px 10px' });
  const newPill = h('button', { class: 'newpill', type: 'button', hidden: true, onclick: () => { newPill.hidden = true; load(true); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  const list = h('div', { class: 'plist' });
  const sentinel = h('div', { class: 'sentinel' });
  const hero = compactHero();
  center.append(searchRow, toolbar, filt, newPill, hero.el, status, list, sentinel);

  let cursor = '*', busy = false, done = false, topId = null, gen = 0;
  const buildQuery = () => {
    const doms = st.tab === 'latest' ? [] : st.feeds.map(c => domainByCode(c)).filter(Boolean);
    let base = doms.length ? doms.map(d => `(${d[2]})`).join(' OR ') : '';
    if (st.q) base = base ? `(${base}) AND (${st.q})` : st.q;
    if (!base) base = 'medicine OR health OR clinical OR disease OR patients';
    return base;
  };
  async function load(reset) {
    if (busy && !reset) return;
    const my = ++gen;
    if (reset) { cursor = '*'; done = false; list.replaceChildren(...[1, 2, 3].map(() => h('div', { class: 'pcard skeleton' }))); }
    busy = true;
    try {
      const sort = st.tab === 'trending' ? 'cited' : 'date';
      const daysWin = st.tab === 'trending' ? Math.max(st.days || 90, 90) : st.days;
      let query = buildQuery() + (DESIGN_Q[st.design] || '');
      if (!st.preprints) query += ' NOT SRC:PPR';
      const r = await searchArticles({ query, days: daysWin, cursor, sort, pageSize: 12 });
      if (my !== gen) return;
      if (reset) { list.replaceChildren(); topId = r.results[0]?.id || null; hero.set(r.results.slice(0, 6)); }
      status.textContent = `${r.hitCount.toLocaleString()} open-access papers in this feed · ${st.tab === 'trending' ? 'most cited in the last ' + daysWin + ' days' : 'newest first'} · no hidden ranking`;
      r.results.forEach(a => list.append(paperCard(a)));
      if (!r.results.length && reset) list.append(h('div', { class: 'empty' }, 'Nothing here yet. Widen the time window or add feeds.'));
      done = !r.next || r.next === cursor || r.results.length < 12;
      cursor = r.next;
    } catch (e) {
      if (my !== gen) return;
      const retry = h('button', { class: 'btn small', type: 'button', onclick: () => { err.remove(); load(reset); } }, 'Retry');
      const err = h('div', { class: 'empty' }, `Could not load papers: ${e.message}. `, retry);
      if (reset) list.replaceChildren(err); else list.append(err);
    } finally { if (my === gen) busy = false; }
  }
  if ('IntersectionObserver' in window) {
    const so = new IntersectionObserver(es => { if (es[0].isIntersecting && !busy && !done && list.children.length) load(false); }, { rootMargin: '1200px 0px' });
    so.observe(sentinel);
  }
  // live: check for newer papers every 3 minutes while this page is open
  const poll = setInterval(async () => {
    if (!document.body.contains(list) || st.tab === 'trending') { if (!document.body.contains(list)) clearInterval(poll); return; }
    try {
      const r = await searchArticles({ query: buildQuery() + (DESIGN_Q[st.design] || ''), days: 3, pageSize: 5 });
      const idx = r.results.findIndex(x => x.id === topId);
      const fresh = idx < 0 ? r.results.length : idx;
      if (fresh > 0 && topId) { newPill.textContent = `↑ ${fresh}${fresh >= 5 ? '+' : ''} new paper${fresh > 1 ? 's' : ''}`; newPill.hidden = false; }
    } catch { /* ignore */ }
  }, 180000);

  buildRail(rail, list);
  load(true);
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
  openAccessTotal().then(n => (total.textContent = n.toLocaleString())).catch(() => (total.textContent = 'millions of'));
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

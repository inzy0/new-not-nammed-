// Paper page (alphaXiv /abs style, landscape): Overview · Read paper · Figures · Author statements · Discuss.
import { h, store, toast, copyText, download, spinner, splitSentences, uid } from './util.js';
import { icon } from './icons.js';
import { getArticle, getFullText, abstractSections, keyOf, relatedPapers, articleKeyFromWork, openAccessLink } from './api.js';
import { checks, score, studyDesign, reuse } from './verify.js';
import { STYLES as CITE } from './cite.js';
import { figImg, pdfUrl, figCandidates } from './figures.js';
import { videoPlayer, paperSlides } from './vplayer.js';
import { idb } from './idb.js';
import * as Audio from './audio.js';
import * as Pod from './podcast.js';
import * as Vid from './video.js';
import * as Lib from './library.js';
import { theme, updateQuotaLine, profile, bloomSVG } from './core.js';
import { authorChips, likes, share, saveToLibrary } from './feed.js';

const view = document.getElementById('view');
const TABS = [['overview', 'Overview'], ['read', 'Read paper'], ['figures', 'Figures'], ['authors', 'Author statements'], ['discuss', 'Discuss']];

export async function paper([key, tabArg]) {
  view.replaceChildren(spinner('Loading paper'));
  let a;
  try { a = await getArticle(key); } catch (e) {
    view.replaceChildren(h('div', { class: 'empty' }, `Could not load this paper: ${e.message}. `, h('button', { class: 'btn small', type: 'button', onclick: () => paper([key, tabArg]) }, 'Retry'))); return;
  }
  if (!a) { view.replaceChildren(h('div', { class: 'empty' }, 'Paper not found in Europe PMC.')); return; }
  const k = keyOf(a);
  let tab = TABS.some(t => t[0] === tabArg) ? tabArg : 'overview';
  const ctx = { a, full: null, fullErr: null, abs: abstractSections(a.abstractHtml) };
  const body = h('div', { class: 'ptab' });
  const railCard = h('div', { class: 'rcard' });
  const tabsEl = h('div', { class: 'seg wide', role: 'tablist' }, ...TABS.map(([id, l]) => h('button', { type: 'button', role: 'tab', class: id === tab ? 'on' : '', onclick: () => {
    tab = id; history.replaceState(null, '', `#paper/${encodeURIComponent(k)}${id === 'overview' ? '' : '/' + id}`);
    tabsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.textContent === l)); draw(); } }, l)));

  const links = [a.doi && ['DOI', `https://doi.org/${a.doi}`], a.pmcid && ['Europe PMC', `https://europepmc.org/article/PMC/${a.pmcid}`], a.pmid && ['PubMed', `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`]].filter(Boolean);
  const likeB = h('button', { class: 'act' + (likes.has(k) ? ' on' : ''), type: 'button', 'aria-label': 'Like', onclick: () => likeB.classList.toggle('on', likes.toggle(k)) }, icon('heart', 18), h('span', {}, 'Like'));
  const header = h('header', { class: 'phead' },
    h('div', { class: 'chips' }, h('span', { class: 'chip' }, studyDesign(a)), h('span', { class: 'chip' }, a.journal), h('span', { class: 'chip' }, a.date), h('span', { class: 'chip' }, reuse(a).label), a.source === 'PPR' ? h('span', { class: 'chip warn' }, 'Preprint') : null),
    h('h1', { class: 'ptitle-xl' }, a.title),
    authorChips(a, 8),
    h('div', { class: 'actions' }, likeB,
      h('button', { class: 'act', type: 'button', onclick: () => saveToLibrary(a) }, icon('bookmark', 18), h('span', {}, 'Save')),
      h('button', { class: 'act', type: 'button', onclick: () => share(a) }, icon('share', 18), h('span', {}, 'Share')),
      reuse(a).derivatives ? h('button', { class: 'act', type: 'button', onclick: () => Pod.enqueue(a, 'long', { playNow: true }) }, icon('headphones', 18), h('span', {}, 'Play audio')) : null,
      reuse(a).derivatives ? h('a', { class: 'act', href: `#reels/${encodeURIComponent(k)}` }, icon('reels', 18), h('span', {}, 'Reel')) : null,
      a.pmcid ? h('a', { class: 'act', href: pdfUrl(a.pmcid), target: '_blank', rel: 'noopener noreferrer' }, icon('pdf', 18), h('span', {}, 'PDF')) : null,
      ...links.map(([l, u]) => h('a', { class: 'act', href: u, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 16), h('span', {}, l)))),
    tabsEl);

  const citeOut = h('pre', { class: 'mono cite-out' }, CITE.Vancouver(a));
  const citeTabs = h('div', { class: 'seg small' }, ...Object.keys(CITE).map((s, i) => h('button', { type: 'button', class: i === 0 ? 'on' : '', onclick: e => {
    citeOut.textContent = CITE[s](a); citeTabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, s)));
  const rail = h('aside', { class: 'rail' }, railCard,
    h('div', { class: 'rcard' }, h('b', {}, 'Cite'), citeTabs, citeOut, h('div', { class: 'row' },
      h('button', { class: 'btn small', type: 'button', onclick: () => copyText(citeOut.textContent) }, 'Copy'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => download(`${(a.authors[0]?.last || 'ref').replace(/\W/g, '')}${a.year}.bib`, CITE.BibTeX(a)) }, '.bib'))));
  view.replaceChildren(h('div', { class: 'cols paper' }, h('div', { class: 'center wide' }, header, body), rail));

  const drawRail = () => {
    const cs = checks(a, ctx.full); const sc = score(cs);
    railCard.replaceChildren(h('div', { class: 'rhead' }, h('b', {}, 'Verification card'), h('span', { class: `chip ${sc.cls}` }, sc.label)),
      ...cs.map(c => h('div', { class: 'vrow' }, h('span', { class: `chip ${c.state === 'info' ? '' : c.state}` }, c.label), h('div', {}, c.detail), h('div', { class: 'meta' }, c.source))),
      h('p', { class: 'note' }, 'A passed check means the record shows it, not that the findings are correct.'));
  };
  const draw = () => {
    body.replaceChildren();
    ({ overview, read, figures, authors, discuss })[tab](body, ctx);
  };
  drawRail();
  ctx.loadFull = async () => {
    ctx.fullErr = null; ctx.full = null;
    try { ctx.full = await getFullText(a.pmcid); } catch (e) { ctx.fullErr = e.message; }
    if (!ctx.abs.length && ctx.full?.abstract?.length) ctx.abs = ctx.full.abstract;
    if (document.body.contains(body)) { drawRail(); if (tab !== 'discuss') draw(); }
  };
  if (a.pmcid && a.hasFullText) { draw(); await ctx.loadFull(); }
  else { ctx.fullErr = 'This record has no open full text in Europe PMC.'; draw(); }
}

const waitFull = (box, ctx) => {
  if (ctx.full) return false;
  box.append(ctx.fullErr ? h('div', { class: 'empty' }, `${ctx.fullErr}. `, ctx.loadFull ? h('button', { class: 'btn small', type: 'button', onclick: () => { box.replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'spinner' }), ' Loading full text…')); ctx.loadFull(); } }, 'Retry') : null)
    : h('div', { class: 'empty' }, h('span', { class: 'spinner' }), ' Loading full text… (Europe PMC can be slow; large papers take up to a minute)'));
  return true;
};

// ---------- Overview ----------
function overview(box, ctx) {
  const { a } = ctx;
  box.append(h('div', { class: 'card' }, h('h3', {}, 'Abstract'),
    ctx.abs.length ? h('div', { class: 'abstract' }, ...ctx.abs.map(s => [h('h4', {}, s.title), h('p', {}, s.text)])) : h('p', { class: 'meta' }, ctx.full || ctx.fullErr ? 'No abstract in this record.' : 'Loading abstract from full text…')));
  box.append(podcastCard(ctx));
  if (reuse(a).derivatives) box.append(videoCard(ctx));
  box.append(myVideos(ctx));
  if (ctx.full?.figures?.some(f => f.href)) {
    box.append(h('div', { class: 'card' }, h('div', { class: 'rhead' }, h('h3', {}, 'Key figures'), h('button', { class: 'linkbtn', type: 'button', onclick: () => document.querySelectorAll('.seg.wide button')[2].click() }, 'All figures ›')),
      h('div', { class: 'figstrip' }, ...ctx.full.figures.filter(f => f.href).slice(0, 4).map(f => h('figure', {}, figImg(a.pmcid, f), h('figcaption', {}, f.label || 'Figure'))))));
  }
  const rel = h('div', { class: 'card' }, h('h3', {}, 'Related papers'), h('div', { class: 'meta' }, a.doi ? 'Loading…' : 'Needs a DOI.'));
  box.append(rel);
  if (a.doi) relatedPapers(a.doi).then(list => {
    rel.replaceChildren(h('h3', {}, 'Related papers'), ...(list.length ? list.map(w => {
      const key = articleKeyFromWork(w);
      return h('div', { class: 'relrow' }, key ? h('a', { href: `#paper/${encodeURIComponent(key)}` }, w.title) : h('span', {}, w.title), h('div', { class: 'meta' }, `${w.venue} · ${w.year} · cited ${w.cites}`));
    }) : [h('div', { class: 'meta' }, 'No related papers listed by OpenAlex.')]), h('div', { class: 'meta' }, 'Source: OpenAlex related works'));
  }).catch(e => rel.replaceChildren(h('h3', {}, 'Related papers'), h('div', { class: 'meta' }, `Could not load: ${e.message}`)));
}

function podcastCard(ctx) {
  const { a } = ctx;
  const r = reuse(a);
  if (!r.derivatives) return h('div', { class: 'card' }, h('h3', {}, 'Audio'), h('p', { class: 'note' }, `Audio is off for this paper. ${r.allows}`));
  let format = Audio.fmtId(store.get('podFormat', 'short'));
  let parts = store.get('podParts', ['background', 'results', 'conclusion', 'limitations']);
  let length = store.get('podLength', 'normal');
  const desc = h('p', { class: 'meta' });
  const custom = h('div', { class: 'custombox' });
  const drawCustom = () => {
    custom.hidden = format !== 'custom';
    custom.replaceChildren(
      h('div', { class: 'chips' }, ...Audio.CUSTOM_PARTS.map(([id, l]) => h('button', { type: 'button', class: 'chip pick' + (parts.includes(id) ? ' on' : ''), onclick: () => {
        parts = parts.includes(id) ? parts.filter(x => x !== id) : [...parts, id]; if (!parts.length) parts = ['results']; store.set('podParts', parts); drawCustom(); } }, l))),
      h('div', { class: 'seg small' }, ...Object.entries(Audio.LENGTHS).map(([id, l]) => h('button', { type: 'button', class: id === length ? 'on' : '', onclick: () => { length = id; store.set('podLength', id); drawCustom(); } }, `${l.name} depth`))));
  };
  const fmtSeg = h('div', { class: 'seg' });
  const drawFmt = () => {
    fmtSeg.replaceChildren(...Object.entries(Audio.FORMATS).map(([id, f]) => h('button', { type: 'button', class: id === format ? 'on' : '', onclick: () => { format = id; store.set('podFormat', id); drawFmt(); } }, f.name)));
    desc.textContent = Audio.FORMATS[format].desc; drawCustom();
  };
  drawFmt();
  const opts = () => ({ length, parts: format === 'custom' ? parts : null });
  const fig = ctx.full?.figures?.find(f => f.href);
  const coverBox = h('div', { class: 'cover lg' }, fig ? figImg(a.pmcid, fig) : bloomSVG(), h('span', { class: 'cover-tag' }, 'Evidara audio'));
  const eq = h('div', { class: 'eq', 'aria-hidden': 'true' }, ...Array.from({ length: 24 }, (_, i) => h('i', { style: `animation-delay:${(i % 8) * 0.11}s` })));
  const off = Pod.onChange(s => { if (!document.body.contains(eq)) { off(); return; } eq.classList.toggle('on', !!(s.playing && s.queue[s.idx]?.key === keyOf(a))); });
  return h('div', { class: 'card podcard' },
    coverBox,
    h('div', { class: 'podbody' },
      h('div', { class: 'meta' }, 'AUDIO TRACK'),
      h('h3', {}, 'Listen to this paper'),
      fmtSeg, desc, custom,
      h('div', { class: 'row' },
        h('button', { class: 'playbig', type: 'button', 'aria-label': 'Play', onclick: () => Pod.enqueue(a, format, { playNow: true, ...opts() }) }, icon('play', 26)),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => Pod.enqueue(a, format, opts()) }, '+ Queue'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { Lib.add({ kind: 'audio', title: `${Audio.FORMATS[format].name}: ${a.title}`, source: keyOf(a), status: 'made' }); toast('Saved to Library'); } }, 'Save'), eq),
      h('p', { class: 'meta' }, 'Every spoken line is the paper\'s own sentence. Plays in the bar below while you browse.')));
}

function videoCard(ctx) {
  const { a } = ctx;
  const secs = [...ctx.abs, ...(ctx.full?.sections || [])];
  const res = secs.filter(s => /result|finding|conclusion/i.test(s.title)).flatMap(s => splitSentences(s.text));
  const lim = secs.flatMap(s => splitSentences(s.text)).find(t => /\blimitation/i.test(t));
  const fig = ctx.full?.figures?.find(f => f.href);
  const slides = paperSlides(a, { finding: res[0], limitation: lim, fig, figUrls: fig ? figCandidates(a.pmcid, fig.href) : null, design: studyDesign(a) });
  const player = videoPlayer({ title: a.title, slides, aspect: '16:9', downloadName: `evidara-${(a.authors[0]?.last || 'paper').replace(/\W/g, '')}${a.year}.webm` });
  return h('div', { class: 'card' }, h('div', { class: 'rhead' }, h('h3', {}, 'Video'), h('a', { href: `#reels/${encodeURIComponent(keyOf(a))}` }, 'Open as reel ›')),
    player, h('p', { class: 'meta' }, 'Animated from the paper itself. Narration uses your device\'s voice. Keys: space play, ←/→ slides, C captions, M narration, F fullscreen.'));
}

// Your own videos for an article (as many as you like). Stored in this browser; sharing them publicly goes through Publish.
function myVideos(ctx) {
  const key = 'vid:' + keyOf(ctx.a) + ':';
  const list = h('div', { class: 'myvids' });
  const draw = async () => {
    const ks = await idb.keys(key);
    if (!ks.length) { list.replaceChildren(h('div', { class: 'meta' }, 'No videos yet. Add explainer clips, talks or lab demos (no patients).')); return; }
    const items = await Promise.all(ks.map(async k => ({ k, v: await idb.get(k) })));
    list.replaceChildren(...items.filter(x => x.v).map(({ k, v }) => {
      const url = URL.createObjectURL(v.blob);
      return h('figure', { class: 'myvid' }, h('video', { src: url, controls: true, preload: 'metadata', playsinline: true }),
        h('figcaption', {}, h('b', {}, v.name), h('span', { class: 'meta' }, ` · ${(v.blob.size / 1048576).toFixed(1)} MB · ${new Date(v.at).toLocaleDateString()}`),
          h('button', { class: 'linkbtn', type: 'button', onclick: async () => { await idb.del(k); URL.revokeObjectURL(url); draw(); } }, ' Remove')));
    }));
  };
  const input = h('input', { type: 'file', accept: 'video/mp4,video/webm,video/quicktime', multiple: true, hidden: true, onchange: async () => {
    let added = 0;
    for (const f of input.files) {
      if (f.size > 500 * 1048576) { toast(`${f.name} is over 500 MB`); continue; }
      if (await idb.set(key + Date.now() + '-' + Math.random().toString(36).slice(2, 6), { name: f.name, blob: f, at: Date.now() })) added++;
    }
    toast(added ? `Added ${added} video${added > 1 ? 's' : ''}` : 'Could not store the video (browser storage full or blocked)'); input.value = ''; draw();
  } });
  draw();
  return h('div', { class: 'card' }, h('div', { class: 'rhead' }, h('h3', {}, 'Your videos for this article'),
    h('button', { class: 'btn small', type: 'button', onclick: () => input.click() }, '+ Upload videos')), input,
    h('p', { class: 'note' }, 'Saved privately in this browser. Never upload videos that show patients or identifiable people without consent. To share publicly, attach them in Publish.'), list);
}

// ---------- Read paper ----------
function read(box, ctx) {
  if (!ctx.full && ctx.fullErr && ctx.a.doi) {
    const alt = h('div', { class: 'card' }, h('h3', {}, 'Free full text elsewhere'), h('div', { class: 'meta' }, 'Looking for a legal open-access copy (OpenAlex)…'));
    box.append(alt);
    openAccessLink(ctx.a.doi).then(o => alt.replaceChildren(h('h3', {}, 'Free full text elsewhere'), o && (o.pdf || o.landing)
      ? h('div', { class: 'row' }, o.pdf ? h('a', { class: 'btn', href: o.pdf, target: '_blank', rel: 'noopener noreferrer' }, 'Open free PDF ↗') : null,
          o.landing ? h('a', { class: 'btn ghost', href: o.landing, target: '_blank', rel: 'noopener noreferrer' }, `Read at ${o.host || 'the publisher'} ↗`) : null,
          h('span', { class: 'meta' }, `${o.status ? 'Open access: ' + o.status : ''}${o.license ? ' · ' + o.license.toUpperCase() : ''}`))
      : h('p', { class: 'meta' }, 'No legal free copy is listed for this paper. Evidara only links open-access versions.'))).catch(() => alt.replaceChildren(h('h3', {}, 'Free full text elsewhere'), h('p', { class: 'meta' }, 'Could not check right now.')));
  }
  if (waitFull(box, ctx)) return;
  const { a, full } = ctx;
  const toc = h('nav', { class: 'toc', 'aria-label': 'Sections' }, h('b', {}, 'Contents'));
  const doc = h('article', { class: 'reader' });
  const sid = i => `sec-${i}`;
  if (ctx.abs.length) { toc.append(h('a', { href: '#', onclick: e => { e.preventDefault(); doc.querySelector('#sec-abs')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Abstract'));
    doc.append(h('section', { id: 'sec-abs' }, h('h2', {}, 'Abstract'), ...ctx.abs.map(s => [s.title !== 'Abstract' ? h('h4', {}, s.title) : null, h('p', {}, s.text)]))); }
  full.sections.forEach((s, i) => {
    toc.append(h('a', { href: '#', onclick: e => { e.preventDefault(); doc.querySelector('#' + sid(i))?.scrollIntoView({ behavior: 'smooth' }); } }, s.title));
    doc.append(h('section', { id: sid(i) }, h('h2', {}, s.title), ...s.paras.map(p => h('p', {}, p)),
      ...s.subs.map(ss => [ss.title ? h('h3', {}, ss.title) : null, ...ss.paras.map(p => h('p', {}, p))]),
      ...s.figs.filter(f => f.href).map(f => h('figure', { class: 'rfigure' }, figImg(a.pmcid, f), h('figcaption', {}, h('b', {}, f.label || 'Figure'), ' ', f.caption)))));
  });
  if (full.tables.length) doc.append(h('section', {}, h('h2', {}, 'Tables'), h('p', { class: 'meta' }, 'Tables are listed by caption. Open the PDF or Europe PMC to see them in full.'),
    ...full.tables.map(t => h('p', {}, h('b', {}, t.label || 'Table'), ' ', t.caption))));
  doc.append(h('p', { class: 'note' }, `Full text from Europe PMC under ${reuse(a).label}. Shown as written; nothing summarised or changed.`));
  box.append(h('div', { class: 'readwrap' }, toc, doc));
}

// ---------- Figures ----------
function figures(box, ctx) {
  if (waitFull(box, ctx)) return;
  const figs = ctx.full.figures.filter(f => f.href);
  box.append(h('p', { class: 'meta' }, `${figs.length} figure${figs.length === 1 ? '' : 's'}. The explanation under each is the authors' own caption.`));
  if (!figs.length) { box.append(h('div', { class: 'empty' }, 'No figures in this paper\'s full text.')); return; }
  box.append(h('div', { class: 'figgrid' }, ...figs.map(f => h('figure', { class: 'card' }, figImg(ctx.a.pmcid, f), h('figcaption', {}, h('b', {}, f.label || 'Figure'), ' ', f.caption)))));
}

// ---------- Author statements ----------
function authors(box, ctx) {
  const { a, full } = ctx;
  const sec = (title, text, empty = 'Not found in the full text.') => h('div', { class: 'card' }, h('h3', {}, title), text ? h('p', {}, text) : h('p', { class: 'meta' }, empty));
  box.append(h('div', { class: 'card authmedia' }, h('h3', {}, 'From the authors: video, image and audio'),
    h('p', {}, 'When an author claims this paper, they can post their own video explanation, explainer image and audio note here, with their reasoning and justification.'),
    h('p', { class: 'meta' }, 'Posting opens with verified accounts (next release). Until then this tab shows what the authors wrote in the paper itself.')));
  box.append(h('div', { class: 'card' }, h('h3', {}, 'Authors'), authorChips(a, 50), full?.affs?.length ? h('ul', { class: 'affs' }, ...full.affs.map(x => h('li', {}, x))) : null));
  if (waitFull(box, ctx)) return;
  const lims = [...ctx.abs, ...full.sections].flatMap(s => splitSentences(s.text).filter(t => /\blimitation|\bcaveat|should be interpreted with caution|cannot exclude|may not be generali[sz]/i.test(t)).map(t => ({ t, src: s.title })));
  box.append(h('div', { class: 'card' }, h('h3', {}, 'Limitations the authors state'),
    lims.length ? h('ul', {}, ...lims.slice(0, 12).map(l => h('li', {}, l.t, h('span', { class: 'src' }, ` (${l.src})`)))) : h('p', { class: 'meta' }, 'No explicit limitation statements found.')));
  box.append(sec('Author contributions', full.contrib), sec('Funding', full.funding), sec('Conflicts of interest', full.coi), sec('Data availability', full.dataAvail), sec('Ethics and consent', full.ethics));
  if (full.keywords.length) box.append(h('div', { class: 'card' }, h('h3', {}, 'Keywords'), h('div', { class: 'chips' }, ...full.keywords.map(k => h('span', { class: 'chip' }, k)))));
}

// ---------- Discuss (chat style) ----------
const PATIENT = [/\b\d{4}\s?\d{4}\s?\d{4}\b/, /\b(MRN|UHID|IP ?No|OPD ?No)\b/i, /\b(DOB|date of birth)\b/i, /\b\d{2}[\/-]\d{2}[\/-](19|20)\d{2}\b/, /\b[6-9]\d{9}\b/, /\b(mr|mrs|ms)\.?\s+[A-Z][a-z]+\s+(aged|age)\b/i];
const KINDS = { question: 'Question', issue: 'Issue', gap: 'Unresolved gap', comment: 'Comment' };
function discuss(box, ctx) {
  const k = 'thread:' + keyOf(ctx.a);
  const me = profile();
  const thread = h('div', { class: 'thread', 'aria-live': 'polite' });
  let replyTo = null;
  const replyBar = h('div', { class: 'replybar', hidden: true });
  const draw = () => {
    const msgs = store.get(k, []);
    if (!msgs.length) { thread.replaceChildren(h('div', { class: 'empty' }, 'No discussion yet. Ask the authors a question, flag an issue, or name a gap you found.')); return; }
    const top = msgs.filter(m => !m.parent);
    thread.replaceChildren(...top.map(m => [bubble(m), ...msgs.filter(r => r.parent === m.id).map(r => bubble(r, true))]).flat());
  };
  const bubble = (m, isReply = false) => h('div', { class: 'bubble' + (isReply ? ' reply' : '') + (m.mine ? ' mine' : '') },
    h('div', { class: 'bhead' }, h('span', { class: 'av' }, (m.name || 'Me').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()),
      h('b', {}, m.name || 'You'), m.memberId ? h('span', { class: 'idbadge sm' }, m.memberId) : null,
      h('span', { class: `chip kind-${m.kind}` }, KINDS[m.kind] || 'Comment'), m.toAuthors ? h('span', { class: 'chip' }, '→ authors') : null,
      h('span', { class: 'meta' }, new Date(m.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))),
    h('div', { class: 'btext' }, m.text),
    h('div', { class: 'row' }, !isReply ? h('button', { class: 'linkbtn', type: 'button', onclick: () => { replyTo = m.id; replyBar.hidden = false; replyBar.replaceChildren('Replying to ', h('b', {}, m.name || 'You'), ' ', h('button', { class: 'linkbtn', type: 'button', onclick: () => { replyTo = null; replyBar.hidden = true; } }, 'cancel')); ta.focus(); } }, 'Reply') : null,
      m.mine ? h('button', { class: 'linkbtn', type: 'button', onclick: () => { store.set(k, store.get(k, []).filter(x => x.id !== m.id && x.parent !== m.id)); draw(); } }, 'Delete') : null));
  const kind = h('select', { 'aria-label': 'Type' }, ...Object.entries(KINDS).map(([v, l]) => h('option', { value: v }, l)));
  const toA = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Address to the authors' });
  const ta = h('textarea', { placeholder: 'Write to the authors and other professionals… (no patient details)', 'aria-label': 'Message', maxlength: 4000 });
  const send = () => {
    const text = ta.value.trim(); if (!text) return;
    if (PATIENT.some(re => re.test(text))) { toast('Looks like patient details (ID, phone, date of birth). Remove them before posting.'); return; }
    const msgs = store.get(k, []);
    msgs.push({ id: uid(), parent: replyTo, kind: kind.value, toAuthors: toA.checked, text, at: new Date().toISOString(), name: me.name || 'You', memberId: me.id || '', mine: true });
    store.set(k, msgs); ta.value = ''; replyTo = null; replyBar.hidden = true; draw();
    thread.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
  box.append(h('div', { class: 'card chat' },
    h('div', { class: 'rhead' }, h('h3', {}, 'Discuss with the authors'), h('span', { class: 'chip warn' }, 'Saved on this device for now')),
    h('p', { class: 'meta' }, 'Shared, live discussion with verified professionals and claiming authors opens with sign-in (next release). Your messages here are kept and will move with you when it does. Never post patient-identifiable information.'),
    thread, replyBar,
    h('div', { class: 'composer' }, ta, h('div', { class: 'row' }, kind, h('label', { class: 'row', style: 'gap:6px' }, toA, 'To the authors'),
      h('span', { class: 'meta' }, 'Ctrl+Enter to send'), h('button', { class: 'btn', type: 'button', onclick: send }, 'Send')))));
  draw();
}

import { h, store, toast, copyText, download, spinner, splitSentences } from './util.js';
import { DOMAINS, domainByCode, newId, parseId } from './ids.js';
import { searchArticles, getArticle, getFullText, abstractSections, keyOf, searchResearchers, getResearcher } from './api.js';
import { checks, score, studyDesign, reuse } from './verify.js';
import { STYLES as CITE } from './cite.js';
import * as Audio from './audio.js';
import * as P from './prompts.js';
import * as Lib from './library.js';
import * as Vid from './video.js';

const view = document.getElementById('view');

// ---------------- themes ----------------
const THEMES = [
  ['bloom', 'Bloom', 'Teal to plum, coral and orchid. Wide display type.', 'linear-gradient(135deg,#3F567F,#412653 60%,#E0563F)'],
  ['ink', 'Ink', 'Editorial paper, serif headlines.', 'linear-gradient(135deg,#f3ede2,#b4442c)'],
  ['pulse', 'Pulse', 'Dark lab, neon mint and violet.', 'linear-gradient(135deg,#0a0e13,#7a5cff 60%,#39ffb6)'],
  ['saffron', 'Saffron', 'Warm Indian palette, Devanagari-ready fonts.', 'linear-gradient(135deg,#fff5e6,#e86a1f 60%,#8c1c3a)'],
  ['clinic', 'Clinic', 'Clean white and teal.', 'linear-gradient(135deg,#ffffff,#0e7c86)'],
];
const PALETTE_NOTE = { bloom: 'teal, plum, coral #E0563F and orchid #D174D2', ink: 'cream paper, ink black and brick red', pulse: 'near-black, neon mint and violet', saffron: 'saffron orange, maroon and deep teal', clinic: 'white, teal and navy' };
const FONT_NOTE = { bloom: 'wide geometric display type (Unbounded) with Red Hat Text', ink: 'Fraunces serif headlines with Inter Tight', pulse: 'Space Grotesk with JetBrains Mono details', saffron: 'Yatra One display with Mukta', clinic: 'Sora headlines with Manrope' };
function applyTheme(id) { document.documentElement.dataset.theme = id; store.set('theme', id); }
applyTheme(store.get('theme', 'bloom'));
const panel = document.getElementById('themesPanel');
document.getElementById('themeBtn').addEventListener('click', () => {
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    panel.replaceChildren(h('div', { class: 'meta', style: 'margin-bottom:10px' }, 'Theme templates'),
      ...THEMES.map(([id, name, desc, sw]) => h('button', { class: 'theme-opt', type: 'button', onclick: () => { applyTheme(id); panel.hidden = true; } },
        h('span', { class: 'sw', style: `background:${sw}` }), h('span', {}, h('b', {}, name), h('small', {}, desc)))));
  }
});
document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target) && e.target.id !== 'themeBtn') panel.hidden = true; });

// ---------------- profile ----------------
const profile = () => store.get('profile', { name: '', domain: 'CARD', id: '', audience: 'clinicians', platform: 'reel', tone: 'calm', follows: [] });
const theme = () => document.documentElement.dataset.theme;

function vars(extra = {}) {
  const pr = profile(); const d = domainByCode(pr.domain);
  return { specialty: d ? d[1] : '', topic: d ? d[1].toLowerCase() : 'health research', audience: P.AUDIENCES[pr.audience], tone: P.TONES[pr.tone],
    platformId: pr.platform, palette: PALETTE_NOTE[theme()], fontNote: FONT_NOTE[theme()], year: new Date().getFullYear(), design: 'study', question: 'what works?', ...extra };
}

function updateQuotaLine() {
  const q = k => Lib.quota(k).left;
  document.getElementById('quotaLine').textContent = `Today: ${q('video')} videos · ${q('audio')} audio · ${q('image')} images left · ${Lib.resetNote()}`;
}

// ---------------- router ----------------
const routes = { home, feed, paper, people, researcher, studio, library, profilePage, id: idLookup };
function route() {
  const [name, ...rest] = (location.hash.slice(1) || 'home').split('/');
  const fn = routes[name === 'profile' ? 'profilePage' : name] || home;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name || (name === 'paper' && a.dataset.nav === 'feed') || (name === 'researcher' && a.dataset.nav === 'people')));
  Audio.stop();
  view.replaceChildren();
  Promise.resolve(fn(rest.map(decodeURIComponent))).catch(err => view.append(h('div', { class: 'empty' }, `Something went wrong: ${err.message}`)));
  updateQuotaLine();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// ---------------- bloom art (original SVG, drawn in code) ----------------
function bloomSVG() {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 600 700'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<defs>
    <radialGradient id="pa" cx="50%" cy="20%" r="80%"><stop offset="0" style="stop-color:var(--petal-b)"/><stop offset=".55" style="stop-color:var(--petal-a)"/><stop offset="1" style="stop-color:var(--petal-c)" stop-opacity=".2"/></radialGradient>
    <radialGradient id="pb" cx="40%" cy="70%" r="80%"><stop offset="0" stop-color="#ffb36b"/><stop offset=".45" style="stop-color:var(--petal-a)"/><stop offset="1" style="stop-color:var(--deep)" stop-opacity=".1"/></radialGradient>
    <radialGradient id="pc" cx="60%" cy="30%" r="80%"><stop offset="0" style="stop-color:var(--petal-b)"/><stop offset="1" style="stop-color:var(--petal-c)" stop-opacity=".3"/></radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter></defs>
    <g filter="url(#soft)">
      <path d="M300 40 C420 60 520 170 470 300 C440 380 360 360 330 300 C300 230 220 120 300 40Z" fill="url(#pa)"/>
      <path d="M170 260 C250 230 320 300 300 400 C285 480 210 540 150 500 C90 460 90 300 170 260Z" fill="url(#pb)"/>
      <path d="M360 380 C450 360 520 430 500 520 C480 610 400 650 350 600 C300 550 300 400 360 380Z" fill="url(#pc)"/>
      <path d="M300 300 C305 420 290 560 300 700" style="stroke:var(--petal-c)" stroke-width="10" fill="none" opacity=".6"/>
      <path d="M330 420 C340 500 330 600 335 700" style="stroke:var(--petal-c)" stroke-width="7" fill="none" opacity=".45"/>
    </g>`;
  return s;
}

// ---------------- HOME ----------------
async function home() {
  const pr = profile(); const d = domainByCode(pr.domain);
  const ring = h('div', { class: 'ring' }, '01'), ghost = h('div', { class: 'ghost' }, '02');
  const copy = h('div', { class: 'hero-copy' }, h('span', { class: 'spinner' }), ' Loading today\'s verified papers…');
  let items = [], i = 0;
  const show = () => {
    if (!items.length) return;
    const a = items[i];
    ring.textContent = String(i + 1).padStart(2, '0'); ghost.textContent = String(((i + 1) % items.length) + 1).padStart(2, '0');
    const sc = score(checks(a));
    copy.replaceChildren(h('a', { href: `#paper/${encodeURIComponent(keyOf(a))}` }, a.title),
      h('span', {}, `${a.journal} · ${a.date} · ${studyDesign(a)}`), h('div', { class: 'chips' }, h('span', { class: `chip ${sc.cls}` }, sc.label), h('span', { class: 'chip' }, reuse(a).label)));
  };
  view.append(
    h('section', { class: 'hero' },
      h('div', { class: 'bloom' }, bloomSVG()),
      h('div', {},
        h('div', { class: 'kicker' }, `${d ? d[1] : 'All domains'} · ${new Date().toLocaleDateString([], { day: 'numeric', month: 'long' })}`),
        h('h1', {}, 'Daily', h('br'), 'Evidence'),
        h('div', { class: 'arrows' },
          h('button', { class: 'circle-btn', type: 'button', 'aria-label': 'Previous paper', onclick: () => { i = (i - 1 + items.length) % (items.length || 1); show(); } }, '←'),
          h('button', { class: 'circle-btn', type: 'button', 'aria-label': 'Next paper', onclick: () => { i = (i + 1) % (items.length || 1); show(); } }, '→'))),
      h('div', { class: 'hero-right' }, h('div', { class: 'numeral' }, ring, ghost), copy)),
    h('section', { class: 'section' },
      h('h2', {}, 'Read. Verify. Cite. Create.'),
      h('p', { class: 'sub' }, 'Open-access papers with a verification card, one-click citations, audio and video made from the paper\'s own words, and a verified professional community. Free, with daily limits that refresh every day.'),
      h('div', { class: 'grid' },
        feature('01', 'Verified feed', 'Every paper shows retraction status, study design, peer review, licence, funding and registration checks.', '#feed'),
        feature('02', 'Citation maker', 'Vancouver, AMA, APA and BibTeX from the record, with no retyping.', '#feed'),
        feature('03', 'Audio studio', 'Deep Dive, Brief, Critique, Debate. Read word for word from the paper, with the source of every line shown.', '#studio'),
        feature('04', 'Video abstracts', 'Vertical videos rendered in your browser from the paper\'s title, finding, limitation and citation.', '#studio'),
        feature('05', 'Prompt library', 'Image, video and hook prompts filled in for your specialty, audience, platform and theme.', '#studio'),
        feature('06', 'Your Evidara ID', 'A unique ID with your healthcare domain, e.g. CARD-7K3QX4, so colleagues can find you.', '#profile'))));
  try {
    const r = await searchArticles({ query: d ? d[2] : 'medicine', days: 14, pageSize: 8 });
    items = r.results; i = 0;
    if (!items.length) copy.textContent = 'No new open-access papers in the last 14 days for this domain.'; else show();
  } catch (e) { copy.textContent = `Could not reach Europe PMC: ${e.message}`; }
}
function feature(n, title, text, href) {
  return h('a', { class: 'card', href, style: 'text-decoration:none' }, h('div', { class: 'mono', style: 'color:var(--accent)' }, n), h('h3', {}, title), h('div', { class: 'meta' }, text));
}

// ---------------- FEED ----------------
async function feed() {
  const pr = profile();
  const sel = h('select', { 'aria-label': 'Domain' }, ...DOMAINS.map(([c, l]) => h('option', { value: c, selected: c === pr.domain }, `${l} (${c})`)));
  const q = h('input', { type: 'search', placeholder: 'Search within domain (optional)', 'aria-label': 'Search' });
  const days = h('select', { 'aria-label': 'Time window' }, ...[[7, 'Last 7 days'], [30, 'Last 30 days'], [365, 'Last year'], [0, 'Any time']].map(([v, l]) => h('option', { value: v, selected: v === 30 }, l)));
  const sort = h('select', { 'aria-label': 'Sort' }, h('option', { value: 'date' }, 'Newest'), h('option', { value: 'cited' }, 'Most cited'));
  const list = h('div', { class: 'grid' }), status = h('p', { class: 'sub' });
  let cursor = '*';
  const more = h('button', { class: 'btn ghost', type: 'button', hidden: true, onclick: () => load(false) }, 'Load more');
  async function load(reset = true) {
    if (reset) { cursor = '*'; list.replaceChildren(spinner('Fetching from Europe PMC')); }
    const d = domainByCode(sel.value);
    const query = q.value.trim() ? `(${d[2]}) AND (${q.value.trim()})` : d[2];
    try {
      const r = await searchArticles({ query, days: +days.value, cursor, sort: sort.value });
      if (reset) list.replaceChildren();
      status.textContent = `${r.hitCount.toLocaleString()} open-access papers match. Sorted by ${sort.value === 'date' ? 'publication date' : 'citations'}; no hidden ranking.`;
      r.results.forEach(a => list.append(paperCard(a)));
      if (!r.results.length && reset) list.append(h('div', { class: 'empty' }, 'Nothing found. Widen the time window.'));
      cursor = r.next; more.hidden = !r.next || r.results.length < 24;
    } catch (e) { list.replaceChildren(h('div', { class: 'empty' }, `Could not load: ${e.message}`)); }
  }
  [sel, days, sort].forEach(x => x.addEventListener('change', () => load()));
  q.addEventListener('keydown', e => { if (e.key === 'Enter') load(); });
  view.append(h('section', { class: 'section' },
    h('h2', {}, 'Verified feed'),
    h('p', { class: 'sub' }, 'Open-access papers from Europe PMC (which includes PubMed Central and preprints), with a verification summary on every card.'),
    h('div', { class: 'row', style: 'margin-bottom:12px' }, sel, q, days, sort, h('button', { class: 'btn', type: 'button', onclick: () => load() }, 'Search')),
    status, list, h('div', { style: 'margin-top:16px' }, more)));
  load();
}

function paperCard(a) {
  const sc = score(checks(a));
  const key = keyOf(a);
  return h('article', { class: 'card' },
    h('div', { class: 'chips' }, h('span', { class: `chip ${sc.cls}` }, sc.label), h('span', { class: 'chip' }, studyDesign(a)), a.source === 'PPR' ? h('span', { class: 'chip warn' }, 'Preprint') : null),
    h('h3', {}, h('a', { class: 'title', href: `#paper/${encodeURIComponent(key)}` }, a.title)),
    h('div', { class: 'meta' }, `${a.authorString.split(',').slice(0, 3).join(',')}${a.authors.length > 3 ? ' et al.' : ''}`),
    h('div', { class: 'meta' }, `${a.journal} · ${a.date} · cited ${a.citedBy}`),
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('a', { class: 'btn small', href: `#paper/${encodeURIComponent(key)}` }, 'Open'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => copyText(CITE.Vancouver(a)) }, 'Cite'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { Lib.add({ kind: 'reading', title: a.title, source: key }); toast('Saved to Library'); } }, 'Save')));
}

// ---------------- PAPER ----------------
async function paper([key]) {
  view.append(spinner('Loading paper'));
  const a = await getArticle(key);
  view.replaceChildren();
  if (!a) { view.append(h('div', { class: 'empty' }, 'Paper not found.')); return; }
  let full = null;
  const card = h('div', { class: 'card' });
  const renderChecks = () => {
    const cs = checks(a, full); const sc = score(cs);
    card.replaceChildren(h('h3', {}, 'Verification card ', h('span', { class: `chip ${sc.cls}` }, sc.label)),
      ...cs.map(c => h('div', { style: 'padding:8px 0;border-bottom:1px solid var(--line)' },
        h('span', { class: `chip ${c.state === 'info' ? '' : c.state}` }, c.label), ' ', h('span', {}, c.detail), h('div', { class: 'meta' }, `Source: ${c.source}`))),
      h('p', { class: 'note' }, 'A passed check means the record shows it. It does not mean the findings are correct.'));
  };
  renderChecks();
  const abs = abstractSections(a.abstractHtml);
  const absBox = h('div', { class: 'abstract' }, ...(abs.length ? abs.map(s => [h('h4', {}, s.title), h('div', {}, s.text)]) : [h('div', { class: 'meta' }, 'No abstract in the record.')]));

  const citeOut = h('pre', { class: 'mono', style: 'white-space:pre-wrap;margin:8px 0 0' }, CITE.Vancouver(a));
  let citeStyle = 'Vancouver';
  const citeTabs = h('div', { class: 'tabs' }, ...Object.keys(CITE).map(k => h('button', { class: 'tab' + (k === citeStyle ? ' on' : ''), type: 'button', onclick: e => {
    citeStyle = k; citeOut.textContent = CITE[k](a); citeTabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === e.target)); } }, k)));

  const studioBox = h('div', { class: 'card' });
  const links = [a.doi && ['DOI', `https://doi.org/${a.doi}`], a.pmcid && ['Europe PMC', `https://europepmc.org/article/PMC/${a.pmcid}`], a.pmid && ['PubMed', `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`]].filter(Boolean);

  view.append(h('section', { class: 'section' },
    h('div', { class: 'chips' }, h('span', { class: 'chip' }, studyDesign(a)), h('span', { class: 'chip' }, a.journal), h('span', { class: 'chip' }, a.date), h('span', { class: 'chip' }, reuse(a).label)),
    h('h2', { style: 'font-size:clamp(24px,3.2vw,38px)' }, a.title),
    h('p', { class: 'sub' }, a.authorString),
    h('div', { class: 'row', style: 'margin-bottom:20px' }, ...links.map(([l, u]) => h('a', { class: 'btn small ghost', href: u, target: '_blank', rel: 'noopener noreferrer' }, l + ' ↗')),
      h('button', { class: 'btn small', type: 'button', onclick: () => { Lib.add({ kind: 'reading', title: a.title, source: keyOf(a) }); toast('Saved to Library'); } }, 'Save')),
    h('div', { class: 'split' },
      h('div', {}, h('div', { class: 'card' }, h('h3', {}, 'Abstract'), absBox),
        h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', {}, 'Cite'), citeTabs, citeOut,
          h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn small', type: 'button', onclick: () => copyText(citeOut.textContent) }, 'Copy'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => download(`${(a.authors[0]?.last || 'ref')}${a.year}.bib`, CITE.BibTeX(a)) }, 'Download .bib'))),
        h('div', { style: 'margin-top:16px' }, studioBox)),
      h('div', {}, card))));

  if (a.pmcid && a.hasFullText) {
    try { full = await getFullText(a.pmcid); renderChecks(); } catch { /* abstract only */ }
  }
  buildPaperStudio(studioBox, a, abs, () => full);
}

function buildPaperStudio(box, a, abs, getFull) {
  const r = reuse(a);
  if (!r.derivatives) {
    box.append(h('h3', {}, 'Studio'), h('p', { class: 'note' }, `Audio and video are off for this paper. ${r.allows}`)); return;
  }
  const fmt = h('select', { 'aria-label': 'Audio format' }, ...Object.entries(Audio.FORMATS).map(([k, f]) => h('option', { value: k }, f.name)));
  const len = h('select', { 'aria-label': 'Length' }, ...Object.entries(Audio.LENGTHS).map(([k, f]) => h('option', { value: k, selected: k === 'normal' }, f.name)));
  const sty = h('select', { 'aria-label': 'Voice style' }, ...Object.entries(Audio.STYLES).map(([k, f]) => h('option', { value: k }, f.name)));
  const vA = h('select', { 'aria-label': 'Host A voice' }), vB = h('select', { 'aria-label': 'Host B voice' });
  const fillVoices = () => { const vs = Audio.voices(); [vA, vB].forEach((s, j) => s.replaceChildren(...vs.map((v, k) => h('option', { value: v.name, selected: k === j }, `${v.name} (${v.lang})`)))); };
  fillVoices(); try { speechSynthesis.onvoiceschanged = fillVoices; } catch {}
  const desc = h('p', { class: 'meta' }, Audio.FORMATS.deep.desc);
  const scriptBox = h('div', {});
  let script = null;
  const build = () => {
    script = Audio.buildScript(a, { format: fmt.value, length: len.value, abstract: abs, full: getFull() });
    desc.textContent = `${Audio.FORMATS[fmt.value].desc} Built from the ${script.basis}.`;
    scriptBox.replaceChildren(...script.lines.map((l, i) => h('div', { class: 'script-line', dataset: { i } },
      h('div', { class: 'who' }, l.who === 'B' ? 'HOST B' : 'HOST A'), h('div', {}, l.t, l.src ? h('span', { class: 'src' }, `from: ${l.src}`) : h('span', { class: 'src' }, 'signpost (no claim)')))));
  };
  [fmt, len].forEach(x => x.addEventListener('change', build));
  const playBtn = h('button', { class: 'btn', type: 'button', onclick: () => {
    if (!script) build();
    if (!Lib.spend('audio')) { toast('Daily audio limit reached. It refreshes tomorrow.'); return; }
    updateQuotaLine();
    Audio.play(script.lines, { style: sty.value, voiceA: vA.value, voiceB: vB.value,
      onLine: i => scriptBox.querySelectorAll('.script-line').forEach(el => el.classList.toggle('speaking', +el.dataset.i === i)),
      onEnd: () => toast('Finished') });
  } }, '▶ Play');

  // video
  const canvas = h('canvas', { class: 'preview', width: 1080, height: 1920 });
  const vidOut = h('div', { class: 'row' });
  const slides = () => {
    const full = getFull();
    const secs = full && full.sections.length ? [...abs, ...full.sections] : abs;
    const res = secs.filter(s => /result|finding|conclusion/i.test(s.title)).flatMap(s => splitSentences(s.text));
    const lim = secs.flatMap(s => splitSentences(s.text)).find(t => /\blimitation/i.test(t));
    return Vid.slidesFor(a, { finding: res[0], limitation: lim, design: studyDesign(a), theme: theme() });
  };
  const preview = () => Vid.drawSlide(canvas.getContext('2d'), slides()[0], 0, 4, 0);
  document.fonts?.ready.then(preview); preview();
  const recBtn = h('button', { class: 'btn', type: 'button', disabled: !Vid.canRecord(), onclick: async () => {
    if (!Lib.spend('video')) { toast('Daily video limit reached. It refreshes tomorrow.'); return; }
    updateQuotaLine(); recBtn.disabled = true; recBtn.textContent = 'Rendering… (16 s)';
    try {
      const blob = await Vid.record(canvas, slides(), 4);
      const url = URL.createObjectURL(blob);
      const name = `evidara-${(a.authors[0]?.last || 'paper')}${a.year}.webm`;
      vidOut.replaceChildren(h('a', { class: 'btn small', href: url, download: name }, 'Download video'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => { Lib.add({ kind: 'video', title: `Video abstract: ${a.title}`, source: keyOf(a), status: 'made', storage: 'downloaded file', link: name }); toast('Added to Library as Made'); } }, 'Add to Library'));
    } catch (e) { toast('Recording failed: ' + e.message); }
    recBtn.disabled = false; recBtn.textContent = 'Render video abstract';
  } }, 'Render video abstract');

  box.append(h('h3', {}, 'Studio for this paper'),
    h('div', { class: 'tabs' }, h('span', { class: 'chip ok' }, `Licence allows it: ${r.label}`)),
    h('h4', {}, 'Audio overview'),
    h('div', { class: 'row' }, fmt, len, sty), h('div', { class: 'row', style: 'margin-top:8px' }, vA, vB), desc,
    h('div', { class: 'row' }, playBtn, h('button', { class: 'btn ghost', type: 'button', onclick: () => Audio.stop() }, '■ Stop'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (!script) build(); download('script.txt', Audio.toText(a, script)); } }, 'Script .txt'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (!script) build(); Lib.add({ kind: 'audio', title: `${Audio.FORMATS[fmt.value].name}: ${a.title}`, source: keyOf(a), status: 'made', script: Audio.toText(a, script) }); toast('Added to Library'); } }, 'Add to Library')),
    h('p', { class: 'note' }, 'Voices are your device\'s built-in voices (free, offline, unlimited). Downloadable MP3 comes with the cloud voice step.'),
    scriptBox,
    h('h4', { style: 'margin-top:20px' }, 'Video abstract (9:16)'),
    h('div', { class: 'row', style: 'align-items:flex-start' }, canvas, h('div', { style: 'flex:1;min-width:200px' },
      h('p', { class: 'meta' }, 'Four slides: title, a verbatim finding, a verbatim limitation, and the source. Uses your current theme. Change the theme and re-render for a different look.'),
      h('div', { class: 'row' }, recBtn), vidOut)));
  build();
}

// ---------------- PEOPLE ----------------
async function people() {
  const q = h('input', { type: 'search', placeholder: 'Researcher name, e.g. "Soumya Swaminathan"', 'aria-label': 'Researcher name' });
  const idq = h('input', { type: 'text', placeholder: 'Evidara ID, e.g. CARD-7K3QX4', 'aria-label': 'Evidara ID' });
  const out = h('div', { class: 'grid' });
  const go = async () => {
    if (!q.value.trim()) return;
    out.replaceChildren(spinner('Searching OpenAlex'));
    try {
      const rs = await searchResearchers(q.value.trim());
      out.replaceChildren(...(rs.length ? rs.map(r => h('a', { class: 'card', href: `#researcher/${r.id}`, style: 'text-decoration:none' },
        h('div', { class: 'chips' }, h('span', { class: 'chip warn' }, 'Unclaimed · auto-built'), r.orcid ? h('span', { class: 'chip ok' }, 'ORCID') : null),
        h('h3', {}, r.name), h('div', { class: 'meta' }, [r.inst, r.country].filter(Boolean).join(' · ')),
        h('div', { class: 'meta' }, `${r.works} works · ${r.cites.toLocaleString()} citations · h-index ${r.h ?? '?'}`),
        h('div', { class: 'chips' }, ...r.topics.map(t => h('span', { class: 'chip' }, t))))) : [h('div', { class: 'empty' }, 'No researchers found.')]));
    } catch (e) { out.replaceChildren(h('div', { class: 'empty' }, `Could not search: ${e.message}`)); }
  };
  q.addEventListener('keydown', e => e.key === 'Enter' && go());
  idq.addEventListener('keydown', e => e.key === 'Enter' && (location.hash = `#id/${encodeURIComponent(idq.value)}`));
  view.append(h('section', { class: 'section' },
    h('h2', {}, 'Find people'),
    h('p', { class: 'sub' }, 'Researcher profiles are built automatically from OpenAlex and stay marked "unclaimed" until the person claims theirs. Verified members are found by their Evidara ID.'),
    h('div', { class: 'row', style: 'margin-bottom:10px' }, q, h('button', { class: 'btn', type: 'button', onclick: go }, 'Search researchers')),
    h('div', { class: 'row', style: 'margin-bottom:20px' }, idq, h('button', { class: 'btn ghost', type: 'button', onclick: () => (location.hash = `#id/${encodeURIComponent(idq.value)}`) }, 'Look up ID')),
    out,
    h('h2', { style: 'margin-top:40px;font-size:28px' }, 'Browse by domain'),
    h('p', { class: 'sub' }, 'Every member ID starts with its domain code, so you can find people by specialty.'),
    h('div', { class: 'chips' }, ...DOMAINS.map(([c, l]) => h('span', { class: 'chip', title: l }, `${c} · ${l}`)))));
}

async function researcher([id]) {
  view.append(spinner('Loading profile'));
  const r = await getResearcher(id);
  const maxC = Math.max(1, ...r.perYear.map(y => y.cites));
  const bars = h('div', { style: 'display:flex;gap:4px;align-items:flex-end;height:120px;margin-top:10px' },
    ...r.perYear.map(y => h('div', { title: `${y.year}: ${y.cites} citations, ${y.works} works`, style: `flex:1;background:var(--accent);opacity:.85;border-radius:4px 4px 0 0;height:${Math.max(2, (y.cites / maxC) * 100)}%` })));
  const workList = ws => ws.map(w => h('div', { style: 'padding:10px 0;border-bottom:1px solid var(--line)' },
    w.retracted ? h('span', { class: 'chip bad' }, 'Retracted') : null, ' ',
    (w.pmcid || w.pmid || w.doi) ? h('a', { href: `#paper/${encodeURIComponent(w.pmcid || (w.pmid ? 'MED:' + w.pmid : w.doi))}` }, w.title) : h('span', {}, w.title),
    h('div', { class: 'meta' }, `${w.venue || w.type} · ${w.year} · cited ${w.cites}`)));
  const list = h('div', {}, ...workList(r.top));
  const tabs = h('div', { class: 'tabs' }, h('button', { class: 'tab on', type: 'button', onclick: e => { list.replaceChildren(...workList(r.top)); tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === e.target)); } }, 'Most cited'),
    h('button', { class: 'tab', type: 'button', onclick: e => { list.replaceChildren(...workList(r.recent)); tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === e.target)); } }, 'Recent'));
  view.replaceChildren(h('section', { class: 'section' },
    h('div', { class: 'chips' }, h('span', { class: 'chip warn' }, 'Unclaimed · auto-built from OpenAlex'), r.orcid ? h('a', { class: 'chip ok', href: `https://orcid.org/${r.orcid}`, target: '_blank', rel: 'noopener noreferrer' }, `ORCID ${r.orcid}`) : null),
    h('h2', {}, r.name), h('p', { class: 'sub' }, r.inst.join(' · ')),
    h('div', { class: 'split' },
      h('div', { class: 'card' }, h('h3', {}, 'Papers'), tabs, list,
        h('p', { class: 'note' }, 'Papers are matched to this person by OpenAlex. Same-name mix-ups happen; a claimed profile fixes them. Retractions are shown per paper as OpenAlex reports them.')),
      h('div', {},
        h('div', { class: 'card' }, h('h3', {}, 'Metrics'), h('div', { class: 'meta' }, `${r.works} works · ${r.cites.toLocaleString()} citations · h-index ${r.h ?? '?'} · i10 ${r.i10 ?? '?'}`), bars, h('div', { class: 'meta' }, 'Citations per year')),
        h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', {}, 'Topics'), h('div', { class: 'chips' }, ...r.topics.map(t => h('span', { class: 'chip' }, t)))),
        h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', {}, 'Is this you?'), h('p', { class: 'meta' }, 'Claiming opens with accounts: sign in, verify your credentials, link your ORCID, then hide or add papers. Anyone can ask for an auto-built profile to be removed.'))))));
}

function idLookup([raw]) {
  const p = parseId(raw);
  const me = profile();
  view.append(h('section', { class: 'section' }, h('h2', {}, 'ID lookup'),
    p.ok ? h('div', { class: 'card' }, h('span', { class: 'idbadge' }, p.id), h('p', {}, `Valid ID format. Domain: ${p.domain} (${p.code}).`),
      me.id === p.id ? h('p', { class: 'note' }, 'This is your ID.') : h('p', { class: 'note' }, 'Member directory search goes live with accounts. For now only the format and check character can be verified.'))
      : h('div', { class: 'empty' }, p.reason)));
}

// ---------------- STUDIO ----------------
function studio() {
  const pr = profile();
  let tab = store.get('studioTab', 'image');
  const body = h('div', {});
  const tabs = h('div', { class: 'tabs' }, ...[['image', 'Image prompts'], ['video', 'Video formats'], ['hooks', 'Hooks'], ['audio', 'Audio formats']].map(([k, l]) =>
    h('button', { class: 'tab' + (k === tab ? ' on' : ''), type: 'button', onclick: e => { tab = k; store.set('studioTab', k); tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === e.target)); render(); } }, l)));
  const topic = h('input', { type: 'text', placeholder: 'Topic (defaults to your domain)', 'aria-label': 'Topic', value: store.get('studioTopic', '') });
  topic.addEventListener('input', () => { store.set('studioTopic', topic.value); render(); });
  const v = () => vars(topic.value.trim() ? { topic: topic.value.trim() } : {});

  function promptCard(title, text, kind) {
    const warns = P.lint(text);
    return h('div', { class: 'card' }, h('h3', {}, title), h('pre', { class: 'mono', style: 'white-space:pre-wrap;margin:0' }, text),
      warns.length ? h('ul', { class: 'warnlist' }, ...warns.map(w => h('li', {}, w))) : null,
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn small', type: 'button', onclick: () => copyText(text) }, 'Copy'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => { Lib.add({ kind, title, prompt: text, platform: pr.platform }); toast('Added to Library as Idea'); } }, 'Add to Library')));
  }
  function render() {
    const vv = v();
    if (tab === 'image') body.replaceChildren(
      h('p', { class: 'note' }, 'Paste into any image generator. Built-in free image generation (daily limit) switches on when the cloud step is set up. Every prompt forbids real patients, identifiable people and written claims.'),
      h('div', { class: 'grid' }, ...P.IMAGE_STYLES.map(s => promptCard(s.name, P.fill(s.p, vv), 'image'))));
    else if (tab === 'video') body.replaceChildren(
      h('p', { class: 'note' }, `Format playbook, curated by hand (updated ${P.PLAYBOOK_UPDATED}). Not a live trend feed. Open any paper to render a real video abstract.`),
      h('div', { class: 'grid' }, ...P.VIDEO_FORMATS.map(f => promptCard(f.name, P.videoPlan(f, vv), 'video'))));
    else if (tab === 'hooks') body.replaceChildren(
      h('p', { class: 'note' }, 'Opening lines that stay honest: none of them promise an outcome.'),
      h('div', { class: 'grid' }, ...P.HOOKS.map((t, i) => promptCard(`Hook ${String(i + 1).padStart(2, '0')}`, P.fill(t, vv), 'hook'))));
    else body.replaceChildren(
      h('p', { class: 'note' }, 'Audio is made from a paper: open any paper in the Feed and use its Audio overview. Formats:'),
      h('div', { class: 'grid' }, ...P.AUDIO_CONCEPTS.map(c => h('div', { class: 'card' }, h('h3', {}, c.name), h('div', { class: 'meta' }, c.note)))));
  }
  view.append(h('section', { class: 'section' },
    h('h2', {}, 'Studio'),
    h('p', { class: 'sub' }, `Prompts personalised for ${domainByCode(pr.domain)?.[1] || 'your domain'}, ${P.AUDIENCES[pr.audience]}, ${P.PLATFORMS[pr.platform].name}, a ${P.TONES[pr.tone]} tone and the ${theme()} theme palette. Change these in Profile.`),
    h('div', { class: 'row', style: 'margin-bottom:14px' }, topic), tabs, body));
  render();
}

// ---------------- LIBRARY ----------------
function library() {
  const board = h('div', { class: 'kanban' });
  const render = () => {
    const items = Lib.all();
    board.replaceChildren(...Lib.STATUSES.map(([st, label]) => h('div', { class: 'col' },
      h('h4', {}, `${label} · ${items.filter(x => x.status === st).length}`),
      ...items.filter(x => x.status === st).map(it => itemCard(it, render)))));
  };
  const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async () => {
    try { const n = Lib.importJSON(await file.files[0].text()); toast(`Imported ${n} items`); render(); } catch (e) { toast('Import failed: ' + e.message); }
  } });
  view.append(h('section', { class: 'section' },
    h('h2', {}, 'Library'),
    h('p', { class: 'sub' }, 'Everything you made or saved: idea → made → scheduled → posted. Set a time and platform, then export the schedule to your calendar. Stored in this browser until accounts go live, so export a backup now and then.'),
    h('div', { class: 'row', style: 'margin-bottom:16px' },
      h('button', { class: 'btn', type: 'button', onclick: () => download('evidara-schedule.ics', Lib.toICS(), 'text/calendar') }, 'Export calendar (.ics)'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => download('evidara-library.json', JSON.stringify(Lib.all(), null, 2), 'application/json') }, 'Backup (.json)'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => file.click() }, 'Import backup'), file),
    board));
  render();
}

function itemCard(it, rerender) {
  const st = h('select', { 'aria-label': 'Status' }, ...Lib.STATUSES.map(([k, l]) => h('option', { value: k, selected: k === it.status }, l)));
  st.addEventListener('change', () => { Lib.update(it.id, { status: st.value }); rerender(); });
  const plat = h('select', { 'aria-label': 'Platform' }, ...Object.entries(P.PLATFORMS).map(([k, p]) => h('option', { value: k, selected: k === it.platform }, p.name)));
  plat.addEventListener('change', () => Lib.update(it.id, { platform: plat.value }));
  const when = h('input', { type: 'datetime-local', 'aria-label': 'Schedule time', value: it.scheduledAt ? toLocalInput(it.scheduledAt) : '' });
  when.addEventListener('change', () => { Lib.update(it.id, { scheduledAt: when.value ? new Date(when.value).toISOString() : '', status: when.value && it.status !== 'posted' ? 'scheduled' : it.status }); rerender(); });
  return h('div', { class: 'item' },
    h('div', { class: 'meta' }, `${it.kind} · ${new Date(it.createdAt).toLocaleDateString()}`),
    it.source ? h('a', { href: `#paper/${encodeURIComponent(it.source)}` }, it.title) : h('div', {}, it.title),
    it.link ? h('div', { class: 'meta' }, `Stored: ${it.storage} · ${it.link}`) : null,
    h('div', { style: 'display:grid;gap:6px;margin-top:8px' }, st, plat, when),
    h('div', { class: 'row', style: 'margin-top:6px' },
      (it.prompt || it.script) ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => copyText(it.prompt || it.script) }, 'Copy') : null,
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { Lib.remove(it.id); rerender(); } }, 'Delete')));
}
function toLocalInput(iso) { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }

// ---------------- PROFILE ----------------
function profilePage() {
  const pr = profile();
  const name = h('input', { type: 'text', value: pr.name, placeholder: 'Your name', 'aria-label': 'Name' });
  const dom = h('select', { 'aria-label': 'Domain' }, ...DOMAINS.map(([c, l]) => h('option', { value: c, selected: c === pr.domain }, `${l} (${c})`)));
  const aud = h('select', { 'aria-label': 'Audience' }, ...Object.entries(P.AUDIENCES).map(([k, l]) => h('option', { value: k, selected: k === pr.audience }, l)));
  const plat = h('select', { 'aria-label': 'Platform' }, ...Object.entries(P.PLATFORMS).map(([k, p]) => h('option', { value: k, selected: k === pr.platform }, p.name)));
  const tone = h('select', { 'aria-label': 'Tone' }, ...Object.entries(P.TONES).map(([k, l]) => h('option', { value: k, selected: k === pr.tone }, l)));
  const idBox = h('div', {});
  const showId = () => {
    const cur = profile();
    idBox.replaceChildren(cur.id ? h('div', {}, h('span', { class: 'idbadge', style: 'font-size:22px' }, cur.id),
      h('p', { class: 'meta' }, `Domain ${cur.id.slice(0, 4)}: ${domainByCode(cur.id.slice(0, 4))?.[1]}. The last character is a check character that catches typos.`),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => copyText(cur.id) }, 'Copy ID')))
      : h('p', { class: 'meta' }, 'No ID yet. Choose your domain and save.'));
  };
  const save = () => {
    const cur = profile();
    const changedDomain = cur.id && cur.id.slice(0, 4) !== dom.value;
    const next = { ...cur, name: name.value.trim(), domain: dom.value, audience: aud.value, platform: plat.value, tone: tone.value };
    if (!cur.id || changedDomain) next.id = newId(dom.value);
    store.set('profile', next); showId(); toast(changedDomain ? 'Saved. New ID issued for your new domain.' : 'Saved');
  };
  view.append(h('section', { class: 'section' },
    h('h2', {}, 'Profile'),
    h('p', { class: 'sub' }, 'Your domain sets your feed, your prompts and the first part of your Evidara ID. Saved in this browser for now. Sign-in and credential verification come with the cloud step, and your ID is reserved then.'),
    h('div', { class: 'split' },
      h('div', { class: 'card' },
        h('div', { style: 'display:grid;gap:12px' },
          h('label', { class: 'f' }, 'Name', name), h('label', { class: 'f' }, 'Healthcare domain', dom),
          h('label', { class: 'f' }, 'Main audience', aud), h('label', { class: 'f' }, 'Main platform', plat), h('label', { class: 'f' }, 'Tone', tone)),
        h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', type: 'button', onclick: save }, 'Save'))),
      h('div', { class: 'card' }, h('h3', {}, 'Your Evidara ID'), idBox,
        h('p', { class: 'note' }, 'Format: DOMAIN-XXXXXC. For example CARD-7K3QX4 is a cardiology member. The domain code lets anyone browse people by specialty.')))));
  showId();
}

route();

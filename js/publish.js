// Publish: write a full article/post with media, declarations and clearance, run automated checks,
// then send a submission package to the admin. Approved posts appear in Community for everyone.
// (Without a server, the package is a file you send the admin; the admin publishes it to the site.)
import { h, store, toast, download, uid, splitSentences } from './util.js';
import { icon } from './icons.js';
import { DOMAINS, domainByCode, parseId, validOrcid } from './ids.js';
import { checkDoi } from './api.js';
import { lint } from './prompts.js';
import { idb } from './idb.js';
import { profile } from './core.js';
import { online, api, requireVerified } from './backend.js';
import * as Audio from './audio.js';
import * as Pod from './podcast.js';
import { videoPlayer } from './vplayer.js';

const view = document.getElementById('view');
export const TYPES = ['Original research', 'Systematic review', 'Case discussion (no identifiers)', 'Quality-improvement study', 'Secondary data analysis', 'Perspective / opinion', 'Clinical pearl', 'Research protocol', 'Journal-club summary', 'Educational explainer'];
// "Publish with Evidara" accepts completed studies only.
export const COMPLETED_TYPES = ['Original research', 'Systematic review', 'Case discussion (no identifiers)', 'Quality-improvement study', 'Secondary data analysis'];
const CREDIT = ['Conceptualization', 'Methodology', 'Investigation', 'Formal analysis', 'Data curation', 'Writing – original draft', 'Writing – review & editing', 'Supervision', 'Funding acquisition', 'Visualization'];
const GUIDES = { none: 'Not applicable', CONSORT: 'CONSORT (randomised trials)', PRISMA: 'PRISMA (systematic reviews)', STROBE: 'STROBE (observational studies)', CARE: 'CARE (case reports)', SPIRIT: 'SPIRIT (protocols)', STARD: 'STARD (diagnostic accuracy)', TRIPOD: 'TRIPOD (prediction models)' };
const PATIENT = [[/\b\d{4}\s?\d{4}\s?\d{4}\b/, '12-digit ID number'], [/\b(MRN|UHID|IP ?No|OPD ?No)\b/i, 'hospital record number'], [/\b(DOB|date of birth)\b/i, 'date of birth'],
  [/\b\d{2}[\/-]\d{2}[\/-](19|20)\d{2}\b/, 'a full date (possible date of birth)'], [/\b[6-9]\d{9}\b/, 'phone number'], [/\b(mr|mrs|ms)\.?\s+[A-Z][a-z]+\s+(aged|age)\b/i, 'named patient']];
const REG = /\b(NCT\d{8}|CTRI\/\d{4}\/\d{2,3}\/\d{6}|ISRCTN\d{8}|ACTRN\d{14}|ChiCTR[-\w]{6,}|CRD\d{11}|DRKS\d{8}|EUCTR\d{4}-\d{6}-\d{2})\b/i;

const blank = (track = 'community') => ({
  id: uid(), track, type: TYPES[0], title: '', shortTitle: '', domain: profile().domain, keywords: [],
  authors: [{ name: profile().name || '', memberId: profile().id || '', orcid: '', affiliation: '', roles: [], corresponding: true }],
  abstract: { background: '', methods: '', results: '', conclusion: '' },
  sections: [{ title: 'Introduction', text: '' }, { title: 'Methods', text: '' }, { title: 'Results', text: '' }, { title: 'Discussion', text: '' }, { title: 'Conclusion', text: '' }],
  images: [], videos: [], personal: '', suggestions: '', references: '', refChecks: [],
  decl: { completed: false, completionDate: '', prior: 'none', priorLink: '', guideline: 'none', guidelineDone: false, ethics: '', ethicsId: '', consent: '', registry: '', funding: '', coi: '', data: '', ai: '', originality: false, licence: 'CC BY 4.0', rightsImages: false },
  status: 'draft', updatedAt: '',
});

// ---------- automated verification (also used by the admin portal) ----------
export function verifyPost(p) {
  const R = []; const add = (state, label, detail) => R.push({ state, label, detail });
  const words = t => (String(t || '').match(/\S+/g) || []).length;
  const absText = Object.values(p.abstract || {}).join(' ');
  const body = (p.sections || []).map(s => s.text).join(' ');
  const all = [p.title, absText, body, p.personal, p.suggestions, ...(p.images || []).map(i => i.caption)].join(' ');
  add(p.title?.trim().length >= 10 ? 'ok' : 'bad', 'Title', p.title?.trim() ? `${words(p.title)} words` : 'Missing');
  add((p.keywords || []).length >= 3 ? 'ok' : 'warn', 'Keywords', `${(p.keywords || []).length} (3–8 recommended)`);
  const aw = words(absText);
  add(aw >= 80 && aw <= 350 ? 'ok' : aw ? 'warn' : 'bad', 'Abstract', aw ? `${aw} words (80–350)` : 'Missing');
  const filled = (p.sections || []).filter(s => words(s.text) >= 30).length;
  add(filled >= 3 ? 'ok' : filled ? 'warn' : 'bad', 'Main text', `${filled} section(s) with real content · ${words(body).toLocaleString()} words`);
  const hasConc = (p.sections || []).some(s => /conclusion/i.test(s.title) && words(s.text) >= 15) || words(p.abstract?.conclusion) >= 10;
  add(hasConc ? 'ok' : 'warn', 'Conclusion', hasConc ? 'Present' : 'Missing or very short');
  const hasDisc = (p.sections || []).some(s => /discussion/i.test(s.title) && words(s.text) >= 30);
  add(hasDisc || /perspective|pearl|explainer/i.test(p.type) ? 'ok' : 'warn', 'Discussion', hasDisc ? 'Present' : 'Missing (expected for research articles)');
  (p.authors || []).forEach((a, i) => {
    const issues = [];
    if (!a.name?.trim()) issues.push('name missing');
    if (a.memberId && !parseId(a.memberId).ok) issues.push('Evidara ID invalid');
    if (a.orcid && !validOrcid(a.orcid)) issues.push('ORCID check digit fails');
    if (!a.affiliation?.trim()) issues.push('affiliation missing');
    if (!(a.roles || []).length) issues.push('no contribution roles');
    add(issues.length ? 'warn' : 'ok', `Author ${i + 1}${a.name ? ': ' + a.name : ''}`, issues.length ? issues.join(', ') : `${a.orcid ? 'ORCID valid · ' : ''}${(a.roles || []).length} role(s)`);
  });
  add((p.authors || []).some(a => a.corresponding) ? 'ok' : 'warn', 'Corresponding author', (p.authors || []).some(a => a.corresponding) ? 'Set' : 'Not set');
  const pt = PATIENT.filter(([re]) => re.test(all)).map(([, w]) => w);
  add(pt.length ? 'bad' : 'ok', 'Patient identifiers', pt.length ? `Possible: ${pt.join(', ')}. Remove before submitting.` : 'None detected by the screen (a safety net, not a guarantee)');
  const oc = lint(all);
  add(oc.length ? 'warn' : 'ok', 'Overclaiming language', oc.length ? oc.map(x => x.replace(/\. Healthcare.*$/, '')).join('; ') : 'None found');
  const d = p.decl || {};
  const needEthics = /original research|protocol|case/i.test(p.type);
  add(!needEthics || (d.ethics && (d.ethics === 'not-required' || d.ethicsId?.trim())) ? 'ok' : 'bad', 'Ethics approval', needEthics ? (d.ethics === 'not-required' ? 'Declared not required' : d.ethicsId ? `Approval: ${d.ethicsId}` : 'Missing') : 'Not applicable');
  add(!/case/i.test(p.type) || d.consent ? 'ok' : 'bad', 'Consent', /case/i.test(p.type) ? (d.consent || 'Missing (required for case discussions)') : (d.consent || 'Not applicable'));
  const trialLike = /trial|protocol|systematic review/i.test(p.type + ' ' + body.slice(0, 2000));
  add(d.registry ? (REG.test(d.registry) ? 'ok' : 'warn') : trialLike ? 'warn' : 'ok', 'Registration', d.registry ? (REG.test(d.registry) ? `Valid format: ${d.registry.match(REG)[1]}` : 'Format not recognised (NCT, CTRI, ISRCTN, PROSPERO CRD…)') : trialLike ? 'No registry ID (expected for trials, protocols and reviews)' : 'Not applicable');
  add(d.guideline === 'none' || d.guidelineDone ? 'ok' : 'warn', 'Reporting guideline', d.guideline === 'none' ? 'Not applicable' : `${GUIDES[d.guideline]} ${d.guidelineDone ? 'checklist completed' : 'checklist not confirmed'}`);
  for (const [k, l] of [['funding', 'Funding statement'], ['coi', 'Conflicts of interest'], ['data', 'Data availability'], ['ai', 'AI-use declaration']]) add(d[k]?.trim() ? 'ok' : 'warn', l, d[k]?.trim() ? 'Declared' : 'Missing');
  add(d.originality ? 'ok' : 'bad', 'Originality', d.originality ? 'Declared original, not plagiarised' : 'Not declared');
  add(!(p.images || []).length || d.rightsImages ? 'ok' : 'bad', 'Image rights', (p.images || []).length ? (d.rightsImages ? `${p.images.length} image(s), rights confirmed` : 'Rights not confirmed') : 'No images');
  const missingAlt = (p.images || []).filter(i => !i.alt?.trim()).length;
  if ((p.images || []).length) add(missingAlt ? 'warn' : 'ok', 'Image alt text', missingAlt ? `${missingAlt} image(s) without alt text` : 'All images described');
  const rc = p.refChecks || [];
  if (rc.length) {
    const bad = rc.filter(r => !r.ok).length, ret = rc.filter(r => r.retracted).length;
    add(ret ? 'bad' : bad ? 'warn' : 'ok', 'References', `${rc.length} DOI(s) checked · ${bad} not found · ${ret} retracted`);
  } else add(String(p.references || '').trim() ? 'warn' : 'warn', 'References', String(p.references || '').trim() ? 'Not checked yet: press "Check references"' : 'None given');
  if (p.track === 'evidara') {
    add(COMPLETED_TYPES.includes(p.type) ? 'ok' : 'bad', 'Completed-study type', COMPLETED_TYPES.includes(p.type) ? p.type : `${p.type} is not accepted for Publish with Evidara (completed studies only)`);
    add(d.completed ? 'ok' : 'bad', 'Study completed', d.completed ? `Declared complete${d.completionDate ? ' on ' + d.completionDate : ''}` : 'Declare that data collection and analysis are complete');
    const resWords = (p.sections || []).filter(s => /result|finding/i.test(s.title)).reduce((n, s) => n + words(s.text), 0) + words(p.abstract?.results);
    add(resWords >= 50 ? 'ok' : 'bad', 'Results reported', `${resWords} words of results (at least 50)`);
    add(d.prior === 'published' ? 'bad' : 'ok', 'Prior publication', d.prior === 'published' ? 'Already published elsewhere: not accepted' : d.prior === 'preprint' ? `Preprint declared${d.priorLink ? ': ' + d.priorLink : ''}` : 'Not published elsewhere');
  }
  const req = R.filter(r => r.state !== 'info');
  const score = Math.round((req.filter(r => r.state === 'ok').length / req.length) * 1000) / 10;
  return { items: R, blockers: R.filter(r => r.state === 'bad').length, warnings: R.filter(r => r.state === 'warn').length, completeness: score };
}

async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export function youtubeId(u) { const m = String(u).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/); return m ? m[1] : null; }
export function vimeoId(u) { const m = String(u).match(/vimeo\.com\/(\d{6,})/); return m ? m[1] : null; }

// Library item → Publish draft (the "push to Evidara" step).
export async function draftFromLibrary(it) {
  const p = blank();
  p.title = (it.title || '').replace(/^(NotebookLM \w+|Video abstract|Short|Briefing|Long|Customised): /, '').slice(0, 200);
  p.type = 'Educational explainer';
  if (it.script) p.sections = [{ title: 'Summary', text: it.script }];
  if (it.source) p.references = `Source: ${it.source}`;
  p.fromLibrary = { id: it.id, kind: it.kind, file: it.link || '' };
  p.updatedAt = new Date().toISOString();
  await idb.set('pub:' + p.id, p);
  const ds = store.get('pubDrafts', []); ds.unshift({ id: p.id, title: p.title || 'Untitled', updatedAt: p.updatedAt, status: 'draft' }); store.set('pubDrafts', ds.slice(0, 30));
  return p.id;
}

// ---------- page ----------
export async function publish([draftId, trackArg]) {
  const drafts = store.get('pubDrafts', []);
  let p = draftId && draftId !== 'new' ? await idb.get('pub:' + draftId) : null;
  if (!p) { p = blank(trackArg === 'evidara' ? 'evidara' : 'community'); if (p.track === 'evidara') p.type = COMPLETED_TYPES[0]; }
  const evd = p.track === 'evidara';
  const save = async (quiet) => { p.updatedAt = new Date().toISOString(); await idb.set('pub:' + p.id, p); const ds = store.get('pubDrafts', []).filter(x => x.id !== p.id); ds.unshift({ id: p.id, title: p.title || 'Untitled', updatedAt: p.updatedAt, status: p.status }); store.set('pubDrafts', ds.slice(0, 30)); if (!quiet) toast('Draft saved'); drawReport(); };
  let saveT; const autosave = () => { clearTimeout(saveT); saveT = setTimeout(() => save(true), 800); };
  const field = (label, el, hint) => h('label', { class: 'f' }, label, el, hint ? h('span', { class: 'hint' }, hint) : null);
  const text = (get, set, ph, rows = 4) => { const t = h('textarea', { placeholder: ph, rows }); t.value = get() || ''; t.addEventListener('input', () => { set(t.value); autosave(); }); return t; };
  const inp = (get, set, ph) => { const t = h('input', { type: 'text', placeholder: ph }); t.value = get() || ''; t.addEventListener('input', () => { set(t.value); autosave(); }); return t; };
  const selectEl = (opts, get, set) => { const s = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v, selected: v === get() }, l))); s.addEventListener('change', () => { set(s.value); autosave(); }); return s; };
  const check = (label, get, set) => { const c = h('input', { type: 'checkbox', checked: !!get() }); c.addEventListener('change', () => { set(c.checked); autosave(); }); return h('label', { class: 'row', style: 'gap:8px' }, c, label); };

  const report = h('div', { class: 'rcard report' });
  function drawReport() {
    const v = verifyPost(p);
    report.replaceChildren(h('div', { class: 'rhead' }, h('b', {}, 'Verification'), h('span', { class: `chip ${v.blockers ? 'bad' : v.warnings ? 'warn' : 'ok'}` }, v.blockers ? `${v.blockers} blocker${v.blockers > 1 ? 's' : ''}` : v.warnings ? `${v.warnings} to improve` : 'Ready')),
      h('div', { class: 'meter' }, h('i', { style: `width:${v.completeness}%` })), h('div', { class: 'meta' }, `Completeness ${v.completeness}% (a checklist, not a peer review)`),
      ...v.items.map(r => h('div', { class: 'vrow' }, h('span', { class: `chip ${r.state}` }, r.label), h('div', { class: 'meta' }, r.detail))));
  }

  // authors
  const authorsBox = h('div', {});
  const drawAuthors = () => authorsBox.replaceChildren(...p.authors.map((a, i) => h('div', { class: 'authorrow' },
    h('div', { class: 'grid2' }, field('Full name', inp(() => a.name, v => (a.name = v), 'e.g. Dr Asha Rao')), field('Evidara ID', inp(() => a.memberId, v => (a.memberId = v.toUpperCase()), 'e.g. CARD-7K3QX7')),
      field('ORCID iD', inp(() => a.orcid, v => (a.orcid = v.trim()), '0000-0000-0000-0000'), 'Check digit is verified'), field('Affiliation', inp(() => a.affiliation, v => (a.affiliation = v), 'Department, institution, city'))),
    h('div', { class: 'chips' }, ...CREDIT.map(r => h('button', { type: 'button', class: 'chip pick' + (a.roles.includes(r) ? ' on' : ''), onclick: () => { a.roles = a.roles.includes(r) ? a.roles.filter(x => x !== r) : [...a.roles, r]; drawAuthors(); autosave(); } }, r))),
    h('div', { class: 'row' }, check('Corresponding author', () => a.corresponding, v => (a.corresponding = v)),
      p.authors.length > 1 ? h('button', { class: 'linkbtn', type: 'button', onclick: () => { p.authors.splice(i, 1); drawAuthors(); autosave(); } }, 'Remove author') : null))),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => { p.authors.push({ name: '', memberId: '', orcid: '', affiliation: '', roles: [], corresponding: false }); drawAuthors(); autosave(); } }, '+ Add author'));
  drawAuthors();

  // sections
  const secBox = h('div', {});
  const drawSecs = () => secBox.replaceChildren(...p.sections.map((s, i) => h('div', { class: 'secrow' },
    h('div', { class: 'row' }, inp(() => s.title, v => (s.title = v), 'Section title'), h('button', { class: 'linkbtn', type: 'button', onclick: () => { p.sections.splice(i, 1); drawSecs(); autosave(); } }, 'Remove')),
    text(() => s.text, v => (s.text = v), `Write the ${s.title || 'section'}…`, 8))),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => { p.sections.push({ title: 'New section', text: '' }); drawSecs(); autosave(); } }, '+ Add section'));
  drawSecs();

  // keywords
  const kwIn = h('input', { type: 'text', placeholder: 'Type a keyword and press Enter' });
  const kwBox = h('div', { class: 'chips' });
  const drawKw = () => kwBox.replaceChildren(...p.keywords.map(k => h('button', { type: 'button', class: 'chip pick on', onclick: () => { p.keywords = p.keywords.filter(x => x !== k); drawKw(); autosave(); } }, k + ' ×')));
  kwIn.addEventListener('keydown', e => { if (e.key === 'Enter' && kwIn.value.trim()) { e.preventDefault(); if (!p.keywords.includes(kwIn.value.trim()) && p.keywords.length < 12) p.keywords.push(kwIn.value.trim()); kwIn.value = ''; drawKw(); autosave(); } });
  drawKw();

  // media
  const imgBox = h('div', { class: 'imggrid' });
  const drawImgs = () => imgBox.replaceChildren(...p.images.map((im, i) => h('figure', { class: 'imgcard' }, h('img', { src: im.src, alt: im.alt || '' }),
    inp(() => im.caption, v => (im.caption = v), 'Caption (shown under the image)'), inp(() => im.alt, v => (im.alt = v), 'Alt text (describe the image)'),
    h('button', { class: 'linkbtn', type: 'button', onclick: () => { p.images.splice(i, 1); drawImgs(); autosave(); } }, 'Remove'))));
  const imgIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async () => {
    for (const f of imgIn.files) { if (p.images.length >= 12) { toast('Up to 12 images'); break; } try { p.images.push({ src: await compressImage(f), caption: '', alt: '' }); } catch { toast(`Could not read ${f.name}`); } }
    imgIn.value = ''; drawImgs(); autosave();
  } });
  drawImgs();
  const vidBox = h('div', {});
  const vidIn = h('input', { type: 'url', placeholder: 'YouTube or Vimeo link (public or unlisted)' });
  const drawVids = () => vidBox.replaceChildren(...p.videos.map((v, i) => h('div', { class: 'row vidrow2' }, icon('reels', 18), h('span', {}, v.url), h('span', { class: 'chip' }, v.kind),
    h('button', { class: 'linkbtn', type: 'button', onclick: () => { p.videos.splice(i, 1); drawVids(); autosave(); } }, 'Remove'))));
  drawVids();

  // references
  const refOut = h('div', {});
  const drawRefs = () => refOut.replaceChildren(...(p.refChecks || []).map(r => h('div', { class: 'vrow' }, h('span', { class: `chip ${r.retracted ? 'bad' : r.ok ? 'ok' : 'warn'}` }, r.retracted ? 'Retracted' : r.ok ? 'Found' : 'Not found'),
    h('div', { class: 'meta' }, `${r.doi}${r.title ? ' · ' + r.title + (r.year ? ` (${r.year})` : '') : r.error ? ' · ' + r.error : ''}`))));
  drawRefs();
  const checkRefs = async () => {
    const dois = [...new Set((String(p.references).match(/10\.\d{4,9}\/[^\s"<>,;]+/g) || []).map(d => d.replace(/[.)\]]+$/, '')))].slice(0, 60);
    if (!dois.length) { toast('No DOIs found in the references'); return; }
    refOut.replaceChildren(h('div', { class: 'meta' }, h('span', { class: 'spinner' }), ` Checking ${dois.length} DOI(s) against OpenAlex…`));
    const res = [];
    for (const d of dois) { const r = await checkDoi(d); res.push({ doi: d, ...r }); }
    p.refChecks = res; drawRefs(); autosave();
  };

  const d = p.decl;
  const formEl = h('div', { class: 'pubform' },
    h('section', { class: 'card step' }, h('h3', {}, '1 · Type, title & keywords'),
      h('div', { class: 'grid2' }, field('Type', selectEl((evd ? COMPLETED_TYPES : TYPES).map(t => [t, t]), () => p.type, v => (p.type = v))), field('Domain', selectEl(DOMAINS.map(([c, l]) => [c, `${l} (${c})`]), () => p.domain, v => (p.domain = v)))),
      field('Title', inp(() => p.title, v => (p.title = v), 'A clear, specific title'), 'Avoid overclaiming words'), field('Short title', inp(() => p.shortTitle, v => (p.shortTitle = v), 'Up to 60 characters')),
      field('Keywords', kwIn), kwBox),
    h('section', { class: 'card step' }, h('h3', {}, '2 · Authors, profiles & contributions'), authorsBox),
    h('section', { class: 'card step' }, h('h3', {}, '3 · Structured abstract'),
      ...['background', 'methods', 'results', 'conclusion'].map(k => field(k[0].toUpperCase() + k.slice(1), text(() => p.abstract[k], v => (p.abstract[k] = v), '', 3)))),
    h('section', { class: 'card step' }, h('h3', {}, '4 · Full paper'), h('p', { class: 'meta' }, 'Introduction, methods, results, discussion and conclusion. Add or rename sections as needed.'), secBox),
    h('section', { class: 'card step' }, h('h3', {}, '5 · Images & videos'),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => imgIn.click() }, '+ Add images'), h('span', { class: 'meta' }, 'Compressed to WebP, up to 12. No patient images.')), imgIn, imgBox,
      h('div', { class: 'row', style: 'margin-top:12px' }, vidIn, h('button', { class: 'btn small', type: 'button', onclick: () => {
        const u = vidIn.value.trim(); const kind = youtubeId(u) ? 'YouTube' : vimeoId(u) ? 'Vimeo' : null;
        if (!kind) { toast('Paste a YouTube or Vimeo link'); return; } p.videos.push({ url: u, kind }); vidIn.value = ''; drawVids(); autosave(); } }, '+ Add video')), vidBox,
      h('p', { class: 'meta' }, 'Videos are linked, not uploaded, so the site stays free and fast. Add as many as you need.')),
    h('section', { class: 'card step' }, h('h3', {}, '6 · Personal view & suggestions'), h('p', { class: 'meta' }, 'Shown separately and clearly labelled as the author\'s opinion.'),
      field('Personal view', text(() => p.personal, v => (p.personal = v), 'Your perspective on the findings and their meaning in practice…', 4)),
      field('Suggestions', text(() => p.suggestions, v => (p.suggestions = v), 'What should colleagues do, test or study next?', 3))),
    h('section', { class: 'card step' }, h('h3', {}, '7 · References'), text(() => p.references, v => (p.references = v), 'Paste your reference list (include DOIs where possible)', 6),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: checkRefs }, 'Check references'), h('span', { class: 'meta' }, 'Every DOI is checked: does it exist, and is it retracted?')), refOut),
    evd ? h('section', { class: 'card step evdtrack' }, h('h3', {}, 'Completed study (Publish with Evidara)'),
      check('Data collection and analysis are complete, and the results are reported here', () => d.completed, v => (d.completed = v)),
      h('div', { class: 'grid2' }, field('Completion date', inp(() => d.completionDate, v => (d.completionDate = v), 'YYYY-MM')),
        field('Published before?', selectEl([['none', 'No'], ['preprint', 'Yes, as a preprint'], ['published', 'Yes, in a journal']], () => d.prior, v => (d.prior = v)))),
      field('Preprint link (if any)', inp(() => d.priorLink, v => (d.priorLink = v), 'https://…'))) : null,
    h('section', { class: 'card step' }, h('h3', {}, '8 · Quality, declarations & clearance'),
      h('div', { class: 'grid2' },
        field('Reporting guideline', selectEl(Object.entries(GUIDES), () => d.guideline, v => (d.guideline = v))),
        h('div', { style: 'align-self:end' }, check('I completed the guideline checklist', () => d.guidelineDone, v => (d.guidelineDone = v))),
        field('Ethics approval', selectEl([['', 'Choose…'], ['approved', 'Approved by an ethics committee'], ['not-required', 'Not required (state why in main text)']], () => d.ethics, v => (d.ethics = v))),
        field('Approval reference', inp(() => d.ethicsId, v => (d.ethicsId = v), 'Committee name and approval number')),
        field('Consent', inp(() => d.consent, v => (d.consent = v), 'e.g. Written informed consent obtained for publication')),
        field('Registration ID', inp(() => d.registry, v => (d.registry = v.trim()), 'NCT…, CTRI/…, ISRCTN…, CRD…'), 'Format is verified'),
        field('Licence', selectEl([['CC BY 4.0', 'CC BY 4.0 (recommended)'], ['CC BY-NC 4.0', 'CC BY-NC 4.0']], () => d.licence, v => (d.licence = v)))),
      field('Funding', text(() => d.funding, v => (d.funding = v), 'Who funded this work, or "No specific funding"', 2)),
      field('Conflicts of interest', text(() => d.coi, v => (d.coi = v), 'Declare all, or "None declared"', 2)),
      field('Data availability', text(() => d.data, v => (d.data = v), 'Where the data can be found, or why it cannot be shared', 2)),
      field('AI-use declaration', text(() => d.ai, v => (d.ai = v), 'Which AI tools were used and for what, or "No AI tools used"', 2)),
      check('This work is original, not plagiarised, and not under review elsewhere', () => d.originality, v => (d.originality = v)),
      check('I hold the rights to every image and video, and none shows identifiable patients', () => d.rightsImages, v => (d.rightsImages = v))));

  const actions = h('div', { class: 'row pubactions' },
    h('button', { class: 'btn', type: 'button', onclick: () => save(false) }, 'Save draft'),
    h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await save(true); location.hash = `#post/draft:${p.id}`; } }, 'Preview'),
    h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
      const v = verifyPost(p);
      if (v.blockers) { toast(`Fix ${v.blockers} blocker(s) in the Verification panel first`); return; }
      if (online()) {
        if (!requireVerified('submit for publication')) return;
        try { await api('/posts', { method: 'POST', body: { post: p, report: v } }); p.status = 'submitted'; await save(true); toast('Submitted. The editor will review it; you will see the status in your drafts.'); } catch (e) { toast(e.message); }
        return;
      }
      p.status = 'submitted'; await save(true);
      const pkg = { kind: 'evidara-submission', version: 1, track: p.track || 'community', createdAt: new Date().toISOString(), post: p, report: v };
      download(`evidara-submission-${(p.shortTitle || p.title).replace(/\W+/g, '-').slice(0, 40)}.json`, JSON.stringify(pkg), 'application/json');
      toast('Submission package downloaded. Send it to the Evidara admin.');
    } }, 'Submit for verification'));

  const draftsList = h('div', { class: 'rcard' }, h('b', {}, 'Your drafts'), ...(drafts.length ? drafts.map(x => h('a', { class: 'rlink', href: `#publish/${x.id}` }, icon('pdf', 16), ` ${x.title}`, h('span', { class: 'meta' }, ` · ${x.status}`)))
    : [h('div', { class: 'meta' }, 'No drafts yet.')]), h('a', { class: 'btn small ghost', href: '#publish' }, '+ New post'));
  view.replaceChildren(h('div', { class: 'cols paper' },
    h('div', { class: 'center wide' },
      h('h1', { class: 'ptitle-xl' }, evd ? 'Publish with Evidara' : 'Publish'),
      evd ? h('div', { class: 'chips' }, h('span', { class: 'chip ok' }, 'Completed studies only'), h('a', { class: 'chip', href: '#publish-with-us' }, 'How it works ›')) : h('div', { class: 'chips' }, h('a', { class: 'chip ok', href: '#publish/new/evidara' }, 'Have a completed study? Publish with Evidara ›')),
      h('p', { class: 'sub' }, 'Write a full post with media and declarations. Automated checks run as you type. When you submit, you get a package for the admin; once verified, it appears in Community for everyone.'),
      formEl, actions),
    h('aside', { class: 'rail' }, report, draftsList,
      h('div', { class: 'rfoot' }, 'Drafts autosave in this browser. Nothing is public until the admin verifies and publishes it.'))));
  drawReport();
}

// ---------- render a post (published or draft preview) ----------
export async function renderPost(container, p, { draft = false } = {}) {
  const v = verifyPost(p);
  const by = p.authors || [];
  container.replaceChildren(h('div', { class: 'cols paper' },
    h('div', { class: 'center wide' },
      h('header', { class: 'phead' },
        p.articleId ? h('div', { class: 'potd-tag' }, icon('check', 14), ` Published with Evidara · ${p.articleId}`) : null,
        p.ev ? h('div', { class: 'evbanner' }, h('span', { class: 'evmark inline' }, 'EV'), ' Verified & liked by Evidara') : null,
        h('div', { class: 'chips' }, h('span', { class: `chip ${draft ? 'warn' : 'ok'}` }, draft ? 'Draft preview' : p.track === 'evidara' ? 'Peer-verified study' : 'Verified community post'), h('span', { class: 'chip' }, p.type), h('span', { class: 'chip' }, domainByCode(p.domain)?.[1] || ''), h('span', { class: 'chip' }, p.decl?.licence || '')),
        h('h1', { class: 'ptitle-xl' }, p.title || 'Untitled'),
        h('div', { class: 'achips' }, ...by.map(a => h('span', { class: 'achip' }, h('span', { class: 'av' }, (a.name || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()), a.name,
          a.memberId ? h('span', { class: 'idbadge sm' }, a.memberId) : null, a.orcid && validOrcid(a.orcid) ? h('a', { class: 'orcid', href: `https://orcid.org/${a.orcid}`, target: '_blank', rel: 'noopener noreferrer', title: 'ORCID' }, icon('check', 12)) : null))),
        h('div', { class: 'chips' }, ...(p.keywords || []).map(k => h('span', { class: 'chip' }, k)))),
      h('div', { class: 'card' }, h('h3', {}, 'Abstract'), h('div', { class: 'abstract' }, ...Object.entries(p.abstract || {}).filter(([, t]) => t?.trim()).map(([k, t]) => [h('h4', {}, k), h('p', {}, t)]))),
      ...(p.videos || []).map(vd => {
        const yid = youtubeId(vd.url), vid = vimeoId(vd.url);
        const src = yid ? `https://www.youtube-nocookie.com/embed/${yid}` : vid ? `https://player.vimeo.com/video/${vid}` : null;
        return src ? h('div', { class: 'card' }, h('div', { class: 'embed' }, h('iframe', { src, title: 'Author video', loading: 'lazy', allow: 'fullscreen; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' }))) : null;
      }),
      h('article', { class: 'reader' }, ...(p.sections || []).filter(s => s.text?.trim()).map(s => h('section', {}, h('h2', {}, s.title), ...s.text.split(/\n{2,}/).map(par => h('p', {}, par)))),
        ...(p.images || []).map((im, i) => h('figure', { class: 'rfigure' }, h('img', { src: im.src, alt: im.alt || `Figure ${i + 1}` }), h('figcaption', {}, h('b', {}, `Figure ${i + 1}`), ' ', im.caption || '')))),
      (p.personal || p.suggestions) ? h('div', { class: 'card opinion' }, h('h3', {}, 'Author\'s personal view (opinion)'), p.personal ? h('p', {}, p.personal) : null, p.suggestions ? [h('h4', {}, 'Suggestions'), h('p', {}, p.suggestions)] : null) : null,
      h('div', { class: 'card' }, h('h3', {}, 'Declarations'),
        ...[['Ethics', p.decl?.ethics === 'not-required' ? 'Not required' : p.decl?.ethicsId], ['Consent', p.decl?.consent], ['Registration', p.decl?.registry], ['Reporting guideline', GUIDES[p.decl?.guideline] || ''],
          ['Funding', p.decl?.funding], ['Conflicts of interest', p.decl?.coi], ['Data availability', p.decl?.data], ['AI use', p.decl?.ai]].filter(([, t]) => t).map(([l, t]) => h('p', {}, h('b', {}, l + ': '), t)),
        h('h4', {}, 'Contributions'), ...by.map(a => h('p', {}, h('b', {}, (a.name || 'Author') + ': '), (a.roles || []).join(', ') || '—', a.affiliation ? ` · ${a.affiliation}` : ''))),
      p.references ? h('div', { class: 'card' }, h('h3', {}, 'References'), h('pre', { class: 'refs' }, p.references)) : null,
      p.articleId ? h('div', { class: 'card' }, h('h3', {}, 'How to cite'), h('pre', { class: 'mono cite-out' }, `${by.map(a => a.name).join(', ')}. ${p.title}. Evidara. ${new Date(p.publishedAt).getFullYear()}. Article ${p.articleId}. ${location.origin}${location.pathname}#post/${p.id}`)) : null,
      postMedia(p)),
    h('aside', { class: 'rail' }, h('div', { class: 'rcard' }, h('div', { class: 'rhead' }, h('b', {}, 'Verification report'), h('span', { class: `chip ${v.blockers ? 'bad' : v.warnings ? 'warn' : 'ok'}` }, `${v.completeness}% complete`)),
      ...v.items.map(r => h('div', { class: 'vrow' }, h('span', { class: `chip ${r.state}` }, r.label), h('div', { class: 'meta' }, r.detail)))),
      draft ? h('a', { class: 'btn', href: `#publish/${p.id}` }, 'Back to editing') : null)));
}

export async function postPage([id]) {
  if (online() && id && !id.startsWith('draft:')) { try { const r = await api('/posts/' + encodeURIComponent(id)); if (r.post) return renderPost(view, r.post, { draft: r.post.status !== 'published' }); } catch { /* fall back to static */ } }
  if (id?.startsWith('draft:')) {
    const p = await idb.get('pub:' + id.slice(6));
    if (!p) { view.replaceChildren(h('div', { class: 'empty' }, 'Draft not found on this device.')); return; }
    return renderPost(view, p, { draft: true });
  }
  const { loadPosts } = await import('./feed.js');
  const p = (await loadPosts()).find(x => x.id === id);
  if (!p) { view.replaceChildren(h('div', { class: 'empty' }, 'Post not found.')); return; }
  return renderPost(view, p);
}

// Audio + video for a post, built from its own text and images (same rules as papers: its own words only).
export function postSections(p) {
  const abs = Object.entries(p.abstract || {}).filter(([, t]) => t?.trim()).map(([k, t]) => ({ title: k[0].toUpperCase() + k.slice(1), text: t }));
  return [...abs, ...(p.sections || []).filter(s => s.text?.trim()).map(s => ({ title: s.title, text: s.text }))];
}
export function postEpisode(p, format = 'short') {
  const s = Audio.buildDocScript({ title: p.title, by: (p.authors || []).map(a => a.name).join(', '), source: 'Evidara' }, postSections(p), format);
  return { key: 'post:' + p.id, title: p.title, journal: 'Evidara', year: p.publishedAt ? new Date(p.publishedAt).getFullYear() : '', format, formatName: Audio.FORMATS[Audio.fmtId(format)].name, lines: s.lines, basis: 'post', cover: (p.images || []).slice(0, 1).map(i => i.src) };
}
function postMedia(p) {
  const secs = postSections(p);
  if (!secs.length) return null;
  const sents = secs.flatMap(s => splitSentences(s.text).map(t => ({ t, src: s.title }))).filter(x => x.t.length > 40);
  const pick = sents.filter((_, i) => i % Math.max(1, Math.floor(sents.length / 5)) === 0).slice(0, 5);
  const slides = [{ k: p.type || 'Evidara', t: p.title, s: (p.authors || []).map(a => a.name).join(', '), say: p.title, img: p.images?.[0] ? [p.images[0].src] : null, cls: 'title' },
    ...pick.map((x, i) => ({ k: x.src, t: x.t, s: 'From the article', say: x.t, img: p.images?.[i + 1] ? [p.images[i + 1].src] : null, cls: 'quote' })),
    { k: 'Evidara', t: p.articleId ? `Article ${p.articleId}` : 'Community article', s: 'Read the full article on Evidara', say: 'Read the full article on Evidara.', cls: 'cite' }];
  let fmt = 'short';
  const seg = h('div', { class: 'seg small' });
  const drawSeg = () => seg.replaceChildren(...Object.entries(Audio.FORMATS).filter(([k]) => k !== 'custom').map(([k, f]) => h('button', { type: 'button', class: k === fmt ? 'on' : '', onclick: () => { fmt = k; drawSeg(); } }, f.name)));
  drawSeg();
  return h('div', { class: 'card' }, h('h3', {}, 'Listen & watch'),
    h('div', { class: 'row' }, seg, h('button', { class: 'playbig', type: 'button', 'aria-label': 'Play audio', onclick: () => Pod.enqueueEpisode(postEpisode(p, fmt)) }, icon('play', 24))),
    videoPlayer({ title: p.title, slides, aspect: '16:9', downloadName: 'evidara-article.webm' }));
}

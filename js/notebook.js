// Studio notebook (NotebookLM-style): add documents → get one audio track, one video and images.
// NotebookLM has no public API, so the same idea runs here, entirely in your browser: files are read locally
// (PDF via pdf.js, Apache-2.0, served from this site), nothing is uploaded anywhere.
import { h, toast, splitSentences, uid, download } from './util.js';
import { icon } from './icons.js';
import { idb } from './idb.js';
import { getArticle, getFullText, abstractSections, keyOf } from './api.js';
import { reuse } from './verify.js';
import * as Audio from './audio.js';
import * as Pod from './podcast.js';
import * as Lib from './library.js';
import * as P from './prompts.js';
import { videoPlayer } from './vplayer.js';
import { updateQuotaLine, vars } from './core.js';
import { notebookLmCard } from './notebooklm.js';

const PATIENT = [[/\b\d{4}\s?\d{4}\s?\d{4}\b/, 'a 12-digit ID number (Aadhaar-like)'], [/\b(MRN|UHID|IP ?No|OPD ?No|hospital number)\b/i, 'a hospital record number'],
  [/\b(DOB|date of birth)\s*[:\-]/i, 'a date of birth'], [/\b[6-9]\d{9}\b/, 'a phone number'], [/\bpatient name\s*[:\-]/i, 'a patient name field']];
const HEAD = /^(abstract|summary|background|introduction|aims?|objectives?|methods?|materials and methods|methodology|patients and methods|study design|results?|findings|discussion|conclusions?|limitations?|strengths and limitations|implications|recommendations)\b[\s:.]*$/i;

let pdfjsP = null;
function pdfjs() {
  if (pdfjsP) return pdfjsP;
  pdfjsP = new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement('script'); s.src = 'vendor/pdfjs/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; resolve(window.pdfjsLib); };
    s.onerror = () => { pdfjsP = null; reject(new Error('Could not load the PDF reader')); };
    document.head.append(s);
  });
  return pdfjsP;
}

function toSections(lines) {
  const out = []; let cur = { title: 'Opening', text: '' };
  for (const raw of lines) {
    const ln = raw.replace(/\s+/g, ' ').trim(); if (!ln) continue;
    const plainHead = ln.replace(/^\d+(\.\d+)*\.?\s+/, '');
    if (/^(references|bibliography|acknowledg)/i.test(plainHead) && ln.length < 40) break;
    if (ln.length < 60 && HEAD.test(plainHead)) { if (cur.text.trim()) out.push(cur); cur = { title: plainHead.replace(/[:.]$/, ''), text: '' }; continue; }
    cur.text += (cur.text && !/[-‐]$/.test(cur.text) ? ' ' : '') + ln.replace(/[-‐]$/, '');
  }
  if (cur.text.trim()) out.push(cur);
  return out.map(s => ({ title: s.title, text: s.text.replace(/\s+/g, ' ').trim() })).filter(s => s.text.length > 20);
}

async function readPdf(file) {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const lines = []; const pages = pdf.numPages;
  for (let i = 1; i <= Math.min(pages, 80); i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let line = '';
    for (const it of tc.items) { line += it.str; if (it.hasEOL) { lines.push(line); line = ''; } else if (it.str && !it.str.endsWith(' ')) line += ' '; }
    if (line) lines.push(line);
  }
  const meta = await pdf.getMetadata().catch(() => null);
  return { pages, sections: toSections(lines), title: meta?.info?.Title || '' };
}

async function renderPages(file, max = 8, scale = 1.1) {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const urls = [];
  for (let i = 1; i <= Math.min(pdf.numPages, max); i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (blob) urls.push(URL.createObjectURL(blob));
  }
  return urls;
}

async function readText(file) {
  const text = await file.text();
  const isHtml = /\.html?$/i.test(file.name);
  const plain = isHtml ? (new DOMParser().parseFromString(text, 'text/html').body.textContent || '') : text;
  const lines = plain.split(/\r?\n/).map(l => l.replace(/^#+\s*/, ''));
  return { pages: 1, sections: toSections(lines), title: '' };
}

function screen(sections) {
  const all = sections.map(s => s.text).join(' ');
  return PATIENT.filter(([re]) => re.test(all)).map(([, what]) => what);
}

// Quote card image (1080×1350) drawn with the current theme.
function quoteCard(text, title) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const x = c.getContext('2d'); const css = getComputedStyle(document.documentElement); const v = n => css.getPropertyValue(n).trim();
  const g = x.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, v('--accent-3')); g.addColorStop(.65, v('--deep')); g.addColorStop(1, '#140c1c');
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
  x.globalAlpha = .5; const rg = x.createRadialGradient(860, 220, 20, 860, 220, 420); rg.addColorStop(0, v('--petal-b')); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rg; x.fillRect(0, 0, 1080, 1350); x.globalAlpha = 1;
  const disp = v('--font-display'), body = v('--font-body');
  x.fillStyle = v('--accent'); x.font = `800 150px ${disp}`; x.fillText('“', 80, 250);
  x.fillStyle = '#fff';
  let size = 58; let lines;
  const wrap = (t, w) => { const ws = t.split(/\s+/); const out = []; let cur = ''; for (const wd of ws) { const tt = cur ? cur + ' ' + wd : wd; if (x.measureText(tt).width > w && cur) { out.push(cur); cur = wd; } else cur = tt; } if (cur) out.push(cur); return out; };
  do { x.font = `700 ${size}px ${body}`; lines = wrap(text, 900); size -= 2; } while (lines.length * size * 1.3 > 760 && size > 26);
  lines.forEach((l, i) => x.fillText(l, 90, 340 + i * (size + 2) * 1.3));
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = `500 30px ${body}`;
  wrap(title, 900).slice(0, 2).forEach((l, i) => x.fillText(l, 90, 1180 + i * 40));
  x.fillStyle = '#fff'; x.font = `800 30px ${disp}`; x.fillText('EVIDARA', 90, 1290);
  x.font = `500 22px ${body}`; x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText('Quoted word for word from the source document', 330, 1290);
  return c;
}

export function mountNotebook(root) {
  let docs = [];      // {id, name, kind, pages, sections, title, file?, article?}
  let activeFmt = 'short';
  const srcList = h('div', { class: 'nbsrcs' });
  const out = h('div', { class: 'nbout' });
  const input = h('input', { type: 'file', multiple: true, accept: '.pdf,.txt,.md,.html,.htm,application/pdf,text/plain,text/markdown,text/html', hidden: true });
  const paperId = h('input', { type: 'text', placeholder: 'Or add a paper by PMCID / DOI / PMID, e.g. PMC13789448', 'aria-label': 'Paper ID' });
  const paste = h('textarea', { placeholder: 'Or paste text (notes, a protocol, an abstract)…', 'aria-label': 'Pasted text' });

  const persist = async () => {
    await idb.set('nb:index', docs.map(d => d.id));
    for (const d of docs) await idb.set('nb:doc:' + d.id, { ...d, urls: undefined });
  };
  const restore = async () => {
    const ids = (await idb.get('nb:index')) || [];
    docs = (await Promise.all(ids.map(id => idb.get('nb:doc:' + id)))).filter(Boolean);
    drawSources(); drawOut();
  };

  async function addFiles(files) {
    for (const f of files) {
      if (f.size > 60 * 1048576) { toast(`${f.name} is over 60 MB`); continue; }
      const busy = h('div', { class: 'nbsrc' }, h('span', { class: 'spinner' }), ` Reading ${f.name}…`); srcList.append(busy);
      try {
        const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
        const r = isPdf ? await readPdf(f) : await readText(f);
        if (!r.sections.length) throw new Error('no readable text (scanned PDFs need OCR, which is not built in yet)');
        const hits = screen(r.sections);
        if (hits.length) throw new Error(`it seems to contain patient information (${hits.join(', ')}). Remove it and try again`);
        const junk = !r.title || r.title.length < 4 || /^(data:|https?:|file:|microsoft word|untitled|document\d*$)/i.test(r.title) || /\.(docx?|pdf|txt)$/i.test(r.title);
        const firstLine = (r.sections[0]?.title !== 'Opening' ? '' : (splitSentences(r.sections[0].text)[0] || '')).slice(0, 100);
        docs.push({ id: uid(), name: f.name, kind: isPdf ? 'PDF' : 'Text', pages: r.pages, sections: r.sections, title: junk ? (firstLine.length > 8 ? firstLine : f.name.replace(/\.[^.]+$/, '')) : r.title, file: isPdf ? f : null });
      } catch (e) { toast(`${f.name}: ${e.message}`); }
      busy.remove();
    }
    await persist(); drawSources(); drawOut();
  }
  async function addPaper() {
    const id = paperId.value.trim(); if (!id) return;
    try {
      const a = await getArticle(id); if (!a) throw new Error('not found');
      if (!reuse(a).derivatives) throw new Error(`its licence (${reuse(a).label || 'none'}) does not allow adapted versions`);
      let secs = abstractSections(a.abstractHtml);
      if (a.pmcid && a.hasFullText) { try { const f = await getFullText(a.pmcid); secs = [...(secs.length ? secs : f.abstract), ...f.sections.map(s => ({ title: s.title, text: s.text }))]; } catch { /* abstract only */ } }
      docs.push({ id: uid(), name: a.title, kind: 'Paper', pages: 0, sections: secs, title: a.title, article: keyOf(a), by: a.authorString });
      paperId.value = ''; await persist(); drawSources(); drawOut();
    } catch (e) { toast(`Could not add: ${e.message}`); }
  }
  async function addPaste() {
    const t = paste.value.trim(); if (t.length < 80) { toast('Paste at least a paragraph'); return; }
    const sections = toSections(t.split(/\r?\n/));
    const hits = screen(sections); if (hits.length) { toast(`Looks like patient information (${hits.join(', ')}). Remove it first.`); return; }
    docs.push({ id: uid(), name: 'Pasted text', kind: 'Text', pages: 1, sections, title: splitSentences(t)[0]?.slice(0, 90) || 'Pasted text' });
    paste.value = ''; await persist(); drawSources(); drawOut();
  }
  input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });

  function drawSources() {
    srcList.replaceChildren(...(docs.length ? docs.map(d => h('div', { class: 'nbsrc' },
      h('span', { class: 'chip' }, d.kind), h('b', {}, d.title),
      h('div', { class: 'meta' }, `${d.pages ? d.pages + ' pages · ' : ''}${d.sections.reduce((n, s) => n + (s.text.match(/\S+/g) || []).length, 0).toLocaleString()} words · ${d.sections.length} section${d.sections.length === 1 ? '' : 's'}: ${d.sections.map(s => s.title).slice(0, 6).join(', ')}`),
      h('button', { class: 'linkbtn', type: 'button', onclick: async () => { docs = docs.filter(x => x !== d); await idb.del('nb:doc:' + d.id); await persist(); drawSources(); drawOut(); } }, 'Remove')))
      : [h('div', { class: 'empty' }, 'Add one or more sources: PDFs, text or Markdown files, a paper from Evidara, or pasted text.')]));
  }

  function meta() {
    const d = docs[0];
    return { title: docs.length > 1 ? `${d.title} and ${docs.length - 1} more source${docs.length > 2 ? 's' : ''}` : d.title, by: d.by || '', source: docs.map(x => x.kind).join(', ') };
  }
  const allSections = () => docs.flatMap(d => d.sections.map(s => ({ title: docs.length > 1 ? `${d.title.slice(0, 40)} · ${s.title}` : s.title, text: s.text })));
  const keySentences = () => {
    const secs = allSections();
    const pref = secs.filter(s => /result|finding|conclusion|summary|abstract/i.test(s.title));
    const pool = (pref.length ? pref : secs).flatMap(s => splitSentences(s.text).filter(t => t.length > 60 && t.length < 320));
    const step = Math.max(1, Math.floor(pool.length / 8));
    return pool.filter((_, i) => i % step === 0).slice(0, 8);
  };

  function drawOut() {
    if (!docs.length) { out.replaceChildren(); return; }
    const fmtSeg = h('div', { class: 'seg' });
    const drawFmt = () => fmtSeg.replaceChildren(...Object.entries(Audio.FORMATS).map(([id, f]) => h('button', { type: 'button', class: id === activeFmt ? 'on' : '', onclick: () => { activeFmt = id; drawFmt(); } }, f.name)));
    drawFmt();
    const audioCard = h('div', { class: 'card' }, h('div', { class: 'rhead' }, h('h3', {}, '1 · Audio track'), h('span', { class: 'meta' }, 'Two hosts, the documents\' own sentences')),
      fmtSeg,
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'playbig', type: 'button', 'aria-label': 'Generate and play audio', onclick: () => {
          const s = Audio.buildDocScript(meta(), allSections(), activeFmt);
          if (s.lines.length < 3) { toast('Not enough text to make audio'); return; }
          Pod.enqueueEpisode({ key: 'doc:' + docs.map(d => d.id).join('+'), title: meta().title, journal: 'Studio notebook', year: '', format: activeFmt, formatName: Audio.FORMATS[activeFmt].name, lines: s.lines, basis: s.basis, cover: [] });
          Lib.add({ kind: 'audio', title: `${Audio.FORMATS[activeFmt].name}: ${meta().title}`, status: 'made', script: s.lines.map(l => l.t).join('\n') });
        } }, icon('play', 26)),
        h('span', { class: 'meta' }, 'Generates instantly and plays in the bar below. Added to your Library.')));

    const vbox = h('div', {});
    const videoCard = h('div', { class: 'card' }, h('div', { class: 'rhead' }, h('h3', {}, '2 · Video'), h('span', { class: 'meta' }, 'Pages and key sentences, narrated')), vbox);
    const buildVideo = async () => {
      vbox.replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'spinner' }), ' Building video…'));
      let pageUrls = [];
      const pdfDoc = docs.find(d => d.file);
      if (pdfDoc) { try { pageUrls = await renderPages(pdfDoc.file, 6, 1); } catch { /* text-only slides */ } }
      const ks = keySentences();
      const slides = [{ k: 'Studio notebook', t: meta().title, s: `${docs.length} source${docs.length > 1 ? 's' : ''}`, say: meta().title, img: pageUrls[0] ? [pageUrls[0]] : null, cls: 'title' },
        ...ks.map((t, i) => ({ k: `Key point ${i + 1}`, t, s: 'Quoted from the source', say: t, img: pageUrls[i + 1] ? [pageUrls[i + 1]] : null, cls: 'quote' })),
        { k: 'Sources', t: docs.map(d => d.title).join(' · ').slice(0, 220), s: 'Made with Evidara Studio', say: 'Made with Evidara Studio.', cls: 'cite' }];
      vbox.replaceChildren(videoPlayer({ title: meta().title, slides, aspect: '16:9', downloadName: 'evidara-notebook.webm' }));
    };
    buildVideo();

    const imgGrid = h('div', { class: 'imggrid' });
    const imagesCard = h('div', { class: 'card' }, h('div', { class: 'rhead' }, h('h3', {}, '3 · Images'), h('span', { class: 'meta' }, 'Quote cards from your sources, plus page images')), imgGrid);
    const buildImages = async () => {
      const cards = keySentences().slice(0, 6).map(t => {
        const c = quoteCard(t, meta().title);
        return h('figure', { class: 'imgcard' }, c, h('figcaption', {}, h('button', { class: 'btn small', type: 'button', onclick: () => {
          if (!Lib.spend('image')) { toast('Daily free image limit reached. It refreshes tomorrow.'); return; }
          updateQuotaLine(); c.toBlob(b => { const a = h('a', { href: URL.createObjectURL(b), download: 'evidara-quote.png' }); document.body.append(a); a.click(); a.remove(); }, 'image/png');
        } }, 'Download PNG')));
      });
      imgGrid.replaceChildren(...cards);
      const pdfDoc = docs.find(d => d.file);
      if (pdfDoc) {
        try {
          const urls = await renderPages(pdfDoc.file, 4, 0.8);
          urls.forEach((u, i) => imgGrid.append(h('figure', { class: 'imgcard page' }, h('img', { src: u, alt: `Page ${i + 1}` }), h('figcaption', {}, h('a', { class: 'btn small ghost', href: u, download: `page-${i + 1}.png` }, `Page ${i + 1} PNG`)))));
        } catch { /* skip */ }
      }
      const prompts = P.IMAGE_STYLES.slice(0, 4).map(st => P.fill(st.p, vars({ topic: meta().title.slice(0, 80) })));
      imgGrid.append(h('div', { class: 'imgcard prompts' }, h('b', {}, 'AI image prompts for this notebook'), h('p', { class: 'meta' }, 'Paste into any image generator. Label the results as illustrations.'),
        ...prompts.map(t => h('pre', { class: 'mono', style: 'white-space:pre-wrap' }, t))));
    };
    buildImages();
    out.replaceChildren(audioCard, videoCard, imagesCard);
  }

  root.append(
    h('div', { class: 'card nbhead' },
      h('div', { class: 'rhead' }, h('h3', {}, 'Notebook'), h('span', { class: 'chip ok' }, 'Runs in your browser · nothing uploaded')),
      h('p', { class: 'meta' }, 'Add documents, then get one audio track, one video and a set of images. Every spoken and quoted line comes from your sources. Documents with patient information are refused.'),
      h('div', { class: 'dropzone', tabindex: 0, role: 'button', 'aria-label': 'Add files', onclick: () => input.click(),
        onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
        ondragover: e => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: e => e.currentTarget.classList.remove('over'),
        ondrop: e => { e.preventDefault(); e.currentTarget.classList.remove('over'); addFiles([...e.dataTransfer.files]); } },
        icon('pdf', 30), h('b', {}, 'Drop PDFs, .txt, .md or .html here'), h('span', { class: 'meta' }, 'or click to choose files (up to 60 MB each)')), input,
      h('div', { class: 'row', style: 'margin-top:10px' }, paperId, h('button', { class: 'btn small', type: 'button', onclick: addPaper }, 'Add paper')),
      h('div', { style: 'margin-top:10px' }, paste), h('div', { class: 'row' }, h('button', { class: 'btn small ghost', type: 'button', onclick: addPaste }, 'Add pasted text'))),
    h('div', { class: 'card' }, h('h3', {}, 'Sources'), srcList),
    out,
    notebookLmCard(() => docs));
  restore();
}

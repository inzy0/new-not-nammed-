// Study visuals.
//  1. Design covers: drawn in the browser for every paper, styled by study type and topic. Free, instant, offline.
//  2. AI illustrations: a prompt built from the paper's title, MeSH terms/keywords and study type, sent to the
//     Evidara AI Worker (Cloudflare Workers AI, FLUX.1 schnell) when the owner has deployed it. Always labelled
//     "AI illustration, not from the paper"; prompts forbid text, numbers, faces and patients.
//  3. Official figures come from the article itself (figures.js) and are shown alongside, never replaced.
import { idb } from './idb.js';
import { CONFIG } from './config.js';
import { studyDesign } from './verify.js';
import { store } from './util.js';

// ---------- topic + concepts from the record ----------
const GENERIC_MESH = /^(humans?|male|female|adult|aged|middle aged|young adult|adolescent|child|infant|animals?|mice|rats|retrospective studies|prospective studies|cohort studies|cross-sectional studies|risk factors|treatment outcome|follow-up studies|time factors|surveys and questionnaires|incidence|prevalence)$/i;
export function topicOf(a) {
  return (a.title || '').replace(/\b(a|an)\s+(systematic review|meta-analysis|randomi[sz]ed controlled trial|cohort study|cross-sectional study|case report|retrospective study|prospective study)[^:]*$/i, '')
    .replace(/[:;].*$/, m => m.length > 60 ? '' : m).replace(/\s+/g, ' ').trim().slice(0, 140);
}
export function conceptsOf(a, full) {
  const mesh = (a.mesh || []).filter(m => !GENERIC_MESH.test(m));
  const kw = full?.keywords || [];
  return [...new Set([...mesh, ...kw].map(s => s.replace(/\s*\(.*?\)\s*/g, '').trim()).filter(Boolean))].slice(0, 6);
}

// ---------- style by study type ----------
export const STYLE = {
  'Randomised controlled trial': { name: 'Trial', art: 'clean premium editorial 3D render; two balanced groups of glowing translucent spheres facing each other, symbolising a fair comparison', motif: 'arms' },
  'Systematic review / meta-analysis': { name: 'Synthesis', art: 'elegant data-art mosaic: many small translucent glass tiles flowing and converging into one luminous central form', motif: 'mosaic' },
  'Observational study': { name: 'Cohort', art: 'flowing streams of soft light particles moving through time like a population, abstract and calm', motif: 'streams' },
  'Case report': { name: 'Case', art: 'refined anatomical medical illustration in the style of a modern textbook plate, precise and beautiful', motif: 'rings' },
  'Guideline': { name: 'Guideline', art: 'minimal isometric iconography with a clear stepping-stone pathway, calm and trustworthy', motif: 'steps' },
  'Review': { name: 'Review', art: 'layered paper-cut concept illustration with depth and soft shadows', motif: 'layers' },
  'Preprint': { name: 'Preprint', art: 'modern conceptual illustration with a light blueprint-sketch feel, signalling early findings', motif: 'grid' },
};
const LAB = /cell|molecul|gene|protein|mice|mouse|in vitro|microb|bacteri|virus|immun|receptor|mitochond/i;
export function styleFor(a) {
  const d = studyDesign(a);
  if (STYLE[d]) return { design: d, ...STYLE[d] };
  if (/clinical trial/i.test(d)) return { design: d, ...STYLE['Randomised controlled trial'] };
  if (LAB.test(a.title + ' ' + (a.mesh || []).join(' '))) return { design: d, name: 'Lab', art: 'macro microscopy-style artwork of glowing bioluminescent cellular structures, shallow depth of field', motif: 'cells' };
  return { design: d, name: 'Concept', art: 'modern premium conceptual 3D illustration, soft glass materials', motif: 'bloom' };
}

const PALETTE = { bloom: 'deep teal, plum, coral and orchid', ink: 'warm cream, ink black and brick red', pulse: 'near-black with neon mint and violet', saffron: 'saffron, maroon and deep teal', clinic: 'white, teal and navy' };
export function buildPrompt(a, full, variant = 0) {
  const st = styleFor(a);
  const topic = topicOf(a);
  const concepts = conceptsOf(a, full);
  const comps = ['centred hero composition with generous negative space', 'wide cinematic composition, subject on the right third', 'close-up macro composition with strong depth of field', 'top-down composition with symmetrical balance'];
  const pal = PALETTE[document.documentElement.dataset.theme] || PALETTE.bloom;
  const prompt = `${st.art}. Subject: ${topic}.${concepts.length ? ` Key concepts: ${concepts.join(', ')}.` : ''} ${comps[variant % comps.length]}. Colour palette: ${pal}. ` +
    'Award-winning scientific editorial artwork, highly detailed, soft studio lighting, subtle glow, ultra sharp, magazine cover quality. ' +
    'Strictly no text, no letters, no numbers, no charts with values, no logos, no watermarks, no real people, no faces, no patients, no blood or gore.';
  return { prompt: prompt.slice(0, 2000), style: st, topic, concepts };
}

// ---------- deterministic design covers (canvas) ----------
function rng(seedStr) { let x = 2166136261; for (const c of seedStr) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; }; }
const hueOf = s => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
function wrap(x, text, maxW) { const ws = String(text).split(/\s+/); const out = []; let cur = ''; for (const w of ws) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out; }

export function designCover(a, { w = 1280, h = 720, withText = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const st = styleFor(a); const r = rng((a.id || a.title || 'x') + st.motif);
  const css = getComputedStyle(document.documentElement); const v = n => css.getPropertyValue(n).trim();
  const H = hueOf((a.journal || '') + st.name);
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${H} 55% 22%)`); g.addColorStop(.55, v('--deep') || '#412653'); g.addColorStop(1, `hsl(${(H + 40) % 360} 60% 14%)`);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const glow = (cx, cy, rad, col, a2 = .55) => { const rg = x.createRadialGradient(cx, cy, 0, cx, cy, rad); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.globalAlpha = a2; x.fillStyle = rg; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); x.globalAlpha = 1; };
  const A = v('--petal-a') || '#E0563F', B = v('--petal-b') || '#D174D2', C = v('--petal-c') || '#3F567F';
  glow(w * .78, h * .25, h * .7, B, .45); glow(w * .62, h * .85, h * .6, A, .35);
  const cx = w * .72, cy = h * .5, S = Math.min(w, h);
  x.save();
  if (st.motif === 'arms') {
    for (const side of [-1, 1]) for (let i = 0; i < 26; i++) { const rr = S * (.02 + r() * .05); const px = cx + side * S * (.14 + r() * .12), py = cy + (r() - .5) * S * .55; glow(px, py, rr * 2.4, side < 0 ? A : B, .9); }
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, cy - S * .3); x.lineTo(cx, cy + S * .3); x.stroke();
  } else if (st.motif === 'mosaic') {
    for (let i = 0; i < 140; i++) { const ang = r() * Math.PI * 2, dist = Math.pow(r(), .6) * S * .42; const px = cx + Math.cos(ang) * dist, py = cy + Math.sin(ang) * dist; const s = S * (.012 + (1 - dist / (S * .42)) * .03);
      x.globalAlpha = .25 + (1 - dist / (S * .42)) * .6; x.fillStyle = [A, B, C, '#fff'][i % 4]; x.fillRect(px - s / 2, py - s / 2, s, s); }
    x.globalAlpha = 1; glow(cx, cy, S * .14, '#fff', .55);
  } else if (st.motif === 'streams') {
    for (let k = 0; k < 9; k++) { x.beginPath(); const y0 = h * (.15 + k * .08); x.moveTo(w * .35, y0); for (let i = 0; i <= 20; i++) { const px = w * .35 + (w * .65) * i / 20; x.lineTo(px, y0 + Math.sin(i / 3 + k) * S * .05 + (i / 20) * (cy - y0) * .4); }
      x.strokeStyle = [A, B, C][k % 3]; x.globalAlpha = .55; x.lineWidth = 2 + r() * 4; x.stroke(); }
    x.globalAlpha = 1;
  } else if (st.motif === 'rings') {
    for (let i = 9; i > 0; i--) { x.beginPath(); x.ellipse(cx, cy, S * .045 * i, S * .032 * i, r() * .4, 0, Math.PI * 2); x.strokeStyle = i % 2 ? A : B; x.globalAlpha = .18 + i * .05; x.lineWidth = 2; x.stroke(); }
    x.globalAlpha = 1; glow(cx, cy, S * .1, '#fff', .6);
  } else if (st.motif === 'steps') {
    for (let i = 0; i < 6; i++) { const px = w * .5 + i * S * .09, py = h * .78 - i * S * .09; x.fillStyle = [A, B, C][i % 3]; x.globalAlpha = .85; x.beginPath(); x.moveTo(px, py); x.lineTo(px + S * .08, py - S * .04); x.lineTo(px + S * .16, py); x.lineTo(px + S * .08, py + S * .04); x.closePath(); x.fill(); }
    x.globalAlpha = 1;
  } else if (st.motif === 'layers') {
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(w * .4, h); for (let j = 0; j <= 12; j++) x.lineTo(w * .4 + (w * .6) * j / 12, h * (.35 + i * .1) + Math.sin(j + i) * S * .03); x.lineTo(w, h); x.closePath();
      x.fillStyle = [C, B, A][i % 3]; x.globalAlpha = .28 + i * .1; x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 20; x.fill(); }
    x.shadowBlur = 0; x.globalAlpha = 1;
  } else if (st.motif === 'cells') {
    for (let i = 0; i < 18; i++) { const px = w * .45 + r() * w * .55, py = r() * h, rad = S * (.03 + r() * .09); glow(px, py, rad, [A, B, '#7fffd4'][i % 3], .7); x.beginPath(); x.arc(px, py, rad * .55, 0, Math.PI * 2); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.5; x.stroke(); }
  } else if (st.motif === 'grid') {
    x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1; for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let j = 0; j < h; j += 32) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); }
    x.strokeStyle = B; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, S * .22, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(cx, cy, S * .12, 0, Math.PI * 2); x.strokeStyle = A; x.stroke();
  } else {
    for (let i = 0; i < 6; i++) { x.save(); x.translate(cx, cy); x.rotate(i * Math.PI / 3 + r()); const pg = x.createRadialGradient(0, -S * .18, 5, 0, -S * .18, S * .26); pg.addColorStop(0, [A, B, C][i % 3]); pg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = pg; x.globalAlpha = .7; x.beginPath(); x.ellipse(0, -S * .18, S * .09, S * .2, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    x.globalAlpha = 1;
  }
  x.restore();
  if (withText) {
    const shade = x.createLinearGradient(0, 0, w * .75, 0); shade.addColorStop(0, 'rgba(0,0,0,.55)'); shade.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = shade; x.fillRect(0, 0, w, h);
    const disp = v('--font-display') || 'sans-serif', body = v('--font-body') || 'sans-serif';
    const pad = w * .06;
    x.font = `700 ${Math.round(h * .032)}px ${body}`; const chip = st.design.toUpperCase(); const cw = x.measureText(chip).width + h * .05;
    x.fillStyle = A; x.beginPath(); x.roundRect?.(pad, h * .1, cw, h * .065, h * .033); x.fill?.(); if (!x.roundRect) x.fillRect(pad, h * .1, cw, h * .065);
    x.fillStyle = '#fff'; x.fillText(chip, pad + h * .025, h * .1 + h * .045);
    let size = Math.round(h * .085); let lines;
    do { x.font = `800 ${size}px ${disp}`; lines = wrap(x, topicOf(a) || a.title, w * .58); size -= 2; } while (lines.length > 4 && size > h * .04);
    x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 12;
    lines.slice(0, 4).forEach((ln, i) => x.fillText(ln, pad, h * .3 + size + i * size * 1.12));
    x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,.8)'; x.font = `500 ${Math.round(h * .03)}px ${body}`;
    x.fillText(`${a.journal || 'Evidara'}${a.year ? ' · ' + a.year : ''}`.slice(0, 70), pad, h * .88);
    x.font = `800 ${Math.round(h * .028)}px ${disp}`; x.fillStyle = '#fff'; x.fillText('EVIDARA', w - pad - x.measureText('EVIDARA').width, h * .88);
  }
  return c;
}
export function coverDataUrl(a, opts) { try { return designCover(a, opts).toDataURL('image/jpeg', 0.86); } catch { return ''; } }

// ---------- AI illustrations through the Evidara AI Worker ----------
export const aiReady = () => !!CONFIG.aiWorkerUrl;
function clientId() { let id = store.get('clientId', null); if (!id) { id = crypto.getRandomValues(new Uint32Array(4)).join('-'); store.set('clientId', id); } return id; }
export async function generateAI(key, prompt) {
  if (!aiReady()) throw new Error('AI image generation is not connected yet (the site owner needs to deploy the Evidara AI Worker)');
  const r = await fetch(CONFIG.aiWorkerUrl.replace(/\/$/, '') + '/image', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Evidara-Client': clientId() }, body: JSON.stringify({ prompt, key }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `AI service error ${r.status}`);
  const item = { src: `data:${j.mime || 'image/jpeg'};base64,${j.image}`, prompt, model: j.model || 'FLUX.1 schnell', at: Date.now(), left: j.left };
  const list = (await idb.get('aiimg:' + key)) || [];
  list.unshift(item); await idb.set('aiimg:' + key, list.slice(0, 8));
  return item;
}
export async function aiImages(key) { return (await idb.get('aiimg:' + key)) || []; }
export async function removeAI(key, idx) { const l = await aiImages(key); l.splice(idx, 1); await idb.set('aiimg:' + key, l); }
// Chosen cover per paper (an AI illustration index, 'design', or 'figure').
export const coverChoice = { get: k => store.get('cover:' + k, null), set: (k, v) => store.set('cover:' + k, v) };

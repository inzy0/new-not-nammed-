// Shared state: themes, profile, personalisation variables, quota line.
import { h, store } from './util.js';
import { domainByCode } from './ids.js';
import * as P from './prompts.js';
import * as Lib from './library.js';

// ---------------- themes ----------------
export const THEMES = [
  ['bloom', 'Bloom', 'Teal to plum, coral and orchid. Wide display type.', 'linear-gradient(135deg,#3F567F,#412653 60%,#E0563F)'],
  ['ink', 'Ink', 'Editorial paper, serif headlines.', 'linear-gradient(135deg,#f3ede2,#b4442c)'],
  ['pulse', 'Pulse', 'Dark lab, neon mint and violet.', 'linear-gradient(135deg,#0a0e13,#7a5cff 60%,#39ffb6)'],
  ['saffron', 'Saffron', 'Warm Indian palette, Devanagari-ready fonts.', 'linear-gradient(135deg,#fff5e6,#e86a1f 60%,#8c1c3a)'],
  ['clinic', 'Clinic', 'Clean white and teal.', 'linear-gradient(135deg,#ffffff,#0e7c86)'],
];
const PALETTE_NOTE = { bloom: 'teal, plum, coral #E0563F and orchid #D174D2', ink: 'cream paper, ink black and brick red', pulse: 'near-black, neon mint and violet', saffron: 'saffron orange, maroon and deep teal', clinic: 'white, teal and navy' };
const FONT_NOTE = { bloom: 'wide geometric display type (Unbounded) with Red Hat Text', ink: 'Fraunces serif headlines with Inter Tight', pulse: 'Space Grotesk with JetBrains Mono details', saffron: 'Yatra One display with Mukta', clinic: 'Sora headlines with Manrope' };
export function applyTheme(id) { document.documentElement.dataset.theme = id; store.set('theme', id); }
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
document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target) && !e.target.closest('#themeBtn')) panel.hidden = true; });


// ---------------- profile ----------------
export const profile = () => store.get('profile', { name: '', domain: 'CARD', id: '', audience: 'clinicians', platform: 'reel', tone: 'calm', follows: [] });
export const theme = () => document.documentElement.dataset.theme;

export function vars(extra = {}) {
  const pr = profile(); const d = domainByCode(pr.domain);
  return { specialty: d ? d[1] : '', topic: d ? d[1].toLowerCase() : 'health research', audience: P.AUDIENCES[pr.audience], tone: P.TONES[pr.tone],
    platformId: pr.platform, palette: PALETTE_NOTE[theme()], fontNote: FONT_NOTE[theme()], year: new Date().getFullYear(), design: 'study', question: 'what works?', ...extra };
}

export function updateQuotaLine() {
  const q = k => Lib.quota(k).left;
  document.getElementById('quotaLine').textContent = `Today: ${q('video')} videos · ${q('audio')} audio · ${q('image')} images left · ${Lib.resetNote()}`;
}


// ---------------- bloom art (original SVG, drawn in code) ----------------
export function bloomSVG() {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 600 700'); s.setAttribute('aria-hidden', 'true');
  const u = 'b' + Math.random().toString(36).slice(2, 8);
  s.innerHTML = `<defs>
    <radialGradient id="${u}pa" cx="50%" cy="20%" r="80%"><stop offset="0" style="stop-color:var(--petal-b)"/><stop offset=".55" style="stop-color:var(--petal-a)"/><stop offset="1" style="stop-color:var(--petal-c)" stop-opacity=".2"/></radialGradient>
    <radialGradient id="${u}pb" cx="40%" cy="70%" r="80%"><stop offset="0" stop-color="#ffb36b"/><stop offset=".45" style="stop-color:var(--petal-a)"/><stop offset="1" style="stop-color:var(--deep)" stop-opacity=".1"/></radialGradient>
    <radialGradient id="${u}pc" cx="60%" cy="30%" r="80%"><stop offset="0" style="stop-color:var(--petal-b)"/><stop offset="1" style="stop-color:var(--petal-c)" stop-opacity=".3"/></radialGradient>
    <filter id="${u}soft"><feGaussianBlur stdDeviation="1.2"/></filter></defs>
    <g filter="url(#${u}soft)">
      <path d="M300 40 C420 60 520 170 470 300 C440 380 360 360 330 300 C300 230 220 120 300 40Z" fill="url(#${u}pa)"/>
      <path d="M170 260 C250 230 320 300 300 400 C285 480 210 540 150 500 C90 460 90 300 170 260Z" fill="url(#${u}pb)"/>
      <path d="M360 380 C450 360 520 430 500 520 C480 610 400 650 350 600 C300 550 300 400 360 380Z" fill="url(#${u}pc)"/>
      <path d="M300 300 C305 420 290 560 300 700" style="stroke:var(--petal-c)" stroke-width="10" fill="none" opacity=".6"/>
      <path d="M330 420 C340 500 330 600 335 700" style="stroke:var(--petal-c)" stroke-width="7" fill="none" opacity=".45"/>
    </g>`;
  return s;
}


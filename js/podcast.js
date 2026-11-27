// Podcast player: a persistent Spotify-style bar that keeps playing across pages.
// Episodes are built by audio.js from the paper's own sentences (NotebookLM-style formats).
// Speech comes from the device's built-in voices: free, offline, no limits beyond the daily counter.
import { h, toast, store } from './util.js';
import { icon } from './icons.js';
import { getFullText, abstractSections, keyOf } from './api.js';
import { reuse } from './verify.js';
import * as Audio from './audio.js';
import * as Lib from './library.js';
import { figCandidates } from './figures.js';
import { updateQuotaLine } from './core.js';

const bar = document.getElementById('player');
const S = { queue: [], idx: -1, line: 0, playing: false, rate: store.get('rate', 1), token: 0, showTranscript: false, showQueue: false };
const RATES = [0.8, 1, 1.25, 1.5, 2];
const listeners = new Set();
export const onChange = fn => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => { render(); listeners.forEach(fn => { try { fn(S); } catch {} }); };
export const state = () => S;

function voicesAB() {
  const vs = Audio.voices();
  const pref = store.get('voices', {});
  return [vs.find(v => v.name === pref.a) || vs[0], vs.find(v => v.name === pref.b) || vs.find(v => v !== vs[0]) || vs[0]];
}
const words = t => (t.match(/\S+/g) || []).length;
const lineSecs = l => (words(l.t) / 2.6) / S.rate; // ~156 words per minute at 1x
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cur = () => S.queue[S.idx];

export async function buildEpisode(a, format = 'short', length = 'normal', parts = null) {
  format = Audio.fmtId(format);
  if (!reuse(a).derivatives) throw new Error('This paper\'s licence does not allow audio versions');
  let full = null;
  if (a.pmcid && a.hasFullText) { try { full = await getFullText(a.pmcid); } catch { /* abstract only */ } }
  const abs = abstractSections(a.abstractHtml);
  const absUse = abs.length ? abs : (full?.abstract || []);
  const script = Audio.buildScript(a, { format, length, abstract: absUse, full, parts });
  const fig = full?.figures?.find(f => f.href);
  return { key: keyOf(a), title: a.title, journal: a.journal, year: a.year, format, formatName: Audio.FORMATS[format].name,
    lines: script.lines, basis: script.basis, cover: fig ? figCandidates(a.pmcid, fig.href) : [] };
}

export async function enqueue(a, format = 'short', { playNow = false, length = 'normal', parts = null } = {}) {
  try {
    const ep = await buildEpisode(a, format, length, parts);
    if (parts) ep.format += ':' + parts.join(',');
    const existing = S.queue.findIndex(e => e.key === ep.key && e.format === ep.format);
    if (existing >= 0) { if (playNow) playAt(existing); else toast('Already in your queue'); return; }
    S.queue.push(ep);
    if (playNow || S.idx < 0) playAt(S.queue.length - 1); else { toast(`Queued: ${ep.formatName}`); emit(); }
  } catch (e) { toast(e.message); }
}

// Ready-made episode (e.g. from a Studio document).
export function enqueueEpisode(ep, playNow = true) {
  S.queue.push(ep);
  if (playNow || S.idx < 0) playAt(S.queue.length - 1); else emit();
}

export function playAt(i) {
  if (i < 0 || i >= S.queue.length) return;
  if (!Lib.spend('audio')) { toast('Daily free audio limit reached. It refreshes tomorrow.'); return; }
  updateQuotaLine();
  S.idx = i; S.line = 0; start();
}

function speak(token) {
  if (token !== S.token || !S.playing) return;
  const ep = cur();
  if (!ep) return;
  if (S.line >= ep.lines.length) {
    if (S.idx + 1 < S.queue.length) { S.idx++; S.line = 0; emit(); speak(token); }
    else { S.playing = false; S.line = 0; emit(); }
    return;
  }
  const ln = ep.lines[S.line];
  const [va, vb] = voicesAB();
  const u = new SpeechSynthesisUtterance(ln.t);
  if (va) u.voice = ln.who === 'B' ? vb : va;
  u.rate = S.rate; u.pitch = ln.who === 'B' ? 0.92 : 1.02;
  u.onend = () => { if (token !== S.token) return; S.line++; emit(); speak(token); };
  u.onerror = e => { if (token !== S.token || e.error === 'interrupted' || e.error === 'canceled') return; S.line++; speak(token); };
  emit();
  speechSynthesis.speak(u);
}

function start() {
  try { speechSynthesis.cancel(); } catch {}
  if (!('speechSynthesis' in window)) { toast('This browser has no speech voices.'); return; }
  if (!speechSynthesis.getVoices().length) toast('No speech voices found yet on this device. If you hear nothing, install a voice in your system settings.');
  S.playing = true; S.token++; mediaSession(); speak(S.token);
}
export function pause() { S.playing = false; S.token++; try { speechSynthesis.cancel(); } catch {} emit(); }
export function toggle() { if (!cur()) return; S.playing ? pause() : start(); }
export function seekLine(n) { const ep = cur(); if (!ep) return; S.line = Math.max(0, Math.min(ep.lines.length - 1, n)); if (S.playing) start(); else emit(); }
function skipSecs(d) {
  const ep = cur(); if (!ep) return;
  let acc = 0, i = S.line;
  if (d > 0) { while (i < ep.lines.length - 1 && acc < d) { acc += lineSecs(ep.lines[i]); i++; } }
  else { while (i > 0 && acc < -d) { i--; acc += lineSecs(ep.lines[i]); } }
  seekLine(i);
}
export function next() { if (S.idx + 1 < S.queue.length) { S.idx++; S.line = 0; S.playing ? start() : emit(); } }
export function prev() { if (S.line > 1) seekLine(0); else if (S.idx > 0) { S.idx--; S.line = 0; S.playing ? start() : emit(); } }
function cycleRate() { S.rate = RATES[(RATES.indexOf(S.rate) + 1) % RATES.length] || 1; store.set('rate', S.rate); if (S.playing) start(); else emit(); }
export function removeAt(i) { if (i === S.idx) { pause(); } S.queue.splice(i, 1); if (S.idx >= i) S.idx = Math.max(S.queue.length ? 0 : -1, S.idx - (i <= S.idx ? 1 : 0)); if (S.idx < 0 && S.queue.length) S.idx = 0; emit(); }

function mediaSession() {
  const ep = cur(); if (!ep || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: ep.title, artist: `${ep.formatName} · ${ep.journal}`, album: 'Evidara podcast' });
    navigator.mediaSession.setActionHandler('play', () => start());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('previoustrack', () => prev());
    navigator.mediaSession.setActionHandler('seekforward', () => skipSecs(15));
    navigator.mediaSession.setActionHandler('seekbackward', () => skipSecs(-15));
  } catch {}
}

export function coverEl(ep, cls = 'cover') {
  const box = h('div', { class: cls });
  if (ep?.cover?.length) {
    let i = 0;
    const img = h('img', { src: ep.cover[0], alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => { i++; if (i < ep.cover.length) img.src = ep.cover[i]; else img.remove(); });
    box.append(img);
  }
  box.append(h('span', { class: 'cover-tag' }, ep?.formatName || ''));
  return box;
}

function btn(name, label, onclick, extra = '') {
  return h('button', { class: 'pbtn ' + extra, type: 'button', 'aria-label': label, title: label, onclick }, icon(name, 20));
}

function render() {
  const ep = cur();
  if (!ep) { bar.hidden = true; document.body.classList.remove('has-player'); return; }
  bar.hidden = false; document.body.classList.add('has-player');
  const total = ep.lines.reduce((s, l) => s + lineSecs(l), 0);
  const done = ep.lines.slice(0, S.line).reduce((s, l) => s + lineSecs(l), 0);
  const prog = h('div', { class: 'prog', role: 'slider', 'aria-label': 'Seek', 'aria-valuemin': 0, 'aria-valuemax': ep.lines.length, 'aria-valuenow': S.line, tabindex: 0,
    onclick: e => { const r = e.currentTarget.getBoundingClientRect(); seekLine(Math.floor(((e.clientX - r.left) / r.width) * ep.lines.length)); },
    onkeydown: e => { if (e.key === 'ArrowRight') skipSecs(15); if (e.key === 'ArrowLeft') skipSecs(-15); } },
    h('div', { class: 'prog-fill', style: `width:${(S.line / Math.max(1, ep.lines.length)) * 100}%` }));
  const panel = S.showQueue ? h('div', { class: 'pl-panel' }, h('div', { class: 'pl-panel-head' }, h('b', {}, 'Queue')),
      ...S.queue.map((e, i) => h('div', { class: 'qrow' + (i === S.idx ? ' on' : '') }, coverEl(e, 'cover xs'),
        h('button', { class: 'qtitle', type: 'button', onclick: () => playAt(i) }, h('b', {}, e.formatName), ' ', e.title),
        btn('close', 'Remove from queue', () => removeAt(i))))) : null;
  bar.replaceChildren(
    panel || '',
    h('div', { class: 'pl-main' },
      h('a', { class: 'pl-info', href: `#paper/${encodeURIComponent(ep.key)}` }, coverEl(ep, 'cover sm'),
        h('div', { class: 'pl-text' }, h('div', { class: 'pl-title' }, ep.title), h('div', { class: 'pl-sub' }, `${ep.formatName} · ${ep.journal} ${ep.year}`))),
      h('div', { class: 'pl-center' },
        h('div', { class: 'pl-controls' },
          btn('prev', 'Previous', prev), btn('back15', 'Back 15 seconds', () => skipSecs(-15)),
          h('button', { class: 'pbtn big', type: 'button', 'aria-label': S.playing ? 'Pause' : 'Play', onclick: toggle }, icon(S.playing ? 'pause' : 'play', 22)),
          btn('fwd15', 'Forward 15 seconds', () => skipSecs(15)), btn('next', 'Next', next)),
        h('div', { class: 'pl-time' }, h('span', {}, fmt(done)), prog, h('span', {}, fmt(total)))),
      h('div', { class: 'pl-right' },
        h('button', { class: 'pbtn rate', type: 'button', 'aria-label': 'Playback speed', onclick: cycleRate }, `${S.rate}×`),
        btn('queue', 'Queue', () => { S.showQueue = !S.showQueue; render(); }, S.showQueue ? 'on' : ''),
        btn('close', 'Close player', () => { pause(); S.queue = []; S.idx = -1; emit(); }))));
}

window.addEventListener('beforeunload', () => { try { speechSynthesis.cancel(); } catch {} });
try { speechSynthesis.onvoiceschanged = () => {}; speechSynthesis.getVoices(); } catch {}

// Video player for paper/document videos. Slides are animated live (no pre-render), with:
// play/pause, previous/next, scrub, time, speed, narration (built-in voices) on/off, captions on/off,
// 16:9 / 9:16, fullscreen, keyboard control and WebM download.
import { h, toast } from './util.js';
import { icon } from './icons.js';
import * as Vid from './video.js';
import * as Lib from './library.js';
import { updateQuotaLine, bloomSVG } from './core.js';
import { pickVoices, voicePref } from './podcast.js';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

// slides: [{ k, t, s, img: [candidate urls] | null, say }]
export function videoPlayer({ title, slides, aspect = '16:9', baseMs = 5000, downloadName = 'evidara-video.webm' }) {
  let idx = 0, playing = false, timer = null, speed = 1, narr = false, caps = true, startedAt = 0, elapsedBefore = 0, ratio = aspect;
  const stage = h('div', { class: 'vp-stage' });
  const capBar = h('div', { class: 'vp-cap' });
  const segs = h('div', { class: 'vp-segs', role: 'slider', 'aria-label': 'Seek', tabindex: 0 });
  const timeEl = h('span', { class: 'vp-time' });
  const playB = h('button', { class: 'vp-btn big', type: 'button', 'aria-label': 'Play' }, icon('play', 22));
  const root = h('div', { class: `vp ratio-${ratio.replace(':', 'x')}`, tabindex: 0, 'aria-label': `Video: ${title}` });
  const dur = () => baseMs / speed;
  const total = () => slides.length * dur();

  function draw() {
    const s = slides[idx];
    const bg = h('div', { class: 'vp-bg' }, bloomSVG());
    if (s.img?.length) {
      let i = 0; const im = h('img', { src: s.img[0], alt: '', referrerpolicy: 'no-referrer', class: 'vp-img' });
      im.addEventListener('error', () => { i++; if (i < s.img.length) im.src = s.img[i]; else im.remove(); });
      bg.replaceChildren(im);
    }
    stage.replaceChildren(bg, h('div', { class: 'vp-shade' }),
      h('div', { class: `vp-slide ${s.cls || ''}` }, h('div', { class: 'vp-k' }, s.k), h('div', { class: 'vp-t' }, s.t), s.s ? h('div', { class: 'vp-s' }, s.s) : null),
      h('div', { class: 'vp-brand' }, 'EVIDARA'));
    capBar.textContent = caps && s.say ? s.say : '';
    capBar.hidden = !(caps && s.say);
    segs.replaceChildren(...slides.map((_, i) => h('button', { type: 'button', class: 'vp-seg' + (i < idx ? ' done' : i === idx ? ' on' : ''), 'aria-label': `Slide ${i + 1}`, onclick: () => go(i) },
      h('i', { style: i === idx && playing && !narr ? `animation-duration:${dur()}ms` : '' }))));
    updTime();
  }
  const fmt = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  function updTime() { timeEl.textContent = `${fmt(idx * dur())} / ${fmt(total())}`; }
  function speak(text, done) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.rate = speed * 0.96;
      const v = pickVoices(); const pref = voicePref(); const voice = pref === 'device' ? null : pref === 'male' ? v.male : v.female;
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.onend = done; u.onerror = done; speechSynthesis.speak(u);
    } catch { done(); }
  }
  function schedule() {
    clearTimeout(timer);
    if (!playing) return;
    const s = slides[idx];
    const advance = () => { if (!playing) return; if (idx < slides.length - 1) { idx++; draw(); schedule(); } else { pause(); idx = 0; draw(); } };
    if (narr && s.say) speak(s.say, () => { timer = setTimeout(advance, 400); });
    else timer = setTimeout(advance, dur());
  }
  function play() { playing = true; playB.replaceChildren(icon('pause', 22)); playB.setAttribute('aria-label', 'Pause'); draw(); schedule(); }
  function pause() { playing = false; clearTimeout(timer); try { if (narr) speechSynthesis.cancel(); } catch {} playB.replaceChildren(icon('play', 22)); playB.setAttribute('aria-label', 'Play'); draw(); }
  function go(i) { idx = Math.max(0, Math.min(slides.length - 1, i)); try { if (narr) speechSynthesis.cancel(); } catch {} draw(); if (playing) schedule(); }
  playB.addEventListener('click', () => (playing ? pause() : play()));
  stage.addEventListener('click', () => (playing ? pause() : play()));

  const speedB = h('button', { class: 'vp-btn txt', type: 'button', 'aria-label': 'Speed' }, '1×');
  speedB.addEventListener('click', () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; speedB.textContent = `${speed}×`; draw(); if (playing) schedule(); });
  const narrB = h('button', { class: 'vp-btn', type: 'button', 'aria-label': 'Narration off', title: 'Narration (built-in voice)' }, icon('mute', 20));
  narrB.addEventListener('click', () => { narr = !narr; narrB.replaceChildren(icon(narr ? 'volume' : 'mute', 20)); narrB.setAttribute('aria-label', narr ? 'Narration on' : 'Narration off'); if (!narr) { try { speechSynthesis.cancel(); } catch {} } if (playing) schedule(); });
  const capB = h('button', { class: 'vp-btn txt on', type: 'button', 'aria-label': 'Captions' }, 'CC');
  capB.addEventListener('click', () => { caps = !caps; capB.classList.toggle('on', caps); draw(); });
  const ratioB = h('button', { class: 'vp-btn txt', type: 'button', 'aria-label': 'Aspect ratio' }, ratio);
  ratioB.addEventListener('click', () => { root.classList.remove(`ratio-${ratio.replace(':', 'x')}`); ratio = ratio === '16:9' ? '9:16' : '16:9'; ratioB.textContent = ratio; root.classList.add(`ratio-${ratio.replace(':', 'x')}`); });
  const fsB = h('button', { class: 'vp-btn', type: 'button', 'aria-label': 'Fullscreen' }, icon('external', 18));
  fsB.addEventListener('click', () => { try { document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen(); } catch { toast('Fullscreen is not available here'); } });
  const dlB = h('button', { class: 'vp-btn txt', type: 'button', 'aria-label': 'Download video', disabled: !Vid.canRecord() }, '⤓ WebM');
  dlB.addEventListener('click', async () => {
    if (!Lib.spend('video')) { toast('Daily free video limit reached. It refreshes tomorrow.'); return; }
    updateQuotaLine(); dlB.disabled = true; const old = dlB.textContent; dlB.textContent = 'Rendering…';
    try {
      const canvas = h('canvas', { width: ratio === '9:16' ? 1080 : 1920, height: ratio === '9:16' ? 1920 : 1080 });
      const vs = slides.map(s => ({ kicker: s.k, big: s.t, small: s.s || '' }));
      const blob = await Vid.record(canvas, vs, 4);
      const a = h('a', { href: URL.createObjectURL(blob), download: downloadName }); document.body.append(a); a.click(); a.remove();
      toast('Video downloaded');
    } catch (e) { toast('Rendering failed: ' + e.message); }
    dlB.disabled = false; dlB.textContent = old;
  });
  root.addEventListener('keydown', e => {
    if (e.target !== root) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); playing ? pause() : play(); }
    if (e.key === 'ArrowRight') go(idx + 1); if (e.key === 'ArrowLeft') go(idx - 1);
    if (e.key === 'f') fsB.click(); if (e.key === 'c') capB.click(); if (e.key === 'm') narrB.click();
  });
  root.append(stage, capBar, h('div', { class: 'vp-bar' }, segs,
    h('div', { class: 'vp-ctrl' },
      h('button', { class: 'vp-btn', type: 'button', 'aria-label': 'Previous slide', onclick: () => go(idx - 1) }, icon('prev', 18)),
      playB,
      h('button', { class: 'vp-btn', type: 'button', 'aria-label': 'Next slide', onclick: () => go(idx + 1) }, icon('next', 18)),
      timeEl, h('span', { class: 'vp-sp' }), narrB, capB, speedB, ratioB, dlB, fsB)));
  draw();
  root._stop = pause;
  return root;
}

// Slides for a paper (from the record + full text). Figures use the PMC archive candidates.
export function paperSlides(a, { finding, limitation, fig, figUrls, design }) {
  const cite = `${a.authors[0]?.last || ''}${a.authors.length > 1 ? ' et al.' : ''} · ${a.journalAbbr || a.journal} · ${a.year}`;
  return [
    { k: design, t: a.title, s: cite, say: `${a.title}. ${design}, published in ${a.journal}, ${a.year}.`, cls: 'title' },
    fig ? { k: fig.label || 'Figure', t: (fig.caption || '').slice(0, 240), s: 'Caption written by the authors', img: figUrls, say: (fig.caption || '').slice(0, 400), cls: 'fig' } : null,
    finding ? { k: 'What they found', t: finding, s: 'Verbatim from the paper', say: finding, cls: 'quote' } : null,
    { k: 'Limitation', t: limitation || 'No explicit limitation statement in the text available.', s: limitation ? 'Verbatim from the paper' : '', say: limitation || '', cls: 'quote' },
    { k: 'Source', t: a.doi ? `doi.org/${a.doi}` : (a.pmcid || `PMID ${a.pmid}`), s: 'Read the full paper on Evidara', say: 'Read the full paper before applying anything in practice.', cls: 'cite' },
  ].filter(Boolean);
}

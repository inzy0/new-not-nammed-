// Podcasts: Spotify-style home for paper audio. Shows are the four formats; episodes are today's papers.
import { h, store } from './util.js';
import { icon } from './icons.js';
import { searchArticles, keyOf } from './api.js';
import { studyDesign, reuse } from './verify.js';
import { domainByCode } from './ids.js';
import * as Audio from './audio.js';
import * as Pod from './podcast.js';
import { profile, bloomSVG } from './core.js';

const view = document.getElementById('view');

export async function podcasts() {
  const pr = profile(); const d = domainByCode(pr.domain);
  const rows = h('div', {});
  const queueBox = h('div', { class: 'rcard' });
  const drawQueue = () => {
    const s = Pod.state();
    queueBox.replaceChildren(h('div', { class: 'rhead' }, h('b', {}, 'Your queue'), h('span', { class: 'meta' }, `${s.queue.length} episode${s.queue.length === 1 ? '' : 's'}`)),
      ...(s.queue.length ? s.queue.map((e, i) => h('button', { class: 'qrow2' + (i === s.idx ? ' on' : ''), type: 'button', onclick: () => Pod.playAt(i) }, Pod.coverEl(e, 'cover xs'),
        h('span', {}, h('b', {}, e.formatName), h('br'), e.title))) : [h('div', { class: 'meta' }, 'Press play on any episode. It keeps playing while you browse.')]));
  };
  const off = Pod.onChange(() => { if (!document.body.contains(queueBox)) { off(); return; } drawQueue(); });
  drawQueue();
  let papers = [];
  const playAll = async () => { for (const [i, a] of papers.slice(0, 8).entries()) await Pod.enqueue(a, 'brief', { playNow: i === 0 }); };
  view.replaceChildren(h('div', { class: 'cols' },
    h('div', { class: 'center wide' },
      h('section', { class: 'podhero' }, h('div', { class: 'cover xl' }, bloomSVG(), h('span', { class: 'cover-tag' }, 'Daily')),
        h('div', {}, h('div', { class: 'meta' }, 'PODCAST'), h('h1', {}, 'Daily Evidence'),
          h('p', { class: 'meta' }, `The Brief for today's open-access papers in ${d ? d[1] : 'medicine'}, back to back. Two hosts, the paper's own words, with the source of every line in the transcript.`),
          h('div', { class: 'row' }, h('button', { class: 'playbig', type: 'button', 'aria-label': 'Play all', onclick: playAll }, icon('play', 28)), h('span', { class: 'meta' }, 'Play all')))),
      rows),
    h('aside', { class: 'rail' }, queueBox,
      h('div', { class: 'rcard' }, h('b', {}, 'Formats'), ...Object.values(Audio.FORMATS).map(f => h('div', { class: 'vrow' }, h('b', {}, f.name), h('div', { class: 'meta' }, f.desc)))),
      h('div', { class: 'rfoot' }, 'Voices are your device\'s built-in voices: free, offline and private. Downloadable MP3 arrives with the cloud voice step.'))));
  rows.append(h('div', { class: 'empty' }, h('span', { class: 'spinner' }), ' Loading episodes…'));
  try {
    const r = await searchArticles({ query: d ? d[2] : 'medicine', days: 30, pageSize: 30 });
    papers = r.results.filter(a => reuse(a).derivatives);
    rows.replaceChildren(...Object.entries(Audio.FORMATS).map(([fid, f], ri) => {
      const list = papers.slice((ri * 6) % Math.max(1, papers.length), (ri * 6) % Math.max(1, papers.length) + 10);
      return h('section', { class: 'podrow' }, h('div', { class: 'rhead' }, h('h2', {}, f.name), h('span', { class: 'meta' }, f.desc)),
        h('div', { class: 'hscroll' }, ...(list.length ? list : papers.slice(0, 10)).map(a => episodeCard(a, fid, f.name))));
    }));
    if (!papers.length) rows.replaceChildren(h('div', { class: 'empty' }, 'No papers with an audio-friendly licence in the last 30 days for this domain.'));
  } catch (e) {
    rows.replaceChildren(h('div', { class: 'empty' }, `Could not load episodes: ${e.message}. `, h('button', { class: 'btn small', type: 'button', onclick: () => podcasts() }, 'Retry')));
  }
}

function episodeCard(a, format, formatName) {
  return h('div', { class: 'ep' },
    h('div', { class: 'cover md' }, bloomSVG(), h('span', { class: 'cover-tag' }, formatName),
      h('button', { class: 'ep-play', type: 'button', 'aria-label': `Play ${formatName}`, onclick: () => Pod.enqueue(a, format, { playNow: true }) }, icon('play', 22))),
    h('a', { class: 'ep-title', href: `#paper/${encodeURIComponent(keyOf(a))}` }, a.title),
    h('div', { class: 'meta' }, `${studyDesign(a)} · ${a.journal}`));
}

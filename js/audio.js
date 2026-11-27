// Audio studio: formats modelled on the published Audio Overview formats (Deep Dive, Brief, Critique, Debate),
// but scripted ONLY from the article's own sentences. The fixed host lines are signposts that carry no claims;
// every content line is a verbatim sentence and shows the section it came from (the "justification").
import { splitSentences } from './util.js';
import { checks, studyDesign, reuse } from './verify.js';

export const FORMATS = {
  short: { name: 'Short', desc: 'About a minute: design, aim, the key result and the conclusion.' },
  briefing: { name: 'Briefing', desc: 'A structured clinical briefing: design, verification flags, aim, key results, conclusion, and one stated limitation.' },
  long: { name: 'Long', desc: 'Two hosts walk through background, methods, results, discussion, conclusion, limitations and declarations.' },
  custom: { name: 'Customised', desc: 'Pick the sections, depth and order you want.' },
};
const ALIAS = { brief: 'short', deep: 'long', critique: 'briefing', debate: 'long' };
export const fmtId = f => FORMATS[f] ? f : (ALIAS[f] || 'short');
export const CUSTOM_PARTS = [['background', 'Background'], ['methods', 'Methods'], ['results', 'Results'], ['discussion', 'Discussion'], ['conclusion', 'Conclusion'], ['limitations', 'Limitations'], ['checks', 'Verification card'], ['declarations', 'Funding & conflicts']];

export const STYLES = {
  clinical: { name: 'Calm clinical', rate: 0.98, pitchA: 1.0, pitchB: 0.92 },
  energetic: { name: 'Energetic', rate: 1.12, pitchA: 1.08, pitchB: 1.0 },
  learner: { name: 'Slow for learners', rate: 0.85, pitchA: 1.0, pitchB: 0.95 },
  commute: { name: 'Commute (fast)', rate: 1.3, pitchA: 1.0, pitchB: 0.95 },
};

export const LENGTHS = { short: { name: 'Shorter', n: 2 }, normal: { name: 'Default', n: 4 }, long: { name: 'Longer', n: 8 } };

const PICK = [
  ['background', /background|introduction|objective|aim|purpose|rationale|importance/i],
  ['methods', /method|design|setting|participants|patients|intervention|measure|population|materials/i],
  ['results', /result|finding|outcome/i],
  ['discussion', /discussion|interpretation/i],
  ['conclusion', /conclusion|implication|relevance|summary/i],
];

function bucket(sections) {
  const b = { background: [], methods: [], results: [], discussion: [], conclusion: [], limitations: [] };
  for (const s of sections) {
    const k = (PICK.find(([, re]) => re.test(s.title)) || [])[0];
    const sents = splitSentences(s.text);
    if (k) b[k].push(...sents.map(t => ({ t, src: s.title })));
    for (const t of sents) if (/\blimitation/i.test(t)) b.limitations.push({ t, src: s.title });
  }
  if (!b.background.length && sections[0]) b.background.push(...splitSentences(sections[0].text).map(t => ({ t, src: sections[0].title })));
  return b;
}

const dedupe = arr => { const seen = new Set(); return arr.filter(x => !seen.has(x.t) && seen.add(x.t)); };

export function buildScript(a, { format, length, abstract, full, parts }) {
  format = fmtId(format);
  const useFull = full && reuse(a).derivatives && full.sections.length;
  const sections = useFull ? [...(full.abstract.length ? full.abstract : abstract), ...full.sections] : abstract;
  const b = bucket(sections);
  const L = [];
  const say = (who, t, src = null) => L.push({ who, t, src });
  const take = (arr, k) => dedupe(arr).slice(0, k);
  const first = a.authors[0]?.last || a.authorString.split(',')[0] || 'the authors';
  const lic = reuse(a).label;
  const flags = () => checks(a, full).filter(c => c.state === 'warn' || c.state === 'bad');
  say('A', `${a.title}. By ${first}${a.authors.length > 1 ? ' and colleagues' : ''}, ${a.journal}, ${a.year}.`, 'Record');

  if (format === 'short') {
    say('A', `Study design: ${studyDesign(a)}.`, 'Publication type');
    for (const x of take(b.background, 1)) say('A', x.t, x.src);
    for (const x of take(b.results, 2)) say('A', x.t, x.src);
    for (const x of take(b.conclusion.length ? b.conclusion : b.discussion, 1)) say('A', x.t, x.src);
  } else if (format === 'briefing') {
    say('A', `Briefing. Design: ${studyDesign(a)}. Licence: ${lic}.`, 'Record');
    const f = flags();
    say('B', f.length ? `Verification flags: ${f.map(c => c.label).join('; ')}.` : 'Verification: no flags in the record.', 'Verification card');
    say('A', 'Aim.'); for (const x of take(b.background, 1)) say('B', x.t, x.src);
    say('A', 'Key results.'); for (const x of take(b.results, 3)) say('B', x.t, x.src);
    say('A', 'Conclusion.'); for (const x of take(b.conclusion.length ? b.conclusion : b.discussion, 1)) say('B', x.t, x.src);
    if (b.limitations.length) { say('A', 'One limitation the authors state.'); say('B', b.limitations[0].t, b.limitations[0].src); }
  } else {
    const n = format === 'long' ? 8 : (LENGTHS[length]?.n || 4);
    const want = format === 'long' ? CUSTOM_PARTS.map(p => p[0]) : (parts && parts.length ? parts : ['background', 'results', 'conclusion']);
    const cues = { background: 'Why was this study done?', methods: 'How did they do it?', results: 'What did they find?', discussion: 'How do the authors interpret it?', conclusion: 'Their conclusion.', limitations: 'What limitations do the authors state?' };
    for (const k of want) {
      if (k === 'checks') { say('A', 'The verification card.'); for (const c of checks(a, full)) say('B', `${c.label}. ${c.detail}.`, `Check: ${c.source}`); continue; }
      if (k === 'declarations') {
        if (full?.funding || full?.coi) { say('A', 'Funding and conflicts, as declared.'); if (full.funding) say('B', splitSentences(full.funding).slice(0, 2).join(' '), 'Funding'); if (full.coi) say('B', splitSentences(full.coi).slice(0, 2).join(' '), 'Conflicts of interest'); }
        continue;
      }
      const got = take(b[k] || [], k === 'limitations' ? Math.max(2, n / 2) : n);
      if (!got.length) continue;
      say('A', cues[k]); for (const x of got) say('B', x.t, x.src);
    }
  }
  say('A', `Source: ${a.doi ? 'doi ' + a.doi : a.pmcid || a.pmid}. Read the full paper before applying anything in practice.`, 'Record');
  return { lines: L, basis: useFull ? 'full text' : 'abstract' };
}

// Same engine for any document (Studio notebook): sections = [{title, text}], meta = {title, by, source}.
// Structured documents (real headings like Methods/Results) use the section logic; anything else gets a
// plain read-through in parts, so no sentence is ever labelled with a section it does not come from.
export function buildDocScript(meta, sections, format = 'short', parts) {
  format = fmtId(format);
  const structured = sections.filter(s => PICK.some(([, re]) => re.test(s.title))).length >= 2;
  if (structured) {
    const fake = { title: meta.title, authors: [], authorString: meta.by || 'the authors', journal: meta.source || 'an uploaded document', year: '', license: 'cc by',
      pubTypes: [], corrections: [], source: 'DOC', citedBy: 0, abstractHtml: '', doi: null, pmcid: meta.title, pmid: null };
    const s = buildScript(fake, { format: format === 'briefing' ? 'custom' : format, length: format === 'long' ? 'long' : 'normal', abstract: sections, full: null,
      parts: format === 'briefing' ? ['background', 'results', 'conclusion', 'limitations'] : parts });
    s.lines = s.lines.filter(l => !/^Source: |^Study design|Verification|Licence/.test(l.t));
    return { ...s, basis: 'document' };
  }
  const all = sections.flatMap(sec => splitSentences(sec.text).map(t => ({ t, src: sec.title })));
  const plan = { short: [3, 1], briefing: [4, 2], long: [8, 4], custom: [5, 3] }[format];
  const L = [{ who: 'A', t: `${meta.title}.`, src: 'Document' }];
  const k = Math.min(plan[0], Math.max(1, all.length));
  for (let i = 0; i < k; i++) {
    const chunk = all.slice(Math.floor(i * all.length / k), Math.floor((i + 1) * all.length / k));
    if (!chunk.length) continue;
    L.push({ who: 'A', t: `Part ${i + 1} of ${k}.`, src: null });
    chunk.slice(0, plan[1]).forEach(x => L.push({ who: 'B', t: x.t, src: x.src }));
  }
  return { lines: L, basis: 'document' };
}

// ---------- playback with the browser's own voices (free, on-device, unlimited) ----------
let playing = null;
export function voices() {
  try { return speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); } catch { return []; }
}
export function stop() { try { speechSynthesis.cancel(); } catch {} playing = null; }

export function play(lines, { style, voiceA, voiceB, onLine, onEnd }) {
  stop();
  const st = STYLES[style] || STYLES.clinical;
  const vs = voices();
  const va = vs.find(v => v.name === voiceA) || vs[0];
  const vb = vs.find(v => v.name === voiceB) || vs[1] || vs[0];
  const token = {}; playing = token;
  let i = 0;
  const next = () => {
    if (playing !== token) return;
    if (i >= lines.length) { onEnd?.(); return; }
    const ln = lines[i];
    const u = new SpeechSynthesisUtterance(ln.t);
    u.voice = ln.who === 'B' ? vb : va; u.rate = st.rate; u.pitch = ln.who === 'B' ? st.pitchB : st.pitchA;
    onLine?.(i);
    u.onend = () => { i++; next(); };
    u.onerror = () => { i++; next(); };
    speechSynthesis.speak(u);
  };
  next();
}

export function toText(a, script) {
  return script.lines.map(l => `${l.who === 'B' ? 'HOST B' : 'HOST A'}: ${l.t}${l.src ? `   [from: ${l.src}]` : ''}`).join('\n');
}

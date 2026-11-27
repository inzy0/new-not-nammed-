// Audio studio: formats modelled on the published Audio Overview formats (Deep Dive, Brief, Critique, Debate),
// but scripted ONLY from the article's own sentences. The fixed host lines are signposts that carry no claims;
// every content line is a verbatim sentence and shows the section it came from (the "justification").
import { splitSentences } from './util.js';
import { checks, studyDesign, reuse } from './verify.js';

export const FORMATS = {
  deep: { name: 'Deep Dive', desc: 'Two hosts walk through background, methods, results and conclusions in the paper\'s own words.' },
  brief: { name: 'The Brief', desc: 'One voice, about a minute: design, aim, key result and conclusion.' },
  critique: { name: 'The Critique', desc: 'The verification card read aloud, then the authors\' own stated limitations.' },
  debate: { name: 'The Debate', desc: 'Host A reads the findings; Host B reads the limitations and flags. No winner is declared.' },
};

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

export function buildScript(a, { format, length, abstract, full }) {
  const n = LENGTHS[length]?.n || 4;
  const useFull = full && reuse(a).derivatives && full.sections.length;
  const sections = useFull ? [...(full.abstract.length ? full.abstract : abstract), ...full.sections] : abstract;
  const b = bucket(sections);
  const L = [];
  const say = (who, t, src = null) => L.push({ who, t, src });
  const take = (arr, k) => dedupe(arr).slice(0, k);
  const first = a.authors[0]?.last || a.authorString.split(',')[0] || 'the authors';
  const lic = reuse(a).label;

  say('A', `This is an Evidara audio reading. Everything you will hear, apart from these short signposts, is read word for word from the article.`);
  say('A', `${a.title}. By ${first}${a.authors.length > 1 ? ' and colleagues' : ''}, ${a.journal}, ${a.year}. Licence: ${lic}.`, 'Record');

  if (format === 'brief') {
    say('A', `Study design: ${studyDesign(a)}.`, 'Publication type');
    for (const x of take(b.background, 1)) say('A', x.t, x.src);
    for (const x of take(b.results, Math.max(1, n - 1))) say('A', x.t, x.src);
    for (const x of take(b.conclusion.length ? b.conclusion : b.discussion, 1)) say('A', x.t, x.src);
  } else if (format === 'deep') {
    const parts = [
      ['background', 'Let\'s start with why this study was done.'],
      ['methods', 'How did they do it?'],
      ['results', 'What did they find?'],
      ['discussion', 'How do the authors interpret it?'],
      ['conclusion', 'And their conclusion.'],
    ];
    for (const [k, cue] of parts) {
      const got = take(b[k], n);
      if (!got.length) continue;
      say('A', cue);
      for (const x of got) say('B', x.t, x.src);
    }
    if (b.limitations.length) { say('A', 'What limitations do the authors themselves state?'); for (const x of take(b.limitations, Math.max(2, n / 2))) say('B', x.t, x.src); }
  } else if (format === 'critique') {
    say('A', 'First, the verification card.');
    for (const c of checks(a, full)) say('B', `${c.label}. ${c.detail}.`, `Check: ${c.source}`);
    if (b.limitations.length) { say('A', 'Now the limitations, as the authors state them.'); for (const x of take(b.limitations, n)) say('B', x.t, x.src); }
    else say('A', 'The text available to us contains no explicit limitations statement. That absence is itself worth noting.');
  } else if (format === 'debate') {
    say('A', 'I will read what the study found.');
    say('B', 'And I will read what should make us cautious. We will not declare a winner: you decide.');
    const pro = take([...b.results, ...b.conclusion], n);
    const con = take(b.limitations, n);
    const flags = checks(a, full).filter(c => c.state === 'warn' || c.state === 'bad');
    const len = Math.max(pro.length, con.length + flags.length);
    for (let i = 0; i < len; i++) {
      if (pro[i]) say('A', pro[i].t, pro[i].src);
      if (con[i]) say('B', con[i].t, con[i].src);
      else if (flags[i - con.length]) { const f = flags[i - con.length]; say('B', `Flag: ${f.label}. ${f.detail}.`, `Check: ${f.source}`); }
    }
  }
  say('A', `Source: ${a.doi ? 'doi ' + a.doi : a.pmcid || a.pmid}. Read the full article before applying anything in practice.`, 'Record');
  return { lines: L, basis: useFull ? 'full text' : 'abstract' };
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

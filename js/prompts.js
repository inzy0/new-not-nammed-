// Prompt library for image, video and audio makers.
// These are prompt TEMPLATES written by hand (not model output, not training data). They are filled per person from
// their profile (domain, audience, tone, theme palette) and the Evidara format and per paper (title, design, one verbatim finding).
// "Format playbook" = curated formats, updated by hand. It is not a live trend feed.

export const PLAYBOOK_UPDATED = '2026-11-27';

export const PLATFORMS = {
  reel: { name: 'Evidara Reel', ratio: '9:16', secs: '30–60 s' },
  post: { name: 'Evidara Feed post', ratio: '4:5', secs: 'image + text' },
  video: { name: 'Evidara Video', ratio: '16:9', secs: '2–8 min' },
  podcast: { name: 'Evidara Podcast', ratio: 'audio', secs: '1–10 min' },
  article: { name: 'Evidara Community article', ratio: 'article', secs: 'full paper' },
};
export const platformOf = k => PLATFORMS[k] || PLATFORMS.reel;
export const AUDIENCES = { clinicians: 'clinicians', students: 'medical and allied-health students', researchers: 'researchers', public: 'the general public (patient education)', policy: 'health policy makers' };
export const TONES = { calm: 'calm expert', bold: 'bold and punchy', story: 'story-led', playful: 'playful but accurate', academic: 'academic' };

const SAFE_IMG = 'No real patients, no identifiable people, no logos, no written medical claims or numbers in the image. Mark it as an illustration.';

export const IMAGE_STYLES = [
  { id: 'clay', name: 'Soft 3D clay', p: 'Soft 3D clay render of {topic}, rounded friendly shapes, studio lighting, {palette} colour palette, clean background, for {audience}. ' },
  { id: 'plate', name: 'Vintage textbook plate', p: 'Vintage anatomical textbook plate style illustration of {topic}, fine engraved line work, aged paper, labelled-figure layout without text, muted {palette} accents. ' },
  { id: 'blueprint', name: 'Blueprint anatomy', p: 'Technical blueprint drawing of {topic}, white line art on deep blue grid, exploded-view layout, precise, minimal. ' },
  { id: 'iso', name: 'Isometric lab', p: 'Isometric illustration of a research lab scene about {topic}, tiny scientists at work, pipettes, monitors, {palette} palette, crisp vector style. ' },
  { id: 'riso', name: 'Risograph poster', p: 'Risograph print poster about {topic}, two-colour overprint in {palette}, grainy texture, bold geometric shapes, Swiss layout. ' },
  { id: 'micro', name: 'Cinematic microscopy', p: 'Cinematic macro microscopy-style artwork of {topic} at cellular scale, shallow depth of field, glowing bioluminescent {palette} tones, dark background. ' },
  { id: 'cut', name: 'Paper cut-out', p: 'Layered paper cut-out diorama of {topic}, soft shadows between layers, handcrafted feel, {palette} paper colours. ' },
  { id: 'line', name: 'Minimal line icons', p: 'Set of 6 minimal line icons representing {topic}, consistent 2px stroke, rounded caps, {palette} accent, white background, grid aligned. ' },
  { id: 'watercolor', name: 'Gentle watercolour (patient education)', p: 'Gentle watercolour illustration explaining {topic} for {audience}, warm and reassuring, soft edges, {palette} washes, lots of white space. ' },
  { id: 'neon', name: 'Neon data poster', p: 'Dark neon infographic-style poster about {topic}, glowing abstract charts without numbers, {palette} neon, futuristic grid. ' },
  { id: 'bloom', name: 'Evidara Bloom', p: 'Large surreal glowing flower-like organic form inspired by {topic}, petals in {palette} gradients, deep teal-to-plum background, editorial magazine hero composition with empty space on the left for a title. ' },
  { id: 'editorial', name: 'Editorial magazine cover', p: 'Editorial magazine cover art about {topic}, bold conceptual metaphor, strong negative space for headline, {palette} palette, high-end print look. ' },
  { id: 'comic', name: 'Clean comic panel', p: 'Four-panel clean comic strip explaining the idea of {topic} to {audience}, simple characters (not real people), flat colours in {palette}, no speech text. ' },
  { id: 'glass', name: 'Glassmorphism organ', p: 'Translucent glass 3D model representing {topic}, refractive caustics, soft gradient background in {palette}, product-shot lighting. ' },
  { id: 'map', name: 'Concept map', p: 'Hand-drawn concept map layout about {topic}, nodes and arrows, sketchbook texture, {palette} highlighter accents, no readable text. ' },
  { id: 'india', name: 'Indian folk art (Madhubani-inspired)', p: 'Madhubani-inspired folk art illustration symbolising {topic}, intricate line patterns, natural pigments, {palette} accents, respectful and decorative. ' },
].map(s => ({ ...s, p: s.p + SAFE_IMG }));

export const VIDEO_FORMATS = [
  { id: 'p60', name: 'Paper in 60 seconds', secs: 60, beats: ['Hook: the question the study asked', 'Who and how (design, setting)', 'The key finding: read verbatim on screen', 'One limitation the authors state', 'Citation card + "read the full paper"'] },
  { id: 'myth', name: 'Myth vs Evidence', secs: 45, beats: ['Common belief (stated as a question)', '"What does the evidence say?"', 'Finding from the paper (verbatim)', 'Strength of evidence: study design', 'Citation card'] },
  { id: 'fig3', name: '3 figures that matter', secs: 60, beats: ['Hook', 'Figure 1 + its caption', 'Figure 2 + its caption', 'Figure 3 + its caption', 'What it means / limitation', 'Citation card'] },
  { id: 'jc', name: 'Journal club teaser', secs: 40, beats: ['"This week we are reading…"', 'Why it matters for {audience}', '2 questions to think about before the session', 'Date, time and room', 'Citation card'] },
  { id: 'design', name: 'Study design explainer', secs: 50, beats: ['"What is a {design}?"', 'How it controls bias (generic, no claims)', 'This paper as the example', 'What this design can and cannot show', 'Citation card'] },
  { id: 'stat', name: 'One number explained', secs: 45, beats: ['The number from the abstract, read verbatim', 'What that measure means (NNT / HR / OR / CI)', 'Why it is not the whole story', 'Citation card'] },
  { id: 'retract', name: 'Retraction alert', secs: 30, beats: ['"Retracted:" + title', 'What the retraction notice says (verbatim)', 'What to do if you cited it', 'Notice link'] },
  { id: 'india', name: 'India lens', secs: 60, beats: ['Hook: why this matters in India', 'Setting of the study (is it Indian data?)', 'Finding verbatim', 'Gap: what Indian data is missing', 'Citation card'] },
  { id: 'career', name: 'Researcher spotlight', secs: 60, beats: ['Who they are (public profile facts only)', 'Their most-cited paper', 'Their latest paper', 'Follow them on Evidara'] },
  { id: 'ward', name: 'Ward-round pearl (no patients)', secs: 30, beats: ['A clinical question (no case details)', 'What the paper found (verbatim)', 'Caveat', 'Citation card'] },
  { id: 'versus', name: 'This vs That', secs: 60, beats: ['Two approaches compared in the paper', 'Outcome measured', 'Result verbatim', 'Who was studied (generalisability)', 'Citation card'] },
  { id: 'carousel', name: '7-slide carousel', secs: 0, beats: ['Title slide', 'Question', 'Design', 'Finding (verbatim)', 'Limitation', 'Takeaway for {audience} (no new claims)', 'Citation'] },
];

export const HOOKS = [
  'A new {design} asked: {question}',
  'Before you change practice on {topic}, read this.',
  'What {year}\'s evidence on {topic} actually says, in the authors\' own words.',
  '{audience}: one paper, 60 seconds, no hype.',
  'Most people get this wrong about {topic}. Here is the study.',
  'Three figures from a new paper on {topic}.',
  'Is this {topic} study as strong as the headlines? Check the design.',
  'Journal club in a minute: {topic}.',
  'Retraction check: is this {topic} paper still standing?',
  'What would you ask the authors of this {topic} study?',
  'Peer reviewed, or preprint? It matters for {topic}.',
  'The limitation nobody mentions in this {topic} paper.',
];

export const AUDIO_CONCEPTS = [
  { id: 'deep', name: 'Deep Dive', note: 'Two hosts, verbatim. Built in the Audio Studio on any paper page.' },
  { id: 'brief', name: 'The Brief', note: 'One-minute single voice.' },
  { id: 'critique', name: 'The Critique', note: 'Verification card + stated limitations.' },
  { id: 'debate', name: 'The Debate', note: 'Findings vs limitations, no winner declared.' },
  { id: 'weekly', name: 'Weekly domain digest', note: 'The Brief for the top 5 papers of your domain feed, back to back.' },
  { id: 'jc', name: 'Journal-club pre-read', note: 'Deep Dive of the session paper, sent to the group a day before.' },
];

// Words that overclaim. A prompt or script containing them gets a visible warning (not silently changed).
const OVERCLAIM = [/\bcures?\b/i, /\bmiracle\b/i, /\bguarantee/i, /\b100 ?%/i, /\bproven\b/i, /\bbreakthrough\b/i, /\bsecret\b/i, /\bdetox/i, /\binstant(ly)?\b/i, /doctors hate/i, /\bno side effects\b/i, /\brevolutionary\b/i];
export function lint(text) {
  const hits = OVERCLAIM.filter(re => re.test(text)).map(re => re.source.replace(/\\b|\(|\)|\?|\\/g, ''));
  const out = hits.map(w => `Overclaiming word: "${w}". Healthcare content must not promise outcomes.`);
  if (/patient (photo|image|face)|real patient/i.test(text)) out.push('Mentions real patients. Never use patient images.');
  return out;
}

export function fill(tpl, v) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? `{${k}}`));
}

export function videoPlan(fmt, v) {
  const plat = platformOf(v.platformId);
  const lines = [
    `FORMAT: ${fmt.name} · ${plat.name} · ${plat.ratio}${fmt.secs ? ` · ~${fmt.secs}s` : ''}`,
    `AUDIENCE: ${v.audience} · TONE: ${v.tone}`,
    `PAPER: ${v.title || '(pick a paper)'}`,
    '',
    'BEATS:',
    ...fmt.beats.map((b, i) => `${i + 1}. ${fill(b, v)}`),
    '',
    `VISUAL STYLE: ${v.palette} palette, ${v.fontNote}. Captions on, large text, safe margins for ${plat.ratio}.`,
    'RULES: verbatim findings only, citation card at the end, label any AI imagery "illustration", no patients, no overclaiming.',
  ];
  return lines.join('\n');
}

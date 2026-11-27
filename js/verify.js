// Verification card: each check states what was checked and where the fact comes from.
// A passed check means "this record shows X", never "the findings are true".

const DESIGN = [
  [/systematic review|meta-analysis/i, 'Systematic review / meta-analysis'],
  [/randomi[sz]ed controlled trial/i, 'Randomised controlled trial'],
  [/clinical trial/i, 'Clinical trial'],
  [/practice guideline|guideline/i, 'Guideline'],
  [/observational study|cohort|case-control/i, 'Observational study'],
  [/case reports?/i, 'Case report'],
  [/review/i, 'Review'],
  [/preprint/i, 'Preprint'],
  [/editorial|comment|letter/i, 'Editorial / comment / letter'],
];

export function studyDesign(a) {
  const types = a.pubTypes.join(' | ');
  for (const [re, label] of DESIGN) if (re.test(types)) return label;
  if (a.source === 'PPR') return 'Preprint';
  return a.pubTypes.find(t => !/journal article|research-article/i.test(t)) || 'Research article';
}

// What the licence lets this site do with the text and figures.
export function reuse(a) {
  const l = a.license;
  if (!l) return { level: 'none', label: 'No reuse licence', allows: 'Link and cite only. No audio, video or text reuse.', derivatives: false };
  if (/nd/.test(l)) return { level: 'nd', label: l.toUpperCase(), allows: 'Read and share unchanged. No audio, video or adapted versions (no-derivatives).', derivatives: false };
  if (/nc/.test(l)) return { level: 'nc', label: l.toUpperCase(), allows: 'Non-commercial reuse with attribution. Audio/video allowed on this free site.', derivatives: true };
  if (/cc0|by/.test(l)) return { level: 'open', label: l.toUpperCase(), allows: 'Reuse with attribution, including audio and video.', derivatives: true };
  return { level: 'other', label: l.toUpperCase(), allows: 'Unrecognised licence: link and cite only.', derivatives: false };
}

export function checks(a, full = null) {
  const out = [];
  const add = (state, label, detail, source) => out.push({ state, label, detail, source });

  add(a.doi || a.pmid || a.pmcid ? 'ok' : 'warn', 'Identifiers',
    [a.doi && `DOI ${a.doi}`, a.pmid && `PMID ${a.pmid}`, a.pmcid && a.pmcid].filter(Boolean).join(' · ') || 'No DOI/PMID found',
    'Europe PMC record');

  const retracted = a.pubTypes.some(t => /retracted publication/i.test(t)) || a.corrections.some(c => /retraction in/i.test(c.type || ''));
  const isNotice = a.pubTypes.some(t => /retraction of publication/i.test(t));
  const eoc = a.corrections.some(c => /expression of concern/i.test(c.type || ''));
  const errata = a.corrections.filter(c => /erratum|correction|corrected/i.test(c.type || '')).length;
  if (retracted) add('bad', 'RETRACTED', 'This article has been retracted. Do not rely on its findings.', 'Europe PMC publication type / correction links');
  else if (isNotice) add('warn', 'Retraction notice', 'This record is itself a retraction notice.', 'Europe PMC publication type');
  else add('ok', 'Not marked retracted', 'No retraction found in the record as of today.', 'Europe PMC publication type / correction links');
  if (eoc) add('warn', 'Expression of concern', 'The journal published an expression of concern.', 'Europe PMC correction links');
  if (errata) add('warn', 'Corrections', `${errata} correction/erratum notice(s) linked.`, 'Europe PMC correction links');

  add(a.source === 'PPR' ? 'warn' : 'ok', a.source === 'PPR' ? 'Preprint (not peer reviewed)' : 'Journal publication',
    a.source === 'PPR' ? 'Not yet peer reviewed. Treat findings as preliminary.' : (a.journal || 'Journal'), 'Europe PMC source');

  add('info', 'Study design', studyDesign(a), 'PubMed/Europe PMC publication types');

  const r = reuse(a);
  add(r.derivatives ? 'ok' : 'warn', `Licence: ${r.label}`, r.allows, 'Europe PMC licence field');

  if (full) {
    add(full.funding ? 'ok' : 'warn', 'Funding statement', full.funding ? 'Present in full text' : 'Not found in full text', 'Full text (JATS)');
    add(full.coi ? 'ok' : 'warn', 'Conflict-of-interest statement', full.coi ? 'Present in full text' : 'Not found in full text', 'Full text (JATS)');
    add(full.dataAvail ? 'ok' : 'warn', 'Data availability', full.dataAvail ? 'Statement present' : 'No statement found', 'Full text (JATS)');
  }

  const reg = (a.abstractHtml + ' ' + (full ? full.sections.map(s => s.text).join(' ') : '')).match(/\b(NCT\d{8}|CTRI\/\d{4}\/\d+\/\d+|ISRCTN\d{8}|ACTRN\d{14}|ChiCTR[-\w]+|PROSPERO\s*CRD\d+|CRD\d{11})\b/i);
  if (/trial/i.test(studyDesign(a)) || reg) {
    add(reg ? 'ok' : 'warn', 'Registration', reg ? `Registration ID found: ${reg[1]}` : 'No trial registration ID found in the text', 'Text search for registry IDs');
  }

  add('info', 'Cited by', `${a.citedBy} citing article(s) in Europe PMC`, 'Europe PMC citation count');
  return out;
}

export function score(list) {
  if (list.some(c => c.state === 'bad')) return { label: 'Retracted', cls: 'bad' };
  const warns = list.filter(c => c.state === 'warn').length;
  return warns === 0 ? { label: 'All checks passed', cls: 'ok' } : { label: `${warns} flag${warns > 1 ? 's' : ''}`, cls: 'warn' };
}

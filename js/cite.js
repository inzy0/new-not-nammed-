// Citation styles built from the Europe PMC record. Formats follow the published style rules for journal articles.

function authorsVancouver(a, max = 6) {
  const list = a.authors.length ? a.authors.map(x => x.last ? `${x.last} ${x.initials}`.trim() : x.name) : (a.authorString ? a.authorString.replace(/\.$/, '').split(', ') : []);
  if (!list.length) return '';
  return list.length > max ? list.slice(0, max).join(', ') + ', et al.' : list.join(', ') + '.';
}

function authorsAPA(a) {
  const list = a.authors.map(x => x.last ? `${x.last}, ${(x.initials || '').split('').map(c => c + '.').join(' ')}`.trim() : x.name);
  if (!list.length) return a.authorString || '';
  if (list.length === 1) return list[0];
  if (list.length <= 20) return list.slice(0, -1).join(', ') + ', & ' + list[list.length - 1];
  return list.slice(0, 19).join(', ') + ', ... ' + list[list.length - 1];
}

const vip = a => [a.volume, a.issue ? `(${a.issue})` : ''].join('') + (a.pages ? `:${a.pages}` : '');

export function vancouver(a) {
  return `${authorsVancouver(a)} ${a.title}. ${a.journalAbbr || a.journal}. ${a.year}${a.volume ? ';' + vip(a) : ''}.` +
    (a.doi ? ` doi:${a.doi}` : '') + (a.pmid ? ` PMID: ${a.pmid}.` : '');
}

export function ama(a) {
  return `${authorsVancouver(a).replace(/\.$/, '')}. ${a.title}. ${a.journalAbbr || a.journal}. ${a.year}${a.volume ? ';' + vip(a) : ''}.` +
    (a.doi ? ` doi:${a.doi}` : '');
}

export function apa(a) {
  return `${authorsAPA(a)} (${a.year}). ${a.title}. ${a.journal}${a.volume ? `, ${a.volume}` : ''}${a.issue ? `(${a.issue})` : ''}${a.pages ? `, ${a.pages}` : ''}.` +
    (a.doi ? ` https://doi.org/${a.doi}` : '');
}

export function bibtex(a) {
  const key = ((a.authors[0]?.last || 'anon') + a.year).replace(/[^A-Za-z0-9]/g, '');
  const esc = s => String(s || '').replace(/[{}]/g, '');
  const f = [
    `  title = {${esc(a.title)}}`,
    `  author = {${a.authors.map(x => x.last ? `${esc(x.last)}, ${esc(x.initials)}` : esc(x.name)).join(' and ')}}`,
    `  journal = {${esc(a.journal)}}`, `  year = {${a.year}}`,
    a.volume && `  volume = {${a.volume}}`, a.issue && `  number = {${a.issue}}`, a.pages && `  pages = {${a.pages}}`,
    a.doi && `  doi = {${a.doi}}`, a.pmid && `  pmid = {${a.pmid}}`,
  ].filter(Boolean);
  return `@article{${key},\n${f.join(',\n')}\n}`;
}

export const STYLES = { Vancouver: vancouver, AMA: ama, APA: apa, BibTeX: bibtex };

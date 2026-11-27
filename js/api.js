// Europe PMC (articles, full text) and OpenAlex (researchers). Both are free, keyless and allow browser calls.
import { plain } from './util.js';

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const cache = new Map();

async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 60000);
  let r;
  try { r = await fetch(url, { signal: ctl.signal }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? `${new URL(url).host} took over 60 s to answer` : `cannot reach ${new URL(url).host}`); }
  finally { clearTimeout(timer); }
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  const j = await r.json();
  cache.set(url, j);
  return j;
}

function isoDaysAgo(n) { const d = new Date(Date.now() - n * 864e5); return d.toISOString().slice(0, 10); }

export async function searchArticles({ query, days = 30, openOnly = true, pageSize = 24, cursor = '*', sort = 'date' }) {
  // Title + abstract only: full-text matching pulls in papers that merely mention a term.
  let q = `TITLE_ABS:(${query})`;
  if (openOnly) q += ' AND OPEN_ACCESS:y';
  if (days) q += ` AND FIRST_PDATE:[${isoDaysAgo(days)} TO ${isoDaysAgo(0)}]`;
  const sortParam = sort === 'cited' ? 'CITED desc' : 'FIRST_PDATE_D desc';
  const url = `${EPMC}/search?query=${encodeURIComponent(q)}&format=json&resultType=core&pageSize=${pageSize}` +
    `&cursorMark=${encodeURIComponent(cursor)}&sort=${encodeURIComponent(sortParam)}`;
  const j = await getJSON(url);
  return { hitCount: j.hitCount, next: j.nextCursorMark, results: (j.resultList?.result || []).map(normalize) };
}

export async function getArticle(key) {
  // key: PMC123, MED:12345 or PPR:PPR123
  let q;
  if (/^PMC\d+$/i.test(key)) q = `PMCID:${key.toUpperCase()}`;
  else if (/^MED:\d+$/i.test(key)) q = `EXT_ID:${key.split(':')[1]} AND SRC:MED`;
  else if (/^PPR:/i.test(key)) q = `EXT_ID:${key.split(':')[1]} AND SRC:PPR`;
  else if (/^\d+$/.test(key)) q = `EXT_ID:${key} AND SRC:MED`;
  else q = `DOI:"${key}"`;
  const j = await getJSON(`${EPMC}/search?query=${encodeURIComponent(q)}&format=json&resultType=core&pageSize=1`);
  const r = j.resultList?.result?.[0];
  return r ? normalize(r) : null;
}

export function keyOf(a) { return a.pmcid || (a.source === 'MED' ? `MED:${a.pmid}` : `${a.source}:${a.id}`); }

function normalize(r) {
  const ji = r.journalInfo || {};
  const authors = (r.authorList?.author || []).map(a => ({
    name: a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' ') || a.collectiveName || '',
    last: a.lastName || a.collectiveName || '', initials: a.initials || '',
    orcid: a.authorId?.type === 'ORCID' ? a.authorId.value : null,
  }));
  return {
    id: r.id, source: r.source, pmid: r.pmid || null, pmcid: r.pmcid || null, doi: r.doi || null,
    title: plain(r.title).replace(/\.$/, ''),
    authorString: r.authorString || '', authors,
    journal: ji.journal?.title || r.bookOrReportDetails?.publisher || (r.source === 'PPR' ? 'Preprint' : ''),
    journalAbbr: ji.journal?.isoabbreviation || ji.journal?.medlineAbbreviation || ji.journal?.title || '',
    volume: ji.volume || '', issue: ji.issue || '', pages: r.pageInfo || '',
    year: r.pubYear || (r.firstPublicationDate || r.electronicPublicationDate || '').slice(0, 4), date: r.firstPublicationDate || '',
    abstractHtml: r.abstractText || '',
    pubTypes: r.pubTypeList?.pubType || [],
    isOA: r.isOpenAccess === 'Y', license: (r.license || '').toLowerCase(),
    citedBy: r.citedByCount ?? 0, hasFullText: !!(r.pmcid && r.inEPMC === 'Y'),
    corrections: r.commentCorrectionList?.commentCorrection || [],
    mesh: (r.meshHeadingList?.meshHeading || []).map(m => m.descriptorName),
    grants: r.grantsList?.grant || [],
    language: r.language || '',
  };
}

// Full text JATS XML (open access only). Returns {abstract:[{title,text}], sections:[{title,text}], figures:[...]}
export async function getFullText(pmcid) {
  const url = `${EPMC}/${pmcid}/fullTextXML`;
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Full text not available (HTTP ${r.status})`);
  const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const secs = (root) => {
    const out = [];
    if (!root) return out;
    const top = Array.from(root.children).filter(c => c.tagName === 'sec');
    if (!top.length) { const p = Array.from(root.querySelectorAll('p')).map(text).join(' '); if (p) out.push({ title: 'Text', text: p }); }
    for (const s of top) {
      const title = text(s.querySelector(':scope > title')) || 'Section';
      const paras = Array.from(s.querySelectorAll('p')).map(text).filter(Boolean).join(' ');
      if (paras) out.push({ title, text: paras });
    }
    return out;
  };
  const abs = xml.querySelector('article-meta > abstract:not([abstract-type])') || xml.querySelector('article-meta > abstract');
  const figs = Array.from(xml.querySelectorAll('fig')).map(f => ({
    label: text(f.querySelector('label')), caption: text(f.querySelector('caption')),
  }));
  const out = {
    abstract: abs ? secs(abs) : [],
    sections: secs(xml.querySelector('body')),
    figures: figs,
    funding: text(xml.querySelector('funding-group')) || '',
    coi: Array.from(xml.querySelectorAll('fn[fn-type="COI-statement"], fn[fn-type="conflict"], sec[sec-type="COI-statement"]')).map(text).join(' '),
    dataAvail: Array.from(xml.querySelectorAll('sec[sec-type="data-availability"], notes[notes-type="data-availability"], fn[fn-type="data-availability"]')).map(text).join(' '),
  };
  cache.set(url, out);
  return out;
}

// Abstract sections from Europe PMC abstractText (uses <h4> headings when structured).
export function abstractSections(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const out = []; let cur = { title: 'Abstract', text: '' };
  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeName === 'H4') { if (cur.text.trim()) out.push(cur); cur = { title: node.textContent.trim().replace(/:$/, ''), text: '' }; }
    else cur.text += ' ' + (node.textContent || '');
  }
  if (cur.text.trim()) out.push(cur);
  return out.map(s => ({ title: s.title, text: s.text.replace(/\s+/g, ' ').trim() }));
}

// ---------- OpenAlex researchers ----------
const OA = 'https://api.openalex.org';
export async function searchResearchers(q) {
  const j = await getJSON(`${OA}/authors?search=${encodeURIComponent(q)}&per-page=20`);
  return (j.results || []).map(a => ({
    id: a.id?.split('/').pop(), name: a.display_name, orcid: a.orcid ? a.orcid.split('/').pop() : null,
    works: a.works_count, cites: a.cited_by_count, h: a.summary_stats?.h_index ?? null, i10: a.summary_stats?.i10_index ?? null,
    inst: (a.last_known_institutions || [])[0]?.display_name || '', country: (a.last_known_institutions || [])[0]?.country_code || '',
    topics: (a.topics || []).slice(0, 4).map(t => t.display_name),
  }));
}

export async function getResearcher(id) {
  const a = await getJSON(`${OA}/authors/${encodeURIComponent(id)}`);
  const works = await getJSON(`${OA}/works?filter=author.id:${encodeURIComponent(id)}&sort=cited_by_count:desc&per-page=12`);
  const recent = await getJSON(`${OA}/works?filter=author.id:${encodeURIComponent(id)}&sort=publication_date:desc&per-page=12`);
  const mapW = w => ({ title: w.display_name || w.title || '(untitled)', year: w.publication_year, cites: w.cited_by_count,
    doi: w.doi ? w.doi.replace('https://doi.org/', '') : null, pmid: w.ids?.pmid ? w.ids.pmid.split('/').pop() : null,
    pmcid: w.ids?.pmcid ? w.ids.pmcid.split('/').pop() : null, retracted: !!w.is_retracted, type: w.type,
    venue: w.primary_location?.source?.display_name || '' });
  return {
    id, name: a.display_name, orcid: a.orcid ? a.orcid.split('/').pop() : null, works: a.works_count, cites: a.cited_by_count,
    h: a.summary_stats?.h_index, i10: a.summary_stats?.i10_index,
    inst: (a.last_known_institutions || []).map(i => i.display_name), topics: (a.topics || []).slice(0, 8).map(t => t.display_name),
    perYear: (a.counts_by_year || []).map(c => ({ year: c.year, cites: c.cited_by_count, works: c.works_count })).sort((x, y) => x.year - y.year),
    top: (works.results || []).map(mapW), recent: (recent.results || []).map(mapW),
  };
}

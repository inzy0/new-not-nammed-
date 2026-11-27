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

// Full text JATS XML (open access only). Structured for the reader, figures, author statements and audio.
const XLINK = 'http://www.w3.org/1999/xlink';
const inflight = new Map();
export function getFullText(pmcid) {
  const url = `${EPMC}/${pmcid}/fullTextXML`;
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 60000);
    let r;
    try { r = await fetch(url, { signal: ctl.signal }); }
    catch (e) { throw new Error(e.name === 'AbortError' ? 'Full text took over 60 s' : 'Full text not available yet'); }
    finally { clearTimeout(timer); }
    if (!r.ok) throw new Error(`Full text not available (HTTP ${r.status})`);
    const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Full text could not be read');
    const out = parseJats(xml);
    cache.set(url, out);
    return out;
  })();
  inflight.set(url, p);
  p.then(() => inflight.delete(url), () => inflight.delete(url));
  return p;
}

function parseJats(xml) {
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const kids = (el, tag) => Array.from(el?.children || []).filter(c => c.tagName === tag);
  const figOf = f => {
    const g = f.querySelector('graphic');
    return { id: f.getAttribute('id') || '', label: text(f.querySelector('label')), caption: text(f.querySelector('caption')),
      href: g ? (g.getAttributeNS(XLINK, 'href') || g.getAttribute('xlink:href') || '') : '' };
  };
  const parasOf = el => kids(el, 'p').map(text).filter(Boolean);
  const secs = root => {
    const out = [];
    if (!root) return out;
    const top = kids(root, 'sec');
    if (!top.length) {
      const paras = Array.from(root.querySelectorAll('p')).map(text).filter(Boolean);
      if (paras.length) out.push({ title: 'Text', paras, subs: [], figs: Array.from(root.querySelectorAll('fig')).map(figOf), text: paras.join(' ') });
      return out;
    }
    for (const s of top) {
      const title = text(s.querySelector(':scope > title')) || 'Section';
      const paras = parasOf(s);
      const subs = kids(s, 'sec').map(ss => ({ title: text(ss.querySelector(':scope > title')), paras: Array.from(ss.querySelectorAll('p')).map(text).filter(Boolean) })).filter(x => x.paras.length);
      const figs = Array.from(s.querySelectorAll('fig')).map(figOf);
      const all = [...paras, ...subs.flatMap(x => x.paras)];
      if (all.length || figs.length) out.push({ title, paras, subs, figs, text: all.join(' ') });
    }
    return out;
  };
  const absEl = xml.querySelector('article-meta > abstract:not([abstract-type])') || xml.querySelector('article-meta > abstract');
  const byType = sel => Array.from(xml.querySelectorAll(sel)).map(text).filter(Boolean).join(' ');
  const body = secs(xml.querySelector('body'));
  const backSecs = secs(xml.querySelector('back')).filter(s => !/^references?$/i.test(s.title));
  // Statements often sit as sub-sections (e.g. Declarations > Funding) in the body or back matter.
  const allSecs = [...body, ...backSecs];
  const pick = re => allSecs.flatMap(s => re.test(s.title) ? [s.text] : s.subs.filter(ss => re.test(ss.title || '')).map(ss => ss.paras.join(' '))).filter(Boolean).join(' ');
  return {
    abstract: absEl ? secs(absEl).map(s => ({ title: s.title === 'Text' ? 'Abstract' : s.title, text: s.text })) : [],
    sections: body,
    figures: Array.from(xml.querySelectorAll('fig')).map(figOf),
    tables: Array.from(xml.querySelectorAll('table-wrap')).map(t => ({ label: text(t.querySelector('label')), caption: text(t.querySelector('caption')) })),
    affs: Array.from(xml.querySelectorAll('article-meta aff')).map(a => text(a).replace(/^\d+\s*/, '')).filter(Boolean),
    keywords: Array.from(xml.querySelectorAll('article-meta kwd')).map(text).filter(Boolean),
    funding: text(xml.querySelector('funding-group')) || pick(/funding|financial support/i),
    coi: byType('fn[fn-type="COI-statement"], fn[fn-type="conflict"], sec[sec-type="COI-statement"]') || pick(/conflicts? of interest|competing interest|declaration of interest|disclosure|disclosures/i),
    dataAvail: byType('sec[sec-type="data-availability"], sec[sec-type="data-availability-statement"], notes[notes-type="data-availability"], fn[fn-type="data-availability"]') || pick(/data availability|availability of data|data sharing/i),
    contrib: byType('fn[fn-type="con"], sec[sec-type="author-contributions"]') || pick(/author contribution|contributions/i),
    ethics: byType('sec[sec-type="ethics-statement"]') || pick(/ethic|consent/i),
    acknowledgements: text(xml.querySelector('back > ack')),
  };
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
  const oid = (a.id || '').split('/').pop();
  const works = await getJSON(`${OA}/works?filter=author.id:${oid}&sort=cited_by_count:desc&per-page=12`);
  const recent = await getJSON(`${OA}/works?filter=author.id:${oid}&sort=publication_date:desc&per-page=12`);
  const mapW = w => ({ title: w.display_name || w.title || '(untitled)', year: w.publication_year, cites: w.cited_by_count,
    doi: w.doi ? w.doi.replace('https://doi.org/', '') : null, pmid: w.ids?.pmid ? w.ids.pmid.split('/').pop() : null,
    pmcid: w.ids?.pmcid ? w.ids.pmcid.split('/').pop() : null, retracted: !!w.is_retracted, type: w.type,
    venue: w.primary_location?.source?.display_name || '' });
  return {
    id: oid, name: a.display_name, orcid: a.orcid ? a.orcid.split('/').pop() : null, works: a.works_count, cites: a.cited_by_count,
    h: a.summary_stats?.h_index, i10: a.summary_stats?.i10_index,
    inst: (a.last_known_institutions || []).map(i => i.display_name), topics: (a.topics || []).slice(0, 8).map(t => t.display_name),
    perYear: (a.counts_by_year || []).map(c => ({ year: c.year, cites: c.cited_by_count, works: c.works_count })).sort((x, y) => x.year - y.year),
    top: (works.results || []).map(mapW), recent: (recent.results || []).map(mapW),
  };
}

// Related papers (OpenAlex related_works for a DOI).
export async function relatedPapers(doi) {
  if (!doi) return [];
  const w = await getJSON(`${OA}/works/doi:${encodeURIComponent(doi)}?select=related_works`);
  const ids = (w.related_works || []).slice(0, 8).map(u => u.split('/').pop());
  if (!ids.length) return [];
  const j = await getJSON(`${OA}/works?filter=openalex:${ids.join('|')}&select=id,display_name,doi,ids,publication_year,primary_location,cited_by_count&per-page=8`);
  return (j.results || []).map(x => ({ title: x.display_name, year: x.publication_year, cites: x.cited_by_count,
    doi: x.doi ? x.doi.replace('https://doi.org/', '') : null, pmcid: x.ids?.pmcid ? x.ids.pmcid.split('/').pop() : null,
    pmid: x.ids?.pmid ? x.ids.pmid.split('/').pop() : null, venue: x.primary_location?.source?.display_name || '' }));
}

// Total open-access papers in Europe PMC (a real, live count).
export async function openAccessTotal() {
  const j = await getJSON(`${EPMC}/search?query=${encodeURIComponent('OPEN_ACCESS:y')}&format=json&pageSize=1&resultType=idlist`);
  return j.hitCount;
}

export function articleKeyFromWork(w) { return w.pmcid || (w.pmid ? `MED:${w.pmid}` : w.doi); }

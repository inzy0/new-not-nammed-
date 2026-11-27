// Paper figures from the PMC Open Access cloud archive (AWS Open Data, public, no key).
// The archive keeps files under <PMCID>.<version>/<file>. The browser cannot list it (no CORS on listings),
// so candidate URLs are tried in order and the first that loads is kept.
import { h } from './util.js';

const S3 = 'https://pmc-oa-opendata.s3.amazonaws.com';

export function figCandidates(pmcid, href) {
  if (!pmcid || !href) return [];
  const base = href.replace(/\.(tiff?|eps)$/i, '');
  const names = /\.(jpe?g|png|gif|webp)$/i.test(base) ? [base] : [`${base}.jpg`, `${base}.png`, `${base}.gif`];
  const out = [];
  for (const v of [1, 2, 3]) for (const n of names) out.push(`${S3}/${pmcid}.${v}/${n}`);
  return out;
}

export function figImg(pmcid, fig, cls = '') {
  const c = figCandidates(pmcid, fig.href);
  const alt = (fig.label ? fig.label + ': ' : '') + (fig.caption || 'Figure from the paper').slice(0, 300);
  if (!c.length) return h('div', { class: 'fig-missing' }, 'Figure file not listed');
  let i = 0;
  const img = h('img', { src: c[0], alt, loading: 'lazy', decoding: 'async', class: cls, referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => {
    i++;
    if (i < c.length) img.src = c[i];
    else img.replaceWith(h('div', { class: 'fig-missing ' + cls }, 'Figure not available yet'));
  });
  return img;
}

export const pdfUrl = pmcid => `${S3}/${pmcid}.1/${pmcid}.1.pdf`;

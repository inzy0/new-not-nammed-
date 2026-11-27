// "Publish with us" landing, About page, and first-visit onboarding.
import { h, store } from './util.js';
import { icon } from './icons.js';
import { DOMAINS } from './ids.js';
import { THEMES, applyTheme, profile } from './core.js';
import { COMPLETED_TYPES } from './publish.js';
import { loadPosts } from './feed.js';

const view = document.getElementById('view');

export async function publishWithUs() {
  const posts = await loadPosts();
  const released = posts.filter(p => p.articleId).length;
  const step = (n, t, d) => h('li', { class: 'pstep glass' }, h('span', { class: 'pn' }, n), h('div', {}, h('b', {}, t), h('p', { class: 'meta' }, d)));
  view.replaceChildren(h('section', { class: 'section wide pwu' },
    h('div', { class: 'pwu-hero glass' },
      h('div', {}, h('div', { class: 'kicker' }, 'PUBLISH WITH EVIDARA'), h('h1', {}, 'Your completed study,', h('br'), 'verified and seen.'),
        h('p', { class: 'sub' }, 'Free publication for completed health research. Every accepted study gets an Evidara Article ID, its own article page, and an audio track, video and reel made from its own words. It appears in your field\'s feeds and on the map.'),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: '#publish/new/evidara' }, 'Start a submission'), h('a', { class: 'btn ghost', href: '#feed' }, 'See Community studies'),
          h('span', { class: 'meta' }, `${released} stud${released === 1 ? 'y' : 'ies'} released so far`))),
      h('div', { class: 'pwu-badge' }, h('div', { class: 'ring' }, 'EVD'), h('div', { class: 'meta' }, 'Article ID format', h('br'), h('b', {}, 'EVD-2026-00001')))),
    h('div', { class: 'grid pwu-grid' },
      h('div', { class: 'card' }, h('h3', {}, 'What we accept'), h('ul', {}, ...COMPLETED_TYPES.map(t => h('li', {}, t))),
        h('p', { class: 'meta' }, 'Completed studies only: data collection and analysis finished, results reported.')),
      h('div', { class: 'card' }, h('h3', {}, 'What we don\'t accept'), h('ul', {}, h('li', {}, 'Plans or protocols without results (post them in Community instead)'), h('li', {}, 'Anything with patient-identifiable information'),
        h('li', {}, 'Work already published in a journal (preprints are fine, declared)'), h('li', {}, 'Claims without data, or promotional content'))),
      h('div', { class: 'card' }, h('h3', {}, 'What you get'), h('ul', {}, h('li', {}, 'Evidara Article ID and a citable article page'), h('li', {}, 'Audio track (Short, Briefing, Long) and a video, from your own text'),
        h('li', {}, 'A reel and a place in your field\'s feeds'), h('li', {}, 'Verified author badges linked to Evidara IDs and ORCID'), h('li', {}, 'A verification report shown with the article')))),
    h('h2', { class: 'h3x', style: 'margin-top:30px' }, 'The pathway'),
    h('ol', { class: 'psteps' },
      step('1', 'Prepare', 'Full paper, structured abstract, figures, references with DOIs, declarations, and ORCID for every author.'),
      step('2', 'Submit', 'Write it in Publish (Evidara track). Automated checks run as you type. Download the submission package and send it to the editor.'),
      step('3', 'Screening', 'Scope, completeness and a patient-identifier screen. Incomplete or out-of-scope work is returned with reasons.'),
      step('4', 'Verification', 'Author identities (Evidara ID, ORCID), ethics approval, consent, registration ID, references (existence and retractions).'),
      step('5', 'Review', 'At least one verified member in the field reviews the study. Questions go back to the authors.'),
      step('6', 'Decision', 'Accept, revise or decline, with reasons.'),
      step('7', 'Release', 'Article ID issued; article page, audio, video and reel go live in feeds, Reels, Podcasts and the map.')),
    h('div', { class: 'grid pwu-grid' },
      h('div', { class: 'card' }, h('h3', {}, 'Rights, licence & commercial use'),
        h('p', {}, 'Authors keep copyright. You choose the licence: CC BY 4.0 (anyone may reuse, including commercially, with credit) or CC BY-NC 4.0 (non-commercial reuse only).'),
        h('p', { class: 'meta' }, 'Publishing on Evidara is free. Evidara does not sell your article.')),
      h('div', { class: 'card' }, h('h3', {}, 'Claiming your work'),
        h('p', {}, 'Each author is linked by Evidara ID and ORCID (check digit verified). Verified members appear as confirmed authors; others can claim authorship after verification.')),
      h('div', { class: 'card' }, h('h3', {}, 'Not yet available'),
        h('p', {}, 'DOIs, PubMed or Scopus indexing, and journal impact metrics need Evidara to register as a publisher (for example with Crossref). That is a future step and is not offered today.'),
        h('p', { class: 'meta' }, 'Corrections and retractions are published openly on the article page.')))));
}

export function about() {
  const block = (t, ...kids) => h('div', { class: 'card' }, h('h3', {}, t), ...kids);
  view.replaceChildren(h('section', { class: 'section wide about' },
    h('div', { class: 'pwu-hero glass' }, h('div', {}, h('div', { class: 'kicker' }, 'ABOUT EVIDARA'), h('h1', {}, 'Read. Verify.', h('br'), 'Create. Share.'),
      h('p', { class: 'sub' }, 'A free home for healthcare professionals and researchers: millions of open-access papers with a verification card, audio, video and reels made from the papers\' own words, a studio, publishing, a map of who works where, and a verified community.'))),
    h('div', { class: 'grid' },
      block('How a paper reaches you', h('ol', {}, h('li', {}, 'Europe PMC supplies the open-access record and full text.'), h('li', {}, 'Evidara runs the verification card: retraction, corrections, design, licence, declarations, registration.'),
        h('li', {}, 'If the licence allows, audio, video and a reel are made from the paper\'s own sentences and figures.'), h('li', {}, 'You read, listen, cite, save and discuss.'))),
      block('What "verified" means', h('p', {}, 'A passed check means the record shows it, for example "not marked retracted". It does not mean the findings are correct. Members are verified by the admin against registration and documents.')),
      block('No invented content', h('p', {}, 'Audio, video and reels never add claims. Signposts like "What did they find?" carry no facts; every content line is a sentence from the source.')),
      block('Patient privacy', h('p', {}, 'No patient data, ever. Every text box, upload and document is screened for identifiers, and anything flagged is refused. The screen is a safety net, not a guarantee.')),
      block('Data sources & licences', h('ul', {}, h('li', {}, 'Europe PMC (papers, full text)'), h('li', {}, 'OpenAlex, CC0 (researchers, institutions, related works)'), h('li', {}, 'PMC Open Access archive on AWS Open Data (figures)'),
        h('li', {}, 'OpenStreetMap (map tiles, © contributors)'), h('li', {}, 'pdf.js (Apache-2.0), Leaflet (BSD-2-Clause)')), h('p', { class: 'meta' }, 'Each article\'s own licence governs its reuse.')),
      block('Free, with daily limits', h('p', {}, 'Everything is free. Making audio, video and images has a daily limit per device that refreshes every day at 05:30 IST.')),
      block('Your data', h('p', {}, 'Profile, library, drafts and notebook documents stay in your browser until accounts arrive. Nothing is sold or shared.')),
      block('Roadmap', h('p', {}, 'Next: accounts with Google sign-in, shared discussion, community likes, author media uploads and built-in image generation on a free cloud backend.'),
        h('a', { class: 'btn small ghost', href: 'https://github.com/inzy0/new-not-nammed-/blob/main/docs/ROADMAP.md', target: '_blank', rel: 'noopener noreferrer' }, 'Read the roadmap ↗')))));
}

// First visit: pick your fields and a theme (skippable).
export function onboarding() {
  if (store.get('onboarded', false)) return;
  const pr = profile();
  let picks = [pr.domain];
  const chips = h('div', { class: 'chips' });
  const draw = () => chips.replaceChildren(...DOMAINS.map(([c, l]) => h('button', { type: 'button', class: 'chip pick' + (picks.includes(c) ? ' on' : ''), onclick: () => { picks = picks.includes(c) ? picks.filter(x => x !== c) : [...picks, c]; if (!picks.length) picks = [c]; draw(); } }, l)));
  draw();
  const themes = h('div', { class: 'row' }, ...THEMES.map(([id, name, , sw]) => h('button', { type: 'button', class: 'themechip', style: `background:${sw}`, title: name, onclick: () => applyTheme(id) }, name)));
  const close = () => { store.set('onboarded', true); modal.classList.add('out'); setTimeout(() => modal.remove(), 350); };
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome to Evidara' },
    h('div', { class: 'modal-card glass' },
      h('div', { class: 'kicker' }, 'WELCOME'), h('h2', {}, 'Make Evidara yours'),
      h('p', { class: 'meta' }, 'Pick the fields you follow. Your feed, reels, podcasts and map start there. You can change this any time.'),
      chips, h('div', { class: 'meta', style: 'margin:14px 0 6px' }, 'Theme'), themes,
      h('div', { class: 'row', style: 'margin-top:18px;justify-content:flex-end' },
        h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Skip'),
        h('button', { class: 'btn', type: 'button', onclick: () => {
          const ex = store.get('explore', {}); ex.feeds = picks; store.set('explore', ex);
          store.set('profile', { ...profile(), domain: picks[0] }); close(); dispatchEvent(new HashChangeEvent('hashchange'));
        } }, 'Start exploring'))));
  document.body.append(modal);
}

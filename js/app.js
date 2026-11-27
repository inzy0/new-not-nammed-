// Shell + router. Audio keeps playing across pages (the player lives outside the view).
import { h } from './util.js';
import { icon } from './icons.js';
import { updateQuotaLine } from './core.js';
import { explore } from './feed.js';
import { paper } from './paper.js';
import { reels } from './reels.js';
import { podcasts } from './podpage.js';
import { people, researcher, idLookup, studio, library, profilePage } from './views.js';

const view = document.getElementById('view');
const NAV = [
  ['feed', 'Explore', 'explore'], ['reels', 'Reels', 'reels'], ['podcasts', 'Podcasts', 'podcast'],
  ['library', 'My Library', 'library'], ['people', 'Researchers', 'people'], ['studio', 'Studio', 'studio'], ['profile', 'Profile', 'profile'],
];
document.getElementById('snav').append(...NAV.map(([r, label, ic]) =>
  h('a', { class: 'snav-item', href: `#${r}`, dataset: { nav: r } }, h('span', { class: 'ico' }, icon(ic, 22)), h('span', { class: 'lbl' }, label))));
document.getElementById('themeIco').append(icon('theme', 22));

const routes = { feed: explore, home: explore, paper, reels, podcasts, people, researcher, studio, library, profile: profilePage, id: idLookup };
const parent = { paper: 'feed', researcher: 'people', id: 'people', home: 'feed' };

function route() {
  const [name, ...rest] = (location.hash.slice(1) || 'feed').split('/');
  const fn = routes[name] || explore;
  const navKey = parent[name] || name;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navKey));
  document.body.dataset.route = name in routes ? name : 'feed';
  view.replaceChildren();
  Promise.resolve(fn(rest.map(s => { try { return decodeURIComponent(s); } catch { return s; } })))
    .catch(err => view.replaceChildren(h('div', { class: 'empty' }, `Something went wrong: ${err.message}. `, h('button', { class: 'btn small', type: 'button', onclick: route }, 'Retry'))));
  updateQuotaLine();
  if (name !== 'paper' || !rest[1]) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', e => { console.warn('Unhandled:', e.reason); });
route();

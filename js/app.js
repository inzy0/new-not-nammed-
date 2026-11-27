// Shell + router. Audio keeps playing across pages (the player lives outside the view).
import { h } from './util.js';
import { icon } from './icons.js';
import { updateQuotaLine } from './core.js';
import { transition, startReveal, startBackground, startTilt, startPills } from './anim.js';
import { explore } from './feed.js';
import { paper } from './paper.js';
import { reels } from './reels.js';
import { podcasts } from './podpage.js';
import { people, researcher, idLookup, studio, library, profilePage } from './views.js';
import { publish, postPage } from './publish.js';
import { admin } from './admin.js';
import { mapPage } from './map.js';
import { publishWithUs, about, onboarding } from './about.js';

const view = document.getElementById('view');
const NAV = [
  ['feed', 'Explore', 'explore'], ['reels', 'Reels', 'reels'], ['podcasts', 'Podcasts', 'podcast'], ['map', 'Map', 'globe'], ['studio', 'Studio', 'studio'],
  ['publish-with-us', 'Publish with us', 'pdf'], ['people', 'People', 'people'], ['library', 'My Library', 'library'], ['profile', 'Profile', 'profile'], ['about', 'About', 'info'],
];
document.getElementById('snav').append(...NAV.map(([r, label, ic]) =>
  h('a', { class: 'snav-item', href: `#${r}`, dataset: { nav: r } }, h('span', { class: 'ico' }, icon(ic, 22)), h('span', { class: 'lbl' }, label))));
document.getElementById('themeIco').append(icon('theme', 22));

const routes = { feed: explore, home: explore, paper, reels, podcasts, people, researcher, studio, library, profile: profilePage, id: idLookup, publish, post: postPage, admin, map: mapPage, 'publish-with-us': publishWithUs, about };
const parent = { paper: 'feed', researcher: 'people', id: 'people', home: 'feed', post: 'feed', admin: 'profile', publish: 'publish-with-us' };
let first = true;

function route() {
  const [name, ...rest] = (location.hash.slice(1) || 'feed').split('/');
  const fn = routes[name] || explore;
  const navKey = parent[name] || name;
  const run = () => {
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navKey));
    document.body.dataset.route = name in routes ? name : 'feed';
    view.replaceChildren();
    Promise.resolve(fn(rest.map(s => { try { return decodeURIComponent(s); } catch { return s; } })))
      .catch(err => view.replaceChildren(h('div', { class: 'empty' }, `Something went wrong: ${err.message}. `, h('button', { class: 'btn small', type: 'button', onclick: route }, 'Retry'))));
    updateQuotaLine();
    if (name !== 'paper' || !rest[1]) window.scrollTo(0, 0);
  };
  if (first) { first = false; run(); } else transition(run);
}
window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', e => { console.warn('Unhandled:', e.reason); });
startBackground();
startReveal();
startTilt();
startPills();
route();
onboarding();

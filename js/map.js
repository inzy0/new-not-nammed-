// Map: three linked views.
//  • Universe: every healthcare domain is a planet; size = open-access papers in the last 30 days (Europe PMC, live).
//    Positions are a visual metaphor, not astronomy. Click a planet to land on Earth in that domain.
//  • Earth: real world map (OpenStreetMap). Institutions publishing in the domain (OpenAlex, last 12 months) at their
//    real coordinates; zoom from the globe to city and street level. Click a place for its people, studies and links.
//  • Articles: where one study was done: every author institution on the map, connected.
import { h, store, toast } from './util.js';
import { icon } from './icons.js';
import { DOMAINS, domainByCode } from './ids.js';
import { searchArticles, getArticle, getSubfield, domainInstitutions, institutionPeople, institutionWorks, institutionCollabs, institutionsGeo, workPlaces, recentDomainWorks, articleKeyFromWork } from './api.js';
import { profile } from './core.js';
import { online, user, api } from './backend.js';
import { reduced } from './anim.js';

const view = document.getElementById('view');
let leafletP = null;
function leaflet() {
  if (leafletP) return leafletP;
  leafletP = new Promise((resolve, reject) => {
    if (window.L) { resolve(window.L); return; }
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css'; document.head.append(css);
    const s = document.createElement('script'); s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => resolve(window.L); s.onerror = () => { leafletP = null; reject(new Error('Could not load the map library')); };
    document.head.append(s);
  });
  return leafletP;
}
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hue = code => { let x = 0; for (const c of code) x = (x * 37 + c.charCodeAt(0)) % 360; return x; };
const darkTheme = () => ['bloom', 'pulse'].includes(document.documentElement.dataset.theme);

export async function mapPage([mode = 'universe', arg]) {
  const pr = profile();
  const tabs = h('div', { class: 'seg' }, ...[['universe', 'Universe'], ['earth', 'Earth'], ['people', 'People'], ['article', 'Articles']].map(([k, l]) =>
    h('button', { type: 'button', class: k === mode ? 'on' : '', onclick: () => (location.hash = `#map/${k}${k === 'earth' ? '/' + (arg && (domainByCode(arg) || arg === 'ALL') ? arg : pr.domain) : ''}`) }, l)));
  const stage = h('div', { class: 'mapstage' });
  view.replaceChildren(h('section', { class: 'mapwrap' }, h('div', { class: 'maphead glass' }, h('h2', {}, 'Map'), tabs, h('span', { class: 'meta maphint' })), stage));
  const hint = view.querySelector('.maphint');
  if (mode === 'earth') return earth(stage, hint, arg && (domainByCode(arg) || arg === 'ALL') ? arg : pr.domain);
  if (mode === 'people') return peopleMap(stage, hint);
  if (mode === 'article') return articles(stage, hint, arg);
  return universe(stage, hint);
}

// ---------------- Universe ----------------
async function universe(stage, hint) {
  hint.textContent = 'Each planet is a healthcare domain. Size = open-access papers in the last 30 days. Click to land on Earth.';
  const day = new Date().toISOString().slice(0, 10);
  const cache = store.get('uniCounts', {});
  const counts = cache.day === day ? cache.c : {};
  const space = h('div', { class: 'space' });
  const stars = h('canvas', { class: 'stars', 'aria-hidden': 'true' });
  const sun = h('button', { class: 'sun', type: 'button', title: 'All fields', onclick: () => (location.hash = '#feed') }, h('b', {}, 'EVIDARA'), h('span', {}, 'all fields'));
  const ringsBox = h('div', { class: 'rings' });
  const list = h('div', { class: 'unilist glass' });
  const RINGS = [10, 10, 10, 10];
  let idx = 0;
  const planets = [];
  RINGS.forEach((n, ri) => {
    const ring = h('div', { class: 'orbit', style: `--r:${ri};--dur:${70 + ri * 35}s` });
    for (let k = 0; k < n && idx < DOMAINS.length; k++, idx++) {
      const [code, label] = DOMAINS[idx];
      const ang = (360 / n) * k + ri * 17;
      const p = h('button', { class: 'planet', type: 'button', style: `--a:${ang}deg;--h:${hue(code)}`, title: label, 'aria-label': `${label}: open domain map`, onclick: e => land(e.currentTarget, code) },
        h('span', { class: 'pin' }, h('span', { class: 'ball' }), h('span', { class: 'plabel' }, h('b', {}, code), h('i', {}, '…'))));
      planets.push({ el: p, code, label });
      ring.append(p);
    }
    ringsBox.append(ring);
  });
  space.append(stars, ringsBox, sun);
  stage.replaceChildren(h('div', { class: 'unigrid' }, space, list));
  const drawStars = () => {
    const r = space.getBoundingClientRect(); stars.width = r.width; stars.height = r.height;
    const x = stars.getContext('2d'); x.clearRect(0, 0, r.width, r.height);
    for (let i = 0; i < 260; i++) { x.globalAlpha = Math.random() * .8 + .1; x.fillStyle = '#fff'; const s = Math.random() * 1.6; x.fillRect(Math.random() * r.width, Math.random() * r.height, s, s); }
  };
  drawStars(); addEventListener('resize', drawStars, { passive: true });
  function land(el, code) {
    if (reduced()) { location.hash = `#map/earth/${code}`; return; }
    el.classList.add('landing'); space.classList.add('zooming');
    setTimeout(() => (location.hash = `#map/earth/${code}`), 650);
  }
  const apply = () => {
    const vals = planets.map(p => counts[p.code]).filter(v => v != null);
    const max = Math.max(1, ...vals);
    planets.forEach(p => {
      const v = counts[p.code];
      const size = v == null ? 30 : 24 + Math.sqrt(v / max) * 52;
      p.el.style.setProperty('--s', `${size}px`);
      p.el.querySelector('i').textContent = v == null ? '…' : v.toLocaleString();
    });
    const sorted = planets.filter(p => counts[p.code] != null).sort((a, b) => counts[b.code] - counts[a.code]);
    list.replaceChildren(h('b', {}, 'Domains by new open-access papers (30 days)'), ...sorted.map(p => h('a', { class: 'unirow', href: `#map/earth/${p.code}` },
      h('span', { class: 'dot', style: `--h:${hue(p.code)}` }), h('span', {}, p.label), h('span', { class: 'bar' }, h('i', { style: `width:${(counts[p.code] / max) * 100}%` })), h('span', { class: 'meta' }, counts[p.code].toLocaleString()))),
      planets.length > sorted.length ? h('div', { class: 'meta' }, h('span', { class: 'spinner' }), ` Counting ${planets.length - sorted.length} more…`) : h('div', { class: 'meta' }, 'Source: Europe PMC, live. Updated once a day on this device.'));
  };
  apply();
  const todo = planets.filter(p => counts[p.code] == null);
  let active = 0, i = 0;
  await new Promise(resolve => {
    if (!todo.length) { resolve(); return; }
    const next = () => {
      if (!document.body.contains(space)) { resolve(); return; }
      while (active < 4 && i < todo.length) {
        const p = todo[i++]; active++;
        searchArticles({ query: domainByCode(p.code)[2], days: 30, pageSize: 1 }).then(r => { counts[p.code] = r.hitCount; store.set('uniCounts', { day, c: counts }); apply(); })
          .catch(() => {}).finally(() => { active--; if (i >= todo.length && active === 0) resolve(); else next(); });
      }
    };
    next();
  });
}

// ---------------- Earth ----------------
async function earth(stage, hint, code) {
  const d = code === 'ALL' ? ['ALL', 'All fields'] : domainByCode(code);
  let country = store.get('mapCountry', '');
  const sel = h('select', { 'aria-label': 'Domain' }, h('option', { value: 'ALL', selected: code === 'ALL' }, 'All fields'), ...DOMAINS.map(([c, l]) => h('option', { value: c, selected: c === code }, l)));
  sel.addEventListener('change', () => (location.hash = `#map/earth/${sel.value}`));
  const ctry = h('div', { class: 'seg small' }, ...[['', 'World'], ['IN', 'India']].map(([v, l]) => h('button', { type: 'button', class: v === country ? 'on' : '', onclick: () => { store.set('mapCountry', v); mapPage(['earth', code]); } }, l)));
  const find = h('input', { type: 'search', placeholder: 'Find an institution or city on the map', 'aria-label': 'Find on map' });
  const panel = h('aside', { class: 'mappanel glass' }, h('div', { class: 'meta' }, 'Click a place to see its people, studies and connections.'));
  const mapEl = h('div', { class: 'leaf' + (darkTheme() ? ' dark' : '') });
  const status = h('div', { class: 'mapstatus glass' }, h('span', { class: 'spinner' }), ` Loading ${d[1]} institutions…`);
  stage.replaceChildren(h('div', { class: 'earthbar glass' }, sel, ctry, find), h('div', { class: 'earthgrid' }, h('div', { class: 'leafbox' }, mapEl, status), panel));
  hint.textContent = `${d[1]}: institutions publishing in the last 12 months (OpenAlex). Zoom to city and street level.`;
  let L;
  try { L = await leaflet(); } catch (e) { status.textContent = e.message; return; }
  const map = L.map(mapEl, { worldCopyJump: true, zoomSnap: 0.5, minZoom: 2, maxZoom: 19, zoomControl: true }).setView(country === 'IN' ? [22.5, 79] : [25, 10], country === 'IN' ? 4.5 : 2.2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · data © OpenAlex (CC0)' }).addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
  const layer = L.layerGroup().addTo(map); const lines = L.layerGroup().addTo(map);
  let places = [], sf = null;
  try {
    sf = await getSubfield(d[1]);
    if (!sf) { status.textContent = `No OpenAlex subfield matches ${d[1]} yet.`; return; }
    const r = await domainInstitutions(sf.id, country);
    places = r.list;
    status.replaceChildren(`${places.length} institutions · ${r.total.toLocaleString()} works in "${sf.name}"${country ? ' with an Indian author' : ''} (last 12 months)`);
  } catch (e) { status.replaceChildren(`Could not load map data: ${e.message} `, h('button', { class: 'btn small', type: 'button', onclick: () => mapPage(['earth', code]) }, 'Retry')); return; }
  const max = Math.max(1, ...places.map(p => p.count));
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#E0563F', accent2 = css.getPropertyValue('--accent-2').trim() || '#D174D2';
  const markers = new Map();
  for (const p of places) {
    const m = L.circleMarker([p.lat, p.lng], { radius: 4 + Math.sqrt(p.count / max) * 18, color: accent2, weight: 1.5, fillColor: accent, fillOpacity: 0.55 })
      .bindTooltip(`${esc(p.name)} · ${esc(p.city ? p.city + ', ' : '')}${esc(p.country)} · ${p.count} works`, { direction: 'top' })
      .on('click', () => open(p));
    m.addTo(layer); markers.set(p.id, m);
  }
  find.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = find.value.trim().toLowerCase(); if (!q) return;
    const hit = places.find(p => p.name.toLowerCase().includes(q)) || places.find(p => (p.city + ' ' + p.region + ' ' + p.country).toLowerCase().includes(q));
    if (hit) open(hit); else toast('Not among the institutions on this map');
  });
  async function open(p) {
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 11), { duration: reduced() ? 0 : 1.1 });
    lines.clearLayers();
    const body = h('div', {});
    const tabsP = h('div', { class: 'seg small' });
    let tab = 'people';
    const show = async () => {
      tabsP.replaceChildren(...[['people', 'People'], ['studies', 'Studies'], ['links', 'Connections']].map(([k, l]) => h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; show(); } }, l)));
      body.replaceChildren(h('div', { class: 'meta' }, h('span', { class: 'spinner' }), ' Loading…'));
      try {
        if (tab === 'people') {
          const ps = await institutionPeople(p.id, sf.id);
          body.replaceChildren(...(ps.length ? ps.map(a => h('a', { class: 'maprow', href: `#researcher/${a.id}` }, h('span', { class: 'av' }, a.name.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()), h('span', {}, h('b', {}, a.name), h('span', { class: 'meta' }, ` · ${a.works} works · h ${a.h ?? '?'}`))))
            : [h('div', { class: 'meta' }, 'No researchers listed here for this domain.')]));
        } else if (tab === 'studies') {
          const ws = await institutionWorks(p.id, sf.id);
          body.replaceChildren(...(ws.length ? ws.map(w => { const k = articleKeyFromWork(w); return h('div', { class: 'maprow col' }, k ? h('a', { href: `#paper/${encodeURIComponent(k)}` }, w.title) : h('span', {}, w.title), h('span', { class: 'meta' }, `${w.year} · cited ${w.cites}${w.oa ? ' · open access' : ''}`)); })
            : [h('div', { class: 'meta' }, 'No recent studies listed.')]));
        } else {
          const cs = await institutionCollabs(p.id, sf.id);
          const missing = cs.filter(c => !places.some(x => x.id === c.id)).map(c => c.id);
          const extra = missing.length ? await institutionsGeo(missing) : [];
          const all = [...places, ...extra];
          lines.clearLayers();
          cs.forEach(c => { const t = all.find(x => x.id === c.id); if (t) L.polyline([[p.lat, p.lng], [t.lat, t.lng]], { color: accent2, weight: 1 + Math.min(5, c.count / 3), opacity: 0.6 }).bindTooltip(`${esc(c.name)}: ${c.count} shared works`).addTo(lines); });
          body.replaceChildren(h('div', { class: 'meta' }, `${cs.length} collaborating institutions in the last 2 years (lines on the map).`),
            ...cs.map(c => h('div', { class: 'maprow' }, h('span', {}, h('b', {}, c.name), h('span', { class: 'meta' }, ` · ${c.count} shared works`)))));
        }
      } catch (e) { body.replaceChildren(h('div', { class: 'meta' }, `Could not load: ${e.message}`)); }
    };
    panel.replaceChildren(h('div', { class: 'rhead' }, h('h3', {}, p.name), h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Close', onclick: () => { lines.clearLayers(); panel.replaceChildren(h('div', { class: 'meta' }, 'Click a place to see its people, studies and connections.')); } }, icon('close', 16))),
      h('div', { class: 'meta' }, [p.city, p.region, p.country].filter(Boolean).join(', ')),
      h('div', { class: 'chips' }, h('span', { class: 'chip' }, `${p.count} works in ${sf.name}`), p.type ? h('span', { class: 'chip' }, p.type) : null, p.url ? h('a', { class: 'chip', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, 'Website ↗') : null),
      tabsP, body);
    show();
  }
}

// ---------------- Articles ----------------
async function articles(stage, hint, arg) {
  hint.textContent = 'Where a study was done: each author institution, connected. Enter a DOI or PMCID, or pick a recent paper.';
  const input = h('input', { type: 'search', placeholder: 'DOI or PMCID, e.g. 10.1093/eurheartj/ehaf258', 'aria-label': 'Article', value: arg || '' });
  const go = () => { const v = input.value.trim(); if (v) location.hash = `#map/article/${encodeURIComponent(v)}`; };
  input.addEventListener('keydown', e => e.key === 'Enter' && go());
  const panel = h('aside', { class: 'mappanel glass' });
  const mapEl = h('div', { class: 'leaf' + (darkTheme() ? ' dark' : '') });
  const status = h('div', { class: 'mapstatus glass' });
  stage.replaceChildren(h('div', { class: 'earthbar glass' }, input, h('button', { class: 'btn small', type: 'button', onclick: go }, 'Show')), h('div', { class: 'earthgrid' }, h('div', { class: 'leafbox' }, mapEl, status), panel));
  let L; try { L = await leaflet(); } catch (e) { status.textContent = e.message; return; }
  const map = L.map(mapEl, { worldCopyJump: true, minZoom: 2, maxZoom: 19 }).setView([25, 10], 2.2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · data © OpenAlex (CC0)' }).addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#E0563F', accent2 = css.getPropertyValue('--accent-2').trim() || '#D174D2';
  if (!arg) {
    status.replaceChildren(h('span', { class: 'spinner' }), ' Loading recent open-access papers in your domain…');
    try {
      const sf = await getSubfield(domainByCode(profile().domain)[1]);
      const ws = sf ? await recentDomainWorks(sf.id) : [];
      status.textContent = 'Pick a paper to map it.';
      panel.replaceChildren(h('b', {}, 'Recent papers in your domain'), ...ws.map(w => h('a', { class: 'maprow col', href: `#map/article/${encodeURIComponent(w.doi)}` }, h('span', {}, w.title), h('span', { class: 'meta' }, String(w.year)))));
    } catch (e) { status.textContent = `Could not load: ${e.message}`; }
    return;
  }
  status.replaceChildren(h('span', { class: 'spinner' }), ' Locating the authors\' institutions…');
  try {
    let doi = arg;
    if (!/^10\./.test(doi)) { const a = await getArticle(arg); doi = a?.doi; if (!doi) throw new Error('No DOI for this paper'); }
    const w = await workPlaces(doi);
    if (!w.places.length) { status.textContent = 'No institution locations are listed for this paper.'; return; }
    const pts = w.places.map(p => [p.lat, p.lng]);
    w.places.forEach(p => {
      const names = w.authors.filter(a => a.insts.includes(p.id)).map(a => a.name);
      L.circleMarker([p.lat, p.lng], { radius: 7 + Math.min(10, names.length * 2), color: accent2, weight: 2, fillColor: accent, fillOpacity: 0.7 })
        .bindTooltip(`${esc(p.name)} · ${esc(p.city ? p.city + ', ' : '')}${esc(p.country)}<br>${esc(names.slice(0, 6).join(', '))}${names.length > 6 ? '…' : ''}`).addTo(map);
    });
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) L.polyline([pts[i], pts[j]], { color: accent2, weight: 1, opacity: 0.45 }).addTo(map);
    map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 9 });
    status.textContent = `${w.places.length} institution${w.places.length > 1 ? 's' : ''} · ${w.authors.length} authors · ${new Set(w.places.map(p => p.country)).size} countr${new Set(w.places.map(p => p.country)).size > 1 ? 'ies' : 'y'}`;
    const key = articleKeyFromWork({ doi });
    panel.replaceChildren(h('a', { href: `#paper/${encodeURIComponent(key)}` }, h('h3', {}, w.title)), h('div', { class: 'meta' }, `${w.year} · doi ${doi}`),
      h('b', {}, 'Institutions'), ...w.places.map(p => h('div', { class: 'maprow col' }, h('b', {}, p.name), h('span', { class: 'meta' }, [p.city, p.country].filter(Boolean).join(', ')))),
      h('b', {}, 'Authors'), h('div', { class: 'chips' }, ...w.authors.map(a => h('span', { class: 'chip' }, a.name))));
  } catch (e) { status.textContent = `Could not map this article: ${e.message}`; }
}

// ---------- People: where members are, and who you're connected to ----------
async function peopleMap(stage, hint) {
  hint.textContent = 'Verified members who shared a location you are allowed to see (rounded to ~5 km). Lines join you to your connections.';
  const panel = h('aside', { class: 'mappanel glass' });
  const mapEl = h('div', { class: 'leaf' + (darkTheme() ? ' dark' : '') });
  const status = h('div', { class: 'mapstatus glass' }, h('span', { class: 'spinner' }), ' Loading members…');
  stage.replaceChildren(h('div', { class: 'earthgrid' }, h('div', { class: 'leafbox' }, mapEl, status), panel));
  if (!online()) { status.textContent = 'The People map needs Evidara accounts.'; return; }
  let L; try { L = await leaflet(); } catch (e) { status.textContent = e.message; return; }
  const map = L.map(mapEl, { worldCopyJump: true, minZoom: 2, maxZoom: 18 }).setView([22, 79], 3);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#E0563F', accent2 = css.getPropertyValue('--accent-2').trim() || '#D174D2', ok = css.getPropertyValue('--ok').trim() || '#7fe0b0';
  let r;
  try { r = await api('/map/members'); } catch (e) { status.textContent = e.message; return; }
  if (!r.signedIn) { status.textContent = 'Sign in to see members on the map.'; panel.replaceChildren(h('p', { class: 'meta' }, 'Members choose who can see their location: all members, only people they accepted, or nobody.')); return; }
  const me = r.points.find(p => p.me);
  for (const p of r.points) {
    const color = p.me ? ok : p.connected ? accent2 : accent;
    L.circleMarker([p.lat, p.lng], { radius: p.me ? 10 : 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 })
      .bindTooltip(`${esc(p.name)}${p.me ? ' (you)' : p.connected ? ' · connected' : ''} · ${esc([p.city, p.country].filter(Boolean).join(', '))}`)
      .on('click', () => (location.hash = `#u/${encodeURIComponent(p.id)}`)).addTo(map);
    if (me && p.connected) L.polyline([[me.lat, me.lng], [p.lat, p.lng]], { color: accent2, weight: 2, opacity: 0.7, dashArray: '6 6' }).addTo(map);
  }
  if (r.points.length) map.fitBounds(L.latLngBounds(r.points.map(p => [p.lat, p.lng])).pad(0.4), { maxZoom: 8 });
  status.textContent = `${r.points.length} member${r.points.length === 1 ? '' : 's'} on the map${me ? '' : ' · add your location in Edit profile'}`;
  panel.replaceChildren(h('b', {}, 'Members'), h('div', { class: 'meta' }, '● you   ● connected   ● other members'),
    ...r.points.sort((a, b) => (b.me - a.me) || (b.connected - a.connected)).map(p => h('a', { class: 'maprow', href: `#u/${encodeURIComponent(p.id)}` }, h('span', { class: 'av' }, (p.name || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()),
      h('span', {}, h('b', {}, p.name), h('span', { class: 'meta' }, ` · ${[p.city, p.country].filter(Boolean).join(', ')}${p.me ? ' · you' : p.connected ? ' · connected' : ''}`)))),
    me ? null : h('a', { class: 'btn small', href: '#profile/edit' }, 'Add my location'));
}

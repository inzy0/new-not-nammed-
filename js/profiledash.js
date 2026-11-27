// Profile dashboard (Instagram-style header + LinkedIn-style About), member posts (image / reel / thought / study review),
// post viewer, create-post sheet and Edit profile.
import { h, store, toast, copyText } from './util.js';
import { icon } from './icons.js';
import { domainByCode, validOrcid } from './ids.js';
import { getArticle, keyOf } from './api.js';
import { online, user, api, loadMe, openSignIn, requireVerified, requireSignedIn } from './backend.js';
import { driveReady, uploadToDrive, driveImage, driveVideoEmbed, driveOpen } from './gdrive.js';
import { toggleLike, refreshLikeCounts } from './feed.js';

const view = document.getElementById('view');
const initials = n => String(n || '?').split(/[\s@]+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
const PATIENT = [/\b\d{4}\s?\d{4}\s?\d{4}\b/, /\b(MRN|UHID|IP ?No|OPD ?No)\b/i, /\b(DOB|date of birth)\b/i, /\b\d{2}[\/-]\d{2}[\/-](19|20)\d{2}\b/, /\b[6-9]\d{9}\b/];
const KIND = { image: 'Post', reel: 'Reel', thought: 'Thought', review: 'Study review' };
const avatarSrc = a => !a ? null : a.startsWith('drive:') ? driveImage(a.slice(6), 400) : a;
function avatarEl(p, cls = 'av xl') { const s = avatarSrc(p.avatar); return s ? h('img', { class: cls + ' avimg', src: s, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: cls }, initials(p.name)); }

// Safe text with clickable links (text nodes + <a>, never innerHTML)
export function linkify(text) {
  const frag = document.createDocumentFragment();
  String(text || '').split(/(https?:\/\/[^\s<>"]+)/g).forEach((part, i) => {
    if (i % 2) frag.append(h('a', { href: part, target: '_blank', rel: 'noopener noreferrer nofollow' }, part.length > 60 ? part.slice(0, 57) + '…' : part));
    else part.split(/(#[\w-]{2,40})/g).forEach((t, j) => frag.append(j % 2 ? h('span', { class: 'hashtag' }, t) : document.createTextNode(t)));
  });
  return frag;
}
export function mediaEl(m, { thumb = false } = {}) {
  if (m.type === 'image') return h('img', { src: m.src, alt: m.alt || '', loading: 'lazy' });
  if (m.type === 'drive') {
    if (/^video\//.test(m.mime)) return thumb ? h('img', { src: driveImage(m.id, 600), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('iframe', { src: driveVideoEmbed(m.id), allow: 'autoplay; fullscreen', allowfullscreen: true, title: m.name || 'Video', loading: 'lazy' });
    if (/^image\//.test(m.mime)) return h('img', { src: driveImage(m.id, thumb ? 600 : 1600), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    return h('a', { class: 'btn small ghost', href: driveOpen(m.id), target: '_blank', rel: 'noopener noreferrer' }, `Open ${m.name || 'file'} ↗`);
  }
  if (m.type === 'youtube') return thumb ? h('img', { src: `https://i.ytimg.com/vi/${m.id}/hqdefault.jpg`, alt: '', loading: 'lazy' }) : h('iframe', { src: `https://www.youtube-nocookie.com/embed/${m.id}`, allow: 'fullscreen; picture-in-picture', allowfullscreen: true, title: 'Video', loading: 'lazy' });
  return h('span', {});
}
export function musicEl(mu) {
  if (!mu) return null;
  const src = mu.provider === 'spotify' ? `https://open.spotify.com/embed/${mu.kind}/${mu.id}` : mu.provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${mu.id}` : `https://w.soundcloud.com/player/?url=${encodeURIComponent(mu.url)}&visual=false`;
  return h('div', { class: 'music' }, h('div', { class: 'meta' }, '♫ ', mu.title || 'Attached music'), h('iframe', { src, height: mu.provider === 'spotify' ? 80 : 120, allow: 'encrypted-media; autoplay', loading: 'lazy', title: 'Music' }));
}

// ---------- dashboard ----------
export async function dashboard(memberId) {
  view.replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'spinner' }), ' Loading profile…'));
  let d;
  try { d = await api('/u/' + encodeURIComponent(memberId)); } catch (e) { view.replaceChildren(h('div', { class: 'empty' }, e.message)); return; }
  const p = d.profile, me = d.viewer.me, u = user();
  let tab = 'posts';
  const grid = h('div', { class: 'pgrid' });
  const tabs = h('div', { class: 'ptabs' });
  const counts = d.stats.kinds || {};
  const TABS = [['posts', 'Posts', 'explore'], ['reels', 'Reels', 'reels'], ['thoughts', 'Thoughts', 'chat'], ['reviews', 'Reviews', 'studio'], ['pubs', 'Publications', 'pdf'], ['about', 'About', 'profile']];
  const drawTabs = () => tabs.replaceChildren(...TABS.map(([k, l, ic]) => h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; drawTabs(); drawGrid(); } }, icon(ic, 16), ' ', l)));
  const tile = x => {
    const cover = x.media.find(m => m.type) || null;
    const el = h('button', { type: 'button', class: `ptile k-${x.kind}`, onclick: () => openPost(x.id) },
      cover ? mediaEl(cover, { thumb: true }) : h('div', { class: 'ptxt' }, x.kind === 'review' ? h('div', { class: 'stars' }, '★'.repeat(x.rating || 0) + '☆'.repeat(5 - (x.rating || 0))) : null, h('p', {}, (x.caption || '').slice(0, 160)), x.paperTitle ? h('small', {}, x.paperTitle.slice(0, 80)) : null),
      h('span', { class: 'pbadge' }, x.kind === 'reel' ? icon('reels', 16) : x.media.length > 1 ? icon('queue', 16) : null), x.ev ? h('span', { class: 'evmark', title: 'Verified & liked by Evidara' }, 'EV') : null,
      x.music ? h('span', { class: 'mbadge' }, '♫') : null);
    return el;
  };
  function drawGrid() {
    grid.className = 'pgrid';
    if (tab === 'about') { grid.className = 'pabout'; grid.replaceChildren(...aboutSections(d)); return; }
    if (tab === 'pubs') { grid.className = 'pabout'; grid.replaceChildren(h('div', { class: 'card' }, h('h3', {}, 'Publications on Evidara'), ...(d.publications.length ? d.publications.map(x => h('div', { class: 'vrow' }, h('a', { href: `#post/${encodeURIComponent(x.id)}` }, x.title), h('div', { class: 'meta' }, `${x.articleId || 'Community'} · ${new Date(x.at).toLocaleDateString()}`, x.ev ? ' · ' : '', x.ev ? h('span', { class: 'evmark inline' }, 'EV') : ''))) : [h('div', { class: 'meta' }, 'No publications yet.')])), researchCard(p)); return; }
    const want = { posts: x => true, reels: x => x.kind === 'reel', thoughts: x => x.kind === 'thought', reviews: x => x.kind === 'review' }[tab];
    const list = d.posts.filter(want);
    grid.replaceChildren(...(list.length ? list.map(tile) : [h('div', { class: 'empty pempty' }, me ? 'Share your first post: an idea, a study you\'re working on, a reel or a review.' : 'Nothing here yet.')]));
  }
  const follow = h('button', { class: 'btn' + (d.viewer.following ? ' ghost' : ''), type: 'button', onclick: async () => {
    if (!requireSignedIn('follow members')) return;
    try { const r = await api('/follows/' + encodeURIComponent('m:' + p.id), { method: 'POST', body: { name: p.name } }); d.viewer.following = r.following; d.stats.followers += r.following ? 1 : -1; follow.textContent = r.following ? 'Following' : 'Follow'; follow.classList.toggle('ghost', r.following); statsEl.replaceChildren(...stats()); } catch (e) { toast(e.message); }
  } }, d.viewer.following ? 'Following' : 'Follow');
  const stats = () => [['posts', d.stats.posts, 'posts'], ['followers', d.stats.followers, 'followers'], ['following', d.stats.following, 'following'], ['pubs', d.stats.publications, 'publications']].map(([, n, l]) => h('span', {}, h('b', {}, String(n)), ' ', l));
  const statsEl = h('div', { class: 'pstats' }, ...stats());
  const hl = p.highlights?.length ? h('div', { class: 'phl' }, ...p.highlights.map(x => h('button', { type: 'button', class: 'hlitem', onclick: () => sheet(x.title, h('p', { class: 'hltext' }, linkify(x.text))) }, h('span', { class: 'hlring' }, x.title.slice(0, 2).toUpperCase()), h('span', { class: 'hlt' }, x.title)))) : null;
  view.replaceChildren(h('section', { class: 'pdash' },
    h('header', { class: 'phero' }, h('div', { class: 'pav' }, avatarEl(p)),
      h('div', { class: 'pmain' },
        h('div', { class: 'prow1' }, h('h1', {}, p.name), p.verified ? h('span', { class: 'vtick', title: 'Verified member' }, icon('check', 14)) : null, p.admin ? h('span', { class: 'chip ok' }, 'Admin') : null,
          d.stats.evStars ? h('span', { class: 'evmark inline', title: `${d.stats.evStars} post(s) verified & liked by Evidara` }, `EV ×${d.stats.evStars}`) : null),
        h('div', { class: 'meta' }, [p.id !== 'admin' ? p.id : '', p.headline].filter(Boolean).join(' · ')),
        statsEl,
        h('div', { class: 'pbio' }, p.role ? h('div', { class: 'meta' }, [p.role, p.institution].filter(Boolean).join(' · ')) : null, p.bio ? h('p', {}, linkify(p.bio)) : null,
          p.niche?.length ? h('div', { class: 'chips' }, ...p.niche.map(n => h('span', { class: 'chip' }, n))) : null,
          p.website ? h('a', { class: 'plink', href: p.website, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 14), ' ', p.website.replace(/^https?:\/\//, '').slice(0, 60)) : null),
        h('div', { class: 'row pbtns' },
          me ? h('a', { class: 'btn ghost', href: '#profile/edit' }, 'Edit profile') : follow,
          me ? h('button', { class: 'btn', type: 'button', onclick: () => createPost(() => dashboard(memberId)) }, '+ New post') : h('a', { class: 'btn ghost', href: `#messages/${encodeURIComponent(p.id)}` }, 'Message'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => copyText(`${location.origin}${location.pathname}#u/${encodeURIComponent(p.id)}`) }, 'Share profile'),
          !me && p.id !== 'admin' ? h('a', { class: 'btn ghost', href: `#member/${encodeURIComponent(p.id)}` }, 'Contact') : null))),
    hl, tabs, grid));
  drawTabs(); drawGrid();
}

function researchCard(p) {
  const box = h('div', { class: 'card' }, h('h3', {}, 'Research (ORCID)'), h('div', { class: 'meta' }, p.orcid ? 'Loading works…' : 'Add your ORCID iD in Edit profile to show your research here.'));
  if (p.orcid && validOrcid(p.orcid)) {
    fetch(`https://api.openalex.org/works?filter=author.orcid:${p.orcid}&sort=cited_by_count:desc&per-page=12&select=display_name,doi,publication_year,cited_by_count,primary_location`).then(r => r.json()).then(j => {
      const ws = j.results || [];
      box.replaceChildren(h('h3', {}, `Research (${j.meta?.count || ws.length} works · ORCID)`), ...(ws.length ? ws.map(w => h('div', { class: 'vrow' },
        w.doi ? h('a', { href: `#paper/${encodeURIComponent(w.doi.replace('https://doi.org/', ''))}` }, w.display_name) : h('span', {}, w.display_name),
        h('div', { class: 'meta' }, `${w.primary_location?.source?.display_name || ''} · ${w.publication_year} · cited ${w.cited_by_count}`))) : [h('div', { class: 'meta' }, 'No works found for this ORCID in OpenAlex.')]),
        h('a', { class: 'btn small ghost', href: `https://orcid.org/${p.orcid}`, target: '_blank', rel: 'noopener noreferrer' }, 'ORCID profile ↗'));
    }).catch(() => box.replaceChildren(h('h3', {}, 'Research'), h('div', { class: 'meta' }, 'Could not load works right now.')));
  }
  return box;
}

function aboutSections(d) {
  const p = d.profile, cv = d.cv || {};
  const sec = (title, items, render) => h('div', { class: 'card lsec' }, h('h3', {}, title), ...(items?.length ? items.map(render) : [h('div', { class: 'meta' }, 'Nothing added yet.')]));
  const span = (a, b) => [a, b || (a ? 'Present' : '')].filter(Boolean).join(' – ');
  return [
    h('div', { class: 'card lsec' }, h('h3', {}, 'About'), p.bio ? h('p', {}, linkify(p.bio)) : h('div', { class: 'meta' }, 'No bio yet.'),
      h('div', { class: 'chips' }, p.domain ? h('span', { class: 'chip' }, domainByCode(p.domain)?.[1] || p.domain) : null, ...(p.niche || []).map(n => h('span', { class: 'chip' }, n))),
      cv.location ? h('div', { class: 'meta', style: 'margin-top:8px' }, '📍 ', [cv.location.city, cv.location.country].filter(Boolean).join(', ')) : null,
      cv.linkedin ? h('a', { class: 'btn small ghost', style: 'margin-top:8px', href: cv.linkedin, target: '_blank', rel: 'noopener noreferrer' }, 'LinkedIn profile ↗') : null),
    sec('Experience · pathway', cv.experience, x => h('div', { class: 'litem' }, h('span', { class: 'lico' }, icon('studio', 18)), h('div', {}, h('b', {}, x.title), h('div', {}, x.org), h('div', { class: 'meta' }, [span(x.start, x.end), x.place].filter(Boolean).join(' · ')), x.desc ? h('p', {}, linkify(x.desc)) : null))),
    sec('Education', cv.education, x => h('div', { class: 'litem' }, h('span', { class: 'lico' }, icon('library', 18)), h('div', {}, h('b', {}, x.school), h('div', {}, [x.degree, x.field].filter(Boolean).join(', ')), h('div', { class: 'meta' }, span(x.start, x.end)), x.desc ? h('p', {}, x.desc) : null))),
    sec('Licences & certifications', cv.certifications, x => h('div', { class: 'litem' }, h('span', { class: 'lico' }, icon('check', 18)), h('div', {}, h('b', {}, x.name), h('div', {}, x.issuer), h('div', { class: 'meta' }, x.date), x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, 'Show credential ↗') : null))),
    sec('Honours & achievements', cv.achievements, x => h('div', { class: 'litem' }, h('span', { class: 'lico' }, '🏆'), h('div', {}, h('b', {}, x.title), h('div', {}, x.issuer), h('div', { class: 'meta' }, x.date), x.desc ? h('p', {}, x.desc) : null))),
    h('div', { class: 'card lsec' }, h('h3', {}, 'Skills'), cv.skills?.length ? h('div', { class: 'chips' }, ...cv.skills.map(s => h('span', { class: 'chip' }, s))) : h('div', { class: 'meta' }, 'Nothing added yet.')),
    researchCard(p),
  ];
}

// ---------- sheet (modal) ----------
export function sheet(title, ...content) {
  const close = () => { m.classList.add('out'); setTimeout(() => m.remove(), 250); removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const m = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: e => { if (e.target === m) close(); } },
    h('div', { class: 'modal-card glass sheet' }, h('div', { class: 'rhead' }, h('h2', {}, title), h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Close', onclick: close }, icon('close', 16))), ...content));
  addEventListener('keydown', esc); document.body.append(m);
  return close;
}

// ---------- post viewer ----------
export async function openPost(id) {
  let x;
  try { x = (await api('/mposts/' + encodeURIComponent(id))).post; } catch (e) { toast(e.message); return; }
  const close = sheet(KIND[x.kind] || 'Post', postView(x, () => close()));
}
export async function postRoute([id]) {
  if (!online()) { view.replaceChildren(h('div', { class: 'empty' }, 'Member posts need Evidara accounts.')); return; }
  try { const x = (await api('/mposts/' + encodeURIComponent(id))).post; view.replaceChildren(h('section', { class: 'section narrow' }, h('div', { class: 'card' }, postView(x)))); } catch (e) { view.replaceChildren(h('div', { class: 'empty' }, e.message)); }
}
function postView(x, onClose) {
  const u = user();
  const a = x.author || {};
  let i = 0;
  const stage = h('div', { class: 'pv-stage' });
  const draw = () => { stage.replaceChildren(mediaEl(x.media[i]), x.media.length > 1 ? h('div', { class: 'pv-dots' }, ...x.media.map((_, j) => h('span', { class: j === i ? 'on' : '' }))) : null,
    x.media.length > 1 ? h('button', { class: 'vis-nav prev', type: 'button', 'aria-label': 'Previous', onclick: () => { i = (i - 1 + x.media.length) % x.media.length; draw(); } }, '‹') : null,
    x.media.length > 1 ? h('button', { class: 'vis-nav next', type: 'button', 'aria-label': 'Next', onclick: () => { i = (i + 1) % x.media.length; draw(); } }, '›') : null); };
  if (x.media.length) draw();
  const likeB = h('button', { class: 'act', type: 'button', dataset: { like: 'mp:' + x.id }, onclick: () => toggleLike('mp:' + x.id, likeB) }, icon('heart', 18), h('span', {}, 'Like'));
  const comments = h('div', { class: 'pv-comments' });
  const loadC = async () => { try { const cs = (await api('/threads/' + encodeURIComponent('mp:' + x.id))).comments || []; comments.replaceChildren(...cs.map(c => h('div', { class: 'pvc' }, h('a', { href: c.memberId ? `#u/${encodeURIComponent(c.memberId)}` : '#' }, h('b', {}, c.name || 'Member')), ' ', linkify(c.text), h('div', { class: 'meta' }, new Date(c.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))))); } catch { /* none */ } };
  const cin = h('input', { type: 'text', placeholder: 'Add a comment… (no patient details)', 'aria-label': 'Comment', maxlength: 2000 });
  const sendC = async () => { const t = cin.value.trim(); if (!t) return; if (!requireVerified('comment')) return; if (PATIENT.some(re => re.test(t))) { toast('Remove patient details first'); return; } try { await api('/threads/' + encodeURIComponent('mp:' + x.id), { method: 'POST', body: { text: t, kind: 'comment' } }); cin.value = ''; loadC(); } catch (e) { toast(e.message); } };
  cin.addEventListener('keydown', e => { if (e.key === 'Enter') sendC(); });
  setTimeout(() => { refreshLikeCounts(stage.parentElement || document); loadC(); }, 0);
  return h('article', { class: 'pview' + (x.media.length ? '' : ' textonly') },
    x.media.length ? stage : null,
    h('div', { class: 'pv-side' },
      h('a', { class: 'pv-author', href: `#u/${encodeURIComponent(a.id || '')}`, onclick: () => onClose?.() }, avatarEl(a, 'av lg'), h('span', {}, h('b', {}, a.name || 'Member'), a.verified ? h('span', { class: 'vtick sm' }, icon('check', 10)) : null, h('div', { class: 'meta' }, `${KIND[x.kind]} · ${new Date(x.at).toLocaleDateString()}`))),
      x.ev ? h('div', { class: 'evbanner' }, h('span', { class: 'evmark inline' }, 'EV'), ' Verified & liked by Evidara') : null,
      x.kind === 'review' ? h('div', { class: 'pv-review' }, h('div', { class: 'stars big' }, '★'.repeat(x.rating || 0) + '☆'.repeat(5 - (x.rating || 0))), x.paperKey ? h('a', { href: `#paper/${encodeURIComponent(x.paperKey)}`, onclick: () => onClose?.() }, x.paperTitle || x.paperKey) : null, h('div', { class: 'meta' }, 'Personal opinion of the author')) : null,
      h('p', { class: 'pv-cap' }, linkify(x.caption)),
      x.tags?.length ? h('div', { class: 'chips' }, ...x.tags.map(t => h('span', { class: 'chip' }, '#' + t))) : null,
      musicEl(x.music),
      h('div', { class: 'actions' }, likeB, h('button', { class: 'act', type: 'button', onclick: () => copyText(`${location.origin}${location.pathname}#mp/${x.id}`) }, icon('share', 18), h('span', {}, 'Share')),
        u?.admin ? h('button', { class: 'act' + (x.ev ? ' on' : ''), type: 'button', title: 'EV mark: verified & liked by Evidara', onclick: async e => { try { const r = await api('/admin/ev', { method: 'POST', body: { target: 'mp:' + x.id, on: !x.ev } }); x.ev = r.on; e.currentTarget.classList.toggle('on', r.on); toast(r.on ? 'EV mark added' : 'EV mark removed'); } catch (er) { toast(er.message); } } }, h('span', { class: 'evmark inline' }, 'EV'), h('span', {}, 'Star')) : null,
        (u && (u.admin || a.id === u.profile?.member_id)) ? h('button', { class: 'act', type: 'button', onclick: async () => { if (!confirm('Delete this post?')) return; try { await api('/mposts/' + x.id, { method: 'DELETE' }); toast('Deleted'); onClose?.(); if (location.hash.startsWith('#u/') || location.hash.startsWith('#profile')) dispatchEvent(new HashChangeEvent('hashchange')); } catch (er) { toast(er.message); } } }, icon('close', 16), h('span', {}, 'Delete')) : null),
      comments, h('div', { class: 'row pv-cin' }, cin, h('button', { class: 'btn small', type: 'button', onclick: sendC }, 'Post'))));
}

// ---------- create post ----------
async function compress(file, max = 1600, q = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let d = c.toDataURL('image/webp', q); if (d.length * 0.75 > 1.8e6) d = c.toDataURL('image/webp', 0.6);
    return d;
  } finally { URL.revokeObjectURL(url); }
}
export function createPost(onDone) {
  if (!requireVerified('post')) return;
  let kind = 'image', rating = 0, paper = null;
  const media = [];
  const seg = h('div', { class: 'seg' });
  const body = h('div', { class: 'cp-body' });
  const preview = h('div', { class: 'cp-media' });
  const caption = h('textarea', { placeholder: 'Write a caption: your idea, thoughts or what you are studying. Add #tags.', maxlength: 2200, rows: 4 });
  const count = h('span', { class: 'meta' }, '0 / 2200'); caption.addEventListener('input', () => (count.textContent = `${caption.value.length} / 2200`));
  const music = h('input', { type: 'url', placeholder: 'Attach music: Spotify, YouTube or SoundCloud link (optional)' });
  const musicTitle = h('input', { type: 'text', placeholder: 'Music title (optional)' });
  const consent = h('input', { type: 'checkbox' });
  const status = h('div', { class: 'meta' });
  const drawMedia = () => preview.replaceChildren(...media.map((m, i) => h('div', { class: 'cp-thumb' }, m.preview ? h('img', { src: m.preview, alt: '' }) : mediaEl(m, { thumb: true }), h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Remove', onclick: () => { media.splice(i, 1); drawMedia(); } }, icon('close', 12)))));
  const imgIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async () => {
    for (const f of imgIn.files) { if (media.length >= 10) break; try { const d = await compress(f); media.push({ type: 'image', dataUrl: d, preview: d }); } catch { toast(`Could not read ${f.name}`); } }
    imgIn.value = ''; drawMedia();
  } });
  const driveIn = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true, onchange: async () => {
    for (const f of driveIn.files) {
      if (media.length >= 10) break;
      try { status.textContent = `Uploading ${f.name} to your Google Drive…`; const r = await uploadToDrive(f, p => (status.textContent = `Uploading ${f.name}: ${Math.round(p * 100)}%`)); media.push({ type: 'drive', id: r.id, mime: r.mime, name: r.name }); }
      catch (e) { toast(e.message); }
    }
    status.textContent = ''; driveIn.value = ''; drawMedia();
  } });
  const yt = h('input', { type: 'url', placeholder: 'YouTube link (videos and Shorts)' });
  const paperIn = h('input', { type: 'text', placeholder: 'Study: PMCID, DOI or PMID (e.g. PMC13789448)' });
  const paperBox = h('div', { class: 'meta' });
  const stars = h('div', { class: 'stars big pick' });
  const drawStars = () => stars.replaceChildren(...[1, 2, 3, 4, 5].map(n => h('button', { type: 'button', 'aria-label': `${n} stars`, class: n <= rating ? 'on' : '', onclick: () => { rating = n; drawStars(); } }, '★')));
  drawStars();
  function drawBody() {
    seg.replaceChildren(...Object.entries(KIND).map(([k, l]) => h('button', { type: 'button', class: k === kind ? 'on' : '', onclick: () => { kind = k; drawBody(); } }, l)));
    const driveBtn = driveReady() ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => driveIn.click() }, icon('external', 14), kind === 'reel' ? ' Upload video to my Google Drive' : ' Upload originals / videos to my Google Drive') : null;
    body.replaceChildren(
      kind === 'image' ? h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => imgIn.click() }, '+ Add photos'), driveBtn, h('span', { class: 'meta' }, 'Up to 10. Photos are optimised automatically; originals and videos can live in your own Google Drive (unlimited for Evidara).')) : null,
      kind === 'reel' ? h('div', { class: 'cp-reel' }, h('div', { class: 'row' }, yt, h('button', { class: 'btn small', type: 'button', onclick: () => { if (!/youtu/.test(yt.value)) { toast('Paste a YouTube link'); return; } media.push({ type: 'youtube', url: yt.value.trim(), id: (yt.value.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [])[1] }); yt.value = ''; drawMedia(); } }, 'Add')), driveBtn) : null,
      kind === 'review' ? h('div', { class: 'cp-review' }, h('div', { class: 'row' }, paperIn, h('button', { class: 'btn small', type: 'button', onclick: async () => {
        try { const a = await getArticle(paperIn.value.trim()); if (!a) throw new Error('Study not found'); paper = { key: keyOf(a), title: a.title }; paperBox.textContent = `✓ ${a.title} · ${a.journal} ${a.year}`; } catch (e) { paperBox.textContent = e.message; paper = null; }
      } }, 'Find')), paperBox, h('div', { class: 'row' }, h('span', { class: 'meta' }, 'Your rating'), stars)) : null,
      preview, caption, h('div', { class: 'row', style: 'justify-content:flex-end' }, count),
      h('div', { class: 'grid2' }, music, musicTitle));
    drawMedia();
  }
  drawBody();
  const submit = h('button', { class: 'btn', type: 'button', onclick: async () => {
    const cap = caption.value.trim();
    if (PATIENT.some(re => re.test(cap))) { toast('Looks like patient details. Remove them before posting.'); return; }
    if (!consent.checked) { toast('Confirm that no patient can be identified'); return; }
    if (kind === 'review' && !paper) { toast('Find the study first'); return; }
    submit.disabled = true; submit.textContent = 'Posting…';
    try {
      await api('/mposts', { method: 'POST', body: { kind, caption: cap, media: media.map(({ preview, ...m }) => m), paperKey: paper?.key, paperTitle: paper?.title, rating, tags: (cap.match(/#[\w-]{2,40}/g) || []).map(t => t.slice(1)),
        music: music.value.trim() ? { url: music.value.trim(), title: musicTitle.value.trim() } : null, noPatients: true } });
      toast('Posted'); close(); onDone?.();
    } catch (e) { toast(e.message); submit.disabled = false; submit.textContent = 'Share'; }
  } }, 'Share');
  const close = sheet('New post', seg, body, imgIn, driveIn, status,
    h('label', { class: 'row', style: 'gap:8px;margin-top:8px' }, consent, 'No patient can be identified in this post (no faces, names, IDs, records or images of patients)'),
    h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:10px' }, submit));
}

// ---------- Edit profile (Instagram-style top + LinkedIn-style sections) ----------
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  // LinkedIn exports can start with a notes block; the header is the first row naming a known column.
  const KNOWN = /^(Company Name|School Name|Title|Name|Authority|Issued On|Degree Name)$/;
  let hi = rows.findIndex(r => r.some(c => KNOWN.test(c.trim()))); if (hi < 0) hi = rows.findIndex(r => r.length > 1); if (hi < 0) return [];
  const head = rows[hi].map(x => x.trim());
  return rows.slice(hi + 1).filter(r => r.some(Boolean)).map(r => Object.fromEntries(head.map((k, j) => [k, (r[j] || '').trim()])));
}
export async function editProfileCards() {
  if (!online() || !user()) return [];
  const u = user();
  const [ext, cv] = await Promise.all([api('/me/ext').then(r => r.ext || {}).catch(() => ({})), api('/me/cv').then(r => r.cv).catch(() => ({}))]);
  const state = { avatar: ext.avatar || null, newAvatar: null, headline: ext.headline || '', website: ext.website || '', niche: JSON.parse(ext.niche || '[]'), highlights: JSON.parse(ext.highlights || '[]'), bio: u.profile?.bio || '', orcid: u.profile?.orcid || '', role_title: u.profile?.role_title || '', institution: u.profile?.institution || '' };
  const c = { experience: cv.experience || [], education: cv.education || [], certifications: cv.certifications || [], achievements: cv.achievements || [], skills: cv.skills || [], linkedin: cv.linkedin || '', location: cv.location || null };
  const inp = (val, ph, set, type = 'text') => { const i = h('input', { type, placeholder: ph, value: val || '' }); i.addEventListener('input', () => set(i.value)); return i; };
  const ta = (val, ph, set, max) => { const t = h('textarea', { placeholder: ph, maxlength: max, rows: 3 }); t.value = val || ''; const cnt = h('span', { class: 'meta' }, `${t.value.length} / ${max}`); t.addEventListener('input', () => { set(t.value); cnt.textContent = `${t.value.length} / ${max}`; }); return h('div', {}, t, h('div', { class: 'row', style: 'justify-content:flex-end' }, cnt)); };
  // header card
  const avBox = h('div', { class: 'pav sm' });
  const drawAv = () => avBox.replaceChildren(state.newAvatar ? h('img', { class: 'av xl avimg', src: state.newAvatar, alt: '' }) : avatarEl({ avatar: state.avatar, name: u.profile?.name || u.name }));
  drawAv();
  const avIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => { const f = avIn.files[0]; if (f) { state.newAvatar = await compress(f, 512, 0.85); drawAv(); } avIn.value = ''; } });
  const nicheIn = h('input', { type: 'text', placeholder: 'Add a niche and press Enter (e.g. Sports physio, ACL rehab)' });
  const nicheBox = h('div', { class: 'chips' });
  const drawNiche = () => nicheBox.replaceChildren(...state.niche.map(n => h('button', { type: 'button', class: 'chip pick on', onclick: () => { state.niche = state.niche.filter(x => x !== n); drawNiche(); } }, n + ' ×')));
  nicheIn.addEventListener('keydown', e => { if (e.key === 'Enter' && nicheIn.value.trim()) { e.preventDefault(); if (state.niche.length < 12) state.niche.push(nicheIn.value.trim()); nicheIn.value = ''; drawNiche(); } });
  drawNiche();
  const hlBox = h('div', {});
  const drawHl = () => hlBox.replaceChildren(...state.highlights.map((x, i) => h('div', { class: 'hlrow' }, inp(x.title, 'Title (e.g. MISSION)', v => (x.title = v)), inp(x.text, 'What it says', v => (x.text = v)), h('button', { class: 'linkbtn', type: 'button', onclick: () => { state.highlights.splice(i, 1); drawHl(); } }, 'Remove'))),
    state.highlights.length < 10 ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { state.highlights.push({ title: '', text: '' }); drawHl(); } }, '+ Highlight') : null);
  drawHl();
  // LinkedIn-style list editors
  const listEditor = (key, fields, label) => {
    const box = h('div', { class: 'lroweds' });
    const draw = () => box.replaceChildren(...c[key].map((x, i) => h('div', { class: 'lroweds-item' }, h('div', { class: 'grid2' }, ...fields.map(([f, ph]) => f === 'desc' ? h('textarea', { placeholder: ph, rows: 2, oninput: e => (x[f] = e.target.value) }, x[f] || '') : inp(x[f], ph, v => (x[f] = v)))),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => { c[key].splice(i, 1); draw(); } }, 'Remove'))),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { c[key].push({}); draw(); } }, `+ ${label}`));
    draw(); box._redraw = draw; return box;
  };
  const exp = listEditor('experience', [['title', 'Title (e.g. Sports Physiotherapist)'], ['org', 'Organisation'], ['place', 'Location'], ['start', 'Start (YYYY-MM)'], ['end', 'End (YYYY-MM or blank = present)'], ['desc', 'What you did']], 'Experience');
  const edu = listEditor('education', [['school', 'School / university'], ['degree', 'Degree'], ['field', 'Field of study'], ['start', 'Start year'], ['end', 'End year'], ['desc', 'Notes']], 'Education');
  const cer = listEditor('certifications', [['name', 'Licence / certification'], ['issuer', 'Issuing body'], ['date', 'Date'], ['url', 'Credential URL (optional)']], 'Licence / certification');
  const ach = listEditor('achievements', [['title', 'Honour / award / achievement'], ['issuer', 'Given by'], ['date', 'Date'], ['desc', 'Description']], 'Achievement');
  const skillIn = h('input', { type: 'text', placeholder: 'Add a skill and press Enter' });
  const skillBox = h('div', { class: 'chips' });
  const drawSkills = () => skillBox.replaceChildren(...c.skills.map(s => h('button', { type: 'button', class: 'chip pick on', onclick: () => { c.skills = c.skills.filter(x => x !== s); drawSkills(); } }, s + ' ×')));
  skillIn.addEventListener('keydown', e => { if (e.key === 'Enter' && skillIn.value.trim()) { e.preventDefault(); c.skills.push(skillIn.value.trim()); skillIn.value = ''; drawSkills(); } });
  drawSkills();
  const liIn = h('input', { type: 'file', accept: '.csv,text/csv', multiple: true, hidden: true, onchange: async () => {
    let n = 0;
    for (const f of liIn.files) {
      const rows = parseCSV(await f.text()); const nm = f.name.toLowerCase();
      if (/position/.test(nm)) rows.forEach(r => { c.experience.push({ title: r['Title'], org: r['Company Name'], place: r['Location'], start: r['Started On'], end: r['Finished On'], desc: r['Description'] }); n++; });
      else if (/education/.test(nm)) rows.forEach(r => { c.education.push({ school: r['School Name'], degree: r['Degree Name'], field: r['Notes'] ? '' : '', start: r['Start Date'], end: r['End Date'], desc: r['Notes'] || r['Activities'] }); n++; });
      else if (/certification/.test(nm)) rows.forEach(r => { c.certifications.push({ name: r['Name'], issuer: r['Authority'], date: r['Started On'], url: r['Url'] }); n++; });
      else if (/honor|award/.test(nm)) rows.forEach(r => { c.achievements.push({ title: r['Title'], issuer: '', date: r['Issued On'], desc: r['Description'] }); n++; });
      else if (/skill/.test(nm)) rows.forEach(r => { if (r['Name']) { c.skills.push(r['Name']); n++; } });
    }
    liIn.value = ''; [exp, edu, cer, ach].forEach(b => b._redraw()); drawSkills(); toast(n ? `Imported ${n} item(s) from LinkedIn. Review, then Save.` : 'No LinkedIn rows found. Use Positions.csv, Education.csv, Certifications.csv, Honors.csv or Skills.csv');
  } });
  // location (one-time)
  const city = inp(c.location?.city, 'City', v => { c.location = { ...(c.location || {}), city: v }; });
  const country = inp(c.location?.country, 'Country', v => { c.location = { ...(c.location || {}), country: v }; });
  const locVis = h('select', { 'aria-label': 'Location visibility' }, ...[['members', 'All members'], ['connections', 'Only people I accepted'], ['private', 'Only me (and admin)']].map(([v, t]) => h('option', { value: v, selected: v === (c.location?.vis || 'connections') }, t)));
  locVis.addEventListener('change', () => { c.location = { ...(c.location || {}), vis: locVis.value }; });
  const locStatus = h('div', { class: 'meta' }, c.location?.lat != null ? `Saved near ${[c.location.city, c.location.country].filter(Boolean).join(', ') || `${c.location.lat}, ${c.location.lng}`} (rounded to ~5 km)` : 'No location saved.');
  const locBtn = h('button', { class: 'btn small', type: 'button', onclick: () => {
    if (!navigator.geolocation) { toast('Location is not available in this browser'); return; }
    locStatus.textContent = 'Asking your browser for your location…';
    navigator.geolocation.getCurrentPosition(pos => { c.location = { ...(c.location || {}), lat: pos.coords.latitude, lng: pos.coords.longitude, vis: locVis.value }; locStatus.textContent = `Got it (will be rounded to ~5 km). Type your city and country, then Save.`; },
      err => { locStatus.textContent = `Location not shared: ${err.message}`; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  } }, '📍 Use my location once');
  const save = h('button', { class: 'btn', type: 'button', onclick: async () => {
    save.disabled = true;
    try {
      await api('/me/profile', { method: 'PUT', body: { name: u.profile?.name || u.name, domain: u.profile?.domain || 'CARD', audience: u.profile?.audience, tone: u.profile?.tone, bio: state.bio, orcid: state.orcid, role_title: state.role_title, institution: state.institution } });
      await api('/me/ext', { method: 'PUT', body: { avatar: state.newAvatar ? { dataUrl: state.newAvatar } : undefined, headline: state.headline, website: state.website, niche: state.niche, highlights: state.highlights.filter(x => x.title) } });
      await api('/me/cv', { method: 'PUT', body: { ...c, location: c.location?.lat != null ? { ...c.location, vis: locVis.value } : c.location === null ? null : undefined } });
      await loadMe(true); toast('Profile saved');
      location.hash = `#u/${encodeURIComponent(user().profile?.member_id || '')}`;
    } catch (e) { toast(e.message); }
    save.disabled = false;
  } }, 'Save profile');
  return [
    h('div', { class: 'card editcard' }, h('h2', { class: 'h3x' }, 'Edit profile'),
      h('div', { class: 'edithead' }, avBox, h('div', {}, h('b', {}, u.profile?.name || u.name), h('div', { class: 'meta' }, state.headline || u.profile?.member_id || '')), h('button', { class: 'btn small', type: 'button', onclick: () => avIn.click() }, 'Change photo'), avIn),
      h('label', { class: 'f' }, 'Headline', inp(state.headline, "e.g. I'M Spacodidact | Expanding Physiotherapist | India", v => (state.headline = v))),
      h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Professional role', inp(state.role_title, 'e.g. Physical Therapist', v => (state.role_title = v))), h('label', { class: 'f' }, 'Institution / organisation', inp(state.institution, 'e.g. PFS Networks', v => (state.institution = v)))),
      h('label', { class: 'f' }, 'Website', inp(state.website, 'https://…', v => (state.website = v), 'url')),
      h('label', { class: 'f' }, 'Bio', ta(state.bio, 'BEYOND PHYSIOTHERAPY…', v => (state.bio = v), 300)),
      h('label', { class: 'f' }, 'ORCID iD (shows your research)', inp(state.orcid, '0000-0000-0000-0000', v => (state.orcid = v.trim()))),
      h('label', { class: 'f' }, 'Your niche', nicheIn), nicheBox,
      h('div', { class: 'meta', style: 'margin:12px 0 6px' }, 'Highlights (circles under your profile, like Mission · Vision · Guidelines)'), hlBox),
    h('div', { class: 'card editcard' }, h('div', { class: 'rhead' }, h('h3', {}, 'Experience, education & achievements'), h('div', { class: 'row' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => liIn.click() }, 'Import from LinkedIn files'), liIn)),
      h('p', { class: 'meta' }, 'LinkedIn → Settings → Data privacy → Get a copy of your data. Upload Positions.csv, Education.csv, Certifications.csv, Honors.csv or Skills.csv from the download.'),
      h('label', { class: 'f' }, 'LinkedIn profile URL', inp(c.linkedin, 'https://www.linkedin.com/in/your-name', v => (c.linkedin = v.trim()), 'url')),
      h('h4', {}, 'Experience · your pathway'), exp, h('h4', {}, 'Education'), edu, h('h4', {}, 'Licences & certifications'), cer, h('h4', {}, 'Honours & achievements'), ach, h('h4', {}, 'Skills'), skillIn, skillBox),
    h('div', { class: 'card editcard' }, h('h3', {}, 'Location (for the People map)'),
      h('p', { class: 'meta' }, 'Captured once when you press the button, never tracked. Stored rounded to about 5 km. You choose who can see it.'),
      h('div', { class: 'row' }, locBtn, h('button', { class: 'btn small ghost', type: 'button', onclick: () => { c.location = null; locStatus.textContent = 'Location will be removed when you save.'; } }, 'Remove location')),
      locStatus, h('div', { class: 'grid2' }, city, country), h('label', { class: 'f' }, 'Who can see it', locVis)),
    h('div', { class: 'row pubactions' }, save, h('a', { class: 'btn ghost', href: `#u/${encodeURIComponent(u.profile?.member_id || '')}` }, 'View profile')),
  ];
}

// Instagram-style card for the Explore → Members feed
export function memberPostCard(x) {
  const a = x.author || {};
  const likeB = h('button', { class: 'act', type: 'button', dataset: { like: 'mp:' + x.id }, onclick: () => toggleLike('mp:' + x.id, likeB) }, icon('heart', 18), h('span', {}, 'Like'));
  return h('article', { class: 'pcard mpcard' },
    h('a', { class: 'pv-author', href: `#u/${encodeURIComponent(a.id || '')}` }, avatarEl(a, 'av lg'), h('span', {}, h('b', {}, a.name || 'Member'), a.verified ? h('span', { class: 'vtick sm' }, icon('check', 10)) : null, h('div', { class: 'meta' }, `${KIND[x.kind]} · ${new Date(x.at).toLocaleDateString()}`)),
      x.ev ? h('span', { class: 'evmark inline', title: 'Verified & liked by Evidara' }, 'EV') : null),
    x.media.length ? h('button', { class: 'mp-media', type: 'button', onclick: () => openPost(x.id) }, mediaEl(x.media[0], { thumb: x.media[0].type !== 'image' })) : null,
    x.kind === 'review' ? h('div', { class: 'pv-review' }, h('span', { class: 'stars' }, '★'.repeat(x.rating || 0) + '☆'.repeat(5 - (x.rating || 0))), ' ', x.paperKey ? h('a', { href: `#paper/${encodeURIComponent(x.paperKey)}` }, x.paperTitle || x.paperKey) : null) : null,
    x.caption ? h('p', { class: 'pblurb' }, linkify(x.caption.slice(0, 400))) : null,
    x.music ? h('div', { class: 'meta' }, '♫ ', x.music.title || 'Music attached') : null,
    h('div', { class: 'actions' }, likeB, h('button', { class: 'act', type: 'button', onclick: () => openPost(x.id) }, icon('chat', 18), h('span', {}, 'Open')), h('button', { class: 'act', type: 'button', onclick: () => copyText(`${location.origin}${location.pathname}#mp/${x.id}`) }, icon('share', 18), h('span', {}, 'Share'))));
}

// People, researcher profile, ID lookup, Studio, Library, Profile views.
import { h, store, toast, copyText, download, spinner } from './util.js';
import { DOMAINS, domainByCode, newId, parseId } from './ids.js';
import { searchResearchers, getResearcher, domainResearchers } from './api.js';
import * as P from './prompts.js';
import * as Lib from './library.js';
import { profile, theme, vars } from './core.js';
import { mountNotebook } from './notebook.js';
import { verificationCard } from './admin.js';
import { libraryFileUrl } from './notebooklm.js';
import { online, user, api, loadMe, signOut, openSignIn } from './backend.js';
import { privacyCard } from './chat.js';
import { draftFromLibrary } from './publish.js';

const view = document.getElementById('view');

// ---------------- PEOPLE ----------------
export async function people() {
  const pr = profile();
  let dom = store.get('peopleDomain', pr.domain), country = store.get('peopleCountry', '');
  const members = h('div', { class: 'grid' }), auto = h('div', { class: 'grid' }), autoHead = h('p', { class: 'sub' });
  const q = h('input', { type: 'search', placeholder: 'Search any researcher by name', 'aria-label': 'Researcher name' });
  const idq = h('input', { type: 'text', placeholder: 'Evidara ID, e.g. CARD-7K3QX7', 'aria-label': 'Evidara ID' });
  const sel = h('select', { 'aria-label': 'Domain' }, ...DOMAINS.map(([c, l]) => h('option', { value: c, selected: c === dom }, `${l} (${c})`)));
  const ctry = h('div', { class: 'seg small' });
  const follows = () => store.get('follows', {});
  const followBtn = (key, name) => {
    const b = h('button', { class: 'follow' + (follows()[key] ? ' on' : ''), type: 'button', onclick: e => { e.preventDefault(); const m = follows(); m[key] ? delete m[key] : (m[key] = name); store.set('follows', m); b.classList.toggle('on', !!m[key]); b.textContent = m[key] ? 'Following' : '+ Follow'; } }, follows()[key] ? 'Following' : '+ Follow');
    return b;
  };
  const card = r => h('a', { class: 'card person-card', href: `#researcher/${r.id}` },
    h('div', { class: 'pc-top' }, h('span', { class: 'av lg' }, (r.name || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()),
      h('div', { class: 'pc-name' }, h('b', {}, r.name), h('div', { class: 'meta' }, [r.inst, r.country].filter(Boolean).join(' · '))), followBtn('oa:' + r.id, r.name)),
    h('div', { class: 'chips' }, h('span', { class: 'chip warn' }, 'Unclaimed'), r.orcid ? h('span', { class: 'chip ok' }, 'ORCID') : null),
    h('div', { class: 'meta' }, `${(r.works || 0).toLocaleString()} works · ${(r.cites || 0).toLocaleString()} citations · h-index ${r.h ?? '?'}`),
    h('div', { class: 'chips' }, ...(r.topics || []).map(t => h('span', { class: 'chip' }, t))));
  const drawCtry = () => ctry.replaceChildren(...[['', 'Worldwide'], ['IN', 'India']].map(([v, l]) => h('button', { type: 'button', class: v === country ? 'on' : '', onclick: () => { country = v; store.set('peopleCountry', v); drawCtry(); loadAuto(); } }, l)));
  drawCtry();
  async function loadAuto() {
    const d = domainByCode(dom);
    auto.replaceChildren(...Array.from({ length: 6 }, () => h('div', { class: 'card skeleton', style: 'height:150px' })));
    try {
      const r = await domainResearchers(d[1], country);
      autoHead.textContent = r.subfield ? `${r.total.toLocaleString()} researchers in OpenAlex's "${r.subfield.name}"${country ? ' in India' : ''}, most cited first. Profiles stay "unclaimed" until the person claims theirs.` : `No matching OpenAlex subfield for ${d[1]}. Use search instead.`;
      auto.replaceChildren(...(r.list.length ? r.list.map(card) : [h('div', { class: 'empty' }, 'No researchers listed.')]));
    } catch (e) { auto.replaceChildren(h('div', { class: 'empty' }, `Could not load researchers: ${e.message}. `, h('button', { class: 'btn small', type: 'button', onclick: loadAuto }, 'Retry'))); }
  }
  sel.addEventListener('change', () => { dom = sel.value; store.set('peopleDomain', dom); loadAuto(); });
  const go = async () => {
    if (!q.value.trim()) return;
    auto.replaceChildren(spinner('Searching OpenAlex'));
    autoHead.textContent = `Search results for "${q.value.trim()}"`;
    try { const rs = await searchResearchers(q.value.trim()); auto.replaceChildren(...(rs.length ? rs.map(card) : [h('div', { class: 'empty' }, 'No researchers found.')])); }
    catch (e) { auto.replaceChildren(h('div', { class: 'empty' }, `Could not search: ${e.message}`)); }
  };
  q.addEventListener('keydown', e => e.key === 'Enter' && go());
  idq.addEventListener('keydown', e => e.key === 'Enter' && (location.hash = `#id/${encodeURIComponent(idq.value)}`));
  view.append(h('section', { class: 'section wide' },
    h('h2', {}, 'People'),
    h('p', { class: 'sub' }, 'Verified Evidara members and researchers in your field, listed for you. Follow anyone; connect through paper discussions.'),
    h('div', { class: 'row', style: 'margin-bottom:18px' }, q, h('button', { class: 'btn ghost', type: 'button', onclick: go }, 'Search'), idq, h('button', { class: 'btn ghost', type: 'button', onclick: () => (location.hash = `#id/${encodeURIComponent(idq.value)}`) }, 'Look up ID')),
    h('h3', { class: 'h3x' }, 'Verified members'), members,
    h('div', { class: 'rhead', style: 'margin-top:30px' }, h('h3', { class: 'h3x' }, 'Researchers in your field'), h('div', { class: 'row' }, sel, ctry)), autoHead, auto));
  loadMembers().then(ms => members.replaceChildren(...(ms.length ? ms.map(m => h(online() ? 'a' : 'div', { class: 'card person-card', href: online() ? `#member/${encodeURIComponent(m.id)}` : null },
    h('div', { class: 'pc-top' }, h('span', { class: 'av lg' }, (m.name || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()),
      h('div', { class: 'pc-name' }, h('b', {}, m.name), h('div', { class: 'meta' }, [m.role, m.institution].filter(Boolean).join(' · '))), followBtn('m:' + m.id, m.name)),
    h('div', { class: 'chips' }, h('span', { class: 'chip ok' }, 'Verified'), h('span', { class: 'idbadge sm' }, m.id), m.orcid ? h('a', { class: 'chip', href: `https://orcid.org/${m.orcid}`, target: '_blank', rel: 'noopener noreferrer' }, 'ORCID') : null),
    h('div', { class: 'meta' }, domainByCode(m.id.slice(0, 4))?.[1] || ''))) : [h('div', { class: 'empty' }, 'No verified members yet. Request verification from your Profile; the admin reviews it.')])));
  loadAuto();
}

let membersCache = null;
export async function loadMembers() {
  if (membersCache) return membersCache;
  try { const r = await fetch('data/members.json', { cache: 'no-cache' }); membersCache = r.ok ? await r.json() : []; } catch { membersCache = []; }
  if (!Array.isArray(membersCache)) membersCache = [];
  if (online()) { try { const srv = (await api('/members')).members || []; const ids = new Set(srv.map(m => m.id)); membersCache = [...srv, ...membersCache.filter(m => !ids.has(m.id))]; } catch { /* static list only */ } }
  return membersCache;
}

export async function researcher([id]) {
  view.append(spinner('Loading profile'));
  const r = await getResearcher(id);
  const maxC = Math.max(1, ...r.perYear.map(y => y.cites));
  const bars = h('div', { style: 'display:flex;gap:4px;align-items:flex-end;height:120px;margin-top:10px' },
    ...r.perYear.map(y => h('div', { title: `${y.year}: ${y.cites} citations, ${y.works} works`, style: `flex:1;background:var(--accent);opacity:.85;border-radius:4px 4px 0 0;height:${Math.max(2, (y.cites / maxC) * 100)}%` })));
  const workList = ws => ws.map(w => h('div', { style: 'padding:10px 0;border-bottom:1px solid var(--line)' },
    w.retracted ? h('span', { class: 'chip bad' }, 'Retracted') : null, ' ',
    (w.pmcid || w.pmid || w.doi) ? h('a', { href: `#paper/${encodeURIComponent(w.pmcid || (w.pmid ? 'MED:' + w.pmid : w.doi))}` }, w.title) : h('span', {}, w.title),
    h('div', { class: 'meta' }, `${w.venue || w.type} · ${w.year} · cited ${w.cites}`)));
  const list = h('div', {}, ...workList(r.top));
  const tabs = h('div', { class: 'tabs' }, h('button', { class: 'tab on', type: 'button', onclick: e => { list.replaceChildren(...workList(r.top)); tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === e.target)); } }, 'Most cited'),
    h('button', { class: 'tab', type: 'button', onclick: e => { list.replaceChildren(...workList(r.recent)); tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === e.target)); } }, 'Recent'));
  view.replaceChildren(h('section', { class: 'section' },
    h('div', { class: 'chips' }, h('span', { class: 'chip warn' }, 'Unclaimed · auto-built from OpenAlex'), r.orcid ? h('a', { class: 'chip ok', href: `https://orcid.org/${r.orcid}`, target: '_blank', rel: 'noopener noreferrer' }, `ORCID ${r.orcid}`) : null),
    h('h2', {}, r.name), h('p', { class: 'sub' }, r.inst.join(' · ')),
    h('div', { class: 'split' },
      h('div', { class: 'card' }, h('h3', {}, 'Papers'), tabs, list,
        h('p', { class: 'note' }, 'Papers are matched to this person by OpenAlex. Same-name mix-ups happen; a claimed profile fixes them. Retractions are shown per paper as OpenAlex reports them.')),
      h('div', {},
        h('div', { class: 'card' }, h('h3', {}, 'Metrics'), h('div', { class: 'meta' }, `${r.works} works · ${r.cites.toLocaleString()} citations · h-index ${r.h ?? '?'} · i10 ${r.i10 ?? '?'}`), bars, h('div', { class: 'meta' }, 'Citations per year')),
        h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', {}, 'Topics'), h('div', { class: 'chips' }, ...r.topics.map(t => h('span', { class: 'chip' }, t)))),
        h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', {}, 'Is this you?'), h('p', { class: 'meta' }, 'Claiming opens with accounts: sign in, verify your credentials, link your ORCID, then hide or add papers. Anyone can ask for an auto-built profile to be removed.'))))));
}

export function idLookup([raw]) {
  const p = parseId(raw);
  const me = profile();
  view.append(h('section', { class: 'section' }, h('h2', {}, 'ID lookup'),
    p.ok ? h('div', { class: 'card' }, h('span', { class: 'idbadge' }, p.id), h('p', {}, `Valid ID format. Domain: ${p.domain} (${p.code}).`),
      me.id === p.id ? h('p', { class: 'note' }, 'This is your ID.') : h('p', { class: 'note' }, 'Member directory search goes live with accounts. For now only the format and check character can be verified.'))
      : h('div', { class: 'empty' }, p.reason)));
}

// ---------------- STUDIO ----------------
export function studio() {
  const pr = profile();
  let tab = store.get('studioTab', 'notebook');
  const body = h('div', {});
  const tabs = h('div', { class: 'tabs' }, ...[['notebook', 'Notebook'], ['image', 'Image prompts'], ['video', 'Video formats'], ['hooks', 'Hooks'], ['audio', 'Audio formats']].map(([k, l]) =>
    h('button', { class: 'tab' + (k === tab ? ' on' : ''), type: 'button', onclick: e => { tab = k; store.set('studioTab', k); tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === e.target)); render(); } }, l)));
  const topic = h('input', { type: 'text', placeholder: 'Topic (defaults to your domain)', 'aria-label': 'Topic', value: store.get('studioTopic', '') });
  topic.addEventListener('input', () => { store.set('studioTopic', topic.value); if (tab !== 'notebook') render(); });
  const v = () => vars(topic.value.trim() ? { topic: topic.value.trim() } : {});

  function promptCard(title, text, kind) {
    const warns = P.lint(text);
    return h('div', { class: 'card' }, h('h3', {}, title), h('pre', { class: 'mono', style: 'white-space:pre-wrap;margin:0' }, text),
      warns.length ? h('ul', { class: 'warnlist' }, ...warns.map(w => h('li', {}, w))) : null,
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn small', type: 'button', onclick: () => copyText(text) }, 'Copy'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => { Lib.add({ kind, title, prompt: text, platform: pr.platform }); toast('Added to Library as Idea'); } }, 'Add to Library')));
  }
  function render() {
    const vv = v();
    topic.hidden = tab === 'notebook';
    if (tab === 'notebook') { body.replaceChildren(); mountNotebook(body); }
    else if (tab === 'image') body.replaceChildren(
      h('p', { class: 'note' }, 'Paste into any image generator. Built-in free image generation (daily limit) switches on when the cloud step is set up. Every prompt forbids real patients, identifiable people and written claims.'),
      h('div', { class: 'grid' }, ...P.IMAGE_STYLES.map(s => promptCard(s.name, P.fill(s.p, vv), 'image'))));
    else if (tab === 'video') body.replaceChildren(
      h('p', { class: 'note' }, `Format playbook, curated by hand (updated ${P.PLAYBOOK_UPDATED}). Not a live trend feed. Open any paper to render a real video abstract.`),
      h('div', { class: 'grid' }, ...P.VIDEO_FORMATS.map(f => promptCard(f.name, P.videoPlan(f, vv), 'video'))));
    else if (tab === 'hooks') body.replaceChildren(
      h('p', { class: 'note' }, 'Opening lines that stay honest: none of them promise an outcome.'),
      h('div', { class: 'grid' }, ...P.HOOKS.map((t, i) => promptCard(`Hook ${String(i + 1).padStart(2, '0')}`, P.fill(t, vv), 'hook'))));
    else body.replaceChildren(
      h('p', { class: 'note' }, 'Audio is made from a paper: open any paper in the Feed and use its Audio overview. Formats:'),
      h('div', { class: 'grid' }, ...P.AUDIO_CONCEPTS.map(c => h('div', { class: 'card' }, h('h3', {}, c.name), h('div', { class: 'meta' }, c.note)))));
  }
  view.append(h('section', { class: 'section' },
    h('h2', {}, 'Studio'),
    h('p', { class: 'sub' }, `Prompts personalised for ${domainByCode(pr.domain)?.[1] || 'your domain'}, ${P.AUDIENCES[pr.audience]}, a ${P.TONES[pr.tone]} tone and the ${theme()} theme palette. Change these in Profile.`),
    h('div', { class: 'row', style: 'margin-bottom:14px' }, topic), tabs, body));
  render();
}

// ---------------- LIBRARY ----------------
export function library() {
  const board = h('div', { class: 'kanban' });
  const render = () => {
    const items = Lib.all();
    board.replaceChildren(...Lib.STATUSES.map(([st, label]) => h('div', { class: 'col' },
      h('h4', {}, `${label} · ${items.filter(x => x.status === st).length}`),
      ...items.filter(x => x.status === st).map(it => itemCard(it, render)))));
  };
  const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async () => {
    try { const n = Lib.importJSON(await file.files[0].text()); toast(`Imported ${n} items`); render(); } catch (e) { toast('Import failed: ' + e.message); }
  } });
  view.append(h('section', { class: 'section' },
    h('h2', {}, 'Library'),
    h('p', { class: 'sub' }, 'Everything you made, imported or saved: idea → made → ready to push → scheduled → pushed to Evidara. Choose the Evidara destination and time, push to Publish, or export your schedule. Stored in this browser until accounts go live, so export a backup now and then.'),
    h('div', { class: 'row', style: 'margin-bottom:16px' },
      h('button', { class: 'btn', type: 'button', onclick: () => download('evidara-schedule.ics', Lib.toICS(), 'text/calendar') }, 'Export calendar (.ics)'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => download('evidara-library.json', JSON.stringify(Lib.all(), null, 2), 'application/json') }, 'Backup (.json)'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => file.click() }, 'Import backup'), file),
    board));
  render();
}

function itemCard(it, rerender) {
  const st = h('select', { 'aria-label': 'Status' }, ...Lib.STATUSES.map(([k, l]) => h('option', { value: k, selected: k === it.status }, l)));
  st.addEventListener('change', () => { Lib.update(it.id, { status: st.value }); rerender(); });
  const plat = h('select', { 'aria-label': 'Evidara destination' }, ...Object.entries(P.PLATFORMS).map(([k, p]) => h('option', { value: k, selected: k === (P.PLATFORMS[it.platform] ? it.platform : 'reel') }, p.name)));
  plat.addEventListener('change', () => Lib.update(it.id, { platform: plat.value }));
  const when = h('input', { type: 'datetime-local', 'aria-label': 'Schedule time', value: it.scheduledAt ? toLocalInput(it.scheduledAt) : '' });
  when.addEventListener('change', () => { Lib.update(it.id, { scheduledAt: when.value ? new Date(when.value).toISOString() : '', status: when.value && it.status !== 'posted' ? 'scheduled' : it.status }); rerender(); });
  return h('div', { class: 'item' },
    h('div', { class: 'meta' }, `${it.kind} · ${new Date(it.createdAt).toLocaleDateString()}`),
    it.source ? h('a', { href: `#paper/${encodeURIComponent(it.source)}` }, it.title) : h('div', {}, it.title),
    it.link ? h('div', { class: 'meta' }, `Stored: ${it.storage} · ${it.link}`) : null,
    h('div', { style: 'display:grid;gap:6px;margin-top:8px' }, st, plat, when),
    h('div', { class: 'row', style: 'margin-top:6px' },
      it.fileKey ? h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { const u = await libraryFileUrl(it.fileKey); if (u) window.open(u, '_blank', 'noopener'); else toast('File not found in this browser'); } }, 'Open') : null,
      it.status !== 'posted' ? h('button', { class: 'btn small', type: 'button', onclick: async () => { const id = await draftFromLibrary(it); Lib.update(it.id, { status: 'ready' }); location.hash = `#publish/${id}`; } }, 'Push to Evidara') : null,
      (it.prompt || it.script) ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => copyText(it.prompt || it.script) }, 'Copy') : null,
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { Lib.remove(it.id); rerender(); } }, 'Delete')));
}
function toLocalInput(iso) { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }

// ---------------- PROFILE ----------------
export function profilePage() {
  const u = user();
  if (online() && u?.profile) { const sp = u.profile; store.set('profile', { ...profile(), name: sp.name || u.name || '', domain: sp.domain || profile().domain, id: sp.member_id || '', audience: sp.audience || profile().audience, tone: sp.tone || profile().tone }); }
  else if (online() && u && !profile().name) store.set('profile', { ...profile(), name: u.name || '' });
  const pr = profile();
  const name = h('input', { type: 'text', value: pr.name, placeholder: 'Your name', 'aria-label': 'Name' });
  const dom = h('select', { 'aria-label': 'Domain' }, ...DOMAINS.map(([c, l]) => h('option', { value: c, selected: c === pr.domain }, `${l} (${c})`)));
  const aud = h('select', { 'aria-label': 'Audience' }, ...Object.entries(P.AUDIENCES).map(([k, l]) => h('option', { value: k, selected: k === pr.audience }, l)));
  const tone = h('select', { 'aria-label': 'Tone' }, ...Object.entries(P.TONES).map(([k, l]) => h('option', { value: k, selected: k === pr.tone }, l)));
  const idBox = h('div', {});
  const showId = () => {
    const cur = profile();
    idBox.replaceChildren(cur.id ? h('div', {}, h('span', { class: 'idbadge', style: 'font-size:22px' }, cur.id),
      h('p', { class: 'meta' }, `Domain ${cur.id.slice(0, 4)}: ${domainByCode(cur.id.slice(0, 4))?.[1]}. The last character is a check character that catches typos.`),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => copyText(cur.id) }, 'Copy ID')))
      : h('p', { class: 'meta' }, 'No ID yet. Choose your domain and save.'));
  };
  const save = async () => {
    if (online() && user()) {
      try {
        const r = await api('/me/profile', { method: 'PUT', body: { name: name.value.trim(), domain: dom.value, audience: aud.value, tone: tone.value, role_title: user().profile?.role_title || '', institution: user().profile?.institution || '', orcid: user().profile?.orcid || '' } });
        store.set('profile', { ...profile(), name: name.value.trim(), domain: dom.value, audience: aud.value, tone: tone.value, id: r.profile.member_id });
        await loadMe(true); showId(); toast('Saved to your Evidara account');
      } catch (e) { toast(e.message); }
      return;
    }
    const cur = profile();
    const changedDomain = cur.id && cur.id.slice(0, 4) !== dom.value;
    const next = { ...cur, name: name.value.trim(), domain: dom.value, audience: aud.value, tone: tone.value };
    if (!cur.id || changedDomain) next.id = newId(dom.value);
    store.set('profile', next); showId(); toast(changedDomain ? 'Saved. New ID issued for your new domain.' : 'Saved');
  };
  view.append(h('section', { class: 'section' },
    h('h2', {}, 'Profile'),
    online() && user() ? h('div', { class: 'card acctcard' }, h('div', { class: 'rhead' }, h('div', {}, h('b', {}, user().name || user().email), h('div', { class: 'meta' }, user().email)),
        h('div', { class: 'row' }, user().admin ? h('span', { class: 'chip ok' }, 'Admin') : null, user().verified ? h('span', { class: 'chip ok' }, 'Verified member') : h('span', { class: 'chip warn' }, 'Not verified yet'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { await signOut(); location.hash = '#feed'; } }, 'Sign out')))) :
      online() ? h('div', { class: 'card acctcard' }, h('div', { class: 'rhead' }, h('b', {}, 'Sign in to keep your ID, library and verification on every device'), h('button', { class: 'btn small', type: 'button', onclick: openSignIn }, 'Sign in'))) : null,
    h('p', { class: 'sub' }, online() && user() ? 'Your domain sets your feed, your prompts and the first part of your Evidara ID, which the server keeps unique.' : 'Your domain sets your feed, your prompts and the first part of your Evidara ID. Saved in this browser until you sign in.'),
    h('div', { class: 'split' },
      h('div', { class: 'card' },
        h('div', { style: 'display:grid;gap:12px' },
          h('label', { class: 'f' }, 'Name', name), h('label', { class: 'f' }, 'Healthcare domain', dom),
          h('label', { class: 'f' }, 'Main audience', aud), h('label', { class: 'f' }, 'Tone', tone)),
        h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', type: 'button', onclick: save }, 'Save'))),
      h('div', { class: 'card' }, h('h3', {}, 'Your Evidara ID'), idBox,
        h('p', { class: 'note' }, 'Format: DOMAIN-XXXXXC. For example CARD-7K3QX7 is a cardiology member. The domain code lets anyone browse people by specialty.')))));
  const pc = privacyCard(); if (pc) view.querySelector('.section')?.append(h('div', { style: 'margin-top:20px' }, pc));
  view.querySelector('.section')?.append(h('div', { class: 'row', style: 'margin-top:20px' }, h('a', { class: 'btn', href: '#publish' }, 'Publish a post'), h('a', { class: 'btn ghost', href: '#people' }, 'People directory'), h('a', { class: 'btn ghost', href: '#library' }, 'My Library'), h('a', { class: 'btn ghost', href: '#admin' }, 'Admin portal')), h('div', { style: 'margin-top:20px' }, verificationCard()));
  showId();
}

// Private chat between verified members (with permission), member profile pages, and privacy settings.
import { h, toast } from './util.js';
import { icon } from './icons.js';
import { domainByCode } from './ids.js';
import { online, user, api, openSignIn, onAuth } from './backend.js';

const view = document.getElementById('view');
const initials = n => String(n || '?').split(/[\s@]+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
const PATIENT = [/\b\d{4}\s?\d{4}\s?\d{4}\b/, /\b(MRN|UHID|IP ?No|OPD ?No)\b/i, /\b(DOB|date of birth)\b/i, /\b\d{2}[\/-]\d{2}[\/-](19|20)\d{2}\b/, /\b[6-9]\d{9}\b/];
const notReady = () => view.replaceChildren(h('section', { class: 'section narrow' }, h('h2', {}, 'Messages'),
  h('div', { class: 'card' }, h('p', {}, online() ? 'Sign in to use private messages.' : 'Private messages need Evidara accounts, which are not connected on this site.'), online() ? h('button', { class: 'btn', type: 'button', onclick: openSignIn }, 'Sign in') : null)));

// ---------- unread badge ----------
let badgeTimer = 0;
export function startUnreadBadge() {
  const paint = n => document.querySelectorAll('[data-nav="messages"]').forEach(a => { let b = a.querySelector('.nbadge'); if (!b) { b = h('span', { class: 'nbadge' }); a.append(b); } b.textContent = n > 99 ? '99+' : String(n || ''); b.hidden = !n; });
  const tick = async () => {
    if (!online() || !user()) { paint(0); return; }
    try { const [c, r] = await Promise.all([api('/chats'), api('/connections')]); paint((c.unread || 0) + (r.incoming?.length || 0)); } catch { /* ignore */ }
  };
  clearInterval(badgeTimer); badgeTimer = setInterval(tick, 45000); tick();
  onAuth(tick);
  return tick;
}

// ---------- Messages page ----------
export async function messages([withId]) {
  if (!online() || !user()) return notReady();
  const listBox = h('div', { class: 'chatlist' });
  const threadBox = h('section', { class: 'chatthread glass' });
  const tabs = h('div', { class: 'seg small' });
  let tab = 'chats', conn = { incoming: [], outgoing: [], connected: [], blocked: [] }, chats = [];
  view.replaceChildren(h('div', { class: 'chatwrap' },
    h('aside', { class: 'chatside glass' }, h('div', { class: 'rhead' }, h('h2', {}, 'Messages'), h('a', { class: 'btn small ghost', href: '#messages/admin' }, 'Message admin')), tabs, listBox),
    threadBox));
  const loadLists = async () => {
    try { [chats, conn] = await Promise.all([api('/chats').then(r => r.chats), api('/connections')]); } catch (e) { toast(e.message); }
    drawTabs(); drawList();
  };
  const drawTabs = () => tabs.replaceChildren(...[['chats', `Chats${chats.some(c => c.unread) ? ' •' : ''}`], ['requests', `Requests (${conn.incoming.length})`], ['people', `Connections (${conn.connected.length})`]].map(([k, l]) =>
    h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; drawTabs(); drawList(); } }, l)));
  const row = (id, name, sub, extra) => h('a', { class: 'chatrow' + (id === withId ? ' on' : ''), href: `#messages/${encodeURIComponent(id)}` },
    h('span', { class: 'av lg' }, initials(name)), h('span', { class: 'cr-txt' }, h('b', {}, name), h('span', { class: 'meta' }, sub)), extra || null);
  function drawList() {
    if (tab === 'chats') listBox.replaceChildren(...(chats.length ? chats.map(c => row(c.with, c.name + (c.admin ? ' · Admin' : ''), c.last, c.unread ? h('span', { class: 'nbadge' }, String(c.unread)) : null))
      : [h('div', { class: 'empty' }, 'No conversations yet. Open a verified member\'s profile and send a chat request.')]));
    else if (tab === 'requests') {
      const act = async (id, a) => { try { await api(`/connections/${id}/${a}`, { method: 'POST' }); toast(a === 'accept' ? 'Accepted. You can chat now.' : a === 'decline' ? 'Declined' : a === 'block' ? 'Blocked' : 'Withdrawn'); loadLists(); startUnreadBadge(); } catch (e) { toast(e.message); } };
      listBox.replaceChildren(h('div', { class: 'meta', style: 'margin:6px 2px' }, 'Asking to chat with you'),
        ...(conn.incoming.length ? conn.incoming.map(r => h('div', { class: 'reqcard' }, h('div', { class: 'row' }, h('span', { class: 'av lg' }, initials(r.name)), h('a', { href: `#member/${r.memberId}` }, h('b', {}, r.name), h('div', { class: 'meta' }, r.memberId))),
          r.note ? h('p', { class: 'reqnote' }, r.note) : null,
          h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => act(r.id, 'accept') }, 'I accept to chat'), h('button', { class: 'btn small ghost', type: 'button', onclick: () => act(r.id, 'decline') }, 'Decline'), h('button', { class: 'linkbtn', type: 'button', onclick: () => act(r.id, 'block') }, 'Block'))))
          : [h('div', { class: 'meta' }, 'No requests.')]),
        h('div', { class: 'meta', style: 'margin:14px 2px 6px' }, 'You asked'),
        ...(conn.outgoing.length ? conn.outgoing.map(r => h('div', { class: 'chatrow' }, h('span', { class: 'av lg' }, initials(r.name)), h('span', { class: 'cr-txt' }, h('b', {}, r.name), h('span', { class: 'meta' }, r.status === 'declined' ? 'Declined' : 'Waiting for reply')),
          r.status === 'pending' ? h('button', { class: 'linkbtn', type: 'button', onclick: () => act(r.id, 'withdraw') }, 'Withdraw') : null)) : [h('div', { class: 'meta' }, 'None.')]));
    } else listBox.replaceChildren(...(conn.connected.length ? conn.connected.map(c => row(c.memberId, c.name, c.memberId)) : [h('div', { class: 'empty' }, 'No connections yet.')]));
  }
  let pollT = 0, lastAt = '';
  async function openThread(id) {
    clearInterval(pollT); lastAt = '';
    if (!id) { threadBox.replaceChildren(h('div', { class: 'empty chatempty' }, icon('chat', 28), h('p', {}, 'Choose a conversation, or accept a request to start chatting.'))); return; }
    let person;
    try { person = await api('/people/' + encodeURIComponent(id)); } catch (e) { threadBox.replaceChildren(h('div', { class: 'empty' }, e.message)); return; }
    const m = person.member, rel = person.relation;
    const msgs = h('div', { class: 'msgs', 'aria-live': 'polite' });
    const ta = h('textarea', { placeholder: rel.canMessage ? 'Write a message… (never share patient details)' : 'Chat opens after they accept your request', disabled: !rel.canMessage, maxlength: 4000, rows: 2, 'aria-label': 'Message' });
    const add = list => {
      if (!list.length) return;
      if (!lastAt) msgs.replaceChildren();
      for (const x of list) {
        msgs.append(h('div', { class: 'msg' + (x.mine ? ' mine' : '') }, h('div', { class: 'mtext' }, x.text),
          h('div', { class: 'mmeta' }, new Date(x.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }), x.mine ? (x.read ? ' · Seen' : ' · Sent') : '',
            x.mine ? h('button', { class: 'linkbtn', type: 'button', onclick: async e => { try { await api('/messages/' + x.id, { method: 'DELETE' }); e.target.closest('.msg').remove(); } catch (er) { toast(er.message); } } }, ' Delete') : null)));
        lastAt = x.at;
      }
      msgs.scrollTop = msgs.scrollHeight;
    };
    const pull = async () => { try { const r = await api(`/chats/${encodeURIComponent(id)}?after=${encodeURIComponent(lastAt)}`); add(r.messages); } catch { /* not open yet */ } };
    const send = async () => {
      const text = ta.value.trim(); if (!text) return;
      if (PATIENT.some(re => re.test(text))) { toast('Looks like patient details (ID, phone, date of birth). Remove them before sending.'); return; }
      try { await api('/chats/' + encodeURIComponent(id), { method: 'POST', body: { text } }); ta.value = ''; await pull(); loadLists(); } catch (e) { toast(e.message); }
    };
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    threadBox.replaceChildren(
      h('header', { class: 'chathead' }, h('a', { class: 'row', href: m.admin ? '#messages/admin' : `#member/${m.id}` }, h('span', { class: 'av lg' }, initials(m.name)),
        h('span', {}, h('b', {}, m.name), h('div', { class: 'meta' }, [m.admin ? 'Evidara admin' : m.role, m.verified ? 'Verified' : '', m.id !== 'admin' ? m.id : ''].filter(Boolean).join(' · ')))),
        h('div', { class: 'row' },
          h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { const reason = prompt('Report this conversation to the Evidara admin. What happened? (The admin will be able to read this conversation.)'); if (reason === null) return; try { await api(`/chats/${encodeURIComponent(id)}/report`, { method: 'POST', body: { reason } }); toast('Reported to the admin'); } catch (e) { toast(e.message); } } }, 'Report'),
          rel.connId && !m.admin ? h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { if (!confirm(`Block ${m.name}? They will not be able to message you.`)) return; try { await api(`/connections/${rel.connId}/block`, { method: 'POST' }); toast('Blocked'); openThread(id); } catch (e) { toast(e.message); } } }, 'Block') : null)),
      ...(rel.canMessage ? [] : [h('div', { class: 'note' }, relText(rel, m))]),
      msgs,
      h('div', { class: 'composer chatcomposer' }, ta, h('button', { class: 'btn', type: 'button', disabled: !rel.canMessage, onclick: send }, 'Send')));
    msgs.replaceChildren(h('div', { class: 'meta', style: 'text-align:center;padding:20px' }, rel.canMessage ? 'Say hello. Messages are private between you two.' : ''));
    await pull(); startUnreadBadge();
    pollT = setInterval(() => { if (!document.body.contains(msgs)) { clearInterval(pollT); return; } pull(); }, 5000);
  }
  await loadLists();
  openThread(withId);
}
function relText(rel, m) {
  return { requested: `Waiting for ${m.name} to accept your chat request.`, incoming: `${m.name} asked to chat. Accept it under Requests.`, closed: `${m.name} is not accepting chat requests.`,
    blocked: 'Chat is blocked.', declined: `${m.name} declined your request.`, none: `Send ${m.name} a chat request from their profile.`, 'signed-out': 'Sign in to chat.' }[rel.state] || '';
}

// ---------- member profile page ----------
export async function memberPage([id]) {
  if (!online()) { view.replaceChildren(h('div', { class: 'empty' }, 'Member profiles need Evidara accounts, which are not connected on this site.')); return; }
  view.replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'spinner' }), ' Loading profile…'));
  let r;
  try { r = await api('/people/' + encodeURIComponent(id)); } catch (e) { view.replaceChildren(h('div', { class: 'empty' }, e.message)); return; }
  const m = r.member, rel = r.relation;
  const note = h('textarea', { placeholder: `A short note to ${m.name}: who you are and why you'd like to chat (optional)`, rows: 3, maxlength: 500 });
  const action = () => {
    if (rel.state === 'signed-out') return h('button', { class: 'btn', type: 'button', onclick: openSignIn }, 'Sign in to chat');
    if (rel.state === 'self') return h('a', { class: 'btn ghost', href: '#profile' }, 'Edit your profile & privacy');
    if (rel.canMessage) return h('a', { class: 'btn', href: `#messages/${encodeURIComponent(m.id)}` }, icon('chat', 16), ' Message');
    if (rel.state === 'incoming') return h('a', { class: 'btn', href: '#messages' }, 'They asked to chat: answer in Messages');
    if (rel.state === 'requested') return h('span', { class: 'chip warn' }, 'Request sent · waiting for them to accept');
    if (rel.state === 'closed') return h('span', { class: 'chip' }, 'Not accepting chat requests');
    if (rel.state === 'blocked') return h('span', { class: 'chip bad' }, 'Chat unavailable');
    if (!user()?.verified && !user()?.admin) return h('span', { class: 'chip warn' }, 'Get verified to send chat requests');
    return h('div', { class: 'reqbox' }, note, h('button', { class: 'btn', type: 'button', onclick: async () => {
      if (PATIENT.some(re => re.test(note.value))) { toast('Remove patient details from your note'); return; }
      try { const x = await api('/connections/' + encodeURIComponent(m.id), { method: 'POST', body: { note: note.value.trim() } }); toast(x.state === 'connected' || x.state === 'open' ? 'You can chat now' : 'Chat request sent'); memberPage([id]); } catch (e) { toast(e.message); }
    } }, 'Request to chat'));
  };
  const contactRows = Object.entries(r.contact || {});
  const label = { email: 'Email', phone: 'Phone', website: 'Website', linkedin: 'LinkedIn', other: 'Other' };
  const linkFor = (k, v) => k === 'email' ? `mailto:${v}` : k === 'phone' ? `tel:${v.replace(/[^\d+]/g, '')}` : /^https?:\/\//.test(v) ? v : null;
  view.replaceChildren(h('section', { class: 'section narrow memberpage' },
    h('div', { class: 'card memberhero glass' }, h('span', { class: 'av xl' }, initials(m.name)),
      h('div', {}, h('h2', {}, m.name), h('div', { class: 'meta' }, [m.role, m.institution].filter(Boolean).join(' · ')),
        h('div', { class: 'chips', style: 'margin-top:8px' }, m.admin ? h('span', { class: 'chip ok' }, 'Evidara admin') : null, m.verified ? h('span', { class: 'chip ok' }, 'Verified member') : null,
          m.id !== 'admin' ? h('span', { class: 'idbadge sm' }, m.id) : null, m.domain ? h('span', { class: 'chip' }, domainByCode(m.domain)?.[1] || m.domain) : null,
          m.orcid ? h('a', { class: 'chip', href: `https://orcid.org/${m.orcid}`, target: '_blank', rel: 'noopener noreferrer' }, 'ORCID ↗') : null))),
    h('div', { class: 'card' }, h('h3', {}, 'Chat'), action(),
      h('p', { class: 'meta', style: 'margin-top:10px' }, m.dmPolicy === 'open' ? 'Accepts messages from any verified member.' : m.dmPolicy === 'closed' ? 'Not accepting chat requests.' : 'Chat opens after they accept your request.')),
    h('div', { class: 'card' }, h('h3', {}, 'Contact details'),
      contactRows.length ? h('div', { class: 'contacts' }, ...contactRows.map(([k, v]) => { const href = linkFor(k, v); return h('div', { class: 'vrow' }, h('span', { class: 'chip' }, label[k] || k), href ? h('a', { href, target: k === 'website' || k === 'linkedin' ? '_blank' : null, rel: 'noopener noreferrer' }, v) : h('span', {}, v)); }))
        : h('p', { class: 'meta' }, rel.state === 'signed-out' ? 'Sign in to see contact details this member shares.' : 'No contact details shared with you.'))));
}

// ---------- privacy settings card (Profile) ----------
export function privacyCard() {
  if (!online() || !user()) return null;
  const box = h('div', { class: 'card privacy' }, h('h3', {}, 'Messages & contact privacy'), h('div', { class: 'meta' }, 'Loading…'));
  (async () => {
    let pv = { dm: 'request', contact: {} };
    try { pv = await api('/me/privacy'); } catch { /* defaults */ }
    const dm = h('select', { 'aria-label': 'Who can message me' }, ...[['request', 'Verified members, after I accept their request (recommended)'], ['open', 'Any verified member, without a request'], ['closed', 'Nobody (admin can still reach me)']].map(([v, l]) => h('option', { value: v, selected: v === pv.dm }, l)));
    const fields = [['email', 'Email', 'name@hospital.org'], ['phone', 'Phone', '+91 …'], ['website', 'Website', 'https://…'], ['linkedin', 'LinkedIn', 'https://linkedin.com/in/…'], ['other', 'Other', 'e.g. clinic address or handle']];
    const rows = fields.map(([k, l, ph]) => {
      const cur = pv.contact[k] || {};
      const inp = h('input', { type: 'text', placeholder: ph, value: cur.value || '', 'aria-label': l });
      const vis = h('select', { 'aria-label': `${l} visibility` }, ...[['members', 'All members'], ['connections', 'Only people I accepted'], ['private', 'Only me (and admin)']].map(([v, t]) => h('option', { value: v, selected: v === (cur.vis || 'connections') }, t)));
      return { k, l, inp, vis };
    });
    box.replaceChildren(h('h3', {}, 'Messages & contact privacy'),
      h('label', { class: 'f' }, 'Who can message me', dm),
      h('div', { class: 'meta', style: 'margin:12px 0 6px' }, 'Contact details: choose who sees each one'),
      ...rows.map(r => h('div', { class: 'ctrow' }, h('span', { class: 'ctl' }, r.l), r.inp, r.vis)),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
        const contact = {}; rows.forEach(r => { if (r.inp.value.trim()) contact[r.k] = { value: r.inp.value.trim(), vis: r.vis.value }; });
        try { await api('/me/privacy', { method: 'PUT', body: { dm: dm.value, contact } }); toast('Privacy saved'); } catch (e) { toast(e.message); }
      } }, 'Save privacy'), h('span', { class: 'meta' }, 'The Evidara admin can always message you and see your contact details.')));
  })();
  return box;
}

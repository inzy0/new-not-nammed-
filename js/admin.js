// Admin portal: verify members by their Evidara ID and documents, review submissions, publish posts.
// How authority works on a free static site: members send request/submission packages (files) to the admin;
// the admin reviews them here and exports members.json / posts.json, which are published to the site's data/
// folder. Only someone who can update the site's repository can publish, so the passphrase below just keeps
// this screen private on the admin's own device. Verification documents never leave this browser.
import { h, store, toast, download, uid } from './util.js';
import { icon } from './icons.js';
import { DOMAINS, domainByCode, parseId, validOrcid } from './ids.js';
import { idb } from './idb.js';
import { verifyPost, renderPost } from './publish.js';
import { loadPosts, resetPosts } from './feed.js';
import { loadMembers } from './views.js';
import { profile } from './core.js';
import { online, user, api, requireSignedIn } from './backend.js';

const view = document.getElementById('view');
async function sha256(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join(''); }

// ---------- member side: verification request (used on the Profile page) ----------
export function verificationCard() {
  const pr = profile();
  const f = { name: pr.name || '', role: '', institution: '', orcid: '', council: '', regNo: '', consentPublic: true };
  const docs = [];
  const inp = (k, ph) => { const i = h('input', { type: 'text', placeholder: ph, value: f[k] }); i.addEventListener('input', () => (f[k] = i.value.trim())); return i; };
  const docList = h('div', { class: 'chips' });
  const fileIn = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, hidden: true, onchange: async () => {
    for (const file of fileIn.files) {
      if (file.size > 5 * 1048576) { toast(`${file.name} is over 5 MB`); continue; }
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      docs.push({ name: file.name, type: file.type, dataUrl });
    }
    fileIn.value = ''; docList.replaceChildren(...docs.map((d, i) => h('button', { type: 'button', class: 'chip pick on', onclick: () => { docs.splice(i, 1); docList.children[i]?.remove(); } }, d.name + ' ×')));
  } });
  const statusBox = h('div', { class: 'vstatus' });
  const drawStatus = async () => { if (!online() || !user()) return; try { const rs = (await api('/me/verification')).requests || []; statusBox.replaceChildren(...rs.slice(0, 3).map(r => h('div', { class: 'vrow' }, h('span', { class: `chip ${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn'}` }, r.status), h('span', { class: 'meta' }, `${new Date(r.created_at).toLocaleDateString()}${r.note ? ' · ' + r.note : ''}`)))); } catch { /* ignore */ } };
  drawStatus();
  const consent = h('input', { type: 'checkbox', checked: true });
  consent.addEventListener('change', () => (f.consentPublic = consent.checked));
  return h('div', { class: 'card' }, h('h3', {}, 'Get verified'),
    h('p', { class: 'meta' }, 'Verified members get a badge, appear in the People directory and can publish to Community. The admin checks your registration and documents.'),
    h('div', { class: 'grid2' },
      h('label', { class: 'f' }, 'Full name', inp('name', 'As on your registration')), h('label', { class: 'f' }, 'Professional role', inp('role', 'e.g. Consultant cardiologist, Staff nurse, PhD scholar')),
      h('label', { class: 'f' }, 'Institution', inp('institution', 'Hospital / university, city')), h('label', { class: 'f' }, 'ORCID iD (optional)', inp('orcid', '0000-0000-0000-0000')),
      h('label', { class: 'f' }, 'Registration council', inp('council', 'e.g. NMC, State Medical Council, INC, PCI')), h('label', { class: 'f' }, 'Registration number', inp('regNo', 'Only the admin sees this'))),
    h('div', { class: 'row', style: 'margin:10px 0' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => fileIn.click() }, '+ Proof documents (image/PDF, ≤5 MB)'), fileIn, docList),
    h('label', { class: 'row', style: 'gap:8px' }, consent, 'List my name, ID, role, institution and ORCID publicly once verified'),
    h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
      if (online()) {
        if (!requireSignedIn('request verification')) return;
        if (!f.name || !f.role || !f.council || !f.regNo) { toast('Name, role, council and registration number are required'); return; }
        if (f.orcid && !validOrcid(f.orcid)) { toast('That ORCID iD fails its check digit'); return; }
        if (!docs.length) { toast('Add at least one proof document'); return; }
        try { await api('/me/verification', { method: 'POST', body: { ...f, docs } }); toast('Request sent. The admin will review it.'); drawStatus(); } catch (e) { toast(e.message); }
        return;
      }
      const me = profile();
      if (!me.id) { toast('Save your profile first to get an Evidara ID'); return; }
      if (!f.name || !f.role || !f.council || !f.regNo) { toast('Name, role, council and registration number are required'); return; }
      if (f.orcid && !validOrcid(f.orcid)) { toast('That ORCID iD fails its check digit'); return; }
      if (!docs.length) { toast('Add at least one proof document'); return; }
      download(`evidara-verification-${me.id}.json`, JSON.stringify({ kind: 'evidara-member-request', version: 1, createdAt: new Date().toISOString(), id: me.id, domain: me.id.slice(0, 4), ...f, docs }), 'application/json');
      toast('Request downloaded. Send it privately to the Evidara admin.');
    } }, 'Create verification request')),
    statusBox,
    h('p', { class: 'note' }, online() ? 'Documents are stored privately and only the admin can open them. They are never published.' : 'Your documents go only into the file you send to the admin. They are never published.'));
}

// ---------- admin portal ----------
export async function admin() {
  if (online()) return adminOnline();
  const hash = store.get('adminHash', null);
  let unlocked = false; try { unlocked = sessionStorage.getItem('evd:adminOk') === hash && !!hash; } catch {}
  if (!unlocked) {
    const pw = h('input', { type: 'password', placeholder: hash ? 'Admin passphrase' : 'Choose an admin passphrase (12+ characters)', 'aria-label': 'Passphrase', autocomplete: 'current-password' });
    const go = async () => {
      if (!hash) { if (pw.value.length < 12) { toast('Use at least 12 characters'); return; } const hh = await sha256(pw.value); store.set('adminHash', hh); try { sessionStorage.setItem('evd:adminOk', hh); } catch {} admin(); return; }
      const hh = await sha256(pw.value);
      if (hh === hash) { try { sessionStorage.setItem('evd:adminOk', hh); } catch {} admin(); } else toast('Wrong passphrase');
    };
    pw.addEventListener('keydown', e => e.key === 'Enter' && go());
    view.replaceChildren(h('section', { class: 'section narrow' }, h('h2', {}, 'Admin portal'),
      h('p', { class: 'sub' }, hash ? 'Enter your passphrase.' : 'First use on this device: set a passphrase. It is stored only as a hash on this device.'),
      h('div', { class: 'card' }, h('div', { class: 'row' }, pw, h('button', { class: 'btn', type: 'button', onclick: go }, hash ? 'Unlock' : 'Set passphrase')),
        h('p', { class: 'note' }, 'This screen is a local review tool. Publishing to everyone happens when the exported files are added to the site\'s data folder, which needs repository access.'))));
    return;
  }
  let tab = store.get('adminTab', 'members');
  const queue = (await idb.get('adm:queue')) || [];
  const live = { members: (await idb.get('adm:members')) || await loadMembers(), posts: (await idb.get('adm:posts')) || await loadPosts() };
  const saveAll = async () => { await idb.set('adm:queue', queue); await idb.set('adm:members', live.members); await idb.set('adm:posts', live.posts); resetPosts(); };
  const body = h('div', {});
  const tabs = h('div', { class: 'seg wide' });
  const drawTabs = () => tabs.replaceChildren(...[['members', `Member requests (${queue.filter(q => q.kind === 'evidara-member-request').length})`], ['subs', `Submissions (${queue.filter(q => q.kind === 'evidara-submission').length})`],
    ['live', `Published (${live.members.length} members · ${live.posts.length} posts)`], ['export', 'Export to site']].map(([k, l]) => h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; store.set('adminTab', k); drawTabs(); draw(); } }, l)));
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', multiple: true, hidden: true, onchange: async () => {
    let n = 0;
    for (const f of fileIn.files) {
      try {
        const pkg = JSON.parse(await f.text());
        if (!['evidara-member-request', 'evidara-submission'].includes(pkg.kind)) throw new Error('not an Evidara package');
        pkg._qid = uid(); pkg._file = f.name; pkg._at = new Date().toISOString(); queue.push(pkg); n++;
      } catch (e) { toast(`${f.name}: ${e.message}`); }
    }
    fileIn.value = ''; await saveAll(); toast(`Imported ${n} package${n === 1 ? '' : 's'}`); drawTabs(); draw();
  } });

  function memberReview(q) {
    const idc = parseId(q.id);
    const checks = [
      ['Evidara ID', idc.ok ? `${q.id} · ${idc.domain}` : `Invalid: ${idc.reason}`, idc.ok ? 'ok' : 'bad'],
      ['ORCID', q.orcid ? (validOrcid(q.orcid) ? `${q.orcid} (check digit valid)` : `${q.orcid} fails check digit`) : 'Not given', q.orcid ? (validOrcid(q.orcid) ? 'ok' : 'bad') : 'warn'],
      ['Registration', `${q.council || '?'} · ${q.regNo || '?'}`, q.council && q.regNo ? 'warn' : 'bad'],
      ['Documents', `${(q.docs || []).length} attached`, (q.docs || []).length ? 'warn' : 'bad'],
      ['Public listing', q.consentPublic ? 'Consented' : 'Not consented (verify but do not list)', 'ok'],
    ];
    const note = h('input', { type: 'text', placeholder: 'Note for rejection (optional)' });
    return h('div', { class: 'card' },
      h('div', { class: 'rhead' }, h('h3', {}, q.name || 'Unnamed'), h('span', { class: 'idbadge' }, q.id)),
      h('div', { class: 'meta' }, `${q.role || ''} · ${q.institution || ''} · received ${new Date(q._at).toLocaleString()}`),
      ...checks.map(([l, d, s]) => h('div', { class: 'vrow' }, h('span', { class: `chip ${s}` }, l), h('div', { class: 'meta' }, d))),
      h('p', { class: 'note' }, 'Check the registration number yourself on the council\'s official register before approving. "warn" items need your manual check.'),
      h('div', { class: 'docgrid' }, ...(q.docs || []).map(d => /^data:image\//.test(d.dataUrl) ? h('a', { href: d.dataUrl, target: '_blank', rel: 'noopener noreferrer' }, h('img', { src: d.dataUrl, alt: d.name }))
        : h('a', { class: 'btn small ghost', href: d.dataUrl, download: d.name }, `Open ${d.name}`))),
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn', type: 'button', disabled: !idc.ok, onclick: async () => {
          if (q.consentPublic) {
            live.members = live.members.filter(m => m.id !== q.id);
            live.members.push({ id: q.id, name: q.name, role: q.role, institution: q.institution, orcid: q.orcid && validOrcid(q.orcid) ? q.orcid : '', verifiedAt: new Date().toISOString() });
          }
          queue.splice(queue.indexOf(q), 1); await saveAll(); toast(q.consentPublic ? 'Verified and listed' : 'Verified (not listed)'); drawTabs(); draw();
        } }, 'Approve'),
        note, h('button', { class: 'btn ghost', type: 'button', onclick: async () => { queue.splice(queue.indexOf(q), 1); await saveAll(); toast(`Rejected${note.value ? ': ' + note.value : ''}. Tell the member directly.`); drawTabs(); draw(); } }, 'Reject')));
  }

  function subReview(q) {
    const p = q.post; const v = verifyPost(p);
    const prev = h('div', { class: 'admin-preview', hidden: true });
    return h('div', { class: 'card' },
      h('div', { class: 'rhead' }, h('h3', {}, p.title || 'Untitled'), h('span', { class: `chip ${v.blockers ? 'bad' : v.warnings ? 'warn' : 'ok'}` }, `${v.completeness}% · ${v.blockers} blockers · ${v.warnings} warnings`)),
      h('div', { class: 'meta' }, `${p.track === 'evidara' ? 'Publish with Evidara · ' : ''}${p.type} · ${(p.authors || []).map(a => a.name + (a.memberId ? ` (${a.memberId})` : '')).join(', ')} · received ${new Date(q._at).toLocaleString()}`),
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn ghost', type: 'button', onclick: async () => { prev.hidden = !prev.hidden; if (!prev.hidden) await renderPost(prev, p, { draft: true }); } }, 'Preview full post'),
        h('button', { class: 'btn', type: 'button', disabled: v.blockers > 0, title: v.blockers ? 'Has blockers' : '', onclick: async () => {
          live.posts = live.posts.filter(x => x.id !== p.id);
          const yr = new Date().getFullYear();
          const seq = live.posts.filter(x => x.articleId?.startsWith(`EVD-${yr}-`)).length + 1;
          const articleId = p.track === 'evidara' ? `EVD-${yr}-${String(seq).padStart(5, '0')}` : undefined;
          live.posts.unshift({ ...p, articleId, status: 'published', publishedAt: new Date().toISOString(), verifiedBy: 'Evidara admin', report: { completeness: v.completeness, warnings: v.warnings } });
          queue.splice(queue.indexOf(q), 1); await saveAll(); toast('Approved. Export to site to make it public.'); drawTabs(); draw();
        } }, 'Approve & publish'),
        h('button', { class: 'btn ghost', type: 'button', onclick: async () => { queue.splice(queue.indexOf(q), 1); await saveAll(); toast('Rejected. Tell the author directly.'); drawTabs(); draw(); } }, 'Reject')),
      prev);
  }

  function draw() {
    if (tab === 'members') {
      const items = queue.filter(q => q.kind === 'evidara-member-request');
      body.replaceChildren(...(items.length ? items.map(memberReview) : [h('div', { class: 'empty' }, 'No member requests. Import the files members send you.')]));
    } else if (tab === 'subs') {
      const items = queue.filter(q => q.kind === 'evidara-submission');
      body.replaceChildren(...(items.length ? items.map(subReview) : [h('div', { class: 'empty' }, 'No submissions. Import submission packages, or write your own post in Publish and import its package.')]));
    } else if (tab === 'live') {
      body.replaceChildren(h('div', { class: 'card' }, h('h3', {}, 'Verified members'), ...(live.members.length ? live.members.map(m => h('div', { class: 'vrow' },
        h('div', { class: 'row' }, h('span', { class: 'idbadge sm' }, m.id), h('b', {}, m.name), h('span', { class: 'meta' }, `${m.role || ''} · ${m.institution || ''}`),
          h('button', { class: 'linkbtn', type: 'button', onclick: async () => { live.members = live.members.filter(x => x !== m); await saveAll(); drawTabs(); draw(); } }, 'Remove')))) : [h('div', { class: 'meta' }, 'None yet.')])),
        h('div', { class: 'card' }, h('h3', {}, 'Published posts'), ...(live.posts.length ? live.posts.map(p => h('div', { class: 'vrow' },
          h('div', { class: 'row' }, h('b', {}, p.title), h('span', { class: 'meta' }, `${p.type} · ${p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : ''}`),
            h('button', { class: 'linkbtn', type: 'button', onclick: async () => { live.posts = live.posts.filter(x => x !== p); await saveAll(); drawTabs(); draw(); } }, 'Unpublish')))) : [h('div', { class: 'meta' }, 'None yet.')])));
    } else {
      body.replaceChildren(h('div', { class: 'card' }, h('h3', {}, 'Publish changes to the live site'),
        h('p', {}, `Download both files and put them in the site's data/ folder (replacing the old ones), then update the repository. Everyone then sees ${live.members.length} verified member(s) and ${live.posts.length} post(s).`),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => download('members.json', JSON.stringify(live.members, null, 1), 'application/json') }, 'Download members.json'),
          h('button', { class: 'btn', type: 'button', onclick: () => download('posts.json', JSON.stringify(live.posts.map(({ localPreview, ...x }) => x)), 'application/json') }, 'Download posts.json')),
        h('p', { class: 'note' }, 'members.json holds only public fields (ID, name, role, institution, ORCID). Registration numbers and documents are never exported.')));
    }
  }
  view.replaceChildren(h('section', { class: 'section wide' },
    h('div', { class: 'rhead' }, h('h2', {}, 'Admin portal'), h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => fileIn.click() }, '+ Import packages'), fileIn,
      h('a', { class: 'btn ghost', href: '#publish' }, 'Write a post'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { try { sessionStorage.removeItem('evd:adminOk'); } catch {} location.hash = '#feed'; } }, 'Lock'))),
    h('p', { class: 'sub' }, 'Verify people by their Evidara ID, registration and documents. Review and publish posts. Then export to the site.'),
    tabs, body));
  drawTabs(); draw();
}

// ---------- online admin portal (server roles; no passphrase) ----------
async function adminOnline() {
  const u = user();
  if (!u) { view.replaceChildren(h('section', { class: 'section narrow' }, h('h2', {}, 'Admin portal'), h('div', { class: 'card' }, h('p', {}, 'Sign in with an admin account.'), h('button', { class: 'btn', type: 'button', onclick: () => import('./backend.js').then(b => b.openSignIn()) }, 'Sign in')))); return; }
  if (!u.admin) { view.replaceChildren(h('section', { class: 'section narrow' }, h('h2', {}, 'Admin portal'), h('div', { class: 'empty' }, 'This account is not an admin.'))); return; }
  let tab = store.get('adminTab2', 'verif');
  const body = h('div', {}); const tabs = h('div', { class: 'seg wide' }); const stats = h('div', { class: 'grid statgrid' });
  let q = { verifications: [], posts: [] };
  const load = async () => {
    try {
      q = await api('/admin/queue');
      reports = (await api('/admin/reports')).reports || [];
      const st = await api('/admin/stats');
      stats.replaceChildren(...[['Members', st.users], ['Verified', st.verified], ['Published', st.published], ['Pending verifications', st.pendingVerifications], ['Pending posts', st.pendingPosts], ['Comments', st.comments], ['Messages', st.messages], ['Open reports', st.openReports], ['Shared videos', st.videos]]
        .map(([l, n]) => h('div', { class: 'rcard stat' }, h('div', { class: 'meta' }, l), h('div', { class: 'bignum' }, String(n)))));
    } catch (e) { toast(e.message); }
    drawTabs(); draw();
  };
  let reports = [];
  const drawTabs = () => tabs.replaceChildren(...[['verif', `Verifications (${q.verifications.length})`], ['posts', `Submissions (${q.posts.length})`], ['reports', `Reports (${reports.length})`], ['live', 'Published']].map(([k, l]) =>
    h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; store.set('adminTab2', k); drawTabs(); draw(); } }, l)));
  const docLink = d => {
    const a = h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
      try { const r = await api('/admin/file?key=' + encodeURIComponent(d.key)); const blob = await r.blob(); window.open(URL.createObjectURL(blob), '_blank', 'noopener'); } catch (e) { toast(e.message); }
    } }, `Open ${d.name}`);
    return a;
  };
  const act = async (path, action, note) => { try { const r = await api(path, { method: 'POST', body: { action, note } }); toast(action === 'approve' ? (r.articleId ? `Published as ${r.articleId}` : 'Approved') : 'Rejected'); await load(); } catch (e) { toast(e.message); } };
  async function draw() {
    if (tab === 'verif') {
      body.replaceChildren(...(q.verifications.length ? q.verifications.map(v => {
        const note = h('input', { type: 'text', placeholder: 'Reason (shown to the member if rejected)' });
        const d = v.data; const idc = parseId(d.memberId);
        return h('div', { class: 'card' }, h('div', { class: 'rhead' }, h('h3', {}, d.name), h('span', { class: 'idbadge' }, d.memberId)),
          h('div', { class: 'meta' }, `${v.email} · ${d.role} · ${d.institution || ''} · ${new Date(v.created_at).toLocaleString()}`),
          ...[['Evidara ID', idc.ok ? `${d.memberId} · ${idc.domain}` : 'Invalid', idc.ok ? 'ok' : 'bad'], ['ORCID', d.orcid ? (validOrcid(d.orcid) ? `${d.orcid} (check digit valid)` : 'fails check digit') : 'Not given', d.orcid ? (validOrcid(d.orcid) ? 'ok' : 'bad') : 'warn'],
            ['Registration', `${d.council} · ${d.regNo}`, 'warn'], ['Documents', `${v.docs.length} attached`, 'warn'], ['Public listing', d.consentPublic ? 'Consented' : 'Not consented', 'ok']]
            .map(([l, t, s]) => h('div', { class: 'vrow' }, h('span', { class: `chip ${s}` }, l), h('div', { class: 'meta' }, t))),
          h('p', { class: 'note' }, 'Check the registration number on the council\'s official register before approving.'),
          h('div', { class: 'row' }, ...v.docs.map(docLink)),
          h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn', type: 'button', onclick: () => act('/admin/verifications/' + v.id, 'approve') }, 'Approve'), note,
            h('button', { class: 'btn ghost', type: 'button', onclick: () => act('/admin/verifications/' + v.id, 'reject', note.value) }, 'Reject')));
      }) : [h('div', { class: 'empty' }, 'No pending verification requests.')]));
    } else if (tab === 'posts') {
      body.replaceChildren(...(q.posts.length ? q.posts.map(pq => {
        const p = pq.data; const v = verifyPost(p); const prev = h('div', { class: 'admin-preview', hidden: true });
        const note = h('input', { type: 'text', placeholder: 'Reason / requested changes' });
        return h('div', { class: 'card' }, h('div', { class: 'rhead' }, h('h3', {}, p.title), h('span', { class: `chip ${v.blockers ? 'bad' : v.warnings ? 'warn' : 'ok'}` }, `${v.completeness}% · ${v.blockers} blockers · ${v.warnings} warnings`)),
          h('div', { class: 'meta' }, `${pq.track === 'evidara' ? 'Publish with Evidara · ' : ''}${p.type} · ${pq.email} · ${new Date(pq.created_at).toLocaleString()}`),
          h('div', { class: 'row', style: 'margin-top:10px' },
            h('button', { class: 'btn ghost', type: 'button', onclick: async () => { prev.hidden = !prev.hidden; if (!prev.hidden) await renderPost(prev, p, { draft: true }); } }, 'Preview'),
            h('button', { class: 'btn', type: 'button', disabled: v.blockers > 0, onclick: () => act('/admin/posts/' + pq.id, 'approve') }, 'Approve & publish'), note,
            h('button', { class: 'btn ghost', type: 'button', onclick: () => act('/admin/posts/' + pq.id, 'reject', note.value) }, 'Reject')), prev);
      }) : [h('div', { class: 'empty' }, 'No submissions waiting.')]));
    } else if (tab === 'reports') {
      body.replaceChildren(h('p', { class: 'note' }, 'You only see a private conversation when a member reports it.'),
        ...(reports.length ? reports.map(rp => h('div', { class: 'card' }, h('div', { class: 'rhead' }, h('h3', {}, rp.people.join(' ↔ ')), h('span', { class: 'chip warn' }, 'Reported')),
          h('div', { class: 'meta' }, `By ${rp.reporter} · ${new Date(rp.created_at).toLocaleString()}${rp.reason ? ' · "' + rp.reason + '"' : ''}`),
          h('div', { class: 'reportmsgs' }, ...rp.messages.map(m => h('div', { class: 'vrow' }, h('b', {}, m.from), h('div', {}, m.text), h('div', { class: 'meta' }, new Date(m.at).toLocaleString())))),
          h('button', { class: 'btn small', type: 'button', onclick: async () => { try { await api('/admin/reports/' + rp.id, { method: 'POST' }); toast('Report closed'); await load(); } catch (e) { toast(e.message); } } }, 'Mark resolved')))
          : [h('div', { class: 'empty' }, 'No open reports.')]));
    } else {
      const ps = (await api('/posts?limit=100')).posts || [];
      body.replaceChildren(h('div', { class: 'card' }, h('h3', {}, `Published (${ps.length})`), ...ps.map(p => h('div', { class: 'vrow' }, h('a', { href: `#post/${encodeURIComponent(p.id)}` }, p.title), h('div', { class: 'meta' }, `${p.articleId || 'Community'} · ${new Date(p.publishedAt).toLocaleDateString()}`)))));
    }
  }
  view.replaceChildren(h('section', { class: 'section wide' },
    h('div', { class: 'rhead' }, h('h2', {}, 'Admin portal'), h('span', { class: 'chip ok' }, `Signed in as ${u.email}`)),
    stats, tabs, body));
  load();
}

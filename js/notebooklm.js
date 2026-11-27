// NotebookLM bridge. NotebookLM has no public API, so the link works through the user's own Google Drive:
//   1. Sign in with Google (drive.file scope: Evidara can only see files it creates).
//   2. Studio sources are copied into a Drive folder; NotebookLM adds sources straight from Drive.
//   3. Open NotebookLM, make the Audio/Video Overview there, download it.
//   4. Bring the results back into the Evidara Library as "Ready to push".
// Without the owner's Google client ID, step 1–2 fall back to a downloadable "NotebookLM pack".
import { h, toast, download } from './util.js';
import { icon } from './icons.js';
import { idb } from './idb.js';
import * as Lib from './library.js';
import { CONFIG } from './config.js';

let token = null, tokenExp = 0, gisP = null;
function loadGis() {
  if (gisP) return gisP;
  gisP = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { gisP = null; reject(new Error('Could not load Google sign-in')); };
    document.head.append(s);
  });
  return gisP;
}
export const googleReady = () => !!CONFIG.googleClientId;
async function signIn() {
  if (!googleReady()) throw new Error('Google sign-in is not set up on this site yet');
  if (token && Date.now() < tokenExp) return token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId, scope: 'https://www.googleapis.com/auth/drive.file openid email profile',
      callback: r => { if (r.error) { reject(new Error(r.error)); return; } token = r.access_token; tokenExp = Date.now() + (r.expires_in - 60) * 1000; resolve(token); },
      error_callback: e => reject(new Error(e?.message || 'Sign-in cancelled')),
    });
    client.requestAccessToken();
  });
}
async function drive(path, opts = {}) {
  const r = await fetch(`https://www.googleapis.com${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`Google Drive error ${r.status}`);
  return r.json();
}
async function ensureFolder() {
  const q = encodeURIComponent(`name='${CONFIG.driveFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await drive(`/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`);
  if (found.files?.length) return found.files[0].id;
  const f = await drive('/drive/v3/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: CONFIG.driveFolderName, mimeType: 'application/vnd.google-apps.folder' }) });
  return f.id;
}
async function upload(folderId, name, blob, asGoogleDoc) {
  const meta = { name, parents: [folderId], ...(asGoogleDoc ? { mimeType: 'application/vnd.google-apps.document' } : {}) };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', blob);
  return drive('/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', { method: 'POST', body: form });
}

const docText = d => `# ${d.title}\n\n` + d.sections.map(s => `## ${s.title}\n\n${s.text}`).join('\n\n');

export function notebookLmCard(getDocs) {
  const status = h('div', { class: 'meta' });
  const results = h('div', { class: 'chips' });
  const ret = h('input', { type: 'file', multiple: true, accept: 'audio/*,video/*,application/pdf,image/*,.md,.txt', hidden: true, onchange: async () => {
    let n = 0;
    for (const f of ret.files) {
      const id = 'libfile:' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      if (await idb.set(id, { name: f.name, blob: f, at: Date.now() })) {
        const kind = f.type.startsWith('audio') ? 'audio' : f.type.startsWith('video') ? 'video' : f.type.startsWith('image') ? 'image' : 'document';
        Lib.add({ kind, title: `NotebookLM ${kind}: ${f.name}`, status: 'ready', storage: 'this browser', link: f.name, fileKey: id, platform: kind === 'audio' ? 'podcast' : kind === 'video' ? 'video' : 'post' });
        n++;
      }
    }
    ret.value = ''; toast(n ? `${n} file${n > 1 ? 's' : ''} added to Library as Ready to push` : 'Could not store the files');
  } });
  const sendDrive = async () => {
    const docs = getDocs();
    if (!docs.length) { toast('Add sources to the notebook first'); return; }
    try {
      status.textContent = 'Signing in with Google…'; await signIn();
      status.textContent = 'Preparing your Drive folder…'; const folder = await ensureFolder();
      results.replaceChildren();
      for (const d of docs) {
        status.textContent = `Sending ${d.title}…`;
        const f = d.file ? await upload(folder, d.name || `${d.title}.pdf`, d.file, false) : await upload(folder, d.title.slice(0, 80), new Blob([docText(d)], { type: 'text/plain' }), true);
        results.append(h('a', { class: 'chip ok', href: f.webViewLink, target: '_blank', rel: 'noopener noreferrer' }, `✓ ${f.name}`));
      }
      status.textContent = `Done: ${docs.length} source${docs.length > 1 ? 's' : ''} in your Drive folder "${CONFIG.driveFolderName}". In NotebookLM choose Add source → Google Drive.`;
    } catch (e) { status.textContent = ''; toast(e.message); }
  };
  const pack = () => {
    const docs = getDocs();
    if (!docs.length) { toast('Add sources to the notebook first'); return; }
    docs.forEach(d => { if (d.file) { const a = h('a', { href: URL.createObjectURL(d.file), download: d.name }); document.body.append(a); a.click(); a.remove(); } });
    const textDocs = docs.filter(d => !d.file);
    if (textDocs.length) download('evidara-notebooklm-sources.md', textDocs.map(docText).join('\n\n---\n\n'), 'text/markdown');
    toast('Pack downloaded. In NotebookLM choose Add source → Upload.');
  };
  return h('div', { class: 'card nlm' },
    h('div', { class: 'rhead' }, h('h3', {}, 'Send to NotebookLM'), googleReady() ? h('span', { class: 'chip ok' }, 'Google sign-in on') : h('span', { class: 'chip warn' }, 'Google sign-in not set up yet')),
    h('ol', { class: 'steps' },
      h('li', {}, h('b', {}, 'Share your sources. '), googleReady() ? 'Sign in with Google and Evidara copies them into your own Drive folder (it can only see files it creates).' : 'Download the NotebookLM pack (Google sign-in arrives once the site owner connects it).'),
      h('li', {}, h('b', {}, 'Open NotebookLM '), 'with the same Google account and add the sources (from Drive, or upload the pack).'),
      h('li', {}, h('b', {}, 'Make your Audio or Video Overview there, '), 'then download it.'),
      h('li', {}, h('b', {}, 'Bring it back: '), 'import the files here. They land in your Library as "Ready to push" to Evidara.')),
    h('div', { class: 'row' },
      googleReady() ? h('button', { class: 'btn', type: 'button', onclick: sendDrive }, icon('share', 16), ' Sign in & send to Drive') : null,
      h('button', { class: googleReady() ? 'btn ghost' : 'btn', type: 'button', onclick: pack }, 'Download NotebookLM pack'),
      h('a', { class: 'btn ghost', href: CONFIG.notebookLmUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open NotebookLM ↗'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => ret.click() }, '⤓ Import results'), ret),
    status, results,
    h('p', { class: 'note' }, 'NotebookLM is a separate Google product with its own terms and limits. Evidara never sees your Google password.'));
}

// Play a stored library file (imported NotebookLM output etc.).
export async function libraryFileUrl(key) { const v = await idb.get(key); return v ? URL.createObjectURL(v.blob) : null; }

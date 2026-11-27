// "Bring your own storage": large photos and videos go to the member's own Google Drive (15 GB free per Google
// account, owned by them). Evidara stores only the file ID, so platform storage never runs out.
// Scope drive.file: Evidara can only see files it creates. Files are shared "anyone with the link can view" so other
// members can see them; the member can delete them from their Drive at any time.
import { CONFIG } from './config.js';

let token = null, exp = 0, gisP = null;
function loadGis() {
  if (gisP) return gisP;
  gisP = new Promise((res, rej) => { if (window.google?.accounts?.oauth2) { res(); return; } const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = res; s.onerror = () => { gisP = null; rej(new Error('Could not load Google')); }; document.head.append(s); });
  return gisP;
}
export const driveReady = () => !!CONFIG.googleClientId;
async function getToken() {
  if (token && Date.now() < exp) return token;
  if (!driveReady()) throw new Error('Google Drive is not connected on this site');
  await loadGis();
  return new Promise((resolve, reject) => {
    const c = window.google.accounts.oauth2.initTokenClient({ client_id: CONFIG.googleClientId, scope: 'https://www.googleapis.com/auth/drive.file',
      callback: r => { if (r.error) { reject(new Error(r.error)); return; } token = r.access_token; exp = Date.now() + (r.expires_in - 60) * 1000; resolve(token); },
      error_callback: e => reject(new Error(e?.message || 'Google Drive permission was not given')) });
    c.requestAccessToken();
  });
}
async function g(path, opts = {}) {
  const r = await fetch('https://www.googleapis.com' + path, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`Google Drive error ${r.status}`);
  return r.json();
}
let folderId = null;
async function folder() {
  if (folderId) return folderId;
  const q = encodeURIComponent("name='Evidara media' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const f = await g(`/drive/v3/files?q=${q}&fields=files(id)`);
  folderId = f.files?.[0]?.id || (await g('/drive/v3/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Evidara media', mimeType: 'application/vnd.google-apps.folder' }) })).id;
  return folderId;
}
// Upload one file; resolves {id, mime, name}. onProgress(0..1) is called for large files.
export async function uploadToDrive(file, onProgress) {
  await getToken();
  const parent = await folder();
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,mimeType,name', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Upload-Content-Type': file.type || 'application/octet-stream' },
    body: JSON.stringify({ name: file.name, parents: [parent] }) });
  if (!init.ok) throw new Error(`Google Drive error ${init.status}`);
  const loc = init.headers.get('Location');
  const meta = await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open('PUT', loc); x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    x.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(`Upload failed (${x.status})`)));
    x.onerror = () => reject(new Error('Upload failed')); x.send(file);
  });
  await g(`/drive/v3/files/${meta.id}/permissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
  return { id: meta.id, mime: meta.mimeType || file.type, name: meta.name || file.name };
}
export const driveImage = (id, w = 1600) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
export const driveVideoEmbed = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
export const driveOpen = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

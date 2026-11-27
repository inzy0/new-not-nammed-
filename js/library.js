// Content library: everything made in the studio, with its status (idea → made → scheduled → posted),
// Evidara destination (Reel, Feed post, Video, Podcast, Community article), schedule time and where the file is stored. Browser storage for now; moves to the
// server database when accounts go live (see PLAN). Export to JSON and calendar (.ics) keeps nothing locked in.
import { store, uid } from './util.js';
import { online, user, api } from './backend.js';

export const STATUSES = [['idea', 'Idea'], ['made', 'Made'], ['ready', 'Ready to push'], ['scheduled', 'Scheduled'], ['posted', 'Pushed to Evidara']];

export function all() { return store.get('library', []); }
let pushT = 0;
function save(list) {
  store.set('library', list);
  if (online() && user()) { clearTimeout(pushT); pushT = setTimeout(() => api('/library', { method: 'PUT', body: { items: all() } }).catch(() => {}), 900); }
}
// On sign-in: merge the server copy with this device (newest version of each item wins), then push the result.
export async function syncLibrary() {
  if (!online() || !user()) return;
  try {
    const remote = (await api('/library')).items || [];
    const byId = new Map(remote.map(x => [x.id, x]));
    for (const x of all()) { const r = byId.get(x.id); if (!r || (x.updatedAt || x.createdAt) > (r.updatedAt || r.createdAt)) byId.set(x.id, x); }
    const merged = [...byId.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    store.set('library', merged);
    await api('/library', { method: 'PUT', body: { items: merged } });
  } catch { /* stay local */ }
}

export function add(item) {
  const list = all();
  const it = { id: uid(), status: 'idea', createdAt: new Date().toISOString(), platform: 'reel', scheduledAt: '', storage: 'browser', link: '', ...item };
  list.unshift(it); save(list); return it;
}
export function update(id, patch) {
  const list = all(); const i = list.findIndex(x => x.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, updatedAt: new Date().toISOString() };
  if (patch.status === 'posted' && !list[i].postedAt) list[i].postedAt = new Date().toISOString();
  save(list); return list[i];
}
export function remove(id) { save(all().filter(x => x.id !== id)); }

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('Expected a list');
  const ok = data.filter(x => x && typeof x.id === 'string' && typeof x.title === 'string');
  const byId = new Map(all().map(x => [x.id, x]));
  for (const x of ok) byId.set(x.id, x);
  save([...byId.values()]); return ok.length;
}

const icsDate = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
export function toICS() {
  const ev = all().filter(x => x.scheduledAt).map(x => [
    'BEGIN:VEVENT', `UID:${x.id}@evidara`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(x.scheduledAt)}`, `DURATION:PT15M`,
    `SUMMARY:${icsEsc(`Post: ${x.title}`)}`, `DESCRIPTION:${icsEsc(`${x.kind} for Evidara. ${x.source || ''}`)}`, 'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Evidara//Library//EN', ...ev, 'END:VCALENDAR'].join('\r\n');
}

// ---------- daily free quota (refreshes every day at 00:00 UTC = 05:30 IST, matching the free cloud tier) ----------
export const DAILY = { image: 10, video: 5, audio: 20 };
function today() { return new Date().toISOString().slice(0, 10); }
export function quota(kind) {
  const q = store.get('quota', {});
  const used = q.day === today() ? (q[kind] || 0) : 0;
  return { used, left: Math.max(0, DAILY[kind] - used), max: DAILY[kind] };
}
export function spend(kind) {
  const q = store.get('quota', {});
  const fresh = q.day === today() ? q : { day: today() };
  if ((fresh[kind] || 0) >= DAILY[kind]) return false;
  fresh[kind] = (fresh[kind] || 0) + 1; store.set('quota', fresh); return true;
}
export function resetNote() {
  const next = new Date(); next.setUTCHours(24, 0, 0, 0);
  return `Free limits refresh daily at ${next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} your time`;
}

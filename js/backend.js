// Evidara backend client. When CONFIG.apiUrl is set, accounts, profiles, verification, publishing, discussion,
// likes, follows, library sync, shared videos and AI images go through the Evidara API (worker/).
// Without it, the site keeps working in "this device" mode.
import { h, store, toast } from './util.js';
import { icon } from './icons.js';
import { CONFIG } from './config.js';

export const online = () => !!CONFIG.apiUrl;
const base = () => CONFIG.apiUrl.replace(/\/$/, '');
let me = null, meLoaded = false;
const subs = new Set();
export const onAuth = fn => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach(fn => { try { fn(me); } catch {} });
export const user = () => me;
export const token = () => store.get('session', null)?.token || null;

export async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  if (!online()) throw new Error('Evidara accounts are not connected yet');
  const t = token();
  let r;
  try {
    r = await fetch(base() + path, { method, headers: { ...(t ? { Authorization: 'Bearer ' + t } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: raw || (body ? JSON.stringify(body) : undefined) });
  } catch { throw new Error('Cannot reach the Evidara server'); }
  const j = (r.headers.get('content-type') || '').includes('json') ? await r.json().catch(() => ({})) : null;
  if (r.status === 401 && t && path !== '/auth/logout') { store.set('session', null); me = null; emit(); }
  if (!r.ok) throw new Error(j?.error || `Server error ${r.status}`);
  return j ?? r;
}

export async function loadMe(force = false) {
  if (!online()) return null;
  if (meLoaded && !force) return me;
  try { me = token() ? (await api('/me')).user : null; } catch { me = null; }
  meLoaded = true; emit(); return me;
}
async function finishLogin(res) { store.set('session', { token: res.token, expires: res.expires }); await loadMe(true); toast(`Signed in${me?.name ? ' as ' + me.name : ''}`); }
export async function devSignIn(email, name) { await finishLogin(await api('/auth/dev', { method: 'POST', body: { email, name } })); }
export async function signOut() { try { await api('/auth/logout', { method: 'POST' }); } catch {} store.set('session', null); me = null; emit(); toast('Signed out'); }

let gisP = null;
function loadGis() {
  if (gisP) return gisP;
  gisP = new Promise((res, rej) => { if (window.google?.accounts?.id) { res(); return; } const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = res; s.onerror = () => { gisP = null; rej(new Error('Could not load Google sign-in')); }; document.head.append(s); });
  return gisP;
}

// Sign-in sheet: Google button (production) or the local test form (only when the server allows dev logins).
export async function openSignIn() {
  const close = () => { modal.classList.add('out'); setTimeout(() => modal.remove(), 300); };
  const gbox = h('div', { class: 'gbtn' });
  const devForm = CONFIG.devLogin ? (() => {
    const em = h('input', { type: 'text', placeholder: 'email for local testing', 'aria-label': 'Email' }), nm = h('input', { type: 'text', placeholder: 'name', 'aria-label': 'Name' });
    return h('div', { class: 'devlogin' }, h('div', { class: 'meta' }, 'Local test sign-in (only works on a server with DEV_LOGIN on)'), em, nm,
      h('button', { class: 'btn', type: 'button', onclick: async () => { try { await devSignIn(em.value.trim(), nm.value.trim()); close(); } catch (e) { toast(e.message); } } }, 'Sign in (test)'));
  })() : null;
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sign in' },
    h('div', { class: 'modal-card glass signin' },
      h('div', { class: 'kicker' }, 'EVIDARA ACCOUNT'), h('h2', {}, 'Sign in'),
      h('p', { class: 'meta' }, 'Sign in to like, follow, sync your library and request verification. Verified healthcare members can publish, discuss with authors and share videos.'),
      !online() ? h('p', { class: 'note' }, 'Accounts are not connected on this site yet. Everything still works on this device.') : null,
      online() && CONFIG.googleClientId ? gbox : null,
      online() && !CONFIG.googleClientId && !CONFIG.devLogin ? h('p', { class: 'note' }, 'Google sign-in is not configured yet.') : null,
      online() ? devForm : null,
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px' }, h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Close'))));
  document.body.append(modal);
  if (online() && CONFIG.googleClientId) {
    try {
      await loadGis();
      window.google.accounts.id.initialize({ client_id: CONFIG.googleClientId, callback: async resp => { try { await finishLogin(await api('/auth/google', { method: 'POST', body: { credential: resp.credential } })); close(); } catch (e) { toast(e.message); } } });
      window.google.accounts.id.renderButton(gbox, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with' });
    } catch (e) { gbox.textContent = e.message; }
  }
}

// Account chip in the sidebar.
export function mountAccount(slot) {
  const draw = () => {
    if (!online()) { slot.replaceChildren(h('button', { class: 'snav-item acct', type: 'button', onclick: openSignIn }, h('span', { class: 'ico' }, icon('profile', 22)), h('span', { class: 'lbl' }, 'This device'))); return; }
    if (!me) { slot.replaceChildren(h('button', { class: 'snav-item acct', type: 'button', onclick: openSignIn }, h('span', { class: 'ico' }, icon('profile', 22)), h('span', { class: 'lbl' }, 'Sign in'))); return; }
    const initials = (me.name || me.email).split(/[\s@]+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
    slot.replaceChildren(h('a', { class: 'snav-item acct on-acct', href: '#profile', title: me.email },
      h('span', { class: 'ico' }, me.picture ? h('img', { class: 'acct-pic', src: me.picture, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'av' }, initials)),
      h('span', { class: 'lbl' }, h('b', {}, me.name || me.email), h('small', {}, me.admin ? 'Admin' : me.verified ? `Verified · ${me.profile?.member_id || ''}` : (me.profile?.member_id || 'Member')))));
  };
  onAuth(draw); draw();
}

// Guard for healthcare-only actions. Returns true when allowed; otherwise explains and returns false.
export function requireVerified(action = 'do this') {
  if (!online()) return true;
  if (!me) { toast(`Sign in to ${action}`); openSignIn(); return false; }
  if (!me.verified && !me.admin) { toast(`Only verified healthcare members can ${action}. Request verification in your Profile.`); return false; }
  return true;
}
export function requireSignedIn(action = 'do this') {
  if (!online()) return true;
  if (!me) { toast(`Sign in to ${action}`); openSignIn(); return false; }
  return true;
}

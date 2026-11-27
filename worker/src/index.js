// Evidara backend: one Cloudflare Worker with D1 (database) and R2 (files). Free plan.
// Accounts via Google sign-in (ID token checked with Google, audience must be our client ID), sessions as random
// tokens stored hashed. Roles: member (default), verified member (admin-approved), admin (ADMIN_EMAILS).
// Healthcare-only actions (posting, discussing, sharing videos) need a verified member. Every text is screened for
// patient identifiers on the server, not just in the browser.

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const BLOCK = /\b(nude|naked|nsfw|sexual|porn|erotic|gore|corpse|dead body|mutilat|suicide|self-harm|weapon|gun|child abuse|patient photo|x-ray of a real patient|celebrity|real person|face of)\b/i;
const PATIENT = [/\b\d{4}\s?\d{4}\s?\d{4}\b/, /\b(MRN|UHID|IP ?No|OPD ?No)\b/i, /\b(DOB|date of birth)\b/i, /\b\d{2}[\/-]\d{2}[\/-](19|20)\d{2}\b/, /\b[6-9]\d{9}\b/, /\b(mr|mrs|ms)\.?\s+[A-Z][a-z]+\s+(aged|age)\b/i];
const DOMAINS = 'ANES CARD CRIT DENT DERM EMER ENDO ENTO FMED GAST GENE GERI HAEM IDIS IMED NEPH NEUR NURS NUTR OBGY OCCU ONCO OPHT ORTH PAED PALL PATH PHAR PHYS PSYC PUBH PULM RADI RHEU RSCH SPRT SURG UROL STUD ALLD'.split(' ');
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// 1x1 PNG used only when MOCK_AI=1 (local tests without the AI binding)
const MOCK_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const now = () => new Date().toISOString();
const uid = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
async function sha256(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const screenText = t => PATIENT.some(re => re.test(String(t || '')));
function checkChar(body) { let sum = 0, f = 2; for (let i = body.length - 1; i >= 0; i--) { let a = f * ALPHA.indexOf(body[i]); a = Math.floor(a / 32) + (a % 32); sum += a; f = f === 2 ? 1 : 2; } return ALPHA[(32 - (sum % 32)) % 32]; }
function newMemberId(code) { const b = crypto.getRandomValues(new Uint8Array(5)); const body = [...b].map(x => ALPHA[x & 31]).join(''); return `${code}-${body}${checkChar(body)}`; }
function validOrcid(s) { s = String(s || ''); if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(s)) return false; const d = s.replace(/-/g, ''); let t = 0; for (let i = 0; i < 15; i++) t = (t + Number(d[i])) * 2; const r = (12 - (t % 11)) % 11; return d[15] === (r === 10 ? 'X' : String(r)); }
const clip = (s, n) => String(s ?? '').slice(0, n);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

function corsHeaders(origin) { return { 'Access-Control-Allow-Origin': origin || 'null', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Evidara-Client', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' }; }

async function bump(db, day, who, limit) {
  await db.prepare('INSERT INTO quota (day, who, n) VALUES (?1, ?2, 0) ON CONFLICT(day, who) DO NOTHING').bind(day, who).run();
  const row = await db.prepare('UPDATE quota SET n = n + 1 WHERE day = ?1 AND who = ?2 AND n < ?3 RETURNING n').bind(day, who, limit).first();
  return row ? row.n : null;
}
async function rate(env, who, limit) { const n = await bump(env.DB, now().slice(0, 10), who, limit); if (n === null) fail(429, 'Daily limit reached. It refreshes at 05:30 IST.'); }

// ---------- auth ----------
async function sessionUser(env, req) {
  const h = req.headers.get('Authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!tok || tok.length > 200) return null;
  const row = await env.DB.prepare('SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1').bind(await sha256(tok)).first();
  if (!row || row.expires_at < now()) return null;
  const prof = await env.DB.prepare('SELECT * FROM profiles WHERE user_id = ?1').bind(row.id).first();
  return { ...row, profile: prof || null, verified: !!prof?.verified, admin: row.role === 'admin' };
}
async function startSession(env, email, name, picture) {
  email = email.toLowerCase();
  const admins = (env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  let u = await env.DB.prepare('SELECT * FROM users WHERE email = ?1').bind(email).first();
  if (!u) { u = { id: uid(), email }; await env.DB.prepare('INSERT INTO users (id, email, name, picture, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(u.id, email, clip(name, 120), clip(picture, 500), admins.includes(email) ? 'admin' : 'member', now()).run(); }
  else await env.DB.prepare('UPDATE users SET name = ?2, picture = ?3, role = ?4 WHERE id = ?1').bind(u.id, clip(name || u.name, 120), clip(picture || u.picture, 500), admins.includes(email) ? 'admin' : (u.role === 'admin' ? 'member' : u.role)).run();
  const token = uid() + uid();
  const exp = new Date(Date.now() + 30 * 864e5).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)').bind(await sha256(token), u.id, exp).run();
  return { token, expires: exp };
}
const need = (u, what = 'signed') => {
  if (!u) fail(401, 'Please sign in');
  if (what === 'verified' && !u.verified && !u.admin) fail(403, 'Only verified healthcare members can do this. Request verification from your Profile.');
  if (what === 'admin' && !u.admin) fail(403, 'Admins only');
};
const publicUser = u => u && ({ id: u.id, email: u.email, name: u.name, picture: u.picture, role: u.role, verified: u.verified, admin: u.admin, profile: u.profile });

// ---------- files: R2 when the FILES bucket is bound, otherwise D1 (files up to ~1.9 MB) ----------
const D1_MAX = 1900000;
async function putBytes(env, key, bin, mime) {
  if (env.FILES) { await env.FILES.put(key, bin, { httpMetadata: { contentType: mime } }); return key; }
  if (bin.length > D1_MAX) fail(413, 'Files over 1.9 MB need Evidara file storage (R2), which is not switched on yet. Please upload a smaller file.');
  await env.DB.prepare('INSERT OR REPLACE INTO files (key, mime, data, size, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(key, mime, bin, bin.length, now()).run();
  return key;
}
async function getFile(env, key, req) {
  if (env.FILES) {
    const range = req?.headers.get('Range');
    const obj = await env.FILES.get(key, range ? { range: req.headers } : undefined);
    return obj ? { body: obj.body, mime: obj.httpMetadata?.contentType, size: obj.size, range: range ? obj.range : null } : null;
  }
  const row = await env.DB.prepare('SELECT mime, data, size FROM files WHERE key = ?1').bind(key).first();
  return row ? { body: new Uint8Array(row.data), mime: row.mime, size: row.size, range: null } : null;
}
async function putDataUrl(env, key, dataUrl, maxBytes) {
  const m = String(dataUrl || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m) fail(400, 'Bad file data');
  const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  if (bin.length > maxBytes) fail(413, 'File too large');
  return putBytes(env, key, bin, m[1]);
}

// ---------- handlers ----------
async function route(req, env, url, u) {
  const p = url.pathname, M = req.method;
  const pubBase = (env.PUBLIC_URL || url.origin).replace(/\/$/, '');
  const body = async (max = 2e6) => { const t = await req.text(); if (t.length > max) fail(413, 'Request too large'); try { return JSON.parse(t || '{}'); } catch { fail(400, 'Bad JSON'); } };
  const seg = p.split('/').filter(Boolean).map(decodeURIComponent);
  const YT = s => (String(s).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/) || [])[1];
  const DRIVE_ID = /^[\w-]{10,120}$/;
  async function normMedia(items, keyBase) {
    const out = [];
    for (const [i, m] of (Array.isArray(items) ? items : []).slice(0, 10).entries()) {
      if (m.type === 'image' && m.dataUrl) out.push({ type: 'image', src: `${pubBase}/files/${await putDataUrl(env, `${keyBase}/${i}-${uid().slice(0, 6)}`, m.dataUrl, 1.9e6)}`, alt: clip(m.alt, 300) });
      else if (m.type === 'drive' && DRIVE_ID.test(m.id || '')) out.push({ type: 'drive', id: m.id, mime: clip(m.mime, 80), name: clip(m.name, 160) });
      else if (m.type === 'youtube' && YT(m.url)) out.push({ type: 'youtube', id: YT(m.url) });
      else if (m.type === 'image' && /^https:\/\//.test(m.src || '') && m.src.startsWith(pubBase)) out.push({ type: 'image', src: m.src, alt: clip(m.alt, 300) });
    }
    return out;
  }
  function normMusic(m) {
    const u = String(m?.url || '').trim(); if (!u) return null;
    const sp = u.match(/open\.spotify\.com\/(track|episode|show|album|playlist)\/([A-Za-z0-9]+)/);
    if (sp) return { provider: 'spotify', kind: sp[1], id: sp[2], url: u, title: clip(m.title, 120) };
    if (YT(u)) return { provider: 'youtube', id: YT(u), url: u, title: clip(m.title, 120) };
    if (/^https:\/\/soundcloud\.com\/[\w-]+\/[\w-]+/.test(u)) return { provider: 'soundcloud', url: clip(u, 300), title: clip(m.title, 120) };
    fail(400, 'Music link must be Spotify, YouTube or SoundCloud');
  }
  const evSet = async targets => {
    if (!targets.length) return new Set();
    const ph = targets.map((_, i) => `?${i + 1}`).join(',');
    return new Set((await env.DB.prepare(`SELECT target FROM ev_marks WHERE target IN (${ph})`).bind(...targets).all()).results.map(r => r.target));
  };
  const postOut = (r, ev) => ({ id: r.id, kind: r.kind, caption: r.caption, media: JSON.parse(r.media || '[]'), paperKey: r.paper_key, paperTitle: r.paper_title, rating: r.rating,
    music: r.music ? JSON.parse(r.music) : null, tags: r.tags ? JSON.parse(r.tags) : [], at: r.created_at, ev: ev.has('mp:' + r.id),
    author: r.member_id ? { id: r.member_id, name: r.pname || r.uname, avatar: r.avatar || null, verified: !!r.verified } : undefined });
  const POST_COLS = `m.*, p.member_id, p.name AS pname, u.name AS uname, p.verified, x.avatar`;
  const POST_JOIN = `FROM mposts m JOIN users u ON u.id = m.user_id LEFT JOIN profiles p ON p.user_id = m.user_id LEFT JOIN profile_ext x ON x.user_id = m.user_id`;
  async function logHistory(userId, before, after) {
    const changes = {};
    for (const k of Object.keys(after)) { const a = before?.[k] ?? null, b = after[k] ?? null; if (JSON.stringify(a) !== JSON.stringify(b)) changes[k] = { from: a, to: b }; }
    if (Object.keys(changes).length) await env.DB.prepare('INSERT INTO profile_history (id, user_id, changes, at) VALUES (?1, ?2, ?3, ?4)').bind(uid(), userId, JSON.stringify(changes), now()).run();
  }

  if (p === '/health') return { ok: true, time: now(), ai: !!env.AI || env.MOCK_AI === '1', google: !!env.GOOGLE_CLIENT_ID, files: env.FILES ? 'r2' : 'd1', videos: !!env.FILES };

  // auth
  if (p === '/auth/google' && M === 'POST') {
    const { credential } = await body();
    if (!env.GOOGLE_CLIENT_ID) fail(503, 'Google sign-in is not configured');
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential || ''));
    const t = await r.json().catch(() => ({}));
    if (!r.ok || t.aud !== env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(t.iss) || t.email_verified !== 'true' && t.email_verified !== true) fail(401, 'Google sign-in could not be verified');
    return startSession(env, t.email, t.name, t.picture);
  }
  if (p === '/auth/dev' && M === 'POST') {
    if (env.DEV_LOGIN !== '1') fail(404, 'Not found');
    const { email, name } = await body();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) fail(400, 'Email required');
    return startSession(env, email, name || email.split('@')[0], '');
  }
  if (p === '/auth/logout' && M === 'POST') { const h = req.headers.get('Authorization') || ''; if (h.startsWith('Bearer ')) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(h.slice(7))).run(); return { ok: true }; }
  if (p === '/me' && M === 'GET') return { user: publicUser(u) };

  if (p === '/me/profile' && M === 'PUT') {
    need(u);
    const b = await body();
    const domain = DOMAINS.includes(b.domain) ? b.domain : 'CARD';
    for (const t of [b.name, b.bio, b.role_title, b.institution]) if (screenText(t)) fail(400, 'Remove patient-identifying details from your profile');
    if (b.orcid && !validOrcid(b.orcid)) fail(400, 'ORCID iD fails its check digit');
    const cur = u.profile;
    let memberId = cur?.member_id;
    if (!memberId || memberId.slice(0, 4) !== domain) {
      if (cur?.verified && memberId) fail(400, 'Verified members keep their ID. Ask the admin to change your domain.');
      for (let i = 0; i < 8; i++) { const cand = newMemberId(domain); const clash = await env.DB.prepare('SELECT 1 FROM profiles WHERE member_id = ?1').bind(cand).first(); if (!clash) { memberId = cand; break; } }
    }
    await logHistory(u.id, cur ? { domain: cur.domain, name: cur.name, role_title: cur.role_title, institution: cur.institution, orcid: cur.orcid, bio: cur.bio } : null,
      { domain, name: clip(b.name, 120), role_title: clip(b.role_title, 120), institution: clip(b.institution, 200), orcid: clip(b.orcid, 19), bio: clip(b.bio, 1000) });
    await env.DB.prepare(`INSERT INTO profiles (user_id, member_id, domain, name, role_title, institution, orcid, bio, audience, tone, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
      ON CONFLICT(user_id) DO UPDATE SET member_id=?2, domain=?3, name=?4, role_title=?5, institution=?6, orcid=?7, bio=?8, audience=?9, tone=?10, updated_at=?11`)
      .bind(u.id, memberId, domain, clip(b.name, 120), clip(b.role_title, 120), clip(b.institution, 200), clip(b.orcid, 19), clip(b.bio, 1000), clip(b.audience, 40), clip(b.tone, 40), now()).run();
    return { profile: await env.DB.prepare('SELECT * FROM profiles WHERE user_id = ?1').bind(u.id).first() };
  }
  if (p === '/me/verification' && M === 'GET') { need(u); return { requests: (await env.DB.prepare('SELECT id, status, note, created_at, decided_at FROM verifications WHERE user_id = ?1 ORDER BY created_at DESC').bind(u.id).all()).results }; }
  if (p === '/me/verification' && M === 'POST') {
    need(u);
    if (!u.profile?.member_id) fail(400, 'Save your profile first to get your Evidara ID');
    await rate(env, 'verif:' + u.id, 3);
    const b = await body(12e6);
    if (!b.name || !b.role || !b.council || !b.regNo) fail(400, 'Name, role, council and registration number are required');
    if (b.orcid && !validOrcid(b.orcid)) fail(400, 'ORCID iD fails its check digit');
    const docs = (b.docs || []).slice(0, 5);
    if (!docs.length) fail(400, 'Add at least one proof document');
    const id = uid(); const keys = [];
    for (const [i, d] of docs.entries()) keys.push({ name: clip(d.name, 120), key: await putDataUrl(env, `priv/verif/${id}/${i}`, d.dataUrl, 5.5e6) });
    const data = { name: clip(b.name, 120), role: clip(b.role, 120), institution: clip(b.institution, 200), orcid: clip(b.orcid, 19), council: clip(b.council, 120), regNo: clip(b.regNo, 60), consentPublic: !!b.consentPublic, memberId: u.profile.member_id };
    await env.DB.prepare('INSERT INTO verifications (id, user_id, data, docs, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(id, u.id, JSON.stringify(data), JSON.stringify(keys), 'pending', now()).run();
    return { id, status: 'pending' };
  }

  // public directory
  if (p === '/members' && M === 'GET') {
    const d = url.searchParams.get('domain');
    const rows = (await env.DB.prepare(`SELECT member_id AS id, name, role_title AS role, institution, orcid, domain, verified_at AS verifiedAt FROM profiles WHERE verified = 1 AND listed = 1 ${d ? 'AND domain = ?1' : ''} ORDER BY verified_at DESC LIMIT 500`).bind(...(d ? [d] : [])).all()).results;
    return { members: rows };
  }

  // posts
  if (p === '/posts' && M === 'GET') {
    const d = url.searchParams.get('domain'); const lim = Math.min(100, Number(url.searchParams.get('limit') || 50));
    const rows = (await env.DB.prepare(`SELECT p.data, p.article_id, p.published_at, e.target AS ev FROM posts p LEFT JOIN ev_marks e ON e.target = 'post:' || p.id WHERE p.status = 'published' ${d ? 'AND p.domain = ?2' : ''} ORDER BY p.published_at DESC LIMIT ?1`).bind(lim, ...(d ? [d] : [])).all()).results;
    return { posts: rows.map(r => ({ ...JSON.parse(r.data), articleId: r.article_id || undefined, publishedAt: r.published_at, status: 'published', ev: !!r.ev })) };
  }
  if (p === '/posts/mine' && M === 'GET') { need(u); const rows = (await env.DB.prepare('SELECT id, title, status, note, article_id, created_at, published_at FROM posts WHERE user_id = ?1 ORDER BY created_at DESC').bind(u.id).all()).results; return { posts: rows }; }
  if (seg[0] === 'posts' && seg[1] && M === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM posts WHERE id = ?1').bind(seg[1]).first();
    if (!r || (r.status !== 'published' && !(u && (u.admin || u.id === r.user_id)))) fail(404, 'Post not found');
    const evm = await env.DB.prepare('SELECT 1 FROM ev_marks WHERE target = ?1').bind('post:' + r.id).first();
    return { post: { ...JSON.parse(r.data), articleId: r.article_id || undefined, publishedAt: r.published_at, status: r.status, note: r.note, ev: !!evm } };
  }
  if (p === '/posts' && M === 'POST') {
    need(u, 'verified');
    await rate(env, 'post:' + u.id, 10);
    const b = await body(16e6);
    const post = b.post || {};
    const all = [post.title, JSON.stringify(post.abstract || {}), (post.sections || []).map(s => s.text).join(' '), post.personal, post.suggestions].join(' ');
    if (screenText(all)) fail(400, 'Possible patient identifiers found. Remove them before submitting.');
    if (!post.title || String(post.title).length < 10) fail(400, 'Title is required');
    const id = /^[a-f0-9]{16,32}$/.test(post.id || '') ? post.id : uid();
    const existing = await env.DB.prepare('SELECT user_id, status FROM posts WHERE id = ?1').bind(id).first();
    if (existing && existing.user_id !== u.id) fail(409, 'This post belongs to someone else');
    if (existing?.status === 'published') fail(409, 'Already published. Send a correction to the editor instead.');
    const images = [];
    for (const [i, im] of (post.images || []).slice(0, 12).entries()) {
      const src = String(im.src || '');
      images.push({ src: src.startsWith('data:') ? `${pubBase}/files/${await putDataUrl(env, `pub/posts/${id}/${i}-${uid().slice(0, 6)}`, src, 3e6)}` : clip(src, 500), caption: clip(im.caption, 600), alt: clip(im.alt, 300) });
    }
    const clean = { ...post, id, images, authors: (post.authors || []).slice(0, 30), status: 'submitted', submittedBy: u.profile?.member_id || '' };
    await env.DB.prepare(`INSERT INTO posts (id, user_id, track, status, title, domain, data, report, created_at) VALUES (?1,?2,?3,'submitted',?4,?5,?6,?7,?8)
      ON CONFLICT(id) DO UPDATE SET track=?3, status='submitted', title=?4, domain=?5, data=?6, report=?7, note=NULL`)
      .bind(id, u.id, post.track === 'evidara' ? 'evidara' : 'community', clip(post.title, 300), DOMAINS.includes(post.domain) ? post.domain : 'CARD', JSON.stringify(clean), JSON.stringify(b.report || {}), now()).run();
    return { id, status: 'submitted' };
  }

  // admin
  if (seg[0] === 'admin') {
    need(u, 'admin');
    if (p === '/admin/queue' && M === 'GET') {
      const v = (await env.DB.prepare(`SELECT v.*, u.email FROM verifications v JOIN users u ON u.id = v.user_id WHERE v.status = 'pending' ORDER BY v.created_at`).all()).results.map(r => ({ ...r, data: JSON.parse(r.data), docs: JSON.parse(r.docs) }));
      const ps = (await env.DB.prepare(`SELECT p.id, p.track, p.title, p.data, p.report, p.created_at, u.email FROM posts p JOIN users u ON u.id = p.user_id WHERE p.status = 'submitted' ORDER BY p.created_at`).all()).results.map(r => ({ ...r, data: JSON.parse(r.data), report: JSON.parse(r.report || '{}') }));
      return { verifications: v, posts: ps };
    }
    if (p === '/admin/stats' && M === 'GET') {
      const one = async sql => (await env.DB.prepare(sql).first())?.n || 0;
      return { users: await one('SELECT COUNT(*) n FROM users'), verified: await one('SELECT COUNT(*) n FROM profiles WHERE verified = 1'), published: await one(`SELECT COUNT(*) n FROM posts WHERE status = 'published'`),
        pendingVerifications: await one(`SELECT COUNT(*) n FROM verifications WHERE status = 'pending'`), pendingPosts: await one(`SELECT COUNT(*) n FROM posts WHERE status = 'submitted'`), comments: await one('SELECT COUNT(*) n FROM comments WHERE deleted = 0'), messages: await one('SELECT COUNT(*) n FROM messages'), openReports: await one(`SELECT COUNT(*) n FROM reports WHERE status = 'open'`), videos: await one('SELECT COUNT(*) n FROM videos WHERE removed = 0') };
    }
    if (p === '/admin/file' && M === 'GET') {
      const key = url.searchParams.get('key') || '';
      if (!key.startsWith('priv/')) fail(400, 'Bad key');
      const obj = await getFile(env, key); if (!obj) fail(404, 'Not found');
      return new Response(obj.body, { headers: { 'Content-Type': obj.mime || 'application/octet-stream', 'Cache-Control': 'private, no-store' } });
    }
    if (p === '/admin/members' && M === 'GET') {
      const rows = (await env.DB.prepare(`SELECT u.id, u.email, u.name AS uname, u.role, u.created_at, p.member_id, p.name, p.role_title, p.institution, p.domain, p.verified, p.listed, p.updated_at, x.avatar, x.headline,
        (SELECT COUNT(*) FROM mposts m WHERE m.user_id = u.id AND m.deleted = 0) AS posts, (SELECT MAX(at) FROM profile_history h WHERE h.user_id = u.id) AS last_change,
        (SELECT COUNT(*) FROM profile_history h WHERE h.user_id = u.id) AS changes
        FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN profile_ext x ON x.user_id = u.id ORDER BY COALESCE((SELECT MAX(at) FROM profile_history h WHERE h.user_id = u.id), u.created_at) DESC LIMIT 500`).all()).results;
      return { members: rows };
    }
    if (p === '/admin/history' && M === 'GET') {
      const uidq = url.searchParams.get('user');
      const rows = (await env.DB.prepare(`SELECT h.at, h.changes, u.email, p.member_id FROM profile_history h JOIN users u ON u.id = h.user_id LEFT JOIN profiles p ON p.user_id = h.user_id ${uidq ? 'WHERE h.user_id = ?1' : ''} ORDER BY h.at DESC LIMIT 200`).bind(...(uidq ? [uidq] : [])).all()).results;
      return { history: rows.map(r => ({ ...r, changes: JSON.parse(r.changes) })) };
    }
    if (p === '/admin/mposts' && M === 'GET') {
      const rows = (await env.DB.prepare(`SELECT ${POST_COLS}, u.email ${POST_JOIN} ORDER BY m.created_at DESC LIMIT 200`).all()).results;
      const ev = await evSet(rows.map(r => 'mp:' + r.id));
      return { posts: rows.map(r => ({ ...postOut(r, ev), email: r.email, deleted: !!r.deleted })) };
    }
    if (p === '/admin/ev' && M === 'POST') {
      const { target, on, note } = await body();
      if (!/^(mp|post):[a-f0-9]{16,32}$/.test(target || '')) fail(400, 'Bad target');
      if (on) await env.DB.prepare('INSERT OR REPLACE INTO ev_marks (target, by_email, note, at) VALUES (?1, ?2, ?3, ?4)').bind(target, u.email, clip(note, 300), now()).run();
      else await env.DB.prepare('DELETE FROM ev_marks WHERE target = ?1').bind(target).run();
      return { ok: true, on: !!on };
    }
    if (p === '/admin/reports' && M === 'GET') {
      const reps = (await env.DB.prepare(`SELECT r.id, r.pair, r.reason, r.created_at, u.email AS reporter FROM reports r JOIN users u ON u.id = r.reporter WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 50`).all()).results;
      for (const r of reps) {
        const names = {};
        for (const id2 of r.pair.split(':')) { const o = await env.DB.prepare('SELECT u.email, p.member_id, COALESCE(p.name, u.name) AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?1').bind(id2).first(); names[id2] = o ? `${o.name || o.email}${o.member_id ? ' (' + o.member_id + ')' : ''}` : id2; }
        r.people = Object.values(names);
        r.messages = (await env.DB.prepare('SELECT sender, text, created_at AS at FROM messages WHERE pair = ?1 ORDER BY created_at DESC LIMIT 50').bind(r.pair).all()).results.reverse().map(m => ({ from: names[m.sender], text: m.text, at: m.at }));
        delete r.pair;
      }
      return { reports: reps };
    }
    if (seg[1] === 'reports' && seg[2] && M === 'POST') { await env.DB.prepare(`UPDATE reports SET status = 'closed' WHERE id = ?1`).bind(seg[2]).run(); return { ok: true }; }
    if (seg[1] === 'verifications' && seg[2] && M === 'POST') {
      const { action, note } = await body();
      const v = await env.DB.prepare('SELECT * FROM verifications WHERE id = ?1').bind(seg[2]).first(); if (!v) fail(404, 'Not found');
      if (action === 'approve') {
        const d = JSON.parse(v.data);
        await env.DB.prepare('UPDATE profiles SET verified = 1, listed = ?2, verified_at = ?3, name = COALESCE(NULLIF(?4, \'\'), name), role_title = COALESCE(NULLIF(?5, \'\'), role_title), institution = COALESCE(NULLIF(?6, \'\'), institution), orcid = COALESCE(NULLIF(?7, \'\'), orcid) WHERE user_id = ?1')
          .bind(v.user_id, d.consentPublic ? 1 : 0, now(), d.name, d.role, d.institution, validOrcid(d.orcid) ? d.orcid : '').run();
      }
      await env.DB.prepare('UPDATE verifications SET status = ?2, note = ?3, decided_at = ?4, decided_by = ?5 WHERE id = ?1').bind(v.id, action === 'approve' ? 'approved' : 'rejected', clip(note, 500), now(), u.email).run();
      return { ok: true };
    }
    if (seg[1] === 'posts' && seg[2] && M === 'POST') {
      const { action, note } = await body();
      const r = await env.DB.prepare('SELECT * FROM posts WHERE id = ?1').bind(seg[2]).first(); if (!r) fail(404, 'Not found');
      if (action === 'approve') {
        let articleId = null;
        if (r.track === 'evidara') {
          const yr = new Date().getFullYear();
          const n = (await env.DB.prepare('SELECT COUNT(*) n FROM posts WHERE article_id LIKE ?1').bind(`EVD-${yr}-%`).first()).n || 0;
          articleId = `EVD-${yr}-${String(n + 1).padStart(5, '0')}`;
        }
        await env.DB.prepare(`UPDATE posts SET status = 'published', article_id = COALESCE(article_id, ?2), published_at = ?3, note = NULL WHERE id = ?1`).bind(r.id, articleId, now()).run();
        return { ok: true, articleId };
      }
      await env.DB.prepare(`UPDATE posts SET status = 'rejected', note = ?2 WHERE id = ?1`).bind(r.id, clip(note, 500)).run();
      return { ok: true };
    }
    fail(404, 'Not found');
  }

  // discussion
  if (seg[0] === 'threads' && seg[1]) {
    const thread = clip(seg[1], 200);
    if (M === 'GET') {
      const rows = (await env.DB.prepare(`SELECT c.id, c.parent, c.kind, c.to_authors AS toAuthors, c.text, c.created_at AS at, c.user_id, p.name, p.member_id AS memberId, p.verified
        FROM comments c LEFT JOIN profiles p ON p.user_id = c.user_id WHERE c.thread = ?1 AND c.deleted = 0 ORDER BY c.created_at LIMIT 500`).bind(thread).all()).results;
      return { comments: rows.map(r => ({ ...r, mine: !!u && r.user_id === u.id, user_id: undefined })) };
    }
    if (M === 'POST') {
      need(u, 'verified');
      await rate(env, 'cmt:' + u.id, 60);
      const b = await body(20000);
      const text = clip(b.text, 4000).trim();
      if (!text) fail(400, 'Empty message');
      if (screenText(text)) fail(400, 'Looks like patient details (ID, phone, date of birth). Remove them before posting.');
      const id = uid();
      await env.DB.prepare('INSERT INTO comments (id, thread, user_id, parent, kind, to_authors, text, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
        .bind(id, thread, u.id, b.parent ? clip(b.parent, 40) : null, ['question', 'issue', 'gap', 'comment'].includes(b.kind) ? b.kind : 'comment', b.toAuthors ? 1 : 0, text, now()).run();
      return { id };
    }
  }
  if (seg[0] === 'comments' && seg[1] && M === 'DELETE') {
    need(u);
    const c = await env.DB.prepare('SELECT user_id FROM comments WHERE id = ?1').bind(seg[1]).first(); if (!c) fail(404, 'Not found');
    if (c.user_id !== u.id && !u.admin) fail(403, 'Not yours');
    await env.DB.prepare('UPDATE comments SET deleted = 1 WHERE id = ?1 OR parent = ?1').bind(seg[1]).run();
    return { ok: true };
  }

  // likes
  if (p === '/likes' && M === 'GET') {
    const keys = (url.searchParams.get('keys') || '').split(',').map(k => k.trim()).filter(Boolean).slice(0, 60);
    if (!keys.length) return { counts: {}, mine: [] };
    const ph = keys.map((_, i) => `?${i + 1}`).join(',');
    const counts = Object.fromEntries((await env.DB.prepare(`SELECT key, COUNT(*) n FROM likes WHERE key IN (${ph}) GROUP BY key`).bind(...keys).all()).results.map(r => [r.key, r.n]));
    const mine = u ? (await env.DB.prepare(`SELECT key FROM likes WHERE user_id = ?${keys.length + 1} AND key IN (${ph})`).bind(...keys, u.id).all()).results.map(r => r.key) : [];
    return { counts, mine };
  }
  if (p === '/likes/top' && M === 'GET') {
    const days = Math.min(90, Number(url.searchParams.get('days') || 7)); const since = new Date(Date.now() - days * 864e5).toISOString();
    return { top: (await env.DB.prepare('SELECT key, COUNT(*) n FROM likes WHERE created_at >= ?1 GROUP BY key ORDER BY n DESC, MAX(created_at) DESC LIMIT 40').bind(since).all()).results };
  }
  if (p === '/likes/mine' && M === 'GET') { need(u); return { keys: (await env.DB.prepare('SELECT key FROM likes WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 200').bind(u.id).all()).results.map(r => r.key) }; }
  if (seg[0] === 'likes' && seg[1] && M === 'POST') {
    need(u); await rate(env, 'like:' + u.id, 500);
    const key = clip(seg[1], 200);
    const had = await env.DB.prepare('SELECT 1 FROM likes WHERE key = ?1 AND user_id = ?2').bind(key, u.id).first();
    if (had) await env.DB.prepare('DELETE FROM likes WHERE key = ?1 AND user_id = ?2').bind(key, u.id).run();
    else await env.DB.prepare('INSERT INTO likes (key, user_id, created_at) VALUES (?1, ?2, ?3)').bind(key, u.id, now()).run();
    const n = (await env.DB.prepare('SELECT COUNT(*) n FROM likes WHERE key = ?1').bind(key).first()).n;
    return { liked: !had, count: n };
  }

  // follows
  if (p === '/follows' && M === 'GET') { need(u); return { follows: (await env.DB.prepare('SELECT target, name FROM follows WHERE user_id = ?1').bind(u.id).all()).results }; }
  if (seg[0] === 'follows' && seg[1] && M === 'POST') {
    need(u); const target = clip(seg[1], 120); const { name } = await body();
    const had = await env.DB.prepare('SELECT 1 FROM follows WHERE user_id = ?1 AND target = ?2').bind(u.id, target).first();
    if (had) await env.DB.prepare('DELETE FROM follows WHERE user_id = ?1 AND target = ?2').bind(u.id, target).run();
    else await env.DB.prepare('INSERT INTO follows (user_id, target, name, created_at) VALUES (?1, ?2, ?3, ?4)').bind(u.id, target, clip(name, 120), now()).run();
    return { following: !had };
  }

  // library sync
  if (p === '/library' && M === 'GET') { need(u); const r = await env.DB.prepare('SELECT data, updated_at FROM library WHERE user_id = ?1').bind(u.id).first(); return { items: r ? JSON.parse(r.data) : [], updatedAt: r?.updated_at || null }; }
  if (p === '/library' && M === 'PUT') {
    need(u); const b = await body(1.5e6);
    const items = Array.isArray(b.items) ? b.items.slice(0, 1000) : [];
    await env.DB.prepare('INSERT INTO library (user_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = ?3').bind(u.id, JSON.stringify(items), now()).run();
    return { ok: true, count: items.length };
  }

  // shared article videos
  if (seg[0] === 'videos' && seg[1] && M === 'GET' && seg[1] !== 'id') {
    const rows = (await env.DB.prepare(`SELECT v.id, v.name, v.size, v.mime, v.created_at AS at, v.r2_key, p.name AS byName, p.member_id AS memberId, v.user_id
      FROM videos v LEFT JOIN profiles p ON p.user_id = v.user_id WHERE v.paper_key = ?1 AND v.removed = 0 ORDER BY v.created_at DESC LIMIT 50`).bind(clip(seg[1], 200)).all()).results;
    return { videos: rows.map(r => ({ id: r.id, name: r.name, size: r.size, mime: r.mime, at: r.at, byName: r.byName, memberId: r.memberId, url: `${pubBase}/files/${r.r2_key}`, mine: !!u && u.id === r.user_id })) };
  }
  if (seg[0] === 'videos' && seg[1] && M === 'POST') {
    need(u, 'verified');
    if (!env.FILES) fail(503, 'Video sharing turns on when Evidara file storage (R2) is enabled. It is coming soon.');
    await rate(env, 'video:' + u.id, 20);
    const type = (req.headers.get('Content-Type') || '').split(';')[0];
    if (!/^video\/(mp4|webm|quicktime)$/.test(type)) fail(415, 'Upload an MP4, WebM or MOV video');
    const len = Number(req.headers.get('Content-Length') || 0);
    if (len > 95 * 1048576) fail(413, 'Videos must be under 95 MB');
    const id = uid(); const key = `pub/videos/${id}`;
    await env.FILES.put(key, req.body, { httpMetadata: { contentType: type } });
    const name = clip(url.searchParams.get('name') || 'video', 160);
    await env.DB.prepare('INSERT INTO videos (id, paper_key, user_id, r2_key, name, size, mime, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)').bind(id, clip(seg[1], 200), u.id, key, name, len, type, now()).run();
    return { id, url: `${pubBase}/files/${key}` };
  }
  if (seg[0] === 'videos' && seg[1] === 'id' && seg[2] && M === 'DELETE') {
    need(u); const v = await env.DB.prepare('SELECT user_id FROM videos WHERE id = ?1').bind(seg[2]).first(); if (!v) fail(404, 'Not found');
    if (v.user_id !== u.id && !u.admin) fail(403, 'Not yours');
    await env.DB.prepare('UPDATE videos SET removed = 1 WHERE id = ?1').bind(seg[2]).run(); return { ok: true };
  }

  // public files
  if (seg[0] === 'files' && M === 'GET') {
    const key = seg.slice(1).join('/');
    if (!key.startsWith('pub/')) fail(404, 'Not found');
    const range = req.headers.get('Range');
    const obj = await getFile(env, key, req);
    if (!obj) fail(404, 'Not found');
    const h = new Headers({ 'Content-Type': obj.mime || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': env.FILES ? 'bytes' : 'none', 'X-Content-Type-Options': 'nosniff' });
    if (range && obj.range) { h.set('Content-Range', `bytes ${obj.range.offset}-${obj.range.offset + obj.range.length - 1}/${obj.size}`); h.set('Content-Length', String(obj.range.length)); return new Response(obj.body, { status: 206, headers: h }); }
    h.set('Content-Length', String(obj.size));
    return new Response(obj.body, { headers: h });
  }

  // ---------- private chat ----------
  // People are addressed by Evidara ID (member_id) or 'admin'. A chat opens after the other person accepts a request,
  // or straight away if they allow direct messages. Admins can message anyone and anyone can message an admin.
  // Admins do not read other members' chats; a member can report a conversation, which shares it with the admins.
  const pairOf = (a, b) => [a, b].sort().join(':');
  const targetUser = async ref => {
    if (ref === 'admin') { const a = await env.DB.prepare(`SELECT u.id, u.name, u.role, p.member_id, p.name AS pname, p.verified FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.role = 'admin' ORDER BY u.created_at LIMIT 1`).first(); return a ? { ...a, admin: true } : null; }
    const r = await env.DB.prepare(`SELECT u.id, u.name, u.role, p.member_id, p.name AS pname, p.verified, p.role_title, p.institution, p.domain, p.orcid FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.member_id = ?1`).bind(clip(ref, 20)).first();
    return r ? { ...r, admin: r.role === 'admin' } : null;
  };
  const privacyOf = async uid2 => { const r = await env.DB.prepare('SELECT dm_policy, contact FROM privacy WHERE user_id = ?1').bind(uid2).first(); return { dm: r?.dm_policy || 'request', contact: JSON.parse(r?.contact || '{}') }; };
  const connBetween = async (a, b) => env.DB.prepare('SELECT * FROM connections WHERE (from_user = ?1 AND to_user = ?2) OR (from_user = ?2 AND to_user = ?1) ORDER BY created_at DESC LIMIT 1').bind(a, b).first();
  const relation = async (me, other) => {
    if (!me) return { state: 'signed-out', canMessage: false };
    if (me.id === other.id) return { state: 'self', canMessage: false };
    if (me.admin || other.admin) return { state: 'open', canMessage: true, reason: 'admin' };
    const c = await connBetween(me.id, other.id);
    if (c?.status === 'blocked') return { state: 'blocked', canMessage: false, byMe: c.to_user === me.id };
    if (c?.status === 'accepted') return { state: 'connected', canMessage: true, connId: c.id };
    const pv = await privacyOf(other.id);
    if (pv.dm === 'open' && me.verified && other.verified) return { state: 'open', canMessage: true, reason: 'open' };
    if (c?.status === 'pending') return { state: c.from_user === me.id ? 'requested' : 'incoming', canMessage: false, connId: c.id };
    if (c?.status === 'declined' && c.from_user === me.id) return { state: 'declined', canMessage: false };
    return { state: pv.dm === 'closed' ? 'closed' : 'none', canMessage: false };
  };
  const visibleContact = (contact, rel, isAdminViewer) => {
    const out = {};
    for (const [k, v] of Object.entries(contact || {})) {
      if (!v?.value) continue;
      const vis = v.vis || 'private';
      if (isAdminViewer || vis === 'members' || (vis === 'connections' && ['connected', 'open'].includes(rel.state) && rel.reason !== 'open')) out[k] = v.value;
    }
    return out;
  };

  if (p === '/me/privacy' && M === 'GET') { need(u); return await privacyOf(u.id); }
  if (p === '/me/privacy' && M === 'PUT') {
    need(u); const b = await body(20000);
    const dm = ['request', 'open', 'closed'].includes(b.dm) ? b.dm : 'request';
    const contact = {};
    for (const k of ['email', 'phone', 'website', 'linkedin', 'other']) {
      const v = b.contact?.[k]; if (!v?.value) continue;
      contact[k] = { value: clip(String(v.value).trim(), 200), vis: ['members', 'connections', 'private'].includes(v.vis) ? v.vis : 'connections' };
    }
    await env.DB.prepare('INSERT INTO privacy (user_id, dm_policy, contact, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id) DO UPDATE SET dm_policy = ?2, contact = ?3, updated_at = ?4').bind(u.id, dm, JSON.stringify(contact), now()).run();
    return { dm, contact };
  }
  if (seg[0] === 'people' && seg[1] && M === 'GET') {
    const t = await targetUser(seg[1]); if (!t || (!t.verified && !t.admin)) fail(404, 'Member not found');
    const rel = await relation(u, t);
    const pv = await privacyOf(t.id);
    return { member: { id: t.member_id || 'admin', name: t.pname || t.name || 'Evidara admin', role: t.admin ? 'Evidara admin' : t.role_title, institution: t.institution, domain: t.domain, orcid: t.orcid, verified: !!t.verified, admin: !!t.admin, dmPolicy: pv.dm },
      relation: rel, contact: u ? visibleContact(pv.contact, rel, u.admin) : {} };
  }
  if (seg[0] === 'connections' && seg[1] && !seg[2] && M === 'POST') {
    need(u, 'verified'); await rate(env, 'conn:' + u.id, 40);
    const t = await targetUser(seg[1]); if (!t || (!t.verified && !t.admin)) fail(404, 'Member not found');
    if (t.id === u.id) fail(400, 'That is you');
    const rel = await relation(u, t);
    if (rel.canMessage) return { state: rel.state };
    if (rel.state === 'blocked') fail(403, 'You cannot contact this member');
    if (rel.state === 'closed') fail(403, 'This member is not accepting chat requests');
    if (rel.state === 'requested') return { state: 'requested' };
    const { note } = await body(4000);
    if (screenText(note)) fail(400, 'Remove patient-identifying details from your note');
    if (rel.state === 'incoming') { await env.DB.prepare(`UPDATE connections SET status = 'accepted', decided_at = ?2 WHERE id = ?1`).bind(rel.connId, now()).run(); return { state: 'connected' }; }
    await env.DB.prepare(`INSERT INTO connections (id, from_user, to_user, status, note, created_at) VALUES (?1, ?2, ?3, 'pending', ?4, ?5)
      ON CONFLICT(from_user, to_user) DO UPDATE SET status = 'pending', note = ?4, created_at = ?5, decided_at = NULL`).bind(uid(), u.id, t.id, clip(note, 500), now()).run();
    return { state: 'requested' };
  }
  if (seg[0] === 'connections' && seg[1] && seg[2] && M === 'POST') {
    need(u);
    const c = await env.DB.prepare('SELECT * FROM connections WHERE id = ?1').bind(seg[1]).first(); if (!c) fail(404, 'Not found');
    const action = seg[2];
    if (action === 'withdraw') { if (c.from_user !== u.id) fail(403, 'Not yours'); await env.DB.prepare('DELETE FROM connections WHERE id = ?1').bind(c.id).run(); return { ok: true }; }
    if (c.to_user !== u.id && !(action === 'block' && c.from_user === u.id)) fail(403, 'Only the person asked can answer');
    if (action === 'accept') { if (!u.verified && !u.admin) fail(403, 'Only verified members can accept chats'); await env.DB.prepare(`UPDATE connections SET status = 'accepted', decided_at = ?2 WHERE id = ?1`).bind(c.id, now()).run(); }
    else if (action === 'decline') await env.DB.prepare(`UPDATE connections SET status = 'declined', decided_at = ?2 WHERE id = ?1`).bind(c.id, now()).run();
    else if (action === 'block') await env.DB.prepare(`UPDATE connections SET status = 'blocked', to_user = ?2, from_user = ?3, decided_at = ?4 WHERE id = ?1`).bind(c.id, u.id, c.from_user === u.id ? c.to_user : c.from_user, now()).run();
    else fail(400, 'Unknown action');
    return { ok: true };
  }
  if (p === '/connections' && M === 'GET') {
    need(u);
    const rows = (await env.DB.prepare(`SELECT c.id, c.status, c.note, c.created_at, c.from_user, c.to_user,
      pf.member_id AS fromId, COALESCE(pf.name, uf.name) AS fromName, pt.member_id AS toId, COALESCE(pt.name, ut.name) AS toName
      FROM connections c JOIN users uf ON uf.id = c.from_user JOIN users ut ON ut.id = c.to_user LEFT JOIN profiles pf ON pf.user_id = c.from_user LEFT JOIN profiles pt ON pt.user_id = c.to_user
      WHERE c.from_user = ?1 OR c.to_user = ?1 ORDER BY c.created_at DESC LIMIT 300`).bind(u.id).all()).results;
    return { incoming: rows.filter(r => r.to_user === u.id && r.status === 'pending').map(r => ({ id: r.id, memberId: r.fromId, name: r.fromName, note: r.note, at: r.created_at })),
      outgoing: rows.filter(r => r.from_user === u.id && ['pending', 'declined'].includes(r.status)).map(r => ({ id: r.id, memberId: r.toId, name: r.toName, status: r.status, at: r.created_at })),
      connected: rows.filter(r => r.status === 'accepted').map(r => r.from_user === u.id ? { id: r.id, memberId: r.toId, name: r.toName } : { id: r.id, memberId: r.fromId, name: r.fromName }),
      blocked: rows.filter(r => r.status === 'blocked' && r.to_user === u.id).map(r => ({ id: r.id, memberId: r.fromId, name: r.fromName })) };
  }
  if (p === '/chats' && M === 'GET') {
    need(u);
    const rows = (await env.DB.prepare(`SELECT m.pair, MAX(m.created_at) AS last_at,
        (SELECT text FROM messages m2 WHERE m2.pair = m.pair AND m2.deleted = 0 ORDER BY created_at DESC LIMIT 1) AS last_text,
        SUM(CASE WHEN m.sender != ?1 AND m.read_at IS NULL AND m.deleted = 0 THEN 1 ELSE 0 END) AS unread
      FROM messages m WHERE (m.pair LIKE ?2 OR m.pair LIKE ?3) GROUP BY m.pair ORDER BY last_at DESC LIMIT 100`).bind(u.id, u.id + ':%', '%:' + u.id).all()).results;
    const out = [];
    for (const r of rows) {
      const other = r.pair.split(':').find(x => x !== u.id);
      const o = await env.DB.prepare('SELECT u.name, u.role, p.member_id, p.name AS pname FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?1').bind(other).first();
      out.push({ with: o?.role === 'admin' && !o?.member_id ? 'admin' : (o?.member_id || 'admin'), name: o?.pname || o?.name || 'Member', admin: o?.role === 'admin', lastAt: r.last_at, last: clip(r.last_text, 120), unread: r.unread });
    }
    return { chats: out, unread: out.reduce((n, c) => n + c.unread, 0) };
  }
  if (seg[0] === 'chats' && seg[1] && !seg[2] && M === 'GET') {
    need(u);
    const t = await targetUser(seg[1]); if (!t) fail(404, 'Member not found');
    const rel = await relation(u, t);
    const pair = pairOf(u.id, t.id);
    const after = url.searchParams.get('after') || '';
    const has = await env.DB.prepare('SELECT 1 FROM messages WHERE pair = ?1 LIMIT 1').bind(pair).first();
    if (!rel.canMessage && !has) fail(403, 'Chat opens after the member accepts your request');
    const msgs = (await env.DB.prepare('SELECT id, sender, text, created_at AS at, read_at AS readAt FROM messages WHERE pair = ?1 AND deleted = 0 AND created_at > ?2 ORDER BY created_at LIMIT 300').bind(pair, after).all()).results
      .map(m => ({ id: m.id, mine: m.sender === u.id, text: m.text, at: m.at, read: !!m.readAt }));
    if (msgs.length) {
      const ph = msgs.map((_, i) => `?${i + 1}`).join(',');
      const atts = (await env.DB.prepare(`SELECT id, message_id, kind, name, src FROM msg_attach WHERE message_id IN (${ph})`).bind(...msgs.map(m => m.id)).all()).results;
      for (const m of msgs) m.attachments = atts.filter(a => a.message_id === m.id).map(a => a.kind === 'link' ? { kind: 'link', name: a.name, url: a.src }
        : a.kind === 'drive' ? { kind: 'drive', name: a.name, id: a.src.split('|')[0], mime: a.src.split('|')[1] || '' } : { kind: a.kind, name: a.name, url: `${pubBase}/mfile/${a.id}` });
    }
    await env.DB.prepare('UPDATE messages SET read_at = ?3 WHERE pair = ?1 AND sender != ?2 AND read_at IS NULL').bind(pair, u.id, now()).run();
    return { messages: msgs, relation: rel };
  }
  if (seg[0] === 'chats' && seg[1] && !seg[2] && M === 'POST') {
    need(u); await rate(env, 'msg:' + u.id, 600);
    const t = await targetUser(seg[1]); if (!t) fail(404, 'Member not found');
    const rel = await relation(u, t);
    if (!rel.canMessage) fail(403, rel.state === 'blocked' ? 'You cannot message this member' : 'Chat opens after the member accepts your request');
    const { text, attachments } = await body(9e6);
    const t2 = clip(text, 4000).trim();
    const att = Array.isArray(attachments) ? attachments.slice(0, 6) : [];
    if (!t2 && !att.length) fail(400, 'Empty message');
    if (screenText(t2)) fail(400, 'Looks like patient details (ID, phone, date of birth). Remove them before sending.');
    const OK_FILE = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)|vnd\.ms-(excel|powerpoint)))$/;
    const id = uid();
    const rows = [];
    for (const [i, a] of att.entries()) {
      if ((a.kind === 'image' || a.kind === 'file') && a.dataUrl) {
        const mime = (String(a.dataUrl).match(/^data:([^;]+);/) || [])[1] || '';
        if (!OK_FILE.test(mime)) fail(415, 'That file type cannot be sent. Use images, PDF, Office documents, TXT or CSV.');
        rows.push({ kind: mime.startsWith('image/') ? 'image' : 'file', name: clip(a.name, 160), src: await putDataUrl(env, `msg/${id}/${i}`, a.dataUrl, 1.9e6) });
      } else if (a.kind === 'drive' && /^[\w-]{10,120}$/.test(a.id || '')) rows.push({ kind: 'drive', name: clip(a.name, 160), src: a.id + '|' + clip(a.mime, 80) });
      else if (a.kind === 'link' && /^https?:\/\//.test(a.url || '')) rows.push({ kind: 'link', name: clip(a.name || a.url, 160), src: clip(a.url, 1000) });
    }
    await env.DB.prepare('INSERT INTO messages (id, pair, sender, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(id, pairOf(u.id, t.id), u.id, t2, now()).run();
    for (const r of rows) await env.DB.prepare('INSERT INTO msg_attach (id, message_id, kind, name, src, size) VALUES (?1,?2,?3,?4,?5,0)').bind(uid(), id, r.kind, r.name, r.src).run();
    return { id };
  }
  if (seg[0] === 'chats' && seg[1] && seg[2] === 'report' && M === 'POST') {
    need(u);
    const t = await targetUser(seg[1]); if (!t) fail(404, 'Member not found');
    const { reason } = await body(4000);
    await env.DB.prepare('INSERT INTO reports (id, reporter, pair, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(uid(), u.id, pairOf(u.id, t.id), clip(reason, 500), now()).run();
    return { ok: true };
  }
  if (seg[0] === 'messages' && seg[1] && M === 'DELETE') {
    need(u);
    const m = await env.DB.prepare('SELECT sender FROM messages WHERE id = ?1').bind(seg[1]).first(); if (!m) fail(404, 'Not found');
    if (m.sender !== u.id && !u.admin) fail(403, 'Not yours');
    await env.DB.prepare('UPDATE messages SET deleted = 1 WHERE id = ?1').bind(seg[1]).run(); return { ok: true };
  }

  // ---------- profile dashboard, member posts, EV marks ----------
  // ---------- LinkedIn-style sections + location ----------
  const cvClean = b => {
    const list = (arr, fields, max = 30) => (Array.isArray(arr) ? arr : []).slice(0, max).map(x => Object.fromEntries(fields.map(([k, n]) => [k, clip(x?.[k], n)]))).filter(x => Object.values(x).some(Boolean));
    return {
      experience: list(b.experience, [['title', 120], ['org', 160], ['place', 120], ['start', 20], ['end', 20], ['desc', 1500]]),
      education: list(b.education, [['school', 160], ['degree', 160], ['field', 120], ['start', 20], ['end', 20], ['desc', 800]]),
      certifications: list(b.certifications, [['name', 160], ['issuer', 160], ['date', 20], ['url', 300]]),
      achievements: list(b.achievements, [['title', 160], ['issuer', 160], ['date', 20], ['desc', 800]]),
      skills: (Array.isArray(b.skills) ? b.skills : []).slice(0, 50).map(s => clip(s, 60)).filter(Boolean),
      linkedin: /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?$/.test(b.linkedin || '') ? clip(b.linkedin, 200) : '',
    };
  };
  const roundLoc = l => {
    const lat = Number(l?.lat), lng = Number(l?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: Math.round(lat * 20) / 20, lng: Math.round(lng * 20) / 20, city: clip(l.city, 80), country: clip(l.country, 60), vis: ['members', 'connections', 'private'].includes(l.vis) ? l.vis : 'connections', at: now() };
  };
  const cvOf = async uid2 => { const r = await env.DB.prepare('SELECT * FROM profile_cv WHERE user_id = ?1').bind(uid2).first(); if (!r) return null; const j = k => JSON.parse(r[k] || '[]'); return { experience: j('experience'), education: j('education'), certifications: j('certifications'), achievements: j('achievements'), skills: j('skills'), linkedin: r.linkedin || '', location: r.location ? JSON.parse(r.location) : null }; };
  const canSeeLoc = async (viewer, ownerId, loc) => {
    if (!loc) return false;
    if (viewer && (viewer.id === ownerId || viewer.admin)) return true;
    if (loc.vis === 'members') return !!viewer;
    if (loc.vis === 'connections' && viewer) { const c = await env.DB.prepare(`SELECT 1 FROM connections WHERE status = 'accepted' AND ((from_user = ?1 AND to_user = ?2) OR (from_user = ?2 AND to_user = ?1))`).bind(viewer.id, ownerId).first(); return !!c; }
    return false;
  };

  if (p === '/me/cv' && M === 'GET') { need(u); return { cv: await cvOf(u.id) || cvClean({}) }; }
  if (p === '/me/cv' && M === 'PUT') {
    need(u); const b = await body(400000);
    const c = cvClean(b);
    if (screenText(JSON.stringify(c))) fail(400, 'Remove patient-identifying details');
    const cur = await cvOf(u.id);
    const loc = b.location === null ? null : b.location ? roundLoc(b.location) : cur?.location || null;
    await logHistory(u.id, cur ? { ...cur, location: cur.location ? `${cur.location.city || ''} (${cur.location.vis})` : null } : null, { ...c, location: loc ? `${loc.city || ''} (${loc.vis})` : null });
    await env.DB.prepare(`INSERT INTO profile_cv (user_id, experience, education, certifications, achievements, skills, linkedin, location, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
      ON CONFLICT(user_id) DO UPDATE SET experience=?2, education=?3, certifications=?4, achievements=?5, skills=?6, linkedin=?7, location=?8, updated_at=?9`)
      .bind(u.id, JSON.stringify(c.experience), JSON.stringify(c.education), JSON.stringify(c.certifications), JSON.stringify(c.achievements), JSON.stringify(c.skills), c.linkedin, loc ? JSON.stringify(loc) : null, now()).run();
    return { cv: { ...c, location: loc } };
  }
  if (p === '/map/members' && M === 'GET') {
    // Members who shared a location the viewer is allowed to see, plus lines to the viewer's accepted connections.
    const rows = (await env.DB.prepare(`SELECT c.user_id, c.location, p.member_id, p.name, p.role_title, p.domain, p.verified, x.avatar FROM profile_cv c JOIN profiles p ON p.user_id = c.user_id LEFT JOIN profile_ext x ON x.user_id = c.user_id WHERE c.location IS NOT NULL AND p.verified = 1 LIMIT 2000`).all()).results;
    const conns = u ? new Set((await env.DB.prepare(`SELECT CASE WHEN from_user = ?1 THEN to_user ELSE from_user END AS other FROM connections WHERE status = 'accepted' AND (from_user = ?1 OR to_user = ?1)`).bind(u.id).all()).results.map(r => r.other)) : new Set();
    const pts = [];
    for (const r of rows) {
      const loc = JSON.parse(r.location);
      const mine = u && r.user_id === u.id;
      const visible = mine || (u && u.admin) || (loc.vis === 'members' && u) || (loc.vis === 'connections' && conns.has(r.user_id));
      if (!visible) continue;
      pts.push({ id: r.member_id, name: r.name, role: r.role_title, domain: r.domain, avatar: r.avatar || null, lat: loc.lat, lng: loc.lng, city: loc.city, country: loc.country, me: !!mine, connected: conns.has(r.user_id) });
    }
    return { points: pts, signedIn: !!u, total: rows.length };
  }

  if (p === '/me/ext' && M === 'GET') { need(u); return { ext: await env.DB.prepare('SELECT * FROM profile_ext WHERE user_id = ?1').bind(u.id).first() || {} }; }
  if (p === '/me/ext' && M === 'PUT') {
    need(u); const b = await body(2.5e6);
    for (const t of [b.headline, JSON.stringify(b.highlights || [])]) if (screenText(t)) fail(400, 'Remove patient-identifying details');
    const cur = await env.DB.prepare('SELECT * FROM profile_ext WHERE user_id = ?1').bind(u.id).first();
    let avatar = cur?.avatar || null;
    if (b.avatar?.dataUrl) avatar = `${pubBase}/files/${await putDataUrl(env, `pub/avatars/${u.id}-${uid().slice(0, 6)}`, b.avatar.dataUrl, 1.2e6)}`;
    else if (b.avatar?.drive && DRIVE_ID.test(b.avatar.drive)) avatar = `drive:${b.avatar.drive}`;
    else if (b.avatar === null) avatar = null;
    const website = b.website ? clip(String(b.website).trim(), 300) : '';
    if (website && !/^https?:\/\//.test(website)) fail(400, 'Website must start with https://');
    const niche = JSON.stringify((b.niche || []).slice(0, 12).map(x => clip(x, 40)));
    const highlights = JSON.stringify((b.highlights || []).slice(0, 10).map(x => ({ title: clip(x.title, 24), text: clip(x.text, 800) })).filter(x => x.title));
    const next = { avatar, headline: clip(b.headline, 160), website, niche, highlights };
    await logHistory(u.id, cur, next);
    await env.DB.prepare(`INSERT INTO profile_ext (user_id, avatar, headline, website, niche, highlights, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)
      ON CONFLICT(user_id) DO UPDATE SET avatar=?2, headline=?3, website=?4, niche=?5, highlights=?6, updated_at=?7`).bind(u.id, avatar, next.headline, website, niche, highlights, now()).run();
    return { ext: { ...next, niche: JSON.parse(niche), highlights: JSON.parse(highlights) } };
  }
  if (seg[0] === 'u' && seg[1] && M === 'GET') {
    const t = await targetUser(seg[1]); if (!t || (!t.verified && !t.admin)) fail(404, 'Member not found');
    const prof = await env.DB.prepare('SELECT * FROM profiles WHERE user_id = ?1').bind(t.id).first() || {};
    const ext = await env.DB.prepare('SELECT * FROM profile_ext WHERE user_id = ?1').bind(t.id).first() || {};
    const mid = prof.member_id || 'admin';
    const n = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).first())?.n || 0;
    const kinds = Object.fromEntries((await env.DB.prepare('SELECT kind, COUNT(*) n FROM mposts WHERE user_id = ?1 AND deleted = 0 GROUP BY kind').bind(t.id).all()).results.map(r => [r.kind, r.n]));
    const pubs = (await env.DB.prepare(`SELECT id, title, article_id, published_at FROM posts WHERE user_id = ?1 AND status = 'published' ORDER BY published_at DESC LIMIT 50`).bind(t.id).all()).results;
    const posts = (await env.DB.prepare(`SELECT ${POST_COLS} ${POST_JOIN} WHERE m.user_id = ?1 AND m.deleted = 0 ORDER BY m.created_at DESC LIMIT 60`).bind(t.id).all()).results;
    const ev = await evSet([...posts.map(r => 'mp:' + r.id), ...pubs.map(r => 'post:' + r.id)]);
    return {
      profile: { id: mid, name: prof.name || t.name, role: t.admin && !prof.role_title ? 'Evidara admin' : prof.role_title, institution: prof.institution, domain: prof.domain, orcid: prof.orcid, bio: prof.bio,
        verified: !!prof.verified, admin: !!t.admin, avatar: ext.avatar || null, headline: ext.headline || '', website: ext.website || '', niche: JSON.parse(ext.niche || '[]'), highlights: JSON.parse(ext.highlights || '[]') },
      stats: { posts: Object.values(kinds).reduce((a, b) => a + b, 0), kinds, publications: pubs.length, followers: await n('SELECT COUNT(*) n FROM follows WHERE target = ?1', 'm:' + mid),
        following: await n('SELECT COUNT(*) n FROM follows WHERE user_id = ?1', t.id), evStars: ev.size },
      viewer: { me: !!u && u.id === t.id, following: u ? !!(await env.DB.prepare('SELECT 1 FROM follows WHERE user_id = ?1 AND target = ?2').bind(u.id, 'm:' + mid).first()) : false },
      publications: pubs.map(r => ({ id: r.id, title: r.title, articleId: r.article_id, at: r.published_at, ev: ev.has('post:' + r.id) })),
      cv: await (async () => { const c = await cvOf(t.id); if (!c) return null; if (!(await canSeeLoc(u, t.id, c.location))) c.location = null; else if (c.location && !(u && (u.id === t.id || u.admin))) c.location = { city: c.location.city, country: c.location.country }; return c; })(),
      posts: posts.map(r => postOut(r, ev)),
    };
  }
  if (p === '/mposts/feed' && M === 'GET') {
    const lim = Math.min(60, Number(url.searchParams.get('limit') || 30)); const before = url.searchParams.get('before') || '9999';
    const rows = (await env.DB.prepare(`SELECT ${POST_COLS} ${POST_JOIN} WHERE m.deleted = 0 AND m.created_at < ?2 ORDER BY m.created_at DESC LIMIT ?1`).bind(lim, before).all()).results;
    const ev = await evSet(rows.map(r => 'mp:' + r.id));
    return { posts: rows.map(r => postOut(r, ev)) };
  }
  if (seg[0] === 'mposts' && seg[1] && seg[1] !== 'feed' && M === 'GET') {
    const r = await env.DB.prepare(`SELECT ${POST_COLS} ${POST_JOIN} WHERE m.id = ?1 AND m.deleted = 0`).bind(seg[1]).first(); if (!r) fail(404, 'Post not found');
    return { post: postOut(r, await evSet(['mp:' + r.id])) };
  }
  if (p === '/mposts' && M === 'POST') {
    need(u, 'verified'); await rate(env, 'mpost:' + u.id, 40);
    const b = await body(16e6);
    const kind = ['image', 'reel', 'thought', 'review'].includes(b.kind) ? b.kind : 'thought';
    const caption = clip(b.caption, 2200).trim();
    if (screenText(caption) || screenText(b.paperTitle)) fail(400, 'Possible patient identifiers found. Remove them before posting.');
    if (!b.noPatients) fail(400, 'Confirm that no patient can be identified in this post');
    const id = uid();
    const media = await normMedia(b.media, `pub/mposts/${id}`);
    if (kind === 'image' && !media.length) fail(400, 'Add at least one image');
    if (kind === 'reel' && !media.some(m => m.type === 'youtube' || (m.type === 'drive' && /^video\//.test(m.mime)))) fail(400, 'Add a video (YouTube link or a video from your Google Drive)');
    if (kind === 'thought' && !caption) fail(400, 'Write your thought');
    if (kind === 'review' && (!b.paperKey || !caption)) fail(400, 'Pick a study and write your review');
    const rating = kind === 'review' ? Math.max(1, Math.min(5, Number(b.rating) || 0)) || null : null;
    const music = normMusic(b.music);
    const tags = JSON.stringify((b.tags || []).slice(0, 10).map(t => clip(String(t).replace(/^#/, ''), 40)).filter(Boolean));
    await env.DB.prepare('INSERT INTO mposts (id, user_id, kind, caption, media, paper_key, paper_title, rating, music, tags, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)')
      .bind(id, u.id, kind, caption, JSON.stringify(media), clip(b.paperKey, 200) || null, clip(b.paperTitle, 400) || null, rating, music ? JSON.stringify(music) : null, tags, now()).run();
    return { id };
  }
  if (seg[0] === 'mposts' && seg[1] && M === 'DELETE') {
    need(u); const r = await env.DB.prepare('SELECT user_id FROM mposts WHERE id = ?1').bind(seg[1]).first(); if (!r) fail(404, 'Not found');
    if (r.user_id !== u.id && !u.admin) fail(403, 'Not yours');
    await env.DB.prepare('UPDATE mposts SET deleted = 1 WHERE id = ?1').bind(seg[1]).run(); return { ok: true };
  }
  if (p === '/ev' && M === 'GET') { const ts = (url.searchParams.get('targets') || '').split(',').filter(Boolean).slice(0, 80); return { ev: [...await evSet(ts)] }; }

  // private message attachments: only the two people in the conversation can open them
  if (seg[0] === 'mfile' && seg[1] && M === 'GET') {
    need(u);
    const a = await env.DB.prepare('SELECT a.src, a.name, m.pair FROM msg_attach a JOIN messages m ON m.id = a.message_id WHERE a.id = ?1').bind(seg[1]).first();
    if (!a || (!a.pair.split(':').includes(u.id) && !u.admin)) fail(404, 'Not found');
    const f = await getFile(env, a.src); if (!f) fail(404, 'Not found');
    return new Response(f.body, { headers: { 'Content-Type': f.mime || 'application/octet-stream', 'Content-Disposition': `inline; filename="${String(a.name || 'file').replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }

  // AI image
  if (p === '/image' && M === 'POST') {
    const b = await body(10000);
    const prompt = clip(b.prompt, 2000).trim();
    if (prompt.length < 20) fail(400, 'Prompt too short');
    if (BLOCK.test(prompt.split(/strictly no|no text,/i)[0])) fail(400, 'This prompt is not allowed on Evidara');
    const day = now().slice(0, 10);
    const who = u ? 'u:' + u.id : 'c:' + clip(req.headers.get('X-Evidara-Client') || 'anon', 80);
    const perUser = Number(u ? env.DAILY_PER_USER || 20 : env.DAILY_PER_CLIENT || 5);
    const n = await bump(env.DB, day, 'ai:' + who, perUser); if (n === null) fail(429, `Daily limit of ${perUser} AI images reached. It refreshes at 05:30 IST.${u ? '' : ' Sign in for more.'}`);
    if (await bump(env.DB, day, 'ai:ip:' + (req.headers.get('CF-Connecting-IP') || 'local'), Number(env.DAILY_PER_IP || 40)) === null) fail(429, 'Daily image limit reached for this network.');
    if (await bump(env.DB, day, 'ai:global', Number(env.DAILY_GLOBAL || 400)) === null) fail(429, 'Evidara has used today\'s free image budget. It refreshes at 05:30 IST.');
    if (env.MOCK_AI === '1') return { image: MOCK_PNG, mime: 'image/png', model: 'mock (local test)', left: perUser - n };
    try {
      const out = await env.AI.run(MODEL, { prompt, steps: Number(env.STEPS || 6) });
      if (!out?.image) throw new Error('none');
      return { image: out.image, mime: 'image/jpeg', model: 'FLUX.1 schnell (Workers AI)', left: perUser - n };
    } catch { fail(502, 'The image model is busy. Try again in a moment.'); }
  }
  fail(404, 'Not found');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    const okOrigin = allowed.includes(origin) ? origin : '';
    const isFile = url.pathname.startsWith('/files/');
    if (req.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: corsHeaders(okOrigin) });
    // Browsers send Origin on cross-site API calls; refuse unknown sites (files are public and may be embedded anywhere).
    if (origin && !okOrigin && !isFile) return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    try {
      const u = await sessionUser(env, req);
      const out = await route(req, env, url, u);
      if (out instanceof Response) { const r = new Response(out.body, out); for (const [k, v] of Object.entries(corsHeaders(okOrigin || '*'))) r.headers.set(k, v); return r; }
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(okOrigin) } });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      return new Response(JSON.stringify({ error: e instanceof HttpError ? e.message : 'Server error' }), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(okOrigin) } });
    }
  },
};

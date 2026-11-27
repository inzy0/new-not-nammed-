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

// ---------- files (R2) ----------
async function putDataUrl(env, key, dataUrl, maxBytes) {
  const m = String(dataUrl || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m) fail(400, 'Bad file data');
  const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  if (bin.length > maxBytes) fail(413, 'File too large');
  await env.FILES.put(key, bin, { httpMetadata: { contentType: m[1] } });
  return key;
}

// ---------- handlers ----------
async function route(req, env, url, u) {
  const p = url.pathname, M = req.method;
  const pubBase = (env.PUBLIC_URL || url.origin).replace(/\/$/, '');
  const body = async (max = 2e6) => { const t = await req.text(); if (t.length > max) fail(413, 'Request too large'); try { return JSON.parse(t || '{}'); } catch { fail(400, 'Bad JSON'); } };
  const seg = p.split('/').filter(Boolean).map(decodeURIComponent);

  if (p === '/health') return { ok: true, time: now(), ai: !!env.AI || env.MOCK_AI === '1', google: !!env.GOOGLE_CLIENT_ID };

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
    const rows = (await env.DB.prepare(`SELECT data, article_id, published_at FROM posts WHERE status = 'published' ${d ? 'AND domain = ?2' : ''} ORDER BY published_at DESC LIMIT ?1`).bind(lim, ...(d ? [d] : [])).all()).results;
    return { posts: rows.map(r => ({ ...JSON.parse(r.data), articleId: r.article_id || undefined, publishedAt: r.published_at, status: 'published' })) };
  }
  if (p === '/posts/mine' && M === 'GET') { need(u); const rows = (await env.DB.prepare('SELECT id, title, status, note, article_id, created_at, published_at FROM posts WHERE user_id = ?1 ORDER BY created_at DESC').bind(u.id).all()).results; return { posts: rows }; }
  if (seg[0] === 'posts' && seg[1] && M === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM posts WHERE id = ?1').bind(seg[1]).first();
    if (!r || (r.status !== 'published' && !(u && (u.admin || u.id === r.user_id)))) fail(404, 'Post not found');
    return { post: { ...JSON.parse(r.data), articleId: r.article_id || undefined, publishedAt: r.published_at, status: r.status, note: r.note } };
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
        pendingVerifications: await one(`SELECT COUNT(*) n FROM verifications WHERE status = 'pending'`), pendingPosts: await one(`SELECT COUNT(*) n FROM posts WHERE status = 'submitted'`), comments: await one('SELECT COUNT(*) n FROM comments WHERE deleted = 0'), videos: await one('SELECT COUNT(*) n FROM videos WHERE removed = 0') };
    }
    if (p === '/admin/file' && M === 'GET') {
      const key = url.searchParams.get('key') || '';
      if (!key.startsWith('priv/')) fail(400, 'Bad key');
      const obj = await env.FILES.get(key); if (!obj) fail(404, 'Not found');
      return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, no-store' } });
    }
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
    need(u, 'verified'); await rate(env, 'video:' + u.id, 20);
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
    const obj = await env.FILES.get(key, range ? { range: req.headers } : undefined);
    if (!obj) fail(404, 'Not found');
    const h = new Headers({ 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' });
    if (range && obj.range) { h.set('Content-Range', `bytes ${obj.range.offset}-${obj.range.offset + obj.range.length - 1}/${obj.size}`); h.set('Content-Length', String(obj.range.length)); return new Response(obj.body, { status: 206, headers: h }); }
    h.set('Content-Length', String(obj.size));
    return new Response(obj.body, { headers: h });
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

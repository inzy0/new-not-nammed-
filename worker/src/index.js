// Evidara AI Worker (Cloudflare Workers, free plan).
// POST /image {prompt, key} -> {image: base64, mime, model, left}
// Model: @cf/black-forest-labs/flux-1-schnell (Workers AI). Inputs per Cloudflare's schema: prompt (<=2048 chars), steps (<=8).
// Daily limits per browser client and per IP are stored in D1 (KV's free tier allows only 1,000 writes a day).
// Every image request is refused unless it comes from an allowed origin and passes the safety screen.

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const BLOCK = /\b(nude|naked|nsfw|sexual|porn|erotic|gore|corpse|dead body|mutilat|suicide|self-harm|weapon|gun|child abuse|patient photo|x-ray of a real patient|celebrity|real person|face of)\b/i;
const REQUIRED_NEGATIVE = 'no text, no letters, no numbers, no logos, no real people, no faces, no patients';

const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
const cors = origin => ({ 'Access-Control-Allow-Origin': origin || 'null', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Evidara-Client', 'Vary': 'Origin' });

async function bump(db, day, who, limit) {
  await db.prepare('INSERT INTO quota (day, who, n) VALUES (?1, ?2, 0) ON CONFLICT(day, who) DO NOTHING').bind(day, who).run();
  const row = await db.prepare('UPDATE quota SET n = n + 1 WHERE day = ?1 AND who = ?2 AND n < ?3 RETURNING n').bind(day, who, limit).first();
  return row ? row.n : null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    const okOrigin = allowed.includes(origin) ? origin : '';
    if (req.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: cors(okOrigin) });
    if (url.pathname === '/health') return json({ ok: true, model: MODEL }, 200, okOrigin);
    if (url.pathname !== '/image' || req.method !== 'POST') return json({ error: 'Not found' }, 404, okOrigin);
    if (!okOrigin) return json({ error: 'Origin not allowed' }, 403, '');

    let body; try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400, okOrigin); }
    const prompt = String(body.prompt || '').slice(0, 2000).trim();
    if (prompt.length < 20) return json({ error: 'Prompt too short' }, 400, okOrigin);
    const subject = prompt.split(/strictly no|no text,/i)[0]; // the site's own safety clause lists forbidden things; screen only the subject
    if (BLOCK.test(subject)) return json({ error: 'This prompt is not allowed on Evidara' }, 400, okOrigin);

    const day = new Date().toISOString().slice(0, 10);
    const client = (req.headers.get('X-Evidara-Client') || '').slice(0, 80) || 'anon';
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const perClient = Number(env.DAILY_PER_CLIENT || 10), perIp = Number(env.DAILY_PER_IP || 30), global = Number(env.DAILY_GLOBAL || 400);
    // Per-person first, so someone retrying after their own limit never burns the shared budget.
    const n = await bump(env.DB, day, 'c:' + client, perClient);
    if (n === null) return json({ error: `Daily limit of ${perClient} AI images reached. It refreshes at 05:30 IST.` }, 429, okOrigin);
    const ipN = await bump(env.DB, day, 'ip:' + ip, perIp);
    if (ipN === null) return json({ error: 'Daily image limit reached for this network. It refreshes at 05:30 IST.' }, 429, okOrigin);
    const g = await bump(env.DB, day, 'global', global);
    if (g === null) return json({ error: 'Evidara has used today\'s free image budget. It refreshes at 05:30 IST.' }, 429, okOrigin);

    try {
      const out = await env.AI.run(MODEL, { prompt: prompt.includes('no text') ? prompt : `${prompt}. ${REQUIRED_NEGATIVE}`, steps: Number(env.STEPS || 6) });
      if (!out?.image) throw new Error('No image returned');
      return json({ image: out.image, mime: 'image/jpeg', model: 'FLUX.1 schnell (Workers AI)', left: perClient - n }, 200, okOrigin);
    } catch (e) {
      return json({ error: 'The image model is busy. Try again in a moment.' }, 502, okOrigin);
    }
  },
};

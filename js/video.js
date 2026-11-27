// Video abstract maker: renders slides on a canvas in the browser and records them to WebM.
// Free and unlimited (runs on the viewer's device). Text on slides comes from the paper record and its own sentences.

export function slidesFor(a, { finding, limitation, design, theme }) {
  const cite = `${a.authors[0]?.last || ''}${a.authors.length > 1 ? ' et al.' : ''} · ${a.journalAbbr || a.journal} · ${a.year}`;
  return [
    { kicker: design, big: a.title, small: cite },
    { kicker: 'What they found', big: finding || '(no result sentence found)', small: 'Read verbatim from the paper' },
    { kicker: 'Limitation the authors state', big: limitation || 'No explicit limitation statement in the text we can read.', small: 'Read verbatim from the paper' },
    { kicker: 'Source', big: a.doi ? `doi.org/${a.doi}` : (a.pmcid || `PMID ${a.pmid}`), small: `Licence ${a.license.toUpperCase() || 'none'} · made with Evidara` },
  ].map(s => ({ ...s, theme }));
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}

function fitText(ctx, text, maxW, maxH, font, start) {
  for (let size = start; size >= 22; size -= 2) {
    ctx.font = `800 ${size}px ${font}`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length * size * 1.15 <= maxH) return { size, lines };
  }
  ctx.font = `800 22px ${font}`; return { size: 22, lines: wrap(ctx, text, maxW).slice(0, 14) };
}

export function drawSlide(ctx, s, idx, total, t = 1) {
  const W = ctx.canvas.width, H = ctx.canvas.height, css = getComputedStyle(document.documentElement);
  const v = n => css.getPropertyValue(n).trim();
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, v('--accent-3') || '#3F567F'); g.addColorStop(.6, v('--deep') || '#412653'); g.addColorStop(1, '#1a1020');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // bloom petals
  const cols = [v('--petal-a'), v('--petal-b'), v('--petal-c')];
  ctx.save(); ctx.translate(W * .78, H * .18); ctx.rotate((idx * 0.5) + t * 0.15);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3); ctx.globalAlpha = .55;
    const pg = ctx.createRadialGradient(0, -120, 10, 0, -120, 200); pg.addColorStop(0, cols[i % 3]); pg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(0, -130, 90, 190, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore(); ctx.globalAlpha = 1;
  const disp = v('--font-display') || 'sans-serif', body = v('--font-body') || 'sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `600 30px ${body}`; ctx.fillText('EVIDARA', 70, 110);
  // ring numeral
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W - 160, H - 190, 90, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `600 84px ${disp}`; ctx.textAlign = 'center'; ctx.fillText(String(idx + 1).padStart(2, '0'), W - 160, H - 160);
  ctx.textAlign = 'left';
  ctx.fillStyle = v('--accent') || '#E0563F'; ctx.font = `700 34px ${body}`; ctx.fillText(s.kicker.toUpperCase(), 70, 360);
  ctx.fillStyle = '#fff';
  const { size, lines } = fitText(ctx, s.big, W - 140, H - 900, disp, 76);
  ctx.font = `800 ${size}px ${disp}`;
  lines.forEach((ln, i) => ctx.fillText(ln, 70, 440 + size + i * size * 1.15));
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `500 30px ${body}`;
  wrap(ctx, s.small, W - 400).forEach((ln, i) => ctx.fillText(ln, 70, H - 200 + i * 40));
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(70, H - 90, W - 140, 4);
  ctx.fillStyle = '#fff'; ctx.fillRect(70, H - 90, (W - 140) * ((idx + t) / total), 4);
}

export function canRecord() { return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream; }

export async function record(canvas, slides, secsPerSlide = 4) {
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4e6 } : {});
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => (rec.onstop = r));
  rec.start(250);
  const total = slides.length, t0 = performance.now(), dur = total * secsPerSlide * 1000;
  await new Promise(resolve => {
    const frame = () => {
      const el = performance.now() - t0;
      if (el >= dur) { drawSlide(ctx, slides[total - 1], total - 1, total, 1); resolve(); return; }
      const idx = Math.floor(el / (secsPerSlide * 1000));
      drawSlide(ctx, slides[idx], idx, total, (el % (secsPerSlide * 1000)) / (secsPerSlide * 1000));
      requestAnimationFrame(frame);
    };
    frame();
  });
  rec.stop(); await done;
  return new Blob(chunks, { type: 'video/webm' });
}

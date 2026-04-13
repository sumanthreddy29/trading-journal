import { fY } from './helpers.js';

const CC = {
  SURFACE: '#111827', BORDER: '#1f2d4a', TEXT: '#e2e8f0', MUTED: '#6b7fa3',
  GREEN: '#22c55e', RED: '#ef4444', BLUE: '#3b82f6',
};

function setupC(el, h) {
  if (!el) return null;
  const w = el.offsetWidth || 400, dpr = window.devicePixelRatio || 1;
  el.width = w * dpr; el.height = h * dpr;
  const ctx = el.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = CC.SURFACE; ctx.fillRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceTicks(mn, mx, count) {
  mn = Math.min(mn, 0); mx = Math.max(mx, 0);
  if (mn === mx) { mn -= 1; mx += 1; }
  const rng = mx - mn, rough = rng / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const norm = rough / mag;
  const niceSt = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  const step = niceSt * mag;
  const nMin = Math.floor(mn / step) * step, nMax = Math.ceil(mx / step) * step;
  const ticks = []; let v = nMin;
  while (v <= nMax + step * 1e-9) { ticks.push(Math.round(v * 1e8) / 1e8); v += step; }
  return { ticks, nMin, nMax };
}

function gridLines(ctx, PAD, cw, ch, ticks, nMin, nMax) {
  const rng = nMax - nMin || 1;
  const ty = v => PAD.t + ch - (v - nMin) / rng * ch;
  ticks.forEach(v => {
    const y = ty(v);
    ctx.strokeStyle = CC.BORDER; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cw, y); ctx.stroke();
    ctx.fillStyle = CC.MUTED; ctx.font = '10px system-ui'; ctx.textAlign = 'right';
    ctx.fillText(fY(v), PAD.l - 5, y + 3.5);
  });
}

function xLabels(ctx, labels, PAD, cw, h, step) {
  ctx.fillStyle = CC.MUTED; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
  const gap = cw / labels.length;
  labels.forEach((lbl, i) => {
    if (i % step === 0) {
      ctx.save();
      ctx.translate(PAD.l + i * gap + gap / 2, h - PAD.b + 14);
      ctx.rotate(-Math.PI / 5.5);
      ctx.fillText(lbl, 0, 0);
      ctx.restore();
    }
  });
}

function rrect(ctx, x, y, w, h, r) {
  if (w < 1 || h < 1) { ctx.beginPath(); ctx.rect(x, y, Math.max(1, w), Math.max(1, h)); return; }
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function showTip(id, e, lbl, v) {
  let tip = document.getElementById('tip' + id);
  if (!tip) {
    tip = document.createElement('div'); tip.id = 'tip' + id;
    tip.style.cssText = 'position:fixed;background:#1a2035;border:1px solid #1f2d4a;border-radius:8px;padding:8px 12px;font-size:11px;pointer-events:none;z-index:50;color:#e2e8f0';
    document.body.appendChild(tip);
  }
  const color = v >= 0 ? '#22c55e' : '#ef4444';
  const val   = (v >= 0 ? '+' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2 });
  // Build tooltip without innerHTML injection — use DOM nodes to avoid XSS
  tip.textContent = '';
  const b = document.createElement('b');
  b.textContent = lbl;
  const br = document.createElement('br');
  const sp = document.createElement('span');
  sp.style.color = color;
  sp.textContent = val;
  tip.append(b, br, sp);
  tip.style.left = (e.clientX + 12) + 'px';
  tip.style.top  = (e.clientY - 10) + 'px';
  tip.style.opacity = '1';
}

function removeTip(id) {
  const tip = document.getElementById('tip' + id);
  if (tip) tip.style.opacity = '0';
}

function addHover(el, id, labels, vals, PAD) {
  if (!el) return;
  el.onmousemove = e => {
    const rect = el.getBoundingClientRect(), mx = e.clientX - rect.left;
    const cw = el.offsetWidth - PAD.l - PAD.r;
    if (mx < PAD.l || mx > el.offsetWidth - PAD.r) { removeTip(id); return; }
    const idx = Math.min(vals.length - 1, Math.max(0, Math.floor((mx - PAD.l) / (cw / vals.length))));
    showTip(id, e, labels[idx], vals[idx]);
  };
  el.onmouseleave = () => removeTip(id);
}

// ── Public draw functions ─────────────────────────

export function drawLine(el, id, labels, vals, h = 240) {
  const r = setupC(el, h); if (!r) return;
  const { ctx, w, h: ht } = r;
  const PAD = { t: 22, r: 24, b: 46, l: 66 };
  const cw = w - PAD.l - PAD.r, ch = ht - PAD.t - PAD.b;
  const mn = Math.min(...vals, 0), mx = Math.max(...vals, 0);
  const { ticks, nMin, nMax } = niceTicks(mn, mx, 4);
  const rng = nMax - nMin || 1;
  const tx = i => PAD.l + i / (Math.max(vals.length - 1, 1)) * cw;
  const ty = v => PAD.t + ch - (v - nMin) / rng * ch;

  gridLines(ctx, PAD, cw, ch, ticks, nMin, nMax);
  if (mn < 0 && mx > 0) {
    ctx.strokeStyle = 'rgba(100,130,180,.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, ty(0)); ctx.lineTo(PAD.l + cw, ty(0)); ctx.stroke();
  }
  // Area fill
  ctx.beginPath(); ctx.moveTo(tx(0), ty(vals[0]));
  vals.forEach((v, i) => ctx.lineTo(tx(i), ty(v)));
  ctx.lineTo(tx(vals.length - 1), ht - PAD.b); ctx.lineTo(PAD.l, ht - PAD.b); ctx.closePath();
  ctx.fillStyle = 'rgba(59,130,246,.08)'; ctx.fill();
  // Line
  ctx.beginPath(); ctx.moveTo(tx(0), ty(vals[0]));
  vals.forEach((v, i) => ctx.lineTo(tx(i), ty(v)));
  ctx.strokeStyle = CC.BLUE; ctx.lineWidth = 2; ctx.stroke();
  // Dots
  vals.forEach((v, i) => {
    ctx.beginPath(); ctx.arc(tx(i), ty(v), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = v >= 0 ? CC.GREEN : CC.RED; ctx.fill();
  });
  // Last value label
  const lv = vals[vals.length - 1];
  ctx.fillStyle = lv >= 0 ? CC.GREEN : CC.RED; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'right';
  ctx.fillText((lv >= 0 ? '+' : '') + fY(lv), tx(vals.length - 1), ty(lv) - 8);

  xLabels(ctx, labels, PAD, cw, ht, Math.max(1, Math.ceil(labels.length / 18)));
  addHover(el, id, labels, vals, PAD);
}

export function drawBars(el, id, labels, vals, h = 220) {
  const r = setupC(el, h); if (!r) return;
  const { ctx, w, h: ht } = r;
  const PAD = { t: 20, r: 18, b: 46, l: 66 };
  const cw = w - PAD.l - PAD.r, ch = ht - PAD.t - PAD.b;
  const mn = Math.min(...vals, 0), mx = Math.max(...vals, 0);
  const { ticks, nMin, nMax } = niceTicks(mn, mx, 4);
  const rng = nMax - nMin || 1;
  const gap = cw / vals.length, bw = Math.max(2, gap * 0.72);
  const ty = v => PAD.t + ch - (v - nMin) / rng * ch;

  gridLines(ctx, PAD, cw, ch, ticks, nMin, nMax);
  ctx.strokeStyle = 'rgba(100,130,180,.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.l, ty(0)); ctx.lineTo(PAD.l + cw, ty(0)); ctx.stroke();

  vals.forEach((v, i) => {
    const x   = PAD.l + i * gap + gap / 2 - bw / 2;
    const top = ty(Math.max(v, 0));
    const bh  = Math.max(1, Math.abs(ty(Math.min(v, 0)) - ty(Math.max(v, 0))));
    ctx.fillStyle = v >= 0 ? CC.GREEN : CC.RED; ctx.globalAlpha = 0.85;
    rrect(ctx, x, top, bw, bh, 3); ctx.fill(); ctx.globalAlpha = 1;
  });

  xLabels(ctx, labels, PAD, cw, ht, Math.max(1, Math.ceil(labels.length / 18)));
  addHover(el, id, labels, vals, PAD);
}

export function drawMonthly(el, labels, vals, h = 180) {
  const r = setupC(el, h); if (!r) return;
  const { ctx, w, h: ht } = r;
  const PAD = { t: 30, r: 16, b: 28, l: 62 };
  const cw = w - PAD.l - PAD.r, ch = ht - PAD.t - PAD.b;
  const mn = Math.min(...vals, 0), mx = Math.max(...vals, 0);
  const { ticks, nMin, nMax } = niceTicks(mn, mx, 3);
  const rng = nMax - nMin || 1;
  const gap = cw / labels.length, bw = Math.min(gap * 0.6, 60);
  const ty = v => PAD.t + ch - (v - nMin) / rng * ch;

  gridLines(ctx, PAD, cw, ch, ticks, nMin, nMax);
  ctx.strokeStyle = 'rgba(100,130,180,.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.l, ty(0)); ctx.lineTo(PAD.l + cw, ty(0)); ctx.stroke();

  vals.forEach((v, i) => {
    const cx  = PAD.l + i * gap + gap / 2;
    const top = ty(Math.max(v, 0));
    const bh  = Math.max(2, Math.abs(ty(Math.min(v, 0)) - ty(Math.max(v, 0))));
    ctx.fillStyle = v >= 0 ? CC.GREEN : CC.RED; ctx.globalAlpha = 0.85;
    rrect(ctx, cx - bw / 2, top, bw, bh, 5); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = v >= 0 ? CC.GREEN : CC.RED; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText((v >= 0 ? '+' : '') + fY(v), cx, v >= 0 ? top - 6 : top + bh + 13);
    ctx.fillStyle = CC.MUTED; ctx.font = '10px system-ui';
    ctx.fillText(labels[i], cx, ht - 6);
  });
}

export function drawDonut(el, vals, colors, h = 180) {
  if (!el) return;
  const dpr = window.devicePixelRatio || 1;
  el.width = h * dpr; el.height = h * dpr;
  el.style.width = h + 'px'; el.style.height = h + 'px';
  const ctx = el.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = CC.SURFACE; ctx.fillRect(0, 0, h, h);

  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const cx = h / 2, cy = h / 2, rd = h / 2 - 10, inner = rd * 0.6;
  let angle = -Math.PI / 2;

  vals.forEach((v, i) => {
    const sw = v / total * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rd, angle, angle + sw); ctx.closePath();
    ctx.fillStyle = colors[i]; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = CC.SURFACE; ctx.lineWidth = 2; ctx.stroke();
    angle += sw;
  });

  ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2); ctx.fillStyle = CC.SURFACE; ctx.fill();
  ctx.fillStyle = CC.TEXT; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy - 8);
  ctx.fillStyle = CC.MUTED; ctx.font = '10px system-ui';
  ctx.fillText('trades', cx, cy + 10);
  ctx.textBaseline = 'alphabetic';
}

export function drawDrawdown(el, id, labels, vals, h = 150) {
  const r = setupC(el, h); if (!r) return;
  const { ctx, w, h: ht } = r;
  const PAD = { t: 20, r: 24, b: 46, l: 66 };
  const cw = w - PAD.l - PAD.r, ch = ht - PAD.t - PAD.b;
  const mn = Math.min(...vals, 0), mx = 0;
  const { ticks, nMin, nMax } = niceTicks(mn, mx, 3);
  const rng = nMax - nMin || 1;
  const tx = i => PAD.l + i / (Math.max(vals.length - 1, 1)) * cw;
  const ty = v => PAD.t + ch - (v - nMin) / rng * ch;

  gridLines(ctx, PAD, cw, ch, ticks, nMin, nMax);
  // Zero line
  ctx.strokeStyle = 'rgba(100,130,180,.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.l, ty(0)); ctx.lineTo(PAD.l + cw, ty(0)); ctx.stroke();

  // Area fill (red)
  ctx.beginPath(); ctx.moveTo(tx(0), ty(0));
  vals.forEach((v, i) => ctx.lineTo(tx(i), ty(v)));
  ctx.lineTo(tx(vals.length - 1), ty(0)); ctx.closePath();
  ctx.fillStyle = 'rgba(239,68,68,.12)'; ctx.fill();
  // Line
  ctx.beginPath(); ctx.moveTo(tx(0), ty(vals[0]));
  vals.forEach((v, i) => ctx.lineTo(tx(i), ty(v)));
  ctx.strokeStyle = CC.RED; ctx.lineWidth = 1.5; ctx.stroke();

  xLabels(ctx, labels, PAD, cw, ht, Math.max(1, Math.ceil(labels.length / 18)));
  addHover(el, id, labels, vals, PAD);
}

export function drawHistogram(el, vals, h = 160) {
  const r = setupC(el, h); if (!r) return;
  const { ctx, w, h: ht } = r;
  const PAD = { t: 20, r: 16, b: 40, l: 50 };
  const cw = w - PAD.l - PAD.r, ch = ht - PAD.t - PAD.b;
  if (!vals.length) return;

  const mn = Math.min(...vals), mx = Math.max(...vals);
  const BINS = 12;
  const step = Math.max((mx - mn) / BINS, 1);
  const buckets = Array.from({ length: BINS }, (_, i) => ({
    from: mn + i * step, to: mn + (i + 1) * step, count: 0
  }));
  vals.forEach(v => {
    const idx = Math.min(BINS - 1, Math.floor((v - mn) / step));
    if (idx >= 0) buckets[idx].count++;
  });

  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const gap = cw / BINS;
  const bw = Math.max(2, gap * 0.82);
  const ty = v => PAD.t + ch - (v / maxCount) * ch;

  // Grid
  [0, 0.25, 0.5, 0.75, 1].forEach(pct => {
    const y = PAD.t + ch - pct * ch;
    ctx.strokeStyle = CC.BORDER; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cw, y); ctx.stroke();
    if (pct > 0) {
      ctx.fillStyle = CC.MUTED; ctx.font = '9px system-ui'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxCount * pct), PAD.l - 4, y + 3);
    }
  });

  buckets.forEach((b, i) => {
    const x = PAD.l + i * gap + (gap - bw) / 2;
    const bh = Math.max(1, (b.count / maxCount) * ch);
    const isPos = (b.from + b.to) / 2 >= 0;
    ctx.fillStyle = isPos ? 'rgba(34,197,94,.7)' : 'rgba(239,68,68,.7)';
    rrect(ctx, x, ty(b.count), bw, bh, 3); ctx.fill();
    // x-axis label
    ctx.fillStyle = CC.MUTED; ctx.font = '8px system-ui'; ctx.textAlign = 'center';
    const mid = (b.from + b.to) / 2;
    ctx.fillText((mid >= 0 ? '+' : '') + (Math.abs(mid) >= 1000 ? '$' + (mid / 1000).toFixed(1) + 'k' : '$' + Math.round(mid)), x + bw / 2, ht - 6);
  });
}

export function drawDOW(el, labels, vals, h = 160) {
  drawMonthly(el, labels, vals, h);
}

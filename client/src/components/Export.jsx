import React, { useState, useMemo } from 'react';
import JSZip from 'jszip';
import { fMoney, fDate, r2 } from '../utils/helpers.js';

// ── CSV / JSON helpers ────────────────────────────
function escapeCsv(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[,"\n\r]/.test(s) ? `"${s}"` : s;
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const CSV_COLS = [
  { label: 'ID',             key: 'id' },
  { label: 'Symbol',         key: 'symbol' },
  { label: 'Description',    key: 'description' },
  { label: 'Type',           key: 'trade_type' },
  { label: 'Qty',            key: 'quantity' },
  { label: 'Buy Price',      key: 'buy_price' },
  { label: 'Sell Price',     key: 'sell_price' },
  { label: 'Entry Date',     key: 'date_acquired' },
  { label: 'Exit Date',      key: 'date_sold' },
  { label: 'Proceeds',       key: 'proceeds' },
  { label: 'Cost Basis',     key: 'cost_basis' },
  { label: 'Net P&L',        key: 'total_gl' },
  { label: 'Result',         key: t => t.total_gl >= 0 ? 'Win' : 'Loss' },
  { label: 'Same Day',       key: t => t.same_day ? 'Yes' : 'No' },
  { label: 'Tags',           key: 'tags' },
  { label: 'Why I Traded',   key: 'entry_reason' },
  { label: 'Market Context', key: 'market_context' },
  { label: 'Exit Notes',     key: 'exit_notes' },
  { label: 'Lessons',        key: 'failure_reason' },
  { label: 'Has Screenshot', key: t => t.screenshot_b64 ? 'Yes' : 'No' },
];

function toCSV(trades) {
  const header = CSV_COLS.map(c => escapeCsv(c.label)).join(',');
  const rows   = trades.map(t =>
    CSV_COLS.map(c => escapeCsv(typeof c.key === 'function' ? c.key(t) : t[c.key])).join(',')
  );
  return [header, ...rows].join('\r\n');
}

function toJSON(trades, includeScreenshots) {
  return JSON.stringify(trades.map(t => {
    if (includeScreenshots) return t;
    // eslint-disable-next-line no-unused-vars
    const { screenshot_b64, ...rest } = t;
    return rest;
  }), null, 2);
}

async function downloadScreenshotsZip(trades) {
  const withShots = trades.filter(t => t.screenshot_b64);
  if (!withShots.length) return;
  const zip = new JSZip();
  const folder = zip.folder('screenshots');
  withShots.forEach(t => {
    // Determine extension from stored name or default to png
    const ext  = (t.screenshot_name || 'screenshot.png').split('.').pop().toLowerCase() || 'png';
    const safe = (t.symbol || 'trade').replace(/[^a-z0-9]/gi, '_');
    const name = `${t.date_sold ? t.date_sold.replace(/\//g, '-') : 'nodate'}_${safe}_${t.id}.${ext}`;
    // Strip data URI prefix if present
    const b64  = t.screenshot_b64.includes(',') ? t.screenshot_b64.split(',')[1] : t.screenshot_b64;
    folder.file(name, b64, { base64: true });
  });
  const content = await zip.generateAsync({ type: 'blob' });
  const ts  = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(content);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `trading-journal-screenshots-${ts}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF generation ────────────────────────────────
async function generatePDF(trades, rangeLabel, inclScreenshots) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, ML = 12, MR = 12, CW = 186;
  const BOTTOM = PH - 12;
  let y = 0, pg = 1;

  const C = {
    text:   [30,  35,  55],   muted:  [105, 110, 135],
    green:  [22,  163, 74],   red:    [220, 38,  38],
    blue:   [37,  99,  235],  purple: [147, 51,  234],
    border: [215, 218, 228],  shade:  [247, 248, 252],
    navy:   [22,  28,  58],   white:  [255, 255, 255],
    navySub:[160, 175, 215],
  };
  const s = (c, t='text') => {
    if (t==='text') doc.setTextColor(...c);
    else if (t==='fill') doc.setFillColor(...c);
    else doc.setDrawColor(...c);
  };

  function footer() {
    s(C.border,'draw'); doc.setLineWidth(0.2);
    doc.line(ML, PH-8, PW-MR, PH-8);
    s(C.muted); doc.setFontSize(6.5); doc.setFont('helvetica','normal');
    doc.text('Trading Journal — Confidential', ML, PH-4);
    doc.text(`Page ${pg}`, PW-MR, PH-4, { align:'right' });
  }

  function checkY(need) {
    if (y + need > BOTTOM) { footer(); doc.addPage(); pg++; y = 14; }
  }

  // ── Cover header ─────────────────────────────────
  s(C.navy,'fill'); doc.rect(0, 0, PW, 46, 'F');
  s(C.white); doc.setFont('helvetica','bold'); doc.setFontSize(22);
  doc.text('TRADING JOURNAL', ML, 20);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); s(C.navySub);
  doc.text('Performance Report', ML, 29);
  if (rangeLabel) doc.text(rangeLabel, ML, 36);
  doc.setFontSize(7.5);
  doc.text(`Generated ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}`, PW-MR, 20, {align:'right'});
  y = 54;

  // ── Summary stats ────────────────────────────────
  const wins    = trades.filter(t => t.total_gl > 0);
  const losses  = trades.filter(t => t.total_gl < 0);
  const net     = trades.reduce((a,t) => a+t.total_gl, 0);
  const wr      = trades.length ? Math.round(wins.length/trades.length*100) : 0;
  const avgWin  = wins.length   ? wins.reduce((a,t)=>a+t.total_gl,0)/wins.length   : 0;
  const avgLoss = losses.length ? losses.reduce((a,t)=>a+t.total_gl,0)/losses.length : 0;
  const pf      = losses.length && wins.length
    ? Math.abs(wins.reduce((a,t)=>a+t.total_gl,0) / losses.reduce((a,t)=>a+t.total_gl,0))
    : null;

  const stats = [
    {lbl:'Total Trades', val:String(trades.length),              c:C.text},
    {lbl:'Wins',         val:String(wins.length),                c:C.green},
    {lbl:'Losses',       val:String(losses.length),              c:C.red},
    {lbl:'Win Rate',     val:`${wr}%`,                           c:wr>=50?C.green:C.red},
    {lbl:'Net P&L',      val:fMoney(net,true),                   c:net>=0?C.green:C.red},
    {lbl:'Avg Win',      val:fMoney(avgWin,true),                c:C.green},
    {lbl:'Avg Loss',     val:fMoney(avgLoss),                    c:C.red},
    {lbl:'Profit Factor',val:pf ? pf.toFixed(2)+'x' : '—',     c:C.blue},
  ];
  const bw = CW / stats.length;
  stats.forEach((st, i) => {
    const bx = ML + i * bw;
    s(C.shade,'fill'); s(C.border,'draw'); doc.setLineWidth(0.3);
    doc.roundedRect(bx, y-3, bw-1.5, 20, 1.5, 1.5, 'FD');
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); s(C.muted);
    doc.text(st.lbl, bx+(bw-1.5)/2, y+3, {align:'center'});
    doc.setFont('helvetica','bold'); doc.setFontSize(10); s(st.c);
    doc.text(st.val, bx+(bw-1.5)/2, y+11, {align:'center'});
  });
  y += 26;

  // Divider + section heading
  s(C.border,'draw'); doc.setLineWidth(0.4); doc.line(ML, y, PW-MR, y); y += 7;
  doc.setFont('helvetica','bold'); doc.setFontSize(11); s(C.text);
  doc.text('Trade Log', ML, y);
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); s(C.muted);
  const ssc = trades.filter(t=>t.screenshot_b64).length;
  doc.text(`${trades.length} trades · ${ssc} with screenshots · sorted by exit date`, ML+26, y);
  y += 7;

  // ── Table column x-positions ─────────────────────
  const X = { num:ML+1, sym:ML+9, type:ML+43, entry:ML+61, exit:ML+83, qty:ML+105, pnl:ML+117, res:ML+148 };

  function drawHeader(yy) {
    s(C.navy,'fill'); doc.rect(ML, yy, CW, 6.5, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(6.5); s(C.white);
    [['#',X.num],['SYMBOL',X.sym],['TYPE',X.type],['ENTRY',X.entry],
     ['EXIT',X.exit],['QTY',X.qty],['NET P&L',X.pnl],['RESULT',X.res]]
      .forEach(([txt,x]) => doc.text(txt, x, yy+4.3));
    return yy + 6.5;
  }

  y = drawHeader(y);

  // ── Trade rows ───────────────────────────────────
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const win = t.total_gl >= 0;

    const noteParts = [
      t.entry_reason   && { pre:'WHY: ',      body:t.entry_reason   },
      t.market_context && { pre:'CONTEXT: ',  body:t.market_context },
      t.exit_notes     && { pre:'EXIT: ',     body:t.exit_notes     },
      t.failure_reason && { pre:'LESSONS: ',  body:t.failure_reason },
    ].filter(Boolean);

    // Pre-wrap notes for height calc
    doc.setFontSize(7);
    const noteLines = noteParts.flatMap(p =>
      doc.splitTextToSize(p.pre + p.body, CW - (X.sym - ML) - 2)
    );
    if (t.tags) noteLines.push(`Tags: ${t.tags}`);

    const baseH  = 9;
    const notesH = noteLines.length ? 2 + noteLines.length * 3.6 + 1 : 0;
    const rowH   = baseH + notesH;

    checkY(rowH);

    // Row shade (alternating)
    if (i % 2 === 0) { s(C.shade,'fill'); doc.rect(ML, y, CW, rowH, 'F'); }

    // Left accent stripe
    s(win ? C.green : C.red, 'fill'); doc.rect(ML, y, 1.5, rowH, 'F');

    // Bottom border
    s(C.border,'draw'); doc.setLineWidth(0.15);
    doc.line(ML, y+rowH, PW-MR, y+rowH);

    const mid = y + 5.5;

    // # number
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); s(C.muted);
    doc.text(String(i+1), X.num, mid);

    // Symbol + description
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); s(C.text);
    doc.text(t.symbol || '', X.sym, mid);
    if (t.description) {
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5); s(C.muted);
      const desc = t.description.length > 26 ? t.description.slice(0,26)+'…' : t.description;
      doc.text(desc, X.sym, mid+3.5);
    }

    // Type badge
    const tc = t.trade_type==='CALL' ? C.blue : t.trade_type==='PUT' ? C.purple : [160,120,0];
    s(tc,'fill'); doc.roundedRect(X.type-0.5, y+1.8, 14, 4.8, 1, 1, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7); s(C.white);
    doc.text(t.trade_type||'', X.type+6.5, y+5.2, {align:'center'});

    // Dates + Qty
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); s(C.text);
    doc.text(t.date_acquired||'', X.entry, mid);
    doc.text(t.date_sold||'',     X.exit,  mid);
    s(C.muted); doc.text(String(t.quantity||''), X.qty, mid);

    // P&L
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); s(win ? C.green : C.red);
    doc.text(fMoney(t.total_gl,true), X.pnl, mid);

    // Result badge
    s(win ? [220,252,231] : [254,226,226], 'fill');
    doc.roundedRect(X.res-0.5, y+1.8, 15, 4.8, 1, 1, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7); s(win ? C.green : C.red);
    doc.text(win?'WIN':'LOSS', X.res+7, y+5.2, {align:'center'});

    // Screenshot indicator (when not embedding)
    if (t.screenshot_b64 && !inclScreenshots) {
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5); s(C.muted);
      doc.text('[screenshot]', PW-MR-2, mid, {align:'right'});
    }

    // Notes
    if (noteLines.length) {
      let ny = y + baseH + 1.5;
      doc.setFontSize(7);
      let lineIdx = 0;
      for (const p of noteParts) {
        const wrapped = doc.splitTextToSize(p.pre + p.body, CW - (X.sym-ML) - 2);
        for (let li = 0; li < wrapped.length; li++) {
          if (li === 0) {
            const pw = doc.getTextWidth(p.pre);
            doc.setFont('helvetica','bold'); s(C.muted);
            doc.text(p.pre, X.sym, ny);
            doc.setFont('helvetica','normal'); s(C.text);
            doc.text(wrapped[0].slice(p.pre.length), X.sym+pw, ny);
          } else {
            doc.setFont('helvetica','normal'); s(C.text);
            doc.text(wrapped[li], X.sym+2, ny);
          }
          ny += 3.6; lineIdx++;
        }
      }
      if (t.tags) {
        doc.setFont('helvetica','italic'); s(C.blue); doc.setFontSize(6.5);
        doc.text(`Tags: ${t.tags}`, X.sym, ny);
      }
    }

    y += rowH;

    // Re-draw table header every 28 rows
    if ((i+1) % 28 === 0 && i+1 < trades.length) {
      y += 2; checkY(10); y = drawHeader(y);
    }

    // Embed screenshot
    if (t.screenshot_b64 && inclScreenshots) {
      y += 3; checkY(50);
      s(C.shade,'fill'); s(C.border,'draw'); doc.setLineWidth(0.2);
      doc.rect(ML, y, CW, 5.5, 'FD');
      doc.setFont('helvetica','italic'); doc.setFontSize(7); s(C.muted);
      doc.text(`Trade #${i+1} — ${t.symbol||''} screenshot (${t.date_sold||''})`, ML+3, y+3.7);
      y += 7;

      await new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const MAX_W = CW, MAX_H = 90;
          const asp = img.naturalWidth / img.naturalHeight;
          let iw = MAX_W, ih = MAX_W / asp;
          if (ih > MAX_H) { ih = MAX_H; iw = ih * asp; }
          checkY(ih + 4);
          const src = t.screenshot_b64.startsWith('data:')
            ? t.screenshot_b64
            : `data:image/png;base64,${t.screenshot_b64}`;
          const fmt = (src.match(/data:image\/(\w+)/)?.[1]||'png').toUpperCase();
          try { doc.addImage(src, fmt, ML, y, iw, ih); y += ih + 3; } catch(e) { /* skip */ }
          resolve();
        };
        img.onerror = resolve;
        img.src = t.screenshot_b64.startsWith('data:')
          ? t.screenshot_b64 : `data:image/png;base64,${t.screenshot_b64}`;
      });

      s(C.border,'draw'); doc.setLineWidth(0.5);
      doc.line(ML, y, PW-MR, y); y += 5;
      if (i+1 < trades.length) { checkY(10); y = drawHeader(y); }
    }
  }

  footer();
  doc.save(`trading-journal-report-${new Date().toISOString().slice(0,10)}.pdf`);
}

// ── Date helpers ──────────────────────────────────
function slashToDate(s) {
  if (!s) return null;
  const [m, d, y] = s.split('/');
  return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
}

const PRESET_RANGES = [
  { label: 'All time',      days: null },
  { label: 'This month',    days: 'month' },
  { label: 'Last 30 days',  days: 30 },
  { label: 'Last 90 days',  days: 90 },
  { label: 'This year',     days: 'year' },
  { label: 'Custom',        days: 'custom' },
];

function getPresetDates(preset) {
  const now  = new Date();
  const pad  = n => String(n).padStart(2,'0');
  const fmt  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  if (preset.days === null)     return { from: '', to: '' };
  if (preset.days === 'month')  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
  if (preset.days === 'year')   return { from: fmt(new Date(now.getFullYear(), 0, 1)), to: fmt(now) };
  if (preset.days === 'custom') return null; // keep existing
  const from = new Date(now); from.setDate(from.getDate() - preset.days);
  return { from: fmt(from), to: fmt(now) };
}

// ── Stat summary ─────────────────────────────────
function Summary({ trades }) {
  if (!trades.length) return <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No trades match the selected filters.</div>;
  const wins   = trades.filter(t => t.total_gl > 0);
  const losses = trades.filter(t => t.total_gl < 0);
  const totalPnl = r2(trades.reduce((s, t) => s + t.total_gl, 0));
  const withNotes = trades.filter(t => t.entry_reason || t.market_context || t.exit_notes || t.failure_reason).length;
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '16px 0', padding: '14px 18px', background: 'var(--surface2)', borderRadius: 10, fontSize: '.82rem' }}>
      <div><div style={{ color: 'var(--muted)', marginBottom: 3 }}>Trades</div><strong>{trades.length}</strong></div>
      <div><div style={{ color: 'var(--muted)', marginBottom: 3 }}>Wins</div><strong style={{ color: 'var(--green)' }}>{wins.length}</strong></div>
      <div><div style={{ color: 'var(--muted)', marginBottom: 3 }}>Losses</div><strong style={{ color: 'var(--red)' }}>{losses.length}</strong></div>
      <div><div style={{ color: 'var(--muted)', marginBottom: 3 }}>Win Rate</div><strong>{trades.length ? Math.round(wins.length / trades.length * 100) : 0}%</strong></div>
      <div><div style={{ color: 'var(--muted)', marginBottom: 3 }}>Net P&amp;L</div><strong style={{ color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fMoney(totalPnl, true)}</strong></div>
      <div><div style={{ color: 'var(--muted)', marginBottom: 3 }}>With Notes</div><strong>{withNotes}</strong></div>
    </div>
  );
}

// ── Main component ────────────────────────────────
export default function Export({ trades }) {
  const [preset,    setPreset]    = useState(0); // index into PRESET_RANGES
  const [fromDate,  setFromDate]  = useState('');
  const [toDate,    setToDate]    = useState('');
  const [typeFilter,setTypeFilter]= useState('');       // '' | CALL | PUT | STOCK
  const [result,    setResult]    = useState('');       // '' | win | loss
  const [hasNotes,  setHasNotes]  = useState(false);
  const [hasSshot,  setHasSshot]  = useState(false);
  const [pdfGenerating,       setPdfGenerating]       = useState(false);
  const [pdfSshots,           setPdfSshots]           = useState(false);

  // ── Apply filters ─────────────────────────────
  const filtered = useMemo(() => {
    let out = [...trades];

    // Date range
    const effFrom = PRESET_RANGES[preset].days !== 'custom' && PRESET_RANGES[preset].days !== null
      ? getPresetDates(PRESET_RANGES[preset])?.from
      : fromDate;
    const effTo = PRESET_RANGES[preset].days !== 'custom' && PRESET_RANGES[preset].days !== null
      ? getPresetDates(PRESET_RANGES[preset])?.to
      : toDate;

    if (effFrom) {
      const from = new Date(effFrom);
      out = out.filter(t => { const d = slashToDate(t.date_sold); return d && d >= from; });
    }
    if (effTo) {
      const to = new Date(effTo); to.setHours(23, 59, 59);
      out = out.filter(t => { const d = slashToDate(t.date_sold); return d && d <= to; });
    }

    if (typeFilter) out = out.filter(t => t.trade_type === typeFilter);
    if (result === 'win')  out = out.filter(t => t.total_gl > 0);
    if (result === 'loss') out = out.filter(t => t.total_gl < 0);
    if (hasNotes)  out = out.filter(t => t.entry_reason || t.market_context || t.exit_notes || t.failure_reason);
    if (hasSshot)  out = out.filter(t => t.screenshot_b64);

    out.sort((a, b) => b.date_sold.localeCompare(a.date_sold) || b.id - a.id);
    return out;
  }, [trades, preset, fromDate, toDate, typeFilter, result, hasNotes, hasSshot]);

  const isCustom = PRESET_RANGES[preset].days === 'custom';

  function getRangeLabel() {
    const p = PRESET_RANGES[preset];
    if (p.days === null) return 'All Time';
    if (p.days === 'custom') {
      if (fromDate && toDate) return `${fromDate} to ${toDate}`;
      if (fromDate) return `From ${fromDate}`;
      if (toDate) return `To ${toDate}`;
      return 'Custom Range';
    }
    const d = getPresetDates(p);
    return d ? `${d.from} to ${d.to}` : p.label;
  }

  async function doPdfExport() {
    if (!filtered.length || pdfGenerating) return;
    setPdfGenerating(true);
    try {
      await generatePDF(filtered, getRangeLabel(), pdfSshots);
    } finally {
      setPdfGenerating(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Export</div>
          <div className="page-sub">Filter and download your trade data</div>
        </div>
      </div>

      {/* ── Filter card ── */}
      <div className="chart-card" style={{ marginBottom: 14 }}>
        <div className="chart-hdr">
          <div className="chart-dot" style={{ background: 'var(--cyan)' }} />
          <div className="chart-title">Filters</div>
        </div>

        {/* Date range preset */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Date Range</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESET_RANGES.map((p, i) => (
              <button
                key={p.label}
                onClick={() => { setPreset(i); if (p.days !== 'custom') { setFromDate(''); setToDate(''); } }}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
                  background: preset === i ? 'var(--blue)' : 'var(--bg)',
                  color: preset === i ? '#fff' : 'var(--muted)',
                  cursor: 'pointer', fontSize: '.8rem', fontWeight: preset === i ? 600 : 400,
                  transition: 'all .15s',
                }}
              >{p.label}</button>
            ))}
          </div>
          {isCustom && (
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <div className="f-group" style={{ flex: 1, minWidth: 160 }}>
                <label>From</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div className="f-group" style={{ flex: 1, minWidth: 160 }}>
                <label>To</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Row 2: Type / Result / Toggles */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="f-group" style={{ minWidth: 140 }}>
            <label>Trade Type</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              <option value="CALL">CALL</option>
              <option value="PUT">PUT</option>
              <option value="STOCK">STOCK</option>
            </select>
          </div>
          <div className="f-group" style={{ minWidth: 140 }}>
            <label>Result</label>
            <select value={result} onChange={e => setResult(e.target.value)}>
              <option value="">Win &amp; Loss</option>
              <option value="win">Wins only</option>
              <option value="loss">Losses only</option>
            </select>
          </div>

          {/* Toggle pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 2 }}>
            {[
              { label: '📝 Has journal notes', val: hasNotes, set: setHasNotes },
              { label: '📸 Has screenshot',    val: hasSshot, set: setHasSshot },
            ].map(({ label, val, set }) => (
              <button
                key={label}
                onClick={() => set(v => !v)}
                style={{
                  padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border)',
                  background: val ? 'rgba(59,130,246,.15)' : 'var(--bg)',
                  color:      val ? 'var(--blue)' : 'var(--muted)',
                  cursor: 'pointer', fontSize: '.78rem', fontWeight: val ? 600 : 400,
                  transition: 'all .15s',
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <Summary trades={filtered} />

      {/* ── PDF Report ── */}
      <div className="chart-card" style={{ marginBottom: 14 }}>
        <div className="chart-hdr">
          <div className="chart-dot" style={{ background: 'var(--red)' }} />
          <div className="chart-title">PDF Report</div>
          <div className="chart-legend" style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Includes summary stats, trade log, journal notes &amp; optional screenshots</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setPdfSshots(v => !v)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)',
              background: pdfSshots ? 'rgba(234,179,8,.15)' : 'var(--bg)',
              color: pdfSshots ? '#fde047' : 'var(--muted)',
              cursor: 'pointer', fontSize: '.78rem', fontWeight: pdfSshots ? 600 : 400,
              transition: 'all .15s',
            }}
          >📸 Embed screenshots in PDF {filtered.filter(t=>t.screenshot_b64).length > 0 ? `(${filtered.filter(t=>t.screenshot_b64).length} available)` : '(none in selection)'}</button>

          <button
            className="btn-save"
            style={{
              marginLeft: 'auto',
              background: 'linear-gradient(135deg,#c0392b,#922b21)',
              opacity: filtered.length && !pdfGenerating ? 1 : 0.45,
              cursor: filtered.length && !pdfGenerating ? 'pointer' : 'not-allowed',
            }}
            disabled={!filtered.length || pdfGenerating}
            onClick={doPdfExport}
          >
            {pdfGenerating ? '⏳ Generating PDF…' : `🖨 Export PDF Report (${filtered.length} trade${filtered.length !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>

      {/* ── Preview table ── */}
      {filtered.length > 0 && (
        <div className="chart-card" style={{ marginBottom: 0 }}>
          <div className="chart-hdr">
            <div className="chart-dot" style={{ background: 'var(--purple)' }} />
            <div className="chart-title">Preview — {filtered.length} trade{filtered.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0, marginTop: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Symbol</th><th>Type</th><th>Entry</th><th>Exit</th>
                  <th>Qty</th><th>Net P&amp;L</th><th>Result</th>
                  <th>Notes</th><th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map(t => {
                  const w = t.total_gl > 0;
                  const hasN = !!(t.entry_reason || t.market_context || t.exit_notes || t.failure_reason);
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.symbol}</strong>
                        <div style={{ fontSize: '.7rem', color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.description || ''}
                        </div>
                      </td>
                      <td><span className={`badge b-${t.trade_type.toLowerCase()}`}>{t.trade_type}</span></td>
                      <td style={{ color: 'var(--muted)', fontSize: '.8rem', whiteSpace: 'nowrap' }}>{fDate(t.date_acquired)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '.8rem', whiteSpace: 'nowrap' }}>{fDate(t.date_sold)}</td>
                      <td>{t.quantity}</td>
                      <td className={w ? 'ppos' : 'pneg'} style={{ fontWeight: 700 }}>{fMoney(t.total_gl, true)}</td>
                      <td><span className={`badge ${w ? 'b-win' : 'b-loss'}`}>{w ? 'Win' : 'Loss'}</span></td>
                      <td style={{ fontSize: '.85rem' }}>
                        {hasN && '📝'}{t.screenshot_b64 && ' 📸'}
                      </td>
                      <td style={{ fontSize: '.75rem', color: 'var(--muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.tags || ''}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length > 100 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', color: 'var(--muted)', padding: '12px', fontSize: '.8rem' }}>
                      … and {filtered.length - 100} more (all included in export)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

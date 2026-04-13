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
  const [format,    setFormat]    = useState('csv');    // csv | json
  const [includeNotesCols,    setIncludeNotesCols]    = useState(true);
  const [includeScreenshots,  setIncludeScreenshots]  = useState(false);
  const [zipping,             setZipping]             = useState(false);

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

  function doExport() {
    if (!filtered.length) return;
    const ts   = new Date().toISOString().slice(0, 10);
    const name = `trading-journal-${ts}`;
    if (format === 'csv') {
      const cols = includeNotesCols ? CSV_COLS : CSV_COLS.filter(c => !['entry_reason','market_context','exit_notes','failure_reason'].includes(c.key));
      const header = cols.map(c => escapeCsv(c.label)).join(',');
      const rows   = filtered.map(t => cols.map(c => escapeCsv(typeof c.key === 'function' ? c.key(t) : t[c.key])).join(','));
      downloadBlob([header, ...rows].join('\r\n'), `${name}.csv`, 'text/csv;charset=utf-8;');
    } else {
      downloadBlob(toJSON(filtered, includeScreenshots), `${name}.json`, 'application/json');
    }
  }

  const isCustom = PRESET_RANGES[preset].days === 'custom';

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

      {/* ── Export options ── */}
      <div className="chart-card" style={{ marginBottom: 14 }}>
        <div className="chart-hdr">
          <div className="chart-dot" style={{ background: 'var(--orange)' }} />
          <div className="chart-title">Export Options</div>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Format */}
          <div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Format</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['csv', 'json'].map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  style={{
                    padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border)',
                    background: format === f ? 'var(--blue)' : 'var(--bg)',
                    color:      format === f ? '#fff' : 'var(--muted)',
                    cursor: 'pointer', fontSize: '.82rem', fontWeight: format === f ? 600 : 400,
                    textTransform: 'uppercase', transition: 'all .15s',
                  }}
                >{f}</button>
              ))}
            </div>
          </div>

          {/* CSV / JSON column options */}
          <div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Options</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {format === 'csv' && (
                <button
                  onClick={() => setIncludeNotesCols(v => !v)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                    background: includeNotesCols ? 'rgba(34,197,94,.12)' : 'var(--bg)',
                    color:      includeNotesCols ? 'var(--green)' : 'var(--muted)',
                    cursor: 'pointer', fontSize: '.78rem', fontWeight: includeNotesCols ? 600 : 400,
                    transition: 'all .15s',
                  }}
                >📝 Include journal notes columns</button>
              )}
              {format === 'json' && (
                <button
                  onClick={() => setIncludeScreenshots(v => !v)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                    background: includeScreenshots ? 'rgba(234,179,8,.15)' : 'var(--bg)',
                    color:      includeScreenshots ? '#fde047' : 'var(--muted)',
                    cursor: 'pointer', fontSize: '.78rem', fontWeight: includeScreenshots ? 600 : 400,
                    transition: 'all .15s',
                  }}
                >📸 Include screenshots (base64)</button>
              )}
            </div>
          </div>

          {/* Export buttons */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn-save"
              style={{ opacity: filtered.length ? 1 : 0.4, cursor: filtered.length ? 'pointer' : 'not-allowed' }}
              onClick={doExport}
              disabled={!filtered.length}
            >
              ↓ Export {filtered.length} trade{filtered.length !== 1 ? 's' : ''} as {format.toUpperCase()}
            </button>
            <button
              className="btn-save"
              style={{
                background: 'var(--surface2)', color: 'var(--muted)',
                opacity: filtered.filter(t => t.screenshot_b64).length ? 1 : 0.4,
                cursor: filtered.filter(t => t.screenshot_b64).length && !zipping ? 'pointer' : 'not-allowed',
              }}
              disabled={!filtered.filter(t => t.screenshot_b64).length || zipping}
              onClick={async () => {
                setZipping(true);
                await downloadScreenshotsZip(filtered);
                setZipping(false);
              }}
            >
              {zipping ? '⏳ Zipping…' : `📸 Download screenshots ZIP (${filtered.filter(t => t.screenshot_b64).length})`}
            </button>
          </div>
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

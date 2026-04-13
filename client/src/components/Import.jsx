import React, { useState, useRef } from 'react';
import { API } from '../api.js';

// ── CSV parser ────────────────────────────────────
function parseCsvRows(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Basic CSV split (handles quoted fields)
    const vals = [];
    let cur = '', inQ = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').replace(/^"|"$/g, ''); });
    rows.push(row);
  }
  return { headers, rows };
}

function detectType(headers) {
  if (headers.includes('date_acquired') || headers.includes('total_gl')) return 'trades';
  if (headers.includes('key') && headers.includes('value'))              return 'settings';
  if (headers.includes('date') && headers.includes('amount'))            return 'withdrawals';
  return 'unknown';
}

function rowToTrade(r) {
  return {
    symbol:           r.symbol || r.Symbol || '',
    base_symbol:      r.base_symbol || r.symbol?.replace(/\(.*\)/, '') || '',
    description:      r.description || r.Description || r.symbol || '',
    trade_type:       (r.trade_type || r.Type || 'CALL').toUpperCase(),
    quantity:         parseFloat(r.quantity || r.Qty || 1),
    buy_price:        parseFloat(r.buy_price || r['Buy Price'] || 0),
    sell_price:       parseFloat(r.sell_price || r['Sell Price'] || 0),
    date_acquired:    r.date_acquired || r['Entry Date'] || r['Buy Date'] || '',
    date_sold:        r.date_sold     || r['Exit Date']  || r['Sell Date'] || r.date_acquired || '',
    proceeds:         parseFloat(r.proceeds   || r.Proceeds   || 0),
    cost_basis:       parseFloat(r.cost_basis || r['Cost Basis'] || 0),
    total_gl:         parseFloat(r.total_gl   || r['Net P&L']   || 0),
    same_day:         r.same_day === 'true' || r.same_day === 'Yes' || r['Same Day'] === 'Yes',
    is_ndx:           /NDXP?/i.test(r.base_symbol || r.symbol || ''),
    lt_gl:            r.lt_gl  ? parseFloat(r.lt_gl)  : null,
    st_gl:            r.st_gl  ? parseFloat(r.st_gl)  : null,
    status:           'closed',
    tags:             r.tags   || r.Tags || null,
    entry_reason:     r.entry_reason    || r['Why I Traded']   || null,
    market_context:   r.market_context  || r['Market Context'] || null,
    exit_notes:       r.exit_notes      || r['Exit Notes']     || null,
    failure_reason:   r.failure_reason  || r.Lessons           || null,
  };
}

// ── Component ─────────────────────────────────────
export default function Import({ onImported, onToast }) {
  const [dragging, setDragging]   = useState(false);
  const [files,    setFiles]      = useState([]);   // [{name, type, rows, preview}]
  const [importing, setImporting] = useState(false);
  const [results,  setResults]    = useState(null);
  const inputRef = useRef(null);

  function processFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      const { headers, rows } = parseCsvRows(text);
      const type = detectType(headers);
      setFiles(prev => {
        // replace if same name already loaded
        const others = prev.filter(f => f.name !== file.name);
        return [...others, { name: file.name, type, rows, headers, preview: rows.slice(0, 3) }];
      });
    };
    reader.readAsText(file);
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    [...(e.dataTransfer?.files || [])].filter(f => f.name.endsWith('.csv')).forEach(processFile);
  }

  function onFileInput(e) {
    [...(e.target.files || [])].forEach(processFile);
    e.target.value = '';
  }

  async function doImport() {
    setImporting(true);
    const summary = [];
    for (const f of files) {
      if (f.type === 'trades') {
        let ok = 0, fail = 0;
        for (const row of f.rows) {
          try {
            const trade = rowToTrade(row);
            if (!trade.symbol || !trade.date_acquired) { fail++; continue; }
            const res = await API.post('/api/trades', trade);
            if (res?.id) ok++;
            else fail++;
          } catch { fail++; }
        }
        summary.push({ name: f.name, type: 'trades', ok, fail });
      } else if (f.type === 'settings') {
        const obj = {};
        f.rows.forEach(r => { if (r.key) obj[r.key] = r.value; });
        const res = await API.post('/api/settings/bulk', { settings: obj });
        summary.push({ name: f.name, type: 'settings', ok: res?.success ? Object.keys(obj).length : 0, fail: 0 });
      } else if (f.type === 'withdrawals') {
        const withdrawals = f.rows
          .filter(r => r.date && r.amount)
          .map(r => ({ date: r.date, amount: parseFloat(r.amount) }));
        const res = await API.post('/api/withdrawals/bulk', { withdrawals });
        summary.push({ name: f.name, type: 'withdrawals', ok: res?.inserted || 0, fail: withdrawals.length - (res?.inserted || 0) });
      } else {
        summary.push({ name: f.name, type: 'unknown', ok: 0, fail: f.rows.length });
      }
    }

    setImporting(false);
    setResults(summary);
    const totalOk = summary.reduce((s, r) => s + r.ok, 0);
    if (totalOk > 0) {
      onToast?.(`Imported ${totalOk} records`, 'ok');
      onImported?.();
    }
  }

  function removeFile(name) {
    setFiles(f => f.filter(x => x.name !== name));
  }

  const TYPE_LABELS = { trades: '📊 Trades', settings: '⚙️ Settings', withdrawals: '💰 Withdrawals', unknown: '❓ Unknown' };
  const TYPE_COLORS = { trades: 'var(--blue)', settings: 'var(--cyan)', withdrawals: 'var(--purple)', unknown: 'var(--red)' };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Import CSV</div>
          <div className="page-sub">Import trades, settings, or withdrawals from CSV files</div>
        </div>
      </div>

      {/* Supported formats info */}
      <div className="chart-card" style={{ marginBottom: 16 }}>
        <div className="chart-hdr">
          <div className="chart-dot" style={{ background: 'var(--blue)' }} />
          <div className="chart-title">Supported CSV Formats</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 4 }}>
          {[
            {
              label: '📊 Trades CSV', color: 'var(--blue)',
              fields: 'id, symbol, base_symbol, quantity, date_acquired, date_sold, proceeds, cost_basis, total_gl, trade_type, same_day …',
            },
            {
              label: '💰 Withdrawals CSV', color: 'var(--purple)',
              fields: 'date (MM/DD/YYYY), amount',
            },
            {
              label: '⚙️ Settings CSV', color: 'var(--cyan)',
              fields: 'key (tj_goal / tj_start_bal / tj_curr_bal / tj_rh_withdrawn), value',
            },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: 5, color: s.color }}>{s.label}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{s.fields}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        className="chart-card"
        style={{
          border: `2px dashed ${dragging ? 'var(--blue)' : 'var(--border)'}`,
          borderRadius: 12, padding: '36px 20px', textAlign: 'center',
          background: dragging ? 'rgba(59,130,246,.06)' : undefined,
          cursor: 'pointer', marginBottom: 16, transition: 'all .15s',
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".csv" multiple style={{ display: 'none' }} onChange={onFileInput} />
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📂</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Drop CSV files here or click to browse</div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Accepts trades, settings, and withdrawals CSV files</div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="chart-card" style={{ marginBottom: 16 }}>
          <div className="chart-hdr">
            <div className="chart-dot" style={{ background: 'var(--green)' }} />
            <div className="chart-title">Ready to Import ({files.length} file{files.length > 1 ? 's' : ''})</div>
          </div>
          {files.map(f => (
            <div key={f.name} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{f.name}</div>
                  <div style={{ fontSize: '.75rem', color: TYPE_COLORS[f.type], marginTop: 2 }}>
                    {TYPE_LABELS[f.type]} · {f.rows.length} rows
                  </div>
                </div>
                <button onClick={() => removeFile(f.name)} style={{
                  background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
                  color: 'var(--red)', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '.75rem',
                }}>Remove</button>
              </div>
              {f.type === 'unknown' && (
                <div style={{ fontSize: '.75rem', color: 'var(--red)', marginTop: 6 }}>
                  ⚠️ Could not detect format. Expected columns: date_acquired/total_gl (trades), key/value (settings), or date/amount (withdrawals).
                </div>
              )}
              {/* Preview */}
              {f.preview.length > 0 && f.type !== 'unknown' && (
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table style={{ width: '100%', fontSize: '.72rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>{f.headers.slice(0, 8).map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}{f.headers.length > 8 && <th style={{ color: 'var(--muted)' }}>…</th>}</tr>
                    </thead>
                    <tbody>
                      {f.preview.map((row, i) => (
                        <tr key={i}>
                          {f.headers.slice(0, 8).map(h => (
                            <td key={h} style={{ padding: '4px 8px', color: 'var(--muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row[h] || '—'}
                            </td>
                          ))}
                          {f.headers.length > 8 && <td>…</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={doImport}
            disabled={importing || files.every(f => f.type === 'unknown')}
            style={{
              marginTop: 14, width: '100%', padding: '12px 0',
              background: 'linear-gradient(90deg,var(--blue),var(--purple))',
              border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '.9rem',
              cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.7 : 1,
            }}
          >
            {importing ? '⏳ Importing…' : `⬆ Import ${files.reduce((s, f) => s + f.rows.length, 0)} rows`}
          </button>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="chart-card">
          <div className="chart-hdr">
            <div className="chart-dot" style={{ background: 'var(--green)' }} />
            <div className="chart-title">Import Results</div>
          </div>
          {results.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{r.name}</div>
                <div style={{ fontSize: '.73rem', color: TYPE_COLORS[r.type] }}>{TYPE_LABELS[r.type]}</div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ {r.ok} imported</span>
                {r.fail > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>✗ {r.fail} failed</span>}
              </div>
            </div>
          ))}
          <button onClick={() => { setResults(null); setFiles([]); }} style={{
            marginTop: 12, padding: '8px 20px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)',
            cursor: 'pointer', fontSize: '.82rem',
          }}>Import More Files</button>
        </div>
      )}
    </div>
  );
}

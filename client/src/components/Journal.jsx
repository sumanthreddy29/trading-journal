import React, { useState, useEffect, useRef } from 'react';
import { fMoney, fDate, symBadgeClass, esc } from '../utils/helpers.js';

function _toSecs(t) {
  if (!t) return null;
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + (m || 0) * 60 + (s || 0);
}
function _fDur(secs) {
  if (secs == null || secs < 0) return '—';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
function _move(t) {
  if (t.ticker_at_entry == null || t.ticker_at_exit == null) return null;
  if (t.trade_type === 'PUT') return t.ticker_at_entry - t.ticker_at_exit;
  return t.ticker_at_exit - t.ticker_at_entry;
}

export default function Journal({ trades, highlightId, onHighlightClear, onAddTrade, onEdit, onDelete, onLightbox }) {
  const [search,  setSearch]  = useState('');
  const [fType,   setFType]   = useState('');
  const [fResult, setFResult] = useState('');
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [fBroker, setFBroker] = useState('');
  const [fFrom,   setFFrom]   = useState('');
  const [fTo,     setFTo]     = useState('');
  const [expanded, setExpanded] = useState({});
  const highlightRef = useRef(null);

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }
  function SortTh({ col, children, style }) {
    const active = sortCol === col;
    return (
      <th onClick={() => handleSort(col)}
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}>
        {children}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </th>
    );
  }

  // When arriving from calendar: clear filters, expand and scroll to the trade
  useEffect(() => {
    if (!highlightId) return;
    setSearch('');
    setFType('');
    setFResult('');
    setSortCol('date');
    setSortDir('desc');
    setFBroker('');
    setFFrom('');
    setFTo('');
    setExpanded(prev => ({ ...prev, [highlightId]: true }));
    // Scroll after render
    const timer = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => clearTimeout(timer);
  }, [highlightId]);

  let filtered = [...trades];
  if (search)         filtered = filtered.filter(t => (t.symbol + t.description + (t.entry_reason || '') + (t.tags || '')).toLowerCase().includes(search.toLowerCase()));
  if (fType)          filtered = filtered.filter(t => t.trade_type === fType);
  if (fResult === 'win')  filtered = filtered.filter(t => t.total_gl > 0);
  if (fResult === 'loss') filtered = filtered.filter(t => t.total_gl < 0);
  if (fBroker)        filtered = filtered.filter(t => (t.broker || 'fidelity') === fBroker);
  if (fFrom)          filtered = filtered.filter(t => t.date_sold >= fFrom);
  if (fTo)            filtered = filtered.filter(t => t.date_sold <= fTo);

  // Column sort
  filtered.sort((a, b) => {
    let av, bv;
    if (sortCol === 'date')       { av = a.date_sold;  bv = b.date_sold; }
    else if (sortCol === 'entry') { av = a.date_acquired; bv = b.date_acquired; }
    else if (sortCol === 'symbol'){ av = a.symbol; bv = b.symbol; }
    else if (sortCol === 'type')  { av = a.trade_type; bv = b.trade_type; }
    else if (sortCol === 'strike'){ av = a.strike_price ?? -Infinity; bv = b.strike_price ?? -Infinity; }
    else if (sortCol === 'qty')   { av = a.quantity; bv = b.quantity; }
    else if (sortCol === 'hold')  {
      const sa = _toSecs(a.exit_time) - _toSecs(a.entry_time);
      const sb = _toSecs(b.exit_time) - _toSecs(b.entry_time);
      av = (a.entry_time && a.exit_time && sa >= 0) ? sa : -Infinity;
      bv = (b.entry_time && b.exit_time && sb >= 0) ? sb : -Infinity;
    }
    else if (sortCol === 'tickerIn')  { av = a.ticker_at_entry ?? -Infinity; bv = b.ticker_at_entry ?? -Infinity; }
    else if (sortCol === 'tickerOut') { av = a.ticker_at_exit  ?? -Infinity; bv = b.ticker_at_exit  ?? -Infinity; }
    else if (sortCol === 'move')  { av = _move(a) ?? -Infinity; bv = _move(b) ?? -Infinity; }
    else if (sortCol === 'pnl')   { av = a.total_gl; bv = b.total_gl; }
    else { av = a.date_sold; bv = b.date_sold; }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return b.id - a.id;
  });

  // Derive unique brokers from actual data for the dropdown
  const brokerOptions = [...new Set(trades.map(t => t.broker || 'fidelity'))].sort();

  const hasFilters = search || fType || fResult || fBroker || fFrom || fTo;
  function clearFilters() { setSearch(''); setFType(''); setFResult(''); setFBroker(''); setFFrom(''); setFTo(''); setSortCol('date'); setSortDir('desc'); }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Trade Journal</div>
          <div className="page-sub">{filtered.length} trade{filtered.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn-save" onClick={onAddTrade}>＋ Add Trade</button>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search symbol or notes…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ width: 200 }} />
        <select value={fType} onChange={e => setFType(e.target.value)}>
          <option value="">All Types</option>
          <option>CALL</option><option>PUT</option><option>STOCK</option>
        </select>
        <select value={fResult} onChange={e => setFResult(e.target.value)}>
          <option value="">Win / Loss</option>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
        </select>
        <select value={fBroker} onChange={e => setFBroker(e.target.value)}>
          <option value="">All Brokers</option>
          {brokerOptions.map(b => (
            <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
          ))}
        </select>
        <input type="date" title="From date" value={fFrom} onChange={e => setFFrom(e.target.value)}
          style={{ colorScheme: 'dark' }} />
        <span style={{ color: 'var(--muted)', fontSize: '.8rem', alignSelf: 'center' }}>to</span>
        <input type="date" title="To date" value={fTo} onChange={e => setFTo(e.target.value)}
          style={{ colorScheme: 'dark' }} />
        {hasFilters && (
          <button onClick={clearFilters} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', padding: '4px 10px', cursor: 'pointer', fontSize: '.8rem' }}
            title="Clear all filters">✕ Clear</button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh col="symbol">Symbol</SortTh>
              <SortTh col="type">Type</SortTh>
              <SortTh col="strike">Strike</SortTh>
              <SortTh col="entry">Entry</SortTh>
              <SortTh col="date">Exit</SortTh>
              <SortTh col="qty">Qty</SortTh>
              <SortTh col="hold">Hold Time</SortTh>
              <SortTh col="tickerIn">Ticker In</SortTh>
              <SortTh col="tickerOut">Ticker Out</SortTh>
              <SortTh col="move">Move</SortTh>
              <SortTh col="pnl">P&amp;L</SortTh>
              <th>Result</th><th>Notes</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                  <td colSpan="14" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                  No trades match your filters.
                </td>
              </tr>
            ) : filtered.map(t => {
              const w        = t.total_gl > 0;
              const n        = t.total_gl === 0;
              const tc       = 'b-' + t.trade_type.toLowerCase();
              const hasNotes  = t.entry_reason || t.market_context || t.exit_notes || t.failure_reason || t.screenshot_b64;
              const isOpen    = expanded[t.id];
              const isHighlit = t.id === highlightId;

              return (
                <React.Fragment key={t.id}>
                  <tr
                    ref={isHighlit ? highlightRef : null}
                    onClick={() => { if (isHighlit && onHighlightClear) onHighlightClear(); toggleExpand(t.id); }}
                    style={isHighlit ? { background: 'rgba(59,130,246,.12)', outline: '2px solid var(--blue)', outlineOffset: '-2px' } : {}}
                  >
                    <td>
                      <strong>{t.symbol}</strong>
                      <div style={{ fontSize: '.72rem', color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description || ''}
                      </div>
                    </td>
                    <td><span className={`badge ${tc}`}>{t.trade_type}</span></td>
                    <td style={{ fontSize: '.82rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {(t.trade_type === 'CALL' || t.trade_type === 'PUT') && t.strike_price != null
                        ? t.strike_price
                        : <span style={{ color: 'var(--border)' }}>—</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '.82rem' }}>{fDate(t.date_acquired)}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '.82rem' }}>{fDate(t.date_sold)}</td>
                    <td>{t.quantity}</td>
                    <td style={{ fontSize: '.78rem', whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                      {(() => { const s = _toSecs(t.exit_time) - _toSecs(t.entry_time); return (t.entry_time && t.exit_time && s >= 0) ? _fDur(s) : <span style={{ color: 'var(--border)' }}>—</span>; })()}
                    </td>
                    <td style={{ fontSize: '.78rem', whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                      {t.ticker_at_entry != null ? t.ticker_at_entry : <span style={{ color: 'var(--border)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '.78rem', whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                      {t.ticker_at_exit != null ? t.ticker_at_exit : <span style={{ color: 'var(--border)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {(() => { const m = _move(t); return m != null ? <span style={{ color: m >= 0 ? 'var(--green)' : 'var(--red)' }}>{m >= 0 ? '+' : ''}{m.toFixed(1)}</span> : <span style={{ color: 'var(--border)' }}>—</span>; })()}
                    </td>
                    <td className={w ? 'ppos' : n ? '' : 'pneg'} style={{ fontWeight: 700 }}>{fMoney(t.total_gl, true)}</td>
                    <td><span className={`badge ${w ? 'b-win' : 'b-loss'}`}>{w ? 'Win' : 'Loss'}</span></td>
                    <td style={{ fontSize: '1rem' }}>{hasNotes ? '📝' : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="action-btn edit" onClick={e => { e.stopPropagation(); onEdit(t.id); }}>✏️</button>
                      <button className="action-btn del"  onClick={e => { e.stopPropagation(); onDelete(t.id); }}>✕</button>
                      {hasNotes && (
                        <button className="action-btn" onClick={e => { e.stopPropagation(); toggleExpand(t.id); }}>▼</button>
                      )}
                    </td>
                  </tr>

                  {hasNotes && isOpen && (
                    <tr className="trade-expand">
                      <td colSpan="14">
                        <div className="expand-grid">
                          {t.entry_reason   && <div className="expand-block"><label>📌 Why I took this trade</label><p dangerouslySetInnerHTML={{ __html: esc(t.entry_reason) }} /></div>}
                          {t.market_context && <div className="expand-block"><label>🌐 Market context</label><p dangerouslySetInnerHTML={{ __html: esc(t.market_context) }} /></div>}
                          {t.exit_notes     && <div className="expand-block"><label>📤 Exit notes</label><p dangerouslySetInnerHTML={{ __html: esc(t.exit_notes) }} /></div>}
                          {t.failure_reason && (
                            <div className="expand-block" style={{ gridColumn: '1 / -1' }}>
                              <label>❌ Lessons learned</label>
                              <p style={{ color: 'var(--red)' }} dangerouslySetInnerHTML={{ __html: esc(t.failure_reason) }} />
                            </div>
                          )}
                          {t.tags && <div className="expand-block"><label>🏷️ Tags</label><p>{t.tags}</p></div>}
                        </div>
                        {t.screenshot_b64 && (
                          <div style={{ marginTop: 10 }}>
                            <label style={{ fontSize: '.7rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>📸 SCREENSHOT</label>
                            <img className="expand-img" src={t.screenshot_b64} alt="screenshot"
                              onClick={() => onLightbox(t.screenshot_b64)} />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

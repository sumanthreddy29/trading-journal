import React, { useState, useEffect, useRef } from 'react';
import { fMoney, fDate, symBadgeClass, esc } from '../utils/helpers.js';

export default function Journal({ trades, highlightId, onHighlightClear, onAddTrade, onEdit, onDelete, onLightbox }) {
  const [search,  setSearch]  = useState('');
  const [fType,   setFType]   = useState('');
  const [fResult, setFResult] = useState('');
  const [fSort,   setFSort]   = useState('date_desc');
  const [expanded, setExpanded] = useState({});
  const highlightRef = useRef(null);

  // When arriving from calendar: clear filters, expand and scroll to the trade
  useEffect(() => {
    if (!highlightId) return;
    setSearch('');
    setFType('');
    setFResult('');
    setFSort('date_desc');
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
  if (fSort === 'date_desc') filtered.sort((a, b) => b.date_sold.localeCompare(a.date_sold) || b.id - a.id);
  if (fSort === 'date_asc')  filtered.sort((a, b) => a.date_sold.localeCompare(b.date_sold) || a.id - b.id);
  if (fSort === 'pnl_desc')  filtered.sort((a, b) => b.total_gl - a.total_gl);
  if (fSort === 'pnl_asc')   filtered.sort((a, b) => a.total_gl - b.total_gl);

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
        <select value={fSort} onChange={e => setFSort(e.target.value)}>
          <option value="date_desc">Date ↓</option>
          <option value="date_asc">Date ↑</option>
          <option value="pnl_desc">P&amp;L ↓</option>
          <option value="pnl_asc">P&amp;L ↑</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th><th>Type</th><th>Entry</th><th>Exit</th>
              <th>Qty</th><th>P&amp;L</th><th>Result</th><th>Notes</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
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
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '.82rem' }}>{fDate(t.date_acquired)}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '.82rem' }}>{fDate(t.date_sold)}</td>
                    <td>{t.quantity}</td>
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
                      <td colSpan="9">
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

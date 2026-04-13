import React from 'react';
import { fDateFull, fMoney } from '../utils/helpers.js';

export default function DayModal({ date, data, onClose, onTradeClick }) {
  if (!data?.details[date]) return null;
  const dd   = data.details[date];
  const gts  = [...dd.trades].sort((a, b) => b.total_gl - a.total_gl);
  const wins = gts.filter(t => t.total_gl > 0).length;
  const losses = gts.filter(t => t.total_gl < 0).length;

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-hdr">
          <h2>{fDateFull(date)} · {fMoney(dd.daily_pnl, true)}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Trades</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{gts.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Wins</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--green)' }}>{wins}</div>
            </div>
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Losses</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--red)' }}>{losses}</div>
            </div>
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Daily P&L</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: dd.daily_pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {fMoney(dd.daily_pnl, true)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gts.map((t, i) => {
              const w = t.total_gl >= 0;
              return (
                <div
                  key={i}
                  onClick={() => onTradeClick && onTradeClick(t.id)}
                  style={{
                    background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px',
                    borderLeft: `3px solid ${w ? 'var(--green)' : 'var(--red)'}`,
                    cursor: onTradeClick ? 'pointer' : 'default',
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => onTradeClick && (e.currentTarget.style.background = 'var(--border)')}
                  onMouseLeave={e => onTradeClick && (e.currentTarget.style.background = 'var(--surface2)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{t.description || t.symbol}</span>
                    <span style={{ fontWeight: 700, color: w ? 'var(--green)' : 'var(--red)' }}>{fMoney(t.total_gl, true)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                    <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                      {t.trade_type} · {(t.trade_type === 'CALL' || t.trade_type === 'PUT') && t.strike_price != null
                        ? `Strike ${t.strike_price}`
                        : `Qty ${t.quantity}`}
                    </span>
                    {onTradeClick && <span style={{ fontSize: '.68rem', color: 'var(--blue)' }}>View in journal →</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

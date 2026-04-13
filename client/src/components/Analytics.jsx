import React, { useMemo, useState } from 'react';
import { fMoney, fY, r2 } from '../utils/helpers.js';

// ── Pure-computation helpers ──────────────────────

function parseSlash(s) {
  if (!s) return null;
  const [m, d, y] = s.split('/');
  return new Date(+y, +m - 1, +d);
}

function holdDays(acquired, sold) {
  const a = parseSlash(acquired), b = parseSlash(sold);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m] + ' ' + y;
}

function computeStreaks(trades) {
  const sorted = [...trades].sort((a, b) =>
    a.date_sold.localeCompare(b.date_sold) || a.id - b.id
  );
  let curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;
  sorted.forEach(t => {
    if (t.total_gl > 0)      { curWin++; curLoss = 0; maxWin  = Math.max(maxWin,  curWin);  }
    else if (t.total_gl < 0) { curLoss++; curWin = 0; maxLoss = Math.max(maxLoss, curLoss); }
    else                     { curWin  = 0; curLoss = 0; }
  });
  return { curWin, curLoss, maxWin, maxLoss };
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function computeByDOW(trades) {
  const map = {};
  trades.forEach(t => {
    const d = parseSlash(t.date_sold);
    if (!d) return;
    const idx = d.getDay(); // 0=Sun … 6=Sat
    const lbl = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][idx];
    if (!map[lbl]) map[lbl] = { wins: 0, losses: 0, total: 0, pnl: 0 };
    map[lbl].total++;
    map[lbl].pnl = r2(map[lbl].pnl + t.total_gl);
    if (t.total_gl > 0)       map[lbl].wins++;
    else if (t.total_gl < 0)  map[lbl].losses++;
  });
  return DOW_LABELS.map(d => ({ day: d, ...(map[d] || { wins: 0, losses: 0, total: 0, pnl: 0 }) }));
}

function computeByType(trades) {
  const map = {};
  trades.forEach(t => {
    const k = t.trade_type || 'OTHER';
    if (!map[k]) map[k] = { wins: 0, losses: 0, total: 0, pnl: 0, holds: [] };
    map[k].total++;
    map[k].pnl = r2(map[k].pnl + t.total_gl);
    if (t.total_gl > 0)       map[k].wins++;
    else if (t.total_gl < 0)  map[k].losses++;
    const h = holdDays(t.date_acquired, t.date_sold);
    if (h !== null) map[k].holds.push(h);
  });
  return Object.entries(map).sort(([, a], [, b]) => b.total - a.total).map(([type, v]) => ({
    type,
    ...v,
    avgHold: v.holds.length ? r2(v.holds.reduce((s, x) => s + x, 0) / v.holds.length) : null,
  }));
}

function computeMonthly(trades) {
  const map = {};
  trades.forEach(t => {
    const [m, , y] = t.date_sold.split('/');
    const key = `${y}-${m.padStart(2, '0')}`;
    if (!map[key]) map[key] = { pnl: 0, wins: 0, losses: 0, total: 0 };
    map[key].pnl = r2(map[key].pnl + t.total_gl);
    map[key].total++;
    if (t.total_gl > 0)       map[key].wins++;
    else if (t.total_gl < 0)  map[key].losses++;
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18)
    .map(([key, v]) => ({ key, label: monthLabel(key), ...v }));
}

function computeByTag(trades) {
  const map = {};
  trades.forEach(t => {
    const tags = (t.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    tags.forEach(tag => {
      if (!map[tag]) map[tag] = { wins: 0, losses: 0, total: 0, pnl: 0 };
      map[tag].total++;
      map[tag].pnl = r2(map[tag].pnl + t.total_gl);
      if (t.total_gl > 0)       map[tag].wins++;
      else if (t.total_gl < 0)  map[tag].losses++;
    });
  });
  return Object.entries(map).sort(([, a], [, b]) => b.total - a.total).map(([tag, v]) => ({ tag, ...v }));
}

function computeHoldStats(trades) {
  const holds = trades
    .map(t => holdDays(t.date_acquired, t.date_sold))
    .filter(h => h !== null);
  if (!holds.length) return null;
  const avg = r2(holds.reduce((s, x) => s + x, 0) / holds.length);
  const max = Math.max(...holds);
  const min = Math.min(...holds);
  const same = holds.filter(h => h === 0).length;
  return { avg, max, min, same, total: holds.length };
}

// ── Small UI primitives ───────────────────────────

function Card({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 10, padding: '14px 18px',
      minWidth: 120, flex: 1,
    }}>
      <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function WinBar({ wins, total }) {
  if (!total) return <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>—</span>;
  const pct = Math.round(wins / total * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: pct >= 50 ? 'var(--green)' : 'var(--red)', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: '.78rem', fontWeight: 600, color: pct >= 50 ? 'var(--green)' : 'var(--red)', minWidth: 36 }}>{pct}%</span>
    </div>
  );
}

function SectionHeader({ dot, title }) {
  return (
    <div className="chart-hdr">
      <div className="chart-dot" style={{ background: dot }} />
      <div className="chart-title">{title}</div>
    </div>
  );
}

// ── Month-over-month mini bar chart ──────────────
function MonthBars({ months }) {
  if (!months.length) return null;
  const vals  = months.map(m => m.pnl);
  const absMax = Math.max(...vals.map(Math.abs), 1);
  const BAR_H  = 60;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: BAR_H + 30, paddingTop: 8 }}>
      {months.map(m => {
        const pct   = Math.abs(m.pnl) / absMax;
        const h     = Math.max(Math.round(pct * BAR_H), 3);
        const isPos = m.pnl >= 0;
        return (
          <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: '.58rem', color: isPos ? 'var(--green)' : 'var(--red)', fontWeight: 600, textAlign: 'center' }}>
              {fY(m.pnl)}
            </div>
            <div style={{
              width: '100%', height: h,
              background: isPos ? 'rgba(34,197,94,.5)' : 'rgba(239,68,68,.5)',
              borderRadius: '3px 3px 0 0',
              border: `1px solid ${isPos ? 'var(--green)' : 'var(--red)'}`,
            }} />
            <div style={{ fontSize: '.55rem', color: 'var(--muted)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
              {m.label.split(' ')[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────
export default function Analytics({ trades }) {
  const [tagSort, setTagSort] = useState('total'); // total | pnl | wr

  const hasData = trades.length > 0;

  const streaks  = useMemo(() => computeStreaks(trades),  [trades]);
  const byDOW    = useMemo(() => computeByDOW(trades),    [trades]);
  const byType   = useMemo(() => computeByType(trades),   [trades]);
  const monthly  = useMemo(() => computeMonthly(trades),  [trades]);
  const byTag    = useMemo(() => computeByTag(trades),    [trades]);
  const holdStats= useMemo(() => computeHoldStats(trades),[trades]);

  const sortedTags = useMemo(() => {
    const t = [...byTag];
    if (tagSort === 'pnl')   t.sort((a, b) => b.pnl - a.pnl);
    if (tagSort === 'wr')    t.sort((a, b) => (b.wins / (b.total||1)) - (a.wins / (a.total||1)));
    if (tagSort === 'total') t.sort((a, b) => b.total - a.total);
    return t;
  }, [byTag, tagSort]);

  // Month-over-month summary
  const lastTwo = monthly.slice(-2);
  const momDelta = lastTwo.length === 2 ? r2(lastTwo[1].pnl - lastTwo[0].pnl) : null;

  if (!hasData) {
    return (
      <div>
        <div className="page-header">
          <div><div className="page-title">Analytics</div><div className="page-sub">Add trades to see performance analytics</div></div>
        </div>
        <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>No trade data yet.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-sub">Performance breakdown across {trades.length} trades</div>
        </div>
      </div>

      {/* ── Streak cards ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Card
          label="Current Win Streak"
          value={streaks.curWin}
          sub={streaks.curWin > 0 ? '🔥 active' : 'not on a streak'}
          color={streaks.curWin > 0 ? 'var(--green)' : undefined}
        />
        <Card
          label="Current Loss Streak"
          value={streaks.curLoss}
          sub={streaks.curLoss > 0 ? '🧊 active' : 'not on a streak'}
          color={streaks.curLoss > 0 ? 'var(--red)' : undefined}
        />
        <Card
          label="Best Win Streak"
          value={streaks.maxWin}
          sub="all time"
          color="var(--green)"
        />
        <Card
          label="Worst Loss Streak"
          value={streaks.maxLoss}
          sub="all time"
          color="var(--red)"
        />
        {holdStats && (
          <Card
            label="Avg Hold Time"
            value={holdStats.avg === 0 ? 'Same day' : `${holdStats.avg}d`}
            sub={`${holdStats.same} same-day trades`}
          />
        )}
        {momDelta !== null && (
          <Card
            label="vs Last Month"
            value={fMoney(momDelta, true)}
            sub={`${lastTwo[1].label} vs ${lastTwo[0].label}`}
            color={momDelta >= 0 ? 'var(--green)' : 'var(--red)'}
          />
        )}
      </div>

      {/* ── By Type + By DOW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 14 }}>

        {/* Trade Type breakdown */}
        <div className="chart-card">
          <SectionHeader dot="var(--blue)" title="By Trade Type" />
          <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--muted)', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <th style={{ textAlign: 'left', paddingBottom: 8 }}>Type</th>
                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Trades</th>
                <th style={{ textAlign: 'left', paddingBottom: 8, paddingLeft: 12 }}>Win Rate</th>
                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Net P&L</th>
                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Avg Hold</th>
              </tr>
            </thead>
            <tbody>
              {byType.map(r => (
                <tr key={r.type} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0' }}>
                    <span className={`badge b-${r.type.toLowerCase()}`}>{r.type}</span>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{r.total}</td>
                  <td style={{ paddingLeft: 12, minWidth: 120 }}><WinBar wins={r.wins} total={r.total} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: r.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fMoney(r.pnl, true)}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)', fontSize: '.75rem' }}>
                    {r.avgHold === null ? '—' : r.avgHold === 0 ? 'Same day' : `${r.avgHold}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Day of Week breakdown */}
        <div className="chart-card">
          <SectionHeader dot="var(--purple)" title="By Day of Week" />
          <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--muted)', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <th style={{ textAlign: 'left', paddingBottom: 8 }}>Day</th>
                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Trades</th>
                <th style={{ textAlign: 'left', paddingBottom: 8, paddingLeft: 12 }}>Win Rate</th>
                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {byDOW.map(r => (
                <tr key={r.day} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0', fontWeight: 600 }}>{r.day}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{r.total || '—'}</td>
                  <td style={{ paddingLeft: 12, minWidth: 120 }}><WinBar wins={r.wins} total={r.total} /></td>
                  <td style={{ textAlign: 'right', fontWeight: r.total ? 700 : 400, color: r.total ? (r.pnl >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--muted)' }}>
                    {r.total ? fMoney(r.pnl, true) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Monthly P&L ── */}
      <div className="chart-card" style={{ marginBottom: 14 }}>
        <SectionHeader dot="var(--cyan)" title="Monthly P&L" />
        {monthly.length > 0 ? (
          <>
            <MonthBars months={monthly} />
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <th style={{ textAlign: 'left', paddingBottom: 8 }}>Month</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Trades</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Wins</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Losses</th>
                    <th style={{ textAlign: 'left', paddingBottom: 8, paddingLeft: 12 }}>Win Rate</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Net P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthly].reverse().map(m => (
                    <tr key={m.key} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', fontWeight: 600 }}>{m.label}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{m.total}</td>
                      <td style={{ textAlign: 'right', color: 'var(--green)' }}>{m.wins}</td>
                      <td style={{ textAlign: 'right', color: 'var(--red)' }}>{m.losses}</td>
                      <td style={{ paddingLeft: 12, minWidth: 120 }}><WinBar wins={m.wins} total={m.total} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: m.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {fMoney(m.pnl, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--muted)', padding: 20 }}>No data.</div>
        )}
      </div>

      {/* ── Tags / Setups ── */}
      <div className="chart-card" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="chart-dot" style={{ background: 'var(--orange)' }} />
            <div className="chart-title">Tags &amp; Setups</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['total', '# Trades'], ['pnl', 'P&L'], ['wr', 'Win Rate']].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTagSort(k)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '.75rem',
                  background: tagSort === k ? 'var(--blue)' : 'var(--bg)',
                  color: tagSort === k ? '#fff' : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >{l}</button>
            ))}
          </div>
        </div>
        {sortedTags.length === 0 ? (
          <div style={{ color: 'var(--muted)', padding: '12px 0', fontSize: '.85rem' }}>
            No tags found. Add tags to your trades (e.g. "VWAP bounce, breakout") to see setup performance.
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--muted)', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <th style={{ textAlign: 'left', paddingBottom: 8 }}>Setup / Tag</th>
                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Trades</th>
                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Wins</th>
                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Losses</th>
                <th style={{ textAlign: 'left', paddingBottom: 8, paddingLeft: 12 }}>Win Rate</th>
                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Net P&L</th>
                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Avg P&L</th>
              </tr>
            </thead>
            <tbody>
              {sortedTags.map(r => (
                <tr key={r.tag} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0' }}>
                    <span style={{ background: 'var(--surface2)', padding: '2px 8px', borderRadius: 4, fontSize: '.78rem' }}>{r.tag}</span>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{r.total}</td>
                  <td style={{ textAlign: 'right', color: 'var(--green)' }}>{r.wins}</td>
                  <td style={{ textAlign: 'right', color: 'var(--red)' }}>{r.losses}</td>
                  <td style={{ paddingLeft: 12, minWidth: 120 }}><WinBar wins={r.wins} total={r.total} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: r.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fMoney(r.pnl, true)}
                  </td>
                  <td style={{ textAlign: 'right', color: r.pnl / r.total >= 0 ? 'var(--green)' : 'var(--red)', fontSize: '.78rem' }}>
                    {fMoney(r2(r.pnl / r.total), true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

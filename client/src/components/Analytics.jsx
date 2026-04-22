import React, { useMemo, useState, useEffect, useRef } from 'react';
import { fMoney, fY, r2 } from '../utils/helpers.js';
import { drawHistogram, drawDOW } from '../utils/canvas.js';

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

// ── Intraday hold duration analysis ─────────────
function timeToSecs(t) {
  if (!t) return null;
  const parts = t.split(':').map(Number);
  return parts[0] * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

function fDuration(secs) {
  if (secs == null || secs < 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function computeIntradayStats(trades) {
  const withTime = trades.filter(t => t.entry_time && t.exit_time);
  if (!withTime.length) return null;

  const rows = withTime.map(t => {
    const enS = timeToSecs(t.entry_time);
    const exS = timeToSecs(t.exit_time);
    const dur = exS != null && enS != null ? exS - enS : null;
    return { ...t, durSecs: dur };
  }).filter(r => r.durSecs != null && r.durSecs >= 0);

  if (!rows.length) return null;

  const wins   = rows.filter(r => r.total_gl > 0);
  const losses = rows.filter(r => r.total_gl < 0);
  const avg    = arr => arr.length ? Math.round(arr.reduce((s, r) => s + r.durSecs, 0) / arr.length) : null;

  // Bucket by hold duration: <5m, 5–15m, 15–60m, >1h
  const buckets = [
    { label: '< 5 min',   min: 0,    max: 300,   rows: [] },
    { label: '5–15 min',  min: 300,  max: 900,   rows: [] },
    { label: '15–60 min', min: 900,  max: 3600,  rows: [] },
    { label: '> 1 hour',  min: 3600, max: Infinity, rows: [] },
  ];
  rows.forEach(r => {
    const b = buckets.find(b => r.durSecs >= b.min && r.durSecs < b.max);
    if (b) b.rows.push(r);
  });
  const bucketStats = buckets
    .filter(b => b.rows.length)
    .map(b => ({
      label:  b.label,
      total:  b.rows.length,
      wins:   b.rows.filter(r => r.total_gl > 0).length,
      losses: b.rows.filter(r => r.total_gl < 0).length,
      pnl:    r2(b.rows.reduce((s, r) => s + r.total_gl, 0)),
    }));

  // Hour-of-day entry analysis (which entry hour performs best)
  const hourMap = {};
  rows.forEach(r => {
    const h = Math.floor(timeToSecs(r.entry_time) / 3600);
    const lbl = `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
    if (!hourMap[lbl]) hourMap[lbl] = { wins: 0, losses: 0, total: 0, pnl: 0, hour: h };
    hourMap[lbl].total++;
    hourMap[lbl].pnl = r2(hourMap[lbl].pnl + r.total_gl);
    if (r.total_gl > 0) hourMap[lbl].wins++;
    else if (r.total_gl < 0) hourMap[lbl].losses++;
  });
  const hourStats = Object.entries(hourMap)
    .sort(([, a], [, b]) => a.hour - b.hour)
    .map(([label, v]) => ({ label, ...v }));

  return {
    total:       rows.length,
    avgDurAll:   avg(rows),
    avgDurWins:  avg(wins),
    avgDurLoss:  avg(losses),
    bucketStats,
    hourStats,
  };
}

// ── Options entry quality analysis ───────────────
function computeOptionsEntryAnalysis(trades) {
  // Only trades with underlying entry price + strike — the new fields
  const optTrades = trades.filter(t =>
    (t.trade_type === 'CALL' || t.trade_type === 'PUT') &&
    t.ticker_at_entry != null && t.strike_price != null && t.buy_price > 0
  );
  if (!optTrades.length) return null;

  const isCall = t => t.trade_type === 'CALL';

  function getMoneyness(t) {
    const { ticker_at_entry: te, strike_price: sp } = t;
    if (Math.abs(te - sp) < sp * 0.002) return 'ATM';
    return isCall(t) ? (te > sp ? 'ITM' : 'OTM') : (te < sp ? 'ITM' : 'OTM');
  }

  function getIntrinsic(t) {
    const { ticker_at_entry: te, strike_price: sp } = t;
    return Math.max(0, isCall(t) ? te - sp : sp - te);
  }

  function getExtrinsicPct(t) {
    const buyPerShare = (t.buy_price || 0) / 100;
    if (!buyPerShare) return null;
    const intrinsic = getIntrinsic(t);
    const extrinsic = Math.max(0, buyPerShare - intrinsic);
    return Math.round(extrinsic / buyPerShare * 100);
  }

  // Moneyness groups
  const mGroups = { ITM: [], ATM: [], OTM: [] };
  optTrades.forEach(t => mGroups[getMoneyness(t)].push(t));
  const mStats = Object.entries(mGroups).map(([label, arr]) => {
    if (!arr.length) return null;
    const wins = arr.filter(t => t.total_gl > 0).length;
    const pnl  = r2(arr.reduce((s, t) => s + t.total_gl, 0));
    return { label, total: arr.length, wins, losses: arr.filter(t => t.total_gl < 0).length, pnl, avgPnl: r2(pnl / arr.length) };
  }).filter(Boolean);

  // Move captured — only trades that also have ticker_at_exit
  const withMove = optTrades.filter(t => t.ticker_at_exit != null);
  const moveStats = withMove.length ? (() => {
    const wins   = withMove.filter(t => t.total_gl > 0);
    const losses = withMove.filter(t => t.total_gl < 0);
    const avgFav = arr => arr.length
      ? r2(arr.reduce((s, t) => s + (isCall(t) ? t.ticker_at_exit - t.ticker_at_entry : t.ticker_at_entry - t.ticker_at_exit), 0) / arr.length)
      : null;
    const avgAbs = arr => arr.length
      ? r2(arr.reduce((s, t) => s + Math.abs(isCall(t) ? t.ticker_at_exit - t.ticker_at_entry : t.ticker_at_entry - t.ticker_at_exit), 0) / arr.length)
      : null;
    return { total: withMove.length, avgMoveWins: avgFav(wins), avgMoveLosses: avgFav(losses), avgAbsMove: avgAbs(withMove) };
  })() : null;

  // Extrinsic buckets — uses optTrades (all have entry price so intrinsic is accurate)
  const extBuckets = { 'Low <30%': [], 'Mid 30–70%': [], 'High >70%': [] };
  optTrades.forEach(t => {
    const pct = getExtrinsicPct(t);
    if (pct === null) return;
    if (pct < 30)      extBuckets['Low <30%'].push(t);
    else if (pct < 70) extBuckets['Mid 30–70%'].push(t);
    else               extBuckets['High >70%'].push(t);
  });
  const extStats = Object.entries(extBuckets).map(([label, arr]) => {
    if (!arr.length) return null;
    const wins = arr.filter(t => t.total_gl > 0).length;
    const pnl  = r2(arr.reduce((s, t) => s + t.total_gl, 0));
    return { label, total: arr.length, wins, pnl };
  }).filter(Boolean);

  // CALL vs PUT breakdown
  const typeGroups = {};
  optTrades.forEach(t => {
    const k = t.trade_type;
    if (!typeGroups[k]) typeGroups[k] = { wins: 0, losses: 0, total: 0, pnl: 0 };
    typeGroups[k].total++;
    typeGroups[k].pnl = r2(typeGroups[k].pnl + t.total_gl);
    if (t.total_gl > 0) typeGroups[k].wins++;
    else if (t.total_gl < 0) typeGroups[k].losses++;
  });
  const typeStats = Object.entries(typeGroups).map(([label, v]) => ({ label, ...v, avgPnl: r2(v.pnl / v.total) }));

  return { mStats, moveStats, extStats, typeStats, total: optTrades.length, withMoveCount: withMove.length };
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
export default function Analytics({ trades, data }) {
  const [tagSort, setTagSort] = useState('total'); // total | pnl | wr
  const histRef = useRef(null);
  const dowChartRef = useRef(null);

  const hasData = trades.length > 0;

  const streaks  = useMemo(() => computeStreaks(trades),  [trades]);
  const byDOW    = useMemo(() => computeByDOW(trades),    [trades]);
  const byType   = useMemo(() => computeByType(trades),   [trades]);
  const monthly  = useMemo(() => computeMonthly(trades),  [trades]);
  const byTag    = useMemo(() => computeByTag(trades),    [trades]);
  const holdStats= useMemo(() => computeHoldStats(trades),[trades]);
  const optEntry    = useMemo(() => computeOptionsEntryAnalysis(trades), [trades]);
  const intradayStats = useMemo(() => computeIntradayStats(trades), [trades]);

  // Daily P&L values for histogram
  const dailyPnlVals = useMemo(() => {
    if (!data) return [];
    return data.dates.map(d => data.dpnl[d]);
  }, [data]);

  useEffect(() => {
    if (dailyPnlVals.length > 0) {
      drawHistogram(histRef.current, dailyPnlVals, 160);
    }
  }, [dailyPnlVals]);

  useEffect(() => {
    if (byDOW.length > 0) {
      const labels = byDOW.map(r => r.day);
      const vals   = byDOW.map(r => r.pnl);
      drawDOW(dowChartRef.current, labels, vals, 160);
    }
  }, [byDOW]);

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

      {/* ── Streak/advanced summary cards ── */}
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
        {data?.s?.sharpe != null && (
          <Card label="Sharpe Ratio" value={data.s.sharpe} sub="annualised" color="var(--purple)" />
        )}
        {data?.s?.calmar != null && (
          <Card label="Calmar Ratio" value={data.s.calmar} sub="ann. return / max DD" color="var(--cyan)" />
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

      {/* ── Monthly Gross Breakdown ── */}
      {data?.monthlyGross && Object.keys(data.monthlyGross).length > 0 && (() => {
        const grossKeys = Object.keys(data.monthlyGross).sort().reverse();
        return (
          <div className="chart-card" style={{ marginBottom: 14, overflowX: 'auto' }}>
            <SectionHeader dot="var(--purple)" title="Monthly Gross Breakdown" />
            <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr style={{ color: 'var(--muted)', fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px 10px' }}>Month</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px 10px', color: 'var(--green)' }}>Gross Profit</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px 10px', color: 'var(--red)' }}>Gross Loss</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px 10px' }}>Net P&L</th>
                  <th style={{ textAlign: 'center', padding: '6px 10px 10px', color: 'var(--green)' }}>Win Days</th>
                  <th style={{ textAlign: 'center', padding: '6px 10px 10px', color: 'var(--red)' }}>Loss Days</th>
                </tr>
              </thead>
              <tbody>
                {grossKeys.map(k => {
                  const g = data.monthlyGross[k];
                  return (
                    <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{monthLabel(k)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{g.grossProfit > 0 ? fMoney(g.grossProfit, true) : '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--red)',   fontWeight: 600 }}>{g.grossLoss < 0 ? fMoney(g.grossLoss, true) : '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: g.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fMoney(g.net, true)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--green)' }}>{g.winDays}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--red)' }}>{g.lossDays}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

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

      {/* ── P&L by Day of Week chart ── */}
      <div className="chart-card" style={{ marginTop: 14 }}>
        <SectionHeader dot="var(--yellow)" title="Daily P&L by Day of Week" />
        <canvas ref={dowChartRef} style={{ width: '100%' }} />
      </div>

      {/* ── Daily P&L Distribution histogram ── */}
      {dailyPnlVals.length > 0 && (
        <div className="chart-card" style={{ marginTop: 14 }}>
          <SectionHeader dot="var(--cyan)" title="Daily P&L Distribution" />
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 8 }}>
            How often your results land in each profit/loss range
          </div>
          <canvas ref={histRef} style={{ width: '100%' }} />
        </div>
      )}

      {/* ── Options Entry Analysis ── */}
      {optEntry && (
        <div style={{ marginTop: 14 }}>
          <div className="chart-card" style={{ marginBottom: 14 }}>
            <SectionHeader dot="var(--orange)" title={`Options Entry Analysis · ${optEntry.total} trades with underlying entry price`} />

            {/* Moneyness breakdown */}
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8, marginTop: 4 }}>
              Win Rate by Moneyness at Entry
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {optEntry.mStats.map(r => {
                const wr = r.total ? Math.round(r.wins / r.total * 100) : 0;
                const col = r.label === 'ITM' ? 'var(--green)' : r.label === 'OTM' ? 'var(--red)' : 'var(--yellow)';
                return (
                  <div key={r.label} style={{ flex: 1, minWidth: 120, background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', border: `1px solid ${col}44` }}>
                    <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginBottom: 4 }}>
                      {r.label} <span style={{ color: 'var(--muted)' }}>({r.total} trades)</span>
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: col }}>{wr}%</div>
                    <div style={{ marginTop: 6 }}><WinBar wins={r.wins} total={r.total} /></div>
                    <div style={{ fontSize: '.7rem', color: r.pnl >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 6, fontWeight: 600 }}>
                      {fMoney(r.pnl, true)} net · {fMoney(r.avgPnl, true)} avg
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Extrinsic paid breakdown */}
            {optEntry.extStats.length > 0 && (
              <>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                  Win Rate by Premium Composition (Extrinsic % of Premium Paid)
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 10 }}>
                  High extrinsic = mostly time value — theta works against you on holds
                </div>
                <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse', marginBottom: 16 }}>
                  <thead>
                    <tr style={{ color: 'var(--muted)', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      <th style={{ textAlign: 'left', paddingBottom: 8 }}>Extrinsic Bucket</th>
                      <th style={{ textAlign: 'right', paddingBottom: 8 }}>Trades</th>
                      <th style={{ textAlign: 'left', paddingBottom: 8, paddingLeft: 12 }}>Win Rate</th>
                      <th style={{ textAlign: 'right', paddingBottom: 8 }}>Net P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optEntry.extStats.map(r => (
                      <tr key={r.label} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 0', fontWeight: 600 }}>
                          <span style={{
                            background: r.label.startsWith('High') ? 'rgba(239,68,68,.15)' : r.label.startsWith('Low') ? 'rgba(34,197,94,.15)' : 'rgba(234,179,8,.15)',
                            color: r.label.startsWith('High') ? 'var(--red)' : r.label.startsWith('Low') ? 'var(--green)' : 'var(--yellow)',
                            padding: '2px 8px', borderRadius: 4, fontSize: '.78rem'
                          }}>{r.label}</span>
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{r.total}</td>
                        <td style={{ paddingLeft: 12, minWidth: 120 }}><WinBar wins={r.wins} total={r.total} /></td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {fMoney(r.pnl, true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Move captured on wins vs losses */}
            {optEntry.moveStats && (
              <>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                  Underlying Move Captured — Wins vs Losses
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140, background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>AVG MOVE ON WINS</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--green)' }}>
                      {optEntry.moveStats.avgMoveWins !== null ? `+${optEntry.moveStats.avgMoveWins.toFixed(1)} pts` : '—'}
                    </div>
                    <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 3 }}>favorable direction</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 140, background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>AVG MOVE ON LOSSES</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--red)' }}>
                      {optEntry.moveStats.avgMoveLosses !== null ? `${optEntry.moveStats.avgMoveLosses.toFixed(1)} pts` : '—'}
                    </div>
                    <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 3 }}>favorable direction</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 140, background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>AVG ABS MOVE</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                      {optEntry.moveStats.avgAbsMove !== null ? `${optEntry.moveStats.avgAbsMove.toFixed(1)} pts` : '—'}
                    </div>
                    <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 3 }}>across {optEntry.moveStats.total} trades</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Intraday Hold Duration Analysis ── */}
      {intradayStats && (
        <div style={{ marginTop: 14 }}>
          <div className="chart-card">
            <SectionHeader dot="var(--cyan)" title={`Intraday Hold Duration · ${intradayStats.total} trades with entry & exit times`} />

            {/* Summary cards */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, marginTop: 4 }}>
              <div style={{ flex: 1, minWidth: 130, background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>AVG HOLD — ALL</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{fDuration(intradayStats.avgDurAll)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 130, background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>AVG HOLD — WINS</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--green)' }}>{fDuration(intradayStats.avgDurWins)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 130, background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>AVG HOLD — LOSSES</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--red)' }}>{fDuration(intradayStats.avgDurLoss)}</div>
              </div>
            </div>

            {/* Duration buckets */}
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
              Win Rate by Hold Duration
            </div>
            <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ color: 'var(--muted)', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  <th style={{ textAlign: 'left', paddingBottom: 8 }}>Duration</th>
                  <th style={{ textAlign: 'right', paddingBottom: 8 }}>Trades</th>
                  <th style={{ textAlign: 'right', paddingBottom: 8 }}>Wins</th>
                  <th style={{ textAlign: 'right', paddingBottom: 8 }}>Losses</th>
                  <th style={{ textAlign: 'left', paddingBottom: 8, paddingLeft: 12 }}>Win Rate</th>
                  <th style={{ textAlign: 'right', paddingBottom: 8 }}>Net P&L</th>
                </tr>
              </thead>
              <tbody>
                {intradayStats.bucketStats.map(b => (
                  <tr key={b.label} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>{b.label}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{b.total}</td>
                    <td style={{ textAlign: 'right', color: 'var(--green)' }}>{b.wins}</td>
                    <td style={{ textAlign: 'right', color: 'var(--red)' }}>{b.losses}</td>
                    <td style={{ paddingLeft: 12, minWidth: 120 }}><WinBar wins={b.wins} total={b.total} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: b.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fMoney(b.pnl, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Entry hour breakdown */}
            {intradayStats.hourStats.length > 1 && (
              <>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                  Performance by Entry Hour
                </div>
                <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--muted)', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      <th style={{ textAlign: 'left', paddingBottom: 8 }}>Hour</th>
                      <th style={{ textAlign: 'right', paddingBottom: 8 }}>Trades</th>
                      <th style={{ textAlign: 'left', paddingBottom: 8, paddingLeft: 12 }}>Win Rate</th>
                      <th style={{ textAlign: 'right', paddingBottom: 8 }}>Net P&L</th>
                      <th style={{ textAlign: 'right', paddingBottom: 8 }}>Avg P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intradayStats.hourStats.map(h => (
                      <tr key={h.label} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 0', fontWeight: 600 }}>{h.label}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{h.total}</td>
                        <td style={{ paddingLeft: 12, minWidth: 120 }}><WinBar wins={h.wins} total={h.total} /></td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: h.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {fMoney(h.pnl, true)}
                        </td>
                        <td style={{ textAlign: 'right', color: (h.pnl / h.total) >= 0 ? 'var(--green)' : 'var(--red)', fontSize: '.78rem' }}>
                          {fMoney(r2(h.pnl / h.total), true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { fMoney, fDate, fY, symBadgeClass } from '../utils/helpers.js';
import { drawLine, drawBars, drawMonthly, drawDonut, drawDrawdown } from '../utils/canvas.js';

const MONTHS_SHORT = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const DONUT_COLORS = ['#3b82f6','#a855f7','#eab308','#22c55e','#06b6d4'];

// ── Goal Tracker ──────────────────────────────────
function GoalTracker({ settings, withdrawals, totalPnl, avgDailyPnl, onSettingsChange }) {
  const goal        = parseFloat(settings?.tj_goal     || 50000);
  const startBal    = parseFloat(settings?.tj_start_bal || 0);
  const rhWithdrawn = parseFloat(settings?.tj_rh_withdrawn || 0);
  const fidWithdrawn = (withdrawals || []).reduce((s, w) => s + w.amount, 0);
  const totalWithdrawn = fidWithdrawn + rhWithdrawn;
  const earned   = totalPnl || 0;
  const pct      = goal > 0 ? Math.min(100, Math.max(0, (earned / goal) * 100)) : 0;
  const needed   = Math.max(0, goal - earned);

  // Trading days left in calendar year
  const today = new Date();
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  let tradingDaysLeft = 0;
  for (let d = new Date(today); d <= yearEnd; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) tradingDaysLeft++;
  }
  const neededPerDay = tradingDaysLeft > 0 ? (needed / tradingDaysLeft) : 0;
  const daysToGoal   = avgDailyPnl > 0 ? Math.ceil(needed / avgDailyPnl) : null;

  return (
    <div className="goal-banner">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🎯</span>
          <span>2026 Goal: <span style={{ color: 'var(--green)' }}>{fMoney(goal)}</span></span>
          <button className="goal-edit-btn" onClick={() => {
            const v = prompt('Set goal amount ($):', goal);
            if (v !== null && !isNaN(parseFloat(v))) onSettingsChange('tj_goal', parseFloat(v));
          }} title="Edit goal">✏️</button>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            ['Earned So Far', fMoney(earned, true), earned >= 0 ? 'var(--green)' : 'var(--red)'],
            ['Still Needed',  fMoney(needed),        'var(--text)'],
            ['Trading Days Left', tradingDaysLeft,   'var(--cyan)'],
            ['Needed / Day',  neededPerDay > 0 ? fMoney(neededPerDay) : '—', 'var(--yellow)'],
            ['Pace (at avg)', daysToGoal ? daysToGoal + ' days' : '—', 'var(--muted)'],
            ['Total Withdrawn', fMoney(totalWithdrawn, true), 'var(--purple)'],
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '.63rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{lbl}</div>
              <div style={{ fontSize: '.9rem', fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 8, height: 12, overflow: 'hidden', position: 'relative' }}>
        <div style={{ height: '100%', borderRadius: 8, width: pct + '%', transition: 'width .6s ease', background: pct >= 100 ? 'linear-gradient(90deg,var(--cyan),var(--purple))' : 'linear-gradient(90deg,var(--green),var(--cyan))' }} />
        <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '.65rem', fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
          {pct.toFixed(1)}%
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: '.62rem', color: 'var(--muted)' }}>
        <span>$0</span><span>{fMoney(goal * 0.25)}</span><span>{fMoney(goal * 0.5)}</span><span>{fMoney(goal * 0.75)}</span><span>{fMoney(goal)}</span>
      </div>
    </div>
  );
}

export default function Dashboard({ data, settings, withdrawals, onRefresh, onDayClick, onSettingsChange }) {
  const cumulRef    = useRef(null);
  const dailyRef    = useRef(null);
  const monthlyRef  = useRef(null);
  const donutRef    = useRef(null);
  const drawdownRef = useRef(null);
  const [cumulFilter, setCumulFilter] = useState('ALL');

  const filteredCumul = useMemo(() => {
    if (!data) return { labels: [], vals: [] };
    const { dates, dpnl } = data;
    const now = new Date();
    let cutoff = null;
    if (cumulFilter === '1D') cutoff = new Date(now); // today only
    else if (cumulFilter === '1W') { cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7); }
    else if (cumulFilter === '1M') { cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); }
    else if (cumulFilter === '3M') { cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); }
    else if (cumulFilter === 'YTD') cutoff = new Date(now.getFullYear(), 0, 1);

    const filtered = cutoff
      ? dates.filter(d => { const [m,dy,y] = d.split('/'); return new Date(+y,+m-1,+dy) >= cutoff; })
      : dates;

    // Recompute cumulative from the filtered start
    let run = 0, origin = 0;
    if (cutoff && filtered.length < dates.length) {
      const idx = dates.indexOf(filtered[0]);
      for (let i = 0; i < idx; i++) run += dpnl[dates[i]];
      origin = run;
    }
    const vals = filtered.map(d => { run += dpnl[d] - (filtered[0] === d && origin ? 0 : 0); return Math.round(run * 100) / 100; });
    // Actually rebuild properly:
    let cum2 = 0;
    if (cutoff && filtered.length < dates.length) {
      const startIdx = dates.indexOf(filtered[0]);
      for (let i = 0; i < startIdx; i++) cum2 += dpnl[dates[i]];
    }
    const vals2 = filtered.map(d => { cum2 = Math.round((cum2 + dpnl[d]) * 100) / 100; return cum2; });

    const labels = filtered.map(d => { const p = d.split('/'); return MONTHS_SHORT[+p[0]] + ' ' + parseInt(p[1]); });
    return { labels, vals: vals2 };
  }, [data, cumulFilter]);

  useEffect(() => {
    if (!data) return;
    const { dates, dpnl, monthly, byType, drawdownSeries } = data;
    const dailyLabels = dates.map(d => { const p = d.split('/'); return MONTHS_SHORT[+p[0]] + ' ' + parseInt(p[1]); });

    drawLine(cumulRef.current,   'cumul',   filteredCumul.labels, filteredCumul.vals, 240);
    drawBars(dailyRef.current,   'daily',   dailyLabels, dates.map(d => dpnl[d]), 220);
    drawDrawdown(drawdownRef.current, 'dd', dailyLabels, drawdownSeries, 150);
    const mk   = Object.keys(monthly).sort();
    const mLbl = mk.map(k => { const p = k.split('-'); return MONTHS_SHORT[+p[1]] + ' ' + p[0]; });
    drawMonthly(monthlyRef.current, mLbl, mk.map(k => monthly[k]), 180);
    const typeK = Object.keys(byType);
    drawDonut(donutRef.current, typeK.map(k => byType[k].trades), DONUT_COLORS, 180);
  }, [data, filteredCumul]);

  const header = (
    <div className="page-header">
      <div>
        <div className="page-title">Dashboard</div>
        <div className="page-sub">
          {data ? `${fDate(data.dates[0])} – ${fDate(data.dates[data.dates.length - 1])}` : 'No trades yet.'}
        </div>
      </div>
      <button className="action-btn" onClick={onRefresh} style={{ padding: '7px 14px' }}>↻ Refresh</button>
    </div>
  );

  if (!data) return <div>{header}</div>;

  const { dates, dpnl, monthly, monthlyGross, byInst, byType, details, s } = data;
  const typeK   = Object.keys(byType);
  const typeTotal = typeK.reduce((sum, k) => sum + byType[k].trades, 0) || 1;
  const instK   = Object.keys(byInst).sort((a, b) => byInst[b].pnl - byInst[a].pnl);
  const fidWithdrawn = (withdrawals || []).reduce((sum, w) => sum + w.amount, 0);
  const rhWithdrawn  = parseFloat(settings?.tj_rh_withdrawn || 0);

  // Build calendar months
  const monthSet = new Set();
  dates.forEach(d => { const p = d.split('/'); monthSet.add(p[2] + '-' + p[0].padStart(2, '0')); });
  const months = [...monthSet].sort();

  const perfRows = [
    { lbl: 'Win Rate',         val: <span className="ppos" style={{ fontWeight: 700 }}>{s.winRate}%</span>, bar: s.winRate },
    { lbl: 'Profit Factor',    val: <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>{s.profitFactor}x</span> },
    { lbl: 'Max Win Streak',   val: <span>🔥 <span style={{ fontWeight: 600 }}>{s.mw} days</span></span> },
    { lbl: 'Max Loss Streak',  val: <span>📉 <span style={{ fontWeight: 600 }}>{s.ml} days</span></span> },
    { lbl: 'Avg Win Day',      val: <span className="ppos" style={{ fontWeight: 600 }}>{fMoney(s.avgWin, true)}</span> },
    { lbl: 'Avg Loss Day',     val: <span className="pneg" style={{ fontWeight: 600 }}>{fMoney(s.avgLoss, true)}</span> },
    { lbl: 'Same-Day Trades',  val: <span style={{ fontWeight: 600 }}>{s.sameDays} / {s.totalTrades}</span> },
    { lbl: 'Max Drawdown',     val: <span className="pneg" style={{ fontWeight: 600 }}>{s.maxDrawdown > 0 ? fMoney(-s.maxDrawdown, true) : '—'}</span> },
    { lbl: 'Expectancy / Day', val: <span style={{ fontWeight: 600, color: s.expectancy >= 0 ? 'var(--green)' : 'var(--red)' }}>{fMoney(s.expectancy, true)}</span> },
    { lbl: 'Volatility',       val: <span style={{ fontWeight: 600, color: 'var(--yellow)' }}>{fMoney(s.volatility)}</span> },
    { lbl: 'Sharpe Ratio',     val: <span style={{ fontWeight: 600, color: 'var(--purple)' }}>{s.sharpe ?? '—'}</span> },
    { lbl: 'Calmar Ratio',     val: <span style={{ fontWeight: 600, color: 'var(--cyan)' }}>{s.calmar ?? '—'}</span> },
    { lbl: 'Recovery Factor',  val: <span style={{ fontWeight: 600, color: 'var(--orange)' }}>{s.recoveryFactor ?? '—'}</span> },
  ];

  // Monthly gross breakdown sorted
  const grossKeys = Object.keys(monthlyGross || {}).sort().reverse();

  return (
    <div>
      {header}

      {/* Goal Tracker */}
      <GoalTracker
        settings={settings}
        withdrawals={withdrawals}
        totalPnl={s.totalPnl}
        avgDailyPnl={s.avgDailyPnl}
        onSettingsChange={onSettingsChange}
      />

      {/* KPI Row 1 */}
      <div className="kpi-row kpi-row-1">
        <div className="kpi lg kpi-green">
          <div className="kpi-lbl">Total Realized P&amp;L</div>
          <div className={`kpi-val ${s.totalPnl >= 0 ? 'ppos' : 'pneg'}`}>{fMoney(s.totalPnl, true)}</div>
          <div className="kpi-sub">{s.totalDays} trading days</div>
        </div>
        <div className="kpi lg kpi-purple">
          <div className="kpi-lbl">Win Rate</div>
          <div className={`kpi-val ${s.winRate >= 50 ? 'ppos' : 'pneg'}`}>{s.winRate}%</div>
          <div className="kpi-sub">{s.profitDays} profit · {s.lossDays} loss days</div>
        </div>
        <div className="kpi lg kpi-cyan">
          <div className="kpi-lbl">Total Trades</div>
          <div className="kpi-val">{s.totalTrades}</div>
          <div className="kpi-sub">{s.sameDays} same-day · {s.totalTrades - s.sameDays} multi-day</div>
        </div>
        <div className="kpi lg kpi-orange">
          <div className="kpi-lbl">Avg Daily P&amp;L</div>
          <div className={`kpi-val ${s.avgDailyPnl >= 0 ? 'ppos' : 'pneg'}`}>{fMoney(s.avgDailyPnl, true)}</div>
          <div className="kpi-sub">Per trading day</div>
        </div>
      </div>

      {/* KPI Row 2 */}
      <div className="kpi-row kpi-row-2">
        <div className="kpi kpi-green">
          <div className="kpi-lbl">Best Day</div>
          <div className="kpi-val ppos">{s.bestDay ? fMoney(s.bestDayPnl, true) : '—'}</div>
          <div className="kpi-sub">{s.bestDay ? fDate(s.bestDay) : ''}</div>
        </div>
        <div className="kpi kpi-red">
          <div className="kpi-lbl">Worst Day</div>
          <div className="kpi-val pneg">{s.worstDay ? fMoney(s.worstDayPnl, true) : '—'}</div>
          <div className="kpi-sub">{s.worstDay ? fDate(s.worstDay) : ''}</div>
        </div>
        <div className="kpi kpi-green">
          <div className="kpi-lbl">Avg Win Day</div>
          <div className="kpi-val ppos">{s.avgWin ? fMoney(s.avgWin, true) : '—'}</div>
          <div className="kpi-sub">On profitable days</div>
        </div>
        <div className="kpi kpi-red">
          <div className="kpi-lbl">Avg Loss Day</div>
          <div className="kpi-val pneg">{s.avgLoss ? fMoney(s.avgLoss, true) : '—'}</div>
          <div className="kpi-sub">On losing days</div>
        </div>
      </div>

      {/* KPI Row 3 — Advanced */}
      <div className="kpi-row kpi-row-2">
        <div className="kpi kpi-red">
          <div className="kpi-lbl">Max Drawdown</div>
          <div className="kpi-val pneg">{s.maxDrawdown > 0 ? fMoney(-s.maxDrawdown, true) : '—'}</div>
          <div className="kpi-sub">Peak-to-trough drop</div>
        </div>
        <div className="kpi kpi-green">
          <div className="kpi-lbl">Expectancy / Day</div>
          <div className={`kpi-val ${s.expectancy >= 0 ? 'ppos' : 'pneg'}`}>{fMoney(s.expectancy, true)}</div>
          <div className="kpi-sub">Expected $ per day</div>
        </div>
        <div className="kpi kpi-green">
          <div className="kpi-lbl">Best Month</div>
          <div className="kpi-val ppos">{s.bestMonthLabel ? fMoney(s.bestMonthPnl, true) : '—'}</div>
          <div className="kpi-sub">{s.bestMonthLabel || ''}</div>
        </div>
        <div className="kpi kpi-red">
          <div className="kpi-lbl">Worst Month</div>
          <div className="kpi-val pneg">{s.worstMonthLabel ? fMoney(s.worstMonthPnl, true) : '—'}</div>
          <div className="kpi-sub">{s.worstMonthLabel || ''}</div>
        </div>
      </div>

      {/* KPI Row 4 — Withdrawn */}
      <div className="kpi-row kpi-row-2">
        <div className="kpi kpi-purple">
          <div className="kpi-lbl">Fidelity Withdrawn</div>
          <div className="kpi-val" style={{ color: 'var(--purple)' }}>{fMoney(fidWithdrawn)}</div>
          <div className="kpi-sub">From trading profits</div>
        </div>
        <div className="kpi kpi-cyan">
          <div className="kpi-lbl">Robinhood Withdrawn</div>
          <div className="kpi-val" style={{ color: 'var(--cyan)' }}>{fMoney(rhWithdrawn)}</div>
          <div className="kpi-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Manual cash-out
            <button className="goal-edit-btn" onClick={() => {
              const v = prompt('Robinhood withdrawn total ($):', rhWithdrawn);
              if (v !== null && !isNaN(parseFloat(v))) onSettingsChange('tj_rh_withdrawn', parseFloat(v));
            }}>✏️</button>
          </div>
        </div>
        <div className="kpi kpi-yellow">
          <div className="kpi-lbl">Volatility (Std Dev)</div>
          <div className="kpi-val" style={{ color: 'var(--yellow)' }}>{fMoney(s.volatility)}</div>
          <div className="kpi-sub">Daily P&amp;L std deviation</div>
        </div>
        <div className="kpi kpi-orange">
          <div className="kpi-lbl">Recovery Factor</div>
          <div className="kpi-val" style={{ color: s.recoveryFactor > 0 ? 'var(--green)' : 'var(--red)' }}>
            {s.recoveryFactor != null ? s.recoveryFactor + 'x' : '—'}
          </div>
          <div className="kpi-sub">P&amp;L ÷ Max Drawdown</div>
        </div>
      </div>

      {/* Cumulative P&L with time filter */}
      <div className="chart-card">
        <div className="chart-hdr" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="chart-dot" style={{ background: 'var(--blue)' }} />
            <div className="chart-title">Cumulative P&amp;L Growth</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['1D','1W','1M','3M','YTD','ALL'].map(f => (
              <button key={f} onClick={() => setCumulFilter(f)} style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                background: cumulFilter === f ? 'var(--blue)' : 'var(--surface2)',
                color: cumulFilter === f ? '#fff' : 'var(--muted)',
                cursor: 'pointer', fontSize: '.72rem', fontWeight: 600,
              }}>{f}</button>
            ))}
          </div>
        </div>
        <canvas ref={cumulRef} />
      </div>

      {/* Drawdown Chart */}
      <div className="chart-card">
        <div className="chart-hdr">
          <div className="chart-dot" style={{ background: 'var(--red)' }} />
          <div className="chart-title">Drawdown from Peak</div>
          <div className="chart-legend"><span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>How far below equity high each day</span></div>
        </div>
        <canvas ref={drawdownRef} />
      </div>

      {/* Daily P&L */}
      <div className="chart-card">
        <div className="chart-hdr">
          <div className="chart-dot" style={{ background: 'var(--green)' }} />
          <div className="chart-title">Daily P&amp;L</div>
          <div className="chart-legend">
            <span><span style={{ color: 'var(--green)' }}>■</span> Profit</span>
            <span><span style={{ color: 'var(--red)'   }}>■</span> Loss</span>
          </div>
        </div>
        <canvas ref={dailyRef} />
      </div>

      {/* Calendar */}
      <div className="cal-section">
        <div className="cal-section-hdr">
          <span style={{ fontSize: '1.1rem' }}>📅</span>
          <div className="cal-section-title">P&amp;L Calendar</div>
          <div className="cal-section-sub">— Click any day to see full trade breakdown</div>
        </div>
        <div className="cal-months-wrap">
          {months.map(ym => {
            const [year, month] = ym.split('-').map(Number);
            const firstDay    = new Date(year, month - 1, 1).getDay();
            const daysInMonth = new Date(year, month, 0).getDate();
            const today       = new Date();
            const monthDates  = dates.filter(d => { const p = d.split('/'); return +p[2] === year && +p[0] === month; });
            const monthTotal  = monthDates.reduce((sum, d) => sum + dpnl[d], 0);

            return (
              <div key={ym} className="cal-month-card">
                <div className="cal-month-name">{MONTHS_FULL[month]} {year}</div>
                <div className="cal-grid">
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="cal-dow">{d}</div>)}
                  {Array(firstDay).fill(null).map((_, i) => <div key={'e'+i} className="cal-cell empty" />)}
                  {Array.from({ length: daysInMonth }, (_, idx) => {
                    const day  = idx + 1;
                    const mm   = String(month).padStart(2, '0');
                    const dd2  = String(day).padStart(2, '0');
                    const key  = `${mm}/${dd2}/${year}`;
                    const det  = details[key];
                    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day;
                    if (det) {
                      const pos = det.daily_pnl >= 0;
                      return (
                        <div key={day} className={`cal-cell trading ${pos ? 'profit' : 'loss'}${isToday ? ' today' : ''}`} onClick={() => onDayClick(key)}>
                          <div className="cal-date">{day}</div>
                          <div className={`cal-pnl ${pos ? 'ppos' : 'pneg'}`}>{det.daily_pnl >= 0 ? '+' : ''}{fY(det.daily_pnl)}</div>
                          <div className="cal-cnt">{det.num_trades}t</div>
                        </div>
                      );
                    }
                    return (
                      <div key={day} className={`cal-cell${isToday ? ' today' : ''}`}>
                        <div className="cal-date" style={{ color: 'var(--muted)' }}>{day}</div>
                      </div>
                    );
                  })}
                </div>
                <div className={`cal-month-total ${monthTotal >= 0 ? 'ppos' : 'pneg'}`}>
                  Total: {fMoney(monthTotal, true)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly Gross Breakdown */}
      {grossKeys.length > 0 && (
        <div className="chart-card" style={{ marginBottom: 14, overflowX: 'auto' }}>
          <div className="chart-hdr">
            <div className="chart-dot" style={{ background: 'var(--purple)' }} />
            <div className="chart-title">Monthly Gross Breakdown</div>
            <div className="chart-legend"><span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Gross profits/losses before netting</span></div>
          </div>
          <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px 10px' }}>Month</th>
                <th style={{ textAlign: 'right', padding: '6px 10px 10px', color: 'var(--green)' }}>Gross Profit</th>
                <th style={{ textAlign: 'right', padding: '6px 10px 10px', color: 'var(--red)' }}>Gross Loss</th>
                <th style={{ textAlign: 'right', padding: '6px 10px 10px' }}>Net P&amp;L</th>
                <th style={{ textAlign: 'center', padding: '6px 10px 10px', color: 'var(--green)' }}>Win Days</th>
                <th style={{ textAlign: 'center', padding: '6px 10px 10px', color: 'var(--red)' }}>Loss Days</th>
              </tr>
            </thead>
            <tbody>
              {grossKeys.map(k => {
                const g = monthlyGross[k];
                const [y, m] = k.split('-');
                const lbl = MONTHS_SHORT[+m] + ' ' + y;
                return (
                  <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{lbl}</td>
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
      )}

      {/* Three-column row */}
      <div className="three-col">
        {/* By Instrument */}
        <div className="chart-card no-mb">
          <div className="chart-hdr">
            <div className="chart-dot" style={{ background: 'var(--blue)' }} />
            <div className="chart-title">By Instrument</div>
          </div>
          <table className="inst-table">
            <thead><tr><th>Symbol</th><th>Trades</th><th>P&amp;L</th></tr></thead>
            <tbody>
              {instK.map(sym => {
                const d = byInst[sym];
                return (
                  <tr key={sym}>
                    <td><span className={`badge ${symBadgeClass(sym)}`}>{sym}</span></td>
                    <td>{d.trades}</td>
                    <td className={d.pnl >= 0 ? 'ppos' : 'pneg'} style={{ fontWeight: 600 }}>{fMoney(d.pnl, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Monthly P&L */}
        <div className="chart-card no-mb">
          <div className="chart-hdr">
            <div className="chart-dot" style={{ background: 'var(--orange)' }} />
            <div className="chart-title">Monthly P&amp;L</div>
          </div>
          <canvas ref={monthlyRef} />
        </div>

        {/* Performance */}
        <div className="chart-card no-mb">
          <div className="chart-hdr">
            <div className="chart-dot" style={{ background: 'var(--yellow)' }} />
            <div className="chart-title">Performance</div>
          </div>
          <div>
            {perfRows.map((row, i) => (
              <div key={i}>
                <div className="perf-row">
                  <div className="perf-lbl">{row.lbl}</div>
                  <div>{row.val}</div>
                </div>
                {row.bar != null && (
                  <div className="perf-bar-wrap">
                    <div className="perf-bar-fill" style={{ width: Math.min(row.bar, 100) + '%' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trade Type Donut */}
      <div style={{ marginTop: 14 }}>
        <div className="chart-card no-mb" style={{ maxWidth: 480 }}>
          <div className="chart-hdr">
            <div className="chart-dot" style={{ background: 'var(--purple)' }} />
            <div className="chart-title">Trade Type Distribution</div>
          </div>
          <div className="donut-wrap">
            <div className="donut-canvas-wrap">
              <canvas ref={donutRef} style={{ width: 180, height: 180 }} />
            </div>
            <div className="donut-legend">
              {typeK.map((k, i) => (
                <div key={k} className="donut-legend-item">
                  <div className="donut-legend-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{k}</div>
                    <div className="donut-legend-lbl">
                      {Math.round(byType[k].trades / typeTotal * 100)}% ({byType[k].trades})
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

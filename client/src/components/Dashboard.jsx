import React, { useEffect, useRef } from 'react';
import { fMoney, fDate, fY, symBadgeClass } from '../utils/helpers.js';
import { drawLine, drawBars, drawMonthly, drawDonut } from '../utils/canvas.js';

const MONTHS_SHORT = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const DONUT_COLORS = ['#3b82f6','#a855f7','#eab308','#22c55e','#06b6d4'];

export default function Dashboard({ data, onRefresh, onDayClick }) {
  const cumulRef   = useRef(null);
  const dailyRef   = useRef(null);
  const monthlyRef = useRef(null);
  const donutRef   = useRef(null);

  useEffect(() => {
    if (!data) return;
    const { dates, dpnl, cum, monthly, byType } = data;
    const lbl = dates.map(d => {
      const p = d.split('/');
      return MONTHS_SHORT[+p[0]] + ' ' + parseInt(p[1]);
    });
    drawLine(cumulRef.current,   'cumul',   lbl, cum, 240);
    drawBars(dailyRef.current,   'daily',   lbl, dates.map(d => dpnl[d]), 220);
    const mk   = Object.keys(monthly).sort();
    const mLbl = mk.map(k => {
      const p = k.split('-');
      return MONTHS_SHORT[+p[1]] + ' ' + p[0];
    });
    drawMonthly(monthlyRef.current, mLbl, mk.map(k => monthly[k]), 180);
    const typeK = Object.keys(byType);
    drawDonut(donutRef.current, typeK.map(k => byType[k].trades), DONUT_COLORS, 180);
  }, [data]);

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

  const { dates, dpnl, monthly, byInst, byType, details, s } = data;
  const typeK   = Object.keys(byType);
  const typeTotal = typeK.reduce((sum, k) => sum + byType[k].trades, 0) || 1;
  const instK   = Object.keys(byInst).sort((a, b) => byInst[b].pnl - byInst[a].pnl);

  // Build calendar months
  const monthSet = new Set();
  dates.forEach(d => { const p = d.split('/'); monthSet.add(p[2] + '-' + p[0].padStart(2, '0')); });
  const months = [...monthSet].sort();

  const perfRows = [
    { lbl: 'Win Rate',        val: <span className="ppos" style={{ fontWeight: 700 }}>{s.winRate}%</span>, bar: s.winRate },
    { lbl: 'Profit Factor',   val: <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>{s.profitFactor}x</span> },
    { lbl: 'Max Win Streak',  val: <span>🔥 <span style={{ fontWeight: 600 }}>{s.mw} days</span></span> },
    { lbl: 'Max Loss Streak', val: <span>📉 <span style={{ fontWeight: 600 }}>{s.ml} days</span></span> },
    { lbl: 'Avg Win Day',     val: <span className="ppos" style={{ fontWeight: 600 }}>{fMoney(s.avgWin, true)}</span> },
    { lbl: 'Avg Loss Day',    val: <span className="pneg" style={{ fontWeight: 600 }}>{fMoney(s.avgLoss, true)}</span> },
    { lbl: 'Same-Day Trades', val: <span style={{ fontWeight: 600 }}>{s.sameDays} / {s.totalTrades}</span> },
  ];

  return (
    <div>
      {header}

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

      {/* Cumulative P&L */}
      <div className="chart-card">
        <div className="chart-hdr">
          <div className="chart-dot" style={{ background: 'var(--blue)' }} />
          <div className="chart-title">Cumulative P&amp;L Growth</div>
        </div>
        <canvas ref={cumulRef} />
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

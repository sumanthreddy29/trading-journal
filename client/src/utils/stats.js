import { r2 } from './helpers.js';

export function groupForDisplay(trades) {
  const result = [], seen = new Set();
  trades.forEach(t => {
    if (!t.is_ndx) { result.push(t); return; }
    const key = `${t.base_symbol}|${t.date_sold}`;
    if (seen.has(key)) return;
    seen.add(key);
    const grp = trades.filter(x => x.is_ndx && x.base_symbol === t.base_symbol && x.date_sold === t.date_sold);
    result.push(grp.length === 1 ? grp[0] : {
      ...grp[0],
      quantity:   r2(grp.reduce((s, x) => s + x.quantity, 0)),
      proceeds:   r2(grp.reduce((s, x) => s + x.proceeds, 0)),
      cost_basis: r2(grp.reduce((s, x) => s + x.cost_basis, 0)),
      total_gl:   r2(grp.reduce((s, x) => s + x.total_gl, 0)),
      lt_gl: grp[0].lt_gl,
      st_gl: grp[0].st_gl,
    });
  });
  return result;
}

export function computeStats(trades) {
  if (!trades.length) return null;

  const byDate = {};
  trades.forEach(t => {
    if (!byDate[t.date_sold]) byDate[t.date_sold] = [];
    byDate[t.date_sold].push(t);
  });
  const dates = Object.keys(byDate).sort();

  const dpnl = {};
  dates.forEach(d => { dpnl[d] = r2(byDate[d].reduce((s, t) => s + t.total_gl, 0)); });

  let cum = [], run = 0;
  dates.forEach(d => { run = r2(run + dpnl[d]); cum.push(run); });

  const monthly = {};
  dates.forEach(d => {
    const p = d.split('/'), k = p[2] + '-' + p[0];
    monthly[k] = r2((monthly[k] || 0) + dpnl[d]);
  });

  const byInst = {}, byType = {};
  dates.forEach(d => {
    groupForDisplay(byDate[d]).forEach(t => {
      const sym = t.base_symbol || t.symbol;
      if (!byInst[sym]) byInst[sym] = { trades: 0, pnl: 0 };
      byInst[sym].trades++;
      byInst[sym].pnl = r2(byInst[sym].pnl + t.total_gl);

      const tp = t.trade_type;
      if (!byType[tp]) byType[tp] = { trades: 0, pnl: 0 };
      byType[tp].trades++;
      byType[tp].pnl = r2(byType[tp].pnl + t.total_gl);
    });
  });

  const totalPnl    = cum[cum.length - 1] || 0;
  const profitDays  = dates.filter(d => dpnl[d] > 0).length;
  const lossDays    = dates.filter(d => dpnl[d] < 0).length;
  const pvs         = dates.filter(d => dpnl[d] > 0).map(d => dpnl[d]);
  const lvs         = dates.filter(d => dpnl[d] < 0).map(d => dpnl[d]);
  const bestDay     = profitDays ? dates.filter(d => dpnl[d] > 0).reduce((a, b) => dpnl[a] >= dpnl[b] ? a : b) : null;
  const worstDay    = lossDays  ? dates.filter(d => dpnl[d] < 0).reduce((a, b) => dpnl[a] <= dpnl[b] ? a : b) : null;

  let mw = 0, ml = 0, cw = 0, cl = 0;
  dates.forEach(d => {
    if (dpnl[d] > 0)      { cw++; cl = 0; mw = Math.max(mw, cw); }
    else if (dpnl[d] < 0) { cl++; cw = 0; ml = Math.max(ml, cl); }
    else                   { cw = 0; cl = 0; }
  });

  const details = {};
  dates.forEach(d => {
    const ts = byDate[d], gts = groupForDisplay(ts);
    details[d] = {
      trades:          ts,
      daily_pnl:       dpnl[d],
      num_trades:      gts.length,
      num_wins:        gts.filter(t => t.total_gl > 0).length,
      num_losses:      gts.filter(t => t.total_gl < 0).length,
      total_proceeds:  r2(ts.reduce((s, t) => s + t.proceeds, 0)),
      total_cost:      r2(ts.reduce((s, t) => s + t.cost_basis, 0)),
    };
  });

  const totalTrades      = dates.reduce((s, d) => s + groupForDisplay(byDate[d]).length, 0);
  const sameDays         = dates.reduce((s, d) => s + groupForDisplay(byDate[d]).filter(t => t.same_day).length, 0);
  const totalWins        = pvs.reduce((a, b) => a + b, 0);
  const totalLossesAbs   = Math.abs(lvs.reduce((a, b) => a + b, 0));
  const profitFactor     = totalLossesAbs > 0 ? r2(totalWins / totalLossesAbs) : (totalWins > 0 ? '∞' : 0);
  const avgWin           = pvs.length ? r2(pvs.reduce((a, b) => a + b, 0) / pvs.length) : 0;
  const avgLoss          = lvs.length ? r2(lvs.reduce((a, b) => a + b, 0) / lvs.length) : 0;

  // ── Advanced stats ────────────────────────────
  // Max drawdown (peak-to-trough in dollar terms)
  let peak = -Infinity, maxDD = 0, ddPeak = 0;
  const drawdownSeries = cum.map(c => {
    if (c > peak) { peak = c; ddPeak = c; }
    const dd = c - ddPeak;
    if (dd < maxDD) maxDD = dd;
    return dd;
  });
  const maxDrawdown = Math.abs(maxDD);

  // Volatility = std dev of daily P&L
  const dailyVals = dates.map(d => dpnl[d]);
  const mean = dailyVals.reduce((a, b) => a + b, 0) / (dailyVals.length || 1);
  const variance = dailyVals.reduce((s, v) => s + (v - mean) ** 2, 0) / (dailyVals.length || 1);
  const volatility = r2(Math.sqrt(variance));

  // Expectancy per day = avgWin * winRate + avgLoss * lossRate
  const winRate01 = profitDays / (dates.length || 1);
  const lossRate01 = lossDays / (dates.length || 1);
  const expectancy = r2(avgWin * winRate01 + avgLoss * lossRate01);

  // Sharpe = (avgDailyPnl / volatility) * sqrt(252)  [annualised]
  const avgDailyPnl = dates.length ? r2(totalPnl / dates.length) : 0;
  const sharpe = volatility > 0 ? r2((avgDailyPnl / volatility) * Math.sqrt(252)) : 0;

  // Recovery factor = total P&L / max drawdown
  const recoveryFactor = maxDrawdown > 0 ? r2(totalPnl / maxDrawdown) : null;

  // Calmar = annualised return / max drawdown
  const annReturn = dates.length > 0 ? r2(avgDailyPnl * 252) : 0;
  const calmar = maxDrawdown > 0 ? r2(annReturn / maxDrawdown) : null;

  // Monthly gross breakdown (profit days / loss days separately)
  const monthlyGross = {};
  dates.forEach(d => {
    const p = d.split('/'), k = p[2] + '-' + p[0].padStart(2, '0');
    if (!monthlyGross[k]) monthlyGross[k] = { grossProfit: 0, grossLoss: 0, winDays: 0, lossDays: 0, net: 0 };
    const v = dpnl[d];
    monthlyGross[k].net = r2(monthlyGross[k].net + v);
    if (v > 0) { monthlyGross[k].grossProfit = r2(monthlyGross[k].grossProfit + v); monthlyGross[k].winDays++; }
    else if (v < 0) { monthlyGross[k].grossLoss = r2(monthlyGross[k].grossLoss + v); monthlyGross[k].lossDays++; }
  });

  // Best / worst month
  const monthKeys = Object.keys(monthly).sort();
  const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabel = k => { const [y, m] = k.split('-'); return MONTH_NAMES[+m] + ' ' + y; };
  let bestMonth = null, worstMonth = null;
  monthKeys.forEach(k => {
    if (!bestMonth  || monthly[k] > monthly[bestMonth])  bestMonth  = k;
    if (!worstMonth || monthly[k] < monthly[worstMonth]) worstMonth = k;
  });

  // ── Weekly P&L ────────────────────────────────
  const weeklyPnl = {}, weeklyLabel = {};
  dates.forEach(d => {
    const [m, dy, y] = d.split('/');
    const dt = new Date(+y, +m - 1, +dy);
    const jan1 = new Date(dt.getFullYear(), 0, 1);
    const wn = Math.ceil(((dt - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    const wk = y + '-W' + String(wn).padStart(2, '0');
    if (!weeklyLabel[wk]) weeklyLabel[wk] = MONTH_NAMES[+m].slice(0, 3) + ' ' + (+dy);
    weeklyPnl[wk] = r2((weeklyPnl[wk] || 0) + dpnl[d]);
  });
  const weekKeys = Object.keys(weeklyPnl).sort();
  let bestWeek = null, worstWeek = null;
  weekKeys.forEach(k => {
    if (!bestWeek  || weeklyPnl[k] > weeklyPnl[bestWeek])  bestWeek  = k;
    if (!worstWeek || weeklyPnl[k] < weeklyPnl[worstWeek]) worstWeek = k;
  });

  // ── Current streak (from most recent day backward) ──
  let currentStreak = 0, currentStreakType = 'none';
  for (let i = dates.length - 1; i >= 0; i--) {
    const v = dpnl[dates[i]];
    if (currentStreak === 0) {
      if (v > 0) { currentStreakType = 'win'; currentStreak = 1; }
      else if (v < 0) { currentStreakType = 'loss'; currentStreak = 1; }
      else break;
    } else if ((currentStreakType === 'win' && v > 0) || (currentStreakType === 'loss' && v < 0)) {
      currentStreak++;
    } else break;
  }

  // ── Call / Put / Same-day splits ──────────────
  const callStats = { trades: 0, pnl: 0, wins: 0 };
  const putStats  = { trades: 0, pnl: 0, wins: 0 };
  const sdStats   = { trades: 0, pnl: 0, wins: 0 };
  const onStats   = { trades: 0, pnl: 0, wins: 0 };
  trades.forEach(t => {
    const tp = (t.trade_type || '').toUpperCase();
    const bucket = tp === 'CALL' ? callStats : tp === 'PUT' ? putStats : null;
    if (bucket) { bucket.trades++; bucket.pnl = r2(bucket.pnl + t.total_gl); if (t.total_gl > 0) bucket.wins++; }
    const sd = t.same_day ? sdStats : onStats;
    sd.trades++; sd.pnl = r2(sd.pnl + t.total_gl); if (t.total_gl > 0) sd.wins++;
  });

  return {
    dates, dpnl, cum, monthly, byInst, byType, details,
    drawdownSeries, monthlyGross, weeklyPnl, weeklyLabel, weekKeys,
    s: {
      totalPnl, profitDays, lossDays, totalDays: dates.length, totalTrades,
      bestDay,  bestDayPnl:  bestDay  ? dpnl[bestDay]  : 0,
      worstDay, worstDayPnl: worstDay ? dpnl[worstDay] : 0,
      avgDailyPnl,
      winRate:     dates.length ? Math.round(profitDays / dates.length * 1000) / 10 : 0,
      avgWin, avgLoss, mw, ml, sameDays, profitFactor, totalTrades,
      maxDrawdown, volatility, expectancy, sharpe, recoveryFactor, calmar,
      bestMonth,  bestMonthPnl:  bestMonth  ? monthly[bestMonth]  : 0, bestMonthLabel:  bestMonth  ? monthLabel(bestMonth)  : null,
      worstMonth, worstMonthPnl: worstMonth ? monthly[worstMonth] : 0, worstMonthLabel: worstMonth ? monthLabel(worstMonth) : null,
      currentStreak, currentStreakType,
      callStats, putStats, sdStats, onStats,
      bestWeek,  bestWeekPnl:  bestWeek  ? weeklyPnl[bestWeek]  : 0, bestWeekLabel:  bestWeek  ? weeklyLabel[bestWeek]  : null,
      worstWeek, worstWeekPnl: worstWeek ? weeklyPnl[worstWeek] : 0, worstWeekLabel: worstWeek ? weeklyLabel[worstWeek] : null,
    },
  };
}

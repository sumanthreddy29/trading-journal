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

  return {
    dates, dpnl, cum, monthly, byInst, byType, details,
    s: {
      totalPnl, profitDays, lossDays, totalDays: dates.length, totalTrades,
      bestDay,  bestDayPnl:  bestDay  ? dpnl[bestDay]  : 0,
      worstDay, worstDayPnl: worstDay ? dpnl[worstDay] : 0,
      avgDailyPnl: dates.length ? r2(totalPnl / dates.length) : 0,
      winRate:     dates.length ? Math.round(profitDays / dates.length * 1000) / 10 : 0,
      avgWin, avgLoss, mw, ml, sameDays, profitFactor, totalTrades,
    },
  };
}

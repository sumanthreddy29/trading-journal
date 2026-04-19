import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import { API } from '../api.js';
Chart.register(...registerables);

/* ── helpers ──────────────────────────────────────────── */
const fmt     = (n, dec = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: dec, minimumFractionDigits: dec });
const fmtMcap = b => b >= 1000 ? `$${(b / 1000).toFixed(2)}T` : `$${b.toFixed(0)}B`;
const upside  = s => ((s.target - s.price) / s.price) * 100;
const ratingCls = r => r?.includes('Strong Buy') ? 'sb' : r?.includes('Buy') ? 'b' : r?.includes('Sell') ? 's' : 'h';
const PALETTE = ['#5eead4','#7dd3fc','#a78bfa','#fbbf24','#f87171','#34d399','#fb7185','#c084fc','#60a5fa','#fde68a','#fca5a5','#4ade80'];

const SORT_FNS = {
  upside: s => upside(s), ytd: s => s.ytd, price: s => s.price, target: s => s.target,
  pe: s => s.pe, mcap: s => s.mcap, rating: s => s.rating, sector: s => s.sector, ticker: s => s.ticker,
};

export default function StockDashboard() {
  const [dashData,    setDashData]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [refreshMsg,  setRefreshMsg]  = useState('');
  const [activeSector,setActiveSector]= useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey,     setSortKey]     = useState('upside');
  const [sortDir,     setSortDir]     = useState(-1);

  const upsideRef   = useRef(null);
  const sectorRef   = useRef(null);
  const upsideChart = useRef(null);
  const sectorChart = useRef(null);

  /* fetch data once */
  const loadDashboard = useCallback(() => {
    setLoading(true);
    fetch('/api/stock-dashboard')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => { setDashData(d); setLoading(false); })
      .catch(() => { setError('Could not load market data.'); setLoading(false); });
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshMsg('');
    try {
      const res = await API.post('/api/stock-dashboard/refresh');
      if (res?.success) {
        setRefreshMsg('Data refreshed!');
        loadDashboard();
      } else {
        setRefreshMsg(res?.error || 'Refresh failed.');
      }
    } catch {
      setRefreshMsg('Refresh failed.');
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(''), 4000);
    }
  }, [loadDashboard]);

  /* build / rebuild charts when data arrives */
  useEffect(() => {
    if (!dashData || !upsideRef.current || !sectorRef.current) return;
    upsideChart.current?.destroy();
    sectorChart.current?.destroy();

    Chart.defaults.color       = '#8a97ad';
    Chart.defaults.borderColor = 'rgba(138,151,173,0.15)';

    const stocks = dashData.stocks;
    const topN = stocks.slice().sort((a, b) => upside(b) - upside(a)).slice(0, 20);

    upsideChart.current = new Chart(upsideRef.current, {
      type: 'bar',
      data: {
        labels: topN.map(s => s.ticker),
        datasets: [{
          data: topN.map(s => upside(s)),
          backgroundColor: topN.map(s => upside(s) >= 20 ? '#34d399' : upside(s) >= 0 ? '#7dd3fc' : '#f87171'),
          borderRadius: 6,
          barThickness: 14,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => `${c.parsed.x >= 0 ? '+' : ''}${c.parsed.x.toFixed(1)}% to target` } },
        },
        scales: {
          x: { ticks: { callback: v => v + '%' }, grid: { color: 'rgba(138,151,173,0.08)' } },
          y: { grid: { display: false }, ticks: { font: { weight: '700', size: 10 } } },
        },
      },
    });

    const sectorAgg = {};
    stocks.forEach(s => { sectorAgg[s.sector] = (sectorAgg[s.sector] || 0) + s.mcap; });
    sectorChart.current = new Chart(sectorRef.current, {
      type: 'doughnut',
      data: {
        labels: Object.keys(sectorAgg),
        datasets: [{
          data: Object.values(sectorAgg),
          backgroundColor: Object.keys(sectorAgg).map((_, i) => PALETTE[i % PALETTE.length]),
          borderColor: '#131a26',
          borderWidth: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
          tooltip: { callbacks: { label: c => `${c.label}: ${fmtMcap(c.parsed)}` } },
        },
        cutout: '62%',
      },
    });

    return () => { upsideChart.current?.destroy(); sectorChart.current?.destroy(); };
  }, [dashData]);

  const handleSort = useCallback(key => {
    setSortKey(prev => {
      if (prev === key) setSortDir(d => d * -1); else setSortDir(-1);
      return key;
    });
  }, []);

  const scrollToDetail = useCallback(ticker => {
    const el = document.querySelector(`[data-detail="${ticker}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.borderColor = 'var(--sd-accent)';
    setTimeout(() => { el.style.borderColor = ''; }, 1500);
  }, []);

  /* ── loading / error states ──────────────────────── */
  if (loading) return <div className="sd-state">Loading market data…</div>;
  if (error)   return <div className="sd-state sd-error">{error}</div>;
  if (!dashData) return null;

  const { meta, stocks } = dashData;
  const mk       = meta.marketSnapshot || {};
  const dateStr  = new Date(meta.lastUpdated).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
  const sectors  = ['All', ...new Set(stocks.map(s => s.sector))];
  const filtered = stocks.filter(s =>
    (activeSector === 'All' || s.sector === activeSector) &&
    (!searchQuery || s.ticker.toLowerCase().includes(searchQuery) || s.name.toLowerCase().includes(searchQuery))
  );
  const sortedRows = [...filtered].sort((a, b) => {
    const fn = SORT_FNS[sortKey] ?? (s => s[sortKey] ?? '');
    const ka = fn(a), kb = fn(b);
    if (typeof ka === 'string') return ka.localeCompare(kb) * sortDir;
    return (ka - kb) * sortDir;
  });

  /* summary stats */
  const avgUpside  = stocks.reduce((a, s) => a + upside(s), 0) / stocks.length;
  const buyCount   = stocks.filter(s => s.rating?.includes('Buy')).length;
  const avgPe      = stocks.filter(s => s.pe > 0).reduce((a, s, _, arr) => a + s.pe / arr.length, 0);
  const totalMcap  = stocks.reduce((a, s) => a + s.mcap, 0);
  const topPick    = [...stocks].sort((a, b) => upside(b) - upside(a))[0];

  return (
    <div className="sd-wrap">
      {/* ── Page header ── */}
      <div className="sd-header">
        <div>
          <div className="sd-pill">Live · Updated {dateStr}</div>
          <h1 className="sd-title">Stocks to Own — Live Dashboard</h1>
          <div className="sd-sub">{mk.note || 'Refreshed daily at 8:00 AM ET'}</div>
        </div>
        <div className="sd-header-right">
          {mk.sp500 && (
            <div className="sd-market-bar">
              <div>S&amp;P 500 <strong>{fmt(mk.sp500, 0)}</strong>{' '}
                <span className={(mk.sp500WeekChange || 0) >= 0 ? 'sd-pos' : 'sd-neg'}>
                  {mk.sp500WeekChange >= 0 ? '+' : ''}{fmt(mk.sp500WeekChange || 0, 1)}% wk
                </span>
              </div>
              <div>10-yr UST <strong>{fmt(mk.ust10y || 0, 2)}%</strong></div>
              <div>VIX <strong>{fmt(mk.vix || 0, 1)}</strong></div>
            </div>
          )}
          <div className="sd-refresh-row">
            <button
              className="sd-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Pull fresh prices from Yahoo Finance"
            >
              {refreshing ? '⏳ Refreshing…' : '🔄 Refresh Now'}
            </button>
            {refreshMsg && <span className={`sd-refresh-msg${refreshMsg.includes('failed') ? ' err' : ''}`}>{refreshMsg}</span>}
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="sd-summary">
        <div className="sd-card"><div className="sd-lbl">Names in Basket</div><div className="sd-val">{stocks.length}</div><div className="sd-delta">{buyCount} Buy / Strong Buy</div></div>
        <div className="sd-card"><div className="sd-lbl">Avg. Upside</div><div className="sd-val">+{avgUpside.toFixed(1)}%</div><div className="sd-delta">to 12m target</div></div>
        <div className="sd-card"><div className="sd-lbl">Avg. P/E</div><div className="sd-val">{avgPe.toFixed(1)}x</div><div className="sd-delta">basket valuation</div></div>
        <div className="sd-card"><div className="sd-lbl">Total Mkt Cap</div><div className="sd-val">{fmtMcap(totalMcap)}</div><div className="sd-delta">sum of names</div></div>
        <div className="sd-card"><div className="sd-lbl">Top Upside</div><div className="sd-val sd-accent2">{topPick.ticker}</div><div className="sd-delta">+{upside(topPick).toFixed(1)}% to target</div></div>
      </div>

      {/* ── Changelog ── */}
      <div className="sd-section-title">Recent changes</div>
      <div className="sd-changelog">
        <h3 className="sd-changelog-h">Recent changes</h3>
        {(meta.runHistory || []).length === 0
          ? <div className="sd-change-entry">No prior runs yet. First automated scan will run at 8:00 AM ET tomorrow.</div>
          : (meta.runHistory || []).slice().reverse().slice(0, 6).map((r, i) => (
              <div key={i} className="sd-change-entry">
                <span className="sd-change-date">{r.date}</span>{r.summary}
              </div>
            ))
        }
      </div>

      {/* ── Filters ── */}
      <div className="sd-section-title">Filter &amp; search</div>
      <div className="sd-controls">
        <div className="sd-chips">
          {sectors.map(sec => (
            <div key={sec} className={`sd-chip${activeSector === sec ? ' active' : ''}`} onClick={() => setActiveSector(sec)}>
              {sec}
            </div>
          ))}
        </div>
        <input
          className="sd-search"
          placeholder="Search ticker or name…"
          onChange={e => setSearchQuery(e.target.value.toLowerCase().trim())}
        />
      </div>

      {/* ── Charts ── */}
      <div className="sd-charts-grid">
        <div className="sd-card sd-chart-card">
          <h3 className="sd-chart-title">Upside to 12-month Analyst Target</h3>
          <div className="sd-chart-sub">Implied % return if consensus target is hit.</div>
          <div className="sd-chart-wrap"><canvas ref={upsideRef} /></div>
        </div>
        <div className="sd-card sd-chart-card">
          <h3 className="sd-chart-title">Basket by Sector (Market Cap)</h3>
          <div className="sd-chart-sub">Weighting across sectors (B USD).</div>
          <div className="sd-chart-wrap"><canvas ref={sectorRef} /></div>
        </div>
      </div>

      {/* ── Watchlist table ── */}
      <div className="sd-section-title">Watchlist <span className="sd-section-hint">(click row to jump to thesis)</span></div>
      <div className="sd-table-wrap">
        <table className="sd-table">
          <thead>
            <tr>
              {[['ticker','Ticker'],['sector','Sector'],['price','Price'],['ytd','YTD'],['target','Target'],['upside','Upside'],['pe','P/E'],['mcap','Mkt Cap'],['rating','Rating']].map(([k, label]) => (
                <th key={k} onClick={() => handleSort(k)}>
                  {label}{sortKey === k ? (sortDir === -1 ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(s => {
              const up = upside(s);
              return (
                <tr key={s.ticker} className="sd-row" onClick={() => scrollToDetail(s.ticker)}>
                  <td>
                    <div className="sd-ticker">
                      {s.ticker}
                      {(s.flags || []).map((f, i) => <span key={i} className={`sd-flag ${f.type || ''}`}>{f.label}</span>)}
                    </div>
                    <div className="sd-name">{s.name}</div>
                  </td>
                  <td><span className="sd-sector-tag">{s.sector}</span></td>
                  <td>${fmt(s.price)}</td>
                  <td className={s.ytd >= 0 ? 'sd-pos' : 'sd-neg'}>{s.ytd >= 0 ? '+' : ''}{s.ytd.toFixed(1)}%</td>
                  <td>${fmt(s.target)}</td>
                  <td className={up >= 0 ? 'sd-pos' : 'sd-neg'}>{up >= 0 ? '+' : ''}{up.toFixed(1)}%</td>
                  <td>{s.pe > 0 ? s.pe.toFixed(1) + 'x' : '—'}</td>
                  <td>{fmtMcap(s.mcap)}</td>
                  <td><span className={`sd-rating ${ratingCls(s.rating)}`}>{s.rating}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Thesis / detail cards ── */}
      <div className="sd-section-title">Thesis, catalysts &amp; news</div>
      <div className="sd-details-grid">
        {filtered.map(s => {
          const up = upside(s);
          return (
            <div key={s.ticker} className="sd-card sd-detail-card" data-detail={s.ticker}>
              <div className="sd-detail-head">
                <div>
                  <div className="sd-ticker-big">{s.ticker}</div>
                  <div className="sd-detail-name">{s.name}</div>
                  <span className="sd-sector-tag">{s.sector}</span>
                </div>
                <div className="sd-detail-price-col">
                  <div className="sd-detail-price">${fmt(s.price)}</div>
                  <div className={s.ytd >= 0 ? 'sd-pos sd-detail-ytd' : 'sd-neg sd-detail-ytd'}>
                    YTD {s.ytd >= 0 ? '+' : ''}{s.ytd.toFixed(1)}%
                  </div>
                  <span className={`sd-rating ${ratingCls(s.rating)}`}>{s.rating}</span>
                </div>
              </div>
              <div className="sd-metrics">
                <div><div className="sd-metric-lbl">Target</div><div className="sd-metric-val">${fmt(s.target)}</div></div>
                <div><div className="sd-metric-lbl">Upside</div><div className={`sd-metric-val ${up >= 0 ? 'sd-pos' : 'sd-neg'}`}>{up >= 0 ? '+' : ''}{up.toFixed(1)}%</div></div>
                <div><div className="sd-metric-lbl">P/E</div><div className="sd-metric-val">{s.pe > 0 ? s.pe.toFixed(1) + 'x' : '—'}</div></div>
                <div><div className="sd-metric-lbl">Mkt Cap</div><div className="sd-metric-val">{fmtMcap(s.mcap)}</div></div>
                <div><div className="sd-metric-lbl">Rev Growth</div><div className="sd-metric-val">{s.revGrowth || '—'}</div></div>
                <div><div className="sd-metric-lbl">52-wk Range</div><div className="sd-metric-val sd-metric-small">{s.w52 || '—'}</div></div>
              </div>
              <div className="sd-thesis" dangerouslySetInnerHTML={{ __html: s.thesis }} />
              <div className="sd-catalysts"><strong>Catalysts:</strong> {s.catalysts}</div>
              {s.news?.length > 0 && (
                <div className="sd-news">
                  <strong>Latest news:</strong>
                  <ul>
                    {s.news.slice(0, 3).map((n, i) => (
                      <li key={i}>
                        {n.url
                          ? <a href={n.url} target="_blank" rel="noopener noreferrer" className="sd-news-link">{n.title}</a>
                          : n.title}
                        {' '}<span className="sd-news-date">{n.date || ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div className="sd-footer">
        <strong>Auto-refreshed daily at 8:00 AM ET.</strong> A scheduled task pulls fresh prices, 52-wk ranges, analyst targets, and news headlines from public sources. Data from Yahoo Finance, MarketBeat, StockAnalysis, TipRanks, CNBC. Research dashboard — not investment advice.
      </div>
    </div>
  );
}

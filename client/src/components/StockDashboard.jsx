import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { API } from '../api.js';

// ── Helpers ───────────────────────────────────────
const fmt     = (n, d = 2) => n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const fmtVol  = v => v == null ? '—' : v >= 1e9 ? (v/1e9).toFixed(1)+'B' : v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v;
const fmtMcap = b => b == null ? '—' : b >= 1000 ? '$'+(b/1000).toFixed(1)+'T' : '$'+b.toFixed(0)+'B';
const chgCls  = v => v == null ? '' : v >= 0 ? 'mw-up' : 'mw-dn';

// TradingView exchange map
const TV_EX = { NMS:'NASDAQ', NMQ:'NASDAQ', NYQ:'NYSE', NYS:'NYSE', PCX:'AMEX', BTS:'NASDAQ' };
function tvSym(ticker, exchange) {
  const ex  = TV_EX[exchange] || '';
  const sym = ticker.replace(/\^/g, '').replace(/-/g, '');
  return ex ? `${ex}:${sym}` : sym;
}

// Compute support/resistance/trade plan from cached quote data
function calcLevels(s) {
  const p = s.price;
  if (!p) return null;
  const supports = [], resistances = [];

  if (s.high    && s.high    > p) resistances.push({ label: 'Day High',       price: s.high,    type: 'day'    });
  if (s.target  && s.target  > p) resistances.push({ label: 'Analyst Target', price: s.target,  type: 'target' });
  if (s.w52High && s.w52High > p) resistances.push({ label: '52w High',       price: s.w52High, type: 'year'   });
  if (s.low     && s.low     < p) supports.push({ label: 'Day Low',  price: s.low,  type: 'day'  });

  if (s.w52Low) {
    supports.push({ label: '52w Low', price: s.w52Low, type: 'year' });
    const range = (s.w52High || p) - s.w52Low;
    if (range > 0) {
      for (const [pct, lbl] of [[0.618,'Fib 61.8%'],[0.500,'Fib 50.0%'],[0.382,'Fib 38.2%']]) {
        const fp = +(s.w52Low + range * pct).toFixed(2);
        if      (fp < p * 0.99 && fp > s.w52Low * 1.01) supports.push({ label: lbl, price: fp, type: 'fib' });
        else if (fp > p * 1.01)                          resistances.push({ label: lbl, price: fp, type: 'fib' });
      }
    }
  }
  resistances.sort((a, b) => a.price - b.price);
  supports.sort((a, b) => b.price - a.price);

  let entry = null, t1 = null, t2 = null, stop = null;
  if (s.rating?.toLowerCase().includes('buy')) {
    entry = p;
    t1    = s.target ? s.target : +(p * 1.10).toFixed(2);
    t2    = s.w52High && s.w52High > (t1 * 1.01) ? s.w52High : null;
    const nearSup = supports.find(lv => lv.price < p * 0.98);
    stop  = nearSup ? +(nearSup.price * 0.99).toFixed(2) : +(p * 0.93).toFixed(2);
  }
  return { supports, resistances, entry, t1, t2, stop };
}

const TYPE_COLOR = { day:'#38bdf8', target:'#f59e0b', year:'#a78bfa', fib:'#64748b' };

const SECTORS = ['All','Technology','Communication Services','Financial Services',
  'Healthcare','Consumer Discretionary','Consumer Staples','Energy',
  'Utilities','Industrials','Basic Materials','Real Estate','ETF'];

const SORT_KEYS = [
  { key: 'change',    label: 'Change %' },
  { key: 'upside',    label: 'Upside %' },
  { key: 'spikeRatio',label: 'Vol Spike' },
  { key: 'marketCap', label: 'Mkt Cap'  },
  { key: 'price',     label: 'Price'    },
  { key: 'pe',        label: 'P/E'      },
  { key: 'w52Pct',    label: '52w %'    },
  { key: 'volume',    label: 'Volume'   },
];

const PAGE_SIZE = 50;

// Stock detail panel
function StockDetailPanel({ stock, onClose }) {
  const sym    = tvSym(stock.ticker, stock.exchange);
  const levels = calcLevels(stock);
  const isBuy  = stock.rating?.toLowerCase().includes('buy');
  return (
    <div className="mw-detail-overlay" onClick={onClose}>
      <div className="mw-detail-panel" onClick={e => e.stopPropagation()}>
        <div className="mw-detail-hd">
          <div className="mw-detail-hd-left">
            <span className="mw-detail-ticker-lbl">{stock.ticker}</span>
            <div className="mw-detail-name-lbl">{stock.name}</div>
            <span className="mw-muted" style={{fontSize:'.72rem'}}>{stock.sector || stock.quoteType || ''}</span>
          </div>
          <div className="mw-detail-hd-right">
            <span className="mw-detail-price-lbl">${fmt(stock.price)}</span>
            <span className={chgCls(stock.change)} style={{fontSize:'1rem',fontWeight:700}}>
              {stock.change >= 0 ? '+' : ''}{fmt(stock.change)}%
            </span>
            {stock.rating && <span className={`mw-rating-pill ${stock.rating.toLowerCase().replace(/\s+/g,'-')}`}>{stock.rating}</span>}
          </div>
          <button className="mw-detail-close" onClick={onClose}>✕</button>
        </div>
        <div className="mw-tv-wrap">
          <iframe
            key={stock.ticker}
            src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(sym)}&interval=D&theme=dark&style=1&locale=en&toolbar_bg=%230f172a&withdateranges=true&hide_legend=false&saveimage=false&hideideas=true&hide_side_toolbar=false`}
            width="100%" height="420" frameBorder="0" allowTransparency="true" scrolling="no"
            title={`${stock.ticker} Chart`}
          />
        </div>
        <div className="mw-detail-body">
          <div className="mw-detail-stats">
            {[
              { lbl:'Open',      val: stock.open      != null ? '$'+fmt(stock.open)      : '—' },
              { lbl:'High',      val: stock.high      != null ? '$'+fmt(stock.high)      : '—' },
              { lbl:'Low',       val: stock.low       != null ? '$'+fmt(stock.low)       : '—' },
              { lbl:'Volume',    val: fmtVol(stock.volume) },
              { lbl:'Avg Vol',   val: fmtVol(stock.avgVolume) },
              { lbl:'Vol Spike', val: stock.spikeRatio != null ? stock.spikeRatio+'×' : '—' },
              { lbl:'Mkt Cap',   val: fmtMcap(stock.marketCap) },
              { lbl:'P/E',       val: stock.pe   != null ? stock.pe+'x'       : '—' },
              { lbl:'EPS',       val: stock.eps  != null ? '$'+fmt(stock.eps) : '—' },
              { lbl:'Beta',      val: stock.beta != null ? stock.beta         : '—' },
              { lbl:'52w High',  val: stock.w52High != null ? '$'+fmt(stock.w52High) : '—' },
              { lbl:'52w Low',   val: stock.w52Low  != null ? '$'+fmt(stock.w52Low)  : '—' },
              { lbl:'Target',    val: stock.target  != null ? '$'+fmt(stock.target)  : '—', cls:'mw-up' },
              { lbl:'Upside',    val: stock.upside  != null ? (stock.upside >= 0 ? '+' : '')+fmt(stock.upside)+'%' : '—', cls:chgCls(stock.upside) },
            ].map(({ lbl, val, cls }) => (
              <div key={lbl} className="mw-stat-cell">
                <div className="mw-stat-lbl">{lbl}</div>
                <div className={`mw-stat-val${cls ? ' '+cls : ''}`}>{val}</div>
              </div>
            ))}
          </div>
          {levels && (
            <div className="mw-levels-wrap">
              <div className="mw-levels-title">Support &amp; Resistance</div>
              <div className="mw-levels-cols">
                <div className="mw-levels-col">
                  <div className="mw-levels-col-hd" style={{color:'#ef4444'}}>⬆ Resistance</div>
                  {levels.resistances.length === 0
                    ? <div className="mw-muted" style={{fontSize:'.75rem'}}>Near 52w high</div>
                    : levels.resistances.map((lv, i) => {
                        const pct = +((lv.price - stock.price) / stock.price * 100).toFixed(1);
                        return (
                          <div key={i} className="mw-level-row">
                            <span className="mw-level-lbl" style={{color:TYPE_COLOR[lv.type]}}>{lv.label}</span>
                            <span className="mw-level-price">${fmt(lv.price)}</span>
                            <span className="mw-up" style={{fontSize:'.72rem'}}>+{pct}%</span>
                          </div>
                        );
                      })
                  }
                </div>
                <div className="mw-levels-divider">
                  <div className="mw-current-price-tag">
                    ▶ ${fmt(stock.price)}
                    <span className="mw-muted" style={{fontSize:'.68rem',marginLeft:5}}>current</span>
                  </div>
                </div>
                <div className="mw-levels-col">
                  <div className="mw-levels-col-hd" style={{color:'#22c55e'}}>⬇ Support</div>
                  {levels.supports.length === 0
                    ? <div className="mw-muted" style={{fontSize:'.75rem'}}>Near 52w low</div>
                    : levels.supports.map((lv, i) => {
                        const pct = +((stock.price - lv.price) / stock.price * 100).toFixed(1);
                        return (
                          <div key={i} className="mw-level-row">
                            <span className="mw-level-lbl" style={{color:TYPE_COLOR[lv.type]}}>{lv.label}</span>
                            <span className="mw-level-price">${fmt(lv.price)}</span>
                            <span className="mw-dn" style={{fontSize:'.72rem'}}>-{pct}%</span>
                          </div>
                        );
                      })
                  }
                </div>
              </div>
            </div>
          )}
          {isBuy && levels && (
            <div className="mw-trade-plan">
              <div className="mw-levels-title">📋 Trade Plan</div>
              <div className="mw-trade-grid">
                <div className="mw-trade-cell mw-trade-entry">
                  <div className="mw-trade-lbl">Entry</div>
                  <div className="mw-trade-val">${fmt(levels.entry)}</div>
                  <div className="mw-trade-hint">At market / limit</div>
                </div>
                <div className="mw-trade-cell mw-trade-t1">
                  <div className="mw-trade-lbl">Target 1</div>
                  <div className="mw-trade-val">${fmt(levels.t1)}</div>
                  <div className="mw-trade-hint">
                    {levels.t1 && levels.entry ? '+'+((levels.t1-levels.entry)/levels.entry*100).toFixed(1)+'%' : ''}
                    {stock.target === levels.t1 ? ' · analyst' : ''}
                  </div>
                </div>
                {levels.t2 && (
                  <div className="mw-trade-cell mw-trade-t2">
                    <div className="mw-trade-lbl">Target 2</div>
                    <div className="mw-trade-val">${fmt(levels.t2)}</div>
                    <div className="mw-trade-hint">{'+'+((levels.t2-levels.entry)/levels.entry*100).toFixed(1)+'% · 52w high'}</div>
                  </div>
                )}
                <div className="mw-trade-cell mw-trade-stop">
                  <div className="mw-trade-lbl">Stop Loss</div>
                  <div className="mw-trade-val">${fmt(levels.stop)}</div>
                  <div className="mw-trade-hint">
                    {levels.stop && levels.entry ? ((levels.stop-levels.entry)/levels.entry*100).toFixed(1)+'%' : ''}
                    {' · below support'}
                  </div>
                </div>
              </div>
              <p className="mw-trade-disclaimer">
                ⚠️ Not financial advice. Levels from 52-week range, Fibonacci retracements &amp; analyst consensus.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangeBar({ pct }) {
  if (pct == null) return null;
  const w = Math.min(Math.abs(pct) * 4, 100);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <div style={{ width:48, height:6, background:'#1e293b', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${w}%`, height:'100%', background: pct >= 0 ? '#22c55e' : '#ef4444', borderRadius:3 }} />
      </div>
      <span className={chgCls(pct)} style={{fontSize:'.78rem',fontWeight:600}}>
        {pct >= 0 ? '+' : ''}{fmt(pct)}%
      </span>
    </div>
  );
}

function W52Bar({ pct }) {
  if (pct == null) return <span className="mw-muted">—</span>;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <div style={{ width:48, height:6, background:'#1e293b', borderRadius:3, overflow:'hidden', position:'relative' }}>
        <div style={{ position:'absolute', left:`${clamped}%`, top:0, bottom:0, width:3, background:'#f59e0b', borderRadius:2, transform:'translateX(-50%)' }} />
      </div>
      <span style={{fontSize:'.75rem',color:'#94a3b8'}}>{fmt(pct, 0)}%</span>
    </div>
  );
}

export default function StockDashboard() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState('');
  const [sector,     setSector]     = useState('All');
  const [sortKey,    setSortKey]    = useState('change');
  const [sortDir,    setSortDir]    = useState(-1); // -1 = desc
  const [page,       setPage]       = useState(1);
  const [ratingFilt,    setRatingFilt]    = useState('All');
  const [spikeFilt,     setSpikeFilt]     = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/stock-dashboard');
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await API.post('/api/stock-dashboard/refresh');
      await load();
    } catch (e) {
      setError('Refresh failed: ' + e.message);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d * -1);
    else { setSortKey(key); setSortDir(-1); }
    setPage(1);
  }

  const filtered = useMemo(() => {
    if (!data?.stocks) return [];
    let arr = data.stocks;

    // Search
    if (search) {
      const q = search.toUpperCase();
      arr = arr.filter(s => s.ticker.includes(q) || s.name?.toUpperCase().includes(q));
    }
    // Sector
    if (sector !== 'All') {
      arr = arr.filter(s => {
        if (sector === 'ETF') return s.quoteType === 'ETF';
        return s.sector === sector;
      });
    }
    // Rating filter
    if (ratingFilt !== 'All') {
      arr = arr.filter(s => s.rating?.includes(ratingFilt));
    }
    // Volume spike filter
    if (spikeFilt) {
      arr = arr.filter(s => s.spikeRatio != null && s.spikeRatio >= 2);
    }
    // Sort
    arr = [...arr].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir > 0 ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortDir > 0 ? Infinity : -Infinity);
      return sortDir * (typeof av === 'string' ? av.localeCompare(bv) : av - bv);
    });
    return arr;
  }, [data, search, sector, sortKey, sortDir, ratingFilt, spikeFilt]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageStocks = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const snap = data?.meta?.marketSnapshot;
  const cachedAt = data?._cachedAt ? new Date(data._cachedAt).toLocaleString() : null;

  if (loading) return (
    <div className="mw-page mw-loading">
      <div className="mw-spinner" />
      <p>Loading market data…</p>
    </div>
  );

  return (
    <div className="mw-page">
      {/* Header */}
      <div className="mw-header">
        <div>
          <h1>🔭 Market Watch</h1>
          <p className="mw-subtitle">
            {data?.meta?.stockCount ?? 0} US stocks · real-time via Yahoo Finance · no API key
            {cachedAt && <span className="mw-muted"> · Updated {cachedAt}</span>}
            {data?._notScanned && <span style={{color:'#f59e0b'}}> · Click Refresh to populate</span>}
          </p>
        </div>
        <button className="mw-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? '⏳ Scanning…' : '⟳ Refresh Now'}
        </button>
      </div>

      {error && <div className="mw-error">⚠️ {error}</div>}

      {/* Market Snapshot Bar */}
      {snap && snap.sp500 && (
        <div className="mw-snap-bar">
          <div className="mw-snap-item">
            <span className="mw-snap-lbl">S&amp;P 500</span>
            <span>{snap.sp500?.toLocaleString()}</span>
            <span className={chgCls(snap.sp500Chg)}>{snap.sp500Chg >= 0 ? '+' : ''}{fmt(snap.sp500Chg)}%</span>
          </div>
          <div className="mw-snap-item">
            <span className="mw-snap-lbl">DOW</span>
            <span>{snap.dow?.toLocaleString()}</span>
            <span className={chgCls(snap.dowChg)}>{snap.dowChg >= 0 ? '+' : ''}{fmt(snap.dowChg)}%</span>
          </div>
          <div className="mw-snap-item">
            <span className="mw-snap-lbl">NASDAQ</span>
            <span>{snap.nasdaq?.toLocaleString()}</span>
            <span className={chgCls(snap.nasdaqChg)}>{snap.nasdaqChg >= 0 ? '+' : ''}{fmt(snap.nasdaqChg)}%</span>
          </div>
          <div className="mw-snap-item">
            <span className="mw-snap-lbl">VIX</span>
            <span className={snap.vix > 20 ? 'mw-dn' : 'mw-up'}>{snap.vix}</span>
          </div>
          <div className="mw-snap-item">
            <span className="mw-snap-lbl">10yr</span>
            <span>{snap.ust10y}%</span>
          </div>
          <div className="mw-snap-item mw-muted" style={{fontSize:'.7rem'}}>
            {snap.updatedAt}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mw-filters">
        <input
          className="mw-search"
          placeholder="Search ticker or name…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select className="mw-select" value={sector} onChange={e => { setSector(e.target.value); setPage(1); }}>
          {SECTORS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="mw-select" value={ratingFilt} onChange={e => { setRatingFilt(e.target.value); setPage(1); }}>
          {['All','Strong Buy','Buy','Hold','Sell'].map(r => <option key={r}>{r}</option>)}
        </select>
        <label className="mw-spike-toggle">
          <input type="checkbox" checked={spikeFilt} onChange={e => { setSpikeFilt(e.target.checked); setPage(1); }} />
          Vol Spike ≥2×
        </label>
        <span className="mw-count mw-muted">{filtered.length} stocks · click any row for chart</span>
      </div>

      {/* Table */}
      {data?._notScanned ? (
        <div className="mw-no-data">
          <p>No market data yet. Click <strong>Refresh Now</strong> to scan {data?.meta?.universeSize ?? 480} US stocks.</p>
          <p className="mw-muted">Auto-refreshes hourly 8AM–4PM ET and at midnight on weekdays.</p>
        </div>
      ) : (
        <>
          <div className="mw-table-wrap">
            <table className="mw-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Name</th>
                  <th>Sector</th>
                  {SORT_KEYS.map(({ key, label }) => (
                    <th
                      key={key}
                      className={`mw-sortable${sortKey === key ? ' mw-sorted' : ''}`}
                      onClick={() => toggleSort(key)}
                    >
                      {label} {sortKey === key ? (sortDir > 0 ? '↑' : '↓') : '↕'}
                    </th>
                  ))}
                  <th>52w Range</th>
                  <th>Mkt Cap</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {pageStocks.map(s => (
                  <tr key={s.ticker} className="mw-row" onClick={() => setSelectedStock(s)} title="Click for chart & levels" style={{cursor:'pointer'}}>
                    <td className="mw-ticker">{s.ticker}</td>
                    <td className="mw-name">{s.name?.length > 24 ? s.name.slice(0, 24) + '…' : s.name}</td>
                    <td className="mw-sector mw-muted">{s.sector || s.quoteType || '—'}</td>
                    <td><ChangeBar pct={s.change} /></td>
                    <td className={chgCls(s.upside)} style={{fontWeight:600}}>
                      {s.upside != null ? (s.upside >= 0 ? '+' : '') + fmt(s.upside) + '%' : '—'}
                    </td>
                    <td>
                      {s.spikeRatio != null
                        ? <span style={{color: s.spikeRatio >= 3 ? '#ef4444' : s.spikeRatio >= 2 ? '#f97316' : '#94a3b8', fontWeight: s.spikeRatio >= 2 ? 700 : 400}}>
                            {s.spikeRatio}×
                          </span>
                        : <span className="mw-muted">—</span>
                      }
                    </td>
                    <td className="mw-num">{fmtMcap(s.marketCap)}</td>
                    <td className="mw-num">${fmt(s.price)}</td>
                    <td className="mw-num">{s.pe != null ? s.pe + 'x' : '—'}</td>
                    <td><W52Bar pct={s.w52Pct} /></td>
                    <td className="mw-num">{fmtVol(s.volume)}</td>
                    <td className="mw-num">{fmtMcap(s.marketCap)}</td>
                    <td>
                      {s.rating
                        ? <span className={`mw-rating-pill ${s.rating.toLowerCase().replace(/\s+/g, '-')}`}>{s.rating}</span>
                        : <span className="mw-muted">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mw-pagination">
              <button onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
              <span className="mw-muted">Page {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          )}
        </>
      )}

      <div className="mw-footer mw-muted">
        Powered by Yahoo Finance. Charts via TradingView. Auto-refreshes hourly 8AM–4PM ET + midnight Mon–Fri. Not investment advice.
      </div>

      {selectedStock && <StockDetailPanel stock={selectedStock} onClose={() => setSelectedStock(null)} />}
    </div>
  );
}

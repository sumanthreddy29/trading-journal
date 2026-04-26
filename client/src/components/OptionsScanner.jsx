import { useState, useEffect, useCallback } from 'react';
import { API } from '../api.js';

// ── Signal badge colors ───────────────────────────
const SIGNAL_COLOR = {
  BULLISH:        '#22c55e',
  SLIGHT_BULLISH: '#86efac',
  NEUTRAL:        '#94a3b8',
  SLIGHT_BEARISH: '#fca5a5',
  BEARISH:        '#ef4444',
};

const ALERT_COLOR = {
  BULLISH_FLOW:      '#22c55e',
  UNUSUAL_CALL_SWEEP:'#3b82f6',
  UNUSUAL_PUT_SWEEP: '#f97316',
  PUT_SKEW_FEAR:     '#ef4444',
  CALL_SKEW_GREED:   '#a855f7',
};

const ALERT_ICON = {
  BULLISH_FLOW:      '🚀',
  UNUSUAL_CALL_SWEEP:'📈',
  UNUSUAL_PUT_SWEEP: '📉',
  PUT_SKEW_FEAR:     '🔴',
  CALL_SKEW_GREED:   '🟣',
};

function fmt(n, dec = 2) {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtVol(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return n.toLocaleString();
}

// ── Sub-components ────────────────────────────────

function AlertCard({ alert }) {
  const color = ALERT_COLOR[alert.type] || '#94a3b8';
  const icon  = ALERT_ICON[alert.type]  || '⚡';
  return (
    <div className="os-alert-card" style={{ borderLeftColor: color }}>
      <div className="os-alert-header">
        <span className="os-alert-icon">{icon}</span>
        <span className="os-alert-ticker">{alert.ticker}</span>
        <span className="os-alert-type" style={{ background: color + '22', color }}>
          {alert.type.replace(/_/g, ' ')}
        </span>
        {alert.spikeRatio && (
          <span className="os-alert-spike">{alert.spikeRatio}x vol</span>
        )}
      </div>
      <p className="os-alert-desc">{alert.description}</p>
      <div className="os-alert-meta">
        {alert.pcRatio    != null && <span>P/C OI: {fmt(alert.pcRatio)}</span>}
        {alert.maxPain    != null && <span>Max Pain: ${fmt(alert.maxPain, 2)}</span>}
        {alert.ivSkewPct  != null && <span>IV Skew: {alert.ivSkewPct > 0 ? '+' : ''}{alert.ivSkewPct}%</span>}
        {alert.price      != null && <span>Price: ${fmt(alert.price, 2)}</span>}
      </div>
      {alert.topContract && (
        <div className="os-contract-pill">
          <span>${alert.topContract.strike} {alert.topContract.expiry}</span>
          <span>Vol: {fmtVol(alert.topContract.volume)}</span>
          <span>OI: {fmtVol(alert.topContract.openInterest)}</span>
          <span>V/OI: {alert.topContract.volOiRatio}x</span>
          {alert.topContract.iv != null && <span>IV: {alert.topContract.iv}%</span>}
        </div>
      )}
    </div>
  );
}

function SpikeRow({ spike, onSelect, selected }) {
  return (
    <tr
      className={'os-spike-row' + (selected ? ' os-spike-selected' : '')}
      onClick={() => onSelect(spike)}
      title="Click to view options chain"
    >
      <td className="os-ticker-cell">{spike.ticker}</td>
      <td>{spike.name?.length > 22 ? spike.name.slice(0, 22) + '…' : spike.name}</td>
      <td className="os-num">${fmt(spike.price, 2)}</td>
      <td className={'os-num ' + (spike.change >= 0 ? 'os-up' : 'os-dn')}>
        {spike.change >= 0 ? '+' : ''}{fmt(spike.change, 1)}%
      </td>
      <td className="os-num os-spike-badge" style={{
        color: spike.spikeRatio >= 5 ? '#ef4444' : spike.spikeRatio >= 3 ? '#f97316' : '#22c55e'
      }}>
        {spike.spikeRatio}x
      </td>
      <td className="os-num">{fmtVol(spike.volume)}</td>
      <td className="os-num os-muted">{fmtVol(spike.avg10dVol)}</td>
      <td>{spike.options?.signal
        ? <span className="os-signal-pill" style={{ background: (SIGNAL_COLOR[spike.options.signal] || '#94a3b8') + '22', color: SIGNAL_COLOR[spike.options.signal] || '#94a3b8' }}>
            {spike.options.signal.replace(/_/g, ' ')}
          </span>
        : <span className="os-muted">—</span>
      }</td>
      <td className="os-num os-muted">{spike.options?.pcRatio != null ? fmt(spike.options.pcRatio) : '—'}</td>
      <td className="os-num os-muted">{spike.options?.maxPain != null ? '$' + fmt(spike.options.maxPain, 0) : '—'}</td>
    </tr>
  );
}

function OptionsDetail({ stock }) {
  if (!stock?.options) return null;
  const opts = stock.options;

  return (
    <div className="os-detail-panel">
      <div className="os-detail-header">
        <h3>{stock.ticker} — {stock.name}</h3>
        <span className="os-signal-pill large" style={{ background: (SIGNAL_COLOR[opts.signal] || '#94a3b8') + '22', color: SIGNAL_COLOR[opts.signal] || '#94a3b8' }}>
          {opts.signal?.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="os-detail-kpis">
        <div className="os-kpi"><label>Price</label><span>${fmt(stock.price, 2)}</span></div>
        <div className="os-kpi"><label>Vol Spike</label><span style={{color:'#f97316'}}>{stock.spikeRatio}x</span></div>
        <div className="os-kpi"><label>P/C OI Ratio</label><span>{opts.pcRatio != null ? fmt(opts.pcRatio) : '—'}</span></div>
        <div className="os-kpi"><label>P/C Vol Ratio</label><span>{opts.pcVolRatio != null ? fmt(opts.pcVolRatio) : '—'}</span></div>
        <div className="os-kpi"><label>Max Pain</label><span>{opts.maxPain != null ? '$' + fmt(opts.maxPain, 0) : '—'}</span></div>
        <div className="os-kpi"><label>IV Skew</label><span style={{color: opts.ivSkewPct > 5 ? '#ef4444' : opts.ivSkewPct < -5 ? '#a855f7' : 'inherit'}}>{opts.ivSkewPct != null ? (opts.ivSkewPct > 0 ? '+' : '') + opts.ivSkewPct + '%' : '—'}</span></div>
        <div className="os-kpi"><label>Call OI</label><span className="os-up">{fmtVol(opts.totalCallOI)}</span></div>
        <div className="os-kpi"><label>Put OI</label><span className="os-dn">{fmtVol(opts.totalPutOI)}</span></div>
        <div className="os-kpi"><label>Call Vol</label><span className="os-up">{fmtVol(opts.totalCallVol)}</span></div>
        <div className="os-kpi"><label>Put Vol</label><span className="os-dn">{fmtVol(opts.totalPutVol)}</span></div>
        <div className="os-kpi"><label>Expiries</label><span>{opts.expiryCount}</span></div>
      </div>

      <div className="os-detail-tables">
        <div className="os-contracts-block">
          <h4 className="os-up">🔥 Top Call OI Strikes</h4>
          <ContractTable contracts={opts.topCallOI} type="CALL" />
        </div>
        <div className="os-contracts-block">
          <h4 className="os-dn">🛡️ Top Put OI Strikes</h4>
          <ContractTable contracts={opts.topPutOI} type="PUT" />
        </div>
        {opts.unusualCalls?.length > 0 && (
          <div className="os-contracts-block">
            <h4 style={{color:'#3b82f6'}}>⚡ Unusual Call Flow (V/OI ≥ 1x)</h4>
            <ContractTable contracts={opts.unusualCalls} type="CALL" showVolOI />
          </div>
        )}
        {opts.unusualPuts?.length > 0 && (
          <div className="os-contracts-block">
            <h4 style={{color:'#f97316'}}>⚡ Unusual Put Flow (V/OI ≥ 1x)</h4>
            <ContractTable contracts={opts.unusualPuts} type="PUT" showVolOI />
          </div>
        )}
      </div>
    </div>
  );
}

function ContractTable({ contracts, type, showVolOI }) {
  if (!contracts?.length) return <p className="os-empty">No data</p>;
  const color = type === 'CALL' ? '#22c55e' : '#ef4444';
  return (
    <table className="os-contract-table">
      <thead>
        <tr>
          <th>Strike</th>
          <th>Expiry</th>
          <th>OI</th>
          <th>Volume</th>
          {showVolOI && <th>V/OI</th>}
          <th>IV%</th>
          <th>Last</th>
          <th>ITM</th>
        </tr>
      </thead>
      <tbody>
        {contracts.map((c, i) => (
          <tr key={i} className={c.inTheMoney ? 'os-itm' : ''}>
            <td style={{color, fontWeight: 600}}>${c.strike}</td>
            <td className="os-muted">{c.expiry || '—'}</td>
            <td className="os-num">{fmtVol(c.openInterest)}</td>
            <td className="os-num">{fmtVol(c.volume)}</td>
            {showVolOI && <td className="os-num" style={{color:'#f97316'}}>{c.volOiRatio}x</td>}
            <td className="os-num">{c.iv != null ? c.iv + '%' : '—'}</td>
            <td className="os-num">${fmt(c.lastPrice, 2)}</td>
            <td className="os-muted">{c.inTheMoney ? '✓' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main Component ────────────────────────────────
export default function OptionsScanner() {
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [scanning,      setScanning]      = useState(false);
  const [error,         setError]         = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [activeTab,     setActiveTab]     = useState('core'); // core | alerts | spikes | chains
  const [alertFilter,   setAlertFilter]   = useState('ALL');
  const [spikeSearch,   setSpikeSearch]   = useState('');
  const [sortKey,       setSortKey]       = useState('spikeRatio');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetch('/api/options-scanner');
      const json   = await result.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function triggerScan(extended = false) {
    setScanning(true);
    try {
      await API.post('/api/options-scanner/refresh', { extended });
      await load();
    } catch (e) {
      setError('Scan failed: ' + e.message);
    } finally {
      setScanning(false);
    }
  }

  const alertTypes  = data ? ['ALL', ...new Set(data.alerts?.map(a => a.type))] : ['ALL'];
  const filtAlerts  = data?.alerts?.filter(a => alertFilter === 'ALL' || a.type === alertFilter) || [];

  const spikes = (data?.volumeSpikes || [])
    .filter(s => !spikeSearch || s.ticker.includes(spikeSearch.toUpperCase()) || s.name?.toLowerCase().includes(spikeSearch.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === 'spikeRatio') return b.spikeRatio - a.spikeRatio;
      if (sortKey === 'volume')     return (b.volume || 0) - (a.volume || 0);
      if (sortKey === 'change')     return (b.change || 0) - (a.change || 0);
      if (sortKey === 'pcRatio')    return (a.options?.pcRatio || 999) - (b.options?.pcRatio || 999);
      return 0;
    });

  const cachedAt = data?._cachedAt ? new Date(data._cachedAt).toLocaleString() : null;

  if (loading) return (
    <div className="os-page os-loading">
      <div className="os-spinner" />
      <p>Loading options scanner data…</p>
    </div>
  );

  return (
    <div className="os-page">
      {/* Header */}
      <div className="os-page-header">
        <div>
          <h1>⚡ Options Flow Scanner</h1>
          <p className="os-subtitle">
            {data?.mode === 'extended'
              ? `Extended scan — ${data.universeSize || 0} stocks`
              : 'SPY · QQQ · SPX · NDX — same-day (0DTE) options only'
            }
            {cachedAt && <span className="os-muted"> · Last scan: {cachedAt}</span>}
            {data?.mode && <span className="os-mode-badge" style={{marginLeft:'0.5rem', fontSize:'0.7rem', padding:'0.1rem 0.5rem', borderRadius:'10px', background: data.mode === 'extended' ? '#1e40af22' : '#0f172a', color: data.mode === 'extended' ? '#60a5fa' : '#64748b', border:'1px solid currentColor'}}>{data.mode.toUpperCase()}</span>}
          </p>
        </div>
        <div className="os-header-btns">
          <button
            className="os-refresh-btn"
            onClick={() => triggerScan(false)}
            disabled={scanning}
            title="Scan SPY, QQQ, SPX, NDX only (fast)"
          >
            {scanning ? '⏳ Scanning…' : '🔍 Scan Core 4'}
          </button>
          <button
            className="os-refresh-btn os-ext-btn"
            onClick={() => triggerScan(true)}
            disabled={scanning}
            title="Scan full US universe for volume spikes + options (~5 min)"
          >
            {scanning ? '⏳ Scanning…' : '🌐 Extended Scan'}
          </button>
        </div>
      </div>

      {error && <div className="os-error">⚠️ {error}</div>}

      {/* Summary KPIs */}
      {data && (
        <div className="os-kpi-row">
          <div className="os-kpi-card">
            <span className="os-kpi-val">{data.chainsAnalyzed || 0}</span>
            <span className="os-kpi-label">Chains Analyzed</span>
          </div>
          <div className="os-kpi-card">
            <span className="os-kpi-val os-alert-color">{data.alerts?.length || 0}</span>
            <span className="os-kpi-label">Alerts</span>
          </div>
          <div className="os-kpi-card">
            <span className="os-kpi-val os-up">{data.alerts?.filter(a => a.type === 'BULLISH_FLOW' || a.type === 'UNUSUAL_CALL_SWEEP').length || 0}</span>
            <span className="os-kpi-label">Bullish Signals</span>
          </div>
          <div className="os-kpi-card">
            <span className="os-kpi-val os-dn">{data.alerts?.filter(a => a.type === 'UNUSUAL_PUT_SWEEP' || a.type === 'PUT_SKEW_FEAR').length || 0}</span>
            <span className="os-kpi-label">Bearish Signals</span>
          </div>
          {data.mode === 'extended' && (
            <div className="os-kpi-card">
              <span className="os-kpi-val os-spike-color">{data.spikesFound || 0}</span>
              <span className="os-kpi-label">Vol Spikes Found</span>
            </div>
          )}
        </div>
      )}

      {/* No data yet */}
      {!data?.chainsAnalyzed && !loading && (
        <div className="os-no-data">
          <p>No scan data yet. Click <strong>Scan Core 4</strong> to analyze same-day (0DTE) options for SPY, QQQ, SPX, and NDX.</p>
          <p className="os-muted">Scans run automatically at 9:35 AM ET on weekdays. Use <strong>Extended Scan</strong> to also screen all US stocks for volume spikes.</p>
        </div>
      )}

      {/* Tabs */}
      {data?.chainsAnalyzed > 0 && (
        <>
          <div className="os-tabs">
            {[
              ['core',   `🎯 Core 4 (${data.coreChains?.length || 0})`],
              ['alerts', `🚨 Alerts (${data.alerts?.length || 0})`],
              ...(data.mode === 'extended' ? [
                ['spikes', `📊 Vol Spikes (${data.spikesFound || 0})`],
                ['chains', `🔗 All Chains (${data.chainsAnalyzed || 0})`],
              ] : []),
            ].map(([tab, label]) => (
              <button
                key={tab}
                className={'os-tab' + (activeTab === tab ? ' os-tab-active' : '')}
                onClick={() => { setActiveTab(tab); setSelectedStock(null); }}
              >{label}</button>
            ))}
          </div>

          {/* CORE 4 TAB */}
          {activeTab === 'core' && (
            <div className="os-tab-content">
              <div className="os-core-grid">
                {(data.coreChains || []).map((s, i) => (
                  <div
                    key={i}
                    className={'os-core-card' + (selectedStock?.ticker === s.ticker ? ' selected' : '')}
                    onClick={() => setSelectedStock(selectedStock?.ticker === s.ticker ? null : s)}
                  >
                    <div className="os-core-card-header">
                      <span className="os-ticker-cell">{s.ticker}</span>
                      <span className="os-muted" style={{fontSize:'0.75rem'}}>{s.label}</span>
                      <span style={{fontSize:'0.65rem', padding:'0.1rem 0.4rem', borderRadius:'6px', background:'#0f172a', color:'#f59e0b', border:'1px solid #f59e0b', fontWeight:700, letterSpacing:'0.05em'}}>
                        {s.options?.expiryDate === new Date().toISOString().slice(0,10) ? '0DTE' : (s.options?.expiryDate || '0DTE')}
                      </span>
                      <span
                        className="os-signal-pill"
                        style={{ background: (SIGNAL_COLOR[s.options?.signal] || '#94a3b8') + '22', color: SIGNAL_COLOR[s.options?.signal] || '#94a3b8' }}
                      >
                        {s.options?.signal?.replace(/_/g, ' ') || '—'}
                      </span>
                    </div>
                    <div className="os-core-card-body">
                      <div><label>Price</label><span>${fmt(s.price, 2)}</span></div>
                      <div><label>Change</label><span className={s.change >= 0 ? 'os-up' : 'os-dn'}>{s.change >= 0 ? '+' : ''}{fmt(s.change, 2)}%</span></div>
                      <div><label>P/C OI</label><span>{fmt(s.options?.pcRatio)}</span></div>
                      <div><label>P/C Vol</label><span>{fmt(s.options?.pcVolRatio)}</span></div>
                      <div><label>Max Pain</label><span>{s.options?.maxPain != null ? '$' + fmt(s.options.maxPain, 0) : '—'}</span></div>
                      <div><label>IV Skew</label><span style={{color: s.options?.ivSkewPct > 5 ? '#ef4444' : s.options?.ivSkewPct < -5 ? '#a855f7' : 'inherit'}}>{s.options?.ivSkewPct != null ? (s.options.ivSkewPct > 0 ? '+' : '') + s.options.ivSkewPct + '%' : '—'}</span></div>
                      <div><label>Call OI</label><span className="os-up">{fmtVol(s.options?.totalCallOI)}</span></div>
                      <div><label>Put OI</label><span className="os-dn">{fmtVol(s.options?.totalPutOI)}</span></div>
                    </div>
                    <p className="os-core-card-hint os-muted">Click to view full chain ↓</p>
                  </div>
                ))}
              </div>
              {selectedStock && <OptionsDetail stock={selectedStock} />}
            </div>
          )}

          {/* ALERTS TAB */}
          {activeTab === 'alerts' && (
            <div className="os-tab-content">
              <div className="os-filter-bar">
                {alertTypes.map(t => (
                  <button
                    key={t}
                    className={'os-filter-chip' + (alertFilter === t ? ' active' : '')}
                    onClick={() => setAlertFilter(t)}
                    style={t !== 'ALL' ? { borderColor: ALERT_COLOR[t] || '#94a3b8', color: alertFilter === t ? '#fff' : (ALERT_COLOR[t] || '#94a3b8'), background: alertFilter === t ? (ALERT_COLOR[t] || '#94a3b8') : 'transparent' } : {}}
                  >
                    {t === 'ALL' ? 'All' : t.replace(/_/g, ' ')} {t !== 'ALL' && `(${data.alerts.filter(a => a.type === t).length})`}
                  </button>
                ))}
              </div>
              {filtAlerts.length === 0
                ? <p className="os-empty">No alerts for this filter.</p>
                : <div className="os-alerts-grid">
                    {filtAlerts.map((a, i) => <AlertCard key={i} alert={a} />)}
                  </div>
              }
            </div>
          )}

          {/* VOLUME SPIKES TAB */}
          {activeTab === 'spikes' && (
            <div className="os-tab-content">
              <div className="os-toolbar">
                <input
                  className="os-search"
                  placeholder="Search ticker or name…"
                  value={spikeSearch}
                  onChange={e => setSpikeSearch(e.target.value)}
                />
                <div className="os-sort-btns">
                  <span className="os-muted">Sort:</span>
                  {[['spikeRatio','Spike'], ['volume','Volume'], ['change','Change%'], ['pcRatio','P/C']].map(([k, label]) => (
                    <button
                      key={k}
                      className={'os-sort-btn' + (sortKey === k ? ' active' : '')}
                      onClick={() => setSortKey(k)}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <div className="os-table-wrap">
                <table className="os-spikes-table">
                  <thead>
                    <tr>
                      <th>Ticker</th><th>Name</th><th>Price</th><th>Change</th>
                      <th>Spike</th><th>Volume</th><th>10d Avg</th>
                      <th>Signal</th><th>P/C</th><th>Max Pain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spikes.map((s, i) => (
                      <SpikeRow key={i} spike={s} onSelect={setSelectedStock} selected={selectedStock?.ticker === s.ticker} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CHAINS TAB */}
          {activeTab === 'chains' && (
            <div className="os-tab-content">
              <div className="os-chains-layout">
                <div className="os-chains-list">
                  {(data.optionsChains || []).map((s, i) => (
                    <div
                      key={i}
                      className={'os-chain-item' + (selectedStock?.ticker === s.ticker ? ' selected' : '')}
                      onClick={() => setSelectedStock(s)}
                    >
                      <span className="os-ticker-cell">{s.ticker}</span>
                      <span className="os-muted">${fmt(s.price, 2)}</span>
                      <span style={{color: SIGNAL_COLOR[s.options?.signal] || '#94a3b8', fontSize: '0.75rem'}}>
                        {s.options?.signal?.replace(/_/g, ' ') || '—'}
                      </span>
                      <span className="os-spike-badge">{s.spikeRatio}x</span>
                    </div>
                  ))}
                </div>
                <div className="os-chains-detail">
                  {selectedStock
                    ? <OptionsDetail stock={selectedStock} />
                    : <div className="os-empty">Select a stock from the list to view its options chain analysis.</div>
                  }
                </div>
              </div>
            </div>
          )}

          {/* Detail panel below spikes table */}
          {activeTab === 'spikes' && selectedStock && (
            <OptionsDetail stock={selectedStock} />
          )}
        </>
      )}
    </div>
  );
}

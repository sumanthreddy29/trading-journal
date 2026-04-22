import React, { useState, useEffect } from 'react';
import { API } from '../api.js';
import { r2, fMoney, isoToSlash, slashToIso, getESTToday } from '../utils/helpers.js';

const OPTION_FEE = 0.65;
const NDX_SET    = new Set(['NDX', 'NDXP', 'NDXS']);

function calcPnlValues(qty, buy, sell, type) {
  const isOpt  = type === 'CALL' || type === 'PUT';
  const mult   = isOpt ? 100 : 1;
  const fee    = isOpt ? qty * OPTION_FEE * 2 : 0;
  const proceeds  = r2(sell * qty * mult - fee / 2);
  const cost      = r2(buy  * qty * mult + fee / 2);
  const pnl       = r2(proceeds - cost);
  return { proceeds, cost, pnl, fee };
}

const TABS = [
  ['details',    '📊 Trade Details'],
  ['analysis',   '📝 Analysis'],
  ['screenshot', '📸 Screenshot'],
  ['rules',      '📏 Rules'],
];

export default function TradeForm({ editId, allTrades, onClose, onSaved, onToast }) {
  const today = getESTToday();
  const [tab,          setTab]         = useState('details');
  const [symbol,       setSymbol]      = useState('');
  const [desc,         setDesc]        = useState('');
  const [type,         setType]        = useState('CALL');
  const [qty,          setQty]         = useState(1);
  const [buy,          setBuy]         = useState('');
  const [sell,         setSell]        = useState('');
  const [entryDate,    setEntryDate]   = useState(today);
  const [exitDate,     setExitDate]    = useState(today);
  const [tags,         setTags]        = useState('');
  const [reason,       setReason]      = useState('');
  const [context,      setContext]     = useState('');
  const [exitNotes,    setExitNotes]   = useState('');
  const [failReason,   setFailReason]  = useState('');
  const [shotB64,      setShotB64]     = useState(null);
  const [shotName,     setShotName]    = useState(null);
  const [strike,       setStrike]      = useState('');
  const [broker,       setBroker]      = useState('fidelity');
  const [tickerEntry,  setTickerEntry] = useState('');
  const [tickerExit,   setTickerExit]  = useState('');
  const [entryTime,    setEntryTime]   = useState('');
  const [exitTime,     setExitTime]    = useState('');
  const [saving,       setSaving]      = useState(false);
  const [rulesList,    setRulesList]   = useState([]);
  const [ruleAdherence,setRuleAdherence] = useState({}); // { rule_id: true|false } or absent = not logged

  // Load user's rules once on mount
  useEffect(() => {
    API.get('/api/rules').then(r => { if (r) setRulesList(r); });
  }, []);

  useEffect(() => {
    if (!editId) return;
    const t = allTrades.find(x => x.id === editId);
    if (!t) return;
    setSymbol(t.symbol || '');
    setDesc(t.description || '');
    setType(t.trade_type || 'CALL');
    setQty(t.quantity || 1);
    const isOpt = ['CALL','PUT'].includes((t.trade_type || '').toUpperCase());
    setBuy(isOpt  ? r2((t.buy_price  || 0) / 100) : (t.buy_price  || 0));
    setSell(isOpt ? r2((t.sell_price || 0) / 100) : (t.sell_price || 0));
    setStrike(t.strike_price != null ? t.strike_price : '');
    setBroker(t.broker || 'fidelity');
    setTickerEntry(t.ticker_at_entry != null ? t.ticker_at_entry : '');
    setTickerExit(t.ticker_at_exit  != null ? t.ticker_at_exit  : '');
    setEntryTime(t.entry_time || '');
    setExitTime(t.exit_time  || '');
    setEntryDate(slashToIso(t.date_acquired));
    setExitDate(slashToIso(t.date_sold));
    setTags(t.tags || '');
    setReason(t.entry_reason || '');
    setContext(t.market_context || '');
    setExitNotes(t.exit_notes || '');
    setFailReason(t.failure_reason || '');
    if (t.screenshot_b64) { setShotB64(t.screenshot_b64); setShotName(t.screenshot_name); }
    // Load existing rule adherence for this trade
    API.get('/api/trades/' + editId + '/rules').then(r => {
      if (r) {
        const map = {};
        r.forEach(({ rule_id, followed }) => { map[rule_id] = followed; });
        setRuleAdherence(map);
      }
    });
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pnl = calcPnlValues(+qty || 0, +buy || 0, +sell || 0, type);

  function handleImageFile(file) {
    if (!file.type.startsWith('image/'))    { onToast('Please select an image file', 'err'); return; }
    if (file.size > 5 * 1024 * 1024)       { onToast('Image must be under 5MB', 'err'); return; }
    const reader = new FileReader();
    reader.onload = e => { setShotB64(e.target.result); setShotName(file.name); };
    reader.readAsDataURL(file);
  }

  async function save() {
    const sym = symbol.toUpperCase().trim();
    if (!sym)              { onToast('Symbol is required', 'err'); setTab('details'); return; }
    const ed = isoToSlash(entryDate), xd = isoToSlash(exitDate);
    if (!ed || !xd)        { onToast('Dates are required', 'err'); return; }
    const { proceeds, cost, pnl: netPnl } = calcPnlValues(+qty || 1, +buy || 0, +sell || 0, type);
    const isNdx = NDX_SET.has(sym) || sym.startsWith('NDX');
    const payload = {
      symbol: sym, base_symbol: sym,
      description:    desc.trim() || sym,
      trade_type:     type,
      quantity:       +qty || 1,
      buy_price:      type === 'CALL' || type === 'PUT' ? r2((+buy  || 0) * 100) : (+buy  || 0),
      sell_price:     type === 'CALL' || type === 'PUT' ? r2((+sell || 0) * 100) : (+sell || 0),
      strike_price:   (type === 'CALL' || type === 'PUT') && strike !== '' ? +strike : null,
      broker:         broker || 'fidelity',
      ticker_at_entry: tickerEntry !== '' ? +tickerEntry : null,
      ticker_at_exit:  tickerExit  !== '' ? +tickerExit  : null,
      entry_time:      entryTime  || null,
      exit_time:       exitTime   || null,
      date_acquired:  ed,
      date_sold:      xd,
      proceeds,
      cost_basis:     cost,
      total_gl:       netPnl,
      same_day:       ed === xd,
      is_ndx:         isNdx,
      lt_gl:          isNdx ? r2(netPnl * 0.6) : null,
      st_gl:          isNdx ? r2(netPnl * 0.4) : null,
      status:         'closed',
      entry_reason:   reason.trim()    || null,
      market_context: context.trim()   || null,
      exit_notes:     exitNotes.trim() || null,
      failure_reason: failReason.trim()|| null,
      screenshot_b64: shotB64  || null,
      screenshot_name:shotName || null,
      tags:           tags.trim()      || null,
    };
    setSaving(true);
    const res = editId
      ? await API.put('/api/trades/' + editId, payload)
      : await API.post('/api/trades', payload);
    setSaving(false);
    if (res?.error) { onToast(res.error, 'err'); return; }
    // Save rule adherence
    const tradeId = editId || res?.id;
    if (tradeId) {
      const rulesPayload = Object.entries(ruleAdherence).map(([rule_id, followed]) => ({
        rule_id: parseInt(rule_id), followed,
      }));
      if (rulesPayload.length) await API.post('/api/trades/' + tradeId + '/rules', { rules: rulesPayload });
    }
    onToast(editId ? 'Trade updated ✓' : 'Trade saved ✓', 'ok');
    onSaved();
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hdr">
          <h2>{editId ? 'Edit Trade' : 'Add Trade'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Tabs */}
          <div className="form-tabs">
            {TABS.map(([id, label]) => (
              <div key={id} className={`form-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</div>
            ))}
          </div>

          {/* ── Details ── */}
          {tab === 'details' && (
            <div>
              <div className="form-row">
                <div className="f-group">
                  <label>Ticker / Symbol *</label>
                  <input type="text" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="NDXP, NVDA, QQQ…" />
                </div>
                <div className="f-group">
                  <label>Trade Type</label>
                  <select value={type} onChange={e => setType(e.target.value)}>
                    <option value="CALL">CALL (Option)</option>
                    <option value="PUT">PUT (Option)</option>
                    <option value="STOCK">STOCK</option>
                  </select>
                </div>
                <div className="f-group">
                  <label>Broker</label>
                  <select value={broker} onChange={e => setBroker(e.target.value)}>
                    <option value="fidelity">Fidelity</option>
                    <option value="robinhood">Robinhood</option>
                  </select>
                </div>
              </div>
              <div className="form-row cols3">
                <div className="f-group"><label>Contracts / Shares *</label><input type="number" value={qty}  onChange={e => setQty(e.target.value)}  min="1" step="any" /></div>
                <div className="f-group"><label>Buy Price *{(type==='CALL'||type==='PUT') ? ' (per share)' : ''}</label><input type="number" value={buy}  onChange={e => setBuy(e.target.value)}  step="0.01" placeholder="0.00" /></div>
                <div className="f-group"><label>Sell Price *{(type==='CALL'||type==='PUT') ? ' (per share)' : ''}</label><input type="number" value={sell} onChange={e => setSell(e.target.value)} step="0.01" placeholder="0.00" /></div>
              </div>
              {(type === 'CALL' || type === 'PUT') && (
                <div className="form-row">
                  <div className="f-group">
                    <label>Strike Price</label>
                    <input type="number" value={strike} onChange={e => setStrike(e.target.value)} step="1" placeholder="e.g. 25600" />
                  </div>
                  <div className="f-group">
                    <label>Underlying at Entry <span style={{color:'var(--muted)',fontWeight:400}}>(optional)</span></label>
                    <input type="number" value={tickerEntry} onChange={e => setTickerEntry(e.target.value)} step="0.01" placeholder="e.g. 19850" />
                  </div>
                  <div className="f-group">
                    <label>Underlying at Exit <span style={{color:'var(--muted)',fontWeight:400}}>(optional)</span></label>
                    <input type="number" value={tickerExit} onChange={e => setTickerExit(e.target.value)} step="0.01" placeholder="e.g. 19920" />
                  </div>
                </div>
              )}
              <div className="form-row">
                <div className="f-group"><label>Entry Date *</label><input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} /></div>
                <div className="f-group"><label>Entry Time <span style={{color:'var(--muted)',fontWeight:400}}>(optional)</span></label><input type="time" step="1" value={entryTime} onChange={e => setEntryTime(e.target.value)} style={{colorScheme:'dark'}} /></div>
                <div className="f-group"><label>Exit Date *</label><input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} /></div>
                <div className="f-group"><label>Exit Time <span style={{color:'var(--muted)',fontWeight:400}}>(optional)</span></label><input type="time" step="1" value={exitTime} onChange={e => setExitTime(e.target.value)} style={{colorScheme:'dark'}} /></div>
              </div>
              <div className="form-row full">
                <div className="f-group">
                  <label>Description (optional)</label>
                  <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. CALL (NDXP) NASDAQ 100 INDEX JAN 23 26 $25600" />
                </div>
              </div>
              <div className="form-row full">
                <div className="f-group">
                  <label>Tags (comma-separated)</label>
                  <input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="momentum, breakout, earnings…" />
                </div>
              </div>
              <div className="pnl-preview">
                <div><span>Proceeds</span><br /><strong>{fMoney(pnl.proceeds)}</strong></div>
                <div><span>Cost Basis</span><br /><strong>{fMoney(pnl.cost)}</strong></div>
                <div><span>Net P&amp;L</span><br /><strong style={{ color: pnl.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fMoney(pnl.pnl, true)}</strong></div>
                <div><span>Option Fee</span><br /><strong>{fMoney(pnl.fee)}</strong></div>
              </div>
            </div>
          )}

          {/* ── Analysis ── */}
          {tab === 'analysis' && (
            <div>
              {/* Live Trade Intelligence Panel — only for options with enough data */}
              {(type === 'CALL' || type === 'PUT') && (+buy > 0) && (() => {
                const isCall       = type === 'CALL';
                const sp           = +strike      || null;
                const te           = +tickerEntry || null;
                const tx           = +tickerExit  || null;
                const optBuy       = +buy  || 0; // per-share
                const optSell      = +sell || 0; // per-share
                const intrinsic    = sp && te ? Math.max(0, isCall ? te - sp : sp - te) : null;
                const extrinsic    = intrinsic !== null ? Math.max(0, optBuy - intrinsic) : null;
                const extrinsicPct = intrinsic !== null && optBuy > 0 ? Math.round(extrinsic / optBuy * 100) : null;
                const beMoveNeeded = sp && te ? (isCall ? sp + optBuy - te : te - sp - optBuy) : null;
                const moveCaptured = te && tx ? (isCall ? tx - te : te - tx) : null;
                const favorable    = moveCaptured !== null ? moveCaptured >= 0 : null;
                const moneyness    = sp && te
                  ? (Math.abs(te - sp) < sp * 0.002 ? 'ATM'
                    : (isCall ? (te > sp ? 'ITM' : 'OTM') : (te < sp ? 'ITM' : 'OTM')))
                  : null;
                const moneynessColor = moneyness === 'ITM' ? 'var(--green)' : moneyness === 'OTM' ? 'var(--red)' : 'var(--yellow)';
                const highExtrinsic  = extrinsicPct !== null && extrinsicPct > 70;

                return (
                  <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', marginBottom: 14, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                      ⚡ Trade Intelligence
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>

                      {moneyness && (
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>MONEYNESS AT ENTRY</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: moneynessColor }}>{moneyness}</div>
                          {sp && te && <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Strike {sp} · Underlying {te}</div>}
                        </div>
                      )}

                      {intrinsic !== null && (
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>INTRINSIC VALUE</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>${intrinsic.toFixed(2)}</div>
                          <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>of ${optBuy.toFixed(2)} paid</div>
                        </div>
                      )}

                      {extrinsic !== null && (
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: highExtrinsic ? '1px solid rgba(239,68,68,.4)' : undefined }}>
                          <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>TIME VALUE (EXTRINSIC)</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: highExtrinsic ? 'var(--red)' : 'var(--text)' }}>
                            ${extrinsic.toFixed(2)} <span style={{ fontSize: '.75rem', fontWeight: 400 }}>({extrinsicPct}%)</span>
                          </div>
                          {highExtrinsic && <div style={{ fontSize: '.68rem', color: 'var(--red)', marginTop: 2 }}>⚠️ High extrinsic — theta risk</div>}
                        </div>
                      )}

                      {beMoveNeeded !== null && (
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>BREAKEVEN MOVE NEEDED</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: beMoveNeeded <= 0 ? 'var(--green)' : 'var(--yellow)' }}>
                            {beMoveNeeded <= 0 ? 'Already ITM' : `+${beMoveNeeded.toFixed(1)} pts`}
                          </div>
                          {beMoveNeeded > 0 && <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>underlying must move to profit</div>}
                        </div>
                      )}

                      {moveCaptured !== null && (
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>UNDERLYING MOVE CAUGHT</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: favorable ? 'var(--green)' : 'var(--red)' }}>
                            {moveCaptured >= 0 ? '+' : ''}{moveCaptured.toFixed(1)} pts
                          </div>
                          <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>{te} → {tx}</div>
                        </div>
                      )}

                      {moveCaptured !== null && beMoveNeeded !== null && (
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 4 }}>MOVE vs BREAKEVEN</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: moveCaptured >= beMoveNeeded ? 'var(--green)' : 'var(--red)' }}>
                            {moveCaptured >= beMoveNeeded ? '✓ Covered' : '✗ Not covered'}
                          </div>
                          <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>
                            Needed {beMoveNeeded.toFixed(1)}, got {moveCaptured.toFixed(1)}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })()}

              <div className="form-row full"><div className="f-group"><label>Why I took this trade</label><textarea value={reason}     onChange={e => setReason(e.target.value)}     placeholder="Setup, pattern, signal, thesis…" rows={3} /></div></div>
              <div className="form-row full"><div className="f-group"><label>Market context</label>       <textarea value={context}    onChange={e => setContext(e.target.value)}    placeholder="Market conditions, news, sentiment at the time…" rows={3} /></div></div>
              <div className="form-row full"><div className="f-group"><label>Exit notes</label>            <textarea value={exitNotes}  onChange={e => setExitNotes(e.target.value)}  placeholder="How the trade played out, why I exited…" rows={3} /></div></div>
              <div className="form-row full">
                <div className="f-group">
                  <label>❌ What went wrong / Lessons learned</label>
                  <textarea value={failReason} onChange={e => setFailReason(e.target.value)} placeholder="Mistakes made, what I'd do differently…" rows={3} style={{ borderColor: 'rgba(239,68,68,.3)' }} />
                  <div className="f-note">Fill even for winning trades — track near-misses and execution flaws.</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Screenshot ── */}
          {tab === 'screenshot' && (
            <div>
              <div
                className="drop-zone"
                onClick={() => document.getElementById('tj-file-input').click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f) handleImageFile(f); }}
              >
                <div className="icon">📸</div>
                <p><strong>Click to upload</strong> or drag &amp; drop a screenshot</p>
                <p style={{ marginTop: 4, fontSize: '.75rem' }}>PNG, JPG up to 5MB</p>
              </div>
              <input type="file" id="tj-file-input" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files[0]; if (f) handleImageFile(f); }} />
              {shotB64 && (
                <div className="screenshot-preview" style={{ display: 'block' }}>
                  <img src={shotB64} alt="screenshot" />
                  <button className="remove-img" onClick={() => { setShotB64(null); setShotName(null); }}>✕</button>
                </div>
              )}
            </div>
          )}

          {/* ── Rules ── */}
          {tab === 'rules' && (
            <div>
              {rulesList.length === 0 ? (
                <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '32px 0', fontSize: '.88rem' }}>
                  No rules defined yet.<br />
                  <span style={{ fontSize: '.78rem' }}>Go to <strong>Playbook</strong> to add your trading rules.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 4 }}>
                  Mark each rule as <span style={{ color: 'var(--green)', fontWeight: 700 }}>Followed</span> or <span style={{ color: 'var(--red)', fontWeight: 700 }}>Broke</span> for this trade. Skip any that do not apply.
                  </div>
                  {rulesList.map((rule, idx) => {
                    const val = ruleAdherence[rule.id]; // true | false | undefined
                    const toggle = (v) => setRuleAdherence(prev => {
                      const next = { ...prev };
                      if (next[rule.id] === v) delete next[rule.id]; // deselect
                      else next[rule.id] = v;
                      return next;
                    });
                    return (
                      <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                        <div style={{ width: 20, fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</div>
                        <div style={{ flex: 1, fontSize: '.85rem' }}>{rule.text}</div>
                        <button
                          onClick={() => toggle(true)}
                          style={{
                            padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
                            fontWeight: 600, fontSize: '.78rem', transition: 'all .15s',
                            background: val === true  ? 'rgba(34,197,94,.2)' : 'var(--bg)',
                            color:      val === true  ? 'var(--green)' : 'var(--muted)',
                            borderColor:val === true  ? 'var(--green)' : 'var(--border)',
                          }}
                        >✓ Followed</button>
                        <button
                          onClick={() => toggle(false)}
                          style={{
                            padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
                            fontWeight: 600, fontSize: '.78rem', transition: 'all .15s',
                            background: val === false ? 'rgba(239,68,68,.15)' : 'var(--bg)',
                            color:      val === false ? 'var(--red)' : 'var(--muted)',
                            borderColor:val === false ? 'var(--red)' : 'var(--border)',
                          }}
                        >✗ Broke</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="form-actions">
            <button className="btn-sec"  onClick={onClose}>Cancel</button>
            <button className="btn-save" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Update Trade' : 'Save Trade'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

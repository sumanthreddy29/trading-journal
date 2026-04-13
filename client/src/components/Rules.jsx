import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../api.js';
import { fMoney, r2 } from '../utils/helpers.js';

// ── Adherence stats computed from trades + trade_rules ──
function computeRuleStats(rules, trades, tradeRulesMap) {
  return rules.map(rule => {
    const relevant = [];
    trades.forEach(t => {
      const trs = tradeRulesMap[t.id];
      if (!trs) return;
      const entry = trs.find(r => r.rule_id === rule.id);
      if (entry !== undefined) relevant.push({ ...t, followed: entry.followed });
    });

    const followed = relevant.filter(t => t.followed);
    const broke    = relevant.filter(t => !t.followed);

    const avgPnl = arr =>
      arr.length ? r2(arr.reduce((s, t) => s + t.total_gl, 0) / arr.length) : null;

    return {
      ...rule,
      total:       relevant.length,
      followedN:   followed.length,
      brokeN:      broke.length,
      followedPnl: avgPnl(followed),
      brokePnl:    avgPnl(broke),
    };
  });
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

export default function Rules({ trades, onToast }) {
  const [rules,         setRules]         = useState([]);
  const [tradeRulesMap, setTradeRulesMap] = useState({}); // { tradeId: [{rule_id, followed}] }
  const [loading,       setLoading]       = useState(true);
  const [newText,       setNewText]       = useState('');
  const [editId,        setEditId]        = useState(null);
  const [editText,      setEditText]      = useState('');
  const [saving,        setSaving]        = useState(false);

  // Load rules
  const loadRules = useCallback(async () => {
    const r = await API.get('/api/rules');
    if (r) setRules(r);
  }, []);

  // Load rule adherence for all trades that have any
  const loadTradeRules = useCallback(async (tradeList) => {
    if (!tradeList.length) return;
    // Fetch in parallel for all trades (batch of 20 at a time to avoid flooding)
    const results = {};
    const chunks = [];
    for (let i = 0; i < tradeList.length; i += 20) chunks.push(tradeList.slice(i, i + 20));
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async t => {
        const r = await API.get(`/api/trades/${t.id}/rules`);
        if (r && r.length) results[t.id] = r;
      }));
    }
    setTradeRulesMap(results);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadRules();
      await loadTradeRules(trades);
      setLoading(false);
    })();
  }, [loadRules, loadTradeRules, trades]);

  // Add rule
  async function addRule() {
    if (!newText.trim() || saving) return;
    setSaving(true);
    const r = await API.post('/api/rules', { text: newText.trim() });
    if (r?.id) {
      setRules(prev => [...prev, r]);
      setNewText('');
      onToast('Rule added', 'ok');
    } else {
      onToast('Could not add rule', 'err');
    }
    setSaving(false);
  }

  // Save edit
  async function saveEdit(id) {
    if (!editText.trim() || saving) return;
    setSaving(true);
    const r = await API.put('/api/rules/' + id, { text: editText.trim() });
    if (r?.id) {
      setRules(prev => prev.map(rule => rule.id === id ? r : rule));
      setEditId(null);
      onToast('Rule updated', 'ok');
    } else {
      onToast('Could not update rule', 'err');
    }
    setSaving(false);
  }

  // Delete rule
  async function deleteRule(id) {
    if (!confirm('Delete this rule? It will be removed from all trades.')) return;
    const r = await API.del('/api/rules/' + id);
    if (r?.success) {
      setRules(prev => prev.filter(rule => rule.id !== id));
      onToast('Rule deleted', 'ok');
    } else {
      onToast('Could not delete rule', 'err');
    }
  }

  // Move rule up/down
  async function moveRule(idx, dir) {
    const newRules = [...rules];
    const target   = idx + dir;
    if (target < 0 || target >= newRules.length) return;
    [newRules[idx], newRules[target]] = [newRules[target], newRules[idx]];
    setRules(newRules);
    await API.post('/api/rules/reorder', { ids: newRules.map(r => r.id) });
  }

  const ruleStats = computeRuleStats(rules, trades, tradeRulesMap);
  const hasAdherence = Object.keys(tradeRulesMap).length > 0;

  const btnStyle = (active) => ({
    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: active ? 'var(--blue)' : 'var(--bg)',
    color: active ? '#fff' : 'var(--muted)',
    cursor: 'pointer', fontSize: '.78rem',
  });

  if (loading) {
    return (
      <div>
        <div className="page-header"><div><div className="page-title">Playbook</div></div></div>
        <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Playbook</div>
          <div className="page-sub">Your trading rules — track adherence on every trade</div>
        </div>
      </div>

      {/* ── Add rule ── */}
      <div className="chart-card" style={{ marginBottom: 14 }}>
        <div className="chart-hdr">
          <div className="chart-dot" style={{ background: 'var(--blue)' }} />
          <div className="chart-title">My Trading Rules</div>
        </div>

        {rules.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: '.85rem', marginBottom: 14 }}>
            No rules yet. Add your first trading rule below — e.g. "Only trade after 9:45 AM", "Never average down".
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {rules.map((rule, idx) => (
            <div
              key={rule.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px',
              }}
            >
              {/* Order arrows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button onClick={() => moveRule(idx, -1)} disabled={idx === 0}
                  style={{ ...btnStyle(false), padding: '1px 6px', opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                <button onClick={() => moveRule(idx, 1)} disabled={idx === rules.length - 1}
                  style={{ ...btnStyle(false), padding: '1px 6px', opacity: idx === rules.length - 1 ? 0.3 : 1 }}>▼</button>
              </div>

              {/* Rule number */}
              <div style={{ width: 22, fontSize: '.75rem', color: 'var(--muted)', fontWeight: 700, textAlign: 'center' }}>{idx + 1}</div>

              {/* Text / Edit input */}
              {editId === rule.id ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(rule.id); if (e.key === 'Escape') setEditId(null); }}
                  style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--blue)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: '.88rem' }}
                />
              ) : (
                <div style={{ flex: 1, fontSize: '.88rem' }}>{rule.text}</div>
              )}

              {/* Actions */}
              {editId === rule.id ? (
                <>
                  <button onClick={() => saveEdit(rule.id)} style={{ ...btnStyle(true), background: 'var(--green)', borderColor: 'var(--green)' }}>Save</button>
                  <button onClick={() => setEditId(null)} style={btnStyle(false)}>Cancel</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditId(rule.id); setEditText(rule.text); }} style={btnStyle(false)}>Edit</button>
                  <button onClick={() => deleteRule(rule.id)} style={{ ...btnStyle(false), color: 'var(--red)' }}>Delete</button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Add a new rule…"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRule()}
            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: '.88rem' }}
          />
          <button
            className="btn-save"
            onClick={addRule}
            disabled={!newText.trim() || saving}
            style={{ opacity: newText.trim() ? 1 : 0.4 }}
          >
            ＋ Add Rule
          </button>
        </div>
      </div>

      {/* ── Adherence stats ── */}
      {rules.length > 0 && (
        <div className="chart-card" style={{ marginBottom: 0 }}>
          <div className="chart-hdr">
            <div className="chart-dot" style={{ background: 'var(--orange)' }} />
            <div className="chart-title">Rule Adherence &amp; Impact</div>
          </div>

          {!hasAdherence ? (
            <div style={{ color: 'var(--muted)', fontSize: '.85rem', padding: '8px 0' }}>
              No adherence data yet. When adding or editing a trade, open the <strong>Rules</strong> tab to mark which rules you followed or broke.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <th style={{ textAlign: 'left', paddingBottom: 8 }}>#</th>
                    <th style={{ textAlign: 'left', paddingBottom: 8 }}>Rule</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Logged</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>✓ Followed</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>✗ Broke</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Adhere %</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Avg P&L (followed)</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Avg P&L (broke)</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleStats.map((r, idx) => {
                    const adherePct = r.total ? Math.round(r.followedN / r.total * 100) : null;
                    const impact    = r.followedPnl !== null && r.brokePnl !== null
                      ? r2(r.followedPnl - r.brokePnl)
                      : null;
                    return (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 0', color: 'var(--muted)', fontSize: '.75rem' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 12px 10px 0', maxWidth: 260 }}>
                          <div style={{ fontWeight: 500 }}>{r.text}</div>
                          {impact !== null && (
                            <div style={{ fontSize: '.72rem', color: impact >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>
                              {impact >= 0 ? '↑' : '↓'} {fMoney(Math.abs(impact))} avg P&L impact when followed vs broke
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{r.total || '—'}</td>
                        <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{r.followedN || '—'}</td>
                        <td style={{ textAlign: 'right', color: r.brokeN ? 'var(--red)' : 'var(--muted)', fontWeight: r.brokeN ? 600 : 400 }}>{r.brokeN || '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {adherePct !== null ? (
                            <span style={{ color: adherePct >= 70 ? 'var(--green)' : adherePct >= 40 ? 'var(--orange)' : 'var(--red)', fontWeight: 700 }}>
                              {adherePct}%
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: r.followedPnl !== null ? (r.followedPnl >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--muted)', fontWeight: 600 }}>
                          {r.followedPnl !== null ? fMoney(r.followedPnl, true) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: r.brokePnl !== null ? (r.brokePnl >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--muted)', fontWeight: 600 }}>
                          {r.brokePnl !== null ? fMoney(r.brokePnl, true) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

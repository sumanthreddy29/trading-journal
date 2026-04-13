import React, { useState, useEffect, useCallback } from 'react';
import { API, setApiToken } from './api.js';
import { computeStats } from './utils/stats.js';
import Auth       from './components/Auth.jsx';
import Sidebar    from './components/Sidebar.jsx';
import MobileNav  from './components/MobileNav.jsx';
import Dashboard  from './components/Dashboard.jsx';
import Journal    from './components/Journal.jsx';
import TradeForm  from './components/TradeForm.jsx';
import DayModal   from './components/DayModal.jsx';
import Export     from './components/Export.jsx';
import Analytics  from './components/Analytics.jsx';
import Rules      from './components/Rules.jsx';
import Lightbox   from './components/Lightbox.jsx';
import Toast      from './components/Toast.jsx';
import Import     from './components/Import.jsx';

export default function App() {
  const [token,      setToken]      = useState(() => localStorage.getItem('tj_token') || '');
  const [username,   setUsername]   = useState(() => localStorage.getItem('tj_user')  || '');
  const [page,       setPage]       = useState('dashboard');
  const [allTrades,  setAllTrades]  = useState([]);
  const [data,       setData]       = useState(null);
  const [tradeForm,  setTradeForm]  = useState({ open: false, editId: null });
  const [dayDate,    setDayDate]    = useState(null);
  const [highlightId,setHighlightId] = useState(null);
  const [lightboxSrc,setLightboxSrc]= useState(null);
  const [toast,      setToast]      = useState({ msg: '', type: 'ok', visible: false });
  const [settings,   setSettings]   = useState({});
  const [withdrawals,setWithdrawals]= useState([]);
  const [goals,      setGoals]      = useState([]);

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  }, []);

  const login = useCallback((tok, user) => {
    setApiToken(tok);
    setToken(tok);
    setUsername(user);
    localStorage.setItem('tj_token', tok);
    localStorage.setItem('tj_user',  user);
    // Load data immediately after login
    API.get('/api/trades').then(trades => {
      if (!trades) return;
      setAllTrades(trades);
      setData(computeStats(trades));
    });
    API.get('/api/settings').then(s => { if (s) setSettings(s); });
    API.get('/api/withdrawals').then(w => { if (w) setWithdrawals(w); });
    API.get('/api/goals').then(g => { if (g) setGoals(g); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = useCallback(() => {
    setApiToken('');
    setToken('');
    setUsername('');
    setAllTrades([]);
    setData(null);
    localStorage.removeItem('tj_token');
    localStorage.removeItem('tj_user');
  }, []);

  const loadAndRender = useCallback(async () => {
    const [trades, s, w, g] = await Promise.all([
      API.get('/api/trades'),
      API.get('/api/settings'),
      API.get('/api/withdrawals'),
      API.get('/api/goals'),
    ]);
    if (!trades) return;
    setAllTrades(trades);
    setData(computeStats(trades));
    if (s) setSettings(s);
    if (w) setWithdrawals(w);
    if (g) setGoals(g);
  }, []);

  const handleSettingsChange = useCallback(async (key, value) => {
    await API.post('/api/settings', { key, value });
    setSettings(prev => ({ ...prev, [key]: String(value) }));
  }, []);

  // On mount: sync token to API module and load data if already logged in
  useEffect(() => {
    setApiToken(token);
    if (token) loadAndRender();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openAddTrade = useCallback(() => setTradeForm({ open: true, editId: null }), []);

  if (!token) {
    return <Auth onLogin={login} />;
  }

  return (
    <>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar
          page={page}
          username={username}
          onNav={setPage}
          onAddTrade={openAddTrade}
          onLogout={logout}
        />
        <main id="main">
          {page === 'dashboard' && (
            <Dashboard
              data={data}
              settings={settings}
              withdrawals={withdrawals}
              goals={goals}
              onGoalsChange={setGoals}
              onRefresh={loadAndRender}
              onDayClick={setDayDate}
              onSettingsChange={handleSettingsChange}
            />
          )}
          {page === 'journal' && (
            <Journal
              trades={allTrades}
              highlightId={highlightId}
              onHighlightClear={() => setHighlightId(null)}
              onAddTrade={openAddTrade}
              onEdit={id => setTradeForm({ open: true, editId: id })}
              onDelete={async id => {
                if (!confirm('Delete this trade? This cannot be undone.')) return;
                const res = await API.del('/api/trades/' + id);
                if (res?.success) { showToast('Trade deleted', 'ok'); await loadAndRender(); }
                else showToast('Could not delete trade', 'err');
              }}
              onLightbox={setLightboxSrc}
            />
          )}
          {page === 'export' && (
            <Export trades={allTrades} />
          )}
          {page === 'analytics' && (
            <Analytics trades={allTrades} data={data} />
          )}
          {page === 'rules' && (
            <Rules trades={allTrades} onToast={showToast} />
          )}
          {page === 'import' && (
            <Import
              onImported={loadAndRender}
              onToast={showToast}
            />
          )}
        </main>
        <MobileNav page={page} onNav={setPage} onAddTrade={openAddTrade} onLogout={logout} />
      </div>

      {tradeForm.open && (
        <TradeForm
          editId={tradeForm.editId}
          allTrades={allTrades}
          onClose={() => setTradeForm({ open: false, editId: null })}
          onSaved={async () => {
            setTradeForm({ open: false, editId: null });
            await loadAndRender();
          }}
          onToast={showToast}
        />
      )}

      {dayDate && (
        <DayModal
          date={dayDate}
          data={data}
          onClose={() => setDayDate(null)}
          onTradeClick={id => {
            setDayDate(null);
            setHighlightId(id);
            setPage('journal');
          }}
        />
      )}

      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      <Toast msg={toast.msg} type={toast.type} visible={toast.visible} />
    </>
  );
}

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
    const trades = await API.get('/api/trades');
    if (!trades) return;
    setAllTrades(trades);
    setData(computeStats(trades));
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
              onRefresh={loadAndRender}
              onDayClick={setDayDate}
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
            <Analytics trades={allTrades} />
          )}
          {page === 'rules' && (
            <Rules trades={allTrades} onToast={showToast} />
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

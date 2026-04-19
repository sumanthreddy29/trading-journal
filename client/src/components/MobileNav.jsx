import React, { useState } from 'react';

export default function MobileNav({ page, onNav, onAddTrade, onLogout }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const inDrawer = ['export', 'import', 'stocks', 'options', 'social'].includes(page);

  function navAndClose(p) {
    onNav(p);
    setDrawerOpen(false);
  }

  return (
    <>
      {/* Settings drawer (slides up above the nav bar) */}
      {drawerOpen && (
        <>
          <div className="mob-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="mob-drawer">
            <div className="mob-drawer-title">More</div>
            <div className="mob-drawer-grid">
              <button className={`mob-drawer-item${page === 'stocks' ? ' active' : ''}`} onClick={() => navAndClose('stocks')}>
                <span className="icon">🔭</span>Market
              </button>
              <button className={`mob-drawer-item${page === 'options' ? ' active' : ''}`} onClick={() => navAndClose('options')}>
                <span className="icon">⚡</span>Options
              </button>
              <button className={`mob-drawer-item${page === 'import' ? ' active' : ''}`} onClick={() => navAndClose('import')}>
                <span className="icon">📥</span>Import
              </button>
              <button className={`mob-drawer-item${page === 'social' ? ' active' : ''}`} onClick={() => navAndClose('social')}>
                <span className="icon">🐦</span>Social
              </button>
              <button className={`mob-drawer-item${page === 'export' ? ' active' : ''}`} onClick={() => navAndClose('export')}>
                <span className="icon">📤</span>Export
              </button>
              <button className="mob-drawer-item" onClick={() => { setDrawerOpen(false); onLogout(); }}>
                <span className="icon">⎋</span>Logout
              </button>
            </div>
          </div>
        </>
      )}

      <div id="mobile-nav">
        <button className={`mob-btn${page === 'dashboard' ? ' active' : ''}`} onClick={() => onNav('dashboard')}>
          <span className="icon">📊</span>Dashboard
        </button>
        <button className={`mob-btn${page === 'journal' ? ' active' : ''}`} onClick={() => onNav('journal')}>
          <span className="icon">📋</span>Journal
        </button>
        <button className="mob-btn add" onClick={onAddTrade}>
          <span className="icon">＋</span>Add
        </button>
        <button className={`mob-btn${page === 'analytics' ? ' active' : ''}`} onClick={() => onNav('analytics')}>
          <span className="icon">📈</span>Analytics
        </button>
        <button className={`mob-btn${page === 'rules' ? ' active' : ''}`} onClick={() => onNav('rules')}>
          <span className="icon">📏</span>Playbook
        </button>
        <button
          className={`mob-btn${drawerOpen || inDrawer ? ' active' : ''}`}
          onClick={() => setDrawerOpen(o => !o)}
        >
          <span className="icon">⚙️</span>More
        </button>
      </div>
    </>
  );
}

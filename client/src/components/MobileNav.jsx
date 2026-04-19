import React from 'react';

export default function MobileNav({ page, onNav, onAddTrade, onLogout }) {
  return (
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
      <button className={`mob-btn${page === 'export' ? ' active' : ''}`} onClick={() => onNav('export')}>
        <span className="icon">📤</span>Export
      </button>
      <button className={`mob-btn${page === 'import' ? ' active' : ''}`} onClick={() => onNav('import')}>
        <span className="icon">📥</span>Import
      </button>
      <button className={`mob-btn${page === 'stocks' ? ' active' : ''}`} onClick={() => onNav('stocks')}>
        <span className="icon">🔭</span>Market
      </button>
      <button className={`mob-btn${page === 'options' ? ' active' : ''}`} onClick={() => onNav('options')}>
        <span className="icon">⚡</span>Options
      </button>
      <button className="mob-btn" onClick={onLogout}>
        <span className="icon">⎋</span>Logout
      </button>
    </div>
  );
}

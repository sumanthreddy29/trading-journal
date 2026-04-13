import React from 'react';

export default function Sidebar({ page, username, onNav, onAddTrade, onLogout }) {
  return (
    <nav id="sidebar">
      <div className="brand">📈 <span>TJ</span></div>
      <button className={`nav-btn${page === 'dashboard' ? ' active' : ''}`} onClick={() => onNav('dashboard')}>
        📊 <span>Dashboard</span>
      </button>
      <button className={`nav-btn${page === 'journal' ? ' active' : ''}`} onClick={() => onNav('journal')}>
        📋 <span>Journal</span>
      </button>
      <button className={`nav-btn${page === 'analytics' ? ' active' : ''}`} onClick={() => onNav('analytics')}>
        📈 <span>Analytics</span>
      </button>
      <button className={`nav-btn${page === 'rules' ? ' active' : ''}`} onClick={() => onNav('rules')}>
        📏 <span>Playbook</span>
      </button>
      <button className={`nav-btn${page === 'export' ? ' active' : ''}`} onClick={() => onNav('export')}>
        📤 <span>Export</span>
      </button>
      <button className="nav-btn add-trade" onClick={onAddTrade}>＋ Add Trade</button>
      <div className="nav-spacer" />
      <div className="nav-user">👤 {username}</div>
      <button className="nav-logout" onClick={onLogout}>⎋ <span>Logout</span></button>
    </nav>
  );
}

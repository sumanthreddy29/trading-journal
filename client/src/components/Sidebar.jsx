import React from 'react';

export default function Sidebar({ page, username, onNav, onAddTrade, onLogout }) {
  return (
    <nav id="sidebar">
      <div className="brand">📈 <span className="nav-label">TJ</span></div>
      <button title="Dashboard" className={`nav-btn${page === 'dashboard' ? ' active' : ''}`} onClick={() => onNav('dashboard')}>
        📊 <span className="nav-label">Dashboard</span>
      </button>
      <button title="Journal" className={`nav-btn${page === 'journal' ? ' active' : ''}`} onClick={() => onNav('journal')}>
        📋 <span className="nav-label">Journal</span>
      </button>
      <button title="Analytics" className={`nav-btn${page === 'analytics' ? ' active' : ''}`} onClick={() => onNav('analytics')}>
        📈 <span className="nav-label">Analytics</span>
      </button>
      <button title="Playbook" className={`nav-btn${page === 'rules' ? ' active' : ''}`} onClick={() => onNav('rules')}>
        📏 <span className="nav-label">Playbook</span>
      </button>
      <button title="Export" className={`nav-btn${page === 'export' ? ' active' : ''}`} onClick={() => onNav('export')}>
        📤 <span className="nav-label">Export</span>
      </button>
      <button title="Import CSV" className={`nav-btn${page === 'import' ? ' active' : ''}`} onClick={() => onNav('import')}>
        📥 <span className="nav-label">Import CSV</span>
      </button>
      <button title="Market Watch" className={`nav-btn${page === 'stocks' ? ' active' : ''}`} onClick={() => onNav('stocks')}>
        🔭 <span className="nav-label">Market Watch</span>
      </button>
      <button title="Options Flow" className={`nav-btn${page === 'options' ? ' active' : ''}`} onClick={() => onNav('options')}>
        ⚡ <span className="nav-label">Options Flow</span>
      </button>
      <button title="Add Trade" className="nav-btn add-trade" onClick={onAddTrade}>＋ <span className="nav-label">Add Trade</span></button>
      <div className="nav-spacer" />
      <div className="nav-user">👤 <span className="nav-label">{username}</span></div>
      <button title="Logout" className="nav-logout" onClick={onLogout}>⎋ <span className="nav-label">Logout</span></button>
    </nav>
  );
}

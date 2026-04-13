import React, { useState } from 'react';
import { API } from '../api.js';

export default function Auth({ onLogin }) {
  const [tab,       setTab]       = useState('login');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regUser,   setRegUser]   = useState('');
  const [regEmail,  setRegEmail]  = useState('');
  const [regPass,   setRegPass]   = useState('');
  const [error,     setError]     = useState('');

  function switchTab(t) { setTab(t); setError(''); }

  async function doLogin() {
    if (!loginUser || !loginPass) { setError('Enter username and password'); return; }
    const res = await API.post('/api/login', { username: loginUser, password: loginPass });
    if (res?.token) onLogin(res.token, res.username);
    else setError(res?.error || 'Login failed');
  }

  async function doRegister() {
    if (!regUser || !regPass) { setError('Username and password required'); return; }
    const res = await API.post('/api/register', { username: regUser, email: regEmail, password: regPass });
    if (res?.token) onLogin(res.token, res.username);
    else setError(res?.error || 'Registration failed');
  }

  return (
    <div id="auth-view">
      <div className="auth-card">
        <div className="auth-logo">📈</div>
        <div className="auth-title">Trading Journal</div>
        <div className="auth-sub">Track every trade. Learn from every move.</div>

        <div className="auth-tabs">
          <div className={`auth-tab${tab === 'login'    ? ' active' : ''}`} onClick={() => switchTab('login')}>Sign In</div>
          <div className={`auth-tab${tab === 'register' ? ' active' : ''}`} onClick={() => switchTab('register')}>Register</div>
        </div>

        {tab === 'login' ? (
          <>
            <div className="field">
              <label>Username</label>
              <input type="text" value={loginUser} onChange={e => setLoginUser(e.target.value)}
                placeholder="your username" autoComplete="username"
                onKeyDown={e => e.key === 'Enter' && doLogin()} />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                placeholder="••••••••" autoComplete="current-password"
                onKeyDown={e => e.key === 'Enter' && doLogin()} />
            </div>
            <button className="btn-primary" onClick={doLogin}>Sign In</button>
          </>
        ) : (
          <>
            <div className="field">
              <label>Username</label>
              <input type="text" value={regUser} onChange={e => setRegUser(e.target.value)} placeholder="choose a username" />
            </div>
            <div className="field">
              <label>Email <span style={{ color: 'var(--muted)' }}>(optional)</span></label>
              <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={regPass} onChange={e => setRegPass(e.target.value)}
                placeholder="at least 6 characters"
                onKeyDown={e => e.key === 'Enter' && doRegister()} />
            </div>
            <button className="btn-primary" onClick={doRegister}>Create Account</button>
          </>
        )}

        <div className="auth-err">{error}</div>
      </div>
    </div>
  );
}

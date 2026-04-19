import React, { useState, useEffect, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// ── Sub-components ────────────────────────────────
function SentimentBar({ messages }) {
  const bull  = messages.filter(m => m.entities?.sentiment?.basic === 'Bullish').length;
  const bear  = messages.filter(m => m.entities?.sentiment?.basic === 'Bearish').length;
  const total = bull + bear;
  if (!total) return <p className="sb-muted sb-no-sentiment">No sentiment tags in this batch</p>;
  const bullPct = Math.round((bull / total) * 100);
  return (
    <div className="sb-sentiment-wrap">
      <div className="sb-sentiment-bar">
        <div className="sb-bull-bar" style={{ width: `${bullPct}%` }} />
        <div className="sb-bear-bar" style={{ width: `${100 - bullPct}%` }} />
      </div>
      <div className="sb-sentiment-labels">
        <span className="sb-bull">🐂 {bull} Bullish ({bullPct}%)</span>
        <span className="sb-bear">🐻 {bear} Bearish ({100 - bullPct}%)</span>
      </div>
    </div>
  );
}

function MessageCard({ msg }) {
  const sentiment = msg.entities?.sentiment?.basic;
  return (
    <div className="sb-msg-card">
      <div className="sb-msg-header">
        <span className="sb-username">@{msg.user?.username}</span>
        {sentiment && (
          <span className={`sb-sentiment-pill ${sentiment === 'Bullish' ? 'bull' : 'bear'}`}>
            {sentiment === 'Bullish' ? '🐂' : '🐻'} {sentiment}
          </span>
        )}
        <span className="sb-muted sb-time">{timeAgo(msg.created_at)}</span>
        {msg.likes?.total > 0 && <span className="sb-likes">❤️ {msg.likes.total}</span>}
      </div>
      <p className="sb-msg-body">{msg.body}</p>
    </div>
  );
}

function RedditCard({ post }) {
  const d = post.data;
  const tickers = [...new Set((d.title.match(/\$([A-Z]{1,5})/g) || []).map(t => t.slice(1)))];
  return (
    <div
      className="sb-reddit-card"
      onClick={() => window.open(`https://reddit.com${d.permalink}`, '_blank', 'noopener noreferrer')}
      role="link"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && window.open(`https://reddit.com${d.permalink}`, '_blank', 'noopener noreferrer')}
    >
      {d.link_flair_text && <div className="sb-reddit-flair">{d.link_flair_text}</div>}
      <p className="sb-reddit-title">{d.title}</p>
      {tickers.length > 0 && (
        <div className="sb-reddit-tickers">
          {tickers.map(t => <span key={t} className="sb-ticker-pill">${t}</span>)}
        </div>
      )}
      <div className="sb-reddit-meta">
        <span>⬆️ {fmtNum(d.score)}</span>
        <span>💬 {fmtNum(d.num_comments)}</span>
        <span className="sb-muted">u/{d.author}</span>
        <span className="sb-muted">{timeAgo(new Date(d.created_utc * 1000).toISOString())}</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────
export default function SocialBuzz() {
  const [activeTab,      setActiveTab]      = useState('trending');
  const [trending,       setTrending]       = useState([]);
  const [reddit,         setReddit]         = useState([]);
  const [selected,       setSelected]       = useState(null);
  const [stream,         setStream]         = useState(null);
  const [loadingTrend,   setLoadingTrend]   = useState(true);
  const [loadingReddit,  setLoadingReddit]  = useState(true);
  const [loadingStream,  setLoadingStream]  = useState(false);
  const [error,          setError]          = useState(null);

  const loadTrending = useCallback(async () => {
    setLoadingTrend(true);
    setError(null);
    try {
      const r    = await fetch('/api/social/trending');
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      const symbols = data.symbols || [];
      setTrending(symbols);
      if (symbols.length && !selected) setSelected(symbols[0]);
    } catch (e) {
      setError('Trending data: ' + e.message);
    } finally {
      setLoadingTrend(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadReddit = useCallback(async () => {
    setLoadingReddit(true);
    try {
      const r    = await fetch('/api/social/reddit');
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setReddit(data.data?.children || []);
    } catch {
      // Reddit is non-fatal
    } finally {
      setLoadingReddit(false);
    }
  }, []);

  useEffect(() => {
    loadTrending();
    loadReddit();
  }, [loadTrending, loadReddit]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    async function fetchStream() {
      setLoadingStream(true);
      setStream(null);
      try {
        const r    = await fetch(`/api/social/stream/${selected.symbol}`);
        const data = await r.json();
        if (!cancelled) setStream(data);
      } catch {
        if (!cancelled) setStream({ messages: [], _unavailable: true });
      } finally {
        if (!cancelled) setLoadingStream(false);
      }
    }
    fetchStream();
    return () => { cancelled = true; };
  }, [selected]);

  function refresh() { loadTrending(); loadReddit(); }

  return (
    <div className="sb-page">
      {/* Header */}
      <div className="sb-header">
        <div>
          <h1>🐦 Social Buzz</h1>
          <p className="sb-subtitle">Yahoo Finance trending · Reddit r/wallstreetbets · Retail sentiment</p>
        </div>
        <button className="sb-refresh-btn" onClick={refresh}>⟳ Refresh</button>
      </div>

      {error && <div className="sb-error">⚠️ {error}</div>}

      {/* Tabs */}
      <div className="sb-tabs">
        <button
          className={`sb-tab${activeTab === 'trending' ? ' active' : ''}`}
          onClick={() => setActiveTab('trending')}
        >
          📊 Trending Tickers {trending.length > 0 && `(${trending.length})`}
        </button>
        <button
          className={`sb-tab${activeTab === 'reddit' ? ' active' : ''}`}
          onClick={() => setActiveTab('reddit')}
        >
          🔴 WallStreetBets {reddit.length > 0 && `(${reddit.length})`}
        </button>
      </div>

      {/* ── TRENDING TAB ── */}
      {activeTab === 'trending' && (
        <div className="sb-trending-layout">
          {/* Left: ticker list */}
          <div className="sb-ticker-list">
            <div className="sb-list-title">🔥 Trending on StockTwits</div>
            {loadingTrend ? (
              <div className="sb-spinner-wrap"><div className="sb-spinner" /></div>
            ) : trending.length === 0 ? (
              <p className="sb-empty">No trending data available.</p>
            ) : trending.map((s, i) => (
              <button
                key={s.symbol}
                className={`sb-ticker-item${selected?.symbol === s.symbol ? ' active' : ''}`}
                onClick={() => setSelected(s)}
              >
                <span className="sb-rank">#{i + 1}</span>
                <div className="sb-ticker-info">
                  <span className="sb-ticker-sym">{s.symbol}</span>
                  <span className="sb-muted sb-ticker-name">
                    {s.title?.length > 22 ? s.title.slice(0, 22) + '…' : s.title}
                  </span>
                </div>
                {s.change != null && (
                  <span className={s.change >= 0 ? 'sb-bull' : 'sb-bear'} style={{fontSize:'.72rem',fontWeight:600}}>
                    {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right: message stream */}
          <div className="sb-stream-panel">
            {!selected && !loadingTrend && (
              <p className="sb-empty">Select a ticker to view its stream.</p>
            )}
            {selected && (
              <>
                <div className="sb-stream-header">
                  <h2>${selected.symbol}</h2>
                  <span className="sb-muted">{selected.title}</span>
                  <span className="sb-watchlist-badge">{fmtNum(selected.watchlist_count)} watching</span>
                </div>

                {stream?.messages?.length > 0 && <SentimentBar messages={stream.messages} />}

                {loadingStream ? (
                  <div className="sb-spinner-wrap"><div className="sb-spinner" /></div>
                ) : stream?._unavailable ? (
                  <p className="sb-empty sb-muted" style={{fontSize:'.8rem',padding:'1rem 0'}}>💬 StockTwits message stream is currently unavailable (rate-limited). Select a ticker to see its options flow via the Options page.</p>
                ) : stream?.messages?.length ? (
                  <div className="sb-messages">
                    {stream.messages.map(m => <MessageCard key={m.id} msg={m} />)}
                  </div>
                ) : (
                  !loadingStream && stream && <p className="sb-empty">No messages found for ${selected.symbol}.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── WALLSTREETBETS TAB ── */}
      {activeTab === 'reddit' && (
        <div className="sb-reddit-section">
          {loadingReddit ? (
            <div className="sb-spinner-wrap"><div className="sb-spinner" /></div>
          ) : reddit.length ? (
            <div className="sb-reddit-grid">
              {reddit.filter(p => !p.data.stickied).map((p, i) => (
                <RedditCard key={i} post={p} />
              ))}
            </div>
          ) : (
            <p className="sb-empty">Couldn't load Reddit posts right now.</p>
          )}
        </div>
      )}
    </div>
  );
}

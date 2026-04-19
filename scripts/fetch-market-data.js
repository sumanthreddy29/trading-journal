// ═══════════════════════════════════════════════════
//  Daily Market Data Fetcher  — fully dynamic
//  Uses yahoo-finance2 (free, no API key needed).
//
//  Fields fetched live per ticker:
//    price, ytd, target, pe, mcap, w52, rating
//    name, sector, revGrowth, thesis, catalysts
//
//  Usage:
//    node scripts/fetch-market-data.js        ← one-off manual run
//    require('./scripts/fetch-market-data')   ← called by server cron
// ═══════════════════════════════════════════════════
'use strict';

const { default: YahooFinanceClass } = require('yahoo-finance2');
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

const YF_OPTS = { validateResult: false };
const delay   = ms => new Promise(r => setTimeout(r, ms));

const RATING_MAP = {
  strongBuy:  'Strong Buy',
  buy:        'Buy',
  hold:       'Hold',
  sell:       'Sell',
  strongSell: 'Strong Sell',
};

// Clean up Yahoo industry strings like "Software—Infrastructure" → "Software"
function cleanIndustry(str) {
  if (!str) return null;
  return str.replace(/[—–-].*/g, '').replace(/[^a-zA-Z0-9 /&]/g, '').trim();
}

// Format revenue growth float → "+23% YoY"
function fmtRevGrowth(raw) {
  if (raw == null) return null;
  const pct = (raw * 100).toFixed(0);
  return `${pct >= 0 ? '+' : ''}${pct}% YoY`;
}

// Build thesis string from Yahoo data — factual + metric highlights
function buildThesis(q, s) {
  const profile    = s?.assetProfile;
  const financial  = s?.financialData;
  const stats      = s?.defaultKeyStatistics;
  if (!profile?.longBusinessSummary) return null;

  // Trim business summary to ≤280 chars at a sentence boundary
  let summary = profile.longBusinessSummary;
  if (summary.length > 280) {
    const cut = summary.lastIndexOf('.', 280);
    summary = cut > 60 ? summary.slice(0, cut + 1) : summary.slice(0, 277) + '…';
  }

  // Metric highlights with bold markers
  const highlights = [];
  if (financial?.revenueGrowth != null) {
    const pct = (financial.revenueGrowth * 100).toFixed(0);
    highlights.push(`Revenue <strong>${pct >= 0 ? '+' : ''}${pct}% YoY</strong>`);
  }
  if (financial?.grossMargins != null) {
    highlights.push(`Gross margin <strong>${(financial.grossMargins * 100).toFixed(0)}%</strong>`);
  }
  if (financial?.operatingMargins != null && financial.operatingMargins > 0) {
    highlights.push(`Operating margin <strong>${(financial.operatingMargins * 100).toFixed(0)}%</strong>`);
  }
  if (financial?.returnOnEquity != null && financial.returnOnEquity > 0) {
    highlights.push(`ROE <strong>${(financial.returnOnEquity * 100).toFixed(0)}%</strong>`);
  }

  const metricLine = highlights.length ? ' ' + highlights.join(' · ') + '.' : '';
  return summary + metricLine;
}

// Build catalysts string from earnings dates + recent analyst actions
function buildCatalysts(s) {
  const parts = [];

  // Upcoming earnings date
  const earningsDates = s?.calendarEvents?.earnings?.earningsDate;
  if (Array.isArray(earningsDates) && earningsDates.length) {
    const next = new Date(earningsDates[0]);
    if (next > new Date()) {
      parts.push(`Earnings ${next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
    }
  }

  // Recent analyst actions (last 3)
  const history = s?.upgradeDowngradeHistory?.history ?? [];
  const actionMap = { up: 'upgrade', down: 'downgrade', main: 'maintained', init: 'initiated', reit: 'reiterated' };
  history.slice(0, 3).forEach(h => {
    const firm   = (h.firm || 'Analyst').replace(/\s+LLC.*|,.*/, '').trim().slice(0, 20);
    const action = actionMap[h.action] ?? h.action ?? 'maintained';
    parts.push(`${firm} ${action}`);
  });

  return parts.length ? parts.join(' · ') : null;
}

// ── Fetch S&P 500, VIX, 10-yr Treasury ───────────
async function fetchMarketSnapshot() {
  const [spRes, vixRes, ustRes] = await Promise.allSettled([
    yahooFinance.quote('^GSPC', {}, YF_OPTS),
    yahooFinance.quote('^VIX',  {}, YF_OPTS),
    yahooFinance.quote('^TNX',  {}, YF_OPTS),
  ]);

  const sp  = spRes.status  === 'fulfilled' ? spRes.value  : null;
  const vix = vixRes.status === 'fulfilled' ? vixRes.value : null;
  const ust = ustRes.status === 'fulfilled' ? ustRes.value : null;

  let weekChange = null;
  if (sp) {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const hist = await yahooFinance.historical('^GSPC', {
        period1: weekAgo, period2: new Date(), interval: '1d',
      }, YF_OPTS);
      if (hist.length >= 2) {
        weekChange = +((hist[hist.length - 1].close - hist[0].close) / hist[0].close * 100).toFixed(1);
      }
    } catch { /* non-fatal */ }
  }

  const sp500  = sp  ? Math.round(sp.regularMarketPrice)          : null;
  const vixVal = vix ? +vix.regularMarketPrice.toFixed(1)         : null;
  const ustVal = ust ? +ust.regularMarketPrice.toFixed(2)         : null;
  const today  = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    sp500,
    sp500WeekChange: weekChange,
    vix:    vixVal,
    ust10y: ustVal,
    note:   sp500
      ? `S&P 500 at ${sp500.toLocaleString()}${weekChange !== null ? ` (${weekChange >= 0 ? '+' : ''}${weekChange}% wk)` : ''} · VIX ${vixVal ?? '—'} · Updated ${today}.`
      : `Market snapshot unavailable. Updated ${today}.`,
  };
}

// ── Fetch ALL live data for a single ticker ────────
async function fetchLiveQuote(ticker) {
  const [quoteRes, summaryRes] = await Promise.allSettled([
    yahooFinance.quote(ticker, {}, YF_OPTS),
    yahooFinance.quoteSummary(ticker, {
      modules: [
        'financialData',
        'assetProfile',
        'defaultKeyStatistics',
        'calendarEvents',
        'upgradeDowngradeHistory',
      ],
    }, YF_OPTS),
  ]);

  const q = quoteRes.status   === 'fulfilled' ? quoteRes.value   : null;
  const s = summaryRes.status === 'fulfilled' ? summaryRes.value : null;

  if (!q || !q.regularMarketPrice) return null;

  // YTD vs first trading day of the year
  let ytd = null;
  try {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd   = new Date(new Date().getFullYear(), 0, 10);
    const hist = await yahooFinance.historical(
      ticker, { period1: yearStart, period2: yearEnd, interval: '1d' }, YF_OPTS
    );
    if (hist?.length > 0) {
      ytd = +((q.regularMarketPrice - hist[0].close) / hist[0].close * 100).toFixed(1);
    }
  } catch { /* non-fatal */ }

  // ── Derived fields ─────────────────────────────
  const profile   = s?.assetProfile;
  const financial = s?.financialData;

  const name    = q.longName || q.shortName || ticker;
  const rawSec  = profile?.sector || null;
  const rawInd  = cleanIndustry(profile?.industry);
  const sector  = rawSec && rawInd ? `${rawSec} / ${rawInd}` : (rawSec ?? rawInd ?? null);

  const revGrowth = fmtRevGrowth(financial?.revenueGrowth ?? null);
  const thesis    = buildThesis(q, s);
  const catalysts = buildCatalysts(s);

  return {
    // price data
    price:  +q.regularMarketPrice.toFixed(2),
    ytd,
    target: financial?.targetMeanPrice  ? +financial.targetMeanPrice.toFixed(2)  : null,
    pe:     q.trailingPE                ? +q.trailingPE.toFixed(1)               : null,
    mcap:   q.marketCap                 ? Math.round(q.marketCap / 1e9)          : null,
    w52:    q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh
              ? `${q.fiftyTwoWeekLow.toFixed(2)} \u2013 ${q.fiftyTwoWeekHigh.toFixed(2)}`
              : null,
    rating: RATING_MAP[financial?.recommendationKey] ?? null,
    // dynamic editorial
    name,
    sector,
    revGrowth,
    thesis,
    catalysts,
  };
}

// ── Main: build fresh dashboard data ──────────────
async function buildDashboardData(baseData, prevCachedData) {
  console.log('📡  Fetching market snapshot…');
  const snapshot = await fetchMarketSnapshot().catch(err => {
    console.warn('  ⚠  Market snapshot failed:', err.message);
    return baseData.meta?.marketSnapshot ?? {};
  });

  console.log(`📈  Refreshing ${baseData.stocks.length} tickers (350ms delay between calls)…`);
  const updatedStocks = [];
  const changes = [];

  for (const stock of baseData.stocks) {
    try {
      const live = await fetchLiveQuote(stock.ticker);
      if (live) {
        const merged = {
          ...stock,
          // price / valuation — always overwrite with live data
          price:     live.price   ?? stock.price,
          ytd:       live.ytd     ?? stock.ytd,
          target:    live.target  ?? stock.target,
          pe:        live.pe      ?? stock.pe,
          mcap:      live.mcap    ?? stock.mcap,
          w52:       live.w52     ?? stock.w52,
          rating:    live.rating  ?? stock.rating,
          // descriptive — overwrite with live; fall back to static if Yahoo returns null
          name:      live.name      ?? stock.name,
          sector:    live.sector    ?? stock.sector,
          revGrowth: live.revGrowth ?? stock.revGrowth,
          thesis:    live.thesis    ?? stock.thesis,
          catalysts: live.catalysts ?? stock.catalysts,
        };
        updatedStocks.push(merged);

        // Changelog: track moves ≥ 2% vs previous cached price
        const prevPrice = prevCachedData?.stocks?.find(s => s.ticker === stock.ticker)?.price;
        if (prevPrice && live.price) {
          const chg = (live.price - prevPrice) / prevPrice * 100;
          if (Math.abs(chg) >= 2) {
            changes.push(`${stock.ticker} ${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`);
          }
        }
        process.stdout.write(`  ✓ ${stock.ticker}: $${live.price}  ${live.sector ?? ''}\n`);
      } else {
        updatedStocks.push(stock);
        process.stdout.write(`  ⚠ ${stock.ticker}: API unavailable — kept previous data\n`);
      }
    } catch (err) {
      updatedStocks.push(stock);
      console.warn(`  ✗ ${stock.ticker}: ${err.message}`);
    }
    await delay(350);
  }

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const summary = prevCachedData
    ? (changes.length > 0
        ? `Prices refreshed. Notable moves: ${changes.slice(0, 6).join(' · ')}.`
        : `Daily refresh complete — ${updatedStocks.length} names updated, no major moves.`)
    : `Initial cache populated — ${updatedStocks.length} names loaded.`;

  const prevHistory = (prevCachedData ?? baseData).meta?.runHistory ?? [];
  const runHistory  = [{ date: dateStr, summary }, ...prevHistory].slice(0, 10);

  return {
    meta: {
      lastUpdated: new Date().toISOString(),
      marketSnapshot: snapshot,
      runHistory,
      version: ((prevCachedData ?? baseData).meta?.version ?? 1) + 1,
    },
    stocks: updatedStocks,
  };
}

module.exports = { buildDashboardData };

// ── Standalone run: node scripts/fetch-market-data.js ─
if (require.main === module) {
  const path = require('path');
  const fs   = require('fs');

  const BASE_PATH = path.join(__dirname, '..', 'dashboard-data.json');
  const baseData  = JSON.parse(fs.readFileSync(BASE_PATH, 'utf8'));

  buildDashboardData(baseData, baseData)
    .then(data => {
      const json = JSON.stringify(data, null, 2);
      fs.writeFileSync(BASE_PATH, json);
      fs.writeFileSync(
        path.join(__dirname, '..', 'dashboard-data.js'),
        `// Auto-generated. Daily scheduled task refreshes this file.\nwindow.DASHBOARD_DATA = ${json};\n`
      );
      console.log('\n✅  dashboard-data.json and dashboard-data.js updated successfully.');
    })
    .catch(err => {
      console.error('❌  Fetch failed:', err.message);
      process.exit(1);
    });
}

// ── Fetch S&P 500, VIX, 10-yr Treasury ───────────
async function fetchMarketSnapshot() {
  const [spRes, vixRes, ustRes] = await Promise.allSettled([
    yahooFinance.quote('^GSPC', {}, YF_OPTS),
    yahooFinance.quote('^VIX',  {}, YF_OPTS),
    yahooFinance.quote('^TNX',  {}, YF_OPTS),
  ]);

  const sp  = spRes.status  === 'fulfilled' ? spRes.value  : null;
  const vix = vixRes.status === 'fulfilled' ? vixRes.value : null;
  const ust = ustRes.status === 'fulfilled' ? ustRes.value : null;

  // Weekly S&P change via 7-day historical
  let weekChange = null;
  if (sp) {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const hist = await yahooFinance.historical('^GSPC', {
        period1: weekAgo, period2: new Date(), interval: '1d',
      }, YF_OPTS);
      if (hist.length >= 2) {
        weekChange = +((hist[hist.length - 1].close - hist[0].close) / hist[0].close * 100).toFixed(1);
      }
    } catch { /* non-fatal */ }
  }

  const sp500 = sp ? Math.round(sp.regularMarketPrice) : null;
  const vixVal = vix ? +vix.regularMarketPrice.toFixed(1) : null;
  const ustVal = ust ? +ust.regularMarketPrice.toFixed(2) : null;
  const today  = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    sp500,
    sp500WeekChange: weekChange,
    vix: vixVal,
    ust10y: ustVal,
    note: sp500
      ? `S&P 500 at ${sp500.toLocaleString()}${weekChange !== null ? ` (${weekChange >= 0 ? '+' : ''}${weekChange}% wk)` : ''} · VIX ${vixVal ?? '—'} · Updated ${today}.`
      : `Market snapshot unavailable. Updated ${today}.`,
  };
}

// ── Fetch live data for a single ticker ───────────
async function fetchLiveQuote(ticker) {
  const [quoteRes, summaryRes] = await Promise.allSettled([
    yahooFinance.quote(ticker, {}, YF_OPTS),
    yahooFinance.quoteSummary(ticker, { modules: ['financialData'] }, YF_OPTS),
  ]);

  const q = quoteRes.status   === 'fulfilled' ? quoteRes.value   : null;
  const s = summaryRes.status === 'fulfilled' ? summaryRes.value : null;

  if (!q || !q.regularMarketPrice) return null;

  // YTD: compare current price to first trading day of the year
  let ytd = null;
  try {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd   = new Date(new Date().getFullYear(), 0, 10);
    const hist = await yahooFinance.historical(
      ticker, { period1: yearStart, period2: yearEnd, interval: '1d' }, YF_OPTS
    );
    if (hist?.length > 0) {
      ytd = +((q.regularMarketPrice - hist[0].close) / hist[0].close * 100).toFixed(1);
    }
  } catch { /* non-fatal — keep existing ytd */ }

  return {
    price:  +q.regularMarketPrice.toFixed(2),
    ytd,
    target: s?.financialData?.targetMeanPrice ? +s.financialData.targetMeanPrice.toFixed(2) : null,
    pe:     q.trailingPE ? +q.trailingPE.toFixed(1) : null,
    mcap:   q.marketCap  ? Math.round(q.marketCap / 1e9) : null,
    w52:    q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh
              ? `${q.fiftyTwoWeekLow.toFixed(2)} – ${q.fiftyTwoWeekHigh.toFixed(2)}`
              : null,
    rating: RATING_MAP[s?.financialData?.recommendationKey] ?? null,
  };
}

// ── Main: build fresh dashboard data ─────────────
/**
 * Fetches live prices and merges with static editorial data.
 *
 * @param {object} baseData      - dashboard-data.json (thesis, catalysts, static ratings)
 * @param {object} prevCachedData - Previously cached live data (for changelog comparison). Null on first run.
 * @returns {object} New dashboard-data payload ready to store.
 */
async function buildDashboardData(baseData, prevCachedData) {
  console.log('📡  Fetching market snapshot…');
  const snapshot = await fetchMarketSnapshot().catch(err => {
    console.warn('  ⚠  Market snapshot failed:', err.message);
    return baseData.meta?.marketSnapshot ?? {};
  });

  console.log(`📈  Refreshing ${baseData.stocks.length} tickers (300ms delay between calls)…`);
  const updatedStocks = [];
  const changes = [];

  for (const stock of baseData.stocks) {
    try {
      const live = await fetchLiveQuote(stock.ticker);
      if (live) {
        const merged = {
          ...stock,
          price:  live.price  ?? stock.price,
          ytd:    live.ytd    ?? stock.ytd,
          target: live.target ?? stock.target,
          pe:     live.pe     ?? stock.pe,
          mcap:   live.mcap   ?? stock.mcap,
          w52:    live.w52    ?? stock.w52,
          // Update analyst rating when Yahoo has one; fall back to static
          rating: live.rating ?? stock.rating,
        };
        updatedStocks.push(merged);

        // Changelog: track moves ≥ 2% vs previous cached prices
        const prevPrice = prevCachedData?.stocks?.find(s => s.ticker === stock.ticker)?.price;
        if (prevPrice && live.price) {
          const chg = (live.price - prevPrice) / prevPrice * 100;
          if (Math.abs(chg) >= 2) {
            changes.push(`${stock.ticker} ${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`);
          }
        }
        process.stdout.write(`  ✓ ${stock.ticker}: $${live.price}\n`);
      } else {
        updatedStocks.push(stock);
        process.stdout.write(`  ⚠ ${stock.ticker}: API unavailable — kept previous data\n`);
      }
    } catch (err) {
      updatedStocks.push(stock);
      console.warn(`  ✗ ${stock.ticker}: ${err.message}`);
    }
    await delay(300); // rate-limit guard
  }

  // Build changelog entry
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const summary = prevCachedData
    ? (changes.length > 0
        ? `Prices refreshed. Notable moves: ${changes.slice(0, 6).join(' · ')}.`
        : `Daily refresh complete — ${updatedStocks.length} names updated, no major moves.`)
    : `Initial cache populated — ${updatedStocks.length} names loaded.`;

  const prevHistory = (prevCachedData ?? baseData).meta?.runHistory ?? [];
  const runHistory  = [{ date: dateStr, summary }, ...prevHistory].slice(0, 10);

  return {
    meta: {
      lastUpdated: new Date().toISOString(),
      marketSnapshot: snapshot,
      runHistory,
      version: ((prevCachedData ?? baseData).meta?.version ?? 1) + 1,
    },
    stocks: updatedStocks,
  };
}

module.exports = { buildDashboardData };

// ── Standalone run: node scripts/fetch-market-data.js ─
if (require.main === module) {
  const path = require('path');
  const fs   = require('fs');

  const BASE_PATH = path.join(__dirname, '..', 'dashboard-data.json');
  const baseData  = JSON.parse(fs.readFileSync(BASE_PATH, 'utf8'));

  buildDashboardData(baseData, baseData)
    .then(data => {
      const json = JSON.stringify(data, null, 2);
      fs.writeFileSync(BASE_PATH, json);
      fs.writeFileSync(
        path.join(__dirname, '..', 'dashboard-data.js'),
        `// Auto-generated. Daily scheduled task refreshes this file.\nwindow.DASHBOARD_DATA = ${json};\n`
      );
      console.log('\n✅  dashboard-data.json and dashboard-data.js updated successfully.');
    })
    .catch(err => {
      console.error('❌  Fetch failed:', err.message);
      process.exit(1);
    });
}

// ═══════════════════════════════════════════════════
//  Market Watch Data Fetcher — Full US Universe
//  Uses yahoo-finance2 (free, no API key needed).
//  Cron: every hour 8AM–4PM ET weekdays + midnight
//
//  Usage:
//    node scripts/fetch-market-data.js   ← manual run
//    require('./scripts/fetch-market-data') ← server import
// ═══════════════════════════════════════════════════
'use strict';

const { default: YahooFinanceClass } = require('yahoo-finance2');
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });
const YF_OPTS = { validateResult: false };
const delay   = ms => new Promise(r => setTimeout(r, ms));

const RATING_MAP = {
  strongBuy: 'Strong Buy', buy: 'Buy', hold: 'Hold',
  sell: 'Sell', strongSell: 'Strong Sell',
};

// ── Full US Universe (~480 tickers) ──────────────
const US_UNIVERSE = [
  // Technology
  'AAPL','MSFT','NVDA','AVGO','AMD','INTC','QCOM','TXN','MU','AMAT',
  'LRCX','KLAC','MRVL','SMCI','ARM','ORCL','CRM','SAP','NOW','SNOW',
  'DDOG','CRWD','PANW','ZS','NET','FTNT','S','OKTA','CYBR',
  'META','GOOGL','GOOG','AMZN','NFLX','UBER','LYFT','SNAP','PINS','RDDT',
  'ABNB','BKNG','EXPE',
  'MSCI','SPGI','MCO','FDS','ICE','CME','CBOE','NDAQ',
  'IBM','HPQ','HPE','DELL','NTAP','WDC','STX','PSTG',
  'ACN','CTSH','INFY','WIT','EPAM','GLOB',
  'ADBE','INTU','ANSS','CDNS','SNPS','PTC',
  'PYPL','SQ','AFRM','SHOP','HUBS',
  'TWLO','ZM','DOCU','BOX','MDB','ESTC','CFLT','GTLB',
  'PLTR','AI','PATH','TSM','ASML',
  // Communication & Media
  'T','VZ','TMUS','DIS','PARA','WBD','FOXA','FOX',
  // Financials
  'JPM','BAC','WFC','C','GS','MS','USB','PNC','TFC','COF',
  'AXP','V','MA','DFS','SYF','ALLY','SOFI',
  'BLK','SCHW','IBKR','RJF',
  'BRK-B','AIG','MET','PRU','AFL','ALL','CB','TRV','HIG',
  'GPN','FIS','FISV','PAYX','ADP',
  // Healthcare
  'LLY','UNH','JNJ','ABT','TMO','DHR','SYK','MDT','BSX','EW',
  'ABBV','MRK','BMY','GILD','AMGN','REGN','VRTX','BIIB','ILMN','MRNA',
  'CVS','MCK','CI','HUM','CNC','MOH',
  'ISRG','DXCM','HOLX','NVAX','BNTX','NVO','AZN','GSK','SNY','NVS',
  // Consumer Discretionary
  'TSLA','HD','LOW','TJX','ROSS','BBY','ORLY','AZO',
  'MCD','SBUX','YUM','CMG','DRI','QSR',
  'NKE','LULU','DECK','SKX','VFC','PVH','RL',
  'GM','F','RIVN','TM','HMC',
  'MAR','HLT','WH','H',
  'EA','TTWO','RBLX','U',
  'COST','WMT','TGT','DG','DLTR','KR','SFM',
  // Consumer Staples
  'PG','CL','KMB','CHD','EL','HRL','MKC',
  'KO','PEP','MNST','KDP','STZ','SAM',
  'PM','MO','BTI','GIS','K','CPB','CAG',
  // Energy
  'XOM','CVX','COP','EOG','PXD','DVN','FANG','MPC','VLO','PSX',
  'SLB','HAL','BKR','KMI','WMB','OKE','ET','EPD','CEG','VST','NRG',
  // Utilities & Clean Energy
  'NEE','DUK','SO','D','EXC','PCG','ED','FE','EIX','PPL',
  'AEP','XEL','CMS','ENPH','SEDG','FSLR','RUN','BE','PLUG',
  // Industrials
  'CAT','DE','EMR','HON','GE','RTX','LMT','NOC','BA','GD',
  'UPS','FDX','XPO','JBHT','CHRW','EXPD',
  'MMM','ITW','ROK','AME','PH','DOV','WM','RSG','CTAS','CARR','TT','LII','JCI',
  // Materials
  'LIN','APD','ECL','PPG','SHW',
  'NEM','GOLD','AEM','KGC','WPM','FCX','SCCO','AA',
  'VMC','MLM','DOW','LYB','CE','EMN',
  // Real Estate
  'PLD','AMT','CCI','EQIX','DLR','SBAC','IRM',
  'SPG','O','VICI','AVB','EQR','MAA','UDR',
  // ETFs
  'SPY','QQQ','IWM','DIA','GLD','SLV','TLT','HYG','LQD',
  'XLF','XLK','XLE','XLV','XLI','XLC','XLY','XLP','XLU','XLRE','XLB',
  'ARKK','ARKG','ARKW','SQQQ','TQQQ','SPXU','SPXL','UVXY','VXX',
  'EEM','EFA','VWO','FXI','KWEB','EWJ',
];

const TICKERS = [...new Set(US_UNIVERSE)];

// ── Market Snapshot ───────────────────────────────
async function fetchMarketSnapshot() {
  const [spRes, vixRes, ustRes, djiRes, qqqRes] = await Promise.allSettled([
    yahooFinance.quote('^GSPC', {}, YF_OPTS),
    yahooFinance.quote('^VIX',  {}, YF_OPTS),
    yahooFinance.quote('^TNX',  {}, YF_OPTS),
    yahooFinance.quote('^DJI',  {}, YF_OPTS),
    yahooFinance.quote('^IXIC', {}, YF_OPTS),
  ]);
  const sp  = spRes.status  === 'fulfilled' ? spRes.value  : null;
  const vix = vixRes.status === 'fulfilled' ? vixRes.value : null;
  const ust = ustRes.status === 'fulfilled' ? ustRes.value : null;
  const dji = djiRes.status === 'fulfilled' ? djiRes.value : null;
  const ndx = qqqRes.status === 'fulfilled' ? qqqRes.value : null;
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return {
    sp500:      sp  ? Math.round(sp.regularMarketPrice)  : null,
    sp500Chg:   sp  ? +(sp.regularMarketChangePercent  ?? 0).toFixed(2) : null,
    dow:        dji ? Math.round(dji.regularMarketPrice) : null,
    dowChg:     dji ? +(dji.regularMarketChangePercent ?? 0).toFixed(2) : null,
    nasdaq:     ndx ? Math.round(ndx.regularMarketPrice) : null,
    nasdaqChg:  ndx ? +(ndx.regularMarketChangePercent ?? 0).toFixed(2) : null,
    vix:        vix ? +vix.regularMarketPrice.toFixed(1) : null,
    ust10y:     ust ? +ust.regularMarketPrice.toFixed(2) : null,
    updatedAt:  today,
  };
}

// ── Fetch single quote (fast) ─────────────────────
async function fetchQuote(ticker) {
  try {
    const q = await yahooFinance.quote(ticker, {}, YF_OPTS);
    if (!q || !q.regularMarketPrice) return null;

    // % from 52-week range (0 = at 52w low, 100 = at 52w high)
    const w52Pct = q.fiftyTwoWeekHigh && q.fiftyTwoWeekLow
      ? +(((q.regularMarketPrice - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)) * 100).toFixed(1)
      : null;

    // Upside to analyst target
    const upside = q.targetMeanPrice
      ? +(((q.targetMeanPrice - q.regularMarketPrice) / q.regularMarketPrice) * 100).toFixed(1)
      : null;

    // Volume spike vs 10-day avg
    const spikeRatio = q.regularMarketVolume && q.averageDailyVolume10Day
      ? +(q.regularMarketVolume / q.averageDailyVolume10Day).toFixed(2) : null;

    return {
      ticker,
      name:       q.longName || q.shortName || ticker,
      price:      +q.regularMarketPrice.toFixed(2),
      change:     q.regularMarketChangePercent != null ? +q.regularMarketChangePercent.toFixed(2) : null,
      changeAmt:  q.regularMarketChange        != null ? +q.regularMarketChange.toFixed(2)        : null,
      open:       q.regularMarketOpen          != null ? +q.regularMarketOpen.toFixed(2)          : null,
      high:       q.regularMarketDayHigh       != null ? +q.regularMarketDayHigh.toFixed(2)       : null,
      low:        q.regularMarketDayLow        != null ? +q.regularMarketDayLow.toFixed(2)        : null,
      volume:     q.regularMarketVolume        ?? null,
      avgVolume:  q.averageDailyVolume10Day    ?? q.averageDailyVolume3Month ?? null,
      spikeRatio,
      marketCap:  q.marketCap ? +(q.marketCap / 1e9).toFixed(2) : null, // $B
      pe:         q.trailingPE               ? +q.trailingPE.toFixed(1)              : null,
      eps:        q.epsTrailingTwelveMonths   ? +q.epsTrailingTwelveMonths.toFixed(2) : null,
      w52High:    q.fiftyTwoWeekHigh         ? +q.fiftyTwoWeekHigh.toFixed(2)        : null,
      w52Low:     q.fiftyTwoWeekLow          ? +q.fiftyTwoWeekLow.toFixed(2)         : null,
      w52Pct,
      target:     q.targetMeanPrice          ? +q.targetMeanPrice.toFixed(2)         : null,
      upside,
      rating:     q.averageAnalystRating || null,
      sector:     q.sector   || null,
      industry:   q.industry || null,
      exchange:   q.fullExchangeName || q.exchange || null,
      quoteType:  q.quoteType || null,
      beta:       q.beta != null ? +q.beta.toFixed(2) : null,
      fetchedAt:  new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── Main: batch-scan full universe ────────────────
async function buildDashboardData() {
  const BATCH = 10;
  const DELAY_MS = 250;

  console.log(`📡  Fetching market snapshot…`);
  const snapshot = await fetchMarketSnapshot().catch(() => ({}));

  console.log(`📈  Scanning ${TICKERS.length} tickers in batches of ${BATCH}…`);
  const stocks = [];
  let done = 0;

  for (let i = 0; i < TICKERS.length; i += BATCH) {
    const batch = TICKERS.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(fetchQuote));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) stocks.push(r.value);
    }
    done += batch.length;
    process.stdout.write(`\r  ⟳ ${done}/${TICKERS.length} processed…`);
    if (i + BATCH < TICKERS.length) await delay(DELAY_MS);
  }
  process.stdout.write('\n');
  console.log(`✅  ${stocks.length} stocks fetched`);

  return {
    meta: {
      lastUpdated:    new Date().toISOString(),
      stockCount:     stocks.length,
      universeSize:   TICKERS.length,
      marketSnapshot: snapshot,
    },
    stocks,
  };
}

module.exports = { buildDashboardData, TICKERS };

// ── Standalone ────────────────────────────────────
if (require.main === module) {
  buildDashboardData()
    .then(data => {
      data.stocks.slice(0, 5).forEach(s =>
        console.log(`  ${s.ticker.padEnd(6)} $${s.price} (${s.change >= 0 ? '+' : ''}${s.change}%)  upside: ${s.upside ?? '—'}%`)
      );
      console.log(`\n✅  ${data.stocks.length} stocks ready.`);
    })
    .catch(err => { console.error('❌', err.message); process.exit(1); });

// ═══════════════════════════════════════════════════════════════════
//  Options Scanner — Volume Spike + High OI Options Analysis
//  Covers ~1500 US stocks (S&P 500 + Russell 1000 universe)
//  Run manually: node scripts/scan-options.js
//  Called by server cron daily at 9:30 AM ET
// ═══════════════════════════════════════════════════════════════════
'use strict';

const { default: YahooFinanceClass } = require('yahoo-finance2');
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });
const YF_OPTS = { validateResult: false };

// ── S&P 500 + extended large/mid cap US universe (~500 tickers) ───
// This is a curated list of the most liquid, optionable US stocks
// covering all 11 GICS sectors. Add/remove tickers as needed.
const US_STOCK_UNIVERSE = [
  // Technology
  'AAPL','MSFT','NVDA','AVGO','AMD','INTC','QCOM','TXN','MU','AMAT',
  'LRCX','KLAC','MRVL','SMCI','ARM','ORCL','CRM','SAP','NOW','SNOW',
  'DDOG','CRWD','PANW','ZS','NET','FTNT','S','OKTA','CYBR','TENB',
  'META','GOOGL','GOOG','AMZN','NFLX','UBER','LYFT','SNAP','PINS','RDDT',
  'ABNB','BKNG','EXPE','TRIP','YELP','IAC','MTCH','Z','RDFN',
  'MSCI','SPGI','MCO','FDS','ICE','CME','CBOE','NDAQ',
  'IBM','HPQ','HPE','DELL','NTAP','WDC','STX','PSTG','PURE',
  'ACN','CTSH','INFY','WIT','EPAM','GLOB','TASK',
  'ADBE','INTU','ANSS','CDNS','SNPS','PTC','AZPN',
  'PYPL','SQ','AFRM','SHOP','BIGC','WIX','HUBS',
  'TWLO','ZM','DOCU','BOX','DRFT','MDB','ESTC','CFLT','GTLB',
  'PLTR','AI','PATH','UIPATH',
  'TSM','ASML','AEHR','ONTO','FORM',
  // Communication & Media
  'T','VZ','TMUS','LUMN','DISH',
  'DIS','PARA','WBD','FOXA','FOX','NYT','NWSA',
  'GOOGL','META','SNAP','PINS','RDDT',
  // Financials
  'JPM','BAC','WFC','C','GS','MS','USB','PNC','TFC','COF',
  'AXP','V','MA','DFS','SYF','ALLY','SOFI',
  'BLK','SCHW','IBKR','AMTD','RJF','LPL',
  'BRK-B','AIG','MET','PRU','AFL','ALL','CB','TRV','HIG',
  'ICE','CME','CBOE','NDAQ','MSCI','SPGI','MCO',
  'GPN','FIS','FISV','PAYX','ADP','WEX','FLYW',
  // Healthcare
  'LLY','UNH','JNJ','ABT','TMO','DHR','SYK','MDT','BSX','EW',
  'ABBV','MRK','BMY','GILD','AMGN','REGN','VRTX','BIIB','ILMN','MRNA',
  'CVS','MCK','CI','HUM','CNC','MOH',
  'ISRG','DXCM','HOLX','NVCR','INTU','NVAX','BNTX',
  'NVO','AZN','GSK','SNY','NVS','RHHBY',
  // Consumer Discretionary
  'AMZN','TSLA','HD','LOW','TJX','ROSS','BBY','ORLY','AZO','AAP',
  'MCD','SBUX','YUM','CMG','DRI','QSR','WEN','JACK',
  'NKE','LULU','DECK','SKX','VFC','PVH','RL','TPR','CPRI',
  'GM','F','RIVN','LCID','TM','HMC','STLA',
  'BKNG','ABNB','MAR','HLT','WH','CHH','H','IHG',
  'NFLX','DIS','EA','TTWO','ATVI','RBLX','U',
  'COST','WMT','TGT','DG','DLTR','KR','ACI','SFM',
  // Consumer Staples
  'PG','CL','KMB','CHD','EL','REV','SJM','HRL','MKC',
  'KO','PEP','MNST','KDP','STZ','BUD','SAM','TAP',
  'PM','MO','BTI','IMBBY',
  'GIS','K','CPB','CAG','MKC','HRL','SJM',
  // Energy
  'XOM','CVX','COP','EOG','PXD','DVN','FANG','MPC','VLO','PSX',
  'SLB','HAL','BKR','FTI','OIS',
  'KMI','WMB','OKE','ET','EPD','MMP','PAA',
  'CEG','VST','NRG','AES','NI','OGE',
  // Utilities & Clean Energy
  'NEE','DUK','SO','D','EXC','PCG','ED','FE','EIX','PPL',
  'AEP','XEL','CMS','ETR','CNP','PNW','NWE',
  'ENPH','SEDG','FSLR','RUN','NOVA','ARRY','MAXN',
  'BE','PLUG','FCEL','BLDP','ITM',
  // Industrials
  'CAT','DE','EMR','HON','GE','RTX','LMT','NOC','BA','GD',
  'UPS','FDX','XPO','JBHT','CHRW','EXPD','GXO',
  'MMM','ITW','ROK','AME','PH','DOV','GGG',
  'WM','RSG','CLH','CTAS','SRCL','ABM',
  'CARR','TT','LII','JCI','AAON',
  // Materials
  'LIN','APD','ECL','PPG','SHW','RPM','AXTA',
  'NEM','GOLD','AEM','KGC','WPM','AG','PAAS',
  'FCX','SCCO','TECK','AA','CENX','KALU',
  'VMC','MLM','SUM','EXP','USCR',
  'DOW','LYB','CE','EMN','HUN',
  // Real Estate
  'PLD','AMT','CCI','EQIX','DLR','SBAC','IRM',
  'SPG','O','VICI','GLPI','EPR',
  'AVB','EQR','MAA','UDR','CPT','AIV',
  'WPC','NNN','ADC','AGREE',
  // ETFs (highly optionable, good for flow)
  'SPY','QQQ','IWM','DIA','GLD','SLV','TLT','HYG','LQD',
  'XLF','XLK','XLE','XLV','XLI','XLC','XLY','XLP','XLU','XLRE','XLB',
  'ARKK','ARKG','ARKW','ARKF',
  'SQQQ','TQQQ','SPXU','SPXL','UVXY','VXX',
  'EEM','EFA','VWO','FXI','KWEB','EWJ',
];

// Deduplicate
const TICKERS = [...new Set(US_STOCK_UNIVERSE)];

// ── Config ────────────────────────────────────────
const VOLUME_SPIKE_THRESHOLD = 2.0;   // current vol > 2x 10-day avg
const MAX_CONCURRENT = 5;             // parallel fetch limit (be nice to Yahoo)
const MAX_OPTIONS_STOCKS = 30;        // max stocks to fetch full options chain (extended mode)
const HIGH_OI_PERCENTILE = 0.8;       // top 20% OI strikes flagged

// ── Default: only these 4 index/ETF options are scanned ──────────
// SPX (^SPX) and NDX (^NDX) are the cash-settled index options;
// SPY and QQQ are the ETF equivalents with American-style exercise.
const DEFAULT_OPTIONS_TICKERS = [
  { ticker: 'SPY',  name: 'SPDR S&P 500 ETF',         label: 'S&P 500 ETF' },
  { ticker: 'QQQ',  name: 'Invesco QQQ Trust (Nasdaq)', label: 'Nasdaq-100 ETF' },
  { ticker: '^SPX', name: 'S&P 500 Index',              label: 'SPX Index' },
  { ticker: '^NDX', name: 'Nasdaq-100 Index',           label: 'NDX Index' },
];

// ── Helpers ───────────────────────────────────────
async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function batchMap(items, fn, concurrency = MAX_CONCURRENT) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(chunk.map(fn));
    for (const r of chunkResults) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
    await sleep(300); // rate limit courtesy delay
  }
  return results;
}

// ── Volume Spike Screening ────────────────────────
async function screenVolumeSpikes() {
  console.log(`📊 Screening ${TICKERS.length} tickers for volume spikes…`);

  const spikes = [];

  const fetchQuote = async (ticker) => {
    try {
      const q = await yahooFinance.quote(ticker, {}, YF_OPTS);
      if (!q) return null;

      const vol    = q.regularMarketVolume || 0;
      const avg10  = q.averageDailyVolume10Day || q.averageDailyVolume3Month || 0;
      const avg3mo = q.averageDailyVolume3Month || avg10;

      if (!avg10 || vol < 100_000) return null; // skip illiquid

      const ratio = vol / avg10;
      if (ratio >= VOLUME_SPIKE_THRESHOLD) {
        return {
          ticker,
          name:       q.longName || q.shortName || ticker,
          price:      q.regularMarketPrice,
          change:     q.regularMarketChangePercent,
          volume:     vol,
          avg10dVol:  avg10,
          avg3moVol:  avg3mo,
          spikeRatio: parseFloat(ratio.toFixed(2)),
          marketCap:  q.marketCap,
          sector:     q.sector || null,
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const raw = await batchMap(TICKERS, fetchQuote, MAX_CONCURRENT);
  for (const r of raw) {
    if (r) spikes.push(r);
  }

  // Sort by spike ratio desc
  spikes.sort((a, b) => b.spikeRatio - a.spikeRatio);
  console.log(`✅ Found ${spikes.length} volume spikes`);
  return spikes;
}

// ── Options Chain Analysis ────────────────────────
function calcMaxPain(calls, puts) {
  // Max pain = strike where total value of all options expiring worthless is maximized
  const allStrikes = [...new Set([...calls, ...puts].map(o => o.strike))].sort((a, b) => a - b);
  let minPain = Infinity;
  let maxPainStrike = null;

  for (const s of allStrikes) {
    let totalPain = 0;
    for (const c of calls) {
      if (s > c.strike) totalPain += (s - c.strike) * (c.openInterest || 0);
    }
    for (const p of puts) {
      if (s < p.strike) totalPain += (p.strike - s) * (p.openInterest || 0);
    }
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = s;
    }
  }
  return maxPainStrike;
}

function findHighOIStrikes(contracts, topN = 5) {
  return [...contracts]
    .sort((a, b) => (b.openInterest || 0) - (a.openInterest || 0))
    .slice(0, topN)
    .map(c => ({
      strike:       c.strike,
      expiry:       c.expiration ? new Date(c.expiration * 1000).toISOString().slice(0, 10) : null,
      openInterest: c.openInterest || 0,
      volume:       c.volume || 0,
      volOiRatio:   c.openInterest ? parseFloat(((c.volume || 0) / c.openInterest).toFixed(3)) : 0,
      iv:           c.impliedVolatility ? parseFloat((c.impliedVolatility * 100).toFixed(1)) : null,
      bid:          c.bid,
      ask:          c.ask,
      lastPrice:    c.lastPrice,
      inTheMoney:   c.inTheMoney,
    }));
}

function findUnusualFlow(contracts, minVolOiRatio = 1.0) {
  // Contracts with vol/OI > 1 mean brand new money (can't be closing existing positions)
  return contracts
    .filter(c => c.openInterest > 100 && c.volume > 500)
    .map(c => ({
      ...c,
      volOiRatio: c.openInterest ? parseFloat(((c.volume || 0) / c.openInterest).toFixed(3)) : 0,
    }))
    .filter(c => c.volOiRatio >= minVolOiRatio)
    .sort((a, b) => b.volOiRatio - a.volOiRatio)
    .slice(0, 5)
    .map(c => ({
      strike:       c.strike,
      type:         c.contractSymbol?.includes('C') ? 'CALL' : 'PUT',
      expiry:       c.expiration ? new Date(c.expiration * 1000).toISOString().slice(0, 10) : null,
      volume:       c.volume || 0,
      openInterest: c.openInterest || 0,
      volOiRatio:   c.volOiRatio,
      iv:           c.impliedVolatility ? parseFloat((c.impliedVolatility * 100).toFixed(1)) : null,
      bid:          c.bid,
      ask:          c.ask,
      lastPrice:    c.lastPrice,
      inTheMoney:   c.inTheMoney,
    }));
}

async function analyzeOptionsChain(ticker, currentPrice, zeroDTE = false) {
  try {
    const result = await yahooFinance.options(ticker, {}, YF_OPTS);
    if (!result || !result.options || result.options.length === 0) return null;

    // For 0DTE (core tickers): only use today's expiry
    // For extended scans: aggregate across all expiries
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let allCalls = [];
    let allPuts  = [];

    if (zeroDTE) {
      // Find the expiry bucket whose contracts expire today
      let todayExpiry = result.options.find(exp => {
        // Each contract in the bucket shares the same expiry date
        const sample = (exp.calls?.[0] || exp.puts?.[0]);
        if (!sample?.expiration) return false;
        return new Date(sample.expiration * 1000).toISOString().slice(0, 10) === todayStr;
      });
      if (!todayExpiry) {
        // No same-day expiry (weekend / non-expiry day) — fall back to nearest expiry
        console.warn(`  ⚠️  No 0DTE contracts for ${ticker} on ${todayStr} — falling back to nearest expiry`);
        todayExpiry = result.options
          .filter(exp => (exp.calls?.[0] || exp.puts?.[0])?.expiration)
          .sort((a, b) => {
            const sa = (a.calls?.[0] || a.puts?.[0]).expiration;
            const sb = (b.calls?.[0] || b.puts?.[0]).expiration;
            return sa - sb;
          })[0];
      }
      if (!todayExpiry) return null;
      allCalls = todayExpiry.calls || [];
      allPuts  = todayExpiry.puts  || [];
    } else {
      for (const expiry of result.options) {
        allCalls = allCalls.concat(expiry.calls || []);
        allPuts  = allPuts.concat(expiry.puts || []);
      }
    }

    if (allCalls.length === 0 && allPuts.length === 0) return null;

    const totalCallOI  = allCalls.reduce((s, c) => s + (c.openInterest || 0), 0);
    const totalPutOI   = allPuts.reduce((s,  c) => s + (c.openInterest || 0), 0);
    const totalCallVol = allCalls.reduce((s, c) => s + (c.volume || 0), 0);
    const totalPutVol  = allPuts.reduce((s,  c) => s + (c.volume || 0), 0);
    const pcRatio      = totalCallOI > 0 ? parseFloat((totalPutOI / totalCallOI).toFixed(3)) : null;
    const pcVolRatio   = totalCallVol > 0 ? parseFloat((totalPutVol / totalCallVol).toFixed(3)) : null;
    const maxPain      = calcMaxPain(allCalls, allPuts);

    // For 0DTE all contracts are already same-day; for extended use near 60-day window
    const nearCalls = zeroDTE ? allCalls : allCalls.filter(c => c.expiration && c.expiration * 1000 < Date.now() + 60 * 24 * 3600 * 1000);
    const nearPuts  = zeroDTE ? allPuts  : allPuts.filter(c  => c.expiration && c.expiration * 1000 < Date.now() + 60 * 24 * 3600 * 1000);

    const topCallOI    = findHighOIStrikes(nearCalls.length ? nearCalls : allCalls);
    const topPutOI     = findHighOIStrikes(nearPuts.length ? nearPuts : allPuts);
    const unusualCalls = findUnusualFlow(allCalls);
    const unusualPuts  = findUnusualFlow(allPuts);

    // Directional signal heuristic
    let signal = 'NEUTRAL';
    if (pcRatio !== null) {
      if (pcRatio < 0.7 && totalCallVol > totalPutVol * 1.5) signal = 'BULLISH';
      else if (pcRatio > 1.3 && totalPutVol > totalCallVol * 1.5) signal = 'BEARISH';
      else if (pcRatio < 0.9) signal = 'SLIGHT_BULLISH';
      else if (pcRatio > 1.1) signal = 'SLIGHT_BEARISH';
    }

    // IV skew: compare avg IV of OTM puts vs OTM calls
    const otmPuts  = allPuts.filter(c => c.strike < currentPrice && c.impliedVolatility);
    const otmCalls = allCalls.filter(c => c.strike > currentPrice && c.impliedVolatility);
    const avgPutIV  = otmPuts.length  ? otmPuts.reduce((s, c) => s + c.impliedVolatility, 0) / otmPuts.length : null;
    const avgCallIV = otmCalls.length ? otmCalls.reduce((s, c) => s + c.impliedVolatility, 0) / otmCalls.length : null;
    const ivSkew    = avgPutIV && avgCallIV ? parseFloat(((avgPutIV - avgCallIV) * 100).toFixed(1)) : null;

    return {
      ticker,
      currentPrice,
      zeroDTE,
      expiryDate: zeroDTE
        ? (allCalls[0]?.expiration
            ? new Date(allCalls[0].expiration * 1000).toISOString().slice(0, 10)
            : (allPuts[0]?.expiration
                ? new Date(allPuts[0].expiration * 1000).toISOString().slice(0, 10)
                : todayStr))
        : null,
      totalCallOI,
      totalPutOI,
      totalCallVol,
      totalPutVol,
      pcRatio,
      pcVolRatio,
      maxPain,
      signal,
      ivSkewPct: ivSkew, // positive = put skew (fear), negative = call skew (greed)
      topCallOI,
      topPutOI,
      unusualCalls,
      unusualPuts,
      expiryCount: result.options.length,
    };
  } catch (err) {
    console.warn(`  ⚠️  Options chain failed for ${ticker}: ${err.message}`);
    return null;
  }
}

// ── Main Scan ─────────────────────────────────────
// extended=false (default): only scan SPY, QQQ, ^SPX, ^NDX
// extended=true: also screen full US universe for volume spikes + options chains
async function runOptionsScan({ extended = false } = {}) {
  const startTime = Date.now();
  console.log(`🔍  Starting options scanner (${extended ? 'EXTENDED — full universe' : 'DEFAULT — SPY/QQQ/SPX/NDX'})…`);

  // ── Step 1: Always fetch the 4 core index/ETF option chains (0DTE only) ──
  const todayStr = new Date().toISOString().slice(0, 10);
  console.log(`🔗  Fetching 0DTE core options (SPY, QQQ, ^SPX, ^NDX) for ${todayStr}…`);
  const coreChains = [];

  for (const def of DEFAULT_OPTIONS_TICKERS) {
    try {
      // Fetch price via quote (^SPX / ^NDX are indices, still work with quote)
      const q = await yahooFinance.quote(def.ticker, {}, YF_OPTS).catch(() => null);
      const price = q?.regularMarketPrice || null;
      const chain = await analyzeOptionsChain(def.ticker, price, true); // zeroDTE=true
      if (chain) {
        coreChains.push({
          ticker:     def.ticker,
          name:       def.name,
          label:      def.label,
          price,
          change:     q?.regularMarketChangePercent || null,
          volume:     q?.regularMarketVolume || null,
          spikeRatio: null, // N/A for index, always included
          isCore:     true,
          options:    chain,
        });
        console.log(`  ✓ ${def.ticker} (0DTE: ${todayStr})`);
      }
    } catch (err) {
      console.warn(`  ⚠️  Core chain failed for ${def.ticker}: ${err.message}`);
    }
    await sleep(400);
  }

  // ── Step 2 (extended only): volume spike screen + options chains ──
  let spikes = [];
  let extChains = [];

  if (extended) {
    spikes = await screenVolumeSpikes();
    const topSpiked = spikes
      .filter(s => !DEFAULT_OPTIONS_TICKERS.some(d => d.ticker === s.ticker))
      .slice(0, MAX_OPTIONS_STOCKS);

    console.log(`🔗  Fetching options chains for ${topSpiked.length} spiked stocks…`);
    const fetchChain = async (spike) => {
      const chain = await analyzeOptionsChain(spike.ticker, spike.price);
      if (!chain) return null;
      return { ...spike, isCore: false, options: chain };
    };
    const chainResults = await batchMap(topSpiked, fetchChain, 3);
    for (const r of chainResults) {
      if (r) extChains.push(r);
    }
  }

  // ── Step 3: Build alerts across all analyzed chains ──
  const allChains = [...coreChains, ...extChains];
  const alerts = [];

  for (const stock of allChains) {
    const opts = stock.options;
    if (!opts) continue;

    // Alert: Bullish flow (extended only uses spikeRatio, core uses P/C signal)
    const spikeOk = stock.isCore || (stock.spikeRatio >= 3);
    if (spikeOk && opts.signal === 'BULLISH') {
      alerts.push({
        type:        'BULLISH_FLOW',
        ticker:      stock.ticker,
        name:        stock.name,
        price:       stock.price,
        spikeRatio:  stock.spikeRatio,
        pcRatio:     opts.pcRatio,
        signal:      opts.signal,
        maxPain:     opts.maxPain,
        description: stock.isCore
          ? `${stock.ticker} index shows bullish options flow — P/C ratio ${opts.pcRatio}, max pain $${opts.maxPain}`
          : `${stock.ticker} has ${stock.spikeRatio}x normal volume with bullish options flow (P/C: ${opts.pcRatio})`,
      });
    }

    // Alert: Unusual call sweep
    if (opts.unusualCalls.length > 0 && opts.unusualCalls[0].volOiRatio >= 2) {
      alerts.push({
        type:        'UNUSUAL_CALL_SWEEP',
        ticker:      stock.ticker,
        name:        stock.name,
        price:       stock.price,
        spikeRatio:  stock.spikeRatio,
        pcRatio:     opts.pcRatio,
        signal:      opts.signal,
        maxPain:     opts.maxPain,
        topContract: opts.unusualCalls[0],
        description: `${stock.ticker} unusual call sweep: ${opts.unusualCalls[0].volume?.toLocaleString()} contracts at $${opts.unusualCalls[0].strike} (V/OI: ${opts.unusualCalls[0].volOiRatio}x)`,
      });
    }

    // Alert: Unusual put sweep
    if (opts.unusualPuts.length > 0 && opts.unusualPuts[0].volOiRatio >= 2) {
      alerts.push({
        type:        'UNUSUAL_PUT_SWEEP',
        ticker:      stock.ticker,
        name:        stock.name,
        price:       stock.price,
        spikeRatio:  stock.spikeRatio,
        pcRatio:     opts.pcRatio,
        signal:      opts.signal,
        maxPain:     opts.maxPain,
        topContract: opts.unusualPuts[0],
        description: `${stock.ticker} unusual put sweep: ${opts.unusualPuts[0].volume?.toLocaleString()} contracts at $${opts.unusualPuts[0].strike} (V/OI: ${opts.unusualPuts[0].volOiRatio}x)`,
      });
    }

    // Alert: Extreme IV skew
    if (opts.ivSkewPct !== null && Math.abs(opts.ivSkewPct) > 10) {
      alerts.push({
        type:        opts.ivSkewPct > 0 ? 'PUT_SKEW_FEAR' : 'CALL_SKEW_GREED',
        ticker:      stock.ticker,
        name:        stock.name,
        price:       stock.price,
        spikeRatio:  stock.spikeRatio,
        pcRatio:     opts.pcRatio,
        signal:      opts.signal,
        maxPain:     opts.maxPain,
        ivSkewPct:   opts.ivSkewPct,
        description: `${stock.ticker} IV skew ${opts.ivSkewPct > 0 ? 'put-heavy' : 'call-heavy'} at ${Math.abs(opts.ivSkewPct)}% — market pricing in ${opts.ivSkewPct > 0 ? 'downside' : 'upside'} move`,
      });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅  Options scan complete in ${elapsed}s — ${alerts.length} alerts, ${allChains.length} chains`);

  return {
    scannedAt:      new Date().toISOString(),
    elapsedSec:     parseFloat(elapsed),
    mode:           extended ? 'extended' : 'default',
    universeSize:   extended ? TICKERS.length : DEFAULT_OPTIONS_TICKERS.length,
    spikesFound:    spikes.length,
    chainsAnalyzed: allChains.length,
    alerts,
    coreChains,
    volumeSpikes:   spikes,
    optionsChains:  allChains,
  };
}

module.exports = { runOptionsScan, TICKERS, DEFAULT_OPTIONS_TICKERS };

// ── Standalone run ────────────────────────────────
if (require.main === module) {
  const extended = process.argv.includes('--extended');
  runOptionsScan({ extended })
    .then(data => {
      console.log('\n📋  ALERTS:');
      for (const a of data.alerts) console.log(`  [${a.type}] ${a.description}`);
      if (data.volumeSpikes.length) {
        console.log(`\n📈  Top Volume Spikes:`);
        for (const s of data.volumeSpikes.slice(0, 10)) {
          console.log(`  ${s.ticker.padEnd(8)} ${s.spikeRatio}x  $${s.price}  ${s.name}`);
        }
      }
    })
    .catch(err => {
      console.error('Scan failed:', err.message);
      process.exit(1);
    });
}

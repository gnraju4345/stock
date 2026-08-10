'use strict';
/* ============================================================
   KENSHO PROXY SERVER — server.js
   NSE India data proxy (handles session cookies)
   Port: 3001
   ============================================================ */

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app  = express();
const PORT = 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

/* ── NSE Session Cookie Manager ────────────────────────────── */
let NSE_COOKIE   = '';
let COOKIE_TS    = 0;
const COOKIE_TTL = 5 * 60 * 1000; // refresh every 5 min

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BASE_HDR = {
  'User-Agent':      UA,
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection':      'keep-alive',
};

function parseCookies(raw = []) {
  const jar = {};
  raw.forEach(c => {
    const kv  = c.split(';')[0];
    const eq  = kv.indexOf('=');
    if (eq > 0) jar[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  });
  return jar;
}

function jarStr(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function refreshCookie() {
  console.log('[NSE] 🔄 Refreshing session cookie…');
  try {
    let jar = {};

    // Step 1 — homepage (gets nsit, nseappid, etc.)
    const r1 = await fetch('https://www.nseindia.com/', {
      headers: { ...BASE_HDR, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      redirect: 'follow', timeout: 10000,
    });
    jar = { ...jar, ...parseCookies(r1.headers.raw()['set-cookie'] || []) };

    await sleep(600);

    // Step 2 — live market page (refreshes session)
    const r2 = await fetch('https://www.nseindia.com/market-data/live-equity-market', {
      headers: { ...BASE_HDR, Accept: 'text/html', Referer: 'https://www.nseindia.com/', Cookie: jarStr(jar) },
      redirect: 'follow', timeout: 10000,
    });
    jar = { ...jar, ...parseCookies(r2.headers.raw()['set-cookie'] || []) };

    await sleep(400);

    // Step 3 — option chain page (needed for options API)
    const r3 = await fetch('https://www.nseindia.com/option-chain', {
      headers: { ...BASE_HDR, Accept: 'text/html', Referer: 'https://www.nseindia.com/', Cookie: jarStr(jar) },
      redirect: 'follow', timeout: 10000,
    });
    jar = { ...jar, ...parseCookies(r3.headers.raw()['set-cookie'] || []) };

    NSE_COOKIE = jarStr(jar);
    COOKIE_TS  = Date.now();
    const keys = Object.keys(jar);
    console.log(`[NSE] ✅ Cookie ready (${keys.length} keys): ${keys.slice(0, 5).join(', ')}…`);
    return true;
  } catch (err) {
    console.error('[NSE] ❌ Cookie refresh failed:', err.message);
    return false;
  }
}

async function nseGet(path, retried = false) {
  if (!NSE_COOKIE || Date.now() - COOKIE_TS > COOKIE_TTL) await refreshCookie();

  const url  = `https://www.nseindia.com/api/${path}`;
  const resp = await fetch(url, {
    headers: {
      ...BASE_HDR,
      Accept:   'application/json, text/plain, */*',
      Referer:  'https://www.nseindia.com/',
      Cookie:   NSE_COOKIE,
    },
    timeout: 10000,
  });

  if ((resp.status === 401 || resp.status === 403 || resp.status === 404) && !retried) {
    console.warn(`[NSE] ⚠️  ${resp.status} on ${path}, re-auth…`);
    await refreshCookie();
    return nseGet(path, true);
  }

  if (!resp.ok) throw new Error(`NSE ${path} → HTTP ${resp.status}`);
  return resp.json();
}

/* ── In-memory Cache ────────────────────────────────────────── */
const CACHE     = {};
const CACHE_TTL = 15 * 1000; // 15 seconds

async function cached(key, fn) {
  const now = Date.now();
  if (CACHE[key] && now - CACHE[key].ts < CACHE_TTL) return CACHE[key].data;
  const data = await fn();
  CACHE[key]  = { data, ts: now };
  return data;
}

/* ── Helpers ────────────────────────────────────────────────── */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function safeNum(v) { return typeof v === 'number' ? v : parseFloat(v) || 0; }

/* ── ROUTES ─────────────────────────────────────────────────── */

// Health / status
app.get('/api/status', (req, res) => res.json({
  ok:        true,
  server:    'Kensho NSE Proxy',
  cookieAge: `${Math.floor((Date.now() - COOKIE_TS) / 1000)}s`,
  cacheSize: Object.keys(CACHE).length,
  uptime:    `${process.uptime().toFixed(0)}s`,
  port:      PORT,
}));

/* ── INDICES ──────────────────────────────────────────────── */
app.get('/api/indices', async (req, res) => {
  try {
    const data = await cached('indices', async () => {
      const [n50, nbank, mid] = await Promise.allSettled([
        nseGet('equity-stockIndices?index=NIFTY%2050'),
        nseGet('equity-stockIndices?index=NIFTY%20BANK'),
        nseGet('equity-stockIndices?index=NIFTY%20MIDCAP%2050'),
      ]);

      function extract(settled, want) {
        if (settled.status !== 'fulfilled') return null;
        const arr = settled.value?.data;
        if (!Array.isArray(arr)) return null;
        const row = arr.find(r => r.index === want || r.indexSymbol === want) || arr[0];
        if (!row) return null;
        return {
          name:       row.index,
          last:       safeNum(row.last),
          change:     safeNum(row.change),
          pChange:    safeNum(row.pChange),
          open:       safeNum(row.open),
          high:       safeNum(row.high),
          low:        safeNum(row.low),
          prevClose:  safeNum(row.previousClose),
          advances:   safeNum(row.advances),
          declines:   safeNum(row.declines),
          unchanged:  safeNum(row.unchanged),
        };
      }

      return {
        'NIFTY 50':   extract(n50,   'NIFTY 50'),
        'BANK NIFTY': extract(nbank, 'NIFTY BANK'),
        'MIDCAP 50':  extract(mid,   'NIFTY MIDCAP 50'),
        ts: new Date().toISOString(),
      };
    });
    res.json({ ok: true, data });
  } catch (err) {
    console.error('/api/indices error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── MARKET STATUS ────────────────────────────────────────── */
app.get('/api/market-status', async (req, res) => {
  try {
    const data = await cached('mkt_status', () => nseGet('marketStatus'));
    // NSE returns { marketStatus: { marketState: [...] } }
    const states = data?.marketStatus?.marketState || [];
    const equityState = states.find(s => s.market === 'Capital Market') || states[0];
    res.json({
      ok: true,
      data: {
        state:       equityState?.marketStatus || 'Unknown',
        tradeDate:   equityState?.tradeDate,
        index:       equityState?.index,
        raw:         states,
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── SINGLE STOCK QUOTE ───────────────────────────────────── */
app.get('/api/quote/:symbol', async (req, res) => {
  const sym = req.params.symbol.toUpperCase().replace(/-/g, '%26');
  try {
    const raw = await cached(`q_${sym}`, () => nseGet(`quote-equity?symbol=${encodeURIComponent(req.params.symbol.toUpperCase())}`));
    const pi  = raw?.priceInfo;
    const si  = raw?.securityInfo;
    const ii  = raw?.industryInfo;
    const md  = raw?.metadata;

    if (!pi) throw new Error('No priceInfo in response');

    res.json({
      ok: true,
      symbol: sym,
      data: {
        lastPrice:    safeNum(pi.lastPrice),
        change:       safeNum(pi.change),
        pChange:      safeNum(pi.pChange),
        open:         safeNum(pi.open),
        high:         safeNum(pi.intraDayHighLow?.max),
        low:          safeNum(pi.intraDayHighLow?.min),
        prevClose:    safeNum(pi.previousClose),
        vwap:         safeNum(pi.vwap),
        volume:       safeNum(raw?.marketDeptOrderBook?.totalBuyQuantity) + safeNum(raw?.marketDeptOrderBook?.totalSellQuantity),
        week52High:   safeNum(pi.weekHighLow?.max),
        week52Low:    safeNum(pi.weekHighLow?.min),
        upperCircuit: safeNum(pi.upperCP),
        lowerCircuit: safeNum(pi.lowerCP),
        marketCap:    safeNum(si?.marketCap),
        pe:           safeNum(si?.pdSymbolPe),
        eps:          safeNum(si?.pdEPS),
        sectorPe:     safeNum(si?.pdSectorPe),
        sector:       ii?.sector,
        industry:     ii?.industry,
        companyName:  md?.companyName,
      }
    });
  } catch (err) {
    console.error(`/api/quote/${sym} error:`, err.message);
    res.status(500).json({ ok: false, symbol: sym, error: err.message });
  }
});

/* ── MULTIPLE QUOTES (batch) ──────────────────────────────── */
app.get('/api/quotes', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
  if (!symbols.length) return res.json({ ok: true, data: {} });

  const settled = await Promise.allSettled(
    symbols.map(sym =>
      cached(`q_${sym}`, () => nseGet(`quote-equity?symbol=${encodeURIComponent(sym)}`))
        .then(raw => ({ sym, raw }))
    )
  );

  const data = {};
  settled.forEach(r => {
    if (r.status !== 'fulfilled') return;
    const { sym, raw } = r.value;
    const pi = raw?.priceInfo;
    if (!pi) return;
    data[sym] = {
      lastPrice:  safeNum(pi.lastPrice),
      change:     safeNum(pi.change),
      pChange:    safeNum(pi.pChange),
      open:       safeNum(pi.open),
      prevClose:  safeNum(pi.previousClose),
      vwap:       safeNum(pi.vwap),
      high:       safeNum(pi.intraDayHighLow?.max),
      low:        safeNum(pi.intraDayHighLow?.min),
      upperCP:    safeNum(pi.upperCP),
      lowerCP:    safeNum(pi.lowerCP),
    };
  });

  res.json({ ok: true, data, count: Object.keys(data).length, ts: new Date().toISOString() });
});

/* ── NIFTY MOST ACTIVE / GAINERS / LOSERS ─────────────────── */
app.get('/api/gainers-losers', async (req, res) => {
  try {
    const data = await cached('gainers_losers', async () => {
      const [gainers, losers, active] = await Promise.allSettled([
        nseGet('live-analysis-variations?index=gainers&limit=10&aType=PercPriceGainer'),
        nseGet('live-analysis-variations?index=loosers&limit=10&aType=PercPriceLooser'),
        nseGet('live-analysis-volume?index=NIFTY&limit=10'),
      ]);

      return {
        gainers: gainers.status === 'fulfilled' ? gainers.value?.NIFTY?.data || [] : [],
        losers:  losers.status  === 'fulfilled' ? losers.value?.NIFTY?.data  || [] : [],
        active:  active.status  === 'fulfilled' ? active.value?.data          || [] : [],
      };
    });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── OPTIONS CHAIN ────────────────────────────────────────── */
app.get('/api/options/:symbol', async (req, res) => {
  const sym = req.params.symbol.toUpperCase();
  const INDEX_SYMS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'];

  try {
    const path = INDEX_SYMS.includes(sym)
      ? `option-chain-indices?symbol=${sym}`
      : `option-chain-equities?symbol=${encodeURIComponent(sym)}`;

    const expiry = req.query.expiry || null;
    const raw    = await cached(`opt_${sym}_${expiry || 'cur'}`, () => nseGet(path));

    const records  = raw?.records  || {};
    const filtered = raw?.filtered || {};
    const chainData= expiry
      ? (records.data || []).filter(r => r.expiryDate === expiry)
      : (filtered.data || records.data || []);

    const underlying  = safeNum(records.underlyingValue);
    const expiryDates = records.expiryDates || [];

    // Build strike map
    let totalCEOI = 0, totalPEOI = 0;
    const strikeMap = {};

    chainData.forEach(row => {
      const s = row.strikePrice;
      if (!strikeMap[s]) strikeMap[s] = { strikePrice: s, CE: null, PE: null };

      if (row.CE) {
        const ce = {
          oi:     safeNum(row.CE.openInterest),
          oiChg:  safeNum(row.CE.changeinOpenInterest),
          ltp:    safeNum(row.CE.lastPrice),
          vol:    safeNum(row.CE.totalTradedVolume),
          iv:     safeNum(row.CE.impliedVolatility),
          bid:    safeNum(row.CE.bidprice),
          ask:    safeNum(row.CE.askPrice),
        };
        strikeMap[s].CE = ce;
        totalCEOI += ce.oi;
      }
      if (row.PE) {
        const pe = {
          oi:     safeNum(row.PE.openInterest),
          oiChg:  safeNum(row.PE.changeinOpenInterest),
          ltp:    safeNum(row.PE.lastPrice),
          vol:    safeNum(row.PE.totalTradedVolume),
          iv:     safeNum(row.PE.impliedVolatility),
          bid:    safeNum(row.PE.bidprice),
          ask:    safeNum(row.PE.askPrice),
        };
        strikeMap[s].PE = pe;
        totalPEOI += pe.oi;
      }
    });

    const strikes = Object.values(strikeMap).sort((a, b) => a.strikePrice - b.strikePrice);
    const pcr     = totalCEOI > 0 ? +(totalPEOI / totalCEOI).toFixed(3) : 0;

    // Max Pain calculation
    let maxPain = underlying, minPain = Infinity;
    strikes.forEach(pivot => {
      let pain = 0;
      strikes.forEach(row => {
        if (row.strikePrice < pivot.strikePrice && row.CE)
          pain += row.CE.oi * (pivot.strikePrice - row.strikePrice);
        if (row.strikePrice > pivot.strikePrice && row.PE)
          pain += row.PE.oi * (row.strikePrice - pivot.strikePrice);
      });
      if (pain < minPain) { minPain = pain; maxPain = pivot.strikePrice; }
    });

    // ATM strike (nearest to underlying)
    const atm = strikes.reduce((best, s) =>
      Math.abs(s.strikePrice - underlying) < Math.abs(best.strikePrice - underlying) ? s : best,
      strikes[0] || { strikePrice: underlying }
    ).strikePrice;

    // IV (ATM)
    const atmRow = strikeMap[atm];
    const atmIV  = atmRow?.CE?.iv || atmRow?.PE?.iv || 0;

    // Max OI strikes
    const maxCEOI = Math.max(...strikes.map(s => s.CE?.oi || 0));
    const maxPEOI = Math.max(...strikes.map(s => s.PE?.oi || 0));

    res.json({
      ok: true,
      symbol: sym,
      data: {
        underlying, atm, expiryDates,
        strikes,
        totalCEOI, totalPEOI,
        maxCEOI, maxPEOI,
        pcr, maxPain, atmIV,
        timestamp: records.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        currentExpiry: expiryDates[0] || '',
      }
    });
  } catch (err) {
    console.error(`/api/options/${sym} error:`, err.message);
    res.status(500).json({ ok: false, symbol: sym, error: err.message });
  }
});

/* ── FII / DII DATA ───────────────────────────────────────── */
app.get('/api/fii-dii', async (req, res) => {
  try {
    const data = await cached('fii_dii', () => nseGet('fiidiiTradeReact'));
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── START SERVER ─────────────────────────────────────────── */
app.listen(PORT, async () => {
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│  🚀  Kensho NSE Proxy Server             │');
  console.log(`│  📡  http://localhost:${PORT}              │`);
  console.log('└─────────────────────────────────────────┘\n');
  console.log('Initializing NSE session cookie…');
  const ok = await refreshCookie();
  if (ok) {
    console.log('\n✅ Server ready! Open the dashboard:\n');
    console.log('   file:///Users/g.nagaraju/Documents/stock/index.html\n');
  } else {
    console.log('\n⚠️  Cookie init failed — will retry on first request\n');
  }

  // Auto-refresh cookies every 4 minutes
  setInterval(refreshCookie, 4 * 60 * 1000);
});

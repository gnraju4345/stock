'use strict';
const { getOptionExpiries, getOptionsChain, getIndexQuotes } = require('./_upstox');
const { nseGet, cors, safeNum } = require('./_nse');

const NSE_INDEX_SYMS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'];

// Map dashboard symbol → getIndexQuotes() key
const UPSTOX_IDX = {
  'NIFTY':      'NIFTY50',
  'BANKNIFTY':  'BANKNIFTY',
  'FINNIFTY':   'FINNIFTY',
  'MIDCPNIFTY': 'MIDCPNIFTY',
  'SENSEX':     'SENSEX',
};

/**
 * Normalize raw Upstox option chain array into the same shape
 * the frontend already expects (same as NSE path below).
 */
function normalizeUpstoxChain(chainData, underlying) {
  const strikeMap  = {};
  let totalCEOI    = 0;
  let totalPEOI    = 0;

  for (const row of chainData) {
    const s = row.strike_price;
    if (!strikeMap[s]) strikeMap[s] = { strikePrice: s, CE: null, PE: null };

    if (row.call_options?.market_data) {
      const m = row.call_options.market_data;
      strikeMap[s].CE = {
        oi:    safeNum(m.oi),
        oiChg: safeNum(m.oi_day_change || 0),
        ltp:   safeNum(m.ltp),
        vol:   safeNum(m.volume),
        iv:    safeNum(m.iv),
        bid:   safeNum(m.bid_price),
        ask:   safeNum(m.ask_price),
      };
      totalCEOI += safeNum(m.oi);
    }

    if (row.put_options?.market_data) {
      const m = row.put_options.market_data;
      strikeMap[s].PE = {
        oi:    safeNum(m.oi),
        oiChg: safeNum(m.oi_day_change || 0),
        ltp:   safeNum(m.ltp),
        vol:   safeNum(m.volume),
        iv:    safeNum(m.iv),
        bid:   safeNum(m.bid_price),
        ask:   safeNum(m.ask_price),
      };
      totalPEOI += safeNum(m.oi);
    }
  }

  const strikes  = Object.values(strikeMap).sort((a, b) => a.strikePrice - b.strikePrice);
  const pcr      = totalCEOI > 0 ? +(totalPEOI / totalCEOI).toFixed(3) : 0;
  const maxCEOI  = Math.max(...strikes.map(s => s.CE?.oi || 0), 1);
  const maxPEOI  = Math.max(...strikes.map(s => s.PE?.oi || 0), 1);

  // ATM strike
  const atm = strikes.reduce((best, s) =>
    Math.abs(s.strikePrice - underlying) < Math.abs(best.strikePrice - underlying) ? s : best,
    strikes[0] || { strikePrice: underlying }
  ).strikePrice;

  // Max Pain
  let maxPain = underlying, minPain = Infinity;
  strikes.forEach(pivot => {
    let pain = 0;
    strikes.forEach(row => {
      if (row.strikePrice < pivot.strikePrice && row.CE) pain += row.CE.oi * (pivot.strikePrice - row.strikePrice);
      if (row.strikePrice > pivot.strikePrice && row.PE) pain += row.PE.oi * (row.strikePrice - pivot.strikePrice);
    });
    if (pain < minPain) { minPain = pain; maxPain = pivot.strikePrice; }
  });

  const atmRow = strikeMap[atm];
  const atmIV  = atmRow?.CE?.iv || atmRow?.PE?.iv || 0;

  return { strikes, totalCEOI, totalPEOI, maxCEOI, maxPEOI, pcr, maxPain, atm, atmIV };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  const sym    = (req.query.symbol || 'NIFTY').toUpperCase().trim();
  const expiry = req.query.expiry || '';

  // ── 1. Upstox (primary: works reliably from Vercel IPs) ───────────────────
  if (process.env.UPSTOX_TOKEN && UPSTOX_IDX[sym]) {
    try {
      // Fetch expiry list + current index price in parallel
      const [expiries, indexData] = await Promise.all([
        getOptionExpiries(sym),
        getIndexQuotes(),
      ]);

      if (!expiries.length) throw new Error('No expiry dates returned');

      const targetExpiry = expiry || expiries[0]; // nearest if not specified
      const chainData    = await getOptionsChain(sym, targetExpiry);
      const underlying   = indexData[UPSTOX_IDX[sym]]?.last || 0;
      const normalized   = normalizeUpstoxChain(chainData, underlying);

      return res.json({
        ok: true, symbol: sym, source: 'Upstox',
        data: {
          underlying,
          ...normalized,
          expiryDates:   expiries,
          currentExpiry: targetExpiry,
          timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        }
      });
    } catch (e) {
      console.warn('[options] Upstox failed:', e.message, '— falling back to NSE');
    }
  }

  // ── 2. NSE fallback ────────────────────────────────────────────────────────
  try {
    const path = NSE_INDEX_SYMS.includes(sym)
      ? `option-chain-indices?symbol=${sym}`
      : `option-chain-equities?symbol=${encodeURIComponent(sym)}`;

    const raw      = await nseGet(path);
    const records  = raw?.records  || {};
    const filtered = raw?.filtered || {};
    const chainData = expiry
      ? (records.data || []).filter(r => r.expiryDate === expiry)
      : (filtered.data || records.data || []);

    const underlying  = safeNum(records.underlyingValue);
    const expiryDates = records.expiryDates || [];

    let totalCEOI = 0, totalPEOI = 0;
    const strikeMap = {};

    chainData.forEach(row => {
      const s = row.strikePrice;
      if (!strikeMap[s]) strikeMap[s] = { strikePrice: s, CE: null, PE: null };
      if (row.CE) {
        strikeMap[s].CE = {
          oi: safeNum(row.CE.openInterest), oiChg: safeNum(row.CE.changeinOpenInterest),
          ltp: safeNum(row.CE.lastPrice), vol: safeNum(row.CE.totalTradedVolume),
          iv: safeNum(row.CE.impliedVolatility), bid: safeNum(row.CE.bidprice), ask: safeNum(row.CE.askPrice),
        };
        totalCEOI += safeNum(row.CE.openInterest);
      }
      if (row.PE) {
        strikeMap[s].PE = {
          oi: safeNum(row.PE.openInterest), oiChg: safeNum(row.PE.changeinOpenInterest),
          ltp: safeNum(row.PE.lastPrice), vol: safeNum(row.PE.totalTradedVolume),
          iv: safeNum(row.PE.impliedVolatility), bid: safeNum(row.PE.bidprice), ask: safeNum(row.PE.askPrice),
        };
        totalPEOI += safeNum(row.PE.openInterest);
      }
    });

    const strikes  = Object.values(strikeMap).sort((a, b) => a.strikePrice - b.strikePrice);
    const pcr      = totalCEOI > 0 ? +(totalPEOI / totalCEOI).toFixed(3) : 0;
    const maxCEOI  = Math.max(...strikes.map(s => s.CE?.oi || 0), 1);
    const maxPEOI  = Math.max(...strikes.map(s => s.PE?.oi || 0), 1);

    const atm = strikes.reduce((best, s) =>
      Math.abs(s.strikePrice - underlying) < Math.abs(best.strikePrice - underlying) ? s : best,
      strikes[0] || { strikePrice: underlying }
    ).strikePrice;

    let maxPain = underlying, minPain = Infinity;
    strikes.forEach(pivot => {
      let pain = 0;
      strikes.forEach(row => {
        if (row.strikePrice < pivot.strikePrice && row.CE) pain += row.CE.oi * (pivot.strikePrice - row.strikePrice);
        if (row.strikePrice > pivot.strikePrice && row.PE) pain += row.PE.oi * (row.strikePrice - pivot.strikePrice);
      });
      if (pain < minPain) { minPain = pain; maxPain = pivot.strikePrice; }
    });

    const atmRow = strikeMap[atm];
    const atmIV  = atmRow?.CE?.iv || atmRow?.PE?.iv || 0;

    res.json({
      ok: true, symbol: sym, source: 'NSE',
      data: {
        underlying, atm, expiryDates, strikes,
        totalCEOI, totalPEOI, maxCEOI, maxPEOI,
        pcr, maxPain, atmIV,
        timestamp: records.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        currentExpiry: expiryDates[0] || '',
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false, symbol: sym, error: err.message,
      hint: 'Both Upstox and NSE options data unavailable. Try running server.js locally.',
    });
  }
};

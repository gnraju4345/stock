'use strict';
const { nseGet, cors, safeNum } = require('./_nse');

const INDEX_SYMS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  const sym    = (req.query.symbol || 'NIFTY').toUpperCase().trim();
  const expiry = req.query.expiry || '';

  try {
    const path = INDEX_SYMS.includes(sym)
      ? `option-chain-indices?symbol=${sym}`
      : `option-chain-equities?symbol=${encodeURIComponent(sym)}`;

    const raw      = await nseGet(path);
    const records  = raw?.records  || {};
    const filtered = raw?.filtered || {};
    const chainData= expiry
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

    // ATM
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
    res.status(500).json({ ok: false, symbol: sym, error: err.message,
      hint: 'NSE options data may not be available from this server. Try running server.js locally.' });
  }
};

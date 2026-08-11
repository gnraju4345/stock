'use strict';
const { getStockQuotes } = require('./_upstox');
const { nseGet, yfQuotes, cors, safeNum } = require('./_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  const symbols = (req.query.symbols || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 50);

  if (!symbols.length) return res.json({ ok: true, data: {}, count: 0 });

  let data = {};

  // 1. Try Upstox (fast, reliable, works from Vercel IPs)
  if (process.env.UPSTOX_TOKEN) {
    try {
      data = await getStockQuotes(symbols);
    } catch (e) {
      console.warn('[quotes] Upstox failed:', e.message);
    }
  }

  // 2. For any symbols Upstox missed, try NSE
  const missing = symbols.filter(s => !data[s]);
  if (missing.length) {
    const nseResults = await Promise.allSettled(
      missing.map(sym => nseGet(`quote-equity?symbol=${encodeURIComponent(sym)}`))
    );
    nseResults.forEach((r, i) => {
      const sym = missing[i];
      if (r.status === 'fulfilled' && r.value?.priceInfo) {
        const pi = r.value.priceInfo;
        data[sym] = {
          lastPrice: safeNum(pi.lastPrice),
          change:    safeNum(pi.change),
          pChange:   safeNum(pi.pChange),
          open:      safeNum(pi.open),
          high:      safeNum(pi.intraDayHighLow?.max),
          low:       safeNum(pi.intraDayHighLow?.min),
          prevClose: safeNum(pi.previousClose),
          vwap:      safeNum(pi.vwap),
          upperCP:   safeNum(pi.upperCP),
          lowerCP:   safeNum(pi.lowerCP),
          source:    'NSE',
        };
      }
    });
  }

  // 3. Bulk Yahoo Finance fallback for still-missing symbols
  const stillMissing = symbols.filter(s => !data[s]);
  if (stillMissing.length) {
    try {
      const yfData = await yfQuotes(stillMissing);
      Object.assign(data, yfData);
    } catch (e) {
      console.warn('[quotes] YF bulk fallback failed:', e.message);
    }
  }

  res.json({ ok: true, data, count: Object.keys(data).length, ts: new Date().toISOString() });
};

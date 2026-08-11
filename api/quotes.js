'use strict';
const { nseGet, yfQuotes, cors, safeNum } = require('./_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  const symbols = (req.query.symbols || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);

  if (!symbols.length) return res.json({ ok: true, data: {}, count: 0 });

  const data = {};

  // Step 1 — Try NSE for all symbols in parallel
  const nseResults = await Promise.allSettled(
    symbols.map(sym => nseGet(`quote-equity?symbol=${encodeURIComponent(sym)}`))
  );

  const needYF = [];
  nseResults.forEach((r, i) => {
    const sym = symbols[i];
    if (r.status === 'fulfilled' && r.value?.priceInfo) {
      const pi = r.value.priceInfo;
      data[sym] = {
        lastPrice:  safeNum(pi.lastPrice),
        change:     safeNum(pi.change),
        pChange:    safeNum(pi.pChange),
        open:       safeNum(pi.open),
        high:       safeNum(pi.intraDayHighLow?.max),
        low:        safeNum(pi.intraDayHighLow?.min),
        prevClose:  safeNum(pi.previousClose),
        vwap:       safeNum(pi.vwap),
        volume:     safeNum(r.value?.securityWiseDP?.quantityTraded),
        upperCP:    safeNum(pi.upperCP),
        lowerCP:    safeNum(pi.lowerCP),
        source:     'NSE',
      };
    } else {
      needYF.push(sym);
    }
  });

  // Step 2 — Bulk Yahoo Finance fallback for all symbols NSE missed
  if (needYF.length) {
    try {
      const yfData = await yfQuotes(needYF);
      Object.assign(data, yfData);
    } catch (e) {
      console.warn('[quotes] YF bulk fallback failed:', e.message);
    }
  }

  res.json({ ok: true, data, count: Object.keys(data).length, ts: new Date().toISOString() });
};

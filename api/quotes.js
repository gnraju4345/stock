'use strict';
const { nseGet, yfChart, cors, safeNum } = require('./_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  const symbols = (req.query.symbols || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);

  if (!symbols.length) return res.json({ ok: true, data: {}, count: 0 });

  // Fetch all in parallel — NSE with YF fallback per symbol
  const results = await Promise.allSettled(
    symbols.map(sym => fetchOne(sym))
  );

  const data = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) data[symbols[i]] = r.value;
  });

  res.json({ ok: true, data, count: Object.keys(data).length, ts: new Date().toISOString() });
};

async function fetchOne(sym) {
  // 1. Try NSE
  try {
    const raw = await nseGet(`quote-equity?symbol=${encodeURIComponent(sym)}`);
    const pi = raw?.priceInfo;
    if (pi) return {
      lastPrice:  safeNum(pi.lastPrice),
      change:     safeNum(pi.change),
      pChange:    safeNum(pi.pChange),
      open:       safeNum(pi.open),
      high:       safeNum(pi.intraDayHighLow?.max),
      low:        safeNum(pi.intraDayHighLow?.min),
      prevClose:  safeNum(pi.previousClose),
      vwap:       safeNum(pi.vwap),
      upperCP:    safeNum(pi.upperCP),
      lowerCP:    safeNum(pi.lowerCP),
      source:     'NSE',
    };
  } catch (_) {}

  // 2. Yahoo Finance fallback (server-side — no CORS)
  try {
    const m    = await yfChart(`${sym}.NS`);
    const prev = m.chartPreviousClose || m.regularMarketPrice;
    return {
      lastPrice: m.regularMarketPrice,
      change:    m.regularMarketPrice - prev,
      pChange:   +((m.regularMarketPrice - prev) / prev * 100).toFixed(2),
      prevClose: prev,
      vwap:      0,
      source:    'YF',
    };
  } catch (_) {}

  return null;
}

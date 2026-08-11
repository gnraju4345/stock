'use strict';
const { getIndexQuotes } = require('./_upstox');
const { nseGet, yfChart, cors, safeNum } = require('./_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  try {
    let data = {};

    // 1. Try Upstox first (most reliable from Vercel IPs)
    if (process.env.UPSTOX_TOKEN) {
      try {
        const upData = await getIndexQuotes();
        // Map Upstox keys to dashboard-expected keys
        if (upData['NIFTY50'])    data['NIFTY 50']   = { ...upData['NIFTY50'],   source: 'Upstox' };
        if (upData['BANKNIFTY'])  data['BANK NIFTY'] = { ...upData['BANKNIFTY'], source: 'Upstox' };
        if (upData['SENSEX'])     data['SENSEX']      = { ...upData['SENSEX'],    source: 'Upstox' };
      } catch (e) {
        console.warn('[indices] Upstox failed:', e.message);
      }
    }

    // 2. NSE fallback for anything Upstox missed
    const needNSE = [];
    if (!data['NIFTY 50'])   needNSE.push('NIFTY%2050');
    if (!data['BANK NIFTY']) needNSE.push('NIFTY%20BANK');

    if (needNSE.length) {
      const nseResults = await Promise.allSettled(
        needNSE.map(idx => nseGet(`equity-stockIndices?index=${idx}`))
      );

      function extractNSE(settled, want) {
        if (settled.status !== 'fulfilled') return null;
        const arr = settled.value?.data;
        if (!Array.isArray(arr)) return null;
        const row = arr.find(r => r.index === want || r.indexSymbol === want) || arr[0];
        if (!row) return null;
        return {
          last: safeNum(row.last), change: safeNum(row.change), pChange: safeNum(row.pChange),
          open: safeNum(row.open), high: safeNum(row.high), low: safeNum(row.low),
          prevClose: safeNum(row.previousClose),
          advances: safeNum(row.advances), declines: safeNum(row.declines),
          unchanged: safeNum(row.unchanged), source: 'NSE',
        };
      }

      if (!data['NIFTY 50']   && nseResults[0]) data['NIFTY 50']   = extractNSE(nseResults[0], 'NIFTY 50');
      if (!data['BANK NIFTY'] && nseResults[1]) data['BANK NIFTY'] = extractNSE(nseResults[1], 'NIFTY BANK');
    }

    // 3. Yahoo Finance last resort
    const yfMap = { 'NIFTY 50': '^NSEI', 'BANK NIFTY': '^NSEBANK', 'SENSEX': '^BSESN' };
    await Promise.allSettled(
      Object.entries(yfMap)
        .filter(([label]) => !data[label])
        .map(async ([label, yfSym]) => {
          try {
            const m = await yfChart(yfSym);
            const prev = m.chartPreviousClose || m.regularMarketPrice;
            data[label] = {
              last: m.regularMarketPrice,
              change: m.regularMarketPrice - prev,
              pChange: +((m.regularMarketPrice - prev) / prev * 100).toFixed(2),
              prevClose: prev, source: 'YF',
            };
          } catch (_) {}
        })
    );

    res.json({ ok: true, data, ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

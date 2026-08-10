'use strict';
const { nseGet, yfChart, cors, safeNum } = require('./_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  try {
    // Try NSE first
    const [n50, nbank, mid] = await Promise.allSettled([
      nseGet('equity-stockIndices?index=NIFTY%2050'),
      nseGet('equity-stockIndices?index=NIFTY%20BANK'),
      nseGet('equity-stockIndices?index=NIFTY%20MIDCAP%2050'),
    ]);

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
        source: 'NSE',
      };
    }

    const data = {
      'NIFTY 50':   extractNSE(n50,   'NIFTY 50'),
      'BANK NIFTY': extractNSE(nbank, 'NIFTY BANK'),
      'MIDCAP 50':  extractNSE(mid,   'NIFTY MIDCAP 50'),
    };

    // Yahoo Finance fallback for any failed index
    const yfMap = { 'NIFTY 50': '^NSEI', 'BANK NIFTY': '^NSEBANK', 'MIDCAP 50': '^CNXMIDCAP' };
    await Promise.allSettled(
      Object.entries(data)
        .filter(([, v]) => !v)
        .map(async ([label]) => {
          try {
            const m = await yfChart(yfMap[label]);
            const prev = m.chartPreviousClose || m.regularMarketPrice;
            data[label] = {
              last: m.regularMarketPrice,
              change: m.regularMarketPrice - prev,
              pChange: +((m.regularMarketPrice - prev) / prev * 100).toFixed(2),
              prevClose: prev,
              source: 'YF',
            };
          } catch (_) {}
        })
    );

    res.json({ ok: true, data, ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

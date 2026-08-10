'use strict';
const { nseGet, yfChart, cors, safeNum } = require('../_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  const sym = (req.query.symbol || '').toUpperCase().trim();
  if (!sym) return res.status(400).json({ ok: false, error: 'symbol required' });

  // 1. Try NSE
  try {
    const raw = await nseGet(`quote-equity?symbol=${encodeURIComponent(sym)}`);
    const pi = raw?.priceInfo;
    const si = raw?.securityInfo;
    const ii = raw?.industryInfo;
    const md = raw?.metadata;
    if (pi) return res.json({
      ok: true, symbol: sym, source: 'NSE',
      data: {
        lastPrice:    safeNum(pi.lastPrice),
        change:       safeNum(pi.change),
        pChange:      safeNum(pi.pChange),
        open:         safeNum(pi.open),
        high:         safeNum(pi.intraDayHighLow?.max),
        low:          safeNum(pi.intraDayHighLow?.min),
        prevClose:    safeNum(pi.previousClose),
        vwap:         safeNum(pi.vwap),
        week52High:   safeNum(pi.weekHighLow?.max),
        week52Low:    safeNum(pi.weekHighLow?.min),
        upperCircuit: safeNum(pi.upperCP),
        lowerCircuit: safeNum(pi.lowerCP),
        pe:           safeNum(si?.pdSymbolPe),
        eps:          safeNum(si?.pdEPS),
        sectorPe:     safeNum(si?.pdSectorPe),
        sector:       ii?.sector,
        industry:     ii?.industry,
        companyName:  md?.companyName,
      }
    });
  } catch (_) {}

  // 2. Yahoo Finance fallback
  try {
    const m    = await yfChart(`${sym}.NS`);
    const prev = m.chartPreviousClose || m.regularMarketPrice;
    return res.json({
      ok: true, symbol: sym, source: 'YF',
      data: {
        lastPrice: m.regularMarketPrice,
        change:    m.regularMarketPrice - prev,
        pChange:   +((m.regularMarketPrice - prev) / prev * 100).toFixed(2),
        prevClose: prev,
      }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, symbol: sym, error: err.message });
  }
};

'use strict';
const { getStockQuotes } = require('./_upstox');
const { nseGet, yfChart, cors, safeNum } = require('./_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  const sym = (req.query.symbol || '').toUpperCase().trim();
  if (!sym) return res.status(400).json({ ok: false, error: 'symbol required' });

  let priceData   = null;
  let fundamentals = {};
  let source = 'NSE';

  // 1. Try Upstox for real-time price data (fast & reliable from Vercel IPs)
  if (process.env.UPSTOX_TOKEN) {
    try {
      const up = await getStockQuotes([sym]);
      if (up[sym]) {
        priceData = up[sym];
        source    = 'Upstox';
      }
    } catch (e) {
      console.warn('[quote] Upstox failed:', e.message);
    }
  }

  // 2. NSE for fundamentals (PE, EPS, sector, week52, circuits) and as price fallback
  try {
    const raw = await nseGet(`quote-equity?symbol=${encodeURIComponent(sym)}`);
    const pi  = raw?.priceInfo;
    const si  = raw?.securityInfo;
    const ii  = raw?.industryInfo;
    const md  = raw?.metadata;

    if (pi) {
      // Always pull fundamentals from NSE — Upstox doesn't provide these
      fundamentals = {
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
      };

      // Use NSE price data only if Upstox didn't provide it
      if (!priceData) {
        priceData = {
          lastPrice: safeNum(pi.lastPrice),
          change:    safeNum(pi.change),
          pChange:   safeNum(pi.pChange),
          open:      safeNum(pi.open),
          high:      safeNum(pi.intraDayHighLow?.max),
          low:       safeNum(pi.intraDayHighLow?.min),
          prevClose: safeNum(pi.previousClose),
          vwap:      safeNum(pi.vwap),
        };
        source = 'NSE';
      }
    }
  } catch (_) {}

  // If we have price data from either Upstox or NSE, return with merged fundamentals
  if (priceData) {
    return res.json({
      ok: true, symbol: sym, source,
      data: { ...priceData, ...fundamentals },
    });
  }

  // 3. Yahoo Finance last resort (price only — no fundamentals)
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

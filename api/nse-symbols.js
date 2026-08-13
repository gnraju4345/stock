'use strict';
// Serves NSE symbol lists for the watchlist autocomplete and "Load from Market" presets.
// Returns Nifty50, Nifty100, and Nifty500 symbol lists from NSE India.
// Aggressively cached (1 hour) since composition rarely changes intraday.
const { nseGet, cors } = require('./_nse');

// Bundled fallback for the most common 100 NSE symbols (used if NSE API is unavailable)
const FALLBACK = [
  'ABB','ADANIENT','ADANIGREEN','ADANIPORTS','APOLLOHOSP','ASIANPAINT','AUBANK',
  'AXISBANK','BAJAJFINSV','BAJFINANCE','BAJAJHLDNG','BANKBARODA','BEL','BPCL',
  'BHARTIARTL','BOSCHLTD','BRITANNIA','CANBK','CHOLAFIN','CIPLA','COALINDIA',
  'COLPAL','DABUR','DELHIVERY','DIVISLAB','DIXON','DRREDDY','EICHERMOT',
  'ESCORTS','FEDERALBNK','GAIL','GODREJCP','GRASIM','HAL','HAVELLS',
  'HCLTECH','HDFCBANK','HDFCLIFE','HEROMOTOCO','HINDALCO','HINDUNILVR',
  'ICICIBANK','ICICIGI','ICICIPRULI','IEX','IGL','INDHOTEL','INFY',
  'IOC','IPCALAB','IRCTC','ITC','JSWSTEEL','JUBLFOOD','KOTAKBANK',
  'LICI','LT','LTIM','LTTS','LUPIN','M&M','MARICO','MARUTI',
  'MCDOWELL-N','MOTHERSON','MPHASIS','MRF','MUTHOOTFIN','NAVINFLUOR',
  'NESTLEIND','NTPC','NYKAA','OBEROIRLTY','OFSS','ONGC','PAGEIND',
  'PERSISTENT','PIIND','POLICYBZR','POLYCAB','POWERGRID','PFC','RVNL',
  'RELIANCE','SAIL','SBICARD','SBILIFE','SBIN','SRF','SUNPHARMA',
  'SUPREMEIND','TATACONSUM','TATAELXSI','TATAMOTORS','TATAPOWER','TATASTEEL',
  'TCS','TECHM','TITAN','TRENT','ULTRACEMCO','UPL','VEDL','VOLTAS',
  'WIPRO','ZOMATO','ZYDUSLIFE',
];

// In-memory cache (warm across serverless cold starts during same invocation lifetime)
let _cache = null;
let _cacheTs = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchIndex(indexName) {
  try {
    const data = await nseGet(`equity-stockIndices?index=${encodeURIComponent(indexName)}`);
    return (data?.data || [])
      .filter(r => r.symbol && r.symbol !== indexName) // skip the index row itself
      .map(r => ({ symbol: r.symbol, name: r.meta?.companyName || r.symbol }));
  } catch (_) {
    return [];
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  // Set long cache header — composition is stable
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  // Serve from in-memory cache if fresh
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) {
    return res.json(_cache);
  }

  // Fetch Nifty 50, 100, 500 in parallel
  const [n50, n100, n500] = await Promise.allSettled([
    fetchIndex('NIFTY 50'),
    fetchIndex('NIFTY 100'),
    fetchIndex('NIFTY 500'),
  ]);

  const nifty50  = n50.status  === 'fulfilled' ? n50.value  : [];
  const nifty100 = n100.status === 'fulfilled' ? n100.value : [];
  const nifty500 = n500.status === 'fulfilled' ? n500.value : [];

  // Build a merged list for autocomplete (de-duped, sorted)
  const symMap = new Map();
  [...nifty500, ...nifty100, ...nifty50].forEach(s => {
    if (!symMap.has(s.symbol)) symMap.set(s.symbol, s);
  });
  const all = [...symMap.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));

  // If NSE was unavailable for all, return fallback with minimal shape
  const n50syms  = nifty50.map(s => s.symbol);
  const n100syms = nifty100.map(s => s.symbol);
  const n500syms = nifty500.map(s => s.symbol);

  const useFallback = all.length === 0;
  const response = {
    ok: true,
    source: useFallback ? 'fallback' : 'NSE',
    presets: {
      nifty50:  useFallback ? FALLBACK.slice(0, 50) : n50syms,
      nifty100: useFallback ? FALLBACK.slice(0, 100) : n100syms,
      nifty500: useFallback ? FALLBACK : n500syms,
    },
    all: useFallback
      ? FALLBACK.map(s => ({ symbol: s, name: s }))
      : all,
    ts: new Date().toISOString(),
  };

  _cache   = response;
  _cacheTs = Date.now();

  res.json(response);
};

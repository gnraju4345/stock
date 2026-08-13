'use strict';
/* ── Upstox API helper for serverless functions ── */

const fetch = require('node-fetch');

const BASE = 'https://api.upstox.com/v2';

function getToken() {
  return process.env.UPSTOX_TOKEN || '';
}

function upstoxHeaders() {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'Accept': 'application/json',
  };
}

/* ── Index symbol → Upstox instrument_key ── */
const INDEX_KEYS = {
  'NIFTY':      'NSE_INDEX|Nifty 50',
  'BANKNIFTY':  'NSE_INDEX|Nifty Bank',
  'FINNIFTY':   'NSE_INDEX|Nifty Fin Service',
  'MIDCPNIFTY': 'NSE_INDEX|NIFTY MID SELECT',
  'SENSEX':     'BSE_INDEX|SENSEX',
};

/* ── Symbol → Upstox instrument_key map (NSE_EQ | ISIN) ── */
const SYMBOL_MAP = {
  'ABB':         'NSE_EQ|INE117A01022',
  'ADANIENT':    'NSE_EQ|INE423A01024',
  'ADANIPORTS':  'NSE_EQ|INE742F01042',
  'APOLLOHOSP':  'NSE_EQ|INE437A01024',
  'ASIANPAINT':  'NSE_EQ|INE021A01026',
  'AXISBANK':    'NSE_EQ|INE238A01034',
  'BAJAJFINSV':  'NSE_EQ|INE918I01026',
  'BAJFINANCE':  'NSE_EQ|INE296A01032',
  'BHARTIARTL':  'NSE_EQ|INE397D01024',
  'BPCL':        'NSE_EQ|INE029A01011',
  'BRITANNIA':   'NSE_EQ|INE216A01030',
  'CIPLA':       'NSE_EQ|INE059A01026',
  'COALINDIA':   'NSE_EQ|INE522F01014',
  'DIVISLAB':    'NSE_EQ|INE361B01024',
  'DIXONTECH':   'NSE_EQ|INE935N01012',
  'DRREDDY':     'NSE_EQ|INE089A01031',
  'EICHERMOT':   'NSE_EQ|INE066A01021',
  'GRASIM':      'NSE_EQ|INE047A01021',
  'HCLTECH':     'NSE_EQ|INE860A01027',
  'HDFCBANK':    'NSE_EQ|INE040A01034',
  'HDFCLIFE':    'NSE_EQ|INE795G01014',
  'HEROMOTOCO':  'NSE_EQ|INE158A01026',
  'HINDALCO':    'NSE_EQ|INE038A01020',
  'HINDUNILVR':  'NSE_EQ|INE030A01027',
  'ICICIBANK':   'NSE_EQ|INE090A01021',
  'INDUSINDBK':  'NSE_EQ|INE095A01012',
  'INFY':        'NSE_EQ|INE009A01021',
  'ITC':         'NSE_EQ|INE154A01025',
  'JSWSTEEL':    'NSE_EQ|INE019A01038',
  'KOTAKBANK':   'NSE_EQ|INE237A01036',
  'LT':          'NSE_EQ|INE018A01030',
  'LTIM':        'NSE_EQ|INE214T01019',
  'M&M':         'NSE_EQ|INE101A01026',
  'MARICO':      'NSE_EQ|INE196A01026',
  'MARUTI':      'NSE_EQ|INE585B01010',
  'MOTHERSON':   'NSE_EQ|INE775A01035',
  'NESTLEIND':   'NSE_EQ|INE239A01024',
  'NTPC':        'NSE_EQ|INE733E01010',
  'ONGC':        'NSE_EQ|INE213A01029',
  'POLYCAB':     'NSE_EQ|INE455K01017',
  'POWERGRID':   'NSE_EQ|INE752E01010',
  'RELIANCE':    'NSE_EQ|INE002A01018',
  'SBILIFE':     'NSE_EQ|INE123W01016',
  'SBIN':        'NSE_EQ|INE062A01020',
  'SUNPHARMA':   'NSE_EQ|INE044A01036',
  'TATACONSUM':  'NSE_EQ|INE192A01025',
  'TATAMOTORS':  'NSE_EQ|INE306A01021',
  'TATASTEEL':   'NSE_EQ|INE081A01020',
  'TCS':         'NSE_EQ|INE467B01029',
  'TECHM':       'NSE_EQ|INE669C01036',
  'TITAN':       'NSE_EQ|INE280A01028',
  'ULTRACEMCO':  'NSE_EQ|INE481G01011',
  'UPL':         'NSE_EQ|INE628A01036',
  'WIPRO':       'NSE_EQ|INE075A01022',
};

/* ── Reverse map: instrument_key → symbol ── */
const KEY_TO_SYM = Object.fromEntries(
  Object.entries(SYMBOL_MAP).map(([s, k]) => [k.split('|')[1], s])
);

/**
 * Fetch bulk market quotes for up to 500 instrument keys.
 * Returns: { [instrumentKey]: { last_price, net_change, ohlc, volume, ... } }
 */
async function upstoxQuotes(instrumentKeys) {
  if (!instrumentKeys.length) return {};
  const token = getToken();
  if (!token) throw new Error('UPSTOX_TOKEN not set');

  // Upstox allows up to 500 keys per request
  const keyStr = instrumentKeys.map(k => encodeURIComponent(k)).join(',');
  const url = `${BASE}/market-quote/quotes?instrument_key=${keyStr}`;
  const resp = await fetch(url, { headers: upstoxHeaders(), timeout: 12000 });
  if (!resp.ok) throw new Error(`Upstox HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.status !== 'success') throw new Error(json.errors?.[0]?.message || 'Upstox error');
  return json.data || {};
}

/**
 * Fetch stock quotes for NSE symbols.
 * Returns: { [SYMBOL]: { lastPrice, change, pChange, open, high, low, prevClose, volume, source } }
 */
async function getStockQuotes(symbols) {
  const known   = symbols.filter(s => SYMBOL_MAP[s]);
  const unknown = symbols.filter(s => !SYMBOL_MAP[s]);

  if (!known.length) return {};

  const keys   = known.map(s => SYMBOL_MAP[s]);
  const rawData = await upstoxQuotes(keys);

  const result = {};
  for (const [rawKey, v] of Object.entries(rawData)) {
    // rawKey is like "NSE_EQ:INFY" — find which ISIN key it maps to
    const isin = rawKey.split(':')[1];
    const sym  = KEY_TO_SYM[isin] || rawKey.split(':')[1];
    if (!sym) continue;
    const prev = v.ohlc?.close || v.last_price;
    result[sym] = {
      lastPrice:  v.last_price    || 0,
      change:     v.net_change    || 0,
      pChange:    prev ? +((v.net_change / prev) * 100).toFixed(2) : 0,
      open:       v.ohlc?.open   || 0,
      high:       v.ohlc?.high   || 0,
      low:        v.ohlc?.low    || 0,
      prevClose:  prev            || 0,
      vwap:       v.average_price || 0,
      volume:     v.volume        || 0,
      lowerCP:    v.lower_circuit_limit || 0,
      upperCP:    v.upper_circuit_limit || 0,
      source:     'Upstox',
    };
  }

  if (unknown.length) console.warn('[Upstox] Unknown symbols:', unknown);
  return result;
}

/**
 * Fetch index quotes.
 * Returns: { NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX }
 */
async function getIndexQuotes() {
  const keys = [
    'NSE_INDEX|Nifty 50',
    'NSE_INDEX|Nifty Bank',
    'NSE_INDEX|Nifty Fin Service',
    'NSE_INDEX|NIFTY MID SELECT',
    'BSE_INDEX|SENSEX',
  ];
  const rawData = await upstoxQuotes(keys);

  const map = {
    'NSE_INDEX:Nifty 50':         'NIFTY50',
    'NSE_INDEX:Nifty Bank':       'BANKNIFTY',
    'NSE_INDEX:Nifty Fin Service': 'FINNIFTY',
    'NSE_INDEX:NIFTY MID SELECT':  'MIDCPNIFTY',
    'BSE_INDEX:SENSEX':            'SENSEX',
  };

  const result = {};
  for (const [rawKey, v] of Object.entries(rawData)) {
    const name = map[rawKey];
    if (!name) continue;
    const prev = v.ohlc?.close || v.last_price;
    result[name] = {
      last:      v.last_price  || 0,
      change:    v.net_change  || 0,
      pChange:   prev ? +((v.net_change / prev) * 100).toFixed(2) : 0,
      open:      v.ohlc?.open || 0,
      high:      v.ohlc?.high || 0,
      low:       v.ohlc?.low  || 0,
      prevClose: prev          || 0,
    };
  }
  return result;
}

/**
 * Get available option expiry dates for a symbol (index or equity).
 * Returns: string[] of YYYY-MM-DD dates sorted ascending (nearest first).
 */
async function getOptionExpiries(symbol) {
  const instrKey = INDEX_KEYS[symbol] || SYMBOL_MAP[symbol];
  if (!instrKey) throw new Error(`No instrument key for ${symbol}`);
  const token = getToken();
  if (!token) throw new Error('UPSTOX_TOKEN not set');

  const url = `${BASE}/option/contract?instrument_key=${encodeURIComponent(instrKey)}`;
  const resp = await fetch(url, { headers: upstoxHeaders(), timeout: 10000 });
  if (!resp.ok) throw new Error(`Upstox HTTP ${resp.status} on option/contract`);
  const json = await resp.json();
  if (json.status !== 'success') throw new Error(json.errors?.[0]?.message || 'Upstox option/contract error');

  // Extract unique expiry dates from contracts list
  const dates = [...new Set((json.data || []).map(c => c.expiry))]
    .filter(Boolean)
    .sort(); // YYYY-MM-DD sorts lexicographically = chronologically
  return dates;
}

/**
 * Fetch raw options chain from Upstox for a given symbol + expiry date.
 * @param {string} symbol  - e.g. 'NIFTY', 'BANKNIFTY', 'INFY'
 * @param {string} expiryDate - YYYY-MM-DD format
 * Returns: raw Upstox option chain array
 */
async function getOptionsChain(symbol, expiryDate) {
  const instrKey = INDEX_KEYS[symbol] || SYMBOL_MAP[symbol];
  if (!instrKey) throw new Error(`No instrument key for ${symbol}`);
  const token = getToken();
  if (!token) throw new Error('UPSTOX_TOKEN not set');

  const url = `${BASE}/option/chain?instrument_key=${encodeURIComponent(instrKey)}&expiry_date=${expiryDate}`;
  const resp = await fetch(url, { headers: upstoxHeaders(), timeout: 12000 });
  if (!resp.ok) throw new Error(`Upstox HTTP ${resp.status} on option/chain`);
  const json = await resp.json();
  if (json.status !== 'success') throw new Error(json.errors?.[0]?.message || 'Upstox option/chain error');

  return json.data || [];
}

module.exports = {
  getStockQuotes,
  getIndexQuotes,
  getOptionExpiries,
  getOptionsChain,
  upstoxQuotes,
  SYMBOL_MAP,
  INDEX_KEYS,
  getToken,
};

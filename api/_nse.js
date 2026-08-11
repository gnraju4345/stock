'use strict';
/* ── Shared NSE + Yahoo Finance helper for all /api/* serverless functions ── */

const fetch = require('node-fetch');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BASE_HDR = {
  'User-Agent':      UA,
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection':      'keep-alive',
};

/* ── Module-level cookie cache (persists across warm invocations) ── */
let NSE_COOKIE = '';
let COOKIE_TS  = 0;
const COOKIE_TTL = 4 * 60 * 1000; // 4 minutes

function parseCookies(raw = []) {
  const jar = {};
  raw.forEach(c => {
    const kv = c.split(';')[0];
    const eq = kv.indexOf('=');
    if (eq > 0) jar[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  });
  return jar;
}

function jarStr(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function refreshNSECookie() {
  let jar = {};
  try {
    // Step 1 — homepage (gets nsit, nseappid, etc.)
    const r1 = await fetch('https://www.nseindia.com/', {
      headers: { ...BASE_HDR, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      redirect: 'follow', timeout: 8000,
    });
    jar = { ...jar, ...parseCookies(r1.headers.raw()['set-cookie'] || []) };

    await new Promise(r => setTimeout(r, 500));

    // Step 2 — live market page (refreshes session)
    const r2 = await fetch('https://www.nseindia.com/market-data/live-equity-market', {
      headers: { ...BASE_HDR, Accept: 'text/html', Referer: 'https://www.nseindia.com/', Cookie: jarStr(jar) },
      redirect: 'follow', timeout: 8000,
    });
    jar = { ...jar, ...parseCookies(r2.headers.raw()['set-cookie'] || []) };

    await new Promise(r => setTimeout(r, 300));

    // Step 3 — option chain page (needed for options API to work reliably)
    const r3 = await fetch('https://www.nseindia.com/option-chain', {
      headers: { ...BASE_HDR, Accept: 'text/html', Referer: 'https://www.nseindia.com/', Cookie: jarStr(jar) },
      redirect: 'follow', timeout: 8000,
    });
    jar = { ...jar, ...parseCookies(r3.headers.raw()['set-cookie'] || []) };

    NSE_COOKIE = jarStr(jar);
    COOKIE_TS  = Date.now();
    return true;
  } catch (e) {
    console.warn('[NSE helper] cookie refresh failed:', e.message);
    return false;
  }
}

async function nseGet(path, retried = false) {
  if (!NSE_COOKIE || Date.now() - COOKIE_TS > COOKIE_TTL) await refreshNSECookie();
  const url  = `https://www.nseindia.com/api/${path}`;
  const resp = await fetch(url, {
    headers: { ...BASE_HDR, Accept: 'application/json, */*', Referer: 'https://www.nseindia.com/', Cookie: NSE_COOKIE },
    timeout: 8000,
  });
  if ((resp.status === 401 || resp.status === 403 || resp.status === 404) && !retried) {
    await refreshNSECookie();
    return nseGet(path, true);
  }
  if (!resp.ok) throw new Error(`NSE HTTP ${resp.status} on ${path}`);
  return resp.json();
}

/* ── Yahoo Finance fallback (server-side — no CORS issues) ── */
async function yfChart(yfSym, range = '2d', interval = '1d') {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSym)}?interval=${interval}&range=${range}&includePrePost=false`;
  const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, timeout: 8000 });
  if (!resp.ok) throw new Error(`YF HTTP ${resp.status}`);
  const json = await resp.json();
  if (json?.chart?.error) throw new Error(json.chart.error.description);
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('No YF meta');
  return meta;
}

/* ── CORS headers helper ── */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=15');
}

function safeNum(v) { return typeof v === 'number' ? v : parseFloat(v) || 0; }

module.exports = { nseGet, yfChart, cors, safeNum, refreshNSECookie };

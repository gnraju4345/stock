'use strict';
// NOTE: No Upstox equivalent exists for market-wide gainers/losers screeners.
// NSE India is the only source. We make each call independently so one failure
// doesn't block the others, and always return a well-formed response.
const { nseGet, cors } = require('./_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  const [gainers, losers, active] = await Promise.allSettled([
    nseGet('live-analysis-variations?index=gainers&limit=10&aType=PercPriceGainer'),
    nseGet('live-analysis-variations?index=loosers&limit=10&aType=PercPriceLooser'),
    nseGet('live-analysis-volume?index=NIFTY&limit=10'),
  ]);

  const errors = [];
  if (gainers.status === 'rejected') errors.push(`gainers: ${gainers.reason?.message}`);
  if (losers.status  === 'rejected') errors.push(`losers: ${losers.reason?.message}`);
  if (active.status  === 'rejected') errors.push(`active: ${active.reason?.message}`);

  res.json({
    ok:     errors.length === 0,
    source: 'NSE',
    data: {
      gainers: gainers.status === 'fulfilled' ? (gainers.value?.NIFTY?.data || gainers.value?.data || []) : [],
      losers:  losers.status  === 'fulfilled' ? (losers.value?.NIFTY?.data  || losers.value?.data  || []) : [],
      active:  active.status  === 'fulfilled' ? (active.value?.data          || []) : [],
    },
    ...(errors.length ? { warnings: errors } : {}),
    ts: new Date().toISOString(),
  });
};

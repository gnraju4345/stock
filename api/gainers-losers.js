'use strict';
const { nseGet, cors } = require('./_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  try {
    const [gainers, losers, active] = await Promise.allSettled([
      nseGet('live-analysis-variations?index=gainers&limit=10&aType=PercPriceGainer'),
      nseGet('live-analysis-variations?index=loosers&limit=10&aType=PercPriceLooser'),
      nseGet('live-analysis-volume?index=NIFTY&limit=10'),
    ]);

    res.json({
      ok: true,
      data: {
        gainers: gainers.status === 'fulfilled' ? gainers.value?.NIFTY?.data || [] : [],
        losers:  losers.status  === 'fulfilled' ? losers.value?.NIFTY?.data  || [] : [],
        active:  active.status  === 'fulfilled' ? active.value?.data          || [] : [],
      },
      ts: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

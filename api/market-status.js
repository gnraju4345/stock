'use strict';
const { nseGet, cors } = require('./_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);
  try {
    const data = await nseGet('marketStatus');
    const states = data?.marketStatus?.marketState || [];
    const eq = states.find(s => s.market === 'Capital Market') || states[0];
    res.json({ ok: true, data: { state: eq?.marketStatus || 'Unknown', tradeDate: eq?.tradeDate, raw: states } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

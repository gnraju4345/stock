'use strict';
const { nseGet, cors } = require('./_nse');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);

  try {
    const data = await nseGet('fiidiiTradeReact');
    res.json({ ok: true, data, ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message,
      hint: 'FII/DII data may not be available during non-trading hours.' });
  }
};

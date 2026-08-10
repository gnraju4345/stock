'use strict';
const { cors } = require('./_nse');
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(200).end(); }
  cors(res);
  res.json({ ok: true, server: 'Kensho NSE Proxy', version: '2.0', ts: new Date().toISOString() });
};

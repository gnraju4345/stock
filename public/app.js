/* ============================================================
   KENSHO MOMENTUM DASHBOARD — app.js
   Yahoo Finance Live Data Integration (15-min delayed)
   ============================================================ */

/* ── YAHOO FINANCE CONFIG ────────────────────────────────── */
const YF = {
  // ✅ Working CORS proxy (allorigins.win) + Yahoo Finance chart API
  // The quote batch API is now Unauthorized; chart API still works per-symbol
  PROXY: 'https://api.allorigins.win/raw?url=',
  CHART: 'https://query2.finance.yahoo.com/v8/finance/chart/',

  // NSE Indices (Yahoo Finance symbols)
  INDICES: {
    'NIFTY 50':   '^NSEI',
    'BANK NIFTY': '^NSEBANK',
    'SENSEX':     '^BSESN',
  },

  // NSE Stock Symbols → Yahoo Finance adds .NS suffix
  STOCKS: [
    'INFY','TCS','TITAN','LTIM','HCLTECH','ABB',
    'MARICO','DIXON','MOTHERSON','POLYCAB',
    'HAL','TATAPOWER','RVNL','PFC','TRENT',
    'SUNPHARMA','DRREDDY','CIPLA','COALINDIA',
    'NTPC','ICICIBANK','HDFCBANK','RELIANCE','WIPRO',
    'BDL','POWERGRID','IRFC','ADANIGREEN',
  ],

  BATCH_SIZE:  4,    // fetch N symbols in parallel
  BATCH_DELAY: 400,  // ms between batches (rate limit safety)
  REFRESH_MS:  90000,// auto-refresh every 90s
};

/* State */
const LIVE = {
  quotes:      {},   // sym → { price, change, changePct, volume, prevClose, name }
  indices:     {},   // label → { price, change, changePct }
  lastUpdated: null,
  isLoading:   false,
  fetchFailed: false,
  refreshTimer: null,
};

/* ── SAMPLE / FALLBACK DATA ──────────────────────────────── */
const DATA = {
  momentumStocks: [
    { sym:'INFY',      name:'Infosys Ltd',                  sector:'IT',               industry:'Software',            vol:2.4, score:92, setup:'Breakout',     signals:['Intraday','Swing'],          support:1790, entry:1845, sl:1775, t1:1920, t2:1980, rr:2.8 },
    { sym:'TCS',       name:'Tata Consultancy Services',    sector:'IT',               industry:'IT Services',          vol:1.8, score:88, setup:'Continuation', signals:['Swing','Positional'],        support:4200, entry:4315, sl:4150, t1:4500, t2:4620, rr:2.2 },
    { sym:'TITAN',     name:'Titan Company Ltd',            sector:'Consumer',          industry:'Jewelry',              vol:3.1, score:85, setup:'Retest',        signals:['Swing'],                     support:3580, entry:3600, sl:3540, t1:3750, t2:3850, rr:2.5 },
    { sym:'LTIM',      name:'LTIMindtree Ltd',              sector:'IT',               industry:'IT Consulting',        vol:2.0, score:79, setup:'Breakout',     signals:['Intraday','Swing'],          support:5680, entry:5830, sl:5620, t1:6100, t2:6280, rr:2.0 },
    { sym:'HCLTECH',   name:'HCL Technologies',             sector:'IT',               industry:'Software',             vol:1.6, score:74, setup:'Momentum',     signals:['Intraday'],                  support:1630, entry:1680, sl:1610, t1:1760, t2:1820, rr:1.8 },
    { sym:'ABB',       name:'ABB India Ltd',                sector:'Capital Goods',    industry:'Electrical Equipment', vol:2.9, score:71, setup:'Breakout',     signals:['Swing','Positional'],        support:6650, entry:6850, sl:6580, t1:7200, t2:7450, rr:2.4 },
    { sym:'MARICO',    name:'Marico Ltd',                   sector:'FMCG',             industry:'Personal Care',        vol:1.4, score:68, setup:'Continuation', signals:['Positional'],                support:660,  entry:684,  sl:648,  t1:720,  t2:748,  rr:2.1 },
    { sym:'DIXON',     name:'Dixon Technologies',           sector:'Consumer Elec.',   industry:'Electronics Mfg',      vol:4.2, score:95, setup:'Breakout',     signals:['Intraday','Swing','Positional'], support:14200, entry:14850, sl:13900, t1:15800, t2:16500, rr:2.3 },
    { sym:'MOTHERSON', name:'Samvardhana Motherson',        sector:'Auto Ancillary',   industry:'Auto Components',      vol:2.7, score:76, setup:'Momentum',     signals:['Swing'],                     support:170,  entry:179,  sl:166,  t1:195,  t2:205,  rr:1.9 },
    { sym:'POLYCAB',   name:'Polycab India Ltd',            sector:'Capital Goods',    industry:'Cables & Wires',       vol:3.3, score:83, setup:'Breakout',     signals:['Swing','Positional'],        support:5950, entry:6130, sl:5880, t1:6500, t2:6750, rr:2.1 },
  ],

  overviewSectors: [
    { name:'IT · Technology',    pct:'+2.84%', w:'82%', cls:'green' },
    { name:'FMCG · Consumer',    pct:'+1.95%', w:'68%', cls:'green' },
    { name:'Capital Goods',      pct:'+1.62%', w:'55%', cls:'green' },
    { name:'Pharma · Healthcare',pct:'+0.91%', w:'44%', cls:'amber' },
    { name:'PSU Banks',          pct:'-0.34%', w:'28%', cls:'red'   },
  ],

  overviewAlerts: [
    { cls:'green-alert',  type:'Breakout', time:'10:32 AM', sym:'INFY',    desc:'Crossed resistance on strong volume.' },
    { cls:'orange-alert', type:'Retest',   time:'11:15 AM', sym:'TITAN',   desc:'Retesting 3,580 breakout level. Swing opportunity.' },
    { cls:'blue-alert',   type:'Momentum', time:'12:44 PM', sym:'HCLTECH', desc:'IT sector strength. Volume 2.4x average.' },
    { cls:'green-alert',  type:'Breakout', time:'2:10 PM',  sym:'ABB',     desc:'Multi-week consolidation breakout.' },
  ],

  overviewThemes: [
    { label:'🤖 AI & Data Centers', cls:'hot' },
    { label:'⚡ Power & Energy',    cls:'hot' },
    { label:'🛡️ Defence',           cls:'warm' },
    { label:'📡 Telecom Infra',     cls:'warm' },
    { label:'🚂 Railways',          cls:'warm' },
    { label:'💊 Pharma Export',     cls:'neutral' },
    { label:'🏦 NBFC',              cls:'neutral' },
    { label:'🏗️ Real Estate',       cls:'cool' },
  ],

  heatmapData: [
    { sector:'IT',       pct:2.84,  adv:48 },
    { sector:'Defence',  pct:1.84,  adv:52 },
    { sector:'FMCG',     pct:1.95,  adv:62 },
    { sector:'Cap Goods',pct:1.62,  adv:55 },
    { sector:'Energy',   pct:1.28,  adv:44 },
    { sector:'Telecom',  pct:0.92,  adv:35 },
    { sector:'Pharma',   pct:0.91,  adv:40 },
    { sector:'Realty',   pct:0.58,  adv:38 },
    { sector:'Metals',   pct:0.74,  adv:30 },
    { sector:'Auto',     pct:-0.18, adv:25 },
    { sector:'PSU Bank', pct:-0.34, adv:22 },
    { sector:'Oil & Gas',pct:-0.52, adv:18 },
  ],

  sectors: [
    { name:'IT - Technology',        pct1d:2.84, pct7d:5.2,  pct30d:12.4, adv:48, dec:12, flow:'Inflow',        signals:14, theme:'Digital India'   },
    { name:'FMCG - Consumer Goods',  pct1d:1.95, pct7d:3.8,  pct30d:7.1,  adv:62, dec:18, flow:'Inflow',        signals:8,  theme:'Rural Recovery'  },
    { name:'Capital Goods',          pct1d:1.62, pct7d:4.1,  pct30d:9.8,  adv:55, dec:20, flow:'Inflow',        signals:11, theme:'Capex Cycle'      },
    { name:'Pharma - Healthcare',    pct1d:0.91, pct7d:2.4,  pct30d:5.2,  adv:40, dec:25, flow:'Neutral',       signals:6,  theme:'Export Growth'   },
    { name:'Metals & Mining',        pct1d:0.74, pct7d:1.2,  pct30d:-2.8, adv:30, dec:35, flow:'Outflow',       signals:4,  theme:'-'               },
    { name:'Banking - PSU',          pct1d:-0.34,pct7d:-1.1, pct30d:-3.4, adv:22, dec:40, flow:'Outflow',       signals:2,  theme:'-'               },
    { name:'Realty - Real Estate',   pct1d:0.58, pct7d:2.8,  pct30d:6.4,  adv:38, dec:28, flow:'Neutral',       signals:5,  theme:'Infrastructure'  },
    { name:'Energy - Power',         pct1d:1.28, pct7d:3.6,  pct30d:14.2, adv:44, dec:16, flow:'Inflow',        signals:10, theme:'Clean Energy'    },
    { name:'Defence - Aerospace',    pct1d:1.84, pct7d:6.2,  pct30d:18.6, adv:52, dec:8,  flow:'Strong Inflow', signals:9,  theme:'Make in India'   },
    { name:'Telecom - Infrastructure',pct1d:0.92,pct7d:2.1,  pct30d:8.4,  adv:35, dec:22, flow:'Inflow',        signals:7,  theme:'5G Expansion'    },
  ],

  themes: [
    { icon:'🤖', name:'AI & Data Centers',       sub:'Infrastructure for AI compute',         stocks:['INFY','TCS','LTIM','HCLTECH'],         period7d:8.4,  stocks_count:18 },
    { icon:'⚡', name:'Power & Energy Transition',sub:'Renewable, Transmission & Distribution',stocks:['TATAPOWER','POWERGRID','ADANIGREEN'],  period7d:12.2, stocks_count:24 },
    { icon:'🛡️', name:'Defence & Aerospace',      sub:'Make in India defence manufacturing',   stocks:['HAL','BDL'],                           period7d:15.8, stocks_count:14 },
    { icon:'📡', name:'Telecom Infrastructure',  sub:'5G rollout & fiber expansion',           stocks:['RELIANCE','WIPRO'],                    period7d:9.4,  stocks_count:12 },
    { icon:'🚂', name:'Railways & Logistics',    sub:'Rail PSU & logistics cos',              stocks:['RVNL','IRFC'],                         period7d:11.6, stocks_count:16 },
    { icon:'💊', name:'Pharma Export Recovery',  sub:'US FDA clearances driving exports',      stocks:['SUNPHARMA','DRREDDY','CIPLA'],          period7d:5.2,  stocks_count:20 },
  ],

  sectorialBreakout: [
    { sector:'IT Services',        bo:21200, current:21840, pctAbove:3.02, volSurge:'2.8x', stocks:'INFY, TCS, LTIM, HCLTECH, WIPRO' },
    { sector:'Defence - Aerospace',bo:9850,  current:10428, pctAbove:5.87, volSurge:'4.1x', stocks:'HAL, BDL' },
    { sector:'Capital Goods',      bo:14400, current:15180, pctAbove:5.42, volSurge:'3.3x', stocks:'ABB, POLYCAB' },
    { sector:'Power Sector',       bo:8200,  current:8640,  pctAbove:5.37, volSurge:'3.8x', stocks:'TATAPOWER, POWERGRID' },
    { sector:'Auto Ancillary',     bo:18900, current:19420, pctAbove:2.75, volSurge:'2.2x', stocks:'MOTHERSON' },
  ],

  opportunities: {
    intraday:   [
      { sym:'DIXON',   sector:'Electronics',    entry:14850, sl:13900, t1:15800, t2:16500, rr:'2.3:1', signal:'Breakout + High Volume' },
      { sym:'INFY',    sector:'IT',             entry:1845,  sl:1775,  t1:1920,  t2:1980,  rr:'2.8:1', signal:'VWAP Momentum'         },
      { sym:'HCLTECH', sector:'IT',             entry:1680,  sl:1610,  t1:1760,  t2:1820,  rr:'1.8:1', signal:'Sector Strength'        },
    ],
    swing: [
      { sym:'TCS',     sector:'IT',             entry:4315,  sl:4150,  t1:4500,  t2:4620,  rr:'2.2:1', signal:'Weekly BO'              },
      { sym:'POLYCAB', sector:'Capital Goods',  entry:6130,  sl:5880,  t1:6500,  t2:6750,  rr:'2.1:1', signal:'Consolidation BO'       },
      { sym:'ABB',     sector:'Capital Goods',  entry:6850,  sl:6580,  t1:7200,  t2:7450,  rr:'2.4:1', signal:'Cup & Handle'           },
      { sym:'TITAN',   sector:'Consumer',       entry:3600,  sl:3540,  t1:3750,  t2:3850,  rr:'2.5:1', signal:'Retest Swing'           },
    ],
    positional: [
      { sym:'HAL',       sector:'Defence',      entry:4860,  sl:4520,  t1:5200,  t2:5480,  rr:'2.6:1', signal:'Multi-Month BO'         },
      { sym:'TATAPOWER', sector:'Energy',       entry:430,   sl:398,   t1:462,   t2:490,   rr:'2.0:1', signal:'Sector Leadership'      },
    ],
    investor:   [
      { sym:'MARICO',  sector:'FMCG',           entry:685,   sl:638,   t1:740,   t2:780,   rr:'2.1:1', signal:'Fundamental Trigger'    },
    ],
    'mbo-opp':  [
      { sym:'HAL',     sector:'Defence',        entry:4860,  sl:4350,  t1:5400,  t2:5900,  rr:'2.8:1', signal:'5-Year ATH BO'          },
    ],
    'ipo-opp':  [
      { sym:'NTPCGREEN',sector:'Renewable',     entry:148,   sl:138,   t1:165,   t2:180,   rr:'2.0:1', signal:'IPO Base BO'            },
    ],
  },

  retestData: [
    { sym:'TITAN',    sector:'Consumer', boLevel:3580,  type:'Horizontal Retest', sl:3540,  target:3750,  rr:'2.5:1' },
    { sym:'COALINDIA',sector:'Metals',   boLevel:495,   type:'ATH Retest',        sl:480,   target:535,   rr:'2.8:1' },
    { sym:'NTPC',     sector:'Power',    boLevel:384,   type:'Trendline Retest',  sl:372,   target:415,   rr:'2.1:1' },
    { sym:'ICICIBANK',sector:'Banking',  boLevel:1285,  type:'Horizontal Retest', sl:1260,  target:1360,  rr:'2.4:1' },
  ],

  mboData: [
    { sym:'HAL',     sector:'Defence',  resistance:4800, type:'5-Year ATH BO',        period:'FY2018-2024', volSurge:'4.5x' },
    { sym:'TRENT',   sector:'Retail',   resistance:6200, type:'All-Time High BO',      period:'2022-2025',   volSurge:'3.8x' },
    { sym:'PFC',     sector:'Finance',  resistance:465,  type:'Multi-Year Resistance', period:'2017-2024',   volSurge:'2.9x' },
    { sym:'RVNL',    sector:'Railways', resistance:582,  type:'Consolidation Zone BO', period:'12 months',   volSurge:'3.2x' },
  ],

  ipoData: [
    { sym:'NTPCGREEN', sector:'Renewable',   listed:'Nov 2024', issue:108, setup:'Momentum',    signal:'New ATH'    },
    { sym:'IRFC',      sector:'Finance',     listed:'Jan 2023', issue:26,  setup:'IPO Base BO', signal:'Volume BO'  },
    { sym:'HAL',       sector:'Defence',     listed:'Mar 2018', issue:1215,setup:'Breakout',    signal:'Sector Led' },
    { sym:'RVNL',      sector:'Railways',    listed:'Apr 2023', issue:57,  setup:'Momentum',    signal:'PSU Rally'  },
  ],

  fundamentals: [
    { sym:'DIXON',    sector:'Electronics',  revGrowth:45.2, patGrowth:62.4, roe:28.4, pe:94.2, quality:'Strong',    valuation:'Premium' },
    { sym:'HAL',      sector:'Defence',      revGrowth:18.6, patGrowth:24.8, roe:22.1, pe:38.4, quality:'Excellent', valuation:'Fair'    },
    { sym:'POLYCAB',  sector:'Capital Goods',revGrowth:22.4, patGrowth:31.6, roe:26.8, pe:42.1, quality:'Strong',    valuation:'Fair'    },
    { sym:'INFY',     sector:'IT',           revGrowth:8.4,  patGrowth:9.2,  roe:32.6, pe:24.8, quality:'Excellent', valuation:'Fair'    },
    { sym:'MARICO',   sector:'FMCG',         revGrowth:12.4, patGrowth:18.6, roe:38.4, pe:52.6, quality:'Strong',    valuation:'Premium' },
  ],

  blockbuster: [
    { sym:'DIXON',     quarter:'Q1 FY26', revGrowth:52.4, patGrowth:68.2, margin:'Expanding', opLeverage:'High',   quality:'Blockbuster', flags:'None'               },
    { sym:'HAL',       quarter:'Q4 FY25', revGrowth:22.6, patGrowth:28.4, margin:'Stable',    opLeverage:'Medium', quality:'Strong',      flags:'Order backlog high'  },
    { sym:'TATAPOWER', quarter:'Q1 FY26', revGrowth:14.2, patGrowth:18.6, margin:'Expanding', opLeverage:'High',   quality:'Strong',      flags:'Capex intensive'     },
  ],

  announcements: [
    { sym:'HAL',      category:'Order Win',    importance:'high',   signal:'Bullish', date:'Aug 09', detail:'₹8,200 Cr MQ-9B maintenance contract'          },
    { sym:'INFY',     category:'Buyback',      importance:'medium', signal:'Positive',date:'Aug 08', detail:'₹9,000 Cr buyback at ₹1,900/share'             },
    { sym:'DIXON',    category:'JV/Expansion', importance:'high',   signal:'Bullish', date:'Aug 07', detail:'New JV with Samsung for TV manufacturing'       },
    { sym:'TATAPOWER',category:'Project Win',  importance:'medium', signal:'Positive',date:'Aug 06', detail:'500 MW solar project in Rajasthan'              },
    { sym:'ICICIBANK',category:'Results',      importance:'high',   signal:'Neutral', date:'Aug 05', detail:'NII up 10%, PAT up 14% YoY - in-line'          },
  ],

  performance: [
    { pattern:'Consolidation Breakout', signals:284, winRate:'72.4%', avgReturn:'+8.6%',  holdDays:'12', bestSector:'IT'           },
    { pattern:'Cup & Handle',           signals:142, winRate:'68.2%', avgReturn:'+10.4%', holdDays:'18', bestSector:'Capital Goods' },
    { pattern:'Trendline BO',           signals:198, winRate:'64.8%', avgReturn:'+7.2%',  holdDays:'9',  bestSector:'Pharma'        },
    { pattern:'Flag Pattern',           signals:226, winRate:'66.4%', avgReturn:'+6.8%',  holdDays:'8',  bestSector:'FMCG'          },
    { pattern:'IPO Base BO',            signals:84,  winRate:'58.3%', avgReturn:'+14.2%', holdDays:'24', bestSector:'Consumer Tech'  },
    { pattern:'ATH Retest',             signals:116, winRate:'70.6%', avgReturn:'+9.8%',  holdDays:'15', bestSector:'Defence'        },
    { pattern:'Multi-Year BO',          signals:62,  winRate:'74.2%', avgReturn:'+18.6%', holdDays:'45', bestSector:'Defence'        },
  ],

  alerts: [
    { type:'buy',            time:'10:32 AM', sym:'INFY',    desc:'Crossed resistance on strong volume. IT sector momentum.',    setup:'Breakout'  },
    { type:'buy',            time:'10:48 AM', sym:'DIXON',   desc:'All-time high breakout with 4.2x average volume.',             setup:'ATH BO'    },
    { type:'watch',          time:'11:15 AM', sym:'TITAN',   desc:'Retesting 3,580 breakout level. Watch for confirmation.',     setup:'Retest'    },
    { type:'momentum-alert', time:'11:42 AM', sym:'TCS',     desc:'Weekly chart momentum continuation. Sector leader in IT.',    setup:'Momentum'  },
    { type:'watch',          time:'12:18 PM', sym:'HAL',     desc:'Testing 5-year ATH breakout level at 4,800.',                 setup:'Multi-Yr'  },
    { type:'buy',            time:'12:44 PM', sym:'HCLTECH', desc:'IT sector strength. VWAP crossover confirmed.',               setup:'Momentum'  },
    { type:'buy',            time:'2:10 PM',  sym:'ABB',     desc:'Capital goods weekly consolidation breakout.',                setup:'Breakout'  },
  ],
};

/* ── UTILITY ─────────────────────────────────────────────── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const fmt = (n, dec = 2) => n == null ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const pct = (v) => `<span class="${v >= 0 ? 'positive' : 'negative'}">${v >= 0 ? '+' : ''}${fmt(v)}%</span>`;
const tvLink = (sym) => `<a class="tv-link" href="https://www.tradingview.com/chart/?symbol=NSE:${sym}" target="_blank" rel="noopener">📈 Chart</a>`;

/* Live price helper — fall back to static if not yet loaded */
function livePrice(sym) {
  const q = LIVE.quotes[sym];
  return q ? q.price : null;
}
function liveChange(sym) {
  const q = LIVE.quotes[sym];
  return q ? q.changePct : null;
}
function liveVolRatio(sym) {
  const q = LIVE.quotes[sym];
  return q?.volRatio ?? null;
}

/* ── YAHOO FINANCE FETCH ─────────────────────────────────── */
/* Fetch a SINGLE symbol via chart API (works reliably via allorigins proxy) */
async function fetchChartMeta(yfSym) {
  const rawURL = `${YF.CHART}${encodeURIComponent(yfSym)}?interval=1d&range=2d&includePrePost=false`;
  const url    = `${YF.PROXY}${encodeURIComponent(rawURL)}`;
  const resp   = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json   = await resp.json();
  const meta   = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('No meta');
  return meta;
}

/* Fetch a batch of symbols in parallel, return settled results */
async function fetchBatch(yfSyms) {
  return Promise.allSettled(yfSyms.map(s => fetchChartMeta(s)));
}

/* Batch-fetch all indices + stocks with rate-limit throttling */
async function refreshAll() {
  if (LIVE.isLoading) return;
  LIVE.isLoading = true;
  setFetchStatus('loading');

  try {
    // --- Indices ---
    const indexEntries = Object.entries(YF.INDICES); // [label, yfSym]
    const idxResults   = await fetchBatch(indexEntries.map(([, s]) => s));
    idxResults.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const meta  = r.value;
      const label = indexEntries[i][0];
      const chgPct = meta.chartPreviousClose
        ? ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100
        : 0;
      LIVE.indices[label] = {
        price:     meta.regularMarketPrice,
        change:    meta.regularMarketPrice - (meta.chartPreviousClose || 0),
        changePct: +chgPct.toFixed(2),
      };
    });

    // Update ticker immediately after indices load
    updateTickerBar();

    // --- Stocks (in batches to avoid rate limits) ---
    const stockSyms = YF.STOCKS.map(s => s + '.NS');
    for (let i = 0; i < stockSyms.length; i += YF.BATCH_SIZE) {
      const batch   = stockSyms.slice(i, i + YF.BATCH_SIZE);
      const results = await fetchBatch(batch);

      results.forEach((r, j) => {
        if (r.status !== 'fulfilled') return;
        const meta   = r.value;
        const sym    = YF.STOCKS[i + j];
        const prev   = meta.chartPreviousClose || meta.regularMarketPrice;
        const chgPct = ((meta.regularMarketPrice - prev) / prev) * 100;
        const vol    = meta.regularMarketVolume    || 0;
        const avgVol = meta.averageDailyVolume10Day || vol || 1;
        LIVE.quotes[sym] = {
          price:     meta.regularMarketPrice,
          change:    meta.regularMarketPrice - prev,
          changePct: +chgPct.toFixed(2),
          volume:    vol,
          volRatio:  +(vol / avgVol).toFixed(1),
          prevClose: prev,
          name:      meta.shortName || meta.symbol || sym,
        };
      });

      // Update UI after each batch so user sees progressive updates
      updateMomentumTable();
      updateOverviewStocks();
      updateModalIfOpen();

      // Throttle between batches
      if (i + YF.BATCH_SIZE < stockSyms.length) {
        await new Promise(res => setTimeout(res, YF.BATCH_DELAY));
      }
    }

    LIVE.lastUpdated = new Date();
    LIVE.fetchFailed = false;
    setFetchStatus('ok');
    renderHeatmap();

  } catch (err) {
    console.warn('Yahoo Finance refresh failed:', err.message);
    LIVE.fetchFailed = true;
    setFetchStatus('error');
  } finally {
    LIVE.isLoading = false;
  }
}

/* ── STATUS BAR ──────────────────────────────────────────── */
function setFetchStatus(state) {
  const el = $('#live-status');
  if (!el) return;
  if (state === 'loading') {
    el.innerHTML = `<span class="status-dot" style="background:#f59e0b;box-shadow:0 0 8px #f59e0b"></span>
                    <span class="status-text">Fetching…</span>`;
  } else if (state === 'ok') {
    const t = LIVE.lastUpdated;
    const ts = t ? t.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '';
    el.innerHTML = `<span class="status-dot"></span>
                    <span class="status-text">Live · ${ts}</span>`;
  } else {
    el.innerHTML = `<span class="status-dot" style="background:#ef4444;box-shadow:0 0 8px #ef4444"></span>
                    <span class="status-text">Offline · Using cached data</span>`;
  }
}

/* ── UPDATE TICKER BAR ───────────────────────────────────── */
function updateTickerBar() {
  for (const [label, data] of Object.entries(LIVE.indices)) {
    // Find the ticker item by matching inner text of .ticker-name
    $$('.ticker-item').forEach(item => {
      const nameEl = item.querySelector('.ticker-name');
      if (!nameEl || nameEl.textContent.trim() !== label) return;
      const priceEl  = item.querySelector('.ticker-price');
      const changeEl = item.querySelector('.ticker-change');
      if (!priceEl || !changeEl) return;
      priceEl.textContent = fmt(data.price);
      const sign = data.changePct >= 0 ? '+' : '';
      changeEl.textContent  = `${sign}${fmt(data.changePct)}%`;
      changeEl.className    = `ticker-change ${data.changePct >= 0 ? 'positive' : 'negative'}`;

      // Flash animation
      priceEl.classList.add('price-flash');
      setTimeout(() => priceEl.classList.remove('price-flash'), 700);
    });
  }
}

/* ── UPDATE MOMENTUM TABLE ───────────────────────────────── */
function updateMomentumTable() {
  $$('#momentum-tbody tr').forEach(row => {
    const symEl = row.querySelector('.sym-name');
    if (!symEl) return;
    const sym = symEl.textContent.trim();
    const q   = LIVE.quotes[sym];
    if (!q) return;

    const cells = row.querySelectorAll('td');
    // td[2] = LTP, td[3] = Change, td[4] = Volume, td[5] = Score bar
    if (cells[2]) cells[2].innerHTML = `₹${fmt(q.price)}`;
    if (cells[3]) cells[3].innerHTML = pct(q.changePct);
    if (cells[4] && q.volRatio) cells[4].innerHTML = `<span class="mono">${q.volRatio}x</span>`;

    // Flash row
    row.classList.add('row-flash');
    setTimeout(() => row.classList.remove('row-flash'), 700);
  });
}

/* ── UPDATE OVERVIEW STOCKS ──────────────────────────────── */
function updateOverviewStocks() {
  $$('#overview-stock-list .stock-row:not(.header-row)').forEach(row => {
    const symEl = row.querySelector('.sym');
    if (!symEl) return;
    const sym = symEl.textContent.trim();
    const q   = LIVE.quotes[sym];
    if (!q) return;

    const priceEl  = row.querySelector('.stock-price');
    const changeEl = row.querySelector('.stock-change');
    if (priceEl)  priceEl.textContent = fmt(q.price);
    if (changeEl) {
      const sign = q.changePct >= 0 ? '+' : '';
      changeEl.textContent = `${sign}${fmt(q.changePct)}%`;
      changeEl.className   = `stock-change ${q.changePct >= 0 ? 'positive' : 'negative'}`;
    }
  });
}

/* ── UPDATE MODAL (if open) ──────────────────────────────── */
function updateModalIfOpen() {
  const modal = $('#stock-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  const symEl = modal.querySelector('.modal-sym');
  if (!symEl) return;
  const sym = symEl.textContent.trim();
  const q   = LIVE.quotes[sym];
  if (!q) return;
  const priceEl  = modal.querySelector('.modal-price');
  const changeEl = modal.querySelector('.modal-change');
  if (priceEl)  priceEl.textContent = `₹${fmt(q.price)}`;
  if (changeEl) {
    const sign = q.changePct >= 0 ? '+' : '';
    changeEl.textContent = `${sign}${fmt(q.changePct)}%`;
    changeEl.className   = `modal-change ${q.changePct >= 0 ? 'positive' : 'negative'}`;
  }
}

/* ── COUNTDOWN TIMER ─────────────────────────────────────── */
function startRefreshTimer() {
  let secs = YF.REFRESH_MS / 1000;

  const updateCountdown = () => {
    const el = $('#refresh-countdown');
    if (el) el.textContent = `Next refresh in ${secs}s`;
    if (--secs < 0) {
      secs = YF.REFRESH_MS / 1000;
      // Use window.refreshAll so the NSE-proxy override is always honoured
      (window.refreshAll || refreshAll)();
    }
  };

  updateCountdown();
  LIVE.refreshTimer = setInterval(updateCountdown, 1000);
}

/* ── NAV ─────────────────────────────────────────────────── */
function initNav() {
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.dataset.tab;
      switchTab(tab);
      $$('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('card-action') && e.target.dataset.tab) {
      switchTab(e.target.dataset.tab);
      $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === e.target.dataset.tab));
    }
  });

  const toggle  = $('#sidebar-toggle');
  const sidebar = $('#sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !toggle.contains(e.target)) sidebar.classList.remove('open');
    });
  }
}

function switchTab(tabId) {
  $$('.tab-content').forEach(s => s.classList.remove('active'));
  const el = $(`#tab-${tabId}`);
  if (el) el.classList.add('active');
  $('#main-content').scrollTop = 0;
}

/* ── OVERVIEW ────────────────────────────────────────────── */
function renderOverview() {
  const secList = $('#overview-sector-list');
  if (secList) {
    secList.innerHTML = DATA.overviewSectors.map((s, i) => `
      <div class="sector-row">
        <div class="sector-left">
          <span class="sector-rank">${i+1}</span>
          <div class="sector-bar-wrap">
            <span class="sector-name">${s.name}</span>
            <div class="sector-bar"><div class="bar-fill ${s.cls}" style="width:${s.w}"></div></div>
          </div>
        </div>
        <span class="sector-pct ${s.pct.startsWith('+') ? 'positive' : 'negative'}">${s.pct}</span>
      </div>
    `).join('');
  }

  renderOverviewStocks('intraday');

  $$('#overview-momentum-pills .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#overview-momentum-pills .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderOverviewStocks(btn.dataset.type);
    });
  });

  const tg = $('#overview-themes');
  if (tg) {
    tg.innerHTML = DATA.overviewThemes.map(t =>
      `<span class="theme-chip ${t.cls}" role="button">${t.label}</span>`
    ).join('');
  }

  const al = $('#overview-alerts');
  if (al) {
    al.innerHTML = DATA.overviewAlerts.map(a => `
      <div class="alert-item ${a.cls}">
        <div class="alert-meta"><span class="alert-type">${a.type}</span><span class="alert-time">${a.time}</span></div>
        <p class="alert-text"><strong>${a.sym}</strong> — ${a.desc}</p>
      </div>
    `).join('');
  }
}

function renderOverviewStocks(type) {
  const map = {
    intraday:   ['INFY','DIXON','HCLTECH','LTIM','MARICO'],
    swing:      ['TCS','POLYCAB','ABB','TITAN','MOTHERSON'],
    positional: ['HAL','TATAPOWER','RVNL','PFC','TRENT'],
  };
  const syms   = map[type] || map.intraday;
  const stocks = DATA.momentumStocks.filter(s => syms.includes(s.sym)).slice(0, 5);
  const el     = $('#overview-stock-list');
  if (!el) return;

  el.innerHTML = `
    <div class="stock-row header-row">
      <span>Symbol</span><span>LTP</span><span>Change</span><span>Score</span><span>Setup</span>
    </div>
    ${stocks.map(s => {
      const ltp = livePrice(s.sym) ?? s.ltp ?? '—';
      const chg = liveChange(s.sym) ?? s.chg1d ?? 0;
      const pos = chg >= 0;
      return `
      <div class="stock-row" style="cursor:pointer" onclick="openModal('${s.sym}')">
        <div class="stock-symbol"><span class="sym">${s.sym}</span><span class="sector-tag">${s.sector.substring(0,6)}</span></div>
        <span class="stock-price">${ltp === '—' ? '—' : fmt(ltp)}</span>
        <span class="stock-change ${pos ? 'positive' : 'negative'}">${pos ? '+' : ''}${fmt(chg)}%</span>
        <div class="score-bar"><div class="score-fill" style="width:${s.score}%"></div><span>${s.score}</span></div>
        <span class="setup-tag ${s.setup.toLowerCase().replace(/\s/g,'-')}">${s.setup.substring(0,8)}</span>
      </div>`;
    }).join('')}
  `;
}

/* ── MOMENTUM SCANNER ────────────────────────────────────── */
function renderMomentum(stocks) {
  const tbody = $('#momentum-tbody');
  if (!tbody) return;
  tbody.innerHTML = stocks.map(s => {
    const ltp  = livePrice(s.sym)    ?? '—';
    const chg  = liveChange(s.sym)   ?? 0;
    const vol  = liveVolRatio(s.sym) ?? s.vol;
    return `
    <tr>
      <td><div class="symbol-cell"><span class="sym-name" onclick="openModal('${s.sym}')" style="cursor:pointer">${s.sym}</span><span class="sym-sector">${s.name.substring(0,24)}</span></div></td>
      <td>${s.sector} · ${s.industry}</td>
      <td class="price-cell">${ltp === '—' ? '—' : '₹' + fmt(ltp)}</td>
      <td>${pct(chg)}</td>
      <td><span class="mono">${vol}x</span></td>
      <td>
        <div class="score-bar">
          <div class="score-fill" style="width:${s.score}%"></div>
          <span>${s.score}</span>
        </div>
      </td>
      <td><span class="setup-tag ${s.setup.toLowerCase().replace(/\s/g,'-')}">${s.setup}</span></td>
      <td>${s.signals.map(sig => `<span class="setup-tag ${sig.toLowerCase()}" style="margin-right:4px">${sig}</span>`).join('')}</td>
      <td>${tvLink(s.sym)}</td>
    </tr>`;
  }).join('');
}

function initMomentumFilters() {
  const filterBy = () => {
    const typeVal   = $('#momentum-type-filter')?.value   || 'All';
    const sectorVal = $('#momentum-sector-filter')?.value || 'All Sectors';
    const setupVal  = $('#momentum-setup-filter')?.value  || 'All Setups';
    let stocks = DATA.momentumStocks;
    if (typeVal   !== 'All')        stocks = stocks.filter(s => s.signals.includes(typeVal));
    if (sectorVal !== 'All Sectors')stocks = stocks.filter(s => s.sector === sectorVal);
    if (setupVal  !== 'All Setups') stocks = stocks.filter(s => s.setup  === setupVal);
    renderMomentum(stocks);
  };
  ['#momentum-type-filter','#momentum-sector-filter','#momentum-setup-filter']
    .forEach(id => $(id)?.addEventListener('change', filterBy));
  $$('.tf-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tf-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterBy();
    });
  });
  renderMomentum(DATA.momentumStocks);
}

/* ── SECTOR HEATMAP ──────────────────────────────────────── */
function renderHeatmap() {
  const grid = $('#heatmap-grid');
  if (!grid) return;
  const max = Math.max(...DATA.heatmapData.map(s => Math.abs(s.pct)));
  grid.innerHTML = DATA.heatmapData.map(s => {
    const intensity = Math.abs(s.pct) / max;
    const color     = s.pct >= 0
      ? `rgba(16,185,129,${0.1 + intensity * 0.6})`
      : `rgba(239,68,68,${0.1 + intensity * 0.6})`;
    const textColor = s.pct >= 0 ? '#34d399' : '#f87171';
    return `
      <div class="heatmap-cell" style="background:${color}">
        <div class="cell-sector" style="color:${textColor}">${s.sector}</div>
        <div class="cell-pct" style="color:${textColor}">${s.pct >= 0 ? '+' : ''}${fmt(s.pct)}%</div>
        <div class="cell-detail" style="color:${textColor}">Adv: ${s.adv}</div>
      </div>`;
  }).join('');
}

function renderSectors() {
  const tbody = $('#sector-tbody');
  if (!tbody) return;
  tbody.innerHTML = DATA.sectors.map(s => {
    const fc = s.flow.includes('Strong') ? '#10b981' : s.flow === 'Inflow' ? '#34d399' : s.flow === 'Outflow' ? '#ef4444' : '#94a3b8';
    return `
    <tr>
      <td style="font-weight:700;color:var(--text-primary)">${s.name}</td>
      <td>${pct(s.pct1d)}</td>
      <td>${pct(s.pct7d)}</td>
      <td>${pct(s.pct30d)}</td>
      <td><span style="color:#10b981;font-weight:600">${s.adv}</span> / <span style="color:#ef4444;font-weight:600">${s.dec}</span></td>
      <td><span style="color:${fc};font-weight:600">${s.flow}</span></td>
      <td><span class="rr-pill">${s.signals}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${s.theme}</td>
    </tr>`;
  }).join('');

  $$('#sector-period-sel .period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#sector-period-sel .period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

/* ── THEMES ──────────────────────────────────────────────── */
function renderThemes() {
  const list = $('#themes-list');
  if (!list) return;
  list.innerHTML = DATA.themes.map(t => `
    <div class="theme-card">
      <div class="theme-card-header">
        <div class="theme-card-info">
          <span class="theme-icon">${t.icon}</span>
          <div>
            <div class="theme-title">${t.name}</div>
            <div class="theme-subtitle">${t.sub}</div>
          </div>
        </div>
        <div class="theme-stats">
          <div class="theme-stat">
            <div class="theme-stat-label">7D Return</div>
            <div class="theme-stat-value positive">+${t.period7d}%</div>
          </div>
          <div class="theme-stat">
            <div class="theme-stat-label">Stocks</div>
            <div class="theme-stat-value" style="color:var(--text-primary)">${t.stocks_count}</div>
          </div>
        </div>
      </div>
      <div class="theme-stocks">
        ${t.stocks.map(s => {
          const chg = liveChange(s) ?? 0;
          const pos = chg >= 0;
          return `
          <div class="theme-stock-chip" onclick="openModal('${s}')">
            <span class="tsc-sym">${s}</span>
            <span class="tsc-chg ${pos ? 'positive' : 'negative'}">${pos ? '+' : ''}${fmt(chg)}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

/* ── SECTORIAL BREAKOUT ──────────────────────────────────── */
function renderSectorialBreakout() {
  const tbody = $('#sectorial-breakout-tbody');
  if (!tbody) return;
  tbody.innerHTML = DATA.sectorialBreakout.map(s => `
    <tr>
      <td style="font-weight:700;color:var(--text-primary)">${s.sector}</td>
      <td class="mono">${s.bo.toLocaleString()}</td>
      <td class="mono positive">${s.current.toLocaleString()}</td>
      <td>${pct(s.pctAbove)}</td>
      <td style="color:#fbbf24;font-weight:700">${s.volSurge}</td>
      <td style="color:var(--text-secondary);font-size:12px">${s.stocks}</td>
      <td><span class="tv-link" style="cursor:pointer">📈 Chart</span></td>
    </tr>
  `).join('');
}

/* ── OPPORTUNITY HUB ─────────────────────────────────────── */
function renderOpportunities(type) {
  const tbody = $('#opp-tbody');
  if (!tbody) return;
  const data = DATA.opportunities[type] || [];
  tbody.innerHTML = data.map(o => {
    const ltp = livePrice(o.sym);
    const chg = liveChange(o.sym) ?? 0;
    const pos = chg >= 0;
    return `
    <tr>
      <td><span class="sym-name" onclick="openModal('${o.sym}')" style="cursor:pointer">${o.sym}</span></td>
      <td>${o.sector}</td>
      <td class="price-cell">${ltp ? '₹' + fmt(ltp) : '—'}</td>
      <td>${pct(chg)}</td>
      <td class="mono" style="color:#60a5fa">₹${o.entry.toLocaleString()}</td>
      <td class="mono" style="color:#f87171">₹${o.sl.toLocaleString()}</td>
      <td class="mono positive">₹${o.t1.toLocaleString()}</td>
      <td class="mono positive">₹${o.t2.toLocaleString()}</td>
      <td><span class="rr-pill">${o.rr}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${o.signal}</td>
      <td>${tvLink(o.sym)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:2rem">No opportunities for this category.</td></tr>`;
}

function initOppHub() {
  $$('#opp-type-selector .opp-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#opp-type-selector .opp-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderOpportunities(btn.dataset.type);
    });
  });
  renderOpportunities('intraday');
}

/* ── RETEST ──────────────────────────────────────────────── */
function renderRetest() {
  const tbody = $('#retest-tbody');
  if (!tbody) return;
  tbody.innerHTML = DATA.retestData.map(r => {
    const ltp  = livePrice(r.sym) ?? '—';
    const dist = ltp !== '—' ? `${((ltp / r.boLevel - 1) * 100).toFixed(2)}%` : r.dist ?? '—';
    return `
    <tr>
      <td><span class="sym-name" onclick="openModal('${r.sym}')" style="cursor:pointer">${r.sym}</span></td>
      <td>${r.sector}</td>
      <td class="mono" style="color:#60a5fa">₹${r.boLevel.toLocaleString()}</td>
      <td class="price-cell">${ltp !== '—' ? '₹' + fmt(ltp) : '—'}</td>
      <td style="color:#10b981;font-weight:700">${dist} from BO</td>
      <td><span class="setup-tag retest">${r.type}</span></td>
      <td class="mono" style="color:#f87171">₹${r.sl.toLocaleString()}</td>
      <td class="mono positive">₹${r.target.toLocaleString()}</td>
      <td><span class="rr-pill">${r.rr}</span></td>
      <td>${tvLink(r.sym)}</td>
    </tr>`;
  }).join('');
}

/* ── MULTI-YEAR BREAKOUT ─────────────────────────────────── */
function renderMBO() {
  const tbody = $('#mbo-tbody');
  if (!tbody) return;
  tbody.innerHTML = DATA.mboData.map(m => {
    const ltp = livePrice(m.sym);
    return `
    <tr>
      <td><span class="sym-name" onclick="openModal('${m.sym}')" style="cursor:pointer">${m.sym}</span></td>
      <td>${m.sector}</td>
      <td class="mono" style="color:#60a5fa">₹${m.resistance.toLocaleString()}</td>
      <td class="price-cell">${ltp ? '₹' + fmt(ltp) : '—'}</td>
      <td><span class="setup-tag mbo">${m.type}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${m.period}</td>
      <td style="color:#fbbf24;font-weight:700">${m.volSurge}</td>
      <td>${tvLink(m.sym)}</td>
    </tr>`;
  }).join('');
}

/* ── IPO ─────────────────────────────────────────────────── */
function renderIPO() {
  const tbody = $('#ipo-tbody');
  if (!tbody) return;
  tbody.innerHTML = DATA.ipoData.map(i => {
    const ltp = livePrice(i.sym) ?? '—';
    const vsPct = ltp !== '—' && i.issue ? ((ltp / i.issue - 1) * 100).toFixed(2) : '—';
    return `
    <tr>
      <td><span class="sym-name">${i.sym}</span></td>
      <td>${i.sector}</td>
      <td style="font-size:12px;color:var(--text-muted)">${i.listed}</td>
      <td class="mono">₹${i.issue}</td>
      <td class="price-cell">${ltp !== '—' ? '₹' + fmt(ltp) : '—'}</td>
      <td>${vsPct !== '—' ? pct(parseFloat(vsPct)) : '—'}</td>
      <td><span class="setup-tag ipo">${i.setup}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${i.signal}</td>
      <td>${tvLink(i.sym)}</td>
    </tr>`;
  }).join('');
}

/* ── FUNDAMENTALS ────────────────────────────────────────── */
function renderFundamentals() {
  const tbody = $('#fund-tbody');
  if (tbody) {
    tbody.innerHTML = DATA.fundamentals.map(f => {
      const ltp = livePrice(f.sym);
      return `
      <tr>
        <td><span class="sym-name">${f.sym}</span></td>
        <td>${f.sector}</td>
        <td class="price-cell">${ltp ? '₹' + fmt(ltp) : '—'}</td>
        <td>${pct(f.revGrowth)}</td>
        <td>${pct(f.patGrowth)}</td>
        <td class="mono">${f.roe.toFixed(1)}%</td>
        <td class="mono">${f.pe.toFixed(1)}x</td>
        <td><span class="setup-tag ${f.quality.toLowerCase()}">${f.quality}</span></td>
        <td style="color:var(--text-muted);font-size:12px">${f.valuation}</td>
      </tr>`;
    }).join('');
  }

  const btbody = $('#blockbuster-tbody');
  if (btbody) {
    btbody.innerHTML = DATA.blockbuster.map(b => `
      <tr>
        <td><span class="sym-name">${b.sym}</span></td>
        <td style="color:var(--text-muted);font-size:12px">${b.quarter}</td>
        <td>${pct(b.revGrowth)}</td>
        <td>${pct(b.patGrowth)}</td>
        <td style="color:${b.margin === 'Expanding' ? 'var(--accent-green)' : 'var(--text-secondary)'}">${b.margin}</td>
        <td style="color:${b.opLeverage === 'High' ? '#fbbf24' : 'var(--text-secondary)'}">${b.opLeverage}</td>
        <td><span class="importance-badge ${b.quality === 'Blockbuster' ? 'high' : 'medium'}">${b.quality}</span></td>
        <td style="color:var(--text-muted);font-size:12px">${b.flags}</td>
      </tr>
    `).join('');
  }

  const atbody = $('#announce-tbody');
  if (atbody) {
    atbody.innerHTML = DATA.announcements.map(a => `
      <tr>
        <td><span class="sym-name">${a.sym}</span></td>
        <td>${a.category}</td>
        <td><span class="importance-badge ${a.importance}">${a.importance.toUpperCase()}</span></td>
        <td style="color:${a.signal === 'Bullish' ? 'var(--accent-green)' : a.signal === 'Positive' ? '#60a5fa' : 'var(--text-secondary)'}">${a.signal}</td>
        <td class="mono" style="color:var(--text-muted)">${a.date}</td>
        <td style="font-size:12px;max-width:300px;white-space:normal;line-height:1.4;color:var(--text-secondary)">${a.detail}</td>
      </tr>
    `).join('');
  }

  $$('#fund-tabs .fund-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#fund-tabs .fund-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.fund-tab-content').forEach(c => c.classList.remove('active'));
      $(`#ftab-${btn.dataset.ftab}`)?.classList.add('active');
    });
  });

  const analyzeBtn = $('#rally-analyze-btn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      const sym = $('#rally-stock-input')?.value.trim().toUpperCase();
      if (sym) renderRallyReason(sym);
    });
  }
}

function renderRallyReason(sym) {
  const result = $('#rally-result');
  if (!result) return;
  result.classList.remove('hidden');
  const q = LIVE.quotes[sym];
  const priceInfo = q ? `Current price: ₹${fmt(q.price)} (${q.changePct >= 0 ? '+' : ''}${fmt(q.changePct)}%)` : '';
  result.innerHTML = `
    <div class="rally-header">🔍 Rally Reason Analysis: ${sym} ${priceInfo ? `<small style="font-size:14px;color:var(--text-muted);font-weight:400">${priceInfo}</small>` : ''}</div>
    <div class="rally-factors">
      ${[
        { icon:'📈', title:'Technical Setup',        desc:`${sym} crossed a multi-week consolidation zone on above-average volume. Price is above 20 EMA, 50 EMA and 200 EMA on daily charts.` },
        { icon:'🏭', title:'Sector Participation',   desc:`IT sector is the leading sector on NSE today (+2.84%). ${sym} is in the top performers within the sector.` },
        { icon:'💰', title:'Earnings Momentum',      desc:`Recent quarterly results showed strong revenue and PAT growth. Margins stable. EPS beat consensus estimates.` },
        { icon:'📢', title:'Corporate Announcement', desc:`Recent corporate actions (buyback / order win / expansion) have acted as positive catalysts for the stock.` },
        { icon:'🌏', title:'Theme Participation',    desc:`${sym} is a core holding in active themes (AI, Defence, Clean Energy) that are seeing sustained fund flows.` },
      ].map(r => `
        <div class="rally-factor">
          <div class="rally-factor-icon">${r.icon}</div>
          <div class="rally-factor-content">
            <div class="rally-factor-title">${r.title}</div>
            <div class="rally-factor-desc">${r.desc}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-top:12px">⚠️ For research purposes only. Not investment advice.</p>
  `;
}

/* ── PERFORMANCE ─────────────────────────────────────────── */
function renderPerformance() {
  const tbody = $('#perf-tbody');
  if (!tbody) return;
  tbody.innerHTML = DATA.performance.map(p => `
    <tr>
      <td style="font-weight:600;color:var(--text-primary)">${p.pattern}</td>
      <td class="mono">${p.signals}</td>
      <td style="color:${parseFloat(p.winRate) >= 65 ? 'var(--accent-green)' : 'var(--accent-orange)'};font-weight:700">${p.winRate}</td>
      <td style="color:var(--accent-green);font-weight:700">${p.avgReturn}</td>
      <td class="mono">${p.holdDays} days</td>
      <td style="color:var(--text-muted);font-size:12px">${p.bestSector}</td>
    </tr>
  `).join('');
}

/* ── ALERTS ──────────────────────────────────────────────── */
function renderAlerts() {
  const log = $('#alert-log');
  if (!log) return;
  log.innerHTML = DATA.alerts.map(a => {
    const q = LIVE.quotes[a.sym];
    const priceStr  = q ? `₹${fmt(q.price)}` : '—';
    const returnStr = q ? `${q.changePct >= 0 ? '+' : ''}${fmt(q.changePct)}%` : '—';
    const rCls      = q ? (q.changePct >= 0 ? 'positive' : 'negative') : '';
    return `
    <div class="alert-log-item ${a.type}">
      <span class="alert-log-time">${a.time}</span>
      <span class="alert-log-badge ${a.type}">${a.setup}</span>
      <div class="alert-log-body">
        <div class="alert-log-sym">${a.sym}</div>
        <div class="alert-log-desc">${a.desc}</div>
      </div>
      <div class="alert-log-meta">
        <span class="alert-log-price">${priceStr}</span>
        <span class="alert-log-return ${rCls}">${returnStr}</span>
      </div>
    </div>`;
  }).join('');
}

/* ── MODAL ───────────────────────────────────────────────── */
function openModal(sym) {
  const stock = DATA.momentumStocks.find(s => s.sym === sym) || DATA.momentumStocks[0];
  const q     = LIVE.quotes[sym] || {};
  const ltp   = q.price     ?? stock.ltp     ?? 0;
  const chg   = q.changePct ?? stock.chg1d   ?? 0;
  const modal = $('#stock-modal');
  const inner = $('#modal-inner');
  if (!modal || !inner) return;

  inner.innerHTML = `
    <div class="modal-stock-header">
      <div>
        <div class="modal-sym">${sym}</div>
        <div class="modal-full-name">${q.name || stock.name || sym} · ${stock.sector || ''}</div>
      </div>
      <div class="modal-price-block">
        <div class="modal-price">₹${fmt(ltp)}</div>
        <div class="modal-change ${chg >= 0 ? 'positive' : 'negative'}">${chg >= 0 ? '+' : ''}${fmt(chg)}%</div>
      </div>
    </div>

    <div class="modal-levels-grid">
      <div class="modal-level-card support"><div class="modal-level-label">Support</div>  <div class="modal-level-value">₹${(stock.support || 0).toLocaleString()}</div></div>
      <div class="modal-level-card entry"><div class="modal-level-label">Entry Zone</div> <div class="modal-level-value">₹${(stock.entry  || 0).toLocaleString()}</div></div>
      <div class="modal-level-card sl">   <div class="modal-level-label">Stop Loss</div>  <div class="modal-level-value">₹${(stock.sl     || 0).toLocaleString()}</div></div>
      <div class="modal-level-card t1">   <div class="modal-level-label">Target 1</div>   <div class="modal-level-value">₹${(stock.t1     || 0).toLocaleString()}</div></div>
      <div class="modal-level-card t2">   <div class="modal-level-label">Target 2</div>   <div class="modal-level-value">₹${(stock.t2     || 0).toLocaleString()}</div></div>
      <div class="modal-level-card rr">   <div class="modal-level-label">Risk:Reward</div><div class="modal-level-value">${stock.rr || '—'}:1</div></div>
    </div>

    <div class="modal-tags">
      ${stock.setup   ? `<span class="modal-tag">${stock.setup}</span>` : ''}
      ${stock.sector  ? `<span class="modal-tag">${stock.sector}</span>` : ''}
      ${(stock.signals||[]).map(s => `<span class="modal-tag">${s}</span>`).join('')}
      <span class="modal-tag">Score: ${stock.score || '—'}</span>
      ${q.volRatio ? `<span class="modal-tag">Vol: ${q.volRatio}x Avg</span>` : ''}
    </div>

    <p class="modal-description">
      <strong>${sym}</strong> is showing a <strong>${stock.setup || 'momentum'}</strong> setup.
      ${q.price ? `Live price is <strong>₹${fmt(q.price)}</strong> (${fmt(chg, 2)}% today).` : ''}
      ${q.volRatio ? `Volume is at <strong>${q.volRatio}x</strong> the 10-day average.` : ''}
      Data is 15-minute delayed from Yahoo Finance.
    </p>

    <div class="modal-actions">
      <a class="btn-tv" href="https://www.tradingview.com/chart/?symbol=NSE:${sym}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
        Open in TradingView
      </a>
      <button class="btn-primary" onclick="closeModal()">Close</button>
    </div>
  `;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function initModal() {
  $('#modal-close-btn')?.addEventListener('click', closeModal);
  $('#stock-modal')?.addEventListener('click', (e) => { if (e.target === $('#stock-modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

function closeModal() {
  $('#stock-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
}

/* ── SEARCH ──────────────────────────────────────────────── */
function initSearch() {
  const input = $('#global-search');
  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const sym = input.value.trim().toUpperCase();
      if (sym) { openModal(sym); input.value = ''; input.blur(); }
    }
  });
}

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  renderOverview();
  initMomentumFilters();
  renderHeatmap();
  renderSectors();
  renderThemes();
  renderSectorialBreakout();
  initOppHub();
  renderRetest();
  renderMBO();
  renderIPO();
  renderFundamentals();
  renderPerformance();
  renderAlerts();
  initModal();
  initSearch();

  // Kick off first fetch immediately, then every 60s
  refreshAll();
  startRefreshTimer();
});

/* ============================================================
   SUPPORT SCANNER — Engine
   ============================================================ */

const SS = {
  currentSym:    null,
  currentData:   null,
  currentLevels: null,
  scanMode:      'single',
};

/* ── FETCH OHLCV from Yahoo Finance ──────────────────────── */
async function fetchOHLCV(sym, range = '6mo', interval = '1d') {
  // Handle both NSE stocks (.NS) and index symbols (^)
  const yfSym  = sym.startsWith('^') ? sym : sym.toUpperCase() + '.NS';
  // Use query2 host + allorigins proxy — chart API still works
  const rawURL = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSym)}?interval=${interval}&range=${range}&includePrePost=false`;
  const url    = `${YF.PROXY}${encodeURIComponent(rawURL)}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${sym}`);
  const json = await resp.json();

  // Handle error in response body
  if (json?.chart?.error) throw new Error(json.chart.error.description || 'API error');

  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${sym}`);

  const ts   = result.timestamp;
  const q    = result.indicators.quote[0];
  const meta = result.meta;

  if (!ts || !q) throw new Error(`Empty OHLCV for ${sym}`);

  // Build clean candle array, filter out null entries
  const candles = ts.map((t, i) => ({
    date:   new Date(t * 1000),
    open:   q.open[i],
    high:   q.high[i],
    low:    q.low[i],
    close:  q.close[i],
    volume: q.volume[i] || 0,
  })).filter(c => c.close != null && c.low != null && c.high != null && !isNaN(c.close));

  if (candles.length < 20) throw new Error(`Insufficient data for ${sym} (${candles.length} candles)`);

  return { candles, meta, sym };
}

/* ── SUPPORT DETECTION ALGORITHMS ───────────────────────── */

/** Find swing lows: local minima where price is lower than `lookback` candles on both sides */
function findSwingLows(candles, lookback = 5) {
  const pivots = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const low = candles[i].low;
    let isMin = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= low) { isMin = false; break; }
    }
    if (isMin) pivots.push({ index: i, price: low, date: candles[i].date, volume: candles[i].volume });
  }
  return pivots;
}

/** Find swing highs: local maxima (for resistance, useful to know broken resistance = support) */
function findSwingHighs(candles, lookback = 5) {
  const pivots = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const high = candles[i].high;
    let isMax = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= high) { isMax = false; break; }
    }
    if (isMax) pivots.push({ index: i, price: high, date: candles[i].date, volume: candles[i].volume });
  }
  return pivots;
}

/** Cluster nearby price levels within `tolerance` % of each other */
function clusterLevels(pivots, tolerance = 0.015) {
  if (!pivots.length) return [];
  const sorted  = [...pivots].sort((a, b) => a.price - b.price);
  const clusters = [];
  let   current  = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const ref   = current[0].price;
    const delta = Math.abs(sorted[i].price - ref) / ref;
    if (delta <= tolerance) {
      current.push(sorted[i]);
    } else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  clusters.push(current);

  return clusters.map(cluster => {
    const avgPrice  = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
    const totalVol  = cluster.reduce((s, p) => s + (p.volume || 0), 0);
    const latestIdx = Math.max(...cluster.map(p => p.index));
    const latestDate= cluster.find(p => p.index === latestIdx)?.date;
    return {
      price:      +avgPrice.toFixed(2),
      touches:    cluster.length,
      totalVol,
      latestIdx,
      latestDate,
      pivots:     cluster,
    };
  });
}

/** Calculate EMA */
function calcEMA(candles, period) {
  const closes = candles.map(c => c.close);
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return +ema.toFixed(2);
}

/** Score each level: touches, recency, volume, round-number proximity */
function scoreLevel(cluster, totalCandles, avgVolume, currentPrice) {
  let score = 0;

  // Touches (max 40 pts)
  score += Math.min(cluster.touches * 12, 40);

  // Recency (max 30 pts) — more recent = higher score
  const recencyRatio = cluster.latestIdx / totalCandles;
  score += Math.round(recencyRatio * 30);

  // Volume at level (max 20 pts)
  const volRatio = avgVolume > 0 ? cluster.totalVol / (avgVolume * cluster.touches) : 1;
  score += Math.min(Math.round(volRatio * 10), 20);

  // Round number bonus (max 10 pts)
  const roundFactors = [1000, 500, 100, 50, 10];
  for (const rf of roundFactors) {
    if (Math.abs(cluster.price % rf) / rf < 0.02) { score += 10; break; }
  }

  // Bonus: level is below current price (actual support, not resistance)
  if (cluster.price < currentPrice) score += 5;

  return Math.min(score, 100);
}

/** Main analysis: returns all support levels + EMAs */
function analyzeSupports(data, lookback) {
  const { candles, sym } = data;
  const currentPrice = candles[candles.length - 1].close;
  const avgVolume    = candles.reduce((s, c) => s + (c.volume || 0), 0) / candles.length;

  // Find pivot lows (support) and highs (broken resistance becoming support)
  const swingLows  = findSwingLows(candles, lookback);
  const swingHighs = findSwingHighs(candles, lookback);

  // Combine pivots below current price
  const allPivots = [
    ...swingLows.map(p => ({ ...p, type: 'Swing Low' })),
    ...swingHighs.filter(p => p.price < currentPrice * 0.98)
                 .map(p => ({ ...p, type: 'Broken Resistance' })),
  ].filter(p => p.price < currentPrice); // only actual supports

  const clusters = clusterLevels(allPivots, 0.018);

  // Score and annotate each cluster
  const levels = clusters.map(cluster => {
    const score    = scoreLevel(cluster, candles.length, avgVolume, currentPrice);
    const distPct  = ((currentPrice - cluster.price) / currentPrice * 100).toFixed(2);
    const strength = score >= 60 ? 'strong' : score >= 35 ? 'moderate' : 'weak';
    const types    = [...new Set(cluster.pivots.map(p => p.type))].join(' + ');
    const volRatio = avgVolume > 0 ? (cluster.totalVol / (avgVolume * cluster.touches)).toFixed(1) : '—';

    return {
      price:       cluster.price,
      score,
      strength,
      touches:     cluster.touches,
      distPct:     +distPct,
      type:        types,
      volRatio,
      latestDate:  cluster.latestDate,
    };
  }).sort((a, b) => b.score - a.score); // sorted by score

  // EMAs
  const emas = {
    ema20:  calcEMA(candles, 20),
    ema50:  calcEMA(candles, 50),
    ema100: calcEMA(candles, 100),
    ema200: calcEMA(candles, 200),
  };

  return { sym, currentPrice, levels, emas, candles };
}

/* ── CANVAS CHART ────────────────────────────────────────── */
function drawChart(result) {
  const canvas = document.getElementById('ss-canvas');
  if (!canvas) return;

  const dpr  = window.devicePixelRatio || 1;
  const W    = canvas.offsetWidth  || 800;
  const H    = canvas.offsetHeight || 340;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx  = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const { candles, levels, emas, currentPrice } = result;
  const PAD = { top: 20, right: 20, bottom: 30, left: 70 };
  const CW  = W - PAD.left - PAD.right;
  const CH  = H - PAD.top  - PAD.bottom;

  // Price range — include all support levels + EMA levels in range
  const allLevelPrices = [
    ...levels.map(l => l.price),
    ...Object.values(emas),
  ];
  const allLows  = [...candles.map(c => c.low),  ...allLevelPrices];
  const allHighs = [...candles.map(c => c.high), currentPrice * 1.02];
  const minP = Math.min(...allLows)  * 0.993;
  const maxP = Math.max(...allHighs) * 1.007;
  const pRange = maxP - minP;

  const xScale = (i) => PAD.left + (i / (candles.length - 1)) * CW;
  const yScale = (p) => PAD.top  + (1 - (p - minP) / pRange) * CH;

  // Background
  ctx.fillStyle = '#0f1624';
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth   = 1;
  const gridLines = 6;
  for (let i = 0; i <= gridLines; i++) {
    const y = PAD.top + (i / gridLines) * CH;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    // Price label
    const price = maxP - (i / gridLines) * pRange;
    ctx.fillStyle   = 'rgba(100,116,139,0.8)';
    ctx.font        = '10px JetBrains Mono, monospace';
    ctx.textAlign   = 'right';
    ctx.fillText('₹' + price.toFixed(0), PAD.left - 5, y + 4);
  }

  // Volume bars (faint, at bottom)
  const maxVol = Math.max(...candles.map(c => c.volume || 0));
  const volH   = CH * 0.12;
  candles.forEach((c, i) => {
    const x   = xScale(i);
    const bW  = Math.max(CW / candles.length * 0.6, 1);
    const bH  = ((c.volume || 0) / maxVol) * volH;
    ctx.fillStyle = c.close >= c.open ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
    ctx.fillRect(x - bW / 2, PAD.top + CH - bH, bW, bH);
  });

  // Price line (gradient)
  const grad = ctx.createLinearGradient(PAD.left, 0, W - PAD.right, 0);
  grad.addColorStop(0,   'rgba(59,130,246,0.8)');
  grad.addColorStop(1,   'rgba(99,102,241,0.8)');

  ctx.beginPath();
  candles.forEach((c, i) => {
    const x = xScale(i);
    const y = yScale(c.close);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 1.5;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  // Price area fill
  ctx.beginPath();
  candles.forEach((c, i) => {
    const x = xScale(i);
    const y = yScale(c.close);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(xScale(candles.length - 1), PAD.top + CH);
  ctx.lineTo(PAD.left, PAD.top + CH);
  ctx.closePath();
  const areaGrad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + CH);
  areaGrad.addColorStop(0,   'rgba(59,130,246,0.1)');
  areaGrad.addColorStop(1,   'rgba(59,130,246,0)');
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // EMA lines
  const emaColors = {
    ema20:  { color: '#22d3ee', label: '20 EMA' },
    ema50:  { color: '#a78bfa', label: '50 EMA' },
    ema100: { color: '#fb923c', label: '100 EMA' },
    ema200: { color: '#facc15', label: '200 EMA' },
  };

  let emaLabelY = PAD.top + 14;
  for (const [key, cfg] of Object.entries(emaColors)) {
    const val = emas[key];
    if (!val || val < minP || val > maxP) continue;
    const y = yScale(val);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = cfg.color + '88';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    ctx.setLineDash([]);
    // Label
    ctx.fillStyle   = cfg.color;
    ctx.font        = 'bold 9px Inter, sans-serif';
    ctx.textAlign   = 'left';
    ctx.fillText(cfg.label + ' ₹' + val.toFixed(0), PAD.left + 4, y - 3);
  }

  // Support level lines
  const topLevels = levels.slice(0, 8); // draw top 8 by score
  topLevels.forEach(level => {
    if (level.price < minP || level.price > maxP) return;
    const y        = yScale(level.price);
    const color    = level.strength === 'strong' ? '#10b981' : level.strength === 'moderate' ? '#f59e0b' : '#64748b';
    const alpha    = level.strength === 'strong' ? 'cc' : level.strength === 'moderate' ? '99' : '55';
    const dashArr  = level.strength === 'strong' ? [] : [5, 4];

    ctx.setLineDash(dashArr);
    ctx.strokeStyle = color + alpha;
    ctx.lineWidth   = level.strength === 'strong' ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    ctx.setLineDash([]);

    // Right-side label
    ctx.fillStyle   = color;
    ctx.font        = 'bold 9px JetBrains Mono, monospace';
    ctx.textAlign   = 'right';
    ctx.fillText('₹' + level.price.toFixed(0), W - PAD.right - 2, y - 2);

    // Touch count badge on right
    ctx.fillStyle   = color + '22';
    const badgeW    = 28, badgeH = 12;
    const bx        = W - PAD.right - 32;
    ctx.fillRect(bx, y - badgeH / 2, badgeW, badgeH);
    ctx.fillStyle = color;
    ctx.font      = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${level.touches}x`, bx + badgeW / 2, y + 4);
  });

  // Current price line (dashed, white)
  const cy = yScale(currentPrice);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(226,232,240,0.5)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(W - PAD.right, cy); ctx.stroke();
  ctx.setLineDash([]);

  // CMP label
  ctx.fillStyle  = '#1e293b';
  ctx.fillRect(PAD.left + 4, cy - 9, 80, 16);
  ctx.fillStyle  = '#e2e8f0';
  ctx.font       = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign  = 'left';
  ctx.fillText('CMP ₹' + currentPrice.toFixed(0), PAD.left + 8, cy + 4);

  // X-axis date labels (first, middle, last)
  const datesToShow = [0, Math.floor(candles.length / 2), candles.length - 1];
  ctx.fillStyle  = 'rgba(100,116,139,0.8)';
  ctx.font       = '9px Inter, sans-serif';
  ctx.textAlign  = 'center';
  datesToShow.forEach(i => {
    const x = xScale(i);
    const d = candles[i].date;
    const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    ctx.fillText(label, x, H - 8);
  });

  // Tooltip on hover
  canvas._result = result;
}

/* Canvas tooltip */
function initCanvasTooltip() {
  const canvas  = document.getElementById('ss-canvas');
  let   tooltip = document.getElementById('ss-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'ss-tooltip';
    document.body.appendChild(tooltip);
  }

  canvas?.addEventListener('mousemove', (e) => {
    const result = canvas._result;
    if (!result) return;
    const rect   = canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const W      = rect.width;
    const PAD    = { left: 70, right: 20 };
    const CW     = W - PAD.left - PAD.right;
    const idx    = Math.round(((mx - PAD.left) / CW) * (result.candles.length - 1));
    const c      = result.candles[Math.max(0, Math.min(idx, result.candles.length - 1))];
    if (!c) return;
    const dateStr = c.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    tooltip.style.display = 'block';
    tooltip.style.left    = (e.clientX + 12) + 'px';
    tooltip.style.top     = (e.clientY - 10) + 'px';
    tooltip.innerHTML = `
      <div style="color:var(--text-muted);margin-bottom:4px">${dateStr}</div>
      <div>O: ₹${c.open?.toFixed(2)} &nbsp; H: ₹${c.high?.toFixed(2)}</div>
      <div>L: ₹${c.low?.toFixed(2)} &nbsp; C: <span style="color:#60a5fa">₹${c.close?.toFixed(2)}</span></div>
      <div style="color:var(--text-muted);margin-top:2px">Vol: ${(c.volume / 1e5).toFixed(1)}L</div>
    `;
  });

  canvas?.addEventListener('mouseleave', () => {
    if (tooltip) tooltip.style.display = 'none';
  });
}

/* ── RENDER RESULTS ──────────────────────────────────────── */
function renderSupportResults(result) {
  const { sym, currentPrice, levels, emas } = result;

  // Summary cards
  const nearest = levels.filter(l => l.price < currentPrice).sort((a, b) => b.price - a.price)[0];

  $('#ss-cur-price').textContent  = '₹' + fmt(currentPrice);
  $('#ss-count').textContent      = levels.length;
  $('#ss-chart-title').textContent = `${sym} — Price Chart with Support Zones`;

  if (nearest) {
    $('#ss-near-sup').textContent  = '₹' + fmt(nearest.price);
    $('#ss-near-dist').textContent = `${nearest.distPct.toFixed(2)}% below CMP`;
  }

  const strongest = levels[0];
  if (strongest) {
    $('#ss-strongest').textContent      = '₹' + fmt(strongest.price);
    $('#ss-strongest-score').textContent = `Score: ${strongest.score}/100 · ${strongest.touches} touches`;
  }

  // Support levels table
  const tbody = $('#ss-levels-tbody');
  if (tbody) {
    tbody.innerHTML = levels.slice(0, 15).map((l, i) => {
      const barW   = l.score + '%';
      const dateStr = l.latestDate
        ? l.latestDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
        : '—';
      const status = l.distPct <= 1.5 ? '<span class="at-support">⚡ At Support</span>'
                   : l.distPct <= 4   ? '<span class="near-support">🟡 Near Support</span>'
                   :                    '<span class="away">↓ Away</span>';
      const touchDots = Array.from({ length: Math.min(l.touches, 5) }, (_, k) =>
        `<span class="ss-touch-dot filled"></span>`
      ).join('') + Array.from({ length: Math.max(0, 5 - l.touches) }, () =>
        `<span class="ss-touch-dot"></span>`
      ).join('');

      return `
      <tr>
        <td style="color:var(--text-muted);font-weight:700">${i + 1}</td>
        <td class="price-cell" style="font-size:15px;font-weight:800">₹${fmt(l.price)}</td>
        <td><span class="ss-strength ${l.strength}">${l.strength}</span></td>
        <td>
          <div class="ss-score-bar">
            <div class="ss-score-track"><div class="ss-score-fill" style="width:${barW}"></div></div>
            <span class="mono" style="font-size:12px">${l.score}</span>
          </div>
        </td>
        <td style="font-size:11px;color:var(--text-muted)">${l.type}</td>
        <td><div class="ss-touches">${touchDots}<span class="mono" style="margin-left:4px;font-size:11px">${l.touches}</span></div></td>
        <td class="${l.distPct <= 2 ? 'positive' : 'negative'}" style="font-weight:700;font-family:'JetBrains Mono',monospace">${l.distPct.toFixed(2)}%</td>
        <td class="mono" style="color:var(--text-secondary)">${l.volRatio}x</td>
        <td class="mono" style="color:var(--text-muted);font-size:11px">${dateStr}</td>
        <td>${status}</td>
      </tr>`;
    }).join('');
  }

  // EMA grid
  const emaGrid = $('#ss-ema-grid');
  if (emaGrid) {
    const emaDefs = [
      { key:'ema20',  label:'20 EMA',  color:'#22d3ee' },
      { key:'ema50',  label:'50 EMA',  color:'#a78bfa' },
      { key:'ema100', label:'100 EMA', color:'#fb923c' },
      { key:'ema200', label:'200 EMA', color:'#facc15' },
    ];
    emaGrid.innerHTML = emaDefs.map(e => {
      const val   = emas[e.key];
      const above = currentPrice > val;
      const dist  = ((currentPrice - val) / currentPrice * 100).toFixed(2);
      return `
      <div class="ss-ema-card ${above ? 'above' : 'below'}">
        <div class="ss-ema-label">${e.label}</div>
        <div class="ss-ema-value" style="color:${e.color}">₹${fmt(val)}</div>
        <div class="ss-ema-dist ${above ? 'positive' : 'negative'}">${above ? '+' : ''}${dist}%</div>
        <div class="ss-ema-status ${above ? 'above' : 'below'}">${above ? '▲ Price Above' : '▼ Price Below'}</div>
      </div>`;
    }).join('');
  }

  // Draw canvas chart
  drawChart(result);
  initCanvasTooltip();
  SS.currentLevels = levels;
}

/* ── SCAN MODES ──────────────────────────────────────────── */
function setScanMode(mode) {
  SS.scanMode = mode;
  $('#ss-mode-single').classList.toggle('active', mode === 'single');
  $('#ss-mode-bulk').classList.toggle('active',   mode === 'bulk');
  document.getElementById('ss-single-panel').classList.toggle('hidden', mode !== 'single');
  document.getElementById('ss-bulk-panel').classList.toggle('hidden',   mode !== 'bulk');
}

async function runSingleScan() {
  const sym  = ($('#ss-symbol-input')?.value || '').trim().toUpperCase();
  if (!sym) { alert('Please enter an NSE symbol (e.g. INFY)'); return; }

  const range    = $('#ss-timeframe')?.value  || '6mo';
  const interval = $('#ss-interval')?.value   || '1d';
  const lookback = parseInt($('#ss-lookback')?.value || '5');

  const btn = $('#ss-scan-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }

  const result = document.getElementById('ss-result');
  result.classList.add('hidden');

  // Show loading in card area
  const scanCard = result.previousElementSibling;
  const loadingEl = document.createElement('div');
  loadingEl.className = 'ss-loading';
  loadingEl.id        = 'ss-loading';
  loadingEl.innerHTML = `<div class="ss-spinner"></div><span>Fetching ${sym} price history from Yahoo Finance…</span>`;
  scanCard.after(loadingEl);

  try {
    const data   = await fetchOHLCV(sym, range, interval);
    const analysed = analyzeSupports(data, lookback);
    SS.currentSym  = sym;
    SS.currentData = analysed;
    renderSupportResults(analysed);
    result.classList.remove('hidden');
  } catch (err) {
    const errEl = document.createElement('div');
    errEl.className = 'ss-error';
    errEl.innerHTML = `⚠️ Could not fetch data for <strong>${sym}</strong>. Check the symbol or try again. (${err.message})`;
    loadingEl.replaceWith(errEl);
    setTimeout(() => errEl.remove(), 6000);
    if (btn) { btn.disabled = false; btn.innerHTML = 'Scan Supports'; return; }
  } finally {
    document.getElementById('ss-loading')?.remove();
    if (btn) { btn.disabled = false; btn.innerHTML = 'Scan Supports'; }
  }
}

function quickScan(sym) {
  const input = $('#ss-symbol-input');
  if (input) input.value = sym;
  runSingleScan();
}

async function runBulkScan() {
  const syms = YF.STOCKS;
  const btn  = $('#ss-bulk-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }

  const progressWrap = document.getElementById('ss-bulk-progress');
  const progressFill = document.getElementById('ss-progress-fill');
  const progressLabel= document.getElementById('ss-progress-label');
  const bulkResult   = document.getElementById('ss-bulk-result');
  const tbody        = document.getElementById('ss-bulk-tbody');

  progressWrap.classList.remove('hidden');
  bulkResult.classList.add('hidden');
  if (tbody) tbody.innerHTML = '';

  const results = [];
  for (let i = 0; i < syms.length; i++) {
    const sym = syms[i];
    const pct = Math.round(((i + 1) / syms.length) * 100);
    if (progressFill)  progressFill.style.width  = pct + '%';
    if (progressLabel) progressLabel.textContent  = `Scanning ${sym}… (${i + 1}/${syms.length})`;

    try {
      const data     = await fetchOHLCV(sym, '6mo', '1d');
      const analysed = analyzeSupports(data, 5);
      const nearest  = analysed.levels.filter(l => l.price < analysed.currentPrice)
                                       .sort((a, b) => b.price - a.price)[0];
      results.push({ sym, ...analysed, nearest });
    } catch {
      results.push({ sym, currentPrice: null, nearest: null, levels: [], emas: {} });
    }

    // Throttle: 300ms between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  // Sort by nearest support % distance (ascending = closest to support first)
  results.sort((a, b) => {
    const da = a.nearest ? a.nearest.distPct : 999;
    const db = b.nearest ? b.nearest.distPct : 999;
    return da - db;
  });

  // Render
  if (tbody) {
    tbody.innerHTML = results.map(r => {
      if (!r.currentPrice) return `
        <tr>
          <td class="sym-name" onclick="quickScan('${r.sym}')" style="cursor:pointer">${r.sym}</td>
          <td colspan="9" style="color:var(--text-muted);font-size:12px">Data unavailable</td>
        </tr>`;

      const nearestPrice = r.nearest ? `₹${fmt(r.nearest.price)}` : '—';
      const nearestDist  = r.nearest ? `${r.nearest.distPct.toFixed(2)}%` : '—';
      const nearestStr   = r.nearest ? `<span class="ss-strength ${r.nearest.strength}">${r.nearest.strength}</span>` : '—';
      const distCls      = r.nearest && r.nearest.distPct <= 1.5 ? 'at-support'
                         : r.nearest && r.nearest.distPct <= 4   ? 'near-support' : 'away';
      return `
      <tr>
        <td><span class="sym-name" onclick="quickScan('${r.sym}')" style="cursor:pointer">${r.sym}</span></td>
        <td class="price-cell">₹${fmt(r.currentPrice)}</td>
        <td class="mono" style="color:#10b981;font-weight:700">${nearestPrice}</td>
        <td><span class="${distCls}">${nearestDist}</span></td>
        <td>${nearestStr}</td>
        <td class="mono" style="color:#22d3ee">${r.emas.ema20  ? '₹' + fmt(r.emas.ema20)  : '—'}</td>
        <td class="mono" style="color:#a78bfa">${r.emas.ema50  ? '₹' + fmt(r.emas.ema50)  : '—'}</td>
        <td class="mono" style="color:#facc15">${r.emas.ema200 ? '₹' + fmt(r.emas.ema200) : '—'}</td>
        <td><span class="rr-pill">${r.levels.length}</span></td>
        <td>
          <button class="tv-link" onclick="setScanMode('single');quickScan('${r.sym}')">📐 Detail</button>
        </td>
      </tr>`;
    }).join('');
  }

  progressWrap.classList.add('hidden');
  bulkResult.classList.remove('hidden');
  if (btn) { btn.disabled = false; btn.textContent = 'Scan All Stocks'; }
}

/* Redraw chart on window resize */
window.addEventListener('resize', () => {
  if (SS.currentData) drawChart(SS.currentData);
});

/* Keyboard shortcut: Enter in symbol input */
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('ss-symbol-input');
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') runSingleScan(); });
});

/* ============================================================
   NSE PROXY + TRADINGVIEW + OPTIONS CHAIN
   ============================================================ */

/* ── Config ─────────────────────────────────────────────── */
// On Vercel (or any web host) → use relative /api/* paths
// Locally via file:// or localhost → use local proxy server
const IS_HOSTED = window.location.protocol === 'https:' ||
                  (window.location.protocol === 'http:' && window.location.hostname !== 'localhost');
const PROXY_URL  = IS_HOSTED ? '' : 'http://localhost:3001';
let   USE_PROXY  = IS_HOSTED; // on Vercel always use the built-in API
let   OC_SYM     = 'NIFTY';
let   OC_EXPIRY  = '';
let   TV_WIDGET  = null;

/* ── Proxy Health Check ──────────────────────────────────── */
async function checkProxyServer() {
  try {
    const resp = await fetch(`${PROXY_URL}/api/status`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      USE_PROXY = true;
      setServerPill('online');
      updateSidebarSource('NSE Live · Real-time');
      console.log('[API] ✅ Data server reachable:', PROXY_URL || 'Vercel /api');
      return true;
    }
  } catch (_) {}
  if (IS_HOSTED) {
    // On Vercel, /api/* always exists — mark online even if status check failed
    USE_PROXY = true;
    setServerPill('online');
    updateSidebarSource('NSE + Yahoo Finance · Live');
    return true;
  }
  USE_PROXY = false;
  setServerPill('offline');
  updateSidebarSource('Yahoo Finance · 15-min delayed');
  console.log('[API] ⚠️  Local proxy not running — using Yahoo Finance');
  return false;
}

function setServerPill(state) {
  const pill  = document.getElementById('server-status-pill');
  const text  = document.getElementById('srv-state-text');
  if (!pill || !text) return;
  pill.className = `server-status-pill ${state}`;
  text.textContent = state === 'online' ? 'Live ✓' : state === 'offline' ? 'Offline' : 'Connecting…';
  // Options chain source label
  const ocSrc = document.getElementById('oc-data-source');
  if (ocSrc) ocSrc.textContent = state === 'online'
    ? '🟢 NSE Real-time Data'
    : '🔴 NSE Proxy Offline — start server.js';
}

function updateSidebarSource(label) {
  const el = document.querySelector('.sidebar-footer div[style]');
  if (el) el.textContent = '📡 ' + label;
}

/* Override refreshAll to try proxy first */
const _origRefreshAll = refreshAll;
async function refreshAllWithProxy() {
  if (USE_PROXY) {
    try { await fetchFromNSEProxy(); return; } catch (e) { console.warn('[Proxy] fetch failed, falling back:', e.message); }
  }
  await _origRefreshAll();
}

async function fetchFromNSEProxy() {
  setFetchStatus('loading');
  try {
    // Indices
    const idxResp = await fetch(`${PROXY_URL}/api/indices`);
    if (idxResp.ok) {
      const { data } = await idxResp.json();
      for (const [label, d] of Object.entries(data || {})) {
        if (!d || label === 'ts') continue;
        LIVE.indices[label] = { price: d.last, change: d.change, changePct: d.pChange };
      }
      updateTickerBar();
    }

    // Market status (updates sidebar data-source pill)
    try {
      const msResp = await fetch(`${PROXY_URL}/api/market-status`);
      if (msResp.ok) {
        const ms = await msResp.json();
        const state = ms?.data?.state || '';
        const srcEl = document.querySelector('.sidebar-footer div[style]');
        if (srcEl && state) {
          const isOpen = state.toLowerCase().includes('open');
          srcEl.textContent = `📡 NSE ${isOpen ? '🟢 Open' : '🔴 Closed'} · Real-time`;
        }
      }
    } catch (_) { /* market-status is non-critical */ }

    // Stocks (batch) — fetch current + compute volRatio vs previous day
    const stockStr = YF.STOCKS.join(',');
    const qResp    = await fetch(`${PROXY_URL}/api/quotes?symbols=${stockStr}`);
    if (qResp.ok) {
      const { data } = await qResp.json();

      // Build a volume baseline from the previous snapshot for volRatio
      for (const [sym, q] of Object.entries(data || {})) {
        if (!q) continue;
        const vol        = q.volume || 0;
        const prevSnap   = LIVE.quotes[sym];
        // Use the stored 10-day avg if we already have it, otherwise estimate from VWAP turnover
        const avgVol     = prevSnap?.avgVol || (q.vwap && vol ? Math.round(vol / 1.1) : vol) || 1;
        const volRatio   = avgVol > 0 ? +(vol / avgVol).toFixed(1) : 1;
        LIVE.quotes[sym] = {
          price:     q.lastPrice,
          change:    q.change,
          changePct: q.pChange,
          prevClose: q.prevClose,
          vwap:      q.vwap || 0,
          volume:    vol,
          volRatio,
          avgVol:    prevSnap?.avgVol || avgVol,
          name:      prevSnap?.name || sym,
        };
      }
      updateMomentumTable();
      updateOverviewStocks();
      updateModalIfOpen();
    }

    LIVE.lastUpdated = new Date();
    LIVE.fetchFailed = false;
    setFetchStatus('ok');
  } catch (err) {
    LIVE.fetchFailed = true;
    setFetchStatus('error');
    throw err;
  }
}

/* ── Override the original refreshAll ───────────────────── */
// Monkey-patch: replace the globally declared refreshAll
window._kenshoOrigRefresh = window.refreshAll || refreshAll;
window.refreshAll         = refreshAllWithProxy;

/* ── TradingView Chart Integration ───────────────────────── */
function openTVChart(sym) {
  const wrap = document.getElementById('tv-chart-wrap');
  const cont = document.getElementById('tradingview-chart');
  if (!wrap || !cont) return;

  // Clear previous widget
  cont.innerHTML = '';
  if (TV_WIDGET) { try { TV_WIDGET.remove(); } catch(_) {} TV_WIDGET = null; }

  wrap.classList.remove('hidden');

  if (typeof TradingView === 'undefined') {
    cont.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:13px">
      TradingView library not loaded. Check internet connection.</div>`;
    return;
  }

  TV_WIDGET = new TradingView.widget({
    container_id:     'tradingview-chart',
    width:            '100%',
    height:           420,
    symbol:           `NSE:${sym}`,
    interval:         'D',
    timezone:         'Asia/Kolkata',
    theme:            'dark',
    style:            '1',
    locale:           'in',
    toolbar_bg:       '#0f172a',
    enable_publishing: false,
    hide_top_toolbar:  false,
    hide_legend:       false,
    save_image:        false,
    hide_volume:       false,
    studies:          ['RSI@tv-basicstudies', 'MACD@tv-basicstudies', 'BB@tv-basicstudies'],
    show_popup_button: false,
    withdateranges:    true,
    allow_symbol_change: true,
    backgroundColor:  '#0b0e1a',
    gridColor:        'rgba(255,255,255,0.04)',
  });
}

/* Patch openModal to include TradingView chart */
const _origOpenModal = openModal;
window.openModal = function(sym) {
  _origOpenModal(sym);
  // Small delay so modal renders first
  setTimeout(() => openTVChart(sym), 300);
};

/* Patch closeModal to cleanup TV widget */
const _origCloseModal = closeModal;
window.closeModal = function() {
  _origCloseModal();
  const wrap = document.getElementById('tv-chart-wrap');
  if (wrap) wrap.classList.add('hidden');
  if (TV_WIDGET) { try { TV_WIDGET.remove(); } catch(_) {} TV_WIDGET = null; }
  const cont = document.getElementById('tradingview-chart');
  if (cont) cont.innerHTML = '';
};

/* ── OPTIONS CHAIN ───────────────────────────────────────── */
async function loadOptionsChain(sym, expiry = '') {
  OC_SYM    = sym;
  OC_EXPIRY = expiry;

  // Update active button
  document.querySelectorAll('.oc-sym-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.sym === sym);
  });

  const loading = document.getElementById('oc-loading');
  const errEl   = document.getElementById('oc-error');
  const msg     = document.getElementById('oc-loading-msg');
  if (loading) { loading.classList.remove('hidden'); msg.textContent = `Fetching ${sym} options chain from NSE…`; }
  if (errEl)   errEl.classList.add('hidden');

  if (!USE_PROXY) {
    if (loading) loading.classList.add('hidden');
    if (errEl) {
      errEl.classList.remove('hidden');
      errEl.innerHTML = `⚠️ NSE Proxy server is not running.<br>
        Start it with: <code style="background:rgba(255,255,255,0.07);padding:2px 6px;border-radius:4px">npm start</code>
        in <code style="background:rgba(255,255,255,0.07);padding:2px 6px;border-radius:4px">/Users/g.nagaraju/Documents/stock/</code>`;
    }
    return;
  }

  try {
    const url  = expiry
      ? `${PROXY_URL}/api/options/${sym}?expiry=${encodeURIComponent(expiry)}`
      : `${PROXY_URL}/api/options/${sym}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || 'Unknown error');

    if (loading) loading.classList.add('hidden');
    renderOptionsChain(json.data, sym);
  } catch (err) {
    if (loading) loading.classList.add('hidden');
    if (errEl) {
      errEl.classList.remove('hidden');
      errEl.innerHTML = `⚠️ Failed to load ${sym} options: ${err.message}`;
    }
  }
}

function refreshOptionsChain() {
  loadOptionsChain(OC_SYM, OC_EXPIRY);
}

function onOCExpiryChange() {
  const sel = document.getElementById('oc-expiry-select');
  OC_EXPIRY = sel?.value || '';
  loadOptionsChain(OC_SYM, OC_EXPIRY);
}

function renderOptionsChain(data, sym) {
  const { underlying, atm, expiryDates, strikes,
          totalCEOI, totalPEOI, maxCEOI, maxPEOI,
          pcr, maxPain, atmIV, timestamp } = data;

  // Update expiry selector
  const expSel = document.getElementById('oc-expiry-select');
  if (expSel && expiryDates.length) {
    expSel.innerHTML = expiryDates.map((d, i) =>
      `<option value="${d}" ${i === 0 ? 'selected' : ''}>${d}</option>`
    ).join('');
    if (!OC_EXPIRY) OC_EXPIRY = expiryDates[0];
  }

  // Summary cards
  const fmtOI = n => n >= 1e7 ? (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? (n / 1e5).toFixed(1) + ' L' : n.toLocaleString('en-IN');
  document.getElementById('oc-underlying').textContent = fmt(underlying);
  document.getElementById('oc-atm').textContent        = atm?.toLocaleString('en-IN') || '—';
  document.getElementById('oc-total-ce').textContent   = fmtOI(totalCEOI);
  document.getElementById('oc-total-pe').textContent   = fmtOI(totalPEOI);
  document.getElementById('oc-maxpain').textContent    = maxPain?.toLocaleString('en-IN') || '—';
  document.getElementById('oc-atm-iv').textContent     = atmIV ? atmIV.toFixed(1) + '%' : '—';

  // PCR with signal
  const pcrEl  = document.getElementById('oc-pcr');
  const pcrSig = document.getElementById('oc-pcr-signal');
  if (pcrEl) pcrEl.textContent = pcr.toFixed(2);
  if (pcrSig) {
    if      (pcr > 1.2) { pcrSig.textContent = '🟢 Bullish'; pcrSig.style.color = '#10b981'; }
    else if (pcr < 0.8) { pcrSig.textContent = '🔴 Bearish'; pcrSig.style.color = '#ef4444'; }
    else                { pcrSig.textContent = '🟡 Neutral';  pcrSig.style.color = '#f59e0b'; }
  }

  // Max Pain distance
  const mpDist = document.getElementById('oc-maxpain-dist');
  if (mpDist && underlying) {
    const d = ((maxPain - underlying) / underlying * 100).toFixed(2);
    mpDist.textContent = `${d >= 0 ? '+' : ''}${d}% from CMP`;
    mpDist.style.color = d >= 0 ? '#10b981' : '#ef4444';
  }

  // Timestamp
  const tsEl = document.getElementById('oc-timestamp');
  if (tsEl) tsEl.textContent = timestamp ? `🕐 ${timestamp}` : '';

  // OI Bar Chart (top strikes by total OI)
  renderOIBarChart(strikes, maxCEOI, maxPEOI, atm);

  // Options chain table
  renderOCTable(strikes, atm, maxCEOI, maxPEOI, underlying);
}

function renderOIBarChart(strikes, maxCEOI, maxPEOI, atm) {
  const container = document.getElementById('oc-oi-chart');
  if (!container) return;

  // Get top 15 strikes by combined OI, centered around ATM
  const atmIdx   = strikes.findIndex(s => s.strikePrice === atm);
  const start    = Math.max(0, atmIdx - 7);
  const visible  = strikes.slice(start, start + 15);
  const maxOI    = Math.max(maxCEOI, maxPEOI, 1);

  container.innerHTML = visible.map(s => {
    const ceW  = ((s.CE?.oi || 0) / maxOI * 100).toFixed(1);
    const peW  = ((s.PE?.oi || 0) / maxOI * 100).toFixed(1);
    const isATM= s.strikePrice === atm;
    return `
    <div class="oc-bar-row ${isATM ? 'oc-bar-atm' : ''}">
      <div class="oc-bar-ce-wrap"><div class="oc-bar-ce" style="width:${ceW}%"></div></div>
      <div class="oc-bar-strike">${s.strikePrice.toLocaleString('en-IN')}${isATM ? ' ⬤' : ''}</div>
      <div class="oc-bar-pe-wrap"><div class="oc-bar-pe" style="width:${peW}%"></div></div>
    </div>`;
  }).join('');
}

function renderOCTable(strikes, atm, maxCEOI, maxPEOI, underlying) {
  const tbody = document.getElementById('oc-tbody');
  if (!tbody) return;

  const fmtK = n => n >= 1e5 ? (n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n;
  const chgColor = n => n > 0 ? 'color:#10b981' : n < 0 ? 'color:#ef4444' : '';

  // Limit to ±20 strikes around ATM
  const atmIdx = strikes.findIndex(s => s.strikePrice === atm);
  const start  = Math.max(0, atmIdx - 15);
  const visible = strikes.slice(start, start + 35);

  tbody.innerHTML = visible.map(s => {
    const ce    = s.CE || {};
    const pe    = s.PE || {};
    const isATM = s.strikePrice === atm;
    const isITM_CE = s.strikePrice < underlying;  // CE ITM
    const isITM_PE = s.strikePrice > underlying;  // PE ITM

    const ceBarW = ((ce.oi || 0) / (maxCEOI || 1) * 100).toFixed(0);
    const peBarW = ((pe.oi || 0) / (maxPEOI || 1) * 100).toFixed(0);

    const rowCls = isATM ? 'oc-row-atm' : isITM_CE ? 'oc-row-itm-ce' : isITM_PE ? 'oc-row-itm-pe' : '';

    return `
    <tr class="${rowCls}">
      <td class="ce-col mono">${fmtK(ce.oi || 0)}</td>
      <td class="ce-col mono" style="${chgColor(ce.oiChg)}">${ce.oiChg > 0 ? '+' : ''}${fmtK(ce.oiChg || 0)}</td>
      <td class="ce-col mono">${fmtK(ce.vol || 0)}</td>
      <td class="ce-col mono" style="color:#a78bfa">${ce.iv ? ce.iv.toFixed(1) + '%' : '—'}</td>
      <td class="ce-col mono" style="color:#ef4444;font-weight:700">${fmt(ce.ltp || 0)}</td>
      <td class="ce-col oc-bar-col">
        <div class="oc-inline-bar-wrap">
          <div class="oc-inline-bar-ce" style="width:${ceBarW}%"></div>
        </div>
      </td>
      <td class="strike-col ${isATM ? 'atm-strike' : ''}">${s.strikePrice.toLocaleString('en-IN')}</td>
      <td class="pe-col oc-bar-col">
        <div class="oc-inline-bar-wrap pe">
          <div class="oc-inline-bar-pe" style="width:${peBarW}%"></div>
        </div>
      </td>
      <td class="pe-col mono" style="color:#10b981;font-weight:700">${fmt(pe.ltp || 0)}</td>
      <td class="pe-col mono" style="color:#a78bfa">${pe.iv ? pe.iv.toFixed(1) + '%' : '—'}</td>
      <td class="pe-col mono">${fmtK(pe.vol || 0)}</td>
      <td class="pe-col mono" style="${chgColor(pe.oiChg)}">${pe.oiChg > 0 ? '+' : ''}${fmtK(pe.oiChg || 0)}</td>
      <td class="pe-col mono">${fmtK(pe.oi || 0)}</td>
    </tr>`;
  }).join('');
}

/* ── BOOT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Check proxy server immediately and then every 30s
  checkProxyServer();
  setInterval(checkProxyServer, 30000);

  // If options chain tab gets activated, load data
  document.querySelectorAll('.nav-item[data-tab="options-chain"]').forEach(el => {
    el.addEventListener('click', () => {
      if (USE_PROXY) loadOptionsChain(OC_SYM);
    });
  });
}, { once: false });

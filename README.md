# 📊 Kensho Momentum Dashboard

> Momentum Dashboard for Intraday, Swing & Positional Traders — Live NSE data + TradingView Charts + Options Chain

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/YOUR_REPO)

## Features

- 🟢 **Live NSE Prices** — Real-time quotes via NSE India API
- 📈 **TradingView Charts** — Interactive candlestick charts for all NSE stocks
- 📋 **Options Chain** — NIFTY / BANKNIFTY / FINNIFTY with OI, PCR, Max Pain
- 🔍 **Support Scanner** — Detect key support levels from 6-month price history
- 📊 **Momentum Scanner** — 28 stocks with score, setup, signals, risk-reward
- 🏦 **Sector Heatmap** — Visual sector performance
- 🔄 **Yahoo Finance Fallback** — Auto-fallback if NSE is unavailable

## Quick Start (Local)

```bash
# Install dependencies
npm install

# Start the NSE proxy server (needed for real-time NSE data)
npm start

# Open dashboard
open index.html
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your GitHub repo
3. No build settings needed — Vercel auto-detects the static site + `/api` functions
4. Click **Deploy** ✓

**Note:** On Vercel, the `/api/*` serverless functions handle NSE data automatically. No local server needed.

## Architecture

```
Browser
├── index.html + style.css + app.js  (static frontend)

├── TradingView Widget               (live NSE charts, free)
└── /api/* endpoints                 (serverless on Vercel / Express locally)
    ├── /api/indices                 NSE → Yahoo Finance fallback
    ├── /api/quotes?symbols=...      NSE → Yahoo Finance fallback
    ├── /api/options?symbol=NIFTY    NSE options chain
    ├── /api/quote?symbol=INFY       Single stock detail
    └── /api/market-status           NSE market state
```

## Data Sources

| Data | Source | Fallback |
|------|--------|----------|
| Index prices | NSE India (real-time) | Yahoo Finance |
| Stock prices | NSE India (real-time) | Yahoo Finance |
| Options Chain | NSE India (real-time) | — |
| Candlestick charts | TradingView (live) | — |
| OHLCV history | Yahoo Finance chart API | — |

## Stack

- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Charts**: TradingView Widget (free) + HTML5 Canvas
- **Backend**: Node.js Express (local) / Vercel Serverless Functions (production)
- **Data**: NSE India API + Yahoo Finance API

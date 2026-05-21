# 🎯 Coins Sniper

**Delta Exchange India — Crypto Pattern Scanner**

Coins Sniper is a dedicated pattern scanner for Delta Exchange India's crypto perpetuals. 
Build custom EMA/RSI/DMI patterns and scan all USDT perpetuals across multiple timeframes.

## Features

- 🔶 **Delta India exclusive** — scans all live USDT perpetual futures
- 📊 **8 timeframes** — 1m, 3m, 5m, 15m, 30m, 1h, 4h, 1D (each has its own tab)
- 🔬 **Pattern Builder** — build custom EMA, RSI, DMI, price conditions
- 🔔 **Telegram alerts** — get notified when patterns fire
- ☁️ **Cloud sync** — settings synced via Firebase
- 📱 **Mobile-first PWA**

## Setup

1. Copy `.env.example` to `.env` and fill in your Firebase credentials
2. Deploy to Vercel — the `/api/` serverless functions proxy Delta's API (CORS bypass)
3. `npm install && npm run dev`

## Deployment (Vercel)

The `api/` folder contains two Vercel serverless functions:
- `api/delta-symbols.js` — fetches all live USDT perpetuals from Delta India
- `api/delta-candles.js` — proxies OHLCV candle data

Delta's API blocks browser requests (CORS). These serverless functions run server-side.

## Stack

React 18 + Vite + Firebase + Vercel

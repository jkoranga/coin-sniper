# Forex Scanner

**Multi-broker Forex Pattern Recognition & Alert System**

Forex Scanner is a pattern recognition application for major forex currency pairs. 
Detect harmonic patterns (Gartley, Butterfly, Bat), support/resistance breakouts, and momentum divergences across multiple timeframes.

## Features

- **Multi-broker support** — works with OANDA, Forex.com, and Alpaca APIs
- **12 timeframes** — 1m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1D, 1W
- **Harmonic Patterns** — Gartley, Butterfly, Bat, Crab, Shark patterns
- **Support/Resistance** — Auto-detected key levels with breakout alerts
- **Divergence Detection** — RSI/MACD divergence signals
- **Telegram/Email alerts** — Multi-channel notifications
- **Cloud sync** — Settings synced via Firebase
- **Mobile-first PWA**

## Setup

1. Copy `.env.example` to `.env` and configure API keys
2. `npm install && npm run dev`

## Stack

React 18 + Vite + Firebase + Recharts

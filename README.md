# Trading Journal

A full-stack personal trading journal with multi-user auth, a comprehensive analytics dashboard, goal tracking, CSV import, and trade management. Built with **Node.js + Express + PostgreSQL (Neon)** backend and a **React + Vite** frontend, hosted on **Render** (free tier).

---

## Features

### Dashboard
- **Goal Tracker** — set a P&L goal, track progress with a live progress bar, days remaining, required daily pace, and Fidelity/RH withdrawal tracking
- **16 KPIs** — Total P&L, Win Rate, Total Trades, Avg Daily P&L, Best/Worst Day, Avg Win/Loss Day, Max Drawdown, Expectancy, Best/Worst Month, Fidelity Withdrawn, RH Withdrawn, Volatility, Recovery Factor
- **Cumulative P&L chart** with time filters (1D / 1W / 1M / 3M / YTD / ALL)
- **Drawdown chart** — peak-to-trough drawdown over time
- **Daily P&L bar chart**, **Monthly bar chart**, **By Instrument donut chart**, **P&L calendar**
- **Monthly Gross Breakdown table** — gross profit, gross loss, net, win days, loss days per month

### Analytics
- **Streak analysis** — current and best win/loss streaks
- **Sharpe Ratio** and **Calmar Ratio** cards
- **Trade distribution histogram** — daily P&L bucketed frequency chart
- **Day-of-week performance chart** — average P&L by weekday
- **P&L by symbol** bar chart, **Win rate by symbol** bar chart

### Trade Journal
- Searchable and filterable trade table (by date, symbol, type, P&L)
- Expandable rows with full trade detail
- Entry reason, market context, exit notes, lessons learned fields
- Screenshot upload (stored as base64 in the database)
- **NDX §1256** — auto 60/40 LT/ST gain split for NDX/NDXP index options

### Import CSV
- Drag-and-drop or file-picker CSV import
- Auto-detects format: **Trades**, **Settings**, or **Withdrawals**
- Preview of first 3 rows before importing
- Import results summary (records imported / failed)

**Supported CSV formats:**

| Format | Required columns |
|--------|-----------------|
| Trades | `symbol, date_acquired, date_sold, proceeds, cost_basis, total_gl, trade_type` |
| Settings | `key, value` (keys: `tj_goal`, `tj_start_bal`, `tj_curr_bal`, `tj_rh_withdrawn`) |
| Withdrawals | `date` (MM/DD/YYYY), `amount` |

### Export
- Export trades as CSV or JSON with optional date range filtering

### Playbook
- Write and manage personal trading rules and playbook entries

### Auth
- JWT-based login (30-day token expiry)
- bcrypt password hashing — each user sees only their own data

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Database | PostgreSQL via [Neon](https://neon.tech) (free, serverless) |
| Frontend | React 18 + Vite |
| Auth | JWT + bcryptjs |
| Hosting | [Render](https://render.com) (free tier, auto-deploy from GitHub) |

---

## Local Development Setup

### Prerequisites
- **Node.js** v18+ — download from https://nodejs.org
- **PostgreSQL** (local) — or use a free [Neon](https://neon.tech) database

### 1. Clone the repository
```bash
git clone https://github.com/sumanthreddy29/trading-journal.git
cd trading-journal
```

### 2. Install dependencies
```bash
npm install          # server dependencies
cd client && npm install && cd ..   # frontend dependencies
```

### 3. Configure environment variables
```bash
cp .env.example .env
```
Edit `.env`:
```env
# Neon connection string or local Postgres URL
DATABASE_URL=postgresql://localhost:5432/trading_journal

# Generate a strong secret:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your-long-random-secret-here

PORT=3000
```

### 4. Build the frontend
```bash
npm run build
```
Outputs static files to `public/`.

### 5. Start the server
```bash
npm start
```
Open **http://localhost:3000**, register an account, and start logging trades.

> **Tip:** For hot-reload development, run `npm start` in one terminal and `cd client && npm run dev` in another. The Vite dev server proxies API calls to `localhost:3000`.

---

## Cloud Deployment (Render + Neon)

This is the recommended free-forever setup.

### Step 1 — Create a Neon database
1. Sign up at https://neon.tech (free tier, no credit card required)
2. Create a new project
3. Copy the **Connection string** from the dashboard (e.g. `postgresql://user:pass@host/dbname?sslmode=require`)

### Step 2 — Push to GitHub
```bash
git remote add origin https://github.com/YOUR_USERNAME/trading-journal.git
git push -u origin main
```

### Step 3 — Deploy on Render
1. Sign up at https://render.com
2. New → **Web Service** → connect your GitHub repo
3. Render auto-detects the `render.yaml` config in this repo
4. Under **Environment**, add these variables:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Neon connection string |
| `JWT_SECRET` | A long random string (generate with the command above) |

5. Click **Deploy** — Render builds the frontend and starts the server automatically

> **Auto-deploy:** Every `git push origin main` triggers a new Render deploy automatically.

### render.yaml (already in repo)
```yaml
services:
  - type: web
    name: trading-journal
    env: node
    buildCommand: npm install && npm run build
    startCommand: node server.js
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: JWT_SECRET
        generateValue: true
```

---

## Project Structure

```
trading-journal/
├── server.js              # Express API server + PostgreSQL schema init
├── package.json           # Server dependencies + build script
├── render.yaml            # Render deployment config
├── .env.example           # Environment variable template
└── client/                # React + Vite frontend
    ├── src/
    │   ├── App.jsx             # Root component, routing, state
    │   ├── api.js              # Fetch wrapper with auth header
    │   ├── components/
    │   │   ├── Auth.jsx            # Login / Register
    │   │   ├── Dashboard.jsx       # Main dashboard + Goal Tracker
    │   │   ├── Analytics.jsx       # Deep-dive analytics charts
    │   │   ├── Journal.jsx         # Trade table + detail rows
    │   │   ├── TradeForm.jsx       # Add / edit trade form
    │   │   ├── Import.jsx          # CSV import (trades/settings/withdrawals)
    │   │   ├── Export.jsx          # CSV/JSON export
    │   │   ├── Rules.jsx           # Trading playbook
    │   │   ├── DayModal.jsx        # Day-level trade breakdown modal
    │   │   ├── Sidebar.jsx         # Desktop navigation
    │   │   ├── MobileNav.jsx       # Mobile bottom navigation
    │   │   ├── Lightbox.jsx        # Screenshot full-screen viewer
    │   │   └── Toast.jsx           # Notification toasts
    │   └── utils/
    │       ├── stats.js            # P&L stats: drawdown, Sharpe, Calmar, etc.
    │       ├── canvas.js           # Canvas chart drawing functions
    │       └── helpers.js          # Date / formatting helpers
    └── public/             # Built output (generated by npm run build)
```

---

## API Reference

All routes require `Authorization: Bearer <token>` except `/api/register` and `/api/login`.

### Auth
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/register` | `{username, password}` | Create account |
| POST | `/api/login` | `{username, password}` | Returns JWT token |

### Trades
| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/trades` | — | All trades for logged-in user |
| POST | `/api/trades` | trade object | Create trade |
| PUT | `/api/trades/:id` | trade object | Update trade |
| DELETE | `/api/trades/:id` | — | Delete trade |

### Settings
| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/settings` | — | All settings as `{key: value}` map |
| POST | `/api/settings` | `{key, value}` | Upsert single setting |
| POST | `/api/settings/bulk` | `{settings: {key: value}}` | Upsert multiple settings |

### Withdrawals
| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/withdrawals` | — | All withdrawals |
| POST | `/api/withdrawals` | `{date, amount, note?}` | Add withdrawal |
| POST | `/api/withdrawals/bulk` | `{withdrawals: [{date, amount}]}` | Import multiple |
| PUT | `/api/withdrawals/:id` | `{date, amount, note?}` | Update withdrawal |
| DELETE | `/api/withdrawals/:id` | — | Delete withdrawal |

---

## License

MIT


## API Reference

All trade endpoints require `Authorization: Bearer <token>` header.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/register` | Create account `{username, password, email?}` |
| POST | `/api/login` | Login `{username, password}` → `{token, username}` |
| GET | `/api/trades` | Get all your trades |
| POST | `/api/trades` | Add a trade |
| PUT | `/api/trades/:id` | Update a trade |
| DELETE | `/api/trades/:id` | Delete a trade |
| GET | `/api/stats` | Summary stats |

### Trade object fields

```json
{
  "symbol": "NDX",
  "base_symbol": "NDX",
  "description": "CALL (NDX) NASDAQ 100 INDEX...",
  "trade_type": "CALL",
  "quantity": 1,
  "buy_price": 15.20,
  "sell_price": 18.50,
  "date_acquired": "01/15/2026",
  "date_sold": "01/15/2026",
  "proceeds": 1843.35,
  "cost_basis": 1526.65,
  "total_gl": 316.70,
  "same_day": true,
  "is_ndx": true,
  "lt_gl": 190.02,
  "st_gl": 126.68,
  "status": "closed",
  "entry_reason": "Strong support hold at 21500, momentum entry",
  "market_context": "Market recovering after CPI miss, NDX bouncing",
  "exit_notes": "Exited at target, clean move",
  "failure_reason": null,
  "screenshot_b64": "data:image/png;base64,...",
  "tags": "momentum,support"
}
```

---

## File Structure

```
trading-journal-server/
├── server.js          ← Express backend, API routes, SQLite
├── package.json       ← Dependencies
├── .env.example       ← Environment variable template
├── data/
│   └── journal.db     ← SQLite database (auto-created)
└── public/
    └── index.html     ← Full single-page app (login + dashboard)
```

---

## Backup

Your entire journal lives in one file: `data/journal.db`

To back it up: `cp data/journal.db data/journal_backup_$(date +%Y%m%d).db`

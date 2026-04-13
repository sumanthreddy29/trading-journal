# Trading Journal

A full-stack personal trading journal with multi-user auth, a comprehensive analytics dashboard, goal tracking, CSV import, and trade management. Built with **Node.js + Express + PostgreSQL (Neon)** backend and a **React + Vite** frontend, hosted on **Render** (free tier).

---

## Features

### Dashboard
- **Multi-Goal Tracker** — create multiple named goals with target amounts, start/end dates, and notes. Switch between goals, activate/deactivate, edit or delete — all from the dashboard UI. Progress bar, days remaining to end date, required daily pace, and per-broker withdrawal totals
- **16 KPIs** — Total P&L, Win Rate, Total Trades, Avg Daily P&L, Best/Worst Day, Avg Win/Loss Day, Max Drawdown, Expectancy, Best/Worst Month, Withdrawn by Broker, Volatility, Recovery Factor
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
- Auto-detects format: **Trades** or **Withdrawals** from column headers
- Preview of first 3 rows before committing import
- Import results summary (records imported / failed)
- Goals are managed directly from the Dashboard UI (no CSV import needed)

#### Trades CSV

Two column naming conventions are accepted — the importer maps both automatically:

| App field | Primary column | Alternate column |
|-----------|---------------|-----------------|
| symbol | `symbol` | `symbol` |
| trade_type | `trade_type` | `trade_type` |
| quantity | `quantity` | `quantity` |
| date_acquired | `date_acquired` | `buy_date` |
| date_sold | `date_sold` | `sell_date` |
| cost_basis | `cost_basis` | `buy_amount` |
| proceeds | `proceeds` | `sell_amount` |
| total_gl | `total_gl` | `net_pnl` |
| base_symbol | `base_symbol` | `full_symbol` (parenthetical stripped) |
| same_day | derived from dates | `same_day` (Yes/true) |

Optional columns (all ignored if absent): `description`, `lt_gl`, `st_gl`, `tags`, `entry_reason`, `market_context`, `exit_notes`, `failure_reason`

**Example:**
```csv
symbol,trade_type,quantity,buy_date,sell_date,buy_amount,sell_amount,net_pnl,source,full_symbol,description
NDXP,CALL,1,01/23/2026,01/23/2026,4100.67,4299.33,198.66,csv,NDXP260123C25600,CALL NDXP JAN 23 26 $25600
NVDA,STOCK,10,03/14/2025,02/02/2026,1192.50,1885.40,692.90,csv,NVDA,NVIDIA CORPORATION
```

#### Withdrawals CSV

| Column | Required | Description |
|--------|----------|-------------|
| `date` | ✅ | MM/DD/YYYY |
| `amount` | ✅ | Positive number |
| `source` | optional | Broker name: `fidelity`, `robinhood`, or any string (defaults to `fidelity`) |
| `note` | optional | Free-text note; also accepted as `description` |

**Example:**
```csv
date,amount,source,note
01/12/2026,2000,fidelity,Weekly withdrawal
02/04/2026,800,robinhood,
```

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
    │   │   ├── Import.jsx          # CSV import (trades + withdrawals only)
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

### Goals
| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/goals` | — | All goals (active first) |
| POST | `/api/goals` | `{name, target_amount, start_date?, end_date?, notes?, is_active?}` | Create goal |
| PUT | `/api/goals/:id` | `{name, target_amount, start_date?, end_date?, notes?}` | Update goal |
| POST | `/api/goals/:id/activate` | — | Set as active goal (deactivates others) |
| DELETE | `/api/goals/:id` | — | Delete goal (auto-promotes next if active) |

### Withdrawals
| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/withdrawals` | — | All withdrawals |
| POST | `/api/withdrawals` | `{date, amount, source?, note?}` | Add withdrawal |
| POST | `/api/withdrawals/bulk` | `{withdrawals: [{date, amount, source?, note?}]}` | Import multiple |
| PUT | `/api/withdrawals/:id` | `{date, amount, source?, note?}` | Update withdrawal |
| DELETE | `/api/withdrawals/:id` | — | Delete withdrawal |

---

## License

MIT

To back it up: `cp data/journal.db data/journal_backup_$(date +%Y%m%d).db`

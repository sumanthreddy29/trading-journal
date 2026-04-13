# Trading Journal — Server Edition

A full-stack personal trading journal with login, analytics dashboard, trade notes, and screenshot support. Built with Node.js + Express + SQLite.

---

## Features

- **Multi-user login** — register/login with JWT auth, each user sees only their own trades
- **Full dashboard** — Cumulative P&L, Daily P&L, Monthly, By Instrument charts + P&L calendar
- **Trade journal** — searchable/filterable table with expandable rows
- **Rich trade entry** — entry reason, market context, exit notes, failure/lessons field
- **Screenshot upload** — drag & drop a chart screenshot (stored in DB, no external service)
- **NDX §1256** — auto 60/40 LT/ST split preview for NDX/NDXP index options
- **Zero dependencies on CDNs** — fully self-hosted, works offline after install

---

## Quick Start

### 1. Install Node.js
Download from https://nodejs.org (version 18 or higher)

### 2. Install dependencies
```bash
cd trading-journal-server
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and set a strong `JWT_SECRET`:
```
JWT_SECRET=some-long-random-string-here
PORT=3000
```

### 4. Start the server
```bash
npm start
```

Open **http://localhost:3000** in your browser, register an account, and start logging trades.

---

## Deployment

### On a VPS / Linux server (Ubuntu/Debian)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone or upload your project
cd /home/youruser
git clone <your-repo> trading-journal
# OR scp the folder from your computer

cd trading-journal-server
npm install --production
cp .env.example .env
nano .env   # set JWT_SECRET and PORT

# Run with PM2 (keeps it alive after reboot)
sudo npm install -g pm2
pm2 start server.js --name trading-journal
pm2 save
pm2 startup
```

### Reverse proxy with Nginx (optional, for domain + HTTPS)

```nginx
server {
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then add HTTPS with: `sudo certbot --nginx -d yourdomain.com`

### Deploy to Railway.app (easiest cloud option)

1. Create account at https://railway.app
2. New Project → Deploy from GitHub repo
3. Add environment variable: `JWT_SECRET=your-secret-here`
4. Railway auto-detects Node.js and runs `npm start`

> **Note on screenshots:** Railway and similar platforms have ephemeral filesystems. Screenshots in this app are stored as base64 in the SQLite database, so they persist as long as your database file does. For Railway, mount a persistent volume and set `DB_PATH=/data/journal.db`.

---

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
  "symbol": "NDXP",
  "base_symbol": "NDXP",
  "description": "CALL (NDXP) NASDAQ 100 INDEX...",
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

// ═══════════════════════════════════════════════════
//  Trading Journal — Express + PostgreSQL Backend
//  Hosted on Render · Database on Neon (PostgreSQL)
// ═══════════════════════════════════════════════════
require('dotenv').config();
const express     = require('express');
const { Pool }    = require('pg');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const path        = require('path');
const rateLimit   = require('express-rate-limit');

const app        = express();
const PORT       = process.env.PORT || 3000;
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET env variable is not set. Refusing to start.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// ── PostgreSQL connection pool ────────────────────
// Set DATABASE_URL in your environment (Neon connection string or local Postgres)
// Strip sslmode query param from the URL — we set SSL explicitly below to avoid
// pg-connection-string's deprecation warning about 'require' vs 'verify-full'.
const dbUrl = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
  : undefined;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: true }  // Neon: full certificate verification
    : false
});

// ── Create tables on startup ──────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      email         TEXT,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trades (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol          TEXT    NOT NULL,
      base_symbol     TEXT    NOT NULL DEFAULT '',
      description     TEXT    NOT NULL DEFAULT '',
      trade_type      TEXT    NOT NULL DEFAULT 'CALL',
      quantity        REAL    NOT NULL DEFAULT 1,
      buy_price       REAL    NOT NULL DEFAULT 0,
      sell_price      REAL    NOT NULL DEFAULT 0,
      date_acquired   TEXT    NOT NULL,
      date_sold       TEXT    NOT NULL,
      proceeds        REAL    NOT NULL DEFAULT 0,
      cost_basis      REAL    NOT NULL DEFAULT 0,
      total_gl        REAL    NOT NULL DEFAULT 0,
      same_day        BOOLEAN NOT NULL DEFAULT TRUE,
      is_ndx          BOOLEAN NOT NULL DEFAULT FALSE,
      lt_gl           REAL,
      st_gl           REAL,
      status          TEXT    NOT NULL DEFAULT 'closed',
      entry_reason    TEXT,
      market_context  TEXT,
      exit_notes      TEXT,
      failure_reason  TEXT,
      screenshot_b64  TEXT,
      screenshot_name TEXT,
      tags            TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rules (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text        TEXT    NOT NULL,
      order_idx   INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trade_rules (
      trade_id  INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      rule_id   INTEGER NOT NULL REFERENCES rules(id)  ON DELETE CASCADE,
      followed  BOOLEAN NOT NULL DEFAULT TRUE,
      PRIMARY KEY (trade_id, rule_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key       TEXT    NOT NULL,
      value     TEXT    NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date       TEXT    NOT NULL,
      amount     REAL    NOT NULL,
      source     TEXT    NOT NULL DEFAULT 'fidelity',
      note       TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS goals (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           TEXT    NOT NULL,
      target_amount  REAL    NOT NULL,
      start_date     TEXT,
      end_date       TEXT,
      notes          TEXT,
      is_active      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Migrate existing withdrawals table — add source column if not present
  await pool.query(`
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'fidelity';
  `);
  console.log('✅ Database tables ready');
}

// ── Middleware ────────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiting on auth routes ─────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

// ── Auth middleware ───────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════

app.post('/api/register', authLimiter, async (req, res) => {
  const { username, password, email } = req.body;
  if (!username?.trim() || !password)
    return res.status(400).json({ error: 'Username and password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [username.trim(), email?.trim() || null, hash]
    );
    const id = result.rows[0].id;
    const token = jwt.sign({ id, username: username.trim() }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: username.trim() });
  } catch {
    res.status(400).json({ error: 'Username already taken' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = result.rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid username or password' });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

// ════════════════════════════════════════════════════
//  TRADE ROUTES
// ════════════════════════════════════════════════════

// GET all trades
app.get('/api/trades', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM trades WHERE user_id = $1 ORDER BY date_sold DESC, id DESC',
    [req.user.id]
  );
  res.json(result.rows);
});

// GET single trade
app.get('/api/trades/:id', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM trades WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Trade not found' });
  res.json(result.rows[0]);
});

// POST create trade
app.post('/api/trades', auth, async (req, res) => {
  const t = req.body;
  if (!t.symbol || !t.date_acquired)
    return res.status(400).json({ error: 'symbol and date_acquired are required' });

  const result = await pool.query(`
    INSERT INTO trades (
      user_id, symbol, base_symbol, description, trade_type, quantity,
      buy_price, sell_price, date_acquired, date_sold,
      proceeds, cost_basis, total_gl,
      same_day, is_ndx, lt_gl, st_gl, status,
      entry_reason, market_context, exit_notes, failure_reason,
      screenshot_b64, screenshot_name, tags
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,$24,$25
    ) RETURNING id`,
    [
      req.user.id,
      t.symbol?.toUpperCase(),
      (t.base_symbol || t.symbol)?.toUpperCase(),
      t.description || t.symbol?.toUpperCase(),
      t.trade_type  || 'CALL',
      t.quantity    ?? 1,
      t.buy_price   ?? 0,
      t.sell_price  ?? 0,
      t.date_acquired,
      t.date_sold   || t.date_acquired,
      t.proceeds    ?? 0,
      t.cost_basis  ?? 0,
      t.total_gl    ?? 0,
      t.same_day !== undefined ? t.same_day : (t.date_acquired === (t.date_sold || t.date_acquired)),
      t.is_ndx      ?? false,
      t.lt_gl       ?? null,
      t.st_gl       ?? null,
      t.status      || 'closed',
      t.entry_reason    || null,
      t.market_context  || null,
      t.exit_notes      || null,
      t.failure_reason  || null,
      t.screenshot_b64  || null,
      t.screenshot_name || null,
      t.tags            || null,
    ]
  );
  res.status(201).json({ id: result.rows[0].id, ...t });
});

// PUT update trade
app.put('/api/trades/:id', auth, async (req, res) => {
  const existing = await pool.query(
    'SELECT * FROM trades WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!existing.rows[0]) return res.status(404).json({ error: 'Trade not found' });

  const e = existing.rows[0];
  const t = req.body;
  const m = (a, b) => (a !== undefined && a !== null) ? a : b;

  await pool.query(`
    UPDATE trades SET
      symbol=$1, base_symbol=$2, description=$3, trade_type=$4, quantity=$5,
      buy_price=$6, sell_price=$7, date_acquired=$8, date_sold=$9,
      proceeds=$10, cost_basis=$11, total_gl=$12,
      same_day=$13, is_ndx=$14, lt_gl=$15, st_gl=$16, status=$17,
      entry_reason=$18, market_context=$19, exit_notes=$20, failure_reason=$21,
      screenshot_b64=$22, screenshot_name=$23, tags=$24,
      updated_at=NOW()
    WHERE id=$25 AND user_id=$26`,
    [
      m(t.symbol,       e.symbol)?.toUpperCase(),
      m(t.base_symbol,  e.base_symbol)?.toUpperCase(),
      m(t.description,  e.description),
      m(t.trade_type,   e.trade_type),
      m(t.quantity,     e.quantity),
      m(t.buy_price,    e.buy_price),
      m(t.sell_price,   e.sell_price),
      m(t.date_acquired,e.date_acquired),
      m(t.date_sold,    e.date_sold),
      m(t.proceeds,     e.proceeds),
      m(t.cost_basis,   e.cost_basis),
      m(t.total_gl,     e.total_gl),
      t.same_day !== undefined ? t.same_day : e.same_day,
      t.is_ndx   !== undefined ? t.is_ndx   : e.is_ndx,
      m(t.lt_gl,            e.lt_gl),
      m(t.st_gl,            e.st_gl),
      m(t.status,           e.status),
      m(t.entry_reason,     e.entry_reason),
      m(t.market_context,   e.market_context),
      m(t.exit_notes,       e.exit_notes),
      m(t.failure_reason,   e.failure_reason),
      m(t.screenshot_b64,   e.screenshot_b64),
      m(t.screenshot_name,  e.screenshot_name),
      m(t.tags,             e.tags),
      req.params.id,
      req.user.id,
    ]
  );
  res.json({ success: true });
});

// DELETE trade
app.delete('/api/trades/:id', auth, async (req, res) => {
  const result = await pool.query(
    'DELETE FROM trades WHERE id=$1 AND user_id=$2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Trade not found' });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════
//  RULES ROUTES
// ══════════════════════════════════════════════════

// GET all rules for user
app.get('/api/rules', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM rules WHERE user_id = $1 ORDER BY order_idx ASC, id ASC',
    [req.user.id]
  );
  res.json(result.rows);
});

// POST create rule
app.post('/api/rules', auth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Rule text is required' });
  const count = await pool.query('SELECT COUNT(*) FROM rules WHERE user_id=$1', [req.user.id]);
  const order_idx = parseInt(count.rows[0].count);
  const result = await pool.query(
    'INSERT INTO rules (user_id, text, order_idx) VALUES ($1, $2, $3) RETURNING *',
    [req.user.id, text.trim(), order_idx]
  );
  res.status(201).json(result.rows[0]);
});

// PUT update rule text
app.put('/api/rules/:id', auth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Rule text is required' });
  const result = await pool.query(
    'UPDATE rules SET text=$1 WHERE id=$2 AND user_id=$3 RETURNING *',
    [text.trim(), req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Rule not found' });
  res.json(result.rows[0]);
});

// DELETE rule
app.delete('/api/rules/:id', auth, async (req, res) => {
  const result = await pool.query(
    'DELETE FROM rules WHERE id=$1 AND user_id=$2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Rule not found' });
  res.json({ success: true });
});

// POST reorder rules
app.post('/api/rules/reorder', auth, async (req, res) => {
  const { ids } = req.body; // ordered array of rule ids
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
  await Promise.all(ids.map((id, idx) =>
    pool.query('UPDATE rules SET order_idx=$1 WHERE id=$2 AND user_id=$3', [idx, id, req.user.id])
  ));
  res.json({ success: true });
});

// GET rule adherence for a trade
app.get('/api/trades/:id/rules', auth, async (req, res) => {
  // Verify trade belongs to user
  const trade = await pool.query('SELECT id FROM trades WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!trade.rows[0]) return res.status(404).json({ error: 'Trade not found' });
  const result = await pool.query(
    'SELECT rule_id, followed FROM trade_rules WHERE trade_id=$1',
    [req.params.id]
  );
  res.json(result.rows);
});

// POST save rule adherence for a trade
// Body: { rules: [{ rule_id, followed }] }
app.post('/api/trades/:id/rules', auth, async (req, res) => {
  const trade = await pool.query('SELECT id FROM trades WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!trade.rows[0]) return res.status(404).json({ error: 'Trade not found' });
  const { rules } = req.body;
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules must be an array' });
  // Delete existing then insert — simple upsert approach
  await pool.query('DELETE FROM trade_rules WHERE trade_id=$1', [req.params.id]);
  if (rules.length) {
    const values = rules.map((r, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(',');
    const params = [req.params.id, ...rules.flatMap(r => [r.rule_id, r.followed])];
    await pool.query(`INSERT INTO trade_rules (trade_id, rule_id, followed) VALUES ${values}`, params);
  }
  res.json({ success: true });
});

// ════════════════════════════════════════════════════
//  STATS ROUTE
app.get('/api/stats', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT
      COUNT(*)                                          AS total_trades,
      COALESCE(SUM(total_gl), 0)                        AS total_pnl,
      SUM(CASE WHEN total_gl > 0 THEN 1 ELSE 0 END)    AS wins,
      SUM(CASE WHEN total_gl < 0 THEN 1 ELSE 0 END)    AS losses,
      MAX(total_gl)                                     AS best_trade,
      MIN(total_gl)                                     AS worst_trade
    FROM trades WHERE user_id = $1
  `, [req.user.id]);
  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════
//  SETTINGS ROUTES
app.get('/api/settings', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT key, value FROM settings WHERE user_id = $1',
    [req.user.id]
  );
  const obj = {};
  result.rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

app.post('/api/settings', auth, async (req, res) => {
  const { key, value } = req.body;
  if (!key?.trim()) return res.status(400).json({ error: 'key is required' });
  await pool.query(
    'INSERT INTO settings (user_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, key) DO UPDATE SET value = $3',
    [req.user.id, key.trim(), String(value ?? '')]
  );
  res.json({ success: true });
});

app.post('/api/settings/bulk', auth, async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'settings object required' });
  for (const [key, value] of Object.entries(settings)) {
    await pool.query(
      'INSERT INTO settings (user_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, key) DO UPDATE SET value = $3',
      [req.user.id, key, String(value ?? '')]
    );
  }
  res.json({ success: true });
});

// ════════════════════════════════════════════════════
//  GOALS ROUTES
app.get('/api/goals', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM goals WHERE user_id = $1 ORDER BY is_active DESC, created_at ASC',
    [req.user.id]
  );
  res.json(result.rows);
});

app.post('/api/goals', auth, async (req, res) => {
  const { name, target_amount, start_date, end_date, notes, is_active } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!target_amount || isNaN(parseFloat(target_amount))) return res.status(400).json({ error: 'target_amount is required' });
  if (is_active) {
    await pool.query('UPDATE goals SET is_active = FALSE WHERE user_id = $1', [req.user.id]);
  }
  const result = await pool.query(
    'INSERT INTO goals (user_id, name, target_amount, start_date, end_date, notes, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [req.user.id, name.trim(), parseFloat(target_amount), start_date || null, end_date || null, notes || null, !!is_active]
  );
  res.status(201).json(result.rows[0]);
});

app.put('/api/goals/:id', auth, async (req, res) => {
  const { name, target_amount, start_date, end_date, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!target_amount || isNaN(parseFloat(target_amount))) return res.status(400).json({ error: 'target_amount is required' });
  const result = await pool.query(
    'UPDATE goals SET name=$1, target_amount=$2, start_date=$3, end_date=$4, notes=$5 WHERE id=$6 AND user_id=$7 RETURNING *',
    [name.trim(), parseFloat(target_amount), start_date || null, end_date || null, notes || null, req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Goal not found' });
  res.json(result.rows[0]);
});

app.post('/api/goals/:id/activate', auth, async (req, res) => {
  await pool.query('UPDATE goals SET is_active = FALSE WHERE user_id = $1', [req.user.id]);
  const result = await pool.query(
    'UPDATE goals SET is_active = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Goal not found' });
  res.json(result.rows[0]);
});

app.delete('/api/goals/:id', auth, async (req, res) => {
  const result = await pool.query(
    'DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING id, is_active',
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Goal not found' });
  // If deleted goal was active, promote the most recent remaining one
  if (result.rows[0].is_active) {
    await pool.query(
      `UPDATE goals SET is_active = TRUE WHERE user_id = $1 AND id = (
         SELECT id FROM goals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
       )`,
      [req.user.id]
    );
  }
  res.json({ success: true });
});

// ════════════════════════════════════════════════════
//  WITHDRAWALS ROUTES
app.get('/api/withdrawals', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY date ASC, id ASC',
    [req.user.id]
  );
  res.json(result.rows);
});

app.post('/api/withdrawals', auth, async (req, res) => {
  const { date, amount, source, note } = req.body;
  if (!date || !amount) return res.status(400).json({ error: 'date and amount are required' });
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) return res.status(400).json({ error: 'amount must be positive' });
  const result = await pool.query(
    'INSERT INTO withdrawals (user_id, date, amount, source, note) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [req.user.id, date, parseFloat(amount), source || 'fidelity', note || null]
  );
  res.status(201).json(result.rows[0]);
});

app.put('/api/withdrawals/:id', auth, async (req, res) => {
  const { date, amount, source, note } = req.body;
  if (!date || !amount) return res.status(400).json({ error: 'date and amount are required' });
  const result = await pool.query(
    'UPDATE withdrawals SET date=$1, amount=$2, source=$3, note=$4 WHERE id=$5 AND user_id=$6 RETURNING *',
    [date, parseFloat(amount), source || 'fidelity', note || null, req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Withdrawal not found' });
  res.json(result.rows[0]);
});

app.post('/api/withdrawals/bulk', auth, async (req, res) => {
  const { withdrawals } = req.body;
  if (!Array.isArray(withdrawals)) return res.status(400).json({ error: 'withdrawals array required' });
  const inserted = [];
  for (const w of withdrawals) {
    if (!w.date || !w.amount) continue;
    const r = await pool.query(
      'INSERT INTO withdrawals (user_id, date, amount, source, note) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, w.date, parseFloat(w.amount), w.source || 'fidelity', w.note || null]
    );
    inserted.push(r.rows[0]);
  }
  res.status(201).json({ inserted: inserted.length });
});

app.delete('/api/withdrawals/:id', auth, async (req, res) => {
  const result = await pool.query(
    'DELETE FROM withdrawals WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Withdrawal not found' });
  res.json({ success: true });
});

// ── Global error handler ──────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

// ── Start ─────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀  Trading Journal  →  http://localhost:${PORT}`);
      console.log(`🗄️   Database        →  PostgreSQL (${process.env.DATABASE_URL ? 'Neon' : 'local'})\n`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to connect to database:', err.message);
    process.exit(1);
  });

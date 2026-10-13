require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');

// const pool = mysql.createPool({
//   host: process.env.DB_HOST || 'localhost',
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASSWORD || '',
//   database: process.env.DB_NAME || 'item_purchase_db',
//   waitForConnections: true,
//   connectionLimit: 10,
//   dateStrings: true, // DATE columns come back as 'YYYY-MM-DD'
// });
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'item_purchase_db',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- helpers ---------- */
class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
const bad = (m, d) => new HttpError(400, m, d);
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const toId = (v, label = 'ID') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw bad(`Invalid ${label}`);
  return n;
};
const toDate = (v) => {
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : null;
  if (!d || isNaN(d) || d.toISOString().slice(0, 10) !== v) throw bad('Valid purchase date (YYYY-MM-DD) is required');
  return v;
};
const toName = (v, label) => {
  if (typeof v !== 'string' || !v.trim()) throw bad(`${label} is required`);
  if (v.trim().length > 150) throw bad(`${label} is too long (max 150)`);
  return v.trim();
};
const toStock = (v) => {
  if (v === '' || v === null || v === undefined || !Number.isInteger(Number(v))) throw bad('Stock must be a whole number');
  if (Number(v) < 0) throw bad('Stock cannot be negative');
  return Number(v);
};
const toActive = (v) => {
  if ([true, 1, '1', 'true'].includes(v)) return 1;
  if ([false, 0, '0', 'false'].includes(v)) return 0;
  throw bad('Active status is required (true/false)');
};

async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/* ---------- item types ---------- */
app.get('/api/item-types', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, type_name FROM item_types ORDER BY type_name');
  res.json(rows);
}));
app.post('/api/item-types', wrap(async (req, res) => {
  const name = toName(req.body.type_name, 'Item type name');
  const [r] = await pool.query('INSERT INTO item_types (type_name) VALUES (?)', [name]);
  res.status(201).json({ id: r.insertId, type_name: name });
}));
app.put('/api/item-types/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const name = toName(req.body.type_name, 'Item type name');
  const [r] = await pool.query('UPDATE item_types SET type_name=? WHERE id=?', [name, id]);
  if (!r.affectedRows) throw new HttpError(404, 'Item type not found');
  res.json({ id, type_name: name });
}));
app.delete('/api/item-types/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const [[{ c }]] = await pool.query('SELECT COUNT(*) c FROM items WHERE item_type_id=?', [id]);
  if (c) throw new HttpError(409, 'Item type is in use by items and cannot be deleted');
  const [r] = await pool.query('DELETE FROM item_types WHERE id=?', [id]);
  if (!r.affectedRows) throw new HttpError(404, 'Item type not found');
  res.json({ message: 'Item type deleted' });
}));

/* ---------- items ---------- */
// JOIN #1: item + item type
const ITEM_SQL = `
  SELECT i.id, i.name, it.type_name, i.item_type_id, i.purchase_date, i.stock_available, i.active,
    CASE WHEN i.stock_available = 0 THEN 'Out of Stock'
         WHEN i.stock_available <= 5 THEN 'Low Stock' ELSE 'In Stock' END AS availability
  FROM items i JOIN item_types it ON i.item_type_id = it.id`;

async function itemPayload(body) {
  const p = {
    name: toName(body.name, 'Item name'),
    item_type_id: null,
    purchase_date: toDate(body.purchase_date),
    stock_available: toStock(body.stock_available),
    active: toActive(body.active),
  };
  const typeId = Number(body.item_type_id);
  if (!Number.isInteger(typeId) || typeId <= 0) throw bad('Item type is required');
  const [t] = await pool.query('SELECT id FROM item_types WHERE id=?', [typeId]);
  if (!t.length) throw bad('Invalid item type');
  p.item_type_id = typeId;
  return p;
}

app.get('/api/items', wrap(async (req, res) => {
  const [rows] = await pool.query(ITEM_SQL + ' ORDER BY i.id');
  res.json(rows);
}));
app.get('/api/items/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const [rows] = await pool.query(ITEM_SQL + ' WHERE i.id=?', [id]);
  if (!rows.length) throw new HttpError(404, 'Item not found');
  const [purchases] = await pool.query(
    `SELECT p.id AS purchase_id, p.order_id, p.purchase_date, pi.quantity
     FROM purchase_items pi JOIN purchases p ON pi.purchase_id = p.id
     WHERE pi.item_id=? ORDER BY p.id DESC`, [id]);
  res.json({ ...rows[0], purchases });
}));
app.post('/api/items', wrap(async (req, res) => {
  const p = await itemPayload(req.body);
  const [r] = await pool.query(
    'INSERT INTO items (name, purchase_date, stock_available, item_type_id, active) VALUES (?,?,?,?,?)',
    [p.name, p.purchase_date, p.stock_available, p.item_type_id, p.active]);
  const [rows] = await pool.query(ITEM_SQL + ' WHERE i.id=?', [r.insertId]);
  res.status(201).json(rows[0]);
}));
app.put('/api/items/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const p = await itemPayload(req.body);
  const [r] = await pool.query(
    'UPDATE items SET name=?, purchase_date=?, stock_available=?, item_type_id=?, active=? WHERE id=?',
    [p.name, p.purchase_date, p.stock_available, p.item_type_id, p.active, id]);
  if (!r.affectedRows) throw new HttpError(404, 'Item not found');
  const [rows] = await pool.query(ITEM_SQL + ' WHERE i.id=?', [id]);
  res.json(rows[0]);
}));
app.delete('/api/items/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const [[{ c }]] = await pool.query('SELECT COUNT(*) c FROM purchase_items WHERE item_id=?', [id]);
  if (c) throw new HttpError(409, 'Item is used in purchase history and cannot be deleted. Mark it Inactive instead.');
  const [r] = await pool.query('DELETE FROM items WHERE id=?', [id]);
  if (!r.affectedRows) throw new HttpError(404, 'Item not found');
  res.json({ message: 'Item deleted' });
}));

/* ---------- purchases ---------- */
// Validates request lines; duplicate items in one order are merged (quantities summed).
function normLines(items) {
  if (!Array.isArray(items) || !items.length) throw bad('Purchase must contain at least one item');
  const m = new Map();
  items.forEach((l, i) => {
    if (!l || typeof l !== 'object') throw bad(`Line ${i + 1} is malformed`);
    const id = toId(l.item_id, 'item ID');
    const q = Number(l.quantity);
    if (!Number.isInteger(q) || q <= 0) throw bad('Quantity must be greater than zero');
    m.set(id, (m.get(id) || 0) + q);
  });
  return m;
}

// Locks items, validates using (new - old) delta, adjusts stock, rewrites purchase_items.
// For a new purchase oldMap is empty, so delta = full quantity.
async function applyLines(conn, purchaseId, newMap, oldMap) {
  const ids = [...new Set([...newMap.keys(), ...oldMap.keys()])].sort((a, b) => a - b);
  const [rows] = await conn.query(
    'SELECT id, name, stock_available, active FROM items WHERE id IN (?) ORDER BY id FOR UPDATE', [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const deltas = [];
  for (const id of ids) {
    const it = byId.get(id);
    if (!it) throw new HttpError(404, 'Item not found', { item_id: id });
    const delta = (newMap.get(id) || 0) - (oldMap.get(id) || 0);
    if (delta > 0 && !it.active)
      throw new HttpError(409, `Item is inactive and cannot be purchased: ${it.name}`, { item_id: id });
    if (delta > it.stock_available)
      throw new HttpError(409, `Insufficient stock for ${it.name}; available quantity: ${it.stock_available}`,
        { item_id: id, available: it.stock_available, requested: delta });
    if (delta) deltas.push([delta, id]);
  }
  for (const [delta, id] of deltas)
    await conn.query('UPDATE items SET stock_available = stock_available - ? WHERE id=?', [delta, id]);
  await conn.query('DELETE FROM purchase_items WHERE purchase_id=?', [purchaseId]);
  await conn.query('INSERT INTO purchase_items (purchase_id, item_id, quantity) VALUES ?',
    [[...newMap].map(([i, q]) => [purchaseId, i, q])]);
}

// JOIN #2: purchase + purchase_items + items + item_types
async function getPurchase(conn, id) {
  const [h] = await conn.query('SELECT id, order_id, purchase_date FROM purchases WHERE id=?', [id]);
  if (!h.length) throw new HttpError(404, 'Purchase not found');
  const [lines] = await conn.query(
    `SELECT p.order_id, p.purchase_date, i.id AS item_id, i.name AS item_name, it.type_name,
            pi.quantity, i.stock_available, i.active
     FROM purchases p
     JOIN purchase_items pi ON p.id = pi.purchase_id
     JOIN items i ON pi.item_id = i.id
     JOIN item_types it ON i.item_type_id = it.id
     WHERE p.id = ? ORDER BY pi.id`, [id]);
  return { ...h[0], items: lines };
}

app.get('/api/purchases', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.id, p.order_id, p.purchase_date, COUNT(pi.id) AS line_count,
            COALESCE(SUM(pi.quantity),0) AS total_quantity
     FROM purchases p LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
     GROUP BY p.id, p.order_id, p.purchase_date ORDER BY p.id DESC`);
  res.json(rows);
}));
app.get('/api/purchases/:id', wrap(async (req, res) => {
  res.json(await getPurchase(pool, toId(req.params.id)));
}));
app.post('/api/purchases', wrap(async (req, res) => {
  const date = toDate(req.body.purchase_date);
  const lines = normLines(req.body.items);
  let custom = req.body.order_id;
  if (custom !== undefined && custom !== null && custom !== '') {
    if (typeof custom !== 'string' || !/^[A-Za-z0-9-]{1,30}$/.test(custom)) throw bad('Invalid order ID');
  } else custom = null;

  const created = await tx(async (conn) => {
    const [dup] = custom ? await conn.query('SELECT id FROM purchases WHERE order_id=?', [custom]) : [[]];
    if (dup.length) throw new HttpError(409, 'Order ID already exists');
    const tmp = custom || `TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [r] = await conn.query('INSERT INTO purchases (order_id, purchase_date) VALUES (?,?)', [tmp, date]);
    if (!custom)
      await conn.query('UPDATE purchases SET order_id=? WHERE id=?', ['PO-' + String(r.insertId).padStart(5, '0'), r.insertId]);
    await applyLines(conn, r.insertId, lines, new Map());
    return getPurchase(conn, r.insertId);
  });
  res.status(201).json(created);
}));
app.put('/api/purchases/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const date = toDate(req.body.purchase_date);
  const lines = normLines(req.body.items);
  const updated = await tx(async (conn) => {
    const [h] = await conn.query('SELECT id FROM purchases WHERE id=? FOR UPDATE', [id]);
    if (!h.length) throw new HttpError(404, 'Purchase not found');
    const [old] = await conn.query('SELECT item_id, quantity FROM purchase_items WHERE purchase_id=?', [id]);
    await conn.query('UPDATE purchases SET purchase_date=? WHERE id=?', [date, id]);
    await applyLines(conn, id, lines, new Map(old.map((o) => [o.item_id, o.quantity])));
    return getPurchase(conn, id);
  });
  res.json(updated);
}));
// NOTE: intentionally no DELETE /api/purchases route. Purchases are historical records.

/* ---------- errors ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON request' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Duplicate value already exists' });
  if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'Record is referenced by other data' });
  console.error(err); // full detail only in server logs
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));

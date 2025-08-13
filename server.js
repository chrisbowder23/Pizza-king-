import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "app.db");
const db = new Database(DB_PATH);

// Initialize DB if needed
db.exec(`
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'Pizza',
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  items_json TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
`);

// Seed if empty
const count = db.prepare("SELECT COUNT(*) AS c FROM menu_items").get().c;
if (count === 0) {
  const seed = db.prepare(`
    INSERT INTO menu_items (name, description, price_cents, category) VALUES
    ('Royal Feast', 'Pepperoni, Sausage, Mushrooms, Onions, Green Peppers', 1799, 'Specialty Pizza'),
    ('Pepperoni', 'Classic pepperoni and mozzarella', 1399, 'Pizza'),
    ('Cheese', 'Whole milk mozzarella', 1199, 'Pizza'),
    ('Breadsticks', 'Buttery, garlicky, with marinara', 699, 'Sides'),
    ('Cinnamon Stix', 'Sweet cinnamon sticks with icing', 699, 'Dessert'),
    ('2-Liter Soda', 'Pepsi, Diet Pepsi, Mountain Dew, Sierra Mist', 399, 'Drinks')
  `);
  seed.run();
}

const LOCATION = {
  name: "Pizza King — Converse",
  address: "200 W Wabash St, Converse, IN 46919",
  phone: "(765) 395-0000",
  hours: [
    { day: "Monday", open: "11:00 AM", close: "9:00 PM" },
    { day: "Tuesday", open: "11:00 AM", close: "9:00 PM" },
    { day: "Wednesday", open: "11:00 AM", close: "9:00 PM" },
    { day: "Thursday", open: "11:00 AM", close: "9:00 PM" },
    { day: "Friday", open: "11:00 AM", close: "10:00 PM" },
    { day: "Saturday", open: "11:00 AM", close: "10:00 PM" },
    { day: "Sunday", open: "12:00 PM", close: "9:00 PM" }
  ]
};

function currencyFromCents(cents) {
  return (cents / 100).toFixed(2);
}

// Views
app.get("/", (req, res) => {
  res.render("index", { location: LOCATION });
});

app.get("/menu", (req, res) => {
  const rows = db.prepare("SELECT * FROM menu_items WHERE is_active=1 ORDER BY category, name").all();
  const byCat = {};
  for (const r of rows) {
    byCat[r.category] = byCat[r.category] || [];
    byCat[r.category].push(r);
  }
  res.render("menu", { location: LOCATION, byCat, currencyFromCents });
});

app.get("/order", (req, res) => {
  res.render("order", { location: LOCATION });
});

// API
app.get("/api/menu", (req, res) => {
  const rows = db.prepare("SELECT id, name, description, price_cents, category FROM menu_items WHERE is_active=1 ORDER BY category, name").all();
  res.json({ items: rows });
});

app.post("/api/order", (req, res) => {
  const { customer_name, phone, cart } = req.body;
  if (!customer_name || !phone || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: "Missing name, phone, or cart" });
  }
  const ids = cart.map(i => i.id);
  // Build dynamic placeholders
  const placeholders = ids.map(() => "?").join(",");
  const dbItems = db.prepare(`SELECT id, name, price_cents FROM menu_items WHERE id IN (${placeholders})`).all(...ids);

  const priceMap = new Map(dbItems.map(i => [i.id, i.price_cents]));
  let total = 0;
  const normalized = cart.map(i => {
    const price = priceMap.get(i.id);
    const qty = Math.max(1, parseInt(i.qty || 1, 10));
    if (!price) throw new Error("Invalid item in cart");
    const lineTotal = price * qty;
    total += lineTotal;
    return { id: i.id, name: i.name, qty, price_cents: price, line_total_cents: lineTotal };
  });

  const id = nanoid(12);
  db.prepare("INSERT INTO orders (id, customer_name, phone, items_json, total_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, customer_name, phone, JSON.stringify(normalized), total, new Date().toISOString());

  // TODO: send to POS provider via webhook (Clover/Toast/etc.) using an integration server/secret
  res.json({ ok: true, order_id: id, total_cents: total });
});

// Basic admin
function requireAdmin(req, res, next) {
  const pass = process.env.ADMIN_PASSWORD || "changeme";
  if ((req.query.key || req.headers["x-admin-key"]) === pass) return next();
  res.status(401).send("Unauthorized");
}

app.get("/admin/orders", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY datetime(created_at) DESC LIMIT 200").all();
  res.render("admin", { orders: rows, currencyFromCents });
});

// 404
app.use((req, res) => {
  res.status(404).send("Not found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Pizza King Converse app listening on port ${PORT}`);
});

app.get("/contact", (req, res) => res.render("contact", { location: LOCATION }));
app.get("/status",  (req, res) => res.render("status",  { location: LOCATION }));

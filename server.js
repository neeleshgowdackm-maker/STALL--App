require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');

const { readDb, writeDb } = require('./lib/db');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('./lib/auth');
const { createCashfreeOrder, getCashfreeOrderStatus } = require('./lib/cashfree');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: '6mb' })); // generous limit — product photos travel as base64
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/backgrounds', express.static(path.join(__dirname, 'backgrounds')));

// ---------- auth middleware ----------
function authRequired(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const payload = verifyToken(token, JWT_SECRET);
  if (!payload) return res.status(401).json({ error: 'Session expired, please sign in again' });
  const db = readDb();
  const user = db.users.find(u => u.id === payload.id);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  req.user = user;
  next();
}

function paidRequired(req, res, next) {
  if (!req.user.paid) return res.status(402).json({ error: 'Subscription required' });
  next();
}

function setSessionCookie(res, userId) {
  const token = signToken({ id: userId }, JWT_SECRET);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  });
}

// ---------- auth routes ----------
app.post('/api/signup', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const db = readDb();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const id = crypto.randomBytes(6).toString('hex');
  db.users.push({
    id,
    email,
    passwordHash: hashPassword(password),
    paid: false,
    createdAt: new Date().toISOString()
  });
  db.stores[id] = { logo: null, background: { mode: 'default', index: null }, products: [] };
  writeDb(db);
  setSessionCookie(res, id);
  res.json({ id, email, paid: false });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !verifyPassword(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  setSessionCookie(res, user.id);
  res.json({ id: user.id, email: user.email, paid: user.paid });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/me', authRequired, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, paid: req.user.paid });
});

// ---------- payment routes (Cashfree) ----------
app.post('/api/payment/create-order', authRequired, async (req, res) => {
  const { phone } = req.body || {};
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'A valid 10-digit phone number is required by Cashfree' });
  }
  try {
    const orderId = `stall_${req.user.id}_${Date.now()}`;
    const order = await createCashfreeOrder({
      orderId,
      amount: 1,
      customerId: req.user.id,
      customerEmail: req.user.email,
      customerPhone: phone.replace(/\D/g, ''),
      returnUrl: `${BASE_URL}/api/payment/return?order_id={order_id}`
    });
    res.json({ orderId, paymentSessionId: order.payment_session_id });
  } catch (e) {
    console.error('Cashfree order creation failed:', e.message);
    res.status(500).json({ error: 'Could not start payment with Cashfree' });
  }
});

// Cashfree redirects the shopper's browser here after checkout — we re-check with
// Cashfree's servers before trusting it, rather than trusting the redirect itself.
app.get('/api/payment/return', async (req, res) => {
  const orderId = req.query.order_id;
  try {
    const status = await getCashfreeOrderStatus(orderId);
    if (status.order_status === 'PAID') {
      const userId = orderId.split('_')[1];
      const db = readDb();
      const user = db.users.find(u => u.id === userId);
      if (user) {
        user.paid = true;
        writeDb(db);
      }
    }
  } catch (e) {
    console.error('Payment verification on return failed:', e.message);
  }
  res.redirect('/?checked=1');
});

// Used by the dashboard to poll status if the redirect round-trip is slow.
app.get('/api/payment/status/:orderId', authRequired, async (req, res) => {
  try {
    const status = await getCashfreeOrderStatus(req.params.orderId);
    if (status.order_status === 'PAID') {
      const db = readDb();
      const user = db.users.find(u => u.id === req.user.id);
      if (user) {
        user.paid = true;
        writeDb(db);
      }
      return res.json({ paid: true });
    }
    res.json({ paid: false, status: status.order_status });
  } catch (e) {
    res.status(500).json({ error: 'Could not check payment status' });
  }
});

// ---------- store & product routes ----------

// Public — this is what a visitor's browser calls. No email, no account info, ever.
app.get('/api/store/:id', (req, res) => {
  const db = readDb();
  const store = db.stores[req.params.id];
  if (!store) return res.status(404).json({ error: 'Store not found' });
  res.json(store);
});

app.get('/api/store', authRequired, (req, res) => {
  const db = readDb();
  res.json(db.stores[req.user.id]);
});

app.put('/api/store/logo', authRequired, paidRequired, (req, res) => {
  const db = readDb();
  db.stores[req.user.id].logo = req.body.logo || null;
  writeDb(db);
  res.json({ ok: true });
});

app.put('/api/store/background', authRequired, paidRequired, (req, res) => {
  const db = readDb();
  db.stores[req.user.id].background = req.body.background || { mode: 'default', index: null };
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/products', authRequired, paidRequired, (req, res) => {
  const { name, url, image } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });
  const db = readDb();
  const product = { id: crypto.randomBytes(5).toString('hex'), name, url, image: image || null };
  db.stores[req.user.id].products.push(product);
  writeDb(db);
  res.json(db.stores[req.user.id].products);
});

app.put('/api/products/:productId', authRequired, paidRequired, (req, res) => {
  const db = readDb();
  const store = db.stores[req.user.id];
  const product = store.products.find(p => p.id === req.params.productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (req.body.image !== undefined) product.image = req.body.image;
  if (req.body.name !== undefined) product.name = req.body.name;
  if (req.body.url !== undefined) product.url = req.body.url;
  writeDb(db);
  res.json(store.products);
});

app.delete('/api/products/:productId', authRequired, paidRequired, (req, res) => {
  const db = readDb();
  const store = db.stores[req.user.id];
  store.products = store.products.filter(p => p.id !== req.params.productId);
  writeDb(db);
  res.json(store.products);
});

// ---------- pages ----------
app.get('/s/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'store.html'));
});

app.listen(PORT, () => {
  console.log(`Stall running at ${BASE_URL}`);
});

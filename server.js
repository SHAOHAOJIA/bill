const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'bill-system-secret-key-change-in-production';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

function filterBill(bill, role) {
  if (role === 'finance' || role === 'admin') return bill;
  const { unit_price, ...rest } = bill;
  return rest;
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.findUser(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', authenticate, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

app.get('/api/bills', authenticate, async (req, res) => {
  try {
    const bills = await db.getAll(req.query);
    const filtered = bills.map(b => filterBill(b, req.user.role));
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bills', authenticate, async (req, res) => {
  try {
    const bill = await db.create(req.body);
    io.emit('update', { type: 'create', bill });
    res.json(bill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/bills/:id', authenticate, requireRole('finance', 'admin'), async (req, res) => {
  try {
    const bill = await db.update(req.params.id, req.body);
    io.emit('update', { type: 'update', bill });
    res.json(bill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/bills/:id', authenticate, requireRole('finance', 'admin'), async (req, res) => {
  try {
    await db.delete(req.params.id);
    io.emit('update', { type: 'delete', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/companies', authenticate, async (req, res) => {
  try {
    const companies = await db.getCompanies();
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', authenticate, async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`出货账单系统已启动: http://localhost:${PORT}`);
});

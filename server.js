const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/bills', async (req, res) => {
  try {
    const bills = await db.getAll(req.query);
    res.json(bills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bills', async (req, res) => {
  try {
    const bill = await db.create(req.body);
    io.emit('update', { type: 'create', bill });
    res.json(bill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/bills/:id', async (req, res) => {
  try {
    const bill = await db.update(req.params.id, req.body);
    io.emit('update', { type: 'update', bill });
    res.json(bill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/bills/:id', async (req, res) => {
  try {
    await db.delete(req.params.id);
    io.emit('update', { type: 'delete', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/companies', async (req, res) => {
  try {
    const companies = await db.getCompanies();
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
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

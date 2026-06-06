const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'bills.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    company TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    total_amount REAL NOT NULL,
    paid REAL NOT NULL DEFAULT 0,
    unpaid REAL NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'waiter',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, async function() {
    const count = await query('SELECT COUNT(*) as c FROM users');
    if (count[0].c === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', hash, 'admin']);
      const hash2 = await bcrypt.hash('finance123', 10);
      await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['finance', hash2, 'finance']);
      const hash3 = await bcrypt.hash('waiter123', 10);
      await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['waiter', hash3, 'waiter']);
      console.log('默认用户已创建: admin/admin123, finance/finance123, waiter/waiter123');
    }
  });
});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

module.exports = {
  db,
  query,
  run,

  async getAll(filters = {}) {
    let sql = 'SELECT * FROM bills WHERE 1=1';
    const params = [];

    if (filters.month) {
      sql += ' AND strftime("%Y-%m", date) = ?';
      params.push(filters.month);
    }
    if (filters.company) {
      sql += ' AND company = ?';
      params.push(filters.company);
    }
    if (filters.unpaidOnly === 'true') {
      sql += ' AND unpaid > 0';
    }

    sql += ' ORDER BY date DESC, id DESC';
    return query(sql, params);
  },

  async create(bill) {
    const { date, company, quantity, unit_price, total_amount, paid, unpaid, note } = bill;
    const result = await run(
      'INSERT INTO bills (date, company, quantity, unit_price, total_amount, paid, unpaid, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [date, company, quantity, unit_price, total_amount, paid, unpaid, note || '']
    );
    return { id: result.id, ...bill };
  },

  async update(id, bill) {
    const { date, company, quantity, unit_price, total_amount, paid, unpaid, note } = bill;
    await run(
      'UPDATE bills SET date=?, company=?, quantity=?, unit_price=?, total_amount=?, paid=?, unpaid=?, note=? WHERE id=?',
      [date, company, quantity, unit_price, total_amount, paid, unpaid, note || '', id]
    );
    return { id: parseInt(id), ...bill };
  },

  async delete(id) {
    await run('DELETE FROM bills WHERE id=?', [id]);
    return { id: parseInt(id) };
  },

  async getCompanies() {
    const rows = await query('SELECT DISTINCT company FROM bills ORDER BY company');
    return rows.map(r => r.company);
  },

  async getStats() {
    const row = await query('SELECT SUM(quantity) as total_qty, SUM(total_amount) as total_amount, SUM(paid) as total_paid, SUM(unpaid) as total_unpaid, COUNT(CASE WHEN unpaid > 0 THEN 1 END) as unpaid_count FROM bills');
    return row[0];
  },

  async findUser(username) {
    const rows = await query('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0] || null;
  },

  async getUsers() {
    return query('SELECT id, username, role, created_at FROM users ORDER BY id');
  }
};

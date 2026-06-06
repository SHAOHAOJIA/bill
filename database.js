const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bills (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      company TEXT NOT NULL,
      quantity NUMERIC NOT NULL,
      unit_price NUMERIC NOT NULL,
      total_amount NUMERIC NOT NULL,
      paid NUMERIC NOT NULL DEFAULT 0,
      unpaid NUMERIC NOT NULL,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'waiter',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int as c FROM users');
  if (rows[0].c === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', ['admin', hash, 'admin']);
    const hash2 = await bcrypt.hash('finance123', 10);
    await pool.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', ['finance', hash2, 'finance']);
    const hash3 = await bcrypt.hash('waiter123', 10);
    await pool.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', ['waiter', hash3, 'waiter']);
    console.log('默认用户已创建: admin/admin123, finance/finance123, waiter/waiter123');
  }
}

init().catch(err => {
  console.error('数据库初始化失败:', err.message);
});

module.exports = {
  async getAll(filters = {}) {
    let sql = 'SELECT * FROM bills WHERE 1=1';
    const params = [];
    let idx = 1;

    if (filters.month) {
      sql += ` AND SUBSTR(date, 1, 7) = $${idx++}`;
      params.push(filters.month);
    }
    if (filters.company) {
      sql += ` AND company = $${idx++}`;
      params.push(filters.company);
    }
    if (filters.unpaidOnly === 'true') {
      sql += ' AND unpaid > 0';
    }

    sql += ' ORDER BY date DESC, id DESC';
    const { rows } = await pool.query(sql, params);
    return rows;
  },

  async create(bill) {
    const { date, company, quantity, unit_price, total_amount, paid, unpaid, note } = bill;
    const { rows } = await pool.query(
      'INSERT INTO bills (date, company, quantity, unit_price, total_amount, paid, unpaid, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [date, company, quantity, unit_price, total_amount, paid, unpaid, note || '']
    );
    return rows[0];
  },

  async update(id, bill) {
    const { date, company, quantity, unit_price, total_amount, paid, unpaid, note } = bill;
    const { rows } = await pool.query(
      'UPDATE bills SET date=$1, company=$2, quantity=$3, unit_price=$4, total_amount=$5, paid=$6, unpaid=$7, note=$8 WHERE id=$9 RETURNING *',
      [date, company, quantity, unit_price, total_amount, paid, unpaid, note || '', id]
    );
    return rows[0];
  },

  async delete(id) {
    await pool.query('DELETE FROM bills WHERE id=$1', [id]);
    return { id: parseInt(id) };
  },

  async getCompanies() {
    const { rows } = await pool.query('SELECT DISTINCT company FROM bills ORDER BY company');
    return rows.map(r => r.company);
  },

  async getStats() {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(quantity), 0)::float as total_qty,
        COALESCE(SUM(total_amount), 0)::float as total_amount,
        COALESCE(SUM(paid), 0)::float as total_paid,
        COALESCE(SUM(unpaid), 0)::float as total_unpaid,
        COUNT(CASE WHEN unpaid > 0 THEN 1 END)::int as unpaid_count
      FROM bills
    `);
    return rows[0];
  },

  async findUser(username) {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return rows[0] || null;
  },

  async getUsers() {
    const { rows } = await pool.query('SELECT id, username, role, created_at FROM users ORDER BY id');
    return rows;
  }
};

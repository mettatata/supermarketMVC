const db = require('../db');

const Transaction = {
  create: async (data) => {
    const sql = `INSERT INTO transactions (orderId, captureId, payerId, payerEmail, amount, currency, status, time)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [data.orderId, data.captureId || null, data.payerId, data.payerEmail, data.amount, data.currency, data.status, data.time];
    const [result] = await db.query(sql, params);
    return result;
  },

  getByOrderId: async (orderId) => {
    const sql = `SELECT orderId, captureId, payerId, payerEmail, amount, currency, status, time
                 FROM transactions
                 WHERE orderId = ?
                 ORDER BY id DESC
                 LIMIT 1`;
    const [rows] = await db.query(sql, [orderId]);
    return rows && rows.length ? rows[0] : null;
  },
  // Update transaction status by orderId
  updateStatusByOrderId: async (orderId, status) => {
    const sql = 'UPDATE transactions SET status = ? WHERE orderId = ?';
    const [result] = await db.query(sql, [status, orderId]);
    return result;
  }
};

module.exports = Transaction;
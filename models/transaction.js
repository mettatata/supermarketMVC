const db = require('../db');

const Transaction = {
  create: async (data) => {
    const sql = `INSERT INTO transactions (orderId, captureId, payerId, payerEmail, amount, currency, status, time, refundReason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [data.orderId, data.captureId || null, data.payerId, data.payerEmail, data.amount, data.currency, data.status, data.time, data.refundReason || null];
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
  updateStatusByOrderId: async (orderId, status, refundReason = null) => {
    let sql, params;
    if (refundReason) {
      sql = 'UPDATE transactions SET status = ?, refundReason = ? WHERE orderId = ?';
      params = [status, refundReason, orderId];
    } else {
      sql = 'UPDATE transactions SET status = ? WHERE orderId = ?';
      params = [status, orderId];
    }
    const [result] = await db.query(sql, params);
    return result;
  },

  // Get all refunds with reasons
  getAllRefunds: async () => {
    const sql = `SELECT orderId, refundReason, time FROM transactions WHERE status = 'REFUNDED'`;
    const [rows] = await db.query(sql);
    return rows || [];
  },

  // Get refunds filtered by month (YYYY-MM)
  getRefundsByMonth: async (monthKey) => {
    if (!monthKey) return await Transaction.getAllRefunds();
    const sql = `SELECT orderId, refundReason, time FROM transactions WHERE status = 'REFUNDED' AND DATE_FORMAT(time, '%Y-%m') = ?`;
    const [rows] = await db.query(sql, [monthKey]);
    return rows || [];
  }
};

module.exports = Transaction;
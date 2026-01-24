const db = require('../db');

const Orders = {
  // Create an order row and return result (insertId)
  createOrder: async (userId, totalAmount, address = null) => {
    const sql = 'INSERT INTO orders (userid, total, address, created_at) VALUES (?, ?, ?, NOW())';
    const [result] = await db.query(sql, [userId, totalAmount, address]);
    return result;
  },

  // Add multiple order items. `items` is array of { productId, quantity, price, total }
  addOrderItems: async (orderId, items, address = null) => {
    if (!items || !items.length) return null;

    const addressValue = address || '';
    for (let it of items) {
      const sql = `INSERT INTO order_details (id, orderid, productid, quantity, price, total, address)
        SELECT IFNULL(MAX(id),0)+1, ?, ?, ?, ?, ?, ? FROM order_details`;
      const params = [orderId, it.productId, it.quantity, it.price, it.total, addressValue];
      await db.query(sql, params);
    }
    return true;
  },

  getOrdersByUser: async (userId) => {
    const sql = 'SELECT id AS orderid, total, address, created_at FROM orders WHERE userid = ? ORDER BY created_at DESC';
    const [rows] = await db.query(sql, [userId]);
    return rows;
  },

  getOrderById: async (orderId) => {
    const sql = 'SELECT id AS orderid, userid, total, address, created_at FROM orders WHERE id = ? LIMIT 1';
    const [rows] = await db.query(sql, [orderId]);
    return rows && rows.length ? rows[0] : null;
  }
};

module.exports = Orders;

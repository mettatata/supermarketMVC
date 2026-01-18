const db = require('../db');

const Orders = {
  // Create an order row and return result (insertId)
  createOrder: async (userId, totalAmount) => {
    const sql = 'INSERT INTO orders (userid, total, created_at) VALUES (?, ?, NOW())';
    const [result] = await db.query(sql, [userId, totalAmount]);
    return result;
  },

  // Add multiple order items. `items` is array of { productId, quantity, price, total }
  addOrderItems: async (orderId, items) => {
    if (!items || !items.length) return null;
    
    for (let it of items) {
      const sql = `INSERT INTO order_details (id, orderid, productid, quantity, price, total) SELECT IFNULL(MAX(id),0)+1, ?, ?, ?, ?, ? FROM order_details`;
      const params = [orderId, it.productId, it.quantity, it.price, it.total];
      await db.query(sql, params);
    }
    return true;
  },

  // Get orders for a user. Select `id`, `total`, and `created_at` from `orders`.
  getOrdersByUser: async (userId) => {
    const sql = 'SELECT id AS orderid, total, created_at FROM orders WHERE userid = ? ORDER BY created_at DESC';
    const [rows] = await db.query(sql, [userId]);
    return rows;
  },

  // Get a single order by numeric id (internal PK). Returns userid, id AS orderid, total, created_at
  getOrderById: async (orderId) => {
    const sql = 'SELECT id AS orderid, userid, total, created_at FROM orders WHERE id = ? LIMIT 1';
    const [rows] = await db.query(sql, [orderId]);
    return rows && rows.length ? rows[0] : null;
  }
};

module.exports = Orders;

const db = require('../db');

const Orders = {
  // Create an order row and return result (insertId)
  createOrder(userId, totalAmount, callback) {
    const sql = 'INSERT INTO orders (userid, total, created_at) VALUES (?, ?, NOW())';
    db.query(sql, [userId, totalAmount], callback);
  },

  // Add multiple order items. `items` is array of { productId, quantity, price, total }
  // This uses a sequential insert fallback for tables without AUTO_INCREMENT.
  addOrderItems(orderId, items, callback) {
    if (!items || !items.length) return callback(null);
    let i = 0;
    const insertOne = () => {
      if (i >= items.length) return callback(null);
      const it = items[i];
      const sql = `INSERT INTO order_details (id, orderid, productid, quantity, price, total) SELECT IFNULL(MAX(id),0)+1, ?, ?, ?, ?, ? FROM order_details`;
      const params = [orderId, it.productId, it.quantity, it.price, it.total];
      db.query(sql, params, (err) => {
        if (err) return callback(err);
        i += 1;
        insertOne();
      });
    };
    insertOne();
  },

  // Get orders for a user. Select `id`, `total`, and `created_at` from `orders`.
  getOrdersByUser(userId, callback) {
    const sql = 'SELECT id AS orderid, total, created_at FROM orders WHERE userid = ? ORDER BY created_at DESC';
    db.query(sql, [userId], callback);
  }
  ,

  // Get a single order by numeric id (internal PK). Returns userid, id AS orderid, total, created_at
  getOrderById(orderId, callback) {
    const sql = 'SELECT id AS orderid, userid, total, created_at FROM orders WHERE id = ? LIMIT 1';
    db.query(sql, [orderId], (err, rows) => {
      if (err) return callback(err);
      if (!rows || !rows.length) return callback(null, null);
      return callback(null, rows[0]);
    });
  }
 };

module.exports = Orders;

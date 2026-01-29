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
  },

  // Get total number of orders (optionally filtered by month)
  getTotalOrdersCount: async (monthKey = null) => {
    const params = [];
    let whereClause = '';

    if (monthKey) {
      whereClause = 'WHERE DATE_FORMAT(created_at, "%Y-%m") = ?';
      params.push(monthKey);
    }

    const sql = `SELECT COUNT(*) as total FROM orders ${whereClause}`;
    const [rows] = await db.query(sql, params);
    return rows && rows.length ? rows[0].total : 0;
  },

  // Get total sales amount (optionally filtered by month)
  getTotalSalesAmount: async (monthKey = null) => {
    const params = [];
    let whereClause = '';

    if (monthKey) {
      whereClause = 'WHERE DATE_FORMAT(created_at, "%Y-%m") = ?';
      params.push(monthKey);
    }

    const sql = `SELECT COALESCE(SUM(total), 0) as total FROM orders ${whereClause}`;
    const [rows] = await db.query(sql, params);
    return rows && rows.length ? Number(rows[0].total) : 0;
  },

  // Get top products by quantity sold (optionally filtered by month)
  getTopProductsBySales: async (limit = 5, monthKey = null) => {
    const params = [];
    let whereClause = '';

    if (monthKey) {
      whereClause = 'WHERE DATE_FORMAT(o.created_at, "%Y-%m") = ?';
      params.push(monthKey);
    }

    const sql = `
      SELECT 
        od.productid,
        p.productName,
        SUM(od.quantity) as totalQuantity,
        ROUND(SUM(od.total), 2) as totalSales
      FROM order_details od
      LEFT JOIN orders o ON o.id = od.orderid
      LEFT JOIN products p ON p.id = od.productid
      ${whereClause}
      GROUP BY od.productid
      ORDER BY totalSales DESC
      LIMIT ?
    `;
    params.push(limit);
    const [rows] = await db.query(sql, params);
    return rows || [];
  },

  // Get all orders with optional month filter (YYYY-MM) and customer info
  getAllOrders: async (monthKey = null) => {
    const params = [];
    let whereClause = '';

    if (monthKey) {
      whereClause = 'WHERE DATE_FORMAT(o.created_at, "%Y-%m") = ?';
      params.push(monthKey);
    }

    const sql = `
      SELECT 
        o.id,
        o.userid,
        u.username,
        u.email,
        o.total,
        o.address,
        o.created_at,
        COUNT(od.id) as itemCount,
        SUBSTRING_INDEX(GROUP_CONCAT(t.payerId ORDER BY t.id DESC), ',', 1) as payerId,
        SUBSTRING_INDEX(GROUP_CONCAT(t.payerEmail ORDER BY t.id DESC), ',', 1) as payerEmail
      FROM orders o
      LEFT JOIN users u ON u.id = o.userid
      LEFT JOIN order_details od ON od.orderid = o.id
      LEFT JOIN transactions t ON t.orderId = o.id
      ${whereClause}
      GROUP BY o.id, o.userid, u.username, u.email, o.total, o.address, o.created_at
      ORDER BY o.created_at DESC
    `;
    const [rows] = await db.query(sql, params);
    return rows || [];
  }
};

module.exports = Orders;

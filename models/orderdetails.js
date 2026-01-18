const db = require('../db');

const OrderDetails = {
  // Hybrid version: get order details by order ID (callback or promise)
  getByOrderId: function (orderId, callback) {
    if (typeof callback === 'function') {
      OrderDetails._getByOrderIdAsync(orderId)
        .then(items => callback(null, items))
        .catch(err => callback(err));
      return;
    }

    return OrderDetails._getByOrderIdAsync(orderId);
  },

  // Async implementation for getByOrderId
  _getByOrderIdAsync: async function (orderId) {
    const sql = `SELECT od.id, od.orderid, od.productid, od.quantity, od.price, od.total,
      p.productName AS productname, p.price AS unitprice
      FROM order_details od
      LEFT JOIN products p ON p.id = od.productid
      WHERE od.orderid = ?`;
    const [results] = await db.query(sql, [orderId]);
    return results;
  }
};

module.exports = OrderDetails;

const db = require('../db');

const OrderDetails = {
  // Return order_items for a given order id, joined with product info when available
  // fields: id, orderid, productid, quantity, price, total, productname (if joined), product_image
  getByOrderId(orderId, callback) {
    const sql = `SELECT od.id, od.orderid, od.productid, od.quantity, od.price, od.total,
      p.productName AS productname, p.price AS unitprice
      FROM order_details od
      LEFT JOIN products p ON p.id = od.productid
      WHERE od.orderid = ?`;
    db.query(sql, [orderId], callback);
  }
};
exports.showOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await OrderModel.getById(orderId);
    const items = await OrderDetailsModel.getByOrderId(orderId);
    // compute lineTotal and grandTotal as above, then render
  } catch (err) {
    // handle error
  }
};
module.exports = OrderDetails;

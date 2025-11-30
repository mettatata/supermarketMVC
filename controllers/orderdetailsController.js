const Orders = require('../models/order');
const OrderDetails = require('../models/orderdetails');

const OrderDetailsController = {
  // GET /orderdetails?orderId=123
  showOrderDetails(req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in to view order details.');
      return res.redirect('/login');
    }

    const orderId = Number(req.query.orderId || req.query.id || 0);
    if (!orderId) {
      req.flash && req.flash('error', 'Invalid order id.');
      return res.redirect('/orders');
    }

    Orders.getOrderById(orderId, (err, order) => {
      if (err) {
        console.error('Error loading order:', err);
        req.flash && req.flash('error', 'Unable to load order.');
        return res.redirect('/orders');
      }
      if (!order) {
        req.flash && req.flash('error', 'Order not found.');
        return res.redirect('/orders');
      }

      const userId = user.userId || user.id;
      if (Number(order.userid) !== Number(userId)) {
        req.flash && req.flash('error', 'You are not authorized to view this order.');
        return res.redirect('/orders');
      }

      OrderDetails.getByOrderId(orderId, (err2, items) => {
        if (err2) {
          console.error('Error loading order items:', err2);
          req.flash && req.flash('error', 'Unable to load order items.');
          return res.redirect('/orders');
        }

        return res.render('ordersdetails', { user: user, order: order, orderDetails: items });
      });
    });

  exports.showOrderDetails = function (req, res) {
  const orderId = req.params.id || req.query.id;
  if (!orderId) {
    req.flash && req.flash('error', 'Order id required.');
    return res.redirect('/orders');
  }

  // fetch order and items in parallel (callback style)
  OrderModel.getById(orderId, function (err, order) {
    if (err || !order) {
      console.error('OrderModel.getById error:', err);
      req.flash && req.flash('error', 'Order not found.');
      return res.redirect('/orders');
    }

    OrderDetailsModel.getByOrderId(orderId, function (err2, items) {
      if (err2) {
        console.error('OrderDetailsModel.getByOrderId error:', err2);
        req.flash && req.flash('error', 'Unable to load order items.');
        return res.redirect('/orders');
      }

      // ensure arrays and numeric types
      items = Array.isArray(items) ? items : (items ? [items] : []);
      items = items.map(i => {
        const unit = Number(i.unitPrice || 0);
        const qty = Number(i.quantity || 0);
        return Object.assign({}, i, {
          unitPrice: unit,
          quantity: qty,
          lineTotal: unit * qty
        });
      });

      const grandTotal = items.reduce((s, it) => s + (it.lineTotal || 0), 0);

      // format date here or in view
      const timestamp = order.created_at || order.timestamp || order.date || order.createdAt;

      return res.render('ordersdetails', {
        order,
        orderId,
        timestamp,
        items,
        grandTotal
      });
    });
  });
};
}
};

module.exports = OrderDetailsController;
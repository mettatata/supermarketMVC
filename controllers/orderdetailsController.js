const Orders = require('../models/order');
const OrderDetails = require('../models/orderdetails');
const Transaction = require('../models/transaction');

const OrderDetailsController = {
  async showOrderDetails(req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in to view order details.');
      return res.redirect('/login');
    }

    try {
      const orderId = Number(req.query.orderId || req.query.id || 0);
      if (!orderId) {
        req.flash && req.flash('error', 'Invalid order id.');
        return res.redirect('/orders');
      }

      // Fetch order
      const order = await Orders.getOrderById(orderId);
      if (!order) {
        req.flash && req.flash('error', 'Order not found.');
        return res.redirect('/orders');
      }

      // Check authorization
      const userId = user.userId || user.id;
      if (Number(order.userid) !== Number(userId)) {
        req.flash && req.flash('error', 'You are not authorized to view this order.');
        return res.redirect('/orders');
      }

      // Fetch order items
      const items = await OrderDetails.getByOrderId(orderId);

      // Process items
      const processedItems = Array.isArray(items) ? items : (items ? [items] : []);
      const mappedItems = processedItems.map(i => {
        const unit = Number(i.unitPrice || i.price || 0);
        const qty = Number(i.quantity || 0);
        return Object.assign({}, i, {
          unitPrice: unit,
          quantity: qty,
          lineTotal: unit * qty
        });
      });

      const grandTotal = mappedItems.reduce((s, it) => s + (it.lineTotal || 0), 0);

      // Fetch transaction to get payment method
      const transaction = await Transaction.getByOrderId(orderId);
      let paymentMethod = 'N/A';
      if (transaction) {
        // Determine payment method from payerId field
        if (transaction.payerId === 'NETS') {
          paymentMethod = 'NETS QR';
        } else if (transaction.payerId || transaction.payerEmail) {
          paymentMethod = 'PayPal';
        }
      }

      return res.render('ordersdetails', {
        user: user,
        order: order,
        orderId: orderId,
        orderDetails: mappedItems,
        timestamp: order.created_at,
        grandTotal: grandTotal,
        transaction: transaction,
        paymentMethod: paymentMethod
      });
    } catch (err) {
      console.error('Error loading order details:', err);
      req.flash && req.flash('error', 'Unable to load order details.');
      return res.redirect('/orders');
    }
  }
};

module.exports = OrderDetailsController;
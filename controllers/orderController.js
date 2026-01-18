const cartitems = require('../models/cartitems');
const Orders = require('../models/order');
const SupermarketModel = require('../models/supermarket');

const OrderController = {
  // POST /order
  async createOrder(req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in to checkout.');
      return res.redirect('/login');
    }

    const userId = user.userId || user.id;

    try {
      // load cart rows
      const rows = await cartitems.getByUserId(userId);
      
      if (!rows || !rows.length) {
        req.flash && req.flash('error', 'Your cart is empty.');
        return res.redirect('/shopping');
      }

      // check stock availability for each cart item before creating order
      const removedItems = [];
      const adjustedItems = [];

      for (let r of rows) {
        try {
          const product = await SupermarketModel.getProductById({ id: r.productId });
          
          if (!product) {
            req.flash && req.flash('error', 'Product not found: ' + r.productId);
            return res.redirect('/cart');
          }

          const available = Number(product.quantity || 0);
          const want = Number(r.quantity || 0);
          
          if (available <= 0) {
            // remove the cart row for this product
            await cartitems.remove(userId, r.productId);
            removedItems.push({ productId: r.productId, name: product.productName || '' });
            r._removed = true;
          } else if (want > available) {
            // adjust cart to available amount
            await cartitems.updateQuantity(userId, r.productId, available, r.price || product.price || 0);
            r.quantity = available;
            r.total = (r.price || product.price || 0) * available;
            adjustedItems.push({ productId: r.productId, name: product.productName || '', old: want, now: available });
          }
        } catch (pErr) {
          console.error('Error checking product stock:', pErr);
          req.flash && req.flash('error', 'Could not verify product availability.');
          return res.redirect('/cart');
        }
      }

      // filter out removed items
      const finalRows = rows.filter(r => !r._removed);
      if (!finalRows || !finalRows.length) {
        // nothing left to order
        const msgParts = [];
        if (removedItems.length) msgParts.push('Some items were removed because they are out of stock.');
        if (adjustedItems.length) msgParts.push('Some item quantities were reduced due to limited stock.');
        if (msgParts.length) req.flash && req.flash('error', msgParts.join(' '));
        return res.redirect('/cart');
      }

      // compute total from adjusted cart rows
      const totalAmount = finalRows.reduce((sum, r) => sum + Number(r.total || (r.price * r.quantity) || 0), 0);

      // create order row
      const result = await Orders.createOrder(userId, totalAmount);
      const orderId = result && result.insertId;
      
      // prepare order_items payload
      const items = finalRows.map(r => ({
        productId: r.productId,
        quantity: r.quantity,
        price: r.price || 0,
        total: r.total || (r.price * r.quantity) || 0
      }));

      // Add order items
      await Orders.addOrderItems(orderId, items);

      // decrement stock for each product
      const failedDecrements = [];
      for (let it of items) {
        try {
          console.log('Decrementing stock for', it.productId, 'by', it.quantity);
          const dsRes = await SupermarketModel.decrementStock(it.productId, it.quantity);
          
          const affected = (dsRes && typeof dsRes.affectedRows === 'number') ? dsRes.affectedRows : null;
          if (!affected) {
            console.error('Stock not decremented (insufficient quantity) for', it.productId, 'wanted', it.quantity);
            failedDecrements.push({ productId: it.productId, error: 'insufficient_quantity' });
          } else {
            console.log('Stock decremented for', it.productId, 'affectedRows=', affected);
          }
        } catch (dsErr) {
          console.error('Failed to decrement stock for', it.productId, dsErr);
          failedDecrements.push({ productId: it.productId, error: dsErr });
        }
      }

      if (failedDecrements.length) {
        console.error('Some stock decrements failed:', failedDecrements);
        req.flash && req.flash('error', 'Order placed but some product stock updates failed. Contact support.');
      }

      // clear cart and finish
      return clearUserCartAndSession(userId, req, res, '/orders');
    } catch (err) {
      console.error('Error creating order:', err);
      req.flash && req.flash('error', 'Unable to create order.');
      return res.redirect('/cart');
    }
  }

  // GET /orders - list orders for current user
  ,async listOrders(req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in to view orders.');
      return res.redirect('/login');
    }
    const userId = user.userId || user.id;
    try {
      const rows = await Orders.getOrdersByUser(userId);
      return res.render('orders', { user: user, orders: rows });
    } catch (err) {
      console.error('Error loading orders:', err);
      req.flash && req.flash('error', 'Unable to load orders.');
      return res.redirect('/shopping');
    }
  }
  
};

module.exports = OrderController;

function clearUserCartAndSession(userId, req, res, nextRedirect='/orders') {
  cartitems.clear(userId, (err) => {
    if (err) console.error('Failed to clear cart after order:', err);
    if (req.session) {
      req.session.cart = [];
      req.session.save(saveErr => {
        if (saveErr) console.error('Session save error:', saveErr);
        req.flash && req.flash('success', 'Order placed successfully.');
        res.redirect(nextRedirect);
      });
    } else {
      req.flash && req.flash('success', 'Order placed successfully.');
      res.redirect(nextRedirect);
    }
  });
}

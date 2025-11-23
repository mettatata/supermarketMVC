const cartitems = require('../models/cartitems');
const Orders = require('../models/order');
const SupermarketModel = require('../models/supermarket');

const OrderController = {
  // POST /order
  createOrder(req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in to checkout.');
      return res.redirect('/login');
    }

    const userId = user.userId || user.id;

    // load cart rows
    cartitems.getByUserId(userId, (err, rows) => {
      if (err) {
        console.error('Error loading cart for order:', err);
        req.flash && req.flash('error', 'Could not create order.');
        return res.redirect('/cart');
      }

      if (!rows || !rows.length) {
        req.flash && req.flash('error', 'Your cart is empty.');
        return res.redirect('/shopping');
      }

      // compute total from cart rows (rows include .total)
      const totalAmount = rows.reduce((sum, r) => sum + Number(r.total || (r.price * r.quantity) || 0), 0);

      // check stock availability for each cart item before creating order
      let idx = 0;
      const checkNext = () => {
        if (idx >= rows.length) return createOrderRow();
        const r = rows[idx++];
        SupermarketModel.getProductById({ id: r.productId }, (pErr, product) => {
          if (pErr) {
            console.error('Error checking product stock:', pErr);
            req.flash && req.flash('error', 'Could not verify product availability.');
            return res.redirect('/cart');
          }
          if (!product) {
            req.flash && req.flash('error', 'Product not found: ' + r.productId);
            return res.redirect('/cart');
          }
          const available = Number(product.quantity || 0);
          const want = Number(r.quantity || 0);
          if (want > available) {
            req.flash && req.flash('error', `Not enough stock for ${product.productName || 'product'} (wanted ${want}, available ${available}).`);
            return res.redirect('/cart');
          }
          checkNext();
        });
      };

      const createOrderRow = () => {
        // create order row
        Orders.createOrder(userId, totalAmount, (err2, result) => {
        if (err2) {
          console.error('Error creating order:', err2);
          req.flash && req.flash('error', 'Unable to create order.');
          return res.redirect('/cart');
        }

        const orderId = result && result.insertId;
        // prepare order_items payload
        const items = rows.map(r => ({
          productId: r.productId,
          quantity: r.quantity,
          price: r.price || 0,
          total: r.total || (r.price * r.quantity) || 0
        }));

        Orders.addOrderItems(orderId, items, (err3) => {
          if (err3) {
            console.error('Error inserting order items:', err3);
            req.flash && req.flash('error', 'Order created but failed to save items. Contact support.');
            return res.redirect('/orders');
          }

            // decrement stock for each product
            let j = 0;
            const decNext = () => {
              if (j >= items.length) {
                // all done: clear cart and finish
                return clearUserCartAndSession(userId, req, res, '/orders');
              }
              const it = items[j++];
              SupermarketModel.decrementStock(it.productId, it.quantity, (dsErr) => {
                if (dsErr) console.error('Failed to decrement stock for', it.productId, dsErr);
                // continue even if decrement fails; we've already recorded the order
                decNext();
              });
            };
            decNext();
        });
      });
      };

      // start stock checks
      checkNext();
    });
  }

  // GET /orders - list orders for current user
  ,listOrders(req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in to view orders.');
      return res.redirect('/login');
    }
    const userId = user.userId || user.id;
    Orders.getOrdersByUser(userId, (err, rows) => {
      if (err) {
        console.error('Error loading orders:', err);
        req.flash && req.flash('error', 'Unable to load orders.');
        return res.redirect('/shopping');
      }
      return res.render('orders', { user: user, orders: rows });
    });
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

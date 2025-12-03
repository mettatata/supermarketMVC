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

      // check stock availability for each cart item before creating order
      let idx = 0;
      const removedItems = [];
      const adjustedItems = [];

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
          if (available <= 0) {
            // remove the cart row for this product
            cartitems.remove(userId, r.productId, (remErr) => {
              if (remErr) console.error('Failed removing out-of-stock cart item:', remErr);
              removedItems.push({ productId: r.productId, name: product.productName || '' });
              // also remove from rows array so it won't be ordered
              // mark by setting quantity to 0
              r._removed = true;
              checkNext();
            });
            return;
          }

          if (want > available) {
            // adjust cart to available amount
            cartitems.updateQuantity(userId, r.productId, available, r.price || product.price || 0, (upErr) => {
              if (upErr) console.error('Failed updating cart to available qty:', upErr);
              r.quantity = available;
              r.total = (r.price || product.price || 0) * available;
              adjustedItems.push({ productId: r.productId, name: product.productName || '', old: want, now: available });
              checkNext();
            });
            return;
          }

          // enough available, keep as-is
          checkNext();
        });
      };

      const createOrderRow = () => {
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
            const failedDecrements = [];
            const decNext = () => {
              if (j >= items.length) {
                if (failedDecrements.length) {
                  console.error('Some stock decrements failed:', failedDecrements);
                  req.flash && req.flash('error', 'Order placed but some product stock updates failed. Contact support.');
                }
                // all done (even if some decrements failed): clear cart and finish
                return clearUserCartAndSession(userId, req, res, '/orders');
              }
              const it = items[j++];
              console.log('Decrementing stock for', it.productId, 'by', it.quantity);
              SupermarketModel.decrementStock(it.productId, it.quantity, (dsErr, dsRes) => {
                if (dsErr) {
                  console.error('Failed to decrement stock for', it.productId, dsErr);
                  failedDecrements.push({ productId: it.productId, error: dsErr });
                } else {
                  // check affectedRows to ensure the conditional update happened
                  try {
                    const affected = (dsRes && typeof dsRes.affectedRows === 'number') ? dsRes.affectedRows : null;
                    if (!affected) {
                      console.error('Stock not decremented (insufficient quantity) for', it.productId, 'wanted', it.quantity);
                      failedDecrements.push({ productId: it.productId, error: 'insufficient_quantity' });
                    } else {
                      console.log('Stock decremented for', it.productId, 'affectedRows=', affected);
                    }
                  } catch (e) {
                    console.error('Error inspecting decrement result for', it.productId, e);
                  }
                }
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

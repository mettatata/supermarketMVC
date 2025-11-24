const SupermarketModel = require('../models/supermarket');
const cartitems = require('../models/cartitems');

const CartController = {
    // List cart (DB-backed)
    list: function (req, res) {
      const user = req.session && req.session.user;
      if (!user) {
        req.flash && req.flash('error', 'Please log in to view your cart.');
        return res.redirect('/login');
      }

      const userId = (user.userId || user.id);
      cartitems.getByUserId(userId, (err, rows) => {
        if (err) {
          console.error('cartitems.getByUserId error:', err);
          req.flash && req.flash('error', 'Unable to load cart.');
          return res.redirect('/shopping');
        }

        if (!rows || !rows.length) return res.render('cart', { user, cart: [], totalQty: 0, totalPrice: 0 });

        const cart = [];
        let totalQty = 0;
        let totalPrice = 0;
        let remaining = rows.length;

        rows.forEach(row => {
          SupermarketModel.getProductById({ id: row.productId }, (err2, product) => {
            if (err2) console.error('getProductById error in cart list:', err2);
            if (Array.isArray(product)) product = product[0];
            const item = {
              productId: String(row.productId),
              productName: product ? (product.productName || product.name) : 'Unknown',
              price: Number(product ? (product.price || 0) : 0),
              image: product ? product.image : null,
              quantity: Number(row.quantity || 0)
            };
            cart.push(item);
            totalQty += item.quantity;
            totalPrice += item.price * item.quantity;
            remaining -= 1;
            if (remaining === 0) return res.render('cart', { user, cart, totalQty, totalPrice });
          });
        });
      });
    },
  // Add product to user's cart
  addToCart: function (req, res) {

    const user = req.session && req.session.user;
    if (!user) {
        req.flash && req.flash('error', 'Please log in to add items to cart.');
        return res.redirect('/login');
    }

    const productId = req.body.productId || req.params.id;
    const qty = Number(req.body.quantity || 1);
    if (!productId) {
        req.flash && req.flash('error', 'No product specified.');
        // safe redirect: use referrer header or fallback to shopping page
        return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
    }

    SupermarketModel.getProductById({ id: productId }, function (err, product) {
        if (err) {
            console.error('getProductById error:', err);
            req.flash && req.flash('error', 'Unable to add product. Try again.');
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
        }

        // handle model returning array or single object
        if (Array.isArray(product)) product = product[0];
        if (!product) {
            req.flash && req.flash('error', 'Product not found.');
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
        }

        const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
        const unitPrice = product && (product.price || 0);
        // Prevent adding if product has no stock
        const available = Number(product.quantity || 0);
        if (available <= 0) {
          req.flash && req.flash('error', 'Product is out of stock.');
          return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
        }

        // check existing cart quantity for this user/product
        cartitems.getItem(userId, productId, (gErr, existing) => {
          if (gErr) {
            console.error('cartitems.getItem error:', gErr);
            req.flash && req.flash('error', 'Unable to add product to cart.');
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
          }
          const already = existing ? Number(existing.quantity || 0) : 0;
          const MAX_PER_USER = 10;
          const remainingCap = MAX_PER_USER - already;
          if (remainingCap <= 0) {
            req.flash && req.flash('error', `You already have the maximum of ${MAX_PER_USER} units of this product in your cart.`);
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
          }

          // compute allowed quantity based on stock and cap
          const spaceByStock = Math.max(0, available - already);
          let allowed = Math.min(qty, spaceByStock, remainingCap);
          if (allowed <= 0) {
            if (spaceByStock <= 0) {
              req.flash && req.flash('error', `Cannot add more of this product. Only ${available} available and ${already} already in your cart.`);
            } else {
              req.flash && req.flash('error', `You can add at most ${remainingCap} more unit(s) of this product (purchase limit ${MAX_PER_USER}).`);
            }
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
          }

          cartitems.add(userId, productId, allowed, unitPrice, function (errAdd) {
            if (errAdd) {
              console.error('cartitems.add error:', errAdd);
              // surface friendly message if cap reached
              const msg = (errAdd && errAdd.message && errAdd.message.indexOf('Maximum 10') !== -1) ? errAdd.message : 'Unable to add product to cart.';
              req.flash && req.flash('error', msg);
              return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
            }
            if (allowed < qty) {
              req.flash && req.flash('success', `Added ${allowed} unit(s) to cart (limited by stock or per-user cap).`);
            } else {
              req.flash && req.flash('success', 'Product added to cart.');
            }
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
          });
        });
    });
  },

  // Show cart page
  showCart: function (req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in to view your cart.');
      return res.redirect('/login');
    }
    const userId = (user.userId || user.id);
    // Load DB-backed cart items and render
   cartitems.getByUserId(userId, (err, rows) => {
      if (err) {
        console.error('cartitems.getByUserId error in showCart:', err);
        req.flash && req.flash('error', 'Unable to load cart.');
        return res.redirect('/shopping');
      }

      if (!rows || !rows.length) return res.render('cart', { user, cart: [], totalQty: 0, totalPrice: 0 });

      const cart = [];
      let totalQty = 0;
      let totalPrice = 0;
      let remaining = rows.length;

      rows.forEach(row => {
        SupermarketModel.getProductById({ id: row.productId }, (err2, product) => {
          if (err2) console.error('getProductById error in showCart:', err2);
          if (Array.isArray(product)) product = product[0];
          const item = {
            productId: String(row.productId),
            productName: product ? (product.productName || product.name) : 'Unknown',
            price: Number(product ? (product.price || 0) : 0),
            image: product ? product.image : null,
            quantity: Number(row.quantity || 0)
          };
          cart.push(item);
          totalQty += item.quantity;
          totalPrice += item.price * item.quantity;
          remaining -= 1;
          if (remaining === 0) return res.render('cart', { user, cart, totalQty, totalPrice });
        });
      });
    });
  },

  // Remove product from cart (decrease or remove)
  removeFromCart: function (req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in.');
      return res.redirect('/login');
    }
    const productId = req.body.productId || req.params.id;
    if (!productId) return res.redirect('back');
    const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
    cartitems.remove(userId, productId, (err) => {
      if (err) {
        console.error('cartitems.remove error:', err);
        req.flash && req.flash('error', 'Could not remove item');
        return res.redirect('/cart');
      }
      req.flash && req.flash('success', 'Item removed from cart.');
      return res.redirect('/cart');
    });
  },

  // Decrease quantity of an item by one. If quantity reaches 0, remove the item.
  decreaseByOne: function (req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in.');
      return res.redirect('/login');
    }

    const productId = req.params.id || req.body.productId;
    if (!productId) {
      return res.redirect(req.get('Referrer') || req.get('Referer') || '/cart');
    }

    const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
      cartitems.decrement(userId, productId, 1, (err) => {
      if (err) {
        console.error('cartitems.decrement error:', err);
        req.flash && req.flash('error', 'Could not update cart');
        return res.redirect('/cart');
      }
      req.flash && req.flash('success', 'Cart updated.');
      return res.redirect('/cart');
    });
  },

  // Clear the entire cart
  clearCart: function (req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in.');
      return res.redirect('/login');
    }

    const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
    cartitems.clear(userId, (err) => {
      if (err) {
        console.error('cartitems.clear error:', err);
        req.flash && req.flash('error', 'Could not clear cart');
        return res.redirect('/cart');
      }
      req.flash && req.flash('success', 'Cart cleared.');
      return res.redirect('/cart');
    });
  }
  // deleteCartID: function (req, res) {
  //   const user = req.session && req.session.user;
  //   if (!user) 
  
};

module.exports = CartController;
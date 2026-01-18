const SupermarketModel = require('../models/supermarket');
const cartitems = require('../models/cartitems');

const CartController = {
    // List cart (DB-backed)
    list: async function (req, res) {
      try {
        const user = req.session && req.session.user;
        if (!user) {
          req.flash && req.flash('error', 'Please log in to view your cart.');
          return res.redirect('/login');
        }

        const userId = (user.userId || user.id);
        const rows = await cartitems.getByUserId(userId);

        if (!rows || !rows.length) {
          return res.render('cart', { user, cart: [], totalQty: 0, totalPrice: 0, paypalClientId: process.env.PAYPAL_CLIENT_ID });
        }

        const cart = [];
        let totalQty = 0;
        let totalPrice = 0;

        for (let row of rows) {
          const product = await new Promise((resolve, reject) => {
            SupermarketModel.getProductById({ id: row.productId }, (err2, product) => {
              if (err2) {
                console.error('getProductById error in cart list:', err2);
                resolve(null);
              } else {
                resolve(product);
              }
            });
          });

          if (Array.isArray(product)) {
            const p = product[0];
            const item = {
              productId: String(row.productId),
              productName: p ? (p.productName || p.name) : 'Unknown',
              price: Number(p ? (p.price || 0) : 0),
              image: p ? p.image : null,
              quantity: Number(row.quantity || 0)
            };
            cart.push(item);
            totalQty += item.quantity;
            totalPrice += item.price * item.quantity;
          } else {
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
          }
        }

        return res.render('cart', { user, cart, totalQty, totalPrice, paypalClientId: process.env.PAYPAL_CLIENT_ID });
      } catch (err) {
        console.error('cart list error:', err);
        req.flash && req.flash('error', 'Unable to load cart.');
        return res.redirect('/shopping');
      }
    },

  // Add product to user's cart
  addToCart: async function (req, res) {
    try {
      const user = req.session && req.session.user;
      if (!user) {
          req.flash && req.flash('error', 'Please log in to add items to cart.');
          return res.redirect('/login');
      }

      const productId = req.body.productId || req.params.id;
      const qty = Number(req.body.quantity || 1);
      if (!productId) {
          req.flash && req.flash('error', 'No product specified.');
          return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
      }

      // Get product details (wrapping callback for now since SupermarketModel is callback-based)
      const product = await new Promise((resolve, reject) => {
        SupermarketModel.getProductById({ id: productId }, function (err, product) {
            if (err) {
                reject(err);
            } else {
                resolve(product);
            }
        });
      });

      // handle model returning array or single object
      let prod = product;
      if (Array.isArray(product)) prod = product[0];
      if (!prod) {
          req.flash && req.flash('error', 'Product not found.');
          return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
      }

      const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
      const unitPrice = prod && (prod.price || 0);
      const available = Number(prod.quantity || 0);
      if (available <= 0) {
        req.flash && req.flash('error', 'Product is out of stock.');
        return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
      }

      // check existing cart quantity for this user/product
      const existing = await cartitems.getItem(userId, productId);
      const already = existing ? Number(existing.quantity || 0) : 0;
      const MAX_PER_USER = 10;
      const remainingCap = MAX_PER_USER - already;
      if (remainingCap <= 0) {
        req.flash && req.flash('error', `You already have the maximum of ${MAX_PER_USER} units of this product in your cart.`);
        return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
      }

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

      await cartitems.add(userId, productId, allowed, unitPrice);
      if (allowed < qty) {
        req.flash && req.flash('success', `Added ${allowed} unit(s) to cart (limited by stock or per-user cap).`);
      } else {
        req.flash && req.flash('success', 'Product added to cart.');
      }
      return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
    } catch (err) {
      console.error('addToCart error:', err);
      const msg = (err && err.message && err.message.indexOf('Maximum 10') !== -1) ? err.message : 'Unable to add product to cart.';
      req.flash && req.flash('error', msg);
      return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
    }
  },

  // Remove product from cart (decrease or remove)
  removeFromCart: async function (req, res) {
    try {
      const user = req.session && req.session.user;
      if (!user) {
        req.flash && req.flash('error', 'Please log in.');
        return res.redirect('/login');
      }
      const productId = req.body.productId || req.params.id;
      if (!productId) return res.redirect('back');
      const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
      await cartitems.remove(userId, productId);
      req.flash && req.flash('success', 'Item removed from cart.');
      return res.redirect('/cart');
    } catch (err) {
      console.error('removeFromCart error:', err);
      req.flash && req.flash('error', 'Could not remove item');
      return res.redirect('/cart');
    }
  },

  // Decrease quantity of an item by one. If quantity reaches 0, remove the item.
  decreaseByOne: async function (req, res) {
    try {
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
      await cartitems.decrement(userId, productId, 1);
      req.flash && req.flash('success', 'Cart updated.');
      return res.redirect('/cart');
    } catch (err) {
      console.error('decreaseByOne error:', err);
      req.flash && req.flash('error', 'Could not update cart');
      return res.redirect('/cart');
    }
  },

  // Clear the entire cart
  clearCart: async function (req, res) {
    try {
      const user = req.session && req.session.user;
      if (!user) {
        req.flash && req.flash('error', 'Please log in.');
        return res.redirect('/login');
      }

      const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
      await cartitems.clear(userId);
      req.flash && req.flash('success', 'Cart cleared.');
      return res.redirect('/cart');
    } catch (err) {
      console.error('clearCart error:', err);
      req.flash && req.flash('error', 'Could not clear cart');
      return res.redirect('/cart');
    }
  }
};

module.exports = CartController;
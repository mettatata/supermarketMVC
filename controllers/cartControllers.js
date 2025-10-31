const SupermarketModel = require('../models/supermarket');

const CartController = {
  // Add product to user's cart
  addToCart: function (req, res) {
    // debug logs removed to avoid printing session/cart data to the terminal

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

        // ensure session cart structure
        req.session.cart = req.session.cart || { items: {}, totalQty: 0, totalPrice: 0 };
        const cart = req.session.cart;
        const id = String(product.id || product.productId || product.id);

        if (!cart.items[id]) {
            cart.items[id] = {
                productId: id,
                productName: product.productName || product.name || '',
                price: Number(product.price || 0),
                image: product.image || null,
                quantity: 0
            };
        }

        cart.items[id].quantity += qty;
        cart.totalQty = (cart.totalQty || 0) + qty;
        cart.totalPrice = (Number(cart.totalPrice) || 0) + (Number(cart.items[id].price || 0) * qty);

  // persist cart in session
  req.session.cart = cart;

        req.flash && req.flash('success', 'Product added to cart.');
        return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
    });
  },

  // Show cart page
  showCart: function (req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in to view your cart.');
      return res.redirect('/login');
    }
    const sessionCart = req.session.cart || { items: {}, totalQty: 0, totalPrice: 0 };
    const cart = Object.keys(sessionCart.items || {}).map(k => sessionCart.items[k]);
    return res.render('cart', { user, cart, totalQty: sessionCart.totalQty || 0, totalPrice: sessionCart.totalPrice || 0 });
  },

  // Remove product from cart (decrease or remove)
  removeFromCart: function (req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in.');
      return res.redirect('/login');
    }
    const productId = req.body.productId || req.params.id;
    if (!productId || !req.session.cart) {
      return res.redirect('back');
    }
    const cart = req.session.cart;
    const id = String(productId);
    const item = cart.items[id];
    if (!item) return res.redirect('back');

    const qty = item.quantity || 0;
    cart.totalQty = Math.max(0, (cart.totalQty || 0) - qty);
    cart.totalPrice = Math.max(0, (cart.totalPrice || 0) - item.price * qty);
    delete cart.items[id];

    req.session.cart = cart;
    req.flash && req.flash('success', 'Item removed from cart.');
    return res.redirect('/cart');
  }
};

module.exports = CartController;
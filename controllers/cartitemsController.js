const cartitems = require('../models/cartitems');
const Supermarket = require('../models/supermarket');

const cartitemsController = {
    // List all cart items for the logged-in user
    list(req, res) {
        const userId = req.session.user.userId;
        cartitems.getByUserId(userId, (err, cartItems) => {
            if (err) return res.status(500).send('Error retrieving cart');
            res.render('cart', { cartItems, user: req.session.user });
        });
    },

    // Add a product to the cart
    add(req, res) {
        const userId = req.session.user.userId;
        const productId = parseInt(req.body.productId, 10);
        Supermarket.getProductById({ id: productId }, (err, product) => {
            if (err || !product) {
                req.flash('error', 'Cannot add invalid product');
                return res.redirect('/shopping');
            }
            // If model returns array, take first
            if (Array.isArray(product)) product = product[0];
            const unitPrice = product && (product.price || 0);
            cartitems.add(userId, productId, 1, unitPrice, (err) => {
                if (err) req.flash('error', 'Could not add to cart');
                else req.flash('success', 'Product added to cart');
                return res.redirect('/shopping');
            });
        });
    },

    // Remove a product from the cart
    remove(req, res) {
        const userId = req.session.user.userId;
        const productId = parseInt(req.body.productId, 10);
        cartitems.remove(userId, productId, (err) => {
            if (req.headers['content-type'] === 'application/json') {
                // AJAX/fetch request, return JSON
                if (err) return res.status(500).json({ success: false, message: 'Could not remove from cart' });
                return res.json({ success: true, productId });
            } else {
                // Form POST, redirect
                if (err) req.flash('error', 'Could not remove from cart');
                else req.flash('success', 'Product removed from cart');
                return res.redirect('/shopping');
            }
        });
    },

    // Clear all products from the cart
    clear(req, res) {
        const userId = req.session.user.userId;
        cartitems.clear(userId, (err) => {
            if (req.headers['content-type'] === 'application/json') {
                // AJAX/fetch request, return JSON
                if (err) return res.status(500).json({ success: false, message: 'Could not clear cart' });
                return res.json({ success: true });
            } else {
                // Form POST, redirect
                if (err) req.flash('error', 'Could not clear cart');
                else req.flash('success', 'Cart cleared');
                return res.redirect('/shopping');
            }
        });
    }
};

module.exports = cartitemsController;
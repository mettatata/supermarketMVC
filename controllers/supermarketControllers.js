const SupermarketModel = require('../models/supermarket');

function formatProduct(p) {
  if (!p) return '';
  return `id: ${p.id}
productName: ${p.productName}
quantity: ${p.quantity}
price: ${p.price}
image: ${p.image}`;
}

const SupermarketController = {
  listProducts: function (req, res) {
    const params = {
      limit: req.query.limit,
      offset: req.query.offset
    };

    SupermarketModel.getAllProducts(params, function (err, results) {
      if (err) {
        req.flash('error', 'Unable to load products.');
        return res.redirect('/');
      }

      // ensure each product exposes .id for views
      if (Array.isArray(results)) {
        results.forEach(p => {
          if (p) p.id = p.id || p.id;
        });
      }

      const user = req.session.user || null;
      if (user && user.role === 'admin') {
        return res.render('inventory', { products: results, user, messages: req.flash('error') });
      } else {
        // hide out-of-stock products from regular users
        const available = Array.isArray(results) ? results.filter(p => Number(p.quantity || 0) > 0) : [];
        return res.render('shopping', { products: available, user, messages: req.flash('error') });
      }
    });
  },

  getProductById: function (req, res) {
  // debug logs removed to avoid printing request details and stack traces to the server terminal

    const params = { productId: req.params.id };
    SupermarketModel.getProductById(params, function (err, product) {
      if (err) {
        req.flash('error', 'Unable to load product.');
        return res.redirect(req.get('Referrer') || '/');
      }
      if (!product) {
        req.flash('error', 'Product not found.');
        return res.redirect(req.get('Referrer') || '/');
      }

      // ensure single product exposes .id for views
      product.id = product.id || product.productId || product.id;

      const user = req.session.user || null;
      if (req.path && req.path.startsWith('/updateProduct')) {
        return res.render('updateProduct', { product, user, messages: req.flash('error') });
      }
      return res.render('product', { product, user, messages: req.flash('error') });
    });
  },

  // POST /addProduct
  addProduct: function (req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash('error', 'Access denied.');
      return res.redirect('/login');
    }

    // read form fields (match DB column productName)
    const productName = (req.body.productName || req.body.name || '').trim();
    const quantity = Number(req.body.quantity || req.body.qty || 0);
    const price = Number(req.body.price || 0);
    const image = req.file ? (req.file.filename || req.file.path) : (req.body.image || null);

    if (!productName || isNaN(quantity) || isNaN(price)) {
      req.flash('error', 'Product name, quantity and price are required and must be valid.');
      req.flash('formData', req.body);
      return res.redirect('/addProduct');
    }

    const productParams = {
      productName: productName,
      quantity: quantity,
      price: price,
      image: image
    };

    SupermarketModel.addProduct(productParams, function (err, result) {
      if (err) {
        console.error('SupermarketModel.addProduct error:', err);
        req.flash('error', 'Could not add product. Please try again.');
        req.flash('formData', req.body);
        return res.redirect('/addProduct');
      }
      req.flash('success', 'Product added successfully.');
      return res.redirect('/inventory');
    });
  },
  
  updateProduct: function (req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash && req.flash('error', 'Access denied. Admins only.');
      return res.redirect('/login');
    }

    const id = req.params.id || req.params.productId;
    if (!id) {
      req.flash('error', 'Missing product ID');
      return res.redirect(req.get('Referrer') || '/inventory');
    }

    // Load existing product to preserve values when inputs are empty/missing
    SupermarketModel.getProductById({ productId: id }, function (err, existing) {
      if (err) {
        console.error('updateProduct getProductById error:', err);
        req.flash('error', 'Database error while loading product.');
        return res.redirect(req.get('Referrer') || `/updateProduct/${id}`);
      }
      if (!existing) {
        req.flash('error', 'Product not found.');
        return res.redirect('/inventory');
      }

      // Use provided values or fall back to existing ones
      const product = {
        productName: (req.body.productName && req.body.productName.trim() !== '') ? req.body.productName : existing.productName,
        quantity: (req.body.quantity !== undefined && req.body.quantity !== '') ? req.body.quantity : existing.quantity,
        price: (req.body.price !== undefined && req.body.price !== '') ? req.body.price : existing.price,
        image: req.file ? req.file.filename : existing.image // keep old image if not replaced
      };

      SupermarketModel.updateProduct(Object.assign({}, product, { productId: id }), function (err, result) {
        if (err) {
          console.error('updateProduct DB error:', err);
          req.flash('error', 'Database error while updating product.');
          return res.redirect(req.get('Referrer') || `/updateProduct/${id}`);
        }
        const affected = result && result.affectedRows ? result.affectedRows : 0;
        if (affected === 0) {
          req.flash('error', 'No product updated (not found or no changes).');
          return res.redirect(req.get('Referrer') || `/updateProduct/${id}`);
        }
        req.flash('success', 'Product updated successfully.');
        return res.redirect('/inventory');
      });
    });
  },

  
  deleteProduct: function (req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash && req.flash('error', 'Access denied. Admins only.');
      return res.redirect('/login');
    }

    const id = req.params.id || req.params.productId;
    if (!id) {
      req.flash('error', 'Missing product ID');
      return res.redirect(req.get('Referrer') || '/inventory');
    }

    SupermarketModel.deleteProduct({ productId: id }, function (err, result) {
      if (err) {
        console.error('deleteProduct DB error:', err);
        req.flash('error', 'Database error while deleting product.');
        return res.redirect(req.get('Referrer') || '/inventory');
      }
      if (!result || result.affectedRows === 0) {
        req.flash('error', 'Product not found.');
        return res.redirect(req.get('Referrer') || '/inventory');
      }
      req.flash('success', 'Product deleted successfully.');
      return res.redirect('/inventory');
    });
  },

  // expose getProductData for add-to-cart flow (returns product with .id)
  getProductData: function (id, cb) {
    SupermarketModel.getProductById({ productId: id }, cb);
  }
};
module.exports = SupermarketController;
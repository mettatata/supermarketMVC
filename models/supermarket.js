const db = require('../db');

const SupermarketModel = {
  // params: { limit, offset } optional; cb(err, results)
  getAllProducts: function (params, cb) {
    let sql = 'SELECT id, productName, quantity, price, image FROM products';
    const values = [];

    if (params && (params.limit !== undefined || params.offset !== undefined)) {
      sql += ' LIMIT ? OFFSET ?';
      values.push(
        params.limit !== undefined ? parseInt(params.limit, 10) : 100,
        params.offset !== undefined ? parseInt(params.offset, 10) : 0
      );
    }

    db.query(sql, values, function (err, results) {
      cb(err, results);
    });
  },

  // params: { productId } or numeric id; cb(err, product)
  getProductById: function (params, cb) {
    const id = (typeof params === 'object') ? (params.productId || params.id) : params;
    const sql = 'SELECT id, productName, quantity, price, image FROM products WHERE id = ?';
    db.query(sql, [id], function (err, results) {
      if (err) return cb(err);
      cb(null, results && results.length ? results[0] : null);
    });
  },

  // params: { productName, quantity, price, image }, cb(err, result)
  addProduct: function (params, cb) {
    if (!params) return cb && cb(new Error('Missing product params'));
    const productName = params.productName || params.name || null;
    const quantity = typeof params.quantity === 'number' ? params.quantity : Number(params.quantity) || 0;
    const price = typeof params.price === 'number' ? params.price : Number(params.price) || 0;
    const image = params.image || null;

    const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)';
    db.query(sql, [productName, quantity, price, image], function (err, result) {
      if (typeof cb === 'function') cb(err, result);
    });
  },

  // params: { productId, productName, quantity, price, image }; cb(err, result)
  updateProduct: function (params, cb) {
    const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, image = ? WHERE id = ?';
    const values = [
      params.productName,
      params.quantity,
      params.price,
      params.image,
      params.productId || params.id
    ];
    console.log('MODEL updateProduct SQL:', sql, 'VALUES:', values);
    db.query(sql, values, function (err, result) {
      if (err) {
        console.error('MODEL updateProduct ERROR:', err);
        return cb(err);
      }
      console.log('MODEL updateProduct RESULT:', result);
      cb(null, result);
    });
  },

  // params: { productId } or numeric id; cb(err, result)
  deleteProduct: function (params, cb) {
    const id = (typeof params === 'object') ? (params.productId || params.id) : params;
    const sql = 'DELETE FROM products WHERE id = ?';
    db.query(sql, [id], function (err, result) {
      cb(err, result);
    });
  }

  // Decrement stock for a product by amount. Calls back with (err, result).
  // This uses GREATEST to avoid negative quantities but it's recommended to check availability before calling.
  ,decrementStock: function (productId, amount, cb) {
    const qty = Number(amount || 0);
    const sql = 'UPDATE products SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?';
    db.query(sql, [qty, productId], function (err, result) {
      if (typeof cb === 'function') cb(err, result);
    });
  }
};

module.exports = SupermarketModel;
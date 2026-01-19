const db = require('../db');

const SupermarketModel = {
  // Async version: get all products with optional pagination
  getAllProducts: async function (params, cb) {
    try {
      let sql = 'SELECT id, productName, quantity, price, image FROM products';
      const values = [];

      if (params && (params.limit !== undefined || params.offset !== undefined)) {
        sql += ' LIMIT ? OFFSET ?';
        values.push(
          params.limit !== undefined ? parseInt(params.limit, 10) : 100,
          params.offset !== undefined ? parseInt(params.offset, 10) : 0
        );
      }

      const [results] = await db.query(sql, values);
      // Support both callback and promise-based usage
      if (typeof cb === 'function') {
        cb(null, results);
      }
      return results;
    } catch (err) {
      if (typeof cb === 'function') {
        cb(err);
      }
      throw err;
    }
  },

  // Hybrid version: get product by ID (callback or promise)
  getProductById: function (params, cb) {
    const id = (typeof params === 'object') ? (params.productId || params.id) : params;
    
    // For callback style (backward compatibility)
    if (typeof cb === 'function') {
      SupermarketModel._getProductByIdAsync(id)
        .then(product => cb(null, product))
        .catch(err => cb(err));
      return;
    }

    // For promise style
    return SupermarketModel._getProductByIdAsync(id);
  },

  _getProductByIdAsync: async function (id) {
    const sql = 'SELECT id, productName, quantity, price, image FROM products WHERE id = ?';
    const [results] = await db.query(sql, [id]);
    return results && results.length ? results[0] : null;
  },

  // Async version: add product
  addProduct: async function (params, cb) {
    try {
      if (!params) {
        const err = new Error('Missing product params');
        if (typeof cb === 'function') return cb(err);
        throw err;
      }

      const productName = params.productName || params.name || null;
      const quantity = typeof params.quantity === 'number' ? params.quantity : Number(params.quantity) || 0;
      const price = typeof params.price === 'number' ? params.price : Number(params.price) || 0;
      const image = params.image || null;

      const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)';
      const [result] = await db.query(sql, [productName, quantity, price, image]);
      
      if (typeof cb === 'function') cb(null, result);
      return result;
    } catch (err) {
      if (typeof cb === 'function') cb(err);
      throw err;
    }
  },

  // Async version: update product
  updateProduct: async function (params, cb) {
    try {
      const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, image = ? WHERE id = ?';
      const values = [
        params.productName,
        params.quantity,
        params.price,
        params.image,
        params.productId || params.id
      ];
      const [result] = await db.query(sql, values);
      
      if (typeof cb === 'function') cb(null, result);
      return result;
    } catch (err) {
      console.error('MODEL updateProduct ERROR:', err);
      if (typeof cb === 'function') cb(err);
      throw err;
    }
  },

  // Hybrid version: delete product (callback or promise)
  deleteProduct: function (params, cb) {
    const id = (typeof params === 'object') ? (params.productId || params.id) : params;
    
    if (typeof cb === 'function') {
      SupermarketModel._deleteProductAsync(id)
        .then(result => cb(null, result))
        .catch(err => cb(err));
      return;
    }

    return SupermarketModel._deleteProductAsync(id);
  },

  _deleteProductAsync: async function (id) {
    const sql = 'DELETE FROM products WHERE id = ?';
    const [result] = await db.query(sql, [id]);
    return result;
  },

  // Async version: decrement stock
  decrementStock: async function (productId, amount, cb) {
    try {
      const productIdNum = Number(productId);
      const qty = Number(amount || 0);
      
      console.log(`[decrementStock] productId=${productIdNum}, amount=${qty}`);
      
      if (qty <= 0) {
        console.log(`[decrementStock] Skipping: amount is ${qty} (must be > 0)`);
        const result = { affectedRows: 0 };
        if (typeof cb === 'function') cb(null, result);
        return result;
      }
      
      const sql = 'UPDATE products SET quantity = quantity - ? WHERE id = ?';
      console.log(`[decrementStock] Executing: UPDATE products SET quantity = quantity - ${qty} WHERE id = ${productIdNum}`);
      
      const [result] = await db.query(sql, [qty, productIdNum]);
      
      console.log(`[decrementStock] Result: affectedRows=${result?.affectedRows}, changedRows=${result?.changedRows}`);
      
      if (typeof cb === 'function') cb(null, result);
      return result;
    } catch (err) {
      console.error(`[decrementStock] ERROR:`, err);
      if (typeof cb === 'function') cb(err);
      throw err;
    }
  }
};

module.exports = SupermarketModel;
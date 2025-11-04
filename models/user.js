const db = require('../db');

const UserModel = {
  // params: { limit, offset } optional; cb(err, results)
  getAllUsers: function (params, cb) {
    let sql = 'SELECT id, username, email, address, contact, role FROM users';
    const values = [];

    if (params && (params.limit !== undefined || params.offset !== undefined)) {
      sql += ' LIMIT ? OFFSET ?';
      values.push(
        params.limit !== undefined ? parseInt(params.limit, 10) : 100,
        params.offset !== undefined ? parseInt(params.offset, 10) : 0
      );
    }

    db.query(sql, values, function (err, results) {
      if (typeof cb === 'function') cb(err, results);
    });
  },

  getUsersByName: function (params, cb) {
    const name = params && params.name ? `%${params.name}%` : '%';
    const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE username LIKE ?';
    db.query(sql, [name], function (err, results) {
      if (typeof cb === 'function') cb(err, results);
    });
  },

  getUserById: function (params, cb) {
    const id = params && (params.id);
    if (!id) {
      if (typeof cb === 'function') return cb(new Error('Missing user id'));
      return;
    }
    const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE id = ?';
    db.query(sql, [id], function (err, results) {
      if (typeof cb === 'function') cb(err, results && results.length ? results[0] : null);
    });
  },

  // params: { username, email, password, address, contact, role }; cb(err, result)
  addUser: function (params, cb) {
    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    const values = [
      params.username,
      params.email,
      params.password,
      params.address || null,
      params.contact || null,
      params.role || 'user'
    ];
    db.query(sql, values, function (err, result) {
      if (typeof cb === 'function') cb(err, result);
    });
  },

  // Provide a hybrid register/createUser/create API that controllers expect.
  // If a callback is provided, call it (err, user). If no callback, return a Promise that resolves to the created user object.
  register: function (params, cb) {
    // callback style
    if (typeof cb === 'function') {
      return UserModel.addUser(params, function (err, result) {
        if (err) return cb(err);
        const id = result && result.insertId;
        if (!id) return cb(new Error('Failed to create user'));
        return UserModel.getUserById({ id: id }, cb);
      });
    }

    // promise style
    return new Promise(function (resolve, reject) {
      UserModel.addUser(params, function (err, result) {
        if (err) return reject(err);
        const id = result && result.insertId;
        if (!id) return reject(new Error('Failed to create user'));
        UserModel.getUserById({ id: id }, function (err2, user) {
          if (err2) return reject(err2);
          resolve(user);
        });
      });
    });
  },

  createUser: function (params, cb) {
    return UserModel.register(params, cb);
  },

  create: function (params, cb) {
    return UserModel.register(params, cb);
  },

  
  updateUser: function (params, cb) {
    const id = params && params.id;
    if (!id) {
      if (typeof cb === 'function') return cb(new Error('Missing user id'));
      return;
    }

    const fields = [];
    const values = [];

    if (params.username !== undefined) {
      fields.push('username = ?'); values.push(params.username);
    }
    if (params.email !== undefined) {
      fields.push('email = ?'); values.push(params.email);
    }
    if (params.password !== undefined) {
      fields.push('password = SHA1(?)'); values.push(params.password);
    }
    if (params.address !== undefined) {
      fields.push('address = ?'); values.push(params.address);
    }
    if (params.contact !== undefined) {
      fields.push('contact = ?'); values.push(params.contact);
    }
    if (params.role !== undefined) {
      fields.push('role = ?'); values.push(params.role);
    }

    if (fields.length === 0) {
      if (typeof cb === 'function') return cb(null, { affectedRows: 0 });
      return;
    }

    const sql = 'UPDATE users SET ' + fields.join(', ') + ' WHERE id = ?';
    values.push(id);

    db.query(sql, values, function (err, result) {
      if (typeof cb === 'function') cb(err, result);
    });
  },

  // params: { id } ; cb(err, result)
  deleteUser: function (params, cb) {
    const id = params && params.id;
    if (!id) {
      if (typeof cb === 'function') return cb(new Error('Missing user id'));
      return;
    }
    const sql = 'DELETE FROM users WHERE id = ?';
    db.query(sql, [id], function (err, result) {
      if (typeof cb === 'function') cb(err, result);
    });
  },

  // authenticate(email, password, cb) - callback style
  authenticate: function (email, password, cb) {
    const sql = 'SELECT id, username, email, role FROM users WHERE email = ? AND password = SHA1(?)';
    db.query(sql, [email, password], function (err, results) {
      if (typeof cb === 'function') cb(err, results && results.length ? results[0] : null);
    });
  }
};

module.exports = UserModel;
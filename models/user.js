const db = require('../db');

const UserModel = {
  // Async version: get all users with optional pagination
  getAllUsers: async function (params) {
    let sql = 'SELECT id, username, email, address, contact, role FROM users';
    const values = [];

    if (params && (params.limit !== undefined || params.offset !== undefined)) {
      sql += ' LIMIT ? OFFSET ?';
      values.push(
        params.limit !== undefined ? parseInt(params.limit, 10) : 100,
        params.offset !== undefined ? parseInt(params.offset, 10) : 0
      );
    }

    const [results] = await db.query(sql, values);
    return results;
  },

  // Async version: get users by name
  getUsersByName: async function (params) {
    const name = params && params.name ? `%${params.name}%` : '%';
    const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE username LIKE ?';
    const [results] = await db.query(sql, [name]);
    return results;
  },

  // Async version: get user by ID
  getUserById: async function (params) {
    const id = params && (params.id);
    if (!id) {
      throw new Error('Missing user id');
    }
    const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE id = ?';
    const [results] = await db.query(sql, [id]);
    return results && results.length ? results[0] : null;
  },

  // Async version: add user
  addUser: async function (params) {
    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    const values = [
      params.username,
      params.email,
      params.password,
      params.address || null,
      params.contact || null,
      params.role || 'user'
    ];
    const [result] = await db.query(sql, values);
    return result;
  },

  // Hybrid register method supporting both async and callback styles
  register: function (params, cb) {
    // callback style (for backward compatibility with controllers that still use callbacks)
    if (typeof cb === 'function') {
      UserModel._registerAsync(params)
        .then(user => cb(null, user))
        .catch(err => cb(err));
      return;
    }

    // promise style (for controllers using async/await)
    return UserModel._registerAsync(params);
  },

  // Internal async implementation
  _registerAsync: async function (params) {
    const result = await UserModel.addUser(params);
    const id = result && result.insertId;
    if (!id) throw new Error('Failed to create user');
    return await UserModel.getUserById({ id });
  },

  createUser: function (params, cb) {
    return UserModel.register(params, cb);
  },

  create: function (params, cb) {
    return UserModel.register(params, cb);
  },

  
  // Async version: update user
  updateUser: async function (params) {
    const id = params && params.id;
    if (!id) {
      throw new Error('Missing user id');
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
      return { affectedRows: 0 };
    }

    const sql = 'UPDATE users SET ' + fields.join(', ') + ' WHERE id = ?';
    values.push(id);

    const [result] = await db.query(sql, values);
    return result;
  },

  // Async version: delete user
  deleteUser: async function (params) {
    const id = params && params.id;
    if (!id) {
      throw new Error('Missing user id');
    }
    const sql = 'DELETE FROM users WHERE id = ?';
    const [result] = await db.query(sql, [id]);
    return result;
  },

  // Hybrid authenticate method supporting both async and callback styles
  authenticate: function (email, password, cb) {
    // callback style (for backward compatibility)
    if (typeof cb === 'function') {
      UserModel._authenticateAsync(email, password)
        .then(user => cb(null, user))
        .catch(err => cb(err));
      return;
    }

    // promise style (for controllers using async/await)
    return UserModel._authenticateAsync(email, password);
  },

  // Internal async implementation for authenticate
  _authenticateAsync: async function (email, password) {
    const sql = 'SELECT id, username, email, role FROM users WHERE email = ? AND password = SHA1(?)';
    const [results] = await db.query(sql, [email, password]);
    return results && results.length ? results[0] : null;
  }
};

module.exports = UserModel;
const db = require('../db');

const UserProfileModel = {
  // Hybrid version: get user by ID (callback or promise)
  getUserById: function (params, cb) {
    const id = params && (params.id || params.userid);
    
    if (!id) {
      const err = new Error('Missing user id');
      if (typeof cb === 'function') return cb(err);
      return Promise.reject(err);
    }

    if (typeof cb === 'function') {
      UserProfileModel._getUserByIdAsync(id)
        .then(user => cb(null, user))
        .catch(err => cb(err));
      return;
    }

    return UserProfileModel._getUserByIdAsync(id);
  },

  _getUserByIdAsync: async function (id) {
    const sql = 'SELECT id AS userid, username, email, address, contact, role FROM users WHERE id = ?';
    const [results] = await db.query(sql, [id]);
    return results && results.length ? results[0] : null;
  },

  // Hybrid version: get user credentials (callback or promise)
  getUserCredentials: function (params, cb) {
    const userid = params && (params.userid || params.id);
    const email = params && params.email;
    
    if (!email && !userid) {
      const err = new Error('Missing userid or email');
      if (typeof cb === 'function') return cb(err);
      return Promise.reject(err);
    }

    if (typeof cb === 'function') {
      UserProfileModel._getUserCredentialsAsync(userid, email)
        .then(creds => cb(null, creds))
        .catch(err => cb(err));
      return;
    }

    return UserProfileModel._getUserCredentialsAsync(userid, email);
  },

  _getUserCredentialsAsync: async function (userid, email) {
    let sql, values;
    if (email) {
      sql = 'SELECT id AS userid, username, password FROM users WHERE email = ?';
      values = [email];
    } else {
      sql = 'SELECT id AS userid, username, password FROM users WHERE id = ?';
      values = [userid];
    }
    
    const [results] = await db.query(sql, values);
    return results && results.length ? results[0] : null;
  },

  // Hybrid version: get username (callback or promise)
  getUsername: function (params, cb) {
    const userid = params && (params.userid || params.id);
    
    if (!userid) {
      const err = new Error('Missing userid');
      if (typeof cb === 'function') return cb(err);
      return Promise.reject(err);
    }

    if (typeof cb === 'function') {
      UserProfileModel._getUsernameAsync(userid)
        .then(username => cb(null, username))
        .catch(err => cb(err));
      return;
    }

    return UserProfileModel._getUsernameAsync(userid);
  },

  _getUsernameAsync: async function (userid) {
    const sql = 'SELECT username FROM users WHERE id = ?';
    const [results] = await db.query(sql, [userid]);
    return results && results.length ? results[0].username : null;
  },

  // Async version: add user
  addUser: async function (params, cb) {
    try {
      const sql = 'INSERT INTO users (username, password, email, address, contact) VALUES (?, SHA1(?), ?, ?, ?)';
      const values = [
        params.username,
        params.password,
        params.email || null,
        params.address || null,
        params.contact || null
      ];
      const [result] = await db.query(sql, values);
      
      if (typeof cb === 'function') cb(null, result);
      return result;
    } catch (err) {
      if (typeof cb === 'function') cb(err);
      throw err;
    }
  },

  // Async version: update user
  updateUser: async function (params, cb) {
    try {
      const userid = params && (params.userid || params.id);
      
      if (!userid) {
        const err = new Error('Missing user id');
        if (typeof cb === 'function') return cb(err);
        throw err;
      }

      const fields = [];
      const values = [];

      if (params.username !== undefined) { fields.push('username = ?'); values.push(params.username); }
      if (params.email !== undefined)    { fields.push('email = ?'); values.push(params.email); }
      if (params.password !== undefined) { fields.push('password = SHA1(?)'); values.push(params.password); }
      if (params.address !== undefined)  { fields.push('address = ?'); values.push(params.address); }
      if (params.contact !== undefined)  { fields.push('contact = ?'); values.push(params.contact); }

      if (fields.length === 0) {
        const result = { affectedRows: 0 };
        if (typeof cb === 'function') return cb(null, result);
        return result;
      }

      const sql = 'UPDATE users SET ' + fields.join(', ') + ' WHERE id = ?';
      values.push(userid);

      const [result] = await db.query(sql, values);
      
      if (typeof cb === 'function') cb(null, result);
      return result;
    } catch (err) {
      if (typeof cb === 'function') cb(err);
      throw err;
    }
  }
};

module.exports = UserProfileModel;

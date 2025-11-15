const db = require('../db');

const UserProfileModel = {
  // params: { userid } ; cb(err, user)
  getUserById: function (params, cb) {
    // accept either params.id or params.userid
    const id = params && (params.id || params.userid);
    if (!id) {
      if (typeof cb === 'function') return cb(new Error('Missing user id'));
      return;
    }
    // select id as userid for backward compatibility with code that expects `userid`
    const sql = 'SELECT id AS userid, username, email, address, contact, role FROM users WHERE id = ?';
    db.query(sql, [id], function (err, results) {
      if (typeof cb === 'function') cb(err, results && results.length ? results[0] : null);
    });
  },

  // params: { userid } or { email } ; cb(err, { userid, username, password })
  getUserCredentials: function (params, cb) {
    const userid = params && (params.userid || params.id);
    const email = params && params.email;
    let sql, values;
    if (email) {
      sql = 'SELECT id AS userid, username, password FROM users WHERE email = ?';
      values = [email];
    } else if (userid) {
      sql = 'SELECT id AS userid, username, password FROM users WHERE id = ?';
      values = [userid];
    } else {
      if (typeof cb === 'function') return cb(new Error('Missing userid or email'));
      return;
    }

    db.query(sql, values, function (err, results) {
      if (typeof cb === 'function') cb(err, results && results.length ? results[0] : null);
    });
  },

  // params: { userid } ; cb(err, username)
  getUsername: function (params, cb) {
    const userid = params && (params.userid || params.id);
    if (!userid) {
      if (typeof cb === 'function') return cb(new Error('Missing userid'));
      return;
    }
    const sql = 'SELECT username FROM users WHERE id = ?';
    db.query(sql, [userid], function (err, results) {
      if (typeof cb === 'function') cb(err, results && results.length ? results[0].username : null);
    });
  },

  // params: { username, email, password, address, contact } ; cb(err, result)
  addUser: function (params, cb) {
    const sql = 'INSERT INTO users (username, password, email, address, contact) VALUES (?, SHA1(?), ?, ?, ?)';
    const values = [
      params.username,
      params.password,
      params.email || null,
      params.address || null,
      params.contact || null
    ];
    db.query(sql, values, function (err, result) {
      if (typeof cb === 'function') cb(err, result);
    });
  },

  // params: { userid, username?, email?, password?, address?, contact? } ; cb(err, result)
  updateUser: function (params, cb) {
    const userid = params && (params.userid || params.id);
    if (!userid) {
      if (typeof cb === 'function') return cb(new Error('Missing user id'));
      return;
    }

    const fields = [];
    const values = [];

    if (params.username !== undefined) { fields.push('username = ?'); values.push(params.username); }
    if (params.email !== undefined)    { fields.push('email = ?'); values.push(params.email); }
    if (params.password !== undefined) { fields.push('password = SHA1(?)'); values.push(params.password); }
    if (params.address !== undefined)  { fields.push('address = ?'); values.push(params.address); }
    if (params.contact !== undefined)  { fields.push('contact = ?'); values.push(params.contact); }

    if (fields.length === 0) {
      if (typeof cb === 'function') return cb(null, { affectedRows: 0 });
      return;
    }

  const sql = 'UPDATE users SET ' + fields.join(', ') + ' WHERE id = ?';
  values.push(userid);

    db.query(sql, values, function (err, result) {
      if (typeof cb === 'function') cb(err, result);
    });
  }
};

module.exports = UserProfileModel;

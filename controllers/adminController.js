const UserModel = require('../models/user');
const Orders = require('../models/order');

const AdminController = {
  // GET /admin - show user management dashboard
  listUsers: async function (req, res) {
    try {
      const params = { limit: req.query.limit, offset: req.query.offset };
      const users = await UserModel.getAllUsers(params);
      return res.render('adminDashboard', { user: req.session.user, users: users || [] });
    } catch (err) {
      console.error('AdminController.listUsers error:', err);
      req.flash && req.flash('error', 'Could not load users.');
      return res.redirect('/');
    }
  },

  // POST /user/delete/:id - delete a user (admin only)
  deleteUser: async function (req, res) {
    const id = req.params && (req.params.id || req.body.id);
    if (!id) {
      req.flash && req.flash('error', 'Missing user id');
      return res.redirect('/admin');
    }
    // prevent admin deleting themselves accidentally
    const sessionUserId = req.session && req.session.user && req.session.user.id;
    if (String(sessionUserId) === String(id)) {
      req.flash && req.flash('error', 'You cannot delete your own admin account.');
      return res.redirect('/admin');
    }

    try {
      await UserModel.deleteUser({ id: id });
      req.flash && req.flash('success', 'User deleted.');
      return res.redirect('/admin');
    } catch (err) {
      console.error('AdminController.deleteUser error:', err);
      req.flash && req.flash('error', 'Unable to delete user.');
      return res.redirect('/admin');
    }
  },

  // GET /user/add - render add user form (admin only)
  showAddUser: function (req, res) {
    const user = req.session && req.session.user;
    // collect flash messages and previous form data
    const messages = (res.locals && res.locals.success && res.locals.success.length) ? res.locals.success : ((req.flash && req.flash('success')) || []);
    const errorArr = (res.locals && res.locals.error && res.locals.error.length) ? res.locals.error : ((req.flash && req.flash('error')) || []);
    const error = errorArr && errorArr.length ? (Array.isArray(errorArr) ? errorArr.join('. ') : String(errorArr)) : null;
    const formData = (req.flash && req.flash('formData') && req.flash('formData')[0]) || {};
    return res.render('addUser', { user: user || null, formData: formData, messages: messages, error: error });
  },

  // POST /user/add - create a new user
  createUser: async function (req, res) {
    const payload = {
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
      address: req.body.address || null,
      contact: req.body.contact || req.body.phone || null,
      role: req.body.role || 'user'
    };

    // basic validation
    const errors = [];
    if (!payload.username) errors.push('Username is required');
    if (!payload.email) errors.push('Email is required');
    if (!payload.password || payload.password.length < 6) errors.push('Password is required (min 6 chars)');

    if (errors.length) {
      req.flash && req.flash('error', errors.join('. '));
      req.flash && req.flash('formData', req.body);
      return res.redirect('/user/add');
    }

    try {
      await UserModel.addUser(payload);
      req.flash && req.flash('success', 'User created.');
      return res.redirect('/admin');
    } catch (err) {
      console.error('AdminController.createUser error:', err);
      req.flash && req.flash('error', 'Unable to create user.');
      req.flash && req.flash('formData', req.body);
      return res.redirect('/user/add');
    }
  },

  // GET /admin/orders-report - view orders analytics
  ordersReport: async function (req, res) {
    const user = req.session && req.session.user;
    try {
      const selectedMonth = (req.query && req.query.month ? String(req.query.month).trim() : '') || null;

      const totalOrders = await Orders.getTotalOrdersCount(selectedMonth);
      const totalSales = await Orders.getTotalSalesAmount(selectedMonth);
      const topProducts = await Orders.getTopProductsBySales(5, selectedMonth);
      const allOrders = await Orders.getAllOrders(selectedMonth);

      return res.render('adminreport', {
        user: user,
        totalOrders: totalOrders,
        totalSales: totalSales.toFixed(2),
        topProducts: topProducts,
        allOrders: allOrders,
        selectedMonth: selectedMonth
      });
    } catch (err) {
      console.error('AdminController.ordersReport error:', err);
      req.flash && req.flash('error', 'Could not load orders report. ' + err.message);
      return res.redirect('/admin');
    }
  }
};

module.exports = AdminController;

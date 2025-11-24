const UserModel = require('../models/user');
const SupermarketModel = require('../models/supermarket');
const UserProfileModel = require('../models/userProfile');

const UserController = {
    // render registration page
    showRegister: function (req, res) {
        // prefer already-populated res.locals from middleware to avoid consuming flash twice
        const errors = (res.locals && (res.locals.error || res.locals.errors)) || req.flash('error') || [];
        const success = (res.locals && (res.locals.success || res.locals.successes)) || req.flash('success') || [];
        const messages = (success && success.length) ? success : (errors && errors.length ? errors : []);
        const formData = (req.flash && req.flash('formData') && req.flash('formData')[0]) || {};
        res.render('register', { formData, errors, success, messages, user: res.locals.user || null });
    },

    // handle registration form submission
    register: function (req, res) {
        const { email, password, username, address, contact, role } = req.body || {};

        if (!email || !password || !username || !address || !contact || !role) {
            req.flash && req.flash('error', 'All fields are required.');
            req.flash && req.flash('formData', req.body);
            return res.redirect('/register');
        }

        if (password.length < 6) {
            req.flash && req.flash('error', 'Password must be at least 6 characters.');
            req.flash && req.flash('formData', req.body);
            return res.redirect('/register');
        }

        const payload = { email, password, username, address, contact, role };

        const finishSuccess = (user) => {
            req.session = req.session || {};
            req.session.user = {
                id: user && (user.id || user._id) || null,
                email: user && (user.email || email),
                role: user && (user.role || role),
                username: user && (user.username || username)
            };
            req.flash && req.flash('success', 'Registration successful.');
            return res.redirect(req.session.user.role === 'admin' ? '/inventory' : '/shopping');
        };

        const finishError = (err) => {
            console.error('User registration error:', err);
            req.flash && req.flash('error', 'Registration failed. Please try again.');
            req.flash && req.flash('formData', req.body);
            return res.redirect('/register');
        };

        // try common model methods (callback or promise)
        if (typeof UserModel.register === 'function') {
            if (UserModel.register.length >= 2) {
                return UserModel.register(payload, function (err, user) {
                    if (err) return finishError(err);
                    return finishSuccess(user);
                });
            }
            const p = UserModel.register(payload);
            if (p && typeof p.then === 'function') return p.then(finishSuccess).catch(finishError);
        }

        if (typeof UserModel.createUser === 'function') {
            if (UserModel.createUser.length >= 2) {
                return UserModel.createUser(payload, function (err, user) {
                    if (err) return finishError(err);
                    return finishSuccess(user);
                });
            }
            const p = UserModel.createUser(payload);
            if (p && typeof p.then === 'function') return p.then(finishSuccess).catch(finishError);
        }

        // fallback: model.create (common with ORMs)
        if (typeof UserModel.create === 'function') {
            if (UserModel.create.length >= 2) {
                return UserModel.create(payload, function (err, user) {
                    if (err) return finishError(err);
                    return finishSuccess(user);
                });
            }
            const p = UserModel.create(payload);
            if (p && typeof p.then === 'function') return p.then(finishSuccess).catch(finishError);
        }

        req.flash && req.flash('error', 'User registration not implemented in model.');
        req.flash && req.flash('formData', req.body);
        return res.redirect('/register');
    },

    // render login page
    showLogin: function (req, res) {
        const errors = (res.locals && (res.locals.error || res.locals.errors)) || req.flash('error') || [];
        const success = (res.locals && (res.locals.success || res.locals.successes)) || req.flash('success') || [];
        const messages = (success && success.length) ? success : (errors && errors.length ? errors : []);
        res.render('login', { errors, success, messages, user: res.locals.user || null });
    },

    // POST /login (email + password)
    login: function (req, res) {
        const { email, password } = req.body || {};

        if (!email || !password) {
            req.flash && req.flash('error', 'Email and password are required.');
            return res.redirect('/login');
        }

        const finishError = (msg, err) => {
            if (err) console.error('User.login error:', err);
            req.flash && req.flash('error', msg);
            return res.redirect('/login');
        };

        const finishSuccess = (user) => {
            req.session = req.session || {};
            req.session.user = { id: user.id || user._id, email: user.email || email, role: user.role || 'user' };
            req.flash && req.flash('success', 'Logged in successfully.');
            return res.redirect(req.session.user.role === 'admin' ? '/inventory' : '/shopping');
        };

        if (typeof UserModel.authenticate === 'function') {
            if (UserModel.authenticate.length >= 3) {
                return UserModel.authenticate(email, password, function (err, user) {
                    if (err) return finishError('Authentication error. Please try again.', err);
                    if (!user) return finishError('Invalid email or password.');
                    return finishSuccess(user);
                });
            }
            const p = UserModel.authenticate(email, password);
            if (p && typeof p.then === 'function') {
                return p.then(user => {
                    if (!user) return finishError('Invalid email or password.');
                    return finishSuccess(user);
                }).catch(err => finishError('Authentication error. Please try again.', err));
            }
        }

        if (typeof UserModel.findByCredentials === 'function') {
            if (UserModel.findByCredentials.length >= 2) {
                return UserModel.findByCredentials({ email, password }, function (err, user) {
                    if (err) return finishError('Authentication error. Please try again.', err);
                    if (!user) return finishError('Invalid email or password.');
                    return finishSuccess(user);
                });
            }
            const p = UserModel.findByCredentials({ email, password });
            if (p && typeof p.then === 'function') {
                return p.then(user => {
                    if (!user) return finishError('Invalid email or password.');
                    return finishSuccess(user);
                }).catch(err => finishError('Authentication error. Please try again.', err));
            }
        }

        req.flash && req.flash('error', 'Authentication not implemented.');
        return res.redirect('/login');
    },

    // GET /inventory - show inventory (admin) or products (regular user)
    inventory: function (req, res) {
        const user = req.session && req.session.user;
        if (!user) {
            req.flash && req.flash('error', 'You must be logged in to view this page.');
            return res.redirect('/login');
        }

        // Use supermarket model to fetch product list
        const params = { limit: req.query.limit, offset: req.query.offset };
        SupermarketModel.getAllProducts(params, function (err, products) {
            if (err) {
                console.error('SupermarketModel.getAllProducts error:', err);
                req.flash && req.flash('error', 'Could not load products. Please try again.');
                return res.redirect('/');
            }

            // ensure ids
            if (Array.isArray(products)) {
                products.forEach(p => {
                    if (p) p.id = p.id || p.productId || p.id;
                });
            }

            const messages = res.locals && res.locals.messages ? res.locals.messages : [];

            if (user.role === 'admin') {
                return res.render('inventory', { user, products, messages });
            }

            return res.render('shopping', { user, products, messages });
        });
    },

    // logout
    logout: function (req, res) {
        if (req.session) {
            req.session.destroy(function () {
                res.redirect('/login');
            });
        } else {
            res.redirect('/login');
        }
    }
,

    // GET /userProfile - show current user's profile
    showUserProfile: function (req, res) {
        const sessionUser = req.session && req.session.user;
        if (!sessionUser) {
            req.flash && req.flash('error', 'Please log in to view your profile.');
            return res.redirect('/login');
        }

        const userid = sessionUser.id || sessionUser.userid;
        // fetch fresh user info from DB
        UserProfileModel.getUserById({ userid: userid }, function (err, user) {
            if (err) {
                console.error('getUserById error:', err);
                req.flash && req.flash('error', 'Could not load profile.');
                return res.redirect('/');
            }
            // render profile view; user may be null if not found
            return res.render('userProfile', { user: user || sessionUser });
        });
    },

    // POST /user/update-password - change current user's password
    updatePassword: function (req, res) {
        const sessionUser = req.session && req.session.user;
        if (!sessionUser) {
            req.flash && req.flash('error', 'Please log in.');
            return res.redirect('/login');
        }

        const userid = req.body.id || req.body.userid || sessionUser.id;
        const newPassword = req.body.newPassword;
        const confirmPassword = req.body.confirmPassword;

        if (!newPassword || !confirmPassword) {
            req.flash && req.flash('error', 'Please provide and confirm your new password.');
            return res.redirect('/userProfile');
        }
        if (newPassword.length < 6) {
            req.flash && req.flash('error', 'Password must be at least 6 characters.');
            return res.redirect('/userProfile');
        }
        if (newPassword !== confirmPassword) {
            req.flash && req.flash('error', 'Passwords do not match.');
            return res.redirect('/userProfile');
        }

        // security: ensure users can only change their own password (unless admin)
        const isAdmin = sessionUser.role === 'admin';
        if (!isAdmin && String(sessionUser.id) !== String(userid)) {
            req.flash && req.flash('error', 'You are not authorized to change this password.');
            return res.redirect('/userProfile');
        }

        UserProfileModel.updateUser({ userid: userid, password: newPassword }, function (err, result) {
            if (err) {
                console.error('updateUser error:', err);
                req.flash && req.flash('error', 'Unable to update password. Please try again.');
                return res.redirect('/userProfile');
            }
            req.flash && req.flash('success', 'Password updated successfully.');
            return res.redirect('/userProfile');
        });
    }
};

module.exports = UserController;

// Auth guard: checks authentication
const checkAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please log in to view this resource');
  return res.redirect('/login');
};

// Auth guard: checks authorisation
const checkAuthorised = (roles = []) => {
  return (req, res, next) => {
    // Only check authorisation, assume authentication is already checked
    if (roles.length === 0 || roles.includes(req.session.user.role)) {
      return next();
    }
    req.flash('error', 'You do not have permission to view this resource');
    return res.redirect('/');
  };
};

//check for validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Ensure there is a cart on the session (useful for session-backed carts)
const ensureCart = (req, res, next) => {
  req.session = req.session || {};
  if (!Array.isArray(req.session.cart)) req.session.cart = [];
  next();
};

// Convenience middleware for admin-only routes
const checkAdmin = checkAuthorised(['admin']);

module.exports = { checkAuthenticated, checkAuthorised, checkAdmin, validateRegistration, ensureCart };
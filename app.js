const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

// controllers (function-based)
const supermarketController = require('./controllers/supermarketControllers');
const cartController = require('./controllers/cartControllers');
const userController = require('./controllers/userControllers');

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// Set up view engine
app.set('view engine', 'ejs');
// enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({ extended: false }));

// Session middleware
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));


app.use(flash());

// make flash arrays available to all views
app.use(function (req, res, next) {
    // ensure arrays so EJS checks like errors.length work
    res.locals.errors = req.flash('error') || [];
    res.locals.success = req.flash('success') || [];
    // combined messages variable used by some templates
    res.locals.messages = (res.locals.errors || []).concat(res.locals.success || []);
    res.locals.user = req.session && req.session.user ? req.session.user : null;
    next();
});

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/shopping');
    }
};

// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        req.flash('error', 'All fields are required.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Routes


app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

// Inventory (use userController.inventory which exists and handles role)
app.get('/inventory', checkAuthenticated, userController.inventory);

// Register
app.get('/register', userController.showRegister);
app.post('/register', validateRegistration, userController.register);

// Login
app.get('/login', userController.showLogin);
app.post('/login', userController.login);

// Logout
app.get('/logout', userController.logout);

// Shopping (product listing) -> use listProducts
app.get('/shopping', checkAuthenticated, supermarketController.listProducts);

// Add to cart
app.post('/add-to-cart/:id', checkAuthenticated, cartController.addToCart);

// View cart (use controller)
app.get('/cart', checkAuthenticated, cartController.showCart);

// Product detail -> use getProductById
app.get('/product/:id', checkAuthenticated, supermarketController.getProductById);

// Add product (admin) - GET renders form, POST uses controller.addProduct
app.get('/addProduct', checkAuthenticated, checkAdmin, function (req, res) {
    res.render('addProduct', { user: req.session.user, messages: req.flash('error') });
});
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), supermarketController.addProduct);

// Update product (admin) - reuse getProductById to render update form (controller checks req.path)
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, supermarketController.getProductById);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), supermarketController.updateProduct);

// Delete product (admin)
app.get('/deleteProduct/:id', checkAuthenticated, checkAdmin, supermarketController.deleteProduct);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

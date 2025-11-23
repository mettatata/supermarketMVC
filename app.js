const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();
const { checkAuthenticated, checkAuthorised, validateRegistration} = require('./middleware');

// controllers
const supermarketController = require('./controllers/supermarketControllers');
const cartController = require('./controllers/cartControllers');
const userController = require('./controllers/userControllers');
const userProfileController = require('./controllers/userProfileController');
const orderController = require('./controllers/order');
const orderDetailsController = require('./controllers/orderdetailsController');
const adminController = require('./controllers/adminController');

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

// views & body parsing
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); // <-- ensure this is present
app.use(express.static(path.join(__dirname, 'public')));

// session + flash
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

app.use(flash());

// expose session and flash messages to views
app.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});


//Routes


// homepage
app.get('/', (req,res)=>{ res.render('index', {user: req.session.user})});

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
// Remove entire item from cart
app.post('/cart/delete/:id', checkAuthenticated, cartController.removeFromCart);
app.post('/cart/clear',checkAuthenticated,cartController.clearCart);
// Decrease quantity of an item by one
app.post('/cart/decrease/:id', checkAuthenticated, cartController.decreaseByOne);
app.get('/cart', checkAuthenticated, cartController.list);


// Product detail -> use getProductById
app.get('/product/:id', checkAuthenticated, supermarketController.getProductById);

//
// User profile (view and password update)
app.get('/userProfile', checkAuthenticated, userController.showUserProfile);
// password update route
app.post('/user/update-password', checkAuthenticated, userController.updatePassword);
// route for updating email/address from profile edit form
app.post('/user/update-contact', checkAuthenticated, userProfileController.updateEmailAddress);

// Add product (admin) - GET renders form, POST uses controller.addProduct
app.get('/addProduct', checkAuthenticated, checkAuthorised(['admin']), function (req, res) {
    res.render('addProduct', { user: req.session.user, messages: req.flash('error') });
});
app.post('/addProduct', checkAuthenticated, checkAuthorised(['admin']), upload.single('image'), supermarketController.addProduct);

// Update product (admin) - reuse getProductById to render update form (controller checks req.path)
app.get('/updateProduct/:id', checkAuthenticated, checkAuthorised(['admin']), supermarketController.getProductById);
app.post('/updateProduct/:id', checkAuthenticated, checkAuthorised(['admin']), upload.single('image'), supermarketController.updateProduct);

// Delete product (admin)
app.get('/deleteProduct/:id', checkAuthenticated, checkAuthorised(['admin']), supermarketController.deleteProduct);

// Admin dashboard - list users
app.get('/admin', checkAuthenticated, checkAuthorised(['admin']), adminController.listUsers);

// legacy / navbar link: support /adminDashboard path used in views
app.get('/adminDashboard', checkAuthenticated, checkAuthorised(['admin']), adminController.listUsers);

// Delete user (admin)
app.post('/user/delete/:id', checkAuthenticated, checkAuthorised(['admin']), adminController.deleteUser);

// Admin: add user (form)
app.get('/user/add', checkAuthenticated, checkAuthorised(['admin']), adminController.showAddUser);
app.post('/user/add', checkAuthenticated, checkAuthorised(['admin']), adminController.createUser);

// Order: create order from cart
app.post('/orders', checkAuthenticated, orderController.createOrder);
app.get('/orders', checkAuthenticated, orderController.listOrders);
// Order details page
app.get('/orderdetails', checkAuthenticated, orderDetailsController.showOrderDetails);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

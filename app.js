
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();
const { checkAuthenticated, checkAuthorised, validateRegistration} = require('./middleware');
const bodyParser = require("body-parser");
const netsQr= require("./services/nets");
const axios = require('axios');

// controllers
const supermarketController = require('./controllers/supermarketControllers');
const cartController = require('./controllers/cartControllers');
const userController = require('./controllers/userControllers');
const userProfileController = require('./controllers/userProfileController');
const orderController = require('./controllers/orderController');
const orderDetailsController = require('./controllers/orderdetailsController');
const adminController = require('./controllers/adminController');
const paymentController = require('./controllers/paymentController');

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
  // normalize flash message keys so views can use either name
  const errors = req.flash('error') || [];
  const successes = req.flash('success') || [];
  res.locals.error = errors;
  res.locals.errors = errors;
  res.locals.success = successes;
  res.locals.successes = successes;
  res.locals.messages = errors.concat(successes);
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
app.get('/cart', checkAuthenticated, cartController.list);
// Checkout page
app.get('/checkout', checkAuthenticated, cartController.showCheckout);
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

// Thank you page after successful payment
app.get('/thankyou', checkAuthenticated, (req, res) => {
  const orderId = req.query.orderId || null;
  res.render('thanku', { user: req.session.user, orderId });
});

// Order details page
app.get('/orderdetails', checkAuthenticated, orderDetailsController.showOrderDetails);
app.get('/orders/:id', orderDetailsController.showOrderDetails);

// Payment routes (PayPal integration)
app.post('/api/paypal/create-order', checkAuthenticated, paymentController.createOrder);
app.post('/api/paypal/pay', checkAuthenticated, paymentController.pay);

// NETS completion
app.post('/api/nets/success', checkAuthenticated, netsQr.completePayment);

// NETS QR
app.get('/', (req, res) => { res.render('shopping', { user: req.session.user }); });
app.post('/generateNETSQR', checkAuthenticated, netsQr.generateQrCode);

app.get('/nets-qr/success', (req, res) => {
  res.render('netsTxnSuccessStatus', { message: 'Transaction Successful!' });
});
app.get('/nets-qr/fail', (req, res) => {
  res.render('netsTxnFailStatus', { message: 'Transaction Failed. Please try again.' });
});

// SSE payment status stream
app.get('/sse/payment-status/:txnRetrievalRef', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const txnRetrievalRef = req.params.txnRetrievalRef;
  let pollCount = 0;
  const maxPolls = 60; // 5 minutes at 5s interval
  let frontendTimeoutStatus = 0;

  const interval = setInterval(async () => {
    pollCount++;
    try {
      const response = await axios.post(
        'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query',
        { txn_retrieval_ref: txnRetrievalRef, frontend_timeout_status: frontendTimeoutStatus },
        {
          headers: {
            'api-key': process.env.API_KEY,
            'project-id': process.env.PROJECT_ID,
            'Content-Type': 'application/json'
          }
        }
      );

      res.write(`data: ${JSON.stringify(response.data)}\n\n`);

      const resData = response.data.result.data;
      if (resData.response_code === "00" && resData.txn_status === 1) {
        res.write(`data: ${JSON.stringify({ success: true })}\n\n`);
        clearInterval(interval);
        res.end();
      } else if (frontendTimeoutStatus === 1 && resData && (resData.response_code !== "00" || resData.txn_status === 2)) {
        res.write(`data: ${JSON.stringify({ fail: true, ...resData })}\n\n`);
        clearInterval(interval);
        res.end();
      }
    } catch (err) {
      clearInterval(interval);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }

    if (pollCount >= maxPolls) {
      clearInterval(interval);
      frontendTimeoutStatus = 1;
      res.write(`data: ${JSON.stringify({ fail: true, error: "Timeout" })}\n\n`);
      res.end();
    }
  }, 5000);

  req.on('close', () => clearInterval(interval));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const OrderDetails = require('../models/orderdetails');
const Transaction = require("../models/transaction");
const CartItems = require('../models/cartitems');
const Orders = require('../models/order');
const SupermarketModel = require('../models/supermarket');
const UserModel = require('../models/user');
const paypal = require('../services/paypal');
const nets = require('../services/nets');

module.exports = {
  // Get all cart items for the current user
  getCartItems: async (req, res) => {
    try {
      const userId = req.session.user.id;
      const items = await CartItems.getByUserId(userId);
      res.json({ success: true, items });
    } catch (err) {
      console.error("Get cart items error:", err);
      res.status(500).json({ error: "Failed to fetch cart items", message: err.message });
    }
  },

  // Get cart details with total amount
  getCartDetails: async (req, res) => {
    try {
      const userId = req.session.user.id;
      const items = await CartItems.getByUserId(userId);

      const totalAmount = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
      
      res.json({ 
        success: true, 
        items,
        totalAmount: totalAmount.toFixed(2),
        itemCount: items.length
      });
    } catch (err) {
      console.error("Get cart details error:", err);
      res.status(500).json({ error: "Failed to fetch cart details", message: err.message });
    }
  },

  // Create PayPal order
  createOrder: async (req, res) => {
    try {
      const userId = req.session.user.id;
      
      console.log('createOrder: session user', req.session.user);
      console.log('createOrder: using userId', userId);

      const items = await CartItems.getByUserId(userId);

      if (!items || items.length === 0) {
        console.warn('createOrder: cart empty for userId', userId);
        return res.status(400).json({ error: "Cart is empty" });
      }

      const totalAmount = items.reduce((sum, item) => sum + Number(item.total || 0), 0);

      if (!totalAmount || totalAmount <= 0) {
        console.error('Refusing to create PayPal order because totalAmount is not positive', {
          totalAmount,
          itemsCount: items.length
        });
        return res.status(400).json({ error: 'Cart total must be greater than zero' });
      }

      console.log('Creating PayPal order for amount:', totalAmount);

      // Create PayPal order
      const order = await paypal.createOrder(totalAmount.toFixed(2));

      if (!order || !order.id) {
        console.error('PayPal createOrder returned unexpected payload:', order);
        return res.status(502).json({ error: 'Failed to create PayPal order', details: order });
      }

      console.log('PayPal order created:', order.id);

      res.json({ success: true, orderId: order.id });
    } catch (err) {
      console.error("Create order error:", err);
      res.status(500).json({ error: "Failed to create order", details: err.message });
    }
  },

  // Process payment and mark cart items as paid
  pay: async (req, res) => {
    console.log("pay called");
    try {
      const userId = req.session.user.id;
      
      // Get the PayPal order ID from request
      const { orderId } = req.body;
      
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required" });
      }

      // Capture the PayPal payment
      const capture = await paypal.captureOrder(orderId);
      
      console.log('PayPal Capture Response:', JSON.stringify(capture, null, 2));
      
      if (capture.status !== 'COMPLETED') {
        return res.status(400).json({ error: "Payment was not completed", status: capture.status });
      }

      // Extract transaction details from PayPal response
      const isoString = capture.purchase_units[0].payments.captures[0].create_time;
      const mysqlDatetime = isoString.replace("T", " ").replace("Z", "");
      
      // Log all capture IDs for debugging
      const allCaptureIds = capture.purchase_units
        .flatMap(unit => (unit.payments && unit.payments.captures) ? unit.payments.captures.map(c => c.id) : []);
      console.log('All PayPal Capture IDs:', allCaptureIds);
      
      const paypalTransactionId = capture.purchase_units[0].payments.captures[0].id;
      console.log('PayPal Transaction ID being saved:', paypalTransactionId);

      // Get cart items for this user
      const items = await CartItems.getByUserId(userId);

      if (!items || items.length === 0) {
        return res.status(400).json({ error: "No items in cart to process" });
      }

      // Calculate total amount
      const totalAmount = items.reduce((sum, item) => sum + Number(item.total || 0), 0);

        // Use provided address, fallback to user profile
        const providedAddress = (req.body.address || '').trim();
        const user = await UserModel.getUserById({ id: userId });
        const userAddress = providedAddress || (user && user.address ? user.address : null);

      // Create order in database
        const orderResult = await Orders.createOrder(userId, totalAmount, userAddress);
      const dbOrderId = orderResult.insertId;

      // Now create transaction with correct orderId
      const transaction = {
        orderId: dbOrderId,  // Database order ID, not PayPal capture ID
        captureId: paypalTransactionId,
        payerId: capture.payer.payer_id,
        payerEmail: capture.payer.email_address,
        amount: capture.purchase_units[0].payments.captures[0].amount.value,
        currency: capture.purchase_units[0].payments.captures[0].amount.currency_code,
        status: capture.status,
        time: mysqlDatetime,
      };

      console.log('Transaction object to save:', transaction);

      // Save transaction to DB
      await Transaction.create(transaction);

      // Prepare order items
      const orderItems = items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        total: item.total
      }));

      // Add order items to order_details
      await Orders.addOrderItems(dbOrderId, orderItems, userAddress);

      // Decrement stock for each product ordered
      console.log(`[paymentController.pay] Decrementing stock for ${orderItems.length} items...`);
      const failedDecrements = [];
      for (let item of orderItems) {
        try {
          console.log(`[paymentController.pay] Decrementing productId ${item.productId} by ${item.quantity}`);
          const result = await SupermarketModel.decrementStock(item.productId, item.quantity);
          if (!result || !result.affectedRows || result.affectedRows === 0) {
            console.error(`[paymentController.pay] Stock decrement failed for productId ${item.productId}`);
            failedDecrements.push({ productId: item.productId, quantity: item.quantity });
          } else {
            console.log(`[paymentController.pay] ✓ Stock decremented for productId ${item.productId}`);
          }
        } catch (decrementErr) {
          console.error(`[paymentController.pay] Error decrementing stock for productId ${item.productId}:`, decrementErr);
          failedDecrements.push({ productId: item.productId, quantity: item.quantity, error: decrementErr.message });
        }
      }

      if (failedDecrements.length > 0) {
        console.warn(`[paymentController.pay] ${failedDecrements.length} stock decrements failed:`, failedDecrements);
      }

      // Get cart item IDs to remove
      const cartItemIds = items.map(item => item.productId);

      // Remove cart items after successful payment
      await CartItems.removeBulk(userId, cartItemIds);

      console.log("Transaction to save:", transaction);
      console.log("User ID:", userId);
      console.log("Order ID:", dbOrderId);
      console.log("Cart items removed:", cartItemIds.length);

      // Respond with success
      res.json({ 
        success: true, 
        transaction,
        orderId: dbOrderId,
        message: "Payment successful and order created"
      });

    } catch (err) {
      console.error("Pay error:", err);
      res.status(500).json({ 
        error: "Failed to process payment", 
        message: err.message 
      });
    }
  },

  // Get all paid orders for the current user
  getOrders: async (req, res) => {
    try {
      const userId = req.session.user.userId;
      
      Orders.getOrdersByUser(userId, (err, orders) => {
        if (err) {
          console.error("Error fetching orders:", err);
          return res.status(500).json({ error: "Failed to fetch orders" });
        }
        res.json({ success: true, orders });
      });
    } catch (err) {
      console.error("Get orders error:", err);
      res.status(500).json({ error: "Failed to fetch orders", message: err.message });
    }
  },

  // Get order details by order ID
  getOrderDetails: async (req, res) => {
    try {
      const orderId = req.params.orderId;
      
      OrderDetails.getByOrderId(orderId, (err, items) => {
        if (err) {
          console.error("Error fetching order details:", err);
          return res.status(500).json({ error: "Failed to fetch order details" });
        }
        
        const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
        
        res.json({ 
          success: true, 
          orderId,
          items,
          total: total.toFixed(2)
        });
      });
    } catch (err) {
      console.error("Get order details error:", err);
      res.status(500).json({ error: "Failed to fetch order details", message: err.message });
    }
  },

  // NETS QR Code Generation
  generateNETSQR: async (req, res) => {
    const { cartTotal, address } = req.body;
    console.log('generateNETSQR: cart total:', cartTotal, 'address:', address);
    
    try {
      // Call NETS service to generate QR code
      const netsResponse = await nets.generateQrCode(cartTotal, address);
      const qrData = netsResponse.result.data;

      if (qrData.response_code === "00" && qrData.txn_status === 1 && qrData.qr_code) {
        console.log("QR code generated successfully");

        const txnRetrievalRef = qrData.txn_retrieval_ref;
        const courseInitId = (() => {
          try {
            require.resolve("./../course_init_id");
            const { courseInitId } = require("../course_init_id");
            return courseInitId ? `${courseInitId}` : "";
          } catch (error) {
            return "";
          }
        })();

        const webhookUrl = `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets/webhook?txn_retrieval_ref=${txnRetrievalRef}&course_init_id=${courseInitId}`;

        // Store pending NETS info in session for completion step
        if (req.session) {
          req.session.netsPending = {
            amount: cartTotal,
            txnRetrievalRef: txnRetrievalRef
          };
          req.session.netsAddress = address || '';
        }

        // Render QR code page
        res.render("netsQr", {
          total: cartTotal,
          title: "Scan to Pay",
          qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
          txnRetrievalRef: txnRetrievalRef,
          courseInitId: courseInitId,
          networkCode: qrData.network_status,
          timer: 300,
          webhookUrl: webhookUrl,
          fullNetsResponse: netsResponse,
          apiKey: process.env.API_KEY,
          projectId: process.env.PROJECT_ID,
        });
      } else {
        let errorMsg = "An error occurred while generating the QR code.";
        if (qrData.network_status !== 0) {
          errorMsg = qrData.error_message || "Transaction failed. Please try again.";
        }
        res.render("netsQrFail", {
          title: "Error",
          responseCode: qrData.response_code || "N.A.",
          instructions: qrData.instruction || "",
          errorMsg: errorMsg,
        });
      }
    } catch (error) {
      console.error("Error in generateNETSQR:", error.message);
      res.redirect("/nets-qr/fail");
    }
  },

  // Complete NETS Payment - Handle order creation and processing
  completeNETSPayment: async (req, res) => {
    try {
      const user = req.session && req.session.user;
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      const userId = user.id;

      const pending = req.session && req.session.netsPending;
      if (!pending || !pending.amount) {
        return res.status(400).json({ error: 'No pending NETS payment' });
      }

      // Get cart items
      const items = await CartItems.getByUserId(userId);
      if (!items || !items.length) {
        return res.status(400).json({ error: 'Cart is empty' });
      }

      const totalAmount = items.reduce((sum, item) => sum + Number(item.total || 0), 0);

      // Get user address from session or profile
      const userInfo = await UserModel.getUserById({ id: userId });
      const sessionAddress = req.session && req.session.netsAddress ? req.session.netsAddress.trim() : '';
      const userAddress = sessionAddress || (userInfo && userInfo.address ? userInfo.address : null);

      // Create order
      const orderResult = await Orders.createOrder(userId, totalAmount, userAddress);
      const orderId = orderResult.insertId;

      // Prepare order items
      const orderItems = items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        total: item.total
      }));

      // Add order items to order_details
      await Orders.addOrderItems(orderId, orderItems, userAddress);

      // Decrement stock for each product
      console.log(`[completeNETSPayment] Decrementing stock for ${orderItems.length} items...`);
      const failedDecrements = [];
      for (let item of orderItems) {
        try {
          const result = await SupermarketModel.decrementStock(item.productId, item.quantity);
          if (!result || !result.affectedRows) {
            failedDecrements.push({ productId: item.productId, quantity: item.quantity });
          } else {
            console.log(`[completeNETSPayment] ✓ Stock decremented for productId ${item.productId}`);
          }
        } catch (e) {
          console.error(`[completeNETSPayment] Error decrementing stock for ${item.productId}:`, e);
          failedDecrements.push({ productId: item.productId, quantity: item.quantity, error: e.message });
        }
      }

      // Record transaction
      const payerEmail = userInfo?.email || user?.email || 'unknown@customer.local';
      const nowAsMysql = () => new Date().toISOString().replace('T', ' ').replace('Z', '');
      
      await Transaction.create({
        orderId,
        captureId: pending.txnRetrievalRef || null,
        payerId: 'NETS',
        payerEmail: payerEmail,
        amount: totalAmount,
        currency: 'SGD',
        status: failedDecrements.length ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED',
        time: nowAsMysql()
      });

      // Clear cart
      try { 
        await CartItems.clear(userId); 
      } catch (e) { 
        console.error('Clear cart error:', e); 
      }

      if (req.session) {
        req.session.cart = [];
        req.session.netsPending = null;
        req.session.netsAddress = null;
        try { 
          await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve())); 
        } catch (e) { 
          console.error('Session save error:', e); 
        }
      }

      return res.json({ success: true, orderId, failedDecrements });
    } catch (err) {
      console.error('completeNETSPayment error:', err);
      return res.status(500).json({ error: 'NETS payment completion failed', message: err.message });
    }
  },

  // Show thank you page with payment details
  showThankYou: async (req, res) => {
    try {
      // Get payment details from query params or session
      const amount = parseFloat(req.query.amount) || 0;
      const orderId = req.query.orderId || req.session.lastOrderId || null;

      let paymentInfo = {
        method: 'Unknown',
        reference: '',
      };

      if (orderId) {
        // Fetch transaction for this order
        const transactions = await Transaction.getByOrderId(orderId);
        // getByOrderId may return an array or a single object
        const transaction = Array.isArray(transactions) ? transactions[0] : transactions;
        if (transaction) {
          if (transaction.payerId === 'NETS') {
            paymentInfo.method = 'NETS QR';
            paymentInfo.reference = transaction.captureId || transaction.payerId;
          } else if (transaction.payerId || transaction.payerEmail) {
            paymentInfo.method = 'PayPal';
            paymentInfo.reference = transaction.captureId || transaction.payerId;
          }
        }
      }

      res.render('thanku', { user: req.session.user, orderId, paymentInfo, amount });
    } catch (err) {
      console.error('showThankYou error:', err);
      res.status(500).send('Error displaying thank you page');
    }
  },
  // Refund PayPal payment by capture ID
  refundPayPal: async (req, res) => {
    try {
      const { orderId, reason } = req.body;
      if (!orderId) return res.render('refund', { error: 'Order ID required', orderId, reason });
      // Find transaction for this order
      const transaction = await Transaction.getByOrderId(orderId);
      if (!transaction || !transaction.captureId) {
        return res.render('refund', { error: 'No PayPal transaction found for this order', orderId, reason });
      }
      // Optionally allow partial refund: req.body.amount
      const refundResult = await paypal.refundPayment(transaction.captureId, req.body.amount);
      if (refundResult && refundResult.status === 'COMPLETED') {
        // Update transaction status to REFUNDED and store refund reason
        await Transaction.updateStatusByOrderId(orderId, 'REFUNDED', reason);
        // Restore product stock
        const orderItems = await OrderDetails.getByOrderId(orderId);
        const SupermarketModel = require('../models/supermarket');
        for (const item of orderItems) {
          // Increment stock by the quantity bought
          await SupermarketModel.incrementStock(item.productid, item.quantity);
        }
        return res.redirect('/orders');
      } else {
        return res.render('refund', { error: 'Refund failed', details: refundResult, orderId, reason });
      }
    } catch (err) {
      console.error('PayPal refund error:', err);
      res.render('refund', { error: 'Refund failed', message: err.message, orderId: req.body.orderId, reason: req.body.reason });
    }
  },
};

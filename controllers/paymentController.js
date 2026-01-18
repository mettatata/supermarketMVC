const Transaction = require("../models/transaction");
const CartItems = require('../models/cartitems');
const Orders = require('../models/order');
const OrderDetails = require('../models/orderdetails');
const paypal = require('../services/paypal');

module.exports = {
  // Get all cart items for the current user
  getCartItems: async (req, res) => {
    try {
      const userId = req.session.user.userId || req.session.user.id;
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
      const userId = req.session.user.userId || req.session.user.id;
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
      const userId = req.session.user.userId || req.session.user.id;
      
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
      const userId = req.session.user.userId || req.session.user.id;
      
      // Get the PayPal order ID from request
      const { orderId } = req.body;
      
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required" });
      }

      // Capture the PayPal payment
      const capture = await paypal.captureOrder(orderId);
      
      if (capture.status !== 'COMPLETED') {
        return res.status(400).json({ error: "Payment was not completed", status: capture.status });
      }

      // Extract transaction details from PayPal response
      const isoString = capture.purchase_units[0].payments.captures[0].create_time;
      const mysqlDatetime = isoString.replace("T", " ").replace("Z", "");

      const transaction = {
        orderId: capture.id,
        payerId: capture.payer.payer_id,
        payerEmail: capture.payer.email_address,
        amount: capture.purchase_units[0].payments.captures[0].amount.value,
        currency: capture.purchase_units[0].payments.captures[0].amount.currency_code,
        status: capture.status,
        time: mysqlDatetime,
      };

      // Save transaction to DB
      await Transaction.create(transaction);

      // Get cart items for this user
      const items = await CartItems.getByUserId(userId);

      if (!items || items.length === 0) {
        return res.status(400).json({ error: "No items in cart to process" });
      }

      // Calculate total amount
      const totalAmount = items.reduce((sum, item) => sum + Number(item.total || 0), 0);

      // Create order in database
      const orderResult = await Orders.createOrder(userId, totalAmount);
      const dbOrderId = orderResult.insertId;

      // Prepare order items
      const orderItems = items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        total: item.total
      }));

      // Add order items to order_details
      await Orders.addOrderItems(dbOrderId, orderItems);

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
  }
};


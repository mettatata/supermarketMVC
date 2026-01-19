const axios = require("axios");
const CartItems = require('../models/cartitems');
const Orders = require('../models/order');
const SupermarketModel = require('../models/supermarket');
const Transaction = require('../models/transaction');

function nowAsMysql() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

exports.generateQrCode = async (req, res) => {
  const { cartTotal } = req.body;
  console.log(cartTotal);
  try {
    const requestBody = {
      txn_id: "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b", // Default for testing
      amt_in_dollars: cartTotal,
      notify_mobile: 0,
    };

    const response = await axios.post(
      `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request`,
      requestBody,
      {
        headers: {
          "api-key": process.env.API_KEY,
          "project-id": process.env.PROJECT_ID,
        },
      }
    );

    const getCourseInitIdParam = () => {
      try {
        require.resolve("./../course_init_id");
        const { courseInitId } = require("../course_init_id");
        console.log("Loaded courseInitId:", courseInitId);

        return courseInitId ? `${courseInitId}` : "";
      } catch (error) {
        return "";
      }
    };

    const qrData = response.data.result.data;
    console.log({ qrData });

    if (
      qrData.response_code === "00" &&
      qrData.txn_status === 1 &&
      qrData.qr_code
    ) {
      console.log("QR code generated successfully");

      // Store transaction retrieval reference for later use
      const txnRetrievalRef = qrData.txn_retrieval_ref;
      const courseInitId = getCourseInitIdParam();

      const webhookUrl = `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets/webhook?txn_retrieval_ref=${txnRetrievalRef}&course_init_id=${courseInitId}`;

      console.log("Transaction retrieval ref:" + txnRetrievalRef);
      console.log("courseInitId:" + courseInitId);
      console.log("webhookUrl:" + webhookUrl);

      
      // Store pending NETS info in session for completion step
      if (req.session) {
        req.session.netsPending = {
          amount: cartTotal,
          txnRetrievalRef: txnRetrievalRef
        };
      }

      // Render the QR code page with required data
      res.render("netsQr", {
        total: cartTotal,
        title: "Scan to Pay",
        qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
        txnRetrievalRef: txnRetrievalRef,
        courseInitId: courseInitId,
        networkCode: qrData.network_status,
        timer: 300, // Timer in seconds
        webhookUrl: webhookUrl,
         fullNetsResponse: response.data,
        apiKey: process.env.API_KEY,
        projectId: process.env.PROJECT_ID,
      });
    } else {
      // Handle partial or failed responses
      let errorMsg = "An error occurred while generating the QR code.";
      if (qrData.network_status !== 0) {
        errorMsg =
          qrData.error_message || "Transaction failed. Please try again.";
      }
      res.render("netsQrFail", {
        title: "Error",
        responseCode: qrData.response_code || "N.A.",
        instructions: qrData.instruction || "",
        errorMsg: errorMsg,
      });
    }
  } catch (error) {
    console.error("Error in generateQrCode:", error.message);
    res.redirect("/nets-qr/fail");
  }
};

// Complete NETS payment: create transaction, order, decrement stock, clear cart, redirect later
exports.completePayment = async (req, res) => {
  try {
    const user = req.session && req.session.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const userId = user.userId || user.id;

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

    // Create order
    const orderResult = await Orders.createOrder(userId, totalAmount);
    const orderId = orderResult.insertId;

    // Prepare order items
    const orderItems = items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
      total: item.total
    }));

    await Orders.addOrderItems(orderId, orderItems);

    // Decrement stock
    const failedDecrements = [];
    for (let item of orderItems) {
      try {
        const result = await SupermarketModel.decrementStock(item.productId, item.quantity);
        if (!result || !result.affectedRows) {
          failedDecrements.push({ productId: item.productId, quantity: item.quantity });
        }
      } catch (e) {
        failedDecrements.push({ productId: item.productId, quantity: item.quantity, error: e.message });
      }
    }

    // Record transaction
    await Transaction.create({
      orderId,
      payerId: pending.txnRetrievalRef || null,
      payerEmail: null,
      amount: totalAmount,
      currency: 'SGD',
      status: failedDecrements.length ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED',
      time: nowAsMysql()
    });

    // Clear cart
    try { await CartItems.clear(userId); } catch (e) { console.error('NETS clear cart error:', e); }
    if (req.session) {
      req.session.cart = [];
      req.session.netsPending = null;
      try { await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve())); } catch (e) { console.error('Session save error:', e); }
    }

    return res.json({ success: true, orderId, failedDecrements });
  } catch (err) {
    console.error('completePayment error:', err);
    return res.status(500).json({ error: 'NETS completion failed', message: err.message });
  }
};

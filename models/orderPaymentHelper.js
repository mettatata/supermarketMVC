// Helper to get payment info for a list of orders
const Transaction = require('./transaction');

async function attachPaymentInfoToOrders(orders) {
  if (!orders || !orders.length) return orders;
  const orderIds = orders.map(o => o.id);
  const payments = await Transaction.getAllLatestByOrderIds(orderIds);
  const paymentMap = {};
  payments.forEach(p => { paymentMap[p.orderId] = p; });
  return orders.map(order => {
    const payment = paymentMap[order.id];
    let paymentMethod = 'Unknown';
    let paymentReference = '';
    if (payment) {
      if (payment.payerId === 'NETS') {
        paymentMethod = 'NETS QR';
        paymentReference = payment.captureId || payment.payerId;
      } else if (payment.payerId || payment.payerEmail) {
        paymentMethod = 'PayPal';
        paymentReference = payment.captureId || payment.payerId;
      }
    }
    return { ...order, paymentMethod, paymentReference };
  });
}

module.exports = { attachPaymentInfoToOrders };
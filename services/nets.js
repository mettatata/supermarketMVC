const axios = require("axios");

exports.generateQrCode = async (cartTotal, address) => {
  const requestBody = {
    txn_id: "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b",
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

  return response.data;
};

exports.queryPaymentStatus = async (txnRetrievalRef, frontendTimeoutStatus = 0) => {
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

  return response.data;
};

const CASHFREE_ENV = process.env.CASHFREE_ENV || 'sandbox';
const BASE = CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

const CLIENT_ID = process.env.CASHFREE_CLIENT_ID;
const CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET;

async function cfFetch(pathSuffix, options = {}) {
  const res = await fetch(`${BASE}${pathSuffix}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': '2023-08-01',
      'x-client-id': CLIENT_ID,
      'x-client-secret': CLIENT_SECRET,
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Cashfree API error (${res.status})`);
  }
  return data;
}

async function createCashfreeOrder({ orderId, amount, customerId, customerEmail, customerPhone, returnUrl }) {
  return cfFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      order_id: orderId,
      order_amount: amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: customerId,
        customer_email: customerEmail,
        customer_phone: customerPhone
      },
      order_meta: {
        return_url: returnUrl
      }
    })
  });
}

async function getCashfreeOrderStatus(orderId) {
  return cfFetch(`/orders/${orderId}`, { method: 'GET' });
}

module.exports = { createCashfreeOrder, getCashfreeOrderStatus };

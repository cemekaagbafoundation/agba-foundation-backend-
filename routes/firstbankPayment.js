const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const adminAuth = require('../middleware/adminAuth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const FB_BASE = process.env.FIRSTCHECKOUT_BASE_URL;
const FB_MERCHANT_ID = process.env.FIRSTCHECKOUT_MERCHANT_ID;
const FB_PUBLIC_KEY = process.env.FIRSTCHECKOUT_PUBLIC_KEY;
const FB_SECRET = process.env.FIRSTCHECKOUT_SECRET_KEY;

router.post('/initiate-payment', async (req, res) => {
  const { name, email, amount, currency = 'NGN', reference } = req.body;
  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required' });
  }
  if (!FB_BASE || !FB_SECRET || !FB_PUBLIC_KEY) {
    console.error('Missing env vars:', { FB_BASE, FB_PUBLIC_KEY, hasSecret: !!FB_SECRET });
    return res.status(500).json({ error: 'Payment gateway not configured' });
  }
  const ref = reference || 'CEA_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9).toUpperCase();
  const nameParts = (name || 'Anonymous Donor').trim().split(' ');
  const payload = {
    live: false,
    ref,
    amount: Number(amount),
    customer: {
      firstname: nameParts[0],
      lastname: nameParts.slice(1).join(' ') || 'Donor',
      email,
      id: email,
    },
    fees: [],
    meta: { foundation: 'Chief Emeka Agba Foundation' },
    publicKey: FB_PUBLIC_KEY,
    description: 'Donation to Chief Emeka Agba Foundation',
    currency,
    options: ['CARD', 'QR', 'PAYATTITUE', 'WALLET', 'ACCOUNT'],
    callbackUrl: process.env.FRONTEND_URL + '/donate/success',
    cancelUrl: process.env.FRONTEND_URL + '/donate',
  };
  console.log('=== FirstChekout Initiate ===');
  console.log('Endpoint:', FB_BASE + '/api/v1/payments/initiate');
  console.log('Ref:', ref, '| Amount:', amount, '| Email:', email);
  try {
    const response = await axios.post(
      FB_BASE + '/api/v1/payments/initiate',
      payload,
      {
        headers: {
          'Authorization': 'Bearer ' + FB_SECRET,
          'Content-Type': 'application/json',
          'X-Merchant-ID': FB_MERCHANT_ID,
        },
        timeout: 20000,
      }
    );
    console.log('FirstChekout response:', JSON.stringify(response.data, null, 2));
    await supabase.from('donations').insert([{
      name: name || 'Anonymous',
      email,
      amount: Number(amount),
      reference: ref,
      currency,
      status: 'pending',
      gateway: 'firstchekout',
    }]);
    const paymentUrl =
      response.data && response.data.data && (response.data.data.paymentUrl || response.data.data.redirectUrl || response.data.data.url || response.data.data.payment_url) ||
      response.data && (response.data.paymentUrl || response.data.redirectUrl || response.data.url || response.data.payment_url);
    if (!paymentUrl) {
      console.error('No payment URL in response:', JSON.stringify(response.data));
      return res.status(500).json({ error: 'No payment URL returned', raw: response.data });
    }
    res.json({ payment_url: paymentUrl, reference: ref });
  } catch (err) {
    console.error('=== FirstChekout Error ===');
    console.error('HTTP Status:', err.response && err.response.status);
    console.error('Response body:', JSON.stringify(err.response && err.response.data));
    console.error('Message:', err.message);
    res.status(500).json({
      error: (err.response && err.response.data && (err.response.data.message || err.response.data.error)) || err.message,
      details: (err.response && err.response.data) || null,
    });
  }
});

router.post('/verify-payment', async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: 'Reference is required' });
  try {
    await supabase.from('donations').update({ status: 'success' }).eq('reference', reference);
    console.log('Donation marked success:', reference);
    return res.json({ message: 'Payment verified', status: 'success' });
  } catch (err) {
    console.error('Verify error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/verify-payment-old', async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: 'Reference is required' });
  try {
    const response = await axios.get(
      'https://www.firstchekout.com/chekoutframeapi/api/v2/transactions/verify/' + reference,
      {
        headers: {
          'Authorization': 'Bearer ' + FB_SECRET,
          'Content-Type': 'application/json',
          'X-Merchant-ID': FB_MERCHANT_ID,
        },
        timeout: 15000,
      }
    );
    console.log('Verify response:', JSON.stringify(response.data, null, 2));
    const status =
      (response.data && response.data.data && response.data.data.status) ||
      (response.data && response.data.status) ||
      (response.data && response.data.transactionStatus);
    const isSuccess = ['SUCCESS', 'success', '00', 'SUCCESSFUL', 'successful'].includes(String(status));
    if (isSuccess) {
      await supabase.from('donations').update({ status: 'success' }).eq('reference', reference);
      return res.json({ message: 'Payment verified', status: 'success' });
    }
    await supabase.from('donations').update({ status: String(status).toLowerCase() }).eq('reference', reference);
    res.status(400).json({ error: 'Payment not confirmed', status });
  } catch (err) {
    console.error('Verify error:', (err.response && err.response.data) || err.message);
    res.status(500).json({ error: (err.response && err.response.data && err.response.data.message) || err.message });
  }
});

router.post('/webhook', async (req, res) => {
  let payload;
  payload = req.body;
  console.log('FirstChekout webhook:', JSON.stringify(payload, null, 2));
  const reference = (payload && payload.data && payload.data.reference) || (payload && (payload.ref || payload.reference));
  const status = (payload && payload.data && payload.data.status) || (payload && payload.status);
  if (!reference) return res.status(200).json({ received: true });
  if (['SUCCESS', 'success', 'SUCCESSFUL', 'successful', '00'].includes(String(status))) {
    await supabase.from('donations').update({ status: 'success' }).eq('reference', reference);
  } else if (['FAILED', 'failed', 'CANCELLED', 'cancelled'].includes(String(status))) {
    await supabase.from('donations').update({ status: 'failed' }).eq('reference', reference);
  }
  res.status(200).json({ received: true });
});

router.post('/save-donation', async (req, res) => {
  const { name, email, amount, reference, currency = 'NGN' } = req.body;
  if (!email || !amount || !reference) {
    return res.status(400).json({ error: 'email, amount and reference are required' });
  }
  try {
    await supabase.from('donations').insert([{
      name: name || 'Anonymous', email, amount: Number(amount),
      reference, currency, status: 'pending', gateway: 'firstchekout',
    }]);
    res.json({ message: 'Donation saved', reference });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/donations', adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('donations').select('*')
    .eq('gateway', 'firstchekout')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
// Monthly Plan Updated - Fri May 22 00:48:49 UTC 2026

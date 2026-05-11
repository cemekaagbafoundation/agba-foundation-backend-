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

// ── INITIATE PAYMENT ──
router.post('/initiate-payment', async (req, res) => {
  const { name, email, amount, currency = 'NGN', reference } = req.body;

  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required' });
  }

  if (!FB_BASE || !FB_SECRET || !FB_PUBLIC_KEY) {
    console.error('Missing FirstChekout env vars:', { FB_BASE, FB_PUBLIC_KEY, FB_SECRET: !!FB_SECRET });
    return res.status(500).json({ error: 'Payment gateway not configured' });
  }

  const ref = reference || `CEA_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  const nameParts = (name || 'Anonymous Donor').split(' ');

  const payload = {
    publicKey: FB_PUBLIC_KEY,
    merchantId: FB_MERCHANT_ID,
    amount: Number(amount),
    currency,
    ref,
    customer: {
      firstname: nameParts[0],
      lastname: nameParts.slice(1).join(' ') || 'Donor',
      email,
      id: email,
    },
    description: 'Donation to Chief Emeka Agba Foundation',
    callbackUrl: `${process.env.FRONTEND_URL}/donate/success`,
    cancelUrl: `${process.env.FRONTEND_URL}/donate`,
    metadata: { source: 'website', foundation: 'Chief Emeka Agba Foundation' },
  };

  console.log('=== FirstChekout Initiate ===');
  console.log('URL:', `${FB_BASE}/api/v1/payments/initiate`);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `${FB_BASE}/api/v1/payments/initiate`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${FB_SECRET}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('FirstChekout raw response:', JSON.stringify(response.data, null, 2));

    await supabase.from('donations').insert([{
      name: name || 'Anonymous',
      email, amount: Number(amount),
      reference: ref, currency,
      status: 'pending', gateway: 'firstchekout'
    }]);

    const paymentUrl =
      response.data?.data?.paymentUrl ||
      response.data?.data?.redirectUrl ||
      response.data?.data?.url ||
      response.data?.paymentUrl ||
      response.data?.redirectUrl ||
      response.data?.url;

    if (!paymentUrl) {
      console.error('No payment URL found in response:', response.data);
      return res.status(500).json({ error: 'No payment URL returned', raw: response.data });
    }

    res.json({ payment_url: paymentUrl, reference: ref });

  } catch (err) {
    console.error('=== FirstChekout Error ===');
    console.error('Status:', err.response?.status);
    console.error('Data:', JSON.stringify(err.response?.data));
    console.error('Message:', err.message);
    res.status(500).json({
      error: err.response?.data?.message || err.response?.data?.error || err.message,
      details: err.response?.data || null
    });
  }
});

// ── VERIFY PAYMENT ──
router.post('/verify-payment', async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: 'Reference is required' });

  try {
    const response = await axios.get(
      `${FB_BASE}/api/v1/payments/verify/${reference}`,
      {
        headers: {
          'Authorization': `Bearer ${FB_SECRET}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('Verify response:', JSON.stringify(response.data, null, 2));

    const status =
      response.data?.data?.status ||
      response.data?.status ||
      response.data?.transactionStatus;

    const isSuccess = ['SUCCESS', 'success', '00', 'SUCCESSFUL', 'successful'].includes(status);

    if (isSuccess) {
      await supabase.from('donations').update({ status: 'success' }).eq('reference', reference);
      return res.json({ message: 'Payment verified', status: 'success' });
    }

    res.status(400).json({ error: 'Payment not successful', status });

  } catch (err) {
    console.error('Verify error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// ── WEBHOOK ──
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let payload;
  try {
    payload = JSON.parse(req.body);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.log('FirstChekout webhook:', JSON.stringify(payload, null, 2));

  const reference = payload?.data?.reference || payload?.reference;
  const status = payload?.data?.status || payload?.status;

  if (!reference) return res.status(200).json({ received: true });

  if (['SUCCESS', 'success', 'SUCCESSFUL', 'successful', '00'].includes(status)) {
    await supabase.from('donations').update({ status: 'success' }).eq('reference', reference);
  } else if (['FAILED', 'failed', 'CANCELLED', 'cancelled'].includes(status)) {
    await supabase.from('donations').update({ status: 'failed' }).eq('reference', reference);
  }

  res.status(200).json({ received: true });
});

// ── SAVE PENDING DONATION ──
router.post('/save-donation', async (req, res) => {
  const { name, email, amount, reference, currency = 'NGN' } = req.body;
  try {
    await supabase.from('donations').insert([{
      name: name || 'Anonymous',
      email, amount: Number(amount),
      reference, currency,
      status: 'pending', gateway: 'firstchekout'
    }]);
    res.json({ message: 'Donation saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET ALL DONATIONS (Admin) ──
router.get('/donations', adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .eq('gateway', 'firstchekout')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;

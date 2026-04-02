const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const adminAuth = require('../middleware/adminAuth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const FB_BASE = process.env.FIRSTBANK_API_BASE_URL;
const FB_MERCHANT_ID = process.env.FIRSTBANK_MERCHANT_ID;
const FB_API_KEY = process.env.FIRSTBANK_API_KEY;
const FB_SECRET = process.env.FIRSTBANK_SECRET_KEY;
const FB_WEBHOOK_SECRET = process.env.FIRSTBANK_WEBHOOK_SECRET;

// ── INITIATE PAYMENT ──
router.post('/initiate-payment', async (req, res) => {
  const { name, email, amount, currency = 'NGN' } = req.body;

  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required' });
  }

  const reference = `CEA_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  try {
    const response = await axios.post(
      `${FB_BASE}/payments/initiate`,
      {
        merchantId: FB_MERCHANT_ID,
        amount: amount,
        currency: currency,
        customerEmail: email,
        customerName: name || 'Anonymous',
        reference: reference,
        callbackUrl: `${process.env.FRONTEND_URL}/donate/success`,
        cancelUrl: `${process.env.FRONTEND_URL}/donate/failed`,
        description: 'Donation to Chief Emeka Agba Foundation',
        metadata: { name, email, source: 'website' }
      },
      {
        headers: {
          'Authorization': `Bearer ${FB_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Merchant-ID': FB_MERCHANT_ID
        }
      }
    );

    // Save pending donation to database
    await supabase.from('donations').insert([{
      name, email, amount, reference,
      currency, status: 'pending', gateway: 'firstbank'
    }]);

    res.json({
      payment_url: response.data.paymentUrl || response.data.redirectUrl,
      reference: reference,
      session_id: response.data.sessionId || response.data.transactionId
    });

  } catch (err) {
    console.error('FirstBank initiate error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// ── VERIFY PAYMENT ──
router.post('/verify-payment', async (req, res) => {
  const { reference } = req.body;

  if (!reference) return res.status(400).json({ error: 'Reference is required' });

  try {
    const response = await axios.get(
      `${FB_BASE}/payments/verify/${reference}`,
      {
        headers: {
          'Authorization': `Bearer ${FB_API_KEY}`,
          'X-Merchant-ID': FB_MERCHANT_ID
        }
      }
    );

    const status = response.data.status || response.data.transactionStatus;

    if (status === 'SUCCESS' || status === 'success' || status === '00') {
      await supabase
        .from('donations')
        .update({ status: 'success' })
        .eq('reference', reference);

      return res.json({ message: 'Payment verified successfully', status: 'success' });
    }

    res.status(400).json({ error: 'Payment not successful', status });

  } catch (err) {
    console.error('FirstBank verify error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// ── WEBHOOK (First Bank calls this automatically) ──
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Verify webhook signature
  const signature = req.headers['x-firstbank-signature']
    || req.headers['x-webhook-signature']
    || req.headers['authorization'];

  const expectedSignature = crypto
    .createHmac('sha256', FB_WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex');

  if (signature !== expectedSignature && signature !== `sha256=${expectedSignature}`) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = JSON.parse(req.body);
  const { reference, status, amount, currency } = payload;

  console.log('FirstBank webhook received:', payload);

  if (status === 'SUCCESS' || status === 'success' || status === '00') {
    await supabase
      .from('donations')
      .update({ status: 'success' })
      .eq('reference', reference);
  } else if (status === 'FAILED' || status === 'failed') {
    await supabase
      .from('donations')
      .update({ status: 'failed' })
      .eq('reference', reference);
  }

  // Always return 200 to acknowledge webhook receipt
  res.status(200).json({ received: true });
});

// ── GET ALL DONATIONS (Admin) ──
router.get('/donations', adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .eq('gateway', 'firstbank')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const adminAuth = require('../middleware/adminAuth');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── SAVE PENDING DONATION (called before popup opens) ──
router.post('/save-donation', async (req, res) => {
  const { name, email, amount, reference, currency = 'NGN' } = req.body;
  if (!email || !amount || !reference) {
    return res.status(400).json({ error: 'email, amount and reference are required' });
  }
  try {
    const { error } = await supabase.from('donations').insert([{
      name: name || 'Anonymous',
      email,
      amount: Number(amount),
      reference,
      currency,
      status: 'pending',
      gateway: 'firstchekout'
    }]);
    if (error) throw error;
    res.json({ message: 'Donation saved', reference });
  } catch (err) {
    console.error('Save donation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── VERIFY PAYMENT (called on success page after redirect) ──
router.post('/verify-payment', async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: 'Reference is required' });

  const FB_BASE = process.env.FIRSTCHECKOUT_BASE_URL;
  const FB_SECRET = process.env.FIRSTCHECKOUT_SECRET_KEY;

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

    const isSuccess = ['SUCCESS', 'success', '00', 'SUCCESSFUL', 'successful'].includes(String(status));

    if (isSuccess) {
      await supabase
        .from('donations')
        .update({ status: 'success' })
        .eq('reference', reference);
      return res.json({ message: 'Payment verified', status: 'success' });
    }

    // Still update with whatever status came back
    await supabase
      .from('donations')
      .update({ status: String(status).toLowerCase() })
      .eq('reference', reference);

    res.status(400).json({ error: 'Payment not confirmed', status });

  } catch (err) {
    console.error('Verify error:', err.response?.data || err.message);
    // Don't fail silently — still mark as pending so admin can check
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// ── WEBHOOK (FirstChekout calls this automatically after payment) ──
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let payload;
  try {
    payload = JSON.parse(req.body);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.log('FirstChekout webhook received:', JSON.stringify(payload, null, 2));

  const reference = payload?.data?.reference || payload?.ref || payload?.reference;
  const status = payload?.data?.status || payload?.status;

  if (!reference) return res.status(200).json({ received: true });

  if (['SUCCESS', 'success', 'SUCCESSFUL', 'successful', '00'].includes(String(status))) {
    await supabase.from('donations').update({ status: 'success' }).eq('reference', reference);
  } else if (['FAILED', 'failed', 'CANCELLED', 'cancelled'].includes(String(status))) {
    await supabase.from('donations').update({ status: 'failed' }).eq('reference', reference);
  }

  res.status(200).json({ received: true });
});

// ── GET ALL FIRSTCHEKOUT DONATIONS (Admin) ──
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

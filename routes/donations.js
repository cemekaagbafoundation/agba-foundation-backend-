const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const adminAuth = require('../middleware/adminAuth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// PUBLIC: Initiate Paystack payment
router.post('/initiate-payment', async (req, res) => {
  const { name, email, amount } = req.body;
  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required' });
  }

  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: Math.round(amount * 100), // Paystack uses kobo
        metadata: { name }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { reference, authorization_url } = response.data.data;

    await supabase.from('donations').insert([{
      name, email, amount, reference, status: 'pending'
    }]);

    res.json({ authorization_url, reference });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC: Verify payment after Paystack redirect
router.post('/verify-payment', async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: 'Reference is required' });

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const { status } = response.data.data;

    if (status === 'success') {
      await supabase
        .from('donations')
        .update({ status: 'success' })
        .eq('reference', reference);

      return res.json({ message: 'Payment verified and recorded' });
    }

    res.status(400).json({ error: 'Payment was not successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN: Get all donations
router.get('/', adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;

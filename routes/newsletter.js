const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const adminAuth = require('../middleware/adminAuth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

router.post('/', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const { error } = await supabase
    .from('newsletter_subscribers')
    .insert([{ email }]);
  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Email already subscribed' });
    return res.status(500).json({ error: error.message });
  }
  res.json({ message: 'Subscribed successfully' });
});

router.get('/', adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('newsletter_subscribers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', adminAuth, async (req, res) => {
  const { error } = await supabase
    .from('newsletter_subscribers')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Subscriber deleted' });
});

module.exports = router;

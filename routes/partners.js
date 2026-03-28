const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const adminAuth = require('../middleware/adminAuth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', adminAuth, async (req, res) => {
  const { name, logo_url, website, type } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const { error } = await supabase
    .from('partners')
    .insert([{ name, logo_url: logo_url || '', website: website || '', type: type || 'partner' }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Partner added successfully' });
});

router.delete('/:id', adminAuth, async (req, res) => {
  const { error } = await supabase
    .from('partners')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Partner deleted' });
});

module.exports = router;

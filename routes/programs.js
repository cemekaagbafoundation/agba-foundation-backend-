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
    .from('programs')
    .select('*')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', adminAuth, async (req, res) => {
  const { name, description, image_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Program name is required' });
  const { error } = await supabase
    .from('programs')
    .insert([{ name, description: description || '', image_url: image_url || null }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Program added successfully' });
});

router.put('/:id', adminAuth, async (req, res) => {
  const { name, description, image_url } = req.body;
  const { error } = await supabase
    .from('programs')
    .update({ name, description, image_url })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Program updated successfully' });
});

router.delete('/:id', adminAuth, async (req, res) => {
  const { error } = await supabase
    .from('programs')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Program deleted successfully' });
});

module.exports = router;

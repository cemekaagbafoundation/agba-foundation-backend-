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
    .from('hero_images')
    .select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/:section', adminAuth, async (req, res) => {
  const { image_url, title } = req.body;
  const { error } = await supabase
    .from('hero_images')
    .update({ image_url, title })
    .eq('section', req.params.section);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Updated successfully' });
});

module.exports = router;

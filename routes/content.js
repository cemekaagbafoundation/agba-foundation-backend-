const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const adminAuth = require('../middleware/adminAuth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// PUBLIC: Get all content sections
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('content')
    .select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ADMIN: Update content by ID
router.put('/:id', adminAuth, async (req, res) => {
  const { content } = req.body;
  const { error } = await supabase
    .from('content')
    .update({ content })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Content updated successfully' });
});

// ADMIN: Create new content section
router.post('/', adminAuth, async (req, res) => {
  const { section_name, content } = req.body;
  if (!section_name) return res.status(400).json({ error: 'section_name is required' });
  const { data, error } = await supabase
    .from('content')
    .upsert([{ section_name, content }], { onConflict: 'section_name' })
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Content saved successfully', data });
});

module.exports = router;

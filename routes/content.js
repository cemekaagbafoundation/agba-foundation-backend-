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
  const { data, error } = await supabase.from('content').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ADMIN: Update a content section by id
router.put('/:id', adminAuth, async (req, res) => {
  const { content } = req.body;
  const { error } = await supabase
    .from('content')
    .update({ content })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Content updated' });
});

module.exports = router;

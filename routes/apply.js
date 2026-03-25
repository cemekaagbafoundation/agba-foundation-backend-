const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const adminAuth = require('../middleware/adminAuth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// PUBLIC: Submit application
router.post('/', async (req, res) => {
  const { full_name, dob, country, state, email, phone, sex, program } = req.body;

  if (!full_name || !dob || !country || !state || !email || !phone || !sex || !program) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const { error } = await supabase.from('applications').insert([
    { full_name, dob, country, state, email, phone, sex, program }
  ]);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Application submitted successfully' });
});

// ADMIN: Get all applications, optionally filter by program
router.get('/', adminAuth, async (req, res) => {
  const { program } = req.query;
  let query = supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false });

  if (program) query = query.eq('program', program);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;

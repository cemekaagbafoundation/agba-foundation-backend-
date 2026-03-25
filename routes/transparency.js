const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const adminAuth = require('../middleware/adminAuth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// PUBLIC: Get all transparency/impact data
router.get('/', async (req, res) => {
  try {
    const [donationsResult, statsResult, feedResult] = await Promise.all([
      supabase.from('donations').select('amount').eq('status', 'success'),
      supabase.from('impact_stats').select('*').single(),
      supabase
        .from('donations')
        .select('name, amount, created_at')
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    const totalDonations = (donationsResult.data || []).reduce(
      (sum, d) => sum + Number(d.amount), 0
    );
    const totalDonors = (donationsResult.data || []).length;
    const stats = statsResult.data || {};

    res.json({
      total_donations: totalDonations,
      total_donors: totalDonors,
      funds_utilized: stats.funds_utilized || 0,
      youths_trained: stats.youths_trained || 0,
      programs_completed: stats.programs_completed || 0,
      jobs_created: stats.jobs_created || 0,
      live_feed: feedResult.data || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN: Update impact stats
router.put('/stats', adminAuth, async (req, res) => {
  const { youths_trained, programs_completed, jobs_created, funds_utilized } = req.body;

  const { data: existing } = await supabase
    .from('impact_stats')
    .select('id')
    .limit(1)
    .single();

  if (!existing) return res.status(404).json({ error: 'Stats row not found' });

  const { error } = await supabase
    .from('impact_stats')
    .update({ youths_trained, programs_completed, jobs_created, funds_utilized, updated_at: new Date() })
    .eq('id', existing.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Impact stats updated successfully' });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const adminAuth = require('../middleware/adminAuth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// PUBLIC: Get all hero images
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('hero_images')
    .select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ADMIN: Upload image for a specific section
router.post('/upload/:section', adminAuth, upload.single('image'), async (req, res) => {
  const file = req.file;
  const { section } = req.params;
  const { title } = req.body;

  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  // Get correct bucket name
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketName = buckets?.find(b => b.name.toLowerCase() === 'gallery')?.name || 'Gallery';

  const fileName = `hero_${section}_${Date.now()}_${file.originalname.replace(/\s/g, '_')}`;

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file.buffer, { contentType: file.mimetype });

  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data: urlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);

  // Save to hero_images table only, NOT gallery table
  const { error: dbError } = await supabase
    .from('hero_images')
    .update({ image_url: urlData.publicUrl, title: title || '' })
    .eq('section', section);

  if (dbError) return res.status(500).json({ error: dbError.message });

  res.json({ message: 'Hero image uploaded', image_url: urlData.publicUrl });
});

// ADMIN: Update hero image data
router.put('/:section', adminAuth, async (req, res) => {
  const { image_url, title } = req.body;
  const { section } = req.params;
  const { error } = await supabase
    .from('hero_images')
    .update({ image_url, title })
    .eq('section', section);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Updated successfully' });
});

module.exports = router;

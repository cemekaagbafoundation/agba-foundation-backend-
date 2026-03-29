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

// Try both bucket name variants
const BUCKET = 'gallery';

// PUBLIC: Get all gallery images
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('gallery')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ADMIN: Upload an image
router.post('/upload', adminAuth, upload.single('image'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  // Try to find the correct bucket name
  const { data: buckets } = await supabase.storage.listBuckets();
  console.log('Available buckets:', buckets?.map(b => b.name));

  const bucketName = buckets?.find(b =>
    b.name.toLowerCase() === 'gallery'
  )?.name || 'gallery';

  console.log('Using bucket:', bucketName);

  const fileName = `${Date.now()}_${file.originalname.replace(/\s/g, '_')}`;

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file.buffer, { contentType: file.mimetype });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    return res.status(500).json({ error: uploadError.message });
  }

  const { data: urlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);

  const { error: dbError } = await supabase
    .from('gallery')
    .insert([{ image_url: urlData.publicUrl }]);

  if (dbError) {
    console.error('DB insert error:', dbError);
    return res.status(500).json({ error: dbError.message });
  }

  res.json({ message: 'Image uploaded successfully', image_url: urlData.publicUrl });
});

// ADMIN: Delete an image
router.delete('/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('gallery')
    .delete()
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Image deleted' });
});

module.exports = router;

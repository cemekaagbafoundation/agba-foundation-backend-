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

  const fileName = `${Date.now()}_${file.originalname.replace(/\s/g, '_')}`;

  const { error: uploadError } = await supabase.storage
    .from('gallery')
    .upload(fileName, file.buffer, { contentType: file.mimetype });

  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data: urlData } = supabase.storage
    .from('gallery')
    .getPublicUrl(fileName);

  const { error: dbError } = await supabase
    .from('gallery')
    .insert([{ image_url: urlData.publicUrl }]);

  if (dbError) return res.status(500).json({ error: dbError.message });

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

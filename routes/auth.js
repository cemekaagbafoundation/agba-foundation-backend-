const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

router.post('/forgot-password', async (req, res) => {
  const adminEmail = 'C.emekaagbafoundation@gmail.com';
  const token = crypto.randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + 3600000);

  const { error } = await supabase
    .from('password_reset_tokens')
    .insert([{ email: adminEmail, token, expires_at }]);

  if (error) return res.status(500).json({ error: error.message });

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const resetLink = `${process.env.FRONTEND_URL}/admin/reset-password?token=${token}`;

    await transporter.sendMail({
      from: `"Chief Emeka Agba Foundation" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: 'Admin Password Reset',
      html: `<p>Click to reset your password (expires in 1 hour):</p><a href="${resetLink}">${resetLink}</a>`
    });

    res.json({ message: 'Reset link sent to admin email' });
  } catch (emailError) {
    console.error('Email error:', emailError.message);
    res.status(500).json({ error: 'Failed to send email: ' + emailError.message });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password required' });
  }

  const { data, error } = await supabase
    .from('password_reset_tokens')
    .select('*')
    .eq('token', token)
    .eq('used', false)
    .single();

  if (error || !data) {
    return res.status(400).json({ error: 'Token is invalid or already used' });
  }

  if (new Date(data.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Token has expired' });
  }

  await supabase
    .from('password_reset_tokens')
    .update({ used: true })
    .eq('token', token);

  res.json({
    message: `Password reset successful. Your new password is: ${newPassword} — Please update ADMIN_SECRET in Railway Variables to this value.`
  });
});

router.get('/verify-token', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.json({ valid: false });

  const { data } = await supabase
    .from('password_reset_tokens')
    .select('*')
    .eq('token', token)
    .eq('used', false)
    .single();

  if (!data || new Date(data.expires_at) < new Date()) {
    return res.json({ valid: false });
  }

  res.json({ valid: true });
});

module.exports = router;

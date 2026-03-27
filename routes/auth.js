const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const adminEmail = 'C.emekaagbafoundation@gmail.com';

  const token = crypto.randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + 3600000); // 1 hour

  const { error } = await supabase
    .from('password_reset_tokens')
    .insert([{ email: adminEmail, token, expires_at }]);

  if (error) return res.status(500).json({ error: error.message });

  const resetLink = `${process.env.FRONTEND_URL}/admin/reset-password?token=${token}`;

  try {
    await transporter.sendMail({
      from: `"Chief Emeka Agba Foundation" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: 'Admin Password Reset — Chief Emeka Agba Foundation',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0a1f0f; color: #c8dcc8; padding: 2rem; border-radius: 10px;">
          <h2 style="color: #c9911a;">Password Reset Request</h2>
          <p>You requested a password reset for the Chief Emeka Agba Foundation admin panel.</p>
          <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetLink}"
            style="display: inline-block; background: #c9911a; color: #061209; padding: 0.9rem 2rem; border-radius: 6px; font-weight: bold; text-decoration: none; margin: 1rem 0;">
            Reset My Password
          </a>
          <p style="color: #7a9e7a; font-size: 0.85rem;">If you did not request this, ignore this email. Your password will not change.</p>
          <hr style="border-color: #1a4a20;" />
          <p style="color: #3a5a3a; font-size: 0.75rem;">Chief Emeka Agba Foundation · info@chiefemekaagbafoundation.com</p>
        </div>
      `
    });
    res.json({ message: 'Reset link sent to admin email' });
  } catch (emailError) {
    console.error('Email error:', emailError);
    res.status(500).json({ error: 'Failed to send email. Check EMAIL_USER and EMAIL_PASS in Railway env.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  const { data, error } = await supabase
    .from('password_reset_tokens')
    .select('*')
    .eq('token', token)
    .eq('used', false)
    .single();

  if (error || !data) {
    return res.status(400).json({ error: 'Token is invalid or has already been used' });
  }

  if (new Date(data.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Token has expired. Please request a new reset link.' });
  }

  // Mark token as used
  await supabase
    .from('password_reset_tokens')
    .update({ used: true })
    .eq('token', token);

  // Send confirmation email with the new password
  try {
    await transporter.sendMail({
      from: `"Chief Emeka Agba Foundation" <${process.env.EMAIL_USER}>`,
      to: 'C.emekaagbafoundation@gmail.com',
      subject: 'Password Reset Successful — Action Required',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0a1f0f; color: #c8dcc8; padding: 2rem; border-radius: 10px;">
          <h2 style="color: #c9911a;">Password Reset Successful</h2>
          <p>Your new admin password is:</p>
          <div style="background: #061209; border: 1px solid #1a4a20; padding: 1rem; border-radius: 6px; font-size: 1.2rem; font-weight: bold; color: #c9911a; letter-spacing: 2px; margin: 1rem 0;">
            ${newPassword}
          </div>
          <p>Please also update <strong>ADMIN_SECRET</strong> in your Railway environment variables to this new password so the backend validates it correctly.</p>
          <p style="color: #7a9e7a; font-size: 0.85rem;">Railway → Your Project → Variables → ADMIN_SECRET → Update value → Redeploy</p>
          <hr style="border-color: #1a4a20;" />
          <p style="color: #3a5a3a; font-size: 0.75rem;">Chief Emeka Agba Foundation Admin System</p>
        </div>
      `
    });
  } catch (e) {
    console.error('Confirmation email error:', e);
  }

  res.json({
    message: 'Password reset successful. Check your email for your new password, then update ADMIN_SECRET in Railway.'
  });
});

// GET /api/auth/verify-token — check if token is still valid
router.get('/verify-token', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ valid: false });

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

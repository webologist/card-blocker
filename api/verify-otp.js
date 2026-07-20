// api/verify-otp.js — Vercel Serverless Function
// Verifies the OTP entered by the user

// NOTE: This shares state with send-otp.js only within the same serverless instance.
// For production, use Vercel KV or Redis for shared, persistent OTP storage.
const otpStore = global._otpStore || (global._otpStore = {});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required' });
  }

  const sanitizedPhone = phone.replace(/[^\d+]/g, '');
  const record = otpStore[sanitizedPhone];

  if (!record) {
    return res.status(400).json({ error: 'No OTP found for this number. Please request a new one.' });
  }

  if (record.used) {
    return res.status(400).json({ error: 'OTP already used. Please request a new one.' });
  }

  if (Date.now() > record.expiresAt) {
    delete otpStore[sanitizedPhone];
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (record.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
  }

  // Mark OTP as used
  record.used = true;
  delete otpStore[sanitizedPhone];

  return res.status(200).json({ success: true, message: 'Phone verified successfully' });
}

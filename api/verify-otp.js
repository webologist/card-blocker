// api/verify-otp.js — Reads OTP from cookie and verifies it

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, otp } = req.body || {};
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

  const sanitized = phone.replace(/[^\d+]/g, '');
  const fullPhone  = sanitized.startsWith('+') ? sanitized : '+91' + sanitized;
  const otpTrimmed = otp.toString().trim();

  // ── Read OTP cookie ───────────────────────────────────────────────
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/cg_otp=([^;]+)/);

  if (!match) {
    return res.status(400).json({ error: 'No OTP session found. Please request a new OTP.' });
  }

  let record;
  try {
    record = JSON.parse(Buffer.from(decodeURIComponent(match[1]), 'base64').toString());
  } catch {
    return res.status(400).json({ error: 'Invalid OTP session. Please request a new OTP.' });
  }

  // Normalise stored phone for comparison
  const storedPhone = record.phone.replace(/[^\d+]/g, '');
  const incomingPhone = fullPhone.replace(/[^\d+]/g, '');

  if (storedPhone !== incomingPhone) {
    return res.status(400).json({ error: 'Phone number does not match. Please request a new OTP.' });
  }

  if (Date.now() > record.expiresAt) {
    res.setHeader('Set-Cookie', 'cg_otp=; Path=/; Max-Age=0');
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (record.otp !== otpTrimmed) {
    return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
  }

  // Clear cookie after successful verification
  res.setHeader('Set-Cookie', 'cg_otp=; Path=/; Max-Age=0');
  return res.status(200).json({ success: true, message: 'Phone verified successfully' });
}

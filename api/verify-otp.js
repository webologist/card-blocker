export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, otp, token } = req.body || {};
  if (!phone || !otp || !token) return res.status(400).json({ error: 'Phone, OTP and token are required' });

  const digits = phone.replace(/\D/g, '').replace(/^91/, '');
  const fullPhone = '+91' + digits;

  let record;
  try {
    record = JSON.parse(Buffer.from(token, 'base64').toString());
  } catch {
    return res.status(400).json({ error: 'Invalid session token. Please request a new OTP.' });
  }

  if (record.phone !== fullPhone) {
    return res.status(400).json({ error: 'Phone number mismatch. Please request a new OTP.' });
  }

  if (Date.now() > record.expiresAt) {
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (record.otp !== otp.toString().trim()) {
    return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
  }

  return res.status(200).json({ success: true });
}

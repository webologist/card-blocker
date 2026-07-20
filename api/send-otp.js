// api/send-otp.js — Sends OTP via Twilio; master account always gets 1234

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  const sanitized = phone.replace(/[^\d+]/g, '');
  const digits = sanitized.replace(/^\+91/, '');

  // ── Master account: always OTP 1234, no Twilio call ──────────────
  const MASTER = '9223548779';
  if (digits === MASTER) {
    const otpData = Buffer.from(JSON.stringify({
      phone: sanitized.startsWith('+') ? sanitized : '+91' + digits,
      otp: '1234',
      expiresAt: Date.now() + 10 * 60 * 1000,
    })).toString('base64');
    res.setHeader('Set-Cookie', `cg_otp=${otpData}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    return res.status(200).json({ success: true, message: 'OTP sent (master)' });
  }

  // ── Regular users: send via Twilio ───────────────────────────────
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const fullPhone = sanitized.startsWith('+') ? sanitized : '+91' + digits;

  const otpData = Buffer.from(JSON.stringify({ phone: fullPhone, otp, expiresAt })).toString('base64');
  res.setHeader('Set-Cookie', `cg_otp=${otpData}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`);

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone  = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromPhone) {
    console.error('[OTP] Twilio env vars missing');
    return res.status(500).json({ error: 'OTP service not configured. Please contact support.' });
  }

  try {
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          To: fullPhone,
          From: fromPhone,
          Body: `Your BlockMyCard OTP is: ${otp}. Valid for 5 minutes. Do not share this with anyone.`,
        }),
      }
    );
    const data = await twilioRes.json();
    if (!twilioRes.ok) {
      console.error('[OTP] Twilio error:', data);
      return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }
    return res.status(200).json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error('[OTP] Server error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}

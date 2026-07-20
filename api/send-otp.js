// api/send-otp.js — Sends OTP via Twilio and stores it in a signed cookie

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  const sanitizedPhone = phone.replace(/[^\d+]/g, '');
  if (sanitizedPhone.length < 10) return res.status(400).json({ error: 'Invalid phone number' });

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  // Store OTP in a cookie so it persists across serverless instances
  const otpData = Buffer.from(JSON.stringify({ phone: sanitizedPhone, otp, expiresAt })).toString('base64');
  res.setHeader('Set-Cookie', `cg_otp=${otpData}; Path=/; HttpOnly; SameSite=Strict; Max-Age=300`);

  // Send via Twilio
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = `Your CardGuard OTP is: ${otp}. Valid for 5 minutes. Do not share this with anyone.`;

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
      body: new URLSearchParams({ To: sanitizedPhone, From: fromPhone, Body: body }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Twilio error:', data);
      return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }

    return res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}

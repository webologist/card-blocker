// api/send-otp.js — Vercel Serverless Function
// Sends a 6-digit OTP via Twilio SMS

const otpStore = {}; // In-memory store (resets on cold start — use Redis/KV for production)

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Sanitize: only digits and leading +
  const sanitizedPhone = phone.replace(/[^\d+]/g, '');
  if (sanitizedPhone.length < 10) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  // Rate limiting: max 3 OTPs per phone per 10 minutes
  const now = Date.now();
  if (otpStore[sanitizedPhone]) {
    const { attempts, firstAttempt } = otpStore[sanitizedPhone];
    if (now - firstAttempt < 10 * 60 * 1000 && attempts >= 3) {
      return res.status(429).json({ error: 'Too many requests. Please wait 10 minutes.' });
    }
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = now + 5 * 60 * 1000; // 5 minutes

  // Store OTP
  otpStore[sanitizedPhone] = {
    otp,
    expiresAt,
    used: false,
    attempts: (otpStore[sanitizedPhone]?.attempts || 0) + 1,
    firstAttempt: otpStore[sanitizedPhone]?.firstAttempt || now,
  };

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

// Rate limit: max 3 OTP requests per phone per 10 minutes
const rateLimitMap = new Map();

function isRateLimited(phone) {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const max = 3;
  const hits = (rateLimitMap.get(phone) || []).filter(t => now - t < window);
  if (hits.length >= max) return true;
  hits.push(now);
  rateLimitMap.set(phone, hits);
  return false;
}

async function signDummyToken(payload) {
  const secret = process.env.OTP_SECRET || 'bmc-otp-secret-2026';
  const data = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return Buffer.from(data).toString('base64') + '.' + sigHex;
}

// Server decision only, and never reachable on a production deployment for an
// arbitrary number - see lib/otp-mode.js and the note in verify-otp.js.
const { isDummyMode } = require('../lib/otp-mode');

const ALLOWED_ORIGINS = ['https://card-blocker.vercel.app'];

// Twilio trial accounts reject SMS to numbers that haven't been verified in the console (21608/21211).
function unverifiedNumberError(data) {
  if (data && (data.code === 21608 || data.code === 21211)) {
    return 'This number isn\'t whitelisted for our trial SMS account yet. Please contact support to get verified, or try a different number.';
  }
  return null;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, dummyMode } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  const digits = phone.replace(/\D/g, '').replace(/^91/, '');
  if (!/^[6-9]\d{9}$/.test(digits)) return res.status(400).json({ error: 'Invalid phone number. Enter a 10-digit Indian mobile number starting with 6-9.' });

  if (isRateLimited(digits)) {
    return res.status(429).json({ error: 'Too many OTP requests. Please wait 10 minutes.' });
  }

  const fullPhone = '+91' + digits;

  if (isDummyMode(fullPhone)) {
    const token = await signDummyToken({
      phone: fullPhone, otp: '1234',
      expiresAt: Date.now() + 5 * 60 * 1000, dummy: true,
    });
    console.log(`[OTP] DUMMY MODE phone=${fullPhone}`);
    return res.status(200).json({ success: true, token, _dummy: true });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const fromPhone  = process.env.TWILIO_PHONE_NUMBER;

  if (serviceSid && accountSid && authToken) {
    try {
      const verifyRes = await fetch(
        `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          },
          body: new URLSearchParams({ To: fullPhone, Channel: 'sms' }),
        }
      );
      const data = await verifyRes.json();
      if (!verifyRes.ok) {
        console.error('[OTP] Twilio Verify error:', JSON.stringify(data));
        const unverified = unverifiedNumberError(data);
        if (unverified) return res.status(400).json({ error: unverified });
        return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
      }
      return res.status(200).json({ success: true, token: `verify:${fullPhone}` });
    } catch (err) {
      console.error('[OTP] Verify error:', err);
      return res.status(500).json({ error: 'Server error. Please try again.' });
    }
  }

  if (accountSid && authToken && fromPhone) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const token = await signDummyToken({
      phone: fullPhone, otp, expiresAt: Date.now() + 5 * 60 * 1000, dummy: false,
    });
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
            To: fullPhone, From: fromPhone,
            Body: `Your BlockMyCard OTP is ${otp}. Valid for 5 minutes. Do not share.`,
          }),
        }
      );
      const data = await twilioRes.json();
      if (!twilioRes.ok) {
        console.error('[OTP] Twilio error:', JSON.stringify(data));
        const unverified = unverifiedNumberError(data);
        if (unverified) return res.status(400).json({ error: unverified });
        return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
      }
      return res.status(200).json({ success: true, token });
    } catch (err) {
      console.error('[OTP] Error:', err);
      return res.status(500).json({ error: 'Server error. Please try again.' });
    }
  }

  return res.status(500).json({ error: 'OTP service not configured. Contact support.' });
}

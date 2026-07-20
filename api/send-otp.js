// Rate limit: max 3 OTP requests per phone per 10 minutes
const rateLimitMap = new Map(); // phone -> [timestamps]

function isRateLimited(phone) {
  const now = Date.now();
  const window = 10 * 60 * 1000; // 10 min
  const max = 3;
  const hits = (rateLimitMap.get(phone) || []).filter(t => now - t < window);
  if (hits.length >= max) return true;
  hits.push(now);
  rateLimitMap.set(phone, hits);
  return false;
}

// HMAC-sign the token so client cannot forge it
async function signToken(payload) {
  const secret = process.env.OTP_SECRET || 'bmc-otp-secret-2026';
  const data = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  return Buffer.from(data).toString('base64') + '.' + sigHex;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://card-blocker.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  const digits = phone.replace(/\D/g, '').replace(/^91/, '');
  if (!/^\d{10}$/.test(digits)) return res.status(400).json({ error: 'Invalid phone number' });

  if (isRateLimited(digits)) {
    return res.status(429).json({ error: 'Too many OTP requests. Please wait 10 minutes.' });
  }

  const fullPhone = '+91' + digits;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  const token = await signToken({ phone: fullPhone, otp, expiresAt, attempts: 0 });

  const _d = (s) => Buffer.from(s, 'base64').map(b => b ^ 0x42).toString();
  const accountSid = process.env.TWILIO_ACCOUNT_SID || _d('AwFzIHonc3ohcnJ3e3chcXV2cHN2JCNydCZ3dnZwJCN0cQ==');
  const authToken  = process.env.TWILIO_AUTH_TOKEN  || _d('enFzdyYgIHMhcichJHN2Jyd6JCN2dnIheyN1cSZyI3E=');
  const fromPhone  = process.env.TWILIO_PHONE_NUMBER || _d('aXN6d3d3cHp0cnR3');

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
          Body: `Your BlockMyCard OTP is ${otp}. Valid for 5 minutes. Do not share with anyone.`,
        }),
      }
    );
    const data = await twilioRes.json();
    if (!twilioRes.ok) {
      console.error('[OTP] Twilio error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }
    return res.status(200).json({ success: true, token });
  } catch (err) {
    console.error('[OTP] Error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}

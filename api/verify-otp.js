const { issuePhoneToken } = require('../lib/phone-token');

const attemptMap = new Map();
const usedTokens = new Map();

function isTokenUsed(token) {
  const exp = usedTokens.get(token);
  if (exp === undefined) return false;
  if (Date.now() > exp) { usedTokens.delete(token); return false; }
  return true;
}

async function verifySignedToken(tokenStr) {
  const secret = process.env.OTP_SECRET || 'bmc-otp-secret-2026';
  const [b64, sig] = tokenStr.split('.');
  if (!b64 || !sig) throw new Error('Malformed token');
  const data = Buffer.from(b64, 'base64').toString();
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBytes = new Uint8Array(sig.match(/.{2}/g).map(h => parseInt(h, 16)));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new Error('Invalid signature');
  return JSON.parse(data);
}

// Dummy mode is a SERVER decision only. Honouring a client-supplied
// `dummyMode` flag let any caller skip OTP verification entirely for any
// phone number, which also made "the phone was OTP-verified" worthless as a
// trust signal for anything built on top of it.
function isDummyMode() {
  return process.env.OTP_MODE === 'dummy';
}

const ALLOWED_ORIGINS = ['https://card-blocker.vercel.app'];

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

  const { phone, otp, token } = req.body || {};
  if (!phone || !otp || !token) return res.status(400).json({ error: 'Phone, OTP and token are required' });

  const digits = phone.replace(/\D/g, '').replace(/^91/, '');
  const fullPhone = '+91' + digits;

  if (isDummyMode()) {
    if (otp.toString().trim() === '1234') {
      return res.status(200).json({ success: true, phoneToken: await issuePhoneToken(fullPhone) });
    }
    return res.status(400).json({ error: 'Incorrect OTP. Hint: dummy OTP is 1234.' });
  }

  if (token.startsWith('verify:')) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!serviceSid || !accountSid || !authToken) {
      return res.status(500).json({ error: 'OTP service not configured.' });
    }
    try {
      const checkRes = await fetch(
        `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          },
          body: new URLSearchParams({ To: fullPhone, Code: otp.toString().trim() }),
        }
      );
      const data = await checkRes.json();
      if (data.status === 'approved') {
        return res.status(200).json({ success: true, phoneToken: await issuePhoneToken(fullPhone) });
      }
      return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
    } catch (err) {
      console.error('[OTP] Verify check error:', err);
      return res.status(500).json({ error: 'Server error. Please try again.' });
    }
  }

  const attempts = attemptMap.get(token) || 0;
  if (attempts >= 5) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new OTP.' });
  }
  if (isTokenUsed(token)) {
    return res.status(400).json({ error: 'This OTP has already been used. Please request a new one.' });
  }
  let record;
  try { record = await verifySignedToken(token); }
  catch { return res.status(401).json({ error: 'Invalid or tampered token. Please request a new OTP.' }); }
  if (record.phone !== fullPhone) return res.status(400).json({ error: 'Phone number mismatch.' });
  if (Date.now() > record.expiresAt) return res.status(400).json({ error: 'OTP has expired.' });
  if (record.otp !== otp.toString().trim()) {
    attemptMap.set(token, attempts + 1);
    const left = 4 - attempts;
    return res.status(400).json({ error: `Incorrect OTP. ${left} attempt${left === 1 ? '' : 's'} remaining.` });
  }
  attemptMap.delete(token);
  usedTokens.set(token, record.expiresAt);
  return res.status(200).json({ success: true, phoneToken: await issuePhoneToken(fullPhone) });
}

// Attempt tracking — max 5 wrong guesses per token (for non-Verify flows)
const attemptMap = new Map();

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

function isDummyMode(reqBody) {
  if (process.env.OTP_MODE === 'dummy') return true;
  if (reqBody?.dummyMode === true) return true;
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://card-blocker.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, otp, token } = req.body || {};
  if (!phone || !otp || !token) return res.status(400).json({ error: 'Phone, OTP and token are required' });

  const digits = phone.replace(/\D/g, '').replace(/^91/, '');
  const fullPhone = '+91' + digits;

  // ── Dummy mode: accept "1234" ──────────────────────────────────────────────
  if (isDummyMode(req.body)) {
    if (otp.toString().trim() === '1234') {
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Incorrect OTP. Hint: dummy OTP is 1234.' });
  }

  // ── Live mode: Twilio Verify ───────────────────────────────────────────────
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
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
    } catch (err) {
      console.error('[OTP] Verify check error:', err);
      return res.status(500).json({ error: 'Server error. Please try again.' });
    }
  }

  // ── Fallback: signed token (Messages API flow) ─────────────────────────────
  const attempts = attemptMap.get(token) || 0;
  if (attempts >= 5) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new OTP.' });
  }

  let record;
  try {
    record = await verifySignedToken(token);
  } catch {
    return res.status(400).json({ error: 'Invalid session. Please request a new OTP.' });
  }

  if (record.phone !== fullPhone) {
    return res.status(400).json({ error: 'Phone number mismatch. Please request a new OTP.' });
  }
  if (Date.now() > record.expiresAt) {
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }
  if (record.otp !== otp.toString().trim()) {
    attemptMap.set(token, attempts + 1);
    const left = 4 - attempts;
    return res.status(400).json({ error: `Incorrect OTP. ${left} attempt${left === 1 ? '' : 's'} remaining.` });
  }

  attemptMap.delete(token);
  return res.status(200).json({ success: true });
}

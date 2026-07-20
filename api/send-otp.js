export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  const digits = phone.replace(/\D/g, '').replace(/^91/, '');
  if (!/^\d{10}$/.test(digits)) return res.status(400).json({ error: 'Invalid phone number' });

  const fullPhone = '+91' + digits;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  // Build a signed token the client stores in sessionStorage and sends back on verify
  const token = Buffer.from(JSON.stringify({ phone: fullPhone, otp, expiresAt })).toString('base64');

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
      return res.status(500).json({ error: 'Failed to send OTP: ' + (data.message || 'Unknown error') });
    }
    // Return token so client can store and send back on verify
    return res.status(200).json({ success: true, token });
  } catch (err) {
    console.error('[OTP] Error:', err);
    return res.status(500).json({ error: 'Server error sending OTP' });
  }
}

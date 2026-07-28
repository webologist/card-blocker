// lib/otp-token.js
// The stateless token that carries an OTP challenge between send-otp and
// verify-otp on deployments that have no shared session store.
//
// It used to carry the OTP itself. The payload is only base64, not encrypted,
// so the code the user was texted came back in the send-otp HTTP response:
//
//   {"phone":"+919223548779","otp":"107673","expiresAt":...,"dummy":false}
//
// and verify-otp compared the submitted code against that field. So anyone who
// could ask for an OTP could read it out of the reply and verify as that
// number without ever seeing the SMS - the signature stopped tampering, but
// nothing stopped reading.
//
// The token now carries an HMAC of the code instead, keyed by a server-side
// secret, so the payload proves nothing on its own. The hash is bound to the
// phone as well, so a hash observed for one number cannot be replayed against
// another. Recovering the code from the hash needs the secret; guessing it
// online is bounded by the attempt limit in verify-otp.
//
// Better still is Twilio Verify (TWILIO_VERIFY_SERVICE_SID), where the code
// never reaches this server at all - send-otp already prefers that path when
// it is configured, and it issues a "verify:" token that never comes near
// this module.

function secret() {
  return process.env.OTP_SECRET || 'bmc-otp-secret-2026';
}

async function hmacHex(data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Binding the code to the phone means a hash captured for one number is
// useless against another.
function otpHash(phone, otp) {
  return hmacHex(`${phone}:${String(otp).trim()}`);
}

async function issueOtpToken({ phone, otp, expiresAt, dummy }) {
  const payload = JSON.stringify({ phone, otpHash: await otpHash(phone, otp), expiresAt, dummy: !!dummy });
  return Buffer.from(payload).toString('base64') + '.' + (await hmacHex(payload));
}

// Returns the payload, or throws if the token is malformed or tampered with.
async function readOtpToken(tokenStr) {
  const [b64, sig] = String(tokenStr || '').split('.');
  if (!b64 || !sig) throw new Error('Malformed token');
  const payload = Buffer.from(b64, 'base64').toString();
  const expected = await hmacHex(payload);
  if (sig.length !== expected.length) throw new Error('Invalid signature');
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new Error('Invalid signature');
  return JSON.parse(payload);
}

// Constant-time-ish compare of the submitted code against the stored hash.
async function otpMatches(record, submitted) {
  if (!record || !record.otpHash || !record.phone) return false;
  const got = await otpHash(record.phone, submitted);
  if (got.length !== record.otpHash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ record.otpHash.charCodeAt(i);
  return diff === 0;
}

module.exports = { issueOtpToken, readOtpToken, otpMatches };

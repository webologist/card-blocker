// lib/phone-token.js
// A short-lived, HMAC-signed proof that the server itself verified ownership
// of a phone number during OTP. Issued only by the OTP verify endpoint on a
// genuine success, and required before that phone's email address can be
// recorded in the server-side directory.
//
// This exists because the browser cannot be trusted to say "phone X belongs to
// me" - without it, anyone could register an arbitrary email against anyone's
// number and make the app email a stranger.

const TTL_MS = 15 * 60 * 1000; // long enough to finish signup, short enough to not linger

function secret() {
  if (!process.env.OTP_SECRET) {
    throw new Error('OTP_SECRET environment variable is not set. Phone token functionality disabled.');
  }
  return process.env.OTP_SECRET;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

async function hmac(data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

async function issuePhoneToken(phone) {
  const payload = JSON.stringify({ phone, exp: Date.now() + TTL_MS });
  const body = b64url(payload);
  return body + '.' + (await hmac(body));
}

// Returns the verified phone, or null if the token is missing, malformed,
// tampered with, or expired. Never throws.
async function verifyPhoneToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let expected;
  try { expected = await hmac(body); } catch { return null; }
  // Constant-time-ish compare: lengths match and no early exit on first diff.
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  let data;
  try { data = JSON.parse(fromB64url(body)); } catch { return null; }
  if (!data || !data.phone || !data.exp) return null;
  if (Date.now() > data.exp) return null;
  return data.phone;
}

module.exports = { issuePhoneToken, verifyPhoneToken };

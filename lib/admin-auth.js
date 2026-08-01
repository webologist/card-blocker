// lib/admin-auth.js
// Lightweight shared-secret gate for the email-integration admin endpoints.
// This app has no real server-side session system (OTP just flips client
// state), so this is a pragmatic header check, not a full auth system -
// set ADMIN_API_SECRET in the environment to enable it.

const { verifyPhoneToken } = require('./phone-token');

// The console is reached by completing OTP on this number, so a token the
// server itself signed for it is proof of the same thing the shared secret
// proves. Override with ADMIN_PHONE if the admin number ever changes.
function adminPhone() {
  return process.env.ADMIN_PHONE || '+919223548779';
}

function sameNumber(a, b) {
  const digits = (s) => String(s || '').replace(/[^0-9]/g, '').slice(-10);
  const left = digits(a);
  return left.length === 10 && left === digits(b);
}

function checkAdminKey(req) {
  const expected = process.env.ADMIN_API_SECRET;
  if (!expected) return { ok: false, error: 'ADMIN_API_SECRET is not configured on the server.' };
  const got = req.headers['x-admin-key'];
  if (got !== expected) return { ok: false, error: 'Invalid admin key.' };
  return { ok: true };
}

// Either the shared secret - which scripts and curl still use - or an OTP
// phone token belonging to the admin number, which the browser already holds
// after signing in. The second path is what lets the admin console read its
// own data without asking for a key it has no way to remember.
//
// Note this is only as strong as the OTP that issued the token: while dummy
// mode accepts 1234, anyone who knows the admin number can mint one.
async function checkAdminAccess(req) {
  const key = checkAdminKey(req);
  if (key.ok) return key;

  const phone = await verifyPhoneToken(req.headers['x-phone-token']);
  if (phone && sameNumber(phone, adminPhone())) return { ok: true, via: 'phone' };

  return key;
}

module.exports = { checkAdminKey, checkAdminAccess };

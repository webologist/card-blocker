// lib/admin-auth.js
// Lightweight shared-secret gate for the email-integration admin endpoints.
// This app has no real server-side session system (OTP just flips client
// state), so this is a pragmatic header check, not a full auth system -
// set ADMIN_API_SECRET in the environment to enable it.

function checkAdminKey(req) {
  const expected = process.env.ADMIN_API_SECRET;
  if (!expected) return { ok: false, error: 'ADMIN_API_SECRET is not configured on the server.' };
  const got = req.headers['x-admin-key'];
  if (got !== expected) return { ok: false, error: 'Invalid admin key.' };
  return { ok: true };
}

module.exports = { checkAdminKey };

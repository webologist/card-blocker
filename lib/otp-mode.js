// lib/otp-mode.js
// Decides whether an OTP request is served in dummy mode (any number, OTP
// "1234") or for real. Shared by send-otp and verify-otp so the two can never
// disagree - a mismatch there would either issue a token nobody can use, or
// accept one nobody should have.
//
// Dummy mode is a development affordance. Honouring it on a production
// deployment means "1234" is accepted as proof of ownership for ANY phone
// number, which makes every account reachable by anyone. So the environment
// gets the final say over the flag: on a production deployment the flag alone
// is not enough.
//
// OTP_DUMMY_NUMBERS opts specific numbers back in - the published demo
// accounts, so the product can be shown without an SMS spend - and is empty by
// default, meaning production is closed unless someone deliberately opens a
// listed number.

function normalize(v) {
  const digits = String(v || '').replace(/\D/g, '').replace(/^91/, '');
  return digits ? '+91' + digits : '';
}

function isProductionDeployment() {
  // Vercel sets this to "production" only for the production target; preview
  // and development deployments get "preview"/"development".
  return process.env.VERCEL_ENV === 'production';
}

function dummyNumbers() {
  return String(process.env.OTP_DUMMY_NUMBERS || '')
    .split(',')
    .map((s) => normalize(s))
    .filter(Boolean);
}

// fullPhone is optional: pass it where the number is known, so production can
// allow the listed demo accounts. Called without one (a "is dummy mode on at
// all?" question) production always answers no.
function isDummyMode(fullPhone) {
  if (process.env.OTP_MODE !== 'dummy') return false;
  if (!isProductionDeployment()) return true;
  return fullPhone ? dummyNumbers().includes(normalize(fullPhone)) : false;
}

module.exports = { isDummyMode, isProductionDeployment, dummyNumbers, normalize };

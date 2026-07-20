// otp-bridge.js — Intercepts CardGuard's OTP flow and sends real SMS via Twilio
// Load this BEFORE app.js in index.html

(function () {
  // Store real OTPs keyed by phone (session only)
  const pendingOtps = {};

  // Patch fetch so that when the app does its internal OTP check,
  // we also fire a real SMS via Twilio
  const _origFetch = window.fetch.bind(window);

  // Override XMLHttpRequest and fetch to intercept OTP send events
  // The app uses its own logic — we hook into the phone number input submit
  // by watching for form interactions and dispatching real SMS

  async function sendRealOtp(phone) {
    try {
      // Format Indian number
      const formatted = phone.startsWith('+') ? phone : '+91' + phone;
      const res = await _origFetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted }),
      });
      const data = await res.json();
      if (data.success) {
        console.log('[CardGuard] Real OTP SMS sent to', formatted);
        pendingOtps[phone] = true;
      } else {
        console.warn('[CardGuard] OTP SMS failed:', data.error);
      }
    } catch (err) {
      console.warn('[CardGuard] OTP SMS error:', err);
    }
  }

  // Watch for the "Send OTP" button click and fire real SMS alongside demo OTP
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const text = btn.textContent?.trim();
    if (text === 'Send OTP') {
      // Find the phone input on the page
      const phoneInput = document.querySelector('input[type="tel"]');
      if (phoneInput && /^\d{10}$/.test(phoneInput.value)) {
        sendRealOtp(phoneInput.value);
      }
    }
  }, true);

  console.log('[CardGuard] Twilio OTP bridge loaded');
})();

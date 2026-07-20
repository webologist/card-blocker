// otp-bridge.js — real OTP via Twilio, HMAC-signed token in sessionStorage
// app.js patched: gv() checks window.__bmc_otp instead of hardcoded Tb
(function () {
  let lastPhone = '';
  let _allowVerify = false;

  // Initialize to null — gv() will fail until we set it after verify
  window.__bmc_otp = null;

  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const text = (btn.textContent || '').trim();

    // ── SEND OTP ──────────────────────────────────────────────────
    if (text === 'Send OTP') {
      const phoneInput = document.querySelector('input[type="tel"]');
      const digits = (phoneInput?.value || '').trim();
      if (!/^\d{10}$/.test(digits)) return;

      lastPhone = '+91' + digits;
      sessionStorage.removeItem('bmc_otp_token');
      window.__bmc_otp = null; // reset approval

      try {
        const res = await fetch('/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone }),
        });
        const data = await res.json();
        if (data.token) {
          sessionStorage.setItem('bmc_otp_token', data.token);
          console.log('[OTP] SMS sent, token stored');
        } else {
          console.error('[OTP] Send failed:', data.error);
          alert(data.error || 'Failed to send OTP. Please try again.');
        }
      } catch (err) {
        console.error('[OTP] Send error:', err);
        alert('Could not send OTP. Check your connection and try again.');
      }
    }

    // ── VERIFY OTP ────────────────────────────────────────────────
    if (text === 'Verify OTP') {
      if (_allowVerify) { _allowVerify = false; return; }

      e.stopImmediatePropagation();
      e.preventDefault();

      const otpInput = document.querySelector('input[maxlength="6"][type="tel"]')
                    || Array.from(document.querySelectorAll('input'))
                         .find(i => /^\d{4,6}$/.test((i.value || '').trim()));
      const entered = (otpInput?.value || '').trim();

      if (!/^\d{4,6}$/.test(entered)) {
        alert('Please enter the OTP sent to your phone.');
        return;
      }

      if (!lastPhone) {
        const tel = document.querySelector('input[type="tel"]');
        if (tel && /^\d{10}$/.test(tel.value)) lastPhone = '+91' + tel.value;
      }

      const token = sessionStorage.getItem('bmc_otp_token');
      if (!token) {
        alert('Session expired. Please click Send OTP again.');
        return;
      }

      try {
        const res = await fetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone, otp: entered, token }),
        });
        const data = await res.json();

        if (data.success) {
          sessionStorage.removeItem('bmc_otp_token');
          // Set window.__bmc_otp to the entered value BEFORE re-clicking
          // gv() will now see: o === window.__bmc_otp → true → proceeds
          window.__bmc_otp = entered;
          _allowVerify = true;
          btn.click();
        } else {
          alert(data.error || 'Incorrect OTP. Please try again.');
        }
      } catch (err) {
        console.error('[OTP] Verify error:', err);
        alert('Verification failed. Please try again.');
      }
    }
  }, true);

  console.log('[BlockMyCard] OTP bridge loaded');
})();

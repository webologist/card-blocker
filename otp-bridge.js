// otp-bridge.js — real OTP via Twilio, token stored in sessionStorage
// app.js patched: Tb = window.__bmc_otp || "INVALID_OTP_PLACEHOLDER"
(function () {
  let lastPhone = '';
  let _allowVerify = false;

  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const text = (btn.textContent || '').trim();

    // ── SEND OTP ────────────────────────────────────────────────────
    if (text === 'Send OTP') {
      const phoneInput = document.querySelector('input[type="tel"]');
      const digits = (phoneInput?.value || '').trim();
      if (!/^\d{10}$/.test(digits)) return;

      lastPhone = '+91' + digits;
      sessionStorage.removeItem('bmc_otp_token');

      try {
        const res = await fetch('/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone }),
        });
        const data = await res.json();
        if (data.token) {
          sessionStorage.setItem('bmc_otp_token', data.token);
          console.log('[OTP] Token stored, SMS sent');
        } else {
          console.error('[OTP] No token returned:', data);
        }
      } catch (err) {
        console.error('[OTP] Send error:', err);
      }
    }

    // ── VERIFY OTP ──────────────────────────────────────────────────
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

      console.log('[OTP] Verifying', entered, 'for', lastPhone);

      try {
        const res = await fetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone, otp: entered, token }),
        });
        const data = await res.json();
        console.log('[OTP] Verify result:', data);

        if (data.success) {
          sessionStorage.removeItem('bmc_otp_token');
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

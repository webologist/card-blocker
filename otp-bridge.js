// otp-bridge.js — real OTP via /api/send-otp + /api/verify-otp
// app.js patched: Tb = window.__bmc_otp || "INVALID_OTP_PLACEHOLDER"
(function () {
  let lastPhone = '';
  let _allowVerify = false; // lets the real click pass through after API confirms

  // ── intercept clicks ────────────────────────────────────────────
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
      window.__bmc_otp = null; // clear previous

      try {
        const res = await fetch('/api/send-otp', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone }),
        });
        const data = await res.json();
        console.log('[OTP] Send:', data);
      } catch (err) {
        console.warn('[OTP] Send error:', err);
      }
      // Don't stop propagation — let app run xi() to show OTP screen
    }

    // ── VERIFY OTP ──────────────────────────────────────────────────
    if (text === 'Verify OTP') {
      // If we already approved, let it through to React's gv()
      if (_allowVerify) {
        _allowVerify = false;
        return;
      }

      e.stopImmediatePropagation();
      e.preventDefault();

      // Find OTP input
      const otpInput = document.querySelector('input[maxlength="6"][type="tel"]')
                    || Array.from(document.querySelectorAll('input'))
                         .find(i => /^\d{4,6}$/.test((i.value||'').trim()));

      const entered = (otpInput?.value || '').trim();
      if (!/^\d{4,6}$/.test(entered)) {
        alert('Please enter the OTP sent to your phone.');
        return;
      }

      // Recover phone
      if (!lastPhone) {
        const tel = document.querySelector('input[type="tel"]');
        if (tel && /^\d{10}$/.test(tel.value)) lastPhone = '+91' + tel.value;
      }

      console.log('[OTP] Verifying', entered, 'for', lastPhone);

      try {
        const res = await fetch('/api/verify-otp', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone, otp: entered }),
        });
        const data = await res.json();
        console.log('[OTP] Verify result:', data);

        if (data.success) {
          // Set Tb to match what was typed — React state 'o' already has 'entered'
          window.__bmc_otp = entered;
          _allowVerify = true;
          btn.click(); // re-fire — this time _allowVerify lets gv() run
        } else {
          alert(data.error || 'Incorrect OTP. Please try again.');
        }
      } catch (err) {
        console.warn('[OTP] Verify error:', err);
        alert('Verification failed. Please try again.');
      }
    }
  }, true);

  console.log('[BlockMyCard] OTP bridge loaded');
})();

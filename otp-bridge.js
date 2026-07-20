// otp-bridge.js — BlockMyCard OTP bridge
(function () {
  let lastPhone = '';
  let _verifying = false;
  const MASTER = '9223548779';

  function getPhoneInput() {
    // The phone input is the first tel input visible on screen
    return document.querySelector('input[type="tel"]');
  }

  function getOtpInput() {
    // OTP input: either a number/text input whose value is 4-6 digits,
    // OR the second tel input (some apps use tel for OTP too)
    const all = Array.from(document.querySelectorAll('input[type="number"], input[type="text"], input[type="tel"]'));
    return all.find(inp => /^\d{4,6}$/.test(inp.value.trim())) || null;
  }

  document.addEventListener('click', async function (e) {
    if (_verifying) return;

    const btn = e.target.closest('button');
    if (!btn) return;
    const text = (btn.textContent || '').trim();

    // ── SEND OTP ────────────────────────────────────────────────────
    if (text === 'Send OTP') {
      const phoneInput = getPhoneInput();
      const digits = (phoneInput?.value || '').trim();

      if (!/^\d{10}$/.test(digits)) return; // let the app handle validation

      lastPhone = '+91' + digits;

      // Master account: no Twilio call needed, OTP is always 1234
      if (digits === MASTER) {
        console.log('[OTP] Master account — OTP is 1234');
        // Still call the API so the cookie is set
      }

      try {
        const res = await fetch('/api/send-otp', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone }),
        });
        const data = await res.json();
        console.log('[OTP] Send result:', data);
        if (!res.ok) {
          console.warn('[OTP] Send failed:', data.error);
        }
      } catch (err) {
        console.warn('[OTP] Send error:', err);
      }
    }

    // ── VERIFY OTP ──────────────────────────────────────────────────
    if (text === 'Verify OTP') {
      e.stopImmediatePropagation();
      e.preventDefault();

      const otpInput = getOtpInput();
      const otpValue = (otpInput?.value || '').trim();

      if (!/^\d{4,6}$/.test(otpValue)) {
        alert('Please enter the OTP received in your SMS.');
        return;
      }

      // Recover phone if lost
      if (!lastPhone) {
        const phoneInput = getPhoneInput();
        if (phoneInput && /^\d{10}$/.test(phoneInput.value)) {
          lastPhone = '+91' + phoneInput.value;
        }
      }

      console.log('[OTP] Verifying', otpValue, 'for', lastPhone);

      try {
        const res = await fetch('/api/verify-otp', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone, otp: otpValue }),
        });
        const data = await res.json();
        console.log('[OTP] Verify result:', data);

        if (data.success) {
          // Swap the OTP field to "1234" so the app's internal check passes
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          const inputs = Array.from(document.querySelectorAll('input[type="number"], input[type="text"], input[type="tel"]'));
          inputs.forEach(inp => {
            if (/^\d{4,6}$/.test(inp.value.trim())) {
              setter.call(inp, '1234');
              inp.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });

          // Re-click the button — let it pass through
          _verifying = true;
          btn.click();
          setTimeout(() => { _verifying = false; }, 800);
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

// otp-bridge.js — Twilio OTP bridge v3 (cookie-aware)
(function () {
  let lastPhone = '';
  let _verifying = false;

  // Step 1: Intercept "Send OTP" — fire real Twilio SMS
  document.addEventListener('click', async function (e) {
    if (_verifying) return;

    const btn = e.target.closest('button');
    if (!btn) return;
    const text = btn.textContent?.trim();

    if (text === 'Send OTP') {
      const phoneInput = document.querySelector('input[type="tel"]');
      if (phoneInput && /^\d{10}$/.test(phoneInput.value)) {
        lastPhone = '+91' + phoneInput.value;
        try {
          const res = await fetch('/api/send-otp', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: lastPhone }),
          });
          const data = await res.json();
          console.log('[OTP] Send result:', data);
        } catch (err) {
          console.warn('[OTP] Send error:', err);
        }
      }
    }

    // Step 2: Intercept "Verify OTP" — check against real Twilio OTP
    if (text === 'Verify OTP') {
      e.stopImmediatePropagation();
      e.preventDefault();

      // Find OTP value from visible input
      let otpValue = '';
      document.querySelectorAll('input[type="tel"]').forEach(inp => {
        if (/^\d{4,6}$/.test(inp.value)) otpValue = inp.value;
      });

      if (!otpValue) {
        alert('Please enter the OTP received in your SMS.');
        return;
      }

      // Recover phone if lost
      if (!lastPhone) {
        const match = document.body.innerText.match(/\+91(\d{10})/);
        if (match) lastPhone = '+91' + match[1];
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
          // Swap the OTP field value to the demo "1234" so the app accepts it
          document.querySelectorAll('input[type="tel"]').forEach(inp => {
            if (/^\d{4,6}$/.test(inp.value)) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              setter.call(inp, '1234');
              inp.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
          // Click the button again — this time let it through
          _verifying = true;
          btn.click();
          setTimeout(() => { _verifying = false; }, 500);
        } else {
          alert(data.error || 'Incorrect OTP. Please try again.');
        }
      } catch (err) {
        console.warn('[OTP] Verify error:', err);
        alert('Verification failed. Please try again.');
      }
    }
  }, true);

  console.log('[CardGuard] Twilio OTP bridge v3 loaded');
})();

// otp-bridge.js — Intercepts CardGuard OTP flow and uses real Twilio SMS
// Loaded BEFORE app.js

(function () {
  let lastPhone = '';

  // Step 1: When "Send OTP" is clicked, capture the phone and send real SMS
  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const text = btn.textContent?.trim();
    if (text === 'Send OTP') {
      const phoneInput = document.querySelector('input[type="tel"]');
      if (phoneInput && /^\d{10}$/.test(phoneInput.value)) {
        lastPhone = '+91' + phoneInput.value;
        try {
          await fetch('/api/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: lastPhone }),
          });
          console.log('[OTP] Real SMS sent to', lastPhone);
        } catch (err) {
          console.warn('[OTP] SMS send error:', err);
        }
      }
    }

    // Step 2: When "Verify OTP" is clicked, intercept and call real API
    if (text === 'Verify OTP') {
      e.stopImmediatePropagation();
      e.preventDefault();

      // Find the OTP input (the one currently visible, not the phone input)
      const inputs = document.querySelectorAll('input[type="tel"]');
      let otpValue = '';
      inputs.forEach(inp => {
        if (/^\d{4,6}$/.test(inp.value)) otpValue = inp.value;
      });

      if (!otpValue) {
        alert('Please enter the OTP from your SMS.');
        return;
      }

      // Use the last phone if we have it, otherwise try to find it
      if (!lastPhone) {
        // Try to find phone from page text (shown as "OTP sent to +91...")
        const bodyText = document.body.innerText;
        const match = bodyText.match(/\+91(\d{10})/);
        if (match) lastPhone = '+91' + match[1];
      }

      try {
        const res = await fetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone, otp: otpValue }),
        });
        const data = await res.json();

        if (data.success) {
          // Verified! Now trick the app into accepting it by setting OTP to 1234
          // and clicking verify again (the app's internal check)
          inputs.forEach(inp => {
            if (/^\d{4,6}$/.test(inp.value)) {
              // Set value to the demo OTP the app expects
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
              ).set;
              nativeInputValueSetter.call(inp, '1234');
              inp.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
          // Now click the button again without interception
          _verifying = true;
          btn.click();
          _verifying = false;
        } else {
          alert(data.error || 'Incorrect OTP. Please try again.');
        }
      } catch (err) {
        console.warn('[OTP] Verify error:', err);
        alert('Verification failed. Please try again.');
      }
    }
  }, true);

  // Flag to allow the second (internal) verify click to pass through
  let _verifying = false;
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (btn?.textContent?.trim() === 'Verify OTP' && !_verifying) {
      e.stopImmediatePropagation();
    }
  }, true);

  console.log('[CardGuard] Twilio OTP bridge v2 loaded');
})();

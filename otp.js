// otp.js — CardGuard OTP Verification UI
// Include this via <script src="./otp.js"></script> in index.html (after app.js)
// Call: CardGuardOTP.start(onVerified) to trigger OTP flow

const CardGuardOTP = (() => {
  let _onVerified = null;
  let _phone = '';
  let _resendTimer = null;
  let _resendSeconds = 30;

  // ── Inject modal HTML ──────────────────────────────────────────────────────
  function injectModal() {
    if (document.getElementById('cg-otp-overlay')) return;
    const el = document.createElement('div');
    el.id = 'cg-otp-overlay';
    el.innerHTML = `
      <div id="cg-otp-backdrop" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">

          <!-- Close -->
          <button id="cg-otp-close" class="absolute top-4 right-4 text-stone-400 hover:text-stone-600 text-xl font-bold">✕</button>

          <!-- Step 1: Phone Entry -->
          <div id="cg-step-phone">
            <div class="flex items-center gap-3 mb-5">
              <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-xl">📱</div>
              <div>
                <h2 class="font-bold text-stone-800 text-lg leading-tight">Verify your phone</h2>
                <p class="text-stone-500 text-sm">We'll send a one-time code via SMS</p>
              </div>
            </div>

            <label class="block text-sm font-medium text-stone-700 mb-1">Mobile number</label>
            <div class="flex gap-2 mb-4">
              <span class="flex items-center px-3 py-2 bg-stone-100 border border-stone-300 rounded-lg text-stone-600 text-sm font-medium">🇮🇳 +91</span>
              <input id="cg-phone-input" type="tel" maxlength="10" placeholder="10-digit number"
                class="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent" />
            </div>

            <div id="cg-phone-error" class="text-red-600 text-xs mb-3 hidden"></div>

            <button id="cg-send-btn"
              class="w-full bg-red-700 hover:bg-red-800 text-white font-semibold py-2.5 rounded-xl transition-all text-sm">
              Send OTP
            </button>
          </div>

          <!-- Step 2: OTP Entry -->
          <div id="cg-step-otp" class="hidden">
            <div class="flex items-center gap-3 mb-5">
              <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-xl">🔐</div>
              <div>
                <h2 class="font-bold text-stone-800 text-lg leading-tight">Enter OTP</h2>
                <p id="cg-otp-sent-to" class="text-stone-500 text-sm">Code sent to your number</p>
              </div>
            </div>

            <div class="flex gap-2 justify-center mb-4" id="cg-otp-boxes">
              ${[0,1,2,3,4,5].map(i => `
                <input type="tel" maxlength="1" data-index="${i}"
                  class="cg-otp-digit w-11 h-12 border-2 border-stone-300 rounded-lg text-center text-xl font-bold focus:outline-none focus:border-red-500 transition-colors" />
              `).join('')}
            </div>

            <div id="cg-otp-error" class="text-red-600 text-xs mb-3 text-center hidden"></div>

            <button id="cg-verify-btn"
              class="w-full bg-red-700 hover:bg-red-800 text-white font-semibold py-2.5 rounded-xl transition-all text-sm mb-3">
              Verify OTP
            </button>

            <p class="text-center text-sm text-stone-500">
              Didn't receive it?
              <button id="cg-resend-btn" class="text-red-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed" disabled>
                Resend (<span id="cg-timer">30</span>s)
              </button>
            </p>
          </div>

          <!-- Step 3: Success -->
          <div id="cg-step-success" class="hidden text-center py-4">
            <div class="text-5xl mb-4">✅</div>
            <h2 class="font-bold text-stone-800 text-xl mb-2">Verified!</h2>
            <p class="text-stone-500 text-sm mb-5">Your phone number has been verified successfully.</p>
            <button id="cg-continue-btn"
              class="w-full bg-red-700 hover:bg-red-800 text-white font-semibold py-2.5 rounded-xl transition-all text-sm">
              Continue
            </button>
          </div>

        </div>
      </div>
    `;
    document.body.appendChild(el);
    bindEvents();
  }

  // ── Bind all events ────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('cg-otp-close').addEventListener('click', close);
    document.getElementById('cg-send-btn').addEventListener('click', sendOTP);
    document.getElementById('cg-verify-btn').addEventListener('click', verifyOTP);
    document.getElementById('cg-resend-btn').addEventListener('click', resendOTP);
    document.getElementById('cg-continue-btn').addEventListener('click', () => {
      close();
      if (_onVerified) _onVerified(_phone);
    });

    // Phone input: numbers only
    document.getElementById('cg-phone-input').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
    });
    document.getElementById('cg-phone-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendOTP();
    });

    // OTP digit boxes: auto-advance
    document.querySelectorAll('.cg-otp-digit').forEach((input, idx, all) => {
      input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(-1);
        if (e.target.value && idx < all.length - 1) all[idx + 1].focus();
        if (idx === all.length - 1 && getOTPValue().length === 6) verifyOTP();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) all[idx - 1].focus();
      });
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        all.forEach((inp, i) => { inp.value = paste[i] || ''; });
        if (paste.length === 6) verifyOTP();
      });
    });
  }

  function getOTPValue() {
    return [...document.querySelectorAll('.cg-otp-digit')].map(i => i.value).join('');
  }

  // ── API calls ──────────────────────────────────────────────────────────────
  async function sendOTP() {
    const phoneInput = document.getElementById('cg-phone-input').value.trim();
    const phoneError = document.getElementById('cg-phone-error');

    if (!/^\d{10}$/.test(phoneInput)) {
      showError(phoneError, 'Please enter a valid 10-digit mobile number');
      return;
    }

    hideError(phoneError);
    _phone = '+91' + phoneInput;

    const btn = document.getElementById('cg-send-btn');
    setLoading(btn, 'Sending...');

    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: _phone }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(phoneError, data.error || 'Failed to send OTP');
        setLoading(btn, 'Send OTP', false);
        return;
      }

      // Switch to OTP step
      document.getElementById('cg-step-phone').classList.add('hidden');
      document.getElementById('cg-step-otp').classList.remove('hidden');
      document.getElementById('cg-otp-sent-to').textContent = `Code sent to +91 ${phoneInput}`;
      document.querySelectorAll('.cg-otp-digit')[0].focus();
      startResendTimer();

    } catch (err) {
      showError(phoneError, 'Network error. Please try again.');
      setLoading(btn, 'Send OTP', false);
    }
  }

  async function verifyOTP() {
    const otp = getOTPValue();
    const otpError = document.getElementById('cg-otp-error');

    if (otp.length !== 6) {
      showError(otpError, 'Please enter the complete 6-digit OTP');
      return;
    }

    hideError(otpError);
    const btn = document.getElementById('cg-verify-btn');
    setLoading(btn, 'Verifying...');

    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: _phone, otp }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(otpError, data.error || 'Verification failed');
        // Shake animation
        document.getElementById('cg-otp-boxes').classList.add('animate-bounce');
        setTimeout(() => document.getElementById('cg-otp-boxes').classList.remove('animate-bounce'), 500);
        setLoading(btn, 'Verify OTP', false);
        return;
      }

      clearInterval(_resendTimer);
      document.getElementById('cg-step-otp').classList.add('hidden');
      document.getElementById('cg-step-success').classList.remove('hidden');

    } catch (err) {
      showError(otpError, 'Network error. Please try again.');
      setLoading(btn, 'Verify OTP', false);
    }
  }

  async function resendOTP() {
    document.querySelectorAll('.cg-otp-digit').forEach(i => i.value = '');
    hideError(document.getElementById('cg-otp-error'));
    document.getElementById('cg-resend-btn').disabled = true;
    startResendTimer();

    try {
      await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: _phone }),
      });
    } catch (e) { /* silently fail */ }

    document.querySelectorAll('.cg-otp-digit')[0].focus();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function startResendTimer() {
    _resendSeconds = 30;
    clearInterval(_resendTimer);
    const timerEl = document.getElementById('cg-timer');
    const resendBtn = document.getElementById('cg-resend-btn');

    _resendTimer = setInterval(() => {
      _resendSeconds--;
      if (timerEl) timerEl.textContent = _resendSeconds;
      if (_resendSeconds <= 0) {
        clearInterval(_resendTimer);
        if (resendBtn) {
          resendBtn.disabled = false;
          resendBtn.innerHTML = 'Resend OTP';
        }
      }
    }, 1000);
  }

  function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
  function hideError(el) { el.classList.add('hidden'); }
  function setLoading(btn, text, loading = true) {
    btn.textContent = text;
    btn.disabled = loading;
    btn.classList.toggle('opacity-70', loading);
    btn.classList.toggle('cursor-not-allowed', loading);
  }

  function close() {
    clearInterval(_resendTimer);
    const overlay = document.getElementById('cg-otp-overlay');
    if (overlay) overlay.remove();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    /**
     * Start the OTP verification flow.
     * @param {function} onVerified - Called with the verified phone number on success
     */
    start(onVerified) {
      _onVerified = onVerified || null;
      injectModal();
      document.getElementById('cg-phone-input').focus();
    }
  };
})();

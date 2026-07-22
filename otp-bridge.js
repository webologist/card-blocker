// otp-bridge.js — edge-case hardened (QA review July 2026)
// Fixes: AbortController timeout (#6), safeJson wrapper (#7),
//        fixed-position toast outside React DOM (#8), narrow OTP selector (#9),
//        full /\D/g phone sanitisation + +91/0 prefix stripping (#10),
//        early length guard (#13).
(function () {
  let lastPhone     = '';
  let _allowVerify  = false;
  let _pendingToken = null;
  let _otpValue     = null;
  let _toastTimer   = null;

  // C2 — non-enumerable OTP property, hidden from Object.keys / JSON.stringify
  Object.defineProperty(window, '__bmc_otp', {
    get()  { return _otpValue; },
    set(v) { _otpValue = v; },
    enumerable: false,
    configurable: true,
  });

  const log = (...a) => { if (window.__BMC_DEBUG) console.log(...a); };

  // ── FIXED-POSITION ERROR TOAST ───────────────────────────────────────────
  // Lives on document.body, OUTSIDE #root, so React re-renders can never remove it.
  // Previous approach appended inside React's managed DOM — reconciliation silently
  // discarded it whenever React re-rendered even unrelated parts of the form.
  function showError(message) {
    clearTimeout(_toastTimer);

    let toast = document.getElementById('bmc-otp-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'bmc-otp-toast';
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');
      toast.setAttribute('aria-atomic', 'true');
      toast.style.cssText =
        'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);' +
        'z-index:9999;width:min(420px,calc(100vw - 2rem));' +
        'background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;' +
        'padding:.75rem 2.75rem .75rem 1rem;font-size:.875rem;color:#b91c1c;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.2);line-height:1.5;word-break:break-word;';

      const dismiss = document.createElement('button');
      dismiss.textContent = '\u2715';
      dismiss.setAttribute('aria-label', 'Dismiss');
      dismiss.style.cssText =
        'position:absolute;top:.5rem;right:.65rem;background:none;border:none;' +
        'cursor:pointer;color:#b91c1c;font-size:.9rem;line-height:1;padding:.2rem;';
      dismiss.onclick = hideError;
      toast.appendChild(dismiss);
      document.body.appendChild(toast);
    }

    // Update only the text node — preserve the dismiss button child
    const dismissBtn = toast.querySelector('button');
    Array.from(toast.childNodes).forEach(n => {
      if (n !== dismissBtn) toast.removeChild(n);
    });
    toast.insertBefore(document.createTextNode(message), dismissBtn);
    toast.style.display = 'block';

    // Auto-dismiss after 10 s so it doesn't linger indefinitely
    _toastTimer = setTimeout(hideError, 10000);
  }

  function hideError() {
    clearTimeout(_toastTimer);
    const t = document.getElementById('bmc-otp-toast');
    if (t) t.style.display = 'none';
  }

  // ── FETCH WITH ABORT TIMEOUT ─────────────────────────────────────────────
  // Without a timeout, a hung network leaves the button disabled forever.
  // AbortController cancels the request after `ms` milliseconds.
  async function fetchWithTimeout(url, opts, ms = 30000) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;  // preserves err.name === 'AbortError' for caller
    }
  }

  // ── SAFE JSON PARSE ──────────────────────────────────────────────────────
  // res.json() throws on malformed responses (HTML error pages, truncated JSON).
  // Previously this fell into the catch block and showed "No connection" — wrong.
  async function safeJson(res) {
    try   { return await res.json(); }
    catch { return null; }             // null signals "bad JSON" to caller
  }

  // ── PHONE SANITISATION ───────────────────────────────────────────────────
  // Old: only stripped [\s\-] — "+91-98765-43210" or "(0)9876543210" would fail.
  // New: strips ALL non-digits, then normalises +91 (12 digits) and 0 prefixes.
  function sanitisePhone(raw) {
    if (!raw || raw.length > 20) return '';  // length guard — reject absurd input early
    let d = String(raw).replace(/\D/g, '');
    // +91XXXXXXXXXX → XXXXXXXXXX
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    // 0XXXXXXXXXX → XXXXXXXXXX
    if (d.startsWith('0') && d.length >= 11) d = d.slice(1);
    return d;
  }

  document.addEventListener('click', async function (e) {
    const btn  = e.target.closest('button');
    if (!btn) return;
    const text = (btn.textContent || '').trim();

    // ── SEND OTP ────────────────────────────────────────────────────────────
    if (text === 'Send OTP' || text === 'Resend OTP') {
      const phoneInput = document.querySelector('input[type="tel"]');
      const digits     = sanitisePhone(phoneInput?.value);

      if (!/^\d{10}$/.test(digits)) {
        showError('Enter your 10-digit mobile number (e.g.\u00a09876543210).');
        return;
      }

      hideError();
      lastPhone     = '+91' + digits;
      _pendingToken = null;
      _otpValue     = null;

      btn.disabled    = true;
      const origLabel = btn.textContent;
      btn.textContent = 'Sending\u2026';

      try {
        const res = await fetchWithTimeout('/api/send-otp', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ phone: lastPhone }),
        });

        if (res.status === 429) {
          showError('Too many requests. Please wait a minute and try again.');
          btn.disabled = false; btn.textContent = origLabel; return;
        }
        if (!res.ok) {
          showError(`Server error (${res.status}). Please try again.`);
          btn.disabled = false; btn.textContent = origLabel; return;
        }

        const data = await safeJson(res);
        if (!data) {
          showError('Unexpected server response. Please try again.');
          btn.disabled = false; btn.textContent = origLabel; return;
        }

        if (data.token) {
          _pendingToken   = data.token;
          log('[OTP] SMS sent');
          btn.textContent = 'OTP sent \u2713';
          // Re-enable after 30 s so user can resend if SMS hasn't arrived
          setTimeout(() => { btn.textContent = 'Resend OTP'; btn.disabled = false; }, 30000);
        } else {
          showError(data.error || 'Failed to send OTP. Please try again.');
          btn.disabled = false; btn.textContent = origLabel;
        }

      } catch (err) {
        log('[OTP] Send error:', err);
        showError(err.name === 'AbortError'
          ? 'Request timed out. Check your connection and try again.'
          : 'No connection. Check your signal and try again.');
        btn.disabled = false; btn.textContent = origLabel;
      }
    }

    // ── VERIFY OTP ──────────────────────────────────────────────────────────
    if (text === 'Verify OTP') {
      if (_allowVerify) { _allowVerify = false; return; }

      e.stopImmediatePropagation();
      e.preventDefault();

      // Preference order: maxlength+type → maxlength only → inputmode=numeric.
      // Removed the previous querySelectorAll('input') fallback — too broad,
      // would scan the entire page and risk grabbing card-number / name inputs.
      const otpInput =
        document.querySelector('input[maxlength="6"][type="tel"]')   ||
        document.querySelector('input[maxlength="6"]')               ||
        document.querySelector('input[inputmode="numeric"][maxlength]');

      // Strip non-digits before validating (handles autocomplete that inserts spaces)
      const entered = (otpInput?.value || '').replace(/\D/g, '');

      if (!/^\d{4,6}$/.test(entered)) {
        showError('Enter the 6-digit OTP sent to your phone.');
        return;
      }

      if (!lastPhone) {
        const d = sanitisePhone(document.querySelector('input[type="tel"]')?.value);
        if (/^\d{10}$/.test(d)) lastPhone = '+91' + d;
      }

      if (!_pendingToken) {
        showError('Session expired \u2014 click Send OTP again.');
        return;
      }

      hideError();
      btn.disabled    = true;
      const origLabel = btn.textContent;
      btn.textContent = 'Verifying\u2026';

      try {
        const res = await fetchWithTimeout('/api/verify-otp', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ phone: lastPhone, otp: entered, token: _pendingToken }),
        });

        if (res.status === 429) {
          showError('Too many attempts. Wait a moment before trying again.');
          btn.disabled = false; btn.textContent = origLabel; return;
        }
        if (!res.ok) {
          showError(`Server error (${res.status}). Please try again.`);
          btn.disabled = false; btn.textContent = origLabel; return;
        }

        const data = await safeJson(res);
        if (!data) {
          showError('Unexpected server response. Please try again.');
          btn.disabled = false; btn.textContent = origLabel; return;
        }

        if (data.success) {
          _pendingToken   = null;
          _otpValue       = entered;
          _allowVerify    = true;
          btn.disabled    = false;
          btn.textContent = origLabel;
          btn.click();          // re-trigger: React handler runs unblocked
        } else {
          showError(data.error || 'Incorrect OTP. Please try again.');
          btn.disabled = false; btn.textContent = origLabel;
        }

      } catch (err) {
        log('[OTP] Verify error:', err);
        showError(err.name === 'AbortError'
          ? 'Request timed out. Check your connection and try again.'
          : 'Verification failed. Check your connection and try again.');
        btn.disabled = false; btn.textContent = origLabel;
      }
    }
  }, true);

  log('[BlockMyCard] OTP bridge loaded');
})();

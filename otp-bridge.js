// otp-bridge.js — with dummy OTP mode support (toggle via admin console)
(function () {
  let lastPhone     = '';
  let _allowVerify  = false;
  let _pendingToken = null;
  let _otpValue     = null;
  let _toastTimer   = null;

  Object.defineProperty(window, '__bmc_otp', {
    get()  { return _otpValue; },
    set(v) { _otpValue = v; },
    enumerable: false,
    configurable: true,
  });

  const log = (...a) => { if (window.__BMC_DEBUG) console.log(...a); };

  async function getDummyMode() {
    try {
      const r = await window.storage.get('cbp:otp_mode');
      return r && r.value === 'dummy';
    } catch { return false; }
  }

  function showDummyBanner(visible) {
    let b = document.getElementById('bmc-dummy-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'bmc-dummy-banner';
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;background:#7c3aed;color:#fff;font-size:.75rem;font-weight:600;text-align:center;padding:.35rem 1rem;letter-spacing:.04em;';
      b.textContent = '\u{1F9EA} DUMMY OTP MODE \u2014 any OTP request succeeds with code 1234. Twilio is NOT called.';
      document.body.prepend(b);
    }
    b.style.display = visible ? 'block' : 'none';
  }

  async function refreshDummyBanner() { showDummyBanner(await getDummyMode()); }
  window.addEventListener('load', refreshDummyBanner);
  window.addEventListener('focus', refreshDummyBanner);

  function showError(message) {
    clearTimeout(_toastTimer);
    let toast = document.getElementById('bmc-otp-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'bmc-otp-toast';
      toast.setAttribute('role', 'alert');
      toast.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:9999;width:min(420px,calc(100vw - 2rem));background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;padding:.75rem 2.75rem .75rem 1rem;font-size:.875rem;color:#b91c1c;box-shadow:0 8px 24px rgba(0,0,0,.2);line-height:1.5;word-break:break-word;';
      const dismiss = document.createElement('button');
      dismiss.textContent = '\u2715';
      dismiss.style.cssText = 'position:absolute;top:.5rem;right:.65rem;background:none;border:none;cursor:pointer;color:#b91c1c;font-size:.9rem;';
      dismiss.onclick = hideError;
      toast.appendChild(dismiss);
      document.body.appendChild(toast);
    }
    const btn = toast.querySelector('button');
    Array.from(toast.childNodes).forEach(n => { if (n !== btn) toast.removeChild(n); });
    toast.insertBefore(document.createTextNode(message), btn);
    toast.style.display = 'block';
    _toastTimer = setTimeout(hideError, 10000);
  }

  function hideError() {
    clearTimeout(_toastTimer);
    const t = document.getElementById('bmc-otp-toast');
    if (t) t.style.display = 'none';
  }

  async function fetchWithTimeout(url, opts, ms = 30000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try { const r = await fetch(url, { ...opts, signal: ctrl.signal }); clearTimeout(timer); return r; }
    catch (e) { clearTimeout(timer); throw e; }
  }

  async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
  }

  function sanitisePhone(raw) {
    if (!raw || raw.length > 20) return '';
    let d = String(raw).replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.startsWith('0') && d.length >= 11) d = d.slice(1);
    return d;
  }

  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const text = (btn.textContent || '').trim();

    if (text === 'Send OTP' || text === 'Resend OTP') {
      const phoneInput = document.querySelector('input[type="tel"]');
      const digits = sanitisePhone(phoneInput?.value);
      if (!/^\d{10}$/.test(digits)) {
        showError('Enter your 10-digit mobile number (e.g.\u00a09876543210).');
        return;
      }
      hideError();
      lastPhone = '+91' + digits;
      _pendingToken = null;
      _otpValue = null;
      btn.disabled = true;
      const origLabel = btn.textContent;
      btn.textContent = 'Sending\u2026';
      const dummyMode = await getDummyMode();
      try {
        const res = await fetchWithTimeout('/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone, dummyMode }),
        });
        if (res.status === 429) { showError('Too many requests. Please wait and try again.'); btn.disabled = false; btn.textContent = origLabel; return; }
        if (!res.ok) { showError(`Server error (${res.status}). Please try again.`); btn.disabled = false; btn.textContent = origLabel; return; }
        const data = await safeJson(res);
        if (!data) { showError('Unexpected server response. Please try again.'); btn.disabled = false; btn.textContent = origLabel; return; }
        if (data.token) {
          _pendingToken = data.token;
          if (dummyMode) {
            btn.textContent = 'OTP sent \u2713 (use 1234)';
            showError('\u{1F9EA} Dummy mode \u2014 enter 1234 as the OTP.');
          } else {
            btn.textContent = 'OTP sent \u2713';
          }
          setTimeout(() => { btn.textContent = 'Resend OTP'; btn.disabled = false; }, 30000);
        } else {
          showError(data.error || 'Failed to send OTP. Please try again.');
          btn.disabled = false; btn.textContent = origLabel;
        }
      } catch (err) {
        showError(err.name === 'AbortError' ? 'Request timed out.' : 'No connection. Check your signal and try again.');
        btn.disabled = false; btn.textContent = origLabel;
      }
    }

    if (text === 'Verify OTP') {
      if (_allowVerify) { _allowVerify = false; return; }
      e.stopImmediatePropagation();
      e.preventDefault();
      const otpInput = document.querySelector('input[maxlength="6"][type="tel"]') || document.querySelector('input[maxlength="6"]') || document.querySelector('input[inputmode="numeric"][maxlength]');
      const entered = (otpInput?.value || '').replace(/\D/g, '');
      if (!/^\d{4,6}$/.test(entered)) { showError('Enter the 6-digit OTP sent to your phone.'); return; }
      if (!lastPhone) { const d = sanitisePhone(document.querySelector('input[type="tel"]')?.value); if (/^\d{10}$/.test(d)) lastPhone = '+91' + d; }
      if (!_pendingToken) { showError('Session expired \u2014 click Send OTP again.'); return; }
      hideError();
      btn.disabled = true;
      const origLabel = btn.textContent;
      btn.textContent = 'Verifying\u2026';
      const dummyMode = await getDummyMode();
      try {
        const res = await fetchWithTimeout('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone, otp: entered, token: _pendingToken, dummyMode }),
        });
        if (res.status === 429) { showError('Too many attempts.'); btn.disabled = false; btn.textContent = origLabel; return; }
        if (!res.ok) { showError(`Server error (${res.status}).`); btn.disabled = false; btn.textContent = origLabel; return; }
        const data = await safeJson(res);
        if (!data) { showError('Unexpected server response.'); btn.disabled = false; btn.textContent = origLabel; return; }
        if (data.success) {
          _pendingToken = null; _otpValue = entered; _allowVerify = true;
          btn.disabled = false; btn.textContent = origLabel; btn.click();
        } else {
          showError(data.error || 'Incorrect OTP. Please try again.');
          btn.disabled = false; btn.textContent = origLabel;
        }
      } catch (err) {
        showError(err.name === 'AbortError' ? 'Request timed out.' : 'Verification failed.');
        btn.disabled = false; btn.textContent = origLabel;
      }
    }
  }, true);

  log('[BlockMyCard] OTP bridge loaded');
})();

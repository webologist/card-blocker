// otp-bridge.js — OTP handling + admin toggle + logout fix
(function () {
  let lastPhone     = '';
  let _allowVerify  = false;
  let _pendingToken = null;
  let _otpValue     = null;
  let _toastTimer   = null;

  Object.defineProperty(window, '__bmc_otp', {
    get()  { return _otpValue; },
    set(v) { _otpValue = v; },
    enumerable: false, configurable: true,
  });

  // ── Load admin-otp-toggle.js dynamically ──────────────────────────────────
  // This avoids needing to edit index.html
  function loadAdminToggle() {
    if (document.querySelector('script[src*="admin-otp-toggle"]')) return;
    const s = document.createElement('script');
    s.src = '/admin-otp-toggle.js';
    s.async = true;
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAdminToggle);
  } else {
    loadAdminToggle();
  }

  // ── Fix hidden logout / exit-admin button ─────────────────────────────────
  // The page CSS hides the React header (position:absolute, clip, 1x1px).
  // We watch for "Log out" and "Exit admin" in that hidden header and surface
  // a visible proxy button near the top of the main content area.
  function fixLogoutButton() {
    const header = document.querySelector('header');
    if (!header) return;

    const btn = [...header.querySelectorAll('button')].find(b => {
      const t = b.textContent.trim();
      return t === 'Log out' || t === 'Exit admin';
    });
    if (!btn) return;

    const label = btn.textContent.trim();
    const existingProxy = document.getElementById('bmc-logout-proxy');

    if (existingProxy) {
      // Update label and handler in case it changed (e.g. user → admin)
      existingProxy.textContent = label;
      existingProxy.onclick = () => btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return;
    }

    const bar = document.createElement('div');
    bar.id = 'bmc-logout-bar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:#1e293b;color:#94a3b8;font-size:.8rem;display:flex;align-items:center;justify-content:flex-end;padding:.4rem 1rem;gap:1rem;font-family:ui-sans-serif,system-ui,sans-serif;';

    // Show logged-in phone
    const phoneSpan = document.createElement('span');
    phoneSpan.id = 'bmc-logout-phone';
    phoneSpan.style.cssText = 'font-family:monospace;font-size:.78rem;';
    const reactPhoneEl = header.querySelector('span.font-mono');
    phoneSpan.textContent = reactPhoneEl ? reactPhoneEl.textContent.trim() : '';
    bar.appendChild(phoneSpan);

    const proxy = document.createElement('button');
    proxy.id = 'bmc-logout-proxy';
    proxy.textContent = label;
    proxy.style.cssText = 'background:none;border:1px solid #475569;color:#cbd5e1;border-radius:.375rem;padding:.25rem .75rem;cursor:pointer;font-size:.78rem;font-weight:600;';
    proxy.onmouseenter = () => proxy.style.color = '#fff';
    proxy.onmouseleave = () => proxy.style.color = '#cbd5e1';
    proxy.onclick = () => btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    bar.appendChild(proxy);

    document.body.insertBefore(bar, document.body.firstChild);
  }

  // Poll for the logout button (React renders it async after login)
  setInterval(fixLogoutButton, 800);

  // ── Dummy mode helpers ─────────────────────────────────────────────────────
  async function getDummyMode() {
    try { const r = await window.storage.get('cbp:otp_mode'); return r && r.value === 'dummy'; }
    catch { return false; }
  }

  function showDummyBanner(visible) {
    let b = document.getElementById('bmc-dummy-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'bmc-dummy-banner';
      b.style.cssText = 'position:fixed;top:32px;left:0;right:0;z-index:9997;background:#7c3aed;color:#fff;font-size:.72rem;font-weight:600;text-align:center;padding:.3rem 1rem;';
      b.textContent = '\u{1F9EA} DUMMY OTP MODE \u2014 code is 1234, Twilio NOT called';
      document.body.insertBefore(b, document.body.firstChild);
    }
    b.style.display = visible ? 'block' : 'none';
  }

  async function refreshBanners() {
    const dummy = await getDummyMode();
    showDummyBanner(dummy);
    // Keep logout bar phone label up to date
    const header = document.querySelector('header');
    if (header) {
      const phoneEl = header.querySelector('span.font-mono');
      const proxyPhone = document.getElementById('bmc-logout-phone');
      if (phoneEl && proxyPhone) proxyPhone.textContent = phoneEl.textContent.trim();
    }
  }
  setInterval(refreshBanners, 1500);
  window.addEventListener('focus', refreshBanners);

  // ── Toast error ────────────────────────────────────────────────────────────
  function showError(msg) {
    clearTimeout(_toastTimer);
    let t = document.getElementById('bmc-otp-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'bmc-otp-toast';
      t.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:10001;width:min(420px,calc(100vw - 2rem));background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;padding:.75rem 2.75rem .75rem 1rem;font-size:.875rem;color:#b91c1c;box-shadow:0 8px 24px rgba(0,0,0,.2);line-height:1.5;word-break:break-word;';
      const x = document.createElement('button');
      x.textContent = '\u2715';
      x.style.cssText = 'position:absolute;top:.5rem;right:.65rem;background:none;border:none;cursor:pointer;color:#b91c1c;';
      x.onclick = hideError;
      t.appendChild(x);
      document.body.appendChild(t);
    }
    const x = t.querySelector('button');
    Array.from(t.childNodes).forEach(n => { if (n !== x) t.removeChild(n); });
    t.insertBefore(document.createTextNode(msg), x);
    t.style.display = 'block';
    _toastTimer = setTimeout(hideError, 10000);
  }
  function hideError() { clearTimeout(_toastTimer); const t = document.getElementById('bmc-otp-toast'); if (t) t.style.display = 'none'; }

  async function fetchWithTimeout(url, opts, ms = 30000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try { const r = await fetch(url, { ...opts, signal: ctrl.signal }); clearTimeout(timer); return r; }
    catch (e) { clearTimeout(timer); throw e; }
  }
  async function safeJson(res) { try { return await res.json(); } catch { return null; } }

  function sanitisePhone(raw) {
    if (!raw || raw.length > 20) return '';
    let d = String(raw).replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.startsWith('0') && d.length >= 11) d = d.slice(1);
    return d;
  }

  // ── Button click handler ───────────────────────────────────────────────────
  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const text = (btn.textContent || '').trim();

    if (text === 'Send OTP' || text === 'Resend OTP') {
      const digits = sanitisePhone(document.querySelector('input[type="tel"]')?.value);
      if (!/^\d{10}$/.test(digits)) { showError('Enter your 10-digit mobile number.'); return; }
      hideError();
      lastPhone = '+91' + digits;
      _pendingToken = null; _otpValue = null;
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Sending\u2026';
      const dummy = await getDummyMode();
      try {
        const res = await fetchWithTimeout('/api/send-otp', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone, dummyMode: dummy }),
        });
        if (res.status === 429) { showError('Too many requests. Please wait.'); btn.disabled = false; btn.textContent = orig; return; }
        if (!res.ok) { showError('Server error. Please try again.'); btn.disabled = false; btn.textContent = orig; return; }
        const data = await safeJson(res);
        if (!data?.token) { showError(data?.error || 'Failed to send OTP.'); btn.disabled = false; btn.textContent = orig; return; }
        _pendingToken = data.token;
        btn.textContent = dummy ? 'OTP sent \u2713 (use 1234)' : 'OTP sent \u2713';
        if (dummy) showError('\u{1F9EA} Dummy mode \u2014 enter 1234 as your OTP.');
        setTimeout(() => { btn.textContent = 'Resend OTP'; btn.disabled = false; }, 30000);
      } catch (err) {
        showError(err.name === 'AbortError' ? 'Request timed out.' : 'No connection.');
        btn.disabled = false; btn.textContent = orig;
      }
    }

    if (text === 'Verify OTP') {
      if (_allowVerify) { _allowVerify = false; return; }
      e.stopImmediatePropagation(); e.preventDefault();
      const otpInput = document.querySelector('input[maxlength="6"][type="tel"]') || document.querySelector('input[maxlength="6"]') || document.querySelector('input[inputmode="numeric"][maxlength]');
      const entered = (otpInput?.value || '').replace(/\D/g, '');
      if (!/^\d{4,6}$/.test(entered)) { showError('Enter the OTP sent to your phone.'); return; }
      if (!lastPhone) { const d = sanitisePhone(document.querySelector('input[type="tel"]')?.value); if (/^\d{10}$/.test(d)) lastPhone = '+91' + d; }
      if (!_pendingToken) { showError('Session expired \u2014 click Send OTP again.'); return; }
      hideError();
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Verifying\u2026';
      const dummy = await getDummyMode();
      try {
        const res = await fetchWithTimeout('/api/verify-otp', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: lastPhone, otp: entered, token: _pendingToken, dummyMode: dummy }),
        });
        if (res.status === 429) { showError('Too many attempts.'); btn.disabled = false; btn.textContent = orig; return; }
        if (!res.ok) { showError('Server error.'); btn.disabled = false; btn.textContent = orig; return; }
        const data = await safeJson(res);
        if (data?.success) {
          _pendingToken = null; _otpValue = entered; _allowVerify = true;
          btn.disabled = false; btn.textContent = orig; btn.click();
        } else {
          showError(data?.error || 'Incorrect OTP.'); btn.disabled = false; btn.textContent = orig;
        }
      } catch (err) {
        showError(err.name === 'AbortError' ? 'Timed out.' : 'Verification failed.');
        btn.disabled = false; btn.textContent = orig;
      }
    }
  }, true);
})();

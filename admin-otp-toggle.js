// admin-otp-toggle.js
// Injects an "OTP Mode" tab into the admin console so you can switch between
// live Twilio SMS and dummy OTP "1234" without redeploying.
(function () {
  const STORAGE_KEY = 'cbp:otp_mode';

  async function getMode() {
    try { const r = await window.storage.get(STORAGE_KEY); return r ? r.value : 'live'; }
    catch { return 'live'; }
  }

  async function setMode(mode) {
    try { await window.storage.set(STORAGE_KEY, mode); } catch {}
    window.dispatchEvent(new Event('focus'));
  }

  async function buildPanel() {
    const current = await getMode();
    const isDummy = current === 'dummy';
    const panel = document.createElement('div');
    panel.id = 'bmc-otp-mode-panel';
    panel.innerHTML = `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;padding:1.25rem;max-width:480px;">
        <h3 style="font-weight:700;font-size:1rem;margin:0 0 .25rem">OTP Mode</h3>
        <p style="font-size:.8125rem;color:#64748b;margin:0 0 1rem">
          Switch between <strong>Live Twilio</strong> (real SMS) and
          <strong>Dummy mode</strong> where the OTP is always
          <code style="background:#f1f5f9;padding:.1rem .35rem;border-radius:.25rem;font-family:monospace">1234</code>
          and no SMS is sent.
        </p>
        <div style="display:flex;gap:.5rem;margin-bottom:1rem">
          <button data-mode="live" style="flex:1;border-radius:.375rem;padding:.6rem;font-size:.875rem;font-weight:600;cursor:pointer;
            ${!isDummy ? 'background:#0f172a;color:#fff;border:1.5px solid #0f172a' : 'background:#fff;color:#475569;border:1.5px solid #cbd5e1'}">
            \u{1F4E1} Live Twilio
          </button>
          <button data-mode="dummy" style="flex:1;border-radius:.375rem;padding:.6rem;font-size:.875rem;font-weight:600;cursor:pointer;
            ${isDummy ? 'background:#7c3aed;color:#fff;border:1.5px solid #7c3aed' : 'background:#fff;color:#475569;border:1.5px solid #cbd5e1'}">
            \u{1F9EA} Dummy OTP (1234)
          </button>
        </div>
        <div style="font-size:.8125rem;font-weight:600;padding:.5rem .75rem;border-radius:.375rem;
          ${isDummy ? 'background:#f3e8ff;color:#7c3aed;border:1px solid #ddd6fe' : 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0'}">
          ${isDummy ? '\u{1F7E3} Dummy mode active \u2014 OTP is 1234, Twilio is NOT called' : '\u{1F7E2} Live mode active \u2014 OTPs sent via Twilio SMS'}
        </div>
        <p style="font-size:.75rem;color:#94a3b8;margin:.75rem 0 0">
          You can also force dummy mode via the Vercel env var
          <code style="background:#f1f5f9;padding:.1rem .35rem;border-radius:.25rem;font-family:monospace">OTP_MODE=dummy</code>
          (takes precedence over this toggle).
        </p>
      </div>`;
    panel.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await setMode(btn.dataset.mode);
        const host = panel.parentNode;
        panel.remove();
        if (host) host.appendChild(await buildPanel());
      });
    });
    return panel;
  }

  let injected = false;

  async function tryInject() {
    if (injected) return;
    const allBtns = [...document.querySelectorAll('button')];
    const banksTab = allBtns.find(b => (b.textContent || '').trim() === 'Banks');
    if (!banksTab) return;
    const tabContainer = banksTab.parentNode;
    if (!tabContainer) return;
    if (tabContainer.querySelector('[data-bmc-otp-tab]')) { injected = true; return; }

    injected = true;

    const otpTabBtn = document.createElement('button');
    otpTabBtn.dataset.bmcOtpTab = '1';
    otpTabBtn.textContent = 'OTP Mode';
    otpTabBtn.style.cssText = 'padding:.375rem .75rem;border-radius:.375rem;font-size:.875rem;font-weight:600;background:#fff;border:1px solid #cbd5e1;color:#475569;cursor:pointer;';
    tabContainer.appendChild(otpTabBtn);

    const adminSection = tabContainer.parentNode;
    if (!adminSection) return;

    let panelHost = document.getElementById('bmc-otp-panel-host');
    if (!panelHost) {
      panelHost = document.createElement('div');
      panelHost.id = 'bmc-otp-panel-host';
      panelHost.style.cssText = 'display:none;margin-top:1rem';
      adminSection.appendChild(panelHost);
    }

    otpTabBtn.addEventListener('click', async () => {
      [...tabContainer.querySelectorAll('button')].forEach(b => {
        if (b === otpTabBtn) { b.style.background = '#0f172a'; b.style.color = '#fff'; b.style.borderColor = '#0f172a'; }
        else if (b.parentNode === tabContainer) { b.style.background = '#fff'; b.style.color = '#475569'; b.style.borderColor = '#cbd5e1'; }
      });
      [...adminSection.children].forEach(child => {
        if (child !== tabContainer && child !== panelHost) { child.style.display = 'none'; child.dataset.bmcHidden = '1'; }
      });
      panelHost.style.display = 'block';
      panelHost.innerHTML = '';
      panelHost.appendChild(await buildPanel());
    });

    [...tabContainer.querySelectorAll('button')].forEach(b => {
      if (b === otpTabBtn) return;
      b.addEventListener('click', () => {
        panelHost.style.display = 'none';
        [...adminSection.children].forEach(child => {
          if (child.dataset.bmcHidden) { delete child.dataset.bmcHidden; child.style.display = ''; }
        });
      }, true);
    });
  }

  setInterval(() => { injected = false; tryInject(); }, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInject);
  else tryInject();
})();

// admin-otp-toggle.js — Injects an "OTP Mode" tab into the admin console.
//
// How it works:
//   1. Polls for the admin tab-bar to appear in the DOM (React renders it async).
//   2. Appends an "OTP Mode" button to the tab-bar.
//   3. When selected, renders a toggle panel that reads/writes cbp:otp_mode
//      from the same window.storage the rest of the app uses.
//
// Include after app.js in index.html:
//   <script src="./admin-otp-toggle.js"></script>

(function () {
  const STORAGE_KEY = 'cbp:otp_mode';
  const TAB_LABEL   = 'OTP Mode';

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function getMode() {
    try {
      const r = await window.storage.get(STORAGE_KEY);
      return r ? r.value : 'live';  // default = live Twilio
    } catch { return 'live'; }
  }

  async function setMode(mode) {
    try { await window.storage.set(STORAGE_KEY, mode); } catch { /**/ }
    // Notify otp-bridge.js to refresh its banner
    window.dispatchEvent(new Event('focus'));
  }

  // ── Panel HTML ────────────────────────────────────────────────────────────
  async function buildPanel() {
    const current = await getMode();
    const isDummy = current === 'dummy';

    const panel = document.createElement('div');
    panel.id = 'bmc-otp-mode-panel';
    panel.innerHTML = `
      <div style="
        background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;
        padding:1.25rem;max-width:480px;
      ">
        <h3 style="font-weight:700;font-size:1rem;margin:0 0 .25rem">OTP Mode</h3>
        <p style="font-size:.8125rem;color:#64748b;margin:0 0 1rem">
          Switch between <strong>Live Twilio</strong> (real SMS) and
          <strong>Dummy mode</strong> (OTP is always&nbsp;<code
            style="background:#f1f5f9;padding:.1rem .35rem;border-radius:.25rem;
                   font-size:.8rem;font-family:monospace">1234</code>,
          no SMS is sent). Dummy mode is useful for testing without incurring Twilio charges.
        </p>

        <div style="display:flex;gap:.5rem;margin-bottom:1rem" id="bmc-mode-btns">
          <button data-mode="live" style="
            flex:1;border-radius:.375rem;padding:.6rem;font-size:.875rem;font-weight:600;
            cursor:pointer;transition:background .15s,color .15s;
            ${!isDummy
              ? 'background:#0f172a;color:#fff;border:1.5px solid #0f172a'
              : 'background:#fff;color:#475569;border:1.5px solid #cbd5e1'}
          ">
            📡 Live Twilio
          </button>
          <button data-mode="dummy" style="
            flex:1;border-radius:.375rem;padding:.6rem;font-size:.875rem;font-weight:600;
            cursor:pointer;transition:background .15s,color .15s;
            ${isDummy
              ? 'background:#7c3aed;color:#fff;border:1.5px solid #7c3aed'
              : 'background:#fff;color:#475569;border:1.5px solid #cbd5e1'}
          ">
            🧪 Dummy OTP (1234)
          </button>
        </div>

        <div id="bmc-mode-status" style="
          font-size:.8125rem;font-weight:600;padding:.5rem .75rem;
          border-radius:.375rem;
          ${isDummy
            ? 'background:#f3e8ff;color:#7c3aed;border:1px solid #ddd6fe'
            : 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0'}
        ">
          ${isDummy
            ? '🟣 Dummy mode active — OTP is 1234, Twilio is NOT called'
            : '🟢 Live mode active — OTPs are sent via Twilio SMS'}
        </div>

        <p style="font-size:.75rem;color:#94a3b8;margin:.75rem 0 0">
          You can also force dummy mode for all environments by setting the Vercel
          environment variable <code
            style="background:#f1f5f9;padding:.1rem .35rem;border-radius:.25rem;
                   font-family:monospace">OTP_MODE=dummy</code>.
          The env var takes precedence over this toggle.
        </p>
      </div>
    `;

    // Wire up the mode buttons
    panel.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newMode = btn.dataset.mode;
        await setMode(newMode);
        // Re-render the panel in-place
        const parent = panel.parentNode;
        panel.remove();
        if (parent) parent.appendChild(await buildPanel());
      });
    });

    return panel;
  }

  // ── Injection ─────────────────────────────────────────────────────────────
  // The admin console is only rendered after OTP login, so we poll for it.
  let injected = false;

  async function tryInject() {
    if (injected) return;

    // The tab-bar sits in the admin section. We identify it by looking for the
    // sequence of known tab labels rendered as buttons.
    const allBtns = [...document.querySelectorAll('button')];
    const tabBar  = allBtns.find(b => (b.textContent || '').trim() === 'Banks');

    if (!tabBar) return;           // admin not visible yet
    const tabContainer = tabBar.parentNode;
    if (!tabContainer) return;

    // Don't inject twice (React may re-render the parent but keep the node)
    if (tabContainer.querySelector('[data-bmc-otp-tab]')) return;

    injected = true;

    // ── Append "OTP Mode" tab button ────────────────────────────────────────
    const otpTabBtn = document.createElement('button');
    otpTabBtn.dataset.bmcOtpTab = '1';
    otpTabBtn.textContent = TAB_LABEL;
    // Match existing tab button styles (read from a sibling)
    const siblingStyle = tabBar.getAttribute('style') || '';
    otpTabBtn.setAttribute('style', siblingStyle);
    otpTabBtn.style.cssText = `
      padding:.375rem .75rem;border-radius:.375rem;font-size:.875rem;font-weight:600;
      background:#fff;border:1px solid #cbd5e1;color:#475569;cursor:pointer;
    `;
    tabContainer.appendChild(otpTabBtn);

    // ── Panel host ───────────────────────────────────────────────────────────
    // We need a sibling container next to the tab-bar where the panel renders.
    // The safest anchor is the tab-bar's grandparent (the full admin section div).
    const adminSection = tabContainer.parentNode;
    if (!adminSection) return;

    let panelHost = document.getElementById('bmc-otp-panel-host');
    if (!panelHost) {
      panelHost = document.createElement('div');
      panelHost.id = 'bmc-otp-panel-host';
      panelHost.style.cssText = 'display:none;margin-top:1rem';
      adminSection.appendChild(panelHost);
    }

    // Hide panel initially; show when our tab is active
    otpTabBtn.addEventListener('click', async () => {
      // Mark our tab as active (dark bg), reset all sibling tabs
      [...tabContainer.querySelectorAll('button')].forEach(b => {
        if (b === otpTabBtn) {
          b.style.background = '#0f172a';
          b.style.color      = '#fff';
          b.style.borderColor= '#0f172a';
        } else {
          // Reset others to inactive only if they look like admin tabs
          // (don't touch other React-managed buttons outside the bar)
          if (b.parentNode === tabContainer) {
            b.style.background = '#fff';
            b.style.color      = '#475569';
            b.style.borderColor= '#cbd5e1';
          }
        }
      });

      // Hide whatever content the other tabs showed — the admin section renders
      // the content directly inside adminSection as a sibling of tabContainer.
      [...adminSection.children].forEach(child => {
        if (child !== tabContainer && child !== panelHost) {
          child.style.display = 'none';
          child.dataset.bmcHidden = '1';
        }
      });

      // Show our panel
      panelHost.style.display = 'block';
      panelHost.innerHTML = '';
      panelHost.appendChild(await buildPanel());
    });

    // When another admin tab is clicked, restore their content and hide ours
    [...tabContainer.querySelectorAll('button')].forEach(b => {
      if (b === otpTabBtn) return;
      b.addEventListener('click', () => {
        panelHost.style.display = 'none';
        // Unhide content that was hidden by our tab
        [...adminSection.children].forEach(child => {
          if (child.dataset.bmcHidden) {
            delete child.dataset.bmcHidden;
            child.style.display = '';
          }
        });
      }, true);  // capture phase so we run before React's handler
    });
  }

  // Poll every 500 ms; once injected, slow poll keeps the tab alive across
  // React re-renders (React may swap the tab container DOM node).
  setInterval(() => {
    injected = false;   // reset so we re-check if DOM was replaced
    tryInject();
  }, 1000);

  // Also fire immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInject);
  } else {
    tryInject();
  }
})();

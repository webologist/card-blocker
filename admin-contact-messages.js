// admin-contact-messages.js
// Injects a "Messages" tab into the admin console, matching the pattern used
// by admin-otp-toggle.js and admin-email-integrations.js.
//
// Every contact-form submission is written to the database before the email is
// attempted, so nothing is lost when a provider is misconfigured or down. Until
// now nothing could read those rows back, which made the safety net useless
// exactly when it mattered. This is the screen that reads them.
(function () {
  var ADMIN_KEY_STORAGE = 'bmc_admin_key';
  var injected = false;
  var panelHost = null;

  function adminKey() {
    try { return localStorage.getItem(ADMIN_KEY_STORAGE) || ''; } catch (e) { return ''; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // "28 Jul 2026, 14:12" - the stored value is ISO/UTC, shown in local time.
  function when(iso) {
    if (!iso) return 'Unknown time';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    return d.toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function unlockMarkup(msg) {
    return '' +
      '<div style="max-width:26rem">' +
      '<h3 style="font-size:1.05rem;font-weight:800;margin-bottom:.35rem">Contact messages</h3>' +
      '<p style="font-size:.85rem;color:#64748b;margin-bottom:.75rem">Enter the admin key to read messages sent from the contact form.</p>' +
      (msg ? '<p role="alert" style="font-size:.8rem;color:#b91c1c;margin-bottom:.6rem">' + esc(msg) + '</p>' : '') +
      '<input id="bmc-cm-key" type="password" placeholder="Admin key" autocomplete="off" ' +
      'style="width:100%;padding:.55rem .7rem;border:1px solid #cbd5e1;border-radius:.375rem;font-size:.9rem;margin-bottom:.6rem"/>' +
      '<button id="bmc-cm-unlock" style="background:#0f172a;color:#fff;font-weight:700;font-size:.875rem;padding:.55rem 1.1rem;border:none;border-radius:.375rem;cursor:pointer">Unlock</button>' +
      '</div>';
  }

  function messageMarkup(m) {
    return '' +
      '<div style="border:1px solid #e2e8f0;border-radius:.5rem;padding:.9rem 1rem;margin-bottom:.75rem;background:#fff">' +
      '<div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:baseline;justify-content:space-between">' +
      '<div style="font-weight:800;font-size:.95rem">' + esc(m.subject || '(no subject)') + '</div>' +
      '<div style="font-size:.75rem;color:#94a3b8;font-family:monospace">' + when(m.received_at) + '</div>' +
      '</div>' +
      '<div style="font-size:.82rem;color:#475569;margin-top:.3rem">' +
      esc(m.name || 'Unknown sender') +
      (m.email ? ' &middot; <a href="mailto:' + esc(m.email) + '" style="color:#d63a2a">' + esc(m.email) + '</a>' : '') +
      (m.mobile ? ' &middot; <a href="tel:' + esc(m.mobile) + '" style="color:#d63a2a">' + esc(m.mobile) + '</a>' : '') +
      '</div>' +
      '<p style="white-space:pre-wrap;font-size:.875rem;color:#1e293b;margin-top:.6rem;line-height:1.6">' + esc(m.brief) + '</p>' +
      '</div>';
  }

  function listMarkup(payload) {
    var msgs = payload.messages || [];
    var head = '' +
      '<div style="display:flex;flex-wrap:wrap;gap:.75rem;align-items:baseline;justify-content:space-between;margin-bottom:.9rem">' +
      '<h3 style="font-size:1.05rem;font-weight:800">Contact messages</h3>' +
      '<div style="font-size:.8rem;color:#64748b">' + msgs.length + ' of ' + payload.count +
      ' <button id="bmc-cm-refresh" style="margin-left:.6rem;background:none;border:1px solid #cbd5e1;border-radius:.375rem;padding:.25rem .7rem;font-size:.75rem;font-weight:600;color:#475569;cursor:pointer">Refresh</button></div>' +
      '</div>';

    if (!msgs.length) {
      return head +
        '<div style="border:1px dashed #cbd5e1;border-radius:.5rem;padding:2rem;text-align:center;color:#64748b;font-size:.875rem">' +
        'No messages yet. Anything sent through the contact form will appear here, even if the email fails to send.' +
        '</div>';
    }
    return head + msgs.map(messageMarkup).join('');
  }

  function refreshPanel() {
    if (!panelHost) return;
    var key = adminKey();
    if (!key) { renderUnlock(); return; }

    panelHost.innerHTML = '<div style="font-size:.875rem;color:#64748b">Loading messages&hellip;</div>';
    fetch('/api/contact-messages?limit=200', { headers: { 'x-admin-key': key } })
      .then(function (res) {
        if (res.status === 403) {
          try { localStorage.removeItem(ADMIN_KEY_STORAGE); } catch (e) {}
          renderUnlock('That admin key was not accepted.');
          return null;
        }
        if (!res.ok) throw new Error('Request failed (' + res.status + ')');
        return res.json();
      })
      .then(function (payload) {
        if (!payload) return;
        panelHost.innerHTML = listMarkup(payload);
        var rb = document.getElementById('bmc-cm-refresh');
        if (rb) rb.addEventListener('click', refreshPanel);
      })
      .catch(function (err) {
        panelHost.innerHTML = '<p role="alert" style="font-size:.875rem;color:#b91c1c">Could not load messages: ' +
          esc(err.message) + '</p>';
      });
  }

  function renderUnlock(msg) {
    panelHost.innerHTML = unlockMarkup(msg);
    var btn = document.getElementById('bmc-cm-unlock');
    var input = document.getElementById('bmc-cm-key');
    function submit() {
      var v = (input.value || '').trim();
      if (!v) return;
      try { localStorage.setItem(ADMIN_KEY_STORAGE, v); } catch (e) {}
      refreshPanel();
    }
    if (btn) btn.addEventListener('click', submit);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  function tryInject() {
    if (injected) return;
    var allBtns = document.querySelectorAll('button'), banksTab = null;
    for (var i = 0; i < allBtns.length; i++) {
      if (allBtns[i].textContent.trim() === 'Banks') { banksTab = allBtns[i]; break; }
    }
    if (!banksTab) return;
    var tabContainer = banksTab.parentNode;
    if (!tabContainer) return;
    if (tabContainer.querySelector('[data-bmc-messages-tab]')) { injected = true; return; }
    injected = true;

    var adminSection = tabContainer.parentNode;
    if (!adminSection) return;

    var tabBtn = document.createElement('button');
    tabBtn.dataset.bmcMessagesTab = '1';
    tabBtn.textContent = 'Messages';
    tabBtn.style.cssText = 'padding:.375rem .75rem;border-radius:.375rem;font-size:.875rem;font-weight:600;background:#fff;border:1px solid #cbd5e1;color:#475569;cursor:pointer;';
    tabContainer.appendChild(tabBtn);

    panelHost = document.getElementById('bmc-messages-panel-host');
    if (!panelHost) {
      panelHost = document.createElement('div');
      panelHost.id = 'bmc-messages-panel-host';
      panelHost.style.display = 'none';
      adminSection.appendChild(panelHost);
    }

    tabBtn.addEventListener('click', function () {
      var tabBtns = tabContainer.querySelectorAll('button');
      for (var i = 0; i < tabBtns.length; i++) {
        if (tabBtns[i] === tabBtn) { tabBtns[i].style.background = '#0f172a'; tabBtns[i].style.color = '#fff'; tabBtns[i].style.borderColor = '#0f172a'; }
        else if (tabBtns[i].parentNode === tabContainer) { tabBtns[i].style.background = '#fff'; tabBtns[i].style.color = '#475569'; tabBtns[i].style.borderColor = '#cbd5e1'; }
      }
      var ch = adminSection.children;
      for (var j = 0; j < ch.length; j++) {
        if (ch[j] !== tabContainer && ch[j] !== panelHost) { ch[j].style.display = 'none'; ch[j].dataset.bmcHidden = '1'; }
      }
      panelHost.style.display = 'block';
      refreshPanel();
    });

    var existingBtns = tabContainer.querySelectorAll('button');
    for (var k = 0; k < existingBtns.length; k++) {
      if (existingBtns[k] === tabBtn) continue;
      existingBtns[k].addEventListener('click', function () {
        panelHost.style.display = 'none';
        var ch = adminSection.children;
        for (var m = 0; m < ch.length; m++) {
          if (ch[m].dataset && ch[m].dataset.bmcHidden) { delete ch[m].dataset.bmcHidden; ch[m].style.display = ''; }
        }
      }, true);
    }
  }

  setInterval(function () { injected = false; tryInject(); }, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInject);
  else tryInject();
})();

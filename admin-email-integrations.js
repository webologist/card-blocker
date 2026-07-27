// admin-email-integrations.js
// Injects an "Email Integrations" tab into the admin console, matching the
// pattern used by admin-otp-toggle.js. Lets the admin connect Brevo, AWS SES,
// and Gmail (SMTP + App Password) for sending emails, and choose which one
// is active. Secrets are never round-tripped back to the browser - the GET
// endpoint returns masked/boolean state only.
(function () {
  var ADMIN_KEY_STORAGE = 'bmc_admin_key';

  function getAdminKey() { return sessionStorage.getItem(ADMIN_KEY_STORAGE) || ''; }
  function setAdminKey(v) { sessionStorage.setItem(ADMIN_KEY_STORAGE, v); }

  function apiFetch(url, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'x-admin-key': getAdminKey() }, opts.headers || {});
    return fetch(url, Object.assign({}, opts, { headers: headers }))
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, status: r.status, data: data }; }); });
  }

  function el(tag, style, text) {
    var e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function labeledInput(labelText, opts) {
    opts = opts || {};
    var wrap = el('label', 'display:block;margin-bottom:.6rem;');
    var lbl = el('span', 'display:block;font-size:.72rem;font-weight:700;color:#64748b;margin-bottom:.25rem;', labelText);
    wrap.appendChild(lbl);
    var input = el('input', 'width:100%;border:1px solid #cbd5e1;border-radius:.375rem;padding:.45rem .6rem;font-size:.8125rem;box-sizing:border-box;');
    input.type = opts.type || 'text';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }

  function statusLine(text, ok) {
    var s = el('div', 'margin-top:.5rem;font-size:.75rem;font-weight:600;padding:.4rem .6rem;border-radius:.375rem;' +
      (ok ? 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;' : 'background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;'), text);
    return s;
  }

  function buildProviderCard(key, title, fieldsDef, current) {
    var card = el('div', 'background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;padding:1.1rem;margin-bottom:1rem;');
    var h = el('h4', 'font-weight:700;font-size:.95rem;margin:0 0 .15rem;color:#0f172a;', title);
    card.appendChild(h);

    var cfgState = (current && current[key]) || {};
    var configured = !!cfgState.configured;
    var stateNote = el('p', 'font-size:.75rem;color:' + (configured ? '#15803d' : '#94a3b8') + ';margin:0 0 .75rem;',
      configured ? 'Connected' + (cfgState.from_email || cfgState.address ? ' · ' + (cfgState.from_email || cfgState.address) : '') + (cfgState.key_hint ? ' · key ' + cfgState.key_hint : '') : 'Not connected yet');
    card.appendChild(stateNote);

    var inputs = {};
    fieldsDef.forEach(function (f) {
      var built = labeledInput(f.label, { type: f.secret ? 'password' : 'text', placeholder: f.secret && configured ? 'Leave blank to keep current value' : f.placeholder });
      if (!f.secret && cfgState[f.showKey]) built.input.value = cfgState[f.showKey];
      card.appendChild(built.wrap);
      inputs[f.name] = built.input;
    });

    var btnRow = el('div', 'display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap;');
    var saveBtn = el('button', 'background:#0f172a;color:#fff;border:none;border-radius:.375rem;padding:.5rem 1rem;font-size:.8125rem;font-weight:600;cursor:pointer;', 'Save');
    var testBtn = el('button', 'background:#fff;color:#0f172a;border:1px solid #cbd5e1;border-radius:.375rem;padding:.5rem 1rem;font-size:.8125rem;font-weight:600;cursor:pointer;', 'Send test email');
    btnRow.appendChild(saveBtn); btnRow.appendChild(testBtn);
    card.appendChild(btnRow);

    var statusHost = el('div');
    card.appendChild(statusHost);

    saveBtn.onclick = function () {
      var patch = {};
      fieldsDef.forEach(function (f) {
        var v = inputs[f.name].value.trim();
        if (v) patch[f.name] = v;
      });
      saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
      apiFetch('/api/email-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
        .then(function (r) {
          saveBtn.disabled = false; saveBtn.textContent = 'Save';
          statusHost.innerHTML = '';
          if (r.ok) statusHost.appendChild(statusLine('Saved.', true));
          else statusHost.appendChild(statusLine(r.data.error || ('Error ' + r.status), false));
        });
    };

    testBtn.onclick = function () {
      var to = window.prompt('Send a test email to:');
      if (!to) return;
      testBtn.disabled = true; testBtn.textContent = 'Sending...';
      apiFetch('/api/email-settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: to, provider: key }) })
        .then(function (r) {
          testBtn.disabled = false; testBtn.textContent = 'Send test email';
          statusHost.innerHTML = '';
          if (r.ok && r.data.success) statusHost.appendChild(statusLine('Test email sent via ' + r.data.provider + '.', true));
          else statusHost.appendChild(statusLine(r.data.error || ('Error ' + r.status), false));
        });
    };

    return card;
  }

  function buildActiveProviderCard(current) {
    var card = el('div', 'background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;padding:1.1rem;margin-bottom:1rem;');
    card.appendChild(el('h4', 'font-weight:700;font-size:.95rem;margin:0 0 .5rem;color:#0f172a;', 'Active provider'));
    card.appendChild(el('p', 'font-size:.75rem;color:#64748b;margin:0 0 .75rem;', 'Whichever provider is active here is used to send the "new login" email after a user logs in.'));

    var row = el('div', 'display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem;');
    var options = [['', 'None'], ['brevo', 'Brevo'], ['ses', 'AWS SES'], ['gmail', 'Gmail']];
    var active = (current && current.active_provider) || '';
    var buttons = [];
    options.forEach(function (opt) {
      var isActive = opt[0] === active;
      var b = el('button', 'border-radius:.375rem;padding:.45rem .9rem;font-size:.8125rem;font-weight:600;cursor:pointer;' +
        (isActive ? 'background:#0f172a;color:#fff;border:1.5px solid #0f172a;' : 'background:#fff;color:#475569;border:1.5px solid #cbd5e1;'), opt[1]);
      b.dataset.val = opt[0];
      b.onclick = function () {
        buttons.forEach(function (bb) {
          var on = bb === b;
          bb.style.background = on ? '#0f172a' : '#fff';
          bb.style.color = on ? '#fff' : '#475569';
          bb.style.borderColor = on ? '#0f172a' : '#cbd5e1';
        });
        apiFetch('/api/email-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active_provider: opt[0] || null }) })
          .then(function (r) {
            statusHost.innerHTML = '';
            statusHost.appendChild(statusLine(r.ok ? 'Active provider set to "' + (opt[1]) + '".' : (r.data.error || 'Error'), r.ok));
          });
      };
      buttons.push(b);
      row.appendChild(b);
    });
    card.appendChild(row);
    var statusHost = el('div');
    card.appendChild(statusHost);
    return card;
  }

  function buildAdminKeyCard() {
    var card = el('div', 'background:#fffbeb;border:1px solid #fde68a;border-radius:.5rem;padding:1rem;margin-bottom:1rem;');
    card.appendChild(el('h4', 'font-weight:700;font-size:.9rem;margin:0 0 .35rem;color:#92400e;', 'Admin key'));
    card.appendChild(el('p', 'font-size:.75rem;color:#92400e;margin:0 0 .6rem;', 'Enter the ADMIN_API_SECRET configured on the server. Kept only in this browser tab\'s session.'));
    var row = el('div', 'display:flex;gap:.5rem;');
    var input = el('input', 'flex:1;border:1px solid #fbbf24;border-radius:.375rem;padding:.45rem .6rem;font-size:.8125rem;');
    input.type = 'password'; input.value = getAdminKey();
    var btn = el('button', 'background:#92400e;color:#fff;border:none;border-radius:.375rem;padding:.45rem .9rem;font-size:.8125rem;font-weight:600;cursor:pointer;', 'Unlock');
    row.appendChild(input); row.appendChild(btn);
    card.appendChild(row);
    btn.onclick = function () { setAdminKey(input.value.trim()); refreshPanel(); };
    return card;
  }

  var panelHost = null;

  function refreshPanel() {
    if (!panelHost) return;
    panelHost.innerHTML = '';
    var wrap = el('div', 'padding:1rem 0;max-width:640px;');
    wrap.appendChild(buildAdminKeyCard());

    if (!getAdminKey()) {
      panelHost.appendChild(wrap);
      return;
    }

    apiFetch('/api/email-settings').then(function (r) {
      if (!r.ok) {
        wrap.appendChild(statusLine(r.data.error || 'Could not load email settings (check the admin key).', false));
        panelHost.appendChild(wrap);
        return;
      }
      var current = r.data;
      wrap.appendChild(buildActiveProviderCard(current));
      wrap.appendChild(buildProviderCard('brevo', 'Brevo', [
        { name: 'brevo_api_key', label: 'API key', secret: true },
        { name: 'brevo_from_email', label: 'From email', showKey: 'from_email', placeholder: 'you@yourdomain.com' },
        { name: 'brevo_from_name', label: 'From name', showKey: 'from_name', placeholder: 'BlockMyCard' },
      ], current));
      wrap.appendChild(buildProviderCard('ses', 'AWS SES', [
        { name: 'ses_access_key_id', label: 'Access key ID', secret: true },
        { name: 'ses_secret_access_key', label: 'Secret access key', secret: true },
        { name: 'ses_region', label: 'Region', showKey: 'region', placeholder: 'us-east-1' },
        { name: 'ses_from_email', label: 'From email (SES-verified)', showKey: 'from_email', placeholder: 'you@yourdomain.com' },
      ], current));
      wrap.appendChild(buildProviderCard('gmail', 'Gmail (SMTP + App Password)', [
        { name: 'gmail_address', label: 'Gmail address', showKey: 'address', placeholder: 'you@gmail.com' },
        { name: 'gmail_app_password', label: 'App password', secret: true },
        { name: 'gmail_from_name', label: 'From name', showKey: 'from_name', placeholder: 'BlockMyCard' },
      ], current));
      panelHost.appendChild(wrap);
    });
  }

  var injected = false;

  function tryInject() {
    if (injected) return;
    var allBtns = document.querySelectorAll('button'), banksTab = null;
    for (var i = 0; i < allBtns.length; i++) {
      if (allBtns[i].textContent.trim() === 'Banks') { banksTab = allBtns[i]; break; }
    }
    if (!banksTab) return;
    var tabContainer = banksTab.parentNode;
    if (!tabContainer) return;
    if (tabContainer.querySelector('[data-bmc-email-tab]')) { injected = true; return; }
    injected = true;

    var adminSection = tabContainer.parentNode;
    if (!adminSection) return;

    var tabBtn = document.createElement('button');
    tabBtn.dataset.bmcEmailTab = '1';
    tabBtn.textContent = 'Email Integrations';
    tabBtn.style.cssText = 'padding:.375rem .75rem;border-radius:.375rem;font-size:.875rem;font-weight:600;background:#fff;border:1px solid #cbd5e1;color:#475569;cursor:pointer;';
    tabContainer.appendChild(tabBtn);

    panelHost = document.getElementById('bmc-email-panel-host');
    if (!panelHost) {
      panelHost = document.createElement('div');
      panelHost.id = 'bmc-email-panel-host';
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

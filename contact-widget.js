// contact-widget.js
// "Contact us" widget: a floating launcher plus a modal form (name, mobile,
// email, subject, brief) that POSTs to /api/contact.
//
// Self-contained and loaded with a plain <script src> like admin-otp-toggle.js
// and login-email-notifier.js, so it works on the landing page and on the
// static policy pages without either one having to know about it. It injects
// its own markup and styles, and reuses the page's CSS tokens (--red, --card,
// --border, ...) so light/dark themes follow the rest of the site for free.
(function () {
  if (window.__bmcContactWidget) return;   // one instance per page

  var FIELDS = [
    { id: 'name',    label: 'Your Name',     type: 'text',   autocomplete: 'name',  placeholder: 'Full name' },
    { id: 'mobile',  label: 'Mobile Number', type: 'tel',    autocomplete: 'tel',   placeholder: '10-digit mobile number', inputmode: 'numeric', maxlength: 15 },
    { id: 'email',   label: 'Email',         type: 'email',  autocomplete: 'email', placeholder: 'you@example.com' },
    { id: 'subject', label: 'Subject',       type: 'text',                          placeholder: 'What is this about?', maxlength: 120 },
    { id: 'brief',   label: 'Brief',         type: 'textarea',                      placeholder: 'Tell us a little more...', maxlength: 2000 },
  ];

  var CSS = [
    '.bmc-contact-fab{position:fixed;right:1.25rem;bottom:1.25rem;z-index:2000;display:inline-flex;align-items:center;gap:.5rem;',
      'background:var(--red,#d63a2a);color:#fff;border:none;border-radius:999px;padding:.75rem 1.15rem;font-family:inherit;font-weight:700;',
      'font-size:.9rem;cursor:pointer;box-shadow:0 6px 20px rgba(214,58,42,.35);transition:background .15s,transform .1s}',
    '.bmc-contact-fab:hover{background:var(--red-dark,#b72e1e);transform:translateY(-1px)}',
    '.bmc-contact-fab:focus-visible{outline:2px solid var(--fg,#111827);outline-offset:3px}',
    '@media(max-width:520px){.bmc-contact-fab{right:.85rem;bottom:.85rem;padding:.7rem 1rem}}',

    '.bmc-contact-backdrop{position:fixed;inset:0;z-index:2001;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;padding:1rem;overflow-y:auto}',
    '.bmc-contact-backdrop.open{display:flex}',

    '.bmc-contact-panel{background:var(--card,#fff);color:var(--fg,#111827);width:100%;max-width:460px;border:1px solid var(--border,#e5e7eb);',
      'border-radius:var(--radius-lg,16px);box-shadow:var(--shadow-xl,0 24px 64px rgba(0,0,0,.22));padding:1.4rem;margin:auto}',
    '.bmc-contact-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1rem}',
    '.bmc-contact-head h2{font-size:1.15rem;font-weight:800;margin:0 0 .2rem;line-height:1.3}',
    '.bmc-contact-head p{font-size:.83rem;color:var(--fg2,#6b7280);margin:0;line-height:1.5}',
    '.bmc-contact-close{flex-shrink:0;width:32px;height:32px;border-radius:50%;border:none;background:var(--bg2,#f8f9fa);color:var(--fg2,#6b7280);',
      'font-size:1.1rem;line-height:1;cursor:pointer;display:grid;place-items:center;font-family:inherit}',
    '.bmc-contact-close:hover{background:var(--border,#e5e7eb);color:var(--fg,#111827)}',

    '.bmc-contact-field{margin-bottom:.8rem}',
    '.bmc-contact-field label{display:block;font-size:.78rem;font-weight:700;margin-bottom:.3rem}',
    '.bmc-contact-field .req{color:var(--red,#d63a2a);margin-left:.15rem}',
    '.bmc-contact-field input,.bmc-contact-field textarea{width:100%;background:var(--bg,#fff);color:var(--fg,#111827);border:1.5px solid var(--border,#e5e7eb);',
      'border-radius:var(--radius-sm,8px);padding:.6rem .7rem;font-family:inherit;font-size:.9rem;line-height:1.5;transition:border-color .15s}',
    '.bmc-contact-field textarea{min-height:96px;resize:vertical}',
    '.bmc-contact-field input:focus,.bmc-contact-field textarea:focus{outline:none;border-color:var(--red,#d63a2a)}',
    '.bmc-contact-field.invalid input,.bmc-contact-field.invalid textarea{border-color:var(--red,#d63a2a)}',
    '.bmc-contact-err{display:none;font-size:.74rem;color:var(--red,#d63a2a);margin-top:.25rem;font-weight:600}',
    '.bmc-contact-field.invalid .bmc-contact-err{display:block}',
    '.bmc-contact-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}',

    '.bmc-contact-submit{width:100%;background:var(--red,#d63a2a);color:#fff;border:none;border-radius:var(--radius-md,12px);padding:.8rem;',
      'font-family:inherit;font-weight:700;font-size:.95rem;cursor:pointer;margin-top:.35rem;transition:background .15s}',
    '.bmc-contact-submit:hover:not(:disabled){background:var(--red-dark,#b72e1e)}',
    '.bmc-contact-submit:disabled{opacity:.6;cursor:not-allowed}',
    '.bmc-contact-status{margin-top:.7rem;font-size:.82rem;font-weight:600;line-height:1.5;text-align:center}',
    '.bmc-contact-status.err{color:var(--red,#d63a2a)}',
    '.bmc-contact-status.ok{color:var(--success,#16a34a)}',
    '.bmc-contact-note{margin-top:.8rem;font-size:.72rem;color:var(--fg2,#6b7280);text-align:center;line-height:1.5}',
    '.bmc-contact-done{text-align:center;padding:1rem 0 .25rem}',
    '.bmc-contact-done .tick{font-size:2rem;display:block;margin-bottom:.5rem}',
    '.bmc-contact-done h3{font-size:1.05rem;font-weight:800;margin:0 0 .35rem}',
    '.bmc-contact-done p{font-size:.85rem;color:var(--fg2,#6b7280);margin:0 0 1.1rem;line-height:1.6}',
  ].join('');

  // ── Validation ──────────────────────────────────────────────────────────
  // Mobile numbers are typed with spaces, dashes and +91 in about equal
  // measure, so strip the decoration before checking rather than rejecting it.
  function normalizeMobile(v) {
    var digits = String(v).replace(/\D/g, '');
    if (digits.length === 12 && digits.indexOf('91') === 0) digits = digits.slice(2);
    if (digits.length === 11 && digits.charAt(0) === '0') digits = digits.slice(1);
    return digits;
  }

  var VALIDATORS = {
    name: function (v) {
      if (!v) return 'Please enter your name.';
      if (v.length < 2) return 'Please enter your full name.';
      return '';
    },
    mobile: function (v) {
      if (!v) return 'Please enter your mobile number.';
      var d = normalizeMobile(v);
      if (!/^[6-9]\d{9}$/.test(d)) return 'Enter a valid 10-digit Indian mobile number.';
      return '';
    },
    email: function (v) {
      if (!v) return 'Please enter your email address.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address.';
      return '';
    },
    subject: function (v) {
      if (!v) return 'Please enter a subject.';
      return '';
    },
    brief: function (v) {
      if (!v) return 'Please tell us how we can help.';
      if (v.length < 10) return 'Please add a little more detail.';
      return '';
    },
  };

  // ── Markup ──────────────────────────────────────────────────────────────
  function fieldHtml(f) {
    var attrs = 'id="bmc-contact-' + f.id + '" name="' + f.id + '" ' +
      'placeholder="' + f.placeholder + '" ' +
      (f.autocomplete ? 'autocomplete="' + f.autocomplete + '" ' : '') +
      (f.inputmode ? 'inputmode="' + f.inputmode + '" ' : '') +
      (f.maxlength ? 'maxlength="' + f.maxlength + '" ' : '') +
      'aria-describedby="bmc-contact-' + f.id + '-err"';
    var control = f.type === 'textarea'
      ? '<textarea ' + attrs + ' rows="4"></textarea>'
      : '<input type="' + f.type + '" ' + attrs + '/>';
    return '<div class="bmc-contact-field" data-field="' + f.id + '">' +
      '<label for="bmc-contact-' + f.id + '">' + f.label + '<span class="req" aria-hidden="true">*</span></label>' +
      control +
      '<div class="bmc-contact-err" id="bmc-contact-' + f.id + '-err" role="alert"></div>' +
      '</div>';
  }

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'bmc-contact-fab';
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.innerHTML = '<span aria-hidden="true">&#x2709;&#xFE0F;</span> Contact us';

  var backdrop = document.createElement('div');
  backdrop.className = 'bmc-contact-backdrop';
  backdrop.innerHTML =
    '<div class="bmc-contact-panel" role="dialog" aria-modal="true" aria-labelledby="bmc-contact-title">' +
      '<div class="bmc-contact-head">' +
        '<div>' +
          '<h2 id="bmc-contact-title">Contact us</h2>' +
          '<p>Send us a question or a problem and we will get back to you.</p>' +
        '</div>' +
        '<button type="button" class="bmc-contact-close" aria-label="Close contact form">&#x2715;</button>' +
      '</div>' +
      '<form novalidate>' +
        FIELDS.map(fieldHtml).join('') +
        // Bots fill every field they find; humans never see this one.
        '<div class="bmc-contact-hp" aria-hidden="true"><label for="bmc-contact-website">Website</label>' +
          '<input type="text" id="bmc-contact-website" name="website" tabindex="-1" autocomplete="off"/></div>' +
        '<button type="submit" class="bmc-contact-submit">Send message</button>' +
        '<div class="bmc-contact-status" role="status" aria-live="polite"></div>' +
        '<p class="bmc-contact-note">We only use these details to reply to you.</p>' +
      '</form>' +
    '</div>';

  document.body.appendChild(fab);
  document.body.appendChild(backdrop);

  var panel  = backdrop.querySelector('.bmc-contact-panel');
  var form   = backdrop.querySelector('form');
  var status = backdrop.querySelector('.bmc-contact-status');
  var submit = backdrop.querySelector('.bmc-contact-submit');
  var lastFocused = null;

  function fieldEl(id) { return backdrop.querySelector('[data-field="' + id + '"]'); }
  function inputEl(id) { return document.getElementById('bmc-contact-' + id); }

  function setError(id, msg) {
    var wrap = fieldEl(id);
    wrap.classList.toggle('invalid', !!msg);
    inputEl(id).setAttribute('aria-invalid', msg ? 'true' : 'false');
    wrap.querySelector('.bmc-contact-err').textContent = msg;
  }

  function validate(id) {
    var msg = VALIDATORS[id](inputEl(id).value.trim());
    setError(id, msg);
    return !msg;
  }

  function setStatus(msg, kind) {
    status.textContent = msg || '';
    status.className = 'bmc-contact-status' + (kind ? ' ' + kind : '');
  }

  // ── Open / close ────────────────────────────────────────────────────────
  function open() {
    lastFocused = document.activeElement;
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    inputEl('name').focus();
  }

  function close() {
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  fab.addEventListener('click', open);
  backdrop.querySelector('.bmc-contact-close').addEventListener('click', close);
  backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });

  document.addEventListener('keydown', function (e) {
    if (!backdrop.classList.contains('open')) return;
    if (e.key === 'Escape') { close(); return; }
    // Keep tabbing inside the dialog while it is modal.
    if (e.key !== 'Tab') return;
    var items = panel.querySelectorAll('button, input, textarea, a[href]');
    var focusable = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].tabIndex !== -1 && !items[i].disabled) focusable.push(items[i]);
    }
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Re-validate only once a field has already been flagged, so the form does
  // not shout at someone who is still halfway through typing.
  FIELDS.forEach(function (f) {
    var el = inputEl(f.id);
    el.addEventListener('blur', function () { if (el.value.trim()) validate(f.id); });
    el.addEventListener('input', function () {
      if (fieldEl(f.id).classList.contains('invalid')) validate(f.id);
    });
  });

  // ── Submit ──────────────────────────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setStatus('');

    var firstBad = null;
    FIELDS.forEach(function (f) {
      if (!validate(f.id) && !firstBad) firstBad = f.id;
    });
    if (firstBad) { inputEl(firstBad).focus(); return; }

    var payload = {
      name: inputEl('name').value.trim(),
      mobile: normalizeMobile(inputEl('mobile').value),
      email: inputEl('email').value.trim(),
      subject: inputEl('subject').value.trim(),
      brief: inputEl('brief').value.trim(),
      website: document.getElementById('bmc-contact-website').value,
    };

    submit.disabled = true;
    submit.textContent = 'Sending...';

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, data: d || {} };
      });
    }).then(function (res) {
      if (!res.ok || !res.data.ok) throw new Error(res.data.error || 'Could not send your message.');
      panel.querySelector('form').outerHTML =
        '<div class="bmc-contact-done">' +
          '<span class="tick" aria-hidden="true">&#x2705;</span>' +
          '<h3>Message sent</h3>' +
          '<p>Thanks for getting in touch. We will reply to <strong>' + payload.email.replace(/[<>&]/g, '') + '</strong> as soon as we can.</p>' +
          '<button type="button" class="bmc-contact-submit" data-close>Close</button>' +
        '</div>';
      panel.querySelector('[data-close]').addEventListener('click', close);
      panel.querySelector('[data-close]').focus();
    }).catch(function (err) {
      submit.disabled = false;
      submit.textContent = 'Send message';
      setStatus(err.message + ' Please try again, or email support@blockmycard.in.', 'err');
    });
  });

  // Any element marked data-bmc-contact (e.g. the footer "Contact" link) opens
  // the same dialog, so the widget has one entry point wherever it is linked.
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest && e.target.closest('[data-bmc-contact]');
    if (!trigger) return;
    e.preventDefault();
    open();
  });

  window.__bmcContactWidget = { open: open, close: close };
})();

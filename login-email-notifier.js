// login-email-notifier.js
// Watches the shared activity log (cbp:logs) for fresh account-access entries
// and asks the server to email the user about each one, via whichever provider
// the admin has connected in Email Integrations.
//
// Two actions count, because the app logs them differently: a returning user
// produces "Login", while a brand-new signup produces "Registered" and never
// a "Login". Watching only "Login" silently skipped every first-time user.
// Does not touch app.js - follows the same storage-polling pattern as
// admin-otp-toggle.js / otp-bridge.js's quick-login panel.
(function () {
  var seen = null; // null until the first poll establishes a baseline

  function serialize(entry) { return entry.t + '|' + entry.actor + '|' + entry.action + '|' + entry.detail; }

  var EMAIL_ON = { 'Login': 'login', 'Registered': 'registered' };

  function notify(phone, ts, event) {
    fetch('/api/login-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, ts: ts, event: event }),
    }).catch(function () {});
  }

  function poll() {
    if (!window.storage || !window.storage.get) return;
    window.storage.get('cbp:logs').then(function (result) {
      if (!result || !result.value) return;
      var logs;
      try { logs = JSON.parse(result.value); } catch (e) { return; }
      if (!Array.isArray(logs)) return;

      if (seen === null) {
        // First read: establish baseline, don't email for pre-existing history.
        seen = new Set(logs.map(serialize));
        return;
      }

      // Logs are newest-first; walk until we hit something we've already seen.
      for (var i = 0; i < logs.length; i++) {
        var key = serialize(logs[i]);
        if (seen.has(key)) break;
        seen.add(key);
        var evt = EMAIL_ON[logs[i].action];
        if (evt) notify(logs[i].actor, logs[i].t, evt);
      }
    }).catch(function () {});
  }

  setInterval(poll, 3000);
  poll();
})();

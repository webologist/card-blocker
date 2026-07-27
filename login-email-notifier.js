// login-email-notifier.js
// Watches the shared activity log (cbp:logs) for fresh "Login" entries and
// asks the server to send a login-notification email for each one, via
// whichever provider the admin has connected in Email Integrations.
// Does not touch app.js - follows the same storage-polling pattern as
// admin-otp-toggle.js / otp-bridge.js's quick-login panel.
(function () {
  var seen = null; // null until the first poll establishes a baseline

  function serialize(entry) { return entry.t + '|' + entry.actor + '|' + entry.action + '|' + entry.detail; }

  function notify(phone, ts) {
    fetch('/api/login-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, ts: ts }),
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
        if (logs[i].action === 'Login') notify(logs[i].actor, logs[i].t);
      }
    }).catch(function () {});
  }

  setInterval(poll, 3000);
  poll();
})();

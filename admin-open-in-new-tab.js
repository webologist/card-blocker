// admin-open-in-new-tab.js
// Makes every Admin console activity (Banks, Messages, Users, Activity log,
// Feedback, OTP Mode, Email Integrations) open in its own new browser tab
// instead of switching panels inline in the current tab.
//
// Caveat: this app has no server-side session - admin access is only an
// in-memory flag set after OTP verification, so a freshly opened tab still
// has to go through phone + OTP entry (choosing the admin option) again,
// exactly as opening the site fresh would. Once that tab reaches the Admin
// console, this script auto-selects the requested activity and clears the
// URL parameter it used to remember which one was requested.
(function () {
  var PARAM = 'admin_tab';
  var SLUGS = {
    banks: 'Banks',
    templates: 'Messages',
    users: 'Users',
    logs: 'Activity log',
    feedback: 'Feedback',
    otp: 'OTP Mode',
    email: 'Email Integrations',
  };
  var LABEL_TO_SLUG = {};
  Object.keys(SLUGS).forEach(function (k) { LABEL_TO_SLUG[SLUGS[k]] = k; });

  var autoClicking = false;

  function findTabContainer() {
    var allBtns = document.querySelectorAll('button');
    for (var i = 0; i < allBtns.length; i++) {
      if (allBtns[i].textContent.trim() === 'Banks') return allBtns[i].parentNode;
    }
    return null;
  }

  // Intercept clicks on the admin tab bar buttons (capture phase, same
  // technique otp-bridge.js uses) and open a new tab instead of switching.
  document.addEventListener('click', function (e) {
    if (autoClicking) return;
    var btn = e.target.closest('button');
    if (!btn) return;
    var label = btn.textContent.trim();
    var slug = LABEL_TO_SLUG[label];
    if (!slug) return;
    var container = findTabContainer();
    if (!container || btn.parentNode !== container) return;

    e.stopImmediatePropagation();
    e.preventDefault();
    var url = new URL(location.href);
    url.searchParams.set(PARAM, slug);
    window.open(url.toString(), '_blank');
  }, true);

  // On load, if a target activity was requested, wait for the admin console
  // to appear (i.e. wait for the admin to finish OTP in this new tab) and
  // auto-select it once.
  var requested = new URL(location.href).searchParams.get(PARAM);
  if (!requested || !SLUGS[requested]) return;
  var label = SLUGS[requested];

  var timer = setInterval(function () {
    var container = findTabContainer();
    if (!container) return;
    var btns = container.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === label) {
        clearInterval(timer);
        autoClicking = true;
        btns[i].click();
        autoClicking = false;
        var url = new URL(location.href);
        url.searchParams.delete(PARAM);
        history.replaceState(null, '', url.toString());
        return;
      }
    }
  }, 700);
})();

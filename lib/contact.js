// lib/contact.js
// Shared server-side pieces of the "Contact us" widget: validation, the email
// body, and where the message is stored. Used by both server.js (local/Express)
// and the Vercel serverless function in api/contact.js, the same way
// lib/email-providers.js is shared.

// Mirrors the client-side check in contact-widget.js. The browser copy is for
// fast feedback only - this one is the actual gate.
function normalizeMobile(v) {
  let digits = String(v || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

const LIMITS = { name: 100, subject: 120, brief: 2000, email: 200 };

function validateContact(body) {
  const errors = [];
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const subject = String(body.subject || '').trim();
  const brief = String(body.brief || '').trim();
  const mobile = normalizeMobile(body.mobile);

  if (name.length < 2) errors.push('Please enter your name.');
  if (!/^[6-9]\d{9}$/.test(mobile)) errors.push('Enter a valid 10-digit Indian mobile number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push('Enter a valid email address.');
  if (!subject) errors.push('Please enter a subject.');
  if (brief.length < 10) errors.push('Please tell us how we can help.');

  for (const [field, max] of Object.entries(LIMITS)) {
    const value = { name, email, subject, brief }[field];
    if (value && value.length > max) errors.push(`${field} is too long.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    data: { name, mobile, email, subject, brief: brief.slice(0, LIMITS.brief) },
  };
}

// Everything here reaches an inbox as HTML, so escape before interpolating -
// the values come straight from an anonymous, unauthenticated form.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function buildContactEmail(d, receivedAt) {
  const rows = [
    ['Name', d.name],
    ['Mobile', d.mobile],
    ['Email', d.email],
    ['Subject', d.subject],
    ['Received', receivedAt],
  ];
  const html =
    `<p><strong>New message from the BlockMyCard contact form.</strong></p>` +
    `<table cellpadding="6" style="border-collapse:collapse">` +
    rows.map(([k, v]) => `<tr><td style="font-weight:700">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('') +
    `</table>` +
    `<p style="margin-top:1rem"><strong>Brief</strong></p>` +
    `<p style="white-space:pre-wrap">${escapeHtml(d.brief)}</p>`;
  const text =
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nBrief:\n${d.brief}`;

  return { subject: `[Contact] ${d.subject}`, html, text };
}

// Every contact message goes to the published support address - the same one
// shown on the site, the Trust & Security page and in the privacy policy.
// CONTACT_TO_EMAIL overrides it for staging or a temporary redirect.
//
// This used to fall back to whichever sender address the connected provider
// happened to use, and returned null when none was set - so with no provider
// configured, messages were stored and silently never delivered. A constant
// removes that failure mode: the address is always valid, independent of the
// Email Integrations config.
const DEFAULT_CONTACT_TO = 'support@blockmycard.in';

function contactRecipient() {
  return process.env.CONTACT_TO_EMAIL || DEFAULT_CONTACT_TO;
}

// Sortable, and unique enough that two submissions in the same millisecond
// cannot overwrite each other in kv_store.
function storageKey(receivedAt) {
  return `contact:${receivedAt}:${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { validateContact, buildContactEmail, contactRecipient, storageKey, normalizeMobile };

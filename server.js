require('dotenv').config({ path: '.env.db' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { checkAdminKey } = require('./lib/admin-auth');
const { getSettings, saveSettings, claimLoginEmail } = require('./lib/email-settings-store');
const { sendEmail, maskSettings } = require('./lib/email-providers');

const app = express();
app.use(cors());
app.use(express.json());

// ── Supabase client ──
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Key loaded:', !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey);

// ── Storage API (mimics Vercel KV window.storage) ──
app.get('/api/storage', async (req, res) => {
  const { key } = req.query;
  if (!key) {
    const { data } = await supabase.from('kv_store').select('key');
    return res.json({ keys: (data || []).map(r => r.key) });
  }
  const { data } = await supabase.from('kv_store').select('value').eq('key', key).single();
  if (!data) return res.json(null);
  res.json({ key, value: data.value });
});

app.post('/api/storage', async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  const { error } = await supabase
    .from('kv_store')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ key, value });
});

app.delete('/api/storage', async (req, res) => {
  const { key } = req.query;
  await supabase.from('kv_store').delete().eq('key', key);
  res.json({ key, deleted: true });
});

app.get('/api/storage/list', async (req, res) => {
  const { prefix } = req.query;
  let query = supabase.from('kv_store').select('key');
  if (prefix) query = query.like('key', prefix + '%');
  const { data } = await query;
  res.json({ keys: (data || []).map(r => r.key) });
});

// ── OTP routes ──
app.post('/api/send-otp', async (req, res) => {
  const { phone } = req.body;
  // Server decision only - a client-supplied dummyMode let any caller skip
  // OTP verification for any phone number.
  const isDummy = process.env.OTP_MODE === 'dummy';
  if (isDummy) {
    const token = 'dummy-' + Date.now();
    await supabase.from('kv_store').upsert(
      { key: 'otp:' + phone, value: JSON.stringify({ token, otp: '1234', expires: Date.now() + 600000 }) },
      { onConflict: 'key' }
    );
    console.log('[OTP] Dummy - phone: ' + phone + ', OTP: 1234');
    return res.json({ token, message: 'Dummy mode: OTP is 1234' });
  }
  try {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const token = 'live-' + Date.now();
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    await twilio.messages.create({
      body: 'Your BlockMyCard OTP is: ' + otp,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    await supabase.from('kv_store').upsert(
      { key: 'otp:' + phone, value: JSON.stringify({ token, otp, expires: Date.now() + 600000 }) },
      { onConflict: 'key' }
    );
    res.json({ token });
  } catch (e) {
    console.error('[OTP] Error:', e.message);
    res.status(500).json({ error: 'Could not send OTP' });
  }
});

app.post('/api/verify-otp', async (req, res) => {
  const { phone, otp, token } = req.body;
  const { data } = await supabase.from('kv_store').select('value').eq('key', 'otp:' + phone).single();
  if (!data) return res.status(400).json({ success: false, error: 'No OTP sent for this number' });
  const entry = JSON.parse(data.value);
  if (Date.now() > entry.expires) return res.status(400).json({ success: false, error: 'OTP expired' });
  if (otp !== entry.otp || token !== entry.token) return res.status(400).json({ success: false, error: 'Incorrect OTP' });
  await supabase.from('kv_store').delete().eq('key', 'otp:' + phone);
  res.json({ success: true });
});

// ── Email integrations (Brevo / AWS SES / Gmail) ──
const WRITABLE_EMAIL_FIELDS = [
  'active_provider',
  'brevo_api_key', 'brevo_from_email', 'brevo_from_name',
  'ses_access_key_id', 'ses_secret_access_key', 'ses_region', 'ses_from_email',
  'gmail_address', 'gmail_app_password', 'gmail_from_name',
];

app.get('/api/email-settings', async (req, res) => {
  const auth = checkAdminKey(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });
  try {
    const row = await getSettings(supabase);
    res.json(maskSettings(row));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/email-settings', async (req, res) => {
  const auth = checkAdminKey(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });
  const body = req.body || {};
  const patch = {};
  for (const f of WRITABLE_EMAIL_FIELDS) {
    if (body[f] !== undefined && body[f] !== '') patch[f] = body[f];
  }
  if (body.active_provider === null) patch.active_provider = null;
  try {
    const row = await saveSettings(supabase, patch);
    res.json(maskSettings(row));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/email-settings/test', async (req, res) => {
  const auth = checkAdminKey(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });
  const { to, provider } = req.body || {};
  if (!to) return res.status(400).json({ error: 'A recipient email ("to") is required.' });
  try {
    const cfg = await getSettings(supabase);
    if (!cfg) return res.status(400).json({ error: 'No email provider has been configured yet.' });
    const result = await sendEmail(cfg, provider, {
      to,
      subject: 'BlockMyCard test email',
      html: '<p>This is a test email from your BlockMyCard admin console. If you got this, the connection works.</p>',
      text: 'This is a test email from your BlockMyCard admin console. If you got this, the connection works.',
    });
    res.json({ success: true, provider: result.provider });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const loginEmailRateLimit = new Map();
function isLoginEmailRateLimited(phone) {
  const now = Date.now();
  const windowMs = 3 * 60 * 1000;
  const hits = (loginEmailRateLimit.get(phone) || []).filter((t) => now - t < windowMs);
  if (hits.length >= 2) return true;
  hits.push(now);
  loginEmailRateLimit.set(phone, hits);
  return false;
}

// Wording differs by event: a signup is expected and reassuring, a login on an
// existing account is the one worth flagging as "wasn't you?".
function buildLoginEmailMessage(event, user, phone, ts) {
  const greeting = `Hi${user.name ? ' ' + user.name : ''},`;
  if (event === 'registered') {
    return {
      subject: 'Your BlockMyCard account is ready',
      html: `<p>${greeting}</p><p>Your BlockMyCard account (${phone}) was created on ${ts}.</p><p>You can now save your card details so you can block them quickly if your wallet or phone is ever lost.</p>`,
      text: `Your BlockMyCard account (${phone}) was created on ${ts}. You can now save your card details so you can block them quickly if your wallet or phone is ever lost.`,
    };
  }
  return {
    subject: 'New login to your BlockMyCard account',
    html: `<p>${greeting}</p><p>Your BlockMyCard account (${phone}) was just logged into at ${ts}.</p><p>If this wasn't you, we recommend checking your saved cards and contact details right away.</p>`,
    text: `Your BlockMyCard account (${phone}) was just logged into at ${ts}. If this wasn't you, check your saved cards and contact details.`,
  };
}

app.post('/api/login-email', async (req, res) => {
  const { phone, ts, event } = req.body || {};
  if (!phone || !ts) return res.json({ ok: true });
  if (isLoginEmailRateLimited(phone)) return res.json({ ok: true });
  try {
    const claimed = await claimLoginEmail(supabase, phone, String(ts));
    if (!claimed) return res.json({ ok: true });
    const cfg = await getSettings(supabase);
    if (!cfg || !cfg.active_provider) return res.json({ ok: true });
    const { data } = await supabase.from('kv_store').select('value').eq('key', 'cbp:users').single();
    if (!data) return res.json({ ok: true });
    const users = JSON.parse(data.value);
    const user = users[phone];
    if (!user || !user.email) return res.json({ ok: true });
    await sendEmail(cfg, null, Object.assign({ to: user.email }, buildLoginEmailMessage(event, user, phone, ts)));
    res.json({ ok: true });
  } catch (e) {
    console.error('[login-email] error:', e.message);
    res.json({ ok: true });
  }
});

// ── Inject storage bridge into index.html ──
function sendApp(req, res) {
  let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const bridge = '<script>\n(function() {\n  window.__bmc_dummy_mode = true;\n  window.storage = {\n    get: async function(key) {\n      try { const r = await fetch(\'/api/storage?key=\' + encodeURIComponent(key)); if (!r.ok) return null; return r.json(); } catch(e) { return null; }\n    },\n    set: async function(key, value) {\n      try { const r = await fetch(\'/api/storage\', { method: \'POST\', headers: {\'Content-Type\':\'application/json\'}, body: JSON.stringify({ key, value }) }); return r.json(); } catch(e) { return null; }\n    },\n    delete: async function(key) {\n      try { const r = await fetch(\'/api/storage?key=\' + encodeURIComponent(key), { method: \'DELETE\' }); return r.json(); } catch(e) { return null; }\n    },\n    list: async function(prefix) {\n      try { const url = \'/api/storage/list\' + (prefix ? \'?prefix=\' + encodeURIComponent(prefix) : \'\'); const r = await fetch(url); return r.json(); } catch(e) { return { keys: [] }; }\n    }\n  };\n})();\n</script>';
  html = html.replace('<head>', '<head>' + bridge);
  res.send(html);
}
app.get('/', sendApp);

// ── Static files ──
app.use(express.static(__dirname));

// ── SPA fallback: unmatched routes like /login or /dashboard render the app instead of a raw 404 ──
app.get(/^\/(?!api\/).*/, sendApp);

const PORT = 3000;
app.listen(PORT, async () => {
  console.log('');
  console.log('  BlockMyCard running at http://localhost:' + PORT);
  console.log('  Supabase: ' + supabaseUrl);
  console.log('  OTP mode: DUMMY (use 1234)');
  console.log('');

  // Check if kv_store table exists
  const { error } = await supabase.from('kv_store').select('key').limit(1);
  if (error && error.code === '42P01') {
    console.log('  WARNING: kv_store table missing!');
    console.log('  Run this in Supabase SQL editor:');
    console.log('  CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());');
  } else if (error) {
    console.log('  DB error:', error.message);
  } else {
    console.log('  Database: Supabase kv_store OK');
  }

  // Check if the email-integration tables exist
  const { error: emailErr } = await supabase.from('email_settings').select('id').limit(1);
  if (emailErr && (emailErr.code === '42P01' || emailErr.code === 'PGRST205')) {
    console.log('  WARNING: email_settings/login_email_log tables missing!');
    console.log('  Run this in Supabase SQL editor:');
    console.log(`  CREATE TABLE email_settings (
    id INT PRIMARY KEY DEFAULT 1, active_provider TEXT,
    brevo_api_key TEXT, brevo_from_email TEXT, brevo_from_name TEXT,
    ses_access_key_id TEXT, ses_secret_access_key TEXT, ses_region TEXT, ses_from_email TEXT,
    gmail_address TEXT, gmail_app_password TEXT, gmail_from_name TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(), CONSTRAINT email_settings_singleton CHECK (id = 1));
  ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
  CREATE TABLE login_email_log (phone TEXT NOT NULL, ts TEXT NOT NULL, sent_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (phone, ts));
  ALTER TABLE login_email_log ENABLE ROW LEVEL SECURITY;`);
  } else if (!emailErr) {
    console.log('  Database: email_settings/login_email_log OK');
  }
  if (!process.env.ADMIN_API_SECRET) {
    console.log('  WARNING: ADMIN_API_SECRET is not set - email integration admin endpoints will reject all requests.');
  }
});
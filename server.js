require('dotenv').config({ path: '.env.db' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

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
  const { phone, dummyMode } = req.body;
  const isDummy = dummyMode || process.env.OTP_MODE === 'dummy';
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
});
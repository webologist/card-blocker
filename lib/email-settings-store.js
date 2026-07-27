// lib/email-settings-store.js
// Reads/writes the single email_settings row (id=1) and the login_email_log
// idempotency table, via a Supabase service-role client passed in by the caller.

async function getSettings(supabase) {
  const { data, error } = await supabase.from('email_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data || null;
}

// Only overwrites fields present in `patch` - lets the admin update one
// provider's from-name without retyping another provider's secret.
async function saveSettings(supabase, patch) {
  const row = { id: 1, ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('email_settings').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return getSettings(supabase);
}

// Atomic "have we already emailed this login" check via the (phone, ts)
// primary key - an insert that succeeds means this is the first time we've
// seen this exact login log entry; a conflict means a duplicate poll/tab.
async function claimLoginEmail(supabase, phone, ts) {
  const { error } = await supabase.from('login_email_log').insert({ phone, ts });
  if (error) {
    if (error.code === '23505') return false; // unique_violation - already claimed
    throw error;
  }
  return true;
}

module.exports = { getSettings, saveSettings, claimLoginEmail };

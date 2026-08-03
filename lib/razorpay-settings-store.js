// lib/razorpay-settings-store.js
// Manages Razorpay configuration settings via a single Supabase row (id=1)

async function getSettings(supabase) {
  const { data, error } = await supabase.from('razorpay_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveSettings(supabase, patch) {
  const row = { id: 1, ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('razorpay_settings').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return getSettings(supabase);
}

// Helper to mask sensitive API keys for display
function maskSettings(settings) {
  if (!settings) return null;
  return {
    ...settings,
    razorpay_key_id: settings.razorpay_key_id ? settings.razorpay_key_id.slice(0, 8) + '***' : null,
    razorpay_key_secret: settings.razorpay_key_secret ? '***' + settings.razorpay_key_secret.slice(-4) : null
  };
}

module.exports = { getSettings, saveSettings, maskSettings };

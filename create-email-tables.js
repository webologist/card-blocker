require('dotenv').config({ path: '.env.db' });

async function createTables() {
  const dbUrl = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!dbUrl) {
    console.log('No POSTGRES_URL found in .env.db');
    process.exit(1);
  }
  const { Client } = require('pg');
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to postgres!');

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.email_settings (
      id INT PRIMARY KEY DEFAULT 1,
      active_provider TEXT,
      brevo_api_key TEXT,
      brevo_from_email TEXT,
      brevo_from_name TEXT,
      ses_access_key_id TEXT,
      ses_secret_access_key TEXT,
      ses_region TEXT,
      ses_from_email TEXT,
      gmail_address TEXT,
      gmail_app_password TEXT,
      gmail_from_name TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT email_settings_singleton CHECK (id = 1)
    );
    ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

    CREATE TABLE IF NOT EXISTS public.login_email_log (
      phone TEXT NOT NULL,
      ts TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (phone, ts)
    );
    ALTER TABLE public.login_email_log ENABLE ROW LEVEL SECURITY;
  `);

  console.log('Tables created: email_settings, login_email_log (RLS enabled, no policies -> service-role only).');
  await client.end();
}

createTables().catch((e) => { console.error('Error:', e.message); process.exit(1); });

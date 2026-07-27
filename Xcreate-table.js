require('dotenv').config({ path: '.env.db' });
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.SUPABASE_URL;
const dbUrl = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

console.log('DB URL available:', !!dbUrl);
console.log('Supabase URL:', url);

// Use Supabase's management API via the database direct REST
// Try creating via pg extension endpoint
async function createTable() {
  // Method: Use supabase's built-in pg endpoint
  const endpoints = [
    '/pg/query',
    '/rest/v1/',
  ];

  // Try using postgres.js or pg directly if POSTGRES_URL is available
  if (dbUrl) {
    console.log('Trying direct postgres connection...');
    try {
      const { Client } = require('pg');
      const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      console.log('Connected to postgres!');
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.kv_store (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        ALTER TABLE public.kv_store DISABLE ROW LEVEL SECURITY;
      `);
      console.log('✅ Table created successfully!');
      await client.end();
    } catch(e) {
      console.log('pg error:', e.message);
    }
  } else {
    console.log('No POSTGRES_URL found in .env.db');
    console.log('Please add it - check your .env.db for POSTGRES_URL or POSTGRES_URL_NON_POOLING');
  }
}

createTable();
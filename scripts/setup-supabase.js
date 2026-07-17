const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const connectionString =
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL, DATABASE_URL, or POSTGRES_URL.');
  console.error('Copy the Supabase Postgres connection string into .env, then run npm run setup-db.');
  process.exit(1);
}

const schemaPath = path.join(__dirname, '../supabase/schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

const client = new Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

(async () => {
  try {
    await client.connect();
    await client.query(schema);
    console.log('Supabase schema applied successfully.');
  } catch (error) {
    console.error('Failed to apply Supabase schema:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();

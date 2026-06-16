require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration() {
  console.log('Starting migration execution on Neon PostgreSQL...');
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Error: DATABASE_URL is not set in the environment variables.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    const migrationPath = path.join(__dirname, 'migrations.sql');
    console.log(`Reading SQL file from: ${migrationPath}`);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Connecting to database...');
    const client = await pool.connect();
    
    try {
      console.log('Executing migration script commands...');
      await client.query(sql);
      console.log('Migration completed successfully! All tables and indexes are created.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Migration failed with error:', error);
  } finally {
    await pool.end();
    console.log('Database pool closed.');
  }
}

runMigration();

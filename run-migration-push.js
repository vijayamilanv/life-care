require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrationPush() {
  console.log('Running Push Notification Migrations on Neon PostgreSQL...');
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Error: DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const migrationPath = path.join(__dirname, 'migrations_push.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Connecting to database...');
    const client = await pool.connect();
    
    try {
      console.log('Executing push migration script...');
      await client.query(sql);
      console.log('Push migration completed successfully! Table push_subscriptions is active.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Push migration failed with error:', error);
  } finally {
    await pool.end();
    console.log('Database connection closed.');
  }
}

runMigrationPush();

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrationNational() {
  console.log('Running National Smart Dispatch Database Migrations on Neon PostgreSQL...');
  
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
    const migrationPath = path.join(__dirname, 'migrations_national.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Connecting to database...');
    const client = await pool.connect();
    
    try {
      console.log('Executing national platform migrations...');
      await client.query(sql);
      console.log('National migrations completed successfully! All extended tables, indexes, and logs are created.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('National migration failed with error:', error);
  } finally {
    await pool.end();
    console.log('Database connection pool closed.');
  }
}

runMigrationNational();

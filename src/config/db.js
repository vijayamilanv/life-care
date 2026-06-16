require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon serverless database connection
  }
});

// Test connection when database helper is loaded (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('Error connecting to Neon database:', err.message);
    } else {
      console.log('Successfully connected to Neon PostgreSQL at', res.rows[0].now);
    }
  });
}


module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

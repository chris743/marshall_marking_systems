const sql = require('mssql');

// SQL Server configuration from environment variables
const config = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER || 'RDGW-CF',
  database: process.env.SQL_DATABASE || 'DM02',
  options: {
    encrypt: false, // Use true if connecting to Azure
    trustServerCertificate: true, // Trust self-signed certs for local dev
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Connection pool
let pool = null;

// Initialize connection pool
async function getPool() {
  if (!pool) {
    try {
      pool = await sql.connect(config);
      console.log('Connected to SQL Server:', config.server);
    } catch (err) {
      console.error('SQL Server connection error:', err.message);
      throw err;
    }
  }
  return pool;
}

// Check if database is configured
function isConfigured() {
  return !!(process.env.SQL_USER && process.env.SQL_PASSWORD && process.env.SQL_SERVER);
}

// Check if database pool is connected
function isConnected() {
  return pool !== null && pool.connected;
}

// Export
module.exports = {
  sql,
  getPool,
  isConfigured,
  isConnected,
};

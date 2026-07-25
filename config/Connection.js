// config/Connection.js
const sql = require("mssql");

const serverEnv = process.env.DB_HOST || "127.0.0.1";
// Asegúrate de parsear el puerto correctamente
const portEnv = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433;

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: serverEnv,
  port: portEnv,
  database: process.env.DB_NAME,
  options: {
    // CAMBIO IMPORTANTE: Para Azure/GCP se recomienda encrypt: true
    encrypt: true, 
    // ESTO ES VITAL: Confiar en el certificado de Google
    trustServerCertificate: true, 
    // Aumentar el timeout de conexión ayuda en redes lentas
    connectTimeout: 30000 
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool;

async function getConnection() {
  if (pool) {
    console.log(`[MSSQL] Reusing pool -> server: ${config.server}`);
    return pool;
  }

  console.log(`[MSSQL] Attempting connection -> server: ${config.server}:${config.port}`);
  try {
    pool = await sql.connect(config);
    if (pool && typeof pool.on === "function") {
      pool.on("error", (err) => {
        console.error("[MSSQL] Pool error:", err);
      });
    }
    console.log(`[MSSQL] Connected ✅ -> server: ${config.server} | database: ${config.database}`);
    return pool;
  } catch (error) {
    console.error(`[MSSQL] Connection failed ❌`);
    console.error(error);
    throw error;
  }
}

module.exports = { sql, getConnection };
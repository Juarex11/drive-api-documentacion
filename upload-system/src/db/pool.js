// src/db/pool.js
// -----------------------------------------------------------------------
// Maneja un unico pool de conexiones a SQL Server, reutilizado por toda
// la app (API y worker). Usa autenticacion SQL (usuario/contraseña),
// no autenticacion de Windows.
// -----------------------------------------------------------------------

require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,      // ej: "localhost\\MSSQLSERVER02"
  database: process.env.DB_DATABASE,  // "UploadSystem"
  user: process.env.DB_USER,          // "app_upload_user"
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
  options: {
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
    encrypt: true,
  },
};

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config).then((pool) => {
      console.log('Conectado a SQL Server:', config.server, '/', config.database);
      return pool;
    }).catch((err) => {
      poolPromise = null; // permite reintentar si fallo
      throw err;
    });
  }
  return poolPromise;
}

module.exports = { getPool, sql };

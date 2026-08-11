// scripts/test-db-connection.js
// -----------------------------------------------------------------------
// PRUEBA AISLADA: solo confirma que Node puede conectarse a SQL Server
// y leer/escribir en la tabla Uploads. No toca Google API.
//
// Como correrlo:
//   node scripts/test-db-connection.js
// -----------------------------------------------------------------------

require('dotenv').config();
const { getPool, sql } = require('../src/db/pool');

async function main() {
  console.log('Intentando conectar a SQL Server...');
  const pool = await getPool();

  console.log('Conexion exitosa. Probando SELECT...');
  const result = await pool.request().query('SELECT COUNT(*) AS total FROM dbo.Uploads');
  console.log(`Filas actuales en Uploads: ${result.recordset[0].total}`);

  console.log('Probando INSERT de prueba...');
  await pool.request()
    .input('filePath', sql.NVarChar, 'C:\\prueba\\archivo-test.txt')
    .input('fileName', sql.NVarChar, 'archivo-test.txt')
    .input('fileSize', sql.BigInt, 12345)
    .query(`
      INSERT INTO dbo.Uploads (FilePath, FileName, FileSize)
      VALUES (@filePath, @fileName, @fileSize)
    `);

  const result2 = await pool.request().query('SELECT COUNT(*) AS total FROM dbo.Uploads');
  console.log(`Filas despues del INSERT: ${result2.recordset[0].total}`);

  console.log('\nTODO OK. La conexion a SQL Server funciona correctamente.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nERROR al conectar o consultar SQL Server:');
  console.error(err.message);
  process.exit(1);
});

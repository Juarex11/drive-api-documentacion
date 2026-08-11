// scripts/test-upload.js
// -----------------------------------------------------------------------
// PRUEBA DE SUBIDA REAL (archivo pequeno primero).
// Flujo completo: registra el archivo en SQL Server -> inicia sesion
// resumable -> sube por chunks -> actualiza progreso en la BD ->
// marca como completado. Todavia SIN el paso de etiquetado.
//
// Como correrlo:
//   node scripts/test-upload.js "C:\ruta\a\tu\archivo-pequeno.mp4"
// -----------------------------------------------------------------------

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPool, sql } = require('../src/db/pool');
const { getAccessToken } = require('../src/google/auth');
const { startResumableSession, queryUploadStatus } = require('../src/google/uploadSession');
const { uploadChunk } = require('../src/google/chunkUploader');

const CHUNK_SIZE = (parseInt(process.env.CHUNK_SIZE_MB, 10) || 8) * 1024 * 1024;

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: node scripts/test-upload.js "C:\\ruta\\al\\archivo.ext"');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`No se encontro el archivo: ${filePath}`);
    process.exit(1);
  }

  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;
  console.log(`Archivo: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);

  const pool = await getPool();

  // 1) Registrar el archivo en la base de datos como "uploading"
  const insertResult = await pool.request()
    .input('filePath', sql.NVarChar, filePath)
    .input('fileName', sql.NVarChar, fileName)
    .input('fileSize', sql.BigInt, fileSize)
    .query(`
      INSERT INTO dbo.Uploads (FilePath, FileName, FileSize, Status)
      OUTPUT INSERTED.Id
      VALUES (@filePath, @fileName, @fileSize, 'uploading')
    `);
  const uploadId = insertResult.recordset[0].Id;
  console.log(`Registrado en BD con Id=${uploadId}`);

  // 2) Autenticar y arrancar sesion resumable
  const accessToken = await getAccessToken();
  const sessionUri = await startResumableSession(accessToken, fileName, fileSize);
  console.log('Sesion resumable iniciada.');

  await pool.request()
    .input('id', sql.Int, uploadId)
    .input('sessionUri', sql.NVarChar, sessionUri)
    .query(`
      UPDATE dbo.Uploads
      SET SessionUri = @sessionUri, SessionCreatedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @id
    `);

  // 3) Subir por chunks, actualizando el offset en la BD cada vez
  const fd = fs.openSync(filePath, 'r');
  let offset = 0;

  try {
    while (offset < fileSize) {
      const remaining = fileSize - offset;
      const currentChunkSize = Math.min(CHUNK_SIZE, remaining);
      const buffer = Buffer.alloc(currentChunkSize);
      fs.readSync(fd, buffer, 0, currentChunkSize, offset);

      const start = offset;
      const end = offset + currentChunkSize - 1;

      const result = await uploadChunk(sessionUri, buffer, start, end, fileSize);
      offset = end + 1;

      await pool.request()
        .input('id', sql.Int, uploadId)
        .input('offset', sql.BigInt, offset)
        .query(`
          UPDATE dbo.Uploads
          SET FileOffset = @offset, UpdatedAt = SYSUTCDATETIME()
          WHERE Id = @id
        `);

      const pct = ((offset / fileSize) * 100).toFixed(1);
      console.log(`Progreso: ${pct}% (${offset}/${fileSize} bytes)`);

      if (result.done) {
        const driveFileId = result.file.id;
        console.log(`\nSubida completa. Drive file id: ${driveFileId}`);

        await pool.request()
          .input('id', sql.Int, uploadId)
          .input('driveFileId', sql.NVarChar, driveFileId)
          .query(`
            UPDATE dbo.Uploads
            SET Status = 'completed', DriveFileId = @driveFileId, UpdatedAt = SYSUTCDATETIME()
            WHERE Id = @id
          `);

        break;
      }
    }
  } catch (err) {
    await pool.request()
      .input('id', sql.Int, uploadId)
      .input('lastError', sql.NVarChar, err.message)
      .query(`
        UPDATE dbo.Uploads
        SET Status = 'failed', LastError = @lastError, RetryCount = RetryCount + 1, UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @id
      `);
    throw err;
  } finally {
    fs.closeSync(fd);
  }

  console.log('\nTODO OK. Revisa tu Google Drive para confirmar que el archivo aparecio.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nERROR durante la subida:');
  console.error(err.message);
  process.exit(1);
});

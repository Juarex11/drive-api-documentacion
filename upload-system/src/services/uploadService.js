// src/services/uploadService.js
// -----------------------------------------------------------------------
// Logica de subida reutilizable, extraida de scripts/test-upload.js para
// poder dispararla tanto desde la terminal como desde la API (dashboard).
// -----------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { getPool, sql } = require('../db/pool');
const { getAccessToken } = require('../google/auth');
const { startResumableSession, queryUploadStatus } = require('../google/uploadSession');
const { uploadChunk } = require('../google/chunkUploader');
const { applyLabel } = require('../google/labelApplier');

const CHUNK_SIZE = (parseInt(process.env.CHUNK_SIZE_MB, 10) || 8) * 1024 * 1024;

// Registra el archivo en la BD y devuelve el Id. No sube nada todavia.
async function registerUpload(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontro el archivo en el servidor: ${filePath}`);
  }
  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;

  const pool = await getPool();
  const result = await pool.request()
    .input('filePath', sql.NVarChar, filePath)
    .input('fileName', sql.NVarChar, fileName)
    .input('fileSize', sql.BigInt, fileSize)
    .query(`
      INSERT INTO dbo.Uploads (FilePath, FileName, FileSize, Status)
      OUTPUT INSERTED.Id
      VALUES (@filePath, @fileName, @fileSize, 'pending')
    `);
  return { id: result.recordset[0].Id, fileName, fileSize };
}

// Corre la subida completa para un registro ya creado. Se puede llamar
// en segundo plano (sin await desde el caller) para no bloquear la
// respuesta HTTP mientras sube un archivo grande.
async function runUpload(uploadId, filePath, folderId = null) {
  const pool = await getPool();
  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;

  await pool.request()
    .input('id', sql.Int, uploadId)
    .query(`UPDATE dbo.Uploads SET Status = 'uploading', UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`);

  try {
    const accessToken = await getAccessToken();
    const sessionUri = await startResumableSession(accessToken, fileName, fileSize, 'application/octet-stream', folderId);

    await pool.request()
      .input('id', sql.Int, uploadId)
      .input('sessionUri', sql.NVarChar, sessionUri)
      .query(`
        UPDATE dbo.Uploads
        SET SessionUri = @sessionUri, SessionCreatedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @id
      `);

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
          .query(`UPDATE dbo.Uploads SET FileOffset = @offset, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`);

        if (result.done) {
          const driveFileId = result.file.id;

          await pool.request()
            .input('id', sql.Int, uploadId)
            .input('driveFileId', sql.NVarChar, driveFileId)
            .query(`
              UPDATE dbo.Uploads
              SET Status = 'labeling', DriveFileId = @driveFileId, UpdatedAt = SYSUTCDATETIME()
              WHERE Id = @id
            `);

          // Aplica el label por defecto (Pendiente) automaticamente al terminar
          try {
            await applyLabel(accessToken, driveFileId);
            await pool.request()
              .input('id', sql.Int, uploadId)
              .query(`
                UPDATE dbo.Uploads
                SET Status = 'completed', LabelApplied = 1, UpdatedAt = SYSUTCDATETIME()
                WHERE Id = @id
              `);
          } catch (labelErr) {
            // La subida SI se completo, solo fallo el label - no lo marcamos como failed total
            await pool.request()
              .input('id', sql.Int, uploadId)
              .input('lastError', sql.NVarChar, `Subido pero fallo el label: ${labelErr.message}`)
              .query(`
                UPDATE dbo.Uploads
                SET Status = 'completed', LabelApplied = 0, LastError = @lastError, UpdatedAt = SYSUTCDATETIME()
                WHERE Id = @id
              `);
          }
          break;
        }
      }
    } finally {
      fs.closeSync(fd);
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
  }
}

module.exports = { registerUpload, runUpload };

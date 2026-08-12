// src/services/uploadService.js
// -----------------------------------------------------------------------
// Logica de subida con resiliencia ante cortes de red:
//   1) Reintentos automaticos con espera creciente (backoff) para cortes
//      breves durante la misma ejecucion.
//   2) Reanudacion real al usar "Reintentar": en vez de empezar de cero,
//      le pregunta a Google en que byte quedo realmente antes de seguir
//      (mientras la sesion siga viva, dentro de la ventana de 7 dias).
// -----------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { getPool, sql } = require('../db/pool');
const { getAccessToken } = require('../google/auth');
const { startResumableSession, queryUploadStatus } = require('../google/uploadSession');
const { uploadChunk } = require('../google/chunkUploader');
const { applyLabel } = require('../google/labelApplier');
const { isPauseRequested, clearPause } = require('./pauseRegistry');

const CHUNK_SIZE = (parseInt(process.env.CHUNK_SIZE_MB, 10) || 8) * 1024 * 1024;
const MAX_SESSION_DAYS = parseInt(process.env.UPLOAD_SESSION_MAX_DAYS, 10) || 7;
const MAX_CHUNK_RETRIES = 6; // ~1+2+4+8+16+32 seg de espera acumulada antes de rendirse

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sube un chunk, reintentando con espera creciente (backoff exponencial +
// jitter) ante fallas transitorias (Wi-Fi que parpadea, timeout, etc.)
async function uploadChunkWithRetry(sessionUri, buffer, start, end, fileSize) {
  let attempt = 0;
  while (true) {
    try {
      return await uploadChunk(sessionUri, buffer, start, end, fileSize);
    } catch (err) {
      attempt++;
      if (attempt > MAX_CHUNK_RETRIES) throw err;
      const waitMs = Math.min(30000, 1000 * 2 ** attempt) + Math.random() * 500;
      console.log(`Chunk fallo (intento ${attempt}/${MAX_CHUNK_RETRIES}), reintentando en ${Math.round(waitMs)}ms: ${err.message}`);
      await sleep(waitMs);
    }
  }
}

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

async function runUpload(uploadId, filePath, folderId = null) {
  const pool = await getPool();
  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;

  // Revisa si ya existe una sesion previa (caso "Reintentar" de una subida
  // que se corto) para decidir si reanudamos o empezamos de cero.
  const existing = await pool.request()
    .input('id', sql.Int, uploadId)
    .query('SELECT SessionUri, SessionCreatedAt FROM dbo.Uploads WHERE Id = @id');
  const prevSessionUri = existing.recordset[0]?.SessionUri;
  const prevSessionCreatedAt = existing.recordset[0]?.SessionCreatedAt;

  await pool.request()
    .input('id', sql.Int, uploadId)
    .query(`UPDATE dbo.Uploads SET Status = 'uploading', UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`);

  console.log(`[Upload ${uploadId}] Iniciando: ${fileName} (${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB)`);

  try {
    const accessToken = await getAccessToken();
    let sessionUri = prevSessionUri;
    let offset = 0;

    const sessionAgeDays = prevSessionCreatedAt
      ? (Date.now() - new Date(prevSessionCreatedAt).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (!sessionUri || sessionAgeDays >= MAX_SESSION_DAYS) {
      // Sin sesion previa, o la sesion vieja ya expiro (>7 dias) - arrancamos limpio.
      sessionUri = await startResumableSession(accessToken, fileName, fileSize, 'application/octet-stream', folderId);
      await pool.request()
        .input('id', sql.Int, uploadId)
        .input('sessionUri', sql.NVarChar, sessionUri)
        .query(`
          UPDATE dbo.Uploads
          SET SessionUri = @sessionUri, SessionCreatedAt = SYSUTCDATETIME(), FileOffset = 0, UpdatedAt = SYSUTCDATETIME()
          WHERE Id = @id
        `);
    } else {
      // Hay sesion viva - reconciliamos con Google el byte real antes de
      // seguir (no confiamos ciegamente en lo que dice nuestra BD local).
      try {
        const status = await queryUploadStatus(sessionUri, fileSize);
        if (status && status.completed) {
          offset = fileSize; // ya estaba completo, solo falta el label
        } else if (typeof status === 'number') {
          offset = status;
          console.log(`[Upload ${uploadId}] Reanudando ${fileName} desde el byte ${offset} de ${fileSize} (${((offset / fileSize) * 100).toFixed(2)}%)`);
        }
      } catch (reconcileErr) {
        // La sesion vieja ya no responde bien - reiniciamos desde cero por seguridad.
        console.log(`No se pudo reanudar la sesion anterior (${reconcileErr.message}), reiniciando desde cero.`);
        sessionUri = await startResumableSession(accessToken, fileName, fileSize, 'application/octet-stream', folderId);
        offset = 0;
        await pool.request()
          .input('id', sql.Int, uploadId)
          .input('sessionUri', sql.NVarChar, sessionUri)
          .query(`
            UPDATE dbo.Uploads
            SET SessionUri = @sessionUri, SessionCreatedAt = SYSUTCDATETIME(), FileOffset = 0, UpdatedAt = SYSUTCDATETIME()
            WHERE Id = @id
          `);
      }

      await pool.request()
        .input('id', sql.Int, uploadId)
        .input('offset', sql.BigInt, offset)
        .query(`UPDATE dbo.Uploads SET FileOffset = @offset, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`);
    }

    const fd = fs.openSync(filePath, 'r');

    try {
      while (offset < fileSize) {
        const remaining = fileSize - offset;
        const currentChunkSize = Math.min(CHUNK_SIZE, remaining);
        const buffer = Buffer.alloc(currentChunkSize);
        fs.readSync(fd, buffer, 0, currentChunkSize, offset);

        const start = offset;
        const end = offset + currentChunkSize - 1;
        const result = await uploadChunkWithRetry(sessionUri, buffer, start, end, fileSize);
        offset = end + 1;

        const pct = ((offset / fileSize) * 100).toFixed(2);
        console.log(`[Upload ${uploadId}] ${fileName}: ${pct}% (${offset}/${fileSize} bytes, chunk ${start}-${end})`);

        await pool.request()
          .input('id', sql.Int, uploadId)
          .input('offset', sql.BigInt, offset)
          .query(`UPDATE dbo.Uploads SET FileOffset = @offset, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`);

        if (isPauseRequested(uploadId)) {
          clearPause(uploadId);
          console.log(`[Upload ${uploadId}] Pausado por el usuario en ${((offset / fileSize) * 100).toFixed(2)}% (byte ${offset})`);
          await pool.request()
            .input('id', sql.Int, uploadId)
            .query(`UPDATE dbo.Uploads SET Status = 'paused', UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`);
          return; // se detiene limpio, sin marcar error - se puede reanudar despues
        }

        if (result.done) {
          const driveFileId = result.file.id;
          console.log(`[Upload ${uploadId}] Subida completa: ${fileName} -> Drive file id: ${driveFileId}`);

          await pool.request()
            .input('id', sql.Int, uploadId)
            .input('driveFileId', sql.NVarChar, driveFileId)
            .query(`
              UPDATE dbo.Uploads
              SET Status = 'labeling', DriveFileId = @driveFileId, UpdatedAt = SYSUTCDATETIME()
              WHERE Id = @id
            `);

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
    console.error(`[Upload ${uploadId}] FALLO tras agotar reintentos: ${err.message}`);
    // Se acabaron los reintentos automaticos - queda marcado "failed" pero
    // con SessionUri y FileOffset intactos, listo para reanudar con el
    // boton "Reintentar" (que llama a esta misma funcion y reconcilia).
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
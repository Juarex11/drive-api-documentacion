// src/services/browserUploadService.js
// -----------------------------------------------------------------------
// Flujo paralelo a uploadService.js, pero para archivos que el usuario
// selecciona con el boton "Elegir archivo" del navegador, en vez de una
// ruta en el servidor. El navegador envia el archivo en pedazos (chunks)
// via HTTP, y aqui los reenviamos a la sesion resumable de Google.
// -----------------------------------------------------------------------

const { getPool, sql } = require('../db/pool');
const { getAccessToken } = require('../google/auth');
const { startResumableSession, queryUploadStatus } = require('../google/uploadSession');
const { uploadChunk } = require('../google/chunkUploader');
const { applyLabel } = require('../google/labelApplier');

const MAX_CHUNK_RETRIES = 6;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadChunkWithRetry(sessionUri, buffer, start, end, fileSize) {
  let attempt = 0;
  while (true) {
    try {
      return await uploadChunk(sessionUri, buffer, start, end, fileSize);
    } catch (err) {
      attempt++;
      if (attempt > MAX_CHUNK_RETRIES) throw err;
      const waitMs = Math.min(30000, 1000 * 2 ** attempt) + Math.random() * 500;
      console.log(`Chunk (navegador) fallo (intento ${attempt}/${MAX_CHUNK_RETRIES}), reintentando en ${Math.round(waitMs)}ms: ${err.message}`);
      await sleep(waitMs);
    }
  }
}

async function startBrowserUpload(fileName, fileSize, folderId) {
  const pool = await getPool();

  const insertResult = await pool.request()
    .input('filePath', sql.NVarChar, '(subido desde navegador)')
    .input('fileName', sql.NVarChar, fileName)
    .input('fileSize', sql.BigInt, fileSize)
    .query(`
      INSERT INTO dbo.Uploads (FilePath, FileName, FileSize, Status)
      OUTPUT INSERTED.Id
      VALUES (@filePath, @fileName, @fileSize, 'uploading')
    `);
  const uploadId = insertResult.recordset[0].Id;

  const accessToken = await getAccessToken();
  const sessionUri = await startResumableSession(accessToken, fileName, fileSize, 'application/octet-stream', folderId || null);

  await pool.request()
    .input('id', sql.Int, uploadId)
    .input('sessionUri', sql.NVarChar, sessionUri)
    .query(`
      UPDATE dbo.Uploads
      SET SessionUri = @sessionUri, SessionCreatedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @id
    `);

  return { id: uploadId };
}

async function receiveBrowserChunk(uploadId, chunkBuffer, start, end, totalSize) {
  const pool = await getPool();

  const result = await pool.request()
    .input('id', sql.Int, uploadId)
    .query('SELECT SessionUri, FileSize FROM dbo.Uploads WHERE Id = @id');

  if (result.recordset.length === 0) {
    throw new Error('Upload no encontrado');
  }
  const { SessionUri: sessionUri, FileSize: fileSize } = result.recordset[0];
  if (!sessionUri) {
    throw new Error('Esta subida no tiene sesion activa');
  }

  const uploadResult = await uploadChunkWithRetry(sessionUri, chunkBuffer, start, end, fileSize || totalSize);

  await pool.request()
    .input('id', sql.Int, uploadId)
    .input('offset', sql.BigInt, end + 1)
    .query(`UPDATE dbo.Uploads SET FileOffset = @offset, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`);

  if (uploadResult.done) {
    const driveFileId = uploadResult.file.id;

    await pool.request()
      .input('id', sql.Int, uploadId)
      .input('driveFileId', sql.NVarChar, driveFileId)
      .query(`
        UPDATE dbo.Uploads
        SET Status = 'labeling', DriveFileId = @driveFileId, UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @id
      `);

    try {
      const accessToken = await getAccessToken();
      await applyLabel(accessToken, driveFileId);
      await pool.request()
        .input('id', sql.Int, uploadId)
        .query(`UPDATE dbo.Uploads SET Status = 'completed', LabelApplied = 1, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`);
    } catch (labelErr) {
      await pool.request()
        .input('id', sql.Int, uploadId)
        .input('lastError', sql.NVarChar, `Subido pero fallo el label: ${labelErr.message}`)
        .query(`UPDATE dbo.Uploads SET Status = 'completed', LabelApplied = 0, LastError = @lastError, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`);
    }

    return { done: true, driveFileId };
  }

  return { done: false };
}

// Le pregunta a Google en que byte quedo realmente una subida de navegador
// que se corto (pestaña cerrada, red caida, etc.), para poder continuar
// desde ahi en vez de mandar el archivo completo otra vez.
async function reconcileBrowserUpload(uploadId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, uploadId)
    .query('SELECT SessionUri, FileSize, Status FROM dbo.Uploads WHERE Id = @id');

  if (result.recordset.length === 0) {
    throw new Error('Upload no encontrado');
  }
  const { SessionUri: sessionUri, FileSize: fileSize, Status: status } = result.recordset[0];

  if (status === 'completed') {
    return { completed: true };
  }
  if (!sessionUri) {
    throw new Error('Esta subida no tiene sesion activa, hay que empezarla de nuevo');
  }

  const statusResult = await queryUploadStatus(sessionUri, fileSize);
  if (statusResult && statusResult.completed) {
    return { completed: true };
  }

  const offset = typeof statusResult === 'number' ? statusResult : 0;

  await pool.request()
    .input('id', sql.Int, uploadId)
    .input('offset', sql.BigInt, offset)
    .query(`UPDATE dbo.Uploads SET FileOffset = @offset, Status = 'uploading', UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`);

  return { completed: false, offset };
}

module.exports = { startBrowserUpload, receiveBrowserChunk, reconcileBrowserUpload };
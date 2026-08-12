// src/api/routes.js
const express = require('express');
const { getPool, sql } = require('../db/pool');
const { getAccessToken } = require('../google/auth');
const { createFolder, listFolders } = require('../google/folders');
const { applyLabel, applyLabelGeneric } = require('../google/labelApplier');
const { registerUpload, runUpload } = require('../services/uploadService');
const { startBrowserUpload, receiveBrowserChunk, reconcileBrowserUpload } = require('../services/browserUploadService');
const { requestPause } = require('../services/pauseRegistry');
const { renameItem, setTrashed, deletePermanently, listChildren } = require('../google/driveItems');
const {
  listLabelsFull, createLabel, addChoice, renameLabel, renameField, disableLabel, deleteLabelOnly,
} = require('../google/labelsAdmin');

const router = express.Router();

// ---------- Uploads ----------

router.get('/uploads', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT Id, FileName, FileSize, FileOffset, Status, RetryCount,
             LastError, DriveFileId, LabelApplied, CreatedAt, UpdatedAt
      FROM dbo.Uploads
      ORDER BY Id DESC
    `);
    res.json({ uploads: result.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/uploads', async (req, res) => {
  const { filePath, folderId } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'Falta filePath' });
  }
  try {
    const { id } = await registerUpload(filePath);
    runUpload(id, filePath, folderId || null).catch((err) => {
      console.error(`Error en subida ${id}:`, err.message);
    });
    res.status(202).json({ id, message: 'Subida iniciada' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/uploads/:id/retry', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM dbo.Uploads WHERE Id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Upload no encontrado' });
    }
    const upload = result.recordset[0];

    runUpload(upload.Id, upload.FilePath).catch((err) => {
      console.error(`Error en reintento ${upload.Id}:`, err.message);
    });

    res.status(202).json({ message: 'Reintento iniciado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/uploads/:id/pause', async (req, res) => {
  requestPause(req.params.id);
  res.json({ message: 'Pausa solicitada, se detendra tras el chunk en curso' });
});

router.post('/uploads/:id/label', async (req, res) => {
  const { choiceId } = req.body;
  if (!choiceId) {
    return res.status(400).json({ error: 'Falta choiceId' });
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT DriveFileId FROM dbo.Uploads WHERE Id = @id');

    if (result.recordset.length === 0 || !result.recordset[0].DriveFileId) {
      return res.status(400).json({ error: 'Este archivo todavia no tiene DriveFileId (no se ha terminado de subir)' });
    }

    const accessToken = await getAccessToken();
    await applyLabel(accessToken, result.recordset[0].DriveFileId, choiceId);

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE dbo.Uploads SET LabelApplied = 1, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id');

    res.json({ message: 'Label actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Subidas desde el navegador (boton "Elegir archivo") ----------

router.post('/browser-uploads', async (req, res) => {
  const { fileName, fileSize, folderId } = req.body;
  if (!fileName || !fileSize) return res.status(400).json({ error: 'Falta fileName o fileSize' });
  try {
    const { id } = await startBrowserUpload(fileName, fileSize, folderId || null);
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/browser-uploads/:id/chunk', express.raw({ type: () => true, limit: '50mb' }), async (req, res) => {
  try {
    const contentRange = req.headers['content-range'];
    if (!contentRange) return res.status(400).json({ error: 'Falta header Content-Range' });

    const match = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
    if (!match) return res.status(400).json({ error: 'Content-Range con formato invalido' });

    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    const total = parseInt(match[3], 10);

    const result = await receiveBrowserChunk(req.params.id, req.body, start, end, total);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/browser-uploads/:id/reconcile', async (req, res) => {
  try {
    const result = await reconcileBrowserUpload(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Carpetas ----------

router.get('/folders', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const folders = await listFolders(accessToken);
    res.json({ folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/folders', async (req, res) => {
  const { name, parentId } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Falta name' });
  }
  try {
    const accessToken = await getAccessToken();
    const folder = await createFolder(accessToken, name, parentId || null);
    res.status(201).json({ folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/folders/trash', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const folders = await listFolders(accessToken, true);
    res.json({ folders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/folders/:id', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta name' });
  try {
    const accessToken = await getAccessToken();
    const item = await renameItem(accessToken, req.params.id, name);
    res.json({ item });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/folders/:id/trash', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    await setTrashed(accessToken, req.params.id, true);
    res.json({ message: 'Enviado a la papelera' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/folders/:id/restore', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    await setTrashed(accessToken, req.params.id, false);
    res.json({ message: 'Restaurado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/folders/:id', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    await deletePermanently(accessToken, req.params.id);
    res.json({ message: 'Eliminado definitivamente' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/browse', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const folderId = req.query.folderId || null;
    const labelIds = req.query.labelIds ? req.query.labelIds.split(',').filter(Boolean) : [];
    const items = await listChildren(accessToken, folderId, false, labelIds);
    const folders = items.filter((i) => i.mimeType === 'application/vnd.google-apps.folder');
    const files = items.filter((i) => i.mimeType !== 'application/vnd.google-apps.folder');
    res.json({ folders, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Administracion de Labels ----------

router.get('/labels', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const labels = await listLabelsFull(accessToken);
    res.json({ labels });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/labels', async (req, res) => {
  const { title, fieldName, choices } = req.body;
  if (!title) return res.status(400).json({ error: 'Falta title' });
  try {
    const accessToken = await getAccessToken();
    const label = await createLabel(accessToken, title, fieldName, choices || []);
    res.status(201).json({ label });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/labels/:id', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Falta title' });
  try {
    const accessToken = await getAccessToken();
    await renameLabel(accessToken, req.params.id, title);
    res.json({ message: 'Label renombrado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/labels/:id/field/:fieldId', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta name' });
  try {
    const accessToken = await getAccessToken();
    await renameField(accessToken, req.params.id, req.params.fieldId, name);
    res.json({ message: 'Campo renombrado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/labels/:id/disable', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    await disableLabel(accessToken, req.params.id);
    res.json({ message: 'Label deshabilitado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/labels/:id', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    await deleteLabelOnly(accessToken, req.params.id);
    res.json({ message: 'Label eliminado definitivamente' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/labels/:id/choices', async (req, res) => {
  const { fieldId, name } = req.body;
  if (!fieldId || !name) return res.status(400).json({ error: 'Falta fieldId o name' });
  try {
    const accessToken = await getAccessToken();
    await addChoice(accessToken, req.params.id, fieldId, name);
    res.json({ message: 'Opcion agregada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/labels/assign', async (req, res) => {
  const { itemId, labelId, fieldId, choiceId } = req.body;
  if (!itemId || !labelId || !fieldId || !choiceId) {
    return res.status(400).json({ error: 'Faltan itemId, labelId, fieldId o choiceId' });
  }
  try {
    const accessToken = await getAccessToken();
    await applyLabelGeneric(accessToken, itemId, labelId, fieldId, choiceId);
    res.json({ message: 'Label asignado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Colores locales de labels (solo en tu SQL, no en Google) ----------

router.get('/label-colors', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT LabelId, Color FROM dbo.LabelColors');
    const colors = {};
    result.recordset.forEach((row) => { colors[row.LabelId] = row.Color; });
    res.json({ colors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/label-colors', async (req, res) => {
  const { labelId, color } = req.body;
  if (!labelId || !color) return res.status(400).json({ error: 'Falta labelId o color' });
  try {
    const pool = await getPool();
    await pool.request()
      .input('labelId', sql.NVarChar, labelId)
      .input('color', sql.NVarChar, color)
      .query(`
        MERGE dbo.LabelColors AS target
        USING (SELECT @labelId AS LabelId, @color AS Color) AS src
        ON target.LabelId = src.LabelId
        WHEN MATCHED THEN UPDATE SET Color = src.Color, UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (LabelId, Color) VALUES (src.LabelId, src.Color);
      `);
    res.json({ message: 'Color guardado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
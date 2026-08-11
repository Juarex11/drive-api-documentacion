// src/google/uploadSession.js
// -----------------------------------------------------------------------
// Maneja el ciclo de vida de una sesion de subida resumable de Google
// Drive: iniciarla, y consultar en que byte quedo (para reanudar).
// -----------------------------------------------------------------------

const fetch = require('node-fetch');

async function startResumableSession(accessToken, fileName, fileSize, mimeType = 'application/octet-stream', folderId = null) {
  const metadata = { name: fileName };
  if (folderId) metadata.parents = [folderId];

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!res.ok) {
    throw new Error(`Error iniciando sesion resumable: ${res.status} ${await res.text()}`);
  }

  const sessionUri = res.headers.get('location');
  if (!sessionUri) {
    throw new Error('Google no devolvio la URI de sesion (header Location ausente)');
  }
  return sessionUri;
}

// Le pregunta a Google en que byte quedo realmente la subida.
// Devuelve un numero (proximo byte a subir) o 'completed' si ya termino.
async function queryUploadStatus(sessionUri, fileSize) {
  const res = await fetch(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${fileSize}` },
  });

  if (res.status === 308) {
    const range = res.headers.get('range'); // ej: "bytes=0-8388607"
    return range ? parseInt(range.split('-')[1], 10) + 1 : 0;
  }
  if (res.status === 200 || res.status === 201) {
    const body = await res.json();
    return { completed: true, file: body };
  }

  throw new Error(`Estado inesperado al consultar progreso: ${res.status} ${await res.text()}`);
}

module.exports = { startResumableSession, queryUploadStatus };

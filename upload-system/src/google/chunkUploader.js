// src/google/chunkUploader.js
// -----------------------------------------------------------------------
// Sube un unico chunk (fragmento) de bytes a una sesion resumable ya
// iniciada. No sabe nada de archivos completos ni de base de datos,
// solo sube el pedazo que le dan.
// -----------------------------------------------------------------------

const fetch = require('node-fetch');

// Devuelve { done: false } si Google espera mas chunks (308),
// o { done: true, file: {...} } si el archivo quedo completo.
async function uploadChunk(sessionUri, chunkBuffer, start, end, fileSize) {
  const res = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      'Content-Length': String(chunkBuffer.length),
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    },
    body: chunkBuffer,
  });

  if (res.status === 308) {
    return { done: false };
  }
  if (res.status === 200 || res.status === 201) {
    return { done: true, file: await res.json() };
  }

  throw new Error(`Error subiendo chunk (${res.status}): ${await res.text()}`);
}

module.exports = { uploadChunk };

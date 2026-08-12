// src/services/pauseRegistry.js
// -----------------------------------------------------------------------
// Registro simple en memoria de que subidas tienen una pausa pendiente.
// El loop de subida revisa esto despues de cada chunk; si esta marcado,
// se detiene limpio (sin error) y queda en estado 'paused'.
// -----------------------------------------------------------------------

const pauseRequested = new Set();

function requestPause(uploadId) {
  pauseRequested.add(String(uploadId));
}

function isPauseRequested(uploadId) {
  return pauseRequested.has(String(uploadId));
}

function clearPause(uploadId) {
  pauseRequested.delete(String(uploadId));
}

module.exports = { requestPause, isPauseRequested, clearPause };
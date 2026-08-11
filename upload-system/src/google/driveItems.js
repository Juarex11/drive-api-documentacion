// src/google/driveItems.js
// -----------------------------------------------------------------------
// Operaciones genericas sobre un item de Drive (archivo o carpeta):
// renombrar, mover a papelera, restaurar, eliminar definitivamente.
// -----------------------------------------------------------------------

const fetch = require('node-fetch');

async function renameItem(accessToken, fileId, newName) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) throw new Error(`Error renombrando: ${res.status} ${await res.text()}`);
  return res.json();
}

async function setTrashed(accessToken, fileId, trashed) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed }),
  });
  if (!res.ok) throw new Error(`Error actualizando papelera: ${res.status} ${await res.text()}`);
  return res.json();
}

async function deletePermanently(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // Delete exitoso devuelve 204 sin body
  if (!res.ok && res.status !== 204) {
    throw new Error(`Error eliminando definitivamente: ${res.status} ${await res.text()}`);
  }
  return true;
}

// Lista el contenido de una carpeta (o la raiz de Mi unidad si folderId es null).
// Si se pasan labelIds, incluye labelInfo de esos labels en cada item
// (para poder mostrar badges y filtrar del lado del cliente).
async function listChildren(accessToken, folderId, trashedOnly = false, labelIds = []) {
  const parentClause = folderId ? `'${folderId}' in parents` : `'root' in parents`;
  const trashedClause = trashedOnly ? 'trashed=true' : 'trashed=false';
  const q = encodeURIComponent(`${parentClause} and ${trashedClause}`);

  let fields = 'files(id,name,mimeType,size,trashed)';
  let includeLabelsParam = '';
  if (labelIds.length > 0) {
    fields = 'files(id,name,mimeType,size,trashed,labelInfo)';
    includeLabelsParam = `&includeLabels=${labelIds.join(',')}`;
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${encodeURIComponent(fields)}&pageSize=200&orderBy=folder,name${includeLabelsParam}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Error listando contenido: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.files || [];
}

module.exports = { renameItem, setTrashed, deletePermanently, listChildren };
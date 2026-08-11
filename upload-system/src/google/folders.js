const fetch = require('node-fetch');

async function createFolder(accessToken, name, parentId = null) {
  const metadata = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) metadata.parents = [parentId];

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) throw new Error(`Error creando carpeta: ${res.status} ${await res.text()}`);
  return res.json();
}

async function listFolders(accessToken, trashedOnly = false) {
  const trashedClause = trashedOnly ? 'trashed=true' : 'trashed=false';
  const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and ${trashedClause}`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,trashed)&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Error listando carpetas: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.files || [];
}

module.exports = { createFolder, listFolders };
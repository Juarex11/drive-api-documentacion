// src/google/labelsAdmin.js
// -----------------------------------------------------------------------
// Administracion de labels de Drive: crear, renombrar el label, renombrar
// su campo, deshabilitar. NO incluye crear/quitar opciones de seleccion -
// esa operacion especifica esta bloqueada en esta cuenta de Workspace
// (confirmado con multiples pruebas). Las opciones se administran desde
// la consola de Google Workspace (admin.google.com).
// -----------------------------------------------------------------------

const fetch = require('node-fetch');

const BASE = 'https://drivelabels.googleapis.com/v2';

const COLOR_PRESETS = {
  gray:   { red: 0.62, green: 0.62, blue: 0.62 },
  red:    { red: 0.92, green: 0.26, blue: 0.21 },
  orange: { red: 0.96, green: 0.60, blue: 0.13 },
  yellow: { red: 0.98, green: 0.82, blue: 0.18 },
  green:  { red: 0.30, green: 0.69, blue: 0.31 },
  blue:   { red: 0.20, green: 0.51, blue: 0.92 },
  purple: { red: 0.61, green: 0.35, blue: 0.85 },
};

function colorFor(name) {
  return COLOR_PRESETS[name] || COLOR_PRESETS.gray;
}

async function listLabelsFull(accessToken) {
  const res = await fetch(`${BASE}/labels?view=LABEL_VIEW_FULL`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Error listando labels: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.labels || [];
}

async function publishLabel(accessToken, labelId) {
  const res = await fetch(`${BASE}/labels/${labelId}:publish?useAdminAccess=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Error publicando label: ${res.status} ${await res.text()}`);
  return res.json();
}

// Crea un label completo (con campo y opciones) en una sola llamada,
// igual al payload confirmado como funcional en Postman: SIN badgeConfig
// (el color causaba FAILED_PRECONDITION - formato de color no resuelto).
async function createLabel(accessToken, title, fieldName, choices) {
  const body = {
    labelType: 'SHARED',
    properties: { title },
    fields: [
      {
        properties: { displayName: fieldName || 'Estado' },
        selectionOptions: {
          choices: (choices || []).map((c) => ({
            properties: { displayName: typeof c === 'string' ? c : c.name },
          })),
        },
      },
    ],
  };

  const res = await fetch(`${BASE}/labels?useAdminAccess=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Error creando label: ${res.status} ${await res.text()}`);
  const created = await res.json();

  await publishLabel(accessToken, created.id);

  const all = await listLabelsFull(accessToken);
  return all.find((l) => l.id === created.id);
}

// Agrega una opcion a un campo existente, sin badgeConfig (igual patron).
async function addChoice(accessToken, labelId, fieldId, name) {
  const res = await fetch(`${BASE}/labels/${labelId}:delta?useAdminAccess=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        createSelectionChoice: {
          fieldId,
          choice: { properties: { displayName: name } },
        },
      }],
    }),
  });
  if (!res.ok) throw new Error(`Error agregando opcion: ${res.status} ${await res.text()}`);
  await publishLabel(accessToken, labelId);
  return res.json();
}

async function renameLabel(accessToken, labelId, newTitle) {
  const res = await fetch(`${BASE}/labels/${labelId}:delta?useAdminAccess=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ updateLabel: { updateMask: '*', properties: { title: newTitle } } }],
    }),
  });
  if (!res.ok) throw new Error(`Error renombrando label: ${res.status} ${await res.text()}`);
  await publishLabel(accessToken, labelId);
  return res.json();
}

// Renombrar el campo (ej: cambiar "Categoria" por "Prioridad")
async function renameField(accessToken, labelId, fieldId, newName) {
  const res = await fetch(`${BASE}/labels/${labelId}:delta?useAdminAccess=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        updateField: { updateMask: '*', id: fieldId, properties: { displayName: newName } },
      }],
    }),
  });
  if (!res.ok) throw new Error(`Error renombrando campo: ${res.status} ${await res.text()}`);
  await publishLabel(accessToken, labelId);
  return res.json();
}

async function disableLabel(accessToken, labelId) {
  const res = await fetch(`${BASE}/labels/${labelId}:disable?useAdminAccess=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Error deshabilitando label: ${res.status} ${await res.text()}`);
  return res.json();
}

async function deleteLabelOnly(accessToken, labelId) {
  const res = await fetch(`${BASE}/labels/${labelId}?useAdminAccess=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    if (res.status === 400 && errText.includes('CANNOT_DELETE')) {
      throw new Error('Google todavia no permite el borrado definitivo (exige un periodo de espera despues de deshabilitar). Intenta de nuevo mas tarde.');
    }
    throw new Error(`Error eliminando label: ${res.status} ${errText}`);
  }
  return true;
}

module.exports = {
  listLabelsFull, createLabel, addChoice, renameLabel, renameField, disableLabel, deleteLabelOnly, COLOR_PRESETS,
};
// src/google/labelApplier.js
// -----------------------------------------------------------------------
// Aplica un label (con un campo de seleccion) a un archivo que ya existe
// en Drive. Solo se puede llamar DESPUES de que el archivo fue creado
// (separacion identidad/contenido: la metadata necesita un recurso
// existente al cual asociarse).
// -----------------------------------------------------------------------

require('dotenv').config();
const fetch = require('node-fetch');

async function applyLabel(accessToken, driveFileId, choiceId = process.env.DRIVE_LABEL_CHOICE_ID) {
  const labelId = process.env.DRIVE_LABEL_ID;
  const fieldId = process.env.DRIVE_LABEL_FIELD_ID;

  if (!labelId || !fieldId || !choiceId) {
    throw new Error('Faltan DRIVE_LABEL_ID / DRIVE_LABEL_FIELD_ID / DRIVE_LABEL_CHOICE_ID en .env');
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}/modifyLabels`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        labelModifications: [
          {
            labelId,
            fieldModifications: [
              {
                fieldId,
                setSelectionValues: [choiceId],
              },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Error aplicando label: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

async function applyLabelGeneric(accessToken, itemId, labelId, fieldId, choiceId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${itemId}/modifyLabels`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labelModifications: [
          { labelId, fieldModifications: [{ fieldId, setSelectionValues: [choiceId] }] },
        ],
      }),
    }
  );
  if (!res.ok) throw new Error(`Error aplicando label: ${res.status} ${await res.text()}`);
  return res.json();
}

module.exports = { applyLabel, applyLabelGeneric };
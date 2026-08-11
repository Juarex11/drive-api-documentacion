// scripts/list-labels.js
// -----------------------------------------------------------------------
// Lista los labels de Drive disponibles para tu cuenta, con sus campos
// y opciones. Sirve para obtener los IDs exactos (labelId, fieldId,
// choiceId) que necesitamos poner en el .env para poder aplicar el
// label a un archivo despues de subirlo.
//
// Como correrlo:
//   node scripts/list-labels.js
// -----------------------------------------------------------------------

require('dotenv').config();
const fetch = require('node-fetch');
const { getAccessToken } = require('../src/google/auth');

async function main() {
  const accessToken = await getAccessToken();

  const res = await fetch(
    'https://drivelabels.googleapis.com/v2/labels?view=LABEL_VIEW_FULL',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Error consultando labels: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();

  if (!data.labels || data.labels.length === 0) {
    console.log('No se encontraron labels publicados visibles para esta cuenta.');
    console.log('Revisa que el label este PUBLICADO (no en borrador) y que tu cuenta tenga permiso para verlo.');
    return;
  }

  for (const label of data.labels) {
    console.log('\n========================================');
    console.log('Label:', label.properties?.title);
    console.log('  labelId:', label.id);
    console.log('  Estado:', label.labelType, '|', label.lifecycle?.state);

    const fields = label.fields || [];
    for (const field of fields) {
      console.log('  ---');
      console.log('  Campo:', field.properties?.displayName);
      console.log('    fieldId:', field.id);
      console.log('    tipo:', Object.keys(field).find(k => ['textOptions','integerOptions','dateOptions','selectionOptions','userOptions'].includes(k)));

      if (field.selectionOptions && field.selectionOptions.choices) {
        for (const choice of field.selectionOptions.choices) {
          console.log('      Opcion:', choice.properties?.displayName, '-> choiceId:', choice.id);
        }
      }
    }
  }

  console.log('\n========================================');
  console.log('Copia los IDs que necesites a tu .env (DRIVE_LABEL_ID, DRIVE_LABEL_FIELD_ID, DRIVE_LABEL_CHOICE_ID).');
}

main().catch((err) => {
  console.error('\nERROR consultando labels:');
  console.error(err.message);
  process.exit(1);
});

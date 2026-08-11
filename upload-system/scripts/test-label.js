// scripts/test-label.js
// -----------------------------------------------------------------------
// PRUEBA AISLADA: aplica el label a un archivo que YA existe en Drive
// (usando su fileId), sin subir nada nuevo. Sirve para confirmar que el
// etiquetado funciona antes de integrarlo al flujo completo de subida.
//
// Como correrlo:
//   node scripts/test-label.js 1t4GIIK_29dEAG-u2mL0VDNz47ea36D7P
// -----------------------------------------------------------------------

require('dotenv').config();
const { getAccessToken } = require('../src/google/auth');
const { applyLabel } = require('../src/google/labelApplier');

async function main() {
  const fileId = process.argv[2];
  if (!fileId) {
    console.error('Uso: node scripts/test-label.js <driveFileId>');
    process.exit(1);
  }

  console.log(`Aplicando label al archivo ${fileId}...`);
  const accessToken = await getAccessToken();
  const result = await applyLabel(accessToken, fileId);

  console.log('\nTODO OK. Label aplicado correctamente.');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('\nERROR aplicando label:');
  console.error(err.message);
  process.exit(1);
});

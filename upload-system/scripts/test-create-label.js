require('dotenv').config();
const { getAccessToken } = require('../src/google/auth');
const { createLabel } = require('../src/google/labelsAdmin');

async function main() {
  const accessToken = await getAccessToken();
  const label = await createLabel(accessToken, 'Prueba desde codigo', 'Estado', ['Pendiente', 'Aprobado']);
  console.log('TODO OK. Label creado:');
  console.log(JSON.stringify(label, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
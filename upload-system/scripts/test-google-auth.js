// scripts/test-google-auth.js
// -----------------------------------------------------------------------
// PRUEBA AISLADA: solo confirma que las credenciales de Google (client_id,
// client_secret, refresh_token) funcionan y se puede obtener un access
// token. No sube nada, no toca Drive todavia.
//
// Como correrlo:
//   node scripts/test-google-auth.js
// -----------------------------------------------------------------------

require('dotenv').config();
const { getAccessToken } = require('../src/google/auth');

async function main() {
  console.log('Intentando obtener access token con el refresh token...');
  const token = await getAccessToken();

  console.log('\nTODO OK. Access token obtenido correctamente.');
  console.log('Primeros 15 caracteres del token (solo para confirmar, no es sensible mostrarlos parcial):');
  console.log(token.substring(0, 15) + '...');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nERROR al obtener access token:');
  console.error(err.message);
  console.error('\nRevisa en tu .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN');
  process.exit(1);
});

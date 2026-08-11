// src/google/auth.js
// -----------------------------------------------------------------------
// Obtiene un access token fresco a partir del refresh token guardado
// en .env. El access token dura poco (aprox 1 hora), por eso se pide
// uno nuevo cada vez que se necesita en vez de guardarlo.
// -----------------------------------------------------------------------

require('dotenv').config();
const { google } = require('googleapis');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function getAccessToken() {
  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const { token } = await oAuth2Client.getAccessToken();
  if (!token) {
    throw new Error('No se pudo obtener access token (revisa client_id/secret/refresh_token en .env)');
  }
  return token;
}

module.exports = { getAccessToken, getOAuthClient };

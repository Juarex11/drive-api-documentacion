// src/api/server.js
require('dotenv').config();
const express = require('express');
const uploadsRouter = require('./routes');

const app = express();

// CORS simple manual (sin dependencia extra) - permite que el frontend
// Next.js (localhost:3000) consulte esta API (localhost:3001).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use('/api', uploadsRouter);

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Upload System API' });
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});

# Drive API - Sistema de subida y gestion de archivos

Sistema para subir archivos grandes (15-20GB) a Google Drive por streaming/chunks,
con etiquetado automatico, panel de administracion visual, y navegador estilo Drive.

## Estructura

```
├── upload-system/     Backend (Node.js + Express + SQL Server)
└── front/              Frontend (Next.js)
```

## Backend (upload-system)

1. `cd upload-system`
2. `npm install`
3. Copia `.env.example` a `.env` y llena tus credenciales reales:
   - Datos de conexion a SQL Server (crea la base de datos con `scripts/schema.sql` en SSMS primero)
   - Credenciales OAuth de Google (Client ID, Secret, Refresh Token con scopes: `drive`, `drive.labels`, `drive.admin.labels`)
4. `npm run api` — levanta la API en `http://localhost:3001`

### Scripts de prueba individuales (`scripts/`)
- `test-db-connection.js` - prueba la conexion a SQL Server
- `test-google-auth.js` - prueba la autenticacion OAuth
- `test-upload.js "ruta/archivo"` - sube un archivo de prueba
- `test-label.js <driveFileId>` - aplica un label a un archivo
- `list-labels.js` - lista los labels disponibles con sus IDs
- `test-create-label.js` - crea un label de prueba con opciones

## Frontend (front)

1. `cd front`
2. `npm install`
3. Copia `.env.local.example` a `.env.local` (solo necesita `BACKEND_URL`, apunta al backend)
4. `npm run dev` — levanta el dashboard en `http://localhost:3000`

**Importante:** el backend debe estar corriendo (`npm run api`) para que el frontend funcione.

## Notas tecnicas

- La subida usa el protocolo resumable de Google Drive (chunks de 8MB configurables via `CHUNK_SIZE_MB`).
- La sesion de subida de Google expira a los 7 dias.
- Crear/editar labels via API requiere el scope `drive.admin.labels` ademas de `drive.labels`.
- Al crear un label con opciones via API, NO se debe incluir `badgeConfig` (color) en las opciones -
  causa un error `FAILED_PRECONDITION` en esta cuenta. Los colores se manejan solo del lado del
  dashboard (guardados en SQL Server, tabla `LabelColors`), no en Google.

## Pendiente

- Prueba con archivo real de 15-20GB
- Reanudacion automatica ante cortes de red durante la subida
- Selector de archivo desde boton del navegador (hoy se ingresa la ruta manualmente)

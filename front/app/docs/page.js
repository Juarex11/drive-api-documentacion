'use client';

import Link from 'next/link';

function Section({ title, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
      <h2 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 12px', color: '#202124' }}>{title}</h2>
      <div style={{ fontSize: 14, color: '#3c4043', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function Code({ children }) {
  return (
    <pre style={{ background: '#f1f3f4', borderRadius: 8, padding: 12, fontSize: 12.5, overflowX: 'auto', fontFamily: 'Consolas, Monaco, monospace', lineHeight: 1.5 }}>
      {children}
    </pre>
  );
}

function Table({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <tbody>
        {rows.map(([action, desc], i) => (
          <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '8px 12px 8px 0', fontWeight: 500, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{action}</td>
            <td style={{ padding: '8px 0', color: '#5f6368' }}>{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DocsPage() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Documentación: proceso de subida</h1>
        <Link href="/" style={{ fontSize: 14, color: '#1a73e8', textDecoration: 'none' }}>← Volver a Mi Drive</Link>
      </div>

      <Section title="Visión general del flujo">
        <p>Así funciona el sistema por dentro cuando subes un archivo, especialmente uno grande (15-20GB):</p>
        <Code>{`Usuario                Frontend (Next.js)         Backend (Express)              Google Drive
   |                         |                           |                            |
   |--- 1. Elige archivo --->|                           |                            |
   |    o escribe ruta       |                           |                            |
   |                         |--- 2. Registra subida --->|                            |
   |                         |                           |--- 3. Crea fila en SQL --->|
   |                         |                           |--- 4. Inicia sesion ------->|
   |                         |                           |<-- sessionUri --------------|
   |                         |<-- {id} ------------------|                            |
   |                         |                           |                            |
   |                         |--- 5. Envia chunk 1 ----->|--- 6. Reenvia a Google ---->|
   |                         |<-- progreso ---------------|<-- 308 (falta mas) ---------|
   |                         |          ... se repite hasta terminar el archivo ...     |
   |                         |                           |<-- 200 (archivo creado) ----|
   |                         |                           |--- 7. Aplica etiqueta ----->|
   |                         |<-- "completado" -----------|                            |`}</Code>
      </Section>

      <Section title="Método A: Ruta del servidor">
        <p>Usas este método cuando el archivo ya está guardado en el disco de la computadora donde corre el backend (tu propia PC).</p>
        <p><strong>Qué pasa al darle clic a "Subir aquí":</strong></p>
        <ol>
          <li>El frontend manda la ruta (texto) al backend — <strong>no</strong> manda el archivo, solo la ubicación.</li>
          <li>El backend abre el archivo directamente desde el disco.</li>
          <li>Lo lee en pedazos de 8MB, sin cargar nunca el archivo completo en memoria (por eso funciona igual con un archivo de 200KB que con uno de 20GB).</li>
          <li>Cada pedazo se manda directo a Google desde el backend.</li>
        </ol>
        <p style={{ background: '#e6f4ea', padding: 10, borderRadius: 8, color: '#188038' }}>
          <strong>Recomendado para archivos de 15-20GB</strong>: no depende de mantener el navegador abierto durante horas.
        </p>
      </Section>

      <Section title="Método B: Botón &quot;Elegir archivo&quot;">
        <p>Usas este método cuando prefieres seleccionar el archivo visualmente, sin escribir su ruta exacta.</p>
        <p><strong>Qué pasa al darle clic a "Subir seleccionado":</strong></p>
        <ol>
          <li>El navegador NO tiene acceso a la ruta real del archivo (por seguridad), solo a su contenido.</li>
          <li>El frontend corta el archivo en pedazos de 8MB.</li>
          <li>Cada pedazo se manda por HTTP desde el navegador hacia el backend.</li>
          <li>El backend reenvía ese mismo pedazo a Google.</li>
        </ol>
        <p style={{ background: '#fff3cd', padding: 10, borderRadius: 8, color: '#856404' }}>
          <strong>Limitación:</strong> si cierras la pestaña a mitad de la subida, se pierde el archivo de la memoria del navegador.
          El sistema detecta esto si vuelves a seleccionar el mismo archivo (mismo nombre y tamaño) y ofrece reanudar desde donde
          se quedó — pero la pestaña debe permanecer abierta mientras la subida está en curso.
        </p>
      </Section>

      <Section title="Qué verás en la terminal del backend">
        <p>Cada línea tiene el formato <code>[Upload &lt;id&gt;] mensaje</code>:</p>
        <Code>{`[Upload 12] Iniciando: pelicula.mp4 (18.42 GB)
[Upload 12] pelicula.mp4: 0.04% (8388608/19780000000 bytes, chunk 0-8388607)
[Upload 12] pelicula.mp4: 0.08% (16777216/19780000000 bytes, chunk 8388608-16777215)
...`}</Code>
        <p>Si hay un corte de red durante un chunk:</p>
        <Code>{`Chunk fallo (intento 1/6), reintentando en 2134ms: request to https://... failed
Chunk fallo (intento 2/6), reintentando en 4287ms: request to https://... failed`}</Code>
        <p>Esto es normal — el sistema reintenta solo. Si el corte dura más de ~1 minuto (6 reintentos con espera creciente), la subida queda marcada como <code>failed</code>, pero recuerda el punto exacto donde se quedó:</p>
        <Code>{`[Upload 12] FALLO tras agotar reintentos: request to https://... failed`}</Code>
        <p>Al reanudarla (botón "Reintentar"):</p>
        <Code>{`[Upload 12] Reanudando pelicula.mp4 desde el byte 8420000000 de 19780000000 (42.57%)`}</Code>
        <p>Y al terminar:</p>
        <Code>{`[Upload 12] Subida completa: pelicula.mp4 -> Drive file id: 1AbCdEfGhIjKlMnOpQrStUvWxYz`}</Code>
      </Section>

      <Section title="Qué verás en el frontend">
        <p><strong>Método A (ruta):</strong> el mensaje "Subida iniciada" aparece de inmediato (corre en segundo plano). El progreso se ve en "Subidas en curso", que se actualiza sola cada 2 segundos.</p>
        <p><strong>Método B (elegir archivo):</strong> aparece una barra de progreso propia bajo el selector, actualizándose en vivo mientras el navegador manda cada pedazo.</p>
        <p>En ambos casos, al completarse, la fila desaparece de "Subidas en curso" y el archivo aparece en el explorador de arriba, con su etiqueta (si tiene) mostrada como pastilla azul.</p>
      </Section>

      <Section title="Qué hace cada botón del dashboard">
        <Table rows={[
          ['Crear carpeta', 'Llama a la API de Drive para crear una carpeta real, dentro de donde estés parado'],
          ['Subir aquí', 'Dispara el Método A (ruta del servidor)'],
          ['Elegir archivo + Subir seleccionado', 'Dispara el Método B (navegador)'],
          ['Renombrar', 'Llama a files.update de Drive para cambiar el nombre'],
          ['Enviar a papelera', 'Marca trashed: true en Drive (recuperable)'],
          ['Asignar etiqueta (menú ⋮)', 'Aplica un label existente con una opción específica'],
          ['Filtrar por etiqueta', 'Compara datos ya cargados, sin llamada nueva a Google'],
          ['Reintentar', 'Reconcilia con Google el byte real y continúa desde ahí, sin repetir desde cero'],
        ]} />
      </Section>
    </main>
  );
}
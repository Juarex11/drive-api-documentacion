'use client';

import { useEffect, useState } from 'react';

const statusColors = {
  pending: '#9aa0a6',
  uploading: '#1a73e8',
  labeling: '#f9ab00',
  completed: '#188038',
  failed: '#d93025',
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function Home() {
  const [uploads, setUploads] = useState([]);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    async function fetchUploads() {
      try {
        const res = await fetch('/api/uploads');
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setError(null);
          setUploads(data.uploads);
          setLastUpdate(new Date());
        }
      } catch (err) {
        setError(err.message);
      }
    }

    fetchUploads();
    const interval = setInterval(fetchUploads, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: '#202124', margin: 0 }}>
          Subidas a Google Drive
        </h1>
        <span style={{ fontSize: 13, color: '#5f6368' }}>
          {lastUpdate ? `Actualizado ${lastUpdate.toLocaleTimeString()}` : 'Cargando...'}
        </span>
      </div>

      {error && (
        <div style={{ background: '#fce8e6', color: '#c5221f', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          Error conectando a la base de datos: {error}
        </div>
      )}

      {!error && uploads.length === 0 && (
        <div style={{ background: '#fff', padding: 32, borderRadius: 12, textAlign: 'center', color: '#5f6368' }}>
          No hay subidas registradas todavia. Corre <code>node scripts/test-upload.js "ruta"</code> en el proyecto backend.
        </div>
      )}

      {uploads.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
          {uploads.map((u) => {
            const pct = u.FileSize > 0 ? Math.round((u.FileOffset / u.FileSize) * 100) : 0;
            const color = statusColors[u.Status] || '#9aa0a6';
            return (
              <div key={u.Id} style={{ padding: '16px 20px', borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#202124' }}>{u.FileName}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 500, color,
                    background: color + '1a', padding: '2px 10px', borderRadius: 999,
                    textTransform: 'uppercase', letterSpacing: 0.3,
                  }}>
                    {u.Status}
                  </span>
                </div>

                <div style={{ background: '#e8eaed', borderRadius: 999, height: 6, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', background: color,
                    transition: 'width 0.3s ease',
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#5f6368' }}>
                  <span>{formatBytes(u.FileOffset)} / {formatBytes(u.FileSize)} ({pct}%)</span>
                  <span>
                    {u.DriveFileId && (
                      <a href={`https://drive.google.com/file/d/${u.DriveFileId}/view`} target="_blank" rel="noreferrer"
                         style={{ color: '#1a73e8', textDecoration: 'none', marginRight: 12 }}>
                        Ver en Drive
                      </a>
                    )}
                    {u.LabelApplied ? 'Etiquetado' : 'Sin etiqueta'}
                  </span>
                </div>

                {u.LastError && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#d93025' }}>
                    Error: {u.LastError}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

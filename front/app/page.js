'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

const statusColors = {
  pending: '#9aa0a6', uploading: '#1a73e8', labeling: '#f9ab00',
  completed: '#188038', failed: '#d93025',
};

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n === 0) return '0 B';
  const mb = n / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
function inputStyle(extra) {
  return { border: '1px solid #dadce0', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', flex: 1, ...extra };
}
function buttonStyle(primary, extra) {
  return { border: primary ? 'none' : '1px solid #dadce0', background: primary ? '#1a73e8' : '#fff',
    color: primary ? '#fff' : '#3c4043', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer', ...extra };
}
function iconBtnStyle(danger) {
  return { border: '1px solid ' + (danger ? '#f6c6c2' : '#dadce0'), background: '#fff',
    color: danger ? '#d93025' : '#3c4043', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' };
}

export default function Home() {
  const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: 'Mi unidad' }]);
  const [browseFolders, setBrowseFolders] = useState([]);
  const [browseFiles, setBrowseFiles] = useState([]);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [browseError, setBrowseError] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [assignSubmenuId, setAssignSubmenuId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const currentFolderId = breadcrumb[breadcrumb.length - 1].id;

  const [newFolderName, setNewFolderName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const [uploads, setUploads] = useState([]);
  const [uploadsError, setUploadsError] = useState(null);

  const [labels, setLabels] = useState([]);
  const labelsRef = useRef([]);
  useEffect(() => { labelsRef.current = labels; }, [labels]);
  const [filterLabelId, setFilterLabelId] = useState('');
  const [filterChoiceId, setFilterChoiceId] = useState('');

  const fetchBrowse = useCallback(async (folderId, showSpinner = true) => {
    if (showSpinner) setLoadingBrowse(true);
    setBrowseError(null);
    try {
      const params = new URLSearchParams();
      if (folderId) params.set('folderId', folderId);
      const ids = labelsRef.current.map((l) => l.id);
      if (ids.length > 0) params.set('labelIds', ids.join(','));
      const res = await fetch(`/api/browse?${params.toString()}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBrowseFolders(data.folders || []);
      setBrowseFiles(data.files || []);
    } catch (err) {
      setBrowseError(err.message);
    } finally {
      if (showSpinner) setLoadingBrowse(false);
    }
  }, []);

  async function fetchUploads() {
    try {
      const res = await fetch('/api/uploads');
      const data = await res.json();
      if (data.error) setUploadsError(data.error);
      else { setUploadsError(null); setUploads(data.uploads); }
    } catch (err) { setUploadsError(err.message); }
  }

  async function fetchLabels() {
    try {
      const res = await fetch('/api/labels');
      const data = await res.json();
      if (data.error) {
        console.error('Error cargando labels:', data.error);
        return;
      }
      if (data.labels) {
        setLabels(data.labels);
        labelsRef.current = data.labels;
      }
    } catch (err) {
      console.error('Error de red cargando labels:', err.message);
    }
  }

  useEffect(() => {
    if (labels.length > 0) {
      fetchBrowse(currentFolderId, true);
    }
  }, [currentFolderId, labels, fetchBrowse]);

  useEffect(() => {
    fetchUploads();
    fetchLabels();
    const uploadsInterval = setInterval(fetchUploads, 2000);
    return () => clearInterval(uploadsInterval);
  }, []);

  function openFolder(folder) {
    setBreadcrumb([...breadcrumb, { id: folder.id, name: folder.name }]);
    setMenuOpenId(null);
  }
  function goToCrumb(index) {
    setBreadcrumb(breadcrumb.slice(0, index + 1));
    setMenuOpenId(null);
  }

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setBusy(true); setActionMessage(null);
    try {
      const res = await fetch('/api/folders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), parentId: currentFolderId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error creando carpeta');
      setActionMessage(`Carpeta "${data.folder.name}" creada.`);
      setNewFolderName('');
      fetchBrowse(currentFolderId, false);
    } catch (err) { setActionMessage(`Error: ${err.message}`); }
    finally { setBusy(false); }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!filePath.trim()) return;
    setBusy(true); setActionMessage(null);
    try {
      const res = await fetch('/api/uploads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: filePath.trim(), folderId: currentFolderId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error iniciando subida');
      setActionMessage(`Subida iniciada (Id ${data.id}).`);
      setFilePath('');
      fetchUploads();
    } catch (err) { setActionMessage(`Error: ${err.message}`); }
    finally { setBusy(false); }
  }

  function startRename(item) {
    setEditingId(item.id);
    setEditingName(item.name);
    setMenuOpenId(null);
  }
  async function saveRename(itemId) {
    if (!editingName.trim()) return;
    try {
      const res = await fetch(`/api/folders/${itemId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error renombrando');
      setEditingId(null);
      fetchBrowse(currentFolderId, false);
    } catch (err) { setActionMessage(`Error: ${err.message}`); }
  }

  async function trashItem(itemId) {
    setMenuOpenId(null);
    try {
      const res = await fetch(`/api/folders/${itemId}/trash`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error enviando a papelera');
      fetchBrowse(currentFolderId, false);
    } catch (err) { setActionMessage(`Error: ${err.message}`); }
  }

  async function assignLabelToItem(itemId, labelId, fieldId, choiceId) {
    setMenuOpenId(null); setAssignSubmenuId(null);
    try {
      const res = await fetch('/api/labels/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, labelId, fieldId, choiceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error asignando etiqueta');
      setActionMessage('Etiqueta asignada.');
      fetchBrowse(currentFolderId, false);
    } catch (err) { setActionMessage(`Error: ${err.message}`); }
  }

  async function handleRetry(uploadId) {
    try {
      const res = await fetch(`/api/uploads/${uploadId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error reintentando');
      fetchUploads();
    } catch (err) { setActionMessage(`Error: ${err.message}`); }
  }

  const inProgress = uploads.filter((u) => u.Status !== 'completed');

  function renderItemMenu(item) {
    return (
      <div style={{ position: 'absolute', top: 24, right: 4, background: '#fff', border: '1px solid #dadce0', borderRadius: 8, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 20, minWidth: 160 }}>
        <div onClick={() => startRename(item)} style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>Renombrar</div>
        <div onClick={() => setAssignSubmenuId(assignSubmenuId === item.id ? null : item.id)} style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', position: 'relative' }}>
          Asignar etiqueta ▸
          {assignSubmenuId === item.id && (
            <div style={{ position: 'absolute', top: 0, left: '100%', background: '#fff', border: '1px solid #dadce0', borderRadius: 8, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', minWidth: 200, maxHeight: 260, overflowY: 'auto' }}>
              {labels.length === 0 && <div style={{ padding: 10, fontSize: 12, color: '#9aa0a6' }}>No hay labels</div>}
              {labels.map((l) => {
                const field = l.fields?.[0];
                const choices = field?.selectionOptions?.choices || [];
                return (
                  <div key={l.id} style={{ padding: '6px 12px', borderBottom: '1px solid #f1f3f4' }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#5f6368', marginBottom: 4 }}>{l.properties?.title}</div>
                    {choices.length === 0 && <div style={{ fontSize: 11, color: '#bbb' }}>Sin opciones</div>}
                    {choices.map((c) => (
                      <div key={c.id} onClick={() => assignLabelToItem(item.id, l.id, field.id, c.id)}
                        style={{ fontSize: 12, padding: '4px 8px', cursor: 'pointer', borderRadius: 4 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f1f3f4'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                        {c.properties?.displayName}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div onClick={() => trashItem(item.id)} style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', color: '#d93025' }}>Enviar a papelera</div>
      </div>
    );
  }

  const filterLabel = labels.find((l) => l.id === filterLabelId);
  const filterField = filterLabel?.fields?.[0];
  const filterChoices = filterField?.selectionOptions?.choices || [];

  function itemMatchesFilter(item) {
    if (!filterLabelId) return true;
    const appliedLabel = item.labelInfo?.labels?.find((l) => l.id === filterLabelId);
    if (!appliedLabel) return false;
    if (!filterChoiceId) return true; // "Cualquier opcion": basta con que el label este aplicado
    const fieldValue = appliedLabel.fields?.[filterField?.id];
    return !!fieldValue?.selection?.includes(filterChoiceId);
  }

  function getAppliedBadges(item) {
    if (!item.labelInfo?.labels) return [];
    const badges = [];
    for (const applied of item.labelInfo.labels) {
      const labelDef = labels.find((l) => l.id === applied.id);
      if (!labelDef) continue;
      const appliedFields = applied.fields || {};
      for (const fieldId of Object.keys(appliedFields)) {
        const fieldDef = labelDef.fields?.find((f) => f.id === fieldId);
        const selectedIds = appliedFields[fieldId]?.selection || [];
        for (const choiceId of selectedIds) {
          const choice = fieldDef?.selectionOptions?.choices?.find((c) => c.id === choiceId);
          const labelTitle = labelDef.properties?.title || 'Etiqueta';
          const choiceName = choice?.properties?.displayName || choiceId;
          badges.push(`${labelTitle}: ${choiceName}`);
        }
      }
    }
    return badges;
  }

  const visibleFolders = browseFolders.filter(itemMatchesFilter);
  const visibleFiles = browseFiles.filter(itemMatchesFilter);

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: '#202124', margin: 0 }}>Mi Drive</h1>
        <a href="/labels" style={{ fontSize: 14, color: '#1a73e8', textDecoration: 'none' }}>Administrar etiquetas →</a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, fontSize: 14 }}>
        {breadcrumb.map((crumb, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: '#5f6368' }}>/</span>}
            <button onClick={() => goToCrumb(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px',
              fontSize: 14, fontWeight: i === breadcrumb.length - 1 ? 500 : 400, color: i === breadcrumb.length - 1 ? '#202124' : '#1a73e8' }}>
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      {/* Filtro por etiqueta */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 12, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.08)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#5f6368' }}>Filtrar por etiqueta:</span>
        <select style={{ ...inputStyle(), flex: '0 0 200px' }} value={filterLabelId} onChange={(e) => { setFilterLabelId(e.target.value); setFilterChoiceId(''); }}>
          <option value="">Todas</option>
          {labels.map((l) => <option key={l.id} value={l.id}>{l.properties?.title}</option>)}
        </select>
        <select style={{ ...inputStyle(), flex: '0 0 160px' }} value={filterChoiceId} onChange={(e) => setFilterChoiceId(e.target.value)} disabled={!filterLabelId}>
          <option value="">{filterLabelId ? 'Cualquier opcion' : '-'}</option>
          {filterChoices.map((c) => <option key={c.id} value={c.id}>{c.properties?.displayName}</option>)}
        </select>
        {filterLabelId && (
          <button onClick={() => { setFilterLabelId(''); setFilterChoiceId(''); }} style={iconBtnStyle(false)}>Quitar filtro</button>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <form onSubmit={handleCreateFolder} style={{ display: 'flex', gap: 8, flex: 1 }}>
            <input style={inputStyle()} placeholder="Nueva carpeta aqui" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
            <button style={buttonStyle(false)} disabled={busy} type="submit">Crear carpeta</button>
          </form>
        </div>
        <form onSubmit={handleUpload} style={{ display: 'flex', gap: 8 }}>
          <input style={inputStyle()} placeholder="Ruta del archivo en el servidor" value={filePath} onChange={(e) => setFilePath(e.target.value)} />
          <button style={buttonStyle(true)} disabled={busy} type="submit">Subir aqui</button>
        </form>
        {actionMessage && (
          <div style={{ marginTop: 10, fontSize: 13, color: actionMessage.startsWith('Error') ? '#d93025' : '#188038' }}>{actionMessage}</div>
        )}
      </div>

      {browseError && (
        <div style={{ background: '#fce8e6', color: '#c5221f', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          Error: {browseError}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, padding: 8, marginBottom: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.08)', minHeight: 120 }}>
        {loadingBrowse && <div style={{ padding: 24, textAlign: 'center', color: '#5f6368', fontSize: 13 }}>Cargando...</div>}
        {!loadingBrowse && visibleFolders.length === 0 && visibleFiles.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#5f6368', fontSize: 13 }}>
            {filterLabelId ? 'Nada con esa etiqueta en esta carpeta.' : 'Nada que mostrar aqui.'}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, padding: 8 }}>
          {visibleFolders.map((f) => (
            <div key={f.id} style={{ position: 'relative', border: '1px solid #e8eaed', borderRadius: 8, padding: 12 }}>
              {editingId === f.id ? (
                <div>
                  <input style={{ ...inputStyle(), fontSize: 12, padding: '4px 6px' }} value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus />
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button style={iconBtnStyle(false)} onClick={() => saveRename(f.id)}>Guardar</button>
                    <button style={iconBtnStyle(false)} onClick={() => setEditingId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  {getAppliedBadges(f).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
                      {getAppliedBadges(f).map((b, i) => (
                        <span key={i} style={{ fontSize: 9, background: '#e8f0fe', color: '#1a73e8', borderRadius: 999, padding: '1px 6px' }}>{b}</span>
                      ))}
                    </div>
                  )}
                  <div onClick={() => openFolder(f)} style={{ cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontSize: 32 }}>📁</div>
                    <div style={{ fontSize: 12, marginTop: 4, wordBreak: 'break-word' }}>{f.name}</div>
                  </div>
                  <button onClick={() => { setMenuOpenId(menuOpenId === f.id ? null : f.id); setAssignSubmenuId(null); }}
                    style={{ position: 'absolute', top: 4, right: 4, border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#5f6368' }}>⋮</button>
                  {menuOpenId === f.id && renderItemMenu(f)}
                </>
              )}
            </div>
          ))}

          {visibleFiles.map((f) => (
            <div key={f.id} style={{ position: 'relative', border: '1px solid #e8eaed', borderRadius: 8, padding: 12 }}>
              {editingId === f.id ? (
                <div>
                  <input style={{ ...inputStyle(), fontSize: 12, padding: '4px 6px' }} value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus />
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button style={iconBtnStyle(false)} onClick={() => saveRename(f.id)}>Guardar</button>
                    <button style={iconBtnStyle(false)} onClick={() => setEditingId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  {getAppliedBadges(f).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
                      {getAppliedBadges(f).map((b, i) => (
                        <span key={i} style={{ fontSize: 9, background: '#e8f0fe', color: '#1a73e8', borderRadius: 999, padding: '1px 6px' }}>{b}</span>
                      ))}
                    </div>
                  )}
                  <a href={`https://drive.google.com/file/d/${f.id}/view`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block', textAlign: 'center' }}>
                    <div style={{ fontSize: 32 }}>📄</div>
                    <div style={{ fontSize: 12, marginTop: 4, wordBreak: 'break-word', color: '#202124' }}>{f.name}</div>
                    {f.size && <div style={{ fontSize: 11, color: '#5f6368' }}>{formatBytes(f.size)}</div>}
                  </a>
                  <button onClick={() => { setMenuOpenId(menuOpenId === f.id ? null : f.id); setAssignSubmenuId(null); }}
                    style={{ position: 'absolute', top: 4, right: 4, border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#5f6368' }}>⋮</button>
                  {menuOpenId === f.id && renderItemMenu(f)}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {inProgress.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 8px', color: '#5f6368' }}>Subidas en curso</h2>
          <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', marginBottom: 20 }}>
            {inProgress.map((u) => {
              const pct = u.FileSize > 0 ? Math.round((Number(u.FileOffset) / Number(u.FileSize)) * 100) : 0;
              const color = statusColors[u.Status] || '#9aa0a6';
              return (
                <div key={u.Id} style={{ padding: '12px 20px', borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{u.FileName}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {u.Status === 'failed' && <button onClick={() => handleRetry(u.Id)} style={iconBtnStyle(false)}>Reintentar</button>}
                      <span style={{ fontSize: 11, fontWeight: 500, color, background: color + '1a', padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase' }}>{u.Status}</span>
                    </div>
                  </div>
                  <div style={{ background: '#e8eaed', borderRadius: 999, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s ease' }} />
                  </div>
                  {u.LastError && <div style={{ marginTop: 6, fontSize: 11, color: '#d93025' }}>{u.LastError}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {uploadsError && <div style={{ fontSize: 12, color: '#d93025' }}>Error consultando subidas: {uploadsError}</div>}
    </main>
  );
}
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const LOCAL_COLORS = {
  gray: '#9e9e9e', red: '#ea4335', orange: '#f59e0b', yellow: '#fbbc04',
  green: '#34a853', blue: '#4285f4', purple: '#9c6ade',
};

function inputStyle(extra) {
  return { border: '1px solid #dadce0', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', flex: 1, ...extra };
}
function buttonStyle(primary, extra) {
  return { border: primary ? 'none' : '1px solid #dadce0', background: primary ? '#1a73e8' : '#fff',
    color: primary ? '#fff' : '#3c4043', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer', ...extra };
}

export default function LabelsPage() {
  const [labels, setLabels] = useState([]);
  const [folders, setFolders] = useState([]);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newFieldName, setNewFieldName] = useState('Estado');
  const [newChoices, setNewChoices] = useState(['']);

  const [addChoiceFor, setAddChoiceFor] = useState(null);
  const [addChoiceName, setAddChoiceName] = useState('');
  const [labelColors, setLabelColors] = useState({});
  const [colorPickerFor, setColorPickerFor] = useState(null);

  const [assignItemId, setAssignItemId] = useState('');
  const [assignLabelId, setAssignLabelId] = useState('');
  const [assignFieldId, setAssignFieldId] = useState('');
  const [assignChoiceId, setAssignChoiceId] = useState('');

  async function fetchLabels() {
    try {
      const res = await fetch('/api/labels');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLabels(data.labels || []);
      setError(null);
    } catch (err) { setError(err.message); }
  }

  async function fetchFolders() {
    try {
      const res = await fetch('/api/folders');
      const data = await res.json();
      if (data.folders) setFolders(data.folders);
    } catch (err) {}
  }

  async function fetchLabelColors() {
    try {
      const res = await fetch('/api/label-colors');
      const data = await res.json();
      if (data.colors) setLabelColors(data.colors);
    } catch (err) {}
  }

  async function setLabelColor(labelId, color) {
    try {
      await fetch('/api/label-colors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelId, color }),
      });
      setLabelColors({ ...labelColors, [labelId]: color });
      setColorPickerFor(null);
    } catch (err) { setMessage(`Error guardando color: ${err.message}`); }
  }

  useEffect(() => { fetchLabels(); fetchFolders(); fetchLabelColors(); }, []);

  async function handleCreateLabel(e) {
    e.preventDefault();
    const validChoices = newChoices.map((c) => c.trim()).filter(Boolean);
    if (!newTitle.trim()) return;
    setBusy(true); setMessage(null);
    try {
      const res = await fetch('/api/labels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), fieldName: newFieldName.trim() || 'Estado', choices: validChoices }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error creando label');
      setMessage(`Label "${newTitle}" creado y publicado con ${validChoices.length} opcion(es).`);
      setNewTitle('');
      setNewFieldName('Estado');
      setNewChoices(['']);
      fetchLabels();
    } catch (err) { setMessage(`Error: ${err.message}`); }
    finally { setBusy(false); }
  }

  function addChoiceRow() { setNewChoices([...newChoices, '']); }
  function updateChoiceRow(i, value) {
    const copy = [...newChoices]; copy[i] = value; setNewChoices(copy);
  }
  function removeChoiceRow(i) { setNewChoices(newChoices.filter((_, idx) => idx !== i)); }

  async function handleAddChoiceSubmit(e, labelId, fieldId) {
    e.preventDefault();
    if (!addChoiceName.trim()) return;
    try {
      const res = await fetch(`/api/labels/${labelId}/choices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldId, name: addChoiceName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error agregando opcion');
      setAddChoiceFor(null);
      setAddChoiceName('');
      fetchLabels();
    } catch (err) { setMessage(`Error: ${err.message}`); }
  }

  async function handleRenameLabel(labelId, currentTitle) {
    const newTitle = prompt('Nuevo nombre del label:', currentTitle);
    if (!newTitle || !newTitle.trim()) return;
    try {
      const res = await fetch(`/api/labels/${labelId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error renombrando');
      fetchLabels();
    } catch (err) { setMessage(`Error: ${err.message}`); }
  }

  async function handleRenameField(labelId, fieldId, currentName) {
    const newName = prompt('Nuevo nombre del campo:', currentName);
    if (!newName || !newName.trim()) return;
    try {
      const res = await fetch(`/api/labels/${labelId}/field/${fieldId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error renombrando campo');
      fetchLabels();
    } catch (err) { setMessage(`Error: ${err.message}`); }
  }

  async function handleDisableLabel(labelId) {
    if (!confirm('Esto deshabilita el label: dejara de estar disponible para aplicarse a archivos nuevos. ¿Continuar?')) return;
    try {
      const res = await fetch(`/api/labels/${labelId}/disable`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error deshabilitando');
      setMessage('Label deshabilitado. Ya puedes intentar "Eliminar definitivamente".');
      fetchLabels();
    } catch (err) { setMessage(`Error: ${err.message}`); }
  }

  async function handleDeleteLabel(labelId) {
    if (!confirm('Esto elimina el label DEFINITIVAMENTE, sin poder deshacerlo. ¿Continuar?')) return;
    try {
      const res = await fetch(`/api/labels/${labelId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error eliminando');
      setMessage('Label eliminado definitivamente.');
      fetchLabels();
    } catch (err) { setMessage(`Error: ${err.message}`); }
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!assignItemId || !assignLabelId || !assignFieldId || !assignChoiceId) {
      setMessage('Error: llena carpeta/ID, label, campo y opcion.');
      return;
    }
    try {
      const res = await fetch('/api/labels/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: assignItemId, labelId: assignLabelId, fieldId: assignFieldId, choiceId: assignChoiceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error asignando');
      setMessage('Label asignado correctamente.');
    } catch (err) { setMessage(`Error: ${err.message}`); }
  }

  const selectedLabel = labels.find((l) => l.id === assignLabelId);
  const selectedField = selectedLabel?.fields?.[0];
  const hasChoices = selectedField?.selectionOptions?.choices?.length > 0;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Etiquetas</h1>
        <Link href="/" style={{ fontSize: 14, color: '#1a73e8', textDecoration: 'none' }}>← Volver a Mi Drive</Link>
      </div>

      <div style={{ background: '#e6f4ea', color: '#188038', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
        Crear labels con sus opciones, renombrar, agregar mas opciones y asignar - todo funciona por API en esta pagina.
      </div>

      {message && (
        <div style={{ background: message.startsWith('Error') ? '#fce8e6' : '#e6f4ea', color: message.startsWith('Error') ? '#c5221f' : '#188038',
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}
      {error && <div style={{ color: '#d93025', marginBottom: 16, fontSize: 13 }}>Error cargando labels: {error}</div>}

      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: '0 0 12px' }}>Crear nuevo label</h2>
        <form onSubmit={handleCreateLabel}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input style={inputStyle()} placeholder="Nombre del label (ej: Prioridad)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <input style={{ ...inputStyle(), flex: '0 0 180px' }} placeholder="Nombre del campo" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} />
          </div>

          {newChoices.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={inputStyle()} placeholder="Nombre de la opcion (ej: Alta)" value={c} onChange={(e) => updateChoiceRow(i, e.target.value)} />
              {newChoices.length > 1 && (
                <button type="button" onClick={() => removeChoiceRow(i)} style={buttonStyle(false, { padding: '4px 10px' })}>×</button>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={addChoiceRow} style={buttonStyle(false)}>+ Agregar opcion</button>
            <button type="submit" disabled={busy} style={buttonStyle(true)}>Crear label</button>
          </div>
        </form>
      </div>

      <div style={{ marginBottom: 20 }}>
        {labels.map((label) => {
          const field = label.fields?.[0];
          const choices = field?.selectionOptions?.choices || [];
          return (
            <div key={label.id} style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, position: 'relative' }}>
                <span style={{ fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setColorPickerFor(colorPickerFor === label.id ? null : label.id)}
                    title="Cambiar color (solo visual, no afecta Google)"
                    style={{
                      width: 14, height: 14, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.15)',
                      background: LOCAL_COLORS[labelColors[label.id]] || LOCAL_COLORS.gray, cursor: 'pointer', padding: 0,
                    }}
                  />
                  {label.properties?.title}
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
                    background: label.lifecycle?.state === 'DISABLED' ? '#fce8e6' : '#e6f4ea',
                    color: label.lifecycle?.state === 'DISABLED' ? '#c5221f' : '#188038',
                  }}>
                    {label.lifecycle?.state === 'DISABLED' ? 'Deshabilitado' : 'Publicado'}
                  </span>
                </span>
                {colorPickerFor === label.id && (
                  <div style={{ position: 'absolute', top: 24, left: 0, background: '#fff', border: '1px solid #dadce0', borderRadius: 8, padding: 8, display: 'flex', gap: 6, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 10 }}>
                    {Object.keys(LOCAL_COLORS).map((col) => (
                      <button key={col} onClick={() => setLabelColor(label.id, col)}
                        style={{ width: 20, height: 20, borderRadius: '50%', background: LOCAL_COLORS[col], border: '1px solid rgba(0,0,0,0.15)', cursor: 'pointer', padding: 0 }} />
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleRenameLabel(label.id, label.properties?.title)} style={buttonStyle(false, { padding: '4px 10px', fontSize: 12 })}>Renombrar</button>
                  {label.lifecycle?.state === 'DISABLED' ? (
                    <button onClick={() => handleDeleteLabel(label.id)} style={buttonStyle(false, { padding: '4px 10px', fontSize: 12, color: '#d93025', borderColor: '#f6c6c2' })}>Eliminar definitivamente</button>
                  ) : (
                    <button onClick={() => handleDisableLabel(label.id)} style={buttonStyle(false, { padding: '4px 10px', fontSize: 12, color: '#d93025', borderColor: '#f6c6c2' })}>Deshabilitar</button>
                  )}
                </div>
              </div>

              {field && (
                <div style={{ fontSize: 13, color: '#5f6368', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Campo: <strong>{field.properties?.displayName}</strong>
                  <button onClick={() => handleRenameField(label.id, field.id, field.properties?.displayName)} style={buttonStyle(false, { padding: '2px 8px', fontSize: 11 })}>Renombrar campo</button>
                </div>
              )}

              {choices.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {choices.map((choice) => (
                    <span key={choice.id} style={{ fontSize: 12, border: '1px solid #dadce0', borderRadius: 999, padding: '4px 10px' }}>
                      {choice.properties?.displayName}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#9aa0a6', marginBottom: 8 }}>Sin opciones todavia</div>
              )}

              {addChoiceFor === label.id ? (
                <form onSubmit={(e) => handleAddChoiceSubmit(e, label.id, field.id)} style={{ display: 'flex', gap: 8 }}>
                  <input style={inputStyle()} placeholder="Nueva opcion" value={addChoiceName} onChange={(e) => setAddChoiceName(e.target.value)} autoFocus />
                  <button type="submit" style={buttonStyle(true, { padding: '4px 10px', fontSize: 12 })}>Agregar</button>
                  <button type="button" onClick={() => setAddChoiceFor(null)} style={buttonStyle(false, { padding: '4px 10px', fontSize: 12 })}>Cancelar</button>
                </form>
              ) : (
                <button onClick={() => setAddChoiceFor(label.id)} style={buttonStyle(false, { padding: '4px 10px', fontSize: 12 })}>+ Agregar opcion</button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: '0 0 12px' }}>Asignar etiqueta a una carpeta o archivo</h2>
        <form onSubmit={handleAssign}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select style={inputStyle()} value={assignItemId} onChange={(e) => setAssignItemId(e.target.value)}>
              <option value="">Elige una carpeta...</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 12, color: '#5f6368', marginBottom: 8 }}>
            O pega directamente un ID de archivo/carpeta:
            <input style={{ ...inputStyle(), marginTop: 4 }} placeholder="ID de Drive" value={assignItemId} onChange={(e) => setAssignItemId(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select style={inputStyle()} value={assignLabelId} onChange={(e) => {
              const lbl = labels.find((l) => l.id === e.target.value);
              setAssignLabelId(e.target.value);
              setAssignFieldId(lbl?.fields?.[0]?.id || '');
              setAssignChoiceId('');
            }}>
              <option value="">Elige un label...</option>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.properties?.title}</option>)}
            </select>
            <select style={inputStyle()} value={assignChoiceId} onChange={(e) => setAssignChoiceId(e.target.value)} disabled={!hasChoices}>
              <option value="">{hasChoices ? 'Elige la opcion...' : 'Este label no tiene opciones'}</option>
              {selectedField?.selectionOptions?.choices?.map((c) => (
                <option key={c.id} value={c.id}>{c.properties?.displayName}</option>
              ))}
            </select>
          </div>
          <button type="submit" style={buttonStyle(true)}>Asignar</button>
        </form>
      </div>
    </main>
  );
}
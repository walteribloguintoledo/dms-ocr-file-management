import { useState } from "react";

export function CatalogSelect({label, value, items, canAdd, onChange, onAdd}: {
  label: string; value: string; items: string[]; canAdd: boolean;
  onChange: (value: string) => void; onAdd: (name: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true); setError("");
    try { await onAdd(name.trim()); setName(""); setAdding(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to add item."); }
    finally { setBusy(false); }
  }
  return <>
    <select aria-label={label} value={value} disabled={busy} onChange={event => {
      if (event.target.value === "__add_item__") { setAdding(true); setError(""); }
      else onChange(event.target.value);
    }}>
      {!items.includes(value) && <option value={value}>{value || `Select ${label.toLowerCase()}`}</option>}
      {items.map(item => <option key={item} value={item}>{item}</option>)}
      <option value="__add_item__" disabled={!canAdd}>{canAdd ? "+ Add item…" : "Add item — administrator only"}</option>
    </select>
    {!adding && (canAdd
      ? <button type="button" className="text-button" style={{marginTop:6,justifySelf:"start"}} onClick={() => {setAdding(true);setError("");}}>+ Add item</button>
      : <small>Only an administrator can add new choices.</small>)}
    {adding && canAdd && <span style={{display:"grid",gap:8,marginTop:8}}>
      <input aria-label={`New ${label.toLowerCase()}`} autoFocus maxLength={100} value={name} disabled={busy} placeholder={`New ${label.toLowerCase()}`} onChange={e => setName(e.target.value)} onKeyDown={e => { if(e.key === "Enter") {e.preventDefault(); void save();} }} />
      <span style={{display:"flex",gap:8}}>
        <button type="button" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? "Adding…" : "Add"}</button>
        <button type="button" disabled={busy} onClick={() => {setAdding(false);setName("");setError("");}}>Cancel</button>
      </span>
      {error && <span role="alert">{error}</span>}
    </span>}
  </>;
}

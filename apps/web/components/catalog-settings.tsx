import {useEffect,useState} from 'react';
import {request} from '../lib/api';
type Item={id:string;name:string;enabled:boolean};
export function CatalogSettings({apiUrl,kind,title,onChanged}:{apiUrl:string;kind:string;title:string;onChanged:()=>Promise<void>}){
  const [items,setItems]=useState<Item[]>([]),[name,setName]=useState(''),[editing,setEditing]=useState<Item|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  async function load(){setItems(await request(apiUrl,`/catalogs/${kind}`));setLoaded(true);}
  useEffect(()=>{let active=true;request(apiUrl,`/catalogs/${kind}`).then(data=>{if(active){setItems(data);setLoaded(true);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[apiUrl,kind]);
  async function save(item?:Item){
    setBusy(true);setError('');
    try{
      await request(apiUrl,item?`/catalogs/${kind}/${item.id}`:`/${kind}`,{method:item?'PATCH':'POST',body:JSON.stringify(item?{name:item.name,enabled:item.enabled}:{name:name.trim()})});
      setEditing(null);setName('');await load();await onChanged();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="panel form-panel catalog-settings" style={{marginTop:22}}><h2>{title}</h2>
    <p className="muted">Edit names and enable or disable choices for new selections. Existing document values are retained.</p>
    {error&&<p role="alert" className="auth-error">{error}</p>}
    <form className="catalog-add-form" onSubmit={e=>{e.preventDefault();void save();}}><label>New {kind==='departments'?'department':'document type'}<input value={name} maxLength={100} required disabled={busy} onChange={e=>setName(e.target.value)} /></label><button className="primary catalog-add-button" disabled={busy||!name.trim()}>Add {kind==='departments'?'department':'document type'}</button></form>
    {!loaded&&!error&&<p>Loading…</p>}
    <div className="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map(item=><tr key={item.id}>
      <td>{editing?.id===item.id?<input aria-label="Edit name" value={editing.name} maxLength={100} disabled={busy} onChange={e=>setEditing({...editing,name:e.target.value})}/>:item.name}</td>
      <td>{item.enabled?'Enabled':'Disabled'}</td><td><div className="actions catalog-row-actions">
        {editing?.id===item.id?<><button disabled={busy||!editing.name.trim()} onClick={()=>void save(editing)}>Save</button><button disabled={busy} onClick={()=>setEditing(null)}>Cancel</button></>:<button disabled={busy} onClick={()=>setEditing({...item})}>Edit</button>}
        <button disabled={busy||!!editing} onClick={()=>void save({...item,enabled:!item.enabled})}>{item.enabled?'Disable':'Enable'}</button>
      </div></td></tr>)}</tbody></table></div>
  </section>;
}

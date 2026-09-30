import {useEffect, useState} from 'react';
import {request} from '../lib/api';

type ManagedUser={id:string;name:string;email:string;role:string;active:boolean};
export function UserList({apiUrl,revision}:{apiUrl:string;revision:unknown}) {
  const [users,setUsers]=useState<ManagedUser[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [resetId,setResetId]=useState('');
  const [password,setPassword]=useState('');
  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError('');
    request(apiUrl,'/users').then(data=>{if(!cancelled)setUsers(data);})
      .catch(e=>{if(!cancelled)setError(e.message);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[apiUrl,revision]);
  async function update(user:ManagedUser,change:Record<string,unknown>){
    setBusy(user.id);setError('');setMessage('');
    try {
      await request(apiUrl,`/users/${user.id}`,{method:'PATCH',body:JSON.stringify(change)});
      setUsers(old=>old.map(u=>u.id===user.id?{...u,...('role' in change?{role:change.role as string}:{}),...('active' in change?{active:change.active as boolean}:{})}:u));
      setMessage(`${user.name}: ${'password' in change?'password reset':'account updated'}. Existing sessions have been signed out.`);
      if('password' in change){setPassword('');setResetId('');}
    } catch(e){setError((e as Error).message);}finally{setBusy('');}
  }
  return <div style={{marginTop:24}}>
    <h3>Users</h3>
    {error&&<p role="alert" className="auth-error">{error}</p>}
    {message&&<p role="status">{message}</p>}
    {loading?<p role="status">Loading users…</p>:<div className="table-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Role</th><th>Actions</th></tr></thead>
      <tbody>{users.map(user=><tr key={user.id}>
        <td>{user.name}</td><td>{user.email}</td>
        <td><span className={`badge ${user.active?'approved':'archived'}`}>{user.active?'Active':'Inactive'}</span></td>
        <td><select aria-label={`Role for ${user.name}`} value={user.role} disabled={!!busy}
          onChange={e=>void update(user,{role:e.target.value})}>
          {['ADMIN','ENCODER','REVIEWER','READ_ONLY'].map(role=><option key={role} value={role}>{role.replaceAll('_',' ')}</option>)}
        </select></td>
        <td><div className="actions">
          <button disabled={!!busy} onClick={()=>void update(user,{active:!user.active})}>{user.active?'Deactivate':'Activate'}</button>
          <button disabled={!!busy} onClick={()=>{setResetId(user.id);setPassword('');setError('');}}>Reset password</button>
        </div>
        {resetId===user.id&&<form style={{marginTop:12}} onSubmit={e=>{e.preventDefault();void update(user,{password});}}>
          <label>New password for {user.name}<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} disabled={!!busy} onChange={e=>setPassword(e.target.value)} /></label>
          <small>Use 12–128 characters.</small>
          <div className="actions"><button disabled={!!busy||password.length<12} type="submit">Save new password</button><button disabled={!!busy} type="button" onClick={()=>{setPassword('');setResetId('');}}>Cancel</button></div>
        </form>}</td>
      </tr>)}</tbody>
    </table>{!users.length&&<p>No users found.</p>}</div>}
  </div>;
}

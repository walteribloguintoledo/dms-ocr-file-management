import {useEffect, useRef, useState} from 'react';
import {LogOut} from 'lucide-react';

export function UserMenu({name, onSignOut}:{name:string; onSignOut:()=>void}) {
  const [open,setOpen]=useState(false);
  const container=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    function outside(event:PointerEvent){
      if(!container.current?.contains(event.target as Node))setOpen(false);
    }
    document.addEventListener('pointerdown',outside);
    return ()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  return <div className="user-menu" ref={container}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}
    onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();setOpen(false);trigger.current?.focus();}}}>
    <button ref={trigger} type="button" className="avatar user-menu-trigger"
      aria-label={`User options for ${name}`} aria-expanded={open} aria-controls="user-options"
      onClick={()=>setOpen(value=>!value)}>{name[0]?.toUpperCase() || 'D'}</button>
    {open&&<div id="user-options" className="user-menu-dropdown">
      <strong>{name}</strong>
      <button type="button" onClick={()=>{setOpen(false);onSignOut();}}>
        <LogOut size={16} aria-hidden="true" />Sign out
      </button>
    </div>}
  </div>;
}

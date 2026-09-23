import {useState} from 'react';
import {paperSizes, paperDimensions} from '../../../shared/paper-sizes.mjs';
export function PaperSizeSelect({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const [custom,setCustom]=useState(false);
  const [width,setWidth]=useState('210');
  const [height,setHeight]=useState('297');
  const [error,setError]=useState('');
  return <>
    <select aria-label="Page size" value={value} onChange={e=>{
      if(e.target.value==='custom') {setCustom(true);setError('');}
      else {onChange(e.target.value);setCustom(false);}
    }}>
      {!Object.hasOwn(paperSizes,value) && <option value={value}>{value}</option>}
      {Object.keys(paperSizes).map(name=><option key={name}>{name}</option>)}
      <option value="custom">Custom…</option>
    </select>
    {custom && <span style={{display:'grid',gap:8,marginTop:8}}>
      <input aria-label="Custom width in millimetres" type="number" min={25} max={216} step="0.01" value={width} onChange={e=>setWidth(e.target.value)} placeholder="Width (mm)" />
      <input aria-label="Custom height in millimetres" type="number" min={25} max={5588} step="0.01" value={height} onChange={e=>setHeight(e.target.value)} placeholder="Height (mm)" />
      <small>Width × height in millimetres</small>
      <button type="button" onClick={()=>{try {const size=`Custom: ${Number(width)}x${Number(height)}mm`;paperDimensions(size);onChange(size);setCustom(false);}catch(e){setError((e as Error).message);}}}>Apply custom size</button>
      <button type="button" onClick={()=>setCustom(false)}>Cancel</button>
      {error && <span role="alert">{error}</span>}
    </span>}
    <small>Long-page availability depends on the scanner driver and DPI. Business Card uses 55 × 91 mm.</small>
  </>;
}

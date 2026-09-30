import {useState} from 'react';
import {Page} from '../lib/types';
import {ReceiptRow,receiptRow,receiptWorkbook} from '../lib/receipt-report';
export function ScanInvoiceReport({pages,disabled}:{pages:Page[];disabled:boolean}){
 const [rows,setRows]=useState<ReceiptRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const visible=rows.filter(row=>pages.some(p=>p.id===row.id));
 const invalid=!visible.length||visible.some(r=>!r.company.trim()||!r.date.trim()||!/^\d+(\.\d{1,2})?$/.test(r.total)||!Number.isFinite(Number(r.total)));
 async function exportFile(){setBusy(true);setError('');try{const data=await receiptWorkbook(visible);const url=URL.createObjectURL(new Blob([new Uint8Array(data)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download='Folio360-scanned-invoices.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="panel form-panel" style={{marginBottom:20}}><h2>Receipt extraction and Excel report</h2>
 <p>Scan or import receipts below, run OCR, then extract. One receipt per page. Company uses the first nonblank line; address uses the second. Review all values and use one currency per export.</p>
 <div className="actions"><button disabled={disabled||busy||!pages.some(p=>p.text.trim())} onClick={()=>{setRows(pages.filter(p=>p.text.trim()).map(receiptRow));setError('');}}>Extract / refresh receipt rows</button><button className="primary" disabled={disabled||busy||invalid} onClick={()=>void exportFile()}>{busy?'Exporting…':'Export Excel'}</button></div>
 <p className="muted">Refreshing replaces edits below. Draft rows are not saved when you leave this menu.</p>
 {error&&<p role="alert">{error}</p>}
 {!!visible.length&&<div className="table-wrap"><table><thead><tr>{['item_no','company','address','tin#','date','total amount'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{visible.map((r,i)=><tr key={r.id}><td>{i+1}</td>{(['company','address','tin','date','total'] as const).map(key=><td key={key}><input aria-label={`${key} receipt ${i+1}`} value={r[key]} disabled={busy||disabled} onChange={e=>setRows(old=>old.map(row=>row.id===r.id?{...row,[key]:e.target.value}:row))}/></td>)}</tr>)}</tbody><tfoot><tr><td colSpan={5}>Total accumulated</td><td>{visible.reduce((sum,row)=>sum+(Number(row.total)||0),0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr></tfoot></table></div>}
 {visible.length>0&&invalid&&<p role="status">Complete company, date, and a valid total amount for every row before exporting.</p>}
 </section>;
}

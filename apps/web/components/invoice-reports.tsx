import {useState} from 'react';
import {request} from '../lib/api';
import {Doc} from '../lib/types';
import {replaceInvoiceOcrPage,extractInvoice,newInvoicePages,isInvoiceDocument,invoiceFields,invoiceWorkbook,InvoiceRow,reportIssues} from '../lib/invoice-report';

export function InvoiceReports({documents,onOpen,apiUrl,canSave,onSaved}:{documents:Doc[];onOpen:(doc:Doc)=>void;apiUrl:string;canSave:boolean;onSaved:(doc:Doc)=>void}) {
  const [ocrDrafts,setOcrDrafts]=useState<Record<string,string>>({});
  const [ocrMessage,setOcrMessage]=useState('');
  const [rows,setRows]=useState<InvoiceRow[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [query,setQuery]=useState('');
  const [type,setType]=useState('All');
  const [from,setFrom]=useState('');const [to,setTo]=useState('');
  const [active,setActive]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const visible=documents.filter(isInvoiceDocument).filter(d=>(`${d.title} ${d.documentNumber} ${d.metadata.documentType||''}`).toLowerCase().includes(query.toLowerCase()) && (type==='All'||(d.metadata.documentType||'').trim().toLowerCase()===type.toLowerCase()) && (!from||d.createdAt.slice(0,10)>=from) && (!to||d.createdAt.slice(0,10)<=to));
  const current=rows.find(r=>r.rowId===active);
  const ocrDraft=current ? (ocrDrafts[current.rowId] ?? current.sourceText) : '';
  const ocrDirty=!!current && ocrDraft!==current.sourceText;
  const source=documents.find(d=>d.id===current?.documentId);
  function update(key:string,value:string){setRows(old=>old.map(r=>r.rowId===active?{...r,[key]:value,reviewed:false}:r));}
  function extract(){
    setError('');
    const added=newInvoicePages(documents,selected,rows);
    if(!added.length){setError('Select documents with stored OCR text that are not already in this report.');return;}
    setRows(old=>[...old,...added]);setActive(added[0].rowId);
  }
  async function saveOcr(){
    if(!current || !source)return;
    setBusy(true);setError('');setOcrMessage('');
    try {
      const text=replaceInvoiceOcrPage(source.ocrText,current.rowId,source.id,ocrDraft);
      const updated=await request(apiUrl,`/documents/${source.id}/ocr`,{method:'PATCH',body:JSON.stringify({text,expectedText:source.ocrText})});
      onSaved(updated);
      setOcrMessage('OCR text saved to the database. Refresh extracted invoice to update its fields.');
    } catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function exportReport(){
    if(!rows.length||rows.some(r=>!r.reviewed||reportIssues(r).length)){setError('Review and confirm every invoice before exporting.');return;}
    setBusy(true);setError('');
    try{const buffer=await invoiceWorkbook(rows);const url=URL.createObjectURL(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download=`Folio360-invoices-${new Date().toISOString().slice(0,10)}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div>
    <section className="panel form-panel">
      <h2>Sales and Services Invoice Report</h2>
      <p>Choose documents, extract invoice details, review against the original, and export Excel. Draft changes stay in this session and do not change source documents. Export before leaving Reports.</p>
      <div className="form-grid">
        <label>Find source documents<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Title, reference, or document type" /></label>
        <label>Invoice type filter<select value={type} onChange={e=>setType(e.target.value)}><option>All</option><option>Sales invoice</option><option>Service invoice</option></select></label>
        <label>Document added from<input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label>
        <label>Document added through<input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
      </div>
      <p className="muted">Showing accessible documents loaded in this workspace (up to 500). Dates filter document upload dates, not invoice dates.</p>
      <div className="table-wrap" style={{maxHeight:300,overflow:'auto'}}><table><thead><tr><th>Select</th><th>Document</th><th>OCR</th><th>Action</th></tr></thead><tbody>
        {visible.map(d=><tr key={d.id}><td><input type="checkbox" aria-label={`Include ${d.title}`} disabled={!d.ocrText?.trim()} checked={selected.includes(d.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,d.id]:old.filter(id=>id!==d.id))} /></td><td>{d.title}<small style={{display:'block'}}>{d.documentNumber}</small></td><td>{d.ocrText?.trim()?'Available':'Run OCR and upload a searchable version first'}</td><td><button onClick={()=>onOpen(d)}>View document</button></td></tr>)}
      </tbody></table></div>
      {!visible.length&&<p>No matching documents.</p>}
      <div className="actions" style={{marginTop:16}}><button disabled={!selected.length||busy} onClick={extract}>Extract selected invoices</button><button className="primary" disabled={busy||!rows.length||rows.some(r=>!r.reviewed)} onClick={()=>void exportReport()}>{busy?'Creating Excel…':'Export printable Excel'}</button></div>
      {error&&<p role="alert" className="auth-error">{error}</p>}
    </section>
    {!!rows.length&&<section className="panel form-panel" style={{marginTop:20}}>
      <h2>Review extracted invoices ({rows.filter(r=>r.reviewed).length}/{rows.length})</h2>
      <label>Invoice to review<select value={active} onChange={e=>setActive(e.target.value)}><option value="">Select invoice</option>{rows.map(r=><option key={r.rowId} value={r.rowId}>{r.title} — {r.reviewed?'✓ Confirmed':'Needs review'}</option>)}</select></label>
      {current&&<div className={`invoice-review-card${current.reviewed?' is-confirmed':''}`}>
        <div className="invoice-review-status" role="status" aria-live="polite">
          <strong>{current.reviewed?'✓ Confirmed':'Needs review'}</strong>
          <span>{current.reviewed?'This invoice is confirmed and ready to export. Editing a field requires confirmation again.':'Check the invoice details, then select Confirm reviewed.'}</span>
        </div>
        <p>Each OCR page creates an invoice entry. Invoice type comes from document metadata; VAT classification defaults to Vatable and currency to PHP. Review and correct these values against the original.</p>
        <div className="form-grid">{invoiceFields.map(([key,label])=><label key={key}>{label}
          {['invoiceType','vatStatus'].includes(key)?<select value={current[key]} onChange={e=>update(key,e.target.value)}>{(key==='invoiceType'?Array.from(new Set([current.invoiceType,'Unconfirmed','Sales invoice','Service invoice'])):['Unconfirmed','Vatable','Non-vatable','Mixed']).map(v=><option key={v}>{v}</option>)}</select>:
          key==='address'?<textarea value={current[key]} onChange={e=>update(key,e.target.value)} />:<input value={current[key]} inputMode={key==='totalDue'?'decimal':undefined} maxLength={500} onChange={e=>update(key,e.target.value)} placeholder={key==='transactionDate'?'YYYY-MM-DD or date as printed':key==='currency'?'PHP, USD, etc.':''} />}
        </label>)}</div>
        <p className="muted">{reportIssues(current).length?`Check required fields: ${reportIssues(current).join(', ')}`:'Required fields are filled. Check all values against the source.'}</p>
        <div className="actions"><button disabled={current.reviewed || ocrDirty || !!reportIssues(current).length} onClick={()=>setRows(old=>old.map(r=>r.rowId===active?{...r,reviewed:true}:r))}>{current.reviewed?'✓ Confirmed':'Confirm reviewed'}</button><button onClick={()=>{setRows(old=>old.filter(r=>r.rowId!==active));setActive('');}}>Remove from report</button>{source&&<button onClick={()=>onOpen(source)}>Open original</button>}</div>
        <details style={{marginTop:20}}><summary>Source OCR text</summary>
          <p className="muted">Edit this page’s text, then refresh its extracted fields. This replaces manual field edits for this invoice and requires confirmation again. Use Save OCR text to persist this page to the database. Saving returns the document to Uploaded status; the original file is unchanged.</p>
          <label>OCR text for this invoice<textarea disabled={busy} rows={16} style={{fontFamily:'monospace',width:'100%',resize:'vertical'}} value={ocrDraft}
            onChange={e=>{setOcrDrafts(old=>({...old,[current.rowId]:e.target.value}));setRows(old=>old.map(r=>r.rowId===current.rowId?{...r,reviewed:false}:r));setOcrMessage('');}} /></label>
          <button type="button" disabled={!ocrDraft.trim() || busy} onClick={()=>{
            const extracted=extractInvoice({id:current.documentId,documentNumber:current.reference,title:current.title,ocrText:ocrDraft,metadata:source?.metadata || {documentType:current.invoiceType}});
            setRows(old=>old.map(r=>r.rowId===current.rowId?{...extracted,rowId:r.rowId}:r));
            setOcrMessage(`Refreshed ${current.title}. Review the updated fields and confirm again.`);
          }}>Refresh extracted invoice</button>
          {canSave && source?.status!=='ARCHIVED' && <button type="button" disabled={busy || !ocrDraft.trim()} onClick={()=>void saveOcr()}>{busy?'Saving…':'Save OCR text'}</button>}
          {ocrDirty&&<p role="status">OCR text changed. Refresh the extracted invoice before confirming.</p>}
          {ocrMessage&&<p role="status">{ocrMessage}</p>}
        </details>
      </div>}
    </section>}
  </div>;
}

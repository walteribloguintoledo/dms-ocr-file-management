export type InvoiceRow = {
  rowId:string; sourceText:string; documentId:string; reference:string; title:string; invoiceType:string;
  vendor:string; address:string; vatTin:string; vatStatus:string;
  invoiceNumber:string; transactionDate:string; transactionTime:string;
  transactionNumber:string; totalDue:string; currency:string; reviewed:boolean;
};
export const invoiceFields = [
  ['invoiceType','Invoice type'],['vendor','Vendor company'],['address','Address'],
  ['vatTin','VAT REG TIN'],['vatStatus','Sales VAT classification'],
  ['invoiceNumber','Invoice number'],['transactionDate','Transaction date'],
  ['transactionTime','Transaction time'],['transactionNumber','Transaction number'],
  ['totalDue','Total amount due'],['currency','Currency'],
] as const;
type InvoiceSource = {id:string; documentNumber:string; title:string; ocrText:string; metadata?:Record<string,string>};
export function extractInvoicePages(doc:InvoiceSource):InvoiceRow[] {
  const text=doc.ocrText || '';
  const markers=[...text.matchAll(/^--- Page (\d+) ---\s*$/gm)];
  if(!markers.length) return [extractInvoice(doc)];
  return markers.map((marker,index)=>{
    const page=marker[1];
    const sourceText=text.slice(marker.index!+marker[0].length,markers[index+1]?.index ?? text.length).trim();
    return {...extractInvoice({...doc,ocrText:sourceText}),rowId:`${doc.id}:page:${index+1}`,title:`${doc.title} — Page ${page}`,reference:`${doc.documentNumber} / Page ${page}`};
  });
}
export function isInvoiceDocument(doc:{metadata?:Record<string,string>}):boolean {
  return ['sales invoice','service invoice'].includes(doc.metadata?.documentType?.trim().toLowerCase() || '');
}
export function newInvoicePages(documents:InvoiceSource[], selected:string[], existing:InvoiceRow[]):InvoiceRow[] {
  const included=new Set(existing.map(row=>row.rowId));
  return documents.filter(doc=>isInvoiceDocument(doc) && selected.includes(doc.id) && doc.ocrText?.trim())
    .flatMap(extractInvoicePages).filter(row=>row.sourceText.trim() && !included.has(row.rowId));
}
export function firstDateAndTime(text:string) {
  const months='Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  const datePattern=new RegExp(`(?<![\\w/.-])(?:\\d{4}([/.-])\\d{1,2}\\1\\d{1,2}|\\d{1,2}([/.-])\\d{1,2}\\2(?:\\d{4}|\\d{2})|(?:${months})\\.?[ \\t]+\\d{1,2}(?:st|nd|rd|th)?(?:,[ \\t]*|[ \\t]+)\\d{4}|\\d{1,2}(?:st|nd|rd|th)?[ \\t]+(?:${months})\\.?[ \\t]+\\d{4})(?![\\w/.-])`,'gi');
  const date=[...text.matchAll(datePattern)].find(match=>{
    const numeric=match[0].split(/[/.-]/);
    if(numeric.length!==3 || !numeric.every(part=>/^\d+$/.test(part)))return true;
    const [a,b,c]=numeric.map(Number);
    const year=numeric[0].length===4?a:(c<100?2000+c:c);
    const valid=(month:number,day:number)=>month>=1&&month<=12&&day>=1&&day<=new Date(Date.UTC(year,month,0)).getUTCDate();
    return numeric[0].length===4?valid(b,c):valid(a,b)||valid(b,a);
  })?.[0] || '';
  const time=text.match(/(?<![\w:])(?:(?:0?[1-9]|1[0-2]):[0-5]\d(?::[0-5]\d)?[ \t]*[ap]\.?m\.?|(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?![ \t]*[ap]\.?m)|(?:0?[1-9]|1[0-2])[ \t]*[ap]\.?m\.?)(?![\w:])/i)?.[0] || '';
  return {date,time};
}
export function extractTotalDue(text:string):string {
  const lines=text.split(/\r?\n/).map(line=>line.trim());
  const value=/^(?:(?:PHP|USD|₱|\$)[ \t]*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)[ \t]*(?:PHP|USD|₱|\$)?[ \t|]*$/i;
  // Prefer explicit amount-due labels over a generic Total elsewhere on the page.
  const labels=[/^(?:TOTAL[ \t]+AMOUNT[ \t]+DUE|AMOUNT[ \t]+DUE|(?:TOTAL|TUTAL)[ \t]+DUE|TOTAL[ \t]+DE|GRAND[ \t]+TOTAL|TOTAL[ \t]+AMOUNT)\b[ \t]*[:=.-]?[ \t]*(.*)$/i,
    /^(?:TOTAL|TUTAL)\b[ \t]*[:=.-]?[ \t]*(.*)$/i,
    /^(?:TOTAL[ \t]+SALES|SALES[ \t]+TOTAL|SALES)\b[ \t]*[:=.-]?[ \t]*(.*)$/i,
    /^SUB[ \t]*-?[ \t]*TOTAL\b[ \t]*[:=.-]?[ \t]*(.*)$/i];
  for(const label of labels){
    for(let i=0;i<lines.length;i++){
      const match=lines[i].match(label);
      if(!match)continue;
      const candidate=match[1] || lines[i+1] || '';
      const amount=candidate.match(value)?.[1];
      if(amount)return amount.replaceAll(',','');
    }
  }
  return '';
}
export function extractTransactionNumber(text:string):string {
  const lines=text.split(/\r?\n/).map(line=>line.trim());
  const labels=[/^(?:TRANSACTION|TRANSAC|TRANS)\b\.?[ \t]*(?:NUMBER|NO\.?|#)[ \t]*[:#-]?[ \t]*(.*)$/i,
    /^(?:TRANSACTION|TRANSAC|TRANS)\b\.?[ \t]*[:#-]?[ \t]*(.*)$/i];
  for(const label of labels){
    for(let i=0;i<lines.length;i++){
      const match=lines[i].match(label);
      if(!match)continue;
      const value=(match[1] || lines[i+1] || '').match(/^([A-Z0-9][A-Z0-9/_.-]*)[ \t|]*$/i)?.[1];
      if(value && /\d/.test(value))return value;
    }
  }
  return '';
}
export function extractInvoiceNumber(text:string):string {
  const lines=text.split(/\r?\n/).map(line=>line.trim());
  const labels=[/^(?:(?:SI|SN)[ \t]*#|(?:(?:SALES|SERVICE)[ \t]+)?INVOICE[ \t]*(?:NUMBER|NO\.?|#))[ \t]*[:#-]?[ \t]*(.*)$/i,
    /^INVOICE\b[ \t]*[:#-]?[ \t]*(.*)$/i];
  for(const label of labels){
    for(let i=0;i<lines.length;i++){
      const match=lines[i].match(label);
      if(!match)continue;
      const value=(match[1] || lines[i+1] || '').match(/^([A-Z0-9][A-Z0-9/_.-]*)[ \t|]*$/i)?.[1];
      if(value && /\d/.test(value))return value;
    }
  }
  return '';
}
export function extractVatTin(text:string):string {
  const lines=text.split(/\r?\n/).map(line=>line.trim());
  const labels=[/^VAT[ \t]+(?:REG(?:ISTERED)?\.?[ \t]*(?:TIN)?|TIN)(?:[ \t]+(?:NO\.?|NUMBER))?[ \t]*[:#-]?[ \t]*(.*)$/i,
    /^TIN(?:[ \t]+(?:NO\.?|NUMBER))?[ \t]*[:#-]?[ \t]*(.*)$/i];
  for(const label of labels){
    for(let i=0;i<lines.length;i++){
      const match=lines[i].match(label);
      if(!match)continue;
      const value=(match[1] || lines[i+1] || '').match(/^([0-9][0-9 \t-]{6,24}[0-9])[ \t|]*$/)?.[1]?.trim();
      if(value)return value;
    }
  }
  return '';
}
export function extractInvoice(doc:InvoiceSource):InvoiceRow {
  const text=doc.ocrText || '';
  const {date,time}=firstDateAndTime(text);
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  // Defaults and OCR values remain editable and require review before export.
  const amount=extractTotalDue(text);
  return {rowId:doc.id,sourceText:text,documentId:doc.id,reference:doc.documentNumber,title:doc.title,
    invoiceType:doc.metadata?.documentType?.trim() || 'Unconfirmed',
    vendor:lines[0] || '',
    address:lines[2] || '',
    vatTin:extractVatTin(text),
    vatStatus:'Vatable',
    invoiceNumber:extractInvoiceNumber(text),
    transactionDate:date,transactionTime:time,
    transactionNumber:extractTransactionNumber(text),
    totalDue:amount.replaceAll(',',''),currency:'PHP',reviewed:false};
}
export function reportIssues(row:InvoiceRow) {
  const missing=['vendor','invoiceNumber','transactionDate','totalDue','currency'].filter(key=>!String(row[key as keyof InvoiceRow] ?? '').trim());
  if(row.totalDue && (!/^\d+(\.\d{1,2})?$/.test(row.totalDue) || !Number.isFinite(Number(row.totalDue)))) missing.push('valid amount');
  if(row.invoiceType==='Unconfirmed') missing.push('invoice type');
  if(row.vatStatus==='Unconfirmed') missing.push('VAT classification');
  return missing;
}
export async function invoiceWorkbook(rows:InvoiceRow[]) {
  const {default: ExcelJS}=await import('exceljs');
  const workbook=new ExcelJS.Workbook();
  workbook.creator='Folio360';workbook.created=new Date();
  const sheet=workbook.addWorksheet('Invoice register',{views:[{state:'frozen',ySplit:4}],pageSetup:{paperSize:5,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:4'}});
  sheet.columns=[{width:22},...invoiceFields.map(([key])=>({width:key==='address'?38:key==='vendor'?30:20})),{width:18}];
  sheet.mergeCells('A1:M1');sheet.getCell('A1').value='Folio360 — Sales and Service Invoice Report';
  sheet.getCell('A1').font={bold:true,size:18,color:{argb:'FF164C3D'}};
  sheet.mergeCells('A2:M2');sheet.getCell('A2').value='Reviewed OCR transcription • Amounts retain their stated currency • No tax calculations';
  sheet.getRow(4).values=['Document reference',...invoiceFields.map(([,label])=>label),'Review'];
  for(const r of rows){const line=sheet.addRow([r.reference,...invoiceFields.map(([key])=>key==='totalDue'?Number(r.totalDue):r[key]),'Reviewed']);line.height=42;line.getCell(11).numFmt='#,##0.00';}
  sheet.autoFilter={from:{row:4,column:1},to:{row:4,column:13}};
  sheet.getRow(4).height=32;
  sheet.getRow(4).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF164C3D'}};cell.font={bold:true,color:{argb:'FFFFFFFF'}};});
  sheet.eachRow(row=>row.eachCell(cell=>{cell.alignment={vertical:'top',wrapText:true};}));
  sheet.pageSetup.printArea=`A1:M${Math.max(4,sheet.rowCount)}`;
  // A readable portrait print view, one invoice per page, complements the register.
  const detail=workbook.addWorksheet('Printable invoices',{pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  detail.columns=[{width:28},{width:72}];
  rows.forEach((r,index)=>{
    const start=detail.rowCount+1;
    detail.mergeCells(start,1,start,2);detail.getCell(start,1).value='Folio360 — '+r.invoiceType;detail.getCell(start,1).font={bold:true,size:16};detail.getRow(start).height=32;
    detail.addRow(['Document reference',r.reference]);detail.addRow(['Source document',r.title]);
    for(const [key,label] of invoiceFields){const line=detail.addRow([label,key==='totalDue'?Number(r.totalDue):r[key]]);line.height=key==='address'?64:30;line.getCell(1).font={bold:true};if(key==='totalDue')line.getCell(2).numFmt='#,##0.00';}
    detail.addRow(['Review','Reviewed OCR transcription']);
    if(index<rows.length-1)detail.getRow(detail.rowCount).addPageBreak();
  });
  detail.eachRow(row=>row.eachCell(cell=>{cell.alignment={vertical:'top',wrapText:true};}));
  detail.pageSetup.printArea=`A1:B${detail.rowCount}`;
  return workbook.xlsx.writeBuffer();
}

export function replaceInvoiceOcrPage(text:string,rowId:string,documentId:string,edited:string):string {
  if(/^--- Page \d+ ---[ \t]*$/m.test(edited))throw new Error('Edit only this page’s text, without page markers.');
  if(rowId===documentId)return edited;
  const index=Number(rowId.slice((documentId+':page:').length))-1;
  const markers=[...text.matchAll(/^--- Page (\d+) ---[ \t]*\r?$/gm)];
  const marker=markers[index];
  if(!marker)throw new Error('Page boundaries changed. Reload the document before saving.');
  const start=marker.index!+marker[0].length;
  const end=markers[index+1]?.index ?? text.length;
  return text.slice(0,start)+'\n'+edited.trim()+'\n\n'+text.slice(end);
}

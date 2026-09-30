import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replaceInvoiceOcrPage,extractInvoice,extractInvoicePages,newInvoicePages,invoiceWorkbook,reportIssues} from '../apps/web/lib/invoice-report';
import {Workbook} from 'exceljs';
const source={id:'sample',documentNumber:'DOC-001',title:'Sample invoice',metadata:{documentType:'Service Invoice'},ocrText:`Sample Trading
SALES INVOICE
Vendor: Sample Trading
Address: 10 Example Road
TIN: 001-234-567-000
VAT REG TIN: 001-234-567-000
Invoice No: 000042
Transaction Date: 2026-09-23
Time: 10:30 AM
Transaction No: 000009
TOTAL AMOUNT DUE: PHP 1,234.50`};
test('invoice extraction uses first line, metadata and configured defaults',()=>{
 const r=extractInvoice(source);assert.equal(r.vendor,'Sample Trading');assert.equal(r.invoiceNumber,'000042');assert.equal(r.vatTin,'001-234-567-000');assert.equal(r.totalDue,'1234.50');assert.equal(r.transactionNumber,'000009');assert.equal(r.vatStatus,'Vatable');assert.equal(r.currency,'PHP');assert.equal(r.invoiceType,'Service Invoice');assert.equal(reportIssues(r).length,0);
 const empty=extractInvoice({...source,ocrText:''});assert.equal(empty.totalDue,'');assert.equal(empty.vendor,'');
});
test('Excel export preserves literal text, numeric amounts and print setup',async()=>{
 const row={...extractInvoice(source),vendor:'=HYPERLINK("https://example.invalid")',vatStatus:'Vatable',reviewed:true};
 const buffer=await invoiceWorkbook([row,row]);const book=new Workbook();await book.xlsx.load(buffer);
 const sheet=book.getWorksheet('Invoice register')!;
 assert.equal(sheet.getCell('C5').value,row.vendor);assert.equal(sheet.getCell('G5').value,'000042');assert.equal(sheet.getCell('K5').value,1234.5);
 assert.equal(sheet.pageSetup.orientation,'landscape');assert.equal(sheet.pageSetup.fitToWidth,1);
 const detail=book.getWorksheet('Printable invoices')!;assert.equal(detail.pageSetup.orientation,'portrait');assert.equal(detail.getCell('B13').value,1234.5);
});

test('each OCR page has its own vendor, amount and source while preserving document identity',()=>{
 const rows=extractInvoicePages({...source,ocrText:'--- Page 1 ---\n\nFirst Vendor\nTOTAL DUE: 100.00\n--- Page 2 ---\nSecond Vendor\nTOTAL DUE: 200.00'});
 assert.equal(rows.length,2);assert.equal(rows[0].vendor,'First Vendor');assert.equal(rows[1].vendor,'Second Vendor');
 assert.equal(rows[0].totalDue,'100.00');assert.equal(rows[1].totalDue,'200.00');
 assert.notEqual(rows[0].rowId,rows[1].rowId);assert.equal(rows[1].documentId,source.id);
 assert.equal(rows[1].invoiceType,'Service Invoice');assert.ok(!rows[1].sourceText.includes('First Vendor'));
});

test('blank OCR fields do not consume the next label',()=>{
 const row=extractInvoice({...source,ocrText:'Vendor Name\nAddress:\nVAT REG TIN: 001-234-567-000\nInvoice No:\nTransaction Date: 2026-09-24\nTransaction No:\nTOTAL DUE: 20.00'});
 assert.equal(row.invoiceNumber,'');assert.equal(row.transactionNumber,'');
 assert.equal(row.transactionDate,'2026-09-24');assert.equal(row.totalDue,'20.00');
});
test('removed pages can be extracted again without replacing edited pages',()=>{
 const doc={...source,ocrText:'--- Page 1 ---\r\nFirst Vendor\r\n--- Page 2 ---\r\nSecond Vendor\r\n--- Page 3 ---\r\n'};
 const rows=newInvoicePages([doc],[doc.id],[]);assert.equal(rows.length,2);
 const kept={...rows[0],vendor:'Corrected vendor',reviewed:true};
 const added=newInvoicePages([doc],[doc.id],[kept]);assert.equal(added.length,1);assert.equal(added[0].vendor,'Second Vendor');
 assert.equal(kept.vendor,'Corrected vendor');assert.equal(newInvoicePages([doc],[doc.id],[kept,...added]).length,0);
});
test('required values cannot be whitespace only',()=>{
 assert.ok(reportIssues({...extractInvoice(source),vendor:'   '}).includes('vendor'));
});

test('address defaults to the third nonblank line of each page',()=>{
 const rows=extractInvoicePages({...source,ocrText:'--- Page 1 ---\r\nVendor One\r\n\r\nBranch One\r\n  123 First Street  \r\n--- Page 2 ---\nVendor Two\nBranch Two\n456 Second Street'});
 assert.equal(rows[0].address,'123 First Street');assert.equal(rows[1].address,'456 Second Street');
 assert.equal(extractInvoice({...source,ocrText:'Vendor\nBranch'}).address,'');
});

test('report extraction accepts only Sales Invoice and Service Invoice metadata',()=>{
 const docs=[source,{...source,id:'sales',metadata:{documentType:' Sales Invoice '}},{...source,id:'other',metadata:{documentType:'201 Files'}},{...source,id:'missing',metadata:{}}];
 const rows=newInvoicePages(docs,docs.map(d=>d.id),[]);
 assert.deepEqual(rows.map(row=>row.documentId),['sample','sales']);
});

test('first date and time are selected independently per page without labels',()=>{
 const rows=extractInvoicePages({...source,ocrText:'--- Page 1 ---\nVendor\n09/24/2026 3:47pm\nTransaction Date: 2026-09-25\nTime: 18:00\n--- Page 2 ---\nVendor Two\nSeptember 25, 2026 at 08:05:30 AM'});
 assert.equal(rows[0].transactionDate,'09/24/2026');assert.equal(rows[0].transactionTime,'3:47pm');
 assert.equal(rows[1].transactionDate,'September 25, 2026');assert.equal(rows[1].transactionTime,'08:05:30 AM');
 for(const date of ['24 Sep 2026','2026-09-24','24.09.2026','09/24/26'])assert.equal(extractInvoice({...source,ocrText:date}).transactionDate,date);
 const invalid=extractInvoice({...source,ocrText:'999-123-456 2026-02-31 25:70\n2026-02-28 14:30'});
 assert.equal(invalid.transactionDate,'2026-02-28');assert.equal(invalid.transactionTime,'14:30');
 assert.equal(extractInvoice({...source,ocrText:'No date or time'}).transactionDate,'');
});

test('total due dictionary supports requested OCR labels and adjacent amount lines',()=>{
 for(const label of ['TOTAL DUE','TOTAL AMOUNT','Total','AMOUNT DUE','TOTAL','Total Amount Due','TOTAL DE','TUTAL DUE','TUTAL','Tutal']){
  for(const separator of [': PHP ','\n₱ ']){
   assert.equal(extractInvoice({...source,ocrText:`Vendor\n${label}${separator}1,234.50`}).totalDue,'1234.50',label);
  }
 }
 assert.equal(extractInvoice({...source,ocrText:'TOTAL 100.00\nTOTAL DUE 112.00'}).totalDue,'112.00');
 for(const text of ['TOTAL VAT 12.00','TOTAL ITEMS 5','TOTAL DUE\nCHANGE 50.00','TOTAL 1,2,3.00']){
  assert.equal(extractInvoice({...source,ocrText:text}).totalDue,'',text);
 }
});

test('subtotal variants are used only when no total or amount due is available',()=>{
 for(const label of ['SUBTOTAL','Sub-Total','Sub Total','Subtotal','SUBTOTAL:','Subtotal:','SUBTOTAL ']){
  for(const separator of [' PHP ','\n'])assert.equal(extractInvoice({...source,ocrText:`${label}${separator}1,234.50`}).totalDue,'1234.50');
 }
 for(const label of ['TOTAL','TOTAL DUE','TOTAL AMOUNT DUE']){
  assert.equal(extractInvoice({...source,ocrText:`SUBTOTAL: 100.00\n${label}: 112.00`}).totalDue,'112.00');
 }
});

test('OCR pipe separators after amounts are ignored without accepting extra numbers',()=>{
 for(const text of ['SUBTOTAL 539.00 |','Sub-Total: PHP 539.00 | |','TOTAL DUE\n539.00 |']){
  assert.equal(extractInvoice({...source,ocrText:text}).totalDue,'539.00');
 }
 assert.equal(extractInvoice({...source,ocrText:'SUBTOTAL 539.00 | 25.00'}).totalDue,'');
});

test('VAT registration dictionary preserves identifiers and prefers VAT labels over plain TIN',()=>{
 for(const label of ['VAT REG TIN', 'VAT REG TIN-', 'VAT REG TIN:', 'VAT REG TIN ', 'Vat Reg:', 'VAT REG TIN No.', 'TIN:', 'VAT REG:']){
  for(const separator of [' ','\n'])assert.equal(extractInvoice({...source,ocrText:`${label}${separator}001-234-567-000 |`}).vatTin,'001-234-567-000',label);
 }
 assert.equal(extractInvoice({...source,ocrText:'TIN: 111-222-333-000\nVAT REG: 001-234-567-000'}).vatTin,'001-234-567-000');
 assert.equal(extractInvoice({...source,ocrText:'TIN:\nInvoice No: 0000123456'}).vatTin,'');
});

test('sales amount labels support OCR punctuation and retain amount-due priority',()=>{
 for(const label of ['Sales','Total sales','SALES TOTAL','Sales ']){
  for(const separator of [': PHP ','\n'])assert.equal(extractInvoice({...source,ocrText:`${label}${separator}539.00 |`}).totalDue,'539.00');
 }
 assert.equal(extractInvoice({...source,ocrText:'Sales 100.00\nTOTAL DUE 112.00'}).totalDue,'112.00');
 for(const text of ['SALES TAX 12.00','SALES INVOICE 123456','VATABLE SALES 100.00'])assert.equal(extractInvoice({...source,ocrText:text}).totalDue,'');
});

test('saving a page preserves other pages and rejects page marker injection',()=>{
 const text='--- Page 1 ---\nFirst vendor\n--- Page 2 ---\nSecond vendor\n--- Page 3 ---\nThird vendor';
 const updated=replaceInvoiceOcrPage(text,'doc:page:2','doc','Corrected vendor\nTOTAL 50.00');
 const rows=extractInvoicePages({...source,id:'doc',ocrText:updated});
 assert.equal(rows.length,3);assert.equal(rows[0].vendor,'First vendor');assert.equal(rows[1].vendor,'Corrected vendor');assert.equal(rows[2].vendor,'Third vendor');
 assert.equal(rows[1].totalDue,'50.00');
 assert.equal(replaceInvoiceOcrPage('old','doc','doc','new'),'new');
 assert.throws(()=>replaceInvoiceOcrPage(text,'doc:page:9','doc','new'));
 assert.throws(()=>replaceInvoiceOcrPage(text,'doc:page:2','doc','--- Page 4 ---\nnew'));
});

test('invoice number dictionary supports SI and SN labels and plain INVOICE',()=>{
 for(const label of ['SI#','INVOICE','INVOICE #','SN#:','Invoice No.','SERVICE INVOICE NUMBER']){
  for(const separator of [' ','\n'])assert.equal(extractInvoice({...source,ocrText:`${label}${separator}000123 |`}).invoiceNumber,'000123',label);
 }
 assert.equal(extractInvoice({...source,ocrText:'SI# SI-000123'}).invoiceNumber,'SI-000123');
 assert.equal(extractInvoice({...source,ocrText:'INVOICE\nTOTAL DUE: 100.00'}).invoiceNumber,'');
 assert.equal(extractInvoice({...source,ocrText:'INVOICE\n2026-09-28\nINVOICE # 000009'}).invoiceNumber,'000009');
});

test('transaction number dictionary supports abbreviated labels and punctuation',()=>{
 for(const label of ['Transac','Trans#','Trans','Trans. No.','Trans. No:','Trans # ','TRANSACTION NUMBER','Transaction No:']){
  for(const separator of [' ','\n'])assert.equal(extractInvoice({...source,ocrText:`${label}${separator}000456 |`}).transactionNumber,'000456',label);
 }
 assert.equal(extractInvoice({...source,ocrText:'Trans# TX-000456'}).transactionNumber,'TX-000456');
 for(const text of ['Transaction Date: 2026-09-28','Trans. No:\nTOTAL DUE: 100.00','Trans total 200.00'])assert.equal(extractInvoice({...source,ocrText:text}).transactionNumber,'');
});

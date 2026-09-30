import {extractTotalDue,extractVatTin,firstDateAndTime} from './invoice-report';
export type ReceiptRow={id:string;company:string;address:string;tin:string;date:string;total:string};
export function receiptRow(page:{id:string;text:string}):ReceiptRow {
 const lines=page.text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 return {id:page.id,company:lines[0]||'',address:lines[1]||'',tin:extractVatTin(page.text),date:firstDateAndTime(page.text).date,total:extractTotalDue(page.text)};
}
export async function receiptWorkbook(rows:ReceiptRow[]) {
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();
 const sheet=book.addWorksheet('Scanned invoices',{views:[{state:'frozen',ySplit:1}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'}});
 sheet.columns=[{header:'item_no',width:10},{header:'company',width:30},{header:'address',width:45},{header:'tin#',width:24},{header:'date',width:20},{header:'total amount',width:20}];
 rows.forEach((row,i)=>{sheet.addRow([i+1,row.company,row.address,row.tin,row.date,Number(row.total)]);});
 const totalRow=sheet.addRow(['','TOTAL ACCUMULATED','','','',{formula:`SUM(F2:F${rows.length+1})`,result:rows.reduce((sum,row)=>sum+Number(row.total),0)}]);
 totalRow.font={bold:true};totalRow.height=28;sheet.getColumn(6).numFmt='#,##0.00';
 sheet.getRow(1).height=28;sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
 sheet.getRow(1).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF164C3D'}};});
 sheet.eachRow(row=>row.eachCell(cell=>{cell.alignment={wrapText:true,vertical:'top'};}));
 sheet.autoFilter=`A1:F${rows.length+1}`;sheet.pageSetup.printArea=`A1:F${rows.length+2}`;
 return book.xlsx.writeBuffer();
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptRow,receiptWorkbook} from '../apps/web/lib/receipt-report';
import {Workbook} from 'exceljs';
test('receipt extraction uses second line address and exports six columns with accumulated formula',async()=>{
 const row=receiptRow({id:'one',text:'Example Company\n123 Main Street\nVAT REG TIN: 001-234-567-000\n09/30/2026\nTOTAL DUE 120.50'});
 assert.equal(row.address,'123 Main Street');assert.equal(row.company,'Example Company');assert.equal(row.tin,'001-234-567-000');assert.equal(row.total,'120.50');
 const book=new Workbook();await book.xlsx.load(await receiptWorkbook([row,{...row,id:'two',total:'20.25'}]));const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('D2').value,'001-234-567-000');assert.equal(sheet.getCell('F2').value,120.5);
 assert.deepEqual(sheet.getCell('F4').value,{formula:'SUM(F2:F3)',result:140.75});assert.equal(sheet.columnCount,6);
});

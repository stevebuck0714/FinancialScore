const XLSX = require('xlsx');
const path = require('path');

const filePath = 'C:\\Users\\steve\\Downloads\\hypothetical_financials_36mo.xlsx';
const wb = XLSX.readFile(filePath);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
const json = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log('\n=== FILE: hypothetical_financials_36mo.xlsx ===\n');
console.log('Sheet Name:', sheetName);
console.log('\nColumns found:');
if (json.length > 0) {
  const headers = json[0];
  headers.forEach((header, i) => {
    console.log(`  ${i + 1}. ${header}`);
  });
  console.log(`\nTotal columns: ${headers.length}`);
  console.log(`Total rows: ${json.length - 1}`);
}



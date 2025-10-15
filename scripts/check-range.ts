import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import path from 'path';

const zipPath = 'C:\\Users\\steve\\Downloads\\drive-download-20251009T190619Z-1-001.zip';
const targetFile = '72221A Fast Food Restaurants.xlsx';

try {
  const zip = new AdmZip(zipPath);
  const zipEntries = zip.getEntries();
  const entry = zipEntries.find(e => path.basename(e.entryName) === targetFile);
  
  if (!entry) {
    console.log('❌ File not found');
    process.exit(1);
  }
  
  const fileBuffer = entry.getData();
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  
  console.log('📊 Sheet:', workbook.SheetNames[0]);
  console.log('   Range:', firstSheet['!ref']);
  
  // Check specific cells
  console.log('\n   Row 1 (Header):');
  console.log('   A1:', firstSheet['A1']?.v);
  console.log('   T1:', firstSheet['T1']?.v);
  
  console.log('\n   Row 3 (First data row):');
  console.log('   A3:', firstSheet['A3']?.v);
  console.log('   T3:', firstSheet['T3']?.v);
  
  console.log('\n   All cells in row 1:');
  for (let i = 0; i < 20; i++) {
    const col = String.fromCharCode(65 + i); // A-T
    const cell = firstSheet[`${col}1`];
    if (cell) {
      console.log(`   ${col}1:`, cell.v);
    }
  }
  
} catch (error) {
  console.error('❌ Error:', error);
}



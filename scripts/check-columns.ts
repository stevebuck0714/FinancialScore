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
  const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
  
  console.log('📊 First Sheet:', workbook.SheetNames[0]);
  console.log('   Total rows:', data.length);
  
  if (data.length > 0) {
    console.log('   Header row columns:', data[0].length);
    console.log('   Header:', JSON.stringify(data[0]));
    
    console.log('\n   Column T (index 19) values in first few rows:');
    for (let i = 0; i < Math.min(5, data.length); i++) {
      console.log(`   Row ${i}:`, data[i][19]);
    }
  }
  
} catch (error) {
  console.error('❌ Error:', error);
}



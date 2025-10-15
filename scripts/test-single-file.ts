import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import path from 'path';

const zipPath = 'C:\\Users\\steve\\Downloads\\drive-download-20251009T190619Z-1-001.zip';
const targetFile = '72221A Fast Food Restaurants.xlsx';

try {
  console.log('🔍 Testing file:', targetFile);
  
  const zip = new AdmZip(zipPath);
  const zipEntries = zip.getEntries();
  
  const entry = zipEntries.find(e => path.basename(e.entryName) === targetFile);
  
  if (!entry) {
    console.log('❌ File not found in ZIP');
    process.exit(1);
  }
  
  console.log('✓ Found file in ZIP');
  console.log('   Entry name:', entry.entryName);
  
  // Test filename parsing
  const fileName = path.basename(entry.entryName);
  console.log('   Filename:', fileName);
  
  // Try the regex
  const match = fileName.match(/^(\d+[A-Z]?)\s+(.+?)\s+in the US Industry Report/i);
  
  if (!match) {
    console.log('❌ Regex did not match');
    console.log('   Pattern: /^(\\d+[A-Z]?)\\s+(.+?)\\s+in the US Industry Report/i');
    
    // Try simpler match
    const simpleMatch = fileName.match(/^(\d+[A-Z]?)\s+(.+?)\.xlsx$/i);
    if (simpleMatch) {
      console.log('✓ Simple match worked:');
      console.log('   Industry ID:', simpleMatch[1]);
      console.log('   Industry Name:', simpleMatch[2]);
    }
  } else {
    console.log('✓ Regex matched');
    console.log('   Industry ID:', match[1]);
    console.log('   Industry Name:', match[2]);
  }
  
  // Try to read the Excel file
  console.log('\n📊 Reading Excel file...');
  const fileBuffer = entry.getData();
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  
  console.log('✓ Excel file read successfully');
  console.log('   Worksheets:', workbook.SheetNames.join(', '));
  console.log('   Number of sheets:', workbook.SheetNames.length);
  
  // Check first sheet
  if (workbook.SheetNames.length > 0) {
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
    console.log('   First sheet rows:', data.length);
    console.log('   First 3 rows:', JSON.stringify(data.slice(0, 3), null, 2));
  }
  
} catch (error) {
  console.error('❌ Error:', error);
}



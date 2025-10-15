import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const ASSET_SIZE_CATEGORIES = [
  'All Asset Sizes',
  '<500k',
  '500k-1m',
  '1m-5m',
  '5m-10m',
  '10m-25m',
  '25m-50m',
  '50m-100m',
  '100m-250m',
  '250m-500m',
  '>500m'
];

async function importFile() {
  try {
    const filePath = 'C:\\Users\\steve\\Downloads\\72221A Fast Food Restaurants in the US Industry Report Financial Ratios.xlsx';
    
    console.log('📊 Importing:', filePath);
    
    // Parse filename
    const fileName = '72221A Fast Food Restaurants in the US Industry Report Financial Ratios.xlsx';
    const match = fileName.match(/^(\d+[A-Z]?)\s+(.+?)\s+in the US Industry Report/i);
    
    if (!match) {
      console.log('❌ Could not parse filename');
      return;
    }
    
    const industryId = match[1];
    const industryName = match[2].trim();
    
    console.log('   Industry ID:', industryId);
    console.log('   Industry Name:', industryName);
    
    // Read Excel file
    const workbook = XLSX.readFile(filePath);
    console.log('   Sheets:', workbook.SheetNames.join(', '));
    
    let totalBenchmarks = 0;
    
    // Process each worksheet
    for (const sheetName of workbook.SheetNames) {
      if (!ASSET_SIZE_CATEGORIES.includes(sheetName)) {
        continue;
      }
      
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      // Process each row (skip header)
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const metricName = row[0];
        const fiveYearValue = row[19]; // Column T is index 19
        
        if (!metricName || typeof metricName !== 'string') continue;
        if (metricName === 'Ratio' || metricName === ' ') continue;
        
        // Convert value to number
        let value: number | null = null;
        if (typeof fiveYearValue === 'number') {
          value = fiveYearValue;
        } else if (typeof fiveYearValue === 'string') {
          const parsed = parseFloat(fiveYearValue);
          if (!isNaN(parsed)) value = parsed;
        }
        
        // Insert into database
        await prisma.industryBenchmark.upsert({
          where: {
            industryId_assetSizeCategory_metricName: {
              industryId,
              assetSizeCategory: sheetName,
              metricName: metricName.trim()
            }
          },
          update: {
            industryName,
            fiveYearValue: value
          },
          create: {
            industryId,
            industryName,
            assetSizeCategory: sheetName,
            metricName: metricName.trim(),
            fiveYearValue: value
          }
        });
        
        totalBenchmarks++;
      }
    }
    
    console.log('✅ Successfully imported', totalBenchmarks, 'benchmarks');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importFile();



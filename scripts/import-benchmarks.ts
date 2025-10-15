import AdmZip from 'adm-zip';
import XLSX from 'xlsx';
import prisma from '../lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

const ZIP_FILES = [
  // 'C:\\Users\\steve\\Downloads\\drive-download-20251009T190041Z-1-001.zip', // Already imported
  'C:\\Users\\steve\\Downloads\\drive-download-20251009T190619Z-1-001.zip' // Import this one
];

const TEMP_DIR = path.join(process.cwd(), 'temp_benchmarks');

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

async function importBenchmarks() {
  try {
    console.log('🚀 Starting industry benchmark import...\n');

    // Create temp directory
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    let totalFiles = 0;
    let processedFiles = 0;
    let errorFiles: string[] = [];
    let totalBenchmarks = 0;

    // Process each ZIP file
    for (const zipPath of ZIP_FILES) {
      console.log(`\n📦 Processing ZIP: ${path.basename(zipPath)}`);
      
      if (!fs.existsSync(zipPath)) {
        console.log(`   ⚠️  File not found: ${zipPath}`);
        continue;
      }

      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();
      
      // Filter for Excel files only
      const excelFiles = zipEntries.filter(entry => 
        !entry.isDirectory && 
        (entry.entryName.endsWith('.xlsx') || entry.entryName.endsWith('.xls'))
      );
      
      console.log(`   Found ${excelFiles.length} Excel files`);
      totalFiles += excelFiles.length;

      // Process each Excel file
      for (const entry of excelFiles) {
        try {
          const fileName = path.basename(entry.entryName);
          
          // Parse industry ID and name from filename
          // Format 1: "51111 Newspaper Publishing in the US Industry Report Financial Ratios.xlsx"
          // Format 2: "72221A Fast Food Restaurants.xlsx"
          let match = fileName.match(/^(\d+[A-Z]?)\s+(.+?)\s+in the US Industry Report/i);
          
          if (!match) {
            // Try simpler format without "in the US Industry Report"
            match = fileName.match(/^(\d+[A-Z]?)\s+(.+?)\.xlsx$/i);
          }
          
          if (!match) {
            console.log(`   ⚠️  Skipping (invalid format): ${fileName}`);
            errorFiles.push(fileName);
            continue;
          }

          const industryId = match[1];
          const industryName = match[2].trim();

          // Extract file to buffer
          const fileBuffer = entry.getData();
          
          // Read Excel file
          const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
          
          let sheetCount = 0;
          let benchmarkCount = 0;

          // Process each worksheet (asset size category)
          for (const sheetName of workbook.SheetNames) {
            if (!ASSET_SIZE_CATEGORIES.includes(sheetName)) {
              continue;
            }

            const sheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

            // Find the 5-year column index from header row
            const headerRow = data[0] || [];
            let fiveYearColIndex = 19; // Default to Column T (index 19)
            
            // Look for "5-Year" column if header exists
            const fiveYearIndex = headerRow.findIndex((h: any) => 
              typeof h === 'string' && h.toLowerCase().includes('5-year')
            );
            if (fiveYearIndex !== -1) {
              fiveYearColIndex = fiveYearIndex;
            }

            // Skip header row, process data rows
            for (let i = 1; i < data.length; i++) {
              const row = data[i];
              const metricName = row[0];
              const fiveYearValue = row[fiveYearColIndex];

              if (!metricName || typeof metricName !== 'string') continue;
              if (metricName === 'Ratio' || metricName === ' ') continue;

              // Convert value to number if it's not already
              let value: number | null = null;
              if (typeof fiveYearValue === 'number') {
                value = fiveYearValue;
              } else if (typeof fiveYearValue === 'string') {
                const parsed = parseFloat(fiveYearValue);
                if (!isNaN(parsed)) value = parsed;
              }

              // Insert into database (upsert to handle duplicates)
              try {
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
                benchmarkCount++;
                totalBenchmarks++;
              } catch (error) {
                // Skip individual errors but log them
                console.error(`      Error inserting benchmark: ${metricName}`, error);
              }
            }
            
            sheetCount++;
          }

          processedFiles++;
          
          if (processedFiles % 50 === 0) {
            console.log(`   ✓ Processed ${processedFiles}/${totalFiles} files (${benchmarkCount} benchmarks from last file)`);
          }

        } catch (error) {
          console.error(`   ❌ Error processing ${entry.entryName}:`, error);
          errorFiles.push(entry.entryName);
        }
      }
    }

    // Clean up temp directory
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }

    // Summary
    console.log('\n✨ Import Complete!\n');
    console.log(`📊 Summary:`);
    console.log(`   Total files found: ${totalFiles}`);
    console.log(`   Successfully processed: ${processedFiles}`);
    console.log(`   Errors: ${errorFiles.length}`);
    console.log(`   Total benchmarks imported: ${totalBenchmarks}`);
    
    if (errorFiles.length > 0 && errorFiles.length < 20) {
      console.log('\n⚠️  Files with errors:');
      errorFiles.forEach(f => console.log(`   - ${f}`));
    }

    // Verify data
    const benchmarkCount = await prisma.industryBenchmark.count();
    const industryCount = await prisma.industryBenchmark.groupBy({
      by: ['industryId'],
    });
    
    console.log(`\n✅ Database verification:`);
    console.log(`   Total benchmarks in DB: ${benchmarkCount}`);
    console.log(`   Unique industries: ${industryCount.length}`);

  } catch (error) {
    console.error('❌ Fatal error during import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importBenchmarks()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createMasterData() {
  try {
    const companyId = 'cmiz6nl7q0000kt04u9vprbpl';

    console.log(`🔍 Looking for financial records for company: ${companyId}`);

    // Get the latest financial record for this company
    const records = await prisma.financialRecord.findMany({
      where: {
        companyId: companyId
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 1
    });

    if (records.length === 0) {
      console.log('❌ No financial records found for this company');
      return;
    }

    const latestRecord = records[0];
    console.log(`✅ Found latest record: ${latestRecord.id}`);
    console.log(`📅 Created: ${latestRecord.createdAt}`);

    if (!latestRecord.monthlyData || !Array.isArray(latestRecord.monthlyData)) {
      console.log('❌ No monthly data found in the record');
      return;
    }

    console.log(`📊 Found ${latestRecord.monthlyData.length} months of processed data`);

    // Check the structure of the first month
    if (latestRecord.monthlyData.length > 0) {
      const firstMonth = latestRecord.monthlyData[0];
      console.log('📋 Sample month keys:', Object.keys(firstMonth).slice(0, 10));
    }

    // Save this data as master data
    const masterDataPayload = {
      companyId: companyId,
      monthlyData: latestRecord.monthlyData
    };

    console.log('💾 Saving master data...');

    const response = await fetch('http://localhost:3000/api/save-master-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(masterDataPayload)
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ Master data created successfully!');
      console.log(`📁 File saved: ${result.filePath}`);
      console.log(`📊 ${result.months} months of data saved`);
    } else {
      console.log('❌ Failed to create master data:', result.error);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createMasterData();




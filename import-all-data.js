const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

// PostgreSQL connection (using schema.prisma with .env DATABASE_URL)
const prismaTarget = new PrismaClient();

async function importAllData() {
  console.log('🔄 Starting data import to PostgreSQL...\n');

  try {
    // Read exported data
    const filename = 'sqlite-data-export.json';
    if (!fs.existsSync(filename)) {
      throw new Error(`Export file ${filename} not found! Run migrate-all-data.js first.`);
    }

    const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    console.log('✅ Loaded export file\n');

    // Import Users
    if (data.users && data.users.length > 0) {
      console.log(`📊 Importing ${data.users.length} users...`);
      for (const user of data.users) {
        await prismaTarget.user.create({ data: user });
      }
      console.log('   ✅ Users imported');
    }

    // Import Consultants
    if (data.consultants && data.consultants.length > 0) {
      console.log(`📊 Importing ${data.consultants.length} consultants...`);
      for (const consultant of data.consultants) {
        await prismaTarget.consultant.create({ data: consultant });
      }
      console.log('   ✅ Consultants imported');
    }

    // Import Companies
    if (data.companies && data.companies.length > 0) {
      console.log(`📊 Importing ${data.companies.length} companies...`);
      for (const company of data.companies) {
        await prismaTarget.company.create({ data: company });
      }
      console.log('   ✅ Companies imported');
    }

    // Import Financial Records
    if (data.financialRecords && data.financialRecords.length > 0) {
      console.log(`📊 Importing ${data.financialRecords.length} financial records...`);
      for (const record of data.financialRecords) {
        await prismaTarget.financialRecord.create({ data: record });
      }
      console.log('   ✅ Financial records imported');
    }

    // Import Monthly Financials
    if (data.monthlyFinancials && data.monthlyFinancials.length > 0) {
      console.log(`📊 Importing ${data.monthlyFinancials.length} monthly financials...`);
      for (const monthly of data.monthlyFinancials) {
        await prismaTarget.monthlyFinancial.create({ data: monthly });
      }
      console.log('   ✅ Monthly financials imported');
    }

    // Import Assessment Records
    if (data.assessmentRecords && data.assessmentRecords.length > 0) {
      console.log(`📊 Importing ${data.assessmentRecords.length} assessment records...`);
      for (const record of data.assessmentRecords) {
        await prismaTarget.assessmentRecord.create({ data: record });
      }
      console.log('   ✅ Assessment records imported');
    }

    // Import Company Profiles
    if (data.companyProfiles && data.companyProfiles.length > 0) {
      console.log(`📊 Importing ${data.companyProfiles.length} company profiles...`);
      for (const profile of data.companyProfiles) {
        await prismaTarget.companyProfile.create({ data: profile });
      }
      console.log('   ✅ Company profiles imported');
    }

    // Import Industry Benchmarks
    if (data.industryBenchmarks && data.industryBenchmarks.length > 0) {
      console.log(`📊 Importing ${data.industryBenchmarks.length} industry benchmarks...`);
      for (const benchmark of data.industryBenchmarks) {
        await prismaTarget.industryBenchmark.create({ data: benchmark });
      }
      console.log('   ✅ Industry benchmarks imported');
    }

    // Import Accounting Connections
    if (data.accountingConnections && data.accountingConnections.length > 0) {
      console.log(`📊 Importing ${data.accountingConnections.length} accounting connections...`);
      for (const connection of data.accountingConnections) {
        await prismaTarget.accountingConnection.create({ data: connection });
      }
      console.log('   ✅ Accounting connections imported');
    }

    // Import Account Mappings
    if (data.accountMappings && data.accountMappings.length > 0) {
      console.log(`📊 Importing ${data.accountMappings.length} account mappings...`);
      for (const mapping of data.accountMappings) {
        await prismaTarget.accountMapping.create({ data: mapping });
      }
      console.log('   ✅ Account mappings imported');
    }

    // Import Expense Goals (using raw SQL with JSONB casting)
    if (data.expenseGoals && data.expenseGoals.length > 0) {
      console.log(`📊 Importing ${data.expenseGoals.length} expense goals...`);
      for (const goal of data.expenseGoals) {
        const goalsJson = typeof goal.goals === 'string' ? goal.goals : JSON.stringify(goal.goals);
        await prismaTarget.$executeRawUnsafe(`
          INSERT INTO "ExpenseGoal" ("id", "companyId", "goals", "createdAt", "updatedAt")
          VALUES ($1, $2, $3::jsonb, $4, $5)
        `, goal.id, goal.companyId, goalsJson, goal.createdAt, goal.updatedAt);
      }
      console.log('   ✅ Expense goals imported');
    }

    // Import API Sync Logs
    if (data.apiSyncLogs && data.apiSyncLogs.length > 0) {
      console.log(`📊 Importing ${data.apiSyncLogs.length} API sync logs...`);
      for (const log of data.apiSyncLogs) {
        await prismaTarget.apiSyncLog.create({ data: log });
      }
      console.log('   ✅ API sync logs imported');
    }

    // Import Audit Logs
    if (data.auditLogs && data.auditLogs.length > 0) {
      console.log(`📊 Importing ${data.auditLogs.length} audit logs...`);
      for (const log of data.auditLogs) {
        await prismaTarget.auditLog.create({ data: log });
      }
      console.log('   ✅ Audit logs imported');
    }

    console.log('\n✅ Import complete!');
    console.log('\n📊 Summary:');
    console.log(`   Users: ${data.users?.length || 0}`);
    console.log(`   Consultants: ${data.consultants?.length || 0}`);
    console.log(`   Companies: ${data.companies?.length || 0}`);
    console.log(`   Financial Records: ${data.financialRecords?.length || 0}`);
    console.log(`   Monthly Financials: ${data.monthlyFinancials?.length || 0}`);
    console.log(`   Assessment Records: ${data.assessmentRecords?.length || 0}`);
    console.log(`   Company Profiles: ${data.companyProfiles?.length || 0}`);
    console.log(`   Industry Benchmarks: ${data.industryBenchmarks?.length || 0}`);
    console.log(`   Accounting Connections: ${data.accountingConnections?.length || 0}`);
    console.log(`   Account Mappings: ${data.accountMappings?.length || 0}`);
    console.log(`   Expense Goals: ${data.expenseGoals?.length || 0}`);
    console.log(`   API Sync Logs: ${data.apiSyncLogs?.length || 0}`);
    console.log(`   Audit Logs: ${data.auditLogs?.length || 0}`);

  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await prismaTarget.$disconnect();
  }
}

importAllData()
  .then(() => {
    console.log('\n🎉 Migration complete! Your data is now in PostgreSQL!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });


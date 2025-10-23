const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

// SQLite connection (using schema.prisma which is now set to SQLite)
const prismaSource = new PrismaClient();

async function exportAllData() {
  console.log('🔄 Starting data export from SQLite...\n');

  try {
    const data = {};

    // Export Users
    console.log('📊 Exporting Users...');
    data.users = await prismaSource.user.findMany();
    console.log(`   ✅ Exported ${data.users.length} users`);

    // Export Consultants
    console.log('📊 Exporting Consultants...');
    data.consultants = await prismaSource.consultant.findMany();
    console.log(`   ✅ Exported ${data.consultants.length} consultants`);

    // Export Companies
    console.log('📊 Exporting Companies...');
    data.companies = await prismaSource.company.findMany();
    console.log(`   ✅ Exported ${data.companies.length} companies`);

    // Export Financial Records
    console.log('📊 Exporting Financial Records...');
    data.financialRecords = await prismaSource.financialRecord.findMany();
    console.log(`   ✅ Exported ${data.financialRecords.length} financial records`);

    // Export Monthly Financials
    console.log('📊 Exporting Monthly Financials...');
    data.monthlyFinancials = await prismaSource.monthlyFinancial.findMany();
    console.log(`   ✅ Exported ${data.monthlyFinancials.length} monthly financials`);

    // Export Assessment Records
    console.log('📊 Exporting Assessment Records...');
    data.assessmentRecords = await prismaSource.assessmentRecord.findMany();
    console.log(`   ✅ Exported ${data.assessmentRecords.length} assessment records`);

    // Export Company Profiles
    console.log('📊 Exporting Company Profiles...');
    data.companyProfiles = await prismaSource.companyProfile.findMany();
    console.log(`   ✅ Exported ${data.companyProfiles.length} company profiles`);

    // Export Industry Benchmarks
    console.log('📊 Exporting Industry Benchmarks...');
    data.industryBenchmarks = await prismaSource.industryBenchmark.findMany();
    console.log(`   ✅ Exported ${data.industryBenchmarks.length} industry benchmarks`);

    // Export Accounting Connections
    console.log('📊 Exporting Accounting Connections...');
    data.accountingConnections = await prismaSource.accountingConnection.findMany();
    console.log(`   ✅ Exported ${data.accountingConnections.length} accounting connections`);

    // Export Account Mappings
    console.log('📊 Exporting Account Mappings...');
    data.accountMappings = await prismaSource.accountMapping.findMany();
    console.log(`   ✅ Exported ${data.accountMappings.length} account mappings`);

    // Export Expense Goals (using raw query since table might not exist)
    console.log('📊 Exporting Expense Goals...');
    try {
      data.expenseGoals = await prismaSource.$queryRaw`SELECT * FROM ExpenseGoal`;
      console.log(`   ✅ Exported ${data.expenseGoals.length} expense goals`);
    } catch (e) {
      console.log('   ⚠️  No ExpenseGoal table found (this is okay)');
      data.expenseGoals = [];
    }

    // Export API Sync Logs
    console.log('📊 Exporting API Sync Logs...');
    data.apiSyncLogs = await prismaSource.apiSyncLog.findMany();
    console.log(`   ✅ Exported ${data.apiSyncLogs.length} API sync logs`);

    // Export Audit Logs
    console.log('📊 Exporting Audit Logs...');
    data.auditLogs = await prismaSource.auditLog.findMany();
    console.log(`   ✅ Exported ${data.auditLogs.length} audit logs`);

    // Save to file
    const filename = 'sqlite-data-export.json';
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    
    console.log(`\n✅ Export complete! Data saved to ${filename}`);
    console.log('\n📊 Summary:');
    console.log(`   Users: ${data.users.length}`);
    console.log(`   Consultants: ${data.consultants.length}`);
    console.log(`   Companies: ${data.companies.length}`);
    console.log(`   Financial Records: ${data.financialRecords.length}`);
    console.log(`   Monthly Financials: ${data.monthlyFinancials.length}`);
    console.log(`   Assessment Records: ${data.assessmentRecords.length}`);
    console.log(`   Company Profiles: ${data.companyProfiles.length}`);
    console.log(`   Industry Benchmarks: ${data.industryBenchmarks.length}`);
    console.log(`   Accounting Connections: ${data.accountingConnections.length}`);
    console.log(`   Account Mappings: ${data.accountMappings.length}`);
    console.log(`   Expense Goals: ${data.expenseGoals.length}`);
    console.log(`   API Sync Logs: ${data.apiSyncLogs.length}`);
    console.log(`   Audit Logs: ${data.auditLogs.length}`);

  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  } finally {
    await prismaSource.$disconnect();
  }
}

exportAllData()
  .then(() => {
    console.log('\n🎉 Ready for import to PostgreSQL!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });


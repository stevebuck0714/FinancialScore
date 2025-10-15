import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all companies
  const companies = await prisma.company.findMany({
    select: { id: true, name: true }
  });
  
  console.log('Companies:', companies);
  
  if (companies.length > 0) {
    const companyId = companies[0].id;
    console.log(`\nChecking financial data for company: ${companies[0].name} (${companyId})`);
    
    // Get financial records
    const records = await prisma.financialRecord.findMany({
      where: { companyId },
      include: { monthlyData: true },
      orderBy: { createdAt: 'desc' },
      take: 1
    });
    
    if (records.length > 0) {
      const record = records[0];
      console.log(`\nFound ${record.monthlyData.length} months of data`);
      console.log(`File: ${record.fileName}`);
      
      // Show professional fees for last 12 months
      const sortedData = record.monthlyData
        .sort((a, b) => new Date(a.monthDate).getTime() - new Date(b.monthDate).getTime())
        .slice(-12);
      
      console.log('\n=== PROFESSIONAL FEES (Last 12 Months) ===\n');
      console.log('Month\t\t\tRevenue\t\tProf Fees\tCash\t\tTotal Assets');
      console.log('─'.repeat(80));
      
      sortedData.forEach(m => {
        const month = new Date(m.monthDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const revenue = m.revenue?.toFixed(2) || '0.00';
        const profFees = m.professionalFees?.toFixed(2) || '0.00';
        const cash = m.cash?.toFixed(2) || '0.00';
        const assets = m.totalAssets?.toFixed(2) || '0.00';
        console.log(`${month}\t\t$${revenue}\t$${profFees}\t$${cash}\t$${assets}`);
      });
      
      // Show all available fields in first record
      console.log('\n=== AVAILABLE FIELDS IN DATA ===');
      const firstRecord = sortedData[0];
      const fields = Object.keys(firstRecord).filter(k => k !== 'id' && k !== 'financialRecordId' && k !== 'createdAt' && k !== 'updatedAt');
      console.log(fields.join(', '));
      
      // Show which fields have non-zero values
      console.log('\n=== FIELDS WITH DATA (Non-zero in at least one month) ===');
      const fieldsWithData: string[] = [];
      fields.forEach(field => {
        const hasData = sortedData.some(m => {
          const val = (m as any)[field];
          return val !== null && val !== undefined && val !== 0;
        });
        if (hasData) fieldsWithData.push(field);
      });
      console.log(fieldsWithData.join(', '));
    } else {
      console.log('\nNo financial records found!');
    }
  } else {
    console.log('No companies found!');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());


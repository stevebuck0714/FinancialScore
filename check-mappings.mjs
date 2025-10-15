import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== SAVED MAPPINGS ===');
  const mappings = await prisma.accountMapping.findMany({
    where: { companyId: 'cmgmttbfh0004qhgwm6vd9oa5' },
    orderBy: { qbAccount: 'asc' }
  });
  
  console.log(`Total mappings: ${mappings.length}\n`);
  mappings.slice(0, 20).forEach(m => {
    console.log(`${m.qbAccount} -> ${m.targetField}`);
  });
  
  console.log('\n=== CHECKING QB RAW DATA ===');
  const qbData = await prisma.quickBooksData.findFirst({
    where: { companyId: 'cmgmttbfh0004qhgwm6vd9oa5' },
    orderBy: { createdAt: 'desc' }
  });
  
  if (qbData && qbData.profitAndLoss) {
    const pl = qbData.profitAndLoss;
    console.log(`\nP&L Report has data: ${!!pl.Rows}`);
    
    // Extract first few account names from P&L
    if (pl.Rows && pl.Rows.Row) {
      const rows = Array.isArray(pl.Rows.Row) ? pl.Rows.Row : [pl.Rows.Row];
      console.log(`\nFirst few P&L accounts:`);
      
      function extractAccounts(row, depth = 0) {
        if ((row.type === 'Data' || row.type === 'Section') && row.ColData) {
          const name = row.ColData[0]?.value || '';
          const value = row.ColData[1]?.value || '0';
          if (name) {
            console.log(`  ${name} (${row.type}): ${value}`);
          }
        }
        if (row.Rows && row.Rows.Row) {
          const subRows = Array.isArray(row.Rows.Row) ? row.Rows.Row : [row.Rows.Row];
          subRows.slice(0, 5).forEach(r => extractAccounts(r, depth + 1));
        }
      }
      
      rows.slice(0, 3).forEach(row => extractAccounts(row));
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());


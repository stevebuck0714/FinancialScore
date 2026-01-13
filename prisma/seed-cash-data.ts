import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedCashData() {
  console.log('🏦 Starting cash data seed...');

  // Find the "test free promo code" company
  const company = await prisma.company.findFirst({
    where: {
      name: {
        contains: 'test free promo',
        mode: 'insensitive'
      }
    }
  });

  if (!company) {
    console.error('❌ Company not found: "test free promo code"');
    console.log('Available companies:');
    const companies = await prisma.company.findMany({
      select: { id: true, name: true }
    });
    companies.forEach(c => console.log(`  - ${c.name} (${c.id})`));
    return;
  }

  console.log(`✅ Found company: ${company.name} (${company.id})`);

  // Clear existing cash data for this company
  await prisma.cashSnapshot.deleteMany({
    where: { companyId: company.id }
  });
  console.log('🗑️  Cleared existing cash data');

  const bankAccounts = [
    { id: 'acct_001', name: 'Operating Account', number: '4532', startingBalance: 125000 },
    { id: 'acct_002', name: 'Payroll Account', number: '7891', startingBalance: 45000 },
    { id: 'acct_003', name: 'Savings Account', number: '2156', startingBalance: 200000 },
  ];

  const records = [];
  const today = new Date();

  // Generate daily data for last 90 days
  console.log('📅 Generating daily cash snapshots for 90 days...');
  
  for (let i = 89; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    for (const account of bankAccounts) {
      // Create realistic cash balance variations
      const dayFactor = i / 90; // 0 to 1 from oldest to newest
      const randomVariation = (Math.random() - 0.5) * 0.1; // +/- 5% random
      const trendFactor = dayFactor * 0.15; // 15% growth over 90 days
      
      // Different patterns for different accounts
      let balance: number;
      if (account.name.includes('Operating')) {
        // Operating account: more volatile, grows slightly
        balance = account.startingBalance * (1 + trendFactor + randomVariation);
        // Add some weekly patterns (lower on weekends)
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          balance *= 0.98; // Slightly lower on weekends
        }
      } else if (account.name.includes('Payroll')) {
        // Payroll account: spikes every 2 weeks, then drops
        const daysSinceStart = 89 - i;
        const daysIntoPayPeriod = daysSinceStart % 14;
        if (daysIntoPayPeriod < 2) {
          // Just after payday - high balance
          balance = account.startingBalance * 1.5 * (1 + trendFactor);
        } else {
          // Normal days - declining balance
          const declineRate = daysIntoPayPeriod / 14;
          balance = account.startingBalance * (1.5 - declineRate * 0.7) * (1 + trendFactor);
        }
      } else {
        // Savings: steady, slow growth
        balance = account.startingBalance * (1 + trendFactor * 0.5 + randomVariation * 0.02);
      }

      // Calculate change from previous day (if not first day)
      let changeAmount: number | null = null;
      let changePercent: number | null = null;
      
      if (i < 89) {
        const prevBalance = records.find(r => 
          r.accountId === account.id && 
          new Date(r.snapshotDate).getDate() === date.getDate() - 1
        )?.cashBalance;
        
        if (prevBalance) {
          changeAmount = balance - prevBalance;
          changePercent = (changeAmount / prevBalance) * 100;
        }
      }

      records.push({
        companyId: company.id,
        snapshotDate: date,
        frequency: 'daily',
        accountId: account.id,
        accountName: account.name,
        accountNumber: account.number,
        cashBalance: Math.round(balance * 100) / 100,
        changeAmount: changeAmount ? Math.round(changeAmount * 100) / 100 : null,
        changePercent: changePercent ? Math.round(changePercent * 100) / 100 : null,
      });
    }
  }

  // Generate weekly data (last 26 weeks)
  console.log('📅 Generating weekly cash snapshots for 26 weeks...');
  for (let i = 25; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - (i * 7));
    date.setHours(0, 0, 0, 0);

    for (const account of bankAccounts) {
      const weekFactor = i / 26;
      const randomVariation = (Math.random() - 0.5) * 0.08;
      const trendFactor = (1 - weekFactor) * 0.15;
      
      let balance: number;
      if (account.name.includes('Operating')) {
        balance = account.startingBalance * (1 + trendFactor + randomVariation);
      } else if (account.name.includes('Payroll')) {
        const weeksFromStart = 25 - i;
        const weeksIntoPayPeriod = weeksFromStart % 2;
        if (weeksIntoPayPeriod === 0) {
          balance = account.startingBalance * 1.5 * (1 + trendFactor);
        } else {
          balance = account.startingBalance * 0.9 * (1 + trendFactor);
        }
      } else {
        balance = account.startingBalance * (1 + trendFactor * 0.5 + randomVariation * 0.02);
      }

      records.push({
        companyId: company.id,
        snapshotDate: date,
        frequency: 'weekly',
        accountId: account.id,
        accountName: account.name,
        accountNumber: account.number,
        cashBalance: Math.round(balance * 100) / 100,
        changeAmount: null,
        changePercent: null,
      });
    }
  }

  // Generate monthly data (last 12 months)
  console.log('📅 Generating monthly cash snapshots for 12 months...');
  for (let i = 11; i >= 0; i--) {
    const date = new Date(today);
    date.setMonth(date.getMonth() - i);
    date.setDate(1); // First of month
    date.setHours(0, 0, 0, 0);

    for (const account of bankAccounts) {
      const monthFactor = i / 12;
      const randomVariation = (Math.random() - 0.5) * 0.06;
      const trendFactor = (1 - monthFactor) * 0.15;
      
      let balance: number;
      if (account.name.includes('Operating')) {
        balance = account.startingBalance * (1 + trendFactor + randomVariation);
      } else if (account.name.includes('Payroll')) {
        balance = account.startingBalance * (1.2 + trendFactor);
      } else {
        balance = account.startingBalance * (1 + trendFactor * 0.5);
      }

      records.push({
        companyId: company.id,
        snapshotDate: date,
        frequency: 'monthly',
        accountId: account.id,
        accountName: account.name,
        accountNumber: account.number,
        cashBalance: Math.round(balance * 100) / 100,
        changeAmount: null,
        changePercent: null,
      });
    }
  }

  // Insert records in batches
  console.log(`💾 Inserting ${records.length} cash records (daily, weekly, monthly)...`);
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await prisma.cashSnapshot.createMany({
      data: batch,
      skipDuplicates: true
    });
  }

  console.log(`✅ Created ${records.length} cash snapshots`);
  console.log(`   - 90 daily records per account`);
  console.log(`   - 26 weekly records per account`);
  console.log(`   - 12 monthly records per account`);
  console.log(`   - ${bankAccounts.length} bank accounts`);

  // Show summary
  const totalBalance = records
    .filter(r => r.snapshotDate.getTime() === today.setHours(0, 0, 0, 0))
    .reduce((sum, r) => sum + r.cashBalance, 0);
  
  console.log(`\n📊 Latest totals:`);
  for (const account of bankAccounts) {
    const latest = records
      .filter(r => r.accountId === account.id)
      .sort((a, b) => b.snapshotDate.getTime() - a.snapshotDate.getTime())[0];
    console.log(`   ${account.name}: $${latest.cashBalance.toLocaleString()}`);
  }
  console.log(`   TOTAL CASH: $${Math.round(totalBalance).toLocaleString()}`);
}

seedCashData()
  .catch((e) => {
    console.error('❌ Error seeding cash data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


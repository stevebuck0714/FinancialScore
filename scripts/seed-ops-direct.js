// Direct database seed for operational data
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedOperationalData() {
  const companyId = 'cmiz58dvt0000lb045p9e78s7'; // 2nd free test
  const monthsBack = 12;
  
  console.log('🌱 Seeding operational data...\n');
  console.log('📊 Company ID:', companyId);
  console.log('📅 Months back:', monthsBack);
  console.log('');
  
  try {
    // 1. Generate daily cash snapshots
    console.log('💰 Generating daily cash snapshots...');
    const cashSnapshots = [];
    const today = new Date();
    const daysToGenerate = monthsBack * 30;
    let currentBalance = 75000; // Starting balance
    
    for (let i = daysToGenerate; i >= 0; i--) {
      const snapshotDate = new Date(today);
      snapshotDate.setDate(today.getDate() - i);
      snapshotDate.setHours(0, 0, 0, 0);
      
      // Daily cash flow variation
      const dailyChange = (Math.random() - 0.3) * 15000;
      currentBalance += dailyChange;
      currentBalance = Math.max(currentBalance, 5000);
      
      // Weekly payroll (every 7 days)
      if (i % 7 === 0) {
        currentBalance -= 10000;
      }
      
      // Monthly rent (day 1)
      if (snapshotDate.getDate() === 1) {
        currentBalance -= 6000;
      }
      
      cashSnapshots.push({
        companyId,
        snapshotDate,
        frequency: 'daily',
        accountId: 'CASH_MAIN',
        accountName: 'Operating Cash',
        cashBalance: currentBalance,
        changeAmount: dailyChange,
        changePercent: ((dailyChange / (currentBalance - dailyChange)) * 100),
      });
    }
    
    await prisma.cashSnapshot.deleteMany({ where: { companyId } });
    await prisma.cashSnapshot.createMany({ data: cashSnapshots });
    console.log(`✅ Created ${cashSnapshots.length} daily cash snapshots`);
    
    // 2. Generate AR Aging snapshots
    console.log('📊 Generating AR Aging snapshots...');
    const arSnapshots = [];
    
    for (let i = 0; i < monthsBack; i++) {
      const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const totalAR = 80000 + Math.random() * 70000;
      const current = totalAR * 0.6;
      const days1to30 = totalAR * 0.2;
      const days31to60 = totalAR * 0.1;
      const days61to90 = totalAR * 0.05;
      const days90plus = totalAR * 0.05;
      
      arSnapshots.push({
        companyId,
        snapshotDate,
        frequency: 'monthly',
        totalAR,
        current,
        days1to30,
        days31to60,
        days61to90,
        days90plus,
      });
    }
    
    await prisma.aRAgingSnapshot.deleteMany({ where: { companyId } });
    await prisma.aRAgingSnapshot.createMany({ data: arSnapshots });
    console.log(`✅ Created ${arSnapshots.length} AR Aging snapshots`);
    
    // 3. Generate AP Aging snapshots
    console.log('📊 Generating AP Aging snapshots...');
    const apSnapshots = [];
    
    for (let i = 0; i < monthsBack; i++) {
      const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const totalAP = 50000 + Math.random() * 50000;
      const current = totalAP * 0.7;
      const days1to30 = totalAP * 0.15;
      const days31to60 = totalAP * 0.08;
      const days61to90 = totalAP * 0.04;
      const days90plus = totalAP * 0.03;
      
      apSnapshots.push({
        companyId,
        snapshotDate,
        frequency: 'monthly',
        totalAP,
        current,
        days1to30,
        days31to60,
        days61to90,
        days90plus,
      });
    }
    
    await prisma.aPAgingSnapshot.deleteMany({ where: { companyId } });
    await prisma.aPAgingSnapshot.createMany({ data: apSnapshots });
    console.log(`✅ Created ${apSnapshots.length} AP Aging snapshots`);
    
    console.log('\n✅ Operational data seeding complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedOperationalData();


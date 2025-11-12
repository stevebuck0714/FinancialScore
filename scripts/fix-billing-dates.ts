import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixBillingDates() {
  console.log('🔍 Finding subscriptions with incorrect billing dates...\n');

  const subscriptions = await prisma.subscription.findMany({
    include: {
      company: {
        select: { name: true }
      }
    }
  });

  if (subscriptions.length === 0) {
    console.log('No subscriptions found.');
    return;
  }

  for (const sub of subscriptions) {
    const initialPaymentDate = new Date(sub.billingStartDate || sub.createdAt);
    const currentNextBillingDate = new Date(sub.nextBillingDate);
    
    // Calculate what the next billing date SHOULD be
    const correctNextBillingDate = new Date(initialPaymentDate);
    if (sub.plan === 'monthly') {
      correctNextBillingDate.setMonth(initialPaymentDate.getMonth() + 1);
    } else if (sub.plan === 'quarterly') {
      correctNextBillingDate.setMonth(initialPaymentDate.getMonth() + 3);
    } else if (sub.plan === 'annual') {
      correctNextBillingDate.setFullYear(initialPaymentDate.getFullYear() + 1);
    }

    console.log(`\n📋 Company: ${sub.company.name}`);
    console.log(`   Plan: ${sub.plan}`);
    console.log(`   Initial Payment: ${initialPaymentDate.toLocaleDateString()}`);
    console.log(`   Current Next Billing: ${currentNextBillingDate.toLocaleDateString()}`);
    console.log(`   Correct Next Billing: ${correctNextBillingDate.toLocaleDateString()}`);

    // Check if it needs fixing
    if (currentNextBillingDate.getTime() !== correctNextBillingDate.getTime()) {
      console.log(`   ⚠️  NEEDS FIX - Updating...`);
      
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          nextBillingDate: correctNextBillingDate
        }
      });
      
      console.log(`   ✅ Fixed!`);
    } else {
      console.log(`   ✅ Already correct`);
    }
  }

  console.log('\n✨ Done!');
}

fixBillingDates()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



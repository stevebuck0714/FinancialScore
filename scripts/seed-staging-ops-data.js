// Seed operational data for "2nd free test" company in staging
const STAGING_URL = 'https://financial-score.vercel.app';

async function seedOperationalData() {
  console.log('🌱 Seeding operational data for "2nd free test"...\n');
  
  const COMPANY_ID = process.env.STAGING_COMPANY_ID || 'YOUR_COMPANY_ID_HERE';
  
  if (COMPANY_ID === 'YOUR_COMPANY_ID_HERE') {
    console.error('❌ Please provide company ID');
    console.log('\nUsage: STAGING_COMPANY_ID=your_id node scripts/seed-staging-ops-data.js');
    process.exit(1);
  }
  
  try {
    const response = await fetch(`${STAGING_URL}/api/admin/seed-operational-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: COMPANY_ID,
        dataType: 'all',
        monthsBack: 12,
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Failed:', result.error);
      process.exit(1);
    }
    
    console.log('✅ Success!');
    console.log('📊 Seeded:', result.results.seeded);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seedOperationalData();

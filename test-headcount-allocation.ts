/**
 * Test script for headcount-based LOB allocation
 */

import { applyLOBAllocations, AccountValue, AccountMapping, CompanyLOB } from './lib/lob-allocator';

function testHeadcountAllocation() {
  console.log('🧪 Testing Headcount-Based LOB Allocation\n');

  // Test data
  const companyLOBs: CompanyLOB[] = [
    { name: 'Analytics', headcountPercentage: 40 },
    { name: 'LP Product', headcountPercentage: 60 }
  ];

  const accountMappings: AccountMapping[] = [
    {
      qbAccount: 'Revenue Account 1',
      targetField: 'revenue',
      allocationMethod: 'headcount' // This should use headcount percentages
    },
    {
      qbAccount: 'Revenue Account 2',
      targetField: 'revenue',
      allocationMethod: 'manual',
      lobAllocations: { 'Analytics': 70, 'LP Product': 30 } // This should use manual allocations
    }
  ];

  const accountValues: AccountValue[] = [
    { accountName: 'Revenue Account 1', accountId: '1', value: 1000 }, // Should split 40/60
    { accountName: 'Revenue Account 2', accountId: '2', value: 2000 }  // Should split 70/30
  ];

  console.log('📊 Test Data:');
  console.log('Company LOBs:', companyLOBs);
  console.log('Account Mappings:', accountMappings);
  console.log('Account Values:', accountValues);
  console.log('');

  // Apply allocations
  const result = applyLOBAllocations(accountValues, accountMappings, companyLOBs);

  console.log('📈 Results:');
  console.log('Totals:', result.totals);
  console.log('Breakdowns:', result.breakdowns);

  // Verify results
  const revenueBreakdown = result.breakdowns.revenue;
  console.log('\n✅ Verification:');
  console.log(`Revenue Account 1 ($1000):`);
  console.log(`  Expected: Analytics $400 (40%), LP Product $600 (60%)`);
  console.log(`  Actual: Analytics $${revenueBreakdown?.Analytics?.toFixed(2)}, LP Product $${revenueBreakdown?.['LP Product']?.toFixed(2)}`);

  console.log(`Revenue Account 2 ($2000):`);
  console.log(`  Expected: Analytics $1400 (70%), LP Product $600 (30%)`);
  console.log(`  Actual: Analytics $${revenueBreakdown?.Analytics?.toFixed(2)}, LP Product $${revenueBreakdown?.['LP Product']?.toFixed(2)}`);

  const totalRevenue = result.totals.revenue;
  console.log(`\nTotal Revenue: $${totalRevenue}`);
  console.log(`Expected Total: $3000`);

  // Check if results are correct
  const analyticsTotal = revenueBreakdown?.Analytics || 0;
  const lpProductTotal = revenueBreakdown?.['LP Product'] || 0;

  const isCorrect =
    Math.abs(analyticsTotal - 1800) < 0.01 && // 400 + 1400 = 1800
    Math.abs(lpProductTotal - 1200) < 0.01 && // 600 + 600 = 1200
    Math.abs(totalRevenue - 3000) < 0.01;

  if (isCorrect) {
    console.log('\n🎉 Test PASSED! Headcount allocation working correctly.');
  } else {
    console.log('\n❌ Test FAILED! Results do not match expectations.');
    console.log(`Analytics total: ${analyticsTotal} (expected: 1800)`);
    console.log(`LP Product total: ${lpProductTotal} (expected: 1200)`);
    console.log(`Total revenue: ${totalRevenue} (expected: 3000)`);
  }

  return isCorrect;
}

// Run the test
const success = testHeadcountAllocation();
process.exit(success ? 0 : 1);

// Debug script to show EBITDA calculation for 11-2025
// This script replicates the monthly data processing logic

// Mock data for 11/2025 (based on what we saw in debug logs)
// The user showed expense: 45481.58, so let's populate the individual expense fields to sum to that
const mockMonthlyData = [
  {
    month: '11/2025',
    revenue: 129381.67,
    cogsTotal: 86304.14,
    expense: 45481.58, // CSV expense field
    cogsPayroll: 0,
    cogsOwnerPay: 0,
    cogsContractors: 0,
    cogsMaterials: 0,
    cogsCommissions: 0,
    cogsOther: 0,
    salesExpense: 0,       // Let's use the exact expense value from user's debug
    rent: 0,
    infrastructure: 0,
    autoTravel: 0,
    professionalFees: 0,
    insurance: 0,
    marketing: 0,
    payroll: 0,
    ownerBasePay: 0,
    ownersRetirement: 0,
    subcontractors: 0,     // Set individual expenses to 0, use the CSV expense field
    interestExpense: 8.58,  // This is included in totalOperatingExpense
    depreciationAmortization: 0,
    operatingExpenseTotal: 0,
    nonOperatingIncome: 0,
    extraordinaryItems: 0,
    netProfit: 0,
    totalAssets: 0,
    totalLiab: 0,
    cash: 0,
    ar: 0,
    inventory: 0,
    otherCA: 0,
    tca: 0,
    fixedAssets: 0,
    otherAssets: 0,
    ap: 0,
    otherCL: 0,
    tcl: 0,
    ltd: 0,
    ownersCapital: 0,
    ownersDraw: 0,
    commonStock: 0,
    preferredStock: 0,
    retainedEarnings: 0,
    additionalPaidInCapital: 0,
    treasuryStock: 0,
    totalEquity: 0,
    totalLAndE: 0
  }
];

// Calculate total operating expenses (same logic as main app)
function calculateTotalOperatingExpense(m) {
  const opexCategories = [
    'payroll', 'ownerBasePay', 'subcontractors', 'professionalFees',
    'insurance', 'rent', 'infrastructure', 'autoTravel',
    'salesExpense', 'marketing', 'depreciationAmortization'
    // Note: interestExpense excluded from operating expenses (it's financing expense)
  ];

  return opexCategories.reduce((sum, key) => sum + (m[key] || 0), 0);
}

// Process monthly data (same logic as main app)
function processMonthlyData(monthly) {
  return monthly.map(m => {
    // Calculate Total Operating Expenses using standard chart of accounts
    const totalOperatingExpense = calculateTotalOperatingExpense(m);

    // Use CSV expense field if available, otherwise calculated total (current app logic)
    const expense = m.expense || totalOperatingExpense;

    // Calculate Gross Profit, EBIT and EBITDA for each month
    const revenue = m.revenue || 0;
    const cogsTotal = m.cogsTotal || 0;
    const interestExpense = m.interestExpense || 0;
    const depreciationAmortization = m.depreciationAmortization || 0;
    const netProfit = m.netProfit || 0;

    // Gross Profit = Revenue - COGS
    const grossProfit = revenue - cogsTotal;

    // EBIT = Revenue - COGS - Operating Expenses + Interest Expense (add interest back since it's financing, not operating)
    const ebit = revenue - cogsTotal - expense + interestExpense;

    // EBITDA = EBIT + Depreciation + Amortization
    const ebitda = ebit + depreciationAmortization;

    return {
      ...m,
      expense, // Use the calculated total operating expense
      grossProfit,
      ebit,
      ebitda,
      totalOperatingExpense // Keep for debugging
    };
  });
}

// Run the calculation
console.log('🔍 EBITDA Calculation Debug for 11/2025');
console.log('=' .repeat(50));

const processedData = processMonthlyData(mockMonthlyData);
const nov2025 = processedData.find(m => m.month === '11/2025');

if (nov2025) {
  console.log('📊 Raw Input Values:');
  console.log(`   Revenue: ${nov2025.revenue}`);
  console.log(`   COGS Total: ${nov2025.cogsTotal}`);
  console.log(`   Interest Expense: ${nov2025.interestExpense}`);
  console.log(`   Depreciation & Amortization: ${nov2025.depreciationAmortization}`);
  console.log('');

  console.log('🧮 Calculated Values:');
  const totalOperatingExpense = calculateTotalOperatingExpense(nov2025);
  console.log(`   Total Operating Expenses: ${totalOperatingExpense}`);
  console.log(`   Gross Profit (Revenue - COGS): ${nov2025.revenue} - ${nov2025.cogsTotal} = ${nov2025.grossProfit}`);
  console.log(`   EBIT (Revenue - COGS - Expenses): ${nov2025.revenue} - ${nov2025.cogsTotal} - ${totalOperatingExpense} = ${nov2025.ebit}`);
  console.log(`   EBITDA (EBIT + D&A): ${nov2025.ebit} + ${nov2025.depreciationAmortization} = ${nov2025.ebitda}`);
  console.log('');

  console.log('📋 Operating Expense Breakdown:');
  const opexCategories = [
    'payroll', 'ownerBasePay', 'subcontractors', 'professionalFees',
    'insurance', 'rent', 'infrastructure', 'autoTravel',
    'salesExpense', 'marketing', 'depreciationAmortization', 'interestExpense'
  ];

  console.log(`   CSV Expense Field: ${nov2025.expense}`);
  console.log(`   Calculated Total Operating Expenses: ${nov2025.totalOperatingExpense}`);

  console.log('   Individual Categories:');
  opexCategories.forEach(category => {
    const value = nov2025[category] || 0;
    if (value !== 0) {
      console.log(`     ${category}: ${value}`);
    }
  });

  console.log('');
  console.log('🔍 Comparison:');
  const csvExpense = nov2025.expense || 0;
  const altEbit = nov2025.revenue - nov2025.cogsTotal - csvExpense;
  const altEbitda = altEbit + nov2025.depreciationAmortization;
  console.log(`   If using CSV expense field (${csvExpense}):`);
  console.log(`     EBIT: ${nov2025.revenue} - ${nov2025.cogsTotal} - ${csvExpense} = ${altEbit}`);
  console.log(`     EBITDA: ${altEbit} + ${nov2025.depreciationAmortization} = ${altEbitda}`);

  console.log('');
  console.log('✅ Current App Logic EBITDA for 11/2025:', nov2025.ebitda);
  console.log('🎯 User expects: -49,914');
} else {
  console.log('❌ Could not find 11/2025 data');
}

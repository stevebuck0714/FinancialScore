const fs = require('fs');

// Read the page.tsx file
const content = fs.readFileSync('app/page.tsx', 'utf8');

console.log('=== OPERATING EXPENSE FIELDS IN INCOME STATEMENTS ===\n');

// Extract all unique operating expense field names from span elements
const opexRegex = />Payroll<|>Owner.*Pay<|>Benefits<|>Insurance<|>Professional.*<|>Subcontractors<|>Rent<|>Tax.*License<|>Phone.*Communication<|>Infrastructure.*Utilities<|>Auto.*Travel<|>Sales.*Marketing<|>Marketing<|>Training.*Certification<|>Meals.*Entertainment<|>Interest.*Expense<|>Depreciation.*Amortization<|>Other.*Expense</g;

let matches = content.match(opexRegex);

if (matches) {
  // Clean and deduplicate
  let cleanFields = matches.map(match => match.replace(/[><]/g, '').trim());
  let uniqueFields = [...new Set(cleanFields)].sort();

  console.log('UNIQUE OPERATING EXPENSE FIELDS FOUND:');
  console.log('='.repeat(50));

  uniqueFields.forEach((field, index) => {
    console.log(`${index + 1}. ${field}`);
  });

  console.log(`\nTOTAL UNIQUE FIELDS: ${uniqueFields.length}`);
  console.log('EXPECTED: 18 fields from user\'s list');

  if (uniqueFields.length !== 18) {
    console.log(`\n❌ MISMATCH: Found ${uniqueFields.length} fields, expected 18`);
  } else {
    console.log('\n✅ CORRECT: Found all 18 expected fields');
  }

  // Check for duplicates
  let duplicates = cleanFields.filter((item, index) => cleanFields.indexOf(item) !== index);
  if (duplicates.length > 0) {
    console.log('\n⚠️  DUPLICATES FOUND:');
    let uniqueDuplicates = [...new Set(duplicates)];
    uniqueDuplicates.forEach(dup => {
      let count = cleanFields.filter(f => f === dup).length;
      console.log(`  - "${dup}" appears ${count} times`);
    });
  }

} else {
  console.log('No operating expense fields found');
}

console.log('\n=== COMPARISON WITH USER\'S EXPECTED LIST ===');
const expectedFields = [
  'Payroll',
  'Owner Base Pay',
  'Benefits',
  'Insurance',
  'Professional Fees',
  'Subcontractors',
  'Rent',
  'Tax & License',
  'Phone & Communication',
  'Infrastructure/Utilities',
  'Auto & Travel',
  'Sales & Marketing',
  'Marketing',
  'Training & Certification',
  'Meals & Entertainment',
  'Interest Expense',
  'Depreciation & Amortization',
  'Other Expense'
];

console.log('Expected fields:');
expectedFields.forEach((field, idx) => {
  console.log(`  ${idx + 1}. ${field}`);
});

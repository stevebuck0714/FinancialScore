const fs = require('fs');

// Read the page.tsx file
const content = fs.readFileSync('app/page.tsx', 'utf8');

console.log('=== INCOME STATEMENT DISPLAY SECTIONS ===\n');

// Find all income statement rendering sections
const patterns = [
  { name: 'AGGREGATED - income-statement', regex: /statementType === 'income-statement'.*?monthly\.length > 0[\s\S]*?(?=else if|\}\s*\}\s*\}\s*\)|return)/g },
  { name: 'AGGREGATED - income-statement-percent', regex: /statementType === 'income-statement-percent'.*?statementPeriod === 'current-month'[\s\S]*?(?=else if|\}\s*\}\s*\}\s*\)|return)/g },
  { name: 'LOB - income-statement', regex: /statementType === 'income-statement'.*?selectedLineOfBusiness[\s\S]*?(?=else if|\}\s*\}\s*\}\s*\)|return)/g },
  { name: 'LOB - income-statement-percent', regex: /statementType === 'income-statement-percent'.*?selectedLineOfBusiness[\s\S]*?(?=else if|\}\s*\}\s*\}\s*\)|return)/g }
];

patterns.forEach(pattern => {
  console.log(`${pattern.name.toUpperCase()}:`);
  console.log('='.repeat(60));

  let matches = content.match(pattern.regex);
  if (matches) {
    console.log(`Found ${matches.length} sections`);
    matches.forEach((match, index) => {
      // Count operating expense fields in each section
      const opexCount = (match.match(/<span[^>]*>\s*(Payroll|Professional|Rent|Infrastructure|Auto|Insurance|Sales|Contractors|Benefits|Tax|Phone|Training|Meals|Interest|Depreciation|Other|Marketing)/g) || []).length;
      console.log(`  Section ${index + 1}: ~${opexCount} operating expense fields`);
    });
  } else {
    console.log('No sections found');
  }
  console.log('');
});

// Also find multi-period sections
console.log('=== MULTI-PERIOD SECTIONS ===');
const multiPeriodRegex = /periodsData\.some\(.*?\).*?Row.*?\(.*?\).*?periodsData\.map/g;
let multiMatches = content.match(multiPeriodRegex);

if (multiMatches) {
  console.log(`Found ${multiMatches.length} multi-period display sections`);
  multiMatches.forEach((match, index) => {
    const opexIndicators = (match.match(/(Payroll|Professional|Rent|Infrastructure|Auto|Insurance|Sales|Contractors|Benefits|Tax|Phone|Training|Meals|Interest|Depreciation|Other|Marketing)/g) || []);
    console.log(`  Multi-period ${index + 1}: ${opexIndicators.length} potential operating expense fields`);
  });
} else {
  console.log('No multi-period sections found');
}

console.log('\n=== SUMMARY ===');
console.log('Need to update ALL sections to show exactly:');
console.log('Payroll, Owner Base Pay, Benefits, Insurance, Professional Fees,');
console.log('Subcontractors, Rent, Tax & License, Phone & Communication,');
console.log('Infrastructure/Utilities, Auto & Travel, Sales & Marketing, Marketing,');
console.log('Training & Certification, Meals & Entertainment, Interest Expense,');
console.log('Depreciation & Amortization, Other Expense');
console.log('\nTotal: 18 fields (no more, no less, consistent naming)');

// Check for any remaining inconsistencies
console.log('\n=== REMAINING INCONSISTENCIES ===');
const inconsistencies = [
  content.includes('Professional Services') && !content.includes('Professional Fees'),
  content.includes('Rent/Lease') && !content.includes('Rent'),
  content.includes('Contractors Distribution') || content.includes('Contractors/Distribution') || content.includes('Contractors - Distribution'),
  content.includes('Other Operating Expenses') && !content.includes('Other Expense')
];

if (inconsistencies.some(Boolean)) {
  console.log('❌ Found naming inconsistencies that need to be fixed');
} else {
  console.log('✅ No obvious naming inconsistencies found');
}

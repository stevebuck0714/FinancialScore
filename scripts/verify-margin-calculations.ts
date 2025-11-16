import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyMarginCalculations() {
  console.log('='.repeat(80));
  console.log('EBITDA MARGIN AND EBIT MARGIN CALCULATION VERIFICATION');
  console.log('='.repeat(80));
  console.log();

  try {
    // Fetch companies
    const companies = await prisma.company.findMany({
      take: 5,
      select: {
        id: true,
        name: true,
      }
    });

    if (!companies || companies.length === 0) {
      console.log('No companies found.');
      return;
    }

    // Use the first company with data
    for (const company of companies) {
      const monthlyData = await prisma.monthlyFinancial.findMany({
        where: {
          companyId: company.id
        },
        orderBy: {
          monthDate: 'asc'
        },
        select: {
          monthDate: true,
          revenue: true,
          expense: true,
          cogsTotal: true,
          interestExpense: true,
          depreciationAmortization: true,
        }
      });

      if (!monthlyData || monthlyData.length < 13) {
        console.log(`${company.name}: Insufficient data (need at least 13 months, has ${monthlyData?.length || 0})`);
        console.log();
        continue;
      }

      console.log(`COMPANY: ${company.name}`);
      console.log('-'.repeat(80));
      console.log();

      // Show last 3 months of calculations
      const showCount = Math.min(3, monthlyData.length - 12);
      
      for (let i = monthlyData.length - showCount; i < monthlyData.length; i++) {
        const cur = monthlyData[i];
      
      console.log(`MONTH: ${cur.monthDate.toISOString().substring(0, 10)}`);
      console.log('-'.repeat(40));
      console.log();
      
      // Current month values
      console.log('Current Month Values (from database):');
      console.log(`  Revenue:                 $${cur.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  COGS Total:              $${cur.cogsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Operating Expense:       $${cur.expense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Interest Expense:        $${cur.interestExpense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Depreciation/Amort:      $${cur.depreciationAmortization.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log();

      // Calculate EBIT and EBITDA
      const currentMonthEBIT = cur.revenue - cur.cogsTotal - cur.expense + cur.interestExpense;
      const currentMonthEBITDA = currentMonthEBIT + cur.depreciationAmortization;
      
      console.log('Calculated Values:');
      console.log(`  EBIT = Revenue - COGS - Operating Expenses + Interest Expense`);
      console.log(`       = $${cur.revenue.toLocaleString()} - $${cur.cogsTotal.toLocaleString()} - $${cur.expense.toLocaleString()} + $${cur.interestExpense.toLocaleString()}`);
      console.log(`       = $${currentMonthEBIT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log();
      console.log(`  EBITDA = EBIT + Depreciation & Amortization`);
      console.log(`         = $${currentMonthEBIT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + $${cur.depreciationAmortization.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`         = $${currentMonthEBITDA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log();

      // Calculate margins
      const ebitMargin = cur.revenue > 0 ? (currentMonthEBIT / cur.revenue) * 100 : 0;
      const ebitdaMargin = cur.revenue > 0 ? (currentMonthEBITDA / cur.revenue) * 100 : 0;

      console.log('Margin Calculations:');
      console.log(`  EBIT Margin = (EBIT ÷ Revenue) × 100`);
      console.log(`              = ($${currentMonthEBIT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ÷ $${cur.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) × 100`);
      console.log(`              = ${ebitMargin.toFixed(1)}%`);
      console.log();
      console.log(`  EBITDA Margin = (EBITDA ÷ Revenue) × 100`);
      console.log(`                = ($${currentMonthEBITDA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ÷ $${cur.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) × 100`);
      console.log(`                = ${ebitdaMargin.toFixed(1)}%`);
      console.log();
      console.log('='.repeat(80));
      console.log();
    }

    // Only show one company
    break;
  }

    console.log('NOTES:');
    console.log('- These ratios use CURRENT MONTH values only (not LTM)');
    console.log('- Income Statement ÷ Income Statement = Current Month Values');
    console.log('- EBIT = Earnings Before Interest and Taxes');
    console.log('       = Revenue - COGS - Operating Expenses + Interest Expense');
    console.log('       (Interest is added back since it\'s "Before Interest")');
    console.log('- EBITDA = Earnings Before Interest, Taxes, Depreciation, and Amortization');
    console.log('         = EBIT + Depreciation & Amortization');
    console.log('         (Uses actual depreciation/amortization from financial statements)');
    console.log();

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMarginCalculations()
  .then(() => {
    console.log('Verification complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });


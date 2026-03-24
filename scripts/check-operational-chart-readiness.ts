import { PrismaClient } from '@prisma/client';

type Frequency = 'daily' | 'weekly' | 'monthly';

type DatasetKey =
  | 'customerSales'
  | 'arAging'
  | 'arOpenInvoices'
  | 'arPayments'
  | 'apAging'
  | 'apOpenBills'
  | 'apPayments'
  | 'productSales'
  | 'inventory'
  | 'cash'
  | 'dailyFinancials'
  | 'dailyMappedLines';

type DatasetStats = {
  totalRows: number;
  distinctDates: number;
  nonZeroRows: number;
};

type DatasetStatus = {
  key: DatasetKey;
  label: string;
  stats: DatasetStats;
  note?: string;
};

type ChartReadiness = {
  tab: string;
  chart: string;
  required: DatasetKey[];
  status: 'ready' | 'missing';
  missing: string[];
  detail: string;
};

const prisma = new PrismaClient();

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function usage(): void {
  console.log(`
Usage:
  npx tsx scripts/check-operational-chart-readiness.ts --company <companyId> [--frequency daily|weekly|monthly] [--days 90]

Examples:
  npx tsx scripts/check-operational-chart-readiness.ts --company cmmnwyofv000fqhp4z8lebbny --frequency daily --days 30
  npx tsx scripts/check-operational-chart-readiness.ts --company cmmnwyofv000fqhp4z8lebbny --frequency daily --days 1095
`);
}

function buildDatasetStatuses(input: {
  customerSales: DatasetStats;
  arAging: DatasetStats;
  arOpenInvoices: DatasetStats;
  arPayments: DatasetStats;
  apAging: DatasetStats;
  apOpenBills: DatasetStats;
  apPayments: DatasetStats;
  productSales: DatasetStats;
  inventory: DatasetStats;
  cash: DatasetStats;
  dailyFinancials: DatasetStats;
  dailyMappedLines: DatasetStats;
}): Record<DatasetKey, DatasetStatus> {
  return {
    customerSales: { key: 'customerSales', label: 'Customer Sales Snapshots', stats: input.customerSales },
    arAging: { key: 'arAging', label: 'AR Aging Snapshots', stats: input.arAging },
    arOpenInvoices: { key: 'arOpenInvoices', label: 'AR Open Invoice Transactions', stats: input.arOpenInvoices },
    arPayments: { key: 'arPayments', label: 'AR Payment Transactions', stats: input.arPayments },
    apAging: { key: 'apAging', label: 'AP Aging Snapshots', stats: input.apAging },
    apOpenBills: { key: 'apOpenBills', label: 'AP Open Bill Transactions', stats: input.apOpenBills },
    apPayments: { key: 'apPayments', label: 'AP Payment Transactions', stats: input.apPayments },
    productSales: { key: 'productSales', label: 'Product Sales Transactions', stats: input.productSales },
    inventory: { key: 'inventory', label: 'Inventory Snapshots', stats: input.inventory },
    cash: { key: 'cash', label: 'Cash Snapshots', stats: input.cash },
    dailyFinancials: { key: 'dailyFinancials', label: 'Daily Financial Snapshots', stats: input.dailyFinancials },
    dailyMappedLines: { key: 'dailyMappedLines', label: 'Daily Financial Mapping Lines', stats: input.dailyMappedLines },
  };
}

function requirementMissing(dataset: DatasetStatus, requirement: 'anyRows' | 'nonZeroRows' | 'multiDate'): string | null {
  const stats = dataset.stats;
  if (requirement === 'anyRows' && stats.totalRows <= 0) {
    return `${dataset.label}: no rows`;
  }
  if (requirement === 'nonZeroRows' && stats.nonZeroRows <= 0) {
    return `${dataset.label}: rows exist but all zero`;
  }
  if (requirement === 'multiDate' && stats.distinctDates < 2) {
    return `${dataset.label}: only ${stats.distinctDates} snapshot date`;
  }
  return null;
}

function evaluateCharts(datasets: Record<DatasetKey, DatasetStatus>): ChartReadiness[] {
  const checks: Array<{
    tab: string;
    chart: string;
    required: Array<{ key: DatasetKey; requirement: 'anyRows' | 'nonZeroRows' | 'multiDate' }>;
  }> = [
    // Customers
    { tab: 'Customers', chart: 'Top Customers Driving Demand', required: [{ key: 'customerSales', requirement: 'nonZeroRows' }] },
    { tab: 'Customers', chart: 'Top Customers by Revenue', required: [{ key: 'customerSales', requirement: 'nonZeroRows' }] },
    { tab: 'Customers', chart: 'Revenue Distribution by Customer', required: [{ key: 'customerSales', requirement: 'nonZeroRows' }] },
    { tab: 'Customers', chart: 'Customer Concentration Risk', required: [{ key: 'customerSales', requirement: 'nonZeroRows' }] },
    { tab: 'Customers', chart: 'Revenue Retention Proxy', required: [{ key: 'customerSales', requirement: 'multiDate' }] },
    { tab: 'Customers', chart: 'Revenue vs Invoice Velocity', required: [{ key: 'customerSales', requirement: 'multiDate' }] },
    { tab: 'Customers', chart: 'At-Risk Accounts Queue', required: [{ key: 'customerSales', requirement: 'nonZeroRows' }] },

    // AR
    { tab: 'AR Aging', chart: 'AR Aging Trend', required: [{ key: 'arAging', requirement: 'multiDate' }] },
    { tab: 'AR Aging', chart: 'Unpaid Invoices Amount by Customer', required: [{ key: 'arOpenInvoices', requirement: 'nonZeroRows' }] },
    { tab: 'AR Aging', chart: 'AR Summary Table', required: [{ key: 'arOpenInvoices', requirement: 'nonZeroRows' }] },
    { tab: 'AR Aging', chart: 'Unpaid Invoices Table', required: [{ key: 'arOpenInvoices', requirement: 'nonZeroRows' }] },
    { tab: 'AR Aging', chart: 'Paid Invoices by Customer', required: [{ key: 'arPayments', requirement: 'nonZeroRows' }] },
    { tab: 'AR Aging', chart: 'Last 12 Month Paid Invoices Amount', required: [{ key: 'arPayments', requirement: 'nonZeroRows' }] },
    { tab: 'AR Aging', chart: 'Customer Invoices', required: [{ key: 'arOpenInvoices', requirement: 'anyRows' }] },
    { tab: 'AR Aging', chart: 'Collections Trend / DSO Proxy', required: [{ key: 'arAging', requirement: 'multiDate' }] },
    { tab: 'AR Aging', chart: 'Collections Risk Queue', required: [{ key: 'arOpenInvoices', requirement: 'nonZeroRows' }] },

    // AP
    { tab: 'AP Aging', chart: 'AP Aging Trend', required: [{ key: 'apAging', requirement: 'multiDate' }] },
    { tab: 'AP Aging', chart: 'Unpaid Bills Amount by Vendor', required: [{ key: 'apOpenBills', requirement: 'nonZeroRows' }] },
    { tab: 'AP Aging', chart: 'AP Summary Table', required: [{ key: 'apOpenBills', requirement: 'nonZeroRows' }] },
    { tab: 'AP Aging', chart: 'Unpaid Bills', required: [{ key: 'apOpenBills', requirement: 'nonZeroRows' }] },
    { tab: 'AP Aging', chart: 'Paid Bills by Vendor', required: [{ key: 'apPayments', requirement: 'nonZeroRows' }] },
    { tab: 'AP Aging', chart: 'Last 12 Month Bills Paid', required: [{ key: 'apPayments', requirement: 'nonZeroRows' }] },
    { tab: 'AP Aging', chart: 'Vendor Bills', required: [{ key: 'apOpenBills', requirement: 'anyRows' }] },
    { tab: 'AP Aging', chart: 'Payment Cadence / DPO Proxy', required: [{ key: 'apAging', requirement: 'multiDate' }] },
    { tab: 'AP Aging', chart: 'AP Past-Due Risk Queue', required: [{ key: 'apOpenBills', requirement: 'nonZeroRows' }] },
    { tab: 'AP Aging', chart: 'Upcoming Due Calendar', required: [{ key: 'apOpenBills', requirement: 'anyRows' }] },

    // Products
    { tab: 'Products', chart: 'Weekly Price-Cost Comparison', required: [{ key: 'productSales', requirement: 'nonZeroRows' }] },
    { tab: 'Products', chart: 'Top Products by Revenue (Pareto)', required: [{ key: 'productSales', requirement: 'nonZeroRows' }] },
    { tab: 'Products', chart: 'Product Profitability Scatter', required: [{ key: 'productSales', requirement: 'nonZeroRows' }] },
    { tab: 'Products', chart: 'Price-Cost Trend', required: [{ key: 'productSales', requirement: 'multiDate' }] },
    { tab: 'Products', chart: 'Price-Cost Waterfall', required: [{ key: 'productSales', requirement: 'multiDate' }] },
    { tab: 'Products', chart: 'Bottom Products (Loss Makers)', required: [{ key: 'productSales', requirement: 'nonZeroRows' }] },
    { tab: 'Products', chart: 'Freight and Other Revenue Tracker', required: [{ key: 'productSales', requirement: 'multiDate' }] },

    // Inventory
    { tab: 'Inventory', chart: 'Inventory Value Trend', required: [{ key: 'inventory', requirement: 'multiDate' }] },
    { tab: 'Inventory', chart: 'Current Inventory (Latest Month)', required: [{ key: 'inventory', requirement: 'anyRows' }] },
    { tab: 'Inventory', chart: 'Inventory Value Distribution', required: [{ key: 'inventory', requirement: 'anyRows' }] },

    // Cash
    { tab: 'Cash', chart: 'Cash Balance Trend', required: [{ key: 'cash', requirement: 'multiDate' }] },
    { tab: 'Cash', chart: '13-Week Cash Trend', required: [{ key: 'cash', requirement: 'multiDate' }] },
    { tab: 'Cash', chart: 'Cash Bridge (Receipts vs Disbursements)', required: [{ key: 'cash', requirement: 'multiDate' }] },
    { tab: 'Cash', chart: 'Bank Accounts', required: [{ key: 'cash', requirement: 'anyRows' }] },
    { tab: 'Cash', chart: 'Cash Distribution by Account', required: [{ key: 'cash', requirement: 'anyRows' }] },
    { tab: 'Cash', chart: 'Minimum Cash Covenant Monitor', required: [{ key: 'cash', requirement: 'multiDate' }] },

    // Daily Financials
    { tab: 'Daily Financials', chart: 'Summary Cards', required: [{ key: 'dailyFinancials', requirement: 'anyRows' }] },
    { tab: 'Daily Financials', chart: 'Daily Trend Chart', required: [{ key: 'dailyFinancials', requirement: 'multiDate' }] },
    { tab: 'Daily Financials', chart: 'Income Statement', required: [{ key: 'dailyFinancials', requirement: 'anyRows' }, { key: 'dailyMappedLines', requirement: 'anyRows' }] },
    { tab: 'Daily Financials', chart: 'Balance Sheet', required: [{ key: 'dailyFinancials', requirement: 'anyRows' }] },
    { tab: 'Daily Financials', chart: 'Cash Flow Statement', required: [{ key: 'dailyFinancials', requirement: 'multiDate' }] },
  ];

  return checks.map((check) => {
    const missing = check.required
      .map((req) => requirementMissing(datasets[req.key], req.requirement))
      .filter((msg): msg is string => Boolean(msg));

    return {
      tab: check.tab,
      chart: check.chart,
      required: check.required.map((req) => req.key),
      status: missing.length > 0 ? 'missing' : 'ready',
      missing,
      detail:
        missing.length > 0
          ? missing.join('; ')
          : 'All required datasets meet minimum readiness checks.',
    };
  });
}

function suggestedLoadsFromMissing(charts: ChartReadiness[]): string[] {
  const missingText = charts.flatMap((c) => c.missing).join(' | ').toLowerCase();
  const suggestions: string[] = [];

  if (missingText.includes('customer sales')) {
    suggestions.push('Load Sales source (e.g., SLInvHdrs) for customer revenue/invoice history.');
  }
  if (missingText.includes('ar open invoice')) {
    suggestions.push('Load AR open transactions (SLArtrans open items) for unpaid/customer invoice charts.');
  }
  if (missingText.includes('ar payment')) {
    suggestions.push('Load AR payment transaction feed for paid-invoice charts (ARPaymentFact).');
  }
  if (missingText.includes('ap open bill')) {
    suggestions.push('Load AP open bills source for AP aging/unpaid/vendor charts.');
  }
  if (missingText.includes('ap payment')) {
    suggestions.push('Load AP payment transaction feed for paid-bills charts.');
  }
  if (missingText.includes('product sales')) {
    suggestions.push('Load product sales transactions (item-level revenue/cogs) for product charts.');
  }
  if (missingText.includes('inventory snapshots')) {
    suggestions.push('Load inventory snapshots (items/on-hand/value) for inventory charts.');
  }
  if (missingText.includes('cash snapshots')) {
    suggestions.push('Load bank/cash snapshots for cash trend/account charts.');
  }
  if (missingText.includes('daily financial snapshots')) {
    suggestions.push('Run financial snapshot import (COA + mapped monthly/daily financial pipeline).');
  }
  if (missingText.includes('mapping lines')) {
    suggestions.push('Complete data mapping + mapped-line generation for Income Statement detail lines.');
  }

  return [...new Set(suggestions)];
}

async function main(): Promise<void> {
  if (hasFlag('--help') || hasFlag('-h')) {
    usage();
    return;
  }

  const companyId = parseArg('--company');
  if (!companyId) {
    usage();
    process.exitCode = 1;
    return;
  }

  const frequencyArg = (parseArg('--frequency') || 'daily').toLowerCase();
  if (!['daily', 'weekly', 'monthly'].includes(frequencyArg)) {
    throw new Error(`Invalid --frequency "${frequencyArg}". Use daily|weekly|monthly.`);
  }
  const frequency = frequencyArg as Frequency;

  const daysArg = Number(parseArg('--days') || 90);
  if (!Number.isFinite(daysArg) || daysArg <= 0) {
    throw new Error('Invalid --days value. Must be a positive number.');
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - daysArg * 24 * 60 * 60 * 1000);
  const trailing12Start = addMonths(endDate, -12);

  const snapshotWhere = {
    companyId,
    frequency,
    snapshotDate: { gte: startDate, lte: endDate },
  };

  const [
    customerRows,
    customerDateGroups,
    customerNonZero,
    arAgingRows,
    arAgingDateGroups,
    arAgingNonZero,
    arOpenRows,
    arOpenDateGroups,
    arOpenNonZero,
    arPaymentRows,
    arPaymentDateGroups,
    arPaymentNonZero,
    apAgingRows,
    apAgingDateGroups,
    apAgingNonZero,
    apOpenRows,
    apOpenDateGroups,
    apOpenNonZero,
    apPaymentRows,
    apPaymentDateGroups,
    apPaymentNonZero,
    productRows,
    productDateGroups,
    productNonZero,
    inventoryRows,
    inventoryDateGroups,
    inventoryNonZero,
    cashRows,
    cashDateGroups,
    cashNonZero,
    dailyRows,
    dailyDateGroups,
    dailyNonZero,
    mappedLineRows,
    mappedLineDateGroups,
    mappedLineNonZero,
    recentErrors,
  ] = await Promise.all([
    prisma.customerSalesSnapshot.count({ where: snapshotWhere }),
    prisma.customerSalesSnapshot.groupBy({ by: ['snapshotDate'], where: snapshotWhere }),
    prisma.customerSalesSnapshot.count({ where: { ...snapshotWhere, revenue: { not: 0 } } }),

    prisma.aRAgingSnapshot.count({ where: snapshotWhere }),
    prisma.aRAgingSnapshot.groupBy({ by: ['snapshotDate'], where: snapshotWhere }),
    prisma.aRAgingSnapshot.count({ where: { ...snapshotWhere, totalAR: { gt: 0 } } }),

    prisma.aROpenInvoiceSnapshot.count({ where: snapshotWhere }),
    prisma.aROpenInvoiceSnapshot.groupBy({ by: ['snapshotDate'], where: snapshotWhere }),
    prisma.aROpenInvoiceSnapshot.count({ where: { ...snapshotWhere, amountDueHome: { gt: 0 } } }),

    prisma.aRPaymentFact.count({ where: { companyId, paymentDate: { gte: trailing12Start, lte: endDate } } }),
    prisma.aRPaymentFact.groupBy({ by: ['paymentDate'], where: { companyId, paymentDate: { gte: trailing12Start, lte: endDate } } }),
    prisma.aRPaymentFact.count({ where: { companyId, paymentDate: { gte: trailing12Start, lte: endDate }, paidAmountHome: { not: 0 } } }),

    prisma.aPAgingSnapshot.count({ where: snapshotWhere }),
    prisma.aPAgingSnapshot.groupBy({ by: ['snapshotDate'], where: snapshotWhere }),
    prisma.aPAgingSnapshot.count({ where: { ...snapshotWhere, totalAP: { gt: 0 } } }),

    prisma.aPOpenBillSnapshot.count({ where: snapshotWhere }),
    prisma.aPOpenBillSnapshot.groupBy({ by: ['snapshotDate'], where: snapshotWhere }),
    prisma.aPOpenBillSnapshot.count({ where: { ...snapshotWhere, amountDueHome: { gt: 0 } } }),

    prisma.aPPaymentFact.count({ where: { companyId, paymentDate: { gte: trailing12Start, lte: endDate } } }),
    prisma.aPPaymentFact.groupBy({ by: ['paymentDate'], where: { companyId, paymentDate: { gte: trailing12Start, lte: endDate } } }),
    prisma.aPPaymentFact.count({ where: { companyId, paymentDate: { gte: trailing12Start, lte: endDate }, paidAmountHome: { not: 0 } } }),

    prisma.productSalesSnapshot.count({ where: snapshotWhere }),
    prisma.productSalesSnapshot.groupBy({ by: ['snapshotDate'], where: snapshotWhere }),
    prisma.productSalesSnapshot.count({ where: { ...snapshotWhere, revenue: { not: 0 } } }),

    prisma.inventorySnapshot.count({ where: snapshotWhere }),
    prisma.inventorySnapshot.groupBy({ by: ['snapshotDate'], where: snapshotWhere }),
    prisma.inventorySnapshot.count({ where: { ...snapshotWhere, assetValue: { not: 0 } } }),

    prisma.cashSnapshot.count({ where: snapshotWhere }),
    prisma.cashSnapshot.groupBy({ by: ['snapshotDate'], where: snapshotWhere }),
    prisma.cashSnapshot.count({ where: { ...snapshotWhere, cashBalance: { not: 0 } } }),

    prisma.dailyFinancialSnapshot.count({ where: snapshotWhere }),
    prisma.dailyFinancialSnapshot.groupBy({ by: ['snapshotDate'], where: snapshotWhere }),
    prisma.dailyFinancialSnapshot.count({ where: { ...snapshotWhere, OR: [{ revenue: { not: 0 } }, { expense: { not: 0 } }, { cash: { not: 0 } }] } }),

    prisma.dailyFinancialMappedLine.count({ where: snapshotWhere }),
    prisma.dailyFinancialMappedLine.groupBy({ by: ['snapshotDate'], where: snapshotWhere }),
    prisma.dailyFinancialMappedLine.count({ where: { ...snapshotWhere, amount: { not: 0 } } }),

    prisma.apiSyncLog.findMany({
      where: {
        companyId,
        status: { not: 'success' },
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
  ]);

  const datasets = buildDatasetStatuses({
    customerSales: { totalRows: customerRows, distinctDates: customerDateGroups.length, nonZeroRows: customerNonZero },
    arAging: { totalRows: arAgingRows, distinctDates: arAgingDateGroups.length, nonZeroRows: arAgingNonZero },
    arOpenInvoices: { totalRows: arOpenRows, distinctDates: arOpenDateGroups.length, nonZeroRows: arOpenNonZero },
    arPayments: { totalRows: arPaymentRows, distinctDates: arPaymentDateGroups.length, nonZeroRows: arPaymentNonZero },
    apAging: { totalRows: apAgingRows, distinctDates: apAgingDateGroups.length, nonZeroRows: apAgingNonZero },
    apOpenBills: { totalRows: apOpenRows, distinctDates: apOpenDateGroups.length, nonZeroRows: apOpenNonZero },
    apPayments: { totalRows: apPaymentRows, distinctDates: apPaymentDateGroups.length, nonZeroRows: apPaymentNonZero },
    productSales: { totalRows: productRows, distinctDates: productDateGroups.length, nonZeroRows: productNonZero },
    inventory: { totalRows: inventoryRows, distinctDates: inventoryDateGroups.length, nonZeroRows: inventoryNonZero },
    cash: { totalRows: cashRows, distinctDates: cashDateGroups.length, nonZeroRows: cashNonZero },
    dailyFinancials: { totalRows: dailyRows, distinctDates: dailyDateGroups.length, nonZeroRows: dailyNonZero },
    dailyMappedLines: { totalRows: mappedLineRows, distinctDates: mappedLineDateGroups.length, nonZeroRows: mappedLineNonZero },
  });

  const charts = evaluateCharts(datasets);
  const missingCharts = charts.filter((c) => c.status === 'missing');
  const readyCharts = charts.filter((c) => c.status === 'ready');
  const suggestions = suggestedLoadsFromMissing(missingCharts);

  console.log('\n=== Operational Chart Readiness Audit ===');
  console.log(`Company: ${companyId}`);
  console.log(`Frequency: ${frequency}`);
  console.log(`Window: ${toDateOnly(startDate)} -> ${toDateOnly(endDate)} (${daysArg} days)\n`);

  console.log('Dataset coverage:');
  (Object.values(datasets) as DatasetStatus[]).forEach((dataset) => {
    console.log(
      `- ${dataset.label.padEnd(34)} rows=${String(dataset.stats.totalRows).padStart(6)}  dates=${String(dataset.stats.distinctDates).padStart(4)}  nonZero=${String(dataset.stats.nonZeroRows).padStart(6)}`
    );
  });

  console.log('\nChart readiness:');
  charts.forEach((chart) => {
    const icon = chart.status === 'ready' ? 'OK ' : 'MISS';
    console.log(`- [${icon}] ${chart.tab} :: ${chart.chart}`);
    if (chart.status === 'missing') {
      chart.missing.forEach((m) => console.log(`    -> ${m}`));
    }
  });

  console.log('\nSummary:');
  console.log(`- Ready charts:   ${readyCharts.length}`);
  console.log(`- Missing charts: ${missingCharts.length}`);

  if (suggestions.length > 0) {
    console.log('\nRecommended additional loads / sub-accounts to validate:');
    suggestions.forEach((s) => console.log(`- ${s}`));
  }

  if (recentErrors.length > 0) {
    console.log('\nRecent non-success sync logs (same window):');
    recentErrors.forEach((row) => {
      console.log(
        `- ${toDateOnly(row.createdAt)} ${row.syncType} status=${row.status} imported=${row.recordsImported} errors=${row.errorCount}`
      );
    });
  }

  console.log('\nDone.\n');
}

main()
  .catch((error) => {
    console.error('\nChart readiness audit failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


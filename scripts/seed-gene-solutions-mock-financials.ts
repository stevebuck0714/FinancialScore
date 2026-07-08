import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPANY_ID = 'cmrc86g8l0001qhbkgcq6wrf9';
const EXPECTED_COMPANY_NAME_FRAGMENT = 'Gene Solutions';
const MOCK_SOURCE = 'GENE_SOLUTIONS_MOCK';
const MOCK_FILE_NAME = 'Gene Solutions Mock Financials - 3 Year';
const START_DATE = '2023-01-01';

type DailyRow = {
  companyId: string;
  snapshotDate: Date;
  frequency: string;
  revenue: number;
  expense: number;
  cogsPayroll: number;
  cogsMaterials: number;
  cogsOther: number;
  cogsTotal: number;
  payroll: number;
  benefits: number;
  insurance: number;
  professionalFees: number;
  rent: number;
  taxLicense: number;
  phoneComm: number;
  infrastructure: number;
  autoTravel: number;
  salesExpense: number;
  marketing: number;
  trainingCert: number;
  mealsEntertainment: number;
  interestExpense: number;
  depreciationAmortization: number;
  otherExpense: number;
  stateIncomeTaxes: number;
  federalIncomeTaxes: number;
  cash: number;
  ar: number;
  inventory: number;
  otherCA: number;
  tca: number;
  fixedAssets: number;
  investments: number;
  otherAssets: number;
  totalAssets: number;
  ap: number;
  loc: number;
  otherCL: number;
  tcl: number;
  ltd: number;
  totalLiab: number;
  ownersCapital: number;
  preferredStock: number;
  retainedEarnings: number;
  totalEquity: number;
  totalLAndE: number;
  sourcePlatform: string;
  sourceRunId: string;
};

type MonthlyRow = Omit<DailyRow, 'snapshotDate' | 'frequency' | 'sourcePlatform' | 'sourceRunId' | 'totalLAndE'> & {
  monthDate: Date;
  financialRecordId: string;
  revenueBreakdown: Record<string, number>;
  cogsBreakdown: Record<string, number>;
  expenseBreakdown: Record<string, number>;
  lobBreakdowns: Record<string, unknown>;
  totalLAndE: number;
};

const solutionMix = [
  { name: 'Clinical Oncology', share: 0.46, grossMargin: 0.66 },
  { name: "Women's Health", share: 0.26, grossMargin: 0.62 },
  { name: 'Biopharma Services', share: 0.18, grossMargin: 0.55 },
  { name: 'AI / Bioinformatics', share: 0.10, grossMargin: 0.72 },
];

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function annualRevenueTarget(year: number): number {
  if (year <= 2023) return 82_000_000;
  if (year === 2024) return 94_000_000;
  if (year === 2025) return 106_000_000;
  return 111_000_000;
}

function daysInYear(year: number): number {
  return Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1) === 366 * 24 * 60 * 60 * 1000 ? 366 : 365;
}

function seasonality(date: Date): number {
  const month = date.getUTCMonth();
  const factors = [0.92, 0.94, 0.98, 1.0, 1.02, 1.05, 1.08, 1.06, 1.04, 1.08, 1.1, 1.16];
  const weekday = date.getUTCDay();
  const weekdayFactor = weekday === 0 ? 0.62 : weekday === 6 ? 0.72 : 1.07;
  const wave = 1 + Math.sin((date.getTime() / 86_400_000) / 23) * 0.035;
  return factors[month] * weekdayFactor * wave;
}

function allocate(amount: number, parts: Array<{ name: string; share: number }>): Record<string, number> {
  const result: Record<string, number> = {};
  let assigned = 0;
  parts.forEach((part, index) => {
    const value = index === parts.length - 1 ? amount - assigned : round(amount * part.share);
    result[part.name] = round(value);
    assigned += value;
  });
  return result;
}

function buildDailyRows(startDate: Date, endDate: Date, sourceRunId: string): DailyRow[] {
  const rows: DailyRow[] = [];

  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    const year = cursor.getUTCFullYear();
    const annualTarget = annualRevenueTarget(year);
    const baseDailyRevenue = annualTarget / daysInYear(year);
    const revenue = round(baseDailyRevenue * seasonality(cursor));
    const mixRevenue = allocate(revenue, solutionMix);

    const cogsTotal = round(solutionMix.reduce((sum, line) => {
      const lineRevenue = mixRevenue[line.name] || 0;
      return sum + lineRevenue * (1 - line.grossMargin);
    }, 0));
    const cogsPayroll = round(cogsTotal * 0.31);
    const cogsMaterials = round(cogsTotal * 0.49);
    const cogsOther = round(cogsTotal - cogsPayroll - cogsMaterials);

    const payroll = round(revenue * 0.118);
    const benefits = round(payroll * 0.23);
    const salesExpense = round(revenue * 0.062);
    const marketing = round(revenue * 0.034);
    const infrastructure = round(revenue * 0.041);
    const professionalFees = round(revenue * 0.018);
    const insurance = round(revenue * 0.008);
    const rent = round(revenue * 0.012);
    const taxLicense = round(revenue * 0.006);
    const phoneComm = round(revenue * 0.004);
    const autoTravel = round(revenue * 0.011);
    const trainingCert = round(revenue * 0.0045);
    const mealsEntertainment = round(revenue * 0.0025);
    const depreciationAmortization = round(7_400_000 / daysInYear(year));
    const interestExpense = round(3_100_000 / daysInYear(year));
    const otherExpense = round(revenue * 0.019);
    const expense = round(
      payroll +
        benefits +
        insurance +
        professionalFees +
        rent +
        taxLicense +
        phoneComm +
        infrastructure +
        autoTravel +
        salesExpense +
        marketing +
        trainingCert +
        mealsEntertainment +
        interestExpense +
        depreciationAmortization +
        otherExpense,
    );
    const preTaxIncome = revenue - cogsTotal - expense;
    const stateIncomeTaxes = round(Math.max(0, preTaxIncome) * 0.035);
    const federalIncomeTaxes = round(Math.max(0, preTaxIncome) * 0.17);
    const netIncome = round(preTaxIncome - stateIncomeTaxes - federalIncomeTaxes);

    const progress = rows.length / Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000));
    const balanceWave = Math.sin(rows.length / 31) * 1_400_000;
    const revenueScale = annualTarget / 106_000_000;
    const cash = round((17_000_000 + progress * 11_000_000 + balanceWave) * revenueScale);
    const ar = round((revenue * 82) + Math.sin(rows.length / 17) * 650_000);
    const inventory = round((7_800_000 + progress * 2_200_000 + Math.sin(rows.length / 29) * 520_000) * revenueScale);
    const otherCA = round((6_300_000 + progress * 1_700_000) * revenueScale);
    const tca = round(cash + ar + inventory + otherCA);
    const fixedAssets = round((68_000_000 + progress * 10_000_000 + Math.sin(rows.length / 91) * 1_400_000) * revenueScale);
    const investments = round((8_000_000 + progress * 2_500_000) * revenueScale);
    const otherAssets = round((15_000_000 + progress * 4_500_000) * revenueScale);
    const totalAssets = round(tca + fixedAssets + investments + otherAssets);

    const ap = round((cogsTotal + expense * 0.32) * 48 + Math.sin(rows.length / 19) * 500_000);
    const loc = round((5_500_000 + Math.sin(rows.length / 47) * 850_000) * revenueScale);
    const otherCL = round((11_500_000 + progress * 2_500_000) * revenueScale);
    const tcl = round(ap + loc + otherCL);
    const ltd = round((54_000_000 - progress * 6_000_000) * revenueScale);
    const totalLiab = round(tcl + ltd);
    const totalEquity = round(totalAssets - totalLiab);
    const preferredStock = round(totalEquity * 0.9);
    const retainedEarnings = round(totalEquity - preferredStock);
    const ownersCapital = 0;

    rows.push({
      companyId: COMPANY_ID,
      snapshotDate: new Date(cursor),
      frequency: 'daily',
      revenue,
      expense: round(expense + stateIncomeTaxes + federalIncomeTaxes),
      cogsPayroll,
      cogsMaterials,
      cogsOther,
      cogsTotal,
      payroll,
      benefits,
      insurance,
      professionalFees,
      rent,
      taxLicense,
      phoneComm,
      infrastructure,
      autoTravel,
      salesExpense,
      marketing,
      trainingCert,
      mealsEntertainment,
      interestExpense,
      depreciationAmortization,
      otherExpense,
      stateIncomeTaxes,
      federalIncomeTaxes,
      cash: Math.max(0, cash),
      ar: Math.max(0, ar),
      inventory: Math.max(0, inventory),
      otherCA,
      tca,
      fixedAssets,
      investments,
      otherAssets,
      totalAssets,
      ap: Math.max(0, ap),
      loc,
      otherCL,
      tcl,
      ltd,
      totalLiab,
      ownersCapital,
      preferredStock,
      retainedEarnings,
      totalEquity,
      totalLAndE: totalAssets,
      sourcePlatform: MOCK_SOURCE,
      sourceRunId,
    });
  }

  return rows;
}

function aggregateMonthly(rows: DailyRow[], financialRecordId: string): MonthlyRow[] {
  const buckets = new Map<string, DailyRow[]>();
  for (const row of rows) {
    const key = dateKey(monthStart(row.snapshotDate));
    buckets.set(key, [...(buckets.get(key) || []), row]);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, monthRows]) => {
      const latest = monthRows[monthRows.length - 1];
      const sum = (field: keyof DailyRow) => round(monthRows.reduce((total, row) => total + Number(row[field] || 0), 0));
      const revenue = sum('revenue');
      const cogsTotal = sum('cogsTotal');
      const expense = sum('expense');
      const revenueBreakdown = allocate(revenue, solutionMix);
      const cogsBreakdown = allocate(cogsTotal, solutionMix.map((line) => ({ name: line.name, share: revenueBreakdown[line.name] / Math.max(1, revenue) })));
      const expenseBreakdown = allocate(expense, [
        { name: 'Laboratory Operations', share: 0.34 },
        { name: 'Sales & Marketing', share: 0.24 },
        { name: 'R&D / Bioinformatics', share: 0.18 },
        { name: 'G&A', share: 0.16 },
        { name: 'Interest, D&A, Taxes', share: 0.08 },
      ]);

      return {
        companyId: COMPANY_ID,
        financialRecordId,
        monthDate: utcDate(key),
        revenue,
        revenueBreakdown,
        expense,
        expenseBreakdown,
        cogsPayroll: sum('cogsPayroll'),
        cogsMaterials: sum('cogsMaterials'),
        cogsOther: sum('cogsOther'),
        cogsTotal,
        cogsBreakdown,
        payroll: sum('payroll'),
        benefits: sum('benefits'),
        insurance: sum('insurance'),
        professionalFees: sum('professionalFees'),
        rent: sum('rent'),
        taxLicense: sum('taxLicense'),
        stateIncomeTaxes: sum('stateIncomeTaxes'),
        federalIncomeTaxes: sum('federalIncomeTaxes'),
        phoneComm: sum('phoneComm'),
        infrastructure: sum('infrastructure'),
        autoTravel: sum('autoTravel'),
        salesExpense: sum('salesExpense'),
        marketing: sum('marketing'),
        trainingCert: sum('trainingCert'),
        mealsEntertainment: sum('mealsEntertainment'),
        interestExpense: sum('interestExpense'),
        depreciationAmortization: sum('depreciationAmortization'),
        otherExpense: sum('otherExpense'),
        lobBreakdowns: {
          source: MOCK_SOURCE,
          businessLines: solutionMix.map((line) => ({
            name: line.name,
            revenue: revenueBreakdown[line.name],
            cogs: cogsBreakdown[line.name],
            grossMargin: round((revenueBreakdown[line.name] || 0) - (cogsBreakdown[line.name] || 0)),
          })),
        },
        cash: latest.cash,
        ar: latest.ar,
        inventory: latest.inventory,
        otherCA: latest.otherCA,
        tca: latest.tca,
        fixedAssets: latest.fixedAssets,
        investments: latest.investments,
        otherAssets: latest.otherAssets,
        totalAssets: latest.totalAssets,
        ap: latest.ap,
        loc: latest.loc,
        otherCL: latest.otherCL,
        tcl: latest.tcl,
        ltd: latest.ltd,
        totalLiab: latest.totalLiab,
        ownersCapital: latest.ownersCapital,
        preferredStock: latest.preferredStock,
        retainedEarnings: latest.retainedEarnings,
        totalEquity: latest.totalEquity,
        totalLAndE: latest.totalLAndE,
      };
    });
}

async function resolveUploadedByUserId(): Promise<string> {
  const existingRecord = await prisma.financialRecord.findFirst({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: 'desc' },
    select: { uploadedByUserId: true },
  });
  if (existingRecord?.uploadedByUserId) return existingRecord.uploadedByUserId;

  const companyUser = await prisma.user.findFirst({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (companyUser?.id) return companyUser.id;

  const anyAdmin = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (anyAdmin?.id) return anyAdmin.id;

  throw new Error('Unable to resolve uploadedByUserId. Create at least one user before seeding financial records.');
}

async function main() {
  const endDate = startOfUtcDay(addDays(new Date(), -1));
  const startDate = utcDate(START_DATE);
  const sourceRunId = `${MOCK_SOURCE}-${new Date().toISOString()}`;

  const company = await prisma.company.findUnique({
    where: { id: COMPANY_ID },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Company not found: ${COMPANY_ID}`);
  if (!String(company.name || '').includes(EXPECTED_COMPANY_NAME_FRAGMENT)) {
    throw new Error(`Refusing to seed: expected company name to include "${EXPECTED_COMPANY_NAME_FRAGMENT}", found "${company.name}".`);
  }

  const nonMockDailyCount = await prisma.dailyFinancialSnapshot.count({
    where: {
      companyId: COMPANY_ID,
      frequency: 'daily',
      snapshotDate: { gte: startDate, lte: endDate },
      sourcePlatform: { not: MOCK_SOURCE },
    },
  });
  if (nonMockDailyCount > 0) {
    throw new Error(
      `Refusing to overwrite ${nonMockDailyCount} non-mock DailyFinancialSnapshot row(s) for Gene Solutions. Remove/backup them or add a separate force workflow.`,
    );
  }

  const uploadedByUserId = await resolveUploadedByUserId();
  const dailyRows = buildDailyRows(startDate, endDate, sourceRunId);

  const priorMockRecords = await prisma.financialRecord.findMany({
    where: {
      companyId: COMPANY_ID,
      fileName: MOCK_FILE_NAME,
    },
    select: { id: true },
  });

  console.log(`Seeding ${company.name} (${COMPANY_ID})`);
  console.log(`Date range: ${dateKey(startDate)} through ${dateKey(endDate)}`);
  console.log(`Mock source: ${MOCK_SOURCE}`);
  console.log(`Prior mock FinancialRecord rows: ${priorMockRecords.length}`);

  await prisma.$transaction(async (tx) => {
    await tx.dailyFinancialSnapshot.deleteMany({
      where: {
        companyId: COMPANY_ID,
        frequency: 'daily',
        snapshotDate: { gte: startDate, lte: endDate },
        sourcePlatform: MOCK_SOURCE,
      },
    });

    if (priorMockRecords.length > 0) {
      await tx.financialRecord.deleteMany({
        where: {
          id: { in: priorMockRecords.map((record) => record.id) },
          companyId: COMPANY_ID,
          fileName: MOCK_FILE_NAME,
        },
      });
    }

    const financialRecord = await tx.financialRecord.create({
      data: {
        companyId: COMPANY_ID,
        uploadedByUserId,
        fileName: MOCK_FILE_NAME,
        fileUrl: null,
        rawData: {
          source: MOCK_SOURCE,
          generatedAt: new Date().toISOString(),
          startDate: dateKey(startDate),
          endDate: dateKey(endDate),
          assumptions: {
            annualRevenueTargets: {
              2023: 82_000_000,
              2024: 94_000_000,
              2025: 106_000_000,
              2026: 111_000_000,
            },
            latestBalanceSheetApproximation: {
              totalAssets: 190_000_000,
              totalLiabilities: 80_000_000,
              totalEquity: 110_000_000,
              preferredStockShareOfEquity: 0.9,
              retainedEarningsShareOfEquity: 0.1,
            },
          },
        },
        columnMapping: {
          source: MOCK_SOURCE,
          generatedBy: 'scripts/seed-gene-solutions-mock-financials.ts',
        },
      },
    });

    const monthlyRows = aggregateMonthly(dailyRows, financialRecord.id);

    for (let index = 0; index < dailyRows.length; index += 500) {
      await tx.dailyFinancialSnapshot.createMany({
        data: dailyRows.slice(index, index + 500),
      });
    }

    await tx.monthlyFinancial.createMany({
      data: monthlyRows,
    });

    const currentMonthStart = monthStart(new Date());
    const publishedMonthlyRows = monthlyRows.filter((monthly) => monthly.monthDate < currentMonthStart);
    await tx.financialMonthPublish.deleteMany({
      where: {
        companyId: COMPANY_ID,
        monthStart: { gte: startDate, lt: currentMonthStart },
        notes: { contains: MOCK_SOURCE },
      },
    });
    await tx.financialMonthPublish.createMany({
      data: publishedMonthlyRows.map((row) => {
        const sourceDays = dailyRows.filter((daily) => dateKey(monthStart(daily.snapshotDate)) === dateKey(row.monthDate)).length;
        return {
          companyId: COMPANY_ID,
          monthStart: row.monthDate,
          monthEnd: monthEnd(row.monthDate),
          status: 'PUBLISHED',
          publishedAt: new Date(),
          sourceSnapshotDays: sourceDays,
          sourceRunIds: [sourceRunId],
          notes: `Published by ${MOCK_SOURCE} one-time seed.`,
        };
      }),
      skipDuplicates: true,
    });

    await tx.derivedApiCache.deleteMany({
      where: { namespace: { in: ['master-data', 'operational-data'] } },
    });

    console.log(`Created FinancialRecord: ${financialRecord.id}`);
    console.log(`Created daily rows: ${dailyRows.length}`);
    console.log(`Created monthly rows: ${monthlyRows.length}`);
    console.log(`Published closed months: ${publishedMonthlyRows.length}`);
  });

  const latest = dailyRows[dailyRows.length - 1];
  const latestYear = latest.snapshotDate.getUTCFullYear();
  const latestYearRevenue = dailyRows
    .filter((row) => row.snapshotDate.getUTCFullYear() === latestYear)
    .reduce((sum, row) => sum + row.revenue, 0);
  const latestYearDays = dailyRows.filter((row) => row.snapshotDate.getUTCFullYear() === latestYear).length;
  const annualizedRevenue = latestYearRevenue / Math.max(1, latestYearDays) * daysInYear(latestYear);

  console.log('Latest daily balance sheet:');
  console.log({
    date: dateKey(latest.snapshotDate),
    cash: round(latest.cash),
    ar: round(latest.ar),
    inventory: round(latest.inventory),
    totalAssets: round(latest.totalAssets),
    ap: round(latest.ap),
    totalLiab: round(latest.totalLiab),
    totalEquity: round(latest.totalEquity),
    annualizedRevenue: round(annualizedRevenue),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { addEstCalendarDays, addEstCalendarMonths, formatEstDate, previousEstBusinessDate, utcMidnightForEstDate } from '@/lib/time/eastern';
import {
  getIsolvedClientBook,
  type IsolvedClientRecord,
} from '@/lib/operational/isolved-people-cloud-mock';
import type { PayrollBureauAccountingInputs } from '@/lib/operational/payroll-bureau-accounting-overlay';
import {
  buildCostToServeReport,
  normalizeClientMatchKey,
  payrollsPerYear,
  scaleAmount,
  scaleCount,
  unmappedAccountingRevenue,
  type CostToServeOperatingClient,
  type CostToServeRevenueInput,
} from '@/lib/operational/payroll-bureau-cost-to-serve';

export const PAYROLL_BUREAU_OPS_SOURCE = 'CORELYTICS_PAYROLL_BUREAU';

const ISSUE_PRIORITY = [
  'Funding or ACH failure',
  'Payroll past cutoff',
  'Payroll not approved',
  'Material payroll variance',
  'Tax or compliance exception',
  'Missing client input',
  'Routine warning',
] as const;

const RESPONSIBLE_PARTIES = ['Client', 'Payroll company', 'Bank', 'isolved'] as const;

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seedKey: string) {
  const next = mulberry32(xmur3(seedKey)());
  return {
    next,
    int(min: number, max: number) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      return items[this.int(0, items.length - 1)];
    },
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function pct(part: number, total: number): number {
  return total > 0 ? round2((part / total) * 100) : 0;
}

export function weightedPayrollUnits(client: IsolvedClientRecord): number {
  let units = 1;
  if (client.currentCount > 100) units += 0.5;
  if (client.stateCount > 1) units += 0.5;
  if (client.payFrequency === 'Weekly') units += 0.25;
  if (client.locations.length > 1) units += 0.25;
  if (client.jobCosting) units += 0.25;
  if (client.union) units += 0.5;
  if (client.tipsOrCommissions) units += 0.25;
  if (client.offCycleFrequent) units += 0.25;
  return round2(units);
}

function pepmForClient(client: IsolvedClientRecord): number {
  const base =
    client.sizeBand === 'Enterprise' ? 82 :
    client.sizeBand === 'Large' ? 98 :
    client.sizeBand === 'Mid' ? 112 :
    132;
  const industryBump =
    client.division === 'Healthcare' || client.division === 'Professional Services' ? 8 :
    client.division === 'Construction Support' ? 6 :
    0;
  return base + industryBump;
}

function annualBilling(client: IsolvedClientRecord): number {
  const accountFee = client.sizeBand === 'Enterprise' ? 240 : client.sizeBand === 'Large' ? 160 : 90;
  return round2(pepmForClient(client) * client.currentCount * 12 + accountFee * 12);
}

function annualOperatingCounts(client: IsolvedClientRecord) {
  const payrolls = payrollsPerYear(client.payFrequency);
  const offCycleRuns = client.offCycleFrequent ? 8 : 2;
  const adjustments = (client.offCycleFrequent ? 12 : 4) + Math.max(0, client.stateCount - 1) * 3;
  const liveChecks = Math.round(client.currentCount * (1 - client.depositDirectShare) * payrolls);
  const directDeposits = Math.round(client.currentCount * client.depositDirectShare * payrolls);
  return { payrolls, offCycleRuns, adjustments, liveChecks, directDeposits };
}

function operatingClientForPeriod(
  client: IsolvedClientRecord,
  period: 'month' | 'ytd' | 'annual',
  monthIndex: number
): CostToServeOperatingClient {
  const annual = annualOperatingCounts(client);
  return {
    clientName: client.name,
    ein: client.ein,
    accountManager: client.accountManager,
    processor: client.processor,
    clientType: client.division,
    sizeBand: client.sizeBand,
    employeeCount: client.currentCount,
    payFrequency: client.payFrequency,
    stateCount: client.stateCount,
    locationCount: client.locations.length,
    payrolls: scaleCount(annual.payrolls, period, monthIndex),
    offCycleRuns: scaleCount(annual.offCycleRuns, period, monthIndex),
    adjustments: scaleCount(annual.adjustments, period, monthIndex),
    liveChecks: scaleCount(annual.liveChecks, period, monthIndex),
    directDeposits: scaleCount(annual.directDeposits, period, monthIndex),
    jobCosting: client.jobCosting,
    union: client.union,
  };
}

function revenueMapFromAccounting(
  accounting?: { entries(): IterableIterator<[string, CostToServeRevenueInput]> } | null
): Map<string, CostToServeRevenueInput> | undefined {
  if (!accounting) return undefined;
  const map = new Map<string, CostToServeRevenueInput>();
  for (const [key, value] of accounting.entries()) {
    map.set(key, value);
  }
  return map.size > 0 ? map : undefined;
}

function estimatedGrossMap(
  clients: IsolvedClientRecord[],
  period: 'month' | 'ytd' | 'annual',
  monthIndex: number
): Map<string, number> {
  const map = new Map<string, number>();
  for (const client of clients) {
    const amount = scaleAmount(annualBilling(client), period, monthIndex);
    map.set(normalizeClientMatchKey(client.name), amount);
    map.set(client.name, amount);
  }
  return map;
}

function periodGross(client: IsolvedClientRecord): number {
  const divisor = client.payFrequency === 'Weekly' ? 52 : client.payFrequency === 'Semimonthly' ? 24 : 26;
  return round2(client.currentCount * (client.avgAnnualCost / divisor));
}

function healthScore(client: IsolvedClientRecord, rng: ReturnType<typeof makeRng>) {
  const onTime = 74 + rng.int(0, 24);
  const corrections = 82 - rng.int(0, client.offCycleFrequent ? 28 : 14);
  const funding = 76 + rng.int(0, 22);
  const support = 78 - rng.int(0, weightedPayrollUnits(client) > 2 ? 22 : 10);
  const complexity = Math.max(48, 94 - weightedPayrollUnits(client) * 12);
  const volumeTrend = 62 + rng.int(0, 32);
  const utilization = 76 + rng.int(0, 20);
  const drag = (client.offCycleFrequent ? 8 : 0) + (weightedPayrollUnits(client) >= 2.25 ? 10 : 0);
  const score = round2(
    onTime * 0.2 +
    corrections * 0.2 +
    funding * 0.2 +
    support * 0.15 +
    complexity * 0.1 +
    volumeTrend * 0.1 +
    utilization * 0.05 -
    drag
  );
  const band = score >= 78 ? 'Green' : score >= 64 ? 'Yellow' : 'Red';
  return { score, band, onTime, corrections, funding };
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + shift + (n - 1) * 7;
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number): string {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  last.setUTCDate(last.getUTCDate() - shift);
  return last.toISOString().slice(0, 10);
}

function usHolidayName(ymd: string): string | null {
  const year = Number(ymd.slice(0, 4));
  const mmdd = ymd.slice(5);
  if (mmdd === '01-01') return "New Year's Day";
  if (mmdd === '06-19') return 'Juneteenth';
  if (mmdd === '07-04') return 'Independence Day';
  if (mmdd === '11-11') return 'Veterans Day';
  if (mmdd === '12-25') return 'Christmas Day';
  if (ymd === nthWeekdayOfMonth(year, 0, 1, 3)) return 'Martin Luther King Jr. Day';
  if (ymd === nthWeekdayOfMonth(year, 1, 1, 3)) return "Presidents' Day";
  if (ymd === lastWeekdayOfMonth(year, 4, 1)) return 'Memorial Day';
  if (ymd === nthWeekdayOfMonth(year, 8, 1, 1)) return 'Labor Day';
  if (ymd === nthWeekdayOfMonth(year, 9, 1, 2)) return 'Columbus Day';
  if (ymd === nthWeekdayOfMonth(year, 10, 4, 4)) return 'Thanksgiving';
  return null;
}

function clientProcessWeekday(client: IsolvedClientRecord): number {
  const seed = client.ein.replace(/\D/g, '').split('').reduce((sum, digit) => sum + Number(digit), 0);
  return (seed % 5) + 1;
}

function clientPaysOnDate(client: IsolvedClientRecord, ymd: string, holiday: boolean): boolean {
  const dow = utcMidnightForEstDate(ymd).getUTCDay();
  if (dow === 0 || dow === 6 || holiday) return false;
  if (dow !== clientProcessWeekday(client)) return false;
  const day = Number(ymd.slice(8, 10));
  const week = Math.floor(utcMidnightForEstDate(ymd).getTime() / 86_400_000 / 7);
  if (client.payFrequency === 'Weekly') return true;
  if (client.payFrequency === 'Biweekly') return week % 2 === clientProcessWeekday(client) % 2;
  return day === 14 || day === 15 || day >= 28;
}

function nextWeekdayIsHoliday(ymd: string): boolean {
  let cursor = ymd;
  for (let i = 0; i < 4; i += 1) {
    cursor = addEstCalendarDays(cursor, 1);
    const dow = utcMidnightForEstDate(cursor).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    return Boolean(usHolidayName(cursor));
  }
  return false;
}

function buildClientQualityRanking(clients: IsolvedClientRecord[], rng: ReturnType<typeof makeRng>) {
  const rows = clients.map((client) => {
    const units = weightedPayrollUnits(client);
    const roll = rng.next();
    const cause: 'Client' | 'Payroll company' | 'Mixed' =
      roll < 0.3 ? 'Client' :
      roll < 0.58 ? 'Payroll company' :
      'Mixed';
    const onTimeSubmissionPct = round2(Math.max(42,
      cause === 'Client' ? 68 - rng.int(0, 18) :
      cause === 'Payroll company' ? 91 - rng.int(0, 8) :
      78 - rng.int(0, 12)
    ));
    const onTimeApprovalPct = round2(Math.max(46,
      cause === 'Client' ? 70 - rng.int(0, 16) :
      cause === 'Payroll company' ? 92 - rng.int(0, 7) :
      80 - rng.int(0, 11)
    ));
    const correctionFrequency = round2(
      (cause === 'Payroll company' ? 5.2 : cause === 'Client' ? 1.4 : 3.1) + rng.next() * 1.8
    );
    const offCycleFrequency = round2((client.offCycleFrequent ? 8.5 : 1.4) + rng.next() * 2.2);
    const fundingFailures =
      cause === 'Client' ? rng.int(3, 6) :
      cause === 'Mixed' ? rng.int(1, 3) :
      rng.int(0, 1);
    const supportTickets = Math.round(
      8 + units * 6 + rng.int(0, 10) +
      (cause === 'Client' ? 16 : cause === 'Payroll company' ? 10 : 8)
    );
    const manualProcessing = round2(Math.min(95,
      (cause === 'Payroll company' ? 48 : cause === 'Client' ? 22 : 34) +
      units * 8 + (client.union ? 10 : 0) + (client.jobCosting ? 6 : 0) + rng.int(0, 8)
    ));
    const taxExceptions =
      (cause === 'Payroll company' ? rng.int(4, 9) : cause === 'Mixed' ? rng.int(2, 5) : rng.int(0, 2)) +
      (client.stateCount > 1 ? 1 : 0);
    const payrollVolatility = round2(Math.min(90, 12 + (client.payFrequency === 'Weekly' ? 8 : 0) + units * 10 + rng.int(0, 18)));
    const serviceScore = round2(Math.max(
      18,
      Math.min(
        96,
        onTimeSubmissionPct * 0.16 +
        onTimeApprovalPct * 0.16 +
        Math.max(0, 100 - correctionFrequency * 10) * 0.14 +
        Math.max(0, 100 - offCycleFrequency * 5) * 0.08 +
        Math.max(0, 100 - fundingFailures * 10) * 0.14 +
        Math.max(0, 100 - supportTickets * 0.9) * 0.08 +
        Math.max(0, 100 - manualProcessing) * 0.12 +
        Math.max(0, 100 - taxExceptions * 6) * 0.06 +
        Math.max(0, 100 - payrollVolatility) * 0.06
      )
    ));
    return {
      clientName: client.name,
      ein: client.ein,
      accountManager: client.accountManager,
      processor: client.processor,
      employeeCount: client.currentCount,
      onTimeSubmissionPct,
      onTimeApprovalPct,
      correctionFrequency,
      offCycleFrequency,
      fundingFailures,
      supportTickets,
      manualProcessing,
      taxExceptions,
      payrollVolatility,
      serviceScore,
      cause,
    };
  }).sort((a, b) => a.serviceScore - b.serviceScore || b.supportTickets - a.supportTickets);
  return rows.map((row, index) => ({
    ...row,
    difficultyRank: index + 1,
    band: row.serviceScore >= 70 ? 'Green' : row.serviceScore >= 61 ? 'Yellow' : 'Red',
  }));
}

function buildTwoWeekWorkloadForecast(
  clients: IsolvedClientRecord[],
  processorNames: string[],
  rng: ReturnType<typeof makeRng>,
  asOfDate: string,
) {
  const startDate = addEstCalendarDays(asOfDate, 1);
  const absences = [
    { processor: processorNames[4] || 'Riley Patel', startDate: addEstCalendarDays(asOfDate, 9), endDate: addEstCalendarDays(asOfDate, 10), reason: 'PTO' },
    { processor: processorNames[6] || 'Casey Hughes', startDate: addEstCalendarDays(asOfDate, 14), endDate: addEstCalendarDays(asOfDate, 14), reason: 'Training' },
  ];
  const dailyCapacity = 8.5;
  const days: Array<Record<string, any>> = [];
  for (let offset = 1; offset <= 14; offset += 1) {
    const ymd = addEstCalendarDays(asOfDate, offset);
    const dow = utcMidnightForEstDate(ymd).getUTCDay();
    const holidayName = usHolidayName(ymd);
    const isWeekend = dow === 0 || dow === 6;
    const dueClients = isWeekend || holidayName
      ? []
      : clients.filter((client) => clientPaysOnDate(client, ymd, Boolean(holidayName)));
    const cutoffCompression = Boolean(!holidayName && !isWeekend && nextWeekdayIsHoliday(ymd));
    const employees = dueClients.reduce((sum, client) => sum + client.currentCount, 0);
    const gross = round2(dueClients.reduce((sum, client) => sum + periodGross(client), 0));
    const weightedUnits = round2(dueClients.reduce((sum, client) => sum + weightedPayrollUnits(client), 0));
    const absentToday = absences.filter((row) => ymd >= row.startDate && ymd <= row.endDate);
    const availableProcessors = Math.max(1, processorNames.length - absentToday.length);
    const capacityUnits = round2(availableProcessors * dailyCapacity);
    days.push({
      date: ymd,
      dayOfWeek: WEEKDAY_NAMES[dow],
      holidayName,
      isWeekend,
      isProcessingDay: !isWeekend && !holidayName,
      payrolls: dueClients.length,
      employees,
      estimatedGross: gross,
      estimatedNet: round2(gross * 0.702),
      weightedUnits,
      capacityUnits,
      capacityUsedPct: pct(weightedUnits, capacityUnits),
      highVolume: weightedUnits >= capacityUnits * 0.85 && dueClients.length > 0,
      cutoffCompression,
      staffAbsences: absentToday.map((row) => row.processor).join(', ') || '—',
      absenceCount: absentToday.length,
      unresolvedPrerequisites: cutoffCompression ? rng.int(4, 9) : rng.int(0, 4),
    });
  }
  const processingDays = days.filter((day) => day.isProcessingDay);
  const peak = [...processingDays].sort((a, b) => b.weightedUnits - a.weightedUnits)[0];
  const processorLoad = processorNames.map((processor) => {
    const share = clients.filter((client) => client.processor === processor);
    const twoWeekPayrolls = processingDays.reduce((sum, day) => (
      sum + share.filter((client) => clientPaysOnDate(client, day.date, Boolean(day.holidayName))).length
    ), 0);
    const twoWeekUnits = round2(processingDays.reduce((sum, day) => (
      sum + share
        .filter((client) => clientPaysOnDate(client, day.date, Boolean(day.holidayName)))
        .reduce((inner, client) => inner + weightedPayrollUnits(client), 0)
    ), 0));
    const absence = absences.find((row) => row.processor === processor);
    return {
      processor,
      twoWeekPayrolls,
      twoWeekUnits,
      twoWeekEmployees: share.reduce((sum, client) => sum + client.currentCount, 0),
      capacityUnits: round2(dailyCapacity * processingDays.length),
      capacityUsedPct: pct(twoWeekUnits, dailyCapacity * processingDays.length),
      absence: absence ? `${absence.reason} ${absence.startDate}–${absence.endDate}` : '—',
    };
  }).sort((a, b) => b.twoWeekUnits - a.twoWeekUnits);
  const hardClients = clients.filter((client) => client.offCycleFrequent || weightedPayrollUnits(client) >= 2.25).slice(0, 8);
  const prerequisites = hardClients.map((client, index) => ({
    clientName: client.name,
    accountManager: client.accountManager,
    processor: client.processor,
    missingItem: rng.pick(['Timesheet not approved', 'Funding file missing', 'New-hire not in isolved', 'Garnishment setup incomplete', 'Hour batch not submitted']),
    dueDate: addEstCalendarDays(asOfDate, 1 + (index % 8)),
    impact: client.currentCount >= 100 ? 'High' : client.currentCount >= 40 ? 'Medium' : 'Low',
  }));
  return {
    startDate,
    endDate: addEstCalendarDays(asOfDate, 14),
    summary: {
      processingDays: processingDays.length,
      payrolls: processingDays.reduce((sum, day) => sum + day.payrolls, 0),
      employees: processingDays.reduce((sum, day) => sum + day.employees, 0),
      estimatedGross: round2(processingDays.reduce((sum, day) => sum + day.estimatedGross, 0)),
      estimatedNet: round2(processingDays.reduce((sum, day) => sum + day.estimatedNet, 0)),
      weightedUnits: round2(processingDays.reduce((sum, day) => sum + day.weightedUnits, 0)),
      peakDate: peak?.date || startDate,
      peakPayrolls: peak?.payrolls || 0,
      holidayCompressionDays: days.filter((day) => day.cutoffCompression).length,
      knownAbsences: absences.length,
      unresolvedPrerequisites: prerequisites.length,
    },
    days,
    processorLoad,
    absences,
    prerequisites,
  };
}

function monthKeyFromEstDate(ymd: string): string {
  return ymd.slice(0, 7);
}

function shiftMonthKey(monthKey: string, delta: number): string {
  return addEstCalendarMonths(`${monthKey}-01`, delta).slice(0, 7);
}

function monthLabel(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function monthSeason(monthKey: string): number {
  const month = Number(monthKey.slice(5, 7));
  const map = [0, 0.93, 0.95, 0.99, 1, 1.02, 1.01, 0.97, 0.99, 0.94, 1.03, 1.07, 1.09];
  return map[month] || 1;
}

function monthlyRunFactor(client: IsolvedClientRecord): number {
  if (client.payFrequency === 'Weekly') return 52 / 12;
  if (client.payFrequency === 'Semimonthly') return 24 / 12;
  return 26 / 12;
}

function rollupValues(values: number[], kind: 'sum' | 'last' | 'avg'): number {
  if (values.length === 0) return 0;
  if (kind === 'last') return values[values.length - 1];
  if (kind === 'avg') return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
  return round2(values.reduce((sum, value) => sum + value, 0));
}

function buildMonthlyExecutiveScorecard(
  companyId: string,
  clients: IsolvedClientRecord[],
  processorCount: number,
  asOfDate: string,
) {
  const rng = makeRng(`isolved-bureau-monthly:${companyId}`);
  const currentMonth = monthKeyFromEstDate(asOfDate);
  const processors = Math.max(1, processorCount);
  const clientsNow = clients.length;
  const employeesNow = clients.reduce((sum, client) => sum + client.currentCount, 0);
  const baseRuns = round2(clients.reduce((sum, client) => sum + monthlyRunFactor(client), 0));
  const baseGross = round2(clients.reduce((sum, client) => sum + periodGross(client) * monthlyRunFactor(client), 0));
  const monthKeys = Array.from({ length: 24 }, (_, index) => shiftMonthKey(currentMonth, index - 23));
  const snapshots = monthKeys.map((monthKey, index) => {
    const growth = 0.9 + (index / 23) * 0.1;
    const season = monthSeason(monthKey);
    const noise = 0.97 + rng.next() * 0.06;
    const mtd = monthKey === currentMonth ? Number(asOfDate.slice(8, 10)) / 30.4 : 1;
    const clientsActive = Math.max(180, Math.round(clientsNow * growth * (0.995 + rng.next() * 0.01)));
    const employeesPaid = Math.round(employeesNow * growth * season * noise * (0.96 + mtd * 0.04));
    const payrollRuns = round2(baseRuns * growth * season * noise * mtd);
    const grossPayroll = round2(baseGross * growth * season * noise * mtd);
    const fundsHandled = round2(grossPayroll * 1.165);
    const onTimePct = round2(Math.min(98.4, 93.1 + growth * 1.6 + (season - 1) * 4 + (rng.next() - 0.5) * 1.4));
    const firstTimeRightPct = round2(Math.min(97.2, 90.4 + growth * 1.8 + (rng.next() - 0.5) * 1.6));
    const correctionRate = round2(Math.max(1.4, 4.6 - growth * 1.1 + (1 - season) * 1.2 + rng.next() * 0.6));
    const fundingFailRate = round2(Math.max(0.4, 1.8 - growth * 0.4 + rng.next() * 0.5));
    const taxExceptionRate = round2(Math.max(0.8, 2.6 - growth * 0.5 + rng.next() * 0.4));
    const avgPayrollsPerProcessor = round2(payrollRuns / processors);
    const weightedWorkloadPerProcessor = round2((payrollRuns * 1.62) / processors);
    const openEscalations = Math.max(4, Math.round(18 - growth * 6 + (1 - season) * 8 + rng.int(0, 4)));
    const newClients = Math.max(0, Math.round((3.2 + rng.next() * 2.4) * (monthKey === currentMonth ? mtd : 1)));
    const clientsLost = Math.max(0, Math.round((rng.next() > 0.55 ? 1 : 0) + (rng.next() > 0.82 ? 1 : 0)));
    const retentionRate = round2(Math.min(99.8, 100 - (clientsLost / Math.max(1, clientsActive)) * 100));
    return {
      monthKey,
      monthLabel: monthLabel(monthKey),
      activeClients: clientsActive,
      employeesPaid,
      payrollRuns,
      grossPayroll,
      fundsHandled,
      onTimePct,
      firstTimeRightPct,
      correctionRate,
      fundingFailRate,
      taxExceptionRate,
      avgPayrollsPerProcessor,
      weightedWorkloadPerProcessor,
      openEscalations,
      newClients,
      clientsLost,
      retentionRate,
    };
  });

  const byKey = new Map(snapshots.map((row) => [row.monthKey, row]));
  const current = byKey.get(currentMonth) || snapshots[snapshots.length - 1];
  const previous = byKey.get(shiftMonthKey(currentMonth, -1)) || current;
  const year = currentMonth.slice(0, 4);
  const ytdKeys = monthKeys.filter((key) => key.startsWith(year) && key <= currentMonth);
  const priorYearMonth = shiftMonthKey(currentMonth, -12);
  const priorYear = byKey.get(priorYearMonth);
  const priorYearPrefix = priorYearMonth.slice(0, 4);
  const priorYearYtdKeys = monthKeys.filter((key) => key.startsWith(priorYearPrefix) && key.slice(5, 7) <= currentMonth.slice(5, 7));

  const definitions: Array<{
    key: keyof typeof current;
    label: string;
    format: 'number' | 'money' | 'percent';
    better: 'higher' | 'lower';
    rollup: 'sum' | 'last' | 'avg';
    budget: number;
  }> = [
    { key: 'activeClients', label: 'Active payroll clients', format: 'number', better: 'higher', rollup: 'last', budget: Math.round(clientsNow * 1.02) },
    { key: 'employeesPaid', label: 'Active employees paid', format: 'number', better: 'higher', rollup: 'avg', budget: Math.round(employeesNow * 1.03) },
    { key: 'payrollRuns', label: 'Payroll runs processed', format: 'number', better: 'higher', rollup: 'sum', budget: round2(baseRuns * 1.04) },
    { key: 'grossPayroll', label: 'Total gross payroll', format: 'money', better: 'higher', rollup: 'sum', budget: round2(baseGross * 1.04) },
    { key: 'fundsHandled', label: 'Total funds handled', format: 'money', better: 'higher', rollup: 'sum', budget: round2(baseGross * 1.165 * 1.04) },
    { key: 'onTimePct', label: 'On-time payroll %', format: 'percent', better: 'higher', rollup: 'avg', budget: 96 },
    { key: 'firstTimeRightPct', label: 'First-time-right %', format: 'percent', better: 'higher', rollup: 'avg', budget: 94 },
    { key: 'correctionRate', label: 'Correction and reversal rate', format: 'percent', better: 'lower', rollup: 'avg', budget: 3.2 },
    { key: 'fundingFailRate', label: 'Funding-failure rate', format: 'percent', better: 'lower', rollup: 'avg', budget: 1.1 },
    { key: 'taxExceptionRate', label: 'Tax-exception rate', format: 'percent', better: 'lower', rollup: 'avg', budget: 1.8 },
    { key: 'avgPayrollsPerProcessor', label: 'Average payrolls per processor', format: 'number', better: 'lower', rollup: 'avg', budget: round2(baseRuns / processors) },
    { key: 'weightedWorkloadPerProcessor', label: 'Weighted workload per processor', format: 'number', better: 'lower', rollup: 'avg', budget: round2((baseRuns * 1.5) / processors) },
    { key: 'openEscalations', label: 'Open client escalations', format: 'number', better: 'lower', rollup: 'last', budget: 8 },
    { key: 'newClients', label: 'New clients implemented', format: 'number', better: 'higher', rollup: 'sum', budget: 4 },
    { key: 'clientsLost', label: 'Clients lost', format: 'number', better: 'lower', rollup: 'sum', budget: 1 },
    { key: 'retentionRate', label: 'Client retention rate', format: 'percent', better: 'higher', rollup: 'avg', budget: 98.8 },
  ];

  const kpis = definitions.map((definition) => {
    const trendMonths = monthKeys.slice(-12);
    const trend = trendMonths.map((monthKey) => {
      const row = byKey.get(monthKey);
      const py = byKey.get(shiftMonthKey(monthKey, -12));
      const actual = Number(row?.[definition.key] || 0);
      const budget = definition.rollup === 'sum' && monthKey === currentMonth
        ? round2(definition.budget * (Number(asOfDate.slice(8, 10)) / 30.4))
        : definition.budget;
      return {
        monthKey,
        month: monthLabel(monthKey),
        actual,
        budget,
        priorYear: Number(py?.[definition.key] || 0),
      };
    });
    const ytdValues = ytdKeys.map((key) => Number(byKey.get(key)?.[definition.key] || 0));
    const priorYearYtdValues = priorYearYtdKeys.map((key) => Number(byKey.get(key)?.[definition.key] || 0));
    const currentBudget = definition.rollup === 'sum'
      ? round2(definition.budget * (Number(asOfDate.slice(8, 10)) / 30.4))
      : definition.budget;
    const ytdBudget = definition.rollup === 'sum'
      ? round2(definition.budget * ytdKeys.length)
      : definition.rollup === 'avg'
        ? definition.budget
        : definition.budget;
    return {
      key: definition.key,
      label: definition.label,
      format: definition.format,
      better: definition.better,
      rollup: definition.rollup,
      current: Number(current[definition.key] || 0),
      previous: Number(previous[definition.key] || 0),
      budget: currentBudget,
      ytd: rollupValues(ytdValues, definition.rollup),
      ytdBudget,
      priorYear: Number(priorYear?.[definition.key] || 0),
      priorYearYtd: rollupValues(priorYearYtdValues, definition.rollup),
      trend,
    };
  });

  return {
    asOfDate,
    currentMonth,
    currentMonthLabel: monthLabel(currentMonth),
    previousMonthLabel: monthLabel(shiftMonthKey(currentMonth, -1)),
    priorYearMonthLabel: monthLabel(priorYearMonth),
    processorCount: processors,
    note: `Monthly bureau scorecard through ${asOfDate} EST. Current month is month-to-date. Volume KPIs year-to-date are summed; rates are averaged; client counts and open escalations are month-end.`,
    kpis,
    months: snapshots.slice(-12),
  };
}

function segmentForClient(client: IsolvedClientRecord, annualRevenue: number, marginPct: number): string {
  const highValue = annualRevenue >= 80_000;
  const highComplexity = weightedPayrollUnits(client) >= 2;
  if (highValue && !highComplexity) return 'High-value / low-complexity';
  if (highValue && highComplexity) return 'High-value / high-complexity';
  if (!highValue && !highComplexity) return 'Low-value / low-complexity';
  return 'Low-value / high-complexity';
}

export function buildIsolvedBureauOpsPayload(
  companyId: string,
  accounting?: PayrollBureauAccountingInputs | null
) {
  const clients = getIsolvedClientBook(companyId).filter((client) => client.status === 'Active');
  const rng = makeRng(`isolved-bureau-ops:${companyId}`);
  const asOfDate = formatEstDate();
  const latestCheckDate = previousEstBusinessDate(asOfDate);
  const monthIndex = Math.min(12, Math.max(1, Number(asOfDate.slice(5, 7)) || 1));
  const clientNames = clients.map((client) => client.name);
  const monthCts = buildCostToServeReport({
    period: 'month',
    monthIndex,
    clients: clients.map((client) => operatingClientForPeriod(client, 'month', monthIndex)),
    revenueByClientName: revenueMapFromAccounting(accounting?.monthByName),
    estimatedGrossByClientName: estimatedGrossMap(clients, 'month', monthIndex),
    pools: accounting?.monthPools,
    unmappedQbdRevenue: unmappedAccountingRevenue(accounting?.monthByName, clientNames),
  });
  const ytdCts = buildCostToServeReport({
    period: 'ytd',
    monthIndex,
    clients: clients.map((client) => operatingClientForPeriod(client, 'ytd', monthIndex)),
    revenueByClientName: revenueMapFromAccounting(accounting?.ytdByName),
    estimatedGrossByClientName: estimatedGrossMap(clients, 'ytd', monthIndex),
    pools: accounting?.ytdPools,
    unmappedQbdRevenue: unmappedAccountingRevenue(accounting?.ytdByName, clientNames),
  });
  const annualCts = buildCostToServeReport({
    period: 'annual',
    monthIndex,
    clients: clients.map((client) => operatingClientForPeriod(client, 'annual', monthIndex)),
    revenueByClientName: revenueMapFromAccounting(accounting?.annualByName),
    estimatedGrossByClientName: estimatedGrossMap(clients, 'annual', monthIndex),
    pools: accounting?.annualPools,
    unmappedQbdRevenue: unmappedAccountingRevenue(accounting?.annualByName, clientNames),
  });
  const annualByName = new Map(annualCts.rows.map((row) => [row.clientName, row]));
  const economics = clients.map((client) => {
    const cts = annualByName.get(client.name);
    const revenue = cts?.netRevenue ?? annualBilling(client);
    const cost = cts?.costToServe ?? 0;
    const profit = cts?.contribution ?? round2(revenue - cost);
    const marginPct = cts?.marginPct ?? pct(profit, revenue);
    const health = healthScore(client, rng);
    return {
      clientName: client.name,
      ein: client.ein,
      accountManager: client.accountManager,
      processor: client.processor,
      clientType: client.division,
      sizeBand: client.sizeBand,
      employeeCount: client.currentCount,
      payFrequency: client.payFrequency,
      payrollRunsPerYear: payrollsPerYear(client.payFrequency),
      weightedUnits: weightedPayrollUnits(client),
      pepm: pepmForClient(client),
      revenue,
      costToServe: cost,
      profit,
      marginPct,
      revenuePerPayroll: cts?.revenuePerPayroll ?? round2(revenue / payrollsPerYear(client.payFrequency)),
      revenuePerEmployee: cts?.revenuePerEmployee ?? round2(revenue / Math.max(1, client.currentCount)),
      healthScore: health.score,
      healthBand: health.band,
      segment: segmentForClient(client, revenue, marginPct),
      recommendedAction:
        marginPct < 18 ? 'Reprice or restructure' :
        health.band === 'Red' ? 'Immediate service review' :
        health.band === 'Yellow' ? 'Watch and tighten process' :
        'Protect and retain',
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const weeklyDue = clients.filter((client) => client.payFrequency === 'Weekly').slice(0, 16);
  const otherDue = clients.filter((client) => client.payFrequency !== 'Weekly').filter((_, index) => index % 11 === 0).slice(0, 8);
  const dueToday = [...weeklyDue, ...otherDue];
  const todayRuns = dueToday.map((client, index) => {
    const statusRoll = rng.next();
    const status =
      statusRoll > 0.72 ? 'Completed' :
      statusRoll > 0.52 ? 'Processing' :
      statusRoll > 0.34 ? 'Awaiting client' :
      statusRoll > 0.18 ? 'At risk' :
      'Exceptions';
    const gross = periodGross(client);
    return {
      id: `PR-${asOfDate}-${index + 1}`,
      clientName: client.name,
      accountManager: client.accountManager,
      processor: client.processor,
      payrollDate: asOfDate,
      cutoff: `${16 + (index % 3)}:00`,
      hoursUntilDeadline: status === 'Completed' ? 0 : rng.int(1, 9),
      status,
      payrollType: client.offCycleFrequent && rng.next() > 0.7 ? 'Off-cycle' : 'Regular',
      employeeCount: client.currentCount,
      grossPay: gross,
      funded: status === 'Completed' ? true : rng.next() > 0.22,
      isolvedPayrollId: `ISO-RUN-${client.ein.replace('-', '')}-${asOfDate.replace(/-/g, '')}`,
    };
  });

  const completed = todayRuns.filter((run) => run.status === 'Completed');
  const atRisk = todayRuns.filter((run) => run.status === 'At risk');
  const awaitingClient = todayRuns.filter((run) => run.status === 'Awaiting client');
  const withExceptions = todayRuns.filter((run) => run.status === 'Exceptions');
  const offCycle = todayRuns.filter((run) => run.payrollType === 'Off-cycle');
  const unfunded = todayRuns.filter((run) => !run.funded);
  const employeesPaidToday = todayRuns.reduce((sum, run) => sum + run.employeeCount, 0);
  const grossToday = round2(todayRuns.reduce((sum, run) => sum + run.grossPay, 0));

  const needsAttention = [...todayRuns]
    .filter((run) => run.status !== 'Completed' || !run.funded)
    .map((run, index) => {
      const issue = !run.funded ? ISSUE_PRIORITY[0] :
        run.status === 'At risk' ? ISSUE_PRIORITY[1] :
        run.status === 'Awaiting client' ? ISSUE_PRIORITY[2] :
        run.status === 'Exceptions' ? ISSUE_PRIORITY[rng.int(3, 6)] :
        ISSUE_PRIORITY[6];
      const responsibleParty: (typeof RESPONSIBLE_PARTIES)[number] =
        !run.funded || issue === ISSUE_PRIORITY[0] ? 'Bank' :
        run.status === 'Awaiting client' || issue === ISSUE_PRIORITY[2] || issue === ISSUE_PRIORITY[5] ? 'Client' :
        issue.toLowerCase().includes('isolved') ? 'isolved' :
        'Payroll company';
      return {
        id: `ATTN-${index + 1}`,
        clientName: run.clientName,
        accountManager: run.accountManager,
        processor: run.processor,
        payrollDate: run.payrollDate,
        cutoff: run.cutoff,
        payrollValue: run.grossPay,
        status: run.status,
        issueType: issue,
        hoursUntilDeadline: run.hoursUntilDeadline,
        employeeImpact: run.employeeCount,
        financialImpact: run.grossPay,
        responsibleParty,
        escalationStatus: issue === ISSUE_PRIORITY[0] || issue === ISSUE_PRIORITY[1] ? 'Escalated' : 'Open',
        isolvedRecordUrl: `/isolved/payrolls/${run.isolvedPayrollId}`,
        isolvedPayrollId: run.isolvedPayrollId,
        priority: ISSUE_PRIORITY.indexOf(issue as typeof ISSUE_PRIORITY[number]),
      };
    })
    .sort((a, b) => a.priority - b.priority || a.hoursUntilDeadline - b.hoursUntilDeadline);

  const processorWorkload = Array.from(
    todayRuns.reduce((map, run) => {
      const current = map.get(run.processor) || { processor: run.processor, payrolls: 0, employees: 0, openIssues: 0 };
      current.payrolls += 1;
      current.employees += run.employeeCount;
      if (run.status !== 'Completed') current.openIssues += 1;
      map.set(run.processor, current);
      return map;
    }, new Map<string, { processor: string; payrolls: number; employees: number; openIssues: number }>()).values()
  ).sort((a, b) => b.payrolls - a.payrolls);

  const totalRevenue = round2(economics.reduce((sum, row) => sum + row.revenue, 0));
  const totalProfit = round2(economics.reduce((sum, row) => sum + row.profit, 0));

  const rollup = (key: 'clientType' | 'sizeBand') => {
    const grouped = new Map<string, { label: string; clients: number; employees: number; revenue: number; profit: number }>();
    for (const row of economics) {
      const label = String(row[key]);
      const current = grouped.get(label) || { label, clients: 0, employees: 0, revenue: 0, profit: 0 };
      current.clients += 1;
      current.employees += row.employeeCount;
      current.revenue += row.revenue;
      current.profit += row.profit;
      grouped.set(label, current);
    }
    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        revenue: round2(row.revenue),
        profit: round2(row.profit),
        marginPct: pct(row.profit, row.revenue),
        sharePct: pct(row.revenue, totalRevenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  };

  const processors = Array.from(
    clients.reduce((map, client) => {
      const units = weightedPayrollUnits(client);
      const current = map.get(client.processor) || {
        processor: client.processor,
        activeClients: 0,
        employees: 0,
        weightedUnits: 0,
        payrollsYear: 0,
      };
      current.activeClients += 1;
      current.employees += client.currentCount;
      current.weightedUnits += units;
      current.payrollsYear += client.payFrequency === 'Weekly' ? 52 : client.payFrequency === 'Semimonthly' ? 24 : 26;
      map.set(client.processor, current);
      return map;
    }, new Map<string, { processor: string; activeClients: number; employees: number; weightedUnits: number; payrollsYear: number }>()).values()
  )
    .map((row) => {
      const today = processorWorkload.find((item) => item.processor === row.processor);
      const onTimeRate = round2(92 + ((row.processor.length % 7) - 2) * 0.6);
      const correctionRate = round2(3.2 + (row.weightedUnits / Math.max(1, row.activeClients) - 1.5) * 1.4);
      return {
        ...row,
        weightedUnits: round2(row.weightedUnits),
        payrollsProcessedToday: today?.payrolls || 0,
        employeesPaidToday: today?.employees || 0,
        onTimeRate,
        correctionRate: round2(Math.max(0.8, correctionRate)),
        exceptionVolume: today?.openIssues || 0,
        openEscalations: today?.openIssues || 0,
        nextWeekPayrolls: Math.round(row.payrollsYear / 52),
      };
    })
    .sort((a, b) => b.weightedUnits - a.weightedUnits);

  const accountManagers = Array.from(
    economics.reduce((map, row) => {
      const current = map.get(row.accountManager) || {
        accountManager: row.accountManager,
        clients: 0,
        employees: 0,
        revenue: 0,
        profit: 0,
        redClients: 0,
      };
      current.clients += 1;
      current.employees += row.employeeCount;
      current.revenue += row.revenue;
      current.profit += row.profit;
      if (row.healthBand === 'Red') current.redClients += 1;
      map.set(row.accountManager, current);
      return map;
    }, new Map<string, { accountManager: string; clients: number; employees: number; revenue: number; profit: number; redClients: number }>()).values()
  )
    .map((row) => ({
      ...row,
      revenue: round2(row.revenue),
      profit: round2(row.profit),
      marginPct: pct(row.profit, row.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const performance = {
    currentWeek: { payrollsScheduled: 86, payrollsCompleted: 81, onTimePct: 94.2, firstTimeRightPct: 91.8, corrections: 7, offCyclePct: 6.1, voids: 2, employeesPaid: 4120, grossProcessed: 6_180_000, avgPayrollSize: 76_296, clientDelays: 4, internalDelays: 2, isolvedDelays: 1 },
    previousWeek: { payrollsScheduled: 84, payrollsCompleted: 80, onTimePct: 93.1, firstTimeRightPct: 90.4, corrections: 9, offCyclePct: 7.4, voids: 3, employeesPaid: 3988, grossProcessed: 5_940_000, avgPayrollSize: 74_250, clientDelays: 5, internalDelays: 3, isolvedDelays: 1 },
    rolling13Weeks: { payrollsScheduled: 1094, payrollsCompleted: 1048, onTimePct: 93.6, firstTimeRightPct: 91.1, corrections: 96, offCyclePct: 6.8, voids: 28, employeesPaid: 51_640, grossProcessed: 77_400_000, avgPayrollSize: 73_855, clientDelays: 48, internalDelays: 22, isolvedDelays: 9 },
    ytd: { payrollsScheduled: 3180, payrollsCompleted: 3044, onTimePct: 93.9, firstTimeRightPct: 91.4, corrections: 268, offCyclePct: 6.5, voids: 74, employeesPaid: 148_900, grossProcessed: 224_600_000, avgPayrollSize: 73_784, clientDelays: 132, internalDelays: 61, isolvedDelays: 24 },
  };

  const processorNames = Array.from(new Set(clients.map((client) => client.processor)));
  const clientQuality = buildClientQualityRanking(clients, rng);
  const workloadForecast = buildTwoWeekWorkloadForecast(clients, processorNames, rng, asOfDate);
  const monthlyScorecard = buildMonthlyExecutiveScorecard(companyId, clients, processors.length, asOfDate);

  return {
    meta: {
      source: PAYROLL_BUREAU_OPS_SOURCE,
      generatedAt: new Date().toISOString(),
      asOfDate,
      latestCheckDate,
      note: accounting?.hasCustomerSales
        ? 'Phase 1 Cost to Serve uses isolved volume plus QBD/QBE customer billings where names match. Processor time and tickets are still allocated. Drill to isolved for payroll detail.'
        : 'Phase 1 Cost to Serve uses isolved volume and estimated client billings until QBD/QBE customer invoices are mapped. CTR processors run payroll; account managers own the relationship.',
    },
    today: {
      summary: {
        payrollsDueToday: todayRuns.length,
        payrollsCompleted: completed.length,
        completedPct: pct(completed.length, todayRuns.length),
        payrollsAtRisk: atRisk.length,
        payrollsAwaitingClient: awaitingClient.length,
        payrollsWithExceptions: withExceptions.length,
        employeesBeingPaid: employeesPaidToday,
        grossPayrollProcessed: round2(completed.reduce((sum, run) => sum + run.grossPay, 0)),
        fundingExposure: round2(unfunded.reduce((sum, run) => sum + run.grossPay, 0)),
        offCycleCount: offCycle.length,
        offCyclePct: pct(offCycle.length, todayRuns.length),
        correctionsCount: withExceptions.length + rng.int(0, 2),
        correctionsAmount: round2(withExceptions.reduce((sum, run) => sum + run.grossPay * 0.012, 0)),
      },
      runs: todayRuns,
      needsAttention,
      processorWorkload,
    },
    performance,
    clientQuality,
    workloadForecast,
    monthlyScorecard,
    processors,
    accountManagers,
    clients: economics,
    billingsByType: rollup('clientType'),
    billingsBySize: rollup('sizeBand'),
    costToServe: {
      phase: 1,
      asOfDate,
      monthLabel: monthLabel(asOfDate.slice(0, 7)),
      revenueSource: accounting?.hasCustomerSales ? 'qbd' : 'estimated',
      poolSource: monthCts.pools.source,
      month: monthCts,
      ytd: ytdCts,
      annual: annualCts,
    },
    summary: {
      activeClients: clients.length,
      activeEmployees: clients.reduce((sum, client) => sum + client.currentCount, 0),
      totalRevenue,
      totalProfit,
      avgMarginPct: pct(totalProfit, totalRevenue),
      redClients: economics.filter((row) => row.healthBand === 'Red').length,
      yellowClients: economics.filter((row) => row.healthBand === 'Yellow').length,
      greenClients: economics.filter((row) => row.healthBand === 'Green').length,
    },
  };
}

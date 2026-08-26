import { getOperationalSystemConnection } from '@/lib/operational/operational-system-connections';

export const ISOLVED_PEOPLE_CLOUD_SOURCE_CODE = 'ISOLVED_PEOPLE_CLOUD';
export const ISOLVED_PEOPLE_CLOUD_LABEL = 'isolved People Cloud';
export const ISOLVED_OPERATIONAL_PROVIDER = 'ISOLVED';
export const ISOLVED_REPORT_SOURCE = 'ISOLVED_PEOPLE_CLOUD';

const ISOLVED_CONNECT_NOTE =
  'Connect isolved People Cloud to populate these reports. Live payroll data will appear after the first successful sync.';

export type IsolvedPeopleCloudDataDomain = {
  dataDomain: string;
  sourceObject: string;
  enabled: boolean;
};

export const DEFAULT_ISOLVED_PEOPLE_CLOUD_DATA_DOMAINS: IsolvedPeopleCloudDataDomain[] = [
  { dataDomain: 'Clients / Companies', sourceObject: 'Employer clients, legal entities, EINs, and multi-client payroll bureau scope', enabled: true },
  { dataDomain: 'Employees / Census', sourceObject: 'Employee directory, demographics, status, hire/term dates, and work location', enabled: true },
  { dataDomain: 'Employment / Job Information', sourceObject: 'Job title, employment type, pay type, supervisor, department, and position history', enabled: true },
  { dataDomain: 'Organization / Departments', sourceObject: 'Departments, divisions, reporting structure, and organizational units', enabled: true },
  { dataDomain: 'Locations / Work Sites', sourceObject: 'Work locations, job sites, and worksite tax jurisdictions', enabled: true },
  { dataDomain: 'Cost Centers / Labor Distribution', sourceObject: 'Cost centers, labor allocations, and GL department mappings', enabled: true },
  { dataDomain: 'Pay Groups / Pay Schedules', sourceObject: 'Pay groups, pay frequencies, pay calendars, and processing cycles', enabled: true },
  { dataDomain: 'Compensation / Pay Rates', sourceObject: 'Hourly/salary rates, effective dates, pay grades, and compensation changes', enabled: true },
  { dataDomain: 'Payroll Runs', sourceObject: 'Payroll batches, run status, pay period start/end, and check dates', enabled: true },
  { dataDomain: 'Pay Statements / Earnings', sourceObject: 'Gross-to-net pay statements, earning codes, hours, and amounts', enabled: true },
  { dataDomain: 'Deductions', sourceObject: 'Pre/post-tax deductions, garnishments, deduction codes, and employee amounts', enabled: true },
  { dataDomain: 'Taxes', sourceObject: 'Federal, state, and local tax withholdings, tax codes, and taxable wages', enabled: true },
  { dataDomain: 'Direct Deposit / Bank Info', sourceObject: 'Employee bank accounts, routing numbers, deposit splits, and payment method', enabled: true },
  { dataDomain: 'Time & Attendance', sourceObject: 'Punches, timesheets, hours worked, overtime, and time-clock activity', enabled: true },
  { dataDomain: 'PTO / Leave', sourceObject: 'Leave balances, accruals, time-off requests, and leave types', enabled: true },
  { dataDomain: 'Benefits / Enrollments', sourceObject: 'Benefit plans, coverage elections, dependents, contributions, and eligibility', enabled: true },
  { dataDomain: 'Onboarding / New Hires', sourceObject: 'New-hire records, onboarding tasks, I-9 / new-hire reporting, and start dates', enabled: true },
  { dataDomain: 'GL Export / Payroll Journal', sourceObject: 'Payroll journal entries, earning/deduction GL mapping, and QuickBooks Desktop export', enabled: true },
  { dataDomain: 'ACA / Compliance', sourceObject: 'ACA eligibility, coverage months, 1094/1095 data, and compliance status', enabled: false },
  { dataDomain: 'Talent / Applicants', sourceObject: 'Applicant tracking, requisitions, and recruiting pipeline where licensed', enabled: false },
];

export async function hasIsolvedPeopleCloudConnection(companyId: string): Promise<boolean> {
  const connection = await getOperationalSystemConnection(
    companyId,
    ISOLVED_OPERATIONAL_PROVIDER,
    ISOLVED_PEOPLE_CLOUD_SOURCE_CODE
  );
  return Boolean(connection);
}

export function buildIsolvedPayrollEmptyPayload() {
  return {
    meta: {
      source: ISOLVED_REPORT_SOURCE,
      generatedAt: null,
      note: ISOLVED_CONNECT_NOTE,
    },
    summary: {
      clientCount: 0,
      employeeCount: 0,
      payrollRunCount: 0,
      grossPay: 0,
      netPay: 0,
      taxWithheld: 0,
      deductionTotal: 0,
      onTimeProcessingPct: 0,
      note: ISOLVED_CONNECT_NOTE,
    },
    clientCensus: [],
    payrollRuns: [],
    grossToNet: [],
    earningsByCode: [],
    deductionsByCode: [],
    taxWithholdings: [],
    directDepositMix: [],
    payGroups: [],
    glExportJournal: [],
    benefitsEnrollments: [],
    records: [],
  };
}

export function buildIsolvedLaborSchedulingEmptyPayload() {
  return {
    meta: {
      source: ISOLVED_REPORT_SOURCE,
      generatedAt: null,
      note: ISOLVED_CONNECT_NOTE,
    },
    summary: {
      headcount: 0,
      billableHeadcount: 0,
      totalAnnualCost: null,
      avgAnnualCost: null,
      billRateLevelCoveragePct: 0,
      utilizationPct: 0,
      note: ISOLVED_CONNECT_NOTE,
    },
    headcountByRole: [],
    headcountByDepartment: [],
    headcountByLocation: [],
    headcountByStatus: [],
    payTypeMix: [],
    exemptMix: [],
    billRateLevelCoverage: [],
    missingBillRateLevel: [],
    employeeCompensationRoster: [],
    ptoBalances: [],
    utilizationByRole: [],
    fillRateByRole: [],
    timeToFillByRole: [],
    assignmentDuration: [],
    idleWorkforceCost: [],
    overtimeAnalysis: [],
    records: [],
  };
}

export function buildIsolvedHiringEmptyPayload() {
  return {
    meta: {
      source: ISOLVED_REPORT_SOURCE,
      generatedAt: null,
      note: ISOLVED_CONNECT_NOTE,
    },
    summary: {
      openJobs: 0,
      totalApplicants: 0,
      activeApplicants: 0,
      newApplicants: 0,
      onboardingInProgress: 0,
      note: ISOLVED_CONNECT_NOTE,
    },
    jobs: [],
    applications: [],
    onboardingPipeline: [],
  };
}

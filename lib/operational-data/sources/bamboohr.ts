import {
  buildAndSaveBambooHrWorkforceReportSnapshotWithHistory,
  getBambooHrHiringPayload,
  type BambooHrHistory,
} from '@/lib/operations/bamboohr-workforce-reports';
import { buildLaborSchedulingMock, buildRevenueBillablesMock, buildUnitEconomicsMock } from '@/lib/operations/staffing-mock-data';
import { addEstCalendarDays, addEstCalendarMonths } from '@/lib/time/eastern';
import { payloadToOutput } from '../payload';
import type { OperationalDatasetSchema, OperationalRecordInput, OperationalSourceAdapter, OperationalSourceOutput, OperationalSyncWindow } from '../types';
import { estDateOf } from './common';

/** Employee and applicant identity fields; role, department, location and pay stay so Ask can analyze them. */
const HR_SENSITIVE_KEYS = ['name', 'id', 'employeeId', 'applicantId', 'applicationId', 'personId', 'photoUrl', 'linkedinUrl'];

const HISTORY_DATASETS: OperationalDatasetSchema[] = [
  {
    key: 'bamboohr.headcount_monthly',
    label: 'BambooHR monthly headcount and turnover',
    description:
      'Headcount as of each month end (point in time; the current month is as of the latest sync), with hires and terminations during that month. Built from hire and termination dates of every employee BambooHR reports, including people who have left.',
    grain: 'point_in_time',
    dimensions: [{ name: 'month', description: 'YYYY-MM' }],
    measures: [
      { name: 'activeHeadcount', description: 'Employees active on the row date' },
      { name: 'hires', description: 'Hires during the month' },
      { name: 'terminations', description: 'Terminations during the month' },
      { name: 'hiredByClientTerminations', description: 'Terminations with reason "Hired by Client"' },
      { name: 'turnoverPct', description: 'Terminations / average of opening and closing headcount x 100' },
    ],
  },
  {
    key: 'bamboohr.workforce_events',
    label: 'BambooHR workforce events',
    description:
      'Dated workforce events without names: hire, termination, job_assignment (job/department/location effective date), status_change and pay_change. Hires and terminations cover everyone; job, status and pay changes cover current employees only. employeeKey is an anonymous id for counting distinct people.',
    grain: 'flow',
    dimensions: [
      { name: 'eventType' }, { name: 'employeeKey', description: 'Anonymous per-employee id' },
      { name: 'jobTitle' }, { name: 'department' }, { name: 'division' }, { name: 'location' },
      { name: 'employmentStatus' }, { name: 'terminationReason' }, { name: 'terminationType' },
      { name: 'payType' }, { name: 'paidPer' }, { name: 'changeReason' },
    ],
    measures: [
      { name: 'eventCount', description: 'Always 1' },
      { name: 'annualizedRate', description: 'pay_change only: new pay annualized (hourly x 2080)' },
    ],
  },
  {
    key: 'bamboohr.time_off',
    label: 'BambooHR time off requests',
    description: 'Time off requests dated by start date, without names. Sum amount for days/hours requested; filter status = "approved" for taken time off.',
    grain: 'flow',
    dimensions: [{ name: 'type' }, { name: 'status' }, { name: 'unit', description: 'days or hours' }, { name: 'endDate' }],
    measures: [{ name: 'amount' }, { name: 'requestCount', description: 'Always 1' }],
  },
];

const inWindow = (date: string | null, window: OperationalSyncWindow): date is string =>
  Boolean(date && date >= window.startDate && date <= window.endDate);

function headcountRows(history: BambooHrHistory, window: OperationalSyncWindow): OperationalRecordInput[] {
  const activeOn = (date: string) =>
    history.lifecycle.filter((row) => row.hireDate && row.hireDate <= date && !(row.terminationDate && row.terminationDate <= date)).length;
  const rows: OperationalRecordInput[] = [];
  let monthStart = `${window.startDate.slice(0, 7)}-01`;
  while (monthStart <= window.endDate) {
    const monthEnd = addEstCalendarDays(addEstCalendarMonths(monthStart, 1), -1);
    const asOf = monthEnd < window.endDate ? monthEnd : window.endDate;
    const inMonth = (date: string | null) => Boolean(date && date >= monthStart && date <= asOf);
    const terminated = history.lifecycle.filter((row) => inMonth(row.terminationDate));
    const opening = activeOn(addEstCalendarDays(monthStart, -1));
    const closing = activeOn(asOf);
    const average = (opening + closing) / 2;
    if (asOf >= window.startDate) {
      rows.push({
        date: asOf,
        externalId: `headcount|${monthStart.slice(0, 7)}`,
        dimensions: { month: monthStart.slice(0, 7) },
        measures: {
          activeHeadcount: closing,
          hires: history.lifecycle.filter((row) => inMonth(row.hireDate)).length,
          terminations: terminated.length,
          hiredByClientTerminations: terminated.filter((row) => /hired by client/i.test(row.terminationReason || '')).length,
          turnoverPct: average > 0 ? Math.round((terminated.length / average) * 10000) / 100 : null,
        },
      });
    }
    monthStart = addEstCalendarMonths(monthStart, 1);
  }
  return rows;
}

function eventRows(history: BambooHrHistory, window: OperationalSyncWindow): OperationalRecordInput[] {
  const rows: OperationalRecordInput[] = [];
  const seen = new Map<string, number>();
  const push = (date: string, eventType: string, employeeKey: string, dimensions: Record<string, string | null>, annualizedRate: number | null = null) => {
    const base = `${eventType}|${employeeKey}|${date}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    rows.push({ date, externalId: `${base}|${n}`, dimensions: { eventType, employeeKey, ...dimensions }, measures: { eventCount: 1, annualizedRate } });
  };
  for (const row of history.lifecycle) {
    if (inWindow(row.hireDate, window)) push(row.hireDate, 'hire', row.employeeKey, {});
    if (inWindow(row.terminationDate, window)) {
      push(row.terminationDate, 'termination', row.employeeKey, { terminationReason: row.terminationReason, terminationType: row.terminationType });
    }
  }
  for (const row of history.jobChanges) {
    if (inWindow(row.date, window)) {
      push(row.date, 'job_assignment', row.employeeKey, { jobTitle: row.jobTitle, department: row.department, division: row.division, location: row.location });
    }
  }
  for (const row of history.statusChanges) {
    if (inWindow(row.date, window)) push(row.date, 'status_change', row.employeeKey, { employmentStatus: row.employmentStatus });
  }
  for (const row of history.payChanges) {
    if (inWindow(row.date, window)) {
      push(row.date, 'pay_change', row.employeeKey, {
        jobTitle: row.jobTitle, department: row.department, payType: row.payType, paidPer: row.paidPer, changeReason: row.reason,
      }, row.annualizedRate);
    }
  }
  return rows;
}

function historyOutput(history: BambooHrHistory, window: OperationalSyncWindow): OperationalSourceOutput {
  const output: OperationalSourceOutput = {
    'bamboohr.workforce_events': { rows: eventRows(history, window), replaceWindow: true, window },
  };
  if (history.lifecycle.length) output['bamboohr.headcount_monthly'] = { rows: headcountRows(history, window), replaceWindow: true, window };
  if (history.timeOff) {
    output['bamboohr.time_off'] = {
      rows: history.timeOff.filter((row) => inWindow(row.startDate, window)).map((row) => ({
        date: row.startDate,
        externalId: `time_off|${row.requestKey}`,
        dimensions: { type: row.type, status: row.status, unit: row.unit, endDate: row.endDate },
        measures: { amount: row.amount, requestCount: 1 },
      })),
      replaceWindow: true,
      window,
    };
  }
  return output;
}

export const BAMBOOHR_ADAPTER: OperationalSourceAdapter = {
  sourceCode: 'BAMBOOHR_STANDARD',
  provider: 'BAMBOOHR',
  label: 'BambooHR',
  datasetPrefix: 'bamboohr',
  history: 'range',
  historyNote:
    'Monthly headcount, hires, terminations and time off are rebuilt for the full date range. Job, status and pay history only covers current employees (BambooHR does not list people who left). Workforce summaries are daily snapshots kept from the first sync forward.',
  defaultHistoryDays: 365 * 3,
  datasets: HISTORY_DATASETS,
  dynamicDatasets: true,
  async sync({ companyId, window }) {
    const { snapshot, history } = await buildAndSaveBambooHrWorkforceReportSnapshotWithHistory(companyId, window);
    const asOf = estDateOf(snapshot.generatedAt);
    const workforce = payloadToOutput(snapshot, {
      prefix: 'bamboohr',
      sourceLabel: 'BambooHR workforce',
      asOf,
      replace: 'range',
      extraSensitiveKeys: HR_SENSITIVE_KEYS,
    });
    const hiring = await getBambooHrHiringPayload(companyId)
      .then((payload) =>
        payloadToOutput({ hiring: payload }, {
          prefix: 'bamboohr',
          sourceLabel: 'BambooHR hiring',
          asOf,
          replace: 'all',
          extraSensitiveKeys: HR_SENSITIVE_KEYS,
        }),
      )
      .catch(() => ({}));
    return { ...workforce, ...hiring, ...historyOutput(history, window) };
  },
  async mock({ companyId, window }) {
    return payloadToOutput(
      {
        laborScheduling: buildLaborSchedulingMock(companyId),
        unitEconomics: buildUnitEconomicsMock(companyId),
        revenueBillables: buildRevenueBillablesMock(companyId),
      },
      { prefix: 'bamboohr', sourceLabel: 'BambooHR workforce', asOf: window.endDate, replace: 'all', extraSensitiveKeys: HR_SENSITIVE_KEYS },
    );
  },
};

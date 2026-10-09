/**
 * Contract test for the operational data store.
 *
 *   npm run test:operational-data                      # validate every registered adapter
 *   npx tsx scripts/test-operational-data-store.ts --company <id>   # also round-trip a test dataset + mock outputs through the DB and Ask
 *
 * The --company run writes and then deletes a "contract_test.*" dataset for that company.
 */
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { workbookToOutput } from '@/lib/operational-data/payload';
import { listOperationalAdapters, validateOperationalAdapter } from '@/lib/operational-data/registry';
import { writeOperationalSourceOutput } from '@/lib/operational-data/store';
import { validateSyncWindow } from '@/lib/operational-data/runner';
import { listAskDatasets, queryAskDataset } from '@/lib/ask-corelytics/data-tools';
import type { OperationalSourceAdapter, OperationalSourceOutput } from '@/lib/operational-data/types';
import { addEstCalendarDays, formatEstDate } from '@/lib/time/eastern';
import { OPERATIONAL_SOURCE_DEFINITIONS } from '@/lib/operational/source-definitions';

let failures = 0;
function check(condition: unknown, message: string) {
  if (condition) console.log(`  ok   ${message}`);
  else {
    failures += 1;
    console.error(`  FAIL ${message}`);
  }
}

function undeclaredKeys(adapter: OperationalSourceAdapter, output: OperationalSourceOutput): string[] {
  const problems: string[] = [];
  for (const [datasetKey, payload] of Object.entries(output)) {
    const schema =
      adapter.datasets.find((dataset) => dataset.key === datasetKey) ||
      (adapter.dynamicDatasets && payload.schema?.key === datasetKey ? payload.schema : undefined);
    if (!schema) {
      problems.push(`undeclared dataset ${datasetKey}`);
      continue;
    }
    const declared = {
      dimensions: new Set(schema.dimensions.map((column) => column.name)),
      measures: new Set(schema.measures.map((column) => column.name)),
      attributes: new Set((schema.attributes || []).map((column) => column.name)),
    };
    for (const row of payload.rows.slice(0, 500)) {
      for (const group of ['dimensions', 'measures', 'attributes'] as const) {
        for (const key of Object.keys(row[group] || {})) {
          if (!declared[group].has(key)) problems.push(`${datasetKey}: ${group}.${key} not declared`);
        }
      }
    }
  }
  return [...new Set(problems)];
}

const TEST_ADAPTER: OperationalSourceAdapter = {
  sourceCode: 'CONTRACT_TEST',
  provider: 'TEST',
  label: 'Contract Test',
  datasetPrefix: 'contract_test',
  history: 'none',
  datasets: [
    {
      key: 'contract_test.activity',
      label: 'Contract test activity',
      description: 'Synthetic daily activity rows used by the contract test.',
      grain: 'flow',
      dimensions: [{ name: 'team' }, { name: 'employeeName', sensitive: true }],
      measures: [{ name: 'hours' }, { name: 'revenue' }],
      attributes: [{ name: 'note' }],
    },
  ],
  mock: async () => ({}),
};

async function roundTrip(companyId: string) {
  const end = formatEstDate();
  const start = addEstCalendarDays(end, -2);
  const window = { startDate: start, endDate: end };
  const days = [start, addEstCalendarDays(start, 1), end];
  const rows = days.flatMap((date) => [
    { date, dimensions: { team: 'A', employeeName: 'Should Not Store' }, measures: { hours: 8, revenue: 100 }, attributes: { note: 'x' } },
    { date, dimensions: { team: 'B' }, measures: { hours: 4, revenue: 50, undeclared: 1 } as Record<string, number> },
  ]);
  rows.push({ date: 'not-a-date', dimensions: { team: 'A' }, measures: { hours: 1, revenue: 1 } } as never);

  try {
    const mock = await writeOperationalSourceOutput({
      companyId, adapter: TEST_ADAPTER, mode: 'MOCK', window,
      output: { 'contract_test.activity': { rows, replaceWindow: true } },
    });
    check(mock[0]?.written === 6 && mock[0]?.dropped === 1, `mock write stored 6 rows and dropped 1 bad date (${JSON.stringify(mock[0])})`);

    const stored = await prisma.operationalRecord.findFirst({ where: { companyId, dataset: { datasetKey: 'contract_test.activity' } } });
    const dims = (stored?.dimensions || {}) as Record<string, unknown>;
    const meas = (stored?.measures || {}) as Record<string, unknown>;
    check(!('employeeName' in dims), 'sensitive dimension was not stored');
    check(!('undeclared' in meas), 'undeclared measure was not stored');

    const listed = (await listAskDatasets(companyId)).find((dataset) => dataset.dataset === 'contract_test.activity') as Record<string, unknown> | undefined;
    check(listed && listed.dataMode === 'MOCK' && listed.rowCount === 6, 'Ask list_datasets shows the dataset as MOCK with 6 rows');

    const agg = (await queryAskDataset(companyId, {
      dataset: 'contract_test.activity', operation: 'aggregate', startDate: start, endDate: end, groupBy: ['team'], measures: ['hours', 'revenue'],
    })) as Record<string, any>;
    check(agg.totals?.hours === 36 && agg.totals?.revenue === 450, `Ask aggregate totals hours=36 revenue=450 (${JSON.stringify(agg.totals)})`);
    check(agg.groups?.length === 2 && agg.dataNote, 'Ask aggregate groups by team and flags mock data');

    const other = await prisma.company.findFirst({ where: { id: { not: companyId } }, select: { id: true } });
    check(other, 'a second company exists for isolation checks');
    if (other) {
      const otherList = await listAskDatasets(other.id);
      check(!otherList.some((dataset) => dataset.dataset === 'contract_test.activity'), 'other company does not see this company\'s dataset');
      const otherQuery = (await queryAskDataset(other.id, {
        dataset: 'contract_test.activity', operation: 'aggregate', measures: ['hours'],
      })) as Record<string, any>;
      check(otherQuery.error && !otherQuery.totals, 'other company cannot query this company\'s dataset');
      const dataset = await prisma.operationalDataset.findUniqueOrThrow({
        where: { companyId_datasetKey: { companyId, datasetKey: 'contract_test.activity' } },
      });
      const crossInsert = await prisma.$executeRawUnsafe(
        `INSERT INTO "OperationalRecord" ("id", "companyId", "datasetId", "recordDate", "externalId", "dataMode", "updatedAt")
         VALUES ('contract-test-cross', $1, $2, CURRENT_DATE, 'cross', 'MOCK', NOW())`,
        other.id,
        dataset.id,
      ).then(() => 'inserted', () => 'rejected');
      check(crossInsert === 'rejected', 'database rejects a record whose company differs from its dataset\'s company');
      if (crossInsert === 'inserted') await prisma.operationalRecord.deleteMany({ where: { id: 'contract-test-cross' } });
    }

    const filtered = (await queryAskDataset(companyId, {
      dataset: 'contract_test.activity', operation: 'rows', filters: [{ column: 'team', op: 'eq', value: 'B' }],
    })) as Record<string, any>;
    check(filtered.totalMatchingRows === 3, 'Ask rows filter on a dimension');

    const live = await writeOperationalSourceOutput({
      companyId, adapter: TEST_ADAPTER, mode: 'LIVE', window,
      output: { 'contract_test.activity': { rows: [{ date: end, dimensions: { team: 'A' }, measures: { hours: 1, revenue: 10 } }] } },
    });
    const liveList = (await listAskDatasets(companyId)).find((dataset) => dataset.dataset === 'contract_test.activity') as Record<string, unknown> | undefined;
    check(live[0]?.written === 1 && liveList?.dataMode === 'LIVE' && liveList?.rowCount === 1, 'first live write replaces all mock rows');

    const mockAfterLive = await writeOperationalSourceOutput({
      companyId, adapter: TEST_ADAPTER, mode: 'MOCK', window,
      output: { 'contract_test.activity': { rows } },
    });
    check(mockAfterLive[0]?.skipped, 'mock write is refused once the dataset is live');
  } finally {
    await prisma.operationalDataset.deleteMany({ where: { companyId, datasetKey: 'contract_test.activity' } });
  }
}

async function main() {
  const companyFlag = process.argv.indexOf('--company');
  const companyId = companyFlag >= 0 ? process.argv[companyFlag + 1] : '';

  const adapters = listOperationalAdapters();
  console.log(`Registered operational adapters: ${adapters.length}`);
  check(validateOperationalAdapter(TEST_ADAPTER).length === 0, 'test adapter passes validation');
  check(
    validateOperationalAdapter({ ...TEST_ADAPTER, datasets: [{ ...TEST_ADAPTER.datasets[0], key: 'Bad Key' }] }).length > 0,
    'invalid dataset keys are rejected',
  );
  for (const adapter of adapters) {
    const problems = validateOperationalAdapter(adapter);
    check(problems.length === 0, `${adapter.sourceCode} declarations valid${problems.length ? `: ${problems.join('; ')}` : ''}`);
  }
  for (const source of OPERATIONAL_SOURCE_DEFINITIONS) {
    check(adapters.some((adapter) => adapter.sourceCode === source.sourceCode), `${source.sourceCode} (${source.label}) has a store adapter`);
  }

  for (const adapter of adapters) {
    check(adapter.history !== 'range' || adapter.sync, `${adapter.sourceCode} declares history "${adapter.history}"`);
  }
  check(validateSyncWindow('2023-10-01', '2024-01-31').window, 'date range sync accepts a past range');
  check(validateSyncWindow('2024-02-01', '2024-01-31').error, 'date range sync rejects start after end');
  check(validateSyncWindow('2023-10-01', addEstCalendarDays(formatEstDate(), 1)).error, 'date range sync rejects a future end date');
  check(validateSyncWindow('10/01/2023', '').error, 'date range sync rejects non YYYY-MM-DD dates');

  const sheet = XLSX.utils.aoa_to_sheet([
    ['Job Date', 'Foreman', 'Employee Name', 'Email', 'Hours', 'Revenue'],
    [46000, 'Crew Lead A', 'Jane Doe', 'jane@example.com', 8, 1200],
    [46001, 'Crew Lead B', 'John Roe', 'john@example.com', 6, 900],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Daily Jobs');
  const parsed = workbookToOutput(workbook, { prefix: 'contract_test', sourceLabel: 'Contract Test', asOf: formatEstDate(), replace: 'range' });
  const [parsedKey, parsedPayload] = Object.entries(parsed)[0] || [];
  const parsedSchemaColumns = [...(parsedPayload?.schema?.dimensions || []), ...(parsedPayload?.schema?.measures || [])];
  const parsedColumns = parsedSchemaColumns.filter((column) => !column.sensitive).map((column) => column.name);
  const parsedRowKeys = new Set(
    (parsedPayload?.rows || []).flatMap((row) => [...Object.keys(row.dimensions || {}), ...Object.keys(row.measures || {})]),
  );
  check(parsedKey?.startsWith('contract_test.') && parsedPayload?.rows.length === 2, `workbook sheet becomes a dataset with 2 rows (${parsedKey})`);
  check(parsedColumns.includes('foreman') && parsedColumns.includes('hours'), `workbook keeps role names and numbers (${parsedColumns.join(', ')})`);
  check(
    !parsedColumns.some((name) => /employee|email/i.test(name)) && ![...parsedRowKeys].some((name) => /employee|email/i.test(name)),
    'workbook flags employee names and email as sensitive and leaves them out of rows',
  );
  check(parsedPayload?.rows[0]?.date === '2025-12-09', `workbook converts Excel serial dates (${parsedPayload?.rows[0]?.date})`);

  if (companyId) {
    console.log(`\nDatabase round trip for company ${companyId}`);
    await roundTrip(companyId);
    const end = formatEstDate();
    for (const adapter of adapters.filter((candidate) => candidate.mock)) {
      const output = await adapter.mock!({ companyId, window: { startDate: addEstCalendarDays(end, -30), endDate: end } });
      const problems = undeclaredKeys(adapter, output);
      check(problems.length === 0, `${adapter.sourceCode} mock output matches its schema${problems.length ? `: ${problems.slice(0, 5).join('; ')}` : ''}`);
      check(Object.values(output).some((payload) => payload.rows.length > 0), `${adapter.sourceCode} mock produces rows`);
    }
  }

  await prisma.$disconnect();
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll checks passed');
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
